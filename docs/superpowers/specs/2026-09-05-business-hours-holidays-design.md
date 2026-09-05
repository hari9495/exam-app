# Business Hours + Holidays — Design Spec

**Date:** 2026-09-05
**Status:** Approved design, ready for implementation planning.
**Source:** Zoho adopt inventory #2 (General → Company Details → Business Hours + Holidays). See `docs/ats/zoho-adopt-inventory.md`.

## Goal

Let an org configure its **business hours** (per-weekday working hours + timezone) and a **holiday list**, and surface a **non-blocking warning** in the recruiter's interview slot picker when a proposed slot falls outside business hours or on a holiday.

## Why

Recruiters currently pick interview slots with no calendar awareness, so it's easy to propose a slot at 2am or on a public holiday. Storing business hours + holidays and flagging off-hours/holiday slots is a small quality-of-life win and the foundation Zoho uses for scheduling and (future) SLA/time-to-fill accuracy. v1 is a soft warning — recruiters can still legitimately schedule off-hours.

## Decisions (locked during brainstorming)

1. **Scope = store + soft warning.** Config + settings UI, plus a non-blocking warning in the recruiter slot picker. No hard block, no backend scheduling change.
2. **Data = two additive JSON columns on `Organization`** (`businessHoursJson`, `holidaysJson`). No new tables, no RLS migration.
3. **One org-level holiday list.** No per-location lists, no split-shift/multi-interval days (Zoho has these — out of scope).
4. **The warning is frontend-computed** (in the slot picker) via `Intl.DateTimeFormat` — no new date/tz library, no backend scheduling validation.

## Existing code this builds on

- `apps/api/prisma/schema.prisma` — `model Organization` (line ~28) uses flat columns; add two nullable columns. Note `Interview.timeZone` / `InterviewSlot` already exist; interview slots are free-form (`CreateInterviewDto.slots` = 1–20 `{startsAt,endsAt}` datetimes, no calendar validation) — unchanged by this feature.
- `apps/api/src/organizations/organizations.controller.ts` — org-settings endpoints are `@Get`/`@Patch` guarded by `@RequirePermissions('org:manage_settings')` (e.g. `getUsage`, `getIntegrations`, `updateSmtpSettings`, `updatePipelineSettings`). Add the business-hours GET/PATCH here, same guard.
- `apps/api/src/organizations/organizations.service.ts` + `dto/update-pipeline-settings.dto.ts` — the GET/PATCH-settings pattern (read subset of Organization, patch it) to mirror.
- `apps/web/lib/hooks/usePipelines.ts` → `useOrgPipelineSettings`/`useUpdateOrgPipelineSettings` — the web GET/PATCH settings-hook pattern (React Query + `apiFetch`).
- `apps/web/app/v2/(org-admin)/settings/pipelines/page.tsx` (and sibling settings pages) — the v2 settings-page pattern for the new Business Hours page. (Sidebar note: settings pages live in the `(org-admin)` group; the standard sidebar is built by `apps/web/lib/staff-nav.ts` — a nav entry may be added there.)
- `apps/web/app/v2/(recruiter)/jobs/ScheduleInterviewModal.tsx` — the recruiter's interview slot picker; the soft warning renders here.

## Architecture

### 1. Data model — two JSON columns on `Organization`

- `businessHoursJson String? @map("business_hours_json") @db.NVarChar(Max)` — JSON:
  ```json
  { "timeZone": "Asia/Kolkata",
    "days": { "mon": {"enabled": true, "open": "09:00", "close": "18:00"}, "...": "…sun" } }
  ```
  All 7 keys `mon,tue,wed,thu,fri,sat,sun` present; a disabled day means "not a working day".
- `holidaysJson String? @map("holidays_json") @db.NVarChar(Max)` — JSON array `[{ "date": "2026-01-01", "name": "New Year's Day" }]`.
- One additive migration (two columns). No seed, no backfill, no RLS (columns on the tenant-root Organization row, read/written via `forTenant` scoped to the org id like the other settings).
- **Shared types + a pure evaluator** live in `packages/shared` so both API (validation) and web (warning) use one definition: `BusinessHours`, `Holiday` types, and `evaluateSlot(startsAtISO, businessHours, holidays): { outsideHours: boolean; holiday: string | null }` — pure, timezone-correct via `Intl.DateTimeFormat(…, { timeZone, weekday, hour, minute })` to derive the slot's local weekday + HH:MM in the business-hours timezone.

### 2. API — GET/PATCH on the organizations controller

- `GET /organizations/business-hours` → `{ businessHours: BusinessHours | null, holidays: Holiday[] }` (parsed from the columns; nulls when unset). `@RequirePermissions('org:manage_settings')`.
- `PATCH /organizations/business-hours` → body `{ businessHours: BusinessHours, holidays: Holiday[] }`; validates and persists both (JSON-stringified). Same guard.
- **Validation** (DTO + service): every weekday present; `open`/`close` match `^\d{2}:\d{2}$` and represent a valid time with `open < close` when the day is enabled; `timeZone` is a valid IANA zone (validate via `Intl.supportedValuesOf('timeZone')` or a try/catch `Intl.DateTimeFormat`); each holiday `date` matches `^\d{4}-\d{2}-\d{2}$` and `name` non-empty, length-capped; holiday list length-capped (e.g. ≤100).
- The GET is also consumed by the recruiter slot picker; recruiters have a read need — expose the read without requiring `org:manage_settings` OR add a recruiter-accessible read. **Decision:** the slot picker reads business hours via a read that recruiters can call. Since recruiters may lack `org:manage_settings`, the GET route used by the picker must be readable by any authenticated staff member (like `getBranding` is un-permissioned). Implement GET as authenticated-only (no `@RequirePermissions`) returning just the two config blobs (non-sensitive); keep PATCH gated by `org:manage_settings`.

### 3. Settings UI — new Business Hours page

- New page `apps/web/app/v2/(org-admin)/settings/business-hours/page.tsx` + hooks `useBusinessHours`/`useUpdateBusinessHours` (mirror `useOrgPipelineSettings`/`useUpdateOrgPipelineSettings`).
- A timezone `<select>` (from `Intl.supportedValuesOf('timeZone')`), a 7-row weekday grid (enabled toggle + open/close time inputs), and a holidays editor (rows of date + name, add/remove), with a Save button → PATCH. Reuse existing v2 settings styling + primitives.
- Add a "Business hours" entry to the standard staff nav (`apps/web/lib/staff-nav.ts` / `SUPER_ADMIN_FULL_NAV`) in the settings cluster, gated the same way the other settings entries are.

### 4. Scheduling integration — soft warning in the slot picker

- In `ScheduleInterviewModal.tsx`, fetch business hours + holidays (the authenticated GET). For each proposed slot, call the shared `evaluateSlot(slot.startsAt, businessHours, holidays)`; if `outsideHours` or `holiday`, render an inline non-blocking hint next to that slot ("Outside business hours" / "On a holiday: {name}"). Submission is unaffected — no disable, no block.
- If business hours are unset (null), show no warnings.
- No backend interview-creation change; `apply()` and interview endpoints untouched.

## Testing

- **Shared:** `evaluateSlot` unit tests — inside hours (no warning); before open / after close (outsideHours); disabled weekday (outsideHours); a holiday date (holiday name returned); a timezone case proving the slot's instant is evaluated in the business-hours zone, not UTC/local; unset config → no warning.
- **API:** GET returns parsed config (and nulls when unset); PATCH persists + round-trips; validation rejects bad times (`open >= close`), bad weekday set, invalid timeZone, bad holiday date; PATCH gated by `org:manage_settings`, GET readable by a non-admin staff role.
- **Web:** settings page saves the config; slot picker shows the warning for an off-hours slot and a holiday slot and none for an in-hours slot.

## Out of scope (v1)

- Per-location / multiple holiday lists; split shifts / multiple intervals per day.
- Hard blocking of off-hours slots (soft warning only).
- SLA / time-to-fill computed in business hours (no SLA feature exists yet).
- Calendar sync, auto-suggesting in-hours slots, recurring-holiday import.

## Deploy notes

- One additive migration (two nullable columns), no seed, no RLS — ships with any api/web build, independent of the deferred migration chain. Safe: unset config = no behavior change (no warnings, nothing enforced).
