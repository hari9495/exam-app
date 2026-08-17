# Hiring Drives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn walk-in registration (36% of candidate volume) into a first-class product: a dated **Drive Session** against the existing reusable **Walk-In Group**, with a live operational board and a post-drive results table.

**Architecture:** One new table (`DriveSession`) and one new nullable FK (`Invitation.driveSessionId`). Registration during a live session stamps the FK; the board is a single scoped read whose per-row state is derived by a pure function. Polling, not websockets.

**Tech Stack:** NestJS 11, Prisma, Azure SQL, Next.js 16, React Query, Jest.

**Spec:** `docs/superpowers/specs/2026-08-15-hiring-drives-design.md`

## Global Constraints

- **Additive only to the candidate flow.** Walk-in registration without a live drive must behave exactly as it does today. The drive layer never changes an existing candidate-facing outcome.
- **Status is derived, never stored** — `scheduled`/`live`/`ended` computed from `[startsAt, endsAt]` vs `now` (UTC). No cron, no status column.
- **Registration IS check-in** — no separate check-in step or state.
- `deriveDriveState` is **pure** (`(attempt, result) → state`), DB-free, five states: `registered | in_progress | submitted | passed | failed`. "Did not attempt" is a *presentation* relabel of `registered` on an ended drive, not a sixth state.
- **No overlapping live sessions per group** — enforced at creation.
- No new role: recruiters and org-admins of the owning org, RLS-scoped like every other query.
- One migration; apply with `migrate status` → `migrate deploy` → verify.
- Baselines: api 900, exam-runtime 713, web per CI.

## Key context for every implementer

- **`Attempt` is 1:1 optional on `Invitation`** (`invitation.attempt`), and `Result` is 1:1 on `Attempt`. So a roster row is `invitation → attempt? → result?`.
- **The walk-in register path already exists** at `apps/api/src/walk-in/walk-in.service.ts:92` (`register()`), and reuses a live invitation when one exists. The stamp must cover BOTH the create branch and the reuse branch.
- **`bulkInvite`** is `apps/api/src/invitations/invitations.service.ts:138` — `bulkInvite(context, examId, candidateIds, advancedFromExamId?)`.
- **`WalkInGroup`** (`walk_in_groups`) is the style reference for the new model: uuid id, `organizationId`, `@@unique([organizationId, name])`, `@@map`.
- Migrations live in `apps/api/prisma/migrations/`; a SQL-Server gotcha: **a statement referencing a column added by an earlier `ALTER` in the same migration fails at batch-compile** — keep the table create and the column add in one file only if they don't cross-reference (they don't here: the FK column references the new table, so create the table FIRST in the file, then the column).

## File Structure

**Create:**
- `apps/api/src/drives/derive-drive-state.ts` + `.spec.ts` — the pure function.
- `apps/api/src/drives/drives.service.ts` + `.spec.ts` — create / list / liveRoster / results.
- `apps/api/src/drives/drives.controller.ts` + `.spec.ts`.
- `apps/api/src/drives/drives.module.ts`.
- `apps/api/src/drives/dto/create-drive.dto.ts`.
- `apps/web/lib/hooks/useDrives.ts` — hooks (list, live roster with polling, results).
- `apps/web/components/drives/DriveLiveBoard.tsx` + test.
- `apps/web/components/drives/DriveResults.tsx` + test.
- `apps/web/app/(recruiter)/walk-in-groups/[groupId]/drives/page.tsx` — drive list + schedule.
- `apps/web/app/(recruiter)/drives/[driveId]/page.tsx` — the board / results surface.

**Modify:**
- `apps/api/prisma/schema.prisma` — `DriveSession` model, `Invitation.driveSessionId`, back-relations.
- `apps/api/src/walk-in/walk-in.service.ts` — stamp on register (both branches).
- `apps/api/src/invitations/invitations.service.ts` — `bulkInvite` optional `driveSessionId`.
- `apps/api/src/app.module.ts` — register `DrivesModule`.
- `apps/web/lib/types.ts` — drive DTO types.

---

### Task 1: Schema + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_hiring_drives/migration.sql`

**Interfaces:**
- Produces: `DriveSession` model and `Invitation.driveSessionId`, consumed by every later task.

- [ ] **Step 1: Add the model and column to `schema.prisma`**

After the `WalkInGroup` model, add:

```prisma
model DriveSession {
  id             String       @id @default(uuid()) @db.UniqueIdentifier
  organizationId String       @map("organization_id") @db.UniqueIdentifier
  walkInGroupId  String       @map("walk_in_group_id") @db.UniqueIdentifier
  name           String
  startsAt       DateTime     @map("starts_at")
  endsAt         DateTime     @map("ends_at")
  createdAt      DateTime     @default(now()) @map("created_at")
  walkInGroup    WalkInGroup  @relation(fields: [walkInGroupId], references: [id])
  invitations    Invitation[]

  @@index([walkInGroupId])
  @@map("drive_sessions")
}
```

Add the back-relation to `WalkInGroup`: `driveSessions DriveSession[]`.

The group FK deliberately does **not** cascade: the spec requires deleting a group with drives to be *blocked*, not to silently delete history. The default (restrict) FK enforces that at the DB, and Task 4 adds the friendly service-level guard.

In `Invitation`, add the FK column and relation:

```prisma
  driveSessionId         String?                 @map("drive_session_id") @db.UniqueIdentifier
  driveSession           DriveSession?           @relation(fields: [driveSessionId], references: [id], onDelete: SetNull)
```

- [ ] **Step 2: Generate the migration SQL**

Because production is applied with `migrate deploy` (not `db push`), author the migration file. Create `apps/api/prisma/migrations/<YYYYMMDDHHMMSS>_hiring_drives/migration.sql`:

```sql
CREATE TABLE [drive_sessions] (
  [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [drive_sessions_id_df] DEFAULT newid(),
  [organization_id] UNIQUEIDENTIFIER NOT NULL,
  [walk_in_group_id] UNIQUEIDENTIFIER NOT NULL,
  [name] NVARCHAR(1000) NOT NULL,
  [starts_at] DATETIME2 NOT NULL,
  [ends_at] DATETIME2 NOT NULL,
  [created_at] DATETIME2 NOT NULL CONSTRAINT [drive_sessions_created_at_df] DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT [drive_sessions_pkey] PRIMARY KEY CLUSTERED ([id]),
  CONSTRAINT [drive_sessions_walk_in_group_id_fkey] FOREIGN KEY ([walk_in_group_id]) REFERENCES [walk_in_groups]([id])
);
CREATE NONCLUSTERED INDEX [drive_sessions_walk_in_group_id_idx] ON [drive_sessions]([walk_in_group_id]);

ALTER TABLE [invitations] ADD [drive_session_id] UNIQUEIDENTIFIER NULL;
ALTER TABLE [invitations] ADD CONSTRAINT [invitations_drive_session_id_fkey] FOREIGN KEY ([drive_session_id]) REFERENCES [drive_sessions]([id]) ON DELETE SET NULL;
```

(The table is created before the column that references it — no cross-batch compile issue. Match the exact SQL dialect of an existing migration file in the folder; copy its `CONSTRAINT`/quoting style verbatim if it differs.)

- [ ] **Step 3: Apply locally and generate the client**

```bash
DB_URL=... npx prisma migrate status --schema=apps/api/prisma/schema.prisma
DB_URL=... npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma
npx prisma generate --schema=apps/api/prisma/schema.prisma
```

Expected: status shows exactly one pending before deploy, none after. If no local DB is available, run `npx prisma validate` and `npx prisma generate` and note in the report that DB apply is deferred to deploy.

- [ ] **Step 4: Typecheck**

`npx tsc --noEmit -p apps/api/tsconfig.json` — the generated client must expose `driveSession` / `driveSessionId`. Clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(drives): DriveSession table + Invitation.driveSessionId"
```

---

### Task 2: The pure `deriveDriveState` function

**Files:**
- Create: `apps/api/src/drives/derive-drive-state.ts`
- Test: `apps/api/src/drives/derive-drive-state.spec.ts`

**Interfaces:**
- Produces:
```ts
export type DriveState = 'registered' | 'in_progress' | 'submitted' | 'passed' | 'failed';
export function deriveDriveState(
  attempt: { status: string; submittedAt: Date | null } | null,
  result: { passFail: string | null } | null,
): DriveState;
```

- [ ] **Step 1: Write the failing tests**

```ts
import { deriveDriveState } from './derive-drive-state';

describe('deriveDriveState', () => {
  it('registered when there is no attempt', () => {
    expect(deriveDriveState(null, null)).toBe('registered');
  });
  it('in_progress when the attempt is in progress', () => {
    expect(deriveDriveState({ status: 'in_progress', submittedAt: null }, null)).toBe('in_progress');
  });
  it('submitted when submitted but not yet graded', () => {
    expect(deriveDriveState({ status: 'submitted', submittedAt: new Date() }, null)).toBe('submitted');
  });
  it('passed / failed from the result, regardless of attempt status', () => {
    expect(deriveDriveState({ status: 'submitted', submittedAt: new Date() }, { passFail: 'pass' })).toBe('passed');
    expect(deriveDriveState({ status: 'submitted', submittedAt: new Date() }, { passFail: 'fail' })).toBe('failed');
  });
  it('a result with null passFail (pending manual grade) reads as submitted, not passed', () => {
    // A code question pending manual grade produces a Result with passFail null. That is not a
    // verdict yet, so the board must not show it as passed/failed.
    expect(deriveDriveState({ status: 'submitted', submittedAt: new Date() }, { passFail: null })).toBe('submitted');
  });
});
```

- [ ] **Step 2: Run to verify they fail** — `npx jest --config apps/api/jest.config.js --testPathPattern derive-drive-state` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
export type DriveState = 'registered' | 'in_progress' | 'submitted' | 'passed' | 'failed';

// Pure and DB-free: the board's whole correctness lives here. Result WINS over attempt status
// because a graded verdict is the final word -- but a Result whose passFail is still null
// (a code question pending manual grade) is not a verdict, so it falls through to submitted.
export function deriveDriveState(
  attempt: { status: string; submittedAt: Date | null } | null,
  result: { passFail: string | null } | null,
): DriveState {
  if (result?.passFail === 'pass') return 'passed';
  if (result?.passFail === 'fail') return 'failed';
  if (!attempt) return 'registered';
  if (attempt.status === 'in_progress') return 'in_progress';
  if (attempt.submittedAt) return 'submitted';
  return 'in_progress';
}
```

- [ ] **Step 4: Run to verify they pass.** Then `npx tsc --noEmit -p apps/api/tsconfig.json`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/drives/derive-drive-state.ts apps/api/src/drives/derive-drive-state.spec.ts
git commit -m "feat(drives): pure deriveDriveState state machine"
```

---

### Task 3: DrivesService + controller + module

**Files:**
- Create: `apps/api/src/drives/drives.service.ts` (+spec), `drives.controller.ts` (+spec), `drives.module.ts`, `dto/create-drive.dto.ts`
- Modify: `apps/api/src/app.module.ts` (register `DrivesModule`)

**Interfaces:**
- Consumes: `deriveDriveState` (Task 2), `TenantPrismaService`, `AuditService`.
- Produces routes: `POST /walk-in-groups/:groupId/drives`, `GET /walk-in-groups/:groupId/drives`, `GET /drives/:id/live`, `GET /drives/:id/results` (all authenticated, org-scoped).

- [ ] **Step 1: DTO**

```ts
import { IsISO8601, IsString, MinLength, MaxLength } from 'class-validator';
export class CreateDriveDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsISO8601() startsAt!: string;
  @IsISO8601() endsAt!: string;
}
```

- [ ] **Step 2: Write the failing service tests**

Cover, using the suite idiom in `walk-in-groups.service.spec.ts` (mock `tenantPrisma.forTenant` to run its callback against a mock `tx`):

1. **create** validates `endsAt > startsAt` (else `BadRequestException`), and **rejects an overlapping live window** for the same group — a new `[startsAt,endsAt]` that intersects an existing session's window throws `BadRequestException`. Two non-overlapping windows both succeed.
2. **create** writes the row scoped to the group's org and audits `drive.created`.
3. **liveRoster** maps each invitation's `(attempt, result)` through `deriveDriveState` and returns roster rows + counts `{ registered, inProgress, submitted, passed, failed }`. Feed a mix; assert the counts.
4. **results** returns the same roster; assert it includes candidates with no attempt (they are the future "did not attempt").

- [ ] **Step 3: Implement the service**

Key methods (follow the tenant/audit patterns already in `walk-in-groups.service.ts`):

- `create(context, actorUserId, groupId, dto)`: verify the group belongs to the org; parse `startsAt`/`endsAt`; reject if `endsAt <= startsAt`; **overlap check** — `findFirst` a `driveSession` for `walkInGroupId = groupId` where `startsAt < newEndsAt AND endsAt > newStartsAt`; if found, `BadRequestException('This group already has a drive scheduled in that window')`; create; audit `drive.created`.
- `listForGroup(context, groupId)`: the group's sessions, each with a derived `status` field computed in JS from the window vs `new Date()`.
- `liveRoster(context, driveId)`: load the drive (org-scoped) → its invitations with `include: { candidate: true, attempt: { include: { result: true } }, exam: { select: { title: true } } }` → map to `{ candidateName, examTitle, state: deriveDriveState(inv.attempt, inv.attempt?.result), startedAt, score }` → also return grouped counts.
- `results(context, driveId)`: the same roster; the presentation relabel (`registered` → "did not attempt") is the FRONTEND's job on an ended drive, not here.

`Attempt` carries score via its `Result`; read `result.percentage` for the score column.

- [ ] **Step 4: Controller + module + registration**

Controller methods delegate to the service, `@UseGuards(JwtAuthGuard, PermissionsGuard)` matching the recruiter guards on `walk-in-groups.controller.ts`. Register `DrivesModule` in `app.module.ts`.

- [ ] **Step 5: Run tests + typecheck.** Full api suite must stay green; report the new count.

- [ ] **Step 6: Verify the routes mount** — after wiring, a quick unit assert or a note that `GET /drives/:id/live` returns 401 unauthenticated (mounted behind the guard, not 404).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/drives apps/api/src/app.module.ts
git commit -m "feat(drives): service, controller, module — create/list/liveRoster/results"
```

---

### Task 4: Stamp `driveSessionId` on registration and pre-invite

**Files:**
- Modify: `apps/api/src/walk-in/walk-in.service.ts`, `apps/api/src/invitations/invitations.service.ts`, `apps/api/src/walk-in-groups/walk-in-groups.service.ts`
- Test: the three services' specs

**Interfaces:**
- Consumes: Task 1's column.
- Produces: no signature change to `register()`; `bulkInvite` gains an optional trailing `driveSessionId?: string`.

**This is the only task touching the candidate-facing flow. Treat it as such.**

- [ ] **Step 1: Failing tests (walk-in)**

In `walk-in.service.spec.ts`:
1. **A registration during a LIVE session stamps `driveSessionId`.** Mock a `driveSession` row for the exam's group with `startsAt ≤ now ≤ endsAt`; assert the created invitation carries its id.
2. **No live session → no stamp, behaviour unchanged.** No matching session → `driveSessionId` is null/absent, and every existing assertion in the file still holds.
3. **The reuse branch also stamps** — when a live invitation already exists for the candidate, it is (a) returned as today, and (b) if unstamped and a session is now live, stamped. (If the team prefers to leave an already-created invitation untouched, encode THAT as the test instead and note it — but pick one explicitly.)

- [ ] **Step 2: Implement (walk-in)**

In `register()`, after resolving the exam (which carries `walkInGroupId`), before creating the invitation: if `exam.walkInGroupId`, `findFirst` a `driveSession` for that group where `startsAt <= now && endsAt >= now`; keep its id. Pass `driveSessionId: liveSession?.id ?? null` into the invitation `create`, and into the reuse-branch update per the decision in Step 1.

- [ ] **Step 3: Mutation check** — delete the live-session lookup (force `driveSessionId` null). Test 1 must fail. Restore; report the failure.

- [ ] **Step 4: bulkInvite passthrough**

Add optional `driveSessionId?: string` as the trailing param; thread it into the invitation `create`. One test: passing it stamps every created invitation; omitting it leaves the column null (existing behaviour). Do NOT change the existing call sites' behaviour.

- [ ] **Step 5: Block deleting a group that still has drives**

The spec requires this to be blocked, not silently cascaded. In `apps/api/src/walk-in-groups/walk-in-groups.service.ts`, in `remove()`, before deleting: `count` the group's `driveSession` rows; if any exist, throw `BadRequestException('This group has drives and cannot be deleted. Delete its drives first.')`. Test: `remove()` on a group with a drive throws and deletes nothing; on a group with none, it still succeeds as today. (The non-cascading FK is the DB-level backstop; this is the friendly message.)

- [ ] **Step 6: Run both services' suites + typecheck. Commit.**

```bash
git add apps/api/src/walk-in apps/api/src/invitations apps/api/src/walk-in-groups
git commit -m "feat(drives): stamp driveSessionId on live registration/pre-invite; block deleting a group with drives"
```

---

### Task 5: Frontend — drive setup and list

**Files:**
- Create: `apps/web/lib/hooks/useDrives.ts`, `apps/web/app/(recruiter)/walk-in-groups/[groupId]/drives/page.tsx`
- Modify: `apps/web/lib/types.ts`

**Interfaces:**
- Consumes: `POST/GET /walk-in-groups/:groupId/drives`.
- Produces: `useGroupDrives(groupId)`, `useCreateDrive(groupId)`.

- [ ] **Step 1: Types + hooks**

Add `DriveSession` / `DriveListItem` types to `types.ts` (`id, name, startsAt, endsAt, status`). In `useDrives.ts`, follow the `useDashboard.ts` / `useExams.ts` idiom (`apiFetch`, `useQuery`/`useMutation`, `accessToken`).

- [ ] **Step 2: The page**

From a Walk-In Group, a "Schedule a drive" form (name, start, end — native `datetime-local`, the platform-feature-over-library rule) and a list of that group's drives with their derived status badge (Scheduled / Live / Ended) and a link to the drive surface (Task 6). Follow the existing `walk-in-groups/page.tsx` layout and `Card`/`Button` components. Client-side validation: end after start.

- [ ] **Step 3: Tests** — the page renders the list, the form creates a drive (mutation fires with the right body), and the status badge reflects the window. Follow the existing recruiter page test idiom. Run the single test file (not the full web suite — locally flaky).

- [ ] **Step 4: Typecheck + commit.**

```bash
git add "apps/web/lib/hooks/useDrives.ts" "apps/web/app/(recruiter)/walk-in-groups" apps/web/lib/types.ts
git commit -m "feat(drives): schedule + list drives from a walk-in group"
```

---

### Task 6: Frontend — live board and results

**Files:**
- Create: `apps/web/components/drives/DriveLiveBoard.tsx` (+test), `apps/web/components/drives/DriveResults.tsx` (+test), `apps/web/app/(recruiter)/drives/[driveId]/page.tsx`
- Modify: `apps/web/lib/hooks/useDrives.ts` (add live + results hooks)

**Interfaces:**
- Consumes: `GET /drives/:id/live`, `GET /drives/:id/results`.

- [ ] **Step 1: Hooks**

`useDriveLive(driveId)` — `useQuery` with `refetchInterval: 5000` (the board's polling). `useDriveResults(driveId)` — plain `useQuery`, no interval.

- [ ] **Step 2: The drive page**

`drives/[driveId]/page.tsx`: fetch the drive; if its window is `live` (or `scheduled`), render `<DriveLiveBoard>`; if `ended`, render `<DriveResults>`. The status comes from the drive record.

- [ ] **Step 3: `DriveLiveBoard` (design A — grouped by state)**

A four-count strip (Registered / In progress / Submitted / Passed) over chips grouped by state, polling via `useDriveLive`. Each chip links to the candidate's existing report route. Loading and error states follow the app's card idioms. Tests: renders the counts, groups chips by state, and each chip links to the right report.

- [ ] **Step 4: `DriveResults` (design B — table)**

A sortable, searchable table: candidate, exam, state (with `registered` **relabelled "Did not attempt"** here, since the drive has ended), time, score; a CSV export button hitting the results endpoint (reuse `apiFetchBlob`). Tests: table sorts, the relabel shows for a no-attempt row, and a row links to the report.

- [ ] **Step 5: Typecheck + the component tests. Commit.**

```bash
git add apps/web/components/drives "apps/web/app/(recruiter)/drives" apps/web/lib/hooks/useDrives.ts
git commit -m "feat(drives): live board (grouped-by-state, polling) + results table"
```

---

### Task 7: Full verification

**Files:** none. Deploy is NOT part of this plan.

- [ ] **Step 1: Suites + typechecks**

```bash
npm run build --workspace=packages/shared
npx jest --config apps/api/jest.config.js
npx tsc --noEmit -p apps/api/tsconfig.json
npx tsc --noEmit -p apps/web/tsconfig.json
npx jest --config apps/web/jest.config.js -- --maxWorkers=2 --testPathPattern "drives|useDrives"
```

api baseline 900 + this plan's additions — report the number. exam-runtime is untouched (confirm with `git diff main --stat -- apps/exam-runtime/`, expected empty).

- [ ] **Step 2: Confirm the candidate flow is unchanged**

Run the walk-in service suite and confirm every pre-existing test passes unmodified — the additive-only constraint. Grep that no existing `register()` assertion was weakened.

- [ ] **Step 3: Mutation-check recap** — confirm the two mutation checks (Task 2 not needed; Task 4 register-stamp) were recorded with their observed failures.

- [ ] **Step 4: Record** suite counts and the settlement/exam-runtime diff check to `.superpowers/sdd/progress.md`.

**At deploy time (not now):** one migration (`migrate status` → `migrate deploy` → verify the two DDL objects exist), then api + web build. exam-runtime untouched. Post-deploy read-only check: create a real drive against an existing group, register one test candidate through the kiosk, watch the state advance Registered → In progress → Submitted on the board, then delete the test data; confirm the 116 historical walk-ins stay off every board.
