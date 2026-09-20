import { PrismaClient } from '@prisma/client';
import { purgeExpiredCare } from '../src/modules/operations/application/purge-care';
const db = new PrismaClient();
purgeExpiredCare(db)
  .then((count) => console.log(JSON.stringify({ purged: count })))
  .catch(() => {
    console.error('Care note purge failed.');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
