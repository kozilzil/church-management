import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import type { AnnualBudget } from '@church/contracts';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApplication } from '../src/platform/app.factory';
import { hashPassword } from '../src/modules/identity/infrastructure/password';
const enabled = process.env.RUN_DB_TESTS === '1';
describe.skipIf(!enabled)('Annual budgets', () => {
  let db: PrismaClient,
    control: PrismaClient,
    app: INestApplication,
    church: string,
    other: string,
    period: string,
    fund: string,
    secondFund: string,
    foreignFund: string;
  const accounts: Record<string, string> = {},
    sessions: Record<string, { id: string; cookie: string; csrf: string }> = {};
  const database = 'budget_test_' + randomUUID().replaceAll('-', ''),
    savedUrl = process.env.DATABASE_URL,
    origin = 'http://localhost:5173';
  const root = () => `/api/v1/churches/${church}/finance`;
  const qs = (q: object) => new URLSearchParams(Object.entries(q)).toString();
  function call(user: string, method: 'get' | 'post', path: string, body?: object) {
    const s = sessions[user]!,
      client = request(app.getHttpServer()),
      r = client[method](root() + path)
        .set('Cookie', s.cookie)
        .set('Origin', origin)
        .set('x-csrf-token', s.csrf);
    return body ? r.send(body) : r;
  }
  const command = (extra: object = {}) => ({
    year: 2020,
    accountId: accounts.E1!,
    fundId: fund,
    version: 0,
    amount: '1000',
    reason: '합성 예산 편성 사유',
    ...extra,
  });
  async function allocate(d: object) {
    const change = await call('writer', 'post', '/budgets/revisions', d).expect(201);
    const decision = await call('approver', 'post', `/budgets/changes/${change.body.id}/decision`, {
      decision: 'APPROVED',
      reason: '합성 독립 승인',
    }).expect(201);
    return { body: { id: decision.body.revisionId, version: decision.body.version } };
  }
  async function summary(year = 2020, fundId?: string): Promise<AnnualBudget> {
    const r = await call(
      'reader',
      'get',
      '/budgets?' + qs({ year, ...(fundId ? { fundId } : {}) }),
    );
    expect(r.status, r.text).toBe(200);
    expect(r.headers['cache-control']).toContain('no-store');
    return r.body;
  }
  async function post(
    date: string,
    debit: string,
    credit: string,
    amount: string,
    f = fund,
    reversalOf?: string,
  ) {
    return db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${church},0))`;
      return tx.journalEntry.create({
        data: {
          churchId: church,
          periodId: period,
          postedOn: new Date(date),
          postedBy: sessions.writer!.id,
          description: 'SYNTHETIC PRIVATE PAYEE',
          reversalOf: reversalOf ?? null,
          lines: {
            create: [
              { accountId: accounts[debit]!, fundId: f, debit: amount },
              { accountId: accounts[credit]!, fundId: f, credit: amount },
            ],
          },
        },
      });
    });
  }
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
    church = (await db.church.create({ data: { name: 'Synthetic Budget Church' } })).id;
    other = (await db.church.create({ data: { name: 'Other Budget Church' } })).id;
    const roles: Record<string, string[]> = {
      reader: ['budget.read'],
      approver: ['budget.read', 'budget.approve'],
      writer: ['budget.read', 'budget.write', 'expense.read', 'expense.write'],
      writeonly: ['budget.write'],
      outsider: ['finance.manage', 'finance.report', 'finance.readall'],
    };
    await db.permission.createMany({
      data: [...new Set(Object.values(roles).flat())].map((code) => ({ code })),
      skipDuplicates: true,
    });
    const hash = await hashPassword('Synthetic-budget-1234');
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
    for (const [code, kind] of [
      ['E1', 'EXPENSE'],
      ['E2', 'EXPENSE'],
      ['E3', 'EXPENSE'],
      ['A', 'ASSET'],
      ['R', 'REVENUE'],
    ])
      accounts[code!] = (
        await db.financeAccount.create({
          data: { churchId: church, code: code!, name: code!, kind: kind! },
        })
      ).id;
    fund = (await db.financeFund.create({ data: { churchId: church, name: '일반' } })).id;
    secondFund = (await db.financeFund.create({ data: { churchId: church, name: '선교' } })).id;
    foreignFund = (
      await db.financeFund.create({ data: { churchId: other, name: 'FOREIGN SECRET' } })
    ).id;
    period = (
      await db.financePeriod.create({
        data: {
          churchId: church,
          name: 'Synthetic 2020-2022',
          startsOn: new Date('2020-01-01'),
          endsOn: new Date('2022-12-31'),
        },
      })
    ).id;
    app = await createApplication();
    await app.init();
    for (const [name, s] of Object.entries(sessions)) {
      const r = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .send({ churchId: church, username: name, password: 'Synthetic-budget-1234' });
      expect(r.status, r.text).toBe(201);
      s.cookie = String(r.headers['set-cookie']![0]).split(';')[0]!;
      s.csrf = r.body.csrfToken;
    }
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
  it('checks independent read/write rights, tenant boundaries, integer amounts, expense accounts and CSRF', async () => {
    await call('outsider', 'get', '/budgets?year=2020').expect(403);
    await call('reader', 'post', '/budgets/revisions', command()).expect(403);
    await call('writeonly', 'post', '/budgets/revisions', command()).expect(403);
    await request(app.getHttpServer())
      .post(root() + '/budgets/revisions')
      .set('Cookie', sessions.writer!.cookie)
      .set('Origin', origin)
      .send(command())
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/churches/${other}/finance/budgets?year=2020`)
      .set('Cookie', sessions.reader!.cookie)
      .expect(403);
    await call('reader', 'get', '/budgets?' + qs({ year: 2020, fundId: foreignFund })).expect(404);
    for (const extra of [
      { amount: '-1' },
      { amount: '1.5' },
      { amount: '1e3' },
      { amount: 1000 },
      { amount: '01' },
      { amount: '1000000000000000' },
      { reason: ' ' },
      { year: 1899 },
      { year: 10000 },
      { year: 2020.5 },
      { version: -1 },
      { unexpected: 'field' },
    ])
      await call('writer', 'post', '/budgets/revisions', command(extra)).expect(400);
    for (const extra of [
      { fundId: foreignFund },
      { accountId: accounts.A },
      { accountId: accounts.R },
    ])
      await call('writer', 'post', '/budgets/revisions', command(extra)).expect(404);
    const defs = await call('reader', 'get', '/budgets/definitions').expect(200);
    expect(defs.body.accounts.map((a: { id: string }) => a.id).sort()).toEqual(
      [accounts.E1, accounts.E2, accounts.E3].sort(),
    );
    for (const path of [
      '/budgets?year=2020&unknown=1',
      '/budgets?year=2020.5',
      '/budgets?year=not-year',
      '/budgets/history?' +
        qs({ year: 2020, accountId: accounts.E1!, fundId: fund, beforeVersion: 0 }),
    ])
      await call('reader', 'get', path).expect(400);
    await call(
      'reader',
      'get',
      '/budgets/history?' + qs({ year: 2020, accountId: accounts.E1!, fundId: foreignFund }),
    ).expect(404);
    expect((await summary(2030)).items).toEqual([]);
  });
  it('appends budget revisions atomically, rejects stale edits and preserves the original amount and reason', async () => {
    const first = await allocate(command());
    const changed = command({ version: 1, amount: '1500', reason: '합성 증액 사유' });
    const rs = await Promise.all([
      call('writer', 'post', '/budgets/revisions', changed),
      call('writer', 'post', '/budgets/revisions', changed),
    ]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    const pending = rs.find((r) => r.status === 201)!;
    await call('approver', 'post', `/budgets/changes/${pending.body.id}/decision`, {
      decision: 'APPROVED',
      reason: '합성 승인',
    }).expect(201);
    await call(
      'writer',
      'post',
      '/budgets/revisions',
      command({ version: 2, amount: '1500' }),
    ).expect(400);
    const r = await summary();
    expect(r.items[0]).toMatchObject({
      budget: '1500',
      version: 2,
      actual: '0',
      remaining: '1500',
      executionRate: '0.00',
    });
    const history = await call(
      'reader',
      'get',
      '/budgets/history?' + qs({ year: 2020, accountId: accounts.E1!, fundId: fund }),
    ).expect(200);
    expect(
      history.body.items.map((h: { amount: string; version: number }) => [h.version, h.amount]),
    ).toEqual([
      [2, '1500'],
      [1, '1000'],
    ]);
    expect(history.body.items[1].id).toBe(first.body.id);
    expect(history.body.items[0].createdByName).toBe('writer');
    const audit = JSON.stringify(await db.auditEvent.findMany({ where: { churchId: church } }));
    expect(audit).toContain('budget.request');
    expect(audit).toContain('budget.approved');
    expect(audit).toContain('budget.history');
    expect(audit).not.toContain('합성 예산 편성 사유');
    expect(audit).not.toContain('합성 증액 사유');
  });
  it('compares current annual allocations to posted expenses, includes unallocated and zero-budget spending, and dates reversals by year', async () => {
    const original = await post('2020-01-01', 'E1', 'A', '1000');
    await post('2021-01-01', 'A', 'E1', '1000', fund, original.id);
    await post('2020-12-31', 'E2', 'A', '300');
    await post('2020-02-29', 'E3', 'A', '50', secondFund);
    await post('2020-06-01', 'A', 'R', '9999');
    await allocate(command({ accountId: accounts.E3, fundId: secondFund, amount: '0' }));
    await call('writer', 'post', '/expenses', {
      budgetYear: 2020,
      title: '가상 미지급 요청',
      purpose: '가상 목적',
      payee: '합성 상점',
      amount: 7777,
      accountId: accounts.E1!,
      fundId: fund,
      evidenceReference: 'SYNTHETIC',
      approverIds: [],
    }).expect(201);
    const r = await summary();
    expect(r.totals).toEqual({
      budget: '1500',
      actual: '1350',
      remaining: '150',
      executionRate: '90.00',
    });
    expect(r.unbudgetedCount).toBe(1);
    expect(r.overBudgetCount).toBe(1);
    expect(r.items.find((x) => x.accountId === accounts.E2)).toMatchObject({
      budget: null,
      actual: '300',
      remaining: null,
      executionRate: null,
      status: 'UNBUDGETED',
      version: 0,
    });
    expect(r.items.find((x) => x.accountId === accounts.E3)).toMatchObject({
      budget: '0',
      actual: '50',
      remaining: '-50',
      executionRate: null,
      status: 'EXCEEDED',
    });
    expect((await summary(2020, secondFund)).totals).toMatchObject({
      budget: '0',
      actual: '50',
      remaining: '-50',
      executionRate: null,
    });
    await allocate(command({ year: 2021, amount: '2000' }));
    expect((await summary(2021)).items[0]).toMatchObject({
      budget: '2000',
      actual: '-1000',
      remaining: '3000',
      executionRate: '-50.00',
      status: 'WITHIN',
    });
    expect(JSON.stringify(r)).not.toContain('SYNTHETIC PRIVATE PAYEE');
    expect(JSON.stringify(r)).not.toContain('FOREIGN SECRET');
  });
  it('uses exact totals above JS safe integer range and never alters journal entries when revising budgets', async () => {
    for (let i = 0; i < 10; i++) {
      const code = 'LARGE' + i;
      accounts[code] = (
        await db.financeAccount.create({
          data: { churchId: church, code, name: code, kind: 'EXPENSE' },
        })
      ).id;
      await allocate(command({ year: 2022, accountId: accounts[code], amount: '999999999999999' }));
      await post('2022-12-31', code, 'A', '999999999999999');
    }
    const r = await summary(2022);
    expect(r.totals).toEqual({
      budget: '9999999999999990',
      actual: '9999999999999990',
      remaining: '0',
      executionRate: '100.00',
    });
    const count = await db.journalEntry.count();
    await allocate(
      command({
        year: 2022,
        accountId: accounts.LARGE0,
        amount: '0',
        version: 1,
        reason: '합성 예산 철회',
      }),
    );
    const changed = await summary(2022);
    expect(changed.totals.actual).toBe(r.totals.actual);
    expect(changed.overBudgetCount).toBe(1);
    expect(await db.journalEntry.count()).toBe(count);
  });
  it('paginates append-only history without mixing new revisions into older pages', async () => {
    for (let version = 0; version < 32; version++)
      await allocate(command({ year: 2030, version, amount: String(version) }));
    const q = { year: 2030, accountId: accounts.E1!, fundId: fund };
    const first = await call('reader', 'get', '/budgets/history?' + qs(q)).expect(200);
    expect(first.body.items).toHaveLength(30);
    expect(first.body.nextBeforeVersion).toBe(3);
    await allocate(command({ year: 2030, version: 32, amount: '32' }));
    const next = await call(
      'reader',
      'get',
      '/budgets/history?' + qs({ ...q, beforeVersion: first.body.nextBeforeVersion }),
    ).expect(200);
    expect(next.body.items.map((x: { version: number }) => x.version)).toEqual([2, 1]);
    expect(next.body.nextBeforeVersion).toBeNull();
  });
  it('enforces append-only, tenant, sequence, expense-account and nonnegative-amount constraints in the database', async () => {
    const row = await db.budgetRevision.findFirstOrThrow({
      where: { churchId: church, year: 2020, accountId: accounts.E1!, fundId: fund },
      orderBy: { version: 'desc' },
    });
    await expect(
      db.budgetRevision.update({ where: { id: row.id }, data: { amount: 1 } }),
    ).rejects.toThrow();
    await expect(db.budgetRevision.delete({ where: { id: row.id } })).rejects.toThrow();
    for (const extra of [
      { version: 9 },
      { fundId: foreignFund, version: 1 },
      { accountId: accounts.R!, version: 1 },
      { amount: -1 },
      { year: 1899, version: 1 },
      { reason: ' ' },
    ])
      await expect(
        db.budgetRevision.create({
          data: { ...row, id: randomUUID(), version: row.version + 1, ...extra },
        }),
      ).rejects.toThrow();
    expect(await db.budgetRevision.count({ where: { churchId: other } })).toBe(0);
  });
  it('supports the runtime role without update/delete privileges and requires recent authentication and production MFA', async () => {
    const role = 'budget_runtime_' + randomUUID().replaceAll('-', '');
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE ROLE "${role}"`);
      await tx.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`);
      await tx.$executeRawUnsafe(
        `GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO "${role}"`,
      );
      await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
      const change = await tx.budgetChange.create({
        data: {
          churchId: church,
          year: 2035,
          accountId: accounts.E1!,
          fundId: fund,
          amount: 100,
          reason: '합성 운영 권한',
          baseVersion: 0,
          requestedBy: sessions.writer!.id,
        },
      });
      await tx.budgetDecision.create({
        data: {
          churchId: church,
          changeId: change.id,
          decision: 'APPROVED',
          reason: '합성 승인',
          decidedBy: sessions.approver!.id,
        },
      });
      await tx.budgetRevision.create({
        data: {
          changeId: change.id,
          churchId: church,
          year: 2035,
          accountId: accounts.E1!,
          fundId: fund,
          amount: 100,
          reason: '합성 운영 권한',
          version: 1,
          createdBy: sessions.writer!.id,
        },
      });
      await tx.$executeRawUnsafe('RESET ROLE');
      await tx.$executeRawUnsafe(`DROP OWNED BY "${role}"`);
      await tx.$executeRawUnsafe(`DROP ROLE "${role}"`);
    });
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await call('writer', 'post', '/budgets/revisions', command({ year: 2040 })).expect(403);
    } finally {
      process.env.NODE_ENV = env;
    }
    await db.session.updateMany({
      where: { userId: sessions.writer!.id },
      data: { createdAt: new Date(Date.now() - 16 * 60000) },
    });
    try {
      await call('writer', 'post', '/budgets/revisions', command({ year: 2040 })).expect(401);
    } finally {
      await db.session.updateMany({
        where: { userId: sessions.writer!.id },
        data: { createdAt: new Date() },
      });
    }
  });
  it('continues reading closed-period actuals and records later budget corrections independently', async () => {
    const before = await summary();
    await db.financePeriod.update({ where: { id: period }, data: { closedAt: new Date() } });
    await allocate(command({ version: 2, amount: '2000', reason: '마감 후 예산 자료 정정' }));
    const after = await summary();
    expect(after.totals.actual).toBe(before.totals.actual);
    expect(after.totals.budget).toBe('2000');
    expect(after.items.find((x) => x.accountId === accounts.E1)?.version).toBe(3);
  });
});
