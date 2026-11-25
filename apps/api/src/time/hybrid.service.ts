import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { SETTINGS, resolveSetting } from '../org-structure/settings-registry';
import { Viewer, buildViewer, has, implicitSql, tenantWide, type ScopeUser } from '../access/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { escapeHtml } from '../notifications/notification-email-render';
import { CLOSED_TEXT, WEEKDAY_NAMES, closedWhy, isEvidence, ruleOf, weekCompliance, type Closed, type DayFacts, type HybridRule, type Place } from './hybrid-rules';
import type { PlanDto } from './hybrid-prefill.dto';
import { ScheduleBook } from './schedule';
import { TIME_KEYS, asDate, dateOf, factsOn, holidaysFor, leaveDays, mustSee, todayIn, visibleSql, type Facts } from './time-core';
import { addDays } from './time-maths';
import { mondayOf } from './time-rules';

// TIM-41 Hybrid office days (design-map rule 12). Each person plans office / home for the working days (Mon–Fri, not a
// weekly off, holiday or leave day) of this week and next, until the day starts in their location's zone; anchor days
// are always office days. A week is met when the office days with evidence (an accepted punch inside a geofence, from
// the office network, or at a kiosk, as hybrid.evidence says) plus full leave days reach hybrid.office_days.
//   Who: plan = the person themselves, their manager (implicit team) or roster.manage in scope, never while acting for
//   someone; the team grid = the manager's own team; compliance = the team or attendance.view in scope; the policy =
//   org.settings.manage (it is written through PUT /org/settings). No pay link (product question).

const KEYS = ['hybrid.office_days', 'hybrid.anchor_days', 'hybrid.evidence'] as const;
type Key = (typeof KEYS)[number];
const MAX_PEOPLE = 200;
const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const weekdayOf = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;

export interface PlanDay {
  on: string;
  /** Office on an anchor day whatever is stored; null: not planned yet. */
  place: Place | null;
  anchor: boolean;
  closed: Closed | null;
  /** The holiday's name, or the leave half. */
  note: string | null;
}

/** Settings for many people with one read (YX-ORG-18: most specific scope wins). */
async function rules(tx: Tx, c: CompanyContext) {
  const rows = await tx.setting.findMany({ where: { organizationId: c.organizationId, key: { in: [...KEYS] } } });
  const get = (key: Key, f: Facts) =>
    String(
      resolveSetting(
        SETTINGS[key],
        rows.filter((r) => r.key === key).map((r) => ({ id: r.id, scopeType: r.scopeType, scopeId: r.scopeId, value: r.value, validFrom: r.validFrom ? dateOf(r.validFrom) : null })),
        { tenant: c.organizationId, employee: f.employeeId, designation: f.designationId, grade: f.gradeId ?? undefined, employment_type: f.employmentTypeId, department: f.departmentId, location: f.locationId, legal_entity: f.legalEntityId },
        null,
      ).value,
    );
  return { rows, of: (f: Facts): HybridRule => ruleOf(get('hybrid.office_days', f), get('hybrid.anchor_days', f), get('hybrid.evidence', f)) };
}

@Injectable()
export class HybridService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private viewer(user: ScopeUser): Promise<Viewer> {
    return buildViewer(this.prisma, this.tenantPrisma, user, [...TIME_KEYS, 'org.settings.manage']);
  }

  private async ownId(tx: Tx, c: CompanyContext, v: Viewer) {
    if (!v.userId || v.actingForOther) return null;
    return (await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: v.userId }, select: { id: true } }))?.id ?? null;
  }

  /** People employed today the viewer reaches (never themselves): the implicit team, or with `key` also a grant in scope. */
  private async reach(tx: Tx, c: CompanyContext, v: Viewer, own: string | null, key: 'attendance.view' | null, today: string, limit = MAX_PEOPLE) {
    const cond = key ? await visibleSql(tx, c, v, own, key, Prisma.sql`e.id`, today) : await implicitSql(tx, c, own, Prisma.sql`e.id`, Prisma.sql`${today}::date`);
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT e.id::text FROM employees e
      JOIN employee_assignments a ON a.organization_id = e.organization_id AND a.employee_id = e.id AND a.superseded_at IS NULL AND ${today}::date <@ daterange(a.valid_from, a.valid_to, '[]')
      JOIN employments m ON m.organization_id = e.organization_id AND m.id = a.employment_id AND (m.exited_on IS NULL OR m.exited_on >= ${today}::date)
      WHERE e.organization_id = ${c.organizationId}::uuid AND (${own}::uuid IS NULL OR e.id <> ${own}::uuid) AND ${cond}
      GROUP BY 1 ORDER BY 1 LIMIT ${limit}`;
    return rows.map((r) => r.id);
  }

  /** This week's Monday and next week's, in the person's zone. */
  private weeks(f: Facts) {
    const today = todayIn(f.zone);
    const now = mondayOf(today);
    return { today, now, next: addDays(now, 7) };
  }

  /** Mon–Fri of a week for one person: employed, weekly off (roster, pattern or location), full holiday, leave. */
  private async dayFacts(tx: Tx, org: string, f: Facts, book: ScheduleBook, week: string): Promise<DayFacts[]> {
    const to = addDays(week, 4);
    // shortcut: the location of today stands for the whole week; a transfer mid-week uses the old calendar until it starts.
    const [hol, leave] = await Promise.all([holidaysFor(tx, org, f.locationId, week, to, f.employeeId), leaveDays(tx, org, f.employeeId, week, to)]);
    const out: DayFacts[] = [];
    for (let k = 0; k < 5; k++) {
      const on = addDays(week, k);
      const h = hol.map.get(on);
      out.push({ on, employed: on >= f.joinedOn && (!f.exitedOn || on <= f.exitedOn), weeklyOff: (await book.day(f, on)).weeklyOff, holiday: h && !h.halfDay ? h.name : null, leave: leave.get(on) ?? null });
    }
    return out;
  }

  private async planDays(tx: Tx, org: string, f: Facts, rule: HybridRule, book: ScheduleBook, week: string): Promise<PlanDay[]> {
    const today = todayIn(f.zone);
    const [facts, rows] = await Promise.all([
      this.dayFacts(tx, org, f, book, week),
      tx.hybridPlanDay.findMany({ where: { organizationId: org, employeeId: f.employeeId, workOn: { gte: asDate(week), lte: asDate(addDays(week, 4)) } } }),
    ]);
    const stored = new Map(rows.map((r) => [dateOf(r.workOn), r.place as Place]));
    return facts.map((d, k) => {
      const anchor = rule.anchors.includes(k);
      return { on: d.on, place: anchor ? 'office' : (stored.get(d.on) ?? null), anchor, closed: closedWhy(d, today), note: d.holiday ?? (d.leave ? (d.leave === 'full' ? 'Leave' : `Leave, ${d.leave} half`) : null) };
    });
  }

  private async facts(tx: Tx, org: string, employeeId: string) {
    const f = await factsOn(tx, org, employeeId, todayIst());
    if (!f) throw new BadRequestException('This person has no job assignment today.');
    return f;
  }

  /** A week that may be shown or planned: this week or next (Monday). */
  private planWeek(f: Facts, weekIn?: string) {
    const w = this.weeks(f);
    const week = weekIn ? mondayOf(weekIn) : w.now;
    if (week !== w.now && week !== w.next) throw new BadRequestException('Plans are for this week and next week. Earlier weeks are in Compliance.');
    return { ...w, week };
  }

  // ------------------------------------------------------------------------------------------ me

  /** My plan for this or next week, the rule, who else in my team is in, and which tabs I may open. */
  me(ctx: TenantContext, user: ScopeUser, weekIn?: string) {
    return this.viewer(user).then((v) =>
      inCompany(this.tenantPrisma, ctx, async (tx, c) => {
        const org = c.organizationId;
        const own = await this.ownId(tx, c, v);
        const today = todayIst();
        const team = own ? (await this.reach(tx, c, v, own, null, today, 1)).length > 0 : false;
        // everyone: compliance reaches the whole company (the page title says "Everyone", not "Your team").
        const can = { team, compliance: team || has(v, 'attendance.view'), policy: has(v, 'org.settings.manage') && !v.actingForOther, everyone: tenantWide(v, 'attendance.view') };
        const f = own ? await factsOn(tx, org, own, today) : null;
        if (!f) {
          const week = weekIn ? mondayOf(weekIn) : mondayOf(today);
          return { employee: null, today, week, thisWeek: mondayOf(today), nextWeek: addDays(mondayOf(today), 7), rule: null, days: [], colleagues: [], can };
        }
        const w = this.planWeek(f, weekIn);
        const rule = (await rules(tx, c)).of(f);
        const book = await ScheduleBook.load(tx, org);
        await book.prime([f.employeeId], w.week, addDays(w.week, 4));
        const days = await this.planDays(tx, org, f, rule, book, w.week);
        // Colleagues: the same manager today; only their names on the days they plan the office.
        const mates = f.managerEmployeeId
          ? await tx.$queryRaw<{ on: string; name: string }[]>`
              SELECT p.work_on::text AS on, concat_ws(' ', coalesce(e.preferred_name, e.given_name), e.family_name) AS name
              FROM hybrid_plan_days p
              JOIN employees e ON e.organization_id = p.organization_id AND e.id = p.employee_id
              JOIN employee_assignments a ON a.organization_id = e.organization_id AND a.employee_id = e.id AND a.superseded_at IS NULL AND ${today}::date <@ daterange(a.valid_from, a.valid_to, '[]')
              WHERE p.organization_id = ${org}::uuid AND p.place = 'office' AND p.employee_id <> ${f.employeeId}::uuid
                AND a.manager_employee_id = ${f.managerEmployeeId}::uuid AND p.work_on BETWEEN ${w.week}::date AND ${addDays(w.week, 4)}::date
              ORDER BY 2 LIMIT 500`
          : [];
        return {
          employee: { id: f.employeeId, name: f.name },
          today: w.today,
          week: w.week,
          thisWeek: w.now,
          nextWeek: w.next,
          rule,
          days,
          colleagues: days.map((d) => ({ on: d.on, names: mates.filter((m) => m.on === d.on).map((m) => m.name) })),
          can,
        };
      }),
    );
  }

  // ------------------------------------------------------------------------------------------ plan (me, or my team)

  async plan(ctx: TenantContext, user: ScopeUser, dto: PlanDto) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await this.ownId(tx, c, v);
      const employeeId = dto.employeeId ?? own;
      if (!employeeId) throw new BadRequestException('You have no employee record in this company. Ask HR to link your login.');
      // Another company's or an unreachable person: 404, the same as an unknown id.
      const who = employeeId === own ? 'self' : await mustSee(tx, c, v, own, 'roster.manage', employeeId, todayIst());
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`hybrid:${org}:${employeeId}`}))`;
      const f = await this.facts(tx, org, employeeId);
      const rule = (await rules(tx, c)).of(f);
      if (!rule.officeDays) throw new ConflictException(who === 'self' ? 'You have no office-day rule, so there is nothing to plan.' : `${f.name} has no office-day rule, so there is nothing to plan.`);
      const w = this.weeks(f);
      const dates = dto.days.map((d) => d.on);
      if (new Set(dates).size !== dates.length) throw new BadRequestException('Each day appears once.');
      const weeks = [...new Set(dates.map(mondayOf))];
      if (weeks.some((x) => x !== w.now && x !== w.next)) throw new BadRequestException('Plan days of this week and next week only.');
      const book = await ScheduleBook.load(tx, org);
      await book.prime([employeeId], w.now, addDays(w.next, 4));
      const facts = new Map<string, DayFacts>();
      for (const wk of weeks) for (const d of await this.dayFacts(tx, org, f, book, wk)) facts.set(d.on, d);
      for (const d of dto.days) {
        const k = weekdayOf(d.on);
        if (k > 4) throw new BadRequestException(`${fmt(d.on)} is a ${k === 5 ? 'Saturday' : 'Sunday'}. Plan Monday to Friday.`);
        const why = closedWhy(facts.get(d.on)!, w.today);
        if (why) throw new BadRequestException(`${fmt(d.on)}: ${who === 'self' ? CLOSED_TEXT[why] : CLOSED_TEXT[why].replace('You are', `${f.name} is`)}`);
        if (d.place === 'home' && rule.anchors.includes(k)) throw new BadRequestException(`${WEEKDAY_NAMES[k]} is an anchor day: everyone is in the office.`);
      }
      const before = new Map((await tx.hybridPlanDay.findMany({ where: { organizationId: org, employeeId, workOn: { in: dates.map(asDate) } } })).map((r) => [dateOf(r.workOn), r.place]));
      const changed = dto.days.filter((d) => before.get(d.on) !== d.place);
      for (const d of changed) {
        await tx.hybridPlanDay.upsert({
          where: { organizationId_employeeId_workOn: { organizationId: org, employeeId, workOn: asDate(d.on) } },
          create: { organizationId: org, employeeId, workOn: asDate(d.on), place: d.place, updatedBy: c.userId ?? null },
          update: { place: d.place, updatedBy: c.userId ?? null, updatedAt: new Date() },
        });
      }
      // A repeat with nothing new changes nothing and records nothing.
      if (changed.length) await audit(tx, c, 'time.hybrid.planned', 'employee', employeeId, { by: who, days: changed.map((d) => ({ on: d.on, from: before.get(d.on) ?? null, to: d.place })) });
      return { employeeId, changed: changed.length };
    });
  }

  // ------------------------------------------------------------------------------------------ the team plan (manager)

  /** The manager's own team (implicit) for this or next week: each person's rule and days. */
  team(ctx: TenantContext, user: ScopeUser, weekIn?: string) {
    return this.viewer(user).then((v) =>
      inCompany(this.tenantPrisma, ctx, async (tx, c) => {
        const org = c.organizationId;
        const own = await this.ownId(tx, c, v);
        const today = todayIst();
        const ids = own ? await this.reach(tx, c, v, own, null, today) : [];
        if (!ids.length) throw new ForbiddenException('The team plan is for managers. You have no one reporting to you.');
        const week = weekIn ? mondayOf(weekIn) : mondayOf(today);
        if (week !== mondayOf(today) && week !== addDays(mondayOf(today), 7)) throw new BadRequestException('Plans are for this week and next week. Earlier weeks are in Compliance.');
        const r = await rules(tx, c);
        const book = await ScheduleBook.load(tx, org);
        await book.prime(ids, week, addDays(week, 4));
        const people = [];
        for (const id of ids) {
          const f = await factsOn(tx, org, id, today);
          if (!f) continue;
          const rule = r.of(f);
          people.push({ employeeId: id, name: f.name, rule, days: await this.planDays(tx, org, f, rule, book, week) });
        }
        return { week, people: people.sort((a, b) => a.name.localeCompare(b.name)) };
      }),
    );
  }

  // ------------------------------------------------------------------------------------------ compliance (manager, HR)

  compliance(ctx: TenantContext, user: ScopeUser, weekIn?: string) {
    return this.viewer(user).then((v) =>
      inCompany(this.tenantPrisma, ctx, async (tx, c) => {
        const org = c.organizationId;
        const today = todayIst();
        const week = weekIn ? mondayOf(weekIn) : addDays(mondayOf(today), -7);
        if (week > mondayOf(today)) throw new BadRequestException('Compliance is for weeks that have started.');
        if (week < addDays(mondayOf(today), -7 * 53)) throw new BadRequestException('Compliance goes back one year.');
        const own = await this.ownId(tx, c, v);
        const ids = await this.reach(tx, c, v, own, 'attendance.view', today);
        if (!ids.length && !has(v, 'attendance.view')) throw new ForbiddenException('Compliance is for managers and HR.');
        const to = addDays(week, 4);
        const r = await rules(tx, c);
        const book = await ScheduleBook.load(tx, org);
        await book.prime(ids, week, to);
        const [plans, punches] = await Promise.all([
          tx.hybridPlanDay.findMany({ where: { organizationId: org, employeeId: { in: ids }, workOn: { gte: asDate(week), lte: asDate(to) } } }),
          tx.punch.findMany({ where: { organizationId: org, employeeId: { in: ids }, accepted: true, workOn: { gte: asDate(week), lte: asDate(to) } }, select: { employeeId: true, workOn: true, source: true, verdict: true } }),
        ]);
        const rows = [];
        for (const id of ids) {
          const f = (await factsOn(tx, org, id, week)) ?? (await factsOn(tx, org, id, today));
          if (!f) continue;
          const rule = r.of(f);
          const pzToday = todayIn(f.zone);
          const placed = new Map(plans.filter((p) => p.employeeId === id).map((p) => [dateOf(p.workOn), p.place as Place]));
          const seen = new Set(punches.filter((p) => p.employeeId === id && isEvidence(p, rule.evidence)).map((p) => dateOf(p.workOn)));
          const days = (await this.dayFacts(tx, org, f, book, week)).map((d, k) => ({ ...d, anchor: rule.anchors.includes(k), place: placed.get(d.on) ?? null, evidence: seen.has(d.on) }));
          rows.push({ employeeId: id, name: f.name, rule, ...weekCompliance(rule, days, pzToday) });
        }
        return { week, thisWeek: mondayOf(today), people: rows.sort((a, b) => a.name.localeCompare(b.name)) };
      }),
    );
  }

  // ------------------------------------------------------------------------------------------ remind (manager, HR)

  /** Reminds someone to plan their office days for a week; once a day per person, whoever sends it. */
  async remind(ctx: TenantContext, user: ScopeUser, employeeId: string, weekIn: string) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    const v = await this.viewer(user);
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      if ((await mustSee(tx, c, v, await this.ownId(tx, c, v), 'attendance.view', employeeId, todayIst())) === 'self') throw new ForbiddenException('Plan your own office days on this page.');
      const f = await this.facts(tx, org, employeeId);
      const w = this.weeks(f);
      const week = mondayOf(weekIn);
      if (week !== w.now && week !== w.next) throw new BadRequestException('Remind about this week or next week.');
      if (!(await rules(tx, c)).of(f).officeDays) throw new ConflictException(`${f.name} has no office-day rule.`);
      if (!f.userId) throw new ConflictException(`${f.name} has no login, so a reminder can't reach them.`);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`nudge:${org}:${employeeId}:${w.today}`}))`;
      if (await tx.nudge.findFirst({ where: { organizationId: org, employeeId, item: 'hybrid_plan', onDay: asDate(w.today) }, select: { id: true } })) throw new ConflictException(`${f.name} was already reminded today. You can remind them again tomorrow.`);
      const row = await tx.nudge.create({ data: { organizationId: org, employeeId, item: 'hybrid_plan', onDay: asDate(w.today), sentBy: c.userId! } });
      await audit(tx, c, 'time.hybrid.reminded', 'employee', employeeId, { week });
      const sender = (await tx.user.findFirst({ where: { organizationId: org, id: c.userId! }, select: { name: true } }))?.name || 'Your manager';
      return { id: row.id, userId: f.userId, name: f.name, sender, week };
    });
    const text = `${out.sender} reminded you to plan your office days for the week of ${fmt(out.week)}.`;
    await this.notifications.notifySystem(
      ctx,
      [out.userId],
      'nudge.reminder',
      { entityType: 'nudge', entityId: out.id, contextText: text, linkPath: '/yx/time/hybrid' },
      { subject: 'Reminder: plan your office days', html: `<p>${escapeHtml(text)}</p><p>Open YukthiX › My time › Office days.</p>` },
    );
    return { sent: true, to: out.name, week: out.week };
  }

  // ------------------------------------------------------------------------------------------ policy (HR, read)

  /**
   * The hybrid policy per group (company, legal entity, location, department): the values set on the group itself and
   * what applies there (the group's own value, else its legal entity's for a location, else the company's, else the
   * default). HR changes it through PUT /org/settings, which checks org.settings.manage over the group.
   */
  policy(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const [{ rows }, entities, locations, departments] = await Promise.all([
        rules(tx, c),
        tx.legalEntity.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        tx.location.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true, name: true, legalEntityId: true }, orderBy: { name: 'asc' } }),
        tx.department.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      ]);
      const own = (key: Key, scopeType: string, scopeId: string) => { const r = rows.find((x) => x.key === key && x.scopeType === scopeType && x.scopeId === scopeId); return r ? String(r.value) : null; };
      const values = (scopeType: string, scopeId: string) => ({ officeDays: own('hybrid.office_days', scopeType, scopeId), anchors: own('hybrid.anchor_days', scopeType, scopeId), evidence: own('hybrid.evidence', scopeType, scopeId) });
      const pick = (key: Key, chain: [string, string][]) => chain.map(([t, id]) => own(key, t, id)).find((x) => x !== null) ?? String(SETTINGS[key].default);
      const applies = (chain: [string, string][]) => ruleOf(pick('hybrid.office_days', chain), pick('hybrid.anchor_days', chain), pick('hybrid.evidence', chain));
      const company: [string, string] = ['tenant', org];
      const groups = [
        { scopeType: 'tenant', scopeId: null as string | null, label: 'Whole company', own: values('tenant', org), applies: applies([company]) },
        ...entities.map((e) => ({ scopeType: 'legal_entity', scopeId: e.id, label: `${e.name} · legal entity`, own: values('legal_entity', e.id), applies: applies([['legal_entity', e.id], company]) })),
        ...locations.map((l) => ({ scopeType: 'location', scopeId: l.id, label: `${l.name} · location`, own: values('location', l.id), applies: applies([['location', l.id], ['legal_entity', l.legalEntityId], company]) })),
        ...departments.map((d) => ({ scopeType: 'department', scopeId: d.id, label: `${d.name} · department`, own: values('department', d.id), applies: applies([['department', d.id], company]) })),
      ];
      return { groups };
    });
  }
}
