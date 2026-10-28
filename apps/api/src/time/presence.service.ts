import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { Viewer, buildViewer, has, inEntitySql, type ScopeUser } from '../access/scope';
import { DayEngine } from './day-engine.service';
import { PresenceStateDto } from './ops-dto';
import { lockedDates } from './schedule';
import { TIME_KEYS, asDate, dateOf, factsOn, monthRange, myEmployeeId, settingOn, todayIn, visibleSql } from './time-core';
import { localDate, minutesInto } from './time-maths';
import { presenceDay } from './time-rules';

// TIM-36 presence-based attendance (29 Oct 2026). On an approved work-from-home day, a person who gave consent may let
// presence decide the day: the YukthiX desktop app (and, later, Teams presence: provider to decide) reports only presence
// states (active, idle, offline) with their times; never keystrokes, screens, apps, URLs, files, camera or microphone.
// The company turns it on (attendance.presence, default off); each person gives or withdraws consent at any time; a
// withdrawal holds from that day on and nothing more is read. The person sees their own times; their manager and HR see
// only the day's status and the total active time, never a timeline. HR also sees the consent record.

export const PRESENCE_NOTICE = 'Presence notice v1';
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

@Injectable()
export class PresenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly days: DayEngine,
  ) {}

  private viewer(user: ScopeUser): Promise<Viewer> {
    return buildViewer(this.prisma, this.tenantPrisma, user, [...TIME_KEYS]);
  }

  private async me(tx: Tx, c: CompanyContext) {
    const id = await myEmployeeId(tx, c.organizationId, c.userId);
    const f = await factsOn(tx, c.organizationId, id, new Date().toISOString().slice(0, 10));
    if (!f) throw new NotFoundException({ statusCode: 404, code: 'NO_EMPLOYEE_RECORD', message: 'You have no job assignment today. Ask HR to check your record.' });
    return f;
  }

  /** WFH days of the month for people, with their presence summary (and the person's own times when `own`). */
  private async daysOf(tx: Tx, c: CompanyContext, ids: string[], from: string, to: string, own: boolean) {
    const org = c.organizationId;
    if (!ids.length) return [];
    const [wfh, consents, signals, days, punches] = await Promise.all([
      tx.attendanceRequest.findMany({ where: { organizationId: org, employeeId: { in: ids }, kind: 'wfh', status: 'approved', workOn: { gte: asDate(from), lte: asDate(to) } }, orderBy: { workOn: 'desc' } }),
      tx.presenceConsent.findMany({ where: { organizationId: org, employeeId: { in: ids } }, orderBy: { givenAt: 'desc' } }),
      tx.presenceSignal.findMany({ where: { organizationId: org, employeeId: { in: ids }, workOn: { gte: asDate(from), lte: asDate(to) } } }),
      tx.attendanceDay.findMany({ where: { organizationId: org, employeeId: { in: ids }, workOn: { gte: asDate(from), lte: asDate(to) } } }),
      tx.punch.findMany({ where: { organizationId: org, employeeId: { in: ids }, accepted: true, workOn: { gte: asDate(from), lte: asDate(to) } }, orderBy: { punchedAt: 'asc' } }),
    ]);
    const out = [];
    for (const w of wfh) {
      const on = dateOf(w.workOn);
      const f = await factsOn(tx, org, w.employeeId, on);
      if (!f) continue;
      const end = new Date(asDate(on).getTime() + 86_400_000);
      const consent = consents.find((x) => x.employeeId === w.employeeId && x.givenAt < end && (!x.withdrawnAt || x.withdrawnAt >= end)) ?? null;
      const p = consent ? presenceDay(signals.filter((s) => s.employeeId === w.employeeId && dateOf(s.workOn) === on).map((s) => ({ at: s.at, state: s.state as 'active' }))) : null;
      const d = days.find((x) => x.employeeId === w.employeeId && dateOf(x.workOn) === on);
      const web = punches.filter((x) => x.employeeId === w.employeeId && dateOf(x.workOn) === on);
      const webIn = web.find((x) => x.kind === 'in');
      const webOut = [...web].reverse().find((x) => x.kind === 'out');
      out.push({
        id: `${w.employeeId}|${on}`,
        employeeId: w.employeeId,
        person: f.name,
        on,
        status: d?.status ?? null,
        byPresence: Boolean(consent && p && !webIn),
        activeMinutes: p?.activeMinutes ?? null,
        // First and last active are the person's own to see.
        first: own && p ? hhmm(minutesInto(on, f.zone, p.first)) : null,
        last: own && p ? hhmm(minutesInto(on, f.zone, p.last)) : null,
        webIn: webIn ? hhmm(minutesInto(on, f.zone, webIn.punchedAt)) : null,
        webOut: webOut ? hhmm(minutesInto(on, f.zone, webOut.punchedAt)) : null,
        consent: consent ? { givenAt: consent.givenAt, version: consent.noticeVersion } : null,
        withdrawnAt: consents.find((x) => x.employeeId === w.employeeId && x.withdrawnAt && x.withdrawnAt < end)?.withdrawnAt ?? null,
      });
    }
    return out;
  }

  /** Me: my consent and my work-from-home days of the month. */
  mine(ctx: TenantContext, month: string) {
    const { from, to } = monthRange(month);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const f = await this.me(tx, c);
      const consents = await tx.presenceConsent.findMany({ where: { organizationId: c.organizationId, employeeId: f.employeeId }, orderBy: { givenAt: 'desc' } });
      const today = todayIn(f.zone);
      return { month, today, enabled: (await settingOn(tx, c, 'attendance.presence', f, today)) === 'on', notice: PRESENCE_NOTICE, consent: consents.find((x) => !x.withdrawnAt) ?? null, history: consents, days: await this.daysOf(tx, c, [f.employeeId], from, to, true) };
    });
  }

  /** Team (manager) or HR (attendance.view): the day's status and total active time only; HR also gets the consent record. */
  team(ctx: TenantContext, user: ScopeUser, month: string, entityId?: string | null) {
    const { from, to } = monthRange(month);
    return this.viewer(user).then((v) =>
      inCompany(this.tenantPrisma, ctx, async (tx, c) => {
        const own = v.userId && !v.actingForOther ? ((await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: v.userId }, select: { id: true } }))?.id ?? null) : null;
        const rows = await tx.$queryRaw<{ id: string; dept: string }[]>`
          SELECT e.id::text, d.name::text AS dept FROM employees e
          JOIN employee_assignments a ON a.organization_id = e.organization_id AND a.employee_id = e.id AND a.superseded_at IS NULL AND ${to}::date <@ daterange(a.valid_from, a.valid_to, '[]')
          JOIN departments d ON d.organization_id = e.organization_id AND d.id = a.department_id
          WHERE e.organization_id = ${c.organizationId}::uuid AND (${own}::uuid IS NULL OR e.id <> ${own}::uuid)
            AND ${await visibleSql(tx, c, v, own, 'attendance.view', Prisma.sql`e.id`, to)}
            AND ${inEntitySql(c, entityId, Prisma.sql`e.id`, Prisma.sql`${from}::date`, Prisma.sql`${to}::date`)}
          LIMIT 2000`;
        const hr = has(v, 'attendance.view') && !v.actingForOther;
        const list = await this.daysOf(tx, c, rows.map((r) => r.id), from, to, false);
        return { month, scope: hr ? 'hr' : 'team', days: list.map((d) => ({ ...d, dept: rows.find((r) => r.id === d.employeeId)?.dept ?? '', consent: hr ? d.consent : d.consent ? { givenAt: null, version: null } : null, withdrawnAt: hr || d.withdrawnAt ? d.withdrawnAt : null })) };
      }),
    );
  }

  /** Gives or withdraws my consent (audited). Giving needs the company's switch on; a withdrawal holds from now on. */
  consent(ctx: TenantContext, user: ScopeUser, action: 'give' | 'withdraw') {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Only the person can give or withdraw their own consent.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const f = await this.me(tx, c);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`presence:${c.organizationId}:${f.employeeId}`}))`;
      const open = await tx.presenceConsent.findFirst({ where: { organizationId: c.organizationId, employeeId: f.employeeId, withdrawnAt: null } });
      if (action === 'give') {
        if ((await settingOn(tx, c, 'attendance.presence', f, todayIn(f.zone))) !== 'on') throw new ConflictException('Your company has not turned on presence-based attendance.');
        if (open) return { id: open.id, given: true, repeat: true };
        const row = await tx.presenceConsent.create({ data: { organizationId: c.organizationId, employeeId: f.employeeId, noticeVersion: PRESENCE_NOTICE } });
        await audit(tx, c, 'attendance.presence.consent_given', 'employee', f.employeeId, { notice: PRESENCE_NOTICE });
        return { id: row.id, given: true, repeat: false };
      }
      if (!open) throw new ConflictException('You have not given consent, so there is nothing to withdraw.');
      await tx.presenceConsent.update({ where: { id: open.id }, data: { withdrawnAt: new Date() } });
      await audit(tx, c, 'attendance.presence.consent_withdrawn', 'employee', f.employeeId, { notice: open.noticeVersion });
      return { id: open.id, given: false, repeat: false };
    });
  }

  /**
   * The desktop app reports my presence states. Only with consent in force and the company's switch on; times from the
   * last 24 hours, not in the future; repeats are ignored. A work-from-home day it touches is worked out again.
   */
  signals(ctx: TenantContext, user: ScopeUser, list: PresenceStateDto[]) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const f = await this.me(tx, c);
      if ((await settingOn(tx, c, 'attendance.presence', f, todayIn(f.zone))) !== 'on') throw new ConflictException('Your company has not turned on presence-based attendance.');
      if (!(await tx.presenceConsent.findFirst({ where: { organizationId: org, employeeId: f.employeeId, withdrawnAt: null }, select: { id: true } }))) throw new ForbiddenException('Give consent first: without it, no presence is recorded.');
      const now = Date.now();
      const rows = list.map((s) => ({ at: new Date(s.at), state: s.state }));
      if (rows.some((r) => r.at.getTime() > now + 5 * 60_000 || r.at.getTime() < now - 86_400_000)) throw new BadRequestException('Presence times must be from the last 24 hours.');
      const data = rows.map((r) => ({ organizationId: org, employeeId: f.employeeId, workOn: asDate(localDate(r.at, f.zone)), at: r.at, state: r.state, source: 'desktop_app' }));
      const dates = [...new Set(data.map((d) => dateOf(d.workOn)))].sort();
      const locked = await lockedDates(tx, org, f.employeeId, dates[0], dates[dates.length - 1]);
      const open = data.filter((d) => !locked.has(dateOf(d.workOn)));
      const r = open.length ? await tx.presenceSignal.createMany({ data: open, skipDuplicates: true }) : { count: 0 };
      for (const on of dates.filter((d) => !locked.has(d))) await this.days.evaluate(tx, c, f.employeeId, on, on);
      return { recorded: r.count, ignored: data.length - r.count };
    });
  }
}
