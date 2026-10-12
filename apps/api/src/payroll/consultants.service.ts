import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'crypto';
import JSZip from 'jszip';
import PDFDocument from 'pdfkit';
import { OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { entityTimeZone, localDate, todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { OtpService } from '../auth/otp.service';
import type { ScopeUser, Viewer } from '../access/scope';
import { StatutoryRulesService } from '../statutory/statutory.service';
import { inForce, tdsNonSalary } from '../statutory/evaluator';
import { writeBankFile, type BankLayout } from '../statutory/bank-format';
import { etdsFile } from '../statutory/etds';
import { asDate, dateOf } from '../time/time-core';
import { ApprovalsEngine } from '../workflow/approvals-engine.service';
import type { ConfirmationDto } from './dto';
import type { CertificateDto197, ConsultantDto, ConsultantPayoutDto, ConsultantPortalEmailDto, ConsultantPortalVerifyDto, ConsultantResultsDto, ConsultantUpdateDto, Form131ImportDto, InvoiceDto, InvoiceListDto, Section, StaffInvoiceDto } from './dto-5h';
import { money } from './documents.service';
import { ExchangeFilesService } from './exchange-files.service';
import { PayFileStore, sha256 } from './pay-file-store';
import { PayKey, entitiesFor, entityName, payHolders, payScope, payViewer, requireEntity, requireSelf } from './pay-access';
import { etdsDeductor, quarterMonths } from './statutory-filings.service';
import { lawVersionFor, taxYearOf } from './tax';

// Batch 5h · consultants (M03-BUILD-DESIGN §5.9, §17.8; PAY-8.01 … 8.04). The register (PAN and bank sealed with a hash and
// the last four; a new bank account is used only after someone else records the penny-drop check and the cooling period
// ends), s.197 lower deduction certificates, monthly invoices approved through P03 with TDS worked out at approval
// (IN.TDS-NONSAL: sections, thresholds, s.206AA without PAN, s.197 within the certificate's limit; on the value before GST),
// consultant payments in a bank file released by someone else after a fresh second step, the payment advice, the
// consultant's own sign-in (OTP; the database keeps the session to that consultant's rows), Form 140 / 26Q from the
// non-salary challans per section and Form 131 / 16A imported from the TRACES ZIP and matched by PAN.
// DECISION NEEDED: the design puts consultant payments in "the month's bank file"; they are their own bank file here
// (same format, same release key and checks) so a payroll run's file never changes after it is approved.

export const CONSULTANT_INVOICE = 'payroll.consultant_invoice';
const PORTAL_MINUTES = 30;
/** A portal session younger than this may upload an invoice (the consultant's "fresh second step"). */
const FRESH_MINUTES = 10;
const ZIP_MAX_BYTES = 50 * 1024 * 1024;
const ZIP_MAX_FILES = 2000;
const PDF_MAX_BYTES = 5 * 1024 * 1024;
const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const ZERO = D(0);
const PAN = /[A-Z]{5}\d{4}[A-Z]/;
const tokenHash = (t: string) => createHash('sha256').update(t).digest('hex');
const CHALLAN_KEY = (s: string) => `nonsal_${s}`;
const SECTION_LABEL: Record<string, string> = { '194C': '194C', '194J_A': '194J(a)', '194J_B': '194J(b)' };
const LIVE = ['approved', 'queued', 'sent', 'paid', 'failed'];
const isPdf = (b: Buffer | undefined) => Boolean(b?.length && b.subarray(0, 5).toString('latin1') === '%PDF-');

type Consultant = Prisma.ConsultantGetPayload<object>;
type Invoice = Prisma.ConsultantInvoiceGetPayload<object>;
type PortalSession = { org: string; consultantId: string; fresh: boolean };

@Injectable()
export class ConsultantsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly engine: ApprovalsEngine,
    private readonly rules: StatutoryRulesService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly files: PayFileStore,
    private readonly exchange: ExchangeFilesService,
    private readonly otp: OtpService,
  ) {}

  onModuleInit() {
    this.engine.register({
      key: CONSULTANT_INVOICE,
      label: 'Consultant invoice',
      risk: 'normal',
      autoActions: false,
      distinctSteps: true,
      onDecided: (tx, req, o) => this.invoiceDecided(tx, req, o),
      requesterLink: () => '/yx/payroll/consultants',
    });
  }

  private async viewer(user: ScopeUser) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return v;
  }

  /** The entities `keys` reach, with the pay guard opened to them. */
  private async reach(tx: Tx, c: CompanyContext, v: Viewer, keys: PayKey[]) {
    const ids = [...new Set((await Promise.all(keys.map((k) => entitiesFor(tx, c, v, k)))).flat())];
    await payScope(tx, ids);
    return ids;
  }

  private async consultantFor(tx: Tx, c: CompanyContext, v: Viewer, id: string, keys: PayKey[] = ['consultant.manage']) {
    const ids = await this.reach(tx, c, v, keys);
    const k = await tx.consultant.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!k || !ids.includes(k.legalEntityId)) throw new NotFoundException('Not found');
    return k;
  }

  private async invoiceFor(tx: Tx, c: CompanyContext, v: Viewer, id: string, keys: PayKey[]) {
    const ids = await this.reach(tx, c, v, keys);
    const inv = await tx.consultantInvoice.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!inv || !ids.includes(inv.legalEntityId)) throw new NotFoundException('Not found');
    return inv;
  }

  private seal(org: string, id: string, kind: string, value: string) {
    return { enc: this.crypto.encrypt(`${org}:${id}:${value}`), hash: this.crypto.hmac(`consultant.${kind}`, `${org}:${value}`), last4: value.slice(-4) };
  }

  private open(org: string, id: string, blob: string) {
    const prefix = `${org}:${id}:`;
    const plain = this.crypto.decrypt(blob);
    if (!plain.startsWith(prefix)) throw new ConflictException('A stored value does not belong to its consultant.');
    return plain.slice(prefix.length);
  }

  private view(k: Consultant, now = new Date()) {
    return {
      id: k.id,
      legalEntityId: k.legalEntityId,
      name: k.name,
      kind: k.kind,
      email: k.email,
      pan: k.panLast4 ? `•••••••${k.panLast4.slice(-3)}` : null,
      panStatus: k.panStatus,
      gstin: k.gstin,
      defaultSection: k.defaultSection,
      bank: k.bankAccountLast4
        ? {
            holder: k.bankHolder,
            ifsc: k.bankIfsc,
            account: `•••• ${k.bankAccountLast4}`,
            verified: Boolean(k.bankVerifiedAt),
            verifiedRef: k.bankVerifiedRef,
            usableFrom: k.bankUsableFrom,
            usable: Boolean(k.bankVerifiedAt) && (!k.bankUsableFrom || k.bankUsableFrom <= now),
          }
        : null,
      status: k.status,
      version: k.version,
    };
  }

  private invoiceView(i: Invoice, k?: Pick<Consultant, 'name'>) {
    const gst = i.cgst.add(i.sgst).add(i.igst);
    return {
      id: i.id,
      consultantId: i.consultantId,
      consultant: k?.name ?? null,
      legalEntityId: i.legalEntityId,
      invoiceNo: i.invoiceNo,
      invoiceDate: dateOf(i.invoiceDate),
      period: dateOf(i.period).slice(0, 7),
      taxYear: i.taxYear,
      section: i.section,
      taxableValue: i.taxableValue.toFixed(2),
      gst: gst.toFixed(2),
      total: i.taxableValue.add(gst).toFixed(2),
      uploadedVia: i.uploadedVia,
      hasFile: Boolean(i.fileRef),
      status: i.status,
      requestId: i.wfRequestId,
      note: i.decisionNote,
      tds: i.tdsAmount
        ? { amount: i.tdsAmount.toFixed(2), base: i.tdsBase!.toFixed(2), rate: i.tdsRate, reason: i.tdsReason, rules: i.tdsRuleVersion, certificateUsed: i.certificateUsed.toFixed(2), on: i.tdsOn ? dateOf(i.tdsOn) : null }
        : null,
      netPayable: i.netPayable?.toFixed(2) ?? null,
      paidOn: i.paidOn ? dateOf(i.paidOn) : null,
      paymentRef: i.paymentRef,
      paymentReason: i.paymentReason,
      version: i.version,
    };
  }

  // ------------------------------------------------------------------------------------------ register (PAY-8.01)

  async list(ctx: TenantContext, user: ScopeUser, legalEntityId?: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await this.reach(tx, c, v, ['consultant.manage', 'consultant.invoice.approve']);
      const rows = await tx.consultant.findMany({ where: { organizationId: c.organizationId, legalEntityId: legalEntityId ? { in: ids.filter((x) => x === legalEntityId) } : { in: ids } }, orderBy: { name: 'asc' }, take: 1000 });
      const now = new Date();
      return rows.map((k) => ({ ...this.view(k, now), changedByMe: k.bankChangedBy === v.userId }));
    });
  }

  async get(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const k = await this.consultantFor(tx, c, v, id, ['consultant.manage', 'consultant.invoice.approve']);
      const certificates = await tx.tds197Certificate.findMany({ where: { organizationId: c.organizationId, consultantId: k.id }, orderBy: { validFrom: 'desc' } });
      return {
        ...this.view(k),
        changedByMe: k.bankChangedBy === v.userId,
        certificates: certificates.map((x) => ({ id: x.id, certificateNo: x.certificateNo, section: x.section, rate: x.rate.toString(), validFrom: dateOf(x.validFrom), validTo: dateOf(x.validTo), limit: x.limitAmount.toFixed(2), consumed: x.consumed.toFixed(2) })),
      };
    });
  }

  private bankData(org: string, id: string, bank: { holder: string; ifsc: string; account: string }, by: string, usableFrom: Date) {
    const a = this.seal(org, id, 'bank', bank.account);
    return { bankHolder: bank.holder, bankIfsc: bank.ifsc, bankAccountEnc: a.enc, bankAccountHash: a.hash, bankAccountLast4: a.last4, bankChangedBy: by, bankUsableFrom: usableFrom, bankVerifiedRef: null, bankVerifiedBy: null, bankVerifiedAt: null };
  }

  private panData(org: string, id: string, pan: string | undefined, status: 'operative' | 'inoperative' | undefined) {
    if (!pan) return { panEnc: null, panHash: null, panLast4: null, panStatus: 'missing' };
    const p = this.seal(org, id, 'pan', pan);
    return { panEnc: p.enc, panHash: p.hash, panLast4: p.last4, panStatus: status ?? 'operative' };
  }

  async create(ctx: TenantContext, user: ScopeUser, dto: ConsultantDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await requireEntity(tx, c, v, 'consultant.manage', dto.legalEntityId);
      await payScope(tx, [dto.legalEntityId]);
      const id = randomUUID();
      try {
        const k = await tx.consultant.create({
          data: {
            id,
            organizationId: org,
            legalEntityId: dto.legalEntityId,
            name: dto.name,
            kind: dto.kind,
            email: dto.email.toLowerCase(),
            gstin: dto.gstin ?? null,
            defaultSection: dto.defaultSection,
            createdBy: v.userId!,
            ...this.panData(org, id, dto.pan, dto.panStatus),
            ...(dto.bank ? this.bankData(org, id, dto.bank, v.userId!, new Date()) : {}),
          },
        });
        await audit(tx, c, 'consultant.created', 'consultant', k.id, { legalEntityId: k.legalEntityId, section: k.defaultSection, pan: k.panStatus, bank: Boolean(dto.bank) });
        return this.view(k);
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('A consultant with this email is already on the register for this legal entity.');
        throw e;
      }
    });
  }

  /**
   * Changes to the register. A new bank account needs someone else's penny-drop check before it is paid, and a replaced
   * one also waits out the company's bank-change cooling period (the same setting as employees').
   */
  async update(ctx: TenantContext, user: ScopeUser, id: string, dto: ConsultantUpdateDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const k = await this.consultantFor(tx, c, v, id);
      if (k.version !== dto.version) throw new ConflictException('Someone else changed this consultant. Reload and try again.');
      const data: Prisma.ConsultantUpdateInput = { version: { increment: 1 } };
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.email !== undefined) data.email = dto.email.toLowerCase();
      if (dto.gstin !== undefined) data.gstin = dto.gstin || null;
      if (dto.defaultSection !== undefined) data.defaultSection = dto.defaultSection;
      if (dto.status !== undefined) data.status = dto.status;
      if (dto.pan !== undefined) Object.assign(data, this.panData(org, k.id, dto.pan, dto.panStatus));
      else if (dto.panStatus !== undefined && k.panStatus !== 'missing') data.panStatus = dto.panStatus;
      if (dto.bank) {
        const hours = Number(await settingFor(tx, c, 'employee.bank_change.cooling_hours', { legalEntityId: k.legalEntityId }));
        Object.assign(data, this.bankData(org, k.id, dto.bank, v.userId!, k.bankAccountEnc ? new Date(Date.now() + hours * 3_600_000) : new Date()));
      }
      try {
        const row = await tx.consultant.update({ where: { id: k.id }, data });
        await audit(tx, c, 'consultant.updated', 'consultant', k.id, { fields: Object.keys(dto).filter((x) => x !== 'version' && x !== 'bank' && x !== 'pan'), pan: dto.pan !== undefined, bank: Boolean(dto.bank) });
        return this.view(row);
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('A consultant with this email is already on the register for this legal entity.');
        throw e;
      }
    });
  }

  /** The penny-drop check of a new bank account, recorded by someone other than the person who entered it. */
  async verifyBank(ctx: TenantContext, user: ScopeUser, id: string, reference: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const k = await this.consultantFor(tx, c, v, id);
      if (!k.bankAccountEnc) throw new ConflictException('This consultant has no bank account yet.');
      if (k.bankVerifiedAt) throw new ConflictException('This bank account is already checked.');
      if (k.bankChangedBy === v.userId) throw new ForbiddenException('You entered this bank account, so someone else records its check.');
      const row = await tx.consultant.update({ where: { id: k.id }, data: { bankVerifiedRef: reference, bankVerifiedBy: v.userId!, bankVerifiedAt: new Date(), version: { increment: 1 } } });
      await audit(tx, c, 'consultant.bank_verified', 'consultant', k.id, { reference, last4: k.bankAccountLast4 });
      return this.view(row);
    });
  }

  async addCertificate(ctx: TenantContext, user: ScopeUser, id: string, dto: CertificateDto197) {
    const v = await this.viewer(user);
    if (dto.validTo < dto.validFrom) throw new BadRequestException('The certificate ends before it starts.');
    if (taxYearOf(dto.validFrom.slice(0, 7)) !== taxYearOf(dto.validTo.slice(0, 7))) throw new BadRequestException('A s.197 certificate is for one tax year.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const k = await this.consultantFor(tx, c, v, id);
      const x = await tx.tds197Certificate.create({
        data: { organizationId: c.organizationId, legalEntityId: k.legalEntityId, consultantId: k.id, certificateNo: dto.certificateNo, section: dto.section, rate: D(dto.rate), validFrom: asDate(dto.validFrom), validTo: asDate(dto.validTo), limitAmount: D(dto.limit), createdBy: v.userId! },
      });
      await audit(tx, c, 'consultant.certificate_197.added', 'tds_197_certificate', x.id, { consultantId: k.id, section: dto.section, rate: dto.rate, limit: dto.limit, validFrom: dto.validFrom, validTo: dto.validTo });
      return { id: x.id };
    });
  }

  // ------------------------------------------------------------------------------------------ invoices (PAY-8.02, 8.03)

  /** One invoice in, then P03: approvers hold consultant.invoice.approve and never approve their own upload. */
  private async submitIn(tx: Tx, c: CompanyContext, k: Consultant, dto: InvoiceDto, via: 'staff' | 'consultant', by: string | null, file: { ref: string; sha: string; name: string } | null) {
    const org = c.organizationId;
    if (k.status !== 'active') throw new ConflictException('This consultant is inactive.');
    if (dto.invoiceDate > todayIst()) throw new BadRequestException('The invoice date is in the future.');
    const taxYear = taxYearOf(dto.invoiceDate.slice(0, 7));
    const approvers = (await payHolders(tx, org, 'consultant.invoice.approve', k.legalEntityId, todayIst())).filter((u) => u !== by);
    if (!approvers.length) throw new BadRequestException('No one can approve this invoice yet. A payroll approver needs "consultant.invoice.approve".');
    let inv: Invoice;
    try {
      inv = await tx.consultantInvoice.create({
        data: {
          organizationId: org,
          legalEntityId: k.legalEntityId,
          consultantId: k.id,
          invoiceNo: dto.invoiceNo,
          invoiceDate: asDate(dto.invoiceDate),
          taxYear,
          period: asDate(`${dto.period}-01`),
          taxableValue: D(dto.taxableValue),
          cgst: D(dto.cgst ?? '0'),
          sgst: D(dto.sgst ?? '0'),
          igst: D(dto.igst ?? '0'),
          section: dto.section ?? k.defaultSection,
          uploadedVia: via,
          uploadedBy: by,
          fileRef: file?.ref ?? null,
          fileSha256: file?.sha ?? null,
          fileName: file?.name.slice(0, 200) ?? null,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(`Invoice ${dto.invoiceNo} is already in for ${taxYear}.`);
      throw e;
    }
    const total = inv.taxableValue.add(inv.cgst).add(inv.sgst).add(inv.igst);
    const sub = await this.engine.submit(tx, c, {
      type: CONSULTANT_INVOICE,
      subjectType: 'consultant_invoice',
      subjectId: inv.id,
      title: `${k.name}: invoice ${inv.invoiceNo}`,
      summary: [
        { label: 'Invoice', value: `${inv.invoiceNo} of ${dto.invoiceDate}` },
        { label: 'Before GST', value: money(inv.taxableValue.toFixed(2)) },
        { label: 'Total', value: money(total.toFixed(2)) },
      ],
      subjectPersonId: null,
      requesterUserId: by,
      raisedByUserId: by,
      steps: [{ name: 'Payroll approval', approvers: [{ kind: 'users', userIds: approvers }], mode: 'any', remindAfterHours: 24 }],
      payload: {},
      payloadFields: [],
      fallbackUserIds: [],
    });
    await tx.consultantInvoice.update({ where: { id: inv.id }, data: { wfRequestId: sub.id } });
    await audit(tx, c, 'consultant.invoice.submitted', 'consultant_invoice', inv.id, { consultantId: k.id, invoiceNo: inv.invoiceNo, taxable: inv.taxableValue.toFixed(2), via, file: file?.sha ?? null });
    return { invoice: { ...inv, wfRequestId: sub.id }, notices: sub.notices };
  }

  private async storeInvoiceFile(org: string, entityId: string, file: Buffer | undefined, name: string | undefined) {
    if (!file) return null;
    if (!isPdf(file) || file.length > PDF_MAX_BYTES) throw new BadRequestException('Attach the invoice as a PDF of at most 5 MB.');
    return { ref: await this.files.put(`consultant-invoices/${org}/${entityId}/${randomBytes(12).toString('hex')}.pdf`, file), sha: sha256(file), name: name ?? 'invoice.pdf' };
  }

  async submit(ctx: TenantContext, user: ScopeUser, dto: StaffInvoiceDto, file?: { buffer: Buffer; originalname: string }) {
    const v = await this.viewer(user);
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const k = await this.consultantFor(tx, c, v, dto.consultantId);
      const stored = await this.storeInvoiceFile(c.organizationId, k.legalEntityId, file?.buffer, file?.originalname);
      return this.submitIn(tx, c, k, dto, 'staff', v.userId!, stored);
    });
    await this.engine.send(ctx, out.notices);
    return this.invoiceView(out.invoice);
  }

  async invoices(ctx: TenantContext, user: ScopeUser, q: InvoiceListDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await this.reach(tx, c, v, ['consultant.manage', 'consultant.invoice.approve']);
      const rows = await tx.consultantInvoice.findMany({
        where: { organizationId: c.organizationId, legalEntityId: { in: q.legalEntityId ? ids.filter((x) => x === q.legalEntityId) : ids }, ...(q.status ? { status: q.status } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      });
      const names = await tx.consultant.findMany({ where: { organizationId: c.organizationId, id: { in: [...new Set(rows.map((r) => r.consultantId))] } }, select: { id: true, name: true } });
      return rows.map((r) => ({ ...this.invoiceView(r, names.find((n) => n.id === r.consultantId)), uploadedByMe: r.uploadedBy === v.userId }));
    });
  }

  async invoiceFile(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const inv = await this.invoiceFor(tx, c, v, id, ['consultant.manage', 'consultant.invoice.approve']);
      if (!inv.fileRef) throw new NotFoundException('Not found');
      const file = await this.files.get(inv.fileRef);
      if (sha256(file) !== inv.fileSha256) throw new ConflictException('This file does not match the one uploaded.');
      await audit(tx, c, 'consultant.invoice.file_downloaded', 'consultant_invoice', inv.id, {});
      return { file, name: inv.fileName ?? `${inv.invoiceNo}.pdf` };
    });
  }

  /**
   * P03 decided. Approved: TDS from the rule set in force on the invoice date, on the value before GST; the year's
   * earlier invoices of the section count towards the threshold; without a (working) PAN the higher rate applies; a
   * s.197 certificate covers what is left of its limit. The consultant row is locked so two approvals never use the same
   * part of a threshold or certificate.
   */
  private async invoiceDecided(tx: Tx, wf: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const org = wf.organizationId;
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false } as CompanyContext;
    const all = await tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true } });
    await payScope(
      tx,
      all.map((e) => e.id),
    );
    const inv = await tx.consultantInvoice.findFirst({ where: { organizationId: org, id: wf.subjectId, status: 'submitted' } });
    if (!inv) return;
    if (outcome === 'rejected') {
      await tx.consultantInvoice.update({ where: { id: inv.id }, data: { status: 'rejected', version: { increment: 1 } } });
      await audit(tx, c, 'consultant.invoice.rejected', 'consultant_invoice', inv.id, {});
      return;
    }
    await tx.$queryRaw`SELECT id FROM consultants WHERE organization_id = ${org}::uuid AND id = ${inv.consultantId}::uuid FOR UPDATE`;
    const k = await tx.consultant.findFirstOrThrow({ where: { organizationId: org, id: inv.consultantId } });
    const on = dateOf(inv.invoiceDate);
    const rs = inForce(await this.rules.published(), 'IN.TDS-NONSAL', ['IN'], on);
    if (!rs) throw new ConflictException(`No published TDS rules for consultants are in force on ${on}.`);
    const prior = await tx.consultantInvoice.aggregate({ where: { organizationId: org, consultantId: k.id, section: inv.section, taxYear: inv.taxYear, status: { in: LIVE }, id: { not: inv.id } }, _sum: { taxableValue: true } });
    const cert = await tx.tds197Certificate.findFirst({
      where: { organizationId: org, consultantId: k.id, section: inv.section, validFrom: { lte: inv.invoiceDate }, validTo: { gte: inv.invoiceDate } },
      orderBy: { validFrom: 'desc' },
    });
    const t = tdsNonSalary(rs, {
      section: inv.section,
      amount: inv.taxableValue,
      priorInYear: prior._sum.taxableValue ?? ZERO,
      pan: k.panStatus === 'operative' ? 'ok' : (k.panStatus as 'missing' | 'inoperative'),
      payee: k.kind === 'individual' ? 'individual' : 'other',
      certificate: cert ? { rate: cert.rate.toString(), remaining: cert.limitAmount.sub(cert.consumed) } : null,
    });
    const gross = inv.taxableValue.add(inv.cgst).add(inv.sgst).add(inv.igst);
    const used = D(t.certificateUsed.toString());
    await tx.consultantInvoice.update({
      where: { id: inv.id },
      data: {
        status: 'approved',
        tdsAmount: D(t.tds.toString()),
        tdsBase: D(t.base.toString()),
        tdsRate: t.rate,
        tdsReason: t.reason,
        tdsRuleVersion: rs.version,
        tdsOn: asDate(todayIst()),
        certificateId: used.gt(0) ? cert!.id : null,
        certificateUsed: used,
        netPayable: gross.sub(t.tds.toString()),
        version: { increment: 1 },
      },
    });
    if (used.gt(0)) await tx.tds197Certificate.update({ where: { id: cert!.id }, data: { consumed: { increment: used } } });
    await audit(tx, c, 'consultant.invoice.approved', 'consultant_invoice', inv.id, { tds: t.tds.toString(), base: t.base.toString(), rate: t.rate, reason: t.reason, rules: `${rs.statute} ${rs.version}`, certificateUsed: used.toFixed(2) });
  }

  // ------------------------------------------------------------------------------------------ payments (PAY-8.02)

  /** The bank file for approved (or failed, to pay again) invoices of one legal entity, to accounts checked and past cooling. */
  async payout(ctx: TenantContext, user: ScopeUser, dto: ConsultantPayoutDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = await this.reach(tx, c, v, ['consultant.manage']);
      const invs = await tx.consultantInvoice.findMany({ where: { organizationId: org, id: { in: dto.invoiceIds } } });
      if (invs.length !== new Set(dto.invoiceIds).size || invs.some((i) => !ids.includes(i.legalEntityId))) throw new NotFoundException('Not found');
      const entity = invs[0].legalEntityId;
      if (invs.some((i) => i.legalEntityId !== entity)) throw new BadRequestException('One bank file pays one legal entity’s invoices.');
      const notReady = invs.filter((i) => !['approved', 'failed'].includes(i.status));
      if (notReady.length) throw new ConflictException(`Only approved invoices are paid (${notReady.map((i) => i.invoiceNo).join(', ')}).`);
      await tx.$queryRaw`SELECT id FROM consultant_invoices WHERE organization_id = ${org}::uuid AND id = ANY(${dto.invoiceIds}::uuid[]) FOR UPDATE`;
      const payDate = todayIst();
      const fmt = inForce(await this.rules.published(), 'IN.BANKFMT', ['GENERIC'], payDate);
      if (!fmt) throw new ConflictException(`No published bank format "GENERIC" is in force on ${payDate}.`);
      const ks = await tx.consultant.findMany({ where: { organizationId: org, id: { in: [...new Set(invs.map((i) => i.consultantId))] } } });
      const now = new Date();
      const problems: string[] = [];
      const rows = invs.map((i) => {
        const k = ks.find((x) => x.id === i.consultantId)!;
        if (!k.bankAccountEnc) problems.push(`${k.name}: no bank account.`);
        else if (!k.bankVerifiedAt) problems.push(`${k.name}: the bank account is not checked yet (penny-drop).`);
        else if (k.bankUsableFrom && k.bankUsableFrom > now) problems.push(`${k.name}: a new bank account is in its cooling period until ${k.bankUsableFrom.toISOString()}.`);
        return { inv: i, account: k.bankAccountEnc ? this.open(org, k.id, k.bankAccountEnc) : '', ifsc: k.bankIfsc ?? '', name: k.bankHolder ?? k.name, amount: i.netPayable!.toFixed(2), code: i.invoiceNo.slice(0, 20), narration: `Invoice ${i.invoiceNo}` };
      });
      if (problems.length) throw new ConflictException({ statusCode: 409, message: 'Some consultants cannot be paid yet.', problems });
      let out: Awaited<ReturnType<typeof writeBankFile>>;
      try {
        out = await writeBankFile(fmt.values as unknown as BankLayout, rows, { debitAccount: dto.debitAccount, date: payDate });
      } catch (e) {
        throw new BadRequestException(`The bank file could not be written: ${(e as Error).message}`);
      }
      const id = randomUUID();
      const total = rows.reduce((t, r) => t.add(r.amount), ZERO);
      const b = await tx.consultantPayoutBatch.create({
        data: {
          id,
          organizationId: org,
          legalEntityId: entity,
          formatKey: 'GENERIC',
          formatVersion: fmt.version,
          fileName: `consultants-${payDate}-${id.slice(0, 8)}.${out.ext}`,
          contentType: out.contentType,
          fileEnc: this.crypto.encrypt(`${org}:${id}:${out.data.toString('base64')}`),
          sha256: sha256(out.data),
          total,
          rowCount: rows.length,
          invoiceIds: invs.map((i) => i.id),
          generatedBy: v.userId!,
        },
      });
      await tx.consultantInvoice.updateMany({ where: { organizationId: org, id: { in: b.invoiceIds } }, data: { status: 'queued', payoutBatchId: b.id, paymentReason: null } });
      await audit(tx, c, 'consultant.payout.generated', 'consultant_payout_batch', b.id, { rows: b.rowCount, total: total.toFixed(2), sha256: b.sha256, format: `GENERIC ${fmt.version}`, debitLast4: dto.debitAccount.slice(-4) });
      return this.batchView(b, v);
    });
  }

  private batchView(b: Prisma.ConsultantPayoutBatchGetPayload<object>, v: Viewer) {
    return { id: b.id, legalEntityId: b.legalEntityId, fileName: b.fileName, rows: b.rowCount, total: b.total.toFixed(2), sha256: b.sha256, status: b.status, madeByMe: b.generatedBy === v.userId, releasedAt: b.releasedAt, releasePhrase: `RELEASE ${b.rowCount}`, createdAt: b.createdAt };
  }

  async batches(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await this.reach(tx, c, v, ['consultant.manage', 'payroll.bankfile.release']);
      const rows = await tx.consultantPayoutBatch.findMany({ where: { organizationId: c.organizationId, legalEntityId: { in: ids } }, orderBy: { createdAt: 'desc' }, take: 200 });
      return rows.map((b) => this.batchView(b, v));
    });
  }

  /** The stored file, decrypted and checked against its hash. */
  private openBatch(org: string, b: Prisma.ConsultantPayoutBatchGetPayload<object>) {
    const data = Buffer.from(this.open(org, b.id, b.fileEnc), 'base64');
    if (sha256(data) !== b.sha256) throw new ConflictException({ statusCode: 409, code: 'FILE_TAMPERED', message: 'This file does not match the one that was generated, so it cannot be used. Generate it again.' });
    return data;
  }

  async batchFile(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await this.reach(tx, c, v, ['consultant.manage', 'payroll.bankfile.release']);
      const b = await tx.consultantPayoutBatch.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!b || !ids.includes(b.legalEntityId)) throw new NotFoundException('Not found');
      const file = this.openBatch(c.organizationId, b);
      await audit(tx, c, 'consultant.payout.downloaded', 'consultant_payout_batch', b.id, { sha256: b.sha256 });
      return { file, name: b.fileName, contentType: b.contentType };
    });
  }

  /** Someone other than its maker releases the file (step-up by the route) after the typed phrase, the hash and the rows are checked again. */
  async release(ctx: TenantContext, user: ScopeUser, id: string, confirmation: ConfirmationDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = await this.reach(tx, c, v, ['payroll.bankfile.release']);
      await tx.$queryRaw`SELECT id FROM consultant_payout_batches WHERE organization_id = ${org}::uuid AND id = ${id}::uuid FOR UPDATE`;
      const b = await tx.consultantPayoutBatch.findFirst({ where: { organizationId: org, id } });
      if (!b || !ids.includes(b.legalEntityId)) throw new NotFoundException('Not found');
      if (b.generatedBy === v.userId) throw new ForbiddenException('You generated this file, so someone else must release it.');
      if (b.status !== 'draft') throw new ConflictException(b.status === 'released' ? 'This file is already released.' : 'This file can no longer be released.');
      const phrase = `RELEASE ${b.rowCount}`;
      if (confirmation.phrase !== phrase) throw new BadRequestException(`Type ${phrase} to confirm.`);
      this.openBatch(org, b);
      const invs = await tx.consultantInvoice.findMany({ where: { organizationId: org, id: { in: b.invoiceIds } } });
      const total = invs.reduce((t, i) => t.add(i.netPayable ?? 0), ZERO);
      if (invs.length !== b.rowCount || !total.eq(b.total) || invs.some((i) => i.status !== 'queued' || i.payoutBatchId !== b.id)) {
        throw new ConflictException('The invoices changed after this file was generated. Generate it again.');
      }
      await tx.consultantPayoutBatch.update({ where: { id: b.id }, data: { status: 'released', releasedBy: v.userId!, releasedAt: new Date() } });
      await tx.consultantInvoice.updateMany({ where: { organizationId: org, id: { in: b.invoiceIds } }, data: { status: 'sent' } });
      await audit(tx, c, 'consultant.payout.released', 'consultant_payout_batch', b.id, { rows: b.rowCount, total: b.total.toFixed(2), sha256: b.sha256, confirmed: { phrase: confirmation.phrase, impact: confirmation.impact } });
      return { id: b.id, status: 'released' };
    });
  }

  /** The bank's answer per invoice: paid (with its reference) or failed (back to approved-and-unpaid, to pay again). */
  async results(ctx: TenantContext, user: ScopeUser, id: string, dto: ConsultantResultsDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = await this.reach(tx, c, v, ['consultant.manage']);
      const b = await tx.consultantPayoutBatch.findFirst({ where: { organizationId: org, id } });
      if (!b || !ids.includes(b.legalEntityId)) throw new NotFoundException('Not found');
      if (b.status !== 'released') throw new ConflictException('Record results once the file is released.');
      const today = todayIst();
      for (const r of dto.rows) {
        if (!b.invoiceIds.includes(r.invoiceId)) throw new BadRequestException('An invoice is not in this file.');
        if (r.status === 'failed' && !r.reason) throw new BadRequestException('Say why a payment failed.');
        const n = await tx.consultantInvoice.updateMany({
          where: { organizationId: org, id: r.invoiceId, status: 'sent', payoutBatchId: b.id },
          data: r.status === 'paid' ? { status: 'paid', paidOn: asDate(today), paymentRef: r.ref ?? null } : { status: 'failed', paymentReason: r.reason!, payoutBatchId: null },
        });
        if (!n.count) throw new ConflictException('An invoice already has its result.');
      }
      const waiting = await tx.consultantInvoice.count({ where: { organizationId: org, payoutBatchId: b.id, status: 'sent' } });
      if (!waiting) await tx.consultantPayoutBatch.update({ where: { id: b.id }, data: { status: 'confirmed' } });
      await audit(tx, c, 'consultant.payout.results', 'consultant_payout_batch', b.id, { paid: dto.rows.filter((r) => r.status === 'paid').length, failed: dto.rows.filter((r) => r.status === 'failed').length });
      return { id: b.id, status: waiting ? 'released' : 'confirmed' };
    });
  }

  /** The payment advice of a paid invoice (made on request from the stored figures; nothing new is kept). */
  private async advice(tx: Tx, org: string, inv: Invoice) {
    if (inv.status !== 'paid') throw new ConflictException('A payment advice is ready once the invoice is paid.');
    const k = await tx.consultant.findFirstOrThrow({ where: { organizationId: org, id: inv.consultantId } });
    const e = await entityName(tx, org, inv.legalEntityId);
    const gst = inv.cgst.add(inv.sgst).add(inv.igst);
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Payment advice ${inv.invoiceNo}`, Author: e.name } });
    const parts: Buffer[] = [];
    doc.on('data', (b: Buffer) => parts.push(b));
    const done = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(parts))));
    doc.fontSize(16).text('Payment advice').moveDown(0.5).fontSize(10).text(e.name).moveDown();
    const line = (label: string, value: string) => doc.text(`${label}: ${value}`);
    line('Paid to', k.name);
    line('Invoice', `${inv.invoiceNo} of ${dateOf(inv.invoiceDate)}`);
    line('Value before GST', money(inv.taxableValue.toFixed(2)));
    line('GST', money(gst.toFixed(2)));
    line(`TDS (section ${SECTION_LABEL[inv.section] ?? inv.section})`, money((inv.tdsAmount ?? ZERO).toFixed(2)));
    line('Paid', money(inv.netPayable!.toFixed(2)));
    line('Paid on', dateOf(inv.paidOn!));
    line('Bank reference', inv.paymentRef ?? '—');
    line('Account', k.bankAccountLast4 ? `•••• ${k.bankAccountLast4}` : '—');
    doc.moveDown().fontSize(8).text('The TDS certificate (Form 16A / Form 131) for the quarter is issued after the quarterly return is filed.');
    doc.end();
    return { file: await done, name: `payment-advice-${inv.invoiceNo.replace(/[^A-Za-z0-9]+/g, '-')}.pdf` };
  }

  async adviceFile(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => this.advice(tx, c.organizationId, await this.invoiceFor(tx, c, v, id, ['consultant.manage'])));
  }

  // ------------------------------------------------------------------------------------------ the consultant's sign-in

  private otpKey(org: string, email: string) {
    return `consultant-portal-otp:${org}:${this.crypto.hmac('consultant-portal-email', email)}`;
  }

  private async orgOf(slug: string) {
    const o = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.organization.findUnique({ where: { slug }, select: { id: true } }));
    if (!o) throw new NotFoundException('No such company.');
    return o.id;
  }

  /** An active consultant with this email (the pay guard opened just for this one lookup). */
  private async consultantByEmail(tx: Tx, org: string, email: string) {
    const all = await tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true } });
    await payScope(
      tx,
      all.map((e) => e.id),
    );
    // DECISION NEEDED: one email on the register of two legal entities signs in to the older record only.
    const k = await tx.consultant.findFirst({ where: { organizationId: org, email, status: 'active' }, orderBy: { createdAt: 'asc' } });
    await payScope(tx, []);
    return k;
  }

  /** Step 1: a code by email; the same answer whether or not the email is on the register. */
  async portalCode(slug: string, dto: ConsultantPortalEmailDto, ip: string | null) {
    const org = await this.orgOf(slug);
    const email = dto.email.toLowerCase();
    await this.otp.reserveSend(`consultant-portal:${org}:${email}`, ip);
    const k = await this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, (tx) => this.consultantByEmail(tx, org, email));
    if (k) {
      const code = await this.otp.issue(this.otpKey(org, email), { email });
      this.otp.deliver('email', email, code, 'sign_in', org, { userId: '' });
    }
    return { sent: true };
  }

  async portalVerify(slug: string, dto: ConsultantPortalVerifyDto) {
    const org = await this.orgOf(slug);
    const email = dto.email.toLowerCase();
    const data = await this.otp.check(this.otpKey(org, email), dto.code);
    if (!data || data.email !== email) throw new UnauthorizedException('That code is not right or has expired. Ask for a new one.');
    return this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, async (tx) => {
      const k = await this.consultantByEmail(tx, org, email);
      if (!k) throw new UnauthorizedException('That code is not right or has expired. Ask for a new one.');
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + PORTAL_MINUTES * 60_000);
      await tx.consultantPortalSession.create({ data: { organizationId: org, consultantId: k.id, tokenHash: tokenHash(token), expiresAt } });
      await audit(tx, { organizationId: org, isSuperAdmin: false } as CompanyContext, 'consultant.portal.signed_in', 'consultant', k.id, {});
      return { token, expiresAt };
    });
  }

  /** Every portal call runs with app.consultant_portal set: the database shows that consultant's own rows and nothing else. */
  private async inPortal<T>(slug: string, token: string | undefined, fn: (tx: Tx, s: PortalSession) => Promise<T>): Promise<T> {
    if (!token) throw new UnauthorizedException('Sign in again.');
    const org = await this.orgOf(slug);
    return this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, async (tx) => {
      const s = await tx.consultantPortalSession.findFirst({ where: { organizationId: org, tokenHash: tokenHash(token), endedAt: null, expiresAt: { gt: new Date() } } });
      if (!s) throw new UnauthorizedException('Sign in again.');
      await tx.$executeRaw`SELECT set_config('app.consultant_portal', ${s.consultantId}, true)`;
      return fn(tx, { org, consultantId: s.consultantId, fresh: Date.now() - s.createdAt.getTime() < FRESH_MINUTES * 60_000 });
    });
  }

  async portalMe(slug: string, token: string | undefined) {
    return this.inPortal(slug, token, async (tx, s) => {
      const k = await tx.consultant.findFirstOrThrow({ where: { organizationId: s.org, id: s.consultantId } });
      const invoices = await tx.consultantInvoice.findMany({ where: { organizationId: s.org, consultantId: k.id }, orderBy: { createdAt: 'desc' }, take: 500 });
      const certificates = await tx.consultantCertificate.findMany({ where: { organizationId: s.org, consultantId: k.id, status: 'issued' }, orderBy: [{ taxYear: 'desc' }, { quarter: 'desc' }] });
      const { bank, ...me } = this.view(k);
      return {
        me: { ...me, bank: bank ? { account: bank.account, usable: bank.usable } : null, company: (await entityName(tx, s.org, k.legalEntityId)).name },
        canUpload: s.fresh,
        invoices: invoices.map((i) => this.invoiceView(i)),
        certificates: certificates.map((x) => ({ id: x.id, taxYear: x.taxYear, quarter: x.quarter, form: x.formCode === '131' ? 'Form 131' : 'Form 16A' })),
      };
    });
  }

  /** The consultant's own upload: a PDF, from a session signed in within the last few minutes. */
  async portalSubmit(slug: string, token: string | undefined, dto: InvoiceDto, file: { buffer: Buffer; originalname: string } | undefined) {
    if (!file) throw new BadRequestException('Attach the invoice as a PDF.');
    const orgSlug = slug;
    const out = await this.inPortal(orgSlug, token, async (tx, s) => {
      if (!s.fresh) throw new UnauthorizedException({ statusCode: 401, code: 'STEP_UP_REQUIRED', message: 'Sign in again with a new code to send an invoice.' });
      const k = await tx.consultant.findFirstOrThrow({ where: { organizationId: s.org, id: s.consultantId } });
      const stored = await this.storeInvoiceFile(s.org, k.legalEntityId, file.buffer, file.originalname);
      const c = { organizationId: s.org, isSuperAdmin: false } as CompanyContext;
      const r = await this.submitIn(tx, c, k, dto, 'consultant', null, stored);
      return { ...r, org: s.org };
    });
    await this.engine.send({ organizationId: out.org, isSuperAdmin: false } as TenantContext, out.notices);
    return this.invoiceView(out.invoice);
  }

  async portalAdvice(slug: string, token: string | undefined, id: string) {
    return this.inPortal(slug, token, async (tx, s) => {
      const inv = await tx.consultantInvoice.findFirst({ where: { organizationId: s.org, id, consultantId: s.consultantId } });
      if (!inv) throw new NotFoundException('Not found');
      return this.advice(tx, s.org, inv);
    });
  }

  async portalCertificate(slug: string, token: string | undefined, id: string) {
    return this.inPortal(slug, token, async (tx, s) => {
      const x = await tx.consultantCertificate.findFirst({ where: { organizationId: s.org, id, consultantId: s.consultantId, status: 'issued' } });
      if (!x) throw new NotFoundException('Not found');
      const file = await this.files.get(x.fileRef);
      if (sha256(file) !== x.sha256) throw new ConflictException('This file does not match the one issued.');
      await audit(tx, { organizationId: s.org, isSuperAdmin: false } as CompanyContext, 'consultant.portal.certificate_downloaded', 'consultant_certificate', x.id, {});
      return { file, name: `form-${x.formCode.toLowerCase()}-${x.taxYear}-q${x.quarter}.pdf` };
    });
  }

  async portalSignOut(slug: string, token: string | undefined) {
    if (!token) return { ok: true };
    const org = await this.orgOf(slug);
    await this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, (tx) => tx.consultantPortalSession.updateMany({ where: { organizationId: org, tokenHash: tokenHash(token), endedAt: null }, data: { endedAt: new Date() } }));
    return { ok: true };
  }

  // ------------------------------------------------------------------------------------------ Form 140 / 26Q (PAY-8.04)

  /** The month's non-salary challans, one per section (shared with the salary challan's deposit flow), from the TDS deducted. */
  async prepareChallans(ctx: TenantContext, user: ScopeUser, entityId: string, month: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await requireEntity(tx, c, v, 'statutory.challan.manage', entityId);
      await payScope(tx, [entityId]);
      const from = asDate(`${month}-01`);
      const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0));
      const groups = await tx.consultantInvoice.groupBy({ by: ['section'], where: { organizationId: org, legalEntityId: entityId, status: { in: LIVE }, tdsOn: { gte: from, lte: to }, tdsAmount: { gt: 0 } }, _sum: { tdsAmount: true }, _count: true });
      const out = [];
      for (const g of groups) {
        const key = { organizationId: org, legalEntityId: entityId, depositMonth: from, subjectKey: CHALLAN_KEY(g.section) };
        const tds = g._sum.tdsAmount ?? ZERO;
        const old = await tx.tdsChallan.findFirst({ where: key });
        if (old?.status === 'deposited') {
          out.push({ id: old.id, section: g.section, tds: old.tds.toFixed(2), status: old.status });
          continue;
        }
        const prefill = { tds: tds.toFixed(2), invoices: g._count, at: new Date().toISOString() };
        const row = old
          ? await tx.tdsChallan.update({ where: { id: old.id }, data: { tds, prefill, editReason: null, updatedBy: v.userId!, updatedAt: new Date() } })
          : await tx.tdsChallan.create({ data: { ...key, lawVersion: lawVersionFor(taxYearOf(month)), tds, prefill, updatedBy: v.userId! } });
        await audit(tx, c, 'statutory.challan.prepared', 'tds_challan', row.id, { month, section: g.section, tds: tds.toFixed(2) });
        out.push({ id: row.id, section: g.section, tds: row.tds.toFixed(2), status: row.status });
      }
      return out;
    });
  }

  /** Deductee rows of a quarter: one per invoice with TDS deducted (or lower deduction under a s.197 certificate). */
  private async nonSalaryRows(tx: Tx, org: string, entityId: string, taxYear: string, quarter: number) {
    const months = quarterMonths(taxYear, quarter);
    const from = asDate(`${months[0]}-01`);
    const last = asDate(`${months[2]}-01`);
    const to = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 0));
    const invs = await tx.consultantInvoice.findMany({ where: { organizationId: org, legalEntityId: entityId, status: { in: LIVE }, tdsOn: { gte: from, lte: to }, OR: [{ tdsAmount: { gt: 0 } }, { certificateUsed: { gt: 0 } }] }, orderBy: { tdsOn: 'asc' } });
    const ks = await tx.consultant.findMany({ where: { organizationId: org, id: { in: [...new Set(invs.map((i) => i.consultantId))] } } });
    return invs.map((i) => {
      const k = ks.find((x) => x.id === i.consultantId)!;
      return {
        invoiceId: i.id,
        consultantId: k.id,
        name: k.name,
        kind: k.kind,
        panEnc: k.panEnc,
        panLast4: k.panLast4,
        noPan: k.panStatus !== 'operative',
        section: i.section,
        month: dateOf(i.tdsOn!).slice(0, 7),
        tdsOn: dateOf(i.tdsOn!),
        paidOn: dateOf(i.paidOn ?? i.tdsOn!),
        paid: i.taxableValue.toFixed(2),
        tds: i.tdsAmount!.toFixed(2),
        rate: i.tdsRate ?? '0',
        lowerCertificate: i.certificateUsed.gt(0),
      };
    });
  }

  private returnView(r: Prisma.TdsReturnGetPayload<object>) {
    const rows = r.rows as { tds: string }[];
    return { id: r.id, legalEntityId: r.legalEntityId, formCode: r.formCode, taxYear: r.taxYear, quarter: r.quarter, status: r.status, tokenNo: r.tokenNo, reconciliation: r.reconciliation, fileId: r.exchangeFileId, rows: rows.length, tds: rows.reduce((t, x) => t.add(x.tds), ZERO).toFixed(2), deductees: rows };
  }

  async returns(ctx: TenantContext, user: ScopeUser, entityId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await requireEntity(tx, c, v, 'statutory.filing.view', entityId);
      await payScope(tx, [entityId]);
      const rows = await tx.tdsReturn.findMany({ where: { organizationId: c.organizationId, legalEntityId: entityId, formCode: { in: ['26Q', '140'] } }, orderBy: [{ taxYear: 'desc' }, { quarter: 'desc' }] });
      return rows.map((r) => this.returnView(r));
    });
  }

  /** Form 140 (from April 2026; 26Q before) for the quarter, drafted again from the invoices until it is filed. */
  async draftReturn(ctx: TenantContext, user: ScopeUser, entityId: string, taxYear: string, quarter: number) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await requireEntity(tx, c, v, 'statutory.filing.generate', entityId);
      await payScope(tx, [entityId]);
      const law = lawVersionFor(taxYear);
      const formCode = law === 'IT-2025' ? '140' : '26Q';
      const old = await tx.tdsReturn.findFirst({ where: { organizationId: org, legalEntityId: entityId, taxYear, quarter, kind: 'original', formCode } });
      if (old?.status === 'filed') throw new ConflictException('This return is filed.');
      const rows = (await this.nonSalaryRows(tx, org, entityId, taxYear, quarter)).map(({ panEnc, ...r }) => r);
      const data = { rows: rows as unknown as Prisma.InputJsonValue, reconciliation: Prisma.DbNull, status: 'draft', exchangeFileId: null };
      const r = old ? await tx.tdsReturn.update({ where: { id: old.id }, data }) : await tx.tdsReturn.create({ data: { organizationId: org, legalEntityId: entityId, formCode, lawVersion: law, taxYear, quarter, createdBy: v.userId!, ...data } });
      await audit(tx, c, 'statutory.tds_return.drafted', 'tds_return', r.id, { formCode, taxYear, quarter, rows: rows.length });
      return this.returnView(r);
    });
  }

  private async nonSalaryReturn(tx: Tx, c: CompanyContext, v: Viewer, id: string, key: PayKey) {
    const ids = await this.reach(tx, c, v, [key]);
    const r = await tx.tdsReturn.findFirst({ where: { organizationId: c.organizationId, id, formCode: { in: ['26Q', '140'] } } });
    if (!r || !ids.includes(r.legalEntityId)) throw new NotFoundException('Not found');
    return r;
  }

  private async challansOf(tx: Tx, org: string, r: Prisma.TdsReturnGetPayload<object>) {
    const months = quarterMonths(r.taxYear, r.quarter);
    return tx.tdsChallan.findMany({ where: { organizationId: org, legalEntityId: r.legalEntityId, subjectKey: { startsWith: 'nonsal_' }, depositMonth: { in: months.map((m) => asDate(`${m}-01`)) } } });
  }

  /** Deducted per month and section against the deposited challans; the file is made only at zero difference. */
  async reconcile(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await this.nonSalaryReturn(tx, c, v, id, 'statutory.filing.generate');
      if (r.status === 'filed') throw new ConflictException('This return is filed.');
      const rows = r.rows as { month: string; section: Section; tds: string }[];
      const challans = await this.challansOf(tx, c.organizationId, r);
      const keys = [...new Set([...rows.map((x) => `${x.month}|${x.section}`), ...challans.map((x) => `${dateOf(x.depositMonth).slice(0, 7)}|${x.subjectKey.slice(7)}`)])].sort();
      const lines = keys.map((key) => {
        const [month, section] = key.split('|');
        const deducted = rows.filter((x) => x.month === month && x.section === section).reduce((t, x) => t.add(x.tds), ZERO);
        const ch = challans.find((x) => dateOf(x.depositMonth).slice(0, 7) === month && x.subjectKey === CHALLAN_KEY(section));
        const deposited = ch?.status === 'deposited' ? ch.tds : ZERO;
        return { month, section, deducted: deducted.toFixed(2), deposited: deposited.toFixed(2), difference: deducted.sub(deposited).toFixed(2), challan: ch?.challanNo ?? null };
      });
      const ok = lines.every((l) => D(l.difference).isZero());
      const row = await tx.tdsReturn.update({ where: { id: r.id }, data: { reconciliation: { lines, ok, at: new Date().toISOString() } as unknown as Prisma.InputJsonValue, status: ok ? 'reconciled' : 'draft' } });
      await audit(tx, c, 'statutory.tds_return.reconciled', 'tds_return', r.id, { ok, lines });
      return this.returnView(row);
    });
  }

  /**
   * The return in the e-TDS layout (format "verify"): a challan record per month and section, its deductees under it,
   * full PANs only in the file. Kept as an exchange file and downloaded through the audited link.
   * DECISION NEEDED: the FVU check of 5f-D1 / 5g-D1 (upload of the .fvu) is not wired for 26Q / 140 yet.
   */
  async returnFile(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const r = await this.nonSalaryReturn(tx, c, v, id, 'statutory.filing.generate');
      if (r.status !== 'reconciled') throw new ConflictException('Reconcile the return with the challans first (the difference must be zero).');
      const rows = await this.nonSalaryRows(tx, org, r.legalEntityId, r.taxYear, r.quarter);
      const problems: string[] = [];
      const deductor = await etdsDeductor(tx, org, r.legalEntityId, problems);
      if (problems.length) throw new BadRequestException({ statusCode: 400, message: 'Fix these before the return file is made.', problems });
      const rs = inForce(await this.rules.published(), 'IN.TDS-NONSAL', ['IN'], quarterMonths(r.taxYear, r.quarter)[0] + '-01');
      const codeOf = (s: string) => ((rs?.values as { sections?: Record<string, { returnCode: string }> } | undefined)?.sections?.[s]?.returnCode ?? s.slice(1));
      const challans = (await this.challansOf(tx, org, r)).filter((x) => x.status === 'deposited');
      const groups = [...new Set(rows.map((x) => `${x.month}|${x.section}`))].sort();
      const data = etdsFile({
        formNo: r.formCode as '26Q' | '140',
        taxYear: r.taxYear,
        quarter: r.quarter,
        createdOn: localDate(new Date(), await entityTimeZone(tx, org, r.legalEntityId)),
        deductor: deductor!,
        challans: groups.map((g) => {
          const [month, section] = g.split('|');
          const ch = challans.find((x) => dateOf(x.depositMonth).slice(0, 7) === month && x.subjectKey === CHALLAN_KEY(section))!;
          return {
            bsr: ch.bsrCode!,
            challanNo: ch.challanNo!,
            depositDate: dateOf(ch.depositDate!),
            tds: ch.tds.toFixed(2),
            interest: ch.interest.toFixed(2),
            fee: ch.fee.toFixed(2),
            section: codeOf(section),
            deductees: rows
              .filter((x) => x.month === month && x.section === section)
              .map((x) => ({ pan: x.panEnc && !x.noPan ? this.open(org, x.consultantId, x.panEnc) : null, name: x.name, paid: x.paid, tds: x.tds, paidOn: x.paidOn, deductedOn: x.tdsOn, noPan: x.noPan, code: '02', rate: (Number(x.rate) * 100).toFixed(4), lowerCertificate: x.lowerCertificate })),
          };
        }),
      });
      const f = await this.exchange.generateIn(tx, c, {
        legalEntityId: r.legalEntityId,
        kind: 'form140',
        ownerType: 'tds_return',
        ownerId: r.id,
        periodStart: null,
        fileName: `${r.formCode.toLowerCase()}-${r.taxYear}-q${r.quarter}.txt`,
        contentType: 'text/plain',
        data,
        rows: rows.length,
        totals: { tds: rows.reduce((t, x) => t.add(x.tds), ZERO).toFixed(2) },
        by: v.userId!,
      });
      const row = await tx.tdsReturn.update({ where: { id: r.id }, data: { exchangeFileId: f.id } });
      await audit(tx, c, 'statutory.tds_return.file_generated', 'tds_return', r.id, { formCode: r.formCode, fileId: f.id, sha256: f.sha256, rows: rows.length });
      return this.returnView(row);
    });
  }

  /** Filed on the portal: the token number, confirmed by the typed phrase. */
  async markFiled(ctx: TenantContext, user: ScopeUser, id: string, tokenNo: string, confirmation: ConfirmationDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await this.nonSalaryReturn(tx, c, v, id, 'statutory.filing.generate');
      if (r.status !== 'reconciled' || !r.exchangeFileId) throw new ConflictException('Make the return file first.');
      const phrase = `FILED ${r.formCode} Q${r.quarter} ${r.taxYear}`;
      if (confirmation.phrase !== phrase) throw new BadRequestException(`Type ${phrase} to confirm.`);
      const row = await tx.tdsReturn.update({ where: { id: r.id }, data: { status: 'filed', tokenNo, filedBy: v.userId!, filedAt: new Date() } });
      await audit(tx, c, 'statutory.tds_return.filed', 'tds_return', r.id, { formCode: r.formCode, quarter: r.quarter, taxYear: r.taxYear, tokenNo });
      return this.returnView(row);
    });
  }

  // ------------------------------------------------------------------------------------------ Form 131 / 16A (PAY-8.04)

  /**
   * The TRACES ZIP of the quarter's certificates (one PDF per deductee, its PAN in the file name), matched to the
   * register by the PAN's hash. A certificate already issued for the quarter is superseded. Unmatched files are listed.
   */
  async importCertificates(ctx: TenantContext, user: ScopeUser, dto: Form131ImportDto, zip: Buffer | undefined) {
    const v = await this.viewer(user);
    if (!zip?.length || zip.length > ZIP_MAX_BYTES || zip.subarray(0, 2).toString('latin1') !== 'PK') throw new BadRequestException('Attach the ZIP downloaded from TRACES (at most 50 MB).');
    let archive: JSZip;
    try {
      archive = await JSZip.loadAsync(zip);
    } catch {
      throw new BadRequestException('The file is not a ZIP that can be read.');
    }
    const entries = Object.values(archive.files).filter((f) => !f.dir && /\.pdf$/i.test(f.name));
    if (!entries.length || entries.length > ZIP_MAX_FILES) throw new BadRequestException(`The ZIP holds 1 to ${ZIP_MAX_FILES} PDF certificates.`);
    // shortcut: JSZip has no public size before inflating; a PDF over the cap is refused right after, upgrade to a streaming reader if TRACES ZIPs grow.
    const pdfs: { name: string; pan: string | null; data: Buffer }[] = [];
    for (const e of entries) {
      const data = await e.async('nodebuffer');
      if (data.length > PDF_MAX_BYTES || !isPdf(data)) throw new BadRequestException(`${e.name.slice(0, 80)} is not a PDF of at most 5 MB.`);
      pdfs.push({ name: e.name.split('/').pop()!.slice(0, 120), pan: e.name.toUpperCase().match(PAN)?.[0] ?? null, data });
    }
    const formCode = lawVersionFor(dto.taxYear) === 'IT-2025' ? '131' : '16A';
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await requireEntity(tx, c, v, 'consultant.manage', dto.legalEntityId);
      await payScope(tx, [dto.legalEntityId]);
      const matched: { consultantId: string; name: string; file: string }[] = [];
      const unmatched: string[] = [];
      for (const p of pdfs) {
        const k = p.pan ? await tx.consultant.findFirst({ where: { organizationId: org, legalEntityId: dto.legalEntityId, panHash: this.crypto.hmac('consultant.pan', `${org}:${p.pan}`) } }) : null;
        if (!k) {
          unmatched.push(p.name);
          continue;
        }
        const ref = await this.files.put(`consultant-certificates/${org}/${dto.legalEntityId}/${randomBytes(12).toString('hex')}.pdf`, p.data);
        await tx.consultantCertificate.updateMany({ where: { organizationId: org, consultantId: k.id, taxYear: dto.taxYear, quarter: dto.quarter, status: 'issued' }, data: { status: 'superseded' } });
        const x = await tx.consultantCertificate.create({ data: { organizationId: org, legalEntityId: dto.legalEntityId, consultantId: k.id, taxYear: dto.taxYear, quarter: dto.quarter, formCode, fileRef: ref, sha256: sha256(p.data), issuedBy: v.userId! } });
        await audit(tx, c, 'consultant.certificate.issued', 'consultant_certificate', x.id, { consultantId: k.id, formCode, taxYear: dto.taxYear, quarter: dto.quarter, sha256: x.sha256 });
        matched.push({ consultantId: k.id, name: k.name, file: p.name });
      }
      await audit(tx, c, 'consultant.certificates.imported', 'legal_entity', dto.legalEntityId, { formCode, taxYear: dto.taxYear, quarter: dto.quarter, matched: matched.length, unmatched: unmatched.length });
      return { formCode, matched, unmatched };
    });
  }
}
