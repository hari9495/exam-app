import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import type { ScopeUser } from '../access/scope';
import { settingFor } from '../people/probation';
import { NotificationsService } from '../notifications/notifications.service';
import { escapeHtml } from '../notifications/notification-email-render';
import { hoursFromTimesheet } from '../staffing/hours-from-time';
import { DayEngine } from './day-engine.service';
import { bulkOk, lineApproved, reduceMinutes, weekOutcome } from './line-rules';
import { sevenComments } from './line-rules';
import { attendanceMismatch } from '../projects/capacity';
import { asDate, dateOf, hrApprovers, type Facts } from './time-core';
import { addDays } from './time-maths';

// Projects P-2 (PRJ-02, founder answers 1406 to 1408, 1442; parked item 914). With Projects on, a submitted week is
// decided line by line: each line's approver (the project's manager; else the person's manager; else HR, never the
// person) approves, reduces or rejects it, with a reason the person sees for a reduction or a rejection. The week is
// decided when its last line is: approved when any hours are approved (the day engine and the placement's hours follow
// from the approved minutes), else rejected (a draft again for the person). Bulk approval takes only lines inside the
// person's allocation (1407, a company setting); hours booked outside an allocation under "allow with manager approval"
// (1442) are always decided one by one. A project may ask its client to approve its hours in the client portal (1408).

const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const hrs = (m: number) => Math.round((m / 60) * 100) / 100;

export interface LineDecisionInput {
  lineId: string;
  status: 'approved' | 'reduced' | 'rejected';
  /** Reduced: the approved hours for the line (fewer than booked). */
  hours?: number;
  reason?: string;
  version: number;
}

@Injectable()
export class LineApprovalsService {
  private readonly logger = new Logger(LineApprovalsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly days: DayEngine,
    private readonly notifications: NotificationsService,
  ) {}

  static async on(tx: Tx, c: CompanyContext) {
    return (await settingFor(tx, c, 'projects.enabled', { legalEntityId: '' })) === 'on';
  }

  /** At submit, with Projects on: each line's approvers and the 1442 flag. Returns everyone to tell. */
  async startLines(tx: Tx, c: CompanyContext, sheet: { id: string; employeeId: string; weekStart: Date }, f: Facts): Promise<string[]> {
    const org = c.organizationId;
    const week = dateOf(sheet.weekStart);
    const lines = await tx.timesheetLine.findMany({ where: { organizationId: org, timesheetId: sheet.id } });
    const projects = await tx.timesheetProject.findMany({ where: { organizationId: org, id: { in: lines.map((l) => l.projectId) } }, select: { id: true, managerUserId: true } });
    const managerUser = f.managerEmployeeId ? ((await tx.employee.findFirst({ where: { organizationId: org, id: f.managerEmployeeId }, select: { userId: true } }))?.userId ?? null) : null;
    let hr: string[] | null = null;
    const booking = await settingFor(tx, c, 'projects.booking.allocated_only', { legalEntityId: '' });
    const allocs = booking === 'approval' ? await tx.projectAllocation.findMany({ where: { organizationId: org, employeeId: sheet.employeeId, tentative: false, fromOn: { lte: asDate(addDays(week, 6)) }, OR: [{ toOn: null }, { toOn: { gte: sheet.weekStart } }] } }) : [];
    const everyone = new Set<string>();
    for (const l of lines) {
      const pm = projects.find((p) => p.id === l.projectId)?.managerUserId ?? null;
      // The person never approves their own hours, even as the project's manager.
      let approvers = pm && pm !== c.userId ? [pm] : managerUser && managerUser !== c.userId ? [managerUser] : (hr ??= await hrApprovers(tx, org, sheet.employeeId, todayIst(), c.userId));
      approvers = approvers.filter((x) => x !== c.userId);
      const unallocated = booking === 'approval' && l.minutes.some((m, k) => m > 0 && !allocs.some((a) => a.projectId === l.projectId && dateOf(a.fromOn) <= addDays(week, k) && (!a.toOn || dateOf(a.toOn) >= addDays(week, k))));
      await tx.timesheetLine.update({ where: { id: l.id }, data: { status: 'pending', approverUserIds: approvers, unallocated, approvedMinutes: [], reason: null, decidedBy: null, decidedAt: null, clientStatus: null, clientNote: null, clientContactId: null, clientDecidedAt: null, version: { increment: 1 } } });
      approvers.forEach((a) => everyone.add(a));
    }
    return [...everyone];
  }

  /** Withdraw: only while no line is decided yet. */
  async withdrawLines(tx: Tx, org: string, sheetId: string) {
    const decided = await tx.timesheetLine.count({ where: { organizationId: org, timesheetId: sheetId, status: { in: ['approved', 'reduced', 'rejected'] } } });
    if (decided) throw new ConflictException('A manager already decided some lines of this week, so it can no longer be withdrawn.');
    await tx.timesheetLine.updateMany({ where: { organizationId: org, timesheetId: sheetId }, data: { status: null, approverUserIds: [], unallocated: false } });
  }

  private self(user: ScopeUser) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
  }

  /** PRJ-02: the lines waiting for me, by project and week, with what bulk approval may take. */
  list(ctx: TenantContext, user: ScopeUser) {
    this.self(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const lines = await tx.timesheetLine.findMany({ where: { organizationId: org, status: 'pending', approverUserIds: { has: c.userId! } }, take: 2000 });
      const sheets = await tx.timesheet.findMany({ where: { organizationId: org, id: { in: [...new Set(lines.map((l) => l.timesheetId))] }, status: 'pending' } });
      const live = lines.filter((l) => sheets.some((s) => s.id === l.timesheetId));
      const projects = await tx.timesheetProject.findMany({ where: { organizationId: org, id: { in: [...new Set(live.map((l) => l.projectId))] } }, select: { id: true, code: true, name: true, clientApprovesHours: true, clientId: true } });
      const people = await tx.employee.findMany({ where: { organizationId: org, id: { in: [...new Set(sheets.map((s) => s.employeeId))] } }, select: { id: true, givenName: true, familyName: true, preferredName: true } });
      const allocs = await tx.projectAllocation.findMany({ where: { organizationId: org, tentative: false, employeeId: { in: people.map((p) => p.id) }, projectId: { in: projects.map((p) => p.id) } } });
      const clients = await tx.staffingClient.findMany({ where: { organizationId: org, id: { in: projects.map((p) => p.clientId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } });
      const within = (await settingFor(tx, c, 'projects.bulk.within_allocation', { legalEntityId: '' })) === 'on';
      // Answer 1541: each person's whole week against attendance (an hour or more apart is flagged; pay never changes).
      const allLines = await tx.timesheetLine.findMany({ where: { organizationId: org, timesheetId: { in: sheets.map((s) => s.id) } }, select: { timesheetId: true, minutes: true } });
      const worked = await tx.attendanceDay.findMany({ where: { organizationId: org, employeeId: { in: sheets.map((s) => s.employeeId) }, mode: { not: 'timesheet' }, workedMinutes: { not: null }, workOn: { gte: new Date(Math.min(...sheets.map((s) => s.weekStart.getTime()), Date.now())), lte: new Date(Math.max(...sheets.map((s) => s.weekStart.getTime() + 6 * 86_400_000), 0)) } }, select: { employeeId: true, workOn: true, workedMinutes: true } });
      const mismatchOf = (s: (typeof sheets)[number]) => {
        const days = worked.filter((d) => d.employeeId === s.employeeId && d.workOn >= s.weekStart && d.workOn.getTime() <= s.weekStart.getTime() + 6 * 86_400_000);
        return days.length ? attendanceMismatch(sum(allLines.filter((l) => l.timesheetId === s.id).flatMap((l) => l.minutes)), sum(days.map((d) => d.workedMinutes!))) : null;
      };
      const groups = new Map<string, { projectId: string; project: string; projectName: string; week: string; clientApproval: string | null; items: unknown[] }>();
      for (const s of sheets) {
        const week = dateOf(s.weekStart);
        const e = people.find((p) => p.id === s.employeeId)!;
        const name = [e.preferredName ?? e.givenName, e.familyName].filter(Boolean).join(' ');
        for (const p of projects) {
          const mine = live.filter((l) => l.timesheetId === s.id && l.projectId === p.id);
          if (!mine.length) continue;
          const a = allocs.find((x) => x.employeeId === s.employeeId && x.projectId === p.id && dateOf(x.fromOn) <= addDays(week, 6) && (!x.toOn || dateOf(x.toOn) >= week));
          const total = sum(mine.flatMap((l) => l.minutes));
          const key = `${p.id}:${week}`;
          if (!groups.has(key)) groups.set(key, { projectId: p.id, project: p.code, projectName: p.name, week, clientApproval: p.clientApprovesHours && p.clientId ? (clients.find((x) => x.id === p.clientId)?.name ?? null) : null, items: [] });
          groups.get(key)!.items.push({
            id: `${s.id}:${p.id}`,
            timesheetId: s.id,
            // Batch D B1 (answer 2538): the person, so the page can regroup these same lines by person (never more).
            employeeId: s.employeeId,
            employee: name,
            allocationPercent: a?.percent ?? null,
            allocatedHours: a ? hrs(Math.round((a.percent / 100) * 40 * 60)) : 0,
            unallocated: mine.some((l) => l.unallocated),
            mismatch: mismatchOf(s),
            bulk: mine.every((l) => bulkOk({ unallocated: l.unallocated, weekMinutesOnProject: total, allocationPercent: a?.percent ?? null, withinAllocation: within })),
            lines: mine.map((l) => ({ id: l.id, task: l.activity, hours: hrs(sum(l.minutes)), /** B1: Monday to Sunday, for the week → day → task drill-down. */ days: l.minutes.map(hrs), billable: l.billable, comments: sevenComments(l.dayComments), version: l.version })),
          });
        }
      }
      return { withinAllocation: within, groups: [...groups.values()].sort((a, b) => b.week.localeCompare(a.week) || a.project.localeCompare(b.project)) };
    });
  }

  /** Approve, reduce or reject lines (each needs me as its approver; a reduction or rejection needs a reason). */
  async decide(ctx: TenantContext, user: ScopeUser, decisions: LineDecisionInput[], bulk = false) {
    this.self(user);
    const done = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const lines = await tx.timesheetLine.findMany({ where: { organizationId: org, id: { in: decisions.map((d) => d.lineId) } } });
      if (lines.length !== new Set(decisions.map((d) => d.lineId)).size) throw new NotFoundException('Some of these lines are not waiting for you.');
      const within = (await settingFor(tx, c, 'projects.bulk.within_allocation', { legalEntityId: '' })) === 'on';
      const sheets = await tx.timesheet.findMany({ where: { organizationId: org, id: { in: [...new Set(lines.map((l) => l.timesheetId))] } } });
      for (const sId of new Set(lines.map((l) => l.timesheetId))) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`tsl:${org}:${sId}`}))`;
      const told: { userId: string | null; text: string; week: string; sheetId: string }[] = [];
      for (const d of decisions) {
        const l = lines.find((x) => x.id === d.lineId)!;
        const s = sheets.find((x) => x.id === l.timesheetId)!;
        // Another project's line, or a line of a week decided as a whole: never mine to decide.
        if (!l.approverUserIds.includes(c.userId!)) throw new ForbiddenException('You approve only the lines of your own projects (or of the people you approve for).');
        if (l.status !== 'pending' || s.status !== 'pending') throw new ConflictException('This line is not waiting for a decision any more. Refresh.');
        if (l.version !== d.version) throw new ConflictException('This line changed just now. Refresh and decide again.');
        if (bulk) {
          const weekOnProject = sum((await tx.timesheetLine.findMany({ where: { organizationId: org, timesheetId: s.id, projectId: l.projectId } })).flatMap((x) => x.minutes));
          const a = await tx.projectAllocation.findFirst({ where: { organizationId: org, employeeId: s.employeeId, projectId: l.projectId, tentative: false, fromOn: { lte: asDate(addDays(dateOf(s.weekStart), 6)) }, OR: [{ toOn: null }, { toOn: { gte: s.weekStart } }] } });
          if (!bulkOk({ unallocated: l.unallocated, weekMinutesOnProject: weekOnProject, allocationPercent: a?.percent ?? null, withinAllocation: within })) throw new BadRequestException(l.unallocated ? 'Hours booked outside an allocation are approved one by one, never in bulk.' : 'Some hours are above the allocation. Approve them one by one.');
        }
        const reason = d.reason?.trim() ?? '';
        if (d.status !== 'approved' && reason.length < 3) throw new BadRequestException(d.status === 'reduced' ? 'Say why you are reducing the hours: the person sees it.' : 'Say why you are rejecting the hours: the person sees it.');
        let approvedMinutes: number[] = [];
        if (d.status === 'reduced') {
          const target = Math.round((d.hours ?? -1) * 60);
          if (d.hours == null || target < 0 || target >= sum(l.minutes)) throw new BadRequestException(`Approve fewer hours than the ${hrs(sum(l.minutes))} booked.`);
          approvedMinutes = reduceMinutes(l.minutes, target);
        }
        await tx.timesheetLine.update({ where: { id: l.id }, data: { status: d.status, approvedMinutes, reason: d.status === 'approved' ? null : reason.slice(0, 300), decidedBy: c.userId ?? null, decidedAt: new Date(), version: { increment: 1 } } });
        await audit(tx, c, `time.timesheet_line.${d.status}`, 'timesheet_line', l.id, { timesheetId: s.id, projectId: l.projectId, bookedMinutes: sum(l.minutes), approvedMinutes: sum(lineApproved({ minutes: l.minutes, status: d.status, approvedMinutes })), reason: d.status === 'approved' ? null : reason, bulk });
        if (d.status !== 'approved') {
          const p = await tx.timesheetProject.findFirst({ where: { organizationId: org, id: l.projectId }, select: { code: true } });
          const person = await tx.employee.findFirst({ where: { organizationId: org, id: s.employeeId }, select: { userId: true } });
          told.push({ userId: person?.userId ?? null, week: dateOf(s.weekStart), sheetId: s.id, text: `${p?.code ?? 'Project'}${l.activity ? ` · ${l.activity}` : ''}: ${d.status === 'reduced' ? `reduced from ${hrs(sum(l.minutes))} h to ${d.hours} h` : `${hrs(sum(l.minutes))} h rejected`}. Reason: ${reason}` });
        }
      }
      const finals = [];
      for (const sId of new Set(lines.map((l) => l.timesheetId))) finals.push(await this.finalize(tx, c, sId));
      return { told, finals };
    });
    for (const t of done.told.filter((x) => x.userId))
      await this.notifications
        .notifySystem(ctx, [t.userId!], 'time.timesheet.line', { entityType: 'timesheet', entityId: t.sheetId, contextText: t.text, linkPath: `/yx/time/timesheet?week=${t.week}` }, { subject: `Your timesheet for the week of ${fmt(t.week)}`, html: `<p>${escapeHtml(t.text)}</p>` })
        .catch((e: unknown) => this.logger.error(e));
    return { decided: decisions.length, weeks: done.finals };
  }

  /** Answer 1407: approve lines in bulk, each inside the person's allocation (the company may lift the share check). */
  async bulk(ctx: TenantContext, user: ScopeUser, items: { lineId: string; version: number }[]) {
    return this.decide(ctx, user, items.map((i) => ({ ...i, status: 'approved' as const })), true);
  }

  /** The week once its last line is decided: approved (day engine, the placement's hours, client approval) or rejected. */
  private async finalize(tx: Tx, c: CompanyContext, sheetId: string) {
    const org = c.organizationId;
    const s = await tx.timesheet.findFirst({ where: { organizationId: org, id: sheetId } });
    if (!s || s.status !== 'pending') return { id: sheetId, status: s?.status ?? null };
    const lines = await tx.timesheetLine.findMany({ where: { organizationId: org, timesheetId: s.id } });
    const outcome = weekOutcome(lines);
    if (!outcome) return { id: s.id, status: 'pending' };
    await tx.timesheet.update({ where: { id: s.id }, data: { status: outcome, decidedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
    await audit(tx, c, `time.timesheet.${outcome}`, 'timesheet', s.id, { week: dateOf(s.weekStart), byLines: true, approvedMinutes: sum(lines.flatMap((l) => lineApproved(l))) });
    if (outcome === 'approved') {
      const week = dateOf(s.weekStart);
      const sc: CompanyContext = { organizationId: org, isSuperAdmin: false };
      await this.days.evaluate(tx, sc, s.employeeId, week, addDays(week, 6));
      // 914: only this client's project lines flow into the placement's week; those lines are approved there.
      const placementClient = await hoursFromTimesheet(tx, sc, s).then(async (id) => (id ? ((await tx.staffingHours.findFirst({ where: { id }, select: { clientId: true } }))?.clientId ?? null) : null));
      // 1408: other approved lines of projects whose client approves hours wait for the client in the portal.
      const projects = await tx.timesheetProject.findMany({ where: { organizationId: org, id: { in: lines.map((l) => l.projectId) }, clientApprovesHours: true, clientId: { not: null } }, select: { id: true, clientId: true } });
      const waiting = lines.filter((l) => l.status !== 'rejected' && sum(lineApproved(l)) > 0 && projects.some((p) => p.id === l.projectId && p.clientId !== placementClient));
      if (waiting.length) await tx.timesheetLine.updateMany({ where: { id: { in: waiting.map((l) => l.id) } }, data: { clientStatus: 'waiting' } });
    }
    return { id: s.id, status: outcome };
  }
}
