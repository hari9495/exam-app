import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { ClaudeProctoringClient } from './claude-proctoring.client';

const CLEAN_SUMMARY = 'No proctoring events were recorded during this attempt.';

@Injectable()
export class AttemptAnalysisService {
  private readonly logger = new Logger(AttemptAnalysisService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly claudeProctoringClient: ClaudeProctoringClient,
  ) {}

  async analyze(attemptId: string): Promise<void> {
    try {
      const attempt = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
        tx.attempt.findUnique({
          where: { id: attemptId },
          include: { invitation: { include: { exam: true } } },
        }),
      );
      if (!attempt) {
        this.logger.warn(`Attempt ${attemptId} not found, skipping proctoring analysis`);
        return;
      }

      const organizationId = attempt.invitation.exam.organizationId;
      await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
        const events = await tx.proctoringEvent.findMany({ where: { attemptId }, orderBy: { occurredAt: 'asc' } });

        if (events.length === 0) {
          await tx.proctoringAnalysis.upsert({
            where: { attemptId },
            create: { attemptId, status: 'skipped_clean', riskLevel: 'low', summary: CLEAN_SUMMARY },
            update: { status: 'skipped_clean', riskLevel: 'low', summary: CLEAN_SUMMARY, analyzedAt: new Date() },
          });
          return;
        }

        const timeline = events.map((event) => ({
          eventType: event.eventType,
          severity: event.severity,
          elapsedSeconds: Math.max(0, Math.round((event.occurredAt.getTime() - attempt.startedAt.getTime()) / 1000)),
        }));

        try {
          const assessment = await this.claudeProctoringClient.assessRisk(timeline);
          await tx.proctoringAnalysis.upsert({
            where: { attemptId },
            create: { attemptId, status: 'completed', riskLevel: assessment.riskLevel, summary: assessment.summary },
            update: { status: 'completed', riskLevel: assessment.riskLevel, summary: assessment.summary, analyzedAt: new Date() },
          });
        } catch (error) {
          this.logger.error(`Proctoring analysis failed for attempt ${attemptId}`, error as Error);
          await tx.proctoringAnalysis.upsert({
            where: { attemptId },
            create: { attemptId, status: 'failed', riskLevel: null, summary: null },
            update: { status: 'failed', riskLevel: null, summary: null, analyzedAt: new Date() },
          });
        }
      });
    } catch (error) {
      this.logger.error(`Proctoring analysis could not run for attempt ${attemptId}`, error as Error);
    }
  }
}
