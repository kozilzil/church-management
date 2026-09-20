import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await prisma.appMetadata.upsert({
    where: { key: 'schema_version' },
    update: { value: '0.1.0' },
    create: {
      key: 'schema_version',
      value: '0.1.0',
    },
  });
}

main()
  .catch((error: unknown) => {
    console.error('Database seed failed.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
