import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { buildViewer, covers, grantPeriods } from '../access/scope';
import { CompanyContext, Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { AutomationService } from '../rules-engine/automation.service';
import { Group, RuleError, evaluate, parseGroup } from '../rules-engine/conditions';
import { REQUESTER_FIELDS } from '../rules-engine/forms';
import { CatalogService } from './catalog.service';
import { DeskActor, audit, emit, has, requireSetUp } from './desk-access';
import { profileOf } from './people-facts';
import { textToHtml } from './rich-text';
import { TicketsService } from './tickets.service';

// SD-2.08 (US-B-127, US-G-049): joiner and leaver journeys. A journey is a list of catalogue items (each a bundle with
// its own teams and OLAs, batch 1) and an optional audience (department, location, legal entity, cost centre). When M01
// says someone joins (outbox event employee.joined), every active joiner journey whose audience holds starts: one request
// per desk, one item per line, fulfilment straight away (the hire was already approved in HR) with every task due before
// the first day (or after its OLA if that day is near). A leaver journey starts from employee.exit_scheduled (M01's exit
// flow, when it lands) or by hand from HR (request.raise_on_behalf over that person). Each journey starts once per
// person and date.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
type Journey = Prisma.SdJourneyGetPayload<object>;

@Injectable()
export class JourneysService implements OnModuleInit {
  private readonly logger = new Logger(JourneysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly automation: AutomationService,
    private readonly catalog: CatalogService,
    private readonly tickets: TicketsService,
  ) {}

  // DECISION NEEDED: M01 has no exit flow yet (employee.exit_scheduled is the agreed event name), and a changed joining
  // date does not move task due dates yet (US-B-127 third line): both need M01 events that do not exist today.
  onModuleInit() {
    this.automation.subscribe(async (ev) => {
      if (ev.type !== 'employee.joined' && ev.type !== 'employee.exit_scheduled') return;
      const employeeId = typeof ev.payload.employeeId === 'string' && UUID.test(ev.payload.employeeId) ? ev.payload.employeeId : null;
      const date = String(ev.type === 'employee.joined' ? ev.payload.joinedOn : ev.payload.lastDay);
      if (!employeeId || !ISO.test(date)) return;
      await this.startAll({ organizationId: ev.organizationId, isSuperAdmin: false }, ev.type === 'employee.joined' ? 'join' : 'exit', employeeId, date, null);
    });
  }

  private tx<T>(ctx: CompanyContext, fn: (tx: Tx) => Promise<T>) {
    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      // The journey's own steps reach every desk it touches (§5.7 desk system work); people read through their session.
      await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
      return fn(tx);
    });
  }

  // ------------------------------------------------------------------------------------------ set-up

  /** Journeys are set up by whoever may set up the catalogue of every desk they reach. */
  private async checkItems(tx: Tx, a: DeskActor, itemIds: string[]) {
    const items = await tx.sdCatalogItem.findMany({ where: { organizationId: a.ctx.organizationId, id: { in: itemIds }, state: 'published' } });
    if (items.length !== new Set(itemIds).size) throw new BadRequestException('Choose published catalogue items.');
    for (const i of items) requireSetUp(a, i.deskId, 'desk.catalog.manage');
    return items;
  }

  private audience(x: unknown): Group | null {
    if (x === undefined || x === null) return null;
    try {
      const g = parseGroup(x, REQUESTER_FIELDS);
      return g.items.length ? g : null;
    } catch (e) {
      if (e instanceof RuleError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  async list(a: DeskActor) {
    if (!has(a, 'desk.catalog.manage')) throw new ForbiddenException('You need the catalogue right (desk.catalog.manage).');
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const org = a.ctx.organizationId;
      const rows = await tx.sdJourney.findMany({ where: { organizationId: org }, orderBy: [{ kind: 'asc' }, { name: 'asc' }] });
      const items = await tx.sdCatalogItem.findMany({ where: { organizationId: org, state: 'published' }, select: { id: true, name: true, deskId: true, journeyOnly: true }, orderBy: { name: 'asc' } });
      const runs = await tx.sdJourneyRun.findMany({ where: { organizationId: org }, orderBy: { createdAt: 'desc' }, take: 20 });
      return { journeys: rows.map((j) => ({ id: j.id, kind: j.kind, name: j.name, itemIds: j.itemIds, audience: j.audience, active: j.active, version: j.version })), items, recent: runs.map((r) => ({ journeyId: r.journeyId, employeeId: r.employeeId, date: r.eventDate.toISOString().slice(0, 10), tickets: r.ticketIds.length, at: r.createdAt })) };
    });
  }

  async save(a: DeskActor, id: string | null, dto: { kind?: 'join' | 'exit'; name?: string; itemIds?: string[]; audience?: unknown; active?: boolean; version?: number }) {
    if (!has(a, 'desk.catalog.manage')) throw new ForbiddenException('You need the catalogue right (desk.catalog.manage).');
    try {
      return await this.tenantPrisma.forTenant(a.ctx, async (tx) => {
        const org = a.ctx.organizationId;
        if (dto.itemIds) await this.checkItems(tx, a, dto.itemIds);
        const audience = dto.audience === undefined ? undefined : this.audience(dto.audience);
        if (!id) {
          if (!dto.itemIds?.length) throw new BadRequestException('Choose what the journey orders.');
          const j = await tx.sdJourney.create({ data: { organizationId: org, kind: dto.kind!, name: dto.name!, itemIds: [...new Set(dto.itemIds)], audience: (audience ?? Prisma.DbNull) as unknown as Prisma.InputJsonValue, createdBy: a.userId } });
          await audit(tx, a, 'desk.journey.created', 'sd_journey', j.id, { kind: j.kind, name: j.name, itemIds: j.itemIds });
          return { id: j.id, version: j.version };
        }
        const j = await tx.sdJourney.findFirst({ where: { organizationId: org, id } });
        if (!j) throw new NotFoundException('No such journey.');
        await this.checkItems(tx, a, j.itemIds);
        const res = await tx.sdJourney.updateMany({
          where: { id, version: dto.version },
          data: { name: dto.name, active: dto.active, ...(dto.itemIds ? { itemIds: [...new Set(dto.itemIds)] } : {}), ...(audience !== undefined ? { audience: (audience ?? Prisma.DbNull) as unknown as Prisma.InputJsonValue } : {}), version: { increment: 1 }, updatedAt: new Date() },
        });
        if (!res.count) throw new ConflictException('Someone changed this journey. Reload to see the latest.');
        await audit(tx, a, 'desk.journey.saved', 'sd_journey', id, { name: dto.name, itemIds: dto.itemIds, active: dto.active });
        return { id, version: (dto.version ?? 0) + 1 };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('A journey with that name exists.');
      throw e;
    }
  }

  /** HR starts a journey by hand (a leaver, or a joiner added before this desk existed): raise-on-behalf over them. */
  async startByHand(a: DeskActor, journeyId: string, dto: { employeeId: string; date: string }) {
    const org = a.ctx.organizationId;
    const ok = await this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const emp = await tx.employee.findFirst({ where: { organizationId: org, id: dto.employeeId }, select: { id: true } });
      if (!emp || !a.user) return false;
      const viewer = await buildViewer(this.prisma, this.tenantPrisma, a.user, ['request.raise_on_behalf']);
      const own = (await tx.employee.findFirst({ where: { organizationId: org, userId: a.userId }, select: { id: true } }))?.id ?? null;
      return covers(await grantPeriods(tx, a.ctx, viewer, 'request.raise_on_behalf', emp.id, own), todayIst());
    });
    if (!ok) throw new ForbiddenException('You cannot start requests for this person.');
    const j = await this.tenantPrisma.forTenant(a.ctx, (tx) => tx.sdJourney.findFirst({ where: { organizationId: org, id: journeyId, active: true } }));
    if (!j) throw new NotFoundException('No such journey.');
    const made = await this.start(a.ctx, j, dto.employeeId, dto.date, a.userId);
    if (!made) throw new ConflictException('This journey already started for this person on that date.');
    return made;
  }

  // ------------------------------------------------------------------------------------------ starting

  async startAll(ctx: CompanyContext, kind: 'join' | 'exit', employeeId: string, date: string, by: string | null) {
    const journeys = await this.tenantPrisma.forTenant(ctx, (tx) => tx.sdJourney.findMany({ where: { organizationId: ctx.organizationId, kind, active: true } }));
    const out = [];
    for (const j of journeys) {
      try {
        const r = await this.start(ctx, j, employeeId, date, by);
        if (r) out.push(r);
      } catch (e) {
        this.logger.warn(`journey ${j.name} for ${employeeId}: ${(e as Error).message}`);
      }
    }
    return out;
  }

  /** One journey for one person and date: its requests, or null when it already ran or the audience does not hold. */
  async start(ctx: CompanyContext, j: Journey, employeeId: string, date: string, by: string | null) {
    return this.tx(ctx, async (tx) => {
      const org = ctx.organizationId;
      const emp = await tx.employee.findFirst({ where: { organizationId: org, id: employeeId } });
      if (!emp?.personId) return null;
      const profile = await profileOf(tx, org, emp.personId);
      if (j.audience && !evaluate(j.audience as unknown as Group, profile, REQUESTER_FIELDS).pass) return null;
      // Once per person and date, even when the event and a person start it at the same moment.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sd-journey:${j.id}:${employeeId}:${date}`}))`;
      if (await tx.sdJourneyRun.findFirst({ where: { organizationId: org, journeyId: j.id, employeeId, eventDate: new Date(`${date}T00:00:00Z`) }, select: { id: true } })) return null;
      const name = [emp.preferredName || emp.givenName, emp.familyName].filter(Boolean).join(' ');
      const when = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
      // Everything is due before the first (or last) working day, 9:00 India time; never sooner than an hour from now.
      const dueBy = new Date(Math.max(new Date(`${date}T03:30:00Z`).getTime(), Date.now() + 3_600_000));
      const items = await tx.sdCatalogItem.findMany({ where: { organizationId: org, id: { in: j.itemIds }, state: 'published' } });
      const byDesk = new Map<string, typeof items>();
      for (const i of items) byDesk.set(i.deskId, [...(byDesk.get(i.deskId) ?? []), i]);
      const made: { ticketId: string; number: string }[] = [];
      for (const [deskId, group] of byDesk) {
        const type = (await tx.sdTicketType.findFirst({ where: { organizationId: org, deskId, kind: 'request', active: true }, orderBy: { sortOrder: 'asc' } })) ?? undefined;
        const what = j.kind === 'join' ? `${name} joins on ${when}` : `${name} leaves on ${when}`;
        const t = await this.tickets.createIn(tx, { ctx, userId: by }, {
          deskId,
          typeId: type?.id,
          categoryId: group[0].categoryId ?? undefined,
          subject: `${j.name}: ${name}`.slice(0, 200),
          bodyHtml: textToHtml(`${what}. Prepared by YukthiX from the HR record (${j.name}).\n\n${group.map((i) => `- ${i.name}`).join('\n')}`),
          requesterPersonId: emp.personId,
          openedByUserId: by,
          channel: 'api',
          side: 'requester',
          authorPersonId: null,
          tags: [j.kind === 'join' ? 'joiner' : 'leaver'],
        });
        for (const i of group) {
          const v = await tx.sdCatalogItemVersion.findFirstOrThrow({ where: { organizationId: org, itemId: i.id, version: i.currentVersion! } });
          const ri = await tx.sdRequestItem.create({ data: { organizationId: org, deskId, ticketId: t.id, itemId: i.id, itemVersion: v.version, quantity: 1, answers: {}, forPersonId: emp.personId } });
          await this.catalog.startFulfilment(tx, { ctx }, t, ri, v, dueBy);
        }
        await emit(tx, org, 'helpdesk.journey.started', { ticketId: t.id, deskId, journeyId: j.id, kind: j.kind });
        made.push({ ticketId: t.id, number: t.number });
      }
      await tx.sdJourneyRun.create({ data: { organizationId: org, journeyId: j.id, employeeId, eventDate: new Date(`${date}T00:00:00Z`), ticketIds: made.map((m) => m.ticketId), startedBy: by } });
      await audit(tx, { ctx, userId: by as string }, 'desk.journey.started', 'sd_journey', j.id, { kind: j.kind, employeeId, date, tickets: made.map((m) => m.number) });
      return { journey: j.name, requests: made };
    });
  }
}
