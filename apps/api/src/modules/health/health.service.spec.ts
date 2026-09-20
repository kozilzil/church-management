import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../platform/database/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  it('reports a live API process', () => {
    const prisma = { isReady: vi.fn() } as unknown as PrismaService;
    const service = new HealthService(prisma);

    expect(service.liveness()).toMatchObject({
      status: 'ok',
      service: 'church-management-api',
    });
  });

  it('reports a degraded readiness state when the database is unavailable', async () => {
    const prisma = { isReady: vi.fn().mockResolvedValue(false) } as unknown as PrismaService;
    const service = new HealthService(prisma);

    await expect(service.readiness()).resolves.toMatchObject({
      status: 'degraded',
      checks: { database: 'degraded' },
    });
  });
});
