import { expect, test, type APIRequestContext } from '@playwright/test';
import { signIn } from './fixtures/sign-in';

// Recruitment batch AT5 on the seeded demo: the older job page redirects to the YukthiX job workspace; a card moves on
// the board; a rejection waits and is undone; an interview is scheduled with two panellists and the job's scorecard.
// Needs the API and web against a seeded database (NEXT_PUBLIC_API_BASE, WEB_BASE_URL).

const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4401/api/v1';
const tag = Date.now().toString(36);
const day = new Date(Date.now() + 3 * 86_400_000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

async function login(request: APIRequestContext) {
  const r = await request.post(`${API}/auth/staff/login`, { data: { organizationSlug: 'demo-org', email: 'admin@demo-org.test', password: 'DevAdmin123!' } });
  expect(r.ok()).toBe(true);
  return { Authorization: `Bearer ${(await r.json()).accessToken}` };
}

test('job workspace: board move, rejection undo, interview with two panellists', async ({ page, request }) => {
  test.setTimeout(240_000);
  const headers = await login(request);
  const job = await (await request.post(`${API}/jobs`, { headers, data: { title: `Line Supervisor ${tag}` } })).json();
  const entry = await (await request.post(`${API}/jobs/${job.id}/entries`, { headers, data: { newCandidate: { name: `Ravi ${tag}`, email: `ravi-${tag}@example.test` } } })).json();
  // Weights are percentages that add up to 100.
  const made = await request.post(`${API}/hiring/scorecard-templates`, { headers, data: { name: `Supervisor ${tag}`, scaleMax: 4, passBar: 2.5, items: [{ label: 'Shift planning', weight: 60 }, { label: 'Safety', weight: 40 }] } });
  expect(made.ok()).toBe(true);
  const tpl = await made.json();
  expect((await request.put(`${API}/hiring/jobs/${job.id}/scorecard`, { headers, data: { templateId: tpl.id } })).ok()).toBe(true);
  const stageOf = async () => {
    const b = await (await request.get(`${API}/hiring/jobs/${job.id}/board`, { headers })).json();
    const row = Object.values(b.columns as Record<string, { entryId: string; stageId: string }[]>).flat().find((r) => r.entryId === entry.id)!;
    return (b.pipeline.stages as { id: string; name: string }[]).find((s) => s.id === row.stageId)!.name;
  };
  const firstStage = await stageOf();

  await signIn(page, 'admin@demo-org.test', 'DevAdmin123!');
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));
  await page.goto(`/v2/jobs/${job.id}`);
  await page.waitForURL(new RegExp(`/yx/hiring/jobs/${job.id}$`), { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: `Line Supervisor ${tag}`, level: 1 })).toBeVisible({ timeout: 30_000 });

  // The pipeline board of the job.
  await page.goto(`/yx/hiring/jobs/${job.id}/pipeline`);
  const board = page.getByRole('region', { name: `Hiring pipeline, Line Supervisor ${tag}` });
  await expect(board).toBeVisible({ timeout: 30_000 });

  // Move with the card's "Move to" menu (the keyboard path of the board's drag and drop).
  await board.getByRole('button', { name: `Move Ravi ${tag}` }).click();
  const target = page.getByRole('menuitem').filter({ hasNotText: /Rejected|Hired/ }).first();
  const targetName = (await target.textContent())!.trim();
  await target.click();
  await expect.poll(stageOf, { timeout: 30_000 }).toBe(targetName);
  expect(targetName).not.toBe(firstStage);
  await expect(board.getByRole('region', { name: targetName }).getByRole('article', { name: `Ravi ${tag}` })).toBeVisible({ timeout: 30_000 });

  // Reject from the open application, then undo before the message goes.
  await board.getByRole('button', { name: `Ravi ${tag}`, exact: true }).click();
  const app = page.getByRole('dialog', { name: `Ravi ${tag}` });
  await app.getByRole('button', { name: 'Reject', exact: true }).click();
  const d = page.getByRole('dialog', { name: 'Reject this candidate?' });
  await expect(d).toContainText('you can undo the rejection');
  await d.getByRole('textbox', { name: /^Reason/ }).fill('Shift timing does not suit');
  await d.getByRole('textbox', { name: /^Subject/ }).fill('Your application');
  await d.getByRole('textbox', { name: /^Message/ }).fill('Thank you for your time.');
  await d.getByRole('button', { name: 'Reject', exact: true }).click();
  const waiting = app.getByRole('status').filter({ hasText: /The message goes at/ });
  await expect(waiting).toBeVisible({ timeout: 30_000 });
  await waiting.getByRole('button', { name: 'Undo rejection' }).click();
  await expect(app.getByRole('status').filter({ hasText: /The message goes at/ })).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(stageOf, { timeout: 30_000 }).toBe(targetName);

  // Schedule an interview with two panellists; the job's scorecard is preselected.
  await app.getByRole('button', { name: 'Close' }).first().click();
  await page.getByRole('button', { name: 'Schedule interview' }).click();
  const s = page.getByRole('dialog', { name: `Schedule an interview · Line Supervisor ${tag}` });
  await s.getByLabel('Option 1 date').fill(day);
  await s.getByLabel('Option 1 date').press('Tab');
  await s.getByLabel('Option 1 from (IST)').fill('10:00');
  await s.getByLabel('Option 1 from (IST)').press('Tab');
  await s.getByLabel('Option 1 to (IST)').fill('11:00');
  await s.getByLabel('Option 1 to (IST)').press('Tab');
  await s.getByRole('combobox', { name: 'Panel' }).click();
  await page.getByRole('option').nth(0).click();
  await page.getByRole('option').nth(1).click();
  await page.keyboard.press('Escape');
  await s.getByLabel(/^Where/).fill('Video call');
  await expect(s.getByRole('combobox', { name: 'Scorecard' })).toContainText(`Supervisor ${tag}`);
  await s.getByRole('button', { name: 'Schedule' }).click();
  await expect(page.getByText('Interview scheduled').first()).toBeVisible({ timeout: 30_000 });
  const ivs = await (await request.get(`${API}/candidates/${entry.candidateId}/interviews`, { headers })).json();
  expect(ivs[0].panelists).toHaveLength(2);
  expect(ivs[0].scorecardTemplateId).toBe(tpl.id);
});
