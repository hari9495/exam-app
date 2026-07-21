import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary, #1a73e8)',
        accent: 'var(--color-accent, #fbbc04)',
        candidate: {
          primary: 'var(--color-candidate-primary, #2F6F5E)',
          'primary-light': 'var(--color-candidate-primary-light, #F0F7F4)',
          'on-primary': 'var(--color-candidate-on-primary, #ffffff)',
          bg: '#F4F7F6',
          review: '#B8860B',
          'review-bg': '#FBF3DD',
          'review-border': '#E8D8A8',
          danger: '#B23B3B',
          'danger-bg': '#FBEAEA',
          'danger-border': '#F0C9C9',
          border: '#E4E7E5',
          text: '#1A1F1D',
          'text-secondary': '#57615B',
          'text-tertiary': '#6B7570',
          'text-faint': '#9AA5A0',
        },
        recruiter: {
          border: '#E4E7E5',
          text: '#1A1F1D',
          'text-secondary': '#57615B',
          'text-tertiary': '#9AA5A0',
          'bg-subtle': '#F7F9F8',
        },
        status: {
          success: '#2F6F5E',
          'success-bg': '#EAF5EF',
          warning: '#8A5A00',
          'warning-bg': '#FBF3DD',
          danger: '#B23B3B',
          'danger-bg': '#FBEAEA',
          neutral: '#6B7570',
          'neutral-bg': '#F3F5F4',
          info: '#2955A3',
          'info-bg': '#EAF0FB',
          purple: '#6B2FA3',
          'purple-bg': '#F3EAFB',
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
