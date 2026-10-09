// Pure logic for the Settings map (APX-D §3): search index, value formatting, legal-floor validation, change diff.
import { formatDate, formatINR, formatTime, groupIndian } from '../../lib/format';
import type { SettingDef, SettingValue, SettingsGroupDef, SettingsPageDef } from './settings-types';

export type Draft = Record<string, SettingValue>;

/** Parses the registry's ISO "yyyy-mm-ddTHH:mm" without time-zone surprises. */
export function parseIso(iso: string): Date {
  const [d, t = '00:00'] = iso.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [h, min] = t.split(':').map(Number);
  return new Date(y, m - 1, day, h, min);
}

/** "14 Sep 2026, 11:05 am" */
export function formatStamp(iso: string): string {
  const dt = parseIso(iso);
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${formatDate(dt)}, ${formatTime(`${hh}:${mm}`)}`;
}

export function initialDraft(page: SettingsPageDef): Draft {
  const d: Draft = {};
  for (const s of page.sections) for (const def of s.settings) if (def.kind !== 'link' && def.kind !== 'list') d[def.key] = def.value ?? null;
  return d;
}

export function allSettings(page: SettingsPageDef): SettingDef[] {
  return page.sections.flatMap((s) => s.settings);
}

const sameValue = (a: SettingValue, b: SettingValue) =>
  Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((x, i) => x === b[i]) : a === b;

/** Keys whose draft value differs from the saved value. */
export function changedKeys(page: SettingsPageDef, draft: Draft): string[] {
  return allSettings(page)
    .filter((d) => d.kind !== 'link' && d.kind !== 'list' && d.kind !== 'law' && !sameValue(draft[d.key] ?? null, d.value ?? null))
    .map((d) => d.key);
}

/** The "Starter default" label shows only while the value still equals the starter value (D17). */
export function showsStarter(def: SettingDef, current: SettingValue): boolean {
  return Boolean(def.starter) && sameValue(current ?? null, def.value ?? null);
}

/** Plain text of a value for read-only view, search results and audit lines. */
export function formatValue(def: SettingDef, v: SettingValue = def.value ?? null): string {
  if (def.kind === 'list') return `${def.rows?.length ?? 0} ${def.rows?.length === 1 ? 'entry' : 'entries'}`;
  if (def.kind === 'link') return def.linkLabel ?? 'Open editor';
  if (v == null || v === '') return 'Not set';
  if (typeof v === 'boolean') return v ? 'On' : 'Off';
  if (Array.isArray(v)) return v.length ? (def.kind === 'offsets' ? `${v.join(', ')} ${def.unit ?? ''}`.trim() : v.join(', ')) : 'None';
  if (typeof v === 'number') {
    if (def.kind === 'usage') return `${groupIndian(v)} of ${groupIndian(def.max ?? 0)}${def.unit ? ` ${def.unit}` : ''}`;
    if (def.kind === 'money') return formatINR(v);
    if (def.kind === 'percent') return `${v}%`;
    return def.unit ? `${groupIndian(v)} ${def.unit}` : groupIndian(v);
  }
  if (def.kind === 'time') return formatTime(v);
  if (def.kind === 'date') return formatDate(parseIso(v));
  return def.optionLabels?.[v] ?? v;
}

/** Button text on the customer's brand colour is always white, in light and dark themes. */
export const ON_BRAND = '#FFFFFF';
/** Contrast of white button text on the brand colour; null when the value isn't a colour. */
export const contrastOnWhite = (hex: string) => contrastRatio(hex, ON_BRAND);
/** A valid value for <input type="color">. */
export const swatchValue = (hex: string) => (contrastRatio(hex, '#FFFFFF') == null ? '#000000' : hex.toLowerCase());

/** WCAG contrast ratio between two #rrggbb colours (1–21). Null when either isn't a valid hex colour. */
export function contrastRatio(a: string, b: string): number | null {
  const lum = (hex: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    const [r, g, bl] = [0, 2, 4].map((i) => {
      const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const la = lum(a);
  const lb = lum(b);
  if (la == null || lb == null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function unitText(def: SettingDef, n: number) {
  if (def.kind === 'money') return formatINR(n);
  if (def.kind === 'percent') return `${n}%`;
  return def.unit ? `${groupIndian(n)} ${def.unit}` : groupIndian(n);
}

/** "Legal minimum: 182 days (Maternity Benefit Act, 1961 s.5)" */
export function legalHint(def: SettingDef): string | null {
  if (!def.legal) return null;
  const word = def.legal.kind === 'max' ? 'Legal maximum' : 'Legal minimum';
  return `${word}: ${unitText(def, def.legal.value)} (${def.legal.statute})`;
}

/** Error text for one value, or null. Law is a floor: values below the legal minimum can't be saved. */
/** The next number a pattern produces, e.g. KFL/{type}/{yyyy}/{seq:4} → KFL/APT/2026/0143. */
export function refExample(pattern: string, type = 'APT', year = 2026, next = 143): string {
  return pattern
    .replace(/\{type\}/g, type)
    .replace(/\{yyyy\}/g, String(year))
    .replace(/\{seq(?::(\d))?\}/g, (_, n) => String(next).padStart(Number(n ?? 1), '0'));
}

export function validateSetting(def: SettingDef, v: SettingValue): string | null {
  if (def.refPattern && typeof v === 'string' && !/\{seq(:\d)?\}/.test(v)) return 'Add {seq} (the running number) so every letter gets its own reference.';
  if (typeof v === 'number') {
    if (def.legal) {
      const { value: lim, kind = 'min', statute } = def.legal;
      if (kind === 'min' && v < lim) return `Enter ${unitText(def, lim)} or more. The law sets this minimum (${statute}).`;
      if (kind === 'max' && v > lim) return `Enter ${unitText(def, lim)} or less. The law sets this maximum (${statute}).`;
    }
    if (def.min != null && v < def.min) return `Enter ${unitText(def, def.min)} or more`;
    if (def.max != null && v > def.max) return `Enter ${unitText(def, def.max)} or less`;
    if (def.kind === 'percent' && (v < 0 || v > 100)) return 'Enter a percentage between 0 and 100';
  }
  if ((def.kind === 'number' || def.kind === 'money' || def.kind === 'percent') && v == null && def.value != null) {
    return `Enter ${def.label.toLowerCase()}`;
  }
  return null;
}

/** Checks between two settings on the same page: half day ≤ full day, visitors until > from. */
function crossCheck(def: SettingDef, draft: Draft, page: SettingsPageDef): string | null {
  const v = draft[def.key];
  const otherKey = def.atMost ?? def.after;
  if (!otherKey) return null;
  const other = allSettings(page).find((d) => d.key === otherKey);
  const o = draft[otherKey] ?? other?.value ?? null;
  if (!other || v == null || o == null) return null;
  if (def.atMost && typeof v === 'number' && typeof o === 'number' && v > o) return `Can't be more than ${other.label.toLowerCase()} (${formatValue(other, o)}).`;
  if (def.after && typeof v === 'string' && typeof o === 'string' && v <= o) return `Must be later than ${other.label.toLowerCase()} (${formatValue(other, o)}).`;
  return null;
}

export function validateDraft(page: SettingsPageDef, draft: Draft): Record<string, string> {
  const errs: Record<string, string> = {};
  for (const def of allSettings(page)) {
    if (!(def.key in draft)) continue;
    const e = validateSetting(def, draft[def.key]) ?? crossCheck(def, draft, page);
    if (e) errs[def.key] = e;
  }
  return errs;
}

/* ---------------- Settings search (P01 §4.6, fixes U90) ---------------- */

export interface SearchEntry {
  key: string;
  label: string;
  pageId: string;
  pageTitle: string;
  groupId: number;
  groupTitle: string;
  section: string;
  valueText: string;
  scope: string;
  /** Lower-case haystack. */
  text: string;
  /** true for page-level entries (found by task words / page title). */
  isPage?: boolean;
}

export function buildIndex(groups: SettingsGroupDef[]): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const g of groups)
    for (const p of g.pages) {
      out.push({
        key: `page:${p.id}`,
        label: p.title,
        pageId: p.id,
        pageTitle: p.title,
        groupId: g.id,
        groupTitle: g.title,
        section: '',
        valueText: p.summary,
        scope: '',
        text: `${p.title} ${p.summary} ${g.title}`.toLowerCase(),
        isPage: true,
      });
      for (const s of p.sections)
        for (const d of s.settings)
          out.push({
            key: d.key,
            label: d.label,
            pageId: p.id,
            pageTitle: p.title,
            groupId: g.id,
            groupTitle: g.title,
            section: s.title,
            valueText: d.kind === 'law' ? `${formatValue(d)} · ${d.builtIn ? 'built-in rule' : 'set by law'}` : formatValue(d),
            scope: d.scope ?? 'Company',
            text: `${d.label} ${(d.synonyms ?? []).join(' ')} ${s.title} ${p.title} ${d.key.replace(/[._]/g, ' ')}`.toLowerCase(),
          });
    }
  return out;
}

/**
 * Every word must match. Label matches rank above synonym / page matches; pages rank first when the title matches.
 * `canManage(pageId)` filters out pages the viewer may not manage (only those settings are returned).
 */
export function searchSettings(index: SearchEntry[], query: string, canManage: (pageId: string) => boolean = () => true, limit = 30): SearchEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored: { e: SearchEntry; score: number }[] = [];
  for (const e of index) {
    if (!canManage(e.pageId)) continue;
    if (!words.every((w) => e.text.includes(w))) continue;
    const label = e.label.toLowerCase();
    let score = 0;
    for (const w of words) score += label.startsWith(w) ? 4 : label.includes(w) ? 3 : 1;
    if (e.isPage && words.every((w) => label.includes(w))) score += 5;
    scored.push({ e, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.e.pageId.localeCompare(b.e.pageId, undefined, { numeric: true }))
    .slice(0, limit)
    .map((x) => x.e);
}

/** Splits text into parts, marking where query words match, for <mark> highlighting. */
export function highlightParts(text: string, query: string): { text: string; hit: boolean }[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [{ text, hit: false }];
  const esc = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${esc.join('|')})`, 'gi');
  return text
    .split(re)
    .filter((t) => t !== '')
    .map((t) => ({ text: t, hit: words.includes(t.toLowerCase()) }));
}

export function findPage(groups: SettingsGroupDef[], id: string): { group: SettingsGroupDef; page: SettingsPageDef } {
  for (const group of groups) {
    const page = group.pages.find((p) => p.id === id);
    if (page) return { group, page };
  }
  throw new Error(`Settings page ${id} not found`);
}

/** Page needs maker-checker approval (P03 YX-WF-16: approval-policy and payroll pages). */
export function needsSecondApprover(page: SettingsPageDef): boolean {
  return page.group === 4 || page.id === '2.4' || /second approver/i.test(page.note ?? '');
}


/* ---------------------------------------------------------------------------------------------------------------
 * Plain words for people (founder review 30 Sep 2026): the settings map is written with internal document and rule
 * codes (P07, M01, YX-WF-16, TIM-27, APX-D §3). Users never see them. Real law citations stay
 * ("Maternity Benefit Act, 1961 s.5").
 * ------------------------------------------------------------------------------------------------------------- */
const CODE_IN_PARENS = /\s*\((?:[^()]*?)(?:\b[PMD]\d{2}\b|YX-[A-Z]+-\d+|\b[A-Z]{2,4}-\d{2,3}\b|APX-[A-Z]\b|§\s*\d)(?:[^()]*?)\)/g;
export function plainText(t: string): string {
  return t
    .replace(CODE_IN_PARENS, '')
    .replace(/[;,]?\s*YukthiX rule YX-[A-Z]+-\d+/g, '')
    .replace(/\b(?:from|per)\s+P07\b/g, 'from the statutory rules')
    .replace(/\bfollow\s+P03(?:\s+YX-[A-Z]+-\d+)?/g, 'follow the approval rules')
    .replace(/\s*\b(?:[PMD]\d{2}(?:\s+Q\d+)?|YX-[A-Z]+-\d+|APX-[A-Z])\b/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:)])/g, '$1')
    .trim();
}
/** Text fields that people read; ids, keys, values and options are left alone. */
const TEXT_FIELDS = new Set(['title', 'summary', 'description', 'helper', 'note', 'label', 'what', 'statute', 'law', 'locked', 'availability', 'addLabel', 'linkLabel']);
function cleanDeep(v: unknown, field?: string): unknown {
  if (typeof v === 'string') return field && TEXT_FIELDS.has(field) ? plainText(v) : v;
  if (Array.isArray(v)) return field === 'rows' ? v.map((r) => (Array.isArray(r) ? r.map((c) => (typeof c === 'string' ? plainText(c) : c)) : r)) : v.map((x) => cleanDeep(x, field === 'related' || field === 'sections' || field === 'settings' || field === 'pages' ? undefined : field));
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const m = typeof o.law === 'string' ? /^YukthiX rule(?: YX-[A-Z]+-\d+)?:\s*(.*)$/.exec(o.law) : null;
    const src = m ? { ...o, builtIn: true, law: m[1].charAt(0).toUpperCase() + m[1].slice(1) } : o;
    return Object.fromEntries(Object.entries(src).map(([k, x]) => [k, cleanDeep(x, k)]));
  }
  return v;
}
export const cleanGroups = <T>(groups: T): T => cleanDeep(groups) as T;


/* ---------------------------------------------------------------------------------------------------------------
 * Table rules (founder review 1 Oct 2026)
 * ------------------------------------------------------------------------------------------------------------- */

/** Where "value" sits against "min": by option order when the column is a pick-list, else by the leading number. */
export function belowMinimum(value: string, min: string, order?: string[]): boolean {
  if (order) {
    const a = order.indexOf(value);
    const b = order.indexOf(min);
    return a >= 0 && b >= 0 && a < b;
  }
  const a = parseFloat(value);
  const b = parseFloat(min);
  return !Number.isNaN(a) && !Number.isNaN(b) && a < b;
}

export interface ListCheck {
  label: string;
  ok: boolean;
  text: string;
}

/**
 * POSH Internal Committee per workplace (Sexual Harassment of Women at Workplace Act, 2013 s.4): a presiding officer,
 * at least two employee members and one external member. Gender balance is checked on the committee screen.
 */
export function poshCheck(rows: string[][]): ListCheck[] {
  const places = [...new Set(rows.map((r) => r[0]))];
  return places.map((w) => {
    const roles = rows.filter((r) => r[0] === w).map((r) => r[2]);
    const missing: string[] = [];
    if (!roles.includes('Presiding officer')) missing.push('a presiding officer');
    const members = roles.filter((x) => x === 'Member').length;
    if (members < 2) missing.push(`${2 - members} more member${2 - members === 1 ? '' : 's'}`);
    if (!roles.includes('External member')) missing.push('an external member');
    return { label: w, ok: missing.length === 0, text: missing.length ? `Needs ${missing.length > 1 ? `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}` : missing[0]}` : 'Meets the law' };
  });
}

/** Paid festival and national holidays each state's law requires in a year. */
export const HOLIDAY_MINIMUM: Record<string, number> = { Karnataka: 10, 'Tamil Nadu': 9 };

/** Each holiday calendar against its state's legal minimum (columns: Calendar, State, Locations, Holidays, …). */
export function holidayCheck(rows: string[][]): ListCheck[] {
  return rows.map((r) => {
    const need = HOLIDAY_MINIMUM[r[1]];
    const have = parseInt(r[3], 10);
    if (need == null || Number.isNaN(have)) return { label: r[0], ok: true, text: `${r[3]} holidays` };
    return { label: r[0], ok: have >= need, text: have >= need ? `${have} holidays, law needs ${need}` : `Only ${have} holidays, law needs ${need}` };
  });
}

/** Checks shown under a table, by setting key. */
/** Calibration guide shares (column 2, "10 %") must add up to 100 %. */
export function shareTotalCheck(rows: string[][]): ListCheck[] {
  const total = rows.reduce((n, r) => n + (parseFloat(r[1]) || 0), 0);
  return [{ label: 'Total', ok: total === 100, text: total === 100 ? 'Total 100 %' : `Total ${total} %, must be 100 %` }];
}

const rupees = (t: string) => Number(t.replace(/[^0-9]/g, '')) || 0;
/** Budget rows (Department, Budget, Used): flag any department that has spent more than its budget. */
export function budgetCheck(rows: string[][]): ListCheck[] {
  return rows.map((r) => {
    const over = rupees(r[2]) - rupees(r[1]);
    return { label: r[0], ok: over <= 0, text: over <= 0 ? `${Math.round((rupees(r[2]) / rupees(r[1])) * 100)} % used` : `Over budget by ₹${over.toLocaleString('en-IN')}` };
  });
}

/** Usage rows (Meter, Included, Used, …): percent of the allowance used; 80 % warns, 100 % is over. */
export function usageCheck(rows: string[][]): ListCheck[] {
  return rows.map((r) => {
    const inc = parseFloat(r[1].replace(/,/g, ''));
    const used = parseFloat(r[2].replace(/,/g, ''));
    const pct = inc ? Math.round((used / inc) * 100) : 0;
    return { label: r[0], ok: pct < 80, text: pct >= 100 ? `${pct} % used, over the allowance` : pct >= 80 ? `${pct} % used, nearly at the allowance` : `${pct} % used` };
  });
}

export const LIST_CHECKS: Record<string, (rows: string[][]) => ListCheck[]> = {
  'usage.meters': usageCheck,
  'case.ic.members': poshCheck,
  'holiday.calendars': holidayCheck,
  'perf.calibration_guide': shareTotalCheck,
  'lrn.budgets': budgetCheck,
};
