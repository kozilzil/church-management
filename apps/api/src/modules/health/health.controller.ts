import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { HealthResponse } from '@church/contracts';
import type { Response } from 'express';

import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get('liveness')
  @ApiOperation({ summary: '프로세스 생존 상태 확인' })
  @ApiOkResponse({ description: 'API 프로세스가 요청을 처리할 수 있음' })
  liveness(): HealthResponse {
    return this.healthService.liveness();
  }

  @Get('readiness')
  @ApiOperation({ summary: 'DB를 포함한 서비스 준비 상태 확인' })
  @ApiOkResponse({ description: '모든 필수 dependency가 준비됨' })
  @ApiServiceUnavailableResponse({ description: '하나 이상의 필수 dependency가 준비되지 않음' })
  async readiness(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    const health = await this.healthService.readiness();

    if (health.status !== 'ok') {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return health;
  }
}
