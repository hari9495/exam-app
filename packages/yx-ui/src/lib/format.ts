// Formats from DESIGN-SYSTEM.md §35. Pure functions, no dependencies.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Indian digit grouping: 1234567 -> "12,34,567". Keeps sign and decimals. */
export function groupIndian(value: number | string, decimals?: number): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '';
  const fixed = decimals === undefined ? String(Math.abs(n)) : Math.abs(n).toFixed(decimals);
  const [int, frac] = fixed.split('.');
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  const grouped = rest ? `${rest},${last3}` : last3;
  return (n < 0 ? '-' : '') + grouped + (frac ? `.${frac}` : '');
}

/** ₹ amount: no paise unless the value has them (§16), or decimals forced. Negatives use a true minus sign (U+2212): "−₹2,500". */
export function formatINR(value: number, opts: { decimals?: number } = {}): string {
  const decimals = opts.decimals ?? (Number.isInteger(value) ? 0 : 2);
  return `₹${groupIndian(value, decimals)}`.replace('₹-', '−₹');
}

/** Other currencies by locale; INR always uses Indian grouping. */
export function formatMoney(value: number, currency = 'INR', locale = 'en-IN'): string {
  if (currency === 'INR') return formatINR(value);
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
}

/** d MMM yyyy, no leading zero, e.g. "1 Jan 2027". Uses local calendar date. */
export function formatDate(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Parses what people type into a date field: "28 Sep 2026", "28 sep 26",
 * "28/09/2026", "28-9-2026", "2026-09-28". Day-first (India). Returns null if invalid.
 */
export function parseDate(input: string): Date | null {
  const s = input.trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = s.match(/^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{2}|\d{4})$/))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = s.match(/^(\d{1,2})[\s\-]+([A-Za-z]{3,9})[\s\-,]+(\d{2}|\d{4})$/))) {
    d = Number(match[1]);
    m = MONTHS.findIndex((mm) => match![2].toLowerCase().startsWith(mm.toLowerCase())) + 1;
    y = Number(match[3]);
    if (m === 0) return null;
  } else {
    return null;
  }
  if (y < 100) y += 2000;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/**
 * Parses a typed time: "9", "930", "9:30", "9.30 pm", "21:30", "12 am".
 * Returns "HH:mm" (24-hour) or null.
 */
export function parseTime(input: string): string | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, '');
  const match = s.match(/^(\d{1,2})(?:[:.]?(\d{2}))?(am|pm|a|p)?$/);
  if (!match) return null;
  let h = Number(match[1]);
  const min = match[2] ? Number(match[2]) : 0;
  const mer = match[3]?.[0];
  if (min > 59) return null;
  if (mer) {
    if (h < 1 || h > 12) return null;
    if (mer === 'a') h = h === 12 ? 0 : h;
    else h = h === 12 ? 12 : h + 12;
  } else if (h > 23) {
    return null;
  }
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** "HH:mm" -> "9:30 am" (12-hour, India default) or "09:30" (24-hour). */
export function formatTime(hhmm: string | null | undefined, hour12 = true): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  if (!hour12) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** File size for upload hints: 1536 -> "1.5 KB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${Number(v.toFixed(1))} ${units[i]}`;
}

/** Initials for avatars: "Divya Raghunathan" -> "DR". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}
