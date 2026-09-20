// Aggregate won amounts are decimal strings: lifetime totals may exceed JS safe integers.
export interface ReportSelection {
  from: string;
  to: string;
  fundId?: string;
}
export interface ReportSnapshot extends ReportSelection {
  ledgerVersion: string;
}
export interface ReportTotals {
  income: string;
  expense: string;
  net: string;
  openingAssets: string;
  assetMovement: string;
  closingAssets: string;
}
export interface ReportAccountRow {
  accountId: string;
  code: string;
  name: string;
  kind: string;
  fundId: string;
  fundName: string;
  opening: string;
  debit: string;
  credit: string;
  closing: string;
}
export interface FinancialReport {
  selection: ReportSnapshot;
  generatedAt: string;
  fundName: string;
  totals: ReportTotals;
  months: (ReportTotals & { month: string })[];
  funds: (ReportTotals & { id: string; name: string })[];
  accounts: ReportAccountRow[];
}
export interface ReportLine {
  id: string;
  journalId: string;
  postedOn: string;
  reversalOf: string | null;
  debit: string;
  credit: string;
  source: { kind: 'offering' | 'expense'; id: string } | null;
}
