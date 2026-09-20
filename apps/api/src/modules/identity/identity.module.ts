import { AdminController } from './interface/admin.controller';
import { PrismaService } from '../../platform/database/prisma.service';
import { SessionAdapter } from './infrastructure/session.adapter';
import { LoginService } from './application/login.service';
import { AuthController } from './interface/auth.controller';
import { AuditService } from '../audit/audit.service';
import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthenticationAdapter } from './application/authentication.adapter';
import { AccessService } from './application/access.service';
import { HeaderAdapter } from './infrastructure/header.adapter';
import { AccessGuard } from './interface/access.guard';
import { IdentityController } from './interface/identity.controller';

@Global()
@Module({
  controllers: [IdentityController, AuthController, AdminController],
  providers: [
    AccessService,
    AuditService,
    LoginService,
    {
      provide: AuthenticationAdapter,
      inject: [PrismaService],
      useFactory: (db: PrismaService) => {
        if (process.env.AUTH_ADAPTER === 'test-header') {
          if (process.env.NODE_ENV !== 'test')
            throw new Error('Test authentication is forbidden outside tests.');
          return new HeaderAdapter();
        }
        return new SessionAdapter(db);
      },
    },
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
  exports: [AccessService, AuditService],
})
export class IdentityModule {}
