# Today Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new recruiter landing page, `/v2/today`, that lists what needs the signed-in user right now (feedback owed, interviews today, offers expiring, approvals waiting), an org-wide "worth a look" rail and a quiet week strip — fed by one new endpoint `GET /dashboard/today`. No schema change. The old dashboard stays.

**Architecture:** A pure approvals predicate moves into `packages/shared` (shared by the inbox and Today). A pure `dayWindow(now, timeZone)` helper computes the user's local day. `DashboardService.getToday` runs every query in one `forTenant`, builds `TodayItem`s with hrefs, and reuses `getSummary('7d')` + `getAnalytics` for the week strip. The web page renders the payload with `ui-v2` primitives; nav + landing redirect gain Today.

**Tech Stack:** NestJS 10, Prisma 5.22 (no migration), Next.js (apps/web, React Query, lucide-react), Jest.

**Spec:** docs/superpowers/specs/2026-09-08-today-home-design.md

## Global Constraints

- **Work ONLY in the worktree** `C:\D-drive\exam app\.claude\worktrees\today-home` on branch `feat/today-home` (off `docs/design-voice` @ `3fb282b4`). Another session is actively committing to `feat/careers-site` in the main checkout `C:\D-drive\exam app` — **never `cd` there, never run git there.** Every commit command must assert the branch in the same command: `test "$(git branch --show-current)" = feat/today-home && git commit …`.
- **NEVER** `npm install` / `npm ci` / `npm update` (the worktree's `node_modules` are junctions into the main checkout — npm would delete through them). **NEVER run `npx prisma generate`** here (no schema change; it would overwrite the shared client the other session is regenerating). Use only existing `npx jest` / `npx tsc`, run FROM `apps/api`, `apps/web` or `packages/shared` inside the worktree.
- After any change under `packages/shared/src`, rebuild its dist in the worktree (`cd packages/shared && npx tsc`) before running api jest/tsc — apps/api compiles against `packages/shared/dist`. Run the shared jest too.
- Design rules are binding and already in the tree: `apps/web/AGENTS.md` "Workfox design voice" block + `docs/brand/workfox-ui-review-checklist.md` "Information design" chapter. Concretely: person + context + one action per row; groups with zero items are NOT rendered; **exactly one solid accent button on the page** (the first row of the first non-empty group; all others outline); Bricolage only for the greeting; sentence case; no exclamation marks; no gradients/gauges/stat tiles; tokens only (`var(--org-primary)` accent slot, never raw hex); `components/ui-v2/*` primitives deep-imported (never the barrel index — jest hazard); no `@exam-platform/shared` runtime VALUE import in apps/web (types-only OK); no new dependency.
- Gating for `GET /dashboard/today` is identical to `GET /dashboard/summary` (class-level `JwtAuthGuard` + `PermissionsGuard`, no extra permission). Every candidate-bearing query filters `candidate.erasedAt: null`. Tenant safety: all reads via `TenantPrismaService.forTenant`.
- Existing dashboard code and tests stay untouched and green. Full api + web jest green; api tsc clean; web tsc no NEW errors (pre-existing `.next/types` noise is not a failure). Known pre-existing web failure `ImpersonationBanner.test.tsx` is unrelated — report it, don't chase it.
- Attribution footer on every commit: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

### Task 1: Shared approvals predicate (`isPendingForApprover`) + inbox refactor

**Files:**
- Modify: `packages/shared/src/approvals/approval-types.ts` (append two pure functions)
- Test: `packages/shared/src/approvals/approval-types.spec.ts` (extend)
- Modify: `apps/api/src/approvals/approvals.service.ts` (`listRequests` uses the helper — behavior-preserving)

**Interfaces:**
- Produces: `currentStepApproverIds(chainSnapshotJson: string, currentStepPosition: number): string[]` and `isPendingForApprover(row: { status: string; chainSnapshotJson: string; currentStepPosition: number }, userId: string): boolean`, exported from `@exam-platform/shared`.

- [ ] **Step 1: Failing tests** in `approval-types.spec.ts`:
```ts
import { currentStepApproverIds, isPendingForApprover } from './approval-types';

describe('currentStepApproverIds', () => {
  const snap = JSON.stringify([{ approverUserIds: ['u1'] }, { approverUserIds: ['u2', 'u3'] }]);
  it('returns the approver ids of the current step', () => {
    expect(currentStepApproverIds(snap, 1)).toEqual(['u2', 'u3']);
  });
  it('returns [] for a missing step, malformed JSON, or non-string ids', () => {
    expect(currentStepApproverIds(snap, 5)).toEqual([]);
    expect(currentStepApproverIds('not json', 0)).toEqual([]);
    expect(currentStepApproverIds(JSON.stringify([{ approverUserIds: [1, null] }]), 0)).toEqual([]);
  });
});

describe('isPendingForApprover', () => {
  const snap = JSON.stringify([{ approverUserIds: ['u1'] }, { approverUserIds: ['u2'] }]);
  it('is true only when pending and the user is on the current step', () => {
    expect(isPendingForApprover({ status: 'pending_approval', chainSnapshotJson: snap, currentStepPosition: 1 }, 'u2')).toBe(true);
    expect(isPendingForApprover({ status: 'pending_approval', chainSnapshotJson: snap, currentStepPosition: 1 }, 'u1')).toBe(false);
    expect(isPendingForApprover({ status: 'approved', chainSnapshotJson: snap, currentStepPosition: 1 }, 'u2')).toBe(false);
  });
});
```
Run: `cd packages/shared && npx jest approval-types` → FAIL (not exported).

- [ ] **Step 2: Implement** (append to `approval-types.ts`):
```ts
// The frozen chain is stored as JSON on the request; the current step's approvers are the only
// people who can act on it right now. Shared by the approvals inbox and the Today home so the
// definition of "pending for me" exists exactly once.
export function currentStepApproverIds(chainSnapshotJson: string, currentStepPosition: number): string[] {
  try {
    const steps = JSON.parse(chainSnapshotJson) as { approverUserIds?: unknown }[];
    const ids = steps?.[currentStepPosition]?.approverUserIds;
    return Array.isArray(ids) && ids.every((x) => typeof x === 'string') ? (ids as string[]) : [];
  } catch {
    return [];
  }
}

export function isPendingForApprover(
  row: { status: string; chainSnapshotJson: string; currentStepPosition: number },
  userId: string,
): boolean {
  return row.status === 'pending_approval' && currentStepApproverIds(row.chainSnapshotJson, row.currentStepPosition).includes(userId);
}
```

- [ ] **Step 3: Refactor `listRequests`** in `approvals.service.ts`: replace the inline filter (`const steps = JSON.parse(r.chainSnapshotJson); const step = steps[r.currentStepPosition]; return !!step && step.approverUserIds.includes(userId);`) with `rows = all.filter((r) => isPendingForApprover(r, userId));` (import from `@exam-platform/shared`). No other behavior change.

- [ ] **Step 4: Build + tests + tsc.** `cd packages/shared && npx tsc && npx jest` (all green); `cd apps/api && npx jest approvals && npx tsc --noEmit`.

- [ ] **Step 5: Commit.**
```bash
test "$(git branch --show-current)" = feat/today-home && git add packages/shared/src/approvals apps/api/src/approvals/approvals.service.ts && git commit -m "feat(today): shared isPendingForApprover predicate; inbox uses it"
```

---

### Task 2: Pure day-window helper (`dayWindow`)

**Files:**
- Create: `apps/api/src/dashboard/today-window.ts`
- Test: `apps/api/src/dashboard/today-window.spec.ts`

**Interfaces:**
- Produces: `dayWindow(now: Date, timeZone: string | null | undefined): { start: Date; end: Date; iso: string; timeZone: string }` — `start`/`end` are the UTC instants of local midnight today and tomorrow in `timeZone` (fallback `UTC` when invalid/absent); `iso` is `YYYY-MM-DD` in that zone. `isValidTimeZone(tz)`.

- [ ] **Step 1: Failing tests** `today-window.spec.ts`:
```ts
import { dayWindow, isValidTimeZone } from './today-window';

describe('dayWindow', () => {
  it('uses UTC midnight when the zone is UTC', () => {
    const w = dayWindow(new Date('2026-09-08T10:00:00Z'), 'UTC');
    expect(w.iso).toBe('2026-09-08');
    expect(w.start.toISOString()).toBe('2026-09-08T00:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-09-09T00:00:00.000Z');
  });
  it('places a late-UTC instant in the NEXT local day for Asia/Kolkata (+05:30)', () => {
    const w = dayWindow(new Date('2026-09-08T18:31:00Z'), 'Asia/Kolkata'); // 00:01 local on the 9th
    expect(w.iso).toBe('2026-09-09');
    expect(w.start.toISOString()).toBe('2026-09-08T18:30:00.000Z');
    expect(w.end.toISOString()).toBe('2026-09-09T18:30:00.000Z');
  });
  it('keeps an instant before local midnight in the current local day', () => {
    const w = dayWindow(new Date('2026-09-08T18:00:00Z'), 'Asia/Kolkata'); // 23:30 local on the 8th
    expect(w.iso).toBe('2026-09-08');
    expect(w.start.toISOString()).toBe('2026-09-07T18:30:00.000Z');
  });
  it('falls back to UTC for an invalid or missing zone', () => {
    expect(dayWindow(new Date('2026-09-08T10:00:00Z'), 'Mars/Olympus').timeZone).toBe('UTC');
    expect(dayWindow(new Date('2026-09-08T10:00:00Z'), null).timeZone).toBe('UTC');
    expect(isValidTimeZone('Europe/Berlin')).toBe(true);
    expect(isValidTimeZone('nope')).toBe(false);
  });
});
```
Run: `cd apps/api && npx jest today-window` → FAIL.

- [ ] **Step 2: Implement** `today-window.ts` (Intl only — no dependency):
```ts
export interface DayWindow { start: Date; end: Date; iso: string; timeZone: string }

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

// Wall-clock parts of `d` as seen in `tz`.
function wallParts(d: Date, tz: string): { y: number; m: number; day: number; h: number; min: number; s: number } {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, day: +o.day, h: +o.hour % 24, min: +o.minute, s: +o.second };
}

// The UTC instant at which the wall clock in `tz` reads 00:00 on the local date of `now`.
// Two correction passes absorb the zone's offset (and a DST change on that day).
export function dayWindow(now: Date, timeZone: string | null | undefined): DayWindow {
  const tz = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const p = wallParts(now, tz);
  const iso = `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  const targetWall = Date.UTC(p.y, p.m - 1, p.day, 0, 0, 0);
  let start = new Date(targetWall);
  for (let i = 0; i < 2; i++) {
    const w = wallParts(start, tz);
    const asWall = Date.UTC(w.y, w.m - 1, w.day, w.h, w.min, w.s);
    start = new Date(start.getTime() - (asWall - targetWall));
  }
  // ponytail: end = start + 24h; a DST-transition day is 23/25h and shifts the boundary by ≤1h. Acceptable for
  // "interviews today"; switch to a second zonedMidnight(iso + 1 day) if a reviewer ever hits it.
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000), iso, timeZone: tz };
}
```

- [ ] **Step 3: Run** `npx jest today-window` → PASS; `npx tsc --noEmit` clean.

- [ ] **Step 4: Commit.**
```bash
test "$(git branch --show-current)" = feat/today-home && git add apps/api/src/dashboard/today-window.ts apps/api/src/dashboard/today-window.spec.ts && git commit -m "feat(today): dayWindow helper (user-timezone local day, Intl only)"
```

---

### Task 3: `DashboardService.getToday` + `GET /dashboard/today`

**Files:**
- Modify: `apps/api/src/dashboard/dashboard.service.ts` (add types + `getToday`)
- Modify: `apps/api/src/dashboard/dashboard.controller.ts` (add route)
- Test: `dashboard.service.spec.ts` (new `describe('getToday')`), `dashboard.controller.spec.ts` (new case)

**Interfaces:**
- Consumes: `isPendingForApprover` (T1), `dayWindow` (T2), existing `getSummary(context, '7d')`, `getAnalytics(context, { window: '7d' })`, `STALE_INVITATION_DAYS`.
- Produces (exported from `dashboard.service.ts`, mirrored types-only on the web in T4):
```ts
export interface TodayItem {
  id: string; candidateId: string | null; candidateName: string; subtitle: string;
  at: string | null; actionLabel: string; actionHref: string;
}
export interface TodayResponse {
  today: { iso: string; timeZone: string };
  needsYou: { feedbackOwed: TodayItem[]; interviewsToday: TodayItem[]; offersExpiring: TodayItem[]; approvalsPending: TodayItem[]; total: number };
  watch: { staleInvitations: number; proctoringFlags: number; nextDrive: { id: string; name: string; groupName: string; startsAt: string; registered: number } | null };
  week: { newApplicants: number; invited: number; awaitingGrading: number; passRate: number | null };
}
```
Constants: `FEEDBACK_LOOKBACK_DAYS = 14`, `OFFER_EXPIRY_HORIZON_DAYS = 3`.

- [ ] **Step 1: Failing service tests** (`describe('getToday')`, mocking `forTenant` to call back with a `tx` of jest mocks, and spying `getSummary`/`getAnalytics` to return fixtures). Cases — each asserts the exact `where` shape AND the resulting items:
  1. **interviewsToday**: `tx.interview.findMany` called with `where: { organizationId, status: 'confirmed', confirmedSlotId: { not: null }, panelists: { some: { userId } }, pipelineEntry: { candidate: { erasedAt: null } } }`; a confirmed slot starting inside `[start, end)` → item `{ id, candidateId, candidateName, subtitle: '<job title> · <slot start HH:MM in tz> with panel', at: slotStart ISO, actionLabel: 'Open brief', actionHref: '/v2/jobs/<jobId>' }`; a slot starting yesterday is excluded; sorted by start ascending.
  2. **feedbackOwed**: same fetched interviews; a slot that ended within the last 14 days AND no `pipelineFeedback` row for `(entryId, authorUserId: userId)` → item `{ actionLabel: 'Add feedback', actionHref: '/v2/jobs/<jobId>', at: slotEnd ISO, subtitle: '<job title> · interviewed <relative day> · scorecard due' }`; an entry already rated by THIS user is excluded; one rated only by ANOTHER user is included; a slot older than 14 days is excluded; sorted oldest first. Assert `tx.pipelineFeedback.findMany` called with `where: { authorUserId: userId, entryId: { in: [...] } }`.
  3. **offersExpiring**: `tx.offer.findMany` with `where: { organizationId, status: 'sent', respondedAt: null, expiresAt: { gt: now, lte: now+3d }, pipelineEntry: { candidate: { erasedAt: null } } }` → item `{ actionLabel: 'Nudge', actionHref: '/v2/jobs/<pipelineEntry.jobId>', at: expiresAt ISO, subtitle: '<job title> · offer sent <n> days ago · expires <weekday>' }`; sorted by `expiresAt`.
  4. **approvalsPending**: `tx.approvalRequest.findMany` with `where: { organizationId, status: 'pending_approval' }` then filtered by `isPendingForApprover(r, userId)`; subject label = job title for `subjectType 'job'` (`tx.job.findUnique`), or the offer's `pipelineEntry.candidate.name` for `'offer'`; `actionLabel: 'Review'`, `actionHref: '/v2/approvals'`, `at: submittedAt`; a request whose current step lacks the user is excluded; malformed snapshot excluded, no throw; sorted `submittedAt` ascending.
  5. **total** = sum of the four lengths.
  6. **watch**: `tx.invitation.count` with the summary's stale rule (`status: 'invited', invitedAt: { lte: now − STALE_INVITATION_DAYS }, attempt: null`, exam scoped to org); `tx.proctoringEvent.count` scoped to org exams; `tx.driveSession.findFirst({ where: { walkInGroup: { organizationId }, endsAt: { gt: now } }, orderBy: { startsAt: 'asc' }, include: { walkInGroup: { select: { name: true } } } })` + `tx.invitation.count({ where: { driveSessionId } })` → `nextDrive`; `null` when none.
  7. **week**: `getSummary(context, '7d')` stats mapped (`totalCandidates → newApplicants`, `invitationsSent → invited`, `pendingGradingCount → awaitingGrading`); `getAnalytics(context, { window: '7d' })` → `scores.passRate` rounded, `null` if the analytics call rejects (caught, logged).
  8. **timezone**: `tx.user.findUnique({ where: { id: userId }, select: { timeZone: true } })` → `today.iso`/`today.timeZone` come from `dayWindow`; an invalid zone yields `'UTC'`.
Run: `npx jest dashboard.service` → FAIL.

- [ ] **Step 2: Implement `getToday`** in `dashboard.service.ts` (one `forTenant`; pure helpers for subtitles kept in the same file):
```ts
const FEEDBACK_LOOKBACK_DAYS = 14;
const OFFER_EXPIRY_HORIZON_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

async getToday(context: TenantContext, userId: string, now = new Date()): Promise<TodayResponse> {
  const organizationId = context.organizationId as string;
  const core = await this.tenantPrisma.forTenant(context, async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { timeZone: true } });
    const win = dayWindow(now, user?.timeZone);
    const lookback = new Date(now.getTime() - FEEDBACK_LOOKBACK_DAYS * DAY_MS);
    const horizon = new Date(now.getTime() + OFFER_EXPIRY_HORIZON_DAYS * DAY_MS);
    const staleThreshold = new Date(now.getTime() - STALE_INVITATION_DAYS * DAY_MS);

    const mine = await tx.interview.findMany({
      where: { organizationId, status: 'confirmed', confirmedSlotId: { not: null }, panelists: { some: { userId } }, pipelineEntry: { candidate: { erasedAt: null } } },
      select: {
        id: true, confirmedSlotId: true, pipelineEntryId: true, candidateId: true,
        slots: { select: { id: true, startsAt: true, endsAt: true } },
        pipelineEntry: { select: { jobId: true, job: { select: { title: true } }, candidate: { select: { name: true } } } },
      },
    });
    const withSlot = mine.map((i) => ({ ...i, slot: i.slots.find((s) => s.id === i.confirmedSlotId) })).filter((i) => i.slot);
    const todays = withSlot.filter((i) => i.slot!.startsAt >= win.start && i.slot!.startsAt < win.end).sort((a, b) => +a.slot!.startsAt - +b.slot!.startsAt);
    const ended = withSlot.filter((i) => i.slot!.endsAt < now && i.slot!.endsAt >= lookback);
    const rated = ended.length
      ? await tx.pipelineFeedback.findMany({ where: { authorUserId: userId, entryId: { in: ended.map((i) => i.pipelineEntryId) } }, select: { entryId: true } })
      : [];
    const ratedEntries = new Set(rated.map((r) => r.entryId));
    const owed = ended.filter((i) => !ratedEntries.has(i.pipelineEntryId)).sort((a, b) => +a.slot!.endsAt - +b.slot!.endsAt);

    const offers = await tx.offer.findMany({
      where: { organizationId, status: 'sent', respondedAt: null, expiresAt: { gt: now, lte: horizon }, pipelineEntry: { candidate: { erasedAt: null } } },
      select: { id: true, candidateId: true, expiresAt: true, sentAt: true, pipelineEntry: { select: { jobId: true, job: { select: { title: true } }, candidate: { select: { name: true } } } } },
      orderBy: { expiresAt: 'asc' },
    });

    const pendingAll = await tx.approvalRequest.findMany({
      where: { organizationId, status: 'pending_approval' },
      select: { id: true, subjectType: true, subjectId: true, status: true, chainSnapshotJson: true, currentStepPosition: true, submittedAt: true },
      orderBy: { submittedAt: 'asc' },
    });
    const pending = pendingAll.filter((r) => isPendingForApprover(r, userId));
    const approvals: TodayItem[] = [];
    for (const r of pending) {
      let label = 'Approval';
      let candidateId: string | null = null;
      if (r.subjectType === 'job') {
        const job = await tx.job.findUnique({ where: { id: r.subjectId }, select: { title: true } });
        label = job?.title ?? label;
      } else if (r.subjectType === 'offer') {
        const offer = await tx.offer.findUnique({ where: { id: r.subjectId }, select: { candidateId: true, pipelineEntry: { select: { candidate: { select: { name: true } } } } } });
        label = offer?.pipelineEntry.candidate.name ?? label;
        candidateId = offer?.candidateId ?? null;
      }
      approvals.push({ id: r.id, candidateId, candidateName: label, subtitle: `${r.subjectType === 'job' ? 'Requisition' : 'Offer'} · waiting for your decision`, at: r.submittedAt.toISOString(), actionLabel: 'Review', actionHref: '/v2/approvals' });
    }

    const exams = await tx.exam.findMany({ where: { organizationId }, select: { id: true } });
    const examIds = exams.map((e) => e.id);
    const [staleInvitations, proctoringFlags, drive] = await Promise.all([
      tx.invitation.count({ where: { examId: { in: examIds }, status: 'invited', invitedAt: { lte: staleThreshold }, attempt: null } }),
      tx.proctoringEvent.count({ where: { attempt: { examId: { in: examIds } } } }),
      tx.driveSession.findFirst({ where: { walkInGroup: { organizationId }, endsAt: { gt: now } }, orderBy: { startsAt: 'asc' }, select: { id: true, name: true, startsAt: true, walkInGroup: { select: { name: true } } } }),
    ]);
    const registered = drive ? await tx.invitation.count({ where: { driveSessionId: drive.id } }) : 0;

    return { win, todays, owed, offers, approvals, staleInvitations, proctoringFlags, drive, registered };
  });

  const fmtTime = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: core.win.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  const daysAgo = (d: Date) => Math.max(0, Math.floor((now.getTime() - d.getTime()) / DAY_MS));
  const relDay = (d: Date) => { const n = daysAgo(d); return n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`; };
  const weekday = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: core.win.timeZone, weekday: 'long' }).format(d);

  const interviewsToday: TodayItem[] = core.todays.map((i) => ({
    id: i.id, candidateId: i.candidateId, candidateName: i.pipelineEntry.candidate.name,
    subtitle: `${i.pipelineEntry.job.title} · ${fmtTime(i.slot!.startsAt)} with panel`, at: i.slot!.startsAt.toISOString(),
    actionLabel: 'Open brief', actionHref: `/v2/jobs/${i.pipelineEntry.jobId}`,
  }));
  const feedbackOwed: TodayItem[] = core.owed.map((i) => ({
    id: i.id, candidateId: i.candidateId, candidateName: i.pipelineEntry.candidate.name,
    subtitle: `${i.pipelineEntry.job.title} · interviewed ${relDay(i.slot!.endsAt)} · scorecard due`, at: i.slot!.endsAt.toISOString(),
    actionLabel: 'Add feedback', actionHref: `/v2/jobs/${i.pipelineEntry.jobId}`,
  }));
  const offersExpiring: TodayItem[] = core.offers.map((o) => ({
    id: o.id, candidateId: o.candidateId, candidateName: o.pipelineEntry.candidate.name,
    subtitle: `${o.pipelineEntry.job.title} · offer sent ${o.sentAt ? relDay(o.sentAt) : 'recently'} · expires ${weekday(o.expiresAt)}`, at: o.expiresAt.toISOString(),
    actionLabel: 'Nudge', actionHref: `/v2/jobs/${o.pipelineEntry.jobId}`,
  }));

  const summary = await this.getSummary(context, '7d');
  let passRate: number | null = null;
  try { passRate = Math.round((await this.getAnalytics(context, { window: '7d' })).scores.passRate); }
  catch (err) { this.logger.warn(`today: analytics pass rate unavailable: ${err instanceof Error ? err.message : String(err)}`); }

  return {
    today: { iso: core.win.iso, timeZone: core.win.timeZone },
    needsYou: { feedbackOwed, interviewsToday, offersExpiring, approvalsPending: core.approvals, total: feedbackOwed.length + interviewsToday.length + offersExpiring.length + core.approvals.length },
    watch: { staleInvitations: core.staleInvitations, proctoringFlags: core.proctoringFlags, nextDrive: core.drive ? { id: core.drive.id, name: core.drive.name, groupName: core.drive.walkInGroup.name, startsAt: core.drive.startsAt.toISOString(), registered: core.registered } : null },
    week: { newApplicants: summary.stats.totalCandidates, invited: summary.stats.invitationsSent, awaitingGrading: summary.stats.pendingGradingCount, passRate },
  };
}
```
Adapt the exact `AnalyticsFilter` shape and `summary.stats` field names to what `dashboard.service.ts` already declares (read them; do not guess). If `DashboardService` has no `logger`, add `private readonly logger = new Logger(DashboardService.name)`.

- [ ] **Step 3: Failing controller test** in `dashboard.controller.spec.ts`: `GET today` delegates to `service.getToday(tenant, userId)` (mirror the existing `summary` case, using the same `overrideGuard(JwtAuthGuard)`/`overrideGuard(PermissionsGuard)` setup). Run → FAIL.

- [ ] **Step 4: Route** in `dashboard.controller.ts`:
```ts
@Get('today')
getToday(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
  return this.dashboardService.getToday(tenant, userId);
}
```
(import `CurrentUserId` from `../auth/current-user-id.decorator` as other controllers do.)

- [ ] **Step 5: Tests + tsc + commit.** `cd apps/api && npx jest dashboard && npx tsc --noEmit`.
```bash
test "$(git branch --show-current)" = feat/today-home && git add apps/api/src/dashboard && git commit -m "feat(today): GET /dashboard/today per-user obligations + watch + week"
```

---

### Task 4: Web — types, `useToday`, the `/v2/today` page

**Files:**
- Modify: `apps/web/lib/types.ts` (add `TodayItem`, `TodayResponse` — types only)
- Create: `apps/web/lib/hooks/useToday.ts`
- Create: `apps/web/app/v2/(recruiter)/today/page.tsx`
- Create: `apps/web/app/v2/(recruiter)/today/NeedsYouCard.tsx` (the grouped rows; keeps the page readable)
- Test: `apps/web/app/v2/(recruiter)/today/page.test.tsx`

**Interfaces:**
- Consumes: `GET /dashboard/today` (T3 shape, verbatim), `useCurrentUser()` (`name`, `timeZone`).

- [ ] **Step 1: Types** — copy the two interfaces from T3 into `types.ts` verbatim (field names must match byte-for-byte).

- [ ] **Step 2: Hook** `useToday.ts` (mirror `useDashboardSummary`):
```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { TodayResponse } from '../types';
import { useAuth } from '../auth-context';

export function useToday() {
  const { accessToken } = useAuth();
  return useQuery<TodayResponse>({
    queryKey: ['today'],
    queryFn: () => apiFetch('/dashboard/today', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}
```

- [ ] **Step 3: Failing page test** `page.test.tsx` (mock `useToday` + `useCurrentUser`; render the page):
  - greeting shows "Good morning|afternoon|evening, Priya." (first name from `name`) and "3 things need you today." when `total: 3`; "One thing needs you today." when 1; "Nothing needs you right now." when 0.
  - groups render in the order Feedback you owe · Interviews today · Offers expiring · Approvals waiting on you, each header "Label · n"; a group with 0 items is NOT in the document.
  - **exactly one** button has the solid accent style (assert via a `data-variant="primary"` attribute on the first row's action; all others `data-variant="outline"`).
  - a row shows `candidateName`, `subtitle`, and the `at` time formatted in `today.timeZone` (`HH:MM`); the action is a link to `actionHref` with `actionLabel`.
  - "Worth a look" rows appear only for non-zero/non-null values; the card is absent when all are empty; "This week" shows the three numbers; the pass-rate sentence appears only when `passRate !== null`; a "Full reports" link points to `/v2/reports`.
  - loading renders "Loading…"; error renders `role="alert"` with "Couldn't load today. Try again."
Run: `cd apps/web && npx jest today` → FAIL.

- [ ] **Step 4: Implement the page** — layout per the spec and the canvas, Azure tokens only, no gradients/gauges/tiles:
  - Greeting block: kicker (date via `Intl.DateTimeFormat(undefined, { timeZone, weekday: 'long', day: 'numeric', month: 'long' })` on `today.iso`), `h1.v2-title` at 34px "Good {period}, {firstName}." (period from the user's local hour: <12 morning, <18 afternoon, else evening), second line same style with the count wrapped in `<span style={{ boxShadow: 'inset 0 -0.38em 0 color-mix(in srgb, var(--org-primary) 28%, transparent)' }}>`; right side a `v2-link` "Full reports" to `/v2/reports`.
  - `NeedsYouCard` (`Card` deep-imported from `components/ui-v2/Card`): section headers in the existing 11.5px uppercase muted style; rows `display:flex; gap:14px; padding:12px 20px; border-top:1px solid var(--hair)` with a 36px initials circle (`background: var(--surface)`, initials from the first letters of the name), name 14/600 `var(--ink)`, subtitle 13 `var(--muted)`, optional mono time (`.v2-mono`), and the action as a Next `Link` styled `v2-cta` (primary, only for the first row of the first non-empty group) or the outline style (`border: 1px solid var(--hair); background: var(--paper); color: var(--ink); border-radius: 9px; padding: 8px 15px; font-size: 13px`), carrying `data-variant`. All-empty → the single line "Nothing needs you right now." inside the card.
  - Rail: "Worth a look" card (rows hidden when 0/null: `{n} invitations unopened for 5+ days` → `Resend` to `/v2/candidates`; `{n} proctoring flags waiting for your review` → `Review` to `/v2/reports`; `Walk-in drive {weekday HH:MM} · {registered} registered` → `Prepare` to `/v2/drives`); "This week" card (three numbers Bricolage 24/600 + labels "new applicants" / "invited to assess" / "awaiting grading"; sentence "Pass rate is holding at {n}%. The full picture lives in Reports." only when `passRate !== null`).
  - Copy: sentence case, no exclamation marks. Use `Card` only; no `IconStatCard`, no `Gauge`, no recharts.

- [ ] **Step 5: Tests + tsc + commit.** `cd apps/web && npx jest today && npx tsc --noEmit` (no NEW errors).
```bash
test "$(git branch --show-current)" = feat/today-home && git add apps/web/lib/types.ts apps/web/lib/hooks/useToday.ts "apps/web/app/v2/(recruiter)/today" && git commit -m "feat(today): /v2/today page — people-first needs-you queue, rail, week strip"
```

---

### Task 5: Nav + landing — Today first, recruiter lands on it

**Files:**
- Modify: `apps/web/lib/recruiter-nav.ts`, `apps/web/lib/super-admin-nav.ts` (insert Today first), `apps/web/lib/staff-nav.ts` (`V2_ROUTES` + `'/today'`)
- Modify: `apps/web/lib/staff-landing.ts`, `apps/web/lib/staff-routing.ts` (recruiter default → `'/v2/today'`), `apps/web/lib/staff-routing.test.ts`
- Modify: `apps/web/app/v2/(platform)/organizations/page.tsx` (`router.push('/dashboard')` → `router.push('/today')`)

- [ ] **Step 1: Failing test** — in `staff-routing.test.ts` change the recruiter expectation to `'/v2/today'` and add assertions that `org_admin` → `/v2/users`, `panel` → `/v2/panel/reports`, `super_admin` → `/v2/organizations` are unchanged. Run `npx jest staff-routing` → FAIL.

- [ ] **Step 2: Implement.** In both landing files, the recruiter default branch returns `'/v2/today'`. In `recruiter-nav.ts` and `super-admin-nav.ts` insert `{ href: '/today', label: 'Today', icon: Sun }` as the FIRST entry (import `Sun` from `lucide-react`); leave `Dashboard` as the second entry. Add `'/today'` to `V2_ROUTES` in `staff-nav.ts`. Change the platform "act into org" push to `'/today'`.

- [ ] **Step 3: Tests + tsc + commit.** `cd apps/web && npx jest staff-routing staff-nav nav && npx tsc --noEmit`; then the full web suite (only the known `ImpersonationBanner` failure may remain).
```bash
test "$(git branch --show-current)" = feat/today-home && git add apps/web/lib "apps/web/app/v2/(platform)/organizations/page.tsx" && git commit -m "feat(today): Today first in nav; recruiter landing → /v2/today"
```

---

## Self-Review

**Spec coverage:** shared approvals predicate (spec Decision 4, "reuse, do not re-derive") ✓ T1; user-timezone day window (Decision 3) ✓ T2; every group definition, watch, week, gating, erasedAt filters, hrefs (Architecture/API) ✓ T3; page layout, one accent button, hidden empty groups, all-clear, rail, week strip, states (Architecture/Web) ✓ T4; nav first, landing redirect incl. the platform push, Dashboard untouched (Decision 1) ✓ T5. No migration/seed/dependency ✓ (Global Constraints).

**Placeholder scan:** No TBD. T3 says "adapt the exact `AnalyticsFilter` shape and `summary.stats` field names to what the file declares" — a read-and-match instruction against real code, not an unknown. Subtitle copy is literal. Hrefs are exact routes that exist (`/v2/jobs/{jobId}`, `/v2/approvals`, `/v2/candidates`, `/v2/reports`, `/v2/drives`).

**Type/name consistency:** `TodayItem`/`TodayResponse` defined in T3 and copied verbatim in T4; `isPendingForApprover` (T1) consumed in T3; `dayWindow` (T2) consumed in T3; `useToday` (T4) consumed by the page (T4); `'/today'` href consistent across T5's three nav files and `V2_ROUTES`; `data-variant` attribute used by both the implementation and the test in T4.

**Load-bearing risks:** (a) the "one solid accent button" rule — enforced by the T4 test; (b) per-user scoping (panelist = user, feedback author = user, current-step approver = user) — each has an inclusion AND an exclusion test in T3; (c) the shared checkout hazard — every commit asserts the branch in the same command, and all work is confined to the worktree; (d) the shared-dist rebuild after T1 — called out in Global Constraints and T1 Step 4.
