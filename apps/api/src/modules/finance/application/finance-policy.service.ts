import {
  Inject,
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../platform/database/prisma.service';
import { AccessService } from '../../identity/application/access.service';
import { AuditService } from '../../audit/audit.service';
import type { Actor } from '../../identity/domain/actor';
export type Tx = Prisma.TransactionClient;
export function bad(message: string): never {
  throw new BadRequestException({ code: 'FINANCE_VALIDATION', message });
}
export function denied(): never {
  throw new ForbiddenException({
    code: 'FINANCE_PERMISSION_DENIED',
    message: '이 재정 업무를 수행할 권한이 없습니다.',
  });
}
export function missing(): never {
  throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND', message: '대상을 찾을 수 없습니다.' });
}
export function conflict(): never {
  throw new ConflictException({
    code: 'VERSION_CONFLICT',
    message: '다른 작업으로 변경되었습니다. 다시 조회하세요.',
  });
}
export function page<T extends { id: string }>(rows: T[], limit = 30) {
  return {
    items: rows.slice(0, limit),
    nextCursor: rows.length > limit ? rows[limit - 1]!.id : null,
  };
}
@Injectable()
export class FinancePolicy {
  constructor(
    @Inject(PrismaService) readonly db: PrismaService,
    @Inject(AccessService) readonly access: AccessService,
    @Inject(AuditService) readonly audit: AuditService,
  ) {}
  check(a: Actor, c: string, p: string) {
    this.access.require(a, c, p);
  }
  recent(a: Actor) {
    if (Date.now() - (a.authenticatedAt ?? 0) > 900000)
      throw new UnauthorizedException({
        code: 'REAUTHENTICATION_REQUIRED',
        message: '재정 업무를 처리하기 전에 다시 로그인하세요.',
      });
  }
  async write<T>(a: Actor, c: string, p: string, fn: (tx: Tx) => Promise<T>, recent = false) {
    this.check(a, c, p);
    if (recent) this.recent(a);
    try {
      return await this.db.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${c},0))`;
          return fn(tx);
        },
        { timeout: 30000 },
      );
    } catch (e) {
      if (e instanceof ForbiddenException || e instanceof NotFoundException)
        await this.audit.record(
          a,
          'finance.denied',
          'finance',
          'restricted',
          [],
          undefined,
          'denied',
        );
      throw e;
    }
  }
  date(s: string) {
    const d = new Date(s + 'T00:00:00Z');
    if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== s)
      bad('날짜를 확인하세요.');
    return d;
  }
  async openPeriod(c: string, s: string, tx: Tx) {
    const d = this.date(s),
      church = await tx.church.findUniqueOrThrow({ where: { id: c } });
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: church.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    if (s > today) bad('미래 날짜로 게시할 수 없습니다.');
    const period = await tx.financePeriod.findFirst({
      where: { churchId: c, closedAt: null, startsOn: { lte: d }, endsOn: { gte: d } },
    });
    if (!period) bad('해당 날짜의 열린 회계기간이 필요합니다.');
    return { period, date: d };
  }
  async account(c: string, id: string, kind: string, tx: Tx) {
    if (!(await tx.financeAccount.findFirst({ where: { id, churchId: c, kind } })))
      bad('계정과목 유형을 확인하세요.');
  }
}
