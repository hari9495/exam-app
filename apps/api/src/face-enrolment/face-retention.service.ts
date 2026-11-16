import { Injectable, Logger } from '@nestjs/common';
import { BlobStorageService, TenantPrismaService } from '@exam-platform/shared';
import { NOT_ON_HOLD, RETENTION_MIN_DAYS, pastRetention, retentionByCompany, retentionCutoff } from '../assessments/asmt-rules';

// Biometric data must not outlive its purpose, and the review window is the purpose -- see
// docs/superpowers/specs/2026-08-10-face-identification-design.md. AS-2 (answer 2008): the window is each
// company's Settings 6.5 retention (asmt.retention, 30 to 365 days, default 30; it was a fixed 90), and the
// face data of an attempt whose result is held (an open incident or appeal) is kept until it is released.

// Deletes face reference images (and clears the row) once past the company's retention after the owning
// attempt finalised. Scheduled as a nightly BullMQ job scheduler by ScheduledSweepsModule.
@Injectable()
export class FaceRetentionService {
  private readonly logger = new Logger(FaceRetentionService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly blobStorage: BlobStorageService,
  ) {}

  async prune(now: Date = new Date()): Promise<number> {
    const cutoff = retentionCutoff(now, RETENTION_MIN_DAYS);
    const superAdmin = { organizationId: null, isSuperAdmin: true };

    try {
      const [days, candidates] = await this.tenantPrisma.forTenant(superAdmin, async (tx) => [
        await retentionByCompany(tx),
        await tx.faceEnrolment.findMany({
          where: {
            // A declined-consent update (recordFaceEnrolment) nulls referenceImagePath but keeps
            // a previously-stored embedding, so filtering on referenceImagePath alone stopped
            // matching that row -- an encrypted biometric template with no expiry, past the
            // purpose limitation. Either column being non-null is enough to be a prune candidate.
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
            AND: [NOT_ON_HOLD],
          },
          select: { id: true, referenceImagePath: true, organizationId: true, attempt: { select: { submittedAt: true, startedAt: true } } },
        }),
      ] as const);
      // Each row against its own company's days (the query used the shortest).
      const expired = candidates.filter((r) => {
        const at = r.attempt.submittedAt ?? r.attempt.startedAt;
        return at !== null && pastRetention(at, r.organizationId, days, now);
      });
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
      this.logger.log(`Purged ${expired.length} face reference images past their company's retention`);
      return expired.length;
    } catch (error) {
      // Retention is housekeeping -- never let it crash the app or spam on a DB blip.
      this.logger.warn(`Face retention prune failed: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }
}
