# Workfox v2 — UI/UX Review Checklist

The standard every v2 surface (`app/v2/**`) is reviewed against — by `/code-review` and by hand — before it ships. Informed by the [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines), UI UX Pro Max, and Anthropic frontend-design, adapted to Workfox's house rules.

**Authority order:** the [brand guidelines](workfox-brand-guidelines.html) (and the living `/v2/brand` page) win on look, color, type, and voice. This checklist enforces interaction, accessibility, and build quality the guidelines state as principles. Where an external source conflicts with our guidelines, **our guidelines win.**

## House overrides (do NOT import these from Vercel)
- **Sentence case** for headings, buttons, labels — never Title Case (Vercel says Title Case; our Voice chapter wins).
- **Spell out "and"** — do not use "&" in copy (Vercel prefers "&").
- **No exclamation marks** in system copy.
- **CTA / focus color is the org accent slot**, not a fixed brand color — never hardcode `#3b5fe3`; use `var(--accent)` / `var(--org-primary)`.
- **Two token sets exist today:** login is C1 under `.v2`; new v2 surfaces are Azure under `.wfx`. Never let one scope's values leak into the other.
- **Landing-page "anti-AI-slop" advice does not apply to the console** (neo-brutalism, exaggerated padding, spring physics on every element, 900-weight headers). Personality: "a tool teams live in all day, not a landing page." The Motion chapter already fixes what moves and how.

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

## Information design — what goes on a screen (Workfox-specific)
Every section above can pass while a screen still reads as a generated template. This section reviews the layer a template decides for you — what is shown, what comes first, and what it is called. Personality sets the bar: "a tool teams live in all day, not a landing page."
- [ ] The unit of a home or list screen is a person + their context + one next action — never a metric tile. Recruiting is people and decisions.
- [ ] One focal point per screen, chosen by importance to the person using it, not by template order. If two things shout, nothing does.
- [ ] Dense enough to scan in a second: 13–14px rows, real names, real next actions. No landing-page whitespace on work screens.
- [ ] Metrics are demoted on work screens — a quiet strip, or a link to Reports. A "+12% vs window" appears only where it changes a decision.
- [ ] Bricolage for the one thing to be read first (a greeting, a name, a section heading); everything else Hanken 13–14 (see Typography).
- [ ] Group labels name the person's obligation, not the system's state: "Feedback you owe", not "Pending grading". Fact, then next step (see Voice).
- [ ] 21st.dev intake goes one layer deeper than tokens: strip the template's information architecture too. Keep the component, discard its dashboard.
- [ ] Retired patterns — fail the review on sight: gradient-fill area charts on work screens (intake: gradients only when data-true); gauges against invented targets (Standards: every decorating metric must be data-true); rainbow-tinted icon stat tiles; icon-in-a-circle + bold header + paragraph rows; grids of equal-weight cards with no first thing.

Worked example: the recruiter home as shipped, annotated, beside a people-first "Today" in the same shell — https://claude.ai/code/artifact/cadde746-7cde-4f75-b527-fba5b73d1485
