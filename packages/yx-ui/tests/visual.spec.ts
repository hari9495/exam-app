import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// One screenshot per story × theme (§42). Stories are read from the built Storybook index.
type Entry = { id: string; type: string; title: string; name: string; tags?: string[] };
const index = JSON.parse(readFileSync('storybook-static/index.json', 'utf8')) as { entries: Record<string, Entry> };
const stories = Object.values(index.entries).filter((e) => e.type === 'story' && !e.tags?.includes('skip-visual'));

for (const theme of ['light', 'dark'] as const) {
  for (const s of stories) {
    test(`${s.title} › ${s.name} [${theme}]`, async ({ page }) => {
      await page.goto(`/iframe.html?id=${s.id}&viewMode=story&globals=theme:${theme}`);
      await page.waitForSelector('#storybook-root > *', { state: 'attached' });
      await page.evaluate(() => document.fonts.ready);
      // Let play functions and first-draw animations settle.
      await page.waitForTimeout(s.id.includes('live-validation') ? 4000 : 600);
      await expect(page).toHaveScreenshot(`${s.id}--${theme}.png`, { fullPage: true });
    });
  }
}
