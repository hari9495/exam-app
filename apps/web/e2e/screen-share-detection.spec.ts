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
