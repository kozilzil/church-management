import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
export async function purgeExpiredCare(db: PrismaClient) {
  let total = 0;
  for (;;) {
    const rows = await db.careNote.findMany({
      where: { expiresAt: { lte: new Date() }, purgedAt: null },
      select: { id: true, churchId: true },
      take: 100,
    });
    if (!rows.length) break;
    await db.$transaction(async (tx) => {
      for (const row of rows) {
        const updated = await tx.careNote.updateMany({
          where: { id: row.id, purgedAt: null, expiresAt: { lte: new Date() } },
          data: { ciphertext: null, purgedAt: new Date() },
        });
        if (updated.count) {
          await tx.auditEvent.create({
            data: {
              churchId: row.churchId,
              actorId: randomUUID(),
              roles: ['SERVER_OPERATOR'],
              action: 'care.note.purge',
              resourceType: 'careNote',
              resourceId: row.id,
              correlationId: randomUUID(),
              fields: [],
            },
          });
          total++;
        }
      }
    });
  }
  return total;
}
