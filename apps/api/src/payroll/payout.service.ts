import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import type { ScopeUser, Viewer } from '../access/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { StatutoryRulesService } from '../statutory/statutory.service';
import { inForce } from '../statutory/evaluator';
import { writeBankFile, type BankLayout, type BankRow } from '../statutory/bank-format';
import { asDate, dateOf } from '../time/time-core';
import { ApprovalsEngine } from '../workflow/approvals-engine.service';
import type { ConfirmationDto } from './dto';
import type { DisbursementDto, ExpediteBankDto, GenerateBankFileDto, PaymentModeDto, PaymentResultRowDto } from './dto-5d';
import { ExchangeFilesService } from './exchange-files.service';
import { PayKey, entitiesFor, payHolders, payScope, payViewer, requireEntity, requireSelf } from './pay-access';

// Pay-out (M03-BUILD-DESIGN §9.7, §11.2, PAY-4.01 … 4.03, D11): the bank file of an approved run from a published
// format (approved, unheld, bank-mode payslips whose account is past the bank-change cooling period), released by
// someone else after a fresh second step, with the hash, row count and total checked again against the run; payment
// results (the bank's response file or manual rows) with the failure flow; cash and cheque payment modes approved
// through P03 and their disbursement register; the run is paid when no payslip is still waiting.

export const PAYMENT_MODE = 'payroll.payment_mode';
const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const REPAYABLE = ['pending', 'failed', 'returned'];
type Run = Prisma.PayrollRunGetPayload<object>;
type Slip = Prisma.PayslipGetPayload<object>;
type Notify = { to: string[]; type: string; entityId: string; text: string; link: string; subject: string };

@Injectable()
export class PayoutService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly engine: ApprovalsEngine,
    private readonly rules: StatutoryRulesService,
    private readonly files: ExchangeFilesService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.engine.register({
      key: PAYMENT_MODE,
      label: 'Cash or cheque payment',
      risk: 'normal',
      autoActions: false,
      distinctSteps: true,
      onDecided: (tx, req, o) => this.modeDecided(tx, req, o),
      requesterLink: () => '/yx/payroll/payments',
    });
  }

  private async viewer(user: ScopeUser) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return v;
  }

  /** A run the key reaches, with the pay guard opened to those entities; anything else is "not found". */
  private async runFor(tx: Tx, c: CompanyContext, v: Viewer, id: string, keys: PayKey[]) {
    const ids = [...new Set((await Promise.all(keys.map((k) => entitiesFor(tx, c, v, k)))).flat())];
    await payScope(tx, ids);
    const run = await tx.payrollRun.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!run || !ids.includes(run.legalEntityId)) throw new NotFoundException('Not found');
    return run;
  }

  private requireApproved(run: Run) {
    if (!['approved', 'paid'].includes(run.status)) throw new ConflictException('Pay-out starts once the payroll is approved.');
  }

  /** The approved payslips of the run's current calculation. */
  private slips(tx: Tx, org: string, run: Run, where: Prisma.PayslipWhereInput = {}) {
    return tx.payslip.findMany({ where: { organizationId: org, runId: run.id, calcVersion: run.calcVersion, status: 'approved', ...where }, orderBy: { createdAt: 'asc' } });
  }

  /** The signed-in person's employee records, merged persons included (nobody pays, records or releases their own pay). */
  private async ownEmployeeIds(tx: Tx) {
    const [{ ids }] = await tx.$queryRaw<{ ids: string[] }[]>`SELECT app_current_employee_ids()::text[] AS ids`;
    return new Set(ids ?? []);
  }

  /** Each employment's payment mode on a day: the latest approved one from that day or before, else bank (YX-PAY-31). */
  private async modesOn(tx: Tx, org: string, employmentIds: string[], on: string) {
    const rows = await tx.employeePaymentMode.findMany({
      where: { organizationId: org, employmentId: { in: employmentIds }, status: 'approved', validFrom: { lte: asDate(on) } },
      orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }],
    });
    const out = new Map<string, string>();
    for (const r of rows) if (!out.has(r.employmentId)) out.set(r.employmentId, r.mode);
    return (employmentId: string) => out.get(employmentId) ?? 'bank';
  }

  private open(org: string, employeeId: string, blob: string) {
    const prefix = `${org}:${employeeId}:`;
    const plain = this.crypto.decrypt(blob);
    if (!plain.startsWith(prefix)) throw new ConflictException('A stored bank account does not belong to its employee.');
    return plain.slice(prefix.length);
  }

  private async send(org: string, list: Notify[]) {
    for (const n of list)
      await this.notifications
        .notifySystem(
          { organizationId: org, isSuperAdmin: false },
          n.to,
          n.type,
          { entityType: 'payslip', entityId: n.entityId, contextText: n.text, linkPath: n.link },
          { subject: n.subject, html: `<p>${n.text}</p><p>Open YukthiX to see the details.</p>` },
        )
        .catch(() => undefined);
  }

  /** The run is paid once no payslip waits for the bank or the register (held, failed and returned are results too). */
  private async settle(tx: Tx, c: CompanyContext, run: Run) {
    if (run.status !== 'approved') return;
    const waiting = await tx.payslip.count({
      where: { organizationId: c.organizationId, runId: run.id, calcVersion: run.calcVersion, status: 'approved', paymentStatus: { in: ['pending', 'sent'] } },
    });
    if (waiting) return;
    await tx.payrollRun.update({ where: { id: run.id }, data: { status: 'paid', version: { increment: 1 } } });
    await audit(tx, c, 'payroll.run.paid', 'payroll_run', run.id, {});
  }

  // ------------------------------------------------------------------------------------------ bank files (PAY-4.01)

  async generate(ctx: TenantContext, user: ScopeUser, runId: string, dto: GenerateBankFileDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const run = await this.runFor(tx, c, v, runId, ['payroll.bankfile.generate']);
      this.requireApproved(run);
      await tx.$queryRaw`SELECT id FROM payroll_runs WHERE organization_id = ${org}::uuid AND id = ${run.id}::uuid FOR UPDATE`;
      const before = await tx.bankFile.count({ where: { organizationId: org, runId: run.id } });
      if (before && !dto.reason) throw new BadRequestException('This run already has a bank file. Say why a new one is needed.');
      const payDate = dto.payDate ?? todayIst();
      const group = await tx.payGroup.findFirstOrThrow({ where: { organizationId: org, id: run.payGroupId } });
      const key = (group.bankFormat ?? 'GENERIC').toUpperCase();
      const fmt = inForce(await this.rules.published(), 'IN.BANKFMT', [key], payDate);
      // DECISION NEEDED: which bank the pilot customer uses (§19 D1: generic first, then the pilot's bank; its format is loaded as data once a real sample file is checked).
      if (!fmt) throw new ConflictException(`No published bank format "${key}" is in force on ${payDate}.`);
      const slips = await this.slips(tx, org, run, { held: false, paymentStatus: { in: REPAYABLE }, net: { gt: 0 } });
      const employments = await tx.employment.findMany({ where: { organizationId: org, id: { in: slips.map((s) => s.employmentId) } }, select: { id: true, employeeCode: true } });
      const modeOf = await this.modesOn(
        tx,
        org,
        slips.map((s) => s.employmentId),
        payDate,
      );
      const accounts = await tx.employeeBankAccount.findMany({ where: { organizationId: org, employeeId: { in: slips.map((s) => s.employeeId) }, purpose: 'salary', validTo: null } });
      const now = new Date();
      const rows: (BankRow & { slip: Slip })[] = [];
      const excluded: { employeeId: string; reason: string }[] = [];
      for (const s of slips) {
        const a = accounts.find((x) => x.employeeId === s.employeeId);
        const mode = modeOf(s.employmentId);
        if (mode !== 'bank') excluded.push({ employeeId: s.employeeId, reason: `Paid by ${mode} (disbursement register).` });
        else if (!a) excluded.push({ employeeId: s.employeeId, reason: 'No salary bank account.' });
        else if (a.usableFrom > now) excluded.push({ employeeId: s.employeeId, reason: `A new bank account is in its cooling period until ${a.usableFrom.toISOString()}.` });
        else
          rows.push({
            slip: s,
            account: this.open(org, s.employeeId, a.accountEnc),
            ifsc: a.ifsc,
            name: a.holderName,
            amount: s.net.toFixed(2),
            code: employments.find((e) => e.id === s.employmentId)?.employeeCode ?? '',
            narration: `Salary ${dateOf(run.periodStart).slice(0, 7)}`,
          });
      }
      if (!rows.length) throw new ConflictException({ statusCode: 409, message: 'Nobody in this run is waiting to be paid by bank.', excluded });
      let out: Awaited<ReturnType<typeof writeBankFile>>;
      try {
        out = await writeBankFile(fmt.values as unknown as BankLayout, rows, { debitAccount: dto.debitAccount, date: payDate });
      } catch (e) {
        throw new BadRequestException(`The bank file could not be written: ${(e as Error).message}`);
      }
      const total = rows.reduce((t, r) => t.add(r.amount), D(0));
      const month = dateOf(run.periodStart).slice(0, 7);
      const f = await this.files.generateIn(tx, c, {
        legalEntityId: run.legalEntityId,
        kind: 'bank',
        ownerType: 'payroll_run',
        ownerId: run.id,
        periodStart: dateOf(run.periodStart),
        fileName: `bank-${key.toLowerCase()}-${month}-${before + 1}.${out.ext}`,
        contentType: out.contentType,
        data: out.data,
        rows: rows.length,
        totals: { net: total.toFixed(2) },
        by: v.userId!,
      });
      const bf = await tx.bankFile.create({
        data: {
          organizationId: org,
          legalEntityId: run.legalEntityId,
          runId: run.id,
          exchangeFileId: f.id,
          formatKey: key,
          formatVersion: fmt.version,
          debitAccountLast4: dto.debitAccount.slice(-4),
          generationNo: before + 1,
          regenerationReason: before ? dto.reason! : null,
          payslipIds: rows.map((r) => r.slip.id),
          total,
          generatedBy: v.userId!,
        },
      });
      await audit(tx, c, 'payroll.bankfile.generated', 'bank_file', bf.id, {
        runId: run.id,
        fileId: f.id,
        format: `${key} ${fmt.version}`,
        rows: rows.length,
        excluded: excluded.length,
        generation: bf.generationNo,
        reason: bf.regenerationReason,
      });
      return {
        id: bf.id,
        fileId: f.id,
        generationNo: bf.generationNo,
        rows: rows.length,
        total: total.toFixed(2),
        sha256: f.sha256,
        format: { key, version: fmt.version, label: (fmt.values as unknown as BankLayout).label },
        excluded,
      };
    });
  }

  async bankFiles(ctx: TenantContext, user: ScopeUser, runId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const run = await this.runFor(tx, c, v, runId, ['payroll.bankfile.generate', 'payroll.bankfile.release', 'payroll.run.view']);
      const rows = await tx.bankFile.findMany({ where: { organizationId: c.organizationId, runId: run.id }, orderBy: { generationNo: 'desc' } });
      const files = await tx.exchangeFile.findMany({ where: { organizationId: c.organizationId, id: { in: rows.map((r) => r.exchangeFileId) } } });
      return rows.map((r) => {
        const f = files.find((x) => x.id === r.exchangeFileId)!;
        return {
          id: r.id,
          fileId: f.id,
          generationNo: r.generationNo,
          reason: r.regenerationReason,
          format: `${r.formatKey} ${r.formatVersion}`,
          debitAccount: `•••• ${r.debitAccountLast4}`,
          rows: f.rowCount,
          total: r.total.toFixed(2),
          sha256: f.sha256,
          status: f.status,
          madeByMe: r.generatedBy === v.userId,
          releasedAt: f.releasedAt,
          releasePhrase: `RELEASE ${f.rowCount}`,
        };
      });
    });
  }

  /**
   * A second person releases the bank file (step-up by the route; maker ≠ checker in the service and the database). The
   * stored bytes are checked against their hash, and the rows and total against the run's payslips as they are now; nobody
   * releases a file that pays themselves. The payslips it carries are then "sent".
   */
  async release(ctx: TenantContext, user: ScopeUser, bankFileId: string, confirmation: ConfirmationDto) {
    const v = await this.viewer(user);
    const bf = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await payScope(tx, await entitiesFor(tx, c, v, 'payroll.bankfile.release'));
      const row = await tx.bankFile.findFirst({ where: { organizationId: c.organizationId, id: bankFileId } });
      if (!row) throw new NotFoundException('Not found');
      return row;
    });
    return this.files.release(ctx, user, bf.exchangeFileId, confirmation, {
      check: async (tx, c, f) => {
        const org = c.organizationId;
        const slips = await tx.payslip.findMany({ where: { organizationId: org, id: { in: bf.payslipIds } } });
        const total = slips.reduce((t, s) => t.add(s.net), D(0));
        const fileTotal = (f.totals as Record<string, string>).net;
        if (
          slips.length !== bf.payslipIds.length ||
          slips.length !== f.rowCount ||
          !total.eq(bf.total) ||
          !total.eq(D(fileTotal ?? '0')) ||
          slips.some((s) => s.status !== 'approved' || s.held || !REPAYABLE.includes(s.paymentStatus))
        ) {
          throw new ConflictException('The payslips changed after this file was generated. Generate it again.');
        }
        const me = await this.ownEmployeeIds(tx);
        if (slips.some((s) => me.has(s.employeeId))) throw new ForbiddenException('This file pays you, so someone else must release it.');
        await tx.payslip.updateMany({ where: { organizationId: org, id: { in: bf.payslipIds } }, data: { paymentStatus: 'sent' } });
        await audit(tx, c, 'payroll.bankfile.released', 'bank_file', bf.id, { runId: bf.runId, fileId: f.id, rows: f.rowCount, sha256: f.sha256 });
      },
    });
  }

  // ------------------------------------------------------------------------------------------ payment results (PAY-4.02)

  /** The bank's response as CSV: employee_code, status (paid / failed / returned), reference, reason. */
  parseResults(file: Buffer | undefined): PaymentResultRowDto[] {
    if (!file?.length) throw new BadRequestException('Attach the bank response file (CSV).');
    let recs: Record<string, string>[];
    try {
      recs = parse(file, { columns: (h: string[]) => h.map((x) => x.trim().toLowerCase()), skip_empty_lines: true, trim: true, bom: true, to: 5001 });
    } catch {
      throw new BadRequestException('The file is not a CSV with the columns employee_code, status, reference, reason.');
    }
    if (recs.length > 5000) throw new BadRequestException('A file has at most 5,000 rows.');
    return recs.map((r, i) => {
      const status = (r.status ?? '').toLowerCase();
      if (!['paid', 'failed', 'returned'].includes(status) || !r.employee_code) throw new BadRequestException(`Row ${i + 2}: needs an employee_code and a status of paid, failed or returned.`);
      if (r.reference && !/^[A-Za-z0-9/-]{1,60}$/.test(r.reference)) throw new BadRequestException(`Row ${i + 2}: the reference is letters, digits, / and -.`);
      return {
        employeeCode: r.employee_code.slice(0, 30),
        status: status as 'paid' | 'failed' | 'returned',
        bankReference: r.reference || undefined,
        reason: r.reason ? r.reason.slice(0, 300) : undefined,
      };
    });
  }

  /**
   * Records results for payslips the bank was sent (all rows or none). Failed and returned payslips are told to the
   * employee (no amounts) and go into the next bank file once the account is fixed (D11).
   */
  async recordResults(ctx: TenantContext, user: ScopeUser, runId: string, rows: PaymentResultRowDto[], source: 'file' | 'manual') {
    const v = await this.viewer(user);
    const notices: Notify[] = [];
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const run = await this.runFor(tx, c, v, runId, ['payroll.payment.record']);
      this.requireApproved(run);
      await tx.$queryRaw`SELECT id FROM payroll_runs WHERE organization_id = ${org}::uuid AND id = ${run.id}::uuid FOR UPDATE`;
      const slips = await this.slips(tx, org, run);
      const codes = await tx.employment.findMany({ where: { organizationId: org, id: { in: slips.map((s) => s.employmentId) } }, select: { id: true, employeeCode: true } });
      const me = await this.ownEmployeeIds(tx);
      const problems: string[] = [];
      const seen = new Set<string>();
      const todo = rows.map((r, i) => {
        const s = r.payslipId ? slips.find((x) => x.id === r.payslipId) : slips.find((x) => codes.find((e) => e.id === x.employmentId)?.employeeCode.toLowerCase() === r.employeeCode?.toLowerCase());
        const at = `Row ${i + 1}`;
        if (!s) problems.push(`${at}: no approved payslip of this run for ${r.employeeCode ?? r.payslipId ?? 'that person'}.`);
        else if (seen.has(s.id)) problems.push(`${at}: the same person twice.`);
        else if (me.has(s.employeeId)) problems.push(`${at}: someone else records your own payment.`);
        else if (s.paymentStatus !== 'sent') problems.push(`${at}: the payslip is ${s.paymentStatus}, not waiting for a bank result.`);
        if (r.status !== 'paid' && !r.reason) problems.push(`${at}: say why the payment ${r.status === 'failed' ? 'failed' : 'came back'}.`);
        if (source === 'manual' && !r.reason) problems.push(`${at}: a result entered by hand needs a reason.`);
        if (s) seen.add(s.id);
        return { r, s: s! };
      });
      if (problems.length) throw new BadRequestException({ statusCode: 400, message: 'Nothing was recorded. Fix these rows first.', problems: problems.slice(0, 50) });
      const files = await tx.bankFile.findMany({ where: { organizationId: org, runId: run.id }, orderBy: { generationNo: 'desc' } });
      for (const { r, s } of todo) {
        await tx.paymentRecord.create({
          data: {
            organizationId: org,
            legalEntityId: run.legalEntityId,
            employeeId: s.employeeId,
            payslipId: s.id,
            bankFileId: files.find((f) => f.payslipIds.includes(s.id))?.id ?? null,
            status: r.status,
            bankReference: r.bankReference ?? null,
            reason: r.reason ?? null,
            source,
            recordedBy: v.userId!,
          },
        });
        await tx.payslip.update({ where: { id: s.id }, data: { paymentStatus: r.status } });
        if (r.status !== 'paid') {
          await audit(tx, c, 'payment.failed', 'payslip', s.id, { employeeId: s.employeeId, status: r.status, reason: r.reason });
          const u = (await tx.employee.findFirst({ where: { organizationId: org, id: s.employeeId }, select: { userId: true } }))?.userId;
          if (u)
            notices.push({
              to: [u],
              type: 'payroll.payment.failed',
              entityId: s.id,
              text: 'Your salary payment did not go through. Check your bank details in your profile; payroll will pay it again.',
              link: '/yx/me/profile',
              subject: 'Your salary payment did not go through',
            });
        }
      }
      await audit(tx, c, 'payroll.payment.recorded', 'payroll_run', run.id, {
        source,
        paid: todo.filter((t) => t.r.status === 'paid').length,
        failed: todo.filter((t) => t.r.status !== 'paid').length,
      });
      await this.settle(tx, c, run);
      return { recorded: todo.length, runStatus: (await tx.payrollRun.findFirstOrThrow({ where: { id: run.id }, select: { status: true } })).status };
    });
    await this.send(ctx.organizationId!, notices);
    return out;
  }

  /**
   * D11 expedited bank fix: after a failed or returned payment, a checker (not the employee) confirms the new account by a
   * penny-drop and lets it be used before its cooling period ends; it goes in the next bank file. Step-up by the route.
   */
  async expedite(ctx: TenantContext, user: ScopeUser, payslipId: string, dto: ExpediteBankDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await payScope(tx, await entitiesFor(tx, c, v, 'payroll.bankfile.release'));
      const s = await tx.payslip.findFirst({ where: { organizationId: org, id: payslipId } });
      if (!s || !(await entitiesFor(tx, c, v, 'payroll.bankfile.release')).includes(s.legalEntityId)) throw new NotFoundException('Not found');
      if ((await this.ownEmployeeIds(tx)).has(s.employeeId)) throw new ForbiddenException('Someone else confirms your own bank account.');
      if (!['failed', 'returned'].includes(s.paymentStatus)) throw new ConflictException('An urgent bank fix is only for a payment that failed or came back.');
      const failedAt = (await tx.paymentRecord.findFirst({ where: { organizationId: org, payslipId: s.id, status: { in: ['failed', 'returned'] } }, orderBy: { recordedAt: 'desc' } }))?.recordedAt;
      const a = await tx.employeeBankAccount.findFirst({ where: { organizationId: org, employeeId: s.employeeId, purpose: 'salary', validTo: null } });
      if (!a || !failedAt || a.validFrom < failedAt)
        throw new ConflictException('The employee has not changed their bank account since the payment failed. Their bank change is approved first (profile).');
      // DECISION NEEDED: an automatic penny-drop provider (name match through a bank API); until then the checker records the reference of the test credit the company's bank made.
      await tx.$queryRaw`SELECT bank_account_use_now(${org}::uuid, ${a.id}::uuid)`;
      await audit(tx, c, 'payroll.bank.expedited', 'payslip', s.id, { employeeId: s.employeeId, account: `•••• ${a.accountLast4}`, pennyDropReference: dto.pennyDropReference, reason: dto.reason });
      return { payslipId: s.id, account: `•••• ${a.accountLast4}`, usableNow: true };
    });
  }

  // ------------------------------------------------------------------------------------------ payment modes and register (PAY-4.03)

  /** Ask for a payment mode from a date (cash or cheque, or back to bank); someone else approves it through P03. */
  async requestMode(ctx: TenantContext, user: ScopeUser, dto: PaymentModeDto) {
    const v = await this.viewer(user);
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const e = await tx.employment.findFirst({
        where: { organizationId: org, employeeId: dto.employeeId, joinedOn: { lte: asDate(dto.validFrom) }, OR: [{ exitedOn: null }, { exitedOn: { gte: asDate(dto.validFrom) } }] },
        orderBy: { joinedOn: 'desc' },
      });
      if (!e) throw new NotFoundException('Not found');
      await requireEntity(tx, c, v, 'payroll.payment.record', e.legalEntityId);
      if ((await this.ownEmployeeIds(tx)).has(dto.employeeId)) throw new ForbiddenException('Someone else asks for your own payment mode.');
      await payScope(tx, [e.legalEntityId]);
      const subject = (await tx.employee.findFirst({ where: { organizationId: org, id: dto.employeeId }, select: { userId: true } }))?.userId;
      const approvers = (await payHolders(tx, org, 'payroll.payment_mode.approve', e.legalEntityId, todayIst())).filter((u) => u !== v.userId && u !== subject);
      if (!approvers.length) throw new BadRequestException('No one can approve this yet. A payroll approver needs "payroll.payment_mode.approve".');
      const row = await tx.employeePaymentMode.create({
        data: {
          organizationId: org,
          legalEntityId: e.legalEntityId,
          employeeId: dto.employeeId,
          employmentId: e.id,
          mode: dto.mode,
          validFrom: asDate(dto.validFrom),
          reason: dto.reason,
          requestedBy: v.userId!,
        },
      });
      const sub = await this.engine.submit(tx, c, {
        type: PAYMENT_MODE,
        subjectType: 'employee_payment_mode',
        subjectId: row.id,
        title: `Pay by ${dto.mode} from ${dto.validFrom}`,
        summary: [{ label: 'Why', value: dto.reason.slice(0, 200) }],
        subjectPersonId: null,
        requesterUserId: v.userId!,
        raisedByUserId: v.userId!,
        steps: [{ name: 'Payroll approval', approvers: [{ kind: 'users', userIds: approvers }], mode: 'any', remindAfterHours: 24 }],
        payload: {},
        payloadFields: [],
        fallbackUserIds: [],
      });
      await tx.employeePaymentMode.update({ where: { id: row.id }, data: { wfRequestId: sub.id } });
      await audit(tx, c, 'payroll.payment_mode.requested', 'employee_payment_mode', row.id, { employeeId: dto.employeeId, mode: dto.mode, validFrom: dto.validFrom });
      return { result: { id: row.id, status: 'pending', requestId: sub.id }, notices: sub.notices };
    });
    await this.engine.send(ctx, out.notices);
    return out.result;
  }

  private async modeDecided(tx: Tx, wf: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const all = await tx.$queryRaw<{ id: string }[]>`SELECT id::text FROM legal_entities WHERE organization_id = ${wf.organizationId}::uuid`;
    await payScope(
      tx,
      all.map((x) => x.id),
    );
    await tx.employeePaymentMode.updateMany({ where: { organizationId: wf.organizationId, id: wf.subjectId, status: 'pending' }, data: { status: outcome } });
    await payScope(tx, []);
  }

  async modes(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = [...new Set([...(await entitiesFor(tx, c, v, 'payroll.payment.record')), ...(await entitiesFor(tx, c, v, 'payroll.payment_mode.approve'))])];
      await payScope(tx, ids);
      const rows = await tx.employeePaymentMode.findMany({ where: { organizationId: c.organizationId, legalEntityId: { in: ids } }, orderBy: { createdAt: 'desc' }, take: 500 });
      return rows.map((r) => ({ id: r.id, employeeId: r.employeeId, mode: r.mode, validFrom: dateOf(r.validFrom), reason: r.reason, status: r.status, requestId: r.wfRequestId }));
    });
  }

  /** The run's cash and cheque payees (by their approved mode on the last day of the month) and what is recorded. */
  async disbursements(ctx: TenantContext, user: ScopeUser, runId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const run = await this.runFor(tx, c, v, runId, ['payroll.payment.record']);
      const slips = await this.slips(tx, org, run);
      const modeOf = await this.modesOn(
        tx,
        org,
        slips.map((s) => s.employmentId),
        dateOf(run.periodEnd),
      );
      const done = await tx.disbursement.findMany({ where: { organizationId: org, runId: run.id } });
      return slips
        .filter((s) => modeOf(s.employmentId) !== 'bank' || done.some((d) => d.payslipId === s.id))
        .map((s) => {
          const d = done.find((x) => x.payslipId === s.id);
          return {
            payslipId: s.id,
            employeeId: s.employeeId,
            mode: d?.mode ?? modeOf(s.employmentId),
            net: s.net.toFixed(2),
            held: s.held,
            paymentStatus: s.paymentStatus,
            chequeNo: d?.chequeNo ?? null,
            paidOn: d ? dateOf(d.paidOn) : null,
            acknowledgement: d?.acknowledgement ?? null,
          };
        });
    });
  }

  async disburse(ctx: TenantContext, user: ScopeUser, runId: string, dto: DisbursementDto) {
    const v = await this.viewer(user);
    if ((dto.mode === 'cheque') !== Boolean(dto.chequeNo)) throw new BadRequestException(dto.mode === 'cheque' ? 'A cheque payment has its cheque number.' : 'A cash payment has no cheque number.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const run = await this.runFor(tx, c, v, runId, ['payroll.payment.record']);
      this.requireApproved(run);
      await tx.$queryRaw`SELECT id FROM payroll_runs WHERE organization_id = ${org}::uuid AND id = ${run.id}::uuid FOR UPDATE`;
      const [s] = await this.slips(tx, org, run, { id: dto.payslipId });
      if (!s) throw new NotFoundException('Not found');
      if ((await this.ownEmployeeIds(tx)).has(s.employeeId)) throw new ForbiddenException('Someone else records your own payment.');
      if (s.held || !REPAYABLE.includes(s.paymentStatus)) throw new ConflictException(`This payslip is ${s.held ? 'held' : s.paymentStatus}; it is not waiting to be paid.`);
      if ((await this.modesOn(tx, org, [s.employmentId], dto.paidOn))(s.employmentId) !== dto.mode)
        throw new ConflictException(`Paying by ${dto.mode} needs an approved ${dto.mode} payment mode for this person first.`);
      const d = await tx.disbursement.create({
        data: {
          organizationId: org,
          legalEntityId: run.legalEntityId,
          employeeId: s.employeeId,
          runId: run.id,
          payslipId: s.id,
          mode: dto.mode,
          chequeNo: dto.chequeNo ?? null,
          amount: s.net,
          paidOn: asDate(dto.paidOn),
          acknowledgement: dto.acknowledgement ?? null,
          recordedBy: v.userId!,
        },
      });
      await tx.paymentRecord.create({
        data: {
          organizationId: org,
          legalEntityId: run.legalEntityId,
          employeeId: s.employeeId,
          payslipId: s.id,
          status: 'cash',
          mode: dto.mode,
          bankReference: dto.chequeNo ?? null,
          source: 'register',
          recordedBy: v.userId!,
        },
      });
      await tx.payslip.update({ where: { id: s.id }, data: { paymentStatus: 'cash' } });
      await audit(tx, c, 'payroll.disbursement.recorded', 'payslip', s.id, { employeeId: s.employeeId, mode: dto.mode, paidOn: dto.paidOn });
      await this.settle(tx, c, run);
      return { id: d.id, payslipId: s.id, mode: d.mode, paymentStatus: 'cash' };
    });
  }
}
