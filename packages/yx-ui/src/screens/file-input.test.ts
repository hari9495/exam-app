import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Founder 23 Oct 2026: a visible browser file picker ("Choose File · No file chosen") never shows; screens use
// FileUpload (drag or Browse files). A hidden input behind a styled button stays allowed.
function screenFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return screenFiles(path);
    return name.endsWith('.tsx') && !name.includes('.test.') && !name.includes('.stories.') ? [path] : [];
  });
}

describe('file inputs', () => {
  it('screens use FileUpload, not a visible browser file picker', () => {
    const offenders = screenFiles(__dirname)
      .filter((file) => /className="yx-input" type="file"/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(__dirname, file));
    expect(offenders, `Use FileUpload in: ${offenders.join(', ')}`).toEqual([]);
  });
});
