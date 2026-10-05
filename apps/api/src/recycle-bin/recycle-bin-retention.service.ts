import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { ENTITY_TYPES, EntityType } from './recycle-bin.service';

export const RETENTION_DAYS = 30;
const SYSTEM = { organizationId: null, isSuperAdmin: true };

// Hard-deletes recycle-bin rows (Candidate/Job/Pipeline/WalkInGroup) soft-deleted more than 30
// days ago. Scheduled as a nightly BullMQ job scheduler by ScheduledSweepsModule.
//
// Per-row delete, not one deleteMany per model: Job.pipelineId->Pipeline and
// CandidateEmail.candidateId->Candidate are `onDelete: NoAction` FKs, so a soft-deleted row can
// still be referenced and therefore FK-blocked from hard-deletion (P2003). A single deleteMany is
// all-or-nothing -- one blocked row would fail the whole model's batch and purge NONE of the due
// rows. Deleting id-by-id, each in its own transaction and try/catch, lets every other due row purge regardless, and
// leaves a blocked row soft-deleted (exactly as undeletable as it was before this feature existed).
@Injectable()
export class RecycleBinRetentionService {
  private readonly logger = new Logger(RecycleBinRetentionService.name);

  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async prune(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const run = <T>(fn: (tx: any) => Promise<T>) => this.tenantPrisma.forTenantIncludingDeleted(SYSTEM, fn);
    try {
      let purged = 0;
      let skipped = 0;
      for (const entityType of Object.keys(ENTITY_TYPES) as EntityType[]) {
        const delegate = ENTITY_TYPES[entityType].delegate;
        const due: { id: string }[] = await run((tx) => tx[delegate].findMany({ where: { deletedAt: { lt: cutoff } }, select: { id: true } }));
        for (const { id } of due) {
          try {
            // One transaction per row: in PostgreSQL a failed statement aborts its whole
            // transaction, so a shared one would turn the first FK-blocked row into a failure
            // for every row after it.
            await run((tx) => tx[delegate].delete({ where: { id } }));
          } catch (error) {
            // P2003 (FK constraint) is the expected case -- a soft-deleted row still referenced
            // by a NoAction FK (e.g. a Job still pointing at this Pipeline). Skip it and keep
            // going; it stays soft-deleted, same as recycle-bin's manual purge would leave it.
            // Any other error is unexpected but still shouldn't abort the rest of the batch.
            skipped++;
            const detail = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : error instanceof Error ? error.message : String(error);
            this.logger.warn(`Recycle-bin prune skipped ${entityType} ${id}: ${detail}`);
            continue;
          }
          purged++;
          // Job hard-delete only: CustomFieldValue is an EAV table keyed by (entityType,
          // entityId) with no FK to Job, so nothing else cleans these up on a final purge --
          // same cleanup as recycle-bin.service.ts's manual purge. Best-effort: the job row is
          // already gone, so a failure here must not mark it "skipped". Candidate CFV rows are
          // pre-existing/out of scope -- JOB ONLY.
          if (entityType === 'job') {
            try {
              await run((tx) => tx.customFieldValue.deleteMany({ where: { entityType: 'job', entityId: id } }));
            } catch (cfvError) {
              const detail = cfvError instanceof Error ? cfvError.message : String(cfvError);
              this.logger.warn(`Recycle-bin prune: job ${id} purged but its customFieldValue cleanup failed: ${detail}`);
            }
          }
        }
      }
      if (purged > 0 || skipped > 0) {
        this.logger.log(`Recycle-bin prune: purged ${purged}, skipped ${skipped} (FK-blocked or errored), older than ${RETENTION_DAYS} days`);
      }
      return purged;
    } catch (error) {
      // Retention is housekeeping -- never let it crash the app or spam on a DB blip.
      this.logger.warn(`Recycle-bin prune failed: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }
}
