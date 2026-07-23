# Browser-Activity Proctoring Strikes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give 7 browser-activity proctoring signals (tab switch, window blur, fullscreen exit, copy/paste, right-click, DevTools, multi-monitor, idle-timeout) the same visible warning/block treatment webcam violations already have, instead of being recorded silently.

**Architecture:** A new `browserActivityViolationCount` counter on `Attempt`, fully independent from the existing `webcamViolationCount`, follows the identical 3-strike pause/block state machine. A cooldown check (60s per event type) prevents a single ongoing incident (e.g. DevTools left open, which re-polls every 2s) from being counted as dozens of strikes. The backend's `/attempt/proctoring-event` endpoint now returns `{ strike, status }` like the webcam-violation endpoint already does, and the frontend reacts to it the same way it already reacts to webcam violations — reusing the existing pause/block overlay components and the existing generic resume endpoint.

**Tech Stack:** NestJS (apps/exam-runtime), Prisma/SQL Server, Next.js + React Query (apps/web), Jest.

## Global Constraints

- Exactly these 7 event types get strike treatment: `tab_switch`, `window_blur`, `fullscreen_exit`, `copy_paste`, `right_click`, `dev_tools_detected`, `multi_monitor_detected`, `idle_timeout`. `refresh_warning`, `editor_paste`, `looking_down` stay silent-only (no scope creep).
- Strike threshold: 3 (strikes 1-2 → `status: 'paused'`, strike 3 → `status: 'blocked'`) — identical to webcam.
- Cooldown: 60 seconds. A same-type event within 60s of the last one is still logged (for the Reports integrity timeline) but does not add a strike.
- `browserActivityViolationCount` is fully independent of `webcamViolationCount`. `attempt.status` is shared: once `'blocked'`, nothing downgrades it back to `'paused'`, and no further status transitions happen once already blocked.
- Candidate-facing copy is specific per signal (not generic), per the table in Task 8.
- Strikes 1-2 pause the exam (same UX as webcam: full-screen warning overlay, `Continue` button, no re-verification needed since there's nothing to re-check).

---

### Task 1: Add `browserActivityViolationCount` to the Attempt model

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (Attempt model, ~line 372)
- Create: `apps/api/prisma/migrations/20260723150000_browser_activity_violation_count/migration.sql`

**Interfaces:**
- Produces: `Attempt.browserActivityViolationCount: number` (Prisma-generated type), used by Task 3 onward.

- [ ] **Step 1: Add the field to the schema**

In `apps/api/prisma/schema.prisma`, find this line (~372):

```prisma
  webcamViolationCount Int                 @default(0) @map("webcam_violation_count")
```

Add immediately after it:

```prisma
  webcamViolationCount Int                 @default(0) @map("webcam_violation_count")
  browserActivityViolationCount Int        @default(0) @map("browser_activity_violation_count")
```

- [ ] **Step 2: Format the schema**

Run: `npx prisma format --schema apps/api/prisma/schema.prisma`

Expected: command exits with no error; field alignment/whitespace in the file may be adjusted automatically.

- [ ] **Step 3: Create the migration file**

Create `apps/api/prisma/migrations/20260723150000_browser_activity_violation_count/migration.sql`:

```sql
ALTER TABLE [dbo].[attempts] ADD [browser_activity_violation_count] INT NOT NULL CONSTRAINT [attempts_browser_activity_violation_count_default] DEFAULT 0;
```

- [ ] **Step 4: Regenerate the Prisma client**

Run: `npx prisma generate --schema apps/api/prisma/schema.prisma`

Expected: `✔ Generated Prisma Client ...` with no errors. This updates the generated `Attempt` TypeScript type to include `browserActivityViolationCount: number`, which Task 3 depends on for type-checking.

- [ ] **Step 5: Apply the migration to your local dev database (if you have one running)**

Run (adjust `DATABASE_URL` to your local SQL Server instance, matching `apps/api/.env`):

```bash
DATABASE_URL="sqlserver://localhost:1433;database=examapp;user=examapp_dev;password=DevPassw0rd!2026;trustServerCertificate=true" npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
```

Expected: `The following migration(s) have been applied: ... 20260723150000_browser_activity_violation_count`. If you don't have a local DB running, skip this step — the later tasks' unit tests all mock Prisma and don't need a live database.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260723150000_browser_activity_violation_count
git commit -m "feat: add browserActivityViolationCount to Attempt model"
```

---

### Task 2: Mark the 7 in-scope event types as strike-worthy

**Files:**
- Modify: `apps/exam-runtime/src/attempts/proctoring-severity.ts`
- Test: `apps/exam-runtime/src/attempts/proctoring-severity.spec.ts`

**Interfaces:**
- Produces: `STRIKE_WORTHY_EVENT_TYPES: ReadonlySet<string>`, `isStrikeWorthy(eventType: string): boolean` — consumed by Task 4.

- [ ] **Step 1: Write the failing tests**

Append to `apps/exam-runtime/src/attempts/proctoring-severity.spec.ts` (add this import alongside the existing one at the top, and this new `describe` block at the end of the file):

```ts
import { CLIENT_REPORTABLE_EVENT_TYPES, getProctoringEventSeverity, isStrikeWorthy } from './proctoring-severity';
```

```ts
describe('isStrikeWorthy', () => {
  it.each([
    'tab_switch',
    'window_blur',
    'fullscreen_exit',
    'copy_paste',
    'right_click',
    'dev_tools_detected',
    'multi_monitor_detected',
    'idle_timeout',
  ])('returns true for %s', (eventType) => {
    expect(isStrikeWorthy(eventType)).toBe(true);
  });

  it.each(['refresh_warning', 'editor_paste', 'looking_down', 'webcam_snapshot', 'something_unmapped'])(
    'returns false for %s',
    (eventType) => {
      expect(isStrikeWorthy(eventType)).toBe(false);
    },
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest --config apps/exam-runtime/jest.config.js proctoring-severity.spec.ts`

Expected: FAIL — `isStrikeWorthy is not a function` (or similar import error).

- [ ] **Step 3: Implement**

In `apps/exam-runtime/src/attempts/proctoring-severity.ts`, add after the existing `SEVERITY_BY_EVENT_TYPE` map and before `getProctoringEventSeverity`:

```ts
export const STRIKE_WORTHY_EVENT_TYPES: ReadonlySet<string> = new Set([
  'tab_switch',
  'window_blur',
  'fullscreen_exit',
  'copy_paste',
  'right_click',
  'dev_tools_detected',
  'multi_monitor_detected',
  'idle_timeout',
]);

export function isStrikeWorthy(eventType: string): boolean {
  return STRIKE_WORTHY_EVENT_TYPES.has(eventType);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest --config apps/exam-runtime/jest.config.js proctoring-severity.spec.ts`

Expected: PASS, all tests including the pre-existing ones in this file.

- [ ] **Step 5: Commit**

```bash
git add apps/exam-runtime/src/attempts/proctoring-severity.ts apps/exam-runtime/src/attempts/proctoring-severity.spec.ts
git commit -m "feat: mark the 7 browser-activity event types as strike-worthy"
```

---

### Task 3: `AttemptSettlementService.registerBrowserActivityViolation`

**Files:**
- Modify: `apps/exam-runtime/src/grading/attempt-settlement.service.ts`
- Test: `apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts`

**Interfaces:**
- Consumes: `getProctoringEventSeverity(eventType: string): 'low' | 'medium' | 'high'` from `../attempts/proctoring-severity` (Task 2's file, function already existed).
- Produces: `AttemptSettlementService.registerBrowserActivityViolation(tx: Prisma.TransactionClient, attempt: Attempt, eventType: string, metadata?: Record<string, unknown>): Promise<{ attempt: Attempt; strike: number; event: { id: string; eventType: string; severity: string } }>` — consumed by Task 4.

- [ ] **Step 1: Write the failing tests**

Add this import to the top of `apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts` (alongside the existing imports):

```ts
import { getProctoringEventSeverity } from '../attempts/proctoring-severity';
```

Insert this new `describe` block right after the existing `describe('registerWebcamViolation', ...)` block (i.e. right before `describe('resumeFromPause', ...)`, around line 800):

```ts
  describe('registerBrowserActivityViolation', () => {
    it('creates the event and adds a strike, pausing the attempt on strike 1', async () => {
      const attempt = { id: 'attempt-1', examId: 'exam-1', candidateId: 'cand-1', browserActivityViolationCount: 0, status: 'in_progress' } as any;
      const tx = {
        proctoringEvent: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'tab_switch', severity: 'medium' }),
        },
        attempt: { update: jest.fn().mockResolvedValue({ ...attempt, browserActivityViolationCount: 1, status: 'paused' }) },
      } as any;

      const { attempt: updated, strike, event } = await service.registerBrowserActivityViolation(tx, attempt, 'tab_switch');

      expect(strike).toBe(1);
      expect(updated.status).toBe('paused');
      expect(event).toEqual({ id: 'evt-1', eventType: 'tab_switch', severity: 'medium' });
      expect(tx.proctoringEvent.create).toHaveBeenCalledWith({
        data: { attemptId: 'attempt-1', eventType: 'tab_switch', severity: getProctoringEventSeverity('tab_switch'), metadataJson: null },
      });
      expect(tx.attempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-1' },
        data: { browserActivityViolationCount: 1, status: 'paused', pausedAt: expect.any(Date) },
      });
    });

    it('blocks the attempt on strike 3', async () => {
      const attempt = { id: 'attempt-1', examId: 'exam-1', candidateId: 'cand-1', browserActivityViolationCount: 2, status: 'paused' } as any;
      const tx = {
        proctoringEvent: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'evt-2', eventType: 'right_click', severity: 'low' }),
        },
        attempt: { update: jest.fn().mockResolvedValue({ ...attempt, browserActivityViolationCount: 3, status: 'blocked' }) },
      } as any;

      const { strike, attempt: updated } = await service.registerBrowserActivityViolation(tx, attempt, 'right_click');

      expect(strike).toBe(3);
      expect(updated.status).toBe('blocked');
      expect(tx.attempt.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'blocked' }) }));
    });

    it('serializes optional metadata to JSON', async () => {
      const attempt = { id: 'attempt-1', examId: 'exam-1', candidateId: 'cand-1', browserActivityViolationCount: 0, status: 'in_progress' } as any;
      const tx = {
        proctoringEvent: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'window_blur', severity: 'medium' }) },
        attempt: { update: jest.fn().mockResolvedValue({ ...attempt, browserActivityViolationCount: 1, status: 'paused' }) },
      } as any;

      await service.registerBrowserActivityViolation(tx, attempt, 'window_blur', { durationMs: 3000 });

      expect(tx.proctoringEvent.create).toHaveBeenCalledWith({
        data: { attemptId: 'attempt-1', eventType: 'window_blur', severity: 'medium', metadataJson: JSON.stringify({ durationMs: 3000 }) },
      });
    });

    it('logs the event but does not add a strike when the same event type occurred within the last 60 seconds', async () => {
      const attempt = { id: 'attempt-1', examId: 'exam-1', candidateId: 'cand-1', browserActivityViolationCount: 1, status: 'paused' } as any;
      const tx = {
        proctoringEvent: {
          findFirst: jest.fn().mockResolvedValue({ id: 'evt-earlier', eventType: 'dev_tools_detected', occurredAt: new Date(Date.now() - 2000) }),
          create: jest.fn().mockResolvedValue({ id: 'evt-2', eventType: 'dev_tools_detected', severity: 'high' }),
        },
        attempt: { update: jest.fn() },
      } as any;

      const { strike, attempt: updated, event } = await service.registerBrowserActivityViolation(tx, attempt, 'dev_tools_detected');

      expect(strike).toBe(1); // unchanged -- this is the same ongoing incident, not a new strike
      expect(updated).toBe(attempt);
      expect(event).toEqual({ id: 'evt-2', eventType: 'dev_tools_detected', severity: 'high' });
      expect(tx.proctoringEvent.create).toHaveBeenCalled(); // still logged for the Reports timeline
      expect(tx.attempt.update).not.toHaveBeenCalled();
    });

    it('adds a fresh strike when the same event type last occurred more than 60 seconds ago', async () => {
      const attempt = { id: 'attempt-1', examId: 'exam-1', candidateId: 'cand-1', browserActivityViolationCount: 1, status: 'in_progress' } as any;
      const tx = {
        proctoringEvent: {
          findFirst: jest.fn().mockResolvedValue(null), // the cooldown-window query found nothing that recent
          create: jest.fn().mockResolvedValue({ id: 'evt-2', eventType: 'dev_tools_detected', severity: 'high' }),
        },
        attempt: { update: jest.fn().mockResolvedValue({ ...attempt, browserActivityViolationCount: 2, status: 'paused' }) },
      } as any;

      const { strike } = await service.registerBrowserActivityViolation(tx, attempt, 'dev_tools_detected');

      expect(strike).toBe(2);
      expect(tx.attempt.update).toHaveBeenCalled();
    });

    it('queries for a recent same-type event scoped to this attempt within the cooldown window', async () => {
      const attempt = { id: 'attempt-1', examId: 'exam-1', candidateId: 'cand-1', browserActivityViolationCount: 0, status: 'in_progress' } as any;
      const tx = {
        proctoringEvent: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'copy_paste', severity: 'medium' }) },
        attempt: { update: jest.fn().mockResolvedValue({ ...attempt, browserActivityViolationCount: 1, status: 'paused' }) },
      } as any;

      await service.registerBrowserActivityViolation(tx, attempt, 'copy_paste');

      expect(tx.proctoringEvent.findFirst).toHaveBeenCalledWith({
        where: { attemptId: 'attempt-1', eventType: 'copy_paste', occurredAt: { gt: expect.any(Date) } },
        orderBy: { occurredAt: 'desc' },
      });
    });

    it('does not attempt a status transition or increment the strike when the attempt is already blocked', async () => {
      const attempt = { id: 'attempt-1', examId: 'exam-1', candidateId: 'cand-1', browserActivityViolationCount: 3, status: 'blocked' } as any;
      const tx = {
        proctoringEvent: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'evt-4', eventType: 'right_click', severity: 'low' }) },
        attempt: { update: jest.fn() },
      } as any;

      const { attempt: updated, strike } = await service.registerBrowserActivityViolation(tx, attempt, 'right_click');

      expect(strike).toBe(3);
      expect(updated).toBe(attempt);
      expect(tx.attempt.update).not.toHaveBeenCalled();
      expect(tx.proctoringEvent.create).toHaveBeenCalled(); // still logged for the audit trail
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest --config apps/exam-runtime/jest.config.js attempt-settlement.service.spec.ts -t registerBrowserActivityViolation`

Expected: FAIL — `service.registerBrowserActivityViolation is not a function`.

- [ ] **Step 3: Implement**

In `apps/exam-runtime/src/grading/attempt-settlement.service.ts`:

Add this import alongside the existing ones at the top of the file:

```ts
import { getProctoringEventSeverity } from '../attempts/proctoring-severity';
```

Add this constant right after the imports, before `export interface SettlementExam`:

```ts
const BROWSER_ACTIVITY_COOLDOWN_MS = 60_000;
```

Add this method right after `registerWebcamViolation` (before `resumeFromPause`):

```ts
  async registerBrowserActivityViolation(
    tx: Prisma.TransactionClient,
    attempt: Attempt,
    eventType: string,
    metadata?: Record<string, unknown>,
  ): Promise<{ attempt: Attempt; strike: number; event: { id: string; eventType: string; severity: string } }> {
    const cooldownCutoff = new Date(Date.now() - BROWSER_ACTIVITY_COOLDOWN_MS);
    const recentSameType = await tx.proctoringEvent.findFirst({
      where: { attemptId: attempt.id, eventType, occurredAt: { gt: cooldownCutoff } },
      orderBy: { occurredAt: 'desc' },
    });

    const event = await tx.proctoringEvent.create({
      data: {
        attemptId: attempt.id,
        eventType,
        severity: getProctoringEventSeverity(eventType),
        metadataJson: metadata ? JSON.stringify(metadata) : null,
      },
    });

    const isFreshStrike = !recentSameType;
    if (!isFreshStrike || attempt.status === 'blocked') {
      return { attempt, strike: attempt.browserActivityViolationCount, event };
    }

    const strike = attempt.browserActivityViolationCount + 1;
    const status = strike >= 3 ? 'blocked' : 'paused';
    const updated = await tx.attempt.update({
      where: { id: attempt.id },
      data: { browserActivityViolationCount: strike, status, pausedAt: new Date() },
    });
    void this.broadcaster
      .emitAttemptStatus(attempt.examId, { attemptId: updated.id, candidateId: attempt.candidateId, status: updated.status })
      .catch((error) => this.logger.error('Failed to broadcast attempt status', error as Error));
    return { attempt: updated, strike, event };
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest --config apps/exam-runtime/jest.config.js attempt-settlement.service.spec.ts`

Expected: PASS, all tests in the file including the pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add apps/exam-runtime/src/grading/attempt-settlement.service.ts apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts
git commit -m "feat: add registerBrowserActivityViolation with 60s per-signal cooldown"
```

---

### Task 4: Route strike-worthy events through the new violation registrar

**Files:**
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts` (`reportProctoringEvent`, ~line 453)
- Test: `apps/exam-runtime/src/attempts/attempt.service.spec.ts` (`describe('reportProctoringEvent', ...)`, ~line 1385)

**Interfaces:**
- Consumes: `isStrikeWorthy(eventType: string): boolean` (Task 2), `AttemptSettlementService.registerBrowserActivityViolation` (Task 3).
- Produces: `AttemptService.reportProctoringEvent(...): Promise<{ id: string; eventType: string; severity: string; strike: number; status: string }>` — consumed by Task 6 (frontend hook) via the `/attempt/proctoring-event` HTTP response.

- [ ] **Step 1: Write the failing tests**

In `apps/exam-runtime/src/attempts/attempt.service.spec.ts`, first update the `settlement` mock type and initialization near the top of the file (~lines 16-45) to add the new method:

Change:
```ts
  let settlement: {
    settleIfExpired: jest.Mock;
    finalize: jest.Mock;
    remainingSeconds: jest.Mock;
    registerWebcamViolation: jest.Mock;
    resumeFromPause: jest.Mock;
  };
```
to:
```ts
  let settlement: {
    settleIfExpired: jest.Mock;
    finalize: jest.Mock;
    remainingSeconds: jest.Mock;
    registerWebcamViolation: jest.Mock;
    registerBrowserActivityViolation: jest.Mock;
    resumeFromPause: jest.Mock;
  };
```

Change:
```ts
    settlement = {
      settleIfExpired: jest.fn(),
      finalize: jest.fn(),
      remainingSeconds: jest.fn(),
      registerWebcamViolation: jest.fn(),
      resumeFromPause: jest.fn(),
    };
```
to:
```ts
    settlement = {
      settleIfExpired: jest.fn(),
      finalize: jest.fn(),
      remainingSeconds: jest.fn(),
      registerWebcamViolation: jest.fn(),
      registerBrowserActivityViolation: jest.fn(),
      resumeFromPause: jest.fn(),
    };
```

Now replace the entire `describe('reportProctoringEvent', ...)` block (lines 1385-1444 — from `describe('reportProctoringEvent', () => {` through its closing `});`) with:

```ts
  describe('reportProctoringEvent', () => {
    describe('a non-strike-worthy event type (e.g. looking_down)', () => {
      it('creates a proctoring event with server-computed severity', async () => {
        const tx = {
          attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress' }) },
          proctoringEvent: { create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'looking_down', severity: 'medium' }) },
        };
        mockBootstrapThenScoped(tx);

        const result = await service.reportProctoringEvent(session, { eventType: 'looking_down' });

        expect(result).toEqual({ id: 'evt-1', eventType: 'looking_down', severity: 'medium', strike: 0, status: 'in_progress' });
        expect(tx.proctoringEvent.create).toHaveBeenCalledWith({
          data: { attemptId: 'attempt-1', eventType: 'looking_down', severity: getProctoringEventSeverity('looking_down'), metadataJson: null },
        });
        expect(settlement.registerBrowserActivityViolation).not.toHaveBeenCalled();
      });

      it('serializes optional metadata to JSON', async () => {
        const tx = {
          attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress' }) },
          proctoringEvent: { create: jest.fn().mockResolvedValue({}) },
        };
        mockBootstrapThenScoped(tx);

        await service.reportProctoringEvent(session, { eventType: 'looking_down', metadata: { confidence: 0.8 } });

        expect(tx.proctoringEvent.create).toHaveBeenCalledWith({
          data: { attemptId: 'attempt-1', eventType: 'looking_down', severity: 'medium', metadataJson: JSON.stringify({ confidence: 0.8 }) },
        });
      });

      it('throws NotFoundException when no attempt has been started', async () => {
        const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) } };
        mockBootstrapThenScoped(tx);

        await expect(service.reportProctoringEvent(session, { eventType: 'looking_down' })).rejects.toThrow(NotFoundException);
      });

      it('resolves tenant context via an unscoped bootstrap lookup followed by a properly scoped call', async () => {
        const tx = {
          attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress' }) },
          proctoringEvent: { create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'looking_down', severity: 'medium' }) },
        };
        mockBootstrapThenScoped(tx);

        await service.reportProctoringEvent(session, { eventType: 'looking_down' });

        expect(tenantPrisma.forTenant).toHaveBeenNthCalledWith(1, { organizationId: null, isSuperAdmin: true }, expect.any(Function));
        expect(tenantPrisma.forTenant).toHaveBeenNthCalledWith(2, { organizationId: 'org-1', isSuperAdmin: false }, expect.any(Function));
      });

      it('emits proctoring:flag after creating the event', async () => {
        const createdEvent = { id: 'evt-1', eventType: 'looking_down', severity: 'medium', occurredAt: new Date() };
        const tx = {
          attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress' }) },
          proctoringEvent: { create: jest.fn().mockResolvedValue(createdEvent) },
        };
        mockBootstrapThenScoped(tx);

        await service.reportProctoringEvent(session, { eventType: 'looking_down' });

        expect(monitoringGateway.emitProctoringFlag).toHaveBeenCalledWith('exam-1', {
          attemptId: 'attempt-1', candidateId: 'cand-1', eventType: 'looking_down', severity: 'medium', occurredAt: createdEvent.occurredAt,
        });
      });
    });

    describe('a strike-worthy event type (e.g. tab_switch)', () => {
      it('delegates to registerBrowserActivityViolation and returns its strike/status', async () => {
        const attempt = { id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress' };
        const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } };
        mockBootstrapThenScoped(tx);
        settlement.registerBrowserActivityViolation.mockResolvedValue({
          attempt: { ...attempt, browserActivityViolationCount: 1, status: 'paused' },
          strike: 1,
          event: { id: 'evt-1', eventType: 'tab_switch', severity: 'medium' },
        });

        const result = await service.reportProctoringEvent(session, { eventType: 'tab_switch' });

        expect(settlement.registerBrowserActivityViolation).toHaveBeenCalledWith(tx, attempt, 'tab_switch', undefined);
        expect(result).toEqual({ id: 'evt-1', eventType: 'tab_switch', severity: 'medium', strike: 1, status: 'paused' });
      });

      it('passes optional metadata through to registerBrowserActivityViolation', async () => {
        const attempt = { id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress' };
        const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } };
        mockBootstrapThenScoped(tx);
        settlement.registerBrowserActivityViolation.mockResolvedValue({
          attempt: { ...attempt, browserActivityViolationCount: 1, status: 'paused' },
          strike: 1,
          event: { id: 'evt-1', eventType: 'window_blur', severity: 'medium' },
        });

        await service.reportProctoringEvent(session, { eventType: 'window_blur', metadata: { durationMs: 3000 } });

        expect(settlement.registerBrowserActivityViolation).toHaveBeenCalledWith(tx, attempt, 'window_blur', { durationMs: 3000 });
      });

      it('emits proctoring:flag with the event returned by registerBrowserActivityViolation', async () => {
        const attempt = { id: 'attempt-1', browserActivityViolationCount: 2, status: 'in_progress' };
        const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } };
        mockBootstrapThenScoped(tx);
        settlement.registerBrowserActivityViolation.mockResolvedValue({
          attempt: { ...attempt, browserActivityViolationCount: 3, status: 'blocked' },
          strike: 3,
          event: { id: 'evt-1', eventType: 'dev_tools_detected', severity: 'high' },
        });

        await service.reportProctoringEvent(session, { eventType: 'dev_tools_detected' });

        expect(monitoringGateway.emitProctoringFlag).toHaveBeenCalledWith('exam-1', expect.objectContaining({
          attemptId: 'attempt-1', candidateId: 'cand-1', eventType: 'dev_tools_detected', severity: 'high',
        }));
      });

      it('throws NotFoundException when no attempt has been started', async () => {
        const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) } };
        mockBootstrapThenScoped(tx);

        await expect(service.reportProctoringEvent(session, { eventType: 'tab_switch' })).rejects.toThrow(NotFoundException);
        expect(settlement.registerBrowserActivityViolation).not.toHaveBeenCalled();
      });
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest --config apps/exam-runtime/jest.config.js attempt.service.spec.ts -t reportProctoringEvent`

Expected: FAIL — the "strike-worthy" tests fail because `reportProctoringEvent` never calls `registerBrowserActivityViolation` yet, and the "non-strike-worthy" tests fail on the new `strike`/`status` fields missing from the result.

- [ ] **Step 3: Implement**

In `apps/exam-runtime/src/attempts/attempt.service.ts`:

Change this import (~line 8, wherever `getProctoringEventSeverity` is currently imported from `./proctoring-severity`):

```ts
import { getProctoringEventSeverity } from './proctoring-severity';
```
to:
```ts
import { getProctoringEventSeverity, isStrikeWorthy } from './proctoring-severity';
```

Replace the entire `reportProctoringEvent` method (~lines 453-482) with:

```ts
  async reportProctoringEvent(
    session: CandidateSession,
    dto: ReportProctoringEventDto,
  ): Promise<{ id: string; eventType: string; severity: string; strike: number; status: string }> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) {
        throw new NotFoundException('No attempt has been started');
      }

      if (isStrikeWorthy(dto.eventType)) {
        const { attempt: updated, strike, event } = await this.attemptSettlement.registerBrowserActivityViolation(
          tx,
          attempt,
          dto.eventType,
          dto.metadata,
        );
        this.monitoringGateway.emitProctoringFlag(exam.id, {
          attemptId: attempt.id,
          candidateId: invitation.candidateId,
          eventType: event.eventType,
          severity: event.severity,
          occurredAt: new Date(),
        });
        return { id: event.id, eventType: event.eventType, severity: event.severity, strike, status: updated.status };
      }

      const event = await tx.proctoringEvent.create({
        data: {
          attemptId: attempt.id,
          eventType: dto.eventType,
          severity: getProctoringEventSeverity(dto.eventType),
          metadataJson: dto.metadata ? JSON.stringify(dto.metadata) : null,
        },
      });
      this.monitoringGateway.emitProctoringFlag(exam.id, {
        attemptId: attempt.id,
        candidateId: invitation.candidateId,
        eventType: event.eventType,
        severity: event.severity,
        occurredAt: event.occurredAt,
      });
      return {
        id: event.id,
        eventType: event.eventType,
        severity: event.severity,
        strike: attempt.browserActivityViolationCount,
        status: attempt.status,
      };
    });
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest --config apps/exam-runtime/jest.config.js attempt.service.spec.ts`

Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add apps/exam-runtime/src/attempts/attempt.service.ts apps/exam-runtime/src/attempts/attempt.service.spec.ts
git commit -m "feat: route strike-worthy proctoring events through registerBrowserActivityViolation"
```

---

### Task 5: Surface the counter in `getCurrent` and the shared frontend types

**Files:**
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts` (`AttemptStateResponse` interface ~line 103, `getCurrent` ~line 178)
- Modify: `apps/web/lib/types.ts` (`AttemptState` interface ~line 311)
- Test: `apps/exam-runtime/src/attempts/attempt.service.spec.ts` (`describe('getCurrent', ...)`)

**Interfaces:**
- Produces: `AttemptCurrentResponse`/`AttemptState.browserActivityViolationCount: number`, read by Task 9 (exam page).

- [ ] **Step 1: Write the failing test**

In `apps/exam-runtime/src/attempts/attempt.service.spec.ts`, add this test right after the existing `'returns the organization primaryColor alongside the logo when the org has one set'` test (~line 136), inside the `describe('getCurrent', ...)` block:

```ts
    it('returns browserActivityViolationCount alongside webcamViolationCount for an in-progress attempt', async () => {
      const attempt = {
        id: 'attempt-1', status: 'in_progress', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['q1']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 'section-1', title: 'Section One', targetDurationMinutes: null, questionIds: ['q1'] }]),
        optionOrderJson: null,
        webcamViolationCount: 1,
        browserActivityViolationCount: 2,
      };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', text: 'Q', type: 'single_mcq', marks: 5, languageMode: 'fixed', allowedLanguages: null, starterCode: null, allowStdin: false, snippetCode: null, snippetLanguage: null, imageUrl: null, options: [] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(1000);
      mockBootstrapWithLogoThenScoped(tx);

      const result = await service.getCurrent(session);

      expect((result as any).webcamViolationCount).toBe(1);
      expect((result as any).browserActivityViolationCount).toBe(2);
    });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --config apps/exam-runtime/jest.config.js attempt.service.spec.ts -t "browserActivityViolationCount alongside"`

Expected: FAIL — `expect(received).toBe(2)` receives `undefined`.

- [ ] **Step 3: Implement**

In `apps/exam-runtime/src/attempts/attempt.service.ts`, change the `AttemptStateResponse` interface (~line 103):

```ts
interface AttemptStateResponse {
  status: string;
  remainingSeconds: number;
  webcamViolationCount: number;
  exam: { title: string };
```
to:
```ts
interface AttemptStateResponse {
  status: string;
  remainingSeconds: number;
  webcamViolationCount: number;
  browserActivityViolationCount: number;
  exam: { title: string };
```

Change the `getCurrent` return object (~line 178) from:
```ts
        status: settled.status,
        remainingSeconds: this.attemptSettlement.remainingSeconds(exam, settled),
        webcamViolationCount: settled.webcamViolationCount,
        exam: { title: exam.title },
```
to:
```ts
        status: settled.status,
        remainingSeconds: this.attemptSettlement.remainingSeconds(exam, settled),
        webcamViolationCount: settled.webcamViolationCount,
        browserActivityViolationCount: settled.browserActivityViolationCount,
        exam: { title: exam.title },
```

In `apps/web/lib/types.ts`, change the `AttemptState` interface (~line 311):
```ts
export interface AttemptState {
  status: string;
  remainingSeconds: number;
  webcamViolationCount: number;
  exam: { title: string };
```
to:
```ts
export interface AttemptState {
  status: string;
  remainingSeconds: number;
  webcamViolationCount: number;
  browserActivityViolationCount: number;
  exam: { title: string };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest --config apps/exam-runtime/jest.config.js attempt.service.spec.ts`

Expected: PASS, all tests in the file (the pre-existing `toEqual`-based tests in `getCurrent` still pass unaffected — they never set `webcamViolationCount`/`browserActivityViolationCount` on their mock `attempt` objects, and Jest's `toEqual` ignores `undefined`-valued properties).

- [ ] **Step 5: Commit**

```bash
git add apps/exam-runtime/src/attempts/attempt.service.ts apps/exam-runtime/src/attempts/attempt.service.spec.ts apps/web/lib/types.ts
git commit -m "feat: surface browserActivityViolationCount in the attempt/current response"
```

---

### Task 6: Make `useReportProctoringEvent` refresh attempt state on report

**Files:**
- Modify: `apps/web/lib/hooks/useAttempt.ts` (`useReportProctoringEvent`, ~line 139)
- Test: `apps/web/lib/hooks/useAttempt.test.tsx`

**Interfaces:**
- Consumes: nothing new (still uses `useCandidateAuth`, `candidateApiFetch`, `useQueryClient` — all already imported in this file).
- Produces: `useReportProctoringEvent(): (eventType: ProctoringEventType, metadata?: Record<string, unknown>) => void` — same external signature as before (backward compatible), consumed by Task 7's `useProctoringMonitor` and `useWebcamMonitor` (unchanged callers).

- [ ] **Step 1: Write the failing test**

Add this `describe` block to the end of `apps/web/lib/hooks/useAttempt.test.tsx`:

```tsx
describe('useReportProctoringEvent', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('invalidates attempt/current after a successful report, so a strike is picked up', async () => {
    let currentCallCount = 0;
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/candidate-auth/refresh')) {
        return new Response(JSON.stringify({ message: 'none' }), { status: 401 });
      }
      if (String(url).endsWith('/attempt/current')) {
        currentCallCount += 1;
        const status = currentCallCount === 1 ? 'in_progress' : 'paused';
        return new Response(JSON.stringify({ status, exam: { title: 'T' }, sections: [], answers: [], messages: [], feedback: null, organizationLogoUrl: null, organizationPrimaryColor: null, webcamViolationCount: 0, browserActivityViolationCount: 1, remainingSeconds: 100 }), { status: 200 });
      }
      if (String(url).endsWith('/attempt/proctoring-event')) {
        return new Response(JSON.stringify({ id: 'evt-1', eventType: 'tab_switch', severity: 'medium', strike: 1, status: 'paused' }), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    let report: ReturnType<typeof useReportProctoringEvent> | undefined;
    function Probe() {
      report = useReportProctoringEvent();
      const { data } = useAttemptQuery();
      return <p>{data && 'status' in data ? `status:${data.status}` : 'loading'}</p>;
    }

    render(<Probe />, { wrapper });
    await waitFor(() => expect(screen.getByText('status:in_progress')).toBeInTheDocument());

    act(() => {
      report!('tab_switch');
    });

    await waitFor(() => expect(screen.getByText('status:paused')).toBeInTheDocument());
  });
});
```

Add `useReportProctoringEvent` to the existing import from `./useAttempt` at the top of the file:

```tsx
import { useAttemptQuery, useAnswerMutation, useRunCode, useStartAttempt, useReportProctoringEvent } from './useAttempt';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --config apps/web/jest.config.ts --rootDir apps/web useAttempt.test.tsx -t useReportProctoringEvent`

Expected: FAIL — the second `waitFor` times out because nothing re-fetches `/attempt/current` after `report('tab_switch')`, so the UI stays on `status:in_progress`.

- [ ] **Step 3: Implement**

In `apps/web/lib/hooks/useAttempt.ts`, replace the existing `useReportProctoringEvent` function:

```ts
export function useReportProctoringEvent() {
  const { accessToken } = useCandidateAuth();
  return function report(eventType: ProctoringEventType, metadata?: Record<string, unknown>) {
    candidateApiFetch(
      '/attempt/proctoring-event',
      { method: 'POST', body: JSON.stringify({ eventType, metadata }) },
      accessToken ?? undefined,
    ).catch(() => undefined);
  };
}
```
with:
```ts
export function useReportProctoringEvent() {
  const { accessToken } = useCandidateAuth();
  const queryClient = useQueryClient();
  const { mutate } = useMutation({
    mutationFn: ({ eventType, metadata }: { eventType: ProctoringEventType; metadata?: Record<string, unknown> }) =>
      candidateApiFetch(
        '/attempt/proctoring-event',
        { method: 'POST', body: JSON.stringify({ eventType, metadata }) },
        accessToken ?? undefined,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attempt', 'current'] }),
  });
  return function report(eventType: ProctoringEventType, metadata?: Record<string, unknown>) {
    mutate({ eventType, metadata });
  };
}
```

(No new imports needed — `useMutation` and `useQueryClient` are already imported at the top of this file.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest --config apps/web/jest.config.ts --rootDir apps/web useAttempt.test.tsx`

Expected: PASS, all tests in the file.

- [ ] **Step 5: Run the full hook test suite that depends on this function's external shape**

Run: `npx jest --config apps/web/jest.config.ts --rootDir apps/web useProctoringMonitor.test.tsx useWebcamMonitor.test.tsx`

Expected: PASS — these mock `useReportProctoringEvent` directly (via `jest.spyOn`) rather than exercising the real implementation, so the internal rewrite doesn't affect them.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/hooks/useAttempt.ts apps/web/lib/hooks/useAttempt.test.tsx
git commit -m "feat: refresh attempt state after reporting a proctoring event"
```

---

### Task 7: `useProctoringMonitor` — notify the caller which signal fired

**Files:**
- Modify: `apps/web/lib/hooks/useProctoringMonitor.ts`
- Test: `apps/web/lib/hooks/useProctoringMonitor.test.tsx`

**Interfaces:**
- Produces: `useProctoringMonitor(enabled: boolean, onViolation?: (eventType: ProctoringEventType) => void): void` — consumed by Task 9 (exam page).

- [ ] **Step 1: Write the failing tests**

Add this `describe` block to the end of `apps/web/lib/hooks/useProctoringMonitor.test.tsx` (before the final closing `});` of the outer `describe('useProctoringMonitor', ...)`):

```tsx
  describe('onViolation callback', () => {
    function ProbeWithCallback({ enabled, onViolation }: { enabled: boolean; onViolation: (eventType: string) => void }) {
      useProctoringMonitor(enabled, onViolation);
      return null;
    }

    it('calls onViolation with the event type when a signal is reported', () => {
      const onViolation = jest.fn();
      render(<ProbeWithCallback enabled={true} onViolation={onViolation} />);

      document.dispatchEvent(new Event('contextmenu'));

      expect(onViolation).toHaveBeenCalledWith('right_click');
    });

    it('calls onViolation for a debounced report (tab_switch), not just direct ones', () => {
      const onViolation = jest.fn();
      render(<ProbeWithCallback enabled={true} onViolation={onViolation} />);
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });

      document.dispatchEvent(new Event('visibilitychange'));

      expect(onViolation).toHaveBeenCalledWith('tab_switch');
    });

    it('does not call onViolation when disabled', () => {
      const onViolation = jest.fn();
      render(<ProbeWithCallback enabled={false} onViolation={onViolation} />);

      document.dispatchEvent(new Event('contextmenu'));

      expect(onViolation).not.toHaveBeenCalled();
    });

    it('works with no callback provided (backward compatible)', () => {
      render(<Probe enabled={true} />);
      expect(() => document.dispatchEvent(new Event('contextmenu'))).not.toThrow();
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest --config apps/web/jest.config.ts --rootDir apps/web useProctoringMonitor.test.tsx -t "onViolation callback"`

Expected: FAIL — `onViolation` is never called because the hook doesn't accept or invoke it yet.

- [ ] **Step 3: Implement**

Replace the entire contents of `apps/web/lib/hooks/useProctoringMonitor.ts` with:

```ts
import { useEffect, useRef } from 'react';
import { useReportProctoringEvent } from './useAttempt';
import { ProctoringEventType } from '../types';

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const DEVTOOLS_POLL_MS = 2000;
const DEVTOOLS_SIZE_THRESHOLD = 160;
const TAB_SWITCH_DEBOUNCE_MS = 5000;

export function useProctoringMonitor(enabled: boolean, onViolation?: (eventType: ProctoringEventType) => void): void {
  const report = useReportProctoringEvent();
  const reportRef = useRef(report);
  reportRef.current = report;
  const onViolationRef = useRef(onViolation);
  onViolationRef.current = onViolation;
  const debounceTimers = useRef<Partial<Record<ProctoringEventType, ReturnType<typeof setTimeout>>>>({});
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!enabled) return;

    function reportAndNotify(eventType: ProctoringEventType, metadata?: Record<string, unknown>) {
      reportRef.current(eventType, metadata);
      onViolationRef.current?.(eventType);
    }

    function debouncedReport(eventType: ProctoringEventType, windowMs: number, metadata?: Record<string, unknown>) {
      if (debounceTimers.current[eventType]) return;
      reportAndNotify(eventType, metadata);
      debounceTimers.current[eventType] = setTimeout(() => {
        delete debounceTimers.current[eventType];
      }, windowMs);
    }

    function resetIdleTimer() {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => reportAndNotify('idle_timeout'), IDLE_TIMEOUT_MS);
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        // The document actually hid, so this episode belongs to tab_switch --
        // clear any pending blur so the later focus doesn't also report window_blur.
        blurStartedAt = null;
        debouncedReport('tab_switch', TAB_SWITCH_DEBOUNCE_MS);
      }
    }
    function onFullscreenChange() {
      if (!document.fullscreenElement) {
        debouncedReport('fullscreen_exit', TAB_SWITCH_DEBOUNCE_MS);
      }
    }
    function onCopy() {
      reportAndNotify('copy_paste', { action: 'copy' });
    }
    function onPaste() {
      reportAndNotify('copy_paste', { action: 'paste' });
    }
    function onContextMenu() {
      reportAndNotify('right_click');
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'F12' || (event.ctrlKey && event.shiftKey && event.key === 'I')) {
        reportAndNotify('dev_tools_detected', { trigger: 'shortcut' });
      }
      resetIdleTimer();
    }
    function onMouseMove() {
      resetIdleTimer();
    }

    const MULTI_MONITOR_POLL_MS = 15_000;
    let blurStartedAt: number | null = null;

    function onWindowBlur() {
      // Focus lost to another app while the exam stays visible -- a real tab
      // switch hides the document and is already covered by tab_switch.
      if (document.visibilityState === 'visible') {
        blurStartedAt = Date.now();
      }
    }
    function onWindowFocus() {
      if (blurStartedAt !== null) {
        const durationMs = Date.now() - blurStartedAt;
        blurStartedAt = null;
        debouncedReport('window_blur', TAB_SWITCH_DEBOUNCE_MS, { durationMs });
      }
      resetIdleTimer();
    }

    // screen.isExtended is Chromium-only; undefined (Firefox/Safari) never transitions to true.
    let lastIsExtended = (window.screen as Screen & { isExtended?: boolean }).isExtended === true;
    const multiMonitorInterval = setInterval(() => {
      const isExtended = (window.screen as Screen & { isExtended?: boolean }).isExtended === true;
      if (isExtended && !lastIsExtended) {
        reportAndNotify('multi_monitor_detected');
      }
      lastIsExtended = isExtended;
    }, MULTI_MONITOR_POLL_MS);

    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousemove', onMouseMove);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('focus', onWindowFocus);
    resetIdleTimer();

    const devtoolsInterval = setInterval(() => {
      const widthDelta = window.outerWidth - window.innerWidth;
      const heightDelta = window.outerHeight - window.innerHeight;
      if (widthDelta > DEVTOOLS_SIZE_THRESHOLD || heightDelta > DEVTOOLS_SIZE_THRESHOLD) {
        reportAndNotify('dev_tools_detected', { trigger: 'window-size' });
      }
    }, DEVTOOLS_POLL_MS);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('focus', onWindowFocus);
      clearInterval(devtoolsInterval);
      clearInterval(multiMonitorInterval);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      Object.values(debounceTimers.current).forEach((timer) => clearTimeout(timer));
      debounceTimers.current = {};
    };
  }, [enabled]);
}
```

This is a behavior-preserving refactor for every existing call site (`reportRef.current(x)` → `reportAndNotify(x)`, which still calls `reportRef.current(x)` first) plus the new `onViolationRef.current?.(eventType)` call alongside each one.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest --config apps/web/jest.config.ts --rootDir apps/web useProctoringMonitor.test.tsx`

Expected: PASS, all tests in the file including every pre-existing one (the `Probe` component used by the rest of the file's tests calls `useProctoringMonitor(enabled)` with no second argument, which is still valid).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/hooks/useProctoringMonitor.ts apps/web/lib/hooks/useProctoringMonitor.test.tsx
git commit -m "feat: expose which signal fired from useProctoringMonitor via onViolation"
```

---

### Task 8: Generalize the warning/block overlays for all 8 non-webcam reasons

**Files:**
- Modify: `apps/web/app/(candidate)/components/ProctoringOverlay.tsx`
- Test: `apps/web/app/(candidate)/components/ProctoringOverlay.test.tsx` (create if it doesn't exist — check first)

**Interfaces:**
- Consumes: nothing new — `ProctoringWarningOverlayProps`/`ProctoringBlockOverlay` signatures are unchanged.
- Produces: same component export names/props, now rendering per-signal copy for 11 reason strings total (3 webcam + 8 browser-activity) instead of 2 — consumed by Task 9 (exam page, unchanged call sites).

- [ ] **Step 1: Check for an existing test file and write the failing tests**

Run: `ls apps/web/app/\(candidate\)/components/ProctoringOverlay.test.tsx 2>&1 || echo "no existing file"`

If it doesn't exist, create `apps/web/app/(candidate)/components/ProctoringOverlay.test.tsx` with this content. If it already exists, add these `it` blocks inside its existing top-level `describe` (or create the file fresh with everything below if none exists):

```tsx
import { render, screen } from '@testing-library/react';
import { ProctoringWarningOverlay, ProctoringBlockOverlay } from './ProctoringOverlay';

describe('ProctoringWarningOverlay', () => {
  const noop = () => undefined;

  it('shows the multiple_faces message', () => {
    render(<ProctoringWarningOverlay strike={1} reason="multiple_faces" onContinue={noop} continuePending={false} continueError={false} />);
    expect(screen.getByText('More than one person detected')).toBeInTheDocument();
  });

  it('shows the no_face message', () => {
    render(<ProctoringWarningOverlay strike={1} reason="no_face" onContinue={noop} continuePending={false} continueError={false} />);
    expect(screen.getByText('Face not visible')).toBeInTheDocument();
  });

  it('falls back to the no_face message for an unrecognized reason', () => {
    render(<ProctoringWarningOverlay strike={1} reason={undefined} onContinue={noop} continuePending={false} continueError={false} />);
    expect(screen.getByText('Face not visible')).toBeInTheDocument();
  });

  it.each([
    ['tab_switch', 'Tab switch detected', 'We noticed you switched away from this exam tab.'],
    ['window_blur', 'Switched application', 'We noticed you switched to another application.'],
    ['fullscreen_exit', 'Exited fullscreen', 'We noticed you exited fullscreen mode.'],
    ['copy_paste', 'Copy/paste detected', 'We noticed copy or paste activity.'],
    ['right_click', 'Right-click detected', 'We noticed a right-click / context-menu action.'],
    ['dev_tools_detected', 'Developer tools detected', 'We noticed browser developer tools were opened.'],
    ['multi_monitor_detected', 'Additional display detected', 'We noticed an additional display was connected.'],
    ['idle_timeout', 'Inactivity detected', 'We noticed no activity for several minutes.'],
  ])('shows the %s message', (reason, heading, body) => {
    render(<ProctoringWarningOverlay strike={2} reason={reason} onContinue={noop} continuePending={false} continueError={false} />);
    expect(screen.getByText(heading)).toBeInTheDocument();
    expect(screen.getByText(body)).toBeInTheDocument();
    expect(screen.getByText('Warning 2/3')).toBeInTheDocument();
  });
});

describe('ProctoringBlockOverlay', () => {
  it('mentions policy violations generically, not specifically webcam', () => {
    render(<ProctoringBlockOverlay />);
    expect(screen.getByText(/repeated policy violations/i)).toBeInTheDocument();
    expect(screen.queryByText(/webcam violations/i)).not.toBeInTheDocument();
  });

  it('still tells the candidate a recruiter needs to unblock the session', () => {
    render(<ProctoringBlockOverlay />);
    expect(screen.getByText(/recruiter needs to unblock/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest --config apps/web/jest.config.ts --rootDir apps/web ProctoringOverlay.test.tsx`

Expected: FAIL — the 8 new reason types all render the generic "Face not visible" fallback instead of their specific copy, and the block overlay still says "webcam violations".

- [ ] **Step 3: Implement**

Replace the entire contents of `apps/web/app/(candidate)/components/ProctoringOverlay.tsx` with:

```tsx
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { CandidateButton } from './CandidateButton';

interface ProctoringWarningOverlayProps {
  strike: number;
  reason?: string;
  onContinue: () => void;
  continuePending: boolean;
  continueError: boolean;
}

const DEFAULT_MESSAGE = {
  heading: 'Face not visible',
  body: "We couldn't see your face clearly. Make sure you're centered in the camera and facing forward, then continue.",
};

const MESSAGES_BY_REASON: Record<string, { heading: string; body: string }> = {
  multiple_faces: {
    heading: 'More than one person detected',
    body: 'Only you may be in view during the exam. Make sure no one else is visible in the camera, then continue.',
  },
  no_face: DEFAULT_MESSAGE,
  head_turned: DEFAULT_MESSAGE,
  tab_switch: { heading: 'Tab switch detected', body: 'We noticed you switched away from this exam tab.' },
  window_blur: { heading: 'Switched application', body: 'We noticed you switched to another application.' },
  fullscreen_exit: { heading: 'Exited fullscreen', body: 'We noticed you exited fullscreen mode.' },
  copy_paste: { heading: 'Copy/paste detected', body: 'We noticed copy or paste activity.' },
  right_click: { heading: 'Right-click detected', body: 'We noticed a right-click / context-menu action.' },
  dev_tools_detected: { heading: 'Developer tools detected', body: 'We noticed browser developer tools were opened.' },
  multi_monitor_detected: { heading: 'Additional display detected', body: 'We noticed an additional display was connected.' },
  idle_timeout: { heading: 'Inactivity detected', body: 'We noticed no activity for several minutes.' },
};

export function ProctoringWarningOverlay({ strike, reason, onContinue, continuePending, continueError }: ProctoringWarningOverlayProps) {
  const { heading, body } = (reason && MESSAGES_BY_REASON[reason]) || DEFAULT_MESSAGE;
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-candidate-text/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-lg">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-candidate-review-bg text-candidate-review">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="mb-1 text-base font-bold text-candidate-text">{heading}</h1>
        <p className="mb-4 text-sm text-candidate-text-secondary">{body}</p>
        <p className="mb-4 text-xs text-candidate-text-faint">Warning {strike}/3</p>
        <CandidateButton onClick={onContinue} disabled={continuePending}>
          {continuePending ? 'Checking…' : 'Continue'}
        </CandidateButton>
        {continueError ? <p className="mt-2 text-xs text-candidate-danger">Still not detected — reposition and try again.</p> : null}
      </div>
    </div>
  );
}

export function ProctoringBlockOverlay() {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-candidate-text/55 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-lg">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-candidate-danger-bg text-candidate-danger">
          <ShieldAlert className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="mb-1 text-base font-bold text-candidate-text">Exam paused</h1>
        <p className="mb-3 text-sm text-candidate-text-secondary">
          Your exam has been paused after repeated policy violations. A recruiter needs to unblock your session before you
          can continue.
        </p>
        <p className="mb-1 text-xs text-candidate-text-faint">Waiting for a recruiter · checking automatically</p>
        <p className="text-xs text-candidate-text-faint">Your timer is paused — you won&apos;t lose time waiting.</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest --config apps/web/jest.config.ts --rootDir apps/web ProctoringOverlay.test.tsx exam/page.test.tsx`

Expected: PASS, all tests in both files. `exam/page.test.tsx` is included here because it has its own pre-existing assertions against these two components (e.g. `screen.getByText(/recruiter needs to unblock/i)`), which must keep passing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(candidate\)/components/ProctoringOverlay.tsx apps/web/app/\(candidate\)/components/ProctoringOverlay.test.tsx
git commit -m "feat: add per-signal copy to the proctoring warning/block overlays"
```

---

### Task 9: Wire the exam page to show browser-activity strikes

**Files:**
- Modify: `apps/web/app/(candidate)/exam/page.tsx` (~lines 79-82, ~lines 209-217)
- Test: `apps/web/app/(candidate)/exam/page.test.tsx`

**Interfaces:**
- Consumes: `useProctoringMonitor(enabled, onViolation?)` (Task 7), `AttemptState.browserActivityViolationCount` (Task 5), `ProctoringWarningOverlay`/`ProctoringBlockOverlay` (Task 8, unchanged props).

- [ ] **Step 1: Write the failing tests**

Add `browserActivityViolationCount: 0` to the `attemptState` object and the `attemptStateWithQuestion` helper near the top of `apps/web/app/(candidate)/exam/page.test.tsx` (the same places `webcamViolationCount: 0` already appears, ~lines 34 and wherever the top-level `attemptState` const is defined — find every object literal with `webcamViolationCount: 0` as a base fixture and add `browserActivityViolationCount: 0` alongside it).

Add this new `describe` block anywhere inside the file's outer `describe('CandidateExamPage', ...)` (e.g. right after the existing `'shows a block overlay with no self-resume option when blocked'` test):

```tsx
  describe('browser-activity strikes', () => {
    it('shows the browser-activity strike count (not the webcam count) when paused by a browser-activity signal', () => {
      (useAttemptQuery as jest.Mock).mockReturnValue({
        data: { ...attemptState, status: 'paused', webcamViolationCount: 0, browserActivityViolationCount: 2 },
        isError: false,
      });
      (useProctoringMonitor as jest.Mock).mockImplementation((_enabled: boolean, onViolation?: (eventType: string) => void) => {
        onViolation?.('tab_switch');
      });
      (useWebcamResume as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false, isError: false });

      render(<CandidateExamPage />);

      expect(screen.getByText('Tab switch detected')).toBeInTheDocument();
      expect(screen.getByText('Warning 2/3')).toBeInTheDocument();
    });

    it('still shows the webcam strike count and message when the last violation was a webcam one', () => {
      (useAttemptQuery as jest.Mock).mockReturnValue({
        data: { ...attemptState, status: 'paused', webcamViolationCount: 1, browserActivityViolationCount: 2 },
        isError: false,
      });
      (useWebcamMonitor as jest.Mock).mockImplementation((_enabled: boolean, onViolationReason?: (reason: string) => void) => {
        onViolationReason?.('no_face');
      });
      (useWebcamResume as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false, isError: false });

      render(<CandidateExamPage />);

      expect(screen.getByText('Face not visible')).toBeInTheDocument();
      expect(screen.getByText('Warning 1/3')).toBeInTheDocument();
    });

    it('resumes via the same webcam-resume mutation regardless of which system caused the pause', async () => {
      (useAttemptQuery as jest.Mock).mockReturnValue({
        data: { ...attemptState, status: 'paused', webcamViolationCount: 0, browserActivityViolationCount: 1 },
        isError: false,
      });
      (useProctoringMonitor as jest.Mock).mockImplementation((_enabled: boolean, onViolation?: (eventType: string) => void) => {
        onViolation?.('right_click');
      });
      const resumeMutate = jest.fn();
      (useWebcamResume as jest.Mock).mockReturnValue({ mutate: resumeMutate, isPending: false, isError: false });

      render(<CandidateExamPage />);
      await userEvent.click(screen.getByRole('button', { name: /continue/i }));

      expect(resumeMutate).toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest --config apps/web/jest.config.ts --rootDir apps/web exam/page.test.tsx -t "browser-activity strikes"`

Expected: FAIL — the overlay always shows the webcam-derived heading/strike count (`lastViolationReason` defaults to `'no_face'` and `strike` is hardcoded to `attemptState.webcamViolationCount`), so "Tab switch detected" / "Warning 2/3" never appear.

- [ ] **Step 3: Implement**

In `apps/web/app/(candidate)/exam/page.tsx`, replace:

```ts
  const [lastViolationReason, setLastViolationReason] = useState<string>('no_face');
  useProctoringMonitor(started);
  useWebcamMonitor(started, setLastViolationReason);
  const webcamResume = useWebcamResume();
```
with:
```ts
  const [lastViolationReason, setLastViolationReason] = useState<string>('no_face');
  const [lastViolationSource, setLastViolationSource] = useState<'webcam' | 'browser_activity'>('webcam');
  useProctoringMonitor(started, (eventType) => {
    setLastViolationReason(eventType);
    setLastViolationSource('browser_activity');
  });
  useWebcamMonitor(started, (reason) => {
    setLastViolationReason(reason);
    setLastViolationSource('webcam');
  });
  // Resuming from a browser-activity pause has nothing to re-verify (unlike webcam, which
  // re-checks face presence) -- it's the same generic "clear the pause" transition either way,
  // so the existing webcam-resume endpoint/mutation is reused rather than adding a duplicate one.
  const webcamResume = useWebcamResume();
```

Then replace:

```tsx
      {isPaused ? (
        <ProctoringWarningOverlay
          strike={attemptState.webcamViolationCount}
          reason={lastViolationReason}
          onContinue={() => webcamResume.mutate()}
          continuePending={webcamResume.isPending}
          continueError={webcamResume.isError}
        />
      ) : null}
```
with:
```tsx
      {isPaused ? (
        <ProctoringWarningOverlay
          strike={lastViolationSource === 'browser_activity' ? attemptState.browserActivityViolationCount : attemptState.webcamViolationCount}
          reason={lastViolationReason}
          onContinue={() => webcamResume.mutate()}
          continuePending={webcamResume.isPending}
          continueError={webcamResume.isError}
        />
      ) : null}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest --config apps/web/jest.config.ts --rootDir apps/web exam/page.test.tsx`

Expected: PASS, all tests in the file, including every pre-existing webcam-violation test (they never call `useProctoringMonitor`'s mock with an `onViolation` argument, so `lastViolationSource` stays at its default `'webcam'` and `attemptState.webcamViolationCount` is used, exactly as before).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(candidate\)/exam/page.tsx apps/web/app/\(candidate\)/exam/page.test.tsx
git commit -m "feat: show browser-activity strikes on the exam page using the same overlay as webcam"
```

---

## Self-Review

**Spec coverage:**
- §1 (counter, same state machine) → Task 1 (schema) + Task 3 (strike/status logic).
- §2 (cooldown dedup) → Task 3.
- §3 (backend response shape) → Task 4.
- §4 (frontend wiring, generalized overlay, resume reuse) → Tasks 6, 7, 8, 9.
- §5 (candidate-facing copy) → Task 8.
- §6 (blocked-wins interaction) → Task 3's "already blocked" guard.
- Testing section → every task has its own test step; Task 8 explicitly re-runs `exam/page.test.tsx` to catch cross-file breakage.
- Out of scope (refresh_warning/editor_paste/looking_down stay silent) → verified explicitly in Task 2's tests and Task 4's "non-strike-worthy" test group.

**Placeholder scan:** No TBD/TODO; every step has literal code, not descriptions of code.

**Type consistency:** `registerBrowserActivityViolation` return shape `{ attempt, strike, event: { id, eventType, severity } }` is identical across Task 3 (producer) and Task 4 (consumer). `useProctoringMonitor(enabled, onViolation?)` signature is identical across Task 7 (producer) and Task 9 (consumer). `AttemptState.browserActivityViolationCount` (Task 5) is read the same way in Task 9. `isStrikeWorthy` (Task 2) is imported and used with the same name in Task 4.
