// THROWAWAY preview — dense "Power BI report" recomposition of the recruiter dashboard using the
// 21st-sourced Azure pieces (shell + StatCard sparklines + Gauge + analytics tiles), mock data,
// outside the auth gate. Delete after review.
'use client';

import { Area, AreaChart, ResponsiveContainer, XAxis, Tooltip } from 'recharts';
import { Users, Send, Activity, ClipboardCheck } from 'lucide-react';
import { AppShell, IconStatCard, Gauge, AnalyticsTiles, Panel } from '../../../components/ui-v2';
import { VIZ, rateColor } from '../../../components/ui-v2/viz';
import { RECRUITER_NAV_ITEMS } from '../../../lib/recruiter-nav';

const scoreDist = [
  { bucket: '0-20', count: 8 }, { bucket: '20-40', count: 21 }, { bucket: '40-60', count: 64 },
  { bucket: '60-80', count: 112 }, { bucket: '80-100', count: 74 },
];

const series = Array.from({ length: 30 }, (_, i) => ({
  label: `${i + 1}`,
  value: Math.round(30 + i * 1.6 + Math.sin(i / 2.4) * 12 + (i > 22 ? (i - 22) * 3 : 0)),
}));

const examRows = [
  { exam: 'Frontend Engineer — React', cands: 312, avg: 71, pass: 64, flagged: 18, time: '48m' },
  { exam: 'Backend Engineer — Node', cands: 268, avg: 68, pass: 59, flagged: 22, time: '52m' },
  { exam: 'Data Analyst — SQL', cands: 194, avg: 74, pass: 71, flagged: 9, time: '41m' },
  { exam: 'QA Automation', cands: 141, avg: 63, pass: 55, flagged: 14, time: '45m' },
  { exam: 'DevOps — Cloud', cands: 118, avg: 69, pass: 61, flagged: 11, time: '50m' },
];

const chip: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink)',
  background: 'var(--surface)', border: '1px solid var(--hair)', borderRadius: 8, padding: '6px 11px', cursor: 'default',
};

function passColor(p: number) { return p >= 65 ? '#15803d' : p >= 55 ? '#a16207' : '#b91c1c'; }

export default function ShellPreview() {
  return (
    <div className="v2" style={{ minHeight: '100vh', ['--org-primary' as string]: '#3b5fe3', ['--org-on-primary' as string]: '#ffffff' }}>
      <AppShell
        navItems={RECRUITER_NAV_ITEMS}
        orgName="Northwind Corp"
        orgInitial="N"
        roleLabel="Recruiter"
        displayName="Maya Rodriguez"
        initials="MR"
        onLogout={() => {}}
      >
        {/* Report header + slicer row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Recruiting overview</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginRight: 2 }}>Filters</span>
            <span style={chip}>Drive: All ▾</span>
            <span style={chip}>Last 30 days ▾</span>
            <span style={chip}>Exam: All ▾</span>
            <span style={{ ...chip, background: 'color-mix(in srgb, var(--org-primary) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--org-primary) 30%, transparent)', color: 'var(--org-primary)', fontWeight: 600 }}>● Live</span>
          </div>
        </div>

        {/* KPI strip — icon-led tiles with subtle tint */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }} className="wf-hero-kpis">
          <IconStatCard title="Total candidates" value="1,284" icon={<Users size={22} />} change="+6.1%" changeType="positive" caption="vs previous 30 days" accent={VIZ.azure} />
          <IconStatCard title="Invitations sent" value="642" icon={<Send size={20} />} change="+3.2%" changeType="positive" caption="vs previous 30 days" accent={VIZ.teal} />
          <IconStatCard title="Attempts in progress" value={41} icon={<Activity size={22} />} change="-2.0%" changeType="negative" caption="active right now" accent={VIZ.amber} />
          <IconStatCard title="Pending grading" value={7} icon={<ClipboardCheck size={22} />} change="+1" changeType="positive" caption="awaiting review" accent={VIZ.violet} />
        </div>

        {/* Trend + gauge row */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginTop: 12 }} className="wf-hero-grid">
          <Panel title="Assessment activity" actions={<span style={{ fontSize: 11, color: 'var(--muted)' }}>last 30 days</span>}>
            <div style={{ height: 190 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="wf-report-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b5fe3" stopOpacity={0.26} />
                      <stop offset="100%" stopColor="#3b5fe3" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
                  <Tooltip cursor={{ stroke: '#e2e8f0' }} contentStyle={{ background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="value" stroke="#3b5fe3" strokeWidth={2} fill="url(#wf-report-area)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel title="Pass rate">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 6 }}>
              <Gauge value={62} size={148} label="of 70% target" color={rateColor(62, 70)} />
              <div style={{ display: 'flex', gap: 18, fontSize: 12, color: 'var(--muted)' }}>
                <span>Passed <b style={{ color: 'var(--ink)' }}>283</b></span>
                <span>Target <b style={{ color: 'var(--ink)' }}>70%</b></span>
              </div>
            </div>
          </Panel>
        </div>

        {/* Donut + score bars + funnel */}
        <div style={{ marginTop: 12 }}>
          <AnalyticsTiles
            integrity={{ clear: 812, review: 143, highConcern: 88, highConcernRate: 9 }}
            scores={{ distribution: scoreDist }}
            funnel={{ invited: 642, started: 527, submitted: 456, passed: 283 }}
          />
        </div>

        {/* Exam-quality matrix */}
        <div style={{ marginTop: 12 }}>
          <Panel title="Exam quality" actions={<span style={{ fontSize: 11, color: 'var(--muted)' }}>{examRows.length} active exams</span>}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    <th style={{ padding: '0 8px 8px 0', fontWeight: 600 }}>Exam</th>
                    <th style={{ padding: '0 8px 8px', fontWeight: 600, textAlign: 'right' }}>Candidates</th>
                    <th style={{ padding: '0 8px 8px', fontWeight: 600, textAlign: 'right' }}>Avg score</th>
                    <th style={{ padding: '0 8px 8px', fontWeight: 600, textAlign: 'right' }}>Pass rate</th>
                    <th style={{ padding: '0 8px 8px', fontWeight: 600, textAlign: 'right' }}>Flagged</th>
                    <th style={{ padding: '0 0 8px 8px', fontWeight: 600, textAlign: 'right' }}>Avg time</th>
                  </tr>
                </thead>
                <tbody>
                  {examRows.map((r) => (
                    <tr key={r.exam} style={{ borderTop: '1px solid var(--hair)' }}>
                      <td style={{ padding: '10px 8px 10px 0', color: 'var(--ink)', fontWeight: 500 }}>{r.exam}</td>
                      <td className="v2-mono" style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--ink)' }}>{r.cands}</td>
                      <td className="v2-mono" style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--ink)' }}>{r.avg}</td>
                      <td className="v2-mono" style={{ padding: '10px 8px', textAlign: 'right' }}>
                        <span style={{ color: passColor(r.pass), fontWeight: 600 }}>{r.pass}%</span>
                      </td>
                      <td className="v2-mono" style={{ padding: '10px 8px', textAlign: 'right', color: r.flagged >= 18 ? '#b91c1c' : 'var(--muted)' }}>{r.flagged}</td>
                      <td className="v2-mono" style={{ padding: '10px 0 10px 8px', textAlign: 'right', color: 'var(--muted)' }}>{r.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </AppShell>
    </div>
  );
}
