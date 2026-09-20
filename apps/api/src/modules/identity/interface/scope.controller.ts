import {
  Controller,
  Get,
  Put,
  Inject,
  Req,
  Param,
  ParseUUIDPipe,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  IsIn,
  IsArray,
  ArrayMaxSize,
  IsUUID,
  IsBoolean,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { PrismaService } from '../../../platform/database/prisma.service';
import { ValidatedBody } from '../../../platform/http/validated';
import { DataScopeService } from '../application/data-scope.service';
import { AccessService } from '../application/access.service';
import { AuditService } from '../../audit/audit.service';
import { Permission, type AuthRequest } from './access.guard';
class ScopeEntry {
  @ApiProperty({ type: String }) @IsUUID() organizationId!: string;
  @ApiProperty({ type: Boolean }) @IsBoolean() descendants!: boolean;
}
class ScopeDto {
  @ApiProperty({ type: String }) @IsIn(['ALL', 'ORGANIZATIONS', 'SELF', 'NONE']) mode!: string;
  @ApiProperty({ type: String, nullable: true })
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  memberId!: string | null;
  @ApiProperty({ type: [ScopeEntry] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ScopeEntry)
  organizations!: ScopeEntry[];
}
@Controller('churches/:churchId/identity/users/:id/scope')
@Permission('identity.manage')
export class ScopeController {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(DataScopeService) private readonly scope: DataScopeService,
    @Inject(AccessService) private readonly access: AccessService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}
  @Get() async get(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.access.require(r.actor, c, 'identity.manage');
    await this.scope.requireFull(r.actor);
    const u = await this.db.user.findFirst({
      where: { churchId: c, id },
      select: { scopeMode: true, memberId: true },
    });
    if (!u) throw new BadRequestException('사용자를 확인하세요.');
    return {
      mode: u.scopeMode,
      memberId: u.memberId,
      organizations: await this.db.userScope.findMany({
        where: { churchId: c, userId: id },
        select: { organizationId: true, descendants: true },
      }),
    };
  }
  @Put() async set(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @ValidatedBody(ScopeDto) d: ScopeDto,
  ) {
    this.access.require(r.actor, c, 'identity.manage');
    if (Date.now() - (r.actor.authenticatedAt ?? 0) > 15 * 60000)
      throw new UnauthorizedException('다시 로그인하세요.');
    if (id === r.actor.userId) throw new BadRequestException('본인의 범위는 변경할 수 없습니다.');
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${c},0))`;
      await this.scope.requireFull(r.actor, tx);
      if (!(await tx.user.findFirst({ where: { churchId: c, id } })))
        throw new BadRequestException('사용자를 확인하세요.');
      if (d.memberId && !(await tx.member.findFirst({ where: { churchId: c, id: d.memberId } })))
        throw new BadRequestException('본인 교인을 확인하세요.');
      if (d.mode === 'SELF' && !d.memberId)
        throw new BadRequestException('본인 교인이 필요합니다.');
      if (new Set(d.organizations.map((x) => x.organizationId)).size !== d.organizations.length)
        throw new BadRequestException('중복 조직입니다.');
      if (
        (await tx.organization.count({
          where: {
            churchId: c,
            id: { in: d.organizations.map((x) => x.organizationId) },
            closedOn: null,
          },
        })) !== d.organizations.length
      )
        throw new BadRequestException('담당 조직을 확인하세요.');
      await tx.userScope.deleteMany({ where: { churchId: c, userId: id } });
      await tx.userScope.createMany({
        data: d.organizations.map((x) => ({ ...x, churchId: c, userId: id })),
      });
      await tx.user.update({
        where: { id },
        data: { scopeMode: d.mode, memberId: d.memberId, authVersion: { increment: 1 } },
      });
      await tx.session.deleteMany({ where: { userId: id } });
      await this.audit.record(
        r.actor,
        'user.scope.change',
        'user',
        id,
        ['scopeMode', 'memberId', 'organizations'],
        tx,
      );
      return { ok: true };
    });
  }
}
