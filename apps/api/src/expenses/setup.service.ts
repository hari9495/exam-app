import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { readerLanguage, translated } from '../global/global-data';
import { RuleError, parseGroup, type FieldDef, type Group, type RecordValues } from '../rules-engine/conditions';
import type { ScopeUser } from '../access/scope';
import { gstinProblem, pickPolicy, ruleFor } from './checks';
import type { CategoryDto, GstRegistrationDto, MileageRateDto, PerDiemRateDto, PolicyDto, TierDto } from './dto';
import { STARTER_CATEGORIES, STARTER_MEALS_DEDUCTION, STARTER_MILEAGE, STARTER_PER_DIEM, STARTER_POLICY, STARTER_TIERS } from './starters';

// Expenses batch E1 (M05-BUILD-DESIGN §6, §7; XP-1.02 … XP-1.06): categories, city tiers, dated policies with a P19
// "applies to" condition over the employee's job, mileage and per-diem rates, GST registrations per entity and state,
// the YukthiX starters, the set-up check and "my limits". Company configuration: expense.policy.manage, company-wide.
//   history  a policy that is already in force never changes its limits: a new version starts on a later date and the
//            old one ends the day before, so a claim is checked against the version valid on its expense date (§7.1);
//   rates    a new mileage or per-diem rate closes the open-ended one it replaces on the day before.

const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dayBefore = (d: string) => iso(new Date(asDate(d).getTime() - 86_400_000));
const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const money = (x: Prisma.Decimal | null) => (x === null ? null : x.toFixed(2));
const asJson = (g: Group | null) => (g ? (g as unknown as Prisma.InputJsonValue) : Prisma.DbNull);

/** The job facts a policy's "applies to" condition may use (P19 allow-list); option lists come from the company. */
export const APPLIES_FIELDS: readonly FieldDef[] = [
  { key: 'legal_entity_id', label: 'Legal entity', type: 'choice' },
  { key: 'location_id', label: 'Location', type: 'choice' },
  { key: 'department_id', label: 'Department', type: 'choice' },
  { key: 'grade_id', label: 'Grade', type: 'choice' },
  { key: 'designation_id', label: 'Designation', type: 'choice' },
  { key: 'employment_type_id', label: 'Employment type', type: 'choice' },
];

/** The current Indian financial year's first day: starters apply from it, so this year's spend is covered. */
const fyStart = (today: string) => `${Number(today.slice(5, 7)) >= 4 ? today.slice(0, 4) : Number(today.slice(0, 4)) - 1}-04-01`;

@Injectable()
export class ExpenseSetupService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  // ------------------------------------------------------------------------------------------ categories and tiers

  private categoryView(c: Prisma.ExpenseCategoryGetPayload<object>) {
    return { id: c.id, code: c.code, name: c.name, kind: c.kind, receiptAbove: money(c.receiptAbove), gstEligible: c.gstEligible, itcBlockedReason: c.itcBlockedReason, taxable: c.taxable, ledgerCode: c.ledgerCode, active: c.active, starterKey: c.starterKey, version: c.version };
  }

  private tierView(t: Prisma.CityTierGetPayload<object>) {
    return { id: t.id, name: t.name, rank: t.rank, country: t.country, cities: t.cities, active: t.active, starterKey: t.starterKey, version: t.version };
  }

  /** Every category, with the reader's own-language name when the company translated it (G1, §6.4). */
  async categories(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.expenseCategory.findMany({ where: { organizationId: c.organizationId }, orderBy: { name: 'asc' } });
      const words = await translated(tx, c, await readerLanguage(tx, c), 'expense_category', rows.map((x) => x.id));
      return rows.map((x) => ({ ...this.categoryView(x), shownName: words.get(x.id) ?? x.name }));
    });
  }

  async saveCategory(ctx: TenantContext, id: string | null, dto: CategoryDto) {
    if (dto.itcBlockedReason && !dto.gstEligible) throw new BadRequestException('Only a GST-eligible category can have blocked input credit.');
    if (dto.kind !== 'spend' && dto.kind !== 'company_paid_only' && dto.receiptAbove) throw new BadRequestException('Mileage and per diem are worked out, so they take no receipt threshold.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const data = { name: dto.name, kind: dto.kind, receiptAbove: dto.receiptAbove ?? null, gstEligible: dto.gstEligible, itcBlockedReason: dto.itcBlockedReason ?? null, taxable: dto.taxable, ledgerCode: dto.ledgerCode || null, active: dto.active };
      let row;
      if (id) {
        const cur = await tx.expenseCategory.findFirst({ where: { organizationId: org, id } });
        if (!cur) throw new NotFoundException('No such category.');
        if (cur.code !== dto.code) throw new BadRequestException('A category keeps its code; make a new one instead.');
        const n = await tx.expenseCategory.updateMany({ where: { organizationId: org, id, version: dto.version ?? -1 }, data: { ...data, version: { increment: 1 } } });
        if (!n.count) throw new ConflictException('Someone else changed this category. Reload it.');
        row = await tx.expenseCategory.findFirstOrThrow({ where: { organizationId: org, id } });
      } else {
        if (await tx.expenseCategory.findFirst({ where: { organizationId: org, code: dto.code }, select: { id: true } })) throw new ConflictException(`There is already a category with the code ${dto.code}.`);
        row = await tx.expenseCategory.create({ data: { organizationId: org, code: dto.code, createdBy: c.userId ?? null, ...data } });
      }
      await audit(tx, c, id ? 'expense.category.updated' : 'expense.category.created', 'expense_category', row.id, { code: row.code });
      return this.categoryView(row);
    });
  }

  async tiers(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => (await tx.cityTier.findMany({ where: { organizationId: c.organizationId }, orderBy: { rank: 'asc' } })).map((t) => this.tierView(t)));
  }

  async saveTier(ctx: TenantContext, id: string | null, dto: TierDto) {
    const cities = [...new Set(dto.cities.map((x) => x.trim()).filter(Boolean))];
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      // A city sits in one tier only, so a line's tier is never ambiguous.
      const others = await tx.cityTier.findMany({ where: { organizationId: org, active: true, ...(id ? { id: { not: id } } : {}) }, select: { name: true, cities: true } });
      const clash = cities.find((city) => others.some((o) => o.cities.some((x) => x.toLowerCase() === city.toLowerCase())));
      if (clash) throw new BadRequestException(`${clash} is already in ${others.find((o) => o.cities.some((x) => x.toLowerCase() === clash.toLowerCase()))!.name}.`);
      const data = { name: dto.name, rank: dto.rank, country: dto.country ?? null, cities, active: dto.active };
      let row;
      if (id) {
        const n = await tx.cityTier.updateMany({ where: { organizationId: org, id, version: dto.version ?? -1 }, data: { ...data, version: { increment: 1 } } });
        if (!n.count) throw new ConflictException('Someone else changed this tier. Reload it.');
        row = await tx.cityTier.findFirstOrThrow({ where: { organizationId: org, id } });
      } else {
        if (await tx.cityTier.findFirst({ where: { organizationId: org, name: dto.name }, select: { id: true } })) throw new ConflictException(`There is already a tier called ${dto.name}.`);
        row = await tx.cityTier.create({ data: { organizationId: org, ...data } });
      }
      await audit(tx, c, id ? 'expense.tier.updated' : 'expense.tier.created', 'city_tier', row.id, { cities: cities.length });
      return this.tierView(row);
    });
  }

  // ------------------------------------------------------------------------------------------ policies (dated)

  /** The fields a policy's "applies to" may use, with the company's own options. */
  private async fieldsWithOptions(tx: Tx, org: string) {
    const live = { organizationId: org, archivedAt: null };
    const [entities, locations, departments, grades, designations, types] = await Promise.all([
      tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      tx.location.findMany({ where: live, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      tx.department.findMany({ where: live, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      tx.grade.findMany({ where: live, select: { id: true, name: true }, orderBy: { rank: 'asc' } }),
      tx.designation.findMany({ where: live, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      tx.employmentType.findMany({ where: live, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    const lists = [entities, locations, departments, grades, designations, types];
    return APPLIES_FIELDS.map((f, i) => ({ ...f, options: lists[i].map((r) => ({ value: r.id, label: r.name })) }));
  }

  private policyView(p: Prisma.ExpensePolicyGetPayload<object>, rules: Prisma.ExpensePolicyRuleGetPayload<object>[]) {
    return {
      id: p.id,
      name: p.name,
      appliesIf: p.appliesIf,
      priority: p.priority,
      validFrom: iso(p.validFrom),
      validTo: p.validTo ? iso(p.validTo) : null,
      status: p.status,
      starterKey: p.starterKey,
      version: p.version,
      rules: rules.map((r) => ({ categoryCode: r.categoryCode, tierId: r.tierId, perLine: money(r.perLine), perDay: money(r.perDay), perTrip: money(r.perTrip), perMonth: money(r.perMonth), currency: r.currency, overLimit: r.overLimit, needsJustification: r.needsJustification })),
    };
  }

  async policies(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const rows = await tx.expensePolicy.findMany({ where: { organizationId: org }, orderBy: [{ status: 'asc' }, { name: 'asc' }, { validFrom: 'desc' }] });
      const rules = await tx.expensePolicyRule.findMany({ where: { organizationId: org, policyId: { in: rows.map((r) => r.id) } } });
      return { policies: rows.map((p) => this.policyView(p, rules.filter((r) => r.policyId === p.id))), fields: await this.fieldsWithOptions(tx, org), today: todayIst() };
    });
  }

  private parseApplies(input: Record<string, unknown> | null | undefined): Group | null {
    if (!input) return null;
    try {
      const g = parseGroup(input, APPLIES_FIELDS);
      return g.items.length ? g : null;
    } catch (e) {
      throw new BadRequestException(`Applies to: ${e instanceof RuleError ? e.message : 'not a valid condition.'}`);
    }
  }

  /** Rules name active categories and tiers of this company, once per cell; the currency is the company's pay currency. */
  private async checkRules(tx: Tx, org: string, rules: PolicyDto['rules']) {
    const cats = new Set((await tx.expenseCategory.findMany({ where: { organizationId: org }, select: { code: true } })).map((x) => x.code));
    const tiers = new Set((await tx.cityTier.findMany({ where: { organizationId: org }, select: { id: true } })).map((x) => x.id));
    const seen = new Set<string>();
    for (const r of rules) {
      if (!cats.has(r.categoryCode)) throw new BadRequestException(`There is no category ${r.categoryCode}.`);
      if (r.tierId && !tiers.has(r.tierId)) throw new BadRequestException('A rule names a city tier that does not exist.');
      const k = `${r.categoryCode}|${r.tierId ?? '*'}`;
      if (seen.has(k)) throw new BadRequestException(`Two rules for ${r.categoryCode} in the same tier.`);
      seen.add(k);
    }
  }

  private async currencyOf(tx: Tx, org: string) {
    return (await tx.legalEntity.findFirst({ where: { organizationId: org }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], select: { currency: true } }))?.currency ?? 'INR';
  }

  private async writeRules(tx: Tx, org: string, policyId: string, rules: PolicyDto['rules']) {
    const currency = await this.currencyOf(tx, org);
    await tx.expensePolicyRule.deleteMany({ where: { organizationId: org, policyId } });
    if (rules.length)
      await tx.expensePolicyRule.createMany({
        data: rules.map((r) => ({ organizationId: org, policyId, categoryCode: r.categoryCode, tierId: r.tierId ?? null, perLine: r.perLine ?? null, perDay: r.perDay ?? null, perTrip: r.perTrip ?? null, perMonth: r.perMonth ?? null, currency, overLimit: r.overLimit, needsJustification: Boolean(r.needsJustification) })),
      });
  }

  async savePolicy(ctx: TenantContext, id: string | null, dto: PolicyDto) {
    const appliesIf = this.parseApplies(dto.appliesIf);
    if (dto.validTo && dto.validTo < dto.validFrom) throw new BadRequestException('The end date is before the start date.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const today = todayIst();
      await this.checkRules(tx, org, dto.rules);
      let p;
      if (id) {
        const cur = await tx.expensePolicy.findFirst({ where: { organizationId: org, id } });
        if (!cur) throw new NotFoundException('No such policy.');
        const inForce = iso(cur.validFrom) <= today;
        // History stays true (§7.1): once in force, only the name, end date and status change; limits need a new version.
        if (inForce) {
          const rules = await tx.expensePolicyRule.findMany({ where: { organizationId: org, policyId: id } });
          const same = (a: PolicyDto['rules'][number], b: (typeof rules)[number]) => a.categoryCode === b.categoryCode && (a.tierId ?? null) === b.tierId && (a.perLine ?? null) === money(b.perLine) && (a.perDay ?? null) === money(b.perDay) && (a.perTrip ?? null) === money(b.perTrip) && (a.perMonth ?? null) === money(b.perMonth) && a.overLimit === b.overLimit && Boolean(a.needsJustification) === b.needsJustification;
          const norm = dto.rules.map((r) => ({ ...r, perLine: r.perLine ? D(r.perLine).toFixed(2) : null, perDay: r.perDay ? D(r.perDay).toFixed(2) : null, perTrip: r.perTrip ? D(r.perTrip).toFixed(2) : null, perMonth: r.perMonth ? D(r.perMonth).toFixed(2) : null }));
          const changed = iso(cur.validFrom) !== dto.validFrom || JSON.stringify(cur.appliesIf ?? null) !== JSON.stringify(appliesIf) || cur.priority !== dto.priority || norm.length !== rules.length || !norm.every((r) => rules.some((x) => same(r, x)));
          if (changed) throw new ConflictException('This policy is already in use. Save the new limits as a new version from a date instead.');
        }
        const n = await tx.expensePolicy.updateMany({ where: { organizationId: org, id, version: dto.version ?? -1 }, data: { name: dto.name, appliesIf: asJson(appliesIf), priority: dto.priority, validFrom: asDate(dto.validFrom), validTo: dto.validTo ? asDate(dto.validTo) : null, status: dto.status, version: { increment: 1 } } });
        if (!n.count) throw new ConflictException('Someone else changed this policy. Reload it.');
        if (!inForce) await this.writeRules(tx, org, id, dto.rules);
        p = await tx.expensePolicy.findFirstOrThrow({ where: { organizationId: org, id } });
      } else {
        p = await tx.expensePolicy.create({ data: { organizationId: org, name: dto.name, appliesIf: asJson(appliesIf), priority: dto.priority, validFrom: asDate(dto.validFrom), validTo: dto.validTo ? asDate(dto.validTo) : null, status: dto.status, createdBy: c.userId ?? null } });
        await this.writeRules(tx, org, p.id, dto.rules);
      }
      await audit(tx, c, id ? 'expense.policy.updated' : 'expense.policy.created', 'expense_policy', p.id, { rules: dto.rules.length, validFrom: dto.validFrom });
      return this.policyView(p, await tx.expensePolicyRule.findMany({ where: { organizationId: org, policyId: p.id } }));
    });
  }

  /** New limits from a date: the current version ends the day before, the new one carries the same name and condition. */
  async newVersion(ctx: TenantContext, id: string, dto: PolicyDto & { version: number }) {
    const appliesIf = this.parseApplies(dto.appliesIf);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const cur = await tx.expensePolicy.findFirst({ where: { organizationId: org, id } });
      if (!cur) throw new NotFoundException('No such policy.');
      if (dto.validFrom <= iso(cur.validFrom)) throw new BadRequestException(`The new version must start after ${iso(cur.validFrom)}, when this one started.`);
      if (cur.validTo && dto.validFrom > iso(cur.validTo)) throw new BadRequestException('This version has already ended; start a new policy instead.');
      await this.checkRules(tx, org, dto.rules);
      const n = await tx.expensePolicy.updateMany({ where: { organizationId: org, id, version: dto.version }, data: { validTo: asDate(dayBefore(dto.validFrom)), version: { increment: 1 } } });
      if (!n.count) throw new ConflictException('Someone else changed this policy. Reload it.');
      const p = await tx.expensePolicy.create({ data: { organizationId: org, name: dto.name, appliesIf: asJson(appliesIf), priority: dto.priority, validFrom: asDate(dto.validFrom), validTo: cur.validTo, status: 'active', starterKey: cur.starterKey, createdBy: c.userId ?? null } });
      await this.writeRules(tx, org, p.id, dto.rules);
      await audit(tx, c, 'expense.policy.versioned', 'expense_policy', p.id, { previous: id, validFrom: dto.validFrom });
      return this.policyView(p, await tx.expensePolicyRule.findMany({ where: { organizationId: org, policyId: p.id } }));
    });
  }

  // ------------------------------------------------------------------------------------------ rates

  async rates(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const mileage = await tx.mileageRate.findMany({ where: { organizationId: org }, orderBy: [{ vehicle: 'asc' }, { validFrom: 'desc' }] });
      const perDiem = await tx.perDiemRate.findMany({ where: { organizationId: org }, orderBy: [{ validFrom: 'desc' }] });
      return {
        mileage: mileage.map((m) => ({ id: m.id, vehicle: m.vehicle, ratePerKm: m.ratePerKm.toFixed(2), currency: m.currency, monthlyKmCap: m.monthlyKmCap, validFrom: iso(m.validFrom), validTo: m.validTo ? iso(m.validTo) : null })),
        perDiem: perDiem.map((p) => ({ id: p.id, tierId: p.tierId, country: p.country, ratePerDay: p.ratePerDay.toFixed(2), currency: p.currency, partialDayRule: p.partialDayRule, mealsDeduction: p.mealsDeduction, validFrom: iso(p.validFrom), validTo: p.validTo ? iso(p.validTo) : null })),
      };
    });
  }

  /** A new rate from a date; the open-ended rate it replaces ends the day before. A rate already starting later is refused. */
  async addMileageRate(ctx: TenantContext, dto: MileageRateDto) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const later = await tx.mileageRate.findFirst({ where: { organizationId: org, vehicle: dto.vehicle, validFrom: { gte: asDate(dto.validFrom) } } });
      if (later) throw new ConflictException(`There is already a ${dto.vehicle.replace('_', ' ')} rate from ${iso(later.validFrom)}.`);
      await tx.mileageRate.updateMany({ where: { organizationId: org, vehicle: dto.vehicle, validTo: null }, data: { validTo: asDate(dayBefore(dto.validFrom)) } });
      const r = await tx.mileageRate.create({ data: { organizationId: org, vehicle: dto.vehicle, ratePerKm: dto.ratePerKm, currency: await this.currencyOf(tx, org), monthlyKmCap: dto.monthlyKmCap ?? null, validFrom: asDate(dto.validFrom), createdBy: c.userId ?? null } });
      await audit(tx, c, 'expense.rate.mileage', 'mileage_rate', r.id, { vehicle: dto.vehicle, validFrom: dto.validFrom });
      return { id: r.id };
    });
  }

  async addPerDiemRate(ctx: TenantContext, dto: PerDiemRateDto) {
    if (Boolean(dto.tierId) === Boolean(dto.country)) throw new BadRequestException('A per-diem rate is for a city tier or for a country.');
    const meals = dto.mealsDeduction ?? STARTER_MEALS_DEDUCTION;
    if (!Object.entries(meals).every(([k, v]) => ['breakfast', 'lunch', 'dinner'].includes(k) && typeof v === 'number' && v >= 0 && v <= 1)) throw new BadRequestException('Meal deductions are shares of the day rate between 0 and 1.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const place = dto.tierId ? { tierId: dto.tierId } : { country: dto.country! };
      if (dto.tierId && !(await tx.cityTier.findFirst({ where: { organizationId: org, id: dto.tierId }, select: { id: true } }))) throw new BadRequestException('Choose a city tier of this company.');
      const later = await tx.perDiemRate.findFirst({ where: { organizationId: org, ...place, validFrom: { gte: asDate(dto.validFrom) } } });
      if (later) throw new ConflictException(`There is already a rate for that place from ${iso(later.validFrom)}.`);
      await tx.perDiemRate.updateMany({ where: { organizationId: org, ...place, validTo: null }, data: { validTo: asDate(dayBefore(dto.validFrom)) } });
      const r = await tx.perDiemRate.create({ data: { organizationId: org, ...place, ratePerDay: dto.ratePerDay, currency: dto.currency, partialDayRule: dto.partialDayRule, mealsDeduction: meals, validFrom: asDate(dto.validFrom), createdBy: c.userId ?? null } });
      await audit(tx, c, 'expense.rate.per_diem', 'per_diem_rate', r.id, { ...place, validFrom: dto.validFrom });
      return { id: r.id };
    });
  }

  // ------------------------------------------------------------------------------------------ GST registrations (§13.2)

  async gstRegistrations(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) =>
      (await tx.entityGstRegistration.findMany({ where: { organizationId: c.organizationId }, orderBy: [{ legalEntityId: 'asc' }, { state: 'asc' }, { validFrom: 'desc' }] })).map((g) => ({ id: g.id, legalEntityId: g.legalEntityId, state: g.state, gstin: g.gstin, validFrom: iso(g.validFrom), validTo: g.validTo ? iso(g.validTo) : null })),
    );
  }

  async addGstRegistration(ctx: TenantContext, dto: GstRegistrationDto) {
    const gstin = dto.gstin.trim().toUpperCase();
    const problem = gstinProblem(gstin);
    if (problem) throw new BadRequestException(problem);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const e = await tx.legalEntity.findFirst({ where: { organizationId: org, id: dto.legalEntityId }, select: { id: true, country: true, pan: true } });
      if (!e) throw new BadRequestException('Choose a legal entity of this company.');
      if (e.country !== 'IN') throw new BadRequestException('GST registrations are for Indian legal entities.');
      // The GSTIN carries the registered person's PAN (characters 3–12).
      if (e.pan && e.pan.toUpperCase() !== gstin.slice(2, 12)) throw new BadRequestException("This GSTIN belongs to a different PAN from the legal entity's.");
      if (await tx.entityGstRegistration.findFirst({ where: { organizationId: org, gstin }, select: { id: true } })) throw new ConflictException('This GSTIN is already recorded.');
      const open = await tx.entityGstRegistration.findFirst({ where: { organizationId: org, legalEntityId: e.id, state: gstin.slice(0, 2), validTo: null } });
      if (open) throw new ConflictException(`The entity already has an open registration in state ${gstin.slice(0, 2)} (${open.gstin}). End it first.`);
      const g = await tx.entityGstRegistration.create({ data: { organizationId: org, legalEntityId: e.id, state: gstin.slice(0, 2), gstin, validFrom: asDate(dto.validFrom), createdBy: c.userId ?? null } });
      await audit(tx, c, 'expense.gst_registration.added', 'entity_gst_registration', g.id, { state: g.state });
      return { id: g.id, state: g.state, gstin };
    });
  }

  async endGstRegistration(ctx: TenantContext, id: string, validTo: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const g = await tx.entityGstRegistration.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!g) throw new NotFoundException('No such registration.');
      if (validTo < iso(g.validFrom)) throw new BadRequestException('The end date is before the registration started.');
      await tx.entityGstRegistration.update({ where: { id }, data: { validTo: asDate(validTo) } });
      await audit(tx, c, 'expense.gst_registration.ended', 'entity_gst_registration', id, { validTo });
      return { ok: true };
    });
  }

  // ------------------------------------------------------------------------------------------ YukthiX starters (§6.2)

  /** Copies the starters the company does not have yet (by starter key); running it again copies nothing twice. */
  async fromStarter(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const from = fyStart(todayIst());
      const currency = await this.currencyOf(tx, org);
      const made = { categories: 0, tiers: 0, policies: 0, rates: 0 };
      const haveCats = await tx.expenseCategory.findMany({ where: { organizationId: org }, select: { code: true, starterKey: true } });
      for (const s of STARTER_CATEGORIES) {
        if (haveCats.some((h) => h.starterKey === s.key || h.code === s.code)) continue;
        await tx.expenseCategory.create({ data: { organizationId: org, code: s.code, name: s.name, kind: s.kind, receiptAbove: s.receiptAbove, gstEligible: s.gstEligible, itcBlockedReason: s.itcBlockedReason, taxable: s.taxable, starterKey: s.key, createdBy: c.userId ?? null } });
        made.categories++;
      }
      const haveTiers = await tx.cityTier.findMany({ where: { organizationId: org }, select: { id: true, name: true, starterKey: true, cities: true } });
      const taken = new Set(haveTiers.flatMap((t) => t.cities.map((x) => x.toLowerCase())));
      const tierId = new Map(haveTiers.filter((t) => t.starterKey).map((t) => [t.starterKey!, t.id]));
      for (const s of STARTER_TIERS) {
        if (tierId.has(s.key) || haveTiers.some((h) => h.name === s.name)) continue;
        const t = await tx.cityTier.create({ data: { organizationId: org, name: s.name, rank: s.rank, country: s.country, cities: s.cities.filter((x) => !taken.has(x.toLowerCase())), starterKey: s.key } });
        tierId.set(s.key, t.id);
        made.tiers++;
      }
      const codes = new Set((await tx.expenseCategory.findMany({ where: { organizationId: org }, select: { code: true } })).map((x) => x.code));
      if (!(await tx.expensePolicy.findFirst({ where: { organizationId: org, starterKey: STARTER_POLICY.key }, select: { id: true } }))) {
        const p = await tx.expensePolicy.create({ data: { organizationId: org, name: STARTER_POLICY.name, priority: 1000, validFrom: asDate(from), starterKey: STARTER_POLICY.key, createdBy: c.userId ?? null } });
        const rows: Prisma.ExpensePolicyRuleCreateManyInput[] = [];
        for (const [code, cells] of Object.entries(STARTER_POLICY.cells)) {
          if (!codes.has(code)) continue;
          for (const [tier, cell] of Object.entries(cells)) {
            const tid = tier === '*' ? null : (tierId.get(tier) ?? undefined);
            if (tid === undefined) continue;
            rows.push({ organizationId: org, policyId: p.id, categoryCode: code, tierId: tid, perLine: cell.perLine ?? null, perDay: cell.perDay ?? null, perMonth: cell.perMonth ?? null, currency, overLimit: cell.block ? 'block' : 'justify_and_approve' });
          }
        }
        await tx.expensePolicyRule.createMany({ data: rows });
        made.policies++;
      }
      for (const m of STARTER_MILEAGE) {
        if (await tx.mileageRate.findFirst({ where: { organizationId: org, vehicle: m.vehicle }, select: { id: true } })) continue;
        await tx.mileageRate.create({ data: { organizationId: org, vehicle: m.vehicle, ratePerKm: m.ratePerKm, currency, validFrom: asDate(from), createdBy: c.userId ?? null } });
        made.rates++;
      }
      for (const d of STARTER_PER_DIEM) {
        const tid = tierId.get(d.tier);
        if (!tid || (await tx.perDiemRate.findFirst({ where: { organizationId: org, tierId: tid }, select: { id: true } }))) continue;
        await tx.perDiemRate.create({ data: { organizationId: org, tierId: tid, ratePerDay: d.ratePerDay, currency, partialDayRule: 'half_after_hours', mealsDeduction: STARTER_MEALS_DEDUCTION, validFrom: asDate(from), createdBy: c.userId ?? null } });
        made.rates++;
      }
      await audit(tx, c, 'expense.starters.copied', 'organization', org, made);
      return made;
    });
  }

  // ------------------------------------------------------------------------------------------ set-up check (§6.3, U59)

  async setupCheck(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const today = todayIst();
      const problems: { key: string; text: string; count?: number }[] = [];
      const cats = await tx.expenseCategory.findMany({ where: { organizationId: org, active: true } });
      if (!cats.length) problems.push({ key: 'no_categories', text: 'There are no expense categories yet. Start from the YukthiX starters.' });
      const unmapped = cats.filter((x) => !x.ledgerCode && x.kind !== 'company_paid_only');
      if (unmapped.length) problems.push({ key: 'no_ledger_code', text: `${unmapped.length} categories have no ledger code, so their journal lines cannot be posted.`, count: unmapped.length });
      const policies = (await tx.expensePolicy.findMany({ where: { organizationId: org, status: 'active' } })).map((p) => ({ id: p.id, appliesIf: (p.appliesIf as Group | null) ?? null, priority: p.priority, validFrom: iso(p.validFrom), validTo: p.validTo ? iso(p.validTo) : null, status: p.status }));
      const live = policies.filter((p) => p.validFrom <= today && (!p.validTo || p.validTo >= today));
      if (!live.length) problems.push({ key: 'no_policy', text: 'No expense policy is in force today, so nobody can claim.' });
      else {
        const records = await this.recordsOf(tx, org, today, null);
        const without = records.filter((r) => !pickPolicy(live, r.record, APPLIES_FIELDS, today)).length;
        if (without) problems.push({ key: 'people_without_policy', text: `${without} people have no expense policy that applies to them.`, count: without });
        const ruleCount = await tx.expensePolicyRule.groupBy({ by: ['policyId'], where: { organizationId: org, policyId: { in: live.map((p) => p.id) } }, _count: true });
        const empty = live.filter((p) => !ruleCount.some((r) => r.policyId === p.id)).length;
        if (empty) problems.push({ key: 'empty_policy', text: `${empty} policies in force allow no category at all.`, count: empty });
      }
      const on = asDate(today);
      const inForce = { validFrom: { lte: on }, OR: [{ validTo: null }, { validTo: { gte: on } }] };
      if (cats.some((x) => x.kind === 'mileage') && !(await tx.mileageRate.count({ where: { organizationId: org, ...inForce } }))) problems.push({ key: 'no_mileage_rate', text: 'Mileage is a category but there is no mileage rate in force.' });
      if (cats.some((x) => x.kind === 'per_diem') && !(await tx.perDiemRate.count({ where: { organizationId: org, ...inForce } }))) problems.push({ key: 'no_per_diem_rate', text: 'Per diem is a category but there is no per-diem rate in force.' });
      const entities = await tx.legalEntity.findMany({ where: { organizationId: org, country: 'IN' }, select: { id: true, name: true } });
      for (const e of entities) {
        if ((await settingFor(tx, c, 'expense.gst.capture', { legalEntityId: e.id })) !== 'on') continue;
        if (!(await tx.entityGstRegistration.count({ where: { organizationId: org, legalEntityId: e.id, ...inForce } }))) problems.push({ key: 'no_gst_registration', text: `GST capture is on for ${e.name}, but it has no GST registration recorded.` });
      }
      return { ready: problems.length === 0, problems };
    });
  }

  /** Each current employee's job facts on a day, as the "applies to" condition reads them. */
  private async recordsOf(tx: Tx, org: string, on: string, employeeId: string | null): Promise<{ employeeId: string; record: RecordValues }[]> {
    const day = asDate(on);
    const rows = await tx.employeeAssignment.findMany({
      where: { organizationId: org, supersededAt: null, validFrom: { lte: day }, OR: [{ validTo: null }, { validTo: { gte: day } }], ...(employeeId ? { employeeId } : {}) },
      select: { employeeId: true, legalEntityId: true, locationId: true, departmentId: true, gradeId: true, designationId: true, employmentTypeId: true },
      take: 20_000, // ponytail: one read of every current assignment; page it when a company passes 20k people.
    });
    return rows.map((r) => ({ employeeId: r.employeeId, record: { legal_entity_id: r.legalEntityId, location_id: r.locationId, department_id: r.departmentId, grade_id: r.gradeId, designation_id: r.designationId, employment_type_id: r.employmentTypeId } }));
  }

  // ------------------------------------------------------------------------------------------ my limits (EXP-02 preview)

  async myLimits(ctx: TenantContext, user: ScopeUser, on = todayIst()) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const e = user.userId ? await tx.employee.findFirst({ where: { organizationId: org, userId: user.userId }, select: { id: true } }) : null;
      if (!e) return { on, policy: null, categories: [] };
      const [rec] = await this.recordsOf(tx, org, on, e.id);
      if (!rec) return { on, policy: null, categories: [] };
      const policies = (await tx.expensePolicy.findMany({ where: { organizationId: org, status: 'active' } })).map((p) => ({ ...p, appliesIf: (p.appliesIf as Group | null) ?? null, validFrom: iso(p.validFrom), validTo: p.validTo ? iso(p.validTo) : null }));
      const p = pickPolicy(policies, rec.record, APPLIES_FIELDS, on);
      if (!p) return { on, policy: null, categories: [] };
      const rules = (await tx.expensePolicyRule.findMany({ where: { organizationId: org, policyId: p.id } })).map((r) => ({ ...r, perLine: money(r.perLine), perDay: money(r.perDay), perTrip: money(r.perTrip), perMonth: money(r.perMonth), overLimit: r.overLimit as 'justify_and_approve' | 'block' }));
      const cats = await tx.expenseCategory.findMany({ where: { organizationId: org, active: true }, orderBy: { name: 'asc' } });
      const tiers = await tx.cityTier.findMany({ where: { organizationId: org, active: true }, orderBy: { rank: 'asc' } });
      const lang = await readerLanguage(tx, c);
      const catWords = await translated(tx, c, lang, 'expense_category', cats.map((x) => x.id));
      const tierWords = await translated(tx, c, lang, 'city_tier', tiers.map((t) => t.id));
      return {
        on,
        policy: { id: p.id, name: p.name },
        categories: cats
          .filter((x) => rules.some((r) => r.categoryCode === x.code))
          .map((x) => ({
            code: x.code,
            name: catWords.get(x.id) ?? x.name,
            kind: x.kind,
            receiptAbove: money(x.receiptAbove),
            tiers: tiers.map((t) => {
              const r = ruleFor(rules, x.code, t.id);
              return { tierId: t.id, tier: tierWords.get(t.id) ?? t.name, allowed: Boolean(r), perLine: r?.perLine ?? null, perDay: r?.perDay ?? null, perTrip: r?.perTrip ?? null, perMonth: r?.perMonth ?? null, overLimit: r?.overLimit ?? null, currency: r?.currency ?? null };
            }),
          })),
      };
    });
  }
}

