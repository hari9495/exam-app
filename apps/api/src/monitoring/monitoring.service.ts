import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { TenantContext } from '../prisma/tenant-context';
import { computeRemainingSeconds } from '../grading/grading';

const ONLINE_THRESHOLD_MS = 30_000;

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

      const rows: RosterRow[] = [];
      for (const invitation of invitations) {
        const attempt = invitation.attempt;
        let answeredCount: number | null = null;
        let totalQuestions: number | null = null;
        let remainingSeconds: number | null = null;

        if (attempt) {
          totalQuestions = (JSON.parse(attempt.questionOrderJson) as string[]).length;
          answeredCount = await tx.answer.count({ where: { attemptId: attempt.id } });
          if (attempt.status === 'in_progress') {
            remainingSeconds = computeRemainingSeconds(exam.durationMinutes, attempt.startedAt);
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
        });
      }
      return rows;
    });
  }
}
