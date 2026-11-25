import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DateTime } from 'luxon';
import * as argon2 from 'argon2';
import { SignJWT, jwtVerify } from 'jose';
import { TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit } from '../org-structure/org-structure.service';
import { DevicesService, type PunchResult } from './devices.service';
import { ContractAttendanceService } from '../contract-labour/attendance.service';
import { DevicePunchDto, KioskIdentifyDto, KioskSyncItemDto } from './devices.dto';
import { KIOSK_PERSON_SECONDS, afterWrongPin, normalSetupCode, newDeviceToken, pinLocked, sha256, tokenOrg } from './device-rules';
import { SETTINGS } from '../org-structure/settings-registry';
import { LeaveService } from './leave.service';
import { Facts, asDate, dateOf, factsOn, holidaysFor, leaveDays, settingOn, todayIn } from './time-core';
import { ScheduleBook } from './schedule';
import { addDays, localDate } from './time-maths';

// TIM-13 Kiosk (feature sheet rule 14): a shared tablet with no user sign-in. HR's one-time set-up code becomes the
// kiosk's own secret (only its SHA-256 is kept); every call carries it. A person is identified by employee code and
// PIN (argon2; kiosk.pin_tries wrong tries lock the code for 15 minutes; an unknown code and a wrong PIN get the same
// answer, so codes cannot be probed), by the ID-card QR (a signed token a rotated nonce voids) or, with consent on
// record, by face (provider adapter). kiosk.methods decides which, per location. The kiosk then acts for that person
// for two minutes: check in or out (the same rules as the web punch, once per client_ref), today's status, requests.

export interface Kiosk {
  org: string;
  deviceId: string;
  code: string;
  place: string;
  locationId: string;
  mode: string;
}

const LOOKUP: { organizationId: string; isSuperAdmin: true } = { organizationId: '00000000-0000-0000-0000-000000000000', isSuperAdmin: true };
const PERSON_AUDIENCE = 'yx-kiosk-person';
const CARD_AUDIENCE = 'yx-kiosk-card';
const BAD_SETUP = 'This set-up code is not right or has expired. Ask HR for a new code on Devices and kiosks.';
const NOT_SET_UP = 'This kiosk is not set up, or HR reset it. Ask HR for a set-up code.';
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';
const clock = (at: Date, zone: string) => DateTime.fromJSDate(at, { zone }).toFormat('h:mm a').toLowerCase();
const ctxOf = (k: Kiosk): CompanyContext => ({ organizationId: k.org, isSuperAdmin: false, userId: null, role: null, supportSessionId: null });

/** A stored argon2id hash nothing matches: an unknown code costs the same time as a wrong PIN. */
let dummyHash: Promise<string> | null = null;
/** A kiosk person who is a contract worker (answer 625): their attendance is contract labour's, never an employee punch. */
const CW = 'cw:';
const employeeOnly = (id: string) => {
  if (id.startsWith(CW)) throw new ForbiddenException('Leave and training at the kiosk are for employees. Ask your contractor.');
};
const dummy = () => (dummyHash ??= argon2.hash(`no-pin-${Math.random()}`, { type: argon2.argon2id }));

@Injectable()
export class KioskService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly devices: DevicesService,
    private readonly leaves: LeaveService,
    private readonly cw: ContractAttendanceService,
  ) {}

  // ------------------------------------------------------------------------------------------ set-up and the guard

  /** The one-time code becomes the kiosk's secret, returned once. */
  async setup(code: string) {
    const hash = sha256(normalSetupCode(code));
    const found = await this.tenantPrisma.forTenant(LOOKUP, (tx) => tx.timeDevice.findFirst({ where: { kind: 'kiosk', status: 'pending', enrolCodeHash: hash }, select: { id: true, organizationId: true, enrolExpiresAt: true } }));
    if (!found || !found.enrolExpiresAt || found.enrolExpiresAt.getTime() < Date.now()) throw new BadRequestException(BAD_SETUP);
    const token = newDeviceToken(found.organizationId);
    const c: CompanyContext = { organizationId: found.organizationId, isSuperAdmin: false, userId: null, role: null, supportSessionId: null };
    const k = await this.tenantPrisma.forTenant(c, async (tx) => {
      // Once: a second tablet with the same code a moment later finds it used.
      const n = await tx.timeDevice.updateMany({ where: { id: found.id, status: 'pending', enrolCodeHash: hash }, data: { status: 'active', tokenHash: sha256(token), enrolCodeHash: null, enrolExpiresAt: null, lastSeenAt: new Date(), version: { increment: 1 } } });
      if (n.count !== 1) throw new BadRequestException(BAD_SETUP);
      await audit(tx, c, 'time.kiosk.set_up', 'time_device', found.id, {});
      return (await tx.timeDevice.findFirst({ where: { id: found.id } }))!;
    });
    return { token, kiosk: await this.info({ org: k.organizationId, deviceId: k.id, code: k.code!, place: k.place ?? '', locationId: k.locationId!, mode: k.mode ?? 'attendance' }) };
  }

  /** The kiosk behind a token, or 401. Last seen is kept fresh (at most one write a minute). */
  async authenticate(token: string | undefined): Promise<Kiosk> {
    const org = token ? tokenOrg(token) : null;
    if (!token || !org) throw new UnauthorizedException(NOT_SET_UP);
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: null, role: null, supportSessionId: null };
    const k = await this.tenantPrisma.forTenant(c, async (tx) => {
      const row = await tx.timeDevice.findFirst({ where: { organizationId: org, kind: 'kiosk', status: 'active', tokenHash: sha256(token) } });
      if (row && (!row.lastSeenAt || Date.now() - row.lastSeenAt.getTime() > 60_000)) await tx.timeDevice.update({ where: { id: row.id }, data: { lastSeenAt: new Date() } });
      return row;
    });
    if (!k) throw new UnauthorizedException(NOT_SET_UP);
    return { org, deviceId: k.id, code: k.code!, place: k.place ?? '', locationId: k.locationId!, mode: k.mode ?? 'attendance' };
  }

  /** What the kiosk screen needs: its place, the sign-in methods here, and the shape of employee codes. */
  info(k: Kiosk) {
    return this.tenantPrisma.forTenant(ctxOf(k), async (tx) => {
      const [org, loc] = await Promise.all([tx.organization.findUnique({ where: { id: k.org }, select: { name: true } }), tx.location.findFirst({ where: { organizationId: k.org, id: k.locationId }, select: { name: true, timezone: true } })]);
      // The most common code shape, e.g. "KF-" and 4 digits: the keypad types the digits.
      const [shape] = await tx.$queryRaw<{ prefix: string; digits: number }[]>`
        SELECT substring(employee_code::text from '^(.*?)[0-9]+$') AS prefix, length(substring(employee_code::text from '([0-9]+)$'))::int AS digits
        FROM employments WHERE organization_id = ${k.org}::uuid AND employee_code ~ '[0-9]+$' AND (exited_on IS NULL OR exited_on >= current_date)
        GROUP BY 1, 2 ORDER BY count(*) DESC LIMIT 1`;
      return { company: org?.name ?? '', location: loc?.name ?? '', zone: loc?.timezone ?? 'Asia/Kolkata', place: k.place, code: k.code, mode: k.mode, methods: await this.devices.methodsAt(tx, k.org, k.locationId), codePrefix: shape?.prefix ?? '', codeDigits: shape?.digits ?? 4, pinTries: await this.devices.pinTries(tx, k.org) };
    });
  }

  // ------------------------------------------------------------------------------------------ who is at the kiosk

  private noMatch(tries: number) {
    return new ForbiddenException({ statusCode: 403, code: 'NO_MATCH', message: `Code or PIN didn't match. After ${tries} wrong tries a code locks for 15 minutes. Forgot your PIN? Scan your ID card or ask your supervisor.` });
  }

  private attendanceOnly(k: Kiosk) {
    if (k.mode !== 'attendance') throw new ConflictException('This kiosk signs in visitors. Use an attendance kiosk to check in.');
  }

  /** Employee code and PIN, the ID-card QR, or face; the employee id, or the refusal. Wrong tries are recorded. */
  private async who(k: Kiosk, dto: Pick<KioskIdentifyDto, 'method' | 'code' | 'pin' | 'qr' | 'image'>): Promise<string> {
    const c = ctxOf(k);
    const methods = await this.tenantPrisma.forTenant(c, (tx) => this.devices.methodsAt(tx, k.org, k.locationId));
    const NAMES: Record<string, string> = { pin: 'code and PIN', qr: 'ID card', face: 'face' };
    if (!methods.includes(dto.method)) throw new ForbiddenException(`This kiosk does not take ${NAMES[dto.method]} sign-in. Ask HR which to use here.`);
    if (dto.method === 'pin') return this.byPin(k, dto.code ?? '', dto.pin ?? '');
    if (dto.method === 'qr') return this.byCard(k, dto.qr ?? '');
    return this.byFace(k, dto.image ?? '');
  }

  private async byPin(k: Kiosk, code: string, pin: string): Promise<string> {
    const c = ctxOf(k);
    const now = new Date();
    const out = await this.tenantPrisma.forTenant(c, async (tx) => {
      const tries = await this.devices.pinTries(tx, k.org);
      const [emp] = code ? await tx.$queryRaw<{ id: string }[]>`
        SELECT m.employee_id::text AS id FROM employments m
        WHERE m.organization_id = ${k.org}::uuid AND m.employee_code = ${code} AND (m.exited_on IS NULL OR m.exited_on >= current_date)
        ORDER BY m.joined_on DESC LIMIT 1` : [];
      // Contract labour answer 625: a contract worker signs in with the gate pass number and their own kiosk PIN.
      if (!emp && code) {
        const cw = await this.cw.byGatePass(tx, c, k.locationId, code, pin, tries, await dummy());
        if (cw) return { id: `${CW}${cw}`, tries };
      }
      if (emp) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`device:${k.org}:${emp.id}`}))`;
      const cred = emp ? await tx.kioskCredential.findFirst({ where: { organizationId: k.org, employeeId: emp.id } }) : null;
      const locked = pinLocked(cred?.lockedUntil ?? null, now);
      // Always one argon2 check, so time does not tell an unknown code from a wrong PIN.
      const ok = (await argon2.verify(cred?.pinHash && !locked ? cred.pinHash : await dummy(), /^\d{4}$/.test(pin) ? pin : 'x').catch(() => false)) && Boolean(cred?.pinHash) && !locked;
      if (ok) {
        if (cred!.failed) await tx.kioskCredential.update({ where: { organizationId_employeeId: { organizationId: k.org, employeeId: emp!.id } }, data: { failed: 0 } });
        return { id: emp!.id, tries };
      }
      if (cred && cred.pinHash && !locked) {
        const next = afterWrongPin(cred.failed, tries, now);
        await tx.kioskCredential.update({ where: { organizationId_employeeId: { organizationId: k.org, employeeId: emp!.id } }, data: next });
        await audit(tx, c, next.lockedUntil ? 'time.kiosk.pin_locked' : 'time.kiosk.pin_failed', 'employee', emp!.id, { kiosk: k.code, ...(next.lockedUntil ? { lockedUntil: next.lockedUntil.toISOString() } : {}) });
      } else {
        await audit(tx, c, 'time.kiosk.sign_in_refused', 'time_device', k.deviceId, { reason: !emp ? 'unknown_code' : locked ? 'locked' : 'no_pin' });
      }
      return { id: null, tries };
    });
    if (!out.id) throw this.noMatch(out.tries);
    return out.id;
  }

  private async byCard(k: Kiosk, qr: string): Promise<string> {
    const invalid = new ForbiddenException({ statusCode: 403, code: 'CARD_INVALID', message: 'This ID card is not valid any more. Use your code and PIN, and ask HR for a new card.' });
    let sub: string;
    let nonce: unknown;
    try {
      const v = await jwtVerify(qr, this.devices.key(k.org, 'card'), { issuer: k.org, audience: CARD_AUDIENCE, algorithms: ['HS256'] });
      sub = String(v.payload.sub ?? '');
      nonce = v.payload.n;
    } catch {
      await this.tenantPrisma.forTenant(ctxOf(k), (tx) => audit(tx, ctxOf(k), 'time.kiosk.sign_in_refused', 'time_device', k.deviceId, { reason: 'bad_card' }));
      throw invalid;
    }
    const ok = await this.tenantPrisma.forTenant(ctxOf(k), async (tx) => {
      const cred = await tx.kioskCredential.findFirst({ where: { organizationId: k.org, employeeId: sub } });
      const good = Boolean(cred && cred.qrNonce === nonce && (await factsOn(tx, k.org, sub, localDate(new Date(), 'Asia/Kolkata'))));
      if (!good) await audit(tx, ctxOf(k), 'time.kiosk.sign_in_refused', 'time_device', k.deviceId, { reason: 'card_voided' });
      return good;
    });
    if (!ok) throw invalid;
    return sub;
  }

  private async byFace(k: Kiosk, image: string): Promise<string> {
    const face = this.devices.faceProvider;
    if (!face) throw new ConflictException('Face sign-in is not available on this kiosk. Use your code and PIN, or your ID card.');
    const photo = Buffer.from(image, 'base64');
    if (photo.length < 16) throw new BadRequestException('The photo could not be read. Look at the camera and try again.');
    const enrolled = await this.tenantPrisma.forTenant(ctxOf(k), (tx) => tx.kioskFaceEnrolment.findMany({ where: { organizationId: k.org, withdrawnAt: null, providerRef: { not: null } }, select: { employeeId: true, providerRef: true } }));
    const id = await face.identify(k.org, photo, enrolled.map((e) => ({ employeeId: e.employeeId, providerRef: e.providerRef! })));
    if (!id) throw new ForbiddenException({ statusCode: 403, code: 'NO_MATCH', message: "Face not recognised. Use your code and PIN, or your ID card." });
    return id;
  }

  /** Identifies a person: a two-minute pass for this kiosk and their first name (nothing else personal). */
  async identify(k: Kiosk, dto: KioskIdentifyDto) {
    this.attendanceOnly(k);
    const id = await this.who(k, dto);
    if (id.startsWith(CW)) {
      const name = await this.tenantPrisma.forTenant(ctxOf(k), (tx) => this.cw.kioskName(tx, ctxOf(k), id.slice(CW.length)));
      const pass = await new SignJWT({ dev: k.deviceId }).setProtectedHeader({ alg: 'HS256' }).setIssuer(k.org).setAudience(PERSON_AUDIENCE).setSubject(id).setIssuedAt().setExpirationTime(`${KIOSK_PERSON_SECONDS}s`).sign(this.devices.key(k.org, 'person'));
      return { person: pass, firstName: name, expiresInSeconds: KIOSK_PERSON_SECONDS };
    }
    const f = await this.tenantPrisma.forTenant(ctxOf(k), (tx) => factsOn(tx, k.org, id, localDate(new Date(), 'Asia/Kolkata')));
    if (!f) throw this.noMatch(5);
    const person = await new SignJWT({ dev: k.deviceId }).setProtectedHeader({ alg: 'HS256' }).setIssuer(k.org).setAudience(PERSON_AUDIENCE).setSubject(id).setIssuedAt().setExpirationTime(`${KIOSK_PERSON_SECONDS}s`).sign(this.devices.key(k.org, 'person'));
    return { person, firstName: firstName(f.name), expiresInSeconds: KIOSK_PERSON_SECONDS };
  }

  private async person(k: Kiosk, token: string | undefined): Promise<string> {
    try {
      const v = await jwtVerify(token ?? '', this.devices.key(k.org, 'person'), { issuer: k.org, audience: PERSON_AUDIENCE, algorithms: ['HS256'] });
      if (v.payload.dev !== k.deviceId || !v.payload.sub) throw new Error('other kiosk');
      return v.payload.sub;
    } catch {
      throw new ForbiddenException({ statusCode: 403, code: 'PERSON_EXPIRED', message: 'Your turn at the kiosk has ended. Start again with your code.' });
    }
  }

  private async factsNow(tx: Tx, k: Kiosk, employeeId: string, at = new Date()): Promise<Facts> {
    const f = await factsOn(tx, k.org, employeeId, localDate(at, 'Asia/Kolkata'));
    if (!f) throw new ForbiddenException({ statusCode: 403, code: 'NO_MATCH', message: 'You have no job assignment on that day. Ask HR to check your record.' });
    return f;
  }

  // ------------------------------------------------------------------------------------------ what the kiosk shows

  /** Today for the person at the kiosk: first name, shift, punches (times only), what the next punch is, requests. */
  async today(k: Kiosk, token: string | undefined) {
    const id = await this.person(k, token);
    if (id.startsWith(CW)) return this.tenantPrisma.forTenant(ctxOf(k), (tx) => this.cw.kioskToday(tx, ctxOf(k), id.slice(CW.length)));
    return this.tenantPrisma.forTenant(ctxOf(k), async (tx) => {
      const f = await this.factsNow(tx, k, id);
      const today = todayIn(f.zone);
      const day = await (await ScheduleBook.load(tx, k.org)).day(f, today);
      const punches = await tx.punch.findMany({ where: { organizationId: k.org, employeeId: id, workOn: asDate(today), accepted: true }, orderBy: { punchedAt: 'asc' }, select: { kind: true, punchedAt: true } });
      const [leave, fixes] = await Promise.all([
        tx.$queryRaw<{ id: string; type: string; from: Date; to: Date; days: number; status: string }[]>`
          SELECT r.id::text, t.name AS type, r.from_on AS "from", r.to_on AS "to", r.days::float AS days, r.status FROM leave_requests r
          JOIN leave_types t ON t.organization_id = r.organization_id AND t.id = r.leave_type_id
          WHERE r.organization_id = ${k.org}::uuid AND r.employee_id = ${id}::uuid AND r.to_on >= ${today}::date - 30
          ORDER BY r.from_on DESC LIMIT 5`,
        tx.attendanceRequest.findMany({ where: { organizationId: k.org, employeeId: id, workOn: { gte: asDate(today) } }, orderBy: { workOn: 'desc' }, take: 3 }),
      ]);
      const last = punches.at(-1)?.kind;
      return {
        firstName: firstName(f.name),
        today,
        zone: f.zone,
        // The menu offers Apply leave only where the company allows it here (setting kiosk.leave, default on).
        leave: (await settingOn(tx, ctxOf(k), 'kiosk.leave', f, today)) === 'on',
        shift: day.shift ? { name: day.shift.name, start: day.shift.shiftStart, end: day.shift.shiftEnd, grace: day.shift.graceMinutes } : null,
        punches: punches.map((p) => ({ kind: p.kind, at: p.punchedAt })),
        next: last && last !== 'out' ? 'out' : 'in',
        requests: [
          ...leave.map((r) => ({ id: r.id, kind: 'leave', label: r.type, from: dateOf(r.from), to: dateOf(r.to), days: r.days, status: r.status })),
          ...fixes.map((r) => ({ id: r.id, kind: r.kind === 'wfh' ? 'wfh' : 'fix', label: r.kind === 'wfh' ? 'Work from home' : 'Attendance fix', from: dateOf(r.workOn), to: dateOf(r.workOn), days: 1, status: r.status })),
        ],
      };
    });
  }

  // ------------------------------------------------------------------------------------------ unknown code (TIM-13)

  /**
   * Before the PIN: is this employee code known here? Founder decision (30 Oct 2026): an unknown code is told apart
   * (kiosk.tell_unknown_code, default yes); the kiosk secret and the per-kiosk rate limit stop anyone probing codes.
   * With the setting off every code goes on to the PIN, and an unknown one gets the PIN answer.
   */
  async checkCode(k: Kiosk, code: string) {
    this.attendanceOnly(k);
    const c = ctxOf(k);
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const methods = await this.devices.methodsAt(tx, k.org, k.locationId);
      if (!methods.includes('pin')) throw new ForbiddenException('This kiosk does not take code and PIN sign-in. Ask HR which to use here.');
      const tell = await tx.setting.findFirst({ where: { organizationId: k.org, key: 'kiosk.tell_unknown_code', scopeType: 'tenant' } });
      if (String(tell?.value ?? SETTINGS['kiosk.tell_unknown_code'].default) !== 'yes') return { known: true };
      const [emp] = await tx.$queryRaw<{ id: string }[]>`
        SELECT m.employee_id::text AS id FROM employments m
        WHERE m.organization_id = ${k.org}::uuid AND m.employee_code = ${code} AND (m.exited_on IS NULL OR m.exited_on >= current_date) LIMIT 1`;
      if (emp || (await this.cw.knownGatePass(tx, c, k.locationId, code))) return { known: true };
      await audit(tx, c, 'time.kiosk.sign_in_refused', 'time_device', k.deviceId, { reason: 'unknown_code' });
      throw new NotFoundException({ statusCode: 404, code: 'UNKNOWN_CODE', message: `No one with code ${code}. Check the code on your ID card and try again.` });
    });
  }

  // ------------------------------------------------------------------------------------------ leave at the kiosk (TIM-13)

  /** Kinds a person applies for at a kiosk; sick leave is recorded by the supervisor, special leave goes through HR. */
  private static readonly KIOSK_KINDS = ['earned', 'casual', 'comp_off'];

  private async leaveFacts(tx: Tx, k: Kiosk, id: string) {
    const f = await this.factsNow(tx, k, id);
    if ((await settingOn(tx, ctxOf(k), 'kiosk.leave', f, todayIn(f.zone))) !== 'on') throw new ForbiddenException({ statusCode: 403, code: 'KIOSK_LEAVE_OFF', message: 'Leave is not applied at this kiosk. Ask your supervisor.' });
    return f;
  }

  /** What Apply leave shows: the types with days left (after pending requests), sick leave, the approver, the next 10 days. */
  async leave(k: Kiosk, token: string | undefined) {
    this.attendanceOnly(k);
    const id = await this.person(k, token);
    employeeOnly(id);
    return this.tenantPrisma.forTenant(ctxOf(k), async (tx) => {
      const f = await this.leaveFacts(tx, k, id);
      const today = todayIn(f.zone);
      const balances = (await this.leaves.balancesIn(tx, ctxOf(k), f, today)).filter((b) => b.hasBalance);
      const from = addDays(today, 1);
      const to = addDays(today, 10);
      const { map } = await holidaysFor(tx, k.org, f.locationId, from, to, f.employeeId);
      const book = await ScheduleBook.load(tx, k.org);
      await book.prime([f.employeeId], from, to);
      const [approved, pending] = await Promise.all([leaveDays(tx, k.org, f.employeeId, from, to), leaveDays(tx, k.org, f.employeeId, from, to, ['pending'])]);
      const days = [];
      for (let d = from; d <= to; d = addDays(d, 1)) {
        const day = await book.day(f, d);
        const holiday = map.get(d)?.name ?? null;
        const note = approved.has(d) ? 'On leave' : pending.has(d) ? 'Requested' : day.weeklyOff ? 'Weekly off' : holiday && !day.shift ? 'Holiday' : null;
        days.push({ on: d, note, holiday, hint: !note && holiday ? 'Holiday shift' : null });
      }
      const [boss] = f.managerEmployeeId ? await tx.$queryRaw<{ name: string }[]>`SELECT concat_ws(' ', coalesce(preferred_name, given_name), family_name) AS name FROM employees WHERE organization_id = ${k.org}::uuid AND id = ${f.managerEmployeeId}::uuid` : [];
      const sick = balances.find((b) => b.kind === 'sick');
      return {
        firstName: firstName(f.name),
        today,
        types: balances.filter((b) => KioskService.KIOSK_KINDS.includes(b.kind)).map((b) => ({ id: b.leaveTypeId, name: b.name, kind: b.kind, available: b.available, pending: b.pending })),
        sick: sick ? { name: sick.name, available: sick.available } : null,
        approver: boss?.name ?? null,
        days,
      };
    });
  }

  /** Apply leave at the kiosk: whole days from tomorrow, a kiosk kind, then the normal rules and approval chain. */
  async applyLeave(k: Kiosk, dto: { person: string; leaveTypeId: string; from: string; to: string }) {
    this.attendanceOnly(k);
    const id = await this.person(k, dto.person);
    employeeOnly(id);
    const f = await this.tenantPrisma.forTenant(ctxOf(k), async (tx) => {
      const facts = await this.leaveFacts(tx, k, id);
      const today = todayIn(facts.zone);
      if (dto.from <= today) throw new BadRequestException('Pick days from tomorrow. For today, ask your supervisor.');
      if (dto.to < dto.from) throw new BadRequestException('Tap the first day, then the last day.');
      if (dto.to > addDays(today, 30)) throw new BadRequestException('At the kiosk you can apply up to 30 days ahead. For later dates use the app or ask your supervisor.');
      const t = await tx.leaveType.findFirst({ where: { organizationId: k.org, id: dto.leaveTypeId, active: true }, select: { kind: true } });
      if (!t) throw new NotFoundException('No such leave type.');
      if (!KioskService.KIOSK_KINDS.includes(t.kind)) throw new BadRequestException(t.kind === 'sick' ? 'Ask your supervisor to record sick days.' : 'This leave is applied through HR. Ask your supervisor.');
      return facts;
    });
    const res = await this.leaves.applyAtKiosk(ctxOf(k), f, { leaveTypeId: dto.leaveTypeId, from: dto.from, to: dto.to, reason: `Applied at kiosk ${k.code}` });
    return res;
  }

  // ------------------------------------------------------------------------------------------ training (TIM-13)

  private async opensMinutes(tx: Tx, k: Kiosk, f: Facts) {
    return Number(await settingOn(tx, ctxOf(k), 'kiosk.training_opens_minutes', f, todayIn(f.zone)));
  }

  /** Today's training sessions at this kiosk's location that have not ended, with when check-in opens. */
  async training(k: Kiosk, token: string | undefined) {
    this.attendanceOnly(k);
    const id = await this.person(k, token);
    employeeOnly(id);
    return this.tenantPrisma.forTenant(ctxOf(k), async (tx) => {
      const f = await this.factsNow(tx, k, id);
      const now = new Date();
      const opens = await this.opensMinutes(tx, k, f);
      const zone = (await tx.location.findFirst({ where: { organizationId: k.org, id: k.locationId }, select: { timezone: true } }))?.timezone ?? 'Asia/Kolkata';
      const today = todayIn(zone);
      // Who: sessions for everyone here, or the ones this person is invited to.
      const rows = await tx.trainingSession.findMany({ where: { organizationId: k.org, locationId: k.locationId, cancelledAt: null, endsAt: { gt: now }, OR: [{ invitees: { isEmpty: true } }, { invitees: { has: id } }] }, orderBy: { startsAt: 'asc' }, take: 20 });
      const mine = new Set((await tx.trainingAttendance.findMany({ where: { organizationId: k.org, employeeId: id, sessionId: { in: rows.map((r) => r.id) } }, select: { sessionId: true } })).map((x) => x.sessionId));
      return {
        zone,
        sessions: rows
          .filter((r) => localDate(r.startsAt, zone) === today)
          .map((r) => ({ id: r.id, title: r.title, room: r.room, startsAt: r.startsAt, endsAt: r.endsAt, opensAt: new Date(r.startsAt.getTime() - opens * 60_000), marked: mine.has(r.id) })),
      };
    });
  }

  /** Mark the person present at a session: only at its location, from the opening time until it ends; once. */
  async markTraining(k: Kiosk, person: string, sessionId: string) {
    this.attendanceOnly(k);
    const id = await this.person(k, person);
    employeeOnly(id);
    const c = ctxOf(k);
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const f = await this.factsNow(tx, k, id);
      const s = await tx.trainingSession.findFirst({ where: { organizationId: k.org, id: sessionId, locationId: k.locationId, cancelledAt: null, OR: [{ invitees: { isEmpty: true } }, { invitees: { has: id } }] } });
      if (!s) throw new NotFoundException('No such training here today.');
      const now = new Date();
      const opensAt = new Date(s.startsAt.getTime() - (await this.opensMinutes(tx, k, f)) * 60_000);
      const zone = (await tx.location.findFirst({ where: { organizationId: k.org, id: k.locationId }, select: { timezone: true } }))?.timezone ?? 'Asia/Kolkata';
      if (now < opensAt) throw new ConflictException({ statusCode: 409, code: 'TRAINING_NOT_OPEN', message: `Training opens at ${clock(opensAt, zone)}.` });
      if (now >= s.endsAt) throw new ConflictException({ statusCode: 409, code: 'TRAINING_ENDED', message: 'This training has ended.' });
      const done = await tx.trainingAttendance.findUnique({ where: { organizationId_sessionId_employeeId: { organizationId: k.org, sessionId, employeeId: id } } });
      if (!done) {
        await tx.trainingAttendance.create({ data: { organizationId: k.org, sessionId, employeeId: id, deviceId: k.deviceId } });
        await audit(tx, c, 'time.training.marked', 'training_session', sessionId, { employeeId: id, kiosk: k.code });
      }
      return { sessionId, title: s.title, startsAt: s.startsAt, markedAt: done?.markedAt ?? now, repeat: Boolean(done) };
    });
  }

  // ------------------------------------------------------------------------------------------ punches

  private resolveFor(k: Kiosk, employeeId: string, at: Date) {
    return async (tx: Tx) => ({ deviceId: k.deviceId, f: await this.factsNow(tx, k, employeeId, at), source: 'kiosk' as const, kioskLocationId: k.locationId, device: `Kiosk ${k.code}` });
  }

  /** Check in or out for the person identified a moment ago; the same clientRef again returns the first result. */
  async punch(k: Kiosk, person: string, item: DevicePunchDto): Promise<PunchResult> {
    this.attendanceOnly(k);
    const id = await this.person(k, person);
    if (id.startsWith(CW)) return this.tenantPrisma.forTenant(ctxOf(k), (tx) => this.cw.kioskPunch(tx, ctxOf(k), id.slice(CW.length), item.kind, new Date(item.punchedAt)));
    return this.devices.punchOnce(ctxOf(k), item, this.resolveFor(k, id, new Date(item.punchedAt)));
  }

  /** Offline kiosk punches (each proves who it was with code and PIN or the ID card); a repeat is answered first. */
  async sync(k: Kiosk, items: KioskSyncItemDto[]) {
    this.attendanceOnly(k);
    const c = ctxOf(k);
    return this.devices.each(items, async (item) => {
      const seen = await this.tenantPrisma.forTenant(c, (tx) => tx.devicePunchReceipt.findUnique({ where: { organizationId_deviceId_clientRef: { organizationId: k.org, deviceId: k.deviceId, clientRef: item.clientRef } } }));
      if (seen) return { ...(seen.result as unknown as PunchResult), repeat: true };
      if (!item.qr && !(item.code && item.pin)) throw new BadRequestException('Each offline punch needs the code and PIN, or the ID card.');
      const id = await this.who(k, item.qr ? { method: 'qr', qr: item.qr } : { method: 'pin', code: item.code, pin: item.pin });
      if (id.startsWith(CW)) return this.tenantPrisma.forTenant(c, (tx) => this.cw.kioskPunch(tx, c, id.slice(CW.length), item.kind, new Date(item.punchedAt)));
      return this.devices.punchOnce(c, item, this.resolveFor(k, id, new Date(item.punchedAt)));
    });
  }
}
