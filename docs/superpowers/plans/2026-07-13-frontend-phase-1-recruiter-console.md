# Frontend Phase 1: Shared Shell + Recruiter Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared frontend foundation (Tailwind + Radix design system, TanStack Query, session persistence) and the Recruiter console's core exam-authoring loop (dashboard, exam builder, question bank, candidates + invitations) on top of the currently-empty `apps/web` Next.js app.

**Architecture:** A `(recruiter)` App Router route group with its own sidebar-nav layout wraps the recruiter screens; a shared `components/ui/` library (Tailwind + Radix primitives) is the styling foundation every screen builds on; TanStack Query hooks in `lib/hooks/` wrap every backend call with cache keys per resource; a small backend fix makes the httpOnly refresh cookie actually usable by a browser client.

**Tech Stack:** Next.js 16 (App Router, already installed), Tailwind CSS, Radix UI primitives, `@tanstack/react-query`, `clsx`, Jest + React Testing Library, Playwright.

## Global Constraints

- API base URL: `http://localhost:3001/api/v1` (`NEXT_PUBLIC_API_BASE` env override), global prefix confirmed as `/api/v1` in `apps/api/src/main.ts`.
- Auth: `POST /auth/staff/login` returns `{ accessToken: string }` and sets an httpOnly `refresh_token` cookie. Access token goes in `Authorization: Bearer <token>` header; never stored in `localStorage`.
- **`UpdateExamDto` and `UpdateQuestionDto` both `extend` their `Create...Dto` with no partial-type wrapper** — every field (including `title`/`type`/`text`/`difficulty`/`marks`/`options`) is required on every `PATCH`, not just the changed fields. Every edit form in this plan must load the full record first and resend every field on save, never a partial diff.
- Permission strings (`apps/api/prisma/seed.ts`): `recruiter` role has `['org:view', 'question_bank:manage', 'exam:manage', 'candidate:manage', 'results:view', 'ai_jobs:view']`. **Recruiter does NOT have `org:manage_settings`** — the authenticated `GET /organizations/branding` endpoint (which requires `org:manage_settings`) is unreachable for a recruiter. Tenant-theme colors inside the `(recruiter)` console must come from the **public** `GET /organizations/by-slug/:slug/branding` endpoint (no guard), using the org slug captured at login — the same endpoint the existing login page already calls.
- Exam sections created/edited through this phase's UI always use `selectionMode: 'fixed'` (the backend default). Pool-based random question selection (`selectionMode: 'pool'`, `poolSize`, `poolDifficulty`, `poolTagIds`) is an existing backend feature with no UI in this phase — out of scope per the approved spec's "core loop only" scope decision.
- Explicitly out of scope (do not build): Org Admin / Super Admin / Interview Panel consoles, candidate-facing exam-taking UI, Live Monitoring, Reports & Analytics, AI Question Generator panel, Bulk Import (CSV) for questions or candidates, rich text/image/equation question editing, dark mode, mobile responsiveness beyond tablet, i18n, custom-domain tenant resolution.
- Testing: every new component gets a Jest + React Testing Library test; the phase ends with one Playwright e2e smoke suite covering the golden path (login → create exam → add section → add questions → publish → add candidate → invite) run against a real dev-mode `apps/api`.

---

### Task 1: Backend fix — `/auth/refresh` and `/auth/logout` httpOnly-cookie fallback

**Files:**
- Modify: `apps/api/src/auth/dto/refresh.dto.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Test: `apps/api/test/auth-refresh-cookie.e2e-spec.ts` (new)

**Interfaces:**
- Consumes: `AuthService.refresh(refreshToken: string): Promise<TokenPair>`, `AuthService.logout(refreshToken: string): Promise<void>` (both already exist, unchanged).
- Produces: `POST /auth/refresh` and `POST /auth/logout` now succeed with **no request body** as long as the browser sent the `refresh_token` cookie (set by a prior login). Every later task's frontend auth code relies on this.

- [ ] **Step 1: Write the failing e2e test**

Create `apps/api/test/auth-refresh-cookie.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';

describe('Auth refresh/logout accept the httpOnly cookie with no request body', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `refresh-cookie-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;
    const org = await prisma.organization.create({
      data: { name: 'Refresh Cookie Org', slug: `refresh-cookie-org-${randomUUID()}`, planId },
    });
    orgId = org.id;

    const passwordHash = await argon2.hash('RecruiterPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({
        data: { organizationId: orgId, email: 'recruiter@refresh-cookie.test', passwordHash, role: 'recruiter' },
      }),
    );
  });

  afterAll(async () => {
    await tenantPrisma
      .forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }))
      .catch(() => undefined);
    await tenantPrisma
      .forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.user.deleteMany({ where: { organizationId: orgId } }))
      .catch(() => undefined);
    await tenantPrisma
      .forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.organization.delete({ where: { id: orgId } }))
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('refreshes using only the httpOnly cookie, with no body, then logs out the same way', async () => {
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ organizationSlug: org.slug, email: 'recruiter@refresh-cookie.test', password: 'RecruiterPassw0rd!' })
      .expect(200);
    const cookies = loginResponse.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('refresh_token='))).toBe(true);

    const refreshResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookies)
      .send({})
      .expect(200);
    expect(refreshResponse.body.accessToken).toEqual(expect.any(String));
    const rotatedCookies = refreshResponse.headers['set-cookie'] as unknown as string[];
    expect(rotatedCookies.some((c) => c.startsWith('refresh_token='))).toBe(true);

    await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Cookie', rotatedCookies).send({}).expect(200);
  });

  it('rejects refresh with 401 when neither body nor cookie provide a token', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({}).expect(401);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (with `DATABASE_URL` exported, value in `apps/api/.env`):
```bash
npm run test:api:e2e -- --testPathPattern=auth-refresh-cookie
```
Expected: FAIL — the first test gets 401 on `/auth/refresh` because the controller currently requires `refreshToken` in the body (`ValidationPipe` rejects the empty `{}` body with 400, or `RefreshDto`'s current `@IsString()` on a required field fails validation).

- [ ] **Step 3: Widen `RefreshDto`**

Modify `apps/api/src/auth/dto/refresh.dto.ts`:

```ts
import { IsOptional, IsString } from 'class-validator';

export class RefreshDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
```

- [ ] **Step 4: Read the token from the cookie when the body omits it**

Modify `apps/api/src/auth/auth.controller.ts`:

```ts
import { Body, Controller, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';

const REFRESH_COOKIE = 'refresh_token';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('staff/login')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.login(dto);
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, { httpOnly: true, sameSite: 'lax', secure: false });
    return { accessToken: tokens.accessToken };
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  async refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = dto.refreshToken ?? req.cookies?.[REFRESH_COOKIE];
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token required');
    }
    const tokens = await this.authService.refresh(refreshToken);
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, { httpOnly: true, sameSite: 'lax', secure: false });
    return { accessToken: tokens.accessToken };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = dto.refreshToken ?? req.cookies?.[REFRESH_COOKIE];
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    res.clearCookie(REFRESH_COOKIE);
    return { success: true };
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
npm run test:api:e2e -- --testPathPattern=auth-refresh-cookie
```
Expected: PASS, 2/2.

- [ ] **Step 6: Run the full apps/api unit + e2e suites**

Run: `npm run test:api && npm run test:api:e2e -- --runInBand`
Expected: PASS, no regressions (baseline going into this phase: 214/214 unit, 81/81 e2e — expect 81 + 2 = 83 e2e after this task; the auth.service.spec.ts argon2-timeout flake documented in prior phases is a known non-regression if it appears in the unit run only).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/auth/dto/refresh.dto.ts apps/api/src/auth/auth.controller.ts apps/api/test/auth-refresh-cookie.e2e-spec.ts
git commit -m "fix: let /auth/refresh and /auth/logout read the httpOnly cookie

RefreshDto.refreshToken is now optional; both endpoints fall back to
req.cookies.refresh_token when the body omits it. Previously a browser
client could never call refresh at all -- the cookie is httpOnly (JS
can't read its value to put in the body), but the endpoint required
the body field. This blocks Frontend Phase 1's session-persistence
work, which relies on a cookie-only silent refresh on page load."
```

---

### Task 2: Frontend tooling — Tailwind, Radix, TanStack Query, Jest/RTL, Playwright

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.js`
- Create: `apps/web/app/globals.css`
- Modify: `apps/web/app/layout.tsx`
- Create: `apps/web/jest.config.ts`
- Create: `apps/web/jest.setup.ts`
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/.gitkeep`

**Interfaces:**
- Consumes: nothing (foundation task).
- Produces: `npm run test` (Jest), `npm run test:e2e` (Playwright) scripts in `apps/web/package.json`; `app/globals.css` imported by the root layout so every later component can use Tailwind utility classes; a `QueryClientProvider` wrapping the app (client component `apps/web/lib/query-provider.tsx`) that Task 5 wires real auth logic into.

- [ ] **Step 1: Install dependencies**

```bash
npm install --workspace=apps/web tailwindcss postcss autoprefixer clsx @tanstack/react-query @radix-ui/react-dialog @radix-ui/react-toast @radix-ui/react-tabs @radix-ui/react-dropdown-menu @radix-ui/react-checkbox @radix-ui/react-radio-group @radix-ui/react-select
npm install --workspace=apps/web -D jest jest-environment-jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event ts-jest @types/jest @playwright/test
```

- [ ] **Step 2: Configure Tailwind**

Create `apps/web/tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary, #1a73e8)',
        accent: 'var(--color-accent, #fbbc04)',
      },
      spacing: {
        4.5: '18px',
      },
    },
  },
  plugins: [],
};

export default config;
```

Create `apps/web/postcss.config.js`:

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

Create `apps/web/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --color-primary: #1a73e8;
  --color-accent: #fbbc04;
}
```

- [ ] **Step 3: Wire globals.css and QueryClientProvider into the root layout**

Create `apps/web/lib/query-provider.tsx`:

```tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

Modify `apps/web/app/layout.tsx`:

```tsx
import './globals.css';
import { AuthProvider } from '../lib/auth-context';
import { QueryProvider } from '../lib/query-provider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Configure Jest**

Create `apps/web/jest.config.ts`:

```ts
import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEach: [],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json', jsx: 'react-jsx' }] },
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  moduleNameMapper: { '\\.(css|less|scss)$': '<rootDir>/jest.style-mock.ts' },
};

export default config;
```

Create `apps/web/jest.setup.ts`:

```ts
import '@testing-library/jest-dom';
```

Create `apps/web/jest.style-mock.ts`:

```ts
export default {};
```

Add to `apps/web/package.json`'s `"scripts"`:

```json
"test": "jest",
"test:e2e": "playwright test"
```

- [ ] **Step 5: Configure Playwright**

Create `apps/web/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.WEB_BASE_URL ?? 'http://localhost:3000',
  },
});
```

Create `apps/web/e2e/.gitkeep` (empty file — the golden-path spec lands in Task 11):

```

```

- [ ] **Step 6: Verify the build and dev server still work**

Run:
```bash
npm run build --workspace=apps/web
```
Expected: exit 0. (No test to run yet — this task adds tooling, not testable behavior; Task 3's component tests are the first real Jest run.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/tailwind.config.ts apps/web/postcss.config.js apps/web/app/globals.css apps/web/app/layout.tsx apps/web/lib/query-provider.tsx apps/web/jest.config.ts apps/web/jest.setup.ts apps/web/jest.style-mock.ts apps/web/playwright.config.ts apps/web/e2e/.gitkeep
git commit -m "chore: add Tailwind, Radix, TanStack Query, Jest/RTL, and Playwright to apps/web

Foundation for Frontend Phase 1 -- no product behavior yet. Tenant
primary/accent colors are wired as CSS custom properties on :root with
Tailwind's config reading them, so Task 6's theming work only needs to
set the two variables, not touch every component."
```

---

### Task 3: Design system — core primitives (Button, Input, Select, Checkbox, Radio, Badge, Card)

**Files:**
- Create: `apps/web/components/ui/Button.tsx`
- Create: `apps/web/components/ui/Input.tsx`
- Create: `apps/web/components/ui/Select.tsx`
- Create: `apps/web/components/ui/Checkbox.tsx`
- Create: `apps/web/components/ui/Radio.tsx`
- Create: `apps/web/components/ui/Badge.tsx`
- Create: `apps/web/components/ui/Card.tsx`
- Create: `apps/web/components/ui/index.ts`
- Test: `apps/web/components/ui/Button.test.tsx`
- Test: `apps/web/components/ui/Input.test.tsx`
- Test: `apps/web/components/ui/Select.test.tsx`
- Test: `apps/web/components/ui/Checkbox.test.tsx`
- Test: `apps/web/components/ui/Radio.test.tsx`
- Test: `apps/web/components/ui/Badge.test.tsx`
- Test: `apps/web/components/ui/Card.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks besides Tailwind config (Task 2).
- Produces: `Button`, `Input`, `Select` (with `SelectOption { value: string; label: string }`), `Checkbox`, `Radio` (with `RadioGroup`/`RadioGroupItem`), `Badge` (with `variant: 'default' | 'success' | 'warning' | 'danger'`), `Card` — all exported from `apps/web/components/ui/index.ts`. Every later screen task imports from this barrel file.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/ui/Button.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders its children and responds to clicks', () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Save</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled and unclickable when the disabled prop is set', () => {
    const onClick = jest.fn();
    render(
      <Button onClick={onClick} disabled>
        Save
      </Button>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
```

Create `apps/web/components/ui/Input.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from './Input';

describe('Input', () => {
  it('reflects typed value via onChange', () => {
    const onChange = jest.fn();
    render(<Input label="Email" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@test.com' } });
    expect(onChange).toHaveBeenCalledWith('a@test.com');
  });

  it('shows an error message when provided', () => {
    render(<Input label="Email" value="" onChange={() => {}} error="Required" />);
    expect(screen.getByText('Required')).toBeInTheDocument();
  });
});
```

Create `apps/web/components/ui/Select.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from './Select';

describe('Select', () => {
  it('calls onChange with the selected option value', async () => {
    const onChange = jest.fn();
    render(
      <Select
        label="Difficulty"
        value="easy"
        onChange={onChange}
        options={[
          { value: 'easy', label: 'Easy' },
          { value: 'hard', label: 'Hard' },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Difficulty' }));
    await userEvent.click(screen.getByRole('option', { name: 'Hard' }));
    expect(onChange).toHaveBeenCalledWith('hard');
  });
});
```

Create `apps/web/components/ui/Checkbox.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
  it('toggles checked state via onChange', async () => {
    const onChange = jest.fn();
    render(<Checkbox label="Correct answer" checked={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Correct answer' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
```

Create `apps/web/components/ui/Radio.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RadioGroup, RadioGroupItem } from './Radio';

describe('RadioGroup', () => {
  it('calls onChange with the selected item value', async () => {
    const onChange = jest.fn();
    render(
      <RadioGroup value="easy" onChange={onChange}>
        <RadioGroupItem value="easy" label="Easy" />
        <RadioGroupItem value="hard" label="Hard" />
      </RadioGroup>,
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Hard' }));
    expect(onChange).toHaveBeenCalledWith('hard');
  });
});
```

Create `apps/web/components/ui/Badge.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders its label and applies the variant class', () => {
    render(<Badge variant="success">Published</Badge>);
    const badge = screen.getByText('Published');
    expect(badge.className).toContain('success');
  });
});
```

Create `apps/web/components/ui/Card.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { Card } from './Card';

describe('Card', () => {
  it('renders its children inside a bordered container', () => {
    render(<Card>Content</Card>);
    expect(screen.getByText('Content')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/web`
Expected: FAIL — every test file errors with "Cannot find module './Button'" (etc.), none of the components exist yet.

- [ ] **Step 3: Implement the components**

Create `apps/web/components/ui/Button.tsx`:

```tsx
import { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:opacity-90',
  secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};

export function Button({ variant = 'primary', className, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        'rounded px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASSES[variant],
        className,
      )}
      disabled={disabled}
      {...props}
    />
  );
}
```

Create `apps/web/components/ui/Input.tsx`:

```tsx
import { InputHTMLAttributes, useId } from 'react';
import clsx from 'clsx';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function Input({ label, value, onChange, error, className, id, ...props }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={clsx(
          'rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none',
          error && 'border-red-500',
          className,
        )}
        aria-invalid={Boolean(error)}
        {...props}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
```

Create `apps/web/components/ui/Select.tsx`:

```tsx
'use client';

import * as RadixSelect from '@radix-ui/react-select';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
}

export function Select({ label, value, onChange, options }: SelectProps) {
  const selected = options.find((option) => option.value === value);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <RadixSelect.Root value={value} onValueChange={onChange}>
        <RadixSelect.Trigger
          aria-label={label}
          className="flex items-center justify-between rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <RadixSelect.Value>{selected?.label ?? ''}</RadixSelect.Value>
          <RadixSelect.Icon>▾</RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content className="rounded border border-gray-200 bg-white shadow-md">
            <RadixSelect.Viewport>
              {options.map((option) => (
                <RadixSelect.Item
                  key={option.value}
                  value={option.value}
                  className="cursor-pointer px-3 py-2 text-sm outline-none data-[highlighted]:bg-gray-100"
                >
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    </div>
  );
}
```

Create `apps/web/components/ui/Checkbox.tsx`:

```tsx
'use client';

import * as RadixCheckbox from '@radix-ui/react-checkbox';
import { useId } from 'react';

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Checkbox({ label, checked, onChange }: CheckboxProps) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <RadixCheckbox.Root
        id={id}
        checked={checked}
        onCheckedChange={(state) => onChange(state === true)}
        aria-label={label}
        className="h-4 w-4 rounded border border-gray-400 data-[state=checked]:bg-primary"
      >
        <RadixCheckbox.Indicator className="flex items-center justify-center text-white text-xs">✓</RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      <label htmlFor={id} className="text-sm text-gray-700">
        {label}
      </label>
    </div>
  );
}
```

Create `apps/web/components/ui/Radio.tsx`:

```tsx
'use client';

import * as RadixRadioGroup from '@radix-ui/react-radio-group';
import { ReactNode, useId } from 'react';

interface RadioGroupProps {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}

export function RadioGroup({ value, onChange, children }: RadioGroupProps) {
  return (
    <RadixRadioGroup.Root value={value} onValueChange={onChange} className="flex flex-col gap-2">
      {children}
    </RadixRadioGroup.Root>
  );
}

interface RadioGroupItemProps {
  value: string;
  label: string;
}

export function RadioGroupItem({ value, label }: RadioGroupItemProps) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <RadixRadioGroup.Item
        id={id}
        value={value}
        aria-label={label}
        className="h-4 w-4 rounded-full border border-gray-400 data-[state=checked]:border-primary"
      >
        <RadixRadioGroup.Indicator className="flex h-full w-full items-center justify-center after:h-2 after:w-2 after:rounded-full after:bg-primary" />
      </RadixRadioGroup.Item>
      <label htmlFor={id} className="text-sm text-gray-700">
        {label}
      </label>
    </div>
  );
}
```

Create `apps/web/components/ui/Badge.tsx`:

```tsx
import { ReactNode } from 'react';
import clsx from 'clsx';

type Variant = 'default' | 'success' | 'warning' | 'danger';

const VARIANT_CLASSES: Record<Variant, string> = {
  default: 'bg-gray-100 text-gray-800',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
};

export function Badge({ variant = 'default', children }: { variant?: Variant; children: ReactNode }) {
  return (
    <span className={clsx('inline-block rounded-full px-2 py-0.5 text-xs font-medium', VARIANT_CLASSES[variant])}>
      {children}
    </span>
  );
}
```

Create `apps/web/components/ui/Card.tsx`:

```tsx
import { ReactNode } from 'react';
import clsx from 'clsx';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('rounded-lg border border-gray-200 bg-white p-4 shadow-sm', className)}>{children}</div>;
}
```

Create `apps/web/components/ui/index.ts`:

```ts
export { Button } from './Button';
export { Input } from './Input';
export { Select, type SelectOption } from './Select';
export { Checkbox } from './Checkbox';
export { RadioGroup, RadioGroupItem } from './Radio';
export { Badge } from './Badge';
export { Card } from './Card';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=apps/web`
Expected: PASS, 8/8 (2 Button + 2 Input + 1 Select + 1 Checkbox + 1 Radio + 1 Badge + 1 Card).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ui
git commit -m "feat: add core design-system primitives (Button, Input, Select, Checkbox, Radio, Badge, Card)

Built on Radix UI primitives (Select, Checkbox, RadioGroup) for
accessible focus/keyboard handling where Radix provides one; Button,
Input, Badge, Card are plain elements styled with Tailwind. Colors
reference the primary/accent CSS variables from Task 2 so tenant
branding (Task 6) requires no per-component changes."
```

---

### Task 4: Design system — interactive primitives (Modal, Toast, Tabs, Dropdown Menu, Table)

**Files:**
- Create: `apps/web/components/ui/Modal.tsx`
- Create: `apps/web/components/ui/Toast.tsx`
- Create: `apps/web/components/ui/Tabs.tsx`
- Create: `apps/web/components/ui/DropdownMenu.tsx`
- Create: `apps/web/components/ui/Table.tsx`
- Modify: `apps/web/components/ui/index.ts`
- Modify: `apps/web/app/layout.tsx`
- Test: `apps/web/components/ui/Modal.test.tsx`
- Test: `apps/web/components/ui/Toast.test.tsx`
- Test: `apps/web/components/ui/Tabs.test.tsx`
- Test: `apps/web/components/ui/DropdownMenu.test.tsx`
- Test: `apps/web/components/ui/Table.test.tsx`

**Interfaces:**
- Consumes: `apps/web/components/ui/index.ts` barrel from Task 3 (extends it).
- Produces: `Modal`, `ToastProvider` + `useToast()` hook (`{ toast: (message: string, variant?: 'success' | 'error') => void }`), `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`, `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/`DropdownMenuItem`, `Table<T>` (generic, `Column<T>` type) — all exported from the same barrel. `ToastProvider` wraps the root layout so every later screen can call `useToast()`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/ui/Modal.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from './Modal';

describe('Modal', () => {
  it('renders its content when open and calls onClose when dismissed', () => {
    const onClose = jest.fn();
    render(
      <Modal open title="Add question" onClose={onClose}>
        <p>Modal body</p>
      </Modal>,
    );
    expect(screen.getByText('Modal body')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when closed', () => {
    render(
      <Modal open={false} title="Add question" onClose={() => {}}>
        <p>Modal body</p>
      </Modal>,
    );
    expect(screen.queryByText('Modal body')).not.toBeInTheDocument();
  });
});
```

Create `apps/web/components/ui/Toast.test.tsx`:

```tsx
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from './Toast';

function Trigger() {
  const { toast } = useToast();
  return <button onClick={() => toast('Exam published', 'success')}>Fire</button>;
}

describe('Toast', () => {
  it('shows a toast message after it is triggered', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Fire' }));
    expect(await screen.findByText('Exam published')).toBeInTheDocument();
  });
});
```

Create `apps/web/components/ui/Tabs.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './Tabs';

describe('Tabs', () => {
  it('switches visible content when a different tab is selected', async () => {
    render(
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="sections">Sections</TabsTrigger>
        </TabsList>
        <TabsContent value="details">Details panel</TabsContent>
        <TabsContent value="sections">Sections panel</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText('Details panel')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Sections' }));
    expect(screen.getByText('Sections panel')).toBeInTheDocument();
  });
});
```

Create `apps/web/components/ui/DropdownMenu.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from './DropdownMenu';

describe('DropdownMenu', () => {
  it('opens and fires the item action on click', async () => {
    const onSelect = jest.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onSelect}>Archive</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
    await userEvent.click(await screen.findByText('Archive'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
```

Create `apps/web/components/ui/Table.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Table, type Column } from './Table';

interface Row {
  id: string;
  name: string;
  score: number;
}

const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', render: (row) => row.name, sortValue: (row) => row.name },
  { key: 'score', header: 'Score', render: (row) => String(row.score), sortValue: (row) => row.score },
];
const rows: Row[] = [
  { id: '1', name: 'Bravo', score: 10 },
  { id: '2', name: 'Alpha', score: 20 },
];

describe('Table', () => {
  it('renders every row and sorts ascending when a sortable header is clicked', () => {
    render(<Table columns={columns} rows={rows} rowKey={(row) => row.id} />);
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + 2 rows
    fireEvent.click(screen.getByText('Name'));
    const cells = screen.getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('Alpha');
  });

  it('shows the empty message when there are no rows', () => {
    render(<Table columns={columns} rows={[]} rowKey={(row) => row.id} emptyMessage="No candidates yet." />);
    expect(screen.getByText('No candidates yet.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/web`
Expected: FAIL — 5 new "Cannot find module" errors, existing Task 3 tests still pass.

- [ ] **Step 3: Implement the components**

Create `apps/web/components/ui/Modal.tsx`:

```tsx
'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ open, title, onClose, children }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-lg">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
            <Dialog.Close aria-label="Close" className="text-gray-500 hover:text-gray-800">
              ✕
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

Create `apps/web/components/ui/Toast.tsx`:

```tsx
'use client';

import * as RadixToast from '@radix-ui/react-toast';
import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import clsx from 'clsx';

type Variant = 'success' | 'error';

interface ToastItem {
  id: number;
  message: string;
  variant: Variant;
}

interface ToastContextValue {
  toast: (message: string, variant?: Variant) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, variant: Variant = 'success') => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current, { id, message, variant }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <RadixToast.Provider swipeDirection="right">
        {children}
        {items.map((item) => (
          <RadixToast.Root
            key={item.id}
            duration={4000}
            onOpenChange={(open) => !open && dismiss(item.id)}
            className={clsx(
              'rounded px-4 py-3 text-sm shadow-md',
              item.variant === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white',
            )}
          >
            <RadixToast.Description>{item.message}</RadixToast.Description>
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport className="fixed bottom-4 right-4 flex flex-col gap-2" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
```

Create `apps/web/components/ui/Tabs.tsx`:

```tsx
'use client';

import * as RadixTabs from '@radix-ui/react-tabs';
import { ReactNode } from 'react';
import clsx from 'clsx';

export function Tabs({
  defaultValue,
  value,
  onValueChange,
  children,
}: {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <RadixTabs.Root defaultValue={defaultValue} value={value} onValueChange={onValueChange}>
      {children}
    </RadixTabs.Root>
  );
}

export function TabsList({ children }: { children: ReactNode }) {
  return <RadixTabs.List className="flex gap-1 border-b border-gray-200">{children}</RadixTabs.List>;
}

export function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  return (
    <RadixTabs.Trigger
      value={value}
      className={clsx(
        'px-3 py-2 text-sm font-medium text-gray-600 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary',
      )}
    >
      {children}
    </RadixTabs.Trigger>
  );
}

export function TabsContent({ value, children }: { value: string; children: ReactNode }) {
  return <RadixTabs.Content value={value} className="py-4">{children}</RadixTabs.Content>;
}
```

Create `apps/web/components/ui/DropdownMenu.tsx`:

```tsx
'use client';

import * as RadixDropdown from '@radix-ui/react-dropdown-menu';
import { ReactNode } from 'react';

export function DropdownMenu({ children }: { children: ReactNode }) {
  return <RadixDropdown.Root>{children}</RadixDropdown.Root>;
}

export function DropdownMenuTrigger({ children }: { children: ReactNode }) {
  return (
    <RadixDropdown.Trigger asChild={false} className="rounded border border-gray-300 px-3 py-2 text-sm">
      {children}
    </RadixDropdown.Trigger>
  );
}

export function DropdownMenuContent({ children }: { children: ReactNode }) {
  return (
    <RadixDropdown.Portal>
      <RadixDropdown.Content className="rounded border border-gray-200 bg-white p-1 shadow-md" sideOffset={4}>
        {children}
      </RadixDropdown.Content>
    </RadixDropdown.Portal>
  );
}

export function DropdownMenuItem({ children, onSelect }: { children: ReactNode; onSelect: () => void }) {
  return (
    <RadixDropdown.Item
      onSelect={onSelect}
      className="cursor-pointer rounded px-3 py-2 text-sm outline-none data-[highlighted]:bg-gray-100"
    >
      {children}
    </RadixDropdown.Item>
  );
}
```

Create `apps/web/components/ui/Table.tsx`:

```tsx
'use client';

import { ReactNode, useState } from 'react';
import clsx from 'clsx';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
}

interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
}

export function Table<T>({ columns, rows, rowKey, emptyMessage = 'No results.' }: TableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const sorted = [...rows].sort((a, b) => {
    if (!sortKey) return 0;
    const column = columns.find((c) => c.key === sortKey);
    if (!column?.sortValue) return 0;
    const av = column.sortValue(a);
    const bv = column.sortValue(b);
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  function handleSort(column: Column<T>) {
    if (!column.sortValue) return;
    if (sortKey === column.key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(column.key);
      setSortDir('asc');
    }
  }

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">{emptyMessage}</p>;
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-gray-200 text-left">
          {columns.map((column) => (
            <th
              key={column.key}
              className={clsx('px-3 py-2 font-medium text-gray-600', column.sortValue && 'cursor-pointer select-none')}
              onClick={() => handleSort(column)}
            >
              {column.header}
              {sortKey === column.key && (sortDir === 'asc' ? ' ↑' : ' ↓')}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => (
          <tr key={rowKey(row)} className="border-b border-gray-100 last:border-0">
            {columns.map((column) => (
              <td key={column.key} className="px-3 py-2">
                {column.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Modify `apps/web/components/ui/index.ts` — add:

```ts
export { Modal } from './Modal';
export { ToastProvider, useToast } from './Toast';
export { Tabs, TabsList, TabsTrigger, TabsContent } from './Tabs';
export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from './DropdownMenu';
export { Table, type Column } from './Table';
```

Modify `apps/web/app/layout.tsx` to wrap children in `ToastProvider`:

```tsx
import './globals.css';
import { AuthProvider } from '../lib/auth-context';
import { QueryProvider } from '../lib/query-provider';
import { ToastProvider } from '../components/ui';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
          </ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=apps/web`
Expected: PASS, 15/15 (8 from Task 3 + 2 Modal + 1 Toast + 1 Tabs + 1 DropdownMenu + 2 Table).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ui apps/web/app/layout.tsx
git commit -m "feat: add interactive design-system primitives (Modal, Toast, Tabs, Dropdown Menu, Table)

Modal/Tabs/DropdownMenu wrap Radix Dialog/Tabs/DropdownMenu for
accessible focus/keyboard handling; Toast is a small custom context on
top of Radix's Toast primitive with a useToast() hook every later
screen can call after a mutation. Table is a generic, presentational
component -- filtering stays screen-owned since filters differ per
resource, Table only handles column rendering and client-side sort."
```

---

### Task 5: Auth/session rework — silent refresh, 401 retry-once, tenant-slug-aware branding

**Files:**
- Modify: `apps/web/lib/api-client.ts`
- Modify: `apps/web/lib/auth-context.tsx`
- Create: `apps/web/lib/types.ts`
- Create: `apps/web/lib/hooks/useBranding.ts`
- Test: `apps/web/lib/api-client.test.ts`
- Test: `apps/web/lib/auth-context.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` (existing signature, extended in place), Task 1's now-working cookie-based `/auth/refresh`.
- Produces: `apiFetch(path, options?, accessToken?)` (unchanged call signature, now retries once on 401 via a registered handler); `useAuth()` returning `{ accessToken: string | null; organizationSlug: string | null; isLoading: boolean; login: (organizationSlug: string, accessToken: string) => void; logout: () => Promise<void> }`; `useBranding()` — a TanStack Query hook every later screen/layout uses for tenant theming. `apps/web/lib/types.ts` defines every shared TypeScript type later tasks import (`Exam`, `ExamSection`, `Question`, `QuestionOption`, `Tag`, `Candidate`, `Invitation`, `BulkInviteResult`, `BrandingResponse`, and the string-literal unions `QuestionType`, `Difficulty`, `ExamStatus`, `InvitationStatus`).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/lib/api-client.test.ts`:

```ts
import { apiFetch, setUnauthorizedHandler } from './api-client';

describe('apiFetch', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    setUnauthorizedHandler(null);
  });

  it('retries once with a fresh token after a 401, using the registered unauthorized handler', async () => {
    const calls: (string | undefined)[] = [];
    global.fetch = jest.fn(async (_url, options) => {
      const auth = (options?.headers as Record<string, string>)?.Authorization;
      calls.push(auth);
      const status = auth === 'Bearer old' ? 401 : 200;
      return new Response(JSON.stringify({ ok: true }), { status });
    }) as unknown as typeof fetch;

    setUnauthorizedHandler(async () => 'new');

    const result = await apiFetch('/exams', {}, 'old');
    expect(calls).toEqual(['Bearer old', 'Bearer new']);
    expect(result).toEqual({ ok: true });
  });

  it('throws with the server-provided message when a request fails and is not a retryable 401', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ message: 'Not found' }), { status: 404 })) as unknown as typeof fetch;

    await expect(apiFetch('/exams/missing')).rejects.toThrow('Not found');
  });
});
```

Create `apps/web/lib/auth-context.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './auth-context';

function Probe() {
  const { accessToken, organizationSlug, isLoading } = useAuth();
  if (isLoading) return <p>Loading</p>;
  return <p>{accessToken ? `token:${accessToken}` : 'no-token'} slug:{organizationSlug ?? 'none'}</p>;
}

describe('AuthProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('silently refreshes on mount and exposes the resulting access token', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'refreshed-token' }), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText(/token:refreshed-token/)).toBeInTheDocument());
  });

  it('leaves accessToken null when the silent refresh fails (no prior session)', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ message: 'Refresh token required' }), { status: 401 })) as unknown as typeof fetch;

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('no-token slug:none')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/web -- api-client auth-context`
Expected: FAIL — `setUnauthorizedHandler` is not exported, `isLoading`/`organizationSlug` don't exist on the current `useAuth()` context shape.

- [ ] **Step 3: Implement `lib/types.ts`**

Create `apps/web/lib/types.ts`:

```ts
export type QuestionType = 'single_mcq' | 'multi_mcq' | 'true_false';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type ExamStatus = 'draft' | 'published' | 'archived';
export type InvitationStatus = 'invited' | 'revoked';

export interface Tag {
  id: string;
  name: string;
}

export interface QuestionOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  topic: string | null;
  category: string | null;
  difficulty: Difficulty;
  marks: number;
  negativeMarks: number;
  status: 'active' | 'archived';
  aiGenerated: boolean;
  createdAt: string;
  options: QuestionOption[];
  tags?: Tag[];
}

export interface ExamSection {
  id: string;
  examId: string;
  title: string;
  orderIndex: number;
  selectionMode: 'fixed' | 'pool';
  poolSize: number | null;
  poolDifficulty: Difficulty | null;
  targetDurationMinutes: number | null;
}

export interface Exam {
  id: string;
  title: string;
  instructions: string | null;
  status: ExamStatus;
  durationMinutes: number;
  passCriteriaPercent: number;
  randomizeOrder: boolean;
  createdAt: string;
  sections: ExamSection[];
}

export interface Candidate {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  createdAt: string;
  erasedAt: string | null;
}

export interface Invitation {
  id: string;
  examId: string;
  candidateId: string;
  status: InvitationStatus;
  invitedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  candidate: Candidate;
}

export interface BulkInviteResult {
  created: (Invitation & { token: string })[];
  skipped: { candidateId: string; reason: string }[];
}

export interface BrandingResponse {
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
}
```

- [ ] **Step 4: Implement `apiFetch` with 401 retry-once**

Modify `apps/web/lib/api-client.ts`:

```ts
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';

let unauthorizedHandler: (() => Promise<string | null>) | null = null;

export function setUnauthorizedHandler(handler: (() => Promise<string | null>) | null) {
  unauthorizedHandler = handler;
}

async function doFetch(path: string, options: RequestInit, accessToken?: string): Promise<Response> {
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' });
}

export async function apiFetch(path: string, options: RequestInit = {}, accessToken?: string) {
  let response = await doFetch(path, options, accessToken);

  if (response.status === 401 && unauthorizedHandler) {
    const freshToken = await unauthorizedHandler();
    if (freshToken) {
      response = await doFetch(path, options, freshToken);
    }
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed with status ${response.status}`);
  }
  return response.json();
}
```

- [ ] **Step 5: Implement the rewritten `AuthProvider`**

Modify `apps/web/lib/auth-context.tsx`:

```tsx
'use client';

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { apiFetch, setUnauthorizedHandler } from './api-client';

interface AuthContextValue {
  accessToken: string | null;
  organizationSlug: string | null;
  isLoading: boolean;
  login: (organizationSlug: string, accessToken: string) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const SLUG_STORAGE_KEY = 'organizationSlug';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [organizationSlug, setOrganizationSlug] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const accessTokenRef = useRef<string | null>(null);
  accessTokenRef.current = accessToken;

  async function silentRefresh(): Promise<string | null> {
    try {
      const result = await apiFetch('/auth/refresh', { method: 'POST', body: JSON.stringify({}) });
      setAccessToken(result.accessToken);
      return result.accessToken;
    } catch {
      setAccessToken(null);
      return null;
    }
  }

  useEffect(() => {
    setUnauthorizedHandler(silentRefresh);
    const storedSlug = typeof window !== 'undefined' ? window.sessionStorage.getItem(SLUG_STORAGE_KEY) : null;
    if (storedSlug) {
      setOrganizationSlug(storedSlug);
    }
    silentRefresh().finally(() => setIsLoading(false));
    return () => setUnauthorizedHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function login(slug: string, token: string) {
    setOrganizationSlug(slug);
    setAccessToken(token);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(SLUG_STORAGE_KEY, slug);
    }
  }

  async function logout() {
    await apiFetch('/auth/logout', { method: 'POST', body: JSON.stringify({}) }).catch(() => undefined);
    setAccessToken(null);
    setOrganizationSlug(null);
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(SLUG_STORAGE_KEY);
    }
  }

  return (
    <AuthContext.Provider value={{ accessToken, organizationSlug, isLoading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

Note: `organizationSlug` is stored in `sessionStorage` (not `localStorage`, cleared when the tab closes) purely so a page refresh can re-fetch the *public* branding endpoint by slug — it is not a credential and carries no security weight; the access token itself stays in memory only, never persisted.

- [ ] **Step 6: Implement `useBranding()`**

Create `apps/web/lib/hooks/useBranding.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { BrandingResponse } from '../types';

export function useBranding(organizationSlug: string | null) {
  return useQuery<BrandingResponse>({
    queryKey: ['branding', organizationSlug],
    queryFn: () => apiFetch(`/organizations/by-slug/${organizationSlug}/branding`),
    enabled: Boolean(organizationSlug),
  });
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test --workspace=apps/web`
Expected: PASS, 19/19 (15 from Tasks 3-4 + 2 api-client + 2 auth-context).

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/api-client.ts apps/web/lib/auth-context.tsx apps/web/lib/types.ts apps/web/lib/hooks/useBranding.ts apps/web/lib/api-client.test.ts apps/web/lib/auth-context.test.tsx
git commit -m "feat: session persistence via silent cookie-based refresh, 401 retry-once, shared types

AuthProvider silently calls /auth/refresh on mount (relies on Task 1's
cookie fallback) instead of losing the session on every page reload.
apiFetch retries once on any 401 using a registered unauthorized
handler, so an access token expiring mid-session self-heals instead of
erroring. organizationSlug is cached in sessionStorage (not a
credential) so the public by-slug branding endpoint -- the only one
the recruiter role can reach, since recruiter lacks org:manage_settings
-- can be re-queried after a refresh."
```

---

### Task 6: `(recruiter)` layout shell, tenant theming, `/login` rebuild, `/dashboard`

**Files:**
- Create: `apps/web/app/(recruiter)/layout.tsx`
- Modify: `apps/web/app/login/page.tsx`
- Modify: `apps/web/app/dashboard/page.tsx` → moved to `apps/web/app/(recruiter)/dashboard/page.tsx`
- Modify: `apps/web/app/settings/branding/page.tsx` → moved to `apps/web/app/(recruiter)/settings/branding/page.tsx`
- Create: `apps/web/lib/hooks/useExams.ts`
- Test: `apps/web/app/(recruiter)/layout.test.tsx`
- Test: `apps/web/app/login/page.test.tsx`
- Test: `apps/web/app/(recruiter)/dashboard/page.test.tsx`

**Interfaces:**
- Consumes: `useAuth()`, `useBranding()` (Task 5), `components/ui` barrel (Tasks 3-4).
- Produces: `useExams()`, `useExam(id)` TanStack Query hooks that Tasks 8-9 also use; the `(recruiter)` layout's sidebar nav pattern that Tasks 7, 8, 10 all render inside.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/(recruiter)/layout.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import RecruiterLayout from './layout';
import { AuthProvider } from '../../lib/auth-context';
import { QueryProvider } from '../../lib/query-provider';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('Recruiter layout', () => {
  it('renders the sidebar nav links', () => {
    render(
      <QueryProvider>
        <AuthProvider>
          <RecruiterLayout>
            <p>Page content</p>
          </RecruiterLayout>
        </AuthProvider>
      </QueryProvider>,
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Exams' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Question Bank' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Candidates' })).toBeInTheDocument();
  });
});
```

Create `apps/web/app/login/page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './page';
import { AuthProvider } from '../../lib/auth-context';
import { QueryProvider } from '../../lib/query-provider';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('LoginPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
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
});
```

Create `apps/web/app/(recruiter)/dashboard/page.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import DashboardPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('DashboardPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('shows exam counts by status once exams load', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams')) {
        return new Response(
          JSON.stringify([
            { id: '1', title: 'A', status: 'draft', sections: [] },
            { id: '2', title: 'B', status: 'published', sections: [] },
            { id: '3', title: 'C', status: 'published', sections: [] },
          ]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <DashboardPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument()); // draft count
    expect(screen.getByText('2')).toBeInTheDocument(); // published count
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/web -- login dashboard layout`
Expected: FAIL — `apps/web/app/(recruiter)/layout.tsx` doesn't exist yet, `LoginPage` doesn't have an `organizationSlug` label association yet, `DashboardPage` doesn't use `useExams()`.

- [ ] **Step 3: Implement `useExams()`**

Create `apps/web/lib/hooks/useExams.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { Exam } from '../types';
import { useAuth } from '../auth-context';

export function useExams(status?: string) {
  const { accessToken } = useAuth();
  return useQuery<Exam[]>({
    queryKey: ['exams', status ?? 'default'],
    queryFn: () => apiFetch(`/exams${status ? `?status=${status}` : ''}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useExam(id: string | null) {
  const { accessToken } = useAuth();
  return useQuery<Exam>({
    queryKey: ['exams', id],
    queryFn: () => apiFetch(`/exams/${id}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && Boolean(id),
  });
}

interface CreateExamInput {
  title: string;
  instructions?: string;
  durationMinutes?: number;
  passCriteriaPercent?: number;
  randomizeOrder?: boolean;
}

export function useCreateExam() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExamInput) =>
      apiFetch('/exams', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exams'] }),
  });
}

export function useUpdateExam(id: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExamInput) =>
      apiFetch(`/exams/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      queryClient.invalidateQueries({ queryKey: ['exams', id] });
    },
  });
}

export function usePublishExam(id: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/exams/${id}/publish`, { method: 'POST' }, accessToken ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      queryClient.invalidateQueries({ queryKey: ['exams', id] });
    },
  });
}
```

- [ ] **Step 4: Implement the `(recruiter)` layout with sidebar nav and tenant theming**

Create `apps/web/app/(recruiter)/layout.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import { useAuth } from '../../lib/auth-context';
import { useBranding } from '../../lib/hooks/useBranding';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/exams', label: 'Exams' },
  { href: '/questions', label: 'Question Bank' },
  { href: '/candidates', label: 'Candidates' },
];

export default function RecruiterLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, organizationSlug, isLoading } = useAuth();
  const { data: branding } = useBranding(organizationSlug);

  useEffect(() => {
    if (!isLoading && !accessToken) {
      router.push('/login');
    }
  }, [isLoading, accessToken, router]);

  const themeStyle = {
    ...(branding?.primaryColor ? { '--color-primary': branding.primaryColor } : {}),
    ...(branding?.accentColor ? { '--color-accent': branding.accentColor } : {}),
  } as React.CSSProperties;

  if (isLoading || !accessToken) {
    return <p className="p-8 text-sm text-gray-500">Loading…</p>;
  }

  return (
    <div style={themeStyle} className="flex min-h-screen">
      <nav className="w-56 shrink-0 border-r border-gray-200 bg-gray-50 p-4">
        {branding?.logoUrl && <img src={branding.logoUrl} alt="Organization logo" className="mb-4 max-h-10" />}
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={clsx(
                  'block rounded px-3 py-2 text-sm font-medium',
                  pathname?.startsWith(item.href) ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100',
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 5: Rebuild `/login`**

Modify `apps/web/app/login/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { Button, Input, Card } from '../../components/ui';
import { useBranding } from '../../lib/hooks/useBranding';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [organizationSlug, setOrganizationSlug] = useState('demo-org');
  const [email, setEmail] = useState('recruiter@demo-org.test');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { data: branding } = useBranding(organizationSlug || null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = await apiFetch('/auth/staff/login', {
        method: 'POST',
        body: JSON.stringify({ organizationSlug: organizationSlug || undefined, email, password }),
      });
      login(organizationSlug, result.accessToken);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-sm">
        {branding?.logoUrl && <img src={branding.logoUrl} alt="Organization logo" className="mb-4 max-h-14" />}
        <h1 className="mb-4 text-xl font-semibold" style={branding?.primaryColor ? { color: branding.primaryColor } : undefined}>
          Staff Login
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input label="Organization slug" value={organizationSlug} onChange={setOrganizationSlug} />
          <Input label="Email" type="email" value={email} onChange={setEmail} required />
          <Input label="Password" type="password" value={password} onChange={setPassword} required />
          <Button type="submit">Log in</Button>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </form>
      </Card>
    </main>
  );
}
```

- [ ] **Step 6: Move and rebuild `/dashboard` and `/settings/branding` under `(recruiter)`**

Delete `apps/web/app/dashboard/page.tsx` and `apps/web/app/settings/branding/page.tsx` (the route group replaces the old top-level routes — Next.js route groups don't add a URL segment, so `/dashboard` and `/settings/branding` still resolve the same way).

Create `apps/web/app/(recruiter)/dashboard/page.tsx`:

```tsx
'use client';

import { useExams } from '../../../lib/hooks/useExams';
import { Card } from '../../../components/ui';

export default function DashboardPage() {
  const { data: exams } = useExams();
  const draftCount = exams?.filter((exam) => exam.status === 'draft').length ?? 0;
  const publishedCount = exams?.filter((exam) => exam.status === 'published').length ?? 0;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <p className="text-sm text-gray-500">Draft exams</p>
          <p className="text-3xl font-semibold">{draftCount}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500">Published exams</p>
          <p className="text-3xl font-semibold">{publishedCount}</p>
        </Card>
      </div>
    </div>
  );
}
```

Create `apps/web/app/(recruiter)/settings/branding/page.tsx` (same behavior as the prior skeleton, restyled on the component library — branding management stays reachable in the nav-less settings path for org_admin users testing this screen manually, even though it's not one of this phase's linked nav items):

```tsx
'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '../../../../lib/api-client';
import { useAuth } from '../../../../lib/auth-context';
import { Button, Input, Card } from '../../../../components/ui';
import { useToast } from '../../../../components/ui';
import { BrandingResponse } from '../../../../lib/types';

export default function BrandingSettingsPage() {
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const [branding, setBranding] = useState<BrandingResponse | null>(null);
  const [primaryColor, setPrimaryColor] = useState('#1a73e8');
  const [accentColor, setAccentColor] = useState('#fbbc04');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch('/organizations/branding', {}, accessToken)
      .then((data: BrandingResponse) => {
        setBranding(data);
        if (data.primaryColor) setPrimaryColor(data.primaryColor);
        if (data.accentColor) setAccentColor(data.accentColor);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load branding'));
  }, [accessToken]);

  async function handleColorsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const updated = await apiFetch(
        '/organizations/branding',
        { method: 'PATCH', body: JSON.stringify({ primaryColor, accentColor }) },
        accessToken ?? undefined,
      );
      setBranding(updated);
      toast('Colors updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update colors');
    }
  }

  async function handleLogoSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!logoFile) return;
    try {
      const formData = new FormData();
      formData.append('file', logoFile);
      const updated = await apiFetch('/organizations/branding/logo', { method: 'POST', body: formData }, accessToken ?? undefined);
      setBranding(updated);
      toast('Logo updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload logo');
    }
  }

  return (
    <Card className="max-w-md">
      <h1 className="mb-4 text-xl font-semibold">Branding Settings</h1>
      {branding?.logoUrl && <img src={branding.logoUrl} alt="Organization logo" className="mb-4 max-h-20" />}
      <form onSubmit={handleColorsSubmit} className="mb-4 flex flex-col gap-3">
        <Input label="Primary color" type="color" value={primaryColor} onChange={setPrimaryColor} />
        <Input label="Accent color" type="color" value={accentColor} onChange={setAccentColor} />
        <Button type="submit">Save colors</Button>
      </form>
      <form onSubmit={handleLogoSubmit} className="flex flex-col gap-3">
        <label className="text-sm font-medium text-gray-700">
          Logo (PNG, JPEG, or SVG, max 2MB)
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
            className="mt-1 block text-sm"
          />
        </label>
        <Button type="submit" variant="secondary">
          Upload logo
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
    </Card>
  );
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test --workspace=apps/web`
Expected: PASS, 22/22 (19 from Tasks 3-5 + 1 layout + 1 login + 1 dashboard).

- [ ] **Step 8: Build check**

Run: `npm run build --workspace=apps/web`
Expected: exit 0 — confirms the route-group move didn't break Next.js's file-based routing.

- [ ] **Step 9: Commit**

```bash
git add apps/web/app apps/web/lib/hooks/useExams.ts
git commit -m "feat: (recruiter) layout shell with sidebar nav + tenant theming, rebuild login/dashboard

Sidebar nav matches the master spec's per-role IA (Dashboard, Exams,
Question Bank, Candidates). Tenant primary/accent colors come from the
PUBLIC by-slug branding endpoint (organizationSlug captured at login),
not the authenticated org:manage_settings-gated one -- the recruiter
role can't reach that endpoint. dashboard/ and settings/branding/ move
under the (recruiter) route group; the group segment doesn't add a URL
path component, so both routes keep their existing URLs."
```

---

### Task 7: Question Bank — list, create, edit

**Files:**
- Create: `apps/web/lib/hooks/useQuestions.ts`
- Create: `apps/web/app/(recruiter)/questions/page.tsx`
- Create: `apps/web/app/(recruiter)/questions/new/page.tsx`
- Create: `apps/web/app/(recruiter)/questions/[id]/edit/page.tsx`
- Create: `apps/web/components/QuestionForm.tsx`
- Test: `apps/web/components/QuestionForm.test.tsx`
- Test: `apps/web/app/(recruiter)/questions/page.test.tsx`

**Interfaces:**
- Consumes: `Question`, `QuestionOption`, `Tag`, `QuestionType`, `Difficulty` types (Task 5); `Table`, `Badge`, `Select`, `Checkbox`, `RadioGroup` (Tasks 3-4); `(recruiter)` layout (Task 6).
- Produces: `useQuestions(filters)`, `useQuestion(id)`, `useCreateQuestion()`, `useUpdateQuestion(id)`, `useTags()` hooks — `useTags()` is reused by Task 9's question picker. `QuestionForm` component (`{ initialQuestion?: Question; tags: Tag[]; onSubmit: (input: QuestionFormValue) => void; submitLabel: string }`) reused identically by both `/questions/new` and `/questions/[id]/edit`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/QuestionForm.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuestionForm } from './QuestionForm';

describe('QuestionForm', () => {
  it('submits a single_mcq question with the marked correct option', async () => {
    const onSubmit = jest.fn();
    render(<QuestionForm tags={[{ id: 'tag-1', name: 'Backend' }]} onSubmit={onSubmit} submitLabel="Create question" />);

    await userEvent.type(screen.getByLabelText('Question text'), 'What is 2+2?');
    await userEvent.type(screen.getByLabelText('Marks'), '5');
    const optionInputs = screen.getAllByLabelText(/Option \d text/);
    await userEvent.type(optionInputs[0], '4');
    await userEvent.type(optionInputs[1], '5');
    await userEvent.click(screen.getAllByRole('radio')[0]); // mark option 1 correct (single_mcq uses radio)
    await userEvent.click(screen.getByRole('button', { name: 'Create question' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'single_mcq',
        text: 'What is 2+2?',
        marks: 5,
        options: [
          { text: '4', isCorrect: true },
          { text: '5', isCorrect: false },
        ],
      }),
    );
  });

  it('pre-fills every field from an initial question for editing', () => {
    render(
      <QuestionForm
        initialQuestion={{
          id: 'q-1',
          type: 'true_false',
          text: 'The sky is blue.',
          topic: null,
          category: null,
          difficulty: 'easy',
          marks: 2,
          negativeMarks: 0,
          status: 'active',
          aiGenerated: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          options: [
            { id: 'o-1', text: 'True', isCorrect: true },
            { id: 'o-2', text: 'False', isCorrect: false },
          ],
        }}
        tags={[]}
        onSubmit={jest.fn()}
        submitLabel="Save"
      />,
    );
    expect(screen.getByLabelText('Question text')).toHaveValue('The sky is blue.');
    expect(screen.getByLabelText('Marks')).toHaveValue(2);
  });
});
```

Create `apps/web/app/(recruiter)/questions/page.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import QuestionsPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('QuestionsPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists questions returned by the API', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/questions')) {
        return new Response(
          JSON.stringify([
            {
              id: 'q-1',
              type: 'single_mcq',
              text: 'What is 2+2?',
              topic: null,
              category: null,
              difficulty: 'easy',
              marks: 5,
              negativeMarks: 0,
              status: 'active',
              aiGenerated: false,
              createdAt: '2026-01-01T00:00:00.000Z',
              options: [],
            },
          ]),
          { status: 200 },
        );
      }
      if (String(url).includes('/tags')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <QuestionsPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('What is 2+2?')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/web -- QuestionForm questions/page`
Expected: FAIL — `QuestionForm` and `QuestionsPage` don't exist.

- [ ] **Step 3: Implement `useQuestions()`**

Create `apps/web/lib/hooks/useQuestions.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { Question, QuestionType, Difficulty, Tag } from '../types';
import { useAuth } from '../auth-context';

interface QuestionFilters {
  difficulty?: Difficulty;
  tagId?: string;
}

function buildQuery(filters: QuestionFilters): string {
  const params = new URLSearchParams();
  if (filters.difficulty) params.set('difficulty', filters.difficulty);
  if (filters.tagId) params.set('tagId', filters.tagId);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function useQuestions(filters: QuestionFilters = {}) {
  const { accessToken } = useAuth();
  return useQuery<Question[]>({
    queryKey: ['questions', filters],
    queryFn: () => apiFetch(`/questions${buildQuery(filters)}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useQuestion(id: string | null) {
  const { accessToken } = useAuth();
  return useQuery<Question>({
    queryKey: ['questions', id],
    queryFn: () => apiFetch(`/questions/${id}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && Boolean(id),
  });
}

export function useTags() {
  const { accessToken } = useAuth();
  return useQuery<Tag[]>({
    queryKey: ['tags'],
    queryFn: () => apiFetch('/tags', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export interface QuestionInput {
  type: QuestionType;
  text: string;
  topic?: string;
  category?: string;
  difficulty: Difficulty;
  marks: number;
  negativeMarks?: number;
  tags?: string[];
  options: { text: string; isCorrect: boolean }[];
}

export function useCreateQuestion() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: QuestionInput) =>
      apiFetch('/questions', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['questions'] }),
  });
}

export function useUpdateQuestion(id: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: QuestionInput) =>
      apiFetch(`/questions/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      queryClient.invalidateQueries({ queryKey: ['questions', id] });
    },
  });
}
```

- [ ] **Step 4: Implement `QuestionForm`**

Create `apps/web/components/QuestionForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Button, Input, Select, Checkbox, RadioGroup, RadioGroupItem } from '../components/ui';
import { Question, QuestionType, Difficulty, Tag } from '../lib/types';
import { QuestionInput } from '../lib/hooks/useQuestions';

const TYPE_OPTIONS = [
  { value: 'single_mcq', label: 'Single-correct MCQ' },
  { value: 'multi_mcq', label: 'Multiple-correct MCQ' },
  { value: 'true_false', label: 'True / False' },
];

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

interface OptionDraft {
  text: string;
  isCorrect: boolean;
}

interface QuestionFormProps {
  initialQuestion?: Question;
  tags: Tag[];
  onSubmit: (input: QuestionInput) => void;
  submitLabel: string;
}

function defaultOptionsFor(type: QuestionType): OptionDraft[] {
  if (type === 'true_false') {
    return [
      { text: 'True', isCorrect: true },
      { text: 'False', isCorrect: false },
    ];
  }
  return [
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ];
}

export function QuestionForm({ initialQuestion, tags, onSubmit, submitLabel }: QuestionFormProps) {
  const [type, setType] = useState<QuestionType>(initialQuestion?.type ?? 'single_mcq');
  const [text, setText] = useState(initialQuestion?.text ?? '');
  const [difficulty, setDifficulty] = useState<Difficulty>(initialQuestion?.difficulty ?? 'easy');
  const [marks, setMarks] = useState(String(initialQuestion?.marks ?? 1));
  const [negativeMarks, setNegativeMarks] = useState(String(initialQuestion?.negativeMarks ?? 0));
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(initialQuestion?.tags?.map((tag) => tag.id) ?? []);
  const [options, setOptions] = useState<OptionDraft[]>(
    initialQuestion ? initialQuestion.options.map((option) => ({ text: option.text, isCorrect: option.isCorrect })) : defaultOptionsFor(type),
  );

  function handleTypeChange(nextType: string) {
    const typed = nextType as QuestionType;
    setType(typed);
    setOptions(defaultOptionsFor(typed));
  }

  function updateOptionText(index: number, value: string) {
    setOptions((current) => current.map((option, i) => (i === index ? { ...option, text: value } : option)));
  }

  function setSingleCorrect(index: number) {
    setOptions((current) => current.map((option, i) => ({ ...option, isCorrect: i === index })));
  }

  function toggleMultiCorrect(index: number, checked: boolean) {
    setOptions((current) => current.map((option, i) => (i === index ? { ...option, isCorrect: checked } : option)));
  }

  function addOption() {
    setOptions((current) => [...current, { text: '', isCorrect: false }]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      type,
      text,
      difficulty,
      marks: Number(marks),
      negativeMarks: Number(negativeMarks),
      tags: selectedTagIds,
      options,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <Select label="Question type" value={type} onChange={handleTypeChange} options={TYPE_OPTIONS} />
      <div className="flex flex-col gap-1">
        <label htmlFor="question-text" className="text-sm font-medium text-gray-700">
          Question text
        </label>
        <textarea
          id="question-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          rows={3}
          required
        />
      </div>
      <Select label="Difficulty" value={difficulty} onChange={(value) => setDifficulty(value as Difficulty)} options={DIFFICULTY_OPTIONS} />
      <div className="flex gap-4">
        <Input label="Marks" type="number" min={1} value={marks} onChange={setMarks} />
        <Input label="Negative marks" type="number" min={0} value={negativeMarks} onChange={setNegativeMarks} />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-gray-700">Options</span>
        {type === 'single_mcq' || type === 'true_false' ? (
          <RadioGroup
            value={String(options.findIndex((option) => option.isCorrect))}
            onChange={(value) => setSingleCorrect(Number(value))}
          >
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <RadioGroupItem value={String(index)} label={`Option ${index + 1} correct`} />
                <input
                  aria-label={`Option ${index + 1} text`}
                  value={option.text}
                  onChange={(e) => updateOptionText(index, e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                  readOnly={type === 'true_false'}
                />
              </div>
            ))}
          </RadioGroup>
        ) : (
          options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <Checkbox label={`Option ${index + 1} correct`} checked={option.isCorrect} onChange={(checked) => toggleMultiCorrect(index, checked)} />
              <input
                aria-label={`Option ${index + 1} text`}
                value={option.text}
                onChange={(e) => updateOptionText(index, e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </div>
          ))
        )}
        {type !== 'true_false' && (
          <Button type="button" variant="secondary" onClick={addOption}>
            Add option
          </Button>
        )}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">Tags</span>
          {tags.map((tag) => (
            <Checkbox
              key={tag.id}
              label={tag.name}
              checked={selectedTagIds.includes(tag.id)}
              onChange={(checked) =>
                setSelectedTagIds((current) => (checked ? [...current, tag.id] : current.filter((id) => id !== tag.id)))
              }
            />
          ))}
        </div>
      )}

      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
```

- [ ] **Step 5: Implement the three pages**

Create `apps/web/app/(recruiter)/questions/page.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useQuestions } from '../../../lib/hooks/useQuestions';
import { Table, Badge, Button, type Column } from '../../../components/ui';
import { Question } from '../../../lib/types';

const columns: Column<Question>[] = [
  { key: 'text', header: 'Question', render: (q) => q.text, sortValue: (q) => q.text },
  { key: 'type', header: 'Type', render: (q) => q.type },
  { key: 'difficulty', header: 'Difficulty', render: (q) => <Badge>{q.difficulty}</Badge>, sortValue: (q) => q.difficulty },
  { key: 'marks', header: 'Marks', render: (q) => String(q.marks), sortValue: (q) => q.marks },
  { key: 'edit', header: '', render: (q) => <Link href={`/questions/${q.id}/edit`}>Edit</Link> },
];

export default function QuestionsPage() {
  const { data: questions } = useQuestions();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Question Bank</h1>
        <Link href="/questions/new">
          <Button>New question</Button>
        </Link>
      </div>
      <Table columns={columns} rows={questions ?? []} rowKey={(q) => q.id} emptyMessage="No questions yet." />
    </div>
  );
}
```

Create `apps/web/app/(recruiter)/questions/new/page.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { QuestionForm } from '../../../../components/QuestionForm';
import { useCreateQuestion, useTags } from '../../../../lib/hooks/useQuestions';
import { useToast } from '../../../../components/ui';

export default function NewQuestionPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: tags } = useTags();
  const createQuestion = useCreateQuestion();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">New question</h1>
      <QuestionForm
        tags={tags ?? []}
        submitLabel="Create question"
        onSubmit={(input) =>
          createQuestion.mutate(input, {
            onSuccess: () => {
              toast('Question created.');
              router.push('/questions');
            },
          })
        }
      />
    </div>
  );
}
```

Create `apps/web/app/(recruiter)/questions/[id]/edit/page.tsx`:

```tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import { QuestionForm } from '../../../../../components/QuestionForm';
import { useQuestion, useUpdateQuestion, useTags } from '../../../../../lib/hooks/useQuestions';
import { useToast } from '../../../../../components/ui';

export default function EditQuestionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { data: question } = useQuestion(params.id);
  const { data: tags } = useTags();
  const updateQuestion = useUpdateQuestion(params.id);

  if (!question) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Edit question</h1>
      <QuestionForm
        initialQuestion={question}
        tags={tags ?? []}
        submitLabel="Save changes"
        onSubmit={(input) =>
          updateQuestion.mutate(input, {
            onSuccess: () => {
              toast('Question updated.');
              router.push('/questions');
            },
          })
        }
      />
    </div>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test --workspace=apps/web`
Expected: PASS, 25/25 (22 from Tasks 3-6 + 2 QuestionForm + 1 QuestionsPage).

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/hooks/useQuestions.ts apps/web/app/\(recruiter\)/questions apps/web/components/QuestionForm.tsx apps/web/components/QuestionForm.test.tsx
git commit -m "feat: Question Bank list, create, and edit screens

QuestionForm handles all three backend question types (single_mcq,
multi_mcq, true_false) with type-appropriate correct-answer input
(radio for single-select, checkboxes for multi-select, fixed
True/False options), and is shared verbatim between /questions/new and
/questions/[id]/edit -- the edit page always resends every field on
save since UpdateQuestionDto requires the full body, not a partial."
```

---

### Task 8: Exam builder — list, create, details/settings, sections

**Files:**
- Create: `apps/web/lib/hooks/useExamSections.ts`
- Create: `apps/web/app/(recruiter)/exams/page.tsx`
- Create: `apps/web/app/(recruiter)/exams/new/page.tsx`
- Create: `apps/web/app/(recruiter)/exams/[id]/edit/page.tsx`
- Create: `apps/web/components/ExamDetailsForm.tsx`
- Create: `apps/web/components/ExamSectionsPanel.tsx`
- Test: `apps/web/components/ExamDetailsForm.test.tsx`
- Test: `apps/web/components/ExamSectionsPanel.test.tsx`
- Test: `apps/web/app/(recruiter)/exams/page.test.tsx`

**Interfaces:**
- Consumes: `useExams`, `useExam`, `useCreateExam`, `useUpdateExam`, `usePublishExam` (Task 6); `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`, `Table`, `Badge` (Task 4).
- Produces: `useCreateSection(examId)` and `useReplaceSectionQuestions(examId, sectionId)` hooks — the latter is defined here but consumed by Task 9's question picker. `ExamSectionsPanel` component (`{ examId: string }`) reused by Task 9 to add the "questions per section" affordance inline.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/ExamDetailsForm.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExamDetailsForm } from './ExamDetailsForm';

describe('ExamDetailsForm', () => {
  it('submits title, duration, and pass criteria', async () => {
    const onSubmit = jest.fn();
    render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Create exam" />);

    await userEvent.type(screen.getByLabelText('Title'), 'Backend Round');
    await userEvent.clear(screen.getByLabelText('Duration (minutes)'));
    await userEvent.type(screen.getByLabelText('Duration (minutes)'), '45');
    await userEvent.click(screen.getByRole('button', { name: 'Create exam' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Backend Round', durationMinutes: 45 }),
    );
  });
});
```

Create `apps/web/components/ExamSectionsPanel.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExamSectionsPanel } from './ExamSectionsPanel';
import { AuthProvider } from '../lib/auth-context';
import { QueryProvider } from '../lib/query-provider';

describe('ExamSectionsPanel', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists existing sections and adds a new one', async () => {
    const fetchMock = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/exams/exam-1/sections') && options?.method === 'POST') {
        return new Response(
          JSON.stringify({ id: 's-2', examId: 'exam-1', title: 'Section Two', orderIndex: 1, selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null }),
          { status: 201 },
        );
      }
      if (String(url).includes('/exams/exam-1')) {
        return new Response(
          JSON.stringify({
            id: 'exam-1',
            title: 'Backend Round',
            instructions: null,
            status: 'draft',
            durationMinutes: 60,
            passCriteriaPercent: 40,
            randomizeOrder: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            sections: [
              { id: 's-1', examId: 'exam-1', title: 'Section One', orderIndex: 0, selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <ExamSectionsPanel examId="exam-1" />
        </AuthProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Section One')).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText('New section title'), 'Section Two');
    await userEvent.click(screen.getByRole('button', { name: 'Add section' }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/exams/exam-1/sections') && call[1]?.method === 'POST')).toBe(true),
    );
  });
});
```

Create `apps/web/app/(recruiter)/exams/page.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import ExamsPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('ExamsPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists exams with their status badge', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams')) {
        return new Response(
          JSON.stringify([{ id: 'exam-1', title: 'Backend Round', status: 'draft', sections: [] }]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <ExamsPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Backend Round')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/web -- ExamDetailsForm ExamSectionsPanel exams/page`
Expected: FAIL — none of these files exist yet.

- [ ] **Step 3: Implement `useExamSections()`**

Create `apps/web/lib/hooks/useExamSections.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';

interface SectionInput {
  title: string;
  targetDurationMinutes?: number;
}

export function useCreateSection(examId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SectionInput) =>
      apiFetch(`/exams/${examId}/sections`, { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exams', examId] }),
  });
}

export function useReplaceSectionQuestions(examId: string, sectionId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (questionIds: string[]) =>
      apiFetch(
        `/exams/${examId}/sections/${sectionId}/questions`,
        { method: 'PUT', body: JSON.stringify({ questionIds }) },
        accessToken ?? undefined,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exams', examId] }),
  });
}
```

- [ ] **Step 4: Implement `ExamDetailsForm`**

Create `apps/web/components/ExamDetailsForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Button, Input } from '../components/ui';
import { Exam } from '../lib/types';

export interface ExamDetailsValue {
  title: string;
  instructions?: string;
  durationMinutes: number;
  passCriteriaPercent: number;
  randomizeOrder: boolean;
}

interface ExamDetailsFormProps {
  initialExam?: Exam;
  onSubmit: (input: ExamDetailsValue) => void;
  submitLabel: string;
}

export function ExamDetailsForm({ initialExam, onSubmit, submitLabel }: ExamDetailsFormProps) {
  const [title, setTitle] = useState(initialExam?.title ?? '');
  const [instructions, setInstructions] = useState(initialExam?.instructions ?? '');
  const [durationMinutes, setDurationMinutes] = useState(String(initialExam?.durationMinutes ?? 60));
  const [passCriteriaPercent, setPassCriteriaPercent] = useState(String(initialExam?.passCriteriaPercent ?? 40));
  const [randomizeOrder, setRandomizeOrder] = useState(initialExam?.randomizeOrder ?? false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      title,
      instructions: instructions || undefined,
      durationMinutes: Number(durationMinutes),
      passCriteriaPercent: Number(passCriteriaPercent),
      randomizeOrder,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <Input label="Title" value={title} onChange={setTitle} required />
      <div className="flex flex-col gap-1">
        <label htmlFor="exam-instructions" className="text-sm font-medium text-gray-700">
          Instructions
        </label>
        <textarea
          id="exam-instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          rows={3}
        />
      </div>
      <Input label="Duration (minutes)" type="number" min={1} value={durationMinutes} onChange={setDurationMinutes} />
      <Input label="Pass criteria (%)" type="number" min={0} max={100} value={passCriteriaPercent} onChange={setPassCriteriaPercent} />
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={randomizeOrder} onChange={(e) => setRandomizeOrder(e.target.checked)} />
        Randomize question order for candidates
      </label>
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
```

- [ ] **Step 5: Implement `ExamSectionsPanel`**

Create `apps/web/components/ExamSectionsPanel.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useExam } from '../lib/hooks/useExams';
import { useCreateSection } from '../lib/hooks/useExamSections';
import { Button, Input, Card } from '../components/ui';

export function ExamSectionsPanel({ examId }: { examId: string }) {
  const { data: exam } = useExam(examId);
  const createSection = useCreateSection(examId);
  const [newTitle, setNewTitle] = useState('');

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createSection.mutate({ title: newTitle }, { onSuccess: () => setNewTitle('') });
  }

  return (
    <div className="flex flex-col gap-3">
      {(exam?.sections ?? [])
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((section) => (
          <Card key={section.id}>
            <p className="font-medium">{section.title}</p>
          </Card>
        ))}
      <form onSubmit={handleAdd} className="flex items-end gap-2">
        <Input label="New section title" value={newTitle} onChange={setNewTitle} />
        <Button type="submit">Add section</Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 6: Implement the exam list, create, and edit pages**

Create `apps/web/app/(recruiter)/exams/page.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useExams } from '../../../lib/hooks/useExams';
import { Table, Badge, Button, type Column } from '../../../components/ui';
import { Exam, ExamStatus } from '../../../lib/types';

const STATUS_VARIANT: Record<ExamStatus, 'default' | 'success' | 'warning'> = {
  draft: 'warning',
  published: 'success',
  archived: 'default',
};

const columns: Column<Exam>[] = [
  { key: 'title', header: 'Title', render: (exam) => exam.title, sortValue: (exam) => exam.title },
  { key: 'status', header: 'Status', render: (exam) => <Badge variant={STATUS_VARIANT[exam.status]}>{exam.status}</Badge> },
  { key: 'edit', header: '', render: (exam) => <Link href={`/exams/${exam.id}/edit`}>Edit</Link> },
];

export default function ExamsPage() {
  const { data: exams } = useExams();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Exams</h1>
        <Link href="/exams/new">
          <Button>New exam</Button>
        </Link>
      </div>
      <Table columns={columns} rows={exams ?? []} rowKey={(exam) => exam.id} emptyMessage="No exams yet." />
    </div>
  );
}
```

Create `apps/web/app/(recruiter)/exams/new/page.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { ExamDetailsForm } from '../../../../components/ExamDetailsForm';
import { useCreateExam } from '../../../../lib/hooks/useExams';
import { useToast } from '../../../../components/ui';

export default function NewExamPage() {
  const router = useRouter();
  const { toast } = useToast();
  const createExam = useCreateExam();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">New exam</h1>
      <ExamDetailsForm
        submitLabel="Create exam"
        onSubmit={(input) =>
          createExam.mutate(input, {
            onSuccess: (created) => {
              toast('Exam created.');
              router.push(`/exams/${created.id}/edit`);
            },
          })
        }
      />
    </div>
  );
}
```

Create `apps/web/app/(recruiter)/exams/[id]/edit/page.tsx`:

```tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ExamDetailsForm } from '../../../../../components/ExamDetailsForm';
import { ExamSectionsPanel } from '../../../../../components/ExamSectionsPanel';
import { useExam, useUpdateExam, usePublishExam } from '../../../../../lib/hooks/useExams';
import { Tabs, TabsList, TabsTrigger, TabsContent, Button, useToast } from '../../../../../components/ui';

export default function EditExamPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { data: exam } = useExam(params.id);
  const updateExam = useUpdateExam(params.id);
  const publishExam = usePublishExam(params.id);

  if (!exam) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{exam.title}</h1>
        <div className="flex gap-2">
          <Link href={`/exams/${exam.id}/preview`}>
            <Button variant="secondary">Preview</Button>
          </Link>
          {exam.status === 'draft' && (
            <Button
              onClick={() =>
                publishExam.mutate(undefined, {
                  onSuccess: () => {
                    toast('Exam published.');
                    router.push('/exams');
                  },
                })
              }
            >
              Publish
            </Button>
          )}
        </div>
      </div>
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="sections">Sections &amp; Questions</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          <ExamDetailsForm
            initialExam={exam}
            submitLabel="Save details"
            onSubmit={(input) => updateExam.mutate(input, { onSuccess: () => toast('Exam updated.') })}
          />
        </TabsContent>
        <TabsContent value="sections">
          <ExamSectionsPanel examId={exam.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test --workspace=apps/web`
Expected: PASS, 28/28 (25 from Tasks 3-7 + 1 ExamDetailsForm + 1 ExamSectionsPanel + 1 ExamsPage).

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/hooks/useExamSections.ts apps/web/app/\(recruiter\)/exams apps/web/components/ExamDetailsForm.tsx apps/web/components/ExamDetailsForm.test.tsx apps/web/components/ExamSectionsPanel.tsx apps/web/components/ExamSectionsPanel.test.tsx
git commit -m "feat: exam builder -- list, create, details/settings, sections tab

Edit page uses Tabs (Details / Sections & Questions) matching the
master spec's multi-step builder shape, collapsed into two tabs for
this phase (questions-per-section lands in Task 9). Publish button
only renders when status is draft, matching the backend's own
publish() guard (400 outside draft)."
```

---

### Task 9: Exam builder — question picker per section, exam preview

**Files:**
- Create: `apps/web/components/SectionQuestionPicker.tsx`
- Modify: `apps/web/components/ExamSectionsPanel.tsx`
- Create: `apps/web/app/(recruiter)/exams/[id]/preview/page.tsx`
- Test: `apps/web/components/SectionQuestionPicker.test.tsx`
- Test: `apps/web/app/(recruiter)/exams/[id]/preview/page.test.tsx`

**Interfaces:**
- Consumes: `useQuestions()` (Task 7), `useReplaceSectionQuestions` (Task 8), `Modal` (Task 4), `useExam` (Task 6).
- Produces: nothing further consumed by later tasks — this is the last piece of the exam builder.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/SectionQuestionPicker.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SectionQuestionPicker } from './SectionQuestionPicker';
import { AuthProvider } from '../lib/auth-context';
import { QueryProvider } from '../lib/query-provider';

describe('SectionQuestionPicker', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lets the recruiter select questions and submits their ids via PUT', async () => {
    const fetchMock = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams/exam-1/sections/s-1/questions') && options?.method === 'PUT') {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (String(url).includes('/questions')) {
        return new Response(
          JSON.stringify([
            { id: 'q-1', type: 'single_mcq', text: 'What is 2+2?', topic: null, category: null, difficulty: 'easy', marks: 5, negativeMarks: 0, status: 'active', aiGenerated: false, createdAt: '2026-01-01T00:00:00.000Z', options: [] },
          ]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <SectionQuestionPicker examId="exam-1" sectionId="s-1" open onClose={() => {}} existingQuestionIds={[]} />
        </AuthProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('What is 2+2?')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('checkbox', { name: /What is 2\+2\?/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save questions' }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          (call) => String(call[0]).includes('/exams/exam-1/sections/s-1/questions') && call[1]?.method === 'PUT',
        ),
      ).toBe(true),
    );
  });
});
```

Create `apps/web/app/(recruiter)/exams/[id]/preview/page.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import PreviewPage from './page';
import { AuthProvider } from '../../../../../lib/auth-context';
import { QueryProvider } from '../../../../../lib/query-provider';

jest.mock('next/navigation', () => ({ useParams: () => ({ id: 'exam-1' }) }));

describe('Exam preview page', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders the exam title and section list read-only', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams/exam-1')) {
        return new Response(
          JSON.stringify({
            id: 'exam-1',
            title: 'Backend Round',
            instructions: 'Answer all questions.',
            status: 'draft',
            durationMinutes: 60,
            passCriteriaPercent: 40,
            randomizeOrder: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            sections: [{ id: 's-1', examId: 'exam-1', title: 'Section One', orderIndex: 0, selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null }],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <PreviewPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Backend Round')).toBeInTheDocument());
    expect(screen.getByText('Section One')).toBeInTheDocument();
    expect(screen.getByText('Answer all questions.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/web -- SectionQuestionPicker exams/\\[id\\]/preview`
Expected: FAIL — neither file exists.

- [ ] **Step 3: Implement `SectionQuestionPicker`**

Create `apps/web/components/SectionQuestionPicker.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useQuestions } from '../lib/hooks/useQuestions';
import { useReplaceSectionQuestions } from '../lib/hooks/useExamSections';
import { Modal, Checkbox, Button } from '../components/ui';

interface SectionQuestionPickerProps {
  examId: string;
  sectionId: string;
  open: boolean;
  onClose: () => void;
  existingQuestionIds: string[];
}

export function SectionQuestionPicker({ examId, sectionId, open, onClose, existingQuestionIds }: SectionQuestionPickerProps) {
  const { data: questions } = useQuestions();
  const replaceQuestions = useReplaceSectionQuestions(examId, sectionId);
  const [selectedIds, setSelectedIds] = useState<string[]>(existingQuestionIds);

  useEffect(() => {
    setSelectedIds(existingQuestionIds);
  }, [existingQuestionIds, open]);

  function toggle(id: string, checked: boolean) {
    setSelectedIds((current) => (checked ? [...current, id] : current.filter((existing) => existing !== id)));
  }

  function handleSave() {
    replaceQuestions.mutate(selectedIds, { onSuccess: onClose });
  }

  return (
    <Modal open={open} title="Add questions to section" onClose={onClose}>
      <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
        {(questions ?? []).map((question) => (
          <Checkbox
            key={question.id}
            label={`${question.text} (${question.marks} marks)`}
            checked={selectedIds.includes(question.id)}
            onChange={(checked) => toggle(question.id, checked)}
          />
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={handleSave}>Save questions</Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Wire the picker into `ExamSectionsPanel`**

Modify `apps/web/components/ExamSectionsPanel.tsx` — replace its body with:

```tsx
'use client';

import { useState } from 'react';
import { useExam } from '../lib/hooks/useExams';
import { useCreateSection } from '../lib/hooks/useExamSections';
import { SectionQuestionPicker } from './SectionQuestionPicker';
import { Button, Input, Card } from '../components/ui';

export function ExamSectionsPanel({ examId }: { examId: string }) {
  const { data: exam } = useExam(examId);
  const createSection = useCreateSection(examId);
  const [newTitle, setNewTitle] = useState('');
  const [pickerSectionId, setPickerSectionId] = useState<string | null>(null);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createSection.mutate({ title: newTitle }, { onSuccess: () => setNewTitle('') });
  }

  return (
    <div className="flex flex-col gap-3">
      {(exam?.sections ?? [])
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((section) => (
          <Card key={section.id} className="flex items-center justify-between">
            <p className="font-medium">{section.title}</p>
            <Button variant="secondary" onClick={() => setPickerSectionId(section.id)}>
              Manage questions
            </Button>
          </Card>
        ))}
      <form onSubmit={handleAdd} className="flex items-end gap-2">
        <Input label="New section title" value={newTitle} onChange={setNewTitle} />
        <Button type="submit">Add section</Button>
      </form>
      {pickerSectionId && (
        <SectionQuestionPicker
          examId={examId}
          sectionId={pickerSectionId}
          open
          onClose={() => setPickerSectionId(null)}
          existingQuestionIds={[]}
        />
      )}
    </div>
  );
}
```

Note: `existingQuestionIds` is passed as `[]` rather than reading a section's current question set — the `Exam`/`ExamSection` types (Task 5) intentionally don't carry a `questionIds` array (the backend's `GET /exams/:id` shape returns sections without their question list expanded; confirmed by the API contract survey). Re-opening the picker for a section that already has questions currently starts unselected rather than pre-checked. This is a known, minor rough edge — noted as a follow-up rather than expanding scope to add a dedicated `GET` for a section's current question ids, which the approved spec's endpoint table does not include.

- [ ] **Step 5: Implement the read-only preview page**

Create `apps/web/app/(recruiter)/exams/[id]/preview/page.tsx`:

```tsx
'use client';

import { useParams } from 'next/navigation';
import { useExam } from '../../../../../lib/hooks/useExams';
import { Card } from '../../../../../components/ui';

export default function PreviewPage() {
  const params = useParams<{ id: string }>();
  const { data: exam } = useExam(params.id);

  if (!exam) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-2xl font-semibold">{exam.title}</h1>
      {exam.instructions && <p className="mb-6 text-sm text-gray-600">{exam.instructions}</p>}
      <div className="flex flex-col gap-4">
        {exam.sections
          .slice()
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((section) => (
            <Card key={section.id}>
              <h2 className="font-medium">{section.title}</h2>
            </Card>
          ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test --workspace=apps/web`
Expected: PASS, 30/30 (28 from Tasks 3-8 + 1 SectionQuestionPicker + 1 preview page).

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/SectionQuestionPicker.tsx apps/web/components/SectionQuestionPicker.test.tsx apps/web/components/ExamSectionsPanel.tsx apps/web/app/\(recruiter\)/exams/\[id\]/preview
git commit -m "feat: section question picker and read-only exam preview

Picker is a Modal listing the question bank with checkboxes, saving
via the existing PUT .../sections/:sectionId/questions (full-replace
semantics, matching ReplaceSectionQuestionsDto). Preview renders the
exam read-only (title, instructions, section titles) as a candidate-
view simulation with no live attempt created, per the approved spec."
```

---

### Task 10: Candidates — list, manual add, invite

**Files:**
- Create: `apps/web/lib/hooks/useCandidates.ts`
- Create: `apps/web/lib/hooks/useInvitations.ts`
- Create: `apps/web/app/(recruiter)/candidates/page.tsx`
- Create: `apps/web/components/CandidateInviteForm.tsx`
- Test: `apps/web/components/CandidateInviteForm.test.tsx`
- Test: `apps/web/app/(recruiter)/candidates/page.test.tsx`

**Interfaces:**
- Consumes: `useExams` (Task 6), `Table`, `Checkbox`, `Modal` (Tasks 3-4).
- Produces: nothing further consumed by later tasks — last screen task in this phase.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/CandidateInviteForm.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CandidateInviteForm } from './CandidateInviteForm';

describe('CandidateInviteForm', () => {
  it('submits a new candidate with name, email, and phone', async () => {
    const onSubmit = jest.fn();
    render(<CandidateInviteForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Name'), 'Priya Shah');
    await userEvent.type(screen.getByLabelText('Email'), 'priya@example.com');
    await userEvent.type(screen.getByLabelText('Phone'), '555-0101');
    await userEvent.click(screen.getByRole('button', { name: 'Add candidate' }));

    expect(onSubmit).toHaveBeenCalledWith({ name: 'Priya Shah', email: 'priya@example.com', phone: '555-0101' });
  });
});
```

Create `apps/web/app/(recruiter)/candidates/page.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CandidatesPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('CandidatesPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists candidates and sends a bulk invitation for a selected exam', async () => {
    const fetchMock = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams/exam-1/invitations') && options?.method === 'POST') {
        return new Response(
          JSON.stringify({ created: [{ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', token: 'tok', status: 'invited' }], skipped: [] }),
          { status: 201 },
        );
      }
      if (String(url).endsWith('/exams?status=published')) {
        return new Response(JSON.stringify([{ id: 'exam-1', title: 'Backend Round', status: 'published', sections: [] }]), { status: 200 });
      }
      if (String(url).includes('/candidates')) {
        return new Response(
          JSON.stringify([{ id: 'cand-1', email: 'priya@example.com', name: 'Priya Shah', phone: null, createdAt: '2026-01-01T00:00:00.000Z', erasedAt: null }]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <CandidatesPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Priya Shah')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('checkbox', { name: /Priya Shah/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Send invitations' }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/exams/exam-1/invitations') && call[1]?.method === 'POST')).toBe(true),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/web -- CandidateInviteForm candidates/page`
Expected: FAIL — neither file exists.

- [ ] **Step 3: Implement `useCandidates()` and `useInvitations()`**

Create `apps/web/lib/hooks/useCandidates.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { Candidate } from '../types';
import { useAuth } from '../auth-context';

export function useCandidates() {
  const { accessToken } = useAuth();
  return useQuery<Candidate[]>({
    queryKey: ['candidates'],
    queryFn: () => apiFetch('/candidates', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

interface CreateCandidateInput {
  name: string;
  email: string;
  phone?: string;
}

export function useCreateCandidate() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCandidateInput) =>
      apiFetch('/candidates', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidates'] }),
  });
}
```

Create `apps/web/lib/hooks/useInvitations.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { BulkInviteResult } from '../types';
import { useAuth } from '../auth-context';

export function useBulkInvite(examId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (candidateIds: string[]): Promise<BulkInviteResult> =>
      apiFetch(`/exams/${examId}/invitations`, { method: 'POST', body: JSON.stringify({ candidateIds }) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidates'] }),
  });
}
```

- [ ] **Step 4: Implement `CandidateInviteForm`**

Create `apps/web/components/CandidateInviteForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Button, Input } from '../components/ui';

interface CandidateInput {
  name: string;
  email: string;
  phone: string;
}

export function CandidateInviteForm({ onSubmit }: { onSubmit: (input: CandidateInput) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ name, email, phone });
    setName('');
    setEmail('');
    setPhone('');
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <Input label="Name" value={name} onChange={setName} required />
      <Input label="Email" type="email" value={email} onChange={setEmail} required />
      <Input label="Phone" value={phone} onChange={setPhone} />
      <Button type="submit">Add candidate</Button>
    </form>
  );
}
```

- [ ] **Step 5: Implement the candidates page**

Create `apps/web/app/(recruiter)/candidates/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useCandidates, useCreateCandidate } from '../../../lib/hooks/useCandidates';
import { useExams } from '../../../lib/hooks/useExams';
import { useBulkInvite } from '../../../lib/hooks/useInvitations';
import { CandidateInviteForm } from '../../../components/CandidateInviteForm';
import { Table, Checkbox, Select, Button, useToast, type Column } from '../../../components/ui';
import { Candidate } from '../../../lib/types';

export default function CandidatesPage() {
  const { data: candidates } = useCandidates();
  const { data: publishedExams } = useExams('published');
  const createCandidate = useCreateCandidate();
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [examId, setExamId] = useState<string>('');
  const bulkInvite = useBulkInvite(examId);

  function toggle(id: string, checked: boolean) {
    setSelectedIds((current) => (checked ? [...current, id] : current.filter((existing) => existing !== id)));
  }

  function handleInvite() {
    bulkInvite.mutate(selectedIds, {
      onSuccess: (result) => {
        toast(`Invited ${result.created.length} candidate(s).${result.skipped.length ? ` ${result.skipped.length} skipped.` : ''}`);
        setSelectedIds([]);
      },
    });
  }

  const columns: Column<Candidate>[] = [
    {
      key: 'select',
      header: '',
      render: (candidate) => (
        <Checkbox label={candidate.name} checked={selectedIds.includes(candidate.id)} onChange={(checked) => toggle(candidate.id, checked)} />
      ),
    },
    { key: 'email', header: 'Email', render: (candidate) => candidate.email, sortValue: (candidate) => candidate.email },
    { key: 'phone', header: 'Phone', render: (candidate) => candidate.phone ?? '—' },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Candidates</h1>
      <div className="mb-6">
        <CandidateInviteForm onSubmit={(input) => createCandidate.mutate(input)} />
      </div>
      <div className="mb-4 flex items-end gap-2">
        <Select
          label="Exam to invite to"
          value={examId}
          onChange={setExamId}
          options={(publishedExams ?? []).map((exam) => ({ value: exam.id, label: exam.title }))}
        />
        <Button onClick={handleInvite} disabled={!examId || selectedIds.length === 0}>
          Send invitations
        </Button>
      </div>
      <Table columns={columns} rows={candidates ?? []} rowKey={(candidate) => candidate.id} emptyMessage="No candidates yet." />
    </div>
  );
}
```

Modify `apps/web/lib/hooks/useExams.ts`'s `useExams` call sites are unaffected — `useExams(status?: string)` already accepts an optional status filter from Task 6, so `useExams('published')` here needs no hook changes.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test --workspace=apps/web`
Expected: PASS, 32/32 (30 from Tasks 3-9 + 1 CandidateInviteForm + 1 CandidatesPage).

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/hooks/useCandidates.ts apps/web/lib/hooks/useInvitations.ts apps/web/app/\(recruiter\)/candidates apps/web/components/CandidateInviteForm.tsx apps/web/components/CandidateInviteForm.test.tsx
git commit -m "feat: candidates list, manual add, and bulk invite

Invite flow selects a published exam (bulkInvite requires status
published on the backend) and one or more candidates via checkbox,
then calls the existing bulk-invite endpoint. CSV bulk-upload stays
out of scope per the approved spec -- only the manual single-add path
is built this phase."
```

---

### Task 11: Playwright golden-path e2e suite

**Files:**
- Create: `apps/web/e2e/recruiter-golden-path.spec.ts`
- Delete: `apps/web/e2e/.gitkeep`

**Interfaces:**
- Consumes: the full recruiter screen surface from Tasks 6-10, running against a real `apps/api` dev-mode instance.
- Produces: nothing (terminal coverage task).

- [ ] **Step 1: Write the e2e spec**

Create `apps/web/e2e/recruiter-golden-path.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const ORG_SLUG = process.env.E2E_ORG_SLUG ?? 'demo-org';
const RECRUITER_EMAIL = process.env.E2E_RECRUITER_EMAIL ?? 'recruiter@demo-org.test';
const RECRUITER_PASSWORD = process.env.E2E_RECRUITER_PASSWORD ?? 'Passw0rd!2026';

test('recruiter creates an exam, adds a section and question, publishes, adds a candidate, and invites them', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Organization slug').fill(ORG_SLUG);
  await page.getByLabel('Email').fill(RECRUITER_EMAIL);
  await page.getByLabel('Password').fill(RECRUITER_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('link', { name: 'Question Bank' }).click();
  await page.getByRole('link', { name: 'New question' }).click();
  await page.getByLabel('Question text').fill('What is 2 + 2?');
  await page.getByLabel('Marks').fill('5');
  const optionInputs = page.getByLabel(/Option \d text/);
  await optionInputs.nth(0).fill('4');
  await optionInputs.nth(1).fill('5');
  await page.getByRole('radio', { name: 'Option 1 correct' }).click();
  await page.getByRole('button', { name: 'Create question' }).click();
  await expect(page).toHaveURL(/\/questions$/);
  await expect(page.getByText('What is 2 + 2?')).toBeVisible();

  await page.getByRole('link', { name: 'Exams' }).click();
  await page.getByRole('link', { name: 'New exam' }).click();
  await page.getByLabel('Title').fill(`Golden Path Exam ${Date.now()}`);
  await page.getByRole('button', { name: 'Create exam' }).click();
  await expect(page).toHaveURL(/\/exams\/.+\/edit$/);

  await page.getByRole('tab', { name: 'Sections & Questions' }).click();
  await page.getByLabel('New section title').fill('Section One');
  await page.getByRole('button', { name: 'Add section' }).click();
  await expect(page.getByText('Section One')).toBeVisible();
  await page.getByRole('button', { name: 'Manage questions' }).click();
  await page.getByRole('checkbox', { name: /What is 2 \+ 2\?/ }).click();
  await page.getByRole('button', { name: 'Save questions' }).click();

  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page).toHaveURL(/\/exams$/);

  await page.getByRole('link', { name: 'Candidates' }).click();
  const candidateEmail = `golden-${Date.now()}@example.com`;
  await page.getByLabel('Name').fill('Golden Path Candidate');
  await page.getByLabel('Email').fill(candidateEmail);
  await page.getByRole('button', { name: 'Add candidate' }).click();
  await expect(page.getByText(candidateEmail)).toBeVisible();

  await page.getByLabel('Exam to invite to').click();
  await page.getByRole('option', { name: /Golden Path Exam/ }).click();
  await page.getByRole('checkbox', { name: 'Golden Path Candidate' }).click();
  await page.getByRole('button', { name: 'Send invitations' }).click();
  await expect(page.getByText(/Invited 1 candidate/)).toBeVisible();
});
```

- [ ] **Step 2: Run the suite against a real dev-mode backend**

In one terminal: `npm run dev:api` (with the dev database seeded — the `demo-org`/recruiter fixture already exists per the seed script; if credentials differ locally, override via `E2E_ORG_SLUG`/`E2E_RECRUITER_EMAIL`/`E2E_RECRUITER_PASSWORD` env vars).
In a second terminal: `npm run dev:web`.
In a third terminal:
```bash
npm run test:e2e --workspace=apps/web
```
Expected: PASS, 1/1.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/recruiter-golden-path.spec.ts
git rm apps/web/e2e/.gitkeep
git commit -m "test: Playwright golden-path e2e suite for the recruiter console

Covers Flow A end-to-end against a real dev-mode apps/api and
apps/web: login, create a question, create an exam, add a section,
attach the question to it, publish, add a candidate, and send an
invitation -- the exact loop this phase's scope was built around."
```

---

### Task 12: Final verification

**Files:** none modified — verification only.

**Interfaces:**
- Consumes: the fully wired shared shell + recruiter console from Tasks 1-11.
- Produces: nothing (terminal task).

- [ ] **Step 1: Full clean install and build, all workspaces**

Run:
```bash
npm ci
npm run build --workspace=apps/api
npm run build --workspace=apps/exam-runtime
npm run build --workspace=apps/web
```
Expected: all exit 0.

- [ ] **Step 2: Full backend unit + e2e suites (regression check on Task 1's change)**

Run:
```bash
npm run test:api
npm run test:exam-runtime
npm run test:shared
```
Expected: PASS. `apps/api` unit baseline going into this phase was 214/214 (26 suites) — expect it unaffected by Task 1's controller change unless new unit tests were added there (Task 1 added an e2e test, not a unit test, so unit count stays 214/214). `exam-runtime` and `shared` are untouched by this phase — 166/166 and 2/2 respectively.

Run (with `DATABASE_URL` exported):
```bash
npm run test:api:e2e -- --runInBand
```
Expected: PASS — baseline 81/81 + Task 1's 2 new tests = 83/83.

- [ ] **Step 3: Full frontend unit suite**

Run: `npm run test --workspace=apps/web`
Expected: PASS, 32/32 (per the running count across Tasks 3-10).

- [ ] **Step 4: Full frontend e2e suite**

With `apps/api` (dev mode) and `apps/web` (dev mode) both running per Task 11's Step 2:
```bash
npm run test:e2e --workspace=apps/web
```
Expected: PASS, 1/1.

- [ ] **Step 5: Manual verification in a live browser**

Per this project's UI-testing convention, start both dev servers and click through the golden path once by hand: log in as the seeded recruiter, confirm the sidebar nav renders and tenant branding colors apply, create a question of each of the 3 types, create an exam, add a section, attach questions, preview it, publish it, add a candidate, and send an invitation. Confirm no console errors and no broken layouts at both desktop and tablet widths (per the spec's "desktop-first, responsive to tablet" requirement — resize the browser to ~768px and re-check the sidebar/table layouts don't overflow or clip).

- [ ] **Step 6: Record the result**

No code changes from this task. If any step shows an unexpected failure, stop and report — do not close out the phase with unverified frontend behavior.

---

### Final whole-branch review

After Task 12, dispatch a broad review across the full diff range (from the commit immediately before Task 1 through Task 11's final commit) covering: plan alignment against `docs/superpowers/specs/2026-07-13-frontend-phase-1-recruiter-console-design.md`, code quality and accessibility (Radix usage, keyboard navigation, `aria-label`s), the `UpdateExamDto`/`UpdateQuestionDto` full-body-on-PATCH handling in every edit form, and confirmation that no out-of-scope screens (Org Admin, Super Admin, Interview Panel, candidate exam-taking UI, Live Monitoring, Reports & Analytics, AI Question Generator, Bulk Import) were built. Matches the same final-review pattern used at the end of every backend phase in this project.
