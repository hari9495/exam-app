import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BlobStorageService, TenantPrismaService } from '@exam-platform/shared';

// Fixed by the design spec (2026-08-10). Biometric data must not outlive its purpose, and the
// review window is the purpose -- see docs/superpowers/specs/2026-08-10-face-identification-design.md.
const RETENTION_DAYS = 90;
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Deletes face reference images (and clears the row) 90 days after the owning attempt
// finalised -- on boot and then daily. Same plain-interval pattern as
// SystemEventsRetentionService: a single pm2 process, no queue infra needed for one daily sweep.
// ponytail: single-process interval; move to a repeatable queue job if api ever scales out.
@Injectable()
export class FaceRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FaceRetentionService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly blobStorage: BlobStorageService,
  ) {}

  onModuleInit(): void {
    void this.prune();
    this.timer = setInterval(() => void this.prune(), PRUNE_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async prune(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const superAdmin = { organizationId: null, isSuperAdmin: true };

    try {
      const expired = await this.tenantPrisma.forTenant(superAdmin, (tx) =>
        tx.faceEnrolment.findMany({
          where: {
            // A declined-consent update (recordFaceEnrolment) nulls referenceImagePath but keeps
            // a previously-stored embedding, so filtering on referenceImagePath alone stopped
            // matching that row -- an encrypted biometric template with no expiry, past the
            // 90-day purpose limitation. Either column being non-null is enough to be a prune
            // candidate.
            OR: [{ referenceImagePath: { not: null } }, { embedding: { not: null } }],
            attempt: {
              OR: [
                { submittedAt: { lt: cutoff } },
                // An attempt that never finalised -- blocked, or simply abandoned -- never gets a
                // submittedAt, so keying purely off it retained those reference images forever,
                // and precisely for the candidates most likely to have been flagged. Age such an
                // attempt from when it started instead.
                { submittedAt: null, startedAt: { lt: cutoff } },
              ],
            },
          },
          select: { id: true, referenceImagePath: true },
        }),
      );
      if (expired.length === 0) return 0;

      // One failed blob delete must not strand the remaining rows: the DB reference is cleared
      // either way, and an orphaned blob is a smaller problem than retained biometric data.
      for (const row of expired) {
        // A row can now be a prune candidate on embedding alone (see the OR above), with no
        // image to delete -- skip the blob call rather than hand it a null URL.
        if (!row.referenceImagePath) continue;
        try {
          await this.blobStorage.deleteByUrl(row.referenceImagePath);
        } catch (error) {
          this.logger.warn(`Failed to delete face reference blob for ${row.id}: ${(error as Error).message}`);
        }
      }

      await this.tenantPrisma.forTenant(superAdmin, (tx) =>
        tx.faceEnrolment.updateMany({
          where: { id: { in: expired.map((row) => row.id) } },
          data: { referenceImagePath: null, embedding: null },
        }),
      );
      this.logger.log(`Purged ${expired.length} face reference images older than ${RETENTION_DAYS} days`);
      return expired.length;
    } catch (error) {
      // Retention is housekeeping -- never let it crash the app or spam on a DB blip.
      this.logger.warn(`Face retention prune failed: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }
}
