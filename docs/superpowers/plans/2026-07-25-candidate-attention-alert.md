# Proactive Candidate-Attention Alert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flag a candidate who is accumulating proctoring alerts unusually fast, surface it in the roster and on the Live tab, and fire a desktop notification when the page is not visible — so a recruiter learns about a struggling candidate while the exam is still running.

**Architecture:** The recruiter's client already receives every proctoring event over the socket, so detection is a pure function of the alert list and the clock — derived, never stored. Two structural prerequisites make it actually work: the server must replay recent alert history on join (today the feed starts empty), and `useExamMonitoring` must move up to the exam page (today the socket dies whenever the recruiter leaves the Live tab).

**Tech Stack:** NestJS + Socket.io (apps/exam-runtime), Next.js + React + Radix Tabs (apps/web), Prisma on SQL Server, Jest + React Testing Library.

## Global Constraints

- **Detection is client-side and derived.** No new database columns, no persisted flag state. The flag is computed from `alerts` + `Date.now()` and clears itself when the burst passes.
- **Thresholds are named constants, not per-exam settings.** The three client-side ones live together in `apps/web/lib/attention-alert.ts`: `ATTENTION_ALERT_COUNT = 5`, `ATTENTION_WINDOW_MINUTES = 2`, `NOTIFY_REARM_MINUTES = 10`. `ALERT_HISTORY_MINUTES = 30` is server-side and lives in `apps/exam-runtime/src/monitoring/monitoring.service.ts` — the two apps do not share a package, so it cannot join the others.
- **The flag must decay on a timer, not only on incoming events.** It is computed from `Date.now()` at render time, and when a burst stops no further socket events arrive — so without a periodic re-render the badge would stay lit indefinitely, which is the opposite of "clears itself". A tick drives this (Task 5).
- **Anything that must work while the recruiter is on another in-app tab has to live on the page, not in `LiveMonitoringPanel`.** Radix unmounts inactive tab content. This applies to the monitoring hook, the flag computation, and the notification hook — the panel only ever renders UI.
- **Only medium and high severity count** toward the flag, matching the existing "Integrity alerts" column filter.
- **Notifications fire only when `document.visibilityState === 'hidden'`**, at most once per candidate per flare-up.
- **Notification permission is requested from an explicit button click**, never on page load.
- **The system never takes automatic action** — it does not relax proctoring, pause, or message anyone. It only surfaces.
- If notification permission is denied or unsupported, all in-app surfacing must still work.
- Run each Jest suite **alone** (`--maxWorkers=2`). Running apps/api, apps/exam-runtime and apps/web concurrently on this machine produces resource-contention failures that are not real.
- Baseline to preserve: apps/api 540, apps/exam-runtime 454, apps/web 595.

## File Structure

| File | Responsibility |
|---|---|
| `apps/exam-runtime/src/monitoring/monitoring.service.ts` | Query recent medium/high proctoring events for an exam |
| `apps/exam-runtime/src/monitoring/monitoring.gateway.ts` | Emit `proctoring:recent` on join |
| `apps/web/lib/hooks/useExamMonitoring.ts` | Seed `alerts` from `proctoring:recent` |
| `apps/web/lib/attention-alert.ts` | **New.** Constants + the pure flagging rule |
| `apps/web/app/(recruiter)/exams/[id]/edit/page.tsx` | Owns the monitoring hook; renders the Live tab count |
| `apps/web/components/LiveMonitoringPanel.tsx` | Takes monitoring data as props; row highlight, badge, enable-alerts button |
| `apps/web/lib/hooks/useAttentionNotifications.ts` | **New.** Permission, visibility gate, once-per-flare-up dedup |

---

### Task 1: Server replays recent alerts on join

**Files:**
- Modify: `apps/exam-runtime/src/monitoring/monitoring.service.ts`
- Modify: `apps/exam-runtime/src/monitoring/monitoring.gateway.ts` (the `join-exam` handler, after the `roster:snapshot` emit)
- Test: `apps/exam-runtime/src/monitoring/monitoring.service.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `MonitoringService.getRecentAlerts(context: TenantContext, examId: string): Promise<RecentAlert[]>` where `RecentAlert = { attemptId: string; candidateId: string; eventType: string; severity: string; occurredAt: Date }` — deliberately the same shape the existing `proctoring:flag` event emits, so the client can treat both identically. Socket event name: `proctoring:recent`, payload `RecentAlert[]`.

- [ ] **Step 1: Write the failing test**

Append to `apps/exam-runtime/src/monitoring/monitoring.service.spec.ts`, following the existing `getRosterSnapshot` tests' mock style:

```ts
describe('getRecentAlerts', () => {
  it('returns only medium and high severity events within the window, newest first, capped', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      proctoringEvent: {
        findMany: jest.fn().mockResolvedValue([
          { attemptId: 'a1', eventType: 'tab_switch', severity: 'high', occurredAt: new Date('2026-07-25T10:00:00Z'), attempt: { candidateId: 'c1' } },
        ]),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(tx));

    const alerts = await service.getRecentAlerts(context, 'exam-1');

    expect(alerts).toEqual([
      { attemptId: 'a1', candidateId: 'c1', eventType: 'tab_switch', severity: 'high', occurredAt: new Date('2026-07-25T10:00:00Z') },
    ]);
    const args = tx.proctoringEvent.findMany.mock.calls[0][0];
    expect(args.where.severity).toEqual({ in: ['medium', 'high'] });
    expect(args.where.attempt).toEqual({ examId: 'exam-1' });
    expect(args.where.occurredAt.gt).toBeInstanceOf(Date);
    expect(args.orderBy).toEqual({ occurredAt: 'desc' });
    expect(args.take).toBe(50);
  });

  it('throws NotFoundException when the exam does not belong to the caller organization', async () => {
    const tx = { exam: { findFirst: jest.fn().mockResolvedValue(null) }, proctoringEvent: { findMany: jest.fn() } };
    tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(tx));

    await expect(service.getRecentAlerts(context, 'exam-1')).rejects.toThrow(NotFoundException);
    expect(tx.proctoringEvent.findMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd "D:/exam app/apps/exam-runtime" && npx jest src/monitoring/monitoring.service.spec.ts -t "getRecentAlerts"
```

Expected: FAIL — `service.getRecentAlerts is not a function`.

- [ ] **Step 3: Implement the query**

In `apps/exam-runtime/src/monitoring/monitoring.service.ts`, add near the top:

```ts
export const ALERT_HISTORY_MINUTES = 30;
const MAX_RECENT_ALERTS = 50;

export interface RecentAlert {
  attemptId: string;
  candidateId: string;
  eventType: string;
  severity: string;
  occurredAt: Date;
}
```

Then add the method to `MonitoringService`:

```ts
  // The recruiter's alert feed is in-memory socket state with no replay, so a recruiter
  // joining mid-exam previously saw zero alerts for everyone regardless of what had
  // happened. Replaying recent history makes the count truthful and lets the
  // attention rule see bursts that started before they opened the tab.
  async getRecentAlerts(context: TenantContext, examId: string): Promise<RecentAlert[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }
      const since = new Date(Date.now() - ALERT_HISTORY_MINUTES * 60_000);
      const events = await tx.proctoringEvent.findMany({
        where: { attempt: { examId }, severity: { in: ['medium', 'high'] }, occurredAt: { gt: since } },
        orderBy: { occurredAt: 'desc' },
        take: MAX_RECENT_ALERTS,
        include: { attempt: { select: { candidateId: true } } },
      });
      return events.map((event) => ({
        attemptId: event.attemptId,
        candidateId: event.attempt.candidateId,
        eventType: event.eventType,
        severity: event.severity,
        occurredAt: event.occurredAt,
      }));
    });
  }
```

Ensure `NotFoundException` is imported from `@nestjs/common` (it already is, for `getRosterSnapshot`).

- [ ] **Step 4: Emit it on join**

In `apps/exam-runtime/src/monitoring/monitoring.gateway.ts`, in the `join-exam` handler, immediately after `client.emit('roster:snapshot', roster);` add:

```ts
    const recentAlerts = await this.monitoring.getRecentAlerts(context, body.examId);
    client.emit('proctoring:recent', recentAlerts);
```

Emitted only to the joining client, not the room — it is history for that recruiter, not a new event for everyone.

- [ ] **Step 5: Run the tests**

```bash
cd "D:/exam app/apps/exam-runtime" && npx jest src/monitoring
```

Expected: PASS, all monitoring specs green.

- [ ] **Step 6: Commit**

```bash
git add apps/exam-runtime/src/monitoring/
git commit -m "feat: replay recent proctoring alerts to a joining recruiter"
```

---

### Task 2: Client seeds its alert feed from the replay

**Files:**
- Modify: `apps/web/lib/hooks/useExamMonitoring.ts`
- Test: `apps/web/lib/hooks/useExamMonitoring.test.tsx`

**Interfaces:**
- Consumes: the `proctoring:recent` event from Task 1.
- Produces: no signature change. `alerts` is simply non-empty on join when history exists.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/lib/hooks/useExamMonitoring.test.tsx`, following the file's existing socket-mock conventions:

```ts
it('seeds the alert feed from proctoring:recent and still appends live flags', async () => {
  const { result, emit } = renderMonitoring('exam-1');

  emit('proctoring:recent', [
    { attemptId: 'a1', candidateId: 'c1', eventType: 'tab_switch', severity: 'high', occurredAt: '2026-07-25T10:00:00.000Z' },
    { attemptId: 'a2', candidateId: 'c2', eventType: 'window_blur', severity: 'medium', occurredAt: '2026-07-25T09:59:00.000Z' },
  ]);

  await waitFor(() => expect(result.current.alerts).toHaveLength(2));

  emit('proctoring:flag', { attemptId: 'a1', candidateId: 'c1', eventType: 'copy_paste', severity: 'medium', occurredAt: '2026-07-25T10:01:00.000Z' });

  await waitFor(() => expect(result.current.alerts).toHaveLength(3));
  expect(result.current.alerts[0].eventType).toBe('copy_paste');
});
```

`renderMonitoring` / `emit` reflect however this spec file already drives its mocked socket — read the file first and match it; do not introduce a second mocking style.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd "D:/exam app/apps/web" && npx jest lib/hooks/useExamMonitoring.test.tsx -t "seeds the alert feed"
```

Expected: FAIL — `alerts` stays empty after `proctoring:recent`.

- [ ] **Step 3: Handle the event**

In `apps/web/lib/hooks/useExamMonitoring.ts`, directly above the existing `proctoring:flag` handler:

```ts
    socket.on('proctoring:recent', (rows: ProctoringFlag[]) => {
      // Replayed history for this recruiter, newest first and already capped server-side.
      // Replaces rather than merges: it only ever arrives once, immediately on join,
      // before any live flag can have been appended.
      setAlerts(rows.slice(0, MAX_ALERTS));
    });
```

Also update the stale comment on the `auth` callback (around line 45) that says the alert feed "has no server-side replay" — it now does.

- [ ] **Step 4: Run the tests**

```bash
cd "D:/exam app/apps/web" && npx jest lib/hooks/useExamMonitoring.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/hooks/useExamMonitoring.ts apps/web/lib/hooks/useExamMonitoring.test.tsx
git commit -m "feat: seed the recruiter alert feed from replayed history"
```

---

### Task 3: The attention rule

**Files:**
- Create: `apps/web/lib/attention-alert.ts`
- Test: `apps/web/lib/attention-alert.test.ts`

**Interfaces:**
- Consumes: `ProctoringFlag` from `apps/web/lib/types.ts`.
- Produces:
  - `export const ATTENTION_ALERT_COUNT = 5`
  - `export const ATTENTION_WINDOW_MINUTES = 2`
  - `export function flaggedAttemptIds(alerts: ProctoringFlag[], now: number): Set<string>`

A pure function taking `now` explicitly rather than calling `Date.now()` internally, so tests are deterministic and no fake timers are needed.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/lib/attention-alert.test.ts`:

```ts
import { flaggedAttemptIds, ATTENTION_ALERT_COUNT } from './attention-alert';
import { ProctoringFlag } from './types';

const NOW = new Date('2026-07-25T10:00:00.000Z').getTime();

function alert(attemptId: string, secondsAgo: number, severity = 'high'): ProctoringFlag {
  return {
    attemptId,
    candidateId: `cand-${attemptId}`,
    eventType: 'tab_switch',
    severity,
    occurredAt: new Date(NOW - secondsAgo * 1000).toISOString(),
  };
}

describe('flaggedAttemptIds', () => {
  it('does not flag below the threshold', () => {
    const alerts = Array.from({ length: ATTENTION_ALERT_COUNT - 1 }, (_, i) => alert('a1', i));
    expect(flaggedAttemptIds(alerts, NOW).has('a1')).toBe(false);
  });

  it('flags at the threshold', () => {
    const alerts = Array.from({ length: ATTENTION_ALERT_COUNT }, (_, i) => alert('a1', i));
    expect(flaggedAttemptIds(alerts, NOW).has('a1')).toBe(true);
  });

  it('ignores alerts older than the window', () => {
    const alerts = Array.from({ length: ATTENTION_ALERT_COUNT }, (_, i) => alert('a1', 200 + i));
    expect(flaggedAttemptIds(alerts, NOW).has('a1')).toBe(false);
  });

  it('counts each attempt separately', () => {
    const alerts = [
      ...Array.from({ length: ATTENTION_ALERT_COUNT }, (_, i) => alert('a1', i)),
      ...Array.from({ length: ATTENTION_ALERT_COUNT - 1 }, (_, i) => alert('a2', i)),
    ];
    const flagged = flaggedAttemptIds(alerts, NOW);
    expect(flagged.has('a1')).toBe(true);
    expect(flagged.has('a2')).toBe(false);
  });

  it('ignores low severity', () => {
    const alerts = Array.from({ length: ATTENTION_ALERT_COUNT }, (_, i) => alert('a1', i, 'low'));
    expect(flaggedAttemptIds(alerts, NOW).has('a1')).toBe(false);
  });

  it('returns an empty set for no alerts', () => {
    expect(flaggedAttemptIds([], NOW).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "D:/exam app/apps/web" && npx jest lib/attention-alert.test.ts
```

Expected: FAIL — cannot resolve `./attention-alert`.

- [ ] **Step 3: Implement**

Create `apps/web/lib/attention-alert.ts`:

```ts
import { ProctoringFlag } from './types';

// A single violation is the ordinary case and must never flag. A burst is either a
// misfiring machine or a candidate repeatedly leaving the exam -- both need a human.
export const ATTENTION_ALERT_COUNT = 5;
export const ATTENTION_WINDOW_MINUTES = 2;

// Derived, never stored: the flag is a function of the feed and the clock, so it clears
// itself when the burst passes and cannot survive a reload as stale state.
export function flaggedAttemptIds(alerts: ProctoringFlag[], now: number): Set<string> {
  const cutoff = now - ATTENTION_WINDOW_MINUTES * 60_000;
  const counts = new Map<string, number>();
  for (const alert of alerts) {
    if (alert.severity !== 'medium' && alert.severity !== 'high') continue;
    if (new Date(alert.occurredAt).getTime() < cutoff) continue;
    counts.set(alert.attemptId, (counts.get(alert.attemptId) ?? 0) + 1);
  }
  const flagged = new Set<string>();
  for (const [attemptId, count] of counts) {
    if (count >= ATTENTION_ALERT_COUNT) flagged.add(attemptId);
  }
  return flagged;
}
```

- [ ] **Step 4: Run the tests**

```bash
cd "D:/exam app/apps/web" && npx jest lib/attention-alert.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/attention-alert.ts apps/web/lib/attention-alert.test.ts
git commit -m "feat: add the candidate-attention flagging rule"
```

---

### Task 4: Move the monitoring hook up to the exam page

Without this the feature cannot work at all: `TabsContent` is Radix's, which unmounts inactive tabs, so `LiveMonitoringPanel` and its socket are destroyed whenever the recruiter is on Details or Candidates — no data, no count, no notification.

**Files:**
- Modify: `apps/web/app/(recruiter)/exams/[id]/edit/page.tsx`
- Modify: `apps/web/components/LiveMonitoringPanel.tsx`
- Test: `apps/web/components/LiveMonitoringPanel.test.tsx`

**Interfaces:**
- Consumes: `useExamMonitoring(examId)` returning `{ roster, alerts, leaderboard, connectionStatus, joinError }`.
- Produces: `LiveMonitoringPanel` prop signature becomes
  `{ examId: string; roster: RosterRow[]; alerts: ProctoringFlag[]; connectionStatus: ConnectionStatus; joinError: string | null }`.
  It keeps `examId` because the proctoring-log modal and the moderation mutations still need it.

- [ ] **Step 1: Change the panel to take data as props**

In `apps/web/components/LiveMonitoringPanel.tsx`, replace the internal hook call:

```ts
export function LiveMonitoringPanel({ examId }: { examId: string }) {
  const { roster, alerts, connectionStatus, joinError } = useExamMonitoring(examId);
```

with:

```ts
export function LiveMonitoringPanel({
  examId,
  roster,
  alerts,
  connectionStatus,
  joinError,
}: {
  examId: string;
  roster: RosterRow[];
  alerts: ProctoringFlag[];
  connectionStatus: ConnectionStatus;
  joinError: string | null;
}) {
```

Remove the now-unused `useExamMonitoring` import and add `RosterRow`, `ProctoringFlag`, `ConnectionStatus` to the existing `../lib/types` import. Change nothing else in the component — the roster columns, bypass actions and log modal all keep working off the same variable names.

- [ ] **Step 2: Call the hook in the page and pass it down**

In `apps/web/app/(recruiter)/exams/[id]/edit/page.tsx`, add the import and the hook call in the component body (before the `if (!exam)` early return, so hook order is stable):

```ts
import { useExamMonitoring } from '../../../../../lib/hooks/useExamMonitoring';
```

```ts
  const monitoring = useExamMonitoring(params.id);
```

Then change the Live tab content to:

```tsx
        <TabsContent value="live">
          <LiveMonitoringPanel
            examId={exam.id}
            roster={monitoring.roster}
            alerts={monitoring.alerts}
            connectionStatus={monitoring.connectionStatus}
            joinError={monitoring.joinError}
          />
        </TabsContent>
```

The hook must be called unconditionally at the top of the component — calling it after the `if (!exam) return` would violate the rules of hooks.

- [ ] **Step 3: Update the panel's tests**

`LiveMonitoringPanel.test.tsx` currently stubs `useExamMonitoring`. The panel no longer calls it, so `renderPanelWithRoster` must pass the data as props instead. Update that one helper — every existing test keeps its assertions unchanged. If a test asserts on `connectionStatus` or `joinError` behaviour, pass those through the helper too.

Do not weaken, retitle, or change the expected values of any existing test; only the mechanism by which the roster reaches the component changes.

- [ ] **Step 4: Run the tests**

```bash
cd "D:/exam app/apps/web" && npx jest components/LiveMonitoringPanel.test.tsx
```

Expected: PASS, all existing tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/LiveMonitoringPanel.tsx apps/web/components/LiveMonitoringPanel.test.tsx "apps/web/app/(recruiter)/exams/[id]/edit/page.tsx"
git commit -m "refactor: own the monitoring socket at the exam page so it survives tab switches"
```

---

### Task 5: Surface the flag in the roster and on the Live tab

**Files:**
- Modify: `apps/web/components/LiveMonitoringPanel.tsx`
- Modify: `apps/web/app/(recruiter)/exams/[id]/edit/page.tsx`
- Test: `apps/web/components/LiveMonitoringPanel.test.tsx`

**Interfaces:**
- Consumes: `flaggedAttemptIds` (Task 3), the props from Task 4.
- Produces: `LiveMonitoringPanel` gains one more prop, `flagged: Set<string>`.

**The flag is computed once, in the page, on a timer.** Two reasons it cannot be computed inside the panel:

1. The panel is unmounted whenever the recruiter is on another tab, so the Live tab count would have nothing to read.
2. `flaggedAttemptIds` reads `Date.now()` at render time. When a burst stops, no further socket events arrive, so nothing triggers a re-render and the badge would stay lit forever. A tick is required for it to decay.

So the page holds a `useState` tick advanced by a `setInterval` every 15 seconds, computes `flagged` once, renders the count in the tab trigger, and passes the same `Set` to the panel. One computation, one timer, and the badge and the count can never disagree.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/components/LiveMonitoringPanel.test.tsx`, using the existing `renderPanelWithRoster` helper (extended in Task 4 to accept alerts):

```ts
describe('attention flag', () => {
  function burst(attemptId: string, count: number) {
    return Array.from({ length: count }, (_, i) => ({
      attemptId, candidateId: 'c1', eventType: 'tab_switch', severity: 'high',
      occurredAt: new Date(Date.now() - i * 1000).toISOString(),
    }));
  }

  it('shows a Needs attention badge for a candidate in a burst', async () => {
    renderPanelWithRoster(
      [{ candidateId: 'c1', candidateName: 'Ann', invitationId: 'i1', attemptId: 'a1', status: 'in_progress',
         online: true, remainingSeconds: 600, answeredCount: 1, totalQuestions: 5, proctoringBypassed: false }],
      burst('a1', 5),
    );

    expect(await screen.findByText('Needs attention')).toBeInTheDocument();
  });

  it('shows no badge below the threshold', async () => {
    renderPanelWithRoster(
      [{ candidateId: 'c1', candidateName: 'Ann', invitationId: 'i1', attemptId: 'a1', status: 'in_progress',
         online: true, remainingSeconds: 600, answeredCount: 1, totalQuestions: 5, proctoringBypassed: false }],
      burst('a1', 4),
    );

    await screen.findByText('Ann');
    expect(screen.queryByText('Needs attention')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd "D:/exam app/apps/web" && npx jest components/LiveMonitoringPanel.test.tsx -t "attention flag"
```

Expected: FAIL — no "Needs attention" text.

- [ ] **Step 3: Render the badge from a prop**

In `LiveMonitoringPanel.tsx`, add `flagged: Set<string>` to the props destructure and type. In the Status column renderer, beside the existing badges:

```tsx
          {row.attemptId && flagged.has(row.attemptId) ? <Badge variant="danger">Needs attention</Badge> : null}
```

The panel computes nothing — see the note above for why.

- [ ] **Step 4: Compute it once in the page, on a tick, and show the count**

In the edit page:

```ts
import { useEffect, useState } from 'react';
import { flaggedAttemptIds } from '../../../../../lib/attention-alert';
```

```ts
  // The flag is derived from Date.now(), and a burst that stops produces no further
  // socket events -- without this tick nothing would re-render and the badge would
  // stay lit after the candidate had settled down.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((value) => value + 1), 15_000);
    return () => clearInterval(id);
  }, []);
  const flagged = useMemo(() => flaggedAttemptIds(monitoring.alerts, Date.now()), [monitoring.alerts, tick]);
```

Add `useMemo` to the React import. The `tick` dependency is intentional and will look unused to a linter — keep it, it is what drives decay. If the lint rule complains about an unnecessary dependency, silence it with a comment explaining why rather than removing it.

Render the count and pass the set down:

```tsx
          <TabsTrigger value="live">Live{flagged.size > 0 ? ` (${flagged.size})` : ''}</TabsTrigger>
```

```tsx
          <LiveMonitoringPanel examId={exam.id} flagged={flagged} roster={monitoring.roster} alerts={monitoring.alerts} connectionStatus={monitoring.connectionStatus} joinError={monitoring.joinError} />
```

Add a test asserting the badge disappears once the alerts fall outside the window — drive it by passing an already-stale `alerts` array rather than by waiting on the real 15-second timer.

- [ ] **Step 5: Run the tests**

```bash
cd "D:/exam app/apps/web" && npx jest components/LiveMonitoringPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/LiveMonitoringPanel.tsx apps/web/components/LiveMonitoringPanel.test.tsx "apps/web/app/(recruiter)/exams/[id]/edit/page.tsx"
git commit -m "feat: flag candidates needing attention in the roster and on the Live tab"
```

---

### Task 6: Desktop notification

**Files:**
- Create: `apps/web/lib/hooks/useAttentionNotifications.ts`
- Create: `apps/web/lib/hooks/useAttentionNotifications.test.tsx`
- Modify: `apps/web/components/LiveMonitoringPanel.tsx` (the "Enable alerts" button)

**Interfaces:**
- Consumes: `flaggedAttemptIds` (Task 3).
- Produces: `useAttentionNotifications(flagged: Set<string>, rosterByAttemptId: Map<string, string>, examTitle: string): { permission: NotificationPermission | 'unsupported'; requestPermission: () => void }` — the map is attemptId → candidate name, so the notification can name the person.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/lib/hooks/useAttentionNotifications.test.tsx`. Stub `window.Notification` with a jest mock constructor and control `document.visibilityState` with `Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })`:

- Fires a notification when a new attemptId becomes flagged while `visibilityState` is `hidden`.
- Fires nothing when `visibilityState` is `visible`.
- Fires once per flare-up: a second render with the same attempt still flagged does not fire again.
- Fires nothing when permission is `denied`.
- Reports `'unsupported'` and never throws when `window.Notification` is undefined.
- The notification body contains the candidate's name.

- [ ] **Step 2: Run to verify failure**

```bash
cd "D:/exam app/apps/web" && npx jest lib/hooks/useAttentionNotifications.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Create `apps/web/lib/hooks/useAttentionNotifications.ts`. Requirements the implementation must satisfy:

- Track already-notified attempt ids in a `useRef<Map<string, number>>` (attemptId → timestamp last notified). An attempt is eligible again only once it has been absent from `flagged` and `NOTIFY_REARM_MINUTES` (10) have passed since the last notification. Without the re-arm, a sustained burst re-notifies on every incoming event.
- Fire only when `document.visibilityState === 'hidden'` and `Notification.permission === 'granted'`.
- `requestPermission()` calls `Notification.requestPermission()` and stores the result in state. It must only ever be invoked from a user gesture — never call it on mount.
- Guard every access with `typeof window !== 'undefined' && 'Notification' in window`, returning `'unsupported'` otherwise. This runs in a Next.js app where the module may be evaluated server-side.
- Notification title names the exam; body names the candidate, e.g. `Ann is generating a lot of proctoring alerts`.

Export `NOTIFY_REARM_MINUTES = 10` from `apps/web/lib/attention-alert.ts` alongside the other constants so all four thresholds live together.

- [ ] **Step 4: Call the hook in the page, render the button in the panel**

**The hook must be called in the exam page, not in `LiveMonitoringPanel`.** The panel is unmounted whenever the recruiter is on the Details or Candidates tab — which is exactly when a notification is most useful — so a hook living there could never fire in the case it exists for.

In the edit page, alongside the `flagged` computation from Task 5:

```ts
  const candidateNames = useMemo(
    () => new Map(monitoring.roster.filter((row) => row.attemptId).map((row) => [row.attemptId as string, row.candidateName])),
    [monitoring.roster],
  );
  const notifications = useAttentionNotifications(flagged, candidateNames, exam.title);
```

Pass `notificationPermission={notifications.permission}` and `onEnableNotifications={notifications.requestPermission}` to `LiveMonitoringPanel`, and add both to its props type.

Then in `LiveMonitoringPanel.tsx`, render a button beside the connection-status badge, shown only when the permission is `'default'`:

```tsx
        {notificationPermission === 'default' ? (
          <button onClick={notifications.requestPermission} className="rounded-full border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50">
            Enable alerts
          </button>
        ) : null}
```

- [ ] **Step 5: Run the tests**

```bash
cd "D:/exam app/apps/web" && npx jest lib/hooks/useAttentionNotifications.test.tsx components/LiveMonitoringPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/hooks/useAttentionNotifications.ts apps/web/lib/hooks/useAttentionNotifications.test.tsx apps/web/lib/attention-alert.ts apps/web/components/LiveMonitoringPanel.tsx
git commit -m "feat: notify the recruiter when a candidate needs attention and the tab is hidden"
```

---

### Task 7: Verification and deployment

**GATED: do not deploy without explicit user approval.**

- [ ] **Step 1: Run all three suites and both typechecks, each alone**

```bash
cd "D:/exam app/apps/exam-runtime" && npx jest --maxWorkers=2 && npx tsc --noEmit
```

```bash
cd "D:/exam app/apps/api" && npx jest --maxWorkers=2 && npx tsc --noEmit
```

```bash
cd "D:/exam app/apps/web" && npx jest --maxWorkers=2
```

Expected: no regression against api 540 / exam-runtime 454 / web 595.

- [ ] **Step 2: Verify in a real browser**

Via the preview tooling, never a plain shell dev server. Confirm: opening Live mid-exam now shows real alert counts rather than zeros; a candidate generating 5 rapid violations gets the "Needs attention" badge and the Live tab shows a count; switching to the Details tab keeps the count updating (proving Task 4 worked); the flag clears once the burst stops.

- [ ] **Step 3: Check production for live sessions, then ask for deployment approval**

Report the live-attempt count and the test results, then wait for an explicit yes.

- [ ] **Step 4: Deploy**

Only `apps/exam-runtime` and `apps/web` change — there is no migration and no `apps/api` change, so `pm2 restart exam-runtime web` is sufficient. Otherwise follow the established recipe: one `scp` per file with its full destination path, md5-verify every file against local, background builds with done-markers, the Next standalone `.next/static` + `public` copy, then restart.

- [ ] **Step 5: Record in Azure DevOps**

Create a Feature under Epic 6084 with User Stories for the alert replay, the attention rule and surfacing, and the notification. Substantive descriptions, closed once Step 4 verifies.

## Out of Scope

- Email notification (deferred until real usage shows the app-closed gap matters).
- Server-side detection.
- Per-exam configurable thresholds.
- Any automatic action — the system surfaces, a human decides.
