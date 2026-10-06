// Pure chart maths (§23, §48): nice ticks, scales, stacking, "Other" grouping, small-group suppression (P09 YX-MET-04).
import { formatINR, groupIndian } from './format';

export interface ChartSeries {
  name: string;
  /** One value per category; null = missing (a gap in lines, nothing drawn in bars). */
  values: (number | null)[];
}

/** 1, 2, 2.5 or 5 × a power of ten, so axis labels read cleanly. */
export function niceStep(range: number, count: number): number {
  const raw = range / Math.max(1, count);
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

/** Ticks covering [min, max], always including 0 for bar-style axes when min ≥ 0. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) max = min === 0 ? 1 : min + Math.abs(min);
  const step = niceStep(max - min, count);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

/** Axis / label text with Indian grouping (§35); ₹ when money. */
export function formatValue(v: number, money = false): string {
  return money ? formatINR(Math.round(v)) : groupIndian(Number.isInteger(v) ? v : Number(v.toFixed(1)));
}

/** Linear scale from a domain to a pixel range. */
export function scaleLinear([d0, d1]: [number, number], [r0, r1]: [number, number]) {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v: number) => r0 + (v - d0) * k;
}

/** Stacked extents per series per category: out[s][c] = [start, end]. Nulls count as 0. */
export function stack(series: ChartSeries[]): [number, number][][] {
  const n = Math.max(0, ...series.map((s) => s.values.length));
  const base = Array<number>(n).fill(0);
  return series.map((s) =>
    base.map((b, c) => {
      const end = b + (s.values[c] ?? 0);
      base[c] = end;
      return [b, end] as [number, number];
    }),
  );
}

/** More than `max` series: keep the first max-1 and sum the rest as "Other" (§48). */
export function limitSeries(series: ChartSeries[], max = 8): ChartSeries[] {
  if (series.length <= max) return series;
  const rest = series.slice(max - 1);
  const n = Math.max(...rest.map((s) => s.values.length));
  const values = Array.from({ length: n }, (_, i) => {
    const vs = rest.map((s) => s.values[i]).filter((v): v is number => v != null);
    return vs.length ? vs.reduce((a, b) => a + b, 0) : null;
  });
  return [...series.slice(0, max - 1), { name: 'Other', values }];
}

/** Indexes of groups big enough to show; groups under `min` people are hidden (P09 Q2, default 5). */
export function suppressGroups(sizes: (number | undefined)[] | undefined, count: number, min = 5): { keep: number[]; hidden: number } {
  const keep: number[] = [];
  for (let i = 0; i < count; i++) if (sizes?.[i] === undefined || sizes[i]! >= min) keep.push(i);
  return { keep, hidden: count - keep.length };
}

/** Largest value across series (stacked = largest column total). */
export function maxValue(series: ChartSeries[], stacked = false): number {
  if (stacked) return Math.max(0, ...stack(series).flatMap((s) => s.map(([, e]) => e)));
  return Math.max(0, ...series.flatMap((s) => s.values.filter((v): v is number => v != null)));
}

export type ChangeDirection = 'up' | 'down' | 'same';

/** "4 more than August", "₹1,20,000 less than August", "Same as August" (§22). */
export function changeInWords(
  current: number,
  previous: number,
  previousLabel: string,
  opts: { money?: boolean; unit?: string } = {},
): { text: string; direction: ChangeDirection } {
  const diff = current - previous;
  if (diff === 0) return { text: `Same as ${previousLabel}`, direction: 'same' };
  const abs = Math.abs(diff);
  const amount = opts.money ? formatINR(abs) : `${formatValue(abs)}${!opts.unit ? '' : opts.unit === '%' ? '%' : ` ${opts.unit}`}`;
  const word = diff > 0 ? 'more' : opts.money || opts.unit ? 'less' : 'fewer';
  return { text: `${amount} ${word} than ${previousLabel}`, direction: diff > 0 ? 'up' : 'down' };
}

/** Sentence for a sparkline's aria-label: "Headcount rose from 212 to 248". */
export function trendSummary(values: number[], label: string, money = false): string {
  if (values.length === 0) return `${label}: no data`;
  const first = values[0];
  const last = values[values.length - 1];
  const f = (v: number) => formatValue(v, money);
  if (last === first) return `${label} stayed at ${f(last)}`;
  return `${label} ${last > first ? 'rose' : 'fell'} from ${f(first)} to ${f(last)}`;
}

/** Sequential colour step 0…steps-1 for a heatmap cell. */
export function heatStep(value: number, max: number, steps = 5): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.min(steps - 1, Math.floor((value / max) * steps));
}
