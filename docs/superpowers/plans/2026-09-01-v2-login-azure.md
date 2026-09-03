# v2 Login → Azure (first Azure screen + shared foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retone the shared v2 design foundation from C1 to **Workfox Azure** and rebuild `/v2/login` as the **centered-card** Azure login (21st.dev "Login Page 1" pattern, retoned onto our own primitives) with the Workfox identity — establishing the Azure `ui-v2` primitives every future screen inherits.

**Architecture:** The shared `.v2` scope (`app/v2/v2.css`) becomes the Azure token + component base (same values already proven in the guidelines' `.wfx` scope), keeping class names so consumers retone through CSS. The `ui-v2` primitives change shape (underlined→bordered fields, ink→accent CTA); a `Card` primitive is added. The login page is rebuilt as a centered card composing those primitives + `WorkfoxMark` + `BRAND`, with its existing `useStaffLogin` logic unchanged. The 21st.dev component is adopted as a structural/visual reference, not imported (no shadcn deps — our own primitives stay the single design system, per the guidelines' 21st-intake rule).

**Tech Stack:** Next.js 16, React 18, TypeScript, scoped `.v2` CSS vars, framer-motion, lucide-react, jest + RTL (single-file runs only). Fonts already self-hosted (Bricolage + Hanken); mono = system stack.

**Spec:** `docs/superpowers/specs/2026-08-31-workfox-brand-guidelines-design.md` (Azure tokens + accent-slot rule) + the chosen direction (centered card) and Azure token values codified in `apps/web/app/v2/brand/brand.css`. Review against `docs/brand/workfox-ui-review-checklist.md`.

## Global Constraints

- **Never modify** the OLD UI: `app/login/**`, `components/ui/**`, `components/invigilator.css`, existing console screens.
- **No `npm install`**, no `git worktree`, no `git clean`, no full jest suite (single file + `--runInBand` only — this machine fakes mass failures under load).
- **Next.js 16:** verify routes against a **production build** (`npm run build`), never dev alone.
- **Azure tokens (light):** paper `#ffffff` · surface `#f8fafc` · ink `#0b1220` · muted `#64748b` · hair `#e2e8f0` · accent `#3b5fe3` · danger `#b91c1c`. **Dark:** paper/surface `#0b1220` · ink `#f8fafc` · muted `#94a3b8` · hair `#1e293b` · accent `#3b82f6` · danger `#f87171`. Radius 6px (cards 12px).
- **Accent-slot white-label rule:** the CTA and focus rings use `var(--org-primary)` (defaults to accent `#3b5fe3`, overridden by branding). Never hardcode `#3b5fe3` in components.
- **Behavior is unchanged:** the login keeps `useStaffLogin` exactly — org slug drives branding + SSO detection; SSO-enabled orgs are SSO-only (no password); else email + password. This is a reskin, not a logic change.
- **Product name via `BRAND.productName`** only. Mono = `ui-monospace, 'Cascadia Mono', Consolas, monospace`.
- The guidelines' `.wfx` scope is intentionally left as-is (redundant with `.v2`=Azure now; consolidating it is a future follow-up, not this plan).
- All paths relative to `apps/web/`; run commands from `apps/web/`.

---

### Task 1: Azure foundation — retone `.v2` tokens + primitive shapes + add `Card`

**Files:**
- Modify: `app/v2/v2.css` (full replacement — C1 → Azure)
- Create: `components/ui-v2/Card.tsx`
- Modify: `components/ui-v2/index.ts` (add `Card` export)
- Modify: `lib/hooks/useStaffLogin.ts` (one line: default orgPrimary)

**Interfaces:**
- Produces: the `.v2` scope with Azure tokens (`--paper --surface --ink --muted --hair --accent --danger --org-primary --org-on-primary --font-disp --font-body --font-mono`) and retoned classes (`v2-kicker v2-title v2-label v2-field v2-cta v2-sso v2-link v2-alert v2-card v2-mono`); `Card(props: { className?: string; style?: React.CSSProperties; children: ReactNode })`.

- [ ] **Step 1: Replace `app/v2/v2.css` entirely with:**

```css
/* Workfox Azure — the shared v2 product scope (supersedes the C1 editorial values).
   Class names are unchanged so the login and ui-v2 primitives retone through CSS.
   The CTA and focus rings use --org-primary (the accent slot; branding overrides it). */
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
  background: var(--surface);
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
  font-size: clamp(22px, 4vw, 26px); line-height: 1.1;
  letter-spacing: -0.02em; color: var(--ink); text-wrap: balance;
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
  display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--danger);
  background: color-mix(in srgb, var(--danger) 7%, var(--paper));
  border: 1px solid color-mix(in srgb, var(--danger) 35%, var(--hair));
  border-radius: 6px; padding: 8px 11px;
}
.v2-card {
  background: var(--paper); border: 1px solid var(--hair); border-radius: 12px;
  box-shadow: 0 1px 2px rgba(11,18,32,.04), 0 12px 32px -18px rgba(11,18,32,.22);
}
.v2-mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.v2-divider {
  display: flex; align-items: center; gap: 10px; color: var(--muted);
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
}
.v2-divider::before, .v2-divider::after { content: ""; height: 1px; background: var(--hair); flex: 1; }
```

- [ ] **Step 2: Create `components/ui-v2/Card.tsx`:**

```tsx
import type { CSSProperties, ReactNode } from 'react';

export function Card({
  className = '', style, children,
}: { className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <div className={`v2-card ${className}`} style={style}>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Add the export to `components/ui-v2/index.ts`:**

```ts
export { Card } from './Card';
```

- [ ] **Step 4: In `lib/hooks/useStaffLogin.ts`, change the default slot color:**

Change `orgPrimary: branding?.primaryColor || '#0053e2',` to `orgPrimary: branding?.primaryColor || '#3b5fe3',`.

- [ ] **Step 5: Verify**

Run: `npx jest components/ui-v2/PasswordField.test.tsx --runInBand` → expect PASS (the toggle test is shape-agnostic).
Run: `npx tsc --noEmit` → no new errors referencing Card.tsx / index.ts / useStaffLogin.ts.
Confirm `git status --short` shows only the four files above.

- [ ] **Step 6: Commit**

```bash
git add app/v2/v2.css components/ui-v2/Card.tsx components/ui-v2/index.ts lib/hooks/useStaffLogin.ts
git commit -m "feat(ui-v2): Azure foundation — retone .v2 tokens/primitives, add Card"
```

---

### Task 2: Rebuild `/v2/login` as the Azure centered card

Replaces the editorial layout with the centered-card direction (21st "Login Page 1" pattern), on the retoned primitives, with the Workfox identity. Logic unchanged.

**Files:**
- Modify: `app/v2/login/page.tsx` (replace entirely)

**Interfaces:**
- Consumes: `useStaffLogin` (unchanged); `Button, TextField, PasswordField, FormAlert, Card, WorkfoxMark` (ui-v2); `BRAND`; `.v2-*` classes (Task 1).

- [ ] **Step 1: Replace `app/v2/login/page.tsx` with:**

```tsx
'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useStaffLogin } from '../../../lib/hooks/useStaffLogin';
import { BRAND } from '../../../lib/brand';
import { Button, TextField, PasswordField, FormAlert, Card, WorkfoxMark } from '../../../components/ui-v2';

export default function V2LoginPage() {
  const s = useStaffLogin();
  const orgName = s.branding?.name;

  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 24 }}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
        style={{
          width: '100%', maxWidth: 380,
          ['--org-primary' as string]: s.orgPrimary,
          ['--org-on-primary' as string]: s.orgOnPrimary,
        }}
      >
        <Card style={{ padding: '28px 26px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
            {s.branding?.logoUrl ? (
              <img src={s.branding.logoUrl} alt="Organization logo" style={{ maxHeight: 40, objectFit: 'contain' }} />
            ) : (
              <span style={{ display: 'inline-grid', placeItems: 'center', width: 40, height: 40, borderRadius: 10, background: 'var(--org-primary)', color: 'var(--org-on-primary)' }}>
                <WorkfoxMark size={22} title={`${BRAND.productName}`} />
              </span>
            )}
            <div>
              <h1 className="v2-title">Sign in</h1>
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: '2px 0 0' }}>
                to continue to {orgName || BRAND.productName}
              </p>
            </div>
          </div>

          {s.error && <FormAlert>{s.error}</FormAlert>}

          <form onSubmit={s.handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <TextField
              id="org-slug"
              label="Organization"
              value={s.organizationSlug}
              onChange={s.setOrganizationSlug}
              autoComplete="organization"
            />

            {s.ssoEnabled && s.ssoLoginHref ? (
              <motion.a
                whileTap={{ scale: 0.98 }}
                href={s.ssoLoginHref}
                onClick={s.onSsoClick}
                className="v2-sso"
              >
                Continue with SSO
              </motion.a>
            ) : (
              <>
                <TextField
                  id="email"
                  label="Email"
                  type="email"
                  value={s.email}
                  onChange={s.setEmail}
                  required
                  autoComplete="email"
                />
                <PasswordField id="password" label="Password" value={s.password} onChange={s.setPassword} required />
                <motion.div whileTap={{ scale: 0.98 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
                  <Button type="submit" loading={s.submitting}>Sign in</Button>
                </motion.div>
                <Link href="/forgot-password" className="v2-link" style={{ textAlign: 'center' }}>Forgot password?</Link>
              </>
            )}
          </form>
        </Card>

        <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--muted)', marginTop: 16 }}>
          {BRAND.productName} — a {BRAND.companyName} product
        </p>
      </motion.div>
    </main>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` → no errors referencing `app/v2/login/page.tsx`.
Confirm `git status --short` shows only `app/v2/login/page.tsx`.
Do NOT run `npm run build`/`dev` — the controller runs the authoritative build + browser smoke.

- [ ] **Step 3: Commit**

```bash
git add app/v2/login/page.tsx
git commit -m "feat(ui-v2): /v2/login rebuilt as Azure centered card with Workfox identity"
```

---

### Task 3: Verification (controller)

- [ ] **Step 1:** `npm run build` → success; `/v2/login` in the route list; no errors.
- [ ] **Step 2:** Browser smoke on `/v2/login`, light + dark, ~375px + desktop: centered card on the slate ground; Workfox mark; bordered fields; accent "Sign in"; focus ring in the accent slot; forgot link. Confirm the SSO-only branch (type a known SSO slug → password hidden, "Continue with SSO" shown) and the password branch both render; a bad credential shows the `FormAlert`.
- [ ] **Step 3:** Grep gates from `apps/web`: `grep -rn "Workfox" app components lib --include="*.ts" --include="*.tsx" | grep -v "lib/brand.ts" | grep -v "\.test\." | grep -v "WorkfoxMark"` → empty; `git diff --stat main...HEAD -- app/login components/ui components/invigilator.css` → empty (old UI untouched).
- [ ] **Step 4:** Review the diff against `docs/brand/workfox-ui-review-checklist.md` (focus/labels/contrast/both-themes/accent-slot).
- [ ] **Step 5:** No commit (verification only); fix-forward via the review loop.

---

## Self-Review

**Spec coverage:** Azure tokens → Task 1 `.v2` (matches the constraint hexes + brand.css `.wfx`). Accent-slot rule → CTA/focus use `--org-primary` (Task 1 CSS) injected from branding (Task 2). Primitives retoned (bordered field, accent CTA, Card) → Task 1. Centered-card direction (21st Login Page 1 pattern) → Task 2, built on our primitives (no shadcn import — honors the 21st-intake rule). Workfox identity (mark + name via BRAND) → Task 2. Behavior unchanged (useStaffLogin, SSO-only vs password branch) → Task 2 preserves the exact branch logic. Verification (prod build, both themes, checklist) → Task 3.

**Placeholder scan:** none — full CSS, full Card, full page code included.

**Type consistency:** `Card({className?, style?, children})` defined Task 1, used Task 2. `WorkfoxMark({size, title})`, `BRAND.productName/companyName`, and the `useStaffLogin` fields (`organizationSlug/setOrganizationSlug`, `email/setEmail`, `password/setPassword`, `error`, `submitting`, `ssoEnabled`, `ssoLoginHref`, `onSsoClick`, `orgPrimary`, `orgOnPrimary`, `branding`, `handleSubmit`) all match their existing definitions. `TextField`/`PasswordField`/`Button`/`FormAlert` props unchanged from their current shapes.

**Note:** retoning `.v2` also recolors the guidelines page's non-`.wfx` chrome if any leaks — but the guidelines page scopes its content under `.wfx` (which redefines the same tokens), so it is unaffected. Verified conceptually; Task 3 browser smoke double-checks `/v2/brand` still looks right.
