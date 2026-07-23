# Candidate UX Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four independent candidate-experience improvements — practice questions, a pre-start time breakdown, a configurable post-submission feedback report, and silent per-candidate extra-time accommodations.

**Architecture:** Approach A (extend existing endpoints/pages minimally). No new services. Practice questions are pure `apps/web` (zero backend). Time transparency and accommodations both extend `AttemptService.getCurrent()`'s pre-start branch in `apps/exam-runtime`. Feedback visibility extends the same method's post-start branch, computing section scores from data `apps/exam-runtime` already queries (`sectionSnapshotJson` + graded `Answer` rows) — no cross-service call into `apps/api`. Accommodation timing math is centralized behind one pure helper and threaded through every `apps/exam-runtime` call site that currently reads `exam.durationMinutes` for timing.

**Tech Stack:** NestJS (apps/api, apps/exam-runtime), Prisma/Azure SQL, Next.js/React/React Query (apps/web), Playwright e2e, Jest.

## Global Constraints

- Feedback visibility (`Exam.feedbackVisibility`) is **per-exam**, not org-wide. Default `pass_fail`.
- Extra time (`Invitation.extraTimePercent`) is a **percentage bonus**, default `0`. Editable **any time before that invitation's Attempt exists**; once an Attempt exists, edits must be rejected **server-side with 400**, not just UI-disabled.
- The candidate is **never told** their duration was adjusted — the welcome screen shows one number, framed as "the" duration, with nothing to compare it against. No accommodation-specific candidate UI of any kind.
- Practice questions are two hardcoded, frontend-only constants (one `single_mcq`, one `code`) — not stored in the database, not editable by orgs, no telemetry, no server round-trip.
- Server-side enforcement principle (reused from the Integrity feature's consent gate): feedback filtering by `feedbackVisibility` happens in `apps/exam-runtime`, never just hidden in the UI.
- `pending_manual_grade` attempts show a distinct "still being reviewed" state regardless of `feedbackVisibility` — no level shows any result data for it.
- Section-count computation for a pool section with `poolSize` unset falls back to `0`.

---

### Task 1: Schema — `Exam.feedbackVisibility` + `Invitation.extraTimePercent`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260719120000_candidate_ux_pack/migration.sql`

**Interfaces:**
- Produces: `Exam.feedbackVisibility: string` (Prisma `String @default("pass_fail")`), `Invitation.extraTimePercent: number` (Prisma `Int @default(0)`) — both consumed by every later task in this plan.

- [ ] **Step 1: Add the two columns to `schema.prisma`**

In `apps/api/prisma/schema.prisma`, add `feedbackVisibility` to `model Exam` (after `randomizeOrder`, matching the existing field order):

```prisma
model Exam {
  id                      String        @id @default(uuid()) @db.UniqueIdentifier
  organizationId          String        @map("organization_id") @db.UniqueIdentifier
  title                   String
  instructions            String?       @db.NVarChar(Max)
  status                  String        @default("draft")
  durationMinutes         Int           @default(60) @map("duration_minutes")
  passCriteriaPercent     Int           @default(40) @map("pass_criteria_percent")
  randomizeOrder          Boolean       @default(false) @map("randomize_order")
  feedbackVisibility      String        @default("pass_fail") @map("feedback_visibility")
  schedulingEnabled       Boolean       @default(false) @map("scheduling_enabled")
  availabilityWindowStart DateTime?     @map("availability_window_start")
  availabilityWindowEnd   DateTime?     @map("availability_window_end")
  createdBy               String        @map("created_by") @db.UniqueIdentifier
  createdAt               DateTime      @default(now()) @map("created_at")
  sections                ExamSection[]
  invitations             Invitation[]

  @@index([organizationId, status])
  @@map("exams")
}
```

Add `extraTimePercent` to `model Invitation` (after `status`):

```prisma
model Invitation {
  id                     String                  @id @default(uuid()) @db.UniqueIdentifier
  examId                 String                  @map("exam_id") @db.UniqueIdentifier
  candidateId            String                  @map("candidate_id") @db.UniqueIdentifier
  token                  String                  @unique
  status                 String                  @default("invited")
  extraTimePercent       Int                     @default(0) @map("extra_time_percent")
  invitedAt              DateTime                @default(now()) @map("invited_at")
  expiresAt              DateTime                @map("expires_at")
  revokedAt              DateTime?               @map("revoked_at")
  activeSessionFamilyId  String?                 @map("active_session_family_id")
  exam                   Exam                    @relation(fields: [examId], references: [id], onDelete: Cascade)
  candidate              Candidate               @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  notifications          Notification[]
  attempt                Attempt?
  candidateRefreshTokens CandidateRefreshToken[]

  @@index([examId, status])
  @@map("invitations")
}
```

- [ ] **Step 2: Write the migration SQL**

Create `apps/api/prisma/migrations/20260719120000_candidate_ux_pack/migration.sql`:

```sql
ALTER TABLE [dbo].[exams] ADD [feedback_visibility] NVARCHAR(1000) NOT NULL CONSTRAINT [exams_feedback_visibility_df] DEFAULT 'pass_fail';
ALTER TABLE [dbo].[invitations] ADD [extra_time_percent] INT NOT NULL CONSTRAINT [invitations_extra_time_percent_df] DEFAULT 0;
```

- [ ] **Step 3: Apply the migration and regenerate the Prisma client**

Run: `cd apps/api && npx prisma migrate deploy && npx prisma generate`
Expected: `20260719120000_candidate_ux_pack` applied, client regenerated with `feedbackVisibility` on `Exam` and `extraTimePercent` on `Invitation`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260719120000_candidate_ux_pack
git commit -m "feat: add Exam.feedbackVisibility and Invitation.extraTimePercent columns"
```

---

### Task 2: exam-runtime — accommodation duration math

**Files:**
- Modify: `apps/exam-runtime/src/grading/grading.ts`
- Modify: `apps/exam-runtime/src/grading/grading.spec.ts`
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts` (`resolveContext`, line ~464)
- Modify: `apps/exam-runtime/src/attempts/attempt.service.spec.ts`
- Modify: `apps/exam-runtime/src/internal/internal.controller.ts` (`settleIfExpiredBatch`, line ~112)
- Modify: `apps/exam-runtime/src/internal/internal.controller.spec.ts`
- Modify: `apps/exam-runtime/src/monitoring/monitoring.service.ts` (`getRosterSnapshot`, line ~55)
- Modify: `apps/exam-runtime/src/monitoring/monitoring.service.spec.ts`

**Interfaces:**
- Consumes: `Invitation.extraTimePercent` (Task 1).
- Produces: `effectiveDurationMinutes(durationMinutes: number, extraTimePercent: number): number` in `grading.ts`, used by Task 3 (preview response) and reused by every settlement-timing call site.

This is the single change point for accommodation math: everywhere an `exam.durationMinutes` value feeds a timing calculation, it must be the candidate's *effective* duration, not the exam's raw one. Auto-submitting a candidate with +50% extra time on the raw duration would silently erase their accommodation.

- [ ] **Step 1: Write the failing test for the helper**

In `apps/exam-runtime/src/grading/grading.spec.ts`, add:

```typescript
describe('effectiveDurationMinutes', () => {
  it('returns the raw duration when extraTimePercent is 0', () => {
    expect(effectiveDurationMinutes(60, 0)).toBe(60);
  });

  it('applies a percentage bonus', () => {
    expect(effectiveDurationMinutes(60, 50)).toBe(90);
  });

  it('rounds to the nearest whole minute', () => {
    expect(effectiveDurationMinutes(45, 33)).toBe(60);
  });
});
```

Add the import at the top: `import { effectiveDurationMinutes, ... } from './grading';` (alongside whatever is already imported there).

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/exam-runtime && npx jest grading.spec.ts`
Expected: FAIL — `effectiveDurationMinutes is not a function`

- [ ] **Step 3: Implement the helper**

In `apps/exam-runtime/src/grading/grading.ts`, add:

```typescript
export function effectiveDurationMinutes(durationMinutes: number, extraTimePercent: number): number {
  return Math.round(durationMinutes * (1 + extraTimePercent / 100));
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/exam-runtime && npx jest grading.spec.ts`
Expected: PASS

- [ ] **Step 5: Wire it into `AttemptService.resolveContext()`**

`resolveContext()` (line ~464) is the single point every `getCurrent`/`start`/`answer`/`markForReview`/`submit`/`runCode` call site gets its `exam` object from — fixing it here fixes every downstream `settleIfExpired`/`remainingSeconds` call for free. In `apps/exam-runtime/src/attempts/attempt.service.ts`, add the import:

```typescript
import { shuffle } from './shuffle';
import { effectiveDurationMinutes } from '../grading/grading';
```

Replace `resolveContext()`:

```typescript
  private async resolveContext(invitationId: string) {
    const invitation = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.invitation.findUnique({ where: { id: invitationId }, include: { exam: true } }),
    );
    if (!invitation || !invitation.exam) {
      throw new UnauthorizedException('Invalid candidate session');
    }
    const exam = {
      ...invitation.exam,
      durationMinutes: effectiveDurationMinutes(invitation.exam.durationMinutes, invitation.extraTimePercent),
    };
    return { organizationId: exam.organizationId, exam, invitation };
  }
```

- [ ] **Step 6: Update `attempt.service.spec.ts`'s shared fixtures and add a regression test**

In `apps/exam-runtime/src/attempts/attempt.service.spec.ts`, the shared `invitationRecord` fixture (line ~31) needs `extraTimePercent` so existing tests (which expect the raw 60-minute duration unchanged) keep passing:

```typescript
  const invitationRecord = { id: 'inv-1', candidateId: 'cand-1', examId: 'exam-1', exam, extraTimePercent: 0 };
```

Then add a new test inside `describe('getCurrent', ...)`:

```typescript
    it('returns the effective duration (exam duration + extraTimePercent) when the invitation has an accommodation', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve({ ...invitationRecord, extraTimePercent: 50 }))
        .mockImplementationOnce((_ctx, fn) => fn(tx));

      const result = await service.getCurrent(session);

      // toMatchObject, not toEqual: Task 3 (later in this plan) adds a `sections` field to this
      // same pre-start response shape — this test only cares about the duration math.
      expect(result).toMatchObject({
        exam: {
          title: 'Backend Round', instructions: 'Be honest', durationMinutes: 90,
          schedulingEnabled: false, availabilityWindowStart: null, availabilityWindowEnd: null,
        },
        schedulingWindowState: null,
      });
    });
```

- [ ] **Step 7: Run the exam-runtime attempt suite**

Run: `cd apps/exam-runtime && npx jest attempt.service.spec.ts`
Expected: PASS (all existing tests plus the new one)

- [ ] **Step 8: Wire it into `InternalController.settleIfExpiredBatch()`**

This path is used by `apps/api`'s `ExamsService.getResults()` to settle expired attempts when a recruiter loads the results page — it fetches `attempt.invitation.exam` directly, bypassing `resolveContext()`, so it needs the same fix independently. In `apps/exam-runtime/src/internal/internal.controller.ts`, add the import:

```typescript
import { InternalAuthGuard } from './internal-auth.guard';
import { effectiveDurationMinutes } from '../grading/grading';
```

Replace the body of `settleIfExpiredBatch`:

```typescript
  @Post('attempts/settle-if-expired-batch')
  @HttpCode(204)
  async settleIfExpiredBatch(@Body() dto: SettleIfExpiredBatchDto): Promise<void> {
    await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, async (tx) => {
      const attempts = await tx.attempt.findMany({
        where: { id: { in: dto.attemptIds } },
        include: { invitation: { include: { exam: true } } },
      });
      for (const attempt of attempts) {
        const exam = {
          ...attempt.invitation.exam,
          durationMinutes: effectiveDurationMinutes(attempt.invitation.exam.durationMinutes, attempt.invitation.extraTimePercent),
        };
        await this.attemptSettlement.settleIfExpired(tx, exam, attempt);
      }
    });
  }
```

(`forceSubmit` and `finalizeManualGrade` call `finalize`/`finalizeManualGrade`, neither of which reads `durationMinutes` — no change needed there.)

- [ ] **Step 9: Update `internal.controller.spec.ts`'s `settleIfExpiredBatch` test**

In `apps/exam-runtime/src/internal/internal.controller.spec.ts` (line ~190), update the fixtures and expectations:

```typescript
  describe('settleIfExpiredBatch', () => {
    it('settles every attempt found for the given ids, applying each invitation\'s extra-time accommodation', async () => {
      const exam1 = { id: 'exam-1', durationMinutes: 30, passCriteriaPercent: 40 };
      const attempt1 = { id: 'attempt-1', status: 'in_progress', invitation: { exam: exam1, extraTimePercent: 0 } };
      const attempt2 = { id: 'attempt-2', status: 'in_progress', invitation: { exam: exam1, extraTimePercent: 50 } };
      const tx = { attempt: { findMany: jest.fn().mockResolvedValue([attempt1, attempt2]) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await controller.settleIfExpiredBatch({ attemptIds: ['attempt-1', 'attempt-2'] });

      expect(tenantPrisma.forTenant).toHaveBeenCalledWith({ organizationId: null, isSuperAdmin: true }, expect.any(Function));
      expect(tx.attempt.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['attempt-1', 'attempt-2'] } },
        include: { invitation: { include: { exam: true } } },
      });
      expect(attemptSettlement.settleIfExpired).toHaveBeenCalledTimes(2);
      expect(attemptSettlement.settleIfExpired).toHaveBeenNthCalledWith(1, tx, { ...exam1, durationMinutes: 30 }, attempt1);
      expect(attemptSettlement.settleIfExpired).toHaveBeenNthCalledWith(2, tx, { ...exam1, durationMinutes: 45 }, attempt2);
    });

    it('settles nothing when no matching attempts are found', async () => {
      const tx = { attempt: { findMany: jest.fn().mockResolvedValue([]) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await controller.settleIfExpiredBatch({ attemptIds: ['missing-1'] });

      expect(attemptSettlement.settleIfExpired).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 10: Wire it into `MonitoringService.getRosterSnapshot()`**

The live-roster "time remaining" column reads `exam.durationMinutes` directly — without this it would under-report remaining time for an accommodated candidate. In `apps/exam-runtime/src/monitoring/monitoring.service.ts`, add the import:

```typescript
import { computeRemainingSeconds, effectiveDurationMinutes } from '../grading/grading';
```

Replace the `remainingSeconds` line inside `getRosterSnapshot`:

```typescript
          if (attempt.status === 'in_progress') {
            remainingSeconds = computeRemainingSeconds(
              effectiveDurationMinutes(exam.durationMinutes, invitation.extraTimePercent),
              attempt.startedAt,
            );
          }
```

- [ ] **Step 11: Add a roster regression test**

In `apps/exam-runtime/src/monitoring/monitoring.service.spec.ts`, inside `describe('getRosterSnapshot', ...)`, add:

```typescript
    it('applies the invitation\'s extra-time accommodation to remainingSeconds for an in-progress attempt', async () => {
      const startedAt = new Date(Date.now() - 60 * 60_000);
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue(exam) },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'inv-1', candidateId: 'cand-1', status: 'invited', candidate: { name: 'Alice' }, extraTimePercent: 50,
              attempt: { id: 'attempt-1', status: 'in_progress', startedAt, lastSeenAt: new Date(), questionOrderJson: '["q1"]' },
            },
          ]),
        },
        answer: { count: jest.fn().mockResolvedValue(0) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const [row] = await service.getRosterSnapshot(context, 'exam-1');

      // exam.durationMinutes is 60; +50% = 90 effective minutes, 60 elapsed -> ~30 min (1800s) left.
      expect(row.remainingSeconds).toBeGreaterThan(1750);
      expect(row.remainingSeconds).toBeLessThanOrEqual(1800);
    });
```

- [ ] **Step 12: Run the full exam-runtime suite**

Run: `cd apps/exam-runtime && npx jest --testPathIgnorePatterns=test/`
Expected: PASS, no regressions

- [ ] **Step 13: Commit**

```bash
git add apps/exam-runtime/src/grading/grading.ts apps/exam-runtime/src/grading/grading.spec.ts \
  apps/exam-runtime/src/attempts/attempt.service.ts apps/exam-runtime/src/attempts/attempt.service.spec.ts \
  apps/exam-runtime/src/internal/internal.controller.ts apps/exam-runtime/src/internal/internal.controller.spec.ts \
  apps/exam-runtime/src/monitoring/monitoring.service.ts apps/exam-runtime/src/monitoring/monitoring.service.spec.ts
git commit -m "feat: thread invitation.extraTimePercent through settlement and monitoring timing math"
```

---

### Task 3: exam-runtime — time transparency (section breakdown in the pre-start preview)

**Files:**
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts` (interfaces + `getCurrent`'s pre-start branch, line ~61 and ~98)
- Modify: `apps/exam-runtime/src/attempts/attempt.service.spec.ts`

**Interfaces:**
- Consumes: `effectiveDurationMinutes` (Task 2).
- Produces: `AttemptPreviewResponse.sections: { title: string; questionCount: number }[]`, consumed by Task 4 (welcome screen).

- [ ] **Step 1: Write the failing test**

In `apps/exam-runtime/src/attempts/attempt.service.spec.ts`, inside `describe('getCurrent', ...)`, replace the existing "returns an exam preview with no questions" test's `tx` setup to include sections, and assert the new field:

```typescript
    it('returns an exam preview with a section/question-count breakdown when no attempt has been started yet', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Section One', selectionMode: 'fixed', poolSize: null, questions: [{ id: 'q1' }, { id: 'q2' }] },
            { id: 'section-2', title: 'Section Two', selectionMode: 'pool', poolSize: 5, questions: [] },
          ]),
        },
      };
      mockBootstrapThenScoped(tx);

      const result = await service.getCurrent(session);

      expect(result).toEqual({
        exam: {
          title: 'Backend Round', instructions: 'Be honest', durationMinutes: 60,
          schedulingEnabled: false, availabilityWindowStart: null, availabilityWindowEnd: null,
        },
        schedulingWindowState: null,
        sections: [
          { title: 'Section One', questionCount: 2 },
          { title: 'Section Two', questionCount: 5 },
        ],
      });
    });

    it('falls back to 0 questions for a pool section with poolSize unset', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Section One', selectionMode: 'pool', poolSize: null, questions: [] },
          ]),
        },
      };
      mockBootstrapThenScoped(tx);

      const result = await service.getCurrent(session);

      expect(result.sections).toEqual([{ title: 'Section One', questionCount: 0 }]);
    });
```

Remove (or update, if it's the one being replaced above) the old "returns an exam preview with no questions when no attempt has been started yet" test — it asserted an exact-equality object that will now be missing `sections` and its mocked `tx` has no `examSection.findMany`, so it must be superseded by the first test above rather than left alongside it.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/exam-runtime && npx jest attempt.service.spec.ts`
Expected: FAIL — `result.sections` is `undefined`, and/or `tx.examSection.findMany is not a function`

- [ ] **Step 3: Add the `sections` field to `AttemptPreviewResponse` and compute it**

In `apps/exam-runtime/src/attempts/attempt.service.ts`, update the interface (line ~61):

```typescript
interface AttemptSectionSummary {
  title: string;
  questionCount: number;
}

interface AttemptPreviewResponse {
  exam: {
    title: string;
    instructions: string | null;
    durationMinutes: number;
    schedulingEnabled: boolean;
    availabilityWindowStart: Date | null;
    availabilityWindowEnd: Date | null;
  };
  schedulingWindowState: 'not_open' | 'open' | 'closed' | null;
  sections: AttemptSectionSummary[];
}
```

Replace the pre-start branch inside `getCurrent()` (line ~103-115):

```typescript
      if (!attempt) {
        const sections = await tx.examSection.findMany({
          where: { examId: exam.id },
          orderBy: { orderIndex: 'asc' },
          include: { questions: true },
        });
        return {
          exam: {
            title: exam.title,
            instructions: exam.instructions,
            durationMinutes: exam.durationMinutes,
            schedulingEnabled: exam.schedulingEnabled,
            availabilityWindowStart: exam.availabilityWindowStart,
            availabilityWindowEnd: exam.availabilityWindowEnd,
          },
          schedulingWindowState: this.getSchedulingWindowState(exam),
          sections: sections.map((section) => ({
            title: section.title,
            questionCount: section.selectionMode === 'pool' ? (section.poolSize ?? 0) : section.questions.length,
          })),
        };
      }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/exam-runtime && npx jest attempt.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/exam-runtime/src/attempts/attempt.service.ts apps/exam-runtime/src/attempts/attempt.service.spec.ts
git commit -m "feat: add section/question-count breakdown to the pre-start attempt preview"
```

---

### Task 4: apps/web — welcome screen: practice step + time breakdown

**Files:**
- Modify: `apps/web/lib/types.ts` (`AttemptPreview`, line ~222)
- Create: `apps/web/app/(candidate)/components/PracticeStep.tsx`
- Create: `apps/web/app/(candidate)/components/PracticeStep.test.tsx`
- Modify: `apps/web/app/(candidate)/welcome/page.tsx`
- Modify: `apps/web/app/(candidate)/welcome/page.test.tsx`

**Interfaces:**
- Consumes: `AttemptPreviewResponse.sections` (Task 3, mirrored into the frontend `AttemptPreview` type).
- Produces: nothing consumed by later tasks — this is a leaf UI task.

- [ ] **Step 1: Add `sections` to the frontend `AttemptPreview` type**

In `apps/web/lib/types.ts`, update `AttemptPreview` (line ~222):

```typescript
export interface AttemptSectionSummary {
  title: string;
  questionCount: number;
}

export interface AttemptPreview {
  exam: {
    title: string;
    instructions: string | null;
    durationMinutes: number;
    schedulingEnabled: boolean;
    availabilityWindowStart: string | null;
    availabilityWindowEnd: string | null;
  };
  schedulingWindowState: 'not_open' | 'open' | 'closed' | null;
  sections: AttemptSectionSummary[];
}
```

- [ ] **Step 2: Write `PracticeStep`'s test first**

Create `apps/web/app/(candidate)/components/PracticeStep.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PracticeStep } from './PracticeStep';

describe('PracticeStep', () => {
  it('renders the practice MCQ and code question with a Skip affordance', () => {
    render(<PracticeStep onDone={jest.fn()} />);

    expect(screen.getByText(/practice/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /skip practice/i })).toBeInTheDocument();
    expect(screen.getByText(/what is 7 \+ 5\?/i)).toBeInTheDocument();
  });

  it('calls onDone when Skip practice is clicked', async () => {
    const onDone = jest.fn();
    render(<PracticeStep onDone={onDone} />);

    await userEvent.click(screen.getByRole('button', { name: /skip practice/i }));

    expect(onDone).toHaveBeenCalled();
  });

  it('lets the candidate select an MCQ option and continue without submitting anything', async () => {
    const onDone = jest.fn();
    render(<PracticeStep onDone={onDone} />);

    await userEvent.click(screen.getByRole('button', { name: '12' }));
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(onDone).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/web && npx jest PracticeStep.test.tsx`
Expected: FAIL — cannot find module `./PracticeStep`

- [ ] **Step 4: Implement `PracticeStep`**

Create `apps/web/app/(candidate)/components/PracticeStep.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Editor from '@monaco-editor/react';
import { CandidateButton } from './CandidateButton';

const PRACTICE_MCQ_OPTIONS = ['10', '12', '14'] as const;
const PRACTICE_CODE_STARTER = 'function sum(a, b) {\n  // try it out — this isn\'t graded\n  return a + b;\n}\n';

export function PracticeStep({ onDone }: { onDone: () => void }) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-candidate-border bg-white p-6 shadow-sm">
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-candidate-primary">Practice</p>
      <h1 className="mb-3 text-xl font-bold text-candidate-text">Try the interface before you start</h1>
      <p className="mb-4 text-sm text-candidate-text-secondary">
        These two questions aren&apos;t scored or saved — they&apos;re just here so the interface feels familiar
        once the timed exam begins.
      </p>

      <div className="mb-4 rounded-md border border-candidate-border p-3">
        <p className="mb-2 text-sm font-medium text-candidate-text">What is 7 + 5?</p>
        <div className="flex gap-2">
          {PRACTICE_MCQ_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setSelectedOption(option)}
              className={
                selectedOption === option
                  ? 'rounded-lg border-[1.5px] border-candidate-primary bg-candidate-primary-light px-3 py-2 text-sm font-semibold text-candidate-primary'
                  : 'rounded-lg border border-candidate-border px-3 py-2 text-sm text-candidate-text-secondary'
              }
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 rounded-md border border-candidate-border p-3">
        <p className="mb-2 text-sm font-medium text-candidate-text">Write a one-line fix for this function (optional)</p>
        <div className="h-32 overflow-hidden rounded border border-candidate-border">
          <Editor
            height="100%"
            defaultLanguage="javascript"
            defaultValue={PRACTICE_CODE_STARTER}
            options={{ minimap: { enabled: false }, fontSize: 13 }}
          />
        </div>
        <p className="mt-1 text-xs text-candidate-text-tertiary">
          The real exam includes a Run button to test your code — practice mode is edit-only.
        </p>
      </div>

      <div className="flex justify-between">
        <CandidateButton variant="secondary" onClick={onDone}>
          Skip practice
        </CandidateButton>
        <CandidateButton onClick={onDone}>Continue</CandidateButton>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `cd apps/web && npx jest PracticeStep.test.tsx`
Expected: PASS

- [ ] **Step 6: Wire `PracticeStep` and the section breakdown into the welcome page**

In `apps/web/app/(candidate)/welcome/page.tsx`, add the import and a `step` state, defaulting to `'practice'`:

```tsx
import { PracticeStep } from '../components/PracticeStep';
```

```tsx
  const [step, setStep] = useState<'practice' | 'consent'>('practice');
```

Insert the practice-step early return right after the existing loading guard (`if (isLoading || isError || !current || isAttemptStarted(current)) { ... }`), before `handleEnableCamera`:

```tsx
  if (step === 'practice') {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-8">
        <PracticeStep onDone={() => setStep('consent')} />
      </div>
    );
  }
```

Add the section breakdown beneath the existing "Duration" line (after line ~62, before the scheduling-window conditional):

```tsx
        <p className="mb-4 text-sm text-candidate-text-secondary">Duration: {current.exam.durationMinutes} minutes</p>
        {current.sections.length > 0 ? (
          <div className="mb-4 rounded-md border border-candidate-border p-3">
            <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-candidate-text-secondary">What&apos;s in this exam</h2>
            <ul className="text-sm text-candidate-text-secondary">
              {current.sections.map((section) => (
                <li key={section.title} className="flex justify-between py-0.5">
                  <span>{section.title}</span>
                  <span>{section.questionCount} question{section.questionCount === 1 ? '' : 's'}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-candidate-text-tertiary">
              {current.sections.reduce((sum, section) => sum + section.questionCount, 0)} questions total
            </p>
          </div>
        ) : null}
```

- [ ] **Step 7: Update `welcome/page.test.tsx`'s fixtures for the new `practice` step and `sections`**

Every existing mock `data: { exam: {...}, ... }` object in `apps/web/app/(candidate)/welcome/page.test.tsx` needs a `sections: []` array (so the breakdown block doesn't render and existing assertions keep passing), **and** every test that currently expects to see the consent/camera/Start-exam UI immediately now needs to click past the practice step first. Add this helper near the top of the file (after `checkConsent`):

```typescript
async function skipPractice() {
  await userEvent.click(screen.getByRole('button', { name: /skip practice/i }));
}
```

Update the first test (`'shows exam title, duration, instructions, and a monitoring disclosure before start'`) to add `sections: []` to its mock and skip practice first:

```typescript
  it('shows exam title, duration, instructions, and a monitoring disclosure before start', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { exam: { title: 'Backend Screening', instructions: 'Answer all questions.', durationMinutes: 45 }, sections: [] },
      isLoading: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });

    render(<CandidateWelcomePage />);
    await skipPractice();

    expect(screen.getByText('Backend Screening')).toBeInTheDocument();
    expect(screen.getByText(/45 minutes/)).toBeInTheDocument();
    expect(screen.getByText('Answer all questions.')).toBeInTheDocument();
    expect(screen.getByText(/monitored/)).toBeInTheDocument();
  });
```

Apply the same two changes (`sections: []` added to every `data: { exam: {...}, ... }` mock; `await skipPractice()` inserted immediately after `render(<CandidateWelcomePage />)`) to every other test in the file **except** the three redirect-only tests that never reach the welcome UI at all (`'redirects straight to /exam...'`, `'redirects to /submitted...'`, `'redirects to /session-ended when the attempt query errors...'`, `'redirects to /session-ended when there is no access token'`) — those assert on `push` before any UI renders and don't need either change.

Add one new test asserting the breakdown renders:

```typescript
  it('shows a section/question-count breakdown when the preview includes sections', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: {
        exam: { title: 'Backend Screening', instructions: null, durationMinutes: 45 },
        sections: [{ title: 'Aptitude', questionCount: 5 }, { title: 'Coding', questionCount: 2 }],
      },
      isLoading: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });

    render(<CandidateWelcomePage />);
    await skipPractice();

    expect(screen.getByText('Aptitude')).toBeInTheDocument();
    expect(screen.getByText('5 questions')).toBeInTheDocument();
    expect(screen.getByText('Coding')).toBeInTheDocument();
    expect(screen.getByText('2 questions')).toBeInTheDocument();
    expect(screen.getByText('7 questions total')).toBeInTheDocument();
  });
```

- [ ] **Step 8: Run the full web suite for these two files**

Run: `cd apps/web && npx jest welcome/page.test.tsx PracticeStep.test.tsx`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/types.ts apps/web/app/\(candidate\)/components/PracticeStep.tsx \
  apps/web/app/\(candidate\)/components/PracticeStep.test.tsx \
  apps/web/app/\(candidate\)/welcome/page.tsx apps/web/app/\(candidate\)/welcome/page.test.tsx
git commit -m "feat: add practice step and section breakdown to the candidate welcome screen"
```

---

### Task 5: exam-runtime — candidate feedback report

**Files:**
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts` (interfaces + `getCurrent`'s post-start branch)
- Modify: `apps/exam-runtime/src/attempts/attempt.service.spec.ts`

**Interfaces:**
- Consumes: `Exam.feedbackVisibility` (Task 1).
- Produces: `AttemptStateResponse.feedback: AttemptFeedback | null`, consumed by Task 6 (submitted page).

```typescript
interface AttemptFeedback {
  status: 'pending_review' | 'settled';
  visibility: 'none' | 'pass_fail' | 'score' | 'breakdown';
  passFail: 'pass' | 'fail' | null;
  percentage: number | null;
  sections: { title: string; score: number; maxScore: number }[] | null;
}
```

`feedback` is `null` while `status === 'in_progress' | 'paused' | 'blocked'` (no result to show yet — untouched, matches the spec's error-handling note that the existing "keep taking the exam" flow needs no change). It is non-null for every terminal status. `status: 'pending_review'` (attempt status `pending_manual_grade`) always yields `passFail: null, percentage: null, sections: null` regardless of `visibility` — nothing can be shown before grading finishes, even at `none`'s baseline. Otherwise: `passFail` is populated when `visibility` is `pass_fail`/`score`/`breakdown`; `percentage` when `score`/`breakdown`; `sections` only when `breakdown`.

- [ ] **Step 1: Write the failing tests**

In `apps/exam-runtime/src/attempts/attempt.service.spec.ts`, inside `describe('getCurrent', ...)`, add:

```typescript
    it('returns feedback: null while the attempt is still in_progress', async () => {
      const attempt = {
        id: 'attempt-1', status: 'in_progress', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['q1']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 's1', title: 'Section One', targetDurationMinutes: null, questionIds: ['q1'] }]),
        optionOrderJson: null,
      };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', text: 'Q', type: 'single_mcq', marks: 5, options: [] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(100);
      mockBootstrapThenScoped(tx);

      const result = await service.getCurrent(session);

      expect(result).toMatchObject({ feedback: null });
    });

    it('returns a pending_review feedback status for an attempt awaiting manual grading, regardless of feedbackVisibility', async () => {
      const attempt = {
        id: 'attempt-1', status: 'pending_manual_grade', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['q1']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 's1', title: 'Section One', targetDurationMinutes: null, questionIds: ['q1'] }]),
        optionOrderJson: null,
      };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', text: 'Q', type: 'code', marks: 10, options: [] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
        result: { findUnique: jest.fn().mockResolvedValue({ score: 0, maxScore: 10, percentage: 0, passFail: null }) },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(0);
      mockBootstrapThenScoped(tx);

      const result = await service.getCurrent(session);

      expect(result.feedback).toEqual({ status: 'pending_review', visibility: 'breakdown', passFail: null, percentage: null, sections: null });
    });

    it('returns pass/fail only when feedbackVisibility is pass_fail', async () => {
      const attempt = {
        id: 'attempt-1', status: 'submitted', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['q1']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 's1', title: 'Section One', targetDurationMinutes: null, questionIds: ['q1'] }]),
        optionOrderJson: null,
      };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', text: 'Q', type: 'single_mcq', marks: 5, options: [] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
        result: { findUnique: jest.fn().mockResolvedValue({ score: 5, maxScore: 5, percentage: 100, passFail: 'pass' }) },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(0);
      mockBootstrapThenScoped(tx);
      const examWithVisibility = { ...invitationRecord, exam: { ...exam, feedbackVisibility: 'pass_fail' } };
      tenantPrisma.forTenant.mockReset();
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve(examWithVisibility))
        .mockImplementationOnce((_ctx, fn) => fn(tx));

      const result = await service.getCurrent(session);

      expect(result.feedback).toEqual({ status: 'settled', visibility: 'pass_fail', passFail: 'pass', percentage: null, sections: null });
    });

    it('returns no result data when feedbackVisibility is none', async () => {
      const attempt = {
        id: 'attempt-1', status: 'submitted', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['q1']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 's1', title: 'Section One', targetDurationMinutes: null, questionIds: ['q1'] }]),
        optionOrderJson: null,
      };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', text: 'Q', type: 'single_mcq', marks: 5, options: [] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
        result: { findUnique: jest.fn().mockResolvedValue({ score: 5, maxScore: 5, percentage: 100, passFail: 'pass' }) },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(0);
      const examWithVisibility = { ...invitationRecord, exam: { ...exam, feedbackVisibility: 'none' } };
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve(examWithVisibility))
        .mockImplementationOnce((_ctx, fn) => fn(tx));

      const result = await service.getCurrent(session);

      expect(result.feedback).toEqual({ status: 'settled', visibility: 'none', passFail: null, percentage: null, sections: null });
    });

    it('returns pass/fail and percentage, but no section breakdown, when feedbackVisibility is score', async () => {
      const attempt = {
        id: 'attempt-1', status: 'submitted', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['q1']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 's1', title: 'Section One', targetDurationMinutes: null, questionIds: ['q1'] }]),
        optionOrderJson: null,
      };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', text: 'Q', type: 'single_mcq', marks: 5, options: [] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
        result: { findUnique: jest.fn().mockResolvedValue({ score: 3, maxScore: 5, percentage: 60, passFail: 'fail' }) },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(0);
      const examWithVisibility = { ...invitationRecord, exam: { ...exam, feedbackVisibility: 'score' } };
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve(examWithVisibility))
        .mockImplementationOnce((_ctx, fn) => fn(tx));

      const result = await service.getCurrent(session);

      expect(result.feedback).toEqual({ status: 'settled', visibility: 'score', passFail: 'fail', percentage: 60, sections: null });
    });

    it('returns section-level scores when feedbackVisibility is breakdown', async () => {
      const attempt = {
        id: 'attempt-1', status: 'submitted', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['q1', 'q2']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 's1', title: 'Section One', targetDurationMinutes: null, questionIds: ['q1', 'q2'] }]),
        optionOrderJson: null,
      };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: {
          findMany: jest.fn()
            .mockResolvedValueOnce([
              { id: 'q1', text: 'Q1', type: 'single_mcq', marks: 5, options: [] },
              { id: 'q2', text: 'Q2', type: 'single_mcq', marks: 5, options: [] },
            ])
            .mockResolvedValueOnce([{ id: 'q1', marks: 5 }, { id: 'q2', marks: 5 }]),
        },
        answer: {
          findMany: jest.fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
              { questionId: 'q1', marksAwarded: 5 },
              { questionId: 'q2', marksAwarded: 0 },
            ]),
        },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
        result: { findUnique: jest.fn().mockResolvedValue({ score: 5, maxScore: 10, percentage: 50, passFail: 'fail' }) },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(0);
      const examWithVisibility = { ...invitationRecord, exam: { ...exam, feedbackVisibility: 'breakdown' } };
      tenantPrisma.forTenant.mockReset();
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve(examWithVisibility))
        .mockImplementationOnce((_ctx, fn) => fn(tx));

      const result = await service.getCurrent(session);

      expect(result.feedback).toEqual({
        status: 'settled', visibility: 'breakdown', passFail: 'fail', percentage: 50,
        sections: [{ title: 'Section One', score: 5, maxScore: 10 }],
      });
    });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/exam-runtime && npx jest attempt.service.spec.ts`
Expected: FAIL — `result.feedback` is `undefined` in all four new tests

- [ ] **Step 3: Implement feedback computation**

In `apps/exam-runtime/src/attempts/attempt.service.ts`, add the interface (near `AttemptStateResponse`, line ~73):

```typescript
interface AttemptSectionFeedback {
  title: string;
  score: number;
  maxScore: number;
}

interface AttemptFeedback {
  status: 'pending_review' | 'settled';
  visibility: string;
  passFail: 'pass' | 'fail' | null;
  percentage: number | null;
  sections: AttemptSectionFeedback[] | null;
}

interface AttemptStateResponse {
  status: string;
  remainingSeconds: number;
  webcamViolationCount: number;
  exam: { title: string };
  sections: AttemptSection[];
  answers: AttemptAnswerSummary[];
  messages: AttemptMessageSummary[];
  feedback: AttemptFeedback | null;
}
```

Add a private helper method (near `loadSections`):

```typescript
  private async buildFeedback(
    tx: Prisma.TransactionClient,
    exam: { feedbackVisibility: string },
    attempt: { id: string; status: string; sectionSnapshotJson: string },
  ): Promise<AttemptFeedback | null> {
    if (attempt.status === 'in_progress' || attempt.status === 'paused' || attempt.status === 'blocked') {
      return null;
    }
    if (attempt.status === 'pending_manual_grade') {
      return { status: 'pending_review', visibility: exam.feedbackVisibility, passFail: null, percentage: null, sections: null };
    }

    const result = await tx.result.findUnique({ where: { attemptId: attempt.id } });
    const visibility = exam.feedbackVisibility;
    const passFail = visibility === 'pass_fail' || visibility === 'score' || visibility === 'breakdown' ? (result?.passFail ?? null) : null;
    const percentage = visibility === 'score' || visibility === 'breakdown' ? (result?.percentage ?? null) : null;

    let sections: AttemptSectionFeedback[] | null = null;
    if (visibility === 'breakdown') {
      const snapshot: SectionSnapshotEntry[] = JSON.parse(attempt.sectionSnapshotJson);
      const allQuestionIds = snapshot.flatMap((section) => section.questionIds);
      const [questions, answers] = await Promise.all([
        tx.question.findMany({ where: { id: { in: allQuestionIds } }, select: { id: true, marks: true } }),
        tx.answer.findMany({ where: { attemptId: attempt.id }, select: { questionId: true, marksAwarded: true } }),
      ]);
      const marksByQuestion = new Map(questions.map((question) => [question.id, question.marks]));
      const awardedByQuestion = new Map(answers.map((answer) => [answer.questionId, answer.marksAwarded ?? 0]));
      sections = snapshot.map((section) => ({
        title: section.title,
        score: section.questionIds.reduce((sum, id) => sum + (awardedByQuestion.get(id) ?? 0), 0),
        maxScore: section.questionIds.reduce((sum, id) => sum + (marksByQuestion.get(id) ?? 0), 0),
      }));
    }

    return { status: 'settled', visibility, passFail, percentage, sections };
  }
```

Wire it into `getCurrent()`'s post-start branch — add `feedback` to the returned object (after `settled` is computed, before the `return`):

```typescript
      const settled = await this.attemptSettlement.settleIfExpired(tx, exam, attempt);
      const sections = await this.loadSections(tx, settled.sectionSnapshotJson, settled.optionOrderJson);
      const answers = await tx.answer.findMany({ where: { attemptId: settled.id } });
      const feedback = await this.buildFeedback(tx, exam, settled);
```

And add `feedback,` to the returned object's field list (after `messages: ...`).

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/exam-runtime && npx jest attempt.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Run the full exam-runtime suite**

Run: `cd apps/exam-runtime && npx jest --testPathIgnorePatterns=test/`
Expected: PASS, no regressions

- [ ] **Step 6: Commit**

```bash
git add apps/exam-runtime/src/attempts/attempt.service.ts apps/exam-runtime/src/attempts/attempt.service.spec.ts
git commit -m "feat: compute candidate feedback filtered by exam.feedbackVisibility"
```

---

### Task 6: apps/web — dynamic submitted page

**Files:**
- Modify: `apps/web/lib/types.ts` (`AttemptState`, line ~234)
- Create: `apps/web/app/(candidate)/components/ResultSummary.tsx`
- Create: `apps/web/app/(candidate)/components/ResultSummary.test.tsx`
- Modify: `apps/web/app/(candidate)/submitted/page.tsx`
- Create: `apps/web/app/(candidate)/submitted/page.test.tsx`

**Interfaces:**
- Consumes: `AttemptState.feedback` (Task 5, mirrored into the frontend `AttemptState` type).

- [ ] **Step 1: Add `feedback` to the frontend `AttemptState` type**

In `apps/web/lib/types.ts`, update `AttemptState` (line ~234):

```typescript
export interface AttemptSectionFeedback {
  title: string;
  score: number;
  maxScore: number;
}

export interface AttemptFeedback {
  status: 'pending_review' | 'settled';
  visibility: 'none' | 'pass_fail' | 'score' | 'breakdown';
  passFail: 'pass' | 'fail' | null;
  percentage: number | null;
  sections: AttemptSectionFeedback[] | null;
}

export interface AttemptState {
  status: string;
  remainingSeconds: number;
  webcamViolationCount: number;
  exam: { title: string };
  sections: AttemptSection[];
  answers: AttemptAnswerSummary[];
  messages: AttemptMessageSummary[];
  feedback: AttemptFeedback | null;
}
```

- [ ] **Step 2: Write `ResultSummary`'s test first**

Create `apps/web/app/(candidate)/components/ResultSummary.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { ResultSummary } from './ResultSummary';

describe('ResultSummary', () => {
  it('renders nothing extra for visibility "none"', () => {
    render(<ResultSummary feedback={{ status: 'settled', visibility: 'none', passFail: null, percentage: null, sections: null }} />);
    expect(screen.queryByText(/pass|fail|%/i)).not.toBeInTheDocument();
  });

  it('shows a still-being-reviewed message when status is pending_review, regardless of visibility', () => {
    render(<ResultSummary feedback={{ status: 'pending_review', visibility: 'breakdown', passFail: null, percentage: null, sections: null }} />);
    expect(screen.getByText(/still being reviewed/i)).toBeInTheDocument();
  });

  it('shows pass/fail for visibility "pass_fail"', () => {
    render(<ResultSummary feedback={{ status: 'settled', visibility: 'pass_fail', passFail: 'pass', percentage: null, sections: null }} />);
    expect(screen.getByText(/pass/i)).toBeInTheDocument();
  });

  it('shows the percentage for visibility "score"', () => {
    render(<ResultSummary feedback={{ status: 'settled', visibility: 'score', passFail: 'fail', percentage: 62.5, sections: null }} />);
    expect(screen.getByText('62.5%')).toBeInTheDocument();
  });

  it('shows a per-section breakdown for visibility "breakdown"', () => {
    render(
      <ResultSummary
        feedback={{
          status: 'settled', visibility: 'breakdown', passFail: 'pass', percentage: 80,
          sections: [{ title: 'Section One', score: 8, maxScore: 10 }],
        }}
      />,
    );
    expect(screen.getByText('Section One')).toBeInTheDocument();
    expect(screen.getByText('8/10')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/web && npx jest ResultSummary.test.tsx`
Expected: FAIL — cannot find module `./ResultSummary`

- [ ] **Step 4: Implement `ResultSummary`**

Create `apps/web/app/(candidate)/components/ResultSummary.tsx`:

```tsx
import { AttemptFeedback } from '../../../lib/types';

export function ResultSummary({ feedback }: { feedback: AttemptFeedback }) {
  if (feedback.status === 'pending_review') {
    return <p className="mt-3 text-sm text-candidate-text-secondary">Your code answers are still being reviewed.</p>;
  }
  if (feedback.visibility === 'none') {
    return null;
  }
  return (
    <div className="mt-3 flex flex-col gap-2 text-sm text-candidate-text-secondary">
      {feedback.passFail ? (
        <p className="font-semibold text-candidate-text">{feedback.passFail === 'pass' ? 'Pass' : 'Fail'}</p>
      ) : null}
      {feedback.percentage !== null ? <p>{feedback.percentage}%</p> : null}
      {feedback.sections ? (
        <ul className="mt-1 flex flex-col gap-1">
          {feedback.sections.map((section) => (
            <li key={section.title} className="flex justify-between">
              <span>{section.title}</span>
              <span>{section.score}/{section.maxScore}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `cd apps/web && npx jest ResultSummary.test.tsx`
Expected: PASS

- [ ] **Step 6: Write `submitted/page.tsx`'s test first**

Create `apps/web/app/(candidate)/submitted/page.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { useAttemptQuery } from '../../../lib/hooks/useAttempt';
import CandidateSubmittedPage from './page';

jest.mock('../../../lib/hooks/useAttempt', () => ({ useAttemptQuery: jest.fn() }));

describe('CandidateSubmittedPage', () => {
  it('shows the static submitted message with no extra data when feedback is null (still in progress / loading)', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: undefined, isLoading: true });

    render(<CandidateSubmittedPage />);

    expect(screen.getByText('Exam submitted')).toBeInTheDocument();
  });

  it('renders the result summary once feedback is present', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: {
        status: 'submitted', remainingSeconds: 0, sections: [], answers: [], messages: [],
        feedback: { status: 'settled', visibility: 'pass_fail', passFail: 'pass', percentage: null, sections: null },
      },
      isLoading: false,
    });

    render(<CandidateSubmittedPage />);

    expect(screen.getByText('Exam submitted')).toBeInTheDocument();
    expect(screen.getByText('Pass')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `cd apps/web && npx jest submitted/page.test.tsx`
Expected: FAIL — `useAttemptQuery` mock is set up but the real component never calls it (current implementation is static)

- [ ] **Step 8: Make the submitted page dynamic**

Replace `apps/web/app/(candidate)/submitted/page.tsx`:

```tsx
'use client';

import { TerminalCard } from '../components/TerminalCard';
import { ResultSummary } from '../components/ResultSummary';
import { useAttemptQuery } from '../../../lib/hooks/useAttempt';
import { isAttemptStarted } from '../../../lib/types';

export default function CandidateSubmittedPage() {
  const { data: current } = useAttemptQuery();
  const feedback = current && isAttemptStarted(current) ? current.feedback : null;

  return (
    <div>
      <TerminalCard
        tone="success"
        title="Exam submitted"
        body="Your exam has been submitted. Results will be reviewed by the recruiter."
      />
      {feedback ? (
        <div className="mx-auto -mt-3 w-full max-w-sm px-6">
          <ResultSummary feedback={feedback} />
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 9: Run it to verify it passes**

Run: `cd apps/web && npx jest submitted/page.test.tsx`
Expected: PASS

- [ ] **Step 10: Run the full web suite**

Run: `cd apps/web && npx jest`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add apps/web/lib/types.ts apps/web/app/\(candidate\)/components/ResultSummary.tsx \
  apps/web/app/\(candidate\)/components/ResultSummary.test.tsx \
  apps/web/app/\(candidate\)/submitted/page.tsx apps/web/app/\(candidate\)/submitted/page.test.tsx
git commit -m "feat: render candidate feedback report on the submitted page"
```

---

### Task 7: Exam builder — `feedbackVisibility` control

**Files:**
- Modify: `apps/api/src/exams/dto/create-exam.dto.ts`
- Modify: `apps/api/src/exams/exams.service.ts` (`create`, `update`, `duplicate`)
- Modify: `apps/api/src/exams/exams.service.spec.ts`
- Modify: `apps/web/lib/types.ts` (`Exam`, line ~92)
- Modify: `apps/web/components/ExamDetailsForm.tsx`
- Modify: `apps/web/components/ExamDetailsForm.test.tsx`

**Interfaces:**
- Consumes: `Exam.feedbackVisibility` (Task 1).
- Produces: nothing consumed by later tasks — this is a leaf task.

- [ ] **Step 1: Write the failing backend tests**

`apps/api/src/exams/exams.service.spec.ts` has three existing tests that assert the **exact, full** `data` object literal passed to `tx.exam.create`/`tx.exam.update` (not `expect.objectContaining`) — adding a new field to the service's `create()`/`duplicate()` data-building will break these unless they're updated in the same step, since `create()` assigns `feedbackVisibility` unconditionally (mirroring the existing `randomizeOrder: dto.randomizeOrder` line, which is why `randomizeOrder: undefined` already appears explicitly in these literals today).

Update the test `'passes durationMinutes and passCriteriaPercent through to the created exam when provided'` (line ~39) — add `feedbackVisibility: undefined,` to the expected `data` object, right after `randomizeOrder: undefined,`.

Update the test `'lets the database default apply to durationMinutes/passCriteriaPercent when omitted'` (line ~61) — same addition.

Update the test `'creates a scheduled exam with schedulingEnabled true and a valid window'` (line ~83) and `'creates a non-scheduled exam with null window fields when schedulingEnabled is omitted'` (line ~132) — **no change needed**, both already assert via `data: expect.objectContaining({...})`, a partial match unaffected by new fields.

Update the `describe('duplicate', ...)` test `"duplicates an exam's own settings, resetting status and scheduling regardless of source"` (line ~786): add `feedbackVisibility: 'score',` to the mocked source exam (in `tx.exam.findFirst`'s resolved value, after `randomizeOrder: true,`) and add `feedbackVisibility: 'score',` to the expected `tx.exam.create` call's `data` object (after `randomizeOrder: true,`) — the clone must carry the source exam's feedback setting forward.

The `describe('update', ...)` test `"updates an exam's title and instructions"` (line ~215) needs **no change** — `update()` uses the established conditional-spread pattern (`...(dto.feedbackVisibility !== undefined ? {...} : {})`), and since that test's `dto` never sets `feedbackVisibility`, the key stays absent from the expected `data` object, exactly like `durationMinutes`/`passCriteriaPercent`/`randomizeOrder` already do in that same literal today.

Then add new tests covering the field itself, alongside the existing `create`/`update` tests:

```typescript
  it('persists feedbackVisibility on create when provided', async () => {
    const tx = { exam: { create: jest.fn().mockResolvedValue({ id: 'exam-1' }) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.create(context, 'user-1', { title: 'Exam', feedbackVisibility: 'score' });

    expect(tx.exam.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ feedbackVisibility: 'score' }) }),
    );
  });

  it('updates feedbackVisibility when provided', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', schedulingEnabled: false, availabilityWindowStart: null, availabilityWindowEnd: null }),
        update: jest.fn().mockResolvedValue({ id: 'exam-1', feedbackVisibility: 'breakdown', schedulingEnabled: false }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.update(context, 'exam-1', { feedbackVisibility: 'breakdown' });

    expect(tx.exam.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ feedbackVisibility: 'breakdown' }) }),
    );
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest exams.service.spec.ts`
Expected: FAIL — `feedbackVisibility` not passed through by `create`/`update`/`duplicate`; the three updated exact-literal tests fail on the missing field until Step 4 lands

- [ ] **Step 3: Add `feedbackVisibility` to the DTO**

In `apps/api/src/exams/dto/create-exam.dto.ts`, add the import and field:

```typescript
import { IsBoolean, IsIn, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

const FEEDBACK_VISIBILITY_VALUES = ['none', 'pass_fail', 'score', 'breakdown'] as const;
```

```typescript
  @IsOptional()
  @IsIn(FEEDBACK_VISIBILITY_VALUES)
  feedbackVisibility?: string;
```

(insert after the existing `randomizeOrder` field).

- [ ] **Step 4: Wire it into `ExamsService.create`, `update`, and `duplicate`**

In `apps/api/src/exams/exams.service.ts`, `create()` (line ~101-114): add `feedbackVisibility: dto.feedbackVisibility,` to the `data` object, right after `randomizeOrder: dto.randomizeOrder,`.

`update()` (line ~190-201): add the conditional-spread, following the existing pattern:

```typescript
          ...(dto.randomizeOrder !== undefined ? { randomizeOrder: dto.randomizeOrder } : {}),
          ...(dto.feedbackVisibility !== undefined ? { feedbackVisibility: dto.feedbackVisibility } : {}),
```

`duplicate()` (line ~293-306): add `feedbackVisibility: exam.feedbackVisibility,` after `randomizeOrder: exam.randomizeOrder,` — a cloned exam should keep the source exam's feedback setting.

- [ ] **Step 5: Run it to verify it passes**

Run: `cd apps/api && npx jest exams.service.spec.ts`
Expected: PASS

- [ ] **Step 6: Add `feedbackVisibility` to the frontend `Exam` type**

In `apps/web/lib/types.ts`, update `Exam` (line ~92):

```typescript
export type FeedbackVisibility = 'none' | 'pass_fail' | 'score' | 'breakdown';

export interface Exam {
  id: string;
  title: string;
  instructions: string | null;
  status: ExamStatus;
  durationMinutes: number;
  passCriteriaPercent: number;
  randomizeOrder: boolean;
  feedbackVisibility: FeedbackVisibility;
  schedulingEnabled: boolean;
  availabilityWindowStart: string | null;
  availabilityWindowEnd: string | null;
  createdAt: string;
  sections: ExamSection[];
}
```

- [ ] **Step 7: Write the failing frontend test**

In `apps/web/components/ExamDetailsForm.test.tsx`, add:

```typescript
  it('includes feedbackVisibility in the submitted value, defaulting to pass_fail for a new exam', async () => {
    const onSubmit = jest.fn();
    render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Save details" />);

    await userEvent.type(screen.getByLabelText('Title'), 'New Exam');
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ feedbackVisibility: 'pass_fail' }));
  });

  it('lets the recruiter change the candidate feedback level', async () => {
    const onSubmit = jest.fn();
    render(
      <ExamDetailsForm
        initialExam={{ title: 'Exam', durationMinutes: 60, passCriteriaPercent: 40, randomizeOrder: false, feedbackVisibility: 'pass_fail', schedulingEnabled: false } as any}
        onSubmit={onSubmit}
        submitLabel="Save details"
      />,
    );

    await userEvent.click(screen.getByRole('combobox', { name: /candidate feedback/i }));
    await userEvent.click(screen.getByRole('option', { name: /score/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ feedbackVisibility: 'score' }));
  });
```

(Check the top of `ExamDetailsForm.test.tsx` for its existing render/import conventions — e.g. whether `userEvent` is already imported — before pasting.)

- [ ] **Step 8: Run it to verify it fails**

Run: `cd apps/web && npx jest ExamDetailsForm.test.tsx`
Expected: FAIL — no "candidate feedback" combobox exists yet, `onSubmit` isn't called with `feedbackVisibility`

- [ ] **Step 9: Add the select to `ExamDetailsForm`**

In `apps/web/components/ExamDetailsForm.tsx`, update the imports:

```typescript
import { Button, Input, Select } from '../components/ui';
import { Exam, FeedbackVisibility } from '../lib/types';
```

Update `ExamDetailsValue`:

```typescript
export interface ExamDetailsValue {
  title: string;
  instructions?: string;
  durationMinutes: number;
  passCriteriaPercent: number;
  randomizeOrder: boolean;
  feedbackVisibility: FeedbackVisibility;
  schedulingEnabled: boolean;
  availabilityWindowStart?: string;
  availabilityWindowEnd?: string;
}
```

Add state (after `randomizeOrder`'s `useState`):

```typescript
  const [feedbackVisibility, setFeedbackVisibility] = useState<FeedbackVisibility>(initialExam?.feedbackVisibility ?? 'pass_fail');
```

Add `feedbackVisibility,` to the object passed to `onSubmit(...)` in `handleSubmit`.

Add the select to the JSX, after the "Randomize question order" checkbox label:

```tsx
      <Select
        label="Candidate feedback"
        value={feedbackVisibility}
        onChange={(value) => setFeedbackVisibility(value as FeedbackVisibility)}
        options={[
          { value: 'none', label: 'None — candidates just see "submitted"' },
          { value: 'pass_fail', label: 'Pass/fail only' },
          { value: 'score', label: 'Score percentage' },
          { value: 'breakdown', label: 'Per-section breakdown' },
        ]}
      />
```

- [ ] **Step 10: Run it to verify it passes**

Run: `cd apps/web && npx jest ExamDetailsForm.test.tsx`
Expected: PASS

- [ ] **Step 11: Run the full test suites for both apps and `tsc --noEmit`**

Run: `cd apps/api && npx jest exams.service.spec.ts && cd ../web && npx jest && npx tsc --noEmit`
Expected: PASS; `tsc` shows only the pre-existing baseline error count (check against the count noted in Task 9's final verification — do not let it grow)

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/exams/dto/create-exam.dto.ts apps/api/src/exams/exams.service.ts apps/api/src/exams/exams.service.spec.ts \
  apps/web/lib/types.ts apps/web/components/ExamDetailsForm.tsx apps/web/components/ExamDetailsForm.test.tsx
git commit -m "feat: add per-exam candidate feedback visibility control to the exam builder"
```

---

### Task 8: Accommodations — recruiter UI

**Files:**
- Create: `apps/api/src/invitations/dto/update-accommodation.dto.ts`
- Modify: `apps/api/src/invitations/invitations.controller.ts`
- Modify: `apps/api/src/invitations/invitations.service.ts` (`list`, new `updateAccommodation`)
- Modify: `apps/api/src/invitations/invitations.service.spec.ts`
- Modify: `apps/web/lib/types.ts` (`Invitation`, line ~123)
- Modify: `apps/web/lib/hooks/useInvitations.ts`
- Create: `apps/web/components/CandidatesPanel.tsx`
- Create: `apps/web/components/CandidatesPanel.test.tsx`
- Modify: `apps/web/app/(recruiter)/exams/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `Invitation.extraTimePercent` (Task 1).
- Produces: nothing consumed by later tasks — this is a leaf task.

There is no existing recruiter-facing invitation-list UI to extend (`GET exams/:examId/invitations` and the `resend`/`revoke` endpoints already exist in `invitations.controller.ts` but nothing in `apps/web` calls them) — this task adds the first one, scoped to exactly what's needed for accommodations (no resend/revoke UI; out of scope for this feature).

- [ ] **Step 1: Write the failing backend test for the list extension**

In `apps/api/src/invitations/invitations.service.spec.ts`, this file declares a fresh, locally-scoped `tx` object inside each `it(...)` (there is no shared top-level `tx` fixture — only shared `service`/`context`, per the `beforeEach` at the top of the file). Replace the existing `it('lists invitations for an exam', ...)` test (line ~219) with:

```typescript
  it('lists invitations for an exam, including extraTimePercent and whether an attempt exists', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      invitation: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited', extraTimePercent: 50, attempt: { id: 'attempt-1' }, candidate: { id: 'cand-1' } },
          { id: 'inv-2', examId: 'exam-1', candidateId: 'cand-2', status: 'invited', extraTimePercent: 0, attempt: null, candidate: { id: 'cand-2' } },
        ]),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.list(context, 'exam-1');

    expect(result).toHaveLength(2);
    expect(tx.invitation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ candidate: true, extraTimePercent: true, attempt: { select: { id: true } } }),
      }),
    );
    const selectArg = tx.invitation.findMany.mock.calls[0][0].select;
    expect(selectArg).not.toHaveProperty('token');
    expect(result[0]).toMatchObject({ extraTimePercent: 50, attempt: { id: 'attempt-1' } });
    expect(result[1]).toMatchObject({ extraTimePercent: 0, attempt: null });
  });
```

Add a new `describe('updateAccommodation', ...)` block after the `describe`/tests for `resend`/`revoke`:

```typescript
  describe('updateAccommodation', () => {
    it('updates extraTimePercent when the invitation has no attempt yet', async () => {
      const tx = {
        invitation: {
          findFirst: jest.fn().mockResolvedValue({ id: 'inv-1', exam: { organizationId: 'org-1' }, attempt: null }),
          update: jest.fn().mockResolvedValue({ id: 'inv-1', extraTimePercent: 50 }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.updateAccommodation(context, 'inv-1', 50);

      expect(tx.invitation.update).toHaveBeenCalledWith({ where: { id: 'inv-1' }, data: { extraTimePercent: 50 } });
      expect(result.extraTimePercent).toBe(50);
    });

    it('throws BadRequestException when the invitation already has an attempt', async () => {
      const tx = {
        invitation: {
          findFirst: jest.fn().mockResolvedValue({ id: 'inv-1', exam: { organizationId: 'org-1' }, attempt: { id: 'attempt-1' } }),
          update: jest.fn(),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.updateAccommodation(context, 'inv-1', 50)).rejects.toThrow(BadRequestException);
      expect(tx.invitation.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the invitation does not exist in this organization', async () => {
      const tx = { invitation: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.updateAccommodation(context, 'missing', 50)).rejects.toThrow(NotFoundException);
    });
  });
```

(`BadRequestException`/`NotFoundException` are already imported from `@nestjs/common` at the top of this file.)

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest invitations.service.spec.ts`
Expected: FAIL — `service.updateAccommodation is not a function`; the `list` test's new assertions fail (fields not selected)

- [ ] **Step 3: Create the accommodation DTO**

Create `apps/api/src/invitations/dto/update-accommodation.dto.ts`:

```typescript
import { IsInt, Max, Min } from 'class-validator';

export class UpdateAccommodationDto {
  @IsInt()
  @Min(0)
  @Max(300)
  extraTimePercent!: number;
}
```

- [ ] **Step 4: Extend `list()` and add `updateAccommodation()`**

In `apps/api/src/invitations/invitations.service.ts`, update the `list()` method's `select` (line ~214-236) to add `extraTimePercent: true` and `attempt: { select: { id: true } }`:

```typescript
  async list(context: TenantContext, examId: string): Promise<(Omit<Invitation, 'token'> & { candidate: Candidate; attempt: { id: string } | null })[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }
      return tx.invitation.findMany({
        where: { examId },
        select: {
          id: true,
          examId: true,
          candidateId: true,
          status: true,
          extraTimePercent: true,
          invitedAt: true,
          expiresAt: true,
          revokedAt: true,
          activeSessionFamilyId: true,
          candidate: true,
          attempt: { select: { id: true } },
        },
        orderBy: [{ invitedAt: 'desc' }, { id: 'desc' }],
      });
    });
  }
```

Add `updateAccommodation()` after `resend()` (following the same `findFirst` + org-scoping pattern used there):

```typescript
  async updateAccommodation(context: TenantContext, invitationId: string, extraTimePercent: number): Promise<Invitation> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.invitation.findFirst({
        where: { id: invitationId, exam: { organizationId: context.organizationId as string } },
        include: { attempt: true },
      });
      if (!existing) {
        throw new NotFoundException(`Invitation ${invitationId} not found`);
      }
      if (existing.attempt) {
        throw new BadRequestException(`Invitation ${invitationId} already has an attempt — extra time can no longer be changed`);
      }
      return tx.invitation.update({ where: { id: invitationId }, data: { extraTimePercent } });
    });
  }
```

- [ ] **Step 5: Add the controller endpoint**

In `apps/api/src/invitations/invitations.controller.ts`, add the import:

```typescript
import { UpdateAccommodationDto } from './dto/update-accommodation.dto';
```

Add the route after `resend`:

```typescript
  @Post('invitations/:id/accommodation')
  @RequirePermissions('candidate:manage')
  updateAccommodation(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateAccommodationDto) {
    return this.invitationsService.updateAccommodation(tenant, id, dto.extraTimePercent);
  }
```

- [ ] **Step 6: Run it to verify it passes**

Run: `cd apps/api && npx jest invitations.service.spec.ts`
Expected: PASS

- [ ] **Step 7: Add `extraTimePercent` and `attempt` to the frontend `Invitation` type**

In `apps/web/lib/types.ts`, update `Invitation` (line ~123):

```typescript
export interface Invitation {
  id: string;
  examId: string;
  candidateId: string;
  status: InvitationStatus;
  extraTimePercent: number;
  attempt: { id: string } | null;
  invitedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  candidate: Candidate;
}
```

- [ ] **Step 8: Add the list-query and update-mutation hooks**

In `apps/web/lib/hooks/useInvitations.ts`, add `useQuery` to the import and add two new hooks at the end of the file:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
```

```typescript
export function useExamInvitations(examId: string) {
  const { accessToken } = useAuth();
  return useQuery<Invitation[]>({
    queryKey: ['invitations', examId],
    queryFn: () => apiFetch(`/exams/${examId}/invitations`, {}, accessToken ?? undefined),
    enabled: Boolean(examId),
  });
}

export function useUpdateAccommodation(examId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ invitationId, extraTimePercent }: { invitationId: string; extraTimePercent: number }): Promise<Invitation> =>
      apiFetch(`/invitations/${invitationId}/accommodation`, { method: 'POST', body: JSON.stringify({ extraTimePercent }) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invitations', examId] }),
  });
}
```

- [ ] **Step 9: Write `CandidatesPanel`'s test first**

Create `apps/web/components/CandidatesPanel.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useExamInvitations, useUpdateAccommodation } from '../lib/hooks/useInvitations';
import { CandidatesPanel } from './CandidatesPanel';

jest.mock('../lib/hooks/useInvitations', () => ({ useExamInvitations: jest.fn(), useUpdateAccommodation: jest.fn() }));

describe('CandidatesPanel', () => {
  it('shows an editable extra-time control for a candidate who has not started', async () => {
    const mutate = jest.fn();
    (useExamInvitations as jest.Mock).mockReturnValue({
      data: [{ id: 'inv-1', extraTimePercent: 0, attempt: null, candidate: { id: 'cand-1', name: 'Alice', email: 'alice@example.com' } }],
      isLoading: false,
    });
    (useUpdateAccommodation as jest.Mock).mockReturnValue({ mutate, isPending: false });

    render(<CandidatesPanel examId="exam-1" />);

    const input = screen.getByRole('spinbutton', { name: /extra time.*alice/i });
    await userEvent.clear(input);
    await userEvent.type(input, '50');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(mutate).toHaveBeenCalledWith({ invitationId: 'inv-1', extraTimePercent: 50 });
  });

  it('shows the extra time as read-only once an attempt exists', () => {
    (useExamInvitations as jest.Mock).mockReturnValue({
      data: [{ id: 'inv-1', extraTimePercent: 50, attempt: { id: 'attempt-1' }, candidate: { id: 'cand-1', name: 'Bob', email: 'bob@example.com' } }],
      isLoading: false,
    });
    (useUpdateAccommodation as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });

    render(<CandidatesPanel examId="exam-1" />);

    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: /extra time.*bob/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 10: Run it to verify it fails**

Run: `cd apps/web && npx jest CandidatesPanel.test.tsx`
Expected: FAIL — cannot find module `./CandidatesPanel`

- [ ] **Step 11: Implement `CandidatesPanel`**

Create `apps/web/components/CandidatesPanel.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Table, type Column } from './ui';
import { useExamInvitations, useUpdateAccommodation } from '../lib/hooks/useInvitations';
import { Invitation } from '../lib/types';

function AccommodationCell({ invitation, onSave, isPending }: { invitation: Invitation; onSave: (value: number) => void; isPending: boolean }) {
  const [value, setValue] = useState(String(invitation.extraTimePercent));

  if (invitation.attempt) {
    return <span>{invitation.extraTimePercent}%</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        max={300}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={`Extra time (%) for ${invitation.candidate.name}`}
        className="w-16 rounded border border-recruiter-border px-2 py-1 text-sm"
      />
      <button
        type="button"
        disabled={isPending}
        onClick={() => onSave(Number(value))}
        className="rounded border border-recruiter-border px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        Save
      </button>
    </div>
  );
}

export function CandidatesPanel({ examId }: { examId: string }) {
  const { data: invitations, isLoading } = useExamInvitations(examId);
  const updateAccommodation = useUpdateAccommodation(examId);

  const columns: Column<Invitation>[] = [
    { key: 'name', header: 'Candidate', render: (row) => row.candidate.name },
    { key: 'email', header: 'Email', render: (row) => row.candidate.email },
    { key: 'status', header: 'Status', render: (row) => row.status },
    {
      key: 'extraTime',
      header: 'Extra time',
      render: (row) => (
        <AccommodationCell
          invitation={row}
          isPending={updateAccommodation.isPending}
          onSave={(extraTimePercent) => updateAccommodation.mutate({ invitationId: row.id, extraTimePercent })}
        />
      ),
    },
  ];

  if (isLoading) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  return <Table columns={columns} rows={invitations ?? []} rowKey={(row) => row.id} emptyMessage="No candidates invited yet." />;
}
```

- [ ] **Step 12: Run it to verify it passes**

Run: `cd apps/web && npx jest CandidatesPanel.test.tsx`
Expected: PASS

- [ ] **Step 13: Add the Candidates tab to the exam edit page**

In `apps/web/app/(recruiter)/exams/[id]/edit/page.tsx`, add the import:

```tsx
import { CandidatesPanel } from '../../../../../components/CandidatesPanel';
```

Add a new `TabsTrigger` after `"Sections & Questions"`:

```tsx
          <TabsTrigger value="candidates">Candidates</TabsTrigger>
```

Add the matching `TabsContent` after the `"sections"` content block:

```tsx
        <TabsContent value="candidates">
          <CandidatesPanel examId={exam.id} />
        </TabsContent>
```

- [ ] **Step 14: Run the full web suite**

Run: `cd apps/web && npx jest`
Expected: PASS

- [ ] **Step 15: Commit**

```bash
git add apps/api/src/invitations/dto/update-accommodation.dto.ts apps/api/src/invitations/invitations.controller.ts \
  apps/api/src/invitations/invitations.service.ts apps/api/src/invitations/invitations.service.spec.ts \
  apps/web/lib/types.ts apps/web/lib/hooks/useInvitations.ts apps/web/components/CandidatesPanel.tsx \
  apps/web/components/CandidatesPanel.test.tsx apps/web/app/\(recruiter\)/exams/\[id\]/edit/page.tsx
git commit -m "feat: recruiter-facing extra-time accommodation control on the exam Candidates tab"
```

---

### Task 9: E2E coverage + final verification

**Files:**
- Modify: `apps/web/e2e/candidate-golden-path.spec.ts`
- Create: `apps/web/e2e/candidate-ux-pack.spec.ts`

**Interfaces:**
- Consumes: every prior task in this plan (full-stack, browser-driven).

- [ ] **Step 1: Update the existing candidate golden path for the new practice step**

In `apps/web/e2e/candidate-golden-path.spec.ts`, both tests navigate to `/welcome` and then immediately click `'Enable camera'` — the welcome page now opens on the practice step first. In **both** tests, insert a skip-practice click right after `await expect(page).toHaveURL(/\/welcome$/);` and before `await expect(page.getByText(examTitle)).toBeVisible();` / `await page.getByRole('button', { name: 'Enable camera' }).click();`:

```typescript
  await page.getByRole('button', { name: /skip practice/i }).click();
```

- [ ] **Step 2: Write a new e2e spec covering breakdown feedback and the accommodation**

Create `apps/web/e2e/candidate-ux-pack.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

const ORG_SLUG = process.env.E2E_ORG_SLUG ?? 'demo-org';
const RECRUITER_EMAIL = process.env.E2E_RECRUITER_EMAIL ?? 'recruiter@demo-org.test';
const RECRUITER_PASSWORD = process.env.E2E_RECRUITER_PASSWORD ?? 'Passw0rd!2026';

async function mockCameraAndDisableWebcamMonitor(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => undefined }] }) },
      configurable: true,
    });
    (window as unknown as { __DISABLE_WEBCAM_MONITOR__?: boolean }).__DISABLE_WEBCAM_MONITOR__ = true;
  });
}

test('a candidate with a +50% accommodation gets more remaining time than the exam duration, and sees a section breakdown after submitting', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Organization slug').fill(ORG_SLUG);
  await page.getByLabel('Email').fill(RECRUITER_EMAIL);
  await page.getByLabel('Password').fill(RECRUITER_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('link', { name: 'Question Bank' }).click();
  await page.getByRole('link', { name: 'New question' }).click();
  await page.getByLabel('Question text').fill('UX pack e2e question?');
  await page.getByLabel('Marks', { exact: true }).fill('10');
  const optionInputs = page.getByLabel(/Option \d text/);
  await optionInputs.nth(0).fill('Correct');
  await optionInputs.nth(1).fill('Wrong');
  await page.getByRole('radio', { name: 'Option 1 correct' }).click();
  await page.getByRole('button', { name: 'Create question' }).click();
  await expect(page).toHaveURL(/\/questions$/);

  await page.getByRole('link', { name: 'Exams' }).click();
  await page.getByRole('link', { name: 'New exam' }).click();
  const examTitle = `UX Pack Exam ${Date.now()}`;
  await page.getByLabel('Title').fill(examTitle);
  await page.getByRole('button', { name: 'Create exam' }).click();
  await expect(page).toHaveURL(/\/exams\/.+\/edit$/);

  await page.getByRole('combobox', { name: /candidate feedback/i }).click();
  await page.getByRole('option', { name: /per-section breakdown/i }).click();
  await page.getByRole('button', { name: 'Save details' }).click();

  await page.getByRole('tab', { name: 'Sections & Questions' }).click();
  await page.getByLabel('New section title').fill('Section One');
  await page.getByRole('button', { name: 'Add section' }).click();
  await page.getByRole('button', { name: 'Manage questions' }).click();
  await page.getByRole('checkbox', { name: /UX pack e2e question\?/ }).first().click();
  await page.getByRole('button', { name: 'Save questions' }).click();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page).toHaveURL(/\/exams$/);

  await page.goto(`/exams`);
  await page.getByRole('link', { name: examTitle }).click();
  await page.getByRole('link', { name: 'Candidates' }).click();
  const candidateEmail = `ux-pack-${Date.now()}@example.com`;
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('UX Pack Person');
  await page.getByLabel('Email').fill(candidateEmail);
  await page.getByRole('button', { name: 'Add candidate' }).click();
  await expect(page.getByText(candidateEmail)).toBeVisible();

  await page.getByLabel('Exam to invite to').click();
  await page.getByRole('option', { name: examTitle, exact: true }).click();
  await page.getByRole('row', { name: candidateEmail }).getByRole('checkbox', { name: 'UX Pack Person' }).click();
  const [inviteResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/invitations') && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Send invitations' }).click(),
  ]);
  const inviteBody = await inviteResponse.json();
  const token: string = inviteBody.created[0].token;

  await page.getByRole('link', { name: examTitle }).click();
  await page.getByRole('tab', { name: 'Candidates' }).click();
  await page.getByRole('spinbutton', { name: /extra time.*ux pack person/i }).fill('50');
  await page.getByRole('button', { name: /save/i }).click();
  await expect(page.getByRole('spinbutton', { name: /extra time.*ux pack person/i })).toHaveValue('50');

  await mockCameraAndDisableWebcamMonitor(page);
  await page.goto(`/start?token=${token}`);
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByRole('button', { name: /skip practice/i }).click();
  await expect(page.getByText('Section One')).toBeVisible();
  await page.getByRole('button', { name: 'Enable camera' }).click();
  await page.getByRole('button', { name: 'Start exam' }).click();
  await expect(page).toHaveURL(/\/exam$/);

  const [currentResponse] = await Promise.all([page.waitForResponse((response) => response.url().includes('/attempt/current'))]);
  const currentBody = await currentResponse.json();
  // The exam's raw duration is whatever the builder default is (60 min = 3600s); with +50%
  // accommodation the candidate should never see less than the raw duration's worth of time.
  expect(currentBody.remainingSeconds).toBeGreaterThan(3600);

  await page.getByRole('button', { name: /Correct/ }).click();
  await page.getByRole('button', { name: 'Review & Submit' }).first().click();
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page).toHaveURL(/\/submitted$/);
  await expect(page.getByText('Exam submitted')).toBeVisible();
  await expect(page.getByText('Section One')).toBeVisible();
  await expect(page.getByText('10/10')).toBeVisible();
});
```

- [ ] **Step 3: Run the new and updated e2e specs against a live stack**

Run: `cd apps/web && npx playwright test e2e/candidate-golden-path.spec.ts e2e/candidate-ux-pack.spec.ts`
Expected: PASS (requires `apps/api` and `apps/exam-runtime` running against a real dev database — same preconditions as every other e2e spec in this suite)

- [ ] **Step 4: Run every full test suite touched by this plan**

Run: `cd apps/exam-runtime && npx jest --testPathIgnorePatterns=test/`
Expected: PASS, full suite green

Run: `cd apps/api && npx jest`
Expected: PASS, full suite green

Run: `cd apps/web && npx jest`
Expected: PASS, full suite green

- [ ] **Step 5: Type-check both TypeScript apps**

Run: `cd apps/web && npx tsc --noEmit`
Expected: only the pre-existing baseline errors (10, per this session's established baseline — confirm the count hasn't grown)

Run: `cd apps/api && npx tsc --noEmit`
Expected: no new errors introduced by this feature

Run: `cd apps/exam-runtime && npx tsc --noEmit`
Expected: no new errors introduced by this feature

- [ ] **Step 6: Live-verify in a browser**

Using the dev stack (`apps/api`, `apps/exam-runtime`, `apps/web` all running): as a recruiter, set an exam's feedback visibility to `breakdown` and grant a candidate +50% extra time via the new Candidates tab; as that candidate, confirm the welcome screen shows the section breakdown and skips straight past the practice step when "Skip practice" is clicked, confirm the exam's remaining time reflects the accommodation, and confirm the submitted page shows the per-section score breakdown after submitting.

- [ ] **Step 7: Commit**

```bash
git add apps/web/e2e/candidate-golden-path.spec.ts apps/web/e2e/candidate-ux-pack.spec.ts
git commit -m "test: e2e coverage for practice/time-transparency/feedback/accommodations"
```
