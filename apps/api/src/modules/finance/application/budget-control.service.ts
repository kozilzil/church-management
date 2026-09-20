import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { Prisma, type ExpenseRequest } from '@prisma/client';
import type { BudgetControlPolicy, ExpenseBudgetStatus } from '@church/contracts';
import type { Actor } from '../../identity/domain/actor';
import type { BudgetPolicyDto } from '../interface/budget.dto';
import { FinancePolicy, bad, conflict, type Tx } from './finance-policy.service';
@Injectable()
export class BudgetControlService {
  constructor(@Inject(FinancePolicy) private readonly p: FinancePolicy) {}
  async policy(tx: Tx, c: string): Promise<BudgetControlPolicy> {
    const row = await tx.budgetPolicyRevision.findFirst({
      where: { churchId: c },
      orderBy: { version: 'desc' },
    });
    return {
      mode: row?.mode === 'BLOCK' ? 'BLOCK' : 'WARN',
      version: row?.version ?? 0,
      legacyPending: await tx.expenseRequest.count({
        where: { churchId: c, budgetYear: null, state: { in: ['IN_REVIEW', 'APPROVED'] } },
      }),
    };
  }
  readPolicy(a: Actor, c: string) {
    return this.p.write(a, c, 'finance.manage', async (tx) => {
      await this.p.audit.record(a, 'budget.policy.read', 'budget-policy', c, [], tx);
      return this.policy(tx, c);
    });
  }
  savePolicy(a: Actor, c: string, d: BudgetPolicyDto) {
    return this.p.write(
      a,
      c,
      'finance.manage',
      async (tx) => {
        const current = await this.policy(tx, c);
        if (current.version !== d.version) conflict();
        if (current.mode === d.mode) bad('현재와 같은 예산 통제 방식입니다.');
        if (d.mode === 'BLOCK' && current.legacyPending)
          bad(
            '연도 없는 기존 결재·승인 요청을 지급 완료하거나 취소 후 연도를 지정하여 다시 상신하세요.',
          );
        await tx.budgetPolicyRevision.create({
          data: {
            churchId: c,
            version: d.version + 1,
            mode: d.mode,
            reason: d.reason.trim(),
            createdBy: a.userId,
          },
        });
        await this.p.audit.record(
          a,
          'budget.policy.change',
          'budget-policy',
          c,
          ['mode', 'reason'],
          tx,
        );
        return this.policy(tx, c);
      },
      true,
    );
  }
  async commitments(tx: Tx, c: string, year: number, fundId?: string) {
    return tx.expenseRequest.groupBy({
      by: ['accountId', 'fundId'],
      where: {
        churchId: c,
        budgetYear: year,
        state: { in: ['IN_REVIEW', 'APPROVED'] },
        ...(fundId ? { fundId } : {}),
      },
      _sum: { amount: true },
    });
  }
  async evaluate(tx: Tx, row: ExpenseRequest): Promise<ExpenseBudgetStatus> {
    const policy = await this.policy(tx, row.churchId);
    const result: ExpenseBudgetStatus = {
      year: row.budgetYear,
      mode: policy.mode,
      policyVersion: policy.version,
      budgetVersion: 0,
      status: 'LEGACY_YEAR',
    };
    if (row.budgetYear === null) return result;
    const where = {
      churchId: row.churchId,
      year: row.budgetYear,
      accountId: row.accountId,
      fundId: row.fundId,
    };
    const revision = await tx.budgetRevision.findFirst({ where, orderBy: { version: 'desc' } });
    result.budgetVersion = revision?.version ?? 0;
    if (!revision) return { ...result, status: 'UNBUDGETED' };
    const from = this.p.date(`${row.budgetYear}-01-01`),
      to = this.p.date(`${row.budgetYear}-12-31`);
    const [actual] = await tx.$queryRaw<{ amount: Prisma.Decimal }[]>(Prisma.sql`
      SELECT COALESCE(sum(l.debit-l.credit),0) AS amount FROM journal_line l
      JOIN journal_entry j ON j.id=l.journal_id AND j.church_id=l.church_id
      WHERE l.church_id=${row.churchId}::uuid AND l.account_id=${row.accountId}::uuid AND l.fund_id=${row.fundId}::uuid
        AND j.posted_on BETWEEN ${from} AND ${to}`);
    const pending = await tx.expenseRequest.aggregate({
      where: {
        churchId: row.churchId,
        budgetYear: row.budgetYear,
        accountId: row.accountId,
        fundId: row.fundId,
        id: { not: row.id },
        state: { in: ['IN_REVIEW', 'APPROVED'] },
      },
      _sum: { amount: true },
    });
    const total =
      BigInt(actual!.amount.toFixed(0)) +
      BigInt(pending._sum.amount?.toFixed(0) ?? '0') +
      BigInt(row.amount.toFixed(0));
    return {
      ...result,
      status: total > BigInt(revision.amount.toFixed(0)) ? 'EXCEEDED' : 'WITHIN',
    };
  }
  async enforce(a: Actor, tx: Tx, row: ExpenseRequest, action: 'SUBMIT' | 'APPROVE' | 'PAY') {
    const result = await this.evaluate(tx, row);
    if (result.mode === 'BLOCK' && result.status !== 'WITHIN')
      throw new ConflictException({
        code: 'BUDGET_BLOCKED',
        message:
          '예산이 미편성되었거나 예약액을 포함한 한도를 초과했습니다. 예산 변경 승인을 받거나 요청 금액을 조정하세요.',
      });
    await tx.expenseBudgetCheck.create({
      data: {
        churchId: row.churchId,
        requestId: row.id,
        requestVersion: row.version,
        actorId: a.userId,
        action,
        year: result.year,
        mode: result.mode,
        status: result.status,
        budgetVersion: result.budgetVersion,
        policyVersion: result.policyVersion,
      },
    });
    await this.p.audit.record(
      a,
      result.status === 'WITHIN' ? 'expense.budget.check' : 'expense.budget.warning',
      'expense',
      row.id,
      [],
      tx,
    );
    return result;
  }
}
