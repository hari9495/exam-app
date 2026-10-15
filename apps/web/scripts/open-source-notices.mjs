// G-21 open-source notices: the runtime dependencies of the apps and packages, with the version installed and the
// licence each package declares. Run per release: node apps/web/scripts/open-source-notices.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '../../..');
const workspaces = ['apps/web', 'apps/api', 'packages/yx-ui', 'packages/shared'];
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const out = new Map();
for (const ws of workspaces) {
  for (const name of Object.keys(read(join(root, ws, 'package.json')).dependencies ?? {})) {
    if (name.startsWith('@exam-platform/') || name.startsWith('@yukthix/')) continue; // our own code
    const pkg = [join(root, ws, 'node_modules', name, 'package.json'), join(root, 'node_modules', name, 'package.json')].find(existsSync);
    if (!pkg) continue;
    const p = read(pkg);
    const licence = typeof p.license === 'string' ? p.license : (p.license?.type ?? p.licenses?.map((l) => l.type).join(' OR ') ?? 'See package');
    const repo = typeof p.repository === 'string' ? p.repository : p.repository?.url;
    const url = p.homepage ?? (repo ? repo.replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://') : null);
    out.set(name, { name, version: p.version, licence, url: url && /^https:\/\//.test(url) ? url : null });
  }
}
const list = [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(join(import.meta.dirname, '../lib/open-source-notices.json'), JSON.stringify(list, null, 1) + '\n');
console.log(`${list.length} components`);
