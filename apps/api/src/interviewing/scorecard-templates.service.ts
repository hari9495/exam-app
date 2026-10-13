import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, inCompany } from '../org-structure/org-structure.service';
import type { ScorecardTemplateDto } from './interviewing-dto';

// Recruitment batch AT5 (M10-BUILD-DESIGN §8.3): scorecard templates — the skills or questions a panel rates, each
// with a weight, on the company scale (default 1-4), and the pass bar. Items can start from the M06 competency
// library. A template already used by a scorecard is never edited (copy it instead), so every past scorecard keeps
// the exact items it was scored on.
@Injectable()
export class ScorecardTemplatesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.scorecardTemplate.findMany({ where: { organizationId: c.organizationId, archivedAt: null }, orderBy: { name: 'asc' }, include: { items: { orderBy: { position: 'asc' } } } });
      const used = await tx.scorecard.groupBy({ by: ['templateId'], where: { organizationId: c.organizationId, templateId: { in: rows.map((r) => r.id) } }, _count: { _all: true } });
      return rows.map((r) => ({ ...r, passBar: Number(r.passBar), inUse: used.some((u) => u.templateId === r.id) }));
    });
  }

  /** The M06 competency library, as starting items. */
  competencies(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.competency.findMany({ where: { organizationId: c.organizationId, status: 'active' }, select: { id: true, description: true, companySkillId: true } });
      const skills = await tx.companySkill.findMany({ where: { id: { in: rows.map((r) => r.companySkillId) } }, select: { id: true, name: true } });
      return rows.map((r) => ({ id: r.id, name: skills.find((s) => s.id === r.companySkillId)?.name ?? '', description: r.description })).filter((r) => r.name).sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  save(ctx: TenantContext, id: string | null, dto: ScorecardTemplateDto) {
    if (dto.passBar > dto.scaleMax) throw new BadRequestException(`The pass bar must be between 1 and ${dto.scaleMax}.`);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      if (dto.items.some((i) => i.competencyId)) {
        const ids = [...new Set(dto.items.map((i) => i.competencyId).filter((x): x is string => Boolean(x)))];
        if ((await tx.competency.count({ where: { organizationId: org, id: { in: ids } } })) !== ids.length) throw new BadRequestException('A competency is not in your library.');
      }
      let templateId = id;
      if (id) {
        const t = await tx.scorecardTemplate.findFirst({ where: { id, organizationId: org, archivedAt: null } });
        if (!t) throw new NotFoundException('Scorecard not found.');
        if (await tx.scorecard.count({ where: { templateId: id } })) throw new ConflictException('This scorecard has been used, so it cannot change. Copy it and change the copy.');
        await tx.scorecardTemplate.update({ where: { id }, data: { name: dto.name, scaleMax: dto.scaleMax, passBar: dto.passBar } });
        await tx.scorecardItem.deleteMany({ where: { templateId: id } });
      } else {
        templateId = (await tx.scorecardTemplate.create({ data: { organizationId: org, name: dto.name, scaleMax: dto.scaleMax, passBar: dto.passBar, createdBy: c.userId ?? null } })).id;
      }
      await tx.scorecardItem.createMany({ data: dto.items.map((i, n) => ({ organizationId: org, templateId: templateId!, position: n, label: i.label, guidance: i.guidance || null, weight: i.weight, competencyId: i.competencyId ?? null })) });
      await audit(tx, c, id ? 'ats.scorecard_template.updated' : 'ats.scorecard_template.created', 'scorecard_template', templateId!, { items: dto.items.length, passBar: dto.passBar });
      return tx.scorecardTemplate.findUniqueOrThrow({ where: { id: templateId! }, include: { items: { orderBy: { position: 'asc' } } } });
    });
  }

  archive(ctx: TenantContext, id: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { count } = await tx.scorecardTemplate.updateMany({ where: { id, organizationId: c.organizationId, archivedAt: null }, data: { archivedAt: new Date() } });
      if (!count) throw new NotFoundException('Scorecard not found.');
      await tx.job.updateMany({ where: { organizationId: c.organizationId, scorecardTemplateId: id }, data: { scorecardTemplateId: null } });
      await audit(tx, c, 'ats.scorecard_template.archived', 'scorecard_template', id);
      return { archived: true };
    });
  }
}
