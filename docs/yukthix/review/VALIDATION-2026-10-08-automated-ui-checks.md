# Validation — automated UI checks, Areas 1–3 (8 Oct 2026)

Scope: sign-in, MFA / confirm-it's-you, My security, Login activity, Security settings (Storybook `Screens/Security/*`, 70 stories) and Legal entities, Locations, Structure, Company rules (`Screens/Settings/Organisation`, 10 stories). Read-only run: no code changed. Storybook was built fresh (`npx storybook build --quiet`, exit 0) and served from `storybook-static` on port 3200 only (`node scripts/serve-static.mjs storybook-static 3200`), stopped afterwards. All commands run from `C:/D-drive/exam-app-org/packages/yx-ui` unless stated.

| # | Check | Result |
|---|-------|--------|
| 1 | Token check | PASS — 568 files, 0 violations |
| 2 | Affordance guard, light + dark | PASS — 80 stories × 2 themes, 0 findings, 0 errors |
| 3 | Dead-button scan | PASS — 0 dead buttons (yx-ui auth/org/history + web `app/yx`) |
| 4 | Storybook a11y (axe, WCAG 2.x A/AA) | PASS — 160/160 (80 stories × light/dark) |
| 5 | Phone width 390 px | PASS — 80/80 stories, no horizontal scroll, no load errors |
| 6a | yx-ui `vitest run` | 2297 / 2298 passed in the full run; the one failure is a load-induced timeout outside Areas 1–3 and passes alone (see below) |
| 6b | web `jest app/yx lib` | PASS — 59 suites, 484 tests |

Findings needing a fix: **none in Areas 1–3.**

---

## 1. Token check

```
node scripts/check-tokens.mjs        (= npm run check:tokens)
```
Output: `tokens ok (568 files)`, `sample data ok (463 story files)`, exit 0. No raw hex/rgb/hsl colours, primitive tokens, raw px sizes or §0 banned patterns in `src`.

## 2. Affordance guard (light and dark)

`check-affordance.mjs` only accepts one `--only` substring, so it was run once per story-id prefix and once per theme. Note: the script serves `storybook-static` itself on an ephemeral port (`listen(0)`), not on 3200; it does not use any of the reserved ports.

```
node scripts/check-affordance.mjs storybook-static --only=screens-security-            --theme=light
node scripts/check-affordance.mjs storybook-static --only=screens-settings-organisation --theme=light
node scripts/check-affordance.mjs storybook-static --only=screens-security-            --theme=dark
node scripts/check-affordance.mjs storybook-static --only=screens-settings-organisation --theme=dark
```

| Run | Stories | Findings | Errors |
|-----|---------|----------|--------|
| Security, light | 70 | 0 | 0 |
| Organisation, light | 10 | 0 | 0 |
| Security, dark | 70 | 0 | 0 |
| Organisation, dark | 10 | 0 | 0 |

Rules covered: no-affordance, no-pointer, no-hover, no-focus-ring, state-colour-only, no-tooltip, weak-hover, boundary-contrast, on native controls and React `onClick` cards/rows. Nothing flagged.

## 3. Dead-button scan

```
node scripts/scan-dead-buttons.mjs src/screens/auth
node scripts/scan-dead-buttons.mjs src/screens/org
node scripts/scan-dead-buttons.mjs src/screens/history
node scripts/scan-dead-buttons.mjs C:/D-drive/exam-app-org/apps/web/app/yx
```
Each printed `[]` / `0 buttons with no action`. Supplementary grep for raw `<button>` elements without `onClick`, `type="submit"` or spread props in `apps/web/app/yx`, `src/screens/auth`, `src/screens/org`: no matches.

Wired pages covered: `apps/web/app/yx/sign-in`, `sign-in/callback`, `setup-mfa`, `forgot-password`, `reset-password/[token]`, `(app)/me/security`, `(app)/admin/login-activity`, `(app)/settings/security`, `(app)/settings/identity-providers`, `(app)/settings/legal-entities`, `(app)/settings/locations`, `(app)/settings/structure`, `(app)/settings/company-rules` (plus the other `app/yx` pages, all clean).

## 4. Storybook a11y (axe)

The repo's `tests/a11y.spec.ts` is wired to a Playwright `webServer` on port 6007. To honour the "3200 only" constraint without editing repo files, it was run through a throw-away config in the session scratchpad (`pw-a11y-3200.config.mjs`: same spec, `baseURL http://localhost:3200`, no `webServer`, Chrome channel, 4 workers):

```
npx playwright test --config <scratchpad>/pw-a11y-3200.config.mjs --grep "Screens/Security|Screens/Settings/Organisation"
```
Result: `160 passed (1.5m)` — every Area 1–3 story in light and dark, rules `wcag2a, wcag2aa, wcag21aa, wcag22aa`, and no page errors thrown by any story.

## 5. Phone width (390 px)

`check-responsive.mjs` has a `WIDTHS` env override; run once per title prefix against the 3200 server:

```
WIDTHS=390 OUT=<scratchpad>/resp-Screens-Security.jsonl               node scripts/check-responsive.mjs http://localhost:3200 "Screens/Security"
WIDTHS=390 OUT=<scratchpad>/resp-Screens-Settings-Organisation.jsonl  node scripts/check-responsive.mjs http://localhost:3200 "Screens/Settings/Organisation"
```
Results: `70/70 ok · 0 with issues · 0 load errors` and `10/10 ok · 0 with issues · 0 load errors`. Checks: page scrolls sideways, main content scrolls sideways, whole-page double scroll bar, table action buttons spilling over columns, elements poking past the viewport edge.

## 6. Unit tests

### 6a. yx-ui — `npx vitest run`

Full run (started while the Storybook build was still running on the same machine):

```
Test Files  1 failed | 38 passed (39)
     Tests  1 failed | 2297 passed (2298)
  Duration  61.06s
FAIL src/screens/people/people.test.tsx > screens > scheduled changes: cancel needs a reason
     Error: Test timed out in 5000ms   (people.test.tsx:214)
```
This file is outside Areas 1–3 (People / scheduled changes). Re-run alone: `npx vitest run src/screens/people/people.test.tsx` → `295 passed (295)`. Classified as a load-induced timeout (5 s default, userEvent-heavy test, CPU shared with the Storybook build), not a product defect. If it recurs in CI, the fix is a per-test timeout, not a screen change.

`history.test.tsx` (the flake seen earlier today) — run alone three times:

```
npx vitest run src/screens/history/history.test.tsx   ×3  →  18 passed (18) each time
```
It also passed inside the full run. Not reproducibly flaky in this session; the earlier failure was most likely the same contention-timeout pattern as above.

### 6b. web — `npx jest app/yx lib` (from `C:/D-drive/exam-app-org/apps/web`)

```
Test Suites: 59 passed, 59 total
Tests:       484 passed, 484 total
Time:        39.8 s
```

---

## Notes / caveats

- `scan-dead-buttons.mjs` only inspects `<Button>`/`<IconButton>` JSX tags; buttons rendered via other components are not covered (the raw `<button>` grep above partially closes that gap).
- `check-affordance.mjs` uses its own ephemeral-port static server regardless of the 3200 server; harmless, but note it if the port constraint is ever strict.
- Both runs of `check-responsive.mjs` are resumable and append to their `OUT` file; scratchpad copies were used so `test-results/responsive.jsonl` in the repo was not touched.
- Ports used: 3200 only (plus the affordance script's ephemeral port). Server on 3200 killed at the end (PID 6936); `netstat` confirms nothing listening.
