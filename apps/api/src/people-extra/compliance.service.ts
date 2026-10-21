import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, CompanyContext, inCompany, Tx } from '../org-structure/org-structure.service';
import { addDays, isoDate, todayIst } from '../org-structure/org-validation';
import { buildViewer, tenantWide, Viewer } from '../access/scope';
import { displayName, EmployeeHistoryService, RequestUser } from '../employee-history/employee-history.service';
import { OtpService } from '../auth/otp.service';
import { sealValue } from '../people/profile.service';
import { settingFor } from '../people/probation';
import { EXTRA_KEYS } from './records.service';

// BFSI compliance (PPL-43 declarations, PPL-44 trading pre-clearance), only for companies that switch it on
// (Settings › Company rules: people.bfsi_compliance). The compliance officer (compliance.officer, company-wide,
// Confidential) keeps the register of designated persons, reviews declarations and decides pre-clearance requests,
// never their own (maker-checker). A designated person declares holdings, related persons and conflicts each
// financial year and attests the code of conduct with a one-time code; they ask pre-clearance before a trade, never in
// a closed trading window, and report the trade within the approval's 7 trading days.

const OFFICER = 'compliance.officer';
const VALID_TRADING_DAYS = 7;
const RELATIONS = ['Spouse', 'Father', 'Mother', 'Son', 'Daughter', 'Brother', 'Sister', 'Dependant'] as const;

export interface Holding {
  security: string;
  quantity: number;
  how: string;
}
export interface RelatedInput {
  name: string;
  relation: string;
  pan?: string | null;
  holdings?: string | null;
}

/** The financial year (April to March) of a day: "2026-27". */
export const fyOf = (iso: string) => {
  const y = Number(iso.slice(0, 4));
  const start = Number(iso.slice(5, 7)) >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
};

/** The day `n` trading days (Monday to Friday) on from `from`, counting `from` as the first. */
export function tradingDaysEnd(from: string, n: number): string {
  let d = from;
  let left = n;
  for (;;) {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6 && --left === 0) return d;
    d = addDays(d, 1);
  }
}

@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly history: EmployeeHistoryService,
    private readonly otp: OtpService,
    private readonly crypto: OrgSecretsCryptoService,
  ) {}

  private viewer(user: RequestUser): Promise<Viewer> {
    return buildViewer(this.prisma, this.tenantPrisma, user, EXTRA_KEYS);
  }

  /** The company has switched BFSI compliance on; else nothing here exists. */
  private async on(tx: Tx, c: CompanyContext) {
    if ((await settingFor(tx, c, 'people.bfsi_compliance', { legalEntityId: '' })) !== 'on') throw new NotFoundException('Regulated declarations are not used in this company.');
  }

  private officer(v: Viewer) {
    if (v.actingForOther || !tenantWide(v, OFFICER)) throw new ForbiddenException('This is for the compliance officer.');
  }

  /** The viewer as a designated person. */
  private async designated(tx: Tx, c: CompanyContext, v: Viewer) {
    if (v.actingForOther) throw new ForbiddenException('Only the person themselves declares.');
    const me = await this.history.ownEmployeeId(tx, c, v);
    const d = me ? await tx.designatedPerson.findUnique({ where: { organizationId_employeeId: { organizationId: c.organizationId, employeeId: me } } }) : null;
    if (!me || !d) throw new NotFoundException('You are not a designated person.');
    return me;
  }

  /** This year's declaration, made when first needed (due 30 days after designation or the year's start). */
  private async declaration(tx: Tx, c: CompanyContext, employeeId: string) {
    const today = todayIst();
    const year = fyOf(today);
    const found = await tx.bfsiDeclaration.findFirst({ where: { organizationId: c.organizationId, employeeId, year } });
    if (found) return found;
    return tx.bfsiDeclaration.create({ data: { organizationId: c.organizationId, employeeId, year, dueOn: new Date(`${addDays(today, 30)}T00:00:00Z`) } });
  }

  private declarationView(d: Prisma.BfsiDeclarationGetPayload<object>) {
    return {
      id: d.id,
      year: d.year,
      dueOn: isoDate(d.dueOn),
      holdings: d.holdings as unknown as Holding[],
      related: (d.related as { name: string; relation: string; panLast4: string | null; holdings: string | null }[]).map((r) => ({ name: r.name, relation: r.relation, pan: r.panLast4 ? `XXXXXX${r.panLast4}` : null, holdings: r.holdings })),
      coiHas: d.coiHas,
      coiDetails: d.coiDetails,
      status: d.status as 'draft' | 'submitted' | 'reviewed',
      attestedAt: d.attestedAt,
      version: d.version,
    };
  }

  // ------------------------------------------------------------------------------------------ the person (PPL-43)

  /** What the person sees: whether BFSI applies to them, this year's declaration and their pre-clearance requests. */
  async me(ctx: TenantContext, user: RequestUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      if ((await settingFor(tx, c, 'people.bfsi_compliance', { legalEntityId: '' })) !== 'on') return { enabled: false as const };
      const me = await this.history.ownEmployeeId(tx, c, v);
      const d = me ? await tx.designatedPerson.findUnique({ where: { organizationId_employeeId: { organizationId: c.organizationId, employeeId: me } } }) : null;
      if (!me || !d || v.actingForOther) return { enabled: true as const, designated: false as const };
      const decl = await this.declaration(tx, c, me);
      const today = todayIst();
      const window = await tx.tradingWindow.findFirst({ where: { organizationId: c.organizationId, closedFrom: { lte: new Date(`${today}T00:00:00Z`) }, closedTo: { gte: new Date(`${today}T00:00:00Z`) } } });
      const requests = await tx.preclearanceRequest.findMany({ where: { organizationId: c.organizationId, employeeId: me }, orderBy: { requestedAt: 'desc' }, take: 20 });
      return {
        enabled: true as const,
        designated: true as const,
        today,
        declaration: this.declarationView(decl),
        relations: RELATIONS,
        window: window ? { closedTo: isoDate(window.closedTo), reason: window.reason } : null,
        requests: await Promise.all(requests.map((r) => this.requestView(tx, c, r, today))),
      };
    });
  }

  /** Save the draft: holdings, related persons (PAN sealed), conflict of interest. */
  async save(ctx: TenantContext, user: RequestUser, dto: { holdings: Holding[]; related: RelatedInput[]; coiHas: boolean | null; coiDetails?: string | null; version: number }) {
    const v = await this.viewer(user);
    if (dto.coiHas && !dto.coiDetails?.trim()) throw new BadRequestException('Give the details of the interest.');
    for (const r of dto.related) {
      if (!(RELATIONS as readonly string[]).includes(r.relation)) throw new BadRequestException('Choose the relation from the list.');
      if (r.pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(r.pan.toUpperCase())) throw new BadRequestException(`Enter a 10-character PAN like ABCDE1234F for ${r.name}.`);
    }
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.on(tx, c);
      const me = await this.designated(tx, c, v);
      const d = await this.declaration(tx, c, me);
      if (d.status !== 'draft') throw new ConflictException('This year’s declaration is submitted.');
      if (d.version !== dto.version) throw new ConflictException('Your declaration changed in another window. Reload it.');
      const related = dto.related.map((r) => ({ name: r.name.trim(), relation: r.relation, panEnc: r.pan ? sealValue(this.crypto, c.organizationId, me, r.pan.toUpperCase()) : null, panLast4: r.pan ? r.pan.toUpperCase().slice(-4) : null, holdings: r.holdings?.trim() || null }));
      const u = await tx.bfsiDeclaration.update({ where: { id: d.id }, data: { holdings: dto.holdings.map((h) => ({ security: h.security.trim(), quantity: h.quantity, how: h.how.trim() })) as unknown as Prisma.InputJsonArray, related: related as unknown as Prisma.InputJsonArray, coiHas: dto.coiHas, coiDetails: dto.coiHas ? dto.coiDetails!.trim() : null, version: { increment: 1 } } });
      await audit(tx, c, 'compliance.declaration.saved', 'employee', me, { declarationId: d.id, holdings: dto.holdings.length, related: related.length });
      return this.declarationView(u);
    });
  }

  private otpKey = (org: string, declarationId: string) => `bfsi-attest:${org}:${declarationId}`;

  /** A one-time code to the person's phone (else their email) to attest the code of conduct. */
  async sendOtp(ctx: TenantContext, user: RequestUser, ip: string | null) {
    const v = await this.viewer(user);
    const { org, id, to, email } = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.on(tx, c);
      const me = await this.designated(tx, c, v);
      const d = await this.declaration(tx, c, me);
      if (d.status !== 'draft') throw new ConflictException('This year’s declaration is submitted.');
      if (d.coiHas === null) throw new BadRequestException('Answer the conflict of interest question first.');
      const emp = await tx.employee.findFirstOrThrow({ where: { id: me }, select: { personId: true } });
      const person = await tx.person.findFirst({ where: { id: emp.personId }, select: { primaryPhone: true } });
      const u = await tx.user.findFirstOrThrow({ where: { organizationId: c.organizationId, id: v.userId! }, select: { email: true } });
      return { org: c.organizationId, id: d.id, to: person?.primaryPhone ?? null, email: u.email };
    });
    await this.otp.reserveSend(`bfsi-attest:${org}:${v.userId}`, ip);
    const code = await this.otp.issue(this.otpKey(org, id), { declarationId: id });
    if (to) this.otp.deliver('sms', to, code, 'mfa', org, { userId: v.userId ?? '', fallbackEmail: email });
    else this.otp.deliver('email', email, code, 'mfa', org, { userId: v.userId ?? '' });
    return { sentTo: to ? `${to.slice(0, 3)} ${'•'.repeat(Math.max(0, to.length - 5))}${to.slice(-2)}` : email.replace(/^(.).*(@.*)$/, '$1•••$2') };
  }

  /** The code checks; the declaration is submitted with the attestation (no later edits; the officer reviews it). */
  async submit(ctx: TenantContext, user: RequestUser, dto: { code: string; attest: boolean }) {
    const v = await this.viewer(user);
    if (!dto.attest) throw new BadRequestException('Tick that you have read and will follow the code of conduct.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.on(tx, c);
      const me = await this.designated(tx, c, v);
      const d = await this.declaration(tx, c, me);
      if (d.status !== 'draft') throw new ConflictException('This year’s declaration is submitted.');
      const ok = await this.otp.check(this.otpKey(c.organizationId, d.id), dto.code);
      if (!ok) throw new BadRequestException('That code is wrong or has expired. Send a new one.');
      await tx.bfsiDeclaration.update({ where: { id: d.id }, data: { status: 'submitted', attestedAt: new Date(), cocVersion: d.year, version: { increment: 1 } } });
      await audit(tx, c, 'compliance.declaration.submitted', 'employee', me, { declarationId: d.id, year: d.year, attested: true });
      return { status: 'submitted' };
    });
  }

  // ------------------------------------------------------------------------------------------ the officer (PPL-43)

  async register(ctx: TenantContext, user: RequestUser) {
    const v = await this.viewer(user);
    this.officer(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.on(tx, c);
      const org = c.organizationId;
      const year = fyOf(todayIst());
      const people = await tx.designatedPerson.findMany({ where: { organizationId: org } });
      const emps = await tx.employee.findMany({ where: { organizationId: org, id: { in: people.map((p) => p.employeeId) } }, select: { id: true, givenName: true, familyName: true, preferredName: true } });
      const decls = await tx.bfsiDeclaration.findMany({ where: { organizationId: org, year, employeeId: { in: people.map((p) => p.employeeId) } } });
      const own = await this.history.ownEmployeeId(tx, c, v);
      const today = todayIst();
      await audit(tx, c, 'compliance.register.viewed', 'organization', org, { year });
      const rows = people.map((p) => {
        const e = emps.find((x) => x.id === p.employeeId);
        const d = decls.find((x) => x.employeeId === p.employeeId);
        const due = d ? isoDate(d.dueOn) : addDays(isoDate(p.addedAt), 30);
        const status = d && d.status !== 'draft' ? (d.status === 'reviewed' ? 'Reviewed' : 'Done') : due < today ? 'Overdue' : 'Pending';
        return { employeeId: p.employeeId, declarationId: d?.id ?? null, name: e ? displayName(e) : '', type: 'Holdings, relatives and code of conduct (annual)', due, status, mine: p.employeeId === own, version: d?.version ?? null };
      });
      const windows = await tx.tradingWindow.findMany({ where: { organizationId: org, closedTo: { gte: new Date(`${today}T00:00:00Z`) } }, orderBy: { closedFrom: 'asc' } });
      return { year, rows: rows.sort((a, b) => a.name.localeCompare(b.name)), windows: windows.map((w) => ({ id: w.id, from: isoDate(w.closedFrom), to: isoDate(w.closedTo), reason: w.reason })) };
    });
  }

  async designate(ctx: TenantContext, user: RequestUser, employeeId: string) {
    const v = await this.viewer(user);
    this.officer(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.on(tx, c);
      if (!(await tx.employment.findFirst({ where: { organizationId: c.organizationId, employeeId, exitedOn: null }, select: { id: true } }))) throw new BadRequestException('Choose a current employee.');
      try {
        await tx.designatedPerson.create({ data: { organizationId: c.organizationId, employeeId, addedBy: c.userId ?? null } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('This person is a designated person already.');
        throw e;
      }
      await this.declaration(tx, c, employeeId);
      await audit(tx, c, 'compliance.designated', 'employee', employeeId, {});
      return { employeeId };
    });
  }

  /** The officer reviews a submitted declaration (never their own). Opening it is audited. */
  async declarationFor(ctx: TenantContext, user: RequestUser, id: string) {
    const v = await this.viewer(user);
    this.officer(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.on(tx, c);
      const d = await tx.bfsiDeclaration.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!d) throw new NotFoundException('No such declaration.');
      await audit(tx, c, 'compliance.declaration.viewed', 'employee', d.employeeId, { declarationId: id });
      return this.declarationView(d);
    });
  }

  async review(ctx: TenantContext, user: RequestUser, id: string, version: number) {
    const v = await this.viewer(user);
    this.officer(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.on(tx, c);
      const d = await tx.bfsiDeclaration.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!d) throw new NotFoundException('No such declaration.');
      if ((await this.history.ownEmployeeId(tx, c, v)) === d.employeeId) throw new ForbiddenException('Someone else reviews your declaration.');
      if (d.status !== 'submitted') throw new ConflictException(d.status === 'draft' ? 'This declaration is not submitted yet.' : 'This declaration is reviewed already.');
      if (d.version !== version) throw new ConflictException('Someone else changed this declaration. Reload it.');
      await tx.bfsiDeclaration.update({ where: { id }, data: { status: 'reviewed', reviewedBy: c.userId ?? null, reviewedAt: new Date(), version: { increment: 1 } } });
      await audit(tx, c, 'compliance.declaration.reviewed', 'employee', d.employeeId, { declarationId: id });
      return { status: 'reviewed' };
    });
  }

  async closeWindow(ctx: TenantContext, user: RequestUser, dto: { from: string; to: string; reason: string }) {
    const v = await this.viewer(user);
    this.officer(v);
    if (dto.to < dto.from) throw new BadRequestException('The window reopens on or after it closes.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.on(tx, c);
      const w = await tx.tradingWindow.create({ data: { organizationId: c.organizationId, closedFrom: new Date(`${dto.from}T00:00:00Z`), closedTo: new Date(`${dto.to}T00:00:00Z`), reason: dto.reason.trim(), createdBy: c.userId ?? null } });
      await audit(tx, c, 'compliance.window.closed', 'organization', c.organizationId, { id: w.id, from: dto.from, to: dto.to });
      return { id: w.id };
    });
  }

  // ------------------------------------------------------------------------------------------ pre-clearance (PPL-44)

  private async requestView(tx: Tx, c: CompanyContext, r: Prisma.PreclearanceRequestGetPayload<object>, today: string) {
    const by = r.decidedBy ? await tx.user.findFirst({ where: { id: r.decidedBy }, select: { name: true, email: true } }) : null;
    const until = r.validUntil ? isoDate(r.validUntil) : null;
    const shown = r.status === 'pending' ? 'Pending' : r.status === 'rejected' ? 'Rejected' : r.reportedAt ? 'Done' : until && until < today ? 'Expired' : 'Approved';
    return {
      id: r.id,
      ref: r.ref,
      security: r.security,
      side: r.side as 'buy' | 'sell',
      quantity: r.quantity,
      value: Number(r.value),
      requestedOn: isoDate(r.requestedAt),
      status: shown as 'Pending' | 'Rejected' | 'Done' | 'Expired' | 'Approved',
      decidedBy: by?.name ?? by?.email ?? null,
      approvedOn: r.approvedOn ? isoDate(r.approvedOn) : null,
      validUntil: until,
      note: r.decisionNote,
      tradedOn: r.tradedOn ? isoDate(r.tradedOn) : null,
      tradedQuantity: r.tradedQuantity,
      version: r.version,
    };
  }

  /** A request, never while a trading window is closed; the declaration about inside information is required. */
  async request(ctx: TenantContext, user: RequestUser, dto: { security: string; side: 'buy' | 'sell'; quantity: number; value: number; noUpsi: boolean }) {
    const v = await this.viewer(user);
    if (!dto.noUpsi) throw new BadRequestException('Confirm that you hold no unpublished price-sensitive information about this company.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.on(tx, c);
      const me = await this.designated(tx, c, v);
      const today = todayIst();
      const window = await tx.tradingWindow.findFirst({ where: { organizationId: c.organizationId, closedFrom: { lte: new Date(`${today}T00:00:00Z`) }, closedTo: { gte: new Date(`${today}T00:00:00Z`) } } });
      if (window) throw new ConflictException(`The trading window is closed until ${isoDate(window.closedTo)}. Request again when it reopens.`);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`preclearance-ref:${c.organizationId}`}))`;
      const n = await tx.preclearanceRequest.count({ where: { organizationId: c.organizationId, ref: { startsWith: `PC-${today.slice(0, 4)}-` } } });
      const r = await tx.preclearanceRequest.create({ data: { organizationId: c.organizationId, employeeId: me, ref: `PC-${today.slice(0, 4)}-${String(n + 1).padStart(4, '0')}`, security: dto.security.trim(), side: dto.side, quantity: dto.quantity, value: new Prisma.Decimal(dto.value) } });
      await audit(tx, c, 'compliance.preclearance.requested', 'employee', me, { requestId: r.id, ref: r.ref });
      return { id: r.id, ref: r.ref };
    });
  }

  async queue(ctx: TenantContext, user: RequestUser) {
    const v = await this.viewer(user);
    this.officer(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.on(tx, c);
      const rows = await tx.preclearanceRequest.findMany({ where: { organizationId: c.organizationId }, orderBy: { requestedAt: 'desc' }, take: 200 });
      const emps = await tx.employee.findMany({ where: { organizationId: c.organizationId, id: { in: rows.map((r) => r.employeeId) } }, select: { id: true, givenName: true, familyName: true, preferredName: true } });
      const own = await this.history.ownEmployeeId(tx, c, v);
      const today = todayIst();
      await audit(tx, c, 'compliance.preclearance.queue_viewed', 'organization', c.organizationId, { rows: rows.length });
      return Promise.all(
        rows.map(async (r) => {
          const e = emps.find((x) => x.id === r.employeeId);
          return { ...(await this.requestView(tx, c, r, today)), employeeId: r.employeeId, name: e ? displayName(e) : '', mine: r.employeeId === own };
        }),
      );
    });
  }

  /** Approve (valid for 7 trading days from today, never in a closed window) or reject; never one's own. */
  async decide(ctx: TenantContext, user: RequestUser, id: string, dto: { approve: boolean; note?: string | null; version: number }) {
    const v = await this.viewer(user);
    this.officer(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.on(tx, c);
      const r = await tx.preclearanceRequest.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!r) throw new NotFoundException('No such request.');
      if ((await this.history.ownEmployeeId(tx, c, v)) === r.employeeId) throw new ForbiddenException('Someone else decides your own request.');
      if (r.status !== 'pending') throw new ConflictException(`This request is ${r.status}.`);
      if (r.version !== dto.version) throw new ConflictException('Someone else changed this request. Reload it.');
      if (!dto.approve && !dto.note?.trim()) throw new BadRequestException('Say why it is rejected.');
      const today = todayIst();
      if (dto.approve) {
        const window = await tx.tradingWindow.findFirst({ where: { organizationId: c.organizationId, closedFrom: { lte: new Date(`${today}T00:00:00Z`) }, closedTo: { gte: new Date(`${today}T00:00:00Z`) } } });
        if (window) throw new ConflictException(`The trading window is closed until ${isoDate(window.closedTo)}.`);
      }
      const until = tradingDaysEnd(today, VALID_TRADING_DAYS);
      await tx.preclearanceRequest.update({
        where: { id },
        data: dto.approve
          ? { status: 'approved', decidedBy: c.userId ?? null, decidedAt: new Date(), decisionNote: dto.note?.trim() || null, approvedOn: new Date(`${today}T00:00:00Z`), validUntil: new Date(`${until}T00:00:00Z`), version: { increment: 1 } }
          : { status: 'rejected', decidedBy: c.userId ?? null, decidedAt: new Date(), decisionNote: dto.note!.trim(), version: { increment: 1 } },
      });
      await audit(tx, c, dto.approve ? 'compliance.preclearance.approved' : 'compliance.preclearance.rejected', 'employee', r.employeeId, { requestId: id, ref: r.ref, ...(dto.approve ? { validUntil: until } : {}) });
      return { status: dto.approve ? 'approved' : 'rejected', ...(dto.approve ? { validUntil: until } : {}) };
    });
  }

  /** The trade report with its contract note (one the person uploaded as a contract note). Late reports are allowed. */
  async report(ctx: TenantContext, user: RequestUser, id: string, dto: { tradedOn: string; quantity: number; contractNoteDocumentId: string; version: number }) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.on(tx, c);
      const me = await this.designated(tx, c, v);
      const r = await tx.preclearanceRequest.findFirst({ where: { organizationId: c.organizationId, id, employeeId: me } });
      if (!r) throw new NotFoundException('No such request.');
      if (r.status !== 'approved' || r.reportedAt) throw new ConflictException(r.reportedAt ? 'This trade is reported already.' : 'Only an approved request has a trade to report.');
      if (r.version !== dto.version) throw new ConflictException('This request changed. Reload it.');
      if (dto.quantity > r.quantity) throw new BadRequestException(`You were cleared for ${r.quantity}. Report what you traded, up to that.`);
      if (dto.tradedOn < isoDate(r.approvedOn!) || dto.tradedOn > todayIst()) throw new BadRequestException('The trade date is between the approval and today.');
      const emp = await tx.employee.findFirstOrThrow({ where: { id: me }, select: { personId: true } });
      const doc = await tx.document.findFirst({ where: { organizationId: c.organizationId, id: dto.contractNoteDocumentId, personId: emp.personId, typeKey: 'contract_note' } });
      if (!doc) throw new BadRequestException('Upload the contract note first.');
      const late = dto.tradedOn > isoDate(r.validUntil!);
      await tx.preclearanceRequest.update({ where: { id }, data: { tradedOn: new Date(`${dto.tradedOn}T00:00:00Z`), tradedQuantity: dto.quantity, contractNoteDocumentId: doc.id, reportedAt: new Date(), version: { increment: 1 } } });
      await audit(tx, c, 'compliance.preclearance.reported', 'employee', me, { requestId: id, ref: r.ref, late });
      return { reported: true, late };
    });
  }
}
