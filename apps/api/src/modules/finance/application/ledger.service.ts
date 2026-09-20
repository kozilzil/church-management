import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '../../identity/domain/actor';
import { FinancePolicy, bad, missing, page, type Tx } from './finance-policy.service';
import type {
  AccountDto,
  FundDto,
  PeriodDto,
  ReverseDto,
  FinancePageDto,
} from '../interface/finance.dto';
@Injectable()
export class LedgerService {
  constructor(@Inject(FinancePolicy) private readonly p: FinancePolicy) {}
  async definitions(a: Actor, c: string) {
    this.p.check(a, c, 'expense.read');
    return this.catalog(c);
  }
  async settings(a: Actor, c: string) {
    this.p.check(a, c, 'finance.manage');
    return this.catalog(c);
  }
  async ledgerDefinitions(a: Actor, c: string) {
    this.p.check(a, c, 'finance.readall');
    return this.catalog(c);
  }
  private async catalog(c: string) {
    return {
      accounts: await this.p.db.financeAccount.findMany({
        where: { churchId: c },
        orderBy: { code: 'asc' },
      }),
      funds: await this.p.db.financeFund.findMany({
        where: { churchId: c },
        orderBy: { name: 'asc' },
      }),
      periods: await this.p.db.financePeriod.findMany({
        where: { churchId: c },
        orderBy: { startsOn: 'desc' },
      }),
    };
  }
  account(a: Actor, c: string, d: AccountDto) {
    return this.p.write(
      a,
      c,
      'finance.manage',
      async (tx) => {
        const row = await tx.financeAccount.create({ data: { ...d, churchId: c } });
        await this.p.audit.record(a, 'finance.account.create', 'account', row.id, [], tx);
        return row;
      },
      true,
    );
  }
  fund(a: Actor, c: string, d: FundDto) {
    return this.p.write(
      a,
      c,
      'finance.manage',
      async (tx) => {
        const row = await tx.financeFund.create({ data: { ...d, churchId: c } });
        await this.p.audit.record(a, 'finance.fund.create', 'fund', row.id, [], tx);
        return row;
      },
      true,
    );
  }
  period(a: Actor, c: string, d: PeriodDto) {
    return this.p.write(
      a,
      c,
      'finance.manage',
      async (tx) => {
        const startsOn = this.p.date(d.startsOn),
          endsOn = this.p.date(d.endsOn);
        if (startsOn > endsOn) bad('시작일과 종료일을 확인하세요.');
        if (
          await tx.financePeriod.count({
            where: { churchId: c, startsOn: { lte: endsOn }, endsOn: { gte: startsOn } },
          })
        )
          bad('회계기간이 겹칩니다.');
        const row = await tx.financePeriod.create({
          data: { churchId: c, name: d.name, startsOn, endsOn },
        });
        await this.p.audit.record(a, 'finance.period.create', 'period', row.id, [], tx);
        return row;
      },
      true,
    );
  }
  close(a: Actor, c: string, id: string) {
    return this.p.write(
      a,
      c,
      'finance.close',
      async (tx) => {
        const row = await tx.financePeriod.findFirst({ where: { id, churchId: c } });
        if (!row) missing();
        if (row.closedAt) bad('이미 마감된 기간입니다.');
        await tx.financePeriod.update({ where: { id }, data: { closedAt: new Date() } });
        await this.p.audit.record(a, 'finance.period.close', 'period', id, [], tx);
        return { ok: true };
      },
      true,
    );
  }
  async postExpense(
    a: Actor,
    c: string,
    tx: Tx,
    d: {
      paidOn: string;
      amount: number;
      expenseAccount: string;
      assetAccount: string;
      fundId: string;
      requestId: string;
    },
  ) {
    const { period, date } = await this.p.openPeriod(c, d.paidOn, tx);
    await this.p.account(c, d.assetAccount, 'ASSET', tx);
    await this.p.account(c, d.expenseAccount, 'EXPENSE', tx);
    const j = await tx.journalEntry.create({
      data: {
        churchId: c,
        periodId: period.id,
        postedOn: date,
        postedBy: a.userId,
        description: '지출 ' + d.requestId,
        lines: {
          create: [
            {
              accountId: d.expenseAccount,
              fundId: d.fundId,
              debit: d.amount,
              credit: 0,
            },
            {
              accountId: d.assetAccount,
              fundId: d.fundId,
              debit: 0,
              credit: d.amount,
            },
          ],
        },
      },
    });
    return j.id;
  }
  async list(a: Actor, c: string, q: FinancePageDto) {
    this.p.check(a, c, 'finance.readall');
    const n = q.limit ?? 30;
    const rows = await this.p.db.journalEntry.findMany({
      where: { churchId: c, ...(q.cursor ? { id: { gt: q.cursor } } : {}) },
      orderBy: { id: 'asc' },
      take: n + 1,
      include: { lines: true },
    });
    return page(
      rows.map((r) => ({
        id: r.id,
        churchId: r.churchId,
        periodId: r.periodId,
        postedOn: r.postedOn,
        postedBy: r.postedBy,
        description: r.description,
        reversalOf: r.reversalOf,
        createdAt: r.createdAt,
        lines: r.lines.map((l) => ({
          ...l,
          debit: l.debit.toNumber(),
          credit: l.credit.toNumber(),
        })),
      })),
      n,
    );
  }
  reverse(a: Actor, c: string, id: string, d: ReverseDto) {
    return this.p.write(
      a,
      c,
      'finance.reverse',
      async (tx) => {
        const original = await tx.journalEntry.findFirst({
          where: { churchId: c, id },
          include: { lines: true },
        });
        if (!original) missing();
        if (original.reversalOf || (await tx.journalEntry.count({ where: { reversalOf: id } })))
          bad('이미 역분개되었거나 역분개 전표입니다.');
        const { period, date } = await this.p.openPeriod(c, d.postedOn, tx);
        if (date < original.postedOn) bad('원전표 이전 날짜로 정정할 수 없습니다.');
        const row = await tx.journalEntry.create({
          data: {
            churchId: c,
            periodId: period.id,
            postedOn: date,
            postedBy: a.userId,
            description: d.reason,
            reversalOf: id,
            lines: {
              create: original.lines.map((l) => ({
                accountId: l.accountId,
                fundId: l.fundId,
                debit: l.credit,
                credit: l.debit,
              })),
            },
          },
        });
        await this.p.audit.record(
          a,
          'finance.journal.reverse',
          'journal',
          row.id,
          ['reversalOf'],
          tx,
        );
        return { id: row.id };
      },
      true,
    );
  }
}
