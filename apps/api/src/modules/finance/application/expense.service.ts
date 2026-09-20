import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type ExpenseRequest } from '@prisma/client';
import { randomUUID, createHash } from 'node:crypto';
import type { Actor } from '../../identity/domain/actor';
import {
  FinancePolicy,
  bad,
  missing,
  denied,
  conflict,
  page,
  type Tx,
} from './finance-policy.service';
import { BudgetControlService } from './budget-control.service';
import { LedgerService } from './ledger.service';
import { EvidenceStorage } from '../infrastructure/evidence-storage';
import { evidenceMime, evidenceName } from '../domain/evidence';
import { validApprovalLine, canPay, integerWon } from '../domain/policy';
import type {
  ExpenseDto,
  UpdateExpenseDto,
  FinancePageDto,
  DecisionDto,
  ReasonDto,
  PaymentDto,
} from '../interface/finance.dto';
export type EvidenceFile = { buffer: Buffer; originalname: string };
@Injectable()
export class ExpenseService {
  constructor(
    @Inject(FinancePolicy) private readonly p: FinancePolicy,
    @Inject(BudgetControlService) private readonly budget: BudgetControlService,
    @Inject(LedgerService) private readonly ledger: LedgerService,
    @Inject(EvidenceStorage) private readonly storage: EvidenceStorage,
  ) {}
  private visible(a: Actor): Prisma.ExpenseRequestWhereInput {
    if (a.permissions.includes('finance.readall')) return { churchId: a.churchId };
    return {
      churchId: a.churchId,
      OR: [
        { requesterId: a.userId },
        { submissions: { some: { approvals: { some: { userId: a.userId } } } } },
        ...(a.permissions.includes('expense.pay') ? [{ state: { in: ['APPROVED', 'PAID'] } }] : []),
      ],
    };
  }
  private async get(a: Actor, id: string, tx: Tx = this.p.db) {
    const row = await tx.expenseRequest.findFirst({ where: { AND: [this.visible(a), { id }] } });
    if (!row) missing();
    return row;
  }
  private own(a: Actor, row: ExpenseRequest, v: number) {
    if (row.requesterId !== a.userId) denied();
    this.version(row, v);
  }
  private version(row: ExpenseRequest, v: number) {
    if (row.version !== v) conflict();
  }
  private editable(row: ExpenseRequest) {
    if (!['DRAFT', 'RETURNED'].includes(row.state))
      bad('초안 또는 반려 상태에서만 수정할 수 있습니다.');
  }
  private async checkData(c: string, d: ExpenseDto, requester: string, tx: Tx) {
    if (!integerWon(d.amount)) bad('금액은 1–999999999999 범위의 정수 원화여야 합니다.');
    await this.p.account(c, d.accountId, 'EXPENSE', tx);
    if (!(await tx.financeFund.findFirst({ where: { id: d.fundId, churchId: c } })))
      bad('기금을 확인하세요.');
    if (d.approverIds.length) await this.approvers(c, d.approverIds, requester, tx);
  }
  private async approvers(c: string, ids: string[], requester: string, tx: Tx) {
    if (!validApprovalLine(ids, requester))
      bad('본인을 제외한 서로 다른 결재자 1–5명을 지정하세요.');
    const users = await tx.user.findMany({
      where: {
        churchId: c,
        id: { in: ids },
        active: true,
        roles: { some: { role: { permissions: { some: { permissionCode: 'expense.approve' } } } } },
      },
      select: { id: true, username: true },
    });
    if (users.length !== ids.length) bad('결재자는 활성 계정이며 지출 승인 권한이 있어야 합니다.');
    return users;
  }
  private async event(a: Actor, row: ExpenseRequest, action: string, reason: string, tx: Tx) {
    await tx.expenseEvent.create({
      data: {
        churchId: row.churchId,
        requestId: row.id,
        actorId: a.userId,
        action,
        reason,
        version: row.version,
        round: row.round,
      },
    });
    await this.p.audit.record(a, 'expense.' + action, 'expense', row.id, [], tx);
  }
  async candidates(a: Actor, c: string, q: FinancePageDto) {
    this.p.check(a, c, 'expense.read');
    const n = q.limit ?? 100;
    return page(
      await this.p.db.user.findMany({
        where: {
          churchId: c,
          active: true,
          id: { not: a.userId, ...(q.cursor ? { gt: q.cursor } : {}) },
          roles: {
            some: { role: { permissions: { some: { permissionCode: 'expense.approve' } } } },
          },
        },
        select: { id: true, username: true },
        orderBy: { id: 'asc' },
        take: n + 1,
      }),
      n,
    );
  }
  async list(a: Actor, c: string, q: FinancePageDto) {
    this.p.check(a, c, 'expense.read');
    const n = q.limit ?? 30;
    const filter: Prisma.ExpenseRequestWhereInput =
      q.state === 'mine'
        ? { requesterId: a.userId }
        : q.state === 'review'
          ? { currentApproverId: a.userId, state: 'IN_REVIEW' }
          : q.state === 'pay'
            ? { state: 'APPROVED' }
            : q.state && q.state !== 'all'
              ? { state: q.state }
              : {};
    const rows = await this.p.db.expenseRequest.findMany({
      where: { AND: [this.visible(a), filter, ...(q.cursor ? [{ id: { gt: q.cursor } }] : [])] },
      orderBy: { id: 'asc' },
      take: n + 1,
    });
    const requesters = await this.p.db.user.findMany({
      where: { churchId: c, id: { in: rows.map((r) => r.requesterId) } },
      select: { id: true, username: true },
    });
    return page(
      rows.map((r) => ({
        requester: requesters.find((u) => u.id === r.requesterId)?.username ?? '',
        id: r.id,
        title: r.title,
        amount: r.amount.toNumber(),
        state: r.state,
        requesterId: r.requesterId,
        currentApproverId: r.currentApproverId,
        version: r.version,
        round: r.round,
        createdAt: r.createdAt,
      })),
      n,
    );
  }
  async detail(a: Actor, c: string, id: string) {
    this.p.check(a, c, 'expense.read');
    const row = await this.get(a, id);
    const [attachments, payment, submissions, events] = await Promise.all([
      this.p.db.expenseAttachment.findMany({
        where: { requestId: id, removedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, filename: true, mime: true, size: true },
      }),
      this.p.db.expensePayment.findUnique({ where: { requestId: id } }),
      this.p.db.expenseSubmission.findMany({
        where: { requestId: id },
        orderBy: { round: 'desc' },
        take: 10,
        include: { approvals: { orderBy: { position: 'asc' } } },
      }),
      this.history(a, c, id, { limit: 30 }),
    ]);
    const links = await this.p.db.expenseSubmissionAttachment.findMany({
      where: { submissionId: { in: submissions.map((s) => s.id) } },
    });
    const files = await this.p.db.expenseAttachment.findMany({
      where: { id: { in: links.map((l) => l.attachmentId) } },
      select: { id: true, filename: true, mime: true, size: true },
    });
    const requester = await this.p.db.user.findUniqueOrThrow({
      where: { id: row.requesterId },
      select: { username: true },
    });
    const payer = payment
      ? await this.p.db.user.findUniqueOrThrow({
          where: { id: payment.paidBy },
          select: { username: true },
        })
      : null;
    const reversal = payment
      ? await this.p.db.journalEntry.findFirst({
          where: { reversalOf: payment.journalId },
          select: { id: true, postedOn: true },
        })
      : null;
    return {
      ...row,
      budgetCheck: ['DRAFT', 'RETURNED', 'IN_REVIEW', 'APPROVED'].includes(row.state)
        ? await this.p.write(a, c, 'expense.read', (tx) => this.budget.evaluate(tx, row))
        : null,
      budgetChecks: await this.p.db.expenseBudgetCheck.findMany({
        where: { churchId: c, requestId: id },
        select: { action: true, year: true, mode: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      requester: requester.username,
      amount: row.amount.toNumber(),
      attachments,
      payment: payment
        ? { ...payment, amount: payment.amount.toNumber(), payer: payer?.username, reversal }
        : null,
      submissions: submissions.map((s) => ({
        ...s,
        amount: s.amount.toNumber(),
        attachments: files.filter((f) =>
          links.some((l) => l.submissionId === s.id && l.attachmentId === f.id),
        ),
      })),
      events,
      olderSubmissionCount: Math.max(0, row.round - 10),
    };
  }
  async history(a: Actor, c: string, id: string, q: FinancePageDto) {
    this.p.check(a, c, 'expense.read');
    await this.get(a, id);
    const n = q.limit ?? 30;
    const anchor = q.cursor
      ? await this.p.db.expenseEvent.findFirst({ where: { id: q.cursor, requestId: id } })
      : null;
    if (q.cursor && !anchor) bad('이력 페이지를 다시 조회하세요.');
    return page(
      await this.p.db.expenseEvent.findMany({
        where: { requestId: id, ...(anchor ? { version: { lt: anchor.version } } : {}) },
        orderBy: { version: 'desc' },
        take: n + 1,
      }),
      n,
    );
  }
  async submission(a: Actor, c: string, id: string, round: number) {
    this.p.check(a, c, 'expense.read');
    await this.get(a, id);
    const s = await this.p.db.expenseSubmission.findUnique({
      where: { requestId_round: { requestId: id, round } },
      include: { approvals: { orderBy: { position: 'asc' } } },
    });
    if (!s) missing();
    const links = await this.p.db.expenseSubmissionAttachment.findMany({
      where: { submissionId: s.id },
    });
    const attachments = await this.p.db.expenseAttachment.findMany({
      where: { id: { in: links.map((l) => l.attachmentId) } },
      select: { id: true, filename: true, mime: true, size: true },
    });
    return { ...s, amount: s.amount.toNumber(), attachments };
  }
  create(a: Actor, c: string, d: ExpenseDto) {
    return this.p.write(a, c, 'expense.write', async (tx) => {
      this.p.check(a, c, 'expense.read');
      await this.checkData(c, d, a.userId, tx);
      const row = await tx.expenseRequest.create({
        data: { ...d, churchId: c, requesterId: a.userId },
      });
      await this.event(a, row, 'create', '', tx);
      return { id: row.id, version: row.version };
    });
  }
  update(a: Actor, c: string, id: string, d: UpdateExpenseDto) {
    return this.p.write(a, c, 'expense.write', async (tx) => {
      const row = await this.get(a, id, tx);
      this.own(a, row, d.version);
      this.editable(row);
      await this.checkData(c, d, a.userId, tx);
      const { version, ...data } = d;
      const next = await tx.expenseRequest.update({
        where: { id },
        data: { ...data, version: version + 1 },
      });
      await this.event(a, next, 'update', '', tx);
      return { id, version: next.version };
    });
  }
  submit(a: Actor, c: string, id: string, v: number) {
    return this.p.write(a, c, 'expense.write', async (tx) => {
      const row = await this.get(a, id, tx);
      this.own(a, row, v);
      this.editable(row);
      const users = await this.approvers(c, row.approverIds, a.userId, tx),
        files = await tx.expenseAttachment.findMany({ where: { requestId: id, removedAt: null } });
      if (!row.evidenceReference.trim() && !files.length)
        bad('증빙 파일 또는 증빙 문서 참조를 추가하세요.');
      if (row.budgetYear === null) bad('예산 연도를 지정하여 초안을 저장하세요.');
      const budgetCheck = await this.budget.enforce(a, tx, row, 'SUBMIT');
      const round = row.round + 1;
      const s = await tx.expenseSubmission.create({
        data: {
          churchId: c,
          requestId: id,
          round,
          budgetYear: row.budgetYear,
          title: row.title,
          purpose: row.purpose,
          payee: row.payee,
          amount: row.amount,
          accountId: row.accountId,
          fundId: row.fundId,
          evidenceReference: row.evidenceReference,
          approvals: {
            create: row.approverIds.map((userId, i) => ({
              position: i + 1,
              userId,
              username: users.find((u) => u.id === userId)!.username,
            })),
          },
        },
      });
      await tx.expenseSubmissionAttachment.createMany({
        data: files.map((f) => ({ churchId: c, submissionId: s.id, attachmentId: f.id })),
      });
      const next = await tx.expenseRequest.update({
        where: { id },
        data: {
          round,
          state: 'IN_REVIEW',
          currentApproverId: row.approverIds[0]!,
          version: { increment: 1 },
        },
      });
      await this.event(a, next, 'submit', '', tx);
      return { id, version: next.version, budgetCheck };
    });
  }
  decide(a: Actor, c: string, id: string, d: DecisionDto) {
    return this.p.write(
      a,
      c,
      'expense.approve',
      async (tx) => {
        const row = await this.get(a, id, tx);
        this.version(row, d.version);
        if (
          row.state !== 'IN_REVIEW' ||
          row.currentApproverId !== a.userId ||
          row.requesterId === a.userId
        )
          denied();
        const s = await tx.expenseSubmission.findUniqueOrThrow({
          where: { requestId_round: { requestId: id, round: row.round } },
          include: { approvals: { orderBy: { position: 'asc' } } },
        });
        const current = s.approvals.find((x) => x.decision === 'PENDING');
        if (!current || current.userId !== a.userId) denied();
        const budgetCheck =
          d.decision === 'APPROVED' ? await this.budget.enforce(a, tx, row, 'APPROVE') : null;
        await tx.expenseApproval.update({
          where: { id: current.id },
          data: { decision: d.decision, reason: d.reason, decidedAt: new Date() },
        });
        const following = s.approvals.find((x) => x.position > current.position);
        const state = d.decision === 'REJECTED' ? 'RETURNED' : following ? 'IN_REVIEW' : 'APPROVED';
        const next = await tx.expenseRequest.update({
          where: { id },
          data: {
            state,
            currentApproverId: state === 'IN_REVIEW' ? following!.userId : null,
            version: { increment: 1 },
          },
        });
        await this.event(a, next, d.decision === 'REJECTED' ? 'reject' : 'approve', d.reason, tx);
        return { id, version: next.version, budgetCheck };
      },
      true,
    );
  }
  cancel(a: Actor, c: string, id: string, d: ReasonDto) {
    return this.p.write(a, c, 'expense.write', async (tx) => {
      const row = await this.get(a, id, tx);
      this.own(a, row, d.version);
      if (['PAID', 'CANCELLED'].includes(row.state)) bad('취소할 수 없는 상태입니다.');
      const next = await tx.expenseRequest.update({
        where: { id },
        data: { state: 'CANCELLED', currentApproverId: null, version: { increment: 1 } },
      });
      await this.event(a, next, 'cancel', d.reason, tx);
      return { ok: true };
    });
  }
  pay(a: Actor, c: string, id: string, d: PaymentDto) {
    return this.p.write(
      a,
      c,
      'expense.pay',
      async (tx) => {
        const row = await this.get(a, id, tx);
        this.version(row, d.version);
        if (row.state !== 'APPROVED') bad('승인 완료된 지출만 지급 기록할 수 있습니다.');
        if (!canPay(row.requesterId, row.approverIds, a.userId)) denied();
        const s = await tx.expenseSubmission.findUniqueOrThrow({
          where: { requestId_round: { requestId: id, round: row.round } },
          include: { approvals: true },
        });
        if (!s.approvals.length || s.approvals.some((x) => x.decision !== 'APPROVED'))
          bad('모든 결재가 완료되어야 합니다.');
        this.p.date(d.paidOn);
        if (row.budgetYear !== null && Number(d.paidOn.slice(0, 4)) !== row.budgetYear)
          bad(
            '지급일은 승인된 예산 연도와 같아야 합니다. 연도가 바뀌면 기존 요청을 취소하고 새 연도로 다시 결재받으세요.',
          );
        const budgetCheck = await this.budget.enforce(a, tx, row, 'PAY');
        const ref = d.reference.trim();
        if (await tx.expensePayment.count({ where: { churchId: c, reference: ref } }))
          bad('이미 사용한 지급 참조입니다.');
        const journalId = await this.ledger.postExpense(a, c, tx, {
          paidOn: d.paidOn,
          amount: s.amount.toNumber(),
          expenseAccount: s.accountId,
          assetAccount: d.accountId,
          fundId: s.fundId,
          requestId: id,
        });
        await tx.expensePayment.create({
          data: {
            churchId: c,
            requestId: id,
            paidBy: a.userId,
            paidOn: this.p.date(d.paidOn),
            method: d.method,
            reference: ref,
            amount: s.amount,
            journalId,
          },
        });
        const next = await tx.expenseRequest.update({
          where: { id },
          data: { state: 'PAID', version: { increment: 1 } },
        });
        await this.event(a, next, 'pay', '', tx);
        return { id, journalId, version: next.version, budgetCheck };
      },
      true,
    );
  }
  async upload(a: Actor, c: string, id: string, v: number, file?: EvidenceFile) {
    if (!file) bad('증빙 파일을 선택하세요.');
    const mime = evidenceMime(file.buffer);
    if (!mime) bad('10 MiB 이하 JPEG·PNG·PDF 파일만 허용합니다.');
    const key = randomUUID();
    let written = false;
    try {
      return await this.p.write(a, c, 'expense.write', async (tx) => {
        const row = await this.get(a, id, tx);
        this.own(a, row, v);
        this.editable(row);
        if ((await tx.expenseAttachment.count({ where: { requestId: id, removedAt: null } })) >= 10)
          bad('현재 증빙은 최대 10개입니다.');
        await this.storage.put(key, file.buffer);
        written = true;
        await tx.expenseAttachment.create({
          data: {
            id: key,
            churchId: c,
            requestId: id,
            uploadedBy: a.userId,
            filename: evidenceName(file.originalname),
            mime,
            size: file.buffer.length,
            sha256: createHash('sha256').update(file.buffer).digest('hex'),
          },
        });
        const next = await tx.expenseRequest.update({
          where: { id },
          data: { version: { increment: 1 } },
        });
        await this.event(a, next, 'attachment.add', '', tx);
        return { id: key, version: next.version };
      });
    } catch (e) {
      if (written) await this.storage.removeFailedUpload(key).catch(() => undefined);
      throw e;
    }
  }
  removeAttachment(a: Actor, c: string, id: string, fileId: string, v: number) {
    return this.p.write(a, c, 'expense.write', async (tx) => {
      const row = await this.get(a, id, tx);
      this.own(a, row, v);
      this.editable(row);
      const f = await tx.expenseAttachment.findFirst({
        where: { id: fileId, requestId: id, removedAt: null },
      });
      if (!f) missing();
      await tx.expenseAttachment.update({ where: { id: fileId }, data: { removedAt: new Date() } });
      const next = await tx.expenseRequest.update({
        where: { id },
        data: { version: { increment: 1 } },
      });
      await this.event(a, next, 'attachment.remove', '', tx);
      return { ok: true };
    });
  }
  async download(a: Actor, c: string, id: string, fileId: string) {
    this.p.check(a, c, 'expense.read');
    await this.get(a, id);
    const f = await this.p.db.expenseAttachment.findFirst({
      where: { id: fileId, requestId: id, churchId: c },
    });
    if (!f) missing();
    if (
      f.removedAt &&
      !(await this.p.db.expenseSubmissionAttachment.count({ where: { attachmentId: fileId } }))
    )
      missing();
    await this.p.audit.record(a, 'expense.attachment.read', 'expense', id, []);
    const bytes = await this.storage.get(f.id);
    if (bytes.length !== f.size || createHash('sha256').update(bytes).digest('hex') !== f.sha256)
      bad('증빙 파일 무결성 검사를 통과하지 못했습니다.');
    return { bytes, filename: f.filename, mime: f.mime };
  }
}
