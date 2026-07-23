import { test, expect } from '@playwright/test';

const ORG_SLUG = process.env.E2E_ORG_SLUG ?? 'demo-org';
const RECRUITER_EMAIL = process.env.E2E_RECRUITER_EMAIL ?? 'recruiter@demo-org.test';
const RECRUITER_PASSWORD = process.env.E2E_RECRUITER_PASSWORD ?? 'Passw0rd!2026';

test('a walk-in candidate registers and starts the exam without an email invite', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Organization slug').fill(ORG_SLUG);
  await page.getByLabel('Email').fill(RECRUITER_EMAIL);
  await page.getByLabel('Password').fill(RECRUITER_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('link', { name: 'Question Bank' }).click();
  await page.getByRole('link', { name: 'New question' }).click();
  await page.getByLabel('Question text').fill('Walk-in test question: 2 + 2?');
  await page.getByLabel('Marks', { exact: true }).fill('5');
  const optionInputs = page.getByLabel(/Option \d text/);
  await optionInputs.nth(0).fill('4');
  await optionInputs.nth(1).fill('5');
  await page.getByRole('radio', { name: 'Option 1 correct' }).click();
  await page.getByRole('button', { name: 'Create question' }).click();
  await expect(page).toHaveURL(/\/questions$/);

  await page.getByRole('link', { name: 'Exams' }).click();
  await page.getByRole('link', { name: 'New exam' }).click();
  const examTitle = `Walk-in E2E Exam ${Date.now()}`;
  await page.getByLabel('Title').fill(examTitle);
  await page.getByRole('button', { name: 'Create exam' }).click();
  await expect(page).toHaveURL(/\/exams\/.+\/edit$/);

  await page.getByLabel('Enable walk-in registration for this exam').click();
  await page.getByRole('button', { name: 'Save details' }).click();

  await page.getByRole('tab', { name: 'Sections & Questions' }).click();
  await page.getByLabel('New section title').fill('Section One');
  await page.getByRole('button', { name: 'Add section' }).click();
  await page.getByRole('button', { name: 'Manage questions' }).click();
  await page.getByRole('checkbox', { name: /Walk-in test question: 2 \+ 2\?/ }).first().click();
  await page.getByRole('button', { name: 'Save questions' }).click();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page).toHaveURL(/\/exams$/);
  await expect(page.getByText('Walk-in').first()).toBeVisible();

  await page.addInitScript(() => {
    // ponytail: real Chromium exposes navigator.mediaDevices as a non-configurable accessor,
    // so plain assignment silently no-ops -- Object.defineProperty is required to override it.
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => undefined }] }) },
      configurable: true,
    });
    (window as unknown as { __DISABLE_WEBCAM_MONITOR__?: boolean }).__DISABLE_WEBCAM_MONITOR__ = true;
  });

  await page.goto(`/walk-in/${ORG_SLUG}`);
  const candidateEmail = `walk-in-${Date.now()}@example.com`;
  await page.getByLabel('Name', { exact: true }).fill('Walk In Person');
  await page.getByLabel('Email').fill(candidateEmail);
  // This org's dev DB accumulates walk-in-enabled exams across e2e runs, so the picker may or
  // may not appear depending on how many are currently enabled -- select this test's exam only
  // when the picker is actually rendered (i.e. more than one walk-in exam exists right now).
  const examSelect = page.getByLabel('Exam', { exact: true });
  if (await examSelect.isVisible().catch(() => false)) {
    await examSelect.click();
    await page.getByRole('option', { name: examTitle, exact: true }).click();
  }
  // The registration form no longer starts the exam in this browser tab -- a QR-scanned
  // registration is often on a phone that can't run the exam UI, so the link is always
  // emailed instead. Capture the register response the same way the emailed link would
  // carry the token, then open it as a separate navigation (standing in for "candidate
  // opens the emailed link on their laptop").
  const [registerResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/public/walk-in/') && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Email me my exam link' }).click(),
  ]);
  await expect(page.getByText(/check your email/i)).toBeVisible();
  const { token } = await registerResponse.json();

  await page.goto(`/start?token=${token}`);
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByRole('button', { name: /skip practice/i }).click();
  await expect(page.getByText(examTitle)).toBeVisible();
  await page.getByRole('button', { name: 'Enable camera' }).click();
  await page.getByRole('checkbox', { name: /i understand and consent to monitoring/i }).click();
  await page.getByRole('button', { name: 'Start exam' }).click();
  await expect(page).toHaveURL(/\/exam$/);
  await expect(page.getByText('Walk-in test question: 2 + 2?')).toBeVisible();
});

test('registering twice with the same email for the same exam resumes rather than duplicates', async ({ page, request }) => {
  await page.goto('/login');
  await page.getByLabel('Organization slug').fill(ORG_SLUG);
  await page.getByLabel('Email').fill(RECRUITER_EMAIL);
  await page.getByLabel('Password').fill(RECRUITER_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('link', { name: 'Exams' }).click();
  await page.getByRole('link', { name: 'New exam' }).click();
  const examTitle = `Walk-in Resume Exam ${Date.now()}`;
  await page.getByLabel('Title').fill(examTitle);
  await page.getByRole('button', { name: 'Create exam' }).click();
  await expect(page).toHaveURL(/\/exams\/.+\/edit$/);
  const examId = page.url().match(/\/exams\/([^/]+)\/edit$/)?.[1];

  await page.getByLabel('Enable walk-in registration for this exam').click();
  await page.getByRole('button', { name: 'Save details' }).click();

  // ponytail: exams.service.ts's publish() rejects exams with no sections/questions
  // (BadRequestException), so this exam needs at least one question before Publish
  // will succeed -- reuse the question the first test in this file already created.
  await page.getByRole('tab', { name: 'Sections & Questions' }).click();
  await page.getByLabel('New section title').fill('Section One');
  await page.getByRole('button', { name: 'Add section' }).click();
  await page.getByRole('button', { name: 'Manage questions' }).click();
  await page.getByRole('checkbox', { name: /Walk-in test question: 2 \+ 2\?/ }).first().click();
  await page.getByRole('button', { name: 'Save questions' }).click();

  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page).toHaveURL(/\/exams$/);

  const email = `resume-${Date.now()}@example.com`;
  const apiBase = process.env.E2E_API_BASE ?? 'http://localhost:3001/api/v1';

  const first = await request.post(`${apiBase}/public/walk-in/${ORG_SLUG}/register`, {
    data: { examId, name: 'Resume Person', email },
  });
  const firstBody = await first.json();

  const second = await request.post(`${apiBase}/public/walk-in/${ORG_SLUG}/register`, {
    data: { examId, name: 'Resume Person', email },
  });
  const secondBody = await second.json();

  expect(secondBody.token).toBe(firstBody.token);
});
