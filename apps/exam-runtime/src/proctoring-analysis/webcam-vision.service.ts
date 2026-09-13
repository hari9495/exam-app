import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService, AiApiKeyResolverService, AiNotConfiguredError, BlobStorageService } from '@exam-platform/shared';
import { QuotaService } from '../billing/quota.service';
import { resolveProctoringConfig } from '../attempts/proctoring-config';
import { getProctoringEventSeverity } from '../attempts/proctoring-severity';
import { WebcamVisionClient } from './webcam-vision.client';

// Cap the frames sent per attempt: bounds AI cost + payload while still covering the exam duration.
const MAX_FRAMES = 8;

@Injectable()
export class WebcamVisionService {
  private readonly logger = new Logger(WebcamVisionService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly aiApiKeyResolver: AiApiKeyResolverService,
    private readonly quota: QuotaService,
    private readonly blobStorage: BlobStorageService,
    private readonly client: WebcamVisionClient,
  ) {}

  async analyze(attemptId: string): Promise<void> {
    try {
      const attempt = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
        tx.attempt.findUnique({ where: { id: attemptId }, include: { invitation: { include: { exam: true } } } }),
      );
      if (!attempt) return;

      const exam = attempt.invitation.exam;
      const organizationId = exam.organizationId;
      const config = resolveProctoringConfig(exam, attempt);
      if (!config.webcamAiAnalysisEnabled) return; // opt-in per exam; also off when webcam is off

      const context = { organizationId, isSuperAdmin: false };
      const snapshots = await this.tenantPrisma.forTenant(context, (tx) =>
        tx.proctoringEvent.findMany({ where: { attemptId, eventType: 'webcam_snapshot' }, orderBy: { occurredAt: 'asc' } }),
      );
      const urls = snapshots.map((e) => this.snapshotUrl(e.metadataJson)).filter((u): u is string => Boolean(u));
      if (urls.length === 0) return;

      // Provider first (skip silently if the org hasn't configured AI), then charge, then work.
      const aiProvider = await this.aiApiKeyResolver.resolve(organizationId).catch((error) => {
        if (error instanceof AiNotConfiguredError) return null;
        throw error;
      });
      if (!aiProvider) return;
      await this.quota.assertAiCredits(context);

      const images = await this.downloadFrames(this.sample(urls, MAX_FRAMES));
      if (images.length === 0) return;

      const verdict = await this.client.analyze(images, aiProvider);

      await this.tenantPrisma.forTenant(context, async (tx) => {
        // One credit per analysis call, billed whether or not it flags (the spend happened).
        await tx.aiCreditUsage.create({ data: { organizationId, source: 'webcam_vision', credits: 1, sourceId: attemptId } });
        if (verdict.flags.length === 0) return; // clean — no event, no noise
        await tx.proctoringEvent.create({
          data: {
            attemptId,
            eventType: 'webcam_ai_flag',
            severity: getProctoringEventSeverity('webcam_ai_flag'),
            metadataJson: JSON.stringify({
              riskLevel: verdict.riskLevel,
              summary: verdict.summary,
              flags: verdict.flags,
              framesAnalyzed: images.length,
            }),
          },
        });
      });
    } catch (error) {
      // Best-effort, like every settlement analysis — a failure never blocks grading.
      this.logger.warn(`Webcam vision analysis skipped for attempt ${attemptId}: ${(error as Error).message}`);
    }
  }

  private snapshotUrl(metadataJson: string | null): string | null {
    if (!metadataJson) return null;
    try {
      const parsed = JSON.parse(metadataJson);
      return typeof parsed?.snapshot === 'string' ? parsed.snapshot : null;
    } catch {
      return null;
    }
  }

  // Evenly spaced sample across the attempt so a peek at the whole duration, not just the start.
  private sample(urls: string[], max: number): string[] {
    if (urls.length <= max) return urls;
    const step = urls.length / max;
    const out: string[] = [];
    for (let i = 0; i < max; i++) out.push(urls[Math.floor(i * step)]);
    return out;
  }

  private async downloadFrames(urls: string[]): Promise<string[]> {
    const results = await Promise.all(
      urls.map(async (url) => {
        try {
          const buf = await this.blobStorage.downloadToBuffer(url);
          return `data:image/jpeg;base64,${buf.toString('base64')}`;
        } catch (error) {
          this.logger.warn(`Could not download webcam snapshot: ${(error as Error).message}`);
          return null;
        }
      }),
    );
    return results.filter((r): r is string => r !== null);
  }
}
