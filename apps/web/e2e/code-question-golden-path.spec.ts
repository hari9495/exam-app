import { test, expect } from '@playwright/test';

const ORG_SLUG = process.env.E2E_ORG_SLUG ?? 'demo-org';
const RECRUITER_EMAIL = process.env.E2E_RECRUITER_EMAIL ?? 'recruiter@demo-org.test';
const RECRUITER_PASSWORD = process.env.E2E_RECRUITER_PASSWORD ?? 'Passw0rd!2026';

test('candidate writes and submits code, recruiter grades and finalizes the attempt', async ({ page, browser }) => {
  // Recruiter: create a code question, an exam, invite a candidate
  await page.goto('/login');
  await page.getByLabel('Organization slug').fill(ORG_SLUG);
  await page.getByLabel('Email').fill(RECRUITER_EMAIL);
  await page.getByLabel('Password').fill(RECRUITER_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('link', { name: 'Question Bank' }).click();
  await page.getByRole('link', { name: 'New question' }).click();
  // Question type / Language are Radix Select comboboxes, not native <select> elements —
  // open the trigger and click the option instead of using selectOption().
  await page.getByLabel('Question type').click();
  await page.getByRole('option', { name: 'Code' }).click();
  await page.getByLabel('Question text').fill('Write a function that reverses a string.');
  await page.getByLabel('Marks', { exact: true }).fill('10');
  await page.getByLabel('Language').click();
  await page.getByRole('option', { name: 'javascript' }).click();
  await page.getByLabel('Starter code').fill('function reverse(str) {\n  \n}');
  await page.getByRole('button', { name: 'Create question' }).click();
  await expect(page).toHaveURL(/\/questions$/);

  await page.getByRole('link', { name: 'Exams' }).click();
  await page.getByRole('link', { name: 'New exam' }).click();
  const examTitle = `Code Path Exam ${Date.now()}`;
  await page.getByLabel('Title').fill(examTitle);
  await page.getByRole('button', { name: 'Create exam' }).click();
  await expect(page).toHaveURL(/\/exams\/.+\/edit$/);

  await page.getByRole('tab', { name: 'Sections & Questions' }).click();
  await page.getByLabel('New section title').fill('Section One');
  await page.getByRole('button', { name: 'Add section' }).click();
  await page.getByRole('button', { name: 'Manage questions' }).click();
  await page.getByRole('checkbox', { name: /Write a function that reverses a string\./ }).first().click();
  await page.getByRole('button', { name: 'Save questions' }).click();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page).toHaveURL(/\/exams$/);

  await page.getByRole('link', { name: 'Candidates' }).click();
  const candidateEmail = `code-path-${Date.now()}@example.com`;
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Code Path Candidate');
  await page.getByLabel('Email').fill(candidateEmail);
  await page.getByRole('button', { name: 'Add candidate' }).click();
  await expect(page.getByText(candidateEmail)).toBeVisible();

  await page.getByLabel('Exam to invite to').click();
  await page.getByRole('option', { name: examTitle, exact: true }).click();
  await page.locator('.group', { hasText: candidateEmail }).getByRole('checkbox', { name: 'Code Path Candidate' }).click();
  const invitePromise = page.waitForResponse((response) => response.url().includes('/invitations') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Send invitations' }).click();
  const inviteResponse = await invitePromise;
  const inviteToken: string = (await inviteResponse.json()).created[0].token;

  // Candidate: redeem the invite in a second, independent browser context, write code, submit
  const candidateContext = await browser.newContext();
  const candidatePage = await candidateContext.newPage();
  await candidatePage.addInitScript(() => {
    // ponytail: real Chromium exposes navigator.mediaDevices as a non-configurable accessor,
    // so plain assignment silently no-ops — Object.defineProperty is required to override it.
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => undefined }] }) },
      configurable: true,
    });
    // The mock above isn't a real MediaStream, so useWebcamMonitor's video.srcObject
    // assignment would throw and fail-safe into reporting a real violation on any
    // long-running spec — this flag tells it to skip monitoring entirely in e2e runs.
    (window as unknown as { __DISABLE_WEBCAM_MONITOR__?: boolean }).__DISABLE_WEBCAM_MONITOR__ = true;
  });
  await candidatePage.goto(`/start?token=${inviteToken}`);
  await expect(candidatePage).toHaveURL(/\/welcome$/);
  await candidatePage.getByRole('button', { name: 'Enable camera' }).click();
  await candidatePage.getByRole('button', { name: 'Start exam' }).click();
  await expect(candidatePage).toHaveURL(/\/exam$/);

  await expect(candidatePage.getByText('Write a function that reverses a string.')).toBeVisible();
  // Click the editor's visible line area, not its hidden IME textarea directly
  // (that textarea has aria-hidden/pointer-events that block a direct click) —
  // clicking the view moves focus onto Monaco's real input and enables typing.
  const editor = candidatePage.locator('.monaco-editor .view-lines').first();
  await editor.click();
  // The editor is prefilled with starter code; select-all then insertText replaces it.
  // insertText (not keyboard.type) is required here: Monaco auto-closes brackets/quotes
  // and auto-indents on Enter, so typing character-by-character races those editor
  // behaviors and garbles the result. insertText inserts the whole string as one op,
  // like a paste, bypassing that per-keystroke autocomplete logic entirely.
  await candidatePage.keyboard.press('ControlOrMeta+A');
  await candidatePage.keyboard.insertText('function reverse(str) {\n  return str.split("").reverse().join("");\n}');
  // Wait for the debounced autosave to fire before submitting.
  await candidatePage.waitForResponse((response) => response.url().includes('/attempt/answer') && response.request().method() === 'POST');

  await candidatePage.getByRole('button', { name: 'Run' }).click();
  // Real Piston execution can take a second or two; wait for either a real result or the
  // sandbox_unavailable error panel, rather than a fixed sleep.
  await candidatePage.waitForResponse((response) => response.url().includes('/attempt/run-code'));
  const resultPanel = candidatePage.getByText(/Exit code:|Couldn't run your code right now/);
  await expect(resultPanel).toBeVisible({ timeout: 10000 });

  await candidatePage.getByRole('button', { name: 'Review & Submit' }).first().click();
  await candidatePage.getByRole('button', { name: 'Submit' }).click();
  await expect(candidatePage).toHaveURL(/\/submitted$/);
  await candidateContext.close();

  // Recruiter: open the Grading tab, grade the submission, finalize
  await page.getByRole('link', { name: 'Exams' }).click();
  await page.locator('.group', { hasText: examTitle }).getByRole('link', { name: 'Edit' }).click();
  await page.getByRole('tab', { name: 'Grading' }).click();
  await expect(page.getByText('Code Path Candidate')).toBeVisible();
  await expect(page.getByText(/return str\.split/)).toBeVisible();

  await page.getByLabel(/Marks for Write a function/).fill('9');
  await page.getByRole('button', { name: 'Save grade' }).click();

  const finalizeButton = page.getByRole('button', { name: 'Finalize grade' });
  await expect(finalizeButton).toBeEnabled();
  await finalizeButton.click();
  await expect(page.getByText('No attempts pending manual grading.')).toBeVisible();
});
