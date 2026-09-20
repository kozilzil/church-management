import { Inject, Injectable } from '@nestjs/common';
import type { HealthResponse } from '@church/contracts';

import { PrismaService } from '../../platform/database/prisma.service';

@Injectable()
export class HealthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  liveness(): HealthResponse {
    return {
      status: 'ok',
      service: 'church-management-api',
      timestamp: new Date().toISOString(),
    };
  }

  async readiness(): Promise<HealthResponse> {
    const databaseReady = await this.prisma.isReady();

    return {
      status: databaseReady ? 'ok' : 'degraded',
      service: 'church-management-api',
      timestamp: new Date().toISOString(),
      checks: {
        database: databaseReady ? 'ok' : 'degraded',
      },
    };
  }
}
