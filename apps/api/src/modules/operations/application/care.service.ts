import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OperationsPolicy, page } from './operations-policy.service';
import { AuditService } from '../../audit/audit.service';
import type { Actor } from '../../identity/domain/actor';
import type {
  CareDto,
  CareChangeDto,
  CarePolicyDto,
  CareNoteDto,
  JourneyListDto,
  PageDto,
} from '../interface/operations.dto';
import { careKey, sealText, openText } from '../../../platform/crypto/protected-text';
@Injectable()
export class CareService {
  constructor(
    @Inject(OperationsPolicy) private readonly p: OperationsPolicy,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}
  private async visibility(
    a: Actor,
    tx: Prisma.TransactionClient = this.p.db,
  ): Promise<Prisma.CareRecordWhereInput> {
    if (await this.p.scope.full(a, tx)) return { churchId: a.churchId };
    const member = await this.p.scope.members(a, tx);
    return {
      churchId: a.churchId,
      OR: [
        { member: { is: member } },
        {
          household: {
            is: {
              memberships: {
                some: { effectiveTo: null },
                none: { effectiveTo: null, member: { NOT: member } },
              },
            },
          },
        },
      ],
    };
  }
  private async record(a: Actor, id: string, tx: Prisma.TransactionClient = this.p.db) {
    const r = await tx.careRecord.findFirst({
      where: { AND: [await this.visibility(a, tx), { id }] },
    });
    if (!r) throw new NotFoundException('기록을 찾을 수 없습니다.');
    return r;
  }
  private async target(
    a: Actor,
    d: { memberId?: string | null; householdId?: string | null },
    tx: Prisma.TransactionClient,
  ) {
    if (Boolean(d.memberId) === Boolean(d.householdId))
      throw new BadRequestException('교인 또는 가족 중 하나를 선택하세요.');
    if (d.memberId) {
      await this.p.scope.member(a, d.memberId, tx);
      return;
    }
    if (!(await tx.household.findFirst({ where: { churchId: a.churchId, id: d.householdId! } })))
      throw new NotFoundException();
    if (await this.p.scope.full(a, tx)) return;
    const links = await tx.householdMembership.findMany({
      where: { churchId: a.churchId, householdId: d.householdId!, effectiveTo: null },
      select: { memberId: true },
    });
    if (!links.length) await this.p.scope.deny(a);
    for (const l of links) await this.p.scope.member(a, l.memberId, tx);
  }
  async list(a: Actor, c: string, q: JourneyListDto) {
    this.p.check(a, c, 'care.read');
    const church = await this.p.db.church.findUniqueOrThrow({ where: { id: c } });
    const today = this.p.date(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: church.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()),
    );
    const rows = await this.p.db.careRecord.findMany({
      where: {
        AND: [await this.visibility(a)],
        ...(q.cursor ? { id: { gt: q.cursor } } : {}),
        ...(q.assigneeId ? { assigneeId: q.assigneeId } : {}),
        ...(q.state === 'all'
          ? {}
          : q.state === 'completed'
            ? { completedAt: { not: null } }
            : { completedAt: null }),
        ...(q.state === 'overdue' ? { followUpOn: { lt: today } } : {}),
      },
      orderBy: { id: 'asc' },
      take: (q.limit ?? 30) + 1,
      include: {
        member: { select: { name: true } },
        household: { select: { name: true } },
        assignee: { select: { username: true } },
      },
    });
    return page(
      rows.map((r) => ({
        id: r.id,
        memberId: r.memberId,
        householdId: r.householdId,
        name: r.member?.name ?? r.household?.name,
        assigneeId: r.assigneeId,
        assignee: r.assignee.username,
        kind: r.kind,
        occurredAt: r.occurredAt,
        followUpOn: r.followUpOn?.toISOString().slice(0, 10) ?? null,
        completedAt: r.completedAt,
        version: r.version,
      })),
      q.limit,
    );
  }
  async create(a: Actor, c: string, d: CareDto) {
    return this.p.write(a, c, 'care.write', async (tx) => {
      await this.target(a, d, tx);
      await this.target({ ...a, userId: d.assigneeId }, d, tx);
      if (!(await tx.user.findFirst({ where: { churchId: c, id: d.assigneeId, active: true } })))
        throw new BadRequestException('담당자를 확인하세요.');
      const occurredAt = this.p.dateTime(d.occurredAt);
      if (occurredAt > new Date())
        throw new BadRequestException(
          '미래 방문 기록은 허용하지 않습니다. 후속 예정일을 사용하세요.',
        );
      const r = await tx.careRecord.create({
        data: {
          churchId: c,
          memberId: d.memberId ?? null,
          householdId: d.householdId ?? null,
          assigneeId: d.assigneeId,
          kind: d.kind,
          occurredAt,
          followUpOn: d.followUpOn ? this.p.date(d.followUpOn) : null,
        },
      });
      await tx.careChange.create({
        data: {
          churchId: c,
          recordId: r.id,
          assigneeId: r.assigneeId,
          followUpOn: r.followUpOn,
          actorId: a.userId,
          version: 1,
        },
      });
      await this.audit.record(a, 'care.create', 'careRecord', r.id, [], tx);
      return { id: r.id };
    });
  }
  async change(a: Actor, c: string, id: string, d: CareChangeDto) {
    return this.p.write(a, c, 'care.write', async (tx) => {
      const row = await this.record(a, id, tx);
      if (row.version !== d.version) throw new ConflictException('다시 조회 후 변경하세요.');
      await this.target({ ...a, userId: d.assigneeId }, row, tx);
      if (!(await tx.user.findFirst({ where: { churchId: c, id: d.assigneeId, active: true } })))
        throw new BadRequestException('담당자를 확인하세요.');
      const updated = await tx.careRecord.update({
        where: { id },
        data: {
          assigneeId: d.assigneeId,
          followUpOn: d.followUpOn ? this.p.date(d.followUpOn) : null,
          completedAt: d.completed ? (row.completedAt ?? new Date()) : null,
          version: { increment: 1 },
        },
      });
      await tx.careChange.create({
        data: {
          churchId: c,
          recordId: id,
          assigneeId: updated.assigneeId,
          followUpOn: updated.followUpOn,
          completedAt: updated.completedAt,
          actorId: a.userId,
          version: updated.version,
        },
      });
      await this.audit.record(
        a,
        'care.followup.change',
        'careRecord',
        id,
        ['assigneeId', 'followUpOn', 'completedAt'],
        tx,
      );
      return { ok: true };
    });
  }
  async history(a: Actor, c: string, id: string, q: PageDto) {
    this.p.check(a, c, 'care.read');
    await this.record(a, id);
    return page(
      await this.p.db.careChange.findMany({
        where: { churchId: c, recordId: id, ...(q.cursor ? { id: { gt: q.cursor } } : {}) },
        orderBy: { id: 'asc' },
        take: (q.limit ?? 30) + 1,
        select: {
          id: true,
          assigneeId: true,
          followUpOn: true,
          completedAt: true,
          actorId: true,
          version: true,
          createdAt: true,
        },
      }),
      q.limit,
    );
  }
  async policy(a: Actor, c: string) {
    this.p.check(a, c, 'care.read');
    const row = await this.p.db.carePolicy.findUnique({ where: { churchId: c } });
    return row
      ? { enabled: row.enabled, retentionDays: row.retentionDays, reference: row.reference }
      : { enabled: false, retentionDays: null, reference: null };
  }
  async setPolicy(a: Actor, c: string, d: CarePolicyDto) {
    this.p.check(a, c, 'identity.manage');
    return this.p.write(a, c, 'care.policy', async (tx) => {
      await this.p.scope.requireFull(a, tx);
      if (d.enabled) {
        try {
          careKey();
        } catch {
          throw new BadRequestException('서버의 CARE_ENCRYPTION_KEY를 먼저 설정하세요.');
        }
      }
      await tx.carePolicy.upsert({
        where: { churchId: c },
        create: { churchId: c, ...d },
        update: d,
      });
      await this.audit.record(
        a,
        'care.policy.configure',
        'carePolicy',
        c,
        ['enabled', 'retentionDays', 'reference'],
        tx,
      );
      return { ok: true };
    });
  }
  async roles(a: Actor, c: string) {
    this.p.check(a, c, 'care.notes');
    return {
      items: await this.p.db.role.findMany({
        where: { churchId: c, users: { some: { churchId: c, userId: a.userId } } },
        select: { id: true, name: true },
        take: 100,
      }),
    };
  }
  private async enabled(c: string, tx: Prisma.TransactionClient) {
    const policy = await tx.carePolicy.findUnique({ where: { churchId: c } });
    if (!policy?.enabled)
      throw new ForbiddenException({
        code: 'CARE_NOTES_DISABLED',
        message: '보존·파기 정책 설정 전에는 민감 메모를 사용할 수 없습니다.',
      });
    return policy;
  }
  async note(a: Actor, c: string, id: string, d: CareNoteDto) {
    this.p.check(a, c, 'care.write');
    return this.p.write(a, c, 'care.notes', async (tx) => {
      const r = await this.record(a, id, tx);
      if (r.assigneeId !== a.userId) await this.p.scope.deny(a);
      const policy = await this.enabled(c, tx);
      if ((d.visibility === 'ROLE') !== !!d.roleId)
        throw new BadRequestException('지정 역할을 확인하세요.');
      if (
        d.roleId &&
        !(await tx.userRole.findUnique({
          where: { churchId_userId_roleId: { churchId: c, userId: a.userId, roleId: d.roleId } },
        }))
      )
        await this.p.scope.deny(a);
      const n = await tx.careNote.create({
        data: {
          churchId: c,
          recordId: id,
          authorId: a.userId,
          visibility: d.visibility,
          roleId: d.roleId ?? null,
          ciphertext: sealText(d.text),
          expiresAt: new Date(Date.now() + policy.retentionDays * 86400000),
        },
      });
      await this.audit.record(a, 'care.note.create', 'careNote', n.id, [], tx);
      return { id: n.id, expiresAt: n.expiresAt };
    });
  }
  async notes(a: Actor, c: string, id: string, q: PageDto) {
    this.p.check(a, c, 'care.notes');
    this.p.check(a, c, 'care.read');
    const record = await this.record(a, id);
    await this.enabled(c, this.p.db);
    const roles = await this.p.db.userRole.findMany({
      where: { churchId: c, userId: a.userId },
      select: { roleId: true },
    });
    const rows = await this.p.db.careNote.findMany({
      where: {
        churchId: c,
        recordId: id,
        expiresAt: { gt: new Date() },
        purgedAt: null,
        ...(q.cursor ? { id: { gt: q.cursor } } : {}),
        OR: [
          { authorId: a.userId },
          ...(record.assigneeId === a.userId ? [{ visibility: 'ASSIGNEE' }] : []),
          { visibility: 'ROLE', roleId: { in: roles.map((r) => r.roleId) } },
        ],
      },
      orderBy: { id: 'asc' },
      take: (q.limit ?? 30) + 1,
    });
    const result = page(rows, q.limit);
    for (const n of result.items)
      await this.audit.record(a, 'care.note.read', 'careNote', n.id, []);
    return {
      items: result.items.map((n) => ({
        id: n.id,
        text: n.ciphertext ? openText(n.ciphertext) : '',
        visibility: n.visibility,
        createdAt: n.createdAt,
        expiresAt: n.expiresAt,
      })),
      nextCursor: result.nextCursor,
    };
  }
}
