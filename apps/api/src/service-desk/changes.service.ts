import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { TenantPrismaService } from '@exam-platform/shared';
import { Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { NotificationsService } from '../notifications/notifications.service';
import { toCsv } from '../performance/calibration-rules';
import { writeText } from '../documents/pdf-text';
import { ApprovalsEngine, Notice, Outcome, StepSpec } from '../workflow/approvals-engine.service';
import { deskRobot } from './catalog.service';
import { DeskActor, activeOn, audit, canSetUp, canWork, deskSystem, emit, isAgentOn, isLead } from './desk-access';
import { ChangeCancelDto, ChangeDto, ChangeExportDto, ItsmReportDto, ChangeOutcomeDto, ChangeReviewDto, ChangeTasksDto } from './dto-itsm';
import { RISK_ORDER, Risk, afterWorkingDays, freezeCalendar, frozenDaysIn, outsideWindow, overlaps, riskOf } from './itsm-rules';
import { ItsmService, ItsmSettings, companyWindow, itsmSettingsOf, noticeTarget } from './itsm.service';
import { ProblemsService } from './problems.service';
import { RequesterService } from './requester.service';
import { textToHtml } from './rich-text';
import { escapeHtml } from '../notifications/notification-email-render';
import { OPEN_STATES, Ticket, TicketsService } from './tickets.service';

/** The approvals engine's request type of an IT change (answer 1934). */
export const CHANGE_APPROVAL = 'desk.itsm_change';
const ACTIVE_STAGES = ['approval', 'scheduled', 'in_progress'];
type Change = Prisma.SdChangeGetPayload<object>;
type Task = { title: string; done: boolean };
export type Owner = { to: string[]; change?: Change; number?: string };
const RISK_WORD: Record<Risk, string> = { low: 'Low', medium: 'Medium', high: 'High' };
const ROUTE_WORDS: Record<string, string> = { lead: 'An IT lead approves.', lead_owner: 'An IT lead, then the service owner, approve.', board: 'The change board approves.' };
const ist = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 16).replace('T', ' ');
const IST_DAY = (d: string) => new Date(`${d}T00:00:00+05:30`);

/**
 * Helpdesk ITSM-2 (docs/yukthix/helpdesk-itsm-plan.md; answers 1932-1938, 1943): change requests on IT desks. Only the
 * desk's agents and leads raise one (1932); the risk comes from the desk's questions and a lower one needs a reason
 * (1933); the approval route follows the risk through the approvals engine, which never lets anyone approve their own
 * change (1934); a standard change from a pre-approved template skips approval and loses the pre-approval when it fails
 * (1935); the window is inside the company's change window and never in a freeze, unless an emergency says why (1936);
 * a scheduled change puts a known-issue banner up and tells the service owner (1937); a high-risk, emergency or failed
 * change is reviewed within the desk's working days (1938); the audit export lists every change of a period (1943).
 */
@Injectable()
export class ChangesService implements OnModuleInit {
  private readonly logger = new Logger(ChangesService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tickets: TicketsService,
    private readonly requesters: RequesterService,
    private readonly approvals: ApprovalsEngine,
    private readonly itsm: ItsmService,
    private readonly notifications: NotificationsService,
    private readonly problems: ProblemsService,
  ) {}

  onModuleInit() {
    this.approvals.register({
      key: CHANGE_APPROVAL,
      label: 'IT change',
      // A change is never decided by a timeout.
      risk: 'high',
      autoActions: false,
      // Maker and checker across steps: the lead who approved never approves again as the service owner.
      distinctSteps: true,
      onDecided: (tx, req, outcome, afterCommit) => this.decided(tx, req, outcome, afterCommit),
      requesterLink: (req) => `/yx/desk/changes/${req.subjectId}`,
      cardPreview: async () => 'full',
    });
  }

  private tx<T>(a: DeskActor, fn: (tx: Tx) => Promise<T>) {
    return this.tenantPrisma.forTenant(a.ctx, fn);
  }

  // ------------------------------------------------------------------------------------------ raising

  async create(a: DeskActor, dto: ChangeDto) {
    // Answer 1932: only the IT desk's agents and leads raise changes (never requesters).
    if (!canWork(a, dto.deskId)) throw new ForbiddenException('Only an agent or lead of this IT desk raises a change.');
    const notices: Notice[] = [];
    const owner: Owner = { to: [] };
    const res = await this.tx(a, (tx) => this.createIn(tx, a, dto, notices, owner));
    await this.afterRaise(a.ctx, notices, owner);
    return res;
  }

  /** After a raise committed: the approvers' notices and the owner's notice. */
  async afterRaise(ctx: DeskActor['ctx'], notices: Notice[], owner: Owner) {
    await this.approvals.send(ctx, notices);
    await this.tellOwner(ctx.organizationId, owner);
  }

  /** The raise in the caller's transaction (a recurring standard change, answer 1952, raises it from the job). Send the
   *  notices and tell the owner after it commits. */
  async createIn(tx: Tx, a: { ctx: DeskActor['ctx']; userId: string }, dto: ChangeDto, notices: Notice[], owner: Owner, scheduled = false) {
    const org = a.ctx.organizationId;
    const desk = await this.itsm.itDesk(tx, a, dto.deskId);
    const s = await itsmSettingsOf(tx, org, desk.id);
    const w = await companyWindow(tx, org);
    const standard = dto.kind === 'standard';
    // Answer 1935: a standard change comes from a pre-approved template of this desk.
    const tpl = standard ? (dto.templateId ? await tx.sdTemplate.findFirst({ where: { organizationId: org, deskId: desk.id, id: dto.templateId, active: true } }) : null) : null;
    if (standard && !tpl?.preApproved) throw new BadRequestException('A standard change comes from a pre-approved template of this desk. Choose one, or raise a normal change.');
    // Answer 1933: the risk from the answers; a lower one needs a reason.
    let risk: Risk = 'low';
    let fromAnswers: Risk | null = null;
    if (!standard) {
      const answers = Object.fromEntries(Object.entries(dto.answers ?? {}).map(([k, v]) => [k, String(v)]));
      fromAnswers = riskOf(s.riskQuestions, answers);
      if (!fromAnswers) throw new BadRequestException('Answer every risk question.');
      risk = dto.risk ?? fromAnswers;
      if (RISK_ORDER.indexOf(risk) < RISK_ORDER.indexOf(fromAnswers) && (dto.riskReason?.trim().length ?? 0) < 10) throw new BadRequestException(`The answers give ${fromAnswers} risk. Say why it is lower (at least 10 characters).`);
    }
    const app = dto.appId ? await tx.sdBusinessApp.findFirst({ where: { organizationId: org, id: dto.appId, status: 'active' } }) : null;
    if (dto.appId && !app) throw new BadRequestException('Choose an application of this company that is in use.');
    const service = app?.name ?? dto.service?.trim();
    if (!service) throw new BadRequestException('Choose the service it touches.');
    const [from, to] = [new Date(dto.from), new Date(dto.to)];
    const refused = this.windowProblem(from, to, w, dto.kind, dto.freezeReason);
    if (refused) throw new BadRequestException(refused);
    const route = dto.kind === 'emergency' ? 'lead' : risk === 'low' ? s.routeLow : risk === 'medium' ? s.routeMedium : s.routeHigh;
    if (!standard && route === 'lead_owner' && !app) throw new BadRequestException('Choose the application it touches: its owner approves after the IT lead.');
    const type = await tx.sdTicketType.findFirst({ where: { organizationId: org, deskId: desk.id, kind: 'change', active: true }, orderBy: { sortOrder: 'asc' } });
    if (!type) throw new BadRequestException('This desk has no change type in use. Ask the desk admin to turn it on.');
    // Answer 2056: a notice limited as the desk asks (checked now, shown once it is scheduled).
    const notice = (dto.banner ?? true) && s.bannerOn ? await noticeTarget(tx, org, s, { locationId: dto.noticeLocationId ?? null, appId: app?.id ?? null }) : { locationId: null, appId: null };
    // Answer 2058: the problem it fixes (an open problem of this desk).
    const problem = dto.problemId ? await tx.sdProblem.findFirst({ where: { organizationId: org, deskId: desk.id, id: dto.problemId, state: { not: 'closed' } } }) : null;
    if (dto.problemId && !problem) throw new BadRequestException('Choose an open problem of this desk.');
    const personId = (await this.requesters.personOf(tx, { ctx: a.ctx, userId: a.userId, acting: false, user: { role: '' } }, true))!;
    const body = [`Service: ${service}`, `Window: ${ist(from)} to ${ist(to)} (India time)`, dto.plan?.trim() ? `Plan: ${dto.plan.trim()}` : '', `Way back: ${dto.backout.trim()}`].filter(Boolean).join('\n\n');
    // A schedule raises it for the person who set the schedule up (who may hold no agent seat): written as theirs, by the API.
    const t = await this.tickets.createIn(tx, a, { deskId: desk.id, typeId: type.id, itsm: true, subject: dto.title.trim(), bodyHtml: textToHtml(body), requesterPersonId: personId, ...(scheduled ? { openedByUserId: null, channel: 'api' as const, side: 'requester' as const, authorPersonId: personId, tags: ['recurring'] } : { openedByUserId: a.userId, channel: 'agent' as const, side: 'agent' as const }) });
    const tasks: Task[] = (tpl?.checklist ?? dto.tasks ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 30).map((title) => ({ title, done: false }));
    let c = await tx.sdChange.create({
      data: {
        organizationId: org,
        deskId: desk.id,
        ticketId: t.id,
        changeKind: dto.kind,
        risk,
        riskFromAnswers: fromAnswers,
        riskAnswers: (standard ? {} : dto.answers ?? {}) as Prisma.InputJsonValue,
        riskReason: dto.riskReason?.trim() || null,
        appId: app?.id ?? null,
        service,
        windowFrom: from,
        windowTo: to,
        freezeReason: dto.freezeReason?.trim() || null,
        plan: dto.plan?.trim() || null,
        backout: dto.backout.trim(),
        banner: dto.banner ?? true,
        noticeLocationId: notice.locationId,
        templateId: tpl?.id ?? null,
        tasks: tasks as unknown as Prisma.InputJsonValue,
        stage: standard ? 'scheduled' : 'approval',
        createdBy: a.userId,
      },
    });
    if (standard) {
      await this.tickets.event(tx, t, 'change_scheduled', null, 'Scheduled', { by: a.userId, reason: `Pre-approved template: ${tpl!.name}` });
      c = await this.scheduled(tx, org, c, s, t, owner);
    } else {
      const sub = await this.approvals.submit(tx, a.ctx, {
        type: CHANGE_APPROVAL,
        subjectType: 'sd_change',
        subjectId: c.id,
        title: `${t.number}: ${dto.title.trim()}`.slice(0, 200),
        summary: [
          { label: 'Change', value: `${t.number} · ${dto.title.trim()}` },
          { label: 'Kind and risk', value: `${dto.kind === 'emergency' ? 'Emergency' : 'Normal'} · ${RISK_WORD[risk]} risk${fromAnswers !== risk ? ` (answers give ${fromAnswers}: ${dto.riskReason?.trim() ?? ''})` : ''}` },
          { label: 'Service', value: service },
          { label: 'Window', value: `${ist(from)} to ${ist(to)} (India time)${c.freezeReason ? ` · in a freeze: ${c.freezeReason}` : ''}` },
          { label: 'Way back', value: dto.backout.trim().slice(0, 500) },
        ],
        subjectPersonId: null,
        requesterUserId: a.userId,
        raisedByUserId: null,
        steps: await this.steps(tx, org, desk.id, s, dto.kind, route, a.userId),
        payload: { appId: app?.id ?? null },
        payloadFields: [],
        fallbackUserIds: [],
      });
      notices.push(...sub.notices);
      c = await tx.sdChange.update({ where: { id: c.id }, data: { approvalRequestId: sub.id } });
      await this.tickets.event(tx, t, 'approval_asked', null, ROUTE_WORDS[route], { by: a.userId, reason: `${RISK_WORD[risk]} risk ${dto.kind === 'emergency' ? 'emergency ' : ''}change` });
    }
    if (problem) {
      const pt = await tx.sdTicket.findFirstOrThrow({ where: { organizationId: org, id: problem.ticketId } });
      await tx.sdTicketLink.createMany({ data: [{ organizationId: org, fromTicketId: t.id, toTicketId: pt.id, kind: 'fixes', createdBy: a.userId }], skipDuplicates: true });
      await this.tickets.event(tx, t, 'linked', null, pt.number, { by: a.userId, reason: 'Fixes' });
      await this.tickets.event(tx, pt, 'linked', null, t.number, { by: a.userId, reason: 'Fixed by' });
    }
    await audit(tx, a, 'desk.change.raised', 'sd_change', c.id, { ticketId: t.id, number: t.number, kind: dto.kind, risk, riskFromAnswers: fromAnswers, riskReason: c.riskReason, route: standard ? 'pre_approved' : route, service, from, to, freezeReason: c.freezeReason });
    return { id: c.id, number: t.number, stage: (await tx.sdChange.findUniqueOrThrow({ where: { id: c.id } })).stage };
  }

  /** Why a window cannot be used (null: it can). Answer 1936: an emergency may run outside the window, and in a freeze with a reason. */
  private windowProblem(from: Date, to: Date, w: Awaited<ReturnType<typeof companyWindow>>, kind: string, freezeReason?: string): string | null {
    if (to.getTime() <= Date.now()) return 'The window must end in the future.';
    if (kind === 'emergency') {
      if (to <= from) return 'The window must end after it starts.';
      if (to.getTime() - from.getTime() > 72 * 3_600_000) return 'A change window can be at most 72 hours.';
    } else {
      const out = outsideWindow(from, to, w);
      if (out) return out;
    }
    const frozen = frozenDaysIn(from, to, w);
    if (!frozen.length) return null;
    const first = frozen[0]!;
    if (kind !== 'emergency') return `It falls in a freeze on ${first.date} (${first.why}). Choose another day; only an emergency change may go into a freeze, with a reason.`;
    return (freezeReason?.trim().length ?? 0) < 10 ? `It falls in a freeze on ${first.date} (${first.why}). Say why this emergency cannot wait (at least 10 characters).` : null;
  }

  /**
   * Answer 1934: who approves, by the desk's route for the risk. Emergency: one IT lead now; the board reviews it after.
   * Answer 2071: when no other IT lead can approve (the desk's only lead raised it), the desk admins approve that step
   * if the desk allows it (on by default); never the person who raised it.
   */
  private async steps(tx: Tx, org: string, deskId: string, s: ItsmSettings, kind: string, route: string, raisedBy: string): Promise<StepSpec[]> {
    const members = async (role: string) => (await tx.sdDeskMember.findMany({ where: { organizationId: org, deskId, role, ...activeOn(todayIst()) }, select: { userId: true } })).map((m) => m.userId).filter((id) => id !== raisedBy);
    const leads = await members('lead');
    const admins = !leads.length && s.leadFallbackAdmin ? await members('admin') : [];
    const lead: StepSpec = admins.length
      ? { name: 'IT lead (desk admin: no other lead)', approvers: [{ kind: 'users', userIds: admins }], mode: 'any', rejectOn: 'one', selfApproval: 'never' }
      : { name: 'IT lead', approvers: [{ kind: 'users', userIds: leads }], mode: 'any', rejectOn: 'one', selfApproval: 'never' };
    if (kind === 'emergency' || route === 'lead') return [lead];
    if (route === 'lead_owner') return [lead, { name: 'Service owner', approvers: [{ kind: 'app_owner', field: 'appId' }], mode: 'any', rejectOn: 'one', selfApproval: 'never' }];
    if (!s.boardUserIds.length) throw new BadRequestException('This risk goes to the change board, and the desk has none yet. Ask the desk admin to name it (Desk set-up › Changes).');
    return [s.boardRule === 'all'
      ? { name: 'Change board (all)', approvers: [{ kind: 'users', userIds: s.boardUserIds }], mode: 'all', rejectOn: 'one', selfApproval: 'never' }
      : { name: 'Change board (majority)', approvers: [{ kind: 'users', userIds: s.boardUserIds }], mode: 'percent', percent: 51, rejectOn: 'quorum_lost', selfApproval: 'never' }];
  }

  /** The approvals engine decided (its own transaction, exactly once). */
  private async decided(tx: Tx, req: Prisma.WfRequestGetPayload<object>, outcome: Outcome, afterCommit?: (fn: () => Promise<void>) => void) {
    await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
    const org = req.organizationId;
    const c = await tx.sdChange.findFirst({ where: { organizationId: org, id: req.subjectId } });
    if (!c || c.stage !== 'approval') return;
    const t = await tx.sdTicket.findFirstOrThrow({ where: { organizationId: org, id: c.ticketId } });
    const last = await tx.wfAction.findFirst({ where: { organizationId: org, requestId: req.id, action: { in: ['approved', 'rejected', 'self_approved', 'auto_rejected'] } }, orderBy: { createdAt: 'desc' } });
    await this.tickets.event(tx, t, 'approval_decided', null, outcome === 'approved' ? 'Approved' : 'Not approved', { by: last?.actorUserId ?? null, reason: last?.reason ?? null });
    if (outcome === 'rejected') {
      await tx.sdChange.update({ where: { id: c.id }, data: { stage: 'rejected', version: { increment: 1 }, updatedAt: new Date() } });
      await this.settle(tx, org, t, 'closed', `Not approved${last?.reason ? `: ${last.reason}` : ''}`);
      return;
    }
    const owner: Owner = { to: [] };
    await this.scheduled(tx, org, c, await itsmSettingsOf(tx, org, c.deskId), t, owner);
    // Answer 1937: the owner hears of it only once the decision is saved (never from a transaction that fails).
    afterCommit?.(() => this.tellOwner(org, owner));
  }

  /** Scheduled: the known-issue banner from the desk's hours before until the window ends (answer 1937). */
  private async scheduled(tx: Tx, org: string, c: Change, s: ItsmSettings, t: Ticket, owner: Owner) {
    let bannerId: string | null = null;
    if (c.banner && s.bannerOn) {
      const text = `Planned IT change: ${t.subject} (${c.service}), ${ist(c.windowFrom)} to ${ist(c.windowTo)} India time. It may not work during this time.`.slice(0, 300);
      // No "me too" link: a change ticket is IT's own record, never followed by requesters.
      bannerId = (await tx.sdBanner.create({ data: { organizationId: org, deskId: c.deskId, audience: 'employees', text, severity: 'info', ticketId: null, locationId: c.noticeLocationId, appId: s.noticeScope === 'application' ? c.appId : null, startsAt: new Date(c.windowFrom.getTime() - s.bannerHours * 3_600_000), endsAt: c.windowTo, createdBy: c.createdBy } })).id;
      await emit(tx, org, 'helpdesk.banner.published', { bannerId, deskId: c.deskId });
    }
    const after = await tx.sdChange.update({ where: { id: c.id }, data: { stage: 'scheduled', bannerId, version: { increment: 1 }, updatedAt: new Date() } });
    if (s.bannerOn && c.banner && c.appId) {
      const app = await tx.sdBusinessApp.findFirst({ where: { organizationId: org, id: c.appId }, select: { ownerUserId: true } });
      if (app) Object.assign(owner, { to: [app.ownerUserId], change: after, number: t.number });
    }
    await emit(tx, org, 'helpdesk.change.scheduled', { changeId: c.id, ticketId: t.id, deskId: c.deskId });
    return after;
  }

  /** Answer 1937: the service owner hears of a scheduled change to their application. */
  private async tellOwner(org: string, o: { to: string[]; change?: Change; number?: string }) {
    if (!o.to.length || !o.change) return;
    const c = o.change;
    const text = `${o.number} · a planned change to ${c.service}, ${ist(c.windowFrom)} to ${ist(c.windowTo)} India time`;
    await this.notifications
      .notifySystem({ organizationId: org, isSuperAdmin: false }, o.to, 'helpdesk.change.scheduled', { entityType: 'sd_change', entityId: c.id, contextText: text.slice(0, 300), linkPath: `/yx/desk/changes/${c.id}` }, { subject: `Planned change to ${c.service}`.slice(0, 150), html: `<p>${escapeHtml(text)}.</p><p>People see a notice on the help pages from before it starts until it ends. Open it in YukthiX to see the plan and the way back.</p>` })
      .catch((e) => this.logger.warn(`change owner notice: ${(e as Error).message}`));
  }

  /** The change ticket resolves (solved or closed) as desk system work; a desk that asks for a code keeps it for an agent. */
  private async settle(tx: Tx, org: string, t: Ticket, state: 'solved' | 'closed', note: string) {
    if (!OPEN_STATES.includes(t.systemState)) return;
    try {
      const status = await this.tickets.firstStatus(tx, org, t.deskId, t.typeId, state);
      await tx.$executeRaw`SAVEPOINT sd_change_settle`;
      await this.tickets.applyIn(tx, deskRobot({ ctx: { organizationId: org, isSuperAdmin: false } }, t.deskId), t, { statusId: status.id, resolutionNote: note.slice(0, 2000) }, 'Change finished');
      await tx.$executeRaw`RELEASE SAVEPOINT sd_change_settle`;
    } catch (e) {
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT sd_change_settle`.catch(() => undefined);
      this.logger.log(`change ${t.number} left for an agent: ${(e as Error).message}`);
    }
  }

  /** A change that was made: its ticket resolves and the problems it fixes close (answer 1941). */
  private async finished(tx: Tx, a: DeskActor, t: Ticket, outcome: string, note = 'The change was made.') {
    await this.settle(tx, a.ctx.organizationId, t, 'solved', note);
    if (outcome !== 'backed_out') await this.problems.closeByChange(tx, a, t.id);
  }

  /** Answer 1951: the person who raised it, or a lead of the desk, cancels it before it starts, with a reason. */
  async cancel(a: DeskActor, id: string, dto: ChangeCancelDto) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const { c } = await this.load(tx, a, id);
      if (c.createdBy !== a.userId && !isLead(a, c.deskId)) throw new ForbiddenException('The person who raised it, or an IT lead, cancels a change.');
      if (c.version !== dto.version) throw new ConflictException('Someone changed this change. Reload and try again.');
      if (!['approval', 'scheduled'].includes(c.stage)) throw new BadRequestException('Only a change that has not started can be cancelled. Record how it went instead.');
      const reason = dto.reason.trim();
      if (c.approvalRequestId) await this.approvals.withdraw(tx, a.ctx, c.approvalRequestId, a.userId, reason);
      if (c.bannerId) await tx.sdBanner.updateMany({ where: { organizationId: org, id: c.bannerId, endedAt: null }, data: { endedAt: new Date() } });
      const after = await tx.sdChange.update({ where: { id: c.id }, data: { stage: 'cancelled', cancelReason: reason, cancelledBy: a.userId, version: { increment: 1 }, updatedAt: new Date() } });
      const t = await tx.sdTicket.findFirstOrThrow({ where: { organizationId: org, id: c.ticketId } });
      await this.tickets.event(tx, t, 'change_cancelled', c.stage, 'cancelled', { by: a.userId, reason });
      await audit(tx, a, 'desk.change.cancelled', 'sd_change', c.id, { number: t.number, from: c.stage, reason });
      await emit(tx, org, 'helpdesk.change.finished', { ticketId: t.id, deskId: c.deskId, changeId: c.id, outcome: 'cancelled', review: false });
      await this.settle(tx, org, t, 'closed', `Cancelled: ${reason}`);
      return { version: after.version, stage: after.stage };
    });
  }

  /**
   * Answer 1955: a change still in progress after its window ends: the desk's leads are told once (job every 5 minutes;
   * the notice leaves after the claim commits).
   */
  async overrunTick(now = new Date()): Promise<number> {
    const due = await deskSystem(this.tenantPrisma, { organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.sdChange.findMany({ where: { stage: 'in_progress', windowTo: { lt: now }, overrunWarnedAt: null }, select: { id: true, organizationId: true }, take: 200 }),
    );
    let n = 0;
    for (const d of due) {
      const ctx = { organizationId: d.organizationId, isSuperAdmin: false };
      try {
        const out = await deskSystem(this.tenantPrisma, ctx, async (tx) => {
          const claimed = await tx.sdChange.updateMany({ where: { id: d.id, stage: 'in_progress', overrunWarnedAt: null }, data: { overrunWarnedAt: now } });
          if (!claimed.count) return null;
          const c = await tx.sdChange.findUniqueOrThrow({ where: { id: d.id } });
          const t = await tx.sdTicket.findFirstOrThrow({ where: { organizationId: d.organizationId, id: c.ticketId }, select: { number: true, subject: true } });
          const leads = (await tx.sdDeskMember.findMany({ where: { organizationId: d.organizationId, deskId: c.deskId, role: 'lead', ...activeOn(todayIst()) }, select: { userId: true } })).map((m) => m.userId);
          await emit(tx, d.organizationId, 'helpdesk.change.overrun', { ticketId: c.ticketId, deskId: c.deskId, changeId: c.id });
          return { c, t, leads };
        });
        if (!out?.leads.length) continue;
        const text = `${out.t.number} · ${out.t.subject} is still in progress; its window ended ${ist(out.c.windowTo)} India time`;
        await this.notifications
          .notifySystem(ctx, out.leads, 'helpdesk.change.overrun', { entityType: 'sd_change', entityId: out.c.id, contextText: text.slice(0, 300), linkPath: `/yx/desk/changes/${out.c.id}` }, { subject: `Change running past its window: ${out.t.number}`.slice(0, 150), html: `<p>${escapeHtml(text)}.</p><p>Open it to record how it went, or to back it out.</p>` })
          .catch((e) => this.logger.warn(`overrun notice: ${(e as Error).message}`));
        n++;
      } catch (e) {
        this.logger.warn(`change overrun ${d.id}: ${(e as Error).message}`);
      }
    }
    return n;
  }

  /** Answer 1953: the changes someone without an IT desk seat is asked about (change board, application owner, approver). */
  async askedIds(tx: Tx, org: string, userId: string): Promise<string[] | null> {
    const boards = await tx.sdItsmSettings.findMany({ where: { organizationId: org, boardUserIds: { has: userId } }, select: { deskId: true } });
    const apps = await tx.sdBusinessApp.findMany({ where: { organizationId: org, ownerUserId: userId }, select: { id: true } });
    const asked = await tx.wfTask.findMany({ where: { organizationId: org, OR: [{ assigneeUserId: userId }, { onBehalfOfUserId: userId }] }, select: { requestId: true }, take: 2000 });
    const rows = await tx.sdChange.findMany({
      where: { organizationId: org, OR: [{ deskId: { in: boards.map((b) => b.deskId) } }, { appId: { in: apps.map((x) => x.id) } }, { approvalRequestId: { in: asked.map((x) => x.requestId) } }] },
      select: { id: true },
      orderBy: { windowFrom: 'desc' },
      take: 300,
    });
    return boards.length || rows.length ? rows.map((r) => r.id) : null;
  }

  // ------------------------------------------------------------------------------------------ reading

  /** Who may open a change: the desk's agents and leads, its admins, the people asked to approve it, and the service owner. */
  private async load(tx: Tx, a: DeskActor, id: string) {
    const org = a.ctx.organizationId;
    const c = await tx.sdChange.findFirst({ where: { organizationId: org, id } });
    if (!c) throw new NotFoundException('No such change.');
    const desk = isAgentOn(a, c.deskId) || canSetUp(a, c.deskId, 'desk.settings.manage');
    if (!desk) {
      const asked = c.approvalRequestId ? await tx.wfTask.findFirst({ where: { organizationId: org, requestId: c.approvalRequestId, OR: [{ assigneeUserId: a.userId }, { onBehalfOfUserId: a.userId }] }, select: { id: true } }) : null;
      const owner = c.appId ? await tx.sdBusinessApp.findFirst({ where: { organizationId: org, id: c.appId, ownerUserId: a.userId }, select: { id: true } }) : null;
      const board = (await itsmSettingsOf(tx, org, c.deskId)).boardUserIds.includes(a.userId);
      if (!asked && !owner && !board && c.createdBy !== a.userId) throw new NotFoundException('No such change.');
    }
    return { c, onDesk: desk };
  }

  /** The changes of an IT desk, the freeze days of the next two weeks, and what the New change drawer needs. */
  async list(a: DeskActor, deskId?: string) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const its = await tx.sdDesk.findMany({ where: { organizationId: org, kind: 'it', status: 'active' }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
      const mine = its.filter((d) => isAgentOn(a, d.id) || canSetUp(a, d.id, 'desk.settings.manage'));
      const desk = mine.find((d) => d.id === deskId) ?? (deskId ? null : mine[0]);
      if (!desk) {
        if (deskId) throw new NotFoundException('No such desk.');
        // Answer 1953: the change board, application owners and approvers see only the changes they are asked about.
        const ids = await this.askedIds(tx, org, a.userId);
        if (!ids) return { access: false as const };
        const rows = await tx.sdChange.findMany({ where: { organizationId: org, id: { in: ids } }, orderBy: { windowFrom: 'desc' } });
        return { access: true as const, asked: true as const, rows: await this.rows(tx, org, rows), freezes: freezeCalendar(todayIst(), 14, await companyWindow(tx, org)) };
      }
      const s = await itsmSettingsOf(tx, org, desk.id);
      const w = await companyWindow(tx, org);
      const rows = await tx.sdChange.findMany({ where: { organizationId: org, deskId: desk.id }, orderBy: { windowFrom: 'desc' }, take: 300 });
      const view = await this.rows(tx, org, rows);
      return {
        access: true as const,
        desk,
        desks: mine,
        rows: view,
        freezes: freezeCalendar(todayIst(), 14, w),
        window: w,
        canRaise: canWork(a, desk.id),
        questions: s.riskQuestions,
        routes: { low: ROUTE_WORDS[s.routeLow], medium: ROUTE_WORDS[s.routeMedium], high: ROUTE_WORDS[s.routeHigh], emergency: `An IT lead approves now; the change board reviews it within ${s.emergencyReviewDays} working days.` },
        bannerHours: s.bannerOn ? s.bannerHours : null,
        // Answer 2056: whom notices reach on this desk, and the locations to choose from.
        noticeScope: s.noticeScope,
        locations: s.noticeScope === 'location' ? await tx.location.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }) : [],
        templates: (await tx.sdTemplate.findMany({ where: { organizationId: org, deskId: desk.id, active: true, preApproved: true }, orderBy: { name: 'asc' } })).map((x) => ({ id: x.id, name: x.name, checklist: x.checklist })),
        apps: (await tx.sdBusinessApp.findMany({ where: { organizationId: org, status: 'active' }, orderBy: { name: 'asc' }, select: { id: true, name: true } })),
      };
    });
  }

  private async rows(tx: Tx, org: string, rows: Change[]) {
    if (!rows.length) return [];
    const tickets = new Map((await tx.sdTicket.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.ticketId) } }, select: { id: true, number: true, subject: true } })).map((t) => [t.id, t]));
    const users = await this.tickets.userNames(tx, org, rows.map((r) => r.createdBy));
    const caused = await tx.sdTicketLink.groupBy({ by: ['toTicketId'], where: { organizationId: org, kind: 'caused_by', toTicketId: { in: rows.map((r) => r.ticketId) } }, _count: { _all: true } });
    return rows.map((r) => {
      const t = tickets.get(r.ticketId)!;
      const other = ACTIVE_STAGES.includes(r.stage) ? rows.find((o) => o.id !== r.id && ACTIVE_STAGES.includes(o.stage) && (r.appId ? o.appId === r.appId : o.service.toLowerCase() === r.service.toLowerCase()) && overlaps({ from: r.windowFrom, to: r.windowTo }, { from: o.windowFrom, to: o.windowTo })) : null;
      return {
        id: r.id,
        ticketId: r.ticketId,
        number: t.number,
        title: t.subject,
        kind: r.changeKind,
        risk: r.risk,
        state: r.stage,
        service: r.service,
        owner: users.get(r.createdBy) ?? 'Someone',
        from: r.windowFrom,
        to: r.windowTo,
        incidents: caused.find((x) => x.toTicketId === r.ticketId)?._count._all ?? 0,
        clash: other ? `${t.number} and ${tickets.get(other.ticketId)?.number} both touch ${r.service} from ${ist(other.windowFrom > r.windowFrom ? other.windowFrom : r.windowFrom)}.` : null,
      };
    });
  }

  async detail(a: DeskActor, id: string) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const { c, onDesk } = await this.load(tx, a, id);
      const s = await itsmSettingsOf(tx, org, c.deskId);
      const [row] = await this.rows(tx, org, await tx.sdChange.findMany({ where: { organizationId: org, deskId: c.deskId, OR: [{ id: c.id }, { stage: { in: ACTIVE_STAGES } }] } }).then((all) => [c, ...all.filter((x) => x.id !== c.id)]));
      const req = c.approvalRequestId ? await tx.wfRequest.findFirst({ where: { organizationId: org, id: c.approvalRequestId } }) : null;
      const links = await tx.sdTicketLink.findMany({ where: { organizationId: org, OR: [{ fromTicketId: c.ticketId }, { toTicketId: c.ticketId }] } });
      const others = new Map((await tx.sdTicket.findMany({ where: { organizationId: org, id: { in: links.flatMap((l) => [l.fromTicketId, l.toTicketId]).filter((x) => x !== c.ticketId) } }, select: { id: true, number: true, subject: true, kind: true } })).map((t) => [t.id, t]));
      const names = await this.tickets.userNames(tx, org, [c.outcomeBy, c.reviewedBy]);
      const reviewer = this.mayReview(a, c, s);
      return {
        ...row!,
        stage: c.stage,
        version: c.version,
        riskFromAnswers: c.riskFromAnswers,
        riskReason: c.riskReason,
        cancelReason: c.cancelReason,
        riskAnswers: c.riskAnswers,
        questions: s.riskQuestions,
        freezeReason: c.freezeReason,
        plan: c.plan,
        backout: c.backout,
        banner: c.bannerId ? `A known-issue notice for ${c.service} from ${s.bannerHours} hours before until it ends` : c.banner ? 'Shown once it is scheduled' : 'No notice',
        tasks: c.tasks as unknown as Task[],
        approval: req ? await this.approvals.viewIn(tx, org, req) : null,
        outcome: c.outcome ? { outcome: c.outcome, note: c.outcomeNote, by: names.get(c.outcomeBy!) ?? 'Someone', at: c.outcomeAt } : null,
        reviewDue: c.reviewDue,
        review: c.review ? { text: c.review, by: names.get(c.reviewedBy!) ?? 'Someone', at: c.reviewedAt } : null,
        causedIncidents: links.filter((l) => l.kind === 'caused_by' && l.toTicketId === c.ticketId).map((l) => others.get(l.fromTicketId)).filter(Boolean).map((t) => ({ id: t!.id, number: t!.number, subject: t!.subject })),
        linked: links.filter((l) => !(l.kind === 'caused_by' && l.toTicketId === c.ticketId)).map((l) => others.get(l.fromTicketId === c.ticketId ? l.toTicketId : l.fromTicketId)).filter(Boolean).map((t) => ({ id: t!.id, number: t!.number, subject: t!.subject, kind: t!.kind })),
        can: {
          start: onDesk && canWork(a, c.deskId) && c.stage === 'scheduled',
          work: onDesk && canWork(a, c.deskId) && c.stage === 'in_progress',
          review: reviewer && c.stage === 'review',
          cancel: ['approval', 'scheduled'].includes(c.stage) && (c.createdBy === a.userId || isLead(a, c.deskId)),
          export: onDesk,
        },
      };
    });
  }

  // ------------------------------------------------------------------------------------------ doing it

  private async working(tx: Tx, a: DeskActor, id: string, version: number, stage: string) {
    const { c } = await this.load(tx, a, id);
    if (!canWork(a, c.deskId)) throw new ForbiddenException('Only an agent or lead of this IT desk does that.');
    if (c.version !== version) throw new ConflictException('Someone changed this change. Reload and try again.');
    if (c.stage !== stage) throw new BadRequestException(`This change is ${c.stage.replace('_', ' ')}, not ${stage.replace('_', ' ')}.`);
    const t = await tx.sdTicket.findFirstOrThrow({ where: { organizationId: a.ctx.organizationId, id: c.ticketId } });
    return { c, t };
  }

  /** Scheduled to in progress; a normal or standard change only from half an hour before its window (answer 1936). */
  async start(a: DeskActor, id: string, version: number) {
    return this.tx(a, async (tx) => {
      const { c, t } = await this.working(tx, a, id, version, 'scheduled');
      if (c.changeKind !== 'emergency' && Date.now() < c.windowFrom.getTime() - 30 * 60_000) throw new BadRequestException(`The window starts at ${ist(c.windowFrom)} India time. Start then.`);
      const after = await tx.sdChange.update({ where: { id: c.id }, data: { stage: 'in_progress', version: { increment: 1 }, updatedAt: new Date() } });
      await this.tickets.event(tx, t, 'change_started', 'scheduled', 'in_progress', { by: a.userId });
      await audit(tx, a, 'desk.change.started', 'sd_change', c.id, { number: t.number });
      return { version: after.version, stage: after.stage };
    });
  }

  async setTasks(a: DeskActor, id: string, dto: ChangeTasksDto) {
    return this.tx(a, async (tx) => {
      const { c } = await this.working(tx, a, id, dto.version, 'in_progress');
      const tasks = c.tasks as unknown as Task[];
      if (dto.done.length !== tasks.length) throw new BadRequestException('Tick each step of this change.');
      const after = await tx.sdChange.update({ where: { id: c.id }, data: { tasks: tasks.map((x, i) => ({ ...x, done: dto.done[i]! })) as unknown as Prisma.InputJsonValue, version: { increment: 1 }, updatedAt: new Date() } });
      return { version: after.version };
    });
  }

  /** How it went. A failed standard change loses its template's pre-approval (1935); review when high, emergency or failed (1938). */
  async outcome(a: DeskActor, id: string, dto: ChangeOutcomeDto) {
    if (dto.outcome !== 'done' && (dto.note?.trim().length ?? 0) < 10) throw new BadRequestException('Say what went wrong (at least 10 characters).');
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const { c, t } = await this.working(tx, a, id, dto.version, 'in_progress');
      const s = await itsmSettingsOf(tx, org, c.deskId);
      const failed = dto.outcome !== 'done';
      if (failed && c.templateId) {
        const res = await tx.sdTemplate.updateMany({ where: { organizationId: org, id: c.templateId, preApproved: true }, data: { preApproved: false } });
        if (res.count) await audit(tx, a, 'desk.template.pre_approval_lost', 'sd_template', c.templateId, { change: t.number, outcome: dto.outcome });
      }
      const review = failed || c.risk === 'high' || c.changeKind === 'emergency';
      const desk = await tx.sdDesk.findFirstOrThrow({ where: { organizationId: org, id: c.deskId }, select: { calendarId: true } });
      const reviewDue = review ? afterWorkingDays(await this.tickets.sla.calendarSpec(tx, org, desk.calendarId), new Date(), c.changeKind === 'emergency' ? s.emergencyReviewDays : s.reviewDays) : null;
      const stage = review ? 'review' : 'closed';
      const after = await tx.sdChange.update({ where: { id: c.id }, data: { stage, outcome: dto.outcome, outcomeNote: dto.note?.trim() || null, outcomeBy: a.userId, outcomeAt: new Date(), reviewDue, version: { increment: 1 }, updatedAt: new Date() } });
      if (c.bannerId) await tx.sdBanner.updateMany({ where: { organizationId: org, id: c.bannerId, endedAt: null }, data: { endedAt: new Date() } });
      await this.tickets.event(tx, t, 'change_outcome', 'in_progress', stage, { by: a.userId, reason: `${dto.outcome.replace(/_/g, ' ')}${dto.note?.trim() ? `: ${dto.note.trim()}` : ''}`.slice(0, 1000) });
      await audit(tx, a, 'desk.change.outcome', 'sd_change', c.id, { number: t.number, outcome: dto.outcome, review, reviewDue });
      if (!review) await this.finished(tx, a, t, dto.outcome);
      await emit(tx, org, 'helpdesk.change.finished', { ticketId: t.id, deskId: c.deskId, changeId: c.id, outcome: dto.outcome, review });
      return { version: after.version, stage, reviewDue };
    });
  }

  /** Answer 1934/1938: the desk's leads review; an emergency change is reviewed by the change board when the desk has one. */
  private mayReview(a: DeskActor, c: Change, s: ItsmSettings) {
    if (c.createdBy === a.userId) return false;
    if (c.changeKind === 'emergency' && s.boardUserIds.length) return s.boardUserIds.includes(a.userId);
    return a.roles.get(c.deskId) === 'lead' || s.boardUserIds.includes(a.userId);
  }

  async saveReview(a: DeskActor, id: string, dto: ChangeReviewDto) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const { c } = await this.load(tx, a, id);
      const s = await itsmSettingsOf(tx, org, c.deskId);
      if (!this.mayReview(a, c, s)) throw new ForbiddenException(c.createdBy === a.userId ? 'Someone other than the person who raised it reviews a change.' : c.changeKind === 'emergency' && s.boardUserIds.length ? 'The change board reviews an emergency change.' : 'An IT lead of this desk reviews the change.');
      if (c.version !== dto.version) throw new ConflictException('Someone changed this change. Reload and try again.');
      if (c.stage !== 'review') throw new BadRequestException('This change is not waiting for a review.');
      const t = await tx.sdTicket.findFirstOrThrow({ where: { organizationId: org, id: c.ticketId } });
      const stage = c.outcome === 'backed_out' ? 'backed_out' : 'closed';
      const after = await tx.sdChange.update({ where: { id: c.id }, data: { stage, review: dto.review.trim(), reviewedBy: a.userId, reviewedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
      await this.tickets.event(tx, t, 'change_reviewed', 'review', stage, { by: a.userId, reason: dto.review.trim().slice(0, 1000) });
      await audit(tx, a, 'desk.change.reviewed', 'sd_change', c.id, { number: t.number, late: Boolean(c.reviewDue && c.reviewDue < new Date()) });
      if (stage === 'closed') await this.finished(tx, a, t, c.outcome ?? 'done', `Reviewed: ${dto.review.trim()}`);
      else await this.settle(tx, org, t, 'solved', `Reviewed: ${dto.review.trim()}`);
      return { version: after.version, stage };
    });
  }

  // ------------------------------------------------------------------------------------------ the report (ITSM-4)

  /** Changes by kind and how they ended, the failed-change rate, open problems by age and incidents per problem. */
  async report(a: DeskActor, dto: ItsmReportDto) {
    if (!isAgentOn(a, dto.deskId) && !canSetUp(a, dto.deskId, 'desk.settings.manage')) throw new NotFoundException('No such desk.');
    if (dto.to < dto.from) throw new BadRequestException('The period ends before it starts.');
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      await this.itsm.itDesk(tx, a, dto.deskId);
      const changes = await tx.sdChange.findMany({ where: { organizationId: org, deskId: dto.deskId, createdAt: { gte: IST_DAY(dto.from), lt: new Date(IST_DAY(dto.to).getTime() + 86_400_000) } }, select: { changeKind: true, stage: true, outcome: true } });
      const ending = (c: (typeof changes)[number]) => (['rejected', 'cancelled'].includes(c.stage) ? c.stage : (c.outcome ?? 'open'));
      const ENDINGS = ['done', 'done_with_problems', 'backed_out', 'rejected', 'cancelled', 'open'];
      const byKind = (['standard', 'normal', 'emergency'] as const).map((kind) => ({ kind, ...Object.fromEntries(ENDINGS.map((e) => [e, changes.filter((c) => c.changeKind === kind && ending(c) === e).length])) }));
      const finished = changes.filter((c) => c.outcome).length;
      const failed = changes.filter((c) => c.outcome && c.outcome !== 'done').length;
      const problems = await tx.sdProblem.findMany({ where: { organizationId: org, deskId: dto.deskId, state: { not: 'closed' } }, select: { ticketId: true, createdAt: true } });
      const age = (p: { createdAt: Date }) => (Date.now() - p.createdAt.getTime()) / 86_400_000;
      const all = await tx.sdProblem.findMany({ where: { organizationId: org, deskId: dto.deskId }, select: { ticketId: true } });
      const counts = all.length ? await tx.sdTicketLink.groupBy({ by: ['toTicketId'], where: { organizationId: org, kind: 'tracked_by', toTicketId: { in: all.map((p) => p.ticketId) } }, _count: { _all: true } }) : [];
      const tickets = new Map((await tx.sdTicket.findMany({ where: { organizationId: org, id: { in: counts.map((c) => c.toTicketId) } }, select: { id: true, number: true, subject: true } })).map((t) => [t.id, t]));
      const top = counts.map((c) => ({ number: tickets.get(c.toTicketId)?.number ?? '', title: tickets.get(c.toTicketId)?.subject ?? '', incidents: c._count._all })).sort((x, y) => y.incidents - x.incidents).slice(0, 10);
      return {
        changes: { total: changes.length, byKind, finished, failed, failedRate: finished ? Math.round((failed / finished) * 100) : null },
        problems: { open: problems.length, byAge: [{ label: 'Under 7 days', count: problems.filter((p) => age(p) < 7).length }, { label: '7 to 30 days', count: problems.filter((p) => age(p) >= 7 && age(p) < 30).length }, { label: '30 to 90 days', count: problems.filter((p) => age(p) >= 30 && age(p) < 90).length }, { label: 'Over 90 days', count: problems.filter((p) => age(p) >= 90).length }], incidentsPerProblem: all.length ? Math.round((counts.reduce((t, c) => t + c._count._all, 0) / all.length) * 10) / 10 : null, top },
      };
    });
  }

  // ------------------------------------------------------------------------------------------ the audit export (answer 1943)

  async export(a: DeskActor, dto: ChangeExportDto): Promise<{ filename: string; type: string; body: Buffer | string }> {
    if (!isAgentOn(a, dto.deskId) && !canSetUp(a, dto.deskId, 'desk.settings.manage')) throw new NotFoundException('No such desk.');
    if (dto.to < dto.from) throw new BadRequestException('The period ends before it starts.');
    if ((IST_DAY(dto.to).getTime() - IST_DAY(dto.from).getTime()) / 86_400_000 > 366) throw new BadRequestException('Export at most a year at a time.');
    const rows = await this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      await this.itsm.itDesk(tx, a, dto.deskId);
      const changes = await tx.sdChange.findMany({ where: { organizationId: org, deskId: dto.deskId, createdAt: { gte: IST_DAY(dto.from), lt: new Date(IST_DAY(dto.to).getTime() + 86_400_000) } }, orderBy: { createdAt: 'asc' }, take: 5000 });
      const tickets = new Map((await tx.sdTicket.findMany({ where: { organizationId: org, id: { in: changes.map((c) => c.ticketId) } }, select: { id: true, number: true, subject: true } })).map((t) => [t.id, t]));
      const reqs = await tx.wfRequest.findMany({ where: { organizationId: org, id: { in: changes.map((c) => c.approvalRequestId).filter((x): x is string => Boolean(x)) } } });
      const actions = await tx.wfAction.findMany({ where: { organizationId: org, requestId: { in: reqs.map((r) => r.id) }, action: { in: ['approved', 'rejected', 'self_approved', 'auto_rejected', 'auto_approved'] } }, orderBy: { createdAt: 'asc' } });
      const names = await this.tickets.userNames(tx, org, [...changes.flatMap((c) => [c.createdBy, c.outcomeBy, c.reviewedBy]), ...actions.map((x) => x.actorUserId)]);
      await audit(tx, a, 'desk.change.exported', 'sd_desk', dto.deskId, { from: dto.from, to: dto.to, format: dto.format, changes: changes.length });
      return changes.map((c) => {
        const t = tickets.get(c.ticketId)!;
        const decisions = actions.filter((x) => x.requestId === c.approvalRequestId).map((x) => `${x.action.replace(/_/g, ' ')} by ${x.actorUserId ? (names.get(x.actorUserId) ?? 'someone') : 'the system'} ${ist(x.createdAt)}${x.reason ? ` (${x.reason})` : ''}`);
        return [
          t.number, t.subject, c.changeKind, c.risk, c.riskFromAnswers ?? '', c.riskReason ?? '', c.service,
          names.get(c.createdBy) ?? '', ist(c.createdAt), ist(c.windowFrom), ist(c.windowTo), c.freezeReason ?? '',
          c.changeKind === 'standard' ? 'pre-approved template' : decisions.join('; '), c.stage, c.outcome ?? '', c.outcomeNote ?? c.cancelReason ?? '',
          c.reviewDue ? ist(c.reviewDue) : '', c.review ?? '', c.reviewedBy ? (names.get(c.reviewedBy) ?? '') : '', c.reviewedAt ? ist(c.reviewedAt) : '',
        ];
      });
    });
    const header = ['Change', 'What changes', 'Kind', 'Risk', 'Risk from answers', 'Why lower', 'Service', 'Raised by', 'Raised at', 'Window from', 'Window to', 'Freeze reason', 'Approval', 'Status', 'Outcome', 'Outcome note', 'Review due', 'Review', 'Reviewed by', 'Reviewed at'];
    const name = `changes-${dto.from}-to-${dto.to}`;
    if (dto.format === 'csv') return { filename: `${name}.csv`, type: 'text/csv; charset=utf-8', body: toCsv(header, rows) };
    return { filename: `${name}.pdf`, type: 'application/pdf', body: await changesPdf(`IT changes ${dto.from} to ${dto.to}`, header, rows) };
  }
}

/** One block per change: every column as "label: value" (times are India time). */
export function changesPdf(title: string, header: string[], rows: string[][]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: title } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(14);
    writeText(doc, title);
    doc.fontSize(9).moveDown();
    if (!rows.length) writeText(doc, 'No changes in this period.');
    for (const r of rows) {
      header.forEach((h, i) => r[i] && writeText(doc, `${h}: ${r[i]}`));
      doc.moveDown();
    }
    doc.end();
  });
}
