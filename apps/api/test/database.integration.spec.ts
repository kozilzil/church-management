import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('Database tenant constraints', () => {
  it('rejects cross-church user-role links at the database boundary', async () => {
    const db = new PrismaClient();
    const churchA = randomUUID();
    const churchB = randomUUID();
    try {
      await db.church.createMany({
        data: [
          { id: churchA, name: 'Synthetic A' },
          { id: churchB, name: 'Synthetic B' },
        ],
      });
      const user = await db.user.create({ data: { churchId: churchA, username: 'test' } });
      const role = await db.role.create({ data: { churchId: churchB, name: 'test' } });
      await expect(
        db.userRole.create({ data: { churchId: churchA, userId: user.id, roleId: role.id } }),
      ).rejects.toMatchObject({ code: 'P2003' });
    } finally {
      await db.user.deleteMany({ where: { churchId: churchA } });
      await db.role.deleteMany({ where: { churchId: churchB } });
      await db.church.deleteMany({ where: { id: { in: [churchA, churchB] } } });
      await db.$disconnect();
    }
  });
});
