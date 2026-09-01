import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Self-hosted variable fonts (see globals.css @font-face). Display carries titles, the
        // exam clock, and large numerals; body carries everything else. system-ui is the graceful
        // fallback if a woff2 fails to load, which is why @font-face uses font-display: swap.
        display: ['Bricolage Grotesque', 'Hanken Grotesk', 'system-ui', 'sans-serif'],
        body: ['Hanken Grotesk', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: 'var(--slate-ink, #1b2530)',
        muted: 'var(--slate-muted, #5c6875)',
        rule: 'var(--slate-rule, #dbe0e6)',
        paper: 'var(--slate-paper, #ffffff)',
        ground: 'var(--slate-ground, #eceff3)',
        primary: 'var(--color-primary, #0053e2)',
        accent: 'var(--color-accent, #ffc220)',
        'on-primary': 'var(--color-primary-text, #ffffff)',
        brand: {
          navy: '#001E60',
          blue: '#0053E2',
          picton: '#4DBDF5',
          sail: '#A9DDF7',
        },
        candidate: {
          primary: 'var(--color-candidate-primary, #0053e2)',
          'primary-light': 'var(--color-candidate-primary-light, #E0EBFD)',
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
        // v2 shadcn tokens (additive; the CSS vars exist only under .v2, so these
        // resolve only inside the v2 scope and never affect the old UI). The three
        // names that clash with old tokens (primary/accent/muted) are NOT redefined
        // here — they are added v-prefixed (vprimary/vmuted/vaccent) so imported
        // shadcn/21st components rename those three classes to the v-prefixed form.
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: 'hsl(var(--card))',
        'card-foreground': 'hsl(var(--card-foreground))',
        popover: 'hsl(var(--popover))',
        'popover-foreground': 'hsl(var(--popover-foreground))',
        'primary-foreground': 'hsl(var(--primary-foreground))',
        secondary: 'hsl(var(--secondary))',
        'secondary-foreground': 'hsl(var(--secondary-foreground))',
        'muted-foreground': 'hsl(var(--muted-foreground))',
        'accent-foreground': 'hsl(var(--accent-foreground))',
        destructive: 'hsl(var(--destructive))',
        'destructive-foreground': 'hsl(var(--destructive-foreground))',
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        vprimary: 'hsl(var(--primary))',
        vmuted: 'hsl(var(--muted))',
        vaccent: 'hsl(var(--accent))',
      },
      spacing: {
        4.5: '18px',
      },
    },
  },
  plugins: [],
};

export default config;
