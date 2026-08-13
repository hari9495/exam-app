import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import { configureTrustProxy } from '@exam-platform/shared';
import { AppModule } from './app.module';
import { InternalAppModule } from './internal-app.module';
import { resolveInternalBindHost } from './bootstrap-config';

// Express's default 100kb JSON body limit is too small for a screen-capture violation
// report: a candidate's screenshot rides in the same body as the event (see
// AttemptService.reportProctoringEvent). This limit assumes the capture client (not yet
// built -- a later task) meets the feature's contract: frames downscaled to <=1280px wide,
// JPEG quality 0.5, before upload. Measuring representative captures at that spec (see
// .superpowers/sdd/scc-task-5-report.md) put busy/colorful 1920x1080 content -- already
// above the 1280px contract -- at ~399KB and a worst-case incompressible 1280x800 frame at
// ~510KB, so 1mb leaves roughly 2.5x headroom over in-contract captures while staying a
// deliberately bounded number for a candidate-facing, only-lightly-authenticated endpoint.
const JSON_BODY_LIMIT = '1mb';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureTrustProxy(app);
  app.use(json({ limit: JSON_BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));
  app.use(cookieParser());
  // `Retry-After` is not a CORS-safelisted response header, so without exposing it
  // the candidate app -- which runs on a different origin -- can see the 503 but not
  // the server's own backoff hint, and would fall back to guessing one. See
  // ServerBusyRetryAfterFilter for what sets it.
  app.enableCors({ origin: process.env.WEB_ORIGIN, credentials: true, exposedHeaders: ['Retry-After'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  app.setGlobalPrefix('api/v1');
  // No flush-on-shutdown here, deliberately. This service (unlike apps/api) never calls
  // enableShutdownHooks() -- OS default signal termination is the only thing that stops it on
  // pm2 stop/restart/reload, and this is the candidate-facing live-exam service, so that must
  // keep working. The only two ways to add a flush are: a bare process.on('SIGTERM'/'SIGINT')
  // listener, which removes Node's default termination action for that signal and would hang
  // shutdown until pm2's SIGKILL grace period; or enabling Nest shutdown hooks, which would
  // start running onModuleDestroy/onApplicationShutdown across every module here -- including
  // BullMQ and Redis clients -- a real change to this service's teardown behaviour that a
  // monitoring task should not introduce as a side effect. The cost of omitting the flush is
  // small: Sentry's transport sends events as they occur rather than batching, so the
  // unflushed window on exit is milliseconds, not the buffered backlog a batching client would
  // lose.
  await app.listen(process.env.EXAM_RUNTIME_PORT ?? 3002);

  const internalApp = await NestFactory.create(InternalAppModule);
  internalApp.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  internalApp.setGlobalPrefix('api/v1');
  await internalApp.listen(process.env.EXAM_RUNTIME_INTERNAL_PORT ?? 3003, resolveInternalBindHost());
}
bootstrap();
