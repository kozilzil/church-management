import { randomUUID } from 'node:crypto';
import type { Options } from 'pino-http';

export const SENSITIVE_LOG_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
] as const;

export function normalizeCorrelationId(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (candidate && /^[a-zA-Z0-9._:-]{1,128}$/.test(candidate)) {
    return candidate;
  }

  return randomUUID();
}

export function createHttpLoggerOptions(): Options {
  return {
    level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
    redact: {
      paths: [...SENSITIVE_LOG_PATHS],
      censor: '[REDACTED]',
    },
    genReqId: (request, response) => {
      const correlationId = normalizeCorrelationId(request.headers['x-correlation-id']);
      response.setHeader('x-correlation-id', correlationId);
      return correlationId;
    },
    customAttributeKeys: {
      reqId: 'correlationId',
    },
  };
}
