'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Users, Mail, Play, FileEdit, AlertTriangle, Clock, CheckCircle2, FileEdit as FileEditIcon, Plus, CalendarClock } from 'lucide-react';
import { useDashboardExamPerformance, useDashboardFunnel, useDashboardSummary, useDashboardTrend } from '../../../lib/hooks/useDashboard';
import { DashboardTrendMetric, DashboardWindow } from '../../../lib/types';
import { Card, Button, Select, type SelectOption } from '../../../components/ui';
import { Sparkline } from '../../../components/charts/Sparkline';
import { GroupedBarChart } from '../../../components/charts/GroupedBarChart';
import { FunnelChart } from '../../../components/charts/FunnelChart';

function activityIconFor(description: string) {
  if (description.includes('invited')) return Mail;
  if (description.includes('published')) return CheckCircle2;
  if (description.includes('graded')) return FileEditIcon;
  return CheckCircle2;
}

const GLOBAL_RANGE_OPTIONS: SelectOption[] = [
  { value: '7d', label: '7 days' },
  { value: '14d', label: '14 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'all', label: 'All time' },
];

const RANGE_TO_TREND_DAYS: Record<DashboardWindow, 7 | 14 | 30 | 90> = {
  '7d': 7,
  '14d': 14,
  '30d': 30,
  '90d': 90,
  all: 90,
};

const TREND_UNIT_LABELS: Record<DashboardTrendMetric, string> = {
  candidates: 'new candidates',
  invitations: 'invitations sent',
  attempts: 'attempts started',
  pendingGrading: 'newly pending grading',
};

interface StatCardProps {
  icon: typeof Users;
  value: number;
  label: string;
  metric: DashboardTrendMetric;
  color: string;
  delay: number;
  range: DashboardWindow;
}

function StatCard({ icon: Icon, value, label, metric, color, delay, range }: StatCardProps) {
  const { data: trend } = useDashboardTrend(metric, RANGE_TO_TREND_DAYS[range]);
  const points = trend?.points ?? [];
  const firstValue = points[0]?.value ?? 0;
  const lastValue = points[points.length - 1]?.value ?? 0;
  const changePercent = firstValue > 0 ? Math.round(((lastValue - firstValue) / firstValue) * 100) : lastValue > 0 ? 100 : 0;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay, ease: 'easeOut' }} whileHover={{ y: -3 }}>
      <Card className="overflow-hidden p-0">
        <div className="p-4" style={{ background: `linear-gradient(135deg, ${color}1a, transparent)` }}>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex h-8 w-8 items-center justify-center rounded-md" style={{ backgroundColor: `${color}26`, color }}>
              <Icon size={16} />
            </div>
            <span className={`text-xs font-semibold ${changePercent >= 0 ? 'text-status-success' : 'text-status-danger'}`}>
              {changePercent >= 0 ? '▲' : '▼'} {Math.abs(changePercent)}%
            </span>
          </div>
          <p className="text-2xl font-bold text-recruiter-text">{value}</p>
          <p className="text-xs text-recruiter-text-tertiary">{label}</p>
          <div className="mt-2 h-10 w-full">
            <Sparkline data={points} color={color} unit={TREND_UNIT_LABELS[metric]} />
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function ExamPerformanceCard({ range }: { range: DashboardWindow }) {
  const { data } = useDashboardExamPerformance(5, range);
  const exams = data?.exams ?? [];

  const groups = exams.map((exam) => ({
    label: exam.examTitle,
    series: [
      { key: 'passRate', value: exam.passRate, color: '#0d9488' },
      { key: 'avgScore', value: exam.avgScore, color: '#d4a017' },
    ],
  }));

  return (
    <Card>
      <h2 className="mb-3 text-sm font-bold text-recruiter-text">Exam performance</h2>
      {groups.length === 0 ? (
        <p className="text-sm text-recruiter-text-tertiary">No settled attempts yet.</p>
      ) : (
        <div className="h-64 w-full">
          <GroupedBarChart
            groups={groups}
            legend={[
              { label: 'Pass rate', color: '#0d9488' },
              { label: 'Avg score', color: '#d4a017' },
            ]}
          />
        </div>
      )}
    </Card>
  );
}

function CandidateFunnelCard({ range }: { range: DashboardWindow }) {
  const { data: funnel } = useDashboardFunnel('all', range);

  const stages = [
    { label: 'Invited', value: funnel?.invited ?? 0 },
    { label: 'Started', value: funnel?.started ?? 0 },
    { label: 'Submitted', value: funnel?.submitted ?? 0 },
    { label: 'Passed', value: funnel?.passed ?? 0 },
  ];

  return (
    <Card>
      <h2 className="mb-3 text-sm font-bold text-recruiter-text">Candidate funnel</h2>
      <FunnelChart stages={stages} />
    </Card>
  );
}

export default function DashboardPage() {
  const [range, setRange] = useState<DashboardWindow>('14d');
  const { data, isLoading, isError } = useDashboardSummary(range);
  // ponytail: a range change always mints a new react-query key with no cached data, so
  // `data` briefly goes undefined again on every switch. Keep showing the last-loaded
  // summary while the new range fetches so the page (Select + cards) doesn't unmount and
  // flash back to the full-page loading state on every filter change.
  const [lastSummary, setLastSummary] = useState<typeof data>(undefined);
  useEffect(() => {
    if (data) setLastSummary(data);
  }, [data]);
  const summary = data ?? lastSummary;

  if (isLoading && !summary) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Dashboard</h1>
        <p className="text-sm text-recruiter-text-tertiary">Loading…</p>
      </div>
    );
  }

  if (isError || !summary) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Dashboard</h1>
        <p role="alert" className="text-sm text-status-danger">
          Failed to load dashboard.
        </p>
      </div>
    );
  }

  const hasAttention =
    summary.attention.pendingGrading.length > 0 || summary.attention.recentProctoringFlags.length > 0 || summary.attention.staleInvitationCount > 0;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-recruiter-text">Dashboard</h1>
        <Select label="Date range" value={range} onChange={(value) => setRange(value as DashboardWindow)} options={GLOBAL_RANGE_OPTIONS} />
      </div>

      <div className="mb-5 grid grid-cols-4 gap-3">
        <StatCard icon={Users} value={summary.stats.totalCandidates} label="Total candidates" metric="candidates" color="#0d9488" delay={0} range={range} />
        <StatCard icon={Mail} value={summary.stats.invitationsSent} label="Invitations sent" metric="invitations" color="#334155" delay={0.04} range={range} />
        <StatCard
          icon={Play}
          value={summary.stats.attemptsInProgress}
          label="Attempts in progress"
          metric="attempts"
          color="#d4a017"
          delay={0.08}
          range={range}
        />
        <StatCard
          icon={FileEdit}
          value={summary.stats.pendingGradingCount}
          label="Pending grading"
          metric="pendingGrading"
          color="#f2765f"
          delay={0.12}
          range={range}
        />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.16 }}>
          <CandidateFunnelCard range={range} />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
          <Card>
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-recruiter-text">
              <CalendarClock size={14} />
              Upcoming exams
            </h2>
            {summary.upcomingExams.length === 0 ? (
              <p className="text-sm text-recruiter-text-tertiary">No upcoming exams.</p>
            ) : (
              <ul>
                {summary.upcomingExams.map((exam) => (
                  <li key={exam.examId} className="border-b border-recruiter-border last:border-0">
                    <Link href={`/exams/${exam.examId}/edit`} className="flex items-center gap-2.5 py-2.5 text-sm hover:bg-recruiter-bg-subtle">
                      <span className="flex-1 text-recruiter-text">{exam.examTitle}</span>
                      <span className="text-xs text-recruiter-text-tertiary">{new Date(exam.availabilityWindowStart).toLocaleDateString()}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </motion.div>
      </div>

      <div className="mb-5">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
          <ExamPerformanceCard range={range} />
        </motion.div>
      </div>

      <div className="grid grid-cols-[1.3fr_1fr] gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.24 }}>
          <Card>
            <h2 className="mb-3 text-sm font-bold text-recruiter-text">Needs your attention</h2>
            {!hasAttention ? (
              <p className="text-sm text-recruiter-text-tertiary">Nothing needs attention right now.</p>
            ) : (
              <ul>
                {summary.attention.pendingGrading.map((item) => (
                  <li key={item.examId} className="border-b border-recruiter-border last:border-0">
                    <Link href={`/exams/${item.examId}/edit`} className="flex items-center gap-2.5 py-2.5 text-sm hover:bg-recruiter-bg-subtle">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-danger" />
                      <span className="flex-1 text-recruiter-text">
                        {item.examTitle}{' '}
                        <span className="text-recruiter-text-tertiary">has {item.count} answer{item.count === 1 ? '' : 's'} awaiting manual grading</span>
                      </span>
                      <span className="rounded-full bg-recruiter-bg-subtle px-2 py-0.5 text-xs font-bold text-recruiter-text-secondary">{item.count}</span>
                    </Link>
                  </li>
                ))}
                {summary.attention.recentProctoringFlags.map((flag, index) => (
                  <li key={`${flag.examId}-${index}`} className="border-b border-recruiter-border last:border-0">
                    <Link href={`/exams/${flag.examId}/edit`} className="flex items-center gap-2.5 py-2.5 text-sm hover:bg-recruiter-bg-subtle">
                      <AlertTriangle size={13} className="shrink-0 text-status-warning" />
                      <span className="flex-1 text-recruiter-text">
                        {flag.examTitle} <span className="text-recruiter-text-tertiary">flagged a proctoring violation</span>
                      </span>
                    </Link>
                  </li>
                ))}
                {summary.attention.staleInvitationCount > 0 && (
                  <li className="flex items-center gap-2.5 py-2.5 text-sm">
                    <Clock size={13} className="shrink-0 text-recruiter-text-tertiary" />
                    <span className="flex-1 text-recruiter-text">
                      Candidates <span className="text-recruiter-text-tertiary">invited 5+ days ago, haven&apos;t started</span>
                    </span>
                    <span className="rounded-full bg-recruiter-bg-subtle px-2 py-0.5 text-xs font-bold text-recruiter-text-secondary">
                      {summary.attention.staleInvitationCount}
                    </span>
                  </li>
                )}
              </ul>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <Link href="/exams/new">
                <Button variant="secondary" className="flex w-full items-center justify-center gap-1.5">
                  <Plus size={14} />
                  Create exam
                </Button>
              </Link>
              <Link href="/candidates">
                <Button variant="secondary" className="flex w-full items-center justify-center gap-1.5">
                  <Mail size={14} />
                  Invite candidates
                </Button>
              </Link>
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.28 }}>
          <Card>
            <h2 className="mb-3 text-sm font-bold text-recruiter-text">Recent activity</h2>
            {summary.activity.length === 0 ? (
              <p className="text-sm text-recruiter-text-tertiary">No recent activity.</p>
            ) : (
              <ul>
                {summary.activity.map((item) => {
                  const Icon = activityIconFor(item.description);
                  return (
                    <li key={item.id} className="flex items-start gap-2.5 border-b border-recruiter-border py-2.5 text-sm last:border-0">
                      <span className="mt-0.5 flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full bg-status-success-bg text-status-success">
                        <Icon size={12} />
                      </span>
                      <div>
                        <p className="text-recruiter-text">{item.description}</p>
                        <p className="text-xs text-recruiter-text-tertiary">{new Date(item.occurredAt).toLocaleString()}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
