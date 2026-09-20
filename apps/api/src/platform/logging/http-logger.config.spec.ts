import { describe, expect, it } from 'vitest';

import { normalizeCorrelationId, SENSITIVE_LOG_PATHS } from './http-logger.config';

describe('HTTP logger configuration', () => {
  it('redacts authentication and session headers', () => {
    expect(SENSITIVE_LOG_PATHS).toContain('req.headers.authorization');
    expect(SENSITIVE_LOG_PATHS).toContain('req.headers.cookie');
    expect(SENSITIVE_LOG_PATHS).toContain('req.headers["x-api-key"]');
    expect(SENSITIVE_LOG_PATHS).toContain('res.headers["set-cookie"]');
  });

  it('keeps a safe caller correlation id', () => {
    expect(normalizeCorrelationId('request-123')).toBe('request-123');
  });

  it('replaces an unsafe correlation id', () => {
    expect(normalizeCorrelationId('contains spaces')).not.toBe('contains spaces');
  });
});
