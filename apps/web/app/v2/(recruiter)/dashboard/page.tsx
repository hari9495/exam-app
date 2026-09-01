'use client';

// v2 recruiter dashboard — the 21st-sourced Azure report canvas wired to the live dashboard hooks.
// Shell/branding come from the (recruiter) layout; this renders the report content only.

import { useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, XAxis, Tooltip } from 'recharts';
import { Users, Send, Activity, ClipboardCheck } from 'lucide-react';
import { useDashboardSummary, useDashboardTrend, useDashboardAnalytics } from '../../../../lib/hooks/useDashboard';
import type { DashboardWindow, DashboardTrendMetric, DashboardTrendDays } from '../../../../lib/types';
import { IconStatCard, Gauge, AnalyticsTiles, Panel, AttentionPanel, ActivityPanel, UpcomingExamsPanel } from '../../../../components/ui-v2';
import { VIZ, STATUS, rateColor } from '../../../../components/ui-v2/viz';

const WINDOW_DAYS: Record<Exclude<DashboardWindow, 'all'>, DashboardTrendDays> = { '7d': 7, '14d': 14, '30d': 30, '90d': 90 };
const WINDOWS: { value: DashboardWindow; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

const chip = (active: boolean): React.CSSProperties => ({
  fontSize: 12.5, padding: '6px 11px', borderRadius: 8, cursor: 'pointer',
  border: `1px solid ${active ? 'color-mix(in srgb, var(--org-primary) 30%, transparent)' : 'var(--hair)'}`,
  background: active ? 'color-mix(in srgb, var(--org-primary) 10%, transparent)' : 'var(--surface)',
  color: active ? 'var(--org-primary)' : 'var(--ink)', fontWeight: active ? 600 : 400,
});

function passColor(p: number) { return p >= 50 ? STATUS.ok : p >= 35 ? STATUS.warn : STATUS.bad; }
function fmtDate(d: string) { return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }

function Kpi({ title, value, icon, metric, accent, days }: {
  title: string; value: number; icon: React.ReactNode; metric: DashboardTrendMetric; accent: string; days: DashboardTrendDays;
}) {
  const { data: trend } = useDashboardTrend(metric, days);
  const pts = trend?.points ?? [];
  const first = pts[0]?.value ?? 0;
  const last = pts[pts.length - 1]?.value ?? 0;
  const change = first > 0 ? Math.round(((last - first) / first) * 100) : last > 0 ? 100 : 0;
  const changeType = change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral';
  const changeText = change > 0 ? `+${change}%` : change < 0 ? `${change}%` : '±0%';
  return <IconStatCard title={title} value={value} icon={icon} change={changeText} changeType={changeType} caption="vs start of window" accent={accent} />;
}

export default function V2DashboardPage() {
  const [window, setWindow] = useState<DashboardWindow>('30d');
  const days = window === 'all' ? 90 : WINDOW_DAYS[window];
  const { data: summary, isLoading, isError } = useDashboardSummary(window);
  const { data: analytics, isError: analyticsError } = useDashboardAnalytics({ window });
  const { data: activityTrend } = useDashboardTrend('attempts', days);
  const series = (activityTrend?.points ?? []).map((p) => ({ label: fmtDate(p.date), value: p.value }));

  if (isLoading && !summary) {
    return (<><h1 className="v2-title" style={{ fontSize: 22 }}>Recruiting overview</h1><p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 12 }}>Loading…</p></>);
  }
  if (isError || !summary) {
    return (<><h1 className="v2-title" style={{ fontSize: 22 }}>Recruiting overview</h1><p role="alert" style={{ fontSize: 13, color: 'var(--danger)', marginTop: 12 }}>Failed to load dashboard.</p></>);
  }

  const passRate = Math.round(analytics?.scores.passRate ?? 0);

  return (
    <>
      {/* Header + time slicer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Recruiting overview</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginRight: 2 }}>Window</span>
          {WINDOWS.map((w) => (
            <button key={w.value} type="button" style={chip(window === w.value)} onClick={() => setWindow(w.value)}>{w.label}</button>
          ))}
        </div>
      </div>

      {/* KPI strip — icon-led tiles with subtle tint */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }} className="wf-hero-kpis">
        <Kpi title="Total candidates" value={summary.stats.totalCandidates} icon={<Users size={22} />} metric="candidates" accent={VIZ.azure} days={days} />
        <Kpi title="Invitations sent" value={summary.stats.invitationsSent} icon={<Send size={20} />} metric="invitations" accent={VIZ.teal} days={days} />
        <Kpi title="Attempts in progress" value={summary.stats.attemptsInProgress} icon={<Activity size={22} />} metric="attempts" accent={VIZ.amber} days={days} />
        <Kpi title="Pending grading" value={summary.stats.pendingGradingCount} icon={<ClipboardCheck size={22} />} metric="pendingGrading" accent={VIZ.violet} days={days} />
      </div>

      {/* Trend + pass-rate gauge */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginTop: 12 }} className="wf-hero-grid">
        <Panel title="Assessment activity" actions={<span style={{ fontSize: 11, color: 'var(--muted)' }}>attempts started</span>}>
          <div style={{ height: 190 }}>
            {series.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="wf-report-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={VIZ.azure} stopOpacity={0.26} />
                      <stop offset="100%" stopColor={VIZ.azure} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
                  <Tooltip cursor={{ stroke: '#e2e8f0' }} contentStyle={{ background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="value" stroke={VIZ.azure} strokeWidth={2} fill="url(#wf-report-area)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: 13, color: 'var(--muted)' }}>Not enough activity to chart yet.</div>
            )}
          </div>
        </Panel>
        <Panel title="Pass rate">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 6 }}>
            <Gauge value={passRate} size={148} label="of 70% target" color={rateColor(passRate, 70)} />
            <div style={{ display: 'flex', gap: 18, fontSize: 12, color: 'var(--muted)' }}>
              <span>Passed <b style={{ color: 'var(--ink)' }}>{analytics?.funnel.passed ?? 0}</b></span>
              <span>Target <b style={{ color: 'var(--ink)' }}>70%</b></span>
            </div>
          </div>
        </Panel>
      </div>

      {/* Donut + score bars + funnel */}
      <div style={{ marginTop: 12 }}>
        {analytics ? (
          <AnalyticsTiles
            integrity={{ clear: analytics.integrity.clear, review: analytics.integrity.review, highConcern: analytics.integrity.highConcern, highConcernRate: analytics.integrity.highConcernRate }}
            scores={{ distribution: analytics.scores.distribution }}
            funnel={{ invited: analytics.funnel.invited, started: analytics.funnel.started, submitted: analytics.funnel.submitted, passed: analytics.funnel.passed }}
          />
        ) : (
          <Panel title="Analytics"><p style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: analyticsError ? 'var(--danger)' : 'var(--muted)' }}>{analyticsError ? 'Failed to load analytics.' : 'Loading analytics…'}</p></Panel>
        )}
      </div>

      {/* Exam-quality matrix */}
      {analytics && analytics.examQuality.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Panel title="Exam quality" actions={<span style={{ fontSize: 11, color: 'var(--muted)' }}>{analytics.examQuality.length} exams · hardest first</span>}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    <th style={{ padding: '0 8px 8px 0', fontWeight: 600 }}>Exam</th>
                    <th style={{ padding: '0 8px 8px', fontWeight: 600, textAlign: 'right' }}>Candidates</th>
                    <th style={{ padding: '0 8px 8px', fontWeight: 600, textAlign: 'right' }}>Avg score</th>
                    <th style={{ padding: '0 8px 8px', fontWeight: 600, textAlign: 'right' }}>Pass rate</th>
                    <th style={{ padding: '0 8px 8px', fontWeight: 600, textAlign: 'right' }}>Spread</th>
                    <th style={{ padding: '0 0 8px 8px', fontWeight: 600, textAlign: 'right' }}>Avg time</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.examQuality.map((r) => (
                    <tr key={r.examId} style={{ borderTop: '1px solid var(--hair)' }}>
                      <td style={{ padding: '10px 8px 10px 0', color: 'var(--ink)', fontWeight: 500 }}>{r.examTitle}</td>
                      <td className="v2-mono" style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--ink)' }}>{r.candidateCount}</td>
                      <td className="v2-mono" style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--ink)' }}>{r.avgScore}%</td>
                      <td className="v2-mono" style={{ padding: '10px 8px', textAlign: 'right' }}>
                        <span style={{ color: passColor(r.passRate), fontWeight: 600 }}>{r.passRate}%</span>
                      </td>
                      <td className="v2-mono" style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--muted)' }}>±{r.scoreSpread}</td>
                      <td className="v2-mono" style={{ padding: '10px 0 10px 8px', textAlign: 'right', color: 'var(--muted)' }}>{r.avgMinutes !== null ? `${r.avgMinutes}m` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      {/* Upcoming exams + attention/activity lists */}
      {summary.upcomingExams.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <UpcomingExamsPanel exams={summary.upcomingExams} />
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12, marginTop: 12 }} className="wf-hero-grid">
        <AttentionPanel data={{ pendingGrading: summary.attention.pendingGrading, proctoringFlags: summary.attention.recentProctoringFlags, staleInvitationCount: summary.attention.staleInvitationCount }} />
        <ActivityPanel activity={summary.activity} />
      </div>
    </>
  );
}
