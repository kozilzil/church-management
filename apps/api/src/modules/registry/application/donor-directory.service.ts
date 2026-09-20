import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../platform/database/prisma.service';
import { AccessService } from '../../identity/application/access.service';
import type { Actor } from '../../identity/domain/actor';
/** Public, minimal finance lookup. Does not expose contact or pastoral information. */
@Injectable()
export class DonorDirectoryService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AccessService) private readonly access: AccessService,
  ) {}
  async search(a: Actor, c: string, search: string) {
    this.access.require(a, c, 'offering.write');
    if (!search.trim()) return { items: [] };
    return {
      items: await this.db.member.findMany({
        where: {
          churchId: c,
          OR: [
            { name: { contains: search.trim(), mode: 'insensitive' } },
            { memberNumber: { contains: search.trim() } },
          ],
        },
        select: { id: true, name: true, memberNumber: true },
        take: 30,
        orderBy: { memberNumber: 'asc' },
      }),
    };
  }
  async get(a: Actor, c: string, id: string) {
    this.access.require(a, c, 'offering.write');
    const row = await this.db.member.findFirst({
      where: { churchId: c, id },
      select: { id: true, name: true },
    });
    if (!row)
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: '교인을 찾을 수 없습니다.',
      });
    return row;
  }
}
