export interface BudgetAmounts {
  budget: string | null;
  actual: string;
  remaining: string | null;
  executionRate: string | null;
}
export interface BudgetRow extends BudgetAmounts {
  accountId: string;
  code: string;
  name: string;
  fundId: string;
  fundName: string;
  version: number;
  status: 'UNBUDGETED' | 'ZERO_BUDGET' | 'WITHIN' | 'EXCEEDED';
}
export interface AnnualBudget {
  year: number;
  fundId: string | null;
  generatedAt: string;
  totals: BudgetAmounts;
  overBudgetCount: number;
  unbudgetedCount: number;
  items: BudgetRow[];
}
export interface BudgetRevisionView {
  id: string;
  version: number;
  amount: string;
  reason: string;
  createdAt: string;
  createdBy: string;
  createdByName: string;
}
export interface BudgetHistory {
  items: BudgetRevisionView[];
  nextBeforeVersion: number | null;
}
