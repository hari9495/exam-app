# ATS-lite Candidate Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give recruiters a lightweight ATS pipeline — create jobs, move candidates through fixed stages on a board, link exams as an entry point, and record note+rating feedback.

**Architecture:** New `pipeline` NestJS module in `apps/api` shaped exactly like the existing `drives` module (`apps/api/src/drives/*` is the structural template for module/controller/service/DTO/tests). `PipelineEntry` is the single source of truth for a candidate's stage; the exam result shown on a card is *derived* at read time (same approach as `apps/api/src/drives/derive-drive-state.ts`), never stored. Frontend follows the recruiter drives pages (`apps/web/app/(recruiter)/drives/*`, `apps/web/components/drives/*`, `apps/web/lib/hooks/useDrives.ts`).

**Tech Stack:** NestJS 11, Prisma + Azure SQL (SQL Server), Next.js 16 (see `apps/web/AGENTS.md`), React Query, jest + Testing Library. Existing helpers: `TenantPrismaService.forTenant`, `AuditService.record`, `@RequirePermissions`, `@CurrentTenant`, `@CurrentUserId`.

## Global Constraints

- **Fixed stages (verbatim, ordered):** `applied`, `screened`, `interview`, `offer`, `hired`. `rejected` is a boolean *outcome flag*, NOT a sixth stage.
- **Manual movement only.** No auto-advance on exam results in v1. Exam results are displayed, never move a candidate.
- **Exam result is derived at read time**, never stored on the entry.
- **Entry points v1:** manual add + from-exam. Drive→job linking is OUT of scope.
- **Permissions:** `pipeline:manage` (structural writes) granted to `recruiter` + `org_admin`; feedback endpoints gated by `results:view` (adds `panel`).
- **`PipelineEntry` uniqueness:** `@@unique([jobId, candidateId])` — one entry per candidate per job. Manual add and the exam hook both UPSERT and **never overwrite an existing entry's `stage` or `enteredVia`** (stamp-if-absent).
- **Feedback:** at least one of `note`/`rating` required; `rating` is 1–5; append-only.
- **All new tables org-scoped:** every query filters `organizationId` explicitly inside `forTenant`, AND the migration adds each table to `dbo.TenantAccessPolicy` (the RLS pattern used by `candidates`/`exams`; `drive_sessions` skipped this and we are not repeating that gap).
- **SQL Server migration rule:** a statement referencing a column added by an earlier `ALTER` in the same file fails at batch compile; split if needed. `GO` is invalid. Watch for P1012 multiple-cascade-path.
- **Windows/Next.js:** do not remove the auto-generated block in `apps/web/AGENTS.md`; commit it if it appears in a diff.

---

## File Structure

**Backend (`apps/api/src/pipeline/` — new, mirrors `src/drives/`):**
- `pipeline-stages.ts` — `PIPELINE_STAGES` const array, `PipelineStage` type, `isValidStage()`.
- `derive-entry-exam-results.ts` — pure helper: candidate invitations × linked exams → `EntryExamResult[]`; plus `averageRating()`.
- `pipeline.service.ts` — jobs CRUD, board read, entries, exam links + backfill, feedback, `syncEntriesForInvitations` hook.
- `pipeline.controller.ts` — all routes with permission decorators.
- `pipeline.module.ts` — module (exports `PipelineService` so `InvitationsModule` can call the hook).
- `dto/create-job.dto.ts`, `dto/update-job.dto.ts`, `dto/add-entry.dto.ts`, `dto/patch-entry.dto.ts`, `dto/link-exam.dto.ts`, `dto/add-feedback.dto.ts`.
- `*.spec.ts` alongside each of stages / derive / service / controller.

**Backend modified:**
- `apps/api/prisma/schema.prisma` — 4 new models + back-relations on `Candidate` and `Exam`.
- `apps/api/prisma/migrations/20260818090000_ats_pipeline/migration.sql` — tables, FKs, RLS, permission seed.
- `apps/api/prisma/seed.ts` — add `pipeline:manage` to `PERMISSIONS` + `ROLE_PERMISSIONS`.
- `apps/api/src/app.module.ts` — register `PipelineModule`.
- `apps/api/src/invitations/invitations.service.ts` + `invitations.module.ts` — call `syncEntriesForInvitations` after bulkInvite; import `PipelineModule`.

**Frontend (`apps/web/`):**
- `lib/types.ts` — pipeline types.
- `lib/hooks/usePipeline.ts` — all React Query hooks.
- `app/(recruiter)/jobs/page.tsx` — jobs list + create.
- `app/(recruiter)/jobs/[jobId]/page.tsx` — job board page.
- `components/pipeline/PipelineBoard.tsx` — stage columns + cards + rejected tab.
- `components/pipeline/CandidateDrawer.tsx` — details + feedback timeline + compose.
- `components/pipeline/LinkedExams.tsx` — linked-exam chips + attach picker.
- `components/pipeline/AddCandidateModal.tsx` — pick existing / create new.
- Recruiter nav: add a "Jobs" link (find the existing sidebar/nav component the drives link lives in).
- `*.test.tsx` for board, drawer, hooks.

---

## Task 1: Schema, migration, permission seed

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260818090000_ats_pipeline/migration.sql`
- Modify: `apps/api/prisma/seed.ts`

**Interfaces:**
- Produces: Prisma models `Job`, `PipelineEntry`, `PipelineFeedback`, `JobExam`; permission key `pipeline:manage` granted to `recruiter` + `org_admin`.

- [ ] **Step 1: Add models to `schema.prisma`**

Append these models and add the two back-relations. Note `onUpdate: NoAction` on every FK (SQL Server + Prisma default `Cascade` on update causes multi-path errors — this is the exact fix used in the drives migration).

```prisma
model Job {
  id             String          @id @default(uuid()) @db.UniqueIdentifier
  organizationId String          @map("organization_id") @db.UniqueIdentifier
  title          String
  description    String?         @db.NVarChar(Max)
  status         String          @default("open")
  createdById    String          @map("created_by_id") @db.UniqueIdentifier
  createdAt      DateTime        @default(now()) @map("created_at")
  closedAt       DateTime?       @map("closed_at")
  entries        PipelineEntry[]
  examLinks      JobExam[]

  @@index([organizationId, status])
  @@map("jobs")
}

model PipelineEntry {
  id             String             @id @default(uuid()) @db.UniqueIdentifier
  organizationId String             @map("organization_id") @db.UniqueIdentifier
  jobId          String             @map("job_id") @db.UniqueIdentifier
  candidateId    String             @map("candidate_id") @db.UniqueIdentifier
  stage          String             @default("applied")
  rejected       Boolean            @default(false)
  rejectedReason String?            @map("rejected_reason")
  rejectedAt     DateTime?          @map("rejected_at")
  enteredVia     String             @map("entered_via")
  createdAt      DateTime           @default(now()) @map("created_at")
  updatedAt      DateTime           @updatedAt @map("updated_at")
  job            Job                @relation(fields: [jobId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  candidate      Candidate          @relation(fields: [candidateId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  feedback       PipelineFeedback[]

  @@unique([jobId, candidateId])
  @@index([jobId])
  @@map("pipeline_entries")
}

model PipelineFeedback {
  id             String        @id @default(uuid()) @db.UniqueIdentifier
  organizationId String        @map("organization_id") @db.UniqueIdentifier
  entryId        String        @map("entry_id") @db.UniqueIdentifier
  authorUserId   String        @map("author_user_id") @db.UniqueIdentifier
  note           String?       @db.NVarChar(Max)
  rating         Int?
  createdAt      DateTime      @default(now()) @map("created_at")
  entry          PipelineEntry @relation(fields: [entryId], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@index([entryId])
  @@map("pipeline_feedback")
}

model JobExam {
  id             String   @id @default(uuid()) @db.UniqueIdentifier
  organizationId String   @map("organization_id") @db.UniqueIdentifier
  jobId          String   @map("job_id") @db.UniqueIdentifier
  examId         String   @map("exam_id") @db.UniqueIdentifier
  createdAt      DateTime @default(now()) @map("created_at")
  job            Job      @relation(fields: [jobId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  exam           Exam     @relation(fields: [examId], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@unique([jobId, examId])
  @@index([examId])
  @@map("job_exams")
}
```

Add back-relations: in `model Candidate` add `pipelineEntries PipelineEntry[]`; in `model Exam` add `jobExams JobExam[]`.

- [ ] **Step 2: Add the permission to `seed.ts`**

In `PERMISSIONS` array add:
```ts
  { key: 'pipeline:manage', description: 'Create and manage hiring jobs and their candidate pipeline' },
```
In `ROLE_PERMISSIONS`, append `'pipeline:manage'` to both `org_admin` and `recruiter` arrays (NOT `panel` — panels only get feedback via the already-granted `results:view`).

- [ ] **Step 3: Generate the migration SQL, then hand-edit**

Run to scaffold (writes the CreateTable/FK SQL):
```bash
cd "D:/exam app" && DATABASE_URL="$LOCAL_DB_URL" npx prisma migrate dev --name ats_pipeline --create-only --schema=apps/api/prisma/schema.prisma
```
Then append to the generated `migration.sql` the RLS policy extension and the permission seed (idempotent, safe to re-run on production where `migrate deploy` runs it once):

```sql
-- Extend tenant RLS to the four new tables (same pattern as candidates_rls)
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.jobs,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.jobs AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.jobs AFTER UPDATE,
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.pipeline_entries,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.pipeline_entries AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.pipeline_entries AFTER UPDATE,
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.pipeline_feedback,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.pipeline_feedback AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.pipeline_feedback AFTER UPDATE,
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.job_exams,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.job_exams AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.job_exams AFTER UPDATE;

-- Seed the pipeline:manage permission + role grants for existing production orgs
-- (seed.ts does NOT run on deploy; role/permission tables are global, not org-scoped).
DECLARE @pipelinePermId UNIQUEIDENTIFIER = NEWID();
IF NOT EXISTS (SELECT 1 FROM dbo.permissions WHERE [key] = 'pipeline:manage')
  INSERT INTO dbo.permissions (id, [key], description)
  VALUES (@pipelinePermId, 'pipeline:manage', 'Create and manage hiring jobs and their candidate pipeline');

DECLARE @permId UNIQUEIDENTIFIER = (SELECT id FROM dbo.permissions WHERE [key] = 'pipeline:manage');
IF NOT EXISTS (SELECT 1 FROM dbo.role_permissions WHERE role = 'recruiter' AND permission_id = @permId)
  INSERT INTO dbo.role_permissions (role, permission_id) VALUES ('recruiter', @permId);
IF NOT EXISTS (SELECT 1 FROM dbo.role_permissions WHERE role = 'org_admin' AND permission_id = @permId)
  INSERT INTO dbo.role_permissions (role, permission_id) VALUES ('org_admin', @permId);
```

Verify the generated FK block has no `ON DELETE`/multi-path conflict: `pipeline_entries` (parents `jobs`, `candidates`) and `job_exams` (parents `jobs`, `exams`) are independent roots, so no P1012 — but confirm the generated SQL uses `ON DELETE CASCADE ON UPDATE NO ACTION` for all four FKs. If `migrate dev` reports P1012, change the offending FK to `ON DELETE NO ACTION` and note it.

- [ ] **Step 4: Apply and verify**

```bash
cd "D:/exam app" && DATABASE_URL="$LOCAL_DB_URL" npx prisma migrate status --schema=apps/api/prisma/schema.prisma
DATABASE_URL="$LOCAL_DB_URL" npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma
DATABASE_URL="$LOCAL_DB_URL" npx prisma generate --schema=apps/api/prisma/schema.prisma
```
Expected: migration applies; `PrismaClient` now exposes `job`, `pipelineEntry`, `pipelineFeedback`, `jobExam`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260818090000_ats_pipeline apps/api/prisma/seed.ts
git commit -m "feat(pipeline): schema + migration + pipeline:manage permission"
```

---

## Task 2: Pure domain helpers

**Files:**
- Create: `apps/api/src/pipeline/pipeline-stages.ts`
- Create: `apps/api/src/pipeline/derive-entry-exam-results.ts`
- Test: `apps/api/src/pipeline/pipeline-stages.spec.ts`, `apps/api/src/pipeline/derive-entry-exam-results.spec.ts`

**Interfaces:**
- Produces:
  - `PIPELINE_STAGES: readonly ['applied','screened','interview','offer','hired']`
  - `type PipelineStage = (typeof PIPELINE_STAGES)[number]`
  - `isValidStage(s: string): s is PipelineStage`
  - `interface EntryExamResult { examId: string; examTitle: string; passFail: 'pass'|'fail'|null; score: number|null }`
  - `deriveEntryExamResults(invitations, linkedExamIds): EntryExamResult[]`
  - `averageRating(ratings: (number|null)[]): number | null`

- [ ] **Step 1: Write failing tests for `pipeline-stages`**

`pipeline-stages.spec.ts`:
```ts
import { PIPELINE_STAGES, isValidStage } from './pipeline-stages';

describe('pipeline-stages', () => {
  it('is the five fixed stages in order', () => {
    expect(PIPELINE_STAGES).toEqual(['applied', 'screened', 'interview', 'offer', 'hired']);
  });
  it('accepts a valid stage and rejects rejected/garbage', () => {
    expect(isValidStage('interview')).toBe(true);
    expect(isValidStage('rejected')).toBe(false); // rejected is a flag, not a stage
    expect(isValidStage('nope')).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module './pipeline-stages'`)

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js src/pipeline/pipeline-stages
```

- [ ] **Step 3: Implement `pipeline-stages.ts`**

```ts
export const PIPELINE_STAGES = ['applied', 'screened', 'interview', 'offer', 'hired'] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export function isValidStage(s: string): s is PipelineStage {
  return (PIPELINE_STAGES as readonly string[]).includes(s);
}
```

- [ ] **Step 4: Write failing tests for `derive-entry-exam-results`**

`derive-entry-exam-results.spec.ts`:
```ts
import { deriveEntryExamResults, averageRating } from './derive-entry-exam-results';

const inv = (examId: string, title: string, attempt: any) => ({
  examId, exam: { title }, attempt,
});

describe('deriveEntryExamResults', () => {
  it('returns only invitations whose exam is linked, with derived pass/fail + score', () => {
    const invitations = [
      inv('e1', 'Backend', { status: 'submitted', result: { passFail: 'pass', percentage: 82 } }),
      inv('e2', 'Frontend', { status: 'submitted', result: { passFail: 'fail', percentage: 40 } }),
      inv('e3', 'Unlinked', { status: 'submitted', result: { passFail: 'pass', percentage: 90 } }),
    ];
    const out = deriveEntryExamResults(invitations as any, ['e1', 'e2']);
    expect(out).toEqual([
      { examId: 'e1', examTitle: 'Backend', passFail: 'pass', score: 82 },
      { examId: 'e2', examTitle: 'Frontend', passFail: 'fail', score: 40 },
    ]);
  });
  it('reports null pass/fail + null score when there is no attempt yet', () => {
    const out = deriveEntryExamResults([inv('e1', 'Backend', null)] as any, ['e1']);
    expect(out).toEqual([{ examId: 'e1', examTitle: 'Backend', passFail: null, score: null }]);
  });
});

describe('averageRating', () => {
  it('averages non-null ratings, rounded to one decimal, null when none', () => {
    expect(averageRating([5, 4, null, 3])).toBe(4);
    expect(averageRating([5, 4])).toBe(4.5);
    expect(averageRating([null, null])).toBeNull();
    expect(averageRating([])).toBeNull();
  });
});
```

- [ ] **Step 5: Run — expect FAIL**

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js src/pipeline/derive-entry-exam-results
```

- [ ] **Step 6: Implement `derive-entry-exam-results.ts`**

```ts
export interface EntryExamResult {
  examId: string;
  examTitle: string;
  passFail: 'pass' | 'fail' | null;
  score: number | null;
}

interface InvitationForResult {
  examId: string;
  exam: { title: string };
  attempt: { result: { passFail: string | null; percentage: number } | null } | null;
}

// Derived, not stored: for each of the candidate's invitations whose exam is one of the
// job's linked exams, surface the result. null attempt/result => not taken yet.
export function deriveEntryExamResults(
  invitations: InvitationForResult[],
  linkedExamIds: string[],
): EntryExamResult[] {
  const linked = new Set(linkedExamIds);
  return invitations
    .filter((inv) => linked.has(inv.examId))
    .map((inv) => {
      const result = inv.attempt?.result ?? null;
      const passFail = result?.passFail === 'pass' || result?.passFail === 'fail' ? result.passFail : null;
      return {
        examId: inv.examId,
        examTitle: inv.exam.title,
        passFail,
        score: result?.percentage ?? null,
      };
    });
}

export function averageRating(ratings: (number | null)[]): number | null {
  const nums = ratings.filter((r): r is number => typeof r === 'number');
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}
```

- [ ] **Step 7: Run — expect PASS**, then commit

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js src/pipeline/pipeline-stages src/pipeline/derive-entry-exam-results
git add apps/api/src/pipeline/pipeline-stages.ts apps/api/src/pipeline/pipeline-stages.spec.ts apps/api/src/pipeline/derive-entry-exam-results.ts apps/api/src/pipeline/derive-entry-exam-results.spec.ts
git commit -m "feat(pipeline): pure stage + derived-exam-result helpers"
```

---

## Task 3: Jobs service + board read

**Files:**
- Create: `apps/api/src/pipeline/pipeline.service.ts`, `dto/create-job.dto.ts`, `dto/update-job.dto.ts`
- Test: `apps/api/src/pipeline/pipeline.service.spec.ts`

**Interfaces:**
- Consumes: `TenantPrismaService`, `AuditService` (constructor-inject exactly like `DrivesService` in `apps/api/src/drives/drives.service.ts`); `PIPELINE_STAGES`, `deriveEntryExamResults`, `averageRating`.
- Produces on `PipelineService`:
  - `createJob(ctx, userId, dto: {title; description?}): Promise<Job>`
  - `listJobs(ctx, status?: 'open'|'closed'): Promise<JobWithCounts[]>` where `JobWithCounts = Job & { stageCounts: Record<PipelineStage,'number'> & {rejected:number} }`
  - `getJob(ctx, jobId): Promise<Job & { linkedExams: {examId; title}[] }>`
  - `updateJob(ctx, userId, jobId, dto: {title?; description?; status?}): Promise<Job>`
  - `deleteJob(ctx, userId, jobId): Promise<{success:true}>`
  - `getPipeline(ctx, jobId): Promise<PipelineBoard>` — `PipelineBoard = { stages: Record<PipelineStage, BoardRow[]>, rejected: BoardRow[] }`, `BoardRow = { entryId; candidateId; candidateName; candidateEmail; stage; enteredVia; examResults: EntryExamResult[]; avgRating: number|null; feedbackCount: number }`

- [ ] **Step 1: Write failing tests** (`pipeline.service.spec.ts`) — mock `tenantPrisma.forTenant` to invoke its callback with a `tx` mock, exactly as `drives.service.spec.ts` does. Cover: createJob writes org-scoped + audits `job.created`; getJob throws `NotFoundException` when not in org; deleteJob deletes + audits `job.deleted`; getPipeline groups entries by stage and puts rejected in its own bucket with derived exam results and avg rating.

```ts
import { NotFoundException } from '@nestjs/common';
import { PipelineService } from './pipeline.service';

describe('PipelineService', () => {
  let service: PipelineService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    service = new PipelineService(tenantPrisma as any, audit as any);
  });

  it('createJob writes org-scoped and audits', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'job-1', title: 'Backend Eng' });
    tenantPrisma.forTenant.mockImplementation((_c, fn) => fn({ job: { create } }));
    const out = await service.createJob(context, 'user-1', { title: 'Backend Eng' });
    expect(out).toEqual({ id: 'job-1', title: 'Backend Eng' });
    expect(create).toHaveBeenCalledWith({
      data: { organizationId: 'org-1', title: 'Backend Eng', description: undefined, createdById: 'user-1' },
    });
    expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'job.created', entityId: 'job-1' }));
  });

  it('getPipeline groups by stage and buckets rejected with derived results', async () => {
    const tx = {
      job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1' }) },
      jobExam: { findMany: jest.fn().mockResolvedValue([{ examId: 'e1' }]) },
      pipelineEntry: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'en1', candidateId: 'c1', stage: 'applied', rejected: false, enteredVia: 'manual',
            candidate: { name: 'Amy', email: 'amy@x.com',
              invitations: [{ examId: 'e1', exam: { title: 'Backend' }, attempt: { result: { passFail: 'pass', percentage: 82 } } }] },
            feedback: [{ rating: 4 }, { rating: null }] },
          { id: 'en2', candidateId: 'c2', stage: 'interview', rejected: true, enteredVia: 'exam',
            candidate: { name: 'Bo', email: 'bo@x.com', invitations: [] }, feedback: [] },
        ]),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));
    const board = await service.getPipeline(context, 'job-1');
    expect(board.stages.applied).toHaveLength(1);
    expect(board.stages.applied[0]).toMatchObject({ entryId: 'en1', avgRating: 4, feedbackCount: 2, examResults: [{ examId: 'e1', passFail: 'pass', score: 82 }] });
    expect(board.stages.interview).toHaveLength(0); // rejected -> not in stage bucket
    expect(board.rejected).toHaveLength(1);
    expect(board.rejected[0].entryId).toBe('en2');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js src/pipeline/pipeline.service
```

- [ ] **Step 3: Write DTOs**

`dto/create-job.dto.ts`:
```ts
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateJobDto {
  @IsString() @MinLength(1) @MaxLength(200)
  title!: string;

  @IsOptional() @IsString() @MaxLength(5000)
  description?: string;
}
```
`dto/update-job.dto.ts`:
```ts
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateJobDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  title?: string;

  @IsOptional() @IsString() @MaxLength(5000)
  description?: string;

  @IsOptional() @IsIn(['open', 'closed'])
  status?: 'open' | 'closed';
}
```

- [ ] **Step 4: Implement the jobs + board portion of `pipeline.service.ts`**

Create the class with constructor `(private readonly tenantPrisma: TenantPrismaService, private readonly audit: AuditService)`. Implement `createJob`, `listJobs`, `getJob`, `updateJob` (set `closedAt` when status→closed, clear when →open; audit `job.updated`), `deleteJob` (findFirst org-scoped → NotFound → delete → audit `job.deleted`), and `getPipeline`. Board query:

```ts
async getPipeline(context: TenantContext, jobId: string): Promise<PipelineBoard> {
  return this.tenantPrisma.forTenant(context, async (tx) => {
    const job = await tx.job.findFirst({ where: { id: jobId, organizationId: context.organizationId as string } });
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);
    const links = await tx.jobExam.findMany({ where: { jobId }, select: { examId: true } });
    const linkedExamIds = links.map((l) => l.examId);
    const entries = await tx.pipelineEntry.findMany({
      where: { jobId },
      include: {
        candidate: { include: { invitations: { include: { exam: { select: { title: true } }, attempt: { include: { result: true } } } } } },
        feedback: { select: { rating: true } },
      },
    });
    const stages = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, [] as BoardRow[]])) as Record<PipelineStage, BoardRow[]>;
    const rejected: BoardRow[] = [];
    for (const e of entries) {
      const row: BoardRow = {
        entryId: e.id, candidateId: e.candidateId, candidateName: e.candidate.name, candidateEmail: e.candidate.email,
        stage: e.stage as PipelineStage, enteredVia: e.enteredVia,
        examResults: deriveEntryExamResults(e.candidate.invitations as any, linkedExamIds),
        avgRating: averageRating(e.feedback.map((f) => f.rating)),
        feedbackCount: e.feedback.length,
      };
      if (e.rejected) rejected.push(row);
      else if (isValidStage(e.stage)) stages[e.stage].push(row);
    }
    return { stages, rejected };
  });
}
```

(Import `NotFoundException`, `TenantContext`, `TenantPrismaService`, `AuditService`, `PIPELINE_STAGES`, `PipelineStage`, `isValidStage`, `deriveEntryExamResults`, `averageRating`, `EntryExamResult`. Define `BoardRow`/`PipelineBoard`/`JobWithCounts` interfaces at top of file and export them.)

For `listJobs` stage counts, use a `groupBy`:
```ts
const grouped = await tx.pipelineEntry.groupBy({ by: ['jobId', 'stage', 'rejected'], where: { organizationId: context.organizationId as string }, _count: true });
```
then fold into per-job `{applied,screened,interview,offer,hired,rejected}` counts (rejected counts regardless of stage).

- [ ] **Step 5: Run — expect PASS**, then commit

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js src/pipeline/pipeline.service
git add apps/api/src/pipeline/pipeline.service.ts apps/api/src/pipeline/pipeline.service.spec.ts apps/api/src/pipeline/dto/create-job.dto.ts apps/api/src/pipeline/dto/update-job.dto.ts
git commit -m "feat(pipeline): jobs CRUD + board read in PipelineService"
```

---

## Task 4: Entries — add, move/reject, delete

**Files:**
- Modify: `apps/api/src/pipeline/pipeline.service.ts`
- Create: `dto/add-entry.dto.ts`, `dto/patch-entry.dto.ts`
- Modify: `apps/api/src/pipeline/pipeline.service.spec.ts`

**Interfaces:**
- Produces:
  - `addEntry(ctx, userId, jobId, dto: {candidateId?; newCandidate?: {name;email;phone?}}): Promise<PipelineEntry>` — upsert at `applied`, `enteredVia='manual'`, never resets an existing entry.
  - `patchEntry(ctx, userId, entryId, dto: {stage?; rejected?; reason?}): Promise<PipelineEntry>` — a `stage` move clears reject fields; `rejected:true` sets `rejectedReason=reason ?? null` + `rejectedAt=now`, leaves stage.
  - `deleteEntry(ctx, userId, entryId): Promise<{success:true}>`

- [ ] **Step 1: Write failing tests** covering: manual add creates an entry at `applied`/`manual` and audits `entry.added`; re-adding the same candidate is idempotent (upsert, no duplicate, stage untouched); `newCandidate` creates the candidate then the entry; patch stage move clears reject fields + audits `entry.stage_changed`; reject sets flag+reason+rejectedAt without changing stage + audits `entry.rejected`; patch rejects an unknown entry with NotFound; deleteEntry removes + audits `entry.removed`.

```ts
it('addEntry upserts at applied/manual and is idempotent on re-add', async () => {
  const upsert = jest.fn().mockResolvedValue({ id: 'en1', stage: 'applied', enteredVia: 'manual' });
  const tx = { job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1' }) }, pipelineEntry: { upsert } };
  tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));
  await service.addEntry(context, 'user-1', 'job-1', { candidateId: 'c1' });
  expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
    where: { jobId_candidateId: { jobId: 'job-1', candidateId: 'c1' } },
    create: expect.objectContaining({ stage: 'applied', enteredVia: 'manual', organizationId: 'org-1' }),
    update: {}, // never overwrite stage/enteredVia
  }));
});

it('patchEntry stage move clears reject fields', async () => {
  const update = jest.fn().mockResolvedValue({ id: 'en1', stage: 'interview' });
  const tx = { pipelineEntry: { findFirst: jest.fn().mockResolvedValue({ id: 'en1', jobId: 'job-1' }), update } };
  tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));
  await service.patchEntry(context, 'user-1', 'en1', { stage: 'interview' });
  expect(update).toHaveBeenCalledWith({ where: { id: 'en1' }, data: { stage: 'interview', rejected: false, rejectedReason: null, rejectedAt: null } });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js src/pipeline/pipeline.service
```

- [ ] **Step 3: Write DTOs**

`dto/add-entry.dto.ts`:
```ts
import { Type } from 'class-transformer';
import { IsEmail, IsObject, IsOptional, IsString, MaxLength, MinLength, ValidateNested, IsUUID } from 'class-validator';

class NewCandidateDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
}

export class AddEntryDto {
  @IsOptional() @IsUUID() candidateId?: string;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => NewCandidateDto) newCandidate?: NewCandidateDto;
}
```
`dto/patch-entry.dto.ts`:
```ts
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PIPELINE_STAGES } from '../pipeline-stages';

export class PatchEntryDto {
  @IsOptional() @IsIn(PIPELINE_STAGES as unknown as string[]) stage?: string;
  @IsOptional() @IsBoolean() rejected?: boolean;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
```

- [ ] **Step 4: Implement the three methods**

`addEntry`: inside `forTenant`, confirm the job is org-scoped (NotFound otherwise). If `newCandidate`, create/upsert the candidate by `@@unique([organizationId,email])` first, then use its id; else require `candidateId`. Then:
```ts
const entry = await tx.pipelineEntry.upsert({
  where: { jobId_candidateId: { jobId, candidateId } },
  create: { organizationId: context.organizationId as string, jobId, candidateId, stage: 'applied', enteredVia: 'manual' },
  update: {}, // stamp-if-absent: never touch stage/enteredVia on re-add
});
await this.audit.record(context, { actorUserId, action: 'entry.added', entityType: 'pipeline_entry', entityId: entry.id, metadata: { jobId, candidateId } });
```
`patchEntry`: findFirst the entry org-scoped (NotFound). Build `data`: if `dto.stage` present and valid → `{ stage, rejected:false, rejectedReason:null, rejectedAt:null }` (audit `entry.stage_changed`); else if `dto.rejected === true` → `{ rejected:true, rejectedReason: dto.reason ?? null, rejectedAt: new Date() }` (audit `entry.rejected`); else if `dto.rejected === false` → `{ rejected:false, rejectedReason:null, rejectedAt:null }`. Reject a bad `stage` with `BadRequestException`. Update and return.
`deleteEntry`: findFirst org-scoped (NotFound) → delete → audit `entry.removed`.

- [ ] **Step 5: Run — expect PASS**, commit

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js src/pipeline/pipeline.service
git add apps/api/src/pipeline/pipeline.service.ts apps/api/src/pipeline/pipeline.service.spec.ts apps/api/src/pipeline/dto/add-entry.dto.ts apps/api/src/pipeline/dto/patch-entry.dto.ts
git commit -m "feat(pipeline): add/move/reject/delete pipeline entries"
```

---

## Task 5: Exam links, backfill, invitation hook

**Files:**
- Modify: `apps/api/src/pipeline/pipeline.service.ts`
- Create: `dto/link-exam.dto.ts`
- Modify: `apps/api/src/pipeline/pipeline.service.spec.ts`
- Modify: `apps/api/src/invitations/invitations.service.ts`, `apps/api/src/invitations/invitations.module.ts`, `apps/api/src/pipeline/pipeline.module.ts` (created in Task 7 — if Task 7 not yet done, create a minimal module here exporting `PipelineService`)

**Interfaces:**
- Produces:
  - `linkExam(ctx, userId, jobId, examId): Promise<{success:true}>` — create `JobExam` (idempotent on `@@unique`), then backfill: for every candidate already invited to `examId`, upsert an entry `enteredVia='exam'`, stamp-if-absent.
  - `unlinkExam(ctx, userId, jobId, examId): Promise<{success:true}>`
  - `syncEntriesForInvitations(tx, ctx, examId, candidateIds: string[]): Promise<void>` — called inside the invitations `forTenant` tx: find jobs linked to `examId`, upsert an `enteredVia='exam'` entry per (job, candidate), stamp-if-absent. Takes the caller's `tx` so it runs in the same transaction.
- Consumes (invitations side): the existing `bulkInvite` `forTenant` block in `apps/api/src/invitations/invitations.service.ts` (around lines 147–213).

- [ ] **Step 1: Write failing tests** — `linkExam` creates the `JobExam` and upserts an `enteredVia='exam'` entry for each already-invited candidate, stamp-if-absent (`update:{}`); `syncEntriesForInvitations` upserts one entry per linked job × candidate and is a no-op when the exam is linked to no job.

```ts
it('linkExam links and backfills already-invited candidates as enteredVia=exam', async () => {
  const upsert = jest.fn().mockResolvedValue({ id: 'en1' });
  const tx = {
    job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1' }) },
    jobExam: { upsert: jest.fn().mockResolvedValue({ id: 'jx1' }) },
    invitation: { findMany: jest.fn().mockResolvedValue([{ candidateId: 'c1' }, { candidateId: 'c2' }]) },
    pipelineEntry: { upsert },
  };
  tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));
  await service.linkExam(context, 'user-1', 'job-1', 'e1');
  expect(upsert).toHaveBeenCalledTimes(2);
  expect(upsert.mock.calls[0][0].create).toMatchObject({ enteredVia: 'exam', stage: 'applied' });
  expect(upsert.mock.calls[0][0].update).toEqual({});
});

it('syncEntriesForInvitations upserts one entry per linked job × candidate', async () => {
  const upsert = jest.fn().mockResolvedValue({ id: 'en1' });
  const tx = { jobExam: { findMany: jest.fn().mockResolvedValue([{ jobId: 'job-1' }, { jobId: 'job-2' }]) }, pipelineEntry: { upsert } };
  await service.syncEntriesForInvitations(tx as any, context, 'e1', ['c1']);
  expect(upsert).toHaveBeenCalledTimes(2); // job-1×c1, job-2×c1
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: DTO + implement**

`dto/link-exam.dto.ts`:
```ts
import { IsUUID } from 'class-validator';
export class LinkExamDto { @IsUUID() examId!: string; }
```
`syncEntriesForInvitations` (note: takes an existing `tx`, does NOT open its own `forTenant`):
```ts
async syncEntriesForInvitations(tx: any, context: TenantContext, examId: string, candidateIds: string[]): Promise<void> {
  const links = await tx.jobExam.findMany({ where: { examId }, select: { jobId: true } });
  for (const { jobId } of links) {
    for (const candidateId of candidateIds) {
      await tx.pipelineEntry.upsert({
        where: { jobId_candidateId: { jobId, candidateId } },
        create: { organizationId: context.organizationId as string, jobId, candidateId, stage: 'applied', enteredVia: 'exam' },
        update: {},
      });
    }
  }
}
```
`linkExam` opens `forTenant`, checks the job is org-scoped, `jobExam.upsert` on `{jobId_examId}`, then `invitation.findMany({ where: { examId }, select: { candidateId: true } })` and calls the same upsert loop (reuse `syncEntriesForInvitations(tx, context, examId, candidateIds)`); audit `job.exam_linked`. `unlinkExam`: delete the `JobExam` row (idempotent); audit `job.exam_unlinked`.

- [ ] **Step 4: Wire the hook into `invitations.service.ts`**

Inject `PipelineService` into `InvitationsService`'s constructor. In `bulkInvite`, inside the existing `forTenant` callback, AFTER the invitations are created and BEFORE the return, call:
```ts
await this.pipeline.syncEntriesForInvitations(tx, context, examId, uniqueCandidateIds);
```
(`uniqueCandidateIds` already exists in that scope — see line ~157. If the variable name differs, use the array of candidate ids actually invited.) In `invitations.module.ts`, add `imports: [PipelineModule]`. In `pipeline.module.ts`, `exports: [PipelineService]`.

- [ ] **Step 5: Add an invitations-side test** — in `apps/api/src/invitations/invitations.service.spec.ts`, add a mocked `PipelineService` to the providers and assert `syncEntriesForInvitations` is called with the exam id and the invited candidate ids after a `bulkInvite`.

- [ ] **Step 6: Run both suites — expect PASS**, commit

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js src/pipeline/pipeline.service src/invitations/invitations.service
git add apps/api/src/pipeline apps/api/src/invitations
git commit -m "feat(pipeline): exam links + backfill + invitation entry hook"
```

---

## Task 6: Feedback

**Files:**
- Modify: `apps/api/src/pipeline/pipeline.service.ts`
- Create: `dto/add-feedback.dto.ts`
- Modify: `apps/api/src/pipeline/pipeline.service.spec.ts`

**Interfaces:**
- Produces:
  - `addFeedback(ctx, userId, entryId, dto: {note?; rating?}): Promise<PipelineFeedback>` — requires ≥1 of note/rating (else `BadRequestException`); `rating` must be 1–5; author = `userId`.
  - `listFeedback(ctx, entryId): Promise<FeedbackRow[]>` where `FeedbackRow = { id; authorUserId; authorName; note; rating; createdAt }` ordered newest-first.

- [ ] **Step 1: Write failing tests** — addFeedback with only a rating succeeds and audits `feedback.added`; with neither note nor rating throws `BadRequestException`; listFeedback returns rows newest-first with author name joined.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: DTO + implement**

`dto/add-feedback.dto.ts`:
```ts
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class AddFeedbackDto {
  @IsOptional() @IsString() @MaxLength(5000) note?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;
}
```
`addFeedback`: reject when `!dto.note?.trim() && dto.rating == null` (BadRequest "note or rating required"). findFirst the entry org-scoped (NotFound). Create feedback `{ organizationId, entryId, authorUserId: userId, note: dto.note ?? null, rating: dto.rating ?? null }`; audit `feedback.added`. `listFeedback`: findFirst entry org-scoped, then `pipelineFeedback.findMany({ where:{entryId}, include:{ /* join author name */ }, orderBy:{ createdAt:'desc' } })`. Author name: the users table is RLS'd; fetch names via `tx.user.findMany({ where:{ id:{ in: authorIds } } })` inside the same `forTenant` (super-admin context not needed — staff users share the org). Map to `FeedbackRow`.

- [ ] **Step 4: Run — expect PASS**, commit

```bash
git add apps/api/src/pipeline/pipeline.service.ts apps/api/src/pipeline/pipeline.service.spec.ts apps/api/src/pipeline/dto/add-feedback.dto.ts
git commit -m "feat(pipeline): note+rating feedback timeline"
```

---

## Task 7: Controller, module, app wiring

**Files:**
- Create: `apps/api/src/pipeline/pipeline.controller.ts`, `apps/api/src/pipeline/pipeline.module.ts`
- Create: `apps/api/src/pipeline/pipeline.controller.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: all `PipelineService` methods above.
- Produces: HTTP routes (guards `JwtAuthGuard, PermissionsGuard` at class level, exactly like `DrivesController`):

| Method + path | Permission | Service call |
|---|---|---|
| `POST /jobs` | `pipeline:manage` | `createJob(t,u,dto)` |
| `GET /jobs` (`?status=`) | `results:view` | `listJobs(t,q.status)` |
| `GET /jobs/:id` | `results:view` | `getJob(t,id)` |
| `PATCH /jobs/:id` | `pipeline:manage` | `updateJob(t,u,id,dto)` |
| `DELETE /jobs/:id` | `pipeline:manage` | `deleteJob(t,u,id)` |
| `GET /jobs/:id/pipeline` | `results:view` | `getPipeline(t,id)` |
| `POST /jobs/:id/entries` | `pipeline:manage` | `addEntry(t,u,id,dto)` |
| `PATCH /entries/:id` | `pipeline:manage` | `patchEntry(t,u,id,dto)` |
| `DELETE /entries/:id` | `pipeline:manage` | `deleteEntry(t,u,id)` |
| `POST /jobs/:id/exams` | `pipeline:manage` | `linkExam(t,u,id,dto.examId)` |
| `DELETE /jobs/:id/exams/:examId` | `pipeline:manage` | `unlinkExam(t,u,id,examId)` |
| `POST /entries/:id/feedback` | `results:view` | `addFeedback(t,u,id,dto)` |
| `GET /entries/:id/feedback` | `results:view` | `listFeedback(t,id)` |

- [ ] **Step 1: Write `pipeline.controller.spec.ts`** — mirror `drives.controller.spec.ts`: mock the service, assert each handler delegates with the right args, and add the "unreachable when JwtAuthGuard rejects" 401 test against `GET /jobs`.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement controller + module**

Controller: `@Controller()` + `@UseGuards(JwtAuthGuard, PermissionsGuard)`; each handler uses `@RequirePermissions(...)`, `@CurrentTenant()`, `@CurrentUserId()`, `@Param`, `@Body`, `@Query('status')`. Copy the shape from `apps/api/src/drives/drives.controller.ts`.
`pipeline.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';

@Module({
  controllers: [PipelineController],
  providers: [PipelineService],
  exports: [PipelineService],
})
export class PipelineModule {}
```
Register `PipelineModule` in `app.module.ts` imports (next to `DrivesModule`).

- [ ] **Step 4: Run — expect PASS**, then the whole api suite + typecheck

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js src/pipeline
npx tsc -p apps/api/tsconfig.json --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/pipeline/pipeline.controller.ts apps/api/src/pipeline/pipeline.controller.spec.ts apps/api/src/pipeline/pipeline.module.ts apps/api/src/app.module.ts
git commit -m "feat(pipeline): controller routes + module wiring"
```

---

## Task 8: Frontend — types, hooks, jobs list

**Files:**
- Modify: `apps/web/lib/types.ts`
- Create: `apps/web/lib/hooks/usePipeline.ts`
- Create: `apps/web/app/(recruiter)/jobs/page.tsx`
- Create: `apps/web/app/(recruiter)/jobs/jobs-list.test.tsx`
- Modify: the recruiter nav component (find where the drives/walk-in link is defined; add a "Jobs" link to `/jobs`)

**Interfaces:**
- Produces types: `JobStatus='open'|'closed'`; `PipelineStage`; `JobListItem = {id;title;status;createdAt;stageCounts:Record<PipelineStage,'number'>&{rejected:number}}`; `PipelineBoard`, `BoardRow`, `EntryExamResult`, `FeedbackRow` mirroring the API DTOs from Tasks 3/6.
- Produces hooks (React Query, `apiFetch` + `useAuth` pattern from `apps/web/lib/hooks/useDrives.ts`): `useJobs(status?)`, `useJob(jobId)`, `useJobPipeline(jobId)`, `useCreateJob()`, `useUpdateJob(jobId)`, `useDeleteJob()`, `useAddEntry(jobId)`, `usePatchEntry(jobId)`, `useLinkExam(jobId)`, `useUnlinkExam(jobId)`, `useEntryFeedback(entryId)`, `useAddFeedback(entryId, jobId)`. Mutations invalidate `['jobs']` / `['jobs', jobId, 'pipeline']` / `['entries', entryId, 'feedback']` as appropriate.

- [ ] **Step 1: Write failing test** (`jobs-list.test.tsx`) — mock `useAuth` + `fetch` (as `DriveResults.test.tsx` does), render the page, assert jobs render with their stage-count summary and the create form posts.

- [ ] **Step 2: Run — expect FAIL**

```bash
cd "D:/exam app/apps/web" && npx jest app/\(recruiter\)/jobs
```

- [ ] **Step 3: Add types + hooks + page**

Types in `lib/types.ts`. Hooks in `usePipeline.ts` (copy structure from `useDrives.ts`; no polling). Page: a `Card` create form (title + optional description) + a `Table` of jobs (title link → `/jobs/${id}`, status `StatusBadge`, a compact `4 applied · 2 interview` summary built from `stageCounts`, created date), a status filter, and a delete trash action with `confirm()` (copy the drives list delete affordance). Add the nav link.

- [ ] **Step 4: Run — expect PASS**, commit

```bash
cd "D:/exam app/apps/web" && npx jest app/\(recruiter\)/jobs
git add apps/web/lib/types.ts apps/web/lib/hooks/usePipeline.ts "apps/web/app/(recruiter)/jobs/page.tsx" "apps/web/app/(recruiter)/jobs/jobs-list.test.tsx" <nav-file>
git commit -m "feat(pipeline): web types, hooks, jobs list page"
```

---

## Task 9: Frontend — job board, candidate drawer, linked exams

**Files:**
- Create: `apps/web/app/(recruiter)/jobs/[jobId]/page.tsx`
- Create: `apps/web/components/pipeline/PipelineBoard.tsx`, `CandidateDrawer.tsx`, `LinkedExams.tsx`, `AddCandidateModal.tsx`
- Create: `apps/web/components/pipeline/PipelineBoard.test.tsx`, `CandidateDrawer.test.tsx`

**Interfaces:**
- Consumes: hooks from Task 8; `BoardRow`, `PipelineBoard`, `FeedbackRow`, `EntryExamResult`, `PIPELINE_STAGES` (add a `PIPELINE_STAGES` const + labels map to `lib/types.ts` or a small `lib/pipeline.ts`).

- [ ] **Step 1: Write failing tests** — `PipelineBoard.test.tsx`: renders five stage columns, a card shows candidate name + exam result chip + avg-rating stars, changing a card's stage `<select>` fires `usePatchEntry`, rejected entries appear only under the Rejected tab, "move back" un-rejects. `CandidateDrawer.test.tsx`: renders the feedback timeline newest-first and the compose box posts a note+rating.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

`PipelineBoard.tsx`: five columns from `PIPELINE_STAGES`, each a stack of cards; a card renders name, `examResults` chips (`Backend · Passed 82%`), avg-rating stars, feedback count, entered-via hint, a stage `<select>` (options = the five stages) that calls `usePatchEntry({stage})`, and a "Reject" action (prompts optional reason → `usePatchEntry({rejected:true, reason})`). A "Rejected" tab lists rejected rows with reason + "Move back" (`usePatchEntry({stage:'applied'})` or a stage picker). Clicking a card opens `CandidateDrawer`.
`CandidateDrawer.tsx`: candidate details, full `examResults`, `useEntryFeedback` timeline (author, time, note, stars), and a compose box (textarea + 1–5 star picker) posting via `useAddFeedback`; visible whenever the user can view (the API enforces `results:view`).
`LinkedExams.tsx`: chips of linked exams with unlink ✕, plus an "Attach exam" picker (reuse the existing exams list hook) calling `useLinkExam`. Show attach/unlink only when the user has `pipeline:manage` (reuse the existing permission-check the recruiter UI already uses, e.g. an auth-context capability check).
`AddCandidateModal.tsx`: tab/toggle between "existing" (search the candidates list) and "new" (name/email/phone) → `useAddEntry`.
`[jobId]/page.tsx`: header (title, status, edit/close via `useUpdateJob`), `LinkedExams`, `AddCandidateModal` trigger, `PipelineBoard`.

- [ ] **Step 4: Run — expect PASS**, then the whole web drives+pipeline suites + typecheck

```bash
cd "D:/exam app/apps/web" && npx jest components/pipeline app/\(recruiter\)/jobs && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(recruiter)/jobs/[jobId]" apps/web/components/pipeline apps/web/lib
git commit -m "feat(pipeline): job board, candidate drawer, linked exams"
```

---

## Task 10: Whole-feature verification

**Files:** none (verification only).

- [ ] **Step 1: Full backend suite + typecheck**

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js
npx tsc -p apps/api/tsconfig.json --noEmit
```
Expected: all green, no pipeline regressions; exam-runtime untouched.

- [ ] **Step 2: Full web suite + typecheck**

```bash
cd "D:/exam app/apps/web" && npx jest --maxWorkers=2 && npx tsc --noEmit
```
(Per the flaky-suite note, `--maxWorkers=2`; re-run any failing suite alone before believing it.)

- [ ] **Step 3: Browser smoke (dev server)** — start the web dev server (preview_start), log in as a recruiter, then: create a job; link an exam; from the exams page invite a candidate to that exam; confirm they appear at `applied` on the board via the exam entry; drag… (stage `<select>`) to `interview`; open the drawer and leave a note + 4-star rating; reject someone with a reason and confirm they move to the Rejected tab; move them back. Confirm the candidate report link (if surfaced) resolves. Screenshot the board.

- [ ] **Step 4: Confirm no unintended writes** — a candidate not added to any job has no `pipeline_entries` row (manual/exam entry only). Verify with a quick count in dev DB.

- [ ] **Step 5: Final commit if any verification fixes were needed; otherwise proceed to the final whole-branch review + finishing-a-development-branch.**

---

## Self-Review

**Spec coverage:**
- Job/PipelineEntry/PipelineFeedback/JobExam data model → Task 1. ✅
- Fixed stages + `isValidStage` → Task 2. ✅
- Derived exam result (not stored) → Task 2 (`deriveEntryExamResults`) + Task 3 (board uses it). ✅
- Jobs CRUD + board read → Task 3. ✅
- Entry add (manual, A), move, reject/un-reject, delete → Task 4. ✅
- Exam link + backfill (C) + invitation hook, stamp-if-absent → Task 5. ✅
- Unified note+rating feedback, ≥1 required → Task 6. ✅
- API surface + split permissions (`pipeline:manage` / `results:view`) → Task 7 (routes) + Task 1 (permission seed). ✅
- Frontend jobs list, board with stage-select, candidate drawer + feedback, linked-exam UI, rejected tab → Tasks 8–9. ✅
- RLS on new tables + production permission seed → Task 1. ✅
- Edge cases (two jobs, re-invite no-reset, mid-hunt backfill, exam delete, GDPR cascade, reject-then-reconsider, empty feedback) → covered by Tasks 1/4/5/6 tests. ✅
- Out-of-scope items (auto-advance, drive linking, configurable stages, drag-drop, headcount, application forms, analytics) → not planned. ✅

**Placeholder scan:** `<nav-file>` and `<script>` are the only intentional placeholders — the implementer must locate the recruiter nav component (the plan says how). No TBD/TODO logic. Exam-result derivation, upsert, reject transitions, backfill, hook, and board grouping all carry full code.

**Type consistency:** `PipelineStage`, `EntryExamResult`, `BoardRow`, `PipelineBoard`, `FeedbackRow`, `syncEntriesForInvitations(tx, ctx, examId, candidateIds)`, `enteredVia`, `rejected/rejectedReason/rejectedAt` are used identically across tasks and match the spec's field names and the schema in Task 1.

**Note on Task 5/7 ordering:** Task 5 needs `PipelineModule` to export `PipelineService` for the invitations import; Task 7 formally creates the module. To avoid a forward dependency, Task 5 Step 4 says to create a minimal `pipeline.module.ts` exporting the service if Task 7 hasn't run yet, and Task 7 then fills in the controller. A subagent-driven executor running tasks in order will create the minimal module in Task 5 and extend it in Task 7 — both are idempotent edits to the same small file.
