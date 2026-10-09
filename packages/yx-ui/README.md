# @yukthix/ui

YukthiX design system (brand/DESIGN-SYSTEM.md v1.0), copied into the monorepo from the standalone
`yukthix-ui` project. Apps consume the TypeScript source (`transpilePackages` in apps/web).

```tsx
import '@yukthix/ui/styles.css';                        // once, in the root layout
import { Button, FormField } from '@yukthix/ui';
import { SignInScreen, SecurityShell } from '@yukthix/ui/auth'; // P12 sign-in and security screens
```

| Command (in this folder) | What it does |
|---|---|
| `npm run storybook` | Component and screen workshop on port 6006 (theme, density, viewports 390 / 871 / 1280 / 1440) |
| `npm run build-storybook` | Static Storybook in `storybook-static/` |
| `npm test` | Component tests (Vitest + Testing Library) |
| `npm run check:tokens` | Fails on raw colours, raw sizes, primitive tokens or real company names in sample data |
| `npm run typecheck` | TypeScript |

Screen review rules: `review/RULES.md` in the yukthix-ui project (R1–R11).
