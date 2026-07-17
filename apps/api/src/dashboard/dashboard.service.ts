import { Injectable } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';

const STALE_INVITATION_DAYS = 5;
const ACTIVITY_ACTIONS = ['exam.published', 'invitation.created', 'attempt.settled', 'attempt.manually_graded'];
const ACTIVITY_LIMIT = 10;
const RECENT_PROCTORING_LIMIT = 5;

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
      };
    });
  }
}
