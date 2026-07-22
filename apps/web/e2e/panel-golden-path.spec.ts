import { test, expect } from '@playwright/test';

const ORG_SLUG = process.env.E2E_ORG_SLUG ?? 'demo-org';
const RECRUITER_EMAIL = process.env.E2E_RECRUITER_EMAIL ?? 'recruiter@demo-org.test';
const RECRUITER_PASSWORD = process.env.E2E_RECRUITER_PASSWORD ?? 'Passw0rd!2026';
const PANEL_EMAIL = process.env.E2E_PANEL_EMAIL ?? 'panel@demo-org.test';
const PANEL_PASSWORD = process.env.E2E_PANEL_PASSWORD ?? 'Passw0rd!2026';

async function inviteCandidate(page: import('@playwright/test').Page, name: string, email: string, examTitle: string) {
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Add candidate' }).click();
  await expect(page.getByText(email)).toBeVisible();

  await page.getByLabel('Exam to invite to').click();
  await page.getByRole('option', { name: examTitle, exact: true }).click();
  await page.locator('.group', { hasText: email }).getByRole('checkbox', { name }).click();

  const [inviteResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/invitations') && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Send invitations' }).click(),
  ]);
  const inviteBody = await inviteResponse.json();
  return inviteBody.created[0].token as string;
}

async function settleAttempt(page: import('@playwright/test').Page, token: string, examTitle: string, questionText: string) {
  // Each candidate token must redeem into its own session. Without clearing cookies first, a
  // leftover candidate refresh-token cookie from a prior candidate in this same browser context
  // races the new redeem() call and can silently re-authenticate as the previous candidate.
  await page.context().clearCookies();
  await page.addInitScript(() => {
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
  await page.goto(`/start?token=${token}`);
  await expect(page).toHaveURL(/\/welcome$/);
  // The welcome page always shows the practice step first -- the exam title/Enable camera
  // only render once practice is skipped/completed.
  await page.getByRole('button', { name: /skip practice/i }).click();
  await expect(page.getByText(examTitle)).toBeVisible();
  await page.getByRole('button', { name: 'Enable camera' }).click();
  await page.getByRole('checkbox', { name: /i understand and consent to monitoring/i }).click();
  await page.getByRole('button', { name: 'Start exam' }).click();
  await expect(page).toHaveURL(/\/exam$/);

  await expect(page.getByText(questionText)).toBeVisible();
  await page.getByRole('button', { name: /4/ }).click();
  await page.getByRole('button', { name: 'Review & Submit' }).first().click();
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page).toHaveURL(/\/submitted$/);
  await expect(page.getByText('Exam submitted').first()).toBeVisible();
}

test('panel member views results, opens a candidate, compares, and exports', async ({ page }) => {
  const questionText = 'Panel path: 2 + 2?';

  // Recruiter: create exam, question, publish, add two candidates, invite them
  await page.goto('/login');
  await page.getByLabel('Organization slug').fill(ORG_SLUG);
  await page.getByLabel('Email').fill(RECRUITER_EMAIL);
  await page.getByLabel('Password').fill(RECRUITER_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('link', { name: 'Question Bank' }).click();
  await page.getByRole('link', { name: 'New question' }).click();
  await page.getByLabel('Question text').fill(questionText);
  await page.getByLabel('Marks', { exact: true }).fill('5');
  const optionInputs = page.getByLabel(/Option \d text/);
  await optionInputs.nth(0).fill('4');
  await optionInputs.nth(1).fill('5');
  await page.getByRole('radio', { name: 'Option 1 correct' }).click();
  await page.getByRole('button', { name: 'Create question' }).click();
  await expect(page).toHaveURL(/\/questions$/);

  await page.getByRole('link', { name: 'Exams' }).click();
  await page.getByRole('link', { name: 'New exam' }).click();
  const examTitle = `Panel Path Exam ${Date.now()}`;
  await page.getByLabel('Title').fill(examTitle);
  await page.getByRole('button', { name: 'Create exam' }).click();
  await expect(page).toHaveURL(/\/exams\/.+\/edit$/);

  await page.getByRole('tab', { name: 'Sections & Questions' }).click();
  await page.getByLabel('New section title').fill('Section One');
  await page.getByRole('button', { name: 'Add section' }).click();
  await expect(page.getByText('Section One')).toBeVisible();
  await page.getByRole('button', { name: 'Manage questions' }).click();
  await page.getByRole('checkbox', { name: /Panel path: 2 \+ 2\?/ }).first().click();
  await page.getByRole('button', { name: 'Save questions' }).click();

  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page).toHaveURL(/\/exams$/);

  await page.getByRole('link', { name: 'Candidates' }).click();
  const stamp = Date.now();
  const candidateAName = 'Panel Path Candidate One';
  const candidateAEmail = `panel-path-a-${stamp}@example.com`;
  const candidateBName = 'Panel Path Candidate Two';
  const candidateBEmail = `panel-path-b-${stamp}@example.com`;

  const tokenA = await inviteCandidate(page, candidateAName, candidateAEmail, examTitle);
  const tokenB = await inviteCandidate(page, candidateBName, candidateBEmail, examTitle);

  // Candidates: redeem invitations and settle attempts so the panel has real results to view
  await settleAttempt(page, tokenA, examTitle, questionText);
  await settleAttempt(page, tokenB, examTitle, questionText);

  // Panel: log in, view results, open a candidate, compare, export
  await page.goto('/login');
  await page.getByLabel('Organization slug').fill(ORG_SLUG);
  await page.getByLabel('Email').fill(PANEL_EMAIL);
  await page.getByLabel('Password').fill(PANEL_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/reports$/);

  await page.getByRole('link', { name: examTitle }).click();
  await expect(page).toHaveURL(/\/reports\/.+$/);
  await expect(page.getByText('Question accuracy')).toBeVisible();
  await expect(page.getByRole('link', { name: candidateAName })).toBeVisible();
  await expect(page.getByRole('link', { name: candidateBName })).toBeVisible();

  await page.getByRole('link', { name: candidateAName }).click();
  await expect(page.getByText('AI Insight')).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/reports\/[^/]+$/);
  await page.getByRole('checkbox', { name: `Select ${candidateAName}` }).click();
  await page.getByRole('checkbox', { name: `Select ${candidateBName}` }).click();
  await page.getByRole('button', { name: 'Compare selected' }).click();

  await expect(page).toHaveURL(/\/compare\?candidateIds=/);
  await expect(page.getByRole('heading', { name: 'Compare candidates' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: candidateAName })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: candidateBName })).toBeVisible();
  await expect(page.getByText('Overall score')).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/reports\/[^/]+$/);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  await downloadPromise;
});
