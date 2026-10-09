import { describe, it, expect } from 'vitest';
import { render, cleanup } from '@testing-library/react';
const mods = import.meta.glob('./*.stories.tsx', { eager: true }) as Record<string, Record<string, any>>;
describe('smoke', () => {
  for (const [file, mod] of Object.entries(mods)) {
    for (const [name, story] of Object.entries(mod)) {
      if (name === 'default' || !story?.render) continue;
      it(`${file} ${name}`, () => {
        const errs: string[] = [];
        const orig = console.error;
        console.error = (...a: unknown[]) => { errs.push(String(a[0])); };
        try { render(story.render({}, {})); } finally { console.error = orig; cleanup(); }
        expect(errs.filter((e) => !/act\(|not wrapped/.test(e))).toEqual([]);
      });
    }
  }
});
