import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import type { ScopeUser } from '../access/scope';
import { ApprovalsEngine, Notice } from '../workflow/approvals-engine.service';
import { DayEngine } from './day-engine.service';
import { ProjectDto, TimesheetLineDto } from './dto';
import { lockedDates } from './schedule';
import { TimeSetupService } from './setup.service';
import { asDate, dateOf, factsOn, holidaysFor, hrApprovers, leaveDays, myEmployeeId, settingOn } from './time-core';
import { addDays } from './time-maths';
import { mondayOf } from './time-rules';

// M02 §B7 basic timesheets: simple projects with activities (no M12 project accounting), a weekly grid per person,
// submitted through P03 to the project managers (D4; else the person's manager). Approved hours set the day in the
// Timesheet attendance mode (D1) and feed payroll (§B6). Hours of a locked month never change (P08).

export const TIMESHEET = 'time.timesheet';
const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const hours = (m: number) => `${Math.round((m / 60) * 100) / 100} h`;

@Injectable()
export class TimesheetService implements OnModuleInit {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly engine: ApprovalsEngine,
    private readonly days: DayEngine,
    private readonly setup: TimeSetupService,
  ) {}

  onModuleInit() {
    this.engine.register({ key: TIMESHEET, label: 'Timesheet', risk: 'normal', autoActions: false, onDecided: (tx, req, outcome) => this.decided(tx, req, outcome), requesterLink: () => '/yx/time/timesheet' });
  }

  // ------------------------------------------------------------------------------------------ projects (set-up)

  private async checkManager(tx: Tx, org: string, id: string | null | undefined) {
    if (id && !(await tx.user.findFirst({ where: { organizationId: org, id, status: 'active' }, select: { id: true } }))) throw new BadRequestException('Choose an active person of this company as the project manager.');
  }

  createProject(ctx: TenantContext, user: ScopeUser, dto: ProjectDto) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      await this.checkManager(tx, c.organizationId, dto.managerUserId);
      if (await tx.timesheetProject.findFirst({ where: { organizationId: c.organizationId, code: dto.code } })) throw new ConflictException(`The code ${dto.code} is already used.`);
      const activities = [...new Set(dto.activities.map((a) => a.trim()).filter(Boolean))];
      const p = await tx.timesheetProject.create({ data: { organizationId: c.organizationId, code: dto.code, name: dto.name, managerUserId: dto.managerUserId ?? null, billable: dto.billable, activities, active: dto.active ?? true, createdBy: c.userId ?? null } });
      await audit(tx, c, 'time.project.created', 'timesheet_project', p.id, { code: dto.code, name: dto.name, managerUserId: dto.managerUserId ?? null });
      return { id: p.id };
    });
  }

  updateProject(ctx: TenantContext, user: ScopeUser, id: string, dto: ProjectDto) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      const p = await tx.timesheetProject.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!p) throw new NotFoundException('No such project.');
      if (dto.code !== p.code) throw new BadRequestException('A project keeps its code.');
      await this.checkManager(tx, c.organizationId, dto.managerUserId);
      const activities = [...new Set(dto.activities.map((a) => a.trim()).filter(Boolean))];
      await tx.timesheetProject.update({ where: { id }, data: { name: dto.name, managerUserId: dto.managerUserId ?? null, billable: dto.billable, activities, active: dto.active ?? p.active, updatedAt: new Date() } });
      await audit(tx, c, 'time.project.changed', 'timesheet_project', id, { from: { name: p.name, managerUserId: p.managerUserId, active: p.active }, to: { name: dto.name, managerUserId: dto.managerUserId ?? null, active: dto.active ?? p.active } });
      return { id };
    });
  }

  // ------------------------------------------------------------------------------------------ me › timesheet

  /** My week: the sheet (or an empty draft), the projects in use, and each day's expected status (holiday, leave). */
  week(ctx: TenantContext, weekIn: string) {
    const week = mondayOf(weekIn);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await myEmployeeId(tx, org, c.userId);
      const f = (await factsOn(tx, org, me, week)) ?? (await factsOn(tx, org, me, todayIst()));
      if (!f) throw new NotFoundException('You have no job assignment that week.');
      const sheet = await tx.timesheet.findFirst({ where: { organizationId: org, employeeId: me, weekStart: asDate(week) } });
      const lines = sheet ? await tx.timesheetLine.findMany({ where: { organizationId: org, timesheetId: sheet.id }, orderBy: { id: 'asc' } }) : [];
      const projects = await tx.timesheetProject.findMany({ where: { organizationId: org, OR: [{ active: true }, { id: { in: lines.map((l) => l.projectId) } }] }, orderBy: { code: 'asc' } });
      const to = addDays(week, 6);
      const hol = (await holidaysFor(tx, org, f.locationId, week, to, me)).map;
      const leave = await leaveDays(tx, org, me, week, to);
      const locked = await lockedDates(tx, org, me, week, to);
      const recent = await tx.timesheet.findMany({ where: { organizationId: org, employeeId: me }, orderBy: { weekStart: 'desc' }, take: 8 });
      return {
        week,
        mode: await settingOn(tx, c, 'attendance.mode', f, week),
        sheet: sheet ? { id: sheet.id, status: sheet.status, totalMinutes: sheet.totalMinutes, submittedAt: sheet.submittedAt, decidedAt: sheet.decidedAt } : null,
        lines: lines.map((l) => ({ id: l.id, projectId: l.projectId, activity: l.activity, billable: l.billable, minutes: l.minutes, note: l.note })),
        projects: projects.map((p) => ({ id: p.id, code: p.code, name: p.name, billable: p.billable, activities: p.activities, active: p.active })),
        days: Array.from({ length: 7 }, (_, k) => {
          const on = addDays(week, k);
          return { on, holiday: hol.get(on)?.name ?? null, leave: leave.get(on) ?? null, locked: locked.has(on) };
        }),
        recent: recent.map((s) => ({ id: s.id, week: dateOf(s.weekStart), status: s.status, totalMinutes: s.totalMinutes })),
      };
    });
  }

  /** Saves the week as a draft (a rejected week becomes a draft again). Hours on locked days never change. */
  async save(ctx: TenantContext, user: ScopeUser, weekIn: string, lines: TimesheetLineDto[]) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    const week = mondayOf(weekIn);
    if (week !== weekIn) throw new BadRequestException('A timesheet week starts on a Monday.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await myEmployeeId(tx, org, c.userId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ts:${org}:${me}:${week}`}))`;
      if (week > addDays(todayIst(), 7)) throw new BadRequestException('Fill in a week once it has started.');
      const projects = new Map((await tx.timesheetProject.findMany({ where: { organizationId: org, id: { in: lines.map((l) => l.projectId) } } })).map((p) => [p.id, p]));
      for (const [i, l] of lines.entries()) {
        const p = projects.get(l.projectId);
        if (!p || !p.active) throw new BadRequestException(`Line ${i + 1}: choose a project in use.`);
        if (l.activity && p.activities.length && !p.activities.includes(l.activity)) throw new BadRequestException(`Line ${i + 1}: choose one of the project's activities.`);
      }
      const perDay = Array.from({ length: 7 }, (_, k) => lines.reduce((s, l) => s + l.minutes[k], 0));
      if (perDay.some((m) => m > 1440)) throw new BadRequestException('A day has at most 24 hours.');
      const total = perDay.reduce((a, b) => a + b, 0);
      const sheet = await tx.timesheet.findFirst({ where: { organizationId: org, employeeId: me, weekStart: asDate(week) } });
      if (sheet && (sheet.status === 'pending' || sheet.status === 'approved')) throw new ConflictException(sheet.status === 'pending' ? 'This week is waiting for approval. Withdraw it to change it.' : 'This week is approved and can no longer change.');
      // P08: hours on locked days stay as they were.
      const locked = await lockedDates(tx, org, me, week, addDays(week, 6));
      if (locked.size) {
        const before = sheet ? await tx.timesheetLine.findMany({ where: { organizationId: org, timesheetId: sheet.id } }) : [];
        const was = Array.from({ length: 7 }, (_, k) => before.reduce((s, l) => s + (l.minutes[k] ?? 0), 0));
        for (let k = 0; k < 7; k++) if (locked.has(addDays(week, k)) && was[k] !== perDay[k]) throw new ConflictException(`${fmt(addDays(week, k))} is in a locked month, so its hours can't change. Ask HR.`);
      }
      const s = sheet ?? (await tx.timesheet.create({ data: { organizationId: org, employeeId: me, weekStart: asDate(week) } }));
      await tx.timesheetLine.deleteMany({ where: { organizationId: org, timesheetId: s.id } });
      if (lines.length) await tx.timesheetLine.createMany({ data: lines.map((l) => ({ organizationId: org, timesheetId: s.id, projectId: l.projectId, activity: l.activity || null, billable: l.billable, minutes: l.minutes, note: l.note || null })) });
      await tx.timesheet.update({ where: { id: s.id }, data: { status: 'draft', totalMinutes: total, version: { increment: 1 }, updatedAt: new Date() } });
      return { id: s.id, status: 'draft', totalMinutes: total };
    });
  }

  /** Submits the week (YX-AT-09): to the project managers of its lines (D4), else the manager; through P03. */
  async submit(ctx: TenantContext, user: ScopeUser, weekIn: string) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    const week = mondayOf(weekIn);
    const notices: Notice[] = [];
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await myEmployeeId(tx, org, c.userId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ts:${org}:${me}:${week}`}))`;
      const sheet = await tx.timesheet.findFirst({ where: { organizationId: org, employeeId: me, weekStart: asDate(week) } });
      if (!sheet || sheet.status !== 'draft') throw new ConflictException(sheet ? 'This week is already submitted.' : 'Save the week first.');
      if (!sheet.totalMinutes) throw new BadRequestException('Add your hours before submitting the week.');
      const f = (await factsOn(tx, org, me, week)) ?? (await factsOn(tx, org, me, todayIst()));
      if (!f) throw new BadRequestException('You were not working here that week.');
      const lines = await tx.timesheetLine.findMany({ where: { organizationId: org, timesheetId: sheet.id } });
      const projects = await tx.timesheetProject.findMany({ where: { organizationId: org, id: { in: lines.map((l) => l.projectId) } } });
      // The person never approves their own hours, even as a project's manager.
      const pms = [...new Set(projects.map((p) => p.managerUserId).filter((x): x is string => Boolean(x) && x !== c.userId))];
      const byProject = projects.map((p) => `${p.code}: ${hours(lines.filter((l) => l.projectId === p.id).reduce((s, l) => s + l.minutes.reduce((a, b) => a + b, 0), 0))}`).join(', ');
      await tx.timesheet.update({ where: { id: sheet.id }, data: { status: 'pending', submittedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
      const sub = await this.engine.submit(tx, c, {
        type: TIMESHEET,
        subjectType: 'timesheet',
        subjectId: sheet.id,
        title: `${f.name}: timesheet for the week of ${fmt(week)} (${hours(sheet.totalMinutes)})`,
        summary: [
          { label: 'Week', value: `${fmt(week)} to ${fmt(addDays(week, 6))}` },
          { label: 'Hours', value: hours(sheet.totalMinutes) },
          { label: 'By project', value: byProject.slice(0, 300) },
        ],
        subjectPersonId: f.personId,
        requesterUserId: c.userId ?? null,
        raisedByUserId: c.userId ?? null,
        steps: [pms.length ? { name: 'Project manager', approvers: [{ kind: 'users', userIds: pms }], mode: 'all', remindAfterHours: 24 } : { name: 'Manager', approvers: [{ kind: 'manager' }], mode: 'any', remindAfterHours: 24 }],
        payload: {},
        payloadFields: [],
        fallbackUserIds: await hrApprovers(tx, org, me, todayIst(), f.userId),
      });
      notices.push(...sub.notices);
      await tx.timesheet.update({ where: { id: sheet.id }, data: { wfRequestId: sub.id } });
      await audit(tx, c, 'time.timesheet.submitted', 'timesheet', sheet.id, { week, totalMinutes: sheet.totalMinutes });
      return { id: sheet.id, status: (await tx.timesheet.findFirstOrThrow({ where: { id: sheet.id } })).status };
    });
    await this.engine.send(ctx, notices);
    return res;
  }

  async withdraw(ctx: TenantContext, user: ScopeUser, id: string) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const me = await myEmployeeId(tx, c.organizationId, c.userId);
      const s = await tx.timesheet.findFirst({ where: { organizationId: c.organizationId, id, employeeId: me } });
      if (!s) throw new NotFoundException('No such timesheet.');
      if (s.status !== 'pending') throw new ConflictException('Only a week still waiting can be withdrawn.');
      if (s.wfRequestId) await this.engine.withdraw(tx, c, s.wfRequestId, c.userId ?? null, 'Withdrawn by the employee');
      await tx.timesheet.update({ where: { id }, data: { status: 'draft', submittedAt: null, version: { increment: 1 }, updatedAt: new Date() } });
      return { id, status: 'draft' };
    });
  }

  private async decided(tx: Tx, wf: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const s = await tx.timesheet.findFirst({ where: { organizationId: wf.organizationId, id: wf.subjectId } });
    if (!s || s.status !== 'pending') return;
    await tx.timesheet.update({ where: { id: s.id }, data: { status: outcome === 'approved' ? 'approved' : 'rejected', decidedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
    if (outcome === 'approved') {
      const week = dateOf(s.weekStart);
      const c: CompanyContext = { organizationId: wf.organizationId, isSuperAdmin: false };
      // The day engine skips locked days and stops at today.
      await this.days.evaluate(tx, c, s.employeeId, week, addDays(week, 6));
    }
  }
}
