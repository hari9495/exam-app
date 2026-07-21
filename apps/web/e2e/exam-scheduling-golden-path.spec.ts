import { test, expect } from '@playwright/test';

const ORG_SLUG = process.env.E2E_ORG_SLUG ?? 'demo-org';
const RECRUITER_EMAIL = process.env.E2E_RECRUITER_EMAIL ?? 'recruiter@demo-org.test';
const RECRUITER_PASSWORD = process.env.E2E_RECRUITER_PASSWORD ?? 'Passw0rd!2026';

test('candidate is blocked before the window opens and can start once the recruiter opens it', async ({ page, browser }) => {
  test.setTimeout(120_000); // includes a deliberate 31s wait for the 30s attempt-preview poll interval
  await page.goto('/login');
  await page.getByLabel('Organization slug').fill(ORG_SLUG);
  await page.getByLabel('Email').fill(RECRUITER_EMAIL);
  await page.getByLabel('Password').fill(RECRUITER_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('link', { name: 'Question Bank' }).click();
  await page.getByRole('link', { name: 'New question' }).click();
  await page.getByLabel('Question text').fill('What is 2 + 2?');
  await page.getByLabel('Marks', { exact: true }).fill('10');
  const optionInputs = page.getByLabel(/Option \d text/);
  await optionInputs.nth(0).fill('4');
  await page.getByRole('radio', { name: 'Option 1 correct' }).click();
  await optionInputs.nth(1).fill('5');
  await page.getByRole('button', { name: 'Create question' }).click();
  await expect(page).toHaveURL(/\/questions$/);

  await page.getByRole('link', { name: 'Exams' }).click();
  await page.getByRole('link', { name: 'New exam' }).click();
  const examTitle = `Scheduling Golden Path Exam ${Date.now()}`;
  await page.getByLabel('Title').fill(examTitle);
  await page.getByLabel('Enable scheduling').click();
  const inOneMinute = new Date(Date.now() + 60 * 1000);
  const inOneHour = new Date(Date.now() + 60 * 60 * 1000);
  await page.getByLabel('Window opens').fill(toLocalInputValue(inOneMinute));
  await page.getByLabel('Window closes').fill(toLocalInputValue(inOneHour));
  await page.getByRole('button', { name: 'Create exam' }).click();
  await expect(page).toHaveURL(/\/exams\/.+\/edit$/);

  await page.getByRole('tab', { name: 'Sections & Questions' }).click();
  await page.getByLabel('New section title').fill('Section One');
  await page.getByRole('button', { name: 'Add section' }).click();
  await page.getByRole('button', { name: 'Manage questions' }).click();
  await page.getByRole('checkbox', { name: /What is 2 \+ 2\?/ }).first().click();
  await page.getByRole('button', { name: 'Save questions' }).click();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page).toHaveURL(/\/exams$/);

  await page.getByRole('link', { name: 'Candidates' }).click();
  const candidateEmail = `scheduling-golden-path-${Date.now()}@example.com`;
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Scheduling Candidate');
  await page.getByLabel('Email').fill(candidateEmail);
  await page.getByRole('button', { name: 'Add candidate' }).click();
  await expect(page.getByText(candidateEmail)).toBeVisible();

  await page.getByLabel('Exam to invite to').click();
  await page.getByRole('option', { name: examTitle, exact: true }).click();
  await page.locator('.group', { hasText: candidateEmail }).getByRole('checkbox', { name: 'Scheduling Candidate' }).click();
  const invitePromise = page.waitForResponse((response) => response.url().includes('/invitations') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Send invitations' }).click();
  const inviteResponse = await invitePromise;
  const inviteToken: string = (await inviteResponse.json()).created[0].token;

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
  await expect(candidatePage).toHaveURL(/\/welcome/);
  await expect(candidatePage.getByText(/opens on/i)).toBeVisible();
  await expect(candidatePage.getByRole('button', { name: 'Start exam' })).not.toBeVisible();

  await page.getByRole('link', { name: 'Exams' }).click();
  await page.locator('.group', { hasText: examTitle }).getByRole('link', { name: 'Edit' }).click();
  await page.getByLabel('Window opens').fill(toLocalInputValue(new Date(Date.now() - 60 * 1000)));
  await page.getByRole('button', { name: 'Save details' }).click();

  await candidatePage.waitForTimeout(31_000);
  await candidatePage.reload();
  await expect(candidatePage.getByRole('button', { name: 'Enable camera' })).toBeVisible({ timeout: 10_000 });
  await candidatePage.getByRole('button', { name: 'Enable camera' }).click();
  await candidatePage.getByRole('button', { name: 'Start exam' }).click();
  await expect(candidatePage).toHaveURL(/\/exam/);

  await candidateContext.close();
});

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
