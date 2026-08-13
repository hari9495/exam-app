# Production Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect production incidents before users report them, at $0/month recurring cost.

**Architecture:** Three independent layers. Sentry's free tier receives errors from all three apps — plugged in as a *second sink* inside the existing `SystemEventsExceptionFilter`, not as a new filter. UptimeRobot's free tier polls new health endpoints from outside the VM, because anything running on the VM reports nothing when the VM is what failed. `pm2-logrotate` caps unbounded local logs.

**Tech Stack:** NestJS 11, Next.js 16, TypeScript, Jest, `@sentry/node`, `@sentry/nextjs`, pm2.

**Spec:** `docs/superpowers/specs/2026-08-13-observability-design.md`

## Global Constraints

- **$0/month recurring.** Free tiers only. No paid plan, no new Azure resource.
- **No sustained disk writes added.** The VM's bottleneck is P6 burst-credit exhaustion, not CPU.
- **Observability must never be able to hurt the app.** Every capture path is fire-and-forget, swallows its own errors, and never converts a handled error into an unhandled one.
- **Fail closed on PII.** If building an event throws, drop the event. Never send unmapped data.
- **Inert by default.** No DSN configured means no telemetry, no crash, and a `warn` at boot so an inert deploy is distinguishable from "no errors occurred".
- **`sendDefaultPii: false`** must be set explicitly, never left to the SDK default.
- **The existing `system-events-exception.filter.spec.ts` suite must pass unmodified.** The DB sink's behaviour is not being changed.
- **Filter registration order in `apps/exam-runtime/src/app.module.ts` must not change.** `SystemEventsExceptionFilter` is registered before `ServerBusyRetryAfterFilter` deliberately; Nest matches global filters in reverse registration order.
- Event send cap: **20 per minute per process**. Health cache: **10 seconds**. Health per-check timeout: **2 seconds**.

## File Structure

**Create:**
- `packages/shared/src/observability/sentry-payload.ts` — pure functions: severity classification, allow-list payload building, rate limiting. No SDK dependency.
- `packages/shared/src/observability/sentry-payload.spec.ts`
- `packages/shared/src/observability/sentry-reporter.ts` — thin wrapper owning the SDK: init, inert-by-default, capture, flush.
- `packages/shared/src/observability/sentry-reporter.spec.ts`
- `packages/shared/src/health/health.service.ts` — dependency checks, timeouts, 10s cache.
- `packages/shared/src/health/health.service.spec.ts`
- `apps/api/src/health/health.controller.ts` + spec
- `apps/exam-runtime/src/health/health.controller.ts` + spec
- `apps/web/app/health/route.ts`
- `apps/web/sentry.client.config.ts`, `apps/web/sentry.server.config.ts`

**Modify:**
- `packages/shared/src/system-events/system-events-exception.filter.ts` — add optional 4th constructor arg (the reporter) and the second sink; add `attemptId` to `contextFrom()`.
- `packages/shared/src/index.ts` — export the new modules.
- `apps/api/src/app.module.ts:73-78` and `apps/exam-runtime/src/app.module.ts:46-56` — pass the reporter into the filter factory, register health controllers.
- `apps/api/src/main.ts`, `apps/exam-runtime/src/main.ts` — init Sentry, flush on shutdown.
- `apps/web/next.config.*` — Sentry Next.js wrapper.
- `.env.example` — document the new variables.

The pure/impure split is deliberate: everything worth testing lives in `sentry-payload.ts` with no SDK import, so the tests need no network, no mocking of a large SDK surface, and no fake timers.

---

### Task 1: Pure payload core — severity, allow-list, rate limit

**Files:**
- Create: `packages/shared/src/observability/sentry-payload.ts`
- Test: `packages/shared/src/observability/sentry-payload.spec.ts`

**Interfaces:**
- Consumes: `SystemEventEntry` from `packages/shared/src/system-events/system-events.service.ts` (fields used: `service`, `severity`, `message`, `organizationId`, `context`).
- Produces:
  - `type SeverityBand = 'immediate' | 'digest'`
  - `classifySeverity(service: string, hasAttempt: boolean): SeverityBand`
  - `buildSentryPayload(entry: SystemEventEntry): SentryPayload`
  - `interface SentryPayload { severityBand: SeverityBand; tags: Record<string, string> }`
  - `createRateLimiter(maxPerWindow: number, windowMs: number, now: () => number): () => boolean`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/shared/src/observability/sentry-payload.spec.ts
import { classifySeverity, buildSentryPayload, createRateLimiter } from './sentry-payload';
import type { SystemEventEntry } from '../system-events/system-events.service';

function entry(overrides: Partial<SystemEventEntry> = {}): SystemEventEntry {
  return {
    organizationId: 'org-1',
    service: 'api',
    severity: 'error',
    message: 'TypeError: boom',
    context: { status: 500, method: 'POST', route: '/api/v1/exams' },
    ...overrides,
  } as SystemEventEntry;
}

describe('classifySeverity', () => {
  it.each([
    ['exam-runtime', false, 'immediate'],
    ['exam-runtime', true, 'immediate'],
    ['api', true, 'immediate'],
    ['api', false, 'digest'],
    ['candidate-browser', false, 'digest'],
  ])('service=%s hasAttempt=%s -> %s', (service, hasAttempt, expected) => {
    expect(classifySeverity(service as string, hasAttempt as boolean)).toBe(expected);
  });
});

describe('buildSentryPayload', () => {
  it('bands an api error carrying an attemptId as immediate', () => {
    const payload = buildSentryPayload(entry({ context: { status: 500, attemptId: 'att-1' } }));
    expect(payload.severityBand).toBe('immediate');
    expect(payload.tags.attemptId).toBe('att-1');
  });

  it('bands an api error with no attempt as digest', () => {
    expect(buildSentryPayload(entry()).severityBand).toBe('digest');
  });

  // The load-bearing test. A field added to contextFrom() later for the system-events
  // console must NOT start leaving the infrastructure just because it was added.
  it('forwards only allow-listed context keys, dropping anything unrecognised', () => {
    const payload = buildSentryPayload(
      entry({
        context: {
          status: 500,
          method: 'POST',
          route: '/api/v1/attempts',
          userId: 'u-1',
          attemptId: 'att-1',
          invitationId: 'inv-1',
          // None of the following may ever reach Sentry:
          candidateEmail: 'candidate@example.com',
          candidateName: 'Jane Doe',
          answerText: 'the answer is 42',
          authorization: 'Bearer secret-token',
          cookie: 'session=abc',
          body: { password: 'hunter2' },
          stack: 'TypeError: boom\n    at /app/src/thing.ts:1:1',
        },
      }),
    );

    expect(Object.keys(payload.tags).sort()).toEqual(
      ['attemptId', 'invitationId', 'method', 'organizationId', 'route', 'service', 'severity_band', 'status', 'userId'].sort(),
    );
    const serialised = JSON.stringify(payload);
    for (const leak of ['candidate@example.com', 'Jane Doe', 'the answer is 42', 'secret-token', 'session=abc', 'hunter2']) {
      expect(serialised).not.toContain(leak);
    }
  });

  it('omits the userId tag when absent rather than emitting the string "undefined"', () => {
    const payload = buildSentryPayload(entry({ context: { status: 500 } }));
    expect(payload.tags).not.toHaveProperty('userId');
    expect(Object.values(payload.tags)).not.toContain('undefined');
  });
});

describe('createRateLimiter', () => {
  it('allows up to the cap then blocks within the same window', () => {
    let t = 1000;
    const allow = createRateLimiter(3, 60_000, () => t);
    expect([allow(), allow(), allow()]).toEqual([true, true, true]);
    expect(allow()).toBe(false);
  });

  it('resets once the window elapses', () => {
    let t = 1000;
    const allow = createRateLimiter(1, 60_000, () => t);
    expect(allow()).toBe(true);
    expect(allow()).toBe(false);
    t += 60_000;
    expect(allow()).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config packages/shared/jest.config.js --testPathPattern sentry-payload`
Expected: FAIL — `Cannot find module './sentry-payload'`

- [ ] **Step 3: Implement**

```typescript
// packages/shared/src/observability/sentry-payload.ts
import type { SystemEventEntry } from '../system-events/system-events.service';

export type SeverityBand = 'immediate' | 'digest';

export interface SentryPayload {
  severityBand: SeverityBand;
  tags: Record<string, string>;
}

// Allow-list, never a deny-list. A deny-list leaks the first PII field someone adds and
// forgets to list; this fails safe by construction. `stack` is deliberately absent -- the
// stack travels as the Sentry exception itself, not as an indexed tag.
const ALLOWED_CONTEXT_KEYS = ['status', 'method', 'route', 'attemptId', 'invitationId', 'userId'] as const;

// exam-runtime IS the candidate path by construction, and an error carrying an attemptId is
// by definition hurting someone mid-exam -- which is unrecoverable, unlike a recruiter
// retrying a page. Deriving the band this way costs zero extra queries; the alternative
// (querying for live attempts) would put a database round trip on the error path.
export function classifySeverity(service: string, hasAttempt: boolean): SeverityBand {
  return service === 'exam-runtime' || hasAttempt ? 'immediate' : 'digest';
}

export function buildSentryPayload(entry: SystemEventEntry): SentryPayload {
  const context = (entry.context ?? {}) as Record<string, unknown>;
  const hasAttempt = typeof context.attemptId === 'string' && context.attemptId.length > 0;
  const severityBand = classifySeverity(entry.service, hasAttempt);

  const tags: Record<string, string> = { service: entry.service, severity_band: severityBand };
  if (entry.organizationId) tags.organizationId = entry.organizationId;
  for (const key of ALLOWED_CONTEXT_KEYS) {
    const value = context[key];
    if (value !== undefined && value !== null) tags[key] = String(value);
  }
  return { severityBand, tags };
}

// `now` is injected so the tests need no fake timers.
export function createRateLimiter(maxPerWindow: number, windowMs: number, now: () => number): () => boolean {
  let windowStart = now();
  let count = 0;
  return function allow(): boolean {
    const t = now();
    if (t - windowStart >= windowMs) {
      windowStart = t;
      count = 0;
    }
    if (count >= maxPerWindow) return false;
    count += 1;
    return true;
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config packages/shared/jest.config.js --testPathPattern sentry-payload`
Expected: PASS, 8 tests.

- [ ] **Step 5: Mutation-check the allow-list test**

Temporarily change `ALLOWED_CONTEXT_KEYS` to include `'candidateEmail'`, re-run, and confirm the allow-list test **fails**. Restore. A scrubber test that passes against a leaking scrubber is worse than none — it buys false confidence about PII.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/observability/sentry-payload.ts packages/shared/src/observability/sentry-payload.spec.ts
git commit -m "feat(observability): pure payload core for Sentry reporting"
```

---

### Task 2: Sentry reporter — SDK wrapper, inert by default, fail closed

**Files:**
- Create: `packages/shared/src/observability/sentry-reporter.ts`
- Test: `packages/shared/src/observability/sentry-reporter.spec.ts`
- Modify: `packages/shared/package.json` (add `@sentry/node`)

**Interfaces:**
- Consumes: `buildSentryPayload`, `createRateLimiter` from Task 1.
- Produces:
  - `class SentryReporter` with `init(): void`, `capture(entry: SystemEventEntry, exception: unknown): void`, `flush(timeoutMs: number): Promise<void>`, `get enabled(): boolean`

- [ ] **Step 1: Install the SDK**

```bash
npm install @sentry/node --workspace=packages/shared
```

Then verify the Monaco pin is intact — `npm install` has silently removed it twice before:

```bash
node apps/web/scripts/copy-monaco.mjs
```

Expected: succeeds (it asserts the AMD sentinel). If it fails, run `npm install monaco-editor@0.52.2 --workspace=apps/web --no-save` and re-run.

- [ ] **Step 2: Write the failing tests**

```typescript
// packages/shared/src/observability/sentry-reporter.spec.ts
import * as Sentry from '@sentry/node';
import { SentryReporter } from './sentry-reporter';
import type { SystemEventEntry } from '../system-events/system-events.service';

jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  flush: jest.fn().mockResolvedValue(true),
}));

const entry: SystemEventEntry = {
  organizationId: 'org-1',
  service: 'api',
  severity: 'error',
  message: 'TypeError: boom',
  context: { status: 500 },
} as SystemEventEntry;

describe('SentryReporter', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV };
    delete process.env.SENTRY_DSN;
  });
  afterAll(() => { process.env = OLD_ENV; });

  it('stays inert and does not throw when no DSN is configured', () => {
    const reporter = new SentryReporter();
    expect(() => reporter.init()).not.toThrow();
    expect(reporter.enabled).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
    reporter.capture(entry, new Error('boom'));
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('initialises with sendDefaultPii disabled explicitly', () => {
    process.env.SENTRY_DSN = 'https://key@example.invalid/1';
    new SentryReporter().init();
    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ sendDefaultPii: false }));
  });

  it('captures with allow-listed tags once enabled', () => {
    process.env.SENTRY_DSN = 'https://key@example.invalid/1';
    const reporter = new SentryReporter();
    reporter.init();
    reporter.capture(entry, new Error('boom'));
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: expect.objectContaining({ service: 'api', severity_band: 'digest' }) }),
    );
  });

  it('drops the event and does not throw when payload building fails', () => {
    process.env.SENTRY_DSN = 'https://key@example.invalid/1';
    const reporter = new SentryReporter();
    reporter.init();
    // A getter that throws simulates a bug in payload construction.
    const poisoned = { get service() { throw new Error('payload bug'); } } as unknown as SystemEventEntry;
    expect(() => reporter.capture(poisoned, new Error('boom'))).not.toThrow();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('stops sending past the per-minute cap but never throws', () => {
    process.env.SENTRY_DSN = 'https://key@example.invalid/1';
    const reporter = new SentryReporter(2, 60_000);
    reporter.init();
    for (let i = 0; i < 5; i += 1) reporter.capture(entry, new Error('boom'));
    expect((Sentry.captureException as jest.Mock).mock.calls).toHaveLength(2);
  });

  it('flush resolves even when disabled', async () => {
    await expect(new SentryReporter().flush(100)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest --config packages/shared/jest.config.js --testPathPattern sentry-reporter`
Expected: FAIL — `Cannot find module './sentry-reporter'`

- [ ] **Step 4: Implement**

```typescript
// packages/shared/src/observability/sentry-reporter.ts
import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import type { SystemEventEntry } from '../system-events/system-events.service';
import { buildSentryPayload, createRateLimiter } from './sentry-payload';

// Second sink alongside the system_events table. It exists because that table lives in the
// database that is often the failing dependency, nothing watches it, and it cannot alert.
//
// Every method here is defensive on purpose: this runs inside an exception filter, so a
// throw would convert a handled error into an unhandled one -- turning the monitoring into
// the outage.
export class SentryReporter {
  private readonly logger = new Logger(SentryReporter.name);
  private readonly allow: () => boolean;
  private active = false;

  constructor(maxPerWindow = 20, windowMs = 60_000) {
    this.allow = createRateLimiter(maxPerWindow, windowMs, () => Date.now());
  }

  get enabled(): boolean {
    return this.active;
  }

  init(): void {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) {
      // Deliberate, and mirrors FaceEmbedderService: without this line a silently-inert
      // deployment is indistinguishable from "no errors have ever occurred".
      this.logger.warn('Sentry DSN not configured (SENTRY_DSN=unset); external error reporting is disabled');
      return;
    }
    try {
      Sentry.init({
        dsn,
        environment: process.env.SENTRY_ENVIRONMENT ?? 'production',
        // Never rely on the SDK default here: the filter is careful never to read request
        // bodies, headers or cookies, and default PII would attach them anyway.
        sendDefaultPii: false,
        tracesSampleRate: 0,
      });
      this.active = true;
    } catch (error) {
      this.logger.warn(`Sentry init failed; error reporting is disabled: ${String(error)}`);
    }
  }

  capture(entry: SystemEventEntry, exception: unknown): void {
    if (!this.active) return;
    try {
      // Rate-limited inside the try so a limiter bug cannot escape either. Over the cap the
      // event is dropped from the SEND only -- SystemEventsService.record() has already
      // logged and persisted it, so nothing is lost, only quota is saved.
      if (!this.allow()) return;
      const payload = buildSentryPayload(entry);
      Sentry.captureException(exception, { tags: payload.tags });
    } catch {
      // Fail closed: drop the event rather than send something unmapped.
    }
  }

  async flush(timeoutMs: number): Promise<void> {
    if (!this.active) return;
    try {
      await Sentry.flush(timeoutMs);
    } catch {
      // Shutdown must not fail because telemetry could not drain.
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest --config packages/shared/jest.config.js --testPathPattern sentry-reporter`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/observability/sentry-reporter.ts packages/shared/src/observability/sentry-reporter.spec.ts package.json package-lock.json packages/shared/package.json
git commit -m "feat(observability): Sentry reporter, inert by default and fail-closed"
```

---

### Task 3: Second sink in the existing filter, plus `attemptId` context

**Files:**
- Modify: `packages/shared/src/system-events/system-events-exception.filter.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/system-events/system-events-exception.filter.spec.ts` (append; existing tests must stay untouched and passing)

**Interfaces:**
- Consumes: `SentryReporter` from Task 2.
- Produces: `SystemEventsExceptionFilter` constructor gains an **optional** 4th parameter `reporter?: SentryReporter`. Optional specifically so every existing 3-argument construction — including the whole existing spec file — still compiles and passes unmodified.

- [ ] **Step 1: Write the failing tests (append to the existing spec)**

```typescript
// Append to packages/shared/src/system-events/system-events-exception.filter.spec.ts
import { SentryReporter } from '../observability/sentry-reporter';

describe('SystemEventsExceptionFilter — Sentry sink', () => {
  let record: jest.Mock;
  let capture: jest.Mock;
  let superCatch: jest.SpyInstance;

  function httpHost(request: Record<string, unknown> = {}): ArgumentsHost {
    return {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
    } as unknown as ArgumentsHost;
  }

  function makeFilter() {
    record = jest.fn().mockResolvedValue(undefined);
    capture = jest.fn();
    return new SystemEventsExceptionFilter(
      { httpAdapter: {} } as never,
      { record } as unknown as SystemEventsService,
      'api',
      { capture } as unknown as SentryReporter,
    );
  }

  beforeEach(() => {
    superCatch = jest
      .spyOn(Object.getPrototypeOf(SystemEventsExceptionFilter.prototype), 'catch')
      .mockImplementation(() => undefined);
  });
  afterEach(() => superCatch.mockRestore());

  it('reports to both sinks for an unhandled crash', () => {
    const filter = makeFilter();
    filter.catch(new TypeError('boom'), httpHost({ method: 'GET', originalUrl: '/api/v1/exams' }));
    expect(record).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('does not report 4xx to Sentry, matching the DB sink', () => {
    const filter = makeFilter();
    filter.catch(new BadRequestException('nope'), httpHost());
    expect(record).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  it('includes attemptId in the recorded context when the request carries one', () => {
    const filter = makeFilter();
    filter.catch(new TypeError('boom'), httpHost({ user: { attemptId: 'att-9' } }));
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.objectContaining({ attemptId: 'att-9' }) }),
    );
  });

  it('still records to the DB when the Sentry sink throws', () => {
    record = jest.fn().mockResolvedValue(undefined);
    const filter = new SystemEventsExceptionFilter(
      { httpAdapter: {} } as never,
      { record } as unknown as SystemEventsService,
      'api',
      { capture: () => { throw new Error('sentry down'); } } as unknown as SentryReporter,
    );
    expect(() => filter.catch(new TypeError('boom'), httpHost())).not.toThrow();
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('works with no reporter supplied at all', () => {
    const localRecord = jest.fn().mockResolvedValue(undefined);
    const filter = new SystemEventsExceptionFilter(
      { httpAdapter: {} } as never,
      { record: localRecord } as unknown as SystemEventsService,
      'api',
    );
    expect(() => filter.catch(new TypeError('boom'), httpHost())).not.toThrow();
    expect(localRecord).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config packages/shared/jest.config.js --testPathPattern system-events-exception`
Expected: the new block FAILS (`capture` never called); the pre-existing tests in the same file still PASS.

- [ ] **Step 3: Implement**

In `packages/shared/src/system-events/system-events-exception.filter.ts`, add the import:

```typescript
import { SentryReporter } from '../observability/sentry-reporter';
```

Change the constructor to take an optional reporter:

```typescript
  constructor(
    httpAdapterHost: HttpAdapterHost,
    private readonly systemEvents: SystemEventsService,
    private readonly serviceName: Extract<SystemEventService, 'api' | 'exam-runtime'>,
    // Optional so every existing 3-arg construction keeps compiling, and so a deployment
    // with no DSN needs no wiring change at all.
    private readonly reporter?: SentryReporter,
  ) {
    super(httpAdapterHost.httpAdapter);
  }
```

In `catch()`, replace the single-sink block with two sinks built from one entry:

```typescript
  catch(exception: unknown, host: ArgumentsHost): void {
    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : 500;
    if (!isHttp || status >= 500) {
      const entry = {
        organizationId: this.organizationIdFrom(host),
        service: this.serviceName,
        severity: 'error' as const,
        message: exception instanceof Error ? `${exception.name}: ${exception.message}` : String(exception),
        context: this.contextFrom(host, status, exception),
      };
      // Fire-and-forget: record() never throws, and the response must not wait on it.
      void this.systemEvents.record(entry);
      // Second sink. Wrapped because the two must not be able to fail each other: a Sentry
      // outage must not stop the audit trail, and a database outage -- the case where
      // external reporting matters most -- must not stop the Sentry send.
      try {
        this.reporter?.capture(entry, exception);
      } catch {
        // SentryReporter.capture already swallows; this is belt-and-braces for the
        // constructor-injected fake and for any future reporter implementation.
      }
    }
    super.catch(exception, host);
  }
```

In `contextFrom()`, add `attemptId` to the request destructuring type and emit it:

```typescript
      const req = host.switchToHttp().getRequest() as {
        method?: string;
        originalUrl?: string;
        user?: { invitationId?: unknown; userId?: unknown; sub?: unknown; attemptId?: unknown };
      };
      if (req.method) context.method = req.method;
      if (req.originalUrl) context.route = req.originalUrl;
      if (typeof req.user?.invitationId === 'string') context.invitationId = req.user.invitationId;
      // Added for severity banding: an error carrying an attemptId is hurting a candidate
      // mid-exam. Opaque id, consistent with the rest of this allow-list.
      if (typeof req.user?.attemptId === 'string') context.attemptId = req.user.attemptId;
      const userId = req.user?.userId ?? req.user?.sub;
      if (typeof userId === 'string') context.userId = userId;
```

Add to `packages/shared/src/index.ts`:

```typescript
export * from './observability/sentry-payload';
export * from './observability/sentry-reporter';
```

- [ ] **Step 4: Run the full shared suite**

Run: `npx jest --config packages/shared/jest.config.js`
Expected: PASS. The pre-existing `system-events-exception.filter.spec.ts` tests must be **unmodified** and green — confirm with `git diff` that only additions were made to that file.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/system-events/system-events-exception.filter.ts packages/shared/src/system-events/system-events-exception.filter.spec.ts packages/shared/src/index.ts
git commit -m "feat(observability): report unhandled errors to Sentry alongside system_events"
```

---

### Task 4: Health service and backend endpoints

**Files:**
- Create: `packages/shared/src/health/health.service.ts`, `packages/shared/src/health/health.service.spec.ts`
- Create: `apps/api/src/health/health.controller.ts`, `apps/api/src/health/health.controller.spec.ts`
- Create: `apps/exam-runtime/src/health/health.controller.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/exam-runtime/src/app.module.ts` (register controllers), `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `class HealthService` with `constructor(deps: HealthDeps)` and `check(): Promise<boolean>`, where `interface HealthDeps { checkDb: () => Promise<unknown>; checkRedis: () => Promise<unknown>; now?: () => number; cacheMs?: number; timeoutMs?: number }`

**Context the implementer needs:** there is **no global auth guard** in either app — only `FailOpenThrottlerGuard` (a throttler) — so a plain controller is public by default and needs no exemption decorator. `api` uses `setGlobalPrefix('api/v1')`, so a `@Controller('health')` is served at `/api/v1/health`.

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/shared/src/health/health.service.spec.ts
import { HealthService } from './health.service';

const ok = () => Promise.resolve(1);
const fail = () => Promise.reject(new Error('down'));

describe('HealthService', () => {
  it('returns true when every dependency responds', async () => {
    await expect(new HealthService({ checkDb: ok, checkRedis: ok }).check()).resolves.toBe(true);
  });

  it('returns false when the database is down', async () => {
    await expect(new HealthService({ checkDb: fail, checkRedis: ok }).check()).resolves.toBe(false);
  });

  it('returns false when redis is down', async () => {
    await expect(new HealthService({ checkDb: ok, checkRedis: fail }).check()).resolves.toBe(false);
  });

  it('returns false rather than hanging when a dependency never settles', async () => {
    const never = () => new Promise(() => undefined);
    const service = new HealthService({ checkDb: never, checkRedis: ok, timeoutMs: 10 });
    await expect(service.check()).resolves.toBe(false);
  });

  // The endpoint is public and touches the DB; without this cache it is a free
  // load-amplifier for anyone who finds the URL.
  it('checks dependencies once per cache window, not once per request', async () => {
    const checkDb = jest.fn(ok);
    let t = 0;
    const service = new HealthService({ checkDb, checkRedis: ok, now: () => t, cacheMs: 10_000 });
    await service.check();
    await service.check();
    await service.check();
    expect(checkDb).toHaveBeenCalledTimes(1);
    t += 10_000;
    await service.check();
    expect(checkDb).toHaveBeenCalledTimes(2);
  });
});
```

```typescript
// apps/api/src/health/health.controller.spec.ts
import { HealthController } from './health.controller';
import { HealthService } from '@exam-platform/shared';

describe('HealthController', () => {
  function res() {
    const r: { code?: number; body?: unknown; status: (c: number) => typeof r; json: (b: unknown) => void } = {
      status(c) { r.code = c; return r; },
      json(b) { r.body = b; },
    } as never;
    return r;
  }

  it('answers 200 with a minimal ok body when healthy', async () => {
    const controller = new HealthController({ check: async () => true } as HealthService);
    const r = res();
    await controller.check(r as never);
    expect(r.code).toBe(200);
    expect(r.body).toEqual({ status: 'ok' });
  });

  it('answers 503 when unhealthy', async () => {
    const controller = new HealthController({ check: async () => false } as HealthService);
    const r = res();
    await controller.check(r as never);
    expect(r.code).toBe(503);
  });

  // A public endpoint reporting "db: down" is free reconnaissance. Which dependency failed
  // belongs in the logs and in Sentry, never in the response body.
  it('never names the failing dependency in the response', async () => {
    const controller = new HealthController({ check: async () => false } as HealthService);
    const r = res();
    await controller.check(r as never);
    const serialised = JSON.stringify(r.body).toLowerCase();
    expect(serialised).not.toContain('db');
    expect(serialised).not.toContain('database');
    expect(serialised).not.toContain('redis');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config packages/shared/jest.config.js --testPathPattern health` and `npx jest --config apps/api/jest.config.js --testPathPattern health`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the shared service**

```typescript
// packages/shared/src/health/health.service.ts
export interface HealthDeps {
  checkDb: () => Promise<unknown>;
  checkRedis: () => Promise<unknown>;
  now?: () => number;
  cacheMs?: number;
  timeoutMs?: number;
}

// Liveness for external uptime monitoring. Deliberately NOT run through
// TenantPrismaService.forTenant: this is not tenant-scoped work, and forTenant would consume
// a pooled connection from the pool that is already the concurrency ceiling.
export class HealthService {
  private readonly now: () => number;
  private readonly cacheMs: number;
  private readonly timeoutMs: number;
  private cached: { at: number; ok: boolean } | null = null;

  constructor(private readonly deps: HealthDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.cacheMs = deps.cacheMs ?? 10_000;
    this.timeoutMs = deps.timeoutMs ?? 2_000;
  }

  async check(): Promise<boolean> {
    const cached = this.cached;
    if (cached && this.now() - cached.at < this.cacheMs) return cached.ok;
    const ok = await this.run();
    this.cached = { at: this.now(), ok };
    return ok;
  }

  private async run(): Promise<boolean> {
    const results = await Promise.all([
      this.settle(this.deps.checkDb),
      this.settle(this.deps.checkRedis),
    ]);
    return results.every(Boolean);
  }

  // A hung dependency must fail the check rather than hang it -- otherwise the monitor times
  // out with no signal and the request holds a connection open the whole time.
  private async settle(check: () => Promise<unknown>): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('health check timed out')), this.timeoutMs);
      });
      await Promise.race([check(), timeout]);
      return true;
    } catch {
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
```

Export it from `packages/shared/src/index.ts`:

```typescript
export * from './health/health.service';
```

- [ ] **Step 4: Implement the api controller**

```typescript
// apps/api/src/health/health.controller.ts
import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from '@exam-platform/shared';

// Public by design -- external uptime monitoring cannot authenticate. There is no global
// auth guard in this app, so no exemption decorator is needed.
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async check(@Res() res: Response): Promise<void> {
    const ok = await this.health.check();
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded' });
  }
}
```

- [ ] **Step 5: Register in both app modules**

In `apps/api/src/app.module.ts`, add `HealthController` to `controllers` and provide `HealthService`. Add `import Redis from 'ioredis';`:

```typescript
    {
      provide: HealthService,
      useFactory: (prisma: PrismaService) => {
        // Created ONCE here, not inside checkRedis. Constructing per check would open a new
        // socket on every health poll -- a connection leak driven by the monitor itself, at
        // 3 monitors x every 5 minutes, forever.
        //
        // Deliberately NOT createRedisConnection() from ./jobs/redis-connection, even though
        // that helper exists two directories away. It sets maxRetriesPerRequest: null because
        // BullMQ's blocking commands require it, and under an extended Redis outage that makes
        // ping() never reject -- ioredis parks it in the offline queue awaiting reconnection.
        // The endpoint would still 503 correctly on the 2s race timeout, but every cache-miss
        // poll would leave another permanently-pending command queued, accumulating without
        // bound during exactly the outage this endpoint exists to detect.
        const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
        return new HealthService({
          checkDb: () => prisma.$queryRaw`SELECT 1`,
          checkRedis: () => redis.ping(),
        });
      },
      inject: [PrismaService],
    },
```

For `apps/exam-runtime/src/app.module.ts`, create the equivalent controller at `apps/exam-runtime/src/health/health.controller.ts` with an identical body (repeat it rather than sharing — each app's module wiring differs and the file is nine lines).

**exam-runtime has no `redis-connection.ts` helper** — it only constructs ad-hoc clients in `code-execution/run-limiter.ts`. Build its connection inline in the same single-construction shape:

```typescript
    {
      provide: HealthService,
      useFactory: (prisma: PrismaService) => {
        const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
        return new HealthService({
          checkDb: () => prisma.$queryRaw`SELECT 1`,
          checkRedis: () => redis.ping(),
        });
      },
      inject: [PrismaService],
    },
```

with `import Redis from 'ioredis';` at the top. Do **not** add `maxRetriesPerRequest: null` here — that option exists in api's factory only because BullMQ's blocking commands require it, and it is wrong for a health probe, where you want a failing connection to reject rather than retry indefinitely.

**Do not reorder the `providers` array entries for `APP_FILTER` in exam-runtime.** Append only.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest --config packages/shared/jest.config.js --testPathPattern health && npx jest --config apps/api/jest.config.js --testPathPattern health`
Expected: PASS, 8 tests total.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/health apps/api/src/health apps/exam-runtime/src/health packages/shared/src/index.ts apps/api/src/app.module.ts apps/exam-runtime/src/app.module.ts
git commit -m "feat(observability): health endpoints with dependency checks and a 10s cache"
```

---

### Task 5: Bootstrap wiring and shutdown flush

**Files:**
- Modify: `apps/api/src/main.ts`, `apps/exam-runtime/src/main.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/exam-runtime/src/app.module.ts` (pass the reporter to the filter factory)
- Modify: `.env.example`

**Interfaces:**
- Consumes: `SentryReporter` (Task 2), `SystemEventsExceptionFilter`'s optional 4th arg (Task 3).

- [ ] **Step 1: Provide a single reporter instance per app**

In `apps/api/src/app.module.ts`, add to `providers` and pass it into the existing filter factory:

```typescript
    { provide: SentryReporter, useFactory: () => { const r = new SentryReporter(); r.init(); return r; } },
    {
      provide: APP_FILTER,
      useFactory: (adapterHost: HttpAdapterHost, systemEvents: SystemEventsService, reporter: SentryReporter) =>
        new SystemEventsExceptionFilter(adapterHost, systemEvents, 'api', reporter),
      inject: [HttpAdapterHost, SystemEventsService, SentryReporter],
    },
```

Apply the identical change in `apps/exam-runtime/src/app.module.ts`, with `'exam-runtime'` as the service name. **Keep `ServerBusyRetryAfterFilter` registered last** — the ordering comment in that file explains why, and changing it silently breaks the `server_busy` 503 contract.

- [ ] **Step 2: Flush on shutdown**

`apps/api/src/main.ts` already calls `app.enableShutdownHooks()` at line 16. Add flushing so in-flight events are not lost on every deploy restart:

```typescript
  const reporter = app.get(SentryReporter);
  app.enableShutdownHooks();
  process.on('beforeExit', () => { void reporter.flush(2000); });
```

Apply the equivalent in `apps/exam-runtime/src/main.ts`.

- [ ] **Step 3: Document the variables**

Append to `.env.example`:

```
# Observability. Leave SENTRY_DSN unset to disable external error reporting entirely --
# the app logs a warning at boot so an inert deployment is distinguishable from silence.
SENTRY_DSN=
SENTRY_ENVIRONMENT=production
```

- [ ] **Step 4: Verify both apps still boot and the filters still behave**

Run the regression that this task most risks breaking, explicitly and first:

```bash
npx jest --config apps/exam-runtime/jest.config.js --testPathPattern server-busy-retry-after
```

Expected: PASS, 4 tests. `apps/exam-runtime/src/server-busy-retry-after.filter.spec.ts` already exists and pins the `server_busy` 503 + `Retry-After` contract. If this goes red, the filter registration order was changed — revert to `SystemEventsExceptionFilter` first, `ServerBusyRetryAfterFilter` last.

Then the full suites:

```bash
npx jest --config apps/api/jest.config.js && npx jest --config apps/exam-runtime/jest.config.js
```

Expected: PASS — api 879+ tests, exam-runtime 691+ tests.

Run: `npx tsc --noEmit -p apps/api/tsconfig.json && npx tsc --noEmit -p apps/exam-runtime/tsconfig.json`
Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/main.ts apps/exam-runtime/src/main.ts apps/api/src/app.module.ts apps/exam-runtime/src/app.module.ts .env.example
git commit -m "feat(observability): wire the Sentry reporter into both backends"
```

---

### Task 6: Web — health route and frontend error tracking

**Files:**
- Create: `apps/web/app/health/route.ts`
- Create: Sentry init files — **exact filenames depend on the installed SDK version, see Step 3**
- Modify: `apps/web/next.config.js` (note: `.js` CommonJS, not `.ts`)

**CRITICAL — `next.config.js` currently reads:**

```javascript
/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  output: 'standalone',
};
```

`output: 'standalone'` **must survive any wrapping**. pm2 runs the app from `.next/standalone/apps/web/server.js`; losing that option breaks the entire production deployment, and it breaks it at deploy time rather than at build time.

**Interfaces:**
- Consumes: nothing from earlier tasks. `@sentry/nextjs` is a separate SDK from `@sentry/node`.

**Context:** nginx routes `/` to web:3000 and `/api/v1` to api:3001, so `/health` on web does not collide with `/api/v1/health` on api. Web has no database of its own — this check is liveness only, proving the standalone server responds. It is the monitor that would have caught the 2026-08-06 incident, where `web` sat stopped for 18 minutes.

- [ ] **Step 1: Install the SDK, then re-verify the Monaco pin**

```bash
npm install @sentry/nextjs --workspace=apps/web
node apps/web/scripts/copy-monaco.mjs
```

Expected: the Monaco script succeeds. `npm install` has silently removed the `monaco-editor@0.52.2` pin twice before, and 0.55.x ships a non-AMD build that hangs the code editor on "Loading…". If it fails: `npm install monaco-editor@0.52.2 --workspace=apps/web --no-save`, then re-run.

- [ ] **Step 2: Add the health route**

```typescript
// apps/web/app/health/route.ts
// Liveness only -- web has no database of its own. Proves the standalone server is
// answering, which is exactly what was missing when `web` sat stopped for 18 minutes on
// 2026-08-06 and nothing noticed.
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ status: 'ok' });
}
```

- [ ] **Step 3: Add the Sentry init, following the installed SDK's own convention**

This project runs **Next.js 16.2.10**, and `@sentry/nextjs` changed its init convention across recent majors — the older `sentry.client.config.ts` / `sentry.server.config.ts` pair was replaced by an `instrumentation` -based setup. **Do not guess.** After installing, read the version's own setup documentation in `node_modules/@sentry/nextjs/README.md` (and its `package.json` `version`) and follow whatever that version prescribes for a Next.js App Router project.

The **binding requirements** are behavioural, not file-layout, and all of them must hold whichever convention the SDK uses:

1. `sendDefaultPii: false` — set explicitly, never left to the SDK default. Candidate names, emails and answer text live in this app's DOM and network calls.
2. **Session Replay fully disabled** — `replaysSessionSampleRate: 0` and `replaysOnErrorSampleRate: 0`. Replay records the DOM, which on the exam page contains question text and candidate answers. This is the single highest PII risk in the whole plan.
3. `tracesSampleRate: 0` — no APM, per the spec.
4. **Inert without a DSN.** Client init reads `NEXT_PUBLIC_SENTRY_DSN`, server init reads `SENTRY_DSN`; if the relevant variable is unset, do not call `Sentry.init` at all.
5. **Do not enable source-map upload.** It requires an auth token and a paid-tier-adjacent setup, and it uploads build artifacts to a third party. Out of scope.
6. `next.config.js` must remain CommonJS and **must still export `output: 'standalone'`** after any Sentry wrapping.

If the SDK's setup wants a build-time wrapper, apply it around the existing config object rather than replacing it, and verify `output` survives in Step 4.

- [ ] **Step 4: Verify the build, the standalone output, and the route**

```bash
npm run build --workspace=apps/web
```

Expected: build succeeds and the route table lists `/health`. Note that Next.js prints the first route with `┌`, not `├`/`└` — a grep for only `├`/`└` silently misses routes.

Then prove `output: 'standalone'` survived, because losing it breaks production deployment rather than the build:

```bash
ls apps/web/.next/standalone/apps/web/server.js
```

Expected: the file exists. If it does not, the Sentry config wrapping dropped `output: 'standalone'` — fix that before committing.

- [ ] **Step 5: Commit**

Stage the health route, whichever Sentry init files the SDK version prescribed, `next.config.js`, and the lockfile:

```bash
git add apps/web/app/health/route.ts apps/web/next.config.js package.json package-lock.json apps/web/package.json
git add apps/web/instrumentation*.ts apps/web/sentry.*.config.ts 2>/dev/null || true
git commit -m "feat(observability): web health route and frontend error tracking"
```

---

### Task 7: Full verification, then the operational setup

**Files:** none — this task is verification and external configuration.

- [ ] **Step 1: Full suites and typechecks**

```bash
npx jest --config packages/shared/jest.config.js && npx jest --config apps/api/jest.config.js && npx jest --config apps/exam-runtime/jest.config.js
```

Expected: all green — shared 144+, api 879+, exam-runtime 691+.

```bash
npx tsc --noEmit -p apps/api/tsconfig.json && npx tsc --noEmit -p apps/exam-runtime/tsconfig.json && npm run build --workspace=packages/shared
```

Expected: no output, exit 0.

- [ ] **Step 2: Verify inert-by-default locally**

With no `SENTRY_DSN` set, start api and confirm the boot log contains:

```
[SentryReporter] Sentry DSN not configured (SENTRY_DSN=unset); external error reporting is disabled
```

Then `curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/v1/health` — expected `200`.

- [ ] **Step 3: Create the Sentry projects and alert rules**

Three projects: `exam-api`, `exam-runtime`, `exam-web`. In each, two issue-alert rules:

| Condition | Action |
|---|---|
| new issue where tag `severity_band` equals `immediate` | notify the shared destination immediately |
| new issue where tag `severity_band` equals `digest` | daily summary |

Route on the **tag**, not on project membership — an api error carrying an `attemptId` is a candidate stuck mid-exam and must page, which project-based routing would silently misclassify.

- [ ] **Step 4: Create the UptimeRobot monitors**

Three HTTP(s) monitors, 5-minute interval, alert after 2 consecutive failures, both responders as alert contacts:

| Monitor | URL |
|---|---|
| api | `https://prudenthire.prudentconsulting.com/api/v1/health` |
| web | `https://prudenthire.prudentconsulting.com/health` |
| exam-runtime | `https://prudenthire.prudentconsulting.com:3002/api/v1/health` |

exam-runtime is on `:3002` because nginx serves it on its own TLS port — Socket.io namespace semantics break under path-proxying, so this must not be "simplified" into a path.

- [ ] **Step 5: Install pm2-logrotate on the VM**

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true
```

Verify with `pm2 conf pm2-logrotate` and confirm `~/.pm2/logs/` stops growing past the cap. This is also the SOC 2 log-retention answer, at no cost.

- [ ] **Step 6: The manual PII verification — do not skip this**

Delivery cannot be unit-tested, so verify it once by hand after deploying. Trigger a deliberate 500 on a route that carries candidate context, then in the Sentry issue confirm:

1. The event arrived, tagged with the correct `service` and `severity_band`.
2. The payload contains **no** candidate email, name, or answer text.
3. There is **no** `Authorization` header, cookie, or request body attached anywhere in the event.

If any PII is present, stop and fix the allow-list before leaving Sentry enabled — the tests pin `buildSentryPayload`, but this is the only check that covers what the SDK itself attaches.

- [ ] **Step 7: Record the outcome**

Append a dated entry to `.superpowers/sdd/progress.md` covering what shipped, and update the memory file `project_azure_deployment.md` with the new health-endpoint URLs — several past verification runs used `/api/v1/auth/saml/<slug>/status` as a health stand-in, and that note should now point at the real endpoints.
