# Workfox v2 — UI/UX Review Checklist

The standard every v2 surface (`app/v2/**`) is reviewed against — by `/code-review` and by hand — before it ships. Informed by the [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines), UI UX Pro Max, and Anthropic frontend-design, adapted to Workfox's house rules.

**Authority order:** the [brand guidelines](workfox-brand-guidelines.html) (and the living `/v2/brand` page) win on look, color, type, and voice. This checklist enforces interaction, accessibility, and build quality the guidelines state as principles. Where an external source conflicts with our guidelines, **our guidelines win.**

## House overrides (do NOT import these from Vercel)
- **Sentence case** for headings, buttons, labels — never Title Case (Vercel says Title Case; our Voice chapter wins).
- **Spell out "and"** — do not use "&" in copy (Vercel prefers "&").
- **No exclamation marks** in system copy.
- **CTA / focus color is the org accent slot**, not a fixed brand color — never hardcode `#3b5fe3`; use `var(--accent)` / `var(--org-primary)`.
- **Two token sets exist today:** login is C1 under `.v2`; new v2 surfaces are Azure under `.wfx`. Never let one scope's values leak into the other.

---

## Accessibility & keyboard
- [ ] Every workflow is fully keyboard-operable; nothing is mouse-only.
- [ ] Visible focus ring (accent slot color) on every focusable element via `:focus-visible`; no `outline: none` without an equivalent replacement.
- [ ] Modals trap focus and return it to the trigger on close; sticky chrome never covers the focused element.
- [ ] Headings run in order (`h1`→`h6`); a "Skip to content" link exists on full pages.
- [ ] Native semantic elements before ARIA (`<button>`, `<a>`, `<label>`); ARIA only fills gaps.
- [ ] Icon-only buttons have an `aria-label`; decorative media is `aria-hidden`.
- [ ] Every color-coded status also carries a text label (never color alone).
- [ ] Contrast meets WCAG AA in both light and dark; contrast increases on hover/active/focus.
- [ ] `prefers-reduced-motion` and `prefers-color-scheme` honored.

## Forms & inputs
- [ ] Every control has an associated `<label>`; clicking the label focuses it.
- [ ] Errors show next to the field, in words, with the fix; first error is focused on submit.
- [ ] Submit stays enabled until submission begins, then shows a spinner while keeping its label; not pre-disabled on incomplete forms.
- [ ] Paste is never blocked (especially passwords / one-time codes); password managers and 2FA work.
- [ ] `autocomplete`, `name`, `type`, and `inputmode` are set for autofill and the right mobile keyboard.
- [ ] Inputs are ≥16px font on mobile (prevents iOS auto-zoom).
- [ ] Warn before navigation when unsaved changes would be lost.
- [ ] Hit targets ≥24px (≥44px on touch); checkbox/radio shares its label's target.

## Interaction & state
- [ ] All of empty, sparse, dense, loading, and error states are designed — none left to chance.
- [ ] No layout shift: async content reserves space; images have explicit dimensions; skeletons mirror final content.
- [ ] Destructive/irreversible actions require confirmation or Undo; success is never faked.
- [ ] Loading indicators have a short show-delay and a minimum visible time (no flicker).
- [ ] Shareable/navigational state (filters, tabs, pagination, expanded panels) is reflected in the URL where it aids share/refresh/back.
- [ ] Toasts and inline validation announced via polite `aria-live`.
- [ ] No dead zones — everything that looks interactive is.

## Layout & responsive
- [ ] Verified at mobile, laptop, and wide widths; single-column holds on narrow.
- [ ] Layout via flex/grid/intrinsic sizing, not JS measurement; no unwanted scrollbars.
- [ ] The page body never scrolls horizontally; wide content (tables, code) scrolls in its own container.
- [ ] Safe-area insets respected where relevant.

## Motion
- [ ] One considered entrance per surface (single fade + ~8px rise, ~0.4s ease-out); no stagger parades.
- [ ] Animate only `transform`/`opacity`; never `transition: all`; never animate layout properties (width/height/top/left).
- [ ] Motion clarifies cause-and-effect or adds intentional delight — never idle animation.
- [ ] framer-motion only for the product; do not add a second animation library (no GSAP/Magic-UI motion in the console).

## Color & theming
- [ ] Colors come from tokens (`var(--…)`), never raw hex in components.
- [ ] The accent slot is the only platform chroma; org color overrides `--org-primary` on branded surfaces; the two never coexist.
- [ ] Status colors (clear/review/flagged) are semantic and never re-tinted by white-labeling.
- [ ] Both themes verified; dark is flat navy (depth from borders, not elevation).

## Typography & content
- [ ] Bricolage for the one display moment; Hanken for UI/body; mono (system stack) for serials/scores/clocks/counts with `tabular-nums`.
- [ ] Sentence case everywhere; voice is "invigilator, not cheerleader" (see Voice chapter).
- [ ] Numerals for counts; number + unit separated by a space; consistent currency decimals.
- [ ] `<title>` reflects the current context; sections linked via anchors set `scroll-margin-top`.
- [ ] Copy resilient to short, average, and very long user-generated content.

## Build quality & performance
- [ ] Verified against a **production build** (`npm run build`) — Next 16 Turbopack dev can hide route/build issues.
- [ ] Explicit image dimensions; above-the-fold images preloaded, rest lazy-loaded.
- [ ] Critical fonts preloaded; no FOUT/layout shift from fonts.
- [ ] Large lists virtualized or `content-visibility: auto`.
- [ ] `POST/PATCH/DELETE` complete in <500ms where feasible.

## Isolation & scope (Workfox-specific)
- [ ] New surfaces use only `components/ui-v2/*` (or the `.wfx` demo classes for the guidelines page); no import from the old `components/ui/*`.
- [ ] 21st.dev / any external component is retoned to our tokens before use — never dropped in with its own colors; gradients stripped unless data-true.
- [ ] Old UI (`app/login`, `components/ui`, `components/invigilator.css`) untouched; login (C1) untouched unless the change IS the scheduled login retone.
- [ ] Product name renders from `BRAND.productName` only (the `WorkfoxMark` identifier is fine).
