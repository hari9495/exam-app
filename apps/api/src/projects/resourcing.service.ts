import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, CompanyContext, inCompany, Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { buildViewer, has, type ScopeUser } from '../access/scope';
import { settingFor } from '../people/probation';
import { NotificationsService } from '../notifications/notifications.service';
import { escapeHtml } from '../notifications/notification-email-render';
import { factsOn, holidaysFor, leaveDays } from '../time/time-core';
import { lineApproved } from '../time/line-rules';
import { mondayOf } from '../time/time-rules';
import { allocatedMinutes, availableMinutes, freePct, hideSmallTeam, rankMatches, utilisationPct } from './capacity';
import { ProjectsService } from './projects.service';

// Projects P-4 (PRJ-03, PRJ-07; founder answers 1411, 1417, 1418). Capacity: each person's allocated hours against their
// available hours (weekdays less holidays and leave) for six weeks, and last month's billable utilisation against the
// company's target. Per-person figures are hidden from a project manager whose team is smaller than the company's
// limit; Projects manage and resource (HR's view) always see them. Resource requests: a project's manager (or Projects
// manage) asks for a share of someone's week; only Projects resource or manage fill it, with a person who has that much
// free capacity over the dates (bench first; skills later, 1418), which creates the allocation. Projects must be on.

const KEYS = ['projects.view', 'projects.manage', 'projects.finance', 'projects.resource'] as const;
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const asDate = (s: string) => new Date(`${s}T00:00:00Z`);
const plus = (s: string, n: number) => new Date(Date.parse(`${s}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const hrs = (m: number) => Math.round((m / 60) * 10) / 10;
const fmt = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

@Injectable()
export class ResourcingService {
  private readonly logger = new Logger(ResourcingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async who(user: ScopeUser) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, KEYS);
    const manage = has(v, 'projects.manage');
    const resource = has(v, 'projects.resource');
    return { userId: user.userId!, manage, resource, staffing: manage || resource, any: KEYS.some((k) => has(v, k)) };
  }

  private async needOn(tx: Tx, c: CompanyContext) {
    if (!(await ProjectsService.on(tx, c))) throw new ForbiddenException({ statusCode: 403, code: 'PROJECTS_OFF', message: 'Projects is switched off for your company. A System Admin switches it on in Settings › Projects & timesheets.' });
  }

  private async names(tx: Tx, org: string, ids: string[]) {
    const people = await tx.employee.findMany({ where: { organizationId: org, id: { in: ids } }, select: { id: true, givenName: true, familyName: true, preferredName: true } });
    return new Map(people.map((e) => [e.id, [e.preferredName ?? e.givenName, e.familyName].filter(Boolean).join(' ')]));
  }

  /** Days of a period with weekday, holiday and leave, for one person (their location's holidays). */
  private async dayFacts(tx: Tx, org: string, employeeId: string, from: string, to: string) {
    const f = (await factsOn(tx, org, employeeId, from)) ?? (await factsOn(tx, org, employeeId, to));
    const hol = f ? (await holidaysFor(tx, org, f.locationId, from, to, employeeId)).map : new Map();
    const leave = await leaveDays(tx, org, employeeId, from, to);
    const out: { on: string; weekday: boolean; holiday: boolean; leave: 'full' | 'first' | 'second' | null }[] = [];
    for (let on = from; on <= to; on = plus(on, 1)) {
      const dow = new Date(`${on}T00:00:00Z`).getUTCDay();
      out.push({ on, weekday: dow >= 1 && dow <= 5, holiday: hol.has(on), leave: leave.get(on) ?? null });
    }
    return out;
  }

  /** PRJ-03: six weeks of allocated against available hours, and last month's billable utilisation against the target. */
  capacity(ctx: TenantContext, user: ScopeUser, fromIn?: string) {
    return this.who(user).then((w) =>
      inCompany(this.tenantPrisma, ctx, async (tx, c) => {
        await this.needOn(tx, c);
        const org = c.organizationId;
        const managed = (await tx.timesheetProject.findMany({ where: { organizationId: org, managerUserId: w.userId }, select: { id: true } })).map((p) => p.id);
        if (!w.any && !managed.length) throw new ForbiddenException('You do not have access to capacity.');
        const from = mondayOf(fromIn ?? todayIst());
        const to = plus(from, 41);
        const target = Number(await settingFor(tx, c, 'projects.utilisation.target_pct', { legalEntityId: '' }));
        const limit = Number(await settingFor(tx, c, 'projects.small_team.limit', { legalEntityId: '' }));
        // The people: everyone allocated in the window (HR's view), or a PM's own team.
        const inWindow = await tx.projectAllocation.findMany({ where: { organizationId: org, tentative: false, fromOn: { lte: asDate(to) }, OR: [{ toOn: null }, { toOn: { gte: asDate(from) } }], ...(w.staffing ? {} : { projectId: { in: managed } }) }, select: { employeeId: true } });
        const ids = [...new Set(inWindow.map((a) => a.employeeId))].slice(0, 200);
        const weeks = Array.from({ length: 6 }, (_, k) => plus(from, k * 7));
        const base = { from, weeks, target, limit, teamSize: ids.length, privileged: w.staffing };
        if (hideSmallTeam(ids.length, limit, w.staffing)) return { ...base, suppressed: true, people: [], team: null };
        const monthStart = `${plus(`${todayIst().slice(0, 7)}-01`, -1).slice(0, 7)}-01`;
        const monthEnd = plus(`${todayIst().slice(0, 7)}-01`, -1);
        const allocs = await tx.projectAllocation.findMany({ where: { organizationId: org, tentative: false, employeeId: { in: ids } }, select: { employeeId: true, percent: true, fromOn: true, toOn: true } });
        const sheets = await tx.timesheet.findMany({ where: { organizationId: org, employeeId: { in: ids }, status: 'approved', weekStart: { gte: asDate(plus(monthStart, -6)), lte: asDate(monthEnd) } } });
        const lines = sheets.length ? await tx.timesheetLine.findMany({ where: { organizationId: org, timesheetId: { in: sheets.map((s) => s.id) }, billable: true } }) : [];
        const names = await this.names(tx, org, ids);
        const people = [];
        let teamBillable = 0;
        let teamAvailable = 0;
        for (const eid of ids) {
          const days = await this.dayFacts(tx, org, eid, from, to);
          const mine = allocs.filter((a) => a.employeeId === eid).map((a) => ({ percent: a.percent, fromOn: iso(a.fromOn)!, toOn: iso(a.toOn) }));
          const month = await this.dayFacts(tx, org, eid, monthStart, monthEnd);
          let billable = 0;
          for (const s of sheets.filter((x) => x.employeeId === eid)) {
            const monday = iso(s.weekStart)!;
            for (const l of lines.filter((x) => x.timesheetId === s.id)) lineApproved(l).forEach((m, k) => (plus(monday, k) >= monthStart && plus(monday, k) <= monthEnd ? (billable += m) : 0));
          }
          const available = availableMinutes(month);
          teamBillable += billable;
          teamAvailable += available;
          people.push({
            employeeId: eid,
            name: names.get(eid) ?? 'Employee',
            weeks: weeks.map((wk) => {
              const d = days.filter((x) => x.on >= wk && x.on <= plus(wk, 6));
              return { allocated: hrs(allocatedMinutes(d, mine)), available: hrs(availableMinutes(d)) };
            }),
            billableHours: hrs(billable),
            availableHours: hrs(available),
            utilisation: utilisationPct(billable, available),
          });
        }
        people.sort((a, b) => a.name.localeCompare(b.name));
        return { ...base, suppressed: false, month: monthStart.slice(0, 7), people, team: { billableHours: hrs(teamBillable), availableHours: hrs(teamAvailable), utilisation: utilisationPct(teamBillable, teamAvailable) } };
      }),
    );
  }

  /** PRJ-07 requests: Projects manage and resource see all; a project manager sees their own projects' requests. */
  async requests(ctx: TenantContext, user: ScopeUser) {
    const w = await this.who(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.needOn(tx, c);
      const org = c.organizationId;
      const managed = await tx.timesheetProject.findMany({ where: { organizationId: org, managerUserId: w.userId, status: { not: 'closed' } }, select: { id: true, code: true, name: true } });
      if (!w.any && !managed.length) throw new ForbiddenException('You do not have access to resource requests.');
      const rows = await tx.projectResourceRequest.findMany({ where: { organizationId: org, ...(w.staffing ? {} : { projectId: { in: managed.map((p) => p.id) } }) }, orderBy: [{ status: 'asc' }, { fromOn: 'asc' }], take: 500 });
      const projects = await tx.timesheetProject.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.projectId) } }, select: { id: true, code: true } });
      const users = await tx.user.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.requestedBy).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true, email: true } });
      const names = await this.names(tx, org, rows.map((r) => r.filledEmployeeId).filter((x): x is string => Boolean(x)));
      // The projects this person may raise requests for.
      const raisable = w.manage ? await tx.timesheetProject.findMany({ where: { organizationId: org, status: { not: 'closed' } }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }) : managed;
      return {
        can: { raise: raisable.length > 0, fill: w.staffing },
        projects: raisable.map((p) => ({ id: p.id, code: p.code, name: p.name })),
        rows: rows.map((r) => {
          const u = users.find((x) => x.id === r.requestedBy);
          return { id: r.id, projectId: r.projectId, project: projects.find((p) => p.id === r.projectId)?.code ?? '', role: r.role, percent: r.percent, fromOn: iso(r.fromOn), toOn: iso(r.toOn), note: r.note, status: r.status, requestedBy: u ? u.name?.trim() || u.email : null, person: r.filledEmployeeId ? (names.get(r.filledEmployeeId) ?? null) : null, mine: r.requestedBy === w.userId, version: r.version };
        }),
      };
    });
  }

  /** A project's manager (or Projects manage) asks for a share of someone's week. */
  async raise(ctx: TenantContext, user: ScopeUser, dto: { projectId: string; role: string; percent: number; fromOn: string; toOn: string; note?: string | null }) {
    const w = await this.who(user);
    if (dto.toOn < dto.fromOn) throw new BadRequestException('The end date is before the start date.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.needOn(tx, c);
      const org = c.organizationId;
      const p = await tx.timesheetProject.findFirst({ where: { organizationId: org, id: dto.projectId } });
      if (!p) throw new NotFoundException('No such project.');
      if (!w.manage && p.managerUserId !== w.userId) throw new ForbiddenException("Only the project's manager or someone who manages projects asks for people.");
      if (p.status === 'closed') throw new ConflictException('This project is closed.');
      const r = await tx.projectResourceRequest.create({ data: { organizationId: org, projectId: p.id, role: dto.role, percent: dto.percent, fromOn: asDate(dto.fromOn), toOn: asDate(dto.toOn), note: dto.note?.trim() || null, requestedBy: c.userId ?? null } });
      await audit(tx, c, 'projects.request.raised', 'project_resource_request', r.id, { projectId: p.id, role: r.role, percent: r.percent, fromOn: dto.fromOn, toOn: dto.toOn });
      return { id: r.id };
    });
  }

  /** Answer 1418: people with at least the asked share free over the dates, bench first. Projects resource or manage only. */
  async matches(ctx: TenantContext, user: ScopeUser, id: string) {
    const w = await this.who(user);
    if (!w.staffing) throw new ForbiddenException('Only Projects resource or Projects manage fill requests.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.needOn(tx, c);
      const org = c.organizationId;
      const r = await tx.projectResourceRequest.findFirst({ where: { organizationId: org, id } });
      if (!r) throw new NotFoundException('No such request.');
      const from = iso(r.fromOn)!;
      const to = iso(r.toOn)!;
      const active = await tx.employment.findMany({ where: { organizationId: org, exitedOn: null }, select: { employeeId: true }, take: 5000 });
      const ids = active.map((e) => e.employeeId);
      const allocs = await tx.projectAllocation.findMany({ where: { organizationId: org, tentative: false, employeeId: { in: ids } }, select: { employeeId: true, percent: true, fromOn: true, toOn: true } });
      const bench = new Set((await tx.staffingBench.findMany({ where: { organizationId: org, untilOn: null }, select: { employeeId: true } })).map((b) => b.employeeId));
      const names = await this.names(tx, org, ids);
      const people = ids.map((eid) => {
        const free = freePct(allocs.filter((a) => a.employeeId === eid).map((a) => ({ percent: a.percent, fromOn: iso(a.fromOn)!, toOn: iso(a.toOn) })), from, to);
        return { employeeId: eid, name: names.get(eid) ?? 'Employee', free, onBench: bench.has(eid) || free === 100 };
      });
      return { request: { id: r.id, percent: r.percent, fromOn: from, toOn: to, role: r.role }, matches: rankMatches(people, r.percent).slice(0, 25) };
    });
  }

  /** Fill a request: re-checks the person's free capacity, then creates the allocation. Projects resource or manage only. */
  async fill(ctx: TenantContext, user: ScopeUser, id: string, dto: { employeeId: string; version: number }) {
    const w = await this.who(user);
    if (!w.staffing) throw new ForbiddenException('Only Projects resource or Projects manage fill requests.');
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.needOn(tx, c);
      const org = c.organizationId;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`alloc:${org}:${dto.employeeId}`}))`;
      const r = await tx.projectResourceRequest.findFirst({ where: { organizationId: org, id } });
      if (!r) throw new NotFoundException('No such request.');
      if (r.status !== 'open' || r.version !== dto.version) throw new ConflictException('This request changed or is no longer open. Refresh.');
      const p = await tx.timesheetProject.findFirstOrThrow({ where: { organizationId: org, id: r.projectId } });
      if (p.status === 'closed') throw new ConflictException('This project is closed.');
      if (!(await tx.employment.findFirst({ where: { organizationId: org, employeeId: dto.employeeId, exitedOn: null }, select: { id: true } }))) throw new BadRequestException('Choose an active employee of this company.');
      const from = iso(r.fromOn)!;
      const to = iso(r.toOn)!;
      const allocs = await tx.projectAllocation.findMany({ where: { organizationId: org, tentative: false, employeeId: dto.employeeId }, select: { projectId: true, percent: true, fromOn: true, toOn: true } });
      const free = freePct(allocs.map((a) => ({ percent: a.percent, fromOn: iso(a.fromOn)!, toOn: iso(a.toOn) })), from, to);
      if (free < r.percent) throw new BadRequestException(`This person has ${free}% free over these dates; the request needs ${r.percent}%.`);
      if (allocs.some((a) => a.projectId === p.id && iso(a.fromOn)! <= to && (!a.toOn || iso(a.toOn)! >= from))) throw new ConflictException('This person is already allocated to this project over these dates.');
      const a = await tx.projectAllocation.create({ data: { organizationId: org, projectId: p.id, employeeId: dto.employeeId, role: r.role, fromOn: r.fromOn, toOn: r.toOn, percent: r.percent, tentative: false, createdBy: c.userId ?? null } });
      await tx.projectResourceRequest.update({ where: { id: r.id }, data: { status: 'filled', filledEmployeeId: dto.employeeId, allocationId: a.id, decidedBy: c.userId ?? null, decidedAt: new Date(), version: { increment: 1 } } });
      await audit(tx, c, 'projects.request.filled', 'project_resource_request', r.id, { projectId: p.id, employeeId: dto.employeeId, allocationId: a.id, percent: r.percent });
      const name = (await this.names(tx, org, [dto.employeeId])).get(dto.employeeId) ?? 'Someone';
      return { id: r.id, allocationId: a.id, to: r.requestedBy, text: `${p.code}: ${name} is allocated ${r.percent}% as ${r.role} from ${fmt(from)} to ${fmt(to)}.`, projectId: p.id };
    });
    if (out.to)
      await this.notifications
        .notifySystem(ctx, [out.to], 'projects.request.filled', { entityType: 'project_resource_request', entityId: out.id, contextText: out.text, linkPath: `/yx/projects/${out.projectId}` }, { subject: 'Your resource request is filled', html: `<p>${escapeHtml(out.text)}</p>` })
        .catch((e: unknown) => this.logger.error(e));
    return { id: out.id, allocationId: out.allocationId };
  }

  /** Withdraw an open request: the person who raised it, or Projects manage. */
  async withdraw(ctx: TenantContext, user: ScopeUser, id: string, version: number) {
    const w = await this.who(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.needOn(tx, c);
      const r = await tx.projectResourceRequest.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!r) throw new NotFoundException('No such request.');
      if (!w.manage && r.requestedBy !== w.userId) throw new ForbiddenException('Only the person who asked, or someone who manages projects, withdraws it.');
      const { count } = await tx.projectResourceRequest.updateMany({ where: { id, status: 'open', version }, data: { status: 'withdrawn', decidedBy: c.userId ?? null, decidedAt: new Date(), version: { increment: 1 } } });
      if (!count) throw new ConflictException('This request changed or is no longer open. Refresh.');
      await audit(tx, c, 'projects.request.withdrawn', 'project_resource_request', id, {});
      return { id };
    });
  }
}
