export class PolicyError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function normalizedName(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ');
}
export function normalizedPhone(value: string): string {
  return value.replace(/\D/g, '');
}
export function effectiveDate(value: string, timezone: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value ||
    value > today
  )
    throw new PolicyError('INVALID_EFFECTIVE_DATE', '미래 또는 올바르지 않은 적용일입니다.');
  return date;
}
export function requireAfter(start: Date, end: Date): void {
  if (end <= start)
    throw new PolicyError('INVALID_PERIOD', '종료·이동일은 기존 시작일 이후여야 합니다.');
}
export function requireTransition(current: string, next: string, allowed: string[]): void {
  if (current === next || !allowed.includes(next))
    throw new PolicyError('INVALID_STATUS_TRANSITION', '허용되지 않은 상태 변경입니다.');
}
