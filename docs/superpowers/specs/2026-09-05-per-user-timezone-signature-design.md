# Per-User Timezone + Email Signature — Design Spec

**Date:** 2026-09-05
**Status:** Approved design, ready for implementation planning.
**Source:** Zoho adopt inventory #3 (General → Personal Settings — Locale/timezone + email Signature). See `docs/ats/zoho-adopt-inventory.md`.

## Goal

Give each staff user a personal **timezone** and **email signature** on their profile. The timezone seeds the interview slot picker's default; the signature is appended to candidate emails the user sends manually.

## Why

Recruiters in different zones currently get the browser's timezone guessed for every interview, and every candidate email ends with the org shell but no personal sign-off. Two small profile fields fix both, reusing the existing profile-update and candidate-email-send paths.

## Decisions (locked during brainstorming)

1. **Fields = `timeZone` + `emailSignature` only.** Language and date/time-format prefs are OUT (English-only per the inventory; no i18n/format consumer exists — would be a large, separate build).
2. **Both are wired**, not store-only: timezone seeds `ScheduleInterviewModal`; signature appends to manually-sent candidate emails.
3. **Signature is plain text** (line breaks preserved), not a rich-text/HTML editor. Appended only when a real user sends (actorUserId set); system/automated sends are unchanged.
4. **No new tables/RLS/seed** — two additive nullable `User` columns.

## Existing code this builds on

- `apps/api/prisma/schema.prisma` — `model User` (has `name`, `avatarPath`, `managerId`, etc.; NO timezone/signature). Add two nullable columns.
- `apps/api/src/users/users.service.ts`:
  - `updateMe(context, userId, dto: UpdateProfileDto)` (line ~210) currently writes `data: { name: dto.name }` — extend to also write `timeZone`/`emailSignature`.
  - `PROFILE_USER_SELECT` (line ~55) and `toProfileResponse`/`ProfileUser` — add the two fields so `getMe`/`updateMe` return them.
- `apps/api/src/users/dto/update-profile.dto.ts` (the `UpdateProfileDto` used by `updateMe`) — add the two optional fields with validation.
- `apps/api/src/users/users.controller.ts` — the self `PATCH` "me" route that calls `updateMe` (already `@CurrentUserId()`-scoped; no route change beyond the DTO).
- `apps/web/components/ProfileForm.tsx` — old-kit profile form (Profile `CollapsibleSection`); add the two fields, saved via the existing `useUpdateProfile` (`apps/web/lib/hooks/useCurrentUser.ts`) + the `ProfileUser`/current-user type in `apps/web/lib/types.ts` (or wherever `useCurrentUser` types live).
- `apps/web/app/v2/(recruiter)/jobs/ScheduleInterviewModal.tsx` — seeds `timeZone` state from `Intl.DateTimeFormat().resolvedOptions().timeZone` (line ~67); change to prefer the user's stored zone.
- `apps/api/src/candidate-emails/candidate-emails.service.ts` `sendMessage` (line ~27): the actor lookup at line ~52-54 already fetches the sending user's `name`; extend to also select `emailSignature`; the email body is `rendered.body` (plain text) wrapped by `buildCandidateEmailHtml({ bodyText })` at line ~71 — the signature is appended to `bodyText`. `resend` routes through `sendMessage` with the actor, so it inherits signature behavior.

## Architecture

### 1. Data model — two `User` columns

```prisma
timeZone        String?  @map("time_zone")
emailSignature  String?  @map("email_signature") @db.NVarChar(Max)
```
One additive migration (two nullable columns). No seed, no RLS.

### 2. Profile API

- `UpdateProfileDto` gains: `@IsOptional() @IsString() timeZone?` (valid IANA — custom check via try/catch `new Intl.DateTimeFormat(undefined, { timeZone })`; empty string → stored as null), and `@IsOptional() @IsString() @MaxLength(2000) emailSignature?` (empty string → null).
- `updateMe` writes the provided fields (partial update — only set keys present in the DTO; `''` normalizes to `null`). Never changes fields the DTO omits.
- `PROFILE_USER_SELECT` + `ProfileUser` (and the web current-user type) include `timeZone` and `emailSignature` so the profile round-trips and consumers can read them.
- Self-scoped: the "me" route already uses `@CurrentUserId()`; a user edits only their own.

### 3. Profile UI (`ProfileForm.tsx`)

In the Profile `CollapsibleSection`, add:
- A **Timezone** `<select>` (options from `Intl.supportedValuesOf('timeZone')`; include the current stored value even if absent from the list; a blank "Use browser default" option maps to null).
- An **Email signature** `<textarea>` (plain text, maxlength 2000).
Seed both from `useCurrentUser()`; save via `useUpdateProfile.mutate({ timeZone, emailSignature })`. Follow the form's existing save/toast pattern (they can share the name form's save or use their own "Save" — match the file's existing section conventions).

### 4. Consumers

- **Timezone → interview slot picker:** `ScheduleInterviewModal` initializes `timeZone` from `currentUser?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'` (via `useCurrentUser`). If the stored zone isn't in the modal's curated `TIME_ZONE_OPTIONS`, add it to the option list so the Combobox shows it. Everything else in the modal is unchanged.
- **Signature → manual candidate emails:** in `sendMessage`, extend the actor lookup to `select: { name: true, emailSignature: true }`. After `renderTemplate`, if `actorUserId` is set and the actor has a non-empty `emailSignature`, append it to `rendered.body` with a separator (e.g. `\n\n--\n` + signature) BEFORE `buildCandidateEmailHtml`. Confirm `buildCandidateEmailHtml` renders `bodyText` newlines as line breaks (it wraps plain text into the HTML shell); the signature must render the same way the body does (same escaping/newline handling — no raw HTML injection from user signature text). System sends (`actorUserId === null`) append nothing.

### 5. Testing

- **API:** `updateMe` persists + returns `timeZone`/`emailSignature`; invalid IANA `timeZone` rejected; over-long signature rejected; empty strings normalize to null; omitted fields untouched (partial update).
- **Signature consumer:** `sendMessage` with an `actorUserId` whose user has a signature → the sent body/renderedBody ends with the signature (separator + text); a user with no signature → body unchanged; `actorUserId === null` (system) → no signature; signature text with HTML-special chars is escaped like the body (no injection).
- **Timezone consumer:** the slot picker seeds from `user.timeZone` when set and falls back to the browser zone when unset (component test mocking `useCurrentUser`).

## Out of scope (v1)

- Language / i18n; date & time format preferences (no consumer without an i18n/format layer).
- Rich-text / HTML signature editor (plain text only).
- Signature on automated/triggered candidate emails, and on non-candidate mail (invitations, offers, interview invites).
- Reporting-hierarchy / name-format / personal-theme personal-settings (separate inventory items).

## Deploy notes

- Two additive nullable columns, no seed/RLS — ships with any api/web build, independent of the deferred migration chain. Unset fields = today's behavior (browser tz, no signature).
