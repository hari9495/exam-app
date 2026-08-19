'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Users, Mail, Play, FileEdit, AlertTriangle, Clock, CheckCircle2, FileEdit as FileEditIcon, Plus, CalendarClock } from 'lucide-react';
import { useDashboardAnalytics, useDashboardSummary, useDashboardTrend } from '../../../lib/hooks/useDashboard';
import { useExams } from '../../../lib/hooks/useExams';
import { useCandidates } from '../../../lib/hooks/useCandidates';
import { DashboardTrendMetric, DashboardWindow } from '../../../lib/types';
import { Card, Button } from '../../../components/ui';
import { Sparkline } from '../../../components/charts/Sparkline';
import { AnalyticsPanels, QuestionHealthPanel } from '../../../components/dashboard/AnalyticsPanels';
import {
  DashboardFilterBar,
  defaultFilterState,
  describeTimeFilter,
  isDefaultFilterState,
  toAnalyticsFilters,
  type DashboardFilterState,
} from '../../../components/dashboard/DashboardFilterBar';

function activityIconFor(description: string) {
  if (description.includes('invited')) return Mail;
  if (description.includes('published')) return CheckCircle2;
  if (description.includes('graded')) return FileEditIcon;
  return CheckCircle2;
}

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
            {/* Flat is neither growth nor decline -- showing it as a green "up" arrow
                overstated a change that didn't happen. */}
            <span
              className={`text-xs font-semibold ${
                changePercent > 0 ? 'text-status-success' : changePercent < 0 ? 'text-status-danger' : 'text-muted'
              }`}
            >
              {changePercent > 0 ? '▲' : changePercent < 0 ? '▼' : '–'} {Math.abs(changePercent)}%
            </span>
          </div>
          <p className="text-2xl font-bold text-ink">{value}</p>
          <p className="text-xs text-muted">{label}</p>
          <div className="mt-2 h-10 w-full">
            <Sparkline data={points} color={color} unit={TREND_UNIT_LABELS[metric]} />
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

export default function DashboardPage() {
  const [filters, setFilters] = useState<DashboardFilterState>(defaultFilterState());
  // The KPI row + trends are org-wide operational counts and only speak the relative
  // window; a specific month/year/custom range applies to the analytical panels below.
  const summaryWindow: DashboardWindow = filters.timeMode === 'relative' ? filters.window : 'all';
  const { data, isLoading, isError } = useDashboardSummary(summaryWindow);
  const { data: analytics, isError: analyticsError } = useDashboardAnalytics(toAnalyticsFilters(filters));
  const { data: examsData } = useExams(undefined, { pageSize: 200 });
  const { data: candidatesData } = useCandidates({ pageSize: 200 });
  const exams = (examsData?.data ?? []).map((e) => ({ id: e.id, title: e.title }));
  const candidates = (candidatesData?.data ?? []).map((c) => ({ id: c.id, name: c.name }));
  // ponytail: a filter change always mints a new react-query key with no cached data, so
  // `data` briefly goes undefined again on every switch. Keep showing the last-loaded
  // summary while the new one fetches so the page doesn't flash the full-page loader.
  const [lastSummary, setLastSummary] = useState<typeof data>(undefined);
  useEffect(() => {
    if (data) setLastSummary(data);
  }, [data]);
  const summary = data ?? lastSummary;

  if (isLoading && !summary) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-ink">Dashboard</h1>
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  if (isError || !summary) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-ink">Dashboard</h1>
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
      <h1 className="mb-4 text-2xl font-semibold text-ink">Dashboard</h1>

      <DashboardFilterBar value={filters} onChange={setFilters} exams={exams} candidates={candidates} />

      <div className="mb-5 grid grid-cols-4 gap-3">
        <StatCard icon={Users} value={summary.stats.totalCandidates} label="Total Candidates" metric="candidates" color="#0d9488" delay={0} range={summaryWindow} />
        <StatCard icon={Mail} value={summary.stats.invitationsSent} label="Invitations Sent" metric="invitations" color="#334155" delay={0.04} range={summaryWindow} />
        <StatCard
          icon={Play}
          value={summary.stats.attemptsInProgress}
          label="Attempts In Progress"
          metric="attempts"
          color="#d4a017"
          delay={0.08}
          range={summaryWindow}
        />
        <StatCard
          icon={FileEdit}
          value={summary.stats.pendingGradingCount}
          label="Pending Grading"
          metric="pendingGrading"
          color="#f2765f"
          delay={0.12}
          range={summaryWindow}
        />
      </div>

      {/* Only worth a line when it says something the filter bar above doesn't already --
          i.e. once a filter has actually been narrowed from "everything, last 14 days". */}
      {!isDefaultFilterState(filters) && (
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Analysis</span>
          {filters.examId !== 'all' && (
            <span className="rounded-full bg-ground px-2 py-0.5">{exams.find((e) => e.id === filters.examId)?.title ?? 'Exam'}</span>
          )}
          {filters.candidateId !== 'all' && (
            <span className="rounded-full bg-ground px-2 py-0.5">{candidates.find((c) => c.id === filters.candidateId)?.name ?? 'Candidate'}</span>
          )}
          <span className="rounded-full bg-ground px-2 py-0.5">{describeTimeFilter(filters)}</span>
        </div>
      )}

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.16 }} className="mb-5 flex flex-col gap-4">
        {analytics ? (
          <AnalyticsPanels data={analytics} />
        ) : analyticsError ? (
          // Previously this branch did not exist: isError was discarded, so a failed analytics
          // fetch sat on "Loading analytics…" indefinitely and looked like a slow request.
          <Card>
            <p className="py-8 text-center text-sm text-status-danger">Failed to load analytics.</p>
          </Card>
        ) : (
          <Card>
            <p className="py-8 text-center text-sm text-muted">Loading analytics…</p>
          </Card>
        )}
        {/* Fetches on its own; must not depend on the analytics gate above. */}
        <QuestionHealthPanel />
      </motion.div>

      {summary.upcomingExams.length > 0 && (
        <div className="mb-5">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
            <Card>
              <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-ink">
                <CalendarClock size={14} />
                Upcoming exams
              </h2>
              <ul>
                {summary.upcomingExams.map((exam) => (
                  <li key={exam.examId} className="border-b border-rule last:border-0">
                    <Link href={`/exams/${exam.examId}/edit`} className="flex items-center gap-2.5 py-2.5 text-sm hover:bg-ground">
                      <span className="flex-1 text-ink">{exam.examTitle}</span>
                      <span className="text-xs text-muted">{new Date(exam.availabilityWindowStart).toLocaleDateString()}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </motion.div>
        </div>
      )}

      <div className="grid grid-cols-[1.3fr_1fr] gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.24 }}>
          <Card>
            <h2 className="mb-3 text-sm font-bold text-ink">Needs your attention</h2>
            {!hasAttention ? (
              <p className="text-sm text-muted">Nothing needs attention right now.</p>
            ) : (
              <ul>
                {summary.attention.pendingGrading.map((item) => (
                  <li key={item.examId} className="border-b border-rule last:border-0">
                    <Link href={`/exams/${item.examId}/edit`} className="flex items-center gap-2.5 py-2.5 text-sm hover:bg-ground">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-danger" />
                      <span className="flex-1 text-ink">
                        {item.examTitle}{' '}
                        <span className="text-muted">has {item.count} answer{item.count === 1 ? '' : 's'} awaiting manual grading</span>
                      </span>
                      <span className="rounded-full bg-ground px-2 py-0.5 text-xs font-bold text-muted">{item.count}</span>
                    </Link>
                  </li>
                ))}
                {summary.attention.recentProctoringFlags.map((flag, index) => (
                  <li key={`${flag.examId}-${index}`} className="border-b border-rule last:border-0">
                    <Link href={`/exams/${flag.examId}/edit`} className="flex items-center gap-2.5 py-2.5 text-sm hover:bg-ground">
                      <AlertTriangle size={13} className="shrink-0 text-status-warning" />
                      <span className="flex-1 text-ink">
                        {flag.examTitle} <span className="text-muted">flagged a proctoring violation</span>
                      </span>
                    </Link>
                  </li>
                ))}
                {summary.attention.staleInvitationCount > 0 && (
                  <li className="flex items-center gap-2.5 py-2.5 text-sm">
                    <Clock size={13} className="shrink-0 text-muted" />
                    <span className="flex-1 text-ink">
                      Candidates <span className="text-muted">invited 5+ days ago, haven&apos;t started</span>
                    </span>
                    <span className="rounded-full bg-ground px-2 py-0.5 text-xs font-bold text-muted">
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
            <h2 className="mb-3 text-sm font-bold text-ink">Recent activity</h2>
            {summary.activity.length === 0 ? (
              <p className="text-sm text-muted">No recent activity.</p>
            ) : (
              <ul>
                {summary.activity.map((item) => {
                  const Icon = activityIconFor(item.description);
                  return (
                    <li key={item.id} className="flex items-start gap-2.5 border-b border-rule py-2.5 text-sm last:border-0">
                      <span className="mt-0.5 flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full bg-status-success-bg text-status-success">
                        <Icon size={12} />
                      </span>
                      <div>
                        <p className="text-ink">{item.description}</p>
                        <p className="text-xs text-muted">{new Date(item.occurredAt).toLocaleString()}</p>
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
