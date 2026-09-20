import { HttpStatus, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../src/platform/app.factory';

describe('API bootstrap', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the liveness endpoint with a correlation id', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/liveness')
      .set('x-correlation-id', 'e2e-request-1')
      .expect(HttpStatus.OK);

    expect(response.headers['x-correlation-id']).toBe('e2e-request-1');
    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'church-management-api',
    });
  });

  it('returns the standard API error shape', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/not-found')
      .set('x-correlation-id', 'e2e-request-2')
      .expect(HttpStatus.NOT_FOUND);

    expect(response.body).toEqual({
      error: {
        code: 'HTTP_404',
        message: 'Cannot GET /api/v1/not-found',
        details: [],
        correlationId: 'e2e-request-2',
      },
    });
  });
});
