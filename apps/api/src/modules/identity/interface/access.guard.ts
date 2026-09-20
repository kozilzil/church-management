import { AuditService } from '../../audit/audit.service';
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthenticationAdapter } from '../application/authentication.adapter';
import { AccessService } from '../application/access.service';
import type { Actor } from '../domain/actor';

export const Public = () => SetMetadata('public', true);
export const Permission = (value: string) => SetMetadata('permission', value);
export type AuthRequest = Request & { actor: Actor };

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthenticationAdapter) private readonly auth: AuthenticationAdapter,
    @Inject(AccessService) private readonly access: AccessService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>('public', [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const actor = await this.auth.authenticate(request);
    if (!actor)
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: '로그인이 필요합니다.' });
    request.actor = actor;
    if (
      process.env.NODE_ENV === 'production' &&
      [
        'identity.manage',
        'finance.manage',
        'expense.approve',
        'expense.pay',
        'finance.close',
        'finance.export',
        'budget.write',
        'finance.reverse',
        'offering.review',
        'offering.post',
        'offering.reverse',
        'receipt.issue',
        'receipt.print',
        'receipt.cancel',
        'receipt.export',
        'receipt.reconcile',
      ].some((p) => actor.permissions.includes(p)) &&
      !actor.mfaVerified &&
      !request.path.startsWith('/api/v1/auth/')
    ) {
      throw new ForbiddenException({
        code: 'MFA_REQUIRED',
        message: '관리자는 MFA 등록 후 다시 로그인해야 합니다.',
      });
    }
    const permission = this.reflector.getAllAndOverride<string>('permission', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permission)
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: '접근 정책이 없습니다.' });
    const churchId =
      typeof request.params.churchId === 'string' ? request.params.churchId : actor.churchId;
    try {
      this.access.require(actor, churchId, permission);
    } catch (error) {
      if (process.env.AUTH_ADAPTER !== 'test-header')
        await this.audit.record(
          actor,
          'permission.denied',
          'route',
          request.route?.path ?? 'unknown',
          [],
          undefined,
          'denied',
        );
      throw error;
    }
    return true;
  }
}
