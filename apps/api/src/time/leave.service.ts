import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { employeeLanguage, translated } from '../global/global-data';
import { Viewer, buildViewer, has, implicitSql, tenantWide, type ScopeUser, inEntitySql } from '../access/scope';
import { ApprovalsEngine, Notice, StepSpec } from '../workflow/approvals-engine.service';
import { DayEngine } from './day-engine.service';
import { payOn } from '../payroll/fnf.service';
import { ApplyLeaveDto, AdjustDto, LeavePlanDto } from './dto';
import {
  Facts,
  LeaveRules,
  PolicyLine,
  TIME_KEYS,
  asDate,
  dateOf,
  factsOn,
  grantCovers,
  hasBalance,
  hrApprovers,
  leaveYearFor,
  holidaysFor,
  maternityValues,
  mustSee,
  myEmployeeId,
  num,
  policyOn,
  settingOn,
  statutoryOn,
  todayIn,
  visibleSql,
} from './time-core';
import { CountedDay, accrualsDue, addDays, applyFloors, countLeaveDays, daysBetween } from './time-maths';
import { ScheduleBook, assertOpen, lockedDates } from './schedule';
import { MaternityCase, daysWorked, eligibilityWindow, maternityChecks } from './time-rules';
import { BLOCK_DATE_EXEMPT, blockDateStops, creditsDuringAbsence, encashAmount, encashTerms, yearEndWithEncash, monthLimitOver, monthName, noticePeriodMode, statutoryProblem, factoriesElEligible, lastDayAfterLeave, noticeDaysFor, noticeText, optionalLimitAfterMove, probationAllows } from './leave-rules';

// M02 Part A leave on the shared engines: requests route through P03 (manager, then HR by the type's rule), the
// ledger is the only balance (YX-LV-01), days are counted with the location's holidays and weekly offs (YX-LV-03),
// rules are checked before submit (YX-LV-05), medical reasons are Special (YX-LV-09). Approved leave hands an
// approver's tasks to their delegate (P03 Q3) and feeds attendance and the Service Desk.

export const LEAVE_REQUEST = 'leave.request';
export const LEAVE_CANCEL = 'leave.cancel';
const ACTIVE = ['pending', 'approved', 'cancel_pending'];
const NAME = Prisma.raw(`concat_ws(' ', coalesce(e.preferred_name, e.given_name), e.family_name)`);
type Off = { employeeId: string; name: string; on: string; type: string };
/** Who else is off on any day from `from` to `to` (names once each, with their leave type), leaving out `except`. */
const offBetween = (off: Off[], from: string, to: string, except: string) =>
  [...new Map(off.filter((o) => o.employeeId !== except && o.on >= from && o.on <= to).map((o) => [o.employeeId, { name: o.name, type: o.type }])).values()];
type Req = Prisma.LeaveRequestGetPayload<object>;
type LeaveTypeRow = Prisma.LeaveTypeGetPayload<object>;

const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
/** "3 Nov 2026" (founder rule 8). */
const fullDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const daysText = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
const rangeText = (from: string, to: string) => (from === to ? fmt(from) : `${fmt(from)} to ${fmt(to)}`);

export interface Balance {
  leaveTypeId: string;
  code: string;
  name: string;
  kind: string;
  colour: string;
  paid: boolean;
  hasBalance: boolean;
  /** YX-LV-01: the sum of the ledger. */
  balance: number;
  pending: number;
  available: number;
  takenThisYear: number;
  entitlement: number | null;
  negativeLimit: number;
}

export interface Plan {
  type: { id: string; code: string; name: string; kind: string; rules: LeaveRules };
  days: CountedDay[];
  total: number;
  holidaysExcluded: number;
  sandwichDays: number;
  balance: Balance | null;
  balanceAfter: number | null;
  othersOff: number;
  certificateNeeded: boolean;
  /** Stop the request (YX-LV-05). */
  blocks: string[];
  warnings: string[];
  /** Leave v2: company block dates the leave touches (blocked or warned by leave.block_dates.mode). */
  blockDates: { from: string; to: string; reason: string }[];
  /** Leave v2: on notice, the last working day now and after this leave (leave.notice_period.leave). */
  notice: { lastDay: string; newLastDay: string } | null;
  /** Leave v2: shorter notice than the type asks (the type's noticeMode says block or warn). */
  shortNotice: boolean;
  /** Founder decision 2: the notice this type asks for (its own, or the company default; sick leave 0). */
  noticeDays: number;
  /** HR applied for someone with shorter notice and the company skips notice then (audited). */
  noticeSkipped: boolean;
}

@Injectable()
export class LeaveService implements OnModuleInit {
  private readonly logger = new Logger(LeaveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly engine: ApprovalsEngine,
    private readonly dayEngine: DayEngine,
  ) {}

  onModuleInit() {
    // Leave never decides itself after a timeout: it escalates (P03 Q2).
    this.engine.register({
      key: LEAVE_REQUEST,
      label: 'Leave',
      risk: 'normal',
      autoActions: false,
      onDecided: (tx, req, outcome) => this.requestDecided(tx, req, outcome),
      requesterLink: () => '/yx/time/leave',
      // Founder (30 Oct 2026): "Send back for changes" (setting leave.send_back, default on).
      sendBack: { allowed: (tx, req) => this.sendBackAllowed(tx, req), apply: (tx, req, reason) => this.sentBack(tx, req, reason) },
    });
    this.engine.register({ key: LEAVE_CANCEL, label: 'Leave cancellation', risk: 'normal', autoActions: false, onDecided: (tx, req, outcome) => this.cancelDecided(tx, req, outcome), requesterLink: () => '/yx/time/leave' });
  }

  viewer(user: ScopeUser): Promise<Viewer> {
    return buildViewer(this.prisma, this.tenantPrisma, user, [...TIME_KEYS]);
  }

  private async ownId(tx: Tx, c: CompanyContext, v: Viewer) {
    if (!v.userId || v.actingForOther) return null;
    return (await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: v.userId }, select: { id: true } }))?.id ?? null;
  }

  // ------------------------------------------------------------------------------------------ balances

  private async types(tx: Tx, org: string): Promise<LeaveTypeRow[]> {
    return tx.leaveType.findMany({ where: { organizationId: org }, orderBy: [{ kind: 'asc' }, { code: 'asc' }] });
  }

  /** Annual days per policy line with the state's statutory floor applied (P07: never below the law). */
  private async entitlements(tx: Tx, f: Facts, on: string, lines: PolicyLine[], types: LeaveTypeRow[]): Promise<Map<string, number>> {
    const kinds = new Map(types.map((t) => [t.id, t.kind]));
    const st = await statutoryOn(tx, f.state, on, f.factory);
    const floored = applyFloors(lines.map((l) => ({ kind: kinds.get(l.leaveTypeId) ?? 'other', annualDays: l.annualDays })), st.floors);
    return new Map(lines.map((l, i) => [l.leaveTypeId, floored.annual[i]]));
  }

  async balancesIn(tx: Tx, c: CompanyContext, f: Facts, on: string): Promise<Balance[]> {
    const org = c.organizationId;
    const types = (await this.types(tx, org)).filter((t) => t.active);
    const policy = await policyOn(tx, c, f, on);
    const lines = policy?.lines ?? [];
    const ent = await this.entitlements(tx, f, on, lines, types);
    const year = await leaveYearFor(tx, c, f, on);
    const sums = new Map((await tx.leaveLedgerEntry.groupBy({ by: ['leaveTypeId'], where: { organizationId: org, employeeId: f.employeeId }, _sum: { days: true } })).map((g) => [g.leaveTypeId, num(g._sum.days)]));
    const pending = new Map((await tx.leaveRequest.groupBy({ by: ['leaveTypeId'], where: { organizationId: org, employeeId: f.employeeId, status: 'pending' }, _sum: { days: true } })).map((g) => [g.leaveTypeId, num(g._sum.days)]));
    // TIM-24: an encashment waiting for approval holds its days too, so they can't also be booked as leave.
    for (const g of await tx.leaveEncashment.groupBy({ by: ['leaveTypeId'], where: { organizationId: org, employeeId: f.employeeId, status: 'pending' }, _sum: { days: true } })) pending.set(g.leaveTypeId, (pending.get(g.leaveTypeId) ?? 0) + num(g._sum.days));
    const taken = await tx.$queryRaw<{ id: string; days: number }[]>`
      SELECT r.leave_type_id::text AS id, sum(d.portion)::float AS days FROM leave_request_days d
      JOIN leave_requests r ON r.organization_id = d.organization_id AND r.id = d.request_id
      WHERE d.organization_id = ${org}::uuid AND d.employee_id = ${f.employeeId}::uuid AND d.active AND r.status IN ('approved', 'cancel_pending')
        AND d.leave_on BETWEEN ${year.start}::date AND ${year.end}::date GROUP BY 1`;
    const takenBy = new Map(taken.map((t) => [t.id, t.days]));
    const inPolicy = new Set(lines.map((l) => l.leaveTypeId));
    return types
      .filter((t) => inPolicy.has(t.id) || sums.has(t.id) || !hasBalance(t.kind))
      .map((t) => {
        const withBalance = hasBalance(t.kind);
        const balance = withBalance ? Math.round((sums.get(t.id) ?? 0) * 100) / 100 : 0;
        const p = pending.get(t.id) ?? 0;
        return {
          leaveTypeId: t.id,
          code: t.code,
          name: t.name,
          kind: t.kind,
          colour: t.colour,
          paid: t.paid,
          hasBalance: withBalance,
          balance,
          pending: p,
          available: withBalance ? Math.round((balance - p) * 100) / 100 : 0,
          takenThisYear: takenBy.get(t.id) ?? 0,
          entitlement: ent.get(t.id) ?? null,
          negativeLimit: Number((t.rules as unknown as LeaveRules).negativeLimit ?? 0),
        };
      });
  }

  // ------------------------------------------------------------------------------------------ planning a request

  private async plan(tx: Tx, c: CompanyContext, f: Facts, dto: LeavePlanDto, today: string): Promise<Plan> {
    const org = c.organizationId;
    const t = await tx.leaveType.findFirst({ where: { organizationId: org, id: dto.leaveTypeId, active: true } });
    if (!t) throw new NotFoundException('No such leave type.');
    const rules = t.rules as unknown as LeaveRules;
    const fromHalf = dto.fromHalf ?? 'full';
    const toHalf = dto.toHalf ?? 'full';
    const blocks: string[] = [];
    const warnings: string[] = [];
    if (dto.to < dto.from) throw new BadRequestException('The last day is before the first day.');
    if (daysBetween(dto.from, dto.to) > 200) throw new BadRequestException('Apply for up to 200 days at a time.');
    if (dto.from === dto.to && fromHalf === 'second' && toHalf === 'first') throw new BadRequestException('Choose the first half or the second half of that day, not both.');
    const balances = await this.balancesIn(tx, c, f, dto.from < today ? today : dto.from);
    const balance = balances.find((b) => b.leaveTypeId === t.id) ?? null;
    // Someone else applying (HR): the messages name the person instead of "you".
    const onBehalf = Boolean(c.userId) && c.userId !== f.userId;
    const whose = onBehalf ? `${f.name}'s` : 'your';
    if (!balance) blocks.push(`${t.name} is not part of ${whose} leave policy.`);
    const { map } = await holidaysFor(tx, org, f.locationId, dto.from, dto.to, f.employeeId);
    // Weekly offs per date from the person's roster, pattern or location (Q1, YX-LV-03).
    const book = await ScheduleBook.load(tx, org);
    await book.prime([f.employeeId], dto.from, dto.to);
    const offs = new Set<string>();
    for (let d = dto.from; d <= dto.to; d = addDays(d, 1)) if ((await book.day(f, d)).weeklyOff) offs.add(d);
    const counted = countLeaveDays({ from: dto.from, to: dto.to, fromHalf, toHalf, holidays: map, weeklyOff: (d) => offs.has(d), rules: rules });
    const total = counted.total;
    if (!rules.halfDays && (fromHalf !== 'full' || toHalf !== 'full')) blocks.push(`${t.name} is taken in whole days.`);
    if (total === 0) blocks.push('Those days are holidays or weekly offs. Nothing to apply for.');
    if (dto.from < f.joinedOn || (f.exitedOn && dto.to > f.exitedOn)) blocks.push(`Some of those days are outside ${whose} employment.`);
    // P08: a locked month takes an HR correction (YX-LV-08).
    const locked = [...(await lockedDates(tx, org, f.employeeId, dto.from, dto.to))].sort();
    if (locked.length) blocks.push(`${new Date(`${locked[0]}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })} is locked for attendance and leave. Ask HR to record it.`);
    blocks.push(...(await this.eligibility(tx, org, f, t, rules, dto, today)));
    const v2 = await this.v2Checks(tx, c, f, t, counted.days.filter((x) => x.portion > 0).map((x) => x.on), counted.total, dto, today, warnings);
    blocks.push(...v2.blocks);
    if (dto.from < addDays(today, -60)) blocks.push('Leave more than 60 days back needs HR. Ask them to record it.');
    // Founder decision 2: the type's own notice, else the company default (sick leave 0). HR applying for someone skips
    // it unless the company says it applies (leave.notice.on_behalf); applyIn audits the skip.
    const noticeDays = noticeDaysFor(rules.noticeDays, t.kind, Number(await settingOn(tx, c, 'leave.notice_days.default', f, dto.from)));
    const short = noticeDays > 0 && daysBetween(today, dto.from) < noticeDays;
    const noticeSkipped = short && onBehalf && (await settingOn(tx, c, 'leave.notice.on_behalf', f, dto.from)) === 'skip';
    const shortNotice = short && !noticeSkipped;
    if (shortNotice)
      (rules.noticeMode === 'warn' ? warnings : blocks).push(
        rules.noticeMode === 'warn'
          ? `Short notice: ${t.name} asks for ${noticeText(noticeDays)} notice. Your approver sees this.`
          : `${t.name} needs ${noticeText(noticeDays)} notice. Pick a date on or after ${fullDate(addDays(today, noticeDays))}${onBehalf ? '' : ', or ask your manager'}.`,
      );
    if (rules.minDays !== null && total > 0 && total < rules.minDays) blocks.push(`${t.name} is at least ${daysText(rules.minDays)} at a time.`);
    if (rules.maxDays !== null && total > rules.maxDays) blocks.push(`${t.name} is at most ${daysText(rules.maxDays)} at a time.`);
    // TIM-27 "Most days in a month": this type's days asked or approved in each calendar month the request touches.
    if (rules.maxDaysPerMonth !== null && rules.maxDaysPerMonth !== undefined && total > 0) {
      const months = await tx.$queryRaw<{ month: string; days: number }[]>`
        SELECT to_char(d.leave_on, 'YYYY-MM') AS month, sum(d.portion)::float AS days FROM leave_request_days d
        JOIN leave_requests r ON r.organization_id = d.organization_id AND r.id = d.request_id
        WHERE d.organization_id = ${org}::uuid AND d.employee_id = ${f.employeeId}::uuid AND d.active AND d.portion > 0 AND r.leave_type_id = ${t.id}::uuid
          AND r.status = ANY(${ACTIVE}::text[]) AND d.leave_on BETWEEN date_trunc('month', ${dto.from}::date) AND (date_trunc('month', ${dto.to}::date) + interval '1 month - 1 day')
        GROUP BY 1`;
      const over = monthLimitOver(rules.maxDaysPerMonth, counted.days, new Map(months.map((m) => [m.month, m.days])));
      if (over) {
        const limit = rules.maxDaysPerMonth;
        const who = onBehalf ? `${f.name} already has` : 'You already have';
        blocks.push(over.already ? `${t.name} is at most ${daysText(limit)} in a month. ${who} ${daysText(over.already)} in ${monthName(over.month)}, so up to ${daysText(Math.max(0, limit - over.already))} more can be taken then.` : `${t.name} is at most ${daysText(limit)} in a month. This asks for ${daysText(over.asked)} in ${monthName(over.month)}.`);
      }
    }
    // DECISION NEEDED: P05 documents are not built yet, so a certificate is not uploaded here: the employee confirms
    // they will give it to HR, HR marks it verified (Special data), and approvers see only its status (YX-LV-09).
    const certificateNeeded = rules.certificateAfterDays !== null && total > rules.certificateAfterDays;
    // Overlap (a first half and a second half of one date may sit side by side).
    const clash = await tx.$queryRaw<{ on: string }[]>`
      SELECT d.leave_on::text AS on FROM leave_request_days d
      JOIN leave_requests r ON r.organization_id = d.organization_id AND r.id = d.request_id
      WHERE d.organization_id = ${org}::uuid AND d.employee_id = ${f.employeeId}::uuid AND d.active AND d.portion > 0
        AND r.status = ANY(${ACTIVE}::text[]) AND d.leave_on BETWEEN ${dto.from}::date AND ${dto.to}::date
        AND (d.part = 'full' OR d.part = ANY(${counted.days.filter((x) => x.portion > 0).map((x) => (x.part === 'full' ? ['first', 'second', 'full'] : [x.part])).flat()}::text[]))
        AND d.leave_on = ANY(${counted.days.filter((x) => x.portion > 0).map((x) => x.on)}::text[]::date[])
      ORDER BY 1 LIMIT 1`;
    if (clash.length) blocks.push(`${onBehalf ? `${f.name} already has` : 'You already have'} leave on ${fmt(clash[0].on)}.`);
    let balanceAfter: number | null = null;
    if (balance?.hasBalance) {
      balanceAfter = Math.round((balance.available - total) * 100) / 100;
      if (balanceAfter < -balance.negativeLimit) blocks.push(`Not enough ${t.name}: ${balance.available} available, ${total} asked.`);
      else if (balanceAfter < 0) warnings.push(`This takes your balance to ${balanceAfter}. Future credits repay it first.`);
    }
    const sandwichDays = counted.days.filter((d) => d.countedAs === 'sandwich').length;
    const holidaysExcluded = counted.days.filter((d) => d.portion === 0).length;
    if (sandwichDays) warnings.push(`${daysText(sandwichDays)} between your leave days count too (sandwich rule).`);
    // Team availability for the approval card ("2 others off").
    const [{ n }] = f.managerEmployeeId
      ? await tx.$queryRaw<{ n: number }[]>`
          SELECT count(DISTINCT d.employee_id)::int AS n FROM leave_request_days d
          JOIN leave_requests r ON r.organization_id = d.organization_id AND r.id = d.request_id AND r.status = ANY(${ACTIVE}::text[])
          JOIN employee_assignments a ON a.organization_id = d.organization_id AND a.employee_id = d.employee_id AND a.superseded_at IS NULL
           AND ${today}::date <@ daterange(a.valid_from, a.valid_to, '[]') AND a.manager_employee_id = ${f.managerEmployeeId}::uuid
          WHERE d.organization_id = ${org}::uuid AND d.active AND d.portion > 0 AND d.employee_id <> ${f.employeeId}::uuid
            AND d.leave_on BETWEEN ${dto.from}::date AND ${dto.to}::date`
      : [{ n: 0 }];
    return { type: { id: t.id, code: t.code, name: t.name, kind: t.kind, rules }, days: counted.days, total, holidaysExcluded, sandwichDays, balance, balanceAfter, othersOff: n, certificateNeeded, blocks, warnings, blockDates: v2.blockDates, notice: v2.notice, shortNotice, noticeDays, noticeSkipped };
  }

  /**
   * Leave v2 rules (29 Oct 2026), each a company setting with a default: company block dates, probation, leave during
   * the notice period, and earned leave in a factory (Factories Act s.79: 240 days worked the year before). An HR
   * eligibility override in force lets a person through the probation and Factories Act checks.
   */
  private async v2Checks(tx: Tx, c: CompanyContext, f: Facts, t: LeaveTypeRow, leaveOn: string[], total: number, dto: LeavePlanDto, today: string, warnings: string[]) {
    const org = c.organizationId;
    const blocks: string[] = [];
    const setting = (key: string) => settingOn(tx, c, key, f, dto.from);
    const override = await tx.leaveEligibilityOverride.findFirst({ where: { organizationId: org, employeeId: f.employeeId, leaveTypeId: t.id, validUntil: { gte: asDate(today) } }, select: { id: true } });
    // Company block dates: the leave types HR chose; none chosen means planned leave only (never sick or per-event leave).
    let blockDates: Plan['blockDates'] = [];
    if (leaveOn.length) {
      const rows = await tx.$queryRaw<{ from: string; to: string; reason: string; types: string[] }[]>`
        SELECT from_on::text AS "from", to_on::text AS "to", reason, leave_type_ids::text[] AS types FROM leave_block_dates
        WHERE organization_id = ${org}::uuid AND removed_at IS NULL AND from_on <= ${leaveOn[leaveOn.length - 1]}::date AND to_on >= ${leaveOn[0]}::date
          AND (scope_type = 'tenant' OR (scope_type = 'legal_entity' AND scope_id = ${f.legalEntityId}::uuid) OR (scope_type = 'location' AND scope_id = ${f.locationId}::uuid))
        ORDER BY from_on`;
      blockDates = rows.filter((b) => blockDateStops(b.types, t.id, t.kind) && leaveOn.some((d) => d >= b.from && d <= b.to)).map(({ from, to, reason }) => ({ from, to, reason }));
      if (blockDates.length) {
        const b = blockDates[0];
        const text = `${rangeText(b.from, b.to)} is a company block date (${b.reason}).`;
        if ((await setting('leave.block_dates.mode')) === 'warn') warnings.push(`${text} Your approver sees this.`);
        else blocks.push(`${text} ${t.name} can't be taken on it. Choose other dates or ask HR.`);
      }
    }
    // Probation (the planned end date of the employment's probation).
    const [prob] = await tx.$queryRaw<{ end: string }[]>`
      SELECT p.planned_end_on::text AS end FROM probations p
      JOIN employee_assignments a ON a.organization_id = p.organization_id AND a.employment_id = p.employment_id AND a.employee_id = ${f.employeeId}::uuid AND a.superseded_at IS NULL
      WHERE p.organization_id = ${org}::uuid AND p.planned_end_on >= ${dto.from}::date LIMIT 1`;
    if (prob && !override) {
      const mode = await setting('leave.probation.leave');
      if (!probationAllows(mode, t.kind)) blocks.push(`You are on probation until ${fmt(prob.end)}. ${mode === 'unpaid_only' ? 'Only unpaid leave' : 'Only casual, sick and unpaid leave'} can be taken until then.`);
    }
    // Leave during the notice period.
    let notice: Plan['notice'] = null;
    const [exit] = await tx.$queryRaw<{ lwd: string }[]>`
      SELECT coalesce(approved_lwd, standard_lwd)::text AS lwd FROM exit_cases
      WHERE organization_id = ${org}::uuid AND employee_id = ${f.employeeId}::uuid AND status IN ('submitted', 'accepted') ORDER BY submitted_on DESC LIMIT 1`;
    if (exit && dto.to >= today) {
      // TIM-27 Absence & notice: the type's own choice, else the company's.
      const mode = noticePeriodMode((t.rules as unknown as LeaveRules).noticePeriod, await setting('leave.notice_period.leave'));
      if (dto.to > exit.lwd) blocks.push(`Your last working day is ${fmt(exit.lwd)}. Leave can't go past it.`);
      else if (mode === 'blocked') blocks.push(`${t.name} can't be taken during the notice period. Ask HR if you need leave before ${fmt(exit.lwd)}.`);
      else if (mode === 'sick_and_unpaid_only' && !BLOCK_DATE_EXEMPT.includes(t.kind)) blocks.push('During your notice period only sick and unpaid leave can be taken. Ask HR if you need other leave.');
      else {
        notice = { lastDay: exit.lwd, newLastDay: lastDayAfterLeave(mode, exit.lwd, total) };
        warnings.push(notice.newLastDay === exit.lwd ? `You are on notice. Your last working day stays ${fmt(exit.lwd)}.` : `You are on notice. This leave moves your last working day from ${fmt(exit.lwd)} to ${fmt(notice.newLastDay)} once HR confirms it.`);
      }
    }
    // Earned leave in a factory: 240 days worked in the calendar year before (Factories Act 1948 s.79).
    if (t.kind === 'earned' && !override && (await setting('attendance.factories_act')) === 'covered') {
      const y = Number(dto.from.slice(0, 4)) - 1;
      const prev = { prevYearStart: `${y}-01-01`, prevYearEnd: `${y}-12-31` };
      const statuses = await tx.attendanceDay.findMany({ where: { organizationId: org, employeeId: f.employeeId, workOn: { gte: asDate(prev.prevYearStart), lte: asDate(prev.prevYearEnd) } }, select: { status: true } });
      const e = factoriesElEligible({ ...prev, worked: daysWorked(statuses.map((x) => x.status)), joinedOn: f.joinedOn });
      if (!e.ok) blocks.push(`Earned leave in a factory needs ${e.needed} days worked in ${y} (Factories Act). Ask HR if this is wrong.`);
    }
    return { blocks, blockDates, notice };
  }

  /**
   * Founder decision 9 Oct 2026 (YX-LV-10): eligibility is checked by the system with a plain reason: the type's
   * genders (Personal data, read here only to decide), and for maternity the P07 case limits, the start at most 8 weeks
   * before delivery and 80 days worked in the 12 months before the expected date. An HR override in force lets the
   * person through the eligibility checks (never the statutory length limits).
   */
  private async eligibility(tx: Tx, org: string, f: Facts, t: LeaveTypeRow, rules: LeaveRules, dto: LeavePlanDto, today: string): Promise<string[]> {
    const out: string[] = [];
    const override = await tx.leaveEligibilityOverride.findFirst({ where: { organizationId: org, employeeId: f.employeeId, leaveTypeId: t.id, validUntil: { gte: asDate(today) } }, orderBy: { createdAt: 'desc' } });
    if (rules.eligibleGenders?.length && !override) {
      const pd = await tx.employeePersonalDetails.findFirst({ where: { organizationId: org, employeeId: f.employeeId }, select: { gender: true } });
      if (!pd?.gender || !rules.eligibleGenders.includes(pd.gender)) out.push(`${t.name} is not available to you under the leave policy${pd?.gender ? '' : ' (no gender is recorded on your profile)'}. Ask HR if this is wrong.`);
    }
    if (t.kind !== 'maternity') return out;
    if (!dto.expectedOn || !dto.maternityCase) return [...out, 'Give the expected date of delivery (or of the event) and the kind of maternity leave.'];
    const win = eligibilityWindow(dto.expectedOn);
    const statuses = await tx.attendanceDay.findMany({ where: { organizationId: org, employeeId: f.employeeId, workOn: { gte: asDate(win.from), lte: asDate(win.to) } }, select: { status: true } });
    const checks = maternityChecks({ values: await maternityValues(tx, dto.from), maternityCase: dto.maternityCase as MaternityCase, expectedOn: dto.expectedOn, from: dto.from, to: dto.to, worked: daysWorked(statuses.map((s) => s.status)) });
    return [...out, ...checks.filter((m) => !(override && m.includes('days worked')))];
  }

  /** HR lets one person through an eligibility check for one leave type until a date, with a reason (audited). */
  async overrideEligibility(ctx: TenantContext, user: ScopeUser, employeeId: string, dto: { leaveTypeId: string; validUntil: string; reason: string }) {
    const v = await this.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const own = await this.ownId(tx, c, v);
      const today = new Date().toISOString().slice(0, 10);
      if (!(await grantCovers(tx, c, v, own, 'leave.eligibility.override', employeeId, today))) throw new NotFoundException('Not found');
      if (employeeId === own) throw new ForbiddenException('You cannot override a check on your own leave. Ask another HR admin.');
      if (dto.validUntil < today || daysBetween(today, dto.validUntil) > 400) throw new BadRequestException('The override ends today or later, within 400 days.');
      const t = await tx.leaveType.findFirst({ where: { organizationId: c.organizationId, id: dto.leaveTypeId } });
      if (!t) throw new BadRequestException('Choose a leave type of this company.');
      const o = await tx.leaveEligibilityOverride.create({ data: { organizationId: c.organizationId, employeeId, leaveTypeId: t.id, validUntil: asDate(dto.validUntil), reason: dto.reason, createdBy: c.userId! } });
      await audit(tx, c, 'leave.eligibility.overridden', 'leave_type', t.id, { employeeId, type: t.code, validUntil: dto.validUntil, reason: dto.reason, overrideId: o.id });
      return { id: o.id };
    });
  }

  async meFacts(tx: Tx, c: CompanyContext, userId: string | null | undefined): Promise<{ f: Facts; today: string }> {
    const id = await myEmployeeId(tx, c.organizationId, userId);
    const now = await factsOn(tx, c.organizationId, id, new Date().toISOString().slice(0, 10));
    const f = now ?? (await factsOn(tx, c.organizationId, id, addDays(new Date().toISOString().slice(0, 10), 1)));
    if (!f) throw new NotFoundException({ statusCode: 404, code: 'NO_EMPLOYEE_RECORD', message: 'You have no job assignment today. Ask HR to check your record.' });
    return { f, today: todayIn(f.zone) };
  }

  preview(ctx: TenantContext, dto: LeavePlanDto) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { f, today } = await this.meFacts(tx, c, c.userId);
      return this.plan(tx, c, f, dto, today);
    });
  }

  // ------------------------------------------------------------------------------------------ my leave

  me(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { f, today } = await this.meFacts(tx, c, c.userId);
      const org = c.organizationId;
      // G1 (gap pass G1): leave names in the person's language where the company translated them.
      const words = await translated(tx, c, await employeeLanguage(tx, c, f.employeeId), 'leave_type', (await this.types(tx, org)).map((t) => t.id));
      const year = await leaveYearFor(tx, c, f, today);
      // The balance on the first day of the leave year (opening entries included), where the ledger has one: the
      // Home says how it changed since then.
      const atStart = new Map((await tx.leaveLedgerEntry.groupBy({ by: ['leaveTypeId'], where: { organizationId: org, employeeId: f.employeeId, entryOn: { lte: asDate(year.start) } }, _sum: { days: true } })).map((g) => [g.leaveTypeId, Math.round(num(g._sum.days) * 100) / 100]));
      const balances = (await this.balancesIn(tx, c, f, today)).map((b) => ({ ...b, name: words.get(b.leaveTypeId) ?? b.name, ...(b.hasBalance && atStart.has(b.leaveTypeId) ? { atYearStart: atStart.get(b.leaveTypeId)! } : {}) }));
      const requests = await tx.leaveRequest.findMany({ where: { organizationId: org, employeeId: f.employeeId, toOn: { gte: asDate(addDays(today, -400)) } }, orderBy: { fromOn: 'desc' }, take: 100 });
      const types = new Map((await this.types(tx, org)).map((t) => [t.id, { ...t, name: words.get(t.id) ?? t.name }]));
      const cal = (await tx.holidayCalendar.findFirst({ where: { organizationId: org, locationId: f.locationId } })) ?? (await tx.holidayCalendar.findFirst({ where: { organizationId: org, locationId: null } }));
      const holidays = cal ? await tx.holiday.findMany({ where: { organizationId: org, calendarId: cal.id, holidayOn: { gte: asDate(year.start), lte: asDate(year.end) } }, orderBy: { holidayOn: 'asc' } }) : [];
      const chosen = new Set((await tx.optionalHolidayChoice.findMany({ where: { organizationId: org, employeeId: f.employeeId } })).map((x) => x.holidayId));
      const limit = cal ? await this.optionalLimit(tx, c, f, cal, year.start, today) : null;
      return {
        employee: { id: f.employeeId, name: f.name, code: f.code },
        today,
        year,
        balances,
        requests: await this.sentBackNotes(tx, org, requests).then((notes) => requests.map((r) => ({ ...this.requestView(r, types.get(r.leaveTypeId), true), sentBack: notes.get(r.id) ?? null }))),
        holidays: {
          calendar: cal && limit ? { id: cal.id, name: cal.name, optionalLimit: limit.limit, yearlyLimit: cal.optionalLimit, movedOn: limit.movedOn } : null,
          list: holidays.map((h) => ({ id: h.id, on: dateOf(h.holidayOn), name: h.name, kind: h.kind, halfDay: h.halfDay, chosen: chosen.has(h.id) })),
        },
      };
    });
  }

  private requestView(r: Req, t: LeaveTypeRow | undefined, withReason: boolean) {
    return {
      id: r.id,
      employeeId: r.employeeId,
      type: t ? { id: t.id, code: t.code, name: t.name, colour: t.colour, medical: Boolean((t.rules as unknown as LeaveRules).medical) } : null,
      from: dateOf(r.fromOn),
      to: dateOf(r.toOn),
      fromHalf: r.fromHalf,
      toHalf: r.toHalf,
      days: num(r.days),
      status: r.status,
      certificate: r.certificate,
      reason: withReason ? r.reason : null,
      wfRequestId: r.wfRequestId,
      createdAt: r.createdAt,
      decidedAt: r.decidedAt,
    };
  }

  /** Apply (TIM-18): checks, the per-day breakdown, then P03 in the same transaction (YX-WF-01). */
  async apply(ctx: TenantContext, user: ScopeUser, dto: ApplyLeaveDto) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    const notices: Notice[] = [];
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { f, today } = await this.meFacts(tx, c, c.userId);
      return this.applyIn(tx, c, f, today, dto, notices);
    });
    await this.engine.send(ctx, notices);
    return res;
  }

  /**
   * TIM-13: leave the person applies at a kiosk after code and PIN (or the ID card): as if they applied themselves
   * (the same rules, notice and approval chain), so the request and its audit name them.
   */
  async applyAtKiosk(c: CompanyContext, f: Facts, dto: ApplyLeaveDto) {
    const notices: Notice[] = [];
    const res = await this.tenantPrisma.forTenant(c, (tx) => this.applyIn(tx, { ...c, userId: f.userId }, f, todayIn(f.zone), dto, notices));
    await this.engine.send(c as TenantContext, notices);
    return res;
  }

  /**
   * Founder decision 2: HR applies leave for someone in their leave.balance.adjust scope (never their own: My leave),
   * never while acting for someone else; another company's person is 404. The notice rule follows
   * leave.notice.on_behalf (skip by default, audited on the request). Founder answer B: the request goes through the
   * person's normal approval chain with an "Applied by HR" note, unless leave.on_behalf.approval says "approved" and the
   * HR person also holds leave.approve over them (then it is approved at once, audited).
   */
  async applyFor(ctx: TenantContext, user: ScopeUser, employeeId: string, dto: ApplyLeaveDto) {
    const notices: Notice[] = [];
    const res = await this.forSomeone(ctx, user, employeeId, (tx, c, f, today, v, own) => this.applyIn(tx, c, f, today, dto, notices, { v, own }), dto.from);
    await this.engine.send(ctx, notices);
    return res;
  }

  /** GET hr/leave/:employeeId: what the Apply-for-someone dialog needs: the person, their leave types and balances. */
  applyForForm(ctx: TenantContext, user: ScopeUser, employeeId: string) {
    return this.forSomeone(ctx, user, employeeId, async (tx, c, f, today, v, own) => ({
      employee: { id: f.employeeId, name: f.name, code: f.code },
      today,
      balances: await this.balancesIn(tx, c, f, today),
      approval: await this.hrApproval(tx, c, f, today, v, own),
    }));
  }

  /** POST hr/leave/:employeeId/preview: the same summary the person would see, with HR's notice rule and approval. */
  previewFor(ctx: TenantContext, user: ScopeUser, employeeId: string, dto: LeavePlanDto) {
    return this.forSomeone(ctx, user, employeeId, async (tx, c, f, today, v, own) => ({ ...(await this.plan(tx, c, f, dto, today)), approval: await this.hrApproval(tx, c, f, today, v, own) }), dto.from);
  }

  private async forSomeone<T>(ctx: TenantContext, user: ScopeUser, employeeId: string, fn: (tx: Tx, c: CompanyContext, f: Facts, today: string, v: Viewer, own: string | null) => Promise<T>, on?: string) {
    const v = await this.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const own = await this.ownId(tx, c, v);
      const today = todayIn('Asia/Kolkata');
      if (!(await grantCovers(tx, c, v, own, 'leave.balance.adjust', employeeId, today))) throw new NotFoundException('Not found');
      if (employeeId === own) throw new ForbiddenException('Apply for your own leave in My leave.');
      const f = (await factsOn(tx, c.organizationId, employeeId, today)) ?? (on ? await factsOn(tx, c.organizationId, employeeId, on) : null);
      if (!f) throw new BadRequestException('That person has no job on those dates.');
      return fn(tx, c, f, todayIn(f.zone), v, own);
    });
  }

  /**
   * HLP-12 (founder answer 43): injury leave from an accident case, raised inside the case's transaction by the safety
   * team or the case's HR handler (the case checks that). The leave type's own rules and the person's normal approval
   * chain apply, as for any request; the caller sends `notices` after the transaction (sendNotices).
   */
  async applyForCase(tx: Tx, c: CompanyContext, employeeId: string, dto: ApplyLeaveDto, notices: Notice[]) {
    const f = (await factsOn(tx, c.organizationId, employeeId, todayIn('Asia/Kolkata'))) ?? (await factsOn(tx, c.organizationId, employeeId, dto.from));
    if (!f) throw new BadRequestException('That person has no job on those dates.');
    return this.applyIn(tx, c, f, todayIn(f.zone), dto, notices);
  }

  sendNotices(ctx: TenantContext, notices: Notice[]) {
    return this.engine.send(ctx, notices);
  }

  /** 'chain': the normal approvers decide; 'approved': approved at once (setting + HR holds leave.approve over them). */
  private async hrApproval(tx: Tx, c: CompanyContext, f: Facts, today: string, v: Viewer, own: string | null): Promise<'chain' | 'approved'> {
    if ((await settingOn(tx, c, 'leave.on_behalf.approval', f, today)) !== 'approved') return 'chain';
    return (await grantCovers(tx, c, v, own, 'leave.approve', f.employeeId, today)) ? 'approved' : 'chain';
  }

  /** The request for `f`, raised by the signed-in person (c.userId; null for an import or the demo seed). */
  async applyIn(tx: Tx, c: CompanyContext, f: Facts, today: string, dto: ApplyLeaveDto, notices: Notice[], raiser?: { v: Viewer; own: string | null }) {
    {
      const org = c.organizationId;
      // One request at a time per person: the overlap and balance checks must see each other.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`leave:${org}:${f.employeeId}`}))`;
      const p = await this.plan(tx, c, f, dto, today);
      if (p.certificateNeeded && !dto.certificate) p.blocks.push(`More than ${daysText(p.type.rules.certificateAfterDays!)} of ${p.type.name} needs a certificate. Tick that you will give one to HR.`);
      if (dto.delegateUserId) {
        if (dto.delegateUserId === c.userId) p.blocks.push('Choose someone other than yourself to approve while you are away.');
        else if (!(await tx.user.findFirst({ where: { organizationId: org, id: dto.delegateUserId, status: 'active' }, select: { id: true } }))) p.blocks.push('Choose an active colleague to approve while you are away.');
      }
      if (p.blocks.length) throw new BadRequestException({ statusCode: 400, code: 'LEAVE_RULES', message: p.blocks[0], blocks: p.blocks });
      const atOnce = raiser ? (await this.hrApproval(tx, c, f, today, raiser.v, raiser.own)) === 'approved' : false;
      const reason = dto.reason?.trim() || null;
      const req = await tx.leaveRequest.create({
        data: {
          organizationId: org,
          employeeId: f.employeeId,
          leaveTypeId: p.type.id,
          fromOn: asDate(dto.from),
          toOn: asDate(dto.to),
          fromHalf: dto.fromHalf ?? 'full',
          toHalf: dto.toHalf ?? 'full',
          days: p.total,
          reason,
          certificate: p.certificateNeeded || dto.certificate ? 'pending' : 'none',
          delegateUserId: dto.delegateUserId ?? null,
          raisedBy: c.userId ?? null,
          expectedOn: p.type.kind === 'maternity' && dto.expectedOn ? asDate(dto.expectedOn) : null,
          maternityCase: p.type.kind === 'maternity' ? (dto.maternityCase ?? null) : null,
        },
      });
      await tx.leaveRequestDay.createMany({ data: p.days.map((d) => ({ organizationId: org, requestId: req.id, employeeId: f.employeeId, leaveOn: asDate(d.on), part: d.part, portion: d.portion, countedAs: d.countedAs })) });
      const hr = p.type.rules.hrApprovalAboveDays;
      const hrUsers = await hrApprovers(tx, org, f.employeeId, today, f.userId);
      // Founder answer B: approved at once (no steps) only when the company says so and HR may approve this person.
      const steps: StepSpec[] = atOnce ? [] : [{ name: 'Manager', approvers: [{ kind: 'manager' }], mode: 'any', remindAfterHours: 24, timeoutHours: 72, onTimeout: 'escalate' }];
      if (hr !== null && !atOnce) {
        steps.push({
          name: 'HR',
          approvers: [{ kind: 'users', userIds: hrUsers }],
          mode: 'any',
          remindAfterHours: 24,
          // P19 condition over the request: HR is skipped for requests of N days or fewer.
          skipIf: { id: 'hr', join: 'and', items: [{ id: 'days', field: 'days', operator: 'lt', value: hr + 0.5 }] },
        });
      }
      const summary = [
        { label: 'Leave', value: p.type.name },
        { label: 'Dates', value: `${rangeText(dto.from, dto.to)}${dto.fromHalf === 'second' ? ' (from the second half)' : ''}${dto.toHalf === 'first' ? ' (until the first half)' : ''}` },
        { label: 'Days', value: String(p.total) },
        ...(p.type.kind === 'maternity' && dto.expectedOn ? [{ label: 'Expected date', value: fmt(dto.expectedOn) }] : []),
        { label: 'Team', value: p.othersOff ? `${p.othersOff} ${p.othersOff === 1 ? 'other is' : 'others are'} off then` : 'No one else in the team is off then' },
        ...(p.balanceAfter !== null ? [{ label: 'Balance after', value: String(p.balanceAfter) }] : []),
        ...(p.shortNotice ? [{ label: 'Notice', value: `Short notice: the type asks for ${daysText(p.noticeDays)}` }] : []),
        ...(raiser ? [{ label: 'Applied by', value: atOnce ? 'HR, on their behalf · approved at once (company setting)' : 'HR, on their behalf' }] : []),
        ...(p.noticeSkipped ? [{ label: 'Notice', value: `Applied by HR: ${noticeText(p.noticeDays)} notice not needed` }] : []),
        ...(p.blockDates.length ? [{ label: 'Company block date', value: `${rangeText(p.blockDates[0].from, p.blockDates[0].to)} (${p.blockDates[0].reason})` }] : []),
        ...(p.notice ? [{ label: 'Last working day', value: p.notice.newLastDay === p.notice.lastDay ? `Stays ${fmt(p.notice.lastDay)}` : `Moves from ${fmt(p.notice.lastDay)} to ${fmt(p.notice.newLastDay)}` }] : []),
        // YX-LV-09: approvers see the certificate's status only, never the file; a medical reason never.
        ...(req.certificate !== 'none' ? [{ label: 'Certificate', value: req.certificate === 'verified' ? 'Attached · verified' : 'To be given · pending' }] : []),
        ...(reason && !p.type.rules.medical ? [{ label: 'Reason', value: reason.slice(0, 300) }] : []),
        // P03 Q3: the approver knows who takes over the employee's own approvals while they are away.
        ...(dto.delegateUserId ? [{ label: 'Approves for them while away', value: (await tx.user.findFirst({ where: { organizationId: org, id: dto.delegateUserId }, select: { name: true, email: true } }))?.name ?? 'A colleague' }] : []),
      ];
      const sub = await this.engine.submit(tx, c, {
        type: LEAVE_REQUEST,
        subjectType: 'leave_request',
        subjectId: req.id,
        title: `${f.name}: ${p.type.name}, ${rangeText(dto.from, dto.to)} (${daysText(p.total)})`,
        summary,
        subjectPersonId: f.personId,
        requesterUserId: c.userId ?? null,
        raisedByUserId: c.userId ?? null,
        steps,
        payload: { days: p.total },
        payloadFields: [{ key: 'days', label: 'Days', type: 'number' }],
        fallbackUserIds: hrUsers,
      });
      notices.push(...sub.notices);
      await tx.leaveRequest.update({ where: { id: req.id }, data: { wfRequestId: sub.id } });
      await audit(tx, c, 'leave.request.submitted', 'leave_request', req.id, { employeeId: f.employeeId, type: p.type.code, from: dto.from, to: dto.to, days: p.total, wfRequestId: sub.id, ...(c.userId !== f.userId ? { raisedFor: true } : {}), ...(p.noticeSkipped ? { noticeSkipped: p.noticeDays } : {}), ...(atOnce ? { approvedAtOnce: true } : {}) });
      return { id: req.id, status: (await tx.leaveRequest.findFirstOrThrow({ where: { id: req.id } })).status, days: p.total, wfRequestId: sub.id };
    }
  }

  private async sendBackAllowed(tx: Tx, wf: Prisma.WfRequestGetPayload<object>): Promise<boolean> {
    const r = await tx.leaveRequest.findFirst({ where: { organizationId: wf.organizationId, id: wf.subjectId }, select: { employeeId: true, status: true } });
    return Boolean(r && r.status === 'pending' && (await this.sendBackOn(tx, wf.organizationId, r.employeeId)));
  }

  /** The company lets approvers send this person's leave back for changes (setting leave.send_back, default on). */
  private async sendBackOn(tx: Tx, org: string, employeeId: string): Promise<boolean> {
    const today = todayIn('Asia/Kolkata');
    const f = await factsOn(tx, org, employeeId, today);
    return f ? (await settingOn(tx, { organizationId: org, isSuperAdmin: false }, 'leave.send_back', f, today)) === 'on' : false;
  }

  /** Sent back for changes (P03): the request stops holding its days and waits for the employee to change it and send it again. */
  private async sentBack(tx: Tx, wf: Prisma.WfRequestGetPayload<object>, reason: string) {
    const c: CompanyContext = { organizationId: wf.organizationId, isSuperAdmin: false };
    const done = await tx.leaveRequest.updateMany({ where: { organizationId: wf.organizationId, id: wf.subjectId, status: 'pending' }, data: { status: 'sent_back', decidedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
    if (!done.count) throw new ConflictException('This leave request is no longer waiting for approval.');
    await tx.leaveRequestDay.updateMany({ where: { organizationId: wf.organizationId, requestId: wf.subjectId }, data: { active: false } });
    await audit(tx, c, 'leave.request.sent_back', 'leave_request', wf.subjectId, { wfRequestId: wf.id, reason });
  }

  /**
   * The employee changes a request that was sent back and sends it again: every rule is checked again and a new
   * request goes to the approvers; the old one is marked "resent" (it stays in the history with the approver's note).
   */
  async resend(ctx: TenantContext, user: ScopeUser, id: string, dto: ApplyLeaveDto) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    const notices: Notice[] = [];
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { f, today } = await this.meFacts(tx, c, c.userId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`leave:${c.organizationId}:${f.employeeId}`}))`;
      const old = await tx.leaveRequest.findFirst({ where: { organizationId: c.organizationId, id, employeeId: f.employeeId } });
      if (!old) throw new NotFoundException('No such leave request.');
      if (old.status !== 'sent_back') throw new ConflictException(old.status === 'resent' ? 'You already sent this request again.' : 'Only a request sent back for changes can be changed and sent again.');
      await tx.leaveRequest.update({ where: { id: old.id }, data: { status: 'resent', version: { increment: 1 }, updatedAt: new Date() } });
      const out = await this.applyIn(tx, c, f, today, dto, notices);
      await audit(tx, c, 'leave.request.resent', 'leave_request', old.id, { employeeId: f.employeeId, newRequestId: out.id, from: dto.from, to: dto.to });
      return { ...out, replaces: old.id };
    });
    await this.engine.send(ctx, notices);
    return res;
  }

  /** What the approver asked to change, for requests sent back (the latest send-back on each one's approval). */
  private async sentBackNotes(tx: Tx, org: string, reqs: Req[]): Promise<Map<string, { reason: string | null; by: string | null; at: string }>> {
    const wf = reqs.filter((r) => (r.status === 'sent_back' || r.status === 'resent') && r.wfRequestId).map((r) => r.wfRequestId!);
    if (!wf.length) return new Map();
    const acts = await tx.wfAction.findMany({ where: { organizationId: org, requestId: { in: wf }, action: 'sent_back' }, orderBy: { createdAt: 'asc' } });
    const ids = [...new Set(acts.map((a) => a.actorUserId).filter((x): x is string => Boolean(x)))];
    const names = new Map((ids.length ? await tx.user.findMany({ where: { organizationId: org, id: { in: ids } }, select: { id: true, name: true, email: true } }) : []).map((u) => [u.id, u.name?.trim() || u.email]));
    const byWf = new Map(acts.map((a) => [a.requestId, { reason: a.reason, by: a.actorUserId ? (names.get(a.actorUserId) ?? null) : null, at: a.createdAt.toISOString() }]));
    return new Map(reqs.filter((r) => r.wfRequestId && byWf.has(r.wfRequestId)).map((r) => [r.id, byWf.get(r.wfRequestId!)!]));
  }

  /** P03 effect, exactly once in the decision's transaction (YX-WF-10): the ledger debit, delegation, attendance. */
  private async requestDecided(tx: Tx, wf: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const c: CompanyContext = { organizationId: wf.organizationId, isSuperAdmin: false };
    const r = await tx.leaveRequest.findFirst({ where: { organizationId: wf.organizationId, id: wf.subjectId } });
    if (!r || r.status !== 'pending') return;
    const from = dateOf(r.fromOn);
    const to = dateOf(r.toOn);
    if (outcome === 'rejected') {
      await tx.leaveRequest.update({ where: { id: r.id }, data: { status: 'rejected', decidedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
      await tx.leaveRequestDay.updateMany({ where: { organizationId: r.organizationId, requestId: r.id }, data: { active: false } });
      return;
    }
    await tx.leaveRequest.update({ where: { id: r.id }, data: { status: 'approved', decidedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
    const t = await tx.leaveType.findFirstOrThrow({ where: { organizationId: r.organizationId, id: r.leaveTypeId } });
    if (hasBalance(t.kind)) {
      await tx.leaveLedgerEntry.create({ data: { organizationId: r.organizationId, employeeId: r.employeeId, leaveTypeId: r.leaveTypeId, entryOn: r.fromOn, kind: 'taken', days: -num(r.days), requestId: r.id, periodKey: `tk:${r.id}`, reason: `${t.name} ${rangeText(from, to)}` } });
    }
    if (t.kind === 'maternity' && !(await tx.longAbsence.findFirst({ where: { organizationId: r.organizationId, requestId: r.id }, select: { id: true } }))) {
      await tx.longAbsence.create({ data: { organizationId: r.organizationId, employeeId: r.employeeId, kind: 'maternity', fromOn: r.fromOn, toOn: r.toOn, plannedToOn: r.toOn, accrues: true, requestId: r.id, note: 'Maternity leave approved' } });
    }
    const emp = await tx.employee.findFirst({ where: { organizationId: r.organizationId, id: r.employeeId }, select: { userId: true } });
    // P03 Q3: an approver away on a full day of leave hands their approvals to the delegate they named, else to their
    // own manager. Only people who approve anything (a manager today, or a named delegate) get a delegation.
    const fullDay = (await tx.leaveRequestDay.count({ where: { organizationId: r.organizationId, requestId: r.id, part: 'full', portion: { gt: 0 } } })) > 0;
    const manages = await tx.employeeAssignment.count({ where: { organizationId: r.organizationId, managerEmployeeId: r.employeeId, supersededAt: null, validFrom: { lte: r.toOn }, OR: [{ validTo: null }, { validTo: { gte: r.fromOn } }] } });
    if (emp?.userId && fullDay && (r.delegateUserId || manages)) await this.engine.delegateForLeave(tx, c, emp.userId, from, to, r.delegateUserId);
    await this.dayEngine.evaluate(tx, c, r.employeeId, from, to);
  }

  private async cancelDecided(tx: Tx, wf: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const c: CompanyContext = { organizationId: wf.organizationId, isSuperAdmin: false };
    const r = await tx.leaveRequest.findFirst({ where: { organizationId: wf.organizationId, id: wf.subjectId } });
    if (!r || r.status !== 'cancel_pending') return;
    if (outcome === 'rejected') {
      await tx.leaveRequest.update({ where: { id: r.id }, data: { status: 'approved', version: { increment: 1 }, updatedAt: new Date() } });
      return;
    }
    await this.cancelIn(tx, c, r);
  }

  /** Cancels approved leave: reverses the debit (a new ledger entry, YX-LV-01), frees the days, takes back the delegation. */
  private async cancelIn(tx: Tx, c: CompanyContext, r: Req) {
    const from = dateOf(r.fromOn);
    const to = dateOf(r.toOn);
    await tx.leaveRequest.update({ where: { id: r.id }, data: { status: 'cancelled', decidedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
    await tx.leaveRequestDay.updateMany({ where: { organizationId: r.organizationId, requestId: r.id }, data: { active: false } });
    const t = await tx.leaveType.findFirstOrThrow({ where: { organizationId: r.organizationId, id: r.leaveTypeId } });
    if (hasBalance(t.kind)) {
      await tx.leaveLedgerEntry.create({ data: { organizationId: r.organizationId, employeeId: r.employeeId, leaveTypeId: r.leaveTypeId, entryOn: r.fromOn, kind: 'cancelled', days: num(r.days), requestId: r.id, periodKey: `cx:${r.id}`, reason: `Cancelled: ${t.name} ${rangeText(from, to)}` } });
    }
    const emp = await tx.employee.findFirst({ where: { organizationId: r.organizationId, id: r.employeeId }, select: { userId: true } });
    if (emp?.userId) await this.engine.revokeLeaveDelegations(tx, c, emp.userId, from, to);
    await this.dayEngine.evaluate(tx, c, r.employeeId, from, to);
  }

  /** A pending request is withdrawn without approval (US-C-040). */
  async withdraw(ctx: TenantContext, user: ScopeUser, id: string) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const mine = await myEmployeeId(tx, c.organizationId, c.userId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`leave:${c.organizationId}:${mine}`}))`;
      const r = await tx.leaveRequest.findFirst({ where: { organizationId: c.organizationId, id, employeeId: mine } });
      if (!r) throw new NotFoundException('No such leave request.');
      if (r.status !== 'pending' && r.status !== 'sent_back') throw new ConflictException('Only a request still waiting for approval, or sent back for changes, can be withdrawn.');
      if (r.wfRequestId) await this.engine.withdraw(tx, c, r.wfRequestId, c.userId ?? null, 'Withdrawn by the employee');
      await tx.leaveRequest.update({ where: { id: r.id }, data: { status: 'withdrawn', decidedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
      await tx.leaveRequestDay.updateMany({ where: { organizationId: c.organizationId, requestId: r.id }, data: { active: false } });
      await audit(tx, c, 'leave.request.withdrawn', 'leave_request', r.id, { employeeId: mine });
      return { id: r.id, status: 'withdrawn' };
    });
  }

  /** Approved leave is cancelled with the manager's approval (M02 §A2). */
  async cancel(ctx: TenantContext, user: ScopeUser, id: string, reason: string) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    const notices: Notice[] = [];
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { f, today } = await this.meFacts(tx, c, c.userId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`leave:${c.organizationId}:${f.employeeId}`}))`;
      const r = await tx.leaveRequest.findFirst({ where: { organizationId: c.organizationId, id, employeeId: f.employeeId } });
      if (!r) throw new NotFoundException('No such leave request.');
      if (r.status !== 'approved') throw new ConflictException('Only approved leave can be cancelled. Withdraw a request that is still waiting.');
      // P08: leave in a locked month is corrected by HR, never cancelled here (YX-LV-08).
      await assertOpen(tx, c.organizationId, f.employeeId, dateOf(r.fromOn), dateOf(r.toOn));
      const t = await tx.leaveType.findFirstOrThrow({ where: { organizationId: c.organizationId, id: r.leaveTypeId } });
      const from = dateOf(r.fromOn);
      const to = dateOf(r.toOn);
      await tx.leaveRequest.update({ where: { id: r.id }, data: { status: 'cancel_pending', version: { increment: 1 }, updatedAt: new Date() } });
      const sub = await this.engine.submit(tx, c, {
        type: LEAVE_CANCEL,
        subjectType: 'leave_request',
        subjectId: r.id,
        title: `${f.name}: cancel ${t.name}, ${rangeText(from, to)}`,
        summary: [
          { label: 'Leave', value: t.name },
          { label: 'Dates', value: rangeText(from, to) },
          { label: 'Days back', value: String(num(r.days)) },
          { label: 'Why', value: reason.slice(0, 300) },
        ],
        subjectPersonId: f.personId,
        requesterUserId: c.userId ?? null,
        raisedByUserId: c.userId ?? null,
        steps: [{ name: 'Manager', approvers: [{ kind: 'manager' }], mode: 'any', remindAfterHours: 24 }],
        payload: {},
        payloadFields: [],
        fallbackUserIds: await hrApprovers(tx, c.organizationId, f.employeeId, today, f.userId),
      });
      notices.push(...sub.notices);
      await tx.leaveRequest.update({ where: { id: r.id }, data: { cancelWfRequestId: sub.id } });
      await audit(tx, c, 'leave.request.cancel_requested', 'leave_request', r.id, { employeeId: f.employeeId, wfRequestId: sub.id });
      return { id: r.id, status: (await tx.leaveRequest.findFirstOrThrow({ where: { id: r.id } })).status };
    });
    await this.engine.send(ctx, notices);
    return res;
  }

  // ------------------------------------------------------------------------------------------ others' leave

  /** One request: the employee, their team (manager) or HR in scope. Medical reasons need leave.medical.view (audited). */
  async detail(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await tx.leaveRequest.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!r) throw new NotFoundException('Not found');
      const own = await this.ownId(tx, c, v);
      const today = new Date().toISOString().slice(0, 10);
      const rel = await mustSee(tx, c, v, own, 'leave.view', r.employeeId, today);
      const t = await tx.leaveType.findFirst({ where: { organizationId: c.organizationId, id: r.leaveTypeId } });
      const medical = Boolean((t?.rules as unknown as LeaveRules | undefined)?.medical);
      let withReason = rel === 'self' || !medical;
      if (medical && rel !== 'self' && !v.actingForOther && (await grantCovers(tx, c, v, own, 'leave.medical.view', r.employeeId, today))) {
        withReason = true;
        // P02 Special: every read of a medical reason is recorded.
        if (r.reason) await audit(tx, c, 'leave.medical.viewed', 'leave_request', r.id, { employeeId: r.employeeId });
      }
      const f = await factsOn(tx, c.organizationId, r.employeeId, dateOf(r.fromOn));
      const route = r.wfRequestId ? await this.engine.viewIn(tx, c.organizationId, await tx.wfRequest.findFirstOrThrow({ where: { organizationId: c.organizationId, id: r.wfRequestId } })) : null;
      // TIM-19 Manager: team availability (the requester's colleagues under the same manager whom the viewer may see),
      // the balance after it, and the viewer's own open approval task (decided through the one approvals engine).
      let team: { others: { name: string; type: string }[]; balanceAfter: number | null; taskId: string | null; canSendBack: boolean } | null = null;
      if (rel !== 'self' && f) {
        const seen = await visibleSql(tx, c, v, own, 'leave.view', Prisma.sql`d.employee_id`, today);
        const off = f.managerEmployeeId ? await this.offIn(tx, c, dateOf(r.fromOn), dateOf(r.toOn), Prisma.sql`${seen} AND d.employee_id IN (SELECT a.employee_id FROM employee_assignments a WHERE a.organization_id = ${c.organizationId}::uuid AND a.superseded_at IS NULL AND ${today}::date <@ daterange(a.valid_from, a.valid_to, '[]') AND a.manager_employee_id = ${f.managerEmployeeId}::uuid)`) : [];
        const bal = t && hasBalance(t.kind) ? (await this.balancesIn(tx, c, f, today)).find((b) => b.leaveTypeId === t.id) : undefined;
        const task = r.wfRequestId && v.userId && !v.actingForOther ? await tx.wfTask.findFirst({ where: { organizationId: c.organizationId, requestId: r.wfRequestId, status: 'open', assigneeUserId: v.userId }, select: { id: true } }) : null;
        team = { others: offBetween(off, dateOf(r.fromOn), dateOf(r.toOn), r.employeeId), balanceAfter: bal ? bal.available : null, taskId: task?.id ?? null, canSendBack: Boolean(task) && r.status === 'pending' && (await this.sendBackOn(tx, c.organizationId, r.employeeId)) };
      }
      const sentBack = (await this.sentBackNotes(tx, c.organizationId, [r])).get(r.id) ?? null;
      return { ...this.requestView(r, t ?? undefined, withReason), sentBack, person: f ? { name: f.name, code: f.code } : null, route: route ? { status: route.status, steps: route.steps, log: route.log } : null, team };
    });
  }

  /** Active leave days (pending or approved) from `from` to `to` of the people `where` (on `d.employee_id`) allows. */
  private offIn(tx: Tx, c: CompanyContext, from: string, to: string, where: Prisma.Sql): Promise<Off[]> {
    return tx.$queryRaw<Off[]>`
      SELECT d.employee_id::text AS "employeeId", ${NAME} AS name, d.leave_on::text AS on, t.name AS type
      FROM leave_request_days d JOIN leave_requests r ON r.organization_id = d.organization_id AND r.id = d.request_id AND r.status = ANY(${ACTIVE}::text[])
      JOIN leave_types t ON t.organization_id = r.organization_id AND t.id = r.leave_type_id
      JOIN employees e ON e.organization_id = d.organization_id AND e.id = d.employee_id
      WHERE d.organization_id = ${c.organizationId}::uuid AND d.active AND d.portion > 0 AND d.leave_on BETWEEN ${from}::date AND ${to}::date AND ${where}
      ORDER BY 3, 2 LIMIT 2000`;
  }

  /**
   * TIM-17 Manager (GET team/leave-home): leave of the viewer's own team (the implicit manager view, YX-SEC-04; never an
   * HR grant, HR has its own home) waiting for their decision (their open approval task), with who else in the team is
   * off then; how many other approvals wait for them; and who in the team is away this week.
   */
  async teamHome(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await this.ownId(tx, c, v);
      const today = todayIn('Asia/Kolkata');
      const monday = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
      if (!own || !v.userId) return { today, waiting: [], otherWaiting: 0, away: [] };
      const inTeam = (col: string) => implicitSql(tx, c, own, Prisma.raw(col), Prisma.sql`${today}::date`);
      const rows = await tx.$queryRaw<{ id: string; taskId: string; employeeId: string; name: string; type: string; from: string; to: string; fromHalf: string; toHalf: string; days: number; certificate: string; sent: Date }[]>`
        SELECT r.id::text, k.id::text AS "taskId", r.employee_id::text AS "employeeId", ${NAME} AS name, t.name AS type, r.from_on::text AS "from", r.to_on::text AS "to",
               r.from_half AS "fromHalf", r.to_half AS "toHalf", r.days::float AS days, r.certificate, r.created_at AS sent
        FROM leave_requests r
        JOIN wf_tasks k ON k.organization_id = r.organization_id AND k.request_id = r.wf_request_id AND k.status = 'open' AND k.assignee_user_id = ${v.userId}::uuid
        JOIN employees e ON e.organization_id = r.organization_id AND e.id = r.employee_id
        JOIN leave_types t ON t.organization_id = r.organization_id AND t.id = r.leave_type_id
        WHERE r.organization_id = ${org}::uuid AND r.status = 'pending' AND r.employee_id <> ${own}::uuid AND ${await inTeam('r.employee_id')}
        ORDER BY r.from_on, r.created_at LIMIT 50`;
      const [{ other }] = await tx.$queryRaw<{ other: number }[]>`
        SELECT count(*)::int AS other FROM wf_tasks k JOIN wf_requests q ON q.organization_id = k.organization_id AND q.id = k.request_id
        WHERE k.organization_id = ${org}::uuid AND k.assignee_user_id = ${v.userId}::uuid AND k.status = 'open' AND q.request_type <> ${LEAVE_REQUEST}`;
      const teamOff = (from: string, to: string) => inTeam('d.employee_id').then((w) => this.offIn(tx, c, from, to, w));
      const span = rows.length ? await teamOff(rows.reduce((a, x) => (x.from < a ? x.from : a), rows[0].from), rows.reduce((a, x) => (x.to > a ? x.to : a), rows[0].to)) : [];
      const week = await teamOff(monday, addDays(monday, 6));
      const back = new Map<string, boolean>();
      for (const x of rows) if (!back.has(x.employeeId)) back.set(x.employeeId, await this.sendBackOn(tx, org, x.employeeId));
      const away = [...new Map(week.map((o) => [o.employeeId, o])).values()].map((o) => {
        const mine = week.filter((x) => x.employeeId === o.employeeId);
        return { employeeId: o.employeeId, name: o.name, type: o.type, from: mine[0].on, to: mine[mine.length - 1].on };
      });
      return {
        today,
        waiting: rows.map((x) => ({ ...x, sent: x.sent.toISOString(), others: offBetween(span, x.from, x.to, x.employeeId), canSendBack: back.get(x.employeeId) ?? false })),
        otherWaiting: other,
        away,
      };
    });
  }

  /** HR verifies a certificate (Special data, leave.medical.view in scope); approvers then see "verified". */
  async verifyCertificate(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await tx.leaveRequest.findFirst({ where: { organizationId: c.organizationId, id } });
      const own = await this.ownId(tx, c, v);
      if (!r || !(await grantCovers(tx, c, v, own, 'leave.medical.view', r.employeeId, new Date().toISOString().slice(0, 10)))) throw new NotFoundException('Not found');
      if (r.employeeId === own) throw new ForbiddenException('You cannot verify your own certificate.');
      if (r.certificate !== 'pending') throw new ConflictException('There is no certificate waiting for this request.');
      await tx.leaveRequest.update({ where: { id: r.id }, data: { certificate: 'verified', version: { increment: 1 }, updatedAt: new Date() } });
      await audit(tx, c, 'leave.certificate.verified', 'leave_request', r.id, { employeeId: r.employeeId });
      return { id: r.id, certificate: 'verified' };
    });
  }

  /** Team leave calendar (TIM-20, YX-AT-14): opens on the viewer's widest scope (team; HR: everyone in leave.view scope). */
  async teamCalendar(ctx: TenantContext, user: ScopeUser, from: string, to: string, entityId?: string | null) {
    if (to < from || daysBetween(from, to) > 62) throw new BadRequestException('Choose up to 62 days.');
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const own = await this.ownId(tx, c, v);
      const today = new Date().toISOString().slice(0, 10);
      const people = await tx.$queryRaw<{ id: string; name: string; code: string | null; locationId: string }[]>`
        SELECT e.id::text, concat_ws(' ', coalesce(e.preferred_name, e.given_name), e.family_name) AS name, m.employee_code::text AS code, a.location_id::text AS "locationId"
        FROM employees e
        JOIN employee_assignments a ON a.organization_id = e.organization_id AND a.employee_id = e.id AND a.superseded_at IS NULL AND ${today}::date <@ daterange(a.valid_from, a.valid_to, '[]')
        JOIN employments m ON m.organization_id = e.organization_id AND m.id = a.employment_id AND m.exited_on IS NULL
        WHERE e.organization_id = ${c.organizationId}::uuid AND ${await visibleSql(tx, c, v, own, 'leave.view', Prisma.sql`e.id`, today)}
          AND ${inEntitySql(c, entityId, Prisma.sql`e.id`, Prisma.sql`${from}::date`, Prisma.sql`${to}::date`)}
        ORDER BY 2 LIMIT 300`;
      const ids = people.map((p) => p.id);
      const days = ids.length
        ? await tx.$queryRaw<{ employeeId: string; on: string; part: string; status: string; code: string; colour: string; name: string }[]>`
            SELECT d.employee_id::text AS "employeeId", d.leave_on::text AS on, d.part, r.status, t.code::text, t.colour, t.name
            FROM leave_request_days d JOIN leave_requests r ON r.organization_id = d.organization_id AND r.id = d.request_id
            JOIN leave_types t ON t.organization_id = r.organization_id AND t.id = r.leave_type_id
            WHERE d.organization_id = ${c.organizationId}::uuid AND d.employee_id = ANY(${ids}::uuid[]) AND d.active AND d.portion > 0
              AND r.status = ANY(${ACTIVE}::text[]) AND d.leave_on BETWEEN ${from}::date AND ${to}::date`
        : [];
      const holidays = new Map<string, { on: string; name: string; halfDay: boolean }[]>();
      for (const loc of new Set(people.map((p) => p.locationId))) holidays.set(loc, [...(await holidaysFor(tx, c.organizationId, loc, from, to)).map].map(([on, h]) => ({ on, name: h.name, halfDay: h.halfDay })));
      return {
        from,
        to,
        scope: tenantWide(v, 'leave.view') ? 'company' : has(v, 'leave.view') ? 'granted' : 'team',
        people: people.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          me: p.id === own,
          holidays: holidays.get(p.locationId) ?? [],
          days: days.filter((d) => d.employeeId === p.id).map((d) => ({ on: d.on, part: d.part, status: d.status === 'pending' ? 'pending' : 'approved', code: d.code, colour: d.colour, name: d.name })),
        })),
      };
    });
  }

  /** HR: balances of everyone in leave.view scope (TIM-30 balances matrix, basic). */
  async hrBalances(ctx: TenantContext, user: ScopeUser, entityId?: string | null) {
    const v = await this.viewer(user);
    if (!has(v, 'leave.view')) throw new ForbiddenException('You need leave.view for this.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const own = await this.ownId(tx, c, v);
      const today = new Date().toISOString().slice(0, 10);
      const people = await tx.$queryRaw<{ id: string }[]>`
        SELECT e.id::text FROM employees e
        JOIN employee_assignments a ON a.organization_id = e.organization_id AND a.employee_id = e.id AND a.superseded_at IS NULL AND ${today}::date <@ daterange(a.valid_from, a.valid_to, '[]')
        JOIN employments m ON m.organization_id = e.organization_id AND m.id = a.employment_id AND m.exited_on IS NULL
        WHERE e.organization_id = ${c.organizationId}::uuid AND ${await visibleSql(tx, c, v, own, 'leave.view', Prisma.sql`e.id`, today, false)}
          AND ${inEntitySql(c, entityId, Prisma.sql`e.id`, Prisma.sql`${today}::date`)}
        ORDER BY e.given_name LIMIT 500`;
      const adjustable = has(v, 'leave.balance.adjust');
      const rows = [];
      for (const p of people) {
        const f = await factsOn(tx, c.organizationId, p.id, today);
        if (!f) continue;
        rows.push({ employeeId: f.employeeId, name: f.name, code: f.code, canAdjust: adjustable && f.employeeId !== own && (await grantCovers(tx, c, v, own, 'leave.balance.adjust', f.employeeId, today)), balances: await this.balancesIn(tx, c, f, today) });
      }
      return { people: rows, types: (await this.types(tx, c.organizationId)).filter((t) => t.active).map((t) => ({ id: t.id, code: t.code, name: t.name, kind: t.kind })) };
    });
  }

  /** PPL-03 Time tab: one person's balances, read-only: themselves, leave.view in scope, or their managers (implicit view). */
  async personBalances(ctx: TenantContext, user: ScopeUser, employeeId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const own = await this.ownId(tx, c, v);
      const today = new Date().toISOString().slice(0, 10);
      await mustSee(tx, c, v, own, 'leave.view', employeeId, today, true);
      const f = await factsOn(tx, c.organizationId, employeeId, today);
      return { balances: f ? await this.balancesIn(tx, c, f, today) : [] };
    });
  }

  /** One person's ledger (TIM-21): self, or HR in leave.view scope. */
  async ledger(ctx: TenantContext, user: ScopeUser, employeeId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const own = await this.ownId(tx, c, v);
      await mustSee(tx, c, v, own, 'leave.view', employeeId, new Date().toISOString().slice(0, 10), false);
      const types = new Map((await this.types(tx, c.organizationId)).map((t) => [t.id, t]));
      const rows = await tx.leaveLedgerEntry.findMany({ where: { organizationId: c.organizationId, employeeId }, orderBy: [{ entryOn: 'desc' }, { createdAt: 'desc' }], take: 300 });
      return rows.map((r) => ({ id: r.id, on: dateOf(r.entryOn), type: types.get(r.leaveTypeId)?.code ?? '', kind: r.kind, days: num(r.days), reason: r.reason, at: r.createdAt }));
    });
  }

  /** HR adjusts a balance with a reason (US-C-036): a ledger entry, audited; never one's own balance. */
  async adjust(ctx: TenantContext, user: ScopeUser, employeeId: string, dto: AdjustDto) {
    const v = await this.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    if (dto.days === 0) throw new BadRequestException('Give a number of days other than 0.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const own = await this.ownId(tx, c, v);
      const today = new Date().toISOString().slice(0, 10);
      if (!(await grantCovers(tx, c, v, own, 'leave.balance.adjust', employeeId, today))) throw new NotFoundException('Not found');
      if (employeeId === own) throw new ForbiddenException('You cannot adjust your own balance. Ask another HR admin.');
      const t = await tx.leaveType.findFirst({ where: { organizationId: c.organizationId, id: dto.leaveTypeId } });
      if (!t || !hasBalance(t.kind)) throw new BadRequestException('Choose a leave type that has a balance.');
      const e = await tx.leaveLedgerEntry.create({ data: { organizationId: c.organizationId, employeeId, leaveTypeId: t.id, entryOn: asDate(today), kind: 'adjustment', days: dto.days, reason: dto.reason, createdBy: c.userId ?? null } });
      await audit(tx, c, 'leave.balance.adjusted', 'leave_ledger', e.id, { employeeId, type: t.code, days: dto.days, reason: dto.reason });
      return { id: e.id };
    });
  }

  /** Optional holidays: choose up to the calendar's N of M (US-C-035). */
  async chooseHoliday(ctx: TenantContext, user: ScopeUser, holidayId: string, choose: boolean) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { f, today } = await this.meFacts(tx, c, c.userId);
      const h = await tx.holiday.findFirst({ where: { organizationId: c.organizationId, id: holidayId } });
      const cal = h ? await tx.holidayCalendar.findFirst({ where: { organizationId: c.organizationId, id: h.calendarId } }) : null;
      const mine = (await tx.holidayCalendar.findFirst({ where: { organizationId: c.organizationId, locationId: f.locationId } })) ?? (await tx.holidayCalendar.findFirst({ where: { organizationId: c.organizationId, locationId: null } }));
      if (!h || !cal || cal.id !== mine?.id || (h.kind !== 'optional' && h.kind !== 'restricted')) throw new NotFoundException('No such optional holiday on your calendar.');
      if (dateOf(h.holidayOn) < today) throw new ConflictException('That day has passed.');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`leave:${c.organizationId}:${f.employeeId}`}))`;
      const key = { organizationId: c.organizationId, employeeId: f.employeeId, holidayId: h.id };
      if (!choose) {
        await tx.optionalHolidayChoice.deleteMany({ where: key });
      } else {
        const year = await leaveYearFor(tx, c, f, dateOf(h.holidayOn));
        const taken = await tx.$queryRaw<{ n: number }[]>`
          SELECT count(*)::int AS n FROM optional_holiday_choices x JOIN holidays h ON h.organization_id = x.organization_id AND h.id = x.holiday_id
          WHERE x.organization_id = ${c.organizationId}::uuid AND x.employee_id = ${f.employeeId}::uuid AND h.holiday_on BETWEEN ${year.start}::date AND ${year.end}::date`;
        const { limit, movedOn } = await this.optionalLimit(tx, c, f, cal, year.start, today);
        if (taken[0].n >= limit) throw new ConflictException(taken[0].n > limit ? `You have ${taken[0].n} optional holidays but the limit is now ${limit}. Remove ${taken[0].n - limit} first.` : `You can choose ${limit} optional ${limit === 1 ? 'holiday' : 'holidays'} this year${movedOn ? ` (prorated after your move on ${fmt(movedOn)})` : ''}. Remove one first.`);
        await tx.optionalHolidayChoice.upsert({ where: { organizationId_employeeId_holidayId: key }, create: key, update: {} });
      }
      await audit(tx, c, choose ? 'leave.optional_holiday.chosen' : 'leave.optional_holiday.removed', 'holiday', h.id, { employeeId: f.employeeId });
      return { holidayId: h.id, chosen: choose };
    });
  }

  /**
   * TIM-23: the optional-holiday limit for this leave year. Someone who moved to this calendar's office during the year
   * gets the limit prorated by the months left (setting leave.optional_holiday.prorate_on_move, default yes).
   */
  private async optionalLimit(tx: Tx, c: CompanyContext, f: Facts, cal: { optionalLimit: number; locationId: string | null }, yearStart: string, today: string): Promise<{ limit: number; movedOn: string | null }> {
    if (!cal.locationId || (await settingOn(tx, c, 'leave.optional_holiday.prorate_on_move', f, today)) !== 'yes') return { limit: cal.optionalLimit, movedOn: null };
    // The first day of the current unbroken stretch at this location, when it began inside the leave year.
    const [row] = await tx.$queryRaw<{ moved: string | null }[]>`
      SELECT max(a.valid_from)::text AS moved FROM employee_assignments a
      WHERE a.organization_id = ${c.organizationId}::uuid AND a.employee_id = ${f.employeeId}::uuid AND a.superseded_at IS NULL
        AND a.location_id = ${cal.locationId}::uuid AND a.valid_from > ${yearStart}::date AND a.valid_from <= ${today}::date
        AND EXISTS (SELECT 1 FROM employee_assignments b WHERE b.organization_id = a.organization_id AND b.employee_id = a.employee_id AND b.superseded_at IS NULL
          AND b.location_id <> a.location_id AND b.valid_to = a.valid_from - 1)`;
    const movedOn = row?.moved ?? null;
    return { limit: optionalLimitAfterMove(cal.optionalLimit, yearStart, movedOn), movedOn };
  }

  /** TIM-21 (employee): my own ledger and the pending requests that will come off it. */
  myLedger(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { f, today } = await this.meFacts(tx, c, c.userId);
      const types = new Map((await this.types(tx, c.organizationId)).map((t) => [t.id, t]));
      const rows = await tx.leaveLedgerEntry.findMany({ where: { organizationId: c.organizationId, employeeId: f.employeeId }, orderBy: [{ entryOn: 'desc' }, { createdAt: 'desc' }], take: 300 });
      const pending = await tx.leaveRequest.findMany({ where: { organizationId: c.organizationId, employeeId: f.employeeId, status: 'pending' }, orderBy: { fromOn: 'asc' } });
      const year = await leaveYearFor(tx, c, f, today);
      return {
        employee: { id: f.employeeId, name: f.name, code: f.code },
        today,
        year,
        balances: await this.balancesIn(tx, c, f, today),
        ledger: rows.map((r) => ({ id: r.id, on: dateOf(r.entryOn), type: types.get(r.leaveTypeId)?.code ?? '', kind: r.kind, days: num(r.days), reason: r.reason, at: r.createdAt })),
        pending: pending.map((r) => ({ id: r.id, leaveTypeId: r.leaveTypeId, from: dateOf(r.fromOn), to: dateOf(r.toOn), days: num(r.days) })),
      };
    });
  }

  // ------------------------------------------------------------------------------------------ jobs

  /** Monthly / yearly credits due by today for every employee of the company (idempotent by period key). */
  async accrue(org: string, now = new Date()): Promise<number> {
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false };
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const today = now.toISOString().slice(0, 10);
      const types = new Map((await this.types(tx, org)).map((t) => [t.id, t]));
      const employees = await tx.$queryRaw<{ id: string }[]>`
        SELECT DISTINCT a.employee_id::text AS id FROM employee_assignments a JOIN employments m ON m.organization_id = a.organization_id AND m.id = a.employment_id
        WHERE a.organization_id = ${org}::uuid AND a.superseded_at IS NULL AND ${today}::date <@ daterange(a.valid_from, a.valid_to, '[]') AND m.joined_on <= ${today}::date`;
      let n = 0;
      for (const e of employees) {
        const f = await factsOn(tx, org, e.id, today);
        if (!f) continue;
        const local = todayIn(f.zone, now);
        const policy = await policyOn(tx, c, f, local);
        if (!policy) continue;
        const ent = await this.entitlements(tx, f, local, policy.lines, [...types.values()]);
        const year = await leaveYearFor(tx, c, f, local);
        // TIM-27 Absence & notice: a type may keep or stop crediting during a long absence whatever the company says;
        // maternity always counts as service (Maternity Benefit Act), so it never stops crediting.
        const absences = (await tx.longAbsence.findMany({ where: { organizationId: org, employeeId: f.employeeId, toOn: { gte: asDate(year.start) } }, select: { fromOn: true, toOn: true, accrues: true, kind: true } })).filter((a) => a.kind !== 'maternity');
        const data = policy.lines.flatMap((l) => {
          const t = types.get(l.leaveTypeId);
          if (!t || !t.active || !hasBalance(t.kind) || t.kind === 'comp_off') return [];
          const own = (t.rules as unknown as LeaveRules).longAbsence;
          const notEarning = absences.filter((a) => !creditsDuringAbsence(own, a.accrues)).map((a) => ({ from: dateOf(a.fromOn), to: dateOf(a.toOn) }));
          return accrualsDue({ ...l, annualDays: ent.get(l.leaveTypeId) ?? l.annualDays }, { yearStart: year.start, joinedOn: f.joinedOn, exitedOn: f.exitedOn, upTo: local, notEarning, ...(year.short ? { yearEnd: year.end } : {}) }).map((d) => ({
            organizationId: org,
            employeeId: f.employeeId,
            leaveTypeId: t.id,
            entryOn: asDate(d.on),
            kind: 'accrual',
            days: d.days,
            periodKey: d.periodKey,
            reason: l.frequency === 'monthly' ? `${t.name} credit for ${d.periodKey.slice(8)}` : `${t.name} for the year from ${year.start}`,
          }));
        });
        if (data.length) n += (await tx.leaveLedgerEntry.createMany({ data, skipDuplicates: true })).count;
      }
      return n;
    });
  }

  /**
   * Year end preview (YX-LV-07, TIM-29): per employee and type, carry forward, pay out and lapse at the leave year ending
   * `yearEnd`. Over the carry-forward cap, an encashable type is paid out up to what its yearly cash-in limit still
   * allows (leave.year_end.encash_excess, default on); the rest lapses.
   */
  async yearEndRows(tx: Tx, c: CompanyContext, yearEnd: string) {
    const org = c.organizationId;
    const types = new Map((await this.types(tx, org)).map((t) => [t.id, t]));
    const employees = await tx.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT a.employee_id::text AS id FROM employee_assignments a
      WHERE a.organization_id = ${org}::uuid AND a.superseded_at IS NULL AND ${yearEnd}::date <@ daterange(a.valid_from, a.valid_to, '[]')`;
    const rows: { employeeId: string; name: string; code: string | null; policyId: string; leaveTypeId: string; type: string; balance: number; carry: number; encash: number; lapse: number; encashable: boolean }[] = [];
    for (const e of employees) {
      const f = await factsOn(tx, org, e.id, yearEnd);
      if (!f) continue;
      const year = await leaveYearFor(tx, c, f, yearEnd);
      if (year.end !== yearEnd) continue;
      const policy = await policyOn(tx, c, f, yearEnd);
      if (!policy) continue;
      const st = await statutoryOn(tx, f.state, yearEnd, f.factory);
      const payOut = (await settingOn(tx, c, 'leave.year_end.encash_excess', f, yearEnd)) === 'on';
      const company = { maxPerYear: Number(await settingOn(tx, c, 'leave.encashment.max_days', f, yearEnd)), minLeft: 0, divisor: 26 };
      for (const l of policy.lines) {
        const t = types.get(l.leaveTypeId);
        if (!t || !hasBalance(t.kind)) continue;
        const sum = num((await tx.leaveLedgerEntry.aggregate({ where: { organizationId: org, employeeId: f.employeeId, leaveTypeId: t.id, entryOn: { lte: asDate(yearEnd) } }, _sum: { days: true } }))._sum.days);
        // P07: a company carry-forward cap below the state's accumulation floor is raised to it.
        const cap = l.carryForwardMax === null ? null : Math.max(l.carryForwardMax, st.carry[t.kind] ?? 0);
        const rules = t.rules as unknown as LeaveRules;
        let encashLeft = 0;
        if (payOut && rules.encashable) {
          // Cashed in during the year (negative in the ledger) comes off the yearly limit.
          const used = num((await tx.leaveLedgerEntry.aggregate({ where: { organizationId: org, employeeId: f.employeeId, leaveTypeId: t.id, kind: 'encashed', entryOn: { gte: asDate(year.start), lte: asDate(yearEnd) } }, _sum: { days: true } }))._sum.days);
          encashLeft = encashTerms(rules, company).maxPerYear + used;
        }
        const split = yearEndWithEncash(Math.round(sum * 100) / 100, cap, encashLeft);
        rows.push({ employeeId: f.employeeId, name: f.name, code: f.code, policyId: policy.policyId, leaveTypeId: t.id, type: t.code, balance: Math.round(sum * 100) / 100, ...split, encashable: Boolean(rules.encashable) });
      }
    }
    return rows;
  }

  /**
   * TIM-29 Transition preview: for each person of the legal entity and leave type with a balance, the projected opening
   * of the short year (the old year's balance with the credits still due, after its year end), the short year's credit
   * and the outcome at its end (carry forward, pay out, lapse). Assumes no leave is taken.
   */
  async transitionRows(tx: Tx, c: CompanyContext, legalEntityId: string, fromOn: string, shortEnd: string, today: string) {
    const org = c.organizationId;
    const types = await this.types(tx, org);
    const byId = new Map(types.map((t) => [t.id, t]));
    const lastOld = addDays(fromOn, -1);
    const employees = await tx.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT a.employee_id::text AS id FROM employee_assignments a
      WHERE a.organization_id = ${org}::uuid AND a.superseded_at IS NULL AND ${today}::date <@ daterange(a.valid_from, a.valid_to, '[]') LIMIT 5000`;
    const rows: { employeeId: string; name: string; type: string; opening: number; credit: number; atEnd: number; carry: number; encash: number; lapse: number }[] = [];
    for (const e of employees) {
      const f = await factsOn(tx, org, e.id, today);
      if (!f || f.legalEntityId !== legalEntityId || (f.exitedOn && f.exitedOn < fromOn)) continue;
      const policy = await policyOn(tx, c, f, fromOn);
      if (!policy) continue;
      const oldYear = await leaveYearFor(tx, c, f, lastOld);
      const ent = await this.entitlements(tx, f, fromOn, policy.lines, types);
      const st = await statutoryOn(tx, f.state, lastOld, f.factory);
      const company = { maxPerYear: Number(await settingOn(tx, c, 'leave.encashment.max_days', f, today)), minLeft: 0, divisor: 26 };
      const payOut = (await settingOn(tx, c, 'leave.year_end.encash_excess', f, today)) === 'on';
      for (const l of policy.lines) {
        const t = byId.get(l.leaveTypeId);
        if (!t || !t.active || !hasBalance(t.kind) || t.kind === 'comp_off') continue;
        const rules = t.rules as unknown as LeaveRules;
        const line = { ...l, annualDays: ent.get(l.leaveTypeId) ?? l.annualDays };
        const now = num((await tx.leaveLedgerEntry.aggregate({ where: { organizationId: org, employeeId: f.employeeId, leaveTypeId: t.id }, _sum: { days: true } }))._sum.days);
        // Credits of the old year still to come (the accrual job writes them when due).
        const dueOld = accrualsDue(line, { yearStart: oldYear.start, joinedOn: f.joinedOn, exitedOn: f.exitedOn, upTo: lastOld }).filter((d) => d.on > today).reduce((x, d) => x + d.days, 0);
        const cap = l.carryForwardMax === null ? null : Math.max(l.carryForwardMax, st.carry[t.kind] ?? 0);
        const left = payOut && rules.encashable ? encashTerms(rules, company).maxPerYear : 0;
        const opening = yearEndWithEncash(Math.round((now + dueOld) * 100) / 100, cap, left).carry;
        const credit = Math.round(accrualsDue(line, { yearStart: fromOn, yearEnd: shortEnd, joinedOn: f.joinedOn, exitedOn: f.exitedOn, upTo: shortEnd }).reduce((x, d) => x + d.days, 0) * 100) / 100;
        const atEnd = Math.round((opening + credit) * 100) / 100;
        rows.push({ employeeId: f.employeeId, name: f.name, type: t.name, opening, credit, atEnd, ...yearEndWithEncash(atEnd, cap, left) });
      }
    }
    return rows;
  }

  /**
   * TIM-29: leave requests still waiting with days in the leave year ending `yearEnd`. Year end is posted only once
   * they are decided, or (after the year) when HR posts anyway and they stay pending into the new year.
   */
  async yearEndPending(tx: Tx, c: CompanyContext, yearEnd: string) {
    return tx.$queryRaw<{ id: string; employeeId: string; name: string; type: string; from: string; to: string; days: number }[]>`
      SELECT r.id::text, r.employee_id::text AS "employeeId", concat_ws(' ', coalesce(e.preferred_name, e.given_name), e.family_name) AS name,
             t.name AS type, r.from_on::text AS "from", r.to_on::text AS "to", r.days::float AS days
      FROM leave_requests r JOIN employees e ON e.organization_id = r.organization_id AND e.id = r.employee_id
      JOIN leave_types t ON t.organization_id = r.organization_id AND t.id = r.leave_type_id
      WHERE r.organization_id = ${c.organizationId}::uuid AND r.status IN ('pending', 'cancel_pending') AND r.from_on <= ${yearEnd}::date
        AND r.to_on > (${yearEnd}::date - interval '1 year')
      ORDER BY r.from_on LIMIT 500`;
  }

  /**
   * Posts a year end (run by the BullMQ worker, safe to re-run: every entry has its period key): the lapse entries, and
   * for each pay-out an "encashed" entry plus a one-time pay (leave_encashment) that payroll reads in the month after the
   * year end, at monthly pay (payroll.leave_encashment_basis) divided by the type's divisor.
   */
  async yearEndPost(org: string, yearEnd: string, byUserId: string | null): Promise<number> {
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: byUserId };
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const rows = await this.yearEndRows(tx, c, yearEnd);
      const lapses = rows.filter((r) => r.lapse > 0);
      const n = lapses.length
        ? (
            await tx.leaveLedgerEntry.createMany({
              data: lapses.map((r) => ({ organizationId: org, employeeId: r.employeeId, leaveTypeId: r.leaveTypeId, entryOn: asDate(yearEnd), kind: 'lapse', days: -r.lapse, periodKey: `lapse:${yearEnd}`, reason: `Year end: ${r.carry} carried forward${r.encash ? `, ${r.encash} paid out` : ''}, ${r.lapse} lapsed`, createdBy: byUserId })),
              skipDuplicates: true,
            })
          ).count
        : 0;
      const types = new Map((await this.types(tx, org)).map((t) => [t.id, t]));
      const payMonth = `${addDays(yearEnd, 1).slice(0, 7)}-01`;
      let paid = 0;
      for (const r of rows.filter((x) => x.encash > 0)) {
        const t = types.get(r.leaveTypeId)!;
        const made = await tx.leaveLedgerEntry.createMany({ data: [{ organizationId: org, employeeId: r.employeeId, leaveTypeId: r.leaveTypeId, entryOn: asDate(yearEnd), kind: 'encashed', days: -r.encash, periodKey: `ye-encash:${yearEnd}`, reason: `Year end: ${r.encash} days of ${t.name} paid out`, createdBy: byUserId }], skipDuplicates: true });
        if (!made.count) continue;
        paid++;
        const f = await factsOn(tx, org, r.employeeId, yearEnd);
        const [em] = await tx.$queryRaw<{ id: string }[]>`
          SELECT a.employment_id::text AS id FROM employee_assignments a WHERE a.organization_id = ${org}::uuid AND a.employee_id = ${r.employeeId}::uuid
            AND a.superseded_at IS NULL AND ${yearEnd}::date <@ daterange(a.valid_from, a.valid_to, '[]') ORDER BY a.valid_from DESC LIMIT 1`;
        if (!f || !em) continue;
        const pay = await payOn(tx, org, em.id, yearEnd);
        const monthly = Number((await settingOn(tx, c, 'payroll.leave_encashment_basis', f, yearEnd)) === 'gross' ? pay.gross : pay.gratuityWage);
        if (!(monthly > 0)) continue;
        const divisor = encashTerms(t.rules as unknown as LeaveRules, { maxPerYear: 0, minLeft: 0, divisor: Number(await settingOn(tx, c, 'leave.encashment.divisor', f, yearEnd)) }).divisor;
        const amount = encashAmount(monthly, divisor, r.encash);
        await tx.oneTimePay.create({ data: { organizationId: org, legalEntityId: f.legalEntityId, employeeId: r.employeeId, employmentId: em.id, componentCode: 'leave_encashment', amount: amount.amount, periodStart: asDate(payMonth), source: 'leave', sourceRef: `ye:${yearEnd}:${r.leaveTypeId}:${r.employeeId}`.slice(0, 80), reason: `Year end ${yearEnd}: ${r.encash} days of ${t.name} paid out at Rs ${amount.dailyRate.toFixed(2)} a day`, status: 'approved', createdBy: byUserId ?? f.userId ?? '00000000-0000-0000-0000-000000000000' } });
      }
      await audit(tx, c, 'leave.year_end.posted', 'leave_year_end', org, { yearEnd, lapses: n, payOuts: paid });
      return n + paid;
    });
  }
}
