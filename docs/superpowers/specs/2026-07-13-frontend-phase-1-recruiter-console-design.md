# Frontend Phase 1: Shared Shell + Recruiter Console — Design Spec

## 1. Context & Scope

The backend is fully shipped through Phase 6 (Foundation through Compliance & Security Hardening — auth/RBAC, exam builder, question bank, candidate management, anti-cheat/proctoring, live monitoring, white-label branding, randomization/pools, reporting/analytics, AI question generation + eval insights + credit metering, audit logging, rate limiting, GDPR data-subject rights). `apps/web` is still an 8-file Next.js skeleton (root layout, a login page, one dashboard shell, one branding-settings page, an `apiFetch` helper, and an in-memory `AuthProvider`) — essentially none of the product's UI exists despite the entire backend surface being available.

The master design spec (`docs/superpowers/specs/2026-07-07-online-mcq-exam-platform-design.md`) describes five distinct role consoles (Super Admin, Org Admin, Recruiter, Interview Panel, Candidate) plus a shared design-system layer — too large for one phase. This spec covers the **first** frontend sub-phase only: the shared foundation every later phase will build on, plus the Recruiter console's core exam-authoring loop (Flow A in the master spec: create exam → publish → invite candidates). Live Monitoring, Reports & Analytics, AI Question Generator, Bulk Import, and every other role's console are explicitly deferred to their own future sub-phases (see Section 7).

**Current state, confirmed by direct codebase survey before scoping:**
- `apps/web` has zero styling infrastructure (inline `style` objects only, no Tailwind, no component library).
- `AuthProvider` (`apps/web/lib/auth-context.tsx`) holds the access token in React state only — lost on every page refresh, and never calls the backend's refresh endpoint.
- The backend already sets a refresh token as an **httpOnly cookie** on login (`apps/api/src/auth/auth.controller.ts:20`), but `POST /auth/refresh` currently *requires* that same token in the JSON request body (`RefreshDto.refreshToken`) — a browser cannot read an httpOnly cookie's value in JS, so as built today, no browser client can call refresh at all. This is a real gap, not a design choice, and is fixed as part of this phase (Section 4).
- Relevant backend controllers already exist and are stable: `exams.controller.ts`, `questions.controller.ts`, `tags.controller.ts`, `candidates.controller.ts`, `invitations.controller.ts`, `auth.controller.ts`, `organizations.controller.ts` (branding, already partially consumed by the existing skeleton).
- No frontend testing infrastructure exists anywhere in the monorepo (no Playwright, no Jest/RTL config in `apps/web`).

## 2. Scope Decisions

- **Shared shell + Recruiter console core loop only.** Org Admin, Super Admin, Interview Panel, and the candidate exam-taking UI are separate future sub-phases with their own spec/plan/build cycles.
- **Recruiter console narrowed to the core loop**: Dashboard, Exam builder, Question Bank (manual CRUD only), Candidates + invitations. Live Monitoring (real-time WebSocket UI) and Reports & Analytics (data-viz/export) are architecturally distinct from CRUD screens and are deferred as their own sub-phase(s). AI Question Generator and Bulk Import (questions or candidates) are deferred — their backends exist but adding them now would roughly double this phase's screen count.
- **Build the real design system now, not later.** Tailwind CSS + Radix UI primitives (per master spec Section 7), with a proper shared component library, rather than ad-hoc inline styles per screen. Every later frontend sub-phase reuses this instead of re-solving styling or requiring a retrofit pass.
- **Fix session persistence now.** Every screen in this phase depends on staying logged in through normal use (a multi-step exam builder shouldn't log an admin out on refresh). This requires a small, targeted backend fix (Section 4) alongside the frontend work — justified because it directly blocks a requirement of the screens being built, not unrelated scope creep.
- **Add frontend testing infrastructure now.** Jest/RTL for components, Playwright (net-new to the repo) for one e2e smoke suite — matches this project's established pattern of verifying real behavior over mocks.

## 3. Architecture & Tech Stack

- **Next.js App Router** (already in place) — add **Tailwind CSS** and **Radix UI primitives**.
- **TanStack Query** for all server state. One `QueryClientProvider` at the root. Query keys per resource: `['exams']`, `['exams', id]`, `['questions', filters]`, `['candidates', examId]`, etc. Mutations invalidate the relevant keys (e.g. creating an exam invalidates `['exams']`; sending an invitation invalidates `['candidates', examId]`). Chosen over hand-rolled `useEffect`/`useState` fetching (the current skeleton's pattern) because this phase has ~15 screens with real mutation-then-refetch flows and benefits from a shared cache between screens (e.g. exam detail reused between the builder and the preview).
- **Routing**: a `(recruiter)` route group with its own layout component (sidebar nav) wrapping `/dashboard`, `/exams`, `/exams/[id]`, `/questions`, `/candidates` — matching the master spec's IA principle that each role sees only its own top-level nav, with no shared "god nav."
- **Auth/session model**: the access token stays in memory only (React context, current pattern — never localStorage). On app mount, a silent `POST /auth/refresh` call (browser sends the httpOnly cookie automatically via `credentials: 'include'`, already set in `apiFetch`) fetches a fresh access token before rendering any protected route. On a 401 from any API call, the same silent refresh is attempted once; if it also fails, redirect to `/login`.

## 4. Backend Fix: `/auth/refresh` Cookie Fallback

In `apps/api/src/auth/auth.controller.ts`:
- `RefreshDto.refreshToken` becomes optional.
- `refresh()` and `logout()` gain a `@Req() req: Request` parameter and read `req.cookies['refresh_token']` as a fallback when `dto.refreshToken` is absent — the request succeeds if *either* source provides a valid token, preferring the explicit body value if both are present (preserves any non-browser client that already sends the token explicitly).
- `AuthService.refresh()`/`logout()` signatures are unchanged (they already just take a `refreshToken: string`); only the controller gains the fallback extraction.
- No new tests for `AuthService` itself (unchanged); `auth.controller` gains coverage (or `apps/api/test/*.e2e-spec.ts` gains a case) proving a request with **no body** and only the cookie set succeeds — this is the exact scenario a browser client hits.

## 5. Design System / Component Library

New `apps/web/components/ui/`: `Button`, `Input`, `Select`, `Checkbox`, `Radio`, `Modal`, `Toast`, `Table` (sort/filter/paginate), `Tabs`, `Badge`, `Card`, `Dropdown Menu` — the "Core" component set from master spec Section 7. Built on Radix primitives for accessibility (focus management, ARIA) with Tailwind for styling.

**Tenant theming**: the org's branding (`primaryColor`, `accentColor`, already fetched today via `GET /organizations/branding`) is applied as CSS custom properties (`--color-primary`, `--color-accent`) set at the `(recruiter)` layout root. Tailwind's config references these variables rather than hardcoded brand colors, so every component built on top automatically respects tenant branding with zero per-component work. Semantic colors (success/warning/danger/info) stay fixed per the master spec — not tenant-overridable.

Dark mode, mobile responsiveness beyond tablet, and rich text/image/equation support in the question editor are explicitly deferred (Section 7).

## 6. Screens & Routes

| Route | Purpose | Backend endpoints consumed |
|---|---|---|
| `/login` | Rebuilt on the new component library; same org-slug + email/password flow as today | `POST /auth/staff/login`, `GET /organizations/by-slug/:slug/branding` |
| `/dashboard` | Recruiter's active/upcoming/completed exam counts | `GET /exams` |
| `/exams` | List with status badges (draft/published/archived) | `GET /exams` |
| `/exams/new`, `/exams/[id]/edit` | Multi-step builder: details → sections → questions → settings → publish. The questions step reuses the Question Bank picker (search/filter, add existing question to section) | `POST /exams`, `GET/PATCH /exams/:id`, section + question-assignment endpoints, `POST /exams/:id/publish` |
| `/exams/[id]/preview` | Read-only candidate-view simulation of the assembled exam — no live attempt created | `GET /exams/:id` (assembled view) |
| `/questions` | List with tag/difficulty/type filters | `GET /questions`, `GET /tags` |
| `/questions/new`, `/questions/[id]/edit` | Plain-text question editor covering all three existing backend question types (`single_mcq`, `multiple_mcq`, `true_false`), each with its own option-list UI and correct-answer marking; plus `marks`, `negativeMarks` (Phase 4a), and tag/difficulty assignment | `POST /questions`, `GET/PATCH /questions/:id` |
| `/candidates` | Per-exam candidate list + manual single-candidate add form | `GET /candidates`, `POST /candidates` |
| Invite action (within `/candidates`) | Single and multi-select bulk-invite against the existing endpoint (CSV upload UI deferred) | `POST /exams/:id/invitations` (bulk) |

## 7. Testing Strategy

- **Jest + React Testing Library**: every component in `apps/web/components/ui/`, plus screen-level logic (form validation, empty states, error states) for the exam builder, question editor, and candidate/invite flows.
- **Playwright** (added fresh — no existing config anywhere in the repo): one smoke suite, `apps/web/e2e/recruiter-golden-path.spec.ts`, run against a real dev-mode `apps/api` instance (matching this project's established real-backend-over-mocks philosophy from the NestJS test suites). Golden path: log in → create exam → add a section → add questions (from the bank) → publish → add a candidate → send an invitation. This is the same Flow A the scope decision is built around, so one suite covers the whole phase's integration surface.

## 8. Explicitly Out of Scope

- Org Admin, Super Admin, and Interview Panel consoles — separate future sub-phases.
- Candidate-facing exam-taking UI (invitation landing, device check, exam screen, submission) — the single most complex remaining surface (real-time anti-cheat hooks, proctoring camera, timer/auto-save), deserves its own dedicated sub-phase and spec.
- Live Monitoring dashboard (WebSocket roster/event feed) and Reports & Analytics (tables, charts, CSV/Excel/PDF export) — architecturally distinct from CRUD screens, deferred as their own sub-phase(s).
- AI Question Generator panel and Bulk Import (questions or candidates via CSV) — backends exist (Phase 5b, Phase 1c) but adding the UI now would roughly double this phase's screen count.
- Rich text/image/equation support in the question editor — plain text + option list only this phase.
- Dark mode.
- Mobile responsiveness beyond tablet (matches master spec: staff surfaces are desktop-first, responsive to tablet only).
- i18n.
- Custom-domain tenant resolution (Next.js middleware resolving org from `Host` header) — login keeps the existing manual org-slug entry field; domain-based routing is Phase 3 scope that was never built on the backend side either.
