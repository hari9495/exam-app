import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule as AdminAppModule } from '../src/app.module';
import { AppModule as RuntimeAppModule } from '../../exam-runtime/src/app.module';
import { InternalAppModule as RuntimeInternalAppModule } from '../../exam-runtime/src/internal-app.module';

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
  // Boot both exam-runtime apps concurrently, not sequentially — two full Nest
  // module compilations back-to-back in one beforeAll pushed setup past Jest's
  // default 5000ms hook timeout under load; running them in parallel keeps
  // wall-clock setup close to whichever app takes longer, not their sum.
  const [app, internalApp] = await Promise.all([
    bootApp(RuntimeAppModule, configure),
    bootApp(RuntimeInternalAppModule, configure),
  ]);
  await Promise.all([app.listen(0), internalApp.listen(0, '127.0.0.1')]);
  const port = (app.getHttpServer().address() as { port: number }).port;
  const internalPort = (internalApp.getHttpServer().address() as { port: number }).port;
  // apps/api's ExamRuntimeInternalClient reads this env var fresh on every call it makes —
  // point it at this test run's actual ephemeral internal-app port, not the static dev-server
  // value from .env, which may not even be running during tests. Internal routes now live on
  // a separate app/port from the public candidate-facing one (see internal-app.module.ts).
  process.env.EXAM_RUNTIME_INTERNAL_URL = `http://127.0.0.1:${internalPort}`;

  // bootRuntimeApp()'s contract stays { app, port } (the public app) so the four existing
  // dual-app e2e specs need no changes — but the internal app also needs cleanup, so wrap
  // close() to tear down both whenever a spec's afterAll calls app.close() as it already does.
  const originalClose = app.close.bind(app);
  (app as unknown as { close: () => Promise<void> }).close = async () => {
    await internalApp.close();
    await originalClose();
  };

  return { app, port };
}
