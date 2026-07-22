import { test, expect } from '@playwright/test';

const ORG_SLUG = process.env.E2E_ORG_SLUG ?? 'demo-org';
const RECRUITER_EMAIL = process.env.E2E_RECRUITER_EMAIL ?? 'recruiter@demo-org.test';
const RECRUITER_PASSWORD = process.env.E2E_RECRUITER_PASSWORD ?? 'Passw0rd!2026';

test('candidate is blocked from a disallowed network and can start once the restriction is cleared', async ({ page, browser }) => {
  // Recruiter: create question + exam WITH an IP range that cannot match localhost
  await page.goto('/login');
  await page.getByLabel('Organization slug').fill(ORG_SLUG);
  await page.getByLabel('Email').fill(RECRUITER_EMAIL);
  await page.getByLabel('Password').fill(RECRUITER_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('link', { name: 'Question Bank' }).click();
  await page.getByRole('link', { name: 'New question' }).click();
  await page.getByLabel('Question text').fill('IP path: 2 + 2?');
  await page.getByLabel('Marks', { exact: true }).fill('5');
  const optionInputs = page.getByLabel(/Option \d text/);
  await optionInputs.nth(0).fill('4');
  await optionInputs.nth(1).fill('5');
  await page.getByRole('radio', { name: 'Option 1 correct' }).click();
  await page.getByRole('button', { name: 'Create question' }).click();
  await expect(page).toHaveURL(/\/questions$/);

  await page.getByRole('link', { name: 'Exams' }).click();
  await page.getByRole('link', { name: 'New exam' }).click();
  const examTitle = `IP Restriction Exam ${Date.now()}`;
  await page.getByLabel('Title').fill(examTitle);
  await page.getByLabel(/allowed ip \/ cidr range/i).fill('203.0.113.0/24');
  await page.getByRole('button', { name: 'Create exam' }).click();
  await expect(page).toHaveURL(/\/exams\/.+\/edit$/);

  await page.getByRole('tab', { name: 'Sections & Questions' }).click();
  await page.getByLabel('New section title').fill('Section One');
  await page.getByRole('button', { name: 'Add section' }).click();
  await page.getByRole('button', { name: 'Manage questions' }).click();
  await page.getByRole('checkbox', { name: /IP path: 2 \+ 2\?/ }).first().click();
  await page.getByRole('button', { name: 'Save questions' }).click();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page).toHaveURL(/\/exams$/);

  await page.getByRole('link', { name: 'Candidates' }).click();
  const candidateEmail = `ip-path-${Date.now()}@example.com`;
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('IP Path Candidate');
  await page.getByLabel('Email').fill(candidateEmail);
  await page.getByRole('button', { name: 'Add candidate' }).click();
  await expect(page.getByText(candidateEmail)).toBeVisible();

  await page.getByLabel('Exam to invite to').click();
  await page.getByRole('option', { name: examTitle, exact: true }).click();
  await page.locator('.group', { hasText: candidateEmail }).getByRole('checkbox', { name: 'IP Path Candidate' }).click();
  const invitePromise = page.waitForResponse((r) => r.url().includes('/invitations') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Send invitations' }).click();
  const inviteToken: string = (await (await invitePromise).json()).created[0].token;

  // Candidate: redeem from localhost — blocked with the message (incl. observed IP wording)
  const candidateContext = await browser.newContext();
  const candidatePage = await candidateContext.newPage();
  await candidatePage.goto(`/start?token=${inviteToken}`);
  await expect(candidatePage.getByText(/is not approved for this exam/i)).toBeVisible();

  // Recruiter: clear the restriction
  await page.getByRole('link', { name: 'Exams' }).click();
  await page.locator('.group', { hasText: examTitle }).getByRole('link', { name: 'Edit' }).click();
  await page.getByLabel(/allowed ip \/ cidr range/i).fill('');
  await page.getByRole('button', { name: 'Save details' }).click();

  // Candidate: retry — now proceeds to the welcome page's practice step
  await candidatePage.goto(`/start?token=${inviteToken}`);
  await expect(candidatePage).toHaveURL(/\/welcome$/);
  await candidatePage.getByRole('button', { name: /skip practice/i }).click();
  await expect(candidatePage.getByText(examTitle)).toBeVisible();

  await candidateContext.close();
});
