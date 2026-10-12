import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { bandsProblem, scaleProblem, templateProblem, type SectionIn } from './perf-rules';
import type { CompetencyDto, ScaleDto, SkillDto, TemplateDto } from './dto';
import { STARTER_COMPETENCIES, STARTER_DOMAINS, STARTER_SCALE, STARTER_TEMPLATES } from './starters';

// Performance batch PM1 (M06-BUILD-DESIGN §5.2, §6, §9.1; PM-1.01 … 1.04): rating scales and bands, review templates
// (versions; a template in use is never changed in place), the company skills library in its first form and the
// competencies built on it (D1), and the YukthiX starters. Everything is company data checked when saved.

const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dayBefore = (d: string) => iso(new Date(asDate(d).getTime() - 86_400_000));
const num = (x: Prisma.Decimal) => Number(x.toString());
const GROUP_DOMAIN = { core: 'Core', functional: 'Functional', leadership: 'Leadership' } as const;

@Injectable()
export class PerformanceSetupService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private run<T>(ctx: TenantContext, fn: (tx: Tx, c: CompanyContext) => Promise<T>) {
    return inCompany(this.tenantPrisma, ctx, fn);
  }

  // ------------------------------------------------------------------------------------------ scales (PM-1.02)

  private async scaleView(tx: Tx, org: string, s: Prisma.RatingScaleGetPayload<object>) {
    const levels = await tx.ratingScaleLevel.findMany({ where: { organizationId: org, scaleId: s.id }, orderBy: { value: 'asc' } });
    const bands = await tx.ratingBand.findMany({ where: { organizationId: org, scaleId: s.id }, orderBy: { fromScore: 'asc' } });
    const inUse = await tx.reviewTemplate.count({ where: { organizationId: org, scaleId: s.id, status: { in: ['active', 'retired'] } } });
    return {
      id: s.id,
      name: s.name,
      min: num(s.minValue),
      max: num(s.maxValue),
      step: num(s.step),
      status: s.status,
      starter: Boolean(s.starterKey),
      inUse: inUse > 0,
      levels: levels.map((l) => ({ id: l.id, value: num(l.value), label: l.label, description: l.description })),
      bands: bands.map((b) => ({ id: b.id, fromScore: num(b.fromScore), toScore: num(b.toScore), label: b.label })),
      version: s.version,
    };
  }

  scales(ctx: TenantContext) {
    return this.run(ctx, async (tx, c) => {
      const rows = await tx.ratingScale.findMany({ where: { organizationId: c.organizationId }, orderBy: [{ status: 'asc' }, { name: 'asc' }] });
      const out = [];
      for (const s of rows) out.push(await this.scaleView(tx, c.organizationId, s));
      return out;
    });
  }

  async saveScale(ctx: TenantContext, id: string | null, dto: ScaleDto) {
    const problem = scaleProblem(dto.min, dto.max, dto.step, dto.levels) ?? bandsProblem(dto.min, dto.max, dto.bands);
    if (problem) throw new BadRequestException(problem);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      let scale;
      if (id) {
        const cur = await tx.ratingScale.findFirst({ where: { organizationId: org, id } });
        if (!cur) throw new NotFoundException('No such rating scale.');
        // A scale a template has used keeps its meaning: ratings already given must read the same (Q3).
        if (await tx.reviewTemplate.count({ where: { organizationId: org, scaleId: id, status: { in: ['active', 'retired'] } } })) throw new ConflictException('This scale is used by a template, so it cannot change. Add a new scale instead.');
        const n = await tx.ratingScale.updateMany({ where: { organizationId: org, id, version: dto.version ?? -1 }, data: { name: dto.name, minValue: dto.min, maxValue: dto.max, step: dto.step, version: { increment: 1 } } });
        if (!n.count) throw new ConflictException('Someone else changed this scale. Reload it.');
        await tx.ratingScaleLevel.deleteMany({ where: { organizationId: org, scaleId: id } });
        await tx.ratingBand.deleteMany({ where: { organizationId: org, scaleId: id } });
        scale = await tx.ratingScale.findFirstOrThrow({ where: { organizationId: org, id } });
      } else {
        scale = await tx.ratingScale.create({ data: { organizationId: org, name: dto.name, minValue: dto.min, maxValue: dto.max, step: dto.step, createdBy: c.userId ?? null } });
      }
      await this.writeScaleParts(tx, org, scale.id, dto.levels, dto.bands);
      await audit(tx, c, id ? 'perf.scale.updated' : 'perf.scale.created', 'rating_scale', scale.id, { name: dto.name });
      return this.scaleView(tx, org, scale);
    }).catch(this.duplicate('A rating scale with that name already exists.'));
  }

  private async writeScaleParts(tx: Tx, org: string, scaleId: string, levels: readonly { value: number; label: string; description?: string | null }[], bands: readonly { fromScore: number; toScore: number; label: string }[]) {
    await tx.ratingScaleLevel.createMany({ data: levels.map((l) => ({ organizationId: org, scaleId, value: l.value, label: l.label, description: l.description ?? null })) });
    await tx.ratingBand.createMany({ data: bands.map((b) => ({ organizationId: org, scaleId, fromScore: b.fromScore, toScore: b.toScore, label: b.label })) });
  }

  async retireScale(ctx: TenantContext, id: string) {
    return this.run(ctx, async (tx, c) => {
      const s = await tx.ratingScale.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!s) throw new NotFoundException('No such rating scale.');
      if (await tx.reviewTemplate.count({ where: { organizationId: c.organizationId, scaleId: id, status: { in: ['draft', 'active'] } } })) throw new ConflictException('A template still uses this scale. Retire the template or move it to another scale first.');
      await tx.ratingScale.update({ where: { id }, data: { status: 'retired', version: { increment: 1 } } });
      await audit(tx, c, 'perf.scale.retired', 'rating_scale', id, {});
      return this.scaleView(tx, c.organizationId, await tx.ratingScale.findFirstOrThrow({ where: { id } }));
    });
  }

  // ------------------------------------------------------------------------------------------ templates (PM-1.03)

  private async sectionsOf(tx: Tx, org: string, templateId: string) {
    const sections = await tx.reviewTemplateSection.findMany({ where: { organizationId: org, templateId }, orderBy: { seq: 'asc' } });
    const questions = await tx.reviewTemplateQuestion.findMany({ where: { organizationId: org, sectionId: { in: sections.map((s) => s.id) } }, orderBy: { seq: 'asc' } });
    return sections.map((s) => ({
      id: s.id,
      kind: s.kind as SectionIn['kind'],
      title: s.title,
      weight: num(s.weight),
      rated: s.rated,
      whoAnswers: s.whoAnswers,
      questions: questions.filter((q) => q.sectionId === s.id).map((q) => ({ id: q.id, text: q.text, answer: q.answer as 'rating' | 'text' | 'both', required: q.required })),
    }));
  }

  private async templateView(tx: Tx, org: string, t: Prisma.ReviewTemplateGetPayload<object>) {
    const sections = await this.sectionsOf(tx, org, t.id);
    return {
      id: t.id,
      familyId: t.familyId,
      templateVersion: t.templateVersion,
      name: t.name,
      kind: t.kind,
      scaleId: t.scaleId,
      scoring: t.scoring,
      status: t.status,
      starter: Boolean(t.starterKey),
      activatedAt: t.activatedAt?.toISOString() ?? null,
      sections,
      // Shown while editing; activating refuses a template with a problem (PF-D7).
      problem: templateProblem(t.scoring as 'weighted' | 'manager_overall', sections),
      version: t.version,
    };
  }

  templates(ctx: TenantContext) {
    return this.run(ctx, async (tx, c) => {
      const rows = await tx.reviewTemplate.findMany({ where: { organizationId: c.organizationId }, orderBy: [{ name: 'asc' }, { templateVersion: 'desc' }] });
      const out = [];
      for (const t of rows) out.push(await this.templateView(tx, c.organizationId, t));
      return out;
    });
  }

  template(ctx: TenantContext, id: string) {
    return this.run(ctx, async (tx, c) => this.templateView(tx, c.organizationId, await this.templateOr404(tx, c.organizationId, id)));
  }

  private async templateOr404(tx: Tx, org: string, id: string) {
    const t = await tx.reviewTemplate.findFirst({ where: { organizationId: org, id } });
    if (!t) throw new NotFoundException('No such review template.');
    return t;
  }

  private async activeScale(tx: Tx, org: string, scaleId: string) {
    const s = await tx.ratingScale.findFirst({ where: { organizationId: org, id: scaleId, status: 'active' } });
    if (!s) throw new BadRequestException('Choose a rating scale in use.');
    return s;
  }

  private async writeSections(tx: Tx, org: string, templateId: string, sections: readonly (Omit<SectionIn, 'questions'> & { questions: readonly { text: string; answer: string; required?: boolean }[] })[]) {
    for (const [i, s] of sections.entries()) {
      const row = await tx.reviewTemplateSection.create({ data: { organizationId: org, templateId, seq: i + 1, kind: s.kind, title: s.title, weight: s.rated ? s.weight : 0, rated: s.rated, whoAnswers: [...new Set(s.whoAnswers)] } });
      if (s.questions.length) await tx.reviewTemplateQuestion.createMany({ data: s.questions.map((q, j) => ({ organizationId: org, sectionId: row.id, seq: j + 1, text: q.text, answer: q.answer, required: q.required ?? true })) });
    }
  }

  private async clearSections(tx: Tx, org: string, templateId: string) {
    const ids = (await tx.reviewTemplateSection.findMany({ where: { organizationId: org, templateId }, select: { id: true } })).map((s) => s.id);
    await tx.reviewTemplateQuestion.deleteMany({ where: { organizationId: org, sectionId: { in: ids } } });
    await tx.reviewTemplateSection.deleteMany({ where: { organizationId: org, templateId } });
  }

  async createTemplate(ctx: TenantContext, dto: TemplateDto) {
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.activeScale(tx, org, dto.scaleId);
      const t = await tx.reviewTemplate.create({ data: { organizationId: org, familyId: randomUUID(), name: dto.name, kind: dto.kind, scaleId: dto.scaleId, scoring: dto.scoring, createdBy: c.userId ?? null } });
      await this.writeSections(tx, org, t.id, dto.sections);
      await audit(tx, c, 'perf.template.created', 'review_template', t.id, { name: dto.name });
      return this.templateView(tx, org, t);
    });
  }

  /** Only a draft changes in place; an active or retired version is copied into a new draft (§5.2). */
  async updateTemplate(ctx: TenantContext, id: string, dto: TemplateDto) {
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const cur = await this.templateOr404(tx, org, id);
      if (cur.status !== 'draft') throw new ConflictException('An active template is not changed in place. Make a new version, change it, then activate it.');
      await this.activeScale(tx, org, dto.scaleId);
      const n = await tx.reviewTemplate.updateMany({ where: { organizationId: org, id, version: dto.version ?? -1 }, data: { name: dto.name, kind: dto.kind, scaleId: dto.scaleId, scoring: dto.scoring, version: { increment: 1 } } });
      if (!n.count) throw new ConflictException('Someone else changed this template. Reload it.');
      await this.clearSections(tx, org, id);
      await this.writeSections(tx, org, id, dto.sections);
      await audit(tx, c, 'perf.template.updated', 'review_template', id, {});
      return this.templateView(tx, org, await tx.reviewTemplate.findFirstOrThrow({ where: { id } }));
    });
  }

  async newVersion(ctx: TenantContext, id: string) {
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const cur = await this.templateOr404(tx, org, id);
      const draft = await tx.reviewTemplate.findFirst({ where: { organizationId: org, familyId: cur.familyId, status: 'draft' } });
      if (draft) throw new ConflictException(`Version ${draft.templateVersion} of this template is already a draft. Change that one.`);
      const last = await tx.reviewTemplate.aggregate({ where: { organizationId: org, familyId: cur.familyId }, _max: { templateVersion: true } });
      const t = await tx.reviewTemplate.create({ data: { organizationId: org, familyId: cur.familyId, templateVersion: (last._max.templateVersion ?? 0) + 1, name: cur.name, kind: cur.kind, scaleId: cur.scaleId, scoring: cur.scoring, createdBy: c.userId ?? null } });
      const sections = await this.sectionsOf(tx, org, cur.id);
      await this.writeSections(tx, org, t.id, sections);
      await audit(tx, c, 'perf.template.new_version', 'review_template', t.id, { from: cur.id, templateVersion: t.templateVersion });
      return this.templateView(tx, org, t);
    });
  }

  /** Activating checks the whole template (PF-D7) and retires the family's previous active version. */
  async activateTemplate(ctx: TenantContext, id: string, version: number) {
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const cur = await this.templateOr404(tx, org, id);
      if (cur.status !== 'draft') throw new ConflictException('Only a draft can be activated.');
      if (cur.version !== version) throw new ConflictException('Someone else changed this template. Reload it.');
      const scale = await this.activeScale(tx, org, cur.scaleId);
      const bands = await tx.ratingBand.findMany({ where: { organizationId: org, scaleId: scale.id } });
      const problem = templateProblem(cur.scoring as 'weighted' | 'manager_overall', await this.sectionsOf(tx, org, id)) ?? bandsProblem(num(scale.minValue), num(scale.maxValue), bands.map((b) => ({ fromScore: num(b.fromScore), toScore: num(b.toScore), label: b.label })));
      if (problem) throw new BadRequestException(problem);
      await tx.reviewTemplate.updateMany({ where: { organizationId: org, familyId: cur.familyId, status: 'active' }, data: { status: 'retired', version: { increment: 1 } } });
      await tx.reviewTemplate.update({ where: { id }, data: { status: 'active', activatedAt: new Date(), version: { increment: 1 } } });
      await audit(tx, c, 'perf.template.activated', 'review_template', id, { templateVersion: cur.templateVersion });
      return this.templateView(tx, org, await tx.reviewTemplate.findFirstOrThrow({ where: { id } }));
    });
  }

  async retireTemplate(ctx: TenantContext, id: string) {
    return this.run(ctx, async (tx, c) => {
      const cur = await this.templateOr404(tx, c.organizationId, id);
      if (cur.status === 'retired') throw new ConflictException('This template is already retired.');
      await tx.reviewTemplate.update({ where: { id }, data: { status: 'retired', version: { increment: 1 } } });
      await audit(tx, c, 'perf.template.retired', 'review_template', id, {});
      return this.templateView(tx, c.organizationId, await tx.reviewTemplate.findFirstOrThrow({ where: { id } }));
    });
  }

  // ------------------------------------------------------------------------------------------ skills library (PM-1.04, T2)

  skills(ctx: TenantContext) {
    return this.run(ctx, async (tx, c) => {
      const rows = await tx.companySkill.findMany({ where: { organizationId: c.organizationId }, orderBy: [{ kind: 'asc' }, { name: 'asc' }] });
      const used = new Set((await tx.competency.findMany({ where: { organizationId: c.organizationId }, select: { companySkillId: true } })).map((x) => x.companySkillId));
      return rows.map((s) => ({ id: s.id, parentId: s.parentId, name: s.name, kind: s.kind, status: s.status, mergedIntoId: s.mergedIntoId, starter: Boolean(s.starterKey), competency: used.has(s.id) }));
    });
  }

  private async parentFor(tx: Tx, org: string, kind: SkillDto['kind'], parentId: string | null | undefined) {
    if (kind === 'domain') {
      if (parentId) throw new BadRequestException('A domain sits at the top; it has no parent.');
      return null;
    }
    const parent = parentId ? await tx.companySkill.findFirst({ where: { organizationId: org, id: parentId, status: 'active' } }) : null;
    if (!parent || parent.kind !== (kind === 'skill' ? 'domain' : 'skill')) throw new BadRequestException(kind === 'skill' ? 'Choose the domain the skill belongs to.' : 'Choose the skill this sub-skill belongs to.');
    return parent.id;
  }

  async saveSkill(ctx: TenantContext, id: string | null, dto: SkillDto) {
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const parentId = await this.parentFor(tx, org, dto.kind, dto.parentId);
      let s;
      if (id) {
        const cur = await tx.companySkill.findFirst({ where: { organizationId: org, id, status: 'active' } });
        if (!cur) throw new NotFoundException('No such skill in use.');
        if (cur.kind !== dto.kind) throw new BadRequestException('A skill keeps its level in the library (domain, skill or sub-skill).');
        s = await tx.companySkill.update({ where: { id }, data: { name: dto.name, parentId } });
      } else {
        s = await tx.companySkill.create({ data: { organizationId: org, name: dto.name, kind: dto.kind, parentId } });
      }
      await audit(tx, c, id ? 'perf.skill.updated' : 'perf.skill.created', 'company_skill', s.id, { name: dto.name });
      return { id: s.id };
    }).catch(this.duplicate('That name is already used at this place in the library.'));
  }

  /** A skill in use is never deleted: it is retired (kept on past records) or merged into another (T2). */
  async retireSkill(ctx: TenantContext, id: string) {
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const s = await tx.companySkill.findFirst({ where: { organizationId: org, id, status: 'active' } });
      if (!s) throw new NotFoundException('No such skill in use.');
      if (await tx.companySkill.count({ where: { organizationId: org, parentId: id, status: 'active' } })) throw new ConflictException('Retire or move the skills under it first.');
      if (await tx.competency.count({ where: { organizationId: org, companySkillId: id, status: 'active' } })) throw new ConflictException('This skill is an active competency. Retire the competency first.');
      await tx.companySkill.update({ where: { id }, data: { status: 'retired' } });
      await audit(tx, c, 'perf.skill.retired', 'company_skill', id, {});
      return { id };
    });
  }

  async mergeSkill(ctx: TenantContext, id: string, intoId: string) {
    if (id === intoId) throw new BadRequestException('A skill cannot be merged into itself.');
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const from = await tx.companySkill.findFirst({ where: { organizationId: org, id, status: 'active' } });
      const into = await tx.companySkill.findFirst({ where: { organizationId: org, id: intoId, status: 'active' } });
      if (!from || !into) throw new NotFoundException('Both skills must be in use.');
      if (from.kind !== into.kind) throw new BadRequestException('Merge a skill into another of the same level.');
      if (await tx.companySkill.count({ where: { organizationId: org, parentId: id, status: 'active' } })) throw new ConflictException('Move the skills under it first.');
      const fromComp = await tx.competency.findFirst({ where: { organizationId: org, companySkillId: id } });
      const intoComp = await tx.competency.findFirst({ where: { organizationId: org, companySkillId: intoId } });
      if (fromComp && intoComp) throw new ConflictException('Both skills are competencies. Retire one competency first.');
      // Every view follows the merge: a competency on the old skill now reads the kept one.
      if (fromComp) await tx.competency.update({ where: { id: fromComp.id }, data: { companySkillId: intoId, version: { increment: 1 } } });
      await tx.companySkill.update({ where: { id }, data: { status: 'merged', mergedIntoId: intoId } });
      await audit(tx, c, 'perf.skill.merged', 'company_skill', id, { into: intoId });
      return { id: intoId };
    });
  }

  // ------------------------------------------------------------------------------------------ competencies (PM-1.04, Q8)

  private async competencyView(tx: Tx, org: string, x: Prisma.CompetencyGetPayload<object>, today: string) {
    const skill = await tx.companySkill.findFirstOrThrow({ where: { organizationId: org, id: x.companySkillId } });
    const levels = await tx.competencyLevel.findMany({ where: { organizationId: org, competencyId: x.id }, orderBy: { level: 'asc' } });
    const roles = await tx.roleCompetencyMap.findMany({ where: { organizationId: org, competencyId: x.id, validFrom: { lte: asDate(today) }, OR: [{ validTo: null }, { validTo: { gte: asDate(today) } }] } });
    const names = new Map((await tx.designation.findMany({ where: { organizationId: org, id: { in: roles.map((r) => r.designationId) } }, select: { id: true, name: true } })).map((d) => [d.id, d.name]));
    return {
      id: x.id,
      skillId: skill.id,
      name: skill.name,
      group: x.group,
      description: x.description,
      status: x.status,
      starter: Boolean(x.starterKey),
      levels: levels.map((l) => ({ level: l.level, label: l.label, behaviours: l.behaviours })),
      roles: roles.map((r) => ({ designationId: r.designationId, designation: names.get(r.designationId) ?? '', level: r.expectedLevel, validFrom: iso(r.validFrom) })),
      version: x.version,
    };
  }

  competencies(ctx: TenantContext) {
    return this.run(ctx, async (tx, c) => {
      const today = todayIst();
      const rows = await tx.competency.findMany({ where: { organizationId: c.organizationId }, orderBy: [{ status: 'asc' }, { group: 'asc' }, { createdAt: 'asc' }] });
      const out = [];
      for (const x of rows) out.push(await this.competencyView(tx, c.organizationId, x, today));
      return out;
    });
  }

  private async domainFor(tx: Tx, org: string, group: CompetencyDto['group']) {
    const name = GROUP_DOMAIN[group];
    return (await tx.companySkill.findFirst({ where: { organizationId: org, kind: 'domain', status: 'active', name } })) ?? (await tx.companySkill.create({ data: { organizationId: org, kind: 'domain', name } }));
  }

  /** The level each designation needs, dated: a changed or removed level ends the old row the day before (P06). */
  private async writeRoles(tx: Tx, org: string, competencyId: string, roles: CompetencyDto['roles'], maxLevel: number) {
    if (roles.some((r) => r.level > maxLevel)) throw new BadRequestException(`A required level cannot be above ${maxLevel}, the highest level of this competency.`);
    if (new Set(roles.map((r) => r.designationId)).size !== roles.length) throw new BadRequestException('Each designation is listed once.');
    const designations = await tx.designation.count({ where: { organizationId: org, id: { in: roles.map((r) => r.designationId) } } });
    if (designations !== roles.length) throw new BadRequestException('Choose designations of this company.');
    const today = todayIst();
    const open = await tx.roleCompetencyMap.findMany({ where: { organizationId: org, competencyId, OR: [{ validTo: null }, { validTo: { gte: asDate(today) } }] } });
    for (const cur of open) {
      const next = roles.find((r) => r.designationId === cur.designationId);
      if (next && next.level === cur.expectedLevel) continue;
      const end = next ? dayBefore(next.validFrom) : dayBefore(today);
      if (end < iso(cur.validFrom)) await tx.roleCompetencyMap.delete({ where: { id: cur.id } });
      else await tx.roleCompetencyMap.update({ where: { id: cur.id }, data: { validTo: asDate(end) } });
    }
    for (const r of roles) {
      if (open.some((o) => o.designationId === r.designationId && o.expectedLevel === r.level)) continue;
      await tx.roleCompetencyMap.create({ data: { organizationId: org, competencyId, designationId: r.designationId, expectedLevel: r.level, validFrom: asDate(r.validFrom) } });
    }
  }

  async saveCompetency(ctx: TenantContext, id: string | null, dto: CompetencyDto) {
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const domain = await this.domainFor(tx, org, dto.group);
      let x;
      if (id) {
        const cur = await tx.competency.findFirst({ where: { organizationId: org, id } });
        if (!cur) throw new NotFoundException('No such competency.');
        if (cur.status !== 'active') throw new ConflictException('A retired competency is not changed.');
        const n = await tx.competency.updateMany({ where: { organizationId: org, id, version: dto.version ?? -1 }, data: { group: dto.group, description: dto.description ?? null, version: { increment: 1 } } });
        if (!n.count) throw new ConflictException('Someone else changed this competency. Reload it.');
        await tx.companySkill.update({ where: { id: cur.companySkillId }, data: { name: dto.name, parentId: domain.id } });
        await tx.competencyLevel.deleteMany({ where: { organizationId: org, competencyId: id } });
        x = await tx.competency.findFirstOrThrow({ where: { id } });
      } else {
        const skill = await tx.companySkill.create({ data: { organizationId: org, kind: 'skill', name: dto.name, parentId: domain.id } });
        x = await tx.competency.create({ data: { organizationId: org, companySkillId: skill.id, group: dto.group, description: dto.description ?? null } });
      }
      await tx.competencyLevel.createMany({ data: dto.levels.map((l, i) => ({ organizationId: org, competencyId: x.id, level: i + 1, label: l.label, behaviours: l.behaviours ?? null })) });
      await this.writeRoles(tx, org, x.id, dto.roles, dto.levels.length);
      await audit(tx, c, id ? 'perf.competency.updated' : 'perf.competency.created', 'competency', x.id, { name: dto.name });
      return this.competencyView(tx, org, x, todayIst());
    }).catch(this.duplicate('A skill with that name already exists in this group.'));
  }

  /** Retired competencies stay on past reviews and are not offered for new ones; nothing is deleted. */
  async retireCompetency(ctx: TenantContext, id: string) {
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const x = await tx.competency.findFirst({ where: { organizationId: org, id, status: 'active' } });
      if (!x) throw new NotFoundException('No such competency in use.');
      await tx.competency.update({ where: { id }, data: { status: 'retired', version: { increment: 1 } } });
      // Its role levels end yesterday; levels that had not started yet are dropped.
      const end = dayBefore(todayIst());
      await tx.roleCompetencyMap.deleteMany({ where: { organizationId: org, competencyId: id, validFrom: { gt: asDate(end) } } });
      await tx.roleCompetencyMap.updateMany({ where: { organizationId: org, competencyId: id, OR: [{ validTo: null }, { validTo: { gt: asDate(end) } }] }, data: { validTo: asDate(end) } });
      await audit(tx, c, 'perf.competency.retired', 'competency', id, {});
      return this.competencyView(tx, org, await tx.competency.findFirstOrThrow({ where: { id } }), todayIst());
    });
  }

  // ------------------------------------------------------------------------------------------ starters (§6.2)

  /** Copies the YukthiX starters into the company once; anything already copied (or since changed) is left alone. */
  async fromStarter(ctx: TenantContext) {
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const made = { scales: 0, templates: 0, competencies: 0 };
      let scale = await tx.ratingScale.findFirst({ where: { organizationId: org, starterKey: STARTER_SCALE.key } });
      if (!scale) {
        scale = await tx.ratingScale.create({ data: { organizationId: org, name: STARTER_SCALE.name, minValue: STARTER_SCALE.min, maxValue: STARTER_SCALE.max, step: STARTER_SCALE.step, starterKey: STARTER_SCALE.key, createdBy: c.userId ?? null } });
        await this.writeScaleParts(tx, org, scale.id, STARTER_SCALE.levels, STARTER_SCALE.bands);
        made.scales++;
      }
      for (const t of STARTER_TEMPLATES) {
        if (await tx.reviewTemplate.findFirst({ where: { organizationId: org, starterKey: t.key }, select: { id: true } })) continue;
        const row = await tx.reviewTemplate.create({ data: { organizationId: org, familyId: randomUUID(), name: t.name, kind: t.kind, scaleId: scale.id, scoring: t.scoring, status: 'active', activatedAt: new Date(), starterKey: t.key, createdBy: c.userId ?? null } });
        await this.writeSections(tx, org, row.id, t.sections);
        made.templates++;
      }
      const domains = new Map<string, string>();
      for (const d of STARTER_DOMAINS) {
        const row = (await tx.companySkill.findFirst({ where: { organizationId: org, starterKey: d.key } })) ?? (await tx.companySkill.findFirst({ where: { organizationId: org, kind: 'domain', status: 'active', name: d.name } })) ?? (await tx.companySkill.create({ data: { organizationId: org, kind: 'domain', name: d.name, starterKey: d.key } }));
        domains.set(d.group, row.id);
      }
      for (const k of STARTER_COMPETENCIES) {
        if (await tx.competency.findFirst({ where: { organizationId: org, starterKey: k.key }, select: { id: true } })) continue;
        const parentId = domains.get(k.group)!;
        if (await tx.companySkill.findFirst({ where: { organizationId: org, parentId, status: 'active', name: { equals: k.name, mode: 'insensitive' } }, select: { id: true } })) continue;
        const skill = await tx.companySkill.create({ data: { organizationId: org, kind: 'skill', name: k.name, parentId, starterKey: k.key } });
        const x = await tx.competency.create({ data: { organizationId: org, companySkillId: skill.id, group: k.group, description: k.description, starterKey: k.key } });
        await tx.competencyLevel.createMany({ data: k.levels.map((label, i) => ({ organizationId: org, competencyId: x.id, level: i + 1, label })) });
        made.competencies++;
      }
      await audit(tx, c, 'perf.setup.from_starter', 'organization', org, made);
      return made;
    });
  }

  private duplicate(message: string) {
    return (e: unknown) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(message);
      throw e;
    };
  }
}
