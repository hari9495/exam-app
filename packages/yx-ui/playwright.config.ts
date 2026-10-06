import { defineConfig } from '@playwright/test';

// Screenshot (visual.spec.ts) and axe (a11y.spec.ts) tests for every Storybook story (§42).
// Run from packages/yx-ui: `npm run test:visual` / `npm run test:a11y` build Storybook first.
// Baselines are platform-specific (tests/__screenshots__/{platform}, stored in Git LFS); only win32 baselines exist today.
// Locally we use the installed Chrome; run `npm run test:visual:update` to refresh local baselines.
export default defineConfig({
  testDir: 'tests',
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{arg}{ext}',
  timeout: 60_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  expect: { timeout: 20_000, toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled', caret: 'hide' } },
  use: {
    baseURL: 'http://localhost:6007',
    channel: process.env.CI ? undefined : 'chrome',
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    contextOptions: { reducedMotion: 'reduce' },
  },
  webServer: {
    command: 'node scripts/serve-static.mjs storybook-static 6007',
    url: 'http://localhost:6007/index.json',
    reuseExistingServer: !process.env.CI,
  },
});
