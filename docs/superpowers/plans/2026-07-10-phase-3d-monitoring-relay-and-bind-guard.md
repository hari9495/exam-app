# Phase 3d — Monitoring-Relay Removal & Internal Bind-Host Regression Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two entry criteria Phase 3c's own final review flagged: remove the `/monitoring-relay/*` endpoint's exposure on the public 0.0.0.0 listener by replacing the HTTP relay with an in-process event bus, and add an automated regression guard for the internal app's `127.0.0.1` default bind host.

**Architecture:** `apps/exam-runtime` runs its public app (candidate-facing, 0.0.0.0) and internal app (127.0.0.1) as two Nest applications in one Node process (established in Phase 3c). A new module-level singleton, `monitoringEventBus`, replaces the HTTP round-trip the internal app currently makes back into the public app's `MonitoringGateway`: the internal app's broadcaster publishes onto the bus, and a new public-app-only subscriber forwards bus events into `MonitoringGateway`. The `BroadcastRelayController` HTTP route this replaces is deleted outright — not hardened, removed. Separately, `main.ts`'s inline `?? '127.0.0.1'` default is extracted into a small pure function with its own unit test, so a future accidental change to that default fails a test instead of silently expanding the internal surface's reachability.

**Tech Stack:** Same as Phase 3a-3c — NestJS, Jest. No new dependencies (`EventEmitter` is a Node built-in).

## Global Constraints

- The internal app's default bind host stays `127.0.0.1` — this plan adds a regression guard for it, it does not change the default itself.
- `RemoteMonitoringBridgeModule`'s `ATTEMPT_STATUS_BROADCASTER` binding, and `LocalMonitoringBridgeModule`'s (used by the public app for its own in-process callers), keep their existing `@Global()` shape and the `AttemptStatusBroadcaster` interface (`emitAttemptStatus`, `emitMessageSent`) unchanged — only the internal app's concrete implementation class changes.
- `bootRuntimeApp()` in `apps/api/test/dual-app.ts` must keep its exact external contract (`Promise<{ app: INestApplication; port: number }>`) — the four existing dual-app e2e specs must require zero code changes.
- No new HTTP endpoint replaces `/monitoring-relay/*` — the fix is removing the route, not moving or re-authenticating it.
- Work happens directly on `main` (no feature branch) — established pattern for this project across every prior phase.
- This is a pure application-code change — no Prisma schema changes, no new migrations.
- Full spec: `docs/superpowers/specs/2026-07-10-phase-3d-monitoring-relay-and-bind-guard-design.md`. Full prior context: `docs/superpowers/plans/2026-07-09-phase-3c-internal-surface-hardening.md`.

---

## File Structure

```
apps/exam-runtime/
  src/
    main.ts                                                    # Modify: drop EXAM_RUNTIME_PUBLIC_URL, use resolveInternalBindHost()
    bootstrap-config.ts                                        # Create: resolveInternalBindHost()
    bootstrap-config.spec.ts                                   # Create
    monitoring/
      monitoring-event-bus.ts                                  # Create: shared in-process pub/sub singleton
      event-bus-attempt-status-broadcaster.ts                  # Create: replaces relaying-attempt-status-broadcaster.ts
      event-bus-attempt-status-broadcaster.spec.ts              # Create
      relaying-attempt-status-broadcaster.ts                    # Delete
      relaying-attempt-status-broadcaster.spec.ts                # Delete
      monitoring-event-bus-bridge.ts                            # Create: public-app-only bus subscriber
      monitoring-event-bus-bridge.spec.ts                       # Create
      broadcast-relay.controller.ts                             # Delete
      broadcast-relay.controller.spec.ts                        # Delete
      dto/relay-attempt-status.dto.ts                           # Delete
      dto/relay-message-sent.dto.ts                             # Delete
      monitoring.module.ts                                      # Modify: drop controller, add MonitoringEventBusBridge provider
      remote-monitoring-bridge.module.ts                        # Modify: bind to EventBusAttemptStatusBroadcaster
apps/api/
  test/
    dual-app.ts                                                 # Modify: drop EXAM_RUNTIME_PUBLIC_URL plumbing
```

---

### Task 1: Replace the HTTP monitoring relay with an in-process event bus

**Files:**
- Create: `apps/exam-runtime/src/monitoring/monitoring-event-bus.ts`
- Create: `apps/exam-runtime/src/monitoring/event-bus-attempt-status-broadcaster.ts`
- Create: `apps/exam-runtime/src/monitoring/event-bus-attempt-status-broadcaster.spec.ts`
- Create: `apps/exam-runtime/src/monitoring/monitoring-event-bus-bridge.ts`
- Create: `apps/exam-runtime/src/monitoring/monitoring-event-bus-bridge.spec.ts`
- Delete: `apps/exam-runtime/src/monitoring/relaying-attempt-status-broadcaster.ts`
- Delete: `apps/exam-runtime/src/monitoring/relaying-attempt-status-broadcaster.spec.ts`
- Delete: `apps/exam-runtime/src/monitoring/broadcast-relay.controller.ts`
- Delete: `apps/exam-runtime/src/monitoring/broadcast-relay.controller.spec.ts`
- Delete: `apps/exam-runtime/src/monitoring/dto/relay-attempt-status.dto.ts`
- Delete: `apps/exam-runtime/src/monitoring/dto/relay-message-sent.dto.ts`
- Modify: `apps/exam-runtime/src/monitoring/monitoring.module.ts`
- Modify: `apps/exam-runtime/src/monitoring/remote-monitoring-bridge.module.ts`
- Modify: `apps/exam-runtime/src/main.ts`
- Modify: `apps/api/test/dual-app.ts`

**Interfaces:**
- Consumes: `AttemptStatusBroadcaster` interface (`apps/exam-runtime/src/monitoring/attempt-status-broadcaster.ts`, unchanged: `emitAttemptStatus(examId, payload): Promise<void>`, `emitMessageSent(examId, payload): Promise<void>`), `MonitoringGateway.emitAttemptStatus`/`emitMessageSent` (unchanged, `apps/exam-runtime/src/monitoring/monitoring.gateway.ts`).
- Produces: `monitoringEventBus` (singleton export, `monitoring-event-bus.ts`) with `emitAttemptStatus(event)`, `onAttemptStatus(listener)`, `emitMessageSent(event)`, `onMessageSent(listener)`. `EventBusAttemptStatusBroadcaster` (implements `AttemptStatusBroadcaster`) — bound to `ATTEMPT_STATUS_BROADCASTER` in the internal app in place of the deleted `RelayingAttemptStatusBroadcaster`. `MonitoringEventBusBridge` (public-app-only `OnModuleInit` provider) — no other task depends on it directly; it's exercised via the e2e regression in Step 12.

This task bundles the new bus, both new classes, and every deletion/wiring change into one commit — splitting it would leave live-monitoring events from the internal app going nowhere in between (the old relay removed before its replacement is wired, or vice versa).

- [ ] **Step 1: Create the shared event bus**

`apps/exam-runtime/src/monitoring/monitoring-event-bus.ts`:
```typescript
import { EventEmitter } from 'events';

export interface AttemptStatusEvent {
  examId: string;
  attemptId: string;
  candidateId: string;
  status: string;
}

export interface MessageSentEvent {
  examId: string;
  attemptId: string;
  candidateId: string;
  sentAt: Date;
}

// Both exam-runtime Nest apps (public + internal, see main.ts) run in the same
// Node process — importing this module from either app's DI container resolves
// to this same singleton via Node's module cache. This is what lets the internal
// app publish monitoring events without an HTTP call back into the public app.
class MonitoringEventBus extends EventEmitter {
  emitAttemptStatus(event: AttemptStatusEvent): void {
    this.emit('attempt-status', event);
  }

  onAttemptStatus(listener: (event: AttemptStatusEvent) => void): void {
    this.on('attempt-status', listener);
  }

  emitMessageSent(event: MessageSentEvent): void {
    this.emit('message-sent', event);
  }

  onMessageSent(listener: (event: MessageSentEvent) => void): void {
    this.on('message-sent', listener);
  }
}

export const monitoringEventBus = new MonitoringEventBus();
```

This file has no dedicated spec — it's a thin, branch-free typed wrapper around `EventEmitter` (matches this codebase's existing convention of not unit-testing pure interface/token files like `attempt-status-broadcaster.ts`). Its behavior is exercised end-to-end by the broadcaster and bridge specs below.

- [ ] **Step 2: Write the failing broadcaster test**

`apps/exam-runtime/src/monitoring/event-bus-attempt-status-broadcaster.spec.ts`:
```typescript
import { EventBusAttemptStatusBroadcaster } from './event-bus-attempt-status-broadcaster';
import { monitoringEventBus } from './monitoring-event-bus';

describe('EventBusAttemptStatusBroadcaster', () => {
  let broadcaster: EventBusAttemptStatusBroadcaster;

  beforeEach(() => {
    broadcaster = new EventBusAttemptStatusBroadcaster();
  });

  afterEach(() => {
    monitoringEventBus.removeAllListeners();
  });

  describe('emitAttemptStatus', () => {
    it('publishes the payload on monitoringEventBus', async () => {
      const listener = jest.fn();
      monitoringEventBus.onAttemptStatus(listener);

      await broadcaster.emitAttemptStatus('exam-1', { attemptId: 'attempt-1', candidateId: 'cand-1', status: 'force_submitted' });

      expect(listener).toHaveBeenCalledWith({ examId: 'exam-1', attemptId: 'attempt-1', candidateId: 'cand-1', status: 'force_submitted' });
    });
  });

  describe('emitMessageSent', () => {
    it('publishes the payload on monitoringEventBus with sentAt kept as a Date instance', async () => {
      const listener = jest.fn();
      monitoringEventBus.onMessageSent(listener);
      const sentAt = new Date('2026-07-09T00:00:00.000Z');

      await broadcaster.emitMessageSent('exam-1', { attemptId: 'attempt-1', candidateId: 'cand-1', sentAt });

      expect(listener).toHaveBeenCalledWith({ examId: 'exam-1', attemptId: 'attempt-1', candidateId: 'cand-1', sentAt });
      expect(listener.mock.calls[0][0].sentAt).toBeInstanceOf(Date);
    });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:exam-runtime -- event-bus-attempt-status-broadcaster` (from repo root)
Expected: FAIL — `./event-bus-attempt-status-broadcaster` module doesn't exist yet.

- [ ] **Step 4: Implement the broadcaster**

`apps/exam-runtime/src/monitoring/event-bus-attempt-status-broadcaster.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { AttemptStatusBroadcaster } from './attempt-status-broadcaster';
import { monitoringEventBus } from './monitoring-event-bus';

@Injectable()
export class EventBusAttemptStatusBroadcaster implements AttemptStatusBroadcaster {
  async emitAttemptStatus(examId: string, payload: { attemptId: string; candidateId: string; status: string }): Promise<void> {
    monitoringEventBus.emitAttemptStatus({ examId, ...payload });
  }

  async emitMessageSent(examId: string, payload: { attemptId: string; candidateId: string; sentAt: Date }): Promise<void> {
    monitoringEventBus.emitMessageSent({ examId, ...payload });
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:exam-runtime -- event-bus-attempt-status-broadcaster`
Expected: `2 passed`.

- [ ] **Step 6: Write the failing bridge test**

`apps/exam-runtime/src/monitoring/monitoring-event-bus-bridge.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { MonitoringEventBusBridge } from './monitoring-event-bus-bridge';
import { MonitoringGateway } from './monitoring.gateway';
import { monitoringEventBus } from './monitoring-event-bus';

describe('MonitoringEventBusBridge', () => {
  let bridge: MonitoringEventBusBridge;
  let monitoringGateway: { emitAttemptStatus: jest.Mock; emitMessageSent: jest.Mock };

  beforeEach(async () => {
    monitoringGateway = { emitAttemptStatus: jest.fn(), emitMessageSent: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [MonitoringEventBusBridge, { provide: MonitoringGateway, useValue: monitoringGateway }],
    }).compile();
    bridge = moduleRef.get(MonitoringEventBusBridge);
    bridge.onModuleInit();
  });

  afterEach(() => {
    monitoringEventBus.removeAllListeners();
  });

  it('forwards attempt-status events from the bus into MonitoringGateway.emitAttemptStatus', () => {
    monitoringEventBus.emitAttemptStatus({ examId: 'exam-1', attemptId: 'attempt-1', candidateId: 'cand-1', status: 'force_submitted' });

    expect(monitoringGateway.emitAttemptStatus).toHaveBeenCalledWith('exam-1', {
      attemptId: 'attempt-1',
      candidateId: 'cand-1',
      status: 'force_submitted',
    });
  });

  it('forwards message-sent events from the bus into MonitoringGateway.emitMessageSent', () => {
    const sentAt = new Date('2026-07-09T00:00:00.000Z');
    monitoringEventBus.emitMessageSent({ examId: 'exam-1', attemptId: 'attempt-1', candidateId: 'cand-1', sentAt });

    expect(monitoringGateway.emitMessageSent).toHaveBeenCalledWith('exam-1', {
      attemptId: 'attempt-1',
      candidateId: 'cand-1',
      sentAt,
    });
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npm run test:exam-runtime -- monitoring-event-bus-bridge`
Expected: FAIL — `./monitoring-event-bus-bridge` module doesn't exist yet.

- [ ] **Step 8: Implement the bridge**

`apps/exam-runtime/src/monitoring/monitoring-event-bus-bridge.ts`:
```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { MonitoringGateway } from './monitoring.gateway';
import { monitoringEventBus } from './monitoring-event-bus';

@Injectable()
export class MonitoringEventBusBridge implements OnModuleInit {
  constructor(private readonly monitoringGateway: MonitoringGateway) {}

  onModuleInit(): void {
    monitoringEventBus.onAttemptStatus(({ examId, ...payload }) => this.monitoringGateway.emitAttemptStatus(examId, payload));
    monitoringEventBus.onMessageSent(({ examId, ...payload }) => this.monitoringGateway.emitMessageSent(examId, payload));
  }
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npm run test:exam-runtime -- monitoring-event-bus-bridge`
Expected: `2 passed`.

- [ ] **Step 10: Wire the new classes in, delete the old relay**

Replace `apps/exam-runtime/src/monitoring/monitoring.module.ts` in full:
```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MonitoringGateway } from './monitoring.gateway';
import { MonitoringService } from './monitoring.service';
import { MonitoringEventBusBridge } from './monitoring-event-bus-bridge';

@Module({
  imports: [JwtModule.register({})],
  providers: [MonitoringGateway, MonitoringService, MonitoringEventBusBridge],
  exports: [MonitoringGateway],
})
export class MonitoringModule {}
```

Replace `apps/exam-runtime/src/monitoring/remote-monitoring-bridge.module.ts` in full:
```typescript
import { Global, Module } from '@nestjs/common';
import { EventBusAttemptStatusBroadcaster } from './event-bus-attempt-status-broadcaster';
import { ATTEMPT_STATUS_BROADCASTER } from './attempt-status-broadcaster';

// Internal-app-only: binds ATTEMPT_STATUS_BROADCASTER to the in-process
// event-bus implementation, since this app has no MonitoringGateway/WebSocket
// connections of its own (see monitoring-event-bus-bridge.ts on the public
// app for the receiving end — both apps run in the same Node process, see
// main.ts). @Global() for the same reason as LocalMonitoringBridgeModule.
@Global()
@Module({
  providers: [{ provide: ATTEMPT_STATUS_BROADCASTER, useClass: EventBusAttemptStatusBroadcaster }],
  exports: [ATTEMPT_STATUS_BROADCASTER],
})
export class RemoteMonitoringBridgeModule {}
```

Delete these four files:
```bash
git rm apps/exam-runtime/src/monitoring/relaying-attempt-status-broadcaster.ts
git rm apps/exam-runtime/src/monitoring/relaying-attempt-status-broadcaster.spec.ts
git rm apps/exam-runtime/src/monitoring/broadcast-relay.controller.ts
git rm apps/exam-runtime/src/monitoring/broadcast-relay.controller.spec.ts
git rm apps/exam-runtime/src/monitoring/dto/relay-attempt-status.dto.ts
git rm apps/exam-runtime/src/monitoring/dto/relay-message-sent.dto.ts
```

In `apps/exam-runtime/src/main.ts`, remove the `EXAM_RUNTIME_PUBLIC_URL` assignment and its comment, and drop the now-unused `publicPort` intermediate variable. Replace the file in full:
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
(Task 2 changes the last line again to use `resolveInternalBindHost()` — leave the `?? '127.0.0.1'` literal here for now, this task's scope is only removing the `EXAM_RUNTIME_PUBLIC_URL` plumbing.)

In `apps/api/test/dual-app.ts`, remove the `EXAM_RUNTIME_PUBLIC_URL` assignment and its comment. Replace the file in full:
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
```

- [ ] **Step 11: Run the exam-runtime unit suite**

Run: `npm run test:exam-runtime` (from repo root)
Expected: all suites passing — no leftover references to the deleted `RelayingAttemptStatusBroadcaster`/`BroadcastRelayController`/DTOs anywhere (a dangling import would fail the build before tests even run).

- [ ] **Step 12: Run the api e2e suite, focusing on live-monitoring**

Run: `npm run test:api:e2e -- live-monitoring` (from repo root)
Expected: PASS — this spec drives an internal-app-triggered event (e.g. a force-submit or message-sent notification originating from an admin action through `apps/api`) through to a recruiter's connected socket. Passing here is the real proof the in-process bus correctly replaces the old HTTP relay across the app boundary, not just that the unit tests pass in isolation.

- [ ] **Step 13: Run the full api e2e suite**

Run: `npm run test:api:e2e` (from repo root)
Expected: all four dual-app specs passing, no regressions from the `dual-app.ts` change.

- [ ] **Step 14: Commit**

```bash
git add apps/exam-runtime/src/monitoring/monitoring-event-bus.ts apps/exam-runtime/src/monitoring/event-bus-attempt-status-broadcaster.ts apps/exam-runtime/src/monitoring/event-bus-attempt-status-broadcaster.spec.ts apps/exam-runtime/src/monitoring/monitoring-event-bus-bridge.ts apps/exam-runtime/src/monitoring/monitoring-event-bus-bridge.spec.ts apps/exam-runtime/src/monitoring/monitoring.module.ts apps/exam-runtime/src/monitoring/remote-monitoring-bridge.module.ts apps/exam-runtime/src/main.ts apps/api/test/dual-app.ts
git commit -m "refactor: replace HTTP monitoring relay with an in-process event bus, removing /monitoring-relay from the public listener"
```

Note: the `git rm` deletions from Step 10 are already staged by those commands; this `git add`/`commit` picks up the remaining modified/created files.

---

### Task 2: Internal bind-host regression guard

**Files:**
- Create: `apps/exam-runtime/src/bootstrap-config.ts`
- Create: `apps/exam-runtime/src/bootstrap-config.spec.ts`
- Modify: `apps/exam-runtime/src/main.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `resolveInternalBindHost(env?: NodeJS.ProcessEnv): string`, used by `main.ts`'s `bootstrap()`.

- [ ] **Step 1: Write the failing test**

`apps/exam-runtime/src/bootstrap-config.spec.ts`:
```typescript
import { resolveInternalBindHost } from './bootstrap-config';

describe('resolveInternalBindHost', () => {
  it('defaults to 127.0.0.1 when EXAM_RUNTIME_INTERNAL_HOST is unset', () => {
    expect(resolveInternalBindHost({})).toBe('127.0.0.1');
  });

  it('uses EXAM_RUNTIME_INTERNAL_HOST when set', () => {
    expect(resolveInternalBindHost({ EXAM_RUNTIME_INTERNAL_HOST: '10.0.0.5' })).toBe('10.0.0.5');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:exam-runtime -- bootstrap-config` (from repo root)
Expected: FAIL — `./bootstrap-config` module doesn't exist yet.

- [ ] **Step 3: Implement the resolver**

`apps/exam-runtime/src/bootstrap-config.ts`:
```typescript
export function resolveInternalBindHost(env: NodeJS.ProcessEnv = process.env): string {
  return env.EXAM_RUNTIME_INTERNAL_HOST ?? '127.0.0.1';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:exam-runtime -- bootstrap-config`
Expected: `2 passed`.

- [ ] **Step 5: Wire the resolver into `main.ts`**

In `apps/exam-runtime/src/main.ts`, add the import and replace the internal app's `listen` call. Replace the file in full:
```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { InternalAppModule } from './internal-app.module';
import { resolveInternalBindHost } from './bootstrap-config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.WEB_ORIGIN, credentials: true });
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

- [ ] **Step 6: Verify the exam-runtime build is clean**

Run (from `apps/exam-runtime/`): `npx nest build`
Expected: builds cleanly, no type errors.

- [ ] **Step 7: Run the exam-runtime unit suite**

Run: `npm run test:exam-runtime` (from repo root)
Expected: all suites passing, including the new `bootstrap-config.spec.ts`.

- [ ] **Step 8: Commit**

```bash
git add apps/exam-runtime/src/bootstrap-config.ts apps/exam-runtime/src/bootstrap-config.spec.ts apps/exam-runtime/src/main.ts
git commit -m "test: add regression guard for the internal app's 127.0.0.1 default bind host"
```

---

### Task 3: Final verification

**Files:** none — this task runs the full regression suite and confirms no dead references remain; no code changes expected unless verification surfaces a real gap, in which case follow the same TDD pattern as the task where the gap belongs.

**Interfaces:** none — this task consumes the full surface built across Tasks 1-2.

- [ ] **Step 1: Run the full exam-runtime unit suite**

Run: `npm run test:exam-runtime` (from repo root)
Expected: all suites passing.

- [ ] **Step 2: Run the full api unit suite**

Run: `npm run test:api` (from repo root)
Expected: all suites passing, no regressions (this task made no changes under `apps/api/src`, only `apps/api/test/dual-app.ts` in Task 1).

- [ ] **Step 3: Run the full api e2e suite**

Run: `npm run test:api:e2e` (from repo root)
Expected: all suites passing, including all four dual-app specs.

- [ ] **Step 4: Build both apps cleanly**

Run: `npx nest build` from `apps/exam-runtime/`, then from `apps/api/`.
Expected: both build with no errors.

- [ ] **Step 5: Confirm no dead references to the removed HTTP relay remain**

Run: `git grep -n "monitoring-relay"`, `git grep -n "EXAM_RUNTIME_PUBLIC_URL"`, `git grep -n "RelayingAttemptStatusBroadcaster"`, `git grep -n "BroadcastRelayController"` (from repo root)
Expected: no matches for any of the four. If any match remains, it's a leftover reference this plan missed — fix it directly (delete the reference or update it to the new `EventBusAttemptStatusBroadcaster`/`monitoringEventBus` names) before proceeding.

- [ ] **Step 6: Manual sanity check — internal bind host still loopback-only**

Repeats Phase 3c's manual check, now as a spot-check that Task 2's refactor didn't change runtime behavior (the automated guard in Task 2 covers the resolver function itself; this confirms the full `main.ts` wiring still behaves the same way end-to-end):

1. Start `apps/exam-runtime` locally: `npm run dev:exam-runtime` (from repo root).
2. Confirm the internal surface responds on loopback:
   ```bash
   curl -i -X POST http://127.0.0.1:3003/api/v1/internal/attempts/does-not-matter/reanalyze
   ```
   Expected: an HTTP response (401 Unauthorized — missing secret header), not a connection error.
3. Confirm `/monitoring-relay/*` no longer exists on the public port at all:
   ```bash
   curl -i -X POST http://127.0.0.1:3002/api/v1/monitoring-relay/attempt-status
   ```
   Expected: `404 Not Found` (the route is gone — not `401`, which would mean it still exists and is merely guarded).

- [ ] **Step 7: Record final verification (no commit needed for this task — it's verification-only)**

If Steps 1-6 all pass cleanly, Phase 3d's implementation is complete and ready for the final whole-branch review.
