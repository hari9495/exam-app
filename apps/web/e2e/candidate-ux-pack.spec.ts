import { test, expect } from '@playwright/test';

const ORG_SLUG = process.env.E2E_ORG_SLUG ?? 'demo-org';
const RECRUITER_EMAIL = process.env.E2E_RECRUITER_EMAIL ?? 'recruiter@demo-org.test';
const RECRUITER_PASSWORD = process.env.E2E_RECRUITER_PASSWORD ?? 'Passw0rd!2026';

async function mockCameraAndDisableWebcamMonitor(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => undefined }] }) },
      configurable: true,
    });
    (window as unknown as { __DISABLE_WEBCAM_MONITOR__?: boolean }).__DISABLE_WEBCAM_MONITOR__ = true;
  });
}

test('a candidate with a +50% accommodation gets more remaining time than the exam duration, and sees a section breakdown after submitting', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Organization slug').fill(ORG_SLUG);
  await page.getByLabel('Email').fill(RECRUITER_EMAIL);
  await page.getByLabel('Password').fill(RECRUITER_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('link', { name: 'Question Bank' }).click();
  await page.getByRole('link', { name: 'New question' }).click();
  await page.getByLabel('Question text').fill('UX pack e2e question?');
  await page.getByLabel('Marks', { exact: true }).fill('10');
  const optionInputs = page.getByLabel(/Option \d text/);
  await optionInputs.nth(0).fill('Correct');
  await optionInputs.nth(1).fill('Wrong');
  await page.getByRole('radio', { name: 'Option 1 correct' }).click();
  await page.getByRole('button', { name: 'Create question' }).click();
  await expect(page).toHaveURL(/\/questions$/);

  await page.getByRole('link', { name: 'Exams' }).click();
  await page.getByRole('link', { name: 'New exam' }).click();
  const examTitle = `UX Pack Exam ${Date.now()}`;
  await page.getByLabel('Title').fill(examTitle);
  await page.getByRole('button', { name: 'Create exam' }).click();
  await expect(page).toHaveURL(/\/exams\/.+\/edit$/);

  await page.getByRole('combobox', { name: /candidate feedback/i }).click();
  await page.getByRole('option', { name: /per-section breakdown/i }).click();
  await page.getByRole('button', { name: 'Save details' }).click();

  await page.getByRole('tab', { name: 'Sections & Questions' }).click();
  await page.getByLabel('New section title').fill('Section One');
  await page.getByRole('button', { name: 'Add section' }).click();
  await page.getByRole('button', { name: 'Manage questions' }).click();
  await page.getByRole('checkbox', { name: /UX pack e2e question\?/ }).first().click();
  await page.getByRole('button', { name: 'Save questions' }).click();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page).toHaveURL(/\/exams$/);

  await page.goto(`/exams`);
  await page.locator('.group', { hasText: examTitle }).getByRole('link', { name: 'Edit' }).click();
  await page.getByRole('link', { name: 'Candidates' }).click();
  const candidateEmail = `ux-pack-${Date.now()}@example.com`;
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('UX Pack Person');
  await page.getByLabel('Email').fill(candidateEmail);
  await page.getByRole('button', { name: 'Add candidate' }).click();
  await expect(page.getByText(candidateEmail)).toBeVisible();

  await page.getByLabel('Exam to invite to').click();
  await page.getByRole('option', { name: examTitle, exact: true }).click();
  await page.locator('.group', { hasText: candidateEmail }).getByRole('checkbox', { name: 'UX Pack Person' }).click();
  const [inviteResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/invitations') && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Send invitations' }).click(),
  ]);
  const inviteBody = await inviteResponse.json();
  const token: string = inviteBody.created[0].token;

  await page.goto('/exams');
  await page.locator('.group', { hasText: examTitle }).getByRole('link', { name: 'Edit' }).click();
  await page.getByRole('tab', { name: 'Candidates' }).click();
  await page.getByRole('spinbutton', { name: /extra time.*ux pack person/i }).fill('50');
  await page.getByRole('button', { name: /save/i }).click();
  await expect(page.getByRole('spinbutton', { name: /extra time.*ux pack person/i })).toHaveValue('50');

  await mockCameraAndDisableWebcamMonitor(page);
  await page.goto(`/start?token=${token}`);
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByRole('button', { name: /skip practice/i }).click();
  await expect(page.getByText('Section One')).toBeVisible();
  await page.getByRole('button', { name: 'Enable camera' }).click();
  await page.getByRole('checkbox', { name: /i understand and consent to monitoring/i }).click();
  // Set up the response listener before the click that triggers /exam's initial fetch -- attaching
  // it after navigating risks missing the response if it resolves before the listener is registered.
  const currentResponsePromise = page.waitForResponse((response) => response.url().includes('/attempt/current'));
  await page.getByRole('button', { name: 'Start exam' }).click();
  await expect(page).toHaveURL(/\/exam$/);

  const currentResponse = await currentResponsePromise;
  const currentBody = await currentResponse.json();
  // The exam's raw duration is whatever the builder default is (60 min = 3600s); with +50%
  // accommodation the candidate should never see less than the raw duration's worth of time.
  expect(currentBody.remainingSeconds).toBeGreaterThan(3600);

  await page.getByRole('button', { name: /Correct/ }).click();
  await page.getByRole('button', { name: 'Review & Submit' }).first().click();
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page).toHaveURL(/\/submitted$/);
  await expect(page.getByText('Exam submitted').first()).toBeVisible();
  await expect(page.getByText('Section One')).toBeVisible();
  await expect(page.getByText('10/10')).toBeVisible();
});
