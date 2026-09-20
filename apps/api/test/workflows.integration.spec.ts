import { purgeExpiredCare } from '../src/modules/operations/application/purge-care';
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
    'care.read',
    'care.write',
    'care.notes',
    'care.policy',
    'newcomer.read',
    'newcomer.write',
    'attendance.read',
    'attendance.write',
    'membership.import',
    'membership.export',
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
    process.env.CARE_ENCRYPTION_KEY = '45'.repeat(32);
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
    await db.permission.createMany({ data: perms.map((code) => ({ code })), skipDuplicates: true });
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
    userId = (
      await db.user.create({
        data: { churchId, username: 'admin', passwordHash: hash, scopeMode: 'ALL' },
      })
    ).id;
    readonlyId = (
      await db.user.create({
        data: { churchId, username: 'reader', passwordHash: hash, scopeMode: 'ALL' },
      })
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
    delete process.env.CARE_ENCRYPTION_KEY;
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
  it('filters organization scopes before pagination and hides related people and shared PII', async () => {
    const org = (await post(`${root()}/organizations`, { name: 'Scope root', type: 'GROUP' })).body
      .id;
    const child = (
      await post(`${root()}/organizations`, { name: 'Scope child', type: 'GROUP', parentId: org })
    ).body.id;
    const a = (
      await post(`${root()}/members`, {
        memberNumber: 'SCOPE-A',
        name: 'Scope allowed',
        registeredOn: '2020-01-01',
        status: 'ACTIVE',
      })
    ).body.id;
    const b = (
      await post(`${root()}/members`, {
        memberNumber: 'SCOPE-B',
        name: 'Scope hidden',
        registeredOn: '2020-01-01',
        status: 'ACTIVE',
      })
    ).body.id;
    await post(`${root()}/organization-memberships`, {
      memberId: a,
      organizationId: child,
      role: 'member',
      primary: true,
      effectiveFrom: '2020-01-01',
    }).expect(201);
    const household = (await post(`${root()}/households`, { name: 'Shared', phone: '010-secret' }))
      .body.id;
    for (const id of [a, b])
      await post(`${root()}/household-moves`, {
        memberId: id,
        householdId: household,
        relationship: 'member',
        effectiveFrom: '2020-01-01',
      }).expect(201);
    await post(`${root()}/members/${a}/relations`, {
      relatedMemberId: b,
      relationship: 'parent',
      effectiveFrom: '2020-01-01',
    }).expect(201);
    const u = await db.user.create({
      data: { churchId, username: 'scoped', passwordHash: await hashPassword(password) },
    });
    const role = await db.role.findFirstOrThrow({ where: { churchId, name: 'Administrator' } });
    await db.userRole.create({ data: { churchId, userId: u.id, roleId: role.id } });
    const assign = (mode: string, descendants = false) =>
      request(app.getHttpServer())
        .put(`${root()}/identity/users/${u.id}/scope`)
        .set('Cookie', cookie)
        .set('Origin', origin)
        .set('x-csrf-token', csrf)
        .send({
          mode,
          memberId: mode === 'SELF' ? a : null,
          organizations: mode === 'ORGANIZATIONS' ? [{ organizationId: org, descendants }] : [],
        });
    await assign('ORGANIZATIONS').expect(200);
    let signed = await login('scoped');
    let sc = String(signed.headers['set-cookie']![0]).split(';')[0]!;
    const read = (path: string) =>
      request(app.getHttpServer())
        .get(root() + path)
        .set('Cookie', sc);
    expect((await read('/members')).body.items).toHaveLength(0);
    await assign('ORGANIZATIONS', true).expect(200);
    await read('/members').expect(401);
    signed = await login('scoped');
    sc = String(signed.headers['set-cookie']![0]).split(';')[0]!;
    const list = await read('/members?limit=1');
    expect(list.body.items.map((x: { id: string }) => x.id)).toEqual([a]);
    expect(list.body.nextCursor).toBeNull();
    await read(`/members/${b}`).expect(404);
    expect((await read(`/members/${a}`)).body.relations).toEqual([]);
    const households = await read('/households');
    expect(households.body.items[0].activeMembers).toBe(1);
    expect(households.body.items[0].phone).toBeUndefined();
    expect((await read(`/households/${household}/members`)).body.items).toHaveLength(1);
    await read('/identity').expect(403);
    await read('/audit-events').expect(403);
    await request(app.getHttpServer())
      .patch(`${root()}/members/${b}`)
      .set('Cookie', sc)
      .set('Origin', origin)
      .set('x-csrf-token', signed.body.csrfToken)
      .send({ name: 'Forbidden', version: 1 })
      .expect(404);
    await assign('SELF').expect(200);
    signed = await login('scoped');
    sc = String(signed.headers['set-cookie']![0]).split(';')[0]!;
    expect((await read('/members')).body.items.map((x: { id: string }) => x.id)).toEqual([a]);
    await expect(
      db.userScope.create({ data: { churchId: otherChurch, userId: u.id, organizationId: org } }),
    ).rejects.toThrow();
  });
  it('previews CSV errors, imports atomically once, and limits one-time exports to the caller', async () => {
    const mapping = {
      memberNumber: 'number',
      name: 'name',
      registeredOn: 'date',
      status: 'status',
    };
    const bad = await post(`${root()}/transfers/imports/preview`, {
      mapping,
      csv: 'number,name,date,status\nCSV-1,One,not-a-date,ACTIVE',
    });
    expect(bad.status, bad.text).toBe(201);
    expect(bad.body.batchId).toBeNull();
    expect(bad.body.errors[0].fields).toContain('registeredOn');
    const good = await post(`${root()}/transfers/imports/preview`, {
      mapping,
      csv: 'number,name,date,status\nCSV-1,"=SUM(1,2)",2020-01-01,ACTIVE\nCSV-2,"Quoted ""name""",2020-01-01,ACTIVE',
    });
    expect(good.status, good.text).toBe(201);
    expect(good.body.errors).toEqual([]);
    await post(`${root()}/transfers/imports/${good.body.batchId}/apply`, {}).expect(201);
    expect(
      (await post(`${root()}/transfers/imports/${good.body.batchId}/apply`, {})).body.replayed,
    ).toBe(true);
    expect(
      await db.member.count({ where: { churchId, memberNumber: { in: ['CSV-1', 'CSV-2'] } } }),
    ).toBe(2);
    const job = await post(`${root()}/transfers/exports`, { q: '=sum' });
    const exported = await post(`${root()}/transfers/exports/${job.body.id}/download`, {});
    expect(exported.status, exported.text).toBe(201);
    expect(exported.body.count).toBe(1);
    expect(exported.body.csv).toContain("'=SUM(1,2)");
    await post(`${root()}/transfers/exports/${job.body.id}/download`, {}).expect(404);
    const scoped = await login('scoped');
    const sc = String(scoped.headers['set-cookie']![0]).split(';')[0]!;
    const scopedPost = (path: string, body: unknown) =>
      request(app.getHttpServer())
        .post(root() + path)
        .set('Cookie', sc)
        .set('Origin', origin)
        .set('x-csrf-token', scoped.body.csrfToken)
        .send(body as object);
    const sj = await scopedPost('/transfers/exports', { q: '' });
    expect((await scopedPost(`/transfers/exports/${sj.body.id}/download`, {})).body.count).toBe(1);
    await scopedPost('/transfers/imports/preview', {
      mapping,
      csv: 'number,name,date,status\nX,X,2020-01-01,ACTIVE',
    }).expect(403);
    expect(
      await db.auditEvent.count({ where: { churchId, action: 'member.export.download' } }),
    ).toBe(2);
  });
  it('records attendance once per member/session and preserves versioned changes and scoped totals', async () => {
    const member = await db.member.findFirstOrThrow({
      where: { churchId, memberNumber: 'SCOPE-A' },
    });
    const hidden = await db.member.findFirstOrThrow({
      where: { churchId, memberNumber: 'SCOPE-B' },
    });
    const g = await post(`${root()}/operations/gatherings`, {
      name: 'Sunday',
      schedule: '매주 주일',
    });
    expect(g.status, g.text).toBe(201);
    const ss = await post(`${root()}/operations/gatherings/${g.body.id}/sessions`, {
      startsAt: '2024-01-01T00:30:00+09:00',
    });
    expect(ss.status, ss.text).toBe(201);
    const url = `${root()}/operations/sessions/${ss.body.id}/attendance`;
    await post(url, {
      source: 'BULK',
      records: [
        { memberId: member.id, status: 'PRESENT', version: 0 },
        { memberId: hidden.id, status: 'ABSENT', version: 0 },
      ],
    }).expect(201);
    await post(url, {
      source: 'MANUAL',
      records: [{ memberId: member.id, status: 'LATE', version: 0 }],
    }).expect(409);
    await post(url, {
      source: 'MANUAL',
      records: [{ memberId: member.id, status: 'LATE', version: 1 }],
    }).expect(201);
    const record = await db.attendanceRecord.findFirstOrThrow({
      where: { memberId: member.id, sessionId: ss.body.id },
    });
    expect(
      (await get(`${root()}/operations/attendance/${record.id}/history`)).body.items,
    ).toHaveLength(2);
    await expect(
      db.attendanceChange.deleteMany({ where: { recordId: record.id } }),
    ).rejects.toThrow();
    const scoped = await login('scoped');
    const sc = String(scoped.headers['set-cookie']![0]).split(';')[0]!;
    const read = (path: string) =>
      request(app.getHttpServer())
        .get(root() + path)
        .set('Cookie', sc);
    expect((await read(`/operations/sessions/${ss.body.id}/attendance`)).body.items).toHaveLength(
      1,
    );
    const counts = (await read('/operations/attendance-summary?from=2024-01-01&to=2024-01-01')).body
      .counts;
    expect(counts).toEqual({ LATE: 1 });
    await request(app.getHttpServer())
      .post(url)
      .set('Cookie', sc)
      .set('Origin', origin)
      .set('x-csrf-token', scoped.body.csrfToken)
      .send({ source: 'MANUAL', records: [{ memberId: hidden.id, status: 'PRESENT', version: 1 }] })
      .expect(404);
  });
  it('tracks configurable newcomer stages, due work and immutable changes without altering membership status', async () => {
    const stage = await post(`${root()}/operations/newcomer-stages`, {
      name: 'Welcome',
      sortOrder: 1,
      terminal: false,
      active: true,
    });
    const done = await post(`${root()}/operations/newcomer-stages`, {
      name: 'Settled',
      sortOrder: 2,
      terminal: true,
      active: true,
    });
    expect(stage.status, stage.text).toBe(201);
    expect(done.status, done.text).toBe(201);
    const member = await db.member.findFirstOrThrow({
      where: { churchId, memberNumber: 'SCOPE-A' },
    });
    const journey = await post(`${root()}/operations/newcomers`, {
      memberId: member.id,
      stageId: stage.body.id,
      assigneeId: userId,
      dueOn: '2020-01-01',
    });
    expect(journey.status, journey.text).toBe(201);
    expect(
      (await get(`${root()}/operations/newcomers?state=overdue`)).body.items.some(
        (r: { id: string }) => r.id === journey.body.id,
      ),
    ).toBe(true);
    const patch = (version: number) =>
      request(app.getHttpServer())
        .patch(`${root()}/operations/newcomers/${journey.body.id}`)
        .set('Cookie', cookie)
        .set('Origin', origin)
        .set('x-csrf-token', csrf)
        .send({ stageId: done.body.id, assigneeId: userId, dueOn: null, version });
    await patch(1).expect(200);
    await patch(1).expect(409);
    expect((await get(`${root()}/operations/newcomers?state=completed`)).body.items).toHaveLength(
      1,
    );
    expect(
      (await get(`${root()}/operations/newcomers/${journey.body.id}/history`)).body.items,
    ).toHaveLength(2);
    expect((await db.member.findUniqueOrThrow({ where: { id: member.id } })).status).toBe(
      member.status,
    );
    await expect(
      db.newcomerChange.deleteMany({ where: { journeyId: journey.body.id } }),
    ).rejects.toThrow();
    const hidden = await db.member.findFirstOrThrow({
      where: { churchId, memberNumber: 'SCOPE-B' },
    });
    const scopedUser = await db.user.findUniqueOrThrow({
      where: { churchId_username: { churchId, username: 'scoped' } },
    });
    await post(`${root()}/operations/newcomers`, {
      memberId: hidden.id,
      stageId: stage.body.id,
      assigneeId: scopedUser.id,
      dueOn: null,
    }).expect(404);
  });
  it('separates care metadata and encrypted notes, enforces policy/visibility and purges expired content', async () => {
    const member = await db.member.findFirstOrThrow({
      where: { churchId, memberNumber: 'SCOPE-A' },
    });
    const r = await post(`${root()}/operations/care`, {
      memberId: member.id,
      assigneeId: userId,
      kind: 'CALL',
      occurredAt: '2024-01-01T10:00:00+09:00',
      followUpOn: '2024-01-02',
    });
    expect(r.status, r.text).toBe(201);
    const noteUrl = `${root()}/operations/care/${r.body.id}/notes`;
    await post(noteUrl, { text: 'Synthetic restricted note', visibility: 'ASSIGNEE' }).expect(403);
    await request(app.getHttpServer())
      .put(`${root()}/operations/care-policy`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('x-csrf-token', csrf)
      .send({ enabled: true, retentionDays: 30, reference: 'Synthetic test retention policy' })
      .expect(200);
    const note = await post(noteUrl, { text: 'Synthetic restricted note', visibility: 'ASSIGNEE' });
    expect(note.status, note.text).toBe(201);
    const stored = await db.careNote.findUniqueOrThrow({ where: { id: note.body.id } });
    expect(stored.ciphertext).not.toContain('Synthetic');
    expect((await get(noteUrl)).body.items[0].text).toBe('Synthetic restricted note');
    await expect(
      db.careNote.update({ where: { id: stored.id }, data: { ciphertext: 'replacement' } }),
    ).rejects.toThrow();
    const scoped = await login('scoped');
    const sc = String(scoped.headers['set-cookie']![0]).split(';')[0]!;
    const scopedGet = (url: string) => request(app.getHttpServer()).get(url).set('Cookie', sc);
    expect((await scopedGet(noteUrl)).body.items).toEqual([]);
    const role = await db.role.findFirstOrThrow({ where: { churchId, name: 'Administrator' } });
    await post(noteUrl, {
      text: 'Synthetic group note',
      visibility: 'ROLE',
      roleId: role.id,
    }).expect(201);
    expect((await scopedGet(noteUrl)).body.items.map((n: { text: string }) => n.text)).toEqual([
      'Synthetic group note',
    ]);
    const reader = await login('reader');
    await request(app.getHttpServer())
      .get(noteUrl)
      .set('Cookie', String(reader.headers['set-cookie']![0]).split(';')[0]!)
      .expect(403);
    const list = await get(`${root()}/operations/care?state=overdue`);
    expect(list.body.items.some((x: { id: string }) => x.id === r.body.id)).toBe(true);
    expect(JSON.stringify(list.body)).not.toContain('Synthetic restricted');
    const household = await db.household.findFirstOrThrow({ where: { churchId, name: 'Shared' } });
    const scopedUser = await db.user.findUniqueOrThrow({
      where: { churchId_username: { churchId, username: 'scoped' } },
    });
    await request(app.getHttpServer())
      .post(`${root()}/operations/care`)
      .set('Cookie', sc)
      .set('Origin', origin)
      .set('x-csrf-token', scoped.body.csrfToken)
      .send({
        householdId: household.id,
        assigneeId: scopedUser.id,
        kind: 'VISIT',
        occurredAt: '2024-01-01T00:00:00Z',
        followUpOn: null,
      })
      .expect(404);
    const patch = () =>
      request(app.getHttpServer())
        .patch(`${root()}/operations/care/${r.body.id}`)
        .set('Cookie', cookie)
        .set('Origin', origin)
        .set('x-csrf-token', csrf)
        .send({ assigneeId: userId, followUpOn: null, completed: true, version: 1 });
    await patch().expect(200);
    await patch().expect(409);
    const expired = await db.careNote.create({
      data: {
        churchId,
        recordId: r.body.id,
        authorId: userId,
        visibility: 'ASSIGNEE',
        ciphertext: 'expired synthetic cipher',
        expiresAt: new Date(0),
      },
    });
    expect((await get(noteUrl)).body.items).toHaveLength(2);
    expect(await purgeExpiredCare(db)).toBe(1);
    expect(
      (await db.careNote.findUniqueOrThrow({ where: { id: expired.id } })).ciphertext,
    ).toBeNull();
    expect(
      JSON.stringify(
        await db.auditEvent.findMany({ where: { churchId, action: { startsWith: 'care.' } } }),
      ),
    ).not.toContain('Synthetic restricted');
    await expect(db.careChange.deleteMany({ where: { recordId: r.body.id } })).rejects.toThrow();
  });
  it('rolls back a conflicting CSV import and rejects unprivileged PII edits', async () => {
    const mapping = { memberNumber: 'n', name: 'name', registeredOn: 'date', status: 'status' };
    const preview = await post(`${root()}/transfers/imports/preview`, {
      mapping,
      csv: 'n,name,date,status\nROLL-A,First,2020-01-01,ACTIVE\nROLL-B,Second,2020-01-01,ACTIVE',
    });
    expect(preview.status, preview.text).toBe(201);
    await post(`${root()}/members`, {
      memberNumber: 'ROLL-B',
      name: 'Concurrent',
      registeredOn: '2020-01-01',
      status: 'ACTIVE',
    }).expect(201);
    await post(`${root()}/transfers/imports/${preview.body.batchId}/apply`, {}).expect(409);
    expect(await db.member.count({ where: { churchId, memberNumber: 'ROLL-A' } })).toBe(0);
    const role = await db.role.create({
      data: {
        churchId,
        name: 'Non-PII writer',
        permissions: {
          create: ['membership.read', 'membership.write'].map((permissionCode) => ({
            permissionCode,
          })),
        },
      },
    });
    await db.userRole.create({ data: { churchId, userId: readonlyId, roleId: role.id } });
    const reader = await login('reader');
    const rc = String(reader.headers['set-cookie']![0]).split(';')[0]!;
    const member = await db.member.findFirstOrThrow({
      where: { churchId, memberNumber: 'SCOPE-A' },
    });
    await request(app.getHttpServer())
      .patch(`${root()}/members/${member.id}`)
      .set('Cookie', rc)
      .set('Origin', origin)
      .set('x-csrf-token', reader.body.csrfToken)
      .send({ name: member.name, version: member.version, phone: 'unauthorized' })
      .expect(403);
    expect((await db.member.findUniqueOrThrow({ where: { id: member.id } })).phone).toBe(
      member.phone,
    );
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
    expect(
      (await get(`${root()}/members/${a.id}`)).body.relations.find(
        (r: { id: string }) => r.id === created.body.id,
      ).name,
    ).toBe(b.name);
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
