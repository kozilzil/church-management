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
describe.skipIf(!enabled)('Budget approvals and spending controls', () => {
  let db: PrismaClient,
    control: PrismaClient,
    app: INestApplication,
    church: string,
    other: string,
    fund: string,
    secondFund: string,
    foreignFund: string;
  const accounts: Record<string, string> = {},
    sessions: Record<string, { id: string; cookie: string; csrf: string }> = {};
  const database = 'budget_control_test_' + randomUUID().replaceAll('-', ''),
    savedUrl = process.env.DATABASE_URL,
    origin = 'http://localhost:5173';
  const root = () => `/api/v1/churches/${church}/finance`;
  const qs = (q: object) => new URLSearchParams(Object.entries(q)).toString();
  function call(user: string, method: 'get' | 'post' | 'patch', path: string, body?: object) {
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
      approver: ['budget.read', 'budget.approve', 'expense.read', 'expense.approve'],
      payer: ['expense.read', 'expense.pay'],
      manager: ['finance.manage'],
      approveonly: ['budget.approve'],
      writer: ['budget.read', 'budget.write', 'budget.approve', 'expense.read', 'expense.write'],
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
    await db.financePeriod.create({
      data: {
        churchId: church,
        name: 'Synthetic 2020-2022',
        startsOn: new Date('2020-01-01'),
        endsOn: new Date('2022-12-31'),
      },
    });
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
  async function line(amount = '1000') {
    const account = (
      await db.financeAccount.create({
        data: {
          churchId: church,
          code: 'E' + randomUUID().slice(0, 8),
          name: '합성 통제 계정',
          kind: 'EXPENSE',
        },
      })
    ).id;
    if (amount !== 'none') await allocate(command({ accountId: account, amount }));
    return account;
  }
  const expenseBody = (accountId: string, extra: object = {}) => ({
    budgetYear: 2020,
    title: '합성 지출',
    purpose: '합성 용도',
    payee: '가상 수령인',
    amount: 600,
    accountId,
    fundId: fund,
    evidenceReference: 'SYNTHETIC',
    approverIds: [sessions.approver!.id],
    ...extra,
  });
  async function expense(accountId: string, extra: object = {}) {
    const r = await call('writer', 'post', '/expenses', expenseBody(accountId, extra)).expect(201);
    return r.body.id as string;
  }
  const version = async (id: string) =>
    (await db.expenseRequest.findUniqueOrThrow({ where: { id } })).version;
  const submit = async (id: string) =>
    call('writer', 'post', `/expenses/${id}/submit`, { version: await version(id) });
  const approve = async (id: string, decision = 'APPROVED') =>
    call('approver', 'post', `/expenses/${id}/decisions`, {
      version: await version(id),
      decision,
      reason: '합성 결재',
    });
  const pay = async (id: string, paidOn = '2020-01-01') =>
    call('payer', 'post', `/expenses/${id}/payment`, {
      version: await version(id),
      paidOn,
      accountId: accounts.A,
      method: 'BANK',
      reference: randomUUID(),
    });
  async function policy(mode: 'WARN' | 'BLOCK') {
    const r = await call('manager', 'get', '/budgets/control').expect(200);
    if (r.body.mode !== mode)
      await call('manager', 'post', '/budgets/control', {
        mode,
        version: r.body.version,
        reason: '합성 정책 변경',
      }).expect(201);
  }
  it('keeps proposals ineffective, requires independent authorized approval and applies exactly once under concurrency', async () => {
    const account = await line('none'),
      d = command({ accountId: account });
    const req = await call('writer', 'post', '/budgets/revisions', d).expect(201);
    expect((await summary()).items.find((x) => x.accountId === account)).toBeUndefined();
    await call('writer', 'post', `/budgets/changes/${req.body.id}/decision`, {
      decision: 'APPROVED',
      reason: '자기 승인',
    }).expect(403);
    await call('approveonly', 'post', `/budgets/changes/${req.body.id}/decision`, {
      decision: 'APPROVED',
      reason: '조회 권한 없음',
    }).expect(403);
    await call('reader', 'post', `/budgets/changes/${req.body.id}/decision`, {
      decision: 'APPROVED',
      reason: '승인 권한 없음',
    }).expect(403);
    await call('writer', 'post', '/budgets/revisions', d).expect(409);
    const rs = await Promise.all(
      [1, 2].map(() =>
        call('approver', 'post', `/budgets/changes/${req.body.id}/decision`, {
          decision: 'APPROVED',
          reason: '독립 승인',
        }),
      ),
    );
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await summary()).items.find((x) => x.accountId === account)).toMatchObject({
      budget: '1000',
      version: 1,
      committed: '0',
      available: '1000',
    });
    expect(await db.budgetRevision.count({ where: { changeId: req.body.id } })).toBe(1);
    await call('approver', 'post', `/budgets/changes/${randomUUID()}/decision`, {
      decision: 'APPROVED',
      reason: '없는 대상',
    }).expect(404);
  });
  it('preserves rejection and cancellation, permits a revised request and protects all history at the DB boundary', async () => {
    const account = await line('none'),
      d = command({ accountId: account });
    const first = await call('writer', 'post', '/budgets/revisions', d).expect(201);
    await call('approver', 'post', `/budgets/changes/${first.body.id}/cancel`, {
      reason: '타인 취소',
    }).expect(403);
    await call('approver', 'post', `/budgets/changes/${first.body.id}/decision`, {
      decision: 'REJECTED',
      reason: '합성 반려',
    }).expect(201);
    const second = await call('writer', 'post', '/budgets/revisions', d).expect(201);
    await call('writer', 'post', `/budgets/changes/${second.body.id}/cancel`, {
      reason: '합성 취소',
    }).expect(201);
    await allocate(d);
    const rows = await call('reader', 'get', '/budgets/changes?year=2020').expect(200);
    expect(
      rows.body.items
        .filter((r: { accountId: string }) => r.accountId === account)
        .map((r: { decision: { decision: string } }) => r.decision.decision),
    ).toEqual(['APPROVED', 'CANCELLED', 'REJECTED']);
    await expect(
      db.budgetChange.update({ where: { id: first.body.id }, data: { amount: 1 } }),
    ).rejects.toThrow();
    await expect(
      db.budgetDecision.delete({ where: { changeId: first.body.id } }),
    ).rejects.toThrow();
    const r = await db.budgetRevision.findFirstOrThrow({ where: { accountId: account } });
    await expect(
      db.budgetRevision.create({ data: { ...r, id: randomUUID(), changeId: null, version: 2 } }),
    ).rejects.toThrow();
    const pending = await call('writer', 'post', '/budgets/revisions', {
      ...d,
      version: 1,
      amount: '2000',
    }).expect(201);
    await expect(
      db.budgetDecision.create({
        data: {
          churchId: church,
          changeId: pending.body.id,
          decision: 'APPROVED',
          reason: '자기 승인',
          decidedBy: sessions.writer!.id,
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.budgetDecision.create({
        data: {
          churchId: church,
          changeId: pending.body.id,
          decision: 'APPROVED',
          reason: '원자 반영 누락',
          decidedBy: sessions.approver!.id,
        },
      }),
    ).rejects.toThrow();
    expect(await db.budgetDecision.count({ where: { changeId: pending.body.id } })).toBe(0);
  });
  it('reserves on submission and serializes competing requests so BLOCK cannot oversubscribe a line', async () => {
    await policy('BLOCK');
    const account = await line(),
      a = await expense(account),
      b = await expense(account);
    const rs = await Promise.all([submit(a), submit(b)]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(rs.find((r) => r.status === 409)!.body.error.code).toBe('BUDGET_BLOCKED');
    expect((await summary()).items.find((x) => x.accountId === account)).toMatchObject({
      actual: '0',
      committed: '600',
      available: '400',
    });
    const winner = rs[0]!.status === 201 ? a : b;
    expect((await approve(winner)).status).toBe(201);
    expect((await summary()).items.find((x) => x.accountId === account)?.committed).toBe('600');
    const missing = await expense(await line('none'));
    expect((await submit(missing)).status).toBe(409);
    const zero = await expense(await line('0'));
    expect((await submit(zero)).status).toBe(409);
    expect(await db.expenseSubmission.count({ where: { requestId: missing } })).toBe(0);
  });
  it('releases reservations on rejection/cancellation, resubmits with a new snapshot, and prevents cross-year payment', async () => {
    const account = await line(),
      id = await expense(account);
    expect((await submit(id)).status).toBe(201);
    expect((await approve(id, 'REJECTED')).status).toBe(201);
    expect((await summary()).items.find((x) => x.accountId === account)?.committed).toBe('0');
    await call('writer', 'patch', `/expenses/${id}`, {
      ...expenseBody(account, { amount: 1000 }),
      version: await version(id),
    }).expect(200);
    expect((await submit(id)).status).toBe(201);
    expect((await approve(id)).status).toBe(201);
    const wrongYear = await pay(id, '2021-01-01');
    expect(wrongYear.status).toBe(400);
    expect(await db.expensePayment.count({ where: { requestId: id } })).toBe(0);
    const snapshots = await db.expenseSubmission.findMany({
      where: { requestId: id },
      orderBy: { round: 'asc' },
    });
    expect(snapshots.map((x) => [x.budgetYear, x.amount.toFixed(0)])).toEqual([
      [2020, '600'],
      [2020, '1000'],
    ]);
    await call('writer', 'post', `/expenses/${id}/cancel`, {
      version: await version(id),
      reason: '합성 취소',
    }).expect(201);
    expect((await summary()).items.find((x) => x.accountId === account)?.committed).toBe('0');
  });
  it('atomically converts reservations to posted expenses at the exact limit without double-counting or duplicate payment', async () => {
    const account = await line(),
      a = await expense(account),
      b = await expense(account, { amount: 400 });
    expect((await submit(a)).status).toBe(201);
    expect((await submit(b)).status).toBe(201);
    expect((await approve(a)).status).toBe(201);
    expect((await approve(b)).status).toBe(201);
    const rs = await Promise.all([pay(a), pay(a)]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await summary()).items.find((x) => x.accountId === account)).toMatchObject({
      actual: '600',
      committed: '400',
      available: '0',
      remaining: '400',
    });
    expect((await pay(b)).status).toBe(201);
    expect((await summary()).items.find((x) => x.accountId === account)).toMatchObject({
      actual: '1000',
      committed: '0',
      available: '0',
    });
    expect((await submit(await expense(account, { amount: 1 }))).status).toBe(409);
  });
  it('rechecks reduced budgets during approval and payment and resumes only after an approved increase', async () => {
    const account = await line(),
      a = await expense(account, { amount: 400 }),
      b = await expense(account, { amount: 400 });
    expect((await submit(a)).status).toBe(201);
    expect((await submit(b)).status).toBe(201);
    expect((await approve(a)).status).toBe(201);
    await allocate(command({ accountId: account, version: 1, amount: '500' }));
    expect((await summary()).items.find((x) => x.accountId === account)).toMatchObject({
      status: 'EXCEEDED',
      committed: '800',
      available: '-300',
      actual: '0',
    });
    expect((await approve(b)).status).toBe(409);
    expect((await pay(a)).status).toBe(409);
    expect(await db.expensePayment.count({ where: { requestId: a } })).toBe(0);
    const change = await call(
      'writer',
      'post',
      '/budgets/revisions',
      command({ accountId: account, version: 2, amount: '1000' }),
    ).expect(201);
    expect((await pay(a)).status).toBe(409);
    await call('approver', 'post', `/budgets/changes/${change.body.id}/decision`, {
      decision: 'APPROVED',
      reason: '복구 승인',
    }).expect(201);
    expect((await approve(b)).status).toBe(201);
    expect((await pay(a)).status).toBe(201);
  });
  it('warns without leaking aggregate amounts to expense participants and preserves checks for each successful action', async () => {
    await policy('WARN');
    const account = await line('100'),
      id = await expense(account);
    const submitted = await submit(id);
    expect(submitted.status).toBe(201);
    expect(submitted.body.budgetCheck.status).toBe('EXCEEDED');
    const detail = await call('approver', 'get', `/expenses/${id}`).expect(200);
    expect(detail.body.budgetCheck).toMatchObject({ status: 'EXCEEDED', mode: 'WARN', year: 2020 });
    expect(Object.keys(detail.body.budgetCheck).sort()).toEqual([
      'budgetVersion',
      'mode',
      'policyVersion',
      'status',
      'year',
    ]);
    await call('payer', 'get', '/budgets?year=2020').expect(403);
    expect((await approve(id)).status).toBe(201);
    expect((await pay(id)).status).toBe(201);
    const checks = await db.expenseBudgetCheck.findMany({
      where: { requestId: id },
      orderBy: { createdAt: 'asc' },
    });
    expect(checks.map((x) => [x.action, x.status])).toEqual([
      ['SUBMIT', 'EXCEEDED'],
      ['APPROVE', 'EXCEEDED'],
      ['PAY', 'EXCEEDED'],
    ]);
    await expect(db.expenseBudgetCheck.delete({ where: { id: checks[0]!.id } })).rejects.toThrow();
    const audit = JSON.stringify(await db.auditEvent.findMany({ where: { churchId: church } }));
    expect(audit).toContain('expense.budget.warning');
    expect(audit).not.toContain('가상 수령인');
  });
  it('preserves legacy unknown years, blocks activation until resolved, and requires explicit years on new/edited requests', async () => {
    const account = await line(),
      id = await expense(account);
    await db.expenseRequest.update({ where: { id }, data: { budgetYear: null } });
    expect((await submit(id)).status).toBe(400);
    await call('writer', 'post', '/expenses', { ...expenseBody(account), budgetYear: null }).expect(
      400,
    );
    await call('writer', 'patch', `/expenses/${id}`, {
      ...expenseBody(account),
      version: await version(id),
    }).expect(200);
    expect((await submit(id)).status).toBe(201);
    // Simulate a pre-migration in-flight row; no intended year can be inferred from creation time.
    await db.expenseRequest.update({ where: { id }, data: { budgetYear: null } });
    const p = await call('manager', 'get', '/budgets/control').expect(200);
    expect(p.body.legacyPending).toBe(1);
    await call('manager', 'post', '/budgets/control', {
      mode: 'BLOCK',
      version: p.body.version,
      reason: '미정리 전환',
    }).expect(400);
    const decision = await approve(id);
    expect(decision.status).toBe(201);
    expect(decision.body.budgetCheck.status).toBe('LEGACY_YEAR');
    expect((await pay(id)).status).toBe(201);
    await policy('BLOCK');
  });
  it('enforces control privileges, CSRF, optimistic versions, tenant scope, recent authentication and production MFA', async () => {
    await call('reader', 'get', '/budgets/control').expect(403);
    const p = await call('manager', 'get', '/budgets/control').expect(200);
    await call('manager', 'post', '/budgets/control', {
      mode: 'WARN',
      version: 0,
      reason: '오래된 설정',
    }).expect(409);
    await request(app.getHttpServer())
      .post(root() + '/budgets/control')
      .set('Cookie', sessions.manager!.cookie)
      .set('Origin', origin)
      .send({ mode: 'WARN', version: p.body.version, reason: 'CSRF 없음' })
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/churches/${other}/finance/budgets/changes?year=2020`)
      .set('Cookie', sessions.approver!.cookie)
      .expect(403);
    await call(
      'reader',
      'get',
      '/budgets/changes?' + qs({ year: 2020, fundId: foreignFund }),
    ).expect(404);
    expect(
      (await call('reader', 'get', '/budgets/changes?' + qs({ year: 2020, fundId: secondFund })))
        .body.items,
    ).toEqual([]);
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await call('approver', 'get', '/budgets?year=2020').expect(403);
      await call('manager', 'get', '/budgets/control').expect(403);
    } finally {
      process.env.NODE_ENV = saved;
    }
    await db.session.updateMany({
      where: { userId: sessions.manager!.id },
      data: { createdAt: new Date(Date.now() - 16 * 60000) },
    });
    try {
      await call('manager', 'post', '/budgets/control', {
        mode: 'WARN',
        version: p.body.version,
        reason: '오래된 인증',
      }).expect(401);
    } finally {
      await db.session.updateMany({
        where: { userId: sessions.manager!.id },
        data: { createdAt: new Date() },
      });
    }
    const row = await db.budgetPolicyRevision.findFirstOrThrow({ where: { churchId: church } });
    await expect(
      db.budgetPolicyRevision.update({ where: { id: row.id }, data: { mode: 'WARN' } }),
    ).rejects.toThrow();
  });
  it('paginates approval history without losing rows whose DB timestamps differ only by microseconds', async () => {
    const expected: string[] = [];
    for (let i = 0; i < 32; i++) {
      const account = await line('none'),
        id = randomUUID();
      expected.unshift(id);
      await db.$executeRaw`INSERT INTO budget_change(id,church_id,year,account_id,fund_id,base_version,amount,reason,requested_by,created_at)
        VALUES (${id}::uuid,${church}::uuid,2044,${account}::uuid,${fund}::uuid,0,100,'합성 페이지',${sessions.writer!.id}::uuid,
          TIMESTAMPTZ '2044-01-01 00:00:00.000001+00' + ${i}::integer * INTERVAL '1 microsecond')`;
    }
    const first = await call('reader', 'get', '/budgets/changes?year=2044').expect(200);
    expect(first.body.items.map((x: { id: string }) => x.id)).toEqual(expected.slice(0, 30));
    const second = await call(
      'reader',
      'get',
      `/budgets/changes?year=2044&cursor=${first.body.nextCursor}`,
    ).expect(200);
    expect(second.body.items.map((x: { id: string }) => x.id)).toEqual(expected.slice(30));
    expect(second.body.nextCursor).toBeNull();
  });
});
