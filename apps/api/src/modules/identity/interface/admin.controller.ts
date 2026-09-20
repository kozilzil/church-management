import { ApiProperty } from '@nestjs/swagger';
import {
  Controller,
  Get,
  Post,
  Patch,
  Inject,
  Req,
  Param,
  ParseUUIDPipe,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import {
  IsString,
  IsArray,
  ArrayMaxSize,
  IsUUID,
  IsBoolean,
  Length,
  Matches,
} from 'class-validator';
import { Permission, type AuthRequest } from './access.guard';
import { ValidatedBody as Body } from '../../../platform/http/validated';
import { UserDto } from './auth.dto';
import { PrismaService } from '../../../platform/database/prisma.service';
import { AccessService } from '../application/access.service';
import { AuditService } from '../../audit/audit.service';
import { hashPassword } from '../infrastructure/password';
export class RoleDto {
  @ApiProperty({ type: String, required: true })
  @IsString()
  @Length(1, 80)
  name!: string;
  @ApiProperty({ type: [String], required: true })
  @IsArray()
  @ArrayMaxSize(30)
  @Matches(/^[a-z.]{1,60}$/, { each: true })
  permissions!: string[];
}
export class RolesDto {
  @ApiProperty({ type: [String], required: true })
  @IsArray()
  @ArrayMaxSize(30)
  @IsUUID(undefined, { each: true })
  roleIds!: string[];
  @ApiProperty({ type: Boolean, required: true })
  @IsBoolean()
  active!: boolean;
}
@Controller('churches/:churchId/identity')
@Permission('identity.manage')
export class AdminController {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AccessService) private readonly access: AccessService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}
  private check(r: AuthRequest, c: string, write = false) {
    this.access.require(r.actor, c, 'identity.manage');
    if (write && Date.now() - (r.actor.authenticatedAt ?? 0) > 15 * 60000)
      throw new UnauthorizedException({
        code: 'REAUTHENTICATION_REQUIRED',
        message: '권한 변경 전에 다시 로그인하세요.',
      });
  }
  @Get() async list(@Req() r: AuthRequest, @Param('churchId', ParseUUIDPipe) c: string) {
    this.check(r, c);
    return {
      users: await this.db.user.findMany({
        where: { churchId: c },
        select: {
          id: true,
          username: true,
          active: true,
          totpEnabled: true,
          roles: { select: { roleId: true } },
        },
        take: 100,
      }),
      roles: await this.db.role.findMany({
        where: { churchId: c },
        select: { id: true, name: true, permissions: { select: { permissionCode: true } } },
        take: 100,
      }),
      grantablePermissions: r.actor.permissions,
    };
  }
  @Post('users') async user(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Body(UserDto) d: UserDto,
  ) {
    this.check(r, c, true);
    const hash = await hashPassword(d.password);
    return this.db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { churchId: c, username: d.username, passwordHash: hash },
      });
      await this.audit.record(r.actor, 'user.create', 'user', u.id, [], tx);
      return { id: u.id, username: u.username };
    });
  }
  @Post('roles') async role(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Body(RoleDto) d: RoleDto,
  ) {
    this.check(r, c, true);
    if (d.permissions.some((x) => !r.actor.permissions.includes(x)))
      throw new BadRequestException({
        code: 'UNGRANTABLE_PERMISSION',
        message: '보유한 권한만 부여할 수 있습니다.',
      });
    return this.db.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          churchId: c,
          name: d.name,
          permissions: {
            create: [...new Set(d.permissions)].map((permissionCode) => ({ permissionCode })),
          },
        },
      });
      await this.audit.record(r.actor, 'role.create', 'role', role.id, ['permissions'], tx);
      return { id: role.id };
    });
  }
  @Patch('users/:id') async assign(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(RolesDto) d: RolesDto,
  ) {
    this.check(r, c, true);
    if (id === r.actor.userId)
      throw new BadRequestException({
        code: 'SELF_ROLE_CHANGE_DENIED',
        message: '본인의 권한·활성 상태는 이 작업으로 변경할 수 없습니다.',
      });
    return this.db.$transaction(async (tx) => {
      const roles = await tx.role.findMany({
        where: { churchId: c, id: { in: d.roleIds } },
        include: { permissions: true },
      });
      if (
        roles.length !== new Set(d.roleIds).size ||
        roles.some((role) =>
          role.permissions.some((p) => !r.actor.permissions.includes(p.permissionCode)),
        )
      )
        throw new BadRequestException({
          code: 'INVALID_ROLES',
          message: '부여 가능한 교회 내 역할을 선택하세요.',
        });
      const user = await tx.user.findFirst({ where: { churchId: c, id } });
      if (!user)
        throw new BadRequestException({ code: 'INVALID_USER', message: '사용자를 확인하세요.' });
      await tx.userRole.deleteMany({ where: { churchId: c, userId: id } });
      await tx.userRole.createMany({
        data: roles.map((role) => ({ churchId: c, userId: id, roleId: role.id })),
      });
      await tx.user.update({
        where: { id },
        data: { active: d.active, authVersion: { increment: 1 } },
      });
      await tx.session.deleteMany({ where: { userId: id } });
      await this.audit.record(r.actor, 'user.roles.change', 'user', id, ['roles', 'active'], tx);
      return { ok: true };
    });
  }
}
