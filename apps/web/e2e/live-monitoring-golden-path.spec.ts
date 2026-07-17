import { test, expect } from '@playwright/test';

const ORG_SLUG = process.env.E2E_ORG_SLUG ?? 'demo-org';
const RECRUITER_EMAIL = process.env.E2E_RECRUITER_EMAIL ?? 'recruiter@demo-org.test';
const RECRUITER_PASSWORD = process.env.E2E_RECRUITER_PASSWORD ?? 'Passw0rd!2026';

test('recruiter sees a candidate go live on the exam Live tab as they start their attempt', async ({ page, browser }) => {
  // Recruiter: create exam, question, section, publish, invite a candidate
  await page.goto('/login');
  await page.getByLabel('Organization slug').fill(ORG_SLUG);
  await page.getByLabel('Email').fill(RECRUITER_EMAIL);
  await page.getByLabel('Password').fill(RECRUITER_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('link', { name: 'Question Bank' }).click();
  await page.getByRole('link', { name: 'New question' }).click();
  await page.getByLabel('Question text').fill('Live path: 2 + 2?');
  await page.getByLabel('Marks', { exact: true }).fill('5');
  const optionInputs = page.getByLabel(/Option \d text/);
  await optionInputs.nth(0).fill('4');
  await optionInputs.nth(1).fill('5');
  await page.getByRole('radio', { name: 'Option 1 correct' }).click();
  await page.getByRole('button', { name: 'Create question' }).click();
  await expect(page).toHaveURL(/\/questions$/);

  await page.getByRole('link', { name: 'Exams' }).click();
  await page.getByRole('link', { name: 'New exam' }).click();
  const examTitle = `Live Path Exam ${Date.now()}`;
  await page.getByLabel('Title').fill(examTitle);
  await page.getByRole('button', { name: 'Create exam' }).click();
  await expect(page).toHaveURL(/\/exams\/.+\/edit$/);

  await page.getByRole('tab', { name: 'Sections & Questions' }).click();
  await page.getByLabel('New section title').fill('Section One');
  await page.getByRole('button', { name: 'Add section' }).click();
  await page.getByRole('button', { name: 'Manage questions' }).click();
  await page.getByRole('checkbox', { name: /Live path: 2 \+ 2\?/ }).first().click();
  await page.getByRole('button', { name: 'Save questions' }).click();

  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page).toHaveURL(/\/exams$/);

  await page.getByRole('link', { name: 'Candidates' }).click();
  const candidateEmail = `live-path-${Date.now()}@example.com`;
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Live Path Candidate');
  await page.getByLabel('Email').fill(candidateEmail);
  await page.getByRole('button', { name: 'Add candidate' }).click();
  await expect(page.getByText(candidateEmail)).toBeVisible();

  await page.getByLabel('Exam to invite to').click();
  await page.getByRole('option', { name: examTitle, exact: true }).click();
  await page.getByRole('row', { name: candidateEmail }).getByRole('checkbox', { name: 'Live Path Candidate' }).click();

  const [inviteResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/invitations') && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Send invitations' }).click(),
  ]);
  const inviteBody = await inviteResponse.json();
  const inviteToken: string = inviteBody.created[0].token;

  // Recruiter: open the exam's Live tab and wait for the roster to load
  await page.getByRole('link', { name: 'Exams' }).click();
  await page.getByRole('row', { name: examTitle }).getByRole('link', { name: 'Edit' }).click();
  await page.getByRole('tab', { name: 'Live' }).click();
  await expect(page.getByText('Live Path Candidate')).toBeVisible();
  await expect(page.getByRole('row', { name: 'Live Path Candidate' }).getByText('invited')).toBeVisible();

  // Candidate: start the exam in a second, independent browser context
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

  // Recruiter: the roster should flip to in_progress live, without a page reload
  await expect(page.getByText('in_progress')).toBeVisible({ timeout: 15_000 });

  await candidateContext.close();
});

test('recruiter sees the leaderboard update when a candidate answers correctly', async ({ page, browser }) => {
  // Recruiter: create exam, question, section, publish, invite a candidate
  await page.goto('/login');
  await page.getByLabel('Organization slug').fill(ORG_SLUG);
  await page.getByLabel('Email').fill(RECRUITER_EMAIL);
  await page.getByLabel('Password').fill(RECRUITER_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('link', { name: 'Question Bank' }).click();
  await page.getByRole('link', { name: 'New question' }).click();
  await page.getByLabel('Question text').fill('Leaderboard path: 2 + 2?');
  await page.getByLabel('Marks', { exact: true }).fill('5');
  const optionInputs = page.getByLabel(/Option \d text/);
  await optionInputs.nth(0).fill('4');
  await optionInputs.nth(1).fill('5');
  await page.getByRole('radio', { name: 'Option 1 correct' }).click();
  await page.getByRole('button', { name: 'Create question' }).click();
  await expect(page).toHaveURL(/\/questions$/);

  await page.getByRole('link', { name: 'Exams' }).click();
  await page.getByRole('link', { name: 'New exam' }).click();
  const examTitle = `Leaderboard Path Exam ${Date.now()}`;
  await page.getByLabel('Title').fill(examTitle);
  await page.getByRole('button', { name: 'Create exam' }).click();
  await expect(page).toHaveURL(/\/exams\/.+\/edit$/);

  await page.getByRole('tab', { name: 'Sections & Questions' }).click();
  await page.getByLabel('New section title').fill('Section One');
  await page.getByRole('button', { name: 'Add section' }).click();
  await page.getByRole('button', { name: 'Manage questions' }).click();
  await page.getByRole('checkbox', { name: /Leaderboard path: 2 \+ 2\?/ }).first().click();
  await page.getByRole('button', { name: 'Save questions' }).click();

  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page).toHaveURL(/\/exams$/);

  await page.getByRole('link', { name: 'Candidates' }).click();
  const candidateEmail = `leaderboard-path-${Date.now()}@example.com`;
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Leaderboard Path Candidate');
  await page.getByLabel('Email').fill(candidateEmail);
  await page.getByRole('button', { name: 'Add candidate' }).click();
  await expect(page.getByText(candidateEmail)).toBeVisible();

  await page.getByLabel('Exam to invite to').click();
  await page.getByRole('option', { name: examTitle, exact: true }).click();
  await page.getByRole('row', { name: candidateEmail }).getByRole('checkbox', { name: 'Leaderboard Path Candidate' }).click();

  const [inviteResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/invitations') && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Send invitations' }).click(),
  ]);
  const inviteBody = await inviteResponse.json();
  const inviteToken: string = inviteBody.created[0].token;

  // Candidate: redeem the invite and answer the question correctly, in a second, independent browser context
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

  await expect(candidatePage.getByText('Leaderboard path: 2 + 2?')).toBeVisible();
  // This spec's seeded question has options "4"/"5" with Option 1 ("4") marked correct above.
  await candidatePage.getByRole('button', { name: '4', exact: true }).click();
  // Answers are saved via an 800ms-debounced mutation (ANSWER_DEBOUNCE_MS in
  // apps/web/lib/hooks/useAttempt.ts) — give it a moment to fire before switching tabs.
  await candidatePage.waitForTimeout(1_000);

  // Recruiter: open the exam's Leaderboard tab and see the candidate's rank/correct-count update
  await page.getByRole('link', { name: 'Exams' }).click();
  await page.getByRole('row', { name: examTitle }).getByRole('link', { name: 'Edit' }).click();
  await page.getByRole('tab', { name: 'Leaderboard' }).click();
  // Scoped to this candidate's row: the leaderboard <li> renders a rank/name group first,
  // then a sibling <span> holding the correct-count, so "> span" targets only that count
  // (avoids matching the rank number, which is also "1" with a single candidate).
  const leaderboardRow = page.getByRole('listitem').filter({ hasText: 'Leaderboard Path Candidate' });
  await expect(leaderboardRow).toBeVisible({ timeout: 15_000 });
  await expect(leaderboardRow.locator('> span')).toHaveText('1');

  await candidateContext.close();
});
