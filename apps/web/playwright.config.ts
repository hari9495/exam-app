import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  // Multi-person walk-throughs; a sign-in that meets the per-account limit waits out its minute (fixtures/sign-in.ts),
  // which alone passes Playwright's 30 s default. Specs that need longer still set their own.
  timeout: 180_000,
  // Traces for failures, uploaded by CI with the logs.
  use: {
    trace: 'retain-on-failure',
    baseURL: process.env.WEB_BASE_URL ?? 'http://localhost:3000',
    // E2E_BROWSER_CHANNEL=chrome runs the installed Chrome instead of the bundled Chromium.
    channel: process.env.E2E_BROWSER_CHANNEL,
  },
});
