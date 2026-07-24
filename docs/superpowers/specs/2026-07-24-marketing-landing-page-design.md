# Marketing Landing Page — Design

## Goal

Give the app a real front door at `/`. Today there is no root route (`apps/web/app` has no `page.tsx`), so visiting the site's domain either 404s or the user manually navigates to `/login` — a bare staff-login form with no context about what Prudent Hire is. This adds a lean, single-page marketing landing page at `/` that explains the product and links to the existing `/login` page, styled to match Prudent Consulting's brand (prudentconsulting.com) since Prudent Hire is a Prudent Consulting product.

## Scope

`apps/web` only — one new route (`app/page.tsx`), no backend changes. The existing `/login`, `/forgot-password`, `/reset-password/[token]` pages are unchanged (already updated with the "Automate early screens. Focus human judgment on what matters." tagline in the prior session).

## Brand reference

Pulled directly from https://prudentconsulting.com/ (captured 2026-07-24):
- Headline/body text color: `#001E60` (dark navy) — close to this app's existing `text-recruiter-text` token; reuse the existing token rather than introducing a new one.
- Accent/CTA color: `#0053E2` — the app's existing `--color-primary` default (`#0057f0`) is close enough that no new color token is needed; reuse `bg-primary`/`text-primary`.
- Typography: reference site uses a licensed font ("Everyday Sans") not available to this app; keep the app's existing font stack (already applied via `globals.css`) rather than sourcing a replacement — brand color and layout patterns carry the visual identity, not a specific typeface.
- Layout patterns to borrow: bordered cards with an outline icon, a short kicker line above each card's title (e.g. "TALENT. Delivered"), a numbered-step process section, solid-primary + light-accent button pairing for primary/secondary CTAs.

## Page structure

New file `apps/web/app/page.tsx` as a **server component** (no `'use client'` directive) — the page is fully static with no auth-dependent data, no form state, and no client-only hooks. The one exception is the `motion`/`MotionConfig` fade-in treatment (see Component reuse below), which requires wrapping just the animated elements in a small client component (e.g. `apps/web/app/LandingHero.tsx` with `'use client'`) rather than making the whole page a client component.

### 1. Top nav
- Reuses the same header pattern as the auth pages' branding panel: logo (`/logo.png`) + "Prudent Hire" wordmark, left-aligned.
- Right-aligned: a "Login" link styled as a primary button (`bg-primary text-white`, matching `Button`'s `primary` variant classes), linking to `/login`.
- Sticky (`sticky top-0`), white background, bottom border (`border-b border-recruiter-border`) — matches the visual weight of the reference site's nav without copying its search/hamburger icons (not needed here).

### 2. Hero
- Headline: "Automate early screens. Focus human judgment on what matters." — same tagline already used on `/login`, `/forgot-password`, `/reset-password`, so the brand voice is consistent the moment a visitor moves from `/` to `/login`.
- Subhead (one sentence): explains what the product actually does, e.g. "Prudent Hire runs AI-assisted screening, live proctoring, and structured evaluation so your team spends time on the candidates who matter." (exact final copy is written during implementation, not fixed here — the design commits to the message, not the exact sentence).
- One primary CTA: "Get Started" button → `/login` (same destination as the nav's Login link; having it in both places is intentional, standard landing-page practice, not a bug).
- Visual accent: an abstract decorative element in the brand accent color echoing the reference site's blue-diamond motif (e.g. a few overlapping rounded-square/diamond shapes in `bg-primary`/`bg-primary/20`, positioned behind or beside the headline) — no stock photography, since none is licensed for this product.

### 3. Capabilities grid
Four cards in a responsive grid (1 column mobile, 2 columns tablet+, matching the reference site's card grid breakpoint behavior), each using the existing `Card` component:
- **AI-generated questions** — icon `Sparkles` (lucide-react), kicker "QUESTIONS. Generated.", body: AI drafts exam questions from a topic and difficulty, reviewed before publishing.
- **Live proctoring & integrity** — icon `ShieldCheck`, kicker "INTEGRITY. Verified.", body: webcam monitoring, tab/copy-paste detection, and AI-assessed risk narratives during every attempt.
- **Structured reports & dashboards** — icon `BarChart3`, kicker "RESULTS. Clear.", body: pass/fail breakdowns, topic performance, and trend charts for every exam.
- **Flexible AI providers** — icon `Cpu`, kicker "AI. Your choice.", body: use Anthropic, Azure OpenAI, or any OpenAI-compatible endpoint — configurable per organization.

Each card: icon in a `text-primary` outline circle (matching the reference site's icon treatment), bold title, small `text-primary` kicker line, body text in `text-recruiter-text-secondary`. No "Explore" per-card CTA (the page has one clear destination — Login — repeating it four more times would dilute it, unlike the reference site which links each service to its own dedicated page).

### 4. How it works
Three numbered steps, horizontal on desktop / stacked on mobile, mirroring the reference site's "4D" process section pattern but scoped to 3 steps since Prudent Hire's flow is simpler:
1. **Create an exam** — build sections and questions, or let AI draft them.
2. **Invite candidates** — send secure links; they take the exam with live proctoring.
3. **Review AI-assisted results** — get scored reports, integrity flags, and evaluation summaries instantly.

### 5. Footer
Minimal: logo + "Prudent Hire", © current year, a text link back to "Login". No sitemap/social links — nothing else exists yet to link to.

## Component reuse

- `Card` (`components/ui`) for capability cards — no new card component needed.
- `lucide-react` for icons — already a dependency (used throughout the app, e.g. `login/page.tsx`).
- Existing Tailwind tokens only (`bg-primary`, `text-primary`, `text-recruiter-text`, `text-recruiter-text-secondary`, `border-recruiter-border`) — no new design tokens.
- CTAs are `<Link>` (Next.js navigation, not a form submit), styled with the same class string as `Button`'s primary variant (`rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90`) rather than importing `Button` itself, since `Button` renders a `<button>` element and these are page navigations — this exact pattern (styled `<Link>`/`<a>` reusing button-like classes for navigation) is already used on `/login` for the "Log in with SSO" link.
- `motion`/`MotionConfig` from `framer-motion` for the same subtle fade-in-on-mount treatment already used on the auth pages, respecting `reducedMotion="user"`.

## Testing

- `apps/web/app/page.test.tsx`: renders the page, asserts the headline text, the "Login" nav link and hero "Get Started" link both point to `/login`, and all four capability card titles are present. Follows this codebase's existing page-test conventions (`render` + `@testing-library/react`, no router mocking needed since this page has no client-side navigation logic beyond static `<Link>`s).
- No backend/API involvement, so no e2e or API test changes.

## Out of scope

- No stats/testimonial/case-study sections (no real customer data to show yet — explicitly deferred, not an oversight).
- No CMS or dynamic content — this page is static markup, matching how `/login` and friends are already built.
- No changes to `/login`, `/forgot-password`, `/reset-password`, or any authenticated route.
- No SEO/meta-tag work beyond whatever `app/layout.tsx` already provides (not requested).
