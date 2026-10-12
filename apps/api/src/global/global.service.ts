import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, CompanyContext, inCompany, Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { CountryPack, Language, LANGUAGES } from './country-pack';
import { companyLanguage, employeeLanguage, packFor, packsOn, SubjectType } from './global-data';
import type { CountrySetupDto, TranslationDto } from './dto';

// Batch G1 (G1-GLOBAL-CORE-BUILD-DESIGN §2, §7, §8): country packs, the company's translated words, a person's
// language and the "Add a country" guide. Runs in the caller's company under forced RLS.

type Subject = { id: string; name: string };

/** The company's words that can be translated, active ones only. */
async function subjects(tx: Tx, org: string, type: SubjectType): Promise<Subject[]> {
  const where = { organizationId: org };
  const live = { ...where, archivedAt: null };
  const name = { id: true, name: true } as const;
  switch (type) {
    case 'leave_type':
      return tx.leaveType.findMany({ where: { ...where, active: true }, select: name, orderBy: { name: 'asc' } });
    case 'designation':
      return tx.designation.findMany({ where: live, select: name, orderBy: { name: 'asc' } });
    case 'department':
      return tx.department.findMany({ where: live, select: name, orderBy: { name: 'asc' } });
    case 'grade':
      return tx.grade.findMany({ where: live, select: name, orderBy: { rank: 'asc' } });
    case 'employment_type':
      return tx.employmentType.findMany({ where: live, select: name, orderBy: { name: 'asc' } });
    case 'location':
      return tx.location.findMany({ where: live, select: name, orderBy: { name: 'asc' } });
    case 'journey_template':
      return tx.journeyTemplate.findMany({ where: { ...where, active: true }, select: name, orderBy: { name: 'asc' } });
    case 'journey_task': {
      const templates = await tx.journeyTemplate.findMany({ where: { ...where, active: true }, select: name });
      const by = new Map(templates.map((t) => [t.id, t.name]));
      const tasks = await tx.journeyTemplateTask.findMany({ where: { ...where, templateId: { in: [...by.keys()] } }, select: { id: true, title: true, templateId: true }, orderBy: [{ templateId: 'asc' }, { sortOrder: 'asc' }] });
      return tasks.map((t) => ({ id: t.id, name: `${by.get(t.templateId)} › ${t.title}` }));
    }
    // M05 expenses E1 (§6.4): category and city-tier names.
    case 'expense_category':
      return tx.expenseCategory.findMany({ where: { ...where, active: true }, select: name, orderBy: { name: 'asc' } });
    case 'city_tier':
      return tx.cityTier.findMany({ where: { ...where, active: true }, select: name, orderBy: { rank: 'asc' } });
  }
}

const packSummary = (p: CountryPack) => ({
  country: p.country,
  name: p.name,
  version: p.version,
  verify: p.verify,
  currency: p.currency,
  fyStartMonth: p.fyStartMonth,
  dataRegion: p.dataRegion,
  normalWeekHours: p.normalWeekHours,
  languages: p.languages,
  entityIds: p.entityIds,
  registrations: p.registrations,
});

@Injectable()
export class GlobalService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private run<T>(ctx: TenantContext, fn: (tx: Tx, c: CompanyContext) => Promise<T>) {
    return inCompany(this.tenantPrisma, ctx, fn);
  }

  // ------------------------------------------------------------------------------------------ country packs (G1.01, G1.04)

  countries(ctx: TenantContext) {
    return this.run(ctx, async (tx) => (await packsOn(tx, todayIst())).map(packSummary));
  }

  country(ctx: TenantContext, code: string) {
    return this.run(ctx, async (tx) => {
      const p = await packFor(tx, code, todayIst());
      if (!p) throw new NotFoundException('There is no country pack for that country yet.');
      return { ...packSummary(p), source: p.source, personFields: p.personFields };
    });
  }

  // ------------------------------------------------------------------------------------------ language (G1.06)

  private async myEmployee(tx: Tx, c: CompanyContext) {
    const e = c.userId ? await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: c.userId }, select: { id: true } }) : null;
    if (!e) throw new BadRequestException('Only people with an employee record choose a language here.');
    return e.id;
  }

  myLanguage(ctx: TenantContext) {
    return this.run(ctx, async (tx, c) => {
      const id = await this.myEmployee(tx, c);
      const own = await tx.setting.findFirst({ where: { organizationId: c.organizationId, key: 'people.language', scopeType: 'employee', scopeId: id } });
      return { language: await employeeLanguage(tx, c, id), chosen: Boolean(own), companyLanguage: await companyLanguage(tx, c), choices: LANGUAGES };
    });
  }

  setMyLanguage(ctx: TenantContext, language: Language) {
    return this.run(ctx, async (tx, c) => {
      const id = await this.myEmployee(tx, c);
      const where = { organizationId: c.organizationId, key: 'people.language', scopeType: 'employee', scopeId: id, validFrom: null };
      const existing = await tx.setting.findFirst({ where });
      const row = existing ? await tx.setting.update({ where: { id: existing.id }, data: { value: language, updatedBy: c.userId } }) : await tx.setting.create({ data: { ...where, value: language, updatedBy: c.userId } });
      await audit(tx, c, 'employee.language.changed', 'employee', id, { from: existing?.value ?? null, to: language, settingId: row.id });
      return { language, chosen: true, companyLanguage: await companyLanguage(tx, c), choices: LANGUAGES };
    });
  }

  // ------------------------------------------------------------------------------------------ translations (G1.06)

  translations(ctx: TenantContext, subjectType: SubjectType) {
    return this.run(ctx, async (tx, c) => {
      const list = await subjects(tx, c.organizationId, subjectType);
      const rows = await tx.contentTranslation.findMany({ where: { organizationId: c.organizationId, subjectType, subjectId: { in: list.map((s) => s.id) } } });
      const base = await companyLanguage(tx, c);
      return {
        subjectType,
        companyLanguage: base,
        languages: LANGUAGES.filter((l) => l !== base),
        items: list.map((s) => ({ id: s.id, name: s.name, translations: Object.fromEntries(rows.filter((r) => r.subjectId === s.id).map((r) => [r.language, r.text])) })),
      };
    });
  }

  saveTranslation(ctx: TenantContext, dto: TranslationDto) {
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      if (dto.language === (await companyLanguage(tx, c))) throw new BadRequestException("That is the company's own language: change the name itself instead.");
      if (!(await subjects(tx, org, dto.subjectType)).some((s) => s.id === dto.subjectId)) throw new NotFoundException('Not found in this company.');
      const key = { organizationId_subjectType_subjectId_language: { organizationId: org, subjectType: dto.subjectType, subjectId: dto.subjectId, language: dto.language } };
      const text = dto.text?.trim().replace(/\s+/g, ' ') ?? '';
      const before = await tx.contentTranslation.findUnique({ where: key });
      if (!text) {
        if (before) await tx.contentTranslation.delete({ where: key });
      } else {
        await tx.contentTranslation.upsert({ where: key, create: { ...key.organizationId_subjectType_subjectId_language, text, updatedBy: c.userId }, update: { text, updatedBy: c.userId } });
      }
      await audit(tx, c, text ? 'org.translation.saved' : 'org.translation.removed', dto.subjectType, dto.subjectId, { language: dto.language, from: before?.text ?? null, to: text || null });
      return { subjectType: dto.subjectType, subjectId: dto.subjectId, language: dto.language, text: text || null };
    });
  }

  // ------------------------------------------------------------------------------------------ Add a country (G1.07)

  /** What is still open for the entity, each item linking to the screen that closes it (design §8 step 5). */
  private async checklist(tx: Tx, org: string, pack: CountryPack | null, entityId: string | null) {
    const item = (key: string, label: string, done: boolean, href: string) => ({ key, label, done, href });
    if (!entityId) return [item('entity', 'Create or choose the legal entity', false, '/yx/settings/countries')];
    const entity = await tx.legalEntity.findFirst({ where: { organizationId: org, id: entityId } });
    const items = [item('entity', 'Legal entity created', Boolean(entity && !entity.archivedAt), '/yx/settings/legal-entities')];
    for (const id of pack?.entityIds.filter((x) => x.required) ?? []) {
      const on = Boolean(entity && (entity as unknown as Record<string, unknown>)[id.key]);
      items.push(item(`id:${id.key}`, `${id.key.toUpperCase()} on file`, on, '/yx/settings/legal-entities'));
    }
    const regs = await tx.statutoryRegistration.findMany({ where: { organizationId: org, legalEntityId: entityId }, select: { statute: true } });
    for (const statute of pack?.registrations ?? []) {
      items.push(item(`reg:${statute}`, `${statute.replace(/^[A-Z]{2}\./, '')} registration decided`, regs.some((r) => r.statute === statute), '/yx/payroll/setup'));
    }
    const locations = await tx.location.findMany({ where: { organizationId: org, legalEntityId: entityId, archivedAt: null }, select: { id: true } });
    items.push(item('location', 'At least one location', locations.length > 0, '/yx/settings/locations'));
    const calendars = await tx.holidayCalendar.count({ where: { organizationId: org, OR: [{ locationId: null }, { locationId: { in: locations.map((l) => l.id) } }] } });
    items.push(item('holidays', 'A holiday calendar', calendars > 0, '/yx/time/setup'));
    const policies = await tx.leavePolicyAssignment.count({ where: { organizationId: org, OR: [{ scopeType: 'tenant' }, { scopeType: 'legal_entity', scopeId: entityId }, { scopeType: 'location', scopeId: { in: locations.map((l) => l.id) } }] } });
    items.push(item('leave', 'A leave policy for its people', policies > 0, '/yx/time/setup'));
    return items;
  }

  private async setupView(tx: Tx, org: string, s: Prisma.CountrySetupGetPayload<object>) {
    const pack = await packFor(tx, s.country, todayIst());
    const entity = s.legalEntityId ? await tx.legalEntity.findFirst({ where: { organizationId: org, id: s.legalEntityId }, select: { id: true, name: true, shortName: true } }) : null;
    const checklist = await this.checklist(tx, org, pack, s.legalEntityId);
    return { id: s.id, country: s.country, countryName: pack?.name ?? s.country, legalEntity: entity, status: s.status, version: s.version, finishedAt: s.finishedAt, checklist, open: checklist.filter((i) => !i.done).length };
  }

  setups(ctx: TenantContext) {
    return this.run(ctx, async (tx, c) => {
      const rows = await tx.countrySetup.findMany({ where: { organizationId: c.organizationId }, orderBy: { createdAt: 'desc' }, take: 100 });
      return Promise.all(rows.map((s) => this.setupView(tx, c.organizationId, s)));
    });
  }

  private async entityFor(tx: Tx, org: string, country: string, legalEntityId: string) {
    const e = await tx.legalEntity.findFirst({ where: { organizationId: org, id: legalEntityId } });
    if (!e || e.archivedAt) throw new NotFoundException('That legal entity is not in this company.');
    if (e.country !== country) throw new BadRequestException(`That legal entity is in another country (${e.country}).`);
    if (await tx.countrySetup.findFirst({ where: { organizationId: org, legalEntityId }, select: { id: true } })) throw new ConflictException('That legal entity already has its own guide.');
    return e;
  }

  startSetup(ctx: TenantContext, dto: CountrySetupDto) {
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      if (!(await packFor(tx, dto.country, todayIst()))) throw new BadRequestException('There is no country pack for that country yet.');
      if (dto.legalEntityId) await this.entityFor(tx, org, dto.country, dto.legalEntityId);
      const s = await tx.countrySetup.create({ data: { organizationId: org, country: dto.country, legalEntityId: dto.legalEntityId ?? null, createdBy: c.userId } });
      await audit(tx, c, 'org.country_setup.started', 'country_setup', s.id, { country: s.country, legalEntityId: s.legalEntityId });
      return this.setupView(tx, org, s);
    });
  }

  private async setupOr404(tx: Tx, org: string, id: string, version: number) {
    const s = await tx.countrySetup.findFirst({ where: { organizationId: org, id } });
    if (!s) throw new NotFoundException('Guide not found');
    if (s.version !== version) throw new ConflictException('Someone else changed this guide. Reload it.');
    if (s.status === 'done') throw new ConflictException('This guide is finished.');
    return s;
  }

  setSetupEntity(ctx: TenantContext, id: string, legalEntityId: string, version: number) {
    return this.run(ctx, async (tx, c) => {
      const s = await this.setupOr404(tx, c.organizationId, id, version);
      if (s.legalEntityId === legalEntityId) return this.setupView(tx, c.organizationId, s);
      if (s.legalEntityId) throw new ConflictException('This guide already has its legal entity. Start a new guide for another one.');
      await this.entityFor(tx, c.organizationId, s.country, legalEntityId);
      const next = await tx.countrySetup.update({ where: { id }, data: { legalEntityId, version: { increment: 1 } } });
      await audit(tx, c, 'org.country_setup.entity', 'country_setup', id, { legalEntityId });
      return this.setupView(tx, c.organizationId, next);
    });
  }

  finishSetup(ctx: TenantContext, id: string, version: number) {
    return this.run(ctx, async (tx, c) => {
      const s = await this.setupOr404(tx, c.organizationId, id, version);
      if (!s.legalEntityId) throw new BadRequestException('Create or choose the legal entity first.');
      const next = await tx.countrySetup.update({ where: { id }, data: { status: 'done', finishedBy: c.userId, finishedAt: new Date(), version: { increment: 1 } } });
      const view = await this.setupView(tx, c.organizationId, next);
      await audit(tx, c, 'org.country_setup.finished', 'country_setup', id, { open: view.checklist.filter((i) => !i.done).map((i) => i.key) });
      return view;
    });
  }
}
