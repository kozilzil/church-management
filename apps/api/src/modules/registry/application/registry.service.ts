import { DataScopeService } from '../../identity/application/data-scope.service';
import type { MemberResponse } from '@church/contracts';
import {
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, type Member } from '@prisma/client';
import { PrismaService } from '../../../platform/database/prisma.service';
import { AccessService } from '../../identity/application/access.service';
import type { Actor } from '../../identity/domain/actor';
import { AuditService } from '../../audit/audit.service';
import {
  effectiveDate,
  normalizedName,
  normalizedPhone,
  requireAfter,
  requireTransition,
  PolicyError,
} from '../domain/policies';
import type {
  RelationDto,
  MemberDto,
  ProfileDto,
  StatusChangeDto,
  ListDto,
  HouseholdDto,
  MoveDto,
  OrganizationDto,
  AffiliationDto,
  PositionDto,
  AppointmentDto,
  StatusDefinitionDto,
  CodeDto,
} from '../interface/registry.dto';
type Tx = Prisma.TransactionClient;
const dateString = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
function missing(): never {
  throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND', message: '대상을 찾을 수 없습니다.' });
}
function conflict(code: string, message: string): never {
  throw new ConflictException({ code, message });
}
@Injectable()
export class RegistryService {
  constructor(
    @Inject(DataScopeService) private readonly scope: DataScopeService,
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AccessService) private readonly access: AccessService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}
  private check(actor: Actor, churchId: string, permission = 'membership.read') {
    this.access.require(actor, churchId, permission);
  }
  private async date(tx: Tx, churchId: string, input: string) {
    const church = await tx.church.findUnique({ where: { id: churchId } });
    if (!church) missing();
    return effectiveDate(input, church.timezone);
  }
  private async member(tx: Tx, churchId: string, id: string, actor: Actor) {
    this.check(actor, churchId);
    const row = await this.scope.member(actor, id, tx);
    if (!row) missing();
    return row;
  }
  private memberView(row: Member, actor: Actor): MemberResponse {
    return {
      id: row.id,
      memberNumber: row.memberNumber,
      name: row.name,
      registeredOn: dateString(row.registeredOn),
      status: row.status,
      version: row.version,
      ...(actor.permissions.includes('membership.pii')
        ? { phone: row.phone, address: row.address }
        : {}),
    };
  }
  private async mutation<T>(
    actor: Actor,
    churchId: string,
    work: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    this.check(actor, churchId, 'membership.write');
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.db.$transaction(
          async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${churchId}, 0))`;
            return work(tx);
          },
          { isolationLevel: 'Serializable', timeout: 15000 },
        );
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === 'P2034' && attempt < 2) continue;
          if (['P2002', 'P2003', 'P2004', 'P2034'].includes(error.code))
            conflict('DATA_CONFLICT', '중복 또는 관계 제약을 확인하고 다시 시도하세요.');
        }
        if (error instanceof PolicyError)
          throw new BadRequestException({ code: error.code, message: error.message });
        throw error;
      }
    }
    throw new Error('Unreachable');
  }
  async createMember(actor: Actor, churchId: string, input: MemberDto) {
    if (
      !actor.permissions.includes('membership.pii') &&
      (input.phone !== undefined || input.address !== undefined)
    )
      await this.scope.deny(actor);
    return this.mutation(actor, churchId, async (tx) => {
      await this.scope.requireFull(actor, tx);
      if (
        !(await tx.memberStatus.findUnique({
          where: { churchId_code: { churchId, code: input.status } },
        }))
      )
        throw new BadRequestException({
          code: 'UNKNOWN_STATUS',
          message: '정의된 교적 상태가 아닙니다.',
        });
      const registeredOn = await this.date(tx, churchId, input.registeredOn);
      const row = await tx.member.create({
        data: {
          churchId,
          memberNumber: input.memberNumber,
          name: input.name.trim(),
          normalizedName: normalizedName(input.name),
          phone: input.phone ?? null,
          normalizedPhone: input.phone ? normalizedPhone(input.phone) : null,
          address: input.address ?? null,
          registeredOn,
          status: input.status,
        },
      });
      await tx.memberStatusHistory.create({
        data: {
          churchId,
          memberId: row.id,
          toStatus: row.status,
          effectiveFrom: registeredOn,
          reason: 'INITIAL_REGISTRATION',
          actorId: actor.userId,
        },
      });
      await this.audit.record(
        actor,
        'member.create',
        'member',
        row.id,
        ['memberNumber', 'name', 'status'],
        tx,
      );
      return this.memberView(row, actor);
    });
  }
  async updateMember(actor: Actor, churchId: string, id: string, input: ProfileDto) {
    if (
      !actor.permissions.includes('membership.pii') &&
      (input.phone !== undefined || input.address !== undefined)
    )
      await this.scope.deny(actor);
    return this.mutation(actor, churchId, async (tx) => {
      const row = await this.member(tx, churchId, id, actor);
      if (row.version !== input.version)
        conflict('VERSION_CONFLICT', '다른 사용자가 수정했습니다. 새로 조회하세요.');
      const updated = await tx.member.update({
        where: { id },
        data: {
          name: input.name.trim(),
          normalizedName: normalizedName(input.name),
          ...(input.phone !== undefined
            ? { phone: input.phone || null, normalizedPhone: normalizedPhone(input.phone) || null }
            : {}),
          ...(input.address !== undefined ? { address: input.address || null } : {}),
          version: { increment: 1 },
        },
      });
      await this.audit.record(
        actor,
        'member.update',
        'member',
        id,
        Object.keys(input).filter((x) => x !== 'version'),
        tx,
      );
      return this.memberView(updated, actor);
    });
  }
  async changeStatus(actor: Actor, churchId: string, id: string, input: StatusChangeDto) {
    return this.mutation(actor, churchId, async (tx) => {
      const row = await this.member(tx, churchId, id, actor);
      if (row.version !== input.version)
        conflict('VERSION_CONFLICT', '새로 조회 후 다시 시도하세요.');
      const status = await tx.memberStatus.findUnique({
        where: { churchId_code: { churchId, code: row.status } },
      });
      requireTransition(row.status, input.status, status?.allowedNext ?? []);
      if (
        !(await tx.memberStatus.findUnique({
          where: { churchId_code: { churchId, code: input.status } },
        }))
      )
        throw new BadRequestException({ code: 'UNKNOWN_STATUS', message: '상태가 없습니다.' });
      const effectiveFrom = await this.date(tx, churchId, input.effectiveFrom);
      const last = await tx.memberStatusHistory.findFirst({
        where: { churchId, memberId: id },
        orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      });
      if (last && effectiveFrom < last.effectiveFrom)
        throw new PolicyError('BACKDATED_CHANGE', '최근 이력보다 앞선 적용일입니다.');
      await tx.memberStatusHistory.create({
        data: {
          churchId,
          memberId: id,
          fromStatus: row.status,
          toStatus: input.status,
          effectiveFrom,
          reason: input.reason,
          actorId: actor.userId,
        },
      });
      const updated = await tx.member.update({
        where: { id },
        data: { status: input.status, version: { increment: 1 } },
      });
      await this.audit.record(actor, 'member.status.change', 'member', id, ['status'], tx);
      return this.memberView(updated, actor);
    });
  }
  async listMembers(actor: Actor, churchId: string, input: ListDto) {
    this.check(actor, churchId);
    const limit = input.limit ?? 30;
    const q = normalizedName(input.q ?? '');
    const where: Prisma.MemberWhereInput = {
      churchId,
      AND: [await this.scope.members(actor)],
      ...(input.cursor ? { id: { gt: input.cursor } } : {}),
      ...(q
        ? {
            OR: [
              { normalizedName: { contains: q } },
              { memberNumber: { contains: input.q!, mode: 'insensitive' } },
              ...(actor.permissions.includes('membership.pii') && normalizedPhone(q)
                ? [{ normalizedPhone: { contains: normalizedPhone(q) } }]
                : []),
            ],
          }
        : {}),
    };
    if (input.organizationId) {
      const links = await this.db.organizationMembership.findMany({
        where: { churchId, organizationId: input.organizationId, effectiveTo: null },
        select: { memberId: true },
      });
      where.id = {
        ...(input.cursor ? { gt: input.cursor } : {}),
        in: links.map((x) => x.memberId),
      };
    }
    const rows = await this.db.member.findMany({ where, orderBy: { id: 'asc' }, take: limit + 1 });
    return {
      items: rows.slice(0, limit).map((row) => this.memberView(row, actor)),
      nextCursor: rows.length > limit ? rows[limit - 1]!.id : null,
    };
  }
  async detail(actor: Actor, churchId: string, id: string) {
    this.check(actor, churchId);
    const member = await this.member(this.db, churchId, id, actor);
    const [statuses, households, organizations, positions, relations] = await Promise.all([
      this.db.memberStatusHistory.findMany({
        where: { churchId, memberId: id },
        orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }],
      }),
      this.db.householdMembership.findMany({
        where: { churchId, memberId: id },
        orderBy: { effectiveFrom: 'asc' },
      }),
      this.db.organizationMembership.findMany({
        where: { churchId, memberId: id },
        orderBy: { effectiveFrom: 'asc' },
      }),
      this.db.positionAppointment.findMany({
        where: { churchId, memberId: id },
        orderBy: { effectiveFrom: 'asc' },
      }),
      this.db.memberRelation.findMany({
        where: { churchId, memberId: id },
        orderBy: { effectiveFrom: 'asc' },
      }),
    ]);
    const visibleOrgs = await this.scope.organizations(actor);
    const visibleHouses = await this.db.household.findMany({
      where: await this.scope.households(actor),
      select: { id: true },
    });
    const houseIds = new Set(visibleHouses.map((x) => x.id));
    const related = await this.db.member.findMany({
      where: {
        AND: [
          await this.scope.members(actor),
          { id: { in: relations.map((x) => x.relatedMemberId) } },
        ],
      },
      select: { id: true, name: true },
    });
    return {
      ...this.memberView(member, actor),
      relations: relations
        .filter((x) => related.some((m) => m.id === x.relatedMemberId))
        .map((x) => ({
          id: x.id,
          relatedMemberId: x.relatedMemberId,
          name: related.find((m) => m.id === x.relatedMemberId)?.name,
          relationship: x.relationship,
          effectiveFrom: dateString(x.effectiveFrom),
          effectiveTo: dateString(x.effectiveTo),
        })),
      statusHistory: statuses.map((x) => ({
        id: x.id,
        fromStatus: x.fromStatus,
        toStatus: x.toStatus,
        effectiveFrom: dateString(x.effectiveFrom),
        ...(actor.permissions.includes('membership.pii') ? { reason: x.reason } : {}),
      })),
      households: households
        .filter((x) => houseIds.has(x.householdId))
        .map((x) => ({
          id: x.id,
          householdId: x.householdId,
          relationship: x.relationship,
          representative: x.representative,
          effectiveFrom: dateString(x.effectiveFrom),
          effectiveTo: dateString(x.effectiveTo),
        })),
      organizations: organizations
        .filter((x) => visibleOrgs === null || visibleOrgs.includes(x.organizationId))
        .map((x) => ({
          id: x.id,
          organizationId: x.organizationId,
          role: x.role,
          primary: x.primary,
          effectiveFrom: dateString(x.effectiveFrom),
          effectiveTo: dateString(x.effectiveTo),
        })),
      positions: positions
        .filter(
          (x) =>
            !x.organizationId || visibleOrgs === null || visibleOrgs.includes(x.organizationId),
        )
        .map((x) => ({
          id: x.id,
          positionId: x.positionId,
          name: x.positionName,
          organizationId: x.organizationId,
          effectiveFrom: dateString(x.effectiveFrom),
          effectiveTo: dateString(x.effectiveTo),
        })),
    };
  }
  async createHousehold(actor: Actor, churchId: string, input: HouseholdDto) {
    if (
      !actor.permissions.includes('membership.pii') &&
      (input.phone !== undefined || input.address !== undefined)
    )
      await this.scope.deny(actor);
    return this.mutation(actor, churchId, async (tx) => {
      await this.scope.requireFull(actor, tx);
      const row = await tx.household.create({
        data: {
          churchId,
          name: input.name,
          phone: input.phone ?? null,
          address: input.address ?? null,
        },
      });
      await this.audit.record(actor, 'household.create', 'household', row.id, ['name'], tx);
      return { id: row.id, name: row.name };
    });
  }
  async listHouseholds(actor: Actor, churchId: string, input: ListDto) {
    this.check(actor, churchId);
    const rows = await this.db.household.findMany({
      where: {
        AND: [await this.scope.households(actor)],
        ...(input.cursor ? { id: { gt: input.cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: (input.limit ?? 30) + 1,
    });
    const limit = input.limit ?? 30;
    return {
      items: await Promise.all(
        rows.slice(0, limit).map(async (x) => ({
          id: x.id,
          name: x.name,
          archived: !!x.archivedAt,
          activeMembers: await this.db.householdMembership.count({
            where: {
              churchId,
              householdId: x.id,
              effectiveTo: null,
              member: await this.scope.members(actor),
            },
          }),
          ...(actor.permissions.includes('membership.pii') && (await this.scope.full(actor))
            ? { phone: x.phone, address: x.address }
            : {}),
        })),
      ),
      nextCursor: rows.length > limit ? rows[limit - 1]!.id : null,
    };
  }
  async moveHousehold(actor: Actor, churchId: string, input: MoveDto) {
    return this.mutation(actor, churchId, async (tx) => {
      await this.scope.requireFull(actor, tx);
      const member = await this.member(tx, churchId, input.memberId, actor);
      const household = await tx.household.findFirst({
        where: { churchId, id: input.householdId, archivedAt: null },
      });
      if (!household) missing();
      const date = await this.date(tx, churchId, input.effectiveFrom);
      if (date < member.registeredOn)
        throw new PolicyError('BEFORE_REGISTRATION', '등록일 이전에는 배정할 수 없습니다.');
      const current = await tx.householdMembership.findFirst({
        where: { churchId, memberId: input.memberId, effectiveTo: null },
      });
      if (current) {
        if (current.householdId === household.id)
          conflict('ALREADY_ASSIGNED', '이미 같은 가족입니다.');
        requireAfter(current.effectiveFrom, date);
        await tx.householdMembership.update({
          where: { id: current.id },
          data: { effectiveTo: date, representative: false },
        });
      }
      const row = await tx.householdMembership.create({
        data: {
          churchId,
          memberId: input.memberId,
          householdId: input.householdId,
          relationship: input.relationship,
          effectiveFrom: date,
        },
      });
      await this.audit.record(
        actor,
        'household.move',
        'member',
        input.memberId,
        ['householdId'],
        tx,
      );
      return { id: row.id };
    });
  }
  async representative(actor: Actor, churchId: string, id: string, memberId: string) {
    return this.mutation(actor, churchId, async (tx) => {
      await this.scope.requireFull(actor, tx);
      const row = await tx.householdMembership.findFirst({
        where: { churchId, householdId: id, memberId, effectiveTo: null },
      });
      if (!row) conflict('REPRESENTATIVE_NOT_MEMBER', '대표자는 현재 가족 구성원이어야 합니다.');
      await tx.householdMembership.updateMany({
        where: { churchId, householdId: id, representative: true },
        data: { representative: false },
      });
      await tx.householdMembership.update({
        where: { id: row.id },
        data: { representative: true },
      });
      await this.audit.record(
        actor,
        'household.representative',
        'householdMembership',
        row.id,
        ['representative'],
        tx,
      );
      return { ok: true };
    });
  }
  async archiveHousehold(actor: Actor, churchId: string, id: string) {
    return this.mutation(actor, churchId, async (tx) => {
      await this.scope.requireFull(actor, tx);
      if (!(await tx.household.findFirst({ where: { churchId, id } }))) missing();
      if (
        await tx.householdMembership.count({
          where: { churchId, householdId: id, effectiveTo: null },
        })
      )
        conflict('HOUSEHOLD_HAS_ACTIVE_MEMBERS', '활성 구성원이 있습니다.');
      await tx.household.update({ where: { id }, data: { archivedAt: new Date() } });
      await this.audit.record(actor, 'household.archive', 'household', id, [], tx);
      return { ok: true };
    });
  }
  async householdAt(actor: Actor, churchId: string, id: string, at?: string) {
    this.check(actor, churchId);
    if (
      !(await this.db.household.findFirst({
        where: { AND: [await this.scope.households(actor), { id }] },
      }))
    )
      missing();
    let date: Date | undefined;
    if (at) {
      try {
        date = await this.date(this.db, churchId, at);
      } catch (e) {
        if (e instanceof PolicyError)
          throw new BadRequestException({ code: e.code, message: e.message });
        throw e;
      }
    }
    const rows = await this.db.householdMembership.findMany({
      where: {
        churchId,
        householdId: id,
        member: await this.scope.members(actor),
        ...(date
          ? {
              effectiveFrom: { lte: date },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }],
            }
          : { effectiveTo: null }),
      },
    });
    const names = await this.db.member.findMany({
      where: { churchId, id: { in: rows.map((x) => x.memberId) } },
      select: { id: true, name: true, memberNumber: true },
    });
    return {
      items: rows.map((x) => ({
        name: names.find((m) => m.id === x.memberId)?.name,
        memberNumber: names.find((m) => m.id === x.memberId)?.memberNumber,
        id: x.id,
        memberId: x.memberId,
        relationship: x.relationship,
        ...(!at ? { representative: x.representative } : {}),
        effectiveFrom: dateString(x.effectiveFrom),
        effectiveTo: dateString(x.effectiveTo),
      })),
    };
  }
  async createOrganization(actor: Actor, churchId: string, input: OrganizationDto) {
    return this.mutation(actor, churchId, async (tx) => {
      await this.scope.requireFull(actor, tx);
      if (
        input.parentId &&
        !(await tx.organization.findFirst({
          where: { churchId, id: input.parentId, closedOn: null },
        }))
      )
        missing();
      if (
        !(await tx.organizationType.findUnique({
          where: { churchId_code: { churchId, code: input.type } },
        }))
      )
        throw new BadRequestException({
          code: 'UNKNOWN_ORGANIZATION_TYPE',
          message: '조직 유형을 확인하세요.',
        });
      const row = await tx.organization.create({
        data: { churchId, name: input.name, type: input.type, parentId: input.parentId ?? null },
      });
      await this.audit.record(actor, 'organization.create', 'organization', row.id, [], tx);
      return { id: row.id };
    });
  }
  async moveOrganization(actor: Actor, churchId: string, id: string, parentId: string | null) {
    return this.mutation(actor, churchId, async (tx) => {
      await this.scope.requireFull(actor, tx);
      if (!(await tx.organization.findFirst({ where: { churchId, id, closedOn: null } })))
        missing();
      let cursor = parentId;
      const visited = new Set<string>([id]);
      while (cursor) {
        if (visited.has(cursor)) conflict('ORGANIZATION_CYCLE', '순환 조직은 허용하지 않습니다.');
        visited.add(cursor);
        const parent = await tx.organization.findFirst({
          where: { churchId, id: cursor, closedOn: null },
        });
        if (!parent) missing();
        cursor = parent.parentId;
      }
      await tx.organization.update({ where: { id }, data: { parentId } });
      await this.audit.record(actor, 'organization.move', 'organization', id, ['parentId'], tx);
      return { ok: true };
    });
  }
  async closeOrganization(actor: Actor, churchId: string, id: string, dateInput: string) {
    return this.mutation(actor, churchId, async (tx) => {
      await this.scope.requireFull(actor, tx);
      if (!(await tx.organization.findFirst({ where: { churchId, id, closedOn: null } })))
        missing();
      if (
        (await tx.organization.count({ where: { churchId, parentId: id, closedOn: null } })) ||
        (await tx.organizationMembership.count({
          where: { churchId, organizationId: id, effectiveTo: null },
        })) ||
        (await tx.positionAppointment.count({
          where: { churchId, organizationId: id, effectiveTo: null },
        }))
      )
        conflict('ORGANIZATION_IN_USE', '하위 조직과 활성 소속·임명을 먼저 종료하세요.');
      const date = await this.date(tx, churchId, dateInput);
      const history = await tx.organizationMembership.findFirst({
        where: { churchId, organizationId: id, effectiveTo: { gt: date } },
      });
      if (
        history ||
        (await tx.positionAppointment.count({
          where: { churchId, organizationId: id, effectiveTo: { gt: date } },
        }))
      )
        conflict('INVALID_CLOSURE_DATE', '종료된 소속보다 앞서 폐쇄할 수 없습니다.');
      await tx.organization.update({ where: { id }, data: { closedOn: date } });
      await this.audit.record(actor, 'organization.close', 'organization', id, [], tx);
      return { ok: true };
    });
  }
  async listOrganizations(actor: Actor, churchId: string, input: ListDto) {
    this.check(actor, churchId);
    const allowed = await this.scope.organizations(actor);
    const limit = input.limit ?? 30;
    const rows = await this.db.organization.findMany({
      where: {
        churchId,
        id: {
          ...(allowed === null ? {} : { in: allowed }),
          ...(input.cursor ? { gt: input.cursor } : {}),
        },
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
    return {
      items: rows.slice(0, limit).map((x) => ({
        id: x.id,
        name: x.name,
        type: x.type,
        parentId: allowed === null || allowed.includes(x.parentId ?? '') ? x.parentId : null,
        closedOn: dateString(x.closedOn),
      })),
      nextCursor: rows.length > limit ? rows[limit - 1]!.id : null,
    };
  }
  async affiliate(actor: Actor, churchId: string, input: AffiliationDto) {
    return this.mutation(actor, churchId, async (tx) => {
      await this.scope.requireFull(actor, tx);
      const member = await this.member(tx, churchId, input.memberId, actor);
      if (
        !(await tx.organization.findFirst({
          where: { churchId, id: input.organizationId, closedOn: null },
        }))
      )
        missing();
      const date = await this.date(tx, churchId, input.effectiveFrom);
      if (date < member.registeredOn)
        throw new PolicyError('BEFORE_REGISTRATION', '등록일 이전입니다.');
      const row = await tx.organizationMembership.create({
        data: { churchId, ...input, effectiveFrom: date },
      });
      await this.audit.record(actor, 'organization.join', 'member', member.id, [], tx);
      return { id: row.id };
    });
  }
  async endAffiliation(actor: Actor, churchId: string, id: string, dateInput: string) {
    return this.mutation(actor, churchId, async (tx) => {
      await this.scope.requireFull(actor, tx);
      const row = await tx.organizationMembership.findFirst({
        where: { churchId, id, effectiveTo: null },
      });
      if (!row) missing();
      const date = await this.date(tx, churchId, dateInput);
      requireAfter(row.effectiveFrom, date);
      await tx.organizationMembership.update({ where: { id }, data: { effectiveTo: date } });
      await this.audit.record(actor, 'organization.leave', 'member', row.memberId, [], tx);
      return { ok: true };
    });
  }
  async savePosition(actor: Actor, churchId: string, input: PositionDto, id?: string) {
    return this.mutation(actor, churchId, async (tx) => {
      await this.scope.requireFull(actor, tx);
      if (id && !(await tx.position.findFirst({ where: { churchId, id } }))) missing();
      if (id && !input.allowConcurrent) {
        const duplicates = await tx.positionAppointment.groupBy({
          by: ['memberId'],
          where: { churchId, positionId: id, effectiveTo: null },
          _count: true,
        });
        if (duplicates.some((x) => x._count > 1))
          conflict('POSITION_DUPLICATES_EXIST', '중복 임명을 종료한 후 정책을 변경하세요.');
      }
      const row = id
        ? await tx.position.update({ where: { id }, data: input })
        : await tx.position.create({ data: { churchId, ...input } });
      await this.audit.record(
        actor,
        id ? 'position.update' : 'position.create',
        'position',
        row.id,
        Object.keys(input),
        tx,
      );
      return { id: row.id };
    });
  }
  async listPositions(actor: Actor, churchId: string, input: ListDto) {
    this.check(actor, churchId);
    const limit = input.limit ?? 30;
    const rows = await this.db.position.findMany({
      where: { churchId, ...(input.cursor ? { id: { gt: input.cursor } } : {}) },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
    return {
      items: rows.slice(0, limit).map((x) => ({
        id: x.id,
        name: x.name,
        sortOrder: x.sortOrder,
        allowConcurrent: x.allowConcurrent,
        active: x.active,
      })),
      nextCursor: rows.length > limit ? rows[limit - 1]!.id : null,
    };
  }
  async appoint(actor: Actor, churchId: string, input: AppointmentDto) {
    return this.mutation(actor, churchId, async (tx) => {
      await this.scope.requireFull(actor, tx);
      const member = await this.member(tx, churchId, input.memberId, actor);
      const position = await tx.position.findFirst({
        where: { churchId, id: input.positionId, active: true },
      });
      if (!position) missing();
      if (
        input.organizationId &&
        !(await tx.organization.findFirst({
          where: { churchId, id: input.organizationId, closedOn: null },
        }))
      )
        missing();
      if (
        !position.allowConcurrent &&
        (await tx.positionAppointment.count({
          where: {
            churchId,
            memberId: input.memberId,
            positionId: input.positionId,
            effectiveTo: null,
          },
        }))
      )
        conflict('DUPLICATE_APPOINTMENT', '중복 활성 임명을 허용하지 않습니다.');
      const date = await this.date(tx, churchId, input.effectiveFrom);
      if (date < member.registeredOn)
        throw new PolicyError('BEFORE_REGISTRATION', '등록일 이전입니다.');
      const row = await tx.positionAppointment.create({
        data: {
          churchId,
          memberId: member.id,
          positionId: position.id,
          organizationId: input.organizationId ?? null,
          positionName: position.name,
          effectiveFrom: date,
        },
      });
      await this.audit.record(actor, 'position.appoint', 'member', member.id, [], tx);
      return { id: row.id };
    });
  }
  async endAppointment(actor: Actor, churchId: string, id: string, dateInput: string) {
    return this.mutation(actor, churchId, async (tx) => {
      await this.scope.requireFull(actor, tx);
      const row = await tx.positionAppointment.findFirst({
        where: { churchId, id, effectiveTo: null },
      });
      if (!row) missing();
      const date = await this.date(tx, churchId, dateInput);
      requireAfter(row.effectiveFrom, date);
      await tx.positionAppointment.update({ where: { id }, data: { effectiveTo: date } });
      await this.audit.record(actor, 'position.end', 'member', row.memberId, [], tx);
      return { ok: true };
    });
  }
  async definitions(actor: Actor, churchId: string) {
    this.check(actor, churchId);
    return {
      statuses: (await this.db.memberStatus.findMany({ where: { churchId } })).map((x) => ({
        code: x.code,
        name: x.label,
        allowedNext: x.allowedNext,
      })),
      organizationTypes: (await this.db.organizationType.findMany({ where: { churchId } })).map(
        (x) => ({ code: x.code, name: x.name }),
      ),
    };
  }
  async saveStatus(actor: Actor, churchId: string, input: StatusDefinitionDto) {
    this.access.require(actor, churchId, 'identity.manage');
    return this.mutation(actor, churchId, async (tx) => {
      await this.scope.requireFull(actor, tx);
      await tx.memberStatus.upsert({
        where: { churchId_code: { churchId, code: input.code } },
        create: { churchId, code: input.code, label: input.name, allowedNext: input.allowedNext },
        update: { label: input.name, allowedNext: input.allowedNext },
      });
      await this.audit.record(actor, 'status.configure', 'memberStatus', input.code, [], tx);
      return { ok: true };
    });
  }
  async saveOrganizationType(actor: Actor, churchId: string, input: CodeDto) {
    this.access.require(actor, churchId, 'identity.manage');
    return this.mutation(actor, churchId, async (tx) => {
      await this.scope.requireFull(actor, tx);
      await tx.organizationType.upsert({
        where: { churchId_code: { churchId, code: input.code } },
        create: { churchId, code: input.code, name: input.name },
        update: { name: input.name },
      });
      await this.audit.record(
        actor,
        'organization.type.configure',
        'organizationType',
        input.code,
        [],
        tx,
      );
      return { ok: true };
    });
  }
  async auditEvents(actor: Actor, churchId: string, input: ListDto) {
    this.access.require(actor, churchId, 'audit.read');
    await this.scope.requireFull(actor);
    const limit = input.limit ?? 30;
    const rows = await this.db.auditEvent.findMany({
      where: { churchId, ...(input.cursor ? { id: { gt: input.cursor } } : {}) },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
    return {
      items: rows.slice(0, limit).map((x) => ({
        id: x.id,
        actorId: x.actorId,
        roles: x.roles,
        action: x.action,
        resourceType: x.resourceType,
        resourceId: x.resourceId,
        outcome: x.outcome,
        correlationId: x.correlationId,
        fields: x.fields,
        createdAt: x.createdAt.toISOString(),
      })),
      nextCursor: rows.length > limit ? rows[limit - 1]!.id : null,
    };
  }
  async addRelation(actor: Actor, churchId: string, id: string, input: RelationDto) {
    return this.mutation(actor, churchId, async (tx) => {
      await this.member(tx, churchId, id, actor);
      await this.member(tx, churchId, input.relatedMemberId, actor);
      if (id === input.relatedMemberId)
        throw new PolicyError('SELF_RELATION', '자기 자신과 가족 관계를 만들 수 없습니다.');
      const date = await this.date(tx, churchId, input.effectiveFrom);
      const row = await tx.memberRelation.create({
        data: {
          churchId,
          memberId: id,
          relatedMemberId: input.relatedMemberId,
          relationship: input.relationship,
          effectiveFrom: date,
        },
      });
      await this.audit.record(actor, 'member.relation.create', 'memberRelation', row.id, [], tx);
      return { id: row.id };
    });
  }
  async endRelation(actor: Actor, churchId: string, id: string, dateInput: string) {
    return this.mutation(actor, churchId, async (tx) => {
      const row = await tx.memberRelation.findFirst({ where: { id, churchId, effectiveTo: null } });
      if (!row) missing();
      await this.scope.member(actor, row.memberId, tx);
      await this.scope.member(actor, row.relatedMemberId, tx);
      const date = await this.date(tx, churchId, dateInput);
      requireAfter(row.effectiveFrom, date);
      await tx.memberRelation.update({ where: { id }, data: { effectiveTo: date } });
      await this.audit.record(actor, 'member.relation.end', 'memberRelation', id, [], tx);
      return { ok: true };
    });
  }
}
