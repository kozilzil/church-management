import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 128)
    throw new Error('Password must have 12–128 characters.');
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const parts = (stored ?? '').split('$');
  const salt = parts[1] ?? '00000000000000000000000000000000';
  const derived = await derive(password, salt);
  const expected = Buffer.from(parts[2] ?? '', 'hex');
  return (
    parts[0] === 'scrypt' &&
    expected.length === derived.length &&
    timingSafeEqual(expected, derived)
  );
}
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const csrfToken = (token: string) =>
  createHmac('sha256', token).update('church-csrf').digest('hex');
export function equalSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function encryptionKey(): Buffer {
  const value = process.env.MFA_ENCRYPTION_KEY;
  if (!value || !/^[0-9a-f]{64}$/i.test(value))
    throw new Error('MFA_ENCRYPTION_KEY must contain 64 hexadecimal characters.');
  return Buffer.from(value, 'hex');
}
export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((x) => x.toString('hex')).join('.');
}
export function decryptSecret(value: string): string {
  const [iv, tag, ciphertext] = value.split('.');
  if (!iv || !tag || !ciphertext) throw new Error('Invalid encrypted MFA secret.');
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'hex'));
  cipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([cipher.update(Buffer.from(ciphertext, 'hex')), cipher.final()]).toString(
    'utf8',
  );
}
export function newTotpSecret(): string {
  return randomBytes(20).toString('hex');
}
export function base32(hex: string): string {
  let bits = '';
  for (const byte of Buffer.from(hex, 'hex')) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5)
    out += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}
export function totp(hex: string, time = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30000)));
  const hash = createHmac('sha1', Buffer.from(hex, 'hex')).update(counter).digest();
  const offset = hash[hash.length - 1]! & 15;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}
export function verifyTotp(hex: string, value: string): boolean {
  return (
    /^\d{6}$/.test(value) &&
    [-30000, 0, 30000].some((offset) => equalSecret(totp(hex, Date.now() + offset), value))
  );
}

export function matchingTotpCounter(secret: string, value: string): number | null {
  if (!/^\d{6}$/.test(value)) return null;
  const now = Date.now();
  for (const offset of [-30000, 0, 30000])
    if (equalSecret(totp(secret, now + offset), value)) return Math.floor((now + offset) / 30000);
  return null;
}
