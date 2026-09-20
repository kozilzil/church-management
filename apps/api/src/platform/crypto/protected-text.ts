import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
export function careKey() {
  const raw = process.env.CARE_ENCRYPTION_KEY ?? '';
  if (!/^[a-f0-9]{64}$/i.test(raw)) throw new Error('CARE_ENCRYPTION_KEY is not configured');
  return Buffer.from(raw, 'hex');
}
export function sealText(text: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', careKey(), iv),
    encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}
export function openText(text: string) {
  const raw = Buffer.from(text, 'base64'),
    cipher = createDecipheriv('aes-256-gcm', careKey(), raw.subarray(0, 12));
  cipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([cipher.update(raw.subarray(28)), cipher.final()]).toString('utf8');
}
