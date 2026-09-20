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

export async function uploadEvidence<T>(path: string, file: File): Promise<T> {
  const body = new FormData();
  body.append('file', file);
  const response = await fetch(`/api/v1${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'x-csrf-token': csrf },
    body,
  });
  const value = await response.json();
  if (!response.ok)
    throw new ApiFailure(
      value.error?.message ?? '첨부하지 못했습니다.',
      value.error?.code ?? 'UNKNOWN',
      response.status,
    );
  return value as T;
}
export async function evidenceBlob(path: string): Promise<Blob> {
  const response = await fetch(`/api/v1${path}`, { credentials: 'same-origin' });
  if (!response.ok) {
    const value = await response.json();
    throw new ApiFailure(
      value.error?.message ?? '파일을 읽지 못했습니다.',
      value.error?.code ?? 'UNKNOWN',
      response.status,
    );
  }
  return response.blob();
}
