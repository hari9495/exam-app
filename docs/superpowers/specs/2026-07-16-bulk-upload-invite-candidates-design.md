# Bulk Upload & Invite Candidates — Design Spec

## Context & Scope

Recruiters currently add candidates one at a time via a form, then separately select existing candidates by checkbox and click "Send invitations" to bulk-invite them to a chosen exam. A backend endpoint (`POST /candidates/bulk`) already bulk-creates/updates candidates from raw CSV text, but it has no frontend UI and does not send invitations.

This feature adds a single upload flow — mirroring the just-shipped Bulk Question Upload feature — where a recruiter uploads an Excel (`.xlsx`) or CSV file of candidates for a chosen exam, and the system creates (or updates) each candidate and sends them an invitation in the same step. Partial success applies exactly as it does for question upload: every valid row is processed immediately, bad rows are reported back with the reason.

This is a new endpoint and screen — the existing `POST /candidates/bulk` (JSON `csvContent` body, no invitations) is left untouched, since it has a different request shape and no known UI consumer to migrate.

## Scope Decisions

- New endpoint: `POST /candidates/bulk-upload-invite`, multipart file upload (matching the question-upload's `FileInterceptor('file')` pattern), taking the file plus an `examId`. The existing `POST /candidates/bulk` is not modified or reused.
- Both `.xlsx` and CSV are supported, matching the question-upload precedent. Same 500-row / 5MB limits: file size is rejected before parsing; row count is checked immediately after parsing and before any candidate is created or invited (matching the question-upload feature's actual, accepted behavior — not a stricter pre-parse row count).
- If an uploaded row's email matches an existing candidate, that candidate's `name`/`phone` are updated (not treated as an error) and they proceed to the invite step — matching the existing `bulkUpload`'s create-or-update semantics.
- The target exam must be `published`; this is checked once, up front, for the whole file (reusing `InvitationsService.bulkInvite`'s existing check) — not per row.
- Results are reported as three distinct sets, never merged:
  - `created`: candidates who received a fresh invitation.
  - `skipped`: valid candidates who already had a live invitation to this exam — informational, nothing to fix.
  - `errors`: rows that failed to parse or validate (missing/invalid email, missing name) — the recruiter needs to fix and re-upload just these.
- A single exam picker (published exams only, required before upload) drives the whole file — mirroring the existing checkbox-invite flow's `Select`.
- A "Download template" affordance ships alongside the upload control, matching the question-upload precedent.
- Same permission gate as the existing candidate-management actions: `candidate:manage`.

## Data Model

No schema changes. Every row produces a `Candidate` (created or updated) and, for rows that don't hit the "already invited" skip condition, an `Invitation` — using the exact same tables, fields, and token/expiry logic (`resolveInvitationExpiry`, `generateToken`) that `InvitationsService.bulkInvite`/`resend` already use today.

## Template Format

Three columns: `Email` (required, validated as an email shape), `Name` (required), `Phone` (optional). One example row.

## API

`POST /candidates/bulk-upload-invite`, guarded by `JwtAuthGuard` + `PermissionsGuard` + `RequirePermissions('candidate:manage')`, using `FileInterceptor('file')` with the same `MODERATE_UPLOAD_THROTTLE` tier as the question upload. Request carries the file plus `examId` (form field alongside the file).

Processing order:
1. Reject up front (before parsing) on wrong file type, file >5MB.
2. Validate the exam exists, belongs to the org, and is `published` — reject the whole request if not (matching `bulkInvite`'s existing behavior).
3. Parse the file (CSV or `.xlsx`) into `{email, name, phone}` rows plus structural row errors (reusing/extending the existing `parseCandidateCsv` logic into a dual-format parser, following the question-upload's `bulk-upload-parser.ts` shape). Reject if parsed row count exceeds 500.
4. For each valid row: create or update the candidate by email (matching `CandidatesService.bulkUpload`'s existing logic), then attempt to invite that candidate to the exam (matching `InvitationsService.bulkInvite`'s existing per-candidate logic — skip if already has a live invitation, otherwise create the `Invitation` and fire-and-forget the email).
5. Return `{ created: Invitation[], skipped: { email: string, reason: string }[], errors: { row: number, message: string }[] }`.

`GET /candidates/bulk-upload-invite/template` — same `exceljs`-generated download pattern as the question template, same permission gate.

## Frontend

A "Bulk upload & invite" button on the Candidates page (`apps/web/app/(recruiter)/candidates/page.tsx`), opening a screen with:
- The same exam picker (published exams only) already used by the checkbox-invite flow.
- A "Download template" link.
- A file input accepting `.xlsx`/`.csv`.
- An "Upload & invite" button, disabled until an exam is selected and a file is chosen.
- After submission: an invited count, a skipped list (email + reason) if any, and an error table (row + message) if any — same layout shape as the Bulk Upload Questions screen's result panel.

## Error Handling

- Whole-file/whole-request rejections (wrong file type, oversized file, too many rows, exam not published) surface as a single toast before any row is processed.
- Per-row errors and per-row skips never block other rows — this is the core partial-success behavior, not a fallback.
- Network/server errors use the same `onError` toast pattern established across this session's other bulk-upload/mutation flows.

## Testing

- **Backend unit**: parser tests (CSV + XLSX, valid rows, structural errors) and service tests covering create-vs-update-by-email, skip-if-already-invited, and exam-not-published rejecting the whole request before any row processing.
- **Backend e2e**: one spec uploading a real file with a mix of a brand-new candidate, an existing candidate (update path), an already-invited candidate (skip path), and a malformed row (error path) — asserting the exact three-way split and that the created invitations are real, retrievable rows.
- **Frontend unit**: the new screen's exam-picker gating, upload flow, and result rendering (created/skipped/errors).
- **Playwright**: extends the existing recruiter golden path with a bulk-upload-and-invite step, following the same pattern as the question-upload's Playwright extension.
