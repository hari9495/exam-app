import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, inCompany } from '../org-structure/org-structure.service';
import type { CareersEntityDto, ConsentNoticeDto, RecruitingCostDto } from './hiring-dto';

// Recruitment batch AT3 (M10-BUILD-DESIGN §6, §13): the staff side of the careers site. Consent text is versioned:
// publishing makes a new version and never edits an old one, so every candidate's consent points at the exact words
// they accepted. Each legal entity can have its own careers page (slug, headline, intro, colour).
@Injectable()
export class CareersAdminService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  notices(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, (tx, c) =>
      tx.consentNotice.findMany({ where: { organizationId: c.organizationId }, orderBy: [{ purpose: 'asc' }, { version: 'desc' }] }),
    );
  }

  publishNotice(ctx: TenantContext, dto: ConsentNoticeDto) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const last = await tx.consentNotice.findFirst({ where: { organizationId: c.organizationId, purpose: dto.purpose }, orderBy: { version: 'desc' }, select: { version: true } });
      const notice = await tx.consentNotice.create({
        data: { organizationId: c.organizationId, purpose: dto.purpose, version: (last?.version ?? 0) + 1, text: dto.text, publishedBy: c.userId ?? null },
      });
      // Walk-in and one-click re-apply still read the company's consent text; keep it the same words and version.
      if (dto.purpose === 'application') {
        await tx.organization.update({ where: { id: c.organizationId }, data: { applyConsentText: dto.text, applyConsentVersion: notice.version } });
      }
      await audit(tx, c, 'ats.consent_notice.published', 'consent_notice', notice.id, { purpose: notice.purpose, version: notice.version });
      return notice;
    });
  }

  entities(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => ({
      entities: await tx.legalEntity.findMany({ where: { organizationId: c.organizationId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      pages: await tx.careersEntityPage.findMany({ where: { organizationId: c.organizationId } }),
    }));
  }

  saveEntity(ctx: TenantContext, legalEntityId: string, dto: CareersEntityDto) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const entity = await tx.legalEntity.findFirst({ where: { id: legalEntityId, organizationId: c.organizationId }, select: { id: true } });
      if (!entity) throw new NotFoundException('That company is not in your organisation.');
      const data = { slug: dto.slug, headline: dto.headline || null, intro: dto.intro || null, primaryColor: dto.primaryColor || null };
      const page = await tx.careersEntityPage.upsert({
        where: { organizationId_legalEntityId: { organizationId: c.organizationId, legalEntityId } },
        create: { organizationId: c.organizationId, legalEntityId, ...data },
        update: data,
      });
      await audit(tx, c, 'ats.careers_page.saved', 'careers_entity_page', page.id, { slug: page.slug });
      return page;
    });
  }

  removeEntity(ctx: TenantContext, legalEntityId: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { count } = await tx.careersEntityPage.deleteMany({ where: { organizationId: c.organizationId, legalEntityId } });
      if (count) await audit(tx, c, 'ats.careers_page.removed', 'legal_entity', legalEntityId);
      return { removed: count > 0 };
    });
  }

  /** Posting costs (M10 §6): one line per job-board posting or other hiring cost; agency fees join in AT7. */
  costs(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, (tx, c) =>
      tx.recruitingCost.findMany({ where: { organizationId: c.organizationId }, orderBy: { createdAt: 'desc' }, take: 200 }),
    );
  }

  addCost(ctx: TenantContext, dto: RecruitingCostDto) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const board = dto.jobBoardId ? await tx.jobBoard.findFirst({ where: { id: dto.jobBoardId, organizationId: org }, select: { name: true } }) : null;
      if (dto.jobBoardId && !board) throw new NotFoundException('That job board is not in your organisation.');
      if (dto.jobId && !(await tx.job.findFirst({ where: { id: dto.jobId, organizationId: org }, select: { id: true } }))) throw new NotFoundException('That job is not in your organisation.');
      const cost = await tx.recruitingCost.create({
        data: {
          organizationId: org,
          jobId: dto.jobId ?? null,
          jobBoardId: dto.jobBoardId ?? null,
          source: board?.name ?? dto.source ?? 'Other',
          costType: dto.jobBoardId ? 'posting' : 'other',
          amount: dto.amount,
          currency: dto.currency,
          period: dto.period ? new Date(dto.period) : null,
          note: dto.note || null,
          enteredBy: c.userId ?? null,
        },
      });
      await audit(tx, c, 'ats.cost.added', 'recruiting_cost', cost.id, { type: cost.costType });
      return cost;
    });
  }
}
