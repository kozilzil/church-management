export const MAX_EVIDENCE_SIZE = 10 * 1024 * 1024;
export function evidenceMime(bytes: Buffer): string | null {
  if (bytes.length < 12 || bytes.length > MAX_EVIDENCE_SIZE) return null;
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  return null;
}
export function evidenceName(name: string) {
  // Multipart filename parameters commonly arrive as Latin-1 decoded UTF-8 bytes.
  if ([...name].every((c) => c.charCodeAt(0) <= 255)) {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    if (!decoded.includes('\uFFFD')) name = decoded;
  }
  return (
    name
      .normalize('NFC')
      .replace(/[\\/]/g, '_')
      .split('')
      .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
      .join('')
      .slice(0, 150) || '증빙'
  );
}
