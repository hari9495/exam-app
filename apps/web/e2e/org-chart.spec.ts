import { expect, test, type Page } from '@playwright/test';
import { signIn } from './fixtures/sign-in';

// PPL-02 on the seeded demo (founder 21 Oct 2026): HR always has the Position view, with a clear empty message on a
// past date; the canvas fills the room left on the page, shrinking for the "as on" notice and growing back after it,
// at any window size, with no page scroll.
const room = (page: Page) =>
  page.evaluate(() => {
    const main = document.querySelector('main')!;
    const vp = document.querySelector('.yx-org__viewport')!;
    const kids = Array.from(main.children).filter((c) => !/fixed|absolute/.test(getComputedStyle(c).position));
    const bottom = Math.max(...kids.map((c) => c.getBoundingClientRect().bottom)) + main.scrollTop + parseFloat(getComputedStyle(main).paddingBottom);
    return { canvas: Math.round(vp.getBoundingClientRect().height), spare: Math.round(main.getBoundingClientRect().top + main.clientHeight - bottom), scrolls: main.scrollHeight > main.clientHeight + 1 };
  });
const settled = async (page: Page) => {
  await page.waitForTimeout(600);
  return room(page);
};

test('HR: Position view with today’s openings, empty on a past date; the canvas fills the page as it resizes', async ({ page }) => {
  await page.setViewportSize({ width: 1278, height: 635 });
  await signIn(page, 'hr@demo-org.test', 'Passw0rd!2026');
  await page.goto('/yx/people/org-chart');
  const position = page.getByRole('group', { name: 'Chart view' }).getByRole('button', { name: 'Position' });
  await expect(position).toBeVisible({ timeout: 30_000 });
  await position.click();
  // The CI seed has no job openings (the demo recruiter data has two): either way the view says what is open.
  await expect(page.getByText(/^Vacant position \(\d+\)$/).or(page.getByText('No open positions', { exact: true }))).toBeVisible();

  // Full size first, then the page at 150 % (1278 x 635): the canvas takes the room left, no page scroll.
  for (const size of [{ width: 1918, height: 910 }, { width: 1278, height: 635 }]) {
    await page.setViewportSize(size);
    const r = await settled(page);
    expect(r.scrolls, `page scrolls at ${size.width}x${size.height}`).toBe(false);
    expect(Math.abs(r.spare), `empty room below the chart at ${size.width}x${size.height}`).toBeLessThan(8);
  }
  const today = (await room(page)).canvas;

  // A past date: the notice takes room, the Position switch stays and says why it is empty.
  await page.getByLabel('View as on').fill('01 Jul 2026');
  await page.getByLabel('View as on').press('Tab');
  await expect(page.getByText(/^Showing the org as on 1 Jul 2026./)).toBeVisible();
  await expect(position).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'No open positions on this date' })).toBeVisible();
  const withNotice = await settled(page);
  expect(withNotice.scrolls).toBe(false);
  expect(withNotice.canvas).toBeLessThan(today);

  // Resize down and up with the notice: the canvas follows the window both ways.
  await page.setViewportSize({ width: 1918, height: 910 });
  const big = await settled(page);
  expect(big.scrolls).toBe(false);
  expect(Math.abs(big.spare)).toBeLessThan(8);
  expect(big.canvas).toBeGreaterThan(withNotice.canvas + 200);
  await page.setViewportSize({ width: 1278, height: 635 });
  const small = await settled(page);
  expect(small.scrolls).toBe(false);
  expect(Math.abs(small.canvas - withNotice.canvas)).toBeLessThan(8);

  // Back to today: the notice goes and the canvas grows back.
  await page.getByRole('button', { name: 'Back to today' }).click();
  await expect(page.getByText(/^Showing the org as on/)).toHaveCount(0);
  const after = await settled(page);
  expect(after.scrolls).toBe(false);
  expect(Math.abs(after.canvas - today)).toBeLessThan(8);
});
