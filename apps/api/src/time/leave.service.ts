import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { Viewer, buildViewer, has, tenantWide, type ScopeUser } from '../access/scope';
import { ApprovalsEngine, Notice, StepSpec } from '../workflow/approvals-engine.service';
import { DayEngine } from './day-engine.service';
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
  holidaysFor,
  maternityDays,
  mustSee,
  myEmployeeId,
  num,
  policyOn,
  rulesFor,
  settingOn,
  statutoryOn,
  todayIn,
  visibleSql,
} from './time-core';
import { CountedDay, accrualsDue, addDays, applyFloors, countLeaveDays, daysBetween, isWeeklyOff, leaveYearOf, yearEndSplit } from './time-maths';

// M02 Part A leave on the shared engines: requests route through P03 (manager, then HR by the type's rule), the
// ledger is the only balance (YX-LV-01), days are counted with the location's holidays and weekly offs (YX-LV-03),
// rules are checked before submit (YX-LV-05), medical reasons are Special (YX-LV-09). Approved leave hands an
// approver's tasks to their delegate (P03 Q3) and feeds attendance and the Service Desk.

export const LEAVE_REQUEST = 'leave.request';
export const LEAVE_CANCEL = 'leave.cancel';
const ACTIVE = ['pending', 'approved', 'cancel_pending'];
type Req = Prisma.LeaveRequestGetPayload<object>;
type LeaveTypeRow = Prisma.LeaveTypeGetPayload<object>;

const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
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
    this.engine.register({ key: LEAVE_REQUEST, label: 'Leave', risk: 'normal', autoActions: false, onDecided: (tx, req, outcome) => this.requestDecided(tx, req, outcome), requesterLink: () => '/yx/time/leave' });
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
    const st = await statutoryOn(tx, f.state, on);
    const floored = applyFloors(lines.map((l) => ({ kind: kinds.get(l.leaveTypeId) ?? 'other', annualDays: l.annualDays })), st.floors);
    return new Map(lines.map((l, i) => [l.leaveTypeId, floored.annual[i]]));
  }

  async balancesIn(tx: Tx, c: CompanyContext, f: Facts, on: string): Promise<Balance[]> {
    const org = c.organizationId;
    const types = (await this.types(tx, org)).filter((t) => t.active);
    const policy = await policyOn(tx, c, f, on);
    const lines = policy?.lines ?? [];
    const ent = await this.entitlements(tx, f, on, lines, types);
    const year = leaveYearOf(on, Number(await settingOn(tx, c, 'leave.year_start_month', f, on)));
    const sums = new Map((await tx.leaveLedgerEntry.groupBy({ by: ['leaveTypeId'], where: { organizationId: org, employeeId: f.employeeId }, _sum: { days: true } })).map((g) => [g.leaveTypeId, num(g._sum.days)]));
    const pending = new Map((await tx.leaveRequest.groupBy({ by: ['leaveTypeId'], where: { organizationId: org, employeeId: f.employeeId, status: 'pending' }, _sum: { days: true } })).map((g) => [g.leaveTypeId, num(g._sum.days)]));
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
    if (!balance) blocks.push(`${t.name} is not part of your leave policy.`);
    const { map } = await holidaysFor(tx, org, f.locationId, dto.from, dto.to, f.employeeId);
    const rule = await rulesFor(tx, org, f.locationId, dto.to);
    const counted = countLeaveDays({ from: dto.from, to: dto.to, fromHalf, toHalf, holidays: map, weeklyOff: (d) => isWeeklyOff(d, rule(d).weeklyOffs), rules: rules });
    const total = counted.total;
    if (!rules.halfDays && (fromHalf !== 'full' || toHalf !== 'full')) blocks.push(`${t.name} is taken in whole days.`);
    if (total === 0) blocks.push('Those days are holidays or weekly offs. Nothing to apply for.');
    if (dto.from < f.joinedOn || (f.exitedOn && dto.to > f.exitedOn)) blocks.push('Some of those days are outside your employment.');
    if (dto.from < addDays(today, -60)) blocks.push('Leave more than 60 days back needs HR. Ask them to record it.');
    if (rules.noticeDays && daysBetween(today, dto.from) < rules.noticeDays) blocks.push(`${t.name} needs ${daysText(rules.noticeDays)} notice.`);
    if (rules.minDays !== null && total > 0 && total < rules.minDays) blocks.push(`${t.name} is at least ${daysText(rules.minDays)} at a time.`);
    if (rules.maxDays !== null && total > rules.maxDays) blocks.push(`${t.name} is at most ${daysText(rules.maxDays)} at a time.`);
    if (t.kind === 'maternity' && total > (await maternityDays(tx, dto.from))) blocks.push(`Maternity leave is at most ${await maternityDays(tx, dto.from)} days (Maternity Benefit Act).`);
    const certificateNeeded = rules.certificateAfterDays !== null && total > rules.certificateAfterDays;
    // Overlap (a first half and a second half of one date may sit side by side).
    const clash = await tx.$queryRaw<{ on: string }[]>`
      SELECT d.leave_on::text AS on FROM leave_request_days d
      JOIN leave_requests r ON r.organization_id = d.organization_id AND r.id = d.request_id
      WHERE d.organization_id = ${org}::uuid AND d.employee_id = ${f.employeeId}::uuid AND d.active AND d.portion > 0
        AND r.status = ANY(${ACTIVE}::text[]) AND d.leave_on BETWEEN ${dto.from}::date AND ${dto.to}::date
        AND (d.part = 'full' OR d.part = ANY(${counted.days.filter((x) => x.portion > 0).map((x) => (x.part === 'full' ? ['first', 'second', 'full'] : [x.part])).flat()}::text[]))
        AND d.leave_on = ANY(${counted.days.filter((x) => x.portion > 0).map((x) => x.on)}::date[])
      ORDER BY 1 LIMIT 1`;
    if (clash.length) blocks.push(`You already have leave on ${fmt(clash[0].on)}.`);
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
    return { type: { id: t.id, code: t.code, name: t.name, kind: t.kind, rules }, days: counted.days, total, holidaysExcluded, sandwichDays, balance, balanceAfter, othersOff: n, certificateNeeded, blocks, warnings };
  }

  private async meFacts(tx: Tx, c: CompanyContext, userId: string | null | undefined): Promise<{ f: Facts; today: string }> {
    const id = await myEmployeeId(tx, c.organizationId, userId);
    const now = await factsOn(tx, c.organizationId, id, new Date().toISOString().slice(0, 10));
    const f = now ?? (await factsOn(tx, c.organizationId, id, addDays(new Date().toISOString().slice(0, 10), 1)));
    if (!f) throw new NotFoundException('You have no job assignment today. Ask HR to check your record.');
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
      const balances = await this.balancesIn(tx, c, f, today);
      const year = leaveYearOf(today, Number(await settingOn(tx, c, 'leave.year_start_month', f, today)));
      const requests = await tx.leaveRequest.findMany({ where: { organizationId: org, employeeId: f.employeeId, toOn: { gte: asDate(addDays(today, -400)) } }, orderBy: { fromOn: 'desc' }, take: 100 });
      const types = new Map((await this.types(tx, org)).map((t) => [t.id, t]));
      const cal = (await tx.holidayCalendar.findFirst({ where: { organizationId: org, locationId: f.locationId } })) ?? (await tx.holidayCalendar.findFirst({ where: { organizationId: org, locationId: null } }));
      const holidays = cal ? await tx.holiday.findMany({ where: { organizationId: org, calendarId: cal.id, holidayOn: { gte: asDate(year.start), lte: asDate(year.end) } }, orderBy: { holidayOn: 'asc' } }) : [];
      const chosen = new Set((await tx.optionalHolidayChoice.findMany({ where: { organizationId: org, employeeId: f.employeeId } })).map((x) => x.holidayId));
      return {
        employee: { id: f.employeeId, name: f.name, code: f.code },
        today,
        year,
        balances,
        requests: requests.map((r) => this.requestView(r, types.get(r.leaveTypeId), true)),
        holidays: {
          calendar: cal ? { id: cal.id, name: cal.name, optionalLimit: cal.optionalLimit } : null,
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

  /** The request for `f`, raised by the signed-in person (c.userId; null for an import or the demo seed). */
  async applyIn(tx: Tx, c: CompanyContext, f: Facts, today: string, dto: ApplyLeaveDto, notices: Notice[]) {
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
        },
      });
      await tx.leaveRequestDay.createMany({ data: p.days.map((d) => ({ organizationId: org, requestId: req.id, employeeId: f.employeeId, leaveOn: asDate(d.on), part: d.part, portion: d.portion, countedAs: d.countedAs })) });
      const hr = p.type.rules.hrApprovalAboveDays;
      const hrUsers = await hrApprovers(tx, org, f.employeeId, today);
      const steps: StepSpec[] = [{ name: 'Manager', approvers: [{ kind: 'manager' }], mode: 'any', remindAfterHours: 24, timeoutHours: 72, onTimeout: 'escalate' }];
      if (hr !== null) {
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
        { label: 'Team', value: p.othersOff ? `${p.othersOff} ${p.othersOff === 1 ? 'other is' : 'others are'} off then` : 'No one else in the team is off then' },
        ...(p.balanceAfter !== null ? [{ label: 'Balance after', value: String(p.balanceAfter) }] : []),
        // YX-LV-09: approvers see the certificate's status only, never the file; a medical reason never.
        ...(req.certificate !== 'none' ? [{ label: 'Certificate', value: req.certificate === 'verified' ? 'Attached · verified' : 'To be given · pending' }] : []),
        ...(reason && !p.type.rules.medical ? [{ label: 'Reason', value: reason.slice(0, 300) }] : []),
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
      await audit(tx, c, 'leave.request.submitted', 'leave_request', req.id, { employeeId: f.employeeId, type: p.type.code, from: dto.from, to: dto.to, days: p.total, wfRequestId: sub.id });
      return { id: req.id, status: (await tx.leaveRequest.findFirstOrThrow({ where: { id: req.id } })).status, days: p.total, wfRequestId: sub.id };
    }
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
      if (r.status !== 'pending') throw new ConflictException('Only a request still waiting for approval can be withdrawn.');
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
      // P08 seam: periods are not locked yet; leave older than last month waits for the late-correction flow.
      if (dateOf(r.toOn) < addDays(`${today.slice(0, 7)}-01`, -31)) throw new ConflictException('That leave is too far back to cancel here. Ask HR.');
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
        fallbackUserIds: await hrApprovers(tx, c.organizationId, f.employeeId, today),
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
      return { ...this.requestView(r, t ?? undefined, withReason), person: f ? { name: f.name, code: f.code } : null, route: route ? { status: route.status, steps: route.steps, log: route.log } : null };
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
  async teamCalendar(ctx: TenantContext, user: ScopeUser, from: string, to: string) {
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
  async hrBalances(ctx: TenantContext, user: ScopeUser) {
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
        const year = leaveYearOf(dateOf(h.holidayOn), Number(await settingOn(tx, c, 'leave.year_start_month', f, today)));
        const taken = await tx.$queryRaw<{ n: number }[]>`
          SELECT count(*)::int AS n FROM optional_holiday_choices x JOIN holidays h ON h.organization_id = x.organization_id AND h.id = x.holiday_id
          WHERE x.organization_id = ${c.organizationId}::uuid AND x.employee_id = ${f.employeeId}::uuid AND h.holiday_on BETWEEN ${year.start}::date AND ${year.end}::date`;
        if (taken[0].n >= cal.optionalLimit) throw new ConflictException(`You can choose ${cal.optionalLimit} optional holidays a year. Remove one first.`);
        await tx.optionalHolidayChoice.upsert({ where: { organizationId_employeeId_holidayId: key }, create: key, update: {} });
      }
      await audit(tx, c, choose ? 'leave.optional_holiday.chosen' : 'leave.optional_holiday.removed', 'holiday', h.id, { employeeId: f.employeeId });
      return { holidayId: h.id, chosen: choose };
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
        const year = leaveYearOf(local, Number(await settingOn(tx, c, 'leave.year_start_month', f, local)));
        const data = policy.lines.flatMap((l) => {
          const t = types.get(l.leaveTypeId);
          if (!t || !t.active || !hasBalance(t.kind) || t.kind === 'comp_off') return [];
          return accrualsDue({ ...l, annualDays: ent.get(l.leaveTypeId) ?? l.annualDays }, { yearStart: year.start, joinedOn: f.joinedOn, exitedOn: f.exitedOn, upTo: local }).map((d) => ({
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

  /** Year end preview (YX-LV-07): per employee and type, carry forward and lapse at the leave year ending `yearEnd`. */
  async yearEndRows(tx: Tx, c: CompanyContext, yearEnd: string) {
    const org = c.organizationId;
    const types = new Map((await this.types(tx, org)).map((t) => [t.id, t]));
    const employees = await tx.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT a.employee_id::text AS id FROM employee_assignments a
      WHERE a.organization_id = ${org}::uuid AND a.superseded_at IS NULL AND ${yearEnd}::date <@ daterange(a.valid_from, a.valid_to, '[]')`;
    const rows: { employeeId: string; name: string; code: string | null; leaveTypeId: string; type: string; balance: number; carry: number; lapse: number; encashable: boolean }[] = [];
    for (const e of employees) {
      const f = await factsOn(tx, org, e.id, yearEnd);
      if (!f) continue;
      const year = leaveYearOf(yearEnd, Number(await settingOn(tx, c, 'leave.year_start_month', f, yearEnd)));
      if (year.end !== yearEnd) continue;
      const policy = await policyOn(tx, c, f, yearEnd);
      if (!policy) continue;
      const st = await statutoryOn(tx, f.state, yearEnd);
      for (const l of policy.lines) {
        const t = types.get(l.leaveTypeId);
        if (!t || !hasBalance(t.kind)) continue;
        const sum = num((await tx.leaveLedgerEntry.aggregate({ where: { organizationId: org, employeeId: f.employeeId, leaveTypeId: t.id, entryOn: { lte: asDate(yearEnd) } }, _sum: { days: true } }))._sum.days);
        // P07: a company carry-forward cap below the state's accumulation floor is raised to it.
        const cap = l.carryForwardMax === null ? null : Math.max(l.carryForwardMax, st.carry[t.kind] ?? 0);
        const split = yearEndSplit(Math.round(sum * 100) / 100, cap);
        rows.push({ employeeId: f.employeeId, name: f.name, code: f.code, leaveTypeId: t.id, type: t.code, balance: Math.round(sum * 100) / 100, carry: split.carry, lapse: split.lapse, encashable: Boolean((t.rules as unknown as LeaveRules).encashable) });
      }
    }
    return rows;
  }

  /** Posts the lapses of a previewed year end; run by the BullMQ worker, idempotent by period key. */
  async yearEndPost(org: string, yearEnd: string, byUserId: string | null): Promise<number> {
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: byUserId };
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const rows = (await this.yearEndRows(tx, c, yearEnd)).filter((r) => r.lapse > 0);
      const n = rows.length
        ? (
            await tx.leaveLedgerEntry.createMany({
              data: rows.map((r) => ({ organizationId: org, employeeId: r.employeeId, leaveTypeId: r.leaveTypeId, entryOn: asDate(yearEnd), kind: 'lapse', days: -r.lapse, periodKey: `lapse:${yearEnd}`, reason: `Year end: ${r.carry} carried forward, ${r.lapse} lapsed`, createdBy: byUserId })),
              skipDuplicates: true,
            })
          ).count
        : 0;
      await audit(tx, c, 'leave.year_end.posted', 'leave_year_end', org, { yearEnd, lapses: n });
      return n;
    });
  }
}
