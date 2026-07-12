# Phase 6b: Rate Limiting Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add IP-based rate limiting to `apps/api` and `apps/exam-runtime`, with a global default tier and stricter per-route tiers on auth, AI-generation, attempt-flow, and upload endpoints, backed by Redis so limits are enforced consistently across instances.

**Architecture:** `@nestjs/throttler`'s global `ThrottlerGuard` (registered via `APP_GUARD`) in each app's root `AppModule`, backed by `@nest-lab/throttler-storage-redis`'s `ThrottlerStorageRedisService` wrapping a dedicated `ioredis` connection to the existing `REDIS_URL`. Routes needing a non-default limit get an explicit `@Throttle(...)` decorator. A small `rate-limit-tiers.ts` file per app centralizes the tier values and relaxes them automatically when `NODE_ENV === 'test'`, so this change doesn't destabilize the ~14 existing e2e spec files that already call shared auth endpoints as setup boilerplate against a shared Redis-backed store and shared loopback IP.

**Tech Stack:** `@nestjs/throttler@^6.5.0`, `@nest-lab/throttler-storage-redis@^1.2.0`, `ioredis` (new dependency for `apps/exam-runtime`; `apps/api` already has it pinned at `5.10.1`).

## Global Constraints

- Limit tiers (from the approved spec, Section 2):
  | Tier | Endpoints | Limit |
  |---|---|---|
  | Strict (auth) | staff login, candidate redeem, both apps' `refresh` | 5 req / 60s per IP |
  | Moderate (attempt actions) | `attempt/start`, `answer`, `submit`, `proctoring-event` | 30 req / 60s per IP |
  | Strict (AI generation) | `questions/ai-generate` | 10 req / 60s per IP |
  | Moderate (upload) | `organizations/branding/logo` | 10 req / 60s per IP |
  | Default (everything else) | all other routes in both apps | 100 req / 60s per IP |
- `staff/logout`, `candidate-auth/logout`, and `attempt/current` are **not** in any tier table row — they get the default tier only. (`logout` intentionally excluded: it isn't listed under the auth row's endpoints, which names only login/redeem/refresh.)
- Keying is IP-based via `@nestjs/throttler`'s built-in tracker — no custom `getTracker()`.
- On limit exceeded, the library's own `ThrottlerException` fires (standard `429`) — no custom exception filter.
- `apps/exam-runtime`'s `InternalAppModule` (127.0.0.1-only, internal traffic) is explicitly excluded from throttling — do not touch `apps/exam-runtime/src/internal-app.module.ts`.
- Same `REDIS_URL` env var pattern as `apps/api/src/jobs/redis-connection.ts`: `process.env.REDIS_URL ?? 'redis://localhost:6379'`.
- Both apps' Redis connections for the throttler are separate `ioredis` clients from any existing BullMQ connection — do not share/reuse `apps/api/src/jobs/redis-connection.ts`'s client.

---

### Task 1: Install throttler stack, wire global default-tier guard in both apps

**Files:**
- Modify: `apps/api/package.json`, `apps/exam-runtime/package.json`
- Create: `apps/api/src/rate-limit-tiers.ts`, `apps/exam-runtime/src/rate-limit-tiers.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/exam-runtime/src/app.module.ts`

**Interfaces:**
- Consumes: nothing from an earlier task (this is the first task).
- Produces: `apps/api/src/rate-limit-tiers.ts` exports `DEFAULT_THROTTLE_LIMIT: number`, `STRICT_AUTH_THROTTLE: { default: { limit: number; ttl: number } }`, `STRICT_AI_GENERATE_THROTTLE: { default: { limit: number; ttl: number } }`, `MODERATE_UPLOAD_THROTTLE: { default: { limit: number; ttl: number } }`. `apps/exam-runtime/src/rate-limit-tiers.ts` exports `DEFAULT_THROTTLE_LIMIT: number`, `STRICT_AUTH_THROTTLE: { default: { limit: number; ttl: number } }`, `MODERATE_ATTEMPT_THROTTLE: { default: { limit: number; ttl: number } }`. Task 2 imports these by name into the 5 target controllers.

- [ ] **Step 1: Install packages in both apps**

Run:
```bash
npm install --workspace=apps/api @nestjs/throttler@^6.5.0 @nest-lab/throttler-storage-redis@^1.2.0
npm install --workspace=apps/exam-runtime @nestjs/throttler@^6.5.0 @nest-lab/throttler-storage-redis@^1.2.0 ioredis@5.10.1
```
Expected: both commands exit 0. `apps/api/package.json` and `apps/exam-runtime/package.json` gain `@nestjs/throttler` and `@nest-lab/throttler-storage-redis` under `dependencies`; `apps/exam-runtime/package.json` additionally gains `ioredis` under `dependencies` (pinned to `5.10.1`, matching `apps/api`'s existing pin — not a caret range). `package-lock.json` is regenerated.

- [ ] **Step 2: Create `apps/api/src/rate-limit-tiers.ts`**

```ts
import { seconds } from '@nestjs/throttler';

// Jest sets NODE_ENV=test automatically (no explicit setting exists anywhere in this repo).
// Every e2e spec file in this suite shares one Redis-backed throttler store and calls through
// the same loopback IP -- roughly a dozen existing spec files each call /auth/staff/login as
// setup boilerplate, and Jest's default (non---runInBand) mode runs spec files in parallel
// worker processes, so production-realistic limits would make unrelated e2e suites collide on
// the shared auth tier. Limits are relaxed here under test so those suites run unaffected; the
// real limits are proven by the guard-mechanism e2e test (Task 2) and the live manual check
// (Task 3) instead.
const isTest = process.env.NODE_ENV === 'test';

export const DEFAULT_THROTTLE_LIMIT = isTest ? 10_000 : 100;

export const STRICT_AUTH_THROTTLE = { default: { limit: isTest ? 10_000 : 5, ttl: seconds(60) } };
export const STRICT_AI_GENERATE_THROTTLE = { default: { limit: isTest ? 10_000 : 10, ttl: seconds(60) } };
export const MODERATE_UPLOAD_THROTTLE = { default: { limit: isTest ? 10_000 : 10, ttl: seconds(60) } };
```

- [ ] **Step 3: Create `apps/exam-runtime/src/rate-limit-tiers.ts`**

```ts
import { seconds } from '@nestjs/throttler';

// See apps/api/src/rate-limit-tiers.ts for the full rationale: Jest sets NODE_ENV=test
// automatically, and this app's e2e coverage (exercised via apps/api's dual-app.ts harness)
// shares the same Redis-backed throttler store and loopback IP across spec files.
const isTest = process.env.NODE_ENV === 'test';

export const DEFAULT_THROTTLE_LIMIT = isTest ? 10_000 : 100;

export const STRICT_AUTH_THROTTLE = { default: { limit: isTest ? 10_000 : 5, ttl: seconds(60) } };
export const MODERATE_ATTEMPT_THROTTLE = { default: { limit: isTest ? 10_000 : 30, ttl: seconds(60) } };
```

- [ ] **Step 4: Wire `ThrottlerModule` + global guard into `apps/api/src/app.module.ts`**

Replace the full file with:

```ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard, seconds } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { PrismaModule, AuditModule } from '@exam-platform/shared';
import { RbacModule } from './rbac/rbac.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { StaticUploadsModule } from './organizations/static-uploads.module';
import { UsersModule } from './users/users.module';
import { QuestionsModule } from './questions/questions.module';
import { ExamsModule } from './exams/exams.module';
import { CandidatesModule } from './candidates/candidates.module';
import { InvitationsModule } from './invitations/invitations.module';
import { AttemptsAdminModule } from './attempts-admin/attempts-admin.module';
import { ReportsModule } from './reports/reports.module';
import { JobsModule } from './jobs/jobs.module';
import { DEFAULT_THROTTLE_LIMIT } from './rate-limit-tiers';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [{ name: 'default', ttl: seconds(60), limit: DEFAULT_THROTTLE_LIMIT }],
        storage: new ThrottlerStorageRedisService(new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379')),
      }),
    }),
    StaticUploadsModule,
    PrismaModule,
    RbacModule,
    AuditModule,
    AuthModule,
    OrganizationsModule,
    UsersModule,
    QuestionsModule,
    ExamsModule,
    CandidatesModule,
    InvitationsModule,
    AttemptsAdminModule,
    ReportsModule,
    JobsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
```

- [ ] **Step 5: Wire `ThrottlerModule` + global guard into `apps/exam-runtime/src/app.module.ts`**

Replace the full file with:

```ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard, seconds } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { PrismaModule } from '@exam-platform/shared';
import { CandidateAuthModule } from './candidate-auth/candidate-auth.module';
import { AttemptModule } from './attempts/attempt.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { ProctoringAnalysisModule } from './proctoring-analysis/proctoring-analysis.module';
import { GradingModule } from './grading/grading.module';
import { LocalMonitoringBridgeModule } from './monitoring/local-monitoring-bridge.module';
import { DEFAULT_THROTTLE_LIMIT } from './rate-limit-tiers';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [{ name: 'default', ttl: seconds(60), limit: DEFAULT_THROTTLE_LIMIT }],
        storage: new ThrottlerStorageRedisService(new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379')),
      }),
    }),
    PrismaModule,
    CandidateAuthModule,
    AttemptModule,
    MonitoringModule,
    ProctoringAnalysisModule,
    GradingModule,
    LocalMonitoringBridgeModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
```

Note: `apps/exam-runtime/src/internal-app.module.ts` is a separate module (does not import `AppModule`) and is intentionally left unchanged — it gets no throttler guard.

- [ ] **Step 6: Verify both apps still build**

Run:
```bash
npm run build --workspace=apps/api
npm run build --workspace=apps/exam-runtime
```
Expected: both exit 0, no TypeScript errors.

- [ ] **Step 7: Run full unit suites for both apps — confirm no regression**

Run: `npm run test:api`
Expected: PASS, same suite/test count as the current baseline (196/196 per Phase 6e's final state).

Run: `npm run test:exam-runtime`
Expected: PASS, same suite/test count as the current baseline (165/165 per the live-monitoring fix's final state).

- [ ] **Step 8: Run full e2e suite for `apps/api` — confirm no regression from the global guard**

Run: `npm run test:api:e2e -- --runInBand`
Expected: PASS at the current baseline (71/71 per the live-monitoring fix's final state). This is the real proof that `isTest`-relaxed limits in `rate-limit-tiers.ts` keep the ~14 existing e2e spec files (which repeatedly call `/auth/staff/login` / `/candidate-auth/redeem` as setup) unaffected by the new global default-tier guard. If any test fails with a `429` status here, the relaxation in Step 2/3 did not take effect — check that `NODE_ENV` is actually `'test'` in the failing run (`console.log(process.env.NODE_ENV)` temporarily in `rate-limit-tiers.ts` if needed) before changing the tier values themselves.

- [ ] **Step 9: Commit**

```bash
git add apps/api/package.json apps/exam-runtime/package.json package-lock.json apps/api/src/rate-limit-tiers.ts apps/exam-runtime/src/rate-limit-tiers.ts apps/api/src/app.module.ts apps/exam-runtime/src/app.module.ts
git commit -m "feat: add Redis-backed global rate limiting to apps/api and apps/exam-runtime

Registers @nestjs/throttler's ThrottlerGuard as a global APP_GUARD in both
apps, backed by @nest-lab/throttler-storage-redis so limits are enforced
consistently across instances via the existing REDIS_URL. Default tier is
100 req/60s per IP; per-route stricter tiers land in the next task. Tier
values are relaxed under NODE_ENV=test (Jest's default) since the ~14
existing e2e spec files share one Redis-backed store and one loopback IP."
```

---

### Task 2: Apply per-route tiers, prove the throttling mechanism with a dedicated e2e test

**Files:**
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/exam-runtime/src/candidate-auth/candidate-auth.controller.ts`
- Modify: `apps/exam-runtime/src/attempts/attempt.controller.ts`
- Modify: `apps/api/src/questions/questions.controller.ts`
- Modify: `apps/api/src/organizations/organizations.controller.ts`
- Test (new): `apps/api/test/rate-limiting.e2e-spec.ts`

**Interfaces:**
- Consumes: `STRICT_AUTH_THROTTLE`, `STRICT_AI_GENERATE_THROTTLE`, `MODERATE_UPLOAD_THROTTLE` from `apps/api/src/rate-limit-tiers.ts` (Task 1); `STRICT_AUTH_THROTTLE`, `MODERATE_ATTEMPT_THROTTLE` from `apps/exam-runtime/src/rate-limit-tiers.ts` (Task 1).
- Produces: nothing consumed by Task 3 beyond "the app still builds and passes its suites."

**Design note on the new e2e test:** `rate-limit-tiers.ts` (Task 1) relaxes every tier to a permissive limit whenever `NODE_ENV === 'test'` — which Jest always sets — specifically so the ~14 pre-existing e2e spec files don't collide on the shared Redis-backed store. That means an e2e test that logs in 6 times against the real `/auth/staff/login` route would **not** observe a real `429` in this test environment (it would need 10,001 requests to trip the relaxed test-mode limit). To prove the actual guard + Redis storage + `@Throttle()` mechanism enforces a real low limit and genuinely resets after its window, this task adds a small, fully self-contained e2e spec that builds its own minimal Nest module (its own throttled controller, its own `ThrottlerModule.forRoot(...)`, its own `APP_GUARD`) — the exact same library stack the real controllers use, decoupled from the `isTest` relaxation and from any database/auth setup. This is a deliberate, narrower test of the cross-cutting mechanism, not of `AuthController` itself; the real configured endpoints get their end-to-end proof in Task 3's live manual check, run outside the test environment where `NODE_ENV !== 'test'` and the real 5/60s limit is active.

- [ ] **Step 1: Write the new e2e spec proving the guard mechanism**

Create `apps/api/test/rate-limiting.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Throttle, ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
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
      storage: new ThrottlerStorageRedisService(new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379')),
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
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `npm run test:api:e2e -- --testPathPattern=rate-limiting`
Expected: FAIL — `RateLimitProbeModule`'s import of `ThrottlerModule`/`Throttle`/`ThrottlerGuard` from `@nestjs/throttler` and `ThrottlerStorageRedisService` from `@nest-lab/throttler-storage-redis` resolves fine (Task 1 already installed both packages), so this should actually already PASS at this point since nothing in this step depends on the not-yet-applied controller decorators. Run it anyway to confirm the guard mechanism itself works correctly in isolation before moving on — this step exists to catch a broken Redis connection or a bad limit/ttl argument, not to prove a "red" state.

- [ ] **Step 3: Apply `@Throttle(STRICT_AUTH_THROTTLE)` to `apps/api/src/auth/auth.controller.ts`**

Replace the full file with:

```ts
import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';

const REFRESH_COOKIE = 'refresh_token';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('staff/login')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.login(dto);
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, { httpOnly: true, sameSite: 'lax', secure: false });
    return { accessToken: tokens.accessToken };
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  async refresh(@Body() dto: RefreshDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.refresh(dto.refreshToken);
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, { httpOnly: true, sameSite: 'lax', secure: false });
    return { accessToken: tokens.accessToken };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Body() dto: RefreshDto, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(dto.refreshToken);
    res.clearCookie(REFRESH_COOKIE);
    return { success: true };
  }
}
```

Note: `logout` intentionally keeps the default tier — it is not listed under the spec's "Strict (auth)" row.

- [ ] **Step 4: Apply `@Throttle(STRICT_AUTH_THROTTLE)` to `apps/exam-runtime/src/candidate-auth/candidate-auth.controller.ts`**

Replace the full file with:

```ts
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CandidateAuthService } from './candidate-auth.service';
import { RedeemInvitationDto } from './dto/redeem-invitation.dto';
import { RefreshDto } from './dto/refresh.dto';
import { STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';

@Controller('candidate-auth')
export class CandidateAuthController {
  constructor(private readonly candidateAuthService: CandidateAuthService) {}

  @Post('redeem')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  async redeem(@Body() dto: RedeemInvitationDto) {
    const tokens = await this.candidateAuthService.redeem(dto.token);
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  async refresh(@Body() dto: RefreshDto) {
    const tokens = await this.candidateAuthService.refresh(dto.refreshToken);
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Body() dto: RefreshDto) {
    await this.candidateAuthService.logout(dto.refreshToken);
    return { success: true };
  }
}
```

- [ ] **Step 5: Apply `@Throttle(MODERATE_ATTEMPT_THROTTLE)` to `apps/exam-runtime/src/attempts/attempt.controller.ts`**

Replace the full file with:

```ts
import { Body, Controller, Get, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CandidateJwtAuthGuard } from '../candidate-auth/candidate-jwt-auth.guard';
import { CurrentCandidate, CandidateSession } from '../candidate-auth/current-candidate.decorator';
import { LastSeenInterceptor } from './last-seen.interceptor';
import { AttemptService } from './attempt.service';
import { AnswerDto } from './dto/answer.dto';
import { StartAttemptDto } from './dto/start-attempt.dto';
import { ReportProctoringEventDto } from './dto/report-proctoring-event.dto';
import { MODERATE_ATTEMPT_THROTTLE } from '../rate-limit-tiers';

@Controller('attempt')
@UseGuards(CandidateJwtAuthGuard)
@UseInterceptors(LastSeenInterceptor)
export class AttemptController {
  constructor(private readonly attemptService: AttemptService) {}

  @Get('current')
  getCurrent(@CurrentCandidate() candidate: CandidateSession) {
    return this.attemptService.getCurrent(candidate);
  }

  @Post('start')
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  start(@CurrentCandidate() candidate: CandidateSession, @Body() dto: StartAttemptDto) {
    return this.attemptService.start(candidate, dto);
  }

  @Post('answer')
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  answer(@CurrentCandidate() candidate: CandidateSession, @Body() dto: AnswerDto) {
    return this.attemptService.answer(candidate, dto);
  }

  @Post('submit')
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  submit(@CurrentCandidate() candidate: CandidateSession) {
    return this.attemptService.submit(candidate);
  }

  @Post('proctoring-event')
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  reportProctoringEvent(@CurrentCandidate() candidate: CandidateSession, @Body() dto: ReportProctoringEventDto) {
    return this.attemptService.reportProctoringEvent(candidate, dto);
  }
}
```

Note: `getCurrent` (`GET /attempt/current`) intentionally keeps the default tier — it is not listed under the spec's "Moderate (attempt actions)" row.

- [ ] **Step 6: Apply `@Throttle(STRICT_AI_GENERATE_THROTTLE)` to `apps/api/src/questions/questions.controller.ts`**

Replace the full file with:

```ts
import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { QuestionsService } from './questions.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { AiGenerateQuestionsDto } from './dto/ai-generate-questions.dto';
import { STRICT_AI_GENERATE_THROTTLE } from '../rate-limit-tiers';

@Controller('questions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Post()
  @RequirePermissions('question_bank:manage')
  create(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: CreateQuestionDto) {
    return this.questionsService.create(tenant, userId, dto);
  }

  @Post('ai-generate')
  @RequirePermissions('question_bank:manage')
  @Throttle(STRICT_AI_GENERATE_THROTTLE)
  aiGenerate(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: AiGenerateQuestionsDto) {
    return this.questionsService.aiGenerate(tenant, userId, dto);
  }

  @Get()
  @RequirePermissions('question_bank:manage')
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query('topic') topic?: string,
    @Query('difficulty') difficulty?: string,
    @Query('status') status?: string,
    @Query('tagId') tagId?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.questionsService.list(tenant, { topic, difficulty, status, tagId, limit: limit ? parseInt(limit, 10) : undefined, cursor });
  }

  @Get(':id')
  @RequirePermissions('question_bank:manage')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.questionsService.findOne(tenant, id);
  }

  @Patch(':id')
  @RequirePermissions('question_bank:manage')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateQuestionDto) {
    return this.questionsService.update(tenant, id, dto);
  }

  @Post(':id/archive')
  @RequirePermissions('question_bank:manage')
  archive(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.questionsService.archive(tenant, id);
  }

  @Post(':id/publish')
  @RequirePermissions('question_bank:manage')
  publish(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.questionsService.publish(tenant, id);
  }
}
```

- [ ] **Step 7: Apply `@Throttle(MODERATE_UPLOAD_THROTTLE)` to `apps/api/src/organizations/organizations.controller.ts`**

Replace the full file with:

```ts
import { Body, Controller, Get, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateBrandingColorsDto } from './dto/update-branding-colors.dto';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';

@Controller('organizations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @RequirePermissions('platform:manage_organizations')
  create(@Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create(dto);
  }

  @Get('branding')
  @RequirePermissions('org:manage_settings')
  getBranding(@CurrentTenant() tenant: TenantContext) {
    return this.organizationsService.getBranding(tenant);
  }

  @Get('usage')
  @RequirePermissions('org:manage_settings')
  getUsage(@CurrentTenant() tenant: TenantContext) {
    return this.organizationsService.getUsage(tenant);
  }

  @Patch('branding')
  @RequirePermissions('org:manage_settings')
  updateBrandingColors(@CurrentTenant() tenant: TenantContext, @Body() dto: UpdateBrandingColorsDto) {
    return this.organizationsService.updateBrandingColors(tenant, dto);
  }

  @Post('branding/logo')
  @RequirePermissions('org:manage_settings')
  @UseInterceptors(FileInterceptor('file'))
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  uploadLogo(@CurrentTenant() tenant: TenantContext, @UploadedFile() file: Express.Multer.File) {
    return this.organizationsService.uploadLogo(tenant, file);
  }
}
```

- [ ] **Step 8: Run the new test to verify it passes**

Run: `npm run test:api:e2e -- --testPathPattern=rate-limiting`
Expected: PASS — the probe route returns `200` for the first 3 requests, `429` for the 4th, then `200` again after the 2-second window elapses.

- [ ] **Step 9: Run full unit suites for both apps**

Run: `npm run test:api`
Expected: PASS, 196/196 (decorator-only change, no new unit test surface).

Run: `npm run test:exam-runtime`
Expected: PASS, 165/165.

- [ ] **Step 10: Run full `apps/api` e2e suite (now includes the new spec)**

Run: `npm run test:api:e2e -- --runInBand`
Expected: PASS, 72/72 (71 baseline + 1 new `rate-limiting.e2e-spec.ts`). If any pre-existing spec now fails with `429`, one of the 5 modified controllers is not correctly reading the `isTest`-relaxed value from `rate-limit-tiers.ts` — re-check the import path and that `STRICT_AUTH_THROTTLE`/etc. are read at call time, not hardcoded.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/auth/auth.controller.ts apps/exam-runtime/src/candidate-auth/candidate-auth.controller.ts apps/exam-runtime/src/attempts/attempt.controller.ts apps/api/src/questions/questions.controller.ts apps/api/src/organizations/organizations.controller.ts apps/api/test/rate-limiting.e2e-spec.ts
git commit -m "feat: apply per-route rate-limit tiers to auth, attempt, AI-generate, and upload endpoints

Strict 5/60s on staff login, candidate redeem, and both apps' refresh;
moderate 30/60s on attempt start/answer/submit/proctoring-event; strict
10/60s on AI question generation; moderate 10/60s on branding logo upload.
Everything else keeps the global 100/60s default from the previous task.
Adds a standalone e2e test proving the underlying guard + Redis storage +
@Throttle() mechanism enforces a real limit and resets after its window --
the real per-route limits are relaxed in the test environment (see
rate-limit-tiers.ts) and get their end-to-end proof in the next task's
live manual check instead."
```

---

### Task 3: Final verification

**Files:** none modified — verification only.

**Interfaces:**
- Consumes: the fully wired throttling stack from Tasks 1-2.
- Produces: nothing (terminal task).

- [ ] **Step 1: Full clean install and build, both apps**

Run:
```bash
npm ci
npm run build --workspace=apps/api
npm run build --workspace=apps/exam-runtime
```
Expected: all exit 0.

- [ ] **Step 2: Full unit suites**

Run: `npm run test:api`
Expected: PASS, 196/196.

Run: `npm run test:exam-runtime`
Expected: PASS, 165/165.

Run: `npm run test:shared`
Expected: PASS, at the current baseline (unaffected by this phase — `packages/shared` has no throttling-related code).

- [ ] **Step 3: Full `apps/api` e2e suite**

Run: `npm run test:api:e2e -- --runInBand`
Expected: PASS, 72/72.

- [ ] **Step 4: Live manual check — real strict-tier limit against a running dev server**

This is the check that proves the actual configured 5/60s auth limit works end-to-end outside the test environment (where `NODE_ENV !== 'test'`, so `rate-limit-tiers.ts` returns the real value, not the relaxed one).

Ensure Redis and the database are running (same infra this project's existing dev workflow already requires for `apps/api`), then in one terminal:
```bash
npm run dev:api
```
Wait for it to log that it's listening (matches this project's established `dev:api` startup, per `apps/api/src/main.ts`'s bootstrap). In a second terminal, fire 6 requests at the staff login route in immediate succession — the throttler guard counts the request before the handler runs, so invalid credentials still count against the limit:

```powershell
1..6 | ForEach-Object {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:3000/api/v1/auth/staff/login" -Method Post -ContentType "application/json" -Body '{"email":"nobody@example.com","password":"wrong"}' -SkipHttpErrorCheck
    Write-Output "Request $_: $($r.StatusCode)"
  } catch {
    Write-Output "Request $_: $($_.Exception.Response.StatusCode.value__)"
  }
}
```

Expected: requests 1-5 return `401` (invalid credentials — the request reached `AuthService`), request 6 returns `429`. If `apps/api` listens on a different port/prefix than `3000`/`api/v1` in this environment, adjust the URL to match `apps/api/src/main.ts`'s actual configured values (check that file if the request fails with a connection error rather than a 401/429).

Stop the dev server (`Ctrl+C` in its terminal) once confirmed.

- [ ] **Step 5: Record the result**

No code changes from this task. If Step 4 shows anything other than "5× 401 then 429", stop and report — do not close out the phase with an unverified live check (this project's established discipline, per the live-monitoring fix: automated suite passing is not sufficient proof for anything gating real request handling).
