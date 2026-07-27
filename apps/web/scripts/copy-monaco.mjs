// Copies the Monaco editor's `min/vs` assets into public/monaco/vs so the app
// serves them from its own origin instead of the jsdelivr CDN.
//
// Why this exists: @monaco-editor/react loads Monaco from
// cdn.jsdelivr.net/npm/monaco-editor@X by default. Candidates sit on locked-down
// office / exam-hall networks that block third-party CDNs, so a code question's
// editor hangs on "Loading..." forever -- the exam is unusable for that
// candidate. lib/monaco-setup.ts points the loader at /monaco/vs; this puts the
// files there. See ADO #6825.
//
// Runs as a prebuild step. The output (public/monaco) is generated, gitignored,
// and flows into the Next standalone tree via the postbuild copy of public/.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
// Monorepo hoisting means monaco-editor usually lands in the root node_modules,
// not apps/web's -- check both.
const candidates = [
  join(webRoot, 'node_modules', 'monaco-editor', 'min', 'vs'),
  join(webRoot, '..', '..', 'node_modules', 'monaco-editor', 'min', 'vs'),
];
const from = candidates.find((p) => existsSync(p));
if (!from) {
  console.error('[copy-monaco] monaco-editor min/vs not found in node_modules; is monaco-editor installed?');
  process.exit(1);
}

const to = join(webRoot, 'public', 'monaco', 'vs');
mkdirSync(dirname(to), { recursive: true });
cpSync(from, to, { recursive: true });

// loader.js is the entry @monaco-editor/loader fetches first; if it's missing
// the self-host silently falls back to nothing and the editor never loads.
if (!existsSync(join(to, 'loader.js'))) {
  console.error(`[copy-monaco] FAILED: ${join(to, 'loader.js')} missing after copy`);
  process.exit(1);
}
console.log(`[copy-monaco] copied ${from} -> ${to}`);
