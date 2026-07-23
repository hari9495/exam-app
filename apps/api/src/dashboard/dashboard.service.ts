import { Injectable } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';

const STALE_INVITATION_DAYS = 5;
const ACTIVITY_ACTIONS = ['exam.published', 'invitation.created', 'attempt.settled', 'attempt.manually_graded'];
const ACTIVITY_LIMIT = 10;
const RECENT_PROCTORING_LIMIT = 5;
const UPCOMING_EXAMS_LIMIT = 5;

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
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async getSummary(context: TenantContext): Promise<DashboardSummary> {
    const organizationId = context.organizationId as string;

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exams = await tx.exam.findMany({ where: { organizationId }, select: { id: true, title: true } });
      const examIds = exams.map((exam) => exam.id);
      const examTitleById = new Map(exams.map((exam) => [exam.id, exam.title]));

      const staleThreshold = new Date(Date.now() - STALE_INVITATION_DAYS * 24 * 60 * 60 * 1000);

      const [
        totalCandidates,
        invitationsSent,
        attemptsInProgress,
        pendingGradingGroups,
        staleInvitationCount,
        recentProctoringEvents,
        auditRows,
        upcomingExamRows,
      ] = await Promise.all([
        tx.candidate.count({ where: { organizationId, erasedAt: null } }),
        tx.invitation.count({ where: { examId: { in: examIds } } }),
        tx.attempt.count({ where: { examId: { in: examIds }, status: 'in_progress' } }),
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

      const pendingGradingCount = pendingGradingGroups.reduce((sum, group) => sum + group._count._all, 0);

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
}
