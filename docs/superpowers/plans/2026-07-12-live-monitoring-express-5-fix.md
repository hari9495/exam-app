# Live-Monitoring Express-5 Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore `apps/exam-runtime`'s live-monitoring (Socket.IO) feature, broken since Phase 6e's NestJS v10→v11 migration, and fix a separate, pre-existing bug in the same file.

**Architecture:** A targeted Express middleware in `apps/exam-runtime/src/main.ts` bypasses NestJS's own routing for `/socket.io/*` requests, leaving them for Engine.IO's already-registered request listener — directly countering the confirmed Express-5-synchronous-404-wins-the-race mechanism. A one-line fix in `MonitoringGateway.tickPresence()` corrects a `Namespace` vs `sockets.adapter` shape error. A version bump closes a related types/runtime mismatch in `apps/api`.

**Tech Stack:** NestJS 11, Express 5 (transitive), Socket.IO/Engine.IO, Jest/Supertest.

## Global Constraints

- This is a bug-fix plan, not a version-migration plan — no dependency version changes except `apps/api`'s `@types/express` bump (Task 3).
- `apps/api` has zero WebSocket gateway usage (confirmed via repo-wide grep) — no source changes there beyond the `@types/express` bump.
- `apps/exam-runtime`'s internal app (in the same `main.ts`, bootstrapped separately) has no WebSocket gateway (confirmed: `InternalAppModule` does not import `MonitoringModule`) — the middleware fix applies only to the public app's bootstrap.
- Required verification bar, matching this project's established discipline for this exact feature: `live-monitoring.e2e-spec.ts` must pass in isolation (not just "the full suite is green"), plus a live manual `socket.io-client` connection check against a real running dev server — this feature was silently broken in production before, so the automated suite alone is not sufficient proof.
- No custom Socket.IO `path` option exists anywhere in this codebase (confirmed via grep) — the middleware's `/socket.io/` prefix check matches Engine.IO's actual default configuration.

---

### Task 1: Fix the Express-5 request-routing race for Socket.IO

**Files:**
- Modify: `apps/exam-runtime/src/main.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: a working Socket.IO connection path, consumed by Task 4's verification (no code-level interface — this task's deliverable is purely behavioral).

- [ ] **Step 1: Add the middleware to the public app's bootstrap**

Modify `apps/exam-runtime/src/main.ts` — add the middleware immediately after `app.enableCors(...)` and before `app.useGlobalPipes(...)`:

```ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { InternalAppModule } from './internal-app.module';
import { resolveInternalBindHost } from './bootstrap-config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.WEB_ORIGIN, credentials: true });
  app.use((req: any, res: any, next: () => void) => {
    if (req.url.startsWith('/socket.io/')) return;
    next();
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  app.setGlobalPrefix('api/v1');
  await app.listen(process.env.EXAM_RUNTIME_PORT ?? 3002);

  const internalApp = await NestFactory.create(InternalAppModule);
  internalApp.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  internalApp.setGlobalPrefix('api/v1');
  await internalApp.listen(process.env.EXAM_RUNTIME_INTERNAL_PORT ?? 3003, resolveInternalBindHost());
}
bootstrap();
```

The `internalApp` bootstrap is deliberately untouched — it has no WebSocket gateway.

The `req`/`res`/`next` parameters are typed `any` here deliberately: `app.use()` on a NestJS `INestApplication` accepts a raw Express middleware, and importing Express's own `Request`/`Response`/`NextFunction` types here would be the only place in `apps/exam-runtime` doing so — matching the codebase's existing pattern of not adding a direct `express` type dependency to this workspace (it doesn't currently declare `@types/express`).

- [ ] **Step 2: Build apps/exam-runtime**

Run: `npm run build --workspace=apps/exam-runtime`
Expected: exit 0.

- [ ] **Step 3: Run the live-monitoring e2e spec in isolation**

Run: `npm run test:api:e2e -- --runInBand --testPathPattern=live-monitoring`
Expected: all 4 tests pass (previously: all 4 timed out at 30000ms). This is the primary proof this task works — do not proceed to Step 4 until this is genuinely green.

- [ ] **Step 4: Commit**

```bash
git add apps/exam-runtime/src/main.ts
git commit -m "fix: bypass NestJS routing for /socket.io/* to fix Express 5 race

Express 5's router now completes its own 404 for unmatched paths
synchronously, winning the race against Socket.IO's Engine.IO request
listener (always registered second on the shared httpServer, per
engine.io's own attach() implementation). This middleware lets
Socket.IO's own listener handle its requests instead."
```

---

### Task 2: Fix `tickPresence()`'s `Namespace` shape bug

**Files:**
- Modify: `apps/exam-runtime/src/monitoring/monitoring.gateway.ts:124`
- Test: `apps/exam-runtime/src/monitoring/monitoring.gateway.spec.ts`

**Interfaces:**
- Consumes: nothing from Task 1 (this is a separate, pre-existing bug in the same file).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Add this new `describe` block to `apps/exam-runtime/src/monitoring/monitoring.gateway.spec.ts`, after the existing `presence-tick interval lifecycle` block (before the final closing `});` of the outer `describe('MonitoringGateway', ...)`):

```ts
  describe('tickPresence via the interval (realistic Server shape)', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('reads rooms from server.adapter.rooms (real Socket.IO Namespace shape)', async () => {
      jest.useFakeTimers();
      const emit = jest.fn();
      const rooms = new Map([['exam:exam-1', new Set(['socket-1'])]]);
      (gateway as any).server = {
        adapter: { rooms },
        to: jest.fn().mockReturnValue({ emit }),
      };
      tenantPrisma.forTenant.mockImplementation((_context: unknown, fn: (tx: unknown) => unknown) =>
        Promise.resolve(fn({ exam: { findUnique: () => Promise.resolve({ id: 'exam-1', organizationId: 'org-1' }) } })),
      );
      monitoring.getRosterSnapshot.mockResolvedValue([
        { attemptId: 'attempt-1', candidateId: 'cand-1', online: true },
      ]);

      gateway.afterInit();
      await jest.advanceTimersByTimeAsync(PRESENCE_TICK_MS);

      expect(monitoring.getRosterSnapshot).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: false },
        'exam-1',
      );
      expect(emit).toHaveBeenCalledWith('roster:presence', {
        attemptId: 'attempt-1',
        candidateId: 'cand-1',
        online: true,
      });
    });
  });
```

This mocks `gateway.server` as a real Socket.IO `Namespace` shape (`.adapter.rooms`, `.to(room).emit(...)`) — not the incorrect `.sockets.adapter.rooms` shape the current buggy code expects. `tenantPrisma.forTenant`'s mock implementation actually invokes the callback it's given (mirroring the real `TenantPrismaService.forTenant` contract of calling `fn(tx)` and returning its result), since `tickPresence()`'s exam lookup depends on that callback actually running.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:exam-runtime -- --testPathPattern=monitoring.gateway`
Expected: FAIL — `monitoring.getRosterSnapshot` is never called, because `tickPresence()`'s `this.server.sockets.adapter.rooms` throws `TypeError: Cannot read properties of undefined (reading 'rooms')` (since the mock `server` has no `.sockets` property), caught silently by `afterInit()`'s own `.catch()`.

- [ ] **Step 3: Fix the bug**

Modify `apps/exam-runtime/src/monitoring/monitoring.gateway.ts:124`:

```ts
    const rooms = this.server.adapter.rooms;
```

(replacing `this.server.sockets.adapter.rooms`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:exam-runtime -- --testPathPattern=monitoring.gateway`
Expected: PASS, all tests in the file (including the new one and all pre-existing ones — confirm no regression in the other describe blocks).

- [ ] **Step 5: Run the full exam-runtime unit suite**

Run: `npm run test:exam-runtime`
Expected: all suites pass, count at or above the current baseline (164/164, 19 suites — this task adds exactly 1 new test, so expect 165/165).

- [ ] **Step 6: Commit**

```bash
git add apps/exam-runtime/src/monitoring/monitoring.gateway.ts apps/exam-runtime/src/monitoring/monitoring.gateway.spec.ts
git commit -m "fix: correct tickPresence() Socket.IO Namespace property access

this.server is a Namespace instance (@WebSocketGateway uses a
namespace), and Namespace.sockets is a Map with no .adapter property
-- the adapter lives directly on the namespace as .adapter. This threw
every 15 seconds (caught and logged), meaning the roster:presence
broadcast to staff dashboards has likely never worked at runtime."
```

---

### Task 3: Bump apps/api's `@types/express` to match the runtime Express 5

**Files:**
- Modify: `apps/api/package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: nothing from Tasks 1-2 (fully independent — apps/api has no WebSocket usage).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Bump the type package**

```bash
npm install --save-dev @types/express@^5.0.6 --workspace=apps/api
```

- [ ] **Step 2: Build apps/api**

Run: `npm run build --workspace=apps/api`
Expected: exit 0. If this surfaces new compile errors from the `@types/express` v5 shape (e.g. changed `Request`/`Response` generic signatures), read the actual error and apply the minimal correct fix to the specific line named — document what broke and why in the task report if this happens, since it's real, expected version-bump work, not a deviation.

- [ ] **Step 3: Run apps/api's unit suite**

Run: `npm run test:api`
Expected: all tests passing, at or above the 196/196 (23 suites) baseline — this is a types-only change with no runtime behavior difference, so no regression is expected.

- [ ] **Step 4: Commit**

```bash
git add apps/api/package.json package-lock.json
git commit -m "fix: bump @types/express to v5, matching the runtime express@5.2.1

apps/api's own express types were still v4 while the actual runtime
express (pulled transitively via @nestjs/platform-express@11) has
been v5 since Phase 6e's NestJS migration -- a types/runtime mismatch
noted but not addressed during that phase's own final review."
```

---

### Task 4: Final verification

**Files:** none — verification only, no code changes.

- [ ] **Step 1: Full apps/exam-runtime and apps/api unit suites**

Run: `npm run test:exam-runtime`
Expected: 165/165, 19 suites (164 baseline + 1 new test from Task 2).

Run: `npm run test:api`
Expected: 196/196, 23 suites (unaffected by this plan's changes, confirming no cross-workspace regression).

- [ ] **Step 2: Full e2e suite**

Run: `npm run test:api:e2e -- --runInBand`
Expected: 71/71, 16 suites — up from Phase 6e's disclosed 63/71. `live-monitoring.e2e-spec.ts`'s 4 tests must now pass (Task 1's fix). `tenant-isolation.e2e-spec.ts` is expected to still show its own separate, pre-existing, environmental failure (confirmed in Phase 6e as unrelated to any dependency or code change in this repo) — if this specific test is the only one still failing and it fails with the same `DATABASE_URL not found` error as before, that's expected and not a regression from this plan. Any OTHER failure is a genuine regression requiring investigation before proceeding.

- [ ] **Step 3: Live manual connection check**

Start `apps/exam-runtime`'s dev server (`npm run start:dev --workspace=apps/exam-runtime`, or run the compiled build directly per the pattern established in Phase 6e's Task 2 boot checks). Using a real `socket.io-client` (already a devDependency in both apps per existing e2e test infrastructure — reuse the same connection pattern `live-monitoring.e2e-spec.ts` itself uses, but against the live running server rather than the Jest-managed one), connect to the `/monitoring` namespace with a valid staff JWT and confirm:
1. The connection succeeds (no `websocket error`/`xhr poll error`, matching the exact failure mode Phase 6e's diagnosis captured).
2. Joining an exam room and receiving a `roster:snapshot` event works end-to-end.

Document the exact method used and its result in the task report.

- [ ] **Step 4: Confirm final repo state is clean**

Run: `git status --short`
Expected: only the pre-existing untracked `.claude/` directory.

Run: `git log --oneline` (last 4 commits)
Expected: exactly the 3 commits from Tasks 1-3, nothing unexpected.

No commit for this task — verification only, matching this project's established final-verification-task precedent.
