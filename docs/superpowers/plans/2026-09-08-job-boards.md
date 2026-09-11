# Multi-Board Job Publishing (Zoho #23) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Org admins define named **job boards** (each with its own public XML feed URL); recruiters choose which boards each job publishes to; each board's feed serves only the jobs published to it that are publicly applyable. Additive, off-by-default.

**Architecture:** Two new org-scoped tables — `JobBoard` (catalog, with an opaque `feedToken`) + `JobBoardPublication` (job↔board many-to-many) — both RLS. Board CRUD gated `org:manage_settings`; per-job board selection (replace-set `jobBoardIds`) on the job-update path gated `pipeline:manage`; a public per-board feed `GET /public/job-boards/:feedToken/feed.xml` reusing the existing `getJobsFeed` XML format. The existing global `jobs-feed.xml` + careers site are untouched.

**Tech Stack:** NestJS 10, Prisma 5.22 (SQL Server), Next.js (apps/web), Jest.

**Spec:** design approved in chat (2026-09-08); no separate spec file. Decisions: org-defined named boards; opaque per-board `feedToken`; board CRUD = `org:manage_settings`, per-job assignment = `pipeline:manage`; board delete cascades its publications (benign, no 409); a job reaches a board feed only if open+publicApplyEnabled+applyToken≠null AND published to that board.

## Global Constraints

- **Worktree build:** built in the isolated git worktree `.claude/worktrees/job-boards` (concurrent session shares the main checkout). Run ALL commands from the worktree. **NEVER `npm install`/`ci`/`update`** (junction node_modules). node_modules are junctioned; build `packages/shared/dist` with `npx tsc`; copy the gitignored `apps/api/.env` in for Prisma. Only Task 1 runs `npx prisma migrate deploy` + `npx prisma generate` (schema change). Run jest/tsc from `apps/api`/`apps/web` inside the worktree. **Scope jest with `--testPathPattern`** (the worktree folder is named `job-boards`, so a bare `jest job-boards` matches the whole suite). Verify `git branch --show-current` == `feat/job-boards` in the SAME command as each commit.
- **Base:** branch `feat/job-boards` off origin/main @ `08ae024e`.
- **Migrations:** `20260908240000_job_boards` (both tables) + `20260908240001_job_boards_rls` (RLS on both). **Numbering MUST stay after the parked `feat/api-usage-metering` (210000/1), `feat/careers-site` (220000), and `feat/permission-profiles` (230000/1)** so the chain is linear when they merge. No seed.
- **Additive + off-by-default:** no boards until an admin creates one; no job on a board until selected; existing `jobs-feed.xml`, careers, and apply flow unchanged.
- **Public feed** (`GET /public/job-boards/:feedToken/feed.xml`) is unauthenticated (on the existing `@Controller('public')`, same throttle). Resolve via `forTenant({ organizationId: LOOKUP_ORG, isSuperAdmin: true }, …)` (`LOOKUP_ORG='00000000-0000-0000-0000-000000000000'`, in `public-applications.service.ts`). Jobs (RLS) read only inside `forTenant`.
- **Feed job gate (load-bearing):** a job appears on a board feed ONLY if `status:'open'` AND `publicApplyEnabled:true` AND `applyToken != null` AND a `JobBoardPublication` row links it to that board. A merely-published-but-not-public job must never appear.
- Board CRUD routes per-method `@RequirePermissions('org:manage_settings')`; per-job `jobBoardIds` under the existing job-update gate (`pipeline:manage`). Guard is handler-only.
- apps/web: no `@exam-platform/shared` runtime VALUE import; deep-import ui (ui-v2 barrel is a Jest hazard).
- Attribution footer on every commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Schema — `JobBoard` + `JobBoardPublication`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260908240000_job_boards/migration.sql`
- Create: `apps/api/prisma/migrations/20260908240001_job_boards_rls/migration.sql`

**Interfaces:**
- Produces: `JobBoard { id, organizationId, name, feedToken, createdAt, updatedAt }` unique `(organizationId, name)`, `feedToken` unique; `JobBoardPublication { jobBoardId, jobId, organizationId }` PK `(jobBoardId, jobId)`.

- [ ] **Step 1: schema.prisma:**
```prisma
model JobBoard {
  id             String                 @id @default(uuid()) @db.UniqueIdentifier
  organizationId String                 @map("organization_id") @db.UniqueIdentifier
  name           String
  feedToken      String                 @unique @map("feed_token")
  createdAt      DateTime               @default(now()) @map("created_at")
  updatedAt      DateTime               @updatedAt @map("updated_at")
  publications   JobBoardPublication[]

  @@unique([organizationId, name])
  @@index([organizationId])
  @@map("job_boards")
}

model JobBoardPublication {
  jobBoardId     String   @map("job_board_id") @db.UniqueIdentifier
  jobId          String   @map("job_id") @db.UniqueIdentifier
  organizationId String   @map("organization_id") @db.UniqueIdentifier
  createdAt      DateTime @default(now()) @map("created_at")
  jobBoard       JobBoard @relation(fields: [jobBoardId], references: [id], onDelete: Cascade)
  job            Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)

  @@id([jobBoardId, jobId])
  @@index([jobId])
  @@index([organizationId])
  @@map("job_board_publications")
}
// model Job: add back-relation
jobBoardPublications JobBoardPublication[]
```
(`onDelete: Cascade` on BOTH relations — deleting a board or a job removes its publication rows automatically.)

- [ ] **Step 2: table migration** `20260908240000_job_boards/migration.sql` — CREATE both tables (match `org_sender_addresses`'s conventions: named default constraints, clustered PK, nonclustered indexes). `job_boards`: id (newid default), organization_id, name NVARCHAR(200), feed_token NVARCHAR(1000), created_at/updated_at; unique index on (organization_id, name) + unique index on (feed_token) + index (organization_id). `job_board_publications`: job_board_id, job_id, organization_id, created_at; composite PK (job_board_id, job_id); indexes on (job_id) and (organization_id); FKs job_board_id→job_boards(id) ON DELETE CASCADE, job_id→jobs(id) ON DELETE CASCADE. (Confirm the generated SQL from prisma matches; hand-adjust only to match repo conventions.)

- [ ] **Step 3: RLS migration** `20260908240001_job_boards_rls/migration.sql` — verbatim shape of `20260907180001_org_sender_addresses_rls`, retargeted, adding FILTER + BLOCK-AFTER-INSERT + BLOCK-AFTER-UPDATE predicates via `dbo.fn_tenant_access_predicate(organization_id)` to BOTH `dbo.job_boards` AND `dbo.job_board_publications` (one ALTER SECURITY POLICY statement can list both tables' predicates).

- [ ] **Step 4: apply + generate + typecheck.** From the worktree's `apps/api`: `npx prisma migrate deploy`, `npx prisma generate`, `npx tsc --noEmit`. Clean.

- [ ] **Step 5: commit.**
```bash
cd "C:/D-drive/exam app/.claude/worktrees/job-boards" && test "$(git branch --show-current)" = "feat/job-boards" && git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260908240000_job_boards apps/api/prisma/migrations/20260908240001_job_boards_rls && git commit -m "feat(job-boards): JobBoard + JobBoardPublication tables + RLS

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Board CRUD API (`org:manage_settings`)

**Files:**
- Create: `apps/api/src/job-boards/job-boards.service.ts` + `.controller.ts` + `.module.ts` + `dto/upsert-job-board.dto.ts`
- Modify: `apps/api/src/app.module.ts` (register `JobBoardsModule`)
- Test: service + controller specs

**Interfaces:**
- Consumes: `JobBoard` + `JobBoardPublication` (T1).
- Produces: `GET/POST/PATCH/DELETE /organizations/job-boards`; `feedUrl` derived as `${FRONTEND_URL}/public/job-boards/${feedToken}/feed.xml` (or the API base — match how other public URLs are built in this codebase; check `getJobsFeed`/careers).

- [ ] **Step 1: DTO** `UpsertJobBoardDto { @IsString @MaxLength(200) name }` (create requires it; PATCH allows optional name).
- [ ] **Step 2: failing service tests** (tenant-scoped via `forTenant`): `list` → boards with `feedUrl` + `publishedJobCount` (count of `JobBoardPublication` for the board); `create` mints a unique `feedToken` (e.g. `randomUUID()`), rejects duplicate name (P2002→409), audit `job_board.created`; `update` renames, audit `job_board.updated`; `remove` deletes the board (publications cascade), audit `job_board.deleted`.
- [ ] **Step 3: implement** the service (tenant-scoped; `feedToken = randomUUID()` on create; `feedUrl` derivation helper).
- [ ] **Step 4: failing controller spec** — all routes per-method `@RequirePermissions('org:manage_settings')` (Reflector). Run `npx jest --testPathPattern="src/job-boards/"` → FAIL.
- [ ] **Step 5: controller + module**; register in `app.module.ts`.
- [ ] **Step 6: tests + tsc + commit.** `npx jest --testPathPattern="src/job-boards/"` + `npx tsc --noEmit`.
```bash
cd "C:/D-drive/exam app/.claude/worktrees/job-boards" && test "$(git branch --show-current)" = "feat/job-boards" && git add apps/api/src/job-boards apps/api/src/app.module.ts && git commit -m "feat(job-boards): board CRUD gated org:manage_settings

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Per-board public feed

**Files:**
- Modify: `apps/api/src/public-applications/public-applications.service.ts` (add `getBoardFeed`) + `.controller.ts` (route)
- Test: `public-applications.service.spec.ts` (+ controller if it asserts routing)

**Interfaces:**
- Consumes: `JobBoard.feedToken` + `JobBoardPublication` (T1); `LOOKUP_ORG`; the existing `xmlCdata` helper + feed format in `getJobsFeed`.
- Produces: `GET /public/job-boards/:feedToken/feed.xml` → the board's published, publicly-applyable jobs as XML.

- [ ] **Step 1: failing test** in `public-applications.service.spec.ts`: mock `forTenant` → `tx.jobBoard.findUnique({ where: { feedToken } })` returns a board; `tx.job.findMany` returns published jobs. Assert:
  - `getBoardFeed(token)` returns the XML (same `<source><publisher>…` shape as `getJobsFeed`) for the board's jobs;
  - the job query filters on `organizationId: board.organizationId`, `status:'open'`, `publicApplyEnabled:true`, `applyToken:{ not: null }`, AND `jobBoardPublications: { some: { jobBoardId: board.id } }` (only jobs published to THIS board);
  - unknown `feedToken` → `NotFoundException`.
- [ ] **Step 2: implement `getBoardFeed`** mirroring `getJobsFeed` (LOOKUP_ORG `forTenant`; resolve the board by `feedToken`; `job.findMany` with the where above + the same `select`; reuse the `xmlCdata` entry format + `orgName` resolution). Throw `NotFoundException` if the board is missing.
- [ ] **Step 3: route** in `public-applications.controller.ts`: `@Get('job-boards/:feedToken/feed.xml')` → `this.service.getBoardFeed(feedToken)` (distinct segment; no collision with `jobs-feed.xml` or `jobs/:applyToken`). Match `getJobsFeed`'s response content-type handling.
- [ ] **Step 4: tests + tsc + commit.** `npx jest --testPathPattern="src/public-applications/"` + `npx tsc --noEmit`.
```bash
cd "C:/D-drive/exam app/.claude/worktrees/job-boards" && test "$(git branch --show-current)" = "feat/job-boards" && git add apps/api/src/public-applications && git commit -m "feat(job-boards): public per-board feed GET /public/job-boards/:feedToken/feed.xml

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Per-job board assignment (`pipeline:manage`)

**Files:**
- Modify: `apps/api/src/pipeline/dto/update-job.dto.ts` (add `jobBoardIds?`)
- Modify: `apps/api/src/pipeline/pipeline.service.ts` (job-update path — set the publication rows; expose current `jobBoardIds` on the job read)
- Test: `pipeline.service.spec.ts`

**Interfaces:**
- Consumes: `JobBoardPublication` (T1); `JobBoard` for same-org validation.
- Produces: `UpdateJobDto.jobBoardIds?: string[]`; job read returns `jobBoardIds: string[]`.

- [ ] **Step 1: DTO.** `@IsOptional() @IsArray() @IsUUID('4', { each: true }) jobBoardIds?: string[]`.
- [ ] **Step 2: failing tests** in `pipeline.service.spec.ts`: updating a job with `jobBoardIds` → validates every id is a `JobBoard` in the caller's org (reject cross-org/unknown → BadRequest); REPLACE-set the `JobBoardPublication` rows for that job (delete rows not in the set, create missing ones, each carrying `organizationId`); an empty array clears all; omitting the field leaves publications untouched. The job read (getBoard drawer / job detail — wherever the job is returned to the recruiter) includes `jobBoardIds`.
- [ ] **Step 3: implement** in the job-update method (near the `publicApplyEnabled`/`listOnCareers` handling): when `jobBoardIds !== undefined`, validate the ids resolve to same-org boards via `forTenant`, then reconcile the join rows (delete-missing + create-new, or deleteMany+createMany within the tenant tx). Add `jobBoardIds` to the job read projection (map `jobBoardPublications` → ids).
- [ ] **Step 4: tests + tsc + commit.** `npx jest --testPathPattern="src/pipeline/"` + `npx tsc --noEmit`.
```bash
cd "C:/D-drive/exam app/.claude/worktrees/job-boards" && test "$(git branch --show-current)" = "feat/job-boards" && git add apps/api/src/pipeline && git commit -m "feat(job-boards): per-job board selection (replace-set, same-org)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Web — boards settings page + per-job selector + nav

**Files:**
- Create: `apps/web/lib/hooks/useJobBoards.ts`
- Create: `apps/web/app/v2/(org-admin)/settings/job-boards/page.tsx`
- Modify: `apps/web/lib/super-admin-nav.ts` + `apps/web/lib/staff-nav.ts`
- Modify: the job edit UI (find via `grep -rl "publicApplyEnabled\|listOnCareers\|/jobs/" apps/web`) → add a board multi-select
- Modify: `apps/web/lib/types.ts` (types-only)
- Test: settings page test + (if a job-form test exists) the selector

**Interfaces:**
- Consumes: `GET/POST/PATCH/DELETE /organizations/job-boards` (T2); `jobBoardIds` on job update (T4).

- [ ] **Step 1: hook** `useJobBoards.ts` — authed apiFetch (list/create/update/delete boards); mirror an existing settings hook.
- [ ] **Step 2: failing settings-page test** — renders boards (name, published-job count, copy-able feed URL); create/rename/delete fire the right calls. Run the scoped web jest.
- [ ] **Step 3: settings page** `/v2/(org-admin)/settings/job-boards/page.tsx` (org_admin group): board list with name + feed URL (copy button) + published count; add/rename/delete. Deep-import ui; no shared VALUE import.
- [ ] **Step 4: per-job selector** — in the job edit UI, a multi-select of the org's boards (near the public-apply toggle); include `jobBoardIds` in the job update payload; if a board is selected but the job isn't open+public, show an inline hint that it also needs public apply to actually appear on the feed.
- [ ] **Step 5: nav** — `/settings/job-boards` in `super-admin-nav.ts` (icon) + `staff-nav.ts` `V2_ROUTES`.
- [ ] **Step 6: tests + tsc + commit.** scoped `npx jest` (web) + `npx tsc -p apps/web/tsconfig.json --noEmit` (ignore stale `.next/types`; no NEW errors; only the pre-existing ImpersonationBanner failure).
```bash
cd "C:/D-drive/exam app/.claude/worktrees/job-boards" && test "$(git branch --show-current)" = "feat/job-boards" && git add apps/web/lib apps/web/app/v2/'(org-admin)'/settings/job-boards apps/web/lib/super-admin-nav.ts apps/web/lib/staff-nav.ts && git commit -m "feat(job-boards): boards settings page + per-job selector + nav

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Coverage:** two tables + RLS (T1) ✓; board CRUD gated org:manage_settings (T2) ✓; public per-board feed with the 4-condition + published-to-board filter (T3) ✓; per-job replace-set assignment gated pipeline:manage (T4) ✓; web settings + selector + nav (T5) ✓. Off-by-default via no-boards/no-publications defaults; existing global feed + careers untouched.

**Placeholder scan:** No TBD. `feedUrl` derivation says "match how other public URLs are built" (concrete: check getJobsFeed/careers). T5 locates the job-form file via grep.

**Type/name consistency:** `JobBoard`, `JobBoardPublication`, `feedToken`, `jobBoardIds` spelled identically across T1 schema, T2 CRUD, T3 feed, T4 assignment, T5 web. Migration `240000/240001` > parked `210000/1` + `220000` + `230000/1`. Feed route segment `job-boards/:feedToken/feed.xml` distinct from `jobs-feed.xml` + `jobs/:applyToken` + `careers/:orgSlug`.

**Load-bearing risks:** (a) feed leak — the feed filter must AND all four public conditions with the published-to-board join; a merely-published non-public job must not appear — T3 tests it; (b) cross-org board assignment — T4 validates same-org; (c) feedToken opaque/unique (no org enumeration) — T1 unique + T2 randomUUID mint; (d) board delete cascades publications (benign) — T1 onDelete Cascade; (e) migration numbering after all parked branches.
