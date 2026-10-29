import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { stringify } from 'csv-stringify/sync';
import { createHash } from 'crypto';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import type { ScopeUser, Viewer } from '../access/scope';
import { StatutoryRulesService } from '../statutory/statutory.service';
import { NotificationsService } from '../notifications/notifications.service';
import { inForce, minWage, minWageTableFor } from '../statutory/evaluator';
import { asDate, dateOf, monthRange } from '../time/time-core';
import { entitiesFor, payHolders, payScope, payViewer, requireSelf } from './pay-access';
import { accountingYear, allocableSurplus, carriesInto, carryTotal, employeeBonus, rateProblem, settleYear, supportedRate, yearMonths, yearOf, type BonusRules, type Carry, type EarlierYear } from './bonus';
import type { BonusCreateDto, BonusPatchDto, BonusReturnDto, BonusRowDto, BonusSendDto } from './dto-bonus';

// PAY-24 statutory bonus (Payment of Bonus Act; founder decision 9). The maths is in bonus.ts; here:
//   compute   one computation per legal entity and accounting year, only after the year has ended, from the approved
//             payslips (bonusWage components; imported history for months with no payslip), the payroll feed's paid
//             and lay-off days, and the minimum wage at each person's place of work. Rebuilt on every change while a draft.
//   review    the maker enters the available surplus (and opening set-on / set-off on the entity's first one), may pay
//             above the rate the surplus supports, and records puja bonus paid, misconduct loss or a s.9 dismissal per row.
//   approve   by someone holding payroll.bonus.approve who did not make, change or submit it (the table checks it too).
//   send      one-time "bonus" pay per person into a draft off-cycle bonus run (the run's own approval still applies).
// Keys: payroll.bonus.manage (compute, change, submit, send), payroll.bonus.approve (approve, send back); both scoped to
// legal entities, and the database pay guard is the second layer. Every step is audited.

const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const ZERO = D(0);
type Comp = Prisma.BonusComputationGetPayload<object>;
export interface CarryJson {
  setOnIn: Carry[];
  setOffIn: Carry[];
  setOnUsed: Carry[];
  setOffSettled: Carry[];
}
const NO_CARRY: CarryJson = { setOnIn: [], setOffIn: [], setOnUsed: [], setOffSettled: [] };
const EDITABLE_RUN = ['draft', 'calculated', 'in_review', 'reopened'];
/** One decision at a time on a computation. */
const lock = (tx: Tx, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
/** "3 Nov 2026" (the house date format). */
const dateText = (iso: string) => asDate(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const prevYear = (start: string) => `${Number(start.slice(0, 4)) - 1}${start.slice(4)}`;

const SETTING_KEYS = {
  yearStartMonth: 'payroll.bonus.year_start_month',
  eligibilityWage: 'payroll.bonus.eligibility_wage',
  calculationCeiling: 'payroll.bonus.calculation_ceiling',
  minRate: 'payroll.bonus.min_rate',
  maxRate: 'payroll.bonus.max_rate',
  minWorkingDays: 'payroll.bonus.min_working_days',
  minAmount: 'payroll.bonus.min_amount',
  allocablePercent: 'payroll.bonus.allocable_percent',
  carryYears: 'payroll.bonus.carry_years',
  dueMonths: 'payroll.bonus.due_months',
} as const;
const MAKER_ACTIONS = ['payroll.bonus.computed', 'payroll.bonus.changed', 'payroll.bonus.row_changed', 'payroll.bonus.submitted'];
const NUMERIC: (keyof BonusRules)[] = ['yearStartMonth', 'minWorkingDays', 'carryYears', 'dueMonths'];

@Injectable()
export class BonusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly statutory: StatutoryRulesService,
    private readonly notifications: NotificationsService,
  ) {}

  private async viewer(user: ScopeUser) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return v;
  }

  /** The entities each key reaches; the pay guard is opened to all of them. */
  private async scope(tx: Tx, c: CompanyContext, v: Viewer) {
    const manage = await entitiesFor(tx, c, v, 'payroll.bonus.manage');
    const approve = await entitiesFor(tx, c, v, 'payroll.bonus.approve');
    await payScope(tx, [...new Set([...manage, ...approve])]);
    return { manage, approve };
  }

  /** The company's bonus settings for a legal entity (the Act's values unless HR changed them). */
  async rulesFor(tx: Tx, c: CompanyContext, legalEntityId: string): Promise<BonusRules> {
    const out: Record<string, string | number> = {};
    for (const [k, key] of Object.entries(SETTING_KEYS)) {
      const value = await settingFor(tx, c, key, { legalEntityId });
      out[k] = NUMERIC.includes(k as keyof BonusRules) ? Number(value) : value;
    }
    return out as unknown as BonusRules;
  }

  /** A computation in one of `entities`, else "not found" (never revealing another entity's). */
  private async compIn(tx: Tx, c: CompanyContext, id: string, entities: string[]) {
    const comp = await tx.bonusComputation.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!comp || !entities.includes(comp.legalEntityId)) throw new NotFoundException('Not found');
    return comp;
  }

  private async locked(tx: Tx, c: CompanyContext, id: string, entities: string[], version: number) {
    await lock(tx, `bonus:${id}`);
    const comp = await this.compIn(tx, c, id, entities);
    if (comp.version !== version) throw new ConflictException('Someone else changed this bonus a moment ago. Reload it to see their change, then try again.');
    return comp;
  }

  /** Everyone who worked it out, changed it or submitted it (from the audit trail): none of them approves it. */
  private async makers(tx: Tx, c: CompanyContext, comp: Comp): Promise<string[]> {
    const rows = await tx.auditLog.findMany({ where: { organizationId: c.organizationId, entityType: 'bonus_computation', entityId: comp.id, action: { in: MAKER_ACTIONS } }, select: { actorUserId: true } });
    return [...new Set([comp.createdBy, comp.updatedBy, ...(comp.submittedBy ? [comp.submittedBy] : []), ...rows.map((r) => r.actorUserId).filter((x): x is string => !!x)])];
  }

  private draftOnly(comp: Comp) {
    if (comp.status === 'submitted') throw new ConflictException('This bonus is waiting for approval. Ask the approver to send it back before changing it.');
    if (comp.status !== 'draft') throw new ConflictException(`This bonus is already ${comp.status === 'sent' ? 'sent to an off-cycle run' : 'approved'} and can no longer change.`);
  }

  // ------------------------------------------------------------------------------------------ read

  /** The legal entities whose bonus this person works out or approves (the page's picker). */
  async entities(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.scope(tx, c, v);
      const rows = await tx.legalEntity.findMany({ where: { organizationId: c.organizationId, id: { in: [...s.manage, ...s.approve] }, archivedAt: null }, select: { id: true, name: true, shortName: true }, orderBy: { name: 'asc' } });
      return rows.map((e) => ({ ...e, keys: [...(s.manage.includes(e.id) ? ['payroll.bonus.manage'] : []), ...(s.approve.includes(e.id) ? ['payroll.bonus.approve'] : [])] }));
    });
  }

  async overview(ctx: TenantContext, user: ScopeUser, legalEntityId: string, yearStart?: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.scope(tx, c, v);
      if (![...s.manage, ...s.approve].includes(legalEntityId)) throw new NotFoundException('Not found');
      const rules = await this.rulesFor(tx, c, legalEntityId);
      const today = todayIst();
      const now = Number(yearOf(today, rules).start.slice(0, 4));
      const years = Array.from({ length: 5 }, (_, i) => accountingYear(now - i, rules)).map((y) => ({ ...y, ended: y.end < today }));
      const year = yearStart ? years.find((y) => y.start === yearStart) : (years.find((y) => y.ended) ?? years[0]);
      if (!year) throw new BadRequestException(`Choose one of the last five accounting years (they start on ${years.map((y) => y.start).join(', ')}).`);
      const comp = await tx.bonusComputation.findFirst({ where: { organizationId: c.organizationId, legalEntityId, yearStart: asDate(year.start) } });
      return { years, year, rules, can: { manage: s.manage.includes(legalEntityId), approve: s.approve.includes(legalEntityId) }, computation: comp ? await this.view(tx, c, comp, v) : null };
    });
  }

  async get(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.scope(tx, c, v);
      return this.view(tx, c, await this.compIn(tx, c, id, [...s.manage, ...s.approve]), v);
    });
  }

  private async view(tx: Tx, c: CompanyContext, comp: Comp, v: Viewer) {
    const org = c.organizationId;
    const rows = await tx.$queryRaw<{ employmentId: string; employeeId: string; employeeCode: string; name: string }[]>`
      SELECT r.employment_id::text AS "employmentId", r.employee_id::text AS "employeeId", em.employee_code AS "employeeCode",
             concat_ws(' ', coalesce(e.preferred_name, e.given_name), e.family_name) AS name
      FROM bonus_computation_rows r JOIN employments em ON em.organization_id = r.organization_id AND em.id = r.employment_id
      JOIN employees e ON e.organization_id = r.organization_id AND e.id = r.employee_id
      WHERE r.organization_id = ${org}::uuid AND r.computation_id = ${comp.id}::uuid`;
    const who = new Map(rows.map((r) => [r.employmentId, r]));
    const data = await tx.bonusComputationRow.findMany({ where: { organizationId: org, computationId: comp.id } });
    const userIds = [comp.createdBy, comp.updatedBy, comp.submittedBy, comp.approvedBy, comp.sentBy].filter((x): x is string => !!x);
    const users = new Map((await tx.user.findMany({ where: { organizationId: org, id: { in: userIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    const run = comp.runId ? await tx.payrollRun.findFirst({ where: { organizationId: org, id: comp.runId }, select: { id: true, status: true, periodStart: true } }) : null;
    const earlier = await tx.bonusComputation.count({ where: { organizationId: org, legalEntityId: comp.legalEntityId, yearStart: { lt: comp.yearStart }, status: { in: ['approved', 'sent'] } } });
    const makers = await this.makers(tx, c, comp);
    const carry = comp.carry as unknown as CarryJson;
    const start = dateOf(comp.yearStart);
    const year = accountingYear(Number(start.slice(0, 4)), comp.rules as unknown as BonusRules);
    const m = (x: Prisma.Decimal | null) => (x === null ? null : x.toFixed(2));
    return {
      id: comp.id,
      legalEntityId: comp.legalEntityId,
      year: { start, end: dateOf(comp.yearEnd), label: year.label, dueOn: dateOf(comp.dueOn) },
      status: comp.status,
      version: comp.version,
      overdue: comp.status !== 'sent' && todayIst() > dateOf(comp.dueOn),
      rules: comp.rules,
      availableSurplus: m(comp.availableSurplus),
      allocableSurplus: m(comp.allocableSurplus),
      openingSetOn: m(comp.openingSetOn),
      openingSetOff: m(comp.openingSetOff),
      firstYear: earlier === 0,
      setOnIn: carryTotal(carry.setOnIn).toFixed(2),
      setOffIn: carryTotal(carry.setOffIn).toFixed(2),
      setOnUsed: carryTotal(carry.setOnUsed).toFixed(2),
      setOffSettled: carryTotal(carry.setOffSettled).toFixed(2),
      carry,
      setOnMade: m(comp.setOnMade),
      setOffMade: m(comp.setOffMade),
      supportedRate: m(comp.supportedRate),
      chosenRate: m(comp.chosenRate),
      rate: m(comp.rate),
      totals: { people: comp.people, eligible: comp.eligible, salary: m(comp.salaryTotal), bonus: m(comp.bonusTotal), deductions: m(comp.deductionTotal), payable: m(comp.payableTotal) },
      computedAt: comp.computedAt,
      createdBy: { id: comp.createdBy, name: users.get(comp.createdBy) ?? null },
      submitted: comp.submittedBy ? { by: users.get(comp.submittedBy) ?? null, at: comp.submittedAt } : null,
      approved: comp.approvedBy ? { by: users.get(comp.approvedBy) ?? null, at: comp.approvedAt } : null,
      sent: comp.sentBy ? { by: users.get(comp.sentBy) ?? null, at: comp.sentAt, runId: comp.runId, runStatus: run?.status ?? null, runMonth: run ? dateOf(run.periodStart).slice(0, 7) : null } : null,
      returnedReason: comp.returnedReason,
      madeByMe: !!v.userId && makers.includes(v.userId),
      rows: data
        .map((r) => ({
          employmentId: r.employmentId,
          employeeId: r.employeeId,
          employeeCode: who.get(r.employmentId)?.employeeCode ?? '',
          name: who.get(r.employmentId)?.name ?? '',
          months: r.months as { month: string; wage: string }[],
          wageTotal: (r.months as { wage: string }[]).reduce((t, x) => t.add(x.wage), ZERO).toFixed(2),
          workingDays: r.workingDays.toString(),
          minimumWage: r.minimumWage.toFixed(2),
          ceiling: r.ceiling.toFixed(2),
          eligibleMonths: r.eligibleMonths,
          eligible: r.eligible,
          reason: r.reason,
          bonusSalary: r.bonusSalary.toFixed(2),
          bonus: r.bonus.toFixed(2),
          pujaPaid: r.pujaPaid.toFixed(2),
          misconductLoss: r.misconductLoss.toFixed(2),
          disqualified: r.disqualified,
          adjustReason: r.adjustReason,
          deductions: r.deductions.toFixed(2),
          payable: r.payable.toFixed(2),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  // ------------------------------------------------------------------------------------------ compute

  async create(ctx: TenantContext, user: ScopeUser, dto: BonusCreateDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const s = await this.scope(tx, c, v);
      if (!s.manage.includes(dto.legalEntityId)) throw new NotFoundException('Not found');
      const entity = await tx.legalEntity.findFirstOrThrow({ where: { organizationId: org, id: dto.legalEntityId }, select: { country: true } });
      if (entity.country !== 'IN') throw new ConflictException('The Payment of Bonus Act applies to legal entities in India only.');
      const rules = await this.rulesFor(tx, c, dto.legalEntityId);
      const year = yearOf(dto.yearStart, rules);
      if (year.start !== dto.yearStart) throw new BadRequestException(`This legal entity's accounting year starts in month ${rules.yearStartMonth}; choose a year that starts on ${year.start}.`);
      if (year.end >= todayIst()) throw new ConflictException(`The ${year.label} accounting year ends on ${year.end}. Work out its bonus after that day.`);
      const monthly = await tx.entityStatutoryOption.findFirst({ where: { organizationId: org, legalEntityId: dto.legalEntityId, optionKey: 'bonus.payment', validFrom: { lte: asDate(year.end) }, OR: [{ validTo: null }, { validTo: { gte: asDate(year.end) } }] } });
      if (monthly?.value === 'monthly') throw new ConflictException('This legal entity pays the statutory bonus every month with salary, so there is no yearly bonus to work out.');
      await lock(tx, `bonus:${org}:${dto.legalEntityId}:${year.start}`);
      if (await tx.bonusComputation.findFirst({ where: { organizationId: org, legalEntityId: dto.legalEntityId, yearStart: asDate(year.start) } })) throw new ConflictException(`The bonus for ${year.label} is already worked out. Open it instead.`);
      const now = new Date();
      const comp = await tx.bonusComputation.create({
        data: { organizationId: org, legalEntityId: dto.legalEntityId, yearStart: asDate(year.start), yearEnd: asDate(year.end), dueOn: asDate(year.dueOn), rules: rules as unknown as Prisma.InputJsonValue, supportedRate: rules.minRate, rate: rules.minRate, carry: NO_CARRY as unknown as Prisma.InputJsonValue, createdBy: v.userId!, updatedBy: v.userId!, computedAt: now },
      });
      const built = await this.build(tx, c, v, comp, {});
      await audit(tx, c, 'payroll.bonus.computed', 'bonus_computation', comp.id, { legalEntityId: dto.legalEntityId, year: year.label, people: built.people, eligible: built.eligible, rate: built.rate.toFixed(2), payable: built.payableTotal.toFixed(2) });
      return this.view(tx, c, built, v);
    });
  }

  /**
   * Works the computation out again from the payroll records, keeping each row's deductions, and saves it. `change`
   * sets the surplus, the opening carries or the rate first.
   */
  private async build(tx: Tx, c: CompanyContext, v: Viewer, comp: Comp, change: { availableSurplus?: string | null; openingSetOn?: string; openingSetOff?: string; rate?: string | null }): Promise<Comp> {
    const org = c.organizationId;
    const entity = comp.legalEntityId;
    const rules = await this.rulesFor(tx, c, entity);
    const problem = rateProblem(rules.minRate, rules);
    if (problem) throw new ConflictException(problem);
    const start = dateOf(comp.yearStart);
    const end = dateOf(comp.yearEnd);
    const months = yearMonths(accountingYear(Number(start.slice(0, 4)), rules));

    // Who: everyone employed in the legal entity during the year.
    const ems = await tx.employment.findMany({ where: { organizationId: org, legalEntityId: entity, joinedOn: { lte: asDate(end) }, OR: [{ exitedOn: null }, { exitedOn: { gte: asDate(start) } }] }, select: { id: true, employeeId: true, joinedOn: true, exitedOn: true } });
    // The bonus wage each month: approved payslips' bonusWage earnings; imported history where a month has no payslip.
    const slipWages = await tx.$queryRaw<{ employmentId: string; month: string; wage: string }[]>`
      SELECT p.employment_id::text AS "employmentId", to_char(p.period_start, 'YYYY-MM') AS month, sum(l.amount)::text AS wage
      FROM payslips p
      JOIN payslip_lines l ON l.organization_id = p.organization_id AND l.payslip_id = p.id AND l.kind = 'earning'
      JOIN pay_components pc ON pc.organization_id = l.organization_id AND pc.code = l.component_code AND pc.bonus_wage
      WHERE p.organization_id = ${org}::uuid AND p.legal_entity_id = ${entity}::uuid AND p.status = 'approved'
        AND p.period_start BETWEEN ${start}::date AND ${end}::date
      GROUP BY 1, 2`;
    const slipMonths = new Set((await tx.$queryRaw<{ k: string }[]>`
      SELECT DISTINCT employment_id::text || to_char(period_start, 'YYYY-MM') AS k FROM payslips
      WHERE organization_id = ${org}::uuid AND legal_entity_id = ${entity}::uuid AND status = 'approved' AND period_start BETWEEN ${start}::date AND ${end}::date`).map((x) => x.k));
    const imported = await tx.$queryRaw<{ employmentId: string; month: string; wage: string }[]>`
      SELECT a.employment_id::text AS "employmentId", to_char(a.period_start, 'YYYY-MM') AS month, sum(a.amount)::text AS wage
      FROM as_paid_lines a JOIN pay_components pc ON pc.organization_id = a.organization_id AND pc.code = a.component_code AND pc.bonus_wage
      WHERE a.organization_id = ${org}::uuid AND a.legal_entity_id = ${entity}::uuid AND a.period_start BETWEEN ${start}::date AND ${end}::date
      GROUP BY 1, 2`;
    const wage = new Map<string, Prisma.Decimal>();
    for (const w of slipWages) wage.set(w.employmentId + w.month, D(w.wage));
    for (const w of imported) if (!slipMonths.has(w.employmentId + w.month)) wage.set(w.employmentId + w.month, D(w.wage));
    // s.2(13) eligibility on the full-month salary rate (founder 30 Oct 2026, item 24): the bonusWage lines of the monthly
    // salary in force on the month's last day employed. No salary record (imported history) or an hourly or daily rate:
    // none, and the month's earned wage is tested instead.
    const comps = await tx.compensation.findMany({ where: { organizationId: org, employmentId: { in: ems.map((e) => e.id) }, supersededAt: null, validFrom: { lte: asDate(end) }, OR: [{ validTo: null }, { validTo: { gte: asDate(start) } }] }, select: { employmentId: true, validFrom: true, validTo: true, changeId: true } });
    const pkgs = await tx.compensationPackage.findMany({ where: { organizationId: org, changeId: { in: comps.map((x) => x.changeId) }, payBasis: 'monthly' }, select: { id: true, changeId: true } });
    const bonusComps = new Set((await tx.payComponent.findMany({ where: { organizationId: org, bonusWage: true }, select: { id: true } })).map((x) => x.id));
    const pkgRate = new Map<string, Prisma.Decimal>();
    for (const l of await tx.compensationLine.findMany({ where: { organizationId: org, packageId: { in: pkgs.map((p) => p.id) } }, select: { packageId: true, componentId: true, monthly: true } }))
      if (bonusComps.has(l.componentId)) pkgRate.set(l.packageId, (pkgRate.get(l.packageId) ?? ZERO).add(l.monthly));
    const rateOf = (employmentId: string, exited: string | null, month: string): Prisma.Decimal | null => {
      const last = monthRange(month).to;
      const day = exited && exited < last ? exited : last;
      const cmp = comps.find((x) => x.employmentId === employmentId && dateOf(x.validFrom) <= day && (!x.validTo || dateOf(x.validTo) >= day));
      const pkg = cmp && pkgs.find((p) => p.changeId === cmp.changeId);
      return pkg ? (pkgRate.get(pkg.id) ?? ZERO) : null;
    };
    // s.14 working days: the payroll feed's paid and lay-off days; a paid month with no feed counts the days employed.
    // Maternity leave (s.14(c)) counts only through the feed's paid days: the feed has no column for maternity days paid
    // as an ESI benefit instead of salary (founder item 25, gap recorded in the Pay design map).
    const feed = new Map((await tx.$queryRaw<{ k: string; days: string }[]>`
      SELECT employee_id::text || to_char(period_start, 'YYYY-MM') AS k, sum(paid_days + layoff_days)::text AS days FROM payroll_feed_rows
      WHERE organization_id = ${org}::uuid AND legal_entity_id = ${entity}::uuid AND superseded_at IS NULL AND period_start BETWEEN ${start}::date AND ${end}::date
      GROUP BY 1`).map((x) => [x.k, D(x.days)]));
    // s.12 ceiling: the scheduled minimum wage at the place of work at the year end (else the last one in the year).
    const rulesets = await this.statutory.published();
    const mwRs = inForce(rulesets, 'IN.MW', ['IN'], end);
    const asgs = await tx.employeeAssignment.findMany({ where: { organizationId: org, employmentId: { in: ems.map((e) => e.id) }, supersededAt: null, validFrom: { lte: asDate(end) } }, orderBy: { validFrom: 'desc' }, select: { employmentId: true, locationId: true, skillClass: true } });
    const locs = new Map((await tx.location.findMany({ where: { organizationId: org, id: { in: [...new Set(asgs.map((a) => a.locationId))] } }, select: { id: true, state: true, minWageZone: true } })).map((l) => [l.id, l]));
    const minimumOf = (employmentId: string) => {
      const a = asgs.find((x) => x.employmentId === employmentId);
      const loc = a ? locs.get(a.locationId) : undefined;
      if (!mwRs || !loc) return ZERO;
      try {
        return minWage(mwRs, { table: minWageTableFor(rulesets, loc.state, end), zone: loc.minWageZone, skill: a!.skillClass ?? null }).monthly;
      } catch {
        return ZERO; // No minimum wage table for the state: the ₹7,000 (or the company's) ceiling applies.
      }
    };
    const kept = new Map((await tx.bonusComputationRow.findMany({ where: { organizationId: org, computationId: comp.id } })).map((r) => [r.employmentId, r]));

    const inputs = ems.map((em) => {
      const joined = dateOf(em.joinedOn);
      const exited = em.exitedOn ? dateOf(em.exitedOn) : null;
      let days = ZERO;
      const ms = months.map((month) => {
        const w = wage.get(em.id + month) ?? ZERO;
        const f = feed.get(em.employeeId + month);
        if (f) days = days.add(f);
        else if (w.gt(0)) {
          const r = monthRange(month);
          const from = joined > r.from ? joined : r.from;
          const to = exited && exited < r.to ? exited : r.to;
          if (from <= to) days = days.add((Date.parse(to) - Date.parse(from)) / 86_400_000 + 1);
        }
        const rate = rateOf(em.id, exited, month);
        return { month, wage: w.toFixed(2), ...(rate ? { rate: rate.toFixed(2) } : {}) };
      });
      const k = kept.get(em.id);
      return { em, ms, days, minimumWage: minimumOf(em.id), adjust: { disqualified: k?.disqualified ?? false, pujaPaid: k?.pujaPaid ?? ZERO, misconductLoss: k?.misconductLoss ?? ZERO, reason: k?.adjustReason ?? null } };
    });
    const at = (rate: Prisma.Decimal.Value) => inputs.map((i) => employeeBonus({ months: i.ms, days: i.days, minimumWage: i.minimumWage, ...i.adjust }, rules, rate));

    // Surplus, set-on and set-off (s.15): carried from the approved computations of the last years, plus any opening amount.
    const available = change.availableSurplus !== undefined ? (change.availableSurplus === null ? null : D(change.availableSurplus)) : comp.availableSurplus;
    const earlierComps = await tx.bonusComputation.findMany({ where: { organizationId: org, legalEntityId: entity, yearStart: { lt: comp.yearStart }, status: { in: ['approved', 'sent'] } } });
    const openingOn = D(change.openingSetOn ?? comp.openingSetOn);
    const openingOff = D(change.openingSetOff ?? comp.openingSetOff);
    if (earlierComps.length && (openingOn.gt(0) || openingOff.gt(0))) throw new BadRequestException('Set-on and set-off are brought in from the earlier years worked out here. An opening amount is only for the first year.');
    const earlier: EarlierYear[] = earlierComps.map((e) => {
      const y = dateOf(e.yearStart);
      const cj = e.carry as unknown as CarryJson;
      const made = (amount: Prisma.Decimal, opening: Prisma.Decimal) => [...(amount.gt(0) ? [{ year: y, amount: amount.toFixed(2) }] : []), ...(opening.gt(0) ? [{ year: prevYear(y), amount: opening.toFixed(2) }] : [])];
      return { year: y, setOnMade: made(e.setOnMade, e.openingSetOn), setOffMade: made(e.setOffMade, e.openingSetOff), setOnUsed: cj.setOnUsed, setOffSettled: cj.setOffSettled };
    });
    const into = carriesInto(start, earlier, rules);
    const setOn = [...into.setOn, ...(openingOn.gt(0) ? [{ year: prevYear(start), amount: openingOn.toFixed(2) }] : [])];
    const setOff = [...into.setOff, ...(openingOff.gt(0) ? [{ year: prevYear(start), amount: openingOff.toFixed(2) }] : [])];
    const atMin = at(rules.minRate);
    const salaryTotal = atMin.reduce((t, r) => (r.eligible ? t.add(r.bonusSalary) : t), ZERO);
    const minTotal = atMin.reduce((t, r) => t.add(r.bonus), ZERO);
    const allocable = available === null ? null : allocableSurplus(available, rules);
    const supported = supportedRate({ allocable, setOn, setOff, salaryTotal }, rules);
    const chosen = change.rate !== undefined ? (change.rate === null ? null : D(change.rate)) : comp.chosenRate;
    if (change.rate) {
      const p = rateProblem(change.rate, rules, supported);
      if (p) throw new BadRequestException(p);
    }
    // A rate chosen earlier that the surplus now outruns follows the surplus up.
    const rate = chosen && chosen.gt(supported) ? chosen : supported;
    const rows = at(rate);
    const bonusTotal = rows.reduce((t, r) => t.add(r.bonus), ZERO);
    const settle = settleYear({ allocable, setOn, setOff, totalBonus: bonusTotal, minTotal, salaryTotal }, rules);

    await tx.bonusComputationRow.deleteMany({ where: { organizationId: org, computationId: comp.id } });
    await tx.bonusComputationRow.createMany({
      data: inputs.map((i, n) => ({
        organizationId: org,
        legalEntityId: entity,
        computationId: comp.id,
        employeeId: i.em.employeeId,
        employmentId: i.em.id,
        months: i.ms,
        workingDays: i.days,
        minimumWage: i.minimumWage,
        ceiling: rows[n].ceiling,
        eligibleMonths: rows[n].eligibleMonths,
        eligible: rows[n].eligible,
        reason: rows[n].reason,
        bonusSalary: rows[n].bonusSalary,
        bonus: rows[n].bonus,
        pujaPaid: i.adjust.pujaPaid,
        misconductLoss: i.adjust.misconductLoss,
        disqualified: i.adjust.disqualified,
        adjustReason: i.adjust.reason,
        deductions: rows[n].deductions,
        payable: rows[n].payable,
      })),
    });
    const carry: CarryJson = { setOnIn: setOn, setOffIn: setOff, setOnUsed: settle.setOnUsed, setOffSettled: settle.setOffSettled };
    return tx.bonusComputation.update({
      where: { id: comp.id },
      data: {
        rules: rules as unknown as Prisma.InputJsonValue,
        availableSurplus: available,
        allocableSurplus: allocable,
        openingSetOn: openingOn,
        openingSetOff: openingOff,
        chosenRate: chosen,
        supportedRate: supported,
        rate,
        carry: carry as unknown as Prisma.InputJsonValue,
        setOnMade: settle.setOnCreated,
        setOffMade: settle.setOffCreated,
        people: rows.length,
        eligible: rows.filter((r) => r.eligible).length,
        salaryTotal,
        bonusTotal,
        deductionTotal: rows.reduce((t, r) => t.add(r.deductions), ZERO),
        payableTotal: rows.reduce((t, r) => t.add(r.payable), ZERO),
        computedAt: new Date(),
        updatedBy: v.userId!,
        version: { increment: 1 },
      },
    });
  }

  // ------------------------------------------------------------------------------------------ review

  async change(ctx: TenantContext, user: ScopeUser, id: string, dto: BonusPatchDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.scope(tx, c, v);
      const comp = await this.locked(tx, c, id, s.manage, dto.version);
      this.draftOnly(comp);
      const built = await this.build(tx, c, v, comp, dto);
      const before = { availableSurplus: comp.availableSurplus?.toFixed(2) ?? null, openingSetOn: comp.openingSetOn.toFixed(2), openingSetOff: comp.openingSetOff.toFixed(2), rate: comp.rate.toFixed(2), payable: comp.payableTotal.toFixed(2) };
      const after = { availableSurplus: built.availableSurplus?.toFixed(2) ?? null, openingSetOn: built.openingSetOn.toFixed(2), openingSetOff: built.openingSetOff.toFixed(2), rate: built.rate.toFixed(2), payable: built.payableTotal.toFixed(2) };
      await audit(tx, c, 'payroll.bonus.changed', 'bonus_computation', comp.id, { before, after });
      return this.view(tx, c, built, v);
    });
  }

  async changeRow(ctx: TenantContext, user: ScopeUser, id: string, employmentId: string, dto: BonusRowDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const s = await this.scope(tx, c, v);
      const comp = await this.locked(tx, c, id, s.manage, dto.version);
      this.draftOnly(comp);
      const row = await tx.bonusComputationRow.findFirst({ where: { organizationId: org, computationId: comp.id, employmentId } });
      if (!row) throw new NotFoundException('Not found');
      const any = D(dto.pujaPaid).gt(0) || D(dto.misconductLoss).gt(0) || dto.disqualified;
      if (any && !dto.reason) throw new BadRequestException('Give the reason for the deduction or the dismissal (at least 5 characters).');
      const data = { pujaPaid: D(dto.pujaPaid), misconductLoss: D(dto.misconductLoss), disqualified: dto.disqualified, adjustReason: any ? dto.reason! : null };
      await tx.bonusComputationRow.update({ where: { id: row.id }, data });
      const built = await this.build(tx, c, v, comp, {});
      await audit(tx, c, 'payroll.bonus.row_changed', 'bonus_computation', comp.id, {
        employeeId: row.employeeId,
        before: { pujaPaid: row.pujaPaid.toFixed(2), misconductLoss: row.misconductLoss.toFixed(2), disqualified: row.disqualified, reason: row.adjustReason },
        after: { pujaPaid: data.pujaPaid.toFixed(2), misconductLoss: data.misconductLoss.toFixed(2), disqualified: data.disqualified, reason: data.adjustReason },
      });
      return this.view(tx, c, built, v);
    });
  }

  /**
   * Worked out again from today's payroll records, then frozen for the approver. Everyone who may approve it (the key
   * on its legal entity, never one of its makers) is told in the app and by email (founder 30 Oct 2026, item 30).
   */
  async submit(ctx: TenantContext, user: ScopeUser, id: string, version: number) {
    const v = await this.viewer(user);
    let notice: { to: string[]; label: string; entity: string } | null = null;
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.scope(tx, c, v);
      const comp = await this.locked(tx, c, id, s.manage, version);
      this.draftOnly(comp);
      if (comp.availableSurplus === null) throw new BadRequestException('Enter the available surplus from the accounts first (it may be 0).');
      const built = await this.build(tx, c, v, comp, {});
      const done = await tx.bonusComputation.update({ where: { id: comp.id }, data: { status: 'submitted', submittedBy: v.userId!, submittedAt: new Date(), returnedReason: null, version: { increment: 1 } } });
      const makers = await this.makers(tx, c, done);
      const to = (await payHolders(tx, c.organizationId, 'payroll.bonus.approve', comp.legalEntityId, todayIst())).filter((u) => !makers.includes(u));
      await audit(tx, c, 'payroll.bonus.submitted', 'bonus_computation', comp.id, { rate: built.rate.toFixed(2), eligible: built.eligible, payable: built.payableTotal.toFixed(2), notified: to.length });
      const e = await tx.legalEntity.findFirstOrThrow({ where: { organizationId: c.organizationId, id: comp.legalEntityId }, select: { name: true } });
      notice = { to, label: accountingYear(Number(dateOf(comp.yearStart).slice(0, 4)), comp.rules as unknown as BonusRules).label, entity: e.name };
      return this.view(tx, c, done, v);
    });
    const n = notice as { to: string[]; label: string; entity: string } | null;
    if (n?.to.length) {
      const text = `The statutory bonus for ${n.label} (${n.entity}) waits for your approval.`;
      await this.notifications
        .notifySystem(ctx, n.to, 'payroll.bonus.submitted', { entityType: 'bonus_computation', entityId: id, contextText: text, linkPath: '/yx/payroll/bonus' }, { subject: `Statutory bonus ${n.label} waits for your approval`, html: `<p>${text}</p><p>Open YukthiX to approve it or send it back.</p>` }, v.userId ?? null)
        .catch(() => undefined);
    }
    return out;
  }

  // ------------------------------------------------------------------------------------------ approve

  async approve(ctx: TenantContext, user: ScopeUser, id: string, version: number) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.scope(tx, c, v);
      const comp = await this.locked(tx, c, id, s.approve, version);
      if (comp.status !== 'submitted') throw new ConflictException(comp.status === 'draft' ? 'This bonus has not been sent for approval yet.' : 'This bonus is already approved.');
      if ((await this.makers(tx, c, comp)).includes(v.userId!)) throw new ForbiddenException('You worked on this bonus, so someone else approves it.');
      const done = await tx.bonusComputation.update({ where: { id: comp.id }, data: { status: 'approved', approvedBy: v.userId!, approvedAt: new Date(), version: { increment: 1 } } });
      await audit(tx, c, 'payroll.bonus.approved', 'bonus_computation', comp.id, { rate: comp.rate.toFixed(2), payable: comp.payableTotal.toFixed(2) });
      return this.view(tx, c, done, v);
    });
  }

  async sendBack(ctx: TenantContext, user: ScopeUser, id: string, dto: BonusReturnDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.scope(tx, c, v);
      const comp = await this.locked(tx, c, id, s.approve, dto.version);
      if (comp.status !== 'submitted') throw new ConflictException('Only a bonus waiting for approval is sent back.');
      const done = await tx.bonusComputation.update({ where: { id: comp.id }, data: { status: 'draft', submittedBy: null, submittedAt: null, returnedReason: dto.reason, version: { increment: 1 } } });
      await audit(tx, c, 'payroll.bonus.returned', 'bonus_computation', comp.id, { reason: dto.reason });
      return this.view(tx, c, done, v);
    });
  }

  // ------------------------------------------------------------------------------------------ send to an off-cycle bonus run

  async send(ctx: TenantContext, user: ScopeUser, id: string, dto: BonusSendDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const s = await this.scope(tx, c, v);
      const comp = await this.locked(tx, c, id, s.manage, dto.version);
      if (comp.status === 'sent') throw new ConflictException('This bonus is already sent to an off-cycle run.');
      if (comp.status !== 'approved') throw new ConflictException('Only an approved bonus is sent to an off-cycle run.');
      const comp2 = await tx.payComponent.findFirst({ where: { organizationId: org, code: 'bonus', status: 'active' } });
      if (!comp2) throw new ConflictException('Switch on the "Bonus" pay component first (Payroll set-up, Components).');
      let run: Prisma.PayrollRunGetPayload<object> | null;
      if (dto.runId) {
        run = await tx.payrollRun.findFirst({ where: { organizationId: org, id: dto.runId, legalEntityId: comp.legalEntityId, runType: 'offcycle', offcycleKind: 'bonus' } });
        if (!run || !EDITABLE_RUN.includes(run.status)) throw new ConflictException('Choose a draft off-cycle bonus run of the same legal entity.');
      } else {
        const group = await tx.payGroup.findFirst({ where: { organizationId: org, legalEntityId: comp.legalEntityId, status: 'active' }, orderBy: { name: 'asc' } });
        if (!group) throw new ConflictException('Make a pay group for this legal entity first.');
        const { from, to } = monthRange(todayIst().slice(0, 7));
        run = await tx.payrollRun.create({ data: { organizationId: org, legalEntityId: comp.legalEntityId, payGroupId: group.id, periodStart: asDate(from), periodEnd: asDate(to), preparedBy: v.userId!, runType: 'offcycle', offcycleKind: 'bonus' } });
        await audit(tx, c, 'payroll.run.created', 'payroll_run', run.id, { payGroupId: group.id, month: from.slice(0, 7), offcycle: 'bonus', bonusComputationId: comp.id });
      }
      const label = `Statutory bonus ${accountingYear(Number(dateOf(comp.yearStart).slice(0, 4)), comp.rules as unknown as BonusRules).label}`;
      const rows = await tx.bonusComputationRow.findMany({ where: { organizationId: org, computationId: comp.id, payable: { gt: 0 } } });
      await tx.oneTimePay.createMany({
        data: rows.map((r) => ({
          organizationId: org,
          legalEntityId: comp.legalEntityId,
          employeeId: r.employeeId,
          employmentId: r.employmentId,
          componentCode: 'bonus',
          amount: r.payable,
          periodStart: run!.periodStart,
          source: 'bonus',
          sourceRef: comp.id,
          reason: `${label} at ${comp.rate.toFixed(2)}% (Payment of Bonus Act).`,
          label,
          status: 'approved',
          runId: run!.id,
          createdBy: v.userId!,
        })),
      });
      const done = await tx.bonusComputation.update({ where: { id: comp.id }, data: { status: 'sent', runId: run.id, sentBy: v.userId!, sentAt: new Date(), version: { increment: 1 } } });
      await audit(tx, c, 'payroll.bonus.sent', 'bonus_computation', comp.id, { runId: run.id, people: rows.length, payable: comp.payableTotal.toFixed(2) });
      return this.view(tx, c, done, v);
    });
  }
  // ------------------------------------------------------------------------------------------ Form C register (item 30)

  /**
   * Form C (Payment of Bonus Rules, 1975, rule 4(c)): the bonus register of an approved computation, as CSV, one row per
   * eligible employee. Income tax and the amount actually paid come from the off-cycle bonus run once its payslips are
   * approved and paid. Father's name is not held in YukthiX and stays blank. Every download is audited with its hash.
   */
  async formC(ctx: TenantContext, user: ScopeUser, id: string): Promise<{ file: Buffer; name: string }> {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const s = await this.scope(tx, c, v);
      const comp = await this.compIn(tx, c, id, [...s.manage, ...s.approve]);
      if (comp.status !== 'approved' && comp.status !== 'sent') throw new ConflictException('Form C is made once the bonus is approved.');
      const view = await this.view(tx, c, comp, v);
      const rows = view.rows.filter((r) => r.eligible);
      const start = dateOf(comp.yearStart);
      const end = dateOf(comp.yearEnd);
      const people = await tx.employeePersonalDetails.findMany({ where: { organizationId: org, employeeId: { in: rows.map((r) => r.employeeId) } }, select: { employeeId: true, dateOfBirth: true } });
      const asgs = await tx.employeeAssignment.findMany({ where: { organizationId: org, employmentId: { in: rows.map((r) => r.employmentId) }, supersededAt: null, validFrom: { lte: asDate(end) } }, orderBy: { validFrom: 'desc' }, select: { employmentId: true, designationId: true } });
      const titles = new Map((await tx.designation.findMany({ where: { organizationId: org, id: { in: [...new Set(asgs.map((a) => a.designationId))] } }, select: { id: true, name: true } })).map((d) => [d.id, d.name]));
      // The off-cycle bonus run's approved payslips: income tax deducted and, once the bank says so, the day it was paid.
      const slips = comp.runId ? await tx.payslip.findMany({ where: { organizationId: org, runId: comp.runId, status: 'approved' }, select: { id: true, employmentId: true, paymentStatus: true } }) : [];
      const tdsCodes = (await tx.payComponent.findMany({ where: { organizationId: org, statutory: 'tds' }, select: { code: true } })).map((x) => x.code);
      const tds = new Map<string, Prisma.Decimal>();
      for (const l of await tx.payslipLine.findMany({ where: { organizationId: org, payslipId: { in: slips.map((x) => x.id) }, componentCode: { in: tdsCodes } }, select: { payslipId: true, amount: true } })) tds.set(l.payslipId, (tds.get(l.payslipId) ?? ZERO).add(l.amount));
      const paidOn = new Map((await tx.paymentRecord.findMany({ where: { organizationId: org, payslipId: { in: slips.map((x) => x.id) }, status: 'paid' }, select: { payslipId: true, recordedAt: true } })).map((p) => [p.payslipId, p.recordedAt]));
      const fifteenAt = (dob: Date | null | undefined) => {
        if (!dob) return '';
        const d = dateOf(dob);
        return `${Number(d.slice(0, 4)) + 15}${d.slice(4)}` <= start ? 'Yes' : 'No';
      };
      const header = ['Sl. No.', 'Employee code', 'Name of the employee', "Father's name", 'Completed 15 years of age at the beginning of the accounting year', 'Designation', 'Number of days worked in the year', 'Total salary or wage for the year (section 12)', 'Bonus payable under section 10 or 11', 'Puja or other customary bonus paid during the year', 'Interim bonus or bonus paid in advance', 'Income tax deducted', 'Deduction for financial loss caused by misconduct', 'Total deducted', 'Net amount payable', 'Amount actually paid', 'Date paid', 'Signature or thumb impression of the employee'];
      const body = rows.map((r, i) => {
        const slip = slips.find((x) => x.employmentId === r.employmentId);
        const paid = slip && slip.paymentStatus === 'paid' ? paidOn.get(slip.id) : undefined;
        const asg = asgs.find((a) => a.employmentId === r.employmentId);
        return [i + 1, r.employeeCode, r.name, '', fifteenAt(people.find((p) => p.employeeId === r.employeeId)?.dateOfBirth), (asg && titles.get(asg.designationId)) ?? '', r.workingDays, r.bonusSalary, r.bonus, r.pujaPaid, '0.00', slip ? (tds.get(slip.id) ?? ZERO).toFixed(2) : '', r.misconductLoss, r.deductions, r.payable, paid ? r.payable : '', paid ? dateOf(paid) : '', ''];
      });
      const safe = (x: unknown) => {
        const t = x === null || x === undefined ? '' : String(x);
        return /^[=+\-@\t\r]/.test(t) ? `'${t}` : t; // CSV injection: formula-looking text is defused.
      };
      const title = `Form C: bonus paid to employees for the accounting year ${dateText(start)} to ${dateText(end)} at ${comp.rate.toFixed(2)}%`;
      const csv = stringify([[safe(title)], header, ...body.map((r) => r.map(safe))]);
      const file = Buffer.from(`\uFEFF${csv}`, 'utf8');
      const sha256 = createHash('sha256').update(file).digest('hex');
      await audit(tx, c, 'payroll.bonus.register_exported', 'bonus_computation', comp.id, { form: 'C', rows: body.length, sha256 });
      return { file, name: `form-c-bonus-${view.year.label}.csv` };
    });
  }
}
