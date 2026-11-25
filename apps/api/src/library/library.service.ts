import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, buildViewer, has } from '../access/scope';
import { CATALOGUE_KEYS, REPORT_CATALOGUE } from './report-catalogue';

// G4 (item 14, ANL-06): the report library: the catalogue entries this person may open, and their favourites.
@Injectable()
export class LibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  async reports(ctx: TenantContext, user: ScopeUser) {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, CATALOGUE_KEYS);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const today = todayIst();
      // A manager: someone has them as their manager today.
      const [row] = await tx.$queryRaw<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM employee_assignments a JOIN employees m ON m.organization_id = a.organization_id AND m.id = a.manager_employee_id
        WHERE a.organization_id = ${c.organizationId}::uuid AND m.user_id = ${c.userId}::uuid AND a.superseded_at IS NULL
          AND a.valid_from <= ${today}::date AND (a.valid_to IS NULL OR a.valid_to >= ${today}::date)`;
      const manager = !v.actingForOther && (row?.n ?? 0) > 0;
      const favs = new Set((await tx.reportFavourite.findMany({ where: { organizationId: c.organizationId, userId: c.userId! }, select: { reportId: true } })).map((f) => f.reportId));
      return REPORT_CATALOGUE.filter((r) => r.keys.some((k) => has(v, k)) || (r.manager && manager)).map(({ keys: _keys, manager: _m, ...r }) => ({ ...r, favourite: favs.has(r.id) }));
    });
  }

  /** A favourite is personal; only a report the person may open can be marked. */
  async favourite(ctx: TenantContext, user: ScopeUser, reportId: string, on: boolean) {
    if (!(await this.reports(ctx, user)).some((r) => r.id === reportId)) throw new NotFoundException('No such report.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      if (on) await tx.reportFavourite.createMany({ data: [{ organizationId: c.organizationId, userId: c.userId!, reportId }], skipDuplicates: true });
      else await tx.reportFavourite.deleteMany({ where: { organizationId: c.organizationId, userId: c.userId!, reportId } });
      await audit(tx, c, on ? 'library.report.favourited' : 'library.report.unfavourited', 'report', reportId, {});
      return { favourite: on };
    });
  }
}
