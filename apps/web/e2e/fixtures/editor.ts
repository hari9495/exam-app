import { expect, type Page } from '@playwright/test';

// The rich-text editor (ProseMirror) mounts again when its tab changes (note ↔ reply), so keys typed straight after a
// click could land in the editor that was just replaced and be lost: then "Send reply" stays disabled. Write into
// the editor on screen and check it holds the text before going on.
export async function writeInEditor(page: Page, text: string): Promise<void> {
  const editor = page.locator('.ProseMirror');
  await expect(async () => {
    await editor.fill(text);
    await expect(editor).toHaveText(text, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}
