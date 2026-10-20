import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { ScopeUser, Viewer, buildViewer, tenantWide } from '../access/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { AutomationService } from '../rules-engine/automation.service';
import { StatutoryRulesService } from '../statutory/statutory.service';
import { inForce } from '../statutory/evaluator';
import { writeBankFile, type BankLayout, type BankRow } from '../statutory/bank-format';
import { PayrollIntakeService } from '../payroll/intake.service';
import { withPayScope } from '../payroll/pay-access';
import { buildExpenseJournal, journalCsv, type ExpenseMapping, type JournalInput } from './journal';

// Expenses batch E3 (M05-BUILD-DESIGN §10 – §12; XP-3.03 … XP-3.07): paying approved claims.
//   route        at approval: a bank transfer above expense.route.payout_above, else expense.route.default; a legal entity
//                with no payroll in YukthiX (no pay group) always pays by transfer. Finance can move an unpaid claim either way.
//   payroll      one-time pay rows through the payroll hooks: the exempt part as exp_reimb, the taxable part as exp_taxable
//                (the advance used comes off the exempt part first), in the month before expense.payroll_cutoff_day, else
//                the next open month. Paid on payroll.run.paid; a failed salary payment marks it failed (payroll pays it
//                again with the salary, and the hourly check marks it paid then).
//   payout       a bank file per legal entity made by finance and released by someone else (step-up, typed phrase); the
//                hash, rows and total are checked again. Results mark each claim paid or failed; a taxable part paid this
//                way is reported to payroll as taxable pay outside payroll (TDS).
//   events       payroll.run.paid / .voided, payment.failed and recovery.deferred are handled once each.
//   journal      a legal entity's month through ledger mapping; unmapped or unbalanced blocks the export.
//   who          expense.payout.manage, company-wide or for the legal entity; never one's own claim.

const KEYS = ['expense.payout.manage'] as const;
const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const nextMonth = (m: string) => {
  const d = asDate(`${m}-01`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return iso(d).slice(0, 7);
};
/** The system user writing payroll rows for a module (as F&F does). */
const SYSTEM_USER = '00000000-0000-0000-0000-000000000000';
const OPEN: readonly string[] = ['approved_unpaid', 'payment_failed'];

type Claim = Prisma.ExpenseClaimGetPayload<object>;

@Injectable()
export class ExpensePaymentsService implements OnModuleInit {
  private readonly logger = new Logger(ExpensePaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly intake: PayrollIntakeService,
    private readonly rules: StatutoryRulesService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly notifications: NotificationsService,
    private readonly automation: AutomationService,
  ) {}

  onModuleInit() {
    this.automation.subscribe((ev) => this.onEvent(ev));
  }

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, [...KEYS]);
  }

  // ------------------------------------------------------------------------------------------ access

  /** The legal entities whose claims the viewer pays (expense.payout.manage); never while acting for someone else. */
  private async entities(tx: Tx, org: string, v: Viewer): Promise<string[]> {
    if (v.actingForOther || !v.grants.has('expense.payout.manage')) return [];
    if (tenantWide(v, 'expense.payout.manage')) return (await tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true } })).map((e) => e.id);
    return (v.scopes.get('expense.payout.manage') ?? []).filter((s) => s.type === 'legal_entity' && s.id).map((s) => s.id as string);
  }

  private async requirePayer(tx: Tx, org: string, v: Viewer) {
    const ids = await this.entities(tx, org, v);
    if (!ids.length) throw new ForbiddenException('Paying expense claims needs expense.payout.manage.');
    const me = v.userId ? await tx.employee.findFirst({ where: { organizationId: org, userId: v.userId }, select: { id: true } }) : null;
    return { ids, me: me?.id ?? null };
  }

  /** Claims the viewer may pay: in their entities, not their own. Anything else is "not found". */
  private async claimsToPay(tx: Tx, org: string, v: Viewer, claimIds: string[]) {
    const { ids, me } = await this.requirePayer(tx, org, v);
    const claims = await tx.expenseClaim.findMany({ where: { organizationId: org, id: { in: claimIds } } });
    if (claims.length !== new Set(claimIds).size || claims.some((c) => !ids.includes(c.legalEntityId))) throw new NotFoundException('Not found');
    if (me && claims.some((c) => c.employeeId === me)) throw new ForbiddenException('Someone else pays your own claim.');
    return claims;
  }

  private async tell(org: string, employeeId: string, text: string, claimId: string) {
    const u = await this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, (tx) => tx.employee.findFirst({ where: { organizationId: org, id: employeeId }, select: { userId: true } }));
    if (!u?.userId) return;
    await this.notifications
      .notifySystem({ organizationId: org, isSuperAdmin: false }, [u.userId], 'expense.payment.update', { entityType: 'expense_claim', entityId: claimId, contextText: text, linkPath: `/yx/expenses/claims/${claimId}` }, { subject: 'Expenses: a payment update', html: '<p>There is news about the payment of your expense claim in YukthiX.</p>' })
      .catch(() => undefined);
  }

  // ------------------------------------------------------------------------------------------ route and payroll hand-off

  /** At approval (in the decision's transaction): choose the route and, for payroll, hand the claim to the next payroll. */
  async onApproved(tx: Tx, c: CompanyContext, claimId: string) {
    const claim = await tx.expenseClaim.findFirstOrThrow({ where: { organizationId: c.organizationId, id: claimId } });
    if (claim.paymentStatus !== 'approved_unpaid') return;
    const lev = { legalEntityId: claim.legalEntityId };
    const above = await settingFor(tx, c, 'expense.route.payout_above', lev);
    const byDefault = await settingFor(tx, c, 'expense.route.default', lev);
    const payroll = (await tx.payGroup.count({ where: { organizationId: c.organizationId, legalEntityId: claim.legalEntityId } })) > 0;
    const route = !payroll || byDefault === 'payout' || (above !== 'off' && D(claim.netPayable ?? 0).gt(above)) ? 'payout' : 'payroll';
    if (route === 'payroll' && (await this.toPayroll(tx, c, claim, null))) return;
    await tx.expenseClaim.update({ where: { id: claim.id }, data: { route: 'payout', version: { increment: 1 } } });
  }

  /** The month the claim is paid in: this month before the cut-off day, else the next; a locked month is skipped. */
  private async payMonth(tx: Tx, c: CompanyContext, claim: Claim) {
    const today = todayIst();
    const cutoff = Number(await settingFor(tx, c, 'expense.payroll_cutoff_day', { legalEntityId: claim.legalEntityId }));
    let month = Number(today.slice(8)) <= cutoff ? today.slice(0, 7) : nextMonth(today.slice(0, 7));
    for (let i = 0; i < 3; i++) {
      const p = await tx.payPeriod.findFirst({ where: { organizationId: c.organizationId, legalEntityId: claim.legalEntityId, payGroupId: null, periodStart: asDate(`${month}-01`) } });
      if (!p || !['locked', 'filed'].includes(p.stage)) return month;
      month = nextMonth(month);
    }
    return null;
  }

  /**
   * One-time pay rows for the claim's net payable: the exempt part (exp_reimb) and the taxable part (exp_taxable); what
   * an advance covered comes off the exempt part first. Returns false when payroll cannot take it (no employment then,
   * every month locked), so the claim waits for a bank transfer instead.
   */
  private async toPayroll(tx: Tx, c: CompanyContext, claim: Claim, by: string | null) {
    const org = c.organizationId;
    const net = D(claim.netPayable ?? 0);
    if (net.lte(0)) return false;
    const month = await this.payMonth(tx, c, claim);
    if (!month) return false;
    const employed = await tx.employment.findFirst({ where: { organizationId: org, employeeId: claim.employeeId, joinedOn: { lte: asDate(`${month}-28`) }, OR: [{ exitedOn: null }, { exitedOn: { gte: asDate(`${month}-01`) } }] }, select: { id: true } });
    if (!employed) return false;
    const lines = await tx.expenseLine.findMany({ where: { organizationId: org, claimId: claim.id, removedAt: null, payMode: { not: 'company_paid' } }, select: { taxableAmount: true } });
    const exemptTotal = D(claim.approvedTotal ?? 0).sub(lines.reduce((t, l) => t.add(l.taxableAmount), D(0)));
    const exempt = Prisma.Decimal.max(D(0), Prisma.Decimal.min(net, exemptTotal.sub(claim.advanceAdjusted)));
    const taxable = net.sub(exempt);
    const ids: string[] = [];
    const reason = `Expense claim: ${claim.title}`.slice(0, 300);
    for (const [part, code, amount] of [['r', 'exp_reimb', exempt], ['t', 'exp_taxable', taxable]] as const) {
      if (amount.lte(0)) continue;
      const row = await this.intake.oneTime(tx, c, { source: 'm05', sourceRef: `${claim.id}:${part}`, employeeId: claim.employeeId, componentCode: code, amount: amount.toFixed(2), month, reason, by: by ?? SYSTEM_USER });
      ids.push(row.id);
    }
    await tx.expensePayment.create({ data: { organizationId: org, claimId: claim.id, legalEntityId: claim.legalEntityId, employeeId: claim.employeeId, route: 'payroll', payMonth: asDate(`${month}-01`), oneTimePayIds: ids, amount: net, taxableAmount: taxable, status: 'queued', createdBy: by } });
    await tx.expenseClaim.update({ where: { id: claim.id }, data: { route: 'payroll', paymentStatus: 'in_payroll', version: { increment: 1 } } });
    await audit(tx, c, 'expense.claim.to_payroll', 'expense_claim', claim.id, { month, exempt: exempt.toFixed(2), taxable: taxable.toFixed(2) });
    return true;
  }

  /** Finance moves unpaid claims to the next payroll (from the To pay screen). */
  async routeToPayroll(ctx: TenantContext, user: ScopeUser, claimIds: string[]) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const claims = await this.claimsToPay(tx, c.organizationId, v, claimIds);
      const refused: { claimId: string; reason: string }[] = [];
      for (const claim of claims) {
        if (!OPEN.includes(claim.paymentStatus) || (claim.paymentStatus === 'payment_failed' && claim.route === 'payroll')) {
          refused.push({ claimId: claim.id, reason: claim.paymentStatus === 'payment_failed' ? 'Payroll pays a failed salary payment again with the salary.' : 'This claim is not waiting to be paid.' });
          continue;
        }
        if (!(await this.toPayroll(tx, c, claim, v.userId))) refused.push({ claimId: claim.id, reason: 'Payroll cannot take this claim (no employment then, or the months are locked). Pay it by bank transfer.' });
      }
      return { moved: claims.length - refused.length, refused };
    });
  }

  // ------------------------------------------------------------------------------------------ To pay (EXP-06)

  async toPay(ctx: TenantContext, user: ScopeUser, entityId?: string | null) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const payer = await this.requirePayer(tx, org, v);
      const { me } = payer;
      const ids = payer.ids.filter((id) => !entityId || id === entityId);
      // Paid claims stay on the list for a year.
      const since = new Date(Date.now() - 365 * 86_400_000);
      const claims = await tx.expenseClaim.findMany({
        where: { organizationId: org, legalEntityId: { in: ids }, OR: [{ paymentStatus: { in: ['approved_unpaid', 'in_payroll', 'payout_queued', 'payment_failed'] } }, { paymentStatus: 'paid', paidAt: { gte: since } }], ...(me ? { employeeId: { not: me } } : {}) },
        orderBy: { decidedAt: 'asc' },
        take: 1000,
      });
      const payments = await tx.expensePayment.findMany({ where: { organizationId: org, claimId: { in: claims.map((x) => x.id) } }, orderBy: { createdAt: 'desc' } });
      const people = await tx.employee.findMany({ where: { organizationId: org, id: { in: [...new Set(claims.map((x) => x.employeeId))] } }, select: { id: true, givenName: true, familyName: true } });
      const name = new Map(people.map((p) => [p.id, [p.givenName, p.familyName].filter(Boolean).join(' ')]));
      const entities = await tx.legalEntity.findMany({ where: { organizationId: org, id: { in: ids } }, select: { id: true, name: true } });
      const batches = await tx.expensePayoutBatch.findMany({ where: { organizationId: org, legalEntityId: { in: ids } }, orderBy: { createdAt: 'desc' }, take: 50 });
      return {
        entities,
        claims: claims.map((x) => {
          const p = payments.find((y) => y.claimId === x.id);
          return {
            id: x.id,
            employeeId: x.employeeId,
            employeeName: name.get(x.employeeId) ?? '',
            legalEntityId: x.legalEntityId,
            title: x.title,
            approvedTotal: (x.approvedTotal ?? D(0)).toFixed(2),
            advanceAdjusted: x.advanceAdjusted.toFixed(2),
            netPayable: (x.netPayable ?? D(0)).toFixed(2),
            route: x.route,
            paymentStatus: x.paymentStatus,
            payMonth: p?.payMonth ? iso(p.payMonth).slice(0, 7) : null,
            ref: p?.ref ?? null,
            reason: p?.status === 'failed' || p?.status === 'returned' ? p.reason : null,
            batchId: p?.payoutBatchId ?? null,
            paidOn: p?.paidOn ? iso(p.paidOn) : null,
          };
        }),
        batches: batches.map((b) => ({ id: b.id, legalEntityId: b.legalEntityId, rows: b.rowCount, total: b.total.toFixed(2), status: b.status, sha256: b.sha256, madeByMe: b.generatedBy === v.userId, createdAt: b.createdAt, releasedAt: b.releasedAt })),
      };
    });
  }

  /**
   * Home (PLT-02 finance): what To pay holds for this person, as totals: claims approved and not paid yet (never their
   * own), and bank files made and not released. Null without expense.payout.manage (or while acting for someone else).
   */
  async homeSummary(ctx: TenantContext, user: ScopeUser, entityId?: string | null) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const all = await this.entities(tx, org, v);
      if (!all.length) return null;
      const ids = all.filter((id) => !entityId || id === entityId);
      const me = v.userId ? await tx.employee.findFirst({ where: { organizationId: org, userId: v.userId }, select: { id: true } }) : null;
      const open = await tx.expenseClaim.aggregate({
        where: { organizationId: org, legalEntityId: { in: ids }, paymentStatus: { in: [...OPEN] }, ...(me ? { employeeId: { not: me.id } } : {}) },
        _count: true,
        _sum: { netPayable: true },
      });
      const batches = await tx.expensePayoutBatch.findMany({ where: { organizationId: org, legalEntityId: { in: ids }, status: 'draft' }, orderBy: { createdAt: 'asc' }, take: 20 });
      const makers = await tx.user.findMany({ where: { organizationId: org, id: { in: batches.map((b) => b.generatedBy) } }, select: { id: true, name: true, email: true } });
      return {
        count: open._count,
        amount: (open._sum.netPayable ?? D(0)).toFixed(2),
        batches: batches.map((b) => {
          const m = makers.find((u) => u.id === b.generatedBy);
          // createBatch names the file after its pay date.
          const payOn = /expenses-(\d{4}-\d{2}-\d{2})\./.exec(b.fileName)?.[1] ?? iso(b.createdAt);
          return { id: b.id, rows: b.rowCount, total: b.total.toFixed(2), payOn, madeBy: m?.name || m?.email || '', madeByMe: b.generatedBy === v.userId };
        }),
      };
    });
  }

  // ------------------------------------------------------------------------------------------ direct payout (§10.3)

  private open(org: string, employeeId: string, blob: string) {
    const prefix = `${org}:${employeeId}:`;
    const plain = this.crypto.decrypt(blob);
    if (!plain.startsWith(prefix)) throw new ConflictException('A stored bank account does not belong to its employee.');
    return plain.slice(prefix.length);
  }

  /** A bank file for the chosen claims of one legal entity (the reimbursement account, else the salary account). */
  async createBatch(ctx: TenantContext, user: ScopeUser, dto: { claimIds: string[]; debitAccount: string; payDate?: string }) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const claims = await this.claimsToPay(tx, org, v, dto.claimIds);
      const entity = claims[0].legalEntityId;
      if (claims.some((x) => x.legalEntityId !== entity)) throw new BadRequestException('A bank file pays the claims of one legal entity.');
      const stale = claims.filter((x) => !OPEN.includes(x.paymentStatus));
      if (stale.length) throw new ConflictException('Only claims waiting to be paid go in a bank file.');
      const payDate = dto.payDate ?? todayIst();
      const fmt = inForce(await this.rules.published(), 'IN.BANKFMT', ['GENERIC'], payDate);
      if (!fmt) throw new ConflictException(`No published bank format "GENERIC" is in force on ${payDate}.`);
      const accounts = await tx.employeeBankAccount.findMany({ where: { organizationId: org, employeeId: { in: claims.map((x) => x.employeeId) }, purpose: { in: ['reimbursement', 'salary'] }, validTo: null } });
      const codes = await tx.employment.findMany({ where: { organizationId: org, id: { in: claims.map((x) => x.employmentId) } }, select: { id: true, employeeCode: true } });
      const now = new Date();
      const rows: (BankRow & { claim: Claim })[] = [];
      const excluded: { claimId: string; reason: string }[] = [];
      for (const claim of claims) {
        const a = accounts.find((x) => x.employeeId === claim.employeeId && x.purpose === 'reimbursement') ?? accounts.find((x) => x.employeeId === claim.employeeId && x.purpose === 'salary');
        if (!a) excluded.push({ claimId: claim.id, reason: 'No reimbursement or salary bank account.' });
        else if (a.usableFrom > now) excluded.push({ claimId: claim.id, reason: `A new bank account is in its cooling period until ${a.usableFrom.toISOString()}.` });
        else {
          const code = codes.find((e) => e.id === claim.employmentId)?.employeeCode ?? '';
          rows.push({ claim, account: this.open(org, claim.employeeId, a.accountEnc), ifsc: a.ifsc, name: a.holderName, amount: (claim.netPayable ?? D(0)).toFixed(2), code, narration: `Expense claim ${code}` });
        }
      }
      if (!rows.length) throw new ConflictException({ statusCode: 409, message: 'None of these claims can be paid by bank yet.', excluded });
      let out: Awaited<ReturnType<typeof writeBankFile>>;
      try {
        out = await writeBankFile(fmt.values as unknown as BankLayout, rows, { debitAccount: dto.debitAccount, date: payDate });
      } catch (e) {
        throw new BadRequestException(`The bank file could not be written: ${(e as Error).message}`);
      }
      const total = rows.reduce((t, r) => t.add(r.amount), D(0));
      const batch = await tx.expensePayoutBatch.create({
        data: { organizationId: org, legalEntityId: entity, formatKey: 'GENERIC', formatVersion: fmt.version, fileName: `expenses-${payDate}.${out.ext}`, contentType: out.contentType, fileEnc: this.crypto.encrypt(out.data.toString('base64')), sha256: sha256(out.data), total, rowCount: rows.length, claimIds: rows.map((r) => r.claim.id), generatedBy: v.userId! },
      });
      for (const r of rows) {
        const taxable = await this.taxablePart(tx, org, r.claim);
        await tx.expensePayment.create({ data: { organizationId: org, claimId: r.claim.id, legalEntityId: entity, employeeId: r.claim.employeeId, route: 'payout', payoutBatchId: batch.id, amount: r.amount, taxableAmount: taxable, status: 'queued', createdBy: v.userId } });
        await tx.expenseClaim.update({ where: { id: r.claim.id }, data: { route: 'payout', paymentStatus: 'payout_queued', version: { increment: 1 } } });
      }
      await audit(tx, c, 'expense.payout.generated', 'expense_payout_batch', batch.id, { legalEntityId: entity, rows: rows.length, total: total.toFixed(2), sha256: batch.sha256, excluded: excluded.length });
      return { id: batch.id, rows: rows.length, total: total.toFixed(2), sha256: batch.sha256, phrase: `RELEASE ${rows.length}`, excluded };
    });
  }

  /** The taxable part of what is paid: the lines' taxable amounts, less what an advance covered beyond the exempt part. */
  private async taxablePart(tx: Tx, org: string, claim: Claim) {
    const lines = await tx.expenseLine.findMany({ where: { organizationId: org, claimId: claim.id, removedAt: null, payMode: { not: 'company_paid' } }, select: { taxableAmount: true } });
    const taxable = lines.reduce((t, l) => t.add(l.taxableAmount), D(0));
    const net = D(claim.netPayable ?? 0);
    const exempt = Prisma.Decimal.max(D(0), D(claim.approvedTotal ?? 0).sub(taxable).sub(claim.advanceAdjusted));
    return Prisma.Decimal.max(D(0), Prisma.Decimal.min(taxable, net.sub(Prisma.Decimal.min(net, exempt))));
  }

  private async batchFor(tx: Tx, org: string, v: Viewer, id: string) {
    const { ids, me } = await this.requirePayer(tx, org, v);
    const b = await tx.expensePayoutBatch.findFirst({ where: { organizationId: org, id } });
    if (!b || !ids.includes(b.legalEntityId)) throw new NotFoundException('Not found');
    return { b, me };
  }

  private bytesOf(b: Prisma.ExpensePayoutBatchGetPayload<object>) {
    const data = Buffer.from(this.crypto.decrypt(b.fileEnc), 'base64');
    if (sha256(data) !== b.sha256) throw new ConflictException('This bank file does not match the one that was made.');
    return data;
  }

  async batchFile(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { b } = await this.batchFor(tx, c.organizationId, v, id);
      const file = this.bytesOf(b);
      await audit(tx, c, 'expense.payout.downloaded', 'expense_payout_batch', b.id, { sha256: b.sha256 });
      return { file, name: b.fileName, contentType: b.contentType };
    });
  }

  /** Released by someone other than its maker (step-up by the route, typed phrase); the file, rows and total checked again. */
  async releaseBatch(ctx: TenantContext, user: ScopeUser, id: string, confirmation: { phrase: string }) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { b, me } = await this.batchFor(tx, org, v, id);
      await tx.$queryRaw`SELECT id FROM expense_payout_batches WHERE organization_id = ${org}::uuid AND id = ${b.id}::uuid FOR UPDATE`;
      if (b.generatedBy === v.userId) throw new ForbiddenException('You made this bank file, so someone else must release it.');
      if (b.status !== 'draft') throw new ConflictException(`This bank file is ${b.status}.`);
      const phrase = `RELEASE ${b.rowCount}`;
      if (confirmation.phrase !== phrase) throw new BadRequestException(`Type ${phrase} to confirm.`);
      this.bytesOf(b);
      const payments = await tx.expensePayment.findMany({ where: { organizationId: org, payoutBatchId: b.id, status: 'queued' } });
      const claims = await tx.expenseClaim.findMany({ where: { organizationId: org, id: { in: b.claimIds } } });
      const total = payments.reduce((t, p) => t.add(p.amount), D(0));
      if (payments.length !== b.rowCount || !total.eq(b.total) || claims.some((x) => x.paymentStatus !== 'payout_queued' || !D(x.netPayable ?? 0).eq(payments.find((p) => p.claimId === x.id)?.amount ?? -1)))
        throw new ConflictException('The claims changed after this file was made. Cancel it and make it again.');
      if (me && claims.some((x) => x.employeeId === me)) throw new ForbiddenException('This file pays you, so someone else must release it.');
      await tx.expensePayoutBatch.update({ where: { id: b.id }, data: { status: 'released', releasedBy: v.userId!, releasedAt: new Date() } });
      await tx.expensePayment.updateMany({ where: { organizationId: org, payoutBatchId: b.id, status: 'queued' }, data: { status: 'sent', updatedAt: new Date() } });
      await audit(tx, c, 'expense.payout.released', 'expense_payout_batch', b.id, { rows: b.rowCount, total: b.total.toFixed(2), sha256: b.sha256, phrase: confirmation.phrase });
      return { id: b.id, status: 'released' };
    });
  }

  /** A batch not released yet is cancelled: its claims wait to be paid again. */
  async cancelBatch(ctx: TenantContext, user: ScopeUser, id: string, reason: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { b } = await this.batchFor(tx, org, v, id);
      if (b.status !== 'draft') throw new ConflictException('A released bank file is settled by the bank results.');
      await tx.expensePayoutBatch.update({ where: { id: b.id }, data: { status: 'cancelled' } });
      await tx.expensePayment.updateMany({ where: { organizationId: org, payoutBatchId: b.id, status: 'queued' }, data: { status: 'cancelled', reason, updatedAt: new Date() } });
      await tx.expenseClaim.updateMany({ where: { organizationId: org, id: { in: b.claimIds }, paymentStatus: 'payout_queued' }, data: { paymentStatus: 'approved_unpaid' } });
      await audit(tx, c, 'expense.payout.cancelled', 'expense_payout_batch', b.id, { reason });
      return { id: b.id, status: 'cancelled' };
    });
  }

  /** The bank's results: paid, or failed / returned with the bank's reason. A paid taxable part is reported to payroll. */
  async results(ctx: TenantContext, user: ScopeUser, id: string, rows: { claimId: string; status: 'paid' | 'failed' | 'returned'; ref?: string; reason?: string }[]) {
    const v = await this.viewer(user);
    const tells: { employeeId: string; text: string; claimId: string }[] = [];
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { b } = await this.batchFor(tx, org, v, id);
      if (b.status !== 'released') throw new ConflictException(b.status === 'draft' ? 'Release the bank file first.' : `This bank file is ${b.status}.`);
      const today = todayIst();
      for (const r of rows) {
        const p = await tx.expensePayment.findFirst({ where: { organizationId: org, payoutBatchId: b.id, claimId: r.claimId, status: 'sent' } });
        if (!p) throw new BadRequestException(`Claim ${r.claimId} is not waiting for a result in this file.`);
        if (r.status !== 'paid' && !r.reason) throw new BadRequestException('Say why the payment did not go through.');
        if (r.status === 'paid') {
          await tx.expensePayment.update({ where: { id: p.id }, data: { status: 'paid', paidOn: asDate(today), ref: r.ref ?? null, updatedAt: new Date() } });
          await this.markPaid(tx, c, p.claimId, today, 'payout');
          if (p.taxableAmount.gt(0)) await this.intake.paidOutside(tx, c, { sourceRef: p.id, employeeId: p.employeeId, amount: p.taxableAmount.toFixed(2), paidOn: today, by: v.userId! });
          tells.push({ employeeId: p.employeeId, text: 'Your expense claim was paid to your bank account.', claimId: p.claimId });
        } else {
          await tx.expensePayment.update({ where: { id: p.id }, data: { status: r.status, ref: r.ref ?? null, reason: r.reason!.slice(0, 300), updatedAt: new Date() } });
          await tx.expenseClaim.update({ where: { id: p.claimId }, data: { paymentStatus: 'payment_failed', version: { increment: 1 } } });
          await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'payment.failed', payload: { kind: 'expense', claimId: p.claimId, employeeId: p.employeeId, status: r.status } } });
          tells.push({ employeeId: p.employeeId, text: 'The payment of your expense claim did not go through. Check your bank details; finance will pay it again.', claimId: p.claimId });
        }
      }
      const waiting = await tx.expensePayment.count({ where: { organizationId: org, payoutBatchId: b.id, status: 'sent' } });
      if (!waiting) await tx.expensePayoutBatch.update({ where: { id: b.id }, data: { status: 'confirmed' } });
      await audit(tx, c, 'expense.payout.results', 'expense_payout_batch', b.id, { paid: rows.filter((r) => r.status === 'paid').length, failed: rows.filter((r) => r.status !== 'paid').length });
      return { recorded: rows.length, batchStatus: waiting ? 'released' : 'confirmed' };
    });
    for (const t of tells) await this.tell(ctx.organizationId!, t.employeeId, t.text, t.claimId);
    return out;
  }

  private async markPaid(tx: Tx, c: CompanyContext, claimId: string, on: string, route: 'payroll' | 'payout') {
    const n = await tx.expenseClaim.updateMany({ where: { organizationId: c.organizationId, id: claimId, paymentStatus: { not: 'paid' } }, data: { paymentStatus: 'paid', paidAt: asDate(on), version: { increment: 1 } } });
    if (n.count) await tx.eventOutbox.create({ data: { organizationId: c.organizationId, eventType: 'expense.claim.paid', payload: { claimId, paidOn: on, route } } });
  }

  // ------------------------------------------------------------------------------------------ payroll events (§11.4)

  /** Each payroll event once (expense_event_receipts); payroll rows are read with the pay guard opened to the company. */
  async onEvent(ev: { id: string; organizationId: string; type: string; payload: Record<string, unknown> }) {
    if (!['payroll.run.paid', 'payroll.run.voided', 'payment.failed', 'recovery.deferred'].includes(ev.type)) return;
    if (ev.type === 'payment.failed' && ev.payload.kind !== 'payslip') return;
    const c: CompanyContext = { organizationId: ev.organizationId, isSuperAdmin: false, userId: null } as CompanyContext;
    const tells = await this.tenantPrisma.forTenant(
      c,
      async (tx) => {
        const fresh = await tx.expenseEventReceipt.createMany({ data: [{ eventId: ev.id, organizationId: ev.organizationId, eventType: ev.type }], skipDuplicates: true });
        if (!fresh.count) return [];
        const entities = (await tx.legalEntity.findMany({ where: { organizationId: ev.organizationId }, select: { id: true } })).map((e) => e.id);
        return withPayScope(tx, entities, () => this.handle(tx, c, ev));
      },
      { timeout: 60_000 },
    );
    for (const t of tells) await this.tell(ev.organizationId, t.employeeId, t.text, t.claimId);
  }

  private async handle(tx: Tx, c: CompanyContext, ev: { type: string; payload: Record<string, unknown> }) {
    const org = c.organizationId;
    const tells: { employeeId: string; text: string; claimId: string }[] = [];
    if (ev.type === 'payroll.run.paid') {
      const runId = String(ev.payload.runId);
      const paidOn = typeof ev.payload.paidOn === 'string' ? ev.payload.paidOn : todayIst();
      const slips = await tx.payslip.findMany({ where: { organizationId: org, runId, status: 'approved' }, select: { id: true, paymentStatus: true } });
      const lines = await tx.payslipLine.findMany({ where: { organizationId: org, payslipId: { in: slips.map((s) => s.id) }, componentCode: { in: ['exp_reimb', 'exp_taxable'] } }, select: { payslipId: true, sourceRef: true } });
      const paidSlips = new Set(slips.filter((s) => ['paid', 'cash'].includes(s.paymentStatus)).map((s) => s.id));
      const onSlip = new Map(lines.filter((l) => l.sourceRef).map((l) => [l.sourceRef!, l.payslipId]));
      const queued = await tx.expensePayment.findMany({ where: { organizationId: org, route: 'payroll', status: 'queued', oneTimePayIds: { hasSome: [...onSlip.keys()] } } });
      for (const p of queued) {
        const slip = p.oneTimePayIds.map((x) => onSlip.get(x)).find(Boolean)!;
        if (!paidSlips.has(slip)) continue;
        await tx.expensePayment.update({ where: { id: p.id }, data: { status: 'paid', paidOn: asDate(paidOn), ref: slip, updatedAt: new Date() } });
        await this.markPaid(tx, c, p.claimId, paidOn, 'payroll');
        tells.push({ employeeId: p.employeeId, text: 'Your expense claim was paid with your salary.', claimId: p.claimId });
      }
      await this.recoveries(tx, c, slips.map((s) => s.id));
    }
    if (ev.type === 'payment.failed') {
      const payslipId = String(ev.payload.payslipId);
      const refs = (await tx.payslipLine.findMany({ where: { organizationId: org, payslipId, componentCode: { in: ['exp_reimb', 'exp_taxable'] } }, select: { sourceRef: true } })).map((l) => l.sourceRef).filter((x): x is string => Boolean(x));
      const hit = refs.length ? await tx.expensePayment.findMany({ where: { organizationId: org, route: 'payroll', status: 'queued', oneTimePayIds: { hasSome: refs } } }) : [];
      for (const p of hit) {
        await tx.expensePayment.update({ where: { id: p.id }, data: { status: 'failed', ref: payslipId, reason: 'The salary payment did not go through; payroll pays it again with the salary.', updatedAt: new Date() } });
        await tx.expenseClaim.update({ where: { id: p.claimId }, data: { paymentStatus: 'payment_failed', version: { increment: 1 } } });
      }
    }
    if (ev.type === 'recovery.deferred' && ev.payload.kind === 'loan') {
      const loan = await tx.loan.findFirst({ where: { organizationId: org, id: String(ev.payload.ref), loanType: 'expense' } });
      if (loan?.sourceRef) await audit(tx, c, 'expense.advance.recovery_deferred', 'expense_advance', loan.sourceRef, { runId: ev.payload.runId ?? null });
    }
    // payroll.run.voided: the claims' one-time rows stay approved and are paid by the month's next run; nothing to change.
    return tells;
  }

  /** Expense-loan instalments recovered on a paid run become advance settlements (once per repayment). */
  private async recoveries(tx: Tx, c: CompanyContext, payslipIds: string[]) {
    const org = c.organizationId;
    if (!payslipIds.length) return;
    const reps = await tx.loanRepayment.findMany({ where: { organizationId: org, payslipId: { in: payslipIds } } });
    if (!reps.length) return;
    const loans = await tx.loan.findMany({ where: { organizationId: org, id: { in: [...new Set(reps.map((r) => r.loanId))] }, loanType: 'expense', sourceRef: { not: null } } });
    for (const r of reps) {
      const loan = loans.find((l) => l.id === r.loanId);
      if (!loan) continue;
      const adv = await tx.expenseAdvance.findFirst({ where: { organizationId: org, id: loan.sourceRef! } });
      if (!adv || (await tx.advanceSettlement.count({ where: { organizationId: org, advanceId: adv.id, kind: 'recovery', ref: r.id } }))) continue;
      // A forex advance is owed in its own currency; payroll recovered pay currency at the advance's rate.
      const owed = adv.fxRate ? r.amount.div(adv.fxRate).toDecimalPlaces(2) : r.amount;
      await tx.advanceSettlement.create({ data: { organizationId: org, advanceId: adv.id, kind: 'recovery', amount: owed, amountPay: r.amount, fxRate: adv.fxRate, on: asDate(todayIst()), ref: r.id } });
      const settled = (await tx.advanceSettlement.findMany({ where: { organizationId: org, advanceId: adv.id }, select: { amount: true } })).reduce((t, s) => t.add(s.amount), D(0));
      if (adv.amount && settled.gte(adv.amount) && adv.status !== 'settled') {
        await tx.expenseAdvance.update({ where: { id: adv.id }, data: { status: 'settled', version: { increment: 1 } } });
        await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'advance.settled', payload: { advanceId: adv.id } } });
      }
      await audit(tx, c, 'expense.advance.recovered', 'expense_advance', adv.id, { amount: r.amount.toFixed(2), loanId: loan.id });
    }
  }

  async reconcileAll() {
    const orgs = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.expensePayment.findMany({ where: { route: 'payroll', status: 'failed' }, select: { organizationId: true }, distinct: ['organizationId'] }));
    for (const o of orgs) await this.reconcile(o.organizationId).catch((e: Error) => this.logger.warn(`reconcile ${o.organizationId}: ${e.message}`));
  }

  /** Hourly: a payroll-routed claim whose failed salary payment payroll has since paid again is marked paid. */
  async reconcile(org: string) {
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: null } as CompanyContext;
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const failed = await tx.expensePayment.findMany({ where: { organizationId: org, route: 'payroll', status: 'failed', ref: { not: null } } });
      if (!failed.length) return 0;
      const entities = (await tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true } })).map((e) => e.id);
      return withPayScope(tx, entities, async () => {
        let n = 0;
        for (const p of failed) {
          const slip = await tx.payslip.findFirst({ where: { organizationId: org, id: p.ref! }, select: { paymentStatus: true } });
          if (slip?.paymentStatus !== 'paid') continue;
          await tx.expensePayment.update({ where: { id: p.id }, data: { status: 'paid', paidOn: asDate(todayIst()), updatedAt: new Date() } });
          await this.markPaid(tx, c, p.claimId, todayIst(), 'payroll');
          n++;
        }
        return n;
      });
    });
  }

  // ------------------------------------------------------------------------------------------ journal (§12)

  private async journalOf(tx: Tx, org: string, entityId: string, month: string) {
    const from = asDate(`${month}-01`);
    const to = asDate(`${nextMonth(month)}-01`);
    const claims = await tx.expenseClaim.findMany({ where: { organizationId: org, legalEntityId: entityId, status: { in: ['approved', 'partly_approved'] }, decidedAt: { gte: from, lt: to } } });
    const lines = await tx.expenseLine.findMany({ where: { organizationId: org, claimId: { in: claims.map((x) => x.id) }, removedAt: null } });
    const payouts = await tx.expensePayment.findMany({ where: { organizationId: org, legalEntityId: entityId, route: 'payout', status: 'paid', paidOn: { gte: from, lt: to } }, select: { amount: true } });
    const advances = await tx.expenseAdvance.findMany({ where: { organizationId: org, legalEntityId: entityId, paidOn: { gte: from, lt: to } }, select: { amount: true, fxRate: true } });
    const returns = await tx.advanceSettlement.findMany({ where: { organizationId: org, kind: 'return', on: { gte: from, lt: to }, advanceId: { in: (await tx.expenseAdvance.findMany({ where: { organizationId: org, legalEntityId: entityId }, select: { id: true } })).map((a) => a.id) } }, select: { amountPay: true, amount: true } });
    const input: JournalInput = {
      legalEntityId: entityId,
      claims: claims.map((x) => ({
        advanceAdjusted: x.advanceAdjusted.toFixed(2),
        lines: lines
          .filter((l) => l.claimId === x.id)
          .map((l) => ({ category: l.categoryCode, amount: (l.approved ?? l.claimed).toFixed(2), companyPaid: l.payMode === 'company_paid', gst: l.itcStatus === 'eligible' ? { cgst: l.cgst?.toFixed(2), sgst: l.sgst?.toFixed(2), igst: l.igst?.toFixed(2) } : null })),
      })),
      payouts: payouts.map((p) => p.amount.toFixed(2)),
      advancesPaid: advances.map((a) => (a.amount ?? D(0)).mul(a.fxRate ?? 1).toFixed(2)),
      advanceReturns: returns.map((r) => (r.amountPay ?? r.amount).toFixed(2)),
    };
    const mappings = (await tx.ledgerMapping.findMany({ where: { organizationId: org, componentCode: { startsWith: 'exp.' }, OR: [{ scopeType: 'company' }, { scopeType: 'legal_entity', scopeId: entityId }] } })) as ExpenseMapping[];
    return buildExpenseJournal(input, mappings);
  }

  private async requireEntity(tx: Tx, org: string, v: Viewer, entityId: string) {
    const { ids } = await this.requirePayer(tx, org, v);
    if (!ids.includes(entityId)) throw new NotFoundException('Not found');
  }

  async journal(ctx: TenantContext, user: ScopeUser, entityId: string, month: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.requireEntity(tx, c.organizationId, v, entityId);
      const j = await this.journalOf(tx, c.organizationId, entityId, month);
      const exported = await tx.expenseJournal.findMany({ where: { organizationId: c.organizationId, legalEntityId: entityId, period: asDate(`${month}-01`) }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, sha256: true, createdAt: true, postedAt: true } });
      return { month, ...j, exports: exported };
    });
  }

  /** The CSV for the accounts system; refused while anything is unmapped or it does not balance (GP-PAY-1). */
  async exportJournal(ctx: TenantContext, user: ScopeUser, entityId: string, month: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.requireEntity(tx, c.organizationId, v, entityId);
      const j = await this.journalOf(tx, c.organizationId, entityId, month);
      if (j.unmapped.length) throw new ConflictException({ statusCode: 409, message: 'Map every expense code to a ledger account first.', unmapped: j.unmapped });
      if (!j.lines.length) throw new ConflictException('Nothing to post for this month.');
      if (!j.balanced) throw new ConflictException('The journal does not balance.');
      const csv = journalCsv(j, month);
      const row = await tx.expenseJournal.create({ data: { organizationId: c.organizationId, legalEntityId: entityId, period: asDate(`${month}-01`), lines: j.lines as unknown as Prisma.InputJsonValue, sha256: sha256(Buffer.from(csv)), exportedBy: v.userId! } });
      await audit(tx, c, 'expense.journal.exported', 'expense_journal', row.id, { month, lines: j.lines.length, sha256: row.sha256 });
      return { id: row.id, fileName: `expense-journal-${month}.csv`, csv };
    });
  }

  async markPosted(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const row = await tx.expenseJournal.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!row) throw new NotFoundException('Not found');
      await this.requireEntity(tx, c.organizationId, v, row.legalEntityId);
      if (row.status === 'posted') return { id, status: 'posted' };
      await tx.expenseJournal.update({ where: { id }, data: { status: 'posted', postedBy: v.userId!, postedAt: new Date() } });
      await audit(tx, c, 'expense.journal.posted', 'expense_journal', id, { sha256: row.sha256 });
      return { id, status: 'posted' };
    });
  }
}
