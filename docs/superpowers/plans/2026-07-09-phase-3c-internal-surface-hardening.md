# Phase 3c — Internal Exam-Runtime Surface Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four hardening gaps Phase 3b's own final review flagged in its internal exam-runtime surface — network isolation, fetch timeout, sequential N+1 settle calls, and non-constant-time secret comparison — entirely at the code level, so a future real-deployment phase inherits a surface that's already safe to expose.

**Architecture:** `apps/exam-runtime` splits its single Nest application into two: the existing public app (candidate-facing routes, unchanged) and a new internal-only app bound to `127.0.0.1` by default, on its own port. `ExamRuntimeInternalClient` (in `apps/api`) gains a timeout/abort wrapper used by every method, plus a new batch settle endpoint replacing the old one-call-per-attempt loop. `InternalAuthGuard`'s secret check moves to `crypto.timingSafeEqual`. The e2e test harness (`apps/api/test/dual-app.ts`) is updated once, centrally, so the four existing dual-app e2e specs need zero changes.

**Tech Stack:** Same as Phase 3a/3b — NestJS, Prisma (`sqlserver` provider via `@exam-platform/shared`), SQL Server, Jest/Supertest. No new dependencies (`AbortController`/`crypto.timingSafeEqual` are Node built-ins).

## Global Constraints

- The internal app must bind to `127.0.0.1` by default (via `EXAM_RUNTIME_INTERNAL_HOST`), never `0.0.0.0` — the whole point of this task is that nothing off-host can reach it even with a valid secret.
- `bootRuntimeApp()` in `apps/api/test/dual-app.ts` must keep its exact external contract (`Promise<{ app: INestApplication; port: number }>`) — the four existing e2e specs that call it (`exam-taking-runtime.e2e-spec.ts`, `live-monitoring.e2e-spec.ts`, `session-enforcement-anti-cheat.e2e-spec.ts`, `ai-proctoring.e2e-spec.ts`) must require zero code changes.
- Every `ExamRuntimeInternalClient` method must route through a shared `fetchWithTimeout` helper — no bare `fetch()` calls remain after this plan.
- Default internal-call timeout is 5000ms, overridable via `EXAM_RUNTIME_INTERNAL_TIMEOUT_MS`.
- The old single-attempt `POST /internal/attempts/:id/settle-if-expired` endpoint and its client method (`settleIfExpired`) must be fully removed, not left dead alongside the new batch one (`POST /internal/attempts/settle-if-expired-batch` / `settleIfExpiredBatch`).
- Secret comparison must use `crypto.timingSafeEqual`, with an explicit length check first (it throws on mismatched-length buffers) and an explicit `typeof === 'string'` check on the header value (Express types a header as `string | string[] | undefined`).
- Work happens directly on `main` (no feature branch) — established pattern for this project across every prior phase.
- This is a pure application-code hardening pass — no Prisma schema changes, no new migrations.
- Full spec: `docs/superpowers/specs/2026-07-09-phase-3c-internal-surface-hardening-design.md`. Full prior context: `memory.md` at repo root, `docs/superpowers/plans/2026-07-09-phase-3b-exam-runtime-isolation.md`.

---

## File Structure

```
apps/exam-runtime/
  src/
    main.ts                                             # Modify: boot two Nest apps (public + internal)
    app.module.ts                                       # Modify: remove InternalModule
    internal-app.module.ts                               # Create: internal-only bootstrap module
    internal/
      internal.controller.ts                             # Modify: settleIfExpired -> settleIfExpiredBatch
      internal.controller.spec.ts                        # Modify: matching test update
      internal-auth.guard.ts                              # Modify: constant-time comparison
      internal-auth.guard.spec.ts                         # Modify: add length/type-mismatch tests
      dto/
        settle-if-expired-batch.dto.ts                    # Create
  .env                                                    # Modify (local, gitignored): add internal port/host
apps/api/
  src/
    exam-runtime-client/
      exam-runtime-internal.client.ts                     # Modify: fetchWithTimeout, settleIfExpiredBatch
      exam-runtime-internal.client.spec.ts                 # Modify: matching test update
    exams/
      exams.service.ts                                    # Modify: getResults uses settleIfExpiredBatch
      exams.service.spec.ts                                # Modify: matching test update
  test/
    dual-app.ts                                            # Modify: boot both exam-runtime apps
  .env                                                     # Modify (local, gitignored): EXAM_RUNTIME_INTERNAL_URL
.env.example                                                # Modify: new/changed internal-surface vars
README.md                                                   # Modify: document dual-listener setup
```

---

### Task 1: Dual-listener bootstrap split + test harness update

**Files:**
- Modify: `apps/exam-runtime/src/main.ts`
- Modify: `apps/exam-runtime/src/app.module.ts`
- Create: `apps/exam-runtime/src/internal-app.module.ts`
- Modify: `apps/api/test/dual-app.ts`
- Modify: `.env.example`
- Modify: `apps/exam-runtime/.env` (local, gitignored)
- Modify: `apps/api/.env` (local, gitignored)
- Modify: `README.md`

**Interfaces:**
- Produces: `InternalAppModule` (exported class, `apps/exam-runtime/src/internal-app.module.ts`) — a self-contained Nest module bootable independently of `AppModule`. `bootRuntimeApp()` keeps its exact signature `(configure?: Configure) => Promise<{ app: INestApplication; port: number }>`.

This task deliberately bundles the production bootstrap split with the test harness update — splitting them would leave every e2e test broken in between (the internal routes disappear from the app the harness boots), so they're one reviewable, fully-green unit.

- [ ] **Step 1: Remove `InternalModule` from the public `AppModule`**

Replace `apps/exam-runtime/src/app.module.ts` in full:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@exam-platform/shared';
import { CandidateAuthModule } from './candidate-auth/candidate-auth.module';
import { AttemptModule } from './attempts/attempt.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { ProctoringAnalysisModule } from './proctoring-analysis/proctoring-analysis.module';
import { GradingModule } from './grading/grading.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CandidateAuthModule,
    AttemptModule,
    MonitoringModule,
    ProctoringAnalysisModule,
    GradingModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 2: Create the internal-only module**

`apps/exam-runtime/src/internal-app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@exam-platform/shared';
import { InternalModule } from './internal/internal.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, InternalModule],
})
export class InternalAppModule {}
```

`InternalModule` itself (`apps/exam-runtime/src/internal/internal.module.ts`) is unchanged — it already imports `GradingModule`, `MonitoringModule`, `ProctoringAnalysisModule` and declares `InternalController`.

- [ ] **Step 3: Boot both apps in `main.ts`**

Replace `apps/exam-runtime/src/main.ts` in full:
```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { InternalAppModule } from './internal-app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.WEB_ORIGIN, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  app.setGlobalPrefix('api/v1');
  await app.listen(process.env.EXAM_RUNTIME_PORT ?? 3002);

  const internalApp = await NestFactory.create(InternalAppModule);
  internalApp.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  internalApp.setGlobalPrefix('api/v1');
  await internalApp.listen(process.env.EXAM_RUNTIME_INTERNAL_PORT ?? 3003, process.env.EXAM_RUNTIME_INTERNAL_HOST ?? '127.0.0.1');
}
bootstrap();
```

- [ ] **Step 4: Verify the exam-runtime build is clean**

Run (from `apps/exam-runtime/`): `npx nest build`
Expected: builds cleanly, no type errors from the `AppModule`/`InternalAppModule` split.

- [ ] **Step 5: Update the e2e test harness to boot both apps**

Replace `apps/api/test/dual-app.ts` in full:
```typescript
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
  const app = await bootApp(RuntimeAppModule, configure);
  await app.listen(0);
  const port = (app.getHttpServer().address() as { port: number }).port;

  const internalApp = await bootApp(RuntimeInternalAppModule, configure);
  await internalApp.listen(0, '127.0.0.1');
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
```

- [ ] **Step 6: Update env templates and local env files**

In `.env.example` (repo root), change:
```
EXAM_RUNTIME_INTERNAL_URL=http://localhost:3002
```
to:
```
EXAM_RUNTIME_INTERNAL_URL=http://127.0.0.1:3003
EXAM_RUNTIME_INTERNAL_PORT=3003
EXAM_RUNTIME_INTERNAL_HOST=127.0.0.1
```

In the local (gitignored) `apps/exam-runtime/.env`, add:
```
EXAM_RUNTIME_INTERNAL_PORT=3003
EXAM_RUNTIME_INTERNAL_HOST=127.0.0.1
```

In the local (gitignored) `apps/api/.env`, change:
```
EXAM_RUNTIME_INTERNAL_URL=http://localhost:3002
```
to:
```
EXAM_RUNTIME_INTERNAL_URL=http://127.0.0.1:3003
```

- [ ] **Step 7: Document the dual-listener setup in the README**

In `README.md`, in the "Phase 0: local development setup — apps/exam-runtime" section, add a new step after the existing step 6 ("Set `INTERNAL_SERVICE_SECRET`..."), renumbering the existing step 7 ("`npm run dev:exam-runtime`...") to step 8:
```
7. `apps/exam-runtime` now starts two listeners: the public candidate-facing one on `EXAM_RUNTIME_PORT` (default 3002, all interfaces), and an internal-only one on `EXAM_RUNTIME_INTERNAL_PORT` (default 3003) bound to `EXAM_RUNTIME_INTERNAL_HOST` (default `127.0.0.1` — deliberately not reachable from outside this machine). `apps/api/.env`'s `EXAM_RUNTIME_INTERNAL_URL` must point at wherever the internal listener actually is (default `http://127.0.0.1:3003`). The `INTERNAL_SERVICE_SECRET` header check still applies on top of this network restriction — it isn't a replacement for it.
```

- [ ] **Step 8: Run the full e2e regression**

Run: `npm run test:api:e2e` (from repo root)
Expected: all suites pass, including all four dual-app specs (`exam-taking-runtime`, `live-monitoring`, `session-enforcement-anti-cheat`, `ai-proctoring`), unchanged. This is the proof that the dual-listener split didn't break the cross-service boundary those specs exercise.

- [ ] **Step 9: Run the exam-runtime and api unit suites**

Run: `npm run test:exam-runtime` and `npm run test:api` (from repo root)
Expected: both fully green, no regressions.

- [ ] **Step 10: Commit**

```bash
git add apps/exam-runtime/src/main.ts apps/exam-runtime/src/app.module.ts apps/exam-runtime/src/internal-app.module.ts apps/api/test/dual-app.ts .env.example README.md
git commit -m "refactor: split apps/exam-runtime bootstrap into dual listeners, internal app bound to 127.0.0.1"
```

Note: `apps/exam-runtime/.env` and `apps/api/.env` are gitignored — Step 6's edits to them are local-only and not part of this commit.

---

### Task 2: Fetch timeout, abort, and network-error translation

**Files:**
- Modify: `apps/api/src/exam-runtime-client/exam-runtime-internal.client.ts`
- Modify: `apps/api/src/exam-runtime-client/exam-runtime-internal.client.spec.ts`

**Interfaces:**
- Consumes: nothing new from Task 1.
- Produces: a private `fetchWithTimeout(url: string, init: RequestInit): Promise<Response>` used by every existing method (`forceSubmit`, `reanalyze`, `settleIfExpired`, `notifyMessageSent`). Task 3 reuses this same helper for the new `settleIfExpiredBatch` method it adds.

- [ ] **Step 1: Write the failing tests**

Replace `apps/api/src/exam-runtime-client/exam-runtime-internal.client.spec.ts` in full:
```typescript
import { BadRequestException, InternalServerErrorException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ExamRuntimeInternalClient } from './exam-runtime-internal.client';

describe('ExamRuntimeInternalClient', () => {
  let client: ExamRuntimeInternalClient;

  beforeEach(() => {
    client = new ExamRuntimeInternalClient();
    process.env.EXAM_RUNTIME_INTERNAL_URL = 'http://localhost:3002';
    process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret';
    delete process.env.EXAM_RUNTIME_INTERNAL_TIMEOUT_MS;
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('forceSubmit', () => {
    it('POSTs to the internal force-submit endpoint with the shared secret and returns the parsed body', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ status: 'force_submitted' }) });

      const result = await client.forceSubmit('attempt-1');

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3002/api/v1/internal/attempts/attempt-1/force-submit', {
        method: 'POST',
        headers: { 'x-internal-secret': 'test-internal-secret' },
        signal: expect.any(AbortSignal),
      });
      expect(result).toEqual({ status: 'force_submitted' });
    });

    it('translates a 404 response into NotFoundException', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404, json: async () => ({ message: 'Attempt attempt-1 not found' }) });

      await expect(client.forceSubmit('attempt-1')).rejects.toThrow(NotFoundException);
    });

    it('translates a 400 response into BadRequestException', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: 'not in_progress' }) });

      await expect(client.forceSubmit('attempt-1')).rejects.toThrow(BadRequestException);
    });

    it('translates any other non-ok response into InternalServerErrorException', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error', json: async () => { throw new Error('no body'); } });

      await expect(client.forceSubmit('attempt-1')).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('reanalyze', () => {
    it('POSTs to the internal reanalyze endpoint', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });

      await client.reanalyze('attempt-1');

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3002/api/v1/internal/attempts/attempt-1/reanalyze', {
        method: 'POST',
        headers: { 'x-internal-secret': 'test-internal-secret' },
        signal: expect.any(AbortSignal),
      });
    });
  });

  describe('settleIfExpired', () => {
    it('POSTs to the internal settle-if-expired endpoint', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });

      await client.settleIfExpired('attempt-1');

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3002/api/v1/internal/attempts/attempt-1/settle-if-expired', {
        method: 'POST',
        headers: { 'x-internal-secret': 'test-internal-secret' },
        signal: expect.any(AbortSignal),
      });
    });
  });

  describe('notifyMessageSent', () => {
    it('POSTs the payload as JSON to the internal message-sent endpoint', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
      const sentAt = new Date('2026-07-09T00:00:00.000Z');

      await client.notifyMessageSent({ examId: 'exam-1', attemptId: 'attempt-1', candidateId: 'cand-1', sentAt });

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3002/api/v1/internal/monitoring/message-sent', {
        method: 'POST',
        headers: { 'x-internal-secret': 'test-internal-secret', 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId: 'exam-1', attemptId: 'attempt-1', candidateId: 'cand-1', sentAt }),
        signal: expect.any(AbortSignal),
      });
    });
  });

  describe('timeout and network-error handling', () => {
    it('aborts and throws ServiceUnavailableException when the request exceeds the default timeout', async () => {
      jest.useFakeTimers();
      (global.fetch as jest.Mock).mockImplementation((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          (init.signal as AbortSignal).addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      const promise = client.reanalyze('attempt-1');
      await jest.advanceTimersByTimeAsync(5000);

      await expect(promise).rejects.toThrow(ServiceUnavailableException);
    });

    it('uses EXAM_RUNTIME_INTERNAL_TIMEOUT_MS when set instead of the 5000ms default', async () => {
      process.env.EXAM_RUNTIME_INTERNAL_TIMEOUT_MS = '100';
      jest.useFakeTimers();
      (global.fetch as jest.Mock).mockImplementation((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          (init.signal as AbortSignal).addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      const promise = client.reanalyze('attempt-1');
      await jest.advanceTimersByTimeAsync(100);

      await expect(promise).rejects.toThrow(ServiceUnavailableException);
    });

    it('translates a connection error (fetch rejects without a response) into ServiceUnavailableException', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new TypeError('fetch failed'));

      await expect(client.reanalyze('attempt-1')).rejects.toThrow(ServiceUnavailableException);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npm run test:api -- exam-runtime-internal.client` (from repo root)
Expected: FAIL — the `signal` assertions fail against the current bare-`fetch` implementation, and `ServiceUnavailableException`/timeout tests fail since `fetchWithTimeout` doesn't exist yet.

- [ ] **Step 3: Implement `fetchWithTimeout` and wire every method through it**

Replace `apps/api/src/exam-runtime-client/exam-runtime-internal.client.ts` in full:
```typescript
import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

interface ForceSubmitResult {
  status: string;
}

interface NotifyMessageSentPayload {
  examId: string;
  attemptId: string;
  candidateId: string;
  sentAt: Date;
}

@Injectable()
export class ExamRuntimeInternalClient {
  async forceSubmit(attemptId: string): Promise<ForceSubmitResult> {
    const response = await this.fetchWithTimeout(`${this.baseUrl()}/api/v1/internal/attempts/${attemptId}/force-submit`, {
      method: 'POST',
      headers: this.headers(),
    });
    await this.throwIfNotOk(response);
    return response.json();
  }

  async reanalyze(attemptId: string): Promise<void> {
    const response = await this.fetchWithTimeout(`${this.baseUrl()}/api/v1/internal/attempts/${attemptId}/reanalyze`, {
      method: 'POST',
      headers: this.headers(),
    });
    await this.throwIfNotOk(response);
  }

  async settleIfExpired(attemptId: string): Promise<void> {
    const response = await this.fetchWithTimeout(`${this.baseUrl()}/api/v1/internal/attempts/${attemptId}/settle-if-expired`, {
      method: 'POST',
      headers: this.headers(),
    });
    await this.throwIfNotOk(response);
  }

  async notifyMessageSent(payload: NotifyMessageSentPayload): Promise<void> {
    const response = await this.fetchWithTimeout(`${this.baseUrl()}/api/v1/internal/monitoring/message-sent`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await this.throwIfNotOk(response);
  }

  private baseUrl(): string {
    return process.env.EXAM_RUNTIME_INTERNAL_URL as string;
  }

  private headers(): Record<string, string> {
    return { 'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET as string };
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const timeoutMs = process.env.EXAM_RUNTIME_INTERNAL_TIMEOUT_MS
      ? parseInt(process.env.EXAM_RUNTIME_INTERNAL_TIMEOUT_MS, 10)
      : 5000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      const isAbort = error instanceof Error && error.name === 'AbortError';
      throw new ServiceUnavailableException(
        isAbort
          ? `Exam runtime internal call to ${url} timed out after ${timeoutMs}ms`
          : `Exam runtime internal call to ${url} failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async throwIfNotOk(response: Response): Promise<void> {
    if (response.ok) {
      return;
    }
    const body = await response.json().catch(() => ({ message: response.statusText }));
    if (response.status === 404) {
      throw new NotFoundException(body.message);
    }
    if (response.status === 400) {
      throw new BadRequestException(body.message);
    }
    throw new InternalServerErrorException(body.message ?? 'Exam runtime internal call failed');
  }
}
```

Note: `settleIfExpired` is kept as-is (single-attempt) in this task — Task 3 replaces it with the batch endpoint. This task's scope is purely the timeout wrapper.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:api -- exam-runtime-internal.client`
Expected: `10 passed` (7 existing + 3 new timeout/network-error tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/exam-runtime-client/exam-runtime-internal.client.ts apps/api/src/exam-runtime-client/exam-runtime-internal.client.spec.ts
git commit -m "fix: add fetch timeout and network-error translation to ExamRuntimeInternalClient"
```

---

### Task 3: Batch settle-if-expired endpoint

**Files:**
- Create: `apps/exam-runtime/src/internal/dto/settle-if-expired-batch.dto.ts`
- Modify: `apps/exam-runtime/src/internal/internal.controller.ts`
- Modify: `apps/exam-runtime/src/internal/internal.controller.spec.ts`
- Modify: `apps/api/src/exam-runtime-client/exam-runtime-internal.client.ts`
- Modify: `apps/api/src/exam-runtime-client/exam-runtime-internal.client.spec.ts`

**Interfaces:**
- Consumes: `fetchWithTimeout` (Task 2, exact signature above).
- Produces: `InternalController.settleIfExpiredBatch(dto: SettleIfExpiredBatchDto): Promise<void>` at `POST /internal/attempts/settle-if-expired-batch`. `ExamRuntimeInternalClient.settleIfExpiredBatch(attemptIds: string[]): Promise<void>` — Task 4's `ExamsService.getResults` calls this exact method. The old `settleIfExpired` (single-attempt) endpoint and client method are removed entirely.

- [ ] **Step 1: Write the DTO**

`apps/exam-runtime/src/internal/dto/settle-if-expired-batch.dto.ts`:
```typescript
import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class SettleIfExpiredBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  attemptIds!: string[];
}
```

- [ ] **Step 2: Write the failing controller test**

In `apps/exam-runtime/src/internal/internal.controller.spec.ts`, replace the entire `describe('settleIfExpired', ...)` block with:
```typescript
  describe('settleIfExpiredBatch', () => {
    it('settles every attempt found for the given ids', async () => {
      const exam1 = { id: 'exam-1', durationMinutes: 30, passCriteriaPercent: 40 };
      const attempt1 = { id: 'attempt-1', status: 'in_progress', invitation: { exam: exam1 } };
      const attempt2 = { id: 'attempt-2', status: 'in_progress', invitation: { exam: exam1 } };
      const tx = { attempt: { findMany: jest.fn().mockResolvedValue([attempt1, attempt2]) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await controller.settleIfExpiredBatch({ attemptIds: ['attempt-1', 'attempt-2'] });

      expect(tenantPrisma.forTenant).toHaveBeenCalledWith({ organizationId: null, isSuperAdmin: true }, expect.any(Function));
      expect(tx.attempt.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['attempt-1', 'attempt-2'] } },
        include: { invitation: { include: { exam: true } } },
      });
      expect(attemptSettlement.settleIfExpired).toHaveBeenCalledTimes(2);
      expect(attemptSettlement.settleIfExpired).toHaveBeenNthCalledWith(1, tx, exam1, attempt1);
      expect(attemptSettlement.settleIfExpired).toHaveBeenNthCalledWith(2, tx, exam1, attempt2);
    });

    it('settles nothing when no matching attempts are found', async () => {
      const tx = { attempt: { findMany: jest.fn().mockResolvedValue([]) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await controller.settleIfExpiredBatch({ attemptIds: ['missing-1'] });

      expect(attemptSettlement.settleIfExpired).not.toHaveBeenCalled();
    });
  });
```

The rest of the file (`forceSubmit`, `reanalyze`, `notifyMessageSent` describe blocks, and the top-level `beforeEach` setup) is unchanged.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:exam-runtime -- internal.controller` (from repo root)
Expected: FAIL — `controller.settleIfExpiredBatch` is not a function yet.

- [ ] **Step 4: Replace the single-attempt endpoint with the batch one**

In `apps/exam-runtime/src/internal/internal.controller.ts`, replace the `settleIfExpired` method and add the DTO import:
```typescript
import { BadRequestException, Body, Controller, HttpCode, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { TenantPrismaService } from '@exam-platform/shared';
import { AttemptSettlementService } from '../grading/attempt-settlement.service';
import { AttemptAnalysisService } from '../proctoring-analysis/attempt-analysis.service';
import { MonitoringGateway } from '../monitoring/monitoring.gateway';
import { InternalAuthGuard } from './internal-auth.guard';
import { NotifyMessageSentDto } from './dto/notify-message-sent.dto';
import { SettleIfExpiredBatchDto } from './dto/settle-if-expired-batch.dto';

@Controller('internal')
@UseGuards(InternalAuthGuard)
export class InternalController {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly attemptSettlement: AttemptSettlementService,
    private readonly attemptAnalysis: AttemptAnalysisService,
    private readonly monitoringGateway: MonitoringGateway,
  ) {}

  @Post('attempts/:id/force-submit')
  async forceSubmit(@Param('id') id: string) {
    const finalized = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, async (tx) => {
      const attempt = await tx.attempt.findUnique({
        where: { id },
        include: { invitation: { include: { exam: true } } },
      });
      if (!attempt) {
        throw new NotFoundException(`Attempt ${id} not found`);
      }
      if (attempt.status !== 'in_progress') {
        throw new BadRequestException(`Attempt ${id} cannot be force-submitted from status "${attempt.status}"`);
      }
      const exam = attempt.invitation.exam;
      return this.attemptSettlement.finalize(tx, exam, attempt, 'force_submitted');
    });
    return { status: finalized.status };
  }

  @Post('attempts/:id/reanalyze')
  @HttpCode(204)
  async reanalyze(@Param('id') id: string): Promise<void> {
    await this.attemptAnalysis.analyze(id);
  }

  @Post('attempts/settle-if-expired-batch')
  @HttpCode(204)
  async settleIfExpiredBatch(@Body() dto: SettleIfExpiredBatchDto): Promise<void> {
    await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, async (tx) => {
      const attempts = await tx.attempt.findMany({
        where: { id: { in: dto.attemptIds } },
        include: { invitation: { include: { exam: true } } },
      });
      for (const attempt of attempts) {
        await this.attemptSettlement.settleIfExpired(tx, attempt.invitation.exam, attempt);
      }
    });
  }

  @Post('monitoring/message-sent')
  @HttpCode(204)
  async notifyMessageSent(@Body() dto: NotifyMessageSentDto): Promise<void> {
    this.monitoringGateway.emitMessageSent(dto.examId, {
      attemptId: dto.attemptId,
      candidateId: dto.candidateId,
      sentAt: new Date(dto.sentAt),
    });
  }
}
```

- [ ] **Step 5: Run the controller test to verify it passes**

Run: `npm run test:exam-runtime -- internal.controller`
Expected: all tests pass (existing `forceSubmit`/`reanalyze`/`notifyMessageSent` blocks unchanged + the new `settleIfExpiredBatch` block, 2/2).

- [ ] **Step 6: Write the failing client test**

In `apps/api/src/exam-runtime-client/exam-runtime-internal.client.spec.ts`, replace the entire `describe('settleIfExpired', ...)` block with:
```typescript
  describe('settleIfExpiredBatch', () => {
    it('POSTs the attempt ids as JSON to the internal batch settle endpoint', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });

      await client.settleIfExpiredBatch(['attempt-1', 'attempt-2']);

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3002/api/v1/internal/attempts/settle-if-expired-batch', {
        method: 'POST',
        headers: { 'x-internal-secret': 'test-internal-secret', 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptIds: ['attempt-1', 'attempt-2'] }),
        signal: expect.any(AbortSignal),
      });
    });
  });
```

- [ ] **Step 7: Run the client test to verify it fails**

Run: `npm run test:api -- exam-runtime-internal.client`
Expected: FAIL — `client.settleIfExpiredBatch` is not a function yet.

- [ ] **Step 8: Replace the client's single-attempt method with the batch one**

In `apps/api/src/exam-runtime-client/exam-runtime-internal.client.ts`, replace the `settleIfExpired` method:
```typescript
  async settleIfExpiredBatch(attemptIds: string[]): Promise<void> {
    const response = await this.fetchWithTimeout(`${this.baseUrl()}/api/v1/internal/attempts/settle-if-expired-batch`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ attemptIds }),
    });
    await this.throwIfNotOk(response);
  }
```

- [ ] **Step 9: Run the client test to verify it passes**

Run: `npm run test:api -- exam-runtime-internal.client`
Expected: `10 passed` (same total as Task 2 — `settleIfExpired`'s 1 test was replaced by `settleIfExpiredBatch`'s 1 test).

- [ ] **Step 10: Commit**

```bash
git add apps/exam-runtime/src/internal/dto/settle-if-expired-batch.dto.ts apps/exam-runtime/src/internal/internal.controller.ts apps/exam-runtime/src/internal/internal.controller.spec.ts apps/api/src/exam-runtime-client/exam-runtime-internal.client.ts apps/api/src/exam-runtime-client/exam-runtime-internal.client.spec.ts
git commit -m "feat: replace single-attempt settle-if-expired internal endpoint with a batch endpoint"
```

---

### Task 4: ExamsService.getResults uses the batch call

**Files:**
- Modify: `apps/api/src/exams/exams.service.ts`
- Modify: `apps/api/src/exams/exams.service.spec.ts`

**Interfaces:**
- Consumes: `ExamRuntimeInternalClient.settleIfExpiredBatch` (Task 3, exact signature above).

- [ ] **Step 1: Update the failing unit tests**

In `apps/api/src/exams/exams.service.spec.ts`:

Change the mock type declaration and `beforeEach` setup near the top of the file:
```typescript
  let examRuntime: { settleIfExpiredBatch: jest.Mock };
```
```typescript
    examRuntime = { settleIfExpiredBatch: jest.fn() };
```

In the `describe('getResults', ...)` block, update the `'returns the graded result for a submitted attempt'` test's final assertion:
```typescript
      expect(examRuntime.settleIfExpiredBatch).not.toHaveBeenCalled();
```

Replace the `'settles an in-progress attempt past its deadline before reporting it'` test in full:
```typescript
    it('settles an in-progress attempt past its deadline before reporting it', async () => {
      const exam = { id: 'exam-1', passCriteriaPercent: 40 };
      const inProgressAttempt = { id: 'attempt-1', status: 'in_progress', result: null };
      const settledAttempt = { id: 'attempt-1', status: 'auto_submitted', submittedAt: new Date() };
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue(exam) },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'inv-1', candidateId: 'cand-1', status: 'invited', candidate: { name: 'Alice' }, attempt: inProgressAttempt },
          ]),
        },
        attempt: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              {
                ...settledAttempt,
                result: { score: 4, maxScore: 10, percentage: 40, passFail: 'pass' },
                proctoringAnalysis: null,
              },
            ]),
        },
      };
      examRuntime.settleIfExpiredBatch.mockResolvedValue(undefined);
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getResults(context, 'exam-1');

      expect(examRuntime.settleIfExpiredBatch).toHaveBeenCalledWith([inProgressAttempt.id]);
      expect(tx.attempt.findMany).toHaveBeenCalledWith({
        where: { id: { in: [inProgressAttempt.id] } },
        include: { result: true, proctoringAnalysis: true },
      });
      expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(2);
      expect(result[0].status).toBe('auto_submitted');
      expect(result[0].passFail).toBe('pass');
    });

    it('batches all in-progress attempts into a single settleIfExpiredBatch call', async () => {
      const exam = { id: 'exam-1', passCriteriaPercent: 40 };
      const attempt1 = { id: 'attempt-1', status: 'in_progress', result: null };
      const attempt2 = { id: 'attempt-2', status: 'in_progress', result: null };
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue(exam) },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'inv-1', candidateId: 'cand-1', status: 'invited', candidate: { name: 'Alice' }, attempt: attempt1 },
            { id: 'inv-2', candidateId: 'cand-2', status: 'invited', candidate: { name: 'Bob' }, attempt: attempt2 },
          ]),
        },
        attempt: {
          findMany: jest.fn().mockResolvedValue([
            { ...attempt1, status: 'auto_submitted', submittedAt: new Date(), result: null, proctoringAnalysis: null },
            { ...attempt2, status: 'auto_submitted', submittedAt: new Date(), result: null, proctoringAnalysis: null },
          ]),
        },
      };
      examRuntime.settleIfExpiredBatch.mockResolvedValue(undefined);
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.getResults(context, 'exam-1');

      expect(examRuntime.settleIfExpiredBatch).toHaveBeenCalledTimes(1);
      expect(examRuntime.settleIfExpiredBatch).toHaveBeenCalledWith(['attempt-1', 'attempt-2']);
    });
```

Update the `'does not open a second transaction when no attempts need settling'` test's final assertion:
```typescript
      expect(examRuntime.settleIfExpiredBatch).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run the tests to verify the updated/new ones fail**

Run: `npm run test:api -- exams.service`
Expected: FAIL — `service.getResults` still calls the removed `examRuntime.settleIfExpired` in a loop, which no longer exists on the mock.

- [ ] **Step 3: Replace the sequential loop with the batch call**

In `apps/api/src/exams/exams.service.ts`, in `getResults`, replace:
```typescript
    for (const attemptId of attemptIdsToSettle) {
      await this.examRuntime.settleIfExpired(attemptId);
    }
```
with:
```typescript
    await this.examRuntime.settleIfExpiredBatch(attemptIdsToSettle);
```

The rest of `getResults` (the early return when `attemptIdsToSettle.length === 0`, the follow-up `tenantPrisma.forTenant` re-fetch, `toResultRow` mapping) is unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:api -- exams.service`
Expected: all tests pass (the `getResults` describe block now has 7 tests: the original 6, minus the one rewritten in place, plus the new batching-proof test).

- [ ] **Step 5: Run the full unit suite**

Run: `npm run test:api` (from repo root)
Expected: all suites passing, no regressions.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/exams/exams.service.ts apps/api/src/exams/exams.service.spec.ts
git commit -m "fix: replace ExamsService.getResults' sequential settle-if-expired loop with one batch call"
```

---

### Task 5: Constant-time secret comparison

**Files:**
- Modify: `apps/exam-runtime/src/internal/internal-auth.guard.ts`
- Modify: `apps/exam-runtime/src/internal/internal-auth.guard.spec.ts`

**Interfaces:** none — self-contained, no other task depends on this one's internals (only on the guard continuing to accept/reject requests correctly, which is unchanged behaviorally except for the timing characteristics and the new array-header rejection).

- [ ] **Step 1: Write the failing tests**

Replace `apps/exam-runtime/src/internal/internal-auth.guard.spec.ts` in full:
```typescript
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { InternalAuthGuard } from './internal-auth.guard';

describe('InternalAuthGuard', () => {
  let guard: InternalAuthGuard;

  beforeEach(() => {
    guard = new InternalAuthGuard();
    process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret';
  });

  function makeContext(headers: Record<string, string | string[]>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    } as unknown as ExecutionContext;
  }

  it('allows a request with the correct secret header', () => {
    expect(guard.canActivate(makeContext({ 'x-internal-secret': 'test-internal-secret' }))).toBe(true);
  });

  it('rejects a request with a missing secret header', () => {
    expect(() => guard.canActivate(makeContext({}))).toThrow(UnauthorizedException);
  });

  it('rejects a request with a shorter wrong secret', () => {
    expect(() => guard.canActivate(makeContext({ 'x-internal-secret': 'wrong' }))).toThrow(UnauthorizedException);
  });

  it('rejects a request with a same-length wrong secret', () => {
    expect(() => guard.canActivate(makeContext({ 'x-internal-secret': 'test-internal-secre1' }))).toThrow(UnauthorizedException);
  });

  it('rejects a request where the header was sent twice (array value)', () => {
    expect(() =>
      guard.canActivate(makeContext({ 'x-internal-secret': ['test-internal-secret', 'test-internal-secret'] })),
    ).toThrow(UnauthorizedException);
  });
});
```

`'test-internal-secre1'` is deliberately the same length as `'test-internal-secret'` (20 characters, only the last character differs) — this is what actually exercises `timingSafeEqual`'s byte comparison rather than just the length-mismatch early return.

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npm run test:exam-runtime -- internal-auth.guard`
Expected: the two new tests fail against the current `!==` comparison would actually still pass behaviorally (wrong is wrong either way) — but run it anyway to confirm the baseline, since Step 4 changes the implementation these tests must keep passing against.

- [ ] **Step 3: Implement the constant-time comparison**

Replace `apps/exam-runtime/src/internal/internal-auth.guard.ts` in full:
```typescript
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

function secretsMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

@Injectable()
export class InternalAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const providedSecret = request.headers['x-internal-secret'];
    const expectedSecret = process.env.INTERNAL_SERVICE_SECRET;
    if (!expectedSecret || typeof providedSecret !== 'string' || !secretsMatch(providedSecret, expectedSecret)) {
      throw new UnauthorizedException('Invalid internal service credentials');
    }
    return true;
  }
}
```

`timingSafeEqual` throws if given two buffers of different lengths, so the length check must run first — returning `false` immediately on a length mismatch leaks the expected secret's length via timing, a materially smaller signal than a full character-by-character early-exit comparison, and the standard accepted mitigation for this class of check.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:exam-runtime -- internal-auth.guard`
Expected: `5 passed` (3 existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add apps/exam-runtime/src/internal/internal-auth.guard.ts apps/exam-runtime/src/internal/internal-auth.guard.spec.ts
git commit -m "fix: use constant-time secret comparison in InternalAuthGuard"
```

---

### Task 6: Final verification

**Files:** none — this task runs the full regression suite and a manual sanity check; no code changes expected unless verification surfaces a real gap, in which case follow the same TDD pattern as the task where the gap belongs.

**Interfaces:** none — this task consumes the full surface built across Tasks 1-5.

- [ ] **Step 1: Run the full exam-runtime unit suite**

Run: `npm run test:exam-runtime` (from repo root)
Expected: all suites passing.

- [ ] **Step 2: Run the full api unit suite**

Run: `npm run test:api` (from repo root)
Expected: all suites passing.

- [ ] **Step 3: Run the full api e2e suite**

Run: `npm run test:api:e2e` (from repo root)
Expected: all suites passing, including all four dual-app specs.

- [ ] **Step 4: Build both apps cleanly**

Run: `npx nest build` from `apps/exam-runtime/`, then from `apps/api/`.
Expected: both build with no errors.

- [ ] **Step 5: Manual network-isolation sanity check**

This proves the `127.0.0.1` bind actually restricts reachability at the OS level, not just that the code compiles — something no unit or e2e test (which all run on localhost anyway) can prove.

1. Start `apps/exam-runtime` locally: `npm run dev:exam-runtime` (from repo root).
2. From the same machine, confirm the internal surface responds on loopback (expect `401 Unauthorized` — this endpoint requires the secret header, but the connection itself must succeed, proving the port is listening and reachable from localhost):
   ```bash
   curl -i -X POST http://127.0.0.1:3003/api/v1/internal/attempts/does-not-matter/reanalyze
   ```
   Expected: an HTTP response (401), not a connection error.
3. Find the machine's LAN IP (e.g. `ipconfig` on Windows, look for the adapter's IPv4 address) and attempt the same request against that address instead of `127.0.0.1`:
   ```bash
   curl -i -X POST http://<lan-ip>:3003/api/v1/internal/attempts/does-not-matter/reanalyze
   ```
   Expected: connection refused / timeout — no response at all, proving the internal port is not reachable from outside the loopback interface.
4. Confirm the public port is still reachable from the LAN IP as expected (e.g. `curl -i http://<lan-ip>:3002/api/v1/candidate-auth/...` — any route, just confirming a response comes back), showing the restriction is specific to the internal listener, not a general firewall block.

- [ ] **Step 6: Confirm no dead references to the removed single-attempt endpoint remain**

Run: `git grep -n "settleIfExpired"` and `git grep -n "settle-if-expired"` (from repo root)
Expected: `settleIfExpired` matches only appear as part of `settleIfExpiredBatch` (the method name itself, e.g. `settleIfExpired(tx, ...)` inside `AttemptSettlementService`, which is unchanged and still correctly named for a single attempt — only the internal HTTP layer's method/endpoint changed) or `settleIfExpiredBatch` itself; `settle-if-expired` matches only appear as part of `settle-if-expired-batch`. No bare `settleIfExpired` HTTP client/controller method or `settle-if-expired` route (without the `-batch` suffix) should remain.

- [ ] **Step 7: Record final verification in the plan's tracking (no commit needed for this task — it's verification-only)**

If Steps 1-6 all pass cleanly, Phase 3c's implementation is complete and ready for the final whole-branch review.
