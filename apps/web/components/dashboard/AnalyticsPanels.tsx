'use client';

import Link from 'next/link';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ShieldCheck, ShieldAlert, Timer, Target, TrendingDown, Users2, ListChecks } from 'lucide-react';
import { Card } from '../ui';
import { DashboardAnalytics } from '../../lib/types';
import { useFlaggedQuestions } from '../../lib/hooks/useQuestions';

// Charts read against the recruiter palette rather than recharts' defaults, so the
// dashboard looks like one system. Semantic colours (pass=green, flagged=red) are
// separate from the neutral brand blue used for plain magnitude bars.
const C = {
  primary: '#0053e2',
  accent: '#c98a00',
  success: '#2F6F5E',
  warning: '#8A5A00',
  danger: '#B23B3B',
  grid: '#EAECEB',
  axis: '#9AA5A0',
};

function ChartTooltip({ active, payload, label, suffix }: { active?: boolean; payload?: { value: number }[]; label?: string; suffix?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-recruiter-border bg-white px-2.5 py-1.5 text-xs shadow-sm">
      <span className="font-semibold text-recruiter-text">{label}</span>
      <span className="ml-2 tabular-nums text-recruiter-text-secondary">
        {payload[0].value}
        {suffix ?? ''}
      </span>
    </div>
  );
}

function PanelHeader({ icon: Icon, title, hint }: { icon: typeof Target; title: string; hint?: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-recruiter-bg-subtle text-primary">
        <Icon size={15} />
      </span>
      <h2 className="text-sm font-bold text-recruiter-text">{title}</h2>
      {hint ? <span className="ml-auto text-xs text-recruiter-text-tertiary">{hint}</span> : null}
    </div>
  );
}

function Stat({ value, label, tone }: { value: string; label: string; tone?: 'good' | 'warn' | 'bad' }) {
  const color = tone === 'good' ? 'text-status-success' : tone === 'warn' ? 'text-status-warning' : tone === 'bad' ? 'text-status-danger' : 'text-recruiter-text';
  return (
    <div className="rounded-lg bg-recruiter-bg-subtle px-3 py-2">
      <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-recruiter-text-tertiary">{label}</p>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-recruiter-text-tertiary">{children}</p>;
}

// ---- 1. Candidate performance ----
function ScorePanel({ scores }: { scores: DashboardAnalytics['scores'] }) {
  const hasData = scores.count > 0;
  return (
    <Card>
      <PanelHeader icon={Target} title="Score Distribution" hint={hasData ? `${scores.count} graded` : undefined} />
      {!hasData ? (
        <EmptyNote>No graded results in this range yet.</EmptyNote>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-4 gap-2">
            <Stat value={`${scores.avg}%`} label="Average" />
            <Stat value={`${scores.median}%`} label="Median" />
            <Stat value={`${scores.p25}–${scores.p75}`} label="Middle 50%" />
            <Stat value={`${scores.passRate}%`} label="Pass Rate" tone={scores.passRate !== null && scores.passRate >= 50 ? 'good' : 'warn'} />
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scores.distribution} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: C.axis }} tickLine={false} axisLine={{ stroke: C.grid }} interval={0} angle={-30} textAnchor="end" height={38} />
                <YAxis tick={{ fontSize: 10, fill: C.axis }} tickLine={false} axisLine={false} allowDecimals={false} width={30} />
                <Tooltip content={<ChartTooltip suffix=" candidates" />} cursor={{ fill: '#00000008' }} />
                <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {scores.distribution.map((entry, i) => (
                    // Fail band (below ~40) tinted danger, pass band brand blue -- the pass line is score-dependent per exam, so this is a soft visual cue, not a hard threshold.
                    <Cell key={entry.bucket} fill={i < 4 ? '#C9739F33' : C.primary} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-center text-[11px] text-recruiter-text-tertiary">score %</p>
        </>
      )}
    </Card>
  );
}

// ---- 2. Integrity & proctoring ----
function IntegrityPanel({ integrity }: { integrity: DashboardAnalytics['integrity'] }) {
  const hasData = integrity.submittedAttempts > 0;
  // Only highConcernRate drives the headline colour/threshold -- review is the normal
  // resting state (most attempts land there) and must never read as an alarm.
  const rate = integrity.highConcernRate;
  const headlineClass = rate >= 15 ? 'text-status-danger' : rate >= 8 ? 'text-status-warning' : 'text-recruiter-text';
  const donut = [
    { name: 'High concern', value: integrity.highConcern, fill: C.danger },
    { name: 'Review', value: integrity.review, fill: C.warning },
    { name: 'Clear', value: integrity.clear, fill: C.success },
  ];
  const topTypes = integrity.byType.slice(0, 5).map((t) => ({ ...t, label: t.type.replace(/_/g, ' ') }));
  return (
    // This card sits beside the score-distribution panel in a grid row, which stretches
    // both cards to the taller one's height. Its own content (a small donut + a short bar
    // list) is naturally shorter, so without the flex-col/flex-1/content-center below it
    // just top-aligns and leaves the rest of the card empty -- centering it in the
    // available height instead makes the card read as intentionally laid out.
    <Card className="flex flex-col">
      <PanelHeader
        icon={integrity.highConcern > 0 ? ShieldAlert : ShieldCheck}
        title="Proctoring Integrity"
        hint={hasData ? `${integrity.submittedAttempts} attempts` : undefined}
      />
      {!hasData ? (
        <EmptyNote>No completed attempts to analyse yet.</EmptyNote>
      ) : (
        <div className="grid flex-1 grid-cols-[auto_1fr] content-center gap-4">
          <div className="flex flex-col items-center">
            <div className="relative h-28 w-28">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donut} dataKey="value" innerRadius={38} outerRadius={54} startAngle={90} endAngle={-270} paddingAngle={2} isAnimationActive={false}>
                    {donut.map((d) => (
                      <Cell key={d.name} fill={d.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-lg font-bold tabular-nums ${headlineClass}`}>{rate}%</span>
                <span className="text-[10px] uppercase text-recruiter-text-tertiary">need review</span>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-3 text-[11px]">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: C.danger }} />{integrity.highConcern} high concern</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: C.warning }} />{integrity.review} review</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: C.success }} />{integrity.clear} clear</span>
              {integrity.unanalyzed > 0 && <span className="w-full text-center text-recruiter-text-tertiary">{integrity.unanalyzed} not analysed</span>}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-recruiter-text-tertiary">Violations by type</p>
            {topTypes.length === 0 ? (
              <p className="py-6 text-sm text-status-success">No violations recorded.</p>
            ) : (
              <div className="h-32 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topTypes} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: C.axis }} tickLine={false} axisLine={false} width={92} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: '#00000008' }} />
                    <Bar dataKey="count" fill={C.warning} radius={[0, 3, 3, 0]} barSize={12} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ---- 3. Funnel & throughput ----
function ThroughputPanel({ funnel, timing }: { funnel: DashboardAnalytics['funnel']; timing: DashboardAnalytics['timing'] }) {
  const stages = [
    { label: 'Invited', value: funnel.invited },
    { label: 'Started', value: funnel.started },
    { label: 'Submitted', value: funnel.submitted },
    { label: 'Passed', value: funnel.passed },
  ];
  const max = Math.max(1, funnel.invited);
  return (
    <Card>
      <PanelHeader icon={Users2} title="Hiring Funnel & Throughput" />
      <div className="grid grid-cols-3 gap-2">
        <Stat value={`${funnel.completionRate}%`} label="Completion" tone={funnel.completionRate >= 70 ? 'good' : 'warn'} />
        <Stat value={String(funnel.abandoned)} label="Abandoned" tone={funnel.abandoned > 0 ? 'warn' : undefined} />
        <Stat value={timing.medianMinutes !== null ? `${timing.medianMinutes}m` : '—'} label="Median Time" />
      </div>
      <div className="mt-4 flex flex-col gap-1.5">
        {stages.map((stage, i) => {
          const pct = Math.round((stage.value / max) * 100);
          const conv = i > 0 && stages[i - 1].value > 0 ? Math.round((stage.value / stages[i - 1].value) * 100) : null;
          return (
            <div key={stage.label} className="flex items-center gap-2">
              <span className="w-16 text-xs text-recruiter-text-secondary">{stage.label}</span>
              <div className="relative h-6 flex-1 overflow-hidden rounded bg-recruiter-bg-subtle">
                <div className="flex h-full items-center rounded px-2" style={{ width: `${Math.max(pct, 8)}%`, background: i === 3 ? C.success : C.primary }}>
                  <span className="text-[11px] font-semibold tabular-nums text-white">{stage.value}</span>
                </div>
              </div>
              <span className="w-10 text-right text-[11px] tabular-nums text-recruiter-text-tertiary">{conv !== null ? `${conv}%` : ''}</span>
            </div>
          );
        })}
      </div>
      {timing.distribution.some((d) => d.count > 0) && (
        <div className="mt-4">
          <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-recruiter-text-tertiary">
            <Timer size={11} /> Completion time
          </p>
          <div className="h-24 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timing.distribution} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: C.axis }} tickLine={false} axisLine={{ stroke: C.grid }} interval={0} />
                <YAxis tick={{ fontSize: 10, fill: C.axis }} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                <Tooltip content={<ChartTooltip suffix=" candidates" />} cursor={{ fill: '#00000008' }} />
                <Bar dataKey="count" fill={C.accent} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---- 4. Exam quality + question difficulty ----
function ExamQualityPanel({ examQuality, questionDifficulty }: Pick<DashboardAnalytics, 'examQuality' | 'questionDifficulty'>) {
  return (
    <Card>
      <PanelHeader icon={TrendingDown} title="Exam Quality" hint="hardest first" />
      {examQuality.length === 0 ? (
        <EmptyNote>No settled attempts to compare exams yet.</EmptyNote>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-recruiter-border text-left text-[11px] uppercase tracking-wide text-recruiter-text-tertiary">
                <th className="pb-2 font-semibold">Exam</th>
                <th className="pb-2 text-right font-semibold">Cand.</th>
                <th className="pb-2 text-right font-semibold">Avg</th>
                <th className="pb-2 text-right font-semibold">Pass</th>
                <th className="pb-2 text-right font-semibold">Spread</th>
                <th className="pb-2 text-right font-semibold">Time used</th>
              </tr>
            </thead>
            <tbody>
              {examQuality.map((exam) => {
                const usedPct = exam.avgMinutes !== null && exam.allottedMinutes > 0 ? Math.round((exam.avgMinutes / exam.allottedMinutes) * 100) : null;
                return (
                  <tr key={exam.examId} className="border-b border-recruiter-border last:border-0">
                    <td className="py-2 pr-2 text-recruiter-text">{exam.examTitle}</td>
                    <td className="py-2 text-right tabular-nums text-recruiter-text-secondary">{exam.candidateCount}</td>
                    <td className="py-2 text-right tabular-nums text-recruiter-text">{exam.avgScore}%</td>
                    <td className="py-2 text-right tabular-nums">
                      <span className={exam.passRate >= 50 ? 'text-status-success' : 'text-status-warning'}>{exam.passRate}%</span>
                    </td>
                    <td className="py-2 text-right tabular-nums text-recruiter-text-secondary" title="Score standard deviation — low spread can mean the exam doesn't separate candidates well">
                      ±{exam.scoreSpread}
                    </td>
                    <td className="py-2 text-right tabular-nums text-recruiter-text-secondary">
                      {exam.avgMinutes !== null ? `${exam.avgMinutes}m` : '—'}
                      {usedPct !== null ? <span className="ml-1 text-[11px] text-recruiter-text-tertiary">({usedPct}%)</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {questionDifficulty.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-recruiter-text-tertiary">Most-missed questions</p>
          <ul className="flex flex-col gap-2">
            {questionDifficulty.slice(0, 6).map((q) => (
              <li key={q.questionId} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-xs text-recruiter-text" title={q.text}>{q.text}</span>
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-recruiter-bg-subtle">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${q.correctRate}%`, background: q.correctRate < 40 ? C.danger : q.correctRate < 70 ? C.warning : C.success }}
                  />
                </div>
                <span className="w-16 text-right text-[11px] tabular-nums text-recruiter-text-tertiary">{q.correctRate}% · {q.answered}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ---- 5. Question bank health (item analytics) ----
// Org-wide and time-independent: it reads the flagged-question aggregate, which the backend
// computes across every exam and every submitted attempt ever. Unlike the other three panels
// it deliberately ignores the dashboard filter bar -- useFlaggedQuestions() takes no filter
// args and ANALYTICS_FILTERS never reach its query key -- so the footer says so explicitly
// rather than let a recruiter assume the panel narrowed along with everything above it.
// Exported and mounted by the PAGE, not by AnalyticsPanels, deliberately. This panel fetches
// independently of the filtered analytics payload -- that independence is the point of its
// separate query -- so it must not sit behind the page's "analytics loaded?" gate, or a
// failing /dashboard/analytics would hide the one panel that never needed it.
export function QuestionHealthPanel() {
  const { data, isLoading, isError } = useFlaggedQuestions();
  const items = data ?? [];
  // The authoritative classification is the flags array (see classifyFlags in
  // item-statistics.ts), not the sign of `discrimination`. flagged() also returns questions
  // flagged only for too_easy/very_hard -- including ones where discrimination is null because
  // it was unmeasurable -- and those belong in neither headline count.
  const miskeyed = items.filter((q) => q.flags.some((f) => f.code === 'miskeyed_suspect'));
  const weak = items.filter(
    (q) => q.flags.some((f) => f.code === 'weak_discrimination') && !q.flags.some((f) => f.code === 'miskeyed_suspect'),
  );
  const worstFirst = items
    .slice()
    .sort((a, b) => {
      // Null has no position on the discrimination scale -- sort it after every measured
      // item instead of coalescing to 0 and landing it mid-list.
      if (a.discrimination === null) return b.discrimination === null ? 0 : 1;
      if (b.discrimination === null) return -1;
      return a.discrimination - b.discrimination;
    })
    .slice(0, 5);

  return (
    <Card>
      <PanelHeader icon={ListChecks} title="Question Bank Health" />
      {isLoading ? (
        <div className="animate-pulse space-y-2" aria-hidden="true">
          <div className="h-14 rounded-lg bg-recruiter-bg-subtle" />
          <div className="h-4 w-2/3 rounded bg-recruiter-bg-subtle" />
          <div className="h-4 w-1/2 rounded bg-recruiter-bg-subtle" />
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-status-danger">
          Failed to load question health.
        </p>
      ) : items.length === 0 ? (
        // The endpoint only returns questions past MIN_RESPONSES, so an empty array can't be
        // told apart from "nothing measured yet" here -- treated as the positive state, with
        // an honest subtext instead of a fabricated third "not enough data" state.
        <EmptyNote>
          <span className="block font-semibold text-status-success">No question issues detected</span>
          <span className="mt-1 block text-xs text-recruiter-text-tertiary">Questions with at least 20 responses are measured</span>
        </EmptyNote>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-4">
            <Stat value={String(miskeyed.length)} label="Likely miskeyed" tone={miskeyed.length > 0 ? 'bad' : 'good'} />
            <span className="text-xs text-recruiter-text-tertiary">{weak.length} weak discrimination</span>
          </div>
          <ul className="flex flex-col gap-1">
            {worstFirst.map((q) => (
              <li key={q.questionId}>
                <Link
                  href={`/questions/${q.questionId}/edit`}
                  className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-recruiter-bg-subtle"
                >
                  <span className="min-w-0 flex-1 truncate text-xs text-recruiter-text" title={q.text}>
                    {q.text ?? 'Untitled question'}
                  </span>
                  <span
                    className={`text-xs font-semibold tabular-nums ${q.discrimination !== null && q.discrimination < 0 ? 'text-status-danger' : 'text-recruiter-text-secondary'}`}
                  >
                    {q.discrimination !== null ? q.discrimination.toFixed(2) : '—'}
                  </span>
                  <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-recruiter-text-tertiary">{q.responses} resp.</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-4 text-[11px] text-recruiter-text-tertiary">All exams, all time · questions with ≥ 20 responses</p>
    </Card>
  );
}

export function AnalyticsPanels({ data }: { data: DashboardAnalytics }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ScorePanel scores={data.scores} />
        <IntegrityPanel integrity={data.integrity} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ThroughputPanel funnel={data.funnel} timing={data.timing} />
        <ExamQualityPanel examQuality={data.examQuality} questionDifficulty={data.questionDifficulty} />
      </div>
    </div>
  );
}
