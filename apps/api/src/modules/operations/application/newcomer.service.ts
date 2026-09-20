import { Inject, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { OperationsPolicy, page } from './operations-policy.service';
import { AuditService } from '../../audit/audit.service';
import type { Actor } from '../../identity/domain/actor';
import type {
  StageDto,
  PageDto,
  JourneyDto,
  JourneyChangeDto,
  JourneyListDto,
} from '../interface/operations.dto';
@Injectable()
export class NewcomerService {
  constructor(
    @Inject(OperationsPolicy) private readonly p: OperationsPolicy,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}
  async stages(a: Actor, c: string, q: PageDto) {
    this.p.check(a, c, 'newcomer.read');
    return page(
      await this.p.db.newcomerStage.findMany({
        where: { churchId: c, ...(q.cursor ? { id: { gt: q.cursor } } : {}) },
        orderBy: { id: 'asc' },
        take: (q.limit ?? 30) + 1,
        select: { id: true, name: true, sortOrder: true, terminal: true, active: true },
      }),
      q.limit,
    );
  }
  async stage(a: Actor, c: string, d: StageDto, id?: string) {
    this.p.check(a, c, 'identity.manage');
    return this.p.write(a, c, 'newcomer.write', async (tx) => {
      await this.p.scope.requireFull(a, tx);
      if (id && !(await tx.newcomerStage.findFirst({ where: { churchId: c, id } })))
        throw new NotFoundException();
      const row = id
        ? await tx.newcomerStage.update({ where: { id }, data: d })
        : await tx.newcomerStage.create({ data: { churchId: c, ...d } });
      await this.audit.record(
        a,
        'newcomer.stage.configure',
        'newcomerStage',
        row.id,
        ['name', 'sortOrder', 'terminal', 'active'],
        tx,
      );
      return { id: row.id };
    });
  }
  async journeys(a: Actor, c: string, q: JourneyListDto) {
    this.p.check(a, c, 'newcomer.read');
    const church = await this.p.db.church.findUniqueOrThrow({ where: { id: c } });
    const today = this.p.date(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: church.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()),
    );
    const rows = await this.p.db.newcomerJourney.findMany({
      where: {
        churchId: c,
        member: await this.p.scope.members(a),
        ...(q.cursor ? { id: { gt: q.cursor } } : {}),
        ...(q.assigneeId ? { assigneeId: q.assigneeId } : {}),
        ...(q.state === 'completed'
          ? { completedAt: { not: null } }
          : q.state === 'all'
            ? {}
            : { completedAt: null }),
        ...(q.state === 'overdue' ? { dueOn: { lt: today } } : {}),
      },
      orderBy: { id: 'asc' },
      take: (q.limit ?? 30) + 1,
      include: {
        member: { select: { name: true } },
        stage: { select: { name: true } },
        assignee: { select: { username: true } },
      },
    });
    return page(
      rows.map((r) => ({
        id: r.id,
        memberId: r.memberId,
        name: r.member.name,
        stageId: r.stageId,
        stage: r.stage.name,
        assigneeId: r.assigneeId,
        assignee: r.assignee.username,
        dueOn: r.dueOn?.toISOString().slice(0, 10) ?? null,
        completedAt: r.completedAt,
        version: r.version,
      })),
      q.limit,
    );
  }
  async create(a: Actor, c: string, d: JourneyDto) {
    return this.p.write(a, c, 'newcomer.write', async (tx) => {
      await this.p.scope.member(a, d.memberId, tx);
      await this.p.assignee(a, d.assigneeId, d.memberId, tx);
      const stage = await tx.newcomerStage.findFirst({
        where: { churchId: c, id: d.stageId, active: true },
      });
      if (!stage) throw new NotFoundException('활성 단계를 선택하세요.');
      const row = await tx.newcomerJourney.create({
        data: {
          churchId: c,
          memberId: d.memberId,
          stageId: d.stageId,
          assigneeId: d.assigneeId,
          dueOn: d.dueOn ? this.p.date(d.dueOn) : null,
          completedAt: stage.terminal ? new Date() : null,
        },
      });
      await tx.newcomerChange.create({
        data: {
          churchId: c,
          journeyId: row.id,
          toStage: stage.name,
          assigneeId: d.assigneeId,
          dueOn: row.dueOn,
          actorId: a.userId,
          version: 1,
        },
      });
      await this.audit.record(a, 'newcomer.create', 'newcomerJourney', row.id, [], tx);
      return { id: row.id };
    });
  }
  async change(a: Actor, c: string, id: string, d: JourneyChangeDto) {
    return this.p.write(a, c, 'newcomer.write', async (tx) => {
      const row = await tx.newcomerJourney.findFirst({
        where: { churchId: c, id, member: await this.p.scope.members(a, tx) },
        include: { stage: true },
      });
      if (!row) throw new NotFoundException();
      if (row.version !== d.version) throw new ConflictException('다시 조회 후 변경하세요.');
      await this.p.assignee(a, d.assigneeId, row.memberId, tx);
      const stage = await tx.newcomerStage.findFirst({
        where: { id: d.stageId, churchId: c, active: true },
      });
      if (!stage) throw new NotFoundException('활성 단계를 선택하세요.');
      const dueOn = d.dueOn ? this.p.date(d.dueOn) : null;
      await tx.newcomerJourney.update({
        where: { id },
        data: {
          stageId: d.stageId,
          assigneeId: d.assigneeId,
          dueOn,
          version: { increment: 1 },
          completedAt: stage.terminal ? (row.completedAt ?? new Date()) : null,
        },
      });
      await tx.newcomerChange.create({
        data: {
          churchId: c,
          journeyId: id,
          fromStage: row.stage.name,
          toStage: stage.name,
          assigneeId: d.assigneeId,
          dueOn,
          actorId: a.userId,
          version: row.version + 1,
        },
      });
      await this.audit.record(
        a,
        'newcomer.change',
        'newcomerJourney',
        id,
        ['stageId', 'assigneeId', 'dueOn'],
        tx,
      );
      return { ok: true };
    });
  }
  async history(a: Actor, c: string, id: string, q: PageDto) {
    this.p.check(a, c, 'newcomer.read');
    if (
      !(await this.p.db.newcomerJourney.findFirst({
        where: { churchId: c, id, member: await this.p.scope.members(a) },
      }))
    )
      throw new NotFoundException();
    return page(
      await this.p.db.newcomerChange.findMany({
        where: { churchId: c, journeyId: id, ...(q.cursor ? { id: { gt: q.cursor } } : {}) },
        orderBy: { id: 'asc' },
        take: (q.limit ?? 30) + 1,
        select: {
          id: true,
          fromStage: true,
          toStage: true,
          assigneeId: true,
          dueOn: true,
          actorId: true,
          version: true,
          createdAt: true,
        },
      }),
      q.limit,
    );
  }
  async assignees(a: Actor, c: string) {
    this.p.check(a, c, 'membership.read');
    if (!a.permissions.some((p) => ['newcomer.write', 'care.write'].includes(p)))
      await this.p.scope.deny(a);
    const full = await this.p.scope.full(a);
    const rows = await this.p.db.user.findMany({
      where: { churchId: c, active: true, ...(full ? {} : { id: a.userId }) },
      orderBy: { username: 'asc' },
      take: 100,
      select: { id: true, username: true },
    });
    return { items: rows.map((r) => ({ id: r.id, name: r.username })) };
  }
}
