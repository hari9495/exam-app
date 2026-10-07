import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.WEB_BASE_URL ?? 'http://localhost:3000',
    // An installed browser instead of a downloaded one, e.g. E2E_BROWSER_CHANNEL=chrome.
    channel: process.env.E2E_BROWSER_CHANNEL || undefined,
  },
});
