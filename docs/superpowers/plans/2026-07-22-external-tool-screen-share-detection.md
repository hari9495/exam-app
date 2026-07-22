# External-Tool & Screen-Share Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two proctoring signals — `window_blur` (focus lost to another app while the exam tab stays visible) and multi-monitor detection (gate exam start on `screen.isExtended`; flag displays added mid-exam) — feeding the existing proctoring/integrity pipeline with zero new backend plumbing.

**Architecture:** Both signals register via the codebase's existing 3-point pattern for client proctoring events: (1) `ProctoringEventType` union in `apps/web/lib/types.ts`, (2) `CLIENT_REPORTABLE_EVENT_TYPES` allowlist + `SEVERITY_BY_EVENT_TYPE` in `apps/exam-runtime/src/attempts/proctoring-severity.ts`, (3) detectors in `apps/web/lib/hooks/useProctoringMonitor.ts`. Everything downstream (live socket flags, ProctoringEvent persistence, integrity-level derivation, badges, exports, narrative) picks them up automatically. The start gate is a client-side check in the welcome page, consistent with the platform's existing client-side proctoring posture.

**Tech Stack:** React 18 hooks + Jest/RTL (apps/web), NestJS class-validator allowlist (apps/exam-runtime), Playwright e2e. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-22-external-tool-screen-share-detection-design.md`

## Global Constraints

- Event names, verbatim: `window_blur` (severity `medium`), `multi_monitor_detected` (severity `high`).
- `window_blur` reports ONLY when `document.visibilityState === 'visible'` at blur time (tab-hide is `tab_switch`'s job); debounced 5s via the hook's existing `debouncedReport` (5000ms window, same as `tab_switch`).
- `window_blur` is reported on the matching focus-return with `metadata: { durationMs }` (duration measured blur→focus). A blur never returned from reports nothing (idle_timeout/expiry cover that).
- Multi-monitor mid-exam watcher: 15s interval, edge-triggered — one report per false→true transition of `screen.isExtended`; removal resets the edge so re-adding fires again; `undefined` (Firefox/Safari) never fires.
- Start gate message, verbatim: `Please disconnect additional displays before starting the exam.` Gate re-checks on every Start click; `screen.isExtended === undefined` passes (fail-open — no signal available).
- No strike system, no mid-exam blocking, no new integrity rules, no schema changes, no new npm dependencies, no recruiter UI changes.
- Report-only signals never throw into the exam flow: reporting already fails silently (`useReportProctoringEvent` catches).

---

### Task 1: Backend event-type registration

**Files:**
- Modify: `apps/exam-runtime/src/attempts/proctoring-severity.ts` (allowlist lines 1-10, severity map lines 14-24)
- Test: `apps/exam-runtime/src/attempts/proctoring-severity.spec.ts` (extend)

**Interfaces:**
- Consumes: nothing new.
- Produces: `CLIENT_REPORTABLE_EVENT_TYPES` includes `'window_blur'` and `'multi_monitor_detected'` (the DTO's `@IsIn(CLIENT_REPORTABLE_EVENT_TYPES)` in `report-proctoring-event.dto.ts:5` then accepts both automatically); `getProctoringEventSeverity('window_blur') === 'medium'`, `getProctoringEventSeverity('multi_monitor_detected') === 'high'`. Tasks 2-4 rely on the backend accepting these two exact strings.

- [ ] **Step 1: Write the failing tests**

In `apps/exam-runtime/src/attempts/proctoring-severity.spec.ts`, add alongside the existing cases (match the file's local style — read it first):

```typescript
  it('accepts window_blur as client-reportable with medium severity', () => {
    expect(CLIENT_REPORTABLE_EVENT_TYPES).toContain('window_blur');
    expect(getProctoringEventSeverity('window_blur')).toBe('medium');
  });

  it('accepts multi_monitor_detected as client-reportable with high severity', () => {
    expect(CLIENT_REPORTABLE_EVENT_TYPES).toContain('multi_monitor_detected');
    expect(getProctoringEventSeverity('multi_monitor_detected')).toBe('high');
  });
```

(Import `CLIENT_REPORTABLE_EVENT_TYPES` if the spec file doesn't already.)

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "D:\exam app\apps\exam-runtime" && npx jest src/attempts/proctoring-severity.spec.ts
```
Expected: FAIL — array does not contain / severity returns 'low' default.

- [ ] **Step 3: Implement**

`apps/exam-runtime/src/attempts/proctoring-severity.ts`:

```typescript
export const CLIENT_REPORTABLE_EVENT_TYPES = [
  'tab_switch',
  'fullscreen_exit',
  'copy_paste',
  'right_click',
  'dev_tools_detected',
  'refresh_warning',
  'idle_timeout',
  'editor_paste',
  'window_blur',
  'multi_monitor_detected',
] as const;
```

and in `SEVERITY_BY_EVENT_TYPE`:

```typescript
  multi_monitor_detected: 'high',
  window_blur: 'medium',
```

(place them beside the existing entries of the same severity).

- [ ] **Step 4: Run tests + full suite guard**

```bash
cd "D:\exam app\apps\exam-runtime" && npx jest src/attempts/proctoring-severity.spec.ts && npx jest && npx tsc --noEmit -p tsconfig.json
```
Expected: all PASS (the DTO allowlist test suite, if any, must not regress).

- [ ] **Step 5: Commit**

```bash
git add apps/exam-runtime/src/attempts/proctoring-severity.ts apps/exam-runtime/src/attempts/proctoring-severity.spec.ts
git commit -m "feat: register window_blur and multi_monitor_detected proctoring event types"
```

---

### Task 2: Frontend detectors in useProctoringMonitor

**Files:**
- Modify: `apps/web/lib/types.ts:208-216` (`ProctoringEventType` union)
- Modify: `apps/web/lib/hooks/useProctoringMonitor.ts`
- Test: `apps/web/lib/hooks/useProctoringMonitor.test.tsx` (extend)

**Interfaces:**
- Consumes: backend acceptance of both event types (Task 1); the hook's existing `debouncedReport(eventType, windowMs, metadata?)` and `reportRef.current(eventType, metadata?)` internals; `useReportProctoringEvent()` signature `(eventType: ProctoringEventType, metadata?: Record<string, unknown>) => void` (`useAttempt.ts:137-146`).
- Produces: the two detectors below, active whenever the hook is `enabled` (the exam page already passes `enabled` — no page change needed for mid-exam signals).

- [ ] **Step 1: Add the union members**

`apps/web/lib/types.ts`, `ProctoringEventType` union: add `| 'window_blur' | 'multi_monitor_detected'` after `'editor_paste'`.

- [ ] **Step 2: Write the failing hook tests**

Extend `apps/web/lib/hooks/useProctoringMonitor.test.tsx`, reusing its existing `Probe` component + fake-timers + `useReportProctoringEvent` mock setup (see lines 1-22 of the file):

```tsx
  describe('window_blur', () => {
    it('reports on focus return with durationMs when blur happened while visible', () => {
      render(<Probe enabled={true} />);
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });

      window.dispatchEvent(new Event('blur'));
      expect(report).not.toHaveBeenCalled(); // reported on focus-return, not at blur

      act(() => {
        jest.advanceTimersByTime(7000);
      });
      window.dispatchEvent(new Event('focus'));

      expect(report).toHaveBeenCalledWith('window_blur', { durationMs: 7000 });
    });

    it('suppresses blur that accompanies a tab-hide (visibilityState hidden)', () => {
      render(<Probe enabled={true} />);
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });

      window.dispatchEvent(new Event('blur'));
      act(() => {
        jest.advanceTimersByTime(3000);
      });
      window.dispatchEvent(new Event('focus'));

      expect(report).not.toHaveBeenCalledWith('window_blur', expect.anything());
    });

    it('debounces rapid blur/focus cycles to one report per 5s window', () => {
      render(<Probe enabled={true} />);
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });

      window.dispatchEvent(new Event('blur'));
      act(() => jest.advanceTimersByTime(1000));
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('blur'));
      act(() => jest.advanceTimersByTime(1000));
      window.dispatchEvent(new Event('focus'));

      const blurReports = report.mock.calls.filter(([type]: [string]) => type === 'window_blur');
      expect(blurReports).toHaveLength(1);
    });
  });

  describe('multi_monitor_detected', () => {
    function setIsExtended(value: boolean | undefined) {
      Object.defineProperty(window.screen, 'isExtended', { value, configurable: true });
    }

    it('fires once when isExtended transitions false -> true, silent on repeated true ticks', () => {
      setIsExtended(false);
      render(<Probe enabled={true} />);

      act(() => jest.advanceTimersByTime(15_000)); // tick: still false
      expect(report).not.toHaveBeenCalledWith('multi_monitor_detected', undefined);

      setIsExtended(true);
      act(() => jest.advanceTimersByTime(15_000)); // tick: false -> true edge
      act(() => jest.advanceTimersByTime(15_000)); // tick: true -> true, silent

      const monitorReports = report.mock.calls.filter(([type]: [string]) => type === 'multi_monitor_detected');
      expect(monitorReports).toHaveLength(1);
    });

    it('fires again after removal then re-add', () => {
      setIsExtended(false);
      render(<Probe enabled={true} />);

      setIsExtended(true);
      act(() => jest.advanceTimersByTime(15_000));
      setIsExtended(false);
      act(() => jest.advanceTimersByTime(15_000));
      setIsExtended(true);
      act(() => jest.advanceTimersByTime(15_000));

      const monitorReports = report.mock.calls.filter(([type]: [string]) => type === 'multi_monitor_detected');
      expect(monitorReports).toHaveLength(2);
    });

    it('never fires when isExtended is undefined (unsupported browser)', () => {
      setIsExtended(undefined);
      render(<Probe enabled={true} />);
      act(() => jest.advanceTimersByTime(60_000));
      expect(report).not.toHaveBeenCalledWith('multi_monitor_detected', expect.anything());
    });
  });
```

Note for the implementer: `window.screen.isExtended` is not in the default TS lib — the test helper's `Object.defineProperty` sidesteps typing; the hook itself will need a safe read (Step 4 shows it).

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd "D:\exam app\apps\web" && npx jest lib/hooks/useProctoringMonitor.test.tsx
```
Expected: new tests FAIL (no listeners/interval exist); existing tests still pass.

- [ ] **Step 4: Implement the detectors**

In `apps/web/lib/hooks/useProctoringMonitor.ts`, inside the `useEffect` (after the existing handler definitions), add:

```typescript
    const MULTI_MONITOR_POLL_MS = 15_000;
    let blurStartedAt: number | null = null;

    function onWindowBlur() {
      // Focus lost to another app while the exam stays visible -- a real tab
      // switch hides the document and is already covered by tab_switch.
      if (document.visibilityState === 'visible') {
        blurStartedAt = Date.now();
      }
    }
    function onWindowFocus() {
      if (blurStartedAt !== null) {
        const durationMs = Date.now() - blurStartedAt;
        blurStartedAt = null;
        debouncedReport('window_blur', TAB_SWITCH_DEBOUNCE_MS, { durationMs });
      }
      resetIdleTimer();
    }

    // screen.isExtended is Chromium-only; undefined (Firefox/Safari) never transitions to true.
    let lastIsExtended = (window.screen as Screen & { isExtended?: boolean }).isExtended === true;
    const multiMonitorInterval = setInterval(() => {
      const isExtended = (window.screen as Screen & { isExtended?: boolean }).isExtended === true;
      if (isExtended && !lastIsExtended) {
        reportRef.current('multi_monitor_detected');
      }
      lastIsExtended = isExtended;
    }, MULTI_MONITOR_POLL_MS);

    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('focus', onWindowFocus);
```

and in the cleanup return:

```typescript
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('focus', onWindowFocus);
      clearInterval(multiMonitorInterval);
```

Two intentional details: (a) `debouncedReport('window_blur', ...)` — the FIRST report in a burst carries its real `durationMs` and subsequent blurs within 5s are dropped, matching the debounce semantics of every other event; (b) the initial `lastIsExtended` snapshot means a display already connected when the exam page loads does NOT fire mid-exam (the start gate owns that case; the watcher only catches additions after start).

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd "D:\exam app\apps\web" && npx jest lib/hooks/useProctoringMonitor.test.tsx && npx tsc --noEmit -p tsconfig.json
```
Expected: all hook tests PASS; no NEW tsc errors (pre-existing failures in QuestionNavigator.test.tsx and login/forgot-password/reset-password page tests are known-unrelated).

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/hooks/useProctoringMonitor.ts apps/web/lib/hooks/useProctoringMonitor.test.tsx
git commit -m "feat: window_blur and multi-monitor detectors in the proctoring monitor"
```

---

### Task 3: Welcome-page multi-monitor start gate

**Files:**
- Modify: `apps/web/app/(candidate)/welcome/page.tsx` (`handleStart` at lines 58-65; render block near the Start button, lines 136-140)
- Test: `apps/web/app/(candidate)/welcome/page.test.tsx` (extend)

**Interfaces:**
- Consumes: nothing from other tasks (pure client check; `screen.isExtended` read the same safe way as Task 2).
- Produces: exam start blocked while `isExtended === true`, with the verbatim message rendered; Task 4's e2e drives this gate via an `addInitScript` mock.

- [ ] **Step 1: Write the failing page tests**

Extend `apps/web/app/(candidate)/welcome/page.test.tsx`. Read the file's existing setup first (it mocks `useAttemptQuery`/`useStartAttempt`/router and drives the page through practice → consent → start); reuse its helpers to reach the consent step with camera granted + consent checked, then add:

```tsx
  function setIsExtended(value: boolean | undefined) {
    Object.defineProperty(window.screen, 'isExtended', { value, configurable: true });
  }

  it('blocks start and shows the disconnect message while a second display is detected', async () => {
    setIsExtended(true);
    // ...reach consent step, enable camera, check consent (existing helper flow)...
    await userEvent.click(screen.getByRole('button', { name: 'Start exam' }));

    expect(screen.getByText('Please disconnect additional displays before starting the exam.')).toBeInTheDocument();
    expect(startAttemptMutateAsync).not.toHaveBeenCalled();
  });

  it('proceeds when clicked again after the display is disconnected', async () => {
    setIsExtended(true);
    // ...reach consent step, camera + consent...
    await userEvent.click(screen.getByRole('button', { name: 'Start exam' }));
    expect(startAttemptMutateAsync).not.toHaveBeenCalled();

    setIsExtended(false);
    await userEvent.click(screen.getByRole('button', { name: 'Start exam' }));
    expect(startAttemptMutateAsync).toHaveBeenCalled();
  });

  it('proceeds normally when isExtended is unsupported (undefined)', async () => {
    setIsExtended(undefined);
    // ...reach consent step, camera + consent...
    await userEvent.click(screen.getByRole('button', { name: 'Start exam' }));
    expect(startAttemptMutateAsync).toHaveBeenCalled();
  });
```

(`startAttemptMutateAsync` = whatever the existing tests name their `useStartAttempt().mutateAsync` mock — reuse it.)

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "D:\exam app\apps\web" && npx jest "app/(candidate)/welcome/page.test.tsx"
```
Expected: new tests FAIL (no gate exists; mutateAsync called / message absent).

- [ ] **Step 3: Implement the gate**

In `apps/web/app/(candidate)/welcome/page.tsx`:

Add state next to the others (line ~21):

```typescript
  const [multiMonitorBlocked, setMultiMonitorBlocked] = useState(false);
```

Replace `handleStart` (lines 58-65) with:

```typescript
  async function handleStart() {
    // Re-checked on every click: unplugging the display then clicking again proceeds.
    // undefined (Firefox/Safari) can't be detected -- fail open, matching the
    // platform's client-side proctoring posture.
    if ((window.screen as Screen & { isExtended?: boolean }).isExtended === true) {
      setMultiMonitorBlocked(true);
      return;
    }
    setMultiMonitorBlocked(false);
    try {
      await startAttempt.mutateAsync();
      router.push('/exam');
    } catch {
      toast("Couldn't start the exam — please check your connection and try again.", 'error');
    }
  }
```

In the render, directly above the Start button block (line ~136), add:

```tsx
            {multiMonitorBlocked ? (
              <div className="mb-3 rounded-md border border-candidate-danger-border bg-candidate-danger-bg p-3 text-sm text-candidate-danger">
                Please disconnect additional displays before starting the exam.
              </div>
            ) : null}
```

(same candidate-danger styling as the existing closed-window message at lines 97-100).

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "D:\exam app\apps\web" && npx jest "app/(candidate)/welcome/page.test.tsx" && npx tsc --noEmit -p tsconfig.json
```
Expected: PASS; no new tsc errors.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(candidate)/welcome/page.tsx" "apps/web/app/(candidate)/welcome/page.test.tsx"
git commit -m "feat: multi-monitor start gate on the candidate welcome page"
```

---

### Task 4: E2E + final verification

**Files:**
- Create: `apps/web/e2e/screen-share-detection.spec.ts`

**Interfaces:**
- Consumes: everything above. The e2e mocks `screen.isExtended` via `addInitScript` `Object.defineProperty` with a window-scoped mutable flag so the test can flip it mid-flight.

**Environment for all runs (per project norms):** dev servers web=3002/api=3501/exam-runtime=3502 with api + exam-runtime under `NODE_ENV=test`; Redis container `examapp-redis-1` up; Playwright env `WEB_BASE_URL=http://localhost:3002 E2E_API_BASE=http://localhost:3501/api/v1`.

- [ ] **Step 1: Write the e2e spec**

Create `apps/web/e2e/screen-share-detection.spec.ts`. Structure mirrors `live-monitoring-golden-path.spec.ts` (recruiter context + candidate context; recruiter watches the Live tab). The `isExtended` mock uses a getter over a window flag so the test flips it without reload:

```typescript
import { test, expect } from '@playwright/test';

const ORG_SLUG = process.env.E2E_ORG_SLUG ?? 'demo-org';
const RECRUITER_EMAIL = process.env.E2E_RECRUITER_EMAIL ?? 'recruiter@demo-org.test';
const RECRUITER_PASSWORD = process.env.E2E_RECRUITER_PASSWORD ?? 'Passw0rd!2026';

test('multi-monitor gates exam start, and a display added mid-exam raises a live proctoring flag', async ({ page, browser }) => {
  // Recruiter: create question + exam, publish, invite (same scaffold as live-monitoring spec)
  await page.goto('/login');
  await page.getByLabel('Organization slug').fill(ORG_SLUG);
  await page.getByLabel('Email').fill(RECRUITER_EMAIL);
  await page.getByLabel('Password').fill(RECRUITER_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('link', { name: 'Question Bank' }).click();
  await page.getByRole('link', { name: 'New question' }).click();
  await page.getByLabel('Question text').fill('Screen path: 2 + 2?');
  await page.getByLabel('Marks', { exact: true }).fill('5');
  const optionInputs = page.getByLabel(/Option \d text/);
  await optionInputs.nth(0).fill('4');
  await optionInputs.nth(1).fill('5');
  await page.getByRole('radio', { name: 'Option 1 correct' }).click();
  await page.getByRole('button', { name: 'Create question' }).click();
  await expect(page).toHaveURL(/\/questions$/);

  await page.getByRole('link', { name: 'Exams' }).click();
  await page.getByRole('link', { name: 'New exam' }).click();
  const examTitle = `Screen Detection Exam ${Date.now()}`;
  await page.getByLabel('Title').fill(examTitle);
  await page.getByRole('button', { name: 'Create exam' }).click();
  await expect(page).toHaveURL(/\/exams\/.+\/edit$/);

  await page.getByRole('tab', { name: 'Sections & Questions' }).click();
  await page.getByLabel('New section title').fill('Section One');
  await page.getByRole('button', { name: 'Add section' }).click();
  await page.getByRole('button', { name: 'Manage questions' }).click();
  await page.getByRole('checkbox', { name: /Screen path: 2 \+ 2\?/ }).first().click();
  await page.getByRole('button', { name: 'Save questions' }).click();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page).toHaveURL(/\/exams$/);

  await page.getByRole('link', { name: 'Candidates' }).click();
  const candidateEmail = `screen-path-${Date.now()}@example.com`;
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Screen Path Candidate');
  await page.getByLabel('Email').fill(candidateEmail);
  await page.getByRole('button', { name: 'Add candidate' }).click();
  await expect(page.getByText(candidateEmail)).toBeVisible();

  await page.getByLabel('Exam to invite to').click();
  await page.getByRole('option', { name: examTitle, exact: true }).click();
  await page.locator('.group', { hasText: candidateEmail }).getByRole('checkbox', { name: 'Screen Path Candidate' }).click();
  const [inviteResponse] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/invitations') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Send invitations' }).click(),
  ]);
  const inviteToken: string = (await inviteResponse.json()).created[0].token;

  // Recruiter: open the exam's Live tab so the mid-exam flag can be observed later
  await page.getByRole('link', { name: 'Exams' }).click();
  await page.locator('.group', { hasText: examTitle }).getByRole('link', { name: 'Edit' }).click();
  await page.getByRole('tab', { name: 'Live' }).click();
  await expect(page.getByText('Screen Path Candidate')).toBeVisible();

  // Candidate context: webcam mock + a mutable isExtended mock (getter over a window flag)
  const candidateContext = await browser.newContext();
  const candidatePage = await candidateContext.newPage();
  await candidatePage.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => undefined }] }) },
      configurable: true,
    });
    (window as unknown as { __DISABLE_WEBCAM_MONITOR__?: boolean }).__DISABLE_WEBCAM_MONITOR__ = true;
    (window as unknown as { __MOCK_IS_EXTENDED__?: boolean }).__MOCK_IS_EXTENDED__ = true;
    Object.defineProperty(window.screen, 'isExtended', {
      get: () => (window as unknown as { __MOCK_IS_EXTENDED__?: boolean }).__MOCK_IS_EXTENDED__,
      configurable: true,
    });
  });

  await candidatePage.goto(`/start?token=${inviteToken}`);
  await expect(candidatePage).toHaveURL(/\/welcome$/);
  await candidatePage.getByRole('button', { name: /skip practice/i }).click();
  await candidatePage.getByRole('button', { name: 'Enable camera' }).click();
  await candidatePage.getByRole('checkbox', { name: /i understand and consent to monitoring/i }).click();

  // Gate: start refused while a second display is "connected"
  await candidatePage.getByRole('button', { name: 'Start exam' }).click();
  await expect(candidatePage.getByText('Please disconnect additional displays before starting the exam.')).toBeVisible();
  await expect(candidatePage).toHaveURL(/\/welcome$/);

  // "Disconnect" the display and retry -- proceeds into the exam
  await candidatePage.evaluate(() => {
    (window as unknown as { __MOCK_IS_EXTENDED__?: boolean }).__MOCK_IS_EXTENDED__ = false;
  });
  await candidatePage.getByRole('button', { name: 'Start exam' }).click();
  await expect(candidatePage).toHaveURL(/\/exam$/);
  await expect(candidatePage.getByText('Screen path: 2 + 2?')).toBeVisible();

  // Mid-exam: "plug in" a display; the 15s watcher fires multi_monitor_detected;
  // the recruiter's live view shows it (allow one full poll interval + transport).
  await candidatePage.evaluate(() => {
    (window as unknown as { __MOCK_IS_EXTENDED__?: boolean }).__MOCK_IS_EXTENDED__ = true;
  });
  await expect(page.getByText('multi_monitor_detected')).toBeVisible({ timeout: 25_000 });

  await candidateContext.close();
});
```

NOTE for the implementer: the recruiter live panel renders alert entries by eventType (see `LiveMonitoringPanel.tsx` alerts list) — if it renders a humanized label instead of the raw `multi_monitor_detected` string, adjust the final assertion to that rendering after reading the component; keep asserting the flag's arrival on the live view.

- [ ] **Step 2: Run the new spec (twice)**

```bash
cd "D:\exam app\apps\web" && WEB_BASE_URL=http://localhost:3002 E2E_API_BASE=http://localhost:3501/api/v1 npx playwright test e2e/screen-share-detection.spec.ts --reporter=list
```
Expected: PASS twice consecutively. (Timing note: the watcher polls every 15s — the 25s timeout on the final assertion absorbs one full interval plus socket transport.)

- [ ] **Step 3: Full regression**

```bash
cd "D:\exam app\apps\exam-runtime" && npx jest
cd "D:\exam app\apps\web" && npx jest lib/hooks/useProctoringMonitor.test.tsx "app/(candidate)/welcome/page.test.tsx"
cd "D:\exam app\apps\web" && WEB_BASE_URL=http://localhost:3002 E2E_API_BASE=http://localhost:3501/api/v1 npx playwright test --reporter=list
```
Expected: exam-runtime all green; the two web suites green; Playwright 15/15 (13 existing + this spec... verify the actual count: 12 pre-IP-restriction + 1 IP restriction + 1 new = 14 — use whatever total the run reports, all passing).

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/screen-share-detection.spec.ts
git commit -m "test: e2e coverage for multi-monitor start gate and mid-exam detection flag"
```

---

## Self-Review Notes

- **Spec coverage:** event registration incl. severities (T1), window_blur visible-only + focus-return duration + 5s debounce (T2), edge-triggered 15s isExtended watcher incl. undefined never-fires and already-connected-at-load handled by the gate not the watcher (T2), start gate verbatim message + re-check-on-click + fail-open undefined (T3), no new pipeline/UI/rules/schema (no tasks touch them), e2e gate-block → recover → mid-exam flag on recruiter live view (T4). ✓
- **Placeholder scan:** the two "reach consent step via existing helpers" test comments reference concrete existing test scaffolding in the same file the implementer must read — acceptable per repo convention of mirroring adjacent tests; all assertions and implementation code are complete. Playwright total count in T4 Step 3 states the arithmetic explicitly rather than a fixed number (suite count changed mid-session). ✓
- **Type consistency:** `window_blur`/`multi_monitor_detected` strings, `{ durationMs }` metadata shape, `debouncedReport(eventType, TAB_SWITCH_DEBOUNCE_MS, metadata)` 3-arg form (matches the hook's existing signature at line 20), and the `Screen & { isExtended?: boolean }` cast are identical across T2/T3/T4. ✓
