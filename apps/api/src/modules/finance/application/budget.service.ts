import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AnnualBudget, BudgetRow, BudgetHistory } from '@church/contracts';
import type { Actor } from '../../identity/domain/actor';
import { FinancePolicy, bad, missing, conflict, type Tx } from './finance-policy.service';
import type {
  BudgetQuery,
  BudgetRevisionDto,
  BudgetHistoryQuery,
  BudgetLineDto,
} from '../interface/budget.dto';
import { BudgetControlService } from './budget-control.service';
import { budgetAmounts } from '../domain/budget-amounts';
@Injectable()
export class BudgetService {
  constructor(
    @Inject(FinancePolicy) private readonly p: FinancePolicy,
    @Inject(BudgetControlService) private readonly control: BudgetControlService,
  ) {}
  async definitions(a: Actor, c: string) {
    this.p.check(a, c, 'budget.read');
    return {
      timezone: (
        await this.p.db.church.findUniqueOrThrow({ where: { id: c }, select: { timezone: true } })
      ).timezone,
      accounts: await this.p.db.financeAccount.findMany({
        where: { churchId: c, kind: 'EXPENSE' },
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      }),
      funds: await this.p.db.financeFund.findMany({
        where: { churchId: c },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    };
  }
  private async line(tx: Tx, c: string, d: BudgetLineDto) {
    const account = await tx.financeAccount.findFirst({
      where: { churchId: c, id: d.accountId, kind: 'EXPENSE' },
      select: { id: true },
    });
    const fund = await tx.financeFund.findFirst({
      where: { churchId: c, id: d.fundId },
      select: { id: true },
    });
    if (!account || !fund) missing();
    return { churchId: c, year: d.year, accountId: d.accountId, fundId: d.fundId };
  }
  save(a: Actor, c: string, d: BudgetRevisionDto) {
    return this.p.write(
      a,
      c,
      'budget.write',
      async (tx) => {
        this.p.check(a, c, 'budget.read');
        const where = await this.line(tx, c, d);
        const latest = await tx.budgetRevision.findFirst({ where, orderBy: { version: 'desc' } });
        if ((latest?.version ?? 0) !== d.version) conflict();
        if (latest?.amount.toFixed(0) === d.amount) bad('현재 예산과 같은 금액입니다.');
        if (await tx.budgetChange.count({ where: { ...where, decision: null } })) conflict();
        const row = await tx.budgetChange.create({
          data: {
            ...where,
            amount: d.amount,
            baseVersion: d.version,
            reason: d.reason.trim(),
            requestedBy: a.userId,
          },
        });
        await this.p.audit.record(
          a,
          'budget.request',
          'budget-change',
          row.id,
          ['year', 'accountId', 'fundId', 'amount', 'reason'],
          tx,
        );
        return { id: row.id, state: 'PENDING' };
      },
      true,
    );
  }
  summary(a: Actor, c: string, q: BudgetQuery): Promise<AnnualBudget> {
    return this.p.write(a, c, 'budget.read', async (tx) => {
      if (q.fundId && !(await tx.financeFund.count({ where: { churchId: c, id: q.fundId } })))
        missing();
      const from = this.p.date(`${q.year}-01-01`),
        to = this.p.date(`${q.year}-12-31`);
      const allocated = await tx.$queryRaw<
        { accountId: string; fundId: string; amount: Prisma.Decimal; version: number }[]
      >(Prisma.sql`
        SELECT DISTINCT ON (account_id,fund_id) account_id AS "accountId",fund_id AS "fundId",amount,version
        FROM budget_revision WHERE church_id=${c}::uuid AND year=${q.year}
        ${q.fundId ? Prisma.sql`AND fund_id=${q.fundId}::uuid` : Prisma.empty}
        ORDER BY account_id,fund_id,version DESC`);
      const actuals = await tx.$queryRaw<
        { accountId: string; fundId: string; amount: Prisma.Decimal }[]
      >(Prisma.sql`
        SELECT l.account_id AS "accountId",l.fund_id AS "fundId",sum(l.debit-l.credit) AS amount
        FROM journal_line l JOIN journal_entry j ON j.church_id=l.church_id AND j.id=l.journal_id
        JOIN finance_account a ON a.church_id=l.church_id AND a.id=l.account_id
        WHERE j.church_id=${c}::uuid AND j.posted_on BETWEEN ${from} AND ${to} AND a.kind='EXPENSE'
        ${q.fundId ? Prisma.sql`AND l.fund_id=${q.fundId}::uuid` : Prisma.empty}
        GROUP BY l.account_id,l.fund_id HAVING sum(l.debit-l.credit)<>0`);
      const commitments = await this.control.commitments(tx, c, q.year, q.fundId);
      const committedAmounts = new Map(
        commitments.map((x) => [
          x.accountId + ':' + x.fundId,
          BigInt(x._sum.amount?.toFixed(0) ?? '0'),
        ]),
      );
      const accounts = new Map(
        (await tx.financeAccount.findMany({ where: { churchId: c, kind: 'EXPENSE' } })).map((x) => [
          x.id,
          x,
        ]),
      );
      const funds = new Map(
        (await tx.financeFund.findMany({ where: { churchId: c } })).map((x) => [x.id, x]),
      );
      const merged = new Map<
        string,
        {
          accountId: string;
          fundId: string;
          budget: bigint | null;
          actual: bigint;
          version: number;
        }
      >();
      for (const row of allocated)
        merged.set(row.accountId + ':' + row.fundId, {
          ...row,
          budget: BigInt(row.amount.toFixed(0)),
          actual: 0n,
        });
      for (const row of actuals) {
        const key = row.accountId + ':' + row.fundId;
        const item = merged.get(key) ?? { ...row, budget: null, version: 0, actual: 0n };
        item.actual = BigInt(row.amount.toFixed(0));
        merged.set(key, item);
      }
      for (const row of commitments) {
        const key = row.accountId + ':' + row.fundId;
        if (!merged.has(key))
          merged.set(key, {
            accountId: row.accountId,
            fundId: row.fundId,
            budget: null,
            version: 0,
            actual: 0n,
          });
      }
      let budget = 0n,
        actual = 0n;
      const items: BudgetRow[] = [...merged.values()]
        .map((r): BudgetRow => {
          budget += r.budget ?? 0n;
          actual += r.actual;
          const account = accounts.get(r.accountId)!,
            fund = funds.get(r.fundId)!;
          const committed = committedAmounts.get(r.accountId + ':' + r.fundId) ?? 0n;
          return {
            committed: String(committed),
            available: r.budget === null ? null : String(r.budget - r.actual - committed),
            ...budgetAmounts(r.budget, r.actual),
            accountId: r.accountId,
            code: account.code,
            name: account.name,
            fundId: r.fundId,
            fundName: fund.name,
            version: r.version,
            status:
              r.budget === null
                ? 'UNBUDGETED'
                : r.actual + committed > r.budget
                  ? 'EXCEEDED'
                  : r.budget === 0n
                    ? 'ZERO_BUDGET'
                    : 'WITHIN',
          };
        })
        .sort((a, b) => a.code.localeCompare(b.code) || a.fundName.localeCompare(b.fundName));
      await this.p.audit.record(
        a,
        'budget.read',
        'annual-budget',
        String(q.year),
        ['year', 'fundId'],
        tx,
      );
      return {
        year: q.year,
        fundId: q.fundId ?? null,
        generatedAt: new Date().toISOString(),
        totals: budgetAmounts(budget, actual),
        items,
        overBudgetCount: items.filter((x) => x.status === 'EXCEEDED').length,
        unbudgetedCount: items.filter((x) => x.status === 'UNBUDGETED').length,
      };
    });
  }
  history(a: Actor, c: string, q: BudgetHistoryQuery): Promise<BudgetHistory> {
    return this.p.write(a, c, 'budget.read', async (tx) => {
      const where = await this.line(tx, c, q);
      const rows = await tx.budgetRevision.findMany({
        where: { ...where, ...(q.beforeVersion ? { version: { lt: q.beforeVersion } } : {}) },
        orderBy: { version: 'desc' },
        take: 31,
      });
      const users = new Map(
        (
          await tx.user.findMany({
            where: { churchId: c, id: { in: rows.map((r) => r.createdBy) } },
            select: { id: true, username: true },
          })
        ).map((u) => [u.id, u.username]),
      );
      // Return explicit history fields with the current account display name.
      await this.p.audit.record(
        a,
        'budget.history',
        'annual-budget',
        String(q.year),
        ['accountId', 'fundId'],
        tx,
      );
      return {
        items: rows.slice(0, 30).map((r) => ({
          id: r.id,
          version: r.version,
          amount: r.amount.toFixed(0),
          reason: r.reason,
          createdAt: r.createdAt.toISOString(),
          createdBy: r.createdBy,
          createdByName: users.get(r.createdBy) ?? '계정 없음',
        })),
        nextBeforeVersion: rows.length > 30 ? rows[29]!.version : null,
      };
    });
  }
}
