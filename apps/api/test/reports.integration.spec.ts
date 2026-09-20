import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import type { FinancialReport, ReportLine } from '@church/contracts';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApplication } from '../src/platform/app.factory';
import { hashPassword } from '../src/modules/identity/infrastructure/password';
const enabled = process.env.RUN_DB_TESTS === '1';
describe.skipIf(!enabled)('Monthly financial reports', () => {
  let db: PrismaClient,
    control: PrismaClient,
    app: INestApplication,
    church: string,
    other: string,
    period: string,
    fund: string,
    secondFund: string,
    emptyFund: string,
    foreignFund: string,
    storage: string;
  const accounts: Record<string, string> = {};
  const database = 'report_test_' + randomUUID().replaceAll('-', ''),
    savedUrl = process.env.DATABASE_URL,
    savedUpload = process.env.UPLOAD_DIR,
    origin = 'http://localhost:5173';
  const sessions: Record<string, { id: string; cookie: string; csrf: string }> = {};
  const base = () => `/api/v1/churches/${church}/finance`;
  const query = (q: object) => new URLSearchParams(Object.entries(q)).toString();
  function call(user: string, method: 'get' | 'post', path: string, body?: object) {
    const s = sessions[user]!,
      client = request(app.getHttpServer()),
      r = client[method](base() + path)
        .set('Cookie', s.cookie)
        .set('Origin', origin)
        .set('x-csrf-token', s.csrf);
    return body ? r.send(body) : r;
  }
  async function report(
    from = '2020-02-01',
    to = '2020-03-31',
    fundId?: string,
  ): Promise<FinancialReport> {
    const r = await call(
      'reader',
      'get',
      '/reports?' + query({ from, to, ...(fundId ? { fundId } : {}) }),
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
          description: 'SYNTHETIC PRIVATE MEMO',
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
    storage = await mkdtemp(join(tmpdir(), 'church-report-'));
    process.env.UPLOAD_DIR = storage;
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      env: process.env,
      stdio: 'pipe',
    });
    db = new PrismaClient();
    church = (await db.church.create({ data: { name: 'Synthetic Report Church' } })).id;
    other = (await db.church.create({ data: { name: 'Other Report Church' } })).id;
    const roles: Record<string, string[]> = {
      reader: ['finance.report'],
      ledger: ['finance.report', 'finance.readall'],
      exporter: ['finance.report', 'finance.export'],
      exportonly: ['finance.export'],
      outsider: ['membership.read'],
      full: ['finance.report', 'finance.readall', 'offering.read', 'expense.read'],
      writer: ['offering.read', 'offering.write', 'expense.read', 'expense.write'],
      reviewer: ['offering.read', 'offering.review', 'expense.read', 'expense.approve'],
      poster: [
        'offering.read',
        'offering.post',
        'offering.reverse',
        'expense.read',
        'expense.pay',
        'finance.reverse',
      ],
    };
    const hash = await hashPassword('Synthetic-report-1234');
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
    for (const [code, kind] of [
      ['A', 'ASSET'],
      ['B', 'ASSET'],
      ['R', 'REVENUE'],
      ['E', 'EXPENSE'],
      ['L', 'LIABILITY'],
    ])
      accounts[code!] = (
        await db.financeAccount.create({
          data: {
            churchId: church,
            code: code!,
            kind: kind!,
            name: code === 'R' ? '=HYPERLINK("synthetic")' : code!,
          },
        })
      ).id;
    fund = (await db.financeFund.create({ data: { churchId: church, name: '일반' } })).id;
    secondFund = (await db.financeFund.create({ data: { churchId: church, name: '선교' } })).id;
    emptyFund = (await db.financeFund.create({ data: { churchId: church, name: '미사용' } })).id;
    foreignFund = (
      await db.financeFund.create({ data: { churchId: other, name: 'FOREIGN SECRET' } })
    ).id;
    period = (
      await db.financePeriod.create({
        data: {
          churchId: church,
          name: 'Synthetic 2020-2023',
          startsOn: new Date('2020-01-01'),
          endsOn: new Date('2023-12-31'),
        },
      })
    ).id;
    app = await createApplication();
    await app.init();
    for (const [name, s] of Object.entries(sessions)) {
      const r = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .send({ churchId: church, username: name, password: 'Synthetic-report-1234' });
      expect(r.status, r.text).toBe(201);
      s.cookie = String(r.headers['set-cookie']![0]).split(';')[0]!;
      s.csrf = r.body.csrfToken;
    }
    await post('2020-01-31', 'A', 'R', '1000');
    const income = await post('2020-02-01', 'A', 'R', '500');
    await post('2020-02-29', 'E', 'A', '120');
    await post('2020-02-20', 'A', 'L', '300');
    await post('2020-02-22', 'B', 'A', '50');
    await post('2020-02-29', 'A', 'R', '200', secondFund);
    await post('2020-03-01', 'R', 'A', '500', fund, income.id);
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
    if (savedUpload) process.env.UPLOAD_DIR = savedUpload;
    else delete process.env.UPLOAD_DIR;
    if (storage) await rm(storage, { recursive: true, force: true });
  }, 30000);
  it('reconciles opening, monthly income/expense, asset transfers, borrowing, funds and dated reversals', async () => {
    const r = await report();
    expect(r.totals).toEqual({
      income: '200',
      expense: '120',
      net: '80',
      openingAssets: '1000',
      assetMovement: '380',
      closingAssets: '1380',
    });
    expect(
      r.months.map((m) => [
        m.month,
        m.income,
        m.expense,
        m.openingAssets,
        m.assetMovement,
        m.closingAssets,
      ]),
    ).toEqual([
      ['2020-02', '700', '120', '1000', '880', '1880'],
      ['2020-03', '-500', '0', '1880', '-500', '1380'],
    ]);
    expect((await report('2020-02-01', '2020-03-31', fund)).totals.closingAssets).toBe('1180');
    expect((await report('2020-02-01', '2020-03-31', secondFund)).totals.income).toBe('200');
    expect((await report('2020-02-29', '2020-02-29')).totals).toMatchObject({
      income: '200',
      expense: '120',
      openingAssets: '1800',
      closingAssets: '1880',
    });
    expect(r.accounts.find((a) => a.accountId === accounts.R && a.fundId === fund)).toMatchObject({
      opening: '1000',
      debit: '500',
      credit: '500',
      closing: '1000',
    });
    expect(r.accounts.find((a) => a.accountId === accounts.L)).toMatchObject({
      opening: '0',
      credit: '300',
      closing: '300',
    });
    expect(r.accounts.reduce((n, a) => n + BigInt(a.debit) - BigInt(a.credit), 0n)).toBe(0n);
    const empty = await report('2020-02-01', '2020-03-31', emptyFund);
    expect(empty.accounts).toEqual([]);
    expect(empty.totals.closingAssets).toBe('0');
    expect(empty.months).toHaveLength(2);
    expect(JSON.stringify(r)).not.toContain('SYNTHETIC PRIVATE MEMO');
    expect(JSON.stringify(r)).not.toContain('FOREIGN SECRET');
  });
  it('rejects invalid dates, excessive ranges, unknown fields and cross-church access', async () => {
    for (const q of [
      { from: '2020-02-30', to: '2020-03-01' },
      { from: '2020-03-01', to: '2020-02-01' },
      { from: '2020-01-01', to: '2021-01-01' },
      { from: '1899-01-01', to: '1899-01-31' },
      { from: '2020-01-01', to: '2020-02-01', name: 'secret' },
    ])
      await call('reader', 'get', '/reports?' + query(q)).expect(400);
    await call(
      'reader',
      'get',
      '/reports?' + query({ from: '2020-01-01', to: '2020-12-31', fundId: foreignFund }),
    ).expect(404);
    const r = await report();
    await call(
      'reader',
      'get',
      '/reports/lines?' + query({ ...r.selection, accountId: accounts.A }),
    ).expect(403);
    await call('outsider', 'get', '/reports?' + query(r.selection)).expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/churches/${other}/finance/reports?from=2020-01-01&to=2020-02-01`)
      .set('Cookie', sessions.reader!.cookie)
      .expect(403);
    await call(
      'ledger',
      'get',
      '/reports/lines?' + query({ ...r.selection, accountId: randomUUID() }),
    ).expect(404);
    for (const ledgerVersion of ['-1', '9999999999999999999', '1e5'])
      await call(
        'ledger',
        'get',
        '/reports/lines?' + query({ ...r.selection, accountId: accounts.A, ledgerVersion }),
      ).expect(400);
    await call(
      'ledger',
      'get',
      '/reports/lines?' + query({ ...r.selection, accountId: accounts.A, cursor: randomUUID() }),
    ).expect(400);
  });
  it('keeps paginated detail and exports on the displayed ledger version after backdated postings', async () => {
    for (let i = 0; i < 55; i++) await post('2021-02-01', 'A', 'R', '1');
    const r = await report('2021-02-01', '2021-02-28');
    const q = { ...r.selection, accountId: accounts.A, fundId: fund };
    const first = await call('ledger', 'get', '/reports/lines?' + query(q)).expect(200);
    expect(first.body.items).toHaveLength(50);
    expect(first.body.nextCursor).toBeTruthy();
    await post('2021-02-01', 'A', 'R', '999');
    const next = await call(
      'ledger',
      'get',
      '/reports/lines?' + query({ ...q, cursor: first.body.nextCursor }),
    ).expect(200);
    expect(next.body.items).toHaveLength(5);
    expect(next.body.nextCursor).toBeNull();
    const all: ReportLine[] = [...first.body.items, ...next.body.items];
    expect(new Set(all.map((x) => x.id)).size).toBe(55);
    expect(all.reduce((n, l) => n + BigInt(l.debit), 0n)).toBe(55n);
    expect((await report('2021-02-01', '2021-02-28')).totals.income).toBe('1054');
    const csv = await call('exporter', 'post', '/reports/export', r.selection).expect(201);
    expect(csv.body.csv).toContain('"55"');
    expect(csv.body.csv).not.toContain('"1054"');
  });
  it('preserves exact aggregate amounts beyond Number.MAX_SAFE_INTEGER', async () => {
    for (let i = 0; i < 10; i++) await post('2022-06-01', 'A', 'R', '999999999999999');
    const r = await report('2022-06-01', '2022-06-30');
    expect(r.totals.income).toBe('9999999999999990');
    expect(r.accounts.find((x) => x.accountId === accounts.A && x.fundId === fund)?.debit).toBe(
      '9999999999999990',
    );
    const csv = await call('exporter', 'post', '/reports/export', r.selection).expect(201);
    expect(csv.body.csv).toContain('"9999999999999990"');
  });
  it('exports only aggregates, neutralizes spreadsheet formulas and checks CSRF, permissions, reauthentication and MFA', async () => {
    const r = await report();
    for (const user of ['reader', 'ledger', 'exportonly'])
      await call(user, 'post', '/reports/export', r.selection).expect(403);
    await request(app.getHttpServer())
      .post(base() + '/reports/export')
      .set('Cookie', sessions.exporter!.cookie)
      .set('Origin', origin)
      .send(r.selection)
      .expect(403);
    const csv = await call('exporter', 'post', '/reports/export', r.selection).expect(201);
    expect(csv.body.csv).toContain("'=HYPERLINK");
    expect(csv.body.csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.body.csv).toContain('\r\n');
    expect(csv.body.csv).not.toContain('SYNTHETIC PRIVATE MEMO');
    await db.session.updateMany({
      where: { userId: sessions.exporter!.id },
      data: { createdAt: new Date(Date.now() - 16 * 60000) },
    });
    try {
      await call('exporter', 'post', '/reports/export', r.selection).expect(401);
    } finally {
      await db.session.updateMany({
        where: { userId: sessions.exporter!.id },
        data: { createdAt: new Date() },
      });
    }
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await call('exporter', 'post', '/reports/export', r.selection).expect(403);
    } finally {
      process.env.NODE_ENV = env;
    }
    const audits = JSON.stringify(await db.auditEvent.findMany({ where: { churchId: church } }));
    expect(audits).toContain('finance.report.export');
    expect(audits).toContain('finance.report.read');
    expect(audits).toContain('finance.report.lines');
    expect(audits).not.toContain('SYNTHETIC PRIVATE MEMO');
    expect(audits).not.toContain('HYPERLINK');
  });
  it('links posted and reversed offerings and paid expense evidence only for authorized source readers', async () => {
    const type = await db.offeringType.create({
      data: {
        churchId: church,
        name: '가상 헌금',
        revenueAccountId: accounts.R!,
        fundId: fund,
        receiptEligible: true,
      },
    });
    const d = {
      typeId: type.id,
      assetAccountId: accounts.A,
      givenOn: '2023-01-01',
      amount: 123,
      reference: 'SYNTHETIC-OFFERING',
      source: 'CASH',
    };
    const offering = (await call('writer', 'post', '/offerings', d).expect(201)).body.id;
    await call('writer', 'post', '/offerings', { ...d, reference: 'UNPOSTED', amount: 777 }).expect(
      201,
    );
    await call('reviewer', 'post', `/offerings/${offering}/review`, { version: 1 }).expect(201);
    await call('poster', 'post', `/offerings/${offering}/post`, { version: 2 }).expect(201);
    await call('poster', 'post', `/offerings/${offering}/reverse`, {
      postedOn: '2023-01-02',
      reason: '합성 정정',
    }).expect(201);
    const expense = (
      await call('writer', 'post', '/expenses', {
        budgetYear: 2023,
        title: '합성 지출',
        purpose: '합성 목적',
        payee: '합성 수령인',
        amount: 20,
        accountId: accounts.E,
        fundId: fund,
        evidenceReference: 'TEST',
        approverIds: [sessions.reviewer!.id],
      }).expect(201)
    ).body.id;
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jFeQAAAAASUVORK5CYII=',
      'base64',
    );
    const upload = await call('writer', 'post', `/expenses/${expense}/attachments?version=1`)
      .attach('file', png, { filename: 'synthetic.png', contentType: 'image/png' })
      .expect(201);
    const fileId = upload.body.id;
    await call('writer', 'post', `/expenses/${expense}/submit`, { version: 2 }).expect(201);
    await call('reviewer', 'post', `/expenses/${expense}/decisions`, {
      version: 3,
      decision: 'APPROVED',
      reason: '합성 검토',
    }).expect(201);
    await call('poster', 'post', `/expenses/${expense}/payment`, {
      version: 4,
      paidOn: '2023-01-03',
      method: 'BANK',
      reference: 'SYNTHETIC-PAY',
      accountId: accounts.A,
    }).expect(201);
    const r = await report('2023-01-01', '2023-01-31');
    expect(r.totals).toMatchObject({ income: '0', expense: '20' });
    const q = { ...r.selection, accountId: accounts.A, fundId: fund };
    const lines = await call('full', 'get', '/reports/lines?' + query(q)).expect(200);
    expect(lines.body.items.map((l: ReportLine) => l.source)).toEqual([
      { kind: 'offering', id: offering },
      { kind: 'offering', id: offering },
      { kind: 'expense', id: expense },
    ]);
    expect(lines.body.items[1].reversalOf).toBeTruthy();
    const privateLines = await call('ledger', 'get', '/reports/lines?' + query(q)).expect(200);
    expect(privateLines.body.items.every((l: ReportLine) => l.source === null)).toBe(true);
    const detail = await call('full', 'get', `/expenses/${expense}`).expect(200);
    expect(detail.body.attachments).toHaveLength(1);
    await call('full', 'get', `/expenses/${expense}/attachments/${fileId}`).expect(200);
    await call('reader', 'get', `/expenses/${expense}/attachments/${fileId}`).expect(403);
  });
  it('continues to report a closed accounting period without modifying its ledger', async () => {
    const before = await report();
    await db.financePeriod.update({ where: { id: period }, data: { closedAt: new Date() } });
    const after = await report();
    expect(after.totals).toEqual(before.totals);
    expect(after.selection.ledgerVersion).toBe(before.selection.ledgerVersion);
  });
});
