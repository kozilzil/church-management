import {
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OperationsPolicy, page } from './operations-policy.service';
import { AuditService } from '../../audit/audit.service';
import type { Actor } from '../../identity/domain/actor';
import type {
  GatheringDto,
  SessionDto,
  AttendanceDto,
  PageDto,
  RangeDto,
} from '../interface/operations.dto';
@Injectable()
export class AttendanceService {
  constructor(
    @Inject(OperationsPolicy) private readonly p: OperationsPolicy,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}
  private async visibility(
    a: Actor,
    tx: Prisma.TransactionClient = this.p.db,
  ): Promise<Prisma.GatheringWhereInput> {
    const ids = await this.p.scope.organizations(a, tx);
    return {
      churchId: a.churchId,
      ...(ids === null ? {} : { OR: [{ organizationId: null }, { organizationId: { in: ids } }] }),
    };
  }
  private async gathering(a: Actor, id: string, tx: Prisma.TransactionClient = this.p.db) {
    const g = await tx.gathering.findFirst({
      where: { AND: [await this.visibility(a, tx), { id }] },
    });
    if (!g) throw new NotFoundException('모임을 찾을 수 없습니다.');
    return g;
  }
  async gatherings(a: Actor, c: string, q: PageDto) {
    this.p.check(a, c, 'attendance.read');
    return page(
      await this.p.db.gathering.findMany({
        where: { AND: [await this.visibility(a)], ...(q.cursor ? { id: { gt: q.cursor } } : {}) },
        orderBy: { id: 'asc' },
        take: (q.limit ?? 30) + 1,
        select: { id: true, name: true, schedule: true, organizationId: true, active: true },
      }),
      q.limit,
    );
  }
  async createGathering(a: Actor, c: string, d: GatheringDto) {
    return this.p.write(a, c, 'attendance.write', async (tx) => {
      if (d.organizationId) await this.p.scope.organization(a, d.organizationId, tx);
      else await this.p.scope.requireFull(a, tx);
      const g = await tx.gathering.create({
        data: {
          churchId: c,
          name: d.name,
          organizationId: d.organizationId ?? null,
          schedule: d.schedule,
        },
      });
      await this.audit.record(a, 'gathering.create', 'gathering', g.id, [], tx);
      return { id: g.id };
    });
  }
  async sessions(a: Actor, c: string, id: string, q: PageDto) {
    this.p.check(a, c, 'attendance.read');
    await this.gathering(a, id);
    return page(
      await this.p.db.gatheringSession.findMany({
        where: { churchId: c, gatheringId: id, ...(q.cursor ? { id: { gt: q.cursor } } : {}) },
        orderBy: { id: 'asc' },
        take: (q.limit ?? 30) + 1,
        select: { id: true, startsAt: true, gatheringId: true },
      }),
      q.limit,
    );
  }
  async createSession(a: Actor, c: string, id: string, d: SessionDto) {
    return this.p.write(a, c, 'attendance.write', async (tx) => {
      await this.gathering(a, id, tx);
      const s = await tx.gatheringSession.create({
        data: { churchId: c, gatheringId: id, startsAt: this.p.dateTime(d.startsAt) },
      });
      await this.audit.record(a, 'gathering.session.create', 'gatheringSession', s.id, [], tx);
      return { id: s.id };
    });
  }
  async records(a: Actor, c: string, id: string, q: PageDto) {
    this.p.check(a, c, 'attendance.read');
    const s = await this.p.db.gatheringSession.findFirst({ where: { churchId: c, id } });
    if (!s) throw new NotFoundException();
    await this.gathering(a, s.gatheringId);
    const rows = await this.p.db.attendanceRecord.findMany({
      where: {
        churchId: c,
        sessionId: id,
        member: await this.p.scope.members(a),
        ...(q.cursor ? { id: { gt: q.cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: (q.limit ?? 30) + 1,
      select: {
        id: true,
        memberId: true,
        status: true,
        source: true,
        version: true,
        updatedAt: true,
        member: { select: { name: true } },
      },
    });
    return page(
      rows.map((r) => ({
        id: r.id,
        memberId: r.memberId,
        name: r.member.name,
        status: r.status,
        source: r.source,
        version: r.version,
        updatedAt: r.updatedAt,
      })),
      q.limit,
    );
  }
  async record(a: Actor, c: string, id: string, d: AttendanceDto) {
    return this.p.write(a, c, 'attendance.write', async (tx) => {
      const s = await tx.gatheringSession.findFirst({ where: { id, churchId: c } });
      if (!s) throw new NotFoundException();
      const g = await this.gathering(a, s.gatheringId, tx);
      if (s.startsAt > new Date())
        throw new BadRequestException('미래 회차에 출석을 기록할 수 없습니다.');
      if (new Set(d.records.map((r) => r.memberId)).size !== d.records.length)
        throw new BadRequestException('중복 교인입니다.');
      for (const r of d.records) {
        await this.p.scope.member(a, r.memberId, tx);
        if (
          g.organizationId &&
          !(await tx.organizationMembership.findFirst({
            where: {
              churchId: c,
              memberId: r.memberId,
              organizationId: g.organizationId,
              effectiveFrom: { lte: s.startsAt },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: s.startsAt } }],
            },
          }))
        )
          throw new BadRequestException('해당 회차의 조직 소속 교인이 아닙니다.');
        const existing = await tx.attendanceRecord.findUnique({
          where: {
            churchId_sessionId_memberId: { churchId: c, sessionId: id, memberId: r.memberId },
          },
        });
        if ((existing?.version ?? 0) !== r.version)
          throw new ConflictException('출석이 변경되었습니다. 새로 조회하세요.');
        const row = existing
          ? await tx.attendanceRecord.update({
              where: { id: existing.id },
              data: {
                status: r.status,
                source: d.source,
                version: { increment: 1 },
                updatedBy: a.userId,
              },
            })
          : await tx.attendanceRecord.create({
              data: {
                churchId: c,
                sessionId: id,
                memberId: r.memberId,
                status: r.status,
                source: d.source,
                updatedBy: a.userId,
              },
            });
        await tx.attendanceChange.create({
          data: {
            churchId: c,
            recordId: row.id,
            fromStatus: existing?.status ?? null,
            toStatus: r.status,
            source: d.source,
            actorId: a.userId,
            version: row.version,
          },
        });
        await this.audit.record(
          a,
          'attendance.record',
          'attendance',
          row.id,
          ['status', 'source'],
          tx,
        );
      }
      return { count: d.records.length };
    });
  }
  async history(a: Actor, c: string, id: string, q: PageDto) {
    this.p.check(a, c, 'attendance.read');
    const row = await this.p.db.attendanceRecord.findFirst({
      where: { churchId: c, id, member: await this.p.scope.members(a) },
    });
    if (!row) throw new NotFoundException();
    const s = await this.p.db.gatheringSession.findUniqueOrThrow({ where: { id: row.sessionId } });
    await this.gathering(a, s.gatheringId);
    return page(
      await this.p.db.attendanceChange.findMany({
        where: { churchId: c, recordId: id, ...(q.cursor ? { id: { gt: q.cursor } } : {}) },
        orderBy: { id: 'asc' },
        take: (q.limit ?? 30) + 1,
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          source: true,
          actorId: true,
          version: true,
          createdAt: true,
        },
      }),
      q.limit,
    );
  }
  async summary(a: Actor, c: string, q: RangeDto) {
    this.p.check(a, c, 'attendance.read');
    const church = await this.p.db.church.findUniqueOrThrow({ where: { id: c } });
    const from = this.p.dayBoundary(q.from, church.timezone),
      end = this.p.date(q.to);
    end.setUTCDate(end.getUTCDate() + 1);
    const to = this.p.dayBoundary(end.toISOString().slice(0, 10), church.timezone);
    if (to <= from || to.getTime() - from.getTime() > 366 * 86400000)
      throw new BadRequestException('집계 기간은 최대 1년입니다.');
    const rows = await this.p.db.attendanceRecord.groupBy({
      by: ['status'],
      where: {
        churchId: c,
        member: await this.p.scope.members(a),
        session: {
          startsAt: { gte: from, lt: to },
          gathering: {
            AND: [await this.visibility(a), ...(q.gatheringId ? [{ id: q.gatheringId }] : [])],
          },
        },
      },
      _count: true,
    });
    return {
      from: q.from,
      to: q.to,
      counts: Object.fromEntries(rows.map((r) => [r.status, r._count])),
    };
  }
}
