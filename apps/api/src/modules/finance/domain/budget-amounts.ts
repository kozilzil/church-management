import type { BudgetAmounts } from '@church/contracts';
export function budgetAmounts(budget: bigint | null, actual: bigint): BudgetAmounts {
  let executionRate: string | null = null;
  if (budget !== null && budget > 0n) {
    // Truncate to two percentage decimals without converting money to floating point.
    const points = (actual * 10000n) / budget;
    const magnitude = points < 0n ? -points : points;
    executionRate = `${points < 0n ? '-' : ''}${magnitude / 100n}.${String(magnitude % 100n).padStart(2, '0')}`;
  }
  return {
    budget: budget === null ? null : String(budget),
    actual: String(actual),
    remaining: budget === null ? null : String(budget - actual),
    executionRate,
  };
}
