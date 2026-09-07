import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { ENTITY_TYPES, EntityType } from './recycle-bin.service';

export const RETENTION_DAYS = 30;
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Hard-deletes recycle-bin rows (Candidate/Job/Pipeline/WalkInGroup) soft-deleted more than 30
// days ago -- on boot and then daily. Mirrors system-events-retention.service.ts's shape (plain
// interval, not a queue job -- same reasoning applies here).
// ponytail: single-process interval; move to a repeatable queue job if api ever scales out.
//
// Per-row delete, not one deleteMany per model: Job.pipelineId->Pipeline and
// CandidateEmail.candidateId->Candidate are `onDelete: NoAction` FKs, so a soft-deleted row can
// still be referenced and therefore FK-blocked from hard-deletion (P2003). A single deleteMany is
// all-or-nothing -- one blocked row would fail the whole model's batch and purge NONE of the due
// rows. Deleting id-by-id inside its own try/catch lets every other due row purge regardless, and
// leaves a blocked row soft-deleted (exactly as undeletable as it was before this feature existed).
@Injectable()
export class RecycleBinRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecycleBinRetentionService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  onModuleInit(): void {
    void this.prune();
    this.timer = setInterval(() => void this.prune(), PRUNE_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async prune(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    try {
      return await this.tenantPrisma.forTenantIncludingDeleted({ organizationId: null, isSuperAdmin: true }, async (tx) => {
        let purged = 0;
        let skipped = 0;
        for (const entityType of Object.keys(ENTITY_TYPES) as EntityType[]) {
          const delegate = (tx as any)[ENTITY_TYPES[entityType].delegate];
          const due: { id: string }[] = await delegate.findMany({ where: { deletedAt: { lt: cutoff } }, select: { id: true } });
          for (const { id } of due) {
            try {
              await delegate.delete({ where: { id } });
              // Job hard-delete only: CustomFieldValue is an EAV table keyed by (entityType,
              // entityId) with no FK to Job, so nothing else cleans these up on a final purge --
              // same cleanup as recycle-bin.service.ts's manual purge. Best-effort and isolated
              // in its own try/catch: the job row is already gone by this point regardless of
              // whether this secondary cleanup succeeds, so a failure here must not mark an
              // actually-purged job as "skipped". Candidate CFV rows are pre-existing/out of
              // scope -- JOB ONLY.
              if (entityType === 'job') {
                try {
                  await tx.customFieldValue.deleteMany({ where: { entityType: 'job', entityId: id } });
                } catch (cfvError) {
                  const detail = cfvError instanceof Error ? cfvError.message : String(cfvError);
                  this.logger.warn(`Recycle-bin prune: job ${id} purged but its customFieldValue cleanup failed: ${detail}`);
                }
              }
              purged++;
            } catch (error) {
              // P2003 (FK constraint) is the expected case -- a soft-deleted row still referenced
              // by a NoAction FK (e.g. a Job still pointing at this Pipeline). Skip it and keep
              // going; it stays soft-deleted, same as recycle-bin's manual purge would leave it.
              // Any other error is unexpected but still shouldn't abort the rest of the batch.
              skipped++;
              const detail = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : error instanceof Error ? error.message : String(error);
              this.logger.warn(`Recycle-bin prune skipped ${entityType} ${id}: ${detail}`);
            }
          }
        }
        if (purged > 0 || skipped > 0) {
          this.logger.log(`Recycle-bin prune: purged ${purged}, skipped ${skipped} (FK-blocked or errored), older than ${RETENTION_DAYS} days`);
        }
        return purged;
      });
    } catch (error) {
      // Retention is housekeeping -- never let it crash the app or spam on a DB blip.
      this.logger.warn(`Recycle-bin prune failed: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }
}
