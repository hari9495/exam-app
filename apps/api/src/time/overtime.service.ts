import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { SettingDef, resolveSetting } from '../org-structure/settings-registry';
import { Viewer, buildViewer, has, tenantWide, type ScopeUser } from '../access/scope';
import { ApprovalsEngine, Notice, StepSpec } from '../workflow/approvals-engine.service';
import { OtClaimDto, OtRuleDto } from './dto';
import { ScheduleBook, assertOpen } from './schedule';
import { SCOPE_MODEL, TimeSetupService } from './setup.service';
import { TIME_KEYS, Facts, asDate, dateOf, factsOn, grantCovers, holidaysFor, hrApprovers, monthRange, myEmployeeId, num, todayIn, visibleSql } from './time-core';
import { addDays } from './time-maths';
import { OtCategory, compOffDays, overtimeFor, quarterOf, scheduledMinutes } from './time-rules';

// M02 overtime (Q7, YX-AT-04): OT rules are company rules by scope and date; an employee claims OT for a worked day
// after the fact; the maths (minimum, rounding down, the company's daily cap, the P07 daily and quarterly limits) is
// fixed when the claim is raised; the manager approves through P03 (or it is approved at once where the rule needs no
// approval); minutes over a cap are paid only after an HR override with a reason. A rule may settle approved OT as
// comp-off: the credit goes into the leave ledger (YX-LV-01) exactly once, in the approval's transaction.

export const OVERTIME = 'time.overtime';
const RULE_DEF: SettingDef = { label: 'Overtime rule', scopes: ['employee', 'designation', 'grade', 'employment_type', 'department', 'location', 'legal_entity', 'tenant'], dated: true, values: [], default: '' };
const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const hm = (m: number) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} m`;
const CATEGORY: Record<OtCategory, string> = { normal: 'Working day', weekly_off: 'Weekly off', holiday: 'Holiday' };

@Injectable()
export class OvertimeService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly engine: ApprovalsEngine,
    private readonly setup: TimeSetupService,
  ) {}

  onModuleInit() {
    this.engine.register({ key: OVERTIME, label: 'Overtime', risk: 'normal', autoActions: false, onDecided: (tx, req, outcome) => this.decided(tx, req, outcome), requesterLink: () => '/yx/time/overtime' });
  }

  private viewer(user: ScopeUser): Promise<Viewer> {
    return buildViewer(this.prisma, this.tenantPrisma, user, [...TIME_KEYS]);
  }

  // ------------------------------------------------------------------------------------------ rules (set-up)

  createRule(ctx: TenantContext, user: ScopeUser, dto: OtRuleDto) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      const org = c.organizationId;
      if (dto.validFrom < todayIst()) throw new BadRequestException('An overtime rule applies from today or later.');
      if (dto.compOffHalfMinutes > dto.compOffFullMinutes) throw new BadRequestException('A half day of comp-off needs fewer minutes than a full day.');
      if (dto.settle === 'comp_off' && !(await tx.leaveType.findFirst({ where: { organizationId: org, kind: 'comp_off', active: true } }))) throw new BadRequestException('Add a comp-off leave type first, then settle overtime as comp-off.');
      if (dto.scopeType === 'tenant' && dto.scopeId) throw new BadRequestException('A company-wide rule has no scope id.');
      if (dto.scopeType !== 'tenant' && !dto.scopeId) throw new BadRequestException('Say who the rule is for.');
      const scopeId = dto.scopeType === 'tenant' ? org : dto.scopeId!;
      const model = SCOPE_MODEL[dto.scopeType];
      if (model && !(await (tx[model] as unknown as { findFirst(a: unknown): Promise<unknown> }).findFirst({ where: { organizationId: org, id: scopeId } }))) throw new NotFoundException(`No such ${dto.scopeType.replace('_', ' ')} in this company.`);
      if (await tx.overtimeRule.findFirst({ where: { organizationId: org, scopeType: dto.scopeType, scopeId, validFrom: asDate(dto.validFrom) } })) throw new ConflictException('There is already a rule there from that date. Choose another date.');
      const { scopeId: _, ...values } = dto;
      void _;
      const r = await tx.overtimeRule.create({ data: { organizationId: org, ...values, scopeId, validFrom: asDate(dto.validFrom), dailyCapMinutes: dto.dailyCapMinutes ?? null, createdBy: c.userId ?? null } });
      await audit(tx, c, 'time.ot_rule.created', 'overtime_rule', r.id, { ...dto, scopeId });
      return { id: r.id };
    });
  }

  removeRule(ctx: TenantContext, user: ScopeUser, id: string) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      const r = await tx.overtimeRule.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!r) throw new NotFoundException('Not found');
      if (dateOf(r.validFrom) <= todayIst()) throw new ConflictException('That rule is already in force. Add a new one from a later date instead.');
      if (await tx.overtimeRequest.findFirst({ where: { organizationId: c.organizationId, ruleId: id } })) throw new ConflictException('Overtime was already claimed under that rule.');
      await tx.overtimeRule.delete({ where: { id } });
      await audit(tx, c, 'time.ot_rule.removed', 'overtime_rule', id, { name: r.name, validFrom: dateOf(r.validFrom) });
    });
  }

  /** The rule in force for the person on a date (YX-ORG-18: most specific scope, dated). */
  private async ruleOn(tx: Tx, org: string, f: Facts, on: string) {
    const rows = await tx.overtimeRule.findMany({ where: { organizationId: org } });
    const r = resolveSetting(RULE_DEF, rows.map((x) => ({ id: x.id, scopeType: x.scopeType, scopeId: x.scopeId, value: x.id, validFrom: dateOf(x.validFrom) })), { employee: f.employeeId, designation: f.designationId, grade: f.gradeId ?? undefined, employment_type: f.employmentTypeId, department: f.departmentId, location: f.locationId, legal_entity: f.legalEntityId, tenant: org }, on);
    return rows.find((x) => x.id === r.value) ?? null;
  }

  /** P07 limits for the location's state (else national). */
  private async statutory(tx: Tx, state: string, on: string) {
    const rows = await tx.statutoryRuleSet.findMany({ where: { statute: 'IN.FACTORIES', jurisdiction: { in: [state, 'IN'] }, validFrom: { lte: asDate(on) } }, orderBy: { validFrom: 'desc' } });
    const v = ((rows.find((r) => r.jurisdiction === state) ?? rows[0])?.values ?? {}) as { dailyMaxWorkMinutes?: number; quarterlyOtMinutes?: number };
    return { dailyMaxWorkMinutes: v.dailyMaxWorkMinutes ?? 600, quarterlyOtMinutes: v.quarterlyOtMinutes ?? 7500 };
  }

  /** The OT a worked day gives under the rule (nothing when the day is not worked or has no rule). */
  private async workOut(tx: Tx, org: string, f: Facts, on: string, book: ScheduleBook) {
    const rule = await this.ruleOn(tx, org, f, on);
    const day = await tx.attendanceDay.findUnique({ where: { organizationId_employeeId_workOn: { organizationId: org, employeeId: f.employeeId, workOn: asDate(on) } } });
    if (!rule || !day?.workedMinutes) return { rule, day, ot: null };
    const holiday = (await holidaysFor(tx, org, f.locationId, on, on, f.employeeId)).map.get(on);
    const sched = await book.day(f, on);
    const category: OtCategory = holiday && !holiday.halfDay ? 'holiday' : sched.weeklyOff ? 'weekly_off' : 'normal';
    const shift = sched.shift ?? (await book.locationDay(f, on)).rule;
    // YX-AT-12: on a half-day leave the OT threshold is the half day's expected hours.
    const scheduled = Math.round(scheduledMinutes(shift) * (day.leavePart && day.leavePart !== 'full' ? 0.5 : 1));
    const q = quarterOf(on);
    const [{ used }] = await tx.$queryRaw<{ used: number }[]>`
      SELECT coalesce(sum(payable_minutes), 0)::int AS used FROM overtime_requests
      WHERE organization_id = ${org}::uuid AND employee_id = ${f.employeeId}::uuid AND status IN ('pending', 'approved') AND work_on BETWEEN ${q.from}::date AND ${q.to}::date`;
    const ot = overtimeFor({ category, workedMinutes: day.workedMinutes, scheduledMinutes: scheduled, rule, statutory: await this.statutory(tx, f.state, on), quarterUsedMinutes: used });
    return { rule, day, ot: { ...ot, category, scheduled, rate: Number(category === 'normal' ? rule.rateNormal : category === 'weekly_off' ? rule.rateWeeklyOff : rule.rateHoliday) } };
  }

  // ------------------------------------------------------------------------------------------ me › overtime

  /** My claims and the last 31 days with OT I could claim. */
  me(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const id = await myEmployeeId(tx, org, c.userId);
      const now = await factsOn(tx, org, id, todayIst());
      if (!now) throw new NotFoundException('You have no job assignment today. Ask HR to check your record.');
      const today = todayIn(now.zone);
      const claims = await tx.overtimeRequest.findMany({ where: { organizationId: org, employeeId: id }, orderBy: { workOn: 'desc' }, take: 60 });
      const claimed = new Set(claims.filter((x) => x.status === 'pending' || x.status === 'approved').map((x) => dateOf(x.workOn)));
      const book = await ScheduleBook.load(tx, org);
      const days = await tx.attendanceDay.findMany({ where: { organizationId: org, employeeId: id, workOn: { gte: asDate(addDays(today, -31)), lte: asDate(today) }, workedMinutes: { gt: 0 } }, orderBy: { workOn: 'desc' } });
      const open = [];
      for (const d of days) {
        const on = dateOf(d.workOn);
        if (claimed.has(on)) continue;
        const f = await factsOn(tx, org, id, on);
        if (!f) continue;
        const w = await this.workOut(tx, org, f, on, book);
        if (w.ot && w.ot.eligible > 0) open.push({ on, category: w.ot.category, workedMinutes: d.workedMinutes, scheduledMinutes: w.ot.scheduled, eligibleMinutes: w.ot.eligible, payableMinutes: w.ot.payable, overCapMinutes: w.ot.overCap, settle: w.rule!.settle, needsApproval: w.rule!.needsApproval });
      }
      return { today, claims: claims.map((x) => this.view(x)), open };
    });
  }

  private view(x: Prisma.OvertimeRequestGetPayload<object>) {
    return { id: x.id, employeeId: x.employeeId, on: dateOf(x.workOn), category: x.category, workedMinutes: x.workedMinutes, scheduledMinutes: x.scheduledMinutes, eligibleMinutes: x.eligibleMinutes, payableMinutes: x.payableMinutes, overCapMinutes: x.overCapMinutes, rate: num(x.rate), settle: x.settle, compOffDays: num(x.compOffDays), reason: x.reason, status: x.status, overridden: Boolean(x.overrideReason), overrideReason: x.overrideReason, createdAt: x.createdAt, decidedAt: x.decidedAt };
  }

  /** A claim for one worked day (after the fact, Q7), routed through P03 unless the rule needs no approval. */
  async claim(ctx: TenantContext, user: ScopeUser, dto: OtClaimDto) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    const notices: Notice[] = [];
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await myEmployeeId(tx, org, c.userId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ot:${org}:${me}`}))`;
      const f = await factsOn(tx, org, me, dto.on);
      if (!f) throw new BadRequestException('You were not working here on that day.');
      if (dto.on > todayIn(f.zone)) throw new BadRequestException('Claim overtime once the day is worked.');
      await assertOpen(tx, org, me, dto.on);
      if (await tx.overtimeRequest.findFirst({ where: { organizationId: org, employeeId: me, workOn: asDate(dto.on), status: { in: ['pending', 'approved'] } } })) throw new ConflictException('Overtime for that day is already claimed.');
      const w = await this.workOut(tx, org, f, dto.on, await ScheduleBook.load(tx, org));
      if (!w.rule) throw new BadRequestException('No overtime rule applies to you. Ask HR.');
      if (!w.ot || w.ot.eligible === 0) throw new BadRequestException(`No overtime on ${fmt(dto.on)}: the time past your shift is below the ${w.rule.minMinutes} minutes that count.`);
      const settle = w.rule.settle;
      const compOff = settle === 'comp_off' ? compOffDays(w.ot.payable, w.rule.compOffHalfMinutes, w.rule.compOffFullMinutes) : 0;
      const r = await tx.overtimeRequest.create({
        data: { organizationId: org, employeeId: me, workOn: asDate(dto.on), ruleId: w.rule.id, category: w.ot.category, scheduledMinutes: w.ot.scheduled, workedMinutes: w.day!.workedMinutes!, eligibleMinutes: w.ot.eligible, payableMinutes: w.ot.payable, overCapMinutes: w.ot.overCap, rate: w.ot.rate, settle, compOffDays: compOff, reason: dto.reason, raisedBy: c.userId ?? null },
      });
      const hr = await hrApprovers(tx, org, me, todayIst(), f.userId);
      const steps: StepSpec[] = w.rule.needsApproval ? [{ name: 'Manager', approvers: [{ kind: 'manager' }], mode: 'any', remindAfterHours: 24, timeoutHours: 72, onTimeout: 'escalate' }] : [];
      const sub = await this.engine.submit(tx, c, {
        type: OVERTIME,
        subjectType: 'overtime_request',
        subjectId: r.id,
        title: `${f.name}: overtime on ${fmt(dto.on)} (${hm(w.ot.payable)})`,
        summary: [
          { label: 'Day', value: `${fmt(dto.on)} · ${CATEGORY[w.ot.category]}` },
          { label: 'Worked', value: `${hm(w.day!.workedMinutes!)} against ${hm(w.ot.scheduled)} expected` },
          { label: 'Overtime', value: `${hm(w.ot.payable)} at ${w.ot.rate}×${w.ot.overCap ? ` (${hm(w.ot.overCap)} more is over the limit and needs HR)` : ''}` },
          { label: 'Settled as', value: settle === 'comp_off' ? `Comp-off: ${compOff} ${compOff === 1 ? 'day' : 'days'}` : 'Paid in payroll' },
          { label: 'Why', value: dto.reason.slice(0, 300) },
        ],
        subjectPersonId: f.personId,
        requesterUserId: c.userId ?? null,
        raisedByUserId: c.userId ?? null,
        steps,
        payload: {},
        payloadFields: [],
        fallbackUserIds: hr,
      });
      notices.push(...sub.notices);
      await tx.overtimeRequest.update({ where: { id: r.id }, data: { wfRequestId: sub.id } });
      await audit(tx, c, 'time.ot.claimed', 'overtime_request', r.id, { on: dto.on, eligible: w.ot.eligible, payable: w.ot.payable, overCap: w.ot.overCap, settle });
      return this.view(await tx.overtimeRequest.findFirstOrThrow({ where: { id: r.id } }));
    });
    await this.engine.send(ctx, notices);
    return res;
  }

  async withdraw(ctx: TenantContext, user: ScopeUser, id: string) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const me = await myEmployeeId(tx, c.organizationId, c.userId);
      const r = await tx.overtimeRequest.findFirst({ where: { organizationId: c.organizationId, id, employeeId: me } });
      if (!r) throw new NotFoundException('No such claim.');
      if (r.status !== 'pending') throw new ConflictException('Only a claim still waiting can be withdrawn.');
      if (r.wfRequestId) await this.engine.withdraw(tx, c, r.wfRequestId, c.userId ?? null, 'Withdrawn by the employee');
      await tx.overtimeRequest.update({ where: { id }, data: { status: 'withdrawn', decidedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
      return { id, status: 'withdrawn' };
    });
  }

  /** P03 effect, exactly once: the status, and for comp-off the ledger credit (YX-LV-01, period key per claim). */
  private async decided(tx: Tx, wf: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const r = await tx.overtimeRequest.findFirst({ where: { organizationId: wf.organizationId, id: wf.subjectId } });
    if (!r || r.status !== 'pending') return;
    await tx.overtimeRequest.update({ where: { id: r.id }, data: { status: outcome, decidedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
    if (outcome === 'approved' && r.settle === 'comp_off') await this.creditCompOff(tx, r, num(r.compOffDays));
  }

  private async creditCompOff(tx: Tx, r: Prisma.OvertimeRequestGetPayload<object>, days: number, key = `ot:${r.id}`) {
    if (days <= 0) return;
    const t = await tx.leaveType.findFirst({ where: { organizationId: r.organizationId, kind: 'comp_off', active: true }, orderBy: { createdAt: 'asc' } });
    // DECISION NEEDED: a rule settled as comp-off with no comp-off type in use (it was switched off later): the credit
    // is skipped and the OT stays unpaid; payroll could pay it instead. The set-up refuses such a rule up front.
    if (!t) return;
    await tx.leaveLedgerEntry.createMany({
      data: [{ organizationId: r.organizationId, employeeId: r.employeeId, leaveTypeId: t.id, entryOn: r.workOn, kind: 'comp_off', days, requestId: null, periodKey: key, reason: `Comp-off for overtime on ${fmt(dateOf(r.workOn))}` }],
      skipDuplicates: true,
    });
  }

  // ------------------------------------------------------------------------------------------ team and HR review

  /** Claims of a month for the people the viewer may see (team, or attendance.view in scope). */
  async review(ctx: TenantContext, user: ScopeUser, month: string) {
    const { from, to } = monthRange(month);
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = v.userId && !v.actingForOther ? ((await tx.employee.findFirst({ where: { organizationId: org, userId: v.userId }, select: { id: true } }))?.id ?? null) : null;
      const rows = await tx.$queryRaw<{ id: string; name: string; code: string | null }[]>`
        SELECT r.id::text, concat_ws(' ', coalesce(e.preferred_name, e.given_name), e.family_name) AS name, m.employee_code::text AS code
        FROM overtime_requests r JOIN employees e ON e.organization_id = r.organization_id AND e.id = r.employee_id
        LEFT JOIN employments m ON m.organization_id = e.organization_id AND m.employee_id = e.id AND m.exited_on IS NULL
        WHERE r.organization_id = ${org}::uuid AND r.work_on BETWEEN ${from}::date AND ${to}::date AND r.employee_id <> ${own ?? '00000000-0000-0000-0000-000000000000'}::uuid
          AND ${await visibleSql(tx, c, v, own, 'attendance.view', Prisma.sql`r.employee_id`, to)}
        ORDER BY r.work_on DESC LIMIT 500`;
      const full = rows.length ? await tx.overtimeRequest.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.id) } } }) : [];
      const canOverride = has(v, 'leave.approve') && !v.actingForOther;
      const out = [];
      for (const r of rows) {
        const x = full.find((y) => y.id === r.id)!;
        out.push({ ...this.view(x), name: r.name, code: r.code, canOverride: canOverride && x.overCapMinutes > 0 && !x.overrideReason && x.status === 'approved' && (await grantCovers(tx, c, v, own, 'leave.approve', x.employeeId, to)) });
      }
      return { month, scope: tenantWide(v, 'attendance.view') ? 'company' : has(v, 'attendance.view') ? 'granted' : 'team', claims: out };
    });
  }

  /**
   * Q7: minutes over a cap are paid only with an HR override and a reason (leave.approve over the person, never one's
   * own claim). For comp-off the extra minutes may lift the credit to the next step.
   */
  async override(ctx: TenantContext, user: ScopeUser, id: string, reason: string) {
    const v = await this.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const r = await tx.overtimeRequest.findFirst({ where: { organizationId: org, id } });
      const own = v.userId ? ((await tx.employee.findFirst({ where: { organizationId: org, userId: v.userId }, select: { id: true } }))?.id ?? null) : null;
      if (!r || !(await grantCovers(tx, c, v, own, 'leave.approve', r.employeeId, todayIst()))) throw new NotFoundException('Not found');
      if (r.employeeId === own) throw new ForbiddenException('You cannot override a limit on your own overtime.');
      if (r.status !== 'approved' || r.overCapMinutes === 0 || r.overrideReason) throw new ConflictException('Only approved overtime over a limit can be overridden, once.');
      await assertOpen(tx, org, r.employeeId, dateOf(r.workOn));
      await tx.overtimeRequest.update({ where: { id }, data: { overrideReason: reason, overriddenBy: c.userId ?? null, version: { increment: 1 }, updatedAt: new Date() } });
      if (r.settle === 'comp_off') {
        const rule = await tx.overtimeRule.findFirstOrThrow({ where: { organizationId: org, id: r.ruleId } });
        const extra = compOffDays(r.eligibleMinutes, rule.compOffHalfMinutes, rule.compOffFullMinutes) - num(r.compOffDays);
        await this.creditCompOff(tx, r, extra, `ot-override:${r.id}`);
      }
      await audit(tx, c, 'time.ot.overridden', 'overtime_request', id, { employeeId: r.employeeId, overCapMinutes: r.overCapMinutes, reason });
      return { id };
    });
  }
}
