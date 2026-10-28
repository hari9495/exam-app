import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { CompanyContext, Tx, audit } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import type { ScopeUser } from '../access/scope';
import { TimeSetupService } from './setup.service';
import { asDate, dateOf } from './time-core';
import { addDays } from './time-maths';
import { daysTo } from './roster-rules';
import { EmployeeLicenceDto, LicenceOverrideDto, LicenceRequirementDto, LicenceTypeDto, RenewAskDto } from './roster-ops.dto';

// TIM-40 licence requirements (feature sheet rule 8): licence types, where they are required (a shift or a role, at all or
// one location), each person's licences with expiry, company-licence overrides with a reason, "ask to renew" (once a day
// per person) and reminders before expiry (once per lead time, safe to re-run). The roster guard (roster-guard.ts) reads
// the same rows on every placement. Company-wide set-up: leave.settings.manage held for the whole company.

const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
/** Overrides of a company licence last at most this long; renewing is the fix. */
const OVERRIDE_MAX_DAYS = 90;

@Injectable()
export class LicencesService {
  constructor(
    private readonly setup: TimeSetupService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Every licence type with its requirements, holders and the people needing action (expired or inside the first reminder). */
  overview(ctx: TenantContext, user: ScopeUser) {
    return this.setup.run(ctx, user, false, async (tx, c) => {
      const org = c.organizationId;
      const today = todayIst();
      const [types, reqs, held, overrides, shifts, designations, locations, people] = await Promise.all([
        tx.licenceType.findMany({ where: { organizationId: org }, orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
        tx.shiftLicenceRequirement.findMany({ where: { organizationId: org } }),
        tx.employeeLicence.findMany({ where: { organizationId: org, removedAt: null }, orderBy: { validFrom: 'desc' } }),
        tx.licenceOverride.findMany({ where: { organizationId: org, until: { gte: asDate(today) } }, orderBy: { createdAt: 'desc' } }),
        tx.shift.findMany({ where: { organizationId: org }, select: { id: true, code: true, name: true, active: true }, orderBy: { code: 'asc' } }),
        tx.designation.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        tx.location.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        tx.$queryRaw<{ id: string; name: string; code: string | null }[]>`
          SELECT e.id::text, concat_ws(' ', coalesce(e.preferred_name, e.given_name), e.family_name) AS name, m.employee_code::text AS code
          FROM employees e JOIN employments m ON m.organization_id = e.organization_id AND m.employee_id = e.id AND m.exited_on IS NULL
          WHERE e.organization_id = ${org}::uuid ORDER BY 2 LIMIT 2000`,
      ]);
      const names = new Map(people.map((p) => [p.id, p.name]));
      return {
        today,
        types: types.map((t) => {
          // Each person's latest licence of the type decides (a renewal replaces the old one).
          const latest = new Map<string, (typeof held)[number]>();
          for (const h of held.filter((x) => x.licenceTypeId === t.id)) if (!latest.has(h.employeeId)) latest.set(h.employeeId, h);
          const window = Math.max(...t.remindDays, 0);
          const watch = [...latest.values()]
            .filter((h) => h.expiresOn && daysTo(today, dateOf(h.expiresOn)) <= window)
            .map((h) => {
              const o = overrides.find((x) => x.employeeId === h.employeeId && x.licenceTypeId === t.id);
              return { employeeId: h.employeeId, name: names.get(h.employeeId) ?? 'Former employee', expiresOn: dateOf(h.expiresOn!), number: h.number, override: !t.legal && o ? { until: dateOf(o.until), reason: o.reason } : null };
            })
            .filter((w) => names.has(w.employeeId))
            .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
          return {
            id: t.id,
            code: t.code,
            name: t.name,
            note: t.note,
            legal: t.legal,
            remindDays: [...t.remindDays].sort((a, b) => b - a),
            active: t.active,
            version: t.version,
            holders: [...latest.values()].filter((h) => names.has(h.employeeId) && (!h.expiresOn || dateOf(h.expiresOn) >= today)).length,
            requirements: reqs
              .filter((r) => r.licenceTypeId === t.id)
              .map((r) => ({ id: r.id, kind: r.shiftId ? ('shift' as const) : ('role' as const), targetId: (r.shiftId ?? r.designationId)!, target: r.shiftId ? (shifts.find((s) => s.id === r.shiftId)?.name ?? '') : (designations.find((d) => d.id === r.designationId)?.name ?? ''), locationId: r.locationId, location: r.locationId ? (locations.find((l) => l.id === r.locationId)?.name ?? '') : null })),
            watch,
          };
        }),
        shifts: shifts.filter((s) => s.active).map(({ id, code, name }) => ({ id, code, name })),
        designations,
        locations,
        people,
      };
    });
  }

  private async type(tx: Tx, c: CompanyContext, id: string) {
    const t = await tx.licenceType.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!t) throw new NotFoundException('No such licence.');
    return t;
  }

  private checkRemind(days: number[]) {
    if (new Set(days).size !== days.length) throw new BadRequestException('Each reminder is on a different day.');
  }

  createType(ctx: TenantContext, user: ScopeUser, dto: LicenceTypeDto) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      this.checkRemind(dto.remindDays);
      if (await tx.licenceType.findFirst({ where: { organizationId: c.organizationId, code: dto.code } })) throw new ConflictException(`The code ${dto.code} is already used.`);
      const t = await tx.licenceType.create({ data: { organizationId: c.organizationId, code: dto.code, name: dto.name, note: dto.note || null, legal: dto.legal, remindDays: dto.remindDays, createdBy: c.userId ?? null } });
      await audit(tx, c, 'time.licence_type.created', 'licence_type', t.id, { code: dto.code, name: dto.name, legal: dto.legal, remindDays: dto.remindDays });
      return { id: t.id };
    });
  }

  /** Edits name, note, type and reminders (the code stays); `version` stops two HR people overwriting each other. */
  updateType(ctx: TenantContext, user: ScopeUser, id: string, dto: Omit<LicenceTypeDto, 'code'> & { version: number; active: boolean }) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      this.checkRemind(dto.remindDays);
      const t = await this.type(tx, c, id);
      const n = await tx.licenceType.updateMany({ where: { organizationId: c.organizationId, id, version: dto.version }, data: { name: dto.name, note: dto.note || null, legal: dto.legal, remindDays: dto.remindDays, active: dto.active, version: { increment: 1 } } });
      if (!n.count) throw new ConflictException('Someone else changed this licence. Reload to see their change.');
      await audit(tx, c, 'time.licence_type.changed', 'licence_type', id, { from: { name: t.name, note: t.note, legal: t.legal, remindDays: t.remindDays, active: t.active }, to: { name: dto.name, note: dto.note ?? null, legal: dto.legal, remindDays: dto.remindDays, active: dto.active } });
      return { id };
    });
  }

  addRequirement(ctx: TenantContext, user: ScopeUser, dto: LicenceRequirementDto) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      const org = c.organizationId;
      await this.type(tx, c, dto.licenceTypeId);
      const target = dto.kind === 'shift' ? await tx.shift.findFirst({ where: { organizationId: org, id: dto.targetId } }) : await tx.designation.findFirst({ where: { organizationId: org, id: dto.targetId } });
      if (!target) throw new NotFoundException(dto.kind === 'shift' ? 'No such shift.' : 'No such role.');
      if (dto.locationId && !(await tx.location.findFirst({ where: { organizationId: org, id: dto.locationId } }))) throw new NotFoundException('No such location.');
      const key = { organizationId: org, licenceTypeId: dto.licenceTypeId, shiftId: dto.kind === 'shift' ? dto.targetId : null, designationId: dto.kind === 'role' ? dto.targetId : null, locationId: dto.locationId ?? null };
      if (await tx.shiftLicenceRequirement.findFirst({ where: key })) throw new ConflictException('That requirement is already there.');
      const r = await tx.shiftLicenceRequirement.create({ data: { ...key, createdBy: c.userId ?? null } });
      await audit(tx, c, 'time.licence_requirement.added', 'licence_type', dto.licenceTypeId, { kind: dto.kind, targetId: dto.targetId, locationId: dto.locationId ?? null });
      return { id: r.id };
    });
  }

  removeRequirement(ctx: TenantContext, user: ScopeUser, id: string) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      const r = await tx.shiftLicenceRequirement.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!r) throw new NotFoundException('No such requirement.');
      await tx.shiftLicenceRequirement.delete({ where: { id } });
      await audit(tx, c, 'time.licence_requirement.removed', 'licence_type', r.licenceTypeId, { shiftId: r.shiftId, designationId: r.designationId, locationId: r.locationId });
      return { id };
    });
  }

  /** A person's licence (a renewal is a new record; the latest counts). */
  recordLicence(ctx: TenantContext, user: ScopeUser, dto: EmployeeLicenceDto) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      const org = c.organizationId;
      await this.type(tx, c, dto.licenceTypeId);
      if (!(await tx.employee.findFirst({ where: { organizationId: org, id: dto.employeeId }, select: { id: true } }))) throw new NotFoundException('No such person.');
      if (dto.expiresOn && dto.expiresOn < dto.validFrom) throw new BadRequestException('A licence expires after it starts.');
      if (dto.validFrom > addDays(todayIst(), 365)) throw new BadRequestException('A licence starts within a year from today.');
      const same = await tx.employeeLicence.findFirst({ where: { organizationId: org, employeeId: dto.employeeId, licenceTypeId: dto.licenceTypeId, validFrom: asDate(dto.validFrom), removedAt: null } });
      if (same) throw new ConflictException('This licence is already recorded from that date.');
      const x = await tx.employeeLicence.create({ data: { organizationId: org, employeeId: dto.employeeId, licenceTypeId: dto.licenceTypeId, number: dto.number || null, validFrom: asDate(dto.validFrom), expiresOn: dto.expiresOn ? asDate(dto.expiresOn) : null, recordedBy: c.userId ?? null } });
      await audit(tx, c, 'time.licence.recorded', 'employee', dto.employeeId, { licenceTypeId: dto.licenceTypeId, validFrom: dto.validFrom, expiresOn: dto.expiresOn ?? null });
      return { id: x.id };
    });
  }

  /** HR lets a person with an expired COMPANY licence be rostered for a while, with a reason; never a legal licence. */
  override(ctx: TenantContext, user: ScopeUser, dto: LicenceOverrideDto) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      const org = c.organizationId;
      const t = await this.type(tx, c, dto.licenceTypeId);
      if (t.legal) throw new ConflictException({ statusCode: 409, code: 'LEGAL_LICENCE', message: `${t.name} is required by law. No one can override it; the person needs a valid licence.` });
      if (!(await tx.employee.findFirst({ where: { organizationId: org, id: dto.employeeId }, select: { id: true } }))) throw new NotFoundException('No such person.');
      const today = todayIst();
      if (dto.until < today || dto.until > addDays(today, OVERRIDE_MAX_DAYS)) throw new BadRequestException(`An override lasts from today up to ${OVERRIDE_MAX_DAYS} days.`);
      const o = await tx.licenceOverride.create({ data: { organizationId: org, employeeId: dto.employeeId, licenceTypeId: dto.licenceTypeId, reason: dto.reason, until: asDate(dto.until), createdBy: c.userId ?? null } });
      await audit(tx, c, 'time.licence.overridden', 'employee', dto.employeeId, { licenceTypeId: dto.licenceTypeId, until: dto.until, reason: dto.reason });
      return { id: o.id };
    });
  }

  /** "Ask to renew": each person once a day (whoever asks), told in the app and by email. */
  async askRenew(ctx: TenantContext, user: ScopeUser, dto: RenewAskDto) {
    const res = await this.setup.run(ctx, user, true, async (tx, c) => {
      const org = c.organizationId;
      const t = await this.type(tx, c, dto.licenceTypeId);
      const today = todayIst();
      const asked: { userId: string; name: string }[] = [];
      const skipped: string[] = [];
      for (const employeeId of [...new Set(dto.employeeIds)]) {
        const e = await tx.employee.findFirst({ where: { organizationId: org, id: employeeId }, select: { id: true, userId: true, givenName: true } });
        if (!e) throw new NotFoundException('No such person.');
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`nudge:${org}:${employeeId}:licence:${today}`}))`;
        if (!e.userId || (await tx.nudge.findFirst({ where: { organizationId: org, employeeId, item: 'licence_renew', onDay: asDate(today) }, select: { id: true } }))) {
          skipped.push(employeeId);
          continue;
        }
        await tx.nudge.create({ data: { organizationId: org, employeeId, item: 'licence_renew', onDay: asDate(today), sentBy: c.userId! } });
        await audit(tx, c, 'time.licence.renew_asked', 'employee', employeeId, { licenceTypeId: t.id });
        asked.push({ userId: e.userId, name: e.givenName });
      }
      return { asked, skipped, licence: t.name };
    });
    for (const a of res.asked)
      await this.notifications
        .notifySystem(ctx, [a.userId], 'time.licence.expiring', { entityType: 'licence_type', entityId: dto.licenceTypeId, contextText: `Please renew your ${res.licence} and give HR the new one`, linkPath: '/yx/home' }, { subject: `Please renew your ${res.licence}`, html: `<p>Please renew your ${res.licence} and give the new licence to HR. Without a valid one you can't be rostered on work that needs it.</p>` })
        .catch(() => undefined);
    return { asked: res.asked.length, alreadyAskedToday: res.skipped.length };
  }

  /**
   * Reminders before expiry (rule 8): each person whose latest licence of a type expires in exactly one of the type's lead
   * days (or fewer, if a run was missed), once per lead time; safe to re-run (licence_reminders is the record).
   */
  async remind(org: string, today: string, tx: Tx, c: CompanyContext): Promise<{ userId: string; text: string }[]> {
    const types = await tx.licenceType.findMany({ where: { organizationId: org, active: true } });
    const out: { userId: string; text: string }[] = [];
    for (const t of types) {
      const held = await tx.employeeLicence.findMany({ where: { organizationId: org, licenceTypeId: t.id, removedAt: null, expiresOn: { gte: asDate(today), lte: asDate(addDays(today, Math.max(...t.remindDays, 0))) } }, orderBy: { validFrom: 'desc' } });
      const seen = new Set<string>();
      for (const h of held) {
        if (seen.has(h.employeeId)) continue;
        seen.add(h.employeeId);
        // A newer licence of the same type (a renewal) means no reminder.
        if (await tx.employeeLicence.findFirst({ where: { organizationId: org, employeeId: h.employeeId, licenceTypeId: t.id, removedAt: null, validFrom: { gt: h.validFrom } }, select: { id: true } })) continue;
        const left = daysTo(today, dateOf(h.expiresOn!));
        // The smallest lead time already reached: one reminder for it, even if earlier ones were missed.
        const due = [...t.remindDays].filter((d) => left <= d).sort((a, b) => a - b)[0];
        if (due === undefined) continue;
        const done = await tx.licenceReminder.createMany({ data: [{ organizationId: org, employeeLicenceId: h.id, daysBefore: due }], skipDuplicates: true });
        if (!done.count) continue;
        const e = await tx.employee.findFirst({ where: { organizationId: org, id: h.employeeId }, select: { userId: true } });
        await audit(tx, c, 'time.licence.reminded', 'employee', h.employeeId, { licenceTypeId: t.id, expiresOn: dateOf(h.expiresOn!), daysBefore: due });
        if (e?.userId) out.push({ userId: e.userId, text: `Your ${t.name} expires on ${fmt(dateOf(h.expiresOn!))}. Renew it and give HR the new one.` });
      }
    }
    return out;
  }

  /** Reminders for one company (the job runs this per company; also callable in tests). */
  async remindCompany(ctx: TenantContext, org: string, today = todayIst(), run: <T>(fn: (tx: Tx, c: CompanyContext) => Promise<T>) => Promise<T>) {
    const sent = await run(async (tx, c) => {
      const [lock] = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${`licence-remind:${org}`})) AS ok`;
      return lock?.ok ? this.remind(org, today, tx, c) : [];
    });
    for (const s of sent) await this.notifications.notifySystem(ctx, [s.userId], 'time.licence.expiring', { entityType: 'organization', entityId: org, contextText: s.text, linkPath: '/yx/home' }, { subject: 'Your licence expires soon', html: `<p>${s.text}</p>` }).catch(() => undefined);
    return sent.length;
  }
}
