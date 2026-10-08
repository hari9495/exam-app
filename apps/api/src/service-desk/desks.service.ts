import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { Tx } from '../org-structure/org-structure.service';
import { addDays, todayIst } from '../org-structure/org-validation';
import { isValidZone } from './business-time';
import { cleanHtml, htmlToText } from './rich-text';
import { STARTER_HOURS, starterFor, starterPriority } from './starter';
import { DeskActor, activeOn, audit, canSetUp, emit, has, isAgentOn, requireSetUp, requireWork } from './desk-access';
import {
  AddMemberDto,
  AgentStatusDto,
  CalendarDto,
  CalendarHoursDto,
  CannedResponseDto,
  CategoryDto,
  CreateDeskDto,
  GroupDto,
  HolidayDto,
  MatrixDto,
  ScenarioDto,
  StatusDto,
  TicketTypeDto,
  UpdateCalendarDto,
  UpdateDeskDto,
  UpdateStatusDto,
  UpdateTicketTypeDto,
  VipDto,
} from './dto';

// SD-1.01 desk set-up and SD-1.02 business calendars (M14 §5.2, §6, §12.1). Every change writes its audit row in the
// same transaction (P08). The system decides billing_class (§6.3, D4); the admin never sends it.

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const OPEN_STATES = ['new', 'open', 'pending', 'on_hold'];
/** §14.2: types no desk may allow, whatever its admin chooses (they run code or render as a page). */
export const BLOCKED_TYPES = new Set(['exe', 'dll', 'msi', 'msp', 'bat', 'cmd', 'com', 'scr', 'pif', 'cpl', 'ps1', 'psm1', 'vbs', 'vbe', 'js', 'jse', 'mjs', 'wsf', 'wsh', 'hta', 'sh', 'bash', 'jar', 'apk', 'app', 'dmg', 'iso', 'lnk', 'reg', 'html', 'htm', 'xhtml', 'shtml', 'svg', 'xml', 'xsl', 'php', 'asp', 'aspx', 'jsp', 'py', 'pl', 'rb', 'swf', 'docm', 'xlsm', 'pptm']);

function uniqueViolation(e: unknown, message: string): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(message);
  // Exclusion and check constraints raised by the database (overlapping dates, rewritten history).
  const text = String((e as Error)?.message ?? '');
  if (/no_overlap|23P01|exclusion/i.test(text)) throw new ConflictException(message);
  throw e;
}

@Injectable()
export class DesksService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private tx<T>(a: DeskActor, fn: (tx: Tx) => Promise<T>) {
    return this.tenantPrisma.forTenant(a.ctx, fn);
  }

  private async desk(tx: Tx, a: DeskActor, id: string) {
    const desk = await tx.sdDesk.findFirst({ where: { organizationId: a.ctx.organizationId, id } });
    if (!desk) throw new NotFoundException('No such desk.');
    return desk;
  }

  // ------------------------------------------------------------------------------------------ desks

  /** Desks the person works on or sets up. Service Desk admins see every desk (not its tickets). */
  async list(a: DeskActor) {
    const all = has(a, 'desk.desk.create');
    return this.tx(a, async (tx) => {
      const desks = await tx.sdDesk.findMany({ where: { organizationId: a.ctx.organizationId, ...(all ? {} : { id: { in: [...a.roles.keys()] } }) }, orderBy: { name: 'asc' } });
      return desks.map((d) => ({ ...this.deskView(d), myRole: a.roles.get(d.id) ?? null, canSetUp: canSetUp(a, d.id, 'desk.settings.manage'), canWork: isAgentOn(a, d.id) && has(a, 'desk.ticket.work') }));
    });
  }

  private deskView(d: Prisma.SdDeskGetPayload<object>) {
    return {
      id: d.id,
      key: d.key,
      name: d.name,
      kind: d.kind,
      /** D8: the desk kind people see. */
      audience: d.kind === 'customer_support' ? 'customer' : 'employee',
      billingClass: d.billingClass,
      privacy: d.privacy,
      calendarId: d.calendarId,
      numberPrefix: d.numberPrefix,
      numberSuffix: d.numberSuffix,
      attachmentTypes: d.attachmentTypes,
      attachmentMaxMb: d.attachmentMaxMb,
      vipRaisesPriority: d.vipRaisesPriority,
      status: d.status,
      version: d.version,
    };
  }

  async create(a: DeskActor, dto: CreateDeskDto) {
    if (!has(a, 'desk.desk.create')) throw new ForbiddenException('Only a Service Desk admin creates desks.');
    const org = a.ctx.organizationId;
    try {
      return await this.tx(a, async (tx) => {
        // D4 / §6.3 L3–L4: the first HR desk of a company with YukthiX HR is inside the HRMS price; any other is paid.
        const hrms = Boolean(await tx.organizationProduct.findFirst({ where: { organizationId: org, productCode: 'hrms' } }));
        const freeHrTaken = Boolean(await tx.sdDesk.findFirst({ where: { organizationId: org, billingClass: 'hrms_included' }, select: { id: true } }));
        const billingClass = dto.kind === 'hr' && hrms && !freeHrTaken ? 'hrms_included' : 'service_desk';
        const calendarId = await this.officeHours(tx, a);
        const desk = await tx.sdDesk.create({ data: { organizationId: org, key: dto.key, name: dto.name, kind: dto.kind, billingClass, calendarId, numberPrefix: `${dto.key}-`, createdBy: a.userId } });
        const d = { organizationId: org, deskId: desk.id };
        await tx.sdCounter.create({ data: { ...d, nextNumber: 1001 } });
        const starter = starterFor(dto.kind);
        await tx.sdTicketType.createMany({ data: starter.types.map((t, i) => ({ ...d, kind: t.kind, name: t.name, sortOrder: i })) });
        await tx.sdStatus.createMany({ data: starter.statuses.map((s, i) => ({ ...d, label: s.label, systemState: s.systemState, sortOrder: i })) });
        const group = await tx.sdGroup.create({ data: { ...d, name: `${dto.name} team`, assignmentMethod: 'round_robin' } });
        await tx.sdCategory.createMany({ data: starter.categories.map((c, i) => ({ ...d, name: c.name, sensitive: Boolean(c.sensitive), defaultGroupId: group.id, sortOrder: i })) });
        const cells = [1, 2, 3, 4].flatMap((impact) => [1, 2, 3, 4].map((urgency) => ({ ...d, impact, urgency, priority: starterPriority(impact, urgency) })));
        await tx.sdPriorityMatrix.createMany({ data: cells });
        await audit(tx, a, 'desk.desk.created', 'sd_desk', desk.id, { key: desk.key, name: desk.name, kind: desk.kind, billingClass });
        return this.deskView(desk);
      });
    } catch (e) {
      uniqueViolation(e, 'A desk with that key already exists.');
    }
  }

  /** The company's shared "Office hours" calendar, made once (9–18 Monday to Friday, India time). */
  private async officeHours(tx: Tx, a: DeskActor): Promise<string> {
    const org = a.ctx.organizationId;
    const found = await tx.businessCalendar.findFirst({ where: { organizationId: org, name: 'Office hours' }, select: { id: true } });
    if (found) return found.id;
    const cal = await tx.businessCalendar.create({ data: { organizationId: org, name: 'Office hours', timeZone: 'Asia/Kolkata', createdBy: a.userId } });
    await tx.businessCalendarHours.createMany({ data: STARTER_HOURS.map((h) => ({ organizationId: org, calendarId: cal.id, ...h, validFrom: day(todayIst()), createdBy: a.userId })) });
    await audit(tx, a, 'desk.calendar.created', 'business_calendar', cal.id, { name: cal.name });
    return cal.id;
  }

  /** Everything a desk's set-up screen and its agents' forms need. Read by anyone with a seat or set-up rights. */
  async get(a: DeskActor, id: string) {
    if (!a.roles.has(id) && !has(a, 'desk.desk.create')) throw new NotFoundException('No such desk.');
    const org = a.ctx.organizationId;
    return this.tx(a, async (tx) => {
      const desk = await this.desk(tx, a, id);
      const w = { organizationId: org, deskId: id };
      const [types, statuses, categories, groups, groupMembers, matrix, members, scenarios] = await Promise.all([
        tx.sdTicketType.findMany({ where: w, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
        tx.sdStatus.findMany({ where: w, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] }),
        tx.sdCategory.findMany({ where: w, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
        tx.sdGroup.findMany({ where: w, orderBy: { name: 'asc' } }),
        tx.sdGroupMember.findMany({ where: w }),
        tx.sdPriorityMatrix.findMany({ where: w }),
        tx.sdDeskMember.findMany({ where: { ...w, OR: [{ validTo: null }, { validTo: { gte: day(todayIst()) } }] }, orderBy: { createdAt: 'asc' } }),
        tx.sdScenario.findMany({ where: w, orderBy: { name: 'asc' } }),
      ]);
      const users = await tx.user.findMany({ where: { organizationId: org, id: { in: members.map((m) => m.userId) } }, select: { id: true, name: true, email: true } });
      const name = new Map(users.map((u) => [u.id, u]));
      const today = todayIst();
      // Collaborators get only what writing a note needs: no emails, no seats' details, no scenarios (review fix).
      const limited = a.roles.get(id) === 'collaborator' && !has(a, 'desk.desk.create');
      const shown = limited ? members.filter((m) => iso(m.validFrom)! <= today) : members;
      return {
        desk: this.deskView(desk),
        types: types.map((t) => ({ id: t.id, kind: t.kind, name: t.name, active: t.active, sortOrder: t.sortOrder })),
        statuses: statuses.map((s) => ({ id: s.id, label: s.label, systemState: s.systemState, ticketTypeId: s.ticketTypeId, sortOrder: s.sortOrder, active: s.active })),
        categories: categories.map((c) => ({ id: c.id, name: c.name, parentId: c.parentId, sensitive: c.sensitive, defaultGroupId: c.defaultGroupId, defaultPriority: c.defaultPriority, active: c.active, sortOrder: c.sortOrder })),
        groups: groups.map((g) => ({ id: g.id, name: g.name, tier: g.tier, assignmentMethod: g.assignmentMethod, maxOpenPerAgent: g.maxOpenPerAgent, active: g.active, memberIds: limited ? [] : groupMembers.filter((m) => m.groupId === g.id).map((m) => m.userId) })),
        matrix: matrix.map((m) => ({ impact: m.impact, urgency: m.urgency, priority: m.priority })),
        members: shown.map((m) => ({
          id: m.id,
          userId: m.userId,
          name: name.get(m.userId)?.name ?? name.get(m.userId)?.email ?? 'Someone',
          email: limited ? null : (name.get(m.userId)?.email ?? null),
          role: m.role,
          tier: m.tier,
          skills: limited ? [] : m.skills,
          validFrom: iso(m.validFrom),
          validTo: iso(m.validTo),
          active: iso(m.validFrom)! <= today,
        })),
        scenarios: limited ? [] : scenarios.filter((s) => s.active || canSetUp(a, id, 'desk.settings.manage')).map((s) => ({ id: s.id, name: s.name, actions: s.actions, active: s.active })),
        myRole: a.roles.get(id) ?? null,
        canSetUp: canSetUp(a, id, 'desk.settings.manage'),
        canManageMembers: canSetUp(a, id, 'desk.member.manage'),
      };
    });
  }

  async update(a: DeskActor, id: string, dto: UpdateDeskDto) {
    requireSetUp(a, id, 'desk.settings.manage');
    const org = a.ctx.organizationId;
    return this.tx(a, async (tx) => {
      const before = await this.desk(tx, a, id);
      // A desk admin may only tighten privacy; opening a restricted desk up is the Service Desk admin's call.
      if (dto.privacy && dto.privacy !== before.privacy && dto.privacy === 'standard' && !has(a, 'desk.desk.create')) throw new ForbiddenException('Only a Service Desk admin opens a restricted desk.');
      const blocked = (dto.attachmentTypes ?? []).filter((x) => BLOCKED_TYPES.has(x));
      if (blocked.length) throw new BadRequestException(`These file types are never allowed: ${blocked.join(', ')}.`);
      if (dto.numberPrefix !== undefined || dto.numberSuffix !== undefined) {
        const prefix = dto.numberPrefix ?? before.numberPrefix;
        const suffix = dto.numberSuffix ?? before.numberSuffix;
        if (await tx.sdDesk.findFirst({ where: { organizationId: org, id: { not: id }, numberPrefix: prefix, numberSuffix: suffix }, select: { id: true } })) throw new ConflictException('Another desk already numbers its tickets like that. Choose another prefix.');
      }
      if (dto.calendarId && !(await tx.businessCalendar.findFirst({ where: { organizationId: org, id: dto.calendarId }, select: { id: true } }))) throw new BadRequestException('No such calendar.');
      const { version, nextNumber, ...fields } = dto;
      const res = await tx.sdDesk.updateMany({ where: { organizationId: org, id, version }, data: { ...fields, version: { increment: 1 } } });
      if (res.count === 0) throw new ConflictException('Someone else changed this desk. Reload to see the latest.');
      if (nextNumber !== undefined) {
        // US-G-214: numbers only move forward, so an old number is never given out twice.
        const moved = await tx.sdCounter.updateMany({ where: { organizationId: org, deskId: id, nextNumber: { lte: nextNumber } }, data: { nextNumber } });
        if (moved.count === 0) throw new BadRequestException('The next number can only go up.');
      }
      const after = await this.desk(tx, a, id);
      const changed = Object.fromEntries(Object.keys(dto).filter((k) => k !== 'version').map((k) => [k, { from: (before as Record<string, unknown>)[k] ?? null, to: (dto as unknown as Record<string, unknown>)[k] }]));
      await audit(tx, a, 'desk.desk.updated', 'sd_desk', id, { changed });
      return this.deskView(after);
    });
  }

  // ------------------------------------------------------------------------------------------ members (seats)

  /** Staff people of the company who can be given a seat. */
  async users(a: DeskActor, search?: string) {
    if (!has(a, 'desk.member.manage')) throw new ForbiddenException('You cannot manage desk members.');
    return this.tx(a, (tx) =>
      tx.user.findMany({
        where: { organizationId: a.ctx.organizationId, status: 'active', ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] } : {}) },
        select: { id: true, name: true, email: true },
        orderBy: { name: 'asc' },
        take: 25,
      }),
    );
  }

  /** §6.3: what giving this seat costs, said before saving. */
  private async seatCost(tx: Tx, a: DeskActor, desk: { id: string; billingClass: string }, userId: string, role: string) {
    if (role !== 'agent' && role !== 'lead') return { paid: false, reason: role === 'collaborator' ? 'Collaborators are free.' : 'Desk admins who only set up are free.' };
    if (desk.billingClass === 'hrms_included') return { paid: false, reason: 'Free: HR desk inside YukthiX HR.' };
    const other = await tx.sdDeskMember.findFirst({
      where: { organizationId: a.ctx.organizationId, userId, role: { in: ['agent', 'lead'] }, deskId: { not: desk.id }, ...activeOn(todayIst()) },
      select: { deskId: true },
    });
    if (other && (await tx.sdDesk.findFirst({ where: { organizationId: a.ctx.organizationId, id: other.deskId, billingClass: 'service_desk' }, select: { id: true } }))) {
      return { paid: false, reason: 'Already a paid agent on another desk; counted once.' };
    }
    return { paid: true, reason: 'Adds ₹999 a month (one agent).' };
  }

  async previewSeat(a: DeskActor, deskId: string, userId: string, role: string) {
    requireSetUp(a, deskId, 'desk.member.manage');
    return this.tx(a, async (tx) => this.seatCost(tx, a, await this.desk(tx, a, deskId), userId, role));
  }

  async addMember(a: DeskActor, deskId: string, dto: AddMemberDto) {
    requireSetUp(a, deskId, 'desk.member.manage');
    const org = a.ctx.organizationId;
    let added: { id: string; cost: { paid: boolean; reason: string }; desk: string; admins: string[] };
    try {
      added = await this.tx(a, async (tx) => {
        const desk = await this.desk(tx, a, deskId);
        // Nobody gives themselves a seat that opens tickets (P02 YX-SEC-11 four eyes); another admin does it.
        if (dto.userId === a.userId && dto.role !== 'admin') throw new ForbiddenException('Ask another admin to give you a seat that opens tickets.');
        const user = await tx.user.findFirst({ where: { organizationId: org, id: dto.userId, status: 'active' }, select: { id: true } });
        if (!user) throw new BadRequestException('No such person in this company.');
        const cost = await this.seatCost(tx, a, desk, dto.userId, dto.role);
        const m = await tx.sdDeskMember.create({
          data: { organizationId: org, deskId, userId: dto.userId, role: dto.role, tier: dto.tier ?? null, skills: dto.skills ?? [], validFrom: day(todayIst()), createdBy: a.userId },
        });
        await audit(tx, a, 'desk.member.added', 'sd_desk_member', m.id, { deskId, userId: dto.userId, role: dto.role, paid: cost.paid });
        if (dto.role === 'agent' || dto.role === 'lead') await emit(tx, org, 'helpdesk.agent_seat.granted', { deskId, userId: dto.userId, paid: cost.paid });
        const admins = dto.role === 'admin' ? [] : (await tx.user.findMany({ where: { organizationId: org, role: 'org_admin', status: 'active' }, select: { id: true } })).map((u) => u.id);
        return { id: m.id, cost, desk: desk.name, admins };
      });
    } catch (e) {
      uniqueViolation(e, 'That person already has a role on this desk. End it first to change it.');
    }
    // A seat that opens tickets is told to the company's System Admins (in-app), so a quiet self-serve grant shows.
    await this.notifications
      .notify(a.ctx, a.userId, added.admins, 'helpdesk.seat.granted', { entityType: 'sd_desk', entityId: deskId, contextText: `${dto.role} seat on ${added.desk}`, linkPath: '/yx/desk/setup' })
      .catch(() => undefined);
    return { id: added.id, cost: added.cost };
  }

  /** Ends a seat today (never deleted: who was an agent when stays known). Their open tickets go back to the queue. */
  async endMember(a: DeskActor, deskId: string, memberId: string) {
    requireSetUp(a, deskId, 'desk.member.manage');
    const org = a.ctx.organizationId;
    return this.tx(a, async (tx) => {
      const m = await tx.sdDeskMember.findFirst({ where: { organizationId: org, deskId, id: memberId, validTo: null } });
      if (!m) throw new NotFoundException('No such active member.');
      const today = todayIst();
      const from = iso(m.validFrom)!;
      // A seat added and removed on the same day never counts (D2): it closes to the day before it started.
      const validTo = from > addDays(today, -1) ? addDays(from, -1) : addDays(today, -1);
      await tx.sdDeskMember.update({ where: { id: m.id }, data: { validTo: day(validTo), endedBy: a.userId, endedAt: new Date() } });
      if (m.role === 'agent' || m.role === 'lead') {
        const open = await tx.sdTicket.findMany({ where: { organizationId: org, deskId, assigneeUserId: m.userId, systemState: { in: OPEN_STATES } }, select: { id: true } });
        for (const t of open) {
          await tx.sdTicket.update({ where: { id: t.id }, data: { assigneeUserId: null, version: { increment: 1 } } });
          await tx.sdTicketEvent.create({ data: { organizationId: org, deskId, ticketId: t.id, kind: 'assigned', fromValue: m.userId, toValue: null, reason: 'Their seat on the desk ended', byUserId: a.userId } });
        }
        await tx.sdGroupMember.deleteMany({ where: { organizationId: org, deskId, userId: m.userId } });
        await emit(tx, org, 'helpdesk.agent_seat.removed', { deskId, userId: m.userId });
      }
      // Records they were added to as a collaborator close with the seat.
      await tx.sdTicketCollaborator.deleteMany({ where: { organizationId: org, deskId, userId: m.userId } });
      await audit(tx, a, 'desk.member.ended', 'sd_desk_member', m.id, { deskId, userId: m.userId, role: m.role, validTo });
      return { ended: true };
    });
  }

  // ------------------------------------------------------------------------------------------ groups, categories, types, statuses

  private async checkGroupMembers(tx: Tx, a: DeskActor, deskId: string, ids: string[]) {
    if (!ids.length) return;
    const seats = await tx.sdDeskMember.findMany({ where: { organizationId: a.ctx.organizationId, deskId, userId: { in: ids }, role: { in: ['agent', 'lead'] }, ...activeOn(todayIst()) }, select: { userId: true } });
    if (seats.length !== ids.length) throw new BadRequestException('Everyone in a group needs an agent or lead seat on this desk.');
  }

  async saveGroup(a: DeskActor, deskId: string, groupId: string | null, dto: GroupDto) {
    requireSetUp(a, deskId, 'desk.settings.manage');
    const org = a.ctx.organizationId;
    try {
      return await this.tx(a, async (tx) => {
        await this.desk(tx, a, deskId);
        const { memberIds, ...fields } = dto;
        let id = groupId;
        if (id) {
          const res = await tx.sdGroup.updateMany({ where: { organizationId: org, deskId, id }, data: { ...fields, version: { increment: 1 } } });
          if (!res.count) throw new NotFoundException('No such group.');
        } else {
          id = (await tx.sdGroup.create({ data: { organizationId: org, deskId, ...fields } })).id;
        }
        if (memberIds) {
          await this.checkGroupMembers(tx, a, deskId, memberIds);
          await tx.sdGroupMember.deleteMany({ where: { organizationId: org, groupId: id } });
          await tx.sdGroupMember.createMany({ data: memberIds.map((userId) => ({ organizationId: org, deskId, groupId: id!, userId, createdBy: a.userId })) });
        }
        await audit(tx, a, groupId ? 'desk.group.updated' : 'desk.group.created', 'sd_group', id, { deskId, ...dto });
        return { id };
      });
    } catch (e) {
      uniqueViolation(e, 'A group with that name already exists on this desk.');
    }
  }

  async saveCategory(a: DeskActor, deskId: string, categoryId: string | null, dto: CategoryDto) {
    requireSetUp(a, deskId, 'desk.settings.manage');
    const org = a.ctx.organizationId;
    try {
      return await this.tx(a, async (tx) => {
        await this.desk(tx, a, deskId);
        if (dto.parentId) {
          const parent = await tx.sdCategory.findFirst({ where: { organizationId: org, deskId, id: dto.parentId } });
          if (!parent || parent.parentId) throw new BadRequestException('A category can sit under a top-level category of this desk only (two levels).');
          if (parent.id === categoryId) throw new BadRequestException('A category cannot sit under itself.');
          if (categoryId && (await tx.sdCategory.findFirst({ where: { organizationId: org, parentId: categoryId }, select: { id: true } }))) throw new BadRequestException('This category has sub-categories, so it stays top-level.');
        }
        if (dto.defaultGroupId && !(await tx.sdGroup.findFirst({ where: { organizationId: org, deskId, id: dto.defaultGroupId }, select: { id: true } }))) throw new BadRequestException('No such group on this desk.');
        let id = categoryId;
        if (id) {
          const res = await tx.sdCategory.updateMany({ where: { organizationId: org, deskId, id }, data: dto });
          if (!res.count) throw new NotFoundException('No such category.');
        } else {
          id = (await tx.sdCategory.create({ data: { organizationId: org, deskId, ...dto } })).id;
        }
        await audit(tx, a, categoryId ? 'desk.category.updated' : 'desk.category.created', 'sd_category', id, { deskId, ...dto });
        return { id };
      });
    } catch (e) {
      uniqueViolation(e, 'A category with that name already exists here.');
    }
  }

  async saveType(a: DeskActor, deskId: string, typeId: string | null, dto: TicketTypeDto | UpdateTicketTypeDto) {
    requireSetUp(a, deskId, 'desk.settings.manage');
    const org = a.ctx.organizationId;
    try {
      return await this.tx(a, async (tx) => {
        await this.desk(tx, a, deskId);
        let id = typeId;
        if (id) {
          const res = await tx.sdTicketType.updateMany({ where: { organizationId: org, deskId, id }, data: dto });
          if (!res.count) throw new NotFoundException('No such ticket type.');
        } else {
          id = (await tx.sdTicketType.create({ data: { organizationId: org, deskId, ...(dto as TicketTypeDto) } })).id;
        }
        await audit(tx, a, typeId ? 'desk.type.updated' : 'desk.type.created', 'sd_ticket_type', id, { deskId, ...dto });
        return { id };
      });
    } catch (e) {
      uniqueViolation(e, 'A ticket type with that name already exists on this desk.');
    }
  }

  async saveStatus(a: DeskActor, deskId: string, statusId: string | null, dto: StatusDto | UpdateStatusDto) {
    requireSetUp(a, deskId, 'desk.settings.manage');
    const org = a.ctx.organizationId;
    try {
      return await this.tx(a, async (tx) => {
        await this.desk(tx, a, deskId);
        let id = statusId;
        if (id) {
          const res = await tx.sdStatus.updateMany({ where: { organizationId: org, deskId, id }, data: dto as UpdateStatusDto });
          if (!res.count) throw new NotFoundException('No such status.');
          if ((dto as UpdateStatusDto).active === false) await this.keepOneStatusPerState(tx, org, deskId, id);
        } else {
          const s = dto as StatusDto;
          if (s.ticketTypeId && !(await tx.sdTicketType.findFirst({ where: { organizationId: org, deskId, id: s.ticketTypeId }, select: { id: true } }))) throw new BadRequestException('No such ticket type on this desk.');
          id = (await tx.sdStatus.create({ data: { organizationId: org, deskId, label: s.label, systemState: s.systemState, ticketTypeId: s.ticketTypeId ?? null, sortOrder: s.sortOrder ?? 0 } })).id;
        }
        await audit(tx, a, statusId ? 'desk.status.updated' : 'desk.status.created', 'sd_status', id, { deskId, ...dto });
        return { id };
      });
    } catch (e) {
      uniqueViolation(e, 'A status with that name already exists.');
    }
  }

  /** New and solved states must always have a label, or tickets could not be raised or resolved. */
  private async keepOneStatusPerState(tx: Tx, org: string, deskId: string, id: string) {
    const s = await tx.sdStatus.findFirstOrThrow({ where: { organizationId: org, id } });
    if (!['new', 'open', 'solved', 'closed'].includes(s.systemState)) return;
    const left = await tx.sdStatus.count({ where: { organizationId: org, deskId, systemState: s.systemState, active: true, ticketTypeId: null } });
    if (left === 0) throw new BadRequestException('Keep at least one status for every main state (new, open, resolved, closed).');
  }

  async saveMatrix(a: DeskActor, deskId: string, dto: MatrixDto) {
    requireSetUp(a, deskId, 'desk.settings.manage');
    const org = a.ctx.organizationId;
    return this.tx(a, async (tx) => {
      await this.desk(tx, a, deskId);
      for (const c of dto.cells) {
        await tx.sdPriorityMatrix.upsert({ where: { deskId_impact_urgency: { deskId, impact: c.impact, urgency: c.urgency } }, update: { priority: c.priority }, create: { organizationId: org, deskId, ...c } });
      }
      await audit(tx, a, 'desk.matrix.updated', 'sd_desk', deskId, { cells: dto.cells });
      return { saved: dto.cells.length };
    });
  }

  // ------------------------------------------------------------------------------------------ saved replies, scenarios

  /** The desk's saved replies and the person's own. */
  async cannedList(a: DeskActor, deskId: string) {
    if (!a.roles.has(deskId) && !has(a, 'desk.desk.create')) throw new NotFoundException('No such desk.');
    return this.tx(a, (tx) =>
      tx.sdCannedResponse.findMany({
        where: { organizationId: a.ctx.organizationId, deskId, OR: [{ ownerUserId: null }, { ownerUserId: a.userId }] },
        select: { id: true, title: true, bodyHtml: true, ownerUserId: true, active: true },
        orderBy: { title: 'asc' },
      }),
    ).then((rows) => rows.map((r) => ({ ...r, personal: r.ownerUserId !== null, ownerUserId: undefined })));
  }

  /** personal = an agent's own reply (needs a seat); otherwise the desk's (desk admin). */
  async saveCanned(a: DeskActor, deskId: string, id: string | null, dto: CannedResponseDto, personal: boolean) {
    if (personal) requireWork(a, deskId);
    else requireSetUp(a, deskId, 'desk.settings.manage');
    const org = a.ctx.organizationId;
    const bodyHtml = cleanHtml(dto.bodyHtml);
    if (!htmlToText(bodyHtml)) throw new BadRequestException('Write the reply text.');
    return this.tx(a, async (tx) => {
      const owner = personal ? a.userId : null;
      let rowId = id;
      if (rowId) {
        const res = await tx.sdCannedResponse.updateMany({ where: { organizationId: org, deskId, id: rowId, ownerUserId: owner }, data: { title: dto.title, bodyHtml, active: dto.active ?? true } });
        if (!res.count) throw new NotFoundException('No such saved reply.');
      } else {
        rowId = (await tx.sdCannedResponse.create({ data: { organizationId: org, deskId, ownerUserId: owner, title: dto.title, bodyHtml, active: dto.active ?? true, createdBy: a.userId } })).id;
      }
      await audit(tx, a, id ? 'desk.canned.updated' : 'desk.canned.created', 'sd_canned_response', rowId, { deskId, title: dto.title, personal });
      return { id: rowId };
    });
  }

  async saveScenario(a: DeskActor, deskId: string, id: string | null, dto: ScenarioDto) {
    requireSetUp(a, deskId, 'desk.settings.manage');
    const org = a.ctx.organizationId;
    const actions = { ...dto.actions, ...(dto.actions.note ? { note: cleanHtml(dto.actions.note) } : {}), ...(dto.actions.reply ? { reply: cleanHtml(dto.actions.reply) } : {}) };
    try {
      return await this.tx(a, async (tx) => {
        await this.desk(tx, a, deskId);
        if (actions.statusId && !(await tx.sdStatus.findFirst({ where: { organizationId: org, deskId, id: actions.statusId }, select: { id: true } }))) throw new BadRequestException('No such status on this desk.');
        if (actions.groupId && !(await tx.sdGroup.findFirst({ where: { organizationId: org, deskId, id: actions.groupId }, select: { id: true } }))) throw new BadRequestException('No such group on this desk.');
        let rowId = id;
        const data = { name: dto.name, actions: actions as Prisma.InputJsonValue, active: dto.active ?? true };
        if (rowId) {
          const res = await tx.sdScenario.updateMany({ where: { organizationId: org, deskId, id: rowId }, data });
          if (!res.count) throw new NotFoundException('No such scenario.');
        } else {
          rowId = (await tx.sdScenario.create({ data: { organizationId: org, deskId, ...data, createdBy: a.userId } })).id;
        }
        await audit(tx, a, id ? 'desk.scenario.updated' : 'desk.scenario.created', 'sd_scenario', rowId, { deskId, name: dto.name });
        return { id: rowId };
      });
    } catch (e) {
      uniqueViolation(e, 'A scenario with that name already exists on this desk.');
    }
  }

  // ------------------------------------------------------------------------------------------ calendars (SD-1.02)

  private requireCalendarRights(a: DeskActor) {
    // Calendars are shared company-wide: Service Desk admins, or a desk admin of any desk.
    if (!has(a, 'desk.sla.manage') || !(has(a, 'desk.desk.create') || [...a.roles.values()].includes('admin'))) throw new ForbiddenException('You cannot change business calendars.');
  }

  async calendars(a: DeskActor) {
    if (!has(a, 'desk.sla.manage') && !a.roles.size) throw new ForbiddenException('You cannot see business calendars.');
    const org = a.ctx.organizationId;
    return this.tx(a, async (tx) => {
      const cals = await tx.businessCalendar.findMany({ where: { organizationId: org }, orderBy: { name: 'asc' } });
      const hours = await tx.businessCalendarHours.findMany({ where: { organizationId: org }, orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }] });
      const holidays = await tx.businessCalendarHoliday.findMany({ where: { organizationId: org }, orderBy: { holidayOn: 'asc' } });
      return cals.map((c) => ({
        id: c.id,
        name: c.name,
        timeZone: c.timeZone,
        version: c.version,
        hours: hours.filter((h) => h.calendarId === c.id).map((h) => ({ id: h.id, weekday: h.weekday, startMinute: h.startMinute, endMinute: h.endMinute, validFrom: iso(h.validFrom), validTo: iso(h.validTo) })),
        holidays: holidays.filter((h) => h.calendarId === c.id).map((h) => ({ id: h.id, on: iso(h.holidayOn), name: h.name, halfDay: h.halfDay })),
      }));
    });
  }

  private checkHours(hours: { weekday: number; startMinute: number; endMinute: number }[]) {
    for (const h of hours) if (h.endMinute <= h.startMinute) throw new BadRequestException('Each working slot must end after it starts.');
  }

  async createCalendar(a: DeskActor, dto: CalendarDto) {
    this.requireCalendarRights(a);
    if (!isValidZone(dto.timeZone)) throw new BadRequestException('Unknown time zone.');
    this.checkHours(dto.hours);
    const org = a.ctx.organizationId;
    try {
      return await this.tx(a, async (tx) => {
        const cal = await tx.businessCalendar.create({ data: { organizationId: org, name: dto.name, timeZone: dto.timeZone, createdBy: a.userId } });
        await tx.businessCalendarHours.createMany({ data: dto.hours.map((h) => ({ organizationId: org, calendarId: cal.id, ...h, validFrom: day(todayIst()), createdBy: a.userId })) });
        if (dto.holidays?.length) await tx.businessCalendarHoliday.createMany({ data: dto.holidays.map((h) => ({ organizationId: org, calendarId: cal.id, holidayOn: day(h.on), name: h.name, halfDay: h.halfDay ?? false, createdBy: a.userId })) });
        await audit(tx, a, 'desk.calendar.created', 'business_calendar', cal.id, { name: dto.name, timeZone: dto.timeZone });
        return { id: cal.id };
      });
    } catch (e) {
      uniqueViolation(e, 'A calendar with that name exists, or two working slots overlap.');
    }
  }

  async updateCalendar(a: DeskActor, id: string, dto: UpdateCalendarDto) {
    this.requireCalendarRights(a);
    if (dto.timeZone && !isValidZone(dto.timeZone)) throw new BadRequestException('Unknown time zone.');
    const org = a.ctx.organizationId;
    return this.tx(a, async (tx) => {
      const { version, ...fields } = dto;
      const res = await tx.businessCalendar.updateMany({ where: { organizationId: org, id, version }, data: { ...fields, version: { increment: 1 } } });
      if (!res.count) throw new ConflictException('Someone else changed this calendar, or it does not exist. Reload.');
      await audit(tx, a, 'desk.calendar.updated', 'business_calendar', id, fields);
      return { id };
    });
  }

  /** §5.6: new hours from a date; hours in force before it are closed the day before, never rewritten. */
  async setHours(a: DeskActor, id: string, dto: CalendarHoursDto) {
    this.requireCalendarRights(a);
    this.checkHours(dto.hours);
    const today = todayIst();
    if (dto.effectiveFrom < today) throw new BadRequestException('New hours start today or later; past hours stay as they were.');
    const org = a.ctx.organizationId;
    try {
      return await this.tx(a, async (tx) => {
        if (!(await tx.businessCalendar.findFirst({ where: { organizationId: org, id }, select: { id: true } }))) throw new NotFoundException('No such calendar.');
        const from = day(dto.effectiveFrom);
        // Rows that would only start on or after the date are replaced; rows running across it are closed.
        await tx.businessCalendarHours.deleteMany({ where: { organizationId: org, calendarId: id, validFrom: { gte: from, gt: day(today) } } });
        await tx.businessCalendarHours.updateMany({ where: { organizationId: org, calendarId: id, validFrom: { lt: from }, OR: [{ validTo: null }, { validTo: { gte: from } }] }, data: { validTo: day(addDays(dto.effectiveFrom, -1)) } });
        const sameDay = await tx.businessCalendarHours.count({ where: { organizationId: org, calendarId: id, validFrom: from } });
        if (sameDay) throw new BadRequestException('Hours already started today; change them from tomorrow.');
        await tx.businessCalendarHours.createMany({ data: dto.hours.map((h) => ({ organizationId: org, calendarId: id, ...h, validFrom: from, createdBy: a.userId })) });
        await tx.businessCalendar.update({ where: { id }, data: { version: { increment: 1 } } });
        await audit(tx, a, 'desk.calendar.hours_changed', 'business_calendar', id, { effectiveFrom: dto.effectiveFrom, hours: dto.hours });
        return { id };
      });
    } catch (e) {
      uniqueViolation(e, 'Two working slots on the same day overlap.');
    }
  }

  async addHoliday(a: DeskActor, id: string, dto: HolidayDto) {
    this.requireCalendarRights(a);
    const org = a.ctx.organizationId;
    try {
      return await this.tx(a, async (tx) => {
        if (!(await tx.businessCalendar.findFirst({ where: { organizationId: org, id }, select: { id: true } }))) throw new NotFoundException('No such calendar.');
        const h = await tx.businessCalendarHoliday.create({ data: { organizationId: org, calendarId: id, holidayOn: day(dto.on), name: dto.name, halfDay: dto.halfDay ?? false, createdBy: a.userId } });
        await audit(tx, a, 'desk.calendar.holiday_added', 'business_calendar', id, { ...dto });
        return { id: h.id };
      });
    } catch (e) {
      uniqueViolation(e, 'That day is already a holiday in this calendar.');
    }
  }

  async removeHoliday(a: DeskActor, id: string, holidayId: string) {
    this.requireCalendarRights(a);
    const org = a.ctx.organizationId;
    return this.tx(a, async (tx) => {
      const h = await tx.businessCalendarHoliday.findFirst({ where: { organizationId: org, calendarId: id, id: holidayId } });
      if (!h) throw new NotFoundException('No such holiday.');
      await tx.businessCalendarHoliday.delete({ where: { id: h.id } });
      await audit(tx, a, 'desk.calendar.holiday_removed', 'business_calendar', id, { on: iso(h.holidayOn), name: h.name });
      return { removed: true };
    });
  }

  // ------------------------------------------------------------------------------------------ requesters, agents

  /** US-G-004: VIP requesters, company-wide (Service Desk admin). */
  async setVip(a: DeskActor, personId: string, dto: VipDto) {
    if (!has(a, 'desk.desk.create')) throw new ForbiddenException('Only a Service Desk admin marks VIPs.');
    const org = a.ctx.organizationId;
    return this.tx(a, async (tx) => {
      if (!(await tx.person.findFirst({ where: { organizationId: org, id: personId }, select: { id: true } }))) throw new NotFoundException('No such person.');
      await tx.sdRequesterFlag.upsert({ where: { organizationId_personId: { organizationId: org, personId } }, update: { vip: dto.vip, note: dto.note ?? null, updatedBy: a.userId }, create: { organizationId: org, personId, vip: dto.vip, note: dto.note ?? null, updatedBy: a.userId } });
      await audit(tx, a, 'desk.requester.vip_changed', 'person', personId, { vip: dto.vip });
      return { vip: dto.vip };
    });
  }

  /** US-G-011: an agent's own away status and shift. */
  async myStatus(a: DeskActor) {
    return this.tx(a, (tx) => tx.sdAgentStatus.findUnique({ where: { organizationId_userId: { organizationId: a.ctx.organizationId, userId: a.userId } } })).then(
      (s) => s ?? { status: 'available', awayUntil: null, shiftStartMinute: null, shiftEndMinute: null, shiftDays: [1, 2, 3, 4, 5], shiftTimeZone: null },
    );
  }

  async setMyStatus(a: DeskActor, dto: AgentStatusDto) {
    if (!has(a, 'desk.ticket.work') || ![...a.roles.values()].some((r) => r === 'agent' || r === 'lead')) throw new ForbiddenException('Only agents set an away status.');
    const shift = dto.shiftStartMinute != null || dto.shiftEndMinute != null;
    if (shift && (dto.shiftStartMinute == null || dto.shiftEndMinute == null || !dto.shiftTimeZone || !isValidZone(dto.shiftTimeZone))) throw new BadRequestException('A shift needs a start, an end and a time zone.');
    const data = {
      status: dto.status,
      awayUntil: dto.status === 'away' && dto.awayUntil ? new Date(dto.awayUntil) : null,
      shiftStartMinute: shift ? dto.shiftStartMinute! : null,
      shiftEndMinute: shift ? dto.shiftEndMinute! : null,
      shiftTimeZone: shift ? dto.shiftTimeZone! : null,
      ...(dto.shiftDays ? { shiftDays: dto.shiftDays } : {}),
    };
    const org = a.ctx.organizationId;
    return this.tx(a, async (tx) => {
      const s = await tx.sdAgentStatus.upsert({ where: { organizationId_userId: { organizationId: org, userId: a.userId } }, update: data, create: { organizationId: org, userId: a.userId, ...data } });
      await audit(tx, a, 'desk.agent.status_changed', 'user', a.userId, { status: s.status, awayUntil: s.awayUntil, shift });
      return s;
    });
  }
}
