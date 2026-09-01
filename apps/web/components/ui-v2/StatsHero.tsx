'use client';

// Adapted from 21st.dev "Advanced Stats" (uilayout): a hero area-chart panel + a goal-progress
// card + a note card + a 4-KPI pill row. Retoned to Azure; recharts (its declared chart dep) draws
// the area. The proprietary scroll-reveal util is omitted (non-essential).
import { Area, AreaChart, ResponsiveContainer, XAxis, Tooltip } from 'recharts';

export interface HeroKpi { label: string; value: string | number; change: string; up: boolean }

export function StatsHero({
  chartTitle, chartCaption, chartTotal, series,
  goalLabel, goalValue, goalTarget, goalPct,
  noteTitle, noteBody, kpis,
}: {
  chartTitle: string; chartCaption: string; chartTotal: string; series: { label: string; value: number }[];
  goalLabel: string; goalValue: string; goalTarget: string; goalPct: number;
  noteTitle: string; noteBody: React.ReactNode; kpis: HeroKpi[];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }} className="wf-hero-grid">
        {/* Main chart panel */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--hair)', borderRadius: 16, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>{chartTitle}</p>
              <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{chartCaption}</p>
            </div>
            <span style={{ fontFamily: 'var(--font-disp)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.02em', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{chartTotal}</span>
          </div>
          <div style={{ height: 170, marginTop: 14 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="wf-hero-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.26} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
                <Tooltip cursor={{ stroke: 'var(--hair)' }} contentStyle={{ background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} fill="url(#wf-hero-area)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right column: goal + note */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'var(--ink)', color: 'var(--paper)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1 }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--muted)', margin: '0 0 6px' }}>Primary goal</p>
              <h4 style={{ fontFamily: 'var(--font-disp)', fontWeight: 600, fontSize: 18, letterSpacing: '-0.01em', margin: 0 }}>{goalLabel}</h4>
            </div>
            <div style={{ marginTop: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--font-disp)', fontWeight: 700, fontSize: 26, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{goalValue}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Target: {goalTarget}</span>
              </div>
              <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${goalPct}%`, background: 'var(--org-primary)', borderRadius: 99 }} />
              </div>
            </div>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--hair)', borderRadius: 16, padding: 18 }}>
            <h4 style={{ fontFamily: 'var(--font-disp)', fontWeight: 600, fontSize: 14, color: 'var(--ink)', margin: '0 0 6px' }}>{noteTitle}</h4>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>{noteBody}</p>
          </div>
        </div>
      </div>

      {/* KPI pill row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }} className="wf-hero-kpis">
        {kpis.map((kpi) => (
          <div key={kpi.label} style={{ background: 'var(--surface)', border: '1px solid var(--hair)', borderRadius: 14, padding: '16px 18px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', margin: '0 0 8px' }}>{kpi.label}</p>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-disp)', fontWeight: 700, fontSize: 24, letterSpacing: '-0.02em', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{kpi.value}</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 7px', borderRadius: 5, color: kpi.up ? 'var(--success)' : 'var(--danger)', background: kpi.up ? 'color-mix(in srgb, var(--success) 12%, transparent)' : 'color-mix(in srgb, var(--danger) 12%, transparent)' }}>{kpi.change}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
