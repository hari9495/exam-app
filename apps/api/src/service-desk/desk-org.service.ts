import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { buildViewer, covers, grantPeriods, implicitPeriods } from '../access/scope';
import { displayName } from '../employee-history/employee-history.service';
import { Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { DeskActor, SEAT_REQUIRED, audit, deskSystem, emit, has, isAgentOn, requireDesk, requireSetUp } from './desk-access';
import { textToHtml } from './rich-text';
import { CreateInput, OPEN_STATES, Ticket, TicketsService } from './tickets.service';

// SD-2.10 (US-G-046, US-G-047, US-G-048, US-G-050): the HR summary beside a ticket (P02-scoped), moving a ticket to
// another desk (the new desk's privacy, category and SLA apply; only allowed desk pairs; a sensitive ticket only into a
// sensitive category, YX-HD-03), sharing with another desk (view or comment; sensitive and private tickets are never
// shared), cloning a desk's set-up, and branches (a site's own team, hours and admin). Delegated desk admin is the
// existing admin seat: a desk admin sets up only the desks where they hold that seat (canSetUp).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/gi;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

export interface HrFacts {
  source: 'hr' | 'people_list' | 'none';
  name: string;
  /** Public fields (P02 Q4): anyone in the company may see them in the directory. */
  designation: string | null;
  department: string | null;
  location: string | null;
  manager: string | null;
  workEmail: string | null;
  /** Internal fields, only when the viewer's HR access (or their own team) reaches this person today. */
  internal: { employeeCode: string; joinedOn: string; tenure: string; grade: string | null; employmentType: string | null } | null;
}

const tenure = (from: string, today: string) => {
  const [y1, m1] = from.split('-').map(Number);
  const [y2, m2] = today.split('-').map(Number);
  const months = Math.max(0, (y2 - y1) * 12 + (m2 - m1));
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y} year${y > 1 ? 's' : ''}` : '', m || !y ? `${m} month${m === 1 ? '' : 's'}` : ''].filter(Boolean).join(' ');
};

@Injectable()
export class DeskOrgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tickets: TicketsService,
  ) {}

  private tx<T>(a: DeskActor, fn: (tx: Tx) => Promise<T>) {
    return this.tenantPrisma.forTenant(a.ctx, fn);
  }

  // ------------------------------------------------------------------------------------------ HR summary (US-G-048)

  /** The person's HR facts as this viewer may see them (P02: Public for all; Internal only within their HR reach). */
  async hrFacts(tx: Tx, a: DeskActor, personId: string): Promise<HrFacts> {
    const org = a.ctx.organizationId;
    const today = todayIst();
    const person = await tx.person.findFirst({ where: { organizationId: org, id: personId }, select: { givenName: true, familyName: true, primaryEmail: true } });
    const name = person ? [person.givenName, person.familyName].filter(Boolean).join(' ') : '';
    const emp = await tx.employee.findFirst({ where: { organizationId: org, personId } });
    const job = emp ? await tx.employment.findFirst({ where: { organizationId: org, employeeId: emp.id, joinedOn: { lte: day(today) }, OR: [{ exitedOn: null }, { exitedOn: { gte: day(today) } }] } }) : null;
    const asg = job
      ? await tx.employeeAssignment.findFirst({ where: { organizationId: org, employmentId: job.id, supersededAt: null, validFrom: { lte: day(today) }, OR: [{ validTo: null }, { validTo: { gte: day(today) } }] }, orderBy: { validFrom: 'desc' } })
      : null;
    if (!emp || !job || !asg) {
      // US-G-048: a standalone desk shows the light people list only.
      const light = await tx.sdPeople.findFirst({ where: { organizationId: org, personId } });
      const loc = light?.locationId ? await tx.location.findFirst({ where: { organizationId: org, id: light.locationId }, select: { name: true } }) : null;
      return { source: light ? 'people_list' : 'none', name, designation: null, department: light?.team ?? null, location: loc?.name ?? null, manager: null, workEmail: person?.primaryEmail ?? null, internal: null };
    }
    const [desig, dept, loc, mgr, grade, etype] = await Promise.all([
      tx.designation.findFirst({ where: { organizationId: org, id: asg.designationId }, select: { name: true } }),
      tx.department.findFirst({ where: { organizationId: org, id: asg.departmentId }, select: { name: true } }),
      tx.location.findFirst({ where: { organizationId: org, id: asg.locationId }, select: { name: true } }),
      asg.managerEmployeeId ? tx.employee.findFirst({ where: { organizationId: org, id: asg.managerEmployeeId } }) : null,
      asg.gradeId ? tx.grade.findFirst({ where: { organizationId: org, id: asg.gradeId }, select: { name: true } }) : null,
      tx.employmentType.findFirst({ where: { organizationId: org, id: asg.employmentTypeId }, select: { name: true } }),
    ]);
    let reach = false;
    if (a.user) {
      const viewer = await buildViewer(this.prisma, this.tenantPrisma, a.user, ['employee.profile.view']);
      const own = (await tx.employee.findFirst({ where: { organizationId: org, userId: a.userId }, select: { id: true } }))?.id ?? null;
      reach = covers(await grantPeriods(tx, a.ctx, viewer, 'employee.profile.view', emp.id, own), today) || covers(await implicitPeriods(tx, a.ctx, own, emp.id), today);
    }
    const joinedOn = job.joinedOn.toISOString().slice(0, 10);
    return {
      source: 'hr',
      name: displayName(emp),
      designation: desig?.name ?? null,
      department: dept?.name ?? null,
      location: loc?.name ?? null,
      manager: mgr ? displayName(mgr) : null,
      workEmail: emp.workEmail,
      internal: reach ? { employeeCode: job.employeeCode, joinedOn, tenure: tenure(joinedOn, today), grade: grade?.name ?? null, employmentType: etype?.name ?? null } : null,
    };
  }

  /** GET /tickets/{id}/hr-summary (desk.hr_summary.view): the person the ticket is for. Never pay. Every view audited. */
  async hrSummary(a: DeskActor, ticketId: string) {
    if (!has(a, 'desk.hr_summary.view')) throw new ForbiddenException('You need the HR summary right (desk.hr_summary.view).');
    return this.tx(a, async (tx) => {
      const { t } = await this.tickets.load(tx, a, ticketId);
      const personId = t.requestedForPersonId ?? t.requesterPersonId;
      const facts = await this.hrFacts(tx, a, personId);
      await audit(tx, a, 'desk.hr_summary.viewed', 'sd_ticket', t.id, { personId, internal: Boolean(facts.internal) });
      return facts;
    });
  }

  // ------------------------------------------------------------------------------------------ move (US-G-046, US-G-047)

  private async working(tx: Tx, a: DeskActor, id: string): Promise<Ticket> {
    if (!has(a, 'desk.ticket.move')) throw new ForbiddenException('You need the right to move and share tickets (desk.ticket.move).');
    const { t, access } = await this.tickets.load(tx, a, id);
    if (access !== 'agent' || !isAgentOn(a, t.deskId) || !has(a, 'desk.ticket.work')) throw new ForbiddenException(SEAT_REQUIRED);
    return t;
  }

  /**
   * The ticket goes on as a new ticket of the other desk (its number, privacy, categories and SLA), with the requester's
   * first message as its description and the conversation as an internal note; the old ticket closes with a link and a
   * line the requester sees. Files come along (the same stored, scanned bytes).
   */
  async move(a: DeskActor, id: string, dto: { deskId: string; categoryId?: string; reason: string }) {
    // The rights are checked here (key, agent seat on the ticket's desk, allowed pair); writing onto the other desk is the
    // desk's own step (the mover may hold no seat there, and a restricted desk's rows are not theirs to read back).
    const out = await deskSystem(this.tenantPrisma, a.ctx, async (tx) => {
      const org = a.ctx.organizationId;
      const t = await this.working(tx, a, id);
      if (!OPEN_STATES.includes(t.systemState)) throw new ConflictException('Only an open ticket can be moved.');
      if (t.mergedIntoId) throw new ConflictException('This ticket was merged.');
      if (dto.deskId === t.deskId) throw new BadRequestException('Choose another desk.');
      const [from, to] = await Promise.all([tx.sdDesk.findFirstOrThrow({ where: { organizationId: org, id: t.deskId } }), tx.sdDesk.findFirst({ where: { organizationId: org, id: dto.deskId, status: 'active' } })]);
      if (!to) throw new NotFoundException('No such desk.');
      if ((from.kind === 'customer_support') !== (to.kind === 'customer_support')) throw new BadRequestException('Employee tickets move only between employee help desks, customer tickets only between customer desks.');
      if (!from.forwardTo.includes(to.id) && !isAgentOn(a, to.id)) throw new ForbiddenException(`${from.name} does not move tickets to ${to.name}. Ask the desk admin to allow it.`);
      if (await tx.sdRequestItem.count({ where: { organizationId: org, ticketId: t.id } })) throw new ConflictException('A catalogue request stays on the desk that fulfils it.');
      const openTasks = await tx.sdTask.count({ where: { organizationId: org, ticketId: t.id, state: { in: ['open', 'in_progress'] } } });
      if (openTasks) throw new ConflictException({ statusCode: 409, code: 'TASKS_OPEN', message: `Finish or cancel the ${openTasks} open task${openTasks > 1 ? 's' : ''} first.` });
      const cat = dto.categoryId ? await tx.sdCategory.findFirst({ where: { organizationId: org, deskId: to.id, id: dto.categoryId, active: true } }) : null;
      if (dto.categoryId && !cat) throw new BadRequestException(`Choose a category of ${to.name}.`);
      // YX-HD-03: a sensitive ticket goes only into a sensitive category of the other desk.
      if (t.sensitive && !cat?.sensitive) throw new BadRequestException(`This ticket is sensitive. Choose a sensitive category of ${to.name}.`);
      const type = (await tx.sdTicketType.findFirst({ where: { organizationId: org, deskId: to.id, active: true, kind: t.kind } })) ?? undefined;
      const messages = await tx.sdTicketMessage.findMany({ where: { organizationId: org, ticketId: t.id, kind: { in: ['reply', 'note'] } }, orderBy: { createdAt: 'asc' } });
      const first = messages.find((m) => m.side === 'requester') ?? messages[0];
      const moved = await this.tickets.createIn(tx, a, {
        deskId: to.id,
        typeId: type?.id,
        categoryId: cat?.id,
        subject: t.subject,
        bodyHtml: first?.bodyHtml || textToHtml(t.subject),
        impact: t.impact ?? undefined,
        urgency: t.urgency ?? undefined,
        requesterPersonId: t.requesterPersonId,
        requestedForPersonId: t.requestedForPersonId ?? undefined,
        openedByUserId: a.userId,
        channel: t.channel as CreateInput['channel'],
        private: t.private,
        tags: t.tags,
        side: first?.side === 'agent' ? 'agent' : 'requester',
        authorPersonId: first?.side === 'agent' ? null : t.requesterPersonId,
      });
      const people = await this.tickets.userNames(tx, org, messages.map((m) => m.authorUserId));
      const transcript = messages
        .filter((m) => m.id !== first?.id)
        .map((m) => `${m.createdAt.toISOString().slice(0, 16).replace('T', ' ')} · ${m.side === 'agent' ? (people.get(m.authorUserId ?? '') ?? 'Agent') : 'Requester'}${m.kind === 'note' ? ' (note)' : ''}: ${m.bodyText}`)
        .join('\n');
      const noteText = `Moved from ${t.number} (${from.name}). Reason: ${dto.reason}${transcript ? `\n\nEarlier conversation:\n${transcript}` : ''}`.slice(0, 60_000);
      await tx.sdTicketMessage.create({ data: { organizationId: org, deskId: to.id, ticketId: moved.id, kind: 'note', side: 'agent', authorUserId: a.userId, bodyHtml: textToHtml(noteText), bodyText: noteText, channel: 'agent' } });
      const files = await tx.sdAttachment.findMany({ where: { organizationId: org, ticketId: t.id, scanStatus: { in: ['clean', 'pending'] } } });
      for (const f of files) {
        await tx.sdAttachment.create({ data: { organizationId: org, deskId: to.id, ticketId: moved.id, side: f.side, uploadedByUserId: f.uploadedByUserId, uploadedByPersonId: f.uploadedByPersonId, blobKey: f.blobKey, fileName: f.fileName, contentType: f.contentType, sizeBytes: f.sizeBytes, sha256: f.sha256, scanStatus: f.scanStatus, scanDetail: f.scanDetail, scannedAt: f.scannedAt } });
      }
      const watchers = await tx.sdTicketWatcher.findMany({ where: { organizationId: org, ticketId: t.id } });
      for (const w of watchers) if (w.personId !== t.requestedForPersonId) await this.tickets.addWatcherIn(tx, a, moved, w.personId, false);
      // The old ticket closes as moved (not resolved: no resolution code is asked for).
      const closed = await this.tickets.firstStatus(tx, org, t.deskId, t.typeId, 'closed');
      await tx.sdTicket.update({ where: { id: t.id }, data: { statusId: closed.id, closedAt: new Date(), resolutionNote: `Moved to ${moved.number}`, version: { increment: 1 } } });
      await tx.sdTicketLink.create({ data: { organizationId: org, fromTicketId: t.id, toTicketId: moved.id, kind: 'related', createdBy: a.userId } });
      await this.tickets.event(tx, t, 'moved_to', t.number, moved.number, { by: a.userId, reason: dto.reason, requesterVisible: true });
      await this.tickets.event(tx, moved, 'moved_from', t.number, moved.number, { by: a.userId, reason: dto.reason, requesterVisible: true });
      await this.tickets.sla.sync(tx, t.id);
      await emit(tx, org, 'helpdesk.ticket.moved', { ticketId: t.id, deskId: t.deskId, toTicketId: moved.id, toDeskId: to.id });
      await audit(tx, a, 'desk.ticket.moved', 'sd_ticket', t.id, { number: t.number, toTicketId: moved.id, toNumber: moved.number, toDeskId: to.id, reason: dto.reason, sensitive: t.sensitive, private: t.private, files: files.length });
      return { id: moved.id, number: moved.number };
    });
    return out;
  }

  // ------------------------------------------------------------------------------------------ share (US-G-046)

  // DECISION NEEDED: the design lists a third share level, 'full' (the other desk works the ticket). Built: view and
  // comment; to hand over the work, the ticket is moved.
  async share(a: DeskActor, id: string, dto: { deskId: string; level: 'view' | 'comment' }) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const t = await this.working(tx, a, id);
      if (t.sensitive || t.private) throw new ConflictException('A sensitive or private ticket is never shared with another desk. Move it if another desk must own it.');
      if (dto.deskId === t.deskId) throw new BadRequestException('Choose another desk.');
      const desk = await tx.sdDesk.findFirst({ where: { organizationId: org, id: dto.deskId, status: 'active' }, select: { id: true, name: true, privacy: true } });
      if (!desk) throw new NotFoundException('No such desk.');
      const row = await tx.sdTicketShare.upsert({
        where: { id: (await tx.sdTicketShare.findFirst({ where: { organizationId: org, ticketId: t.id, sharedDeskId: desk.id }, select: { id: true } }))?.id ?? '00000000-0000-0000-0000-000000000000' },
        update: { level: dto.level },
        create: { organizationId: org, deskId: t.deskId, ticketId: t.id, sharedDeskId: desk.id, level: dto.level, createdBy: a.userId },
      });
      await this.tickets.event(tx, t, 'shared', null, `${desk.name} (${dto.level === 'view' ? 'can view' : 'can add notes'})`, { by: a.userId });
      await audit(tx, a, 'desk.ticket.shared', 'sd_ticket', t.id, { number: t.number, deskId: desk.id, level: dto.level });
      return { id: row.id, deskId: desk.id, level: row.level };
    });
  }

  async unshare(a: DeskActor, id: string, deskId: string) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const t = await this.working(tx, a, id);
      const res = await tx.sdTicketShare.deleteMany({ where: { organizationId: org, ticketId: t.id, sharedDeskId: deskId } });
      if (!res.count) throw new NotFoundException('This ticket is not shared with that desk.');
      await this.tickets.event(tx, t, 'unshared', null, deskId, { by: a.userId });
      await audit(tx, a, 'desk.ticket.unshared', 'sd_ticket', t.id, { number: t.number, deskId });
      return { removed: true };
    });
  }

  async shares(a: DeskActor, id: string) {
    return this.tx(a, async (tx) => {
      const { t } = await this.tickets.load(tx, a, id);
      const rows = await tx.sdTicketShare.findMany({ where: { organizationId: a.ctx.organizationId, ticketId: t.id } });
      const names = new Map((await tx.sdDesk.findMany({ where: { organizationId: a.ctx.organizationId, id: { in: rows.map((r) => r.sharedDeskId) } }, select: { id: true, name: true } })).map((d) => [d.id, d.name]));
      return rows.map((r) => ({ deskId: r.sharedDeskId, desk: names.get(r.sharedDeskId) ?? '', level: r.level, at: r.createdAt }));
    });
  }

  /** The desks this desk may move tickets to (desk admin). */
  async setForwardTo(a: DeskActor, deskId: string, deskIds: string[]) {
    requireSetUp(a, deskId, 'desk.settings.manage');
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      await requireDesk(tx, a, deskId);
      const ids = [...new Set(deskIds)].filter((d) => d !== deskId);
      if ((await tx.sdDesk.count({ where: { organizationId: org, id: { in: ids } } })) !== ids.length) throw new BadRequestException('Choose desks of this company.');
      await tx.sdDesk.update({ where: { id: deskId }, data: { forwardTo: ids, version: { increment: 1 }, updatedAt: new Date() } });
      await audit(tx, a, 'desk.desk.forward_to_set', 'sd_desk', deskId, { deskIds: ids });
      return { forwardTo: ids };
    });
  }

  // ------------------------------------------------------------------------------------------ clone (US-G-047)

  /**
   * A new desk with the set-up of another: types, statuses, categories, teams (without members), the priority grid,
   * SLA policies (their latest version), saved replies, document templates, lifecycles and catalogue items (as drafts).
   * Ids inside copied rules are mapped to the new desk's own. Tickets, members and rules are never copied.
   */
  async clone(a: DeskActor, sourceId: string, dto: { name: string; key: string }) {
    if (!has(a, 'desk.desk.create')) throw new ForbiddenException('Only a Service Desk admin creates desks.');
    try {
      return await this.tx(a, async (tx) => {
        const org = a.ctx.organizationId;
        const src = await tx.sdDesk.findFirst({ where: { organizationId: org, id: sourceId } });
        if (!src) throw new NotFoundException('No such desk.');
        const hrms = Boolean(await tx.organizationProduct.findFirst({ where: { organizationId: org, productCode: 'hrms' } }));
        const freeHrTaken = Boolean(await tx.sdDesk.findFirst({ where: { organizationId: org, billingClass: 'hrms_included' }, select: { id: true } }));
        const billingClass = src.kind === 'hr' && hrms && !freeHrTaken ? 'hrms_included' : 'service_desk';
        const desk = await tx.sdDesk.create({
          data: { organizationId: org, key: dto.key, name: dto.name, kind: src.kind, billingClass, privacy: src.privacy, calendarId: src.calendarId, numberPrefix: `${dto.key}-`, attachmentTypes: src.attachmentTypes, attachmentMaxMb: src.attachmentMaxMb, vipRaisesPriority: src.vipRaisesPriority, resolutionRequired: src.resolutionRequired, reopenWindowDays: src.reopenWindowDays, requesterCanReopen: src.requesterCanReopen, autoCloseDays: src.autoCloseDays, createdBy: a.userId },
        });
        const d = { organizationId: org, deskId: desk.id };
        await tx.sdCounter.create({ data: { ...d, nextNumber: 1001 } });
        const ids = new Map<string, string>();
        const map = (id: string | null) => (id ? (ids.get(id) ?? null) : null);
        const remap = (x: unknown) => JSON.parse(JSON.stringify(x ?? null).replace(UUID, (m) => ids.get(m.toLowerCase()) ?? m)) as Prisma.InputJsonValue;
        for (const x of await tx.sdTicketType.findMany({ where: { organizationId: org, deskId: src.id } })) ids.set(x.id, (await tx.sdTicketType.create({ data: { ...d, kind: x.kind, name: x.name, active: x.active, sortOrder: x.sortOrder } })).id);
        for (const x of await tx.sdStatus.findMany({ where: { organizationId: org, deskId: src.id } })) ids.set(x.id, (await tx.sdStatus.create({ data: { ...d, ticketTypeId: map(x.ticketTypeId), label: x.label, systemState: x.systemState, sortOrder: x.sortOrder, active: x.active } })).id);
        for (const x of await tx.sdGroup.findMany({ where: { organizationId: org, deskId: src.id } })) ids.set(x.id, (await tx.sdGroup.create({ data: { ...d, name: x.name, tier: x.tier, assignmentMethod: x.assignmentMethod, maxOpenPerAgent: x.maxOpenPerAgent, active: x.active } })).id);
        const cats = await tx.sdCategory.findMany({ where: { organizationId: org, deskId: src.id }, orderBy: [{ parentId: { sort: 'asc', nulls: 'first' } }] });
        for (const x of cats.filter((c) => !c.parentId).concat(cats.filter((c) => c.parentId))) {
          ids.set(x.id, (await tx.sdCategory.create({ data: { ...d, parentId: map(x.parentId), name: x.name, sensitive: x.sensitive, privateByDefault: x.privateByDefault, defaultGroupId: map(x.defaultGroupId), defaultPriority: x.defaultPriority, active: x.active, sortOrder: x.sortOrder } })).id);
        }
        const cells = await tx.sdPriorityMatrix.findMany({ where: { organizationId: org, deskId: src.id } });
        if (cells.length) await tx.sdPriorityMatrix.createMany({ data: cells.map((c) => ({ ...d, impact: c.impact, urgency: c.urgency, priority: c.priority })) });
        for (const p of await tx.sdSlaPolicy.findMany({ where: { organizationId: org, deskId: src.id } })) {
          const v = await tx.sdSlaPolicyVersion.findFirst({ where: { organizationId: org, policyId: p.id }, orderBy: { version: 'desc' } });
          if (!v) continue;
          const np = await tx.sdSlaPolicy.create({ data: { ...d, name: p.name, kind: p.kind, sortOrder: p.sortOrder, active: p.active, createdBy: a.userId } });
          await tx.sdSlaPolicyVersion.create({ data: { ...d, policyId: np.id, version: 1, scope: remap(v.scope), calendarSource: v.calendarSource, calendarId: v.calendarId, targets: remap(v.targets), pauseStates: v.pauseStates, recount: v.recount, createdBy: a.userId } });
        }
        for (const c of await tx.sdCannedResponse.findMany({ where: { organizationId: org, deskId: src.id, ownerUserId: null } })) await tx.sdCannedResponse.create({ data: { ...d, title: c.title, bodyHtml: c.bodyHtml, active: c.active, createdBy: a.userId } });
        for (const x of await tx.sdDocTemplate.findMany({ where: { organizationId: org, deskId: src.id } })) await tx.sdDocTemplate.create({ data: { ...d, name: x.name, body: x.body, needsSignature: x.needsSignature, active: x.active, createdBy: a.userId } });
        for (const x of await tx.sdLifecycle.findMany({ where: { organizationId: org, deskId: src.id } })) {
          const v = x.currentVersion ? await tx.sdLifecycleVersion.findFirst({ where: { organizationId: org, lifecycleId: x.id, version: x.currentVersion } }) : null;
          const draft = v ? { startStatusId: v.startStatusId, statusIds: v.statusIds, transitions: v.transitions } : x.draft;
          await tx.sdLifecycle.create({ data: { ...d, ticketTypeId: map(x.ticketTypeId)!, name: x.name, draft: remap(draft), createdBy: a.userId } });
        }
        for (const x of await tx.sdCatalogItem.findMany({ where: { organizationId: org, deskId: src.id, state: { not: 'retired' } } })) {
          await tx.sdCatalogItem.create({ data: { ...d, categoryId: map(x.categoryId), name: x.name, shortText: x.shortText, state: 'draft', audience: x.audience ?? Prisma.JsonNull, cost: x.cost, currency: x.currency, deliveryDays: x.deliveryDays, sortOrder: x.sortOrder, journeyOnly: x.journeyOnly, draft: remap(x.draft), createdBy: a.userId } });
        }
        await audit(tx, a, 'desk.desk.cloned', 'sd_desk', desk.id, { from: src.id, key: desk.key, name: desk.name, kind: desk.kind, billingClass });
        return { id: desk.id, key: desk.key, name: desk.name };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('A desk with that key already exists.');
      throw e;
    }
  }

  // ------------------------------------------------------------------------------------------ branches (US-G-050)

  async branches(a: DeskActor, deskId: string) {
    if (!a.roles.has(deskId) && !has(a, 'desk.desk.create')) throw new NotFoundException('No such desk.');
    return this.tx(a, async (tx) => {
      const rows = await tx.sdDeskBranch.findMany({ where: { organizationId: a.ctx.organizationId, deskId }, orderBy: { createdAt: 'asc' } });
      const locs = new Map((await tx.location.findMany({ where: { organizationId: a.ctx.organizationId, id: { in: rows.map((r) => r.locationId) } }, select: { id: true, name: true } })).map((l) => [l.id, l.name]));
      return rows.map((r) => ({ id: r.id, locationId: r.locationId, location: locs.get(r.locationId) ?? '', groupId: r.groupId, calendarId: r.calendarId, adminUserId: r.adminUserId, version: r.version, canEdit: this.canEditBranch(a, r) }));
    });
  }

  private canEditBranch(a: DeskActor, b: { deskId: string; adminUserId: string | null }) {
    return has(a, 'desk.settings.manage') && (has(a, 'desk.desk.create') || a.roles.get(b.deskId) === 'admin' || b.adminUserId === a.userId);
  }

  private async checkBranchRefs(tx: Tx, org: string, deskId: string, dto: { groupId?: string | null; calendarId?: string | null; adminUserId?: string | null }) {
    if (dto.groupId && !(await tx.sdGroup.findFirst({ where: { organizationId: org, deskId, id: dto.groupId, active: true }, select: { id: true } }))) throw new BadRequestException('Choose a team of this desk.');
    if (dto.calendarId && !(await tx.businessCalendar.findFirst({ where: { organizationId: org, id: dto.calendarId }, select: { id: true } }))) throw new BadRequestException('Choose a calendar of this company.');
    if (dto.adminUserId && !(await tx.user.findFirst({ where: { organizationId: org, id: dto.adminUserId, status: 'active' }, select: { id: true } }))) throw new BadRequestException('Choose an active colleague.');
  }

  async addBranch(a: DeskActor, deskId: string, dto: { locationId: string; groupId?: string | null; calendarId?: string | null; adminUserId?: string | null }) {
    requireSetUp(a, deskId, 'desk.settings.manage');
    try {
      return await this.tx(a, async (tx) => {
        const org = a.ctx.organizationId;
        await requireDesk(tx, a, deskId);
        if (!(await tx.location.findFirst({ where: { organizationId: org, id: dto.locationId }, select: { id: true } }))) throw new BadRequestException('Choose a location of this company.');
        await this.checkBranchRefs(tx, org, deskId, dto);
        const b = await tx.sdDeskBranch.create({ data: { organizationId: org, deskId, locationId: dto.locationId, groupId: dto.groupId ?? null, calendarId: dto.calendarId ?? null, adminUserId: dto.adminUserId ?? null, createdBy: a.userId } });
        await audit(tx, a, 'desk.branch.created', 'sd_desk_branch', b.id, { deskId, locationId: b.locationId, groupId: b.groupId, calendarId: b.calendarId, adminUserId: b.adminUserId });
        return { id: b.id };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('That location already has a branch on this desk.');
      throw e;
    }
  }

  /** A branch admin changes only their own branch's team and hours; the desk admin also changes who runs it. */
  async updateBranch(a: DeskActor, id: string, dto: { version: number; groupId?: string | null; calendarId?: string | null; adminUserId?: string | null }) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const b = await tx.sdDeskBranch.findFirst({ where: { organizationId: org, id } });
      if (!b || (!a.roles.has(b.deskId) && !has(a, 'desk.desk.create') && b.adminUserId !== a.userId)) throw new NotFoundException('No such branch.');
      if (!this.canEditBranch(a, b)) throw new ForbiddenException('Only the desk admin or this branch\'s admin changes it.');
      const deskAdmin = has(a, 'desk.desk.create') || a.roles.get(b.deskId) === 'admin';
      if (dto.adminUserId !== undefined && dto.adminUserId !== b.adminUserId && !deskAdmin) throw new ForbiddenException('Only the desk admin changes who runs a branch.');
      await this.checkBranchRefs(tx, org, b.deskId, dto);
      const res = await tx.sdDeskBranch.updateMany({ where: { id, version: dto.version }, data: { groupId: dto.groupId, calendarId: dto.calendarId, adminUserId: dto.adminUserId, version: { increment: 1 }, updatedAt: new Date() } });
      if (!res.count) throw new ConflictException('Someone changed this branch. Reload to see the latest.');
      await audit(tx, a, 'desk.branch.updated', 'sd_desk_branch', id, { groupId: dto.groupId, calendarId: dto.calendarId, adminUserId: dto.adminUserId });
      return { id };
    });
  }
}
