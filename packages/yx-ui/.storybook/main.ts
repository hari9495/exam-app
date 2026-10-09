import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/react-vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// In the monorepo `storybook` is hoisted to the root while its addons may sit in this package's
// node_modules, so presets are resolved from here, not from Storybook's own folder.
const require = createRequire(import.meta.url);
const abs = (pkg: string) => dirname(require.resolve(`${pkg}/package.json`));

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.tsx'],
  addons: [abs('@storybook/addon-a11y'), abs('storybook-addon-pseudo-states')],
  framework: { name: abs('@storybook/react-vite') as '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true },
  // The package root, even when Storybook is launched from another folder.
  viteFinal: (cfg) => ({ ...cfg, root }),
};
export default config;
