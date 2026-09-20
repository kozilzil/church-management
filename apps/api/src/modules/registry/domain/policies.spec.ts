import { describe, it, expect } from 'vitest';
import {
  effectiveDate,
  requireAfter,
  requireTransition,
  normalizedName,
  normalizedPhone,
} from './policies';
describe('Membership policies', () => {
  it('rejects impossible and future dates', () => {
    expect(() => effectiveDate('2025-02-30', 'Asia/Seoul')).toThrow();
    expect(() => effectiveDate('2999-01-01', 'Asia/Seoul')).toThrow();
    expect(effectiveDate('2024-02-29', 'Asia/Seoul').toISOString()).toContain('2024-02-29');
  });
  it('requires positive periods and configured transitions', () => {
    expect(() => requireAfter(new Date('2020-01-01'), new Date('2020-01-01'))).toThrow();
    expect(() => requireTransition('DECEASED', 'ACTIVE', [])).toThrow();
    expect(() => requireTransition('ACTIVE', 'INACTIVE', ['INACTIVE'])).not.toThrow();
  });
  it('normalizes search values without changing stored display values', () => {
    expect(normalizedName('  김  교인 ')).toBe('김 교인');
    expect(normalizedPhone('010-1234-5678')).toBe('01012345678');
  });
});
