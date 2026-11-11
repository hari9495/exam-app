import { Injectable, Logger } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, inCompany } from '../org-structure/org-structure.service';
import { settingFor } from '../people/probation';

// Answer 974: Not found references are deleted after the company's help.not_found.keep_days (90 by default), nightly.
// The app may not delete them itself: the database function purge_not_found_refs deletes only inside the current
// company's context (forced RLS) and never newer than 30 days, so each company is purged in its own context.
const LOOKUP: TenantContext = { organizationId: null, isSuperAdmin: true };

@Injectable()
export class NotFoundRetentionService {
  private readonly logger = new Logger(NotFoundRetentionService.name);

  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /** `only` limits the run to these companies (tests). Returns how many references were deleted. */
  async prune(only?: string[]): Promise<number> {
    // Which companies have references at all (ids only); each is then purged in its own context.
    const orgs = await this.tenantPrisma.forTenant(LOOKUP, (tx) => tx.notFoundRef.groupBy({ by: ['organizationId'], where: only ? { organizationId: { in: only } } : {} }));
    let deleted = 0;
    for (const { organizationId } of orgs) {
      try {
        deleted += await inCompany(this.tenantPrisma, { organizationId, isSuperAdmin: false }, async (tx, c) => {
          const days = Number(await settingFor(tx, c, 'help.not_found.keep_days', { legalEntityId: '' }));
          const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT purge_not_found_refs(${days}::int) AS n`;
          const count = Number(n);
          if (count) await audit(tx, c, 'help.not_found.purged', 'not_found_ref', organizationId, { deleted: count, days });
          return count;
        });
      } catch (e) {
        this.logger.error(`Not found references: purge failed for ${organizationId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return deleted;
  }
}
