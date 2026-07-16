# Bulk Question Upload — Design Spec

## Context & Scope

Recruiters currently create questions one at a time via the Question Bank's "New question" form. Building out a question bank of any real size means repeating that form dozens or hundreds of times. This feature adds a **bulk upload**: a recruiter fills in an Excel (`.xlsx`) or CSV template with many questions and uploads it once, creating every valid row as a real question bank entry in a single request.

This is question-bank creation only. It does not touch exam composition — a bulk-uploaded question is attached to an exam section the same way any other bank question is, via the existing "Manage questions" picker on the exam builder. No new "assign to exam" step is added to the upload flow itself.

## Scope Decisions

- The upload template uses fixed option columns (`Option1Text`/`Option1Correct` through `Option6Text`/`Option6Correct`) rather than a single delimited column — simpler to fill in Excel, no delimiter-escaping for recruiters to get wrong. Six option slots cover every question type this platform supports today with headroom; unused slots are left blank.
- Partial success: every row that passes validation is created immediately as a real question; rows that fail are reported back with their row number and the specific reason, so the recruiter can fix and re-upload only what's broken. The bank never rejects an entire good-faith upload over one bad row.
- Bulk-uploaded questions land in the shared Question Bank only — never auto-assigned into an exam section. This matches every other question-creation path in the app (single create, AI-generate) and keeps question authoring and exam composition as separate concerns.
- Limits: 500 data rows, 5MB file size. Both enforced up front, before any row parsing begins.
- A "Download template" file (pre-filled `.xlsx` with headers and one example row per question type) ships alongside the upload control, so the column format is self-documenting rather than something the recruiter has to divine from docs.

## Data Model

No schema changes. Every uploaded row maps to the existing `CreateQuestionDto` shape and produces a `Question` + `QuestionOption[]` + `QuestionTag[]` exactly as `POST /questions` already does — the same `Question`/`QuestionOption`/`Tag`/`QuestionTag` tables, no new columns or tables.

## Template Format

One header row, columns (case-sensitive header names):

| Column | Required | Values |
|---|---|---|
| `Type` | always | `single_mcq` \| `multi_mcq` \| `true_false` \| `code` |
| `Text` | always | question text |
| `Difficulty` | always | `easy` \| `medium` \| `hard` |
| `Marks` | always | integer ≥ 1 |
| `NegativeMarks` | optional | integer, `0 ≤ NegativeMarks ≤ Marks`; blank defaults to 0 |
| `Topic` | optional | free text |
| `Category` | optional | free text |
| `Tags` | optional | semicolon-separated tag names, e.g. `sql;backend` (commas are the CSV field separator, so semicolons avoid ambiguity) |
| `CodeLanguage` | required when `Type=code` | one of `javascript, typescript, python, java, csharp, cpp, go, ruby` |
| `StarterCode` | optional, `code` only | free text |
| `Option1Text` … `Option6Text` | required for `single_mcq`/`multi_mcq`/`true_false` | blank slots beyond what a row needs are ignored |
| `Option1Correct` … `Option6Correct` | required alongside each filled `OptionNText` | `TRUE` or `FALSE` |

Per-type option/correctness rules are identical to today's single-create validation (`apps/api/src/questions/question-validation.ts`) and are not restated per row — the same `validateQuestionPayload()` function governs both paths:
- `code`: no option columns filled; `CodeLanguage` required.
- `true_false`: exactly 2 option columns filled; exactly 1 marked correct.
- `single_mcq`: at least 2 option columns filled; exactly 1 marked correct.
- `multi_mcq`: at least 2 option columns filled; at least 1 marked correct.

## API

`POST /questions/bulk-upload`, guarded by `JwtAuthGuard` + `PermissionsGuard` + `RequirePermissions('question_bank:manage')` — identical permission gate to `POST /questions`. Uses `FileInterceptor('file')` (the same interceptor pattern as the existing branding-logo upload at `apps/api/src/organizations/organizations.controller.ts`), throttled with the existing `MODERATE_UPLOAD_THROTTLE` tier (10 requests/60s).

Request-level (whole-file) rejections, checked before any row is parsed:
- Wrong MIME type (must be `.xlsx` or `.csv`) → 400.
- File size > 5MB → 400.
- Parsed row count > 500 → 400.

For a file that passes those checks, each data row is mapped to a `CreateQuestionDto`-shaped object and validated with the existing `validateQuestionPayload()`. Rows that pass are created (tags auto-upserted exactly as `QuestionsService.create()` already does via `resolveTagIds`). The response is always `201`, even with partial row failures — a bad row is a data problem, not a request failure:

```json
{
  "created": [ { "id": "...", "text": "...", ... }, ... ],
  "errors": [ { "row": 14, "message": "single_mcq questions must have exactly 1 correct option" } ]
}
```

Row numbers in `errors` are 1-indexed against the data rows (excluding the header), matching what a recruiter sees when they open the file in Excel.

## Frontend

A **"Bulk upload"** button next to "New question" on the Question Bank page (`apps/web/app/(recruiter)/questions/page.tsx`), opening a screen with:
- A "Download template" link (serves the pre-filled example `.xlsx`).
- A file input accepting `.xlsx`/`.csv`.
- An "Upload" button that submits the file as `multipart/form-data` (`FormData`, key `file`), mirroring the branding-logo upload's frontend pattern.
- After the request completes: a summary ("187 questions created") and, if `errors` is non-empty, a table listing each row number and its error message, so the recruiter can fix exactly those rows in their original file and re-upload.

## Error Handling

- Whole-file rejections (wrong type, too large, too many rows) surface as a single toast/error message before any parsing happens — the recruiter never sees a partial per-row breakdown for these, since nothing was attempted.
- Per-row errors never block the rows that did pass — this is the core behavior the partial-success decision above requires, not a fallback.
- Network/server errors during upload use the same `onError` toast pattern established in `ExamDetailsForm`/exam create/edit (surfacing `error.message` with a fallback string) — no new error-handling idiom introduced.

## Testing

- **Backend unit**: parser tests covering CSV and Excel input for each question type (`single_mcq`, `multi_mcq`, `true_false`, `code`), a mixed file with both valid and invalid rows asserting the exact `created`/`errors` split, tag auto-upsert from the semicolon-separated column, and the three whole-file rejection cases (bad MIME type, oversized file, too many rows).
- **Backend e2e**: one spec uploading a real `.csv` fixture with a mix of valid and invalid rows against `POST /questions/bulk-upload`, asserting the created questions are retrievable via `GET /questions` and the error list matches the known-bad rows.
- **Frontend unit**: the Bulk Upload screen — file selection, submit, success summary rendering, error-table rendering when `errors` is non-empty.
- **Playwright**: extends an existing recruiter golden-path spec with an upload step (a small fixture file bundled in the e2e directory), rather than a new dedicated spec file — consistent with how the Duplicate feature's Playwright coverage was added.
