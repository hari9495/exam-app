import { test, expect } from '@playwright/test';
import path from 'path';

const ORG_SLUG = process.env.E2E_ORG_SLUG ?? 'demo-org';
const RECRUITER_EMAIL = process.env.E2E_RECRUITER_EMAIL ?? 'recruiter@demo-org.test';
const RECRUITER_PASSWORD = process.env.E2E_RECRUITER_PASSWORD ?? 'Passw0rd!2026';

test('recruiter creates an exam, adds a section and question, publishes, adds a candidate, and invites them', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Organization slug').fill(ORG_SLUG);
  await page.getByLabel('Email').fill(RECRUITER_EMAIL);
  await page.getByLabel('Password').fill(RECRUITER_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('link', { name: 'Question Bank' }).click();
  await page.getByRole('link', { name: 'New question' }).click();
  await page.getByLabel('Question text').fill('What is 2 + 2?');
  await page.getByLabel('Marks', { exact: true }).fill('5');
  const optionInputs = page.getByLabel(/Option \d text/);
  await optionInputs.nth(0).fill('4');
  await optionInputs.nth(1).fill('5');
  await page.getByRole('radio', { name: 'Option 1 correct' }).click();
  await page.getByRole('button', { name: 'Create question' }).click();
  await expect(page).toHaveURL(/\/questions$/);
  await expect(page.getByText('What is 2 + 2?').first()).toBeVisible();

  await page.getByRole('link', { name: 'Bulk upload' }).click();
  await expect(page).toHaveURL(/\/questions\/bulk-upload$/);
  await page.getByLabel(/Question file/).setInputFiles(path.join(__dirname, 'fixtures', 'bulk-questions.csv'));
  await page.getByRole('button', { name: 'Upload' }).click();
  await expect(page.getByText('2 question(s) created.').first()).toBeVisible();

  await page.getByRole('link', { name: 'Question Bank' }).click();
  await expect(page.getByText('Bulk Upload True/False: the sky is blue').first()).toBeVisible();

  await page.getByRole('link', { name: 'Exams' }).click();
  await page.getByRole('link', { name: 'New exam' }).click();
  const examTitle = `Golden Path Exam ${Date.now()}`;
  await page.getByLabel('Title').fill(examTitle);
  await page.getByRole('button', { name: 'Create exam' }).click();
  await expect(page).toHaveURL(/\/exams\/.+\/edit$/);

  await page.getByRole('tab', { name: 'Sections & Questions' }).click();
  await page.getByLabel('New section title').fill('Section One');
  await page.getByRole('button', { name: 'Add section' }).click();
  await expect(page.getByText('Section One')).toBeVisible();
  await page.getByRole('button', { name: 'Manage questions' }).click();
  await page.getByRole('checkbox', { name: /What is 2 \+ 2\?/ }).first().click();
  await page.getByRole('button', { name: 'Save questions' }).click();

  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page).toHaveURL(/\/exams$/);

  await page.locator('.group', { hasText: examTitle }).getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect(page).toHaveURL(/\/exams\/.+\/edit$/);
  await expect(page.getByLabel('Title')).toHaveValue(`${examTitle} (Copy)`);

  await page.getByRole('link', { name: 'Exams' }).click();
  await expect(page).toHaveURL(/\/exams$/);
  await expect(page.locator('.group', { hasText: `${examTitle} (Copy)` }).getByText('Draft')).toBeVisible();

  await page.getByRole('link', { name: 'Candidates' }).click();
  const candidateEmail = `golden-${Date.now()}@example.com`;
  await page.getByLabel('Name').fill('Golden Path Candidate');
  await page.getByLabel('Email').fill(candidateEmail);
  await page.getByRole('button', { name: 'Add candidate' }).click();
  await expect(page.getByText(candidateEmail)).toBeVisible();

  await page.getByLabel('Exam to invite to').click();
  await page.getByRole('option', { name: examTitle, exact: true }).click();
  await page.locator('.group', { hasText: candidateEmail }).getByRole('checkbox', { name: 'Golden Path Candidate' }).click();
  await page.getByRole('button', { name: 'Send invitations' }).click();
  await expect(page.getByText(/Invited 1 candidate/).first()).toBeVisible();

  await page.getByRole('link', { name: 'Bulk upload & invite' }).click();
  await expect(page).toHaveURL(/\/candidates\/bulk-upload-invite$/);
  await page.getByLabel('Exam to invite to').click();
  await page.getByRole('option', { name: examTitle, exact: true }).click();
  await page.getByLabel(/Candidate file/).setInputFiles(path.join(__dirname, 'fixtures', 'bulk-candidates.csv'));
  await page.getByRole('button', { name: 'Upload & invite' }).click();
  await expect(page.getByText('1 candidate(s) invited.')).toBeVisible();
});
