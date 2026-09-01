# Workfox Brand Guidelines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Codify the Workfox Azure theme as the v2 token set (retoning the shipped `/v2/login`), define the Workfox identity in code (`BRAND` label + working mark), and ship the full brand guidelines as one content source with two renderings (`/v2/brand` living route + shareable doc).

**Architecture:** All guideline content lives as typed data in `app/v2/brand/content.ts`; the living route renders it with the real tokens and real ui-v2 components. The Azure tokens replace the C1 values inside the existing `.v2` scope in `app/v2/v2.css` — class names are kept so the login and primitives retone via CSS with almost no TSX changes. The shareable doc is authored from the same content and committed as a snapshot.

**Tech Stack:** Next.js 16 (App Router), TypeScript, the existing `.v2` scoped CSS (no Tailwind additions), jest + RTL (single-file runs only), self-hosted Bricolage Grotesque + Hanken Grotesk. Mono comes from a system stack — **no new font files**.

**Spec:** `docs/superpowers/specs/2026-08-31-workfox-brand-guidelines-design.md`

## Global Constraints

- **Never modify** `app/login/**`, `components/ui/**`, `components/invigilator.css`, or any existing old-UI console screen. "Prudent Hire"/PrudentMark stay there untouched.
- **No `npm install`**, no `git worktree`, no `git clean`, no full jest suite (single file + `--runInBand` only — this machine fakes mass failures under load).
- **Next.js 16:** verify routes against a **production build** (`npm run build`), never dev-server behavior alone.
- **Workfox Azure tokens (light):** paper `#ffffff` · surface `#f8fafc` · ink `#0b1220` · muted `#64748b` · hair `#e2e8f0` · accent `#3b5fe3` · danger `#b91c1c`. **Dark (flat navy):** paper `#0b1220` · surface `#0b1220` · ink `#f8fafc` · muted `#94a3b8` · hair `#1e293b` · accent `#3b82f6` · danger `#f87171`. Radius 6px.
- **Accent-slot white-label rule:** `--accent` is the platform slot color; org-branded surfaces override the slot via `--org-primary` (default now `#3b5fe3`). Status colors (green `#15803d` / amber `#a16207` / red `#b91c1c`) are semantic and never overridden.
- **Naming:** product name renders ONLY from `BRAND.productName`; the literal string "Workfox" may appear only in `lib/brand.ts` (and docs/tests asserting the constant). Company is **Yukthix Consulting**.
- **Fonts:** display = Bricolage Grotesque; UI/body = Hanken Grotesk; mono = `ui-monospace, 'Cascadia Mono', Consolas, monospace` system stack.
- All paths relative to `apps/web/`; run all commands from `apps/web/`.

---

### Task 1: Azure token codification + retone

Replaces the C1 values in `app/v2/v2.css` with the Workfox Azure set. Class names are preserved, so `/v2/login` and the ui-v2 primitives retone without TSX changes — except one line in the hook (the default slot color).

**Files:**
- Modify: `app/v2/v2.css` (full replacement)
- Modify: `lib/hooks/useStaffLogin.ts` (one line: default orgPrimary)

**Interfaces:**
- Consumes: nothing new.
- Produces: the `.v2` scope exposing `--paper --surface --ink --muted --hair --accent --danger --org-primary --org-on-primary --font-disp --font-body --font-mono` and the existing classes `v2-kicker v2-title v2-label v2-field v2-cta v2-sso v2-link v2-alert`, now Azure-toned. Later tasks style against these names only.

- [ ] **Step 1: Replace `app/v2/v2.css` entirely with:**

```css
/* Workfox Azure — ATS edition. Scoped to .v2; supersedes the C1 editorial values.
   The accent is the platform slot color: org-branded surfaces override --org-primary
   and every control styled from it re-tints (accent-slot white-label rule). */
.v2 {
  --paper: #ffffff;
  --surface: #f8fafc;
  --ink: #0b1220;
  --muted: #64748b;
  --hair: #e2e8f0;
  --accent: #3b5fe3;
  --danger: #b91c1c;
  --org-primary: #3b5fe3;
  --org-on-primary: #ffffff;
  --font-disp: 'Bricolage Grotesque', system-ui, sans-serif;
  --font-body: 'Hanken Grotesk', system-ui, sans-serif;
  --font-mono: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-body);
}
@media (prefers-color-scheme: dark) {
  .v2 {
    --paper: #0b1220;
    --surface: #0b1220;
    --ink: #f8fafc;
    --muted: #94a3b8;
    --hair: #1e293b;
    --accent: #3b82f6;
    --danger: #f87171;
  }
}
.v2-kicker {
  font-size: 11px; font-weight: 600; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--accent);
  display: inline-flex; align-items: center; gap: 7px;
}
.v2-title {
  font-family: var(--font-disp); font-weight: 600;
  font-size: clamp(26px, 4vw, 34px); line-height: 1.05;
  letter-spacing: -0.025em; color: var(--ink); text-wrap: balance;
}
.v2-label {
  display: block; font-size: 12px; font-weight: 600;
  color: var(--muted); margin: 0 0 6px;
}
.v2-field {
  width: 100%; height: 38px; border: 1px solid var(--hair); border-radius: 6px;
  background: var(--paper); padding: 0 11px; font: inherit;
  font-size: 14px; color: var(--ink); outline: none;
}
.v2-field::placeholder { color: var(--muted); opacity: 0.7; }
.v2-field:focus {
  border-color: var(--org-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--org-primary) 18%, transparent);
}
.v2-cta {
  width: 100%; height: 40px; border: 0; border-radius: 6px;
  background: var(--org-primary); color: var(--org-on-primary);
  font-family: var(--font-body); font-size: 14px; font-weight: 600;
  cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
}
.v2-cta:disabled { opacity: 0.6; cursor: default; }
.v2-sso {
  width: 100%; height: 40px; border: 1px solid var(--hair); border-radius: 6px;
  background: var(--paper); color: var(--ink); font-size: 14px; font-weight: 600;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  text-decoration: none; cursor: pointer;
}
.v2-sso:focus-visible {
  border-color: var(--org-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--org-primary) 18%, transparent);
}
.v2-link { font-size: 12.5px; color: var(--accent); font-weight: 600; text-decoration: none; }
.v2-link:hover { text-decoration: underline; }
.v2-alert {
  display: flex; align-items: center; gap: 8px; font-size: 13px;
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 7%, var(--paper));
  border: 1px solid color-mix(in srgb, var(--danger) 35%, var(--hair));
  border-radius: 6px; padding: 8px 11px;
}
.v2-mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.v2-rail { position: relative; }
.v2-rail::before {
  content: ""; position: absolute; left: -1px; top: 8px; bottom: 8px;
  width: 3px; border-radius: 0 3px 3px 0; background: var(--danger);
}
```

- [ ] **Step 2: Change the default slot color in the hook**

In `lib/hooks/useStaffLogin.ts`, change the line
`orgPrimary: branding?.primaryColor || '#0053e2',`
to
`orgPrimary: branding?.primaryColor || '#3b5fe3',`
(This hook is v2-only; the old login keeps its own `#0053e2` default untouched.)

- [ ] **Step 3: Verify the retone breaks nothing**

Run: `npx jest components/ui-v2/PasswordField.test.tsx --runInBand` → expect PASS.
Run: `npx tsc --noEmit` → expect no errors referencing changed files.

- [ ] **Step 4: Commit**

```bash
git add app/v2/v2.css lib/hooks/useStaffLogin.ts
git commit -m "feat(ui-v2): Workfox Azure tokens replace C1; login/primitives retoned via CSS"
```

---

### Task 2: `BRAND` label + `WorkfoxMark` + login identity switch

**Files:**
- Create: `lib/brand.ts`
- Create: `components/ui-v2/WorkfoxMark.tsx`
- Modify: `components/ui-v2/index.ts` (add export)
- Modify: `app/v2/login/page.tsx` (kicker: mark + product name from BRAND)
- Test: `components/ui-v2/WorkfoxMark.test.tsx`

**Interfaces:**
- Consumes: `.v2-kicker` class (Task 1).
- Produces:
  ```ts
  // lib/brand.ts
  export const BRAND = {
    productName: 'Workfox',
    companyName: 'Yukthix Consulting',
    productNameStatus: 'working',
  } as const;
  // components/ui-v2/WorkfoxMark.tsx
  function WorkfoxMark(props: { size?: number; className?: string; title?: string }): JSX.Element
  ```

- [ ] **Step 1: Write the failing test**

Create `components/ui-v2/WorkfoxMark.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { WorkfoxMark } from './WorkfoxMark';

it('renders an accessible svg mark that inherits currentColor', () => {
  render(<WorkfoxMark title="Workfox" size={16} />);
  const svg = screen.getByRole('img', { name: 'Workfox' });
  expect(svg.tagName.toLowerCase()).toBe('svg');
  expect(svg.getAttribute('width')).toBe('16');
  expect(svg.querySelector('path')?.getAttribute('stroke')).toBe('currentColor');
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx jest components/ui-v2/WorkfoxMark.test.tsx --runInBand`
Expected: FAIL — cannot find module `./WorkfoxMark`.

- [ ] **Step 3: Implement**

Create `lib/brand.ts`:

```ts
// Single point of change for the product identity. The product name is a WORKING name:
// when it finalizes, edit here and flip productNameStatus to 'final'. No v2 file may
// contain the literal product name except this one.
export const BRAND = {
  productName: 'Workfox',
  companyName: 'Yukthix Consulting',
  productNameStatus: 'working',
} as const;
```

Create `components/ui-v2/WorkfoxMark.tsx`:

```tsx
// Working monogram: a sharp geometric W drawn in strokes, currentColor so it follows
// tokens and white-label contexts. Replaceable in one file when a final mark is designed.
export function WorkfoxMark({
  size = 20, className, title,
}: { size?: number; className?: string; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path
        d="M3 5l4.5 14L12 8l4.5 11L21 5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

Add to `components/ui-v2/index.ts`:

```ts
export { WorkfoxMark } from './WorkfoxMark';
```

In `app/v2/login/page.tsx`: add imports
`import { BRAND } from '../../../lib/brand';` and extend the ui-v2 import with `WorkfoxMark`;
then replace `<p className="v2-kicker">Prudent</p>` with:

```tsx
<p className="v2-kicker"><WorkfoxMark size={14} /> {BRAND.productName}</p>
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx jest components/ui-v2/WorkfoxMark.test.tsx --runInBand` → expect PASS.

- [ ] **Step 5: Grep checks**

Run: `grep -rn "Workfox" app components lib --include="*.ts" --include="*.tsx" | grep -v "lib/brand.ts" | grep -v ".test."`
Expected: no matches (product name only via BRAND).
Run: `grep -rn "PrudentMark" app/v2 components/ui-v2`
Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add lib/brand.ts components/ui-v2/WorkfoxMark.tsx components/ui-v2/WorkfoxMark.test.tsx components/ui-v2/index.ts app/v2/login/page.tsx
git commit -m "feat(brand): BRAND label (Workfox/Yukthix), working WorkfoxMark, login identity"
```

---

### Task 3: guideline content module (the book)

All eight chapters as typed data. No UI in this task. Content below is the authored first
edition — transcribe it; do not invent additional chapters or rules.

**Files:**
- Create: `app/v2/brand/content.ts`

**Interfaces:**
- Consumes: `BRAND` from `lib/brand.ts` (interpolate the product/company names — never the literal).
- Produces:
  ```ts
  export interface BrandRule { rule: string }
  export interface BrandPair { do: string; dont: string }
  export interface BrandSection { heading: string; body?: string; rules?: string[]; pairs?: BrandPair[] }
  export interface BrandChapter { slug: string; title: string; intro: string; sections: BrandSection[] }
  export const BRAND_CHAPTERS: BrandChapter[]
  ```

- [ ] **Step 1: Create `app/v2/brand/content.ts`**

```ts
import { BRAND } from '../../../lib/brand';

export interface BrandPair { do: string; dont: string }
export interface BrandSection { heading: string; body?: string; rules?: string[]; pairs?: BrandPair[] }
export interface BrandChapter { slug: string; title: string; intro: string; sections: BrandSection[] }

const P = BRAND.productName;
const C = BRAND.companyName;

export const BRAND_CHAPTERS: BrandChapter[] = [
  {
    slug: 'foundations',
    title: 'Foundations',
    intro: `${P} is an assessment and hiring platform by ${C}. The visual language is "${P} Azure": professional polish with examination-grade discipline — detail over decoration, ornament only when it encodes data, color only when it means something.`,
    sections: [
      { heading: 'Personality', rules: [
        'Precise: every number is exact, tabular, and sourced.',
        'Calm: the interface never shouts; urgency is reserved for genuine integrity events.',
        'Watchful: live states are visibly live — the platform sees what happens in a session.',
        'Professional: a tool teams live in all day, not a landing page.',
      ]},
      { heading: 'Naming', body: `The product is ${P} (status: ${BRAND.productNameStatus} name) by ${C}. The product name renders only from the BRAND constant.`, rules: [
        `Product surfaces where the platform speaks (staff login, footers, transactional email) say ${P}.`,
        `Legal and billing contexts say ${C}.`,
        `On candidate-facing org-branded surfaces the ORG speaks: its name and color lead; ${P} appears only as "powered by ${P}" attribution where contractually shown.`,
      ]},
    ],
  },
  {
    slug: 'voice',
    title: 'Voice and tone',
    intro: 'An invigilator, not a cheerleader. State the fact, then the next step. Short sentences. No exclamation marks in system copy.',
    sections: [
      { heading: 'Register', rules: [
        'Staff-facing: institutional and exact.',
        'Candidate-facing: warm, plain, and reassuring — an exam is stressful enough.',
        'Buttons: verb first, 1–3 words ("Release results", "Invite candidates").',
        'Errors: what happened, then what to do. Never blame, never apologize twice.',
      ]},
      { heading: 'Examples', pairs: [
        { do: "That email or password isn't right.", dont: 'Oops! Something went wrong!' },
        { do: 'Results released to 41 candidates.', dont: 'Success!! Your results have been released successfully!' },
        { do: 'Camera lost. Check your connection — the timer is paused.', dont: 'ERROR: MediaStreamTrack ended unexpectedly.' },
        { do: 'Invite candidates', dont: 'Click here to get started' },
      ]},
    ],
  },
  {
    slug: 'logo',
    title: 'Logo',
    intro: `The working mark is a stroke-drawn W monogram plus the ${P} wordmark set in Bricolage Grotesque 600. Both are placeholders with full usage rules, so the final mark can drop in without relayout.`,
    sections: [
      { heading: 'Usage', rules: [
        'Monogram minimum size 14px; wordmark minimum 12px cap height.',
        'Clear space: half the mark height on all sides.',
        'The mark inherits currentColor: ink on light, foreground on dark, org-on-primary inside org-colored tiles.',
        'Never stretch, rotate, outline, shadow, or gradient the mark.',
        'On org-branded candidate surfaces the org logo leads; the mark appears only in attribution.',
      ]},
    ],
  },
  {
    slug: 'color',
    title: 'Color',
    intro: 'A slate-neutral chassis with one working accent. Azure is the platform accent slot; an org\'s color replaces the slot wholesale on branded surfaces — platform and org chroma never coexist. Status colors are semantic and never overridden.',
    sections: [
      { heading: 'Product tokens (light)', rules: [
        'paper #ffffff — page and cards', 'surface #f8fafc — recessed grounds (boards, rails)',
        'ink #0b1220 — primary text', 'muted #64748b — secondary text',
        'hair #e2e8f0 — borders', 'accent #3b5fe3 — the slot: primary actions, focus, active nav',
        'danger #b91c1c — destructive and flag states',
      ]},
      { heading: 'Product tokens (dark, flat navy)', rules: [
        'paper #0b1220 — page AND cards (flat: depth from borders, not elevation)',
        'ink #f8fafc', 'muted #94a3b8', 'hair #1e293b', 'accent #3b82f6', 'danger #f87171',
      ]},
      { heading: 'Status semantics', rules: [
        'Clear = green #15803d. Review = amber #a16207. Flagged = red #b91c1c.',
        'A red 3px attention rail marks flagged items; nothing else may use it.',
        'Status colors never re-tint under white-labeling.',
      ]},
    ],
  },
  {
    slug: 'typography',
    title: 'Typography',
    intro: 'Bricolage Grotesque carries identity moments; Hanken Grotesk carries the interface; the mono stack carries evidence — serials, scores, clocks, counts.',
    sections: [
      { heading: 'Scale', rules: [
        'Display (Bricolage 600, −0.025em): page/job titles 26–34px.',
        'Eyebrow: 10.5–11px, 600, +0.14em, uppercase, accent color.',
        'UI labels: 12px/600 muted. Body: 13–14px. Helper: 11–12.5px.',
        'Mono (system stack): serials, scores, timers, counts — always tabular-nums.',
      ]},
      { heading: 'Rules', rules: [
        'Never letter-space body text; only eyebrows and mono micro-labels.',
        'One display moment per screen. Everything else is Hanken.',
      ]},
    ],
  },
  {
    slug: 'components',
    title: 'Components',
    intro: 'The ui-v2 primitives are the only building blocks for v2 surfaces. Components sourced from 21st.dev are retoned onto the tokens before use — never dropped in with their own colors.',
    sections: [
      { heading: 'Standards', rules: [
        'Fields: 38px, 1px hair border, 6px radius; focus = org-primary border + 18% ring.',
        'Primary button: org-primary fill (the slot), 40px, 6px radius, weight 600.',
        'Cards: paper on surface grounds, 1px hair border, 8px radius, shadow ≤ 2 layers and subtle.',
        'Flagged rows/cards carry the red attention rail.',
        'Every metric that decorates must be data-true (funnel widths from real counts, rings from real scores).',
      ]},
      { heading: '21st.dev intake', rules: [
        'Strip hardcoded colors → tokens. Strip gradients unless data-true. Match radii to 6/8px.',
        'If a component fights the accent-slot rule, adapt it or reject it.',
      ]},
    ],
  },
  {
    slug: 'motion',
    title: 'Motion and interaction',
    intro: 'One considered entrance per surface; micro-feedback on press; reduced motion always honored.',
    sections: [
      { heading: 'Rules', rules: [
        'Page/card entrance: single fade+8px rise, ~0.4s, ease-out. No stagger parades.',
        'Press: scale 0.98 spring tap on primary actions.',
        'Live states may pulse subtly (watch dots); nothing else animates idly.',
        'MotionConfig reducedMotion="user" wraps every v2 layout — no exceptions.',
        'Focus visibility is non-negotiable: every interactive element shows the slot-colored ring.',
      ]},
    ],
  },
  {
    slug: 'email',
    title: 'Email and marketing basics',
    intro: `Transactional email is part of the product: same voice, same restraint. Marketing pages may breathe more but draw from the same tokens.`,
    sections: [
      { heading: 'Rules', rules: [
        'Email chrome: white ground, ink text, one accent-colored button max.',
        `Sender identity: the org for candidate mail ("sent via ${P}" in the footer); ${P} for staff/system mail.`,
        `Legal footer: ${C}, unsubscribe/preferences where applicable.`,
        'Subject lines: fact first, no urgency theatre ("Your results for Drive 07", not "Don\'t miss your results!").',
      ]},
    ],
  },
];
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit` → expect no errors referencing `content.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/v2/brand/content.ts
git commit -m "feat(brand): guideline content module — 8 chapters, single source"
```

---

### Task 4: `/v2/brand` living route

Renders the content module with real tokens and real components. Internal reference page — not linked from any product nav.

**Files:**
- Create: `app/v2/brand/page.tsx`

**Interfaces:**
- Consumes: `BRAND_CHAPTERS`, `BrandChapter` (Task 3); `Button, TextField, PasswordField, FormAlert, WorkfoxMark` (ui-v2); `BRAND`; `.v2-*` classes and CSS vars (Task 1).
- Produces: route `/v2/brand`.

- [ ] **Step 1: Create `app/v2/brand/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { BRAND } from '../../../lib/brand';
import { BRAND_CHAPTERS } from './content';
import { Button, TextField, PasswordField, FormAlert, WorkfoxMark } from '../../../components/ui-v2';

const LIGHT_TOKENS: Array<[string, string]> = [
  ['paper', '#ffffff'], ['surface', '#f8fafc'], ['ink', '#0b1220'], ['muted', '#64748b'],
  ['hair', '#e2e8f0'], ['accent', '#3b5fe3'], ['danger', '#b91c1c'],
];
const DARK_TOKENS: Array<[string, string]> = [
  ['paper', '#0b1220'], ['surface', '#0b1220'], ['ink', '#f8fafc'], ['muted', '#94a3b8'],
  ['hair', '#1e293b'], ['accent', '#3b82f6'], ['danger', '#f87171'],
];
const STATUS: Array<[string, string]> = [['clear', '#15803d'], ['review', '#a16207'], ['flagged', '#b91c1c']];

function Swatch({ name, hex }: { name: string; hex: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
      <span style={{ width: 26, height: 26, borderRadius: 6, background: hex, border: '1px solid var(--hair)', flexShrink: 0 }} />
      <span style={{ fontWeight: 600 }}>{name}</span>
      <span className="v2-mono" style={{ color: 'var(--muted)' }}>{hex}</span>
    </div>
  );
}

export default function BrandPage() {
  const [pw, setPw] = useState('secret123');
  const [txt, setTxt] = useState('');

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '48px 24px 96px' }}>
      <p className="v2-kicker"><WorkfoxMark size={14} /> {BRAND.productName} brand guidelines</p>
      <h1 className="v2-title" style={{ margin: '6px 0 6px' }}>How {BRAND.productName} looks, speaks, and behaves</h1>
      <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 12px' }}>
        {BRAND.companyName} · living reference — rendered from the real tokens and components. Product name status: {BRAND.productNameStatus}.
      </p>
      <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '0 0 40px' }}>
        {BRAND_CHAPTERS.map((c, i) => (
          <a key={c.slug} href={`#${c.slug}`} className="v2-link">{i + 1}. {c.title}</a>
        ))}
      </nav>

      {BRAND_CHAPTERS.map((c, i) => (
        <section key={c.slug} id={c.slug} style={{ margin: '0 0 44px' }}>
          <p className="v2-kicker">{String(i + 1).padStart(2, '0')}</p>
          <h2 className="v2-title" style={{ fontSize: 24, margin: '4px 0 8px' }}>{c.title}</h2>
          <p style={{ fontSize: 14, color: 'var(--muted)', maxWidth: '70ch', margin: '0 0 14px' }}>{c.intro}</p>
          {c.sections.map((s) => (
            <div key={s.heading} style={{ margin: '0 0 16px' }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 6px' }}>{s.heading}</h3>
              {s.body && <p style={{ fontSize: 13.5, color: 'var(--muted)', maxWidth: '70ch', margin: '0 0 8px' }}>{s.body}</p>}
              {s.rules && (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {s.rules.map((r) => <li key={r}>{r}</li>)}
                </ul>
              )}
              {s.pairs && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
                  {s.pairs.map((p) => (
                    <div key={p.do} style={{ border: '1px solid var(--hair)', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
                      <p style={{ margin: '0 0 6px' }}><span style={{ color: '#15803d', fontWeight: 700 }}>Do</span> — {p.do}</p>
                      <p style={{ margin: 0, color: 'var(--muted)' }}><span style={{ color: 'var(--danger)', fontWeight: 700 }}>Don't</span> — {p.dont}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {c.slug === 'color' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 10 }}>
              <div><h3 style={{ fontSize: 13, fontWeight: 700 }}>Light</h3><div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{LIGHT_TOKENS.map(([n, h]) => <Swatch key={n} name={n} hex={h} />)}</div></div>
              <div><h3 style={{ fontSize: 13, fontWeight: 700 }}>Dark</h3><div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{DARK_TOKENS.map(([n, h]) => <Swatch key={n} name={n} hex={h} />)}</div></div>
              <div><h3 style={{ fontSize: 13, fontWeight: 700 }}>Status</h3><div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{STATUS.map(([n, h]) => <Swatch key={n} name={n} hex={h} />)}</div></div>
            </div>
          )}

          {c.slug === 'logo' && (
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-grid', placeItems: 'center', width: 44, height: 44, borderRadius: 10, background: 'var(--org-primary)', color: 'var(--org-on-primary)' }}><WorkfoxMark size={24} title={`${BRAND.productName} mark on accent`} /></span>
              <span style={{ display: 'inline-grid', placeItems: 'center', width: 44, height: 44, borderRadius: 10, border: '1px solid var(--hair)' }}><WorkfoxMark size={24} title={`${BRAND.productName} mark on paper`} /></span>
              <span style={{ fontFamily: 'var(--font-disp)', fontWeight: 600, fontSize: 24, letterSpacing: '-0.02em' }}>{BRAND.productName}</span>
              <span className="v2-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>working mark · replace in WorkfoxMark.tsx</span>
            </div>
          )}

          {c.slug === 'components' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 380, marginTop: 10 }}>
              <TextField id="bg-demo-text" label="Text field" value={txt} onChange={setTxt} />
              <PasswordField id="bg-demo-pw" label="Password field" value={pw} onChange={setPw} />
              <Button>Primary action</Button>
              <FormAlert>That email or password isn't right.</FormAlert>
              <div className="v2-rail" style={{ border: '1px solid var(--hair)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
                Flagged item with the red attention rail — <span className="v2-mono">tab ×4</span>
              </div>
            </div>
          )}
        </section>
      ))}
    </main>
  );
}
```

- [ ] **Step 2: Production build + route check**

Run: `npm run build` → expect success and `/v2/brand` in the route list (Next 16: never trust dev alone).

- [ ] **Step 3: Browser smoke (controller assists)**

Open `/v2/brand` in the preview: chapter nav jumps; swatches match the token table; component gallery renders interactively (password toggle works); dark mode legible; `/v2/login` still renders correctly in the Azure retone.

- [ ] **Step 4: Commit**

```bash
git add app/v2/brand/page.tsx
git commit -m "feat(brand): /v2/brand living guidelines route"
```

---

### Task 5: shareable doc snapshot

Controller-authored rendering of the same content as a polished standalone HTML page, published as an updateable artifact and committed as a snapshot for provenance.

**Files:**
- Create: `docs/brand/workfox-brand-guidelines.html` (repo-root docs/, not apps/web)

- [ ] **Step 1:** Author the standalone page from `content.ts` (same 8 chapters, same rules verbatim, Azure tokens inlined, self-contained CSS, states "generated from commit `<short-sha of Task 4 commit>`").
- [ ] **Step 2:** Controller publishes it as the shareable artifact (stable URL, updateable).
- [ ] **Step 3: Commit**

```bash
git add docs/brand/workfox-brand-guidelines.html
git commit -m "docs(brand): shareable guidelines snapshot"
```

---

### Task 6: verification pass

- [ ] **Step 1:** `npm run build` from `apps/web` → success; `/v2/login` and `/v2/brand` both in route list.
- [ ] **Step 2:** Grep gates (from `apps/web`):
`grep -rn "Workfox" app components lib --include="*.ts" --include="*.tsx" | grep -v "lib/brand.ts" | grep -v ".test."` → empty;
`grep -rn "PrudentMark" app/v2 components/ui-v2` → empty;
`git diff --stat main...HEAD -- app/login components/ui components/invigilator.css` → empty (old UI untouched).
- [ ] **Step 3:** Single-file tests: `npx jest components/ui-v2/PasswordField.test.tsx --runInBand` and `npx jest components/ui-v2/WorkfoxMark.test.tsx --runInBand` and `npx jest lib/staff-routing.test.ts --runInBand` → all PASS.
- [ ] **Step 4:** Browser smoke both themes on `/v2/login` + `/v2/brand` (controller).
- [ ] **Step 5:** No commit (verification only); fix-forward any failures via the review loop.

---

## Self-Review

**Spec coverage:** §2 theme decision → Task 1 tokens. §3 name-as-label + login kicker → Task 2 (+ grep in Tasks 2/6). §4 working mark → Task 2 (`WorkfoxMark`, currentColor, one-file replacement note rendered on the page). §5 chapters 1–8 → Task 3 content (all eight present, incl. naming/white-label stance, voice pairs, logo usage, accent-slot rule, status semantics, type scale, 21st.dev intake, motion, email). §6 living route → Task 4; shareable doc → Task 5 (generated-from commit noted). §7 non-goals respected (no old-UI changes; no final logo; grep-only enforcement). §8 verification → Tasks 1/2/4/6 (prod build, both themes, greps, isolated jest). §9 build order 1–6 → Tasks 1–6 in order.

**Placeholder scan:** none — full CSS, full content, full page code included. Task 5 Step 1 references content.ts verbatim as its source, which exists by then.

**Type consistency:** `BRAND` shape identical in Tasks 2/3/4. `BrandChapter/BrandSection/BrandPair` defined in Task 3, consumed in Task 4 (`c.sections`, `s.rules`, `s.pairs`, `p.do/p.dont` all match). `WorkfoxMark({size, className, title})` matches Task 4 usage (`size`, `title`). `TextField/PasswordField/Button/FormAlert` usage matches their Task-4 (login plan) prop shapes — `id/label/value/onChange` and children. `.v2-mono`/`.v2-rail` defined in Task 1, used in Task 4.
