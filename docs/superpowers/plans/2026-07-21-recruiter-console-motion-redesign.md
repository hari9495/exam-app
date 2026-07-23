# Recruiter Console Motion & Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the recruiter console (dashboard, exams/candidates/question-bank lists, nav) motion and visual depth — light/soft-shadow cards with data-forward sparklines and a real charting library, replacing flat tables with card grids, all built on the existing design-token system from the prior redesign.

**Architecture:** Framer Motion (already installed) drives all entrance/hover/layout motion. Recharts (new dependency) renders a candidate funnel chart and stat-card sparklines on the dashboard, both backed by two new fields on the existing `DashboardSummary` endpoint. A new generic `CardGrid<T>` component (modeled directly on the existing `Table<T>` component's API) replaces `Table` on the three list pages, reusing each page's existing column-render logic.

**Tech Stack:** Next.js/React (apps/web), NestJS/Prisma (apps/api), Framer Motion, Recharts (new), Jest + Testing Library.

## Global Constraints

- Scope is the recruiter console only (`apps/web/app/(recruiter)/**`) — no changes to candidate-facing pages, org-admin/panel/platform-admin consoles, exam-builder, candidate detail/report screens, or the audit log.
- Motion is implemented via Framer Motion (`motion.div` + variants), not raw CSS `@keyframes` in component files.
- Sparklines/funnel chart use Recharts, not hand-rolled CSS bars.
- No org branding set / zero-data states must render without erroring (empty funnel, empty upcoming-exams list).
- List-page pagination, search, and existing data hooks (`useExams`, `useCandidates`, `useQuestions`) are unchanged — this is a rendering-layer change only.
- Card grids preserve every existing table column's information and every existing interactive affordance (edit link, dropdown menu, candidate multi-select checkbox, duplicate action) — nothing shown in a table row today may silently disappear from its card.

---

### Task 1: Backend — candidate funnel + upcoming exams on `DashboardSummary`

**Files:**
- Modify: `apps/api/src/dashboard/dashboard.service.ts`
- Test: `apps/api/src/dashboard/dashboard.service.spec.ts`
- Modify: `apps/web/lib/types.ts:505-518` (the `DashboardSummary` interface)

**Interfaces:**
- Produces: `DashboardSummary.funnel: { invited: number; started: number; submitted: number; passed: number }` and `DashboardSummary.upcomingExams: { examId: string; examTitle: string; availabilityWindowStart: string }[]` — both consumed by Task 3 (dashboard frontend).

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/dashboard/dashboard.service.spec.ts`, inside the existing `describe('DashboardService', ...)` block (after the last `it(...)`, before the closing `});`):

```typescript
  it('computes the candidate funnel from invitation/attempt/result counts', async () => {
    const tx = stubTx({
      invitation: { count: jest.fn().mockResolvedValue(100) },
      attempt: {
        count: jest.fn().mockResolvedValue(60),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      result: { count: jest.fn().mockResolvedValue(22) },
    });
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.getSummary(context);

    expect(result.funnel).toEqual({ invited: 100, started: 60, submitted: 60, passed: 22 });
    expect(tx.attempt.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ submittedAt: { not: null } }) }),
    );
    expect(tx.result.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ passFail: 'pass' }) }),
    );
  });

  it('lists upcoming scheduled exams soonest-first, excluding exams without a future window', async () => {
    const tx = stubTx({
      exam: {
        findMany: jest.fn().mockResolvedValue([{ id: 'exam-1', title: 'Backend Round' }]),
      },
    });
    // The exam.findMany mock above satisfies the method's first (org-wide exam list) call;
    // upcomingExams uses a second, differently-filtered exam.findMany call — mockResolvedValueOnce
    // lets the two calls return different data.
    tx.exam.findMany
      .mockResolvedValueOnce([{ id: 'exam-1', title: 'Backend Round' }])
      .mockResolvedValueOnce([
        { id: 'exam-2', title: 'Scheduled Round', availabilityWindowStart: new Date('2026-08-01T09:00:00Z') },
      ]);
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.getSummary(context);

    expect(result.upcomingExams).toEqual([
      { examId: 'exam-2', examTitle: 'Scheduled Round', availabilityWindowStart: '2026-08-01T09:00:00.000Z' },
    ]);
  });

  it('returns an empty funnel and upcoming-exams list for an org with no data', async () => {
    const tx = stubTx({ invitation: { count: jest.fn().mockResolvedValue(0) }, result: { count: jest.fn().mockResolvedValue(0) } });
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.getSummary(context);

    expect(result.funnel).toEqual({ invited: 0, started: 0, submitted: 0, passed: 0 });
    expect(result.upcomingExams).toEqual([]);
  });
```

Also update `stubTx` at the top of the file to include `result: { count: jest.fn().mockResolvedValue(0) }` as a default so every existing test (which doesn't override it) still has a valid mock:

```typescript
  function stubTx(overrides: Partial<Record<string, any>> = {}) {
    return {
      exam: { findMany: jest.fn().mockResolvedValue([{ id: 'exam-1', title: 'Backend Round' }]) },
      candidate: { count: jest.fn().mockResolvedValue(0) },
      invitation: { count: jest.fn().mockResolvedValue(0) },
      attempt: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
      result: { count: jest.fn().mockResolvedValue(0) },
      proctoringEvent: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
      ...overrides,
    };
  }
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `apps/api`): `npx jest dashboard.service.spec`
Expected: the 3 new tests FAIL — `result.funnel` and `result.upcomingExams` are `undefined` (the service doesn't return these fields yet). The pre-existing tests still pass (the `stubTx` change is additive).

- [ ] **Step 3: Implement the funnel and upcoming-exams aggregates**

In `apps/api/src/dashboard/dashboard.service.ts`, update the `DashboardSummary` interface:

```typescript
export interface DashboardSummary {
  stats: {
    totalCandidates: number;
    invitationsSent: number;
    attemptsInProgress: number;
    pendingGradingCount: number;
  };
  attention: {
    pendingGrading: { examId: string; examTitle: string; count: number }[];
    recentProctoringFlags: { examId: string; examTitle: string; occurredAt: string }[];
    staleInvitationCount: number;
  };
  activity: { id: string; description: string; occurredAt: string }[];
  funnel: {
    invited: number;
    started: number;
    submitted: number;
    passed: number;
  };
  upcomingExams: { examId: string; examTitle: string; availabilityWindowStart: string }[];
}
```

Add a constant near the top of the file, alongside the other module-level constants:

```typescript
const UPCOMING_EXAMS_LIMIT = 5;
```

In `getSummary()`, replace the existing `Promise.all([...])` array and its destructure with the version below. `invitationsSent` (already computed, an `Invitation.count` with the same `examId: { in: examIds }` filter) is exactly the `funnel.invited` value, so it's reused rather than duplicated; `started` needs its own unfiltered attempt count (added as `startedCount`, right after `attemptsInProgress`, since "in progress" is status-filtered and "started" is not); `submittedCount`, `passedCount`, and `upcomingExamRows` are new:

```typescript
      const [
        totalCandidates,
        invitationsSent,
        attemptsInProgress,
        startedCount,
        pendingGradingGroups,
        staleInvitationCount,
        recentProctoringEvents,
        auditRows,
        submittedCount,
        passedCount,
        upcomingExamRows,
      ] = await Promise.all([
        tx.candidate.count({ where: { organizationId, erasedAt: null } }),
        tx.invitation.count({ where: { examId: { in: examIds } } }),
        tx.attempt.count({ where: { examId: { in: examIds }, status: 'in_progress' } }),
        tx.attempt.count({ where: { examId: { in: examIds } } }),
        tx.attempt.groupBy({ by: ['examId'], where: { examId: { in: examIds }, status: 'pending_manual_grade' }, _count: { _all: true } }),
        tx.invitation.count({
          where: { examId: { in: examIds }, status: 'invited', invitedAt: { lte: staleThreshold }, attempt: null },
        }),
        tx.proctoringEvent.findMany({
          where: { attempt: { examId: { in: examIds } } },
          orderBy: { occurredAt: 'desc' },
          take: RECENT_PROCTORING_LIMIT,
          include: { attempt: { select: { examId: true } } },
        }),
        tx.auditLog.findMany({
          where: { organizationId, action: { in: ACTIVITY_ACTIONS } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: ACTIVITY_LIMIT,
        }),
        tx.attempt.count({ where: { examId: { in: examIds }, submittedAt: { not: null } } }),
        tx.result.count({ where: { attempt: { examId: { in: examIds } }, passFail: 'pass' } }),
        tx.exam.findMany({
          where: { organizationId, schedulingEnabled: true, availabilityWindowStart: { gt: new Date() } },
          select: { id: true, title: true, availabilityWindowStart: true },
          orderBy: { availabilityWindowStart: 'asc' },
          take: UPCOMING_EXAMS_LIMIT,
        }),
      ]);
```

Finally, add `funnel` and `upcomingExams` to the method's return object (after the existing `activity:` field):

```typescript
        activity: auditRows.map((row) => ({
          id: row.id,
          description: describeActivity(row.action, row.entityId, row.metadataJson ? JSON.parse(row.metadataJson) : null, examTitleById),
          occurredAt: row.createdAt.toISOString(),
        })),
        funnel: {
          invited: invitationsSent,
          started: startedCount,
          submitted: submittedCount,
          passed: passedCount,
        },
        upcomingExams: upcomingExamRows.map((exam) => ({
          examId: exam.id,
          examTitle: exam.title,
          availabilityWindowStart: exam.availabilityWindowStart!.toISOString(),
        })),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest dashboard.service.spec`
Expected: PASS, all tests including the 3 new ones.

- [ ] **Step 5: Mirror the type in the frontend**

In `apps/web/lib/types.ts`, replace the `DashboardSummary` interface (currently lines 505-518):

```typescript
export interface DashboardSummary {
  stats: {
    totalCandidates: number;
    invitationsSent: number;
    attemptsInProgress: number;
    pendingGradingCount: number;
  };
  attention: {
    pendingGrading: { examId: string; examTitle: string; count: number }[];
    recentProctoringFlags: { examId: string; examTitle: string; occurredAt: string }[];
    staleInvitationCount: number;
  };
  activity: { id: string; description: string; occurredAt: string }[];
  funnel: {
    invited: number;
    started: number;
    submitted: number;
    passed: number;
  };
  upcomingExams: { examId: string; examTitle: string; availabilityWindowStart: string }[];
}
```

- [ ] **Step 6: Typecheck**

Run (from `apps/api`): `npx tsc --noEmit`
Run (from `apps/web`): `npx tsc --noEmit`
Expected: no new errors in either app (apps/web has pre-existing unrelated baseline errors — see any prior plan in `docs/superpowers/plans/` for the exact list — confirm none of your changed files appear).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/dashboard/dashboard.service.ts apps/api/src/dashboard/dashboard.service.spec.ts apps/web/lib/types.ts
git commit -m "feat: add candidate funnel and upcoming exams to dashboard summary"
```

---

### Task 2: `CardGrid<T>` shared component

**Files:**
- Create: `apps/web/components/ui/CardGrid.tsx`
- Test: `apps/web/components/ui/CardGrid.test.tsx`
- Modify: `apps/web/components/ui/index.ts`

**Interfaces:**
- Produces: `CardGrid<T>({ items, cardKey, renderCard, emptyMessage })` — a generic component, deliberately modeled on the existing `Table<T>` component's prop shape (`Table` takes `columns`/`rows`/`rowKey`/`emptyMessage`; `CardGrid` takes `items`/`cardKey`/`renderCard` instead — a card is one unit, not a row of columns, so there's no `columns` prop). Consumed by Tasks 4, 5, 6.

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/ui/CardGrid.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { CardGrid } from './CardGrid';

interface Item {
  id: string;
  name: string;
}

describe('CardGrid', () => {
  it('renders one card per item via renderCard', () => {
    const items: Item[] = [{ id: '1', name: 'Alpha' }, { id: '2', name: 'Beta' }];
    render(<CardGrid items={items} cardKey={(item) => item.id} renderCard={(item) => <span>{item.name}</span>} />);

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('shows the empty message when there are no items', () => {
    render(<CardGrid items={[]} cardKey={(item: Item) => item.id} renderCard={(item: Item) => <span>{item.name}</span>} emptyMessage="No results yet." />);

    expect(screen.getByText('No results yet.')).toBeInTheDocument();
  });

  it('falls back to a default empty message when none is provided', () => {
    render(<CardGrid items={[]} cardKey={(item: Item) => item.id} renderCard={(item: Item) => <span>{item.name}</span>} />);

    expect(screen.getByText('No results.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/web`): `npx jest CardGrid.test`
Expected: FAIL with "Cannot find module './CardGrid'".

- [ ] **Step 3: Implement `CardGrid`**

Create `apps/web/components/ui/CardGrid.tsx`:

```tsx
'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface CardGridProps<T> {
  items: T[];
  cardKey: (item: T) => string;
  renderCard: (item: T) => ReactNode;
  emptyMessage?: string;
}

export function CardGrid<T>({ items, cardKey, renderCard, emptyMessage = 'No results.' }: CardGridProps<T>) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-recruiter-text-tertiary">{emptyMessage}</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item, index) => (
        <motion.div
          key={cardKey(item)}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: Math.min(index, 8) * 0.04, ease: 'easeOut' }}
          whileHover={{ y: -3 }}
          className="group rounded-2xl border border-recruiter-border bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          {renderCard(item)}
        </motion.div>
      ))}
    </div>
  );
}
```

(`Math.min(index, 8) * 0.04` caps the stagger delay at index 8 — with 20 items per page, cards 9-20 would otherwise appear to lag noticeably behind the first ones; capping keeps the whole grid feeling like one cohesive entrance rather than a slow trickle.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest CardGrid.test`
Expected: PASS, 3/3 tests green.

- [ ] **Step 5: Export from the ui barrel**

In `apps/web/components/ui/index.ts`, add (after the `Table` export line):

```typescript
export { CardGrid } from './CardGrid';
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/ui/CardGrid.tsx apps/web/components/ui/CardGrid.test.tsx apps/web/components/ui/index.ts
git commit -m "feat: add CardGrid shared component for card-based list layouts"
```

---

### Task 3: Dashboard — motion, sparklines, funnel, upcoming exams

**Files:**
- Modify: `apps/web/package.json` (add `recharts`)
- Modify: `apps/web/app/(recruiter)/dashboard/page.tsx`
- Modify: `apps/web/app/(recruiter)/dashboard/page.test.tsx`

**Interfaces:**
- Consumes: `DashboardSummary.funnel` and `DashboardSummary.upcomingExams` (Task 1).

- [ ] **Step 1: Install Recharts**

Run (from `apps/web`): `npm install recharts`
Expected: `recharts` added to `apps/web/package.json` dependencies.

- [ ] **Step 2: Update the existing test mocks to include the new fields**

The 5 existing tests in `apps/web/app/(recruiter)/dashboard/page.test.tsx` each build a `summary` object passed to `mockSummaryFetch`. Since the component will read `summary.funnel.invited` and `summary.upcomingExams` directly (not optionally), every one of these mock objects needs the two new fields or the component will throw reading properties off `undefined`. Update each of the 5 `mockSummaryFetch({...})` calls to add `funnel` and `upcomingExams` alongside the existing `stats`/`attention`/`activity` fields, e.g. the first one becomes:

```typescript
    mockSummaryFetch({
      stats: { totalCandidates: 248, invitationsSent: 312, attemptsInProgress: 17, pendingGradingCount: 9 },
      attention: { pendingGrading: [], recentProctoringFlags: [], staleInvitationCount: 0 },
      activity: [],
      funnel: { invited: 312, started: 200, submitted: 180, passed: 90 },
      upcomingExams: [],
    });
```

Apply the same two added fields (`funnel: { invited: 0, started: 0, submitted: 0, passed: 0 }, upcomingExams: []` is fine for the other 4 tests, since none of them assert on funnel/upcoming-exam content) to the other 4 `mockSummaryFetch` call sites in the file. The `error state` test (which mocks a 500 response, not a summary object) is unaffected.

- [ ] **Step 3: Add a new test for the funnel and upcoming-exams widgets**

Add to `apps/web/app/(recruiter)/dashboard/page.test.tsx`, inside the `describe('DashboardPage', ...)` block:

```typescript
  it('renders the candidate funnel and upcoming exams widgets', async () => {
    mockSummaryFetch({
      stats: { totalCandidates: 0, invitationsSent: 0, attemptsInProgress: 0, pendingGradingCount: 0 },
      attention: { pendingGrading: [], recentProctoringFlags: [], staleInvitationCount: 0 },
      activity: [],
      funnel: { invited: 100, started: 60, submitted: 55, passed: 22 },
      upcomingExams: [{ examId: 'exam-3', examTitle: 'Scheduled Round', availabilityWindowStart: '2026-08-01T09:00:00.000Z' }],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Scheduled Round')).toBeInTheDocument());
    expect(screen.getByText(/Scheduled Round/).closest('a')).toHaveAttribute('href', '/exams/exam-3/edit');
  });

  it('shows an empty-state message when there are no upcoming exams', async () => {
    mockSummaryFetch({
      stats: { totalCandidates: 0, invitationsSent: 0, attemptsInProgress: 0, pendingGradingCount: 0 },
      attention: { pendingGrading: [], recentProctoringFlags: [], staleInvitationCount: 0 },
      activity: [],
      funnel: { invited: 0, started: 0, submitted: 0, passed: 0 },
      upcomingExams: [],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('No upcoming exams.')).toBeInTheDocument());
  });
```

- [ ] **Step 4: Run tests to verify the new ones fail**

Run (from `apps/web`): `npx jest dashboard/page.test`
Expected: the 2 new tests FAIL (no funnel/upcoming-exams markup exists yet); the 5 existing tests still PASS (mocks were updated but the component doesn't read the new fields yet, so nothing breaks — this confirms Step 2's mock updates were additive, not disruptive).

- [ ] **Step 5: Implement the dashboard changes**

Replace `apps/web/app/(recruiter)/dashboard/page.tsx` in full:

```tsx
'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { BarChart, Bar, FunnelChart, Funnel, LabelList, ResponsiveContainer } from 'recharts';
import { Users, Mail, Play, FileEdit, AlertTriangle, Clock, CheckCircle2, FileEdit as FileEditIcon, Plus, CalendarClock } from 'lucide-react';
import { useDashboardSummary } from '../../../lib/hooks/useDashboard';
import { Card, Button } from '../../../components/ui';

function activityIconFor(description: string) {
  if (description.includes('invited')) return Mail;
  if (description.includes('published')) return CheckCircle2;
  if (description.includes('graded')) return FileEditIcon;
  return CheckCircle2;
}

interface StatCardProps {
  icon: typeof Users;
  value: number;
  label: string;
  iconBg: string;
  iconColor: string;
  accentBorder: string;
  sparkline: number[];
  barColor: string;
  delay: number;
}

function StatCard({ icon: Icon, value, label, iconBg, iconColor, accentBorder, sparkline, barColor, delay }: StatCardProps) {
  const sparkData = sparkline.map((v, i) => ({ i, v }));
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay, ease: 'easeOut' }} whileHover={{ y: -3 }}>
      <Card className={`border-l-[3px] ${accentBorder} shadow-sm transition-shadow hover:shadow-md`}>
        <div className={`mb-2 flex h-7 w-7 items-center justify-center rounded-md ${iconBg} ${iconColor}`}>
          <Icon size={15} />
        </div>
        <p className="text-2xl font-bold text-recruiter-text">{value}</p>
        <p className="text-xs text-recruiter-text-tertiary">{label}</p>
        <div className="mt-2 h-5 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sparkData}>
              <Bar dataKey="v" fill={barColor} radius={[1, 1, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </motion.div>
  );
}

export default function DashboardPage() {
  const { data: summary, isLoading, isError } = useDashboardSummary();

  if (isLoading) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Dashboard</h1>
        <p className="text-sm text-recruiter-text-tertiary">Loading…</p>
      </div>
    );
  }

  if (isError || !summary) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Dashboard</h1>
        <p role="alert" className="text-sm text-status-danger">
          Failed to load dashboard.
        </p>
      </div>
    );
  }

  const hasAttention =
    summary.attention.pendingGrading.length > 0 || summary.attention.recentProctoringFlags.length > 0 || summary.attention.staleInvitationCount > 0;

  const funnelData = [
    { name: 'Invited', value: summary.funnel.invited, fill: '#6366f1' },
    { name: 'Started', value: summary.funnel.started, fill: '#818cf8' },
    { name: 'Submitted', value: summary.funnel.submitted, fill: '#a5b4fc' },
    { name: 'Passed', value: summary.funnel.passed, fill: '#22c55e' },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Dashboard</h1>

      <div className="mb-5 grid grid-cols-4 gap-3">
        <StatCard
          icon={Users}
          value={summary.stats.totalCandidates}
          label="Total candidates"
          iconBg="bg-status-success-bg"
          iconColor="text-status-success"
          accentBorder="border-status-success"
          sparkline={[3, 5, 4, 7, 6]}
          barColor="#22c55e"
          delay={0}
        />
        <StatCard
          icon={Mail}
          value={summary.stats.invitationsSent}
          label="Invitations sent"
          iconBg="bg-status-success-bg"
          iconColor="text-status-success"
          accentBorder="border-status-info"
          sparkline={[4, 6, 5, 8, 7]}
          barColor="#2955a3"
          delay={0.04}
        />
        <StatCard
          icon={Play}
          value={summary.stats.attemptsInProgress}
          label="Attempts in progress"
          iconBg="bg-status-warning-bg"
          iconColor="text-status-warning"
          accentBorder="border-status-warning"
          sparkline={[2, 3, 5, 4, 6]}
          barColor="#8a5a00"
          delay={0.08}
        />
        <StatCard
          icon={FileEdit}
          value={summary.stats.pendingGradingCount}
          label="Pending grading"
          iconBg="bg-status-danger-bg"
          iconColor="text-status-danger"
          accentBorder="border-status-danger"
          sparkline={[1, 2, 1, 3, 2]}
          barColor="#b23b3b"
          delay={0.12}
        />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.16 }}>
          <Card>
            <h2 className="mb-3 text-sm font-bold text-recruiter-text">Candidate funnel</h2>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <FunnelChart>
                  <Funnel dataKey="value" data={funnelData} isAnimationActive>
                    <LabelList position="right" dataKey="name" fill="#57615B" stroke="none" fontSize={11} />
                  </Funnel>
                </FunnelChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
          <Card>
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-recruiter-text">
              <CalendarClock size={14} />
              Upcoming exams
            </h2>
            {summary.upcomingExams.length === 0 ? (
              <p className="text-sm text-recruiter-text-tertiary">No upcoming exams.</p>
            ) : (
              <ul>
                {summary.upcomingExams.map((exam) => (
                  <li key={exam.examId} className="border-b border-recruiter-border last:border-0">
                    <Link href={`/exams/${exam.examId}/edit`} className="flex items-center gap-2.5 py-2.5 text-sm hover:bg-recruiter-bg-subtle">
                      <span className="flex-1 text-recruiter-text">{exam.examTitle}</span>
                      <span className="text-xs text-recruiter-text-tertiary">{new Date(exam.availabilityWindowStart).toLocaleDateString()}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-[1.3fr_1fr] gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.24 }}>
          <Card>
            <h2 className="mb-3 text-sm font-bold text-recruiter-text">Needs your attention</h2>
            {!hasAttention ? (
              <p className="text-sm text-recruiter-text-tertiary">Nothing needs attention right now.</p>
            ) : (
              <ul>
                {summary.attention.pendingGrading.map((item) => (
                  <li key={item.examId} className="border-b border-recruiter-border last:border-0">
                    <Link
                      href={`/exams/${item.examId}/edit`}
                      className="flex items-center gap-2.5 py-2.5 text-sm hover:bg-recruiter-bg-subtle"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-danger" />
                      <span className="flex-1 text-recruiter-text">
                        {item.examTitle} <span className="text-recruiter-text-tertiary">has {item.count} answer{item.count === 1 ? '' : 's'} awaiting manual grading</span>
                      </span>
                      <span className="rounded-full bg-recruiter-bg-subtle px-2 py-0.5 text-xs font-bold text-recruiter-text-secondary">{item.count}</span>
                    </Link>
                  </li>
                ))}
                {summary.attention.recentProctoringFlags.map((flag, index) => (
                  <li key={`${flag.examId}-${index}`} className="border-b border-recruiter-border last:border-0">
                    <Link
                      href={`/exams/${flag.examId}/edit`}
                      className="flex items-center gap-2.5 py-2.5 text-sm hover:bg-recruiter-bg-subtle"
                    >
                      <AlertTriangle size={13} className="shrink-0 text-status-warning" />
                      <span className="flex-1 text-recruiter-text">
                        {flag.examTitle} <span className="text-recruiter-text-tertiary">flagged a proctoring violation</span>
                      </span>
                    </Link>
                  </li>
                ))}
                {summary.attention.staleInvitationCount > 0 && (
                  <li className="flex items-center gap-2.5 py-2.5 text-sm">
                    <Clock size={13} className="shrink-0 text-recruiter-text-tertiary" />
                    <span className="flex-1 text-recruiter-text">
                      Candidates <span className="text-recruiter-text-tertiary">invited 5+ days ago, haven&apos;t started</span>
                    </span>
                    <span className="rounded-full bg-recruiter-bg-subtle px-2 py-0.5 text-xs font-bold text-recruiter-text-secondary">
                      {summary.attention.staleInvitationCount}
                    </span>
                  </li>
                )}
              </ul>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <Link href="/exams/new">
                <Button variant="secondary" className="flex w-full items-center justify-center gap-1.5">
                  <Plus size={14} />
                  Create exam
                </Button>
              </Link>
              <Link href="/candidates">
                <Button variant="secondary" className="flex w-full items-center justify-center gap-1.5">
                  <Mail size={14} />
                  Invite candidates
                </Button>
              </Link>
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.28 }}>
          <Card>
            <h2 className="mb-3 text-sm font-bold text-recruiter-text">Recent activity</h2>
            {summary.activity.length === 0 ? (
              <p className="text-sm text-recruiter-text-tertiary">No recent activity.</p>
            ) : (
              <ul>
                {summary.activity.map((item) => {
                  const Icon = activityIconFor(item.description);
                  return (
                    <li key={item.id} className="flex items-start gap-2.5 border-b border-recruiter-border py-2.5 text-sm last:border-0">
                      <span className="mt-0.5 flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full bg-status-success-bg text-status-success">
                        <Icon size={12} />
                      </span>
                      <div>
                        <p className="text-recruiter-text">{item.description}</p>
                        <p className="text-xs text-recruiter-text-tertiary">{new Date(item.occurredAt).toLocaleString()}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
```

(The 4 stat-card sparklines use static placeholder trend data (`sparkline={[3, 5, 4, 7, 6]}` etc.) rather than real historical time-series — the backend has no historical snapshot data to chart, and adding one is out of scope for a visual/motion pass. This is a deliberate simplification: the sparklines convey "this metric moves" visually without claiming to show real trend data. If real historical trends are wanted later, that's backend work for a separate spec.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest dashboard/page.test`
Expected: PASS, all 7 tests (5 existing + 2 new) green.

- [ ] **Step 7: Typecheck**

Run (from `apps/web`): `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/app/\(recruiter\)/dashboard/page.tsx apps/web/app/\(recruiter\)/dashboard/page.test.tsx
git commit -m "feat: add motion, sparklines, candidate funnel, and upcoming exams to recruiter dashboard"
```

---

### Task 4: Exams list — card grid

**Files:**
- Modify: `apps/web/app/(recruiter)/exams/page.tsx`

**Interfaces:**
- Consumes: `CardGrid` (Task 2).

- [ ] **Step 1: Replace the page**

In `apps/web/app/(recruiter)/exams/page.tsx`, replace the import line:

```typescript
import {
  Table,
  StatusBadge,
  Button,
  useToast,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Pagination,
  type Column,
  type StatusTone,
} from '../../../components/ui';
```

with:

```typescript
import {
  CardGrid,
  StatusBadge,
  Button,
  useToast,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Pagination,
  type StatusTone,
} from '../../../components/ui';
```

Replace the `const columns: Column<ExamListItem>[] = [...]` block (and its closing `];`) with a single `renderCard` function:

```tsx
  function renderCard(exam: ExamListItem) {
    return (
      <div>
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold text-recruiter-text">{exam.title}</div>
            <div className="text-xs text-recruiter-text-tertiary">{exam.durationMinutes} min</div>
          </div>
          <StatusBadge tone={STATUS_TONE[exam.status]}>{STATUS_LABEL[exam.status]}</StatusBadge>
        </div>
        {exam.attemptTotalCount > 0 && (
          <div className="mb-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-recruiter-bg-subtle">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.round((exam.attemptSettledCount / exam.attemptTotalCount) * 100)}%` }}
              />
            </div>
            <span className="text-xs text-recruiter-text-tertiary">
              {exam.attemptSettledCount}/{exam.attemptTotalCount}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-recruiter-border pt-2.5 text-xs">
          <span className="text-recruiter-text-tertiary">{exam.invitationCount} candidates · {new Date(exam.createdAt).toLocaleDateString()}</span>
          <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <Link href={`/exams/${exam.id}/edit`} className="font-medium text-primary">
              Edit
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={duplicateExam.isPending}
                aria-label="More actions"
                className="rounded p-1 text-recruiter-text-tertiary hover:bg-recruiter-bg-subtle"
              >
                <MoreHorizontal size={16} />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => handleDuplicate(exam.id)}>Duplicate</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    );
  }
```

Replace the final `<Table columns={columns} rows={examsResponse?.data ?? []} rowKey={(exam) => exam.id} emptyMessage="No exams yet." />` line with:

```tsx
      <CardGrid items={examsResponse?.data ?? []} cardKey={(exam) => exam.id} renderCard={renderCard} emptyMessage="No exams yet." />
```

- [ ] **Step 2: Run the existing test suite (no test changes expected)**

Run (from `apps/web`): `npx jest exams/page.test`
Expected: PASS, all existing tests green unmodified — every assertion in this file checks for text/role content ("Backend Round", "Published", "14/17", "20", "More actions" button, "Duplicate" menu item, the `search=onboarding` query param), none of which depend on table-specific structure, so the card-grid rendering satisfies them without any test edits. If any test fails, read the failure — it means the card markup dropped something a table row showed (a real regression), not a change to fix by editing the test.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (the removed `Column`/`Table` import and the unused `STATUS_TONE`/`STATUS_LABEL` constants — which are still used inside `renderCard` — should not produce unused-var errors; confirm).

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(recruiter)/exams/page.tsx"
git commit -m "feat: convert exams list to card grid"
```

---

### Task 5: Candidates list — card grid

**Files:**
- Modify: `apps/web/app/(recruiter)/candidates/page.tsx`

**Interfaces:**
- Consumes: `CardGrid` (Task 2).

- [ ] **Step 1: Replace the page**

In `apps/web/app/(recruiter)/candidates/page.tsx`, replace the import line:

```typescript
import { Table, Checkbox, Select, Button, useToast, Pagination, type Column } from '../../../components/ui';
```

with:

```typescript
import { CardGrid, Checkbox, Select, Button, useToast, Pagination } from '../../../components/ui';
```

Replace the `const columns: Column<Candidate>[] = [...]` block (and its closing `];`) with:

```tsx
  function renderCard(candidate: Candidate) {
    return (
      <div className="flex items-start gap-2.5">
        <Checkbox
          label={candidate.name}
          hideLabel
          checked={selectedIds.includes(candidate.id)}
          onChange={(checked) => toggle(candidate.id, checked)}
        />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-recruiter-text">{candidate.name}</div>
          <div className="truncate text-xs text-recruiter-text-tertiary">{candidate.email}</div>
          <div className="mt-2 flex items-center justify-between border-t border-recruiter-border pt-2 text-xs text-recruiter-text-tertiary">
            <span>{candidate.phone ?? '—'}</span>
            <span>Added {new Date(candidate.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    );
  }
```

Replace the final `<Table columns={columns} rows={candidatesResponse?.data ?? []} rowKey={(candidate) => candidate.id} emptyMessage="No candidates yet." />` line with:

```tsx
      <CardGrid items={candidatesResponse?.data ?? []} cardKey={(candidate) => candidate.id} renderCard={renderCard} emptyMessage="No candidates yet." />
```

- [ ] **Step 2: Run the existing test suite (no test changes expected)**

Run (from `apps/web`): `npx jest candidates/page.test`
Expected: PASS unmodified — the one existing test (`lists staff candidates and adds a new one`, or equivalent naming — confirm against the actual file) asserts on `screen.getByLabelText('Email')`, form submission, and toast text, none of which are table-structural. Same rule as Task 4: a failure here means a real regression, not a test to edit around.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(recruiter)/candidates/page.tsx"
git commit -m "feat: convert candidates list to card grid"
```

---

### Task 6: Question Bank list — card grid

**Files:**
- Modify: `apps/web/app/(recruiter)/questions/page.tsx`

**Interfaces:**
- Consumes: `CardGrid` (Task 2).

- [ ] **Step 1: Replace the page**

In `apps/web/app/(recruiter)/questions/page.tsx`, replace the import line:

```typescript
import { Table, StatusBadge, Button, Pagination, type Column, type StatusTone } from '../../../components/ui';
```

with:

```typescript
import { CardGrid, StatusBadge, Button, Pagination, type StatusTone } from '../../../components/ui';
```

Replace the `const columns: Column<Question>[] = [...]` block (and its closing `];`) with:

```tsx
  function renderCard(q: Question) {
    return (
      <div>
        <p className="mb-2.5 font-semibold text-recruiter-text">{q.text}</p>
        <div className="flex items-center justify-between border-t border-recruiter-border pt-2.5 text-xs">
          <div className="flex items-center gap-2">
            <StatusBadge tone={TYPE_TONE[q.type]}>{TYPE_LABEL[q.type]}</StatusBadge>
            <DifficultyDots difficulty={q.difficulty} />
            <span className="text-recruiter-text-tertiary">{q.marks} marks</span>
          </div>
          <Link
            href={`/questions/${q.id}/edit`}
            className="font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          >
            Edit
          </Link>
        </div>
      </div>
    );
  }
```

Replace the final `<Table columns={columns} rows={questions?.data ?? []} rowKey={(q) => q.id} emptyMessage="No questions yet." />` line with:

```tsx
      <CardGrid items={questions?.data ?? []} cardKey={(q) => q.id} renderCard={renderCard} emptyMessage="No questions yet." />
```

- [ ] **Step 2: Run the existing test suite (no test changes expected)**

Run (from `apps/web`): `npx jest questions/page.test`
Expected: PASS unmodified, same reasoning as Tasks 4 and 5.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(recruiter)/questions/page.tsx"
git commit -m "feat: convert question bank list to card grid"
```

---

### Task 7: Nav/sidebar motion polish

**Files:**
- Modify: `apps/web/app/(recruiter)/layout.tsx:79-96`

**Interfaces:** none (self-contained styling change).

- [ ] **Step 1: Add a color transition to nav item links**

In `apps/web/app/(recruiter)/layout.tsx`, the nav item `<Link>` inside the `NAV_ITEMS.map(...)` block currently has this `className`:

```tsx
                  className={clsx(
                    'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium',
                    isActive
                      ? 'border-l-[3px] border-primary pl-[7px] font-semibold text-primary'
                      : 'text-recruiter-text-secondary hover:bg-recruiter-bg-subtle',
                  )}
```

Add `transition-colors duration-150` to the base (always-applied) class string:

```tsx
                  className={clsx(
                    'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors duration-150',
                    isActive
                      ? 'border-l-[3px] border-primary pl-[7px] font-semibold text-primary'
                      : 'text-recruiter-text-secondary hover:bg-recruiter-bg-subtle',
                  )}
```

Also add the same transition to the "Log out" button and the profile-link hover state, which currently have `hover:bg-recruiter-bg-subtle` with no transition — add `transition-colors duration-150` to both:

```tsx
          <Link
            href="/profile"
            className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 transition-colors duration-150 hover:bg-recruiter-bg-subtle"
          >
```

```tsx
          <button
            type="button"
            aria-label="Log out"
            onClick={handleLogout}
            className="shrink-0 rounded-md p-1.5 text-recruiter-text-tertiary transition-colors duration-150 hover:bg-recruiter-bg-subtle hover:text-recruiter-text"
          >
```

- [ ] **Step 2: Typecheck (no test changes needed — pure CSS class additions)**

Run (from `apps/web`): `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(recruiter)/layout.tsx"
git commit -m "style: add hover/active transition polish to recruiter sidebar nav"
```

---

### Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full apps/api suite**

Run (from `apps/api`): `npx jest`
Expected: all suites pass, including the 3 new `dashboard.service.spec.ts` tests.

- [ ] **Step 2: Full apps/web suite**

Run (from `apps/web`): `npx jest`
Expected: all suites pass, including the new `CardGrid.test.tsx` and the updated `dashboard/page.test.tsx`, `exams/page.test.tsx`, `candidates/page.test.tsx`, `questions/page.test.tsx`.

- [ ] **Step 3: Typecheck both apps**

Run: `cd apps/api && npx tsc --noEmit && cd ../web && npx tsc --noEmit`
Expected: `apps/api` clean. `apps/web` has only the pre-existing unrelated baseline errors (confirm no new ones in any file this plan touched).

- [ ] **Step 4: Live verification**

1. Start `api` and `web` dev servers.
2. Log in as `recruiter@demo-org.test` / `Passw0rd!2026` (org slug `demo-org`).
3. **Dashboard:** confirm the 4 stat cards show sparklines and fade in staggered on load; confirm the candidate funnel chart and upcoming-exams widget render (create/schedule a test exam with `schedulingEnabled: true` and a future `availabilityWindowStart` first if the org has none, so the upcoming-exams widget isn't empty for this check); hover a stat card and confirm it lifts.
4. **Exams list:** confirm exams render as cards, not table rows; confirm status badge, progress bar, candidate count, and the Edit/Duplicate actions (visible on hover) all still work; confirm pagination and search still function.
5. **Candidates list:** confirm candidates render as cards with the selection checkbox working (select a few, confirm the "Send invitations" button enables); confirm add-candidate form and bulk-upload link still work.
6. **Question Bank list:** confirm questions render as cards with type badge, difficulty dots, marks, and the Edit link (visible on hover); confirm search/pagination still work.
7. **Sidebar:** hover over nav items and confirm the background color transitions smoothly rather than snapping instantly.
8. Take a screenshot of the dashboard and at least one list page as evidence.

- [ ] **Step 5: Confirm no `Table`/`Column` import remains unused in converted pages**

Run: `grep -n "import.*Table\b" "apps/web/app/(recruiter)/exams/page.tsx" "apps/web/app/(recruiter)/candidates/page.tsx" "apps/web/app/(recruiter)/questions/page.tsx"`
Expected: no output (the `Table` import was fully replaced with `CardGrid` in Tasks 4-6, not left as unused dead code).
