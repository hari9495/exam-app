import { expect, type Page } from '@playwright/test';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 2026-04-01 → "1 Apr 2026", as the date fields take it. */
export const shown = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/** Copies the YukthiX performance starters once (the review templates the cycles use). */
export async function useStarters(admin: Page) {
  await admin.goto('/yx/settings/performance');
  const starters = admin.getByRole('button', { name: 'Use the starters' });
  await expect(starters.or(admin.getByRole('tab', { name: 'Review templates' })).first()).toBeVisible({ timeout: 30_000 });
  if (await starters.isVisible()) await starters.click();
  await expect(admin.getByRole('tab', { name: 'Review templates' })).toBeVisible({ timeout: 30_000 });
}

/**
 * PRF-04: sets up and launches an annual cycle for Production in the set-up wizard (5df0b91b3 replaced the New cycle
 * dialog). Returns the cycle's control-room address.
 */
export async function launchCycle(admin: Page, o: { name: string; managerDue: string; selfDue?: string | null; peer?: { min: number; max: number; due: string }; calibration?: { session: string; facilitator: string } }) {
  await admin.goto('/yx/performance/cycles/new');
  const setup = admin.locator('main').last();
  const day = async (label: string, iso: string) => {
    await setup.getByRole('textbox', { name: label }).fill(shown(iso));
    await setup.getByRole('textbox', { name: label }).press('Enter');
  };
  await setup.getByRole('textbox', { name: /Cycle name/ }).fill(o.name);
  await setup.getByRole('combobox', { name: 'Type' }).click();
  await admin.getByRole('option', { name: 'Annual', exact: true }).click();
  await day('Period starts', '2025-04-01');
  await day('Period ends', '2026-03-31');
  await setup.getByRole('button', { name: 'Continue' }).click();
  await setup.getByRole('combobox', { name: 'Departments in the cycle' }).click();
  await admin.getByRole('option', { name: /Production/ }).first().click();
  await admin.keyboard.press('Escape');
  await setup.getByRole('button', { name: 'Continue' }).click();
  await setup.getByRole('combobox', { name: 'Template' }).click();
  await admin.getByRole('option', { name: /^Annual review/ }).first().click();
  await setup.getByRole('button', { name: 'Continue' }).click();
  if (o.selfDue === null) await setup.getByRole('checkbox', { name: 'Include Self review' }).click();
  else await day('Self review due', o.selfDue ?? o.managerDue);
  await day('Manager review due', o.managerDue);
  if (o.peer) {
    await setup.getByRole('checkbox', { name: 'Include 360° feedback' }).click();
    await day('360° feedback due', o.peer.due);
    await setup.getByRole('textbox', { name: '360° reviewers, minimum' }).fill(String(o.peer.min));
    await setup.getByRole('textbox', { name: '360° reviewers, maximum' }).fill(String(o.peer.max));
  }
  if (o.calibration) {
    await setup.getByRole('checkbox', { name: 'Include Calibration' }).click();
    await setup.getByRole('button', { name: 'Add session' }).click();
    const add = admin.getByRole('dialog', { name: 'Add a calibration session' });
    await add.getByRole('textbox', { name: /Session name/ }).fill(o.calibration.session);
    await add.getByRole('combobox', { name: 'Facilitator' }).click();
    await admin.getByRole('option', { name: o.calibration.facilitator }).click();
    await add.getByRole('button', { name: 'Add session' }).click();
    await expect(add).toHaveCount(0);
  }
  await setup.getByRole('button', { name: 'Continue' }).click();
  await setup.getByRole('button', { name: 'Launch cycle' }).click();
  await admin.waitForURL(/\/yx\/performance\/cycles\/[0-9a-f-]+$/, { timeout: 30_000 });
  await expect(admin.getByRole('heading', { name: o.name, level: 1 })).toBeVisible({ timeout: 30_000 });
  return admin.url();
}

/** A manager's review of one report, opened from their Performance home ('Needs your action'). */
export async function openManagerReview(manager: Page, cycle: string, person: string) {
  await manager.goto('/yx/performance');
  await manager.getByRole('listitem').filter({ hasText: person }).getByRole('link', { name: `Review: Manager review · ${cycle}` }).click();
  await expect(manager.locator('main').last().getByRole('button', { name: 'Complete manager review' })).toBeVisible({ timeout: 30_000 });
  return manager.locator('main').last();
}
