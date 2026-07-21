# Candidate Color Re-theming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make candidate-facing pages pick up the org's `primaryColor` (already settable via org-admin Branding Settings), the same way recruiter/org-admin/panel layouts already theme via `--color-primary`.

**Architecture:** `exam-runtime`'s `/attempt/current` response gains `organizationPrimaryColor` (mirroring the already-shipped `organizationLogoUrl`). A frontend theme provider (replacing the existing logo-only component) turns that into CSS custom properties on the candidate layout's wrapper `<div>`, consumed by two new/changed Tailwind tokens (`candidate-primary`, `candidate-primary-light`) plus one new contrast-safe token (`candidate-on-primary`) computed via a YIQ luminance check.

**Tech Stack:** NestJS (exam-runtime), Next.js + Tailwind CSS (apps/web), Jest for both.

## Global Constraints

- Scope is `primaryColor` only — no `accentColor` wiring (candidate pages have no existing use for a second brand color).
- Only `candidate-primary` and `candidate-primary-light` become theme-reactive. Every other candidate token (text, border, danger, review, bg) stays fixed — these are semantic/neutral colors, not brand colors.
- No org branding set → candidate pages render byte-for-byte identical to today (CSS var fallback to the current hardcoded hex values).
- No new network calls — `organizationPrimaryColor` piggybacks on the existing `/attempt/current` fetch every candidate page already makes.
- Contrast handling uses a YIQ luminance heuristic (light/dark binary choice), not a full WCAG contrast-ratio computation — proportionate to the actual need.

---

### Task 1: exam-runtime — `organizationPrimaryColor` on `/attempt/current`

**Files:**
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts`
- Test: `apps/exam-runtime/src/attempts/attempt.service.spec.ts`

**Interfaces:**
- Produces: `AttemptCurrentResponse` (both `AttemptPreviewResponse` and `AttemptStateResponse` branches) gains `organizationPrimaryColor: string | null`, alongside the existing `organizationLogoUrl: string | null`.

- [ ] **Step 1: Write the failing test**

In `apps/exam-runtime/src/attempts/attempt.service.spec.ts`, inside the `describe('getCurrent', ...)` block, add this test immediately after the `it('returns an exam preview with a section/question-count breakdown when no attempt has been started yet', ...)` test (the one using `mockBootstrapThenScoped(tx)` and asserting the full preview shape via `toEqual`):

```typescript
    it('returns the organization primaryColor alongside the logo when the org has one set', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null) },
        examSection: { findMany: jest.fn().mockResolvedValue([]) },
      };
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve(invitationRecord))
        .mockImplementationOnce(() => Promise.resolve({ logoPath: null, primaryColor: '#B23B3B' }))
        .mockImplementationOnce((_ctx, fn) => fn(tx));

      const result = await service.getCurrent(session);

      expect((result as any).organizationPrimaryColor).toBe('#B23B3B');
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/exam-runtime`): `npx jest attempt.service.spec -t "returns the organization primaryColor"`
Expected: FAIL — `result.organizationPrimaryColor` is `undefined`, not `'#B23B3B'` (the service doesn't return this field yet).

- [ ] **Step 3: Rename and extend the private branding lookup**

In `apps/exam-runtime/src/attempts/attempt.service.ts`, replace the private method (currently at the end of the file, right after `resolveContext`):

```typescript
  private async getOrganizationLogoUrl(organizationId: string): Promise<string | null> {
    const organization = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.organization.findUnique({ where: { id: organizationId }, select: { logoPath: true } }),
    );
    return organization?.logoPath ? `${process.env.API_ORIGIN}/uploads/${organization.logoPath}` : null;
  }
```

with:

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

- [ ] **Step 4: Add the field to both response interfaces**

In the same file, `AttemptPreviewResponse` (has `organizationLogoUrl: string | null;` as its last field before the closing `}`):

```typescript
interface AttemptPreviewResponse {
  exam: {
    title: string;
    instructions: string | null;
    durationMinutes: number;
    schedulingEnabled: boolean;
    availabilityWindowStart: Date | null;
    availabilityWindowEnd: Date | null;
  };
  schedulingWindowState: 'not_open' | 'open' | 'closed' | null;
  sections: AttemptSectionSummary[];
  organizationLogoUrl: string | null;
  organizationPrimaryColor: string | null;
}
```

`AttemptStateResponse` (same pattern):

```typescript
interface AttemptStateResponse {
  status: string;
  remainingSeconds: number;
  webcamViolationCount: number;
  exam: { title: string };
  sections: AttemptSection[];
  answers: AttemptAnswerSummary[];
  messages: AttemptMessageSummary[];
  feedback: AttemptFeedback | null;
  organizationLogoUrl: string | null;
  organizationPrimaryColor: string | null;
}
```

- [ ] **Step 5: Update the call site and both return branches**

In `getCurrent()`, replace:

```typescript
  async getCurrent(session: CandidateSession): Promise<AttemptCurrentResponse> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);
    const organizationLogoUrl = await this.getOrganizationLogoUrl(organizationId);
```

with:

```typescript
  async getCurrent(session: CandidateSession): Promise<AttemptCurrentResponse> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);
    const { logoUrl: organizationLogoUrl, primaryColor: organizationPrimaryColor } = await this.getOrganizationBranding(organizationId);
```

Then add `organizationPrimaryColor,` right after `organizationLogoUrl,` in both return branches — the pre-start preview object:

```typescript
        return {
          exam: {
            title: exam.title,
            instructions: exam.instructions,
            durationMinutes: exam.durationMinutes,
            schedulingEnabled: exam.schedulingEnabled,
            availabilityWindowStart: exam.availabilityWindowStart,
            availabilityWindowEnd: exam.availabilityWindowEnd,
          },
          schedulingWindowState: this.getSchedulingWindowState(exam),
          sections: sections.map((section) => ({
            title: section.title,
            questionCount: section.selectionMode === 'pool' ? (section.poolSize ?? 0) : section.questions.length,
          })),
          organizationLogoUrl,
          organizationPrimaryColor,
        };
```

and the in-progress/submitted state object:

```typescript
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
        feedback,
        organizationLogoUrl,
        organizationPrimaryColor,
      };
```

- [ ] **Step 6: Run the new test to verify it passes**

Run: `npx jest attempt.service.spec -t "returns the organization primaryColor"`
Expected: PASS

- [ ] **Step 7: Fix the three exact-match assertions broken by the new field**

`Organization.primaryColor` is `String?` in the schema, and every existing test fixture's mocked `forTenant` resolution for the branding lookup either omits `primaryColor` entirely or (via `mockBootstrapThenScoped`'s 2-call shape, which never reaches the branding lookup at all) is unaffected — `organization?.primaryColor ?? null` safely resolves to `null` when the key is absent, so no other test fixture needs touching. Only the three tests using `toEqual` for the *entire* response object need the new field added to their expected literal, since `toEqual` requires exact shape:

Run this first to locate the exact three sites:

```bash
grep -n "organizationLogoUrl: null," apps/exam-runtime/src/attempts/attempt.service.spec.ts
```

Expected output: three line numbers — one in the `getCurrent` describe block's preview test (`it('returns an exam preview with a section/question-count breakdown...')`), one in its full-state test (`it('returns the full attempt state with sections, questions (no isCorrect), and existing answers')`), and one in the `scheduling` describe block's `it('getCurrent() returns schedulingWindowState "not_open" before the window opens, with no attempt created')` test. At each of the three, change:

```typescript
        organizationLogoUrl: null,
```

to:

```typescript
        organizationLogoUrl: null,
        organizationPrimaryColor: null,
```

- [ ] **Step 8: Run the full spec file to verify everything passes**

Run: `npx jest attempt.service.spec`
Expected: PASS, all tests green (77 tests: 76 pre-existing + 1 new).

- [ ] **Step 9: Typecheck**

Run (from `apps/exam-runtime`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add apps/exam-runtime/src/attempts/attempt.service.ts apps/exam-runtime/src/attempts/attempt.service.spec.ts
git commit -m "feat: expose organizationPrimaryColor on /attempt/current"
```

---

### Task 2: apps/web — `onPrimaryTextColor` contrast utility

**Files:**
- Create: `apps/web/lib/candidate-theme.ts`
- Test: `apps/web/lib/candidate-theme.test.ts`

**Interfaces:**
- Produces: `onPrimaryTextColor(hex: string): string` — takes a `#RRGGBB` color string, returns either `'#1A1F1D'` (dark, the existing `candidate-text` color) or `'#ffffff'` depending on the input's luminance. Malformed input returns `'#ffffff'`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/candidate-theme.test.ts`:

```typescript
import { onPrimaryTextColor } from './candidate-theme';

describe('onPrimaryTextColor', () => {
  it('returns dark text for a light background color', () => {
    expect(onPrimaryTextColor('#F5F5F5')).toBe('#1A1F1D');
  });

  it('returns white text for a dark background color', () => {
    expect(onPrimaryTextColor('#1A1A1A')).toBe('#ffffff');
  });

  it('returns white text for the current default candidate-primary teal', () => {
    expect(onPrimaryTextColor('#2F6F5E')).toBe('#ffffff');
  });

  it('falls back to white for a malformed color string', () => {
    expect(onPrimaryTextColor('not-a-color')).toBe('#ffffff');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/web`): `npx jest candidate-theme.test -t "onPrimaryTextColor"`
Expected: FAIL with "Cannot find module './candidate-theme'".

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/candidate-theme.ts`:

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest candidate-theme.test`
Expected: PASS, 4/4 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/candidate-theme.ts apps/web/lib/candidate-theme.test.ts
git commit -m "feat: add onPrimaryTextColor contrast helper for candidate theming"
```

---

### Task 3: apps/web — types, Tailwind tokens, and theme provider

**Files:**
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/tailwind.config.ts`
- Create: `apps/web/app/(candidate)/components/CandidateThemeProvider.tsx`
- Delete: `apps/web/app/(candidate)/components/CandidateBrandingLogo.tsx`
- Modify: `apps/web/app/(candidate)/layout.tsx`

**Interfaces:**
- Consumes: `onPrimaryTextColor` from `apps/web/lib/candidate-theme.ts` (Task 2). `organizationPrimaryColor: string | null` from `AttemptCurrentResponse` (Task 1) — the frontend `AttemptPreview`/`AttemptState` types below mirror it as `organizationPrimaryColor`.
- Produces: `CandidateThemeProvider`, a named-exported component taking `{ children: React.ReactNode }`, mounted in `layout.tsx`.

- [ ] **Step 1: Add `organizationPrimaryColor` to the frontend types**

In `apps/web/lib/types.ts`, find `AttemptPreview` (has `organizationLogoUrl: string | null;` as its last field) and add the new field right after it:

```typescript
export interface AttemptPreview {
  exam: {
    title: string;
    instructions: string | null;
    durationMinutes: number;
    schedulingEnabled: boolean;
    availabilityWindowStart: string | null;
    availabilityWindowEnd: string | null;
  };
  schedulingWindowState: 'not_open' | 'open' | 'closed' | null;
  sections: AttemptSectionSummary[];
  organizationLogoUrl: string | null;
  organizationPrimaryColor: string | null;
}
```

Do the same for `AttemptState` (has `organizationLogoUrl: string | null;` as its last field):

```typescript
export interface AttemptState {
  status: string;
  remainingSeconds: number;
  webcamViolationCount: number;
  exam: { title: string };
  sections: AttemptSection[];
  answers: AttemptAnswerSummary[];
  messages: AttemptMessageSummary[];
  feedback: AttemptFeedback | null;
  organizationLogoUrl: string | null;
  organizationPrimaryColor: string | null;
}
```

- [ ] **Step 2: Add the new Tailwind tokens**

In `apps/web/tailwind.config.ts`, replace:

```typescript
        candidate: {
          primary: '#2F6F5E',
          'primary-light': '#F0F7F4',
          bg: '#F4F7F6',
```

with:

```typescript
        candidate: {
          primary: 'var(--color-candidate-primary, #2F6F5E)',
          'primary-light': 'var(--color-candidate-primary-light, #F0F7F4)',
          'on-primary': 'var(--color-candidate-on-primary, #ffffff)',
          bg: '#F4F7F6',
```

(Leave every other `candidate.*` key — `review`, `review-bg`, `review-border`, `danger`, `danger-bg`, `danger-border`, `border`, `text`, `text-secondary`, `text-tertiary`, `text-faint` — exactly as they are; they stay hardcoded.)

- [ ] **Step 3: Create the theme provider, replacing the logo-only component**

Read the current `apps/web/app/(candidate)/components/CandidateBrandingLogo.tsx` for reference, then create `apps/web/app/(candidate)/components/CandidateThemeProvider.tsx`:

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

Delete `apps/web/app/(candidate)/components/CandidateBrandingLogo.tsx`.

- [ ] **Step 4: Wire it into the layout**

Replace `apps/web/app/(candidate)/layout.tsx` in full:

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

- [ ] **Step 5: Typecheck**

Run (from `apps/web`): `npx tsc --noEmit`
Expected: no errors referencing `CandidateBrandingLogo`, `organizationPrimaryColor`, or the candidate Tailwind tokens.

- [ ] **Step 6: Run the existing candidate test suite**

Run (from `apps/web`): `npx jest "app/\(candidate\)"`
Expected: PASS — all pre-existing tests (welcome, exam, components) continue to pass unmodified, since their mocked attempt responses have no `organizationPrimaryColor` (so `themeStyle` is `undefined`, matching today's rendered output).

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/types.ts apps/web/tailwind.config.ts "apps/web/app/(candidate)/components/CandidateThemeProvider.tsx" "apps/web/app/(candidate)/layout.tsx"
git rm "apps/web/app/(candidate)/components/CandidateBrandingLogo.tsx"
git commit -m "feat: theme candidate-primary from org branding, replacing CandidateBrandingLogo with CandidateThemeProvider"
```

---

### Task 4: apps/web — fix the two text-on-primary contrast spots

**Files:**
- Modify: `apps/web/app/(candidate)/components/CandidateButton.tsx`
- Modify: `apps/web/app/(candidate)/components/QuestionNavigator.tsx`
- Test: `apps/web/app/(candidate)/components/CandidateButton.test.tsx` (existing, extend)

**Interfaces:**
- Consumes: the `candidate-on-primary` Tailwind token from Task 3.

- [ ] **Step 1: Write the failing test**

Read `apps/web/app/(candidate)/components/CandidateButton.test.tsx` first to match its existing style, then add this test to it:

```typescript
  it('uses the contrast-safe on-primary text color for the primary variant', () => {
    render(<CandidateButton variant="primary">Continue</CandidateButton>);
    expect(screen.getByRole('button')).toHaveClass('text-candidate-on-primary');
    expect(screen.getByRole('button')).not.toHaveClass('text-white');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/web`): `npx jest CandidateButton.test -t "contrast-safe"`
Expected: FAIL — the button still has `text-white`, not `text-candidate-on-primary`.

- [ ] **Step 3: Fix `CandidateButton`**

In `apps/web/app/(candidate)/components/CandidateButton.tsx`, replace:

```typescript
const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-candidate-primary text-white hover:opacity-90',
  secondary: 'bg-white text-candidate-primary border border-candidate-primary hover:bg-candidate-primary-light',
};
```

with:

```typescript
const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-candidate-primary text-candidate-on-primary hover:opacity-90',
  secondary: 'bg-white text-candidate-primary border border-candidate-primary hover:bg-candidate-primary-light',
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest CandidateButton.test`
Expected: PASS, all tests including the new one.

- [ ] **Step 5: Fix `QuestionNavigator`**

In `apps/web/app/(candidate)/components/QuestionNavigator.tsx`, replace:

```typescript
                !isCurrent && !isMarked && isAnswered && 'bg-candidate-primary text-white',
```

with:

```typescript
                !isCurrent && !isMarked && isAnswered && 'bg-candidate-primary text-candidate-on-primary',
```

- [ ] **Step 6: Run the QuestionNavigator test suite to confirm no regression**

Run: `npx jest QuestionNavigator.test`
Expected: PASS (this test file doesn't assert on the exact class string for the answered state today, so no test changes needed here — just confirming the swap didn't break anything).

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/(candidate)/components/CandidateButton.tsx" "apps/web/app/(candidate)/components/CandidateButton.test.tsx" "apps/web/app/(candidate)/components/QuestionNavigator.tsx"
git commit -m "fix: use contrast-safe text color on candidate-primary backgrounds"
```

---

### Task 5: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full exam-runtime suite**

Run (from `apps/exam-runtime`): `npx jest`
Expected: all suites pass (342 tests: 341 pre-existing + 1 new from Task 1).

- [ ] **Step 2: Full apps/web candidate-area suite**

Run (from `apps/web`): `npx jest "app/\(candidate\)" lib/candidate-theme.test.ts`
Expected: all pass — 94 candidate-area tests (the prior 93, plus the 1 new contrast test from Task 4) and 4 `candidate-theme` tests from Task 2, 98 total.

- [ ] **Step 3: Typecheck both apps**

Run: `cd apps/exam-runtime && npx tsc --noEmit && cd ../web && npx tsc --noEmit`
Expected: `apps/exam-runtime` has zero errors. `apps/web` has a handful of pre-existing errors unrelated to this change (in `QuestionNavigator.test.tsx`, `forgot-password/page.test.tsx`, `login/page.test.tsx`, `reset-password/[token]/page.test.tsx` — missing-field and fetch-mock-signature issues that predate this plan). Confirm no *new* errors appear in `types.ts`, `tailwind.config.ts`, `CandidateThemeProvider.tsx`, `layout.tsx`, `CandidateButton.tsx`, or `QuestionNavigator.tsx`.

- [ ] **Step 4: Live verification**

1. Start `api`, `exam-runtime`, and `web` dev servers.
2. Log in as `admin@demo-org.test` / `DevAdmin123!` (org slug `demo-org`) and go to Org Settings → Branding Settings.
3. Set Primary color to a distinctive, clearly-non-default value (e.g. a bright red `#B23B3B` or blue `#1E5FBF`) and save.
4. As a recruiter, invite a test candidate to any exam and grab the invitation link (or reuse an existing unexpired invitation for demo-org).
5. Open the invitation link as the candidate: confirm the welcome/practice screen's primary buttons, the exam page's timer fill, question navigator dots, and answer-selection highlight all reflect the new primary color, and that button text stays readable.
6. Set Primary color back to blank/default (or leave it — demo-org's prior tests don't depend on a specific value) and confirm candidate pages return to the original teal when `primaryColor` is cleared.

- [ ] **Step 5: Confirm no leftover references to the deleted component**

Run: `grep -rn "CandidateBrandingLogo" apps/web/`
Expected: no output.
