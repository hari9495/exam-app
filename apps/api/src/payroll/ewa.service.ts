import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import type { ScopeUser, Viewer } from '../access/scope';
import { asDate, dateOf, monthRange } from '../time/time-core';
import type { EwaDrawDto, EwaPolicyDto } from './dto-5i';
import { PayrollIntakeService } from './intake.service';
import { entitiesFor, payScope, payViewer, requireEntity, requireSelf, withPayScope } from './pay-access';
import { ewaAvailable } from './special';

// Batch 5i, PAY-9.05 earned wage access (M03 YX-PAY-40 / 41, B10). A dated policy per legal entity (off until switched
// on). A person asks for part of what they have already earned this month: confirmed, not serving notice, no salary
// hold, outside the blackout days before cut-off, within the month's number of draws, and up to the policy's share of
// earned to date (the inputs are kept with the draw). Payroll pays it (employer-funded) and the draw, with the person's
// fee, is recovered in full in the month's regular payroll as a named deduction.
// DECISION NEEDED: partner-funded draws (P10 connector) are not wired; policies are employer-funded only.
// shortcut: expected net is the last approved regular payslip's net; upgrade to the month's salary less known deductions with M02 payable days.

const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const ZERO = D(0);
const LIVE = ['requested', 'paid'];
type Policy = Prisma.EwaPolicyGetPayload<object>;

@Injectable()
export class EwaService {
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

  private policyView(p: Policy) {
    return { id: p.id, legalEntityId: p.legalEntityId, validFrom: dateOf(p.validFrom), enabled: p.enabled, percentAvailable: p.percentAvailable.toString(), minAmount: p.minAmount.toFixed(2), maxAmount: p.maxAmount.toFixed(2), drawsPerMonth: p.drawsPerMonth, blackoutDays: p.blackoutDays, fee: p.fee.toFixed(2), feePayer: p.feePayer, funding: p.funding };
  }

  private drawView(d: Prisma.EwaDrawGetPayload<object>) {
    return { id: d.id, employeeId: d.employeeId, month: dateOf(d.month).slice(0, 7), available: d.available.toFixed(2), amount: d.amount.toFixed(2), fee: d.fee.toFixed(2), feePayer: d.feePayer, status: d.status, paidRef: d.paidRef, paidAt: d.paidAt, failureReason: d.failureReason, earned: d.earned, createdAt: d.createdAt };
  }

  // ------------------------------------------------------------------------------------------ payroll's side

  async policies(ctx: TenantContext, user: ScopeUser, entityId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await requireEntity(tx, c, v, 'payroll.ewa.manage', entityId);
      await payScope(tx, [entityId]);
      return (await tx.ewaPolicy.findMany({ where: { organizationId: c.organizationId, legalEntityId: entityId }, orderBy: { validFrom: 'desc' } })).map((p) => this.policyView(p));
    });
  }

  /** A new policy version from a date (the starter: off; 50 %, 3 draws, 3-day blackout before cut-off). */
  async addPolicy(ctx: TenantContext, user: ScopeUser, dto: EwaPolicyDto) {
    const v = await this.viewer(user);
    if (D(dto.maxAmount).lt(dto.minAmount)) throw new BadRequestException('The most a draw can be is at least the least.');
    if (D(dto.percentAvailable).lte(0) || D(dto.percentAvailable).gt(100)) throw new BadRequestException('The share available is above 0 and at most 100 %.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await requireEntity(tx, c, v, 'payroll.ewa.manage', dto.legalEntityId);
      await payScope(tx, [dto.legalEntityId]);
      try {
        const p = await tx.ewaPolicy.create({ data: { organizationId: c.organizationId, legalEntityId: dto.legalEntityId, validFrom: asDate(dto.validFrom), enabled: dto.enabled, percentAvailable: D(dto.percentAvailable), minAmount: D(dto.minAmount), maxAmount: D(dto.maxAmount), drawsPerMonth: dto.drawsPerMonth, blackoutDays: dto.blackoutDays, fee: D(dto.fee), feePayer: dto.feePayer, createdBy: v.userId! } });
        await audit(tx, c, 'payroll.ewa.policy_saved', 'ewa_policy', p.id, { validFrom: dto.validFrom, enabled: dto.enabled, percent: dto.percentAvailable, max: dto.maxAmount });
        return this.policyView(p);
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('There is already a policy from that day.');
        throw e;
      }
    });
  }

  async draws(ctx: TenantContext, user: ScopeUser, entityId: string, month: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await requireEntity(tx, c, v, 'payroll.ewa.manage', entityId);
      await payScope(tx, [entityId]);
      return (await tx.ewaDraw.findMany({ where: { organizationId: c.organizationId, legalEntityId: entityId, month: asDate(`${month}-01`) }, orderBy: { createdAt: 'desc' } })).map((d) => this.drawView(d));
    });
  }

  private async drawFor(tx: Tx, c: CompanyContext, v: Viewer, id: string) {
    const ids = await entitiesFor(tx, c, v, 'payroll.ewa.manage');
    await payScope(tx, ids);
    await tx.$queryRaw`SELECT id FROM ewa_draws WHERE organization_id = ${c.organizationId}::uuid AND id = ${id}::uuid FOR UPDATE`;
    const d = await tx.ewaDraw.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!d || !ids.includes(d.legalEntityId)) throw new NotFoundException('Not found');
    if (d.status !== 'requested') throw new ConflictException('This draw is already settled.');
    return d;
  }

  /** Payroll paid the draw to the person's salary account: the draw (and their fee) is recovered in the month's payroll. */
  async paid(ctx: TenantContext, user: ScopeUser, id: string, reference: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const d = await this.drawFor(tx, c, v, id);
      const own = await tx.$queryRaw<{ ids: string[] }[]>`SELECT app_current_employee_ids()::text[] AS ids`;
      if ((own[0]?.ids ?? []).includes(d.employeeId)) throw new ForbiddenException('Someone else records the payment of your own draw.');
      const recover = d.amount.add(d.feePayer === 'employee' ? d.fee : 0);
      const month = dateOf(d.month).slice(0, 7);
      const r = await this.intake.oneTime(tx, c, { source: 'ewa', sourceRef: `ewa:${d.id}`, employeeId: d.employeeId, componentCode: 'ewa_recovery', amount: recover.toFixed(2), month, reason: `Earned wage access drawn on ${dateOf(d.createdAt)}${d.feePayer === 'employee' && d.fee.gt(0) ? `, with the ₹${d.fee.toFixed(2)} fee` : ''}.`, by: v.userId! });
      const row = await tx.ewaDraw.update({ where: { id: d.id }, data: { status: 'paid', paidRef: reference, paidBy: v.userId!, paidAt: new Date(), recoveryRef: r.id } });
      await audit(tx, c, 'payroll.ewa.paid', 'ewa_draw', d.id, { reference, amount: d.amount.toFixed(2), recovery: recover.toFixed(2), month });
      return this.drawView(row);
    });
  }

  async failed(ctx: TenantContext, user: ScopeUser, id: string, reason: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const d = await this.drawFor(tx, c, v, id);
      const row = await tx.ewaDraw.update({ where: { id: d.id }, data: { status: 'failed', failureReason: reason } });
      await audit(tx, c, 'payroll.ewa.failed', 'ewa_draw', d.id, { reason });
      return this.drawView(row);
    });
  }

  // ------------------------------------------------------------------------------------------ the person's side

  /** The person's employment today, its policy and what they may draw now (or why not). */
  private async mine(tx: Tx, c: CompanyContext) {
    const org = c.organizationId;
    const today = todayIst();
    const month = today.slice(0, 7);
    const [{ ids }] = await tx.$queryRaw<{ ids: string[] }[]>`SELECT app_current_employee_ids()::text[] AS ids`;
    const em = await tx.employment.findFirst({ where: { organizationId: org, employeeId: { in: ids ?? [] }, joinedOn: { lte: asDate(today) }, OR: [{ exitedOn: null }, { exitedOn: { gte: asDate(today) } }] }, orderBy: { joinedOn: 'desc' } });
    if (!em) return { em: null, policy: null, reasons: ['You have no current employment.'], quote: null, month };
    const policy = await withPayScope(tx, [em.legalEntityId], () => tx.ewaPolicy.findFirst({ where: { organizationId: org, legalEntityId: em.legalEntityId, validFrom: { lte: asDate(today) } }, orderBy: { validFrom: 'desc' } }));
    const reasons: string[] = [];
    if (!policy?.enabled) return { em, policy: null, reasons: ['Earned wage access is not on in your company.'], quote: null, month };
    const confirmed = await tx.employmentStatusPeriod.findFirst({ where: { organizationId: org, employmentId: em.id, supersededAt: null, status: 'confirmed', validFrom: { lte: asDate(today) }, OR: [{ validTo: null }, { validTo: { gte: asDate(today) } }] } });
    if (!confirmed) reasons.push('It is open to confirmed employees.');
    const notice = await tx.exitCase.findFirst({ where: { organizationId: org, employmentId: em.id, status: { in: ['submitted', 'accepted', 'cleared'] } } }).catch(() => null);
    if (notice) reasons.push('It is not open while you are serving notice.');
    if (await tx.payrollWithhold.findFirst({ where: { organizationId: org, employmentId: em.id, releasedAt: null } })) reasons.push('Your salary is on hold.');
    const membership = await withPayScope(tx, [em.legalEntityId], () => tx.payGroupMember.findFirst({ where: { organizationId: org, employmentId: em.id, validFrom: { lte: asDate(today) }, OR: [{ validTo: null }, { validTo: { gte: asDate(today) } }] } }));
    const group = membership ? await withPayScope(tx, [em.legalEntityId], () => tx.payGroup.findFirst({ where: { organizationId: org, id: membership.payGroupId } })) : null;
    const day = Number(today.slice(8));
    if (group && day >= group.cutOffDay - policy.blackoutDays) reasons.push(`Draws close ${policy.blackoutDays} days before the payroll cut-off on the ${group.cutOffDay}th.`);
    const drawn = await tx.ewaDraw.findMany({ where: { organizationId: org, employmentId: em.id, month: asDate(`${month}-01`), status: { in: LIVE } } });
    if (drawn.length >= policy.drawsPerMonth) reasons.push(`You have used the ${policy.drawsPerMonth} draws of this month.`);
    const last = await tx.payslip.findFirst({ where: { organizationId: org, employmentId: em.id, runType: 'regular', status: 'approved' }, orderBy: { periodStart: 'desc' } });
    if (!last) reasons.push('It opens after your first payslip.');
    const lop = await tx.lopInput.findFirst({ where: { organizationId: org, employmentId: em.id, periodStart: asDate(`${month}-01`) } });
    const loans = await tx.loan.findMany({ where: { organizationId: org, employmentId: em.id, status: 'active', outstanding: { gt: 0 }, firstMonth: { lte: asDate(`${month}-01`) } } });
    const deductionsDue = loans.reduce((t, l) => t.add(Prisma.Decimal.min(l.emi, l.outstanding)), ZERO);
    const drawnTotal = drawn.reduce((t, d) => t.add(d.amount).add(d.feePayer === 'employee' ? d.fee : 0), ZERO);
    const monthDays = Number(monthRange(month).to.slice(8));
    const payableDays = Prisma.Decimal.max(ZERO, D(day).sub(lop?.lopDays ?? 0));
    const inputs = { expectedNet: last?.net.toFixed(2) ?? '0', monthDays, payableDays: payableDays.toFixed(2), drawn: drawnTotal.toFixed(2), deductionsDue: deductionsDue.toFixed(2), percent: policy.percentAvailable.toString(), max: policy.maxAmount.toString() };
    const q = ewaAvailable(inputs);
    return { em, policy, reasons, quote: { ...inputs, earned: q.earned.toFixed(2), available: q.available.toFixed(2) }, month };
  }

  async me(ctx: TenantContext, user: ScopeUser) {
    await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const m = await this.mine(tx, c);
      const draws = m.em ? await tx.ewaDraw.findMany({ where: { organizationId: c.organizationId, employmentId: m.em.id }, orderBy: { createdAt: 'desc' }, take: 24 }) : [];
      return {
        open: !!m.policy && !m.reasons.length && D(m.quote?.available ?? 0).gte(m.policy.minAmount),
        reasons: m.reasons,
        policy: m.policy ? { minAmount: m.policy.minAmount.toFixed(2), maxAmount: m.policy.maxAmount.toFixed(2), fee: m.policy.fee.toFixed(2), feePayer: m.policy.feePayer, drawsPerMonth: m.policy.drawsPerMonth } : null,
        quote: m.quote,
        draws: draws.map((d) => this.drawView(d)),
      };
    });
  }

  /** A draw for the person themself, within what is available now; the disclosure must be accepted. */
  async request(ctx: TenantContext, user: ScopeUser, dto: EwaDrawDto) {
    await this.viewer(user);
    if (!dto.acceptDisclosure) throw new BadRequestException('Read and accept the amount, the fee and how it is recovered.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      // Two draws at once never both use the same earnings: the person's draws are serialised, then worked out again.
      const first = await this.mine(tx, c);
      if (first.em) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ewa:${first.em.id}`}))`;
      const m = first.em ? await this.mine(tx, c) : first;
      if (!m.em || !m.policy || !m.quote) throw new ConflictException(m.reasons[0] ?? 'Earned wage access is not open to you.');
      if (m.reasons.length) throw new ConflictException(m.reasons.join(' '));
      if (D(dto.amount).lt(m.policy.minAmount)) throw new BadRequestException(`A draw is at least ₹${m.policy.minAmount.toFixed(2)}.`);
      if (D(dto.amount).gt(m.quote.available)) throw new BadRequestException(`You can draw up to ₹${m.quote.available} now.`);
      const d = await tx.ewaDraw.create({ data: { organizationId: c.organizationId, legalEntityId: m.em.legalEntityId, employeeId: m.em.employeeId, employmentId: m.em.id, policyId: m.policy.id, month: asDate(`${m.month}-01`), earned: m.quote as unknown as Prisma.InputJsonValue, available: D(m.quote.available), amount: D(dto.amount), fee: m.policy.fee, feePayer: m.policy.feePayer, disclosureAcceptedAt: new Date() } });
      await audit(tx, c, 'payroll.ewa.requested', 'ewa_draw', d.id, { amount: dto.amount, available: m.quote.available, fee: m.policy.fee.toFixed(2) });
      return this.drawView(d);
    });
  }
}
