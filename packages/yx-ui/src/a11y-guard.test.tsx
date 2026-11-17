/// <reference types="vite/client" />
import { act, render } from '@testing-library/react';
import { composeStories } from '@storybook/react-vite';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import KNOWN from './a11y-guard.known.json';

// Answer 2330: automated WCAG 2.1 AA checks (axe-core) over the key screens and the Accessibility menu. Each story is
// rendered as a person sees it and scanned; a finding is "file · story: rule". Today's findings are listed in
// a11y-guard.known.json, which may only shrink: fix one, take it off the list (the second test asks you to).
// jsdom has no layout, so colour contrast is checked by the Playwright scan of the built Storybook (tests/a11y.spec.ts,
// light and dark), not here.

const modules = {
  ...import.meta.glob('./stories/accessibility.stories.tsx', { eager: true }),
  ...import.meta.glob('./screens/auth/sign-in.stories.tsx', { eager: true }),
  ...import.meta.glob('./screens/platform-a/shell-home.stories.tsx', { eager: true }),
  ...import.meta.glob('./stories/careers.stories.tsx', { eager: true }),
  ...import.meta.glob('./stories/exam.stories.tsx', { eager: true }),
  ...import.meta.glob('./screens/proctoring/stories/prc-21.stories.tsx', { eager: true }),
  ...import.meta.glob('./screens/proctoring/stories/prc-26.stories.tsx', { eager: true }),
} as Record<string, Parameters<typeof composeStories>[0]>;

const OPTIONS: axe.RunOptions = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
  rules: { 'color-contrast': { enabled: false } },
};

const found: string[] = [];

describe('WCAG 2.1 AA (axe) on the key screens', () => {
  for (const [file, mod] of Object.entries(modules)) {
    const short = file.replace(/^\.\//, '').replace(/\.stories\.tsx$/, '');
    for (const [name, S] of Object.entries(composeStories(mod))) {
      const Story = S as unknown as () => JSX.Element;
      it(`${short} · ${name}`, async () => {
        const { unmount } = render(<Story />);
        // let effects and popovers settle before the scan
        await act(async () => {
          await new Promise((r) => setTimeout(r, 0));
        });
        const result = await axe.run(document.body, OPTIONS);
        for (const v of result.violations) found.push(`${short} · ${name}: ${v.id}`);
        unmount();
      });
    }
  }

  it('finds nothing new (fix it, or, only if it cannot be fixed now, list it in a11y-guard.known.json with the reason)', () => {
    const known = new Set(Object.keys(KNOWN));
    expect([...new Set(found)].filter((f) => !known.has(f)).sort()).toEqual([]);
  });

  it('the known list only shrinks: each entry is still found (remove the ones you fixed)', () => {
    expect(Object.keys(KNOWN).filter((k) => !found.includes(k)).sort()).toEqual([]);
  });
});
