# Interview Panel Console Motion & Visual Redesign — Design

## Context

The recruiter, org-admin, and platform-admin consoles have all received the same motion & visual
redesign this session: Framer Motion entrance animation, `CardGrid` replacing `Table` on list
pages, and nav hover transitions (plus, most recently, `MotionConfig reducedMotion="user"` wired
in from the start rather than as a final-review fix). The interview panel console
(`apps/web/app/(panel)/**`) is next in the agreed sequence. Like platform-admin, it has never
received the `recruiter-*`/`status-*` design-token migration — it uses plain gray Tailwind
classes, plus an existing mix of `Badge`, `StatusBadge`, and `IntegrityBadge` components across
its four pages. This pass does not touch that palette or component mix; it only layers `CardGrid`
and motion on top, exactly as decided for platform-admin.

## Goal

Give the interview panel console the same "alive, modern SaaS" motion feel as the other three
consoles, without migrating its color system and without forcing card-grid treatment onto content
that isn't actually a list (the comparison page's crosstab table).

## Scope

**In scope — panel console only** (`apps/web/app/(panel)/**`):
- **Layout nav** (`layout.tsx`) — hover-transition polish on the "Exams" nav link, the profile
  link, and the logout button (none currently have a `transition-colors` class), plus a
  `MotionConfig reducedMotion="user"` wrap around the layout's returned JSX tree, built in from
  the start (matching the org-admin/platform-admin precedent, not added as a follow-up fix).
- **Exams list** (`reports/page.tsx`) — the `Table` (Title link, Status `Badge`) → `CardGrid`.
- **Exam results page** (`reports/[examId]/page.tsx`):
  - The 4 summary stat `Card`s (Total candidates / Settled / Pass rate / Average score) gain
    staggered fade-up entrance motion.
  - The "Question accuracy" `Table` (Question / Accuracy % / Attempted-Included, no selection) →
    `CardGrid`.
  - The "Candidates" `Table` (checkbox select, candidate name link, status, score %, pass/fail
    `Badge`, `IntegrityBadge`) → `CardGrid`, with the existing `Checkbox` embedded directly in
    each card's `renderCard` output. Selecting a card's checkbox toggles it into `selectedIds`
    exactly as the row's checkbox does today — the "Compare selected" button, its 2-candidate
    minimum, and its navigation to the compare page are unchanged.
- **Candidate detail page** (`candidates/[candidateId]/page.tsx`) — motion polish only, no
  structural change: fade-up on the score `Card`, the AI Insight `Card` (whichever of its 3
  conditional states renders — summary / failed / not-yet-generated), and each section `Card` in
  the per-question breakdown (staggered by section index).

**Explicitly out of scope:**
- **Compare page** (`reports/[examId]/compare/page.tsx`) stays exactly as it is structurally — it
  is a metric×candidate crosstab (a raw HTML `<table>`, not the shared `Table` component), not a
  list of items, so `CardGrid` does not apply. Confirmed with the user. No motion added here
  either, to avoid a one-off treatment inconsistent with the rest of the pass.
- No design-token migration — this console's plain-gray Tailwind classes, and its existing mix of
  `Badge` / `StatusBadge` / `IntegrityBadge`, stay exactly as they are. Confirmed with the user,
  same decision as platform-admin.
- No sort toolbar on any of the three new card grids (Exams, Question accuracy, Candidates) — same
  sequencing precedent as every prior console (sort ships as a separate follow-up if wanted).
- No new dashboard, no Recharts, no new backend endpoints.
- Recruiter, org-admin, platform-admin, and candidate-facing consoles — untouched.

## Design

### CardGrid conversions

All three conversions reuse the existing `CardGrid` component (`components/ui/CardGrid.tsx`)
exactly as-is.

- **Exams list:** each card shows the exam title as a link (`href="/reports/{examId}"`) and a
  status `Badge` (draft/published/archived, same `STATUS_VARIANT` mapping as today).
- **Question accuracy:** each card shows the question text, accuracy percentage, and the
  "attempted / included" count — the same three values the table showed, no selection or links.
- **Candidates:** each card shows, in one unit: the existing `Checkbox` (`checked`/`onChange`
  wired to the same `toggleSelected(row.candidateId)` and `label` as today), the candidate name as
  a link into the detail page (with `attemptId` query param preserved), status text, score
  percentage, a pass/fail `Badge`, and an `IntegrityBadge`. The existing integrity-level filter
  (`integrityFilter` state, applied before rendering) and the "Compare selected" `Button` above the
  grid are unchanged — they operate on the same `selectedIds` state and `results` data, just
  rendered as cards instead of table rows.

### Motion polish (no structural change)

Same fade-up entrance pattern used throughout this session's redesign work:
`initial={{ opacity: 0, y: 10 }}`, `animate={{ opacity: 1, y: 0 }}`,
`transition={{ duration: 0.3, ease: 'easeOut' }}` (with `delay` added only where staggering is
called for below). No change to `components/ui/Card.tsx` itself.

- **Exam results page:** the 4 summary stat `Card`s get staggered delays `0`, `0.05`, `0.1`,
  `0.15`.
- **Candidate detail page:** the score `Card` (delay `0`), the AI Insight `Card` (delay `0.05`,
  whichever of its 3 conditional branches is currently rendering), and each section `Card` in the
  question-breakdown list (delay `0.1 + Math.min(index, 8) * 0.05`, capping the stagger at index 8
  the same way `CardGrid`'s own per-item stagger caps at `Math.min(index, 8) * 0.04`, so exams with
  many sections don't get a long tail of increasing delays).

### Nav polish + reduced-motion

Same three-className treatment as every prior console: add `transition-colors duration-150` to
the "Exams" nav `Link`, the profile `Link`, and the logout `button` in `(panel)/layout.tsx`. Wrap
the layout's returned JSX tree in `<MotionConfig reducedMotion="user">` (imported from
`framer-motion`) from the start.

## Error Handling & Fallback

No new error states — all three card-grid conversions keep their existing `isLoading`/`isError`
branches and empty-message strings unchanged; `CardGrid`'s existing empty-state rendering
(`emptyMessage` prop) is reused exactly as every prior conversion used it. The candidate detail
page's three AI-insight branches (summary / failed / not-yet-generated) and its integrity-flags
conditional rendering are unchanged — motion wraps around whichever branch is currently active.

## Testing

- Existing page tests (`reports/page.test.tsx`, `reports/[examId]/page.test.tsx`,
  `candidates/[candidateId]/page.test.tsx`, `layout.test.tsx`) are expected to need no changes —
  confirmed by reading them: none use a `getByRole('table')`-style structural query, they all
  assert via `getByText`/`getByRole('link'|'checkbox'|'button'|'combobox')`, which resolve
  identically against card markup as long as each value keeps its own isolated text node (the same
  precedent every prior conversion followed). Verify at implementation time; only touch a test
  file if a real assertion breaks, following this project's established convention: a purely
  structural query with no card equivalent gets the test updated to target the card
  (`.closest('.group')`); a text-isolation issue (a previously-isolated value merged into a
  combined text node) gets the *markup* fixed to re-isolate the value, not the assertion weakened.
- `compare/page.test.tsx` needs no changes — that page is untouched.
- No new tests required for the motion-only candidate detail page (matches this project's
  precedent — no motion-specific tests anywhere in the codebase).
- Live browser verification pass for all four pages once implemented, logged in as
  `panel@demo-org.test` / `Passw0rd!2026` (org slug `demo-org`), specifically re-testing the
  "Compare selected" flow (select 2+ candidate cards, click Compare, land on the compare page with
  the right candidate IDs) since that is the one piece of interactive logic moving into card
  markup for the first time in this session's redesign work.
