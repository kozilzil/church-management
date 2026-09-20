import { Inject, Injectable, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../../platform/database/prisma.service';
import { AuthenticationAdapter } from '../application/authentication.adapter';
import { csrfToken, equalSecret, tokenHash } from './password';
import type { Actor } from '../domain/actor';
export function sessionToken(request: Request): string {
  return (
    request.headers.cookie
      ?.split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith('church_session='))
      ?.slice('church_session='.length) ?? ''
  );
}
@Injectable()
export class SessionAdapter extends AuthenticationAdapter {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {
    super();
  }
  async authenticate(request: Request): Promise<Actor | null> {
    const token = sessionToken(request);
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const session = await this.db.session.findUnique({
      where: { tokenHash: tokenHash(token) },
      include: {
        user: { include: { roles: { include: { role: { include: { permissions: true } } } } } },
      },
    });
    if (
      !session ||
      !session.user.active ||
      session.authVersion !== session.user.authVersion ||
      session.expiresAt.getTime() <= Date.now() ||
      session.lastSeenAt.getTime() < Date.now() - 30 * 60000
    )
      return null;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if (!equalSecret(request.header('x-csrf-token') ?? '', csrfToken(token)))
        throw new ForbiddenException({
          code: 'CSRF_INVALID',
          message: '요청 검증에 실패했습니다.',
        });
      assertOrigin(request);
    }
    await this.db.session.update({
      where: { tokenHash: session.tokenHash },
      data: { lastSeenAt: new Date() },
    });
    return {
      userId: session.userId,
      churchId: session.churchId,
      roles: session.user.roles.map((x) => x.role.name),
      permissions: [
        'session.read',
        ...new Set(
          session.user.roles.flatMap((x) => x.role.permissions.map((p) => p.permissionCode)),
        ),
      ],
      correlationId: String((request as Request & { id?: string }).id ?? ''),
      authenticatedAt: session.createdAt.getTime(),
      mfaVerified: session.mfaVerified,
    };
  }
}
export function assertOrigin(request: Request): void {
  const origin = request.header('origin');
  const expected = process.env.APP_BASE_URL ?? 'http://localhost:5173';
  if (origin !== expected)
    throw new ForbiddenException({
      code: 'ORIGIN_DENIED',
      message: '허용되지 않은 요청 출처입니다.',
    });
}
