import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '@exam-platform/shared';
import { TenantContext } from '@exam-platform/shared';
import { computeRemainingSeconds, effectiveDurationMinutes } from '../grading/grading';
import { isProctoringBypassActive } from '../attempts/proctoring-config';

const ONLINE_THRESHOLD_MS = 30_000;
export const ALERT_HISTORY_MINUTES = 30;
// Memory guard, not a policy. At 50 the replay was self-defeating: a fleet-wide misfire
// across 30 candidates seeded ~1.7 alerts each, so nobody could reach the 5-in-2-minutes
// the client needs to flag anyone. The 30-minute window is what actually bounds this
// query; the ceiling only stops a pathological exam from shipping a huge payload.
// Kept consistent with the client's per-attempt retention in lib/attention-alert.ts.
const MAX_RECENT_ALERTS = 2000;

export interface RecentAlert {
  attemptId: string;
  candidateId: string;
  eventType: string;
  severity: string;
  occurredAt: Date;
}

export interface RosterRow {
  candidateId: string;
  candidateName: string;
  invitationId: string;
  attemptId: string | null;
  status: string;
  online: boolean;
  remainingSeconds: number | null;
  answeredCount: number | null;
  totalQuestions: number | null;
  proctoringBypassed: boolean;
}

@Injectable()
export class MonitoringService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  isOnline(lastSeenAt: Date | null): boolean {
    if (!lastSeenAt) {
      return false;
    }
    return Date.now() - new Date(lastSeenAt).getTime() <= ONLINE_THRESHOLD_MS;
  }

  async getRosterSnapshot(context: TenantContext, examId: string): Promise<RosterRow[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }

      const invitations = await tx.invitation.findMany({
        where: { examId },
        include: { candidate: true, attempt: true },
        orderBy: [{ invitedAt: 'desc' }, { id: 'desc' }],
      });

      // One grouped count for the whole roster instead of one count() per invitation:
      // the presence tick re-runs this snapshot every 15s for every open exam page, so
      // the N+1 cost 200 candidates once meant ~800 count queries a minute, forever.
      const attemptIds = invitations.map((invitation) => invitation.attempt?.id).filter((id): id is string => !!id);
      const answeredCounts = new Map<string, number>();
      if (attemptIds.length > 0) {
        const grouped = await tx.answer.groupBy({
          by: ['attemptId'],
          where: { attemptId: { in: attemptIds } },
          _count: { _all: true },
        });
        for (const group of grouped) {
          answeredCounts.set(group.attemptId, group._count._all);
        }
      }

      const rows: RosterRow[] = [];
      for (const invitation of invitations) {
        const attempt = invitation.attempt;
        let answeredCount: number | null = null;
        let totalQuestions: number | null = null;
        let remainingSeconds: number | null = null;

        if (attempt) {
          totalQuestions = (JSON.parse(attempt.questionOrderJson) as string[]).length;
          // Absent from the grouped result means zero answers -- groupBy returns no row.
          answeredCount = answeredCounts.get(attempt.id) ?? 0;
          // Paused and blocked are not "over" -- the clock is frozen at pausedAt, same
          // as the settlement service's own remainingSeconds() computes it, so the
          // recruiter sees how much time is waiting for the candidate on resume rather
          // than a blank dash. pausedDurationMs (grace already banked from an earlier
          // pause-resume cycle) is included for all three live statuses; omitting it
          // previously under-reported time for anyone paused earlier in the same attempt.
          if (attempt.status === 'in_progress' || attempt.status === 'paused' || attempt.status === 'blocked') {
            const frozenAt = attempt.status === 'in_progress' ? null : attempt.pausedAt;
            remainingSeconds = computeRemainingSeconds(
              effectiveDurationMinutes(exam.durationMinutes, invitation.extraTimePercent),
              attempt.startedAt,
              attempt.pausedDurationMs,
              frozenAt,
            );
          }
        }

        rows.push({
          candidateId: invitation.candidateId,
          candidateName: invitation.candidate.name,
          invitationId: invitation.id,
          attemptId: attempt?.id ?? null,
          status: attempt?.status ?? invitation.status,
          online: attempt ? this.isOnline(attempt.lastSeenAt) : false,
          remainingSeconds,
          answeredCount,
          totalQuestions,
          proctoringBypassed: isProctoringBypassActive(attempt),
        });
      }
      return rows;
    });
  }

  // The recruiter's alert feed is in-memory socket state with no replay, so a recruiter
  // joining mid-exam previously saw zero alerts for everyone regardless of what had
  // happened. Replaying recent history makes the count truthful and lets the
  // attention rule see bursts that started before they opened the tab.
  async getRecentAlerts(context: TenantContext, examId: string): Promise<RecentAlert[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }
      const since = new Date(Date.now() - ALERT_HISTORY_MINUTES * 60_000);
      const events = await tx.proctoringEvent.findMany({
        where: { attempt: { examId }, severity: { in: ['medium', 'high'] }, occurredAt: { gt: since } },
        orderBy: { occurredAt: 'desc' },
        take: MAX_RECENT_ALERTS,
        include: { attempt: { select: { candidateId: true } } },
      });
      return events.map((event) => ({
        attemptId: event.attemptId,
        candidateId: event.attempt.candidateId,
        eventType: event.eventType,
        severity: event.severity,
        occurredAt: event.occurredAt,
      }));
    });
  }
}
