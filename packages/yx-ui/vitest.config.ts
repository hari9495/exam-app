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
  },
});
