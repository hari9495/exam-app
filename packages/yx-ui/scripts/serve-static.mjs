// Minimal static server for the built Storybook (used by the screenshot tests).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'storybook-static');
const port = Number(process.argv[3] ?? 6007);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon' };

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  let path = normalize(join(root, decodeURIComponent(url.pathname)));
  if (!path.startsWith(root)) return res.writeHead(403).end();
  try {
    if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(await readFile(path));
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));
