import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { SignJWT, jwtVerify } from 'jose';
import { TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit } from '../org-structure/org-structure.service';
import { DevicesService, type PunchResult } from './devices.service';
import { DevicePunchDto, KioskIdentifyDto, KioskSyncItemDto } from './devices.dto';
import { KIOSK_PERSON_SECONDS, afterWrongPin, normalSetupCode, newDeviceToken, pinLocked, sha256, tokenOrg } from './device-rules';
import { Facts, asDate, dateOf, factsOn, todayIn } from './time-core';
import { ScheduleBook } from './schedule';
import { localDate } from './time-maths';

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
const ctxOf = (k: Kiosk): CompanyContext => ({ organizationId: k.org, isSuperAdmin: false, userId: null, role: null, supportSessionId: null });

/** A stored argon2id hash nothing matches: an unknown code costs the same time as a wrong PIN. */
let dummyHash: Promise<string> | null = null;
const dummy = () => (dummyHash ??= argon2.hash(`no-pin-${Math.random()}`, { type: argon2.argon2id }));

@Injectable()
export class KioskService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly devices: DevicesService,
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

  // ------------------------------------------------------------------------------------------ punches

  private resolveFor(k: Kiosk, employeeId: string, at: Date) {
    return async (tx: Tx) => ({ deviceId: k.deviceId, f: await this.factsNow(tx, k, employeeId, at), source: 'kiosk' as const, kioskLocationId: k.locationId, device: `Kiosk ${k.code}` });
  }

  /** Check in or out for the person identified a moment ago; the same clientRef again returns the first result. */
  async punch(k: Kiosk, person: string, item: DevicePunchDto): Promise<PunchResult> {
    this.attendanceOnly(k);
    const id = await this.person(k, person);
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
      return this.devices.punchOnce(c, item, this.resolveFor(k, id, new Date(item.punchedAt)));
    });
  }
}
