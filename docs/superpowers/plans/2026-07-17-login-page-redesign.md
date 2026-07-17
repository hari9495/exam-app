# Login Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain, unbranded staff login page with a split-screen layout whose left panel reflects the org's live branding (or a neutral platform default before a slug is typed) and whose form gets icon fields, a password-visibility toggle, a loading submit state, and a tone-consistent error banner.

**Architecture:** Two small additive props (`icon` on `Input`, `loading` on `Button`) land first as isolated, independently-tested changes to shared primitives with zero impact on existing call sites. The login page itself is then rewritten in place — same file, same component tree depth, no new files — consuming the new props plus local state for the password toggle.

**Tech Stack:** Next.js (App Router) + React, Tailwind CSS (existing `--color-primary`/`--color-accent` CSS variables and `status.*` tokens), `lucide-react` (already a dependency), `@tanstack/react-query` (existing `useBranding` hook, unchanged), Jest + React Testing Library for unit tests, Playwright for e2e.

## Global Constraints

- Every one of `apps/web/e2e/{recruiter,org-admin,panel,candidate,code-question,exam-scheduling,live-monitoring}-golden-path.spec.ts` drives the login form via `page.getByLabel('Organization slug')`, `page.getByLabel('Email')`, `page.getByLabel('Password')`, and `page.getByRole('button', { name: 'Log in' })`. These four accessible names/roles MUST resolve to exactly one element each after the redesign — the labels' visible text and the submit button's accessible name do not change, no matter how the surrounding markup changes.
- `Input`'s and `Button`'s new props (`icon`, `loading`) must be optional and fully backward compatible: every existing call site across the app (every console's forms) renders unchanged when the prop is omitted.
- No auth logic, validation rules, or API contract changes — `apiFetch('/auth/staff/login', ...)`, the role-based redirect (`org_admin` → `/users`, `panel` → `/reports`, else `/dashboard`), and `useBranding(organizationSlug || null)` behave exactly as they do today.
- No new backend endpoints or fields. `BrandingResponse` (`apps/web/lib/types.ts:138-142`) already has everything the left panel needs: `logoUrl: string | null`, `primaryColor: string | null`, `accentColor: string | null`.
- Default brand colors come from the existing CSS variables `--color-primary: #1a73e8` and `--color-accent: #fbbc04` (`apps/web/app/globals.css:6-7`), already wired through Tailwind as `bg-primary`/`bg-accent`/`text-primary` etc. (`apps/web/tailwind.config.ts:8-9`). Do not hardcode a second copy of these hex values anywhere new.

---

### Task 1: `Input` gains an optional `icon` prop

**Files:**
- Modify: `apps/web/components/ui/Input.tsx`
- Test: `apps/web/components/ui/Input.test.tsx`

**Interfaces:**
- Consumes: nothing new — extends the existing `InputProps` interface in place.
- Produces: `Input` accepts an optional `icon?: ReactNode` prop. When present, the rendered `<input>` gets left padding (`pl-9`) to make room and the icon renders absolutely positioned inside the field's left edge, vertically centered. When omitted, output is byte-identical to today (verified by the existing two tests staying green unmodified).

- [ ] **Step 1: Write the failing test**

Add to `apps/web/components/ui/Input.test.tsx` (append inside the existing `describe('Input', ...)` block, after the last `it`):

```tsx
  it('renders an icon inside the field when provided', () => {
    render(<Input label="Email" value="" onChange={() => {}} icon={<span data-testid="input-icon">@</span>} />);
    expect(screen.getByTestId('input-icon')).toBeInTheDocument();
  });

  it('does not add left padding when no icon is provided', () => {
    render(<Input label="Email" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Email')).not.toHaveClass('pl-9');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx jest components/ui/Input.test.tsx`
Expected: FAIL — `icon` is not a valid prop on `InputProps` (TypeScript error) and `input-icon` testid is never rendered.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `apps/web/components/ui/Input.tsx`:

```tsx
import { InputHTMLAttributes, ReactNode, useId } from 'react';
import clsx from 'clsx';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  icon?: ReactNode;
}

export function Input({ label, value, onChange, error, icon, className, id, ...props }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">{icon}</span>
        )}
        <input
          id={inputId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={clsx(
            'w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none',
            icon && 'pl-9',
            error && 'border-red-500',
            className,
          )}
          aria-invalid={Boolean(error)}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx jest components/ui/Input.test.tsx`
Expected: PASS — all 4 tests (2 existing + 2 new) green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ui/Input.tsx apps/web/components/ui/Input.test.tsx
git commit -m "feat: add optional icon prop to Input"
```

---

### Task 2: `Button` gains an optional `loading` prop

**Files:**
- Modify: `apps/web/components/ui/Button.tsx`
- Test: `apps/web/components/ui/Button.test.tsx`

**Interfaces:**
- Consumes: nothing new — extends the existing `ButtonProps` interface in place.
- Produces: `Button` accepts an optional `loading?: boolean` prop. When `true`, the button renders a small spinner (an inline SVG, `animate-spin`, no new dependency) before its children and is forced `disabled` regardless of the `disabled` prop's own value. When omitted or `false`, output is byte-identical to today.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/components/ui/Button.test.tsx` (append inside the existing `describe('Button', ...)` block, after the last `it`):

```tsx
  it('disables the button and shows a spinner when loading', () => {
    const onClick = jest.fn();
    render(
      <Button onClick={onClick} loading>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button.querySelector('svg')).toBeInTheDocument();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx jest components/ui/Button.test.tsx`
Expected: FAIL — `loading` is not a valid prop on `ButtonProps` (TypeScript error) and no `<svg>` is rendered.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `apps/web/components/ui/Button.tsx`:

```tsx
import { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:opacity-90',
  secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};

export function Button({ variant = 'primary', className, disabled, loading, children, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
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
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx jest components/ui/Button.test.tsx`
Expected: PASS — all 3 tests (2 existing + 1 new) green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ui/Button.tsx apps/web/components/ui/Button.test.tsx
git commit -m "feat: add optional loading prop to Button"
```

---

### Task 3: Split-screen login page redesign

**Files:**
- Modify: `apps/web/app/login/page.tsx`
- Test: `apps/web/app/login/page.test.tsx`

**Interfaces:**
- Consumes: `Input` with `icon` (Task 1), `Button` with `loading` (Task 2), `useBranding` (`apps/web/lib/hooks/useBranding.ts`, unchanged signature `useBranding(organizationSlug: string | null): UseQueryResult<BrandingResponse>`), `BrandingResponse` (`apps/web/lib/types.ts:138-142`, fields `logoUrl`/`primaryColor`/`accentColor`, all `string | null`), `useAuth().login(slug: string, token: string)` (`apps/web/lib/auth-context.tsx:12,56`), `decodeJwtPayload(token: string): Record<string, unknown> | null` (`apps/web/lib/jwt.ts`).
- Produces: nothing consumed by later tasks — this is the final task in the plan.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `apps/web/app/login/page.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './page';
import { AuthProvider } from '../../lib/auth-context';
import { QueryProvider } from '../../lib/query-provider';
import { fakeJwt } from '../../lib/test-utils/fake-jwt';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

describe('LoginPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    mockPush.mockClear();
  });

  it('submits organization slug, email, and password to the login endpoint', async () => {
    const fetchMock = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ message: 'no session' }), { status: 401 });
      }
      if (String(url).endsWith('/auth/staff/login')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await userEvent.type(screen.getByLabelText(/organization slug/i), 'demo-org');
    await userEvent.type(screen.getByLabelText(/email/i), 'recruiter@demo-org.test');
    await userEvent.type(screen.getByLabelText(/password/i), 'Passw0rd!');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    const loginCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/auth/staff/login'));
    expect(loginCall).toBeDefined();
    expect(JSON.parse((loginCall![1] as RequestInit).body as string)).toEqual({
      organizationSlug: 'demo-org',
      email: 'recruiter@demo-org.test',
      password: 'Passw0rd!',
    });
  });

  it('redirects org_admin to /users after login', async () => {
    const orgAdminToken = fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'org_admin' });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ message: 'no session' }), { status: 401 });
      }
      if (String(url).endsWith('/auth/staff/login')) {
        return new Response(JSON.stringify({ accessToken: orgAdminToken }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await userEvent.type(screen.getByLabelText(/organization slug/i), 'demo-org');
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@demo-org.test');
    await userEvent.type(screen.getByLabelText(/password/i), 'DevAdmin123!');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/users'));
  });

  it('shows an error banner when login fails', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ message: 'no session' }), { status: 401 });
      }
      if (String(url).endsWith('/auth/staff/login')) {
        return new Response(JSON.stringify({ message: 'Invalid credentials' }), { status: 401 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await userEvent.type(screen.getByLabelText(/organization slug/i), 'demo-org');
    await userEvent.type(screen.getByLabelText(/email/i), 'recruiter@demo-org.test');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials');
  });

  it('toggles password visibility when the show/hide button is clicked', async () => {
    render(
      <QueryProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </QueryProvider>,
    );

    const passwordInput = screen.getByLabelText(/password/i);
    expect(passwordInput).toHaveAttribute('type', 'password');

    await userEvent.click(screen.getByRole('button', { name: /show characters/i }));
    expect(passwordInput).toHaveAttribute('type', 'text');

    await userEvent.click(screen.getByRole('button', { name: /hide characters/i }));
    expect(passwordInput).toHaveAttribute('type', 'password');
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `cd apps/web && npx jest app/login/page.test.tsx`
Expected: the 2 pre-existing tests still PASS against the old page; the 2 new tests (`shows an error banner`, `toggles password visibility`) FAIL — `role="alert"` currently has no text assertion coverage gap for the "Invalid credentials" content is fine (it should already pass since the old page also uses `role="alert"`), but the show/hide password button does not exist yet, so that test FAILs with "Unable to find role button with name /show password/i".

- [ ] **Step 3: Write the implementation**

Replace the full contents of `apps/web/app/login/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { decodeJwtPayload } from '../../lib/jwt';
import { Button, Input } from '../../components/ui';
import { useBranding } from '../../lib/hooks/useBranding';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [organizationSlug, setOrganizationSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { data: branding } = useBranding(organizationSlug || null);

  const primaryColor = branding?.primaryColor ?? undefined;
  const accentColor = branding?.accentColor ?? undefined;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiFetch('/auth/staff/login', {
        method: 'POST',
        body: JSON.stringify({ organizationSlug: organizationSlug || undefined, email, password }),
      });
      login(organizationSlug, result.accessToken);
      const payload = decodeJwtPayload(result.accessToken);
      router.push(payload?.role === 'org_admin' ? '/users' : payload?.role === 'panel' ? '/reports' : '/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen md:grid-cols-2">
      <div
        className="relative hidden overflow-hidden md:flex md:flex-col md:items-start md:justify-center md:gap-4 md:px-16 md:py-12"
        style={{
          backgroundImage: `linear-gradient(135deg, ${primaryColor ?? 'var(--color-primary, #1a73e8)'}, ${accentColor ?? 'var(--color-accent, #fbbc04)'})`,
        }}
      >
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/10"
          aria-hidden="true"
        />
        {branding?.logoUrl ? (
          <img src={branding.logoUrl} alt="Organization logo" className="relative z-10 max-h-14" />
        ) : (
          <p className="relative z-10 text-2xl font-bold text-white">Examination Platform</p>
        )}
        <p className="relative z-10 max-w-sm text-sm text-white/90">
          Sign in to manage exams, candidates, and results.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center gap-4 bg-white px-6 py-12 md:hidden">
        {branding?.logoUrl ? (
          <img src={branding.logoUrl} alt="Organization logo" className="max-h-10" />
        ) : (
          <p className="text-lg font-bold text-primary">Examination Platform</p>
        )}
      </div>

      <div className="flex flex-1 items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <h1 className="mb-6 text-xl font-semibold text-gray-900">Staff Login</h1>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Input
              label="Organization slug"
              value={organizationSlug}
              onChange={setOrganizationSlug}
              icon={<Building2 size={16} />}
            />
            <Input label="Email" type="email" value={email} onChange={setEmail} required icon={<Mail size={16} />} />
            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={setPassword}
                required
                icon={<Lock size={16} />}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide characters' : 'Show characters'}
                className="absolute bottom-2 right-3 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <Button type="submit" loading={submitting}>
              Log in
            </Button>
            {error && (
              <p role="alert" className="flex items-center gap-2 rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger">
                <AlertCircle size={16} />
                {error}
              </p>
            )}
          </form>
        </div>
      </div>
    </main>
  );
}
```

The toggle button's accessible name is deliberately "Show/Hide **characters**", not "Show/Hide **password**": Playwright's `getByLabel`/`getByRole({name})` and RTL's `getByLabelText` both do case-insensitive substring matching by default, and a `<button>` is an HTML-labelable element. An aria-label containing the substring "password" would make `page.getByLabel('Password')` (used by all 7 golden-path specs) and this task's own `getByLabelText(/password/i)` ambiguously match both the password field and the toggle button, breaking every one of them. Do not rename this back to include "password".

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx jest app/login/page.test.tsx`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/login/page.tsx apps/web/app/login/page.test.tsx
git commit -m "feat: redesign login page with split-screen branding panel and form polish"
```

---

### Task 4: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full web unit suite**

Run: `cd apps/web && npx jest --runInBand`
Expected: every suite passes, including the 3 files touched in Tasks 1-3 and every other suite that renders `Input`/`Button` (none of them pass `icon` or `loading`, so none of their assertions change).

- [ ] **Step 2: TypeScript check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors introduced by this plan (pre-existing unrelated errors, if any, are out of scope).

- [ ] **Step 3: Full Playwright suite**

Run: `cd apps/web && npx playwright test`
Expected: all 7 golden-path specs pass unchanged — `recruiter-golden-path.spec.ts`, `org-admin-golden-path.spec.ts`, `panel-golden-path.spec.ts`, `candidate-golden-path.spec.ts`, `code-question-golden-path.spec.ts`, `exam-scheduling-golden-path.spec.ts`, and `live-monitoring-golden-path.spec.ts` each start with `page.getByLabel('Organization slug'|'Email'|'Password')` and `page.getByRole('button', { name: 'Log in' })` — this plan's Global Constraints section requires these to keep resolving to exactly one element. If any fail, treat it as a real regression to fix (e.g. an ambiguous accessible name from the new password-toggle button or icon markup), not a spec to edit around.

- [ ] **Step 4: Manual smoke check**

With `apps/api` and `apps/web` dev servers running: navigate to `/login` with no org slug typed and confirm the left panel shows the deep-blue-to-yellow gradient with "Examination Platform" text and the two decorative translucent circles, and the right panel shows the three icon-prefixed fields plus a plain "Log in" button. Type a known org slug (e.g. `demo-org`) into the Organization slug field and confirm the left panel's gradient and any logo swap live to that org's branding within a moment (no page reload). Click the password field's eye icon and confirm the value becomes visible as plain text, then click again to re-mask it. Submit with a wrong password and confirm the error renders as an icon+text banner, not a bare red line. Submit with valid seeded credentials (e.g. `demo-org` / `recruiter@demo-org.test` / the seeded recruiter password) and confirm the button shows a spinner briefly before the page navigates to `/dashboard`. Resize the browser to a narrow (mobile) width and confirm the left panel collapses to a compact top banner instead of taking up half the screen.

- [ ] **Step 5: Update the SDD progress ledger**

Overwrite `.superpowers/sdd/progress.md` with:

```
# Login Page Redesign — SDD Progress Ledger

## Tasks
Task 1: complete (Input icon prop)
Task 2: complete (Button loading prop)
Task 3: complete (split-screen login page redesign)
Task 4: complete (final verification)
```
