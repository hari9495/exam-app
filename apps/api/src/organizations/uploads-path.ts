import { existsSync } from 'fs';
import { dirname, join } from 'path';

// Walk up from this file's directory until we find `apps/api/package.json`. A fixed
// number of `..` segments is fragile here: this repo's tsconfig has no `rootDir`, so
// `nest build` compiles to `dist/src/organizations/uploads-path.js` (one level deeper
// than `dist/organizations/uploads-path.js`), while ts-jest runs this file straight
// from `src/organizations/uploads-path.ts`. Walking up to the package root resolves
// correctly in both cases instead of guessing a depth that only holds for one of them.
function findApiRoot(startDir: string): string {
  let dir = startDir;
  while (!existsSync(join(dir, 'package.json'))) {
    const parent = dirname(dir);
    if (parent === dir) {
      return startDir;
    }
    dir = parent;
  }
  return dir;
}

export const UPLOADS_ROOT = join(findApiRoot(__dirname), 'uploads');
