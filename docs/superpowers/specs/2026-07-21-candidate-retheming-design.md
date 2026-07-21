# Candidate Color Re-theming — Design

## Context

Earlier work added org-logo branding to candidate-facing pages: `organizationLogoUrl` is
resolved in `exam-runtime`'s `getCurrent()` and piggybacked onto the existing
`/attempt/current` response, then rendered by a small client component
(`CandidateBrandingLogo`) mounted in `apps/web/app/(candidate)/layout.tsx`.

Staff-facing layouts (recruiter, org-admin, panel) already theme by color: each layout
builds a `themeStyle` object setting `--color-primary`/`--color-accent` inline on its
wrapper `<div>`, consumed by Tailwind's `primary`/`accent` utility classes (declared in
`tailwind.config.ts` as `var(--color-primary, #1a73e8)` / `var(--color-accent, #fbbc04)`).

Candidate-facing pages use a *separate*, hardcoded Tailwind palette
(`candidate-primary: '#2F6F5E'`, `candidate-bg`, etc.) that is not CSS-var-backed, so
org branding has no effect there today beyond the logo. This spec covers making
`candidate-primary` reactive to the org's `primaryColor`, matching the staff-side
pattern.

## Goal

When an org has a `primaryColor` set (via Branding Settings), candidate-facing pages
(start, welcome, exam, submitted, session-ended, and their shared components) use that
color everywhere they currently use the hardcoded teal `candidate-primary`. When no
`primaryColor` is set, candidate pages look exactly as they do today (the teal
default).

## Scope

**In scope:** `candidate-primary` and `candidate-primary-light` only — the two tokens
actually used as brand-color surfaces today (24 and 10 usages respectively across the
candidate component tree).

**Explicitly out of scope:**
- `accentColor` — candidate pages have no existing use for a second brand color; wiring
  it up now would be speculative.
- Every other candidate token (`candidate-text*`, `candidate-border`,
  `candidate-danger*`, `candidate-review*`, `candidate-bg`) — these are semantic/neutral
  colors (error red, review amber, body text, page background), not brand colors, and
  stay fixed. This mirrors the staff side, where only `primary`/`accent` are themeable
  and status colors are not.

## Data Flow

`exam-runtime`'s private `getOrganizationLogoUrl(organizationId)` method (in
`attempt.service.ts`) becomes `getOrganizationBranding(organizationId)`, additionally
selecting `primaryColor` in the same `tenantPrisma.forTenant({ organizationId: null,
isSuperAdmin: true }, ...)` bypass query that already fetches `logoPath`:

```typescript
private async getOrganizationBranding(organizationId: string): Promise<{ logoUrl: string | null; primaryColor: string | null }> {
  const organization = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
    tx.organization.findUnique({ where: { id: organizationId }, select: { logoPath: true, primaryColor: true } }),
  );
  return {
    logoUrl: organization?.logoPath ? `${process.env.API_ORIGIN}/uploads/${organization.logoPath}` : null,
    primaryColor: organization?.primaryColor ?? null,
  };
}
```

`AttemptPreviewResponse` and `AttemptStateResponse` (exam-runtime) and their frontend
mirrors `AttemptPreview`/`AttemptState` (`apps/web/lib/types.ts`) each gain
`organizationPrimaryColor: string | null`, populated the same way
`organizationLogoUrl` already is. No new endpoint, no new network call — same
`/attempt/current` round trip.

The `getCurrent()` call site (`attempt.service.ts:124`) updates from:

```typescript
const organizationLogoUrl = await this.getOrganizationLogoUrl(organizationId);
```

to:

```typescript
const { logoUrl: organizationLogoUrl, primaryColor: organizationPrimaryColor } = await this.getOrganizationBranding(organizationId);
```

with `organizationPrimaryColor` added alongside the existing `organizationLogoUrl,` in
both return-object branches (pre-start preview and in-progress/submitted state) further
down the method, exactly where `organizationLogoUrl,` already sits.

## Frontend Components

### `CandidateThemeProvider` (replaces `CandidateBrandingLogo`)

`apps/web/app/(candidate)/components/CandidateBrandingLogo.tsx` is renamed to
`CandidateThemeProvider.tsx` and expanded: it already calls `useAttemptQuery()` for the
logo, so it's the natural single place to also read `organizationPrimaryColor`, build
the theme vars, and own the wrapper `<div>` that `layout.tsx` currently renders inline
— consolidating two things that share one data source and one mount point.

```tsx
'use client';

import { useAttemptQuery } from '../../../lib/hooks/useAttempt';
import { onPrimaryTextColor } from '../../../lib/candidate-theme';

export function CandidateThemeProvider({ children }: { children: React.ReactNode }) {
  const { data } = useAttemptQuery();
  const primaryColor = data?.organizationPrimaryColor ?? null;

  const themeStyle = primaryColor
    ? ({
        '--color-candidate-primary': primaryColor,
        '--color-candidate-primary-light': `color-mix(in srgb, ${primaryColor} 12%, white)`,
        '--color-candidate-on-primary': onPrimaryTextColor(primaryColor),
      } as React.CSSProperties)
    : undefined;

  return (
    <div className="min-h-screen bg-candidate-bg" style={themeStyle}>
      {data?.organizationLogoUrl ? (
        <div className="flex justify-center px-4 pt-4">
          <img src={data.organizationLogoUrl} alt="Organization logo" className="h-10 w-auto object-contain" />
        </div>
      ) : null}
      {children}
    </div>
  );
}
```

`layout.tsx` shrinks to:

```tsx
import { CandidateAuthProvider } from '../../lib/candidate-auth-context';
import { CandidateThemeProvider } from './components/CandidateThemeProvider';

export default function CandidateLayout({ children }: { children: React.ReactNode }) {
  return (
    <CandidateAuthProvider>
      <CandidateThemeProvider>{children}</CandidateThemeProvider>
    </CandidateAuthProvider>
  );
}
```

### `candidate-primary-light` via `color-mix()`

Rather than computing a second color in JS, the light tint is expressed as a CSS
`color-mix()` function referencing the primary var — the same technique the
recruiter/org-admin layouts already use for a hover-background tint
(`color-mix(in srgb, var(--color-primary, #1a73e8) 12%, white)`), just promoted from a
one-off inline style to the token's own CSS variable value. This means the light tint
recalculates automatically whenever the primary color changes, with no separate
derivation logic to maintain.

### Contrast: `candidate-on-primary`

A new `lib/candidate-theme.ts` exports `onPrimaryTextColor(hex: string): string`, a YIQ
luminance check (the standard simple heuristic for "should text on this background be
light or dark", not a full WCAG contrast-ratio computation — proportionate to a binary
white/dark choice):

```typescript
export function onPrimaryTextColor(hex: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return '#ffffff';
  const r = parseInt(match[1].slice(0, 2), 16);
  const g = parseInt(match[1].slice(2, 4), 16);
  const b = parseInt(match[1].slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#1A1F1D' : '#ffffff';
}
```

`#1A1F1D` is the existing `candidate-text` dark color (not pure black), for visual
consistency with the rest of the palette. Invalid/unexpected input (non-`#RRGGBB`
hex — the Branding Settings color input is `<input type="color">`, which browsers
always normalize to `#RRGGBB`, so this branch is a defensive fallback, not an expected
path) defaults to white, matching today's hardcoded behavior.

Exactly two call sites currently put text directly on a `candidate-primary`
background and need to switch from hardcoded `text-white` to `text-candidate-on-primary`:

- `CandidateButton.tsx` — the `primary` variant (`bg-candidate-primary text-white` → `bg-candidate-primary text-candidate-on-primary`).
- `QuestionNavigator.tsx` — the answered-question nav dot (`bg-candidate-primary text-white` → `bg-candidate-primary text-candidate-on-primary`).

(`TimerBar`'s `bg-candidate-primary` fill and `exam/page.tsx`'s selected-option
indicator use `bg-candidate-primary` as a plain fill/border with no text on top — not a
contrast case, left untouched.)

### `tailwind.config.ts`

```typescript
candidate: {
  primary: 'var(--color-candidate-primary, #2F6F5E)',
  'primary-light': 'var(--color-candidate-primary-light, #F0F7F4)',
  'on-primary': 'var(--color-candidate-on-primary, #ffffff)',
  // ...unchanged: bg, review*, danger*, border, text*
},
```

## Error Handling & Fallback

- No `primaryColor` set on the org → `themeStyle` is `undefined`, all three CSS vars
  fall through to their hardcoded defaults (today's teal look), byte-for-byte the same
  as before this change.
- Malformed `primaryColor` (shouldn't happen — same `<input type="color">` source as
  the already-shipped logo/staff-branding features — but defensive nonetheless) →
  `onPrimaryTextColor` falls back to white; the `color-mix()` var still receives
  whatever string `primaryColor` is, which degrades to browser-default color-mix
  behavior (invalid color arguments are simply ignored by `color-mix()`, keeping the
  mix's other component) rather than throwing.
- No candidate pages ever call the org's branding endpoint directly — this is a pure
  passenger on the existing `/attempt/current` fetch already required for every
  candidate page, so there's no new loading/error state to handle.

## Testing

- `lib/candidate-theme.spec.ts` (new): unit tests for `onPrimaryTextColor` — a light
  color (e.g. `#F5F5F5`) returns dark text, a dark color (e.g. `#1A1A1A`) returns white,
  and a malformed string returns the white fallback.
- `exam-runtime`'s `attempt.service.spec.ts`: extend the existing
  `mockBootstrapWithLogoThenScoped` helper's resolved value from `{ logoPath }` to
  `{ logoPath, primaryColor }`, and add `organizationPrimaryColor` to the two
  `toEqual`-exact-match test expectations — the same mechanical pattern used when
  `organizationLogoUrl` was added.
- `apps/web`: existing `CandidateButton.test.tsx`, `QuestionNavigator.test.tsx`,
  `welcome/page.test.tsx`, `exam/page.test.tsx` continue to pass unmodified (no
  `organizationPrimaryColor` in their mocked attempt responses → default teal, same
  assertions as today). No new component tests are needed beyond the theme-provider
  wiring itself, which is exercised end-to-end by those existing tests picking up the
  renamed `CandidateThemeProvider`.
- Manual/live verification: set a distinctive `primaryColor` on demo-org (e.g. a bright
  red) via the org-admin Branding Settings page already built, then walk through
  welcome → exam → submitted as a candidate and confirm the button/nav/badge colors
  update and remain readable.
