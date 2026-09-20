import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApplication } from '../src/platform/app.factory';
import { hashPassword, totp, decryptSecret } from '../src/modules/identity/infrastructure/password';

const enabled = process.env.RUN_DB_TESTS === '1';
describe.skipIf(!enabled)('Live PostgreSQL application workflows', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let control: PrismaClient;
  let churchId: string;
  let otherChurch: string;
  let userId: string;
  let readonlyId: string;
  let cookie = '';
  let csrf = '';
  const database = `church_test_${randomUUID().replaceAll('-', '')}`;
  const password = 'Synthetic-password-1234';
  const origin = 'http://localhost:5173';
  const savedUrl = process.env.DATABASE_URL;
  const perms = [
    'identity.read',
    'identity.manage',
    'membership.read',
    'membership.write',
    'membership.pii',
    'audit.read',
  ];
  const root = () => `/api/v1/churches/${churchId}`;
  const get = (path: string) => request(app.getHttpServer()).get(path).set('Cookie', cookie);
  const post = (path: string, body: unknown) =>
    request(app.getHttpServer())
      .post(path)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('x-csrf-token', csrf)
      .send(body as object);
  async function login(username = 'admin', code?: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ churchId, username, password, ...(code ? { code } : {}) });
  }
  async function signIn(code?: string) {
    const result = await login('admin', code);
    expect(result.status, result.text).toBe(201);
    cookie = String(result.headers['set-cookie']![0]).split(';')[0]!;
    csrf = result.body.csrfToken;
  }
  beforeAll(async () => {
    control = new PrismaClient();
    await control.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
    const url = new URL(savedUrl!);
    url.pathname = `/${database}`;
    process.env.DATABASE_URL = url.toString();
    process.env.MFA_ENCRYPTION_KEY = '34'.repeat(32);
    delete process.env.AUTH_ADAPTER;
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      env: process.env,
      stdio: 'pipe',
    });
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'reset', '--force', '--skip-seed'], {
      env: process.env,
      stdio: 'pipe',
    });
    db = new PrismaClient();
    const a = await db.church.create({ data: { name: 'Synthetic A' } });
    churchId = a.id;
    otherChurch = (await db.church.create({ data: { name: 'Synthetic B' } })).id;
    await db.permission.createMany({ data: perms.map((code) => ({ code })) });
    const role = await db.role.create({
      data: {
        churchId,
        name: 'Administrator',
        permissions: { create: perms.map((permissionCode) => ({ permissionCode })) },
      },
    });
    const readRole = await db.role.create({
      data: {
        churchId,
        name: 'Reader',
        permissions: { create: [{ permissionCode: 'membership.read' }] },
      },
    });
    const hash = await hashPassword(password);
    userId = (await db.user.create({ data: { churchId, username: 'admin', passwordHash: hash } }))
      .id;
    readonlyId = (
      await db.user.create({ data: { churchId, username: 'reader', passwordHash: hash } })
    ).id;
    await db.userRole.createMany({
      data: [
        { churchId, userId, roleId: role.id },
        { churchId, userId: readonlyId, roleId: readRole.id },
      ],
    });
    await db.memberStatus.createMany({
      data: [
        { churchId, code: 'ACTIVE', label: '재적', allowedNext: ['INACTIVE'] },
        { churchId, code: 'INACTIVE', label: '장기결석', allowedNext: ['ACTIVE'] },
      ],
    });
    await db.organizationType.create({ data: { churchId, code: 'GROUP', name: '구역' } });
    app = await createApplication();
    await app.init();
    await signIn();
  }, 180000);
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    if (control) {
      await control.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
      await control.$disconnect();
    }
    if (savedUrl) process.env.DATABASE_URL = savedUrl;
    else delete process.env.DATABASE_URL;
    delete process.env.MFA_ENCRYPTION_KEY;
  }, 30000);
  it('protects session writes with CSRF and Origin, masks PII and rejects overposting', async () => {
    expect((await get('/api/v1/auth/me')).body.username).toBe('admin');
    const member = {
      memberNumber: 'TEST-1',
      name: '가상 교인',
      registeredOn: '2020-01-01',
      status: 'ACTIVE',
      phone: '010-0000-0000',
      address: '가상 주소',
    };
    await request(app.getHttpServer())
      .post(`${root()}/members`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send(member)
      .expect(403);
    expect(
      (await post(`${root()}/members`, { ...member, churchId: otherChurch })).body.error.code,
    ).toBe('VALIDATION_ERROR');
    expect((await post(`${root()}/members`, { ...member, name: null })).status).toBe(400);
    const created = await post(`${root()}/members`, member);
    expect(created.status, created.text).toBe(201);
    const id = created.body.id;
    expect(await db.memberStatusHistory.count({ where: { memberId: id } })).toBe(1);
    await get(`/api/v1/churches/${otherChurch}/members`).expect(403);
    await post(`${root()}/members`, member).expect(409);
    const reader = await login('reader');
    const readCookie = String(reader.headers['set-cookie']![0]).split(';')[0]!;
    const response = await request(app.getHttpServer())
      .get(`${root()}/members/${id}`)
      .set('Cookie', readCookie)
      .expect(200);
    expect(response.body.phone).toBeUndefined();
    expect(response.body.address).toBeUndefined();
    await request(app.getHttpServer())
      .post(`${root()}/members`)
      .set('Cookie', readCookie)
      .set('Origin', origin)
      .set('x-csrf-token', reader.body.csrfToken)
      .send({ ...member, memberNumber: 'DENIED' })
      .expect(403);
    expect(await db.auditEvent.count({ where: { action: 'permission.denied' } })).toBeGreaterThan(
      0,
    );
    const invalid = await post(`${root()}/members/${id}/status-changes`, {
      version: 1,
      status: 'INACTIVE',
      effectiveFrom: '2999-01-01',
      reason: '가상',
    });
    expect(invalid.status).toBe(400);
    await post(`${root()}/members/${id}/status-changes`, {
      version: 1,
      status: 'INACTIVE',
      effectiveFrom: '2020-02-01',
      reason: '가상 상태 변경',
    }).expect(201);
    await post(`${root()}/members/${id}/status-changes`, {
      version: 1,
      status: 'ACTIVE',
      effectiveFrom: '2020-03-01',
      reason: 'stale',
    }).expect(409);
    const detail = await get(`${root()}/members/${id}`);
    expect(detail.body.statusHistory).toHaveLength(2);
    const audit = await db.auditEvent.findMany({ where: { resourceId: id } });
    expect(JSON.stringify(audit)).not.toContain('가상 교인');
    expect(JSON.stringify(audit)).not.toContain('010-0000');
    await expect(
      db.auditEvent.update({ where: { id: audit[0]!.id }, data: { action: 'tamper' } }),
    ).rejects.toThrow();
    await expect(db.memberStatusHistory.deleteMany({ where: { memberId: id } })).rejects.toThrow();
  });
  it('preserves household periods, rejects concurrent assignments and inactive representatives', async () => {
    const m = (
      await post(`${root()}/members`, {
        memberNumber: 'TEST-2',
        name: '가상 가족',
        registeredOn: '2020-01-01',
        status: 'ACTIVE',
      })
    ).body;
    const h1 = (await post(`${root()}/households`, { name: '가상 가족 A' })).body;
    const h2 = (await post(`${root()}/households`, { name: '가상 가족 B' })).body;
    await post(`${root()}/households/${h1.id}/representative`, { memberId: m.id }).expect(409);
    const results = await Promise.all([
      post(`${root()}/household-moves`, {
        memberId: m.id,
        householdId: h1.id,
        effectiveFrom: '2020-01-02',
        relationship: '본인',
      }),
      post(`${root()}/household-moves`, {
        memberId: m.id,
        householdId: h2.id,
        effectiveFrom: '2020-01-02',
        relationship: '본인',
      }),
    ]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(
      await db.householdMembership.count({ where: { memberId: m.id, effectiveTo: null } }),
    ).toBe(1);
    const current = await db.householdMembership.findFirstOrThrow({
      where: { memberId: m.id, effectiveTo: null },
    });
    const target = current.householdId === h1.id ? h2.id : h1.id;
    await post(`${root()}/households/${current.householdId}/representative`, {
      memberId: m.id,
    }).expect(201);
    await post(`${root()}/households/${current.householdId}/archive`, {}).expect(409);
    await post(`${root()}/household-moves`, {
      memberId: m.id,
      householdId: target,
      effectiveFrom: '2020-02-01',
      relationship: '본인',
    }).expect(201);
    expect(
      (await get(`${root()}/households/${current.householdId}/members?at=2020-01-15`)).body.items,
    ).toHaveLength(1);
    expect(
      (await get(`${root()}/households/${current.householdId}/members?at=2020-02-01`)).body.items,
    ).toHaveLength(0);
    await post(`${root()}/households/${current.householdId}/archive`, {}).expect(201);
    await expect(
      db.householdMembership.create({
        data: {
          churchId,
          memberId: m.id,
          householdId: target,
          relationship: 'overlap',
          effectiveFrom: new Date('2020-01-01'),
        },
      }),
    ).rejects.toThrow();
    const foreign = await db.household.create({ data: { churchId: otherChurch, name: 'Other' } });
    await expect(
      db.householdMembership.create({
        data: {
          churchId,
          memberId: m.id,
          householdId: foreign.id,
          relationship: 'other',
          effectiveFrom: new Date('2021-01-01'),
        },
      }),
    ).rejects.toThrow();
  });
  it('rejects organization cycles and preserves appointment names and periods', async () => {
    const m = (
      await post(`${root()}/members`, {
        memberNumber: 'TEST-3',
        name: '가상 조직',
        registeredOn: '2020-01-01',
        status: 'ACTIVE',
      })
    ).body;
    const a = (await post(`${root()}/organizations`, { name: '부모', type: 'GROUP' })).body;
    const b = (
      await post(`${root()}/organizations`, { name: '자식', type: 'GROUP', parentId: a.id })
    ).body;
    expect(
      (await post(`${root()}/organizations/${a.id}/parent`, { parentId: b.id })).body.error.code,
    ).toBe('ORGANIZATION_CYCLE');
    const link = await post(`${root()}/organization-memberships`, {
      memberId: m.id,
      organizationId: b.id,
      effectiveFrom: '2020-01-02',
      role: '구성원',
      primary: true,
    });
    expect(link.status, link.text).toBe(201);
    await post(`${root()}/organization-memberships`, {
      memberId: m.id,
      organizationId: b.id,
      effectiveFrom: '2020-01-02',
      role: '중복',
      primary: true,
    }).expect(409);
    await expect(
      db.organization.update({ where: { id: a.id }, data: { parentId: b.id } }),
    ).rejects.toThrow();
    await post(`${root()}/organizations/${b.id}/close`, { effectiveTo: '2020-03-01' }).expect(409);
    await post(`${root()}/organization-memberships/${link.body.id}/end`, {
      effectiveTo: '2020-02-01',
    }).expect(201);
    const p = await post(`${root()}/positions`, {
      name: '직분 원래 이름',
      sortOrder: 0,
      active: true,
      allowConcurrent: false,
    });
    const appointment = await post(`${root()}/position-appointments`, {
      memberId: m.id,
      positionId: p.body.id,
      organizationId: b.id,
      effectiveFrom: '2020-02-01',
    });
    expect(appointment.status, appointment.text).toBe(201);
    await post(`${root()}/position-appointments`, {
      memberId: m.id,
      positionId: p.body.id,
      effectiveFrom: '2020-02-01',
    }).expect(409);
    await request(app.getHttpServer())
      .patch(`${root()}/positions/${p.body.id}`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('x-csrf-token', csrf)
      .send({ name: '수정 이름', sortOrder: 1, active: true, allowConcurrent: false })
      .expect(200);
    expect((await get(`${root()}/members/${m.id}`)).body.positions[0].name).toBe('직분 원래 이름');
    await post(`${root()}/position-appointments/${appointment.body.id}/end`, {
      effectiveTo: '2020-03-01',
    }).expect(201);
    await post(`${root()}/organizations/${b.id}/close`, { effectiveTo: '2020-04-01' }).expect(201);
  });
  it('uses bounded cursors and applies role changes to active sessions', async () => {
    const first = await get(`${root()}/members?limit=1`);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.nextCursor).toBeTruthy();
    const second = await get(`${root()}/members?limit=1&cursor=${first.body.nextCursor}`);
    expect(second.body.items[0].id).not.toBe(first.body.items[0].id);
    await get(`${root()}/members?limit=1000`).expect(400);
    const role = await post(`${root()}/identity/roles`, {
      name: 'New Reader',
      permissions: ['membership.read'],
    });
    expect(role.status, role.text).toBe(201);
    const reader = await login('reader');
    await request(app.getHttpServer())
      .patch(`${root()}/identity/users/${readonlyId}`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('x-csrf-token', csrf)
      .send({ active: true, roleIds: [role.body.id] })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', String(reader.headers['set-cookie']![0]).split(';')[0]!)
      .expect(401);
  });
  it('requires MFA for production administrators and revokes sessions at enrollment and logout', async () => {
    process.env.NODE_ENV = 'production';
    await get(`${root()}/members`).expect(403);
    process.env.NODE_ENV = 'test';
    const enrolled = await post('/api/v1/auth/mfa/enroll', {});
    expect(enrolled.status, enrolled.text).toBe(201);
    expect(enrolled.body.secret).toHaveLength(32);
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.totpSecret).not.toContain(enrolled.body.secret);
    const code = totp(decryptSecret(user.totpSecret!));
    await post('/api/v1/auth/mfa/confirm', { code }).expect(201);
    await get('/api/v1/auth/me').expect(401);
    expect((await login()).status).toBe(401);
    await db.user.update({ where: { id: userId }, data: { totpLastCounter: -1 } });
    await signIn(code);
    expect((await get('/api/v1/auth/me')).body.mfaVerified).toBe(true);
    expect((await login('admin', code)).status).toBe(401);
    await post('/api/v1/auth/logout', {}).expect(201);
    await get('/api/v1/auth/me').expect(401);
    await db.user.update({ where: { id: userId }, data: { totpLastCounter: -1 } });
    await signIn(code);
    await db.session.updateMany({
      where: { userId },
      data: { lastSeenAt: new Date(Date.now() - 31 * 60000) },
    });
    await get('/api/v1/auth/me').expect(401);
  });
  it('invalidates raced credential sessions and changes passwords atomically', async () => {
    const reader = await login('reader');
    const readerCookie = String(reader.headers['set-cookie']![0]).split(';')[0]!;
    const before = await db.user.findUniqueOrThrow({ where: { id: readonlyId } });
    await request(app.getHttpServer())
      .post('/api/v1/auth/password')
      .set('Cookie', readerCookie)
      .set('Origin', origin)
      .set('x-csrf-token', reader.body.csrfToken)
      .send({ currentPassword: password, password: 'Changed-synthetic-password-1234' })
      .expect(201);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', readerCookie)
      .expect(401);
    expect((await login('reader')).status).toBe(401);
    const token = 'ab'.repeat(32);
    const { tokenHash } = await import('../src/modules/identity/infrastructure/password');
    await db.session.create({
      data: {
        tokenHash: tokenHash(token),
        churchId,
        userId: readonlyId,
        authVersion: before.authVersion,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', `church_session=${token}`)
      .expect(401);
  });
  it('keeps directional family relations with non-overlapping periods', async () => {
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    await db.user.update({ where: { id: userId }, data: { totpLastCounter: -1 } });
    await signIn(totp(decryptSecret(user.totpSecret!)));
    const members = await db.member.findMany({ where: { churchId }, take: 2 });
    const a = members[0]!,
      b = members[1]!;
    await post(`${root()}/members/${a.id}/relations`, {
      relatedMemberId: a.id,
      relationship: '부모',
      effectiveFrom: '2020-01-01',
    }).expect(400);
    const created = await post(`${root()}/members/${a.id}/relations`, {
      relatedMemberId: b.id,
      relationship: '부모',
      effectiveFrom: '2020-01-01',
    });
    expect(created.status, created.text).toBe(201);
    await post(`${root()}/members/${a.id}/relations`, {
      relatedMemberId: b.id,
      relationship: '부모',
      effectiveFrom: '2020-02-01',
    }).expect(409);
    expect((await get(`${root()}/members/${a.id}`)).body.relations[0].name).toBe(b.name);
    await post(`${root()}/member-relations/${created.body.id}/end`, {
      effectiveTo: '2020-03-01',
    }).expect(201);
    await post(`${root()}/member-relations/${created.body.id}/end`, {
      effectiveTo: '2020-04-01',
    }).expect(404);
  });
  it('throttles invalid credentials without disclosing account existence', async () => {
    let last;
    for (let i = 0; i < 6; i++)
      last = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .send({ churchId, username: 'unknown', password: 'incorrect' });
    expect(last!.status).toBe(429);
  });
});
