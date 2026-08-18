# UI Design Foundation — "Invigilator"

Design spec for the product's visual foundation. Driven by customer feedback that the UI "is not
that great" on three axes: looks dated/unpolished, hard to find things, and the candidate
experience feels cheap.

This is the **first of four** pieces (foundation → candidate flow → recruiter console →
org-admin/panel/platform). It deliberately does **not** redesign any page's layout or navigation —
it establishes the design system every page is built from, so the other three inherit it instead
of reinventing it. Structure and IA are separate specs.

## Why foundation first

Every one of the ~50 pages is assembled from the 22-component kit in `apps/web/components/ui` and
the token set in `tailwind.config.ts`; 53 files import from that kit. Rebuilding the foundation
changes the whole product at once. Redesigning pages first would mean rebuilding everything twice.

## The direction: Invigilator

Chosen from three prototyped directions (see the design lab, `apps/web/app/design-lab`). Validated
on the real login page (`apps/web/app/login`, currently an uncommitted preview) which this spec
formalises.

**The thesis:** the invigilator's view of a quiet exam hall. The canvas is greyscale slate; colour
is *rationed* and spent only where it carries meaning — the primary action and genuine state
(pass / fail / in-progress / integrity). Restraint is the point, executed with real craft rather
than the generic SaaS defaults that read as "AI-generated": a real self-hosted typeface instead of
system-ui, a cool slate temperature instead of pure grey, squared state tags with a filled marker
instead of rounded pills, hairline borders instead of soft drop-shadows, and one signature — an
attention rail that draws the eye only to what has actually gone wrong.

**Why it survives white-labelling** (the governing constraint): the canvas is greyscale by design,
so an org's own primary colour is the *only* chroma on a console screen and cannot clash with
anything. Colour that is rationed is colour that is safe to hand to a customer.

## How it plugs into the existing system (do not fork)

The product already themes per-org through CSS custom properties: `tailwind.config.ts` maps
`primary → var(--color-primary, #0053e2)`, `accent → var(--color-accent)`,
`on-primary → var(--color-primary-text)`; `globals.css :root` sets the defaults; the console
layouts override them from `branding`. The foundation **extends this exact mechanism** — it adds
new neutral, state, and type tokens as CSS variables in the same place. No parallel theming system.

### Token additions (in `globals.css :root`, consumed via `tailwind.config.ts`)

**Neutrals — slate temperature** (cool institutional bias, not pure grey):

| Token | Value | Role |
|---|---|---|
| `--ink` | `#1b2530` | primary text |
| `--muted` | `#5c6875` | secondary text, labels |
| `--rule` | `#dbe0e6` | hairline borders, dividers |
| `--paper` | `#ffffff` | card surface |
| `--ground` | `#eceff3` | page background |
| `--panel` (dark) | `#001E60` (brand navy) | brand/marketing/auth surfaces only — never console chrome |

**State — the rationed chroma.** These are the semantic palette, separate from the org accent, and
carry the same meaning on every screen. Each is a foreground + background pair (values verified for
AA contrast in the prototype):

| State | Foreground | Background |
|---|---|---|
| pass | `#046b4a` | `#e7f5ee` |
| fail | `#8a1c2b` | `#fbeaec` |
| in-progress / warning | `#8a5a00` | `#fbf3dd` |
| clear / neutral | `#3f4a54` | `#eef1f4` |

**Brand / white-label** (unchanged mechanism): `--color-primary` (org primary, the one action
colour), `--color-primary-text` (on-primary), `--color-accent`. The dark navy panel uses
`brand.navy` and is a *Prudent* surface (the org's own branding lives on the form/content side), so
it is a fixed brand token, not a per-org one.

### Typography

Two self-hosted faces (see Font hosting below), replacing system-ui which is the single biggest
"unpolished" tell:

- **Display — Bricolage Grotesque** (500, 700). Page titles, section titles, the exam clock, large
  numerals. Used with restraint, tight tracking (`-0.02` to `-0.03em`).
- **Body — Hanken Grotesk** (400, 500, 600). Everything else, including the uppercase micro-labels
  (11px, weight 600, `0.08–0.11em` tracking).
- **Mono — the system mono stack** (`ui-monospace, 'Cascadia Code', Consolas`). Record IDs, the
  audit vernacular. No third webfont — the stack is reliable and reads as "machine".

**Type scale** (px): 42 / 29 / 22 (display sizes) · 16 / 15 / 14 / 13.5 (body) · 12 / 11 / 10.5
(labels, captions). **Tabular numerals everywhere digits align** — scores, times, counts, table
columns — via `font-variant-numeric: tabular-nums`.

### Radius, elevation, spacing, motion

- **Radius** (squared, not pill): 4px (tags) · 7–8px (inputs, buttons) · 9–12px (cards). Never
  `rounded-full` on state chips.
- **Elevation:** depth comes from a crisp 1px `--rule` border, not blur. **No soft drop-shadows.**
  One exception permitted: a 1px hairline highlight (`inset 0 1px 0 rgba(...)`) as the "lit edge" of
  a dark panel.
- **Spacing:** keep the existing Tailwind 4px scale. Not reinvented.
- **Motion** (Framer Motion, already a dependency): a small, deliberate vocabulary —
  - *Press:* `whileTap={{ scale: 0.97 }}` on a tight spring (`stiffness 500, damping 30`) for
    primary actions. Verified on the login button.
  - *Entrance:* subtle fade + 4–8px rise, staggered ≤40ms for lists/rows.
  - *Reduced motion:* every animated surface wraps in `MotionConfig reducedMotion="user"`, which
    disables transforms for users who ask for it. Non-negotiable.
  - **Candidate exam screens are the exception:** motion stays minimal there — stressed users,
    locked-down machines, sometimes poor networks. No entrance choreography during a timed exam.

## New / changed shared primitives (`components/ui`)

The 22-component kit is rebuilt on the tokens above. The consequential changes:

- **StatusBadge / Badge → squared state tag.** Replaces the rounded pill: 4px radius, a 6px filled
  leading marker in `currentColor`, driven by the state token. This is the most-repeated element in
  the product and the clearest "before/after".
- **Card → hairline surface.** 1px `--rule` border, no shadow, 9–12px radius.
- **Table → rows + attention rail.** The signature. A row that represents something actually wrong
  (a fail, a real integrity concern) carries a 3px inset rail in the state colour on its leading
  edge; clean rows carry nothing. Rail colour comes from a per-row variable so it can never appear
  as decoration.
- **Button → press + rationed colour.** Primary fills with `--color-primary` (org colour); the tap
  press is built in. Ghost is a `--rule` outline on paper.
- **Input / Select → squared, slate.** 7–8px radius, `--rule` border, focus ring in the org primary
  at ~15% via `color-mix`.
- **Tabs, DropdownMenu, Modal, Pagination, Checkbox, Radio, Toast, CollapsibleSection,
  ColumnChooser, FilterableHeader** → retoned to the palette and type; no structural change.
- **CodeEditor** → chrome retoned only; Monaco stays pinned at `0.52.2` (self-hosted; never bump —
  0.55+ ships a non-AMD build that hangs the editor).

## Font hosting

Self-host, the same way the product self-hosts Monaco. **Do not use `next/font/google`** — it
fetches at build time, and this environment's network is intermittently blocked (VPN / restricted
egress has broken builds here before); a failed font fetch would break the production build.
Instead: the woff2 latin subsets live in `apps/web/public/fonts` (already fetched during
prototyping) and are declared with `@font-face` in `globals.css`, or wired via `next/font/local`
which self-hosts at build with no network dependency. `font-display: swap` so a missing file
degrades to the fallback stack rather than blocking render.

## The clsx override hazard (an architectural decision this spec must settle)

`components/ui/Button` (and the kit generally) composes classes with plain `clsx`, **not
`tailwind-merge`**. Conflicting utilities therefore both survive into the class list and CSS source
order decides the winner — which is why per-call `className` overrides are unreliable (this bit us
on the Refresh button, which had to match a sibling's markup rather than override it).

**Decision:** appearance changes at the *token and component* source; `clsx` stays. A call site
varies a component only through typed `variant` / `size` / `tone` props, never a raw `className`
that fights the defaults. No `tailwind-merge` dependency. Every variation a page needs must be a
real, named prop on the component — which also documents the kit's supported surface.

## Rollout & test impact

**Component-by-component, `main` always green.** The kit is rebuilt one component at a time, each
change carrying its own updated tests, merged incrementally — not a single big swap. The invariant
is that `main` stays green and deployable at every step; the product looks intentionally mixed
while the rollout is in flight, which is acceptable. Sequencing follows blast radius: the tokens
and the most-repeated primitives first (StatusBadge, Button, Card, Input), then the rest.

- **This spec ships the tokens + the rebuilt kit only.** Because 53 files consume the kit, they
  pick up the new look automatically; per-page specs then handle layout/IA.
- **Test churn is real and expected.** ~1,141 web tests exist; a subset assert on markup/classes
  the kit renders (e.g. pill class names, shadow utilities). The plan must budget for updating
  those alongside the component changes — accessible-name and behaviour assertions must **not**
  change (they are the contract; the login prototype kept all 11 of its tests green precisely
  because only appearance changed). A red suite is not an acceptable interim state on `main`.
- **The login preview is the reference implementation.** `app/login/invigilator.css` and the design
  lab are throwaway scaffolding; their values move into `globals.css` + `tailwind.config.ts` + the
  kit during the plan, and the scoped preview files are deleted.

## Accessibility floor (verified, not aspirational)

- Text/background contrast ≥ 4.5:1 for body, ≥ 3:1 for large display. The navy panel was measured
  at 14.4:1 (headline) / 7.3:1 (sub) in the prototype.
- Visible keyboard focus on every interactive element (org-primary ring).
- `prefers-reduced-motion` honoured everywhere via `MotionConfig`.
- State is never encoded by colour alone — every state tag carries a text label beside its marker.

## Out of scope (explicitly)

- Page layout, navigation, and information architecture — the "hard to find things" complaint. That
  is the per-console specs (recruiter especially).
- Any backend, data, or API change. This is presentation only.
- The candidate flow's *screens* — this spec sets the tokens they'll use; their redesign is the
  next spec.

## Decisions (resolved 2026-08-19)

1. **Override model:** typed `variant`/`size`/`tone` props, `clsx` kept, no `tailwind-merge`.
2. **Navy panel scope:** auth + public marketing surfaces only (login, forgot-password, landing);
   consoles stay pure greyscale slate for the cleanest white-label canvas.
3. **Rollout shape:** component-by-component, `main` green and deployable at every step.
