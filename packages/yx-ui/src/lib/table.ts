// Pure data logic behind DataTable, FilterBar and TimesheetGrid (§20, §30, M12).

export type SortDir = 'asc' | 'desc';
export interface SortState {
  key: string;
  dir: SortDir;
}

const collator = new Intl.Collator('en-IN', { numeric: true, sensitivity: 'base' });

/** Compares numbers, dates and text; empty values always sort last. */
export function compareValues(a: unknown, b: unknown): number {
  const ea = a === null || a === undefined || a === '';
  const eb = b === null || b === undefined || b === '';
  if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

export function sortRows<R>(rows: R[], getValue: (r: R) => unknown, dir: SortDir): R[] {
  const out = rows.map((r, i) => ({ r, i, v: getValue(r) }));
  out.sort((x, y) => {
    const ex = x.v === null || x.v === undefined || x.v === '';
    const ey = y.v === null || y.v === undefined || y.v === '';
    if (ex !== ey) return ex ? 1 : -1; // empties last in both directions
    const c = compareValues(x.v, y.v);
    return (dir === 'asc' ? c : -c) || x.i - y.i; // stable
  });
  return out.map((o) => o.r);
}

export interface RowGroup<R> {
  key: string;
  label: string;
  rows: R[];
}

/** Groups rows by a value, keeping first-seen order of groups. Empty values go to "No value" last. */
export function groupRows<R>(rows: R[], getValue: (r: R) => unknown, emptyLabel = 'No value'): RowGroup<R>[] {
  const map = new Map<string, RowGroup<R>>();
  let empty: RowGroup<R> | null = null;
  for (const r of rows) {
    const v = getValue(r);
    if (v === null || v === undefined || v === '') {
      empty ??= { key: '__empty__', label: emptyLabel, rows: [] };
      empty.rows.push(r);
      continue;
    }
    const k = v instanceof Date ? v.toISOString() : String(v);
    if (!map.has(k)) map.set(k, { key: k, label: String(v), rows: [] });
    map.get(k)!.rows.push(r);
  }
  const groups = [...map.values()];
  if (empty) groups.push(empty);
  return groups;
}

export type TotalKind = 'sum' | 'avg' | 'count';

export function total<R>(rows: R[], getValue: (r: R) => unknown, kind: TotalKind): number {
  if (kind === 'count') return rows.length;
  const nums = rows.map(getValue).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const sum = nums.reduce((a, b) => a + b, 0);
  if (kind === 'sum') return round2(sum);
  return nums.length ? round2(sum / nums.length) : 0;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** CSV with a BOM so Excel opens ₹ and Indian names correctly. Values are the displayed text. */
export function toCsv(header: string[], rows: string[][]): string {
  const esc = (s: string) => {
    // Guard against formula injection in spreadsheets.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return '﻿' + [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
}

// ---------- Filters (§30) ----------

export type FilterType = 'multi' | 'date' | 'number' | 'text';

export interface FilterField {
  key: string;
  label: string;
  type: FilterType;
  /** For multi. */
  options?: { value: string; label: string }[];
}

export type FilterValue =
  | { key: string; type: 'multi'; values: string[] }
  | { key: string; type: 'date'; from: string | null; to: string | null } // yyyy-mm-dd
  | { key: string; type: 'number'; min: number | null; max: number | null }
  | { key: string; type: 'text'; contains: string };

export function isFilterActive(f: FilterValue): boolean {
  switch (f.type) {
    case 'multi':
      return f.values.length > 0;
    case 'date':
      return Boolean(f.from || f.to);
    case 'number':
      return f.min != null || f.max != null;
    case 'text':
      return f.contains.trim() !== '';
  }
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Client-side filtering for small lists; large lists send the same FilterValue[] to the API. */
export function matchesFilter(value: unknown, f: FilterValue): boolean {
  if (!isFilterActive(f)) return true;
  switch (f.type) {
    case 'multi':
      return Array.isArray(value) ? value.some((v) => f.values.includes(String(v))) : f.values.includes(String(value));
    case 'date': {
      if (!(value instanceof Date)) return false;
      const d = ymd(value);
      return (!f.from || d >= f.from) && (!f.to || d <= f.to);
    }
    case 'number':
      return typeof value === 'number' && (f.min == null || value >= f.min) && (f.max == null || value <= f.max);
    case 'text':
      return String(value ?? '').toLowerCase().includes(f.contains.trim().toLowerCase());
  }
}

/** Filters → URL query so a filtered view can be shared (§30). */
export function filtersToQuery(filters: FilterValue[], search?: string): string {
  const p = new URLSearchParams();
  if (search) p.set('q', search);
  for (const f of filters) {
    if (!isFilterActive(f)) continue;
    if (f.type === 'multi') p.set(`f.${f.key}`, f.values.join(','));
    if (f.type === 'date') p.set(`f.${f.key}`, `${f.from ?? ''}..${f.to ?? ''}`);
    if (f.type === 'number') p.set(`f.${f.key}`, `${f.min ?? ''}..${f.max ?? ''}`);
    if (f.type === 'text') p.set(`f.${f.key}`, f.contains);
  }
  return p.toString();
}

export function filtersFromQuery(query: string, fields: FilterField[]): { filters: FilterValue[]; search: string } {
  const p = new URLSearchParams(query);
  const filters: FilterValue[] = [];
  for (const field of fields) {
    const raw = p.get(`f.${field.key}`);
    if (raw == null) continue;
    if (field.type === 'multi') {
      const allowed = new Set(field.options?.map((o) => o.value));
      const values = raw.split(',').filter((v) => v && (!field.options || allowed.has(v)));
      if (values.length) filters.push({ key: field.key, type: 'multi', values });
    } else if (field.type === 'date') {
      const [from, to] = raw.split('..');
      const ok = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
      if (ok(from) || ok(to)) filters.push({ key: field.key, type: 'date', from: ok(from), to: ok(to) });
    } else if (field.type === 'number') {
      const [a, b] = raw.split('..');
      const n = (s?: string) => (s !== undefined && s !== '' && Number.isFinite(Number(s)) ? Number(s) : null);
      if (n(a) != null || n(b) != null) filters.push({ key: field.key, type: 'number', min: n(a), max: n(b) });
    } else if (raw.trim()) {
      filters.push({ key: field.key, type: 'text', contains: raw });
    }
  }
  return { filters, search: p.get('q') ?? '' };
}

// ---------- Timesheets (M12) ----------

/** "7.5", "7,5", "7:30", "7h30", "7h 30m", "45m" → decimal hours. Null for empty; NaN for nonsense. */
export function parseHours(input: string): number | null {
  const s = input.trim().toLowerCase().replace(',', '.');
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[:h]\s*(\d{1,2})\s*m?$/);
  if (m) {
    const min = Number(m[2]);
    return min < 60 ? round2(Number(m[1]) + min / 60) : NaN;
  }
  m = s.match(/^(\d{1,3})\s*m$/);
  if (m) return round2(Number(m[1]) / 60);
  m = s.match(/^(\d{1,2}(?:\.\d{1,2})?)\s*h?$/);
  if (m) return Number(m[1]);
  return NaN;
}

/** 7.5 → "7.5", 8 → "8", 0.25 → "0.25". */
export function formatHours(h: number | null | undefined): string {
  if (h == null) return '';
  return String(round2(h));
}
