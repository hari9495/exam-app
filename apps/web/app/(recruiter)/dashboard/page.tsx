'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { BarChart, Bar, FunnelChart, Funnel, LabelList, ResponsiveContainer } from 'recharts';
import { Users, Mail, Play, FileEdit, AlertTriangle, Clock, CheckCircle2, FileEdit as FileEditIcon, Plus, CalendarClock } from 'lucide-react';
import { useDashboardSummary } from '../../../lib/hooks/useDashboard';
import { Card, Button } from '../../../components/ui';

function activityIconFor(description: string) {
  if (description.includes('invited')) return Mail;
  if (description.includes('published')) return CheckCircle2;
  if (description.includes('graded')) return FileEditIcon;
  return CheckCircle2;
}

interface StatCardProps {
  icon: typeof Users;
  value: number;
  label: string;
  iconBg: string;
  iconColor: string;
  accentBorder: string;
  sparkline: number[];
  barColor: string;
  delay: number;
  prefersReducedMotion: boolean;
}

function StatCard({ icon: Icon, value, label, iconBg, iconColor, accentBorder, sparkline, barColor, delay, prefersReducedMotion }: StatCardProps) {
  const sparkData = sparkline.map((v, i) => ({ i, v }));
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay, ease: 'easeOut' }} whileHover={{ y: -3 }}>
      <Card className={`border-l-[3px] ${accentBorder} shadow-sm transition-shadow hover:shadow-md`}>
        <div className={`mb-2 flex h-7 w-7 items-center justify-center rounded-md ${iconBg} ${iconColor}`}>
          <Icon size={15} />
        </div>
        <p className="text-2xl font-bold text-recruiter-text">{value}</p>
        <p className="text-xs text-recruiter-text-tertiary">{label}</p>
        <div className="mt-2 h-5 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sparkData}>
              <Bar dataKey="v" fill={barColor} radius={[1, 1, 0, 0]} isAnimationActive={!prefersReducedMotion} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </motion.div>
  );
}

export default function DashboardPage() {
  const { data: summary, isLoading, isError } = useDashboardSummary();
  const prefersReducedMotion = useReducedMotion();

  if (isLoading) {
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

  const funnelData = [
    { name: 'Invited', value: summary.funnel.invited, fill: '#6366f1' },
    { name: 'Started', value: summary.funnel.started, fill: '#818cf8' },
    { name: 'Submitted', value: summary.funnel.submitted, fill: '#a5b4fc' },
    { name: 'Passed', value: summary.funnel.passed, fill: '#22c55e' },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Dashboard</h1>

      <div className="mb-5 grid grid-cols-4 gap-3">
        <StatCard
          icon={Users}
          value={summary.stats.totalCandidates}
          label="Total candidates"
          iconBg="bg-status-success-bg"
          iconColor="text-status-success"
          accentBorder="border-status-success"
          sparkline={[3, 5, 4, 7, 6]}
          barColor="#22c55e"
          delay={0}
          prefersReducedMotion={!!prefersReducedMotion}
        />
        <StatCard
          icon={Mail}
          value={summary.stats.invitationsSent}
          label="Invitations sent"
          iconBg="bg-status-success-bg"
          iconColor="text-status-success"
          accentBorder="border-status-info"
          sparkline={[4, 6, 5, 8, 7]}
          barColor="#2955a3"
          delay={0.04}
          prefersReducedMotion={!!prefersReducedMotion}
        />
        <StatCard
          icon={Play}
          value={summary.stats.attemptsInProgress}
          label="Attempts in progress"
          iconBg="bg-status-warning-bg"
          iconColor="text-status-warning"
          accentBorder="border-status-warning"
          sparkline={[2, 3, 5, 4, 6]}
          barColor="#8a5a00"
          delay={0.08}
          prefersReducedMotion={!!prefersReducedMotion}
        />
        <StatCard
          icon={FileEdit}
          value={summary.stats.pendingGradingCount}
          label="Pending grading"
          iconBg="bg-status-danger-bg"
          iconColor="text-status-danger"
          accentBorder="border-status-danger"
          sparkline={[1, 2, 1, 3, 2]}
          barColor="#b23b3b"
          delay={0.12}
          prefersReducedMotion={!!prefersReducedMotion}
        />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.16 }}>
          <Card>
            <h2 className="mb-3 text-sm font-bold text-recruiter-text">Candidate funnel</h2>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <FunnelChart>
                  <Funnel dataKey="value" data={funnelData} isAnimationActive={!prefersReducedMotion}>
                    <LabelList position="right" dataKey="name" fill="#57615B" stroke="none" fontSize={11} />
                  </Funnel>
                </FunnelChart>
              </ResponsiveContainer>
            </div>
          </Card>
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
                    <Link
                      href={`/exams/${item.examId}/edit`}
                      className="flex items-center gap-2.5 py-2.5 text-sm hover:bg-recruiter-bg-subtle"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-danger" />
                      <span className="flex-1 text-recruiter-text">
                        {item.examTitle} <span className="text-recruiter-text-tertiary">has {item.count} answer{item.count === 1 ? '' : 's'} awaiting manual grading</span>
                      </span>
                      <span className="rounded-full bg-recruiter-bg-subtle px-2 py-0.5 text-xs font-bold text-recruiter-text-secondary">{item.count}</span>
                    </Link>
                  </li>
                ))}
                {summary.attention.recentProctoringFlags.map((flag, index) => (
                  <li key={`${flag.examId}-${index}`} className="border-b border-recruiter-border last:border-0">
                    <Link
                      href={`/exams/${flag.examId}/edit`}
                      className="flex items-center gap-2.5 py-2.5 text-sm hover:bg-recruiter-bg-subtle"
                    >
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
