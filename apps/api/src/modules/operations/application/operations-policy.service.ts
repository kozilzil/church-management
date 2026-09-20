import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../platform/database/prisma.service';
import { AccessService } from '../../identity/application/access.service';
import { DataScopeService } from '../../identity/application/data-scope.service';
import type { Actor } from '../../identity/domain/actor';
@Injectable()
export class OperationsPolicy {
  constructor(
    @Inject(PrismaService) readonly db: PrismaService,
    @Inject(AccessService) readonly access: AccessService,
    @Inject(DataScopeService) readonly scope: DataScopeService,
  ) {}
  check(a: Actor, c: string, permission: string) {
    this.access.require(a, c, permission);
  }
  async write<T>(
    a: Actor,
    c: string,
    permission: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    this.check(a, c, permission);
    return this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${c},0))`;
        return fn(tx);
      },
      { timeout: 30000 },
    );
  }
  dateTime(s: string) {
    const date = new Date(s);
    if (
      !Number.isFinite(date.getTime()) ||
      new Date(s.slice(0, 10) + 'T00:00:00Z').toISOString().slice(0, 10) !== s.slice(0, 10)
    )
      throw new BadRequestException('날짜를 확인하세요.');
    return date;
  }
  date(s: string) {
    const date = this.dateTime(s + 'T00:00:00Z');
    if (date.toISOString().slice(0, 10) !== s) throw new BadRequestException('날짜를 확인하세요.');
    return date;
  }
  dayBoundary(value: string, timeZone: string) {
    const target = this.date(value).getTime();
    let stamp = target;
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    for (let i = 0; i < 3; i++) {
      const p = Object.fromEntries(
        fmt.formatToParts(new Date(stamp)).map((x) => [x.type, x.value]),
      );
      const local = Date.UTC(
        Number(p.year),
        Number(p.month) - 1,
        Number(p.day),
        Number(p.hour),
        Number(p.minute),
        Number(p.second),
      );
      stamp += target - local;
    }
    return new Date(stamp);
  }
  async assignee(a: Actor, id: string, memberId: string, tx: Prisma.TransactionClient) {
    if (!(await tx.user.findFirst({ where: { id, churchId: a.churchId, active: true } })))
      throw new BadRequestException('담당자를 확인하세요.');
    await this.scope.member({ ...a, userId: id }, memberId, tx);
  }
}
export function page<T extends { id: string }>(rows: T[], limit = 30) {
  return {
    items: rows.slice(0, limit),
    nextCursor: rows.length > limit ? rows[limit - 1]!.id : null,
  };
}
