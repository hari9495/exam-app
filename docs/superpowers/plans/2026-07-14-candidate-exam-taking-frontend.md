# Candidate Exam-Taking Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the candidate-facing exam-taking UI — invitation redemption, exam session with question navigation and anti-cheat detection/reporting, and a submitted confirmation — closing the last gap of the five role consoles.

**Architecture:** A new `apps/web/app/(candidate)` route group (no URL prefix, matching the existing `(recruiter)`/`(org-admin)` convention) talks directly to `apps/exam-runtime` (a separate app/port/JWT secret from staff auth) via React Query polling — no WebSocket. A small backend addition gives `apps/exam-runtime`'s `candidate-auth` endpoints an httpOnly refresh cookie, mirroring the existing pattern already proven in `apps/api`'s staff auth.

**Tech Stack:** Next.js 16 App Router, `@tanstack/react-query` (already installed, no new frontend dependency), NestJS 11, `cookie-parser` (already a dependency of `apps/api`, added to `apps/exam-runtime` in Task 1).

## Global Constraints

- Approved spec: `docs/superpowers/specs/2026-07-14-candidate-exam-taking-frontend-design.md`.
- Routes have **no `/candidate` URL prefix** — the spec's `/candidate/start` etc. map to `/start`, `/welcome`, `/exam`, `/submitted`, `/session-ended`, consistent with how `(recruiter)` and `(org-admin)` route groups today produce URLs with no role prefix (e.g. `/dashboard`, `/users`). The `(candidate)` folder is a route group purely for a shared layout, not a path segment.
- New env var `NEXT_PUBLIC_EXAM_RUNTIME_API_BASE`, default `http://localhost:3002/api/v1` — mirrors the existing `NEXT_PUBLIC_API_BASE` pattern in `apps/web/lib/api-client.ts` exactly.
- Candidate refresh-token cookie name is `candidate_refresh_token` — **must not** reuse staff auth's `refresh_token` cookie name. Cookies in a browser are scoped by domain, not port, so a recruiter and a candidate both on `localhost` (different ports) would otherwise silently clobber each other's session cookie.
- Anti-cheat scope: **detection + reporting only** via the existing `POST /attempt/proctoring-event` contract (`tab_switch`, `fullscreen_exit`, `copy_paste`, `right_click`, `dev_tools_detected`, `refresh_warning`, `idle_timeout`). No forced fullscreen, no blocked copy/paste, no webcam/media capture.
- Answer-save debounce: **800ms** per `questionId`, independent timers per question.
- `tab_switch`/`fullscreen_exit` client-side debounce window: **5000ms**.
- Devtools window-size heuristic poll interval: **2000ms**; threshold: outer/inner dimension delta **> 160px**.
- Idle timeout: **5 minutes** (300000ms) of no mouse/keyboard input.
- `GET /attempt/current` poll interval: **30000ms** (`refetchInterval`), plus `refetchOnWindowFocus: true`.
- Visual identity: "Calm Focus" palette — primary `#2F6F5E`, primary-light `#F0F7F4`, background `#F4F7F6`, review-amber `#B8860B` / review-bg `#FBF3DD` / review-border `#E8D8A8`. Candidate screens **do not** reuse `components/ui/Button.tsx` (hardcoded to the staff `bg-primary` token) — a new `CandidateButton` is used instead. `components/ui/Modal.tsx` **is** reused as-is (visually neutral, no staff branding).
- Backend cookie: `httpOnly: true, sameSite: 'lax', secure: false` — exact match to `apps/api/src/auth/auth.controller.ts`'s existing `res.cookie(...)` call (this project's dev/local-only secure-cookie posture; not changed here).
- The candidate frontend **never persists the JSON body's `refreshToken` value** anywhere (no `localStorage`/`sessionStorage`) — silent refresh relies entirely on the httpOnly cookie.
- Every task's tests run from the relevant workspace root: frontend tests via `cd apps/web && npm test` / `npx playwright test`, backend tests via `npm run test:api` / `npm run test:api:e2e` from the repo root (existing root scripts already point `test:api` at `apps/api`, which is where the new cookie e2e spec lives per the dual-app pattern).

---

### Task 1: Backend — httpOnly refresh cookie for candidate-auth

**Files:**
- Modify: `apps/exam-runtime/src/main.ts`
- Modify: `apps/exam-runtime/src/candidate-auth/candidate-auth.controller.ts`
- Modify: `apps/exam-runtime/src/candidate-auth/dto/refresh.dto.ts`
- Modify: `apps/exam-runtime/package.json`
- Create: `apps/api/test/candidate-auth-cookie.e2e-spec.ts`

**Interfaces:**
- Consumes: `CandidateAuthService.redeem(token)`, `.refresh(refreshToken)`, `.logout(refreshToken)` — unchanged signatures (`apps/exam-runtime/src/candidate-auth/candidate-auth.service.ts`).
- Produces: `POST /candidate-auth/redeem`, `/refresh`, `/logout` now additionally set/read/clear a `candidate_refresh_token` httpOnly cookie. Response body shape is unchanged (`{ accessToken, refreshToken }` / `{ success: true }`) — Task 3's frontend consumes `accessToken` only.

- [ ] **Step 1: Add `cookie-parser` to `apps/exam-runtime`'s dependencies**

Edit `apps/exam-runtime/package.json` — add to `"dependencies"` (alongside `"argon2": "^0.31.2",`):

```json
    "cookie-parser": "^1.4.6",
```

Add to `"devDependencies"` (find that block further down the file):

```json
    "@types/cookie-parser": "^1.4.10",
```

Run: `npm install` (from repo root)
Expected: lockfile updates, no errors.

- [ ] **Step 2: Wire `cookie-parser` into exam-runtime's bootstrap**

Replace the full contents of `apps/exam-runtime/src/main.ts`:

```ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { InternalAppModule } from './internal-app.module';
import { resolveInternalBindHost } from './bootstrap-config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.enableCors({ origin: process.env.WEB_ORIGIN, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  app.setGlobalPrefix('api/v1');
  await app.listen(process.env.EXAM_RUNTIME_PORT ?? 3002);

  const internalApp = await NestFactory.create(InternalAppModule);
  internalApp.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  internalApp.setGlobalPrefix('api/v1');
  await internalApp.listen(process.env.EXAM_RUNTIME_INTERNAL_PORT ?? 3003, resolveInternalBindHost());
}
bootstrap();
```

(Only change from the current file: the `cookieParser` import and the `app.use(cookieParser())` line, inserted before `app.enableCors(...)`.)

- [ ] **Step 3: Make `refreshToken` optional on candidate-auth's `RefreshDto`**

Replace the full contents of `apps/exam-runtime/src/candidate-auth/dto/refresh.dto.ts`:

```ts
import { IsOptional, IsString } from 'class-validator';

export class RefreshDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
```

- [ ] **Step 4: Set/read/clear the httpOnly cookie in `CandidateAuthController`**

Replace the full contents of `apps/exam-runtime/src/candidate-auth/candidate-auth.controller.ts`:

```ts
import { Body, Controller, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { CandidateAuthService } from './candidate-auth.service';
import { RedeemInvitationDto } from './dto/redeem-invitation.dto';
import { RefreshDto } from './dto/refresh.dto';
import { STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';

const CANDIDATE_REFRESH_COOKIE = 'candidate_refresh_token';

@Controller('candidate-auth')
export class CandidateAuthController {
  constructor(private readonly candidateAuthService: CandidateAuthService) {}

  @Post('redeem')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  async redeem(@Body() dto: RedeemInvitationDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.candidateAuthService.redeem(dto.token);
    res.cookie(CANDIDATE_REFRESH_COOKIE, tokens.refreshToken, { httpOnly: true, sameSite: 'lax', secure: false });
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  async refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = dto.refreshToken ?? req.cookies?.[CANDIDATE_REFRESH_COOKIE];
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token required');
    }
    const tokens = await this.candidateAuthService.refresh(refreshToken);
    res.cookie(CANDIDATE_REFRESH_COOKIE, tokens.refreshToken, { httpOnly: true, sameSite: 'lax', secure: false });
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = dto.refreshToken ?? req.cookies?.[CANDIDATE_REFRESH_COOKIE];
    if (refreshToken) {
      await this.candidateAuthService.logout(refreshToken);
    }
    res.clearCookie(CANDIDATE_REFRESH_COOKIE);
    return { success: true };
  }
}
```

- [ ] **Step 5: Write the failing e2e test**

Create `apps/api/test/candidate-auth-cookie.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { AppModule as RuntimeAppModule } from '../../exam-runtime/src/app.module';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';

describe('Candidate-auth refresh/logout accept the httpOnly cookie with no request body', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let examId: string;
  let invitationToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [RuntimeAppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `candidate-cookie-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;
    const org = await prisma.organization.create({
      data: { name: 'Candidate Cookie Org', slug: `candidate-cookie-org-${randomUUID()}`, planId },
    });
    orgId = org.id;

    const exam = await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.exam.create({
        data: { organizationId: orgId, title: 'Cookie Test Exam', durationMinutes: 30, status: 'published' },
      }),
    );
    examId = exam.id;

    const candidate = await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.candidate.create({ data: { organizationId: orgId, name: 'Cookie Candidate', email: 'cookie-candidate@test.com' } }),
    );

    const invitation = await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.invitation.create({
        data: {
          organizationId: orgId,
          examId,
          candidateId: candidate.id,
          token: randomUUID(),
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      }),
    );
    invitationToken = invitation.token;
  });

  afterAll(async () => {
    await tenantPrisma
      .forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.candidateRefreshToken.deleteMany({ where: { invitation: { examId } } }))
      .catch(() => undefined);
    await tenantPrisma
      .forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.invitation.deleteMany({ where: { examId } }))
      .catch(() => undefined);
    await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.candidate.deleteMany({ where: { organizationId: orgId } })).catch(() => undefined);
    await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.exam.deleteMany({ where: { organizationId: orgId } })).catch(() => undefined);
    await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.organization.delete({ where: { id: orgId } })).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('redeems and sets an httpOnly candidate_refresh_token cookie, then refreshes/logs out using only that cookie', async () => {
    const redeemResponse = await request(app.getHttpServer())
      .post('/api/v1/candidate-auth/redeem')
      .send({ token: invitationToken })
      .expect(200);
    const cookies = redeemResponse.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('candidate_refresh_token=') && /httponly/i.test(c))).toBe(true);

    const refreshResponse = await request(app.getHttpServer())
      .post('/api/v1/candidate-auth/refresh')
      .set('Cookie', cookies)
      .send({})
      .expect(200);
    expect(refreshResponse.body.accessToken).toEqual(expect.any(String));
    const rotatedCookies = refreshResponse.headers['set-cookie'] as unknown as string[];
    expect(rotatedCookies.some((c) => c.startsWith('candidate_refresh_token='))).toBe(true);

    await request(app.getHttpServer()).post('/api/v1/candidate-auth/logout').set('Cookie', rotatedCookies).send({}).expect(200);
  });

  it('rejects refresh with 401 when neither body nor cookie provide a token', async () => {
    await request(app.getHttpServer()).post('/api/v1/candidate-auth/refresh').send({}).expect(401);
  });
});
```

- [ ] **Step 6: Run the test and verify it fails before the controller change would be reverted — then confirm it passes with the change in place**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand test/candidate-auth-cookie.e2e-spec.ts` (export `DATABASE_URL` first if your shell doesn't already have it — check `apps/api/.env`; running by file path, not a `-t` name filter, avoids a filter silently matching zero tests)
Expected: `Tests: 2 passed, 2 total` (the controller/DTO/main.ts changes from Steps 2–4 are already in place, so this confirms the new behavior rather than a red/green cycle — this endpoint has no prior cookie test to regress from).

- [ ] **Step 7: Run the full backend unit + e2e suites to confirm no regressions**

Run: `npm run test:api` (from repo root)
Expected: all suites pass, same count as before this task plus any new unit coverage untouched.

Run: `npm run test:exam-runtime` (from repo root)
Expected: all suites pass — `candidate-auth.service.ts` itself is unchanged, only the controller/DTO/bootstrap changed.

- [ ] **Step 8: Commit**

```bash
git add apps/exam-runtime/src/main.ts apps/exam-runtime/src/candidate-auth/candidate-auth.controller.ts apps/exam-runtime/src/candidate-auth/dto/refresh.dto.ts apps/exam-runtime/package.json apps/api/test/candidate-auth-cookie.e2e-spec.ts package-lock.json
git commit -m "feat: httpOnly refresh cookie for candidate-auth"
```

---

### Task 2: Frontend — Calm Focus styling tokens, candidate types, API client, CandidateButton

**Files:**
- Modify: `apps/web/tailwind.config.ts`
- Modify: `apps/web/lib/types.ts`
- Create: `apps/web/lib/candidate-api-client.ts`
- Create: `apps/web/lib/candidate-api-client.test.ts`
- Create: `apps/web/app/(candidate)/components/CandidateButton.tsx`
- Create: `apps/web/app/(candidate)/components/CandidateButton.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `candidateApiFetch(path, options?, accessToken?)`, `setCandidateUnauthorizedHandler(handler)` (Task 3 consumes both). Types `AttemptQuestionOption`, `AttemptQuestion`, `AttemptSection`, `AttemptAnswerSummary`, `AttemptMessageSummary`, `AttemptPreview`, `AttemptState`, `AttemptCurrent`, `isAttemptStarted()`, `ProctoringEventType` (Tasks 4–7 consume all of these). `<CandidateButton variant="primary" | "secondary" ...>` (Tasks 6–7 consume this).

- [ ] **Step 1: Add Calm Focus color tokens to the shared Tailwind config**

Edit `apps/web/tailwind.config.ts` — add a `candidate` key inside `theme.extend.colors`, alongside the existing `primary`/`accent`:

```ts
      colors: {
        primary: 'var(--color-primary, #1a73e8)',
        accent: 'var(--color-accent, #fbbc04)',
        candidate: {
          primary: '#2F6F5E',
          'primary-light': '#F0F7F4',
          bg: '#F4F7F6',
          review: '#B8860B',
          'review-bg': '#FBF3DD',
          'review-border': '#E8D8A8',
        },
      },
```

- [ ] **Step 2: Add candidate/attempt types**

Append to the end of `apps/web/lib/types.ts`:

```ts
export type ProctoringEventType =
  | 'tab_switch'
  | 'fullscreen_exit'
  | 'copy_paste'
  | 'right_click'
  | 'dev_tools_detected'
  | 'refresh_warning'
  | 'idle_timeout';

export interface AttemptQuestionOption {
  id: string;
  text: string;
}

export interface AttemptQuestion {
  id: string;
  text: string;
  type: QuestionType;
  marks: number;
  options: AttemptQuestionOption[];
}

export interface AttemptSection {
  title: string;
  targetDurationMinutes: number | null;
  questions: AttemptQuestion[];
}

export interface AttemptAnswerSummary {
  questionId: string;
  selectedOptionIds: string[];
  isMarkedForReview: boolean;
}

export interface AttemptMessageSummary {
  id: string;
  body: string;
  sentAt: string;
}

export interface AttemptPreview {
  exam: { title: string; instructions: string | null; durationMinutes: number };
}

export interface AttemptState {
  status: string;
  remainingSeconds: number;
  sections: AttemptSection[];
  answers: AttemptAnswerSummary[];
  messages: AttemptMessageSummary[];
}

export type AttemptCurrent = AttemptPreview | AttemptState;

export function isAttemptStarted(current: AttemptCurrent): current is AttemptState {
  return 'status' in current;
}
```

- [ ] **Step 3: Write the failing test for the candidate API client**

Create `apps/web/lib/candidate-api-client.test.ts`:

```ts
import { candidateApiFetch, setCandidateUnauthorizedHandler } from './candidate-api-client';

describe('candidateApiFetch', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    setCandidateUnauthorizedHandler(null);
  });

  it('calls the exam-runtime API base with an Authorization header when a token is given', async () => {
    global.fetch = jest.fn(async (url, options) => {
      expect(String(url)).toBe('http://localhost:3002/api/v1/attempt/current');
      expect((options as RequestInit).headers).toMatchObject({ Authorization: 'Bearer abc123' });
      return new Response(JSON.stringify({ exam: { title: 'T', instructions: null, durationMinutes: 30 } }), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await candidateApiFetch('/attempt/current', {}, 'abc123');
    expect(result.exam.title).toBe('T');
  });

  it('retries once via the unauthorized handler on a 401, excluding the refresh endpoint itself', async () => {
    let callCount = 0;
    global.fetch = jest.fn(async () => {
      callCount += 1;
      if (callCount === 1) return new Response(JSON.stringify({ message: 'expired' }), { status: 401 });
      return new Response(JSON.stringify({ exam: { title: 'T', instructions: null, durationMinutes: 30 } }), { status: 200 });
    }) as unknown as typeof fetch;
    setCandidateUnauthorizedHandler(async () => 'fresh-token');

    const result = await candidateApiFetch('/attempt/current', {});
    expect(result.exam.title).toBe('T');
    expect(callCount).toBe(2);
  });

  it('throws with the server message on a non-ok, non-retried response', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ message: 'This invitation was revoked' }), { status: 400 })) as unknown as typeof fetch;

    await expect(candidateApiFetch('/candidate-auth/redeem', { method: 'POST', body: JSON.stringify({ token: 'x' }) })).rejects.toThrow(
      'This invitation was revoked',
    );
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd apps/web && npx jest lib/candidate-api-client.test.ts`
Expected: FAIL — `Cannot find module './candidate-api-client'`.

- [ ] **Step 5: Implement the candidate API client**

Create `apps/web/lib/candidate-api-client.ts`:

```ts
const EXAM_RUNTIME_API_BASE = process.env.NEXT_PUBLIC_EXAM_RUNTIME_API_BASE ?? 'http://localhost:3002/api/v1';

let unauthorizedHandler: (() => Promise<string | null>) | null = null;

export function setCandidateUnauthorizedHandler(handler: (() => Promise<string | null>) | null) {
  unauthorizedHandler = handler;
}

async function doFetch(path: string, options: RequestInit, accessToken?: string): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return fetch(`${EXAM_RUNTIME_API_BASE}${path}`, { ...options, headers, credentials: 'include' });
}

export async function candidateApiFetch(path: string, options: RequestInit = {}, accessToken?: string) {
  let response = await doFetch(path, options, accessToken);

  if (response.status === 401 && unauthorizedHandler && path !== '/candidate-auth/refresh') {
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

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd apps/web && npx jest lib/candidate-api-client.test.ts`
Expected: `Tests: 3 passed, 3 total`.

- [ ] **Step 7: Write the failing test for CandidateButton**

Create `apps/web/app/(candidate)/components/CandidateButton.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CandidateButton } from './CandidateButton';

describe('CandidateButton', () => {
  it('renders children and responds to clicks', async () => {
    const onClick = jest.fn();
    render(<CandidateButton onClick={onClick}>Start exam</CandidateButton>);
    await userEvent.click(screen.getByRole('button', { name: 'Start exam' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies the secondary variant class', () => {
    render(<CandidateButton variant="secondary">Previous</CandidateButton>);
    expect(screen.getByRole('button', { name: 'Previous' })).toHaveClass('border-candidate-primary');
  });

  it('is disabled when the disabled prop is set', () => {
    render(<CandidateButton disabled>Next</CandidateButton>);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `cd apps/web && npx jest "app/(candidate)/components/CandidateButton.test.tsx"`
Expected: FAIL — `Cannot find module './CandidateButton'`.

- [ ] **Step 9: Implement CandidateButton**

Create `apps/web/app/(candidate)/components/CandidateButton.tsx`:

```tsx
import { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary';

interface CandidateButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-candidate-primary text-white hover:opacity-90',
  secondary: 'bg-white text-candidate-primary border border-candidate-primary hover:bg-candidate-primary-light',
};

export function CandidateButton({ variant = 'primary', className, disabled, ...props }: CandidateButtonProps) {
  return (
    <button
      className={clsx(
        'rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASSES[variant],
        className,
      )}
      disabled={disabled}
      {...props}
    />
  );
}
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `cd apps/web && npx jest "app/(candidate)/components/CandidateButton.test.tsx"`
Expected: `Tests: 3 passed, 3 total`.

- [ ] **Step 11: Commit**

```bash
git add apps/web/tailwind.config.ts apps/web/lib/types.ts apps/web/lib/candidate-api-client.ts apps/web/lib/candidate-api-client.test.ts "apps/web/app/(candidate)/components/CandidateButton.tsx" "apps/web/app/(candidate)/components/CandidateButton.test.tsx"
git commit -m "feat: Calm Focus styling tokens, candidate types, and API client"
```

---

### Task 3: Frontend — CandidateAuthProvider

**Files:**
- Create: `apps/web/lib/candidate-auth-context.tsx`
- Create: `apps/web/lib/candidate-auth-context.test.tsx`

**Interfaces:**
- Consumes: `candidateApiFetch`, `setCandidateUnauthorizedHandler` (Task 2).
- Produces: `<CandidateAuthProvider>`, `useCandidateAuth(): { accessToken: string | null; isLoading: boolean; redeem(token): Promise<void>; logout(): Promise<void> }` (Tasks 4, 6, 7 consume this).

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/candidate-auth-context.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CandidateAuthProvider, useCandidateAuth } from './candidate-auth-context';

function Probe() {
  const { accessToken, isLoading, redeem } = useCandidateAuth();
  if (isLoading) return <p>Loading</p>;
  return (
    <div>
      <p>{accessToken ? `token:${accessToken}` : 'no-token'}</p>
      <button onClick={() => redeem('invite-token')}>Redeem</button>
    </div>
  );
}

describe('CandidateAuthProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('silently refreshes on mount via the httpOnly cookie', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/candidate-auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'refreshed-token', refreshToken: 'rt' }), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    render(
      <CandidateAuthProvider>
        <Probe />
      </CandidateAuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('token:refreshed-token')).toBeInTheDocument());
  });

  it('leaves accessToken null when no cookie/session exists yet', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ message: 'Refresh token required' }), { status: 401 })) as unknown as typeof fetch;

    render(
      <CandidateAuthProvider>
        <Probe />
      </CandidateAuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('no-token')).toBeInTheDocument());
  });

  it('redeem() sets the access token from the redeem response', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/candidate-auth/refresh')) {
        return new Response(JSON.stringify({ message: 'none' }), { status: 401 });
      }
      if (String(url).endsWith('/candidate-auth/redeem')) {
        return new Response(JSON.stringify({ accessToken: 'redeemed-token', refreshToken: 'rt' }), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    render(
      <CandidateAuthProvider>
        <Probe />
      </CandidateAuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('no-token')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Redeem' }));
    await waitFor(() => expect(screen.getByText('token:redeemed-token')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx jest lib/candidate-auth-context.test.tsx`
Expected: FAIL — `Cannot find module './candidate-auth-context'`.

- [ ] **Step 3: Implement CandidateAuthProvider**

Create `apps/web/lib/candidate-auth-context.tsx`:

```tsx
'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { candidateApiFetch, setCandidateUnauthorizedHandler } from './candidate-api-client';

interface CandidateAuthContextValue {
  accessToken: string | null;
  isLoading: boolean;
  redeem: (token: string) => Promise<void>;
  logout: () => Promise<void>;
}

const CandidateAuthContext = createContext<CandidateAuthContextValue | undefined>(undefined);

export function CandidateAuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function silentRefresh(): Promise<string | null> {
    try {
      const result = await candidateApiFetch('/candidate-auth/refresh', { method: 'POST', body: JSON.stringify({}) });
      setAccessToken(result.accessToken);
      return result.accessToken;
    } catch {
      setAccessToken(null);
      return null;
    }
  }

  useEffect(() => {
    setCandidateUnauthorizedHandler(silentRefresh);
    silentRefresh().finally(() => setIsLoading(false));
    return () => setCandidateUnauthorizedHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function redeem(token: string) {
    const result = await candidateApiFetch('/candidate-auth/redeem', { method: 'POST', body: JSON.stringify({ token }) });
    setAccessToken(result.accessToken);
  }

  async function logout() {
    await candidateApiFetch('/candidate-auth/logout', { method: 'POST', body: JSON.stringify({}) }).catch(() => undefined);
    setAccessToken(null);
  }

  return (
    <CandidateAuthContext.Provider value={{ accessToken, isLoading, redeem, logout }}>{children}</CandidateAuthContext.Provider>
  );
}

export function useCandidateAuth(): CandidateAuthContextValue {
  const context = useContext(CandidateAuthContext);
  if (!context) {
    throw new Error('useCandidateAuth must be used within CandidateAuthProvider');
  }
  return context;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx jest lib/candidate-auth-context.test.tsx`
Expected: `Tests: 3 passed, 3 total`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/candidate-auth-context.tsx apps/web/lib/candidate-auth-context.test.tsx
git commit -m "feat: CandidateAuthProvider"
```

---

### Task 4: Frontend — attempt hooks and countdown timer

**Files:**
- Create: `apps/web/lib/hooks/useAttempt.ts`
- Create: `apps/web/lib/hooks/useAttempt.test.tsx`
- Create: `apps/web/lib/hooks/useCountdown.ts`
- Create: `apps/web/lib/hooks/useCountdown.test.tsx`

**Interfaces:**
- Consumes: `candidateApiFetch` (Task 2), `useCandidateAuth` (Task 3), `AttemptCurrent`/`ProctoringEventType` types (Task 2), `useToast` from `components/ui` (existing).
- Produces: `useAttemptQuery(): UseQueryResult<AttemptCurrent>`, `useStartAttempt(): UseMutationResult`, `useAnswerMutation(): { saveAnswer(questionId, selectedOptionIds, markedForReview?): void; flush(): Promise<void> }`, `useSubmitAttempt(): UseMutationResult`, `useReportProctoringEvent(): (eventType: ProctoringEventType, metadata?) => void`, `useCountdown(remainingSeconds: number | undefined, onExpire: () => void): number` (Tasks 5–7 consume all of these).

- [ ] **Step 1: Write the failing test for the attempt hooks**

Create `apps/web/lib/hooks/useAttempt.test.tsx`:

```tsx
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/ui';
import { CandidateAuthProvider } from '../candidate-auth-context';
import { useAttemptQuery, useAnswerMutation } from './useAttempt';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <CandidateAuthProvider>{children}</CandidateAuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

function AttemptProbe() {
  const { data, isLoading } = useAttemptQuery();
  if (isLoading || !data) return <p>Loading</p>;
  return <p>{'status' in data ? `status:${data.status}` : `preview:${data.exam.title}`}</p>;
}

describe('useAttemptQuery', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('fetches the current attempt once authenticated', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/candidate-auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'tok', refreshToken: 'rt' }), { status: 200 });
      }
      if (String(url).endsWith('/attempt/current')) {
        return new Response(JSON.stringify({ exam: { title: 'Preview Exam', instructions: null, durationMinutes: 30 } }), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    render(<AttemptProbe />, { wrapper });
    await waitFor(() => expect(screen.getByText('preview:Preview Exam')).toBeInTheDocument());
  });
});

describe('useAnswerMutation', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('debounces rapid saves for the same question into one request', async () => {
    jest.useFakeTimers();
    const calls: unknown[] = [];
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/candidate-auth/refresh')) {
        return new Response(JSON.stringify({ message: 'none' }), { status: 401 });
      }
      calls.push(JSON.parse((options as RequestInit).body as string));
      return new Response(JSON.stringify({ questionId: 'q1', selectedOptionIds: ['b'], isMarkedForReview: false }), { status: 200 });
    }) as unknown as typeof fetch;

    let hook: ReturnType<typeof useAnswerMutation> | undefined;
    function Probe() {
      hook = useAnswerMutation();
      return null;
    }
    render(<Probe />, { wrapper });
    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    act(() => {
      hook!.saveAnswer('q1', ['a']);
      hook!.saveAnswer('q1', ['b']);
    });
    await act(async () => {
      jest.advanceTimersByTime(800);
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ questionId: 'q1', selectedOptionIds: ['b'] });
  });

  it('flush() fires a pending save immediately without waiting for the debounce', async () => {
    const calls: unknown[] = [];
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/candidate-auth/refresh')) {
        return new Response(JSON.stringify({ message: 'none' }), { status: 401 });
      }
      calls.push(JSON.parse((options as RequestInit).body as string));
      return new Response(JSON.stringify({ questionId: 'q1', selectedOptionIds: ['a'], isMarkedForReview: false }), { status: 200 });
    }) as unknown as typeof fetch;

    let hook: ReturnType<typeof useAnswerMutation> | undefined;
    function Probe() {
      hook = useAnswerMutation();
      return null;
    }
    render(<Probe />, { wrapper });

    act(() => {
      hook!.saveAnswer('q1', ['a']);
    });
    await act(async () => {
      await hook!.flush();
    });

    expect(calls).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx jest lib/hooks/useAttempt.test.tsx`
Expected: FAIL — `Cannot find module './useAttempt'`.

- [ ] **Step 3: Implement the attempt hooks**

Create `apps/web/lib/hooks/useAttempt.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { candidateApiFetch } from '../candidate-api-client';
import { useCandidateAuth } from '../candidate-auth-context';
import { useToast } from '../../components/ui';
import { AttemptCurrent, ProctoringEventType } from '../types';

const ANSWER_DEBOUNCE_MS = 800;
const RETRY_ATTEMPTS = 3;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < RETRY_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 500));
      }
    }
  }
  throw lastError;
}

export function useAttemptQuery() {
  const { accessToken } = useCandidateAuth();
  return useQuery<AttemptCurrent>({
    queryKey: ['attempt', 'current'],
    queryFn: () => candidateApiFetch('/attempt/current', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useStartAttempt() {
  const { accessToken } = useCandidateAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => candidateApiFetch('/attempt/start', { method: 'POST', body: JSON.stringify({}) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attempt', 'current'] }),
  });
}

interface PendingAnswer {
  selectedOptionIds: string[];
  markedForReview?: boolean;
}

export function useAnswerMutation() {
  const { accessToken } = useCandidateAuth();
  const { toast } = useToast();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pending = useRef<Record<string, PendingAnswer>>({});

  function fire(questionId: string): Promise<void> {
    const payload = pending.current[questionId];
    if (!payload) return Promise.resolve();
    delete pending.current[questionId];
    delete timers.current[questionId];
    return withRetry(() =>
      candidateApiFetch(
        '/attempt/answer',
        { method: 'POST', body: JSON.stringify({ questionId, ...payload }) },
        accessToken ?? undefined,
      ),
    )
      .then(() => undefined)
      .catch(() => toast("Couldn't save your last answer — please check your connection.", 'error'));
  }

  function saveAnswer(questionId: string, selectedOptionIds: string[], markedForReview?: boolean) {
    pending.current[questionId] = { selectedOptionIds, markedForReview };
    if (timers.current[questionId]) {
      clearTimeout(timers.current[questionId]);
    }
    timers.current[questionId] = setTimeout(() => fire(questionId), ANSWER_DEBOUNCE_MS);
  }

  async function flush() {
    const questionIds = Object.keys(pending.current);
    questionIds.forEach((questionId) => {
      if (timers.current[questionId]) {
        clearTimeout(timers.current[questionId]);
      }
    });
    await Promise.all(questionIds.map((questionId) => fire(questionId)));
  }

  return { saveAnswer, flush };
}

export function useSubmitAttempt() {
  const { accessToken } = useCandidateAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => candidateApiFetch('/attempt/submit', { method: 'POST', body: JSON.stringify({}) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attempt', 'current'] }),
  });
}

export function useReportProctoringEvent() {
  const { accessToken } = useCandidateAuth();
  return function report(eventType: ProctoringEventType, metadata?: Record<string, unknown>) {
    candidateApiFetch(
      '/attempt/proctoring-event',
      { method: 'POST', body: JSON.stringify({ eventType, metadata }) },
      accessToken ?? undefined,
    ).catch(() => undefined);
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx jest lib/hooks/useAttempt.test.tsx`
Expected: `Tests: 3 passed, 3 total`.

- [ ] **Step 5: Write the failing test for the countdown hook**

Create `apps/web/lib/hooks/useCountdown.test.tsx`:

```tsx
import { render, screen, act } from '@testing-library/react';
import { useCountdown } from './useCountdown';

function CountdownProbe({ remainingSeconds, onExpire }: { remainingSeconds: number | undefined; onExpire: () => void }) {
  const seconds = useCountdown(remainingSeconds, onExpire);
  return <p>seconds:{seconds}</p>;
}

describe('useCountdown', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('ticks down once per second from the seeded value', () => {
    const onExpire = jest.fn();
    render(<CountdownProbe remainingSeconds={3} onExpire={onExpire} />);
    expect(screen.getByText('seconds:3')).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(1000));
    expect(screen.getByText('seconds:2')).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(1000));
    expect(screen.getByText('seconds:1')).toBeInTheDocument();
  });

  it('calls onExpire exactly once when it reaches zero and stays at zero', () => {
    const onExpire = jest.fn();
    render(<CountdownProbe remainingSeconds={1} onExpire={onExpire} />);

    act(() => jest.advanceTimersByTime(1000));
    expect(screen.getByText('seconds:0')).toBeInTheDocument();
    expect(onExpire).toHaveBeenCalledTimes(1);

    act(() => jest.advanceTimersByTime(2000));
    expect(screen.getByText('seconds:0')).toBeInTheDocument();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('re-seeds from a fresh remainingSeconds value (e.g. after a poll)', () => {
    const onExpire = jest.fn();
    const { rerender } = render(<CountdownProbe remainingSeconds={2} onExpire={onExpire} />);
    act(() => jest.advanceTimersByTime(2000));
    expect(onExpire).toHaveBeenCalledTimes(1);

    rerender(<CountdownProbe remainingSeconds={10} onExpire={onExpire} />);
    expect(screen.getByText('seconds:10')).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(1000));
    expect(screen.getByText('seconds:9')).toBeInTheDocument();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd apps/web && npx jest lib/hooks/useCountdown.test.tsx`
Expected: FAIL — `Cannot find module './useCountdown'`.

- [ ] **Step 7: Implement the countdown hook**

Create `apps/web/lib/hooks/useCountdown.ts`:

```ts
import { useEffect, useRef, useState } from 'react';

export function useCountdown(remainingSeconds: number | undefined, onExpire: () => void): number {
  const [displaySeconds, setDisplaySeconds] = useState(remainingSeconds ?? 0);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const firedRef = useRef(false);

  useEffect(() => {
    if (remainingSeconds !== undefined) {
      setDisplaySeconds(remainingSeconds);
      firedRef.current = false;
    }
  }, [remainingSeconds]);

  useEffect(() => {
    const interval = setInterval(() => {
      setDisplaySeconds((current) => {
        if (current <= 0) {
          if (!firedRef.current) {
            firedRef.current = true;
            onExpireRef.current();
          }
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return displaySeconds;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd apps/web && npx jest lib/hooks/useCountdown.test.tsx`
Expected: `Tests: 3 passed, 3 total`.

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/hooks/useAttempt.ts apps/web/lib/hooks/useAttempt.test.tsx apps/web/lib/hooks/useCountdown.ts apps/web/lib/hooks/useCountdown.test.tsx
git commit -m "feat: attempt data hooks and countdown timer"
```

---

### Task 5: Frontend — proctoring event monitor

**Files:**
- Create: `apps/web/lib/hooks/useProctoringMonitor.ts`
- Create: `apps/web/lib/hooks/useProctoringMonitor.test.tsx`

**Interfaces:**
- Consumes: `useReportProctoringEvent` (Task 4).
- Produces: `useProctoringMonitor(enabled: boolean): void` (Task 7 consumes this).

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/hooks/useProctoringMonitor.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import * as useAttemptModule from './useAttempt';
import { useProctoringMonitor } from './useProctoringMonitor';

function Probe({ enabled }: { enabled: boolean }) {
  useProctoringMonitor(enabled);
  return null;
}

describe('useProctoringMonitor', () => {
  let report: jest.Mock;

  beforeEach(() => {
    report = jest.fn();
    jest.spyOn(useAttemptModule, 'useReportProctoringEvent').mockReturnValue(report);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('does nothing when disabled', () => {
    render(<Probe enabled={false} />);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(report).not.toHaveBeenCalled();
  });

  it('reports tab_switch when the document becomes hidden, debounced', () => {
    render(<Probe enabled={true} />);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });

    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith('tab_switch', undefined);
  });

  it('reports right_click on contextmenu', () => {
    render(<Probe enabled={true} />);
    document.dispatchEvent(new Event('contextmenu'));
    expect(report).toHaveBeenCalledWith('right_click');
  });

  it('reports dev_tools_detected on F12', () => {
    render(<Probe enabled={true} />);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F12' }));
    expect(report).toHaveBeenCalledWith('dev_tools_detected', { trigger: 'shortcut' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx jest lib/hooks/useProctoringMonitor.test.tsx`
Expected: FAIL — `Cannot find module './useProctoringMonitor'`.

- [ ] **Step 3: Implement the proctoring monitor hook**

Create `apps/web/lib/hooks/useProctoringMonitor.ts`:

```ts
import { useEffect, useRef } from 'react';
import { useReportProctoringEvent } from './useAttempt';
import { ProctoringEventType } from '../types';

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const DEVTOOLS_POLL_MS = 2000;
const DEVTOOLS_SIZE_THRESHOLD = 160;
const TAB_SWITCH_DEBOUNCE_MS = 5000;

export function useProctoringMonitor(enabled: boolean): void {
  const report = useReportProctoringEvent();
  const debounceTimers = useRef<Partial<Record<ProctoringEventType, ReturnType<typeof setTimeout>>>>({});
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!enabled) return;

    function debouncedReport(eventType: ProctoringEventType, windowMs: number, metadata?: Record<string, unknown>) {
      if (debounceTimers.current[eventType]) return;
      report(eventType, metadata);
      debounceTimers.current[eventType] = setTimeout(() => {
        delete debounceTimers.current[eventType];
      }, windowMs);
    }

    function resetIdleTimer() {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => report('idle_timeout'), IDLE_TIMEOUT_MS);
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        debouncedReport('tab_switch', TAB_SWITCH_DEBOUNCE_MS);
      }
    }
    function onFullscreenChange() {
      if (!document.fullscreenElement) {
        debouncedReport('fullscreen_exit', TAB_SWITCH_DEBOUNCE_MS);
      }
    }
    function onCopy() {
      report('copy_paste', { action: 'copy' });
    }
    function onPaste() {
      report('copy_paste', { action: 'paste' });
    }
    function onContextMenu() {
      report('right_click');
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'F12' || (event.ctrlKey && event.shiftKey && event.key === 'I')) {
        report('dev_tools_detected', { trigger: 'shortcut' });
      }
      resetIdleTimer();
    }
    function onMouseMove() {
      resetIdleTimer();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousemove', onMouseMove);
    resetIdleTimer();

    const devtoolsInterval = setInterval(() => {
      const widthDelta = window.outerWidth - window.innerWidth;
      const heightDelta = window.outerHeight - window.innerHeight;
      if (widthDelta > DEVTOOLS_SIZE_THRESHOLD || heightDelta > DEVTOOLS_SIZE_THRESHOLD) {
        report('dev_tools_detected', { trigger: 'window-size' });
      }
    }, DEVTOOLS_POLL_MS);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousemove', onMouseMove);
      clearInterval(devtoolsInterval);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [enabled, report]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx jest lib/hooks/useProctoringMonitor.test.tsx`
Expected: `Tests: 4 passed, 4 total`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/hooks/useProctoringMonitor.ts apps/web/lib/hooks/useProctoringMonitor.test.tsx
git commit -m "feat: proctoring event detection and reporting"
```

---

### Task 6: Frontend — candidate layout, start, welcome, session-ended screens

**Files:**
- Create: `apps/web/app/(candidate)/layout.tsx`
- Create: `apps/web/app/(candidate)/start/page.tsx`
- Create: `apps/web/app/(candidate)/start/page.test.tsx`
- Create: `apps/web/app/(candidate)/welcome/page.tsx`
- Create: `apps/web/app/(candidate)/welcome/page.test.tsx`
- Create: `apps/web/app/(candidate)/session-ended/page.tsx`

**Interfaces:**
- Consumes: `CandidateAuthProvider`/`useCandidateAuth` (Task 3), `useAttemptQuery`/`useStartAttempt` (Task 4), `isAttemptStarted` (Task 2), `CandidateButton` (Task 2).
- Produces: routes `/start`, `/welcome`, `/session-ended`. Task 7 relies on `/welcome`'s Start button navigating to `/exam` and on the pattern established here for the session-dead redirect.

- [ ] **Step 1: Create the candidate route group layout**

Create `apps/web/app/(candidate)/layout.tsx`:

```tsx
import { CandidateAuthProvider } from '../../lib/candidate-auth-context';

export default function CandidateLayout({ children }: { children: React.ReactNode }) {
  return (
    <CandidateAuthProvider>
      <div className="min-h-screen bg-candidate-bg">{children}</div>
    </CandidateAuthProvider>
  );
}
```

- [ ] **Step 2: Create the session-ended screen (no test needed — static content, matches this repo's convention of not unit-testing purely static pages)**

Create `apps/web/app/(candidate)/session-ended/page.tsx`:

```tsx
export default function CandidateSessionEndedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-md rounded-lg bg-white p-6 text-center shadow-sm">
        <h1 className="mb-2 text-lg font-semibold text-gray-900">Your session has ended</h1>
        <p className="text-sm text-gray-600">
          This can happen if the exam was opened in another browser or tab, or if your session expired. If the exam is
          still open, use your invitation link again to continue.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write the failing test for the start (redemption) screen**

Create `apps/web/app/(candidate)/start/page.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';
import CandidateStartPage from './page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), useSearchParams: jest.fn() }));
jest.mock('../../../lib/candidate-auth-context', () => ({ useCandidateAuth: jest.fn() }));

describe('CandidateStartPage', () => {
  const push = jest.fn();

  beforeEach(() => {
    push.mockClear();
    (useRouter as jest.Mock).mockReturnValue({ push });
  });

  it('redeems the token from the query string and redirects to /welcome', async () => {
    const redeem = jest.fn().mockResolvedValue(undefined);
    (useCandidateAuth as jest.Mock).mockReturnValue({ redeem });
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('token=abc123'));

    render(<CandidateStartPage />);

    await waitFor(() => expect(redeem).toHaveBeenCalledWith('abc123'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/welcome'));
  });

  it('shows an error when the token is missing', async () => {
    (useCandidateAuth as jest.Mock).mockReturnValue({ redeem: jest.fn() });
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));

    render(<CandidateStartPage />);

    expect(await screen.findByText(/missing a token/)).toBeInTheDocument();
  });

  it('shows the server error message when redeem fails', async () => {
    const redeem = jest.fn().mockRejectedValue(new Error('This invitation was revoked'));
    (useCandidateAuth as jest.Mock).mockReturnValue({ redeem });
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('token=abc123'));

    render(<CandidateStartPage />);

    expect(await screen.findByText('This invitation was revoked')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd apps/web && npx jest "app/(candidate)/start/page.test.tsx"`
Expected: FAIL — `Cannot find module './page'`.

- [ ] **Step 5: Implement the start (redemption) screen**

Create `apps/web/app/(candidate)/start/page.tsx`:

```tsx
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';

function StartRedeemer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { redeem } = useCandidateAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setError('This invitation link is missing a token.');
      return;
    }
    redeem(token)
      .then(() => router.push('/welcome'))
      .catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  if (error) {
    return (
      <div className="max-w-md rounded-lg bg-white p-6 text-center shadow-sm">
        <h1 className="mb-2 text-lg font-semibold text-gray-900">Can&apos;t open this invitation</h1>
        <p className="text-sm text-gray-600">{error}</p>
      </div>
    );
  }

  return <p className="text-sm text-gray-500">Verifying your invitation…</p>;
}

export default function CandidateStartPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <Suspense fallback={<p className="text-sm text-gray-500">Loading…</p>}>
        <StartRedeemer />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd apps/web && npx jest "app/(candidate)/start/page.test.tsx"`
Expected: `Tests: 3 passed, 3 total`.

- [ ] **Step 7: Write the failing test for the welcome screen**

Create `apps/web/app/(candidate)/welcome/page.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { useAttemptQuery, useStartAttempt } from '../../../lib/hooks/useAttempt';
import CandidateWelcomePage from './page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));
jest.mock('../../../lib/hooks/useAttempt', () => ({ useAttemptQuery: jest.fn(), useStartAttempt: jest.fn() }));

describe('CandidateWelcomePage', () => {
  const push = jest.fn();

  beforeEach(() => {
    push.mockClear();
    (useRouter as jest.Mock).mockReturnValue({ push });
  });

  it('shows exam title, duration, instructions, and a monitoring disclosure before start', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { exam: { title: 'Backend Screening', instructions: 'Answer all questions.', durationMinutes: 45 } },
      isLoading: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });

    render(<CandidateWelcomePage />);

    expect(screen.getByText('Backend Screening')).toBeInTheDocument();
    expect(screen.getByText(/45 minutes/)).toBeInTheDocument();
    expect(screen.getByText('Answer all questions.')).toBeInTheDocument();
    expect(screen.getByText(/monitored/)).toBeInTheDocument();
  });

  it('starts the attempt and navigates to /exam', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' });
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { exam: { title: 'Backend Screening', instructions: null, durationMinutes: 45 } },
      isLoading: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });

    render(<CandidateWelcomePage />);
    await userEvent.click(screen.getByRole('button', { name: 'Start exam' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(push).toHaveBeenCalledWith('/exam'));
  });

  it('redirects straight to /exam if an attempt is already in progress (resume case)', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { status: 'in_progress', remainingSeconds: 100, sections: [], answers: [], messages: [] },
      isLoading: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });

    render(<CandidateWelcomePage />);

    expect(push).toHaveBeenCalledWith('/exam');
  });

  it('redirects to /session-ended when the attempt query errors (dead session)', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: undefined, isLoading: false, isError: true });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });

    render(<CandidateWelcomePage />);

    expect(push).toHaveBeenCalledWith('/session-ended');
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `cd apps/web && npx jest "app/(candidate)/welcome/page.test.tsx"`
Expected: FAIL — `Cannot find module './page'`.

- [ ] **Step 9: Implement the welcome screen**

Create `apps/web/app/(candidate)/welcome/page.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CandidateButton } from '../components/CandidateButton';
import { useAttemptQuery, useStartAttempt } from '../../../lib/hooks/useAttempt';
import { isAttemptStarted } from '../../../lib/types';

export default function CandidateWelcomePage() {
  const router = useRouter();
  const { data: current, isLoading, isError } = useAttemptQuery();
  const startAttempt = useStartAttempt();

  useEffect(() => {
    if (isError) {
      router.push('/session-ended');
    } else if (current && isAttemptStarted(current)) {
      router.push('/exam');
    }
  }, [current, isError, router]);

  if (isLoading || isError || !current || isAttemptStarted(current)) {
    return <p className="p-8 text-sm text-gray-500">Loading…</p>;
  }

  async function handleStart() {
    await startAttempt.mutateAsync();
    router.push('/exam');
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-8">
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-gray-900">{current.exam.title}</h1>
        <p className="mb-4 text-sm text-gray-600">Duration: {current.exam.durationMinutes} minutes</p>
        {current.exam.instructions && <p className="mb-4 whitespace-pre-wrap text-sm text-gray-700">{current.exam.instructions}</p>}
        <div className="mb-6 rounded-md bg-candidate-review-bg p-3 text-xs text-candidate-review">
          This exam is monitored. Tab switches, exiting fullscreen, copy/paste, right-click, and developer tools will be
          reported.
        </div>
        <CandidateButton onClick={handleStart} disabled={startAttempt.isPending} className="w-full">
          {startAttempt.isPending ? 'Starting…' : 'Start exam'}
        </CandidateButton>
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `cd apps/web && npx jest "app/(candidate)/welcome/page.test.tsx"`
Expected: `Tests: 4 passed, 4 total`.

- [ ] **Step 11: Commit**

```bash
git add "apps/web/app/(candidate)/layout.tsx" "apps/web/app/(candidate)/start" "apps/web/app/(candidate)/welcome" "apps/web/app/(candidate)/session-ended"
git commit -m "feat: candidate invitation redemption and welcome screens"
```

---

### Task 7: Frontend — exam session and submitted screens

**Files:**
- Create: `apps/web/app/(candidate)/components/QuestionNavigator.tsx`
- Create: `apps/web/app/(candidate)/components/QuestionNavigator.test.tsx`
- Create: `apps/web/app/(candidate)/exam/page.tsx`
- Create: `apps/web/app/(candidate)/exam/page.test.tsx`
- Create: `apps/web/app/(candidate)/submitted/page.tsx`

**Interfaces:**
- Consumes: `useAttemptQuery`, `useAnswerMutation`, `useSubmitAttempt` (Task 4), `useCountdown` (Task 4), `useProctoringMonitor` (Task 5), `CandidateButton` (Task 2), `Modal` from `components/ui` (existing), `isAttemptStarted`, `AttemptSection`, `AttemptAnswerSummary` (Task 2).
- Produces: routes `/exam`, `/submitted`. `flattenQuestions(sections)` exported from `QuestionNavigator.tsx` for reuse by the exam page.

- [ ] **Step 1: Write the failing test for QuestionNavigator**

Create `apps/web/app/(candidate)/components/QuestionNavigator.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuestionNavigator, flattenQuestions } from './QuestionNavigator';
import { AttemptSection, AttemptAnswerSummary } from '../../../lib/types';

const sections: AttemptSection[] = [
  {
    title: 'Section One',
    targetDurationMinutes: null,
    questions: [
      { id: 'q1', text: 'Q1', type: 'single_mcq', marks: 5, options: [{ id: 'o1', text: 'A' }] },
      { id: 'q2', text: 'Q2', type: 'single_mcq', marks: 5, options: [{ id: 'o2', text: 'B' }] },
    ],
  },
];

describe('flattenQuestions', () => {
  it('flattens all sections into one ordered list', () => {
    expect(flattenQuestions(sections).map((q) => q.id)).toEqual(['q1', 'q2']);
  });
});

describe('QuestionNavigator', () => {
  it('marks the current question and calls onSelect when another is clicked', async () => {
    const answers: AttemptAnswerSummary[] = [{ questionId: 'q1', selectedOptionIds: ['o1'], isMarkedForReview: false }];
    const onSelect = jest.fn();
    render(<QuestionNavigator sections={sections} answers={answers} currentIndex={0} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: 'Question 2' }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx jest "app/(candidate)/components/QuestionNavigator.test.tsx"`
Expected: FAIL — `Cannot find module './QuestionNavigator'`.

- [ ] **Step 3: Implement QuestionNavigator**

Create `apps/web/app/(candidate)/components/QuestionNavigator.tsx`:

```tsx
'use client';

import clsx from 'clsx';
import { AttemptAnswerSummary, AttemptSection } from '../../../lib/types';

export function flattenQuestions(sections: AttemptSection[]) {
  return sections.flatMap((section) => section.questions.map((question) => ({ ...question, sectionTitle: section.title })));
}

interface QuestionNavigatorProps {
  sections: AttemptSection[];
  answers: AttemptAnswerSummary[];
  currentIndex: number;
  onSelect: (index: number) => void;
}

export function QuestionNavigator({ sections, answers, currentIndex, onSelect }: QuestionNavigatorProps) {
  const questions = flattenQuestions(sections);
  const answersByQuestionId = new Map(answers.map((answer) => [answer.questionId, answer]));

  return (
    <div className="rounded-lg bg-white p-3 shadow-sm">
      <p className="mb-2 text-xs font-bold text-gray-500">QUESTIONS</p>
      <div className="grid grid-cols-4 gap-1.5">
        {questions.map((question, index) => {
          const answer = answersByQuestionId.get(question.id);
          const isCurrent = index === currentIndex;
          const isMarked = answer?.isMarkedForReview;
          const isAnswered = Boolean(answer && answer.selectedOptionIds.length > 0);
          return (
            <button
              key={question.id}
              onClick={() => onSelect(index)}
              aria-label={`Question ${index + 1}`}
              className={clsx(
                'flex aspect-square items-center justify-center rounded text-xs font-medium',
                isCurrent && 'border-[1.5px] border-candidate-primary bg-candidate-primary-light text-candidate-primary',
                !isCurrent && isMarked && 'border border-candidate-review-border bg-candidate-review-bg text-candidate-review',
                !isCurrent && !isMarked && isAnswered && 'bg-candidate-primary text-white',
                !isCurrent && !isMarked && !isAnswered && 'bg-gray-100 text-gray-400',
              )}
            >
              {index + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx jest "app/(candidate)/components/QuestionNavigator.test.tsx"`
Expected: `Tests: 2 passed, 2 total`.

- [ ] **Step 5: Create the submitted confirmation screen (static — no test, matches this repo's convention)**

Create `apps/web/app/(candidate)/submitted/page.tsx`:

```tsx
export default function CandidateSubmittedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-md rounded-lg bg-white p-6 text-center shadow-sm">
        <h1 className="mb-2 text-lg font-semibold text-candidate-primary">Exam submitted</h1>
        <p className="text-sm text-gray-600">Your exam has been submitted. Results will be reviewed by the recruiter.</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Write the failing test for the exam screen**

Create `apps/web/app/(candidate)/exam/page.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { useAttemptQuery, useAnswerMutation, useSubmitAttempt } from '../../../lib/hooks/useAttempt';
import { useCountdown } from '../../../lib/hooks/useCountdown';
import { useProctoringMonitor } from '../../../lib/hooks/useProctoringMonitor';
import CandidateExamPage from './page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));
jest.mock('../../../lib/hooks/useAttempt', () => ({
  useAttemptQuery: jest.fn(),
  useAnswerMutation: jest.fn(),
  useSubmitAttempt: jest.fn(),
}));
jest.mock('../../../lib/hooks/useCountdown', () => ({ useCountdown: jest.fn() }));
jest.mock('../../../lib/hooks/useProctoringMonitor', () => ({ useProctoringMonitor: jest.fn() }));

const attemptState = {
  status: 'in_progress',
  remainingSeconds: 590,
  sections: [
    {
      title: 'Section One',
      targetDurationMinutes: null,
      questions: [
        { id: 'q1', text: 'What is 2 + 2?', type: 'single_mcq', marks: 5, options: [{ id: 'o1', text: '4' }, { id: 'o2', text: '5' }] },
      ],
    },
  ],
  answers: [],
  messages: [],
};

describe('CandidateExamPage', () => {
  const push = jest.fn();
  const saveAnswer = jest.fn();
  const flush = jest.fn().mockResolvedValue(undefined);
  const mutateAsync = jest.fn().mockResolvedValue({ status: 'submitted' });

  beforeEach(() => {
    push.mockClear();
    saveAnswer.mockClear();
    flush.mockClear();
    mutateAsync.mockClear();
    (useRouter as jest.Mock).mockReturnValue({ push });
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: attemptState, isError: false });
    (useAnswerMutation as jest.Mock).mockReturnValue({ saveAnswer, flush });
    (useSubmitAttempt as jest.Mock).mockReturnValue({ mutateAsync, isPending: false, isError: false, mutate: jest.fn() });
    (useCountdown as jest.Mock).mockReturnValue(590);
    (useProctoringMonitor as jest.Mock).mockReturnValue(undefined);
  });

  it('renders the current question and saves an answer on selection', async () => {
    render(<CandidateExamPage />);

    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /4/ }));

    expect(saveAnswer).toHaveBeenCalledWith('q1', ['o1'], undefined);
  });

  it('toggles mark-for-review', async () => {
    render(<CandidateExamPage />);
    await userEvent.click(screen.getByRole('button', { name: /Mark for review/ }));
    expect(saveAnswer).toHaveBeenCalledWith('q1', [], undefined);
  });

  it('flushes pending answers and submits on confirm', async () => {
    render(<CandidateExamPage />);

    // With only one question, both the question-card's "Review & Submit" (shown on the
    // last question) and the sidebar's standalone one render at once — either works.
    await userEvent.click(screen.getAllByRole('button', { name: 'Review & Submit' })[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(flush).toHaveBeenCalled());
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(push).toHaveBeenCalledWith('/submitted'));
  });

  it('redirects to /session-ended when the attempt query errors (dead session)', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: undefined, isError: true });

    render(<CandidateExamPage />);

    expect(push).toHaveBeenCalledWith('/session-ended');
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `cd apps/web && npx jest "app/(candidate)/exam/page.test.tsx"`
Expected: FAIL — `Cannot find module './page'`.

- [ ] **Step 8: Implement the exam screen**

Create `apps/web/app/(candidate)/exam/page.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { Modal } from '../../../components/ui';
import { CandidateButton } from '../components/CandidateButton';
import { QuestionNavigator, flattenQuestions } from '../components/QuestionNavigator';
import { useAttemptQuery, useAnswerMutation, useSubmitAttempt } from '../../../lib/hooks/useAttempt';
import { useCountdown } from '../../../lib/hooks/useCountdown';
import { useProctoringMonitor } from '../../../lib/hooks/useProctoringMonitor';
import { isAttemptStarted } from '../../../lib/types';

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function markButtonClasses(marked: boolean | undefined) {
  return clsx(
    'rounded-full border px-2 py-0.5 text-xs',
    marked ? 'border-candidate-review-border bg-candidate-review-bg text-candidate-review' : 'border-gray-200 text-gray-400',
  );
}

function optionClasses(selected: boolean) {
  return clsx(
    'rounded-lg border px-3 py-2 text-left text-sm',
    selected
      ? 'border-[1.5px] border-candidate-primary bg-candidate-primary-light font-semibold text-candidate-primary'
      : 'border-gray-200 text-gray-700',
  );
}

export default function CandidateExamPage() {
  const router = useRouter();
  const { data: current, isError } = useAttemptQuery();
  const { saveAnswer, flush } = useAnswerMutation();
  const submitAttempt = useSubmitAttempt();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [localSelections, setLocalSelections] = useState<Record<string, string[]>>({});

  const started = Boolean(current && isAttemptStarted(current));
  useProctoringMonitor(started);

  async function finishSubmit() {
    if (submitAttempt.isPending) return;
    await flush();
    await submitAttempt.mutateAsync();
    router.push('/submitted');
  }

  const remainingSeconds = useCountdown(started && current ? (current as { remainingSeconds: number }).remainingSeconds : undefined, () => {
    finishSubmit();
  });

  useEffect(() => {
    if (isError) {
      router.push('/session-ended');
    } else if (current && !isAttemptStarted(current)) {
      router.push('/welcome');
    }
  }, [current, isError, router]);

  const questions = useMemo(() => (started && current ? flattenQuestions((current as { sections: typeof current extends { sections: infer S } ? S : never }).sections) : []), [started, current]);
  const question = questions[currentIndex];
  const answers = started && current ? (current as { answers: AttemptAnswerSummaryType }).answers : [];
  const existingAnswer = answers.find((answer) => answer.questionId === question?.id);
  const selectedOptionIds = question ? localSelections[question.id] ?? existingAnswer?.selectedOptionIds ?? [] : [];
  const unansweredCount = questions.filter((q) => {
    const a = answers.find((ans) => ans.questionId === q.id);
    return !a || a.selectedOptionIds.length === 0;
  }).length;

  if (!started || !current || !isAttemptStarted(current) || !question) {
    return <p className="p-8 text-sm text-gray-500">Loading…</p>;
  }

  function toggleOption(optionId: string) {
    const isMulti = question!.type === 'multi_mcq';
    const next = isMulti
      ? selectedOptionIds.includes(optionId)
        ? selectedOptionIds.filter((id) => id !== optionId)
        : [...selectedOptionIds, optionId]
      : [optionId];
    setLocalSelections((prev) => ({ ...prev, [question!.id]: next }));
    saveAnswer(question!.id, next, existingAnswer?.isMarkedForReview);
  }

  function toggleMarkForReview() {
    saveAnswer(question!.id, selectedOptionIds, !existingAnswer?.isMarkedForReview);
  }

  async function handleConfirmSubmit() {
    setConfirmOpen(false);
    await finishSubmit();
  }

  return (
    <div className="mx-auto max-w-4xl p-4">
      <div className="mb-4 flex items-center justify-between rounded-lg bg-white px-4 py-3 shadow-sm">
        <button
          onClick={() => setNavigatorOpen((open) => !open)}
          className="rounded-full bg-candidate-primary-light px-3 py-1 text-xs font-bold text-candidate-primary lg:hidden"
        >
          Q{currentIndex + 1}/{questions.length} ▾
        </button>
        <span className="hidden text-sm font-bold text-candidate-primary lg:inline">
          Question {currentIndex + 1} of {questions.length}
        </span>
        <span className="rounded-full bg-candidate-primary-light px-3 py-1 text-xs font-bold text-candidate-primary">
          ⏱ {formatTime(remainingSeconds)}
        </span>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 rounded-lg bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">
              {question.type === 'multi_mcq' ? 'MULTIPLE CHOICE' : 'SINGLE CHOICE'} · {question.marks} MARKS
            </span>
            <button onClick={toggleMarkForReview} className={markButtonClasses(existingAnswer?.isMarkedForReview)}>
              {existingAnswer?.isMarkedForReview ? '★ Marked for review' : '☆ Mark for review'}
            </button>
          </div>
          <p className="mb-4 text-sm text-gray-800">{question.text}</p>
          <div className="flex flex-col gap-2">
            {question.options.map((option) => (
              <button key={option.id} onClick={() => toggleOption(option.id)} className={optionClasses(selectedOptionIds.includes(option.id))}>
                {selectedOptionIds.includes(option.id) ? '◉' : '○'} {option.text}
              </button>
            ))}
          </div>
          <div className="mt-4 flex justify-between">
            <CandidateButton variant="secondary" disabled={currentIndex === 0} onClick={() => setCurrentIndex((i) => i - 1)}>
              ← Previous
            </CandidateButton>
            {currentIndex < questions.length - 1 ? (
              <CandidateButton onClick={() => setCurrentIndex((i) => i + 1)}>Next →</CandidateButton>
            ) : (
              <CandidateButton onClick={() => setConfirmOpen(true)}>Review & Submit</CandidateButton>
            )}
          </div>
        </div>

        <div className="hidden w-40 shrink-0 lg:block">
          <QuestionNavigator sections={current.sections} answers={answers} currentIndex={currentIndex} onSelect={setCurrentIndex} />
          <CandidateButton onClick={() => setConfirmOpen(true)} className="mt-3 w-full text-xs">
            Review & Submit
          </CandidateButton>
        </div>
      </div>

      {navigatorOpen && (
        <div className="fixed inset-0 z-10 flex items-end bg-black/30 lg:hidden" onClick={() => setNavigatorOpen(false)}>
          <div className="w-full rounded-t-xl bg-candidate-bg p-4" onClick={(event) => event.stopPropagation()}>
            <QuestionNavigator
              sections={current.sections}
              answers={answers}
              currentIndex={currentIndex}
              onSelect={(index) => {
                setCurrentIndex(index);
                setNavigatorOpen(false);
              }}
            />
          </div>
        </div>
      )}

      <Modal open={confirmOpen} title="Submit exam?" onClose={() => setConfirmOpen(false)}>
        <p className="mb-4 text-sm text-gray-600">
          {unansweredCount > 0
            ? `You have ${unansweredCount} unanswered question${unansweredCount === 1 ? '' : 's'}. Once submitted, you cannot make further changes.`
            : 'Once submitted, you cannot make further changes.'}
        </p>
        <div className="flex justify-end gap-2">
          <CandidateButton variant="secondary" onClick={() => setConfirmOpen(false)}>
            Keep reviewing
          </CandidateButton>
          <CandidateButton onClick={handleConfirmSubmit} disabled={submitAttempt.isPending}>
            {submitAttempt.isPending ? 'Submitting…' : 'Submit'}
          </CandidateButton>
        </div>
      </Modal>

      <Modal open={submitAttempt.isError} title="Couldn't submit" onClose={() => undefined}>
        <p className="mb-4 text-sm text-gray-600">Your submission didn&apos;t go through. Your answers are saved — please retry.</p>
        <div className="flex justify-end">
          <CandidateButton onClick={() => submitAttempt.mutate()}>Retry</CandidateButton>
        </div>
      </Modal>
    </div>
  );
}
```

**Note on the two `as` type helpers above (`AttemptAnswerSummaryType`, the inline `S` conditional):** replace them with a plain top-of-file import and a direct narrow instead of an inline conditional type — the `isAttemptStarted()` type guard from Task 2 already narrows `current` to `AttemptState` correctly. Rewrite the two problem lines as:

```ts
import { AttemptAnswerSummary, isAttemptStarted } from '../../../lib/types';
...
  const attemptState = current && isAttemptStarted(current) ? current : null;
  const questions = useMemo(() => (attemptState ? flattenQuestions(attemptState.sections) : []), [attemptState]);
  const question = questions[currentIndex];
  const answers: AttemptAnswerSummary[] = attemptState?.answers ?? [];
```

and remove the `started`-based casts elsewhere in the file (`current.sections`, `current.answers` in the JSX below) by using `attemptState.sections` / `answers` instead, and change the early-return guard to `if (isError || !attemptState || !question)` (the `isError` branch renders the same loading placeholder while the `useEffect` above performs the actual redirect to `/session-ended`). Apply this cleanup during Step 8 itself — the snippet above documents the fix rather than a separate step, since Step 8's file must compile before Step 9 can run.

- [ ] **Step 9: Run the test to verify it passes**

Run: `cd apps/web && npx jest "app/(candidate)/exam/page.test.tsx"`
Expected: `Tests: 4 passed, 4 total`.

- [ ] **Step 10: Run the full frontend unit suite to confirm no regressions**

Run: `cd apps/web && npm test`
Expected: all suites pass, including every test file from Tasks 2–7.

- [ ] **Step 11: Commit**

```bash
git add "apps/web/app/(candidate)/components/QuestionNavigator.tsx" "apps/web/app/(candidate)/components/QuestionNavigator.test.tsx" "apps/web/app/(candidate)/exam" "apps/web/app/(candidate)/submitted"
git commit -m "feat: candidate exam session and submitted confirmation screens"
```

---

### Task 8: Playwright e2e candidate golden path

**Files:**
- Create: `apps/web/e2e/candidate-golden-path.spec.ts`
- Modify: `apps/web/.env.local` or equivalent — only if `NEXT_PUBLIC_EXAM_RUNTIME_API_BASE` needs a non-default value for your local run; otherwise no change needed since Task 2's default (`http://localhost:3002/api/v1`) matches `apps/exam-runtime`'s default dev port.

**Interfaces:**
- Consumes: the full recruiter golden-path flow (existing, `apps/web/e2e/recruiter-golden-path.spec.ts`) to create and invite a candidate, then the candidate screens from Tasks 6–7.
- Produces: end-to-end proof the full loop works against real running `apps/api`, `apps/exam-runtime`, and `apps/web` dev servers.

- [ ] **Step 1: Write the e2e spec**

Create `apps/web/e2e/candidate-golden-path.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const ORG_SLUG = process.env.E2E_ORG_SLUG ?? 'demo-org';
const RECRUITER_EMAIL = process.env.E2E_RECRUITER_EMAIL ?? 'recruiter@demo-org.test';
const RECRUITER_PASSWORD = process.env.E2E_RECRUITER_PASSWORD ?? 'Passw0rd!2026';

test('candidate redeems an invitation, takes an exam, and submits', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Organization slug').fill(ORG_SLUG);
  await page.getByLabel('Email').fill(RECRUITER_EMAIL);
  await page.getByLabel('Password').fill(RECRUITER_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('link', { name: 'Question Bank' }).click();
  await page.getByRole('link', { name: 'New question' }).click();
  await page.getByLabel('Question text').fill('What is the capital of France?');
  await page.getByLabel('Marks', { exact: true }).fill('5');
  const optionInputs = page.getByLabel(/Option \d text/);
  await optionInputs.nth(0).fill('Paris');
  await optionInputs.nth(1).fill('London');
  await page.getByRole('radio', { name: 'Option 1 correct' }).click();
  await page.getByRole('button', { name: 'Create question' }).click();
  await expect(page).toHaveURL(/\/questions$/);

  await page.getByRole('link', { name: 'Exams' }).click();
  await page.getByRole('link', { name: 'New exam' }).click();
  const examTitle = `Candidate Path Exam ${Date.now()}`;
  await page.getByLabel('Title').fill(examTitle);
  await page.getByRole('button', { name: 'Create exam' }).click();
  await expect(page).toHaveURL(/\/exams\/.+\/edit$/);

  await page.getByRole('tab', { name: 'Sections & Questions' }).click();
  await page.getByLabel('New section title').fill('Section One');
  await page.getByRole('button', { name: 'Add section' }).click();
  await page.getByRole('button', { name: 'Manage questions' }).click();
  await page.getByRole('checkbox', { name: /What is the capital of France\?/ }).first().click();
  await page.getByRole('button', { name: 'Save questions' }).click();

  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page).toHaveURL(/\/exams$/);

  await page.getByRole('link', { name: 'Candidates' }).click();
  const candidateEmail = `candidate-path-${Date.now()}@example.com`;
  await page.getByLabel('Name').fill('Candidate Path Person');
  await page.getByLabel('Email').fill(candidateEmail);
  await page.getByRole('button', { name: 'Add candidate' }).click();
  await expect(page.getByText(candidateEmail)).toBeVisible();

  await page.getByLabel('Exam to invite to').click();
  await page.getByRole('option', { name: examTitle, exact: true }).click();
  await page.getByRole('row', { name: candidateEmail }).getByRole('checkbox', { name: 'Candidate Path Person' }).click();

  const [inviteResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/invitations') && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Send invitations' }).click(),
  ]);
  const inviteBody = await inviteResponse.json();
  const token: string = inviteBody.created[0].token;

  await page.goto(`/start?token=${token}`);
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByText(examTitle)).toBeVisible();
  await page.getByRole('button', { name: 'Start exam' }).click();
  await expect(page).toHaveURL(/\/exam$/);

  await expect(page.getByText('What is the capital of France?')).toBeVisible();
  await page.getByRole('button', { name: /Paris/ }).click();
  await page.getByRole('button', { name: /Mark for review/ }).click();
  await expect(page.getByRole('button', { name: /Marked for review/ })).toBeVisible();

  await page.getByRole('button', { name: 'Review & Submit' }).first().click();
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page).toHaveURL(/\/submitted$/);
  await expect(page.getByText('Exam submitted')).toBeVisible();
});
```

- [ ] **Step 2: Start dev servers and run the spec**

Ensure `apps/api`, `apps/exam-runtime`, and `apps/web` dev servers are running (per this repo's established local-dev port-conflict handling — see `dev:api`/`dev:web`/`dev:exam-runtime` root scripts, adjusting `API_PORT`/`NEXT_PUBLIC_API_BASE`/`NEXT_PUBLIC_EXAM_RUNTIME_API_BASE`/`WEB_ORIGIN` if the default ports are unavailable).

Run: `cd apps/web && npx playwright test e2e/candidate-golden-path.spec.ts`
Expected: `1 passed`.

- [ ] **Step 3: Run it a second time to confirm it isn't flaky**

Run: `cd apps/web && npx playwright test e2e/candidate-golden-path.spec.ts`
Expected: `1 passed`, consistent with the first run.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/candidate-golden-path.spec.ts
git commit -m "test: Playwright candidate golden-path e2e spec"
```

---

### Task 9: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full backend suites**

Run from repo root: `npm run test:api && npm run test:api:e2e && npm run test:exam-runtime && npm run test:shared`
Expected: all pass, including the new `candidate-auth-cookie.e2e-spec.ts` from Task 1.

- [ ] **Step 2: Full frontend unit suite**

Run: `cd apps/web && npm test`
Expected: all pass, including every new test file from Tasks 2–7.

- [ ] **Step 3: Full Playwright suite (both golden paths)**

Run: `cd apps/web && npx playwright test`
Expected: `recruiter-golden-path.spec.ts`, the org-admin golden path, and the new `candidate-golden-path.spec.ts` all pass.

- [ ] **Step 4: Manual smoke check**

With dev servers running, manually redeem a freshly-created invitation in a real browser: confirm the Calm Focus visual identity renders correctly, the sidebar navigator collapses to a drawer below the `lg` breakpoint (resize the window or use device emulation), the timer counts down, and switching tabs during the exam produces a `tab_switch` proctoring event visible in the database (`SELECT * FROM ProctoringEvent ORDER BY "occurredAt" DESC` or via the org-admin audit log if proctoring events are surfaced there).

- [ ] **Step 5: Update the SDD progress ledger**

Append to `.superpowers/sdd/progress.md`:

```
## Candidate Exam-Taking Frontend
Task 1: complete (httpOnly candidate refresh cookie)
Task 2: complete (Calm Focus tokens, types, API client, CandidateButton)
Task 3: complete (CandidateAuthProvider)
Task 4: complete (attempt hooks, countdown)
Task 5: complete (proctoring monitor)
Task 6: complete (start/welcome/session-ended screens)
Task 7: complete (exam/submitted screens)
Task 8: complete (Playwright candidate golden path)
Task 9: complete (final verification)
```
