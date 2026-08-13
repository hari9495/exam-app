import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { configureTrustProxy, SentryReporter } from '@exam-platform/shared';
import { AppModule } from './app.module';
import { InternalAppModule } from './internal-app.module';
import { resolveInternalBindHost } from './bootstrap-config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureTrustProxy(app);
  app.use(cookieParser());
  app.enableCors({ origin: process.env.WEB_ORIGIN, credentials: true, exposedHeaders: ['Content-Disposition'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  // pm2 stops this process with SIGTERM/SIGINT, not by letting the event loop drain --
  // 'beforeExit' never fires on a signal-driven exit, so it would silently never flush in
  // production. Fire-and-forget and un-awaited on purpose: a stuck or unreachable Sentry
  // endpoint must not add latency to -- or block -- the shutdown Nest is already doing.
  const reporter = app.get(SentryReporter);
  const flushOnSignal = () => void reporter.flush(2000);
  process.on('SIGTERM', flushOnSignal);
  process.on('SIGINT', flushOnSignal);
  await app.listen(process.env.API_PORT ?? 3001);

  const internalApp = await NestFactory.create(InternalAppModule);
  internalApp.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  internalApp.setGlobalPrefix('api/v1');
  await internalApp.listen(process.env.API_INTERNAL_PORT ?? 3505, resolveInternalBindHost());
}
bootstrap();
