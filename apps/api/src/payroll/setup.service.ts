import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { localOf, writeLabel, type LocalLanguage } from '../documents/payslip-languages';
import { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import type { ScopeUser, Viewer } from '../access/scope';
import { asDate, dateOf } from '../time/time-core';
import { addDays } from '../time/time-maths';
import { StatutoryRulesService } from '../statutory/statutory.service';
import { coverage, inForce } from '../statutory/evaluator';
import { LayoutDto, LegalOptionDto, MemberDto, PayGroupDto, RegistrationsDto } from './dto-5b';
import { entitiesFor, payViewer, requireEntity, requireSelf } from './pay-access';

// Batch 5b set-up (PAY-2.04 entity statutory set-up, PAY-2.05 pay groups, PAY-2.11 coverage monitor, PAY-2.13 payslip
// layout). Every read and write checks the key's legal-entity scope; registrations and legal options are
// payroll.statutory.setup (⚡ on the route). Legal options are only what the law leaves to the employer (YX-STAT-06).

const iso = (d: Date | null) => (d ? dateOf(d) : null);
const STATE_STATUTES = new Set(['IN.PT', 'IN.LWF']);

// What each legal option may be (the law's choices; rates come from the pack).
const OPTION_VALUES: Record<string, (v: string, bonusRange: [Prisma.Decimal, Prisma.Decimal] | null) => boolean> = {
  'pf.on_actual_wage': (v) => v === 'yes' || v === 'no',
  'bonus.payment': (v) => v === 'annual' || v === 'monthly',
  'gratuity.provisioning': (v) => v === 'formula' || v === 'actuarial',
  'bonus.rate': (v, r) => /^0\.\d{1,4}$/.test(v) && !!r && new Prisma.Decimal(v).gte(r[0]) && new Prisma.Decimal(v).lte(r[1]),
};

@Injectable()
export class PaySetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly rules: StatutoryRulesService,
  ) {}

  private async viewer(user: ScopeUser) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return v;
  }

  private run<T>(ctx: TenantContext, user: ScopeUser, fn: (tx: Tx, c: CompanyContext, v: Viewer) => Promise<T>) {
    return this.viewer(user).then((v) => inCompany(this.tenantPrisma, ctx, (tx, c) => fn(tx, c, v)));
  }

  /** Jurisdictions that apply to an entity: India and the states of its locations. */
  private async states(tx: Tx, org: string, entityId: string) {
    const locs = await tx.location.findMany({ where: { organizationId: org, legalEntityId: entityId, archivedAt: null }, select: { state: true } });
    return [...new Set(locs.map((l) => l.state))].sort();
  }

  /** The legal entities any 5b set-up key reaches (for the screens' entity picker). */
  entities(ctx: TenantContext, user: ScopeUser) {
    return this.run(ctx, user, async (tx, c, v) => {
      const keys = ['payroll.setup.manage', 'payroll.statutory.setup', 'payroll.template.manage', 'payroll.import.run'] as const;
      const reach = await Promise.all(keys.map(async (k) => [k, await entitiesFor(tx, c, v, k)] as const));
      const ids = [...new Set(reach.flatMap(([, x]) => x))];
      const rows = await tx.legalEntity.findMany({ where: { organizationId: c.organizationId, id: { in: ids }, archivedAt: null }, select: { id: true, name: true, shortName: true }, orderBy: { name: 'asc' } });
      return rows.map((e) => ({ ...e, keys: reach.filter(([, x]) => x.includes(e.id)).map(([k]) => k) }));
    });
  }

  // ------------------------------------------------------------------------------------------ rules browser

  /** The published rules (read-only), with sources and verify flags; for an entity, only India and its states. */
  rulesFor(ctx: TenantContext, user: ScopeUser, entityId?: string) {
    return this.run(ctx, user, async (tx, c, v) => {
      let juris: string[] | null = null;
      if (entityId) {
        await requireEntity(tx, c, v, 'payroll.setup.manage', entityId);
        juris = ['IN', ...(await this.states(tx, c.organizationId, entityId))];
      } else if (!(await entitiesFor(tx, c, v, 'payroll.setup.manage')).length) throw new NotFoundException('Not found');
      const rows = await tx.statutoryRuleSet.findMany({ where: { status: 'published', ...(juris ? { jurisdiction: { in: juris } } : {}) }, orderBy: [{ statute: 'asc' }, { jurisdiction: 'asc' }, { validFrom: 'desc' }] });
      return rows.map((r) => ({ id: r.id, statute: r.statute, jurisdiction: r.jurisdiction, version: r.version, validFrom: iso(r.validFrom), validTo: iso(r.validTo), lawVersion: r.lawVersion, verify: r.verify, source: r.source, values: r.values }));
    });
  }

  // ------------------------------------------------------------------------------------------ registrations (PAY-2.04)

  private async completeness(tx: Tx, org: string, entityId: string) {
    const regs = await tx.statutoryRegistration.findMany({ where: { organizationId: org, legalEntityId: entityId } });
    const entity = await tx.legalEntity.findFirstOrThrow({ where: { organizationId: org, id: entityId }, select: { tan: true } });
    const missing: string[] = [];
    for (const r of regs) {
      const what = `${r.statute}${r.state ? ` ${r.state}` : ''}`;
      if (r.status === 'on' && (!r.registrationNo || !r.startOn)) missing.push(`${what}: registration number and start date`);
      if (r.status !== 'off' && (!r.responsiblePerson || !r.responsibleDesignation)) missing.push(`${what}: the responsible person and their designation`);
    }
    // TDS is deducted by every employer paying salary: the TAN (deductor) must be on file.
    if (!entity.tan) missing.push('IN.TDS: the entity TAN (deductor details, set on the legal entity)');
    for (const s of await this.states(tx, org, entityId)) {
      if (!regs.some((r) => r.statute === 'IN.PT' && r.state === s)) missing.push(`IN.PT ${s}: say whether the entity is registered`);
    }
    return { complete: missing.length === 0, missing };
  }

  private regView(r: Prisma.StatutoryRegistrationGetPayload<object>) {
    return { id: r.id, statute: r.statute, state: r.state || null, status: r.status, registrationNo: r.registrationNo, startOn: iso(r.startOn), appliedOn: iso(r.appliedOn), responsiblePerson: r.responsiblePerson, responsibleDesignation: r.responsibleDesignation, address: r.address, version: r.version };
  }

  registrations(ctx: TenantContext, user: ScopeUser, entityId: string) {
    return this.run(ctx, user, async (tx, c, v) => {
      await requireEntity(tx, c, v, 'payroll.statutory.setup', entityId);
      const regs = await tx.statutoryRegistration.findMany({ where: { organizationId: c.organizationId, legalEntityId: entityId }, orderBy: [{ statute: 'asc' }, { state: 'asc' }] });
      return { registrations: regs.map((r) => this.regView(r)), completeness: await this.completeness(tx, c.organizationId, entityId) };
    });
  }

  saveRegistrations(ctx: TenantContext, user: ScopeUser, entityId: string, dto: RegistrationsDto) {
    return this.run(ctx, user, async (tx, c, v) => {
      await requireEntity(tx, c, v, 'payroll.statutory.setup', entityId);
      const states = await this.states(tx, c.organizationId, entityId);
      for (const r of dto.registrations) {
        const state = r.state ?? '';
        if (STATE_STATUTES.has(r.statute) !== (state !== '')) throw new BadRequestException(`${r.statute} ${STATE_STATUTES.has(r.statute) ? 'needs' : 'has no'} a state.`);
        if (state && !states.includes(state)) throw new BadRequestException(`The entity has no location in ${state}.`);
        if (r.status === 'applied_awaited' && !r.appliedOn) throw new BadRequestException(`${r.statute}: give the date it was applied for.`);
        const data = { status: r.status, registrationNo: r.registrationNo ?? null, startOn: r.startOn ? asDate(r.startOn) : null, appliedOn: r.appliedOn ? asDate(r.appliedOn) : null, responsiblePerson: r.responsiblePerson ?? null, responsibleDesignation: r.responsibleDesignation ?? null, address: (r.address ?? Prisma.DbNull) as Prisma.InputJsonValue, updatedBy: c.userId, updatedAt: new Date() };
        const key = { organizationId: c.organizationId, legalEntityId: entityId, statute: r.statute, state };
        const old = await tx.statutoryRegistration.findFirst({ where: key });
        if (old) {
          if (r.version !== undefined && r.version !== old.version) throw new ConflictException(`${r.statute} was changed by someone else. Reload and try again.`);
          await tx.statutoryRegistration.update({ where: { id: old.id }, data: { ...data, version: old.version + 1 } });
        } else await tx.statutoryRegistration.create({ data: { ...key, ...data } });
        // Registration numbers are not written to the audit log; only which statute and its status.
        await audit(tx, c, 'payroll.statutory.registration_saved', 'legal_entity', entityId, { statute: r.statute, state: state || null, status: r.status, numberChanged: old?.registrationNo !== (r.registrationNo ?? null) });
      }
      const regs = await tx.statutoryRegistration.findMany({ where: { organizationId: c.organizationId, legalEntityId: entityId }, orderBy: [{ statute: 'asc' }, { state: 'asc' }] });
      return { registrations: regs.map((x) => this.regView(x)), completeness: await this.completeness(tx, c.organizationId, entityId) };
    });
  }

  // ------------------------------------------------------------------------------------------ legal options (dated)

  legalOptions(ctx: TenantContext, user: ScopeUser, entityId: string) {
    return this.run(ctx, user, async (tx, c, v) => {
      await requireEntity(tx, c, v, 'payroll.statutory.setup', entityId);
      const rows = await tx.entityStatutoryOption.findMany({ where: { organizationId: c.organizationId, legalEntityId: entityId }, orderBy: [{ optionKey: 'asc' }, { validFrom: 'desc' }] });
      return rows.map((r) => ({ id: r.id, optionKey: r.optionKey, value: r.value, validFrom: iso(r.validFrom), validTo: iso(r.validTo) }));
    });
  }

  /** A new dated value: the open row is closed the day before (history kept, never edited). */
  setLegalOption(ctx: TenantContext, user: ScopeUser, entityId: string, dto: LegalOptionDto) {
    return this.run(ctx, user, async (tx, c, v) => {
      await requireEntity(tx, c, v, 'payroll.statutory.setup', entityId);
      const bonusRs = inForce(await this.rules.published(), 'IN.BONUS', ['IN'], dto.validFrom);
      const range: [Prisma.Decimal, Prisma.Decimal] | null = bonusRs ? [new Prisma.Decimal(bonusRs.values.minRate as string), new Prisma.Decimal(bonusRs.values.maxRate as string)] : null;
      if (!OPTION_VALUES[dto.optionKey](dto.value, range)) throw new BadRequestException(dto.optionKey === 'bonus.rate' && range ? `The bonus rate is between ${range[0]} and ${range[1]} (Payment of Bonus Act).` : `That is not a choice the law leaves for ${dto.optionKey}.`);
      const open = await tx.entityStatutoryOption.findFirst({ where: { organizationId: c.organizationId, legalEntityId: entityId, optionKey: dto.optionKey, validTo: null } });
      if (open) {
        if (iso(open.validFrom)! >= dto.validFrom) throw new ConflictException('The new value must start after the current one started.');
        await tx.entityStatutoryOption.update({ where: { id: open.id }, data: { validTo: asDate(addDays(dto.validFrom, -1)) } });
      }
      const row = await tx.entityStatutoryOption.create({ data: { organizationId: c.organizationId, legalEntityId: entityId, optionKey: dto.optionKey, value: dto.value, validFrom: asDate(dto.validFrom), createdBy: c.userId } });
      await audit(tx, c, 'payroll.statutory.option_set', 'legal_entity', entityId, { optionKey: dto.optionKey, value: dto.value, validFrom: dto.validFrom });
      return { id: row.id, optionKey: row.optionKey, value: row.value, validFrom: dto.validFrom, validTo: null };
    });
  }

  // ------------------------------------------------------------------------------------------ set-up wizard state

  /** Where an entity's payroll set-up stands (computed, nothing stored). */
  wizard(ctx: TenantContext, user: ScopeUser, entityId: string) {
    return this.run(ctx, user, async (tx, c, v) => {
      await requireEntity(tx, c, v, 'payroll.setup.manage', entityId);
      const org = c.organizationId;
      const [groups, components, templates, layout] = await Promise.all([
        tx.payGroup.count({ where: { organizationId: org, legalEntityId: entityId, status: 'active' } }),
        tx.payComponent.count({ where: { organizationId: org, status: 'active' } }),
        tx.salaryTemplate.count({ where: { organizationId: org, status: 'active', OR: [{ legalEntityId: null }, { legalEntityId: entityId }] } }),
        tx.payslipLayout.count({ where: { organizationId: org, legalEntityId: entityId, status: 'active' } }),
      ]);
      const reg = await this.completeness(tx, org, entityId);
      const steps = [
        { key: 'registrations', done: reg.complete, missing: reg.missing },
        { key: 'pay_groups', done: groups > 0 },
        { key: 'components', done: components > 0 },
        { key: 'templates', done: templates > 0 },
        { key: 'payslip_layout', done: layout > 0 },
      ];
      return { steps, ready: steps.every((s) => s.done) };
    });
  }

  // ------------------------------------------------------------------------------------------ pay groups (PAY-2.05)

  private groupView(g: Prisma.PayGroupGetPayload<object>) {
    return { id: g.id, legalEntityId: g.legalEntityId, name: g.name, frequency: g.frequency, currency: g.currency, dayBasis: g.dayBasis, cutOffDay: g.cutOffDay, payDay: g.payDay, bankFormat: g.bankFormat, status: g.status, version: g.version };
  }

  payGroups(ctx: TenantContext, user: ScopeUser) {
    return this.run(ctx, user, async (tx, c, v) => {
      const ids = await entitiesFor(tx, c, v, 'payroll.setup.manage');
      const rows = await tx.payGroup.findMany({ where: { organizationId: c.organizationId, legalEntityId: { in: ids } }, orderBy: { name: 'asc' } });
      return rows.map((g) => this.groupView(g));
    });
  }

  createPayGroup(ctx: TenantContext, user: ScopeUser, dto: PayGroupDto) {
    return this.run(ctx, user, async (tx, c, v) => {
      await requireEntity(tx, c, v, 'payroll.setup.manage', dto.legalEntityId);
      const g = await tx.payGroup.create({ data: { organizationId: c.organizationId, legalEntityId: dto.legalEntityId, name: dto.name, dayBasis: dto.dayBasis ?? 'calendar', cutOffDay: dto.cutOffDay, payDay: dto.payDay, bankFormat: dto.bankFormat ?? null, createdBy: c.userId } });
      await audit(tx, c, 'payroll.pay_group.created', 'pay_group', g.id, { name: g.name, legalEntityId: g.legalEntityId });
      return this.groupView(g);
    });
  }

  private async groupIn(tx: Tx, c: CompanyContext, v: Viewer, id: string) {
    const g = await tx.payGroup.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!g) throw new NotFoundException('Not found');
    await requireEntity(tx, c, v, 'payroll.setup.manage', g.legalEntityId);
    return g;
  }

  updatePayGroup(ctx: TenantContext, user: ScopeUser, id: string, dto: PayGroupDto) {
    return this.run(ctx, user, async (tx, c, v) => {
      const g = await this.groupIn(tx, c, v, id);
      if (dto.legalEntityId !== g.legalEntityId) throw new BadRequestException('A pay group stays in its legal entity.');
      const n = await tx.payGroup.updateMany({ where: { id, version: dto.version ?? g.version }, data: { name: dto.name, dayBasis: dto.dayBasis ?? g.dayBasis, cutOffDay: dto.cutOffDay, payDay: dto.payDay, bankFormat: dto.bankFormat ?? null, version: { increment: 1 } } });
      if (!n.count) throw new ConflictException('Someone else changed this pay group. Reload and try again.');
      await audit(tx, c, 'payroll.pay_group.updated', 'pay_group', id, { name: dto.name });
      return this.groupView(await tx.payGroup.findFirstOrThrow({ where: { id } }));
    });
  }

  members(ctx: TenantContext, user: ScopeUser, id: string, on?: string) {
    return this.run(ctx, user, async (tx, c, v) => {
      await this.groupIn(tx, c, v, id);
      const day = asDate(on ?? todayIst());
      const rows = await tx.$queryRaw<{ employeeId: string; employmentId: string; employeeCode: string; name: string; validFrom: Date; validTo: Date | null }[]>`
        SELECT e.id::text AS "employeeId", m.employment_id::text AS "employmentId", em.employee_code AS "employeeCode",
               concat_ws(' ', coalesce(e.preferred_name, e.given_name), e.family_name) AS name, m.valid_from AS "validFrom", m.valid_to AS "validTo"
        FROM pay_group_members m JOIN employments em ON em.organization_id = m.organization_id AND em.id = m.employment_id
        JOIN employees e ON e.organization_id = em.organization_id AND e.id = em.employee_id
        WHERE m.organization_id = ${c.organizationId}::uuid AND m.pay_group_id = ${id}::uuid AND m.valid_from <= ${day} AND (m.valid_to IS NULL OR m.valid_to >= ${day})
        ORDER BY em.employee_code LIMIT 5000`;
      return rows.map((r) => ({ ...r, validFrom: iso(r.validFrom), validTo: iso(r.validTo) }));
    });
  }

  /** Moves people into a group from a date: an open membership elsewhere closes the day before (dated, no overlap). */
  addMembers(ctx: TenantContext, user: ScopeUser, id: string, dto: MemberDto) {
    return this.run(ctx, user, async (tx, c, v) => {
      const g = await this.groupIn(tx, c, v, id);
      const emps = await tx.employment.findMany({ where: { organizationId: c.organizationId, employeeId: { in: dto.employeeIds }, legalEntityId: g.legalEntityId, OR: [{ exitedOn: null }, { exitedOn: { gte: asDate(dto.from) } }] }, orderBy: { joinedOn: 'desc' } });
      const byEmployee = new Map<string, (typeof emps)[number]>();
      for (const e of emps) if (!byEmployee.has(e.employeeId)) byEmployee.set(e.employeeId, e);
      const missing = dto.employeeIds.filter((x) => !byEmployee.has(x));
      if (missing.length) throw new NotFoundException(`${missing.length} of these people have no employment in this pay group's legal entity.`);
      for (const e of byEmployee.values()) {
        const from = dto.from < dateOf(e.joinedOn) ? dateOf(e.joinedOn) : dto.from;
        const open = await tx.payGroupMember.findFirst({ where: { organizationId: c.organizationId, employmentId: e.id, OR: [{ validTo: null }, { validTo: { gte: asDate(from) } }] }, orderBy: { validFrom: 'desc' } });
        if (open?.payGroupId === id) continue;
        if (open) {
          if (dateOf(open.validFrom) >= from) throw new ConflictException(`${e.employeeCode} already has a pay group from ${dateOf(open.validFrom)}.`);
          await tx.payGroupMember.update({ where: { id: open.id }, data: { validTo: asDate(addDays(from, -1)) } });
        }
        await tx.payGroupMember.create({ data: { organizationId: c.organizationId, payGroupId: id, employmentId: e.id, validFrom: asDate(from), createdBy: c.userId } });
      }
      await audit(tx, c, 'payroll.pay_group.members_added', 'pay_group', id, { count: byEmployee.size, from: dto.from });
      return { added: byEmployee.size };
    });
  }

  /** The group's pay calendar for a year: each month's period, cut-off and pay date (no rows until a run, 5c). */
  calendar(ctx: TenantContext, user: ScopeUser, id: string, year: string) {
    return this.run(ctx, user, async (tx, c, v) => {
      const g = await this.groupIn(tx, c, v, id);
      return Array.from({ length: 12 }, (_, i) => {
        const month = `${year}-${String(i + 1).padStart(2, '0')}`;
        const end = addDays(new Date(Date.UTC(Number(year), i + 1, 1)).toISOString().slice(0, 10), -1);
        const pay = g.payDay === 0 ? end : addDays(end, g.payDay);
        return { month, periodStart: `${month}-01`, periodEnd: end, cutOff: `${month}-${String(g.cutOffDay).padStart(2, '0')}`, payDate: pay };
      });
    });
  }

  // ------------------------------------------------------------------------------------------ payslip layout (PAY-2.13)

  private async mandatoryLabels(on: string) {
    const rs = inForce(await this.rules.published(), 'IN.WAGESLIP', ['IN'], on);
    return (rs?.values.mandatory as { key: string; label: string }[] | undefined) ?? [];
  }

  private async mandatoryBlocks(on: string) {
    return (await this.mandatoryLabels(on)).map((m) => m.key);
  }

  layouts(ctx: TenantContext, user: ScopeUser, entityId: string) {
    return this.run(ctx, user, async (tx, c, v) => {
      await requireEntity(tx, c, v, 'payroll.setup.manage', entityId);
      const rows = await tx.payslipLayout.findMany({ where: { organizationId: c.organizationId, legalEntityId: entityId }, orderBy: { version: 'desc' }, take: 20 });
      return { mandatory: await this.mandatoryBlocks(todayIst()), layouts: rows.map((r) => ({ id: r.id, version: r.version, blocks: r.blocks, languages: r.languages, status: r.status, previewedAt: r.previewedAt, activatedAt: r.activatedAt })) };
    });
  }

  /** Saves the draft (a new version when the latest is active or retired). Mandatory wage-slip blocks stay shown. */
  saveLayout(ctx: TenantContext, user: ScopeUser, entityId: string, dto: LayoutDto) {
    return this.run(ctx, user, async (tx, c, v) => {
      await requireEntity(tx, c, v, 'payroll.setup.manage', entityId);
      const mandatory = await this.mandatoryBlocks(todayIst());
      const hidden = mandatory.filter((k) => !dto.blocks.some((b) => b.key === k && b.shown));
      if (hidden.length) throw new BadRequestException(`The wage slip must show: ${hidden.join(', ')} (Code on Wages).`);
      // Founder decision 5b-D2 (9 Oct 2026): English always, plus at most one of Hindi, Tamil, Telugu or Kannada.
      if (!dto.languages.includes('en') || new Set(dto.languages).size !== dto.languages.length || dto.languages.length > 2) throw new BadRequestException('A payslip is in English, with at most one more language.');
      const latest = await tx.payslipLayout.findFirst({ where: { organizationId: c.organizationId, legalEntityId: entityId, payGroupId: null }, orderBy: { version: 'desc' } });
      const data = { blocks: dto.blocks as unknown as Prisma.InputJsonValue, languages: dto.languages, previewedAt: null };
      const row = latest?.status === 'draft'
        ? await tx.payslipLayout.update({ where: { id: latest.id }, data })
        : await tx.payslipLayout.create({ data: { organizationId: c.organizationId, legalEntityId: entityId, version: (latest?.version ?? 0) + 1, createdBy: c.userId, ...data } });
      await audit(tx, c, 'payroll.payslip_layout.saved', 'legal_entity', entityId, { version: row.version });
      return { id: row.id, version: row.version, status: row.status };
    });
  }

  /** Renders the draft with sample figures (the real renderer's blocks) and marks it previewed. */
  previewLayout(ctx: TenantContext, user: ScopeUser, entityId: string) {
    return this.run(ctx, user, async (tx, c, v) => {
      await requireEntity(tx, c, v, 'payroll.setup.manage', entityId);
      const d = await tx.payslipLayout.findFirst({ where: { organizationId: c.organizationId, legalEntityId: entityId, status: 'draft' }, orderBy: { version: 'desc' } });
      if (!d) throw new NotFoundException('There is no draft layout to preview.');
      const entity = await tx.legalEntity.findFirstOrThrow({ where: { id: entityId }, select: { name: true } });
      await tx.payslipLayout.update({ where: { id: d.id }, data: { previewedAt: new Date() } });
      const labels = Object.fromEntries((await this.mandatoryLabels(todayIst())).map((m) => [m.key, m.label]));
      return { file: await renderSample(entity.name, d.blocks as { key: string; shown: boolean }[], labels, localOf(d.languages)), name: `payslip-layout-v${d.version}-preview.pdf` };
    });
  }

  /** Activates the previewed draft; the active one before it is retired (one active layout per entity). */
  activateLayout(ctx: TenantContext, user: ScopeUser, entityId: string) {
    return this.run(ctx, user, async (tx, c, v) => {
      await requireEntity(tx, c, v, 'payroll.setup.manage', entityId);
      const d = await tx.payslipLayout.findFirst({ where: { organizationId: c.organizationId, legalEntityId: entityId, status: 'draft' }, orderBy: { version: 'desc' } });
      if (!d) throw new NotFoundException('There is no draft layout.');
      if (!d.previewedAt) throw new ConflictException('Preview the layout before making it active.');
      await tx.payslipLayout.updateMany({ where: { organizationId: c.organizationId, legalEntityId: entityId, payGroupId: null, status: 'active' }, data: { status: 'retired' } });
      await tx.payslipLayout.update({ where: { id: d.id }, data: { status: 'active', activatedBy: c.userId, activatedAt: new Date() } });
      await audit(tx, c, 'payroll.payslip_layout.activated', 'legal_entity', entityId, { version: d.version });
      return { id: d.id, version: d.version, status: 'active' };
    });
  }

  // ------------------------------------------------------------------------------------------ coverage (PAY-2.11)

  coverage(ctx: TenantContext, user: ScopeUser) {
    return this.run(ctx, user, async (tx, c, v) => {
      const ids = await entitiesFor(tx, c, v, 'payroll.setup.manage');
      const rows = await tx.establishmentCoverage.findMany({ where: { organizationId: c.organizationId, legalEntityId: { in: ids } }, orderBy: [{ legalEntityId: 'asc' }, { statute: 'asc' }] });
      return rows.map((r) => ({ legalEntityId: r.legalEntityId, statute: r.statute, headcount: r.headcount, threshold: r.threshold, status: r.status, crossedOn: iso(r.crossedOn), ruleVersion: r.ruleVersion, evaluatedAt: r.evaluatedAt }));
    });
  }

  /**
   * The daily coverage check (YX-STAT): head count of every entity against IN.COVERAGE; PF and ESI stay covered once
   * covered. A change of status is audited (the audit feed notifies payroll).
   */
  async evaluateCoverage(today = todayIst()): Promise<number> {
    const rs = inForce(await this.rules.published(), 'IN.COVERAGE', ['IN'], today);
    if (!rs) return 0;
    const statutes = (rs.values.items as { statute: string }[]).map((i) => i.statute);
    const orgs = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.organization.findMany({ select: { id: true } }));
    let changed = 0;
    for (const o of orgs) {
      const c = { organizationId: o.id, isSuperAdmin: false, userId: null } as unknown as CompanyContext;
      await this.tenantPrisma.forTenant(c, async (tx) => {
        const counts = await tx.$queryRaw<{ legalEntityId: string; n: number }[]>`
          SELECT le.id::text AS "legalEntityId", count(m.id)::int AS n FROM legal_entities le
          LEFT JOIN employments m ON m.organization_id = le.organization_id AND m.legal_entity_id = le.id AND m.joined_on <= ${today}::date AND (m.exited_on IS NULL OR m.exited_on >= ${today}::date)
          WHERE le.organization_id = ${o.id}::uuid AND le.archived_at IS NULL GROUP BY le.id`;
        for (const e of counts) {
          for (const statute of statutes) {
            const key = { organizationId: o.id, legalEntityId: e.legalEntityId, statute };
            const old = await tx.establishmentCoverage.findFirst({ where: key });
            const r = coverage(rs, { statute, headcount: e.n, wasCovered: old?.status === 'covered' });
            const crossedOn = r.status === 'covered' ? (old?.crossedOn ?? asDate(today)) : null;
            const data = { headcount: e.n, threshold: r.threshold, status: r.status, crossedOn, ruleVersion: rs.version, evaluatedAt: new Date() };
            if (old) await tx.establishmentCoverage.update({ where: { id: old.id }, data });
            else await tx.establishmentCoverage.create({ data: { ...key, ...data } });
            if ((old?.status ?? 'not_covered') !== r.status) {
              changed++;
              await audit(tx, c, 'payroll.coverage.changed', 'legal_entity', e.legalEntityId, { statute, from: old?.status ?? null, to: r.status, headcount: e.n, threshold: r.threshold });
            }
          }
        }
      });
    }
    return changed;
  }
}

/** A sample payslip with the layout's shown blocks (figures are illustrative and say so). */
function renderSample(entityName: string, blocks: { key: string; shown: boolean }[], labels: Record<string, string>, local: LocalLanguage | null): Promise<Buffer> {
  const sample: Record<string, string> = { employerName: entityName, employeeName: 'Sample Employee', employeeCode: 'EMP-0001', designation: 'Engineer', period: 'Sample month', paidDays: '30', earnings: 'Basic 24,200 · HRA 12,100 · Special 22,600', deductions: 'PF 1,800 · PT 200', grossPay: '60,500', netPay: '58,500' };
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: 'Payslip layout preview' } });
    const out: Buffer[] = [];
    doc.on('data', (b: Buffer) => out.push(b)).on('end', () => resolve(Buffer.concat(out))).on('error', reject);
    doc.fontSize(9).fillColor('#a33').text('PREVIEW — sample figures, not a payslip', { align: 'right' }).fillColor('#000');
    doc.moveDown().fontSize(14).text(entityName).fontSize(11);
    writeLabel(doc, local, 'payslip', 'Payslip', '');
    doc.moveDown();
    for (const b of blocks.filter((x) => x.shown)) {
      doc.fontSize(10);
      writeLabel(doc, local, b.key, labels[b.key] ?? b.key, sample[b.key] ?? '—');
    }
    doc.end();
  });
}

