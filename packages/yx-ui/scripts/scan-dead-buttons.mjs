// Lists <Button>/<IconButton> tags that have no way to act: no onClick, asChild link, type="submit", or disabled state.
// Usage: node scripts/scan-dead-buttons.mjs src/screens/pay
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] ?? 'src/screens';
const files = fs.readdirSync(dir, { recursive: true }).map((f) => path.join(dir, f)).filter((f) => /\.tsx$/.test(f) && !/\.(stories|test)\.tsx$/.test(f));
const out = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const re = /<(Button|IconButton)\b([^>]*?)(\/?)>/gs;
  for (let m; (m = re.exec(src)); ) {
    const attrs = m[2];
    if (/\bonClick=|\basChild\b|type="submit"|\bdisabled\b|\{\.\.\./.test(attrs)) continue;
    // Dialog and menu triggers act through their wrapper.
    if (/trigger=\{\s*$/i.test(src.slice(Math.max(0, m.index - 40), m.index))) continue;
    const line = src.slice(0, m.index).split('\n').length;
    const label = m[3] ? '' : src.slice(re.lastIndex, src.indexOf('</', re.lastIndex)).replace(/\s+/g, ' ').trim().slice(0, 60);
    out.push({ file: f.replace(/\\/g, '/'), line, label });
  }
}
console.log(JSON.stringify(out, null, 1));
console.error(`${out.length} buttons with no action`);
