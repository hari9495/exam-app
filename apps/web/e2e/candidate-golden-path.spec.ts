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
  await expect(page.getByText('Exam submitted').first()).toBeVisible();
});
