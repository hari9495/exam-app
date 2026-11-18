import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import type { ScopeUser, Viewer } from '../access/scope';
import { asDate, dateOf } from '../time/time-core';
import { entitiesFor, payScope, payViewer, requireSelf, withPayScope } from './pay-access';
import { PayrollIntakeService } from './intake.service';
import { entitledMonths, flexBalance, flexSettle, flexYearMonths, flexYearOf } from './flex';
import type { FlexComponentChangeDto, FlexComponentDto, FlexSettleDto } from './dto-flex';

// B8/E5 flexible benefits (founder answers 2406, 2407; Settings 4.11 "Flexible benefit plan"):
//   components   the company's list (benefits.settings.manage): code, name, monthly entitlement, "taxable if unclaimed",
//                and the expense category it is claimed under. Changes are audited before and after, with a version.
//   ledger       per person, component and tax year: entitled (monthly × months employed so far), carried in (last
//                year's carried out), claimed (approved claims), pending (claims waiting), paid as taxable, carried out.
//                The person sees their own; payroll (payroll.input.manage) the people of its legal entities.
//   claims       an expense line in a linked category may not take the balance below zero (the claim's blockers).
//   settlement   in March for the year, or in the exit month for a leaver: what is left is paid as taxable salary through
//                payroll (one-time pay 'fbp_unclaimed', source m11), carried into the next year (company setting
//                benefits.fbp.unclaimed = carry, never at exit), or lapses when the component is not taxable if unclaimed.
//                One settlement per person, component and year (the database refuses a second).

const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const ZERO = D(0);
const money = (x: Prisma.Decimal) => x.toFixed(2);
const DECIDED = ['approved', 'partly_approved'];

/** A company-wide setting (tenant scope only), so it is read with no legal entity. */
export const FLEX_UNCLAIMED_KEY = 'benefits.fbp.unclaimed';

type Component = Prisma.FlexComponentGetPayload<object>;

export interface FlexLedgerRow {
  componentId: string;
  code: string;
  name: string;
  monthly: string;
  taxableIfUnclaimed: boolean;
  months: number;
  entitled: string;
  carriedIn: string;
  claimed: string;
  pending: string;
  available: string;
  settlement: { kind: string; payMonth: string; paidTaxable: string; carriedOut: string; lapsed: string } | null;
}

/** What one person claimed under a category in a tax year: approved amounts, and amounts still waiting for a decision. */
async function claimedUnder(tx: Tx, org: string, employeeId: string, category: string, taxYear: string, exceptClaimId?: string) {
  const y = flexYearMonths(taxYear);
  const claims = await tx.expenseClaim.findMany({ where: { organizationId: org, employeeId, status: { in: [...DECIDED, 'submitted'] }, ...(exceptClaimId ? { id: { not: exceptClaimId } } : {}) }, select: { id: true, status: true } });
  if (!claims.length) return { claimed: ZERO, pending: ZERO };
  const lines = await tx.expenseLine.findMany({
    where: { organizationId: org, claimId: { in: claims.map((x) => x.id) }, categoryCode: category, removedAt: null, spentOn: { gte: asDate(`${y.first}-01`), lte: asDate(`${y.last}-31`) } },
    select: { claimId: true, claimed: true, approved: true },
  });
  const decided = new Set(claims.filter((x) => DECIDED.includes(x.status)).map((x) => x.id));
  return {
    claimed: lines.filter((l) => decided.has(l.claimId)).reduce((t, l) => t.add(l.approved ?? ZERO), ZERO),
    pending: lines.filter((l) => !decided.has(l.claimId)).reduce((t, l) => t.add(l.claimed), ZERO),
  };
}

/** The person's employment that covers the tax year (the latest one that started before it ends and had not ended before it began). */
async function employmentIn(tx: Tx, org: string, employeeId: string, taxYear: string) {
  const y = flexYearMonths(taxYear);
  return tx.employment.findFirst({ where: { organizationId: org, employeeId, joinedOn: { lte: asDate(`${y.last}-31`) }, OR: [{ exitedOn: null }, { exitedOn: { gte: asDate(`${y.first}-01`) } }] }, orderBy: { joinedOn: 'desc' } });
}

/** The leaver's last day: the exit date, else the last day of the F&F settlement handed to payroll (before the exit date is set). */
async function leavingOn(tx: Tx, org: string, e: { id: string; exitedOn: Date | null }) {
  if (e.exitedOn) return dateOf(e.exitedOn);
  const f = await tx.fnfSettlement.findFirst({ where: { organizationId: org, employmentId: e.id }, select: { lwd: true } });
  return f ? dateOf(f.lwd) : null;
}

/**
 * The ledger of one person for a tax year, through `through` (YYYY-MM; the current month for a live view). Reads the
 * settlements with the pay guard opened to the whole company (a transfer keeps the year), then puts the scope back.
 */
export async function flexLedger(tx: Tx, org: string, employeeId: string, taxYear: string, through: string, exceptClaimId?: string): Promise<FlexLedgerRow[]> {
  const e = await employmentIn(tx, org, employeeId, taxYear);
  if (!e) return [];
  const comps = await tx.flexComponent.findMany({ where: { organizationId: org }, orderBy: { code: 'asc' } });
  const prevYear = `${Number(taxYear.slice(0, 4)) - 1}-${taxYear.slice(2, 4)}`;
  const all = (await tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true } })).map((x) => x.id);
  const settled = await withPayScope(tx, all, () => tx.flexSettlement.findMany({ where: { organizationId: org, employeeId, taxYear: { in: [taxYear, prevYear] } } }));
  const out: FlexLedgerRow[] = [];
  for (const c of comps) {
    const mine = settled.find((s) => s.componentId === c.id && s.taxYear === taxYear) ?? null;
    if (!c.active && !mine) continue;
    const carriedIn = settled.find((s) => s.componentId === c.id && s.taxYear === prevYear)?.carriedOut ?? ZERO;
    const used = c.expenseCategoryCode ? await claimedUnder(tx, org, employeeId, c.expenseCategoryCode, taxYear, exceptClaimId) : { claimed: ZERO, pending: ZERO };
    const months = entitledMonths(taxYear, dateOf(e.joinedOn), e.exitedOn ? dateOf(e.exitedOn) : null, through);
    const b = flexBalance({ monthly: c.monthlyAmount, months, carriedIn, claimed: used.claimed, pending: used.pending });
    const paidOut = mine ? mine.paidTaxable.add(mine.carriedOut).add(mine.lapsed) : ZERO;
    out.push({
      componentId: c.id,
      code: c.code,
      name: c.name,
      monthly: money(c.monthlyAmount),
      taxableIfUnclaimed: c.taxableIfUnclaimed,
      months,
      entitled: money(b.entitled),
      carriedIn: money(carriedIn),
      claimed: money(used.claimed),
      pending: money(used.pending),
      available: money(Prisma.Decimal.max(ZERO, b.available.sub(paidOut))),
      settlement: mine && { kind: mine.kind, payMonth: dateOf(mine.payMonth).slice(0, 7), paidTaxable: money(mine.paidTaxable), carriedOut: money(mine.carriedOut), lapsed: money(mine.lapsed) },
    });
  }
  return out;
}

/**
 * Answer 2407: the claim's lines in a flexible-benefit category, per component and tax year, may not take the balance
 * below zero (entitled to this month, plus carried in, less approved and waiting claims); a settled year takes none.
 */
export async function flexClaimBlockers(tx: Tx, org: string, claim: { id: string; employeeId: string }, lines: { id: string; lineNo: number; categoryCode: string; spentOn: Date; claimed: Prisma.Decimal }[]) {
  const comps = await tx.flexComponent.findMany({ where: { organizationId: org, expenseCategoryCode: { in: [...new Set(lines.map((l) => l.categoryCode))] } } });
  const out: { lineId: string; text: string }[] = [];
  const now = todayIst().slice(0, 7);
  for (const c of comps) {
    const mine = lines.filter((l) => l.categoryCode === c.expenseCategoryCode);
    for (const taxYear of [...new Set(mine.map((l) => flexYearOf(dateOf(l.spentOn).slice(0, 7))))]) {
      const these = mine.filter((l) => flexYearOf(dateOf(l.spentOn).slice(0, 7)) === taxYear);
      const through = now < flexYearMonths(taxYear).last ? now : flexYearMonths(taxYear).last;
      const row = (await flexLedger(tx, org, claim.employeeId, taxYear, through, claim.id)).find((r) => r.componentId === c.id);
      const asked = these.reduce((t, l) => t.add(l.claimed), ZERO);
      if (!c.active) out.push({ lineId: these[0].id, text: `Line ${these[0].lineNo}: ${c.name} is no longer offered.` });
      else if (row?.settlement) out.push({ lineId: these[0].id, text: `Line ${these[0].lineNo}: ${c.name} for ${taxYear} is already settled; it cannot be claimed any more.` });
      else if (!row || asked.gt(D(row.available))) out.push({ lineId: these[0].id, text: `Line ${these[0].lineNo}: your ${c.name} balance for ${taxYear} is ₹${row?.available ?? '0.00'}; claim at most that.` });
    }
  }
  return out;
}

@Injectable()
export class FlexBenefitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly intake: PayrollIntakeService,
  ) {}

  private async viewer(user: ScopeUser) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return v;
  }

  private view(c: Component) {
    return { id: c.id, code: c.code, name: c.name, monthlyAmount: money(c.monthlyAmount), taxableIfUnclaimed: c.taxableIfUnclaimed, expenseCategoryCode: c.expenseCategoryCode, active: c.active, version: c.version };
  }

  /** Settings 4.11 FBP: the components, the unclaimed-balance rule, the categories to link and the last change. */
  async settings(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const comps = await tx.flexComponent.findMany({ where: { organizationId: org }, orderBy: { code: 'asc' } });
      const categories = await tx.expenseCategory.findMany({ where: { organizationId: org, active: true }, orderBy: { name: 'asc' }, select: { code: true, name: true } });
      const last = await tx.auditLog.findFirst({ where: { organizationId: org, action: { startsWith: 'benefits.flex.' } }, orderBy: { createdAt: 'desc' }, select: { actorEmail: true, createdAt: true, action: true } });
      return {
        components: comps.map((x) => this.view(x)),
        unclaimed: await settingFor(tx, c, FLEX_UNCLAIMED_KEY, { legalEntityId: '' }),
        categories,
        lastChange: last ? { by: last.actorEmail ?? 'Someone', at: last.createdAt.toISOString(), what: last.action === 'benefits.flex.component_added' ? 'Added a flexible component' : 'Changed a flexible component' } : null,
      };
    });
  }

  private amount(x: string) {
    if (D(x).lte(0) || D(x).gt(1_000_000)) throw new BadRequestException('The monthly amount is above zero and at most ₹10,00,000.');
  }

  private async category(tx: Tx, org: string, code: string | null | undefined, exceptId?: string) {
    if (!code) return null;
    if (!(await tx.expenseCategory.findFirst({ where: { organizationId: org, code, active: true }, select: { id: true } }))) throw new BadRequestException('Choose an active expense category.');
    const taken = await tx.flexComponent.findFirst({ where: { organizationId: org, expenseCategoryCode: code, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { name: true } });
    if (taken) throw new ConflictException(`That expense category is already linked to ${taken.name}.`);
    return code;
  }

  async addComponent(ctx: TenantContext, dto: FlexComponentDto) {
    this.amount(dto.monthlyAmount);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      if (await tx.flexComponent.findFirst({ where: { organizationId: org, code: dto.code }, select: { id: true } })) throw new ConflictException('A flexible component with that code already exists.');
      const category = await this.category(tx, org, dto.expenseCategoryCode, undefined);
      const row = await tx.flexComponent.create({ data: { organizationId: org, code: dto.code, name: dto.name, monthlyAmount: dto.monthlyAmount, taxableIfUnclaimed: dto.taxableIfUnclaimed, expenseCategoryCode: category, createdBy: c.userId ?? null } });
      await audit(tx, c, 'benefits.flex.component_added', 'flex_component', row.id, { after: this.view(row) });
      return this.view(row);
    });
  }

  async changeComponent(ctx: TenantContext, id: string, dto: FlexComponentChangeDto) {
    this.amount(dto.monthlyAmount);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const old = await tx.flexComponent.findFirst({ where: { organizationId: org, id } });
      if (!old) throw new NotFoundException('Not found');
      if (old.version !== dto.version) throw new ConflictException('Someone else changed this component. Reload it.');
      if (dto.code !== old.code) throw new BadRequestException('The code of a component does not change; add a new one instead.');
      const category = await this.category(tx, org, dto.expenseCategoryCode, id);
      const done = await tx.flexComponent.updateMany({ where: { organizationId: org, id, version: dto.version }, data: { name: dto.name, monthlyAmount: dto.monthlyAmount, taxableIfUnclaimed: dto.taxableIfUnclaimed, expenseCategoryCode: category, active: dto.active, version: { increment: 1 } } });
      if (!done.count) throw new ConflictException('Someone else changed this component. Reload it.');
      const row = await tx.flexComponent.findFirstOrThrow({ where: { organizationId: org, id } });
      await audit(tx, c, 'benefits.flex.component_changed', 'flex_component', id, { before: this.view(old), after: this.view(row) });
      return this.view(row);
    });
  }

  /** The signed-in person's own ledger (no key; pay is never shown while acting for someone else). */
  async myLedger(ctx: TenantContext, user: ScopeUser, taxYear?: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const me = await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: v.userId! }, select: { id: true } });
      if (!me) throw new ForbiddenException('Only employees have a flexible benefit ledger.');
      const year = taxYear ?? flexYearOf(todayIst().slice(0, 7));
      return { taxYear: year, unclaimed: await settingFor(tx, c, FLEX_UNCLAIMED_KEY, { legalEntityId: '' }), rows: await flexLedger(tx, c.organizationId, me.id, year, this.through(year)) };
    });
  }

  /** A person's ledger for payroll (payroll.input.manage over their legal entity; never one's own here). */
  async ledger(ctx: TenantContext, user: ScopeUser, employeeId: string, taxYear?: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const year = taxYear ?? flexYearOf(todayIst().slice(0, 7));
      await this.reach(tx, c, v, employeeId, year);
      return { taxYear: year, employeeId, unclaimed: await settingFor(tx, c, FLEX_UNCLAIMED_KEY, { legalEntityId: '' }), rows: await flexLedger(tx, c.organizationId, employeeId, year, this.through(year)) };
    });
  }

  private through(taxYear: string) {
    const now = todayIst().slice(0, 7);
    const last = flexYearMonths(taxYear).last;
    return now < last ? now : last;
  }

  /** The person's employment in the year in an entity payroll.input.manage reaches (else "not found"); never oneself. */
  private async reach(tx: Tx, c: CompanyContext, v: Viewer, employeeId: string, taxYear: string) {
    const e = await employmentIn(tx, c.organizationId, employeeId, taxYear);
    const ids = await entitiesFor(tx, c, v, 'payroll.input.manage');
    if (!e || !ids.includes(e.legalEntityId)) throw new NotFoundException('Not found');
    if (await tx.employee.findFirst({ where: { organizationId: c.organizationId, id: employeeId, userId: v.userId! }, select: { id: true } })) throw new ForbiddenException('Someone else in payroll settles your own flexible benefits.');
    await payScope(tx, ids);
    return e;
  }

  /**
   * Answer 2455, payroll's settlement screen (PAY-60): everyone in payroll.input.manage's entities employed in the year
   * (never oneself), with what is left, claims still waiting, and whether they are settled; leavers carry their last day.
   */
  async overview(ctx: TenantContext, user: ScopeUser, taxYear?: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const now = todayIst().slice(0, 7);
      const year = taxYear ?? flexYearOf(now);
      const y = flexYearMonths(year);
      const ids = await entitiesFor(tx, c, v, 'payroll.input.manage');
      if (!ids.length) throw new ForbiddenException('You need payroll.input.manage over a legal entity.');
      await payScope(tx, ids);
      const me = await tx.employee.findFirst({ where: { organizationId: org, userId: v.userId! }, select: { id: true } });
      const jobs = (await tx.employment.findMany({ where: { organizationId: org, legalEntityId: { in: ids }, joinedOn: { lte: asDate(`${y.last}-31`) }, OR: [{ exitedOn: null }, { exitedOn: { gte: asDate(`${y.first}-01`) } }] }, orderBy: { joinedOn: 'desc' } })).filter((e) => e.employeeId !== me?.id);
      const names = new Map((await tx.employee.findMany({ where: { organizationId: org, id: { in: jobs.map((e) => e.employeeId) } }, select: { id: true, givenName: true, preferredName: true, familyName: true } })).map((p) => [p.id, p]));
      const seen = new Set<string>();
      const people = [];
      // shortcut: one ledger read per person (a few queries each); page the list when a company passes a few thousand people.
      for (const e of jobs) {
        if (seen.has(e.employeeId)) continue;
        seen.add(e.employeeId);
        const leaves = await leavingOn(tx, org, e);
        const leaver = !!leaves && leaves.slice(0, 7) <= y.last;
        const end = leaver ? leaves!.slice(0, 7) : y.last;
        const rows = await flexLedger(tx, org, e.employeeId, year, now < end ? now : end);
        if (!rows.length) continue;
        const p = names.get(e.employeeId);
        const sum = (k: 'available' | 'pending') => money(rows.reduce((t, r) => t.add(r[k]), ZERO));
        const settled = rows.every((r) => r.settlement) ? (rows.find((r) => r.settlement)?.settlement?.kind ?? null) : null;
        people.push({ employeeId: e.employeeId, name: p ? [p.preferredName ?? p.givenName, p.familyName].filter(Boolean).join(' ') : 'Someone', employeeCode: e.employeeCode, leavesOn: leaver ? leaves : null, available: sum('available'), pending: sum('pending'), settled });
      }
      return { taxYear: year, opensIn: y.last, open: now >= y.last, unclaimed: await settingFor(tx, c, FLEX_UNCLAIMED_KEY, { legalEntityId: '' }), people };
    });
  }

  /**
   * Answer 2406: settle what is left. Year end: the March pay month of the year, for everyone in scope (or one person)
   * not settled yet; exit: the exit month of a leaver. Paid amounts go to payroll as taxable one-time pay.
   */
  async settle(ctx: TenantContext, user: ScopeUser, dto: FlexSettleDto) {
    const v = await this.viewer(user);
    if (dto.kind === 'exit' && !dto.employeeId) throw new BadRequestException('Choose the person who is leaving.');
    const y = flexYearMonths(dto.taxYear);
    // Answer 2459: the year-end settlement opens with the March pay month of the year, never before.
    if (dto.kind === 'year_end' && todayIst().slice(0, 7) < y.last) throw new ConflictException(`The year-end settlement for ${dto.taxYear} opens with the March ${y.last.slice(0, 4)} pay month.`);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const people: string[] = [];
      if (dto.employeeId) people.push((await this.reach(tx, c, v, dto.employeeId, dto.taxYear)).employeeId);
      else {
        const ids = await entitiesFor(tx, c, v, 'payroll.input.manage');
        if (!ids.length) throw new ForbiddenException('You need payroll.input.manage over a legal entity.');
        await payScope(tx, ids);
        const me = await tx.employee.findFirst({ where: { organizationId: org, userId: v.userId! }, select: { id: true } });
        const rows = await tx.employment.findMany({ where: { organizationId: org, legalEntityId: { in: ids }, joinedOn: { lte: asDate(`${y.last}-31`) }, OR: [{ exitedOn: null }, { exitedOn: { gt: asDate(`${y.last}-31`) } }] }, select: { employeeId: true } });
        people.push(...new Set(rows.map((r) => r.employeeId).filter((id) => id !== me?.id)));
      }
      const done: Settled[] = [];
      for (const employeeId of people) {
        const e = (await employmentIn(tx, org, employeeId, dto.taxYear))!;
        let month = y.last;
        if (dto.kind === 'exit') {
          const leaves = await leavingOn(tx, org, e);
          if (!leaves || leaves.slice(0, 7) > y.last || leaves.slice(0, 7) < y.first) throw new ConflictException('This person has no exit date in that tax year. Settle them at year end instead.');
          month = leaves.slice(0, 7);
        }
        done.push(...(await this.settlePerson(tx, c, e, dto.taxYear, dto.kind, month, v.userId!, false)));
      }
      await audit(tx, c, 'benefits.flex.settled', 'flex_settlement', dto.employeeId ?? org, { kind: dto.kind, taxYear: dto.taxYear, carryForward: (await settingFor(tx, c, FLEX_UNCLAIMED_KEY, { legalEntityId: '' })) === 'carry', settled: done.length });
      return { kind: dto.kind, taxYear: dto.taxYear, settled: done };
    });
  }

  /**
   * Answer 2460: the exit settlement starts by itself when lifecycle hands the full and final settlement to payroll, in
   * the month of the last day. A component with claims still waiting is left for payroll to settle by hand once they
   * are decided. Runs inside the F&F transaction, the pay guard already open to the leaver's entity.
   */
  async settleExitOnHandoff(tx: Tx, c: CompanyContext, employeeId: string, lwd: string, by: string) {
    const month = lwd.slice(0, 7);
    const taxYear = flexYearOf(month);
    const e = await employmentIn(tx, c.organizationId, employeeId, taxYear);
    if (!e) return [];
    const done = await this.settlePerson(tx, c, e, taxYear, 'exit', month, by, true);
    if (done.length) await audit(tx, c, 'benefits.flex.settled', 'flex_settlement', employeeId, { kind: 'exit', taxYear, settled: done.length, automatic: true });
    return done;
  }

  /** Settles one person's components not settled yet for the year, through `month` (the pay month of the settlement). */
  private async settlePerson(tx: Tx, c: CompanyContext, e: { id: string; employeeId: string; legalEntityId: string }, taxYear: string, kind: 'year_end' | 'exit', month: string, by: string, skipPending: boolean) {
    const org = c.organizationId;
    const carry = (await settingFor(tx, c, FLEX_UNCLAIMED_KEY, { legalEntityId: '' })) === 'carry';
    const done: Settled[] = [];
    for (const r of await flexLedger(tx, org, e.employeeId, taxYear, month)) {
      if (r.settlement) continue;
      if (D(r.pending).gt(0)) {
        if (skipPending) continue;
        throw new ConflictException(`${r.name}: claims of ₹${r.pending} still wait for a decision. Decide them first.`);
      }
      const s = flexSettle({ entitled: r.entitled, carriedIn: r.carriedIn, claimed: r.claimed, kind, carryForward: carry, taxableIfUnclaimed: r.taxableIfUnclaimed });
      let oneTimePayId: string | null = null;
      if (s.paidTaxable.gt(0)) {
        const pay = await this.intake.oneTime(tx, c, { source: 'm11', sourceRef: `fbp:${taxYear}:${e.employeeId}:${r.code}`, employeeId: e.employeeId, componentCode: 'fbp_unclaimed', amount: money(s.paidTaxable), month, reason: `Unclaimed ${r.name} for ${taxYear}, paid as taxable salary.`, by });
        oneTimePayId = pay.id;
      }
      await withPayScope(tx, [e.legalEntityId], () =>
        tx.flexSettlement.create({ data: { organizationId: org, legalEntityId: e.legalEntityId, employeeId: e.employeeId, employmentId: e.id, componentId: r.componentId, taxYear, kind, payMonth: asDate(`${month}-01`), entitled: r.entitled, carriedIn: r.carriedIn, claimed: r.claimed, paidTaxable: s.paidTaxable, carriedOut: s.carriedOut, lapsed: s.lapsed, oneTimePayId, settledBy: by } }),
      );
      done.push({ employeeId: e.employeeId, component: r.code, paidTaxable: money(s.paidTaxable), carriedOut: money(s.carriedOut), lapsed: money(s.lapsed) });
    }
    return done;
  }
}

type Settled = { employeeId: string; component: string; paidTaxable: string; carriedOut: string; lapsed: string };
