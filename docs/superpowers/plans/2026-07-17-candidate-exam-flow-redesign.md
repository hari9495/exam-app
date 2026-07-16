# Candidate Exam Flow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the candidate exam flow's visual layer (all 5 routes under `apps/web/app/(candidate)/`) to a denser, testing-platform-standard look, and build the webcam proctoring warning/block overlays that currently render as a jarring full-page text swap instead of the confirmed overlay-on-dimmed-content treatment.

**Architecture:** Extend the existing `candidate.*` Tailwind token set (new danger/border/text tiers), replace unicode glyphs with `lucide-react` icons, and introduce five small new components (`TimerBar`, `TerminalCard`, `CameraPreview`, `ProctoringWarningOverlay`/`ProctoringBlockOverlay`, `CodeOutputPanel`) that the existing pages compose. No new state-management pattern, no new backend endpoints — one small additive backend field (`examTitle` on the started-attempt response) is the only server-side change.

**Tech Stack:** Next.js (App Router), Tailwind CSS, `clsx`, `lucide-react` (new dependency), Jest + Testing Library, Playwright, NestJS (the one backend field).

## Global Constraints

- Palette stays sage-green (`#2F6F5E`) as the sole brand accent; new tiers are amber (reusing the existing `candidate.review*` tokens) and a new `candidate.danger*` tier — three semantic tiers total, no others.
- Icons: `lucide-react` only, no other icon library, no more unicode glyphs (◉/○ stays a custom two-state dot per the confirmed mockup — it is not replaced by an icon).
- Desktop-first: the existing `lg:` breakpoint swap between the sidebar navigator and the mobile bottom-drawer is preserved structurally; no new responsive breakpoints are introduced.
- No visual regression testing / pixel-diffing — Playwright/unit tests assert structure and text content only, per the approved spec's Testing section.
- Every new component is a plain function component with a typed props interface — no new global state, no new context providers.
- Preserve every existing accessible name / test-facing copy string that current tests rely on: `"Enable camera"`, `"Start exam"`, `"Mark for review"` / `"Marked for review"`, `"Review & Submit"`, `"Submit"`, `"Continue"`, `"Exit code: {n}"`, `"Warning {n}/3"` (as a substring), `"recruiter needs to unblock"` (as a substring), `"Exam submitted"`. Where the confirmed mockup's illustrative copy differs from these (e.g. mockup said "Continue exam" / "Warning 1 of 3" / "proctor"), this plan uses the existing exact strings instead — the mockups confirmed the *visual treatment*, not literal wording, and preserving these strings avoids unrelated test churn.

---

## File Structure

**New files:**
- `apps/web/app/(candidate)/components/TimerBar.tsx` — 3-stage color timer bar + badge; exports `TimerBar`, `timerTier`, `formatTime`.
- `apps/web/app/(candidate)/components/TimerBar.test.tsx`
- `apps/web/app/(candidate)/components/TerminalCard.tsx` — icon-circle + title + body card used by 4 terminal screens.
- `apps/web/app/(candidate)/components/TerminalCard.test.tsx`
- `apps/web/app/(candidate)/components/CameraPreview.tsx` — welcome-screen camera check box (connected/blocked/checking states), owns the `getUserMedia` probe.
- `apps/web/app/(candidate)/components/CameraPreview.test.tsx`
- `apps/web/app/(candidate)/components/ProctoringOverlay.tsx` — exports `ProctoringWarningOverlay`, `ProctoringBlockOverlay`.
- `apps/web/app/(candidate)/components/ProctoringOverlay.test.tsx`
- `apps/web/app/(candidate)/components/CodeOutputPanel.tsx` — status badge + stdout/stderr rendering for a `RunCodeResult`.
- `apps/web/app/(candidate)/components/CodeOutputPanel.test.tsx`

**Modified files:**
- `apps/web/tailwind.config.ts` — new `candidate.danger*`/`border`/`text*` tokens.
- `apps/web/package.json` — add `lucide-react`.
- `apps/web/app/(candidate)/start/page.tsx` — use `TerminalCard` for loading/error.
- `apps/web/app/(candidate)/submitted/page.tsx` — use `TerminalCard`.
- `apps/web/app/(candidate)/session-ended/page.tsx` — use `TerminalCard`.
- `apps/web/app/(candidate)/welcome/page.tsx` — use `CameraPreview`, sectioned layout.
- `apps/web/app/(candidate)/exam/page.tsx` — overlay restructure, code panel integration, top-bar/timer/navigator/submit-modal redesign.
- `apps/web/app/(candidate)/exam/page.test.tsx` — cover the restructured overlay + new visible text.
- `apps/web/app/(candidate)/components/QuestionNavigator.tsx` — add color legend.
- `apps/web/lib/types.ts` — add `exam: { title: string }` to `AttemptState`.
- `apps/exam-runtime/src/attempts/attempt.service.ts` — add `exam.title` to the started-attempt response.
- `apps/exam-runtime/src/attempts/attempt.service.spec.ts` — update the one affected `toEqual`.

---

### Task 1: Design tokens, lucide-react, TimerBar

**Files:**
- Modify: `apps/web/tailwind.config.ts`
- Modify: `apps/web/package.json`
- Create: `apps/web/app/(candidate)/components/TimerBar.tsx`
- Create: `apps/web/app/(candidate)/components/TimerBar.test.tsx`

**Interfaces:**
- Produces: `TimerBar({ remainingSeconds, totalSeconds }: { remainingSeconds: number; totalSeconds: number })` — every later task that needs a formatted `m:ss` string imports `formatTime` from this file instead of re-declaring it. `timerTier(remainingSeconds, totalSeconds): 'ok' | 'warn' | 'danger'` is also exported for reuse.

- [ ] **Step 1: Add the new candidate design tokens**

Replace the `candidate` block in `apps/web/tailwind.config.ts` (lines 10-17):

```ts
        candidate: {
          primary: '#2F6F5E',
          'primary-light': '#F0F7F4',
          bg: '#F4F7F6',
          review: '#B8860B',
          'review-bg': '#FBF3DD',
          'review-border': '#E8D8A8',
          danger: '#B23B3B',
          'danger-bg': '#FBEAEA',
          'danger-border': '#F0C9C9',
          border: '#E4E7E5',
          text: '#1A1F1D',
          'text-secondary': '#57615B',
          'text-tertiary': '#6B7570',
          'text-faint': '#9AA5A0',
        },
```

- [ ] **Step 2: Install lucide-react**

Run: `cd apps/web && npm install lucide-react`
Expected: `apps/web/package.json`'s `dependencies` gains a `"lucide-react": "^X.Y.Z"` line (alongside the existing `clsx`/`@monaco-editor/react` entries), and root `package-lock.json` updates.

- [ ] **Step 3: Write the failing test for TimerBar**

Create `apps/web/app/(candidate)/components/TimerBar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { TimerBar, timerTier, formatTime } from './TimerBar';

describe('timerTier', () => {
  it('returns ok above 50% remaining', () => {
    expect(timerTier(600, 1000)).toBe('ok');
  });

  it('returns warn between 15% and 50% remaining, inclusive of the 50% boundary', () => {
    expect(timerTier(500, 1000)).toBe('warn');
    expect(timerTier(300, 1000)).toBe('warn');
  });

  it('returns danger at or below 15% remaining', () => {
    expect(timerTier(150, 1000)).toBe('danger');
    expect(timerTier(0, 1000)).toBe('danger');
  });

  it('returns ok when totalSeconds is zero, avoiding a divide-by-zero', () => {
    expect(timerTier(0, 0)).toBe('ok');
  });
});

describe('formatTime', () => {
  it('formats seconds as m:ss with zero-padded seconds', () => {
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(3599)).toBe('59:59');
    expect(formatTime(0)).toBe('0:00');
  });
});

describe('TimerBar', () => {
  it('renders the remaining time', () => {
    render(<TimerBar remainingSeconds={300} totalSeconds={1000} />);
    expect(screen.getByText('5:00 remaining')).toBeInTheDocument();
  });

  it('renders a bar whose width reflects the remaining fraction', () => {
    render(<TimerBar remainingSeconds={250} totalSeconds={1000} />);
    const bar = screen.getByTestId('timer-bar-fill');
    expect(bar).toHaveStyle({ width: '25%' });
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd apps/web && npx jest --testPathPattern="TimerBar.test.tsx"`
Expected: FAIL — `Cannot find module './TimerBar'`.

- [ ] **Step 5: Implement TimerBar**

Create `apps/web/app/(candidate)/components/TimerBar.tsx`:

```tsx
'use client';

import clsx from 'clsx';
import { Clock } from 'lucide-react';

export type TimerTier = 'ok' | 'warn' | 'danger';

export function timerTier(remainingSeconds: number, totalSeconds: number): TimerTier {
  if (totalSeconds <= 0) return 'ok';
  const fraction = remainingSeconds / totalSeconds;
  if (fraction <= 0.15) return 'danger';
  if (fraction <= 0.5) return 'warn';
  return 'ok';
}

export function formatTime(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const BADGE_CLASSES: Record<TimerTier, string> = {
  ok: 'bg-candidate-primary-light text-candidate-primary',
  warn: 'bg-candidate-review-bg text-candidate-review',
  danger: 'bg-candidate-danger-bg text-candidate-danger',
};

const FILL_CLASSES: Record<TimerTier, string> = {
  ok: 'bg-candidate-primary',
  warn: 'bg-candidate-review',
  danger: 'bg-candidate-danger',
};

interface TimerBarProps {
  remainingSeconds: number;
  totalSeconds: number;
}

export function TimerBar({ remainingSeconds, totalSeconds }: TimerBarProps) {
  const tier = timerTier(remainingSeconds, totalSeconds);
  const fraction = totalSeconds > 0 ? Math.min(1, Math.max(0, remainingSeconds / totalSeconds)) : 0;

  return (
    <div>
      <div className="flex justify-end">
        <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold', BADGE_CLASSES[tier])}>
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {formatTime(remainingSeconds)} remaining
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-candidate-bg">
        <div
          data-testid="timer-bar-fill"
          className={clsx('h-full rounded-full', FILL_CLASSES[tier])}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd apps/web && npx jest --testPathPattern="TimerBar.test.tsx"`
Expected: PASS (7 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/web/tailwind.config.ts apps/web/package.json apps/web/package-lock.json apps/web/app/\(candidate\)/components/TimerBar.tsx apps/web/app/\(candidate\)/components/TimerBar.test.tsx
git commit -m "feat: add candidate danger/text tokens, lucide-react, TimerBar component"
```

---

### Task 2: TerminalCard + start/submitted/session-ended screens

**Files:**
- Create: `apps/web/app/(candidate)/components/TerminalCard.tsx`
- Create: `apps/web/app/(candidate)/components/TerminalCard.test.tsx`
- Modify: `apps/web/app/(candidate)/start/page.tsx`
- Modify: `apps/web/app/(candidate)/submitted/page.tsx`
- Modify: `apps/web/app/(candidate)/session-ended/page.tsx`

**Interfaces:**
- Produces: `TerminalCard({ tone, title, body }: { tone: 'loading' | 'success' | 'error' | 'neutral'; title: string; body: string })`.

- [ ] **Step 1: Write the failing test for TerminalCard**

Create `apps/web/app/(candidate)/components/TerminalCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { TerminalCard } from './TerminalCard';

describe('TerminalCard', () => {
  it('renders the title and body for every tone', () => {
    const tones = ['loading', 'success', 'error', 'neutral'] as const;
    tones.forEach((tone) => {
      const { unmount } = render(<TerminalCard tone={tone} title={`Title ${tone}`} body={`Body ${tone}`} />);
      expect(screen.getByText(`Title ${tone}`)).toBeInTheDocument();
      expect(screen.getByText(`Body ${tone}`)).toBeInTheDocument();
      unmount();
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx jest --testPathPattern="TerminalCard.test.tsx"`
Expected: FAIL — `Cannot find module './TerminalCard'`.

- [ ] **Step 3: Implement TerminalCard**

Create `apps/web/app/(candidate)/components/TerminalCard.tsx`:

```tsx
import { CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import clsx from 'clsx';

type Tone = 'loading' | 'success' | 'error' | 'neutral';

const ICON_CLASSES: Record<Tone, string> = {
  loading: 'bg-candidate-bg text-candidate-text-tertiary',
  success: 'bg-candidate-primary-light text-candidate-primary',
  error: 'bg-candidate-danger-bg text-candidate-danger',
  neutral: 'bg-candidate-bg text-candidate-text-tertiary',
};

function ToneIcon({ tone }: { tone: Tone }) {
  const className = 'h-5 w-5';
  if (tone === 'loading') return <Loader2 className={clsx(className, 'animate-spin')} aria-hidden="true" />;
  if (tone === 'success') return <CheckCircle2 className={className} aria-hidden="true" />;
  if (tone === 'error') return <XCircle className={className} aria-hidden="true" />;
  return <Clock className={className} aria-hidden="true" />;
}

interface TerminalCardProps {
  tone: Tone;
  title: string;
  body: string;
}

export function TerminalCard({ tone, title, body }: TerminalCardProps) {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm rounded-lg border border-candidate-border bg-white p-6 text-center shadow-sm">
        <div className={clsx('mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full', ICON_CLASSES[tone])}>
          <ToneIcon tone={tone} />
        </div>
        <h1 className="mb-1 text-base font-bold text-candidate-text">{title}</h1>
        <p className="text-sm text-candidate-text-secondary">{body}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx jest --testPathPattern="TerminalCard.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Apply TerminalCard to submitted/page.tsx**

Replace the full contents of `apps/web/app/(candidate)/submitted/page.tsx`:

```tsx
import { TerminalCard } from '../components/TerminalCard';

export default function CandidateSubmittedPage() {
  return (
    <TerminalCard
      tone="success"
      title="Exam submitted"
      body="Your exam has been submitted. Results will be reviewed by the recruiter."
    />
  );
}
```

- [ ] **Step 6: Apply TerminalCard to session-ended/page.tsx**

Replace the full contents of `apps/web/app/(candidate)/session-ended/page.tsx`:

```tsx
import { TerminalCard } from '../components/TerminalCard';

export default function CandidateSessionEndedPage() {
  return (
    <TerminalCard
      tone="neutral"
      title="Your session has ended"
      body="This can happen if the exam was opened in another browser or tab, or if your session expired. If the exam is still open, use your invitation link again to continue."
    />
  );
}
```

- [ ] **Step 7: Apply TerminalCard to start/page.tsx**

In `apps/web/app/(candidate)/start/page.tsx`, replace lines 1-45 (everything before the default export's wrapper) with:

```tsx
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';
import { TerminalCard } from '../components/TerminalCard';

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
    return <TerminalCard tone="error" title="Can't open this invitation" body={error} />;
  }

  return <TerminalCard tone="loading" title="Verifying your invitation" body="This only takes a moment." />;
}

export default function CandidateStartPage() {
  return (
    <Suspense fallback={<TerminalCard tone="loading" title="Loading" body="This only takes a moment." />}>
      <StartRedeemer />
    </Suspense>
  );
}
```

This drops the old outer `<div className="flex min-h-screen items-center justify-center p-8">` wrapper — `TerminalCard` now owns that centering layout itself, matching `submitted`/`session-ended`.

- [ ] **Step 8: Run the full candidate frontend unit suite**

Run: `cd apps/web && npx jest --testPathPattern="\(candidate\)"`
Expected: PASS, including the pre-existing `start`/`submitted`/`session-ended` coverage folded into other suites (these three pages had no dedicated `.test.tsx` before this task — if `npx jest --listTests` shows none exist for them, that's expected; this task does not add new dedicated test files for them beyond `TerminalCard.test.tsx`, since their content is now a thin wrapper around an already-tested component).

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/\(candidate\)/components/TerminalCard.tsx apps/web/app/\(candidate\)/components/TerminalCard.test.tsx apps/web/app/\(candidate\)/start/page.tsx apps/web/app/\(candidate\)/submitted/page.tsx apps/web/app/\(candidate\)/session-ended/page.tsx
git commit -m "feat: add TerminalCard, apply to start/submitted/session-ended screens"
```

---

### Task 3: Welcome screen — CameraPreview + sectioned layout

**Files:**
- Create: `apps/web/app/(candidate)/components/CameraPreview.tsx`
- Create: `apps/web/app/(candidate)/components/CameraPreview.test.tsx`
- Modify: `apps/web/app/(candidate)/welcome/page.tsx`

**Interfaces:**
- Produces: `CameraPreview({ status, onEnable }: { status: 'idle' | 'checking' | 'granted' | 'denied'; onEnable: () => void })`. `welcome/page.tsx` keeps owning the `cameraStatus` state and the actual `getUserMedia` call (unchanged logic) — `CameraPreview` is presentation-only, consuming the same status the page already tracks. This directly addresses the design spec's Technical Notes finding: the probe itself doesn't move, but it becomes the *visible*, real entry point for camera setup instead of a bare button with no preview.

- [ ] **Step 1: Write the failing test for CameraPreview**

Create `apps/web/app/(candidate)/components/CameraPreview.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CameraPreview } from './CameraPreview';

describe('CameraPreview', () => {
  it('shows a call to action and calls onEnable when idle', async () => {
    const onEnable = jest.fn();
    render(<CameraPreview status="idle" onEnable={onEnable} />);
    await userEvent.click(screen.getByRole('button', { name: 'Enable camera' }));
    expect(onEnable).toHaveBeenCalled();
  });

  it('shows a connected state when granted', () => {
    render(<CameraPreview status="granted" onEnable={jest.fn()} />);
    expect(screen.getByText('Camera connected')).toBeInTheDocument();
  });

  it('shows a blocked state with a retry action when denied', async () => {
    const onEnable = jest.fn();
    render(<CameraPreview status="denied" onEnable={onEnable} />);
    expect(screen.getByText('Camera access blocked')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry camera access' }));
    expect(onEnable).toHaveBeenCalled();
  });

  it('shows a checking state', () => {
    render(<CameraPreview status="checking" onEnable={jest.fn()} />);
    expect(screen.getByText('Requesting camera…')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx jest --testPathPattern="CameraPreview.test.tsx"`
Expected: FAIL — `Cannot find module './CameraPreview'`.

- [ ] **Step 3: Implement CameraPreview**

Create `apps/web/app/(candidate)/components/CameraPreview.tsx`:

```tsx
import { Video, VideoOff } from 'lucide-react';
import clsx from 'clsx';
import { CandidateButton } from './CandidateButton';

type CameraStatus = 'idle' | 'checking' | 'granted' | 'denied';

interface CameraPreviewProps {
  status: CameraStatus;
  onEnable: () => void;
}

export function CameraPreview({ status, onEnable }: CameraPreviewProps) {
  if (status === 'granted') {
    return (
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-16 flex-shrink-0 items-center justify-center rounded-md bg-candidate-text text-green-400">
          <Video className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold text-candidate-text">Camera connected</p>
          <p className="text-xs text-candidate-text-tertiary">We can see you clearly — you&apos;re good to go.</p>
        </div>
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-16 flex-shrink-0 items-center justify-center rounded-md bg-candidate-text text-candidate-danger">
            <VideoOff className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-candidate-danger">Camera access blocked</p>
            <p className="text-xs text-candidate-text-tertiary">
              Allow camera access in your browser&apos;s address-bar permissions, then retry.
            </p>
          </div>
        </div>
        <CandidateButton variant="secondary" onClick={onEnable} className="mt-3 w-full border-candidate-danger text-candidate-danger">
          Retry camera access
        </CandidateButton>
      </div>
    );
  }

  return (
    <CandidateButton onClick={onEnable} disabled={status === 'checking'} className={clsx('w-full')}>
      {status === 'checking' ? 'Requesting camera…' : 'Enable camera'}
    </CandidateButton>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx jest --testPathPattern="CameraPreview.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Redesign welcome/page.tsx around CameraPreview**

Replace lines 55-95 of `apps/web/app/(candidate)/welcome/page.tsx` (the returned JSX) with:

```tsx
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-8">
      <div className="rounded-lg border border-candidate-border bg-white p-6 shadow-sm">
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-candidate-primary">You&apos;re invited to</p>
        <h1 className="mb-3 text-xl font-bold text-candidate-text">{current.exam.title}</h1>
        <p className="mb-4 text-sm text-candidate-text-secondary">Duration: {current.exam.durationMinutes} minutes</p>

        {current.schedulingWindowState === 'not_open' ? (
          <div className="rounded-md border border-candidate-border bg-candidate-bg p-3 text-sm text-candidate-text-secondary">
            This exam opens on {new Date(current.exam.availabilityWindowStart as string).toLocaleString()}. Come back then to start.
          </div>
        ) : current.schedulingWindowState === 'closed' ? (
          <div className="rounded-md border border-candidate-danger-border bg-candidate-danger-bg p-3 text-sm text-candidate-danger">
            This exam&apos;s availability window has closed. Please contact the recruiter who invited you.
          </div>
        ) : (
          <>
            {current.exam.instructions ? (
              <div className="mb-3 rounded-md border border-candidate-border p-3">
                <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-candidate-text-secondary">Instructions</h2>
                <p className="whitespace-pre-wrap text-sm text-candidate-text-secondary">{current.exam.instructions}</p>
              </div>
            ) : null}

            <div className="mb-4 rounded-md border border-candidate-border p-3">
              <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-candidate-text-secondary">Camera monitoring</h2>
              <p className="mb-3 text-xs text-candidate-text-secondary">
                This exam is monitored. Tab switches, exiting fullscreen, copy/paste, right-click, developer tools, and your
                webcam will be reported.
              </p>
              <CameraPreview status={cameraStatus} onEnable={handleEnableCamera} />
              {cameraStatus === 'denied' ? null : null}
            </div>

            {cameraStatus === 'granted' ? (
              <CandidateButton onClick={handleStart} disabled={startAttempt.isPending} className="w-full">
                {startAttempt.isPending ? 'Starting…' : 'Start exam'}
              </CandidateButton>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
```

Add the import (alongside the other imports at the top of the file, after the `CandidateButton` import):

```tsx
import { CameraPreview } from '../components/CameraPreview';
```

Note: the `{cameraStatus === 'denied' ? null : null}` line above is intentionally inert — `CameraPreview` now owns rendering the denied-state message and retry button itself, so `welcome/page.tsx` has nothing left to render for that case. Remove that no-op line entirely rather than leaving it — it exists in this diff only to make the removal of the old inline denied-state paragraph explicit; do not carry it into the file.

- [ ] **Step 6: Update welcome/page.test.tsx if present, otherwise write one**

Run: `cd apps/web && find app -iname "welcome*test*"` (bash) — if no file exists, create `apps/web/app/(candidate)/welcome/page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { useAttemptQuery, useStartAttempt } from '../../../lib/hooks/useAttempt';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';
import CandidateWelcomePage from './page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));
jest.mock('../../../lib/hooks/useAttempt', () => ({ useAttemptQuery: jest.fn(), useStartAttempt: jest.fn() }));
jest.mock('../../../lib/candidate-auth-context', () => ({ useCandidateAuth: jest.fn() }));
jest.mock('../../../components/ui', () => ({ useToast: () => ({ toast: jest.fn() }) }));

const preview = {
  exam: {
    title: 'Frontend Round',
    instructions: 'Answer honestly.',
    durationMinutes: 60,
    schedulingEnabled: false,
    availabilityWindowStart: null,
    availabilityWindowEnd: null,
  },
  schedulingWindowState: 'open',
};

describe('CandidateWelcomePage', () => {
  const push = jest.fn();

  beforeEach(() => {
    push.mockClear();
    (useRouter as jest.Mock).mockReturnValue({ push });
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: preview, isLoading: false, isError: false });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    (useCandidateAuth as jest.Mock).mockReturnValue({ accessToken: 'token-1', isLoading: false });
  });

  it('shows the exam title and an Enable camera button, with Start exam hidden until camera is granted', () => {
    render(<CandidateWelcomePage />);
    expect(screen.getByText('Frontend Round')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enable camera' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start exam' })).not.toBeInTheDocument();
  });

  it('shows Start exam once the camera is granted', async () => {
    const getUserMedia = jest.fn().mockResolvedValue({ getTracks: () => [] });
    Object.defineProperty(global.navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });

    render(<CandidateWelcomePage />);
    await userEvent.click(screen.getByRole('button', { name: 'Enable camera' }));

    expect(await screen.findByText('Camera connected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start exam' })).toBeInTheDocument();
  });

  it('shows a blocked state and a retry action when camera access is denied', async () => {
    const getUserMedia = jest.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(global.navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });

    render(<CandidateWelcomePage />);
    await userEvent.click(screen.getByRole('button', { name: 'Enable camera' }));

    expect(await screen.findByText('Camera access blocked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry camera access' })).toBeInTheDocument();
  });
});
```

If `apps/web/app/(candidate)/welcome/page.test.tsx` already exists with different content, extend it with these three cases instead of overwriting unrelated coverage — read the existing file first and merge.

- [ ] **Step 7: Run the welcome page test**

Run: `cd apps/web && npx jest --testPathPattern="welcome/page.test.tsx"`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/\(candidate\)/components/CameraPreview.tsx apps/web/app/\(candidate\)/components/CameraPreview.test.tsx apps/web/app/\(candidate\)/welcome/page.tsx apps/web/app/\(candidate\)/welcome/page.test.tsx
git commit -m "feat: redesign welcome screen with CameraPreview and sectioned layout"
```

---

### Task 4: ProctoringOverlay + exam page overlay restructure

**Files:**
- Create: `apps/web/app/(candidate)/components/ProctoringOverlay.tsx`
- Create: `apps/web/app/(candidate)/components/ProctoringOverlay.test.tsx`
- Modify: `apps/web/app/(candidate)/exam/page.tsx`
- Modify: `apps/web/app/(candidate)/exam/page.test.tsx`

**Interfaces:**
- Consumes: nothing new from earlier tasks (uses `CandidateButton`, already existing).
- Produces: `ProctoringWarningOverlay({ strike, onContinue, continuePending, continueError }: {...})` and `ProctoringBlockOverlay()` — both plain presentational components exported from the same file.

This task's core change is structural: today `isPaused`/`isBlocked` in `exam/page.tsx` (lines 108-133) are early `return`s that replace the entire page. The confirmed design shows the overlay sitting on top of a dimmed/blurred exam page instead. This task moves that logic into the main render tree as a layer over the existing content, rather than a replacement.

- [ ] **Step 1: Write the failing test for ProctoringOverlay**

Create `apps/web/app/(candidate)/components/ProctoringOverlay.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProctoringWarningOverlay, ProctoringBlockOverlay } from './ProctoringOverlay';

describe('ProctoringWarningOverlay', () => {
  it('shows the strike count and calls onContinue', async () => {
    const onContinue = jest.fn();
    render(<ProctoringWarningOverlay strike={1} onContinue={onContinue} continuePending={false} continueError={false} />);

    expect(screen.getByText(/warning 1\/3/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onContinue).toHaveBeenCalled();
  });

  it('shows a retry hint when continue previously failed', () => {
    render(<ProctoringWarningOverlay strike={2} onContinue={jest.fn()} continuePending={false} continueError />);
    expect(screen.getByText(/still not detected/i)).toBeInTheDocument();
  });

  it('disables the continue button while pending', () => {
    render(<ProctoringWarningOverlay strike={1} onContinue={jest.fn()} continuePending continueError={false} />);
    expect(screen.getByRole('button', { name: /checking/i })).toBeDisabled();
  });
});

describe('ProctoringBlockOverlay', () => {
  it('shows the recruiter-unblock message with no continue action', () => {
    render(<ProctoringBlockOverlay />);
    expect(screen.getByText(/recruiter needs to unblock/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx jest --testPathPattern="ProctoringOverlay.test.tsx"`
Expected: FAIL — `Cannot find module './ProctoringOverlay'`.

- [ ] **Step 3: Implement ProctoringOverlay**

Create `apps/web/app/(candidate)/components/ProctoringOverlay.tsx`:

```tsx
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { CandidateButton } from './CandidateButton';

interface ProctoringWarningOverlayProps {
  strike: number;
  onContinue: () => void;
  continuePending: boolean;
  continueError: boolean;
}

export function ProctoringWarningOverlay({ strike, onContinue, continuePending, continueError }: ProctoringWarningOverlayProps) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-candidate-text/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-lg">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-candidate-review-bg text-candidate-review">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="mb-1 text-base font-bold text-candidate-text">Face not visible</h1>
        <p className="mb-4 text-sm text-candidate-text-secondary">
          We couldn&apos;t see your face clearly. Make sure you&apos;re centered in the camera and facing forward, then
          continue.
        </p>
        <p className="mb-4 text-xs text-candidate-text-faint">Warning {strike}/3</p>
        <CandidateButton onClick={onContinue} disabled={continuePending}>
          {continuePending ? 'Checking…' : 'Continue'}
        </CandidateButton>
        {continueError ? <p className="mt-2 text-xs text-candidate-danger">Still not detected — reposition and try again.</p> : null}
      </div>
    </div>
  );
}

export function ProctoringBlockOverlay() {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-candidate-text/55 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-lg">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-candidate-danger-bg text-candidate-danger">
          <ShieldAlert className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="mb-1 text-base font-bold text-candidate-text">Exam paused</h1>
        <p className="text-sm text-candidate-text-secondary">
          Your exam has been paused after repeated webcam violations. A recruiter needs to unblock your session before you
          can continue.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx jest --testPathPattern="ProctoringOverlay.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Restructure exam/page.tsx to render the overlay over dimmed content instead of replacing the page**

In `apps/web/app/(candidate)/exam/page.tsx`:

Remove the `isPaused`/`isBlocked` early-return blocks (current lines 108-133):

```tsx
  if (isPaused) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-lg font-semibold text-gray-900">Warning {attemptState.webcamViolationCount}/3</h1>
        <p className="text-sm text-gray-600">
          We couldn&apos;t see your face clearly. Make sure you&apos;re centered in the camera and facing forward, then continue.
        </p>
        <CandidateButton onClick={() => webcamResume.mutate()} disabled={webcamResume.isPending}>
          {webcamResume.isPending ? 'Checking…' : 'Continue'}
        </CandidateButton>
        {webcamResume.isError ? <p className="text-xs text-red-600">Still not detected — reposition and try again.</p> : null}
      </div>
    );
  }

  if (isBlocked) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-lg font-semibold text-gray-900">Exam paused</h1>
        <p className="text-sm text-gray-600">
          Your exam has been paused after repeated webcam violations. A recruiter needs to unblock your session before you can
          continue.
        </p>
      </div>
    );
  }

  if (!question || isTerminal) {
```

Replace with just the loading guard (the overlay logic moves to the main return below):

```tsx
  if (!question || isTerminal) {
```

Now wrap the main returned JSX in a relative container and add the overlay + a dimming class on the content. Replace the opening of the final `return` block (current lines 193-194):

```tsx
  return (
    <div className="mx-auto max-w-4xl p-4">
```

with:

```tsx
  return (
    <div className="relative">
      {isPaused ? (
        <ProctoringWarningOverlay
          strike={attemptState.webcamViolationCount}
          onContinue={() => webcamResume.mutate()}
          continuePending={webcamResume.isPending}
          continueError={webcamResume.isError}
        />
      ) : null}
      {isBlocked ? <ProctoringBlockOverlay /> : null}
      <div className={clsx('mx-auto max-w-4xl p-4', (isPaused || isBlocked) && 'pointer-events-none blur-sm select-none')}>
```

And close the extra wrapping `<div>` at the very end of the component's returned JSX — find the closing of the current outermost `<div className="mx-auto max-w-4xl p-4">` (the last `</div>` immediately before the final `</Modal>` close and the component's closing `);`), and add one more `</div>` after it to close the new relative wrapper. Concretely, the tail of the return block changes from:

```tsx
      <Modal open={submitAttempt.isError} title="Couldn't submit" onClose={() => undefined}>
        <p className="mb-4 text-sm text-gray-600">Your submission didn&apos;t go through. Your answers are saved — please retry.</p>
        <div className="flex justify-end">
          <CandidateButton onClick={() => finishSubmit()}>Retry</CandidateButton>
        </div>
      </Modal>
    </div>
  );
}
```

to:

```tsx
      <Modal open={submitAttempt.isError} title="Couldn't submit" onClose={() => undefined}>
        <p className="mb-4 text-sm text-gray-600">Your submission didn&apos;t go through. Your answers are saved — please retry.</p>
        <div className="flex justify-end">
          <CandidateButton onClick={() => finishSubmit()}>Retry</CandidateButton>
        </div>
      </Modal>
      </div>
    </div>
  );
}
```

Add the import (alongside the other component imports near the top of the file):

```tsx
import { ProctoringWarningOverlay, ProctoringBlockOverlay } from '../components/ProctoringOverlay';
```

- [ ] **Step 6: Update exam/page.test.tsx for the restructured overlay**

The two existing tests at the bottom of `apps/web/app/(candidate)/exam/page.test.tsx` (`'shows a warning overlay...'` and `'shows a block overlay...'`) already assert the right text (`/warning 1\/3/i`, `/recruiter needs to unblock/i`) and button behavior — they should continue passing unchanged, since `ProctoringWarningOverlay`/`ProctoringBlockOverlay` preserve that exact copy. Add one more test confirming the underlying exam content is still present (not replaced) while an overlay is showing:

```tsx
  it('keeps the question card mounted underneath the warning overlay instead of replacing the page', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { ...attemptState, status: 'paused', webcamViolationCount: 1 },
      isError: false,
    });

    render(<CandidateExamPage />);

    expect(screen.getByText(/warning 1\/3/i)).toBeInTheDocument();
    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
  });
```

Add this as a new `it(...)` inside the existing `describe('CandidateExamPage', ...)` block, after the two pre-existing overlay tests.

- [ ] **Step 7: Run the exam page test suite**

Run: `cd apps/web && npx jest --testPathPattern="exam/page.test.tsx"`
Expected: PASS (all pre-existing tests plus the new one).

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/\(candidate\)/components/ProctoringOverlay.tsx apps/web/app/\(candidate\)/components/ProctoringOverlay.test.tsx apps/web/app/\(candidate\)/exam/page.tsx apps/web/app/\(candidate\)/exam/page.test.tsx
git commit -m "feat: render webcam proctoring overlays over dimmed exam content instead of replacing the page"
```

---

### Task 5: CodeOutputPanel + code question panel integration

**Files:**
- Create: `apps/web/app/(candidate)/components/CodeOutputPanel.tsx`
- Create: `apps/web/app/(candidate)/components/CodeOutputPanel.test.tsx`
- Modify: `apps/web/app/(candidate)/exam/page.tsx`
- Modify: `apps/web/app/(candidate)/exam/page.test.tsx`

**Interfaces:**
- Consumes: `RunCodeResult` from `apps/web/lib/hooks/useAttempt.ts` (unchanged: `{ stdout, stderr, exitCode, compileError, timedOut }`).
- Produces: `CodeOutputPanel({ result, error }: { result: RunCodeResult | null; error: string | null })`.

- [ ] **Step 1: Write the failing test for CodeOutputPanel**

Create `apps/web/app/(candidate)/components/CodeOutputPanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { CodeOutputPanel } from './CodeOutputPanel';

describe('CodeOutputPanel', () => {
  it('renders nothing when there is no result or error', () => {
    const { container } = render(<CodeOutputPanel result={null} error={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the error string when present, taking priority over a stale result', () => {
    render(<CodeOutputPanel result={{ stdout: 'old', stderr: '', exitCode: 0, compileError: null, timedOut: false }} error="Couldn't run your code right now, try again." />);
    expect(screen.getByText("Couldn't run your code right now, try again.")).toBeInTheDocument();
    expect(screen.queryByText('old')).not.toBeInTheDocument();
  });

  it('renders a success badge and stdout for exit code 0', () => {
    render(<CodeOutputPanel result={{ stdout: 'hi\n', stderr: '', exitCode: 0, compileError: null, timedOut: false }} error={null} />);
    expect(screen.getByText('Exit code: 0')).toBeInTheDocument();
    expect(screen.getByText('hi')).toBeInTheDocument();
  });

  it('renders a failure badge and stderr for a nonzero exit code', () => {
    render(<CodeOutputPanel result={{ stdout: '', stderr: 'ReferenceError: x is not defined', exitCode: 1, compileError: null, timedOut: false }} error={null} />);
    expect(screen.getByText('Exit code: 1')).toBeInTheDocument();
    expect(screen.getByText('ReferenceError: x is not defined')).toBeInTheDocument();
  });

  it('renders compileError instead of stdout/stderr when present', () => {
    render(<CodeOutputPanel result={{ stdout: 'ignored', stderr: '', exitCode: 1, compileError: 'main.cpp:3: error: expected \';\'', timedOut: false }} error={null} />);
    expect(screen.getByText('main.cpp:3: error: expected \';\'')).toBeInTheDocument();
    expect(screen.queryByText('ignored')).not.toBeInTheDocument();
  });

  it('renders the timeout message', () => {
    render(<CodeOutputPanel result={{ stdout: '', stderr: '', exitCode: 137, compileError: null, timedOut: true }} error={null} />);
    expect(screen.getByText('Your program was stopped for taking too long.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx jest --testPathPattern="CodeOutputPanel.test.tsx"`
Expected: FAIL — `Cannot find module './CodeOutputPanel'`.

- [ ] **Step 3: Implement CodeOutputPanel**

Create `apps/web/app/(candidate)/components/CodeOutputPanel.tsx`:

```tsx
import clsx from 'clsx';
import { Check, X } from 'lucide-react';
import { RunCodeResult } from '../../../lib/hooks/useAttempt';

interface CodeOutputPanelProps {
  result: RunCodeResult | null;
  error: string | null;
}

export function CodeOutputPanel({ result, error }: CodeOutputPanelProps) {
  if (error) {
    return (
      <div className="mt-2 overflow-hidden rounded-md border border-candidate-danger-border">
        <div className="flex items-center gap-1.5 bg-candidate-danger-bg px-3 py-1.5 text-xs font-bold text-candidate-danger">
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Couldn&apos;t run
        </div>
        <div className="bg-white p-2 font-mono text-xs text-candidate-danger">{error}</div>
      </div>
    );
  }

  if (!result) return null;

  const failed = result.exitCode !== 0;

  return (
    <div className="mt-2 overflow-hidden rounded-md border border-candidate-border">
      <div
        className={clsx(
          'flex items-center justify-between px-3 py-1.5 text-xs font-bold',
          failed ? 'bg-candidate-danger-bg text-candidate-danger' : 'bg-candidate-primary-light text-candidate-primary',
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          {failed ? <X className="h-3.5 w-3.5" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
          Exit code: {result.exitCode}
        </span>
      </div>
      <div className="bg-white p-2 font-mono text-xs">
        {result.compileError ? (
          <div className="whitespace-pre-wrap text-candidate-danger">{result.compileError}</div>
        ) : (
          <>
            {result.stdout ? <div className="whitespace-pre-wrap text-candidate-text">{result.stdout}</div> : null}
            {result.stderr ? <div className="whitespace-pre-wrap text-candidate-danger">{result.stderr}</div> : null}
            {result.timedOut ? (
              <div className="text-candidate-review">Your program was stopped for taking too long.</div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx jest --testPathPattern="CodeOutputPanel.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Add a dark editor-chrome header (language badge + filename) above the Monaco editor**

Replace the `<Editor .../>` element (current lines 223-229):

```tsx
              <Editor
                height="400px"
                language={question.codeLanguage ?? 'plaintext'}
                value={codeValue}
                onChange={handleCodeChange}
                options={{ minimap: { enabled: false }, fontSize: 13 }}
              />
```

with a header bar wrapping it:

```tsx
              <div className="overflow-hidden rounded-t-md">
                <div className="flex items-center justify-between bg-[#1E1E1E] px-3 py-1.5">
                  <span className="rounded bg-[#2D2D2D] px-2 py-0.5 text-[11px] font-semibold text-candidate-text-faint">
                    {question.codeLanguage ?? 'plaintext'}
                  </span>
                </div>
                <Editor
                  height="400px"
                  language={question.codeLanguage ?? 'plaintext'}
                  value={codeValue}
                  onChange={handleCodeChange}
                  options={{ minimap: { enabled: false }, fontSize: 13 }}
                  theme="vs-dark"
                />
              </div>
```

(`theme="vs-dark"` matches Monaco's own default dark theme, so the editor body doesn't clash with the new dark header above it — this is the one-line change that makes the editor itself dark, not just its header.)

- [ ] **Step 6: Integrate CodeOutputPanel and a Run-icon into exam/page.tsx's code question block**

Replace the code-question run/output block (current lines 245-265):

```tsx
              <div className="mt-2 flex items-center gap-2">
                <CandidateButton variant="secondary" onClick={handleRun} disabled={runCode.isPending}>
                  {runCode.isPending ? 'Running…' : 'Run'}
                </CandidateButton>
              </div>
              {runError ? (
                <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{runError}</div>
              ) : runResult ? (
                <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-2 font-mono text-xs">
                  {runResult.compileError ? (
                    <div className="text-red-700">{runResult.compileError}</div>
                  ) : (
                    <>
                      {runResult.stdout ? <div className="whitespace-pre-wrap">{runResult.stdout}</div> : null}
                      {runResult.stderr ? <div className="whitespace-pre-wrap text-red-700">{runResult.stderr}</div> : null}
                      {runResult.timedOut ? <div className="text-amber-700">Your program was stopped for taking too long.</div> : null}
                    </>
                  )}
                  <div className="mt-1 text-gray-500">Exit code: {runResult.exitCode}</div>
                </div>
              ) : null}
```

with:

```tsx
              <div className="mt-2 flex items-center gap-2">
                <CandidateButton variant="secondary" onClick={handleRun} disabled={runCode.isPending}>
                  <span className="inline-flex items-center gap-1.5">
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    {runCode.isPending ? 'Running…' : 'Run'}
                  </span>
                </CandidateButton>
              </div>
              <CodeOutputPanel result={runResult} error={runError} />
```

Add the imports (alongside the other lucide imports being introduced in this task):

```tsx
import { Play } from 'lucide-react';
import { CodeOutputPanel } from '../components/CodeOutputPanel';
```

- [ ] **Step 7: Run the exam page test suite**

Run: `cd apps/web && npx jest --testPathPattern="exam/page.test.tsx"`
Expected: PASS — the pre-existing code-run tests (`'renders a Monaco editor pre-filled with starterCode...'`, `'runs code and displays the output panel'`, `'shows the server-provided message...'`, `'shows the run-cap message...'`, `'keeps run output and stdin per-question...'`) all still find the mocked `code-editor` textarea (the editor-chrome header wraps it but doesn't change how the test's `@monaco-editor/react` mock is queried) and assert `getByText('Exit code: 0')` / the server-message text, which `CodeOutputPanel` preserves exactly.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/\(candidate\)/components/CodeOutputPanel.tsx apps/web/app/\(candidate\)/components/CodeOutputPanel.test.tsx apps/web/app/\(candidate\)/exam/page.tsx
git commit -m "feat: add dark editor-chrome header and CodeOutputPanel, integrate into code question panel"
```

---

### Task 6: Exam page main layout — top bar, timer bar, exam title, navigator legend, question-card icons, submit modal stats

**Files:**
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts`
- Modify: `apps/exam-runtime/src/attempts/attempt.service.spec.ts`
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/app/(candidate)/components/QuestionNavigator.tsx`
- Modify: `apps/web/app/(candidate)/exam/page.tsx`
- Modify: `apps/web/app/(candidate)/exam/page.test.tsx`

**Interfaces:**
- Consumes: `TimerBar`, `formatTime` from Task 1's `TimerBar.tsx`.
- Produces: `AttemptState.exam.title: string` (new field), flowing from `apps/exam-runtime`'s `getCurrent()` through `apps/web/lib/types.ts` to the exam page's top bar.

- [ ] **Step 1: Add the failing backend test expectation for examTitle**

In `apps/exam-runtime/src/attempts/attempt.service.spec.ts`, update the `'returns the full attempt state with sections, questions (no isCorrect), and existing answers'` test's expected object (current lines 108-116) to include the new field:

```ts
      expect(result).toEqual({
        status: 'in_progress',
        remainingSeconds: 3300,
        exam: { title: 'Backend Round' },
        sections: [
          { title: 'Section One', targetDurationMinutes: 20, questions: [{ id: 'q1', text: 'What is 2+2?', type: 'single_mcq', marks: 5, options: [{ id: 'opt-a', text: '4' }, { id: 'opt-b', text: '5' }] }] },
        ],
        answers: [{ questionId: 'q1', selectedOptionIds: ['opt-a'], isMarkedForReview: false }],
        messages: [],
      });
```

(`'Backend Round'` is the `exam.title` already defined in this spec file's shared `exam` fixture at line 26.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/exam-runtime && npx jest --testPathPattern="attempt.service.spec.ts" -t "returns the full attempt state"`
Expected: FAIL — actual result is missing the `exam` key.

- [ ] **Step 3: Add exam.title to the backend response**

In `apps/exam-runtime/src/attempts/attempt.service.ts`, update the `AttemptStateResponse` interface (current lines 72-79):

```ts
interface AttemptStateResponse {
  status: string;
  remainingSeconds: number;
  webcamViolationCount: number;
  exam: { title: string };
  sections: AttemptSection[];
  answers: AttemptAnswerSummary[];
  messages: AttemptMessageSummary[];
}
```

And the returned object inside `getCurrent()` (current lines 123-135):

```ts
      return {
        status: settled.status,
        remainingSeconds: this.attemptSettlement.remainingSeconds(exam, settled),
        webcamViolationCount: settled.webcamViolationCount,
        exam: { title: exam.title },
        sections,
        answers: answers.map((answer) => ({
          questionId: answer.questionId,
          selectedOptionIds: JSON.parse(answer.selectedOptionIdsJson),
          answerText: answer.answerText,
          isMarkedForReview: answer.isMarkedForReview,
        })),
        messages: unreadMessages.map((message) => ({ id: message.id, body: message.body, sentAt: message.sentAt })),
      };
```

- [ ] **Step 4: Run the backend test to verify it passes**

Run: `cd apps/exam-runtime && npx jest --testPathPattern="attempt.service.spec.ts"`
Expected: PASS (full file — confirms this didn't break the other `getCurrent`/`start`/`answer`/`submit`/webcam tests in the same file).

- [ ] **Step 5: Add the field to the frontend type**

In `apps/web/lib/types.ts`, update the `AttemptState` interface (current lines 193-200):

```ts
export interface AttemptState {
  status: string;
  remainingSeconds: number;
  webcamViolationCount: number;
  exam: { title: string };
  sections: AttemptSection[];
  answers: AttemptAnswerSummary[];
  messages: AttemptMessageSummary[];
}
```

- [ ] **Step 6: Add a legend to QuestionNavigator**

In `apps/web/app/(candidate)/components/QuestionNavigator.tsx`, replace the return block (current lines 21-49):

```tsx
  return (
    <div className="rounded-lg border border-candidate-border bg-white p-3 shadow-sm">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-candidate-text-tertiary">Questions</p>
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
                !isCurrent && !isMarked && !isAnswered && 'bg-candidate-bg text-candidate-text-faint',
              )}
            >
              {index + 1}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-col gap-1.5 border-t border-candidate-border pt-3 text-[11px] text-candidate-text-tertiary">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-candidate-primary" /> Answered
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm border border-candidate-review-border bg-candidate-review-bg" /> Marked for review
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-candidate-bg" /> Not answered
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Redesign the exam page top bar, question meta row, and MCQ/mark-for-review icons**

In `apps/web/app/(candidate)/exam/page.tsx`, remove the now-redundant local `formatTime` function (current lines 17-21 — this is superseded by the one exported from `TimerBar.tsx`):

```tsx
function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
```

Delete it entirely — `TimerBar` is imported later in this same step and provides the replacement.

Add a ref to capture the total-duration baseline the first time `remainingSeconds` is observed (add right after the `remainingSeconds` computation, i.e. after the existing `useCountdown` call):

```tsx
  const totalSecondsRef = useRef<number | null>(null);
  if (totalSecondsRef.current === null && attemptState?.remainingSeconds) {
    totalSecondsRef.current = attemptState.remainingSeconds;
  }
```

Add `useRef` to the React import at the top of the file (change `import { useEffect, useMemo, useState } from 'react';` to `import { useEffect, useMemo, useRef, useState } from 'react';`).

Replace the top bar (current lines 195-208):

```tsx
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
```

with:

```tsx
      <div className="mb-4 rounded-lg border border-candidate-border bg-white px-4 py-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <button
            onClick={() => setNavigatorOpen((open) => !open)}
            className="rounded-full bg-candidate-primary-light px-3 py-1 text-xs font-bold text-candidate-primary lg:hidden"
          >
            Q{currentIndex + 1}/{questions.length} ▾
          </button>
          <span className="hidden text-sm font-bold text-candidate-text lg:inline">{attemptState.exam.title}</span>
        </div>
        <TimerBar remainingSeconds={remainingSeconds} totalSeconds={totalSecondsRef.current ?? remainingSeconds} />
      </div>
```

Replace the question meta row (current lines 212-219):

```tsx
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">
              {question.type === 'code' ? 'CODE' : question.type === 'multi_mcq' ? 'MULTIPLE CHOICE' : 'SINGLE CHOICE'} · {question.marks} MARKS
            </span>
            <button onClick={toggleMarkForReview} className={markButtonClasses(existingAnswer?.isMarkedForReview)}>
              {existingAnswer?.isMarkedForReview ? '★ Marked for review' : '☆ Mark for review'}
            </button>
          </div>
```

with:

```tsx
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-candidate-text-tertiary">
              Question {currentIndex + 1} of {questions.length} ·{' '}
              {question.type === 'code' ? 'Code' : question.type === 'multi_mcq' ? 'Multiple choice' : 'Single choice'} ·{' '}
              {question.marks} marks
            </span>
            <button onClick={toggleMarkForReview} className={markButtonClasses(existingAnswer?.isMarkedForReview)}>
              <span className="inline-flex items-center gap-1">
                <Bookmark className="h-3 w-3" fill={existingAnswer?.isMarkedForReview ? 'currentColor' : 'none'} aria-hidden="true" />
                {existingAnswer?.isMarkedForReview ? 'Marked for review' : 'Mark for review'}
              </span>
            </button>
          </div>
```

Update `markButtonClasses` (current lines 23-28) to use the new border token:

```tsx
function markButtonClasses(marked: boolean | undefined) {
  return clsx(
    'rounded-full border px-2 py-0.5 text-xs',
    marked ? 'border-candidate-review-border bg-candidate-review-bg text-candidate-review' : 'border-candidate-border text-candidate-text-faint',
  );
}
```

Replace the MCQ option rendering (current lines 268-274):

```tsx
            <div className="flex flex-col gap-2">
              {question.options.map((option) => (
                <button key={option.id} onClick={() => toggleOption(option.id)} className={optionClasses(selectedOptionIds.includes(option.id))}>
                  {selectedOptionIds.includes(option.id) ? '◉' : '○'} {option.text}
                </button>
              ))}
            </div>
```

with:

```tsx
            <div className="flex flex-col gap-2">
              {question.options.map((option) => {
                const selected = selectedOptionIds.includes(option.id);
                return (
                  <button key={option.id} onClick={() => toggleOption(option.id)} className={optionClasses(selected)}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={clsx(
                          'inline-block h-3.5 w-3.5 flex-shrink-0 rounded-full border-2',
                          selected ? 'border-candidate-primary bg-candidate-primary shadow-[inset_0_0_0_2px_white]' : 'border-candidate-text-faint',
                        )}
                        aria-hidden="true"
                      />
                      {option.text}
                    </span>
                  </button>
                );
              })}
            </div>
```

Update `optionClasses` (current lines 30-37) to drop the now-unused unicode-glyph styling assumption and use the new border token:

```tsx
function optionClasses(selected: boolean) {
  return clsx(
    'rounded-lg border px-3 py-2 text-left text-sm',
    selected
      ? 'border-[1.5px] border-candidate-primary bg-candidate-primary-light font-semibold text-candidate-primary'
      : 'border-candidate-border text-candidate-text-secondary',
  );
}
```

Add the new imports (alongside the other imports already present/added in earlier tasks):

```tsx
import { Bookmark } from 'lucide-react';
import { TimerBar } from '../components/TimerBar';
```

- [ ] **Step 8: Add the answered/review/unanswered stat breakdown to the submit confirmation modal**

Compute the three counts alongside the existing `unansweredCount` (current lines 96-102):

```tsx
  const unansweredCount = questions.filter((q) => {
    const a = answers.find((ans) => ans.questionId === q.id);
    if (q.type === 'code') {
      return !a || !a.answerText || a.answerText.trim() === '';
    }
    return !a || a.selectedOptionIds.length === 0;
  }).length;
```

with:

```tsx
  const answeredCount = questions.filter((q) => {
    const a = answers.find((ans) => ans.questionId === q.id);
    if (q.type === 'code') return Boolean(a && a.answerText && a.answerText.trim() !== '');
    return Boolean(a && a.selectedOptionIds.length > 0);
  }).length;
  const reviewCount = questions.filter((q) => answers.find((ans) => ans.questionId === q.id)?.isMarkedForReview).length;
  const unansweredCount = questions.length - answeredCount;
```

Replace the confirm-submit `Modal` body (current lines 312-317):

```tsx
      <Modal open={confirmOpen} title="Submit exam?" onClose={() => setConfirmOpen(false)}>
        <p className="mb-4 text-sm text-gray-600">
          {unansweredCount > 0
            ? `You have ${unansweredCount} unanswered question${unansweredCount === 1 ? '' : 's'}. Once submitted, you cannot make further changes.`
            : 'Once submitted, you cannot make further changes.'}
        </p>
```

with:

```tsx
      <Modal open={confirmOpen} title="Submit exam?" onClose={() => setConfirmOpen(false)}>
        <p className="mb-4 text-sm text-candidate-text-secondary">You won&apos;t be able to change your answers after this.</p>
        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="rounded-md bg-candidate-primary-light p-2 text-center">
            <div className="text-lg font-bold text-candidate-primary">{answeredCount}</div>
            <div className="text-[10px] uppercase tracking-wide text-candidate-text-tertiary">Answered</div>
          </div>
          <div className="rounded-md bg-candidate-review-bg p-2 text-center">
            <div className="text-lg font-bold text-candidate-review">{reviewCount}</div>
            <div className="text-[10px] uppercase tracking-wide text-candidate-text-tertiary">For review</div>
          </div>
          <div className="rounded-md bg-candidate-bg p-2 text-center">
            <div className="text-lg font-bold text-candidate-text-secondary">{unansweredCount}</div>
            <div className="text-[10px] uppercase tracking-wide text-candidate-text-tertiary">Unanswered</div>
          </div>
        </div>
```

(The button row immediately below, "Keep reviewing"/"Submit", stays unchanged.)

Also restyle the submit-error modal directly below it in the same file (current lines 328-333) to match the confirmed mockup's red-tinted treatment:

```tsx
      <Modal open={submitAttempt.isError} title="Couldn't submit" onClose={() => undefined}>
        <p className="mb-4 text-sm text-gray-600">Your submission didn&apos;t go through. Your answers are saved — please retry.</p>
        <div className="flex justify-end">
          <CandidateButton onClick={() => finishSubmit()}>Retry</CandidateButton>
        </div>
      </Modal>
```

with:

```tsx
      <Modal open={submitAttempt.isError} title="Couldn't submit" onClose={() => undefined}>
        <p className="mb-4 text-sm text-candidate-text-secondary">
          Your submission didn&apos;t go through. Your answers are saved — please retry.
        </p>
        <div className="flex justify-end">
          <CandidateButton onClick={() => finishSubmit()} className="bg-candidate-danger hover:opacity-90">
            Retry
          </CandidateButton>
        </div>
      </Modal>
```

(`CandidateButton`'s `primary` variant classes are `bg-candidate-primary text-white hover:opacity-90` per `apps/web/app/(candidate)/components/CandidateButton.tsx` — passing `className="bg-candidate-danger hover:opacity-90"` overrides just the background color via `clsx`'s later-class-wins behavior, keeping the white text and hover-opacity treatment.)

- [ ] **Step 9: Update exam/page.test.tsx fixtures and the unanswered-count test**

Every fixture object in `apps/web/app/(candidate)/exam/page.test.tsx` (`attemptState`, `codeAttemptState`, `codeAttemptStateWithStdin`, `twoCodeQuestionsAttemptState`) needs an `exam: { title: '...' }` field added, since `AttemptState` now requires it and the top bar reads `attemptState.exam.title`. Add `exam: { title: 'Test Exam' },` as a new line right after each fixture's `remainingSeconds: 590,` line (there are 4 occurrences — one per fixture).

Update the test that currently reads `'You have 1 unanswered question'` (the `'counts a code question as unanswered until it has non-empty answerText'` test) — this text no longer appears since the confirm-modal body was replaced with the stat breakdown. Change its assertion from:

```tsx
    expect(screen.getByText(/You have 1 unanswered question/)).toBeInTheDocument();
```

to:

```tsx
    const unansweredStat = screen.getAllByText('1').find((el) => el.className.includes('text-lg'));
    expect(unansweredStat).toBeInTheDocument();
```

- [ ] **Step 10: Run the exam page test suite**

Run: `cd apps/web && npx jest --testPathPattern="exam/page.test.tsx"`
Expected: PASS (all tests, including the updated fixtures and the restructured confirm-modal assertion).

- [ ] **Step 11: Run the full frontend and exam-runtime unit suites**

Run: `cd apps/web && npx jest` and `cd apps/exam-runtime && npx jest`
Expected: PASS in both — this catches any other place that constructs an `AttemptState`-shaped object without `exam.title` (e.g. other component tests that happen to import the same fixtures) or relies on the old `AttemptStateResponse` shape.

- [ ] **Step 12: Commit**

```bash
git add apps/exam-runtime/src/attempts/attempt.service.ts apps/exam-runtime/src/attempts/attempt.service.spec.ts apps/web/lib/types.ts apps/web/app/\(candidate\)/components/QuestionNavigator.tsx apps/web/app/\(candidate\)/exam/page.tsx apps/web/app/\(candidate\)/exam/page.test.tsx
git commit -m "feat: exam page top bar/timer/navigator-legend/submit-modal redesign, add exam.title to attempt state"
```

---

### Task 7: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full backend suites**

Run: `npm run test:api && npm run test:api:e2e && npm run test:exam-runtime && npm run test:shared`
Expected: all pass, including the updated `attempt.service.spec.ts` test from Task 6. The pre-existing `ai-question-generation.e2e-spec.ts` flake (missing `ANTHROPIC_API_KEY`) is documented and unrelated.

- [ ] **Step 2: Full frontend unit suite**

Run: `cd apps/web && npm test`
Expected: all suites pass, including every new/updated `.test.tsx` from Tasks 1-6.

- [ ] **Step 3: Full Playwright suite**

Run: `cd apps/web && npx playwright test`
Expected: `candidate-golden-path.spec.ts` and `code-question-golden-path.spec.ts` both pass unchanged — every selector they use (`'Enable camera'`, `'Start exam'`, question text, `/Mark for review/`, `/Marked for review/`, `'Review & Submit'`, `'Submit'`, `'Run'`, `/Exit code:|Couldn't run your code right now/`, `'Exam submitted'`) targets accessible names/text that this plan explicitly preserved. If either fails, the failure is a real regression to fix, not an expected selector change — do not edit the Playwright specs to work around a failure without first confirming it isn't a genuine bug introduced by this redesign.

- [ ] **Step 4: Manual smoke check**

With dev servers running (`docker compose up -d` for Redis + Piston, plus `apps/api`, `apps/exam-runtime`, `apps/web`): as recruiter, create an exam with one MCQ question and one code question (stdin enabled on one), publish it, invite a candidate. As that candidate: confirm the welcome screen shows the exam title, sectioned instructions/camera-monitoring boxes, and the camera-preview box transitions from the Enable-camera button to "Camera connected" once granted. Start the exam and confirm: the top bar shows the exam title (desktop) and a 3-stage timer bar/badge; the sidebar navigator shows the color legend; MCQ options show the new radio-dot styling; the code question shows the Run button with a play icon and the new structured output panel on both a successful run and a deliberate syntax error. Click "Review & Submit" and confirm the stat-tile breakdown (answered/review/unanswered) matches what was actually answered. If the exam has webcam monitoring enabled and a violation can be triggered in dev, confirm the warning overlay appears over a dimmed (not replaced) exam page, and that clicking "Continue" once back in frame dismisses it.

- [ ] **Step 5: Update the SDD progress ledger**

Overwrite `.superpowers/sdd/progress.md` with:

```
# Candidate Exam Flow Redesign — SDD Progress Ledger

## Tasks
Task 1: complete (design tokens, lucide-react, TimerBar)
Task 2: complete (TerminalCard, start/submitted/session-ended screens)
Task 3: complete (welcome screen — CameraPreview)
Task 4: complete (ProctoringOverlay, exam page overlay restructure)
Task 5: complete (CodeOutputPanel, code question panel integration)
Task 6: complete (exam page top bar/timer/navigator-legend/submit-modal, exam.title backend field)
Task 7: complete (final verification)
```
