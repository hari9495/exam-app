import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { SETTINGS, resolveSetting } from '../org-structure/settings-registry';
import { Viewer, buildViewer, has, type ScopeUser } from '../access/scope';
import { UnplannedVisitDto, VisitCheckInDto, VisitCheckOutDto, VisitPlanDto, type PingBatchDto } from './field.dto';
import { MAX_DUTY_HOURS, MAX_LATE_HOURS, MAX_SKEW_MS, NOTICE_VERSION, dutyWindows, noticeFor, onDutyAt, pingFlags, trailKm, visitVerdict, type PingFlag } from './field-rules';
import { MAPS, type MapsProvider } from './providers/maps';
import { ScheduleBook } from './schedule';
import { TIME_KEYS, asDate, dateOf, factsOn, mustSee, myEmployeeId, todayIn, visibleSql, type Facts } from './time-core';
import { addDays, localDate, minutesInto } from './time-maths';

// Field force (TIM-32 map, TIM-33 visits and beat plan; design-map rule 15, DPDP Act 2023 s.4–6, s.8(7)).
//   - Tracking needs `field.tracking` on for the person, their open consent (notice version kept) and duty (an accepted
//     check-in with no check-out after it). Anything else is refused and never stored.
//   - Withdrawing consent stops tracking at once and erases the person's trail; attendance and visits are untouched.
//   - Integrity flags (mock location, impossible speed, poor accuracy, clock skew) are shown, never a penalty.
//   - Who: the map is the manager's own team (implicit) or attendance.view in scope; a beat plan is the manager's team or
//     roster.manage in scope, never one's own; everything "me" is the signed-in person, never while acting for someone.

const KEYS = ['field.tracking', 'field.ping_minutes', 'field.max_accuracy_m', 'field.trail_retention_days'] as const;
type Key = (typeof KEYS)[number];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const n = (d: Prisma.Decimal | number | null) => (d === null ? null : Number(d));
/** The flags a manager reviews (a weak fix or a phone clock alone is not worth a review). */
const REVIEWABLE: PingFlag[] = ['mock', 'speed'];
const MAX_VISITS_A_DAY = 50;
/** Readings left out of the distance, the live position and the speed reference: weak, impossible or fake. */
const SUSPECT: PingFlag[] = ['accuracy', 'speed', 'mock'];
const clean = (flags: readonly string[]) => !flags.some((f) => SUSPECT.includes(f as PingFlag));

type Visit = Prisma.FieldVisitGetPayload<object>;
type Ping = Prisma.LocationPingGetPayload<object>;

/** Settings for many people with one read (YX-ORG-18: most specific scope wins). */
async function settingsReader(tx: Tx, c: CompanyContext) {
  const rows = await tx.setting.findMany({ where: { organizationId: c.organizationId, key: { in: [...KEYS] } } });
  return (key: Key, f: Facts) =>
    String(
      resolveSetting(
        SETTINGS[key],
        rows.filter((r) => r.key === key).map((r) => ({ id: r.id, scopeType: r.scopeType, scopeId: r.scopeId, value: r.value, validFrom: r.validFrom ? dateOf(r.validFrom) : null })),
        { tenant: c.organizationId, employee: f.employeeId, designation: f.designationId, grade: f.gradeId ?? undefined, employment_type: f.employmentTypeId, department: f.departmentId, location: f.locationId, legal_entity: f.legalEntityId },
        null,
      ).value,
    );
}

@Injectable()
export class FieldService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    @Inject(MAPS) private readonly maps: MapsProvider,
  ) {}

  private viewer(user: ScopeUser): Promise<Viewer> {
    return buildViewer(this.prisma, this.tenantPrisma, user, [...TIME_KEYS]);
  }

  /** Only the person themselves, never someone acting for them. */
  private self(user: ScopeUser) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
  }

  private async ownId(tx: Tx, c: CompanyContext, v: Viewer) {
    if (!v.userId || v.actingForOther) return null;
    return (await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: v.userId }, select: { id: true } }))?.id ?? null;
  }

  private async facts(tx: Tx, org: string, employeeId: string): Promise<Facts & { today: string }> {
    const f = await factsOn(tx, org, employeeId, todayIst());
    if (!f) throw new NotFoundException('Not found');
    return { ...f, today: todayIn(f.zone) };
  }

  private async meFacts(tx: Tx, c: CompanyContext) {
    return this.facts(tx, c.organizationId, await myEmployeeId(tx, c.organizationId, c.userId));
  }

  /** Accepted punches of the last duty span as duty windows (from `since` less the longest duty). */
  private async windows(tx: Tx, org: string, employeeId: string, since: Date, now: Date) {
    const punches = await tx.punch.findMany({ where: { organizationId: org, employeeId, accepted: true, kind: { in: ['in', 'out'] }, punchedAt: { gte: new Date(since.getTime() - MAX_DUTY_HOURS * 3_600_000), lte: now } }, orderBy: { punchedAt: 'asc' }, select: { kind: true, punchedAt: true } });
    return dutyWindows(punches.map((p) => ({ kind: p.kind, at: p.punchedAt })), now);
  }

  private async openConsent(tx: Tx, org: string, employeeId: string) {
    return tx.fieldConsent.findFirst({ where: { organizationId: org, employeeId, withdrawnAt: null } });
  }

  private visitView(x: Visit, today: string) {
    const site = x.lat !== null && x.lng !== null ? { lat: n(x.lat)!, lng: n(x.lng)!, radiusM: x.radiusM } : null;
    const point = x.checkInLat !== null && x.checkInLng !== null ? { lat: n(x.checkInLat)!, lng: n(x.checkInLng)! } : null;
    // An upcoming visit of a past day was missed (worked out on read; nothing is rewritten).
    const status = x.status === 'upcoming' && dateOf(x.workOn) < today ? 'missed' : x.status;
    return {
      id: x.id,
      employeeId: x.employeeId,
      on: dateOf(x.workOn),
      place: x.place,
      site,
      plannedMinute: x.plannedMinute,
      planned: x.planned,
      status,
      checkInAt: x.checkInAt,
      checkOutAt: x.checkOutAt,
      point,
      accuracyM: x.checkInAccuracyM,
      inside: x.inside,
      distanceM: point && site ? visitVerdict(point, site).distanceM : null,
      outcome: x.outcome,
      note: x.note,
      flags: x.flags,
      version: x.version,
    };
  }

  // ------------------------------------------------------------------------------------------ me (the phone)

  /** The notice, my consent, whether tracking applies to me and I am on duty, and my beat today. */
  me(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const f = await this.meFacts(tx, c);
      const get = await settingsReader(tx, c);
      const now = new Date();
      const [consent, last, visits, windows] = await Promise.all([
        this.openConsent(tx, org, f.employeeId),
        tx.fieldConsent.findFirst({ where: { organizationId: org, employeeId: f.employeeId, withdrawnAt: { not: null } }, orderBy: { withdrawnAt: 'desc' } }),
        tx.fieldVisit.findMany({ where: { organizationId: org, employeeId: f.employeeId, workOn: asDate(f.today) }, orderBy: [{ plannedMinute: 'asc' }, { createdAt: 'asc' }] }),
        this.windows(tx, org, f.employeeId, now, now),
      ]);
      return {
        today: f.today,
        notice: noticeFor(Number(get('field.trail_retention_days', f)), Number(get('field.ping_minutes', f))),
        consent: consent ? { noticeVersion: consent.noticeVersion, givenAt: consent.givenAt, current: consent.noticeVersion === NOTICE_VERSION } : null,
        withdrawnAt: consent ? null : (last?.withdrawnAt ?? null),
        tracking: get('field.tracking', f) === 'on',
        pingMinutes: Number(get('field.ping_minutes', f)),
        maxAccuracyM: Number(get('field.max_accuracy_m', f)),
        onDuty: onDutyAt(windows, now),
        visits: visits.map((x) => this.visitView(x, f.today)),
      };
    });
  }

  async consent(ctx: TenantContext, user: ScopeUser, noticeVersion: string) {
    this.self(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const f = await this.meFacts(tx, c);
      if (noticeVersion !== NOTICE_VERSION) throw new ConflictException('The notice has changed. Read it again, then agree.');
      if (await this.openConsent(tx, c.organizationId, f.employeeId)) throw new ConflictException('You have already agreed to location tracking.');
      const x = await tx.fieldConsent.create({ data: { organizationId: c.organizationId, employeeId: f.employeeId, noticeVersion } });
      await audit(tx, c, 'time.field.consent_given', 'employee', f.employeeId, { consentId: x.id, noticeVersion });
      return { id: x.id, noticeVersion, givenAt: x.givenAt };
    });
  }

  /** DPDP s.6(4): withdrawal is as easy as consent. Tracking stops and the trail is erased; attendance is untouched. */
  async withdraw(ctx: TenantContext, user: ScopeUser) {
    this.self(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const f = await this.meFacts(tx, c);
      // The same lock as a reading upload: no reading lands after the trail is deleted, and a double press withdraws once.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`field-pings:${org}:${f.employeeId}`}))`;
      const x = await this.openConsent(tx, org, f.employeeId);
      if (!x) throw new ConflictException('You have not agreed to location tracking, so there is nothing to withdraw.');
      const withdrawnAt = new Date();
      await tx.fieldConsent.update({ where: { id: x.id }, data: { withdrawnAt } });
      // Founder decision 6: the trail goes; attendance days and visit check-ins stay (pay and the visit log need them).
      const erased = await tx.locationPing.deleteMany({ where: { organizationId: org, employeeId: f.employeeId } });
      await audit(tx, c, 'time.field.consent_withdrawn', 'employee', f.employeeId, { consentId: x.id, withdrawnAt, erasedPings: erased.count, by: 'employee' });
      return { withdrawnAt, erasedPings: erased.count };
    });
  }

  /** A batch of readings from the phone. Each reading is kept once (client_ref); refused ones are never stored. */
  async pings(ctx: TenantContext, user: ScopeUser, dto: PingBatchDto) {
    this.self(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const f = await this.meFacts(tx, c);
      // One upload at a time per person: the speed check reads the previous reading.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`field-pings:${org}:${f.employeeId}`}))`;
      const get = await settingsReader(tx, c);
      if (get('field.tracking', f) !== 'on') throw new ForbiddenException('Field tracking is off for your group. Nothing was recorded.');
      const consent = await this.openConsent(tx, org, f.employeeId);
      if (!consent) throw new ForbiddenException('You have not agreed to location tracking. Nothing was recorded.');
      const maxAccuracyM = Number(get('field.max_accuracy_m', f));
      const now = new Date();
      const skewed = Math.abs(Date.parse(dto.sentAt) - now.getTime()) > MAX_SKEW_MS;
      const unique = [...new Map(dto.pings.map((p) => [p.clientRef.toLowerCase(), p])).values()];
      const seen = new Set((await tx.locationPing.findMany({ where: { organizationId: org, employeeId: f.employeeId, clientRef: { in: unique.map((p) => p.clientRef) } }, select: { clientRef: true } })).map((p) => p.clientRef.toLowerCase()));
      const fresh = unique.filter((p) => !seen.has(p.clientRef.toLowerCase())).map((p) => ({ ...p, when: new Date(p.at) })).sort((a, b) => a.when.getTime() - b.when.getTime());
      const refused: { clientRef: string; reason: 'future' | 'too_old' | 'before_consent' | 'off_duty' }[] = [];
      const earliest = fresh[0]?.when ?? now;
      const windows = await this.windows(tx, org, f.employeeId, earliest, now);
      const prev = await tx.locationPing.findFirst({ where: { organizationId: org, employeeId: f.employeeId, at: { lt: earliest }, NOT: { flags: { hasSome: SUSPECT } } }, orderBy: { at: 'desc' } });
      let good = prev ? { lat: n(prev.lat)!, lng: n(prev.lng)!, accuracyM: prev.accuracyM, at: prev.at } : null;
      const rows: Prisma.LocationPingCreateManyInput[] = [];
      for (const p of fresh) {
        const reason = p.when.getTime() > now.getTime() + MAX_SKEW_MS ? 'future' : now.getTime() - p.when.getTime() > MAX_LATE_HOURS * 3_600_000 ? 'too_old' : p.when < consent.givenAt ? 'before_consent' : !onDutyAt(windows, p.when) ? 'off_duty' : null;
        if (reason) {
          refused.push({ clientRef: p.clientRef, reason });
          continue;
        }
        const point = { lat: p.lat, lng: p.lng, accuracyM: Math.round(p.accuracyM), at: p.when, mock: p.mock };
        const flags = pingFlags(point, good, maxAccuracyM, skewed);
        if (clean(flags)) good = point;
        const window = windows.find((w) => p.when >= w.from && p.when <= w.to)!;
        rows.push({ organizationId: org, employeeId: f.employeeId, workOn: asDate(localDate(window.from, f.zone)), at: p.when, lat: p.lat, lng: p.lng, accuracyM: point.accuracyM, flags, clientRef: p.clientRef });
      }
      const stored = rows.length ? (await tx.locationPing.createMany({ data: rows, skipDuplicates: true })).count : 0;
      const repeats = dto.pings.length - stored - refused.length;
      if (!stored && !repeats) {
        throw new ConflictException(refused.every((r) => r.reason === 'off_duty') ? 'You are not checked in. Your location is recorded only while you are on duty. Nothing was recorded.' : 'None of these locations could be recorded (too old, in the future or before you agreed).');
      }
      return { stored, repeats, refused };
    });
  }

  /** My visit of today, or 404. */
  private async myVisit(tx: Tx, c: CompanyContext, id: string) {
    const f = await this.meFacts(tx, c);
    const x = await tx.fieldVisit.findFirst({ where: { organizationId: c.organizationId, id, employeeId: f.employeeId } });
    if (!x) throw new NotFoundException('No such visit.');
    return { f, x };
  }

  private async mustBeOnDuty(tx: Tx, org: string, employeeId: string, now: Date) {
    if (!onDutyAt(await this.windows(tx, org, employeeId, now, now), now)) throw new ConflictException('Check in for the day first, then check in at the visit.');
  }

  private async noOtherOnSite(tx: Tx, org: string, employeeId: string, exceptId?: string) {
    const other = await tx.fieldVisit.findFirst({ where: { organizationId: org, employeeId, status: 'on_site', ...(exceptId ? { NOT: { id: exceptId } } : {}) } });
    if (other) throw new ConflictException(`Check out of ${other.place} first.`);
  }

  async checkIn(ctx: TenantContext, user: ScopeUser, id: string, dto: VisitCheckInDto) {
    this.self(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { f, x } = await this.myVisit(tx, c, id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`field-visit:${org}:${f.employeeId}`}))`;
      const now = new Date();
      // A retry of the same check-in answers with the first result.
      if (x.status === 'on_site') return { ...this.visitView(x, f.today), repeat: true };
      if (x.status !== 'upcoming') throw new ConflictException('This visit is already done.');
      if (dateOf(x.workOn) !== f.today) throw new ConflictException(dateOf(x.workOn) < f.today ? 'This visit was planned for an earlier day.' : 'This visit is planned for a later day.');
      await this.mustBeOnDuty(tx, org, f.employeeId, now);
      await this.noOtherOnSite(tx, org, f.employeeId);
      const site = x.lat !== null && x.lng !== null ? { lat: n(x.lat)!, lng: n(x.lng)!, radiusM: x.radiusM } : null;
      const v = visitVerdict(dto, site);
      const maxAccuracyM = Number((await settingsReader(tx, c))('field.max_accuracy_m', f));
      const flags = [...(dto.mock ? ['mock'] : []), ...(dto.accuracyM > maxAccuracyM ? ['accuracy'] : [])];
      const done = await tx.fieldVisit.updateMany({ where: { id: x.id, version: x.version }, data: { status: 'on_site', checkInAt: now, checkInLat: dto.lat, checkInLng: dto.lng, checkInAccuracyM: Math.round(dto.accuracyM), inside: v.inside, flags, version: { increment: 1 } } });
      if (!done.count) throw new ConflictException('This visit changed just now. Refresh and try again.');
      await audit(tx, c, 'time.field.visit_checked_in', 'field_visit', x.id, { employeeId: f.employeeId, inside: v.inside, distanceM: v.distanceM, flags });
      return { ...this.visitView(await tx.fieldVisit.findUniqueOrThrow({ where: { id: x.id } }), f.today), repeat: false };
    });
  }

  async checkOut(ctx: TenantContext, user: ScopeUser, id: string, dto: VisitCheckOutDto) {
    this.self(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { f, x } = await this.myVisit(tx, c, id);
      if (x.status === 'done' && x.outcome === dto.outcome) return { ...this.visitView(x, f.today), repeat: true };
      if (x.status !== 'on_site') throw new ConflictException(x.status === 'done' ? 'You have already checked out of this visit.' : 'Check in at this visit first.');
      const done = await tx.fieldVisit.updateMany({ where: { id: x.id, version: x.version }, data: { status: 'done', checkOutAt: new Date(), outcome: dto.outcome, note: dto.note ?? x.note, version: { increment: 1 } } });
      if (!done.count) throw new ConflictException('This visit changed just now. Refresh and try again.');
      await audit(tx, c, 'time.field.visit_checked_out', 'field_visit', x.id, { employeeId: f.employeeId, outcome: dto.outcome });
      return { ...this.visitView(await tx.fieldVisit.findUniqueOrThrow({ where: { id: x.id } }), f.today), repeat: false };
    });
  }

  /** A visit not on the beat: checked in at once where the person is. */
  async unplanned(ctx: TenantContext, user: ScopeUser, dto: UnplannedVisitDto) {
    this.self(user);
    const named = dto.place || (await this.maps.placeNear(dto.lat, dto.lng)) || 'Unplanned visit';
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const f = await this.meFacts(tx, c);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`field-visit:${org}:${f.employeeId}`}))`;
      const again = await tx.fieldVisit.findFirst({ where: { organizationId: org, employeeId: f.employeeId, clientRef: dto.clientRef } });
      if (again) return { ...this.visitView(again, f.today), repeat: true };
      const now = new Date();
      await this.mustBeOnDuty(tx, org, f.employeeId, now);
      await this.noOtherOnSite(tx, org, f.employeeId);
      const maxAccuracyM = Number((await settingsReader(tx, c))('field.max_accuracy_m', f));
      const flags = [...(dto.mock ? ['mock'] : []), ...(dto.accuracyM > maxAccuracyM ? ['accuracy'] : [])];
      const x = await tx.fieldVisit.create({
        data: { organizationId: org, employeeId: f.employeeId, workOn: asDate(f.today), place: named.slice(0, 150), planned: false, status: 'on_site', plannedMinute: minutesInto(f.today, f.zone, now), checkInAt: now, checkInLat: dto.lat, checkInLng: dto.lng, checkInAccuracyM: Math.round(dto.accuracyM), note: dto.note, flags, clientRef: dto.clientRef, createdBy: c.userId ?? null },
      });
      await audit(tx, c, 'time.field.visit_unplanned', 'field_visit', x.id, { employeeId: f.employeeId, flags });
      return { ...this.visitView(x, f.today), repeat: false };
    });
  }

  // ------------------------------------------------------------------------------------------ the beat plan (manager / HR)

  /** Planning reach: the manager's team (implicit) or roster.manage in scope; never one's own beat. */
  private async mustPlan(tx: Tx, c: CompanyContext, v: Viewer, own: string | null, employeeId: string) {
    if ((await mustSee(tx, c, v, own, 'roster.manage', employeeId, todayIst())) === 'self') throw new ForbiddenException('Your own visits are planned by your manager.');
  }

  async plan(ctx: TenantContext, user: ScopeUser, dto: VisitPlanDto) {
    if ((dto.lat === undefined) !== (dto.lng === undefined)) throw new BadRequestException('Give both latitude and longitude of the place, or neither.');
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.mustPlan(tx, c, v, await this.ownId(tx, c, v), dto.employeeId);
      const f = await this.facts(tx, org, dto.employeeId);
      if (dto.on < f.today) throw new BadRequestException('Plan visits for today or a later day.');
      if (dto.on > addDays(f.today, 62)) throw new BadRequestException('Plan visits up to two months ahead.');
      if (!(await factsOn(tx, org, dto.employeeId, dto.on))) throw new BadRequestException(`${f.name} is not employed on that day.`);
      if ((await tx.fieldVisit.count({ where: { organizationId: org, employeeId: dto.employeeId, workOn: asDate(dto.on) } })) >= MAX_VISITS_A_DAY) throw new ConflictException(`A day has at most ${MAX_VISITS_A_DAY} visits.`);
      const x = await tx.fieldVisit.create({ data: { organizationId: org, employeeId: dto.employeeId, workOn: asDate(dto.on), place: dto.place, lat: dto.lat, lng: dto.lng, radiusM: dto.radiusM ?? 200, plannedMinute: dto.plannedMinute, note: dto.note, createdBy: c.userId ?? null } });
      await audit(tx, c, 'time.field.visit_planned', 'field_visit', x.id, { employeeId: dto.employeeId, on: dto.on, place: dto.place, plannedMinute: dto.plannedMinute ?? null });
      return this.visitView(x, f.today);
    });
  }

  /** Takes an upcoming visit off the beat (a visit started or done stays). */
  async cancel(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const x = await tx.fieldVisit.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!x) throw new NotFoundException('No such visit.');
      await this.mustPlan(tx, c, v, await this.ownId(tx, c, v), x.employeeId);
      if (x.status !== 'upcoming') throw new ConflictException('A visit that has started stays on the record.');
      await tx.fieldVisit.delete({ where: { id: x.id } });
      await audit(tx, c, 'time.field.visit_cancelled', 'field_visit', x.id, { employeeId: x.employeeId, on: dateOf(x.workOn), place: x.place });
      return { id: x.id };
    });
  }

  // ------------------------------------------------------------------------------------------ the map (manager / HR)

  /** One person's day as the map shows it. Location only while tracked: on duty, consent open, tracking on. */
  private async personDay(tx: Tx, c: CompanyContext, f: Facts, get: (k: Key, f: Facts) => string, book: ScheduleBook, names: Map<string, string>, now: Date, withTrail: boolean) {
    const org = c.organizationId;
    const today = todayIn(f.zone, now);
    const tracking = get('field.tracking', f) === 'on';
    const [consent, lastWithdrawn, firstIn, visits, pings, windows, day] = await Promise.all([
      this.openConsent(tx, org, f.employeeId),
      tx.fieldConsent.findFirst({ where: { organizationId: org, employeeId: f.employeeId, withdrawnAt: { not: null } }, orderBy: { withdrawnAt: 'desc' } }),
      tx.punch.findFirst({ where: { organizationId: org, employeeId: f.employeeId, workOn: asDate(today), kind: 'in', accepted: true }, orderBy: { punchedAt: 'asc' } }),
      tx.fieldVisit.findMany({ where: { organizationId: org, employeeId: f.employeeId, workOn: asDate(today) }, orderBy: [{ plannedMinute: 'asc' }, { createdAt: 'asc' }] }),
      tx.locationPing.findMany({ where: { organizationId: org, employeeId: f.employeeId, workOn: asDate(today) }, orderBy: { at: 'asc' } }),
      this.windows(tx, org, f.employeeId, now, now),
      book.day(f, today),
    ]);
    const onDuty = onDutyAt(windows, now);
    const tracked = tracking && Boolean(consent);
    // Defence in depth: only readings inside a duty window and after the consent show, whatever is stored.
    const allWindows = firstIn ? await this.windows(tx, org, f.employeeId, firstIn.punchedAt, now) : [];
    const shown: Ping[] = tracked ? pings.filter((p) => onDutyAt(allWindows, p.at) && p.at >= consent!.givenAt) : [];
    const good = shown.filter((p) => clean(p.flags));
    const open = shown.filter((p) => !p.reviewedAt && p.flags.some((x) => REVIEWABLE.includes(x as PingFlag)));
    const reviewed = shown.find((p) => p.reviewedAt && p.flags.some((x) => REVIEWABLE.includes(x as PingFlag)));
    const last = good.at(-1);
    return {
      person: {
        id: f.employeeId,
        name: f.name,
        code: f.code,
        beat: names.get(f.locationId) ?? '',
        reportsTo: f.managerEmployeeId ? (names.get(f.managerEmployeeId) ?? '') : '',
        today,
        shiftStart: day.shift ? hhmm(day.shift.shiftStart) : null,
        inAt: firstIn ? hhmm(minutesInto(today, f.zone, firstIn.punchedAt)) : null,
        onDuty,
        tracking,
        consent: consent ? 'given' : lastWithdrawn ? 'withdrawn' : 'none',
        withdrawnAt: consent ? null : (lastWithdrawn?.withdrawnAt ?? null),
        km: tracked && firstIn ? trailKm(good.map((p) => ({ lat: n(p.lat)!, lng: n(p.lng)! }))) : null,
        // The live position only while on duty now.
        last: tracked && onDuty && last ? { lat: n(last.lat)!, lng: n(last.lng)!, at: last.at, accuracyM: last.accuracyM } : null,
        flag: open.length ? { at: open[0].at, kinds: [...new Set(open.flatMap((p) => p.flags))], count: open.length } : null,
        reviewed: !open.length && reviewed ? { at: reviewed.reviewedAt, by: reviewed.reviewedBy ? (names.get(`user:${reviewed.reviewedBy}`) ?? null) : null } : null,
      },
      visits: visits.map((x) => this.visitView(x, today)),
      trail: withTrail ? shown.map((p) => ({ at: p.at, lat: n(p.lat)!, lng: n(p.lng)!, accuracyM: p.accuracyM, flags: p.flags, reviewed: Boolean(p.reviewedAt) })) : undefined,
    };
  }

  /** Names of locations, managers and reviewers, keyed by id ("user:<id>" for logins). */
  private async names(tx: Tx, org: string, facts: Facts[], userIds: string[] = []) {
    const [locs, mgrs, users] = await Promise.all([
      tx.location.findMany({ where: { organizationId: org, id: { in: [...new Set(facts.map((f) => f.locationId))] } }, select: { id: true, name: true } }),
      tx.employee.findMany({ where: { organizationId: org, id: { in: [...new Set(facts.flatMap((f) => (f.managerEmployeeId ? [f.managerEmployeeId] : [])))] } }, select: { id: true, givenName: true, preferredName: true, familyName: true } }),
      userIds.length ? tx.user.findMany({ where: { organizationId: org, id: { in: userIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    ]);
    return new Map<string, string>([
      ...locs.map((l) => [l.id, l.name] as [string, string]),
      ...mgrs.map((e) => [e.id, [e.preferredName ?? e.givenName, e.familyName].filter(Boolean).join(' ')] as [string, string]),
      ...users.map((u) => [`user:${u.id}`, u.name ?? ''] as [string, string]),
    ]);
  }

  private async fences(tx: Tx, org: string, facts: Facts[]) {
    const rows = await tx.location.findMany({ where: { organizationId: org, id: { in: [...new Set(facts.map((f) => f.locationId))] }, archivedAt: null, geoLat: { not: null }, geoLng: { not: null } } });
    return rows.map((l) => ({ id: l.id, name: l.name, lat: Number(l.geoLat), lng: Number(l.geoLng), radiusM: l.geoRadiusM }));
  }

  /**
   * Field force today: field staff the viewer may see (tracking on for them, or visits today). Locations show only for
   * people on duty with consent and tracking on; the others carry their state (not checked in, consent withdrawn,
   * tracking off) with no location.
   */
  async overview(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await this.ownId(tx, c, v);
      const today = todayIst();
      const people = await tx.$queryRaw<{ id: string }[]>`
        SELECT e.id::text FROM employees e
        JOIN employee_assignments a ON a.organization_id = e.organization_id AND a.employee_id = e.id AND a.superseded_at IS NULL AND ${today}::date <@ daterange(a.valid_from, a.valid_to, '[]')
        JOIN employments m ON m.organization_id = e.organization_id AND m.id = a.employment_id AND (m.exited_on IS NULL OR m.exited_on >= ${today}::date)
        WHERE e.organization_id = ${org}::uuid AND (${own}::uuid IS NULL OR e.id <> ${own}::uuid) AND ${await visibleSql(tx, c, v, own, 'attendance.view', Prisma.sql`e.id`, today)}
        GROUP BY 1 ORDER BY 1 LIMIT 500`;
      if (!people.length && !has(v, 'attendance.view')) throw new ForbiddenException('The field force map is for managers and HR.');
      const get = await settingsReader(tx, c);
      const facts = (await Promise.all(people.map((p) => factsOn(tx, org, p.id, today)))).filter((f): f is Facts => Boolean(f));
      const withVisits = new Set((await tx.fieldVisit.findMany({ where: { organizationId: org, employeeId: { in: facts.map((f) => f.employeeId) }, workOn: { gte: asDate(addDays(today, -1)), lte: asDate(addDays(today, 1)) } }, select: { employeeId: true }, distinct: ['employeeId'] })).map((x) => x.employeeId));
      // shortcut: the first 200 field staff by name; add paging when a company has more field staff than that.
      const field = facts.filter((f) => get('field.tracking', f) === 'on' || withVisits.has(f.employeeId)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 200);
      const book = await ScheduleBook.load(tx, org);
      await book.prime(field.map((f) => f.employeeId), addDays(today, -1), addDays(today, 1));
      const names = await this.names(tx, org, field);
      const now = new Date();
      const days = [];
      for (const f of field) days.push(await this.personDay(tx, c, f, get, book, names, now, false));
      return {
        today,
        scope: has(v, 'attendance.view') ? 'granted' : 'team',
        // No one in reach has tracking on: the group's "tracking off" state.
        trackingOff: !facts.some((f) => get('field.tracking', f) === 'on'),
        retentionDays: Number(get('field.trail_retention_days', facts[0] ?? ({} as Facts))),
        fences: await this.fences(tx, org, field),
        people: days.map((d) => d.person),
        visits: days.flatMap((d) => d.visits),
      };
    });
  }

  /** One person's trail today (duty only) and visits. Out of reach or another company: 404. */
  async person(ctx: TenantContext, user: ScopeUser, employeeId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await mustSee(tx, c, v, await this.ownId(tx, c, v), 'attendance.view', employeeId, todayIst());
      const f = await this.facts(tx, org, employeeId);
      const reviewers = (await tx.locationPing.findMany({ where: { organizationId: org, employeeId, reviewedBy: { not: null } }, select: { reviewedBy: true }, distinct: ['reviewedBy'] })).map((p) => p.reviewedBy!);
      const book = await ScheduleBook.load(tx, org);
      await book.prime([employeeId], addDays(f.today, -1), addDays(f.today, 1));
      const d = await this.personDay(tx, c, f, await settingsReader(tx, c), book, await this.names(tx, org, [f], reviewers), new Date(), true);
      return { ...d, fences: await this.fences(tx, org, [f]) };
    });
  }

  /** The manager has looked at today's flags (they stay on the readings; this only records who looked and when). */
  async review(ctx: TenantContext, user: ScopeUser, employeeId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      if ((await mustSee(tx, c, v, await this.ownId(tx, c, v), 'attendance.view', employeeId, todayIst())) === 'self') throw new ForbiddenException('Your own flags are reviewed by your manager.');
      const f = await this.facts(tx, org, employeeId);
      const done = await tx.locationPing.updateMany({ where: { organizationId: org, employeeId, workOn: asDate(f.today), reviewedAt: null, flags: { hasSome: REVIEWABLE } }, data: { reviewedAt: new Date(), reviewedBy: c.userId ?? null } });
      if (!done.count) throw new ConflictException('There are no open flags for today.');
      await audit(tx, c, 'time.field.flags_reviewed', 'employee', employeeId, { on: f.today, readings: done.count });
      return { reviewed: done.count };
    });
  }
}
