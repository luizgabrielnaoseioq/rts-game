import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: env.LOG_LEVEL === 'debug' || env.LOG_LEVEL === 'verbose' ? ['error', 'warn', 'log', 'debug', 'verbose'] : ['error', 'warn', 'log'],
  });
  // IP real atrás do proxy da Railway (rate limit).
  app.set('trust proxy', 1);
  app.use(helmet());
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  await app.listen(env.PORT);
  Logger.log(`API em http://localhost:${env.PORT}/api (CORS: ${env.CORS_ORIGINS.join(', ')})`, 'Bootstrap');
}

void bootstrap();
