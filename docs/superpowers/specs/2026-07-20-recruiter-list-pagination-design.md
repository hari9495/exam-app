# Recruiter List Pagination — Design Spec

## Problem

Found during a live UI testing pass: the recruiter console's three main list
screens have no working pagination, and two of them are **actively hiding
real data today**, not just facing a future scalability risk.

- **Exams** (`GET /api/v1/exams`, `apps/api/src/exams/exams.controller.ts:26`
  → `exams.service.ts`'s unbounded `findMany`): no pagination anywhere,
  backend or frontend. Confirmed live — navigating to `/exams` returned and
  rendered all 200+ exams in the org in one response.
- **Question Bank** (`GET /api/v1/questions`,
  `apps/api/src/questions/questions.controller.ts:55`) and **Candidates**
  (`GET /api/v1/candidates`,
  `apps/api/src/candidates/candidates.controller.ts:23`): the backend
  *already* supports cursor-based pagination (`limit`/`cursor` params,
  default 20, max 100 — `questions.service.ts:82-95`,
  `candidates.service.ts:62-72`), but the frontend hooks
  (`apps/web/lib/hooks/useQuestions.ts`, `useCandidates.ts`) never send
  `limit`/`cursor`. Confirmed live — the Candidates screen's API response
  returned exactly 20 rows while the dashboard's own summary reports 206
  total candidates for the org. **186 real candidates are silently invisible
  on the recruiter's own Candidates screen right now**, with no indication
  anything is missing.

All three pages also have a search `<input>` that currently filters the
already-fetched array **client-side**
(`apps/web/app/(recruiter)/exams/page.tsx:140`, `questions/page.tsx:79`,
`candidates/page.tsx:101-103`) — none of the three backend endpoints accept a
search query param today. Once each page only loads one page's worth of
data, client-side search would silently only search whatever's on the
current page, reproducing the same class of hidden-data problem pagination
is meant to fix.

## Scope

Fix all three screens together with one shared, reusable pattern — not
three separate one-off fixes. Reusable so the same backend DTO and frontend
hook are a straightforward drop-in for other list endpoints found
unpaginated during exploration (`organizations.service.ts:138-139`,
`users.service.ts:81,154`, `invitations.service.ts:224-230`) whenever those
are prioritized — those are explicitly **not** touched in this phase.

`audit.controller.ts` already has working `limit`/`cursor` pagination
actively used by its frontend screen — not touched here.

## Architecture

### Backend contract (shared across all three endpoints)

Query params: `page` (integer, default `1`), `pageSize` (integer, default
`20`, capped at `100`), `search` (optional string, substring match on the
entity's primary display field — exam title, question text, candidate
name/email).

Response shape (all three endpoints return this same envelope instead of a
bare array):

```typescript
interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
```

This is **offset-based** pagination (`page`/`pageSize`, computed internally
as Prisma `skip`/`take`), not cursor-based — chosen specifically because the
approved UX is classic numbered pages (1, 2, 3... with direct page-jump),
which cursors don't support cleanly (a cursor only knows "next" from where
it currently is, not "give me page 7"). At this platform's realistic scale
(hundreds to low-thousands of records per org), offset pagination's known
downsides (performance falloff at very high page numbers, minor consistency
drift if rows are added/removed between page loads) aren't real risks.

`questions.service.ts` and `candidates.service.ts` have their existing
`limit`/`cursor` params and cursor-pagination logic replaced by this
`page`/`pageSize` contract — not kept alongside it. `exams.service.ts` gets
this pagination logic built from scratch (it currently has none). All three
gain the new `search` param, which none currently accept server-side.

### Frontend

One shared hook, `usePaginatedList` (new file, e.g.
`apps/web/lib/hooks/usePaginatedList.ts`), wrapping the pattern each
per-entity hook (`useExams`, `useQuestions`, `useCandidates`) already
half-implements — managing `page` and `search` state, building the query
string via `URLSearchParams` (matching `useQuestions.ts`'s existing
`buildQuery()` convention, not introducing a new query-builder
abstraction), and re-fetching when either changes. `search` input changes
are debounced (matches how a live search box should behave against a real
network call, unlike today's instant client-side array filter) before
triggering a re-fetch.

One shared `Pagination` UI component (new file, e.g.
`apps/web/components/ui/Pagination.tsx`, following the existing
design-token/primitives system built during the Recruiter Console
Redesign — same directory as the existing `Table.tsx` primitive it will sit
below): Prev/Next buttons plus numbered page buttons, given `page`,
`totalPages`, and an `onPageChange` callback. Each of the three list pages
renders it directly below their existing `Table` component, no changes to
`Table.tsx` itself required — it already just takes `columns`/`rows` and
doesn't know or care whether `rows` is a full dataset or one page of it.

The existing search `<input>` markup on all three pages is visually
unchanged; it stops filtering a local array and instead updates the shared
hook's `search` state, which drives a real API call.

## Error Handling

- `page`/`pageSize` query params are validated server-side (positive
  integers, `pageSize` capped at 100) via the existing DTO/`ValidationPipe`
  pattern already used throughout `apps/api` — an invalid value falls back
  to the default rather than erroring, matching how optional query params
  are already handled elsewhere in this codebase (e.g. `status` on
  `useExams`).
- Requesting a `page` beyond `totalPages` returns an empty `data` array with
  the real `total`/`totalPages` still populated (not a 404 or error) — lets
  the frontend show "no more results" rather than treating it as a failure.

## Testing

- Each of the three endpoints gets a test proving `page=2` returns different
  rows than `page=1` for the same org, and that `total` matches the real
  row count — this is exactly the class of bug that shipped silently
  today (a test that only checks "returns 200 with an array" would not have
  caught the Candidates truncation, since 20 real rows is a perfectly valid
  200 response).
- A test confirming `search` server-side filtering returns only matching
  rows, not the full page.
- Frontend test confirming the search `<input>` triggers a new fetch call
  (not local array filtering) and that clicking a page number in the new
  `Pagination` component triggers a fetch with the corresponding `page`
  value.

## Out of Scope

- `organizations`, `users`, `invitations` list endpoints (found unpaginated
  during exploration, not part of the reported bug, left for a later phase
  using the same shared pattern).
- Any change to `audit.controller.ts` (already correctly paginated and
  used).
- Sort-order changes (the existing `Table` primitive's client-side sort is
  unaffected — sorting a single page of data client-side stays as-is; sort
  becoming a server-side param is not addressed here).
