import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { BudgetChanges } from '@church/contracts';
import type { Actor } from '../../identity/domain/actor';
import type {
  BudgetChangesQuery,
  BudgetDecisionDto,
  BudgetCancelDto,
} from '../interface/budget.dto';
import { FinancePolicy, conflict, denied, missing } from './finance-policy.service';
@Injectable()
export class BudgetApprovalService {
  constructor(@Inject(FinancePolicy) private readonly p: FinancePolicy) {}
  list(a: Actor, c: string, q: BudgetChangesQuery): Promise<BudgetChanges> {
    return this.p.write(a, c, 'budget.read', async (tx) => {
      const filter = { churchId: c, year: q.year, ...(q.fundId ? { fundId: q.fundId } : {}) };
      if (q.fundId && !(await tx.financeFund.count({ where: { churchId: c, id: q.fundId } })))
        missing();
      const anchor = q.cursor
        ? await tx.budgetChange.findFirst({ where: { ...filter, id: q.cursor } })
        : null;
      if (q.cursor && !anchor) missing();
      // Compare timestamps in PostgreSQL: JS Date would truncate microseconds and skip cursor peers.
      const pageIds = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id FROM budget_change WHERE church_id=${c}::uuid AND year=${q.year}
        ${q.fundId ? Prisma.sql`AND fund_id=${q.fundId}::uuid` : Prisma.empty}
        ${q.cursor ? Prisma.sql`AND (created_at,id)<(SELECT created_at,id FROM budget_change WHERE church_id=${c}::uuid AND id=${q.cursor}::uuid)` : Prisma.empty}
        ORDER BY created_at DESC,id DESC LIMIT 31`);
      const rows = await tx.budgetChange.findMany({
        where: { ...filter, id: { in: pageIds.map((x) => x.id) } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: { decision: true },
      });
      const ids = rows.flatMap((r) => [
        r.requestedBy,
        ...(r.decision ? [r.decision.decidedBy] : []),
      ]);
      const names = new Map(
        (
          await tx.user.findMany({
            where: { churchId: c, id: { in: ids } },
            select: { id: true, username: true },
          })
        ).map((u) => [u.id, u.username]),
      );
      await this.p.audit.record(a, 'budget.changes.read', 'annual-budget', String(q.year), [], tx);
      return {
        items: rows.slice(0, 30).map((r) => ({
          id: r.id,
          year: r.year,
          accountId: r.accountId,
          fundId: r.fundId,
          baseVersion: r.baseVersion,
          amount: r.amount.toFixed(0),
          reason: r.reason,
          requestedBy: r.requestedBy,
          requester: names.get(r.requestedBy) ?? '',
          createdAt: r.createdAt.toISOString(),
          decision: r.decision
            ? {
                decision: r.decision.decision as 'APPROVED' | 'REJECTED' | 'CANCELLED',
                reason: r.decision.reason,
                decidedBy: r.decision.decidedBy,
                decider: names.get(r.decision.decidedBy) ?? '',
                createdAt: r.decision.createdAt.toISOString(),
              }
            : null,
        })),
        nextCursor: rows.length > 30 ? rows[29]!.id : null,
      };
    });
  }
  decide(a: Actor, c: string, id: string, d: BudgetDecisionDto | BudgetCancelDto, cancel = false) {
    return this.p.write(
      a,
      c,
      cancel ? 'budget.write' : 'budget.approve',
      async (tx) => {
        this.p.check(a, c, 'budget.read');
        const row = await tx.budgetChange.findFirst({
          where: { id, churchId: c },
          include: { decision: true },
        });
        if (!row) missing();
        if (cancel ? row.requestedBy !== a.userId : row.requestedBy === a.userId) denied();
        if (row.decision) conflict();
        const decision = cancel ? 'CANCELLED' : (d as BudgetDecisionDto).decision;
        const where = { churchId: c, year: row.year, accountId: row.accountId, fundId: row.fundId };
        const latest = await tx.budgetRevision.findFirst({ where, orderBy: { version: 'desc' } });
        if (decision === 'APPROVED' && (latest?.version ?? 0) !== row.baseVersion) conflict();
        await tx.budgetDecision.create({
          data: {
            churchId: c,
            changeId: id,
            decision,
            reason: d.reason.trim(),
            decidedBy: a.userId,
          },
        });
        const revision =
          decision === 'APPROVED'
            ? await tx.budgetRevision.create({
                data: {
                  ...where,
                  changeId: id,
                  version: row.baseVersion + 1,
                  amount: row.amount,
                  reason: row.reason,
                  createdBy: row.requestedBy,
                },
              })
            : null;
        await this.p.audit.record(
          a,
          'budget.' + decision.toLowerCase(),
          'budget-change',
          id,
          [],
          tx,
        );
        return {
          id,
          decision,
          revisionId: revision?.id ?? null,
          version: revision?.version ?? null,
        };
      },
      true,
    );
  }
}
