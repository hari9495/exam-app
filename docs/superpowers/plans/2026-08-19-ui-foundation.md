# UI Design Foundation — Implementation Plan (Wave 1: tokens, fonts, core primitives)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the "Invigilator" design foundation — self-hosted typefaces, slate neutral tokens, and the four most-repeated `components/ui` primitives (StatusBadge, Card, Input, Button) rebuilt on it — with `main` green and deployable after every task.

**Architecture:** Extend the product's existing CSS-variable theming (the same `--color-*` vars the white-label system already uses); add slate neutral vars and two self-hosted font families alongside the existing tokens so nothing breaks; then migrate primitives one at a time. Semantic state colours (`status.*`) already exist and are reused unchanged — only component *shape* and *type* change.

**Tech Stack:** Next.js 16 (App Router) · React 18 · TypeScript · Tailwind CSS 3.4 · Framer Motion · Jest + React Testing Library (jsdom). Fonts self-hosted as woff2 in `apps/web/public/fonts` (already present).

**Scope note:** This is Wave 1 of the foundation. It ships tokens + fonts + StatusBadge, Card, Input, Button. The other 18 kit components (Badge, Select, Checkbox, Radio, Tabs, Modal, Toast, Pagination, DropdownMenu, CollapsibleSection, ColumnChooser, FilterableHeader, NumberFilterHeader, Table, CardGrid, IntegrityBadge, RequiredFieldsNote, CodeEditor) follow in a Wave-2 plan reusing the exact patterns established here. Page layout/IA is out of scope entirely (separate per-console specs).

## Global Constraints

Every task's requirements implicitly include these (verbatim from `docs/superpowers/specs/2026-08-19-ui-foundation-design.md`):

- **`main` green and deployable after every task.** Component-by-component; never leave the suite red.
- **Typed `variant`/`size`/`tone` props; keep `clsx`; do NOT add `tailwind-merge`.** A call site varies a component only through a named prop, never a raw `className` that fights the defaults.
- **Navy panel (`brand.navy` `#001E60`) is for auth + public marketing surfaces only** (login, forgot-password, landing). Consoles stay greyscale slate. (No console component in this wave uses navy.)
- **Self-host fonts. NEVER `next/font/google`** — this environment's network egress is intermittently blocked (VPN); a build-time font fetch would break the production build. Use `@font-face` against `public/fonts` woff2.
- **No soft drop-shadows.** Depth comes from a 1px `--slate-rule` border. One exception: a 1px inset hairline highlight as the "lit edge" of a dark panel (not used in this wave).
- **State tags are squared (4px radius), never `rounded-full`, always carry a text label** beside a filled marker (state is never encoded by colour alone).
- **Tabular numerals** (`tabular-nums`) wherever digits align.
- **Reduced motion honoured** — animated components must disable transforms when the user prefers reduced motion.
- **Accessible-name and behaviour test assertions must not change.** Only appearance changes. When a test breaks, fix it only if it asserted the *old appearance*; never weaken a behaviour or accessible-name assertion.
- **Monaco stays pinned at `0.52.2`** — never bump (0.55+ ships a non-AMD build that hangs the editor). Not touched in this wave.

---

## File structure

- `apps/web/public/fonts/*.woff2` — self-hosted font subsets (already present; Task 1 confirms).
- `apps/web/app/globals.css` — `@font-face` blocks, slate `--slate-*` vars in `:root`, global body font. **Modified** in Tasks 1–2.
- `apps/web/tailwind.config.ts` — `fontFamily.display/body`, `colors.ink/muted/rule/paper/ground`. **Modified** in Tasks 1–2.
- `apps/web/tailwind.config.test.ts` — **Created** in Task 1; guards the config keys.
- `apps/web/components/ui/StatusBadge.tsx` + `.test.tsx` — squared tag + marker. **Modified** Task 3.
- `apps/web/components/ui/Card.tsx` + `.test.tsx` — hairline, no shadow. **Modified** Task 4.
- `apps/web/components/ui/Input.tsx` + `.test.tsx` — squared slate + focus ring. **Modified** Task 5.
- `apps/web/components/ui/Button.tsx` + `.test.tsx` — variant/size/tone + built-in press. **Modified** Task 6.
- `apps/web/jest.setup.ts` — `matchMedia` polyfill. **Modified** Task 6.

---

### Task 1: Self-host fonts and register font families

**Files:**
- Confirm: `apps/web/public/fonts/{bricolage-grotesque-500,bricolage-grotesque-700,hanken-grotesk-400,hanken-grotesk-500,hanken-grotesk-600}.woff2`
- Modify: `apps/web/app/globals.css` (add `@font-face` + global body font)
- Modify: `apps/web/tailwind.config.ts` (add `fontFamily`)
- Create: `apps/web/tailwind.config.test.ts`

**Interfaces:**
- Produces: Tailwind utilities `font-display` (Bricolage Grotesque) and `font-body` (Hanken Grotesk). Consumed by Tasks 3–6.

- [ ] **Step 1: Confirm the font files exist**

Run: `ls apps/web/public/fonts/`
Expected output includes: `bricolage-grotesque-500.woff2 bricolage-grotesque-700.woff2 hanken-grotesk-400.woff2 hanken-grotesk-500.woff2 hanken-grotesk-600.woff2`

If any are missing, they were fetched during prototyping into `apps/web/public/lab-fonts/` — copy them: `cp apps/web/public/lab-fonts/*.woff2 apps/web/public/fonts/`.

- [ ] **Step 2: Write the failing config test**

Create `apps/web/tailwind.config.test.ts`:

```ts
import config from './tailwind.config';

describe('tailwind foundation tokens', () => {
  const colors = (config.theme?.extend?.colors ?? {}) as Record<string, unknown>;
  const fonts = (config.theme?.extend?.fontFamily ?? {}) as Record<string, string[]>;

  it('registers the Bricolage display family and Hanken body family', () => {
    expect(fonts.display?.[0]).toBe('Bricolage Grotesque');
    expect(fonts.body?.[0]).toBe('Hanken Grotesk');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/web && npx jest tailwind.config.test.ts`
Expected: FAIL — `fonts.display` is undefined.

- [ ] **Step 4: Add the font families to `tailwind.config.ts`**

In `apps/web/tailwind.config.ts`, inside `theme.extend`, add a `fontFamily` key beside `colors`:

```ts
      fontFamily: {
        // Self-hosted (see globals.css @font-face). Display carries titles, the exam clock, and
        // large numerals; body carries everything else. system-ui is the graceful fallback if a
        // woff2 fails to load, which is why @font-face uses font-display: swap.
        display: ['Bricolage Grotesque', 'Hanken Grotesk', 'system-ui', 'sans-serif'],
        body: ['Hanken Grotesk', 'system-ui', 'sans-serif'],
      },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/web && npx jest tailwind.config.test.ts`
Expected: PASS.

- [ ] **Step 6: Add `@font-face` and the global body font to `globals.css`**

At the top of `apps/web/app/globals.css`, immediately after the `@tailwind` lines, add:

```css
@font-face { font-family:'Bricolage Grotesque'; font-weight:500; font-display:swap;
  src:url('/fonts/bricolage-grotesque-500.woff2') format('woff2'); }
@font-face { font-family:'Bricolage Grotesque'; font-weight:700; font-display:swap;
  src:url('/fonts/bricolage-grotesque-700.woff2') format('woff2'); }
@font-face { font-family:'Hanken Grotesk'; font-weight:400; font-display:swap;
  src:url('/fonts/hanken-grotesk-400.woff2') format('woff2'); }
@font-face { font-family:'Hanken Grotesk'; font-weight:500; font-display:swap;
  src:url('/fonts/hanken-grotesk-500.woff2') format('woff2'); }
@font-face { font-family:'Hanken Grotesk'; font-weight:600; font-display:swap;
  src:url('/fonts/hanken-grotesk-600.woff2') format('woff2'); }
```

Then, inside the existing `:root { ... }` block, this is the one deliberately global change — set the product body font:

```css
  font-family: 'Hanken Grotesk', system-ui, sans-serif;
```

(Place it as the last declaration inside `:root`. It changes every page's base font at once — acceptable and reversible, and the single highest-impact "not-a-prototype" win. Display font is applied per-component as primitives migrate.)

- [ ] **Step 7: Verify the build compiles and the font rule shipped**

Run: `cd apps/web && npm run build 2>&1 | tail -3`
Expected: build completes without error (the `postbuild` copy log is the last line).

Run: `grep -c "Bricolage Grotesque" apps/web/app/globals.css`
Expected: `2` (the two Bricolage weights).

- [ ] **Step 8: Run the full web suite to confirm nothing regressed**

Run: `cd apps/web && npx jest 2>&1 | grep -E "^Tests:|^Test Suites:"`
Expected: all pass (a global font change touches no assertion).

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/globals.css apps/web/tailwind.config.ts apps/web/tailwind.config.test.ts apps/web/public/fonts
git commit -m "feat(ui): self-host Bricolage Grotesque + Hanken Grotesk, set body font"
```

---

### Task 2: Slate neutral tokens

**Files:**
- Modify: `apps/web/app/globals.css` (`:root` vars)
- Modify: `apps/web/tailwind.config.ts` (`colors`)
- Modify: `apps/web/tailwind.config.test.ts` (extend)

**Interfaces:**
- Produces: Tailwind utilities `text-ink`, `text-muted`, `border-rule`, `bg-paper`, `bg-ground` backed by `--slate-*` vars. Consumed by Tasks 3–6. Existing `status.*`, `recruiter.*`, `candidate.*` tokens are left untouched (migrated per-component later), so nothing breaks.

- [ ] **Step 1: Extend the config test (failing)**

In `apps/web/tailwind.config.test.ts`, add inside the `describe`:

```ts
  it('exposes slate neutral tokens backed by CSS variables', () => {
    expect(colors.ink).toBe('var(--slate-ink, #1b2530)');
    expect(colors.muted).toBe('var(--slate-muted, #5c6875)');
    expect(colors.rule).toBe('var(--slate-rule, #dbe0e6)');
    expect(colors.paper).toBe('var(--slate-paper, #ffffff)');
    expect(colors.ground).toBe('var(--slate-ground, #eceff3)');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx jest tailwind.config.test.ts`
Expected: FAIL — `colors.ink` is undefined.

- [ ] **Step 3: Add the tokens to `tailwind.config.ts`**

In `theme.extend.colors`, add these top-level keys (beside `primary`):

```ts
        ink: 'var(--slate-ink, #1b2530)',
        muted: 'var(--slate-muted, #5c6875)',
        rule: 'var(--slate-rule, #dbe0e6)',
        paper: 'var(--slate-paper, #ffffff)',
        ground: 'var(--slate-ground, #eceff3)',
```

- [ ] **Step 4: Add the variable defaults to `globals.css`**

Inside `:root` in `apps/web/app/globals.css`, above the body `font-family` line:

```css
  --slate-ink: #1b2530;
  --slate-muted: #5c6875;
  --slate-rule: #dbe0e6;
  --slate-paper: #ffffff;
  --slate-ground: #eceff3;
```

- [ ] **Step 5: Run the config test to verify it passes**

Run: `cd apps/web && npx jest tailwind.config.test.ts`
Expected: PASS.

- [ ] **Step 6: Full suite green**

Run: `cd apps/web && npx jest 2>&1 | grep -E "^Tests:|^Test Suites:"`
Expected: all pass (new tokens are consumed by nothing yet).

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/globals.css apps/web/tailwind.config.ts apps/web/tailwind.config.test.ts
git commit -m "feat(ui): add slate neutral tokens (ink/muted/rule/paper/ground)"
```

---

### Task 3: StatusBadge → squared state tag with filled marker

**Files:**
- Modify: `apps/web/components/ui/StatusBadge.tsx`
- Modify: `apps/web/components/ui/StatusBadge.test.tsx`

**Interfaces:**
- Consumes: existing `status.*` Tailwind tokens (unchanged) and `font-body` (Task 1).
- Produces: `StatusBadge` with unchanged `{ tone, children }` API but squared shape + a filled leading marker. Tone→class mapping is unchanged, so its current colour assertions stay valid.

- [ ] **Step 1: Add failing tests for the new shape and marker**

Append to `apps/web/components/ui/StatusBadge.test.tsx`:

```tsx
  it('is a squared tag, not a rounded pill', () => {
    render(<StatusBadge tone="danger">Fail</StatusBadge>);
    const badge = screen.getByText('Fail');
    expect(badge.className).not.toContain('rounded-full');
    expect(badge.className).toContain('rounded');
  });

  it('renders a filled marker beside the label so state is never colour-only', () => {
    render(<StatusBadge tone="success">Pass</StatusBadge>);
    // The marker is an aria-hidden span carrying the tone colour via currentColor.
    const marker = document.querySelector('[data-status-marker]');
    expect(marker).not.toBeNull();
    // The label text is still present and readable on its own.
    expect(screen.getByText('Pass')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `cd apps/web && npx jest StatusBadge`
Expected: FAIL — no `[data-status-marker]` element; badge still has `rounded-full`.

- [ ] **Step 3: Rewrite `StatusBadge.tsx`**

Replace the whole file with:

```tsx
import { ReactNode } from 'react';
import clsx from 'clsx';

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'purple';

// Colour is unchanged from the shipped design -- the semantic status.* tokens already read AA and
// mean the same thing everywhere. Only the shape changes: a squared tag with a filled marker,
// replacing the rounded pill that read as generic SaaS.
const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-status-success-bg text-status-success',
  warning: 'bg-status-warning-bg text-status-warning',
  danger: 'bg-status-danger-bg text-status-danger',
  neutral: 'bg-status-neutral-bg text-status-neutral',
  info: 'bg-status-info-bg text-status-info',
  purple: 'bg-status-purple-bg text-status-purple',
};

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded px-2 py-0.5 font-body text-xs font-semibold',
        TONE_CLASSES[tone],
      )}
    >
      {/* Filled marker in the tone colour (via currentColor). Keeps state legible without relying
          on the background alone, and echoes the roster/attention-rail language. aria-hidden
          because the text label carries the meaning for assistive tech. */}
      <span data-status-marker aria-hidden="true" className="h-1.5 w-1.5 rounded-[2px] bg-current opacity-90" />
      {children}
    </span>
  );
}
```

- [ ] **Step 4: Run the StatusBadge tests to verify they pass**

Run: `cd apps/web && npx jest StatusBadge`
Expected: PASS (all tests, including the original tone-class and every-tone tests).

- [ ] **Step 5: Run the full suite (StatusBadge is used widely)**

Run: `cd apps/web && npx jest 2>&1 | grep -E "^Tests:|^Test Suites:|✕"`
Expected: all pass. If a page test fails, check whether it asserted the *old* pill shape (e.g. `rounded-full`); update only such appearance assertions. Never change an assertion on the badge's text or a behaviour.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/ui/StatusBadge.tsx apps/web/components/ui/StatusBadge.test.tsx
git commit -m "feat(ui): squared StatusBadge with a filled state marker"
```

---

### Task 4: Card → hairline surface, no drop-shadow

**Files:**
- Modify: `apps/web/components/ui/Card.tsx`
- Modify: `apps/web/components/ui/Card.test.tsx`

**Interfaces:**
- Consumes: `border-rule` (Task 2), `bg-paper` (Task 2).
- Produces: `Card` with unchanged `{ children, className }` API; depth via a 1px `rule` border, no shadow.

- [ ] **Step 1: Add a failing appearance test**

Append to `apps/web/components/ui/Card.test.tsx`:

```tsx
  it('uses a hairline border for depth, not a drop-shadow', () => {
    const { container } = render(<Card>Content</Card>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).not.toContain('shadow');
    expect(card.className).toContain('border-rule');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx jest components/ui/Card`
Expected: FAIL — current card has `shadow-sm` and `border-recruiter-border`.

- [ ] **Step 3: Rewrite `Card.tsx`**

```tsx
import { ReactNode } from 'react';
import clsx from 'clsx';

// Depth from a crisp hairline, not a blur -- the way a printed sheet sits on a desk.
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('rounded-xl border border-rule bg-paper p-4', className)}>{children}</div>
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/web && npx jest components/ui/Card`
Expected: PASS.

- [ ] **Step 5: Full suite green**

Run: `cd apps/web && npx jest 2>&1 | grep -E "^Tests:|^Test Suites:|✕"`
Expected: all pass. Update only appearance assertions if any page pinned `shadow-sm`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/ui/Card.tsx apps/web/components/ui/Card.test.tsx
git commit -m "feat(ui): hairline Card, drop the soft shadow"
```

---

### Task 5: Input → squared slate field with org-primary focus ring

**Files:**
- Modify: `apps/web/components/ui/Input.tsx`
- Modify: `apps/web/components/ui/Input.test.tsx`

**Interfaces:**
- Consumes: `border-rule`, `bg-paper`, `text-ink` (Task 2).
- Produces: `Input` with unchanged props and label wiring (every `getByLabelText` across the app must keep working); only the field's border/radius/focus change. The required-field CSS-generated `*` marker is preserved (a real `*` in text would break exact-text label queries).

- [ ] **Step 1: Add a failing appearance test (keep the existing label/behaviour tests)**

Append to `apps/web/components/ui/Input.test.tsx`:

```tsx
  it('is a squared slate field bound to its label', () => {
    render(<Input label="Email" value="" onChange={() => {}} />);
    const field = screen.getByLabelText('Email');
    expect(field.className).toContain('border-rule');
    expect(field.className).toContain('rounded-lg');
    // The accessible label binding is unchanged -- this is the contract the whole app depends on.
    expect(field.tagName).toBe('INPUT');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx jest components/ui/Input`
Expected: FAIL — current input uses `rounded border-gray-300`.

- [ ] **Step 3: Update the input's className in `Input.tsx`**

In `apps/web/components/ui/Input.tsx`, replace the input's `className` clsx first argument (currently `'w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none'`) with:

```tsx
            'w-full rounded-lg border border-rule bg-paper px-3 py-2.5 font-body text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15',
```

Leave everything else in the component unchanged — the `<label>`, `htmlFor`/`id` wiring, the `required` CSS-`::after` marker, the `error`/`icon` handling, and `aria-invalid`.

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/web && npx jest components/ui/Input`
Expected: PASS (new test plus all existing label/behaviour tests).

- [ ] **Step 5: Full suite green (Input is everywhere; label queries must all still resolve)**

Run: `cd apps/web && npx jest 2>&1 | grep -E "^Tests:|^Test Suites:|✕"`
Expected: all pass. Any failure here is almost certainly an appearance assertion (`border-gray-300`); a broken `getByLabelText` would mean the label wiring changed — it must not.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/ui/Input.tsx apps/web/components/ui/Input.test.tsx
git commit -m "feat(ui): squared slate Input with org-primary focus ring"
```

---

### Task 6: Button → variant/size/tone props + built-in press

**Files:**
- Modify: `apps/web/jest.setup.ts` (matchMedia polyfill)
- Modify: `apps/web/components/ui/Button.tsx`
- Modify: `apps/web/components/ui/Button.test.tsx`

**Interfaces:**
- Consumes: `border-rule`, `text-ink`, `font-body`; org `primary`/`on-primary` tokens (existing).
- Produces: `Button` — same `variant: 'primary' | 'secondary' | 'danger'` and `size: 'md' | 'sm'` API as today, plus a built-in tap press (scale 0.97) that self-disables under reduced motion. Behaviour (onClick, disabled, loading spinner) is unchanged. This is the shared primitive; the login preview's per-call `motion.div` wrapper is superseded and will be removed when the login page is reconciled in a later wave.

- [ ] **Step 1: Add a matchMedia polyfill to the test setup**

`useReducedMotion` reads `window.matchMedia`, which jsdom does not implement. Add to the end of `apps/web/jest.setup.ts`:

```ts
// jsdom has no matchMedia; framer-motion's useReducedMotion needs it. Default to "no preference".
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
```

- [ ] **Step 2: Add a failing test for the secondary variant's new look**

Append to `apps/web/components/ui/Button.test.tsx`:

```tsx
  it('renders the secondary variant as a rule-outlined button, not filled', () => {
    render(<Button variant="secondary">Cancel</Button>);
    const button = screen.getByRole('button', { name: 'Cancel' });
    expect(button.className).toContain('border-rule');
    expect(button.className).not.toContain('bg-gray-100');
  });
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd apps/web && npx jest components/ui/Button`
Expected: FAIL — secondary is currently `bg-gray-100 text-gray-900`.

- [ ] **Step 4: Rewrite `Button.tsx`**

Replace the whole file with (keeps the exact props and loading spinner; adds the press via `motion.button` + `useReducedMotion`):

```tsx
import { ButtonHTMLAttributes } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'danger';
type Size = 'md' | 'sm';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'ref'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  // Colour is rationed to the primary action, in the org's own primary.
  primary: 'bg-primary text-on-primary hover:opacity-90',
  // Secondary is a quiet rule outline on paper, not a filled grey block.
  secondary: 'bg-paper text-ink border border-rule hover:bg-ground',
  danger: 'bg-status-danger text-white hover:opacity-90',
};

const SIZE_CLASSES: Record<Size, string> = {
  md: 'px-4 py-2 text-sm',
  // whitespace-nowrap: a two-word label in a dense table actions column must not wrap.
  sm: 'whitespace-nowrap px-2.5 py-1 text-xs',
};

export function Button({ variant = 'primary', size = 'md', className, disabled, loading, children, ...props }: ButtonProps) {
  // The press dips the control on a tight spring -- a considered micro-interaction, disabled for
  // users who prefer reduced motion.
  const reduce = useReducedMotion();
  return (
    <motion.button
      whileTap={reduce ? undefined : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={clsx(
        'rounded-lg font-body font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        SIZE_CLASSES[size],
        (loading || undefined) && 'inline-flex items-center justify-center gap-2',
        VARIANT_CLASSES[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </motion.button>
  );
}
```

Note: `motion.button` renders a real `<button>`, so `getByRole('button')`, `onClick`, `disabled`, and the loading spinner all behave exactly as before.

- [ ] **Step 5: Run the Button tests to verify they pass**

Run: `cd apps/web && npx jest components/ui/Button`
Expected: PASS — the new secondary test plus the original click/disabled/loading tests.

- [ ] **Step 6: Full suite green (Button is the most-used primitive)**

Run: `cd apps/web && npx jest 2>&1 | grep -E "^Tests:|^Test Suites:|✕"`
Expected: all pass. Watch specifically for: any test that asserted the old `bg-gray-100` secondary look (update it), and any framer/matchMedia error (means Step 1's polyfill is missing).

- [ ] **Step 7: Typecheck and build**

Run: `cd apps/web && npx tsc --noEmit && npm run build 2>&1 | tail -3`
Expected: typecheck clean; build completes.

- [ ] **Step 8: Commit**

```bash
git add apps/web/jest.setup.ts apps/web/components/ui/Button.tsx apps/web/components/ui/Button.test.tsx
git commit -m "feat(ui): Button variant/size retone + built-in press (reduced-motion safe)"
```

---

## Self-review

**Spec coverage.** Slate neutrals → Task 2. Self-hosted fonts (no `next/font/google`) → Task 1. State tokens reused unchanged → Task 3 (noted). Squared state tag + marker + label → Task 3. Hairline elevation, no shadow → Task 4. Squared slate inputs + org focus ring → Task 5. Rationed colour + press + reduced-motion → Task 6. Typed variant props / keep clsx / no tailwind-merge → Tasks 3–6 all use `clsx` with typed props, zero raw-className overrides added. Tabular numerals, navy panel, Monaco pin, candidate-motion restraint → not exercised by these four primitives (they belong to later components/pages); carried in Global Constraints for the waves that touch them. `main` green after every task → every task ends with a full-suite step before commit.

**Placeholder scan.** No TBD/TODO; every code step shows complete code; every command has expected output. The "update only appearance assertions" guidance names the specific old class to look for (`rounded-full`, `shadow-sm`, `border-gray-300`, `bg-gray-100`) rather than a vague "fix tests".

**Type consistency.** `StatusTone` unchanged. `Variant`/`Size` names match the current Button. New Tailwind tokens (`ink/muted/rule/paper/ground`, `font-display/body`) are defined in Tasks 1–2 and consumed by name in Tasks 3–6. `--slate-*` var names match between `globals.css` and the `tailwind.config.ts` fallbacks.

**Out of scope, confirmed:** the 18 remaining kit components and all page/IA work are explicitly deferred to later plans.
