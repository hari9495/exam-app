# Interview Panel Console — Design Spec

## 1. Context & Scope

Frontend Phase 1 (Recruiter Console), Frontend Phase 2 (Org Admin Console), and Frontend Phase 3 (Candidate Exam-Taking Console) are all shipped. This is the fifth and final role console: **Interview Panel**. The `panel` role already exists in the backend RBAC system with a purpose-built read surface for exam results — but zero frontend UI exists for it, and no frontend anywhere in this project has consumed the results/reporting endpoint family yet (confirmed by direct codebase survey: no `result`-named files exist under `apps/web/app/(recruiter)` or `apps/web/lib/hooks`).

**Current backend surface, confirmed by direct codebase survey before scoping:**

- **Panel's permission set is exactly two permissions**: `['org:view', 'results:view']` (`apps/api/prisma/seed.ts:24`). It has neither `exam:manage` nor `candidate:manage`.
- **Seven endpoints are already gated on `results:view`** (all under `apps/api/src/reports` and `apps/api/src/attempts-admin`), purpose-built for panel use and already exercised by a panel-authenticated e2e test (`apps/api/test/exam-reporting.e2e-spec.ts`):
  - `GET /exams/:id/results` — per-candidate result rows (score, percentage, pass/fail, proctoring analysis summary)
  - `GET /exams/:id/results/summary` — aggregate stats (total candidates, pass rate, average %, score distribution, attempt duration)
  - `GET /exams/:id/results/question-accuracy` — per-question accuracy breakdown
  - `GET /exams/:id/candidates/:candidateId/report` — full candidate detail (per-section, per-question breakdown with selected vs. correct options)
  - `GET /exams/:id/candidates/compare?candidateIds=a,b,c` — side-by-side comparison (comma-separated IDs, minimum 2, 400 otherwise)
  - `GET /exams/:id/results/export?format=csv|xlsx|pdf` — binary export (`StreamableFile`, correct `Content-Type`/`Content-Disposition`)
  - `GET /attempts/:id/ai-insight` (+ `POST .../regenerate`) — AI-generated attempt insight (summary, risk level), 404 if not yet generated
- **Confirmed real gap**: `GET /exams` (list) and `GET /candidates` (list) both require `exam:manage`/`candidate:manage`, which panel lacks (`apps/api/src/exams/exams.controller.ts:26-27`, `apps/api/src/candidates/candidates.controller.ts:23-24`) — a panel user has no API-level way to discover which exams exist. This is confirmed deliberate-but-incomplete by the e2e test itself, which explicitly asserts panel gets 403 on exam-management routes and works around discovery by using a known exam ID obtained via a recruiter token during test setup.
- **JWT shape is uniform across all staff roles** — `{ sub, organizationId, role }` (`apps/api/src/auth/auth.service.ts:125-134`), no panel-specific auth path. The existing frontend `AuthProvider` (`apps/web/lib/auth-context.tsx`) already decodes `role` generically.
- **No existing frontend precedent to consume** — this phase builds the first UI for the entire results/reporting endpoint family, though it follows the same route-group/layout/React-Query conventions already established by `(recruiter)` and `(org-admin)`.

## 2. Scope Decisions

- **Exam discovery gets a small, additive backend fix**: widen `GET /exams`'s guard to accept `results:view` as an alternate permission (not a replacement for `exam:manage` — recruiters keep full access via their existing permission). This is the same-shaped, low-risk backend touch already used twice in this project (the candidate-auth httpOnly cookie addition, and the `GET /candidates/lookup` endpoint for org-admin) — one small, precedented backend change per frontend phase when the existing surface has a genuine gap, not a pattern of scope creep.
- **Full screen set ships this phase**: exam list, results dashboard (summary + question accuracy + candidate list), candidate detail, and comparison — every endpoint already built for panel gets a consuming screen. Deferring candidate detail/comparison to "later" was considered and rejected: the backend already fully supports them and splitting would just add a coordination gap with no benefit.
- **Visual identity: reuse the recruiter/org-admin design system**, not a distinct identity like the candidate console. Panel is an internal staff role reviewing data at their own pace, not an external candidate under proctored time pressure — the design rationale that justified a separate "Calm Focus" identity for candidates doesn't apply here. Reuses `components/ui`'s `Button`, `Table`, `Card`, `Modal`, `Badge` as-is.
- **Routes live under a new `/reports` namespace, not `/exams`.** Next.js route groups share a single path space — `(recruiter)` already owns `/exams` (the exam builder). Reusing that path from `(panel)` would collide. `/reports` is unambiguous or the panel's read-only, results-focused views and doesn't collide with any existing route.
- **Export is a client-side blob download**, not a plain `<a href>` link — every other authenticated request in this app goes through the shared `apiFetch` wrapper (Bearer token + 401-retry-once), and a `StreamableFile` response has no unauthenticated URL to link to directly. The results table's export button fetches the binary, converts to a blob, and triggers a synthetic download.
- **No candidate → panel messaging, no proctoring-event raw feed, no force-submit** — all of `attempts-admin.controller.ts`'s other routes require `exam:manage`, which panel doesn't have and isn't gaining. Out of scope, matching the backend's existing boundary exactly.

## 3. Backend Addition: Exam Listing for Panel

Modify `apps/api/src/exams/exams.controller.ts`'s list endpoint (currently `@RequirePermissions('exam:manage')` on `GET /exams`) to accept either `exam:manage` or `results:view`. `PermissionsGuard` (`apps/api/src/rbac/permissions.guard.ts`) currently requires **all** listed permission keys — this needs an "any of" variant (a new decorator, e.g. `@RequireAnyPermission(...)`, or a guard-level flag) rather than changing the "require all" semantics globally, since every other multi-permission call site in this codebase relies on the current "all" behavior. Response shape is unchanged — panel and recruiter both get the same exam list; the RBAC layer only decides who's allowed to call it. `GET /exams/:id` (single exam metadata) needs the identical treatment, since the results dashboard needs the exam's title.

## 4. Screens & Routes

New `apps/web/app/(panel)` route group, reusing the recruiter/org-admin shell pattern (sidebar nav, org branding, auth-gate on `role === 'panel'`).

| Route | Purpose | Backend endpoints consumed |
|---|---|---|
| `/reports` | Exam list (panel's landing page after login) — title, status, link into each | `GET /exams` (widened) |
| `/reports/[examId]` | Results dashboard: summary stat tiles, question-accuracy table, candidate list with checkbox selection ("Compare selected", enabled at ≥2 checked) and an export button (CSV/Excel/PDF) | `GET /exams/:id` (widened), `GET /exams/:id/results/summary`, `GET /exams/:id/results/question-accuracy`, `GET /exams/:id/results`, `GET /exams/:id/results/export` |
| `/reports/[examId]/candidates/[candidateId]` | Candidate detail: score/pass-fail header, per-section and per-question breakdown, AI insight panel (or a "Regenerate" button if none exists yet) | `GET /exams/:id/candidates/:candidateId/report`, `GET /attempts/:id/ai-insight`, `POST /attempts/:id/ai-insight/regenerate` |
| `/reports/[examId]/compare?candidateIds=a,b,c` | Side-by-side comparison table (overall + per-section scores, one column per candidate) | `GET /exams/:id/candidates/compare` |

**Comparison selection flow**: checkbox state lives as local component state on the results-dashboard page; "Compare selected" navigates to `/compare` with the selected IDs serialized into the `candidateIds` query string — no global/shared state needed. Direct navigation to `/compare` with fewer than 2 IDs shows an inline "select at least 2 candidates" message client-side, without calling the API (which would otherwise 400).

## 5. Client Architecture

- **Role gating**: `(panel)/layout.tsx` is a structural copy of `(recruiter)/layout.tsx` — redirects to `/login` unless `role === 'panel'`, applies org branding via the existing `useBranding(organizationSlug)` hook, same sidebar-shell/`NAV_ITEMS` pattern (one entry: "Exams" → `/reports`).
- **Data fetching**: new hooks in `apps/web/lib/hooks/` following the exact existing `useCandidates`-style convention (`useQuery` + the existing `apiFetch`, no new API client — panel is a staff role hitting `apps/api`, same as recruiter/org-admin): `useExamsList`, `useExam`, `useResultsSummary`, `useQuestionAccuracy`, `useResultsList`, `useCandidateReport`, `useCandidateComparison`, `useAttemptInsight`, `useRegenerateAttemptInsight`.
- **Export**: a `useResultsExport` hook wrapping a mutation that calls `apiFetch`'s underlying fetch directly (not the JSON-parsing `apiFetch` itself, since the response is binary) with the Bearer token, reads the response as a `Blob`, and triggers a download via a synthetic `<a>` click with `URL.createObjectURL`.

## 6. Error Handling & Empty States

- **No exams yet**: `/reports` shows a friendly empty state, not a blank table.
- **Exam with zero candidates/results**: the results dashboard shows an empty state for the summary/question-accuracy/candidate sections rather than rendering broken charts against empty data.
- **AI insight not yet generated**: candidate detail shows a "Not yet generated" state with a Regenerate button instead of surfacing the 404 as an error.
- **Comparison with <2 candidates via direct URL**: inline message, no API call (see Section 4).
- **Export failure**: a toast (existing `useToast` pattern), matching how other mutation failures are surfaced elsewhere in this app.

## 7. Testing

- Component/unit tests (Jest + Testing Library, matching the existing `apps/web` convention) for each screen's render states: loading, empty, populated, error, and (candidate detail) insight-missing.
- A Playwright golden path (`apps/web/e2e/panel-golden-path.spec.ts`, matching the existing recruiter/org-admin/candidate e2e convention): log in as panel → land on `/reports` → open an exam → view summary/question-accuracy/candidate list → open a candidate's detail → select two candidates → compare → trigger an export and confirm the download response.
- Backend: a small unit/e2e addition covering the widened `GET /exams`/`GET /exams/:id` guard — confirm panel now gets 200 (previously 403) and recruiter's existing access is unchanged.
