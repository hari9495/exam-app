# UI v2 — Fresh Product UI, Pilot: Login

**Date:** 2026-08-31
**Status:** Design approved, pending spec review
**Author:** hari (with Claude)
**Surface:** Login (`/v2/login`) — first surface of a parallel, surface-by-surface product redesign

---

## 1. Context and goal

The product UI (`apps/web`) is today a custom Radix-wrapped design system (`components/ui/`)
across ~43 screens in five consoles. We are rebuilding the product UI with a **fresh visual
language**, built with **21st.dev** components, **one surface at a time**, **alongside** the
existing UI — the old UI is never modified or removed during the rebuild.

Login is the pilot: smallest surface, establishes the parallel-build scaffolding, the fresh
token system, and the first v2 primitives, without touching product-critical console flows.

### Decisions locked (from brainstorming)

| Decision | Choice |
|---|---|
| Rebuild strategy | Parallel — keep old UI untouched, migrate surface by surface |
| Visual language | Fresh, direction **C (editorial)**, variant **C1** |
| Display face | Bricolage Grotesque set editorially (weight 500, tight tracking). **No new fonts.** |
| Body/UI face | Hanken Grotesk |
| Component source | 21st.dev Magic connector |
| Pilot surface | Login |

## 2. Scope

**In scope:** a new `/v2/login` route that fully replicates the *behavior* of the current
login in the fresh C1 language; the parallel-build scaffolding (`app/v2/**`,
`components/ui-v2/`, scoped `.v2` tokens); the first v2 primitives the login needs; a
`useStaffLogin()` hook holding the login logic.

**Out of scope / non-goals:**
- Any change to `app/login`, `components/ui/`, `components/invigilator.css`, or existing
  console screens. The old login keeps serving.
- Migrating any other surface (dashboard, candidates, etc.) — those are later, separate
  spec → plan cycles.
- Changing the auth API, SSO flow, or branding API. v2 consumes them unchanged.
- Flipping the canonical `/login` route to v2. That is an explicit later step once signed off.

## 3. Architecture — old and new in parallel

### 3.1 Route layout
```
app/
  login/                 # OLD — untouched, still canonical /login
  v2/
    layout.tsx           # v2 shell: applies .v2 scope + fresh tokens, MotionConfig
    v2.css               # fresh C1 token definitions + login styles, scoped to .v2
    login/
      page.tsx           # NEW /v2/login
```
- `/v2/login` is a distinct URL, so both logins run simultaneously with zero collision.
- **Cutover (later, not this spec):** when v2 login is approved, make `/login` render the v2
  page (move the file or redirect). Reversible until then.

### 3.2 Components
- New primitives live in `components/ui-v2/` with a barrel `index.ts`. **No imports from
  `components/ui/`** in either direction — the two systems are isolated.
- Login needs a minimal set to start: `Button`, `TextField` (underlined variant), `PasswordField`
  (TextField + show/hide), `FormAlert` (error), `Link`. Built from / adapted from 21st.dev
  components, retoned to the C1 tokens. Only build what login uses — the library grows per surface.

### 3.3 Token scoping
- Fresh tokens are CSS custom properties defined under a `.v2` root class in `v2.css` (same
  isolation technique the current `.inv` login uses). This keeps v2 values from leaking into the
  global Tailwind theme and vice-versa.
- The `.v2` class is applied once on `app/v2/layout.tsx`'s root element.
- White-label: the org's injected `--org-primary` / `--org-on-primary` are set inline on the v2
  root from branding, exactly as the current login does (`style={{ '--org-primary': ... }}`).

### 3.4 Logic reuse — `useStaffLogin()`
The current login logic is copied into a new hook `apps/web/lib/hooks/useStaffLogin.ts`, used
**only by v2**. The old login is left exactly as-is (no refactor into the hook — that would edit
the working page, which is out of scope). Small, intentional duplication for zero risk.

The hook encapsulates, unchanged in behavior from `app/login/page.tsx`:
- state: `organizationSlug`, `email`, `password`, `error`, `submitting`, `ssoEnabled`
- debounced slug (350ms) → `useBranding(slug)` + `useDocumentBranding`
- SSO detection: `GET /auth/saml/:slug/status`, guarded against out-of-order responses
- submit: `POST /auth/staff/login` `{ organizationSlug, email, password }` → `login(slug, token)`
  → decode JWT → role redirect (`super_admin`→`/organizations`, `org_admin`→`/users`,
  `panel`→`/reports`, else `/dashboard`)
- SSO-only path: SSO-enabled orgs show **no** password; button links to
  `${API_BASE}/auth/saml/:slug/login` and sets `SSO_PENDING_SLUG_KEY` in sessionStorage
- exposes `branding` (`{ name, logoUrl, primaryColor, textColor, loginWatermarkEnabled }`)

Hook returns state + handlers; `page.tsx` is presentation only.

## 4. Visual language — C1 token set

Defined in `v2.css` under `.v2`. Every color has a light and dark value.

### Color (light)
| Token | Value | Role |
|---|---|---|
| `--paper` | `#f7f6f3` | page ground (warm) |
| `--ink` | `#20242b` | primary text, CTA background |
| `--muted` | `#6b6459` | secondary text, labels |
| `--hair` | `#d8d2c6` | field underline, hairlines |
| `--gold` | `#a68a5b` | editorial accent (links, kicker, corner) |
| `--org-primary` | injected | white-label chroma — focus ring + SSO accent only |
| `--danger` | `#c0402f` | error text/alert |

### Color (dark)
`--paper #14161a` · `--ink #eae7e0` · `--muted #9a9488` · `--hair #2c3038` · `--gold #c2a878`
· `--danger #e0776a`. Org primary and its on-color pass through from branding in both modes.

### Typography
- Display (`--font-disp`): Bricolage Grotesque, weight 500, `letter-spacing:-.035em`,
  `line-height:.98`, large (heading ~44–46px, fluid). Used for the single page heading.
- UI/body (`--font-body`): Hanken Grotesk. Labels 12px/600 muted; inputs 14px; helper 12–13px.
- Kicker/eyebrow: Hanken, 11px, weight 600, `letter-spacing:.18em`, uppercase, gold.

### Shape language
- Fields: **underlined**, transparent background, `border-bottom:1px var(--hair)`; focus →
  underline becomes `--org-primary` + text goes ink. No boxes.
- CTA: squared ink button (`background:var(--ink)`, white text, small/zero radius), `Sign in →`.
- Borders: hairlines only, no drop shadows.
- Links: gold, weight 600.
- Layout: single column, floated on the paper ground, generous whitespace.

## 5. Login build

### 5.1 Structure (top → bottom)
1. Org logo + name when `branding` present (else Prudent kicker only).
2. Kicker: `Prudent` (gold, uppercase).
3. Heading: editorial Bricolage, e.g. "Let's get you signed in."
4. `FormAlert` (error) when present, `role="alert"`.
5. Form:
   - Organization slug field (drives branding + SSO).
   - **If `ssoEnabled`:** single "Continue with SSO" control (org-accented), no password.
   - **Else:** Email field, Password field (show/hide toggle), ink `Sign in →` button,
     `Forgot password?` gold link.

### 5.2 White-label in an ink-CTA design (deliberate)
C1's CTA is ink, not the org color — a departure from the current app, which spends the org
color on the primary button. Org identity is instead carried by: the org logo/name at top, the
`--org-primary` focus ring on fields, and the org-accented SSO control. This is an intentional
consequence of the editorial direction and is called out here so it is not read as a regression.

### 5.3 Responsive
Single-column editorial layout is mobile-first by nature: one centered column,
`max-width` ~360px for the form, fluid heading. No two-pane to collapse.

### 5.4 Accessibility
- Labels bound to inputs; visible focus state (org-primary underline + ring).
- Error alert `role="alert"`; show/hide button has `aria-label`.
- Contrast checked in both themes (ink/paper, gold on paper, org-on-primary).
- Reduced motion honored via `MotionConfig reducedMotion="user"` on the v2 layout.

### 5.5 Motion
One subtle load fade on the form (opacity + small y), same easing family as the current login,
disabled under reduced motion. No decorative animation (avoids the AI-generated feel).

## 6. 21st.dev usage
- Login form fields/button start from 21st.dev auth components (candidates already surfaced:
  editorial/minimal login sets), retoned to the C1 tokens — never dropped in with their own
  colors. Anything with a hardcoded brand gradient is adapted, not used raw, per the white-label
  constraint.
- Retrieved component code is committed under `components/ui-v2/` and themed via the `.v2` vars.

## 7. Verification
- **Next 16 caution (repo `AGENTS.md`):** this Next version is non-standard; new routes and
  not-found behavior can differ, and **Turbopack dev silently ignores some route changes**.
  Verify `/v2/login` against a **production build**, not only `next dev`.
- Browser-preview visual pass in light and dark, desktop and mobile widths.
- Smoke: route renders; typing a slug triggers branding/SSO detection; email+password submit
  posts to `/auth/staff/login`; SSO-only org shows the SSO control and no password.
- No heavy unit suite for a presentational page. (This machine fakes mass jest failures under
  load — any test runs isolated.)

## 8. Risks / open items
- **SSO redirect env:** the SSO link uses `NEXT_PUBLIC_API_BASE`; confirm it resolves in the v2
  route the same as in the old login.
- **Branding shape:** `primaryColor`/`textColor`/`loginWatermarkEnabled` are read defensively
  today (cast + defaults); v2 keeps the same defaults (`#0053e2` / `#ffffff`).
- **Cutover** of `/login` → v2 is deferred and tracked separately; not part of this build.

## 9. Deliverables for the implementation plan
1. `app/v2/layout.tsx` + `app/v2/v2.css` (scaffold + C1 tokens).
2. `lib/hooks/useStaffLogin.ts`.
3. `components/ui-v2/` primitives login needs + barrel.
4. `app/v2/login/page.tsx`.
5. Verification pass (production build, browser preview, smoke).
