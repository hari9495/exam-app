/// <reference types="vite/client" />
// Smoke test: every Pay story renders without throwing (the lead checks visuals in Storybook).
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { composeStories } from '@storybook/react-vite';

const modules = import.meta.glob('./*.stories.tsx', { eager: true }) as Record<string, Parameters<typeof composeStories>[0]>;

describe('Pay stories render', () => {
  for (const [file, mod] of Object.entries(modules)) {
    const stories = composeStories(mod);
    for (const [name, S] of Object.entries(stories)) {
      const Story = S as unknown as () => JSX.Element;
      it(`${file} · ${name}`, () => {
        const { container, unmount } = render(<Story />);
        expect(container.ownerDocument.body.textContent?.length).toBeGreaterThan(0);
        unmount();
      });
    }
  }
});
