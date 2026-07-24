# Marketing Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a static marketing landing page at `apps/web/app/page.tsx` (the site's root `/`) that explains what Prudent Hire does and links to the existing `/login` page, styled to match Prudent Consulting's brand.

**Architecture:** One new server component page (`app/page.tsx`) assembling five static sections (nav, hero, capabilities grid, how-it-works, footer), plus one small client component (`app/LandingHero.tsx`) that wraps just the hero's animated elements in `framer-motion`, since the rest of the page needs no client-side JavaScript at all.

**Tech Stack:** Next.js App Router (server components), `framer-motion` (already a dependency, used identically on `/login`), `lucide-react` icons (already a dependency), existing Tailwind design tokens (`bg-primary`, `text-recruiter-text`, etc.) and the existing `Card` UI component — no new dependencies, no new design tokens.

## Global Constraints

- Reuse the existing tagline verbatim: "Automate early screens. Focus human judgment on what matters." (already live on `/login`, `/forgot-password`, `/reset-password/[token]`).
- Reuse existing Tailwind tokens only: `bg-primary`, `text-primary`, `text-recruiter-text`, `text-recruiter-text-secondary`, `border-recruiter-border`. Do not add new color tokens or a new font.
- No stats/testimonial/case-study sections — explicitly out of scope per the approved design.
- No backend changes. No changes to `/login`, `/forgot-password`, or `/reset-password/[token]`.
- The page must be a server component (no `'use client'` at the page level) — only the hero's animated wrapper is a client component.

---

### Task 1: `LandingHero` client component

**Files:**
- Create: `apps/web/app/LandingHero.tsx`
- Test: `apps/web/app/LandingHero.test.tsx`

**Interfaces:**
- Produces: `LandingHero` — a default-exported React component with props `{ children: React.ReactNode }`. Renders its children wrapped in a `framer-motion` fade-in-from-below animation (matching the pattern already used in `apps/web/app/login/page.tsx`), inside a `MotionConfig reducedMotion="user"` boundary so it respects the OS-level reduced-motion preference. Task 2 imports this component and passes the hero's headline/subhead/CTA markup as `children`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/LandingHero.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import LandingHero from './LandingHero';

describe('LandingHero', () => {
  it('renders its children', () => {
    render(
      <LandingHero>
        <h1>Test headline</h1>
      </LandingHero>,
    );

    expect(screen.getByRole('heading', { name: 'Test headline' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx jest LandingHero.test.tsx`
Expected: FAIL — `Cannot find module './LandingHero'`

- [ ] **Step 3: Implement `LandingHero`**

Create `apps/web/app/LandingHero.tsx`:

```tsx
'use client';

import { ReactNode } from 'react';
import { motion, MotionConfig } from 'framer-motion';

export default function LandingHero({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
        {children}
      </motion.div>
    </MotionConfig>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx jest LandingHero.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/LandingHero.tsx apps/web/app/LandingHero.test.tsx
git commit -m "feat: add LandingHero animated wrapper for the marketing landing page"
```

---

### Task 2: Landing page assembly

**Files:**
- Create: `apps/web/app/page.tsx`
- Test: `apps/web/app/page.test.tsx`

**Interfaces:**
- Consumes: `LandingHero` (default export, `{ children: ReactNode }`) from Task 1 (`./LandingHero`); `Card` from `../components/ui`.
- Produces: the default-exported `Home` page component rendered at `/`. Nothing later depends on this file's internals.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import Home from './page';

describe('Home (landing page)', () => {
  it('shows the nav Login link pointing to /login', () => {
    render(<Home />);
    const navLogin = screen.getAllByRole('link', { name: 'Login' })[0];
    expect(navLogin).toHaveAttribute('href', '/login');
  });

  it('shows the headline and a hero CTA linking to /login', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: /automate early screens/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Get Started' })).toHaveAttribute('href', '/login');
  });

  it('shows all four capability cards', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: 'AI-generated questions' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Live proctoring & integrity' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Structured reports & dashboards' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Flexible AI providers' })).toBeInTheDocument();
  });

  it('shows the three how-it-works steps', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: 'Create an exam' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Invite candidates' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Review AI-assisted results' })).toBeInTheDocument();
  });

  it('shows a footer Login link', () => {
    render(<Home />);
    const links = screen.getAllByRole('link', { name: 'Login' });
    expect(links.length).toBeGreaterThanOrEqual(2);
    links.forEach((link) => expect(link).toHaveAttribute('href', '/login'));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx jest app/page.test.tsx`
Expected: FAIL — `Cannot find module './page'`

- [ ] **Step 3: Implement the landing page**

Create `apps/web/app/page.tsx`:

```tsx
import Link from 'next/link';
import { Sparkles, ShieldCheck, BarChart3, Cpu } from 'lucide-react';
import { Card } from '../components/ui';
import LandingHero from './LandingHero';

const PRIMARY_LINK_CLASSES = 'rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90';

const CAPABILITIES = [
  {
    icon: Sparkles,
    kicker: 'QUESTIONS. Generated.',
    title: 'AI-generated questions',
    body: 'AI drafts exam questions from a topic and difficulty level, reviewed before publishing.',
  },
  {
    icon: ShieldCheck,
    kicker: 'INTEGRITY. Verified.',
    title: 'Live proctoring & integrity',
    body: 'Webcam monitoring, tab and copy-paste detection, and AI-assessed risk narratives during every attempt.',
  },
  {
    icon: BarChart3,
    kicker: 'RESULTS. Clear.',
    title: 'Structured reports & dashboards',
    body: 'Pass/fail breakdowns, topic performance, and trend charts for every exam.',
  },
  {
    icon: Cpu,
    kicker: 'AI. Your choice.',
    title: 'Flexible AI providers',
    body: 'Use Anthropic, Azure OpenAI, or any OpenAI-compatible endpoint -- configurable per organization.',
  },
];

const STEPS = [
  {
    number: '1',
    title: 'Create an exam',
    body: 'Build sections and questions, or let AI draft them for you.',
  },
  {
    number: '2',
    title: 'Invite candidates',
    body: 'Send secure links; candidates take the exam with live proctoring.',
  },
  {
    number: '3',
    title: 'Review AI-assisted results',
    body: 'Get scored reports, integrity flags, and evaluation summaries instantly.',
  },
];

export default function Home() {
  return (
    <main>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-recruiter-border bg-white px-6 py-4 md:px-16">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Prudent Hire" className="h-9 w-9 object-contain" />
          <span className="text-lg font-bold tracking-tight text-recruiter-text">Prudent Hire</span>
        </div>
        <Link href="/login" className={PRIMARY_LINK_CLASSES}>
          Login
        </Link>
      </header>

      <LandingHero>
        <section className="relative overflow-hidden px-6 py-20 md:px-16 md:py-28">
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 top-10 hidden md:block">
            <div className="h-24 w-24 rotate-45 rounded-2xl bg-primary/10" />
            <div className="ml-20 mt-4 h-16 w-16 rotate-45 rounded-xl bg-primary/20" />
          </div>
          <div className="relative flex flex-col items-start gap-6">
            <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight text-recruiter-text md:text-5xl">
              Automate early screens. Focus human judgment on what matters.
            </h1>
            <p className="max-w-xl text-lg text-recruiter-text-secondary">
              Prudent Hire runs AI-assisted screening, live proctoring, and structured evaluation so your team spends
              time on the candidates who matter.
            </p>
            <Link href="/login" className={PRIMARY_LINK_CLASSES}>
              Get Started
            </Link>
          </div>
        </section>
      </LandingHero>

      <section className="px-6 py-16 md:px-16">
        <div className="grid gap-6 md:grid-cols-2">
          {CAPABILITIES.map(({ icon: Icon, kicker, title, body }) => (
            <Card key={title} className="flex flex-col gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-primary text-primary">
                <Icon size={20} aria-hidden="true" />
              </span>
              <h2 className="text-lg font-semibold text-recruiter-text">{title}</h2>
              <p className="text-sm font-medium text-primary">{kicker}</p>
              <p className="text-sm text-recruiter-text-secondary">{body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t border-recruiter-border px-6 py-16 md:px-16">
        <div className="grid gap-8 md:grid-cols-3">
          {STEPS.map(({ number, title, body }) => (
            <div key={title} className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-primary">{number}</span>
              <h3 className="text-lg font-semibold text-recruiter-text">{title}</h3>
              <p className="text-sm text-recruiter-text-secondary">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="flex flex-col items-center justify-between gap-4 border-t border-recruiter-border px-6 py-8 text-sm text-recruiter-text-secondary md:flex-row md:px-16">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Prudent Hire" className="h-6 w-6 object-contain" />
          <span>&copy; {new Date().getFullYear()} Prudent Hire</span>
        </div>
        <Link href="/login" className="font-medium text-primary hover:underline">
          Login
        </Link>
      </footer>
    </main>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx jest app/page.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full frontend suite and typecheck to confirm no regressions**

Run: `cd apps/web && npx jest`
Expected: PASS (all suites, no regressions)

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: 0 new errors (only the same pre-existing unrelated baseline errors noted in past sessions, if any)

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/page.tsx apps/web/app/page.test.tsx
git commit -m "feat: add marketing landing page at the site root"
```

---

## Self-Review Notes

- **Spec coverage:** Top nav with Login link -> Task 2's `<header>`. Hero with tagline/subhead/CTA/animated accent -> Task 2's `<LandingHero>` section (Task 1 provides the animation wrapper). Capabilities grid (4 cards) -> Task 2's `CAPABILITIES` map. How-it-works (3 steps) -> Task 2's `STEPS` map. Footer -> Task 2's `<footer>`. Server-component page with an isolated client sub-component for animation -> Task 1/2 split. Existing token reuse only -> verified every class used in Task 2's code is an existing token (`bg-primary`, `text-primary`, `text-recruiter-text`, `text-recruiter-text-secondary`, `border-recruiter-border`) or a plain Tailwind utility (spacing/layout/typography-size classes already used elsewhere in this codebase, e.g. `login/page.tsx`).
- **Placeholder scan:** no TBD/TODO; every step has complete, copy-pasteable code; no "similar to Task N" references.
- **Type consistency:** `LandingHero`'s prop shape (`{ children: ReactNode }`) is defined once in Task 1 and consumed identically in Task 2 (passed as JSX children, not as an explicit prop) -- no signature drift.
- **Decorative accent:** the spec calls for "an abstract decorative element in the brand accent color echoing the reference site's blue-diamond motif" -- implemented as two rotated, semi-transparent squares (`bg-primary/10`, `bg-primary/20`) positioned behind the hero copy, hidden on mobile (`hidden md:block`) so it never crowds the headline on small screens. Uses only existing tokens, no new SVG asset.
