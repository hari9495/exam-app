import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService, revokeStaffSessions } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { SETTINGS, resolveSetting } from '../org-structure/settings-registry';
import { Viewer, has, type ScopeUser, inEntitySql } from '../access/scope';
import { ApprovalsEngine, Notice } from '../workflow/approvals-engine.service';
import { NotificationsService } from '../notifications/notifications.service';
import { escapeHtml } from '../notifications/notification-email-render';
import { payOn } from '../payroll/fnf.service';
import { entitiesFor, payViewer, withPayScope } from '../payroll/pay-access';
import { DayEngine } from './day-engine.service';
import { LeaveService } from './leave.service';
import { Facts, LeaveRules, asDate, dateOf, factsOn, grantCovers, hasBalance, holidaysFor, hrApprovers, num, rulesFor, settingOn, todayIn, visibleSql, type TimeKey } from './time-core';
import { addDays, daysBetween, isWeeklyOff, leaveYearOf } from './time-maths';
import { cloneToYear, templateRows } from './holiday-rules';
import { ScheduleBook, lockedDates } from './schedule';
import { BLOCK_DATE_EXEMPT, CompOffCredit, compOffExpiries, compOffUseBy, dailyPay, encashAmount, encashMax, encashWindowOpen, longestRun, toCsv } from './leave-rules';
import { FEED_STATES, HOLIDAY_PROVIDER, HolidayProvider } from './holiday-feed.provider';
import type { BlockDateDto, CompOffClaimDto, DateNoteDto, EncashDto, FeedDecideDto, LongAbsenceDto, ReportQueryDto } from './leave-v2.dto';

// Leave v2 (29 Oct 2026, docs/yukthix/time-design-map.md §B "Leave v2 feature sheet"). Comp-off claims and credits,
// encashment, long absences, company block dates, the block-leave planner, holiday feeds, the HR leave home and the
// leave reports. The one leave ledger stays the only balance (YX-LV-01): comp-off from overtime (the other Time
// builder) is credited through creditCompOff below, so both kinds expire by the same rule.

export const COMP_OFF_CLAIM = 'leave.comp_off';
export const LEAVE_ENCASH = 'leave.encashment';
const WAITING = ['pending', 'approved', 'cancel_pending'];
const ALIASES = ['e.id', 'r.employee_id', 'l.employee_id', 'd.employee_id', 'a.employee_id'] as const;
type Alias = (typeof ALIASES)[number];
const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
const r2 = (n: number) => Math.round(n * 100) / 100;
const ABSENCE_NAME: Record<string, string> = { maternity: 'maternity leave', sabbatical: 'sabbatical', lwp: 'long leave without pay' };
/** The start of today in India (IST), as an instant. */
const istDayStart = () => new Date(Date.parse(`${todayIn('Asia/Kolkata')}T00:00:00+05:30`));
const name = (alias: string) => Prisma.raw(`concat_ws(' ', coalesce(${alias}.preferred_name, ${alias}.given_name), ${alias}.family_name)`);
/** The tax note shown with every encashment (Income-tax Act 1961). */
export const ENCASH_TAX_NOTE = 'Cashed-in leave while you work is taxed as salary in the month it is paid. At retirement or resignation it is tax-free up to the limit under section 10(10AA).';

type ClaimRow = Prisma.CompOffClaimGetPayload<object>;
type EncashRow = Prisma.LeaveEncashmentGetPayload<object>;

/** Founder answer A: the liability report opens with leave.view or leave.liability.view; every other report needs leave.view. */
const reportKeys = (q: ReportQueryDto): TimeKey[] => (q.report === 'liability' ? ['leave.view', 'leave.liability.view'] : ['leave.view']);

@Injectable()
export class LeaveV2Service implements OnModuleInit {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly leave: LeaveService,
    private readonly engine: ApprovalsEngine,
    private readonly dayEngine: DayEngine,
    private readonly notifications: NotificationsService,
    @Inject(HOLIDAY_PROVIDER) private readonly provider: HolidayProvider,
  ) {}

  onModuleInit() {
    this.engine.register({ key: COMP_OFF_CLAIM, label: 'Comp-off', risk: 'normal', autoActions: false, onDecided: (tx, req, outcome) => this.claimDecided(tx, req, outcome), requesterLink: () => '/yx/time/leave' });
    this.engine.register({ key: LEAVE_ENCASH, label: 'Leave encashment', risk: 'normal', autoActions: false, onDecided: (tx, req, outcome) => this.encashDecided(tx, req, outcome), requesterLink: () => '/yx/time/leave' });
  }

  // ------------------------------------------------------------------------------------------ shared

  private async own(tx: Tx, c: CompanyContext, v: Viewer) {
    if (!v.userId || v.actingForOther) return null;
    return (await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: v.userId }, select: { id: true } }))?.id ?? null;
  }

  private noProxy(user: ScopeUser) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
  }

  /** A company setting (the company's value, or a legal entity's own when `entityId` is given). */
  private async tenantSetting(tx: Tx, c: CompanyContext, key: string, entityId?: string): Promise<string> {
    const rows = await tx.setting.findMany({ where: { organizationId: c.organizationId, key } });
    return String(resolveSetting(SETTINGS[key], rows.map((r) => ({ id: r.id, scopeType: r.scopeType, scopeId: r.scopeId, value: r.value, validFrom: r.validFrom ? dateOf(r.validFrom) : null })), { tenant: c.organizationId, ...(entityId ? { legal_entity: entityId } : {}) }, todayIn('Asia/Kolkata')).value);
  }

  private async compOffType(tx: Tx, org: string) {
    return tx.leaveType.findFirst({ where: { organizationId: org, kind: 'comp_off', active: true }, orderBy: { createdAt: 'asc' } });
  }

  private async employmentOf(tx: Tx, org: string, employeeId: string, on: string) {
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      SELECT a.employment_id::text AS id FROM employee_assignments a WHERE a.organization_id = ${org}::uuid AND a.employee_id = ${employeeId}::uuid
        AND a.superseded_at IS NULL AND ${on}::date <@ daterange(a.valid_from, a.valid_to, '[]') ORDER BY a.valid_from DESC LIMIT 1`;
    return row?.id ?? null;
  }

  // ------------------------------------------------------------------------------------------ TIM-22 comp-off

  private async expiryDays(tx: Tx, c: CompanyContext, f: Facts, on: string) {
    const v = await settingOn(tx, c, 'leave.comp_off.expiry_days', f, on);
    return v === 'never' ? null : Number(v);
  }

  /** Weekly offs and holidays worked in the claim window, with how much can be claimed for each (half or full day). */
  private async eligibleDays(tx: Tx, c: CompanyContext, f: Facts, today: string) {
    const org = c.organizationId;
    const within = Number(await settingOn(tx, c, 'leave.comp_off.claim_within_days', f, today));
    const from = addDays(today, -within) < f.joinedOn ? f.joinedOn : addDays(today, -within);
    const worked = await tx.attendanceDay.findMany({ where: { organizationId: org, employeeId: f.employeeId, workOn: { gte: asDate(from), lte: asDate(today) }, workedMinutes: { gt: 0 } }, orderBy: { workOn: 'desc' } });
    if (!worked.length) return [];
    const book = await ScheduleBook.load(tx, org);
    await book.prime([f.employeeId], from, today);
    const { map: holidays } = await holidaysFor(tx, org, f.locationId, from, today, f.employeeId);
    const rule = await rulesFor(tx, org, f.locationId, today);
    const live = new Set((await tx.compOffClaim.findMany({ where: { organizationId: org, employeeId: f.employeeId, status: { in: ['pending', 'approved'] }, workedOn: { gte: asDate(from) } }, select: { workedOn: true } })).map((x) => dateOf(x.workedOn)));
    // Already credited another way (overtime settled as comp-off is credited on the day worked).
    const credited = new Set((await tx.leaveLedgerEntry.findMany({ where: { organizationId: org, employeeId: f.employeeId, kind: 'comp_off', entryOn: { gte: asDate(from) } }, select: { entryOn: true } })).map((x) => dateOf(x.entryOn)));
    const out: { on: string; kind: 'weekly_off' | 'holiday'; holiday: string | null; workedMinutes: number; maxDays: number }[] = [];
    for (const d of worked) {
      const on = dateOf(d.workOn);
      const h = holidays.get(on);
      const off = (await book.day(f, on)).weeklyOff;
      if ((!off && (!h || h.halfDay)) || live.has(on) || credited.has(on)) continue;
      const r = rule(on);
      const mins = d.workedMinutes ?? 0;
      const maxDays = mins >= r.fullDayMinutes ? 1 : mins >= r.halfDayMinutes ? 0.5 : 0;
      if (maxDays) out.push({ on, kind: h ? 'holiday' : 'weekly_off', holiday: h?.name ?? null, workedMinutes: mins, maxDays });
    }
    return out;
  }

  private claimView(x: ClaimRow, expiry: number | null) {
    return { id: x.id, on: dateOf(x.workedOn), kind: x.dayKind, workedMinutes: x.workedMinutes, days: num(x.days), reason: x.reason, status: x.status, useBy: compOffUseBy(dateOf(x.workedOn), expiry), createdAt: x.createdAt, decidedAt: x.decidedAt };
  }

  /** GET me/comp-off: what I can claim, my claims and my credits with their use-by dates. */
  myCompOff(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { f, today } = await this.leave.meFacts(tx, c, c.userId);
      const org = c.organizationId;
      const type = await this.compOffType(tx, org);
      const expiry = await this.expiryDays(tx, c, f, today);
      const within = Number(await settingOn(tx, c, 'leave.comp_off.claim_within_days', f, today));
      if (!type) return { enabled: false, today, within, expiryDays: expiry, eligible: [], claims: [], credits: [] };
      const claims = await tx.compOffClaim.findMany({ where: { organizationId: org, employeeId: f.employeeId, createdAt: { gte: new Date(Date.now() - 400 * 86_400_000) } }, orderBy: { workedOn: 'desc' }, take: 100 });
      const credits = await tx.leaveLedgerEntry.findMany({ where: { organizationId: org, employeeId: f.employeeId, leaveTypeId: type.id, kind: 'comp_off', entryOn: { gte: asDate(addDays(today, -(expiry ?? 365))) } }, orderBy: { entryOn: 'asc' } });
      return {
        enabled: true,
        today,
        within,
        expiryDays: expiry,
        eligible: await this.eligibleDays(tx, c, f, today),
        claims: claims.map((x) => this.claimView(x, expiry)),
        credits: credits.map((x) => ({ id: x.id, on: dateOf(x.entryOn), days: num(x.days), reason: x.reason, useBy: compOffUseBy(dateOf(x.entryOn), expiry) })),
      };
    });
  }

  /** POST me/comp-off: claim a worked weekly off or holiday; the manager approves (P03). */
  async claimCompOff(ctx: TenantContext, user: ScopeUser, dto: CompOffClaimDto) {
    this.noProxy(user);
    const notices: Notice[] = [];
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { f, today } = await this.leave.meFacts(tx, c, c.userId);
      const org = c.organizationId;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`leave:${org}:${f.employeeId}`}))`;
      if (!(await this.compOffType(tx, org))) throw new ConflictException('Comp-off is not set up in your company. Ask HR.');
      if (await tx.compOffClaim.findFirst({ where: { organizationId: org, employeeId: f.employeeId, workedOn: asDate(dto.on), status: { in: ['pending', 'approved'] } }, select: { id: true } })) throw new ConflictException(`You have already claimed comp-off for ${fmt(dto.on)}.`);
      const day = (await this.eligibleDays(tx, c, f, today)).find((x) => x.on === dto.on);
      if (!day) throw new BadRequestException(`${fmt(dto.on)} can't be claimed. Claim a weekly off or holiday you worked in the last ${await settingOn(tx, c, 'leave.comp_off.claim_within_days', f, today)} days.`);
      if (dto.days > day.maxDays) throw new BadRequestException(`You worked ${Math.floor(day.workedMinutes / 60)} h ${day.workedMinutes % 60} min on ${fmt(dto.on)}: claim a half day.`);
      const claim = await tx.compOffClaim.create({ data: { organizationId: org, employeeId: f.employeeId, workedOn: asDate(dto.on), dayKind: day.kind, workedMinutes: day.workedMinutes, days: dto.days, reason: dto.reason.trim() } });
      const expiry = await this.expiryDays(tx, c, f, today);
      const useBy = compOffUseBy(dto.on, expiry);
      const sub = await this.engine.submit(tx, c, {
        type: COMP_OFF_CLAIM,
        subjectType: 'comp_off_claim',
        subjectId: claim.id,
        title: `${f.name}: comp-off for ${fmt(dto.on)} (${dto.days === 1 ? 'full day' : 'half day'})`,
        summary: [
          { label: 'Day worked', value: `${fmt(dto.on)} · ${day.holiday ?? 'weekly off'}` },
          { label: 'Worked', value: `${Math.floor(day.workedMinutes / 60)} h ${day.workedMinutes % 60} min` },
          { label: 'Comp-off', value: dto.days === 1 ? '1 day' : 'Half day' },
          { label: 'Use by', value: useBy ? fmt(useBy) : 'No expiry' },
          { label: 'Reason', value: dto.reason.trim().slice(0, 300) },
        ],
        subjectPersonId: f.personId,
        requesterUserId: c.userId ?? null,
        raisedByUserId: c.userId ?? null,
        steps: [{ name: 'Manager', approvers: [{ kind: 'manager' }], mode: 'any', remindAfterHours: 24, timeoutHours: 72, onTimeout: 'escalate' }],
        payload: { days: dto.days },
        payloadFields: [{ key: 'days', label: 'Days', type: 'number' }],
        fallbackUserIds: await hrApprovers(tx, org, f.employeeId, today, f.userId),
      });
      notices.push(...sub.notices);
      await tx.compOffClaim.update({ where: { id: claim.id }, data: { wfRequestId: sub.id } });
      await audit(tx, c, 'leave.comp_off.claimed', 'comp_off_claim', claim.id, { employeeId: f.employeeId, on: dto.on, days: dto.days, wfRequestId: sub.id });
      const now = await tx.compOffClaim.findFirstOrThrow({ where: { id: claim.id } });
      return this.claimView(now, expiry);
    });
    await this.engine.send(ctx, notices);
    return res;
  }

  async withdrawClaim(ctx: TenantContext, user: ScopeUser, id: string) {
    this.noProxy(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { f } = await this.leave.meFacts(tx, c, c.userId);
      const x = await tx.compOffClaim.findFirst({ where: { organizationId: c.organizationId, id, employeeId: f.employeeId } });
      if (!x) throw new NotFoundException('No such comp-off claim.');
      if (x.status !== 'pending') throw new ConflictException('Only a claim still waiting for approval can be withdrawn.');
      if (x.wfRequestId) await this.engine.withdraw(tx, c, x.wfRequestId, c.userId ?? null, 'Withdrawn by the employee');
      await tx.compOffClaim.update({ where: { id: x.id }, data: { status: 'withdrawn', decidedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
      await audit(tx, c, 'leave.comp_off.withdrawn', 'comp_off_claim', x.id, { employeeId: f.employeeId });
      return { id: x.id, status: 'withdrawn' };
    });
  }

  private async claimDecided(tx: Tx, wf: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const x = await tx.compOffClaim.findFirst({ where: { organizationId: wf.organizationId, id: wf.subjectId } });
    if (!x || x.status !== 'pending') return;
    await tx.compOffClaim.update({ where: { id: x.id }, data: { status: outcome, decidedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
    if (outcome === 'approved') await this.creditCompOff(tx, { organizationId: x.organizationId, employeeId: x.employeeId, workedOn: dateOf(x.workedOn), days: num(x.days), key: `co:${x.id}`, reason: `Comp-off for work on ${fmt(dateOf(x.workedOn))}` });
  }

  /**
   * The one comp-off ledger (TIM-22 with TIM-09). Credits comp-off for work on `workedOn`, once per key (a repeat is a
   * no-op). Overtime settled as comp-off calls this with key "ot:<overtime id>". Returns false when the company has no
   * comp-off type in use. Expiry is counted from the day worked (leave.comp_off.expiry_days).
   */
  async creditCompOff(tx: Tx, i: { organizationId: string; employeeId: string; workedOn: string; days: number; key: string; reason: string }): Promise<boolean> {
    if (i.days <= 0) return false;
    const t = await this.compOffType(tx, i.organizationId);
    if (!t) return false;
    await tx.leaveLedgerEntry.createMany({ data: [{ organizationId: i.organizationId, employeeId: i.employeeId, leaveTypeId: t.id, entryOn: asDate(i.workedOn), kind: 'comp_off', days: i.days, periodKey: i.key, reason: i.reason.slice(0, 500) }], skipDuplicates: true });
    return true;
  }

  /** Job (with accruals): lapses comp-off not used by its use-by date, oldest credit first; safe to re-run. */
  async expireCompOff(org: string, now = new Date()): Promise<number> {
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false };
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const t = await this.compOffType(tx, org);
      if (!t) return 0;
      const people = await tx.leaveLedgerEntry.groupBy({ by: ['employeeId'], where: { organizationId: org, leaveTypeId: t.id, kind: 'comp_off' } });
      let n = 0;
      for (const p of people) {
        const rows = await tx.leaveLedgerEntry.findMany({ where: { organizationId: org, employeeId: p.employeeId, leaveTypeId: t.id } });
        const today = todayIn('Asia/Kolkata', now);
        const f = await factsOn(tx, org, p.employeeId, today);
        if (!f) continue;
        const expiry = await this.expiryDays(tx, c, f, today);
        const lapsed = new Map(rows.filter((r) => r.periodKey?.startsWith('ce:')).map((r) => [r.periodKey!.slice(3), -num(r.days)]));
        const credits: CompOffCredit[] = rows.filter((r) => r.kind === 'comp_off').map((r) => ({ key: r.id, on: dateOf(r.entryOn), days: num(r.days), lapsed: lapsed.get(r.id) ?? 0 }));
        const used = -rows.filter((r) => r.kind !== 'comp_off' && !r.periodKey?.startsWith('ce:')).reduce((s, r) => s + num(r.days), 0);
        const due = compOffExpiries(credits, used, expiry, today);
        if (!due.length) continue;
        n += (await tx.leaveLedgerEntry.createMany({ data: due.map((d) => ({ organizationId: org, employeeId: p.employeeId, leaveTypeId: t.id, entryOn: asDate(today), kind: 'lapse', days: -d.days, periodKey: `ce:${d.key}`, reason: `Comp-off for work on ${fmt(d.on)} not used by ${fmt(compOffUseBy(d.on, expiry)!)}` })), skipDuplicates: true })).count;
      }
      if (n) await audit(tx, c, 'leave.comp_off.expired', 'leave_ledger', org, { entries: n });
      return n;
    });
  }

  // ------------------------------------------------------------------------------------------ TIM-24 encashment

  private async encashFacts(tx: Tx, c: CompanyContext, f: Facts, today: string) {
    const org = c.organizationId;
    const window = await settingOn(tx, c, 'leave.encashment.window', f, today);
    const maxPerYear = Number(await settingOn(tx, c, 'leave.encashment.max_days', f, today));
    const minLeft = Number(await settingOn(tx, c, 'leave.encashment.min_left', f, today));
    const divisor = Number(await settingOn(tx, c, 'leave.encashment.divisor', f, today));
    const basis = await settingOn(tx, c, 'payroll.leave_encashment_basis', f, today);
    const year = leaveYearOf(today, Number(await settingOn(tx, c, 'leave.year_start_month', f, today)));
    const employmentId = await this.employmentOf(tx, org, f.employeeId, today);
    const pay = employmentId ? await payOn(tx, org, employmentId, today) : null;
    const monthly = pay ? Number(basis === 'gross' ? pay.gross : pay.gratuityWage) : 0;
    const encashable = (await tx.leaveType.findMany({ where: { organizationId: org, active: true } })).filter((t) => hasBalance(t.kind) && (t.rules as unknown as LeaveRules).encashable);
    const balances = await this.leave.balancesIn(tx, c, f, today);
    const done = await tx.leaveEncashment.groupBy({ by: ['leaveTypeId'], where: { organizationId: org, employeeId: f.employeeId, status: 'approved', createdAt: { gte: asDate(year.start) } }, _sum: { days: true } });
    const types = encashable.map((t) => {
      const b = balances.find((x) => x.leaveTypeId === t.id);
      const encashedThisYear = num(done.find((d) => d.leaveTypeId === t.id)?._sum.days);
      const available = b?.available ?? 0;
      return { leaveTypeId: t.id, name: t.name, balance: b?.balance ?? 0, pending: b?.pending ?? 0, available, encashedThisYear, max: encashMax({ available, maxPerYear, minLeft, encashedThisYear }) };
    }).filter((t) => balances.some((b) => b.leaveTypeId === t.leaveTypeId));
    const month = Number(today.slice(5, 7));
    return { window, open: encashWindowOpen(window, month), maxPerYear, minLeft, divisor, basis, monthly: monthly || null, dailyRate: monthly ? encashAmount(monthly, divisor, 1).dailyRate : null, types, employmentId, legalEntityId: f.legalEntityId, year };
  }

  private encashView(x: EncashRow) {
    return { id: x.id, leaveTypeId: x.leaveTypeId, days: num(x.days), dailyRate: x.dailyRate === null ? null : num(x.dailyRate), amount: x.amount === null ? null : num(x.amount), status: x.status, createdAt: x.createdAt, decidedAt: x.decidedAt };
  }

  /** GET me/encashment: whether the window is open, how much can be cashed in, the amount basis and the tax note. */
  myEncashment(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { f, today } = await this.leave.meFacts(tx, c, c.userId);
      const e = await this.encashFacts(tx, c, f, today);
      const rows = await tx.leaveEncashment.findMany({ where: { organizationId: c.organizationId, employeeId: f.employeeId }, orderBy: { createdAt: 'desc' }, take: 20 });
      const { employmentId: _e, legalEntityId: _l, ...shown } = e;
      return { today, ...shown, taxNote: ENCASH_TAX_NOTE, waiting: rows.find((r) => r.status === 'pending') ? this.encashView(rows.find((r) => r.status === 'pending')!) : null, history: rows.map((r) => this.encashView(r)) };
    });
  }

  /** POST me/encashment: cash in earned leave while the window is open; manager then HR approve (P03). */
  async encash(ctx: TenantContext, user: ScopeUser, dto: EncashDto) {
    this.noProxy(user);
    if (Math.round(dto.days * 2) !== dto.days * 2) throw new BadRequestException('Cash in whole or half days.');
    const notices: Notice[] = [];
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { f, today } = await this.leave.meFacts(tx, c, c.userId);
      const org = c.organizationId;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`leave:${org}:${f.employeeId}`}))`;
      const e = await this.encashFacts(tx, c, f, today);
      if (!e.open) throw new ConflictException(e.window === 'off' ? 'Your company does not cash in leave while you work. Leave left at exit is paid in your final settlement.' : `Leave can be cashed in only in ${new Date(Date.UTC(2026, Number(e.window) - 1, 1)).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })}.`);
      const t = e.types.find((x) => x.leaveTypeId === dto.leaveTypeId);
      if (!t) throw new BadRequestException('That leave type cannot be cashed in.');
      if (await tx.leaveEncashment.findFirst({ where: { organizationId: org, employeeId: f.employeeId, status: 'pending' }, select: { id: true } })) throw new ConflictException('You already have an encashment request waiting. Withdraw it or wait until it is decided.');
      if (dto.days > t.max) throw new BadRequestException(t.max === 0 ? `Nothing can be cashed in now: ${days(e.minLeft)} must stay and the yearly limit is ${days(e.maxPerYear)}.` : `You can cash in up to ${days(t.max)} (${days(e.minLeft)} must stay; ${days(e.maxPerYear)} a year).`);
      const x = await tx.leaveEncashment.create({ data: { organizationId: org, employeeId: f.employeeId, leaveTypeId: t.leaveTypeId, days: dto.days } });
      const amount = e.monthly ? encashAmount(e.monthly, e.divisor, dto.days) : null;
      const hrUsers = await hrApprovers(tx, org, f.employeeId, today, f.userId);
      const sub = await this.engine.submit(tx, c, {
        type: LEAVE_ENCASH,
        subjectType: 'leave_encashment',
        subjectId: x.id,
        title: `${f.name}: cash in ${days(dto.days)} of ${t.name}`,
        summary: [
          { label: 'Leave', value: t.name },
          { label: 'Days', value: String(dto.days) },
          { label: 'Available after', value: String(r2(t.available - dto.days)) },
          { label: 'Amount (before tax)', value: amount ? `₹${amount.amount.toFixed(2)} at ₹${amount.dailyRate.toFixed(2)} a day` : 'Worked out by payroll' },
        ],
        subjectPersonId: f.personId,
        requesterUserId: c.userId ?? null,
        raisedByUserId: c.userId ?? null,
        steps: [
          { name: 'Manager', approvers: [{ kind: 'manager' }], mode: 'any', remindAfterHours: 24, timeoutHours: 72, onTimeout: 'escalate' },
          { name: 'HR', approvers: [{ kind: 'users', userIds: hrUsers }], mode: 'any', remindAfterHours: 24 },
        ],
        payload: { days: dto.days },
        payloadFields: [{ key: 'days', label: 'Days', type: 'number' }],
        fallbackUserIds: hrUsers,
      });
      notices.push(...sub.notices);
      await tx.leaveEncashment.update({ where: { id: x.id }, data: { wfRequestId: sub.id } });
      await audit(tx, c, 'leave.encashment.requested', 'leave_encashment', x.id, { employeeId: f.employeeId, type: t.name, days: dto.days, wfRequestId: sub.id });
      return { ...this.encashView(await tx.leaveEncashment.findFirstOrThrow({ where: { id: x.id } })), estimate: amount };
    });
    await this.engine.send(ctx, notices);
    return res;
  }

  async withdrawEncash(ctx: TenantContext, user: ScopeUser, id: string) {
    this.noProxy(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { f } = await this.leave.meFacts(tx, c, c.userId);
      const x = await tx.leaveEncashment.findFirst({ where: { organizationId: c.organizationId, id, employeeId: f.employeeId } });
      if (!x) throw new NotFoundException('No such encashment request.');
      if (x.status !== 'pending') throw new ConflictException('Only a request still waiting for approval can be withdrawn.');
      if (x.wfRequestId) await this.engine.withdraw(tx, c, x.wfRequestId, c.userId ?? null, 'Withdrawn by the employee');
      await tx.leaveEncashment.update({ where: { id: x.id }, data: { status: 'withdrawn', decidedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
      await audit(tx, c, 'leave.encashment.withdrawn', 'leave_encashment', x.id, { employeeId: f.employeeId });
      return { id: x.id, status: 'withdrawn' };
    });
  }

  /** Approved: the days leave the ledger and the amount goes to payroll as a one-time pay (the payroll input). */
  private async encashDecided(tx: Tx, wf: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const org = wf.organizationId;
    const x = await tx.leaveEncashment.findFirst({ where: { organizationId: org, id: wf.subjectId } });
    if (!x || x.status !== 'pending') return;
    if (outcome === 'rejected') {
      await tx.leaveEncashment.update({ where: { id: x.id }, data: { status: 'rejected', decidedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
      return;
    }
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false };
    const today = todayIn('Asia/Kolkata');
    const f = await factsOn(tx, org, x.employeeId, today);
    const t = await tx.leaveType.findFirstOrThrow({ where: { organizationId: org, id: x.leaveTypeId } });
    await tx.leaveLedgerEntry.createMany({ data: [{ organizationId: org, employeeId: x.employeeId, leaveTypeId: x.leaveTypeId, entryOn: asDate(today), kind: 'encashed', days: -num(x.days), periodKey: `enc:${x.id}`, reason: `Cashed in ${days(num(x.days))} of ${t.name}` }], skipDuplicates: true });
    let payId: string | null = null;
    let amount: { dailyRate: number; amount: number } | null = null;
    const employmentId = f ? await this.employmentOf(tx, org, x.employeeId, today) : null;
    if (f && employmentId) {
      const basis = await settingOn(tx, c, 'payroll.leave_encashment_basis', f, today);
      const pay = await payOn(tx, org, employmentId, today);
      const monthly = Number(basis === 'gross' ? pay.gross : pay.gratuityWage);
      if (monthly > 0) {
        amount = encashAmount(monthly, Number(await settingOn(tx, c, 'leave.encashment.divisor', f, today)), num(x.days));
        const p = await tx.oneTimePay.create({ data: { organizationId: org, legalEntityId: f.legalEntityId, employeeId: x.employeeId, employmentId, componentCode: 'leave_encashment', amount: amount.amount, periodStart: asDate(`${today.slice(0, 7)}-01`), source: 'leave', sourceRef: x.id, reason: `Leave encashment: ${days(num(x.days))} of ${t.name}`, status: 'approved', wfRequestId: wf.id, createdBy: wf.requesterUserId ?? f.userId ?? '00000000-0000-0000-0000-000000000000' } });
        payId = p.id;
      }
    }
    await tx.leaveEncashment.update({ where: { id: x.id }, data: { status: 'approved', decidedAt: new Date(), dailyRate: amount?.dailyRate ?? null, amount: amount?.amount ?? null, oneTimePayId: payId, version: { increment: 1 }, updatedAt: new Date() } });
    await audit(tx, { ...c, userId: null }, 'leave.encashment.approved', 'leave_encashment', x.id, { employeeId: x.employeeId, days: num(x.days), amount: amount?.amount ?? null, oneTimePayId: payId });
  }

  // ------------------------------------------------------------------------------------------ TIM-25 long absences

  private absenceView(a: Prisma.LongAbsenceGetPayload<object>, nameOf?: string) {
    return { id: a.id, employeeId: a.employeeId, name: nameOf ?? null, kind: a.kind, from: dateOf(a.fromOn), to: dateOf(a.toOn), plannedTo: dateOf(a.plannedToOn), accrues: a.accrues, linkedRequest: a.requestId, returnAskedOn: a.returnAskedOn ? dateOf(a.returnAskedOn) : null, returnAskedNote: a.returnAskedNote, note: a.note, version: a.version };
  }


  /** GET me/long-absence: my current or next long absence, if any. */
  myAbsence(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { f, today } = await this.leave.meFacts(tx, c, c.userId);
      const a = await tx.longAbsence.findFirst({ where: { organizationId: c.organizationId, employeeId: f.employeeId, toOn: { gte: asDate(today) } }, orderBy: { fromOn: 'asc' } });
      return { today, absence: a ? this.absenceView(a, f.name) : null };
    });
  }

  /** POST me/long-absence/:id/return-date: tell HR the return date changed (HR confirms by extending or early return). */
  async askReturnDate(ctx: TenantContext, user: ScopeUser, id: string, dto: DateNoteDto) {
    this.noProxy(user);
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { f, today } = await this.leave.meFacts(tx, c, c.userId);
      const a = await tx.longAbsence.findFirst({ where: { organizationId: c.organizationId, id, employeeId: f.employeeId } });
      if (!a) throw new NotFoundException('No such absence.');
      if (dto.on <= today || dto.on <= dateOf(a.fromOn)) throw new BadRequestException('Choose a return date after today.');
      await tx.longAbsence.update({ where: { id }, data: { returnAskedOn: asDate(dto.on), returnAskedNote: dto.note.trim(), version: { increment: 1 }, updatedAt: new Date() } });
      await audit(tx, c, 'leave.long_absence.return_asked', 'long_absence', id, { employeeId: f.employeeId, on: dto.on });
      return { hr: await hrApprovers(tx, c.organizationId, f.employeeId, today, f.userId), name: f.name };
    });
    const text = `${out.name} says their return date changed to ${fmt(dto.on)}.`;
    await this.notifications.notifySystem(ctx, out.hr, 'leave.long_absence', { entityType: 'long_absence', entityId: id, contextText: text, linkPath: '/yx/time/long-absences' }, { subject: 'A return date changed', html: `<p>${escapeHtml(text)}</p><p>Open YukthiX to confirm it.</p>` });
    return { id, returnAskedOn: dto.on };
  }

  /** GET hr/long-absences: absences of the people in leave.view scope (now and coming). */
  hrAbsences(ctx: TenantContext, user: ScopeUser) {
    return this.inScope(ctx, user, async (tx, c, scope) => {
      const today = todayIn('Asia/Kolkata');
      const rows = await tx.$queryRaw<{ id: string; name: string }[]>`
        SELECT a.id::text, ${name('e')} AS name FROM long_absences a JOIN employees e ON e.organization_id = a.organization_id AND e.id = a.employee_id
        WHERE a.organization_id = ${c.organizationId}::uuid AND a.to_on >= ${today}::date AND ${scope('a.employee_id')} ORDER BY a.from_on LIMIT 500`;
      const full = await tx.longAbsence.findMany({ where: { organizationId: c.organizationId, id: { in: rows.map((r) => r.id) } }, orderBy: { fromOn: 'asc' } });
      const names = new Map(rows.map((r) => [r.id, r.name]));
      return full.map((a) => this.absenceView(a, names.get(a.id)));
    });
  }

  private async hrMayChange(tx: Tx, c: CompanyContext, v: Viewer, employeeId: string) {
    const own = await this.own(tx, c, v);
    if (!(await grantCovers(tx, c, v, own, 'leave.balance.adjust', employeeId, todayIn('Asia/Kolkata')))) throw new NotFoundException('Not found');
    if (employeeId === own) throw new ForbiddenException('You cannot change your own absence. Ask another HR admin.');
  }

  /**
   * Founder decision 1: what recording a long absence would do (accrual, the first day back) and what stops it: not
   * employed on the first day (joiners), past the exit date or the last working day of someone on notice, a locked
   * month, another long absence, or leave already asked for or approved on those dates (never cancelled silently).
   */
  private async absenceCheck(tx: Tx, c: CompanyContext, dto: { employeeId: string; from: string; to: string }) {
    const org = c.organizationId;
    if (dto.to < dto.from || daysBetween(dto.from, dto.to) > 731) throw new BadRequestException('The last day is on or after the first day, within two years.');
    const f = await factsOn(tx, org, dto.employeeId, dto.from);
    if (!f) return { name: null, accrues: false, comesBackOn: addDays(dto.to, 1), leave: [], problems: [{ conflict: false, text: `That person has no job on ${fmt(dto.from)}. Start the absence on or after their joining day.` }] };
    const problems: { conflict: boolean; text: string }[] = [];
    if (f.exitedOn && dto.to > f.exitedOn) problems.push({ conflict: false, text: `${f.name} leaves on ${fmt(f.exitedOn)}. End the absence on or before that day.` });
    const [exit] = await tx.$queryRaw<{ lwd: string }[]>`
      SELECT coalesce(approved_lwd, standard_lwd)::text AS lwd FROM exit_cases
      WHERE organization_id = ${org}::uuid AND employee_id = ${dto.employeeId}::uuid AND status IN ('submitted', 'accepted') ORDER BY submitted_on DESC LIMIT 1`;
    if (exit && dto.to > exit.lwd) problems.push({ conflict: false, text: `${f.name} is on notice. The last working day is ${fmt(exit.lwd)}, so end the absence on or before it.` });
    const locked = [...(await lockedDates(tx, org, dto.employeeId, dto.from, dto.to))].sort();
    if (locked.length) problems.push({ conflict: false, text: `${new Date(`${locked[0]}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })} is locked for attendance and leave. Start the absence after it, or reopen the month first.` });
    const other = await tx.longAbsence.findFirst({ where: { organizationId: org, employeeId: dto.employeeId, fromOn: { lte: asDate(dto.to) }, toOn: { gte: asDate(dto.from) } } });
    if (other) problems.push({ conflict: true, text: `These dates overlap ${f.name}'s ${ABSENCE_NAME[other.kind] ?? 'long absence'} (${fmt(dateOf(other.fromOn))} – ${fmt(dateOf(other.toOn))}). Change the dates, or extend that absence instead.` });
    const leave = await tx.$queryRaw<{ id: string; type: string; from: string; to: string; status: string }[]>`
      SELECT r.id::text, t.name AS type, r.from_on::text AS "from", r.to_on::text AS "to", r.status FROM leave_requests r
      JOIN leave_types t ON t.organization_id = r.organization_id AND t.id = r.leave_type_id
      WHERE r.organization_id = ${org}::uuid AND r.employee_id = ${dto.employeeId}::uuid AND r.status = ANY(${WAITING}::text[])
        AND EXISTS (SELECT 1 FROM leave_request_days d WHERE d.organization_id = r.organization_id AND d.request_id = r.id AND d.active AND d.portion > 0 AND d.leave_on BETWEEN ${dto.from}::date AND ${dto.to}::date)
      ORDER BY r.from_on LIMIT 20`;
    if (leave.length) problems.push({ conflict: true, text: `${f.name} already has leave on these dates: ${leave.map((l) => `${l.type} ${fmt(l.from)} – ${fmt(l.to)} (${l.status === 'pending' ? 'waiting' : 'approved'})`).join('; ')}. Withdraw or cancel it first, then record the absence.` });
    const accrues = (await settingOn(tx, c, 'leave.long_absence.accrues', f, dto.from)) === 'yes';
    return { name: f.name, accrues, comesBackOn: addDays(dto.to, 1), leave, problems };
  }

  /** GET hr/long-absences/check: the effect and the problems, shown in the Record long absence dialog before Record. */
  async checkAbsence(ctx: TenantContext, user: ScopeUser, dto: { employeeId: string; from: string; to: string }) {
    const v = await this.leave.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.hrMayChange(tx, c, v, dto.employeeId);
      const out = await this.absenceCheck(tx, c, dto);
      return { ...out, problems: out.problems.map((p) => p.text) };
    });
  }

  /** POST hr/long-absences: HR records a sabbatical or long unpaid leave; earning leave follows leave.long_absence.accrues. */
  async recordAbsence(ctx: TenantContext, user: ScopeUser, dto: LongAbsenceDto) {
    const v = await this.leave.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.hrMayChange(tx, c, v, dto.employeeId);
      // One write per person at a time, so two HR admins cannot record overlapping absences together.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`leave:${c.organizationId}:${dto.employeeId}`}))`;
      const chk = await this.absenceCheck(tx, c, dto);
      const first = chk.problems.find((p) => p.conflict) ?? chk.problems[0];
      if (first) throw first.conflict ? new ConflictException({ statusCode: 409, message: first.text, problems: chk.problems.map((p) => p.text) }) : new BadRequestException({ statusCode: 400, message: first.text, problems: chk.problems.map((p) => p.text) });
      const a = await tx.longAbsence.create({ data: { organizationId: c.organizationId, employeeId: dto.employeeId, kind: dto.kind, fromOn: asDate(dto.from), toOn: asDate(dto.to), plannedToOn: asDate(dto.to), accrues: chk.accrues, note: dto.note.trim(), createdBy: c.userId ?? null } });
      await audit(tx, c, 'leave.long_absence.recorded', 'long_absence', a.id, { employeeId: dto.employeeId, kind: dto.kind, from: dto.from, to: dto.to, accrues: chk.accrues, note: dto.note.trim() });
      return this.absenceView(a, chk.name ?? undefined);
    });
  }

  /** HR extends (a new last day) or records an early return (the first day back); optimistic on `version`. */
  async changeAbsence(ctx: TenantContext, user: ScopeUser, id: string, how: 'extend' | 'early', dto: DateNoteDto) {
    const v = await this.leave.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const a = await tx.longAbsence.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!a) throw new NotFoundException('Not found');
      await this.hrMayChange(tx, c, v, a.employeeId);
      if (dto.version !== undefined && dto.version !== a.version) throw new ConflictException('Someone changed this absence a moment ago. Reload to see the latest dates.');
      const from = dateOf(a.fromOn);
      const to = dateOf(a.toOn);
      let newTo: string;
      if (how === 'extend') {
        if (dto.on <= to) throw new BadRequestException(`Choose a new last day after ${fmt(to)}.`);
        if (daysBetween(from, dto.on) > 731) throw new BadRequestException('A long absence is at most two years.');
        newTo = dto.on;
      } else {
        if (dto.on <= from || dto.on > to) throw new BadRequestException(`Choose a return day between ${fmt(addDays(from, 1))} and ${fmt(to)}.`);
        newTo = addDays(dto.on, -1);
        // The linked leave (maternity) ends the day before the return; its later days no longer count as leave.
        if (a.requestId) {
          const r = await tx.leaveRequest.findFirst({ where: { organizationId: c.organizationId, id: a.requestId } });
          if (r && dateOf(r.toOn) > newTo) {
            await tx.leaveRequestDay.updateMany({ where: { organizationId: c.organizationId, requestId: r.id, leaveOn: { gt: asDate(newTo) } }, data: { active: false } });
            const kept = await tx.leaveRequestDay.aggregate({ where: { organizationId: c.organizationId, requestId: r.id, active: true }, _sum: { portion: true } });
            await tx.leaveRequest.update({ where: { id: r.id }, data: { toOn: asDate(newTo), days: num(kept._sum.portion), version: { increment: 1 }, updatedAt: new Date() } });
            await this.dayEngine.evaluate(tx, c, a.employeeId, dto.on, to);
          }
        }
      }
      const upd = await tx.longAbsence.updateMany({ where: { id, version: a.version }, data: { toOn: asDate(newTo), returnAskedOn: null, returnAskedNote: null, version: { increment: 1 }, updatedAt: new Date() } });
      if (!upd.count) throw new ConflictException('Someone changed this absence a moment ago. Reload to see the latest dates.');
      await audit(tx, c, how === 'extend' ? 'leave.long_absence.extended' : 'leave.long_absence.returned_early', 'long_absence', id, { employeeId: a.employeeId, before: to, after: newTo, note: dto.note.trim() });
      return this.absenceView(await tx.longAbsence.findFirstOrThrow({ where: { id } }));
    });
  }

  // ------------------------------------------------------------------------------------------ company block dates

  /**
   * Leave already asked for or approved on a block's dates, of the types it stops, by people where it applies. A new
   * block never cancels it (founder decision 1): HR sees who is affected and talks to them.
   */
  private async blockAffected(tx: Tx, org: string, b: { fromOn: Date; toOn: Date; scopeType: string; scopeId: string | null; leaveTypeIds: string[] }) {
    return tx.$queryRaw<{ id: string; name: string; type: string; from: string; to: string; status: string }[]>`
      SELECT DISTINCT r.id::text, ${name('e')} AS name, t.name AS type, r.from_on::text AS "from", r.to_on::text AS "to", r.status
      FROM leave_request_days d
      JOIN leave_requests r ON r.organization_id = d.organization_id AND r.id = d.request_id AND r.status = ANY(${WAITING}::text[])
      JOIN leave_types t ON t.organization_id = r.organization_id AND t.id = r.leave_type_id
      JOIN employees e ON e.organization_id = d.organization_id AND e.id = d.employee_id
      JOIN employee_assignments a ON a.organization_id = d.organization_id AND a.employee_id = d.employee_id AND a.superseded_at IS NULL AND d.leave_on <@ daterange(a.valid_from, a.valid_to, '[]')
      WHERE d.organization_id = ${org}::uuid AND d.active AND d.portion > 0 AND d.leave_on BETWEEN ${dateOf(b.fromOn)}::date AND ${dateOf(b.toOn)}::date
        AND (${b.scopeType} = 'tenant' OR (${b.scopeType} = 'legal_entity' AND a.legal_entity_id = ${b.scopeId}::uuid) OR (${b.scopeType} = 'location' AND a.location_id = ${b.scopeId}::uuid))
        AND (CASE WHEN cardinality(${b.leaveTypeIds}::uuid[]) = 0 THEN t.kind <> ALL(${BLOCK_DATE_EXEMPT}::text[]) ELSE t.id = ANY(${b.leaveTypeIds}::uuid[]) END)
      ORDER BY 4, 2 LIMIT 50`;
  }

  /** GET setup/block-dates: the dates, who already has leave on them, and the choices for adding one. */
  listBlockDates(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const rows = await tx.leaveBlockDate.findMany({ where: { organizationId: org, removedAt: null, toOn: { gte: asDate(addDays(todayIn('Asia/Kolkata'), -31)) } }, orderBy: { fromOn: 'asc' }, take: 200 });
      const [types, entities, locations] = await Promise.all([
        tx.leaveType.findMany({ where: { organizationId: org, active: true }, orderBy: [{ kind: 'asc' }, { code: 'asc' }], select: { id: true, name: true, kind: true } }),
        tx.legalEntity.findMany({ where: { organizationId: org, archivedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
        tx.location.findMany({ where: { organizationId: org, archivedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      ]);
      const scopeName = new Map([...entities, ...locations].map((x) => [x.id, String(x.name)]));
      const dates = [];
      for (const r of rows)
        dates.push({ id: r.id, from: dateOf(r.fromOn), to: dateOf(r.toOn), reason: r.reason, scopeType: r.scopeType, scopeId: r.scopeId, scopeName: r.scopeId ? (scopeName.get(r.scopeId) ?? null) : null, leaveTypeIds: r.leaveTypeIds, affected: await this.blockAffected(tx, org, r) });
      return {
        mode: await this.tenantSetting(tx, c, 'leave.block_dates.mode'),
        dates,
        // Planned leave is stopped when HR picks no types; maternity leave can never be stopped (Maternity Benefit Act).
        types: types.map((t) => ({ ...t, stoppedByDefault: !BLOCK_DATE_EXEMPT.includes(t.kind), canStop: t.kind !== 'maternity' })),
        entities: entities.map((x) => ({ id: x.id, name: String(x.name) })),
        locations: locations.map((x) => ({ id: x.id, name: String(x.name) })),
      };
    });
  }

  addBlockDate(ctx: TenantContext, dto: BlockDateDto) {
    if (dto.to < dto.from || daysBetween(dto.from, dto.to) > 31) throw new BadRequestException('A block is 1 to 32 days, the last day on or after the first.');
    if ((dto.scopeType === 'tenant') !== !dto.scopeId) throw new BadRequestException(dto.scopeType === 'tenant' ? 'A company-wide block has no entity or location.' : 'Choose the entity or location.');
    const typeIds = [...new Set(dto.leaveTypeIds ?? [])];
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      if (dto.from < todayIn('Asia/Kolkata')) throw new BadRequestException('Block dates start today or later.');
      if (dto.scopeType === 'legal_entity' && !(await tx.legalEntity.findFirst({ where: { organizationId: org, id: dto.scopeId }, select: { id: true } }))) throw new BadRequestException('Choose a legal entity of this company.');
      if (dto.scopeType === 'location' && !(await tx.location.findFirst({ where: { organizationId: org, id: dto.scopeId }, select: { id: true } }))) throw new BadRequestException('Choose a location of this company.');
      const types = typeIds.length ? await tx.leaveType.findMany({ where: { organizationId: org, active: true, id: { in: typeIds } }, select: { id: true, name: true, kind: true } }) : [];
      if (types.length !== typeIds.length) throw new BadRequestException('Choose leave types of this company that are in use.');
      const maternity = types.find((t) => t.kind === 'maternity');
      if (maternity) throw new BadRequestException(`${maternity.name} can't be blocked: the Maternity Benefit Act sets when it is taken. Untick it.`);
      // The same dates, reason and place twice (a double click) is one block.
      const same = await tx.leaveBlockDate.findFirst({ where: { organizationId: org, removedAt: null, fromOn: asDate(dto.from), toOn: asDate(dto.to), scopeType: dto.scopeType, scopeId: dto.scopeId ?? null, reason: dto.reason.trim() }, select: { id: true } });
      if (same) throw new ConflictException('These block dates are already there.');
      const r = await tx.leaveBlockDate.create({ data: { organizationId: org, fromOn: asDate(dto.from), toOn: asDate(dto.to), reason: dto.reason.trim(), scopeType: dto.scopeType, scopeId: dto.scopeId ?? null, leaveTypeIds: typeIds, createdBy: c.userId ?? null } });
      const affected = await this.blockAffected(tx, org, r);
      await audit(tx, c, 'leave.block_date.added', 'leave_block_date', r.id, { from: dto.from, to: dto.to, reason: dto.reason.trim(), scopeType: dto.scopeType, scopeId: dto.scopeId ?? null, leaveTypes: types.map((t) => t.name), affected: affected.length });
      return { id: r.id, affected };
    });
  }

  removeBlockDate(ctx: TenantContext, id: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await tx.leaveBlockDate.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!r) throw new NotFoundException('Not found');
      if (r.removedAt) throw new ConflictException('That block date was already removed.');
      await tx.leaveBlockDate.update({ where: { id }, data: { removedAt: new Date() } });
      await audit(tx, c, 'leave.block_date.removed', 'leave_block_date', id, { from: dateOf(r.fromOn), to: dateOf(r.toOn), reason: r.reason });
      return { id };
    });
  }

  // ------------------------------------------------------------------------------------------ scope helper (HR)

  /**
   * Runs `fn` with an SQL test "this employee is in my scope" for the keys held of `keys` (explicit grants, never the
   * team view; leave.view by default). The liability report also takes leave.liability.view (founder answer A: payroll).
   */
  private async inScope<T>(ctx: TenantContext, user: ScopeUser, fn: (tx: Tx, c: CompanyContext, scope: (alias: Alias) => Prisma.Sql, v: Viewer, own: string | null) => Promise<T>, team = false, keys: readonly TimeKey[] = ['leave.view']) {
    const v = await this.leave.viewer(user);
    const held = keys.filter((k) => has(v, k));
    if (!team && !held.length) throw new ForbiddenException(has(v, 'leave.liability.view') ? 'You can open the leave liability report only.' : 'You need leave.view (HR) for this.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const own = await this.own(tx, c, v);
      const today = todayIn('Asia/Kolkata');
      // Built once per column alias (it reads the viewer's grants); `team` adds the implicit manager view.
      const scopes = new Map<Alias, Prisma.Sql>();
      for (const alias of ALIASES) {
        const parts = await Promise.all((held.length ? held : ['leave.view' as const]).map((k) => visibleSql(tx, c, v, own, k, Prisma.raw(alias), today, team)));
        scopes.set(alias, Prisma.sql`(${Prisma.join(parts, ' OR ')})`);
      }
      return fn(tx, c, (alias) => scopes.get(alias)!, v, own);
    });
  }

  /** The report's filters must be this company's own (another company's entity, location or department: 404). */
  private async ownFilters(tx: Tx, c: CompanyContext, q: ReportQueryDto) {
    const o = { organizationId: c.organizationId };
    const missing =
      (q.entityId && !(await tx.legalEntity.findFirst({ where: { ...o, id: q.entityId }, select: { id: true } }))) ||
      (q.locationId && !(await tx.location.findFirst({ where: { ...o, id: q.locationId }, select: { id: true } }))) ||
      (q.departmentId && !(await tx.department.findFirst({ where: { ...o, id: q.departmentId }, select: { id: true } })));
    if (missing) throw new NotFoundException('Not found');
  }

  // ------------------------------------------------------------------------------------------ TIM-17 HR leave home

  /** GET hr/leave-home: what HR watches: requests waiting with approvers, who is away this week, what needs HR. */
  hrHome(ctx: TenantContext, user: ScopeUser) {
    return this.inScope(ctx, user, async (tx, c, scope, v, own) => {
      const org = c.organizationId;
      const today = todayIn('Asia/Kolkata');
      const pending = await tx.$queryRaw<{ id: string; employeeId: string; name: string; type: string; from: string; to: string; days: number; sent: Date; approvers: string | null }[]>`
        SELECT r.id::text, r.employee_id::text AS "employeeId", ${name('e')} AS name, t.name AS type, r.from_on::text AS "from", r.to_on::text AS "to", r.days::float AS days, r.created_at AS sent,
               (SELECT string_agg(DISTINCT u.name, ', ') FROM wf_tasks k JOIN users u ON u.organization_id = k.organization_id AND u.id = k.assignee_user_id
                 WHERE k.organization_id = r.organization_id AND k.request_id = r.wf_request_id AND k.status = 'open') AS approvers
        FROM leave_requests r JOIN employees e ON e.organization_id = r.organization_id AND e.id = r.employee_id
        JOIN leave_types t ON t.organization_id = r.organization_id AND t.id = r.leave_type_id
        WHERE r.organization_id = ${org}::uuid AND r.status = 'pending' AND ${scope('r.employee_id')}
        ORDER BY r.created_at LIMIT 50`;
      const [{ waiting }] = await tx.$queryRaw<{ waiting: number }[]>`SELECT count(*)::int AS waiting FROM leave_requests r WHERE r.organization_id = ${org}::uuid AND r.status = 'pending' AND ${scope('r.employee_id')}`;
      const monday = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
      const away = await tx.$queryRaw<{ employeeId: string; name: string; from: string; to: string; type: string; pending: boolean }[]>`
        SELECT d.employee_id::text AS "employeeId", ${name('e')} AS name, min(d.leave_on)::text AS "from", max(d.leave_on)::text AS "to", t.name AS type, bool_or(r.status = 'pending') AS pending
        FROM leave_request_days d JOIN leave_requests r ON r.organization_id = d.organization_id AND r.id = d.request_id AND r.status = ANY(${WAITING}::text[])
        JOIN leave_types t ON t.organization_id = r.organization_id AND t.id = r.leave_type_id
        JOIN employees e ON e.organization_id = d.organization_id AND e.id = d.employee_id
        WHERE d.organization_id = ${org}::uuid AND d.active AND d.portion > 0 AND d.leave_on BETWEEN ${monday}::date AND ${addDays(monday, 6)}::date AND ${scope('d.employee_id')}
        GROUP BY d.employee_id, e.preferred_name, e.given_name, e.family_name, t.name, r.id ORDER BY 3 LIMIT 100`;
      const [{ negative }] = await tx.$queryRaw<{ negative: number }[]>`
        SELECT count(DISTINCT x.employee_id)::int AS negative FROM (
          SELECT l.employee_id, l.leave_type_id FROM leave_ledger l WHERE l.organization_id = ${org}::uuid AND ${scope('l.employee_id')}
          GROUP BY 1, 2 HAVING sum(l.days) < 0) x`;
      const certs = has(v, 'leave.medical.view')
        ? await tx.$queryRaw<{ id: string; name: string; type: string; from: string; to: string }[]>`
            SELECT r.id::text, ${name('e')} AS name, t.name AS type, r.from_on::text AS "from", r.to_on::text AS "to"
            FROM leave_requests r JOIN employees e ON e.organization_id = r.organization_id AND e.id = r.employee_id
            JOIN leave_types t ON t.organization_id = r.organization_id AND t.id = r.leave_type_id
            WHERE r.organization_id = ${org}::uuid AND r.certificate = 'pending' AND r.status IN ('pending', 'approved') AND ${scope('r.employee_id')} AND r.employee_id <> ${own ?? '00000000-0000-0000-0000-000000000000'}::uuid
            ORDER BY r.from_on LIMIT 50`
        : null;
      const yearStartMonth = Number(await this.tenantSetting(tx, c, 'leave.year_start_month'));
      const yearEnd = addDays(leaveYearOf(today, yearStartMonth).start, -1);
      const posted = Boolean(await tx.leaveLedgerEntry.findFirst({ where: { organizationId: org, periodKey: `lapse:${yearEnd}` }, select: { id: true } }));
      return {
        today,
        pending: { total: waiting, rows: pending.map((p) => ({ ...p, sent: p.sent.toISOString() })) },
        away,
        negative,
        certificates: certs,
        yearEnd: { on: yearEnd, posted, nextOn: leaveYearOf(today, yearStartMonth).end },
      };
    });
  }

  /** POST hr/leave-home/remind/:requestId: reminds the open approvers of a waiting request, once a day. */
  async remindApprovers(ctx: TenantContext, user: ScopeUser, requestId: string) {
    const out = await this.inScope(ctx, user, async (tx, c, scope) => {
      const [r] = await tx.$queryRaw<{ id: string; wf: string | null; name: string; createdAt: Date }[]>`
        SELECT r.id::text, r.wf_request_id::text AS wf, ${name('e')} AS name, r.created_at AS "createdAt" FROM leave_requests r JOIN employees e ON e.organization_id = r.organization_id AND e.id = r.employee_id
        WHERE r.organization_id = ${c.organizationId}::uuid AND r.id = ${requestId}::uuid AND r.status = 'pending' AND ${scope('r.employee_id')}`;
      if (!r || !r.wf) throw new NotFoundException('No waiting request in your scope.');
      const key = `leave.remind:${r.id}:${todayIn('Asia/Kolkata')}`;
      const done = await tx.auditLog.findFirst({ where: { organizationId: c.organizationId, action: 'leave.request.reminded', entityId: r.id, createdAt: { gte: istDayStart() } }, select: { id: true } });
      if (done) throw new ConflictException('The approver was already reminded today.');
      const to = (await tx.wfTask.findMany({ where: { organizationId: c.organizationId, requestId: r.wf, status: 'open' }, select: { assigneeUserId: true } })).map((t) => t.assigneeUserId);
      if (!to.length) throw new ConflictException('No one is waiting to approve this request.');
      await audit(tx, c, 'leave.request.reminded', 'leave_request', r.id, { key, to: to.length });
      return { to, name: r.name, id: r.id };
    });
    const text = `Reminder: ${out.name}'s leave request is waiting for your decision.`;
    await this.notifications.notifySystem(ctx, out.to, 'leave.reminder', { entityType: 'leave_request', entityId: out.id, contextText: text, linkPath: '/yx/approvals' }, { subject: 'A leave request is waiting', html: `<p>${escapeHtml(text)}</p>` });
    return { reminded: out.to.length };
  }

  // ------------------------------------------------------------------------------------------ TIM-30 leave reports

  private filters(c: CompanyContext, q: ReportQueryDto, today: string) {
    return Prisma.sql`${inEntitySql(c, q.entityId, Prisma.sql`e.id`, Prisma.sql`${today}::date`)}
      AND (${q.locationId ?? null}::uuid IS NULL OR a.location_id = ${q.locationId ?? null}::uuid)
      AND (${q.departmentId ?? null}::uuid IS NULL OR a.department_id = ${q.departmentId ?? null}::uuid)
      AND (${q.q ?? null}::text IS NULL OR ${name('e')} ILIKE ${`%${(q.q ?? '').replace(/[%_\\]/g, (x) => `\\${x}`)}%`} OR m.employee_code::text ILIKE ${`${(q.q ?? '').replace(/[%_\\]/g, (x) => `\\${x}`)}%`})`;
  }

  /** The report rows (paged), or every row (export, up to 10 000). */
  private async reportRows(tx: Tx, c: CompanyContext, scope: (alias: Alias) => Prisma.Sql, q: ReportQueryDto, all: boolean, pay: string[] = []) {
    const org = c.organizationId;
    const today = todayIn('Asia/Kolkata');
    const size = all ? 10_000 : (q.pageSize ?? 50);
    const offset = all ? 0 : ((q.page ?? 1) - 1) * size;
    const year = leaveYearOf(today, Number(await this.tenantSetting(tx, c, 'leave.year_start_month')));
    const types = (await tx.leaveType.findMany({ where: { organizationId: org, active: true }, orderBy: [{ kind: 'asc' }, { code: 'asc' }] })).map((t) => ({ id: t.id, code: t.code, name: t.name, kind: t.kind, hasBalance: hasBalance(t.kind), paid: t.paid, encashable: Boolean((t.rules as unknown as LeaveRules).encashable) }));
    const people = Prisma.sql`
      FROM employees e
      JOIN employee_assignments a ON a.organization_id = e.organization_id AND a.employee_id = e.id AND a.superseded_at IS NULL AND ${today}::date <@ daterange(a.valid_from, a.valid_to, '[]')
      JOIN employments m ON m.organization_id = e.organization_id AND m.id = a.employment_id AND m.exited_on IS NULL
      LEFT JOIN locations lo ON lo.organization_id = a.organization_id AND lo.id = a.location_id
      LEFT JOIN departments de ON de.organization_id = a.organization_id AND de.id = a.department_id
      WHERE e.organization_id = ${org}::uuid AND ${scope('e.id')} AND ${this.filters(c, q, today)}`;
    if (q.report === 'ledger' || q.report === 'lop') {
      const month = q.month ?? today.slice(0, 7);
      const from = `${month}-01`;
      const to = addDays(addDays(from, 32).slice(0, 8) + '01', -1);
      if (q.report === 'ledger') {
        const [{ total }] = await tx.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total FROM leave_ledger l JOIN employees e ON e.organization_id = l.organization_id AND e.id = l.employee_id
          JOIN employee_assignments a ON a.organization_id = e.organization_id AND a.employee_id = e.id AND a.superseded_at IS NULL AND ${today}::date <@ daterange(a.valid_from, a.valid_to, '[]')
          JOIN employments m ON m.organization_id = e.organization_id AND m.id = a.employment_id
          WHERE l.organization_id = ${org}::uuid AND l.entry_on BETWEEN ${from}::date AND ${to}::date AND ${scope('e.id')} AND ${this.filters(c, q, today)}`;
        const rows = await tx.$queryRaw<{ id: string; on: string; employeeId: string; name: string; code: string | null; type: string; kind: string; days: number; reason: string }[]>`
          SELECT l.id::text, l.entry_on::text AS on, e.id::text AS "employeeId", ${name('e')} AS name, m.employee_code::text AS code, t.name AS type, l.kind, l.days::float AS days, l.reason
          FROM leave_ledger l JOIN employees e ON e.organization_id = l.organization_id AND e.id = l.employee_id
          JOIN leave_types t ON t.organization_id = l.organization_id AND t.id = l.leave_type_id
          JOIN employee_assignments a ON a.organization_id = e.organization_id AND a.employee_id = e.id AND a.superseded_at IS NULL AND ${today}::date <@ daterange(a.valid_from, a.valid_to, '[]')
          JOIN employments m ON m.organization_id = e.organization_id AND m.id = a.employment_id
          WHERE l.organization_id = ${org}::uuid AND l.entry_on BETWEEN ${from}::date AND ${to}::date AND ${scope('e.id')} AND ${this.filters(c, q, today)}
          ORDER BY l.entry_on, name, l.created_at LIMIT ${size} OFFSET ${offset}`;
        return { report: q.report, month, types, total, rows };
      }
      // Unpaid days to payroll: approved unpaid leave plus absent days with no leave, per person in the month.
      const rows = await tx.$queryRaw<{ employeeId: string; name: string; code: string | null; location: string | null; department: string | null; lopLeave: number; absent: number; days: number }[]>`
        SELECT * FROM (
          SELECT e.id::text AS "employeeId", ${name('e')} AS name, m.employee_code::text AS code, lo.name AS location, de.name AS department,
            coalesce((SELECT sum(d.portion) FROM leave_request_days d JOIN leave_requests r ON r.organization_id = d.organization_id AND r.id = d.request_id AND r.status IN ('approved', 'cancel_pending')
               JOIN leave_types t ON t.organization_id = r.organization_id AND t.id = r.leave_type_id AND t.kind = 'lop'
               WHERE d.organization_id = e.organization_id AND d.employee_id = e.id AND d.active AND d.leave_on BETWEEN ${from}::date AND ${to}::date), 0)::float AS "lopLeave",
            (SELECT count(*) FROM attendance_days x WHERE x.organization_id = e.organization_id AND x.employee_id = e.id AND x.status = 'absent' AND x.work_on BETWEEN ${from}::date AND ${to}::date)::float AS absent
          ${people}) z
        WHERE z."lopLeave" + z.absent > 0 ORDER BY z.name LIMIT ${size} OFFSET ${offset}`;
      const [{ total }] = await tx.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total ${people} AND (
        EXISTS (SELECT 1 FROM attendance_days x WHERE x.organization_id = e.organization_id AND x.employee_id = e.id AND x.status = 'absent' AND x.work_on BETWEEN ${from}::date AND ${to}::date)
        OR EXISTS (SELECT 1 FROM leave_request_days d JOIN leave_requests r ON r.organization_id = d.organization_id AND r.id = d.request_id AND r.status IN ('approved', 'cancel_pending')
          JOIN leave_types t ON t.organization_id = r.organization_id AND t.id = r.leave_type_id AND t.kind = 'lop' WHERE d.organization_id = e.organization_id AND d.employee_id = e.id AND d.active AND d.leave_on BETWEEN ${from}::date AND ${to}::date))`;
      return { report: q.report, month, types, total, rows: rows.map((r) => ({ ...r, days: r.lopLeave + r.absent })) };
    }
    if (q.report === 'liability') return this.liabilityRows(tx, c, people, types.filter((t) => t.hasBalance && t.encashable), size, offset, today, pay);
    // Balances, negatives and leave taken: one row per person, a column per leave type.
    const negative = q.report === 'negative' ? Prisma.sql`AND EXISTS (SELECT 1 FROM leave_ledger l WHERE l.organization_id = e.organization_id AND l.employee_id = e.id GROUP BY l.leave_type_id HAVING sum(l.days) < 0)` : Prisma.empty;
    const [{ total }] = await tx.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total ${people} ${negative}`;
    const base = await tx.$queryRaw<{ employeeId: string; name: string; code: string | null; location: string | null; department: string | null }[]>`
      SELECT e.id::text AS "employeeId", ${name('e')} AS name, m.employee_code::text AS code, lo.name AS location, de.name AS department ${people} ${negative}
      ORDER BY name, e.id LIMIT ${size} OFFSET ${offset}`;
    const ids = base.map((b) => b.employeeId);
    const cells = new Map<string, Record<string, number>>();
    if (ids.length) {
      const sums = q.report === 'taken'
        ? await tx.$queryRaw<{ employeeId: string; typeId: string; n: number }[]>`
            SELECT d.employee_id::text AS "employeeId", r.leave_type_id::text AS "typeId", sum(d.portion)::float AS n FROM leave_request_days d
            JOIN leave_requests r ON r.organization_id = d.organization_id AND r.id = d.request_id AND r.status IN ('approved', 'cancel_pending')
            WHERE d.organization_id = ${org}::uuid AND d.employee_id = ANY(${ids}::uuid[]) AND d.active AND d.leave_on BETWEEN ${year.start}::date AND ${year.end}::date GROUP BY 1, 2`
        : await tx.$queryRaw<{ employeeId: string; typeId: string; n: number }[]>`
            SELECT l.employee_id::text AS "employeeId", l.leave_type_id::text AS "typeId", sum(l.days)::float AS n FROM leave_ledger l
            WHERE l.organization_id = ${org}::uuid AND l.employee_id = ANY(${ids}::uuid[]) GROUP BY 1, 2`;
      for (const s of sums) cells.set(s.employeeId, { ...(cells.get(s.employeeId) ?? {}), [s.typeId]: r2(s.n) });
      if (q.report !== 'taken') {
        // Unpaid leave has no balance: these reports show the days taken this year for it.
        const lop = await tx.$queryRaw<{ employeeId: string; typeId: string; n: number }[]>`
          SELECT d.employee_id::text AS "employeeId", r.leave_type_id::text AS "typeId", sum(d.portion)::float AS n FROM leave_request_days d
          JOIN leave_requests r ON r.organization_id = d.organization_id AND r.id = d.request_id AND r.status IN ('approved', 'cancel_pending')
          JOIN leave_types t ON t.organization_id = r.organization_id AND t.id = r.leave_type_id AND t.kind = 'lop'
          WHERE d.organization_id = ${org}::uuid AND d.employee_id = ANY(${ids}::uuid[]) AND d.active AND d.leave_on BETWEEN ${year.start}::date AND ${year.end}::date GROUP BY 1, 2`;
        for (const s of lop) cells.set(s.employeeId, { ...(cells.get(s.employeeId) ?? {}), [s.typeId]: r2(s.n) });
      }
    }
    const shown = q.report === 'taken' ? types : types.filter((t) => t.hasBalance || t.kind === 'lop');
    return { report: q.report, year, types: shown, total, rows: base.map((b) => ({ ...b, values: Object.fromEntries(shown.map((t) => [t.id, cells.get(b.employeeId)?.[t.id] ?? 0])) })) };
  }

  /** The legal entities whose pay this person may see (employee.salary.view; never while acting for someone else). */
  private async payEntities(tx: Tx, c: CompanyContext, pv: Viewer | null, q: ReportQueryDto) {
    return pv && q.report === 'liability' ? entitiesFor(tx, c, pv, 'employee.salary.view') : [];
  }

  /**
   * Founder decision 3: the leave liability. Unused days of the leave types that can be cashed in, and (only for the
   * legal entities whose pay the viewer may see) daily pay x days. Pay comes from Payroll (payOn: the compensation in
   * force today) through the pay guard; daily pay = monthly pay on payroll.leave_encashment_basis ÷ leave.liability.divisor.
   * shortcut: pay is read per person (4 queries each), fine for a page of 200 or an export of a few thousand; a payroll
   * snapshot table is the upgrade if exports of 10,000 people get slow.
   */
  private async liabilityRows(tx: Tx, c: CompanyContext, people: Prisma.Sql, types: { id: string; name: string }[], size: number, offset: number, today: string, pay: string[]) {
    const org = c.organizationId;
    const [{ total }] = await tx.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total ${people}`;
    const typeIds = types.map((t) => t.id);
    const [{ days: allDays }] = await tx.$queryRaw<{ days: number | null }[]>`
      SELECT sum(greatest(x.n, 0))::float AS days FROM (SELECT l.employee_id, l.leave_type_id, sum(l.days) AS n FROM leave_ledger l
        WHERE l.organization_id = ${org}::uuid AND l.leave_type_id = ANY(${typeIds}::uuid[]) AND l.employee_id IN (SELECT e.id ${people}) GROUP BY 1, 2) x`;
    const base = await tx.$queryRaw<{ employeeId: string; name: string; code: string | null; location: string | null; department: string | null; entityId: string; employmentId: string }[]>`
      SELECT e.id::text AS "employeeId", ${name('e')} AS name, m.employee_code::text AS code, lo.name AS location, de.name AS department, a.legal_entity_id::text AS "entityId", m.id::text AS "employmentId" ${people}
      ORDER BY name, e.id LIMIT ${size} OFFSET ${offset}`;
    const sums = base.length && typeIds.length
      ? await tx.$queryRaw<{ employeeId: string; typeId: string; n: number }[]>`
          SELECT l.employee_id::text AS "employeeId", l.leave_type_id::text AS "typeId", sum(l.days)::float AS n FROM leave_ledger l
          WHERE l.organization_id = ${org}::uuid AND l.employee_id = ANY(${base.map((b) => b.employeeId)}::uuid[]) AND l.leave_type_id = ANY(${typeIds}::uuid[]) GROUP BY 1, 2`
      : [];
    const rule = new Map<string, { basis: string; divisor: string }>();
    for (const id of new Set(base.map((b) => b.entityId)))
      if (pay.includes(id)) rule.set(id, { basis: await this.tenantSetting(tx, c, 'payroll.leave_encashment_basis', id), divisor: await this.tenantSetting(tx, c, 'leave.liability.divisor', id) });
    const rows = [];
    for (const b of base) {
      // A negative balance owes nothing: it counts as 0 days.
      const values = Object.fromEntries(types.map((t) => [t.id, r2(Math.max(0, sums.find((x) => x.employeeId === b.employeeId && x.typeId === t.id)?.n ?? 0))]));
      const days = r2(Object.values(values).reduce((a, n) => a + n, 0));
      const { entityId: _e, employmentId, ...shown } = b;
      const r = rule.get(b.entityId);
      if (!r) {
        rows.push({ ...shown, values, days });
        continue;
      }
      const p = await withPayScope(tx, pay, () => payOn(tx, org, employmentId, today));
      const monthly = Number(r.basis === 'gross' ? p.gross : p.gratuityWage);
      const daily = monthly > 0 ? dailyPay(monthly, r.divisor, today) : null;
      rows.push({ ...shown, values, days, dailyPay: daily, amount: daily === null ? null : r2(daily * days), noPay: daily === null });
    }
    const company = { basis: await this.tenantSetting(tx, c, 'payroll.leave_encashment_basis'), divisor: await this.tenantSetting(tx, c, 'leave.liability.divisor') };
    return { report: 'liability' as const, types, total, rows, money: pay.length > 0, totalDays: r2(allDays ?? 0), ...(pay.length ? { dailyPayRule: company } : {}) };
  }

  /** GET hr/leave-report: one page of a report for the people in leave.view scope, with the filters. */
  async report(ctx: TenantContext, user: ScopeUser, q: ReportQueryDto) {
    const pv = q.report === 'liability' ? await payViewer(this.prisma, this.tenantPrisma, user) : null;
    return this.inScope(ctx, user, async (tx, c, scope) => {
      await this.ownFilters(tx, c, q);
      const out = await this.reportRows(tx, c, scope, q, false, await this.payEntities(tx, c, pv, q));
      // The filter lists (entities, locations, departments of this company).
      const org = { organizationId: c.organizationId };
      const filters = {
        entities: (await tx.legalEntity.findMany({ where: { ...org, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } })).map((x) => ({ id: x.id, name: String(x.name) })),
        locations: (await tx.location.findMany({ where: org, select: { id: true, name: true }, orderBy: { name: 'asc' } })).map((x) => ({ id: x.id, name: String(x.name) })),
        departments: (await tx.department.findMany({ where: org, select: { id: true, name: true }, orderBy: { name: 'asc' } })).map((x) => ({ id: x.id, name: String(x.name) })),
      };
      return { ...out, filters, page: q.page ?? 1, pageSize: q.pageSize ?? 50 };
    }, false, reportKeys(q));
  }

  /** GET hr/leave-report/export: the whole report as CSV (up to 10 000 rows), audited. */
  async export(ctx: TenantContext, user: ScopeUser, q: ReportQueryDto) {
    const pv = q.report === 'liability' ? await payViewer(this.prisma, this.tenantPrisma, user) : null;
    return this.inScope(ctx, user, async (tx, c, scope) => {
      await this.ownFilters(tx, c, q);
      const out = await this.reportRows(tx, c, scope, q, true, await this.payEntities(tx, c, pv, q));
      if (out.total > 10_000) throw new BadRequestException(`This report has ${out.total} rows. Filter it to 10,000 rows or fewer to export.`);
      const head = ['Employee', 'Code'];
      let lines: (string | number | null)[][];
      if (out.report === 'liability') lines = liabilityCsv(out as Liability);
      else if (out.report === 'ledger') lines = [[...head, 'Date', 'Leave', 'Change', 'Reason'], ...(out.rows as { name: string; code: string | null; on: string; type: string; days: number; reason: string }[]).map((r) => [r.name, r.code, r.on, r.type, r.days, r.reason])];
      else if (out.report === 'lop') lines = [[...head, 'Location', 'Department', 'Unpaid leave days', 'Absent days', 'Total unpaid days'], ...(out.rows as { name: string; code: string | null; location: string | null; department: string | null; lopLeave: number; absent: number; days: number }[]).map((r) => [r.name, r.code, r.location, r.department, r.lopLeave, r.absent, r.days])];
      else lines = [[...head, 'Location', 'Department', ...out.types.map((t) => t.name)], ...(out.rows as { name: string; code: string | null; location: string | null; department: string | null; values: Record<string, number> }[]).map((r) => [r.name, r.code, r.location, r.department, ...out.types.map((t) => r.values[t.id] ?? 0)])];
      await audit(tx, c, 'leave.report.exported', 'leave_report', c.organizationId, { report: q.report, rows: out.total, ...(out.report === 'liability' ? { pay: (out as Liability).money } : {}), filters: { entityId: q.entityId ?? null, locationId: q.locationId ?? null, departmentId: q.departmentId ?? null, month: q.month ?? null } });
      return { filename: `leave-${q.report}-${todayIn('Asia/Kolkata')}.csv`, csv: toCsv(lines) };
    }, false, reportKeys(q));
  }

  // ------------------------------------------------------------------------------------------ TIM-39 block leave

  /** GET hr/block-leave: people whose role needs block leave (setting), with their plan and status this leave year. */
  blockLeave(ctx: TenantContext, user: ScopeUser) {
    return this.inScope(
      ctx,
      user,
      async (tx, c, scope, v) => {
        const org = c.organizationId;
        const today = todayIn('Asia/Kolkata');
        const people = await tx.$queryRaw<{ id: string }[]>`
          SELECT e.id::text FROM employees e JOIN employee_assignments a ON a.organization_id = e.organization_id AND a.employee_id = e.id AND a.superseded_at IS NULL AND ${today}::date <@ daterange(a.valid_from, a.valid_to, '[]')
          JOIN employments m ON m.organization_id = e.organization_id AND m.id = a.employment_id AND m.exited_on IS NULL
          WHERE e.organization_id = ${org}::uuid AND ${scope('e.id')} ORDER BY e.given_name LIMIT 500`;
        const book = await ScheduleBook.load(tx, org);
        const rows = [];
        for (const p of people) {
          const f = await factsOn(tx, org, p.id, today);
          if (!f || (await settingOn(tx, c, 'leave.block_leave.required', f, today)) !== 'yes') continue;
          const need = Number(await settingOn(tx, c, 'leave.block_leave.days', f, today));
          const year = leaveYearOf(today, Number(await settingOn(tx, c, 'leave.year_start_month', f, today)));
          const { offs: _offs, managerEmployeeId: _m, ...row } = await this.blockStatus(tx, c, book, f, year, need, today);
          rows.push({ ...row, canPlan: has(v, 'leave.view') });
        }
        return { today, rows };
      },
      true,
    );
  }

  private async blockStatus(tx: Tx, c: CompanyContext, book: ScheduleBook, f: Facts, year: { start: string; end: string }, need: number, today: string) {
    const org = c.organizationId;
    const plan = await tx.blockLeavePlan.findFirst({ where: { organizationId: org, employeeId: f.employeeId, yearStart: asDate(year.start) } });
    const leave = await tx.$queryRaw<{ on: string; future: boolean }[]>`
      SELECT d.leave_on::text AS on, r.status = 'pending' AS future FROM leave_request_days d JOIN leave_requests r ON r.organization_id = d.organization_id AND r.id = d.request_id AND r.status = ANY(${WAITING}::text[])
      WHERE d.organization_id = ${org}::uuid AND d.employee_id = ${f.employeeId}::uuid AND d.active AND d.portion = 1 AND d.leave_on BETWEEN ${year.start}::date AND ${year.end}::date`;
    await book.prime([f.employeeId], year.start, year.end);
    const { map: hol } = await holidaysFor(tx, org, f.locationId, year.start, year.end, f.employeeId);
    const offs = new Set<string>();
    for (let d = year.start; d <= year.end; d = addDays(d, 1)) if (hol.has(d) || (await book.day(f, d, false)).weeklyOff) offs.add(d);
    const taken = longestRun(new Set(leave.filter((x) => x.on <= today).map((x) => x.on)), year.start, today, (d) => offs.has(d));
    const booked = longestRun(new Set(leave.map((x) => x.on)), year.start, year.end, (d) => offs.has(d));
    const earned = (await this.leave.balancesIn(tx, c, f, today)).find((b) => b.kind === 'earned');
    const status = taken >= need ? 'taken' : booked >= need || plan?.fromOn ? 'planned' : 'not_planned';
    return { employeeId: f.employeeId, name: f.name, code: f.code, managerEmployeeId: f.managerEmployeeId, need, status, plan: plan?.fromOn ? { from: dateOf(plan.fromOn), to: dateOf(plan.toOn!), accessPause: plan.accessPause, version: plan.version } : null, nudgedAt: plan?.nudgedAt ?? null, earnedLeft: earned?.available ?? 0, offs };
  }

  private async blockTarget(tx: Tx, c: CompanyContext, v: Viewer, employeeId: string) {
    const own = await this.own(tx, c, v);
    const today = todayIn('Asia/Kolkata');
    if (!(await grantCovers(tx, c, v, own, 'leave.view', employeeId, today))) throw new NotFoundException('Not found');
    if (employeeId === own) throw new ForbiddenException('You cannot plan your own block leave here.');
    const f = await factsOn(tx, c.organizationId, employeeId, today);
    if (!f || (await settingOn(tx, c, 'leave.block_leave.required', f, today)) !== 'yes') throw new ConflictException('Block leave is not required for this person.');
    const year = leaveYearOf(today, Number(await settingOn(tx, c, 'leave.year_start_month', f, today)));
    return { f, today, year, need: Number(await settingOn(tx, c, 'leave.block_leave.days', f, today)) };
  }

  /** POST hr/block-leave/:employeeId/plan: HR plans the block; the person and their manager are told. */
  async planBlock(ctx: TenantContext, user: ScopeUser, employeeId: string, dto: { from: string; to: string }) {
    const v = await this.leave.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { f, today, year, need } = await this.blockTarget(tx, c, v, employeeId);
      if (dto.from <= today) throw new BadRequestException('Plan block leave from tomorrow or later.');
      if (dto.to < dto.from || dto.to > year.end) throw new BadRequestException(`The last day is on or after the first, by ${fmt(year.end)}.`);
      const book = await ScheduleBook.load(tx, c.organizationId);
      const s = await this.blockStatus(tx, c, book, f, year, need, today);
      const span = new Set<string>();
      for (let d = dto.from; d <= dto.to; d = addDays(d, 1)) if (!s.offs.has(d)) span.add(d);
      if (span.size < need) throw new BadRequestException(`Only ${days(span.size)} working days. Block leave is ${need} working days in a row.`);
      if (span.size > s.earnedLeft) throw new BadRequestException(`Only ${days(s.earnedLeft)} of earned leave left for a ${days(span.size)} block.`);
      const plan = await tx.blockLeavePlan.findFirst({ where: { organizationId: c.organizationId, employeeId, yearStart: asDate(year.start) } });
      if (plan?.accessPause === 'scheduled' && plan.fromOn && dateOf(plan.fromOn) <= today) throw new ConflictException('Access is paused for the current block. Plan again after it ends.');
      if (plan) await tx.blockLeavePlan.update({ where: { id: plan.id }, data: { fromOn: asDate(dto.from), toOn: asDate(dto.to), accessPause: 'none', version: { increment: 1 }, updatedAt: new Date() } });
      else await tx.blockLeavePlan.create({ data: { organizationId: c.organizationId, employeeId, yearStart: asDate(year.start), fromOn: asDate(dto.from), toOn: asDate(dto.to), createdBy: c.userId ?? null } });
      await audit(tx, c, 'leave.block.planned', 'block_leave_plan', employeeId, { from: dto.from, to: dto.to, workingDays: span.size });
      const manager = f.managerEmployeeId ? (await tx.employee.findFirst({ where: { organizationId: c.organizationId, id: f.managerEmployeeId }, select: { userId: true } }))?.userId : null;
      return { users: [f.userId, manager].filter((x): x is string => Boolean(x)), name: f.name, workingDays: span.size };
    });
    const text = `Block leave for ${out.name} is planned: ${fmt(dto.from)} to ${fmt(dto.to)} (${days(out.workingDays)} working days). Apply for it as earned leave.`;
    await this.notifications.notifySystem(ctx, out.users, 'leave.block', { entityType: 'block_leave_plan', entityId: employeeId, contextText: text, linkPath: '/yx/time/leave' }, { subject: 'Block leave planned', html: `<p>${escapeHtml(text)}</p>` });
    return { employeeId, from: dto.from, to: dto.to, workingDays: out.workingDays };
  }

  /** POST hr/block-leave/:employeeId/nudge: ask the person to plan it (once a day). */
  async nudgeBlock(ctx: TenantContext, user: ScopeUser, employeeId: string) {
    const v = await this.leave.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { f, today, year, need } = await this.blockTarget(tx, c, v, employeeId);
      const plan = await tx.blockLeavePlan.findFirst({ where: { organizationId: c.organizationId, employeeId, yearStart: asDate(year.start) } });
      if (plan?.nudgedAt && todayIn('Asia/Kolkata', plan.nudgedAt) === today) throw new ConflictException('Already nudged today.');
      if (plan) await tx.blockLeavePlan.update({ where: { id: plan.id }, data: { nudgedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
      else await tx.blockLeavePlan.create({ data: { organizationId: c.organizationId, employeeId, yearStart: asDate(year.start), nudgedAt: new Date(), createdBy: c.userId ?? null } });
      await audit(tx, c, 'leave.block.nudged', 'block_leave_plan', employeeId, {});
      return { userId: f.userId, need, end: year.end };
    });
    const text = `Please plan your block leave: ${out.need} working days in a row before ${fmt(out.end)}.`;
    if (out.userId) await this.notifications.notifySystem(ctx, [out.userId], 'leave.block', { entityType: 'block_leave_plan', entityId: employeeId, contextText: text, linkPath: '/yx/time/leave' }, { subject: 'Plan your block leave', html: `<p>${escapeHtml(text)}</p>` });
    return { employeeId, nudged: true };
  }

  /** POST hr/block-leave/:employeeId/pause: schedule (or cancel) the access pause for the planned block. */
  async pauseBlock(ctx: TenantContext, user: ScopeUser, employeeId: string, pause: boolean) {
    const v = await this.leave.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { year } = await this.blockTarget(tx, c, v, employeeId);
      const plan = await tx.blockLeavePlan.findFirst({ where: { organizationId: c.organizationId, employeeId, yearStart: asDate(year.start) } });
      if (!plan?.fromOn) throw new ConflictException('Plan the block leave first.');
      const want = pause ? 'scheduled' : 'none';
      // Only before the first day: from then the hourly job pauses access, and it comes back by itself after the block.
      if (dateOf(plan.fromOn) <= todayIn('Asia/Kolkata')) throw new ConflictException(plan.accessPause === 'scheduled' ? 'Access is already paused for this block. It comes back after the last day.' : 'This block has started. An access pause is set before the first day.');
      if (plan.accessPause === want) throw new ConflictException(pause ? 'The access pause is already scheduled.' : 'No access pause is scheduled.');
      await tx.blockLeavePlan.update({ where: { id: plan.id }, data: { accessPause: want, version: { increment: 1 }, updatedAt: new Date() } });
      await audit(tx, c, pause ? 'leave.block.pause_scheduled' : 'leave.block.pause_cancelled', 'block_leave_plan', employeeId, { from: dateOf(plan.fromOn), to: dateOf(plan.toOn!) });
      return { employeeId, accessPause: want };
    });
  }

  /**
   * TIM-39 Suspend (hourly job): a scheduled access pause starts on the block's first day (IST): the person's sign-in is
   * paused (user status "paused", every session and refresh token revoked), once per plan (an audit row marks it, so HR
   * turning access back on as an exception sticks). The day after the last day access comes back (only a "paused"
   * account: one deactivated meanwhile stays so) and the plan's pause is cleared. Safe to re-run.
   */
  async applyAccessPauses(org: string, now = new Date()): Promise<number> {
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false };
    const today = todayIn('Asia/Kolkata', now);
    return this.tenantPrisma.forTenant(c, async (tx) => {
      let n = 0;
      const due = await tx.blockLeavePlan.findMany({ where: { organizationId: org, accessPause: 'scheduled', fromOn: { lte: asDate(today) } } });
      for (const plan of due) {
        const userId = (await tx.employee.findFirst({ where: { organizationId: org, id: plan.employeeId }, select: { userId: true } }))?.userId ?? null;
        const span = { from: dateOf(plan.fromOn!), to: dateOf(plan.toOn!) };
        if (span.to < today) {
          const restored = userId ? (await tx.user.updateMany({ where: { organizationId: org, id: userId, status: 'paused' }, data: { status: 'active' } })).count : 0;
          await tx.blockLeavePlan.update({ where: { id: plan.id }, data: { accessPause: 'none', version: { increment: 1 }, updatedAt: now } });
          await audit(tx, c, 'leave.block.access_restored', 'block_leave_plan', plan.employeeId, { ...span, restored: restored > 0 });
          n++;
          continue;
        }
        if (await tx.auditLog.findFirst({ where: { organizationId: org, action: 'leave.block.access_paused', entityId: plan.employeeId, createdAt: { gte: plan.updatedAt } }, select: { id: true } })) continue;
        const paused = userId ? (await tx.user.updateMany({ where: { organizationId: org, id: userId, status: 'active' }, data: { status: 'paused' } })).count : 0;
        if (paused) {
          await tx.refreshToken.updateMany({ where: { userId: userId!, revokedAt: null }, data: { revokedAt: now } });
          await revokeStaffSessions(tx, { userId: userId! }, 'block_leave_access_pause');
        }
        await audit(tx, c, 'leave.block.access_paused', 'block_leave_plan', plan.employeeId, { ...span, paused: paused > 0 });
        n++;
      }
      return n;
    });
  }

  // ------------------------------------------------------------------------------------------ TIM-42 holiday feeds

  /** GET setup/holiday-feeds: on or off, the feeds with their locations, and the changes waiting for review. */
  feeds(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const on = (await this.tenantSetting(tx, c, 'holiday.feeds')) === 'on';
      const feeds = await tx.holidayFeed.findMany({ where: { organizationId: org, removedAt: null }, orderBy: { state: 'asc' } });
      const locations = await tx.location.findMany({ where: { organizationId: org }, select: { id: true, name: true, state: true } });
      const calendars = await tx.holidayCalendar.findMany({ where: { organizationId: org }, select: { id: true, name: true, locationId: true } });
      const waiting = await tx.holidayFeedChange.findMany({ where: { organizationId: org, status: 'waiting' }, orderBy: { holidayOn: 'asc' }, take: 200 });
      const onLeave = new Map<string, number>();
      for (const w of waiting.filter((x) => x.action === 'add')) onLeave.set(w.id, (await this.leaveOnDate(tx, org, w.calendarId, dateOf(w.holidayOn))).length);
      return {
        on,
        provider: this.provider.name,
        states: Object.entries(FEED_STATES).map(([code, label]) => ({ code, name: label })),
        feeds: feeds.map((f) => ({ id: f.id, state: f.state, stateName: FEED_STATES[f.state] ?? f.state, provider: f.provider, checkedAt: f.checkedAt, checkError: f.checkError, locations: locations.filter((l) => l.state === f.state).map((l) => ({ id: l.id, name: l.name, hasCalendar: calendars.some((k) => k.locationId === l.id) })), waiting: waiting.filter((w) => w.feedId === f.id).length })),
        changes: waiting.map((w) => ({ id: w.id, feedId: w.feedId, calendar: calendars.find((k) => k.id === w.calendarId)?.name ?? '', action: w.action, on: dateOf(w.holidayOn), name: w.name, peopleOnLeave: onLeave.get(w.id) ?? 0 })),
      };
    });
  }

  private async feedsOn(tx: Tx, c: CompanyContext) {
    if ((await this.tenantSetting(tx, c, 'holiday.feeds')) !== 'on') throw new ConflictException('Holiday feeds are off. Turn them on in the feed settings first.');
  }

  addFeed(ctx: TenantContext, state: string) {
    if (!FEED_STATES[state]) throw new BadRequestException('Choose a state from the list.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.feedsOn(tx, c);
      if (await tx.holidayFeed.findFirst({ where: { organizationId: c.organizationId, state, removedAt: null }, select: { id: true } })) throw new ConflictException(`${FEED_STATES[state]} is already subscribed.`);
      const f = await tx.holidayFeed.create({ data: { organizationId: c.organizationId, state, provider: this.provider.name, createdBy: c.userId ?? null } });
      await audit(tx, c, 'holiday.feed.added', 'holiday_feed', f.id, { state, provider: this.provider.name });
      return { id: f.id };
    });
  }

  removeFeed(ctx: TenantContext, id: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const f = await tx.holidayFeed.findFirst({ where: { organizationId: c.organizationId, id, removedAt: null } });
      if (!f) throw new NotFoundException('Not found');
      await tx.holidayFeed.update({ where: { id }, data: { removedAt: new Date() } });
      await tx.holidayFeedChange.updateMany({ where: { organizationId: c.organizationId, feedId: id, status: 'waiting' }, data: { status: 'ignored', decidedBy: c.userId ?? null, decidedAt: new Date() } });
      await audit(tx, c, 'holiday.feed.removed', 'holiday_feed', id, { state: f.state });
      return { id };
    });
  }

  /** POST setup/holiday-feeds/check: asks the provider for this year and next, and lists what differs from the calendars. */
  async checkFeeds(ctx: TenantContext) {
    const list = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.feedsOn(tx, c);
      return tx.holidayFeed.findMany({ where: { organizationId: c.organizationId, removedAt: null } });
    });
    const year = Number(todayIn('Asia/Kolkata').slice(0, 4));
    // The provider is called outside the transaction (a slow feed must not hold database locks).
    const fetched = new Map<string, { holidays: { on: string; name: string }[] } | { error: string }>();
    for (const f of list) {
      try {
        fetched.set(f.id, { holidays: [...(await this.provider.holidays(f.state, year)), ...(await this.provider.holidays(f.state, year + 1))] });
      } catch (e) {
        fetched.set(f.id, { error: `The feed did not answer: ${(e as Error).message}`.slice(0, 300) });
      }
    }
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const today = todayIn('Asia/Kolkata');
      let found = 0;
      let failed = 0;
      for (const f of list) {
        const got = fetched.get(f.id)!;
        if ('error' in got) {
          failed += 1;
          await tx.holidayFeed.update({ where: { id: f.id }, data: { checkedAt: new Date(), checkError: got.error } });
          continue;
        }
        const locs = (await tx.location.findMany({ where: { organizationId: org, state: f.state }, select: { id: true } })).map((l) => l.id);
        const cals = await tx.holidayCalendar.findMany({ where: { organizationId: org, locationId: { in: locs } } });
        for (const cal of cals) {
          const have = await tx.holiday.findMany({ where: { organizationId: org, calendarId: cal.id, holidayOn: { gte: asDate(today) } } });
          const dates = new Set(have.map((h) => dateOf(h.holidayOn)));
          const feedDates = new Set(got.holidays.map((h) => h.on));
          const changes = [
            ...got.holidays.filter((h) => h.on >= today && !dates.has(h.on)).map((h) => ({ action: 'add', on: h.on, name: h.name, holidayId: null as string | null })),
            ...have.filter((h) => h.kind === 'state' && !feedDates.has(dateOf(h.holidayOn))).map((h) => ({ action: 'remove', on: dateOf(h.holidayOn), name: h.name, holidayId: h.id })),
          ];
          if (changes.length) found += (await tx.holidayFeedChange.createMany({ data: changes.map((x) => ({ organizationId: org, feedId: f.id, calendarId: cal.id, action: x.action, holidayOn: asDate(x.on), name: x.name.slice(0, 100), holidayId: x.holidayId })), skipDuplicates: true })).count;
        }
        await tx.holidayFeed.update({ where: { id: f.id }, data: { checkedAt: new Date(), checkError: null } });
      }
      await audit(tx, c, 'holiday.feed.checked', 'holiday_feed', org, { feeds: list.length, found, failed });
      return { feeds: list.length, found, failed };
    });
  }

  /** Active leave days on `on` of the people whose holidays come from this calendar. */
  private async leaveOnDate(tx: Tx, org: string, calendarId: string, on: string) {
    const cal = await tx.holidayCalendar.findFirst({ where: { organizationId: org, id: calendarId } });
    if (!cal) return [];
    return tx.$queryRaw<{ requestId: string; employeeId: string; portion: number; status: string; kind: string; userId: string | null }[]>`
      SELECT d.request_id::text AS "requestId", d.employee_id::text AS "employeeId", d.portion::float AS portion, r.status, t.kind, e.user_id::text AS "userId"
      FROM leave_request_days d JOIN leave_requests r ON r.organization_id = d.organization_id AND r.id = d.request_id AND r.status = ANY(${WAITING}::text[])
      JOIN leave_types t ON t.organization_id = r.organization_id AND t.id = r.leave_type_id
      JOIN employees e ON e.organization_id = d.organization_id AND e.id = d.employee_id
      JOIN employee_assignments a ON a.organization_id = d.organization_id AND a.employee_id = d.employee_id AND a.superseded_at IS NULL AND ${on}::date <@ daterange(a.valid_from, a.valid_to, '[]')
      WHERE d.organization_id = ${org}::uuid AND d.active AND d.portion > 0 AND d.leave_on = ${on}::date
        AND (a.location_id = ${cal.locationId}::uuid OR (${cal.locationId}::uuid IS NULL AND NOT EXISTS (SELECT 1 FROM holiday_calendars hc WHERE hc.organization_id = a.organization_id AND hc.location_id = a.location_id)))`;
  }

  /**
   * POST setup/holiday-feeds/decide: accepted additions go on the calendar and leave already on that date goes back to
   * the balance (the people are told); accepted removals take the holiday off; ignored changes are kept as ignored.
   */
  async decideFeed(ctx: TenantContext, dto: FeedDecideDto) {
    if (!dto.accept.length && !dto.ignore.length) throw new BadRequestException('Accept or ignore at least one change.');
    if (dto.accept.some((x) => dto.ignore.includes(x))) throw new BadRequestException('A change is either accepted or ignored, not both.');
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = [...dto.accept, ...dto.ignore];
      const rows = await tx.holidayFeedChange.findMany({ where: { organizationId: org, id: { in: ids } } });
      if (rows.length !== ids.length) throw new NotFoundException('Some of those changes were not found.');
      if (rows.some((r) => r.status !== 'waiting')) throw new ConflictException('Some of those changes were already decided. Reload to see the latest.');
      const today = todayIn('Asia/Kolkata');
      const told: { userId: string; on: string; requestId: string }[] = [];
      let returned = 0;
      for (const r of rows) {
        const accept = dto.accept.includes(r.id);
        const on = dateOf(r.holidayOn);
        if (accept && on < today) throw new ConflictException(`${fmt(on)} has passed, so it can't change now. Ignore it.`);
        await tx.holidayFeedChange.update({ where: { id: r.id }, data: { status: accept ? 'accepted' : 'ignored', decidedBy: c.userId ?? null, decidedAt: new Date() } });
        if (!accept) continue;
        if (r.action === 'remove') {
          if (r.holidayId) await tx.holiday.deleteMany({ where: { organizationId: org, id: r.holidayId } });
        } else {
          await tx.holiday.create({ data: { organizationId: org, calendarId: r.calendarId, holidayOn: r.holidayOn, name: r.name, kind: 'state', createdBy: c.userId ?? null } });
          returned += await this.holidayAdded(tx, c, r.calendarId, on, r.name, told);
        }
        await audit(tx, c, accept ? 'holiday.feed.accepted' : 'holiday.feed.ignored', 'holiday_feed_change', r.id, { calendarId: r.calendarId, action: r.action, on, name: r.name });
      }
      return { accepted: dto.accept.length, ignored: dto.ignore.length, leaveReturned: returned, told };
    });
    await this.tellHolidayAdded(ctx, out.told);
    return { accepted: out.accepted, ignored: out.ignored, leaveReturned: out.leaveReturned };
  }

  // ------------------------------------------------------------------------------------------ TIM-26 drafts (clone, template)
  // Called inside TimeSetupService.run (company-wide leave.settings.manage). Drafts are never seen by employees;
  // publishing copies them into the calendar, and leave already on a new holiday goes back to the balance.

  /** Start a location's calendar from its state's public holidays (the feed provider), today to 31 Dec, as a draft. */
  async templateIn(tx: Tx, c: CompanyContext, locationId: string) {
    const org = c.organizationId;
    const loc = await tx.location.findFirst({ where: { organizationId: org, id: locationId, archivedAt: null } });
    if (!loc) throw new NotFoundException('No such location.');
    const stateName = FEED_STATES[loc.state];
    if (!stateName) throw new ConflictException(`There is no state template for ${loc.name}. Add its holidays one by one.`);
    const today = todayIn('Asia/Kolkata');
    let cal = await tx.holidayCalendar.findFirst({ where: { organizationId: org, locationId } });
    if (cal && (await tx.holiday.count({ where: { organizationId: org, calendarId: cal.id, holidayOn: { gte: asDate(today) } } }))) throw new ConflictException(`${loc.name} already has holidays from today. Add or remove them one by one.`);
    if (cal && (await tx.holidayDraft.count({ where: { organizationId: org, calendarId: cal.id } }))) throw new ConflictException(`${loc.name} already has a draft. Publish it first.`);
    let feed: { on: string; name: string }[];
    try {
      feed = await this.provider.holidays(loc.state, Number(today.slice(0, 4)));
    } catch {
      throw new ServiceUnavailableException(`The ${stateName} holiday list could not be fetched. Try again in a few minutes.`);
    }
    const rows = templateRows(feed, today);
    if (!rows.length) throw new ConflictException(`The ${stateName} template has no holidays left this year.`);
    if (!cal) {
      cal = await tx.holidayCalendar.create({ data: { organizationId: org, name: `${loc.name} holidays`.slice(0, 100), locationId, createdBy: c.userId ?? null } });
      await audit(tx, c, 'holiday.calendar.created', 'holiday_calendar', cal.id, { name: cal.name, locationId });
    }
    const calendarId = cal.id;
    await tx.holidayDraft.createMany({ data: rows.map((h) => ({ organizationId: org, calendarId, holidayOn: asDate(h.on), name: h.name, kind: h.kind, halfDay: h.halfDay, source: 'template', createdBy: c.userId ?? null })), skipDuplicates: true });
    await audit(tx, c, 'holiday.calendar.template', 'holiday_calendar', calendarId, { state: loc.state, provider: this.provider.name, from: today, days: rows.length });
    return { calendarId, year: Number(today.slice(0, 4)), added: rows.length };
  }

  /** Copy this year's holidays to next year as a draft; festivals keep last year's date until HR confirms it. */
  async cloneIn(tx: Tx, c: CompanyContext, calendarId: string) {
    const org = c.organizationId;
    const cal = await tx.holidayCalendar.findFirst({ where: { organizationId: org, id: calendarId } });
    if (!cal) throw new NotFoundException('No such calendar.');
    const year = Number(todayIn('Asia/Kolkata').slice(0, 4));
    const next = year + 1;
    const waiting = await tx.holidayFeedChange.count({ where: { organizationId: org, calendarId, status: 'waiting' } });
    if (waiting) throw new ConflictException(`Review the holiday feed ${waiting === 1 ? 'change' : 'changes'} first, so ${next} starts from the right dates.`);
    if (await tx.holidayDraft.count({ where: { organizationId: org, calendarId, holidayOn: { gte: asDate(`${next}-01-01`), lte: asDate(`${next}-12-31`) } } })) throw new ConflictException(`${cal.name} already has a ${next} draft. Open it to confirm and publish.`);
    const rows = await tx.holiday.findMany({ where: { organizationId: org, calendarId, holidayOn: { gte: asDate(`${year}-01-01`), lte: asDate(`${year}-12-31`) } } });
    if (!rows.length) throw new ConflictException(`${cal.name} has no ${year} holidays to copy. Add them first.`);
    const have = new Set((await tx.holiday.findMany({ where: { organizationId: org, calendarId, holidayOn: { gte: asDate(`${next}-01-01`), lte: asDate(`${next}-12-31`) } }, select: { holidayOn: true } })).map((h) => dateOf(h.holidayOn)));
    const out = cloneToYear(rows.map((h) => ({ on: dateOf(h.holidayOn), name: h.name, kind: h.kind, halfDay: h.halfDay })), next).filter((h) => !have.has(h.on));
    if (!out.length) throw new ConflictException(`${cal.name} already has every ${next} holiday.`);
    await tx.holidayDraft.createMany({ data: out.map((h) => ({ organizationId: org, calendarId, holidayOn: asDate(h.on), name: h.name, kind: h.kind, halfDay: h.halfDay, confirm: h.confirm, source: 'clone', createdBy: c.userId ?? null })) });
    const toConfirm = out.filter((h) => h.confirm).length;
    await audit(tx, c, 'holiday.calendar.cloned', 'holiday_calendar', calendarId, { year: next, days: out.length, toConfirm });
    return { calendarId, year: next, added: out.length, toConfirm };
  }

  /** Confirm (or change) a draft festival's date; it stays in the draft's year and must not clash. */
  async confirmDraftIn(tx: Tx, c: CompanyContext, id: string, on: string) {
    const org = c.organizationId;
    const d = await tx.holidayDraft.findFirst({ where: { organizationId: org, id } });
    if (!d) throw new NotFoundException('Not found');
    const year = dateOf(d.holidayOn).slice(0, 4);
    if (on.slice(0, 4) !== year) throw new BadRequestException(`Choose a date in ${year}.`);
    if (on < todayIn('Asia/Kolkata')) throw new BadRequestException('Choose today or a later date.');
    if (on !== dateOf(d.holidayOn) && (await tx.holidayDraft.findFirst({ where: { organizationId: org, calendarId: d.calendarId, holidayOn: asDate(on) } }))) throw new ConflictException(`${fmt(on)} is already a holiday in this draft.`);
    await tx.holidayDraft.update({ where: { id }, data: { holidayOn: asDate(on), confirm: false } });
    await audit(tx, c, 'holiday.draft.confirmed', 'holiday_calendar', d.calendarId, { name: d.name, from: dateOf(d.holidayOn), to: on });
    return { id, on };
  }

  /** Remove one day from a draft (nothing changes for employees). */
  async removeDraftIn(tx: Tx, c: CompanyContext, id: string) {
    const d = await tx.holidayDraft.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!d) throw new NotFoundException('Not found');
    await tx.holidayDraft.delete({ where: { id } });
    await audit(tx, c, 'holiday.draft.removed', 'holiday_calendar', d.calendarId, { name: d.name, on: dateOf(d.holidayOn) });
    return { id };
  }

  /** "Change date": a future holiday moves to another future date of its year; leave on the new date goes back. */
  async changeHolidayIn(tx: Tx, c: CompanyContext, id: string, on: string, told: { userId: string; on: string; requestId: string }[]) {
    const org = c.organizationId;
    const h = await tx.holiday.findFirst({ where: { organizationId: org, id } });
    if (!h) throw new NotFoundException('Not found');
    const was = dateOf(h.holidayOn);
    const today = todayIn('Asia/Kolkata');
    if (was < today) throw new ConflictException('That holiday has passed, so its date stays.');
    if (on < today) throw new BadRequestException('Choose today or a later date.');
    if (on.slice(0, 4) !== was.slice(0, 4)) throw new BadRequestException(`Choose a date in ${was.slice(0, 4)}.`);
    if (on === was) return { id, on, leaveReturned: 0 };
    if (await tx.holiday.findFirst({ where: { organizationId: org, calendarId: h.calendarId, holidayOn: asDate(on) } })) throw new ConflictException('That date is already a holiday on this calendar.');
    await tx.holiday.update({ where: { id }, data: { holidayOn: asDate(on) } });
    const returned = h.kind === 'optional' || h.kind === 'restricted' ? 0 : await this.holidayAdded(tx, c, h.calendarId, on, h.name, told);
    await audit(tx, c, 'holiday.date_changed', 'holiday', id, { calendarId: h.calendarId, name: h.name, from: was, to: on, leaveReturned: returned });
    return { id, on, leaveReturned: returned };
  }

  /** Publish a calendar's draft for a year: every festival date confirmed first; days already past are left out. */
  async publishDraftIn(tx: Tx, c: CompanyContext, calendarId: string, year: number, told: { userId: string; on: string; requestId: string }[]) {
    const org = c.organizationId;
    const cal = await tx.holidayCalendar.findFirst({ where: { organizationId: org, id: calendarId } });
    if (!cal) throw new NotFoundException('No such calendar.');
    const drafts = await tx.holidayDraft.findMany({ where: { organizationId: org, calendarId, holidayOn: { gte: asDate(`${year}-01-01`), lte: asDate(`${year}-12-31`) } }, orderBy: { holidayOn: 'asc' } });
    if (!drafts.length) throw new NotFoundException(`${cal.name} has no ${year} draft.`);
    const open = drafts.filter((d) => d.confirm).length;
    if (open) throw new ConflictException(`Confirm the ${open === 1 ? 'festival date' : `${open} festival dates`} first.`);
    const today = todayIn('Asia/Kolkata');
    const have = new Set((await tx.holiday.findMany({ where: { organizationId: org, calendarId, holidayOn: { gte: asDate(`${year}-01-01`), lte: asDate(`${year}-12-31`) } }, select: { holidayOn: true } })).map((h) => dateOf(h.holidayOn)));
    const put = drafts.filter((d) => dateOf(d.holidayOn) >= today && !have.has(dateOf(d.holidayOn)));
    let returned = 0;
    for (const d of put) {
      await tx.holiday.create({ data: { organizationId: org, calendarId, holidayOn: d.holidayOn, name: d.name, kind: d.kind, halfDay: d.halfDay, createdBy: c.userId ?? null } });
      if (d.kind !== 'optional' && d.kind !== 'restricted') returned += await this.holidayAdded(tx, c, calendarId, dateOf(d.holidayOn), d.name, told);
    }
    await tx.holidayDraft.deleteMany({ where: { organizationId: org, id: { in: drafts.map((d) => d.id) } } });
    await tx.holidayCalendar.update({ where: { id: calendarId }, data: { publishedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
    await audit(tx, c, 'holiday.calendar.published', 'holiday_calendar', calendarId, { year, added: put.length, leftOut: drafts.length - put.length, leaveReturned: returned });
    return { calendarId, year, added: put.length, leaveReturned: returned };
  }

  /** TIM-26 rule "Holiday on a weekly off: comp-off credit": a comp-off day for each person at that location (daily job, once each). */
  async creditHolidayOnWeeklyOff(org: string, now = new Date()): Promise<number> {
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false };
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const t = await this.compOffType(tx, org);
      const cals = await tx.holidayCalendar.findMany({ where: { organizationId: org, onWeeklyOff: 'comp_off', locationId: { not: null } } });
      if (!t || !cals.length) return 0;
      const today = todayIn('Asia/Kolkata', now);
      let n = 0;
      for (const cal of cals) {
        // The last week, so a missed run catches up; the period key makes a repeat do nothing.
        const hols = await tx.holiday.findMany({ where: { organizationId: org, calendarId: cal.id, holidayOn: { gte: asDate(addDays(today, -7)), lte: asDate(today) }, kind: { in: ['national', 'state', 'festival'] }, halfDay: false } });
        const ruleOn = await rulesFor(tx, org, cal.locationId!, today);
        for (const h of hols) {
          const on = dateOf(h.holidayOn);
          if (!isWeeklyOff(on, ruleOn(on).weeklyOffs)) continue;
          const people = await tx.$queryRaw<{ id: string }[]>`
            SELECT DISTINCT a.employee_id::text AS id FROM employee_assignments a
            WHERE a.organization_id = ${org}::uuid AND a.superseded_at IS NULL AND a.location_id = ${cal.locationId}::uuid AND ${on}::date <@ daterange(a.valid_from, a.valid_to, '[]')`;
          if (!people.length) continue;
          n += (await tx.leaveLedgerEntry.createMany({ data: people.map((p) => ({ organizationId: org, employeeId: p.id, leaveTypeId: t.id, entryOn: h.holidayOn, kind: 'comp_off', days: 1, periodKey: `hw:${h.id}`, reason: `${h.name} on ${fmt(on)} fell on a weekly off` })), skipDuplicates: true })).count;
        }
      }
      if (n) await audit(tx, c, 'leave.comp_off.holiday_on_weekly_off', 'leave_ledger', org, { entries: n });
      return n;
    });
  }

  /** People whose leave went back to the balance because the day became a holiday (after the transaction). */
  async tellHolidayAdded(ctx: TenantContext, told: { userId: string; on: string; requestId: string }[]) {
    for (const t of told) {
      const text = `${fmt(t.on)} is now a public holiday, so your leave that day went back to your balance.`;
      await this.notifications.notifySystem(ctx, [t.userId], 'leave.holiday_added', { entityType: 'leave_request', entityId: t.requestId, contextText: text, linkPath: '/yx/time/leave' }, { subject: 'Your leave day is now a holiday', html: `<p>${escapeHtml(text)}</p>` });
    }
  }

  /** A holiday was added on `on`: leave already on that date goes back to the balance; returns how many days. */
  async holidayAdded(tx: Tx, c: CompanyContext, calendarId: string, on: string, holidayName: string, told: { userId: string; on: string; requestId: string }[]): Promise<number> {
    const org = c.organizationId;
    let returned = 0;
    for (const d of await this.leaveOnDate(tx, org, calendarId, on)) {
      await tx.leaveRequestDay.update({ where: { organizationId_requestId_leaveOn: { organizationId: org, requestId: d.requestId, leaveOn: asDate(on) } }, data: { portion: 0, countedAs: 'holiday' } });
      const before = await tx.leaveRequest.findFirstOrThrow({ where: { id: d.requestId } });
      if (num(before.days) - d.portion > 0) await tx.leaveRequest.update({ where: { id: d.requestId }, data: { days: { decrement: d.portion }, version: { increment: 1 }, updatedAt: new Date() } });
      else {
        // Every day of the request is now a holiday: nothing is left to take, so it ends (a waiting one is withdrawn).
        if (d.status === 'pending' && before.wfRequestId) await this.engine.withdraw(tx, c, before.wfRequestId, c.userId ?? null, 'Every day of this leave is now a public holiday');
        await tx.leaveRequest.update({ where: { id: d.requestId }, data: { status: d.status === 'pending' ? 'withdrawn' : 'cancelled', decidedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
        await tx.leaveRequestDay.updateMany({ where: { organizationId: org, requestId: d.requestId }, data: { active: false } });
      }
      if (d.status !== 'pending' && hasBalance(d.kind)) {
        const req = await tx.leaveRequest.findFirstOrThrow({ where: { id: d.requestId } });
        await tx.leaveLedgerEntry.createMany({ data: [{ organizationId: org, employeeId: d.employeeId, leaveTypeId: req.leaveTypeId, entryOn: asDate(on), kind: 'cancelled', days: d.portion, requestId: d.requestId, periodKey: `h:${on}:${d.requestId.slice(0, 24)}`, reason: `${holidayName} on ${fmt(on)} is now a holiday` }], skipDuplicates: true });
      }
      await this.dayEngine.evaluate(tx, c, d.employeeId, on, on);
      returned += 1;
      if (d.userId) told.push({ userId: d.userId, on, requestId: d.requestId });
    }
    return returned;
  }
}

type Liability = { types: { id: string; name: string }[]; money: boolean; rows: { name: string; code: string | null; location: string | null; department: string | null; values: Record<string, number>; days: number; dailyPay?: number | null; amount?: number | null; noPay?: boolean }[] };
/** The liability CSV: money columns only for a viewer who may see pay; a row outside their pay scope stays blank. */
function liabilityCsv(out: Liability): (string | number | null)[][] {
  const head = ['Employee', 'Code', 'Location', 'Department', ...out.types.map((t) => `${t.name} days`), 'Days', ...(out.money ? ['Daily pay', 'Amount'] : [])];
  return [head, ...out.rows.map((r) => [r.name, r.code, r.location, r.department, ...out.types.map((t) => r.values[t.id] ?? 0), r.days, ...(out.money ? (r.noPay ? ['No pay set', 'No pay set'] : [r.dailyPay ?? null, r.amount ?? null]) : [])])];
}
