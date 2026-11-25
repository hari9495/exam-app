import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { FieldJobs } from '../src/time/field-jobs';
import { NOTICE_VERSION } from '../src/time/field-rules';
import { addDays } from '../src/time/time-maths';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// TIM-32 field-force map and TIM-33 visits, end to end against the real database (forced RLS, the app role): consent
// against a notice, tracking only when on, consented and on duty; readings kept once; integrity flags; the manager's and
// HR's reach (404 outside it, 404 for another company); the beat plan and visit check-in / out; withdrawal erases the
// trail; the retention job deletes only old readings, twice safely, and skips a company another server holds.
describe('Time · field force (TIM-32 / TIM-33)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let jobs: FieldJobs;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hrExec' | 'mgr' | 'emp' | 'peer' | 'other' | 'empB' | 'acting';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  // Chennai, Adyar: a shop, a reading at the shop, and one 22 km away a minute later.
  const SHOP = { lat: 13.0012, lng: 80.2565 };
  const ping = (over: Partial<{ clientRef: string; at: string; lat: number; lng: number; accuracyM: number; mock: boolean }> = {}) => ({ clientRef: randomUUID(), at: new Date().toISOString(), ...SHOP, accuracyM: 15, ...over });
  const send = (who: Who, pings: object[], sentAt = new Date().toISOString()) => api(who, 'post', '/time/me/field/pings').send({ sentAt, pings });
  const pingsOf = (emp: string) => inA((tx) => tx.locationPing.findMany({ where: { organizationId: org.A.id, employeeId: emp }, orderBy: { at: 'asc' } }));

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
    jobs = moduleRef.get(FieldJobs);

    planId = (await prisma.plan.create({ data: { name: `field-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Field Org ${k}`, slug: `field-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = async (o: string, name: string, keys: readonly string[]) => (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${name}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hrExec', 'A', 'panel', ['attendance.view']],
      ['mgr', 'A', 'panel', null],
      ['emp', 'A', 'panel', null],
      ['peer', 'A', 'panel', null],
      ['other', 'A', 'panel', null],
      ['empB', 'B', 'panel', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? await profile(o, who, keys) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@field-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@field-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    for (const k of ['A', 'B'] as const) {
      await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `Field Foods ${k}`, shortName: `FF${k}-${run}`, isDefault: true } })).id;
        ids[`loc${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name: 'Chennai', code: 'MAA', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata', geoLat: 13.0, geoLng: 80.25, geoRadiusM: 200 } })).id;
        const deptId = randomUUID();
        ids[`dept${k}`] = (await tx.department.create({ data: { ...o, id: deptId, name: 'Sales', code: 'SAL', path: `/${deptId}/` } })).id;
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...o, name: 'Sales officer', code: 'SO' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
        // Field check-in: a punch is accepted wherever the person is (field staff), every day a working day.
        await tx.locationAttendanceRule.create({ data: { ...o, locationId: ids[`loc${k}`], validFrom: new Date('2025-01-01T00:00:00Z'), shiftStart: 540, shiftEnd: 1080, weeklyOffs: [], checkIn: 'field', reclockIn: true } });
        // Answer 2477: field staff here clock in again after a visit (off by default; this location turns it on).
      });
    }
    const hire = async (admin: 'adminA' | 'adminB', who: Who, manager: string | null, k: 'A' | 'B' = 'A') =>
      (
        await api(admin, 'post', '/people/employees')
          .send({ legalEntityId: ids[`entity${k}`], status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: addDays(today, -60), userId: users[who], workEmail: `${who}@field-${run}.test`, assignment: { locationId: ids[`loc${k}`], departmentId: ids[`dept${k}`], designationId: ids[`desig${k}`], employmentTypeId: ids[`perm${k}`], managerEmployeeId: manager } })
          .expect(201)
      ).body.id as string;
    ids.mgrEmp = await hire('adminA', 'mgr', null);
    ids.empEmp = await hire('adminA', 'emp', ids.mgrEmp);
    ids.peerEmp = await hire('adminA', 'peer', ids.mgrEmp);
    ids.otherEmp = await hire('adminA', 'other', null);
    ids.hrEmp = await hire('adminA', 'hrExec', null);
    ids.empBEmp = await hire('adminB', 'empB', null, 'B');
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

  it('the field tables have forced RLS and tenant isolation', async () => {
    const tables = ['field_consents', 'location_pings', 'field_visits'];
    const rows = await prisma.$queryRaw<{ relname: string; forced: boolean; policy: boolean }[]>`
      SELECT c.relname, c.relforcerowsecurity AS forced, EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS policy
      FROM pg_class c WHERE c.relname = ANY(${tables}::text[]) AND c.relkind = 'r'`;
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r).toMatchObject({ forced: true, policy: true });
  });

  describe('consent and tracking (DPDP Act 2023)', () => {
    it('tracking off: readings are refused and nothing is stored', async () => {
      const me = (await api('emp', 'get', '/time/me/field').expect(200)).body;
      expect(me).toMatchObject({ tracking: false, consent: null, onDuty: false, notice: { version: NOTICE_VERSION } });
      expect(me.notice.retention).toMatch(/30 days/);
      await api('emp', 'post', '/time/me/field/consent').send({ noticeVersion: NOTICE_VERSION }).expect(201);
      await api('emp', 'post', '/time/me/punch').send({ kind: 'in', ...SHOP, accuracyM: 10 }).expect(200);
      expect((await send('emp', [ping()]).expect(403)).body.message).toMatch(/off for your group/);
      expect(await pingsOf(ids.empEmp)).toHaveLength(0);
      // Back to the start: consent withdrawn, checked out (the later tests take each step on its own).
      await api('emp', 'post', '/time/me/field/consent/withdraw').expect(200);
      await api('emp', 'post', '/time/me/punch').send({ kind: 'out', ...SHOP, accuracyM: 10 }).expect(200);
      await api('adminA', 'put', '/org/settings').send({ key: 'field.tracking', scopeType: 'tenant', value: 'on' }).expect(200);
    });

    it('no consent: refused, nothing stored; a stale notice or a second consent is refused', async () => {
      await api('peer', 'post', '/time/me/punch').send({ kind: 'in', ...SHOP, accuracyM: 10 }).expect(200);
      expect((await send('peer', [ping()]).expect(403)).body.message).toMatch(/not agreed/);
      expect(await pingsOf(ids.peerEmp)).toHaveLength(0);
      await api('peer', 'post', '/time/me/field/consent').send({ noticeVersion: '2020-01' }).expect(409);
      await api('peer', 'post', '/time/me/field/consent').send({ noticeVersion: NOTICE_VERSION }).expect(201);
      await api('peer', 'post', '/time/me/field/consent').send({ noticeVersion: NOTICE_VERSION }).expect(409);
      await api('emp', 'post', '/time/me/field/consent').send({ noticeVersion: NOTICE_VERSION }).expect(201);
    });

    it('off duty (not checked in): refused and nothing stored', async () => {
      expect((await send('emp', [ping()]).expect(409)).body.message).toMatch(/not checked in/);
      expect(await pingsOf(ids.empEmp)).toHaveLength(0);
    });

    it('acting for someone else is refused (consent, readings, visits)', async () => {
      const res = await api('adminA', 'post', `/auth/impersonate/${users.emp}`).expect(200);
      token.acting = res.body.accessToken;
      await api('acting', 'post', '/time/me/field/consent/withdraw').expect(403);
      await send('acting', [ping()]).expect(403);
      await api('acting', 'post', '/time/me/field/visits').send({ clientRef: randomUUID(), ...SHOP, accuracyM: 10 }).expect(403);
    });

    it('on duty: readings are stored once, with integrity flags (never a penalty)', async () => {
      await api('emp', 'post', '/time/me/punch').send({ kind: 'in', ...SHOP, accuracyM: 10 }).expect(200);
      // Readings a few seconds after the check-in.
      await new Promise((r) => setTimeout(r, 3500));
      const t0 = Date.now();
      const batch = [
        ping({ at: new Date(t0 - 3000).toISOString() }),
        ping({ at: new Date(t0 - 2000).toISOString(), mock: true }),
        // 22 km in a second: impossible speed.
        ping({ at: new Date(t0 - 1000).toISOString(), lat: SHOP.lat + 0.2 }),
        // A weak fix (over field.max_accuracy_m 100): kept, flagged, left out of the trail and distance.
        ping({ at: new Date(t0).toISOString(), accuracyM: 500 }),
      ];
      expect((await send('emp', batch).expect(200)).body).toMatchObject({ stored: 4, repeats: 0, refused: [] });
      // The same upload again (a retry): nothing new.
      expect((await send('emp', batch).expect(200)).body).toMatchObject({ stored: 0, repeats: 4 });
      const rows = await pingsOf(ids.empEmp);
      expect(rows.map((r) => r.flags)).toEqual([[], ['mock'], ['speed'], ['accuracy']]);
      // A phone clock 10 minutes off flags the batch; a reading from before check-in is refused, the rest kept.
      const skew = await send('emp', [ping(), ping({ at: new Date(t0 - 3 * 3_600_000).toISOString() })], new Date(t0 + 10 * 60_000).toISOString()).expect(200);
      expect(skew.body).toMatchObject({ stored: 1, refused: [{ reason: 'before_consent' }] });
      expect((await pingsOf(ids.empEmp)).at(-1)!.flags).toContain('skew');
    });

    it('bad input is refused (400): latitude 200, a batch over 100, a reading with no id', async () => {
      await send('emp', [ping({ lat: 200 })]).expect(400);
      await send('emp', Array.from({ length: 101 }, () => ping())).expect(400);
      await send('emp', []).expect(400);
      await send('emp', [{ ...ping(), clientRef: 'not-a-uuid' }]).expect(400);
      await api('emp', 'post', '/time/me/field/pings').send({ pings: [ping()] }).expect(400);
    });
  });

  describe('the map (TIM-32)', () => {
    it("the manager sees their team on duty with a position; HR (attendance.view) too; others are refused", async () => {
      const map = (await api('mgr', 'get', '/time/field').expect(200)).body;
      expect(map).toMatchObject({ scope: 'team', trackingOff: false });
      const emp = map.people.find((p: { id: string }) => p.id === ids.empEmp);
      expect(emp).toMatchObject({ onDuty: true, tracking: true, consent: 'given', flag: { kinds: expect.arrayContaining(['mock', 'speed']) } });
      expect(emp.last).toMatchObject({ lat: expect.any(Number) });
      expect(map.people.map((p: { id: string }) => p.id)).not.toContain(ids.otherEmp);
      const hr = (await api('hrExec', 'get', '/time/field').expect(200)).body;
      expect(hr.scope).toBe('granted');
      expect(hr.people.map((p: { id: string }) => p.id)).toEqual(expect.arrayContaining([ids.empEmp, ids.peerEmp, ids.otherEmp]));
      // No team and no attendance.view: refused.
      await api('other', 'get', '/time/field').expect(403);
      await api('emp', 'get', '/time/field').expect(403);
      expect((await api('adminB', 'get', '/time/field').expect(200)).body.people).toEqual([]);
    });

    it("a person's trail is duty-only; outside reach or another company: 404", async () => {
      const day = (await api('mgr', 'get', `/time/field/people/${ids.empEmp}`).expect(200)).body;
      expect(day.trail.length).toBe(5);
      expect(day.fences).toEqual([expect.objectContaining({ name: 'Chennai', radiusM: 200 })]);
      await api('other', 'get', `/time/field/people/${ids.empEmp}`).expect(404);
      await api('peer', 'get', `/time/field/people/${ids.empEmp}`).expect(404);
      await api('adminB', 'get', `/time/field/people/${ids.empEmp}`).expect(404);
      await api('mgr', 'get', `/time/field/people/${ids.empBEmp}`).expect(404);
      await api('mgr', 'get', `/time/field/people/${randomUUID()}`).expect(404);
    });

    it('flags are marked reviewed by the manager, once; never by the person', async () => {
      await api('emp', 'post', `/time/field/people/${ids.empEmp}/flags/review`).expect(403);
      await api('other', 'post', `/time/field/people/${ids.empEmp}/flags/review`).expect(404);
      expect((await api('mgr', 'post', `/time/field/people/${ids.empEmp}/flags/review`).expect(200)).body).toEqual({ reviewed: 2 });
      await api('mgr', 'post', `/time/field/people/${ids.empEmp}/flags/review`).expect(409);
      const day = (await api('mgr', 'get', `/time/field/people/${ids.empEmp}`).expect(200)).body;
      expect(day.person.flag).toBeNull();
      expect(day.person.reviewed).toMatchObject({ by: `mgr ${run}` });
      // The flags stay on the readings.
      expect((await pingsOf(ids.empEmp)).filter((p) => p.flags.includes('mock'))).toHaveLength(1);
    });
  });

  describe('beat plan and visits (TIM-33)', () => {
    it('the manager plans; the person, another manager and another company cannot', async () => {
      const plan = { employeeId: ids.empEmp, on: today, place: 'Anand Stores, Adyar', ...SHOP, radiusM: 100, plannedMinute: 600 };
      ids.v1 = (await api('mgr', 'post', '/time/field/visits').send(plan).expect(201)).body.id;
      await api('hrExec', 'post', '/time/field/visits').send({ ...plan, place: 'Kumar Agencies' }).expect(404);
      ids.v2 = (await api('mgr', 'post', '/time/field/visits').send({ ...plan, place: 'Kumar Agencies, Besant Nagar', lat: 13.0, lng: 80.27 }).expect(201)).body.id;
      ids.v3 = (await api('mgr', 'post', '/time/field/visits').send({ ...plan, place: 'Selvam Stores', lat: undefined, lng: undefined }).expect(201)).body.id;
      await api('emp', 'post', '/time/field/visits').send(plan).expect(403);
      await api('other', 'post', '/time/field/visits').send(plan).expect(404);
      await api('adminB', 'post', '/time/field/visits').send(plan).expect(404);
      await api('mgr', 'post', '/time/field/visits').send({ ...plan, on: addDays(today, -1) }).expect(400);
      await api('mgr', 'post', '/time/field/visits').send({ ...plan, lng: undefined }).expect(400);
      await api('mgr', 'post', '/time/field/visits').send({ ...plan, radiusM: 10 }).expect(400);
      await api('mgr', 'post', '/time/field/visits').send({ ...plan, place: '' }).expect(400);
      // Cancel an upcoming visit (not another company's).
      await api('adminB', 'post', `/time/field/visits/${ids.v3}/cancel`).expect(404);
      await api('mgr', 'post', `/time/field/visits/${ids.v3}/cancel`).expect(200);
      expect((await api('emp', 'get', '/time/me/field').expect(200)).body.visits.map((x: { place: string }) => x.place)).toEqual(['Anand Stores, Adyar', 'Kumar Agencies, Besant Nagar']);
    });

    it('check-in inside / outside the radius, one at a time, retries answer the first result', async () => {
      const at = (id: string, p: object) => api('emp', 'post', `/time/me/field/visits/${id}/check-in`).send(p);
      const first = (await at(ids.v1, { lat: SHOP.lat + 0.0002, lng: SHOP.lng, accuracyM: 12 }).expect(200)).body;
      expect(first).toMatchObject({ status: 'on_site', inside: true, repeat: false });
      expect((await at(ids.v1, { lat: 0, lng: 0, accuracyM: 12 }).expect(200)).body).toMatchObject({ inside: true, repeat: true });
      expect((await at(ids.v2, { ...SHOP, accuracyM: 12 }).expect(409)).body.message).toMatch(/Check out of Anand Stores/);
      await api('emp', 'post', `/time/me/field/visits/${ids.v1}/check-out`).send({ outcome: '' }).expect(400);
      expect((await api('emp', 'post', `/time/me/field/visits/${ids.v1}/check-out`).send({ outcome: 'Order taken', note: 'Two cases' }).expect(200)).body).toMatchObject({ status: 'done', repeat: false });
      expect((await api('emp', 'post', `/time/me/field/visits/${ids.v1}/check-out`).send({ outcome: 'Order taken' }).expect(200)).body.repeat).toBe(true);
      await api('emp', 'post', `/time/me/field/visits/${ids.v1}/check-out`).send({ outcome: 'Follow-up' }).expect(409);
      // 1.4 km from the second shop, mock location reported: outside, flagged.
      expect((await at(ids.v2, { ...SHOP, accuracyM: 12, mock: true }).expect(200)).body).toMatchObject({ inside: false, flags: ['mock'] });
      await api('peer', 'post', `/time/me/field/visits/${ids.v2}/check-out`).send({ outcome: 'x' }).expect(404);
      await api('emp', 'post', `/time/me/field/visits/${ids.v2}/check-out`).send({ outcome: 'Shop closed' }).expect(200);
    });

    it('an unplanned visit is kept once per client ref, with a place name from the maps adapter', async () => {
      const ref = randomUUID();
      const a = (await api('emp', 'post', '/time/me/field/visits').send({ clientRef: ref, ...SHOP, accuracyM: 20 }).expect(201)).body;
      expect(a).toMatchObject({ planned: false, status: 'on_site', place: 'Near 13.0012, 80.2565' });
      const b = (await api('emp', 'post', '/time/me/field/visits').send({ clientRef: ref, ...SHOP, accuracyM: 20 }).expect(201)).body;
      expect(b).toMatchObject({ id: a.id, repeat: true });
      expect(await inA((tx) => tx.fieldVisit.count({ where: { organizationId: org.A.id, employeeId: ids.empEmp, planned: false } }))).toBe(1);
      await api('emp', 'post', `/time/me/field/visits/${a.id}/check-out`).send({ outcome: 'Follow-up' }).expect(200);
    });

    it('after check-out: readings and visits are refused, nothing stored', async () => {
      const before = (await pingsOf(ids.empEmp)).length;
      await api('emp', 'post', '/time/me/punch').send({ kind: 'out', ...SHOP, accuracyM: 10 }).expect(200);
      await new Promise((r) => setTimeout(r, 20));
      expect((await send('emp', [ping()]).expect(409)).body.message).toMatch(/not checked in/);
      expect(await pingsOf(ids.empEmp)).toHaveLength(before);
      await api('emp', 'post', '/time/me/field/visits').send({ clientRef: randomUUID(), ...SHOP, accuracyM: 20 }).expect(409);
      const emp = (await api('mgr', 'get', '/time/field').expect(200)).body.people.find((p: { id: string }) => p.id === ids.empEmp);
      expect(emp).toMatchObject({ onDuty: false, last: null });
    });
  });

  describe('withdrawal and retention', () => {
    it('withdrawing consent stops tracking and erases the trail; the map shows no trail', async () => {
      await api('peer', 'post', '/time/me/field/consent/withdraw').expect(200);
      await api('peer', 'post', '/time/me/field/consent/withdraw').expect(409);
      expect((await send('peer', [ping()]).expect(403)).body.message).toMatch(/not agreed/);
      const res = (await api('emp', 'post', '/time/me/field/consent/withdraw').expect(200)).body;
      expect(res.erasedPings).toBeGreaterThan(0);
      expect(await pingsOf(ids.empEmp)).toHaveLength(0);
      const day = (await api('mgr', 'get', `/time/field/people/${ids.empEmp}`).expect(200)).body;
      expect(day.person).toMatchObject({ consent: 'withdrawn', km: null, last: null });
      expect(day.trail).toEqual([]);
      // Attendance and visits are untouched.
      expect(day.visits).toHaveLength(3);
    });

    it('the retention job deletes only readings past field.trail_retention_days, is safe twice, and skips a held company', async () => {
      const row = (workOn: string) => ({ organizationId: org.A.id, employeeId: ids.peerEmp, workOn: new Date(`${workOn}T00:00:00Z`), at: new Date(`${workOn}T05:00:00Z`), lat: 13, lng: 80, accuracyM: 10, clientRef: randomUUID() });
      await inA((tx) => tx.locationPing.createMany({ data: [row(addDays(today, -31)), row(addDays(today, -30)), row(addDays(today, -1))] }));
      const first = await jobs.retention(today, [org.A.id]);
      expect(first).toEqual([expect.objectContaining({ status: 'done', deleted: 1, cutoff: addDays(today, -30) })]);
      expect((await jobs.retention(today, [org.A.id]))[0]).toMatchObject({ status: 'done', deleted: 0 });
      expect((await pingsOf(ids.peerEmp)).map((p) => p.workOn.toISOString().slice(0, 10))).toEqual([addDays(today, -30), addDays(today, -1)]);
      // A company setting of 7 days, and another server holding the company's lock.
      await api('adminA', 'put', '/org/settings').send({ key: 'field.trail_retention_days', scopeType: 'tenant', value: '7' }).expect(200);
      let release!: () => void;
      const held = new Promise<void>((r) => (release = r));
      let locked!: () => void;
      const isLocked = new Promise<void>((r) => (locked = r));
      const holder = inA(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`field-retention:${org.A.id}`}))`;
        locked();
        await held;
      });
      await isLocked;
      expect((await jobs.purge(org.A.id, today)).status).toBe('skipped');
      release();
      await holder;
      expect(await jobs.purge(org.A.id, today)).toMatchObject({ status: 'done', deleted: 1 });
      const audits = await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'time.field.trail_purged' } }));
      expect(audits).toBe(2);
    });
  });
});
