// next.config sets output: 'standalone', which emits a self-contained server at
// .next/standalone/apps/web/server.js -- the file pm2 actually runs in
// production. Next deliberately does NOT copy .next/static or public/ into that
// tree; the deployer is expected to. When that step is missed the server boots
// fine and every page returns HTTP 200, but every /_next/static/* request 404s,
// so the site renders as unstyled HTML with broken images.
//
// That failure mode already reached production once (2026-07-27, roughly five
// hours) precisely because a health check that only asserted "the document
// returned 200" cannot see it. Making the copy a postbuild step removes the
// chance to forget it; asserting on assets rather than the document is the
// other half, and belongs in the deploy check.
//
// Node's fs.cpSync rather than `cp -r` so this behaves the same on Windows dev
// machines and the Linux VM.
import { cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const standaloneRoot = join(webRoot, '.next', 'standalone', 'apps', 'web');

// A non-standalone build (or a build that failed before emitting it) is not an
// error here -- there is simply nothing to populate.
if (!existsSync(standaloneRoot)) {
  console.log('[copy-standalone-assets] no standalone output, skipping');
  process.exit(0);
}

for (const [from, to] of [
  [join(webRoot, '.next', 'static'), join(standaloneRoot, '.next', 'static')],
  [join(webRoot, 'public'), join(standaloneRoot, 'public')],
]) {
  if (!existsSync(from)) continue;
  cpSync(from, to, { recursive: true });
  console.log(`[copy-standalone-assets] copied ${from} -> ${to}`);
}

// Fail the build rather than ship a tree that boots and serves 404s for every
// asset. A silent success here is exactly what produced the outage.
const staticOut = join(standaloneRoot, '.next', 'static');
if (!existsSync(staticOut)) {
  console.error(`[copy-standalone-assets] FAILED: ${staticOut} missing after copy`);
  process.exit(1);
}
