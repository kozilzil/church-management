import { describe, it, expect } from 'vitest';
import { validApprovalLine, canPay, integerWon } from './policy';
import { evidenceMime, evidenceName } from './evidence';
describe('Expense boundary rules', () => {
  it('requires unique ordered non-requester approvers and separates payment', () => {
    expect(validApprovalLine(['b', 'c'], 'a')).toBe(true);
    expect(validApprovalLine([], 'a')).toBe(false);
    expect(validApprovalLine(['b', 'b'], 'a')).toBe(false);
    expect(validApprovalLine(['a'], 'a')).toBe(false);
    expect(canPay('a', ['b', 'c'], 'd')).toBe(true);
    expect(canPay('a', ['b'], 'b')).toBe(false);
    expect(canPay('a', ['b'], 'a')).toBe(false);
  });
  it('accepts only positive bounded whole won', () => {
    expect(integerWon(1)).toBe(true);
    for (const n of [0, -1, 1.2, NaN, Infinity, 1000000000000]) expect(integerWon(n)).toBe(false);
  });
  it('checks file signatures and neutralizes path/control characters in display names', () => {
    expect(evidenceMime(Buffer.from('<script>alert(1)</script>'))).toBeNull();
    expect(evidenceMime(Buffer.from('%PDF-1.7\nsynthetic'))).toBe('application/pdf');
    expect(evidenceName('../receipt\r\n.pdf')).toBe('.._receipt.pdf');
    expect(evidenceName(Buffer.from('영수증.jpg').toString('latin1'))).toBe('영수증.jpg');
  });
});
