import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { AppModule } from '../app.module';
import { ApiExceptionFilter } from './http/api-exception.filter';

export async function createApplication() {
  if (
    process.env.NODE_ENV === 'production' &&
    !/^[a-f0-9]{64}$/i.test(process.env.MFA_ENCRYPTION_KEY ?? '')
  )
    throw new Error('A valid MFA_ENCRYPTION_KEY is required in production.');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  app.useBodyParser('json', { limit: '1mb' });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.use(
    (
      _req: unknown,
      res: { setHeader: (name: string, value: string) => void },
      next: () => void,
    ) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim()),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  const openApiConfig = new DocumentBuilder()
    .setTitle('Church Management API')
    .setDescription('교적·재정 관리 프로그램 API')
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, openApiConfig);
  if (process.env.NODE_ENV !== 'production')
    SwaggerModule.setup('api/docs', app, document, {
      jsonDocumentUrl: 'api/docs-json',
    });

  return app;
}
