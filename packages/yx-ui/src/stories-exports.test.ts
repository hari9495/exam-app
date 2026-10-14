import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Storybook takes every named export of a *.stories.tsx file for a story. Sample props exported for the tests
// (`export const list = {...}`) become stories that cannot render, and the axe and screenshot runs time out on them.
// Such a file must list them in its meta's excludeStories (e.g. excludeStories: /^[a-z]/).
function storyFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return storyFiles(path);
    return name.endsWith('.stories.tsx') ? [path] : [];
  });
}

describe('story files', () => {
  it('exclude the sample data they export from the stories', () => {
    const offenders = storyFiles(__dirname)
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return /^export const [a-z]\w*\b/m.test(source) && !source.includes('excludeStories');
      })
      .map((file) => relative(__dirname, file));
    expect(offenders, `Add excludeStories to the meta of: ${offenders.join(', ')}`).toEqual([]);
  });
});
