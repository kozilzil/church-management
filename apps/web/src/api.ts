export class ApiFailure extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
let csrf = '';
export function setCsrf(value: string) {
  csrf = value;
}
export async function api<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    credentials: 'same-origin',
    ...(body !== undefined
      ? {
          method,
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const value = await response.json();
  if (!response.ok)
    throw new ApiFailure(
      value.error?.message ?? '요청에 실패했습니다.',
      value.error?.code ?? 'UNKNOWN',
      response.status,
    );
  return value as T;
}
