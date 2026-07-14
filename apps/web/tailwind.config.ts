import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary, #1a73e8)',
        accent: 'var(--color-accent, #fbbc04)',
        candidate: {
          primary: '#2F6F5E',
          'primary-light': '#F0F7F4',
          bg: '#F4F7F6',
          review: '#B8860B',
          'review-bg': '#FBF3DD',
          'review-border': '#E8D8A8',
        },
      },
      spacing: {
        4.5: '18px',
      },
    },
  },
  plugins: [],
};

export default config;
