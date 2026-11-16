import { Injectable, Logger } from '@nestjs/common';
import { BlobStorageService, TenantPrismaService } from '@exam-platform/shared';
import { notOnHold, RETENTION_MIN_DAYS, pastRetention, retentionByCompany, retentionCutoff } from '../assessments/asmt-rules';

// Webcam snapshots + screen captures are proctoring evidence; once the review window has passed they
// are candidate imagery with no remaining purpose. AS-2 (answer 2008): the window is each company's
// Settings 6.5 retention (asmt.retention, 30 to 365 days, default 30; it was a fixed 90), and evidence
// of an attempt whose result is held (an open incident or appeal) is kept until the result is released.
// Bound each metadata-rewrite tx so a big sweep never holds one long interactive transaction.
const WRITE_CHUNK = 50;

// Deletes webcam/screen proctoring images (and strips their URLs from metadataJson, keeping any other
// event metadata) once past the company's retention. Scheduled as a nightly BullMQ job scheduler by
// ScheduledSweepsModule.
@Injectable()
export class ProctoringRetentionService {
  private readonly logger = new Logger(ProctoringRetentionService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly blobStorage: BlobStorageService,
  ) {}

  async prune(now: Date = new Date()): Promise<number> {
    const superAdmin = { organizationId: null, isSuperAdmin: true };

    try {
      // A platform-wide housekeeping sweep in the super-admin context. Only rows past the shortest retention can be
      // due; each is then checked against its own company's days. Narrow to image-bearing rows, never a held result.
      const [days, candidates] = await this.tenantPrisma.forTenant(superAdmin, async (tx) => [
        await retentionByCompany(tx),
        await tx.proctoringEvent.findMany({
          where: {
            occurredAt: { lt: retentionCutoff(now, RETENTION_MIN_DAYS) },
            OR: [{ metadataJson: { contains: '"snapshot"' } }, { metadataJson: { contains: '"screenshot"' } }],
            AND: [notOnHold(now)],
          },
          select: { id: true, metadataJson: true, occurredAt: true, organizationId: true },
        }),
      ] as const);
      const rows = candidates.filter((r) => pastRetention(r.occurredAt, r.organizationId, days, now));
      if (rows.length === 0) return 0;

      const urls: string[] = [];
      const updates: { id: string; metadataJson: string | null }[] = [];
      for (const row of rows) {
        if (!row.metadataJson) continue;
        let meta: Record<string, unknown>;
        try {
          meta = JSON.parse(row.metadataJson) as Record<string, unknown>;
        } catch {
          continue; // unparseable metadata: leave it alone rather than guess
        }
        if (typeof meta.snapshot === 'string') urls.push(meta.snapshot);
        if (typeof meta.screenshot === 'string') urls.push(meta.screenshot);
        delete meta.snapshot;
        delete meta.screenshot;
        // Keep any other event metadata (e.g. an AI-analysis reason); null only when nothing is left.
        updates.push({ id: row.id, metadataJson: Object.keys(meta).length ? JSON.stringify(meta) : null });
      }

      // Delete blobs best-effort: one failure must not strand the DB rewrite (the URL is cleared
      // either way, and an orphaned blob is a smaller problem than retained candidate imagery).
      for (const url of urls) {
        try {
          await this.blobStorage.deleteByUrl(url);
        } catch (error) {
          this.logger.warn(`Failed to delete proctoring blob ${url}: ${(error as Error).message}`);
        }
      }

      for (let i = 0; i < updates.length; i += WRITE_CHUNK) {
        const batch = updates.slice(i, i + WRITE_CHUNK);
        await this.tenantPrisma.forTenant(superAdmin, (tx) =>
          Promise.all(batch.map((u) => tx.proctoringEvent.update({ where: { id: u.id }, data: { metadataJson: u.metadataJson } }))),
        );
      }

      this.logger.log(`Purged proctoring imagery from ${updates.length} event(s) past their company's retention (${urls.length} blob(s))`);
      return updates.length;
    } catch (error) {
      // Retention is housekeeping -- never crash the app or spam on a DB blip.
      this.logger.warn(`Proctoring retention prune failed: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }
}
