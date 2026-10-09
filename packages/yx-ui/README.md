# @yukthix/ui

YukthiX design system (brand/DESIGN-SYSTEM.md v1.0), copied into the monorepo from the standalone
`yukthix-ui` project. Apps consume the TypeScript source (`transpilePackages` in apps/web).

```tsx
import '@yukthix/ui/styles.css';                        // once, in the root layout
import { Button, FormField } from '@yukthix/ui';
import { SignInScreen, SecurityShell } from '@yukthix/ui/auth'; // P12 sign-in and security screens
import { PayDiffPanel } from '@yukthix/ui/screens/pay/employee-pay'; // any screen file: @yukthix/ui/screens/<module>/<file>
```

| Command (in this folder) | What it does |
|---|---|
| `npm run storybook` | Component and screen workshop on port 6006 (theme, density, viewports 390 / 871 / 1280 / 1440) |
| `npm run build-storybook` | Static Storybook in `storybook-static/` |
| `npm test` | Component tests (Vitest + Testing Library) |
| `npm run check:tokens` | Fails on raw colours, raw sizes, primitive tokens or real company names in sample data |
| `npm run typecheck` | TypeScript (src, tests, configs) |
| `npm run scan:buttons` | Lists screen buttons with no action (no onClick, link, submit or disabled) |
| `npm run check:responsive -- <storybookUrl>` | Every screen story at 1920 / 1366 / 1024 / 768 / 390 px: sideways overflow or a double scroll bar fails |
| `npm run test:visual` | Builds Storybook and compares every story in light and dark with `tests/__screenshots__` (Git LFS); `test:visual:update` accepts intended changes |
| `npm run test:a11y` | Builds Storybook and runs axe (WCAG 2.2 AA) on every story in light and dark |

- Set `data-theme="dark"` on `<html>` for dark mode and `data-density="compact"` for compact tables and forms.
- Add `class="yx-body"` to `<body>` for the base font, size and page colour.
- IBM Plex fonts are bundled and self-hosted; no Google Fonts call.

## Layout

```
src/styles/tokens.css      primitive → semantic → component tokens, dark mode, density
src/components/*.tsx       components, one file per family, with a matching .css
src/lib/                   format (₹, dates, times), validators (PAN, IFSC, UAN, Aadhaar, phone)
src/stories/               component stories
src/screens/<module>/      product screen prototypes (_kit, growth, hiring, ops, pay, people, platform-a,
                           platform-b, portals, proctoring, settings, time) with stories, tests and sample data;
                           auth/ holds the P12 sign-in screens used by apps/web
review/                    RULES.md (R1–R11 screen review rules), PAY-CHECKLIST.md, TIME review reports
docs/                      BUILD-BRIEF.md and SCREENS-BRIEF.md: the rules every screen was built to
```

## Rules for contributors (§41–§44)

1. Colours and sizes come from `src/styles/tokens.css` only. Components use semantic (`--yx-color-…`) or component (`--yx-button-…`) tokens, never primitives like `--yx-azure-500`.
2. Every component has a story showing all variants and states, and passes the axe check in light, dark, comfortable and compact.
3. Logic with branches (formats, masks, validation, upload) has a test.
4. Nothing from the §0 banned list: no gradients, glass, hover lift or glow, pill buttons, emoji, sparkle AI icons.
5. A human designer reviews new components before release.

Screenshot baselines exist for win32 only (`tests/__screenshots__/win32`); a Linux CI run needs its own baselines.
