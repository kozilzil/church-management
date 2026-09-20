import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createApplication } from '../src/platform/app.factory';
import { AccessService } from '../src/modules/identity/application/access.service';

describe('Identity boundary', () => {
  let app: INestApplication;
  beforeAll(async () => {
    process.env.AUTH_ADAPTER = 'test-header';
    app = await createApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
    delete process.env.AUTH_ADAPTER;
  });
  it('distinguishes missing authentication, permission, and scope', async () => {
    const endpoint = '/api/v1/churches/a/access';
    expect((await request(app.getHttpServer()).get(endpoint)).body.error.code).toBe(
      'UNAUTHENTICATED',
    );
    expect(
      (
        await request(app.getHttpServer())
          .get(endpoint)
          .set('x-test-user', 'u')
          .set('x-test-church', 'a')
      ).body.error.code,
    ).toBe('PERMISSION_DENIED');
    expect(
      (
        await request(app.getHttpServer())
          .get(endpoint)
          .set('x-test-user', 'u')
          .set('x-test-church', 'b')
          .set('x-test-permissions', 'identity.read')
      ).body.error.code,
    ).toBe('CHURCH_SCOPE_VIOLATION');
    await request(app.getHttpServer())
      .get(endpoint)
      .set('x-test-user', 'u')
      .set('x-test-church', 'a')
      .set('x-test-permissions', 'identity.read')
      .expect(200);
  });
  it('checks scope in application services', () => {
    expect(() =>
      new AccessService().require(
        {
          userId: 'u',
          churchId: 'a',
          roles: [],
          permissions: ['identity.read'],
          correlationId: 'test',
        },
        'b',
        'identity.read',
      ),
    ).toThrow('교회 범위');
  });
});
