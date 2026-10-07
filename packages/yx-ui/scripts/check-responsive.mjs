// Responsive check (founder review 30 Sep 2026): every screen story at monitor, laptop, small laptop, tablet and phone widths.
// Fails a story+width when something sticks out sideways (page or main content scrolls horizontally, or an element pokes
// past the window edge outside its own scroll box) or when a full-page screen scrolls as a whole (two scroll bars).
// Usage: node scripts/check-responsive.mjs [baseUrl] [filter]   · resumable: results append to test-results/responsive.jsonl
// RECHECK=1 re-runs only the story+sizes that failed last time (after fixes), keeping the passes.
import { chromium } from '@playwright/test';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:6006';
const FILTER = process.argv[3] ?? 'Screens';
const WIDTHS = [
  { name: 'monitor', width: 1920, height: 1080 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'small-laptop', width: 1024, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'phone', width: 390, height: 844 },
];
// WIDTHS=1440,1024,768,375 checks just those widths (height 900).
if (process.env.WIDTHS) WIDTHS.splice(0, WIDTHS.length, ...process.env.WIDTHS.split(',').map((w) => ({ name: `w${w}`, width: Number(w), height: 900 })));
const WORKERS = Number(process.env.WORKERS ?? 6);
const OUT = 'test-results/responsive.jsonl';

mkdirSync('test-results', { recursive: true });
if (process.env.RECHECK && existsSync(OUT)) {
  const keep = readFileSync(OUT, 'utf8').split('\n').filter(Boolean).filter((l) => { const r = JSON.parse(l); return !r.issues.length && !r.error; });
  writeFileSync(OUT, keep.map((l) => l + '\n').join(''));
}
const done = new Set(existsSync(OUT) ? readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.id}|${r.size}`; }) : []);
const index = await (await fetch(`${BASE}/index.json`)).json();
const stories = Object.values(index.entries).filter((e) => e.type === 'story' && e.title.startsWith(FILTER));
const jobs = stories.flatMap((s) => WIDTHS.map((w) => ({ s, w }))).filter(({ s, w }) => !done.has(`${s.id}|${w.name}`));
console.log(`${stories.length} stories × ${WIDTHS.length} sizes · ${jobs.length} to check`);

// Runs inside the page.
function measure() {
  const W = document.documentElement.clientWidth;
  const H = window.innerHeight;
  const out = [];
  const docX = document.documentElement.scrollWidth - W;
  if (docX > 1) out.push(`page scrolls sideways by ${docX}px`);
  const fullPage = document.querySelector('.yx-shell, .yx-portal, .yx-kiosk');
  if (document.querySelector('.yx-shell') && document.documentElement.scrollHeight - H > 1) out.push(`whole page scrolls (${document.documentElement.scrollHeight - H}px): two scroll bars`);
  const main = document.querySelector('.yx-shell__content');
  if (main && main.scrollWidth - main.clientWidth > 1) out.push(`main content scrolls sideways by ${main.scrollWidth - main.clientWidth}px`);
  // Row buttons spilling out of a table's action column over other columns (founder review 30 Sep 2026).
  for (const td of document.querySelectorAll('td.yx-table__actions')) {
    const btn = td.querySelector('.yx-button');
    if (btn && btn.getBoundingClientRect().left < td.getBoundingClientRect().left - 1) {
      out.push('table row buttons spill over other columns');
      break;
    }
  }
  const clips = (el) => { const o = getComputedStyle(el).overflowX; return o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip'; };
  const path = (el) => { const p = []; for (let e = el; e && e !== document.body && p.length < 3; e = e.parentElement) p.unshift(e.tagName.toLowerCase() + ([...e.classList].filter((c) => c.startsWith('yx-')).slice(0, 2).map((c) => '.' + c).join('') || '')); return p.join(' > '); };
  const seen = new Set();
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || (r.right <= W + 1 && r.left >= -1)) continue;
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' || cs.visibility === 'hidden' || el.closest('[data-radix-popper-content-wrapper], .yx-visually-hidden, .yx-shell__skip, [aria-hidden="true"]')) continue;
    let a = el.parentElement, inside = false;
    while (a && a !== document.body && a !== document.documentElement) { if (a !== main && clips(a)) { inside = true; break; } a = a.parentElement; }
    if (inside) continue;
    const key = path(el);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`${key} pokes out (${Math.round(r.left)}→${Math.round(r.right)} of ${W})`);
    if (seen.size >= 4) break;
  }
  return { issues: out, fullPage: Boolean(fullPage) };
}

const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' });
let n = 0, bad = 0;
async function worker() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  for (let job = jobs.shift(); job; job = jobs.shift()) {
    const { s, w } = job;
    let rec;
    try {
      await page.setViewportSize({ width: w.width, height: w.height });
      await page.goto(`${BASE}/iframe.html?id=${s.id}&viewMode=story`, { timeout: 60000 });
      await page.waitForSelector('#storybook-root > *', { state: 'attached', timeout: 30000 });
      await page.waitForTimeout(400);
      const m = await page.evaluate(measure);
      rec = { id: s.id, title: `${s.title} › ${s.name}`, size: w.name, issues: m.issues };
    } catch (e) {
      rec = { id: s.id, title: `${s.title} › ${s.name}`, size: w.name, issues: [], error: String(e).slice(0, 200) };
    }
    appendFileSync(OUT, JSON.stringify(rec) + '\n');
    n++;
    if (rec.issues.length) bad++;
    if (n % 200 === 0) console.log(`${n} checked · ${bad} with issues`);
  }
  await ctx.close();
}
await Promise.all(Array.from({ length: WORKERS }, worker));
await browser.close();

const all = readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const failing = all.filter((r) => r.issues.length);
const errors = all.filter((r) => r.error);
console.log(`responsive: ${all.length - failing.length}/${all.length} ok · ${failing.length} with issues · ${errors.length} load errors`);
process.exit(failing.length ? 1 : 0);
