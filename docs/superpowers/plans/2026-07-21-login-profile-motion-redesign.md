# Login & Profile Pages Motion & Token Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the design-token migration on the login, forgot-password, reset-password, and profile pages (plus `ProfileForm`), and add the same Framer Motion entrance polish already shipped on every console this session — no structural change to any form, field, validation, or API call.

**Architecture:** Four independent, sequential tasks, one per page (the profile page and its `ProfileForm` component are combined into one task since the page is a thin wrapper around the form). A final verification task runs the full suite and a live browser pass across all four surfaces.

**Tech Stack:** Next.js (App Router), React, Framer Motion (`motion.div`/`motion.p`/`motion.form`, `MotionConfig`), Tailwind CSS, Jest + React Testing Library.

## Global Constraints

- No behavior change anywhere in this plan — same form fields, same validation, same API calls, same routing, same handlers. Only color classes and motion wrappers change.
- Token replacements (confirmed against `apps/web/tailwind.config.ts`): `text-gray-900` → `text-recruiter-text`; `text-gray-600` → `text-recruiter-text-secondary`; `text-gray-500` → `text-recruiter-text-tertiary`; `text-gray-400` → `text-recruiter-text-tertiary`; a `hover:text-gray-600` paired with one of the above → `hover:text-recruiter-text`; `border-gray-200` → `border-recruiter-border`; `bg-gray-50` → `bg-recruiter-bg-subtle`. Classes already on tokens (`text-primary`, `text-status-danger`, `bg-status-danger-bg`, `border-recruiter-border`, `text-recruiter-text*`) and the `text-white`/`text-white/90` classes on the branding-gradient panel are untouched.
- None of the four pages share a layout file — each page gets its own `<MotionConfig reducedMotion="user">` wrap around its returned JSX, built in from the start.
- Motion entrance values are fixed across this whole plan: `initial={{ opacity: 0, y: 10 }}`, `animate={{ opacity: 1, y: 0 }}`, `transition={{ duration: 0.3, ease: 'easeOut' }}` (add `delay` only where a task specifies staggering).
- No new backend endpoints, no new components, no dependency changes — `framer-motion` is already installed and used throughout the codebase.

---

### Task 1: Login page — token migration + motion

**Files:**
- Modify: `apps/web/app/login/page.tsx`
- Test: `apps/web/app/login/page.test.tsx` (verify only — no change expected)

**Interfaces:**
- Consumes: nothing from other tasks in this plan.
- Produces: nothing consumed by later tasks — Tasks 2-4 are independent files.

The current file (157 lines) has a split-screen layout (branding-gradient panel + white form panel). This task migrates its two remaining plain-gray classes to tokens, wraps the return in `MotionConfig`, and adds fade-up motion to the form container and the conditionally-rendered SSO link.

- [ ] **Step 1: Update imports**

Change:

```tsx
import { Building2, Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
```

to:

```tsx
import { motion, MotionConfig } from 'framer-motion';
import { Building2, Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
```

- [ ] **Step 2: Migrate token classes, wrap in `MotionConfig`, and add motion to the form container and the SSO link**

Change the whole `return` block from:

```tsx
  return (
    <main className="grid md:min-h-screen md:grid-cols-2">
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
              onBlur={handleSlugBlur}
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
            <Link href="/forgot-password" className="text-right text-sm font-medium text-primary hover:underline">
              Forgot password?
            </Link>
            {ssoEnabled && (
              <a
                href={`${process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1'}/auth/saml/${organizationSlug}/login`}
                onClick={() => window.sessionStorage.setItem(SSO_PENDING_SLUG_KEY, organizationSlug)}
                className="flex items-center justify-center rounded-md border border-recruiter-border py-2 text-sm font-medium text-recruiter-text hover:bg-recruiter-bg-subtle"
              >
                Log in with SSO
              </a>
            )}
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
```

to:

```tsx
  return (
    <MotionConfig reducedMotion="user">
      <main className="grid md:min-h-screen md:grid-cols-2">
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
          <motion.div
            className="w-full max-w-sm"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <h1 className="mb-6 text-xl font-semibold text-recruiter-text">Staff Login</h1>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <Input
                label="Organization slug"
                value={organizationSlug}
                onChange={setOrganizationSlug}
                onBlur={handleSlugBlur}
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
                  className="absolute bottom-2 right-3 text-recruiter-text-tertiary hover:text-recruiter-text"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <Link href="/forgot-password" className="text-right text-sm font-medium text-primary hover:underline">
                Forgot password?
              </Link>
              {ssoEnabled && (
                <motion.a
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  href={`${process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1'}/auth/saml/${organizationSlug}/login`}
                  onClick={() => window.sessionStorage.setItem(SSO_PENDING_SLUG_KEY, organizationSlug)}
                  className="flex items-center justify-center rounded-md border border-recruiter-border py-2 text-sm font-medium text-recruiter-text hover:bg-recruiter-bg-subtle"
                >
                  Log in with SSO
                </motion.a>
              )}
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
          </motion.div>
        </div>
      </main>
    </MotionConfig>
  );
```

- [ ] **Step 3: Run the existing page test to confirm no regression**

Run (from `apps/web`): `npx jest "app/login/page.test" --verbose`

Expected: `9 passed, 9 total`. None of the existing tests query by color class or DOM nesting depth (they use `getByLabelText`, `getByRole('button'|'link'|'alert')`), so all should pass unchanged.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/login/page.tsx"
git commit -m "feat: finish token migration and add motion to login page"
```

---

### Task 2: Forgot Password page — token migration + motion

**Files:**
- Modify: `apps/web/app/forgot-password/page.tsx`
- Test: `apps/web/app/forgot-password/page.test.tsx` (verify only — no change expected)

**Interfaces:**
- Consumes: nothing from other tasks in this plan.
- Produces: nothing consumed by later tasks.

The current file (109 lines) shares the login page's split-screen shell. This task migrates its remaining plain-gray classes to tokens, wraps the return in `MotionConfig`, and wraps each of the `submitted`/not-`submitted` ternary branches in its own fade-up `motion.div` (the `<h1>` above the ternary is common to both states and stays outside any motion wrap).

- [ ] **Step 1: Update imports**

Change:

```tsx
import { Building2, Mail, AlertCircle } from 'lucide-react';
```

to:

```tsx
import { motion, MotionConfig } from 'framer-motion';
import { Building2, Mail, AlertCircle } from 'lucide-react';
```

- [ ] **Step 2: Migrate token classes, wrap in `MotionConfig`, and wrap each ternary branch in `motion.div`**

Change the whole `return` block from:

```tsx
  return (
    <main className="grid md:min-h-screen md:grid-cols-2">
      <div
        className="relative hidden overflow-hidden md:flex md:flex-col md:items-start md:justify-center md:gap-4 md:px-16 md:py-12"
        style={{
          backgroundImage: `linear-gradient(135deg, ${primaryColor ?? 'var(--color-primary, #1a73e8)'}, ${accentColor ?? 'var(--color-accent, #fbbc04)'})`,
        }}
      >
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/10" aria-hidden="true" />
        {branding?.logoUrl ? (
          <img src={branding.logoUrl} alt="Organization logo" className="relative z-10 max-h-14" />
        ) : (
          <p className="relative z-10 text-2xl font-bold text-white">Examination Platform</p>
        )}
        <p className="relative z-10 max-w-sm text-sm text-white/90">Sign in to manage exams, candidates, and results.</p>
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
          <h1 className="mb-2 text-xl font-semibold text-gray-900">Forgot password</h1>
          {submitted ? (
            <>
              <p className="mb-6 text-sm text-gray-600">
                If an account with that organization and email exists, we&apos;ve sent a reset link to that email.
              </p>
              <Link href="/login" className="text-sm font-medium text-primary hover:underline">
                Back to login
              </Link>
            </>
          ) : (
            <>
              <p className="mb-6 text-sm text-gray-600">
                Enter your organization slug and email, and we&apos;ll send you a link to reset your password.
              </p>
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <Input
                  label="Organization slug"
                  value={organizationSlug}
                  onChange={setOrganizationSlug}
                  required
                  icon={<Building2 size={16} />}
                />
                <Input label="Email" type="email" value={email} onChange={setEmail} required icon={<Mail size={16} />} />
                <Button type="submit" loading={submitting}>
                  Send reset link
                </Button>
                {error && (
                  <p role="alert" className="flex items-center gap-2 rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger">
                    <AlertCircle size={16} />
                    {error}
                  </p>
                )}
              </form>
              <Link href="/login" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
                Back to login
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
```

to:

```tsx
  return (
    <MotionConfig reducedMotion="user">
      <main className="grid md:min-h-screen md:grid-cols-2">
        <div
          className="relative hidden overflow-hidden md:flex md:flex-col md:items-start md:justify-center md:gap-4 md:px-16 md:py-12"
          style={{
            backgroundImage: `linear-gradient(135deg, ${primaryColor ?? 'var(--color-primary, #1a73e8)'}, ${accentColor ?? 'var(--color-accent, #fbbc04)'})`,
          }}
        >
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/10" aria-hidden="true" />
          {branding?.logoUrl ? (
            <img src={branding.logoUrl} alt="Organization logo" className="relative z-10 max-h-14" />
          ) : (
            <p className="relative z-10 text-2xl font-bold text-white">Examination Platform</p>
          )}
          <p className="relative z-10 max-w-sm text-sm text-white/90">Sign in to manage exams, candidates, and results.</p>
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
            <h1 className="mb-2 text-xl font-semibold text-recruiter-text">Forgot password</h1>
            {submitted ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <p className="mb-6 text-sm text-recruiter-text-secondary">
                  If an account with that organization and email exists, we&apos;ve sent a reset link to that email.
                </p>
                <Link href="/login" className="text-sm font-medium text-primary hover:underline">
                  Back to login
                </Link>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <p className="mb-6 text-sm text-recruiter-text-secondary">
                  Enter your organization slug and email, and we&apos;ll send you a link to reset your password.
                </p>
                <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                  <Input
                    label="Organization slug"
                    value={organizationSlug}
                    onChange={setOrganizationSlug}
                    required
                    icon={<Building2 size={16} />}
                  />
                  <Input label="Email" type="email" value={email} onChange={setEmail} required icon={<Mail size={16} />} />
                  <Button type="submit" loading={submitting}>
                    Send reset link
                  </Button>
                  {error && (
                    <p role="alert" className="flex items-center gap-2 rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger">
                      <AlertCircle size={16} />
                      {error}
                    </p>
                  )}
                </form>
                <Link href="/login" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
                  Back to login
                </Link>
              </motion.div>
            )}
          </div>
        </div>
      </main>
    </MotionConfig>
  );
```

- [ ] **Step 3: Run the existing page test to confirm no regression**

Run (from `apps/web`): `npx jest "app/forgot-password/page.test" --verbose`

Expected: `2 passed, 2 total`. Both existing tests use `getByLabelText`/`getByRole`/`getByText` queries with no dependency on color class or DOM nesting, so both should pass unchanged.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/forgot-password/page.tsx"
git commit -m "feat: finish token migration and add motion to forgot-password page"
```

---

### Task 3: Reset Password page — token migration + motion

**Files:**
- Modify: `apps/web/app/reset-password/[token]/page.tsx`
- Test: `apps/web/app/reset-password/[token]/page.test.tsx` (verify only — no change expected)

**Interfaces:**
- Consumes: nothing from other tasks in this plan.
- Produces: nothing consumed by later tasks.

The current file (112 lines) shares the same split-screen shell. Unlike Forgot Password, each of this page's two ternary branches is a single root element (`<p>` for the success message, `<form>` for the reset form), so this task converts those two root elements directly into `motion.p`/`motion.form` rather than adding an extra wrapping `div`.

- [ ] **Step 1: Update imports**

Change:

```tsx
import { Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
```

to:

```tsx
import { motion, MotionConfig } from 'framer-motion';
import { Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
```

- [ ] **Step 2: Migrate token classes, wrap in `MotionConfig`, and convert the two ternary-branch root elements to `motion.p`/`motion.form`**

Change the whole `return` block from:

```tsx
  return (
    <main className="grid md:min-h-screen md:grid-cols-2">
      <div
        className="relative hidden overflow-hidden md:flex md:flex-col md:items-start md:justify-center md:gap-4 md:px-16 md:py-12"
        style={{ backgroundImage: 'linear-gradient(135deg, var(--color-primary, #1a73e8), var(--color-accent, #fbbc04))' }}
      >
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/10" aria-hidden="true" />
        <p className="relative z-10 text-2xl font-bold text-white">Examination Platform</p>
        <p className="relative z-10 max-w-sm text-sm text-white/90">Sign in to manage exams, candidates, and results.</p>
      </div>

      <div className="flex flex-col items-center justify-center gap-4 bg-white px-6 py-12 md:hidden">
        <p className="text-lg font-bold text-primary">Examination Platform</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <h1 className="mb-6 text-xl font-semibold text-gray-900">Reset password</h1>
          {success ? (
            <p className="text-sm text-gray-600">Your password has been reset. Redirecting to login&hellip;</p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="relative">
                <Input
                  label="New password"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={setNewPassword}
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
              <Input
                label="Confirm new password"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={setConfirmPassword}
                required
                icon={<Lock size={16} />}
              />
              <Button type="submit" loading={submitting} disabled={!passwordsMatch}>
                Reset password
              </Button>
              {!passwordsMatch && confirmPassword.length > 0 && (
                <p className="text-xs text-gray-500">Passwords must match.</p>
              )}
              {error && (
                <div className="flex flex-col gap-2 rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger">
                  <p role="alert" className="flex items-center gap-2">
                    <AlertCircle size={16} />
                    {error}
                  </p>
                  <Link href="/forgot-password" className="font-medium underline">
                    Request a new reset link
                  </Link>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </main>
  );
```

to:

```tsx
  return (
    <MotionConfig reducedMotion="user">
      <main className="grid md:min-h-screen md:grid-cols-2">
        <div
          className="relative hidden overflow-hidden md:flex md:flex-col md:items-start md:justify-center md:gap-4 md:px-16 md:py-12"
          style={{ backgroundImage: 'linear-gradient(135deg, var(--color-primary, #1a73e8), var(--color-accent, #fbbc04))' }}
        >
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/10" aria-hidden="true" />
          <p className="relative z-10 text-2xl font-bold text-white">Examination Platform</p>
          <p className="relative z-10 max-w-sm text-sm text-white/90">Sign in to manage exams, candidates, and results.</p>
        </div>

        <div className="flex flex-col items-center justify-center gap-4 bg-white px-6 py-12 md:hidden">
          <p className="text-lg font-bold text-primary">Examination Platform</p>
        </div>

        <div className="flex flex-1 items-center justify-center bg-white px-6 py-12">
          <div className="w-full max-w-sm">
            <h1 className="mb-6 text-xl font-semibold text-recruiter-text">Reset password</h1>
            {success ? (
              <motion.p
                className="text-sm text-recruiter-text-secondary"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                Your password has been reset. Redirecting to login&hellip;
              </motion.p>
            ) : (
              <motion.form
                onSubmit={handleSubmit}
                className="flex flex-col gap-3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <div className="relative">
                  <Input
                    label="New password"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={setNewPassword}
                    required
                    icon={<Lock size={16} />}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide characters' : 'Show characters'}
                    className="absolute bottom-2 right-3 text-recruiter-text-tertiary hover:text-recruiter-text"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <Input
                  label="Confirm new password"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  required
                  icon={<Lock size={16} />}
                />
                <Button type="submit" loading={submitting} disabled={!passwordsMatch}>
                  Reset password
                </Button>
                {!passwordsMatch && confirmPassword.length > 0 && (
                  <p className="text-xs text-recruiter-text-tertiary">Passwords must match.</p>
                )}
                {error && (
                  <div className="flex flex-col gap-2 rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger">
                    <p role="alert" className="flex items-center gap-2">
                      <AlertCircle size={16} />
                      {error}
                    </p>
                    <Link href="/forgot-password" className="font-medium underline">
                      Request a new reset link
                    </Link>
                  </div>
                )}
              </motion.form>
            )}
          </div>
        </div>
      </main>
    </MotionConfig>
  );
```

- [ ] **Step 3: Run the existing page test to confirm no regression**

Run (from `apps/web`): `npx jest "reset-password/.token./page.test" --verbose`

Expected: `3 passed, 3 total`. None of the existing tests query by color class or DOM nesting, so all should pass unchanged.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/reset-password/[token]/page.tsx"
git commit -m "feat: finish token migration and add motion to reset-password page"
```

---

### Task 4: Profile page + ProfileForm — token migration + motion

**Files:**
- Modify: `apps/web/app/profile/page.tsx`
- Modify: `apps/web/components/ProfileForm.tsx`
- Test: `apps/web/app/profile/page.test.tsx` (verify only — no change expected)
- Test: `apps/web/components/ProfileForm.test.tsx` (verify only — no change expected)

**Interfaces:**
- Consumes: nothing from other tasks in this plan.
- Produces: nothing consumed by later tasks.

`apps/web/app/profile/page.tsx` (48 lines) is a thin wrapper: a back-link header bar plus `<ProfileForm />`. `apps/web/components/ProfileForm.tsx` (133 lines) already uses `recruiter-*` tokens for most of its text, aside from one `text-gray-400 hover:text-gray-600` password-toggle button shared with the other three pages. This task finishes the token migration on both files and adds the `MotionConfig` wrap to `profile/page.tsx` (so it covers `ProfileForm`'s motion, since `ProfileForm` doesn't have its own layout) plus staggered fade-up on `ProfileForm`'s two `Card`s.

- [ ] **Step 1: Update `profile/page.tsx` imports**

Change:

```tsx
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { ProfileForm } from '../../components/ProfileForm';
```

to:

```tsx
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MotionConfig } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { ProfileForm } from '../../components/ProfileForm';
```

- [ ] **Step 2: Migrate `profile/page.tsx`'s token classes and wrap the return in `MotionConfig`**

Change:

```tsx
  if (isLoading || !accessToken) {
    return <p className="p-8 text-sm text-gray-500">Loading…</p>;
  }

  const homeHref = (role && HOME_BY_ROLE[role]) || '/login';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link
          href={homeHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft size={16} />
          Back
        </Link>
      </div>
      <main className="p-8">
        <ProfileForm />
      </main>
    </div>
  );
```

to:

```tsx
  if (isLoading || !accessToken) {
    return <p className="p-8 text-sm text-recruiter-text-tertiary">Loading…</p>;
  }

  const homeHref = (role && HOME_BY_ROLE[role]) || '/login';

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-recruiter-bg-subtle">
        <div className="border-b border-recruiter-border bg-white px-6 py-4">
          <Link
            href={homeHref}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-recruiter-text-secondary hover:text-recruiter-text"
          >
            <ArrowLeft size={16} />
            Back
          </Link>
        </div>
        <main className="p-8">
          <ProfileForm />
        </main>
      </div>
    </MotionConfig>
  );
```

- [ ] **Step 3: Run the profile page test to confirm no regression**

Run (from `apps/web`): `npx jest "app/profile/page.test" --verbose`

Expected: `3 passed, 3 total`.

- [ ] **Step 4: Update `ProfileForm.tsx` imports**

Change:

```tsx
import { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
```

to:

```tsx
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
```

- [ ] **Step 5: Migrate the password-toggle button's token classes and wrap both `Card`s in staggered `motion.div`**

Change the whole `return` block from:

```tsx
  return (
    <div className="flex flex-col gap-6">
      <Card className="max-w-md">
        <h1 className="mb-4 text-xl font-semibold text-recruiter-text">My Profile</h1>
        {!user && <p className="mb-4 text-sm text-recruiter-text-secondary">Loading…</p>}
        <form onSubmit={handleNameSubmit} className="mb-4 flex flex-col gap-3">
          <Input label="Display name" value={name} onChange={setName} disabled={!user} />
          <Input label="Email" value={user?.email ?? ''} onChange={() => {}} disabled readOnly />
          <Input label="Role" value={user?.role ?? ''} onChange={() => {}} disabled readOnly />
          <Input label="Organization" value={organizationSlug ?? ''} onChange={() => {}} disabled readOnly />
          <Button type="submit" disabled={!user || name.trim().length === 0}>
            Save name
          </Button>
        </form>
        {nameError && (
          <p role="alert" className="mt-3 text-sm text-status-danger">
            {nameError}
          </p>
        )}
      </Card>

      <Card className="max-w-md">
        <h2 className="mb-4 text-lg font-semibold text-recruiter-text">Change password</h2>
        <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3">
          <Input
            label="Current password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={currentPassword}
            onChange={setCurrentPassword}
            required
          />
          <div className="relative">
            <Input
              label="New password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={newPassword}
              onChange={setNewPassword}
              required
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
          <Input
            label="Confirm new password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            required
          />
          <Button type="submit" disabled={!passwordsMatch || currentPassword.length === 0}>
            Change password
          </Button>
          {!passwordsMatch && confirmPassword.length > 0 && (
            <p className="text-xs text-recruiter-text-tertiary">Passwords must match.</p>
          )}
        </form>
        {passwordError && (
          <p role="alert" className="mt-3 text-sm text-status-danger">
            {passwordError}
          </p>
        )}
      </Card>
    </div>
  );
```

to:

```tsx
  return (
    <div className="flex flex-col gap-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0, ease: 'easeOut' }}
      >
        <Card className="max-w-md">
          <h1 className="mb-4 text-xl font-semibold text-recruiter-text">My Profile</h1>
          {!user && <p className="mb-4 text-sm text-recruiter-text-secondary">Loading…</p>}
          <form onSubmit={handleNameSubmit} className="mb-4 flex flex-col gap-3">
            <Input label="Display name" value={name} onChange={setName} disabled={!user} />
            <Input label="Email" value={user?.email ?? ''} onChange={() => {}} disabled readOnly />
            <Input label="Role" value={user?.role ?? ''} onChange={() => {}} disabled readOnly />
            <Input label="Organization" value={organizationSlug ?? ''} onChange={() => {}} disabled readOnly />
            <Button type="submit" disabled={!user || name.trim().length === 0}>
              Save name
            </Button>
          </form>
          {nameError && (
            <p role="alert" className="mt-3 text-sm text-status-danger">
              {nameError}
            </p>
          )}
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05, ease: 'easeOut' }}
      >
        <Card className="max-w-md">
          <h2 className="mb-4 text-lg font-semibold text-recruiter-text">Change password</h2>
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3">
            <Input
              label="Current password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={currentPassword}
              onChange={setCurrentPassword}
              required
            />
            <div className="relative">
              <Input
                label="New password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={newPassword}
                onChange={setNewPassword}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide characters' : 'Show characters'}
                className="absolute bottom-2 right-3 text-recruiter-text-tertiary hover:text-recruiter-text"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <Input
              label="Confirm new password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              required
            />
            <Button type="submit" disabled={!passwordsMatch || currentPassword.length === 0}>
              Change password
            </Button>
            {!passwordsMatch && confirmPassword.length > 0 && (
              <p className="text-xs text-recruiter-text-tertiary">Passwords must match.</p>
            )}
          </form>
          {passwordError && (
            <p role="alert" className="mt-3 text-sm text-status-danger">
              {passwordError}
            </p>
          )}
        </Card>
      </motion.div>
    </div>
  );
```

- [ ] **Step 6: Run the ProfileForm test to confirm no regression**

Run (from `apps/web`): `npx jest "ProfileForm.test" --verbose`

Expected: `5 passed, 5 total`.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/profile/page.tsx" "apps/web/components/ProfileForm.tsx"
git commit -m "feat: finish token migration and add motion to profile page"
```

---

### Task 5: Final verification

**Files:** none (verification only).

**Interfaces:**
- Consumes: the complete state of all four pages and `ProfileForm` after Tasks 1-4.
- Produces: nothing — this is the plan's terminal task.

- [ ] **Step 1: Run the full apps/web test suite**

Run (from `apps/web`): `npx jest`

Expected: all suites pass, including `app/login/page.test.tsx`, `app/forgot-password/page.test.tsx`, `app/reset-password/[token]/page.test.tsx`, `app/profile/page.test.tsx`, and `components/ProfileForm.test.tsx`.

- [ ] **Step 2: Run the TypeScript compiler**

Run (from `apps/web`): `npx tsc --noEmit`

Expected: no new errors in any of the five modified files. Any pre-existing unrelated errors (e.g. in candidate-facing test files, or the known `forgot-password`/`login`/`reset-password` test-file fetch-mock type errors already present before this plan) are out of scope for this plan — confirm the count and file list match what existed before Task 1.

- [ ] **Step 3: Live browser verification**

Start the dev server (no login required for these pages except Profile) and:
- Visit `/login`: confirm the form fades up on load; type an SSO-enabled org slug and tab out, confirm the "Log in with SSO" link fades in; toggle password visibility; confirm the h1 and toggle-button icon read as `recruiter-text`/`recruiter-text-tertiary` colors (no visible change from before, since the token colors match the prior gray values closely — this is a verification that nothing looks broken, not a visual redesign).
- Visit `/forgot-password`: confirm the form fades up on load; submit it and confirm the confirmation message fades in in place of the form.
- Visit `/reset-password/{a-token}`: confirm the form fades up on load; submit with mismatched then matched passwords; confirm the success message fades in after a successful submit.
- Log in and visit `/profile`: confirm the "My Profile" and "Change password" cards fade up in a staggered sequence; update the display name and change the password to confirm both forms still work.
- In OS or browser dev tools, enable "prefers reduced motion" and reload each of the four pages — confirm entrance animations no longer play.

- [ ] **Step 4: Commit any fixes found during verification**

If Steps 1-3 surface any issue, fix it, re-run the relevant command from this task, and commit:

```bash
git add -A
git commit -m "fix: address final verification findings for login/profile motion redesign"
```

If no issues are found, skip this step — there is nothing to commit.
