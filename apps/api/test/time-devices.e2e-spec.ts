import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Face sign-in uses the laptop fake in this test (provider: to decide).
process.env.KIOSK_FACE_PROVIDER = 'dev-fake';

// TIM-12 / 13 / 14 end to end against the real database (forced RLS, the app role): kiosks registered and set up with
// a one-time code, kiosk sign-in by code + PIN (with the lock), ID-card QR (rotated nonce) and face (consent), kiosk and
// phone punches once per client_ref (also two at once), the 72 h / 2 min window, batch sync, phone binding with HR
// approval and remote sign-out; wrong role, another company and acting for someone else refused.
describe('Time devices and kiosks', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hrAdmin' | 'hrExec' | 'emp' | 'peer' | 'empB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const codes: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const kiosk = (tok: string, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1/kiosk${path}`).set('x-kiosk-token', tok);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const login = async (who: Who, k: 'A' | 'B') => (token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@dev-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken);
  const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
  const setting = (key: string, value: string) => inA((tx) => tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key, value } }));
  const IMG = Buffer.from(`face-of-emp-${run}-0123456789abcdef`).toString('base64');
  const punchesOf = (emp: string) => inA((tx) => tx.punch.count({ where: { employeeId: ids[emp] } }));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn(async () => ({ success: true })) })
      .overrideProvider(BlobStorageService)
      .useValue(createFakeBlobStorage())
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    planId = (await prisma.plan.create({ data: { name: `dev-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Dev Org ${k}`, slug: `dev-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = async (o: string, name: string, keys: readonly string[]) => (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${name}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hrAdmin', 'A', 'panel', ROLE_TEMPLATES.find((t) => t.key === 'hr_admin')!.permissions],
      ['hrExec', 'A', 'panel', ['leave.view', 'attendance.view']],
      ['emp', 'A', 'panel', null],
      ['peer', 'A', 'panel', null],
      ['empB', 'B', 'panel', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? await profile(o, who, keys) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@dev-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      await login(who, k);
    }
    for (const k of ['A', 'B'] as const) {
      await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `Dev Foods ${k}`, shortName: `DVF${k}-${run}`, isDefault: true } })).id;
        // A geofence round the site, so a phone punch from inside is accepted.
        ids[`loc${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name: 'Hosur', code: 'HSR-PLT', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata', geoLat: 12.74, geoLng: 77.83, geoRadiusM: 300 } })).id;
        ids[`loc2${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name: 'Chennai', code: 'MAA', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
        const deptId = randomUUID();
        ids[`dept${k}`] = (await tx.department.create({ data: { ...o, id: deptId, name: 'Production', code: 'PROD', path: `/${deptId}/` } })).id;
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...o, name: 'Operator', code: 'OP' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
        // No weekly offs: every day is a working day (a general 9:30-18:30 shift).
        for (const l of [ids[`loc${k}`], ids[`loc2${k}`]]) await tx.locationAttendanceRule.create({ data: { ...o, locationId: l, validFrom: new Date('2025-01-01T00:00:00Z'), shiftStart: 570, shiftEnd: 1110, weeklyOffs: [] } });
      });
    }
    const joined = new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10);
    const hire = async (admin: 'adminA' | 'adminB', who: Who, k: 'A' | 'B' = 'A') =>
      (
        await api(admin, 'post', '/people/employees')
          .send({ legalEntityId: ids[`entity${k}`], status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: joined, userId: users[who], workEmail: `${who}@dev-${run}.test`, assignment: { locationId: ids[`loc${k}`], departmentId: ids[`dept${k}`], designationId: ids[`desig${k}`], employmentTypeId: ids[`perm${k}`], managerEmployeeId: null } })
          .expect(201)
      ).body.id as string;
    ids.emp = await hire('adminA', 'emp');
    ids.peer = await hire('adminA', 'peer');
    ids.hr = await hire('adminA', 'hrAdmin');
    ids.empB = await hire('adminB', 'empB', 'B');
    const rows = await tenantPrisma.forTenant(SUPER, (tx) => tx.employment.findMany({ where: { employeeId: { in: [ids.emp, ids.peer, ids.empB] } }, select: { employeeId: true, employeeCode: true } }));
    for (const r of rows) codes[Object.keys(ids).find((k) => ids[k] === r.employeeId)!] = r.employeeCode;
  }, 240_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  // ------------------------------------------------------------------------------------------ kiosks (TIM-14)

  let kioskToken = '';
  let kioskId = '';
  it('HR registers a kiosk; the set-up code is shown once; wrong role, bad input and another company refused', async () => {
    await api('hrExec', 'post', '/time/devices/kiosks').send({ place: 'Gate 1', locationId: ids.locA, mode: 'attendance' }).expect(403);
    await api('emp', 'post', '/time/devices/kiosks').send({ place: 'Gate 1', locationId: ids.locA, mode: 'attendance' }).expect(403);
    await api('emp', 'get', '/time/devices').expect(403);
    await api('hrAdmin', 'post', '/time/devices/kiosks').send({ place: 'Gate 1', locationId: ids.locA, mode: 'canteen' }).expect(400);
    await api('hrAdmin', 'post', '/time/devices/kiosks').send({ place: '', locationId: ids.locA, mode: 'attendance' }).expect(400);
    await api('hrAdmin', 'post', '/time/devices/kiosks').send({ place: 'Gate 1', locationId: ids.locB, mode: 'attendance' }).expect(404);
    const res = await api('hrAdmin', 'post', '/time/devices/kiosks').send({ place: 'Gate 1', locationId: ids.locA, mode: 'attendance' }).expect(201);
    expect(res.body.code).toBe('HSR-K1');
    expect(res.body.setupCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    kioskId = res.body.id;
    const stored = await inA((tx) => tx.timeDevice.findFirst({ where: { id: kioskId } }));
    expect(stored!.enrolCodeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(res.body.setupCode.replace(/-/g, ''));
    await api('hrAdmin', 'post', '/time/devices/kiosks').send({ code: 'HSR-K1', place: 'Gate 2', locationId: ids.locA, mode: 'attendance' }).expect(409);
    const list = (await api('hrAdmin', 'get', '/time/devices').expect(200)).body;
    expect(list.kiosks).toEqual([expect.objectContaining({ id: kioskId, status: 'not_set_up', checkInsToday: null, location: 'Hosur' })]);
    expect((await api('adminB', 'get', '/time/devices').expect(200)).body.kiosks).toEqual([]);
    await api('adminB', 'post', `/time/devices/kiosks/${kioskId}/reset`).expect(404);
    await api('hrAdmin', 'post', '/time/devices/kiosks/not-a-uuid/reset').expect(400);

    // Set-up: a wrong code, the right code once, then it is used up.
    await request(server()).post('/api/v1/kiosk/setup').send({ code: 'AAAA-BBBB-CCCC' }).expect(400);
    const set = await request(server()).post('/api/v1/kiosk/setup').send({ code: res.body.setupCode.toLowerCase() }).expect(200);
    kioskToken = set.body.token;
    expect(kioskToken.startsWith(`${org.A.id}.`)).toBe(true);
    expect(set.body.kiosk).toEqual(expect.objectContaining({ code: 'HSR-K1', place: 'Gate 1', location: 'Hosur', methods: ['pin', 'qr'] }));
    await request(server()).post('/api/v1/kiosk/setup').send({ code: res.body.setupCode }).expect(400);
    const after = await inA((tx) => tx.timeDevice.findFirst({ where: { id: kioskId } }));
    expect(after!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(after!.enrolCodeHash).toBeNull();
    const audits = await inA((tx) => tx.auditLog.findMany({ where: { entityId: kioskId }, select: { action: true } }));
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(['time.kiosk.registered', 'time.kiosk.set_up']));
  });

  it('an expired set-up code is refused; unknown, malformed and reset kiosk tokens get 401', async () => {
    const res = await api('hrAdmin', 'post', '/time/devices/kiosks').send({ place: 'Canteen', locationId: ids.locA, mode: 'attendance' }).expect(201);
    expect(res.body.code).toBe('HSR-K2');
    await inA((tx) => tx.timeDevice.update({ where: { id: res.body.id }, data: { enrolExpiresAt: new Date(Date.now() - 1000) } }));
    await request(server()).post('/api/v1/kiosk/setup').send({ code: res.body.setupCode }).expect(400);
    await request(server()).get('/api/v1/kiosk/me').expect(401);
    await kiosk('nonsense', 'get', '/me').expect(401);
    await kiosk(`${org.A.id}.${'x'.repeat(43)}`, 'get', '/me').expect(401);
    await kiosk(`${org.B.id}.${kioskToken.split('.')[1]}`, 'get', '/me').expect(401);
    const me = (await kiosk(kioskToken, 'get', '/me').expect(200)).body;
    expect(me).toEqual(expect.objectContaining({ company: 'Dev Org A', codeDigits: expect.any(Number), pinTries: 5 }));
    // A reset kiosk stops at once; its new code sets it up again.
    const reset = await api('hrAdmin', 'post', `/time/devices/kiosks/${res.body.id}/reset`).expect(200);
    const second = (await request(server()).post('/api/v1/kiosk/setup').send({ code: reset.body.setupCode }).expect(200)).body.token as string;
    await kiosk(second, 'get', '/me').expect(200);
    await api('hrAdmin', 'post', `/time/devices/kiosks/${res.body.id}/reset`).expect(200);
    await kiosk(second, 'get', '/me').expect(401);
    await api('hrAdmin', 'post', `/time/devices/kiosks/${res.body.id}/revoke`).send({}).expect(400); // answer 793: the reason is required
    await api('hrAdmin', 'post', `/time/devices/kiosks/${res.body.id}/revoke`).send({ reason: 'Tablet stolen' }).expect(200);
    await api('hrAdmin', 'post', `/time/devices/kiosks/${res.body.id}/revoke`).send({ reason: 'Tablet stolen' }).expect(409);
  });

  // ------------------------------------------------------------------------------------------ sign-in at the kiosk (TIM-13)

  let person = '';
  it('code + PIN: the PIN is argon2; an unknown code and a wrong PIN answer the same; acting for someone refused', async () => {
    await api('emp', 'post', '/time/devices/me/pin').send({ pin: '1234' }).expect(400);
    await api('emp', 'post', '/time/devices/me/pin').send({ pin: '12' }).expect(400);
    const acting = (await api('adminA', 'post', `/auth/impersonate/${users.emp}`).expect(200)).body.accessToken as string;
    await request(server()).post('/api/v1/time/devices/me/pin').set('Authorization', `Bearer ${acting}`).send({ pin: '4071' }).expect(403);
    await request(server()).post('/api/v1/time/devices/me/bind').set('Authorization', `Bearer ${acting}`).send({ installId: 'acting-phone-1', model: 'Pixel' }).expect(403);
    await api('emp', 'post', '/time/devices/me/pin').send({ pin: '4071' }).expect(200);
    const cred = await inA((tx) => tx.kioskCredential.findFirst({ where: { employeeId: ids.emp } }));
    expect(cred!.pinHash).toMatch(/^\$argon2id\$/);

    const unknown = await kiosk(kioskToken, 'post', '/identify').send({ method: 'pin', code: 'ZZ-9999', pin: '4071' }).expect(403);
    const wrong = await kiosk(kioskToken, 'post', '/identify').send({ method: 'pin', code: codes.emp, pin: '1111' }).expect(403);
    const noPin = await kiosk(kioskToken, 'post', '/identify').send({ method: 'pin', code: codes.peer, pin: '4071' }).expect(403);
    expect(unknown.body.message).toBe(wrong.body.message);
    expect(noPin.body.message).toBe(wrong.body.message);
    await kiosk(kioskToken, 'post', '/identify').send({ method: 'sms' }).expect(400);
    const ok = await kiosk(kioskToken, 'post', '/identify').send({ method: 'pin', code: codes.emp, pin: '4071' }).expect(200);
    expect(ok.body).toEqual({ person: expect.any(String), firstName: 'emp', expiresInSeconds: 120 });
    person = ok.body.person;
    // The wrong try above was cleared by the right one.
    expect((await inA((tx) => tx.kioskCredential.findFirst({ where: { employeeId: ids.emp } })))!.failed).toBe(0);
  });

  it('after kiosk.pin_tries wrong PINs the code locks for 15 minutes: the right PIN is refused too, then works again', async () => {
    for (let i = 0; i < 5; i++) await kiosk(kioskToken, 'post', '/identify').send({ method: 'pin', code: codes.emp, pin: '0000' }).expect(403);
    const locked = await inA((tx) => tx.kioskCredential.findFirst({ where: { employeeId: ids.emp } }));
    expect(locked!.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
    const right = await kiosk(kioskToken, 'post', '/identify').send({ method: 'pin', code: codes.emp, pin: '4071' }).expect(403);
    expect(right.body.code).toBe('NO_MATCH');
    expect((await inA((tx) => tx.auditLog.count({ where: { action: 'time.kiosk.pin_locked', entityId: ids.emp } })))).toBe(1);
    // A try while locked does not extend the lock.
    expect((await inA((tx) => tx.kioskCredential.findFirst({ where: { employeeId: ids.emp } })))!.lockedUntil!.getTime()).toBe(locked!.lockedUntil!.getTime());
    await inA((tx) => tx.kioskCredential.update({ where: { organizationId_employeeId: { organizationId: org.A.id, employeeId: ids.emp } }, data: { lockedUntil: new Date(Date.now() - 1000) } }));
    await kiosk(kioskToken, 'post', '/identify').send({ method: 'pin', code: codes.emp, pin: '4071' }).expect(200);
    // HR resets a PIN: the old one stops working. Another company's person: 404.
    await api('adminB', 'post', `/time/devices/people/${ids.emp}/pin-reset`).expect(404);
    await api('hrExec', 'post', `/time/devices/people/${ids.emp}/pin-reset`).expect(403);
    await api('hrAdmin', 'post', `/time/devices/people/${ids.emp}/pin-reset`).expect(200);
    await kiosk(kioskToken, 'post', '/identify').send({ method: 'pin', code: codes.emp, pin: '4071' }).expect(403);
    await api('emp', 'post', '/time/devices/me/pin').send({ pin: '4071' }).expect(200);
  });

  it('ID-card QR: a signed card works; rotating the nonce voids printed cards; forged or other-company cards refused', async () => {
    const card = (await api('hrAdmin', 'post', `/time/devices/people/${ids.emp}/qr`).expect(200)).body.qr as string;
    await api('adminB', 'post', `/time/devices/people/${ids.emp}/qr`).expect(404);
    expect((await kiosk(kioskToken, 'post', '/identify').send({ method: 'qr', qr: card }).expect(200)).body.firstName).toBe('emp');
    const forged = card.slice(0, -4) + (card.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect((await kiosk(kioskToken, 'post', '/identify').send({ method: 'qr', qr: forged }).expect(403)).body.code).toBe('CARD_INVALID');
    const cardB = (await api('adminB', 'post', `/time/devices/people/${ids.empB}/qr`).expect(200)).body.qr as string;
    await kiosk(kioskToken, 'post', '/identify').send({ method: 'qr', qr: cardB }).expect(403);
    const fresh = (await api('hrAdmin', 'post', `/time/devices/people/${ids.emp}/qr-rotate`).expect(200)).body.qr as string;
    await kiosk(kioskToken, 'post', '/identify').send({ method: 'qr', qr: card }).expect(403);
    await kiosk(kioskToken, 'post', '/identify').send({ method: 'qr', qr: fresh }).expect(200);
    expect((await api('emp', 'get', '/time/devices/me/qr').expect(200)).body.qr).toEqual(expect.any(String));
  });

  it('face: only when kiosk.methods has it and the person consented; withdrawing stops it', async () => {
    await kiosk(kioskToken, 'post', '/identify').send({ method: 'face', image: IMG }).expect(403);
    await setting('kiosk.methods', 'pin,qr,face');
    await kiosk(kioskToken, 'post', '/identify').send({ method: 'face', image: IMG }).expect(403);
    await api('emp', 'post', '/time/devices/me/face').send({ consent: false, image: IMG }).expect(400);
    await api('emp', 'post', '/time/devices/me/face').send({ consent: true, image: IMG }).expect(200);
    const row = await inA((tx) => tx.kioskFaceEnrolment.findFirst({ where: { employeeId: ids.emp } }));
    expect(row).toEqual(expect.objectContaining({ provider: 'dev-fake', withdrawnAt: null }));
    expect((await kiosk(kioskToken, 'post', '/identify').send({ method: 'face', image: IMG }).expect(200)).body.firstName).toBe('emp');
    await kiosk(kioskToken, 'post', '/identify').send({ method: 'face', image: Buffer.from('someone else entirely, not emp').toString('base64') }).expect(403);
    await api('emp', 'post', '/time/devices/me/face/withdraw').expect(200);
    await api('emp', 'post', '/time/devices/me/face/withdraw').expect(409);
    await kiosk(kioskToken, 'post', '/identify').send({ method: 'face', image: IMG }).expect(403);
    const actions = (await inA((tx) => tx.auditLog.findMany({ where: { entityId: ids.emp }, select: { action: true } }))).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['time.kiosk.face_consent_given', 'time.kiosk.face_consent_withdrawn', 'time.kiosk.pin_set', 'time.kiosk.pin_reset', 'time.kiosk.qr_rotated']));
  });

  // ------------------------------------------------------------------------------------------ kiosk punches

  it('a kiosk punch is made once per client_ref, also when two arrive at once; old or future punches refused', async () => {
    person = (await kiosk(kioskToken, 'post', '/identify').send({ method: 'pin', code: codes.emp, pin: '4071' }).expect(200)).body.person;
    expect((await kiosk(kioskToken, 'get', '/person/today').set('x-kiosk-person', person).expect(200)).body).toEqual(expect.objectContaining({ firstName: 'emp', next: 'in', punches: [] }));
    await kiosk(kioskToken, 'get', '/person/today').set('x-kiosk-person', 'forged').expect(403);
    const ref = randomUUID();
    const first = await kiosk(kioskToken, 'post', '/punch').send({ person, kind: 'in', clientRef: ref, punchedAt: minsAgo(30) }).expect(200);
    expect(first.body).toEqual(expect.objectContaining({ accepted: true, verdict: 'inside', kind: 'in', punchId: expect.any(String) }));
    expect(first.body.message).toMatch(/Checked in\. At the Hosur kiosk/);
    const again = await kiosk(kioskToken, 'post', '/punch').send({ person, kind: 'in', clientRef: ref, punchedAt: minsAgo(30) }).expect(200);
    expect(again.body).toEqual(expect.objectContaining({ punchId: first.body.punchId, repeat: true }));
    expect(await punchesOf('emp')).toBe(1);
    const p = await inA((tx) => tx.punch.findFirst({ where: { id: first.body.punchId } }));
    expect(p).toEqual(expect.objectContaining({ source: 'kiosk', locationId: ids.locA, device: 'Kiosk HSR-K1' }));

    const twin = randomUUID();
    const both = await Promise.all([0, 1].map(() => kiosk(kioskToken, 'post', '/punch').send({ person, kind: 'out', clientRef: twin, punchedAt: minsAgo(5) })));
    expect(both.map((r) => r.status)).toEqual([200, 200]);
    expect(both[0].body.punchId).toBe(both[1].body.punchId);
    expect(await punchesOf('emp')).toBe(2);
    expect((await kiosk(kioskToken, 'get', '/person/today').set('x-kiosk-person', person).expect(200)).body.next).toBe('in');

    await kiosk(kioskToken, 'post', '/punch').send({ person, kind: 'in', clientRef: randomUUID(), punchedAt: minsAgo(73 * 60) }).expect(400);
    await kiosk(kioskToken, 'post', '/punch').send({ person, kind: 'in', clientRef: randomUUID(), punchedAt: new Date(Date.now() + 5 * 60_000).toISOString() }).expect(400);
    await kiosk(kioskToken, 'post', '/punch').send({ person, kind: 'in', clientRef: 'not-a-uuid', punchedAt: minsAgo(1) }).expect(400);
    await kiosk(kioskToken, 'post', '/punch').send({ person: 'x', kind: 'in', clientRef: randomUUID(), punchedAt: minsAgo(1) }).expect(403);
    expect(await punchesOf('emp')).toBe(2);
    // HR sees today's check-ins on the kiosk.
    expect((await api('hrAdmin', 'get', '/time/devices').expect(200)).body.kiosks.find((k: { id: string }) => k.id === kioskId)).toEqual(expect.objectContaining({ status: 'online', checkInsToday: 2 }));
  });

  it('a pass from one kiosk does not work on another; a kiosk elsewhere refuses a person not placed there', async () => {
    const reg = await api('hrAdmin', 'post', '/time/devices/kiosks').send({ place: 'Lobby', locationId: ids.loc2A, mode: 'attendance' }).expect(201);
    expect(reg.body.code).toBe('MAA-K1');
    const other = (await request(server()).post('/api/v1/kiosk/setup').send({ code: reg.body.setupCode }).expect(200)).body.token as string;
    await kiosk(other, 'post', '/punch').send({ person, kind: 'in', clientRef: randomUUID(), punchedAt: minsAgo(1) }).expect(403);
    const there = (await kiosk(other, 'post', '/identify').send({ method: 'pin', code: codes.emp, pin: '4071' }).expect(200)).body.person;
    const res = await kiosk(other, 'post', '/punch').send({ person: there, kind: 'in', clientRef: randomUUID(), punchedAt: minsAgo(1) }).expect(200);
    expect(res.body).toEqual(expect.objectContaining({ accepted: false, verdict: 'outside' }));
    // A visitor kiosk takes no attendance.
    const vis = await api('hrAdmin', 'post', '/time/devices/kiosks').send({ place: 'Reception', locationId: ids.locA, mode: 'visitor' }).expect(201);
    const visTok = (await request(server()).post('/api/v1/kiosk/setup').send({ code: vis.body.setupCode }).expect(200)).body.token as string;
    await kiosk(visTok, 'post', '/identify').send({ method: 'pin', code: codes.emp, pin: '4071' }).expect(409);
  });

  it('offline sync: a result per item, repeats answered once, bounded size', async () => {
    const ref = randomUUID();
    const res = await kiosk(kioskToken, 'post', '/sync')
      .send({
        items: [
          { clientRef: ref, kind: 'in', punchedAt: minsAgo(2), code: codes.emp, pin: '4071' },
          { clientRef: randomUUID(), kind: 'out', punchedAt: minsAgo(73 * 60), code: codes.emp, pin: '4071' },
          { clientRef: randomUUID(), kind: 'out', punchedAt: minsAgo(1), code: codes.emp, pin: '9999' },
          { clientRef: randomUUID(), kind: 'out', punchedAt: minsAgo(1) },
        ],
      })
      .expect(200);
    expect(res.body.results.map((r: { ok: boolean; status?: number }) => [r.ok, r.status ?? 200])).toEqual([[true, 200], [false, 400], [false, 403], [false, 400]]);
    const again = await kiosk(kioskToken, 'post', '/sync').send({ items: [{ clientRef: ref, kind: 'in', punchedAt: minsAgo(2), code: codes.emp, pin: '0000' }] }).expect(200);
    expect(again.body.results[0]).toEqual(expect.objectContaining({ ok: true, repeat: true, punchId: res.body.results[0].punchId }));
    await kiosk(kioskToken, 'post', '/sync').send({ items: Array.from({ length: 51 }, () => ({ clientRef: randomUUID(), kind: 'in', punchedAt: minsAgo(1) })) }).expect(400);
    await kiosk(kioskToken, 'post', '/sync').send({ items: [] }).expect(400);
  });

  // ------------------------------------------------------------------------------------------ phones (TIM-12 / TIM-14)

  const inside = { lat: 12.7401, lng: 77.8301, accuracyM: 20 };
  it('phone binding off: a phone punch records the phone; once per client_ref', async () => {
    const ref = randomUUID();
    const r = await api('emp', 'post', '/time/devices/me/punch').send({ installId: 'emp-phone-0001', kind: 'out', clientRef: ref, punchedAt: minsAgo(0), ...inside }).expect(200);
    expect(r.body).toEqual(expect.objectContaining({ accepted: true, verdict: 'inside' }));
    const again = await api('emp', 'post', '/time/devices/me/punch').send({ installId: 'emp-phone-0001', kind: 'out', clientRef: ref, punchedAt: minsAgo(0), ...inside }).expect(200);
    expect(again.body).toEqual(expect.objectContaining({ repeat: true, punchId: r.body.punchId }));
    const phone = await inA((tx) => tx.timeDevice.findFirst({ where: { employeeId: ids.emp, kind: 'phone' } }));
    expect(phone).toEqual(expect.objectContaining({ status: 'active', installHash: expect.stringMatching(/^[0-9a-f]{64}$/) }));
    expect(JSON.stringify(phone)).not.toContain('emp-phone-0001');
    await api('emp', 'post', '/time/devices/me/punch').send({ installId: 'emp-phone-0001', kind: 'in', clientRef: randomUUID(), punchedAt: minsAgo(0), lat: 12.74 }).expect(400);
    const sync = await api('emp', 'post', '/time/devices/me/sync').send({ installId: 'emp-phone-0001', items: [{ kind: 'in', clientRef: ref, punchedAt: minsAgo(0) }, { kind: 'in', clientRef: randomUUID(), punchedAt: minsAgo(80 * 60) }] }).expect(200);
    expect(sync.body.results.map((x: { ok: boolean }) => x.ok)).toEqual([true, false]);
  });

  let reqId = '';
  it('phone binding on: an unbound phone is refused; ask, HR approves (once), then it punches', async () => {
    await setting('attendance.phone_binding', 'on');
    const refused = await api('peer', 'post', '/time/devices/me/punch').send({ installId: 'peer-phone-0001', kind: 'in', clientRef: randomUUID(), punchedAt: minsAgo(0), ...inside }).expect(403);
    expect(refused.body.code).toBe('PHONE_NOT_APPROVED');
    expect((await api('peer', 'get', '/time/devices/me').expect(200)).body).toEqual(expect.objectContaining({ binding: 'on', phone: null, request: null }));
    await api('peer', 'post', '/time/devices/me/bind').send({ installId: 'x', model: 'Pixel 7a' }).expect(400);
    reqId = (await api('peer', 'post', '/time/devices/me/bind').send({ installId: 'peer-phone-0001', model: 'Pixel 7a', reason: 'First smartphone' }).expect(201)).body.id;
    await api('peer', 'post', '/time/devices/me/bind').send({ installId: 'peer-phone-0002', model: 'Nokia G21' }).expect(409);
    const ov = (await api('hrAdmin', 'get', '/time/devices').expect(200)).body;
    expect(ov.requests).toEqual([expect.objectContaining({ id: reqId, model: 'Pixel 7a', oldModel: null, reason: 'First smartphone', site: 'Hosur' })]);
    await api('hrExec', 'post', `/time/devices/phones/${reqId}/approve`).expect(403);
    await api('adminB', 'post', `/time/devices/phones/${reqId}/approve`).expect(404);
    const twice = await Promise.all([0, 1].map(() => api('hrAdmin', 'post', `/time/devices/phones/${reqId}/approve`)));
    expect(twice.map((r) => r.status).sort()).toEqual([200, 409]);
    await api('hrAdmin', 'post', `/time/devices/phones/${reqId}/refuse`).send({ reason: 'Too late' }).expect(409);
    const ok = await api('peer', 'post', '/time/devices/me/punch').send({ installId: 'peer-phone-0001', kind: 'in', clientRef: randomUUID(), punchedAt: minsAgo(0), ...inside }).expect(200);
    expect(ok.body.accepted).toBe(true);
    expect((await api('peer', 'get', '/time/devices/me').expect(200)).body.phone).toEqual(expect.objectContaining({ model: 'Pixel 7a' }));
  });

  it('a lost phone stops at once; refusal needs a reason; withdraw; approving the new phone signs the old one out', async () => {
    const lostReq = (await api('peer', 'post', '/time/devices/me/bind').send({ installId: 'peer-phone-0002', model: 'Nokia G21', oldPhoneLost: true, reason: 'Old phone lost' }).expect(201)).body.id;
    expect((await api('peer', 'post', '/time/devices/me/punch').send({ installId: 'peer-phone-0001', kind: 'out', clientRef: randomUUID(), punchedAt: minsAgo(0), ...inside }).expect(403)).body.code).toBe('PHONE_LOST');
    await api('hrAdmin', 'post', `/time/devices/phones/${lostReq}/refuse`).send({}).expect(400);
    await api('hrAdmin', 'post', `/time/devices/phones/${lostReq}/refuse`).send({ reason: 'Phone model not allowed' }).expect(200);
    expect((await api('peer', 'get', '/time/devices/me').expect(200)).body.lastRefusal).toEqual(expect.objectContaining({ reason: 'Phone model not allowed' }));
    await api('peer', 'post', '/time/devices/me/bind').send({ installId: 'peer-phone-0003', model: 'Samsung A15' }).expect(201);
    await api('peer', 'post', '/time/devices/me/bind/withdraw').expect(200);
    await api('peer', 'post', '/time/devices/me/bind/withdraw').expect(409);
    const next = (await api('peer', 'post', '/time/devices/me/bind').send({ installId: 'peer-phone-0003', model: 'Samsung A15' }).expect(201)).body.id;
    expect((await api('hrAdmin', 'post', `/time/devices/phones/${next}/approve`).expect(200)).body.signedOut).toEqual(['Pixel 7a']);
    const phones = await inA((tx) => tx.timeDevice.findMany({ where: { employeeId: ids.peer, kind: 'phone' }, select: { model: true, status: true } }));
    expect(phones.filter((p) => p.status === 'active')).toEqual([{ model: 'Samsung A15', status: 'active' }]);
    expect(phones.find((p) => p.model === 'Pixel 7a')!.status).toBe('revoked');
  });

  it('remote sign-out: the phone stops and the person is signed out; again is a conflict', async () => {
    const phone = (await api('hrAdmin', 'get', '/time/devices').expect(200)).body.phones.find((p: { model: string; status: string }) => p.model === 'Samsung A15' && p.status === 'active');
    await api('adminB', 'post', `/time/devices/phones/${phone.id}/sign-out`).expect(404);
    const out = await api('hrAdmin', 'post', `/time/devices/phones/${phone.id}/sign-out`).expect(200);
    expect(out.body.sessionsEnded).toBeGreaterThanOrEqual(1);
    await api('peer', 'get', '/time/devices/me').expect(401);
    await api('hrAdmin', 'post', `/time/devices/phones/${phone.id}/sign-out`).expect(409);
    await login('peer', 'A');
    expect((await api('peer', 'post', '/time/devices/me/punch').send({ installId: 'peer-phone-0003', kind: 'out', clientRef: randomUUID(), punchedAt: minsAgo(0), ...inside }).expect(403)).body.code).toBe('PHONE_NOT_APPROVED');
    const actions = (await inA((tx) => tx.auditLog.findMany({ where: { entityType: 'time_device' }, select: { action: true } }))).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['time.phone.bind_requested', 'time.phone.approved', 'time.phone.refused', 'time.phone.reported_lost', 'time.phone.signed_out', 'time.kiosk.key_reset', 'time.kiosk.revoked']));
  });

  // ------------------------------------------------------------------------------------------ TIM-13 small items (30 Oct 2026)

  const pass = async () => (await kiosk(kioskToken, 'post', '/identify').send({ method: 'pin', code: codes.emp, pin: '4071' }).expect(200)).body.person as string;
  const dayAhead = (n: number) => new Date(Date.now() + n * 86_400_000 + 5.5 * 3_600_000).toISOString().slice(0, 10);

  it('code check: an unknown code is told apart before the PIN; a known code goes on; the company can turn it off', async () => {
    const unknown = await kiosk(kioskToken, 'post', '/code').send({ code: 'ZZ-9999' }).expect(404);
    expect(unknown.body).toEqual(expect.objectContaining({ code: 'UNKNOWN_CODE', message: 'No one with code ZZ-9999. Check the code on your ID card and try again.' }));
    expect((await kiosk(kioskToken, 'post', '/code').send({ code: codes.emp }).expect(200)).body).toEqual({ known: true });
    await kiosk(kioskToken, 'post', '/code').send({ code: '' }).expect(400);
    await kiosk('nonsense', 'post', '/code').send({ code: codes.emp }).expect(401);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'time.kiosk.sign_in_refused', entityId: kioskId } }))).toBeGreaterThan(0);
    const row = await setting('kiosk.tell_unknown_code', 'no');
    expect((await kiosk(kioskToken, 'post', '/code').send({ code: 'ZZ-9999' }).expect(200)).body).toEqual({ known: true });
    await inA((tx) => tx.setting.delete({ where: { id: row.id } }));
  });

  it('training: HR adds a session (company-wide key); the kiosk shows it, refuses before it opens, then marks once', async () => {
    const soon = { locationId: ids.locA, title: 'Food safety refresher', room: 'Training room 1', startsAt: new Date(Date.now() + 2 * 3_600_000).toISOString(), endsAt: new Date(Date.now() + 3 * 3_600_000).toISOString() };
    await api('hrExec', 'post', '/time/devices/training').send(soon).expect(403);
    await api('emp', 'get', '/time/devices/training').expect(403);
    await api('hrAdmin', 'post', '/time/devices/training').send({ ...soon, endsAt: soon.startsAt }).expect(400);
    await api('hrAdmin', 'post', '/time/devices/training').send({ ...soon, title: '' }).expect(400);
    await api('hrAdmin', 'post', '/time/devices/training').send({ ...soon, locationId: ids.locB }).expect(404);
    const later = (await api('hrAdmin', 'post', '/time/devices/training').send(soon).expect(201)).body.id as string;
    const now = (await api('hrAdmin', 'post', '/time/devices/training').send({ ...soon, title: 'Fire drill', startsAt: new Date(Date.now() + 5 * 60_000).toISOString() }).expect(201)).body.id as string;
    const elsewhere = (await api('hrAdmin', 'post', '/time/devices/training').send({ ...soon, locationId: ids.loc2A, title: 'Elsewhere' }).expect(201)).body.id as string;
    const p = await pass();
    const list = (await kiosk(kioskToken, 'get', '/person/training').set('x-kiosk-person', p).expect(200)).body;
    expect(list.sessions.map((s: { title: string }) => s.title).sort()).toEqual(expect.arrayContaining(['Fire drill']));
    expect(list.sessions.some((s: { id: string }) => s.id === elsewhere)).toBe(false);
    await kiosk(kioskToken, 'get', '/person/training').expect(403);
    if (list.sessions.some((s: { id: string }) => s.id === later)) {
      const early = await kiosk(kioskToken, 'post', `/person/training/${later}`).send({ person: p }).expect(409);
      expect(early.body.code).toBe('TRAINING_NOT_OPEN');
      expect(early.body.message).toMatch(/^Training opens at \d{1,2}:\d{2} (am|pm)\.$/);
    }
    await kiosk(kioskToken, 'post', `/person/training/${elsewhere}`).send({ person: p }).expect(404);
    await kiosk(kioskToken, 'post', `/person/training/${now}`).send({ person: 'forged' }).expect(403);
    expect((await kiosk(kioskToken, 'post', `/person/training/${now}`).send({ person: p }).expect(200)).body.repeat).toBe(false);
    expect((await kiosk(kioskToken, 'post', `/person/training/${now}`).send({ person: p }).expect(200)).body.repeat).toBe(true);
    expect(await inA((tx) => tx.trainingAttendance.count({ where: { sessionId: now } }))).toBe(1);
    const hr = (await api('hrAdmin', 'get', '/time/devices/training').expect(200)).body;
    expect(hr.find((s: { id: string }) => s.id === now)).toEqual(expect.objectContaining({ present: 1, cancelled: false }));
    expect((await api('adminB', 'get', '/time/devices/training').expect(200)).body).toEqual([]);
    await api('adminB', 'post', `/time/devices/training/${later}/cancel`).expect(404);
    await api('hrAdmin', 'post', `/time/devices/training/${later}/cancel`).expect(200);
    await api('hrAdmin', 'post', `/time/devices/training/${later}/cancel`).expect(409);
    await kiosk(kioskToken, 'post', `/person/training/${later}`).send({ person: p }).expect(404);
  });

  it('leave at the kiosk: the person sees days left and the next days, applies (rules and approval as usual); refusals in plain words', async () => {
    const [cl, sl, mat] = await inA(async (tx) => {
      const o = { organizationId: org.A.id, paid: true, rules: { sandwich: 'none', sandwichOn: 'both', sandwichHalfDays: false, halfDays: true, minDays: null, maxDays: null, noticeDays: null, noticeMode: 'block', certificateAfterDays: null, medical: false, negativeLimit: 0, encashable: false, hrApprovalAboveDays: null } };
      const c = await tx.leaveType.create({ data: { ...o, code: 'CL', name: 'Casual leave', kind: 'casual' } });
      const s = await tx.leaveType.create({ data: { ...o, code: 'SL', name: 'Sick leave', kind: 'sick' } });
      const m = await tx.leaveType.create({ data: { ...o, code: 'ML', name: 'Maternity leave', kind: 'maternity' } });
      for (const t of [c, s]) await tx.leaveLedgerEntry.create({ data: { organizationId: org.A.id, employeeId: ids.emp, leaveTypeId: t.id, entryOn: new Date(`${dayAhead(-30)}T00:00:00Z`), kind: 'opening', days: 2, reason: 'Opening balance' } });
      return [c.id, s.id, m.id];
    });
    const p = await pass();
    const view = (await kiosk(kioskToken, 'get', '/person/leave').set('x-kiosk-person', p).expect(200)).body;
    expect(view.types).toEqual([expect.objectContaining({ id: cl, name: 'Casual leave', available: 2, pending: 0 })]);
    expect(view.sick).toEqual({ name: 'Sick leave', available: 2 });
    expect(view.days).toHaveLength(10);
    expect(view.days[0].on).toBe(dayAhead(1));
    await kiosk(kioskToken, 'post', '/person/leave').send({ person: p, leaveTypeId: sl, from: dayAhead(3), to: dayAhead(3) }).expect(400);
    await kiosk(kioskToken, 'post', '/person/leave').send({ person: p, leaveTypeId: mat, from: dayAhead(3), to: dayAhead(3) }).expect(400);
    expect((await kiosk(kioskToken, 'post', '/person/leave').send({ person: p, leaveTypeId: cl, from: dayAhead(0), to: dayAhead(0) }).expect(400)).body.message).toBe('Pick days from tomorrow. For today, ask your supervisor.');
    await kiosk(kioskToken, 'post', '/person/leave').send({ person: p, leaveTypeId: cl, from: dayAhead(40), to: dayAhead(40) }).expect(400);
    await kiosk(kioskToken, 'post', '/person/leave').send({ person: p, leaveTypeId: cl, from: dayAhead(3), to: dayAhead(5) }).expect(400);
    await kiosk(kioskToken, 'post', '/person/leave').send({ person: 'forged', leaveTypeId: cl, from: dayAhead(3), to: dayAhead(3) }).expect(403);
    const ok = await kiosk(kioskToken, 'post', '/person/leave').send({ person: p, leaveTypeId: cl, from: dayAhead(3), to: dayAhead(3) }).expect(201);
    expect(ok.body).toEqual(expect.objectContaining({ status: 'pending', days: 1 }));
    const req = await inA((tx) => tx.leaveRequest.findFirst({ where: { id: ok.body.id } }));
    expect(req).toEqual(expect.objectContaining({ employeeId: ids.emp, raisedBy: users.emp, reason: 'Applied at kiosk HSR-K1' }));
    const again = (await kiosk(kioskToken, 'get', '/person/leave').set('x-kiosk-person', p).expect(200)).body;
    expect(again.types[0]).toEqual(expect.objectContaining({ available: 1, pending: 1 }));
    expect(again.days.find((d: { on: string }) => d.on === dayAhead(3)).note).toBe('Requested');
    // The person's menu says whether Apply leave shows (kiosk.leave, default on).
    expect((await kiosk(kioskToken, 'get', '/person/today').set('x-kiosk-person', p).expect(200)).body.leave).toBe(true);
    const off = await setting('kiosk.leave', 'off');
    expect((await kiosk(kioskToken, 'get', '/person/today').set('x-kiosk-person', p).expect(200)).body.leave).toBe(false);
    expect((await kiosk(kioskToken, 'get', '/person/leave').set('x-kiosk-person', p).expect(403)).body.code).toBe('KIOSK_LEAVE_OFF');
    await kiosk(kioskToken, 'post', '/person/leave').send({ person: p, leaveTypeId: cl, from: dayAhead(4), to: dayAhead(4) }).expect(403);
    await inA((tx) => tx.setting.delete({ where: { id: off.id } }));
  });

  it('training (TIM-14 Training tab): who it is for, people search, change before it starts (version-checked), audited', async () => {
    const at = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
    const base = { locationId: ids.locA, title: 'Hygiene briefing', startsAt: at(0.1), endsAt: at(1) };
    // Who: chosen people only; someone of another company is refused.
    await api('hrAdmin', 'post', '/time/devices/training').send({ ...base, invitees: [ids.empB] }).expect(400);
    await api('hrAdmin', 'post', '/time/devices/training').send({ ...base, invitees: ['nope'] }).expect(400);
    const forPeer = (await api('hrAdmin', 'post', '/time/devices/training').send({ ...base, invitees: [ids.peer] }).expect(201)).body;
    const forEmp = (await api('hrAdmin', 'post', '/time/devices/training').send({ ...base, title: 'Line safety', invitees: [ids.emp, ids.emp] }).expect(201)).body;
    const list = (await api('hrAdmin', 'get', '/time/devices/training').expect(200)).body;
    expect(list.find((s: { id: string }) => s.id === forEmp.id)).toEqual(expect.objectContaining({ invitees: [expect.objectContaining({ id: ids.emp })], state: 'upcoming', version: 1, location: expect.objectContaining({ id: ids.locA, zone: expect.any(String) }) }));
    // The kiosk shows a person only the sessions for everyone or for them; marking another's is refused as not found.
    const p = await pass();
    const seen = (await kiosk(kioskToken, 'get', '/person/training').set('x-kiosk-person', p).expect(200)).body.sessions.map((s: { id: string }) => s.id);
    expect(seen).toContain(forEmp.id);
    expect(seen).not.toContain(forPeer.id);
    await kiosk(kioskToken, 'post', `/person/training/${forPeer.id}`).send({ person: p }).expect(404);
    // People search: this company only, by name; wrong role refused.
    const found = (await api('hrAdmin', 'get', '/time/devices/training/people?q=emp').expect(200)).body as { id: string }[];
    expect(found.map((x) => x.id)).toContain(ids.emp);
    expect(found.map((x) => x.id)).not.toContain(ids.empB);
    await api('hrExec', 'get', '/time/devices/training/people?q=emp').expect(403);
    // Change: the version HR saw; a stale one is a conflict; another company 404; wrong role 403; bad input 400.
    const later = (await api('hrAdmin', 'post', '/time/devices/training').send({ ...base, title: 'Fire warden', startsAt: at(5), endsAt: at(6) }).expect(201)).body;
    const edit = { ...base, title: 'Fire warden (east)', startsAt: at(6), endsAt: at(7), invitees: [ids.emp], version: 1 };
    expect((await api('hrAdmin', 'put', `/time/devices/training/${later.id}`).send(edit).expect(200)).body).toEqual({ id: later.id, version: 2 });
    expect((await api('hrAdmin', 'put', `/time/devices/training/${later.id}`).send(edit).expect(409)).body.message).toBe('Someone else changed this session. Reload to see their change.');
    await api('adminB', 'put', `/time/devices/training/${later.id}`).send({ ...edit, version: 2 }).expect(404);
    await api('hrExec', 'put', `/time/devices/training/${later.id}`).send({ ...edit, version: 2 }).expect(403);
    await api('hrAdmin', 'put', `/time/devices/training/${later.id}`).send({ ...edit, version: 2, endsAt: edit.startsAt }).expect(400);
    await api('hrAdmin', 'put', `/time/devices/training/${later.id}`).send({ ...edit, version: 0 }).expect(400);
    const changed = await inA((tx) => tx.auditLog.findFirst({ where: { action: 'time.training.changed', entityId: later.id } }));
    expect(JSON.parse(changed?.metadataJson ?? '{}')).toEqual(expect.objectContaining({ before: expect.objectContaining({ title: 'Fire warden' }), after: expect.objectContaining({ title: 'Fire warden (east)', invitees: 1 }) }));
    // Started: it can be cancelled, not changed; a cancelled one cannot be changed.
    await inA((tx) => tx.trainingSession.update({ where: { id: forEmp.id }, data: { startsAt: new Date(Date.now() - 60_000) } }));
    await api('hrAdmin', 'put', `/time/devices/training/${forEmp.id}`).send({ ...edit, version: 1 }).expect(409);
    await api('hrAdmin', 'post', `/time/devices/training/${later.id}/cancel`).expect(200);
    expect((await api('hrAdmin', 'put', `/time/devices/training/${later.id}`).send({ ...edit, version: 2 }).expect(409)).body.message).toBe('That session is cancelled. Add a new one instead.');
    // A time already passed is refused.
    await api('hrAdmin', 'post', '/time/devices/training').send({ ...base, startsAt: at(-2), endsAt: at(-1) }).expect(400);
  });

  it('forced RLS on the training tables', async () => {
    const forced = await prisma.$queryRaw<{ relforcerowsecurity: boolean }[]>`SELECT relforcerowsecurity FROM pg_class WHERE relname IN ('training_sessions', 'training_attendance')`;
    expect(forced).toHaveLength(2);
    expect(forced.every((r) => r.relforcerowsecurity)).toBe(true);
    expect(await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.trainingSession.count({ where: { organizationId: org.A.id } }))).toBe(0);
    await expect(inA((tx) => tx.trainingAttendance.deleteMany({}))).rejects.toThrow();
  });

  it('a revoked kiosk stops at once', async () => {
    await api('hrAdmin', 'post', `/time/devices/kiosks/${kioskId}/revoke`).send({ reason: 'Replaced by a new tablet' }).expect(200);
    await kiosk(kioskToken, 'get', '/me').expect(401);
    await kiosk(kioskToken, 'post', '/identify').send({ method: 'pin', code: codes.emp, pin: '4071' }).expect(401);
  });

  it('forced RLS on the device tables; device receipts cannot be changed by the app', async () => {
    const forced = await prisma.$queryRaw<{ relname: string; relforcerowsecurity: boolean }[]>`SELECT relname, relforcerowsecurity FROM pg_class WHERE relname IN ('time_devices', 'kiosk_credentials', 'kiosk_face_enrolments', 'device_punch_receipts')`;
    expect(forced).toHaveLength(4);
    expect(forced.every((r) => r.relforcerowsecurity)).toBe(true);
    const fromB = await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, async (tx) => [await tx.timeDevice.count({ where: { organizationId: org.A.id } }), await tx.kioskCredential.count({ where: { organizationId: org.A.id } }), await tx.devicePunchReceipt.count({ where: { organizationId: org.A.id } })]);
    expect(fromB).toEqual([0, 0, 0]);
    expect(await inA((tx) => tx.devicePunchReceipt.count())).toBeGreaterThan(0);
    await expect(inA((tx) => tx.devicePunchReceipt.deleteMany({}))).rejects.toThrow();
  });
});
