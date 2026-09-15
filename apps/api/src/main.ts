import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { json, urlencoded, raw } from 'express';
import { configureTrustProxy } from '@exam-platform/shared';
import { AppModule } from './app.module';
import { InternalAppModule } from './internal-app.module';
import { resolveInternalBindHost } from './bootstrap-config';

// Express's default 100kb JSON body limit rejects the public job-application endpoint's
// résumé upload before it reaches the handler -- POST /public/jobs/:applyToken/apply carries
// the résumé as base64 in the JSON body. 7mb covers a 5MB PDF base64-encoded (~6.7MB) plus
// JSON overhead.
const JSON_BODY_LIMIT = '7mb';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureTrustProxy(app);
  // The Stripe webhook must verify an HMAC over the EXACT raw request bytes, so it needs the raw
  // Buffer, not parsed JSON. Mount express.raw on just that path BEFORE the global json() below
  // (json() skips a body express.raw already consumed). Path includes the global 'api/v1' prefix.
  app.use('/api/v1/billing/stripe/webhook', raw({ type: 'application/json' }));
  app.use(json({ limit: JSON_BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));
  app.use(cookieParser());
  app.enableCors({ origin: process.env.WEB_ORIGIN, credentials: true, exposedHeaders: ['Content-Disposition'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  await app.listen(process.env.API_PORT ?? 3001);

  const internalApp = await NestFactory.create(InternalAppModule);
  internalApp.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  internalApp.setGlobalPrefix('api/v1');
  await internalApp.listen(process.env.API_INTERNAL_PORT ?? 3505, resolveInternalBindHost());
}
bootstrap();
