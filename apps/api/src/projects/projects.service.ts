import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, CompanyContext, inCompany, Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { buildViewer, has, type ScopeUser } from '../access/scope';
import { settingFor } from '../people/probation';
import { OrgSettingsService } from '../org-structure/org-settings.service';
import { SETTINGS } from '../org-structure/settings-registry';
import { NotificationsService } from '../notifications/notifications.service';
import { escapeHtml } from '../notifications/notification-email-render';
import { AllocationDto, AllocationUpdateDto, MilestoneDto, ProjectInputDto, ProjectStatusDto, ProjectUpdateDto, TaskDto } from './dto';

// Projects P-1 (founder answers 1401 to 1405, 1412, 1420). The project is Time's project grown up (one list, 1402):
// a client from the staffing desk (1403), a billing model (1420), budgets, dates and a status; its team (allocations),
// tasks (Time's activities) and milestones. Projects is switched on per company (projects.enabled, off by default).
// Who: projects.manage edits any project; a project's manager (or projects.resource for the team) runs its team, tasks
// and milestones; projects.finance alone sees and sets fee and cost budget (1412); projects.view reads. Only allocated
// people book time when the company says so (1404, in TimesheetService). Burn alerts at the company's 80% and 100%
// (1405), sent once per level to the manager and Projects finance. Everything is audited; forced RLS on every table.

const KEYS = ['projects.view', 'projects.manage', 'projects.finance', 'projects.resource'] as const;
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const asDate = (s: string) => new Date(`${s}T00:00:00Z`);
const num = (d: Prisma.Decimal | null | undefined) => (d == null ? null : Number(d.toString()));
const hoursOf = (minutes: number) => Math.round((minutes / 60) * 100) / 100;

export const BURN_WARN = 'projects.burn.warn_pct';
export const BURN_OVER = 'projects.burn.over_pct';
/** Settings 3.11 Projects & timesheets: the company settings P-1 puts behind the designed page. */
export const PROJECT_SETTING_KEYS = ['projects.enabled', 'projects.booking.allocated_only', BURN_WARN, BURN_OVER] as const;

/** Answer 1405: the burn level reached (0, the warning level or the over level) for hours used against the budget. */
export function burnLevel(usedHours: number, budgetHours: number | null, warn: number, over: number): number {
  if (!budgetHours || budgetHours <= 0) return 0;
  const pct = (usedHours / budgetHours) * 100;
  return pct >= over ? over : pct >= warn ? warn : 0;
}

type Who = { userId: string; finance: boolean; manage: boolean; resource: boolean; any: boolean };

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
    private readonly settings: OrgSettingsService,
  ) {}

  private async who(user: ScopeUser): Promise<Who> {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, KEYS);
    const keys = KEYS.filter((k) => has(v, k));
    return { userId: user.userId!, finance: keys.includes('projects.finance'), manage: keys.includes('projects.manage'), resource: keys.includes('projects.resource'), any: keys.length > 0 };
  }

  /** Answer 1401: the company switched Projects on. */
  static async on(tx: Tx, c: CompanyContext) {
    return (await settingFor(tx, c, 'projects.enabled', { legalEntityId: '' })) === 'on';
  }
  private async needOn(tx: Tx, c: CompanyContext) {
    if (!(await ProjectsService.on(tx, c))) throw new ForbiddenException({ statusCode: 403, code: 'PROJECTS_OFF', message: 'Projects is switched off for your company. A System Admin switches it on in Settings › Projects & timesheets.' });
  }

  /** Whether the company has Projects on (the menu shows it then; anyone signed in may ask). */
  /** For the menu: Projects is on, and this person holds a Projects key or manages a project (never while acting). */
  async status(ctx: TenantContext, user: ScopeUser) {
    const acting = Boolean(user.impersonatorUserId || user.actingSuperAdmin);
    const w = acting ? null : await this.who(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const enabled = await ProjectsService.on(tx, c);
      const canOpen = Boolean(enabled && w && (w.any || (await tx.timesheetProject.count({ where: { organizationId: c.organizationId, managerUserId: w.userId } }))));
      return { enabled, canOpen };
    });
  }

  /* ---------------- Settings 3.11 (answers 1401, 1404, 1405) ---------------- */

  /** System Admins (org.settings.manage) change them; Projects managers read them. Works while Projects is off. */
  async readSettings(ctx: TenantContext, user: ScopeUser) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, [...KEYS, 'org.settings.manage']);
    const canEdit = has(v, 'org.settings.manage');
    if (!canEdit && !has(v, 'projects.manage')) throw new ForbiddenException('Settings › Projects & timesheets needs the company settings key or Projects manage.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.setting.findMany({ where: { organizationId: c.organizationId, scopeType: 'tenant', key: { in: [...PROJECT_SETTING_KEYS] } } });
      const last = rows.filter((r) => r.updatedBy).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
      const by = last ? await tx.user.findFirst({ where: { organizationId: c.organizationId, id: last.updatedBy! }, select: { name: true, email: true } }) : null;
      return {
        canEdit,
        values: Object.fromEntries(PROJECT_SETTING_KEYS.map((k) => [k, String(rows.find((r) => r.key === k)?.value ?? SETTINGS[k]!.default)])),
        defaults: Object.fromEntries(PROJECT_SETTING_KEYS.map((k) => [k, SETTINGS[k]!.default])),
        choices: Object.fromEntries(PROJECT_SETTING_KEYS.map((k) => [k, SETTINGS[k]!.values])),
        lastChange: last ? { by: by?.name || by?.email || 'Someone', at: last.updatedAt, what: `Changed ${SETTINGS[last.key]!.label.replace(/^Projects: /, '').toLowerCase()}` } : null,
      };
    });
  }

  /** Each change is an audited company setting (OrgSettingsService); a bad value, or a second alert not above the first, saves nothing. */
  async saveSettings(ctx: TenantContext, user: ScopeUser, changes: { key: string; value: string }[]) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, ['org.settings.manage']);
    if (!has(v, 'org.settings.manage')) throw new ForbiddenException('Only a System Admin changes the Projects settings.');
    const seen = new Set<string>();
    for (const ch of changes) {
      if (!(PROJECT_SETTING_KEYS as readonly string[]).includes(ch.key)) throw new BadRequestException(`${ch.key} is not a Projects setting.`);
      if (seen.has(ch.key)) throw new BadRequestException(`${SETTINGS[ch.key]!.label} is in the list twice.`);
      seen.add(ch.key);
      if (!SETTINGS[ch.key]!.values.includes(ch.value)) throw new BadRequestException(`${SETTINGS[ch.key]!.label} is one of: ${SETTINGS[ch.key]!.values.join(', ')}`);
    }
    const now = (await this.readSettings(ctx, user)).values;
    const next: Record<string, string> = { ...now, ...Object.fromEntries(changes.map((ch) => [ch.key, ch.value])) };
    if (Number(next[BURN_OVER]) <= Number(next[BURN_WARN])) throw new BadRequestException('The second burn alert must be above the first.');
    for (const ch of changes) await this.settings.set(ctx, { key: ch.key, scopeType: 'tenant', value: ch.value } as Parameters<OrgSettingsService['set']>[1]);
    return this.readSettings(ctx, user);
  }

  /** Booked hours (submitted and approved weeks) per project, task and person. */
  private async booked(tx: Tx, org: string, projectIds: string[]) {
    if (!projectIds.length) return [] as { project_id: string; activity: string | null; employee_id: string; minutes: number }[];
    return tx.$queryRaw<{ project_id: string; activity: string | null; employee_id: string; minutes: number }[]>`
      SELECT l.project_id::text, l.activity, t.employee_id::text, sum((SELECT coalesce(sum(m), 0) FROM unnest(l.minutes) m))::int AS minutes
      FROM timesheet_lines l JOIN timesheets t ON t.organization_id = l.organization_id AND t.id = l.timesheet_id
      WHERE l.organization_id = ${org}::uuid AND l.project_id = ANY(${projectIds}::uuid[]) AND t.status IN ('pending', 'approved')
      GROUP BY 1, 2, 3`;
  }

  private row(p: Prisma.TimesheetProjectGetPayload<object>, w: Who, extra: { clientName: string | null; managerName: string | null; usedHours: number; people: number }) {
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      clientId: p.clientId,
      client: extra.clientName,
      billingModel: p.billingModel,
      managerUserId: p.managerUserId,
      manager: extra.managerName,
      status: p.status,
      startOn: day(p.startOn),
      endOn: day(p.endOn),
      budgetHours: num(p.budgetHours),
      usedHours: extra.usedHours,
      people: extra.people,
      clientAcceptsMilestones: p.clientAcceptsMilestones,
      // Answer 1412: fee and cost only for Projects finance.
      ...(w.finance ? { fee: num(p.fee), budgetCost: num(p.budgetCost) } : {}),
      version: p.version,
      mine: p.managerUserId === w.userId,
    };
  }

  /** The projects list: everything for key holders; a project manager without a key sees their own projects. */
  async list(ctx: TenantContext, user: ScopeUser) {
    const w = await this.who(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.needOn(tx, c);
      const org = c.organizationId;
      const projects = await tx.timesheetProject.findMany({ where: { organizationId: org, ...(w.any ? {} : { managerUserId: w.userId }) }, orderBy: [{ status: 'asc' }, { code: 'asc' }] });
      if (!w.any && !projects.length) throw new ForbiddenException('You need a Projects key, or to manage a project, to see projects.');
      const ids = projects.map((p) => p.id);
      const [booked, clients, managers, allocs] = await Promise.all([
        this.booked(tx, org, ids),
        tx.staffingClient.findMany({ where: { organizationId: org, id: { in: projects.map((p) => p.clientId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } }),
        tx.user.findMany({ where: { organizationId: org, id: { in: projects.map((p) => p.managerUserId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true, email: true } }),
        tx.projectAllocation.groupBy({ by: ['projectId'], where: { organizationId: org, projectId: { in: ids }, OR: [{ toOn: null }, { toOn: { gte: asDate(todayIst()) } }] }, _count: { _all: true } }),
      ]);
      return {
        can: { create: w.manage, finance: w.finance },
        rows: projects.map((p) =>
          this.row(p, w, {
            clientName: clients.find((x) => x.id === p.clientId)?.name ?? null,
            managerName: (() => {
              const m = managers.find((x) => x.id === p.managerUserId);
              return m ? m.name?.trim() || m.email : null;
            })(),
            usedHours: hoursOf(booked.filter((b) => b.project_id === p.id).reduce((t, b) => t + b.minutes, 0)),
            people: allocs.find((a) => a.projectId === p.id)?._count._all ?? 0,
          }),
        ),
      };
    });
  }

  private async project(tx: Tx, org: string, id: string, w: Who) {
    const p = await tx.timesheetProject.findFirst({ where: { organizationId: org, id } });
    if (!p) throw new NotFoundException('No such project.');
    if (!w.any && p.managerUserId !== w.userId) throw new NotFoundException('No such project.');
    return p;
  }

  /** May run the project's team, tasks and milestones: projects.manage, its manager (or projects.resource for the team). */
  private canRun(p: { managerUserId: string | null }, w: Who, team = false) {
    return w.manage || p.managerUserId === w.userId || (team && w.resource);
  }
  private needRun(p: { managerUserId: string | null; status: string }, w: Who, team = false) {
    if (!this.canRun(p, w, team)) throw new ForbiddenException('Only the project manager or someone who manages projects changes this.');
    if (p.status === 'closed') throw new ConflictException('This project is closed. Reopen it first.');
  }

  /** One project's workspace: the project, its team, tasks with hours used, milestones and this week's hours. */
  async get(ctx: TenantContext, user: ScopeUser, id: string) {
    const w = await this.who(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.needOn(tx, c);
      const org = c.organizationId;
      const p = await this.project(tx, org, id, w);
      const [allocations, tasks, milestones, booked, client, manager] = await Promise.all([
        tx.projectAllocation.findMany({ where: { organizationId: org, projectId: id }, orderBy: [{ fromOn: 'asc' }] }),
        tx.projectTask.findMany({ where: { organizationId: org, projectId: id }, orderBy: { createdAt: 'asc' } }),
        tx.projectMilestone.findMany({ where: { organizationId: org, projectId: id }, orderBy: { dueOn: 'asc' } }),
        this.booked(tx, org, [id]),
        p.clientId ? tx.staffingClient.findFirst({ where: { organizationId: org, id: p.clientId }, select: { name: true } }) : null,
        p.managerUserId ? tx.user.findFirst({ where: { organizationId: org, id: p.managerUserId }, select: { name: true, email: true } }) : null,
      ]);
      const people = await tx.employee.findMany({ where: { organizationId: org, id: { in: allocations.map((a) => a.employeeId) } }, select: { id: true, givenName: true, familyName: true } });
      const name = (eid: string) => {
        const e = people.find((x) => x.id === eid);
        return e ? [e.givenName, e.familyName].filter(Boolean).join(' ') : 'Former employee';
      };
      const today = todayIst();
      const used = booked.reduce((t, b) => t + b.minutes, 0);
      return {
        project: this.row(p, w, { clientName: client?.name ?? null, managerName: manager ? manager.name?.trim() || manager.email : null, usedHours: hoursOf(used), people: allocations.filter((a) => !a.toOn || day(a.toOn)! >= today).length }),
        can: { edit: w.manage, run: this.canRun(p, w), team: this.canRun(p, w, true), finance: w.finance },
        allocations: allocations.map((a) => ({
          id: a.id,
          employeeId: a.employeeId,
          person: name(a.employeeId),
          role: a.role,
          fromOn: day(a.fromOn),
          toOn: day(a.toOn),
          percent: a.percent,
          tentative: a.tentative,
          bookedHours: hoursOf(booked.filter((b) => b.employee_id === a.employeeId).reduce((t, b) => t + b.minutes, 0)),
          version: a.version,
        })),
        tasks: tasks.map((t) => ({ id: t.id, name: t.name, budgetHours: num(t.budgetHours), usedHours: hoursOf(booked.filter((b) => b.activity === t.name).reduce((s, b) => s + b.minutes, 0)), billable: t.billable, active: t.active })),
        milestones: milestones.map((m) => ({ id: m.id, name: m.name, pct: num(m.pct), dueOn: day(m.dueOn), status: m.status, version: m.version })),
      };
    });
  }

  private async checkPeople(tx: Tx, org: string, dto: ProjectInputDto) {
    if (dto.managerUserId && !(await tx.user.findFirst({ where: { organizationId: org, id: dto.managerUserId, status: 'active' }, select: { id: true } }))) throw new BadRequestException('Choose an active person of this company as the project manager.');
    if (dto.clientId && !(await tx.staffingClient.findFirst({ where: { organizationId: org, id: dto.clientId }, select: { id: true } }))) throw new BadRequestException('Choose one of your clients (Staffing desk › Clients).');
    if (dto.billingModel !== 'non_billable' && !dto.clientId) throw new BadRequestException('A billable project needs a client. Choose the client, or make it non-billable.');
    if (dto.startOn && dto.endOn && dto.endOn < dto.startOn) throw new BadRequestException('The end date is before the start date.');
  }

  /** Answer 1402: a new project (the one project list Time's timesheets book to). New projects start as drafts. */
  async create(ctx: TenantContext, user: ScopeUser, dto: ProjectInputDto) {
    const w = await this.who(user);
    if (!w.manage) throw new ForbiddenException('You need the key to manage projects.');
    if (!w.finance && (dto.fee != null || dto.budgetCost != null)) throw new ForbiddenException('Only Projects finance sets the fee and the cost budget.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.needOn(tx, c);
      const org = c.organizationId;
      await this.checkPeople(tx, org, dto);
      if (await tx.timesheetProject.findFirst({ where: { organizationId: org, code: dto.code }, select: { id: true } })) throw new ConflictException('A project with this code already exists.');
      const p = await tx.timesheetProject.create({
        data: {
          organizationId: org,
          code: dto.code,
          name: dto.name,
          managerUserId: dto.managerUserId ?? null,
          clientId: dto.clientId ?? null,
          billingModel: dto.billingModel,
          billable: dto.billingModel !== 'non_billable',
          status: 'draft',
          active: false,
          startOn: dto.startOn ? asDate(dto.startOn) : null,
          endOn: dto.endOn ? asDate(dto.endOn) : null,
          budgetHours: dto.budgetHours ?? null,
          budgetCost: dto.budgetCost ?? null,
          fee: dto.fee ?? null,
          clientAcceptsMilestones: dto.clientAcceptsMilestones ?? false,
          createdBy: c.userId ?? null,
        },
      });
      await audit(tx, c, 'projects.project.created', 'timesheet_project', p.id, { code: p.code, name: p.name, billingModel: p.billingModel, clientId: p.clientId });
      return { id: p.id, status: p.status };
    });
  }

  /** Changes a project's details (projects.manage; fee and cost budget only with Projects finance). Its code stays. */
  async update(ctx: TenantContext, user: ScopeUser, id: string, dto: ProjectUpdateDto) {
    const w = await this.who(user);
    if (!w.manage) throw new ForbiddenException('You need the key to manage projects.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.needOn(tx, c);
      const org = c.organizationId;
      const p = await this.project(tx, org, id, w);
      if (p.version !== dto.version) throw new ConflictException('Someone changed this project. Reload to see the latest.');
      if (dto.code !== p.code) throw new BadRequestException('A project keeps its code.');
      if (!w.finance && ((dto.fee ?? null) !== num(p.fee) || (dto.budgetCost ?? null) !== num(p.budgetCost)) && (dto.fee !== undefined || dto.budgetCost !== undefined)) throw new ForbiddenException('Only Projects finance sets the fee and the cost budget.');
      await this.checkPeople(tx, org, dto);
      const data = {
        name: dto.name,
        managerUserId: dto.managerUserId ?? null,
        clientId: dto.clientId ?? null,
        billingModel: dto.billingModel,
        billable: dto.billingModel !== 'non_billable',
        startOn: dto.startOn ? asDate(dto.startOn) : null,
        endOn: dto.endOn ? asDate(dto.endOn) : null,
        budgetHours: dto.budgetHours ?? null,
        ...(w.finance ? { budgetCost: dto.budgetCost ?? null, fee: dto.fee ?? null } : {}),
        clientAcceptsMilestones: dto.clientAcceptsMilestones ?? p.clientAcceptsMilestones,
        version: { increment: 1 },
        updatedAt: new Date(),
      };
      await tx.timesheetProject.update({ where: { id }, data });
      await audit(tx, c, 'projects.project.changed', 'timesheet_project', id, {
        from: { name: p.name, managerUserId: p.managerUserId, clientId: p.clientId, billingModel: p.billingModel, budgetHours: num(p.budgetHours), ...(w.finance ? { fee: num(p.fee), budgetCost: num(p.budgetCost) } : {}) },
        to: { name: dto.name, managerUserId: dto.managerUserId ?? null, clientId: dto.clientId ?? null, billingModel: dto.billingModel, budgetHours: dto.budgetHours ?? null, ...(w.finance ? { fee: dto.fee ?? null, budgetCost: dto.budgetCost ?? null } : {}) },
      });
      return { id, version: p.version + 1 };
    });
  }

  /** Draft → active, on hold, closed; reopening a closed project (projects.manage). Only an active project takes time. */
  async setStatus(ctx: TenantContext, user: ScopeUser, id: string, dto: ProjectStatusDto) {
    const w = await this.who(user);
    if (!w.manage) throw new ForbiddenException('You need the key to manage projects.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.needOn(tx, c);
      const p = await this.project(tx, c.organizationId, id, w);
      if (p.version !== dto.version) throw new ConflictException('Someone changed this project. Reload to see the latest.');
      if (p.status === dto.status) throw new ConflictException(`The project is already ${dto.status.replace('_', ' ')}.`);
      if (dto.status === 'draft') throw new BadRequestException('A project never goes back to draft.');
      if (dto.status === 'active' && p.billingModel !== 'non_billable' && !p.clientId) throw new BadRequestException('A billable project needs a client before it starts.');
      await tx.timesheetProject.update({ where: { id }, data: { status: dto.status, active: dto.status === 'active', closedAt: dto.status === 'closed' ? new Date() : null, version: { increment: 1 }, updatedAt: new Date() } });
      await audit(tx, c, 'projects.project.status_changed', 'timesheet_project', id, { from: p.status, to: dto.status });
      return { id, status: dto.status, version: p.version + 1 };
    });
  }

  // ---- team (answer 1404) ----

  private async checkAllocation(tx: Tx, org: string, p: { startOn: Date | null; endOn: Date | null }, dto: { fromOn: string; toOn?: string | null }) {
    if (dto.toOn && dto.toOn < dto.fromOn) throw new BadRequestException('The allocation ends before it starts.');
    if (p.endOn && dto.fromOn > day(p.endOn)!) throw new BadRequestException('The allocation starts after the project ends.');
    void tx;
    void org;
  }

  async allocate(ctx: TenantContext, user: ScopeUser, projectId: string, dto: AllocationDto) {
    const w = await this.who(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.needOn(tx, c);
      const org = c.organizationId;
      const p = await this.project(tx, org, projectId, w);
      this.needRun(p, w, true);
      if (!(await tx.employee.findFirst({ where: { organizationId: org, id: dto.employeeId }, select: { id: true } }))) throw new BadRequestException('Choose an employee of this company.');
      await this.checkAllocation(tx, org, p, dto);
      const overlap = await tx.projectAllocation.findFirst({
        where: { organizationId: org, projectId, employeeId: dto.employeeId, fromOn: { lte: dto.toOn ? asDate(dto.toOn) : asDate('9999-12-31') }, OR: [{ toOn: null }, { toOn: { gte: asDate(dto.fromOn) } }] },
        select: { id: true },
      });
      if (overlap) throw new ConflictException('This person is already allocated to the project for some of those dates. Change that allocation instead.');
      const a = await tx.projectAllocation.create({ data: { organizationId: org, projectId, employeeId: dto.employeeId, role: dto.role ?? null, fromOn: asDate(dto.fromOn), toOn: dto.toOn ? asDate(dto.toOn) : null, percent: dto.percent, tentative: dto.tentative ?? false, createdBy: c.userId ?? null } });
      await audit(tx, c, 'projects.allocation.added', 'project_allocation', a.id, { projectId, employeeId: dto.employeeId, fromOn: dto.fromOn, toOn: dto.toOn ?? null, percent: dto.percent, tentative: a.tentative });
      return { id: a.id };
    });
  }

  async updateAllocation(ctx: TenantContext, user: ScopeUser, projectId: string, allocationId: string, dto: AllocationUpdateDto) {
    const w = await this.who(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.needOn(tx, c);
      const org = c.organizationId;
      const p = await this.project(tx, org, projectId, w);
      this.needRun(p, w, true);
      const a = await tx.projectAllocation.findFirst({ where: { organizationId: org, projectId, id: allocationId } });
      if (!a) throw new NotFoundException('No such allocation.');
      if (a.version !== dto.version) throw new ConflictException('Someone changed this allocation. Reload to see the latest.');
      await this.checkAllocation(tx, org, p, dto);
      await tx.projectAllocation.update({ where: { id: a.id }, data: { role: dto.role ?? null, fromOn: asDate(dto.fromOn), toOn: dto.toOn ? asDate(dto.toOn) : null, percent: dto.percent, tentative: dto.tentative ?? a.tentative, version: { increment: 1 }, updatedAt: new Date() } });
      await audit(tx, c, 'projects.allocation.changed', 'project_allocation', a.id, { projectId, from: { fromOn: day(a.fromOn), toOn: day(a.toOn), percent: a.percent, tentative: a.tentative }, to: { fromOn: dto.fromOn, toOn: dto.toOn ?? null, percent: dto.percent, tentative: dto.tentative ?? a.tentative } });
      return { id: a.id, version: a.version + 1 };
    });
  }

  /** Ends an allocation today (its booked hours stay; from tomorrow the person can no longer book). */
  async endAllocation(ctx: TenantContext, user: ScopeUser, projectId: string, allocationId: string, version: number) {
    const w = await this.who(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.needOn(tx, c);
      const org = c.organizationId;
      const p = await this.project(tx, org, projectId, w);
      this.needRun(p, w, true);
      const a = await tx.projectAllocation.findFirst({ where: { organizationId: org, projectId, id: allocationId } });
      if (!a) throw new NotFoundException('No such allocation.');
      if (a.version !== version) throw new ConflictException('Someone changed this allocation. Reload to see the latest.');
      const today = todayIst();
      if (a.toOn && day(a.toOn)! < today) throw new ConflictException('This allocation has already ended.');
      const end = day(a.fromOn)! > today ? day(a.fromOn)! : today;
      await tx.projectAllocation.update({ where: { id: a.id }, data: { toOn: asDate(end), version: { increment: 1 }, updatedAt: new Date() } });
      await audit(tx, c, 'projects.allocation.ended', 'project_allocation', a.id, { projectId, toOn: end });
      return { id: a.id, toOn: end };
    });
  }

  // ---- tasks (Time's activities) ----

  private async syncActivities(tx: Tx, org: string, projectId: string) {
    const tasks = await tx.projectTask.findMany({ where: { organizationId: org, projectId, active: true }, orderBy: { createdAt: 'asc' }, select: { name: true } });
    await tx.timesheetProject.update({ where: { id: projectId }, data: { activities: tasks.map((t) => t.name), updatedAt: new Date() } });
  }

  async addTask(ctx: TenantContext, user: ScopeUser, projectId: string, dto: TaskDto) {
    const w = await this.who(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.needOn(tx, c);
      const org = c.organizationId;
      const p = await this.project(tx, org, projectId, w);
      this.needRun(p, w);
      if ((await tx.projectTask.count({ where: { organizationId: org, projectId, active: true } })) >= 20) throw new BadRequestException('A project has at most 20 tasks in use.');
      if (await tx.projectTask.findFirst({ where: { organizationId: org, projectId, name: { equals: dto.name, mode: 'insensitive' } }, select: { id: true } })) throw new ConflictException('The project already has a task with this name.');
      const t = await tx.projectTask.create({ data: { organizationId: org, projectId, name: dto.name, budgetHours: dto.budgetHours ?? null, billable: dto.billable, active: dto.active ?? true } });
      await this.syncActivities(tx, org, projectId);
      await audit(tx, c, 'projects.task.added', 'project_task', t.id, { projectId, name: t.name, budgetHours: dto.budgetHours ?? null });
      return { id: t.id };
    });
  }

  /** Changes a task's budget, billable flag or use (its name stays: hours already booked carry it). */
  async updateTask(ctx: TenantContext, user: ScopeUser, projectId: string, taskId: string, dto: TaskDto) {
    const w = await this.who(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.needOn(tx, c);
      const org = c.organizationId;
      const p = await this.project(tx, org, projectId, w);
      this.needRun(p, w);
      const t = await tx.projectTask.findFirst({ where: { organizationId: org, projectId, id: taskId } });
      if (!t) throw new NotFoundException('No such task.');
      if (dto.name.toLowerCase() !== t.name.toLowerCase()) throw new BadRequestException('A task keeps its name (hours already booked carry it). Add a new task instead.');
      if (dto.active && !t.active && (await tx.projectTask.count({ where: { organizationId: org, projectId, active: true } })) >= 20) throw new BadRequestException('A project has at most 20 tasks in use.');
      await tx.projectTask.update({ where: { id: t.id }, data: { budgetHours: dto.budgetHours ?? null, billable: dto.billable, active: dto.active ?? t.active } });
      await this.syncActivities(tx, org, projectId);
      await audit(tx, c, 'projects.task.changed', 'project_task', t.id, { projectId, from: { budgetHours: num(t.budgetHours), billable: t.billable, active: t.active }, to: { budgetHours: dto.budgetHours ?? null, billable: dto.billable, active: dto.active ?? t.active } });
      return { id: t.id };
    });
  }

  // ---- milestones (answer 1420) ----

  async addMilestone(ctx: TenantContext, user: ScopeUser, projectId: string, dto: MilestoneDto) {
    const w = await this.who(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.needOn(tx, c);
      const org = c.organizationId;
      const p = await this.project(tx, org, projectId, w);
      this.needRun(p, w);
      if (p.billingModel !== 'fixed_fee') throw new BadRequestException('Milestones are for fixed-fee projects.');
      const total = (await tx.projectMilestone.findMany({ where: { organizationId: org, projectId }, select: { pct: true } })).reduce((s, m) => s + Number(m.pct), 0);
      if (total + dto.pct > 100.0001) throw new BadRequestException(`The milestones would add up to more than 100% of the fee (${Math.round((total + dto.pct) * 100) / 100}%).`);
      const m = await tx.projectMilestone.create({ data: { organizationId: org, projectId, name: dto.name, pct: dto.pct, dueOn: asDate(dto.dueOn) } });
      await audit(tx, c, 'projects.milestone.added', 'project_milestone', m.id, { projectId, name: m.name, pct: dto.pct, dueOn: dto.dueOn });
      return { id: m.id };
    });
  }

  /** The manager marks a milestone complete; with client acceptance on, it then waits for the client (portal, P-2). */
  async completeMilestone(ctx: TenantContext, user: ScopeUser, projectId: string, milestoneId: string, version: number) {
    const w = await this.who(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.needOn(tx, c);
      const org = c.organizationId;
      const p = await this.project(tx, org, projectId, w);
      this.needRun(p, w);
      const m = await tx.projectMilestone.findFirst({ where: { organizationId: org, projectId, id: milestoneId } });
      if (!m) throw new NotFoundException('No such milestone.');
      if (m.version !== version) throw new ConflictException('Someone changed this milestone. Reload to see the latest.');
      if (m.status !== 'planned') throw new ConflictException('This milestone is already complete.');
      // Without client acceptance a completed milestone is accepted at once (ready to bill).
      const status = p.clientAcceptsMilestones ? 'completed' : 'accepted';
      await tx.projectMilestone.update({ where: { id: m.id }, data: { status, completedAt: new Date(), completedBy: c.userId ?? null, version: { increment: 1 } } });
      await audit(tx, c, 'projects.milestone.completed', 'project_milestone', m.id, { projectId, status, clientAccepts: p.clientAcceptsMilestones });
      return { id: m.id, status };
    });
  }

  // ---- burn alerts (answer 1405) ----

  /** Who gets burn alerts besides the manager: everyone holding Projects finance (role, profile or an in-date grant). */
  private async financeHolders(tx: Tx, org: string): Promise<string[]> {
    const today = todayIst();
    const like = '%"projects.finance"%';
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT u.id::text FROM users u WHERE u.organization_id = ${org}::uuid AND u.status = 'active' AND u.role = 'org_admin'
      UNION
      SELECT u.id::text FROM users u JOIN permission_profiles p ON p.organization_id = u.organization_id AND p.id = u.permission_profile_id
      WHERE u.organization_id = ${org}::uuid AND u.status = 'active' AND p.permissions_json LIKE ${like}
      UNION
      SELECT g.user_id::text FROM role_grants g JOIN permission_profiles p ON p.organization_id = g.organization_id AND p.id = g.permission_profile_id
      JOIN users u ON u.organization_id = g.organization_id AND u.id = g.user_id AND u.status = 'active'
      WHERE g.organization_id = ${org}::uuid AND g.status = 'active' AND p.permissions_json LIKE ${like}
        AND g.valid_from <= ${today}::date AND (g.valid_to IS NULL OR g.valid_to >= ${today}::date)`;
    return rows.map((r) => r.id);
  }

  /**
   * Hourly (safe to rerun): each active project with an hours budget whose booked hours reached the company's warning
   * or over level alerts the manager and Projects finance once per level; a budget raised back below resets it.
   * Each company in its own context. `only` limits the run to these companies (tests).
   */
  async burnSweep(only?: string[]): Promise<number> {
    const orgs = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.timesheetProject.groupBy({ by: ['organizationId'], where: { status: 'active', budgetHours: { gt: 0 }, ...(only ? { organizationId: { in: only } } : {}) } }),
    );
    let sent = 0;
    for (const { organizationId: org } of orgs) {
      const ctx: TenantContext = { organizationId: org, isSuperAdmin: false };
      try {
        const alerts = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
          if (!(await ProjectsService.on(tx, c))) return [];
          const warn = Number(await settingFor(tx, c, BURN_WARN, { legalEntityId: '' }));
          const over = Number(await settingFor(tx, c, BURN_OVER, { legalEntityId: '' }));
          const projects = await tx.timesheetProject.findMany({ where: { organizationId: org, status: 'active', budgetHours: { gt: 0 } } });
          const booked = await this.booked(tx, org, projects.map((p) => p.id));
          const out: { p: (typeof projects)[number]; level: number; used: number }[] = [];
          for (const p of projects) {
            const used = hoursOf(booked.filter((b) => b.project_id === p.id).reduce((t, b) => t + b.minutes, 0));
            const level = burnLevel(used, num(p.budgetHours), warn, over);
            if (level === p.burnAlertedPct) continue;
            // Claim the level (a second run or server sees it changed and does nothing).
            const { count } = await tx.timesheetProject.updateMany({ where: { id: p.id, burnAlertedPct: p.burnAlertedPct }, data: { burnAlertedPct: level } });
            if (!count || level < p.burnAlertedPct || level === 0) continue;
            await audit(tx, c, 'projects.burn.alert', 'timesheet_project', p.id, { level, usedHours: used, budgetHours: num(p.budgetHours) });
            out.push({ p, level, used });
          }
          if (!out.length) return [];
          const finance = await this.financeHolders(tx, org);
          return out.map((o) => ({ ...o, to: [...new Set([...(o.p.managerUserId ? [o.p.managerUserId] : []), ...finance])] }));
        });
        for (const a of alerts) {
          const pct = Math.round((a.used / Number(a.p.budgetHours)) * 100);
          const text = `${a.p.code} ${a.p.name}: ${a.used} of ${num(a.p.budgetHours)} budgeted hours booked (${pct}%).`;
          await this.notifications
            .notifySystem(ctx, a.to, 'projects.burn', { entityType: 'timesheet_project', entityId: a.p.id, contextText: text, linkPath: `/yx/projects/${a.p.id}` }, { subject: `Budget burn ${a.level}%: ${a.p.code}`, html: `<p>${escapeHtml(text)}</p>` })
            .catch((e: unknown) => this.logger.error(e));
          sent++;
        }
      } catch (e) {
        this.logger.error(`Project burn alerts failed for ${org}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return sent;
  }

  /** People and clients to choose from in the forms (names only). */
  async choices(ctx: TenantContext, user: ScopeUser) {
    const w = await this.who(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.needOn(tx, c);
      const org = c.organizationId;
      // A project's manager without a key still picks people for their team.
      if (!w.any && !(await tx.timesheetProject.count({ where: { organizationId: org, managerUserId: w.userId } }))) throw new ForbiddenException('You need a Projects key, or to manage a project.');
      const [clients, users, employees] = await Promise.all([
        tx.staffingClient.findMany({ where: { organizationId: org }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        tx.user.findMany({ where: { organizationId: org, status: 'active' }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' }, take: 2000 }),
        tx.employee.findMany({ where: { organizationId: org }, select: { id: true, givenName: true, familyName: true }, orderBy: { givenName: 'asc' }, take: 5000 }),
      ]);
      return {
        clients,
        managers: users.map((u) => ({ id: u.id, name: u.name?.trim() || u.email })),
        people: employees.map((e) => ({ id: e.id, name: [e.givenName, e.familyName].filter(Boolean).join(' ') })),
      };
    });
  }
}
