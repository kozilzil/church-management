import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../platform/database/prisma.service';
import type { Actor } from '../identity/domain/actor';

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  async record(
    actor: Actor,
    action: string,
    resourceType: string,
    resourceId: string,
    fields: string[] = [],
    tx: Prisma.TransactionClient = this.db,
    outcome = 'success',
  ) {
    await tx.auditEvent.create({
      data: {
        churchId: actor.churchId,
        actorId: actor.userId,
        roles: actor.roles,
        action,
        resourceType,
        resourceId,
        fields,
        outcome,
        correlationId: actor.correlationId,
      },
    });
  }
}
