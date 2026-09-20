import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../src/modules/identity/infrastructure/password';
const db = new PrismaClient();
async function main() {
  const churchId = process.env.RECOVERY_CHURCH_ID,
    username = process.env.RECOVERY_USERNAME,
    password = process.env.RECOVERY_PASSWORD;
  if (!churchId || !username || !password) throw new Error('Recovery input missing.');
  const hash = await hashPassword(password);
  const user = await db.user.findUniqueOrThrow({
    where: { churchId_username: { churchId, username } },
  });
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hash,
        authVersion: { increment: 1 },
        ...(process.env.RECOVERY_RESET_MFA === '1'
          ? { totpEnabled: false, totpSecret: null, totpLastCounter: -1 }
          : {}),
      },
    });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.auditEvent.create({
      data: {
        churchId,
        actorId: randomUUID(),
        roles: ['SERVER_OPERATOR'],
        action: 'account.recover.cli',
        resourceType: 'user',
        resourceId: user.id,
        fields: ['credentials'],
        correlationId: randomUUID(),
      },
    });
  });
  console.log('Account recovered; existing sessions revoked.');
}
main()
  .catch(() => {
    console.error('Recovery failed; verify inputs and database availability.');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
