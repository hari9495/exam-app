import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CompanyContext, Tx, audit } from '../org-structure/org-structure.service';
import { asDate, monthRange } from '../time/time-core';
import { loanEmi } from './inputs.service';
import { withPayScope } from './pay-access';
import { MODULE_COMPONENTS, STARTER_COMPONENTS } from './starter';
import { taxYearOf } from './tax';

// What other modules hand to payroll (M05 §22.1, M06 PM7). These are server-side hooks, not routes: the calling module has
// already checked its own keys and approvals (an approved expense claim, an applied compensation cycle), and calls them
// inside its own company transaction. Each write is kept once per source and reference, so a retry never pays twice.
//   oneTime      an approved one-time pay for a pay month: M05 reimbursements (exp_reimb, exp_taxable), M06 bonuses
//                (perf_bonus); the component is installed if the company does not have it yet.
//   paidOutside  taxable salary paid outside payroll (M05 taxable amounts paid by transfer): counted in the tax projection.
//   expenseLoan  an overdue expense advance recovered from salary as an interest-free, non-perquisite 'expense' loan.

const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Which components each module may pay. */
export const MODULE_SOURCES = {
  m05: ['exp_reimb', 'exp_taxable'],
  m06: ['perf_bonus'],
  // Batch 5i: approved special-pay postings (SpecialPayService).
  piece: ['piece_pay', 'min_wage_topup'],
  incentive: ['incentive', 'incentive_clawback'],
  tips: ['tips'],
  oncall: ['standby_allowance', 'callout_pay'],
  union: ['union_dues'],
  settle: ['settlement_arrears'],
  layoff: ['layoff_comp'],
  vrs: ['vrs_exempt', 'vrs_taxable'],
  // Earned wage access recovered in the month's payroll (EwaService).
  ewa: ['ewa_recovery'],
} as const;
export type ModuleSource = keyof typeof MODULE_SOURCES;

@Injectable()
export class PayrollIntakeService {
  /** The person's employment on a day (the one that pays them then). */
  private async employmentOn(tx: Tx, org: string, employeeId: string, from: string, to: string) {
    const e = await tx.employment.findFirst({
      where: { organizationId: org, employeeId, joinedOn: { lte: asDate(to) }, OR: [{ exitedOn: null }, { exitedOn: { gte: asDate(from) } }] },
      orderBy: { joinedOn: 'desc' },
    });
    if (!e) throw new NotFoundException('This person has no employment then.');
    return e;
  }

  private async notLocked(tx: Tx, org: string, entityId: string, month: string) {
    const p = await tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId: entityId, payGroupId: null, periodStart: asDate(`${month}-01`) } });
    if (p && (p.stage === 'locked' || p.stage === 'filed')) throw new ConflictException({ statusCode: 409, code: 'PERIOD_LOCKED', message: `${month} is locked: choose a later pay month.` });
  }

  async oneTime(tx: Tx, c: CompanyContext, x: { source: ModuleSource; sourceRef: string; employeeId: string; componentCode: string; amount: string; month: string; reason: string; by: string }) {
    const allowed: readonly string[] = MODULE_SOURCES[x.source] ?? [];
    if (!allowed.includes(x.componentCode)) throw new BadRequestException(`${x.source} pays only ${allowed.join(', ')}.`);
    if (!MONEY.test(x.amount) || D(x.amount).lte(0)) throw new BadRequestException('A one-time pay is an amount above zero.');
    if (!MONTH.test(x.month)) throw new BadRequestException('The pay month is YYYY-MM.');
    if (!x.sourceRef || x.sourceRef.length > 80) throw new BadRequestException('Give the reference of what is paid (up to 80 characters).');
    const org = c.organizationId;
    const e = await this.employmentOn(tx, org, x.employeeId, `${x.month}-01`, monthRange(x.month).to);
    return withPayScope(tx, [e.legalEntityId], async () => {
      const kept = await tx.oneTimePay.findFirst({ where: { organizationId: org, source: x.source, sourceRef: x.sourceRef, status: { not: 'cancelled' } } });
      if (kept) return { id: kept.id, status: kept.status, existing: true };
      await this.notLocked(tx, org, e.legalEntityId, x.month);
      const starter = [...MODULE_COMPONENTS, ...STARTER_COMPONENTS].find((m) => m.code === x.componentCode)!;
      await tx.payComponent.createMany({ data: [{ organizationId: org, ...starter, taxable: starter.taxable ?? true, statutory: null, createdBy: null }], skipDuplicates: true });
      const comp = await tx.payComponent.findFirst({ where: { organizationId: org, code: x.componentCode, status: 'active' } });
      if (!comp) throw new ConflictException(`The ${x.componentCode} component is switched off in this company.`);
      const row = await tx.oneTimePay.create({
        data: { organizationId: org, legalEntityId: e.legalEntityId, employeeId: x.employeeId, employmentId: e.id, componentCode: comp.code, amount: x.amount, periodStart: asDate(`${x.month}-01`), reason: x.reason.slice(0, 300), status: 'approved', source: x.source, sourceRef: x.sourceRef, createdBy: x.by },
      });
      await audit(tx, c, 'payroll.one_time.added', 'one_time_pay', row.id, { employeeId: x.employeeId, componentCode: comp.code, month: x.month, source: x.source, sourceRef: x.sourceRef });
      return { id: row.id, status: row.status, existing: false };
    });
  }

  /** Takes back a module's one-time pay that no run has paid yet (a claim re-routed or withdrawn). */
  async cancelOneTime(tx: Tx, c: CompanyContext, x: { source: ModuleSource; sourceRef: string }) {
    const org = c.organizationId;
    const entities = (await tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true } })).map((l) => l.id);
    return withPayScope(tx, entities, async () => {
      const row = await tx.oneTimePay.findFirst({ where: { organizationId: org, source: x.source, sourceRef: x.sourceRef, status: { not: 'cancelled' } } });
      if (!row) return { cancelled: false };
      if (row.runId) throw new ConflictException('A payroll run already has this pay; it is recovered or corrected in payroll.');
      await tx.oneTimePay.update({ where: { id: row.id }, data: { status: 'cancelled' } });
      await audit(tx, c, 'payroll.one_time.cancelled', 'one_time_pay', row.id, { source: x.source, sourceRef: x.sourceRef });
      return { cancelled: true };
    });
  }

  async paidOutside(tx: Tx, c: CompanyContext, x: { sourceRef: string; employeeId: string; amount: string; paidOn: string; by: string }) {
    if (!MONEY.test(x.amount) || D(x.amount).lte(0)) throw new BadRequestException('The amount paid is above zero.');
    if (!DAY.test(x.paidOn)) throw new BadRequestException('The day paid is YYYY-MM-DD.');
    if (!x.sourceRef || x.sourceRef.length > 80) throw new BadRequestException('Give the reference of what was paid (up to 80 characters).');
    const org = c.organizationId;
    const e = await this.employmentOn(tx, org, x.employeeId, x.paidOn, x.paidOn);
    return withPayScope(tx, [e.legalEntityId], async () => {
      const kept = await tx.taxPaidOutside.findFirst({ where: { organizationId: org, source: 'm05', sourceRef: x.sourceRef } });
      if (kept) return { id: kept.id, taxYear: kept.taxYear, existing: true };
      const taxYear = taxYearOf(x.paidOn.slice(0, 7));
      const row = await tx.taxPaidOutside.create({ data: { organizationId: org, legalEntityId: e.legalEntityId, employeeId: x.employeeId, employmentId: e.id, taxYear, amount: x.amount, paidOn: asDate(x.paidOn), source: 'm05', sourceRef: x.sourceRef, enteredBy: x.by } });
      await audit(tx, c, 'tax.paid_outside.recorded', 'tax_paid_outside', row.id, { employeeId: x.employeeId, taxYear, sourceRef: x.sourceRef });
      return { id: row.id, taxYear, existing: false };
    });
  }

  async expenseLoan(tx: Tx, c: CompanyContext, x: { sourceRef: string; employeeId: string; amount: string; instalments: number; firstMonth: string; reason: string; by: string }) {
    if (!MONEY.test(x.amount) || D(x.amount).lte(0)) throw new BadRequestException('The amount to recover is above zero.');
    if (!Number.isInteger(x.instalments) || x.instalments < 1 || x.instalments > 120) throw new BadRequestException('Instalments are 1 to 120.');
    if (!MONTH.test(x.firstMonth)) throw new BadRequestException('The first month is YYYY-MM.');
    if (!x.sourceRef || x.sourceRef.length > 80) throw new BadRequestException('Give the advance it recovers (up to 80 characters).');
    const org = c.organizationId;
    const e = await this.employmentOn(tx, org, x.employeeId, `${x.firstMonth}-01`, monthRange(x.firstMonth).to);
    return withPayScope(tx, [e.legalEntityId], async () => {
      const kept = await tx.loan.findFirst({ where: { organizationId: org, sourceRef: x.sourceRef } });
      if (kept) return { id: kept.id, emi: kept.emi.toFixed(2), existing: true };
      const principal = D(x.amount);
      const emi = loanEmi(principal, D(0), x.instalments);
      const row = await tx.loan.create({
        data: { organizationId: org, legalEntityId: e.legalEntityId, employeeId: x.employeeId, employmentId: e.id, loanType: 'expense', principal, interestRate: 0, emi, firstMonth: asDate(`${x.firstMonth}-01`), outstanding: principal, perquisite: false, reason: x.reason.slice(0, 300), status: 'active', sourceRef: x.sourceRef, requestedBy: x.by },
      });
      await audit(tx, c, 'payroll.loan.expense_recovery', 'loan', row.id, { employeeId: x.employeeId, instalments: x.instalments, sourceRef: x.sourceRef });
      return { id: row.id, emi: emi.toFixed(2), existing: false };
    });
  }
}
