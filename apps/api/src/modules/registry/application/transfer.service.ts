import {
  Inject,
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../platform/database/prisma.service';
import { AccessService } from '../../identity/application/access.service';
import { DataScopeService } from '../../identity/application/data-scope.service';
import { AuditService } from '../../audit/audit.service';
import type { Actor } from '../../identity/domain/actor';
import { MemberDto } from '../interface/registry.dto';
import type { ImportDto, ExportDto } from '../interface/transfer.dto';
import { parseCsv, csvCell } from '../domain/csv';
import { effectiveDate, normalizedName, normalizedPhone } from '../domain/policies';
@Injectable()
export class TransferService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AccessService) private readonly access: AccessService,
    @Inject(DataScopeService) private readonly scope: DataScopeService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}
  private async importer(a: Actor, c: string) {
    this.access.require(a, c, 'membership.import');
    this.access.require(a, c, 'membership.write');
    await this.scope.requireFull(a);
  }
  async purgeExpired() {
    await this.db.memberImport.deleteMany({
      where: { expiresAt: { lt: new Date() }, appliedAt: null },
    });
    await this.db.memberExport.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }
  async preview(a: Actor, c: string, d: ImportDto) {
    await this.importer(a, c);
    let table: string[][];
    try {
      table = parseCsv(d.csv);
    } catch (e) {
      throw new BadRequestException(String(e));
    }
    if (
      !d.mapping ||
      ['memberNumber', 'name', 'registeredOn', 'status'].some(
        (k) => !d.mapping[k as keyof typeof d.mapping],
      )
    )
      throw new BadRequestException('필수 열을 연결하세요.');
    const mapping = Object.entries(d.mapping).filter(([, v]) => v !== undefined);
    if (mapping.some(([, header]) => !table[0]!.includes(header)))
      throw new BadRequestException('연결한 열이 CSV에 없습니다.');
    const rows = table
      .slice(1)
      .map((line) =>
        Object.fromEntries(
          mapping.map(([key, header]) => [key, line[table[0]!.indexOf(header)]!.trim()]),
        ),
      ) as unknown as MemberDto[];
    if (!a.permissions.includes('membership.pii') && rows.some((r) => r.phone || r.address))
      await this.scope.deny(a);
    const church = await this.db.church.findUniqueOrThrow({ where: { id: c } });
    const statuses = new Set(
      (await this.db.memberStatus.findMany({ where: { churchId: c } })).map((x) => x.code),
    );
    const errors: { row: number; fields: string[] }[] = [];
    const candidates: { row: number; memberIds: string[] }[] = [];
    const numbers = new Set<string>();
    for (const [i, row] of rows.entries()) {
      const problems = (
        await validate(plainToInstance(MemberDto, row), {
          whitelist: true,
          forbidNonWhitelisted: true,
        })
      ).map((e) => e.property);
      if (!normalizedName(row.name ?? '')) problems.push('name');
      try {
        effectiveDate(row.registeredOn, church.timezone);
      } catch {
        problems.push('registeredOn');
      }
      if (!statuses.has(row.status)) problems.push('status');
      if (
        numbers.has(row.memberNumber) ||
        (await this.db.member.count({ where: { churchId: c, memberNumber: row.memberNumber } }))
      )
        problems.push('memberNumber');
      numbers.add(row.memberNumber);
      if (problems.length) errors.push({ row: i + 2, fields: [...new Set(problems)] });
      const similar = await this.db.member.findMany({
        where: { churchId: c, normalizedName: normalizedName(row.name ?? '') },
        select: { id: true },
        take: 5,
      });
      if (similar.length) candidates.push({ row: i + 2, memberIds: similar.map((x) => x.id) });
    }
    await this.db.memberImport.deleteMany({
      where: { expiresAt: { lt: new Date() }, appliedAt: null },
    });
    let batchId: string | null = null;
    if (!errors.length) {
      const digest = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
      const existing = await this.db.memberImport.findUnique({
        where: { churchId_userId_digest: { churchId: c, userId: a.userId, digest } },
      });
      const batch =
        existing ??
        (await this.db.memberImport.create({
          data: {
            churchId: c,
            userId: a.userId,
            digest,
            rows: rows as unknown as Prisma.InputJsonValue,
            expiresAt: new Date(Date.now() + 3600000),
          },
        }));
      batchId = batch.id;
    }
    await this.audit.record(a, 'member.import.preview', 'import', batchId ?? 'invalid', []);
    return {
      batchId,
      rows: rows.map((r, i) => ({
        row: i + 2,
        memberNumber: r.memberNumber,
        name: r.name,
        status: r.status,
        registeredOn: r.registeredOn,
      })),
      errors,
      candidates,
    };
  }
  async apply(a: Actor, c: string, id: string) {
    await this.importer(a, c);
    return this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${c},0))`;
        await this.scope.requireFull(a, tx);
        const batch = await tx.memberImport.findFirst({
          where: { id, churchId: c, userId: a.userId },
        });
        if (!batch) throw new NotFoundException('가져오기 작업을 찾을 수 없습니다.');
        if (batch.appliedAt) return { id, applied: true, replayed: true };
        if (batch.expiresAt < new Date()) throw new ConflictException('미리보기가 만료되었습니다.');
        const rows = batch.rows as unknown as MemberDto[];
        if (!a.permissions.includes('membership.pii') && rows.some((r) => r.phone || r.address))
          await this.scope.deny(a);
        const church = await tx.church.findUniqueOrThrow({ where: { id: c } });
        for (const r of rows) {
          if (
            !(await tx.memberStatus.findUnique({
              where: { churchId_code: { churchId: c, code: r.status } },
            }))
          )
            throw new ConflictException('상태 설정이 변경되었습니다.');
          const date = effectiveDate(r.registeredOn, church.timezone);
          const member = await tx.member.create({
            data: {
              churchId: c,
              memberNumber: r.memberNumber,
              name: r.name,
              normalizedName: normalizedName(r.name),
              registeredOn: date,
              status: r.status,
              phone: r.phone ?? null,
              normalizedPhone: r.phone ? normalizedPhone(r.phone) : null,
              address: r.address ?? null,
            },
          });
          await tx.memberStatusHistory.create({
            data: {
              churchId: c,
              memberId: member.id,
              toStatus: r.status,
              effectiveFrom: date,
              reason: 'CSV_IMPORT',
              actorId: a.userId,
            },
          });
          await this.audit.record(
            a,
            'member.import.create',
            'member',
            member.id,
            ['memberNumber', 'name', 'status'],
            tx,
          );
        }
        await tx.memberImport.update({ where: { id }, data: { appliedAt: new Date(), rows: [] } });
        await this.audit.record(a, 'member.import.apply', 'import', id, [], tx);
        return { id, applied: true, replayed: false, count: rows.length };
      },
      { timeout: 60000 },
    );
  }
  async requestExport(a: Actor, c: string, d: ExportDto) {
    this.access.require(a, c, 'membership.export');
    this.access.require(a, c, 'membership.read');
    const row = await this.db.memberExport.create({
      data: {
        churchId: c,
        userId: a.userId,
        query: d.q,
        organizationId: d.organizationId ?? null,
        expiresAt: new Date(Date.now() + 10 * 60000),
      },
    });
    await this.audit.record(a, 'member.export.request', 'export', row.id, []);
    return { id: row.id, expiresAt: row.expiresAt.toISOString() };
  }
  async download(a: Actor, c: string, id: string) {
    this.access.require(a, c, 'membership.export');
    this.access.require(a, c, 'membership.read');
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${c},0))`;
      const job = await tx.memberExport.findFirst({
        where: {
          id,
          churchId: c,
          userId: a.userId,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!job) throw new NotFoundException('만료되었거나 사용한 내보내기입니다.');
      const where: Prisma.MemberWhereInput = {
        AND: [
          await this.scope.members(a, tx),
          { normalizedName: { contains: normalizedName(job.query) } },
        ],
      };
      if (job.organizationId)
        where.organizationMemberships = {
          some: { churchId: c, organizationId: job.organizationId, effectiveTo: null },
        };
      const rows = await tx.member.findMany({ where, orderBy: { id: 'asc' }, take: 501 });
      if (rows.length > 500)
        throw new BadRequestException('500명 이하가 되도록 이름 또는 조직 조건을 좁히세요.');
      const pii = a.permissions.includes('membership.pii');
      const headers = [
        'memberNumber',
        'name',
        'registeredOn',
        'status',
        ...(pii ? ['phone', 'address'] : []),
      ];
      const csv =
        '\uFEFF' +
        [
          headers,
          ...rows.map((r) => [
            r.memberNumber,
            r.name,
            r.registeredOn.toISOString().slice(0, 10),
            r.status,
            ...(pii ? [r.phone, r.address] : []),
          ]),
        ]
          .map((r) => r.map(csvCell).join(','))
          .join('\r\n');
      await tx.memberExport.update({ where: { id }, data: { consumedAt: new Date(), query: '' } });
      await this.audit.record(a, 'member.export.download', 'export', id, headers, tx);
      return { filename: 'members.csv', csv, count: rows.length };
    });
  }
}
