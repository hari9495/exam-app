# UI Design Foundation — Implementation Plan (Wave 2: the remaining kit components)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Migrate the remaining `components/ui` primitives onto the Wave-1 "Invigilator" tokens (self-hosted fonts, slate neutrals, squared shapes, rationed colour, hairline elevation), so the whole kit reads as one system.

**Architecture:** Wave 1 (merged to `main` as `c2c7f4d9`) established the tokens and rebuilt StatusBadge/Card/Input/Button. Wave 2 retones the rest against those same tokens. Most changes are class substitutions (old grey/shadow/pill utilities → `ink`/`muted`/`rule`/`paper`/`ground`/`status.*` + squared radii), not rewrites. Component APIs are unchanged.

**Tech Stack:** Next.js 16 · React 18 · TypeScript · Tailwind 3.4 · Framer Motion · Jest + RTL. Tokens already exist from Wave 1: `text-ink text-muted border-rule bg-paper bg-ground`, `font-display font-body`, and the pre-existing `status.*` semantic colours.

**Execution note:** Run in an ISOLATED git worktree off `main` (Wave 1 proved the main working directory is shared by concurrent sessions that mutate git). `git worktree add -b feat/ui-foundation-wave2 D:/exam-app-ui-foundation-w2 main`, `npm ci` there, execute, merge to `main` when the full suite is green.

## Global Constraints

Every task implicitly includes these (carried from `docs/superpowers/specs/2026-08-19-ui-foundation-design.md` + Wave-1 lessons):

- **`main` green and deployable after every task.** Component-by-component; never leave the suite red.
- **Verification is LEAN (the machine is often loaded):** each task's gate is the touched components' OWN test files (fast). The controller runs the FULL suite + `tsc --noEmit` + `npm run build` ONCE at the end of the wave — the full build is the gate that catches type errors ts-jest misses (Wave 1's `motion.button` TS2322) and consumer-test regressions from class navigation (Wave 1's `.closest('.rounded-lg')`).
- **Commits are path-specific — NEVER `git add -A`.** Commit only the task's exact component + test paths.
- **Public component APIs UNCHANGED.** Props, exported names, and — for form controls — the label/`id`/`htmlFor` wiring must be byte-identical (dozens of `getByLabelText` queries depend on it). Only appearance changes.
- **Keep `clsx`; NO `tailwind-merge`.** Vary a component through typed props, never a raw `className` that fights defaults.
- **State is never colour-only** — any state indicator keeps a text label.
- **Round stays round where round is correct:** a Radio's circle, a Checkbox's check, CodeEditor's traffic-light dots, and avatar circles are legitimately `rounded-full` — do NOT square them. `rounded-full` is only wrong on *pills* (status chips). When in doubt, a control that represents a single-select dot or a decorative dot stays round.
- **Overlay elevation is a deliberate exception to "no drop-shadow."** The Wave-1 rule (depth via 1px `rule` border, no soft shadow) was for cards sitting *on* the page. A true floating layer over a scrim — Modal, DropdownMenu, Toast — legitimately needs elevation to separate from what's behind it. These keep a *considered* shadow (a defined `shadow-lg`/`shadow-md`, not the vague `shadow-sm` polish), plus `bg-paper` and a `rule` border. Non-floating surfaces (CollapsibleSection, CardGrid) lose their shadow entirely.
- **Monaco stays pinned at `0.52.2`** — never bump; CodeEditor changes chrome only, never the editor mount.

## Component inventory (grounded survey)

17 components need work; **IntegrityBadge needs none** — it already delegates to `StatusBadge`, so it inherited Wave 1's squared+marker fix. It gets a one-line verification test, not a change.

| Group | Components | Nature of change |
|---|---|---|
| Badges & notes | Badge, RequiredFieldsNote | Badge → squared + `status.*` tokens (like StatusBadge); RequiredFieldsNote grey → `muted` |
| Form controls | Select, Checkbox, Radio | Slate/squared like Input; **Radio circle + Checkbox check stay their shape**; label wiring untouched |
| Overlays | Modal, DropdownMenu, Toast | grey/white → `paper`/`ink`, keep a *considered* elevation shadow; Toast success/danger → `status.*` |
| Surfaces | CollapsibleSection, CardGrid | `bg-white shadow*` → `bg-paper` + `rule` hairline, no shadow; CardGrid hover reworked to a border/ground shift |
| Chrome | Tabs, Pagination, ColumnChooser, FilterableHeader, NumberFilterHeader, Table | grey → slate (`border-gray-*`→`border-rule`, `text-gray-*`→`text-muted`/`ink`); several already near-neutral (light touch) |
| Code | CodeEditor | dark IDE chrome retoned; **Monaco mount untouched**; traffic-light dots stay round |

---

### Task 1: Badges & notes — Badge, RequiredFieldsNote (+ verify IntegrityBadge)

**Files:**
- Modify: `apps/web/components/ui/Badge.tsx`, `Badge.test.tsx`
- Modify: `apps/web/components/ui/RequiredFieldsNote.tsx` (+ create/modify its test if none)
- Modify: `apps/web/components/ui/IntegrityBadge.test.tsx` (verification only)

**Interfaces:** Badge API `{ variant?: 'default'|'success'|'warning'|'danger', children }` unchanged. Consumes `status.*` tokens + squared radius.

- [ ] **Step 1: Failing test for Badge — squared + status tokens.** In `Badge.test.tsx`, add: rendering `variant="success"` yields a badge whose className has no `rounded-full` and no `bg-green-100`, and contains `bg-status-success-bg`/`text-status-success` and a squared `rounded`. Run `npx jest components/ui/Badge` — expect FAIL (old Badge is `rounded-full bg-green-100`).
- [ ] **Step 2: Rewrite Badge.tsx** — map its four variants onto the semantic tokens and square it, mirroring StatusBadge's shape (squared `rounded`, `font-body text-xs font-semibold`). Exact variant→token map: `default→bg-status-neutral-bg text-status-neutral`, `success→bg-status-success-bg text-status-success`, `warning→bg-status-warning-bg text-status-warning`, `danger→bg-status-danger-bg text-status-danger`. Keep `clsx`, keep the `{ variant, children }` signature. (Badge stays label-only — no marker — to remain distinct from StatusBadge; 28 files consume it, so do not change its API or add children.)
- [ ] **Step 3: Run `npx jest components/ui/Badge`** — expect PASS.
- [ ] **Step 4: RequiredFieldsNote** — swap `text-gray-500` → `text-muted`, `font-body`. If it has no test, add a one-line render test asserting it shows its note text. Run its test — PASS.
- [ ] **Step 5: IntegrityBadge verification** — in `IntegrityBadge.test.tsx` add one test asserting a rendered IntegrityBadge contains a `[data-status-marker]` (proving it inherits StatusBadge's Wave-1 marker) and its level label text. Run `npx jest components/ui/IntegrityBadge` — expect PASS with no change to `IntegrityBadge.tsx`.
- [ ] **Step 6: Commit** — `git add apps/web/components/ui/Badge.tsx apps/web/components/ui/Badge.test.tsx apps/web/components/ui/RequiredFieldsNote.tsx apps/web/components/ui/RequiredFieldsNote.test.tsx apps/web/components/ui/IntegrityBadge.test.tsx` → `git commit -m "feat(ui): squared Badge on status tokens; slate RequiredFieldsNote"`.

---

### Task 2: Form controls — Select, Checkbox, Radio

**Files:** `Select.tsx`+test, `Checkbox.tsx`+test, `Radio.tsx`+test.

**Interfaces:** All keep their exact props and — critically — their label/`id`/`htmlFor`/`useId` wiring. Consumes `border-rule`/`bg-paper`/`text-ink`/`primary`.

- [ ] **Step 1: Select — failing test.** Assert the trigger has `border-rule`/`rounded-lg` and its dropdown surface uses `bg-paper` (not `bg-white`/`bg-gray-100`). Run — FAIL.
- [ ] **Step 2: Retone Select.tsx** — trigger `border-gray-* → border-rule`, `rounded → rounded-lg`, `bg-white → bg-paper`, `text-gray-700 → text-ink`; dropdown `shadow-md` kept as a *considered* elevation (it's a floating popover) but `bg-white → bg-paper`; selected/hover rows `bg-gray-100 → bg-ground`. `focus:ring-primary/15` on the trigger. Keep the label/value/onChange API. Run Select test — PASS.
- [ ] **Step 3: Checkbox — failing test + retone.** `border-gray-400 → border-rule`, `text-gray-* → text-ink`, checked state uses `bg-primary`/`border-primary`, the check glyph stays. **Do NOT change the box's small radius or the check** — only colours. Assert the labelled checkbox resolves via `getByLabelText` (wiring intact) and uses `border-rule`. Run — PASS.
- [ ] **Step 4: Radio — failing test + retone.** `border-gray-400 → border-rule`, `text-gray-700 → text-ink`, checked `border-primary` + inner dot `bg-primary` kept. **KEEP both `rounded-full` (line ~33 the circle, line ~35 `after:rounded-full` the dot) — a radio is a circle.** Assert the radio still resolves by its accessible label and the circle class (`rounded-full`) is still present. Run — PASS.
- [ ] **Step 5: Full form-control test run** — `npx jest components/ui/Select components/ui/Checkbox components/ui/Radio` — all PASS, including every original label/behaviour test (a broken `getByLabelText` = wiring changed = STOP and fix).
- [ ] **Step 6: Commit** — path-specific for the 6 files → `git commit -m "feat(ui): slate Select/Checkbox/Radio (radio circle preserved)"`.

---

### Task 3: Overlays — Modal, DropdownMenu, Toast

**Files:** `Modal.tsx`+test, `DropdownMenu.tsx`+test, `Toast.tsx`+test.

**Interfaces:** APIs unchanged. These are floating layers — they keep a *considered* elevation shadow (see Global Constraints) plus `bg-paper` + `rule` border.

- [ ] **Step 1: Modal — failing test.** Assert the dialog panel uses `bg-paper` (not `bg-white`) and has a `rule` border; the scrim `bg-black/40` stays. Run — FAIL (`bg-white shadow-xl`).
- [ ] **Step 2: Retone Modal.tsx** — panel `bg-white → bg-paper`, add `border border-rule`, keep a deliberate `shadow-xl` (it floats over the scrim), `rounded-lg` kept, `font-body`. Title/text greys → `ink`/`muted`. Run Modal test — PASS.
- [ ] **Step 3: DropdownMenu — failing test + retone.** `bg-white → bg-paper`, `border border-rule`, keep `shadow-md` (floating popover), `bg-gray-100 → bg-ground` on hover/active items, `text-gray-* → text-ink`/`muted`. Run — PASS.
- [ ] **Step 4: Toast — failing test + retone.** success/error backgrounds `bg-green-600`/`bg-red-600` → the semantic tokens (`bg-status-success`/`bg-status-danger` with appropriate on-colour text), keep a `shadow-md` (floats), `rounded-lg`, `font-body`. Assert a success toast uses the status-success token, not `bg-green-600`. Run — PASS.
- [ ] **Step 5:** `npx jest components/ui/Modal components/ui/DropdownMenu components/ui/Toast` — all PASS.
- [ ] **Step 6: Commit** — path-specific → `git commit -m "feat(ui): retone overlays (Modal/DropdownMenu/Toast) with considered elevation"`.

---

### Task 4: Surfaces — CollapsibleSection, CardGrid

**Files:** `CollapsibleSection.tsx`+test, `CardGrid.tsx`+test.

**Interfaces:** APIs unchanged. These sit ON the page, so they lose their shadow (hairline only), matching Card.

- [ ] **Step 1: CollapsibleSection — failing test.** No `shadow` class; has `border-rule`; `bg-paper`. Run — FAIL (`bg-white shadow-sm`).
- [ ] **Step 2: Retone CollapsibleSection.tsx** — `bg-white → bg-paper`, `shadow-sm` removed, `border border-rule` for depth, header text greys → `ink`/`muted`. Run — PASS.
- [ ] **Step 3: CardGrid — failing test + retone.** `bg-white → bg-paper`, remove `shadow`/`shadow-sm`, and **rework the `hover:shadow-md`** into a non-shadow hover (a `hover:border-primary/30` or `hover:bg-ground` shift — depth without a blur). Assert no `shadow` class and a `rule` border. Run — PASS.
- [ ] **Step 4:** `npx jest components/ui/CardGrid components/ui/CollapsibleSection` — PASS.
- [ ] **Step 5: Commit** — path-specific → `git commit -m "feat(ui): hairline surfaces (CollapsibleSection/CardGrid), no shadow"`.

---

### Task 5: Chrome — Tabs, Pagination, ColumnChooser, FilterableHeader, NumberFilterHeader, Table

**Files:** the six components + their tests (where present).

**Interfaces:** APIs unchanged. Mostly grey→slate retone; the survey showed Tabs uses `border-gray-200`/`text-gray-600`, the other five are already near-neutral (verify and lightly retone any remaining `gray-*`/`white`).

- [ ] **Step 1: Tabs — failing test + retone.** `border-gray-200 → border-rule`, `text-gray-600 → text-muted`, the active tab uses `text-primary`/a `primary` underline, `font-body`. Assert the active tab uses `primary` and the rest `muted`. Run — PASS.
- [ ] **Step 2: The other five — audit + retone.** For each of Pagination, ColumnChooser, FilterableHeader, NumberFilterHeader, Table: `grep -nE "gray-[0-9]+|bg-white|shadow" <file>`; replace any `border-gray-*→border-rule`, `text-gray-*→text-muted`/`ink`, `bg-white→bg-paper`, `bg-gray-100→bg-ground`; drop any `shadow-sm`. If a file has none, it is already compliant — leave it and note so in the report (do not invent changes). Add or extend a minimal render test per file you changed asserting the new token is present.
- [ ] **Step 3:** run each changed component's test — all PASS.
- [ ] **Step 4: Commit** — path-specific for exactly the files you changed → `git commit -m "feat(ui): slate chrome (Tabs + filter headers/table where needed)"`.

---

### Task 6: CodeEditor chrome

**Files:** `CodeEditor.tsx`+test.

**Interfaces:** API unchanged. **The Monaco mount, its `language` prop plumbing, and the pinned `0.52.2` are untouched** — only the surrounding dark IDE chrome retones.

- [ ] **Step 1: Failing test + retone.** The dark chrome greys (`text-gray-300`) → a slate-appropriate light token; `shadow-sm` removed (the editor sits on the page); the language badge retoned. **KEEP the traffic-light dots `rounded-full`** (they are decorative dots, correctly round). Assert the traffic-light dots are still `rounded-full` and the chrome no longer uses `shadow-sm`. Run `npx jest components/ui/CodeEditor` — FAIL then PASS.
- [ ] **Step 2: Commit** — `git add apps/web/components/ui/CodeEditor.tsx apps/web/components/ui/CodeEditor.test.tsx` → `git commit -m "feat(ui): retone CodeEditor chrome; Monaco + dots untouched"`.

---

## End-of-wave gate (controller-run, once)

After all six tasks: `npx jest` (full suite), `npx tsc --noEmit`, `npm run build`. Fix any consumer-test regression (a page navigating a component by an old class — the Wave-1 `.closest('.rounded-lg')` pattern) and any type error the lean per-task ts-jest missed, exactly as Wave 1 did. Then the final whole-branch review (most capable model), then merge to `main`.

## Self-review

**Spec coverage:** every non-Wave-1 kit component is assigned (17 changed + IntegrityBadge verified). Overlay-elevation and round-stays-round decisions are in Global Constraints so every task inherits them. The `status.*`-tokens-for-badges and slate-for-chrome directions match the spec's rationed-colour + slate-canvas intent.

**Placeholder scan:** the retone tasks give exact old→new class substitutions rather than full-file transcriptions (appropriate — these are edits to existing files whose full content the implementer reads); no "TBD"/"handle appropriately". Task 5 Step 2 names the exact grep and the exact substitutions, and explicitly says to leave already-compliant files alone rather than invent changes.

**Type consistency:** token names (`ink/muted/rule/paper/ground`, `bg-status-*`) match Wave 1's shipped tokens exactly. No new prop or exported name is introduced anywhere.

**Known risks carried from Wave 1:** consumer tests that navigate components by class (`.closest('.rounded-lg')` etc.) — the end gate is where these surface; the fix is to preserve the navigated class or update the brittle test, decided case-by-case. Overlay shadows are a deliberate, documented exception, not an oversight.
