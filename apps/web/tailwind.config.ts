import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary, #1a73e8)',
        accent: 'var(--color-accent, #fbbc04)',
      },
      spacing: {
        4.5: '18px',
      },
    },
  },
  plugins: [],
};

export default config;
