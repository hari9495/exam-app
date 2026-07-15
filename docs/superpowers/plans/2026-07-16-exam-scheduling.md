# Exam Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a recruiter turn on a per-exam availability window (open/close datetime), so candidates can only start their attempt inside that window, while everything after starting stays completely unchanged.

**Architecture:** Three plain nullable/boolean fields added to `Exam` (mirroring the existing `randomizeOrder` toggle's exact plumbing pattern — no new tables). `Invitation.expiresAt` becomes a synced cache of the window's end for scheduled exams; the real-time gate lives entirely in `apps/exam-runtime`'s `attempt.service.ts`, reading the exam's current window live so an edited window takes effect immediately with no migration step. A new shared helper computes the window state (`not_open` / `open` / `closed`) once, server-side, and is used both to gate `start()` and to tell the candidate frontend what to render — avoiding any client-clock-skew bugs.

**Tech Stack:** NestJS (apps/api, apps/exam-runtime), Prisma/SQL Server, Next.js 16 App Router (apps/web), existing class-validator/class-transformer conventions.

## Global Constraints

- Per-exam toggle, recruiter-controlled — no org-level default, no new permission.
- One shared window per exam — no per-invitation override in this phase.
- The window only gates the *first* `start()` call that creates an `Attempt` row — never an in-progress or already-submitted attempt, and never the exam's own duration/auto-submit logic.
- For a scheduled exam, the window's close time *is* the invitation's effective expiry — no separate 7-day rule stacked on top. Non-scheduled exams are entirely unaffected and keep today's `INVITATION_EXPIRY_DAYS = 7` behavior unchanged.
- A candidate can redeem (log in) any time before the window opens — redeem is never blocked by "not open yet," only by revoked/expired/exam-not-published (unchanged today).
- No self-service candidate rescheduling. The recruiter's only recovery lever for one missed candidate is editing the exam's shared window, which affects every candidate on that exam.
- Window state must be computed server-side (never compared against the client's local clock) to avoid clock-skew bugs — this is why a single shared `not_open | open | closed` state is returned by the API rather than raw datetimes for the frontend to compare itself.

---

### Task 1: Schema — Exam scheduling columns

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: a new Prisma migration under `apps/api/prisma/migrations/`

**Interfaces:**
- Consumes: nothing from earlier tasks (first task).
- Produces: `Exam.schedulingEnabled: Boolean`, `Exam.availabilityWindowStart: DateTime?`, `Exam.availabilityWindowEnd: DateTime?` — every later task relies on these exact field names.

- [ ] **Step 1: Add the new columns**

In `apps/api/prisma/schema.prisma`, find the `Exam` model and add three fields directly after `randomizeOrder`:

```prisma
  randomizeOrder           Boolean       @default(false) @map("randomize_order")
  schedulingEnabled        Boolean       @default(false) @map("scheduling_enabled")
  availabilityWindowStart  DateTime?     @map("availability_window_start")
  availabilityWindowEnd    DateTime?     @map("availability_window_end")
```

- [ ] **Step 2: Generate and apply the migration**

Run: `cd apps/api && npx prisma migrate dev --name exam_scheduling`

This environment's local SQL Server Express instance has previously rejected `migrate dev` due to a shadow-database permission constraint (documented in this project's memory). If that happens here too, fall back to the established workaround used by every prior migration in this codebase:
1. Run: `cd apps/api && npx prisma db push` — applies the schema change directly.
2. Manually create the migration folder `apps/api/prisma/migrations/20260716090000_exam_scheduling/migration.sql` with:

```sql
ALTER TABLE [dbo].[exams] ADD [scheduling_enabled] BIT NOT NULL CONSTRAINT [exams_scheduling_enabled_default] DEFAULT 0,
[availability_window_start] DATETIME2,
[availability_window_end] DATETIME2;
```

3. Run: `cd apps/api && npx prisma migrate resolve --applied 20260716090000_exam_scheduling`
4. Confirm with: `cd apps/api && npx prisma migrate status` — expect "Database schema is up to date!"

Either path (native `migrate dev` or the `db push` + hand-written-migration fallback) is acceptable — use whichever actually works in this environment, and note which one you used in your report.

- [ ] **Step 3: Regenerate the Prisma client**

Run: `cd apps/api && npx prisma generate`
Expected: completes without error; `@prisma/client`'s `Exam` type now includes `schedulingEnabled: boolean`, `availabilityWindowStart: Date | null`, `availabilityWindowEnd: Date | null`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat: schema for exam scheduling — Exam.schedulingEnabled/availabilityWindowStart/availabilityWindowEnd"
```

---

### Task 2: Backend — exam create/update validation, DTOs, service

**Files:**
- Modify: `apps/api/src/exams/dto/create-exam.dto.ts`
- Modify: `apps/api/src/exams/exams.service.ts`
- Test: `apps/api/src/exams/exams.service.spec.ts` (check first whether this file exists — if so, read it fully and add to it matching its exact conventions; if it doesn't exist, check for any other `.spec.ts` file in `apps/api/src/exams/` to mirror its mocking convention before creating a fresh one)

**Interfaces:**
- Consumes: `Exam.schedulingEnabled`/`availabilityWindowStart`/`availabilityWindowEnd` from Task 1.
- Produces: `CreateExamDto.schedulingEnabled?: boolean`, `.availabilityWindowStart?: string`, `.availabilityWindowEnd?: string` (ISO8601 strings — this app's global `ValidationPipe` does not use `transform: true`, so DTO date fields arrive as raw strings, not `Date` objects); `ExamsService.create()`/`update()` persist the resolved scheduling fields and `update()` re-syncs not-yet-started invitations' `expiresAt` — Task 3 and Task 5 rely on this exact DTO shape.

- [ ] **Step 1: Update `CreateExamDto`**

Replace the full contents of `apps/api/src/exams/dto/create-exam.dto.ts`:

```ts
import { IsBoolean, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateExamDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  passCriteriaPercent?: number;

  @IsOptional()
  @IsBoolean()
  randomizeOrder?: boolean;

  @IsOptional()
  @IsBoolean()
  schedulingEnabled?: boolean;

  @IsOptional()
  @IsISO8601()
  availabilityWindowStart?: string;

  @IsOptional()
  @IsISO8601()
  availabilityWindowEnd?: string;
}
```

(`UpdateExamDto` needs no change — it already inherits every field from `CreateExamDto` via `extends`.)

- [ ] **Step 2: Write the failing tests**

Read `apps/api/src/exams/exams.service.spec.ts` (or the closest existing sibling spec in that directory) first to match its exact mocking convention for `tenantPrisma`/`tx`, then add these cases (adapt fixture/mock variable names to match what's already there — the behavior each test must verify is described precisely below):

```ts
  it('creates a scheduled exam with schedulingEnabled true and a valid window', async () => {
    // Arrange: dto = { title: 'Scheduled Exam', schedulingEnabled: true,
    //   availabilityWindowStart: '2026-07-20T09:00:00.000Z', availabilityWindowEnd: '2026-07-27T18:00:00.000Z' }
    // Act: const result = await service.create(context, 'user-1', dto)
    // Assert: result.schedulingEnabled === true, result.availabilityWindowStart is a Date equal to
    //   new Date('2026-07-20T09:00:00.000Z'), result.availabilityWindowEnd equal to new Date('2026-07-27T18:00:00.000Z')
    //   — assert against the actual data object passed to the mocked tx.exam.create call, not just the
    //   mock's canned return value (this codebase has twice flagged tests that only checked a mock's return).
  });

  it('rejects schedulingEnabled true with a missing window field', async () => {
    // Arrange: dto = { title: 'Bad Exam', schedulingEnabled: true, availabilityWindowStart: '2026-07-20T09:00:00.000Z' }
    //   (availabilityWindowEnd omitted)
    // Act/Assert: await expect(service.create(context, 'user-1', dto)).rejects.toThrow(
    //   'Scheduling requires both an availability window start and end')
  });

  it('rejects an availability window whose end is not after its start', async () => {
    // Arrange: dto = { title: 'Bad Exam', schedulingEnabled: true,
    //   availabilityWindowStart: '2026-07-27T18:00:00.000Z', availabilityWindowEnd: '2026-07-20T09:00:00.000Z' } (end before start)
    // Act/Assert: await expect(service.create(context, 'user-1', dto)).rejects.toThrow(
    //   'The availability window end must be after its start')
  });

  it('creates a non-scheduled exam with null window fields when schedulingEnabled is omitted', async () => {
    // Arrange: dto = { title: 'Normal Exam' } (no scheduling fields at all)
    // Act: const result = await service.create(context, 'user-1', dto)
    // Assert: the data object passed to tx.exam.create has schedulingEnabled: false,
    //   availabilityWindowStart: null, availabilityWindowEnd: null
  });

  it('update() re-syncs expiresAt on not-yet-started invitations when the window changes', async () => {
    // Arrange: existing exam already has schedulingEnabled: true with some window; tx.invitation.findMany
    //   (mocked) returns two invitations for this exam with status 'invited': one with attempt: null
    //   (not started) and one with attempt: { id: 'attempt-1' } (already started). dto updates
    //   availabilityWindowEnd to a new later date.
    // Act: await service.update(context, examId, dto)
    // Assert: tx.invitation.updateMany was called with where: { id: { in: [<the not-started invitation's id only>] } }
    //   and data: { expiresAt: <the new availabilityWindowEnd, as a Date> } — the already-started
    //   invitation's id must NOT appear in the updateMany's id list.
  });

  it('update() does not touch invitations when schedulingEnabled is false', async () => {
    // Arrange: existing exam has schedulingEnabled: false; dto updates only title.
    // Act: await service.update(context, examId, dto)
    // Assert: tx.invitation.updateMany / tx.invitation.findMany were not called.
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/api && npx jest exams/exams.service.spec.ts`
Expected: FAIL — `schedulingEnabled`/window fields aren't written or validated yet, and `update()` doesn't re-sync invitations.

- [ ] **Step 4: Implement the scheduling helper and wire it into `create()`/`update()`**

In `apps/api/src/exams/exams.service.ts`, add this private method to the `ExamsService` class (place it directly after the constructor):

```ts
  private resolveSchedulingFields(
    schedulingEnabled: boolean | undefined,
    availabilityWindowStart: string | undefined,
    availabilityWindowEnd: string | undefined,
  ): { schedulingEnabled: boolean; availabilityWindowStart: Date | null; availabilityWindowEnd: Date | null } {
    if (!schedulingEnabled) {
      return { schedulingEnabled: false, availabilityWindowStart: null, availabilityWindowEnd: null };
    }
    if (!availabilityWindowStart || !availabilityWindowEnd) {
      throw new BadRequestException('Scheduling requires both an availability window start and end');
    }
    const start = new Date(availabilityWindowStart);
    const end = new Date(availabilityWindowEnd);
    if (end <= start) {
      throw new BadRequestException('The availability window end must be after its start');
    }
    return { schedulingEnabled: true, availabilityWindowStart: start, availabilityWindowEnd: end };
  }
```

Replace the `create()` method:

```ts
  async create(context: TenantContext, userId: string, dto: CreateExamDto): Promise<Exam> {
    const scheduling = this.resolveSchedulingFields(dto.schedulingEnabled, dto.availabilityWindowStart, dto.availabilityWindowEnd);
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.exam.create({
        data: {
          organizationId: context.organizationId as string,
          title: dto.title,
          instructions: dto.instructions,
          durationMinutes: dto.durationMinutes,
          passCriteriaPercent: dto.passCriteriaPercent,
          randomizeOrder: dto.randomizeOrder,
          schedulingEnabled: scheduling.schedulingEnabled,
          availabilityWindowStart: scheduling.availabilityWindowStart,
          availabilityWindowEnd: scheduling.availabilityWindowEnd,
          createdBy: userId,
        },
      }),
    );
  }
```

Replace the `update()` method:

```ts
  async update(context: TenantContext, id: string, dto: UpdateExamDto): Promise<Exam> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.exam.findFirst({ where: { id, organizationId: context.organizationId as string } });
      if (!existing) {
        throw new NotFoundException(`Exam ${id} not found`);
      }

      const schedulingEnabledInput = dto.schedulingEnabled !== undefined ? dto.schedulingEnabled : existing.schedulingEnabled;
      const availabilityWindowStartInput =
        dto.availabilityWindowStart !== undefined ? dto.availabilityWindowStart : (existing.availabilityWindowStart?.toISOString() ?? undefined);
      const availabilityWindowEndInput =
        dto.availabilityWindowEnd !== undefined ? dto.availabilityWindowEnd : (existing.availabilityWindowEnd?.toISOString() ?? undefined);
      const scheduling = this.resolveSchedulingFields(schedulingEnabledInput, availabilityWindowStartInput, availabilityWindowEndInput);

      const updated = await tx.exam.update({
        where: { id },
        data: {
          title: dto.title,
          instructions: dto.instructions,
          ...(dto.durationMinutes !== undefined ? { durationMinutes: dto.durationMinutes } : {}),
          ...(dto.passCriteriaPercent !== undefined ? { passCriteriaPercent: dto.passCriteriaPercent } : {}),
          ...(dto.randomizeOrder !== undefined ? { randomizeOrder: dto.randomizeOrder } : {}),
          schedulingEnabled: scheduling.schedulingEnabled,
          availabilityWindowStart: scheduling.availabilityWindowStart,
          availabilityWindowEnd: scheduling.availabilityWindowEnd,
        },
      });

      if (updated.schedulingEnabled) {
        const liveInvitations = await tx.invitation.findMany({
          where: { examId: id, status: 'invited' },
          include: { attempt: true },
        });
        const notYetStartedIds = liveInvitations.filter((invitation) => !invitation.attempt).map((invitation) => invitation.id);
        if (notYetStartedIds.length > 0) {
          await tx.invitation.updateMany({
            where: { id: { in: notYetStartedIds } },
            data: { expiresAt: updated.availabilityWindowEnd as Date },
          });
        }
      }

      return updated;
    });
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && npx jest exams/exams.service.spec.ts`
Expected: all tests pass, including the 6 new ones.

- [ ] **Step 6: Run the full exams suite**

Run: `cd apps/api && npx jest exams/`
Expected: all pass — `create()`/`update()`'s existing behavior for `title`/`instructions`/`durationMinutes`/`passCriteriaPercent`/`randomizeOrder` is untouched (every new line is additive).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/exams/dto/create-exam.dto.ts apps/api/src/exams/exams.service.ts apps/api/src/exams/exams.service.spec.ts
git commit -m "feat: exam scheduling validation, DTO fields, and invitation expiry re-sync on window edit"
```

---

### Task 3: Backend — invitation expiry for scheduled exams

**Files:**
- Modify: `apps/api/src/invitations/invitations.service.ts`
- Test: `apps/api/src/invitations/invitations.service.spec.ts` (check first whether this file exists — read it fully to match conventions if so, otherwise check for a sibling `.spec.ts` in the same directory before creating fresh)

**Interfaces:**
- Consumes: `Exam.schedulingEnabled`/`availabilityWindowEnd` from Task 1.
- Produces: `bulkInvite()`/`resend()` set `Invitation.expiresAt` to the exam's `availabilityWindowEnd` for scheduled exams — Task 4's candidate-facing checks and Task 7's e2e both rely on this.

- [ ] **Step 1: Write the failing tests**

Read the existing spec file (or closest sibling) first to match conventions, then add:

```ts
  it('sets expiresAt to the exam availability window end for a scheduled exam', async () => {
    // Arrange: tx.exam.findFirst (mocked) returns an exam with schedulingEnabled: true,
    //   availabilityWindowEnd: new Date('2026-07-27T18:00:00.000Z'). tx.candidate.findMany returns one
    //   non-erased candidate. tx.invitation.findMany (the "already has a live invitation" dedup check)
    //   returns []. tx.invitation.create is mocked to resolve its input.
    // Act: await service.bulkInvite(context, examId, [candidateId])
    // Assert: tx.invitation.create was called with data.expiresAt equal to
    //   new Date('2026-07-27T18:00:00.000Z') — NOT a 7-days-from-now date.
  });

  it('sets expiresAt to a 7-day default for a non-scheduled exam', async () => {
    // Arrange: same as above but exam.schedulingEnabled: false.
    // Act: await service.bulkInvite(context, examId, [candidateId])
    // Assert: tx.invitation.create's data.expiresAt is within a few seconds of
    //   addDays(new Date(), 7) — i.e. today's existing default behavior is unchanged.
  });

  it('resend() also uses the scheduled window end, not the 7-day default, for a scheduled exam', async () => {
    // Arrange: tx.invitation.findFirst (mocked) returns an existing invitation with status 'invited',
    //   include: { exam: { schedulingEnabled: true, availabilityWindowEnd: new Date('2026-08-01T00:00:00.000Z') }, candidate: {...} }.
    // Act: await service.resend(context, invitationId)
    // Assert: tx.invitation.update was called with data.expiresAt equal to new Date('2026-08-01T00:00:00.000Z').
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest invitations/invitations.service.spec.ts`
Expected: FAIL — `expiresAt` is always `addDays(new Date(), INVITATION_EXPIRY_DAYS)` today, regardless of the exam's scheduling.

- [ ] **Step 3: Implement**

In `apps/api/src/invitations/invitations.service.ts`, add a small private helper directly after the `addDays` function:

```ts
function resolveInvitationExpiry(exam: { schedulingEnabled: boolean; availabilityWindowEnd: Date | null }): Date {
  if (exam.schedulingEnabled && exam.availabilityWindowEnd) {
    return exam.availabilityWindowEnd;
  }
  return addDays(new Date(), INVITATION_EXPIRY_DAYS);
}
```

In `bulkInvite()`, replace the `tx.invitation.create` call's `expiresAt` line:

```ts
        const invitation = await tx.invitation.create({
          data: {
            examId,
            candidateId: candidate.id,
            token: generateToken(),
            expiresAt: resolveInvitationExpiry(exam),
          },
        });
```

(`exam` is already in scope from the existing `const exam = await tx.exam.findFirst(...)` call earlier in `bulkInvite()`.)

In `resend()`, the existing query only selects `exam: true` via `include: { exam: true, candidate: true }` — confirm this already includes `schedulingEnabled`/`availabilityWindowEnd` (it does, since `include: { exam: true }` pulls every scalar column). Replace the `tx.invitation.update` call's `expiresAt` line:

```ts
      const updated = await tx.invitation.update({
        where: { id: invitationId },
        data: { token: generateToken(), expiresAt: resolveInvitationExpiry(existing.exam) },
      });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest invitations/invitations.service.spec.ts`
Expected: all tests pass, including the 3 new ones.

- [ ] **Step 5: Run the full invitations suite**

Run: `cd apps/api && npx jest invitations/`
Expected: all pass — non-scheduled exam behavior is byte-identical to before (the helper falls through to the exact same `addDays(new Date(), INVITATION_EXPIRY_DAYS)` expression).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/invitations/invitations.service.ts apps/api/src/invitations/invitations.service.spec.ts
git commit -m "feat: invitation expiry follows the exam's availability window for scheduled exams"
```

---

### Task 4: Backend — candidate-facing enforcement (start/preview) + e2e

**Files:**
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts`
- Test: `apps/exam-runtime/src/attempts/attempt.service.spec.ts`
- Test: create `apps/api/test/exam-scheduling.e2e-spec.ts`

**Interfaces:**
- Consumes: `Exam.schedulingEnabled`/`availabilityWindowStart`/`availabilityWindowEnd` from Task 1; `Invitation.expiresAt` behavior from Task 3.
- Produces: `AttemptService`'s private `getSchedulingWindowState(exam)` returning `'not_open' | 'open' | 'closed' | null`; `AttemptPreviewResponse` gains `exam.schedulingEnabled`/`exam.availabilityWindowStart`/`exam.availabilityWindowEnd`/`schedulingWindowState` — Task 6 (frontend welcome screen) consumes this exact response shape by field name.

- [ ] **Step 1: Read the current file in full**

Read `apps/exam-runtime/src/attempts/attempt.service.ts` and `apps/exam-runtime/src/attempts/attempt.service.spec.ts` in full before making any changes — this task inserts into `getCurrent()` and `start()`, both of which are shared by every existing question type, so precision matters.

- [ ] **Step 2: Write the failing tests**

Add these cases to `attempt.service.spec.ts`, matching its existing fixture/mock conventions exactly (adapt variable names to what's already there — the behavior each test must verify is described precisely):

```ts
  describe('scheduling', () => {
    it('getCurrent() returns schedulingWindowState "not_open" before the window opens, with no attempt created', async () => {
      // Arrange: resolveContext's underlying tx.invitation.findUnique (mocked) resolves an invitation
      //   whose included exam has schedulingEnabled: true, availabilityWindowStart 1 hour in the future,
      //   availabilityWindowEnd 2 hours in the future. tx.attempt.findUnique (inside getCurrent's own
      //   transaction) resolves null (no attempt yet).
      // Act: const result = await service.getCurrent(session)
      // Assert: result.schedulingWindowState === 'not_open'; result.exam.schedulingEnabled === true;
      //   result.exam.availabilityWindowStart/End match the fixture's dates; tx.attempt.create was never called.
    });

    it('getCurrent() returns schedulingWindowState "closed" after the window has passed, with no attempt created', async () => {
      // Arrange: same shape, but availabilityWindowStart/End are both in the past (e.g. 2 hours ago / 1 hour ago).
      // Act: const result = await service.getCurrent(session)
      // Assert: result.schedulingWindowState === 'closed'.
    });

    it('getCurrent() returns schedulingWindowState "open" within the window', async () => {
      // Arrange: availabilityWindowStart 1 hour ago, availabilityWindowEnd 1 hour in the future.
      // Act: const result = await service.getCurrent(session)
      // Assert: result.schedulingWindowState === 'open'.
    });

    it('getCurrent() returns schedulingWindowState null for a non-scheduled exam', async () => {
      // Arrange: exam.schedulingEnabled: false (availabilityWindowStart/End are null, matching how a
      //   non-scheduled exam is actually persisted).
      // Act: const result = await service.getCurrent(session)
      // Assert: result.schedulingWindowState === null.
    });

    it('start() rejects with "not open yet" before the window opens', async () => {
      // Arrange: exam.schedulingEnabled: true, availabilityWindowStart 1 hour in the future. tx.attempt.findUnique
      //   (inside start()'s transaction) resolves null (no existing attempt).
      // Act/Assert: await expect(service.start(session, {})).rejects.toThrow(
      //   'This exam is not open yet — check back during its scheduled window.')
      // Also assert tx.attempt.create was never called.
    });

    it('start() rejects with "closed" after the window has passed', async () => {
      // Arrange: availabilityWindowStart/End both in the past.
      // Act/Assert: await expect(service.start(session, {})).rejects.toThrow(
      //   "This exam's availability window has closed.")
      // Also assert tx.attempt.create was never called.
    });

    it('start() succeeds within the window', async () => {
      // Arrange: availabilityWindowStart 1 hour ago, availabilityWindowEnd 1 hour in the future; the rest
      //   of the fixture matches whatever this file's existing successful-start test already sets up
      //   (section snapshot, etc.) so tx.attempt.create actually succeeds.
      // Act: const result = await service.start(session, {})
      // Assert: result has an id and status 'in_progress' (or whatever this file's existing successful-start
      //   test already asserts) — i.e. scheduling being enabled and the window being open does not
      //   otherwise change start()'s normal behavior.
    });

    it('start() returns an existing attempt idempotently even when the window is closed', async () => {
      // Arrange: exam.schedulingEnabled: true, availabilityWindowStart/End both in the past (closed).
      //   tx.attempt.findUnique (inside start()'s transaction) resolves an EXISTING attempt
      //   { id: 'attempt-1', status: 'in_progress' }.
      // Act: const result = await service.start(session, {})
      // Assert: result === { id: 'attempt-1', status: 'in_progress' } — the window check must never run
      //   for an attempt that already exists. No exception thrown.
    });
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/exam-runtime && npx jest attempts/attempt.service.spec.ts -t scheduling`
Expected: FAIL — `getSchedulingWindowState` doesn't exist, `getCurrent()`'s preview has no `schedulingWindowState` field, `start()` has no window check.

- [ ] **Step 4: Implement**

In `apps/exam-runtime/src/attempts/attempt.service.ts`, replace the `AttemptPreviewResponse` interface (currently a single line):

```ts
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
}
```

Add a new private method directly after `resolveContext()`:

```ts
  private getSchedulingWindowState(exam: {
    schedulingEnabled: boolean;
    availabilityWindowStart: Date | null;
    availabilityWindowEnd: Date | null;
  }): 'not_open' | 'open' | 'closed' | null {
    if (!exam.schedulingEnabled || !exam.availabilityWindowStart || !exam.availabilityWindowEnd) {
      return null;
    }
    const now = new Date();
    if (now < exam.availabilityWindowStart) {
      return 'not_open';
    }
    if (now > exam.availabilityWindowEnd) {
      return 'closed';
    }
    return 'open';
  }
```

In `getCurrent()`, replace the no-attempt-yet return (currently `return { exam: { title: exam.title, instructions: exam.instructions, durationMinutes: exam.durationMinutes } };`):

```ts
      if (!attempt) {
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
        };
      }
```

In `start()`, insert the gate directly after the existing idempotent early return (`if (existing) { return { id: existing.id, status: existing.status }; }`), before the `const sections = await tx.examSection.findMany(...)` line:

```ts
      const existing = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (existing) {
        return { id: existing.id, status: existing.status };
      }

      const windowState = this.getSchedulingWindowState(exam);
      if (windowState === 'not_open') {
        throw new BadRequestException('This exam is not open yet — check back during its scheduled window.');
      }
      if (windowState === 'closed') {
        throw new BadRequestException("This exam's availability window has closed.");
      }

      const sections = await tx.examSection.findMany({
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/exam-runtime && npx jest attempts/attempt.service.spec.ts`
Expected: all tests pass, including the 7 new scheduling ones, with zero regressions to the 3 existing MCQ question types' tests (every change is additive — a non-scheduled exam's `getSchedulingWindowState` always returns `null`, and `start()`'s gate is a no-op for `null`/`'open'`).

- [ ] **Step 6: Write the e2e test**

Read an existing e2e spec first (e.g. `apps/api/test/exam-code-grading.e2e-spec.ts`) to confirm the exact `bootAdminApp`/`bootRuntimeApp` dual-app setup pattern, recruiter/candidate auth helpers, and `afterAll` cleanup convention (the `try/finally` around app teardown — no manual `audit_logs.actorUserId` nulling is needed, that workaround was removed after a DB fix earlier in this project). Create `apps/api/test/exam-scheduling.e2e-spec.ts` covering, in order:

1. Recruiter creates a `code`-free (plain `single_mcq`) question, then creates an exam with `schedulingEnabled: true`, `availabilityWindowStart` = `new Date(Date.now() + 60 * 60 * 1000).toISOString()` (1 hour from now), `availabilityWindowEnd` = `new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()` (2 hours from now). Adds a section with the question, publishes.
2. Recruiter invites two candidates, "Alice" and "Bob". Captures both invite tokens.
3. Alice redeems her invite — expect 200 (early login before the window opens must succeed).
4. Alice calls `GET /attempt/current` — expect 200, `body.schedulingWindowState === 'not_open'`.
5. Alice calls `POST /attempt/start` — expect 400, with a body message containing `'not open yet'`.
6. Recruiter calls `PATCH /exams/:id` moving the window to `availabilityWindowStart` = `new Date(Date.now() - 30 * 60 * 1000).toISOString()` (30 min ago), `availabilityWindowEnd` = `new Date(Date.now() + 30 * 60 * 1000).toISOString()` (30 min from now) — i.e. now open.
7. Alice calls `GET /attempt/current` again — expect `body.schedulingWindowState === 'open'`.
8. Alice calls `POST /attempt/start` — expect 201, capture `attemptId`.
9. Recruiter calls `PATCH /exams/:id` again, moving the window fully into the past: `availabilityWindowStart` = `new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()`, `availabilityWindowEnd` = `new Date(Date.now() - 60 * 60 * 1000).toISOString()` — i.e. now closed.
10. Alice calls `POST /attempt/start` again (same attempt already exists) — expect 201, returning the SAME `attemptId` as step 8 (idempotent, unaffected by the now-closed window). Alice can still call `POST /attempt/answer` and `POST /attempt/submit` normally — assert both succeed (201), proving an in-progress/completing attempt is never gated by the window.
11. Bob (who never redeemed or started) calls `POST /candidate-auth/redeem` with his token — expect 400, since his invitation's `expiresAt` was re-synced to the new (already-past) `availabilityWindowEnd` in step 9, and `redeem()`'s existing expiry check now correctly rejects him — assert the response body's message contains `'expired'`.

- [ ] **Step 7: Run the e2e test**

Run: `cd apps/api && timeout 100 npx jest --config ./test/jest-e2e.json --runInBand exam-scheduling.e2e-spec.ts`
Expected: passes, process exits cleanly with no hang (always wrap e2e Jest runs with an external bounded timeout in this environment — a prior feature in this project lost significant time to an e2e hang that only surfaced once run with a bounded timeout).

- [ ] **Step 8: Commit**

```bash
git add apps/exam-runtime/src/attempts/attempt.service.ts apps/exam-runtime/src/attempts/attempt.service.spec.ts apps/api/test/exam-scheduling.e2e-spec.ts
git commit -m "feat: candidate-facing scheduling enforcement (start gate, preview window state) and e2e coverage"
```

---

### Task 5: Frontend — types and ExamDetailsForm scheduling fields

**Files:**
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/lib/hooks/useExams.ts`
- Modify: `apps/web/components/ExamDetailsForm.tsx`
- Test: `apps/web/components/ExamDetailsForm.test.tsx` (check first whether this file exists — read it fully to match conventions if so, otherwise create fresh matching this project's established RTL/Jest patterns)

**Interfaces:**
- Consumes: nothing from earlier tasks directly (frontend types mirror the backend shape from Tasks 1-2).
- Produces: `Exam.schedulingEnabled`/`availabilityWindowStart`/`availabilityWindowEnd`; `ExamDetailsValue` gains the same 3 fields — Task 6 does not depend on this task, but both read the same `Exam`/`AttemptPreview` types file.

- [ ] **Step 1: Add types**

In `apps/web/lib/types.ts`, update the `Exam` interface:

```ts
export interface Exam {
  id: string;
  title: string;
  instructions: string | null;
  status: ExamStatus;
  durationMinutes: number;
  passCriteriaPercent: number;
  randomizeOrder: boolean;
  schedulingEnabled: boolean;
  availabilityWindowStart: string | null;
  availabilityWindowEnd: string | null;
  createdAt: string;
  sections: ExamSection[];
}
```

Update the `AttemptPreview` interface:

```ts
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
}
```

- [ ] **Step 2: Update `useExams.ts`'s `CreateExamInput`**

In `apps/web/lib/hooks/useExams.ts`, update the `CreateExamInput` interface:

```ts
interface CreateExamInput {
  title: string;
  instructions?: string;
  durationMinutes?: number;
  passCriteriaPercent?: number;
  randomizeOrder?: boolean;
  schedulingEnabled?: boolean;
  availabilityWindowStart?: string;
  availabilityWindowEnd?: string;
}
```

(`useCreateExam()`/`useUpdateExam()` need no other change — they already pass the whole input object straight through.)

- [ ] **Step 3: Check for an existing `ExamDetailsForm.test.tsx`**

Run: `find apps/web/components -iname "ExamDetailsForm.test.tsx"`
If it exists, read it fully to match its render/assertion conventions before inserting the tests below. If not, create it fresh using this project's standard `render`/`screen`/`userEvent` pattern (matching `QuestionForm.test.tsx`'s conventions, since both are recruiter-facing form components in the same directory).

- [ ] **Step 4: Write the failing tests**

```tsx
  it('submits schedulingEnabled and both window datetimes when scheduling is turned on', async () => {
    const onSubmit = jest.fn();
    render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Create" />);

    await userEvent.type(screen.getByLabelText('Title'), 'Scheduled Exam');
    await userEvent.click(screen.getByLabelText('Enable scheduling'));
    const startInput = screen.getByLabelText('Window opens') as HTMLInputElement;
    const endInput = screen.getByLabelText('Window closes') as HTMLInputElement;
    fireEvent.change(startInput, { target: { value: '2026-07-20T09:00' } });
    fireEvent.change(endInput, { target: { value: '2026-07-27T18:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        schedulingEnabled: true,
        availabilityWindowStart: new Date('2026-07-20T09:00').toISOString(),
        availabilityWindowEnd: new Date('2026-07-27T18:00').toISOString(),
      }),
    );
  });

  it('shows a validation error and does not submit when scheduling is on but a window field is missing', async () => {
    const onSubmit = jest.fn();
    render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Create" />);

    await userEvent.type(screen.getByLabelText('Title'), 'Bad Exam');
    await userEvent.click(screen.getByLabelText('Enable scheduling'));
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(screen.getByText('Both a window open and close time are required.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not include scheduling window fields when scheduling is off', async () => {
    const onSubmit = jest.fn();
    render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Create" />);

    await userEvent.type(screen.getByLabelText('Title'), 'Normal Exam');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ schedulingEnabled: false }));
    const call = onSubmit.mock.calls[0][0];
    expect(call.availabilityWindowStart).toBeUndefined();
    expect(call.availabilityWindowEnd).toBeUndefined();
  });

  it('pre-fills the window inputs from an existing scheduled exam', () => {
    const scheduledExam = {
      id: 'exam-1', title: 'Existing', instructions: null, status: 'draft', durationMinutes: 60,
      passCriteriaPercent: 40, randomizeOrder: false, schedulingEnabled: true,
      availabilityWindowStart: '2026-07-20T09:00:00.000Z', availabilityWindowEnd: '2026-07-27T18:00:00.000Z',
      createdAt: '2026-07-01T00:00:00.000Z', sections: [],
    };
    render(<ExamDetailsForm initialExam={scheduledExam} onSubmit={jest.fn()} submitLabel="Save" />);

    expect(screen.getByLabelText('Enable scheduling')).toBeChecked();
    expect(screen.getByLabelText('Window opens')).toHaveValue('2026-07-20T09:00');
  });
```

Add `fireEvent` to the file's existing `@testing-library/react` import if not already present (native `datetime-local` inputs are more reliably set via `fireEvent.change` than `userEvent.type`, since the latter simulates keystrokes that the browser's native datetime picker widget doesn't cleanly accept in jsdom).

- [ ] **Step 5: Run the tests to verify they fail**

Run: `cd apps/web && npx jest components/ExamDetailsForm.test.tsx`
Expected: FAIL — no "Enable scheduling" checkbox or window inputs exist yet.

- [ ] **Step 6: Implement**

Replace the full contents of `apps/web/components/ExamDetailsForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Button, Input } from '../components/ui';
import { Exam } from '../lib/types';

export interface ExamDetailsValue {
  title: string;
  instructions?: string;
  durationMinutes: number;
  passCriteriaPercent: number;
  randomizeOrder: boolean;
  schedulingEnabled: boolean;
  availabilityWindowStart?: string;
  availabilityWindowEnd?: string;
}

interface ExamDetailsFormProps {
  initialExam?: Exam;
  onSubmit: (input: ExamDetailsValue) => void;
  submitLabel: string;
}

function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ExamDetailsForm({ initialExam, onSubmit, submitLabel }: ExamDetailsFormProps) {
  const [title, setTitle] = useState(initialExam?.title ?? '');
  const [instructions, setInstructions] = useState(initialExam?.instructions ?? '');
  const [durationMinutes, setDurationMinutes] = useState(String(initialExam?.durationMinutes ?? 60));
  const [passCriteriaPercent, setPassCriteriaPercent] = useState(String(initialExam?.passCriteriaPercent ?? 40));
  const [randomizeOrder, setRandomizeOrder] = useState(initialExam?.randomizeOrder ?? false);
  const [schedulingEnabled, setSchedulingEnabled] = useState(initialExam?.schedulingEnabled ?? false);
  const [availabilityWindowStart, setAvailabilityWindowStart] = useState(
    initialExam?.availabilityWindowStart ? toDatetimeLocalValue(initialExam.availabilityWindowStart) : '',
  );
  const [availabilityWindowEnd, setAvailabilityWindowEnd] = useState(
    initialExam?.availabilityWindowEnd ? toDatetimeLocalValue(initialExam.availabilityWindowEnd) : '',
  );
  const [schedulingError, setSchedulingError] = useState<string | undefined>(undefined);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (schedulingEnabled && (!availabilityWindowStart || !availabilityWindowEnd)) {
      setSchedulingError('Both a window open and close time are required.');
      return;
    }
    setSchedulingError(undefined);
    onSubmit({
      title,
      instructions: instructions || undefined,
      durationMinutes: Number(durationMinutes),
      passCriteriaPercent: Number(passCriteriaPercent),
      randomizeOrder,
      schedulingEnabled,
      availabilityWindowStart: schedulingEnabled ? new Date(availabilityWindowStart).toISOString() : undefined,
      availabilityWindowEnd: schedulingEnabled ? new Date(availabilityWindowEnd).toISOString() : undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <Input label="Title" value={title} onChange={setTitle} required />
      <div className="flex flex-col gap-1">
        <label htmlFor="exam-instructions" className="text-sm font-medium text-gray-700">
          Instructions
        </label>
        <textarea
          id="exam-instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          rows={3}
        />
      </div>
      <Input label="Duration (minutes)" type="number" min={1} value={durationMinutes} onChange={setDurationMinutes} />
      <Input label="Pass criteria (%)" type="number" min={0} max={100} value={passCriteriaPercent} onChange={setPassCriteriaPercent} />
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={randomizeOrder} onChange={(e) => setRandomizeOrder(e.target.checked)} />
        Randomize question order for candidates
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={schedulingEnabled} onChange={(e) => setSchedulingEnabled(e.target.checked)} />
        Enable scheduling
      </label>
      {schedulingEnabled && (
        <div className="flex flex-col gap-2 pl-6">
          <Input
            label="Window opens"
            type="datetime-local"
            value={availabilityWindowStart}
            onChange={setAvailabilityWindowStart}
          />
          <Input
            label="Window closes"
            type="datetime-local"
            value={availabilityWindowEnd}
            onChange={setAvailabilityWindowEnd}
          />
          {schedulingError && <p className="text-xs text-red-600">{schedulingError}</p>}
        </div>
      )}
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd apps/web && npx jest components/ExamDetailsForm.test.tsx`
Expected: all tests pass, including the 4 new ones.

- [ ] **Step 8: Run the full apps/web unit suite**

Run: `cd apps/web && npm test`
Expected: all suites pass — every change here is additive to `ExamDetailsForm`'s existing fields.

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/hooks/useExams.ts apps/web/components/ExamDetailsForm.tsx apps/web/components/ExamDetailsForm.test.tsx
git commit -m "feat: recruiter exam scheduling toggle and availability window fields"
```

---

### Task 6: Frontend — candidate welcome screen waiting/closed states

**Files:**
- Modify: `apps/web/app/(candidate)/welcome/page.tsx`
- Test: `apps/web/app/(candidate)/welcome/page.test.tsx` (check first whether this file exists — read it fully to match conventions if so, otherwise create fresh)

**Interfaces:**
- Consumes: `AttemptPreview.schedulingWindowState`/`exam.schedulingEnabled`/`exam.availabilityWindowStart`/`exam.availabilityWindowEnd` from Task 5's types (mirroring Task 4's backend response).
- Produces: nothing consumed by later tasks (last frontend screen task).

- [ ] **Step 1: Check for an existing `page.test.tsx`**

Run: `find "apps/web/app/(candidate)/welcome" -iname "page.test.tsx"`
If it exists, read it fully to match its existing mock conventions (for `useAttemptQuery`, `useStartAttempt`, `useCandidateAuth`, `useRouter`) before inserting the tests below. If not, create it fresh mirroring the mock conventions already established in `apps/web/app/(candidate)/exam/page.test.tsx` for the same hooks.

- [ ] **Step 2: Write the failing tests**

```tsx
  it('shows a waiting message with the open time when schedulingWindowState is not_open', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: {
        exam: {
          title: 'Scheduled Exam', instructions: null, durationMinutes: 60,
          schedulingEnabled: true, availabilityWindowStart: '2026-07-20T09:00:00.000Z', availabilityWindowEnd: '2026-07-27T18:00:00.000Z',
        },
        schedulingWindowState: 'not_open',
      },
      isLoading: false, isError: false,
    });

    render(<CandidateWelcomePage />);

    expect(screen.getByText(/opens on/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start exam' })).not.toBeInTheDocument();
  });

  it('shows a closed message when schedulingWindowState is closed', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: {
        exam: {
          title: 'Scheduled Exam', instructions: null, durationMinutes: 60,
          schedulingEnabled: true, availabilityWindowStart: '2026-07-01T09:00:00.000Z', availabilityWindowEnd: '2026-07-02T18:00:00.000Z',
        },
        schedulingWindowState: 'closed',
      },
      isLoading: false, isError: false,
    });

    render(<CandidateWelcomePage />);

    expect(screen.getByText(/availability window has closed/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start exam' })).not.toBeInTheDocument();
  });

  it('shows the normal Start button when schedulingWindowState is open', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: {
        exam: {
          title: 'Scheduled Exam', instructions: null, durationMinutes: 60,
          schedulingEnabled: true, availabilityWindowStart: '2026-07-01T09:00:00.000Z', availabilityWindowEnd: '2026-12-31T18:00:00.000Z',
        },
        schedulingWindowState: 'open',
      },
      isLoading: false, isError: false,
    });

    render(<CandidateWelcomePage />);

    expect(screen.getByRole('button', { name: 'Start exam' })).toBeInTheDocument();
  });

  it('shows the normal Start button when schedulingWindowState is null (non-scheduled exam)', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: {
        exam: { title: 'Normal Exam', instructions: null, durationMinutes: 60, schedulingEnabled: false, availabilityWindowStart: null, availabilityWindowEnd: null },
        schedulingWindowState: null,
      },
      isLoading: false, isError: false,
    });

    render(<CandidateWelcomePage />);

    expect(screen.getByRole('button', { name: 'Start exam' })).toBeInTheDocument();
  });
```

(Match the exact mock setup for `useStartAttempt`/`useCandidateAuth`/`useRouter`/`useToast` already established by this file's existing tests or by `exam/page.test.tsx`'s convention for the same hooks — every existing test in this file must continue passing unmodified.)

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/web && npx jest "app/(candidate)/welcome/page.test.tsx"`
Expected: FAIL — the page currently always renders the Start button regardless of `schedulingWindowState`.

- [ ] **Step 4: Implement**

Replace the full contents of `apps/web/app/(candidate)/welcome/page.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CandidateButton } from '../components/CandidateButton';
import { useAttemptQuery, useStartAttempt } from '../../../lib/hooks/useAttempt';
import { isAttemptStarted } from '../../../lib/types';
import { useToast } from '../../../components/ui';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';

export default function CandidateWelcomePage() {
  const router = useRouter();
  const { accessToken, isLoading: authLoading } = useCandidateAuth();
  const { data: current, isLoading, isError } = useAttemptQuery();
  const startAttempt = useStartAttempt();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && !accessToken) {
      router.push('/session-ended');
    } else if (isError) {
      router.push('/session-ended');
    } else if (current && isAttemptStarted(current) && current.status !== 'in_progress') {
      router.push('/submitted');
    } else if (current && isAttemptStarted(current)) {
      router.push('/exam');
    }
  }, [current, isError, router, accessToken, authLoading]);

  if (isLoading || isError || !current || isAttemptStarted(current)) {
    return <p className="p-8 text-sm text-gray-500">Loading…</p>;
  }

  async function handleStart() {
    try {
      await startAttempt.mutateAsync();
      router.push('/exam');
    } catch {
      toast("Couldn't start the exam — please check your connection and try again.", 'error');
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-8">
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-gray-900">{current.exam.title}</h1>
        <p className="mb-4 text-sm text-gray-600">Duration: {current.exam.durationMinutes} minutes</p>
        {current.exam.instructions && <p className="mb-4 whitespace-pre-wrap text-sm text-gray-700">{current.exam.instructions}</p>}
        {current.schedulingWindowState === 'not_open' ? (
          <div className="rounded-md bg-gray-50 p-3 text-sm text-gray-700">
            This exam opens on {new Date(current.exam.availabilityWindowStart as string).toLocaleString()}. Come back then to start.
          </div>
        ) : current.schedulingWindowState === 'closed' ? (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            This exam's availability window has closed. Please contact the recruiter who invited you.
          </div>
        ) : (
          <>
            <div className="mb-6 rounded-md bg-candidate-review-bg p-3 text-xs text-candidate-review">
              This exam is monitored. Tab switches, exiting fullscreen, copy/paste, right-click, and developer tools will be
              reported.
            </div>
            <CandidateButton onClick={handleStart} disabled={startAttempt.isPending} className="w-full">
              {startAttempt.isPending ? 'Starting…' : 'Start exam'}
            </CandidateButton>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/web && npx jest "app/(candidate)/welcome/page.test.tsx"`
Expected: all tests pass, including the 4 new ones and every pre-existing test in this file (the proctoring-notice + Start button block only moved inside the `else` branch of the new conditional — unchanged for the `open`/`null` cases).

- [ ] **Step 6: Run the full apps/web unit suite**

Run: `cd apps/web && npm test`
Expected: all suites pass.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/(candidate)/welcome/page.tsx" "apps/web/app/(candidate)/welcome/page.test.tsx"
git commit -m "feat: candidate welcome screen waiting/closed states for scheduled exams"
```

---

### Task 7: Playwright end-to-end scenario

**Files:**
- Create: `apps/web/e2e/exam-scheduling-golden-path.spec.ts`

**Interfaces:**
- Consumes: the recruiter exam-creation flow (existing pattern from `apps/web/e2e/recruiter-golden-path.spec.ts`), the candidate start flow (existing pattern from `apps/web/e2e/candidate-golden-path.spec.ts`), and the new scheduling fields/screens from Tasks 5-6.
- Produces: end-to-end proof that a real candidate is blocked from starting before the window opens and can start once a recruiter's edit opens it — the one thing only a real time-dependent browser flow proves.

- [ ] **Step 1: Write the e2e spec**

Read `apps/web/e2e/recruiter-golden-path.spec.ts` and `apps/web/e2e/candidate-golden-path.spec.ts` first to confirm this project's real selectors for login, exam creation, section/question setup, publishing, candidate creation, and invitation sending — the exact selector names below are a best-effort based on this project's established conventions and must be verified/adapted against the real components before use (the previous feature in this project found 2 selector mismatches this same way and fixed them by reading the real DOM first — do the same here).

Create `apps/web/e2e/exam-scheduling-golden-path.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const ORG_SLUG = process.env.E2E_ORG_SLUG ?? 'demo-org';
const RECRUITER_EMAIL = process.env.E2E_RECRUITER_EMAIL ?? 'recruiter@demo-org.test';
const RECRUITER_PASSWORD = process.env.E2E_RECRUITER_PASSWORD ?? 'Passw0rd!2026';

test('candidate is blocked before the window opens and can start once the recruiter opens it', async ({ page, browser }) => {
  await page.goto('/login');
  await page.getByLabel('Organization slug').fill(ORG_SLUG);
  await page.getByLabel('Email').fill(RECRUITER_EMAIL);
  await page.getByLabel('Password').fill(RECRUITER_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('link', { name: 'Question Bank' }).click();
  await page.getByRole('link', { name: 'New question' }).click();
  await page.getByLabel('Question type').selectOption('single_mcq');
  await page.getByLabel('Question text').fill('What is 2 + 2?');
  await page.getByLabel('Marks', { exact: true }).fill('10');
  await page.getByLabel('Option 1 text').fill('4');
  await page.getByRole('radiogroup').getByLabel('Option 1 correct').click();
  await page.getByLabel('Option 2 text').fill('5');
  await page.getByRole('button', { name: 'Create question' }).click();
  await expect(page).toHaveURL(/\/questions$/);

  await page.getByRole('link', { name: 'Exams' }).click();
  await page.getByRole('link', { name: 'New exam' }).click();
  const examTitle = `Scheduling Golden Path Exam ${Date.now()}`;
  await page.getByLabel('Title').fill(examTitle);
  await page.getByLabel('Enable scheduling').click();
  const inOneMinute = new Date(Date.now() + 60 * 1000);
  const inOneHour = new Date(Date.now() + 60 * 60 * 1000);
  await page.getByLabel('Window opens').fill(toLocalInputValue(inOneMinute));
  await page.getByLabel('Window closes').fill(toLocalInputValue(inOneHour));
  await page.getByRole('button', { name: 'Create exam' }).click();
  await expect(page).toHaveURL(/\/exams\/.+\/edit$/);
  const examUrl = page.url();
  const examId = examUrl.match(/\/exams\/([^/]+)\/edit/)?.[1];

  await page.getByRole('tab', { name: 'Sections & Questions' }).click();
  await page.getByLabel('New section title').fill('Section One');
  await page.getByRole('button', { name: 'Add section' }).click();
  await page.getByRole('button', { name: 'Manage questions' }).click();
  await page.getByRole('checkbox', { name: /What is 2 \+ 2\?/ }).first().click();
  await page.getByRole('button', { name: 'Save questions' }).click();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page).toHaveURL(/\/exams$/);

  await page.getByRole('link', { name: 'Candidates' }).click();
  const candidateEmail = `scheduling-golden-path-${Date.now()}@example.com`;
  await page.getByLabel('Name').fill('Scheduling Candidate');
  await page.getByLabel('Email').fill(candidateEmail);
  await page.getByRole('button', { name: 'Add candidate' }).click();
  await expect(page.getByText(candidateEmail)).toBeVisible();

  await page.getByLabel('Exam to invite to').click();
  await page.getByRole('option', { name: examTitle, exact: true }).click();
  await page.getByRole('row', { name: candidateEmail }).getByRole('checkbox', { name: 'Scheduling Candidate' }).click();
  const invitePromise = page.waitForResponse((response) => response.url().includes('/invitations') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Send invitations' }).click();
  const inviteResponse = await invitePromise;
  const inviteToken: string = (await inviteResponse.json()).created[0].token;

  const candidateContext = await browser.newContext();
  const candidatePage = await candidateContext.newPage();
  await candidatePage.goto(`/start?token=${inviteToken}`);
  await expect(candidatePage).toHaveURL(/\/welcome/);
  await expect(candidatePage.getByText(/opens on/i)).toBeVisible();
  await expect(candidatePage.getByRole('button', { name: 'Start exam' })).not.toBeVisible();

  await page.goto(`${examUrl}`);
  await page.getByLabel('Window opens').fill(toLocalInputValue(new Date(Date.now() - 60 * 1000)));
  await page.getByRole('button', { name: 'Save' }).click();

  await candidatePage.waitForTimeout(31_000);
  await candidatePage.reload();
  await expect(candidatePage.getByRole('button', { name: 'Start exam' })).toBeVisible({ timeout: 10_000 });
  await candidatePage.getByRole('button', { name: 'Start exam' }).click();
  await expect(candidatePage).toHaveURL(/\/exam/);

  await candidateContext.close();
});

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
```

(The `waitForTimeout(31_000)` matches this app's existing 30-second attempt-preview polling interval — read `apps/web/lib/hooks/useAttempt.ts`'s `useAttemptQuery()` to confirm the exact `refetchInterval` value before finalizing this wait, and adjust the number if it differs. The explicit `reload()` after the wait guarantees the state is fresh even if a background refetch's timing is imprecise, rather than relying solely on the interval.)

- [ ] **Step 2: Confirm dev servers and run the spec**

Ensure `apps/api`, `apps/exam-runtime`, and `apps/web` dev servers are running (see this project's documented Docker/WSL2 port-reclaim workaround if the default ports are unavailable, and the documented `STRICT_AUTH_THROTTLE`/`NODE_ENV=test` workaround if this spec's `page.goto` reload triggers unexpected logouts).

Run: `cd apps/web && timeout 180 npx playwright test e2e/exam-scheduling-golden-path.spec.ts`
Expected: `1 passed`.

- [ ] **Step 3: Run it a second time to confirm it isn't flaky**

Run: `cd apps/web && timeout 180 npx playwright test e2e/exam-scheduling-golden-path.spec.ts`
Expected: `1 passed`, consistent with the first run.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/exam-scheduling-golden-path.spec.ts
git commit -m "test: Playwright exam scheduling golden-path e2e spec"
```

---

### Task 8: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full backend suites**

Run from repo root: `npm run test:api && npm run test:api:e2e && npm run test:exam-runtime && npm run test:shared`
Expected: all pass, including every new test from Tasks 1-4. The pre-existing `ai-question-generation.e2e-spec.ts` flake (missing `ANTHROPIC_API_KEY` in this dev environment) is documented and unrelated.

- [ ] **Step 2: Full frontend unit suite**

Run: `cd apps/web && npm test`
Expected: all suites pass, including every new test from Tasks 5-6.

- [ ] **Step 3: Full Playwright suite**

Run: `cd apps/web && npx playwright test`
Expected: every existing golden path plus the new `exam-scheduling-golden-path.spec.ts` all pass.

- [ ] **Step 4: Manual smoke check**

With dev servers running: as recruiter, create an exam with scheduling enabled and a window starting a few minutes out, publish it, invite a candidate. As that candidate (second browser/incognito), redeem the invite and confirm the "opens on [time]" waiting screen renders with no Start button. Edit the exam's window (as recruiter) to open immediately, reload the candidate's welcome page, and confirm the normal Start button now appears and the exam can be completed normally. As a second candidate who never starts, confirm that once the recruiter closes the window entirely, that candidate's `GET /attempt/current` reflects `'closed'` and their `POST /attempt/start` is rejected.

- [ ] **Step 5: Update the SDD progress ledger**

Append to `.superpowers/sdd/progress.md`:

```
## Exam Scheduling
Task 1: complete (schema — Exam.schedulingEnabled/availabilityWindowStart/availabilityWindowEnd)
Task 2: complete (exam create/update validation, DTOs, invitation re-sync on window edit)
Task 3: complete (invitation expiry follows the scheduled window)
Task 4: complete (candidate-facing enforcement — start gate, preview window state — + e2e)
Task 5: complete (frontend types + ExamDetailsForm scheduling fields)
Task 6: complete (candidate welcome screen waiting/closed states)
Task 7: complete (Playwright exam scheduling golden-path e2e)
Task 8: complete (final verification)
```
