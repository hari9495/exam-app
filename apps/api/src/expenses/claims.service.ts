import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { ScopeUser, Viewer, buildViewer, covers, grantPeriods, started, tenantWide } from '../access/scope';
import { ApprovalsEngine, type StepSpec } from '../workflow/approvals-engine.service';
import { FilesService } from '../documents/files.service';
import { holdersOf, hrApprovers } from '../time/time-core';
import { checkLimit, dupKey, gstMathsProblem, gstinProblem, itcStatusOf, merchantsAlike, mileageAmount, perDiemAmount, receiptNeed, riskOf, ruleFor, taxablePart, tierFor } from './checks';
import type { ApproveAmountDto, ClaimDto, LineDto } from './claims-dto';
import { checkEinvoiceQr, keysFromPem } from './einvoice';
import { RECEIPT_READER, type ReceiptReader } from './ocr';
import { lowConfidence, type OcrFields } from './ocr-parse';
import { ExpenseSetupService } from './setup.service';
import { closeTripIfDone, settleAdvanceByClaim } from './trips.service';
import { FX_TOLERANCE_PCT, LOOK_ALIKE_BITS, toPay, variancePct } from './fx';
import { fxRateFor } from './setup.service';

// Expenses batch E2 (M05-BUILD-DESIGN §8, §9, §13, §15; XP-2.01 … XP-2.08): claims and lines, snap-first receipts
// (OCR suggestions only, every read line confirmed by the employee), the policy check, computed mileage and per diem,
// duplicate and fraud flags, GST capture, the P03 route with approve-with-changes and send-back, and finance's check.
//   who sees   the claimant; approvers holding or having held a task on it; expense.claim.view in scope (like
//              employee records); expense.finance.review for the claim's legal entity (§5.8, §16)
//   money      always in the claim's pay currency (E5 adds receipt currencies); approved never above claimed, and a
//              reduction always carries a reason shown to the employee (YX-EXP-02)
//   never      OCR submits or approves nothing; a client-chosen approver does not exist; paid lines never change

export const CLAIM_TYPE = 'expense.claim';
const KEYS = ['expense.claim.view', 'expense.finance.review'] as const;
const RECEIPT_MIME = ['application/pdf', 'image/jpeg', 'image/png'] as const;
const LIVE_CLAIMS = ['draft', 'submitted', 'sent_back', 'approved', 'partly_approved'];
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const money = (x: Prisma.Decimal | null) => (x === null ? null : x.toFixed(2));
const addDays = (d: string, n: number) => iso(new Date(asDate(d).getTime() + n * 86_400_000));

type Claim = Prisma.ExpenseClaimGetPayload<object>;
type Line = Prisma.ExpenseLineGetPayload<object>;
type Access = { own: boolean; approver: boolean; openTaskId: string | null; openStep: number | null; finance: boolean; scope: boolean };
type FlagDraft = { kind: string; detail: string; lineId: string | null; block?: boolean };

@Injectable()
export class ExpenseClaimsService implements OnModuleInit {
  private readonly qrKeys = keysFromPem(process.env.EINVOICE_QR_PUBLIC_KEYS);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly setup: ExpenseSetupService,
    private readonly files: FilesService,
    private readonly engine: ApprovalsEngine,
    @Inject(RECEIPT_READER) private readonly reader: ReceiptReader,
  ) {}

  onModuleInit() {
    this.engine.register({
      key: CLAIM_TYPE,
      label: 'Expense claim',
      risk: 'normal',
      autoActions: false,
      distinctSteps: true,
      onDecided: (tx, req, outcome) => this.decided(tx, req, outcome),
      requesterLink: (req) => `/yx/expenses/claims/${req.subjectId}`,
    });
  }

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, [...KEYS]);
  }

  // ------------------------------------------------------------------------------------------ access

  private async myEmployee(tx: Tx, org: string, v: Viewer) {
    if (!v.userId || v.actingForOther) return null;
    return tx.employee.findFirst({ where: { organizationId: org, userId: v.userId }, select: { id: true, personId: true, userId: true } });
  }

  private async access(tx: Tx, c: CompanyContext, v: Viewer, claim: Claim): Promise<Access> {
    const org = c.organizationId;
    const me = await this.myEmployee(tx, org, v);
    const own = me?.id === claim.employeeId;
    let approver = false;
    let openTaskId: string | null = null;
    let openStep: number | null = null;
    if (claim.wfRequestId && v.userId) {
      const tasks = await tx.wfTask.findMany({ where: { organizationId: org, requestId: claim.wfRequestId, assigneeUserId: v.userId }, select: { id: true, status: true, step: true } });
      approver = tasks.length > 0;
      const req = await tx.wfRequest.findFirst({ where: { organizationId: org, id: claim.wfRequestId }, select: { status: true, currentStep: true } });
      const open = req?.status === 'pending' ? tasks.find((t) => t.status === 'open' && t.step === req.currentStep) : undefined;
      openTaskId = open?.id ?? null;
      openStep = open?.step ?? null;
    }
    const finance = !v.actingForOther && v.grants.has('expense.finance.review') && (tenantWide(v, 'expense.finance.review') || (v.scopes.get('expense.finance.review') ?? []).some((s) => s.type === 'legal_entity' && s.id === claim.legalEntityId));
    const today = todayIst();
    const scope = v.grants.has('expense.claim.view') && covers(started(await grantPeriods(tx, c, v, 'expense.claim.view', claim.employeeId, me?.id ?? null), today), today);
    return { own, approver, openTaskId, openStep, finance, scope };
  }

  private async claimOr404(tx: Tx, c: CompanyContext, v: Viewer, id: string) {
    const claim = await tx.expenseClaim.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!claim) throw new NotFoundException('No such claim.');
    const a = await this.access(tx, c, v, claim);
    // Someone with no reason to see it is told it does not exist.
    if (!a.own && !a.approver && !a.finance && !a.scope) throw new NotFoundException('No such claim.');
    return { claim, a };
  }

  private editable(claim: Claim, a: Access) {
    if (!a.own) throw new ForbiddenException('Only the person claiming can change the claim.');
    if (claim.status !== 'draft' && claim.status !== 'sent_back') throw new ConflictException('This claim is with the approvers; withdraw it first to change it.');
  }

  // ------------------------------------------------------------------------------------------ claims

  async create(ctx: TenantContext, user: ScopeUser, dto: ClaimDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await this.myEmployee(tx, org, v);
      if (!me) throw new ForbiddenException('Only employees can claim expenses.');
      const today = todayIst();
      const job = await tx.employeeAssignment.findFirst({ where: { organizationId: org, employeeId: me.id, supersededAt: null, validFrom: { lte: asDate(today) }, OR: [{ validTo: null }, { validTo: { gte: asDate(today) } }] }, orderBy: { validFrom: 'desc' }, select: { employmentId: true, legalEntityId: true } });
      if (!job) throw new ForbiddenException('You have no current job to claim against.');
      const entity = await tx.legalEntity.findFirstOrThrow({ where: { organizationId: org, id: job.legalEntityId }, select: { currency: true } });
      const claim = await tx.expenseClaim.create({ data: { organizationId: org, employeeId: me.id, employmentId: job.employmentId, legalEntityId: job.legalEntityId, title: dto.title, currency: entity.currency, createdBy: v.userId, ...(await this.linkFor(tx, org, me.id, dto)) } });
      await audit(tx, c, 'expense.claim.created', 'expense_claim', claim.id, {});
      return this.view(tx, c, claim, { own: true, approver: false, openTaskId: null, openStep: null, finance: false, scope: false });
    });
  }

  async rename(ctx: TenantContext, user: ScopeUser, id: string, dto: ClaimDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { claim, a } = await this.claimOr404(tx, c, v, id);
      this.editable(claim, a);
      const n = await tx.expenseClaim.updateMany({ where: { organizationId: c.organizationId, id, version: dto.version ?? -1 }, data: { title: dto.title, ...(await this.linkFor(tx, c.organizationId, claim.employeeId, dto)), version: { increment: 1 } } });
      if (!n.count) throw new ConflictException('Someone else changed this claim. Reload it.');
      return this.view(tx, c, await tx.expenseClaim.findFirstOrThrow({ where: { id } }), a);
    });
  }

  /** E4: a claim belongs to one of the person's approved trips, or settles their paid standing imprest (not both). */
  private async linkFor(tx: Tx, org: string, employeeId: string, dto: ClaimDto) {
    if (dto.tripId === undefined && dto.advanceId === undefined) return {};
    if (dto.tripId && dto.advanceId) throw new BadRequestException('A claim belongs to a trip or to an imprest advance, not both.');
    if (dto.tripId && !(await tx.trip.findFirst({ where: { organizationId: org, id: dto.tripId, employeeId, status: 'approved' }, select: { id: true } }))) throw new BadRequestException('Choose one of your approved trips.');
    if (dto.advanceId && !(await tx.expenseAdvance.findFirst({ where: { organizationId: org, id: dto.advanceId, employeeId, kind: 'imprest', status: 'paid' }, select: { id: true } }))) throw new BadRequestException('Choose one of your paid imprest advances.');
    return { tripId: dto.tripId ?? null, advanceId: dto.advanceId ?? null };
  }

  async list(ctx: TenantContext, user: ScopeUser, view: 'mine' | 'approvals' | 'review' | 'scope' = 'mine') {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      let claims: Claim[] = [];
      if (view === 'mine') {
        const me = await this.myEmployee(tx, org, v);
        claims = me ? await tx.expenseClaim.findMany({ where: { organizationId: org, employeeId: me.id }, orderBy: { createdAt: 'desc' }, take: 200 }) : [];
      } else if (view === 'approvals') {
        const tasks = v.userId ? await tx.wfTask.findMany({ where: { organizationId: org, assigneeUserId: v.userId, status: 'open' }, select: { requestId: true } }) : [];
        claims = tasks.length ? await tx.expenseClaim.findMany({ where: { organizationId: org, status: 'submitted', wfRequestId: { in: tasks.map((t) => t.requestId) } }, orderBy: { submittedAt: 'asc' }, take: 200 }) : [];
      } else {
        const key = view === 'review' ? 'expense.finance.review' : 'expense.claim.view';
        if (!v.grants.has(key)) throw new ForbiddenException('You cannot see other people’s claims.');
        const rows = await tx.expenseClaim.findMany({ where: { organizationId: org, status: { in: view === 'review' ? ['submitted'] : ['submitted', 'approved', 'partly_approved', 'rejected', 'sent_back'] }, ...(view === 'review' ? { risk: { not: 'none' } } : {}) }, orderBy: { submittedAt: 'desc' }, take: 500 });
        for (const r of rows) {
          const a = await this.access(tx, c, v, r);
          if (view === 'review' ? a.finance : a.scope) claims.push(r);
        }
      }
      const people = await this.names(tx, org, claims.map((x) => x.employeeId));
      return { claims: claims.map((x) => this.summary(x, people.get(x.employeeId) ?? '')) };
    });
  }

  private async names(tx: Tx, org: string, employeeIds: string[]) {
    const emps = await tx.employee.findMany({ where: { organizationId: org, id: { in: [...new Set(employeeIds)] } }, select: { id: true, personId: true } });
    const persons = await tx.person.findMany({ where: { organizationId: org, id: { in: emps.map((e) => e.personId) } } });
    return new Map(emps.map((e) => {
      const p = persons.find((x) => x.id === e.personId);
      return [e.id, p ? [p.preferredName || p.givenName, p.familyName].filter(Boolean).join(' ') : ''];
    }));
  }

  private summary(x: Claim, person: string) {
    return {
      id: x.id,
      title: x.title,
      person,
      currency: x.currency,
      status: x.status,
      paymentStatus: x.paymentStatus,
      claimedTotal: x.claimedTotal.toFixed(2),
      approvedTotal: money(x.approvedTotal),
      advanceAdjusted: x.advanceAdjusted.toFixed(2),
      // YX-EXP-06: the headline figure: what the person will receive.
      netPayable: (x.netPayable ?? x.approvedTotal ?? x.claimedTotal).sub(x.netPayable === null ? x.advanceAdjusted : 0).toFixed(2),
      risk: x.risk,
      tripId: x.tripId,
      advanceId: x.advanceId,
      submittedAt: x.submittedAt?.toISOString() ?? null,
      decidedAt: x.decidedAt?.toISOString() ?? null,
      version: x.version,
    };
  }

  async get(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { claim, a } = await this.claimOr404(tx, c, v, id);
      return this.view(tx, c, claim, a);
    });
  }

  private lineView(l: Line, seeGst: boolean) {
    const ocr = (l.ocr ?? null) as { fields?: OcrFields; adapter?: string; confirmed?: boolean; einvoice?: string } | null;
    return {
      id: l.id,
      lineNo: l.lineNo,
      categoryCode: l.categoryCode,
      spentOn: iso(l.spentOn),
      merchant: l.merchant,
      city: l.city,
      country: l.country,
      tierId: l.tierId,
      payMode: l.payMode,
      description: l.description,
      hasReceipt: Boolean(l.receiptFileId),
      selfDeclared: l.selfDeclared,
      claimed: l.claimed.toFixed(2),
      approved: money(l.approved),
      reduceReason: l.reduceReason,
      justification: l.justification,
      policy: l.policyResult,
      flags: l.flags,
      mileage: l.mileage,
      perDiem: l.perDiem,
      ocr: ocr ? { adapter: ocr.adapter ?? null, fields: ocr.fields ?? {}, lowConfidence: lowConfidence(ocr.fields ?? {}), confirmed: Boolean(ocr.confirmed), einvoice: ocr.einvoice ?? null } : null,
      fx: l.receiptCurrency ? { currency: l.receiptCurrency, amount: money(l.receiptAmount), rate: l.fxRate!.toFixed(8), source: l.fxSource, rateDate: l.fxRateDate ? iso(l.fxRateDate) : null, variancePct: money(l.fxVariancePct), hasProof: Boolean(l.fxProofFileId) } : null,
      origin: l.origin,
      confirmed: l.confirmed,
      gst: seeGst ? { supplierGstin: l.supplierGstin, invoiceNo: l.invoiceNo, invoiceDate: l.invoiceDate ? iso(l.invoiceDate) : null, placeOfSupply: l.placeOfSupply, taxableValue: money(l.taxableValue), cgst: money(l.cgst), sgst: money(l.sgst), igst: money(l.igst), cess: money(l.cess), billedToGstin: l.billedToGstin, itcStatus: l.itcStatus, einvoiceVerified: l.einvoiceVerified } : null,
      version: l.version,
    };
  }

  private async view(tx: Tx, c: CompanyContext, claim: Claim, a: Access) {
    const org = c.organizationId;
    const lines = await tx.expenseLine.findMany({ where: { organizationId: org, claimId: claim.id, removedAt: null }, orderBy: { lineNo: 'asc' } });
    const changes = await tx.expenseLineChange.findMany({ where: { organizationId: org, claimId: claim.id }, orderBy: { createdAt: 'asc' } });
    const flags = await tx.expenseFlag.findMany({ where: { organizationId: org, claimId: claim.id }, orderBy: { createdAt: 'asc' } });
    const person = (await this.names(tx, org, [claim.employeeId])).get(claim.employeeId) ?? '';
    const route = claim.wfRequestId ? await tx.wfRequest.findFirst({ where: { organizationId: org, id: claim.wfRequestId }, select: { status: true, currentStep: true, steps: true } }) : null;
    return {
      ...this.summary(claim, person),
      decisionNote: claim.decisionNote,
      lines: lines.map((l) => this.lineView(l, true)),
      changes: changes.map((x) => ({ lineId: x.lineId, from: x.oldAmount.toFixed(2), to: x.newAmount.toFixed(2), reason: x.reason, at: x.createdAt.toISOString() })),
      // Flags name other claims only by reference, so nothing of another person leaks (§15).
      flags: flags.map((f) => ({ id: f.id, lineId: f.lineId, kind: f.kind, detail: f.detail, status: f.status, note: f.note })),
      route: route ? { status: route.status, currentStep: route.currentStep, steps: (route.steps as { name: string; state: string }[]).map((s) => ({ name: s.name, state: s.state })) } : null,
      can: {
        edit: a.own && (claim.status === 'draft' || claim.status === 'sent_back'),
        withdraw: a.own && claim.status === 'submitted',
        decide: Boolean(a.openTaskId),
        changeAmounts: Boolean(a.openTaskId) && claim.status === 'submitted',
        review: a.finance && claim.status === 'submitted',
      },
    };
  }

  // ------------------------------------------------------------------------------------------ receipts (snap first, §8.1)

  /**
   * Stores a receipt (virus-scanned before anyone opens it) and reads it. Without lineId it becomes a new draft line
   * pre-filled with the suggestions, which the employee must confirm; with lineId it is attached to that line.
   * An identical file already on another live claim of the company is refused (F1, YX-EXP-04).
   */
  async addReceipt(ctx: TenantContext, user: ScopeUser, id: string, file: { originalname: string; buffer: Buffer } | undefined, lineId?: string) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose a receipt to upload.');
    const v = await this.viewer(user);
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { claim, a } = await this.claimOr404(tx, c, v, id);
      this.editable(claim, a);
      const stored = await this.files.storeIn(tx, c, { area: 'expense', name: file.originalname, data: file.buffer, allowedMime: RECEIPT_MIME, maxMb: 10, via: 'self' });
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${org}:receipt:${stored.sha256}`}))`;
      const same = await this.liveLineWith(tx, org, { receiptSha256: stored.sha256 }, lineId ?? null);
      if (same) throw new ConflictException({ statusCode: 409, code: 'SAME_RECEIPT', message: same.claimId === id ? 'This receipt is already on this claim.' : 'This receipt is already on another claim. A receipt can be claimed once.' });
      const read = await this.reader.read(file.buffer, stored.mime, { name: file.originalname, country: 'IN', currency: claim.currency });
      const qr = read.qr ? checkEinvoiceQr(read.qr, this.qrKeys) : null;
      const fields: OcrFields = { ...read.fields };
      let einvoice: string | null = null;
      if (qr && qr.status !== 'not_einvoice' && qr.fields) {
        // A signed e-invoice wins over OCR: its values are exact (§13.4). An unverified one only suggests.
        const conf = qr.status === 'verified' ? 1 : 0.5;
        fields.gstin = { value: qr.fields.sellerGstin, confidence: conf };
        fields.invoiceNo = { value: qr.fields.docNo, confidence: conf };
        if (qr.fields.docDate) fields.date = { value: qr.fields.docDate, confidence: conf };
        if (qr.fields.total) fields.amount = { value: qr.fields.total, confidence: conf };
        einvoice = qr.status === 'verified' ? 'verified' : `unverified: ${qr.reason}`;
      }
      const ocr = { adapter: read.adapter, fields, confirmed: false, einvoice, billedTo: qr && qr.status !== 'not_einvoice' ? qr.fields?.buyerGstin ?? null : null, irn: qr && qr.status === 'verified' ? qr.fields.irn : null };
      let line: Line;
      if (lineId) {
        const cur = await tx.expenseLine.findFirst({ where: { organizationId: org, id: lineId, claimId: id, removedAt: null } });
        if (!cur) throw new NotFoundException('No such line.');
        line = await tx.expenseLine.update({ where: { id: lineId }, data: { receiptFileId: stored.id, receiptSha256: stored.sha256, receiptPhash: read.phash ?? null, selfDeclared: false, ocr: ocr as unknown as Prisma.InputJsonValue, version: { increment: 1 } } });
      } else {
        const cat = await this.defaultCategory(tx, org);
        const spentOn = fields.date?.value ?? todayIst();
        const amount = fields.amount?.value ?? '0.00';
        line = await tx.expenseLine.create({
          data: {
            organizationId: org,
            claimId: id,
            lineNo: await this.nextLineNo(tx, org, id),
            categoryCode: cat,
            spentOn: asDate(spentOn),
            merchant: fields.merchant?.value ?? null,
            claimed: amount,
            receiptFileId: stored.id,
            receiptSha256: stored.sha256,
            dupKey: dupKey(claim.employeeId, spentOn, amount),
            ocr: ocr as unknown as Prisma.InputJsonValue,
            supplierGstin: fields.gstin && !gstinProblem(fields.gstin.value) ? fields.gstin.value : null,
            invoiceNo: fields.invoiceNo?.value ?? null,
            billedToGstin: ocr.billedTo,
            einvoiceIrn: ocr.irn,
            einvoiceVerified: einvoice === 'verified',
            receiptPhash: read.phash ?? null,
          },
        });
      }
      await this.retotal(tx, org, id);
      await audit(tx, c, 'expense.receipt.added', 'expense_claim', id, { lineId: line.id, adapter: read.adapter, read: read.ok });
      return { fileId: stored.id, line };
    });
    // The virus check runs after the commit; a receipt is served only once it is clean.
    void this.files.scan(ctx.organizationId!, res.fileId).catch(() => undefined);
    return this.get(ctx, user, id);
  }

  async receipt(ctx: TenantContext, user: ScopeUser, id: string, lineId: string, which: 'receipt' | 'fx' = 'receipt') {
    const v = await this.viewer(user);
    const row = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.claimOr404(tx, c, v, id);
      const l = await tx.expenseLine.findFirst({ where: { organizationId: c.organizationId, id: lineId, claimId: id } });
      const fileId = which === 'fx' ? l?.fxProofFileId : l?.receiptFileId;
      if (!fileId) throw new NotFoundException(which === 'fx' ? 'This line has no rate proof.' : 'This line has no receipt.');
      const f = await tx.file.findFirstOrThrow({ where: { organizationId: c.organizationId, id: fileId } });
      if (f.scanStatus !== 'clean') throw new ConflictException('The receipt has not passed the virus check yet.');
      return f;
    });
    return { file: await this.files.bytes(row), name: row.fileName, contentType: row.mime };
  }

  private async defaultCategory(tx: Tx, org: string) {
    const cats = await tx.expenseCategory.findMany({ where: { organizationId: org, active: true, kind: 'spend' }, select: { code: true }, orderBy: { code: 'asc' } });
    const pick = cats.find((x) => x.code === 'other') ?? cats[0];
    if (!pick) throw new ConflictException('Expenses are not set up yet: there is no expense category.');
    return pick.code;
  }

  private async nextLineNo(tx: Tx, org: string, claimId: string) {
    return ((await tx.expenseLine.aggregate({ where: { organizationId: org, claimId }, _max: { lineNo: true } }))._max.lineNo ?? 0) + 1;
  }

  /** A line on another live claim (draft or later, not rejected or withdrawn) matching `where`. */
  private async liveLineWith(tx: Tx, org: string, where: Prisma.ExpenseLineWhereInput, notLineId: string | null) {
    const rows = await tx.expenseLine.findMany({ where: { organizationId: org, removedAt: null, ...where, ...(notLineId ? { id: { not: notLineId } } : {}) }, select: { id: true, claimId: true }, take: 20 });
    if (!rows.length) return null;
    const live = await tx.expenseClaim.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.claimId) }, status: { in: LIVE_CLAIMS } }, select: { id: true } });
    return rows.find((r) => live.some((x) => x.id === r.claimId)) ?? null;
  }

  // ------------------------------------------------------------------------------------------ lines

  async addLine(ctx: TenantContext, user: ScopeUser, id: string, dto: LineDto) {
    return this.saveLine(ctx, user, id, null, dto);
  }

  async updateLine(ctx: TenantContext, user: ScopeUser, id: string, lineId: string, dto: LineDto) {
    return this.saveLine(ctx, user, id, lineId, dto);
  }

  private async saveLine(ctx: TenantContext, user: ScopeUser, id: string, lineId: string | null, dto: LineDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { claim, a } = await this.claimOr404(tx, c, v, id);
      this.editable(claim, a);
      const cat = await tx.expenseCategory.findFirst({ where: { organizationId: org, code: dto.categoryCode, active: true } });
      if (!cat) throw new BadRequestException('Choose an expense category in use.');
      if (dto.spentOn > todayIst()) throw new BadRequestException('A bill cannot be dated in the future.');
      const cur = lineId ? await tx.expenseLine.findFirst({ where: { organizationId: org, id: lineId, claimId: id, removedAt: null } }) : null;
      if (lineId && !cur) throw new NotFoundException('No such line.');
      if (cur && dto.version !== undefined && cur.version !== dto.version) throw new ConflictException('Someone else changed this line. Reload it.');
      const tiers = await tx.cityTier.findMany({ where: { organizationId: org } });
      const country = dto.country ?? 'IN';
      const tier = tierFor(tiers, dto.city ?? null, country);
      // YX-EXP-03: mileage and per diem are worked out, never typed.
      let amount: string;
      let mileage: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
      let perDiem: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
      let fx: Awaited<ReturnType<ExpenseClaimsService['fxFor']>> | null = null;
      if (cat.kind === 'mileage') {
        if (!dto.mileage) throw new BadRequestException('Enter the vehicle and the distance.');
        if (dto.amount !== undefined) throw new BadRequestException('Mileage is worked out from the distance; it cannot be typed.');
        const rate = await tx.mileageRate.findFirst({ where: { organizationId: org, vehicle: dto.mileage.vehicle, validFrom: { lte: asDate(dto.spentOn) }, OR: [{ validTo: null }, { validTo: { gte: asDate(dto.spentOn) } }] } });
        if (!rate) throw new BadRequestException('There is no mileage rate for that vehicle on that day.');
        const kmThisMonth = await this.kmInMonth(tx, org, claim.employeeId, dto.spentOn, lineId);
        const m = mileageAmount(dto.mileage.km, rate.ratePerKm.toFixed(2), rate.monthlyKmCap, kmThisMonth);
        if ('problem' in m) throw new BadRequestException(m.problem);
        amount = m.amount;
        mileage = { vehicle: dto.mileage.vehicle, km: dto.mileage.km, from: dto.mileage.from ?? null, to: dto.mileage.to ?? null, ratePerKm: rate.ratePerKm.toFixed(2) };
      } else if (cat.kind === 'per_diem') {
        if (!dto.perDiem) throw new BadRequestException('Enter the days away.');
        if (dto.amount !== undefined) throw new BadRequestException('Per diem is worked out from the days; it cannot be typed.');
        if (dto.perDiem.fullDays + dto.perDiem.partialDays === 0) throw new BadRequestException('Enter at least one day.');
        const on = asDate(dto.spentOn);
        const inForce = { validFrom: { lte: on }, OR: [{ validTo: null }, { validTo: { gte: on } }] };
        const rate = (tier ? await tx.perDiemRate.findFirst({ where: { organizationId: org, tierId: tier.id, ...inForce } }) : null) ?? (await tx.perDiemRate.findFirst({ where: { organizationId: org, country, ...inForce } }));
        if (!rate) throw new BadRequestException('There is no per-diem rate for that place on that day.');
        const meals = dto.perDiem.meals ?? {};
        amount = perDiemAmount(rate.ratePerDay.toFixed(2), { full: dto.perDiem.fullDays, partial: dto.perDiem.partialDays }, rate.partialDayRule as 'full' | 'half_after_hours', meals, rate.mealsDeduction as Record<string, number>);
        perDiem = { fullDays: dto.perDiem.fullDays, partialDays: dto.perDiem.partialDays, meals, ratePerDay: rate.ratePerDay.toFixed(2), currency: rate.currency, from: dto.spentOn, to: addDays(dto.spentOn, dto.perDiem.fullDays + dto.perDiem.partialDays - 1) } as unknown as Prisma.InputJsonValue;
      } else if (dto.fx && dto.fx.currency !== claim.currency) {
        if (dto.amount !== undefined) throw new BadRequestException('A bill in another currency is converted from its own amount; the amount in your pay currency cannot be typed.');
        fx = await this.fxFor(tx, org, claim, dto.fx, dto.spentOn);
        amount = toPay(dto.fx.amount, fx.fxRate);
      } else {
        if (dto.amount === undefined) throw new BadRequestException('Enter the amount on the bill.');
        amount = D(dto.amount).toFixed(2);
      }
      const gstOn = (await settingFor(tx, c, 'expense.gst.capture', { legalEntityId: claim.legalEntityId })) === 'on';
      const g = gstOn && cat.gstEligible ? (dto.gst ?? {}) : {};
      const ours = (await tx.entityGstRegistration.findMany({ where: { organizationId: org, legalEntityId: claim.legalEntityId }, select: { gstin: true } })).map((x) => x.gstin);
      const itc = itcStatusOf({ gstOn, gstEligible: cat.gstEligible, blocked: Boolean(cat.itcBlockedReason), supplierGstin: g.supplierGstin ?? null, invoiceNo: g.invoiceNo ?? null, billedTo: g.billedToGstin ?? null, placeOfSupply: g.placeOfSupply ?? null, ourGstins: ours });
      const prevOcr = (cur?.ocr ?? null) as Record<string, unknown> | null;
      const data = {
        categoryCode: cat.code,
        spentOn: asDate(dto.spentOn),
        merchant: dto.merchant ?? null,
        city: dto.city ?? null,
        country,
        tierId: tier?.id ?? null,
        payMode: dto.payMode,
        description: dto.description ?? null,
        selfDeclared: Boolean(dto.selfDeclared) && !cur?.receiptFileId,
        claimed: amount,
        justification: dto.justification ?? null,
        mileage,
        perDiem,
        dupKey: dupKey(claim.employeeId, dto.spentOn, amount),
        supplierGstin: g.supplierGstin ?? null,
        invoiceNo: g.invoiceNo ?? null,
        invoiceDate: g.invoiceDate ? asDate(g.invoiceDate) : null,
        placeOfSupply: g.placeOfSupply ?? null,
        taxableValue: g.taxableValue ?? null,
        cgst: g.cgst ?? null,
        sgst: g.sgst ?? null,
        igst: g.igst ?? null,
        cess: g.cess ?? null,
        billedToGstin: g.billedToGstin ?? null,
        itcStatus: itc,
        receiptCurrency: fx ? dto.fx!.currency : null,
        receiptAmount: fx ? dto.fx!.amount : null,
        fxRate: fx?.fxRate ?? null,
        fxSource: fx?.fxSource ?? null,
        fxRateDate: fx?.fxRateDate ? asDate(fx.fxRateDate) : null,
        fxVariancePct: fx?.fxVariancePct ?? null,
        ...(fx ? {} : { fxProofFileId: null }),
        // Saving the line is the employee confirming it (a field-day draft is paid only once confirmed, YX-EXP-16).
        confirmed: true,
        // Saving a read line is the employee confirming its values (nothing from OCR is used unconfirmed, Q4).
        ...(prevOcr ? { ocr: { ...prevOcr, confirmed: true } as Prisma.InputJsonValue } : {}),
      };
      const line = cur
        ? await tx.expenseLine.update({ where: { id: cur.id }, data: { ...data, version: { increment: 1 } } })
        : await tx.expenseLine.create({ data: { organizationId: org, claimId: id, lineNo: await this.nextLineNo(tx, org, id), ...data } });
      const policy = await this.policyCheck(tx, c, claim, line, cat);
      await tx.expenseLine.update({ where: { id: line.id }, data: { policyResult: policy as Prisma.InputJsonValue } });
      await this.retotal(tx, org, id);
      return this.view(tx, c, await tx.expenseClaim.findFirstOrThrow({ where: { id } }), a);
    });
  }

  async removeLine(ctx: TenantContext, user: ScopeUser, id: string, lineId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { claim, a } = await this.claimOr404(tx, c, v, id);
      this.editable(claim, a);
      const n = await tx.expenseLine.updateMany({ where: { organizationId: c.organizationId, id: lineId, claimId: id, removedAt: null }, data: { removedAt: new Date(), version: { increment: 1 } } });
      if (!n.count) throw new NotFoundException('No such line.');
      await this.retotal(tx, c.organizationId, id);
      return this.view(tx, c, await tx.expenseClaim.findFirstOrThrow({ where: { id } }), a);
    });
  }

  /**
   * E5 (§14.2, YX-EXP-14, 15): the rate for a bill in another currency. A forex advance in that currency settles at its
   * own rate; otherwise the company rate for the day (the last one before a holiday), or the employee's card or bank
   * rate, which needs proof and is flagged when it is more than 3 % from the company rate.
   */
  private async fxFor(tx: Tx, org: string, claim: Claim, fx: { currency: string; amount: string; rate?: string }, on: string) {
    const adv = claim.advanceId ? await tx.expenseAdvance.findFirst({ where: { organizationId: org, id: claim.advanceId } }) : claim.tripId ? await tx.expenseAdvance.findFirst({ where: { organizationId: org, tripId: claim.tripId } }) : null;
    if (adv && adv.currency === fx.currency && adv.fxRate && ['paid', 'to_fnf'].includes(adv.status)) return { fxRate: adv.fxRate.toFixed(8), fxSource: 'advance', fxRateDate: adv.paidOn ? iso(adv.paidOn) : on, fxVariancePct: null as string | null };
    const ref = await fxRateFor(tx, org, fx.currency, claim.currency, on);
    if (fx.rate) {
      if (D(fx.rate).lte(0)) throw new BadRequestException('The rate is above zero.');
      return { fxRate: D(fx.rate).toFixed(8), fxSource: 'manual', fxRateDate: on, fxVariancePct: ref ? variancePct(fx.rate, ref.rate) : null };
    }
    if (!ref) throw new BadRequestException(`There is no company rate for ${fx.currency} on or before that day. Enter the rate on your card or bank statement and upload the statement.`);
    return { fxRate: ref.rate, fxSource: 'company_table', fxRateDate: ref.rateDate, fxVariancePct: null };
  }

  /** E5: the statement that shows an entered rate (proof for a manual rate, §14.2). */
  async addFxProof(ctx: TenantContext, user: ScopeUser, id: string, lineId: string, file: { originalname: string; buffer: Buffer } | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose the statement to upload.');
    const v = await this.viewer(user);
    const fileId = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { claim, a } = await this.claimOr404(tx, c, v, id);
      this.editable(claim, a);
      const l = await tx.expenseLine.findFirst({ where: { organizationId: c.organizationId, id: lineId, claimId: id, removedAt: null } });
      if (!l) throw new NotFoundException('No such line.');
      if (l.fxSource !== 'manual') throw new ConflictException('Proof is needed only for a rate you entered.');
      const stored = await this.files.storeIn(tx, c, { area: 'expense', name: file.originalname, data: file.buffer, allowedMime: RECEIPT_MIME, maxMb: 10, via: 'self' });
      await tx.expenseLine.update({ where: { id: lineId }, data: { fxProofFileId: stored.id, version: { increment: 1 } } });
      return stored.id;
    });
    void this.files.scan(ctx.organizationId!, fileId).catch(() => undefined);
    return this.get(ctx, user, id);
  }

  /**
   * E5 (M02 §B8, YX-EXP-16): a field-force duty day's distance becomes a draft mileage line on the person's open field
   * travel claim for that month. It is worked out from the company rate like any mileage line and is paid only after
   * the employee confirms it (saves the line). Attendance calls this once a duty day closes; one draft per day.
   */
  async fieldDayDraft(org: string, input: { employeeId: string; workOn: string; km: number; vehicle: string; visits: string[] }) {
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: null };
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const ref = `field:${input.employeeId}:${input.workOn}`;
      const had = await tx.expenseLine.findFirst({ where: { organizationId: org, originRef: ref, origin: 'field_day', removedAt: null }, select: { id: true, claimId: true } });
      if (had) return had;
      const cat = await tx.expenseCategory.findFirst({ where: { organizationId: org, kind: 'mileage', active: true }, orderBy: { code: 'asc' } });
      const on = asDate(input.workOn);
      const rate = await tx.mileageRate.findFirst({ where: { organizationId: org, vehicle: input.vehicle, validFrom: { lte: on }, OR: [{ validTo: null }, { validTo: { gte: on } }] } });
      const job = await tx.employeeAssignment.findFirst({ where: { organizationId: org, employeeId: input.employeeId, supersededAt: null, validFrom: { lte: on } }, orderBy: { validFrom: 'desc' }, select: { employmentId: true, legalEntityId: true } });
      // Without a mileage category, a rate or a job there is nothing to draft; the employee can still claim by hand.
      if (!cat || !rate || !job) return null;
      const title = `Field travel, ${on.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`;
      const claim =
        (await tx.expenseClaim.findFirst({ where: { organizationId: org, employeeId: input.employeeId, status: 'draft', title } })) ??
        (await tx.expenseClaim.create({ data: { organizationId: org, employeeId: input.employeeId, employmentId: job.employmentId, legalEntityId: job.legalEntityId, title, currency: (await tx.legalEntity.findFirstOrThrow({ where: { organizationId: org, id: job.legalEntityId }, select: { currency: true } })).currency } }));
      const m = mileageAmount(input.km, rate.ratePerKm.toFixed(2), rate.monthlyKmCap, await this.kmInMonth(tx, org, input.employeeId, input.workOn, null));
      if ('problem' in m) return null;
      const line = await tx.expenseLine.create({
        data: {
          organizationId: org,
          claimId: claim.id,
          lineNo: await this.nextLineNo(tx, org, claim.id),
          categoryCode: cat.code,
          spentOn: on,
          payMode: 'personal',
          description: input.visits.length ? `Visits: ${input.visits.join(', ')}`.slice(0, 500) : null,
          claimed: m.amount,
          mileage: { vehicle: input.vehicle, km: input.km, from: null, to: null, ratePerKm: rate.ratePerKm.toFixed(2) },
          dupKey: dupKey(input.employeeId, input.workOn, m.amount),
          origin: 'field_day',
          originRef: ref,
          confirmed: false,
        },
      });
      await this.retotal(tx, org, claim.id);
      await audit(tx, c, 'expense.line.field_day', 'expense_claim', claim.id, { lineId: line.id, workOn: input.workOn });
      return { id: line.id, claimId: claim.id };
    });
  }

  private async kmInMonth(tx: Tx, org: string, employeeId: string, on: string, notLineId: string | null) {
    const rows = await tx.$queryRaw<{ km: number | null }[]>`
      SELECT SUM((l.mileage->>'km')::numeric)::float AS km FROM expense_lines l JOIN expense_claims c ON c.organization_id = l.organization_id AND c.id = l.claim_id
      WHERE l.organization_id = ${org}::uuid AND c.employee_id = ${employeeId}::uuid AND l.removed_at IS NULL AND l.mileage IS NOT NULL
        AND c.status IN ('draft', 'submitted', 'sent_back', 'approved', 'partly_approved')
        AND date_trunc('month', l.spent_on) = date_trunc('month', ${on}::date) AND l.id <> ${notLineId ?? '00000000-0000-0000-0000-000000000000'}::uuid`;
    return rows[0]?.km ?? 0;
  }

  private async retotal(tx: Tx, org: string, claimId: string) {
    const sum = await tx.expenseLine.aggregate({ where: { organizationId: org, claimId, removedAt: null, payMode: { not: 'company_paid' } }, _sum: { claimed: true } });
    await tx.expenseClaim.update({ where: { id: claimId }, data: { claimedTotal: sum._sum.claimed ?? 0, version: { increment: 1 } } });
  }

  /** §7.3: the line against the employee's policy on its date, with what was already claimed in the same windows. */
  private async policyCheck(tx: Tx, c: CompanyContext, claim: Claim, line: Line, cat: Prisma.ExpenseCategoryGetPayload<object>) {
    const org = c.organizationId;
    const on = iso(line.spentOn);
    const p = await this.setup.policyFor(tx, org, claim.employeeId, on);
    const receipt = receiptNeed(cat.kind, money(cat.receiptAbove), line.claimed.toFixed(2));
    if (!p) return { policyId: null, policy: null, outcome: 'not_allowed', limit: null, overBy: '0.00', receipt, reason: 'No expense policy applies to you on that day; HR is told.' };
    const rule = ruleFor(p.rules, cat.code, line.tierId);
    const window = async (from: string, to: string) => {
      const rows = await tx.$queryRaw<{ s: string | null }[]>`
        SELECT SUM(l.claimed)::text AS s FROM expense_lines l JOIN expense_claims c ON c.organization_id = l.organization_id AND c.id = l.claim_id
        WHERE l.organization_id = ${org}::uuid AND c.employee_id = ${claim.employeeId}::uuid AND l.category_code = ${cat.code} AND l.removed_at IS NULL
          AND c.status IN ('draft', 'submitted', 'sent_back', 'approved', 'partly_approved') AND l.spent_on BETWEEN ${from}::date AND ${to}::date AND l.id <> ${line.id}::uuid`;
      return rows[0]?.s ?? '0';
    };
    const monthStart = `${on.slice(0, 8)}01`;
    const monthEnd = iso(new Date(Date.UTC(Number(on.slice(0, 4)), Number(on.slice(5, 7)), 0)));
    let trip: string | null = null;
    if (claim.tripId) {
      const rows = await tx.$queryRaw<{ s: string | null }[]>`
        SELECT SUM(l.claimed)::text AS s FROM expense_lines l JOIN expense_claims c ON c.organization_id = l.organization_id AND c.id = l.claim_id
        WHERE l.organization_id = ${org}::uuid AND c.trip_id = ${claim.tripId}::uuid AND l.category_code = ${cat.code} AND l.removed_at IS NULL
          AND c.status IN ('draft', 'submitted', 'sent_back', 'approved', 'partly_approved') AND l.id <> ${line.id}::uuid`;
      trip = rows[0]?.s ?? '0';
    }
    const r = checkLimit(rule, line.claimed.toFixed(2), { day: await window(on, on), trip, month: await window(monthStart, monthEnd) });
    return { policyId: p.policy.id, policy: p.policy.name, ...r, receipt };
  }

  // ------------------------------------------------------------------------------------------ checks and submit

  /** The dry run of submit: per-line results and the flags, nothing saved. */
  async check(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { claim, a } = await this.claimOr404(tx, c, v, id);
      if (!a.own) throw new ForbiddenException('Only the person claiming can check the claim.');
      const r = await this.evaluate(tx, c, claim);
      return { blockers: r.blockers, flags: r.flags.map(({ kind, detail, lineId }) => ({ kind, detail, lineId })) };
    });
  }

  /** Every line re-checked: what blocks submitting, and the flags for approvers and finance (§15). */
  private async evaluate(tx: Tx, c: CompanyContext, claim: Claim) {
    const org = c.organizationId;
    const lines = await tx.expenseLine.findMany({ where: { organizationId: org, claimId: claim.id, removedAt: null }, orderBy: { lineNo: 'asc' } });
    const blockers: { lineId: string | null; text: string }[] = [];
    const flags: FlagDraft[] = [];
    if (!lines.length) blockers.push({ lineId: null, text: 'Add at least one bill.' });
    const cats = new Map((await tx.expenseCategory.findMany({ where: { organizationId: org } })).map((x) => [x.code, x]));
    const employment = await tx.employment.findFirstOrThrow({ where: { organizationId: org, id: claim.employmentId } });
    const windowDays = Number(await settingFor(tx, c, 'expense.claim_window_days', { legalEntityId: claim.legalEntityId }));
    const today = todayIst();
    for (const l of lines) {
      const cat = cats.get(l.categoryCode)!;
      const on = iso(l.spentOn);
      const name = `Line ${l.lineNo}`;
      const ocr = (l.ocr ?? null) as { confirmed?: boolean; fields?: OcrFields; einvoice?: string } | null;
      if (ocr && !ocr.confirmed) blockers.push({ lineId: l.id, text: `${name}: check the values read from the receipt and save the line.` });
      if (!l.confirmed) blockers.push({ lineId: l.id, text: `${name}: check the distance from your field day and save the line.` });
      // F12: an entered rate needs its statement, and is flagged when far from the company rate (B18).
      if (l.fxSource === 'manual' && !l.fxProofFileId) blockers.push({ lineId: l.id, text: `${name}: upload the statement that shows your rate.` });
      if (l.fxSource === 'manual' && l.fxVariancePct && l.fxVariancePct.abs().gt(FX_TOLERANCE_PCT)) flags.push({ kind: 'fx_rate', detail: `${name}: the rate entered is ${l.fxVariancePct.toFixed(2)} % from the company rate.`, lineId: l.id });
      // F4: a re-photographed receipt (a near-identical image of another live bill in the company).
      if (l.receiptPhash) {
        // shortcut: compares against every live line of the company; add an index-friendly prefilter when volumes grow.
        const near = await tx.$queryRaw<{ n: number }[]>`
          SELECT count(*)::int AS n FROM expense_lines x JOIN expense_claims c ON c.organization_id = x.organization_id AND c.id = x.claim_id
          WHERE x.organization_id = ${org}::uuid AND x.id <> ${l.id}::uuid AND x.removed_at IS NULL AND x.receipt_phash IS NOT NULL
            AND x.receipt_sha256 IS DISTINCT FROM ${l.receiptSha256} AND c.status IN ('draft', 'submitted', 'sent_back', 'approved', 'partly_approved')
            AND bit_count(('x' || x.receipt_phash)::bit(64) # ('x' || ${l.receiptPhash})::bit(64)) <= ${LOOK_ALIKE_BITS}`;
        if (near[0].n) flags.push({ kind: 'look_alike_image', detail: `${name}: the receipt photo looks like another bill's receipt.`, lineId: l.id });
      }
      if (l.claimed.lte(0) && l.payMode !== 'company_paid') blockers.push({ lineId: l.id, text: `${name}: enter the amount.` });
      const p = await this.policyCheck(tx, c, claim, l, cat);
      await tx.expenseLine.update({ where: { id: l.id }, data: { policyResult: p as Prisma.InputJsonValue } });
      if (p.outcome === 'not_allowed') blockers.push({ lineId: l.id, text: `${name}: ${p.reason ?? `${cat.name} is not allowed for you in that city.`}` });
      if (p.outcome === 'blocked') blockers.push({ lineId: l.id, text: `${name}: over the limit of ${p.limit?.amount}; this category cannot go over it. Claim up to the limit.` });
      if (p.outcome === 'over_justify') {
        if (!l.justification?.trim()) blockers.push({ lineId: l.id, text: `${name}: over the limit by ${p.overBy}; say why.` });
        flags.push({ kind: 'over_limit', detail: `${name} is ${p.overBy} over the ${(p.limit?.kind ?? '').replace('per_', 'per ')} limit.`, lineId: l.id });
      }
      if (p.receipt === 'required' && !l.receiptFileId && l.payMode !== 'company_paid') blockers.push({ lineId: l.id, text: `${name}: a receipt is needed above ${money(cat.receiptAbove) ?? '0'}.` });
      if (p.receipt === 'declaration' && !l.receiptFileId && !l.selfDeclared) blockers.push({ lineId: l.id, text: `${name}: add the receipt, or declare the spend.` });
      if (l.receiptFileId) {
        const f = await tx.file.findFirst({ where: { organizationId: org, id: l.receiptFileId }, select: { scanStatus: true } });
        if (f?.scanStatus === 'pending') blockers.push({ lineId: l.id, text: `${name}: the receipt is still being checked for viruses. Try again in a minute.` });
        if (f?.scanStatus === 'infected') blockers.push({ lineId: l.id, text: `${name}: the receipt failed the virus check. Upload another copy.` });
      }
      // F7 dates.
      if (on > today) blockers.push({ lineId: l.id, text: `${name}: a bill cannot be dated in the future.` });
      if (on < iso(employment.joinedOn) || (employment.exitedOn && on > iso(employment.exitedOn))) blockers.push({ lineId: l.id, text: `${name}: the bill is dated outside your employment.` });
      if (on < addDays(today, -windowDays)) flags.push({ kind: 'old_receipt', detail: `${name} is more than ${windowDays} days old.`, lineId: l.id });
      if (['local_conveyance', 'meals'].includes(cat.code)) {
        const leave = await tx.leaveRequestDay.findFirst({ where: { organizationId: org, employeeId: claim.employeeId, leaveOn: l.spentOn, active: true, part: 'full' }, select: { leaveOn: true } });
        if (leave) flags.push({ kind: 'on_leave', detail: `${name} is dated on a full day of leave.`, lineId: l.id });
      }
      // F1 the same file; F2 the same GST invoice; F3 look-alike.
      if (l.receiptSha256 && (await this.liveLineWith(tx, org, { receiptSha256: l.receiptSha256 }, l.id))) blockers.push({ lineId: l.id, text: `${name}: this receipt is already on another claim.` });
      if (l.supplierGstin && l.invoiceNo) {
        const other = await this.liveLineWith(tx, org, { supplierGstin: l.supplierGstin, invoiceNo: l.invoiceNo }, l.id);
        if (other) {
          const oc = await tx.expenseClaim.findFirstOrThrow({ where: { organizationId: org, id: other.claimId }, select: { status: true, employeeId: true } });
          if (oc.status !== 'draft') blockers.push({ lineId: l.id, text: `${name}: invoice ${l.invoiceNo} from ${l.supplierGstin} is already claimed.` });
          else flags.push({ kind: 'same_invoice', detail: `${name}: the same GST invoice is on another draft claim.`, lineId: l.id });
        }
      }
      const alike = await tx.expenseLine.findMany({ where: { organizationId: org, dupKey: l.dupKey, removedAt: null, id: { not: l.id } }, select: { claimId: true, merchant: true } });
      if (alike.some((x) => merchantsAlike(x.merchant, l.merchant) || (!x.merchant && !l.merchant))) flags.push({ kind: 'look_alike', detail: `${name} looks like another bill of the same day and amount.`, lineId: l.id });
      // F10 OCR read against the confirmed values.
      const fa = ocr?.fields?.amount?.value;
      if (fa && Math.abs(Number(fa) - Number(l.claimed)) > Math.max(1, Number(fa) * 0.01)) flags.push({ kind: 'ocr_mismatch', detail: `${name}: the receipt reads ${fa}, the line says ${l.claimed.toFixed(2)}.`, lineId: l.id });
      const fd = ocr?.fields?.date?.value;
      if (fd && fd !== on && (ocr?.fields?.date?.confidence ?? 0) >= 0.8) flags.push({ kind: 'ocr_mismatch', detail: `${name}: the receipt is dated ${fd}, the line ${on}.`, lineId: l.id });
      // F11 GST.
      if (l.supplierGstin && gstinProblem(l.supplierGstin)) flags.push({ kind: 'gstin_invalid', detail: `${name}: ${gstinProblem(l.supplierGstin)}`, lineId: l.id });
      const maths = gstMathsProblem({ taxableValue: money(l.taxableValue), cgst: money(l.cgst), sgst: money(l.sgst), igst: money(l.igst) });
      if (maths) flags.push({ kind: 'gst_maths', detail: `${name}: ${maths}`, lineId: l.id });
      if (ocr?.einvoice?.startsWith('unverified') && ocr.einvoice.includes('altered')) flags.push({ kind: 'einvoice_invalid', detail: `${name}: the e-invoice QR signature does not match.`, lineId: l.id });
    }
    // F5 splitting: same category and day, each within the line limit, together over it.
    const groups = new Map<string, Line[]>();
    for (const l of lines) groups.set(`${l.categoryCode}|${iso(l.spentOn)}`, [...(groups.get(`${l.categoryCode}|${iso(l.spentOn)}`) ?? []), l]);
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      const cap = (g[0].policyResult as { limit?: { kind: string; amount: string } } | null)?.limit;
      if (cap?.kind === 'per_line' && g.every((l) => l.claimed.lte(D(cap.amount))) && g.reduce((t, l) => t.add(l.claimed), D(0)).gt(D(cap.amount))) flags.push({ kind: 'split', detail: `${g.length} ${cats.get(g[0].categoryCode)!.name.toLowerCase()} bills on ${iso(g[0].spentOn)} together pass the ${cap.amount} limit.`, lineId: g[0].id });
    }
    // F8 per-diem days counted twice.
    const pd = lines.filter((l) => l.perDiem);
    for (let i = 0; i < pd.length; i++)
      for (let j = i + 1; j < pd.length; j++) {
        const a = pd[i].perDiem as { from: string; to: string };
        const b = pd[j].perDiem as { from: string; to: string };
        if (a.from <= b.to && b.from <= a.to) blockers.push({ lineId: pd[j].id, text: `Line ${pd[j].lineNo}: these per-diem days are already on line ${pd[i].lineNo}.` });
      }
    return { lines, blockers, flags };
  }

  async submit(ctx: TenantContext, user: ScopeUser, id: string, version: number) {
    const v = await this.viewer(user);
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { claim, a } = await this.claimOr404(tx, c, v, id);
      this.editable(claim, a);
      if (claim.version !== version) throw new ConflictException('Someone else changed this claim. Reload it.');
      const r = await this.evaluate(tx, c, claim);
      if (r.blockers.length) throw new BadRequestException({ statusCode: 400, code: 'CLAIM_NOT_READY', message: r.blockers[0].text, blockers: r.blockers });
      // Flags of an earlier submission are kept, closed as superseded (nothing about a claim is erased, §5.1).
      await tx.expenseFlag.updateMany({ where: { organizationId: org, claimId: id, status: 'open' }, data: { status: 'cleared', note: 'Superseded when the claim was submitted again', decidedAt: new Date() } });
      if (r.flags.length) await tx.expenseFlag.createMany({ data: r.flags.map((f) => ({ organizationId: org, claimId: id, lineId: f.lineId, kind: f.kind, detail: f.detail.slice(0, 300) })) });
      for (const l of r.lines) await tx.expenseLine.update({ where: { id: l.id }, data: { flags: [...new Set(r.flags.filter((f) => f.lineId === l.id).map((f) => f.kind))], approved: null, reduceReason: null } });
      const fresh = await tx.expenseClaim.findFirstOrThrow({ where: { id } });
      const risk = riskOf(r.flags.filter((f) => f.kind !== 'over_limit').map((f) => f.kind));
      const steps = await this.stepsFor(tx, c, fresh, risk, r.flags.some((f) => f.kind === 'over_limit') || r.flags.some((f) => f.kind === 'old_receipt'));
      const emp = await tx.employee.findFirstOrThrow({ where: { organizationId: org, id: claim.employeeId }, select: { personId: true } });
      const fallback = await hrApprovers(tx, org, claim.employeeId, todayIst(), v.userId);
      const sub = await this.engine.submit(tx, c, {
        type: CLAIM_TYPE,
        subjectType: 'expense_claim',
        subjectId: id,
        title: fresh.title,
        summary: [
          { label: 'Claimed', value: `${fresh.currency} ${fresh.claimedTotal.toFixed(2)}` },
          { label: 'Bills', value: String(r.lines.length) },
          ...(r.flags.length ? [{ label: 'Flags', value: String(r.flags.length) }] : []),
        ],
        subjectPersonId: emp.personId,
        requesterUserId: v.userId,
        raisedByUserId: v.userId,
        steps,
        payload: { claimed_total: Number(fresh.claimedTotal), cost_centre_id: (await this.costCentreOf(tx, org, claim.employeeId)) ?? '' },
        payloadFields: [],
        fallbackUserIds: fallback,
        ...(risk === 'high' ? { risk: 'high' as const } : {}),
      });
      await tx.expenseClaim.update({ where: { id }, data: { status: 'submitted', risk, wfRequestId: sub.id, submittedAt: new Date(), decidedAt: null, decisionNote: null, sendBackPending: false, version: { increment: 1 } } });
      await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'expense.claim.submitted', payload: { claimId: id, lines: r.lines.length, flags: r.flags.length } } });
      if (r.flags.length) await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'expense.claim.flagged', payload: { claimId: id, kinds: [...new Set(r.flags.map((f) => f.kind))] } } });
      await audit(tx, c, 'expense.claim.submitted', 'expense_claim', id, { lines: r.lines.length, risk, steps: steps.map((s) => s.name) });
      return sub.notices;
    });
    await this.engine.send(ctx, out);
    return this.get(ctx, user, id);
  }

  private async costCentreOf(tx: Tx, org: string, employeeId: string) {
    const today = asDate(todayIst());
    const a = await tx.employeeAssignment.findFirst({ where: { organizationId: org, employeeId, supersededAt: null, validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gte: today } }] }, orderBy: { validFrom: 'desc' }, select: { id: true } });
    if (!a) return null;
    return (await tx.assignmentCostCentre.findFirst({ where: { organizationId: org, assignmentId: a.id }, orderBy: { percent: 'desc' }, select: { costCentreId: true } }))?.costCentreId ?? null;
  }

  /** §9.1: manager; the cost-centre owner above the company amount; the excess approver; finance's check (§9.3). */
  private async stepsFor(tx: Tx, c: CompanyContext, claim: Claim, risk: 'none' | 'low' | 'high', needsSecondLook: boolean): Promise<StepSpec[]> {
    const org = c.organizationId;
    const scope = { legalEntityId: claim.legalEntityId };
    const steps: StepSpec[] = [{ name: 'Manager', approvers: [{ kind: 'manager' }], mode: 'any', remindAfterHours: 24, timeoutHours: 72, onTimeout: 'escalate', selfApproval: 'never' }];
    const ccAbove = await settingFor(tx, c, 'expense.cc_owner_above', scope);
    if (ccAbove !== 'off' && claim.claimedTotal.gt(D(ccAbove)) && (await this.costCentreOf(tx, org, claim.employeeId))) steps.push({ name: 'Cost-centre owner', approvers: [{ kind: 'cost_centre_owner', field: 'cost_centre_id' }], mode: 'any', remindAfterHours: 24, selfApproval: 'never' });
    const lines = await tx.expenseLine.findMany({ where: { organizationId: org, claimId: claim.id, removedAt: null }, select: { policyResult: true } });
    if (lines.some((l) => (l.policyResult as { outcome?: string } | null)?.outcome === 'over_justify')) steps.push({ name: 'Over the limit', approvers: [{ kind: 'manager', level: 2 }], mode: 'any', remindAfterHours: 24, selfApproval: 'never' });
    const audit = await settingFor(tx, c, 'expense.finance_audit', scope);
    const wantFinance = audit === 'all' || (audit === 'flagged_only' && (risk !== 'none' || needsSecondLook)) || (audit === 'sample_10pct' && (risk === 'high' || Math.random() < 0.1)) || (audit !== 'off' && risk === 'high');
    if (wantFinance) {
      const finance = (await holdersOf(tx, org, 'expense.finance.review', claim.employeeId, todayIst())).filter((u) => u !== c.userId);
      if (finance.length) steps.push({ name: 'Finance check', approvers: [{ kind: 'users', userIds: finance }], mode: 'any', remindAfterHours: 24, selfApproval: 'never' });
    }
    return steps;
  }

  async withdraw(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { claim, a } = await this.claimOr404(tx, c, v, id);
      if (!a.own || claim.status !== 'submitted' || !claim.wfRequestId) throw new ConflictException('Only a claim waiting for approval can be withdrawn, by the person claiming.');
      await this.engine.withdraw(tx, c, claim.wfRequestId, v.userId, 'Withdrawn by the employee to change it');
      // Back to a draft the employee can change and submit again (P03 Q7: the chain starts again).
      await tx.expenseClaim.update({ where: { id }, data: { status: 'draft', wfRequestId: null, version: { increment: 1 } } });
      await tx.expenseLine.updateMany({ where: { organizationId: c.organizationId, claimId: id }, data: { approved: null, reduceReason: null } });
      await audit(tx, c, 'expense.claim.withdrawn', 'expense_claim', id, {});
    });
    return this.get(ctx, user, id);
  }

  // ------------------------------------------------------------------------------------------ approving (§9.2)

  /** Approve with changes: the holder of the open task lowers (or restores) a line, with a reason the employee sees. */
  async approveAmount(ctx: TenantContext, user: ScopeUser, id: string, lineId: string, dto: ApproveAmountDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { claim, a } = await this.claimOr404(tx, c, v, id);
      if (!a.openTaskId || claim.status !== 'submitted') throw new ForbiddenException('Only the approver whose turn it is can change amounts.');
      const l = await tx.expenseLine.findFirst({ where: { organizationId: org, id: lineId, claimId: id, removedAt: null } });
      if (!l) throw new NotFoundException('No such line.');
      const amount = D(dto.amount);
      if (amount.gt(l.claimed)) throw new BadRequestException(`An approver can lower a line, never raise it above the ${l.claimed.toFixed(2)} claimed.`);
      const reduced = amount.lt(l.claimed);
      const reason = dto.reason?.trim() ?? '';
      if (reduced && reason.length < 3) throw new BadRequestException('Say why you are approving less; the employee sees it.');
      const before = l.approved ?? l.claimed;
      await tx.expenseLine.update({ where: { id: l.id }, data: { approved: reduced ? amount.toFixed(2) : null, reduceReason: reduced ? reason : null, version: { increment: 1 } } });
      await tx.expenseLineChange.create({ data: { organizationId: org, claimId: id, lineId: l.id, byUserId: v.userId!, oldAmount: before, newAmount: amount, reason: reduced ? reason : 'Restored to the amount claimed', step: a.openStep ?? 0 } });
      await audit(tx, c, 'expense.line.amount_changed', 'expense_claim', id, { lineId: l.id, from: before.toFixed(2), to: amount.toFixed(2) });
      return this.view(tx, c, claim, a);
    });
  }

  /** Approve, reject (with a reason) or send back (the employee edits and submits again), as the open task's holder. */
  async decide(ctx: TenantContext, user: ScopeUser, id: string, decision: 'approve' | 'reject' | 'send_back', reason: string | undefined) {
    const v = await this.viewer(user);
    const taskId = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { claim, a } = await this.claimOr404(tx, c, v, id);
      if (!a.openTaskId || claim.status !== 'submitted') throw new ForbiddenException('This claim is not waiting for you.');
      if (decision !== 'approve' && (reason?.trim().length ?? 0) < 3) throw new BadRequestException(decision === 'send_back' ? 'Say what the employee should change.' : 'Say why you are not approving it.');
      if (decision === 'send_back') await tx.expenseClaim.update({ where: { id }, data: { sendBackPending: true } });
      return a.openTaskId;
    });
    try {
      await this.engine.decide({ ...ctx, organizationId: ctx.organizationId! }, v.userId!, taskId, decision === 'approve' ? 'approve' : 'reject', reason?.trim() || null);
    } finally {
      if (decision === 'send_back') await this.tenantPrisma.forTenant(ctx, (tx) => tx.expenseClaim.updateMany({ where: { organizationId: ctx.organizationId!, id, status: 'submitted' }, data: { sendBackPending: false } }));
    }
    return this.get(ctx, user, id);
  }

  /** P03 effect, once, in the decision's own transaction. */
  private async decided(tx: Tx, req: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const org = req.organizationId;
    const claim = await tx.expenseClaim.findFirst({ where: { organizationId: org, id: req.subjectId } });
    if (!claim || claim.status !== 'submitted' || claim.wfRequestId !== req.id) return;
    const last = await tx.wfAction.findFirst({ where: { organizationId: org, requestId: req.id }, orderBy: { createdAt: 'desc' }, select: { reason: true } });
    if (outcome === 'rejected') {
      const back = claim.sendBackPending;
      await tx.expenseClaim.update({ where: { id: claim.id }, data: { status: back ? 'sent_back' : 'rejected', sendBackPending: false, decidedAt: new Date(), decisionNote: last?.reason ?? null, version: { increment: 1 } } });
      if (back) await tx.expenseLine.updateMany({ where: { organizationId: org, claimId: claim.id }, data: { approved: null, reduceReason: null } });
      await tx.eventOutbox.create({ data: { organizationId: org, eventType: back ? 'expense.claim.sent_back' : 'expense.claim.rejected', payload: { claimId: claim.id } } });
      if (!back) await closeTripIfDone(tx, org, claim.tripId);
      return;
    }
    const lines = await tx.expenseLine.findMany({ where: { organizationId: org, claimId: claim.id, removedAt: null } });
    const cats = new Map((await tx.expenseCategory.findMany({ where: { organizationId: org } })).map((x) => [x.code, x]));
    let total = D(0);
    let reduced = false;
    for (const l of lines) {
      const approved = l.approved ?? l.claimed;
      if (l.approved && l.approved.lt(l.claimed)) reduced = true;
      const over = (l.policyResult as { overBy?: string } | null)?.overBy ?? '0';
      const payable = l.payMode === 'company_paid' ? D(0) : approved;
      total = total.add(payable);
      await tx.expenseLine.update({ where: { id: l.id }, data: { approved, taxableAmount: taxablePart(cats.get(l.categoryCode)?.taxable ?? 'never', payable.toFixed(2), over) } });
    }
    // E4: the trip's (or imprest's) advance covers the claim first; only the rest is paid (XP-4.04).
    const adjusted = await settleAdvanceByClaim(tx, org, claim, total);
    await tx.expenseClaim.update({ where: { id: claim.id }, data: { status: reduced ? 'partly_approved' : 'approved', approvedTotal: total, advanceAdjusted: adjusted, netPayable: total.sub(adjusted), paymentStatus: total.sub(adjusted).gt(0) ? 'approved_unpaid' : 'not_due', decidedAt: new Date(), decisionNote: last?.reason ?? null, version: { increment: 1 } } });
    await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'expense.claim.approved', payload: { claimId: claim.id, reduced } } });
    await closeTripIfDone(tx, org, claim.tripId);
  }

  // ------------------------------------------------------------------------------------------ finance (§9.3)

  async decideFlag(ctx: TenantContext, user: ScopeUser, flagId: string, decision: 'clear' | 'confirm', note: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const f = await tx.expenseFlag.findFirst({ where: { organizationId: org, id: flagId } });
      if (!f) throw new NotFoundException('No such flag.');
      const { claim, a } = await this.claimOr404(tx, c, v, f.claimId);
      if (!a.finance) throw new ForbiddenException('Only finance decides flags.');
      if (a.own) throw new ForbiddenException('You cannot decide flags on your own claim.');
      if (f.status !== 'open' || claim.status !== 'submitted') throw new ConflictException('This flag is already decided.');
      await tx.expenseFlag.update({ where: { id: f.id }, data: { status: decision === 'clear' ? 'cleared' : 'confirmed', decidedBy: v.userId, decidedAt: new Date(), note } });
      // A confirmed duplicate pays nothing for that line (§9.3), with the reason shown to the employee.
      if (decision === 'confirm' && f.lineId && ['same_receipt', 'same_invoice', 'look_alike'].includes(f.kind)) {
        const l = await tx.expenseLine.findFirstOrThrow({ where: { organizationId: org, id: f.lineId } });
        await tx.expenseLine.update({ where: { id: l.id }, data: { approved: 0, reduceReason: `Duplicate confirmed by finance: ${note}`.slice(0, 300) } });
        await tx.expenseLineChange.create({ data: { organizationId: org, claimId: claim.id, lineId: l.id, byUserId: v.userId!, oldAmount: l.approved ?? l.claimed, newAmount: 0, reason: `Duplicate confirmed by finance: ${note}`.slice(0, 300), step: 0 } });
      }
      await audit(tx, c, `expense.flag.${decision === 'clear' ? 'cleared' : 'confirmed'}`, 'expense_claim', claim.id, { flagId: f.id, kind: f.kind });
      return this.view(tx, c, claim, a);
    });
  }

  // ------------------------------------------------------------------------------------------ home (EXP-01)

  async home(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    const mine = await this.list(ctx, user, 'mine');
    const waiting = (await this.list(ctx, user, 'approvals')).claims.length;
    const review = v.grants.has('expense.finance.review') ? (await this.list(ctx, user, 'review')).claims.length : null;
    // YX-EXP-06: what the person will receive from claims approved but not yet paid.
    const toReceive = mine.claims.filter((x) => x.paymentStatus === 'approved_unpaid' || x.paymentStatus === 'in_payroll' || x.paymentStatus === 'payout_queued').reduce((t, x) => t.add(D(x.netPayable)), D(0));
    return { claims: mine.claims, waitingForMe: waiting, toReview: review, toReceive: toReceive.toFixed(2) };
  }
}
