// Regenerates src/access/role-template-history.ts: every permission set each role template has had, from the git
// history of src/access/role-templates.ts (a file of plain constants, transpiled and evaluated here; our own source).
// Run from apps/api: node scripts/role-template-history.cjs
const { execFileSync } = require('child_process');
const { writeFileSync } = require('fs');
const { join } = require('path');
const ts = require('typescript');

const api = join(__dirname, '..');
const file = 'src/access/role-templates.ts';
const git = (...args) => execFileSync('git', ['-C', api, ...args]).toString();
const history = {};
for (const commit of git('log', '--format=%H', '--', file).trim().split('\n')) {
  const src = git('show', `${commit}:apps/api/${file}`);
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', js)(mod, mod.exports, require);
  for (const t of mod.exports.ROLE_TEMPLATES ?? []) {
    const set = [...new Set(t.permissions)].sort();
    (history[t.key] ??= new Map()).set(JSON.stringify(set), set);
  }
}
const out = Object.fromEntries(Object.entries(history).sort().map(([k, v]) => [k, [...v.values()]]));
writeFileSync(
  join(api, 'src/access/role-template-history.ts'),
  [
    '// Generated from the git history of role-templates.ts: every permission set each template has had. A company role',
    '// whose keys equal one of these exactly is an unchanged copy of that template (access/template-sync.service.ts).',
    '// Regenerate when a template changes: node scripts/role-template-history.cjs (the current set is always added too).',
    `export const TEMPLATE_HISTORY: Record<string, string[][]> = ${JSON.stringify(out, null, 2)};`,
    '',
  ].join('\n'),
);
console.log(Object.entries(out).map(([k, v]) => `${k}:${v.length}`).join(' '));
