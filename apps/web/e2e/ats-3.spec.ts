import { expect, test, type APIRequestContext } from '@playwright/test';
import { signIn } from './fixtures/sign-in';

// Recruitment batch AT3 on the seeded demo: the older careers, consent and job-board settings redirect to YukthiX
// Hiring; a privacy notice version is published; a listed job has a readable URL with Google for Jobs data, is in the
// sitemap, and its apply form asks for each consent purpose. (Submitting is covered by the API e2e: no blob store here.)
// Needs the API and web against a seeded database (NEXT_PUBLIC_API_BASE, WEB_BASE_URL).

const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4401/api/v1';
const tag = Date.now().toString(36);

async function login(request: APIRequestContext) {
  const r = await request.post(`${API}/auth/staff/login`, { data: { organizationSlug: 'demo-org', email: 'admin@demo-org.test', password: 'DevAdmin123!' } });
  expect(r.ok()).toBe(true);
  return { Authorization: `Bearer ${(await r.json()).accessToken}` };
}

test('careers site, consent versions and job boards on YukthiX Hiring', async ({ browser, request }) => {
  test.setTimeout(240_000);
  const headers = await login(request);
  const job = await (await request.post(`${API}/jobs`, { headers, data: { title: `Line Cook ${tag}`, location: 'Mysuru', description: 'Prepare <b>meals</b> for the canteen.' } })).json();
  expect(job.slug).toMatch(/^line-cook-/);
  expect((await request.patch(`${API}/jobs/${job.id}`, { headers, data: { publicApplyEnabled: true, listOnCareers: true } })).ok()).toBe(true);

  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, 'admin@demo-org.test', 'DevAdmin123!');
  await admin.waitForURL((url) => !url.pathname.includes('sign-in'));

  await admin.goto('/v2/settings/careers');
  await admin.waitForURL(/\/yx\/hiring\/careers$/, { timeout: 30_000 });
  // The careers page builder: publishing it puts the site live.
  await expect(admin.getByRole('heading', { name: 'Careers page', level: 1 })).toBeVisible({ timeout: 30_000 });
  await admin.getByRole('button', { name: 'Publish', exact: true }).click();
  // The page status beside the heading turns from Draft to Published.
  await expect(admin.getByRole('main').getByText('Draft', { exact: true })).toHaveCount(0, { timeout: 30_000 });
  await expect(admin.getByRole('main').getByText('Published', { exact: true }).first()).toBeVisible();

  const notices = admin.getByRole('region', { name: 'Privacy notices' });
  await notices.getByRole('button', { name: /^Publish (notice|a new version): applying for a job$/ }).click();
  const d = admin.getByRole('dialog', { name: /^Publish version \d+: applying for a job$/ });
  await d.getByRole('textbox', { name: /Notice text/ }).fill(`We use your details to consider you for this job (${tag}).`);
  await d.getByRole('button', { name: 'Publish version' }).click();
  await expect(d).toHaveCount(0, { timeout: 30_000 });
  await expect(admin.getByText(`We use your details to consider you for this job (${tag}).`)).toBeVisible();

  await admin.goto('/v2/settings/apply-consent');
  await admin.waitForURL(/\/yx\/hiring\/careers$/, { timeout: 30_000 });
  await admin.goto('/v2/settings/job-boards');
  await admin.waitForURL(/\/yx\/hiring\/job-boards$/, { timeout: 30_000 });
  await expect(admin.getByRole('heading', { name: 'Job boards', level: 1 })).toBeVisible({ timeout: 30_000 });

  // The public side, signed out.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto('/careers/demo-org'); // the older address goes to /yx/careers
  await visitor.waitForURL(/\/yx\/careers\/demo-org$/);
  await visitor.getByRole('list', { name: 'Open jobs' }).getByRole('button', { name: `Apply for Line Cook ${tag}` }).click();
  await visitor.waitForURL(new RegExp(`/yx/careers/demo-org/jobs/${job.slug}$`));
  await expect(visitor.getByText('Prepare <b>meals</b> for the canteen.')).toBeVisible(); // shown as text
  const ld = JSON.parse((await visitor.locator('script[type="application/ld+json"]').textContent())!);
  expect(ld).toMatchObject({ '@type': 'JobPosting', title: `Line Cook ${tag}`, directApply: true });
  expect(ld.url).toMatch(new RegExp(`^https?://.+/careers/demo-org/jobs/${job.slug}$`));
  expect(ld.baseSalary).toBeUndefined();

  const sitemap = await visitor.request.get('/careers/demo-org/sitemap.xml');
  expect(await sitemap.text()).toContain(`/careers/demo-org/jobs/${job.slug}</loc>`);

  // The apply form is on the job page: it asks for the published consent, and refuses to send while it is empty.
  const form = visitor.getByRole('form', { name: `Apply for Line Cook ${tag}` });
  await expect(form.getByText(`We use your details to consider you for this job (${tag}).`)).toBeVisible({ timeout: 30_000 });
  await form.getByRole('button', { name: 'Send application' }).click();
  await expect(form.getByRole('textbox', { name: /Full name/ })).toHaveAttribute('aria-invalid', 'true');
  await expect(form.getByText('Tick the box so we can process your application.')).toBeVisible();
  await expect(form.locator('input[name="website"]')).not.toBeInViewport(); // the honeypot is off-screen for people

  // Closing the job takes it off the site and the sitemap at once.
  expect((await request.patch(`${API}/jobs/${job.id}`, { headers, data: { status: 'closed' } })).ok()).toBe(true);
  expect(await (await visitor.request.get('/careers/demo-org/sitemap.xml')).text()).not.toContain(job.slug);
  await visitor.goto(`/careers/demo-org/jobs/${job.slug}`);
  await expect(visitor.getByText('This job is not taking applications now.')).toBeVisible();
  await expect(visitor.getByRole('form', { name: `Apply for Line Cook ${tag}` })).toHaveCount(0);
});
