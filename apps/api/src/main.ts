import { createApplication } from './platform/app.factory';

async function bootstrap(): Promise<void> {
  const app = await createApplication();
  const port = Number.parseInt(process.env.API_PORT ?? '3000', 10);

  await app.listen(port, '0.0.0.0');
}

void bootstrap();
