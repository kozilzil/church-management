export interface BudgetAmounts {
  budget: string | null;
  actual: string;
  remaining: string | null;
  executionRate: string | null;
}
export interface BudgetRow extends BudgetAmounts {
  committed: string;
  available: string | null;
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

export interface BudgetChangeView {
  id: string;
  year: number;
  accountId: string;
  fundId: string;
  baseVersion: number;
  amount: string;
  reason: string;
  requestedBy: string;
  requester: string;
  createdAt: string;
  decision: null | {
    decision: 'APPROVED' | 'REJECTED' | 'CANCELLED';
    reason: string;
    decidedBy: string;
    decider: string;
    createdAt: string;
  };
}
export interface BudgetChanges {
  items: BudgetChangeView[];
  nextCursor: string | null;
}
export interface BudgetControlPolicy {
  mode: 'WARN' | 'BLOCK';
  version: number;
  legacyPending: number;
}
export interface ExpenseBudgetStatus {
  year: number | null;
  mode: 'WARN' | 'BLOCK';
  status: 'WITHIN' | 'UNBUDGETED' | 'EXCEEDED' | 'LEGACY_YEAR';
  budgetVersion: number;
  policyVersion: number;
}
