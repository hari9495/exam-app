import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule as AdminAppModule } from '../src/app.module';
import { AppModule as RuntimeAppModule } from '../../exam-runtime/src/app.module';

export type Configure = (builder: TestingModuleBuilder) => TestingModuleBuilder;

async function bootApp(appModuleClass: unknown, configure?: Configure): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [appModuleClass as never] });
  if (configure) {
    builder = configure(builder);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  await app.init();
  return app;
}

export function bootAdminApp(configure?: Configure): Promise<INestApplication> {
  return bootApp(AdminAppModule, configure);
}

export async function bootRuntimeApp(configure?: Configure): Promise<{ app: INestApplication; port: number }> {
  const app = await bootApp(RuntimeAppModule, configure);
  await app.listen(0);
  const port = (app.getHttpServer().address() as { port: number }).port;
  // apps/api's ExamRuntimeInternalClient reads this env var fresh on every call it makes —
  // point it at this test run's actual ephemeral port, not the static dev-server value
  // from .env (http://localhost:3002), which may not even be running during tests.
  process.env.EXAM_RUNTIME_INTERNAL_URL = `http://localhost:${port}`;
  return { app, port };
}
