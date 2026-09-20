import { RegistryModule } from './modules/registry/registry.module';
import { IdentityModule } from './modules/identity/identity.module';
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
    IdentityModule,
    RegistryModule,
  ],
})
export class AppModule {}
