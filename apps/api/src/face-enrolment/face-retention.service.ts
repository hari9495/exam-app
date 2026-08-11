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
          where: { referenceImagePath: { not: null }, attempt: { submittedAt: { lt: cutoff } } },
          select: { id: true, referenceImagePath: true },
        }),
      );
      if (expired.length === 0) return 0;

      // One failed blob delete must not strand the remaining rows: the DB reference is cleared
      // either way, and an orphaned blob is a smaller problem than retained biometric data.
      for (const row of expired) {
        try {
          await this.blobStorage.deleteByUrl(row.referenceImagePath as string);
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
