import { expect, type Page } from '@playwright/test';

/**
 * Adds a section with one bank question to the exam open in the old editor (/…/exams/<id>/edit), using the designed
 * builder's Sections step and its Questions drawer (answer 2284: the /v2 "Sections & Questions" editor is retired),
 * then comes back to the editor so the walk-through carries on (Publish, candidates).
 * `question` matches the question's text, as the old checkbox step did.
 */
export async function addSectionWithQuestion(page: Page, section: string, question: RegExp): Promise<void> {
  const editUrl = page.url();
  const id = /\/exams\/([^/]+)\/edit/.exec(editUrl)?.[1];
  if (!id) throw new Error(`addSectionWithQuestion: not on an exam editor page (${editUrl})`);
  await page.goto(`/yx/hiring/assessments/tests/${id}`);
  await page.getByRole('button', { name: /^Sections\b/ }).click();
  await page.getByLabel('New section').fill(section);
  await page.getByRole('button', { name: 'Add section' }).click();
  const row = page.getByRole('listitem').filter({ has: page.getByLabel(`Name of ${section}`) });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Questions' }).click();
  const drawer = page.getByRole('dialog', { name: `Questions in ${section}` });
  // The search box takes plain words: the matcher without its regex escapes.
  await drawer.getByLabel('Words in the question').fill(question.source.replace(/\\(.)/g, '$1'));
  await drawer.getByRole('button', { name: 'Search the bank' }).click();
  await drawer.getByRole('button', { name: new RegExp(`^Add: ${question.source}`) }).first().click();
  await drawer.getByRole('button', { name: 'Save 1 question' }).click();
  await expect(drawer).toBeHidden();
  await page.goto(editUrl);
}
