import { createApplication } from '../src/platform/app.factory';

// Run through tsx, as pnpm dev does, rather than Vitest's decorator transform.
async function main() {
  const app = await createApplication();
  try {
    await app.init();
  } finally {
    await app.close();
  }
  console.log('Runtime bootstrap and OpenAPI generation passed.');
}
main().catch(() => {
  console.error('Runtime bootstrap failed.');
  process.exitCode = 1;
});
