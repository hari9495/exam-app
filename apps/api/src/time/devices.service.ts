import { BadRequestException, ConflictException, ForbiddenException, HttpException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as argon2 from 'argon2';
import { SignJWT } from 'jose';
import { OrgSecretsCryptoService, TenantContext, TenantPrismaService, revokeStaffSessions } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, companyContext, inCompany, mapDbError } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { resolveSetting, SETTINGS } from '../org-structure/settings-registry';
import { OrgSettingsService } from '../org-structure/org-settings.service';
import type { SettingDto } from '../org-structure/dto';
import type { ScopeUser } from '../access/scope';
import { AttendanceService } from './attendance.service';
import { TimeSetupService } from './setup.service';
import { Facts, factsOn, myEmployeeId, settingOn, todayIn } from './time-core';
import { localDate } from './time-maths';
import { BindRequestDto, DevicePunchDto, FaceConsentDto, PhonePunchDto, PhonePunchItemDto, PhoneSyncDto, RegisterKioskDto, TrainingSessionDto, TrainingSessionEditDto, WebApprovalDto } from './devices.dto';
import { SETUP_CODE_MS, kioskHealth, newSetupCode, normalSetupCode, phoneInactive, pinProblem, punchTimeProblem, sha256 } from './device-rules';
import { FACE_MATCH, type FaceMatchProvider } from './providers/face-match';

// TIM-14 Devices and kiosks, and the device side of TIM-12 (feature sheet rule 13). Who:
//   leave.settings.manage (company-wide)  kiosks (register, new set-up code, revoke), phone requests (approve / refuse
//                                         with a reason), employees' phones (remote sign-out), kiosk PIN reset, ID-card
//                                         QR (print, rotate)
//   the person themselves (never while    ask to bind this phone, withdraw it, my device status, my kiosk PIN, my card
//   acting for someone else)              QR, face sign-in consent, phone punches and their offline sync
// Another company's ids answer 404. Every change and security event is audited.

export type PunchResult = { accepted: boolean; duplicate: boolean; kind: string; at: string; verdict: string; message: string; distanceM: number | null; punchId: string | null; repeat?: boolean };
export type SyncResult = ({ clientRef: string; ok: true } & PunchResult) | { clientRef: string; ok: false; status: number; message: string };

const CARD_AUDIENCE = 'yx-kiosk-card';
const WEB_APPROVAL = 'attendance.web_device_approval';
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

@Injectable()
export class DevicesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly setup: TimeSetupService,
    private readonly attendance: AttendanceService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly settings: OrgSettingsService,
    @Optional() @Inject(FACE_MATCH) private readonly face: FaceMatchProvider | null,
  ) {}

  /** The per-company signing key for one purpose (derived from the server's master key; never stored). */
  key(org: string, purpose: string): Uint8Array {
    return Buffer.from(this.crypto.hmac(`time-device:${purpose}`, org), 'hex');
  }

  get faceProvider() {
    return this.face ?? null;
  }

  private self(user: ScopeUser) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
  }

  /** Kiosk sign-in methods at a location (kiosk.methods: location, then its legal entity, then the company). */
  async methodsAt(tx: Tx, org: string, locationId: string): Promise<string[]> {
    const loc = await tx.location.findFirst({ where: { organizationId: org, id: locationId }, select: { legalEntityId: true } });
    const rows = await tx.setting.findMany({ where: { organizationId: org, key: 'kiosk.methods' } });
    const r = resolveSetting(SETTINGS['kiosk.methods'], rows.map((x) => ({ id: x.id, scopeType: x.scopeType, scopeId: x.scopeId, value: x.value, validFrom: null })), { tenant: org, location: locationId, legal_entity: loc?.legalEntityId }, null);
    return String(r.value).split(',').map((s) => s.trim()).filter(Boolean);
  }

  async pinTries(tx: Tx, org: string): Promise<number> {
    const row = await tx.setting.findFirst({ where: { organizationId: org, key: 'kiosk.pin_tries', scopeType: 'tenant' } });
    return Number(row?.value ?? SETTINGS['kiosk.pin_tries'].default);
  }

  /** The ID-card QR of a person: a signed token naming them and their card nonce (rotating the nonce voids it). */
  private async cardToken(tx: Tx, org: string, employeeId: string): Promise<string> {
    const cred = await tx.kioskCredential.upsert({ where: { organizationId_employeeId: { organizationId: org, employeeId } }, update: {}, create: { organizationId: org, employeeId } });
    return new SignJWT({ n: cred.qrNonce }).setProtectedHeader({ alg: 'HS256' }).setIssuer(org).setAudience(CARD_AUDIENCE).setSubject(employeeId).setIssuedAt().sign(this.key(org, 'card'));
  }

  // ------------------------------------------------------------------------------------------ HR: the screen

  /** TIM-14: kiosks with health and today's check-ins, waiting phone requests, employees' phones, the locations. */
  overview(ctx: TenantContext, user: ScopeUser) {
    return this.setup.run(ctx, user, false, async (tx, c) => {
      const org = c.organizationId;
      const now = new Date();
      const [kiosks, phones, locations] = await Promise.all([
        tx.timeDevice.findMany({ where: { organizationId: org, kind: 'kiosk', status: { in: ['pending', 'active'] } }, orderBy: { code: 'asc' } }),
        // Phones and, for web clock-in (DeviceNotApproved), computers: both are asked for by the person and approved here.
        tx.timeDevice.findMany({ where: { organizationId: org, kind: { in: ['phone', 'web'] }, status: { in: ['pending', 'active', 'lost', 'revoked'] } }, orderBy: { createdAt: 'desc' }, take: 1000 }),
        tx.location.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true, name: true, code: true, legalEntityId: true, timezone: true }, orderBy: { name: 'asc' } }),
      ]);
      const entities = new Map((await tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true, name: true } })).map((e) => [e.id, e.name]));
      const locs = new Map(locations.map((l) => [l.id, l]));
      // Accepted check-ins today (the kiosk location's own date) from each kiosk's receipts.
      const uses = await tx.$queryRaw<{ id: string; n: number }[]>`
        SELECT r.device_id::text AS id, count(*)::int AS n FROM device_punch_receipts r
        JOIN time_devices d ON d.organization_id = r.organization_id AND d.id = r.device_id AND d.kind = 'kiosk'
        JOIN locations l ON l.organization_id = d.organization_id AND l.id = d.location_id
        WHERE r.organization_id = ${org}::uuid AND (r.result->>'accepted')::boolean
          AND (r.created_at AT TIME ZONE l.timezone)::date = (now() AT TIME ZONE l.timezone)::date
        GROUP BY 1`;
      const used = new Map(uses.map((u) => [u.id, u.n]));
      const people = await this.names(tx, org, phones.map((p) => p.employeeId!));
      const today = todayIst(now);
      const sites = new Map<string, string>();
      for (const id of new Set(phones.filter((p) => p.status === 'pending').map((p) => p.employeeId!))) {
        const f = await factsOn(tx, org, id, today);
        if (f) sites.set(id, locs.get(f.locationId)?.name ?? '');
      }
      // A new phone replaces the old one; a computer replaces nothing (people may use more than one).
      const active = new Map(phones.filter((p) => p.status === 'active' && p.kind === 'phone').map((p) => [p.employeeId!, p]));
      const lostOf = (emp: string) => phones.find((p) => p.employeeId === emp && p.status === 'lost' && p.kind === 'phone');
      return {
        kiosks: kiosks.map((k) => {
          const l = locs.get(k.locationId!);
          const health = kioskHealth({ setUp: k.status === 'active', lastSeenAt: k.lastSeenAt }, now);
          return { id: k.id, code: k.code, place: k.place, locationId: k.locationId, location: l?.name ?? '', entity: l ? (entities.get(l.legalEntityId) ?? '') : '', mode: k.mode, status: health, lastSeenAt: k.lastSeenAt, setupExpiresAt: k.status === 'pending' ? k.enrolExpiresAt : null, checkInsToday: health === 'not_set_up' ? null : (used.get(k.id) ?? 0) };
        }),
        requests: phones
          .filter((p) => p.status === 'pending')
          .map((p) => {
            const old = p.kind === 'web' ? undefined : (active.get(p.employeeId!) ?? (p.replacesLost ? lostOf(p.employeeId!) : undefined));
            return { id: p.id, kind: p.kind, employeeId: p.employeeId, person: people.get(p.employeeId!) ?? '', site: sites.get(p.employeeId!) ?? '', model: p.model ?? '', oldModel: old?.model ?? null, oldLastSeenAt: old?.lastSeenAt ?? null, oldPhoneLost: p.replacesLost, reason: p.requestReason ?? '', raisedAt: p.createdAt };
          }),
        phones: phones
          .filter((p) => p.status !== 'pending')
          .map((p) => ({ id: p.id, kind: p.kind, employeeId: p.employeeId, person: people.get(p.employeeId!) ?? '', model: p.model ?? '', appVersion: p.appVersion, lastSeenAt: p.lastSeenAt, status: p.status === 'active' && phoneInactive(p.lastSeenAt, p.decidedAt ?? p.createdAt, now) ? 'inactive' : p.status })),
        locations: locations.map((l) => ({ id: l.id, name: l.name, entity: entities.get(l.legalEntityId) ?? '', zone: l.timezone })),
        entities: entities.size,
        // The places the web clock-in rule can be set for, and the rule as it stands.
        entityList: [...entities].map(([id, name]) => ({ id, name })),
        webApproval: await this.webApproval(tx, org, locations, entities),
        company: (await tx.organization.findUnique({ where: { id: org }, select: { name: true } }))?.name ?? '',
      };
    });
  }

  /**
   * Founder answer 1: the "Web clock-in only from an approved computer" rule on TIM-14: the company value and every
   * legal entity / location that sets its own (attendance.web_device_approval: company → legal entity → location).
   */
  private async webApproval(tx: Tx, org: string, locations: { id: string; name: string }[], entities: Map<string, string>) {
    const rows = await tx.setting.findMany({ where: { organizationId: org, key: WEB_APPROVAL }, orderBy: { scopeType: 'asc' } });
    const company = rows.find((r) => r.scopeType === 'tenant')?.value ?? SETTINGS[WEB_APPROVAL].default;
    const nameOf = (type: string, id: string) => (type === 'legal_entity' ? entities.get(id) : locations.find((l) => l.id === id)?.name) ?? '';
    return {
      company,
      overrides: rows.filter((r) => r.scopeType !== 'tenant').map((r) => ({ id: r.id, scopeType: r.scopeType as 'legal_entity' | 'location', scopeId: r.scopeId, name: nameOf(r.scopeType, r.scopeId), value: r.value })),
    };
  }

  /** Sets the rule for the company, a legal entity or a location (validated and audited by the settings service). */
  async setWebApproval(ctx: TenantContext, user: ScopeUser, dto: WebApprovalDto) {
    if (dto.scopeType === 'tenant' ? dto.scopeId : !dto.scopeId) throw new BadRequestException(dto.scopeType === 'tenant' ? 'The company-wide rule has no place.' : 'Choose the legal entity or location.');
    // The company-wide set-up holder check first; then the settings service checks the place and value and audits it.
    await this.setup.run(ctx, user, true, async () => null);
    return this.settings.set(ctx, { key: WEB_APPROVAL, scopeType: dto.scopeType, scopeId: dto.scopeId, value: dto.value } as SettingDto);
  }

  /** A legal entity or location goes back to the value above it. */
  async removeWebApproval(ctx: TenantContext, user: ScopeUser, id: string) {
    const row = await this.setup.run(ctx, user, true, (tx, c) => tx.setting.findFirst({ where: { organizationId: c.organizationId, id, key: WEB_APPROVAL } }));
    if (!row || row.scopeType === 'tenant') throw new NotFoundException('Not found');
    await this.settings.remove(ctx, id);
    return { id };
  }

  private async names(tx: Tx, org: string, ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows = await tx.employee.findMany({ where: { organizationId: org, id: { in: [...new Set(ids)] } }, select: { id: true, givenName: true, preferredName: true, familyName: true } });
    return new Map(rows.map((e) => [e.id, [e.preferredName ?? e.givenName, e.familyName].filter(Boolean).join(' ')]));
  }

  // ------------------------------------------------------------------------------------------ HR: kiosks

  /** Registers a kiosk; the one-time set-up code is shown once (only its SHA-256 is kept) and works for 30 minutes. */
  // ------------------------------------------------------------------------------------------ training sessions (TIM-13)

  /**
   * HR (TIM-14 Training): sessions from 7 days back, with who they are for and how many people marked themselves
   * present at the kiosk. `version` goes back with a change, so two HR people never overwrite each other.
   */
  trainingSessions(ctx: TenantContext, user: ScopeUser) {
    return this.setup.run(ctx, user, false, async (tx, c) => {
      const org = c.organizationId;
      const rows = await tx.trainingSession.findMany({ where: { organizationId: org, endsAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }, orderBy: { startsAt: 'asc' }, take: 200 });
      const locs = await tx.location.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.locationId) } }, select: { id: true, name: true, timezone: true } });
      const marks = await tx.trainingAttendance.groupBy({ by: ['sessionId'], where: { organizationId: org, sessionId: { in: rows.map((r) => r.id) } }, _count: { _all: true } });
      const names = await this.names(tx, org, rows.flatMap((r) => r.invitees));
      const now = Date.now();
      return rows.map((r) => {
        const l = locs.find((x) => x.id === r.locationId);
        return {
          id: r.id,
          title: r.title,
          room: r.room,
          location: { id: r.locationId, name: l?.name ?? '', zone: l?.timezone ?? 'Asia/Kolkata' },
          startsAt: r.startsAt,
          endsAt: r.endsAt,
          invitees: r.invitees.map((id) => ({ id, name: names.get(id) ?? 'Former employee' })),
          cancelled: Boolean(r.cancelledAt),
          present: marks.find((m) => m.sessionId === r.id)?._count._all ?? 0,
          state: r.cancelledAt ? 'cancelled' : r.endsAt.getTime() <= now ? 'ended' : r.startsAt.getTime() <= now ? 'running' : 'upcoming',
          version: r.version,
        };
      });
    });
  }

  /** The checks a new or changed session passes: times, its location, and who (employees of this company). */
  private async trainingInput(tx: Tx, org: string, dto: TrainingSessionDto) {
    const starts = new Date(dto.startsAt);
    const ends = new Date(dto.endsAt);
    if (!(ends > starts)) throw new BadRequestException('The end must be after the start.');
    if (ends.getTime() - starts.getTime() > 12 * 3_600_000) throw new BadRequestException('A session is at most 12 hours. Add one session per day.');
    if (starts.getTime() < Date.now() - 5 * 60_000) throw new BadRequestException('That time has passed. Choose a time from now.');
    const loc = await tx.location.findFirst({ where: { organizationId: org, id: dto.locationId, archivedAt: null } });
    if (!loc) throw new NotFoundException('Choose a location of this company.');
    const invitees = [...new Set(dto.invitees ?? [])];
    if (invitees.length && (await tx.employee.count({ where: { organizationId: org, id: { in: invitees } } })) !== invitees.length) throw new BadRequestException('Choose people of this company.');
    return { starts, ends, loc, invitees };
  }

  addTrainingSession(ctx: TenantContext, user: ScopeUser, dto: TrainingSessionDto) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      const org = c.organizationId;
      const { starts, ends, loc, invitees } = await this.trainingInput(tx, org, dto);
      const s = await tx.trainingSession.create({ data: { organizationId: org, locationId: loc.id, title: dto.title, room: dto.room || null, startsAt: starts, endsAt: ends, invitees, createdBy: c.userId ?? null } });
      await audit(tx, c, 'time.training.created', 'training_session', s.id, { title: dto.title, location: loc.name, startsAt: dto.startsAt, endsAt: dto.endsAt, invitees: invitees.length });
      return { id: s.id, version: s.version };
    });
  }

  /** HR changes a session that has not started yet (once started, it is cancelled or left as it is). */
  editTrainingSession(ctx: TenantContext, user: ScopeUser, id: string, dto: TrainingSessionEditDto) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      const org = c.organizationId;
      const s = await tx.trainingSession.findFirst({ where: { organizationId: org, id } });
      if (!s) throw new NotFoundException('Not found');
      if (s.cancelledAt) throw new ConflictException('That session is cancelled. Add a new one instead.');
      if (s.startsAt.getTime() <= Date.now()) throw new ConflictException('That session has started, so it cannot be changed. Cancel it or add a new one.');
      const { starts, ends, loc, invitees } = await this.trainingInput(tx, org, dto);
      const done = await tx.trainingSession.updateMany({ where: { organizationId: org, id, version: dto.version, cancelledAt: null }, data: { locationId: loc.id, title: dto.title, room: dto.room || null, startsAt: starts, endsAt: ends, invitees, version: { increment: 1 }, updatedAt: new Date() } });
      if (!done.count) throw new ConflictException('Someone else changed this session. Reload to see their change.');
      await audit(tx, c, 'time.training.changed', 'training_session', id, {
        before: { title: s.title, room: s.room, locationId: s.locationId, startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString(), invitees: s.invitees.length },
        after: { title: dto.title, room: dto.room || null, locationId: loc.id, startsAt: starts.toISOString(), endsAt: ends.toISOString(), invitees: invitees.length },
      });
      return { id, version: dto.version + 1 };
    });
  }

  /** People to pick for "Who" (active employees of this company by name or code, 20 at most). */
  trainingPeople(ctx: TenantContext, user: ScopeUser, q: string) {
    return this.setup.run(ctx, user, false, async (tx, c) => {
      const like = `%${q.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      return tx.$queryRaw<{ id: string; label: string; detail: string }[]>`
        SELECT e.id::text AS id, concat_ws(' ', coalesce(e.preferred_name, e.given_name), e.family_name) AS label, m.employee_code::text AS detail
        FROM employees e JOIN employments m ON m.organization_id = e.organization_id AND m.employee_id = e.id AND m.exited_on IS NULL
        WHERE e.organization_id = ${c.organizationId}::uuid
          AND (concat_ws(' ', e.given_name, e.preferred_name, e.family_name) ILIKE ${like} OR m.employee_code::text ILIKE ${like})
        ORDER BY 2 LIMIT 20`;
    });
  }

  cancelTrainingSession(ctx: TenantContext, user: ScopeUser, id: string) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      const s = await tx.trainingSession.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!s) throw new NotFoundException('Not found');
      if (s.cancelledAt) throw new ConflictException('That session is already cancelled.');
      if (s.endsAt.getTime() < Date.now()) throw new ConflictException('That session has ended, so it stays on record.');
      await tx.trainingSession.update({ where: { id }, data: { cancelledAt: new Date() } });
      await audit(tx, c, 'time.training.cancelled', 'training_session', id, { title: s.title });
      return { id };
    });
  }

  registerKiosk(ctx: TenantContext, user: ScopeUser, dto: RegisterKioskDto) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      const org = c.organizationId;
      const loc = await tx.location.findFirst({ where: { organizationId: org, id: dto.locationId, archivedAt: null } });
      if (!loc) throw new NotFoundException('Choose a location of this company.');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`kiosk-code:${org}`}))`;
      let code = dto.code?.toUpperCase();
      if (!code) {
        const prefix = `${loc.code.split(/[^A-Za-z0-9]/)[0].toUpperCase().slice(0, 12)}-K`;
        const taken = new Set((await tx.timeDevice.findMany({ where: { organizationId: org, kind: 'kiosk', code: { startsWith: prefix } }, select: { code: true } })).map((k) => k.code));
        let n = 1;
        while (taken.has(`${prefix}${n}`)) n++;
        code = `${prefix}${n}`;
      } else if (await tx.timeDevice.findFirst({ where: { organizationId: org, kind: 'kiosk', code, status: { in: ['pending', 'active'] } } })) {
        throw new ConflictException(`The kiosk code ${code} is already used. Choose another code.`);
      }
      const setupCode = newSetupCode();
      const expires = new Date(Date.now() + SETUP_CODE_MS);
      const k = await tx.timeDevice.create({ data: { organizationId: org, kind: 'kiosk', code, place: dto.place, locationId: loc.id, mode: dto.mode, status: 'pending', enrolCodeHash: sha256(normalSetupCode(setupCode)), enrolExpiresAt: expires, createdBy: c.userId ?? null } });
      await audit(tx, c, 'time.kiosk.registered', 'time_device', k.id, { code, place: dto.place, location: loc.name, mode: dto.mode });
      return { id: k.id, code, setupCode, setupExpiresAt: expires };
    });
  }

  /** "Reset kiosk key": the tablet stops at once; a new one-time set-up code (30 min) puts it back. */
  resetKiosk(ctx: TenantContext, user: ScopeUser, id: string) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      const k = await this.kiosk(tx, c, id);
      const setupCode = newSetupCode();
      const expires = new Date(Date.now() + SETUP_CODE_MS);
      await tx.timeDevice.update({ where: { id: k.id }, data: { status: 'pending', tokenHash: null, enrolCodeHash: sha256(normalSetupCode(setupCode)), enrolExpiresAt: expires, version: { increment: 1 } } });
      await audit(tx, c, 'time.kiosk.key_reset', 'time_device', k.id, { code: k.code, wasSetUp: k.status === 'active' });
      return { id: k.id, code: k.code, setupCode, setupExpiresAt: expires };
    });
  }

  /** Takes a kiosk out of use for good (its code can be used again). */
  /** Answer 793: a kiosk taken out of use (lost, stolen, replaced), with the reason. */
  revokeKiosk(ctx: TenantContext, user: ScopeUser, id: string, reason: string) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      const k = await this.kiosk(tx, c, id);
      await tx.timeDevice.update({ where: { id: k.id }, data: { status: 'revoked', tokenHash: null, enrolCodeHash: null, enrolExpiresAt: null, decidedBy: c.userId ?? null, decidedAt: new Date(), decisionReason: reason, version: { increment: 1 } } });
      await audit(tx, c, 'time.kiosk.revoked', 'time_device', k.id, { code: k.code, reason });
      return { id: k.id };
    });
  }

  private async kiosk(tx: Tx, c: CompanyContext, id: string) {
    const k = await tx.timeDevice.findFirst({ where: { organizationId: c.organizationId, id, kind: 'kiosk' } });
    if (!k) throw new NotFoundException('Not found');
    if (k.status === 'revoked') throw new ConflictException(`${k.code} was already taken out of use.`);
    return k;
  }

  // ------------------------------------------------------------------------------------------ HR: phones

  private async phone(tx: Tx, c: CompanyContext, id: string) {
    const p = await tx.timeDevice.findFirst({ where: { organizationId: c.organizationId, id, kind: { in: ['phone', 'web'] } } });
    if (!p) throw new NotFoundException('Not found');
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`device:${c.organizationId}:${p.employeeId}`}))`;
    // Read again under the person's lock: someone else may have decided it a moment ago.
    return (await tx.timeDevice.findFirst({ where: { id: p.id } }))!;
  }

  /** Approves a new phone; the person's old phone (active or reported lost) is signed out in the same step. */
  approveBind(ctx: TenantContext, user: ScopeUser, id: string) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      const p = await this.phone(tx, c, id);
      if (p.status !== 'pending') throw new ConflictException('This request was already decided or withdrawn.');
      const web = p.kind === 'web';
      if (p.employeeId && (await myEmployeeId(tx, c.organizationId, c.userId).catch(() => null)) === p.employeeId) throw new ForbiddenException(`You can't approve your own ${web ? 'computer' : 'phone'}. Another HR admin decides it.`);
      // A new phone replaces the old one; an approved computer leaves the person's other devices as they are.
      const old = web ? [] : await tx.timeDevice.findMany({ where: { organizationId: c.organizationId, kind: 'phone', employeeId: p.employeeId, status: { in: ['active', 'lost'] } } });
      const now = new Date();
      await tx.timeDevice.updateMany({ where: { id: { in: old.map((o) => o.id) } }, data: { status: 'revoked', decidedBy: c.userId ?? null, decidedAt: now, decisionReason: 'Replaced by a new phone', version: { increment: 1 } } });
      await tx.timeDevice.update({ where: { id: p.id }, data: { status: 'active', decidedBy: c.userId ?? null, decidedAt: now, version: { increment: 1 } } });
      await audit(tx, c, web ? 'time.web_device.approved' : 'time.phone.approved', 'time_device', p.id, { employeeId: p.employeeId, model: p.model, signedOut: old.map((o) => ({ id: o.id, model: o.model, status: o.status })) });
      return { id: p.id, signedOut: old.map((o) => o.model) };
    });
  }

  refuseBind(ctx: TenantContext, user: ScopeUser, id: string, reason: string) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      const p = await this.phone(tx, c, id);
      if (p.status !== 'pending') throw new ConflictException('This request was already decided or withdrawn.');
      await tx.timeDevice.update({ where: { id: p.id }, data: { status: 'rejected', decidedBy: c.userId ?? null, decidedAt: new Date(), decisionReason: reason, version: { increment: 1 } } });
      await audit(tx, c, p.kind === 'web' ? 'time.web_device.refused' : 'time.phone.refused', 'time_device', p.id, { employeeId: p.employeeId, model: p.model, reason });
      return { id: p.id };
    });
  }

  /**
   * Remote sign-out of a lost or unused phone: it stops recording check-ins at once, and every sign-in of that person
   * ends (sessions are not tied to one device, so the web is signed out too; the person signs in again).
   */
  signOutPhone(ctx: TenantContext, user: ScopeUser, id: string) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      const p = await this.phone(tx, c, id);
      if (p.kind === 'web') {
        // DeviceNotApproved: removing a computer's approval stops web clock-in from it; the person stays signed in.
        if (p.status !== 'active') throw new ConflictException("This computer's approval was already removed.");
        await tx.timeDevice.update({ where: { id: p.id }, data: { status: 'revoked', decidedBy: c.userId ?? null, decidedAt: new Date(), decisionReason: 'Approval removed by HR', version: { increment: 1 } } });
        await audit(tx, c, 'time.web_device.revoked', 'time_device', p.id, { employeeId: p.employeeId, model: p.model });
        return { id: p.id, sessionsEnded: 0 };
      }
      if (p.status !== 'active' && p.status !== 'lost') throw new ConflictException('This phone is already signed out.');
      await tx.timeDevice.update({ where: { id: p.id }, data: { status: 'revoked', decidedBy: c.userId ?? null, decidedAt: new Date(), decisionReason: p.status === 'lost' ? 'Lost: signed out remotely' : 'Signed out remotely', version: { increment: 1 } } });
      const emp = await tx.employee.findFirst({ where: { organizationId: c.organizationId, id: p.employeeId! }, select: { userId: true } });
      const sessions = emp?.userId ? await revokeStaffSessions(tx, { organizationId: c.organizationId, userId: emp.userId }, 'device_signed_out') : 0;
      await audit(tx, c, 'time.phone.signed_out', 'time_device', p.id, { employeeId: p.employeeId, model: p.model, wasLost: p.status === 'lost', sessionsEnded: sessions });
      return { id: p.id, sessionsEnded: sessions };
    });
  }

  // ------------------------------------------------------------------------------------------ HR: kiosk credentials

  private async employee(tx: Tx, c: CompanyContext, employeeId: string) {
    const e = await tx.employee.findFirst({ where: { organizationId: c.organizationId, id: employeeId }, select: { id: true } });
    if (!e) throw new NotFoundException('Not found');
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`device:${c.organizationId}:${e.id}`}))`;
    return e.id;
  }

  /** Clears a person's kiosk PIN and its lock; they choose a new one. */
  resetPin(ctx: TenantContext, user: ScopeUser, employeeId: string) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      const id = await this.employee(tx, c, employeeId);
      await tx.kioskCredential.upsert({ where: { organizationId_employeeId: { organizationId: c.organizationId, employeeId: id } }, update: { pinHash: null, failed: 0, lockedUntil: null, setAt: new Date() }, create: { organizationId: c.organizationId, employeeId: id } });
      await audit(tx, c, 'time.kiosk.pin_reset', 'employee', id, {});
      return { employeeId: id };
    });
  }

  /** A new card nonce: every printed ID-card QR of the person stops working. Returns the new card's QR. */
  rotateQr(ctx: TenantContext, user: ScopeUser, employeeId: string) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      const id = await this.employee(tx, c, employeeId);
      await tx.kioskCredential.upsert({ where: { organizationId_employeeId: { organizationId: c.organizationId, employeeId: id } }, update: { qrNonce: randomUUID() }, create: { organizationId: c.organizationId, employeeId: id } });
      await audit(tx, c, 'time.kiosk.qr_rotated', 'employee', id, {});
      return { employeeId: id, qr: await this.cardToken(tx, c.organizationId, id) };
    });
  }

  /** The QR to print on a person's ID card. */
  cardQr(ctx: TenantContext, user: ScopeUser, employeeId: string) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      const id = await this.employee(tx, c, employeeId);
      await audit(tx, c, 'time.kiosk.qr_issued', 'employee', id, {});
      return { employeeId: id, qr: await this.cardToken(tx, c.organizationId, id) };
    });
  }

  // ------------------------------------------------------------------------------------------ the person: my devices

  private async me(tx: Tx, c: CompanyContext): Promise<{ f: Facts; today: string }> {
    const id = await myEmployeeId(tx, c.organizationId, c.userId);
    const f = await factsOn(tx, c.organizationId, id, todayIst());
    if (!f) throw new NotFoundException('You have no job assignment today. Ask HR to check your record.');
    return { f, today: todayIn(f.zone) };
  }

  /** TIM-12 "Device · not bound" and the kiosk set-up of the person: binding, my phone, my request, PIN and face. */
  mine(ctx: TenantContext, user: ScopeUser) {
    this.self(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { f, today } = await this.me(tx, c);
      const [phones, cred, face] = await Promise.all([
        tx.timeDevice.findMany({ where: { organizationId: org, kind: 'phone', employeeId: f.employeeId }, orderBy: { createdAt: 'desc' }, take: 20 }),
        tx.kioskCredential.findFirst({ where: { organizationId: org, employeeId: f.employeeId } }),
        tx.kioskFaceEnrolment.findFirst({ where: { organizationId: org, employeeId: f.employeeId } }),
      ]);
      const phone = phones.find((p) => p.status === 'active') ?? null;
      const request = phones.find((p) => p.status === 'pending') ?? null;
      const decided = phones.find((p) => p.status === 'rejected' && p.decidedBy !== c.userId) ?? null;
      const now = new Date();
      return {
        binding: await settingOn(tx, c, 'attendance.phone_binding', f, today),
        phone: phone && { id: phone.id, model: phone.model, appVersion: phone.appVersion, approvedAt: phone.decidedAt, lastSeenAt: phone.lastSeenAt },
        request: request && { id: request.id, model: request.model, reason: request.requestReason, oldPhoneLost: request.replacesLost, raisedAt: request.createdAt },
        lastRefusal: decided && (!request || decided.createdAt > request.createdAt) ? { model: decided.model, reason: decided.decisionReason, decidedAt: decided.decidedAt } : null,
        kiosk: {
          methods: await this.methodsAt(tx, org, f.locationId),
          pinSet: Boolean(cred?.pinHash),
          locked: Boolean(cred?.lockedUntil && cred.lockedUntil > now),
          faceConsent: Boolean(face && !face.withdrawnAt),
          faceAvailable: Boolean(this.face),
        },
      };
    });
  }

  /** Ask to bind this phone (TIM-12): HR approves it; "old phone lost" stops the old one at once. */
  requestBind(ctx: TenantContext, user: ScopeUser, dto: BindRequestDto) {
    this.self(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { f } = await this.me(tx, c);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`device:${org}:${f.employeeId}`}))`;
      const hash = sha256(dto.installId);
      const mine = await tx.timeDevice.findMany({ where: { organizationId: org, kind: 'phone', employeeId: f.employeeId, status: { in: ['pending', 'active'] } } });
      if (mine.some((p) => p.status === 'active' && p.installHash === hash)) throw new ConflictException('This phone is already approved for check-in.');
      if (mine.some((p) => p.status === 'pending')) throw new ConflictException('You already asked to bind a phone. Withdraw that request first, or wait for HR.');
      const old = mine.find((p) => p.status === 'active');
      if (dto.oldPhoneLost && old) {
        await tx.timeDevice.update({ where: { id: old.id }, data: { status: 'lost', decisionReason: 'Reported lost by the employee', version: { increment: 1 } } });
        await audit(tx, c, 'time.phone.reported_lost', 'time_device', old.id, { employeeId: f.employeeId, model: old.model });
      }
      const p = await tx.timeDevice.create({ data: { organizationId: org, kind: 'phone', employeeId: f.employeeId, model: dto.model, appVersion: dto.appVersion ?? null, installHash: hash, requestReason: dto.reason ?? null, replacesLost: Boolean(dto.oldPhoneLost), status: 'pending', createdBy: c.userId ?? null } });
      await audit(tx, c, 'time.phone.bind_requested', 'time_device', p.id, { model: dto.model, oldPhoneLost: Boolean(dto.oldPhoneLost) });
      return { id: p.id, status: 'pending' };
    });
  }

  withdrawBind(ctx: TenantContext, user: ScopeUser) {
    this.self(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { f } = await this.me(tx, c);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`device:${c.organizationId}:${f.employeeId}`}))`;
      const p = await tx.timeDevice.findFirst({ where: { organizationId: c.organizationId, kind: 'phone', employeeId: f.employeeId, status: 'pending' } });
      if (!p) throw new ConflictException('You have no phone request waiting.');
      await tx.timeDevice.update({ where: { id: p.id }, data: { status: 'rejected', decidedBy: c.userId ?? null, decidedAt: new Date(), decisionReason: 'Withdrawn by the employee', version: { increment: 1 } } });
      await audit(tx, c, 'time.phone.bind_withdrawn', 'time_device', p.id, {});
      return { id: p.id };
    });
  }

  /** My kiosk PIN (argon2id; never stored or logged as typed). A new PIN clears a lock. */
  setPin(ctx: TenantContext, user: ScopeUser, pin: string) {
    this.self(user);
    const problem = pinProblem(pin);
    if (problem) throw new BadRequestException(problem);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { f } = await this.me(tx, c);
      const pinHash = await argon2.hash(pin, { type: argon2.argon2id });
      await tx.kioskCredential.upsert({ where: { organizationId_employeeId: { organizationId: c.organizationId, employeeId: f.employeeId } }, update: { pinHash, failed: 0, lockedUntil: null, setAt: new Date() }, create: { organizationId: c.organizationId, employeeId: f.employeeId, pinHash } });
      await audit(tx, c, 'time.kiosk.pin_set', 'employee', f.employeeId, {});
      return { pinSet: true };
    });
  }

  myQr(ctx: TenantContext, user: ScopeUser) {
    this.self(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { f } = await this.me(tx, c);
      return { qr: await this.cardToken(tx, c.organizationId, f.employeeId) };
    });
  }

  /** Face sign-in at kiosks: only with the person's consent; the photo goes to the provider and is not kept. */
  async giveFaceConsent(ctx: TenantContext, user: ScopeUser, dto: FaceConsentDto) {
    this.self(user);
    if (!this.face) throw new ConflictException('Face sign-in is not available yet. Use your code and PIN, or your ID card.');
    const image = Buffer.from(dto.image, 'base64');
    if (image.length < 16) throw new BadRequestException('The photo could not be read. Take it again.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { f } = await this.me(tx, c);
      const ref = await this.face!.enrol(c.organizationId, f.employeeId, image);
      const now = new Date();
      await tx.kioskFaceEnrolment.upsert({ where: { organizationId_employeeId: { organizationId: c.organizationId, employeeId: f.employeeId } }, update: { provider: this.face!.name, providerRef: ref, consentedAt: now, withdrawnAt: null }, create: { organizationId: c.organizationId, employeeId: f.employeeId, provider: this.face!.name, providerRef: ref, consentedAt: now } });
      await audit(tx, c, 'time.kiosk.face_consent_given', 'employee', f.employeeId, { provider: this.face!.name });
      return { faceConsent: true };
    });
  }

  withdrawFaceConsent(ctx: TenantContext, user: ScopeUser) {
    this.self(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { f } = await this.me(tx, c);
      const e = await tx.kioskFaceEnrolment.findFirst({ where: { organizationId: c.organizationId, employeeId: f.employeeId, withdrawnAt: null } });
      if (!e) throw new ConflictException('You have not given consent for face sign-in.');
      if (e.providerRef && this.face) await this.face.forget(c.organizationId, e.providerRef);
      await tx.kioskFaceEnrolment.update({ where: { organizationId_employeeId: { organizationId: c.organizationId, employeeId: f.employeeId } }, data: { withdrawnAt: new Date(), providerRef: null } });
      await audit(tx, c, 'time.kiosk.face_consent_withdrawn', 'employee', f.employeeId, {});
      return { faceConsent: false };
    });
  }

  // ------------------------------------------------------------------------------------------ punches from devices

  /**
   * One device punch, once (rule 14): the device's own id for the punch (client_ref) keys a receipt written in the same
   * transaction; a repeat returns the first result and never makes a second punch, also when two arrive at once.
   */
  async punchOnce(c: CompanyContext, item: DevicePunchDto, resolve: (tx: Tx) => Promise<{ deviceId: string; f: Facts; source: 'kiosk' | 'mobile'; pin?: { lat: number; lng: number; accuracyM?: number } | null; ip?: string | null; device?: string | null; kioskLocationId?: string }>): Promise<PunchResult> {
    let deviceId: string | null = null;
    const read = () => this.tenantPrisma.forTenant(c, (tx) => tx.devicePunchReceipt.findUnique({ where: { organizationId_deviceId_clientRef: { organizationId: c.organizationId, deviceId: deviceId!, clientRef: item.clientRef } } }));
    try {
      return await this.tenantPrisma.forTenant(c, async (tx) => {
        const r = await resolve(tx);
        deviceId = r.deviceId;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`punch:${c.organizationId}:${r.f.employeeId}`}))`;
        const seen = await tx.devicePunchReceipt.findUnique({ where: { organizationId_deviceId_clientRef: { organizationId: c.organizationId, deviceId: r.deviceId, clientRef: item.clientRef } } });
        if (seen) return { ...(seen.result as unknown as PunchResult), repeat: true };
        const at = new Date(item.punchedAt);
        const problem = punchTimeProblem(at);
        if (problem) throw new BadRequestException(problem);
        const out = await this.attendance.record(tx, c, r.f, { kind: item.kind, at, source: r.source, pin: r.pin ?? null, ip: r.ip ?? null, device: r.device ?? null, kioskLocationId: r.kioskLocationId });
        const result: PunchResult = { accepted: out.accepted, duplicate: out.duplicate, kind: out.kind, at: out.at.toISOString(), verdict: out.verdict, message: out.message, distanceM: out.distanceM, punchId: out.punchId };
        await tx.devicePunchReceipt.create({ data: { organizationId: c.organizationId, deviceId: r.deviceId, clientRef: item.clientRef, punchId: out.duplicate ? null : out.punchId, result: result as unknown as Prisma.InputJsonValue } });
        return result;
      });
    } catch (e) {
      if (isUnique(e) && deviceId) {
        const seen = await read();
        if (seen) return { ...(seen.result as unknown as PunchResult), repeat: true };
      }
      throw mapDbError(e);
    }
  }

  /** Many offline punches: each its own result, in order; one refusal never stops the others. */
  async each<T extends { clientRef: string }>(items: readonly T[], one: (item: T) => Promise<PunchResult>): Promise<{ results: SyncResult[] }> {
    const results: SyncResult[] = [];
    for (const item of items) {
      try {
        results.push({ clientRef: item.clientRef, ok: true, ...(await one(item)) });
      } catch (e) {
        if (!(e instanceof HttpException)) throw e;
        const body = e.getResponse() as string | { message?: string | string[] };
        const message = typeof body === 'string' ? body : Array.isArray(body.message) ? body.message.join('; ') : (body.message ?? e.message);
        results.push({ clientRef: item.clientRef, ok: false, status: e.getStatus(), message });
      }
    }
    return { results };
  }

  /**
   * The person's phone for a phone punch. Phone binding on (attendance.phone_binding): only their approved phone.
   * Off: any phone of theirs; a phone seen for the first time becomes their phone (the previous one is replaced),
   * so its offline punches still have a receipt. A phone reported lost never punches.
   */
  private async phoneFor(tx: Tx, c: CompanyContext, f: Facts, installId: string): Promise<string> {
    const org = c.organizationId;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`device:${org}:${f.employeeId}`}))`;
    const hash = sha256(installId);
    const binding = await settingOn(tx, c, 'attendance.phone_binding', f, todayIn(f.zone));
    const rows = await tx.timeDevice.findMany({ where: { organizationId: org, kind: 'phone', employeeId: f.employeeId, installHash: hash }, orderBy: { createdAt: 'desc' } });
    const active = rows.find((p) => p.status === 'active');
    if (active) {
      if (!active.lastSeenAt || Date.now() - active.lastSeenAt.getTime() > 60_000) await tx.timeDevice.update({ where: { id: active.id }, data: { lastSeenAt: new Date() } });
      return active.id;
    }
    if (rows.some((p) => p.status === 'lost')) throw new ForbiddenException({ statusCode: 403, code: 'PHONE_LOST', message: 'This phone was reported lost, so it cannot record check-ins. Use your new phone or a kiosk.' });
    if (binding === 'on') throw new ForbiddenException({ statusCode: 403, code: 'PHONE_NOT_APPROVED', message: 'Check-in from a phone needs an approved phone. Ask to bind this phone; HR approves it.' });
    await tx.timeDevice.updateMany({ where: { organizationId: org, kind: 'phone', employeeId: f.employeeId, status: 'active' }, data: { status: 'revoked', decisionReason: 'Replaced (phone binding is off)', decidedAt: new Date(), version: { increment: 1 } } });
    const p = await tx.timeDevice.create({ data: { organizationId: org, kind: 'phone', employeeId: f.employeeId, installHash: hash, status: 'active', decidedAt: new Date(), decisionReason: 'Phone binding is off', lastSeenAt: new Date(), createdBy: c.userId ?? null } });
    await audit(tx, c, 'time.phone.auto_bound', 'time_device', p.id, { employeeId: f.employeeId });
    return p.id;
  }

  private phoneResolve(c: CompanyContext, installId: string, item: PhonePunchItemDto, ip: string | null, ua: string | null) {
    return async (tx: Tx) => {
      const id = await myEmployeeId(tx, c.organizationId, c.userId);
      const on = localDate(new Date(item.punchedAt), 'Asia/Kolkata');
      const f = await factsOn(tx, c.organizationId, id, on);
      if (!f) throw new NotFoundException('You had no job assignment on that day. Ask HR to check your record.');
      if ((item.lat === undefined) !== (item.lng === undefined)) throw new BadRequestException('Send both latitude and longitude, or neither.');
      const deviceId = await this.phoneFor(tx, c, f, installId);
      return { deviceId, f, source: 'mobile' as const, pin: item.lat !== undefined ? { lat: item.lat, lng: item.lng!, accuracyM: item.accuracyM } : null, ip, device: ua };
    };
  }

  /** TIM-12: a punch from the person's phone, safe to send again (same clientRef: the first result). */
  phonePunch(ctx: TenantContext, user: ScopeUser, dto: PhonePunchDto, ip: string | null, ua: string | null) {
    this.self(user);
    const c = companyContext(ctx);
    return this.punchOnce(c, dto, this.phoneResolve(c, dto.installId, dto, ip, ua));
  }

  /** TIM-12 "waiting to sync": the phone's offline punches, each with its own result. */
  phoneSync(ctx: TenantContext, user: ScopeUser, dto: PhoneSyncDto, ip: string | null, ua: string | null) {
    this.self(user);
    const c = companyContext(ctx);
    return this.each(dto.items, (item) => this.punchOnce(c, item, this.phoneResolve(c, dto.installId, item, ip, ua)));
  }
}
