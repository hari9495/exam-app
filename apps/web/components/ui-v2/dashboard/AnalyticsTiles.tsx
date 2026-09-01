'use client';

// Analytics tiles, retoned to Azure. Donut + bar use recharts (the chart dependency 21st chart
// components are built on, as in the approved hero); the funnel uses the 21st Funnel Chart.
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Panel } from '../Panel';
import { STATUS, FUNNEL_SCALE, scoreColor } from '../viz';

const OK = STATUS.ok;
const WARN = STATUS.warn;
const BAD = STATUS.bad;

export interface IntegrityData { clear: number; review: number; highConcern: number; highConcernRate: number }
export interface ScoresData { distribution: { bucket: string; count: number }[] }
export interface FunnelData { invited: number; started: number; submitted: number; passed: number }

export function AnalyticsTiles({ integrity, scores, funnel }: { integrity: IntegrityData; scores: ScoresData; funnel: FunnelData }) {
  const pie = [
    { name: 'Clear', value: integrity.clear, color: OK },
    { name: 'Review', value: integrity.review, color: WARN },
    { name: 'High concern', value: integrity.highConcern, color: BAD },
  ];
  const funnelStages = [
    { label: 'Invited', value: funnel.invited },
    { label: 'Started', value: funnel.started },
    { label: 'Submitted', value: funnel.submitted },
    { label: 'Passed', value: funnel.passed },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }} className="wf-hero-grid">
        <Panel title="Integrity">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pie} dataKey="value" innerRadius={38} outerRadius={56} paddingAngle={2} stroke="none" isAnimationActive={false}>
                    {pie.map((s) => <Cell key={s.name} fill={s.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-disp)', fontWeight: 700, fontSize: 18, color: 'var(--ink)' }}>{integrity.highConcernRate}%</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>concern</div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 12.5, color: 'var(--muted)' }}>
              {pie.map((s) => (
                <span key={s.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <i style={{ width: 9, height: 9, borderRadius: 2, background: s.color, display: 'inline-block' }} />
                  {s.name} <b style={{ color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{s.value.toLocaleString()}</b>
                </span>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Score distribution">
          <div style={{ height: 132 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scores.distribution} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(59,95,227,0.08)' }} contentStyle={{ background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {scores.distribution.map((d, i) => <Cell key={d.bucket} fill={scoreColor(i, scores.distribution.length)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Hiring funnel">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {funnelStages.map((s, i) => {
            const pct = Math.round((s.value / funnelStages[0].value) * 100);
            const conv = i === 0 ? null : Math.round((s.value / funnelStages[i - 1].value) * 100);
            return (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 84, fontSize: 12.5, color: 'var(--muted)', flexShrink: 0 }}>{s.label}</span>
                <div style={{ flex: 1, height: 22, background: 'var(--surface)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: FUNNEL_SCALE[i] ?? 'var(--org-primary)', borderRadius: 6 }} />
                </div>
                <span className="v2-mono" style={{ width: 52, textAlign: 'right', fontSize: 12.5, color: 'var(--ink)', flexShrink: 0 }}>{s.value.toLocaleString()}</span>
                <span className="v2-mono" style={{ width: 44, textAlign: 'right', fontSize: 11.5, color: 'var(--muted)', flexShrink: 0 }}>{conv == null ? '' : `${conv}%`}</span>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
