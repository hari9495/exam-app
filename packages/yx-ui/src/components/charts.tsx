import { useId, useLayoutEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { AlertTriangle, ArrowDown, ArrowRight, Minus, Table2, TrendingDown, TrendingUp, BarChart3 } from 'lucide-react';
import { cx } from '../lib/cx';
import { formatINR, groupIndian } from '../lib/format';
import {
  changeInWords,
  formatValue,
  heatStep,
  limitSeries,
  maxValue,
  niceTicks,
  scaleLinear,
  stack,
  suppressGroups,
  trendSummary,
  type ChartSeries,
} from '../lib/chart';
import { Figure, Heading, Icon, VisuallyHidden } from './foundations';
import { Button, Link } from './button';
import { EmptyState, Skeleton } from './feedback';

export type { ChartSeries } from '../lib/chart';

/* ------------------------------------------------------------------ */
/* Shared bits                                                          */
/* ------------------------------------------------------------------ */

/** Measures the plot's width so SVG text never stretches. jsdom has no layout, so it falls back to 600. */
function useWidth(fallback = 600) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    if (!el) return;
    if (el.clientWidth) setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => e.contentRect.width && setW(Math.max(200, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, w] as const;
}

const CHAR_W = 7; // approx. width of a 12 px Plex digit, for label room

function truncate(s: string, px: number) {
  const n = Math.max(3, Math.floor(px / CHAR_W));
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Splits a label at the space nearest its middle: "Over 90 days" → ["Over 90", "days"]. */
function twoLines(s: string): string[] {
  let at = -1;
  for (let i = 0; i < s.length; i++) if (s[i] === ' ' && (at < 0 || Math.abs(i - s.length / 2) < Math.abs(at - s.length / 2))) at = i;
  return at < 0 ? [s] : [s.slice(0, at), s.slice(at + 1)];
}
const LINE_H = 14;

/** Series colour hooks for CSS: palette position, or accent / slate when one series is emphasised (§22). */
function seriesAttrs(i: number, name: string, emphasis?: string) {
  return { 'data-series': i, 'data-tone': emphasis ? (name === emphasis ? 'accent' : 'muted') : undefined };
}

interface Tip {
  x: number;
  y: number;
  text: string;
}

function useTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const bind = (t: Tip) => ({
    onMouseEnter: () => setTip(t),
    onMouseLeave: () => setTip(null),
    onFocus: () => setTip(t),
    onBlur: () => setTip(null),
  });
  const node = tip && (
    <div className="yx-chart__tooltip" aria-hidden="true" style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </div>
  );
  return [bind, node] as const;
}

export interface ChartLegendItem {
  name: string;
  series?: number;
  tone?: 'accent' | 'muted';
}

/** Legend for grouped bars. Lines use direct end labels instead (§22). */
export function ChartLegend({ items }: { items: ChartLegendItem[] }) {
  return (
    <ul className="yx-chart-legend">
      {items.map((it, i) => (
        <li key={it.name} className="yx-chart-legend__item" data-series={it.series ?? i} data-tone={it.tone}>
          <span className="yx-chart-legend__swatch" aria-hidden="true" />
          {it.name}
        </li>
      ))}
    </ul>
  );
}

function legendFor(series: ChartSeries[], emphasis?: string): ReactNode {
  if (series.length < 2) return undefined;
  if (emphasis)
    return (
      <ChartLegend
        items={[
          { name: emphasis, tone: 'accent' },
          { name: 'Other series', tone: 'muted' },
        ]}
      />
    );
  return <ChartLegend items={series.map((s, i) => ({ name: s.name, series: i }))} />;
}

/* ------------------------------------------------------------------ */
/* ChartFrame                                                           */
/* ------------------------------------------------------------------ */

export interface ChartTable {
  head: string[];
  rows: ReactNode[][];
}

export interface ChartFrameProps {
  title: string;
  description?: ReactNode;
  /** Legend, when direct labels are not possible. */
  legend?: ReactNode;
  footnote?: ReactNode;
  loading?: boolean;
  empty?: boolean;
  /** One sentence; default "No data for this period." */
  emptyText?: ReactNode;
  /** Number of groups hidden by small-group suppression (P09). */
  suppressed?: number;
  minGroupSize?: number;
  /** The same data as the chart, for "View as table" (§23). */
  table?: ChartTable;
  view?: 'chart' | 'table';
  defaultView?: 'chart' | 'table';
  onViewChange?: (view: 'chart' | 'table') => void;
  /** Extra header controls (e.g. a period select). */
  actions?: ReactNode;
  /** Skeleton height while loading, px. */
  height?: number;
  className?: string;
  children?: ReactNode;
}

/** Title, description, legend, "View as table", footnote and the data states every chart needs (§23, §26). */
export function ChartFrame({
  title,
  description,
  legend,
  footnote,
  loading,
  empty,
  emptyText = 'No data for this period.',
  suppressed = 0,
  minGroupSize = 5,
  table,
  view: viewProp,
  defaultView = 'chart',
  onViewChange,
  actions,
  height = 240,
  className,
  children,
}: ChartFrameProps) {
  const [own, setOwn] = useState(defaultView);
  const view = viewProp ?? own;
  const setView = (v: 'chart' | 'table') => {
    setOwn(v);
    onViewChange?.(v);
  };
  const id = useId();
  const showBody = !loading && !empty;
  return (
    <figure className={cx('yx-chart', className)} aria-labelledby={`${id}-t`} aria-describedby={description ? `${id}-d` : undefined} aria-busy={loading || undefined}>
      <div className="yx-chart__header">
        <div className="yx-chart__titles">
          <Heading level={4} as="h3" id={`${id}-t`} className="yx-chart__title">
            {title}
          </Heading>
          {description && (
            <p id={`${id}-d`} className="yx-chart__desc">
              {description}
            </p>
          )}
        </div>
        <div className="yx-chart__actions">
          {actions}
          {table && showBody && (
            <Button size="sm" icon={view === 'chart' ? Table2 : BarChart3} onClick={() => setView(view === 'chart' ? 'table' : 'chart')}>
              {view === 'chart' ? 'View as table' : 'View as chart'}
            </Button>
          )}
        </div>
      </div>
      {loading ? (
        <div className="yx-chart__loading">
          <Skeleton height={height} />
          <VisuallyHidden>Loading {title}</VisuallyHidden>
        </div>
      ) : empty ? (
        <EmptyState compact title={emptyText} />
      ) : (
        <>
          {view === 'chart' && legend}
          {view === 'table' && table ? (
            <div className="yx-chart__table-wrap">
              <table className="yx-chart__table">
                <caption className="yx-chart__caption">{title}</caption>
                <thead>
                  <tr>
                    {table.head.map((h, i) => (
                      <th key={i} scope="col">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((r, i) => (
                    <tr key={i}>
                      {r.map((c, j) =>
                        j === 0 ? (
                          <th key={j} scope="row">
                            {c}
                          </th>
                        ) : (
                          <td key={j}>{c}</td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            children
          )}
        </>
      )}
      {(suppressed > 0 || footnote) && !loading && (
        <figcaption className="yx-chart__foot">
          {suppressed > 0 && <p className="yx-chart__note">Groups under {minGroupSize} people are hidden for privacy.</p>}
          {footnote && <div>{footnote}</div>}
        </figcaption>
      )}
    </figure>
  );
}

/** Props every chart shares with its frame. */
export interface ChartCommonProps {
  title: string;
  description?: ReactNode;
  footnote?: ReactNode;
  loading?: boolean;
  emptyText?: ReactNode;
  /** ₹ with Indian grouping on axes, labels, tooltips and table. */
  money?: boolean;
  /** First column heading in the table view, e.g. "Department" or "Month". */
  xLabel?: string;
  defaultView?: 'chart' | 'table';
  actions?: ReactNode;
  minGroupSize?: number;
  className?: string;
}

function frameProps(p: ChartCommonProps) {
  const { title, description, footnote, loading, emptyText, defaultView, actions, minGroupSize, className } = p;
  return { title, description, footnote, loading, emptyText, defaultView, actions, minGroupSize, className };
}

const fmtCell = (v: number | null | undefined, money?: boolean) => (v == null ? '—' : formatValue(v, money));

/* ------------------------------------------------------------------ */
/* BarChart                                                             */
/* ------------------------------------------------------------------ */

export interface BarChartProps extends ChartCommonProps {
  categories: string[];
  /** Up to 8 series; the rest are summed as "Other" (§48). */
  series: ChartSeries[];
  orientation?: 'vertical' | 'horizontal';
  /** Draw the bars horizontally (labels on the y-axis) when the chart is narrower than this, px, so labels aren't cut. */
  horizontalBelow?: number;
  stacked?: boolean;
  /** Name of the series to show in Azure; all others turn slate (§22). */
  emphasis?: string;
  /** Default: on for a single series or stacked totals. */
  valueLabels?: boolean;
  /** Headcount behind each category; groups under minGroupSize are hidden (P09). */
  groupSizes?: number[];
  /** Plot height for vertical bars, px. */
  height?: number;
}

export function BarChart(props: BarChartProps) {
  const { categories, series, orientation: orientationProp = 'vertical', horizontalBelow, stacked = false, emphasis, groupSizes, money, xLabel = 'Category', minGroupSize = 5, height = 240 } = props;
  const [ref, width] = useWidth();
  const orientation = horizontalBelow && width > 0 && width < horizontalBelow ? 'horizontal' : orientationProp;
  const [bind, tipNode] = useTip();

  const { keep, hidden } = suppressGroups(groupSizes, categories.length, minGroupSize);
  const cats = keep.map((i) => categories[i]);
  const ser = limitSeries(series).map((s) => ({ ...s, values: keep.map((i) => s.values[i] ?? null) }));
  const empty = cats.length === 0 || ser.every((s) => s.values.every((v) => v == null));
  const valueLabels = props.valueLabels ?? (ser.length === 1 || stacked);
  const fmt = (v: number) => formatValue(v, money);
  const multi = ser.length > 1;

  const table: ChartTable = {
    head: [xLabel, ...ser.map((s) => s.name), ...(stacked && multi ? ['Total'] : [])],
    rows: cats.map((c, ci) => [
      c,
      ...ser.map((s) => fmtCell(s.values[ci], money)),
      ...(stacked && multi ? [fmt(ser.reduce((a, s) => a + (s.values[ci] ?? 0), 0))] : []),
    ]),
  };

  let svg: ReactNode = null;
  if (!empty) {
    const stacks = stacked ? stack(ser) : null;
    const ticks = niceTicks(0, maxValue(ser, stacked), 4);
    const top = ticks[ticks.length - 1];
    const tickW = Math.max(...ticks.map((t) => fmt(t).length)) * CHAR_W + 8;
    const vertical = orientation === 'vertical';
    const perBar = stacked ? 1 : ser.length;

    // category band along one axis, values along the other
    const m = vertical
      ? { l: tickW, r: 8, t: 20, b: 28 }
      : { l: Math.min(180, Math.max(...cats.map((c) => c.length)) * CHAR_W + 12), r: valueLabels ? tickW + 8 : 16, t: 8, b: 24 };
    // Vertical category labels too long for their slot wrap onto two lines instead of being cut ("Over 90 d…").
    const tooLong = (c: string) => c.length * CHAR_W > (width - m.l - m.r) / cats.length - 4;
    const wrapCats = vertical && cats.some(tooLong);
    if (wrapCats) m.b += LINE_H;
    const rowH = vertical ? 0 : stacked ? 32 : perBar * 16 + 16;
    const H = vertical ? height : m.t + cats.length * rowH + m.b;
    const plotW = width - m.l - m.r;
    const plotH = H - m.t - m.b;
    const band = (vertical ? plotW : plotH) / cats.length;
    const inner = band * (vertical ? 0.72 : 0.7);
    const thick = inner / perBar;
    const val = vertical ? scaleLinear([0, top], [m.t + plotH, m.t]) : scaleLinear([0, top], [m.l, m.l + plotW]);
    // Vertical value labels must fit their bar's slot: full figure, else a short one ("13.9k"), else none (the tooltip and table keep it).
    const slot = band / (stacks ? 1 : perBar);
    const short = (v: number) => {
      const a = Math.abs(v);
      const s = a >= 1e5 ? `${(v / 1e5).toFixed(1)}L` : a >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : String(Math.round(v));
      return money ? `₹${s}` : s;
    };
    const widest = (f: (v: number) => string) => Math.max(...ser.flatMap((s) => s.values.map((v) => (v == null ? 0 : f(v).length)))) * CHAR_W + 4;
    const labelFmt = !vertical || widest(fmt) <= slot ? fmt : widest(short) <= slot ? short : null;
    const showLabels = valueLabels && labelFmt !== null;

    const bars: ReactNode[] = [];
    const labels: ReactNode[] = [];
    ser.forEach((s, si) =>
      cats.forEach((c, ci) => {
        const v = s.values[ci];
        if (v == null) return;
        const [a, b] = stacks ? stacks[si][ci] : [0, v];
        const off = m[vertical ? 'l' : 't'] + ci * band + (band - inner) / 2 + (stacks ? 0 : si * thick);
        const p0 = val(a);
        const p1 = val(b);
        const rect = vertical
          ? { x: off, y: p1, width: Math.max(1, thick - 2), height: Math.max(0, p0 - p1) }
          : { x: p0, y: off, width: Math.max(0, p1 - p0), height: Math.max(1, thick - 2) };
        const label = `${c}${multi ? `, ${s.name}` : ''}: ${fmt(v)}`;
        const tip = vertical ? { x: rect.x + rect.width / 2, y: rect.y, text: label } : { x: rect.x + rect.width, y: rect.y + rect.height / 2, text: label };
        bars.push(
          <rect
            key={`${si}-${ci}`}
            className="yx-chart__bar"
            data-orient={orientation}
            {...seriesAttrs(si, s.name, emphasis)}
            {...rect}
            rx={2}
            tabIndex={0}
            role="img"
            aria-label={label}
            {...bind(tip)}
          />,
        );
        if (showLabels && !stacks)
          labels.push(
            vertical ? (
              <text key={`l${si}-${ci}`} className="yx-chart__value" x={rect.x + rect.width / 2} y={rect.y - 4} textAnchor="middle">
                {labelFmt!(v)}
              </text>
            ) : (
              <text key={`l${si}-${ci}`} className="yx-chart__value" x={rect.x + rect.width + 4} y={rect.y + rect.height / 2} dominantBaseline="central">
                {fmt(v)}
              </text>
            ),
          );
      }),
    );
    if (showLabels && stacks)
      cats.forEach((_, ci) => {
        const total = ser.reduce((acc, s) => acc + (s.values[ci] ?? 0), 0);
        const mid = m[vertical ? 'l' : 't'] + ci * band + band / 2;
        labels.push(
          vertical ? (
            <text key={`t${ci}`} className="yx-chart__value" x={mid} y={val(total) - 4} textAnchor="middle">
              {labelFmt!(total)}
            </text>
          ) : (
            <text key={`t${ci}`} className="yx-chart__value" x={val(total) + 4} y={mid} dominantBaseline="central">
              {fmt(total)}
            </text>
          ),
        );
      });

    svg = (
      <svg className="yx-chart__svg" width={width} height={H} role="group" aria-label={props.title}>
        <g aria-hidden="true">
          {ticks.map((t) =>
            vertical ? (
              <g key={t}>
                <line className="yx-chart__grid" x1={m.l} x2={width - m.r} y1={val(t)} y2={val(t)} />
                <text className="yx-chart__axis" x={m.l - 8} y={val(t)} textAnchor="end" dominantBaseline="central">
                  {fmt(t)}
                </text>
              </g>
            ) : (
              <g key={t}>
                <line className="yx-chart__grid" x1={val(t)} x2={val(t)} y1={m.t} y2={H - m.b} />
                <text className="yx-chart__axis" x={val(t)} y={H - 6} textAnchor="middle">
                  {fmt(t)}
                </text>
              </g>
            ),
          )}
          {cats.map((c, ci) => {
            const mid = m[vertical ? 'l' : 't'] + ci * band + band / 2;
            const lines = wrapCats && tooLong(c) ? twoLines(c) : [c];
            return vertical ? (
              <text key={c} className="yx-chart__axis" x={mid} y={H - 8 - (lines.length - 1) * LINE_H} textAnchor="middle">
                <title>{c}</title>
                {lines.length === 1
                  ? truncate(c, band - 4)
                  : lines.map((l, li) => (
                      <tspan key={li} x={mid} dy={li ? LINE_H : 0}>
                        {truncate(l, band - 4)}
                      </tspan>
                    ))}
              </text>
            ) : (
              <text key={c} className="yx-chart__axis" data-strong x={m.l - 8} y={mid} textAnchor="end" dominantBaseline="central">
                <title>{c}</title>
                {truncate(c, m.l - 12)}
              </text>
            );
          })}
        </g>
        <g>{bars}</g>
        <g aria-hidden="true">{labels}</g>
      </svg>
    );
  }

  return (
    <ChartFrame {...frameProps(props)} empty={empty} suppressed={hidden} minGroupSize={minGroupSize} table={table} legend={legendFor(ser, emphasis)} height={height}>
      <div ref={ref} className="yx-chart__plot">
        {svg}
        {tipNode}
      </div>
    </ChartFrame>
  );
}

/* ------------------------------------------------------------------ */
/* LineChart / AreaChart                                                */
/* ------------------------------------------------------------------ */

export interface LineChartProps extends ChartCommonProps {
  /** X positions in order, e.g. months. */
  categories: string[];
  /** Nulls leave a gap in the line. Up to 8 series. */
  series: ChartSeries[];
  emphasis?: string;
  /** Dashed reference line with a label, e.g. { value: 75, label: 'Target 75%' }. */
  target?: { value: number; label: string };
  /** Lowest value on the axis; default 0. */
  yMin?: number;
  height?: number;
  /** Fill under each line (AreaChart). */
  area?: boolean;
}

export function LineChart(props: LineChartProps) {
  const { categories: cats, series, emphasis, target, yMin = 0, height = 240, area, money, xLabel = 'Period' } = props;
  const [ref, width] = useWidth();
  const [bind, tipNode] = useTip();
  const ser = limitSeries(series);
  const empty = cats.length === 0 || ser.every((s) => s.values.every((v) => v == null));
  const fmt = (v: number) => formatValue(v, money);
  const multi = ser.length > 1;

  const table: ChartTable = {
    head: [xLabel, ...ser.map((s) => s.name)],
    rows: cats.map((c, ci) => [c, ...ser.map((s) => fmtCell(s.values[ci], money))]),
  };

  let svg: ReactNode = null;
  if (!empty) {
    const ticks = niceTicks(yMin, Math.max(maxValue(ser), target?.value ?? 0), 4);
    const tickW = Math.max(...ticks.map((t) => fmt(t).length)) * CHAR_W + 8;
    const endW = multi ? Math.min(180, Math.max(...ser.map((s) => s.name.length)) * CHAR_W + 32) : 12;
    const m = { l: tickW, r: endW, t: 12, b: 28 };
    const H = height;
    const plotW = width - m.l - m.r;
    const x = (i: number) => m.l + (cats.length === 1 ? plotW / 2 : (i * plotW) / (cats.length - 1));
    const y = scaleLinear([ticks[0], ticks[ticks.length - 1]], [H - m.b, m.t]);
    const base = y(ticks[0]);
    const every = Math.max(1, Math.ceil((cats.length * 48) / plotW)); // skip x labels that would collide

    // direct end labels, nudged apart vertically
    const ends = ser
      .map((s, si) => {
        let li = s.values.length - 1;
        while (li >= 0 && s.values[li] == null) li--;
        return li < 0 ? null : { si, name: s.name, x: x(li), y: y(s.values[li]!) };
      })
      .filter((e): e is { si: number; name: string; x: number; y: number } => e !== null)
      .sort((a, b) => a.y - b.y);
    ends.forEach((e, i) => {
      if (i > 0) e.y = Math.max(e.y, ends[i - 1].y + 14);
    });

    svg = (
      <svg className="yx-chart__svg" width={width} height={H} role="group" aria-label={props.title}>
        <g aria-hidden="true">
          {ticks.map((t) => (
            <g key={t}>
              <line className="yx-chart__grid" x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} />
              <text className="yx-chart__axis" x={m.l - 8} y={y(t)} textAnchor="end" dominantBaseline="central">
                {fmt(t)}
              </text>
            </g>
          ))}
          {cats.map((c, ci) =>
            ci % every === 0 ? (
              <text key={c} className="yx-chart__axis" x={x(ci)} y={H - 8} textAnchor="middle">
                {c}
              </text>
            ) : null,
          )}
          {target && (
            <g className="yx-chart__target">
              <line x1={m.l} x2={width - m.r} y1={y(target.value)} y2={y(target.value)} />
              <text x={m.l + 4} y={y(target.value) - 6}>
                {target.label}
              </text>
            </g>
          )}
        </g>
        {ser.map((s, si) => {
          const runs: [number, number][][] = [[]];
          s.values.forEach((v, i) => {
            if (v == null) runs.push([]);
            else runs[runs.length - 1].push([x(i), y(v)]);
          });
          const segs = runs.filter((r) => r.length > 0);
          return (
            <g key={s.name} {...seriesAttrs(si, s.name, emphasis)} className="yx-chart__series">
              {area &&
                segs.map((r, i) => (
                  <path key={`a${i}`} className="yx-chart__area" aria-hidden="true" d={`M${r[0][0]},${base} ${r.map(([px, py]) => `L${px},${py}`).join(' ')} L${r[r.length - 1][0]},${base} Z`} />
                ))}
              {segs.map((r, i) => (
                <path key={i} className="yx-chart__line" aria-hidden="true" pathLength={1} d={r.map(([px, py], j) => `${j ? 'L' : 'M'}${px},${py}`).join(' ')} />
              ))}
              {s.values.map((v, ci) => {
                if (v == null) return null;
                const label = `${multi ? `${s.name}, ` : ''}${cats[ci]}: ${fmt(v)}`;
                return <circle key={ci} className="yx-chart__point" cx={x(ci)} cy={y(v)} r={3.5} tabIndex={0} role="img" aria-label={label} {...bind({ x: x(ci), y: y(v) - 6, text: label })} />;
              })}
            </g>
          );
        })}
        {multi && (
          <g aria-hidden="true">
            {ends.map((e) => (
              <g key={e.name} {...seriesAttrs(e.si, e.name, emphasis)}>
                <rect className="yx-chart__end-swatch" x={e.x + 8} y={e.y - 1} width={8} height={2} />
                <text className="yx-chart__end-label" x={e.x + 20} y={e.y} dominantBaseline="central">
                  {truncate(e.name, m.r - 24 + CHAR_W)}
                </text>
              </g>
            ))}
          </g>
        )}
      </svg>
    );
  }

  return (
    <ChartFrame
      {...frameProps(props)}
      empty={empty}
      table={table}
      height={height}
      footnote={
        target || props.footnote ? (
          <>
            {target && <span>{target.label}. </span>}
            {props.footnote}
          </>
        ) : undefined
      }
    >
      <div ref={ref} className="yx-chart__plot">
        {svg}
        {tipNode}
      </div>
    </ChartFrame>
  );
}

export function AreaChart(props: Omit<LineChartProps, 'area'>) {
  return <LineChart {...props} area />;
}

/* ------------------------------------------------------------------ */
/* DonutChart (≤ 4 slices)                                              */
/* ------------------------------------------------------------------ */

export interface DonutChartProps extends ChartCommonProps {
  /** At most 4 slices (§22). More is a mistake: a warning is logged and the rest are grouped as "Other". */
  slices: { label: string; value: number }[];
  height?: number;
}

function arcPath(cx: number, cy: number, r: number, ri: number, a0: number, a1: number) {
  a1 = Math.min(a1, a0 + Math.PI * 2 - 0.0001);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const p = (rad: number, a: number) => `${cx + rad * Math.sin(a)},${cy - rad * Math.cos(a)}`;
  return `M${p(r, a0)} A${r},${r} 0 ${large} 1 ${p(r, a1)} L${p(ri, a1)} A${ri},${ri} 0 ${large} 0 ${p(ri, a0)} Z`;
}

export function DonutChart(props: DonutChartProps) {
  const { money, height = 220, xLabel = 'Group' } = props;
  let slices = props.slices;
  if (slices.length > 4) {
    console.warn(`DonutChart: ${slices.length} slices given; use at most 4 (DESIGN-SYSTEM §22). Use a BarChart instead.`);
    slices = [...slices.slice(0, 3), { label: 'Other', value: slices.slice(3).reduce((a, s) => a + s.value, 0) }];
  }
  const [ref, width] = useWidth();
  const [bind, tipNode] = useTip();
  const total = slices.reduce((a, s) => a + s.value, 0);
  const empty = total <= 0;
  const pct = (v: number) => `${Math.round((v / total) * 100)}%`;
  const fmt = (v: number) => formatValue(v, money);
  const table: ChartTable = { head: [xLabel, 'Value', 'Share'], rows: slices.map((s) => [s.label, fmt(s.value), empty ? '—' : pct(s.value)]) };

  let svg: ReactNode = null;
  if (!empty) {
    // Narrow (phone): labels outside the ring would be cut off, so they move to a legend below.
    const narrow = width < 440;
    const cx = width / 2;
    const cy = height / 2;
    const r = height / 2 - (narrow ? 8 : 28);
    let a = 0;
    svg = (
      <svg className="yx-chart__svg yx-chart__donut" width={width} height={height} role="group" aria-label={props.title}>
        {slices.map((s, i) => {
          const a0 = a;
          a += (s.value / total) * Math.PI * 2;
          const mid = (a0 + a) / 2;
          const lx = cx + (r + 12) * Math.sin(mid);
          const ly = cy - (r + 12) * Math.cos(mid);
          const label = `${s.label}: ${fmt(s.value)}, ${pct(s.value)}`;
          return (
            <g key={s.label} data-series={i}>
              <path className="yx-chart__slice" d={arcPath(cx, cy, r, r * 0.62, a0, a)} tabIndex={0} role="img" aria-label={label} {...bind({ x: lx, y: ly, text: label })} />
              {!narrow && <text className="yx-chart__value" aria-hidden="true" x={lx} y={ly} textAnchor={Math.sin(mid) >= 0 ? 'start' : 'end'} dominantBaseline="central">
                {s.label} {pct(s.value)}
              </text>}
            </g>
          );
        })}
        <text className="yx-chart__donut-total" aria-hidden="true" x={cx} y={cy - 6} textAnchor="middle">
          {fmt(total)}
        </text>
        <text className="yx-chart__axis" aria-hidden="true" x={cx} y={cy + 12} textAnchor="middle">
          Total
        </text>
      </svg>
    );
  }
  return (
    <ChartFrame {...frameProps(props)} empty={empty} table={table} height={height}>
      <div ref={ref} className="yx-chart__plot">
        {svg}
        {tipNode}
      </div>
      {!empty && width > 0 && width < 440 && <ChartLegend items={slices.map((s, i) => ({ name: `${s.label} ${pct(s.value)}`, series: i }))} />}
    </ChartFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Heatmap + CapacityHeatmap                                            */
/* ------------------------------------------------------------------ */

const STEPS = 5;

interface HeatCell {
  text: ReactNode;
  step?: number;
  over?: boolean;
}

function HeatTable({ columns, rows, rowHeader }: { columns: string[]; rows: { label: ReactNode; cells: HeatCell[] }[]; rowHeader: string }) {
  return (
    <div className="yx-heatmap__wrap">
      <table className="yx-heatmap">
        <thead>
          <tr>
            <th scope="col" className="yx-heatmap__corner">
              {rowHeader}
            </th>
            {columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <th scope="row">{r.label}</th>
              {r.cells.map((c, j) => (
                <td key={j} className="yx-heatmap__cell" data-step={c.step} data-over={c.over || undefined} data-empty={c.step === undefined && !c.over ? '' : undefined}>
                  {c.text}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HeatLegend({ labels, over }: { labels: string[]; over?: string }) {
  return (
    <ul className="yx-heatmap__legend" aria-label="Colour scale">
      {labels.map((l, i) => (
        <li key={l}>
          <span className="yx-heatmap__swatch" data-step={i} aria-hidden="true" />
          {l}
        </li>
      ))}
      {over && (
        <li>
          <span className="yx-heatmap__swatch" data-over aria-hidden="true" />
          {over}
        </li>
      )}
    </ul>
  );
}

export interface HeatmapRow {
  label: string;
  values: (number | null)[];
  /** People behind this row; rows under minGroupSize are hidden (P09). */
  groupSize?: number;
}

export interface HeatmapProps extends ChartCommonProps {
  columns: string[];
  rows: HeatmapRow[];
  /** Top of the colour scale; default the largest value. */
  max?: number;
  /** Cell text, e.g. v => `${v}%`. Defaults to Indian grouping / ₹. */
  format?: (v: number) => string;
}

/** Rows × columns on a sequential Azure scale; the value is always written in the cell (§3, §48). */
export function Heatmap(props: HeatmapProps) {
  const { columns, rows, money, xLabel = '', minGroupSize = 5 } = props;
  const fmt = props.format ?? ((v: number) => formatValue(v, money));
  const { keep, hidden } = suppressGroups(
    rows.map((r) => r.groupSize),
    rows.length,
    minGroupSize,
  );
  const shown = keep.map((i) => rows[i]);
  const max = props.max ?? Math.max(0, ...shown.flatMap((r) => r.values.filter((v): v is number => v != null)));
  const empty = shown.length === 0 || columns.length === 0;
  const table: ChartTable = { head: [xLabel, ...columns], rows: shown.map((r) => [r.label, ...r.values.map((v) => (v == null ? '—' : fmt(v)))]) };
  const legend = Array.from({ length: STEPS }, (_, i) => `${fmt((max * i) / STEPS)}–${fmt((max * (i + 1)) / STEPS)}`);
  return (
    <ChartFrame {...frameProps(props)} empty={empty} suppressed={hidden} minGroupSize={minGroupSize} table={table} legend={<HeatLegend labels={legend} />}>
      <HeatTable
        columns={columns}
        rowHeader={xLabel}
        rows={shown.map((r) => ({ label: r.label, cells: r.values.map((v) => (v == null ? { text: '—' } : { text: fmt(v), step: heatStep(v, max, STEPS) })) }))}
      />
    </ChartFrame>
  );
}

export interface CapacityPerson {
  name: string;
  role?: string;
  /** One entry per week: hours allocated to projects and hours available (expected minus leave and holidays). */
  weeks: { allocated: number; available: number }[];
}

export interface CapacityHeatmapProps extends Omit<ChartCommonProps, 'money'> {
  /** Week labels, e.g. "5 Oct". */
  weeks: string[];
  people: CapacityPerson[];
}

function capacityText(w: { allocated: number; available: number }) {
  const over = w.allocated - w.available;
  return { over: over > 0 ? over : 0, text: `${groupIndian(w.allocated)} of ${groupIndian(w.available)} h` };
}

/** M12 capacity board: people × weeks, allocated vs available; over-allocation in the warning tone with words (YX-PRJ-06). */
export function CapacityHeatmap(props: CapacityHeatmapProps) {
  const { weeks, people } = props;
  const empty = people.length === 0 || weeks.length === 0;
  const table: ChartTable = {
    head: ['Person', ...weeks],
    rows: people.map((p) => [
      p.name,
      ...p.weeks.map((w) => {
        const c = capacityText(w);
        return c.over ? `${c.text}, over by ${groupIndian(c.over)} h` : c.text;
      }),
    ]),
  };
  return (
    <ChartFrame
      {...frameProps(props)}
      empty={empty}
      table={table}
      legend={<HeatLegend labels={['0–20%', '20–40%', '40–60%', '60–80%', '80–100% allocated']} over="Over-allocated" />}
    >
      <HeatTable
        columns={weeks}
        rowHeader="Person"
        rows={people.map((p) => ({
          label: (
            <span className="yx-heatmap__person">
              <span>{p.name}</span>
              {p.role && <span className="yx-heatmap__sub">{p.role}</span>}
            </span>
          ),
          cells: p.weeks.map((w) => {
            const c = capacityText(w);
            return c.over
              ? {
                  over: true,
                  text: (
                    <>
                      <span>{c.text}</span>
                      <span className="yx-heatmap__over">
                        <Icon icon={AlertTriangle} />
                        Over by {groupIndian(c.over)} h
                      </span>
                    </>
                  ),
                }
              : w.available === 0
                ? { text: 'Not available' }
                : { text: c.text, step: heatStep(w.allocated, w.available, STEPS) };
          }),
        }))}
      />
    </ChartFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Funnel                                                               */
/* ------------------------------------------------------------------ */

export interface FunnelProps extends ChartCommonProps {
  stages: { label: string; count: number }[];
}

const pctOf = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');

/** Hiring funnel: count per stage and the share that moved on from the stage before. */
export function Funnel(props: FunnelProps) {
  const { stages, xLabel = 'Stage' } = props;
  const first = stages[0]?.count ?? 0;
  const empty = stages.length === 0 || first === 0;
  const table: ChartTable = {
    head: [xLabel, 'Candidates', 'Moved on from previous stage'],
    rows: stages.map((s, i) => [s.label, groupIndian(s.count), i === 0 ? '—' : pctOf(s.count, stages[i - 1].count)]),
  };
  return (
    <ChartFrame {...frameProps(props)} empty={empty} table={table}>
      <ol className="yx-funnel">
        {stages.map((s, i) => (
          <li key={s.label} className="yx-funnel__stage">
            {i > 0 && (
              <p className="yx-funnel__conv">
                <Icon icon={ArrowDown} />
                {pctOf(s.count, stages[i - 1].count)} moved on
              </p>
            )}
            <div className="yx-funnel__row">
              <span className="yx-funnel__label">{s.label}</span>
              <span className="yx-funnel__track">
                <span className="yx-funnel__bar" style={{ width: `${Math.max(1, (s.count / first) * 100)}%` }} />
              </span>
              <span className="yx-funnel__count">{groupIndian(s.count)}</span>
            </div>
          </li>
        ))}
      </ol>
    </ChartFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Gauge                                                                */
/* ------------------------------------------------------------------ */

export interface GaugeProps {
  label: string;
  value: number;
  target?: number;
  /** Top of the scale; default 100 for percent, otherwise the larger of value and target. */
  max?: number;
  format?: 'percent' | 'number' | 'money';
  variant?: 'semi' | 'bar';
  className?: string;
}

/** Single progress-to-target figure, written in words as well as drawn. */
export function Gauge({ label, value, target, max, format = 'percent', variant = 'semi', className }: GaugeProps) {
  const f = (v: number) => (format === 'percent' ? `${Number(v.toFixed(1))}%` : format === 'money' ? formatINR(v) : groupIndian(v));
  const top = max ?? (format === 'percent' ? 100 : Math.max(value, target ?? 0) || 1);
  const frac = Math.max(0, Math.min(1, value / top));
  const tFrac = target === undefined ? null : Math.max(0, Math.min(1, target / top));
  const status = target === undefined ? null : value >= target ? 'Target met' : `${f(target - value).replace('%', '')}${format === 'percent' ? ' points' : ''} below target`;
  const valueText = `${f(value)}${target !== undefined ? `, target ${f(target)}` : ''}`;

  return (
    <div className={cx('yx-gauge', className)} data-variant={variant}>
      <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={top} aria-valuenow={value} aria-valuetext={valueText} className="yx-gauge__graphic">
        {variant === 'semi' ? (
          <svg viewBox="0 0 200 112" className="yx-gauge__svg" aria-hidden="true">
            <path className="yx-gauge__track" d="M 20 100 A 80 80 0 0 1 180 100" pathLength={1} />
            <path className="yx-gauge__fill" d="M 20 100 A 80 80 0 0 1 180 100" pathLength={1} style={{ strokeDasharray: `${frac} 1` }} />
            {tFrac !== null && (
              <line
                className="yx-gauge__target"
                x1={100 - 66 * Math.cos(Math.PI * tFrac)}
                y1={100 - 66 * Math.sin(Math.PI * tFrac)}
                x2={100 - 94 * Math.cos(Math.PI * tFrac)}
                y2={100 - 94 * Math.sin(Math.PI * tFrac)}
              />
            )}
          </svg>
        ) : (
          <span className="yx-gauge__bar" aria-hidden="true">
            <span className="yx-gauge__bar-fill" style={{ width: `${frac * 100}%` }} />
            {tFrac !== null && <span className="yx-gauge__bar-target" style={{ left: `${tFrac * 100}%` }} />}
          </span>
        )}
      </div>
      <div className="yx-gauge__text">
        <span className="yx-gauge__label">{label}</span>
        <Figure size="md">{f(value)}</Figure>
        {target !== undefined && (
          <span className="yx-gauge__target-text">
            Target {f(target)} · {status}
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sparkline + StatCard                                                 */
/* ------------------------------------------------------------------ */

export interface SparklineProps {
  values: number[];
  /** What is measured, e.g. "Headcount over 6 months" — used in the spoken summary. */
  label: string;
  money?: boolean;
  width?: number;
  height?: number;
}

/** Tiny trend, no axes. Screen readers hear "Headcount rose from 212 to 248". */
export function Sparkline({ values, label, money, width = 96, height = 28 }: SparklineProps) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = scaleLinear([0, values.length - 1], [2, width - 4]);
  const y = scaleLinear(lo === hi ? [lo - 1, hi + 1] : [lo, hi], [height - 3, 3]);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  return (
    <svg className="yx-sparkline" width={width} height={height} role="img" aria-label={trendSummary(values, label, money)}>
      <path className="yx-chart__line" pathLength={1} d={d} />
      <circle className="yx-sparkline__end" cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={2.5} />
    </svg>
  );
}

export interface StatCardProps {
  label: string;
  value: number;
  money?: boolean;
  /** Written after the number and in the change text, e.g. "days". */
  unit?: string;
  /** Value last period, for the change in words. */
  previous?: number;
  /** "August", "last quarter". */
  previousLabel?: string;
  /** Recent values, oldest first, for the sparkline. */
  trend?: number[];
  /** Required: never a number the user cannot drill into (§22). e.g. { label: 'View 248 employees', href: '/people' }. */
  drill: { label: string; href: string; onClick?: (e: MouseEvent<HTMLAnchorElement>) => void };
  loading?: boolean;
  /** Hide the amount and its change ("Hide amounts" on a shared screen); the label and drill link stay. */
  masked?: boolean;
  className?: string;
}

const CHANGE_ICON = { up: TrendingUp, down: TrendingDown, same: Minus } as const;

export function StatCard({ label, value, money, unit, previous, previousLabel = 'last period', trend, drill, loading, masked, className }: StatCardProps) {
  if (loading)
    return (
      <section className={cx('yx-stat', className)} aria-busy="true" aria-label={label}>
        <span className="yx-stat__label">{label}</span>
        <Skeleton width="50%" height={28} />
        <Skeleton width="70%" />
        <VisuallyHidden>Loading {label}</VisuallyHidden>
      </section>
    );
  const change = previous === undefined || masked ? null : changeInWords(value, previous, previousLabel, { money, unit });
  return (
    <section className={cx('yx-stat', className)} aria-label={label}>
      <span className="yx-stat__label">{label}</span>
      <div className="yx-stat__main">
        <Figure size="md" className="yx-stat__figure">
          {masked ? (
            <>
              <span aria-hidden="true">{money ? '₹ ••••••' : '••'}</span>
              <VisuallyHidden>Amount hidden</VisuallyHidden>
            </>
          ) : (
            <>
              {money ? formatINR(value) : groupIndian(value)}
              {unit && <span className="yx-stat__unit">{unit === '%' ? unit : ` ${unit}`}</span>}
            </>
          )}
        </Figure>
        {trend && !masked && <Sparkline values={trend} label={label} money={money} />}
      </div>
      {change && (
        <p className="yx-stat__change" data-direction={change.direction}>
          <Icon icon={CHANGE_ICON[change.direction]} />
          {change.text}
        </p>
      )}
      <Link className="yx-stat__drill" href={drill.href} onClick={drill.onClick}>
        {drill.label}
        <Icon icon={ArrowRight} />
      </Link>
    </section>
  );
}

