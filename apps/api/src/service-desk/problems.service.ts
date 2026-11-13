import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { Tx } from '../org-structure/org-structure.service';
import { DeskActor, audit, canSetUp, canWork, emit, isAgentOn, isLead } from './desk-access';
import { KnownErrorDto, ProblemCloseDto, ProblemDto, ProblemFixDto, ProblemLinkDto, ProblemUpdateDto } from './dto-itsm';
import { ItsmService, itsmSettingsOf, noticeTarget } from './itsm.service';
import { KbService } from './kb.service';
import { RequesterService } from './requester.service';
import { textToHtml } from './rich-text';
import { OPEN_STATES, Ticket, TicketsService } from './tickets.service';

type Problem = Prisma.SdProblemGetPayload<object>;
const OPEN_PROBLEM = ['open', 'investigating', 'known_error', 'fixed'];
const DEFAULT_REPLY = (number: string) => `Good news: the cause of the problem you reported is fixed (${number}). Reply here if you still see it.`;

/**
 * Helpdesk ITSM-3 (docs/yukthix/helpdesk-itsm-plan.md; answers 1939-1941): problems on IT desks. A problem is a problem
 * ticket that tracks its incidents ("tracked by", from a ticket or in bulk here); it records the root cause, becomes a
 * known error with a workaround (a draft article for agents and a known-issue notice), is fixed by a change ("fixes"),
 * and closes when that change is done: every open linked incident gets one reply and is solved, as a tracker's are.
 * A lead is told when the same category gets the desk's repeat count of incidents in its days (a suggestion only).
 */
@Injectable()
export class ProblemsService {
  private readonly logger = new Logger(ProblemsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tickets: TicketsService,
    private readonly requesters: RequesterService,
    private readonly itsm: ItsmService,
    private readonly kb: KbService,
  ) {}

  private tx<T>(a: DeskActor, fn: (tx: Tx) => Promise<T>) {
    return this.tenantPrisma.forTenant(a.ctx, fn);
  }

  /** Only the desk's agents and leads see and work problems (its admins read them); 404 for anyone else. */
  private async load(tx: Tx, a: DeskActor, id: string, work = false) {
    const p = await tx.sdProblem.findFirst({ where: { organizationId: a.ctx.organizationId, id } });
    if (!p || !(isAgentOn(a, p.deskId) || canSetUp(a, p.deskId, 'desk.settings.manage'))) throw new NotFoundException('No such problem.');
    if (work && !canWork(a, p.deskId)) throw new ForbiddenException('Only an agent or lead of this IT desk does that.');
    const t = await tx.sdTicket.findFirstOrThrow({ where: { organizationId: a.ctx.organizationId, id: p.ticketId } });
    return { p, t };
  }

  private version(p: Problem, version: number) {
    if (p.version !== version) throw new ConflictException('Someone changed this problem. Reload and try again.');
  }

  private bump(tx: Tx, p: Problem, data: Prisma.SdProblemUncheckedUpdateInput) {
    return tx.sdProblem.update({ where: { id: p.id }, data: { ...data, version: { increment: 1 }, updatedAt: new Date() } });
  }

  // ------------------------------------------------------------------------------------------ raising and linking

  async create(a: DeskActor, dto: ProblemDto) {
    if (!canWork(a, dto.deskId)) throw new ForbiddenException('Only an agent or lead of this IT desk raises a problem.');
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const desk = await this.itsm.itDesk(tx, a, dto.deskId);
      if (dto.categoryId && !(await tx.sdCategory.findFirst({ where: { organizationId: org, deskId: desk.id, id: dto.categoryId }, select: { id: true } }))) throw new BadRequestException('Choose a category of this desk.');
      if (dto.appId && !(await tx.sdBusinessApp.findFirst({ where: { organizationId: org, id: dto.appId }, select: { id: true } }))) throw new BadRequestException('Choose an application of this company.');
      const type = await tx.sdTicketType.findFirst({ where: { organizationId: org, deskId: desk.id, kind: 'problem', active: true }, orderBy: { sortOrder: 'asc' } });
      if (!type) throw new BadRequestException('This desk has no problem type in use. Ask the desk admin to turn it on.');
      const personId = (await this.requesters.personOf(tx, { ctx: a.ctx, userId: a.userId, acting: false, user: { role: '' } }, true))!;
      let t = await this.tickets.createIn(tx, a, { deskId: desk.id, typeId: type.id, itsm: true, ...(dto.categoryId ? { categoryId: dto.categoryId } : {}), subject: dto.title.trim(), bodyHtml: textToHtml(dto.description?.trim() || dto.title.trim()), requesterPersonId: personId, openedByUserId: a.userId, channel: 'agent', side: 'agent' });
      // A problem tracks its incidents (US-G-220): solving it answers and solves them.
      t = await tx.sdTicket.update({ where: { id: t.id }, data: { tracker: true } });
      const p = await tx.sdProblem.create({ data: { organizationId: org, deskId: desk.id, ticketId: t.id, categoryId: dto.categoryId ?? null, appId: dto.appId ?? null, createdBy: a.userId } });
      const linked = dto.incidentIds?.length ? await this.linkIn(tx, a, p, t, dto.incidentIds) : 0;
      await audit(tx, a, 'desk.problem.raised', 'sd_problem', p.id, { ticketId: t.id, number: t.number, incidents: linked, categoryId: dto.categoryId ?? null });
      return { id: p.id, number: t.number, linked };
    });
  }

  /** Incidents of the problem's desk, each once; never a change, a problem, a merged or a closed one. */
  private async linkIn(tx: Tx, a: DeskActor, p: Problem, t: Ticket, ids: string[]) {
    const org = a.ctx.organizationId;
    const rows = await tx.sdTicket.findMany({ where: { organizationId: org, id: { in: [...new Set(ids)] } } });
    if (rows.length !== new Set(ids).size) throw new BadRequestException('Link incidents of this company only.');
    const bad = rows.find((r) => r.deskId !== p.deskId || r.kind !== 'incident' || r.mergedIntoId);
    if (bad) throw new BadRequestException(`${bad.number} is not an incident of this desk.`);
    let n = 0;
    for (const r of rows) {
      const made = await tx.sdTicketLink.createMany({ data: [{ organizationId: org, fromTicketId: r.id, toTicketId: t.id, kind: 'tracked_by', createdBy: a.userId }], skipDuplicates: true });
      if (!made.count) continue;
      n++;
      await this.tickets.event(tx, r, 'linked', null, t.number, { by: a.userId, reason: 'Tracked by' });
      await emit(tx, org, 'helpdesk.problem.linked', { ticketId: t.id, deskId: p.deskId, incidentId: r.id });
    }
    if (n) await this.tickets.event(tx, t, 'linked', null, `${n} incident${n > 1 ? 's' : ''}`, { by: a.userId, reason: 'Tracks' });
    return n;
  }

  async link(a: DeskActor, id: string, dto: ProblemLinkDto) {
    return this.tx(a, async (tx) => {
      const { p, t } = await this.load(tx, a, id, true);
      if (p.state === 'closed') throw new BadRequestException('This problem is closed.');
      const numbers = [...new Set(dto.numbers.map((x) => x.trim().toUpperCase()).filter(Boolean))];
      if (!numbers.length) throw new BadRequestException('Give the incident numbers, for example IT-1031.');
      const rows = await tx.sdTicket.findMany({ where: { organizationId: a.ctx.organizationId, deskId: p.deskId, number: { in: numbers } }, select: { id: true, number: true } });
      const missing = numbers.filter((x) => !rows.some((r) => r.number.toUpperCase() === x));
      if (missing.length) throw new BadRequestException(`Not found on this desk: ${missing.join(', ')}.`);
      const linked = await this.linkIn(tx, a, p, t, rows.map((r) => r.id));
      await audit(tx, a, 'desk.problem.linked', 'sd_problem', p.id, { numbers, linked });
      return { linked };
    });
  }

  // ------------------------------------------------------------------------------------------ investigating

  async update(a: DeskActor, id: string, dto: ProblemUpdateDto) {
    return this.tx(a, async (tx) => {
      const { p } = await this.load(tx, a, id, true);
      this.version(p, dto.version);
      if (p.state === 'closed') throw new BadRequestException('This problem is closed.');
      const data: Prisma.SdProblemUncheckedUpdateInput = {};
      if (dto.rootCause !== undefined) data.rootCause = dto.rootCause.trim() || null;
      if (dto.closingReply !== undefined) data.closingReply = dto.closingReply.trim() || null;
      if (dto.state === 'investigating' && p.state === 'open') data.state = 'investigating';
      if (!Object.keys(data).length) throw new BadRequestException('Nothing to change.');
      const after = await this.bump(tx, p, data);
      await audit(tx, a, 'desk.problem.updated', 'sd_problem', p.id, { fields: Object.keys(data) });
      return { version: after.version, state: after.state };
    });
  }

  /** Answer 1940: the workaround; a draft article in the desk's agents' space unless a lead chooses another; a notice. */
  async knownError(a: DeskActor, id: string, dto: KnownErrorDto) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const { p, t } = await this.load(tx, a, id, true);
      this.version(p, dto.version);
      if (p.state === 'closed') throw new BadRequestException('This problem is closed.');
      const workaround = dto.workaround.trim();
      let articleId = p.kbArticleId;
      if (dto.article && !articleId) {
        const space = dto.spaceId
          ? await tx.sdKbSpace.findFirst({ where: { organizationId: org, id: dto.spaceId, status: 'active', OR: [{ deskId: p.deskId }, { deskId: null }] } })
          : await tx.sdKbSpace.findFirst({ where: { organizationId: org, status: 'active', audience: 'agents', OR: [{ deskId: p.deskId }, { deskId: null }] }, orderBy: { deskId: { sort: 'asc', nulls: 'last' } } });
        if (!space) throw new BadRequestException(dto.spaceId ? 'Choose a knowledge space of this desk.' : 'This desk has no space for agents. Add one in the knowledge base, or choose a space.');
        if (space.audience !== 'agents' && !isLead(a, p.deskId)) throw new ForbiddenException('Only an IT lead puts a known error where employees can read it.');
        articleId = (await this.kb.draftIn(tx, a, { spaceId: space.id, title: `Known error: ${t.subject}`.slice(0, 200), summary: 'What to do until it is fixed.', bodyHtml: `<h3>What happens</h3>${textToHtml(t.subject)}<h3>What to do until it is fixed</h3>${textToHtml(workaround)}`, note: `Made from problem ${t.number}` }, t.id)).id;
      }
      let bannerId = p.bannerId;
      if (dto.banner && !bannerId) {
        // Answer 2051: "Me too" raises the person's own incident, already linked to the problem (they never follow the
        // problem itself). Answer 2056: limited to a location or an application's users as the desk asks.
        const target = await noticeTarget(tx, org, await itsmSettingsOf(tx, org, p.deskId), { locationId: dto.noticeLocationId ?? null, appId: dto.noticeAppId ?? p.appId });
        bannerId = (await tx.sdBanner.create({ data: { organizationId: org, deskId: p.deskId, audience: 'employees', text: `Known issue: ${t.subject}. Until it is fixed: ${workaround}`.slice(0, 300), severity: 'warning', ticketId: t.id, locationId: target.locationId, appId: target.appId, createdBy: a.userId } })).id;
        await emit(tx, org, 'helpdesk.banner.published', { bannerId, deskId: p.deskId });
      }
      const after = await this.bump(tx, p, { state: p.state === 'fixed' ? 'fixed' : 'known_error', workaround, kbArticleId: articleId, bannerId });
      await this.tickets.event(tx, t, 'problem_known_error', p.state, after.state, { by: a.userId, reason: workaround.slice(0, 1000) });
      await emit(tx, org, 'helpdesk.problem.known_error', { ticketId: t.id, deskId: p.deskId });
      await audit(tx, a, 'desk.problem.known_error', 'sd_problem', p.id, { article: Boolean(articleId), banner: Boolean(bannerId) });
      return { version: after.version, state: after.state, articleId, bannerId };
    });
  }

  /** The change that fixes it (a "fixes" link from the change). Closing that change closes the problem (1941). */
  async fix(a: DeskActor, id: string, dto: ProblemFixDto) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const { p, t } = await this.load(tx, a, id, true);
      if (p.state === 'closed') throw new BadRequestException('This problem is closed.');
      const c = await tx.sdChange.findFirst({ where: { organizationId: org, id: dto.changeId, deskId: p.deskId } });
      if (!c) throw new BadRequestException('Choose a change of this desk.');
      if (['rejected', 'cancelled', 'backed_out'].includes(c.stage)) throw new BadRequestException('That change will not happen. Choose or raise another.');
      const made = await tx.sdTicketLink.createMany({ data: [{ organizationId: org, fromTicketId: c.ticketId, toTicketId: t.id, kind: 'fixes', createdBy: a.userId }], skipDuplicates: true });
      if (!made.count) throw new ConflictException('That change already fixes this problem.');
      const ct = await tx.sdTicket.findFirstOrThrow({ where: { organizationId: org, id: c.ticketId } });
      await this.tickets.event(tx, t, 'linked', null, ct.number, { by: a.userId, reason: 'Fixed by' });
      await this.tickets.event(tx, ct, 'linked', null, t.number, { by: a.userId, reason: 'Fixes' });
      await audit(tx, a, 'desk.problem.fix_linked', 'sd_problem', p.id, { changeId: c.id });
      // A change already finished fixes it at once.
      if (c.stage === 'closed') await this.closeIn(tx, a, p, t, null);
      return { linked: true };
    });
  }

  /** A lead closes a problem without a change (the cause went away, or it was a duplicate). */
  async close(a: DeskActor, id: string, dto: ProblemCloseDto) {
    return this.tx(a, async (tx) => {
      const { p, t } = await this.load(tx, a, id, true);
      if (!isLead(a, p.deskId)) throw new ForbiddenException('An IT lead closes a problem.');
      this.version(p, dto.version);
      if (p.state === 'closed') throw new BadRequestException('This problem is already closed.');
      return this.closeIn(tx, a, p, t, dto.reply?.trim() || null);
    });
  }

  /** Answer 1941: the problem closes; every open linked incident gets one reply and is solved (the tracker's way). */
  private async closeIn(tx: Tx, a: DeskActor, p: Problem, t: Ticket, reply: string | null) {
    const org = a.ctx.organizationId;
    const text = reply ?? p.closingReply ?? DEFAULT_REPLY(t.number);
    let solved = false;
    if (OPEN_STATES.includes(t.systemState)) {
      try {
        const status = await this.tickets.firstStatus(tx, org, t.deskId, t.typeId, 'solved');
        await tx.$executeRaw`SAVEPOINT sd_problem_close`;
        await this.tickets.applyIn(tx, a, t, { statusId: status.id, resolutionNote: `Problem closed${p.rootCause ? `: ${p.rootCause}` : '.'}`.slice(0, 2000), linkedReplyHtml: textToHtml(text) }, 'Problem closed');
        await tx.$executeRaw`RELEASE SAVEPOINT sd_problem_close`;
        solved = true;
      } catch (e) {
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT sd_problem_close`.catch(() => undefined);
        // A desk that asks for a resolution code keeps it fixed, for an agent to close with the code.
        this.logger.log(`problem ${t.number} left for an agent: ${(e as Error).message}`);
      }
    }
    const after = await this.bump(tx, p, { state: solved ? 'closed' : 'fixed', closedAt: solved ? new Date() : null });
    if (p.bannerId) await tx.sdBanner.updateMany({ where: { organizationId: org, id: p.bannerId, endedAt: null }, data: { endedAt: new Date() } });
    await audit(tx, a, solved ? 'desk.problem.closed' : 'desk.problem.fixed', 'sd_problem', p.id, { number: t.number });
    return { version: after.version, state: after.state };
  }

  /** ITSM-2 to 3: a change finished (closed, not backed out): the problems it fixes close. */
  async closeByChange(tx: Tx, a: DeskActor, changeTicketId: string) {
    const org = a.ctx.organizationId;
    const links = await tx.sdTicketLink.findMany({ where: { organizationId: org, fromTicketId: changeTicketId, kind: 'fixes' } });
    for (const l of links) {
      const p = await tx.sdProblem.findFirst({ where: { organizationId: org, ticketId: l.toTicketId, state: { in: OPEN_PROBLEM } } });
      if (!p) continue;
      await this.closeIn(tx, a, p, await tx.sdTicket.findFirstOrThrow({ where: { organizationId: org, id: p.ticketId } }), null);
    }
  }

  // ------------------------------------------------------------------------------------------ reading

  async list(a: DeskActor, deskId?: string) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const its = await tx.sdDesk.findMany({ where: { organizationId: org, kind: 'it', status: 'active' }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
      const mine = its.filter((d) => isAgentOn(a, d.id) || canSetUp(a, d.id, 'desk.settings.manage'));
      const desk = mine.find((d) => d.id === deskId) ?? (deskId ? null : mine[0]);
      if (!desk) {
        if (deskId) throw new NotFoundException('No such desk.');
        return { access: false as const };
      }
      const rows = await tx.sdProblem.findMany({ where: { organizationId: org, deskId: desk.id }, orderBy: { createdAt: 'desc' }, take: 300 });
      return { access: true as const, desk, desks: mine, rows: await this.rows(tx, org, rows), canRaise: canWork(a, desk.id), suggestions: isLead(a, desk.id) || canSetUp(a, desk.id, 'desk.settings.manage') ? await this.suggestions(tx, org, desk.id) : [] };
    });
  }

  private async rows(tx: Tx, org: string, rows: Problem[]) {
    const tickets = new Map((await tx.sdTicket.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.ticketId) } }, select: { id: true, number: true, subject: true } })).map((t) => [t.id, t]));
    const users = await this.tickets.userNames(tx, org, rows.map((r) => r.createdBy));
    const counts = await tx.sdTicketLink.groupBy({ by: ['toTicketId'], where: { organizationId: org, kind: 'tracked_by', toTicketId: { in: rows.map((r) => r.ticketId) } }, _count: { _all: true } });
    return rows.map((r) => ({
      id: r.id,
      ticketId: r.ticketId,
      number: tickets.get(r.ticketId)!.number,
      title: tickets.get(r.ticketId)!.subject,
      state: r.state,
      incidents: counts.find((c) => c.toTicketId === r.ticketId)?._count._all ?? 0,
      owner: users.get(r.createdBy) ?? 'Someone',
      openedOn: r.createdAt,
      cause: r.rootCause,
    }));
  }

  /**
   * Answers 1939 and 2057: a category, or an application, with the desk's repeat count of incidents in its days, none of
   * them on a problem yet and no open problem about it already.
   */
  async suggestions(tx: Tx, org: string, deskId: string) {
    const s = await itsmSettingsOf(tx, org, deskId);
    const since = new Date(Date.now() - s.repeatDays * 86_400_000);
    const recent = await tx.sdTicket.findMany({ where: { organizationId: org, deskId, kind: 'incident', mergedIntoId: null, OR: [{ categoryId: { not: null } }, { appId: { not: null } }], createdAt: { gte: since } }, select: { id: true, categoryId: true, appId: true } });
    const tracked = new Set((await tx.sdTicketLink.findMany({ where: { organizationId: org, kind: 'tracked_by', fromTicketId: { in: recent.map((r) => r.id) } }, select: { fromTicketId: true } })).map((l) => l.fromTicketId));
    const open = await tx.sdProblem.findMany({ where: { organizationId: org, deskId, state: { in: OPEN_PROBLEM } }, select: { categoryId: true, appId: true } });
    const out: { kind: 'category' | 'application'; categoryId: string | null; appId: string | null; category: string; count: number; days: number; incidentIds: string[] }[] = [];
    for (const kind of ['category', 'application'] as const) {
      const key = (r: { categoryId: string | null; appId: string | null }) => (kind === 'category' ? r.categoryId : r.appId);
      const covered = new Set(open.map(key).filter(Boolean));
      const by = new Map<string, string[]>();
      for (const r of recent) {
        const k = key(r);
        if (k && !tracked.has(r.id) && !covered.has(k)) by.set(k, [...(by.get(k) ?? []), r.id]);
      }
      const hits = [...by].filter(([, ids]) => ids.length >= s.repeatCount);
      const names = new Map(
        kind === 'category'
          ? (await tx.sdCategory.findMany({ where: { organizationId: org, id: { in: hits.map(([c]) => c) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name])
          : (await tx.sdBusinessApp.findMany({ where: { organizationId: org, id: { in: hits.map(([c]) => c) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]),
      );
      for (const [id, ids] of hits) out.push({ kind, categoryId: kind === 'category' ? id : null, appId: kind === 'application' ? id : null, category: names.get(id) ?? (kind === 'category' ? 'A category' : 'An application'), count: ids.length, days: s.repeatDays, incidentIds: ids });
    }
    return out;
  }

  async detail(a: DeskActor, id: string) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const { p, t } = await this.load(tx, a, id);
      const [row] = await this.rows(tx, org, [p]);
      const links = await tx.sdTicketLink.findMany({ where: { organizationId: org, toTicketId: t.id, kind: { in: ['tracked_by', 'fixes'] } } });
      const others = await tx.sdTicket.findMany({ where: { organizationId: org, id: { in: links.map((l) => l.fromTicketId) } }, select: { id: true, number: true, subject: true, systemState: true, createdAt: true } });
      const fixing = await tx.sdChange.findMany({ where: { organizationId: org, ticketId: { in: links.filter((l) => l.kind === 'fixes').map((l) => l.fromTicketId) } } });
      const article = p.kbArticleId ? await tx.sdKbArticle.findFirst({ where: { organizationId: org, id: p.kbArticleId }, select: { id: true, number: true, state: true } }) : null;
      const spaces = await tx.sdKbSpace.findMany({ where: { organizationId: org, status: 'active', OR: [{ deskId: p.deskId }, { deskId: null }] }, select: { id: true, name: true, audience: true }, orderBy: { name: 'asc' } });
      const openChanges = await tx.sdChange.findMany({ where: { organizationId: org, deskId: p.deskId, stage: { in: ['approval', 'scheduled', 'in_progress', 'review', 'closed'] } }, orderBy: { createdAt: 'desc' }, take: 50 });
      const changeTickets = new Map((await tx.sdTicket.findMany({ where: { organizationId: org, id: { in: [...openChanges, ...fixing].map((c) => c.ticketId) } }, select: { id: true, number: true, subject: true } })).map((x) => [x.id, x]));
      return {
        ...row!,
        version: p.version,
        categoryId: p.categoryId,
        workaround: p.workaround,
        closingReply: p.closingReply ?? DEFAULT_REPLY(t.number),
        incidents: links.filter((l) => l.kind === 'tracked_by').map((l) => others.find((o) => o.id === l.fromTicketId)).filter(Boolean).map((o) => ({ id: o!.id, number: o!.number, subject: o!.subject, state: o!.systemState, raisedOn: o!.createdAt })),
        fixes: fixing.map((c) => ({ id: c.id, number: changeTickets.get(c.ticketId)?.number ?? '', title: changeTickets.get(c.ticketId)?.subject ?? '', state: c.stage })),
        changes: openChanges.filter((c) => !fixing.some((f) => f.id === c.id)).map((c) => ({ id: c.id, number: changeTickets.get(c.ticketId)?.number ?? '', title: changeTickets.get(c.ticketId)?.subject ?? '' })),
        article: article ? { id: article.id, number: article.number, state: article.state } : null,
        banner: Boolean(p.bannerId),
        spaces: spaces.map((s) => ({ id: s.id, name: s.name, audience: s.audience })),
        can: { work: canWork(a, p.deskId) && p.state !== 'closed', close: isLead(a, p.deskId) && p.state !== 'closed', publicArticle: isLead(a, p.deskId) },
        appId: p.appId,
        // Answer 2056: what the known-error notice asks for on this desk.
        noticeScope: (await itsmSettingsOf(tx, org, p.deskId)).noticeScope,
        locations: (await itsmSettingsOf(tx, org, p.deskId)).noticeScope === 'location' ? await tx.location.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }) : [],
        apps: await tx.sdBusinessApp.findMany({ where: { organizationId: org, status: 'active' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      };
    });
  }
}
