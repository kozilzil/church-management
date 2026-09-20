import { Inject, Injectable, UnauthorizedException, HttpException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../platform/database/prisma.service';
import {
  verifyPassword,
  matchingTotpCounter,
  decryptSecret,
  tokenHash,
  csrfToken,
} from '../infrastructure/password';
import type { LoginDto } from '../interface/auth.dto';

@Injectable()
export class LoginService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  async login(input: LoginDto, ip: string) {
    const username = input.username.trim().toLowerCase();
    const key = tokenHash(`${input.churchId}:${username}:${ip}`);
    const now = new Date();
    await this.db.loginAttempt.deleteMany({ where: { expiresAt: { lt: now } } });
    const attempt = await this.db.loginAttempt.upsert({
      where: { key },
      create: { key, expiresAt: new Date(Date.now() + 15 * 60000) },
      update: { count: { increment: 1 } },
    });
    if (attempt.count > 5)
      throw new HttpException(
        { code: 'LOGIN_RATE_LIMITED', message: '잠시 후 다시 로그인하세요.' },
        429,
      );
    const user = await this.db.user.findUnique({
      where: { churchId_username: { churchId: input.churchId, username } },
    });
    const valid = await verifyPassword(input.password, user?.passwordHash ?? null);
    const counter =
      user?.totpEnabled && user.totpSecret && input.code
        ? matchingTotpCounter(decryptSecret(user.totpSecret), input.code)
        : null;
    if (
      !valid ||
      !user?.active ||
      (user.totpEnabled && (counter === null || counter <= user.totpLastCounter))
    )
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: '로그인 정보를 확인하세요.',
      });
    if (user.totpEnabled) {
      const claimed = await this.db.user.updateMany({
        where: { id: user.id, totpLastCounter: { lt: counter! } },
        data: { totpLastCounter: counter! },
      });
      if (claimed.count !== 1)
        throw new UnauthorizedException({
          code: 'INVALID_CREDENTIALS',
          message: '새 인증 코드를 입력하세요.',
        });
    }
    const token = randomBytes(32).toString('hex');
    await this.db.$transaction([
      this.db.loginAttempt.deleteMany({ where: { key } }),
      this.db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
      this.db.session.create({
        data: {
          tokenHash: tokenHash(token),
          churchId: user.churchId,
          userId: user.id,
          expiresAt: new Date(Date.now() + 12 * 3600000),
          mfaVerified: user.totpEnabled,
          authVersion: user.authVersion,
        },
      }),
    ]);
    return { token, csrfToken: csrfToken(token) };
  }
}
