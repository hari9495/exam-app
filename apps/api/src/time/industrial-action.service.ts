import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { Viewer, buildViewer, tenantWide, type ScopeUser } from '../access/scope';
import { DayEngine } from './day-engine.service';
import { EventDatesDto, IndustrialActionDto } from './ops-dto';
import { ScheduleBook } from './schedule';
import { TIME_KEYS, asDate, dateOf } from './time-core';
import { addDays, daysBetween } from './time-maths';

// TIM-37 industrial action (29 Oct 2026): HR records a strike, lockout or lay-off at one establishment (a location,
// optionally one department there). Its days are marked with the kind (not absence or leave; weekly offs, holidays and
// approved leave inside stay; someone who checked in worked). The payroll feed pays them by kind and legality
// (time-rules industrialPay): strike unpaid; lockout unpaid when legal, full wages when illegal; lay-off paid as lay-off
// compensation by payroll when legal, full wages when illegal; undetermined: held. Who: attendance.lock over the legal
// entity (the people who close its months), never while acting for someone else. Months already frozen or locked are
// never rewritten: a change touching them is refused (corrections go to the next payroll).

const LABEL = { strike: 'Strike', lockout: 'Lockout', layoff: 'Lay-off' } as const;
const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

@Injectable()
export class IndustrialActionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly days: DayEngine,
  ) {}

  private async viewer(user: ScopeUser): Promise<Viewer> {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, [...TIME_KEYS]);
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    return v;
  }

  private covers(v: Viewer, entityId: string) {
    return tenantWide(v, 'attendance.lock') || (v.scopes.get('attendance.lock') ?? []).some((s) => s.type === 'legal_entity' && s.id === entityId);
  }

  /** People assigned to the place on any day of the range. */
  private people(tx: Tx, org: string, locationId: string, departmentId: string | null, from: string, to: string) {
    return tx.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT a.employee_id::text AS id FROM employee_assignments a
      JOIN employments m ON m.organization_id = a.organization_id AND m.id = a.employment_id AND m.joined_on <= ${to}::date AND (m.exited_on IS NULL OR m.exited_on >= ${from}::date)
      WHERE a.organization_id = ${org}::uuid AND a.superseded_at IS NULL AND a.location_id = ${locationId}::uuid
        AND (${departmentId}::uuid IS NULL OR a.department_id = ${departmentId}::uuid)
        AND daterange(a.valid_from, a.valid_to, '[]') && daterange(${from}::date, ${to}::date, '[]')`;
  }

  /** Refuses a change touching a frozen, locked or filed month of the entity. */
  private async assertOpen(tx: Tx, org: string, entityId: string, from: string, to: string) {
    const closed = await tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId: entityId, payGroupId: null, stage: { not: 'open' }, periodStart: { gte: asDate(`${from.slice(0, 7)}-01`), lte: asDate(`${to.slice(0, 7)}-01`) } }, orderBy: { periodStart: 'asc' } });
    if (closed) throw new ConflictException({ statusCode: 409, code: 'PERIOD_LOCKED', message: `${new Date(closed.periodStart).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })} is ${closed.stage}, so its days can't change. Record corrections for the next payroll instead.` });
  }

  /** Works the days out again for everyone the event touches (up to today; later days follow as they come). */
  private async reevaluate(tx: Tx, c: CompanyContext, ids: string[], from: string, to: string) {
    const last = to < todayIst() ? to : todayIst();
    if (last < from) return;
    const book = await ScheduleBook.load(tx, c.organizationId);
    for (const id of ids) await this.days.evaluate(tx, c, id, from, last, new Date(), book);
  }

  private async view(tx: Tx, org: string, e: Awaited<ReturnType<Tx['industrialActionEvent']['findFirstOrThrow']>>) {
    const [loc, dept, setter, people] = await Promise.all([
      tx.location.findFirst({ where: { organizationId: org, id: e.locationId }, select: { name: true, state: true } }),
      e.departmentId ? tx.department.findFirst({ where: { organizationId: org, id: e.departmentId }, select: { name: true } }) : null,
      e.legalitySetBy ? tx.user.findFirst({ where: { organizationId: org, id: e.legalitySetBy }, select: { name: true, email: true } }) : null,
      this.people(tx, org, e.locationId, e.departmentId, dateOf(e.fromOn), dateOf(e.toOn)),
    ]);
    return { id: e.id, kind: e.kind, from: dateOf(e.fromOn), to: dateOf(e.toOn), days: daysBetween(dateOf(e.fromOn), dateOf(e.toOn)) + 1, location: { id: e.locationId, name: loc?.name ?? '', state: loc?.state ?? '' }, department: e.departmentId ? { id: e.departmentId, name: dept?.name ?? '' } : null, workers: people.length, legality: e.legality, legalitySetAt: e.legalitySetAt, legalitySetBy: setter ? setter.name || setter.email : null, notice: e.notice, status: e.status, version: e.version, today: todayIst() };
  }

  /** The form's choices: establishments in scope, each with its departments and how many people work there today. */
  async options(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const today = todayIst();
      const rows = await tx.$queryRaw<{ locationId: string; location: string; state: string; entityId: string; departmentId: string; department: string; people: number }[]>`
        SELECT l.id::text AS "locationId", l.name::text AS location, l.state, l.legal_entity_id::text AS "entityId", d.id::text AS "departmentId", d.name::text AS department, count(DISTINCT a.employee_id)::int AS people
        FROM employee_assignments a JOIN locations l ON l.organization_id = a.organization_id AND l.id = a.location_id
        JOIN departments d ON d.organization_id = a.organization_id AND d.id = a.department_id
        JOIN employments m ON m.organization_id = a.organization_id AND m.id = a.employment_id AND (m.exited_on IS NULL OR m.exited_on >= ${today}::date)
        WHERE a.organization_id = ${c.organizationId}::uuid AND a.superseded_at IS NULL AND ${today}::date <@ daterange(a.valid_from, a.valid_to, '[]') AND l.archived_at IS NULL
        GROUP BY 1, 2, 3, 4, 5, 6 ORDER BY 2, 6`;
      const out = new Map<string, { id: string; name: string; state: string; people: number; departments: { id: string; name: string; people: number }[] }>();
      for (const r of rows.filter((x) => this.covers(v, x.entityId))) {
        const l = out.get(r.locationId) ?? { id: r.locationId, name: r.location, state: r.state, people: 0, departments: [] };
        l.people += r.people;
        l.departments.push({ id: r.departmentId, name: r.department, people: r.people });
        out.set(r.locationId, l);
      }
      return { today, locations: [...out.values()] };
    });
  }

  /** Past and current events in scope, newest first, one page at a time (founder decision 7b: "Past strikes and lockouts"). */
  async list(ctx: TenantContext, user: ScopeUser, page = 1, pageSize = 25) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const entities = tenantWide(v, 'attendance.lock') ? null : (v.scopes.get('attendance.lock') ?? []).flatMap((x) => (x.type === 'legal_entity' && x.id ? [x.id] : []));
      const where = { organizationId: c.organizationId, ...(entities ? { legalEntityId: { in: entities } } : {}) };
      const [total, rows] = await Promise.all([
        tx.industrialActionEvent.count({ where }),
        tx.industrialActionEvent.findMany({ where, orderBy: [{ fromOn: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      ]);
      return { events: await Promise.all(rows.map((e) => this.view(tx, c.organizationId, e))), total, page, pageSize, today: todayIst() };
    });
  }

  async get(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const e = await tx.industrialActionEvent.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!e || !this.covers(v, e.legalEntityId)) throw new NotFoundException('Not found');
      return this.view(tx, c.organizationId, e);
    });
  }

  async create(ctx: TenantContext, user: ScopeUser, dto: IndustrialActionDto) {
    const v = await this.viewer(user);
    if (dto.to < dto.from) throw new BadRequestException('"To" must be on or after "From".');
    if (daysBetween(dto.from, dto.to) >= 366) throw new BadRequestException('An event is at most a year long. Record a new one after that.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const loc = await tx.location.findFirst({ where: { organizationId: org, id: dto.locationId }, select: { id: true, legalEntityId: true, name: true } });
      if (!loc || !this.covers(v, loc.legalEntityId)) throw new NotFoundException('No such establishment in your scope.');
      if (dto.departmentId && !(await tx.department.findFirst({ where: { organizationId: org, id: dto.departmentId }, select: { id: true } }))) throw new NotFoundException('No such department in this company.');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ia:${org}:${dto.locationId}`}))`;
      await this.assertOpen(tx, org, loc.legalEntityId, dto.from, dto.to);
      const clash = await tx.industrialActionEvent.findFirst({ where: { organizationId: org, locationId: dto.locationId, status: 'active', fromOn: { lte: asDate(dto.to) }, toOn: { gte: asDate(dto.from) }, ...(dto.departmentId ? { OR: [{ departmentId: null }, { departmentId: dto.departmentId }] } : {}) } });
      if (clash) throw new ConflictException(`A ${LABEL[clash.kind as keyof typeof LABEL].toLowerCase()} is already recorded there from ${fmt(dateOf(clash.fromOn))} to ${fmt(dateOf(clash.toOn))}. Change its dates instead.`);
      const people = await this.people(tx, org, dto.locationId, dto.departmentId ?? null, dto.from, dto.to);
      if (!people.length) throw new BadRequestException('No one works there on those days.');
      const set = dto.legality !== 'undetermined';
      const e = await tx.industrialActionEvent.create({ data: { organizationId: org, legalEntityId: loc.legalEntityId, locationId: dto.locationId, departmentId: dto.departmentId ?? null, kind: dto.kind, fromOn: asDate(dto.from), toOn: asDate(dto.to), legality: dto.legality, legalitySetAt: set ? new Date() : null, legalitySetBy: set ? c.userId : null, notice: dto.notice, createdBy: c.userId! } });
      await this.reevaluate(tx, c, people.map((p) => p.id), dto.from, dto.to);
      await audit(tx, c, 'time.industrial_action.recorded', 'industrial_action_event', e.id, { kind: dto.kind, locationId: dto.locationId, departmentId: dto.departmentId ?? null, from: dto.from, to: dto.to, legality: dto.legality, notice: dto.notice, workers: people.length });
      return this.view(tx, org, e);
    });
  }

  /** Sets or changes the legality (version-checked: two HR people at once, the second is told). */
  async legality(ctx: TenantContext, user: ScopeUser, id: string, legality: 'legal' | 'illegal' | 'undetermined', version: number) {
    return this.change(ctx, user, id, version, async (tx, c, e) => {
      if (e.legality === legality) throw new BadRequestException('Pick a different legality.');
      await this.assertOpen(tx, c.organizationId, e.legalEntityId, dateOf(e.fromOn), dateOf(e.toOn));
      const set = legality !== 'undetermined';
      await audit(tx, c, 'time.industrial_action.legality', 'industrial_action_event', e.id, { before: e.legality, after: legality });
      return { legality, legalitySetAt: set ? new Date() : null, legalitySetBy: set ? c.userId : null };
    });
  }

  /** New dates: an upcoming event can't start in the past; a running one keeps its start and can't end before today. */
  async dates(ctx: TenantContext, user: ScopeUser, id: string, dto: EventDatesDto) {
    if (dto.to < dto.from) throw new BadRequestException('"To" must be on or after "From".');
    return this.change(ctx, user, id, dto.version, async (tx, c, e) => {
      const today = todayIst();
      const from = dateOf(e.fromOn);
      const to = dateOf(e.toOn);
      if (to < today) throw new ConflictException('The event has ended, so its dates stay.');
      if (from <= today && dto.from !== from) throw new BadRequestException('The event has started, so its start date stays.');
      if (from > today && dto.from < today) throw new BadRequestException('The start date has passed. Pick today or later.');
      if (dto.to < today) throw new BadRequestException('The end date has passed. Pick today or later.');
      if (daysBetween(dto.from, dto.to) >= 366) throw new BadRequestException('An event is at most a year long.');
      const lo = dto.from < from ? dto.from : from;
      const hi = dto.to > to ? dto.to : to;
      await this.assertOpen(tx, c.organizationId, e.legalEntityId, lo, hi);
      const clash = await tx.industrialActionEvent.findFirst({ where: { organizationId: c.organizationId, id: { not: e.id }, locationId: e.locationId, status: 'active', fromOn: { lte: asDate(dto.to) }, toOn: { gte: asDate(dto.from) }, ...(e.departmentId ? { OR: [{ departmentId: null }, { departmentId: e.departmentId }] } : {}) } });
      if (clash) throw new ConflictException('Those dates overlap another event at the same place.');
      await audit(tx, c, 'time.industrial_action.dates', 'industrial_action_event', e.id, { before: { from, to }, after: { from: dto.from, to: dto.to } });
      return { fromOn: asDate(dto.from), toOn: asDate(dto.to), reevaluate: [lo, hi] as [string, string] };
    });
  }

  /** Cancels an event that has not ended: its days go back to normal attendance. */
  async cancel(ctx: TenantContext, user: ScopeUser, id: string, version: number) {
    return this.change(ctx, user, id, version, async (tx, c, e) => {
      if (dateOf(e.toOn) < todayIst()) throw new ConflictException('The event has ended, so it stays on record.');
      await this.assertOpen(tx, c.organizationId, e.legalEntityId, dateOf(e.fromOn), dateOf(e.toOn));
      await audit(tx, c, 'time.industrial_action.cancelled', 'industrial_action_event', e.id, { kind: e.kind, from: dateOf(e.fromOn), to: dateOf(e.toOn) });
      return { status: 'cancelled', reevaluate: [dateOf(e.fromOn), dateOf(e.toOn)] as [string, string] };
    });
  }

  private async change(
    ctx: TenantContext,
    user: ScopeUser,
    id: string,
    version: number,
    fn: (tx: Tx, c: CompanyContext, e: Awaited<ReturnType<Tx['industrialActionEvent']['findFirstOrThrow']>>) => Promise<Record<string, unknown> & { reevaluate?: [string, string] }>,
  ) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const e = await tx.industrialActionEvent.findFirst({ where: { organizationId: org, id } });
      if (!e || !this.covers(v, e.legalEntityId)) throw new NotFoundException('Not found');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ia:${org}:${e.locationId}`}))`;
      const fresh = await tx.industrialActionEvent.findFirstOrThrow({ where: { id } });
      if (fresh.status !== 'active') throw new ConflictException('The event was cancelled.');
      if (fresh.version !== version) throw new ConflictException({ statusCode: 409, code: 'STALE', message: 'Someone else changed this event just now. Reload it and try again.' });
      const { reevaluate, ...data } = await fn(tx, c, fresh);
      const saved = await tx.industrialActionEvent.update({ where: { id }, data: { ...data, version: { increment: 1 }, updatedAt: new Date() } });
      if (reevaluate) {
        const people = await this.people(tx, org, e.locationId, e.departmentId, reevaluate[0], reevaluate[1]);
        await this.reevaluate(tx, c, people.map((p) => p.id), reevaluate[0], addDays(reevaluate[1], 0));
      }
      return this.view(tx, org, saved);
    });
  }
}
