// Affordance check (founder review 7 Oct 2026: "things you can click must look clickable"; §15, R2, R11, WCAG 2.4.7 / 1.4.11).
// Opens every story of a built Storybook in Chrome and, for every interactive element, reads computed styles and flags:
//   no-affordance   text control with neither border nor fill, not styled as a link
//   no-pointer      enabled control without cursor: pointer
//   no-hover        hovering changes nothing
//   no-focus-ring   keyboard focus shows no outline / ring / border change
//   state-colour-only  selected and unselected options differ only by text colour (tabs, chips, toggles, segments)
//   no-tooltip      icon-only button without a tooltip or title
//   weak-hover      a text control whose hover only changes the text colour
//   boundary-contrast  a control drawn only by its border, border under 3:1 against the background (WCAG 1.4.11)
// Clickable cards / rows (an element with a React onClick that isn't a native control) get the same checks.
// Links inside running text are skipped.
//
// Usage (from packages/yx-ui):
//   node scripts/check-affordance.mjs [storybook-static dir] [--all] [--theme=dark] [--out=file.json]
// Without --all it checks the representative story set below (the guard, ~1 min). Exit code 1 when anything is flagged.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const args = process.argv.slice(2);
const DIR = resolve(args.find((a) => !a.startsWith('--')) ?? 'storybook-static');
const ALL = args.includes('--all');
const THEME = args.find((a) => a.startsWith('--theme='))?.slice(8) ?? 'light';
const OUT = args.find((a) => a.startsWith('--out='))?.slice(6);
const ONLY = args.find((a) => a.startsWith('--only='))?.slice(7);
const WORKERS = Number(process.env.WORKERS ?? 8);

// Representative set for the guard: every component story group plus one or two screens per area that use
// tabs, chips, segments, pagination, menus, clickable rows and cards. Prefix match on the story id.
const GUARD = [
  'actions-', 'inputs-', 'overlays-', 'data-', 'data-display-', 'shell-', 'workflow-', 'surfaces-', 'builders-', 'dashboards-', 'time-and-activity-',
  'screens-people-directory', 'screens-people-employee-profile', 'screens-settings-', 'screens-time-leave', 'screens-hiring-pipeline',
  'screens-notifications-', 'screens-org-chart',
  // Founder test batch 8 Oct 2026: clickable rows in a narrow (card) table, a Review button on a selected row,
  // the locked scope button, the résumé upload, phone tables with filters.
  'screens-expenses-exp-03', 'screens-analytics-anl-07', 'screens-proctoring-prc-03', 'screens-platform-inbox-requests--plt-04',
  'screens-platform-shell-homes--plt-01', 'screens-hiring-hir-12', 'screens-portals-t9-06',
];

// Documented exceptions: [story id prefix or '*', selector, reason, rules skipped (all when omitted)].
export const EXCEPTIONS = [
  ['*', '.yx-shell__skip, .yx-skip-link', 'skip link: off-screen until focused, then a filled pill'],
  ['*', '.yx-menu__item, [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"]', 'items inside an open list are rows, highlighted on hover and arrow keys'],
  ['*', '.yx-workspace__home, .yx-powered-by', 'brand mark that links home / to YukthiX: logos are links by convention', ['no-affordance']],
  ['actions-button--interaction-states', '.yx-button', 'the states sheet shows each state frozen, tooltips off'],
  ['inputs-all-states--live-validation', '.yx-input__toggle', 'the story re-renders on a timer and takes focus back', ['no-focus-ring']],
  ['*', '.yx-roster[data-readonly] .yx-roster__cell', 'read-only roster: cells open nothing'],
  ['*', '.yx-notif__text, .yx-plt-notif__text, .yx-plt-list__main', 'the whole notification / list row is the link (stretched); the row tints on hover and the text underlines', ['no-affordance']],
  ['*', '.yx-tim-cell', 'muster grid cells: a spreadsheet, the cell grid is the affordance; hover outlines the cell', ['no-affordance']],
  ['*', '.yx-table__editable', 'click-to-edit cell: the cell itself shows the value, no tooltip', ['no-tooltip']],
  ['*', 'span.yx-tim-row', 'wrapper that only stops row clicks reaching the row'],
  ['*', '.yx-table__editable, .yx-roster__cell', 'spreadsheet-style cells: text / cell cursor says "edit here"', ['no-pointer']],
  ['*', '.yx-dialog__head .yx-button[aria-label="Close"], .yx-sheet__head .yx-button[aria-label="Close"], .yx-drawer__head .yx-button[aria-label="Close"], .yx-toast .yx-button[aria-label="Close"]', 'Close (X): the dialog focuses it on open, so a tooltip would pop up every time', ['no-tooltip']],
];

const index = JSON.parse(await readFile(join(DIR, 'index.json'), 'utf8'));
let stories = Object.values(index.entries).filter((e) => e.type === 'story');
if (ONLY) stories = stories.filter((s) => s.id.includes(ONLY));
else if (!ALL) stories = stories.filter((s) => GUARD.some((p) => s.id.startsWith(p)));

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const server = createServer(async (req, res) => {
  let path = normalize(join(DIR, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)));
  if (!path.startsWith(DIR)) return res.writeHead(403).end();
  try {
    if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(await readFile(path));
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
await new Promise((r) => server.once('listening', r));
const BASE = `http://localhost:${server.address().port}`;

// ---- in-page helpers -------------------------------------------------------------------------------------------
function collect(exceptions) {
  const SEL = 'button, a[href], summary, input[type=button], input[type=submit], input[type=reset], [role=button], [role=tab], [role=radio], [role=checkbox], [role=switch], [role=menuitem], [role=option], [role=link]';
  const props = (el) => { const k = Object.keys(el).find((x) => x.startsWith('__reactProps')); return (k && el[k]) || {}; };
  // A Radix tooltip trigger carries onClick/onPointerMove but no popup; it is a tooltip, not a click target.
  const tipTrigger = (el) => /closed|delayed-open|instant-open/.test(el.getAttribute('data-state') || '') && !el.hasAttribute('aria-haspopup') && !el.hasAttribute('aria-expanded') && !!props(el).onPointerMove;
  const reactClick = (el) => !!props(el).onClick && !tipTrigger(el);
  const set = new Set(document.querySelectorAll(SEL));
  for (const el of document.querySelectorAll('div, li, tr, article, section, span, td, label, img, svg')) if (reactClick(el) && !el.closest(SEL)) set.add(el);
  // Table rows always carry the table's click handler; only rows marked clickable are click targets.
  for (const el of [...set]) if (el.tagName === 'TR' && el.closest('.yx-table') && !el.hasAttribute('data-clickable')) set.delete(el);
  // Link colour of the theme, to tell a styled link from plain text.
  const probe = document.createElement('a'); probe.className = 'yx-link'; document.body.append(probe); const linkColour = getComputedStyle(probe).color; probe.remove();
  // Navigation (rail, side panel, tab bars, breadcrumbs, column headers) is not a button: it needs hover, pointer, focus and a
  // clear current item, not a border.
  const NAV = 'nav, [role=navigation], [role=tablist], thead, .yx-crumbs, .yx-rail, .yx-panel, .yx-mobile-tabs';
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.opacity !== '0' && !el.closest('[aria-hidden="true"], [inert]'); };
  const inText = (el) => {
    if (el.tagName !== 'A' && el.getAttribute('role') !== 'link') return false;
    const p = el.parentElement; if (!p) return false;
    const own = [...p.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).length;
    return own > 0 || ['P', 'LI', 'DD', 'TD', 'SMALL'].includes(p.tagName) && p.textContent.trim().length > el.textContent.trim().length + 8;
  };
  const block = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const c = [...e.classList].find((x) => x.startsWith('yx-')); if (c) return (e === el ? '' : '… ') + c; } return el.tagName.toLowerCase(); };
  const out = [];
  let i = 0;
  const sig = new Set();
  for (const el of set) {
    if (!visible(el) || inText(el)) continue;
    // A big container with a click handler (sheet, panel body) is not a click target.
    if (!el.matches(SEL)) { const r = el.getBoundingClientRect(); if (r.width * r.height > 200000) continue; }
    const ex = exceptions.filter(([sel]) => el.matches(sel));
    if (ex.some(([, rules]) => !rules)) continue;
    const role = el.getAttribute('role') || ({ A: 'link', SUMMARY: 'summary', BUTTON: 'button', INPUT: 'button' }[el.tagName]) || 'clickable';
    const text = (el.tagName === 'INPUT' ? el.value : el.innerText || '').trim().replace(/\s+/g, ' ');
    const initials = !!el.querySelector('.yx-avatar') && text.length <= 3; // an avatar button reads as an icon
    const state = el.getAttribute('aria-selected') ?? el.getAttribute('aria-pressed') ?? el.getAttribute('aria-checked') ?? el.getAttribute('aria-current') ?? el.getAttribute('data-state') ?? el.getAttribute('aria-expanded') ?? '';
    const key = [el.tagName, el.className && typeof el.className === 'string' ? el.className : '', role, state, !!text, el.parentElement?.className].join('|');
    if (sig.has(key)) continue;
    sig.add(key);
    el.dataset.yxa = String(i);
    out.push({
      i: i++, skip: ex.flatMap(([, rules]) => rules), role, tag: el.tagName.toLowerCase(), text: text.slice(0, 40), block: block(el), cls: typeof el.className === 'string' ? el.className.slice(0, 80) : '',
      disabled: el.disabled || el.getAttribute('aria-disabled') === 'true' || el.matches('[data-disabled]') || getComputedStyle(el).cursor === 'not-allowed',
      named: !!(text || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || el.labels?.length),
      iconOnly: !text || initials, label: el.getAttribute('aria-label') || '', title: el.getAttribute('title') || '',
      tooltip: el.hasAttribute('data-yx-tooltip') || tipTrigger(el) || !!el.getAttribute('title'),
      current: el.matches('[aria-selected="true"], [aria-pressed="true"], [aria-checked="true"], [aria-current]:not([aria-current="false"]), [data-active], [data-current], [data-state="active"], [data-state="on"], [aria-expanded="true"][aria-haspopup], tr:has([role="checkbox"][data-state="checked"])'),
      // Disclosure headers (accordion rows, <summary>) are rows with a chevron, like navigation: hover, not a border.
      nav: !!el.closest(NAV) || el.getAttribute('role') === 'tab' || el.tagName === 'SUMMARY' || (el.hasAttribute('aria-expanded') && !el.hasAttribute('aria-haspopup')), linkColour,
      wide: el.getBoundingClientRect().width >= 200,
      // A borderless part of a bordered control (filter chip, segment, joined buttons) uses the frame's border.
      framed: (() => { const r = el.getBoundingClientRect(); for (let e = el.parentElement, k = 0; e && k < 2; e = e.parentElement, k++) { const cs = getComputedStyle(e); const q = e.getBoundingClientRect(); if (parseFloat(cs.borderTopWidth) > 0 && !/rgba\(.*, 0\)$/.test(cs.borderTopColor) && q.height <= r.height + 16) return true; } return false; })(),
      pseudo: !!el.closest('[class*="pseudo-"]') || !!document.querySelector('[class*="pseudo-"]'),
      haspopup: el.getAttribute('aria-haspopup') || '', expanded: el.getAttribute('aria-expanded'),
      selected: el.getAttribute('aria-selected') ?? el.getAttribute('aria-pressed') ?? el.getAttribute('aria-checked') ?? (el.getAttribute('aria-current') ? 'true' : null),
      native: el.matches(SEL), focusable: el.tabIndex >= 0,
      parentBg: (() => { for (let e = el.parentElement; e; e = e.parentElement) { const b = getComputedStyle(e).backgroundColor; if (!/rgba\(.*, 0\)$|transparent/.test(b)) return b; } return 'rgb(255, 255, 255)'; })(),
    });
  }
  return out;
}

function styles(i) {
  const el = document.querySelector(`[data-yxa="${i}"]`);
  if (!el) return null;
  const pick = (cs) => ({
    bg: cs.backgroundColor, bgImg: cs.backgroundImage, bc: [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor].join(' '),
    bw: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].join(' '), bs: [cs.borderTopStyle, cs.borderBottomStyle].join(' '),
    color: cs.color, weight: cs.fontWeight, shadow: cs.boxShadow, deco: cs.textDecorationLine + ' ' + cs.textDecorationThickness,
    outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, filter: cs.filter, opacity: cs.opacity, cursor: cs.cursor, transform: cs.transform,
  });
  const pseudo = (p) => { const cs = getComputedStyle(el, p); return cs.content === 'none' ? '' : `${cs.backgroundColor} ${cs.height} ${cs.width} ${cs.borderBottomWidth} ${cs.borderBottomColor} ${cs.opacity} ${cs.transform}`; };
  // Descendants that change on hover (title colour on a card, chevron, a check icon).
  const kids = [...el.querySelectorAll('*')].slice(0, 12).map((k) => { const cs = getComputedStyle(k); return `${cs.color}|${cs.backgroundColor}|${cs.textDecorationLine}|${cs.borderColor}|${cs.opacity}|${cs.display}|${cs.boxShadow}|${cs.outlineStyle}`; }).join(';');
  const hasCheck = !!el.querySelector('svg, .yx-icon, [data-check]');
  const up = [el.parentElement, el.parentElement?.parentElement, el.parentElement?.parentElement?.parentElement].map((p) => (p ? getComputedStyle(p).backgroundColor : '')).join(' ');
  return { ...pick(getComputedStyle(el)), up, before: pseudo('::before'), after: pseudo('::after'), kids, hasCheck, fv: el.matches(':focus-visible') };
}

// ---- checks ----------------------------------------------------------------------------------------------------
const transparent = (c) => /rgba\([^)]*,\s*0\)$/.test(c) || c === 'transparent';
const sides = (bc) => bc.match(/rgba?\([^)]*\)/g) ?? [];
const hasBorder = (s) => s.bw.split(' ').some((w, k) => parseFloat(w) > 0 && !transparent(sides(s.bc)[k] ?? '')) && !/none none/.test(s.bs);
const hasFill = (s, parentBg) => (!transparent(s.bg) && s.bg !== parentBg) || s.bgImg !== 'none';
const linkStyled = (s, e) => /underline/.test(s.deco) || s.color === e.linkColour;
const diff = (a, b, keys) => keys.filter((k) => a[k] !== b[k]);
const lum = (c) => { const m = c.match(/[\d.]+/g); if (!m) return 1; return [0, 1, 2].map((k) => { const v = m[k] / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, k) => a + v * [0.2126, 0.7152, 0.0722][k], 0); };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const VISUAL = ['bg', 'bgImg', 'bc', 'bw', 'shadow', 'deco', 'outline', 'filter', 'opacity', 'before', 'after', 'kids', 'transform', 'color'];

function category(e) {
  const c = e.cls + ' ' + e.block;
  if (e.role === 'tab') return 'Tabs';
  if (/segment/.test(c)) return 'Segment';
  if (/chip/.test(c)) return 'Chip / FilterChip';
  if (/pag/.test(c)) return 'Pagination';
  if (e.haspopup === 'menu' || e.haspopup === 'true' && !/select|combobox/.test(c)) return 'Menu trigger';
  if (e.tag === 'summary' || (e.expanded !== null && !e.haspopup)) return 'Disclosure / Accordion';
  if (e.tag === 'tr' || /table__row|row/.test(e.cls) && !e.native) return 'Table row (clickable)';
  if (!e.native) return 'Card / tile as button';
  if (e.role === 'link' || e.tag === 'a') return 'Link-button';
  if (e.iconOnly && /yx-button/.test(c)) return 'IconButton';
  if (e.iconOnly) return 'Icon control (non-IconButton)';
  if (e.selected !== null && ['button', 'radio', 'checkbox', 'switch'].includes(e.role)) return 'Toggle / pick button';
  if (/yx-button/.test(e.cls)) return 'Button';
  return 'Other control';
}

async function auditStory(page, cdp, s) {
  await page.goto(`${BASE}/iframe.html?id=${s.id}&viewMode=story&globals=theme:${THEME}`, { waitUntil: 'load' });
  await page.waitForSelector('#storybook-root > *', { state: 'attached', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  const els = await page.evaluate(collect, EXCEPTIONS.filter(([p]) => p === '*' || s.id.startsWith(p)).map(([, sel, , rules]) => [sel, rules ?? null]));
  const findings = [];
  const add = (e, rule, detail = '') => e.skip.includes(rule) || findings.push({ story: s.id, cat: category(e), block: e.block, rule, el: `${e.tag}${e.text ? ` "${e.text}"` : e.label ? ` [${e.label}]` : ''}`, detail });
  const base = {};
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  for (const e of els) {
    const b = await page.evaluate(styles, e.i);
    if (!b) continue;
    base[e.i] = b;
    if (e.disabled) continue;
    // affordance
    const textual = !e.iconOnly && e.role !== 'link' && e.tag !== 'a' || (e.tag === 'a' && /yx-button/.test(e.cls));
    // grab: a draggable item (palette, canvas node) that also opens on click.
    if (b.cursor !== 'pointer' && b.cursor !== 'grab') add(e, 'no-pointer', `cursor: ${b.cursor}`);
    // hover: force :hover on the element and its ancestors (like a real pointer)
    const nodeIds = [];
    try {
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-yxa="${e.i}"]` });
      if (nodeId) {
        nodeIds.push(nodeId);
        let id = nodeId;
        for (let k = 0; k < 4; k++) {
          const { node } = await cdp.send('DOM.describeNode', { nodeId: id });
          if (!node.parentId) break;
          id = node.parentId;
          nodeIds.push(id);
        }
      }
    } catch {}
    for (const id of nodeIds) await cdp.send('CSS.forcePseudoState', { nodeId: id, forcedPseudoClasses: ['hover'] }).catch(() => {});
    const h = await page.evaluate(styles, e.i);
    for (const id of nodeIds) await cdp.send('CSS.forcePseudoState', { nodeId: id, forcedPseudoClasses: [] }).catch(() => {});
    const rowHover = e.wide && h && (hasFill(h, e.parentBg) || h.up !== b.up); // a list row / option card that tints on hover
    if (textual && !e.nav && !e.framed && !rowHover && !['checkbox', 'switch', 'radio'].includes(e.role) && !hasBorder(b) && !hasFill(b, e.parentBg) && !linkStyled(b, e) && e.native)
      add(e, 'no-affordance', `bg ${b.bg} border ${b.bw}`);
    if (e.tag === 'a' && !e.nav && !rowHover && !/yx-button/.test(e.cls) && !e.iconOnly && !linkStyled(b, e) && !hasBorder(b) && !hasFill(b, e.parentBg)) add(e, 'no-affordance', 'link with no underline, border or fill');
    if (h && !e.pseudo && !e.current) { // the current / selected item may keep its look on hover
      const d = diff(b, h, VISUAL);
      if (!d.length) add(e, 'no-hover');
      else if (textual && e.native && d.every((k) => k === 'color' || k === 'kids')) add(e, 'weak-hover', 'only the text colour changes');
    }
    // WCAG 1.4.11: a control drawn only by its border needs a 3:1 border against what is behind it.
    if (textual && e.native && !e.nav && hasBorder(b) && !hasFill(b, e.parentBg) && !['tab', 'checkbox', 'switch', 'radio'].includes(e.role)) {
      const c = Math.max(...sides(b.bc).filter((x, k) => parseFloat(b.bw.split(' ')[k]) > 0).map((x) => contrast(x, e.parentBg)));
      if (c < 3) add(e, 'boundary-contrast', `border ${c.toFixed(2)}:1`);
    }
    // keyboard focus
    if (e.focusable && !e.pseudo) {
      await page.keyboard.press('Shift');
      // Behind an open modal the focus trap sends focus back into the dialog: unreachable, not ring-less.
      const reached = await page.evaluate((i) => { const el = document.querySelector(`[data-yxa="${i}"]`); el.focus({ preventScroll: true }); return document.activeElement === el; }, e.i);
      const f = reached ? await page.evaluate(styles, e.i) : null;
      await page.evaluate(() => document.activeElement?.blur());
      const ring = f && (!/^none/.test(f.outline) && parseFloat(f.outline.split(' ')[1]) > 0 || f.shadow !== b.shadow || f.bc !== b.bc || f.before !== b.before || f.after !== b.after || f.kids !== b.kids);
      if (f && !ring) add(e, 'no-focus-ring', f.fv ? 'focus-visible, nothing drawn' : 'no :focus-visible');
    }
    // Checkboxes, radios and switches are named by their label; only icon buttons need a tooltip.
    if (e.iconOnly && e.native && e.role === 'button' && !e.tooltip && !/yx-input__toggle|yx-filter-chip__remove/.test(e.cls)) add(e, 'no-tooltip');
    if (e.native && !e.named) add(e, 'no-name');
  }
  // selected vs unselected siblings
  const groups = {};
  for (const e of els) if (e.selected !== null && !e.disabled && base[e.i]) (groups[`${e.block}|${e.role}`] ??= []).push(e);
  for (const g of Object.values(groups)) {
    const on = g.find((e) => e.selected === 'true' || e.selected === 'page' || e.selected === 'step');
    const off = g.find((e) => e.selected === 'false' || e.selected === null);
    if (!on || !off) continue;
    const d = diff(base[on.i], base[off.i], ['bg', 'bgImg', 'bc', 'bw', 'shadow', 'deco', 'before', 'after', 'outline', 'kids']);
    if (!d.length) add(on, 'state-colour-only', `selected "${on.text}" vs "${off.text}" differ only in ${diff(base[on.i], base[off.i], ['color', 'weight']).join(', ') || 'nothing'}`);
  }
  return findings;
}

// ---- run ---------------------------------------------------------------------------------------------------------
const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' }); // locally the installed Chrome; CI installs Playwright's chromium
const queue = [...stories];
const all = [];
const errors = [];
let done = 0;
await Promise.all(Array.from({ length: Math.min(WORKERS, queue.length) }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  let page = await ctx.newPage();
  let cdp = await ctx.newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  for (let s = queue.shift(); s; s = queue.shift()) {
    try {
      all.push(...(await auditStory(page, cdp, s)));
    } catch (err) {
      errors.push(`${s.id}: ${String(err.message).split('\n')[0]}`);
      await page.close().catch(() => {});
      page = await ctx.newPage(); cdp = await ctx.newCDPSession(page);
      await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
    }
    if (++done % 100 === 0) console.log(`${done}/${stories.length}`);
  }
  await ctx.close();
}));
await browser.close();
server.close();

if (OUT) writeFileSync(OUT, JSON.stringify({ stories: stories.length, theme: THEME, findings: all, errors }, null, 1));
const byCat = {};
for (const f of all) {
  const c = (byCat[f.cat] ??= { n: 0, rules: {}, stories: new Set(), blocks: new Set() });
  c.n++; c.rules[f.rule] = (c.rules[f.rule] ?? 0) + 1; c.stories.add(f.story); c.blocks.add(f.block);
}
console.log(`\n${stories.length} stories (${THEME}) · ${all.length} findings · ${errors.length} errors`);
for (const [cat, c] of Object.entries(byCat).sort((a, b) => b[1].n - a[1].n))
  console.log(`- ${cat}: ${c.n} (${Object.entries(c.rules).map(([r, n]) => `${r} ${n}`).join(', ')}) · e.g. ${[...c.stories].slice(0, 3).join(', ')} · ${[...c.blocks].slice(0, 6).join(', ')}`);
for (const e of errors.slice(0, 10)) console.log('error', e);
process.exit(all.length ? 1 : 0);
