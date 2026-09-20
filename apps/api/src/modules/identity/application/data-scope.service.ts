import { Inject, Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../platform/database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { Actor } from '../domain/actor';
type Tx = Prisma.TransactionClient;
@Injectable()
export class DataScopeService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}
  async state(a: Actor, tx: Tx = this.db) {
    const user = await tx.user.findFirst({
      where: { id: a.userId, churchId: a.churchId, active: true },
    });
    return { mode: user?.scopeMode ?? 'NONE', memberId: user?.memberId ?? null };
  }
  async full(a: Actor, tx: Tx = this.db) {
    return (await this.state(a, tx)).mode === 'ALL';
  }
  async deny(a: Actor): Promise<never> {
    await this.audit.record(a, 'scope.denied', 'scope', 'restricted', [], undefined, 'denied');
    throw new ForbiddenException({
      code: 'DATA_SCOPE_DENIED',
      message: '담당 범위를 벗어난 요청입니다.',
    });
  }
  async requireFull(a: Actor, tx: Tx = this.db) {
    if (!(await this.full(a, tx))) await this.deny(a);
  }
  async organizations(a: Actor, tx: Tx = this.db): Promise<string[] | null> {
    const s = await this.state(a, tx);
    if (s.mode === 'ALL') return null;
    if (s.mode !== 'ORGANIZATIONS') return [];
    const rows = await tx.$queryRaw<{ id: string }[]>`WITH RECURSIVE allowed(id, descendants) AS (
   SELECT organization_id, descendants FROM user_scope WHERE church_id=${a.churchId}::uuid AND user_id=${a.userId}::uuid
   UNION SELECT o.id, true FROM organization o JOIN allowed p ON o.parent_id=p.id WHERE p.descendants AND o.church_id=${a.churchId}::uuid
  ) SELECT DISTINCT id FROM allowed`;
    return rows.map((x) => x.id);
  }
  async members(a: Actor, tx: Tx = this.db): Promise<Prisma.MemberWhereInput> {
    const s = await this.state(a, tx);
    if (s.mode === 'ALL') return { churchId: a.churchId };
    if (s.mode === 'SELF')
      return { churchId: a.churchId, id: s.memberId ?? '00000000-0000-0000-0000-000000000000' };
    const ids = await this.organizations(a, tx);
    return {
      churchId: a.churchId,
      organizationMemberships: {
        some: { churchId: a.churchId, organizationId: { in: ids ?? [] }, effectiveTo: null },
      },
    };
  }
  async member(a: Actor, id: string, tx: Tx = this.db) {
    const row = await tx.member.findFirst({ where: { AND: [await this.members(a, tx), { id }] } });
    if (!row) {
      await this.audit.record(a, 'scope.denied', 'member', id, [], undefined, 'denied');
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: '대상을 찾을 수 없습니다.',
      });
    }
    return row;
  }
  async households(a: Actor, tx: Tx = this.db): Promise<Prisma.HouseholdWhereInput> {
    if (await this.full(a, tx)) return { churchId: a.churchId };
    const member = await this.members(a, tx);
    return { churchId: a.churchId, memberships: { some: { effectiveTo: null, member } } };
  }
  async organization(a: Actor, id: string, tx: Tx = this.db) {
    const ids = await this.organizations(a, tx);
    if (ids !== null && !ids.includes(id)) await this.deny(a);
    if (!(await tx.organization.findFirst({ where: { churchId: a.churchId, id, closedOn: null } })))
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: '조직을 찾을 수 없습니다.',
      });
  }
}
