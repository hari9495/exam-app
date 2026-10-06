// Smoke test: every PLT-33…64 story renders without throwing.
import { describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import * as rules from './rules.stories';
import * as growth from './growth.stories';
import * as region from './region-agent.stories';
import * as studio from './studio.stories';
import * as kit from './platform-b-kit.stories';

const all = { rules, growth, region, studio, kit } as Record<string, Record<string, unknown>>;

describe('platform-b stories render', () => {
  for (const [file, mod] of Object.entries(all))
    for (const [name, story] of Object.entries(mod)) {
      const r = (story as { render?: () => ReactElement }).render;
      if (name === 'default' || !r) continue;
      it(`${file} · ${name}`, () => {
        const { container } = render(r());
        expect(container.innerHTML.length).toBeGreaterThan(0);
        cleanup();
      });
    }
});
