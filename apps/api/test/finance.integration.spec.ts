import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
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
describe.skipIf(!enabled)('Expense approval and immutable accounting', () => {
  let db: PrismaClient,
    control: PrismaClient,
    app: INestApplication,
    church: string,
    other: string,
    expenseAccount: string,
    assetAccount: string,
    fund: string,
    period: string,
    storage: string;
  const database = 'finance_test_' + randomUUID().replaceAll('-', ''),
    savedUrl = process.env.DATABASE_URL,
    savedUpload = process.env.UPLOAD_DIR;
  const sessions: Record<string, { cookie: string; csrf: string; id: string }> = {};
  const password = 'Synthetic-finance-1234',
    origin = 'http://localhost:5173';
  const root = () => `/api/v1/churches/${church}/finance`;
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jFeQAAAAASUVORK5CYII=',
    'base64',
  );
  function call(
    user: string,
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    body?: object,
  ) {
    const s = sessions[user]!;
    const client = request(app.getHttpServer());
    const r = client[method](root() + path)
      .set('Cookie', s.cookie)
      .set('Origin', origin)
      .set('x-csrf-token', s.csrf);
    return body ? r.send(body) : r;
  }
  const draft = (extra: object = {}) => ({
    budgetYear: 2020,
    title: '가상 지출',
    purpose: '통합 테스트용 용품',
    payee: '가상 상점',
    amount: 12345,
    accountId: expenseAccount,
    fundId: fund,
    evidenceReference: 'TEST-DOC',
    approverIds: [sessions.first!.id, sessions.second!.id],
    ...extra,
  });
  async function create(extra: object = {}) {
    const r = await call('requester', 'post', '/expenses', draft(extra));
    expect(r.status, r.text).toBe(201);
    return r.body.id as string;
  }
  async function detail(id: string, user = 'requester') {
    const r = await call(user, 'get', '/expenses/' + id);
    expect(r.status, r.text).toBe(200);
    return r.body;
  }
  async function submit(id: string) {
    const r = await call('requester', 'post', `/expenses/${id}/submit`, {
      version: (await detail(id)).version,
    });
    expect(r.status, r.text).toBe(201);
  }
  async function approve(id: string, user: string, decision = 'APPROVED') {
    const r = await call(user, 'post', `/expenses/${id}/decisions`, {
      version: (await detail(id, user)).version,
      decision,
      reason: '테스트 검토 의견',
    });
    expect(r.status, r.text).toBe(201);
  }
  async function approved() {
    const id = await create();
    await submit(id);
    await approve(id, 'first');
    await approve(id, 'second');
    return id;
  }
  beforeAll(async () => {
    control = new PrismaClient();
    await control.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
    const url = new URL(savedUrl!);
    url.pathname = '/' + database;
    process.env.DATABASE_URL = url.toString();
    delete process.env.AUTH_ADAPTER;
    storage = await mkdtemp(join(tmpdir(), 'church-evidence-'));
    process.env.UPLOAD_DIR = storage;
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      env: process.env,
      stdio: 'pipe',
    });
    db = new PrismaClient();
    church = (await db.church.create({ data: { name: 'Synthetic Finance' } })).id;
    other = (await db.church.create({ data: { name: 'Other Finance' } })).id;
    const roles: Record<string, string[]> = {
      manager: ['identity.manage', 'finance.manage'],
      requester: ['expense.read', 'expense.write'],
      first: ['expense.read', 'expense.approve', 'expense.pay'],
      second: ['expense.read', 'expense.approve'],
      payer: ['expense.read', 'expense.pay'],
      auditor: ['expense.read', 'finance.readall', 'finance.reverse', 'finance.close'],
      outsider: ['expense.read', 'expense.write'],
    };
    await db.permission.createMany({
      data: [...new Set(Object.values(roles).flat())].map((code) => ({ code })),
      skipDuplicates: true,
    });
    const hash = await hashPassword(password);
    for (const [name, permissions] of Object.entries(roles)) {
      const role = await db.role.create({
        data: {
          churchId: church,
          name,
          permissions: { create: permissions.map((permissionCode) => ({ permissionCode })) },
        },
      });
      const u = await db.user.create({
        data: {
          churchId: church,
          username: name,
          passwordHash: hash,
          scopeMode: name === 'manager' ? 'ALL' : 'NONE',
        },
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
        .send({ churchId: church, username: name, password });
      expect(r.status, r.text).toBe(201);
      s.cookie = String(r.headers['set-cookie']![0]).split(';')[0]!;
      s.csrf = r.body.csrfToken;
    }
    for (const [kind, code] of [
      ['EXPENSE', 'E100'],
      ['ASSET', 'A100'],
    ]) {
      const r = await call('manager', 'post', '/accounts', { kind, code, name: code });
      expect(r.status, r.text).toBe(201);
      if (kind === 'EXPENSE') expenseAccount = r.body.id;
      else assetAccount = r.body.id;
    }
    fund = (await call('manager', 'post', '/funds', { name: '가상 일반기금' })).body.id;
    period = (
      await call('manager', 'post', '/periods', {
        name: '2020',
        startsOn: '2020-01-01',
        endsOn: '2020-12-31',
      })
    ).body.id;
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
  it('separates system administration, financial participation, and requester-selected approval lines', async () => {
    await call('manager', 'get', '/expenses').expect(403);
    await call('requester', 'post', '/expenses', draft({ amount: 0 })).expect(400);
    await call('requester', 'post', '/expenses', draft({ amount: 1.5 })).expect(400);
    await call(
      'requester',
      'post',
      '/expenses',
      draft({ approverIds: [sessions.requester!.id] }),
    ).expect(400);
    await call(
      'requester',
      'post',
      '/expenses',
      draft({ approverIds: [sessions.first!.id, sessions.first!.id] }),
    ).expect(400);
    await call(
      'requester',
      'post',
      '/expenses',
      draft({ approverIds: [sessions.outsider!.id] }),
    ).expect(400);
    const id = await create();
    await call('outsider', 'get', '/expenses/' + id).expect(404);
    await call('first', 'get', '/expenses/' + id).expect(404);
    const candidates = await call('requester', 'get', '/approvers');
    expect(candidates.body.items.map((u: { id: string }) => u.id).sort()).toEqual(
      [sessions.first!.id, sessions.second!.id].sort(),
    );
    await submit(id);
    await call('second', 'post', `/expenses/${id}/decisions`, {
      version: (await detail(id)).version,
      decision: 'APPROVED',
      reason: '순서 위반',
    }).expect(403);
    expect(
      (await call('first', 'get', '/expenses?state=review')).body.items.map(
        (x: { id: string }) => x.id,
      ),
    ).toContain(id);
    expect(
      (await call('second', 'get', '/expenses?state=review')).body.items.map(
        (x: { id: string }) => x.id,
      ),
    ).not.toContain(id);
    await approve(id, 'first');
    await approve(id, 'second');
    expect((await detail(id)).state).toBe('APPROVED');
  });
  it('freezes submitted contents and evidence while preserving rejected rounds and changed approval order', async () => {
    const id = await create({
      evidenceReference: '',
      approverIds: [sessions.second!.id, sessions.first!.id],
    });
    await call('requester', 'post', `/expenses/${id}/submit`, { version: 1 }).expect(400);
    await call('requester', 'post', `/expenses/${id}/attachments?version=1`)
      .attach('file', Buffer.from('<html>not a picture</html>'), {
        filename: 'fake.png',
        contentType: 'image/png',
      })
      .expect(400);
    const upload = await call('requester', 'post', `/expenses/${id}/attachments?version=1`).attach(
      'file',
      png,
      { filename: '영수증.png', contentType: 'image/png' },
    );
    expect(upload.status, upload.text).toBe(201);
    const fileId = upload.body.id;
    await call('requester', 'post', `/expenses/${id}/attachments?version=1`)
      .attach('file', png, 'duplicate.png')
      .expect(409);
    await call('outsider', 'get', `/expenses/${id}/attachments/${fileId}`).expect(404);
    await submit(id);
    await call('requester', 'patch', `/expenses/${id}`, {
      ...draft(),
      version: (await detail(id)).version,
    }).expect(400);
    await call(
      'requester',
      'delete',
      `/expenses/${id}/attachments/${fileId}?version=${(await detail(id)).version}`,
    ).expect(400);
    const downloaded = await call('second', 'get', `/expenses/${id}/attachments/${fileId}`).expect(
      200,
    );
    expect(downloaded.headers['content-disposition']).toContain('attachment;');
    expect(downloaded.headers['content-disposition']).toContain(encodeURIComponent('영수증.png'));
    expect(downloaded.headers['cache-control']).toContain('no-store');
    expect(downloaded.body).toEqual(png);
    await request(app.getHttpServer())
      .get(`/api/v1/churches/${other}/finance/expenses/${id}/attachments/${fileId}`)
      .set('Cookie', sessions.second!.cookie)
      .expect(403);
    await approve(id, 'second', 'REJECTED');
    let d = await detail(id);
    expect(d.state).toBe('RETURNED');
    await call(
      'requester',
      'delete',
      `/expenses/${id}/attachments/${fileId}?version=${d.version}`,
    ).expect(200);
    d = await detail(id);
    await call('requester', 'patch', `/expenses/${id}`, {
      ...draft({ amount: 20000 }),
      version: d.version,
    }).expect(200);
    await submit(id);
    d = await detail(id);
    expect(d.submissions[0].amount).toBe(20000);
    expect(d.submissions[1].amount).toBe(12345);
    expect(d.submissions[1].attachments[0].id).toBe(fileId);
    expect(d.submissions[0].approvals[0].userId).toBe(sessions.first!.id);
    expect((await call('second', 'get', `/expenses/${id}/attachments/${fileId}`)).status).toBe(200);
    await expect(
      db.expenseSubmission.update({ where: { id: d.submissions[1].id }, data: { amount: 9 } }),
    ).rejects.toThrow();
    await expect(
      db.expenseApproval.update({
        where: { id: d.submissions[1].approvals[0].id },
        data: { reason: 'rewrite' },
      }),
    ).rejects.toThrow();
  });
  it('records one payment and balanced journal atomically, rejects participant payment and concurrent duplicates', async () => {
    const id = await approved(),
      d = await detail(id),
      payment = {
        version: d.version,
        paidOn: '2020-06-01',
        accountId: assetAccount,
        method: 'BANK',
        reference: 'SYNTHETIC-PAY-1',
      };
    await call('first', 'post', `/expenses/${id}/payment`, payment).expect(403);
    const responses = await Promise.all([
      call('payer', 'post', `/expenses/${id}/payment`, payment),
      call('payer', 'post', `/expenses/${id}/payment`, payment),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    const paid = await detail(id);
    expect(paid.state).toBe('PAID');
    expect(await db.expensePayment.count({ where: { requestId: id } })).toBe(1);
    const lines = await db.journalLine.findMany({ where: { journalId: paid.payment.journalId } });
    expect(lines.reduce((n, l) => n + l.debit.toNumber(), 0)).toBe(12345);
    expect(lines.reduce((n, l) => n + l.credit.toNumber(), 0)).toBe(12345);
    await expect(
      db.journalLine.update({ where: { id: lines[0]!.id }, data: { debit: 1 } }),
    ).rejects.toThrow();
    await expect(
      db.journalLine.create({
        data: {
          churchId: church,
          journalId: paid.payment.journalId,
          accountId: assetAccount,
          fundId: fund,
          debit: 1,
          credit: 0,
        },
      }),
    ).rejects.toThrow();
    await expect(db.expensePayment.delete({ where: { requestId: id } })).rejects.toThrow();
    await call('requester', 'post', `/expenses/${id}/cancel`, {
      version: paid.version,
      reason: '취소 시도',
    }).expect(400);
    const id2 = await approved(),
      d2 = await detail(id2);
    await call('payer', 'post', `/expenses/${id2}/payment`, {
      ...payment,
      version: d2.version,
    }).expect(400);
    expect((await detail(id2)).state).toBe('APPROVED');
    const audit = JSON.stringify(await db.auditEvent.findMany({ where: { churchId: church } }));
    expect(audit).not.toContain('가상 상점');
    expect(audit).not.toContain('SYNTHETIC-PAY-1');
  });
  it('blocks cross-church references and unbalanced journals at the database transaction boundary', async () => {
    const foreign = await db.financeFund.create({ data: { churchId: other, name: 'Other fund' } });
    await call('requester', 'post', '/expenses', draft({ fundId: foreign.id })).expect(400);
    await expect(
      db.expenseRequest.create({
        data: {
          ...draft({ approverIds: [] }),
          churchId: church,
          requesterId: sessions.requester!.id,
          fundId: foreign.id,
        },
      }),
    ).rejects.toThrow();
    const before = await db.journalEntry.count();
    await expect(
      db.$transaction(async (tx) => {
        await tx.journalEntry.create({
          data: {
            churchId: church,
            periodId: period,
            postedOn: new Date('2020-01-01'),
            postedBy: sessions.payer!.id,
            description: 'Unbalanced',
            lines: {
              create: [
                {
                  accountId: expenseAccount,
                  fundId: fund,
                  debit: 100,
                  credit: 0,
                },
              ],
            },
          },
        });
      }),
    ).rejects.toThrow(/Unbalanced journal/);
    expect(await db.journalEntry.count()).toBe(before);
  });
  it('rejects revoked approvers, protects cancellation and validates attachment limits and CSRF', async () => {
    const id = await create();
    await db.user.update({ where: { id: sessions.first!.id }, data: { active: false } });
    await call('requester', 'post', `/expenses/${id}/submit`, { version: 1 }).expect(400);
    await db.user.update({ where: { id: sessions.first!.id }, data: { active: true } });
    await request(app.getHttpServer())
      .post(root() + `/expenses/${id}/attachments?version=1`)
      .set('Cookie', sessions.requester!.cookie)
      .set('Origin', origin)
      .attach('file', png, 'test.png')
      .expect(403);
    await call('requester', 'post', `/expenses/${id}/attachments?version=1`)
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), 'too-big.png')
      .expect(413);
    await call('requester', 'post', `/expenses/${id}/cancel`, {
      version: 1,
      reason: '요청 취소',
    }).expect(201);
    await call('requester', 'post', `/expenses/${id}/submit`, { version: 2 }).expect(400);
  });
  it('requires MFA for financial approvers in production', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const r = await call('first', 'get', '/expenses');
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('MFA_REQUIRED');
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
  it('requires recent authentication for financial actions', async () => {
    await db.session.updateMany({
      where: { userId: sessions.manager!.id },
      data: { createdAt: new Date(Date.now() - 16 * 60000) },
    });
    await call('manager', 'post', '/funds', { name: 'Blocked fund' }).expect(401);
    await db.session.updateMany({
      where: { userId: sessions.manager!.id },
      data: { createdAt: new Date() },
    });
  });
  it('closes periods and permits one linked reversal only in an open period without reopening payment', async () => {
    await call('manager', 'post', '/periods', {
      name: 'Overlap',
      startsOn: '2020-12-31',
      endsOn: '2021-01-31',
    }).expect(400);
    const p = await call('manager', 'post', '/periods', {
      name: '2021',
      startsOn: '2021-01-01',
      endsOn: '2021-12-31',
    });
    expect(p.status, p.text).toBe(201);
    await call('auditor', 'post', `/periods/${period}/close`, {}).expect(201);
    const id = await approved();
    await call('payer', 'post', `/expenses/${id}/payment`, {
      version: (await detail(id)).version,
      paidOn: '2020-12-31',
      accountId: assetAccount,
      method: 'CASH',
      reference: 'CLOSED-PAY',
    }).expect(400);
    expect(await db.expensePayment.count({ where: { requestId: id } })).toBe(0);
    const original = await db.expensePayment.findUniqueOrThrow({
      where: { churchId_reference: { churchId: church, reference: 'SYNTHETIC-PAY-1' } },
    });
    await call('auditor', 'post', `/journals/${original.journalId}/reverse`, {
      postedOn: '2020-06-02',
      reason: '장부 정정',
    }).expect(400);
    const r = await call('auditor', 'post', `/journals/${original.journalId}/reverse`, {
      postedOn: '2021-01-01',
      reason: '가상 정정',
    });
    expect(r.status, r.text).toBe(201);
    await call('auditor', 'post', `/journals/${original.journalId}/reverse`, {
      postedOn: '2021-01-01',
      reason: '중복 정정',
    }).expect(400);
    expect((await detail(original.requestId)).state).toBe('PAID');
    const all = await db.journalLine.findMany({
      where: { journalId: { in: [original.journalId, r.body.id] } },
    });
    const net = all
      .filter((l) => l.accountId === expenseAccount)
      .reduce((n, l) => n + l.debit.toNumber() - l.credit.toNumber(), 0);
    expect(net).toBe(0);
    await expect(
      db.financePeriod.update({ where: { id: period }, data: { closedAt: null } }),
    ).rejects.toThrow();
    await expect(
      db.journalEntry.create({
        data: {
          churchId: church,
          periodId: period,
          postedOn: new Date('2020-01-01'),
          postedBy: sessions.payer!.id,
          description: 'Closed',
        },
      }),
    ).rejects.toThrow();
  });
});
