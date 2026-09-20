import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  FinancialReport,
  ReportAccountRow,
  ReportTotals,
  ReportLine,
} from '@church/contracts';
import type { Actor } from '../../identity/domain/actor';
import { FinancePolicy, bad, missing, type Tx } from './finance-policy.service';
import type { ReportQuery, ReportLinesQuery, ReportSnapshotDto } from '../interface/report.dto';

type Amounts = { income: bigint; expense: bigint; openingAssets: bigint; assetMovement: bigint };
const zero = (): Amounts => ({ income: 0n, expense: 0n, openingAssets: 0n, assetMovement: 0n });
function totals(a: Amounts): ReportTotals {
  return {
    income: String(a.income),
    expense: String(a.expense),
    net: String(a.income - a.expense),
    openingAssets: String(a.openingAssets),
    assetMovement: String(a.assetMovement),
    closingAssets: String(a.openingAssets + a.assetMovement),
  };
}
// Treat names as untrusted spreadsheet text; amounts remain exact integer cells.
function cell(s: string, text = false) {
  let head = s;
  while (head && (head.charCodeAt(0) <= 32 || /\s/.test(head[0]!))) head = head.slice(1);
  const safe = text && /^[=+\-@]/.test(head) ? "'" + s : s;
  return '"' + safe.replaceAll('"', '""') + '"';
}
@Injectable()
export class ReportService {
  constructor(@Inject(FinancePolicy) private readonly p: FinancePolicy) {}
  async definitions(a: Actor, c: string) {
    this.p.check(a, c, 'finance.report');
    const church = await this.p.db.church.findUniqueOrThrow({
      where: { id: c },
      select: { timezone: true },
    });
    return {
      timezone: church.timezone,
      funds: await this.p.db.financeFund.findMany({
        where: { churchId: c },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    };
  }
  private async context(tx: Tx, c: string, q: ReportQuery & { ledgerVersion?: string }) {
    const from = this.p.date(q.from),
      to = this.p.date(q.to);
    if (q.from < '1900-01-01' || to < from || to.getTime() - from.getTime() >= 366 * 86400000)
      bad('조회 기간은 1900년 이후, 시작일부터 최대 366일로 지정하세요.');
    if (q.fundId && !(await tx.financeFund.count({ where: { churchId: c, id: q.fundId } })))
      missing();
    // FinancePolicy acquires the church posting lock before these reads. All supported
    // posting paths allocate their journal transaction ID after that lock. Since the
    // ledger is immutable, this watermark also freezes later drill-downs and exports.
    const max =
      (await tx.journalEntry.aggregate({ where: { churchId: c }, _max: { createdXid: true } }))._max
        .createdXid ?? 0n;
    const version = q.ledgerVersion === undefined ? max : BigInt(q.ledgerVersion);
    if (version < 0n || version > max) bad('보고서를 다시 조회하세요.');
    return { from, to, version };
  }
  private async aggregate(
    tx: Tx,
    c: string,
    q: ReportQuery & { ledgerVersion?: string },
  ): Promise<FinancialReport> {
    const { from, to, version } = await this.context(tx, c, q);
    const rows = await tx.$queryRaw<
      {
        accountId: string;
        fundId: string;
        month: string | null;
        debit: Prisma.Decimal;
        credit: Prisma.Decimal;
      }[]
    >(Prisma.sql`
      SELECT l.account_id AS "accountId", l.fund_id AS "fundId",
        CASE WHEN j.posted_on < ${from} THEN NULL ELSE to_char(j.posted_on, 'YYYY-MM') END AS month,
        sum(l.debit) AS debit, sum(l.credit) AS credit
      FROM journal_line l JOIN journal_entry j ON j.church_id=l.church_id AND j.id=l.journal_id
      WHERE j.church_id=${c}::uuid AND j.posted_on <= ${to} AND j.created_xid <= ${version}
        ${q.fundId ? Prisma.sql`AND l.fund_id=${q.fundId}::uuid` : Prisma.empty}
      GROUP BY l.account_id,l.fund_id,month`);
    const accounts = new Map(
      (await tx.financeAccount.findMany({ where: { churchId: c }, orderBy: { code: 'asc' } })).map(
        (x) => [x.id, x],
      ),
    );
    const funds = await tx.financeFund.findMany({
      where: { churchId: c, ...(q.fundId ? { id: q.fundId } : {}) },
      orderBy: { name: 'asc' },
    });
    const fundMap = new Map(funds.map((x) => [x.id, x]));
    const monthly = new Map<string, Amounts>();
    for (
      let d = new Date(q.from.slice(0, 7) + '-01T00:00:00Z');
      d <= to;
      d.setUTCMonth(d.getUTCMonth() + 1)
    )
      monthly.set(d.toISOString().slice(0, 7), zero());
    const byFund = new Map(funds.map((x) => [x.id, zero()]));
    const byAccount = new Map<
      string,
      { row: ReportAccountRow; opening: bigint; debit: bigint; credit: bigint }
    >();
    const all = zero();
    for (const r of rows) {
      const account = accounts.get(r.accountId)!,
        fund = fundMap.get(r.fundId)!;
      const debit = BigInt(r.debit.toFixed(0)),
        credit = BigInt(r.credit.toFixed(0)),
        movement = debit - credit;
      const key = r.accountId + ':' + r.fundId;
      if (!byAccount.has(key))
        byAccount.set(key, {
          row: {
            accountId: account.id,
            code: account.code,
            name: account.name,
            kind: account.kind,
            fundId: fund.id,
            fundName: fund.name,
            opening: '0',
            debit: '0',
            credit: '0',
            closing: '0',
          },
          opening: 0n,
          debit: 0n,
          credit: 0n,
        });
      const line = byAccount.get(key)!;
      if (r.month === null) line.opening += movement;
      else {
        line.debit += debit;
        line.credit += credit;
      }
      const targets = [all, byFund.get(r.fundId)!];
      if (r.month !== null) targets.push(monthly.get(r.month)!);
      for (const t of targets) {
        if (account.kind === 'ASSET') {
          if (r.month === null) t.openingAssets += movement;
          else t.assetMovement += movement;
        }
        if (r.month !== null && account.kind === 'REVENUE') t.income -= movement;
        if (r.month !== null && account.kind === 'EXPENSE') t.expense += movement;
      }
    }
    let opening = all.openingAssets;
    const months = [...monthly].map(([month, a]) => {
      a.openingAssets = opening;
      opening += a.assetMovement;
      return { month, ...totals(a) };
    });
    return {
      selection: {
        from: q.from,
        to: q.to,
        ...(q.fundId ? { fundId: q.fundId } : {}),
        ledgerVersion: String(version),
      },
      generatedAt: new Date().toISOString(),
      fundName: q.fundId ? fundMap.get(q.fundId)!.name : '전체 기금',
      totals: totals(all),
      months,
      funds: funds.map((f) => ({ id: f.id, name: f.name, ...totals(byFund.get(f.id)!) })),
      accounts: [...byAccount.values()]
        .map(({ row, opening, debit, credit }) => {
          const sign = ['ASSET', 'EXPENSE'].includes(row.kind) ? 1n : -1n;
          return {
            ...row,
            opening: String(opening * sign),
            debit: String(debit),
            credit: String(credit),
            closing: String((opening + debit - credit) * sign),
          };
        })
        .sort((a, b) => a.code.localeCompare(b.code) || a.fundName.localeCompare(b.fundName)),
    };
  }
  report(a: Actor, c: string, q: ReportQuery) {
    return this.p.write(a, c, 'finance.report', async (tx) => {
      const report = await this.aggregate(tx, c, q);
      await this.p.audit.record(
        a,
        'finance.report.read',
        'financial-report',
        report.selection.ledgerVersion,
        ['from', 'to', 'fundId'],
        tx,
      );
      return report;
    });
  }
  lines(a: Actor, c: string, q: ReportLinesQuery) {
    this.p.check(a, c, 'finance.readall');
    return this.p.write(a, c, 'finance.report', async (tx) => {
      const { from, to, version } = await this.context(tx, c, q);
      if (!(await tx.financeAccount.count({ where: { churchId: c, id: q.accountId } }))) missing();
      const where: Prisma.JournalLineWhereInput = {
        churchId: c,
        accountId: q.accountId,
        ...(q.fundId ? { fundId: q.fundId } : {}),
        entry: { churchId: c, postedOn: { gte: from, lte: to }, createdXid: { lte: version } },
      };
      const cursor = q.cursor
        ? await tx.journalLine.findFirst({
            where: { ...where, id: q.cursor },
            include: { entry: true },
          })
        : null;
      if (q.cursor && !cursor) bad('상세 조회 위치를 확인하세요.');
      const rows = await tx.journalLine.findMany({
        where: {
          ...where,
          ...(cursor
            ? {
                OR: [
                  { entry: { postedOn: { gt: cursor.entry.postedOn } } },
                  { entry: { postedOn: cursor.entry.postedOn }, id: { gt: cursor.id } },
                ],
              }
            : {}),
        },
        include: { entry: true },
        orderBy: [{ entry: { postedOn: 'asc' } }, { id: 'asc' }],
        take: 51,
      });
      const page = rows.slice(0, 50);
      const originalIds = page.map((r) => r.entry.reversalOf ?? r.journalId);
      const sources = new Map<string, NonNullable<ReportLine['source']>>();
      if (a.permissions.includes('offering.read')) {
        for (const o of await tx.offering.findMany({
          where: { churchId: c, journalId: { in: originalIds } },
          select: { id: true, journalId: true },
        }))
          sources.set(o.journalId!, { kind: 'offering', id: o.id });
      }
      if (a.permissions.includes('expense.read')) {
        for (const e of await tx.expensePayment.findMany({
          where: { churchId: c, journalId: { in: originalIds } },
          select: { requestId: true, journalId: true },
        }))
          sources.set(e.journalId, { kind: 'expense', id: e.requestId });
      }
      const items: ReportLine[] = [];
      for (const r of page) {
        const source = sources.get(r.entry.reversalOf ?? r.journalId) ?? null;
        items.push({
          id: r.id,
          journalId: r.journalId,
          postedOn: r.entry.postedOn.toISOString().slice(0, 10),
          reversalOf: r.entry.reversalOf,
          debit: r.debit.toFixed(0),
          credit: r.credit.toFixed(0),
          source,
        });
      }
      await this.p.audit.record(
        a,
        'finance.report.lines',
        'financial-report',
        String(version),
        ['accountId', 'fundId'],
        tx,
      );
      return { items, nextCursor: rows.length > 50 ? rows[49]!.id : null };
    });
  }
  export(a: Actor, c: string, q: ReportSnapshotDto) {
    this.p.check(a, c, 'finance.report');
    return this.p.write(
      a,
      c,
      'finance.export',
      async (tx) => {
        const r = await this.aggregate(tx, c, q);
        const csvRows = [
          ['재정보고서', q.from, q.to, r.fundName, '원장 기준', q.ledgerVersion]
            .map((s) => cell(s, true))
            .join(','),
          ['구분', '이름', '기초 자산', '수입', '지출', '수지 차액', '자산 증감', '기말 자산']
            .map((s) => cell(s))
            .join(','),
          ...[
            { label: '합계', name: r.fundName, ...r.totals },
            ...r.months.map((m) => ({ label: '월별', name: m.month, ...m })),
            ...r.funds.map((f) => ({ label: '기금별', ...f })),
          ].map((t) =>
            [
              cell(t.label),
              cell(t.name, true),
              ...[
                t.openingAssets,
                t.income,
                t.expense,
                t.net,
                t.assetMovement,
                t.closingAssets,
              ].map((s) => cell(s)),
            ].join(','),
          ),
          '',
          ['계정코드', '계정명', '유형', '기금', '기초 잔액', '기간 차변', '기간 대변', '기말 잔액']
            .map((s) => cell(s))
            .join(','),
          ...r.accounts.map((t) =>
            [
              ...[t.code, t.name, t.kind, t.fundName].map((s) => cell(s, true)),
              ...[t.opening, t.debit, t.credit, t.closing].map((s) => cell(s)),
            ].join(','),
          ),
        ];
        await this.p.audit.record(
          a,
          'finance.report.export',
          'financial-report',
          String(q.ledgerVersion),
          ['from', 'to', 'fundId'],
          tx,
        );
        return {
          filename: `finance-${q.from}-${q.to}.csv`,
          csv: '\uFEFF' + csvRows.join('\r\n') + '\r\n',
        };
      },
      true,
    );
  }
}
