import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApplication } from '../src/platform/app.factory';
import { hashPassword } from '../src/modules/identity/infrastructure/password';
const enabled = process.env.RUN_DB_TESTS === '1';
describe.skipIf(!enabled)('Individual offerings and donation receipts', () => {
  let db: PrismaClient,
    control: PrismaClient,
    app: INestApplication,
    church: string,
    other: string,
    asset: string,
    revenue: string,
    fund: string,
    period: string,
    type: string,
    donor: string,
    foreignDonor: string;
  const database = 'offering_test_' + randomUUID().replaceAll('-', ''),
    savedUrl = process.env.DATABASE_URL,
    origin = 'http://localhost:5173';
  const sessions: Record<string, { id: string; cookie: string; csrf: string }> = {};
  const base = () => `/api/v1/churches/${church}/finance`;
  function call(user: string, method: 'get' | 'post' | 'patch', path: string, body?: object) {
    const s = sessions[user]!;
    const client = request(app.getHttpServer());
    const r = client[method](base() + path)
      .set('Cookie', s.cookie)
      .set('Origin', origin)
      .set('x-csrf-token', s.csrf);
    return body ? r.send(body) : r;
  }
  const draft = (extra: object = {}) => ({
    donorId: donor,
    typeId: type,
    assetAccountId: asset,
    givenOn: '2020-06-01',
    amount: 12000,
    reference: randomUUID(),
    source: 'CASH',
    ...extra,
  });
  async function create(extra: object = {}) {
    const r = await call('entry', 'post', '/offerings', draft(extra));
    expect(r.status, r.text).toBe(201);
    return r.body.id as string;
  }
  async function detail(id: string) {
    const r = await call('entry', 'get', '/offerings/' + id);
    expect(r.status, r.text).toBe(200);
    return r.body;
  }
  async function posted(extra: object = {}) {
    const id = await create(extra);
    await call('reviewer', 'post', `/offerings/${id}/review`, { version: 1 }).expect(201);
    await call('poster', 'post', `/offerings/${id}/post`, { version: 2 }).expect(201);
    return id;
  }
  async function preview(donorId = donor) {
    const r = await call('issuer', 'get', `/receipts/preview?donorId=${donorId}&taxYear=2020`);
    expect(r.status, r.text).toBe(200);
    return r.body;
  }
  async function issue(ids: string[], donorId = donor) {
    const p = await preview(donorId);
    return call('issuer', 'post', '/receipts', {
      donorId,
      taxYear: 2020,
      offeringIds: ids,
      donorVersion: p.donor.version,
      issuerVersion: p.issuer.version,
      identityConfirmed: true,
    });
  }
  const issuerData = {
    name: '가상 발급 교회',
    registrationNumber: '000-00-00000',
    address: '가상 발급기관 주소',
    representative: '가상 대표자',
    legalBasis: '법인세법 시행령 제39조제1항제1호마목',
    qualificationReference: 'SYNTHETIC-QUALIFICATION',
    electronicRequired: false,
    eligibilityConfirmed: true,
  };
  beforeAll(async () => {
    control = new PrismaClient();
    await control.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
    const url = new URL(savedUrl!);
    url.pathname = '/' + database;
    process.env.DATABASE_URL = url.toString();
    delete process.env.AUTH_ADAPTER;
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      env: process.env,
      stdio: 'pipe',
    });
    db = new PrismaClient();
    church = (await db.church.create({ data: { name: 'Synthetic offerings' } })).id;
    other = (await db.church.create({ data: { name: 'Other synthetic' } })).id;
    const roles: Record<string, string[]> = {
      manager: ['identity.manage', 'finance.manage'],
      entry: ['offering.read', 'offering.write', 'offering.review'],
      reviewer: ['offering.read', 'offering.review'],
      poster: ['offering.read', 'offering.post', 'offering.reverse', 'finance.reverse'],
      issuer: ['receipt.read', 'receipt.issue', 'receipt.print', 'receipt.cancel'],
      reader: ['receipt.read'],
      member: ['membership.read'],
    };
    const hash = await hashPassword('Synthetic-offering-1234');
    await db.permission.createMany({
      data: [...new Set(Object.values(roles).flat())].map((code) => ({ code })),
      skipDuplicates: true,
    });
    for (const [name, permissions] of Object.entries(roles)) {
      const role = await db.role.create({
        data: {
          churchId: church,
          name,
          permissions: { create: permissions.map((permissionCode) => ({ permissionCode })) },
        },
      });
      const u = await db.user.create({
        data: { churchId: church, username: name, passwordHash: hash, scopeMode: 'NONE' },
      });
      await db.userRole.create({ data: { churchId: church, userId: u.id, roleId: role.id } });
      sessions[name] = { id: u.id, cookie: '', csrf: '' };
    }
    app = await createApplication();
    await app.init();
    for (const [name, s] of Object.entries(sessions)) {
      const r = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .send({ churchId: church, username: name, password: 'Synthetic-offering-1234' });
      expect(r.status, r.text).toBe(201);
      s.cookie = String(r.headers['set-cookie']![0]).split(';')[0]!;
      s.csrf = r.body.csrfToken;
    }
    asset = (
      await call('manager', 'post', '/accounts', { kind: 'ASSET', code: 'A1', name: '현금' })
    ).body.id;
    revenue = (
      await call('manager', 'post', '/accounts', { kind: 'REVENUE', code: 'R1', name: '헌금수익' })
    ).body.id;
    fund = (await call('manager', 'post', '/funds', { name: '일반' })).body.id;
    period = (
      await call('manager', 'post', '/periods', {
        name: '2020',
        startsOn: '2020-01-01',
        endsOn: '2020-12-31',
      })
    ).body.id;
    const t = await call('manager', 'post', '/offering-types', {
      name: '감사헌금',
      revenueAccountId: revenue,
      fundId: fund,
      receiptEligible: true,
    });
    expect(t.status, t.text).toBe(201);
    type = t.body.id;
    const d = await call('entry', 'post', '/donors', {
      name: '가상 기부자',
      address: '가상 기부자 주소',
    });
    expect(d.status, d.text).toBe(201);
    donor = d.body.id;
    foreignDonor = (
      await db.offeringDonor.create({
        data: { churchId: other, name: '다른 교회 기부자', address: 'other' },
      })
    ).id;
    await call('manager', 'post', '/receipt-issuer', { ...issuerData, version: 0 }).expect(201);
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
  }, 30000);
  it('validates individual inputs, tenant boundaries, CSRF and finance/member permission separation', async () => {
    await call('manager', 'get', '/offerings').expect(403);
    await call('member', 'get', '/receipts').expect(403);
    await call('entry', 'get', '/receipts').expect(403);
    for (const extra of [
      { amount: 0 },
      { amount: 1.5 },
      { givenOn: '2020-02-30' },
      { givenOn: '2999-01-01' },
      { assetAccountId: revenue },
      { donorId: foreignDonor },
      { unexpected: 'rrn' },
    ])
      await call('entry', 'post', '/offerings', draft(extra)).expect(400);
    const id = await create({ reference: 'ONLY-ONCE' });
    await call('entry', 'post', '/offerings', draft({ reference: 'ONLY-ONCE' })).expect(400);
    await request(app.getHttpServer())
      .get(`/api/v1/churches/${other}/finance/offerings/${id}`)
      .set('Cookie', sessions.entry!.cookie)
      .expect(403);
    await request(app.getHttpServer())
      .post(base() + '/offerings')
      .set('Cookie', sessions.entry!.cookie)
      .set('Origin', origin)
      .send(draft())
      .expect(403);
    await expect(
      db.offering.update({ where: { id }, data: { donorId: foreignDonor } }),
    ).rejects.toThrow();
    await call('issuer', 'get', `/receipts/preview?donorId=${foreignDonor}&taxYear=2020`).expect(
      404,
    );
  });
  it('requires independent review, re-review on edits, optimistic versions and one atomic posting', async () => {
    const id = await create();
    await call('entry', 'post', `/offerings/${id}/review`, { version: 1 }).expect(403);
    await call('poster', 'post', `/offerings/${id}/post`, { version: 1 }).expect(400);
    await call('reviewer', 'post', `/offerings/${id}/review`, { version: 1 }).expect(201);
    await call('entry', 'patch', `/offerings/${id}`, {
      ...draft({ amount: 17000 }),
      version: 1,
    }).expect(409);
    await call('entry', 'patch', `/offerings/${id}`, {
      ...draft({ amount: 17000 }),
      version: 2,
    }).expect(200);
    expect((await detail(id)).state).toBe('DRAFT');
    await call('poster', 'post', `/offerings/${id}/post`, { version: 3 }).expect(400);
    await call('reviewer', 'post', `/offerings/${id}/review`, { version: 3 }).expect(201);
    const r = await Promise.all([
      call('poster', 'post', `/offerings/${id}/post`, { version: 4 }),
      call('poster', 'post', `/offerings/${id}/post`, { version: 4 }),
    ]);
    expect(r.map((x) => x.status).sort()).toEqual([201, 409]);
    const o = await detail(id),
      lines = await db.journalLine.findMany({ where: { journalId: o.journalId } });
    expect(lines.reduce((n, l) => n + l.debit.toNumber(), 0)).toBe(17000);
    expect(lines.reduce((n, l) => n + l.credit.toNumber(), 0)).toBe(17000);
    expect(lines.find((l) => l.accountId === revenue)!.credit.toNumber()).toBe(17000);
    await expect(db.offering.update({ where: { id }, data: { amount: 1 } })).rejects.toThrow();
    await expect(db.offering.delete({ where: { id } })).rejects.toThrow();
    await call('entry', 'patch', `/offerings/${id}`, { ...draft(), version: 5 }).expect(400);
  });
  it('issues immutable personal receipts once, excludes anonymous/noneligible/unposted/other-year donations', async () => {
    const id = await posted({ amount: 30000 }),
      anonymous = await posted({ donorId: undefined });
    const nt = await call('manager', 'post', '/offering-types', {
      name: '비공제',
      revenueAccountId: revenue,
      fundId: fund,
      receiptEligible: false,
    });
    const excluded = await posted({ typeId: nt.body.id });
    const unposted = await create();
    const p = await preview();
    expect(p.items.map((x: { id: string }) => x.id)).toContain(id);
    for (const otherId of [anonymous, excluded, unposted]) {
      expect(p.items.map((x: { id: string }) => x.id)).not.toContain(otherId);
      await issue([otherId]).then((r) => expect(r.status, r.text).toBe(400));
    }
    const command = {
      donorId: donor,
      taxYear: 2020,
      offeringIds: [id],
      donorVersion: p.donor.version,
      issuerVersion: p.issuer.version,
      identityConfirmed: true,
    };
    await call('reader', 'post', '/receipts', command).expect(403);
    await call('issuer', 'post', '/receipts', { ...command, identityConfirmed: false }).expect(400);
    await call('issuer', 'post', '/receipts', { ...command, offeringIds: [id, id] }).expect(400);
    await call('issuer', 'post', '/receipts', { ...command, taxYear: 2021 }).expect(400);
    await call('issuer', 'post', '/receipts', {
      ...command,
      residentNumber: 'synthetic-forbidden-field',
    }).expect(400);
    const results = await Promise.all([
      call('issuer', 'post', '/receipts', command),
      call('issuer', 'post', '/receipts', command),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    const receipt = results.find((r) => r.status === 201)!.body;
    const doc = await call('issuer', 'get', '/receipts/' + receipt.id).expect(200);
    expect(doc.body.totalAmount).toBe(30000);
    expect(doc.body.donorName).toBe('가상 기부자');
    expect(doc.body.items).toHaveLength(1);
    const again = await call('issuer', 'post', `/receipts/${receipt.id}/print`, {}).expect(201);
    expect(again.body.number).toBe(receipt.number);
    expect(again.headers['cache-control']).toContain('no-store');
    await call('reader', 'post', `/receipts/${receipt.id}/print`, {}).expect(403);
    await expect(
      db.donationReceipt.update({ where: { id: receipt.id }, data: { donorName: 'changed' } }),
    ).rejects.toThrow();
    await expect(
      db.donationReceiptItem.deleteMany({ where: { receiptId: receipt.id } }),
    ).rejects.toThrow();
    await expect(
      db.receiptClaim.deleteMany({ where: { receiptId: receipt.id } }),
    ).rejects.toThrow();
    const original = await detail(id);
    await call('poster', 'post', `/offerings/${id}/reverse`, {
      postedOn: '2020-06-02',
      reason: 'blocked',
    }).expect(400);
    await call('poster', 'post', `/journals/${original.journalId}/reverse`, {
      postedOn: '2020-06-02',
      reason: 'bypass',
    }).expect(400);
    await expect(
      db.journalEntry.create({
        data: {
          churchId: church,
          periodId: period,
          postedOn: new Date('2020-06-02'),
          postedBy: sessions.poster!.id,
          description: 'blocked bypass',
          reversalOf: original.journalId,
        },
      }),
    ).rejects.toThrow();
    const before = await db.donationReceipt.count();
    await call('issuer', 'post', `/receipts/${receipt.id}/print`, {}).expect(201);
    expect(await db.donationReceipt.count()).toBe(before);
  });
  it('cancels without rewriting originals, reissues with a new number, then reverses the offering', async () => {
    const id = await posted(),
      receipt = await issue([id]);
    expect(receipt.status, receipt.text).toBe(201);
    const rid = receipt.body.id;
    await call('issuer', 'post', `/receipts/${rid}/cancel`, { reason: ' ' }).expect(400);
    await call('reader', 'post', `/receipts/${rid}/cancel`, { reason: 'test' }).expect(403);
    await call('issuer', 'post', `/receipts/${rid}/cancel`, { reason: '가상 발급 정정' }).expect(
      201,
    );
    await call('issuer', 'post', `/receipts/${rid}/print`, {}).expect(400);
    expect((await call('issuer', 'get', '/receipts/' + rid)).body.cancellation.reason).toBe(
      '가상 발급 정정',
    );
    const second = await issue([id]);
    expect(second.status, second.text).toBe(201);
    expect(second.body.number).not.toBe(receipt.body.number);
    expect(await db.donationReceiptItem.count({ where: { offeringId: id } })).toBe(2);
    await call('issuer', 'post', `/receipts/${second.body.id}/cancel`, {
      reason: '헌금 정정',
    }).expect(201);
    await call('poster', 'post', `/offerings/${id}/reverse`, {
      postedOn: '2020-06-02',
      reason: '헌금 정정',
    }).expect(201);
    await call('poster', 'post', `/offerings/${id}/reverse`, {
      postedOn: '2020-06-02',
      reason: '중복',
    }).expect(400);
    expect((await preview()).items.map((x: { id: string }) => x.id)).not.toContain(id);
    expect((await detail(id)).state).toBe('POSTED');
    expect((await detail(id)).reversal).not.toBeNull();
    await issue([id]).then((r) => expect(r.status).toBe(400));
  });
  it('checks issuer qualification, mandatory electronic issuance, snapshot versions and immutable receipt totals', async () => {
    const id = await posted(),
      p = await preview();
    await call('manager', 'post', '/receipt-issuer', {
      ...issuerData,
      electronicRequired: true,
      version: p.issuer.version,
    }).expect(201);
    await issue([id]).then((r) => expect(r.status).toBe(400));
    await call('manager', 'post', '/receipt-issuer', {
      ...issuerData,
      version: p.issuer.version + 1,
    }).expect(201);
    await call('issuer', 'post', '/receipts', {
      donorId: donor,
      taxYear: 2020,
      offeringIds: [id],
      donorVersion: p.donor.version,
      issuerVersion: p.issuer.version,
      identityConfirmed: true,
    }).expect(409);
    const result = await issue([id]);
    expect(result.status, result.text).toBe(201);
    await call('entry', 'patch', '/donors/' + donor, {
      name: '가상 이름 정정',
      address: '가상 새 주소',
      version: p.donor.version,
    }).expect(200);
    const old = (await call('issuer', 'get', '/receipts/' + result.body.id)).body;
    expect(old.donorName).toBe('가상 기부자');
    expect(old.donorAddress).toBe('가상 기부자 주소');
    const raw = await db.donationReceipt.findUniqueOrThrow({ where: { id: result.body.id } });
    await expect(
      db.donationReceipt.create({
        data: { ...raw, id: randomUUID(), serial: 999999, number: 'BROKEN', totalAmount: 999 },
      }),
    ).rejects.toThrow();
    const audit = JSON.stringify(await db.auditEvent.findMany({ where: { churchId: church } }));
    expect(audit).not.toContain('가상 기부자');
    expect(audit).not.toContain('가상 발급기관 주소');
    expect(audit).not.toContain('SYNTHETIC-QUALIFICATION');
    expect(audit).toContain('receipt.print');
  });
  it('limits member linking to the same church and uses a finance-only minimal member directory', async () => {
    await db.memberStatus.createMany({
      data: [
        { churchId: church, code: 'ACTIVE', label: '재적', allowedNext: [] },
        { churchId: other, code: 'ACTIVE', label: '재적', allowedNext: [] },
      ],
    });
    const m = await db.member.create({
      data: {
        churchId: church,
        name: '가상 연결교인',
        normalizedName: '가상 연결교인',
        memberNumber: 'TEST-M-1',
        registeredOn: new Date('2020-01-01'),
        status: 'ACTIVE',
        phone: 'synthetic-contact',
        address: 'synthetic-address',
      },
    });
    const om = await db.member.create({
      data: {
        churchId: other,
        name: '다른 가상 교인',
        normalizedName: '다른 가상 교인',
        memberNumber: 'TEST-M-2',
        registeredOn: new Date('2020-01-01'),
        status: 'ACTIVE',
      },
    });
    const found = await call(
      'entry',
      'get',
      '/offering-members?search=' + encodeURIComponent('가상 연결'),
    );
    expect(found.status).toBe(200);
    expect(found.body.items[0]).toEqual({ id: m.id, name: m.name, memberNumber: m.memberNumber });
    await call('entry', 'post', '/donors', { memberId: om.id, name: om.name, address: '' }).expect(
      404,
    );
    await call('entry', 'post', '/donors', {
      memberId: m.id,
      name: '다른 이름',
      address: '',
    }).expect(400);
    await call('entry', 'post', '/donors', { memberId: m.id, name: m.name, address: '' }).expect(
      201,
    );
    await call('entry', 'post', '/donors', { memberId: m.id, name: m.name, address: '' }).expect(
      400,
    );
  });
  it('requires recent authentication and production MFA; closed periods cannot receive offerings', async () => {
    const nodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await call('issuer', 'get', '/receipts').expect(403);
      await call('poster', 'get', '/offerings').expect(403);
    } finally {
      process.env.NODE_ENV = nodeEnv;
    }
    await db.session.updateMany({
      where: { userId: sessions.issuer!.id },
      data: { createdAt: new Date(Date.now() - 16 * 60000) },
    });
    const one = await db.donationReceipt.findFirstOrThrow({ where: { churchId: church } });
    await call('issuer', 'post', `/receipts/${one.id}/print`, {}).expect(401);
    await db.session.updateMany({
      where: { userId: sessions.issuer!.id },
      data: { createdAt: new Date() },
    });
    const id = await create();
    await call('reviewer', 'post', `/offerings/${id}/review`, { version: 1 }).expect(201);
    await db.financePeriod.update({ where: { id: period }, data: { closedAt: new Date() } });
    await call('poster', 'post', `/offerings/${id}/post`, { version: 2 }).expect(400);
    expect((await detail(id)).state).toBe('REVIEWED');
    expect((await detail(id)).journalId).toBeNull();
    await call('entry', 'post', '/offerings', draft()).expect(400);
  });
});
