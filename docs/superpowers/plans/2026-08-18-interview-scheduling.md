# Interview Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At the pipeline `interview` stage, a recruiter proposes 1–N time slots + panel + location, emails the candidate an invite (confirm/decline/reschedule via a public tokenized page) and the panel; on confirmation everyone gets an ICS invite; assigned interviewers get an in-app "My interviews" view.

**Architecture:** Three new per-org tables (`Interview`, `InterviewSlot`, `InterviewPanelist`). A pure ICS builder + interview renderer. `InterviewsService` mirrors the offers feature: create → sendInvite (three-phase, send outside the tenant tx) → public confirm/decline/reschedule (anti-oracle, atomic transition). Frontend: schedule modal + interviews section on the candidate drawer, a public interview page, and a panel `(panel)/interviews` page.

**Tech Stack:** NestJS 11 (apps/api), Next.js 16 (apps/web), Prisma + Azure SQL, Jest, React Query. No new dependency (ICS is hand-written).

## Global Constraints

- **Reuse the offers skeleton** (`apps/api/src/offers/offers.service.ts`): three-phase send (short tx read/mint → **email OUTSIDE any `forTenant`** → short tx write); `LOOKUP_ORG='00000000-0000-0000-0000-000000000000'` + `isSuperAdmin:true` token resolution with a **generic** `NotFoundException`; atomic `updateMany({ where: { …, status } })` with a generic `ConflictException` on `count===0`. Public controller: `@Controller('public')` + `@UseGuards(PublicApplicationsThrottlerGuard)` + `@Throttle(STRICT_WALK_IN_THROTTLE)`, NO `JwtAuthGuard` (`apps/api/src/offers/public-offers.controller.ts`).
- **SMTP + ICS send OUTSIDE the tenant tx** (feature-1/2 lesson).
- **Reuse render/send:** `buildCandidateEmailHtml` + `renderTemplate` (`apps/api/src/candidate-emails/candidate-email-render.ts`); `EmailService.send({ …, attachments })` (`apps/api/src/email/email.service.ts:71`). Panel/recruiter notifications email the staff `User.email` directly (no `CandidateEmail` log).
- **Org-scoped, no Organization/User FK:** `organizationId`/`candidateId`/`userId`/`sentByUserId`/`confirmedSlotId` are plain `@db.UniqueIdentifier` columns, NO `@relation` (P1012-safe, matches `Offer`). The ONLY relations are the intra-feature FKs (`InterviewSlot.interviewId`, `InterviewPanelist.interviewId`, `Interview.pipelineEntryId`), all `onDelete: Cascade`. `confirmedSlotId` is a plain column (NOT an FK — an FK back to `InterviewSlot` would create an interviews↔interview_slots cycle → SQL Server error). RLS predicates for the 3 tables in a **separate** migration.
- **Permission:** recruiter routes `@RequirePermissions('pipeline:manage')`; the panel view `@RequirePermissions('interview:view_assigned')` (NEW key seeded via the migration onto `panel`/`recruiter`/`org_admin`); public routes unauthenticated + throttled.
- **Timezone:** slot times stored UTC; the interview carries an IANA `timeZone`; render with `Intl.DateTimeFormat(locale, { timeZone })`. ICS `DTSTART`/`DTEND` in UTC basic format (`YYYYMMDDTHHMMSSZ`).
- **GDPR:** never invite an `erasedAt != null` candidate; erase redacts the candidate's interviews.
- `FRONTEND_URL` → `${FRONTEND_URL}/interview/<interviewToken>`.
- **Interviewer list:** reuse `GET /users` / `useUsers()` (org-scoped).
- Tests: api `npx jest --config apps/api/jest.config.js <pat>`; web `cd apps/web && npx jest <pat>` (read `apps/web/AGENTS.md`).

---

### Task 1: Schema + migrations (3 tables + RLS + permission seed)

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260823090000_interviews/migration.sql`
- Create: `apps/api/prisma/migrations/20260823090001_interviews_rls/migration.sql`

**Interfaces:** Produces models `Interview`, `InterviewSlot`, `InterviewPanelist`; tables `interviews`, `interview_slots`, `interview_panelists`; permission `interview:view_assigned`.

- [ ] **Step 1: Add models to `schema.prisma`** (after `Offer`). No Org/User relation; `confirmedSlotId` plain column.

```prisma
model Interview {
  id                   String              @id @default(uuid()) @db.UniqueIdentifier
  organizationId       String              @map("organization_id") @db.UniqueIdentifier
  pipelineEntryId      String              @map("pipeline_entry_id") @db.UniqueIdentifier
  candidateId          String              @map("candidate_id") @db.UniqueIdentifier
  status               String              @default("proposed")
  interviewToken       String?             @unique @map("interview_token")
  location             String              @db.NVarChar(Max)
  timeZone             String              @map("time_zone")
  recruiterNote        String?             @map("recruiter_note") @db.NVarChar(Max)
  confirmedSlotId      String?             @map("confirmed_slot_id") @db.UniqueIdentifier
  candidateReschedNote String?             @map("candidate_resched_note") @db.NVarChar(Max)
  sentByUserId         String?             @map("sent_by_user_id") @db.UniqueIdentifier
  sentAt               DateTime?           @map("sent_at")
  respondedAt          DateTime?           @map("responded_at")
  createdAt            DateTime            @default(now()) @map("created_at")
  updatedAt            DateTime            @updatedAt @map("updated_at")
  pipelineEntry        PipelineEntry       @relation(fields: [pipelineEntryId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  slots                InterviewSlot[]
  panelists            InterviewPanelist[]

  @@index([organizationId, pipelineEntryId])
  @@index([organizationId, candidateId])
  @@map("interviews")
}

model InterviewSlot {
  id             String    @id @default(uuid()) @db.UniqueIdentifier
  organizationId String    @map("organization_id") @db.UniqueIdentifier
  interviewId    String    @map("interview_id") @db.UniqueIdentifier
  startsAt       DateTime  @map("starts_at")
  endsAt         DateTime  @map("ends_at")
  interview      Interview @relation(fields: [interviewId], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@index([interviewId])
  @@map("interview_slots")
}

model InterviewPanelist {
  id             String    @id @default(uuid()) @db.UniqueIdentifier
  organizationId String    @map("organization_id") @db.UniqueIdentifier
  interviewId    String    @map("interview_id") @db.UniqueIdentifier
  userId         String    @map("user_id") @db.UniqueIdentifier
  interview      Interview @relation(fields: [interviewId], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@unique([interviewId, userId])
  @@index([organizationId, userId])
  @@map("interview_panelists")
}
```
Add back-relation on `PipelineEntry`: `interviews Interview[]`.

- [ ] **Step 2: Schema migration** `20260823090000_interviews/migration.sql` — 3 `CREATE TABLE` (all `NVARCHAR(MAX)` for location/notes, `DATETIME2` for times, `created_at` DEFAULT `GETUTCDATE()`, `interview_token` UNIQUE), the 3 indexes per table + the `interview_panelists` unique `[interview_id, user_id]`, and 3 FKs (`interviews.pipeline_entry_id → pipeline_entries`, `interview_slots.interview_id → interviews`, `interview_panelists.interview_id → interviews`), all `ON DELETE CASCADE ON UPDATE NO ACTION`. Then the **permission seed** (idempotent, copied from `20260818090000_ats_pipeline` lines 94-105 pattern):
```sql
-- Seed interview:view_assigned onto panel/recruiter/org_admin (seed.ts does not run on deploy).
DECLARE @ivPermId UNIQUEIDENTIFIER = NEWID();
IF NOT EXISTS (SELECT 1 FROM dbo.permissions WHERE [key] = 'interview:view_assigned')
  INSERT INTO dbo.permissions (id, [key], description)
  VALUES (@ivPermId, 'interview:view_assigned', 'View interviews you are assigned to as a panelist');
DECLARE @ivPid UNIQUEIDENTIFIER = (SELECT id FROM dbo.permissions WHERE [key] = 'interview:view_assigned');
IF NOT EXISTS (SELECT 1 FROM dbo.role_permissions WHERE role = 'panel' AND permission_id = @ivPid)
  INSERT INTO dbo.role_permissions (role, permission_id) VALUES ('panel', @ivPid);
IF NOT EXISTS (SELECT 1 FROM dbo.role_permissions WHERE role = 'recruiter' AND permission_id = @ivPid)
  INSERT INTO dbo.role_permissions (role, permission_id) VALUES ('recruiter', @ivPid);
IF NOT EXISTS (SELECT 1 FROM dbo.role_permissions WHERE role = 'org_admin' AND permission_id = @ivPid)
  INSERT INTO dbo.role_permissions (role, permission_id) VALUES ('org_admin', @ivPid);
```
Also add `interview:view_assigned` to `apps/api/prisma/seed.ts` (`PERMISSIONS` + `ROLE_PERMISSIONS` for panel/recruiter/org_admin) so fresh dev DBs get it.

- [ ] **Step 3: RLS migration** `20260823090001_interviews_rls/migration.sql` — `ALTER SECURITY POLICY dbo.TenantAccessPolicy ADD` 9 predicates (FILTER + BLOCK-INSERT + BLOCK-UPDATE for each of `interviews`, `interview_slots`, `interview_panelists`), reusing `dbo.fn_tenant_access_predicate(organization_id)` (pattern: `20260822090001_offers_rls`). Separate migration (ALTER SECURITY POLICY can't share a batch with CREATE TABLE).

- [ ] **Step 4:** `npx prisma generate --schema=apps/api/prisma/schema.prisma` (no P1012 — no Org/User relations, no confirmedSlotId FK), `npx prisma validate` → valid. Do NOT run migrate dev/deploy.

- [ ] **Step 5: Commit** `git add apps/api/prisma && git commit -m "feat(interviews): Interview + slots + panelists schema + RLS + permission seed"`

---

### Task 2: Pure ICS builder + interview renderer

**Files:**
- Create: `apps/api/src/interviews/interview-ics.ts`, `apps/api/src/interviews/interview-render.ts`
- Test: `apps/api/src/interviews/interview-ics.spec.ts`, `apps/api/src/interviews/interview-render.spec.ts`

**Interfaces:**
- `buildInterviewIcs(d: { uid: string; startsAt: Date; endsAt: Date; summary: string; location: string; description: string }): string`
- `formatSlot(startsAt: Date, endsAt: Date, timeZone: string): string`
- `InterviewMergeContext = { candidateName; jobTitle; orgName; recruiterName; interviewTimes; interviewLocation; panelNames; confirmLink }`
- `renderInterviewTemplate(subject: string, body: string, ctx: InterviewMergeContext): { subject; body }`

- [ ] **Step 1: Failing tests.** ICS: assert output starts `BEGIN:VCALENDAR`, contains `BEGIN:VEVENT`, a `DTSTART:` in UTC basic format (`/DTSTART:\d{8}T\d{6}Z/`), the summary, and that a comma/newline in `location` is escaped (`\,` / `\n`), CRLF line endings (`\r\n`). render: all 8 tokens replaced, unknown passthrough. formatSlot: a fixed UTC instant formatted in `America/New_York` shows the ET time (assert the string contains the expected hour + a TZ indicator).

- [ ] **Step 2: Run → FAIL.** `cd "D:/exam app" && npx jest --config apps/api/jest.config.js "interviews/interview-ics|interviews/interview-render"`

- [ ] **Step 3: Implement.**
`interview-ics.ts`:
```ts
function icsEscape(s: string): string { return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
function toIcsUtc(d: Date): string { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); } // YYYYMMDDTHHMMSSZ
export function buildInterviewIcs(d: { uid: string; startsAt: Date; endsAt: Date; summary: string; location: string; description: string }): string {
  return [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//exam-app//interview//EN','CALSCALE:GREGORIAN','METHOD:REQUEST',
    'BEGIN:VEVENT',`UID:${d.uid}`,`DTSTAMP:${toIcsUtc(new Date(0))}`,`DTSTART:${toIcsUtc(d.startsAt)}`,`DTEND:${toIcsUtc(d.endsAt)}`,
    `SUMMARY:${icsEscape(d.summary)}`,`LOCATION:${icsEscape(d.location)}`,`DESCRIPTION:${icsEscape(d.description)}`,
    'END:VEVENT','END:VCALENDAR',
  ].join('\r\n');
}
```
(Note: `DTSTAMP` uses `new Date(0)` so the output is deterministic for tests; if a real timestamp is wanted pass it in — but a fixed DTSTAMP is harmless for a single REQUEST and keeps tests stable. Do NOT call `Date.now()` in the pure module.)
`interview-render.ts`: `renderInterviewTemplate` mirrors `candidate-email-render.ts`'s `renderTemplate` with the 8-token regex. `formatSlot(startsAt, endsAt, timeZone)` → `new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone }).format(startsAt)` + `' – '` + the end time + `' (' + timeZone + ')'`.

- [ ] **Step 4: Run → PASS**, then commit
```bash
git add apps/api/src/interviews/interview-ics.ts apps/api/src/interviews/interview-render.ts apps/api/src/interviews/interview-ics.spec.ts apps/api/src/interviews/interview-render.spec.ts
git commit -m "feat(interviews): pure ICS builder + interview renderer"
```

---

### Task 3: InterviewsService create/list/listMine + controllers + module

**Files:**
- Create: `apps/api/src/interviews/interviews.service.ts`, `interviews.controller.ts`, `public-interviews.controller.ts` (stub for now — routes added in Task 5), `interviews.module.ts`, `dto/create-interview.dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `interviews.service.spec.ts`, `interviews.controller.spec.ts`

**Interfaces:**
- `InterviewsService.createInterview(context, actorUserId, entryId, dto): Promise<Interview>`; `listForEntry(context, entryId)`; `listForCandidate(context, candidateId)`; `listMine(context, userId)`; `cancel(context, actorUserId, interviewId)`.
- `InterviewsModule` exports `InterviewsService`.

- [ ] **Step 1: Failing tests.** `createInterview`: requires ≥1 slot (else BadRequest), validates each `panelistUserId` is an org user (`tx.user.findMany({ where: { id: { in }, organizationId } })` — count mismatch → BadRequest), creates the interview (status `proposed`) + slots + panelists in one `forTenant` tx, audit `interview.created`, `candidateId` from the entry. `listMine`: returns interviews where an `InterviewPanelist.userId === userId` (org-scoped join), NOT other users' interviews. `cancel`: status → `cancelled`, audit. Controller spec: 401 when guards reject + delegation.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement.** `create-interview.dto.ts`: `slots: { startsAt: ISO @IsDateString; endsAt: ISO @IsDateString }[] @ArrayMinSize(1) @ValidateNested`, `panelistUserIds: string[] @IsUUID('4', { each: true })` (may be empty), `location: string @IsString`, `timeZone: string @IsString`, `recruiterNote?: string`.
`createInterview` in a `forTenant` tx: verify entry org-scoped (NotFound else); if `panelistUserIds.length`, `const found = await tx.user.findMany({ where: { id: { in: panelistUserIds }, organizationId }, select: { id: true } })`, throw BadRequest if `found.length !== panelistUserIds.length`; `tx.interview.create({ data: { organizationId, pipelineEntryId: entryId, candidateId: entry.candidateId, status: 'proposed', location, timeZone, recruiterNote, slots: { create: dto.slots.map(s => ({ organizationId, startsAt: new Date(s.startsAt), endsAt: new Date(s.endsAt) })) }, panelists: { create: panelistUserIds.map(userId => ({ organizationId, userId })) } }, include: { slots: true, panelists: true } })`; audit `interview.created`. `listForEntry`/`listForCandidate` → `interview.findMany({ where: { organizationId, … }, include: { slots: true, panelists: true }, orderBy: { createdAt: 'desc' } })`. `listMine(context, userId)` → `interview.findMany({ where: { organizationId, panelists: { some: { userId } } }, include: { slots: true } , orderBy: { createdAt: 'desc' } })`. `cancel` → org-scoped, set `cancelled`, audit `interview.cancelled`.
`interviews.controller.ts` (guards + `@RequirePermissions('pipeline:manage')`): `POST pipeline/entries/:id/interviews`→create; `GET pipeline/entries/:id/interviews`→listForEntry; `GET candidates/:id/interviews`→listForCandidate; `POST interviews/:id/cancel`→cancel. **Plus** `GET interviews/mine` gated `@RequirePermissions('interview:view_assigned')` → `listMine(tenant, currentUserId)`.
`interviews.module.ts`: `imports: [EmailModule]` (StorageModule not needed — no blobs), providers `[InterviewsService]`, controllers `[InterviewsController]` (+ public controller in Task 5), exports `[InterviewsService]`. Mirror `offers.module.ts`. Register in `app.module.ts`.

- [ ] **Step 4: Run → PASS**, tsc, commit
```bash
git add apps/api/src/interviews apps/api/src/app.module.ts
git commit -m "feat(interviews): create/list/listMine service + recruiter + panel controllers + module"
```

---

### Task 4: sendInvite (three-phase, candidate + panel emails outside tx)

**Files:**
- Modify: `apps/api/src/interviews/interviews.service.ts`, `interviews.controller.ts`
- Test: `interviews.service.spec.ts` (extend)

**Interfaces:** `InterviewsService.sendInvite(context, actorUserId, interviewId): Promise<Interview>`.

- [ ] **Step 1: Failing tests.** Three-phase: (1) short tx loads interview+entry+candidate+slots+panelists (guard erased → BadRequest; guard status `proposed` else BadRequest), mints `interviewToken` if absent; (2) OUTSIDE tx `emailService.send` to the candidate (subject/body rendered, `confirmLink` = `${FRONTEND_URL}/interview/${token}`, slot list via `formatSlot`) and one `emailService.send` per panelist (to each panel `user.email`); (3) short tx set `sentAt`+`sentByUserId`, audit `interview.invited`. Assert (invocation order) the candidate + panel `emailService.send` calls run BETWEEN the two `forTenant` calls (not inside). Erased candidate → no send. Non-proposed → BadRequest.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** `sendInvite` (mirror `OffersService.sendOffer`'s 3-phase). Phase 1 loads via `tx.interview.findFirst({ where: { id, organizationId }, include: { pipelineEntry: { include: { candidate: true, job: true } }, slots: { orderBy: { startsAt: 'asc' } }, panelists: true } })`; guard; mint token; also resolve panelist emails: `tx.user.findMany({ where: { id: { in: panelistUserIds }, organizationId }, select: { id: true, email: true, name: true } })`; read org name/logo + actor name. Phase 2 (outside): `interviewTimes = slots.map(s => formatSlot(s.startsAt, s.endsAt, timeZone)).join('\n')`; render candidate subject/body (built-in copy + `recruiterNote`), `buildCandidateEmailHtml`, `emailService.send({ to: candidate.email, …, organizationId })`; for each panelist `emailService.send({ to: panelist.email, subject: 'Interview panel assignment: <candidate> for <job>', html: buildCandidateEmailHtml({ logoUrl: null, orgName: null, bodyText: `You are assigned to interview ${candidateName} for ${jobTitle}.\nProposed times:\n${interviewTimes}\nLocation: ${location}\n(Pending the candidate's confirmation.)` }), organizationId })`. Phase 3 set sentAt/sentByUserId, audit `interview.invited` (on send failure, `interview.send_failed`, leave status). Controller: `POST interviews/:id/send`→sendInvite (`pipeline:manage`).

- [ ] **Step 4: Run → PASS**, tsc, commit
```bash
git add apps/api/src/interviews
git commit -m "feat(interviews): sendInvite (candidate + panel emails outside tenant tx)"
```

---

### Task 5: Public confirm/decline/reschedule + ICS + notifications + GDPR scrub

**Files:**
- Modify: `apps/api/src/interviews/interviews.service.ts`, `public-interviews.controller.ts`, `interviews.module.ts`
- Create: `apps/api/src/interviews/dto/respond-interview.dto.ts`
- Modify: `apps/api/src/candidates/candidates.service.ts` (erase scrub) + spec
- Modify: `apps/api/src/public-applications/public-applications.throttler.guard.ts` (token param, if needed)
- Test: `public-interviews.controller.spec.ts`, `interviews.service.spec.ts` (extend), `candidates.service.spec.ts`

**Interfaces:** `getPublicInterview(token)`; `respondPublic(token, { action: 'confirm'|'decline'|'reschedule', slotId?, note? })`.

- [ ] **Step 1: Failing tests.** `getPublicInterview`: LOOKUP_ORG resolution, returns safe fields (jobTitle, orgName, slots[{id,startsAt,endsAt}], location, timeZone, panel first names, status, confirmedSlotId); unknown token → generic NotFound. `respondPublic('confirm', { slotId })`: guard `status==='proposed'` (generic Conflict else); `slotId` must belong to the interview (else generic Conflict); atomic `updateMany({ where: { id, organizationId, status:'proposed' }, data: { status:'confirmed', confirmedSlotId: slotId, respondedAt } })`, `count===0 → Conflict`; audit `interview.confirmed` (actor null); THEN OUTSIDE tx: email candidate a confirmation **with `buildInterviewIcs` as an attachment** for the chosen slot, email each panelist final time + the ICS, notify the recruiter. `decline`/`reschedule` (with note → `candidateReschedNote`): status transition, notify recruiter, no ICS. Assert the notify/confirm emails run OUTSIDE the tx. wrong token → NotFound. GDPR erase: interview scrub asserted.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement.** `respond-interview.dto.ts`: `action @IsIn(['confirm','decline','reschedule'])`, `slotId? @IsUUID`, `note? @IsString @MaxLength(1000)`. `resolveInterviewByToken` mirrors offers (LOOKUP_ORG + generic NotFound). `getPublicInterview` re-opens `forTenant({ organizationId, isSuperAdmin: true })` to load job/org/panel. `respondPublic`: pre-guards; for `confirm`, verify `slotId ∈ interview.slots` (load slots in the resolve, generic Conflict if not); atomic `updateMany`; audit (actor null); outside tx, build the confirmation email + `buildInterviewIcs({ uid: interviewId, startsAt: slot.startsAt, endsAt: slot.endsAt, summary: 'Interview: <candidate> — <job>', location, description: recruiterNote ?? '' })`, `emailService.send({ to: candidate.email, …, attachments: [{ filename: 'interview.ics', content: Buffer.from(ics) }] })`, one per panelist with the same ICS, and a recruiter notify (via `sentByUserId` user email — escape candidate/job through `buildCandidateEmailHtml`, per the offers final-review lesson). `public-interviews.controller.ts` (`@Controller('public')` + throttler + `@Throttle`, NO JwtAuthGuard): `GET public/interviews/:token`→getPublicInterview; `POST public/interviews/:token/respond`→respondPublic; register in `InterviewsModule`. Throttler: add the interview `token` param name to `getTracker` if not already covered.
GDPR erase (`candidates.service.ts` erase()): `tx.interview.updateMany({ where: { candidateId, organizationId }, data: { interviewToken: null, location: 'Redacted', recruiterNote: null, candidateReschedNote: null } })` (no blobs to delete). Test asserts it.

- [ ] **Step 4: Run → PASS**, whole api suite for touched areas + tsc, commit
```bash
git add apps/api/src/interviews apps/api/src/candidates apps/api/src/public-applications
git commit -m "feat(interviews): public confirm/decline/reschedule + ICS + notifications + GDPR scrub"
```

---

### Task 6: Frontend — interviews on the candidate drawer (list + schedule modal)

**Files:**
- Modify: `apps/web/lib/types.ts`
- Create: `apps/web/lib/hooks/useInterviews.ts`, `apps/web/components/pipeline/ScheduleInterviewModal.tsx`
- Modify: `apps/web/components/pipeline/CandidateDrawer.tsx`
- Test: `ScheduleInterviewModal.test.tsx`, extend `CandidateDrawer.test.tsx`

**Interfaces:** `Interview`/`InterviewSlot` web types; `useCandidateInterviews(candidateId)`, `useCreateInterview(entryId, candidateId)`, `useSendInterview(candidateId)`, `useCancelInterview(candidateId)`.

- [ ] **Step 1: Read `apps/web/AGENTS.md`.** Mirror `useOffers.ts` + `CreateOfferModal.tsx` (feature #2) for the hook/modal patterns, and `useUsers()` for the panel picker.
- [ ] **Step 2: Types + failing tests.** `ScheduleInterviewModal.test.tsx`: add/remove slot rows (date+start+end), panel multi-select from a mocked `useUsers`, timezone select, Send calls create then send. Extend `CandidateDrawer.test.tsx`: Interviews section renders from a mocked `useCandidateInterviews` (status badge + confirmed/proposed time); Cancel on a proposed interview calls `useCancelInterview`.
- [ ] **Step 3: Implement** hooks (keys `['candidate-interviews', candidateId]`, invalidation, `apiFetch`+`accessToken` like `useOffers`), `ScheduleInterviewModal` (repeatable slot rows via `<input type="datetime-local">` or date+time inputs converted to ISO; a panel multi-select filtered from `useUsers`; a timezone `<select>` from a small curated IANA list with a sensible default; location + note; **Send** = create then send), and the `CandidateDrawer` **Interviews** section (list + status + Schedule + Cancel). Reuse the no-SMTP banner. Then `cd apps/web && npx jest ScheduleInterviewModal CandidateDrawer && npx tsc --noEmit`.
- [ ] **Step 4: Commit** `git add apps/web && git commit -m "feat(interviews): candidate-drawer interviews list + schedule modal"`

---

### Task 7: Frontend — public interview page + panel "My interviews" page

**Files:**
- Create: `apps/web/app/(candidate)/interview/[token]/page.tsx` (+ test)
- Create: `apps/web/app/(panel)/interviews/page.tsx` (+ test)
- Modify: `apps/web/lib/hooks/useInterviews.ts` (public fetch + respond; `useMyInterviews`)
- Modify: the panel nav (`apps/web/app/(panel)/layout.tsx` — add an "Interviews" link)

**Interfaces:** consumes `GET /public/interviews/:token`, `POST /public/interviews/:token/respond`, `GET /interviews/mine`.

- [ ] **Step 1: Failing tests.** public page: renders slots + location + panel; a single slot → Confirm/Decline/Reschedule; multiple slots → a radio-select then Confirm posts `{action:'confirm', slotId}`; Decline posts `{action:'decline'}`; Reschedule with a note posts `{action:'reschedule', note}`; a `confirmed`/`declined`/`cancelled` status renders a closed state (no action buttons). panel page: renders `useMyInterviews` rows (candidate, job, confirmed time in the interview timezone, location); empty state.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.** Clone `app/(candidate)/offer/[token]/page.tsx` for the public interview page (fetch-then-POST, `TerminalCard`/`CandidateButton`, closed-state gating on `status !== 'proposed'`; render times via `new Intl.DateTimeFormat(undefined, { dateStyle:'full', timeStyle:'short', timeZone: data.timeZone })`). Panel page: `useMyInterviews()` (`GET /interviews/mine`, key `['my-interviews']`) → a table; gate is server-side (`interview:view_assigned`), but the `(panel)` layout already restricts the route group. Add the nav link in the panel layout. Then `cd apps/web && npx jest "interview/\[token\]" "(panel)/interviews" && npx tsc --noEmit`.
- [ ] **Step 4: Commit** `git add apps/web && git commit -m "feat(interviews): public confirm page + panel my-interviews page"`

---

### Task 8: Whole-feature verification

**Files:** none.

- [ ] **Step 1: Full backend suite + typecheck.** `cd "D:/exam app" && npx jest --config apps/api/jest.config.js && npx tsc -p apps/api/tsconfig.json --noEmit` (heavy suites may time out only under full concurrency — re-run failures targeted; exam-runtime untouched).
- [ ] **Step 2: Full web suite + typecheck.** `cd "D:/exam app/apps/web" && npx jest --maxWorkers=2 && npx tsc --noEmit`
- [ ] **Step 3: Browser smoke (post-deploy).** Schedule an interview with 2 slots + a panelist (org with SMTP); open the public link; pick a slot + confirm; verify the candidate + panelist get the ICS, the recruiter is notified, and `(panel)/interviews` shows it (as the panelist); decline a second interview and confirm the closed state.
- [ ] **Step 4: Proceed to the final whole-branch review + finishing-a-development-branch.**

---

## Self-Review

**Spec coverage:**
- 3 tables (no Org/User FK; confirmedSlotId plain col; Cascade FKs; GETUTCDATE; RLS split) + permission seed → Task 1. ✅
- ICS builder (no dep, UTC, escaped) + interview renderer + timezone formatting → Task 2. ✅
- create (≥1 slot, panelist org-validation) + list + listMine + cancel + recruiter/panel controllers + module → Task 3. ✅
- sendInvite three-phase (candidate + panel emails OUTSIDE tx) → Task 4. ✅
- public confirm/decline/reschedule (anti-oracle, atomic transition, slot-belongs check) + ICS on confirm to candidate+panel + recruiter notify + GDPR scrub → Task 5. ✅
- candidate-drawer interviews + schedule modal (slots, panel multi-select, timezone) → Task 6. ✅
- public interview page + panel my-interviews page + nav → Task 7. ✅
- verification → Task 8. ✅
- Out-of-scope (calendar sync, availability, recurring, candidate-proposed times, scorecards, reminders) → not built. ✅

**Placeholder scan:** no TBD/TODO; every code step carries real code. Decisions made explicit: `confirmedSlotId` is a plain column not an FK (avoids the interviews↔slots cycle); a reschedule is a new interview (no in-place edit); ICS `DTSTAMP` uses a fixed epoch to stay deterministic + avoid `Date.now()` in a pure module.

**Type consistency:** `createInterview(context, actorUserId, entryId, dto)`, `sendInvite`/`respondPublic`/`listMine`/`cancel`, `buildInterviewIcs(...)`, `renderInterviewTemplate(subject, body, ctx)`, `Interview` status values (`proposed|confirmed|declined|reschedule_requested|cancelled`), the `respond` action enum (`confirm|decline|reschedule`) — used consistently across tasks. `EmailService.send` attachment shape `{ filename, content: Buffer }` matches feature #2.

**SQL Server safety:** all 3 tables are `CREATE TABLE` (no EXEC); `created_at` GETUTCDATE; RLS split; the only FKs are the intra-feature Cascades (single-path chains `pipeline_entries → interviews → {slots,panelists}`, no fan-in, no cycle since `confirmedSlotId` is not an FK). The permission-seed block INSERTs into pre-existing global tables (idempotent) — safe alongside the CREATE TABLEs (same as the ATS migration).
