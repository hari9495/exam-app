import { Test } from '@nestjs/testing';
import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Throttle, ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import request from 'supertest';

// This exercises the exact @nestjs/throttler + @nest-lab/throttler-storage-redis + APP_GUARD
// stack the real controllers use, in a standalone module decoupled from apps/api's rate-limit-
// tiers.ts (whose limits are intentionally relaxed under NODE_ENV=test -- see that file's
// comment). A short 2-second window keeps this test fast while still proving both the cap and
// the reset.
@Controller('rate-limit-probe')
class RateLimitProbeController {
  @Get()
  @Throttle({ default: { limit: 3, ttl: seconds(2) } })
  ping() {
    return { ok: true };
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: seconds(60), limit: 1000 }],
      storage: new ThrottlerStorageRedisService(process.env.REDIS_URL ?? 'redis://localhost:6379'),
    }),
  ],
  controllers: [RateLimitProbeController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class RateLimitProbeModule {}

describe('Rate limiting: guard mechanism', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [RateLimitProbeModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 429 once the per-route limit is exceeded, then resets after the window', async () => {
    await request(app.getHttpServer()).get('/rate-limit-probe').expect(200);
    await request(app.getHttpServer()).get('/rate-limit-probe').expect(200);
    await request(app.getHttpServer()).get('/rate-limit-probe').expect(200);
    await request(app.getHttpServer()).get('/rate-limit-probe').expect(429);

    await new Promise((resolve) => setTimeout(resolve, 2100));

    await request(app.getHttpServer()).get('/rate-limit-probe').expect(200);
  }, 15000);
});
