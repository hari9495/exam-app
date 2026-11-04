import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { FilesService } from '../documents/files.service';
import { CompanyContext, Tx, audit, companyContext } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { safeName } from '../service-desk/attachments.service';
import { payHolders, withPayScope } from '../payroll/pay-access';
import { SpecialPayService } from '../payroll/special-pay.service';
import { type Folded, type Step, clocks, disputeNumber, fold, late, nextMeeting, stage } from './dispute-rules';
import type { CloseDto, DemandDto, DemandUpdateDto, DisputeDto, FiledDto, MeetingDto, SettlementDto } from './dto';

// HLP-13 collective disputes (rules: docs/yukthix/helpdesk-design-map.md section 4h). Company side only: the industrial
// relations team (a speak-up list only the System Admin keeps; an outside lawyer can be on it) keeps the record: the
// charter of demands, meetings with the union and the conciliation officer, the papers (each file's SHA-256 kept, every
// open audited) and the signed settlement. Everyone else, and other companies, get 404, the same as a dispute that isn't
// there (APX-D §6.3). One IR member records the settlement, a second approves it (never the same person: the database
// refuses it too); only then is it sent to payroll as a PAY-37 wage-settlement arrears worksheet, which payroll checks,
// posts for a pay month and has approved as usual. Nothing is paid from here. Legal clocks come from IN.IR.DISPUTE
// (verify), never from code. Strike and lock-out notices and tribunal stages are not built (founder questions).

type Row = Prisma.IrDisputeGetPayload<object>;
const ANY_ENTITY = { legalEntityId: '00000000-0000-0000-0000-000000000000' };
const PAPER_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
const FILE_MAX_MB = 10;
const MAX_PAPERS = 100;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const NOT_FOUND = 'Not found.';

const clash = (e: unknown): never => {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Someone else did this at the same moment. Open the dispute again to see it.');
  throw e;
};

interface Loaded {
  row: Row;
  steps: Step[];
  f: Folded;
  team: { userId: string; role: string }[];
}

@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
    private readonly files: FilesService,
    private readonly special: SpecialPayService,
  ) {}

  private tx<T>(ctx: TenantContext, fn: (tx: Tx, c: CompanyContext) => Promise<T>) {
    const c = companyContext(ctx);
    if (!c.userId) throw new ForbiddenException('Sign in to use disputes.');
    return this.tenantPrisma.forTenant(c, (tx) => fn(tx, c)).catch(clash);
  }

  private async irTeam(tx: Tx, org: string) {
    return tx.speakupTeamMember.findMany({ where: { organizationId: org, team: 'ir', removedAt: null }, select: { userId: true, role: true }, orderBy: { addedAt: 'asc' } });
  }

  /** The IR team's members only; everyone else gets 404. */
  private async member(tx: Tx, c: CompanyContext) {
    const team = await this.irTeam(tx, c.organizationId);
    if (!team.some((m) => m.userId === c.userId)) throw new NotFoundException(NOT_FOUND);
    return team;
  }

  private async load(tx: Tx, c: CompanyContext, id: string): Promise<Loaded> {
    const team = await this.member(tx, c);
    const row = await tx.irDispute.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!row) throw new NotFoundException(NOT_FOUND);
    const steps = await tx.irDisputeStep.findMany({ where: { organizationId: c.organizationId, disputeId: row.id }, orderBy: { at: 'asc' } });
    return { row, steps, f: fold(steps), team };
  }

  /** The record is complete once the settlement is approved, or the dispute is closed. */
  private open(l: Loaded) {
    if (l.f.closed) throw new ConflictException('This dispute is closed.');
    if (l.f.settlement.status === 'approved') throw new ConflictException('The settlement is approved, so the dispute record is complete. Record the copy filed with the authorities.');
  }

  private async step(tx: Tx, c: CompanyContext, l: Loaded, kind: string, data: Record<string, unknown>, action: string) {
    const s = await tx.irDisputeStep.create({ data: { organizationId: c.organizationId, disputeId: l.row.id, kind, actorUserId: c.userId!, data: data as Prisma.InputJsonValue } });
    await audit(tx, c, action, 'ir_dispute', l.row.id, { stepId: s.id, ...data });
    return s;
  }

  private async names(tx: Tx, org: string, ids: (string | null | undefined)[]) {
    const want = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const rows = want.length ? await tx.user.findMany({ where: { organizationId: org, id: { in: want } }, select: { id: true, name: true, email: true } }) : [];
    return (id: string | null | undefined) => (id ? (rows.find((u) => u.id === id)?.name ?? rows.find((u) => u.id === id)?.email ?? 'Former user') : '');
  }

  private async ruleSet(tx: Tx, on: string) {
    const rs = await tx.statutoryRuleSet.findFirst({ where: { statute: 'IN.IR.DISPUTE', jurisdiction: 'IN', status: 'published', validFrom: { lte: day(on) }, OR: [{ validTo: null }, { validTo: { gte: day(on) } }] }, orderBy: { validFrom: 'desc' } });
    return rs ? { values: rs.values as Record<string, number>, label: `IN.IR.DISPUTE ${rs.version}${rs.verify ? ' (verify)' : ''}` } : null;
  }

  /** The clocks with the legal days of the rule set in force on each clock's start day. */
  private async clocksOf(tx: Tx, f: Folded) {
    const start = f.meetings.find((m) => m.kind === 'conciliation')?.on ?? null;
    const signed = f.settlement.status === 'approved' ? f.settlement.terms!.signedOn : null;
    const a = start ? await this.ruleSet(tx, start) : null;
    const b = signed ? await this.ruleSet(tx, signed) : null;
    return {
      clocks: clocks(f, { report: a?.values.conciliationReportDays ?? null, copy: b?.values.settlementCopyDays ?? null }),
      source: [...new Set([a?.label, b?.label].filter(Boolean))].join(' · ') || null,
    };
  }

  /** A paper of this dispute, by its file id. */
  private paper(l: Loaded, fileId: string | undefined) {
    if (fileId && !l.f.papers.some((p) => p.fileId === fileId)) throw new BadRequestException('Choose a paper uploaded to this dispute.');
  }

  private notify(org: string, to: string[], id: string, text: string) {
    if (!to.length) return Promise.resolve();
    return this.notifications
      .notifySystem({ organizationId: org, isSuperAdmin: false }, to, 'helpdesk.dispute.settlement', { entityType: 'ir_dispute', entityId: id, contextText: text, linkPath: `/yx/desk/disputes/${id}` }, { subject: text, html: `<p>${text}. Open YukthiX to see it.</p>` })
      .then(() => undefined)
      .catch((e: Error) => this.logger.warn(`dispute notice: ${e.message}`));
  }

  // ------------------------------------------------------------------------------------------ list, form, record

  /** The Cases list rows: every dispute for the IR team; nothing (an empty list) for anyone else. */
  async list(ctx: TenantContext) {
    return this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      if (!(await this.irTeam(tx, org)).some((m) => m.userId === c.userId)) return [];
      const today = todayIst();
      // shortcut: the newest 500 disputes; paging when a company has more.
      const rows = await tx.irDispute.findMany({ where: { organizationId: org }, orderBy: { createdAt: 'desc' }, take: 500 });
      const steps = await tx.irDisputeStep.findMany({ where: { organizationId: org, disputeId: { in: rows.map((r) => r.id) } }, orderBy: { at: 'asc' } });
      const locs = await tx.location.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.locationId) } }, select: { id: true, name: true } });
      const out = [];
      for (const row of rows) {
        const f = fold(steps.filter((s) => s.disputeId === row.id));
        const k = await this.clocksOf(tx, f);
        const next = k.clocks.filter((x) => !x.doneOn && x.due).sort((a, b) => a.due!.localeCompare(b.due!))[0];
        const done = Boolean(f.closed || f.filed);
        const overdue = !done && k.clocks.some((x) => late(x, today));
        out.push({
          id: row.id,
          ref: disputeNumber(row.number),
          kind: 'dispute' as const,
          subject: row.title,
          location: locs.find((x) => x.id === row.locationId)?.name ?? '',
          stage: stage(f),
          raisedBy: row.unionName,
          anonymous: false,
          owner: 'Industrial relations team',
          next: !done && next ? { label: next.label, on: next.due } : null,
          overdue,
          status: done ? ('closed' as const) : overdue || f.settlement.status === 'proposed' ? ('action' as const) : ('open' as const),
        });
      }
      return out;
    });
  }

  /** The "Record a dispute" form: the IR team only (the Cases page offers the button when this loads). */
  async form(ctx: TenantContext) {
    return this.tx(ctx, async (tx, c) => {
      await this.member(tx, c);
      return { locations: await tx.location.findMany({ where: { organizationId: c.organizationId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }) };
    });
  }

  async create(ctx: TenantContext, dto: DisputeDto) {
    return this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.member(tx, c);
      if (dto.receivedOn > todayIst()) throw new BadRequestException('The day the charter was received can’t be in the future.');
      if (!(await tx.location.findFirst({ where: { organizationId: org, id: dto.locationId }, select: { id: true } }))) throw new BadRequestException('Choose one of the company’s locations.');
      const last = await tx.irDispute.aggregate({ where: { organizationId: org }, _max: { number: true } });
      const row = await tx.irDispute.create({ data: { organizationId: org, number: (last._max.number ?? 0) + 1, title: dto.title, unionName: dto.unionName, locationId: dto.locationId, workersCovered: dto.workersCovered, receivedOn: day(dto.receivedOn), createdBy: c.userId! } });
      await audit(tx, c, 'dispute.recorded', 'ir_dispute', row.id, { number: disputeNumber(row.number), unionName: dto.unionName, workersCovered: dto.workersCovered, receivedOn: dto.receivedOn });
      return { id: row.id, number: disputeNumber(row.number) };
    });
  }

  // ------------------------------------------------------------------------------------------ reading

  /** The whole record for the IR team; 404 for everyone else. Every look is audited. */
  async detail(ctx: TenantContext, id: string) {
    return this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      const l = await this.load(tx, c, id);
      const { f, row } = l;
      const k = await this.clocksOf(tx, f);
      const fileRows = await tx.file.findMany({ where: { organizationId: org, id: { in: f.papers.map((p) => p.fileId) } }, select: { id: true, scanStatus: true } });
      const scan = (fileId: string) => {
        const s = fileRows.find((x) => x.id === fileId)?.scanStatus;
        return s === 'clean' ? ('clean' as const) : s === 'infected' ? ('infected' as const) : ('pending' as const);
      };
      const paper = (fileId: string | null | undefined) => {
        const p = fileId ? f.papers.find((x) => x.fileId === fileId) : null;
        return p ? { id: p.fileId, title: p.title, name: p.name, sha256: p.sha256, scan: scan(p.fileId) } : null;
      };
      const s = f.settlement;
      const name = await this.names(tx, org, [row.createdBy, s.proposedBy, s.approvedBy, s.sentBack?.by, ...l.team.map((m) => m.userId), ...f.meetings.map((m) => m.by), ...f.papers.map((p) => p.by)]);
      const loc = await tx.location.findFirst({ where: { organizationId: org, id: row.locationId }, select: { name: true } });
      const me = l.team.find((m) => m.userId === c.userId)!;
      const lawyerMayApprove = (await settingFor(tx, c, 'dispute.lawyer_may_approve', ANY_ENTITY)) === 'yes';
      await audit(tx, c, 'dispute.viewed', 'ir_dispute', row.id, {});
      return {
        id: row.id,
        number: disputeNumber(row.number),
        title: row.title,
        unionName: row.unionName,
        location: loc?.name ?? '',
        workersCovered: row.workersCovered,
        receivedOn: iso(row.receivedOn),
        recordedBy: name(row.createdBy),
        stage: stage(f),
        demands: f.demands,
        meetings: f.meetings.map((m) => ({ id: m.id, kind: m.kind, on: m.on, officer: m.officer, attended: m.attended, minutes: m.minutes, paper: paper(m.paperId), nextOn: m.nextOn, by: name(m.by) })),
        papers: f.papers.map((p) => ({ ...paper(p.fileId)!, by: name(p.by), at: p.at.toISOString() })),
        nextMeeting: nextMeeting(f),
        settlement: {
          status: s.status,
          terms: s.terms ? { ...s.terms, effectiveTo: s.terms.effectiveTo ?? null, paper: paper(s.terms.paperId) } : null,
          proposedBy: s.proposedBy ? name(s.proposedBy) : null,
          proposedAt: s.proposedAt?.toISOString() ?? null,
          proposedByMe: s.proposedBy === c.userId,
          approvedBy: s.approvedBy ? name(s.approvedBy) : null,
          approvedAt: s.approvedAt?.toISOString() ?? null,
          wageSettlementId: s.wageSettlementId,
          sentBack: s.sentBack ? { reason: s.sentBack.reason, by: name(s.sentBack.by), at: s.sentBack.at.toISOString() } : null,
          canApprove: s.status === 'proposed' && s.proposedBy !== c.userId && (me.role !== 'external' || lawyerMayApprove),
        },
        filed: f.filed,
        closed: f.closed ? { how: f.closed.how, note: f.closed.note, on: f.closed.on.toISOString() } : null,
        ...k,
        members: l.team.map((m) => ({ name: name(m.userId), role: m.role === 'external' ? 'Outside lawyer' : 'Industrial relations team', access: 'Full dispute record', external: m.role === 'external' })),
      };
    });
  }

  // ------------------------------------------------------------------------------------------ the IR team's steps

  async addDemand(ctx: TenantContext, id: string, dto: DemandDto) {
    return this.tx(ctx, async (tx, c) => {
      const l = await this.load(tx, c, id);
      this.open(l);
      if (l.f.demands.length >= 100) throw new BadRequestException('A dispute can have up to 100 demands.');
      const s = await this.step(tx, c, l, 'demand', { code: `D${l.f.demands.length + 1}`, text: dto.text, union: dto.union, mgmt: dto.mgmt }, 'dispute.demand_added');
      return { id: s.id };
    });
  }

  async updateDemand(ctx: TenantContext, id: string, demandId: string, dto: DemandUpdateDto) {
    return this.tx(ctx, async (tx, c) => {
      const l = await this.load(tx, c, id);
      this.open(l);
      if (!l.f.demands.some((d) => d.id === demandId)) throw new NotFoundException(NOT_FOUND);
      if (dto.status === 'agreed' && !dto.agreed) throw new BadRequestException('Write what was agreed.');
      await this.step(tx, c, l, 'demand_update', { demandId, status: dto.status, ...(dto.status === 'agreed' ? { agreed: dto.agreed } : {}), ...(dto.mgmt ? { mgmt: dto.mgmt } : {}) }, 'dispute.demand_updated');
      return { ok: true };
    });
  }

  async meeting(ctx: TenantContext, id: string, dto: MeetingDto) {
    return this.tx(ctx, async (tx, c) => {
      const l = await this.load(tx, c, id);
      this.open(l);
      if (dto.on > todayIst()) throw new BadRequestException('Log a meeting once it is held; the next date goes in “Next meeting”.');
      if (dto.on < iso(l.row.receivedOn)) throw new BadRequestException('A meeting can’t be before the charter was received.');
      if (dto.kind === 'conciliation' && !dto.officer) throw new BadRequestException('Name the conciliation officer.');
      if (dto.nextOn && dto.nextOn <= dto.on) throw new BadRequestException('The next meeting comes after this one.');
      this.paper(l, dto.paperId);
      const s = await this.step(tx, c, l, 'meeting', { kind: dto.kind, on: dto.on, ...(dto.officer ? { officer: dto.officer } : {}), attended: dto.attended, minutes: dto.minutes, ...(dto.paperId ? { paperId: dto.paperId } : {}), ...(dto.nextOn ? { nextOn: dto.nextOn } : {}) }, 'dispute.meeting_logged');
      return { id: s.id };
    });
  }

  /** A paper (minutes, the charter, the signed settlement): append-only, its fingerprint kept. */
  async addPaper(ctx: TenantContext, id: string, title: string, file: { name: string; data: Buffer } | null) {
    if (!file?.data?.length) throw new BadRequestException('Choose a file to add.');
    return this.tx(ctx, async (tx, c) => {
      const l = await this.load(tx, c, id);
      if (l.f.closed) throw new ConflictException('This dispute is closed.');
      if (l.f.papers.length >= MAX_PAPERS) throw new BadRequestException(`A dispute can have up to ${MAX_PAPERS} papers.`);
      const f = await this.files.storeIn(tx, c, { area: 'ir-dispute', name: safeName(file.name), data: file.data, allowedMime: PAPER_TYPES, maxMb: FILE_MAX_MB, via: 'staff' });
      await this.step(tx, c, l, 'paper', { fileId: f.id, sha256: f.sha256, title, name: f.fileName }, 'dispute.paper_added');
      void this.files.scan(c.organizationId, f.id).catch(() => undefined);
      return { id: f.id, name: f.fileName, sha256: f.sha256, scan: f.scanStatus };
    });
  }

  /** Opens a paper: clean files only, the fingerprint checked, every open audited. */
  async file(ctx: TenantContext, id: string, fileId: string) {
    const row = await this.tx(ctx, async (tx, c) => {
      const l = await this.load(tx, c, id);
      const p = l.f.papers.find((x) => x.fileId === fileId);
      if (!p) throw new NotFoundException(NOT_FOUND);
      const f = await tx.file.findFirstOrThrow({ where: { organizationId: c.organizationId, id: fileId } });
      if (f.scanStatus !== 'clean') throw new ConflictException('This file is still being checked for viruses, or failed the check.');
      if (p.sha256 !== f.sha256) throw new ConflictException('This file does not match its recorded fingerprint. Tell your System Admin.');
      await audit(tx, c, 'dispute.paper_opened', 'ir_dispute', l.row.id, { fileId, sha256: f.sha256 });
      return f;
    });
    return { file: await this.files.bytes(row), name: row.fileName, contentType: row.mime };
  }

  /** One IR member records the signed settlement; it waits for a second member's approval. */
  async propose(ctx: TenantContext, id: string, dto: SettlementDto) {
    const out = await this.tx(ctx, async (tx, c) => {
      const l = await this.load(tx, c, id);
      this.open(l);
      if (l.f.settlement.status === 'proposed') throw new ConflictException('A settlement is already waiting for approval. Approve it or send it back first.');
      if (dto.signedOn > todayIst()) throw new BadRequestException('The day it was signed can’t be in the future.');
      if (dto.signedOn < iso(l.row.receivedOn)) throw new BadRequestException('The settlement can’t be signed before the charter was received.');
      if (dto.effectiveTo && dto.effectiveTo < dto.effectiveFrom) throw new BadRequestException('The settlement ends after it starts.');
      if (new Set(dto.rates.map((r) => r.category)).size !== dto.rates.length) throw new BadRequestException('Each worker category once.');
      if (dto.kind === 'conciliation' && !l.f.meetings.some((m) => m.kind === 'conciliation')) throw new BadRequestException('Log the conciliation meeting first, or choose a bipartite settlement.');
      this.paper(l, dto.paperId);
      const data = { kind: dto.kind, signedOn: dto.signedOn, effectiveFrom: dto.effectiveFrom, ...(dto.effectiveTo ? { effectiveTo: dto.effectiveTo } : {}), covered: dto.covered, terms: dto.terms, rates: dto.rates.map((r) => ({ category: r.category, monthlyIncrease: r.monthlyIncrease })), paperId: dto.paperId };
      const s = await this.step(tx, c, l, 'settlement_proposed', data, 'dispute.settlement_proposed');
      return { id: s.id, org: c.organizationId, to: l.team.map((m) => m.userId).filter((u) => u !== c.userId), number: disputeNumber(l.row.number) };
    });
    await this.notify(out.org, out.to, id, `The settlement of dispute ${out.number} waits for your approval`);
    return { id: out.id };
  }

  /** Someone else on the IR team sends a recorded settlement back with a reason (the recorder may withdraw it too). */
  async sendBack(ctx: TenantContext, id: string, reason: string) {
    const out = await this.tx(ctx, async (tx, c) => {
      const l = await this.load(tx, c, id);
      this.open(l);
      if (l.f.settlement.status !== 'proposed') throw new ConflictException('No settlement is waiting for approval.');
      await this.step(tx, c, l, 'settlement_sent_back', { proposalId: l.f.settlement.proposalId, reason }, 'dispute.settlement_sent_back');
      return { org: c.organizationId, to: l.f.settlement.proposedBy !== c.userId ? [l.f.settlement.proposedBy!] : [], number: disputeNumber(l.row.number) };
    });
    await this.notify(out.org, out.to, id, `The settlement of dispute ${out.number} was sent back`);
    return { ok: true };
  }

  /**
   * A second IR member approves the settlement: its pay terms go to payroll as ONE wage-settlement arrears worksheet
   * (PAY-37), which payroll previews, posts for a pay month and gets approved as usual. Nothing is paid here.
   */
  async approve(ctx: TenantContext, id: string) {
    const out = await this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      const l = await this.load(tx, c, id);
      if (l.f.closed) throw new ConflictException('This dispute is closed.');
      const s = l.f.settlement;
      if (s.status === 'approved') throw new ConflictException('The settlement is already approved and sent to payroll.');
      if (s.status !== 'proposed') throw new ConflictException('No settlement is waiting for approval.');
      if (s.proposedBy === c.userId) throw new ForbiddenException('Someone else on the industrial relations team approves the settlement you recorded.');
      if (l.team.find((m) => m.userId === c.userId)?.role === 'external' && (await settingFor(tx, c, 'dispute.lawyer_may_approve', ANY_ENTITY)) !== 'yes')
        throw new ForbiddenException('Your company lets only its own IR team members approve a settlement, not the outside lawyer.');
      const loc = await tx.location.findFirstOrThrow({ where: { organizationId: org, id: l.row.locationId }, select: { legalEntityId: true } });
      if (!loc.legalEntityId) throw new ConflictException('The dispute’s location has no legal entity, so payroll can’t pay its arrears. Ask your System Admin to set it.');
      const t = s.terms!;
      const number = disputeNumber(l.row.number);
      // Payroll's pay guard opens only for this one write, to the dispute's legal entity.
      const ws = await withPayScope(tx, [loc.legalEntityId], () =>
        this.special.settlementIn(tx, c, c.userId!, { legalEntityId: loc.legalEntityId!, title: `${l.row.title} (${number})`.slice(0, 200), effectiveFrom: t.effectiveFrom, signedOn: t.signedOn, rates: t.rates, source: `dispute:${l.row.id}` }),
      );
      await this.step(tx, c, l, 'settlement_approved', { proposalId: s.proposalId, proposedBy: s.proposedBy, wageSettlementId: ws.id }, 'dispute.settlement_approved');
      const payroll = await payHolders(tx, org, 'payroll.special.manage', loc.legalEntityId, todayIst());
      return { org, number, proposer: s.proposedBy!, payroll: payroll.filter((u) => u !== c.userId), wageSettlementId: ws.id };
    });
    await this.notify(out.org, [out.proposer], id, `The settlement of dispute ${out.number} was approved and sent to payroll arrears`);
    await this.notify(out.org, out.payroll, id, `A signed settlement (${out.number}) is in Special pay › Settlements for its arrears`);
    return { wageSettlementId: out.wageSettlementId };
  }

  /** The settlement's copy was sent to the authorities (once, after approval). */
  async filed(ctx: TenantContext, id: string, dto: FiledDto) {
    return this.tx(ctx, async (tx, c) => {
      const l = await this.load(tx, c, id);
      if (l.f.settlement.status !== 'approved') throw new ConflictException('Approve the settlement first.');
      if (l.f.filed) throw new ConflictException('The copy is already recorded as filed.');
      if (dto.on > todayIst()) throw new BadRequestException('The date filed can’t be in the future.');
      if (dto.on < l.f.settlement.terms!.signedOn) throw new BadRequestException('The copy can’t be filed before the settlement was signed.');
      await this.step(tx, c, l, 'filed', { on: dto.on, ...(dto.ref ? { ref: dto.ref } : {}) }, 'dispute.filed');
      return { ok: true };
    });
  }

  /** A dispute that ends without a settlement: withdrawn, or no settlement reached (what follows is outside the app). */
  async close(ctx: TenantContext, id: string, dto: CloseDto) {
    return this.tx(ctx, async (tx, c) => {
      const l = await this.load(tx, c, id);
      this.open(l);
      if (l.f.settlement.status === 'proposed') throw new ConflictException('A settlement is waiting for approval. Approve it or send it back first.');
      await this.step(tx, c, l, 'closed', { how: dto.how, note: dto.note }, 'dispute.closed');
      return { ok: true };
    });
  }
}
