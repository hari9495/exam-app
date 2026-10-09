import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { has, tenantWide, type ScopeUser, type Viewer } from '../access/scope';
import { EmployeeHistoryService } from '../employee-history/employee-history.service';
import { RuleError } from '../rules-engine/conditions';
import { PAY_VARIABLES, checkFormula } from '../rules-engine/expressions';
import { StatutoryRulesService } from '../statutory/statutory.service';
import { StatutoryError, empDefaults, inForce, type RuleSet } from '../statutory/evaluator';
import { asDate, dateOf } from '../time/time-core';
import { addDays } from '../time/time-maths';
import { PayDocumentsService } from './documents.service';
import { CompensationChangeDto, CompensationInputDto, ComponentDto, FormulaCheckDto, LetterDto, StatutoryProfileDto, TemplateDto, TemplateVersionDto } from './dto-5b';
import { entitiesFor, payScope, payViewer, requireEntity, requireSelf } from './pay-access';
import { STARTER_COMPONENTS, STARTER_TEMPLATE } from './starter';
import { breakup, breakupJson, type ComponentDef, type Facts, type Line } from './structure';

// Batch 5b structures (PAY-2.06 formulas, 2.07 components, 2.08 templates, 2.09 compensation, 2.10 statutory profile).
// Components and templates are company data (keys checked; an entity template needs the key on that entity, a
// company-wide one a company-wide grant). Compensation is a P06 change approved by someone else (the existing change
// approval: employee.change.approve + employee.salary.view, never the requester); its breakup is stored with the change.

const iso = (d: Date | null) => (d ? dateOf(d) : null);
/** 1 April of the financial year a date falls in. */
const fyStart = (d: string) => `${Number(d.slice(5, 7)) >= 4 ? d.slice(0, 4) : Number(d.slice(0, 4)) - 1}-04-01`;
const YEARS = (dob: Date, on: string) => {
  const b = dateOf(dob);
  return Number(on.slice(0, 4)) - Number(b.slice(0, 4)) - (on.slice(5) < b.slice(5) ? 1 : 0);
};

type ComponentRow = Prisma.PayComponentGetPayload<object>;
const def = (c: ComponentRow): ComponentDef => ({ id: c.id, code: c.code, name: c.name, kind: c.kind as ComponentDef['kind'], pfWage: c.pfWage, esiWage: c.esiWage, ptWage: c.ptWage, gratuityWage: c.gratuityWage, bonusWage: c.bonusWage, codeWagePart: c.codeWagePart, codeExclusion: c.codeExclusion, inCtc: c.inCtc, rounding: c.rounding as ComponentDef['rounding'], statutory: c.statutory });

/** The minimum-wage notes shown with a breakup (YX-PAY-22, 5b-D1). */
const mwWarnings = (b: ReturnType<typeof breakup>) => [
  ...(b.minWage?.below ? ['The pay is below the minimum or floor wage for this place (YX-PAY-22).'] : []),
  ...(b.minWage && !b.minWage.floorApplied && b.minWage.skillFallback ? ['No skill class matches this person in the state table, so the lowest class was used. Set the skill class on their job.'] : []),
  ...(b.minWage?.daMissing ? ['The state’s dearness allowance for this period is not loaded, so the minimum wage was compared on its basic rate only.'] : []),
];

/** Plain-English refusal for a formula, structure or statutory problem. */
function plain<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof RuleError || e instanceof StatutoryError) throw new BadRequestException(e.message);
    throw e;
  }
}

@Injectable()
export class PayStructuresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly rules: StatutoryRulesService,
    private readonly history: EmployeeHistoryService,
    private readonly documents: PayDocumentsService,
  ) {}

  private async run<T>(ctx: TenantContext, user: ScopeUser, fn: (tx: Tx, c: CompanyContext, v: Viewer) => Promise<T>) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return inCompany(this.tenantPrisma, ctx, (tx, c) => fn(tx, c, v));
  }

  private need(v: Viewer, key: 'payroll.component.manage' | 'payroll.template.manage') {
    if (!has(v, key)) throw new ForbiddenException(`This needs ${key}.`);
  }

  /** The component library is the company's: changing it needs the key company-wide (a scoped grant would change other entities' pay). */
  private needCompanyWide(v: Viewer) {
    this.need(v, 'payroll.component.manage');
    if (!tenantWide(v, 'payroll.component.manage')) throw new ForbiddenException('The component library is company-wide: changing it needs payroll.component.manage for the whole company.');
  }

  // ------------------------------------------------------------------------------------------ components (PAY-2.07)

  private componentView(c: ComponentRow) {
    const { organizationId: _o, createdBy: _c, prorationAst: _a, ...rest } = c;
    return rest;
  }

  components(ctx: TenantContext, user: ScopeUser) {
    return this.run(ctx, user, async (tx, c) => (await tx.payComponent.findMany({ where: { organizationId: c.organizationId }, orderBy: [{ kind: 'asc' }, { code: 'asc' }] })).map((x) => this.componentView(x)));
  }

  private flags(dto: ComponentDto) {
    if (dto.codeWagePart && dto.codeExclusion) throw new BadRequestException('A component is either part of the Code wage or an exclusion, not both.');
    const proration = dto.prorationText ? plain(() => checkFormula(dto.prorationText!, new Set(PAY_VARIABLES))) : null;
    return { name: dto.name, kind: dto.kind, taxable: dto.taxable ?? true, pfWage: !!dto.pfWage, esiWage: !!dto.esiWage, ptWage: !!dto.ptWage, gratuityWage: !!dto.gratuityWage, bonusWage: !!dto.bonusWage, codeWagePart: !!dto.codeWagePart, codeExclusion: !!dto.codeExclusion, prorated: dto.prorated ?? true, onPayslip: dto.onPayslip ?? true, inCtc: dto.inCtc ?? true, prorationText: dto.prorationText ?? null, prorationAst: proration ? (proration.ast as unknown as Prisma.InputJsonValue) : Prisma.DbNull, rounding: dto.rounding ?? 'rupee', ledger: dto.ledger ?? null };
  }

  createComponent(ctx: TenantContext, user: ScopeUser, dto: ComponentDto) {
    return this.run(ctx, user, async (tx, c, v) => {
      this.needCompanyWide(v);
      const row = await tx.payComponent.create({ data: { organizationId: c.organizationId, code: dto.code, ...this.flags(dto), createdBy: c.userId } });
      await audit(tx, c, 'payroll.component.created', 'pay_component', row.id, { code: row.code });
      return this.componentView(row);
    });
  }

  /** Edits a component. A statutory one changes only its label and payslip display (database guard too). */
  updateComponent(ctx: TenantContext, user: ScopeUser, id: string, dto: ComponentDto) {
    return this.run(ctx, user, async (tx, c, v) => {
      this.needCompanyWide(v);
      const old = await tx.payComponent.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!old) throw new NotFoundException('Not found');
      if (old.code !== dto.code && old.usedAt) throw new ConflictException('The code of a component in use never changes.');
      const data = old.statutory ? { name: dto.name, onPayslip: dto.onPayslip ?? old.onPayslip, status: dto.status ?? old.status } : { code: dto.code, ...this.flags(dto), status: dto.status ?? old.status };
      const n = await tx.payComponent.updateMany({ where: { id, version: dto.version ?? old.version }, data: { ...data, version: { increment: 1 } } });
      if (!n.count) throw new ConflictException('Someone else changed this component. Reload and try again.');
      await audit(tx, c, 'payroll.component.updated', 'pay_component', id, { code: dto.code, statutory: !!old.statutory });
      return this.componentView(await tx.payComponent.findFirstOrThrow({ where: { id } }));
    });
  }

  /** Installs the India starter library and template once (existing codes are kept as they are). */
  installStarter(ctx: TenantContext, user: ScopeUser) {
    return this.run(ctx, user, async (tx, c, v) => {
      this.needCompanyWide(v);
      this.need(v, 'payroll.template.manage');
      if (!tenantWide(v, 'payroll.template.manage')) throw new ForbiddenException('The starter template is company-wide: it needs payroll.template.manage for the whole company.');
      const added = await tx.payComponent.createMany({
        data: STARTER_COMPONENTS.map(({ statutory, ...s }) => ({ organizationId: c.organizationId, ...s, taxable: s.taxable ?? true, statutory: statutory ?? null, createdBy: c.userId })),
        skipDuplicates: true,
      });
      let templateId: string | null = null;
      if (!(await tx.salaryTemplate.findFirst({ where: { organizationId: c.organizationId, name: STARTER_TEMPLATE.name } }))) {
        const t = await tx.salaryTemplate.create({ data: { organizationId: c.organizationId, name: STARTER_TEMPLATE.name, createdBy: c.userId } });
        templateId = t.id;
        const sample = { annualCtc: '726000', state: 'IN-KA', age: 30 };
        await this.saveVersion(tx, c, t.id, { validFrom: fyStart(todayIst()), lines: STARTER_TEMPLATE.lines, balancing: STARTER_TEMPLATE.balancing, employerPfInCtc: true, employerEsiInCtc: true, gratuityInCtc: false, sample });
      }
      await audit(tx, c, 'payroll.starter.installed', 'organization', c.organizationId, { components: added.count, templateId });
      return { componentsAdded: added.count, templateId };
    });
  }

  // ------------------------------------------------------------------------------------------ formulas (PAY-2.06)

  checkFormula(ctx: TenantContext, user: ScopeUser, dto: FormulaCheckDto) {
    return this.run(ctx, user, async (tx, c, v) => {
      this.need(v, 'payroll.template.manage');
      const known = await tx.payComponent.findMany({ where: { organizationId: c.organizationId, code: { in: dto.codes } }, select: { code: true } });
      const names = new Set<string>([...PAY_VARIABLES, ...known.map((k) => k.code)]);
      try {
        const r = checkFormula(dto.text, names);
        return { ok: true, type: r.type, uses: r.uses, statutory: r.statutory };
      } catch (e) {
        if (e instanceof RuleError) return { ok: false, message: e.message };
        throw e;
      }
    });
  }

  // ------------------------------------------------------------------------------------------ templates (PAY-2.08)

  templates(ctx: TenantContext, user: ScopeUser) {
    return this.run(ctx, user, async (tx, c, v) => {
      this.need(v, 'payroll.template.manage');
      const ids = await entitiesFor(tx, c, v, 'payroll.template.manage');
      const rows = await tx.salaryTemplate.findMany({ where: { organizationId: c.organizationId, OR: [{ legalEntityId: null }, { legalEntityId: { in: ids } }] }, orderBy: { name: 'asc' } });
      const versions = await tx.salaryTemplateVersion.findMany({ where: { organizationId: c.organizationId, templateId: { in: rows.map((r) => r.id) } }, orderBy: { version: 'desc' } });
      return rows.map((t) => ({ id: t.id, name: t.name, legalEntityId: t.legalEntityId, status: t.status, versions: versions.filter((x) => x.templateId === t.id).map((x) => ({ id: x.id, version: x.version, validFrom: iso(x.validFrom), codeWageFlag: x.codeWageFlag, validatedAt: x.validatedAt })) }));
    });
  }

  private async templateScope(tx: Tx, c: CompanyContext, v: Viewer, legalEntityId: string | null) {
    this.need(v, 'payroll.template.manage');
    if (legalEntityId) await requireEntity(tx, c, v, 'payroll.template.manage', legalEntityId);
    else if (!tenantWide(v, 'payroll.template.manage')) throw new ForbiddenException('A company-wide template needs payroll.template.manage for the whole company.');
  }

  createTemplate(ctx: TenantContext, user: ScopeUser, dto: TemplateDto) {
    return this.run(ctx, user, async (tx, c, v) => {
      await this.templateScope(tx, c, v, dto.legalEntityId ?? null);
      const t = await tx.salaryTemplate.create({ data: { organizationId: c.organizationId, legalEntityId: dto.legalEntityId ?? null, name: dto.name, createdBy: c.userId } });
      await audit(tx, c, 'payroll.template.created', 'salary_template', t.id, { name: t.name });
      return { id: t.id, name: t.name, legalEntityId: t.legalEntityId, status: t.status, versions: [] };
    });
  }

  /** Checks a version (§7.3): known components, safe formulas, statutory lines from the pack only, no cycle, a sample run. */
  private async checkVersion(tx: Tx, c: CompanyContext, dto: TemplateVersionDto, rules: RuleSet[]) {
    const codes = dto.lines.map((l) => l.code);
    if (new Set(codes).size !== codes.length) throw new BadRequestException('Each component appears once in a template.');
    const rows = await tx.payComponent.findMany({ where: { organizationId: c.organizationId, code: { in: codes }, status: 'active' } });
    const unknown = codes.filter((x) => !rows.some((r) => r.code === x));
    if (unknown.length) throw new BadRequestException(`Unknown or retired components: ${unknown.join(', ')}.`);
    const components = rows.map(def);
    const names = new Set<string>([...PAY_VARIABLES, ...codes]);
    const lines: Line[] = dto.lines.map((l) => {
      const comp = components.find((x) => x.code === l.code)!;
      if (comp.statutory && l.formula.replace(/\s/g, '') !== `${comp.statutory}()`) throw new BadRequestException(`${comp.name} comes from the statutory rules: its formula is ${comp.statutory}().`);
      return { code: l.code, ...plain(() => checkFormula(l.formula, names)) };
    });
    const balancing = components.find((x) => x.code === dto.balancing);
    if (!balancing || balancing.kind !== 'earning' || balancing.statutory) throw new BadRequestException('The balancing component is one of the template’s plain earnings.');
    const options = { balancingCode: dto.balancing, employerPfInCtc: dto.employerPfInCtc, employerEsiInCtc: dto.employerEsiInCtc, gratuityInCtc: dto.gratuityInCtc };
    const s = dto.sample;
    const facts: Facts = { on: dto.validFrom, month: Number(dto.validFrom.slice(5, 7)), state: s.state, age: s.age, pf: true, pfOnActualWage: false, esi: 'by_wage', pwd: false };
    const result = plain(() => breakup({ lines, components, options, facts, rules, ctc: s.annualCtc }));
    return { lines, components, result };
  }

  private async saveVersion(tx: Tx, c: CompanyContext, templateId: string, dto: TemplateVersionDto) {
    const { lines, components, result } = await this.checkVersion(tx, c, dto, await this.rules.published());
    const last = await tx.salaryTemplateVersion.findFirst({ where: { organizationId: c.organizationId, templateId }, orderBy: { version: 'desc' } });
    if (last && iso(last.validFrom)! >= dto.validFrom) throw new ConflictException(`A new version starts after the current one (${iso(last.validFrom)}).`);
    const sample = breakupJson(result);
    const ver = await tx.salaryTemplateVersion.create({
      data: { organizationId: c.organizationId, templateId, version: (last?.version ?? 0) + 1, validFrom: asDate(dto.validFrom), employerPfInCtc: dto.employerPfInCtc, employerEsiInCtc: dto.employerEsiInCtc, gratuityInCtc: dto.gratuityInCtc, balancingComponentId: components.find((x) => x.code === dto.balancing)!.id, validatedAt: new Date(), sampleInput: dto.sample as unknown as Prisma.InputJsonValue, sampleResult: sample as unknown as Prisma.InputJsonValue, codeWageFlag: result.codeWageAddBack.gt(0), createdBy: c.userId },
    });
    await tx.salaryTemplateLine.createMany({ data: lines.map((l, i) => ({ organizationId: c.organizationId, versionId: ver.id, componentId: components.find((x) => x.code === l.code)!.id, position: i, formulaText: dto.lines[i].formula, formulaAst: l.ast as unknown as Prisma.InputJsonValue, dependsOn: l.uses })) });
    return { id: ver.id, version: ver.version, validFrom: dto.validFrom, codeWageFlag: ver.codeWageFlag, sample };
  }

  addVersion(ctx: TenantContext, user: ScopeUser, templateId: string, dto: TemplateVersionDto) {
    return this.run(ctx, user, async (tx, c, v) => {
      const t = await tx.salaryTemplate.findFirst({ where: { organizationId: c.organizationId, id: templateId } });
      if (!t) throw new NotFoundException('Not found');
      await this.templateScope(tx, c, v, t.legalEntityId);
      const out = await this.saveVersion(tx, c, templateId, dto);
      await audit(tx, c, 'payroll.template.version_saved', 'salary_template', templateId, { version: out.version, validFrom: dto.validFrom, codeWageFlag: out.codeWageFlag });
      return out;
    });
  }

  /** The same checks and sample run without saving (the builder's "test"). */
  validate(ctx: TenantContext, user: ScopeUser, dto: TemplateVersionDto) {
    return this.run(ctx, user, async (tx, c, v) => {
      this.need(v, 'payroll.template.manage');
      const { result } = await this.checkVersion(tx, c, dto, await this.rules.published());
      return { ok: true, codeWageFlag: result.codeWageAddBack.gt(0), sample: breakupJson(result) };
    });
  }

  // ------------------------------------------------------------------------------------------ compensation (PAY-2.09)

  private async employmentOn(tx: Tx, org: string, employeeId: string, on: string) {
    const e = await tx.employment.findFirst({ where: { organizationId: org, employeeId, joinedOn: { lte: asDate(on) }, OR: [{ exitedOn: null }, { exitedOn: { gte: asDate(on) } }] }, orderBy: { joinedOn: 'desc' } });
    if (!e) throw new NotFoundException('Not found');
    return e;
  }

  /** The facts a breakup needs for one person on a date: state, age, gender, statutory profile or the defaults. */
  private async facts(tx: Tx, org: string, e: { id: string; employeeId: string; legalEntityId: string }, on: string, rules: RuleSet[]): Promise<Facts> {
    const a = await tx.employeeAssignment.findFirst({ where: { organizationId: org, employmentId: e.id, supersededAt: null, validFrom: { lte: asDate(on) }, OR: [{ validTo: null }, { validTo: { gte: asDate(on) } }] } });
    if (!a) throw new ConflictException('The employee has no job details on that date.');
    const loc = await tx.location.findFirstOrThrow({ where: { organizationId: org, id: a.locationId }, select: { state: true, minWageZone: true } });
    const p = await tx.employeePersonalDetails.findFirst({ where: { organizationId: org, employeeId: e.employeeId }, select: { dateOfBirth: true, gender: true } });
    const prof = await this.profileOn(tx, org, e.id, on);
    const d = prof ? null : await this.defaults(tx, org, a.employmentTypeId, on, rules);
    const option = await tx.entityStatutoryOption.findFirst({ where: { organizationId: org, legalEntityId: e.legalEntityId, optionKey: 'pf.on_actual_wage', validFrom: { lte: asDate(on) }, OR: [{ validTo: null }, { validTo: { gte: asDate(on) } }] } });
    return {
      on,
      month: Number(on.slice(5, 7)),
      state: prof?.ptState ?? loc.state,
      gender: p?.gender ?? null,
      // Without a date of birth the person is treated as under the EPS age limit; the profile screen asks for it.
      age: p?.dateOfBirth ? YEARS(p.dateOfBirth, on) : 30,
      pf: prof ? prof.pf === 'yes' : d!['IN.PF'] === 'mandatory',
      pfOnActualWage: prof?.pfOnActualWage ?? option?.value === 'yes',
      esi: prof ? (prof.esi as Facts['esi']) : d!['IN.ESI'] === 'excluded' ? 'no' : 'by_wage',
      pwd: prof?.pwdCeilingConsent ?? false,
      // The state minimum-wage zone of the place of work (5b-D1); the skill class is not on the record yet, so the lowest class applies.
      zone: loc.minWageZone,
      skill: a.skillClass,
    };
  }

  private async loadVersion(tx: Tx, org: string, versionId: string) {
    const ver = await tx.salaryTemplateVersion.findFirst({ where: { organizationId: org, id: versionId } });
    if (!ver) throw new NotFoundException('No such template version.');
    const lines = await tx.salaryTemplateLine.findMany({ where: { organizationId: org, versionId }, orderBy: { position: 'asc' } });
    const rows = await tx.payComponent.findMany({ where: { organizationId: org, id: { in: lines.map((l) => l.componentId) } } });
    const components = rows.map(def);
    const names = new Set<string>([...PAY_VARIABLES, ...rows.map((r) => r.code)]);
    const checked: Line[] = lines.map((l) => ({ code: rows.find((r) => r.id === l.componentId)!.code, ...checkFormula(l.formulaText, names) }));
    const balancing = rows.find((r) => r.id === ver.balancingComponentId)!.code;
    return { ver, lines: checked, components, options: { balancingCode: balancing, employerPfInCtc: ver.employerPfInCtc, employerEsiInCtc: ver.employerEsiInCtc, gratuityInCtc: ver.gratuityInCtc } };
  }

  private async work(tx: Tx, org: string, e: { id: string; employeeId: string; legalEntityId: string }, dto: CompensationInputDto) {
    if (dto.entryMode === 'ctc' && !dto.annualCtc) throw new BadRequestException('Give the annual CTC.');
    if (dto.entryMode === 'fixed' && !dto.fixed) throw new BadRequestException('Give the monthly amounts.');
    if (dto.fixed && Object.values(dto.fixed).some((x) => typeof x !== 'string' || !/^\d{1,12}(\.\d{1,2})?$/.test(x))) throw new BadRequestException('Monthly amounts are numbers with up to 2 decimals.');
    if ((dto.payBasis ?? 'monthly') !== 'monthly' && !dto.rate) throw new BadRequestException('An hourly or daily basis needs its rate.');
    const rules = await this.rules.published();
    const v = await this.loadVersion(tx, org, dto.templateVersionId);
    const t = await tx.salaryTemplate.findFirstOrThrow({ where: { organizationId: org, id: v.ver.templateId }, select: { legalEntityId: true, status: true } });
    if ((t.legalEntityId && t.legalEntityId !== e.legalEntityId) || t.status !== 'active') throw new BadRequestException('That template is not for this person’s legal entity.');
    if (iso(v.ver.validFrom)! > dto.effectiveDate) throw new BadRequestException('That template version starts after the effective date.');
    const facts = await this.facts(tx, org, e, dto.effectiveDate, rules);
    const b = plain(() => breakup({ lines: v.lines, components: v.components, options: v.options, facts, rules, ...(dto.entryMode === 'ctc' ? { ctc: dto.annualCtc } : { fixed: dto.fixed }) }));
    return { b, components: v.components };
  }

  /** CTC breakup with the minimum-wage check and the Code wage add-back; nothing is kept. */
  preview(ctx: TenantContext, user: ScopeUser, dto: CompensationInputDto) {
    return this.history.viewer(user).then((v) =>
      this.history.run(ctx, async (tx, c) => {
        requireSelf(v);
        const e = await this.employmentOn(tx, c.organizationId, dto.employeeId, dto.effectiveDate);
        if (!(await this.history.reachesFrom(tx, c, v, 'employee.salary.manage', e, dto.effectiveDate))) throw new NotFoundException('Not found');
        const { b } = await this.work(tx, c.organizationId, e, dto);
        return { ...breakupJson(b), warnings: mwWarnings(b) };
      }),
    );
  }

  /** A new or revised compensation: a P06 change (approved by someone else) with its breakup kept by change id. */
  change(ctx: TenantContext, user: ScopeUser, dto: CompensationChangeDto) {
    return this.history.viewer(user).then((v) =>
      this.history.run(ctx, async (tx, c) => {
        requireSelf(v);
        const e = await this.employmentOn(tx, c.organizationId, dto.employeeId, dto.effectiveDate);
        if (!(await this.history.reachesFrom(tx, c, v, 'employee.salary.manage', e, dto.effectiveDate))) throw new NotFoundException('Not found');
        if ((await this.history.ownEmployeeId(tx, c, v)) === dto.employeeId) throw new ForbiddenException('Someone else changes your own pay (YX-SEC-11).');
        await payScope(tx, [e.legalEntityId]);
        const { b, components } = await this.work(tx, c.organizationId, e, dto);
        const { ch } = await this.history.createChange(tx, c, v, { employeeId: dto.employeeId, changeType: 'salary_revision', effectiveDate: dto.effectiveDate, payload: { compensation: { currency: 'INR', annualCtc: b.annualCtc.toFixed(2) } }, reason: dto.reason, overrideReason: dto.overrideReason });
        await payScope(tx, [e.legalEntityId]);
        const pkg = await tx.compensationPackage.create({
          data: { organizationId: c.organizationId, legalEntityId: e.legalEntityId, employeeId: e.employeeId, employmentId: e.id, changeId: ch.id, templateVersionId: dto.templateVersionId, entryMode: dto.entryMode, payBasis: dto.payBasis ?? 'monthly', annualCtc: b.annualCtc, rate: dto.rate ?? null, otMultiplier: dto.otMultiplier ?? null, holidayMultiplier: dto.holidayMultiplier ?? null, monthlyGross: b.monthlyGross, minWageCheck: (breakupJson(b).minWage ?? {}) as Prisma.InputJsonValue, codeWageAddBack: b.codeWageAddBack, createdBy: c.userId },
        });
        await tx.compensationLine.createMany({ data: b.lines.map((l) => ({ organizationId: c.organizationId, legalEntityId: e.legalEntityId, employeeId: e.employeeId, packageId: pkg.id, componentId: components.find((x) => x.code === l.code)!.id, monthly: l.monthly, annual: l.annual, citation: l.citation ? (l.citation as unknown as Prisma.InputJsonValue) : Prisma.DbNull })) });
        // No amounts in the audit log (Confidential).
        await audit(tx, c, 'employee.change.requested', 'employee', e.employeeId, { changeId: ch.id, changeType: 'salary_revision', effectiveDate: dto.effectiveDate, touchesPay: true, packageId: pkg.id, belowMinimumWage: !!b.minWage?.below });
        return { changeId: ch.id, status: ch.status, packageId: pkg.id, ...breakupJson(b), warnings: mwWarnings(b) };
      }),
    );
  }

  /** The package in force on a date, with its lines: the person themselves, or employee.salary.view over them. */
  compensation(ctx: TenantContext, user: ScopeUser, employeeId: string, asOn = todayIst()) {
    return this.history.viewer(user).then((v) =>
      this.history.run(ctx, async (tx, c) => {
        requireSelf(v);
        const own = await this.history.ownEmployeeId(tx, c, v);
        const e = await this.employmentOn(tx, c.organizationId, employeeId, asOn);
        if (own !== employeeId) {
          if (!(await this.history.reachesFrom(tx, c, v, 'employee.salary.view', e, asOn))) throw new NotFoundException('Not found');
          await payScope(tx, [e.legalEntityId]);
        }
        const comp = await tx.compensation.findFirst({ where: { organizationId: c.organizationId, employmentId: e.id, supersededAt: null, validFrom: { lte: asDate(asOn) }, OR: [{ validTo: null }, { validTo: { gte: asDate(asOn) } }] } });
        if (!comp) return null;
        const pkg = await tx.compensationPackage.findFirst({ where: { organizationId: c.organizationId, changeId: comp.changeId } });
        const lines = pkg ? await tx.compensationLine.findMany({ where: { organizationId: c.organizationId, packageId: pkg.id } }) : [];
        const comps = await tx.payComponent.findMany({ where: { organizationId: c.organizationId, id: { in: lines.map((l) => l.componentId) } } });
        if (own !== employeeId) await audit(tx, c, 'payroll.compensation.viewed', 'employee', employeeId, { asOn });
        return {
          validFrom: iso(comp.validFrom),
          validTo: iso(comp.validTo),
          currency: comp.currency,
          annualCtc: comp.annualCtc.toFixed(2),
          changeId: comp.changeId,
          package: pkg ? { entryMode: pkg.entryMode, payBasis: pkg.payBasis, rate: pkg.rate?.toFixed(2) ?? null, monthlyGross: pkg.monthlyGross.toFixed(2), codeWageAddBack: pkg.codeWageAddBack.toFixed(2), minWageCheck: pkg.minWageCheck, letterDocumentId: pkg.letterDocumentId } : null,
          lines: lines.map((l) => { const k = comps.find((x) => x.id === l.componentId); return { code: k?.code, name: k?.name, kind: k?.kind, monthly: l.monthly.toFixed(2), annual: l.annual.toFixed(2), citation: l.citation }; }),
        };
      }),
    );
  }

  /** The revision letter of an approved change (P05, DSC-signed): payroll.document.issue in the entity, ⚡ on the route. */
  letter(ctx: TenantContext, user: ScopeUser, changeId: string, dto: LetterDto) {
    return this.run(ctx, user, async (tx, c, v) => {
      if (dto.confirmation.phrase !== 'ISSUE RL') throw new BadRequestException('Type ISSUE RL to confirm.');
      await payScope(tx, await entitiesFor(tx, c, v, 'payroll.document.issue'));
      const pkg = await tx.compensationPackage.findFirst({ where: { organizationId: c.organizationId, changeId } });
      if (!pkg) throw new NotFoundException('Not found');
      if (pkg.letterDocumentId) throw new ConflictException('This change already has its letter; correct it from the documents list.');
      const ch = await tx.employeeChange.findFirstOrThrow({ where: { organizationId: c.organizationId, id: changeId } });
      if (!['scheduled', 'effective'].includes(ch.status)) throw new ConflictException('The letter is issued once the change is approved.');
      const emp = await tx.employee.findFirstOrThrow({ where: { organizationId: c.organizationId, id: pkg.employeeId }, select: { userId: true, givenName: true, familyName: true, preferredName: true } });
      if (emp.userId === v.userId) throw new ForbiddenException('Someone else must issue your own pay documents.');
      const fields = { employeeName: [emp.preferredName ?? emp.givenName, emp.familyName].filter(Boolean).join(' '), effectiveFrom: dateOf(ch.effectiveDate), newAnnualCtc: pkg.annualCtc.toFixed(2), signatory: dto.signatory };
      const d = await this.documents.issueIn(tx, c, { employeeId: pkg.employeeId, legalEntityId: pkg.legalEntityId, kind: 'revision_letter', month: null, fields, supersedes: null, by: v.userId!, confirmation: dto.confirmation });
      await tx.compensationPackage.update({ where: { id: pkg.id }, data: { letterDocumentId: d.id } });
      return { documentId: d.id, referenceNo: d.referenceNo, status: d.status };
    });
  }

  // ------------------------------------------------------------------------------------------ statutory profile (PAY-2.10)

  private profileOn(tx: Tx, org: string, employmentId: string, on: string) {
    return tx.employeeStatutory.findFirst({ where: { organizationId: org, employmentId, validFrom: { lte: asDate(on) }, OR: [{ validTo: null }, { validTo: { gte: asDate(on) } }] } });
  }

  /** IN.EMPTYPE defaults for the employment type's category (what the law makes mandatory, excluded or a choice). */
  private async defaults(tx: Tx, org: string, employmentTypeId: string, on: string, rules: RuleSet[]) {
    const t = await tx.employmentType.findFirstOrThrow({ where: { organizationId: org, id: employmentTypeId }, select: { category: true } });
    const rs = inForce(rules, 'IN.EMPTYPE', ['IN'], on);
    if (!rs) throw new ConflictException('No employment-type defaults are published.');
    const out: Record<string, string> = {};
    for (const s of ['IN.PF', 'IN.ESI', 'IN.PT', 'IN.LWF']) out[s] = plain(() => empDefaults(rs, { category: t.category, statute: s })).applicability;
    return out;
  }

  private async profileContext(tx: Tx, c: CompanyContext, v: Viewer, employeeId: string, on: string, key: 'employee.salary.view' | 'employee.salary.manage') {
    const e = await this.employmentOn(tx, c.organizationId, employeeId, on);
    if (!(await this.history.reachesFrom(tx, c, v, key, e, on))) throw new NotFoundException('Not found');
    await payScope(tx, [e.legalEntityId]);
    const a = await tx.employeeAssignment.findFirst({ where: { organizationId: c.organizationId, employmentId: e.id, supersededAt: null, validFrom: { lte: asDate(on) }, OR: [{ validTo: null }, { validTo: { gte: asDate(on) } }] } });
    if (!a) throw new ConflictException('The employee has no job details on that date.');
    return { e, defaults: await this.defaults(tx, c.organizationId, a.employmentTypeId, on, await this.rules.published()) };
  }

  private profileView(r: Prisma.EmployeeStatutoryGetPayload<object>) {
    return { id: r.id, validFrom: iso(r.validFrom), validTo: iso(r.validTo), pf: r.pf, eps: r.eps, pre2014Member: r.pre2014Member, higherPension: r.higherPension, vpfPercent: r.vpfPercent.toFixed(2), pfOnActualWage: r.pfOnActualWage, internationalWorker: r.internationalWorker, esi: r.esi, pwdCeilingConsent: r.pwdCeilingConsent, ptState: r.ptState, lwfState: r.lwfState, reason: r.reason };
  }

  statutoryProfile(ctx: TenantContext, user: ScopeUser, employeeId: string) {
    return this.history.viewer(user).then((v) =>
      this.history.run(ctx, async (tx, c) => {
        requireSelf(v);
        const today = todayIst();
        const { e, defaults } = await this.profileContext(tx, c, v, employeeId, today, 'employee.salary.view');
        const rows = await tx.employeeStatutory.findMany({ where: { organizationId: c.organizationId, employmentId: e.id }, orderBy: { validFrom: 'desc' } });
        return { defaults, history: rows.map((r) => this.profileView(r)) };
      }),
    );
  }

  /** A new dated profile. Only what the law leaves open can differ from the defaults (YX-STAT-06). */
  saveStatutoryProfile(ctx: TenantContext, user: ScopeUser, employeeId: string, dto: StatutoryProfileDto) {
    return this.history.viewer(user).then((v) =>
      this.history.run(ctx, async (tx, c) => {
        requireSelf(v);
        const { e, defaults } = await this.profileContext(tx, c, v, employeeId, dto.validFrom, 'employee.salary.manage');
        if ((await this.history.ownEmployeeId(tx, c, v)) === employeeId) throw new ForbiddenException('Someone else changes your own statutory profile.');
        if (defaults['IN.PF'] === 'mandatory' && dto.pf === 'no') throw new BadRequestException('PF is mandatory for this kind of employment.');
        if (defaults['IN.PF'] === 'excluded' && dto.pf === 'yes') throw new BadRequestException('PF does not apply to this kind of employment.');
        if (defaults['IN.ESI'] === 'by_wage' && dto.esi !== 'by_wage') throw new BadRequestException('ESI follows the wage limit for this kind of employment; it is not a choice.');
        if (defaults['IN.ESI'] === 'excluded' && dto.esi !== 'no') throw new BadRequestException('ESI does not apply to this kind of employment.');
        if (dto.vpfPercent && new Prisma.Decimal(dto.vpfPercent).gt(0) && dto.pf === 'no') throw new BadRequestException('Voluntary PF needs PF membership.');
        if (dto.higherPension && !dto.pre2014Member) throw new BadRequestException('Higher pension is only for members from before 1 Sep 2014.');
        const open = await tx.employeeStatutory.findFirst({ where: { organizationId: c.organizationId, employmentId: e.id, validTo: null } });
        if (open) {
          if (iso(open.validFrom)! >= dto.validFrom) throw new ConflictException('The new profile must start after the current one started.');
          await tx.employeeStatutory.update({ where: { id: open.id }, data: { validTo: asDate(addDays(dto.validFrom, -1)) } });
        }
        const row = await tx.employeeStatutory.create({
          data: { organizationId: c.organizationId, legalEntityId: e.legalEntityId, employeeId, employmentId: e.id, validFrom: asDate(dto.validFrom), pf: dto.pf, eps: dto.eps ?? dto.pf === 'yes', pre2014Member: !!dto.pre2014Member, higherPension: !!dto.higherPension, vpfPercent: dto.vpfPercent ?? '0', pfOnActualWage: dto.pfOnActualWage ?? null, internationalWorker: !!dto.internationalWorker, esi: dto.esi, pwdCeilingConsent: !!dto.pwdCeilingConsent, ptState: dto.ptState ?? null, lwfState: dto.lwfState ?? null, reason: dto.reason, createdBy: c.userId },
        });
        await audit(tx, c, 'payroll.statutory_profile.saved', 'employee', employeeId, { validFrom: dto.validFrom, pf: dto.pf, esi: dto.esi });
        return this.profileView(row);
      }),
    );
  }
}
