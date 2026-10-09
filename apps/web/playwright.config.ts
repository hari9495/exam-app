import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.WEB_BASE_URL ?? 'http://localhost:3000',
    // E2E_BROWSER_CHANNEL=chrome runs the installed Chrome instead of the bundled Chromium.
    channel: process.env.E2E_BROWSER_CHANNEL,
  },
});
