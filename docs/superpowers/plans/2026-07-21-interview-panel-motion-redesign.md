# Interview Panel Console Motion & Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Framer Motion entrance animation and `CardGrid` list layouts to the interview panel console (`apps/web/app/(panel)/**`), matching the motion feel already shipped on the recruiter, org-admin, and platform-admin consoles — without migrating this console's plain-gray Tailwind styling or its existing `Badge`/`StatusBadge`/`IntegrityBadge` mix onto the design-token system, and without forcing card-grid treatment onto the comparison page's crosstab table.

**Architecture:** Four independent, sequential frontend tasks, each touching one file (plus its test file where verification is needed): the shared layout (nav polish + `MotionConfig` wrap), the Exams list page (`Table` → `CardGrid`), the Exam Results page (stat-card motion + two `Table` → `CardGrid` conversions, one of which embeds a selection checkbox), and the Candidate Detail page (motion-only, no structural change). A final verification task runs the full suite and a live browser pass, specifically re-testing the "Compare selected" flow. The Compare page itself is out of scope — it stays a plain HTML table.

**Tech Stack:** Next.js (App Router), React, Framer Motion (`motion.div`, `MotionConfig`), Tailwind CSS, Jest + React Testing Library, the existing shared `CardGrid` component (`apps/web/components/ui/CardGrid.tsx` — unmodified in this plan), Radix-based `Checkbox` component (`apps/web/components/ui/Checkbox.tsx` — unmodified, has a `hideLabel` prop already built for exactly this row/card-without-duplicate-text scenario).

## Global Constraints

- Do NOT migrate any `gray-*`/`red-*` color class in `apps/web/app/(panel)/**` onto the `recruiter-*`/`status-*` design-token system, and do NOT change which of `Badge`, `StatusBadge`, or `IntegrityBadge` is used anywhere — this console keeps its existing plain-gray palette and mixed badge components exactly as they are. This was an explicit user decision.
- Do NOT add a `sortOptions` prop to any of the three new `CardGrid`s (no sort toolbar in this pass).
- Do NOT touch `apps/web/app/(panel)/reports/[examId]/compare/page.tsx` — it is explicitly out of scope; it stays a raw HTML `<table>` crosstab with no motion added.
- Do NOT change any data-fetching hook, mutation, or business logic (`toggleSelected`, `handleExport`, `handleRegenerate`, the integrity filter, etc.) — every task here only touches JSX markup and imports.
- Motion entrance values are fixed across this whole plan: `initial={{ opacity: 0, y: 10 }}`, `animate={{ opacity: 1, y: 0 }}`, `transition={{ duration: 0.3, ease: 'easeOut' }}` (add `delay` only where a task specifies staggering).
- No new backend endpoints, no new dashboard, no Recharts — this plan only touches `apps/web/app/(panel)/**`.

---

### Task 1: Panel layout — nav motion polish + reduced-motion wrap

**Files:**
- Modify: `apps/web/app/(panel)/layout.tsx`

**Interfaces:**
- Consumes: nothing from other tasks in this plan.
- Produces: nothing consumed by later tasks — Tasks 2-4 are independent page files.

The current file (98 lines) has one sidebar nav link ("Exams"), a profile link, and a logout button — none currently have a `transition-colors` class, and there is no `MotionConfig` wrapper. `apps/web/app/(org-admin)/layout.tsx` and `apps/web/app/(platform)/layout.tsx` both already have this exact `MotionConfig` wrap — this task applies the same pattern here.

- [ ] **Step 1: Add the `MotionConfig` import**

In `apps/web/app/(panel)/layout.tsx`, change:

```tsx
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
```

to:

```tsx
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import { MotionConfig } from 'framer-motion';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
```

- [ ] **Step 2: Add `transition-colors duration-150` to the nav link, profile link, and logout button, and wrap the return tree in `MotionConfig`**

Change the whole `return` block from:

```tsx
  return (
    <div style={themeStyle} className="flex min-h-screen">
      <nav className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-gray-50">
        <div className="p-4">
          {branding?.logoUrl && <img src={branding.logoUrl} alt="Organization logo" className="mb-4 max-h-10" />}
        </div>
        <ul className="flex flex-1 flex-col gap-1 px-4">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={clsx(
                  'block rounded px-3 py-2 text-sm font-medium',
                  pathname?.startsWith(item.href) ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100',
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-3.5 py-3">
          <Link href="/profile" className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 hover:bg-gray-100">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-gray-900">{displayName}</p>
              <p className="text-[10.5px] text-gray-500">Panel</p>
            </div>
          </Link>
          <button
            type="button"
            aria-label="Log out"
            onClick={handleLogout}
            className="shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            <LogOut size={16} />
          </button>
        </div>
      </nav>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
```

to:

```tsx
  return (
    <MotionConfig reducedMotion="user">
      <div style={themeStyle} className="flex min-h-screen">
        <nav className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-gray-50">
          <div className="p-4">
            {branding?.logoUrl && <img src={branding.logoUrl} alt="Organization logo" className="mb-4 max-h-10" />}
          </div>
          <ul className="flex flex-1 flex-col gap-1 px-4">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={clsx(
                    'block rounded px-3 py-2 text-sm font-medium transition-colors duration-150',
                    pathname?.startsWith(item.href) ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-3.5 py-3">
            <Link
              href="/profile"
              className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 transition-colors duration-150 hover:bg-gray-100"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-gray-900">{displayName}</p>
                <p className="text-[10.5px] text-gray-500">Panel</p>
              </div>
            </Link>
            <button
              type="button"
              aria-label="Log out"
              onClick={handleLogout}
              className="shrink-0 rounded-md p-1.5 text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900"
            >
              <LogOut size={16} />
            </button>
          </div>
        </nav>
        <main className="flex-1 p-8">{children}</main>
      </div>
    </MotionConfig>
  );
```

- [ ] **Step 3: Run the existing layout test to confirm no regression**

Run (from `apps/web`): `npx jest "panel.*layout.test" --verbose`

Expected: `5 passed, 5 total` — the five existing tests (renders nav for panel role, redirects wrong role, logs out, renders real name, links avatar to /profile) require no changes; `MotionConfig` is a transparent wrapper with no DOM output of its own, and the `transition-colors duration-150` additions are pure class-string changes.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(panel)/layout.tsx"
git commit -m "feat: add motion polish and reduced-motion support to interview panel nav"
```

---

### Task 2: Exams list page — Table → CardGrid

**Files:**
- Modify: `apps/web/app/(panel)/reports/page.tsx`
- Test: `apps/web/app/(panel)/reports/page.test.tsx` (verify only — no change expected)

**Interfaces:**
- Consumes: `CardGrid` from `../../../components/ui` (existing component, props `{ items, cardKey, renderCard, emptyMessage }`). `ExamListItem`, `ExamStatus` types from `../../../lib/types` (unchanged).
- Produces: nothing consumed by later tasks.

The current file (57 lines) renders a `Table` with two columns (Title as a link, Status as a `Badge`). This task replaces the `Table` with `CardGrid`.

- [ ] **Step 1: Update imports**

Change:

```tsx
import Link from 'next/link';
import { useExams } from '../../../lib/hooks/useExams';
import { Table, Badge, type Column } from '../../../components/ui';
import { ExamListItem, ExamStatus } from '../../../lib/types';
```

to:

```tsx
import Link from 'next/link';
import { useExams } from '../../../lib/hooks/useExams';
import { CardGrid, Badge } from '../../../components/ui';
import { ExamListItem, ExamStatus } from '../../../lib/types';
```

- [ ] **Step 2: Replace the `columns` array with a `renderCard` function**

Change:

```tsx
const columns: Column<ExamListItem>[] = [
  {
    key: 'title',
    header: 'Title',
    render: (exam) => <Link href={`/reports/${exam.id}`}>{exam.title}</Link>,
    sortValue: (exam) => exam.title,
  },
  { key: 'status', header: 'Status', render: (exam) => <Badge variant={STATUS_VARIANT[exam.status]}>{exam.status}</Badge> },
];
```

to:

```tsx
function renderCard(exam: ExamListItem) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Link href={`/reports/${exam.id}`} className="truncate text-sm font-semibold text-gray-900 hover:underline">
        {exam.title}
      </Link>
      <Badge variant={STATUS_VARIANT[exam.status]}>{exam.status}</Badge>
    </div>
  );
}
```

- [ ] **Step 3: Swap the `Table` instance for `CardGrid`**

Change:

```tsx
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Exams</h1>
      <Table columns={columns} rows={exams ?? []} rowKey={(exam) => exam.id} emptyMessage="No exams yet." />
    </div>
  );
```

to:

```tsx
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Exams</h1>
      <CardGrid items={exams ?? []} cardKey={(exam) => exam.id} renderCard={renderCard} emptyMessage="No exams yet." />
    </div>
  );
```

- [ ] **Step 4: Run the existing page test to confirm no regression**

Run (from `apps/web`): `npx jest "panel.*reports/page.test" --verbose`

Expected: `3 passed, 3 total`. The tests use `getByRole('link', { name: 'Backend Screening' })` and `getByText('published')`/`getByText('draft')` — the new card renders the title as its own `Link` and the status as its own `Badge`, so both queries still resolve to isolated nodes. If either assertion unexpectedly fails, check whether it is a structural query with no card equivalent (fix the test to target `.closest('.group')`) or a text-isolation issue from a combined text node (fix the markup to re-isolate the value) — do not weaken the assertion's expected string.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(panel)/reports/page.tsx"
git commit -m "feat: add card grid to interview panel exams list"
```

---

### Task 3: Exam results page — stat-card motion + two Table → CardGrid conversions

**Files:**
- Modify: `apps/web/app/(panel)/reports/[examId]/page.tsx`
- Test: `apps/web/app/(panel)/reports/[examId]/page.test.tsx` (verify only — no change expected)

**Interfaces:**
- Consumes: `CardGrid` from `../../../../components/ui` (same component as Task 2). `ExamResultRow`, `QuestionAccuracyRow` types from `../../../../lib/types` (unchanged — same fields already used by the current `columns`/`accuracyColumns` arrays: `candidateId`, `candidateName`, `attemptId`, `status`, `percentage`, `passFail`, `integrityLevel` on `ExamResultRow`; `questionId`, `questionText`, `accuracyPercentage`, `timesAttempted`, `timesIncluded` on `QuestionAccuracyRow`).
- Produces: nothing consumed by later tasks — Task 4 is an independent file.

The current file (183 lines) has: 4 summary stat `Card`s, a "Question accuracy" `Table`, and a "Candidates" `Table` whose first column is a per-row `Checkbox` driving `selectedIds`/the "Compare selected" button. This task wraps the 4 stat cards in staggered `motion.div`s and converts both tables to `CardGrid`, embedding the existing `Checkbox` (with its `hideLabel` prop, since the candidate name is already shown as a link in the same card) directly in the candidates `renderCard`.

- [ ] **Step 1: Update imports**

Change:

```tsx
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useExam } from '../../../../lib/hooks/useExams';
import { useResultsSummary, useQuestionAccuracy, useResultsList, useResultsExport } from '../../../../lib/hooks/usePanelReports';
import { Table, Badge, Button, Checkbox, Card, Select, IntegrityBadge, useToast, type Column } from '../../../../components/ui';
import { ExamResultRow, QuestionAccuracyRow } from '../../../../lib/types';
```

to:

```tsx
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useExam } from '../../../../lib/hooks/useExams';
import { useResultsSummary, useQuestionAccuracy, useResultsList, useResultsExport } from '../../../../lib/hooks/usePanelReports';
import { CardGrid, Badge, Button, Checkbox, Card, Select, IntegrityBadge, useToast } from '../../../../components/ui';
import { ExamResultRow, QuestionAccuracyRow } from '../../../../lib/types';
```

- [ ] **Step 2: Replace the `columns` and `accuracyColumns` arrays with `renderCandidateCard` and `renderAccuracyCard` functions**

`renderCandidateCard` must stay defined inside the component (as `columns` currently is), since it closes over `selectedIds`, `toggleSelected`, and `examId`. `renderAccuracyCard` has no such dependency and can be a plain function at the same nesting level.

Change:

```tsx
  const columns: Column<ExamResultRow>[] = [
    {
      key: 'select',
      header: '',
      render: (row) => (
        <Checkbox
          checked={selectedIds.includes(row.candidateId)}
          onChange={() => toggleSelected(row.candidateId)}
          label={`Select ${row.candidateName}`}
        />
      ),
    },
    {
      key: 'name',
      header: 'Candidate',
      render: (row) => (
        <Link href={`/reports/${examId}/candidates/${row.candidateId}?attemptId=${row.attemptId ?? ''}`}>
          {row.candidateName}
        </Link>
      ),
      sortValue: (row) => row.candidateName,
    },
    { key: 'status', header: 'Status', render: (row) => row.status },
    {
      key: 'percentage',
      header: 'Score %',
      render: (row) => (row.percentage !== null ? `${row.percentage.toFixed(1)}%` : '—'),
      sortValue: (row) => row.percentage ?? -1,
    },
    {
      key: 'passFail',
      header: 'Result',
      render: (row) => (row.passFail ? <Badge variant={PASS_FAIL_VARIANT[row.passFail] ?? 'default'}>{row.passFail}</Badge> : '—'),
    },
    {
      key: 'integrity',
      header: 'Integrity',
      render: (row) => <IntegrityBadge level={row.integrityLevel} />,
    },
  ];

  const accuracyColumns: Column<QuestionAccuracyRow>[] = [
    { key: 'question', header: 'Question', render: (row) => row.questionText },
    {
      key: 'accuracy',
      header: 'Accuracy',
      render: (row) => `${row.accuracyPercentage.toFixed(1)}%`,
      sortValue: (row) => row.accuracyPercentage,
    },
    { key: 'attempted', header: 'Attempted / Included', render: (row) => `${row.timesAttempted} / ${row.timesIncluded}` },
  ];
```

to:

```tsx
  function renderCandidateCard(row: ExamResultRow) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Checkbox
            checked={selectedIds.includes(row.candidateId)}
            onChange={() => toggleSelected(row.candidateId)}
            label={`Select ${row.candidateName}`}
            hideLabel
          />
          <Link
            href={`/reports/${examId}/candidates/${row.candidateId}?attemptId=${row.attemptId ?? ''}`}
            className="flex-1 truncate text-sm font-semibold text-gray-900 hover:underline"
          >
            {row.candidateName}
          </Link>
          {row.passFail && <Badge variant={PASS_FAIL_VARIANT[row.passFail] ?? 'default'}>{row.passFail}</Badge>}
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{row.status}</span>
          <span>{row.percentage !== null ? `${row.percentage.toFixed(1)}%` : '—'}</span>
          <IntegrityBadge level={row.integrityLevel} />
        </div>
      </div>
    );
  }

  function renderAccuracyCard(row: QuestionAccuracyRow) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-sm text-gray-800">{row.questionText}</p>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{row.accuracyPercentage.toFixed(1)}% accuracy</span>
          <span>
            {row.timesAttempted} / {row.timesIncluded}
          </span>
        </div>
      </div>
    );
  }
```

- [ ] **Step 3: Wrap the 4 stat `Card`s in staggered `motion.div`s**

Change:

```tsx
      {summaryLoading ? (
        <p className="mb-6 text-sm text-gray-500">Loading summary…</p>
      ) : summary ? (
        <div className="mb-6 grid grid-cols-4 gap-4">
          <Card>
            <p className="text-xs text-gray-500">Total candidates</p>
            <p className="text-2xl font-semibold">{summary.totalCandidates}</p>
          </Card>
          <Card>
            <p className="text-xs text-gray-500">Settled</p>
            <p className="text-2xl font-semibold">{summary.settledCount}</p>
          </Card>
          <Card>
            <p className="text-xs text-gray-500">Pass rate</p>
            <p className="text-2xl font-semibold">{summary.passRate.toFixed(1)}%</p>
          </Card>
          <Card>
            <p className="text-xs text-gray-500">Average score</p>
            <p className="text-2xl font-semibold">{summary.averagePercentage.toFixed(1)}%</p>
          </Card>
        </div>
      ) : null}
```

to:

```tsx
      {summaryLoading ? (
        <p className="mb-6 text-sm text-gray-500">Loading summary…</p>
      ) : summary ? (
        <div className="mb-6 grid grid-cols-4 gap-4">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0, ease: 'easeOut' }}>
            <Card>
              <p className="text-xs text-gray-500">Total candidates</p>
              <p className="text-2xl font-semibold">{summary.totalCandidates}</p>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05, ease: 'easeOut' }}>
            <Card>
              <p className="text-xs text-gray-500">Settled</p>
              <p className="text-2xl font-semibold">{summary.settledCount}</p>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1, ease: 'easeOut' }}>
            <Card>
              <p className="text-xs text-gray-500">Pass rate</p>
              <p className="text-2xl font-semibold">{summary.passRate.toFixed(1)}%</p>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15, ease: 'easeOut' }}>
            <Card>
              <p className="text-xs text-gray-500">Average score</p>
              <p className="text-2xl font-semibold">{summary.averagePercentage.toFixed(1)}%</p>
            </Card>
          </motion.div>
        </div>
      ) : null}
```

- [ ] **Step 4: Swap the "Question accuracy" `Table` for `CardGrid`**

Change:

```tsx
      <div className="mb-6">
        <h2 className="mb-2 text-lg font-medium">Question accuracy</h2>
        {accuracyLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <Table
            columns={accuracyColumns}
            rows={accuracyRows ?? []}
            rowKey={(row) => row.questionId}
            emptyMessage="No settled attempts yet."
          />
        )}
      </div>
```

to:

```tsx
      <div className="mb-6">
        <h2 className="mb-2 text-lg font-medium">Question accuracy</h2>
        {accuracyLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <CardGrid
            items={accuracyRows ?? []}
            cardKey={(row) => row.questionId}
            renderCard={renderAccuracyCard}
            emptyMessage="No settled attempts yet."
          />
        )}
      </div>
```

- [ ] **Step 5: Swap the "Candidates" `Table` for `CardGrid`**

Change:

```tsx
        {resultsLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <Table
            columns={columns}
            rows={(results ?? []).filter((row) => integrityFilter === 'all' || row.integrityLevel === integrityFilter)}
            rowKey={(row) => row.candidateId}
            emptyMessage="No candidates invited yet."
          />
        )}
```

to:

```tsx
        {resultsLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <CardGrid
            items={(results ?? []).filter((row) => integrityFilter === 'all' || row.integrityLevel === integrityFilter)}
            cardKey={(row) => row.candidateId}
            renderCard={renderCandidateCard}
            emptyMessage="No candidates invited yet."
          />
        )}
```

- [ ] **Step 6: Run the existing page test to confirm no regression**

Run (from `apps/web`): `npx jest "panel.*reports/.examId./page.test" --verbose`

Expected: `5 passed, 5 total`. In particular, "enables Compare selected only once at least 2 candidates are checked" must still pass — it clicks `getByRole('checkbox', { name: 'Select Alice' })` (the accessible name comes from the `Checkbox`'s `aria-label`, which `hideLabel` does not remove), and "renders the exam title, summary stats, and candidate rows with links" must still resolve `getByRole('link', { name: 'Alice' })` against the new card's `Link`. If any assertion unexpectedly fails, check whether it is a structural query with no card equivalent (fix the test to target `.closest('.group')`) or a text-isolation issue from a combined text node (fix the markup to re-isolate the value) — do not weaken the assertion's expected string.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/(panel)/reports/[examId]/page.tsx"
git commit -m "feat: add motion polish and card grids to interview panel exam results page"
```

---

### Task 4: Candidate detail page — motion polish only

**Files:**
- Modify: `apps/web/app/(panel)/reports/[examId]/candidates/[candidateId]/page.tsx`
- Test: `apps/web/app/(panel)/reports/[examId]/candidates/[candidateId]/page.test.tsx` (verify only — no change expected)

**Interfaces:**
- Consumes: nothing new — only adds a `motion` import.
- Produces: nothing consumed by later tasks.

The current file (169 lines) has no `Table`, so this task is motion-only: the score `Card`, the AI Insight section (whichever of its 3 conditional branches renders), and each section `Card` in the per-question breakdown all gain fade-up entrance motion. No structural change to any conditional logic, hook, or handler.

- [ ] **Step 1: Add the `motion` import**

Change:

```tsx
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  useCandidateReport,
  useAttemptInsight,
  useRegenerateAttemptInsight,
  useResultsList,
} from '../../../../../../lib/hooks/usePanelReports';
import { Badge, Button, Card, StatusBadge, IntegrityBadge, useToast, type StatusTone } from '../../../../../../components/ui';
```

to:

```tsx
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  useCandidateReport,
  useAttemptInsight,
  useRegenerateAttemptInsight,
  useResultsList,
} from '../../../../../../lib/hooks/usePanelReports';
import { Badge, Button, Card, StatusBadge, IntegrityBadge, useToast, type StatusTone } from '../../../../../../components/ui';
```

- [ ] **Step 2: Wrap the score `Card` in a `motion.div`**

Change:

```tsx
      <Card className="mb-6">
        <p className="text-xs text-gray-500">Score</p>
        <p className="text-2xl font-semibold">
          {candidate.percentage !== null ? `${candidate.percentage.toFixed(1)}%` : '—'}
          {candidate.score !== null && candidate.maxScore !== null && (
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({candidate.score}/{candidate.maxScore})
            </span>
          )}
        </p>
      </Card>
```

to:

```tsx
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0, ease: 'easeOut' }}>
        <Card className="mb-6">
          <p className="text-xs text-gray-500">Score</p>
          <p className="text-2xl font-semibold">
            {candidate.percentage !== null ? `${candidate.percentage.toFixed(1)}%` : '—'}
            {candidate.score !== null && candidate.maxScore !== null && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({candidate.score}/{candidate.maxScore})
              </span>
            )}
          </p>
        </Card>
      </motion.div>
```

- [ ] **Step 3: Convert the AI Insight section's wrapping `div` into a `motion.div`**

Change:

```tsx
      {attemptId && (
        <div className="mb-6">
          <h2 className="mb-2 text-lg font-medium">AI Insight</h2>
          {insightLoading ? (
```

to:

```tsx
      {attemptId && (
        <motion.div
          className="mb-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05, ease: 'easeOut' }}
        >
          <h2 className="mb-2 text-lg font-medium">AI Insight</h2>
          {insightLoading ? (
```

And its closing tag — change:

```tsx
          )}
        </div>
      )}

      <div className="flex flex-col gap-4">
```

to:

```tsx
          )}
        </motion.div>
      )}

      <div className="flex flex-col gap-4">
```

- [ ] **Step 4: Wrap each section `Card` in a staggered `motion.div`**

Change:

```tsx
      <div className="flex flex-col gap-4">
        {candidate.sections.map((section) => (
          <Card key={section.sectionId}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-medium">{section.title}</h3>
              <span className="text-sm text-gray-500">
                {section.score}/{section.maxScore}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {section.questions.map((question) => (
                <div key={question.questionId} className="border-t border-gray-100 pt-3 first:border-0 first:pt-0">
                  <p className="mb-2 text-sm text-gray-800">{question.questionText}</p>
                  <div className="flex flex-col gap-1">
                    {question.options.map((option) => {
                      const wasSelected = question.selectedOptionIds.includes(option.id);
                      const isCorrectOption = question.correctOptionIds.includes(option.id);
                      return (
                        <p
                          key={option.id}
                          className={
                            isCorrectOption
                              ? 'text-sm font-medium text-green-700'
                              : wasSelected
                                ? 'text-sm font-medium text-red-700'
                                : 'text-sm text-gray-600'
                          }
                        >
                          {wasSelected ? '◉' : '○'} {option.text}
                          {isCorrectOption ? ' (correct)' : ''}
                        </p>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
```

to:

```tsx
      <div className="flex flex-col gap-4">
        {candidate.sections.map((section, index) => (
          <motion.div
            key={section.sectionId}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 + Math.min(index, 8) * 0.05, ease: 'easeOut' }}
          >
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-medium">{section.title}</h3>
                <span className="text-sm text-gray-500">
                  {section.score}/{section.maxScore}
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {section.questions.map((question) => (
                  <div key={question.questionId} className="border-t border-gray-100 pt-3 first:border-0 first:pt-0">
                    <p className="mb-2 text-sm text-gray-800">{question.questionText}</p>
                    <div className="flex flex-col gap-1">
                      {question.options.map((option) => {
                        const wasSelected = question.selectedOptionIds.includes(option.id);
                        const isCorrectOption = question.correctOptionIds.includes(option.id);
                        return (
                          <p
                            key={option.id}
                            className={
                              isCorrectOption
                                ? 'text-sm font-medium text-green-700'
                                : wasSelected
                                  ? 'text-sm font-medium text-red-700'
                                  : 'text-sm text-gray-600'
                            }
                          >
                            {wasSelected ? '◉' : '○'} {option.text}
                            {isCorrectOption ? ' (correct)' : ''}
                          </p>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
```

- [ ] **Step 5: Run the existing page test to confirm no regression**

Run (from `apps/web`): `npx jest "panel.*candidates/.candidateId./page.test" --verbose`

Expected: `8 passed, 8 total`. None of the 8 existing tests query by structure (table role, DOM nesting) — they all use `getByText`/`getByRole('button'|'link')`, which resolve identically whether or not a `motion.div` wraps the `Card`.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(panel)/reports/[examId]/candidates/[candidateId]/page.tsx"
git commit -m "feat: add motion polish to interview panel candidate detail page"
```

---

### Task 5: Final verification

**Files:** none (verification only).

**Interfaces:**
- Consumes: the complete state of `apps/web/app/(panel)/**` after Tasks 1-4.
- Produces: nothing — this is the plan's terminal task.

- [ ] **Step 1: Run the full apps/web test suite**

Run (from `apps/web`): `npx jest`

Expected: all suites pass, including `app/(panel)/layout.test.tsx`, `app/(panel)/reports/page.test.tsx`, `app/(panel)/reports/[examId]/page.test.tsx`, `app/(panel)/reports/[examId]/candidates/[candidateId]/page.test.tsx`, and `app/(panel)/reports/[examId]/compare/page.test.tsx` (unchanged, verify it still passes untouched).

- [ ] **Step 2: Run the TypeScript compiler**

Run (from `apps/web`): `npx tsc --noEmit`

Expected: no new errors in any of the four modified files. Any pre-existing unrelated errors (e.g. in candidate-facing or auth test files) are out of scope for this plan.

- [ ] **Step 3: Live browser verification**

Start the dev server and, logged in as `panel@demo-org.test` / `Passw0rd!2026` (org slug `demo-org`):
- Confirm the "Exams" nav link, profile link, and logout button show a smooth color transition on hover.
- Confirm `/reports` shows the exams list as a card grid (title link + status badge per card).
- Open an exam's results page (`/reports/{examId}`) and confirm: the 4 summary stat cards fade up in a staggered sequence; the Question accuracy list renders as a card grid; the Candidates list renders as a card grid with a checkbox on each card.
- Select 2+ candidate cards via their checkboxes, confirm "Compare selected" becomes enabled, click it, and confirm it navigates to `/reports/{examId}/compare?candidateIds=...` with the correct IDs and that the compare page still renders its crosstab table unchanged.
- Open a candidate's detail page and confirm the score card, AI Insight card, and each section card fade up on load.
- In OS or browser dev tools, enable "prefers reduced motion" and reload the exams list, results page, and candidate detail page — confirm entrance animations no longer play (content appears immediately, no fade/slide).

- [ ] **Step 4: Commit any fixes found during verification**

If Steps 1-3 surface any issue, fix it, re-run the relevant command from this task, and commit:

```bash
git add -A
git commit -m "fix: address final verification findings for interview panel motion redesign"
```

If no issues are found, skip this step — there is nothing to commit.
