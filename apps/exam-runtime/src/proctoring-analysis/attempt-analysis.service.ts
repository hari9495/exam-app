import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService, AiApiKeyResolverService } from '@exam-platform/shared';
import { ProctoringRiskClient } from './proctoring-risk.client';

const CLEAN_SUMMARY = 'No proctoring events were recorded during this attempt.';

@Injectable()
export class AttemptAnalysisService {
  private readonly logger = new Logger(AttemptAnalysisService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly proctoringRiskClient: ProctoringRiskClient,
    private readonly aiApiKeyResolver: AiApiKeyResolverService,
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
      const events = await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
        tx.proctoringEvent.findMany({ where: { attemptId }, orderBy: { occurredAt: 'asc' } }),
      );

      let result: { status: string; riskLevel: string | null; summary: string | null };
      if (events.length === 0) {
        result = { status: 'skipped_clean', riskLevel: 'low', summary: CLEAN_SUMMARY };
      } else {
        const timeline = events.map((event) => ({
          eventType: event.eventType,
          severity: event.severity,
          elapsedSeconds: Math.max(0, Math.round((event.occurredAt.getTime() - attempt.startedAt.getTime()) / 1000)),
        }));

        try {
          const aiProvider = await this.aiApiKeyResolver.resolve(organizationId);
          const assessment = await this.proctoringRiskClient.assessRisk(timeline, aiProvider);
          result = { status: 'completed', riskLevel: assessment.riskLevel, summary: assessment.summary };
        } catch (error) {
          this.logger.error(`Proctoring analysis failed for attempt ${attemptId}`, error as Error);
          result = { status: 'failed', riskLevel: null, summary: null };
        }
      }

      await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
        tx.proctoringAnalysis.upsert({
          where: { attemptId },
          create: { attemptId, ...result },
          update: { ...result, analyzedAt: new Date() },
        }),
      );
    } catch (error) {
      this.logger.error(`Proctoring analysis could not run for attempt ${attemptId}`, error as Error);
    }
  }
}
