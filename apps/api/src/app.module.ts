import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { HealthModule } from './modules/health/health.module';
import { PrismaModule } from './platform/database/prisma.module';
import { createHttpLoggerOptions } from './platform/logging/http-logger.config';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: createHttpLoggerOptions(),
    }),
    PrismaModule,
    HealthModule,
  ],
})
export class AppModule {}
