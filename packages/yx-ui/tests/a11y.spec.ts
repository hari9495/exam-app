import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';

// WCAG 2.2 AA scan of every story in light and dark (§36). Runs against the built Storybook.
const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
type Entry = { id: string; type: string; title: string; name: string };
const index = JSON.parse(readFileSync('storybook-static/index.json', 'utf8')) as { entries: Record<string, Entry> };
const stories = Object.values(index.entries).filter((e) => e.type === 'story');

for (const theme of ['light', 'dark'] as const) {
  for (const s of stories) {
    test(`a11y ${s.title} › ${s.name} [${theme}]`, async ({ page }) => {
      const crashes: string[] = [];
      page.on('pageerror', (e) => crashes.push(e.message));
      await page.goto(`/iframe.html?id=${s.id}&viewMode=story&globals=theme:${theme}`);
      await page.waitForSelector('#storybook-root > *', { state: 'attached' });
      await page.waitForTimeout(s.id.includes('live-validation') ? 4000 : 800);
      await page.addScriptTag({ path: axePath });
      const violations = await page.evaluate(async () => {
        // @ts-expect-error axe is injected above
        const r = await window.axe.run(document.body, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] });
        return r.violations.map(
          (v: { id: string; nodes: { target: string[]; any: { message: string }[]; all: { message: string }[] }[] }) =>
            `${v.id}: ${v.nodes
              .slice(0, 3)
              .map((n) => `${n.target.join(' ')} — ${n.any[0]?.message ?? n.all[0]?.message ?? ''}`)
              .join(' | ')}`,
        );
      });
      expect(crashes, `story threw: ${crashes.join(' | ')}`).toEqual([]);
      expect(violations, violations.join('\n')).toEqual([]);
    });
  }
}
