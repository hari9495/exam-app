import { hoursFromTimesheet } from '../staffing/hours-from-time';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import type { ScopeUser } from '../access/scope';
import { ApprovalsEngine, Notice } from '../workflow/approvals-engine.service';
import { DayEngine } from './day-engine.service';
import { TimesheetLineDto } from './dto';
import { ScheduleBook, lockedDates } from './schedule';
import { TimeSetupService } from './setup.service';
import { LineApprovalsService } from './line-approvals.service';
import { DAY_NAMES, dayCommentProblems, lineApproved, sevenComments } from './line-rules';
import { asDate, dateOf, factsOn, holidaysFor, hrApprovers, leaveDays, myEmployeeId, settingOn } from './time-core';
import { addDays } from './time-maths';
import { settingFor } from '../people/probation';
import { mondayOf } from './time-rules';
import { NotificationsService } from '../notifications/notifications.service';
import { escapeHtml } from '../notifications/notification-email-render';

// M02 §B7 basic timesheets: simple projects with activities (no M12 project accounting), a weekly grid per person,
// submitted through P03 to the project managers (D4; else the person's manager). Approved hours set the day in the
// Timesheet attendance mode (D1) and feed payroll (§B6). Hours of a locked month never change (P08).

export const TIMESHEET = 'time.timesheet';
const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const hours = (m: number) => `${Math.round((m / 60) * 100) / 100} h`;
/** Batch D A5 (answer 2534): the weeks looked at by default; "Show older" asks for up to a year. */
export const NOT_SENT_WEEKS = 12;
/** Answer 2535: a manager's reminder about weeks not sent goes at most once a day per person. */
const REMIND_GAP_MS = 20 * 3_600_000;
export type NotSentWeek = { week: string; status: 'not_started' | 'draft' | 'sent_back'; totalMinutes: number; locked: boolean };

@Injectable()
export class TimesheetService implements OnModuleInit {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly engine: ApprovalsEngine,
    private readonly days: DayEngine,
    private readonly setup: TimeSetupService,
    private readonly lineApprovals: LineApprovalsService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.engine.register({ key: TIMESHEET, label: 'Timesheet', risk: 'normal', quickApprove: true, autoActions: false, onDecided: (tx, req, outcome) => this.decided(tx, req, outcome), requesterLink: () => '/yx/time/timesheet' });
  }

  // Projects P-1 (answer 1402): projects are created and changed in Projects (ProjectsService); Time books to them.

  /** Answers 1732 and 1787: the company's comment rule (required by default, at least 20 words on each day with hours). */
  static async noteRule(tx: Tx, c: CompanyContext) {
    return { required: (await settingFor(tx, c, 'timesheet.note.required', { legalEntityId: '' })) === 'on', minWords: Number(await settingFor(tx, c, 'timesheet.note.min_words_per_day', { legalEntityId: '' })) };
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
        // Projects P-2 (1406): each line's decision with its reason, and the hours approved.
        lines: lines.map((l) => ({ id: l.id, projectId: l.projectId, activity: l.activity, billable: l.billable, minutes: l.minutes, comments: sevenComments(l.dayComments), decision: l.status, reason: l.reason, approvedMinutes: l.status ? lineApproved(l) : null, unallocated: l.unallocated, clientStatus: l.clientStatus, clientNote: l.clientNote })),
        projects: projects.map((p) => ({ id: p.id, code: p.code, name: p.name, billable: p.billable, activities: p.activities, active: p.active })),
        days: Array.from({ length: 7 }, (_, k) => {
          const on = addDays(week, k);
          return { on, holiday: hol.get(on)?.name ?? null, leave: leave.get(on) ?? null, locked: locked.has(on) };
        }),
        recent: recent.map((s) => ({ id: s.id, week: dateOf(s.weekStart), status: s.status, totalMinutes: s.totalMinutes })),
        noteRule: await TimesheetService.noteRule(tx, c),
      };
    });
  }

  /**
   * Keka ideas (2026-11), Time summary: my weeks of a year with their hours and status (weeks starting that year), and the
   * years I have timesheets in. My own record only.
   */
  summary(ctx: TenantContext, year: number) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await myEmployeeId(tx, org, c.userId);
      const sheets = await tx.timesheet.findMany({ where: { organizationId: org, employeeId: me, weekStart: { gte: asDate(`${year}-01-01`), lte: asDate(`${year}-12-31`) } }, orderBy: { weekStart: 'asc' }, select: { weekStart: true, status: true, totalMinutes: true } });
      const years = await tx.$queryRaw<{ y: number }[]>`SELECT DISTINCT extract(year FROM week_start)::int AS y FROM timesheets WHERE organization_id = ${org}::uuid AND employee_id = ${me}::uuid ORDER BY 1 DESC`;
      const thisYear = Number(todayIst().slice(0, 4));
      return {
        year,
        years: [...new Set([thisYear, ...years.map((r) => r.y)])].sort((x, y) => y - x),
        weeks: sheets.map((s) => ({ week: dateOf(s.weekStart), status: s.status, totalMinutes: s.totalMinutes })),
      };
    });
  }

  // ------------------------------------------------------------------------------------------ weeks not sent (batch D A5)

  /**
   * Answer 2534: a person's past weeks (ended before this week) that were never sent: none saved, a draft, or sent back.
   * A week counts when the person was employed, was on a timesheet (attendance mode 'timesheet') or allocated to a project
   * that week (`projectIds`: only those projects, the manager's view), and had at least one of their own working days
   * (their shift pattern, roster or location weekly offs, as the day engine works them out) that was not a holiday or
   * full-day leave. `book` lets a caller share one schedule load across people. A week whose days are all in locked months is shown read-only.
   */
  async notSentOf(tx: Tx, c: CompanyContext, employeeId: string, weeks: number, projectIds?: string[], book?: ScheduleBook): Promise<NotSentWeek[]> {
    const org = c.organizationId;
    const last = addDays(mondayOf(todayIst()), -7);
    const first = addDays(last, -7 * (weeks - 1));
    const end = addDays(last, 6);
    const sheets = await tx.timesheet.findMany({ where: { organizationId: org, employeeId, weekStart: { gte: asDate(first), lte: asDate(last) } }, select: { weekStart: true, status: true, totalMinutes: true } });
    const allocs = await tx.projectAllocation.findMany({ where: { organizationId: org, employeeId, tentative: false, ...(projectIds ? { projectId: { in: projectIds } } : {}), fromOn: { lte: asDate(end) }, OR: [{ toOn: null }, { toOn: { gte: asDate(first) } }] }, select: { fromOn: true, toOn: true } });
    if (projectIds && !allocs.length) return [];
    const now = (await factsOn(tx, org, employeeId, todayIst())) ?? (await factsOn(tx, org, employeeId, end));
    if (!now) return [];
    const hol = (await holidaysFor(tx, org, now.locationId, first, end, employeeId)).map;
    const leave = await leaveDays(tx, org, employeeId, first, end);
    const locked = await lockedDates(tx, org, employeeId, first, end);
    const days = book ?? (await ScheduleBook.load(tx, org));
    await days.prime([employeeId], first, end);
    const out: NotSentWeek[] = [];
    for (let w = last; w >= first; w = addDays(w, -7)) {
      const s = sheets.find((x) => dateOf(x.weekStart) === w);
      if (s && (s.status === 'pending' || s.status === 'approved')) continue;
      const f = (await factsOn(tx, org, employeeId, w)) ?? (await factsOn(tx, org, employeeId, addDays(w, 4)));
      if (!f) continue; // not employed that week (before joining or after leaving)
      const allocated = allocs.some((a) => dateOf(a.fromOn) <= addDays(w, 6) && (!a.toOn || dateOf(a.toOn) >= w));
      if (!allocated && (projectIds || (await settingOn(tx, c, 'attendance.mode', f, w)) !== 'timesheet')) continue;
      let working = 0;
      for (let k = 0; k < 7; k++) {
        const d = addDays(w, k);
        if (hol.has(d) || leave.get(d) === 'full') continue;
        const ff = (await factsOn(tx, org, employeeId, d)) ?? f;
        if (!(await days.day(ff, d)).weeklyOff) working++;
      }
      if (!working) continue;
      out.push({ week: w, status: !s ? 'not_started' : s.status === 'rejected' ? 'sent_back' : 'draft', totalMinutes: s?.totalMinutes ?? 0, locked: [0, 1, 2, 3, 4, 5, 6].every((k) => locked.has(addDays(w, k))) });
    }
    return out;
  }

  /** My weeks not sent (A5): the last `weeks` weeks (12 by default, a year at most). */
  notSent(ctx: TenantContext, weeks = NOT_SENT_WEEKS) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => ({ weeks: await this.notSentOf(tx, c, await myEmployeeId(tx, c.organizationId, c.userId), Math.min(Math.max(weeks, 1), 52)) }));
  }

  /** Answer 2535: the people on my projects (I am their project manager) with weeks not sent, for those projects only. */
  private async teamNotSentIn(tx: Tx, c: CompanyContext, userId: string) {
    const org = c.organizationId;
    const mine = await tx.timesheetProject.findMany({ where: { organizationId: org, managerUserId: userId, active: true }, select: { id: true, code: true } });
    if (!mine.length) return [];
    const first = addDays(mondayOf(todayIst()), -7 * NOT_SENT_WEEKS);
    const allocs = await tx.projectAllocation.findMany({ where: { organizationId: org, tentative: false, projectId: { in: mine.map((p) => p.id) }, OR: [{ toOn: null }, { toOn: { gte: asDate(first) } }] }, select: { employeeId: true, projectId: true } });
    const me = await tx.employee.findFirst({ where: { organizationId: org, userId }, select: { id: true } });
    const people = [...new Set(allocs.map((a) => a.employeeId))].filter((e) => e !== me?.id);
    const book = await ScheduleBook.load(tx, org);
    const out = [];
    for (const employeeId of people) {
      const projectIds = [...new Set(allocs.filter((a) => a.employeeId === employeeId).map((a) => a.projectId))];
      const weeks = await this.notSentOf(tx, c, employeeId, NOT_SENT_WEEKS, projectIds, book);
      if (!weeks.length) continue;
      const f = await factsOn(tx, org, employeeId, todayIst());
      const e = f ? null : await tx.employee.findFirst({ where: { organizationId: org, id: employeeId }, select: { givenName: true, familyName: true, preferredName: true } });
      const last = await tx.auditLog.findFirst({ where: { organizationId: org, entityType: 'employee', entityId: employeeId, action: 'timesheet.not_sent_reminded' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
      out.push({ employeeId, name: f?.name ?? [e?.preferredName || e?.givenName, e?.familyName].filter(Boolean).join(' '), userId: f?.userId ?? null, projects: mine.filter((p) => projectIds.includes(p.id)).map((p) => p.code), weeks, remindedAt: last?.createdAt ?? null });
    }
    return out.sort((a, b) => b.weeks.length - a.weeks.length || a.name.localeCompare(b.name));
  }

  teamNotSent(ctx: TenantContext, user: ScopeUser) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => ({ people: (await this.teamNotSentIn(tx, c, user.userId!)).map(({ userId: _u, ...p }) => ({ ...p, canRemind: Boolean(_u) && (!p.remindedAt || Date.now() - p.remindedAt.getTime() > REMIND_GAP_MS) })) }));
  }

  /** Answer 2535: the project manager reminds one person about their weeks not sent: at most once a day per person; audited. */
  async remindNotSent(ctx: TenantContext, user: ScopeUser, employeeId: string) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    const prep = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const p = (await this.teamNotSentIn(tx, c, user.userId!)).find((x) => x.employeeId === employeeId);
      if (!p) throw new NotFoundException('This person has no weeks to send on your projects.');
      if (!p.userId) throw new ConflictException(`${p.name} has no YukthiX sign-in to remind.`);
      // Claimed in the same transaction (under a lock), so two clicks never send two reminders.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ts-remind:${c.organizationId}:${employeeId}`}))`;
      const last = await tx.auditLog.findFirst({ where: { organizationId: c.organizationId, entityType: 'employee', entityId: employeeId, action: 'timesheet.not_sent_reminded', createdAt: { gt: new Date(Date.now() - REMIND_GAP_MS) } }, select: { id: true } });
      if (last) throw new ConflictException(`${p.name} was reminded in the last day. Try again tomorrow.`);
      await audit(tx, c, 'timesheet.not_sent_reminded', 'employee', employeeId, { weeks: p.weeks.map((w) => w.week), projects: p.projects });
      return p;
    });
    const list = prep.weeks.map((w) => `the week of ${fmt(w.week)}`).join(', ');
    const text = `Please send your timesheet for ${list} (${prep.projects.join(', ')}). Payroll needs full weeks.`;
    await this.notifications
      .notifySystem(ctx, [prep.userId!], 'timesheet.not_sent', { entityType: 'employee', entityId: employeeId, contextText: text.slice(0, 300), linkPath: '/yx/time/timesheet' }, { subject: 'Timesheet weeks not sent yet', html: `<p>${escapeHtml(text)}</p>` }, user.userId ?? null)
      .catch(() => undefined);
    return { reminded: true, weeks: prep.weeks.length };
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
      // Projects P-1 (answer 1404): with Projects on, only people allocated to a project book time to it, on the days
      // of their (confirmed) allocation; a company may switch this off (projects.booking.allocated_only).
      if (lines.length && (await settingFor(tx, c, 'projects.enabled', { legalEntityId: '' })) === 'on' && (await settingFor(tx, c, 'projects.booking.allocated_only', { legalEntityId: '' })) === 'on') {
        const allocs = await tx.projectAllocation.findMany({ where: { organizationId: org, employeeId: me, tentative: false, projectId: { in: lines.map((l) => l.projectId) }, fromOn: { lte: asDate(addDays(week, 6)) }, OR: [{ toOn: null }, { toOn: { gte: asDate(week) } }] } });
        for (const [i, l] of lines.entries()) {
          for (let k = 0; k < 7; k++) {
            if (!l.minutes[k]) continue;
            const d = addDays(week, k);
            if (!allocs.some((a) => a.projectId === l.projectId && dateOf(a.fromOn) <= d && (!a.toOn || dateOf(a.toOn) >= d))) {
              throw new BadRequestException(`Line ${i + 1}: you are not allocated to ${projects.get(l.projectId)!.code} on ${fmt(d)}. Ask the project manager to add you to the team.`);
            }
          }
        }
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
      if (lines.length) await tx.timesheetLine.createMany({ data: lines.map((l) => ({ organizationId: org, timesheetId: s.id, projectId: l.projectId, activity: l.activity || null, billable: l.billable, minutes: l.minutes, dayComments: sevenComments(l.comments) })) });
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
      const lines = await tx.timesheetLine.findMany({ where: { organizationId: org, timesheetId: sheet.id }, orderBy: { id: 'asc' } });
      const projects = await tx.timesheetProject.findMany({ where: { organizationId: org, id: { in: lines.map((l) => l.projectId) } } });
      // Answer 1787: every day with hours has its comment of N words before the week goes (Save draft never asks).
      const rule = await TimesheetService.noteRule(tx, c);
      const short = lines.flatMap((l) => dayCommentProblems(rule, l.minutes, l.dayComments).map((x) => `${projects.find((p) => p.id === l.projectId)?.code ?? 'A row'}${l.activity ? ` · ${l.activity}` : ''}, ${DAY_NAMES[x.day]} ${fmt(addDays(week, x.day))}: write at least ${rule.minWords} words (${x.words} so far)`));
      if (short.length) throw new BadRequestException({ statusCode: 400, code: 'NOTE_TOO_SHORT', message: short.join('; ') + '.' });
      // The person never approves their own hours, even as a project's manager.
      const pms = [...new Set(projects.map((p) => p.managerUserId).filter((x): x is string => Boolean(x) && x !== c.userId))];
      const byProject = projects.map((p) => `${p.code}: ${hours(lines.filter((l) => l.projectId === p.id).reduce((s, l) => s + l.minutes.reduce((a, b) => a + b, 0), 0))}`).join(', ');
      await tx.timesheet.update({ where: { id: sheet.id }, data: { status: 'pending', submittedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
      // Projects P-2 (1406): with Projects on, each line goes to its own approver on PRJ-02, never the whole week.
      if (await LineApprovalsService.on(tx, c)) {
        const approvers = await this.lineApprovals.startLines(tx, c, sheet, f);
        await audit(tx, c, 'time.timesheet.submitted', 'timesheet', sheet.id, { week, totalMinutes: sheet.totalMinutes, byLines: true });
        return { id: sheet.id, status: 'pending', approvers, name: f.name };
      }
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
      return { id: sheet.id, status: (await tx.timesheet.findFirstOrThrow({ where: { id: sheet.id } })).status, approvers: [] as string[], name: f.name };
    });
    await this.engine.send(ctx, notices);
    if (res.approvers.length)
      await this.notifications
        .notifySystem(ctx, res.approvers, 'time.timesheet.lines', { entityType: 'timesheet', entityId: res.id, contextText: `${res.name}: timesheet for the week of ${fmt(week)} is waiting for you`, linkPath: '/yx/projects/approvals' }, { subject: `Timesheet to approve: ${res.name}, week of ${fmt(week)}`, html: `<p>${escapeHtml(res.name)} submitted the week of ${escapeHtml(fmt(week))}. Approve, reduce or reject your project's lines in Projects › Timesheet approvals.</p>` })
        .catch(() => undefined);
    return { id: res.id, status: res.status };
  }

  async withdraw(ctx: TenantContext, user: ScopeUser, id: string) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const me = await myEmployeeId(tx, c.organizationId, c.userId);
      const s = await tx.timesheet.findFirst({ where: { organizationId: c.organizationId, id, employeeId: me } });
      if (!s) throw new NotFoundException('No such timesheet.');
      if (s.status !== 'pending') throw new ConflictException('Only a week still waiting can be withdrawn.');
      if (s.wfRequestId) await this.engine.withdraw(tx, c, s.wfRequestId, c.userId ?? null, 'Withdrawn by the employee');
      else await this.lineApprovals.withdrawLines(tx, c.organizationId, s.id);
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
      // Answer 497: an own-payroll worker placed at a client: the week flows into the placement's hours (once).
      await hoursFromTimesheet(tx, c, s);
    }
  }
}
