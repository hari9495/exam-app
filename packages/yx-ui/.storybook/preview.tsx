import type { Preview } from '@storybook/react-vite';
import '../src/styles/index.css';
import './preview.css';

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
  },
};
export default preview;
