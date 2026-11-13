/**
 * GEOVENTRA — API bootstrap.
 *
 * Boots the NestJS application, wires the global prefix, CORS, the request-id interceptor and
 * the exception filter. The engine-diagnostics realtime gateway is mounted on the default
 * socket.io namespace so the web client can subscribe to `engine:<vehicleId>` rooms.
 */

// Load the repo-root .env before any other module reads process.env.
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(__dirname, '../../.env') });
loadEnv({ path: resolve(process.cwd(), '.env') });

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/live', 'health/ready'],
  });

  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    credentials: true,
  });

  app.useGlobalInterceptors(new RequestIdInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`Geoventra API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
