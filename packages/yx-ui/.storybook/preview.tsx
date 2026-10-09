import type { Preview } from '@storybook/react-vite';
import '../src/styles/index.css';
import './preview.css';

// The widths every screen must fit with no sideways scroll (R4).
const VIEWPORTS = {
  phone: { name: 'Phone 390', styles: { width: '390px', height: '844px' }, type: 'mobile' },
  tablet: { name: 'Tablet 871', styles: { width: '871px', height: '1100px' }, type: 'tablet' },
  laptop: { name: 'Laptop 1280', styles: { width: '1280px', height: '800px' }, type: 'desktop' },
  desktop: { name: 'Desktop 1440', styles: { width: '1440px', height: '900px' }, type: 'desktop' },
} as const;

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Colour theme (§48)',
      toolbar: { title: 'Theme', icon: 'mirror', items: ['light', 'dark'], dynamicTitle: true },
    },
    density: {
      description: 'Density (§2)',
      toolbar: { title: 'Density', icon: 'component', items: ['comfortable', 'compact'], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: 'light', density: 'comfortable' },
  decorators: [
    (Story, ctx) => {
      const root = document.documentElement;
      root.dataset.theme = ctx.globals.theme;
      root.dataset.density = ctx.globals.density;
      document.body.classList.add('yx-body');
      return (
        <div className="yx-root" style={{ padding: 24, minHeight: '100vh' }}>
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
    controls: { expanded: true },
    viewport: { options: VIEWPORTS },
  },
};
export default preview;
