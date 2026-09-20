import { describe, it, expect } from 'vitest';
import { budgetAmounts } from './budget-amounts';
describe('Budget amounts', () => {
  it('distinguishes unallocated, zero, and exceeded budgets without dividing by zero', () => {
    expect(budgetAmounts(null, 20n)).toEqual({
      budget: null,
      actual: '20',
      remaining: null,
      executionRate: null,
    });
    expect(budgetAmounts(0n, 20n)).toEqual({
      budget: '0',
      actual: '20',
      remaining: '-20',
      executionRate: null,
    });
    expect(budgetAmounts(10n, 20n)).toEqual({
      budget: '10',
      actual: '20',
      remaining: '-10',
      executionRate: '200.00',
    });
  });
  it('truncates two percentage decimals, preserving negative net expense from reversals', () => {
    expect(budgetAmounts(3n, 1n).executionRate).toBe('33.33');
    expect(budgetAmounts(3n, -1n).executionRate).toBe('-33.33');
    expect(budgetAmounts(100n, -25n)).toMatchObject({ remaining: '125', executionRate: '-25.00' });
    expect(budgetAmounts(100000n, 1n).executionRate).toBe('0.00');
  });
  it('preserves sums beyond JS safe integers and rates above 100 percent', () => {
    expect(budgetAmounts(9999999999999991n, 10000000000000001n)).toEqual({
      budget: '9999999999999991',
      actual: '10000000000000001',
      remaining: '-10',
      executionRate: '100.00',
    });
    expect(budgetAmounts(1n, 9999999999999991n).executionRate).toBe('999999999999999100.00');
  });
});
