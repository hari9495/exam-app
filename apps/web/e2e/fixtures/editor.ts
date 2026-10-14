import { expect, type Page } from '@playwright/test';

// The rich-text editor (ProseMirror) mounts again when its tab changes (note ↔ reply), so keys typed straight after a
// click could land in the editor that was just replaced and be lost: then "Send reply" stays disabled. Write into
// the editor on screen and check it holds the text before going on.
export async function writeInEditor(page: Page, text: string): Promise<void> {
  const editor = page.locator('.ProseMirror');
  // Real key presses (not fill): the editor's own input handling must see them, or its text changes without the
  // draft the Send button reads.
  await expect(async () => {
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type(text);
    await expect(editor).toHaveText(text, { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
}
