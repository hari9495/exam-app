# Frontend Phase 2: Org Admin Console — Design Spec

## 1. Context & Scope

Frontend Phase 1 shipped the shared shell + Recruiter console (Flow A: create exam → publish → invite candidates), plus a real component library (Tailwind + Radix), session persistence, and tenant theming. This phase is the **second** frontend sub-phase: the Org Admin console, per the master design spec's five role consoles (Super Admin, Org Admin, Recruiter — done, Interview Panel, Candidate).

**Current state, confirmed by direct codebase survey before scoping:**

- The `org_admin` role's permissions (`org:manage_users`, `org:manage_settings`, `org:view`, `audit:view`, `candidate:data_rights` — `apps/api/prisma/seed.ts:23-28`) are entirely disjoint from `recruiter`'s (`org:view`, `question_bank:manage`, `exam:manage`, `candidate:manage`, `results:view`, `ai_jobs:view`), except for the shared `org:view`. An org_admin cannot meaningfully use any Recruiter-console screen, and vice versa.
- **The frontend currently has no concept of user roles.** `AuthContext` doesn't store or expose the logged-in user's `role`, and `(recruiter)/layout.tsx` only checks whether an access token exists — not who it belongs to. Any authenticated staff member of any role can today navigate into every `(recruiter)/*` route; the backend's `PermissionsGuard` is the only thing stopping them from actually doing anything there. This phase adds role-aware routing as foundational work (Section 3).
- **`apps/web/app/(recruiter)/settings/branding/page.tsx` is currently broken for the role it's nested under.** It calls the *authenticated* branding endpoints (`GET/PATCH /organizations/branding`, `POST /organizations/branding/logo`), all gated on `org:manage_settings` — a permission `recruiter` does not have. Any recruiter who reaches this route gets 403s on every call. This page was evidently built for org_admin all along; this phase re-homes it correctly (Section 5).
- Backend capability already exists and is stable for everything except one small read endpoint (Section 4):
  - **User management**: `POST /users` (create, requires `org:manage_users`), `GET /users` (list, requires `org:view`) — `apps/api/src/users/users.controller.ts`. No update or deactivate endpoint exists.
  - **Org settings/branding**: `GET/PATCH /organizations/branding`, `POST /organizations/branding/logo`, `GET /organizations/usage` — all requiring `org:manage_settings` — `apps/api/src/organizations/organizations.controller.ts`. Already fully consumed by the existing (mis-homed) branding page.
  - **Audit log**: `GET /audit-logs`, requiring `audit:view`, with `entityType`/`actorUserId`/`action`/`from`/`to`/`limit`/`cursor` query params and keyset pagination — `apps/api/src/audit/audit.controller.ts`.
  - **GDPR data rights**: `GET /candidates/:id/export` and `POST /candidates/:id/erase`, both requiring `candidate:data_rights` — `apps/api/src/candidates/candidates.controller.ts:35-45`.
- The access JWT already carries `role` in its payload (`{ sub, organizationId, role }` — `apps/api/src/auth/auth.service.ts:113-116`), issued identically at login and refresh. No backend change is needed to expose role client-side.
- The seeded `org_admin` fixture (`admin@demo-org.test` / `DevAdmin123!`, org `demo-org` — `apps/api/prisma/seed.ts:104-114`) already exists from Phase 0 and needs no new fixture for this phase's e2e coverage.

## 2. Scope Decisions

- **Role-aware frontend routing ships as part of this phase**, not a separate sub-phase. It's a prerequisite for an Org Admin section to exist meaningfully at all, and the amount of new work is small (decode an already-present JWT field, add a role check to two route-group layouts).
- **User management is list + invite only.** The backend has no update/deactivate endpoint; building one is out of scope until there's a real need. "Invite" is really **direct account creation** — `POST /users` requires the org_admin to set the new user's initial password themselves (min 8 chars), since there's no email-invite-with-token flow for staff like candidates have. The UI is honest about this (a password field, not a "send invite link" button).
- **Audit log gets full filter UI**, matching every param the backend already supports (actor, action, date range, entity type) — plain filter inputs, not an autocomplete/typeahead layer (no user- or action-search endpoint exists to back one).
- **GDPR export renders in-page** (profile, invitations, per-attempt results/answers/proctoring data) with a secondary "Download JSON" button that serializes the already-fetched response client-side — no second network call.
- **One small new backend endpoint**: `GET /candidates/lookup?email=...` (Section 4) — needed because org_admin lacks `candidate:manage` and can't use the existing candidate list endpoint to find a candidate's ID before acting on it.
- **No dedicated Roles/permissions reference screen.** `GET /rbac/roles` exists but isn't consumed this phase — the invite-user role dropdown hardcodes the three assignable roles from `CreateUserDto`'s `@IsIn(['org_admin', 'recruiter', 'panel'])` validator.
- **No org-admin dashboard.** `/users` is the landing screen after login; a summary dashboard is deferred until there's more than four screens to summarize.

## 3. Architecture: Role Exposure & Route Gating

- **Role exposure**: `AuthProvider` decodes the access token's payload (base64-decode the JWT's middle segment; no signature verification client-side — this is a UI routing hint, not a security boundary, since every actual capability stays enforced server-side by `PermissionsGuard`) whenever it sets a new access token (on login and on silent refresh). `useAuth()` gains a `role: 'org_admin' | 'recruiter' | 'panel' | null` field alongside the existing `accessToken`/`organizationSlug`.
- **`(recruiter)/layout.tsx`** gains a role check: if `role` is resolved and isn't `'recruiter'`, redirect to `/login` (there's no cross-role landing page to send a mismatched role to yet — same redirect target as "not authenticated").
- **New `(org-admin)` route group**: `(org-admin)/layout.tsx` mirrors the recruiter shell's structure (sidebar nav, tenant branding via the existing public by-slug endpoint, auth-gate) but requires `role === 'org_admin'`, redirecting to `/login` otherwise. Wraps `/users`, `/settings/branding` (moved here from `(recruiter)`), `/audit-log`, `/data-rights`.
- **`/login` redirect branches by role** post-login: `org_admin` → `/users`, `recruiter` → `/dashboard` (unchanged). `panel` has no console at all yet (pre-existing gap from Phase 1, not introduced or fixed here) — falls through to the same "no matching route group" behavior as any other unhandled role today.

## 4. Backend Addition: Candidate Lookup by Email

New endpoint in `apps/api/src/candidates/candidates.controller.ts`:

```
GET /candidates/lookup?email=<email>
Requires: candidate:data_rights
Returns: { id, name, email, phone, createdAt, erasedAt } | 404 if no match in this org
```

Implemented as a new `CandidatesService.lookupByEmail(tenant, email)` method — a single tenant-scoped `findFirst` on `Candidate.email`, reusing the same `SafeCandidate`-shaped projection the list endpoint already returns per-row. No new DTO needed for the request (a validated query string); response reuses the existing candidate shape. This is the only endpoint gated on `candidate:data_rights` that doesn't already exist — chosen over widening `GET /candidates` to accept `candidate:data_rights` as an alternate permission, which would let a data-rights-only caller browse the *entire* candidate list (over-broad — email lookup is the minimum access needed to act on a specific data-subject request).

## 5. Screens & Routes

| Route | Purpose | Backend endpoints consumed |
|---|---|---|
| `/users` | List staff (email, role, status, last login); form to add a new staff member (email, password, role) | `GET /users`, `POST /users` |
| `/settings/branding` | **Moved** from `(recruiter)` — unchanged functionality: edit brand colors, upload logo, view AI credit usage | `GET/PATCH /organizations/branding`, `POST /organizations/branding/logo`, `GET /organizations/usage` |
| `/audit-log` | Filterable, paginated audit event list (actor, action, date range, entity type) | `GET /audit-logs` |
| `/data-rights` | Email search → candidate record → in-page export view + Download JSON button + Erase action behind a confirmation dialog | `GET /candidates/lookup`, `GET /candidates/:id/export`, `POST /candidates/:id/erase` |

**Erase confirmation**: reuses the existing `Modal` component for a destructive-action confirmation (matches this codebase's established pattern), since `POST /candidates/:id/erase` is irreversible (though idempotent server-side — erasing an already-erased candidate just returns the existing `erasedAt` without re-redacting).

**No `UpdateXDto` full-body-PATCH concern this phase** — every mutation in this phase's scope is a `POST` (create user, erase candidate) or an already-built `PATCH` (branding, unchanged from Phase 1). No new edit-form footgun to guard against.

## 6. Testing Strategy

Matches Phase 1's established pattern:
- **Jest + React Testing Library** for every new component and screen (users list/add form, branding page relocation, audit log filters, data-rights lookup/export/erase flow).
- **Playwright**: one e2e suite, `apps/web/e2e/org-admin-golden-path.spec.ts`, extending the existing real-dev-server pattern. Golden path: log in as the seeded `admin@demo-org.test` → add a staff user → view the audit log (confirm the just-created user's `user.created` event appears) → look up a candidate by email (using a candidate created via the recruiter fixture's prior e2e data, or seeded directly) → export their data → erase them → confirm the erase reflects (`erasedAt` set, re-export shows redacted fields).

## 7. Explicitly Out of Scope

- Editing a user's role or deactivating/removing a user — no backend support exists; deferred until there's a concrete need.
- Super Admin and Interview Panel consoles — separate future sub-phases.
- A dedicated Roles/permissions reference screen (`GET /rbac/roles` goes unused this phase).
- An org-admin dashboard/landing page beyond `/users`.
- Any change to `panel` role's (lack of) frontend — pre-existing gap from Phase 1, not addressed here.
- Widening `GET /candidates` to be reachable by `candidate:data_rights` — the new lookup-by-email endpoint is deliberately narrower.
- Dark mode, mobile responsiveness beyond tablet, i18n — same standing deferrals as Phase 1.
