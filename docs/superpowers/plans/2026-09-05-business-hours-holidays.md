# Business Hours + Holidays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an org configure business hours + a holiday list, and warn (non-blocking) in the recruiter's interview slot picker when a proposed slot is outside hours or on a holiday.

**Architecture:** Two additive JSON columns on `Organization`; a shared pure `evaluateSlot` used by API validation and the web warning; org-settings GET/PATCH; a Business Hours settings page; a soft warning in `ScheduleInterviewModal`. No new tables/RLS, no backend scheduling change.

**Tech Stack:** NestJS + Prisma + SQL Server (apps/api); shared TS (packages/shared); Next.js React + React Query (apps/web).

**Spec:** `docs/superpowers/specs/2026-09-05-business-hours-holidays-design.md`

## Global Constraints

- **Data = two additive nullable JSON columns on `Organization`** (`businessHoursJson`, `holidaysJson`), `NVarChar(Max)`. One additive migration, no seed, no RLS (Organization is the tenant root; read/write via the same access the other org settings use).
- **Shared pure evaluator:** `evaluateSlot` + the `BusinessHours`/`Holiday` types live in `packages/shared` and are imported by BOTH api and web (web already imports `@exam-platform/shared`). It must be browser-safe (only `Intl`, no Node APIs).
- **Timezone correctness:** a slot's UTC instant is evaluated in the BUSINESS-HOURS timezone (not UTC/local) via `Intl.DateTimeFormat(…, { timeZone, weekday:'short', hour:'2-digit', minute:'2-digit', hour12:false })` + `formatToParts`.
- **Soft warning only:** no hard block, no change to interview creation / `apply()` / `CreateInterviewDto`.
- **Permissions:** PATCH business-hours gated by `@RequirePermissions('org:manage_settings')` (same as the other org settings); GET is authenticated-only (NO `@RequirePermissions`) so a plain recruiter's slot picker can read it — it returns only the two non-sensitive config blobs.
- **NEVER run `npm install`/`ci`/`update`** (worktree junction hazard; we are in the main checkout anyway). To make a new `packages/shared` export visible, rebuild the shared **dist** via its existing build (e.g. `npx tsc -p packages/shared/tsconfig.json` or the package's `build` script) — never `npm install`. This machine reports spurious mass jest failures under load — re-run a single spec isolated before concluding.
- Follow existing patterns: settings API mirrors `updatePipelineSettings`/`getIntegrations` in `organizations.service.ts`; web settings page + hooks mirror `useOrgPipelineSettings` and the `(org-admin)/settings/pipelines` page; nav entry added to `apps/web/lib/staff-nav.ts`.

---

## File Structure

- Create `packages/shared/src/scheduling/business-hours.ts` (+ `.spec.ts`); export from `packages/shared/src/index.ts`.
- Modify `apps/api/prisma/schema.prisma` (+ one migration).
- Create `apps/api/src/organizations/dto/update-business-hours.dto.ts`.
- Modify `apps/api/src/organizations/organizations.controller.ts` + `organizations.service.ts` (+ specs).
- Create `apps/web/lib/hooks/useBusinessHours.ts`; `apps/web/app/v2/(org-admin)/settings/business-hours/page.tsx` (+ test); modify `apps/web/lib/staff-nav.ts`.
- Modify `apps/web/app/v2/(recruiter)/jobs/ScheduleInterviewModal.tsx` (+ test).

---

### Task 1: Shared business-hours module (types + `evaluateSlot`)

**Files:**
- Create: `packages/shared/src/scheduling/business-hours.ts`, `packages/shared/src/scheduling/business-hours.spec.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces (produced — later tasks import these from `@exam-platform/shared`):**
```ts
export type Weekday = 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun';
export interface DayHours { enabled: boolean; open: string; close: string; }   // "HH:MM"
export interface BusinessHours { timeZone: string; days: Record<Weekday, DayHours>; }
export interface Holiday { date: string; name: string; }                        // date "YYYY-MM-DD"
export const WEEKDAYS: Weekday[];                                                // ['mon'..'sun']
export function evaluateSlot(
  startsAtIso: string, businessHours: BusinessHours | null, holidays: Holiday[],
): { outsideHours: boolean; holiday: string | null };
```

- [ ] **Step 1: Write failing tests** (`business-hours.spec.ts`): given a `BusinessHours` (Asia/Kolkata, mon–fri 09:00–18:00, sat/sun disabled) and a holiday `2026-01-26 Republic Day`:
  - a Tue 10:00 IST instant → `{ outsideHours:false, holiday:null }`;
  - a Tue 20:00 IST instant → `outsideHours:true`;
  - a Sunday instant → `outsideHours:true`;
  - the 2026-01-26 instant (in IST) → `holiday:'Republic Day'`;
  - **timezone proof:** an instant that is Tue 23:00 UTC but Wed 04:30 IST is evaluated as Wed (not Tue) — pick a case where the UTC weekday/hour differs from the IST one and assert the IST-based result;
  - `businessHours=null` → `{ outsideHours:false, holiday:null }` (no warning when unset).

- [ ] **Step 2: Run, verify RED.** Run: `cd packages/shared && npx jest src/scheduling/business-hours.spec.ts`

- [ ] **Step 3: Implement `business-hours.ts`.** `evaluateSlot`: if `!businessHours` return `{outsideHours:false, holiday:null}`. Use one `Intl.DateTimeFormat('en-US', { timeZone: businessHours.timeZone, weekday:'short', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false })` + `formatToParts(new Date(startsAtIso))` to derive: the local weekday (map `Mon`→`mon`…), the local `YYYY-MM-DD` (for holiday match), and local `HH:MM`. `holiday` = the matching holiday's `name` or null. `outsideHours` = day disabled OR `HH:MM < open` OR `HH:MM >= close` (string compare on zero-padded `HH:MM` is correct). A holiday does NOT force `outsideHours` (report both independently).

- [ ] **Step 4: Export from `index.ts`** — add `export * from './scheduling/business-hours';`.

- [ ] **Step 5: Run tests (GREEN); rebuild shared dist** so api/web resolve the new export: `npx tsc -p packages/shared/tsconfig.json` (or the package's build script). Do NOT `npm install`.

- [ ] **Step 6: Commit** `feat(scheduling): shared business-hours evaluateSlot + types`

---

### Task 2: Organization columns + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<ts>_organization_business_hours/migration.sql`

**Interfaces:** `Organization.businessHoursJson: String?`, `Organization.holidaysJson: String?` (Prisma).

- [ ] **Step 1: Add columns** to `model Organization` (near the other settings columns):
```prisma
businessHoursJson      String?           @map("business_hours_json") @db.NVarChar(Max)
holidaysJson           String?           @map("holidays_json") @db.NVarChar(Max)
```

- [ ] **Step 2: Author the migration.** Run `cd apps/api && npx prisma migrate dev --create-only --name organization_business_hours` (create-only). Verify the generated SQL is exactly two `ALTER TABLE [organizations] ADD [business_hours_json] NVARCHAR(max)` / `[holidays_json] NVARCHAR(max)` (nullable, no default). Folder name must sort after the latest existing migration.

- [ ] **Step 3: Apply + regenerate.** `npx prisma migrate deploy` (dev DB is up), then `npx prisma generate`. In the main checkout only; if the shadow DB is unavailable use `migrate deploy` (not `migrate dev`). Do NOT `npm install`.

- [ ] **Step 4: Commit** `feat(db): organization business_hours_json + holidays_json columns`

---

### Task 3: API — GET/PATCH business-hours

**Files:**
- Create: `apps/api/src/organizations/dto/update-business-hours.dto.ts`
- Modify: `apps/api/src/organizations/organizations.controller.ts`, `organizations.service.ts`
- Test: `organizations.service.spec.ts`, `organizations.controller.spec.ts`

**Interfaces:**
- Consumes: Task 1 types, Task 2 columns.
- Produces: `getBusinessHours(context) → { businessHours: BusinessHours | null; holidays: Holiday[] }`; `updateBusinessHours(context, userId, dto) → same`.

- [ ] **Step 1: DTO** `update-business-hours.dto.ts` — validate the shape from Task 1 with class-validator/nested DTOs: `businessHours` = `{ timeZone: string (valid IANA — validate via a custom check using `Intl.DateTimeFormat` in a try/catch), days: Record<Weekday, {enabled:boolean, open, close}> }` with all 7 weekdays present, `open`/`close` matching `/^\d{2}:\d{2}$/` and, when `enabled`, `open < close`; `holidays` = array (≤100) of `{ date: /^\d{4}-\d{2}-\d{2}$/, name: non-empty ≤120 }`.

- [ ] **Step 2: Failing tests.** Service: `getBusinessHours` returns parsed JSON (nulls/`[]` when columns unset); `updateBusinessHours` persists both columns (JSON-stringified) and round-trips; rejects (BadRequest via DTO/service) `open>=close`, a missing weekday, an invalid timeZone, a bad holiday date. Controller: GET has NO `@RequirePermissions` (authenticated only) and delegates; PATCH has `@RequirePermissions('org:manage_settings')` and delegates with `(tenant, userId, dto)`.

- [ ] **Step 3: Run, verify RED.**

- [ ] **Step 4: Implement.** In `organizations.service.ts` mirror `updatePipelineSettings`/`getIntegrations` (same tenant/prisma access they use): `getBusinessHours` reads `businessHoursJson`/`holidaysJson` off the org and `JSON.parse`s (guard nulls → `{businessHours:null, holidays:[]}`); `updateBusinessHours` writes `JSON.stringify(dto.businessHours)` / `JSON.stringify(dto.holidays)`. In `organizations.controller.ts` add `@Get('business-hours')` (no perm) and `@Patch('business-hours')` (`@RequirePermissions('org:manage_settings')`), mirroring the existing settings routes' signatures.

- [ ] **Step 5: Run tests (GREEN).**
- [ ] **Step 6: Commit** `feat(api): business-hours GET/PATCH org settings`

---

### Task 4: Settings UI — Business Hours page + nav entry

**Files:**
- Create: `apps/web/lib/hooks/useBusinessHours.ts`, `apps/web/app/v2/(org-admin)/settings/business-hours/page.tsx`, `.../business-hours/page.test.tsx`
- Modify: `apps/web/lib/staff-nav.ts`

**Interfaces:** Consumes Task 3 GET/PATCH + Task 1 types.

- [ ] **Step 1: Hooks** `useBusinessHours.ts` — `useBusinessHours()` (`useQuery` GET `/organizations/business-hours`, queryKey `['business-hours']`) + `useUpdateBusinessHours()` (`useMutation` PATCH, invalidates the key). Mirror `useOrgPipelineSettings`/`useUpdateOrgPipelineSettings` in `usePipelines.ts`. Import the shared `BusinessHours`/`Holiday`/`WEEKDAYS` types.

- [ ] **Step 2: Failing component test** (`page.test.tsx`, mock the hooks): renders the 7 weekday rows + timezone select + holiday rows seeded from the fetched config; Save calls the mutation with the edited `{ businessHours, holidays }`; adding/removing a holiday row updates the payload.

- [ ] **Step 3: Implement the page.** A timezone `<select>` (options from `Intl.supportedValuesOf('timeZone')`), a 7-row grid (each: enabled toggle + `open`/`close` `<input type="time">`), and a holidays editor (rows: `<input type="date">` + name text, add/remove buttons). Seed from `useBusinessHours()`; provide a sensible default when unset (all weekdays mon–fri enabled 09:00–17:00, sat/sun disabled, timezone = `Intl.DateTimeFormat().resolvedOptions().timeZone`). Save → `useUpdateBusinessHours().mutate(...)`. Reuse the v2 settings page/card styling + primitives from the sibling `settings/pipelines` page.

- [ ] **Step 4: Nav entry.** In `apps/web/lib/staff-nav.ts`: import `Clock` from `lucide-react` and add `{ href: '/settings/business-hours', label: 'Business hours', icon: Clock }` to `SUPER_ADMIN_FULL_NAV` in the settings cluster (near the other `/settings/*` entries), and add `'/settings/business-hours'` to the `V2_ROUTES` set so it renders at `/v2/settings/business-hours`. (If `SUPER_ADMIN_FULL_NAV` / `V2_ROUTES` live in a different file than expected, follow the import in `apps/web/app/v2/(org-admin)/layout.tsx` to the real source.)

- [ ] **Step 5: Run test + `npx tsc -p apps/web/tsconfig.json --noEmit 2>&1 | grep -v "\.next/types"`** (clean of this task's files).
- [ ] **Step 6: Commit** `feat(web): business hours settings page + nav`

---

### Task 5: Soft warning in the recruiter slot picker

**Files:**
- Modify: `apps/web/app/v2/(recruiter)/jobs/ScheduleInterviewModal.tsx`
- Test: a new/extended test beside it (e.g. `ScheduleInterviewModal.test.tsx`)

**Interfaces:** Consumes Task 1 `evaluateSlot` + Task 3 GET (via Task 4's `useBusinessHours`).

- [ ] **Step 1: Failing test.** Mock `useBusinessHours` to return mon–fri 09:00–18:00 IST + a holiday; render the modal, set a slot start to an off-hours time → an "Outside business hours" hint appears on that row; set another to a holiday date → an "On a holiday: {name}" hint; an in-hours weekday slot → no hint. Business hours unset → never any hint.

- [ ] **Step 2: Run, verify RED.**

- [ ] **Step 3: Implement.** Import `useBusinessHours` and `evaluateSlot`. For each slot row with a non-empty `start`, compute the UTC instant with the existing `zonedWallClockToUtcISO(slot.start, timeZone)` and call `evaluateSlot(iso, businessHours, holidays)`; if `outsideHours` or `holiday`, render a small inline hint under that row's inputs (muted/warning color, matching existing modal styles) — "Outside business hours" and/or "On a holiday: {name}". Purely presentational: do not disable Add/Send, do not change the submit payload. If `useBusinessHours` errors or returns null config, render no hints (recruiters without `org:manage_settings` can still GET it since the route is authenticated-only, but tolerate failure gracefully).

- [ ] **Step 4: Run test + `npx tsc -p apps/web/tsconfig.json --noEmit 2>&1 | grep -v "\.next/types"`.**
- [ ] **Step 5: Commit** `feat(web): off-hours/holiday warning in interview slot picker`

---

## Self-review notes

- **Spec coverage:** shared evaluator (T1), columns+migration (T2), GET/PATCH API with the permission split (T3), settings UI + nav (T4), soft warning (T5). All spec sections mapped.
- **Type consistency:** `BusinessHours`/`Holiday`/`Weekday`/`WEEKDAYS` defined once in `packages/shared` (T1) and imported by API DTO/service (T3), web hooks/page (T4), and the modal (T5). GET/PATCH payload shape `{ businessHours, holidays }` identical across T3/T4/T5.
- **No RLS/seed;** one additive migration. Soft-warning-only: interview creation, `apply()`, and `CreateInterviewDto` untouched. GET authenticated-only so the recruiter picker can read; PATCH gated by `org:manage_settings`.
- **Shared-dist gotcha** (T1 step 5): rebuild dist so web/api resolve the new export; never `npm install`.
