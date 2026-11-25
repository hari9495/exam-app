import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { BlobStorageService, OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { addDays } from '../src/lifecycle/journey-rules';
import { hashValue, sealValue } from '../src/people/profile.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';

// The last People rows we build ourselves (people-design-map, branch feat/yukthix-people-last), against the real
// database (forced RLS): PPL-33 Request a correction (a profile request to HR) and Nominate someone; PPL-36 possible
// same person on PAN, UAN and name + date of birth (never the name alone) with the merge making the joiner a rehire;
// PPL-44 the trading window calendar refusing pre-clearance while closed; PPL-46 the split pay request (approval and
// cooling period). Each with the wrong person or role, another company and bad input. PPL-28 is in lifecycle-6d; the
// split paid by payroll is in payroll-split-pay.
describe('People last rows', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let crypto: OrgSecretsCryptoService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hr' | 'hr2' | 'comp' | 'emp' | 'other';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const stepUp = (who: Who) => markSteppedUp(tenantPrisma, token[who]);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);

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
    crypto = moduleRef.get(OrgSecretsCryptoService);

    planId = (await prisma.plan.create({ data: { name: `last-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Last Org ${k}`, slug: `last-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hr', 'A', 'panel', [...tpl('hr_admin'), 'employee.identity.approve', 'employee.identity.manage']],
      ['hr2', 'A', 'panel', [...tpl('hr_admin'), 'employee.identity.approve', 'employee.identity.manage']],
      ['comp', 'A', 'panel', ['employee.profile.view', 'compliance.declaration.manage']],
      ['emp', 'A', 'panel', null],
      ['other', 'A', 'panel', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@last-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@last-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Last Foods', shortName: `LF-${run}`, isDefault: true } })).id;
      ids.blr = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Production', code: 'PROD', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Operator', code: 'OP' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const hire = async (given: string, family: string, code: string, extra: Record<string, unknown> = {}) =>
      (
        await api('adminA', 'post', '/people/employees')
          .send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', overrideReason: 'Joined before go-live', givenName: given, familyName: family, employeeCode: code, joinedOn: '2020-01-06', assignment: { locationId: ids.blr, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null }, ...extra })
          .expect(201)
      ).body.id as string;
    ids.empEmp = await hire('Kaveri', run, 'L-001', { userId: users.emp, workEmail: `emp@last-${run}.test` });
    ids.otherEmp = await hire('Other', run, 'L-002', { userId: users.other, workEmail: `other@last-${run}.test` });
    // PPL-36: a former employee (Suresh Nair, left 14 Feb 2025) with PAN, UAN and date of birth on file, and a current one.
    ids.suresh = await hire('Suresh', `Nair${run}`, 'L-077', { workEmail: `suresh-${run}@mail.test` });
    ids.priya = await hire('Priya', `Nair${run}`, 'L-061', { workEmail: `priya-${run}@mail.test` });
    await inA(async (tx) => {
      await tx.employment.updateMany({ where: { organizationId: org.A.id, employeeId: ids.suresh }, data: { exitedOn: new Date('2025-02-14T00:00:00Z') } });
      await tx.employeeIdentifiers.create({ data: { organizationId: org.A.id, employeeId: ids.suresh, panEnc: sealValue(crypto, org.A.id, ids.suresh, 'BKNPN7712Q'), panHash: hashValue(crypto, org.A.id, 'pan', 'BKNPN7712Q'), panLast4: '712Q', uanEnc: sealValue(crypto, org.A.id, ids.suresh, '100911223344'), uanHash: hashValue(crypto, org.A.id, 'uan', '100911223344'), uanLast4: '3344' } });
      for (const [e, dob] of [[ids.suresh, '1990-02-11'], [ids.priya, '1988-12-19']] as const) await tx.employeePersonalDetails.create({ data: { organizationId: org.A.id, employeeId: e, dateOfBirth: new Date(`${dob}T00:00:00Z`) } });
      ids.sureshP = (await tx.employee.findFirstOrThrow({ where: { id: ids.suresh } })).personId;
      ids.priyaP = (await tx.employee.findFirstOrThrow({ where: { id: ids.priya } })).personId;
    });
    await api('adminA', 'post', '/lifecycle/journey-templates/from-starter').send({ starterKey: 'onboarding_standard' }).expect(201);
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

  it('new tables have forced RLS with tenant isolation and the support exclusion', async () => {
    const tables = ['privacy_nominees', 'employee_pay_splits', 'trading_windows'];
    const rows = await prisma.$queryRaw<{ t: string; ok: boolean }[]>`
      SELECT c.relname AS t, (c.relrowsecurity AND c.relforcerowsecurity
        AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation')
        AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'support_session_excluded' AND NOT p.polpermissive)) AS ok
      FROM pg_class c WHERE c.relname = ANY(${tables}::text[])`;
    expect(rows.filter((r) => r.ok).map((r) => r.t).sort()).toEqual([...tables].sort());
  });

  // ------------------------------------------------------------------------------------------ PPL-33

  describe('PPL-33 my data', () => {
    const correction = (text = 'My joining date is 6 Jan 2020, not 7 Jan.') => ({ kind: 'correction', value: { correctionField: 'internal', correctionText: text } });

    it('Request a correction: the person only, with step-up; bad input refused; one waiting at a time', async () => {
      await api('emp', 'post', `/people/employees/${ids.empEmp}/profile-requests`).send(correction()).expect(403); // no fresh second factor
      await stepUp('emp');
      await api('emp', 'post', `/people/employees/${ids.empEmp}/profile-requests`).send({ kind: 'correction', value: { correctionField: 'salary', correctionText: 'Wrong' } }).expect(400);
      await api('emp', 'post', `/people/employees/${ids.empEmp}/profile-requests`).send(correction('x')).expect(400);
      await api('emp', 'post', `/people/employees/${ids.empEmp}/profile-requests`).send({ kind: 'correction', value: { correctionField: 'internal', correctionText: 'Wrong date', pan: 'ABCPE1234F' } }).expect(400);
      // HR cannot ask for someone else's correction; another company does not reach the person.
      await stepUp('hr');
      expect((await api('hr', 'post', `/people/employees/${ids.empEmp}/profile-requests`).send(correction()).expect(403)).body.message).toMatch(/person themselves/);
      await stepUp('adminB');
      await api('adminB', 'post', `/people/employees/${ids.empEmp}/profile-requests`).send(correction()).expect(404);
      const r = (await api('emp', 'post', `/people/employees/${ids.empEmp}/profile-requests`).send(correction()).expect(201)).body;
      expect(r).toMatchObject({ kind: 'correction', label: 'Correction to my data', status: 'pending', proposed: { field: 'Joining date, grade, birthday', value: 'My joining date is 6 Jan 2020, not 7 Jan.' } });
      ids.correction = r.id;
      expect((await api('emp', 'post', `/people/employees/${ids.empEmp}/profile-requests`).send(correction('Another thing is wrong')).expect(409)).body.message).toMatch(/already waiting/);
      expect(await inA((tx) => tx.auditLog.count({ where: { action: 'employee.profile_change.requested', entityId: ids.empEmp } }))).toBe(1);
    });

    it('HR decides it like any change: never the person; approving changes nothing on file and tells them', async () => {
      await stepUp('emp');
      await api('emp', 'post', `/people/profile-requests/${ids.correction}/approve`).send({}).expect(403);
      await api('other', 'post', `/people/profile-requests/${ids.correction}/approve`).send({}).expect(403);
      const queue = (await api('hr', 'get', '/people/profile-requests?status=pending').expect(200)).body.rows as { id: string }[];
      expect(queue.map((x) => x.id)).toContain(ids.correction);
      await stepUp('hr');
      expect((await api('hr', 'post', `/people/profile-requests/${ids.correction}/approve`).send({ note: 'Joining date fixed on the record' }).expect(201)).body).toEqual({ id: ids.correction, status: 'approved' });
      await api('hr', 'post', `/people/profile-requests/${ids.correction}/approve`).send({}).expect(409);
      expect(await inA((tx) => tx.employeeIdentifiers.count({ where: { employeeId: ids.empEmp } }))).toBe(0);
    });

    it('Nominate someone: my own record only, step-up, a contact needed, replaced (old row kept) and removed; audited', async () => {
      expect((await api('emp', 'get', '/people/me/privacy-nominee').expect(200)).body).toEqual({ nominee: null });
      await api('hr', 'get', '/people/me/privacy-nominee').expect(404); // no employee record
      await api('adminB', 'get', '/people/me/privacy-nominee').expect(404);
      const lakshmi = { name: 'Lakshmi Iyer', relation: 'Sister', email: 'lakshmi@mail.test' };
      await stepUp('emp');
      await api('emp', 'put', '/people/me/privacy-nominee').send({ name: 'Lakshmi Iyer', relation: 'Sister' }).expect(400);
      await api('emp', 'put', '/people/me/privacy-nominee').send({ ...lakshmi, phone: '12' }).expect(400);
      await api('emp', 'put', '/people/me/privacy-nominee').send({ ...lakshmi, name: `Kaveri ${run}` }).expect(400);
      const n = (await api('emp', 'put', '/people/me/privacy-nominee').send(lakshmi).expect(200)).body;
      expect(n.nominee).toMatchObject({ name: 'Lakshmi Iyer', relation: 'Sister', email: 'lakshmi@mail.test', phone: null });
      await api('emp', 'put', '/people/me/privacy-nominee').send({ name: 'Ravi Iyer', relation: 'Brother', phone: '+919845012345' }).expect(200);
      expect((await api('emp', 'get', '/people/me/privacy-nominee').expect(200)).body.nominee).toMatchObject({ name: 'Ravi Iyer', phone: '+919845012345' });
      // Someone else sees their own (none), never mine.
      expect((await api('other', 'get', '/people/me/privacy-nominee').expect(200)).body).toEqual({ nominee: null });
      await api('emp', 'post', '/people/me/privacy-nominee/remove').expect(200);
      await api('emp', 'post', '/people/me/privacy-nominee/remove').expect(404);
      const rows = await inA((tx) => tx.privacyNominee.findMany({ where: { employeeId: ids.empEmp } }));
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.endedAt)).toBe(true);
      const audits = await inA((tx) => tx.auditLog.findMany({ where: { entityId: ids.empEmp, action: { startsWith: 'privacy.nominee' } } }));
      expect(audits.map((a) => a.action).sort()).toEqual(['privacy.nominee.removed', 'privacy.nominee.set', 'privacy.nominee.set']);
      expect(audits.map((a) => a.metadataJson ?? '').join(' ')).not.toContain('lakshmi@mail.test');
    });
  });

  // ------------------------------------------------------------------------------------------ PPL-36

  describe('PPL-36 possible same person on PAN, UAN and name + date of birth', () => {
    const joiner = async (given: string, family: string, keys: { pan?: string; uan?: string; dob?: string }) => {
      const j = (await api('hr', 'post', '/lifecycle/joiners').send({ givenName: given, familyName: family, email: `${given.toLowerCase()}-${randomUUID().slice(0, 6)}@mail.test`, joiningOn: addDays(today, 10), legalEntityId: ids.entity, locationId: ids.blr, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm }).expect(201)).body;
      // What the portal stores when the joiner saves their identity and personal sections (keyed hashes only).
      await inA((tx) => tx.preboarding.update({ where: { id: j.id }, data: { panHash: keys.pan ? hashValue(crypto, org.A.id, 'pan', keys.pan) : null, uanHash: keys.uan ? hashValue(crypto, org.A.id, 'uan', keys.uan) : null, dateOfBirth: keys.dob ? new Date(`${keys.dob}T00:00:00Z`) : null } }));
      return { id: j.id as string, personId: (await inA((tx) => tx.preboarding.findFirstOrThrow({ where: { id: j.id } }))).personId };
    };

    it('a joiner is proposed on PAN and UAN, or name + date of birth; never on the name alone', async () => {
      const a = await joiner('Suresh', `K Nair${run}`, { pan: 'BKNPN7712Q', uan: '100911223344' });
      const b = await joiner('Priya', `Nair${run}`, { dob: '1988-12-19' });
      const namesake = await joiner('Priya', `Nair${run}`, { dob: '1991-05-04' });
      ids.joinA = a.personId;
      ids.joinApb = a.id;
      ids.joinB = b.personId;
      await api('emp', 'get', '/people/same-person').expect(403);
      await api('comp', 'get', '/people/same-person').expect(403);
      const rows = (await api('hr', 'get', '/people/same-person').expect(200)).body.rows as { id: string; basis: string[]; a: { personId: string; dob: string | null; pan: string }; b: { personId: string } }[];
      const pair = (x: string) => rows.find((r) => r.a.personId === x);
      expect(pair(a.personId)).toMatchObject({ b: { personId: ids.sureshP }, basis: ['PAN', 'UAN'] });
      expect(pair(a.personId)!.a.pan).toBe('Given by the joiner');
      expect(pair(b.personId)).toMatchObject({ b: { personId: ids.priyaP }, basis: ['name and date of birth'] });
      expect(pair(namesake.personId)).toBeUndefined();
      // Another company sees none of them.
      expect((await api('adminB', 'get', '/people/same-person').expect(200)).body.rows).toEqual([]);
      // The menu count includes them.
      expect((await api('hr', 'get', '/workspace/counts').expect(200)).body.possibleSamePerson).toBeGreaterThanOrEqual(2);
    });

    it('merge makes the joiner a rehire of the former employee (their rows move); someone working here now is refused', async () => {
      const keep = { name: 'b', email: 'a', phone: 'b' };
      await stepUp('hr');
      expect((await api('hr', 'post', '/people/same-person/merge').send({ personId: ids.joinB, intoPersonId: ids.priyaP, keep, note: 'Same person' }).expect(409)).body.message).toMatch(/works here now/);
      await api('hr', 'post', '/people/same-person/merge').send({ personId: ids.joinA, intoPersonId: ids.sureshP, keep, note: '' }).expect(400);
      await api('emp', 'post', '/people/same-person/merge').send({ personId: ids.joinA, intoPersonId: ids.sureshP, keep, note: 'x' }).expect(403);
      await api('hr', 'post', '/people/same-person/merge').send({ personId: ids.joinA, intoPersonId: ids.sureshP, keep, note: 'Same PAN and UAN; he worked here till Feb 2025' }).expect(201);
      const pb = await inA((tx) => tx.preboarding.findFirstOrThrow({ where: { id: ids.joinApb } }));
      expect(pb).toMatchObject({ personId: ids.sureshP, personType: 'rehire' });
      expect(pb.rehireOf).not.toBeNull();
      expect(await inA((tx) => tx.journey.count({ where: { personId: ids.joinA } }))).toBe(0);
      expect((await inA((tx) => tx.person.findFirstOrThrow({ where: { id: ids.joinA } }))).status).toBe('merged');
      // Unmerge puts it all back, while they have not joined.
      await stepUp('hr');
      await api('hr', 'post', `/people/persons/${ids.joinA}/unmerge`).send({ note: 'Merged by mistake' }).expect(201);
      const back = await inA((tx) => tx.preboarding.findFirstOrThrow({ where: { id: ids.joinApb } }));
      expect(back).toMatchObject({ personId: ids.joinA, personType: 'new', rehireOf: null });
      expect(await inA((tx) => tx.journey.count({ where: { personId: ids.joinA } }))).toBeGreaterThan(0);
    });

    it('not the same person: logged and never proposed again', async () => {
      await api('hr', 'post', '/people/same-person/not-same').send({ personId: ids.joinB, intoPersonId: ids.priyaP, note: 'Different mother name' }).expect(201);
      const rows = (await api('hr', 'get', '/people/same-person').expect(200)).body.rows as { a: { personId: string } }[];
      expect(rows.some((r) => r.a.personId === ids.joinB)).toBe(false);
    });
  });

  // ------------------------------------------------------------------------------------------ PPL-44

  describe('PPL-44 trading window', () => {
    const ask = { security: 'Deccan Agro Industries Ltd', side: 'sell', quantity: 350, value: 1225000, noUpsi: true };

    it('the compliance officer closes the window for the whole company; nobody else can; bad dates refused', async () => {
      await api('comp', 'post', `/people/bfsi/designations/${ids.empEmp}`).expect(201);
      expect((await api('emp', 'get', '/people/me/pre-clearance').expect(200)).body.window).toBeNull();
      expect((await api('comp', 'get', '/people/trading-windows').expect(200)).body).toEqual({ rows: [], closedNow: null });
      const w = { startsOn: today, endsOn: addDays(today, 10), reason: 'Quarterly results due' };
      await api('emp', 'post', '/people/trading-windows').send(w).expect(403);
      await api('hr', 'post', '/people/trading-windows').send(w).expect(403);
      await api('comp', 'post', '/people/trading-windows').send({ ...w, endsOn: addDays(today, -1) }).expect(400);
      await api('comp', 'post', '/people/trading-windows').send({ ...w, startsOn: addDays(today, -20), endsOn: addDays(today, -10) }).expect(400);
      await api('comp', 'post', '/people/trading-windows').send({ ...w, reason: 'x' }).expect(400);
      await api('comp', 'post', '/people/trading-windows').send({ ...w, endsOn: '2026-13-01' }).expect(400);
      const made = (await api('comp', 'post', '/people/trading-windows').send(w).expect(201)).body;
      expect(made).toMatchObject({ startsOn: today, endsOn: addDays(today, 10), reopensOn: addDays(today, 11), reason: 'Quarterly results due' });
      ids.window = made.id;
      expect((await api('comp', 'post', '/people/trading-windows').send({ ...w, startsOn: addDays(today, 5), endsOn: addDays(today, 15) }).expect(409)).body.message).toMatch(/already closed/);
      const b = await api('adminB', 'get', '/people/trading-windows');
      if (b.status === 200) expect(b.body.rows).toEqual([]);
      else expect(b.status).toBe(403);
    });

    it('while closed: the person sees why and until when, a request is refused, the officer cannot approve; reopened, it works', async () => {
      const mine = (await api('emp', 'get', '/people/me/pre-clearance').expect(200)).body;
      expect(mine.window).toMatchObject({ endsOn: addDays(today, 10), reopensOn: addDays(today, 11), reason: 'Quarterly results due' });
      const refused = (await api('emp', 'post', '/people/me/pre-clearance').send(ask).expect(409)).body;
      expect(refused.code).toBe('TRADING_WINDOW_CLOSED');
      expect(refused.message).toMatch(/^The trading window is closed until .+ \(Quarterly results due\)\. You can request again when it reopens on .+\.$/);
      // Removed (kept for the audit): the window reopens; the request goes through.
      await api('emp', 'post', `/people/trading-windows/${ids.window}/remove`).expect(403);
      await api('comp', 'post', `/people/trading-windows/${ids.window}/remove`).expect(200);
      await api('comp', 'post', `/people/trading-windows/${ids.window}/remove`).expect(404);
      const r = (await api('emp', 'post', '/people/me/pre-clearance').send(ask).expect(201)).body;
      // Closed again before the officer decides: approval is refused, a rejection is still possible.
      ids.window2 = (await api('comp', 'post', '/people/trading-windows').send({ startsOn: today, endsOn: today, reason: 'Board meeting on results' }).expect(201)).body.id;
      expect((await api('comp', 'post', `/people/pre-clearance/${r.id}/decision`).send({ decision: 'approve' }).expect(409)).body.code).toBe('TRADING_WINDOW_CLOSED');
      await api('comp', 'post', `/people/pre-clearance/${r.id}/decision`).send({ decision: 'reject', note: 'Window closed for the board meeting' }).expect(201);
      expect(await inA((tx) => tx.auditLog.count({ where: { action: { startsWith: 'compliance.trading_window.' } } }))).toBe(3);
      expect(await inA((tx) => tx.tradingWindow.count())).toBe(2);
    });
  });

  // ------------------------------------------------------------------------------------------ PPL-46

  describe('PPL-46 split pay request', () => {
    beforeAll(async () => {
      await inA(async (tx) => {
        await tx.employeeBankAccount.create({ data: { organizationId: org.A.id, employeeId: ids.empEmp, purpose: 'salary', holderName: 'Kaveri', ifsc: 'HDFC0001234', accountEnc: sealValue(crypto, org.A.id, ids.empEmp, '000111222333'), accountHash: hashValue(crypto, org.A.id, 'bank', 'HDFC0001234:000111222333'), accountLast4: '2333', validFrom: new Date(), usableFrom: new Date() } });
        await tx.employeeIntlBankAccount.create({ data: { organizationId: org.A.id, employeeId: ids.empEmp, country: 'AE', ibanEnc: sealValue(crypto, org.A.id, ids.empEmp, 'AE070331234567890123456'), ibanHash: hashValue(crypto, org.A.id, 'iban', 'AE070331234567890123456'), ibanLast4: '3456', bic: 'ECBKAEAD', currency: 'AED', validFrom: new Date(), usableFrom: new Date() } });
      });
    });
    const split = (lines: { account: string; rule: string; value: number }[]) => ({ kind: 'pay_split', value: { split: lines } });

    it('the split page: the person and HR with the identity key; nobody else; another company never', async () => {
      const page = (await api('emp', 'get', `/people/employees/${ids.empEmp}/pay-split`).expect(200)).body;
      expect(page).toMatchObject({ current: null, waiting: false, net: null });
      expect(page.accounts.map((a: { account: string }) => a.account)).toEqual(['salary', 'abroad']);
      expect(JSON.stringify(page)).not.toContain('000111222333');
      await api('hr', 'get', `/people/employees/${ids.empEmp}/pay-split`).expect(200);
      await api('other', 'get', `/people/employees/${ids.empEmp}/pay-split`).expect(404);
      await api('comp', 'get', `/people/employees/${ids.empEmp}/pay-split`).expect(404);
      await api('adminB', 'get', `/people/employees/${ids.empEmp}/pay-split`).expect(404);
    });

    it('bad splits are refused: an account not on file, two remainders, four accounts, a zero amount', async () => {
      await stepUp('emp');
      expect((await api('emp', 'post', `/people/employees/${ids.empEmp}/profile-requests`).send(split([{ account: 'salary', rule: 'remainder', value: 0 }, { account: 'reimbursement', rule: 'fixed', value: 500 }])).expect(400)).body.message).toBe('There is no reimbursement account on file. Add it first, then split pay.');
      expect((await api('emp', 'post', `/people/employees/${ids.empEmp}/profile-requests`).send(split([{ account: 'salary', rule: 'remainder', value: 0 }, { account: 'abroad', rule: 'remainder', value: 0 }])).expect(400)).body.message).toMatch(/exactly one/);
      await api('emp', 'post', `/people/employees/${ids.empEmp}/profile-requests`).send(split([{ account: 'salary', rule: 'remainder', value: 0 }, { account: 'abroad', rule: 'fixed', value: 1 }, { account: 'salary', rule: 'fixed', value: 1 }, { account: 'abroad', rule: 'fixed', value: 1 }])).expect(400);
      await api('emp', 'post', `/people/employees/${ids.empEmp}/profile-requests`).send(split([{ account: 'salary', rule: 'remainder', value: 0 }, { account: 'abroad', rule: 'fixed', value: 0 }])).expect(400);
      await api('emp', 'post', `/people/employees/${ids.empEmp}/profile-requests`).send(split([{ account: 'iban', rule: 'remainder', value: 0 }])).expect(400);
    });

    it('a split goes to HR approval (never the person), then waits out the cooling period; the old pay goes on until then', async () => {
      await stepUp('emp');
      const r = (await api('emp', 'post', `/people/employees/${ids.empEmp}/profile-requests`).send(split([{ account: 'abroad', rule: 'remainder', value: 0 }, { account: 'salary', rule: 'fixed', value: 2500 }])).expect(201)).body;
      expect(r).toMatchObject({ kind: 'pay_split', label: 'Pay split', proposed: { split: 'Account abroad: the rest; Salary account: ₹2,500' } });
      expect((await api('emp', 'get', `/people/employees/${ids.empEmp}/pay-split`).expect(200)).body.waiting).toBe(true);
      await api('emp', 'post', `/people/profile-requests/${r.id}/approve`).send({}).expect(403);
      await stepUp('hr');
      await api('hr', 'post', `/people/profile-requests/${r.id}/approve`).send({}).expect(201);
      const s = await inA((tx) => tx.employeePaySplit.findFirstOrThrow({ where: { employeeId: ids.empEmp, validTo: null } }));
      const hours = (s.usableFrom.getTime() - s.validFrom.getTime()) / 3_600_000;
      expect(hours).toBeCloseTo(48, 3); // the company's cooling period (default 48 hours)
      const page = (await api('emp', 'get', `/people/employees/${ids.empEmp}/pay-split`).expect(200)).body;
      expect(page).toMatchObject({ waiting: false, current: { lines: [{ account: 'abroad', rule: 'remainder', value: 0 }, { account: 'salary', rule: 'fixed', value: 2500 }] } });
      // The same split again is "already on file".
      await stepUp('emp');
      expect((await api('emp', 'post', `/people/employees/${ids.empEmp}/profile-requests`).send(split([{ account: 'abroad', rule: 'remainder', value: 0 }, { account: 'salary', rule: 'fixed', value: 2500 }])).expect(400)).body.message).toBe('That is already the value on file.');
    });
  });
});
