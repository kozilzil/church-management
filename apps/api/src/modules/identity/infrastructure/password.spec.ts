import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  totp,
  encryptSecret,
  decryptSecret,
  base32,
} from './password';
describe('Authentication cryptography', () => {
  it('uses salted password hashes and rejects the wrong password', async () => {
    const hash = await hashPassword('test-password-1234');
    expect(await verifyPassword('test-password-1234', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
    expect(await hashPassword('test-password-1234')).not.toBe(hash);
  });
  it('matches RFC 6238 SHA-1 test vector truncated to six digits', () => {
    expect(totp(Buffer.from('12345678901234567890').toString('hex'), 59000)).toBe('287082');
    expect(base32(Buffer.from('foo').toString('hex'))).toBe('MZXW6');
  });
  it('detects tampering of encrypted MFA secrets', () => {
    process.env.MFA_ENCRYPTION_KEY = '12'.repeat(32);
    const value = encryptSecret('test');
    expect(decryptSecret(value)).toBe('test');
    expect(() => decryptSecret(value.slice(0, -2) + '00')).toThrow();
    delete process.env.MFA_ENCRYPTION_KEY;
  });
});
