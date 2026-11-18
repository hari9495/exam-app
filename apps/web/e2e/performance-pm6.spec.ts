import { expect, test, type Browser } from '@playwright/test';
import { launchCycle, openManagerReview, useStarters } from './fixtures/perf';
import { signIn } from './fixtures/sign-in';

// Performance batch PM6 on the seeded Kaveri Foods demo: a manager-only plant cycle; Kavya rates Murugan; the admin
// opens a calibration session and drags Murugan to another band, which asks for a reason; then signs off.
// Each run makes its own cycle, so the test can run again.

const PASSWORD = 'Passw0rd!2026';

async function signedIn(browser: Browser, email: string, password: string) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, email, password);
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));
  return page;
}

test('calibration: drag a person to another band with a reason, then sign off', async ({ browser }) => {
  test.setTimeout(300_000);
  const tag = Date.now().toString(36);
  const day = (n: number) => new Date(Date.now() + 330 * 60_000 + n * 86_400_000).toISOString().slice(0, 10);
  const name = `Plant calibration ${tag}`;

  const admin = await signedIn(browser, 'admin@demo-org.test', 'DevAdmin123!');
  await useStarters(admin);
  // PRF-04: the calibration session is planned in the set-up wizard (211cb8560); finished reviews wait in it.
  const cycleUrl = await launchCycle(admin, { name, selfDue: null, managerDue: day(14), calibration: { session: `Plant ${tag}`, facilitator: 'Ramesh Iyer' } });

  const kv = await signedIn(browser, 'kavya@demo-org.test', PASSWORD);
  const review = await openManagerReview(kv, name, 'Murugan Selvam');
  await review.getByRole('radiogroup', { name: 'Rating for Goals' }).getByRole('radio', { name: /^4 / }).click();
  await review.getByRole('radiogroup', { name: 'Rating for Competencies' }).getByRole('radio', { name: /^4 / }).click();
  for (const box of await review.getByRole('textbox').all()) if (await box.isEditable()) await box.fill('Steady and safe.');
  await review.getByRole('button', { name: 'Complete manager review' }).click();
  await kv.getByRole('dialog').getByRole('button', { name: 'Complete manager review' }).click();
  await expect(review.getByRole('list', { name: 'Review stages' })).toContainText(/Manager review\s*Done/, { timeout: 30_000 });

  await admin.goto(cycleUrl);
  await admin.getByRole('tab', { name: 'Calibration' }).click();
  const session = admin.getByRole('tabpanel', { name: 'Calibration' }).getByRole('listitem').filter({ hasText: `Plant ${tag}` });
  await expect(session).toContainText('Ramesh Iyer · 1 people');
  // Ramesh (the admin) facilitates his own session.
  await session.getByRole('button', { name: 'Open', exact: true }).click();
  await admin.waitForURL(/\/yx\/performance\/calibrations\/[0-9a-f-]+$/, { timeout: 30_000 });
  // The board (PRF-09): Murugan sits in 4 · Exceeds; "Change rating" is the keyboard path of the drag.
  const board = admin.getByRole('tabpanel', { name: 'Ratings board' });
  await expect(board.getByRole('region', { name: '4 · Exceeds: 1 people' })).toContainText('Murugan Selvam', { timeout: 30_000 });
  await board.getByRole('button', { name: 'Change rating for Murugan Selvam' }).click();
  await admin.getByRole('menuitem', { name: '3 · Meets' }).click();
  const dlg = admin.getByRole('dialog', { name: 'Change Murugan Selvam from 4 · Exceeds to 3 · Meets?' });
  // A change needs a reason (at least 10 characters): without one it is refused in place.
  await dlg.getByRole('button', { name: 'Change rating' }).click();
  await expect(dlg.getByText('Enter a reason of at least 10 characters.')).toBeVisible();
  await dlg.getByRole('textbox', { name: /Reason/ }).fill('Compared with the other plant leads');
  await dlg.getByRole('button', { name: 'Change rating' }).click();
  await expect(dlg).toHaveCount(0, { timeout: 30_000 });
  await expect(board.getByRole('region', { name: '3 · Meets: 1 people' })).toContainText('Murugan Selvam', { timeout: 30_000 });
  await admin.getByRole('tab', { name: /^Changes/ }).click();
  await expect(admin.getByRole('cell', { name: 'Compared with the other plant leads' })).toBeVisible({ timeout: 30_000 });
  // Signing off is "Close calibration" on the designed session page (PRF-09).
  await admin.getByRole('button', { name: 'Close calibration' }).click();
  const close = admin.getByRole('dialog');
  await close.getByRole('button').last().click();
  await expect(close).toHaveCount(0, { timeout: 30_000 });
  await expect(admin.getByRole('button', { name: 'Close calibration' })).toHaveCount(0, { timeout: 30_000 });
});
