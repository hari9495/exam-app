import { Injectable, Logger } from '@nestjs/common';
import { TenantContext, TenantPrismaService, isPendingForApprover } from '@exam-platform/shared';
import { dayWindow } from './today-window';

const STALE_INVITATION_DAYS = 5;
const ACTIVITY_ACTIONS = ['exam.published', 'invitation.created', 'attempt.settled', 'attempt.manually_graded'];
const ACTIVITY_LIMIT = 10;
const RECENT_PROCTORING_LIMIT = 5;
const UPCOMING_EXAMS_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const FEEDBACK_LOOKBACK_DAYS = 14;
const OFFER_EXPIRY_HORIZON_DAYS = 3;

export interface DashboardTrendPoint {
  date: string;
  value: number;
}

export interface DashboardTrend {
  points: DashboardTrendPoint[];
}

export interface DashboardExamPerformanceRow {
  examId: string;
  examTitle: string;
  passRate: number;
  avgScore: number;
  candidateCount: number;
}

export interface DashboardExamPerformance {
  exams: DashboardExamPerformanceRow[];
}

export interface DashboardFunnel {
  invited: number;
  started: number;
  submitted: number;
  passed: number;
}

export interface DashboardAnalytics {
  scores: {
    count: number;
    passRate: number | null;
    avg: number | null;
    median: number | null;
    p25: number | null;
    p75: number | null;
    distribution: { bucket: string; count: number }[];
  };
  integrity: {
    submittedAttempts: number;
    highConcern: number;
    review: number;
    clear: number;
    unanalyzed: number;
    highConcernRate: number;
    byType: { type: string; count: number }[];
  };
  funnel: DashboardFunnel & { completionRate: number; abandoned: number };
  timing: {
    avgMinutes: number | null;
    medianMinutes: number | null;
    distribution: { bucket: string; count: number }[];
  };
  examQuality: {
    examId: string;
    examTitle: string;
    candidateCount: number;
    avgScore: number;
    passRate: number;
    scoreSpread: number;
    avgMinutes: number | null;
    allottedMinutes: number;
  }[];
  questionDifficulty: { questionId: string; text: string; correctRate: number; answered: number }[];
}

export interface AnalyticsFilter {
  // Relative window, used only when an explicit from/to range isn't given.
  window: Window;
  examId?: string; // scope to one exam (else all of the org's)
  candidateId?: string; // scope to one candidate's attempts
  from?: string; // inclusive ISO date (yyyy-mm-dd) for a custom range / a specific month or year
  to?: string; // inclusive ISO date
}

// Resolves the filter's time bounds. An explicit from/to wins; otherwise the
// relative window's start with an open (now) end. Returns null bounds for "all
// time". `to` is treated as inclusive to the end of that day.
function resolveRange(filter: AnalyticsFilter): { start: Date | null; end: Date | null } {
  if (filter.from || filter.to) {
    const start = filter.from ? new Date(`${filter.from}T00:00:00.000Z`) : null;
    const end = filter.to ? new Date(`${filter.to}T23:59:59.999Z`) : null;
    return { start, end };
  }
  return { start: resolveWindowStart(filter.window), end: null };
}

function dateWithin(field: string, start: Date | null, end: Date | null): Record<string, unknown> {
  const bound: Record<string, Date> = {};
  if (start) bound.gte = start;
  if (end) bound.lte = end;
  return Object.keys(bound).length ? { [field]: bound } : {};
}

function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  const idx = Math.min(sortedAsc.length - 1, Math.floor((p / 100) * sortedAsc.length));
  return sortedAsc[idx];
}

// Ten evenly-spaced score buckets: 0-9, 10-19, ..., 90-100 (100 folds into the top).
function scoreHistogram(percentages: number[]): { bucket: string; count: number }[] {
  const buckets = Array.from({ length: 10 }, (_, i) => ({ bucket: `${i * 10}-${i * 10 + 9}`, count: 0 }));
  buckets[9].bucket = '90-100';
  for (const value of percentages) {
    const i = Math.min(9, Math.max(0, Math.floor(value / 10)));
    buckets[i].count += 1;
  }
  return buckets;
}

// Completion-time buckets in minutes, chosen to read well for typical exam lengths.
const DURATION_BUCKETS: { label: string; maxMinutes: number }[] = [
  { label: '<5m', maxMinutes: 5 },
  { label: '5-15m', maxMinutes: 15 },
  { label: '15-30m', maxMinutes: 30 },
  { label: '30-60m', maxMinutes: 60 },
  { label: '60-90m', maxMinutes: 90 },
  { label: '90m+', maxMinutes: Infinity },
];

function durationHistogram(minutes: number[]): { bucket: string; count: number }[] {
  const counts = DURATION_BUCKETS.map((b) => ({ bucket: b.label, count: 0 }));
  for (const m of minutes) {
    const i = DURATION_BUCKETS.findIndex((b) => m < b.maxMinutes);
    counts[i === -1 ? DURATION_BUCKETS.length - 1 : i].count += 1;
  }
  return counts;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

type Window = 'all' | '7d' | '14d' | '30d' | '90d';

function resolveWindowStart(window: Window): Date | null {
  switch (window) {
    case '7d':
      return daysAgo(7);
    case '14d':
      return daysAgo(14);
    case '30d':
      return daysAgo(30);
    case '90d':
      return daysAgo(90);
    case 'all':
      return null;
  }
}

function bucketByDay(timestamps: Date[], days: number): DashboardTrendPoint[] {
  const counts = new Map<string, number>();
  for (const timestamp of timestamps) {
    const key = timestamp.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const points: DashboardTrendPoint[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - offset);
    const key = date.toISOString().slice(0, 10);
    points.push({ date: key, value: counts.get(key) ?? 0 });
  }
  return points;
}

export interface TodayItem {
  id: string;
  candidateId: string | null;
  candidateName: string;
  subtitle: string;
  at: string | null;
  actionLabel: string;
  actionHref: string;
}

export interface TodayResponse {
  today: { iso: string; timeZone: string };
  needsYou: {
    feedbackOwed: TodayItem[];
    interviewsToday: TodayItem[];
    offersExpiring: TodayItem[];
    approvalsPending: TodayItem[];
    total: number;
  };
  watch: {
    staleInvitations: number;
    proctoringFlags: number;
    nextDrive: { id: string; name: string; groupName: string; startsAt: string; registered: number } | null;
  };
  week: { newApplicants: number; invited: number; awaitingGrading: number; passRate: number | null };
}

export interface DashboardSummary {
  stats: {
    totalCandidates: number;
    invitationsSent: number;
    attemptsInProgress: number;
    pendingGradingCount: number;
  };
  attention: {
    pendingGrading: { examId: string; examTitle: string; count: number }[];
    recentProctoringFlags: { examId: string; examTitle: string; occurredAt: string }[];
    staleInvitationCount: number;
  };
  activity: { id: string; description: string; occurredAt: string }[];
  upcomingExams: { examId: string; examTitle: string; availabilityWindowStart: string }[];
}

function describeActivity(action: string, entityId: string | null, metadata: Record<string, unknown> | null, examTitleById: Map<string, string>): string {
  switch (action) {
    case 'exam.published':
      return `${(entityId && examTitleById.get(entityId)) ?? 'An exam'} was published`;
    case 'invitation.created': {
      const count = typeof metadata?.count === 'number' ? metadata.count : 0;
      const examTitle = typeof metadata?.examTitle === 'string' ? metadata.examTitle : 'an exam';
      return `${count} candidate${count === 1 ? '' : 's'} invited to ${examTitle}`;
    }
    case 'attempt.settled':
      return 'An attempt was submitted';
    case 'attempt.manually_graded':
      return 'An attempt was manually graded';
    default:
      return action;
  }
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  // The signed-in recruiter's personal worklist: what needs THEM right now (interviews
  // they're on today, feedback they owe, offers about to lapse, approvals only they can
  // decide), plus org-wide things worth watching and a light weekly pulse. One `forTenant`
  // call gathers the raw rows; formatting (subtitles, ISO timestamps) happens after, using
  // the resolved timezone, so date-formatting logic never needs its own RLS transaction.
  async getToday(context: TenantContext, userId: string, now = new Date()): Promise<TodayResponse> {
    const organizationId = context.organizationId as string;

    const core = await this.tenantPrisma.forTenant(context, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { timeZone: true } });
      const win = dayWindow(now, user?.timeZone);
      const lookback = new Date(now.getTime() - FEEDBACK_LOOKBACK_DAYS * DAY_MS);
      const horizon = new Date(now.getTime() + OFFER_EXPIRY_HORIZON_DAYS * DAY_MS);
      const staleThreshold = new Date(now.getTime() - STALE_INVITATION_DAYS * DAY_MS);

      const mine = await tx.interview.findMany({
        where: {
          organizationId,
          status: 'confirmed',
          confirmedSlotId: { not: null },
          panelists: { some: { userId } },
          pipelineEntry: { candidate: { erasedAt: null } },
        },
        select: {
          id: true,
          confirmedSlotId: true,
          pipelineEntryId: true,
          candidateId: true,
          slots: { select: { id: true, startsAt: true, endsAt: true } },
          pipelineEntry: { select: { jobId: true, job: { select: { title: true } }, candidate: { select: { name: true } } } },
        },
      });
      const withSlot = mine
        .map((i) => ({ ...i, slot: i.slots.find((s) => s.id === i.confirmedSlotId) }))
        .filter((i): i is typeof i & { slot: NonNullable<(typeof i)['slot']> } => !!i.slot);
      const todays = withSlot
        .filter((i) => i.slot.startsAt >= win.start && i.slot.startsAt < win.end)
        .sort((a, b) => +a.slot.startsAt - +b.slot.startsAt);
      const ended = withSlot.filter((i) => i.slot.endsAt < now && i.slot.endsAt >= lookback);
      const rated = ended.length
        ? await tx.pipelineFeedback.findMany({
            where: { authorUserId: userId, entryId: { in: ended.map((i) => i.pipelineEntryId) } },
            select: { entryId: true },
          })
        : [];
      const ratedEntries = new Set(rated.map((r) => r.entryId));
      const owed = ended.filter((i) => !ratedEntries.has(i.pipelineEntryId)).sort((a, b) => +a.slot.endsAt - +b.slot.endsAt);

      const offers = await tx.offer.findMany({
        where: {
          organizationId,
          status: 'sent',
          respondedAt: null,
          expiresAt: { gt: now, lte: horizon },
          pipelineEntry: { candidate: { erasedAt: null } },
        },
        select: {
          id: true,
          candidateId: true,
          expiresAt: true,
          sentAt: true,
          pipelineEntry: { select: { jobId: true, job: { select: { title: true } }, candidate: { select: { name: true } } } },
        },
        orderBy: { expiresAt: 'asc' },
      });

      const pendingAll = await tx.approvalRequest.findMany({
        where: { organizationId, status: 'pending_approval' },
        select: { id: true, subjectType: true, subjectId: true, status: true, chainSnapshotJson: true, currentStepPosition: true, submittedAt: true },
        orderBy: { submittedAt: 'asc' },
      });
      const pending = pendingAll.filter((r) => isPendingForApprover(r, userId));
      const approvals: TodayItem[] = [];
      for (const r of pending) {
        let label = 'Approval';
        let candidateId: string | null = null;
        if (r.subjectType === 'job') {
          const job = await tx.job.findUnique({ where: { id: r.subjectId }, select: { title: true } });
          label = job?.title ?? label;
        } else if (r.subjectType === 'offer') {
          const offer = await tx.offer.findUnique({
            where: { id: r.subjectId },
            select: { candidateId: true, pipelineEntry: { select: { candidate: { select: { name: true } } } } },
          });
          label = offer?.pipelineEntry.candidate.name ?? label;
          candidateId = offer?.candidateId ?? null;
        }
        approvals.push({
          id: r.id,
          candidateId,
          candidateName: label,
          subtitle: `${r.subjectType === 'job' ? 'Requisition' : 'Offer'} · waiting for your decision`,
          at: r.submittedAt.toISOString(),
          actionLabel: 'Review',
          actionHref: '/v2/approvals',
        });
      }

      const exams = await tx.exam.findMany({ where: { organizationId }, select: { id: true } });
      const examIds = exams.map((e) => e.id);
      const [staleInvitations, proctoringFlags, drive] = await Promise.all([
        tx.invitation.count({ where: { examId: { in: examIds }, status: 'invited', invitedAt: { lte: staleThreshold }, attempt: null } }),
        // Recent flags only (7 days) -- an all-time count would just grow forever and stop
        // meaning "worth a look today".
        tx.proctoringEvent.count({
          where: { attempt: { examId: { in: examIds } }, occurredAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } },
        }),
        tx.driveSession.findFirst({
          where: { walkInGroup: { organizationId }, endsAt: { gt: now } },
          orderBy: { startsAt: 'asc' },
          select: { id: true, name: true, startsAt: true, walkInGroup: { select: { name: true } } },
        }),
      ]);
      const registered = drive ? await tx.invitation.count({ where: { driveSessionId: drive.id } }) : 0;

      return { win, todays, owed, offers, approvals, staleInvitations, proctoringFlags, drive, registered };
    });

    const fmtTime = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: core.win.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
    const daysAgoCount = (d: Date) => Math.max(0, Math.floor((now.getTime() - d.getTime()) / DAY_MS));
    const relDay = (d: Date) => {
      const n = daysAgoCount(d);
      return n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`;
    };
    const weekday = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: core.win.timeZone, weekday: 'long' }).format(d);

    const interviewsToday: TodayItem[] = core.todays.map((i) => ({
      id: i.id,
      candidateId: i.candidateId,
      candidateName: i.pipelineEntry.candidate.name,
      subtitle: `${i.pipelineEntry.job.title} · ${fmtTime(i.slot.startsAt)} with panel`,
      at: i.slot.startsAt.toISOString(),
      actionLabel: 'Open brief',
      actionHref: `/v2/jobs/${i.pipelineEntry.jobId}`,
    }));
    const feedbackOwed: TodayItem[] = core.owed.map((i) => ({
      id: i.id,
      candidateId: i.candidateId,
      candidateName: i.pipelineEntry.candidate.name,
      subtitle: `${i.pipelineEntry.job.title} · interviewed ${relDay(i.slot.endsAt)} · scorecard due`,
      at: i.slot.endsAt.toISOString(),
      actionLabel: 'Add feedback',
      actionHref: `/v2/jobs/${i.pipelineEntry.jobId}`,
    }));
    const offersExpiring: TodayItem[] = core.offers.map((o) => ({
      id: o.id,
      candidateId: o.candidateId,
      candidateName: o.pipelineEntry.candidate.name,
      subtitle: `${o.pipelineEntry.job.title} · offer sent ${o.sentAt ? relDay(o.sentAt) : 'recently'} · expires ${weekday(o.expiresAt)}`,
      at: o.expiresAt.toISOString(),
      actionLabel: 'Nudge',
      actionHref: `/v2/jobs/${o.pipelineEntry.jobId}`,
    }));

    const summary = await this.getSummary(context, '7d');
    let passRate: number | null = null;
    try {
      const rate = (await this.getAnalytics(context, { window: '7d' })).scores.passRate;
      passRate = rate === null ? null : Math.round(rate);
    } catch (err) {
      this.logger.warn(`today: analytics pass rate unavailable: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {
      today: { iso: core.win.iso, timeZone: core.win.timeZone },
      needsYou: {
        feedbackOwed,
        interviewsToday,
        offersExpiring,
        approvalsPending: core.approvals,
        total: feedbackOwed.length + interviewsToday.length + offersExpiring.length + core.approvals.length,
      },
      watch: {
        staleInvitations: core.staleInvitations,
        proctoringFlags: core.proctoringFlags,
        nextDrive: core.drive
          ? {
              id: core.drive.id,
              name: core.drive.name,
              groupName: core.drive.walkInGroup.name,
              startsAt: core.drive.startsAt.toISOString(),
              registered: core.registered,
            }
          : null,
      },
      week: {
        newApplicants: summary.stats.totalCandidates,
        invited: summary.stats.invitationsSent,
        awaitingGrading: summary.stats.pendingGradingCount,
        passRate,
      },
    };
  }

  async getSummary(context: TenantContext, window: Window): Promise<DashboardSummary> {
    const organizationId = context.organizationId as string;

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exams = await tx.exam.findMany({ where: { organizationId }, select: { id: true, title: true } });
      const examIds = exams.map((exam) => exam.id);
      const examTitleById = new Map(exams.map((exam) => [exam.id, exam.title]));

      const staleThreshold = new Date(Date.now() - STALE_INVITATION_DAYS * 24 * 60 * 60 * 1000);
      const windowStart = resolveWindowStart(window);

      const [
        totalCandidates,
        invitationsSent,
        attemptsInProgress,
        windowedPendingGradingGroups,
        pendingGradingGroups,
        staleInvitationCount,
        recentProctoringEvents,
        auditRows,
        upcomingExamRows,
      ] = await Promise.all([
        tx.candidate.count({
          where: { organizationId, erasedAt: null, ...(windowStart ? { createdAt: { gte: windowStart } } : {}) },
        }),
        tx.invitation.count({
          where: { examId: { in: examIds }, ...(windowStart ? { invitedAt: { gte: windowStart } } : {}) },
        }),
        tx.attempt.count({
          where: { examId: { in: examIds }, status: 'in_progress', ...(windowStart ? { startedAt: { gte: windowStart } } : {}) },
        }),
        tx.attempt.groupBy({
          by: ['examId'],
          where: {
            examId: { in: examIds },
            status: 'pending_manual_grade',
            ...(windowStart ? { submittedAt: { gte: windowStart } } : {}),
          },
          _count: { _all: true },
        }),
        tx.attempt.groupBy({ by: ['examId'], where: { examId: { in: examIds }, status: 'pending_manual_grade' }, _count: { _all: true } }),
        tx.invitation.count({
          where: { examId: { in: examIds }, status: 'invited', invitedAt: { lte: staleThreshold }, attempt: null },
        }),
        tx.proctoringEvent.findMany({
          where: { attempt: { examId: { in: examIds } } },
          orderBy: { occurredAt: 'desc' },
          take: RECENT_PROCTORING_LIMIT,
          include: { attempt: { select: { examId: true } } },
        }),
        tx.auditLog.findMany({
          where: { organizationId, action: { in: ACTIVITY_ACTIONS } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: ACTIVITY_LIMIT,
        }),
        tx.exam.findMany({
          where: { organizationId, schedulingEnabled: true, availabilityWindowStart: { gt: new Date() } },
          select: { id: true, title: true, availabilityWindowStart: true },
          orderBy: { availabilityWindowStart: 'asc' },
          take: UPCOMING_EXAMS_LIMIT,
        }),
      ]);

      const pendingGradingCount = windowedPendingGradingGroups.reduce((sum, group) => sum + group._count._all, 0);

      return {
        stats: {
          totalCandidates,
          invitationsSent,
          attemptsInProgress,
          pendingGradingCount,
        },
        attention: {
          pendingGrading: pendingGradingGroups.map((group) => ({
            examId: group.examId,
            examTitle: examTitleById.get(group.examId) ?? 'Unknown exam',
            count: group._count._all,
          })),
          recentProctoringFlags: recentProctoringEvents.map((event) => ({
            examId: event.attempt.examId,
            examTitle: examTitleById.get(event.attempt.examId) ?? 'Unknown exam',
            occurredAt: event.occurredAt.toISOString(),
          })),
          staleInvitationCount,
        },
        activity: auditRows.map((row) => ({
          id: row.id,
          description: describeActivity(row.action, row.entityId, row.metadataJson ? JSON.parse(row.metadataJson) : null, examTitleById),
          occurredAt: row.createdAt.toISOString(),
        })),
        upcomingExams: upcomingExamRows.map((exam) => ({
          examId: exam.id,
          examTitle: exam.title,
          availabilityWindowStart: exam.availabilityWindowStart!.toISOString(),
        })),
      };
    });
  }

  async getTrend(
    context: TenantContext,
    metric: 'candidates' | 'invitations' | 'attempts' | 'pendingGrading',
    days: 7 | 14 | 30 | 90,
  ): Promise<DashboardTrend> {
    const organizationId = context.organizationId as string;

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exams = await tx.exam.findMany({ where: { organizationId }, select: { id: true } });
      const examIds = exams.map((exam) => exam.id);
      const windowStart = daysAgo(days);

      let timestamps: Date[];
      switch (metric) {
        case 'candidates': {
          const rows = await tx.candidate.findMany({
            where: { organizationId, erasedAt: null, createdAt: { gte: windowStart } },
            select: { createdAt: true },
          });
          timestamps = rows.map((row) => row.createdAt);
          break;
        }
        case 'invitations': {
          const rows = await tx.invitation.findMany({
            where: { examId: { in: examIds }, invitedAt: { gte: windowStart } },
            select: { invitedAt: true },
          });
          timestamps = rows.map((row) => row.invitedAt);
          break;
        }
        case 'attempts': {
          const rows = await tx.attempt.findMany({
            where: { examId: { in: examIds }, startedAt: { gte: windowStart } },
            select: { startedAt: true },
          });
          timestamps = rows.map((row) => row.startedAt);
          break;
        }
        case 'pendingGrading': {
          const rows = await tx.attempt.findMany({
            where: { examId: { in: examIds }, status: 'pending_manual_grade', submittedAt: { gte: windowStart } },
            select: { submittedAt: true },
          });
          timestamps = rows.map((row) => row.submittedAt as Date);
          break;
        }
      }

      return { points: bucketByDay(timestamps, days) };
    });
  }

  async getExamPerformance(
    context: TenantContext,
    limit: number | 'all',
    window: Window,
  ): Promise<DashboardExamPerformance> {
    const organizationId = context.organizationId as string;

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exams = await tx.exam.findMany({ where: { organizationId }, select: { id: true, title: true } });
      const examIds = exams.map((exam) => exam.id);
      const examTitleById = new Map(exams.map((exam) => [exam.id, exam.title]));
      const windowStart = resolveWindowStart(window);

      const results = await tx.result.findMany({
        where: {
          attempt: {
            examId: { in: examIds },
            ...(windowStart ? { submittedAt: { gte: windowStart } } : {}),
          },
        },
        select: { passFail: true, percentage: true, attempt: { select: { examId: true, candidateId: true } } },
      });

      const byExam = new Map<string, { passCount: number; scoreSum: number; total: number; candidateIds: Set<string> }>();
      for (const result of results) {
        const examId = result.attempt.examId;
        const bucket = byExam.get(examId) ?? { passCount: 0, scoreSum: 0, total: 0, candidateIds: new Set<string>() };
        bucket.total += 1;
        bucket.scoreSum += result.percentage;
        if (result.passFail === 'pass') bucket.passCount += 1;
        bucket.candidateIds.add(result.attempt.candidateId);
        byExam.set(examId, bucket);
      }

      const rows = Array.from(byExam.entries())
        .map(([examId, bucket]) => ({
          examId,
          examTitle: examTitleById.get(examId) ?? 'Unknown exam',
          passRate: Math.round((bucket.passCount / bucket.total) * 100),
          avgScore: Math.round(bucket.scoreSum / bucket.total),
          candidateCount: bucket.candidateIds.size,
        }))
        .sort((a, b) => b.candidateCount - a.candidateCount);

      const limited = limit === 'all' ? rows : rows.slice(0, limit);
      return { exams: limited };
    });
  }

  async getFunnel(context: TenantContext, examId: string, window: Window): Promise<DashboardFunnel> {
    const organizationId = context.organizationId as string;

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exams = await tx.exam.findMany({ where: { organizationId }, select: { id: true } });
      const examIds = exams.map((exam) => exam.id);
      const targetExamIds = examId === 'all' ? examIds : examIds.filter((id) => id === examId);
      const windowStart = resolveWindowStart(window);
      const invitationFilter = windowStart ? { invitedAt: { gte: windowStart } } : {};

      const [invited, started, submitted, passed] = await Promise.all([
        tx.invitation.count({ where: { examId: { in: targetExamIds }, ...invitationFilter } }),
        tx.attempt.count({
          where: { examId: { in: targetExamIds }, ...(windowStart ? { invitation: invitationFilter } : {}) },
        }),
        tx.attempt.count({
          where: {
            examId: { in: targetExamIds },
            submittedAt: { not: null },
            ...(windowStart ? { invitation: invitationFilter } : {}),
          },
        }),
        tx.result.count({
          where: {
            attempt: { examId: { in: targetExamIds }, ...(windowStart ? { invitation: invitationFilter } : {}) },
            passFail: 'pass',
          },
        }),
      ]);

      return { invited, started, submitted, passed };
    });
  }

  // One comprehensive analytics read for the dashboard (recruiter-only, low
  // traffic, so a single fat call is fine). Everything is windowed by the
  // attempt's submittedAt so the numbers describe completed assessments.
  async getAnalytics(context: TenantContext, filter: AnalyticsFilter): Promise<DashboardAnalytics> {
    const organizationId = context.organizationId as string;

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const allExams = await tx.exam.findMany({
        where: { organizationId },
        select: { id: true, title: true, durationMinutes: true },
      });
      // Scope to one exam if asked; the filter never widens past the org's own exams.
      const exams = filter.examId ? allExams.filter((exam) => exam.id === filter.examId) : allExams;
      const examIds = exams.map((exam) => exam.id);
      const examById = new Map(exams.map((exam) => [exam.id, exam]));

      if (examIds.length === 0) {
        return this.emptyAnalytics();
      }

      const { start, end } = resolveRange(filter);
      const candidateFilter = filter.candidateId ? { candidateId: filter.candidateId } : {};
      // Completed-assessment scope: an attempt that was submitted inside the range.
      // With no range, "submitted at all" (submittedAt not null) still applies so the
      // numbers describe finished attempts, not in-progress ones.
      const submittedScope = {
        examId: { in: examIds },
        ...candidateFilter,
        ...(start || end ? dateWithin('submittedAt', start, end) : { submittedAt: { not: null } }),
      };

      const [results, eventsByType, levelsGrouped, invited, started, submitted, passed, answerRows, questions] = await Promise.all([
        tx.result.findMany({
          where: { attempt: submittedScope },
          select: { percentage: true, passFail: true, attempt: { select: { examId: true, candidateId: true, startedAt: true, submittedAt: true } } },
        }),
        tx.proctoringEvent.groupBy({ by: ['eventType'], where: { attempt: submittedScope }, _count: { _all: true } }),
        tx.integrityAnalysis.groupBy({ by: ['level'], where: { attempt: submittedScope }, _count: { _all: true } }),
        // Funnel computed inline so it honours the exam/candidate/date filters. Each
        // stage is bounded by its own relevant timestamp.
        tx.invitation.count({ where: { examId: { in: examIds }, ...candidateFilter, ...dateWithin('invitedAt', start, end) } }),
        tx.attempt.count({ where: { examId: { in: examIds }, ...candidateFilter, ...dateWithin('startedAt', start, end) } }),
        tx.attempt.count({ where: submittedScope }),
        tx.result.count({ where: { attempt: submittedScope, passFail: 'pass' } }),
        tx.answer.groupBy({ by: ['questionId'], where: { attempt: submittedScope, isCorrect: { not: null } }, _count: { _all: true }, _sum: { marksAwarded: true } }),
        tx.answer.groupBy({ by: ['questionId'], where: { attempt: submittedScope, isCorrect: true }, _count: { _all: true } }),
      ]);
      const funnel = { invited, started, submitted, passed };

      // ----- Scores -----
      const percentages = results.map((r) => r.percentage).sort((a, b) => a - b);
      const passCount = results.filter((r) => r.passFail === 'pass').length;
      const scores = {
        count: results.length,
        passRate: results.length ? Math.round((passCount / results.length) * 100) : null,
        avg: percentages.length ? Math.round(percentages.reduce((s, v) => s + v, 0) / percentages.length) : null,
        median: percentile(percentages, 50) === null ? null : Math.round(percentile(percentages, 50)!),
        p25: percentile(percentages, 25) === null ? null : Math.round(percentile(percentages, 25)!),
        p75: percentile(percentages, 75) === null ? null : Math.round(percentile(percentages, 75)!),
        distribution: scoreHistogram(percentages),
      };

      // ----- Integrity -----
      // Read the stored verdict, never derive one. The previous computation here
      // (violation counters > 0 => flagged) was the threshold-of-one logic PR #29
      // removed from integrity-rules, and it showed 85% flagged while the
      // recalibrated levels said 9%. integrity_analyses is the single source of
      // truth for what an attempt's evidence means.
      const levelCounts = new Map(levelsGrouped.map((g) => [g.level, g._count._all]));
      const highConcern = levelCounts.get('high_concern') ?? 0;
      const review = levelCounts.get('review') ?? 0;
      const clear = levelCounts.get('clear') ?? 0;
      const analyzed = highConcern + review + clear;
      const integrity = {
        submittedAttempts: submitted,
        highConcern,
        review,
        clear,
        // Includes attempts with no analysis row AND rows with a null level:
        // absence must be visible, not read as clean.
        unanalyzed: submitted - analyzed,
        highConcernRate: analyzed ? Math.round((highConcern / analyzed) * 100) : 0,
        byType: eventsByType.map((g) => ({ type: g.eventType, count: g._count._all })).sort((a, b) => b.count - a.count),
      };

      // ----- Funnel (+ completion / abandoned) -----
      const funnelOut = {
        ...funnel,
        completionRate: funnel.started ? Math.round((funnel.submitted / funnel.started) * 100) : 0,
        abandoned: Math.max(0, funnel.started - funnel.submitted),
      };

      // ----- Timing -----
      const durations = results
        .map((r) => (r.attempt.submittedAt ? (r.attempt.submittedAt.getTime() - r.attempt.startedAt.getTime()) / 60000 : null))
        .filter((m): m is number => m !== null && m >= 0)
        .sort((a, b) => a - b);
      const timing = {
        avgMinutes: durations.length ? Math.round(durations.reduce((s, v) => s + v, 0) / durations.length) : null,
        medianMinutes: percentile(durations, 50) === null ? null : Math.round(percentile(durations, 50)!),
        distribution: durationHistogram(durations),
      };

      // ----- Exam quality -----
      const perExam = new Map<string, { scores: number[]; pass: number; candidateIds: Set<string>; durations: number[] }>();
      for (const r of results) {
        const bucket = perExam.get(r.attempt.examId) ?? { scores: [], pass: 0, candidateIds: new Set<string>(), durations: [] };
        bucket.scores.push(r.percentage);
        if (r.passFail === 'pass') bucket.pass += 1;
        bucket.candidateIds.add(r.attempt.candidateId);
        if (r.attempt.submittedAt) bucket.durations.push((r.attempt.submittedAt.getTime() - r.attempt.startedAt.getTime()) / 60000);
        perExam.set(r.attempt.examId, bucket);
      }
      const examQuality = Array.from(perExam.entries())
        .map(([examId, b]) => {
          const avg = b.scores.reduce((s, v) => s + v, 0) / b.scores.length;
          const variance = b.scores.reduce((s, v) => s + (v - avg) ** 2, 0) / b.scores.length;
          const validDurations = b.durations.filter((m) => m >= 0);
          return {
            examId,
            examTitle: examById.get(examId)?.title ?? 'Unknown exam',
            candidateCount: b.candidateIds.size,
            avgScore: Math.round(avg),
            passRate: Math.round((b.pass / b.scores.length) * 100),
            scoreSpread: Math.round(Math.sqrt(variance)),
            avgMinutes: validDurations.length ? Math.round(validDurations.reduce((s, v) => s + v, 0) / validDurations.length) : null,
            allottedMinutes: examById.get(examId)?.durationMinutes ?? 0,
          };
        })
        .sort((a, b) => b.candidateCount - a.candidateCount);

      // ----- Question difficulty (lowest correct-rate first) -----
      const correctByQuestion = new Map(questions.map((g) => [g.questionId, g._count._all]));
      const difficulty = answerRows
        .map((g) => ({ questionId: g.questionId, answered: g._count._all, correct: correctByQuestion.get(g.questionId) ?? 0 }))
        .filter((row) => row.answered >= 3) // ignore near-zero-sample questions
        .map((row) => ({ questionId: row.questionId, answered: row.answered, correctRate: Math.round((row.correct / row.answered) * 100) }))
        .sort((a, b) => a.correctRate - b.correctRate)
        .slice(0, 8);
      const questionTexts = difficulty.length
        ? await tx.question.findMany({ where: { id: { in: difficulty.map((d) => d.questionId) } }, select: { id: true, text: true } })
        : [];
      const textById = new Map(questionTexts.map((q) => [q.id, q.text]));
      const questionDifficulty = difficulty.map((d) => ({
        questionId: d.questionId,
        text: textById.get(d.questionId) ?? 'Question',
        correctRate: d.correctRate,
        answered: d.answered,
      }));

      return { scores, integrity, funnel: funnelOut, timing, examQuality, questionDifficulty };
    });
  }

  private emptyAnalytics(): DashboardAnalytics {
    return {
      scores: { count: 0, passRate: null, avg: null, median: null, p25: null, p75: null, distribution: scoreHistogram([]) },
      integrity: { submittedAttempts: 0, highConcern: 0, review: 0, clear: 0, unanalyzed: 0, highConcernRate: 0, byType: [] },
      funnel: { invited: 0, started: 0, submitted: 0, passed: 0, completionRate: 0, abandoned: 0 },
      timing: { avgMinutes: null, medianMinutes: null, distribution: durationHistogram([]) },
      examQuality: [],
      questionDifficulty: [],
    };
  }
}
