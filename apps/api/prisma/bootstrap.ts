import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/modules/identity/infrastructure/password';
const db = new PrismaClient();
export const permissions = [
  'finance.manage',
  'session.read',
  'care.read',
  'care.write',
  'care.notes',
  'care.policy',
  'newcomer.read',
  'newcomer.write',
  'attendance.read',
  'attendance.write',
  'membership.import',
  'membership.export',
  'identity.read',
  'identity.manage',
  'membership.read',
  'membership.write',
  'membership.pii',
  'audit.read',
];
export const statuses = [
  {
    code: 'NEWCOMER',
    label: '새가족',
    allowedNext: ['ACTIVE', 'INACTIVE', 'TRANSFERRED', 'DECEASED'],
  },
  { code: 'ACTIVE', label: '재적', allowedNext: ['INACTIVE', 'TRANSFERRED', 'DECEASED'] },
  { code: 'INACTIVE', label: '장기결석', allowedNext: ['ACTIVE', 'TRANSFERRED', 'DECEASED'] },
  { code: 'TRANSFERRED', label: '이명', allowedNext: ['ACTIVE'] },
  { code: 'DECEASED', label: '별세', allowedNext: [] },
];
async function main() {
  const name = process.env.BOOTSTRAP_CHURCH_NAME;
  const username = process.env.BOOTSTRAP_USERNAME;
  const password = process.env.BOOTSTRAP_PASSWORD;
  if (!name || !username || !/^[a-z0-9._@+-]{1,80}$/.test(username) || !password)
    throw new Error('Set BOOTSTRAP_CHURCH_NAME, BOOTSTRAP_USERNAME and BOOTSTRAP_PASSWORD.');
  const passwordHash = await hashPassword(password);
  const result = await db.$transaction(async (tx) => {
    const church = await tx.church.create({ data: { name } });
    await tx.permission.createMany({
      data: permissions.map((code) => ({ code })),
      skipDuplicates: true,
    });
    const role = await tx.role.create({
      data: {
        churchId: church.id,
        name: 'SYSTEM_ADMIN',
        permissions: { create: permissions.map((permissionCode) => ({ permissionCode })) },
      },
    });
    const user = await tx.user.create({
      data: { churchId: church.id, username, passwordHash, scopeMode: 'ALL' },
    });
    await tx.userRole.create({ data: { churchId: church.id, userId: user.id, roleId: role.id } });
    await tx.memberStatus.createMany({
      data: statuses.map((x) => ({ ...x, churchId: church.id })),
    });
    await tx.organizationType.createMany({
      data: [
        { code: 'DISTRICT', name: '교구' },
        { code: 'GROUP', name: '구역' },
        { code: 'DEPARTMENT', name: '부서' },
        { code: 'SCHOOL', name: '교회학교' },
      ].map((x) => ({ ...x, churchId: church.id })),
    });
    return { churchId: church.id, username };
  });
  console.log(JSON.stringify(result));
}
main()
  .catch(() => {
    console.error('Bootstrap failed; verify inputs and database availability.');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
