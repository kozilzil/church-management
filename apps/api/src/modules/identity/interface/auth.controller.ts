import { ValidatedBody } from '../../../platform/http/validated';
import {
  Controller,
  Get,
  Post,
  Inject,
  Req,
  Res,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { LoginService } from '../application/login.service';
import { Public, Permission, type AuthRequest } from './access.guard';
import { LoginDto, PasswordDto, TotpDto } from './auth.dto';
import { assertOrigin, sessionToken } from '../infrastructure/session.adapter';
import { PrismaService } from '../../../platform/database/prisma.service';
import {
  csrfToken,
  tokenHash,
  verifyPassword,
  hashPassword,
  encryptSecret,
  decryptSecret,
  newTotpSecret,
  base32,
  matchingTotpCounter,
} from '../infrastructure/password';
import { AuditService } from '../../audit/audit.service';
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
});
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(LoginService) private readonly loginService: LoginService,
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}
  @Post('login')
  @Public()
  async login(
    @ValidatedBody(LoginDto) input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    assertOrigin(request);
    const result = await this.loginService.login(input, request.ip ?? 'unknown');
    response.cookie('church_session', result.token, { ...cookieOptions(), maxAge: 12 * 3600000 });
    response.setHeader('Cache-Control', 'no-store');
    return { csrfToken: result.csrfToken };
  }
  @Get('me')
  @Permission('session.read')
  async me(@Req() request: AuthRequest, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: request.actor.userId },
      select: { username: true, totpEnabled: true },
    });
    return {
      ...request.actor,
      username: user.username,
      totpEnabled: user.totpEnabled,
      csrfToken: csrfToken(sessionToken(request)),
    };
  }
  @Post('logout')
  @Permission('session.read')
  async logout(@Req() request: AuthRequest, @Res({ passthrough: true }) response: Response) {
    await this.db.session.deleteMany({ where: { tokenHash: tokenHash(sessionToken(request)) } });
    response.clearCookie('church_session', cookieOptions());
    return { ok: true };
  }
  @Post('password')
  @Permission('session.read')
  async password(
    @ValidatedBody(PasswordDto) input: PasswordDto,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: request.actor.userId } });
    if (!(await verifyPassword(input.currentPassword, user.passwordHash)))
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: '비밀번호를 확인하세요.',
      });
    const passwordHash = await hashPassword(input.password);
    await this.db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, authVersion: { increment: 1 } },
      });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await this.audit.record(request.actor, 'password.change', 'user', user.id, [], tx);
    });
    response.clearCookie('church_session', cookieOptions());
    return { ok: true };
  }
  @Post('mfa/enroll')
  @Permission('session.read')
  async enroll(@Req() request: AuthRequest) {
    if (Date.now() - (request.actor.authenticatedAt ?? 0) > 15 * 60000)
      throw new UnauthorizedException({
        code: 'REAUTHENTICATION_REQUIRED',
        message: '다시 로그인하세요.',
      });
    const user = await this.db.user.findUniqueOrThrow({ where: { id: request.actor.userId } });
    if (user.totpEnabled)
      throw new ConflictException({
        code: 'MFA_ALREADY_ENABLED',
        message: 'MFA가 이미 설정되었습니다.',
      });
    const secret = newTotpSecret();
    const enrolled = await this.db.user.updateMany({
      where: { id: user.id, totpEnabled: false },
      data: { totpSecret: encryptSecret(secret) },
    });
    if (enrolled.count !== 1)
      throw new ConflictException({
        code: 'MFA_ALREADY_ENABLED',
        message: 'MFA가 이미 등록되었습니다.',
      });
    return {
      secret: base32(secret),
      uri: `otpauth://totp/Church:${encodeURIComponent(user.username)}?secret=${base32(secret)}&issuer=Church&digits=6&period=30`,
    };
  }
  @Post('mfa/confirm')
  @Permission('session.read')
  async confirm(@ValidatedBody(TotpDto) input: TotpDto, @Req() request: AuthRequest) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: request.actor.userId } });
    const key = tokenHash(`mfa-confirm:${user.id}`);
    await this.db.loginAttempt.deleteMany({ where: { key, expiresAt: { lt: new Date() } } });
    const attempt = await this.db.loginAttempt.upsert({
      where: { key },
      create: { key, expiresAt: new Date(Date.now() + 15 * 60000) },
      update: { count: { increment: 1 } },
    });
    const counter = user.totpSecret
      ? matchingTotpCounter(decryptSecret(user.totpSecret), input.code)
      : null;
    if (attempt.count > 5 || counter === null || user.totpEnabled)
      throw new UnauthorizedException({
        code: 'MFA_INVALID',
        message: '인증 코드 또는 등록 상태를 확인하세요.',
      });
    await this.db.$transaction(async (tx) => {
      const enabled = await tx.user.updateMany({
        where: { id: user.id, totpEnabled: false, totpSecret: user.totpSecret },
        data: { totpEnabled: true, totpLastCounter: counter, authVersion: { increment: 1 } },
      });
      if (enabled.count !== 1)
        throw new ConflictException({
          code: 'MFA_REGISTRATION_CHANGED',
          message: 'MFA 등록을 다시 시작하세요.',
        });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await this.audit.record(request.actor, 'mfa.enable', 'user', user.id, [], tx);
    });
    return { ok: true };
  }
}
