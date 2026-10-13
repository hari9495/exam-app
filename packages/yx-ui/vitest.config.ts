import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Cache outside node_modules: writes there made the API's watch mode (which watches node_modules through the
  // workspace links) restart the running dev server on every test run.
  cacheDir: join(tmpdir(), 'yukthix-ui-vite'),
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
    css: false,
    // Dates show in the viewer's time zone and the fixtures are India dates (+05:30): pin it, so a run on a UTC
    // machine (CI) reads the same days as one in India.
    env: { TZ: 'Asia/Kolkata' },
    // The screen tests render whole screens in jsdom and drive them like a person (open a select, pick, type, send):
    // 1.5–3 s each when run alone, and up to three times that while every other test file renders in parallel
    // (a full run, CI). That is real work, not a hang, so they get 15 s instead of Vitest's 5 s default.
    testTimeout: 15_000,
  },
});
