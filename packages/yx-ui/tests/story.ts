import type { Page } from '@playwright/test';

/**
 * Opens a story and waits for Storybook's own "storyRendered" event, which comes after the story's play function
 * (typing a name, focusing a step) has finished. Waiting a fixed time after the first paint raced those play functions:
 * a screenshot or an axe scan could catch the story half way.
 */
export async function openStory(page: Page, id: string, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __yxRendered?: boolean; __STORYBOOK_ADDONS_CHANNEL__?: { on(e: string, f: () => void): void } };
    const hook = setInterval(() => {
      if (!w.__STORYBOOK_ADDONS_CHANNEL__) return;
      clearInterval(hook);
      w.__STORYBOOK_ADDONS_CHANNEL__.on('storyRendered', () => (w.__yxRendered = true));
    }, 5);
  });
  await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`);
  await page.waitForSelector('#storybook-root > *', { state: 'attached' });
  await page.waitForFunction(() => (window as unknown as { __yxRendered?: boolean }).__yxRendered === true);
}
