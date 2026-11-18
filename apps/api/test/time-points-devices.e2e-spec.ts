import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// TIM-31 Multi (several check-in points per location) and Extra · My attendance today · DeviceNotApproved (web clock-in
// only from a computer HR approved) end to end against the real database: positive paths and the negatives (wrong
// role, another company, bad input, someone else's change first, outside every point, an unapproved computer).
describe('Time: check-in points and approved computers', () => {
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
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const login = async (who: Who, k: 'A' | 'B') => (token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@dev-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken);
  const setting = (key: string, value: string) => inA((tx) => tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key, value } }));
  const auditOf = (action: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action } }));
  const noticesFor = (who: Who) => tenantPrisma.forTenant(SUPER, (tx) => tx.userNotification.findMany({ where: { recipientUserId: users[who], type: 'time.web_device.requested' } }));
  const sha = (v: string) => createHash('sha256').update(v).digest('hex');
  // Two computers: the sign-in device cookie (yx_device) each browser carries.
  const pcX = randomBytes(32).toString('base64url');
  const pcY = randomBytes(32).toString('base64url');
  const on = (pc: string) => `yx_device=${pc}`;
  const MAIN = { lat: 12.74, lng: 77.83 };
  const ANNEXE = { lat: 12.76, lng: 77.85 };

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
        // Saved the old way: one point in geo_lat / geo_lng / geo_radius_m, no geo_points yet.
        ids[`loc${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name: 'Hosur', code: 'HSR-PLT', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata', geoLat: MAIN.lat, geoLng: MAIN.lng, geoRadiusM: 300 } })).id;
        const deptId = randomUUID();
        ids[`dept${k}`] = (await tx.department.create({ data: { ...o, id: deptId, name: 'Production', code: 'PROD', path: `/${deptId}/` } })).id;
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...o, name: 'Operator', code: 'OP' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
        // Every day a working day, any time of day (a 00:00-23:59 shift), so punches never meet "shift not started".
        await tx.locationAttendanceRule.create({ data: { ...o, locationId: ids[`loc${k}`], validFrom: new Date('2025-01-01T00:00:00Z'), shiftStart: 0, shiftEnd: 1439, weeklyOffs: [] } });
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

  // ------------------------------------------------------------------------------------------ TIM-31 Multi

  const locA = async () => (await api('hrAdmin', 'get', '/time/setup').expect(200)).body.locations.find((l: { id: string }) => l.id === ids.locA);

  it('an old single-point location shows as one point named after it', async () => {
    const l = await locA();
    expect(l.points).toEqual([{ name: 'Hosur', lat: MAIN.lat, lng: MAIN.lng, radiusM: 300 }]);
    expect(l.updatedAt).toEqual(expect.any(String));
  });

  it('points: wrong role, another company and bad input are refused', async () => {
    const good = { points: [{ name: 'Main block', ...MAIN, radiusM: 300 }] };
    await api('emp', 'post', `/time/setup/locations/${ids.locA}/points`).send(good).expect(403);
    await api('hrExec', 'post', `/time/setup/locations/${ids.locA}/points`).send(good).expect(403);
    await api('adminB', 'post', `/time/setup/locations/${ids.locA}/points`).send(good).expect(404);
    await api('hrAdmin', 'post', '/time/setup/locations/not-a-uuid/points').send(good).expect(400);
    const bad = (points: unknown) => api('hrAdmin', 'post', `/time/setup/locations/${ids.locA}/points`).send({ points }).expect(400);
    await bad([{ name: 'Main', ...MAIN, radiusM: 20 }]);
    await bad([{ name: 'Main', ...MAIN, radiusM: 1001 }]);
    await bad([{ name: 'Main', lat: 91, lng: 77, radiusM: 100 }]);
    await bad([{ name: '  ', ...MAIN, radiusM: 100 }]);
    await bad(Array.from({ length: 21 }, (_, i) => ({ name: `P${i}`, ...MAIN, radiusM: 100 })));
    const twice = await bad([{ name: 'Gate', ...MAIN, radiusM: 100 }, { name: 'gate', ...ANNEXE, radiusM: 100 }]);
    expect(twice.body.message).toMatch(/Two points are called/);
    expect((await locA()).points).toHaveLength(1);
  });

  it('HR saves two points; someone else changing it first is refused; Settings keeps the first point; B untouched', async () => {
    const seen = (await locA()).updatedAt;
    const points = [{ name: 'Main block', ...MAIN, radiusM: 300 }, { name: 'Annexe', ...ANNEXE, radiusM: 100 }];
    const saved = await api('hrAdmin', 'post', `/time/setup/locations/${ids.locA}/points`).send({ points, updatedAt: seen }).expect(200);
    expect(saved.body.points).toEqual(points);
    await api('hrAdmin', 'post', `/time/setup/locations/${ids.locA}/points`).send({ points, updatedAt: seen }).expect(409);
    const row = await inA((tx) => tx.location.findFirst({ where: { id: ids.locA } }));
    expect([Number(row!.geoLat), Number(row!.geoLng), row!.geoRadiusM]).toEqual([MAIN.lat, MAIN.lng, 300]);
    expect((await auditOf('org.location.points_changed'))[0]).toBeTruthy();
    const b = await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.location.findFirst({ where: { id: ids.locB } }));
    expect(b!.geoPoints).toEqual([]);
  });

  it('a punch inside the second point is accepted; outside every point is refused and recorded', async () => {
    const out = await api('emp', 'post', '/time/me/punch').send({ kind: 'in', lat: 12.9, lng: 77.95, accuracyM: 20 }).expect(200);
    expect(out.body).toMatchObject({ accepted: false, verdict: 'outside' });
    const inside = await api('emp', 'post', '/time/me/punch').send({ kind: 'in', ...ANNEXE, accuracyM: 20 }).expect(200);
    expect(inside.body).toMatchObject({ accepted: true, verdict: 'inside' });
    expect(inside.body.message).toMatch(/Inside Hosur · Annexe/);
    const me = (await api('emp', 'get', `/time/me/attendance?month=${new Date().toISOString().slice(0, 7)}`).expect(200)).body;
    expect(me.fences.map((f: { point?: string }) => f.point)).toEqual(['Main block', 'Annexe']);
    expect(me.punches.filter((p: { accepted: boolean }) => !p.accepted)).toHaveLength(1);
  });

  // ------------------------------------------------------------------------------------------ answer 2477

  it('office Wi-Fi names: HR saves them with the networks (audited); wrong role, another company and bad input refused', async () => {
    const path = `/time/setup/locations/${ids.locA}/networks`;
    await api('emp', 'post', path).send({ ipRanges: [], wifiNames: ['KF-Hosur'] }).expect(403);
    await api('adminB', 'post', path).send({ ipRanges: [], wifiNames: ['KF-Hosur'] }).expect(404);
    await api('hrAdmin', 'post', path).send({ ipRanges: [], wifiNames: ['x'.repeat(33)] }).expect(400);
    await api('hrAdmin', 'post', path).send({ ipRanges: [], wifiNames: [''] }).expect(400);
    expect((await locA()).wifiNames).toEqual([]);
    expect((await api('hrAdmin', 'post', path).send({ ipRanges: [], wifiNames: [' KF-Hosur ', 'KF-Hosur', 'KF-Guest'] }).expect(200)).body.wifiNames).toEqual(['KF-Hosur', 'KF-Guest']);
    expect((await locA()).wifiNames).toEqual(['KF-Hosur', 'KF-Guest']);
    // Sending only the networks keeps the Wi-Fi names.
    await api('hrAdmin', 'post', path).send({ ipRanges: [] }).expect(200);
    expect((await locA()).wifiNames).toEqual(['KF-Hosur', 'KF-Guest']);
    expect((await auditOf('org.location.networks_changed')).some((a) => /KF-Guest/.test(a.metadataJson ?? ''))).toBe(true);
    expect((await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.location.findFirst({ where: { id: ids.locB } })))!.wifiNames).toEqual([]);
  });

  it('clock in again: refused after clocking out while off (the default); allowed once HR turns it on for the place', async () => {
    const month = new Date().toISOString().slice(0, 7);
    await api('emp', 'post', '/time/me/punch').send({ kind: 'out', ...ANNEXE, accuracyM: 20 }).expect(200);
    const refused = await api('emp', 'post', '/time/me/punch').send({ kind: 'in', ...ANNEXE, accuracyM: 20 }).expect(409);
    expect(refused.body.message).toBe("You have already clocked out today. To change today's times, regularise the day.");
    expect((await api('emp', 'get', `/time/me/attendance?month=${month}`).expect(200)).body.shift.reclockIn).toBe(false);
    const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    const rule = { validFrom: today, shiftStart: 0, shiftEnd: 1439, graceMinutes: 0, weeklyOffs: [], checkIn: 'restricted', reclockIn: true };
    await api('emp', 'post', `/time/setup/locations/${ids.locA}/rule`).send(rule).expect(403);
    await api('adminB', 'post', `/time/setup/locations/${ids.locA}/rule`).send(rule).expect(404);
    await api('hrAdmin', 'post', `/time/setup/locations/${ids.locA}/rule`).send({ ...rule, reclockIn: 'yes' }).expect(400);
    await api('hrAdmin', 'post', `/time/setup/locations/${ids.locA}/rule`).send(rule).expect(201);
    expect((await locA()).rule).toMatchObject({ reclockIn: true });
    expect((await api('emp', 'get', `/time/me/attendance?month=${month}`).expect(200)).body.shift.reclockIn).toBe(true);
    expect((await api('emp', 'post', '/time/me/punch').send({ kind: 'in', ...ANNEXE, accuracyM: 20 }).expect(200)).body).toMatchObject({ accepted: true });
    // The place is still checked on the second clock-in.
    await api('emp', 'post', '/time/me/punch').send({ kind: 'out', ...ANNEXE, accuracyM: 20 }).expect(200);
    expect((await api('emp', 'post', '/time/me/punch').send({ kind: 'in', lat: 12.9, lng: 77.95, accuracyM: 20 }).expect(200)).body).toMatchObject({ accepted: false, verdict: 'outside' });
  });

  // ------------------------------------------------------------------------------------------ DeviceNotApproved

  it('off by default: any computer clocks in, and there is nothing to ask for', async () => {
    const me = (await api('peer', 'get', `/time/me/attendance?month=${new Date().toISOString().slice(0, 7)}`).set('Cookie', on(pcX)).expect(200)).body;
    expect(me.device).toEqual({ required: false, approved: true, requested: false });
    await api('peer', 'post', '/time/me/web-device').set('Cookie', on(pcX)).expect(409);
  });

  let request1 = '';
  it('on: an unapproved computer is refused with the designed words, audited, and no punch is made', async () => {
    await setting('attendance.web_device_approval', 'on');
    const before = await inA((tx) => tx.punch.count({ where: { employeeId: ids.peer } }));
    const r = await api('peer', 'post', '/time/me/punch').set('Cookie', on(pcX)).send({ kind: 'in', ...MAIN, accuracyM: 20 }).expect(403);
    expect(r.body).toMatchObject({ code: 'DEVICE_NOT_APPROVED', message: "This computer isn't approved for clock-in. Use your approved device, or ask HR to approve this one." });
    expect(await inA((tx) => tx.punch.count({ where: { employeeId: ids.peer } }))).toBe(before);
    expect((await auditOf('time.web_device.punch_refused')).length).toBeGreaterThan(0);
    expect((await api('peer', 'get', `/time/me/attendance?month=${new Date().toISOString().slice(0, 7)}`).set('Cookie', on(pcX)).expect(200)).body.device).toEqual({ required: true, approved: false, requested: false });
  });

  it('a browser with no device cookie gets one (the same cookie sign-in uses)', async () => {
    const r = await api('peer', 'get', `/time/me/attendance?month=${new Date().toISOString().slice(0, 7)}`).expect(200);
    expect(String(r.headers['set-cookie'])).toMatch(/yx_device=[A-Za-z0-9_-]{43};.*HttpOnly/);
  });

  it('asking HR: once per computer (a repeat answers the same request), one computer waiting at a time; only the hash is kept', async () => {
    const a = await api('peer', 'post', '/time/me/web-device').set('Cookie', on(pcX)).set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36').expect(200);
    request1 = a.body.id;
    expect((await api('peer', 'post', '/time/me/web-device').set('Cookie', on(pcX)).expect(200)).body.id).toBe(request1);
    await api('peer', 'post', '/time/me/web-device').set('Cookie', on(pcY)).expect(409);
    const row = await inA((tx) => tx.timeDevice.findFirst({ where: { id: request1 } }));
    expect(row).toMatchObject({ kind: 'web', status: 'pending', model: 'Chrome on Windows', installHash: sha(pcX) });
    expect(JSON.stringify(row)).not.toContain(pcX);
    expect((await api('peer', 'get', `/time/me/attendance?month=${new Date().toISOString().slice(0, 7)}`).set('Cookie', on(pcX)).expect(200)).body.device.requested).toBe(true);
    expect((await auditOf('time.web_device.requested')).length).toBe(1);
    // Founder answer 4: HR admins hear of it once (not for the repeat); the person asking does not.
    const told = await noticesFor('hrAdmin');
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ entityId: request1, linkPath: '/yx/time/setup/devices' });
    expect(told[0]!.contextText).toMatch(/asked to clock in on the web from a new computer \(Chrome on Windows\)/);
    expect(await noticesFor('peer')).toHaveLength(0);
    expect(await noticesFor('hrExec')).toHaveLength(0);
  });

  it('HR sees the request; wrong role, another company and approving oneself are refused; HR approves', async () => {
    const list = (await api('hrAdmin', 'get', '/time/devices').expect(200)).body;
    expect(list.requests).toEqual([expect.objectContaining({ id: request1, kind: 'web', model: 'Chrome on Windows', oldModel: null })]);
    await api('hrExec', 'post', `/time/devices/phones/${request1}/approve`).expect(403);
    await api('peer', 'post', `/time/devices/phones/${request1}/approve`).expect(403);
    await api('adminB', 'post', `/time/devices/phones/${request1}/approve`).expect(404);
    expect((await api('adminB', 'get', '/time/devices').expect(200)).body.requests).toEqual([]);
    await api('hrAdmin', 'post', `/time/devices/phones/${request1}/approve`).expect(200);
    await api('hrAdmin', 'post', `/time/devices/phones/${request1}/approve`).expect(409);
    expect((await auditOf('time.web_device.approved')).length).toBe(1);
  });

  it('the approved computer clocks in; another computer is still refused', async () => {
    expect((await api('peer', 'get', `/time/me/attendance?month=${new Date().toISOString().slice(0, 7)}`).set('Cookie', on(pcX)).expect(200)).body.device).toEqual({ required: true, approved: true, requested: false });
    const ok = await api('peer', 'post', '/time/me/punch').set('Cookie', on(pcX)).send({ kind: 'in', ...MAIN, accuracyM: 20 }).expect(200);
    expect(ok.body.accepted).toBe(true);
    await api('peer', 'post', '/time/me/punch').set('Cookie', on(pcY)).send({ kind: 'out', ...MAIN, accuracyM: 20 }).expect(403);
    await api('peer', 'post', '/time/me/web-device').set('Cookie', on(pcX)).expect(409);
  });

  it('HR removes the approval: the person stays signed in but that computer is refused again', async () => {
    const row = (await api('hrAdmin', 'get', '/time/devices').expect(200)).body.phones.find((p: { id: string }) => p.id === request1);
    expect(row).toMatchObject({ kind: 'web', status: 'active' });
    await api('adminB', 'post', `/time/devices/phones/${request1}/sign-out`).expect(404);
    await api('hrExec', 'post', `/time/devices/phones/${request1}/sign-out`).expect(403);
    const out = await api('hrAdmin', 'post', `/time/devices/phones/${request1}/sign-out`).expect(200);
    expect(out.body.sessionsEnded).toBe(0);
    await api('hrAdmin', 'post', `/time/devices/phones/${request1}/sign-out`).expect(409);
    expect((await auditOf('time.web_device.revoked')).length).toBe(1);
    await api('peer', 'post', '/time/me/punch').set('Cookie', on(pcX)).send({ kind: 'out', ...MAIN, accuracyM: 20 }).expect(403);
  });

  it('the web clock-in rule on TIM-14: wrong role, bad input and another company refused; a location sets its own; audited', async () => {
    await api('emp', 'put', '/time/devices/web-approval').send({ scopeType: 'tenant', value: 'off' }).expect(403);
    await api('hrExec', 'put', '/time/devices/web-approval').send({ scopeType: 'tenant', value: 'off' }).expect(403);
    await api('hrAdmin', 'put', '/time/devices/web-approval').send({ scopeType: 'tenant', value: 'maybe' }).expect(400);
    await api('hrAdmin', 'put', '/time/devices/web-approval').send({ scopeType: 'department', scopeId: ids.deptA, value: 'on' }).expect(400);
    await api('hrAdmin', 'put', '/time/devices/web-approval').send({ scopeType: 'location', value: 'on' }).expect(400);
    await api('hrAdmin', 'put', '/time/devices/web-approval').send({ scopeType: 'tenant', scopeId: ids.locA, value: 'on' }).expect(400);
    await api('hrAdmin', 'put', '/time/devices/web-approval').send({ scopeType: 'location', scopeId: ids.locB, value: 'off' }).expect(404);
    // The company rule is on (set above); Hosur turns it off for itself, so the peer clocks in from any computer there.
    await api('hrAdmin', 'put', '/time/devices/web-approval').send({ scopeType: 'location', scopeId: ids.locA, value: 'off' }).expect(200);
    const w = (await api('hrAdmin', 'get', '/time/devices').expect(200)).body.webApproval;
    expect(w.company).toBe('on');
    expect(w.overrides).toEqual([expect.objectContaining({ scopeType: 'location', scopeId: ids.locA, name: 'Hosur', value: 'off' })]);
    expect((await api('peer', 'get', `/time/me/attendance?month=${new Date().toISOString().slice(0, 7)}`).set('Cookie', on(pcY)).expect(200)).body.device.required).toBe(false);
    expect(JSON.stringify(await auditOf('org.setting.changed'), (_k, v) => (typeof v === 'bigint' ? String(v) : v))).toContain('attendance.web_device_approval');
    // Another company sees only its own rule and cannot remove this one; a wrong id is 404.
    expect((await api('adminB', 'get', '/time/devices').expect(200)).body.webApproval).toEqual({ company: 'off', overrides: [] });
    await api('adminB', 'post', `/time/devices/web-approval/${w.overrides[0].id}/remove`).expect(404);
    await api('hrAdmin', 'post', `/time/devices/web-approval/${randomUUID()}/remove`).expect(404);
    await api('hrExec', 'post', `/time/devices/web-approval/${w.overrides[0].id}/remove`).expect(403);
    await api('hrAdmin', 'post', `/time/devices/web-approval/${w.overrides[0].id}/remove`).expect(200);
    expect((await api('hrAdmin', 'get', '/time/devices').expect(200)).body.webApproval.overrides).toEqual([]);
    expect((await api('peer', 'get', `/time/me/attendance?month=${new Date().toISOString().slice(0, 7)}`).set('Cookie', on(pcY)).expect(200)).body.device.required).toBe(true);
  });

  it('HR refuses a request with a reason; another company with the setting off clocks in as before', async () => {
    const asked = await api('peer', 'post', '/time/me/web-device').set('Cookie', on(pcY)).expect(200);
    await api('hrAdmin', 'post', `/time/devices/phones/${asked.body.id}/refuse`).send({ reason: 'Ask them to visit HR with the computer' }).expect(200);
    expect((await auditOf('time.web_device.refused')).length).toBe(1);
    const b = await api('empB', 'post', '/time/me/punch').set('Cookie', on(pcY)).send({ kind: 'in', ...MAIN, accuracyM: 20 }).expect(200);
    expect(b.body.accepted).toBe(true);
  });
});
