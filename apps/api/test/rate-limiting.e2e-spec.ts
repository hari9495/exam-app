import { Test } from '@nestjs/testing';
import { Controller, Get, HttpCode, INestApplication, Injectable, Module, Post, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import { APP_GUARD } from '@nestjs/core';
import { Throttle, ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import request from 'supertest';
import { FailOpenThrottlerGuard, SkipGlobalThrottle } from '../src/fail-open-throttler.guard';
import { RefreshThrottlerGuard } from '../src/auth/refresh-throttler.guard';

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
      // Unlike the real app modules, no fast-fail options here: this probe uses the plain
      // ThrottlerGuard (no fail-open), so with enableOfflineQueue: false a request landing in
      // the brief window before ioredis reaches 'ready' would 500. The default offline queue
      // absorbs that startup window; outage fail-open behavior is the guard spec's concern.
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

// Reproduces the real dual-guard shape apps/api's public-api controllers use: a
// route-level, org-keyed ThrottlerGuard applied via @UseGuards(), plus the app-wide
// FailOpenThrottlerGuard registered as APP_GUARD. The global tier's limit here (2) is
// deliberately lower than the route tier's (5) -- if @SkipGlobalThrottle() failed to
// exempt the route from the global guard, request #3 would 429 from the global tier
// well before the route tier's own limit is reached. Both guards target the same
// 'default' throttler name, which is exactly the collision @SkipThrottle() can't avoid
// (see the doc comment on SkipGlobalThrottle) but shouldSkip()-based exemption can.
@Injectable()
class OrgKeyedThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(): Promise<string> {
    return 'fixed-org-tracker';
  }
}

@Controller('rate-limit-probe-org')
@UseGuards(OrgKeyedThrottlerGuard)
@Throttle({ default: { limit: 5, ttl: seconds(2) } })
@SkipGlobalThrottle()
class OrgScopedProbeController {
  @Get()
  ping() {
    return { ok: true };
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: seconds(2), limit: 2 }],
      storage: new ThrottlerStorageRedisService(process.env.REDIS_URL ?? 'redis://localhost:6379'),
    }),
  ],
  controllers: [OrgScopedProbeController],
  providers: [{ provide: APP_GUARD, useClass: FailOpenThrottlerGuard }, OrgKeyedThrottlerGuard],
})
class OrgScopedProbeModule {}

describe('Rate limiting: @SkipGlobalThrottle exempts a route from the global guard only', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [OrgScopedProbeModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('applies the higher route-level limit, proving the lower global limit never fires', async () => {
    // If the global tier (limit 2) were still active on this route, this would 429
    // starting at the 3rd request. Getting all 5 through proves it's fully skipped,
    // while the 6th request 429ing proves the route-level guard is still enforcing.
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).get('/rate-limit-probe-org').expect(200);
    }
    await request(app.getHttpServer()).get('/rate-limit-probe-org').expect(429);
  }, 15000);
});

// The /auth/refresh shape: RefreshThrottlerGuard on the route, @SkipGlobalThrottle() against the
// app-wide IP tier (limit 2 here, so it would fire first if it still applied). Every request comes
// from the same loopback IP: two signed-in people each get their own budget (keyed on the session
// in their refresh token, the same across rotation), and one session over its budget gets 429.
@Controller('refresh-probe')
class RefreshProbeController {
  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 4, ttl: seconds(5) } })
  @SkipGlobalThrottle()
  @UseGuards(RefreshThrottlerGuard)
  refresh() {
    return { ok: true };
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: seconds(5), limit: 2 }],
      storage: new ThrottlerStorageRedisService(process.env.REDIS_URL ?? 'redis://localhost:6379'),
    }),
  ],
  controllers: [RefreshProbeController],
  providers: [{ provide: APP_GUARD, useClass: FailOpenThrottlerGuard }, RefreshThrottlerGuard],
})
class RefreshProbeModule {}

describe('Rate limiting: /auth/refresh is per session, not per IP', () => {
  let app: INestApplication;
  const run = Date.now().toString(36); // fresh sessions per run: the Redis store outlives the test
  const token = (familyId: string) => new JwtService().sign({ sub: 'u', familyId, jti: Math.random().toString(36) }, { secret: process.env.JWT_REFRESH_SECRET, expiresIn: '1h' });
  const refresh = (cookie?: string) => {
    const req = request(app.getHttpServer()).post('/refresh-probe');
    return cookie ? req.set('Cookie', `refresh_token=${cookie}`) : req;
  };

  beforeAll(async () => {
    process.env.JWT_REFRESH_SECRET ??= 'rate-limit-probe-refresh-secret';
    const moduleRef = await Test.createTestingModule({ imports: [RefreshProbeModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('two users on one IP each get their own budget; one session over it gets 429', async () => {
    for (let i = 0; i < 4; i++) {
      await refresh(token(`a-${run}`)).expect(200); // a new (rotated) token every time, same session
      await refresh(token(`b-${run}`)).expect(200);
    }
    await refresh(token(`a-${run}`)).expect(429);
    await refresh(token(`b-${run}`)).expect(429);
    // A forged token cannot mint a new budget: it shares the IP's.
    const forged = new JwtService().sign({ sub: 'u', familyId: `c-${run}` }, { secret: 'not-the-secret' });
    for (let i = 0; i < 4; i++) await refresh(forged).expect(200);
    await refresh(`garbage-${run}`).expect(429);
  }, 20000);
});
