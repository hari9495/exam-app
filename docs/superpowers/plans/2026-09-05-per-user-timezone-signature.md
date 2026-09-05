# Per-User Timezone + Email Signature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-user `timeZone` + `emailSignature` to the profile; timezone seeds the interview slot picker, signature appends to manually-sent candidate emails.

**Architecture:** Two additive nullable `User` columns; extend the "me" profile update + response; add profile-form fields; wire two consumers (slot-picker default, candidate-email signature append). No new tables/RLS/seed.

**Tech Stack:** NestJS + Prisma + SQL Server (apps/api); Next.js React + React Query (apps/web).

**Spec:** `docs/superpowers/specs/2026-09-05-per-user-timezone-signature-design.md`

## Global Constraints

- **Data = two additive nullable `User` columns** (`timeZone`, `emailSignature`), one additive migration, no seed/RLS.
- **Type/select sync (important):** `SafeUser = Omit<User, 'passwordHash' | 'avatarPath'>` (type) is returned by `findMany({ select: SAFE_USER_SELECT })` etc. Adding User columns makes the `SafeUser` type include them, so the runtime `SAFE_USER_SELECT` must stay in sync or TS breaks. Chosen split: **`timeZone` goes in `SAFE_USER_SELECT`** (small, benign); **`emailSignature` is EXCLUDED from `SafeUser`** (add it to the `Omit`) and selected only where needed (profile + the email-send actor lookup) — so 2000-char signatures never bloat staff-list responses.
- **Signature append is auto-escaped:** `buildCandidateEmailHtml` does `escapeHtml(bodyText).replace(/\r?\n/g, '<br />')`, so append the raw signature text to `rendered.body` (with a `\n\n--\n` separator) BEFORE `buildCandidateEmailHtml` — do NOT pre-escape or inject HTML. Append only when `actorUserId` is set and the actor has a non-empty signature; system sends (`actorUserId === null`) are unchanged.
- **Empty string → null** for both fields on save. `timeZone` validated as a real IANA zone.
- Self-scoped: the "me" route uses `@CurrentUserId()`; a user edits only their own.
- **NEVER run `npm install`/`ci`/`update`** (worktree junction hazard; main checkout). This machine reports spurious mass jest failures under load — re-run a single spec isolated before concluding. Web tsc: ignore pre-existing `.next/types/validator.ts` errors.

---

## File Structure

- Modify `apps/api/prisma/schema.prisma` (+ one migration).
- Modify `apps/api/src/users/dto/update-profile.dto.ts`, `apps/api/src/users/users.service.ts` (+ spec).
- Modify `apps/api/src/candidate-emails/candidate-emails.service.ts` (+ spec).
- Modify `apps/web/components/ProfileForm.tsx` + the web current-user type (`apps/web/lib/hooks/useCurrentUser.ts` / `apps/web/lib/types.ts`) (+ test).
- Modify `apps/web/app/v2/(recruiter)/jobs/ScheduleInterviewModal.tsx` (+ test).

---

### Task 1: User columns + migration

**Files:** Modify `apps/api/prisma/schema.prisma`; create `apps/api/prisma/migrations/<ts>_user_timezone_signature/migration.sql`.

**Interfaces:** `User.timeZone: String?`, `User.emailSignature: String?`.

- [ ] **Step 1:** Add to `model User` (near `name`/`managerId`):
```prisma
timeZone       String?  @map("time_zone")
emailSignature String?  @map("email_signature") @db.NVarChar(Max)
```
- [ ] **Step 2:** Author migration: `cd apps/api && npx prisma migrate dev --create-only --name user_timezone_signature`. Verify it's exactly two additive `ALTER TABLE [users] ADD [time_zone] NVARCHAR(1000)` (or Prisma's default string length) / `[email_signature] NVARCHAR(max)`, nullable, no default. Folder sorts after the latest existing migration.
- [ ] **Step 3:** Apply + regenerate: `npx prisma migrate deploy` then `npx prisma generate`. If the shadow DB is unavailable, hand-author matching a precedent (e.g. `20260905130000_organization_business_hours`) and apply via `migrate deploy`. Never `npm install`. If the dev DB is unreachable, STOP + report BLOCKED with the error.
- [ ] **Step 4: Commit** `feat(db): user time_zone + email_signature columns`

---

### Task 2: Profile API — DTO + updateMe + selects/types

**Files:** Modify `apps/api/src/users/dto/update-profile.dto.ts`, `apps/api/src/users/users.service.ts`; extend `apps/api/src/users/users.service.spec.ts`.

**Interfaces:**
- Consumes: Task 1 columns.
- Produces: `updateMe`/`getMe` accept + return `timeZone` and `emailSignature`; `ProfileUser` includes both.

- [ ] **Step 1: DTO** — add to `UpdateProfileDto`. Since the DTO is currently name-required, keep `name` required but make the new fields optional; `updateMe` must do a PARTIAL update (only write keys present):
```ts
@IsOptional() @IsString() timeZone?: string;
@IsOptional() @IsString() @MaxLength(2000) emailSignature?: string;
```
(Also add a custom IANA check for `timeZone` — reuse the approach from `apps/api/src/organizations/dto/update-business-hours.dto.ts` (its timezone validator), or a small `@Validate` doing `try { new Intl.DateTimeFormat(undefined, { timeZone }); } catch { fail }`. Empty string is allowed and means "clear".)

- [ ] **Step 2: Failing tests** (service spec): `updateMe` persists + returns `timeZone`/`emailSignature`; a `''` for either normalizes to `null`; omitting a field leaves it unchanged (partial update — only `name` sent → tz/sig untouched); `getMe` returns them.

- [ ] **Step 3: Run, verify RED.**

- [ ] **Step 4: Implement.**
  - `SafeUser` type: change to `Omit<User, 'passwordHash' | 'avatarPath' | 'emailSignature'>` (exclude signature from the general safe shape).
  - `SAFE_USER_SELECT`: add `timeZone: true`.
  - `PROFILE_USER_SELECT`: `{ ...SAFE_USER_SELECT, avatarPath: true, emailSignature: true }`.
  - `ProfileUser` type: `SafeUser & { avatarUrl: string | null; emailSignature: string | null }`.
  - `toProfileResponse`: unchanged shape works (`{ ...safe, avatarUrl }` — `safe` now carries `timeZone` + `emailSignature`); ensure the return typechecks against `ProfileUser`.
  - `updateMe`: build `data` from present DTO keys: `{ name: dto.name, ...(dto.timeZone !== undefined ? { timeZone: dto.timeZone || null } : {}), ...(dto.emailSignature !== undefined ? { emailSignature: dto.emailSignature || null } : {}) }`.
  - Confirm nothing else that returns `SafeUser` now breaks (list endpoints select `SAFE_USER_SELECT` which now includes `timeZone` — fine; they never needed `emailSignature`).

- [ ] **Step 5: Run tests (GREEN).**
- [ ] **Step 6: Commit** `feat(api): timezone + signature on me-profile update`

---

### Task 3: Signature consumer — append in sendMessage

**Files:** Modify `apps/api/src/candidate-emails/candidate-emails.service.ts`; extend `apps/api/src/candidate-emails/candidate-emails.service.spec.ts`.

**Interfaces:** Consumes Task 1 column (`User.emailSignature`).

- [ ] **Step 1: Failing tests:** `sendMessage` with an `actorUserId` whose user has `emailSignature` → the created row's `renderedBody` ends with the separator + signature; a user with null/empty signature → body unchanged; `actorUserId === null` → no signature; a signature containing `<`/`&` is NOT pre-escaped in `renderedBody` (it's escaped later by `buildCandidateEmailHtml`) — assert `renderedBody` contains the raw signature text and the HTML sent contains the escaped form.

- [ ] **Step 2: Run, verify RED.**

- [ ] **Step 3: Implement.** In `sendMessage`'s Phase-1 actor lookup (currently `select: { name: true }`), add `emailSignature: true` and return it. After `renderTemplate(...)`, before `buildCandidateEmailHtml`:
```ts
const signature = actorUserId ? (prepared.actorSignature ?? '').trim() : '';
const bodyWithSignature = signature ? `${rendered.body}\n\n--\n${signature}` : rendered.body;
```
Use `bodyWithSignature` for BOTH `buildCandidateEmailHtml({ bodyText: bodyWithSignature })` and the stored `renderedBody`. (Rename the prepared field, e.g. `actorSignature`, alongside `actorName`.) Do not touch the `actorName`/merge-field logic.

- [ ] **Step 4: Run tests (GREEN)** + run the existing candidate-emails suite to confirm no regression.
- [ ] **Step 5: Commit** `feat(candidate-emails): append sender signature on manual sends`

---

### Task 4: Web — profile fields + current-user type

**Files:** Modify `apps/web/components/ProfileForm.tsx`; the web current-user type (`apps/web/lib/hooks/useCurrentUser.ts` and/or `apps/web/lib/types.ts`); add/extend `apps/web/components/ProfileForm.test.tsx`.

**Interfaces:** Consumes Task 2 API (`useCurrentUser` now returns `timeZone`/`emailSignature`; `useUpdateProfile` accepts them).

- [ ] **Step 1:** Extend the web current-user type to include `timeZone: string | null` and `emailSignature: string | null` (follow `useCurrentUser`'s existing return type; mirror how `avatarUrl` is typed). Ensure `useUpdateProfile`'s mutation input allows `{ name?; timeZone?; emailSignature? }`.

- [ ] **Step 2: Failing test** (`ProfileForm.test.tsx`, mock the hooks): the Profile section renders a timezone control seeded from `user.timeZone` and a signature textarea seeded from `user.emailSignature`; saving calls `useUpdateProfile` mutate with the edited `{ timeZone, emailSignature }`.

- [ ] **Step 3: Implement.** In `ProfileForm`'s Profile `CollapsibleSection`, add a **Timezone** `<select>` (options from `Intl.supportedValuesOf('timeZone')`, plus a blank "Use browser default" → `''`/null, and include the stored value if not in the list) and an **Email signature** `<textarea>` (maxLength 2000). Seed from `useCurrentUser()`; on save call `updateProfile.mutate({ timeZone, emailSignature })` (can be its own Save button or fold into the existing profile save — match the file's section conventions). Reuse the old-kit `Input`/`Button`/`CollapsibleSection`/toast patterns already in the file.

- [ ] **Step 4: Run test + `npx tsc -p apps/web/tsconfig.json --noEmit 2>&1 | grep -v "\.next/types"`** (clean of your files).
- [ ] **Step 5: Commit** `feat(web): timezone + signature fields on profile`

---

### Task 5: Web — slot picker seeds from user timezone

**Files:** Modify `apps/web/app/v2/(recruiter)/jobs/ScheduleInterviewModal.tsx`; add/extend `ScheduleInterviewModal.test.tsx`.

**Interfaces:** Consumes Task 4's extended current-user type (`timeZone`).

- [ ] **Step 1: Failing test** (mock `useCurrentUser` + the interview/users hooks; the `ui-v2` barrel may need the same `DataTable` jest-mock other v2 modal tests use): when `useCurrentUser` returns `timeZone: 'Asia/Kolkata'`, the modal's timezone control defaults to it; when `timeZone` is null, it falls back to the browser zone.

- [ ] **Step 2: Run, verify RED.**

- [ ] **Step 3: Implement.** Import `useCurrentUser`. Change the `timeZone` initial state (currently `Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'`) to `currentUser?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'` (initialize once from the loaded user; if the user loads after mount, seed via a `useEffect` that only sets the default when the user hasn't manually changed the zone yet — keep it simple: initialize lazily from a ref/first-load). If the resulting zone isn't in `TIME_ZONE_OPTIONS`, add it to the options list so the Combobox displays it. No other modal behavior changes; submit payload unchanged.

- [ ] **Step 4: Run test + filtered tsc.**
- [ ] **Step 5: Commit** `feat(web): interview slot picker defaults to user timezone`

---

## Self-review notes

- **Spec coverage:** columns (T1), profile API + type-sync (T2), signature append (T3), profile UI (T4), slot-picker seed (T5).
- **Type consistency:** `timeZone` added to `SAFE_USER_SELECT` (keeps `SafeUser` type/select in sync); `emailSignature` excluded from `SafeUser`, added to `PROFILE_USER_SELECT` + `ProfileUser` + the email-send actor select — no staff-list bloat, no TS break. Web current-user type gains both (T4) before T5 consumes `timeZone`.
- **Security/behavior:** signature appended pre-escape to `rendered.body` (escaped by `buildCandidateEmailHtml`); manual sends only; empty→null; partial profile update; additive migration, no seed/RLS.
