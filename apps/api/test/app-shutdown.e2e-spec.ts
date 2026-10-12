import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { REDIS_CONNECTION } from '../src/jobs/redis-connection';

// Starting and stopping the API must never leave an unhandled error behind. BullMQ queues and workers
// connect in the background; one still connecting when the app stops used to reject after the shared
// Redis connection closed and emit 'error' on an emitter with no listener left ("Connection is closed").
describe('App shutdown', () => {
  const unhandled: unknown[] = [];
  const record = (e: unknown) => unhandled.push(e);

  beforeAll(() => {
    process.on('uncaughtException', record);
    process.on('unhandledRejection', record);
  });

  afterAll(() => {
    process.off('uncaughtException', record);
    process.off('unhandledRejection', record);
  });

  it('closes queues, workers and Redis in order, with no unhandled errors', async () => {
    for (let i = 0; i < 3; i++) {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      const app = moduleRef.createNestApplication();
      await app.init();
      const redis = app.get<Redis>(REDIS_CONNECTION);
      await app.close(); // at once: queues are typically still connecting
      // The shared connection ends (bounded by the test timeout); late rejections surface right after.
      if (redis.status !== 'end') await new Promise((r) => redis.once('end', r));
      await new Promise((r) => setImmediate(r));
      expect(redis.status).toBe('end');
    }
    expect(unhandled).toEqual([]);
  });
});
