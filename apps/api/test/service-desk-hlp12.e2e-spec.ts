process.env.SD_SCANNER = 'dev-fake';
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
import { AccidentsService } from '../src/accidents/accidents.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// HLP-12 accident cases end to end against the real database (forced RLS, the app role). Positive and negative: anyone
// reports, also for someone else; only the System Admin names the safety team; the safety team and the HR handler see
// everything (medical included, each look audited); the manager sees leave dates only; the reporter, HR, other staff,
// the System Admin and another company get 404; every route refused while acting for someone else; the ESIC clock from
// IN.ESI.ACCIDENT and the EC claim from IN.EC.CLAIM; contractor not filed and the reminder; bad input; append-only.
describe('HLP-12 accident cases', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let accidents: AccidentsService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hr' | 'safety' | 'handler' | 'manager' | 'injured' | 'witness' | 'other' | 'acting';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const emp: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1/desk/accidents${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const shift = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  // 10:30 in India, three days ago: the ESIC report (one day) is late.
  const OCCURRED = `${shift(-3)}T10:30:00+05:30`;
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const REPORT = () => ({ injuredKind: 'employee', injuredEmployeeId: emp.injured, occurredAt: OCCURRED, locationId: ids.hosur, place: 'Packing line 2', description: 'His left hand was caught in the sealing machine guard while clearing a jam.', injuryType: 'Crush', bodyPart: 'Left hand', firstAid: true, witnesses: 'Ravi K.' });

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
    accidents = moduleRef.get(AccidentsService);

    planId = (await prisma.plan.create({ data: { name: `hlp12-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HLP12 Org ${k}`, slug: `hlp12-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hr', 'A', 'panel', tpl('hr_admin')],
      ['safety', 'A', 'panel', []],
      ['handler', 'A', 'panel', tpl('hr_executive')],
      ['manager', 'A', 'panel', []],
      ['injured', 'A', 'panel', []],
      ['witness', 'A', 'panel', []],
      ['other', 'A', 'panel', []],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@hlp12-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@hlp12-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Foods Pvt Ltd', shortName: `KF${run.slice(0, 4).toUpperCase()}`, isDefault: true, pan: 'AAPFU0939F' } })).id;
      ids.hosur = (await tx.location.create({ data: { ...x, legalEntityId: ids.entity, name: 'Hosur plant', code: 'HSR', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const ops = randomUUID();
      ids.ops = (await tx.department.create({ data: { ...x, id: ops, name: 'Operations', code: 'OPS', path: `/${ops}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...x, name: 'Operator', code: 'OP' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...x, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const hire = async (who: Who, given: string, code: string, managerEmployeeId: string | null) =>
      (await request(server()).post('/api/v1/people/employees').set('Authorization', `Bearer ${token.adminA}`).send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: given, familyName: 'Kumar', employeeCode: code, joinedOn: '2026-04-06', userId: users[who], workEmail: `${who}@hlp12-${run}.test`, assignment: { locationId: ids.hosur, departmentId: ids.ops, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId } }).expect(201)).body.id as string;
    emp.manager = await hire('manager', 'Meena', 'KF-001', null);
    emp.injured = await hire('injured', 'Sathish', 'KF-002', emp.manager);
    emp.witness = await hire('witness', 'Ravi', 'KF-003', emp.manager);
    ids.locB = (await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, async (tx) => {
      const le = await tx.legalEntity.create({ data: { organizationId: org.B.id, name: 'Other Co', shortName: `OC${run.slice(0, 4).toUpperCase()}`, isDefault: true, pan: 'AAPFU0939F' } });
      return tx.location.create({ data: { organizationId: org.B.id, legalEntityId: le.id, name: 'Pune', code: 'PNQ', address: {}, country: 'IN', state: 'IN-MH', timezone: 'Asia/Kolkata' } });
    })).id;
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('before set-up nothing can be reported; only the System Admin names the safety team (not HR)', async () => {
    expect((await api('witness', 'get', '/form').expect(200)).body).toEqual({ ready: false, injuryTypes: ['Crush', 'Cut', 'Burn', 'Fall', 'Sprain or strain', 'Other'], meEmployeeId: emp.witness, me: { id: emp.witness, name: 'Ravi Kumar' }, locations: [{ id: ids.hosur, name: 'Hosur plant' }] });
    expect((await api('witness', 'post', '').send(REPORT()).expect(409)).body.code).toBe('ACCIDENT_NO_TEAM');
    await request(server()).post('/api/v1/desk/speakup/setup/members').set('Authorization', `Bearer ${token.hr}`).send({ team: 'safety', userId: users.hr }).expect(403);
    await request(server()).post('/api/v1/desk/speakup/setup/members').set('Authorization', `Bearer ${token.adminA}`).send({ team: 'safety', userId: users.safety }).expect(201);
    const setup = (await request(server()).get('/api/v1/desk/speakup/setup').set('Authorization', `Bearer ${token.adminA}`).expect(200)).body;
    expect(setup.members).toEqual([expect.objectContaining({ team: 'safety', userId: users.safety })]);
    expect((await api('witness', 'get', '/form').expect(200)).body.ready).toBe(true);
  });

  it('bad input is refused with plain reasons', async () => {
    const bad = async (patch: Record<string, unknown>) => api('witness', 'post', '').send({ ...REPORT(), ...patch }).expect(400);
    await bad({ occurredAt: `${shift(2)}T10:00:00+05:30` });
    await bad({ occurredAt: 'yesterday' });
    await bad({ injuryType: 'Paper cut' });
    await bad({ locationId: ids.locB });
    await bad({ injuredEmployeeId: undefined });
    await bad({ injuredEmployeeId: randomUUID() });
    await bad({ injuredKind: 'contract', injuredEmployeeId: undefined, injuredName: 'Murugan P.' });
    await bad({ description: 'hurt' });
    await bad({ injuredKind: 'visitor' });
    await bad({ secret: 'x' });
  });

  it('a witness reports for someone else: numbered, the safety team gets it, the reporter does not see the case', async () => {
    const r = (await api('witness', 'post', '').send(REPORT()).expect(201)).body;
    expect(r.number).toBe('ACC-0001');
    ids.acc = r.id;
    await api('witness', 'get', `/${ids.acc}`).expect(404);
    const log = await inA((tx) => tx.auditLog.findFirst({ where: { organizationId: org.A.id, action: 'accident.reported', entityId: ids.acc } }));
    expect(JSON.parse(log!.metadataJson!)).toMatchObject({ number: 'ACC-0001', forSomeoneElse: true });
    const notes = await inA((tx) => tx.userNotification.findMany({ where: { organizationId: org.A.id, type: 'helpdesk.accident.reported' } }));
    expect(notes.map((n) => n.recipientUserId)).toEqual([users.safety]);
    // The injured person can report too (themselves).
    expect((await api('injured', 'post', '').send({ ...REPORT(), description: 'I cut my finger on the carton cutter at the packing table.', injuryType: 'Cut' }).expect(201)).body.number).toBe('ACC-0002');
  });

  it('the safety team sees the full case; the ESIC clock comes from the rule set; each look is audited', async () => {
    const c = (await api('safety', 'get', `/${ids.acc}`).expect(200)).body;
    expect(c).toMatchObject({ view: 'team', number: 'ACC-0001', injured: { kind: 'employee', name: 'Sathish Kumar' }, place: 'Packing line 2', reportedBy: `witness ${run}`, esi: null, clocks: [], canAssign: true });
    expect((await api('safety', 'get', '').expect(200)).body.find((x: { id: string }) => x.id === ids.acc)).toMatchObject({ ref: 'ACC-0001', kind: 'accident', stage: 'Check ESI cover', status: 'action', owner: 'Safety team' });
    // Answer 43: the leave dates become a leave request in Time, of the company's injury leave type (a setting).
    const facts = { esiCovered: true, ipNumber: '3110012345', hospital: 'ESI dispensary, Hosur', handlerUserId: users.handler, leaveFrom: shift(-2), leaveTo: shift(5) };
    expect((await api('safety', 'post', `/${ids.acc}/facts`).send(facts).expect(409)).body.code).toBe('ACCIDENT_NO_LEAVE_TYPE');
    expect((await api('safety', 'get', `/${ids.acc}`).expect(200)).body.leave).toBeNull();
    ids.injuryType = (await request(server()).post('/api/v1/time/setup/types').set('Authorization', `Bearer ${token.adminA}`).send({ code: 'INJURY', name: 'Injury leave', kind: 'lop', paid: false }).expect(201)).body.id;
    await api('safety', 'post', `/${ids.acc}/facts`).send({ ...facts, leaveTo: shift(-3) }).expect(400);
    await api('safety', 'post', `/${ids.acc}/facts`).send({ ...facts, leaveFrom: shift(-9) }).expect(400);
    await api('safety', 'post', `/${ids.acc}/facts`).send(facts).expect(201);
    const d = (await api('safety', 'get', `/${ids.acc}`).expect(200)).body;
    expect(d).toMatchObject({ esi: true, esiFrom: 'case', handler: { id: users.handler }, leave: { from: shift(-2), to: shift(5), days: 8, inTime: { status: 'pending' } }, source: 'IN.ESI.ACCIDENT 1950-v1 (verify)' });
    const lr = await inA((tx) => tx.leaveRequest.findFirstOrThrow({ where: { id: d.leave.inTime.id } }));
    expect(lr).toMatchObject({ employeeId: emp.injured, leaveTypeId: ids.injuryType, raisedBy: users.safety, reason: 'Injury leave (accident case ACC-0001)' });
    expect(lr.fromOn.toISOString().slice(0, 10)).toBe(shift(-2));
    expect((await api('safety', 'post', `/${ids.acc}/facts`).send({ leaveFrom: shift(-1), leaveTo: shift(3) }).expect(409)).body.code).toBe('ACCIDENT_LEAVE_IN_TIME');
    expect(d.clocks).toEqual([{ key: 'esic', label: 'ESIC accident report (employer’s report)', due: shift(-2), doneOn: null }]);
    const views = await inA((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'accident.viewed', entityId: ids.acc } }));
    expect(views.length).toBe(3);
    expect(JSON.parse(views[0].metadataJson!)).toEqual({ view: 'team', medicalShown: true });
  });

  it('the HR handler sees everything but cannot reassign; the manager sees leave dates only and is told', async () => {
    expect((await api('handler', 'get', `/${ids.acc}`).expect(200)).body).toMatchObject({ view: 'team', canAssign: false });
    await api('handler', 'post', `/${ids.acc}/facts`).send({ handlerUserId: users.other }).expect(403);
    await api('handler', 'post', `/${ids.acc}/medical`).field('kind', 'diagnosis').field('note', 'Crush injury, fracture of the left index finger').attach('file', Buffer.from('%PDF-1.4\n%medical\n'), 'certificate.pdf').expect(201);
    const m = (await api('manager', 'get', `/${ids.acc}`).expect(200)).body;
    expect(m).toEqual({ view: 'manager', id: ids.acc, number: 'ACC-0001', injuredName: 'Sathish Kumar', leaveFrom: shift(-2), leaveTo: shift(5), leaveStatus: 'pending' });
    expect((await api('manager', 'get', '').expect(200)).body).toEqual([]);
    await api('manager', 'get', `/${ids.acc}/esic-form`).expect(404);
    await api('manager', 'post', `/${ids.acc}/statements`).send({ who: 'Ravi', text: 'I saw the guard was open.' }).expect(404);
    const told = await inA((tx) => tx.userNotification.findMany({ where: { organizationId: org.A.id, type: 'helpdesk.accident.update' } }));
    expect(told.map((n) => n.recipientUserId).sort()).toEqual([users.handler, users.manager].sort());
  });

  it('HR, other staff and the System Admin get Not found; another company too', async () => {
    for (const who of ['hr', 'other', 'adminA', 'witness', 'adminB'] as const) {
      await api(who, 'get', `/${ids.acc}`).expect(404);
      await api(who, 'post', `/${ids.acc}/facts`).send({ esiCovered: false }).expect(404);
      await api(who, 'get', `/${ids.acc}/esic-form`).expect(404);
    }
    expect((await api('hr', 'get', '').expect(200)).body).toEqual([]);
    expect((await api('adminB', 'get', '').expect(200)).body).toEqual([]);
  });

  it('acting for someone else is refused on every route', async () => {
    token.acting = (await request(server()).post(`/api/v1/auth/impersonate/${users.safety}`).set('Authorization', `Bearer ${token.adminA}`).expect(200)).body.accessToken;
    await api('acting', 'get', '/form').expect(403);
    await api('acting', 'get', '').expect(403);
    await api('acting', 'post', '').send(REPORT()).expect(403);
    await api('acting', 'get', `/${ids.acc}`).expect(403);
    await api('acting', 'post', `/${ids.acc}/facts`).send({ esiCovered: true }).expect(403);
    await api('acting', 'post', `/${ids.acc}/esic-filed`).send({ on: today }).expect(403);
    await api('acting', 'post', `/${ids.acc}/close`).expect(403);
  });

  it('medical records: fingerprinted, opened only when clean, every open audited; append-only in the database', async () => {
    const c = (await api('safety', 'get', `/${ids.acc}`).expect(200)).body;
    const rec = c.medical[0];
    expect(rec).toMatchObject({ kind: 'diagnosis', note: 'Crush injury, fracture of the left index finger', file: { name: 'certificate.pdf' } });
    expect(rec.file.sha256).toMatch(/^[0-9a-f]{64}$/);
    for (let i = 0; i < 20 && (await inA((tx) => tx.file.findFirst({ where: { id: rec.file.id } })))?.scanStatus !== 'clean'; i++) await new Promise((r) => setTimeout(r, 250));
    await api('safety', 'get', `/${ids.acc}/files/${rec.file.id}`).expect(200);
    await api('other', 'get', `/${ids.acc}/files/${rec.file.id}`).expect(404);
    const opens = await inA((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'accident.medical_opened', entityId: ids.acc } }));
    expect(JSON.parse(opens[0].metadataJson!)).toMatchObject({ fileId: rec.file.id, sha256: rec.file.sha256 });
    await expect(inA((tx) => tx.accidentMedicalRecord.updateMany({ where: { caseId: ids.acc }, data: { note: 'changed' } }))).rejects.toThrow();
    await expect(inA((tx) => tx.accidentStep.deleteMany({ where: { caseId: ids.acc } }))).rejects.toThrow();
    await expect(inA((tx) => tx.accidentCase.updateMany({ where: { id: ids.acc }, data: { place: 'elsewhere' } }))).rejects.toThrow();
  });

  it('the ESIC form is prepared to print; filing is recorded once with its date; then the case closes', async () => {
    const f = (await api('handler', 'get', `/${ids.acc}/esic-form`).expect(200)).body;
    expect(f.fields).toEqual(expect.arrayContaining([{ label: 'Insurance number (IP)', value: '3110012345' }, { label: 'Insured person', value: 'Sathish Kumar' }]));
    await api('handler', 'post', `/${ids.acc}/close`).expect(409);
    await api('handler', 'post', `/${ids.acc}/esic-filed`).send({ on: shift(1) }).expect(400);
    await api('handler', 'post', `/${ids.acc}/esic-filed`).send({ on: shift(-9) }).expect(400);
    await api('handler', 'post', `/${ids.acc}/esic-filed`).send({ on: 'soon' }).expect(400);
    await api('handler', 'post', `/${ids.acc}/contractor-filed`).send({ on: today }).expect(409);
    await api('handler', 'post', `/${ids.acc}/esic-filed`).send({ on: shift(-1), ack: 'ESIC/ACC/2026/0917743' }).expect(201);
    await api('handler', 'post', `/${ids.acc}/esic-filed`).send({ on: shift(-1) }).expect(409);
    const c = (await api('safety', 'get', `/${ids.acc}`).expect(200)).body;
    expect(c).toMatchObject({ esicFiled: { on: shift(-1), ack: 'ESIC/ACC/2026/0917743' }, clocks: [{ key: 'esic', doneOn: shift(-1) }] });
    await api('safety', 'post', `/${ids.acc}/statements`).send({ who: 'Ravi K.', text: 'The guard was open when the jam was cleared.' }).expect(201);
    await api('safety', 'post', `/${ids.acc}/close`).expect(201);
    await api('safety', 'post', `/${ids.acc}/close`).expect(409);
    await api('safety', 'post', `/${ids.acc}/statements`).send({ who: 'Ravi K.', text: 'One more thing I remembered.' }).expect(409);
    expect((await api('safety', 'get', '').expect(200)).body.find((x: { id: string }) => x.id === ids.acc)).toMatchObject({ status: 'closed', stage: 'Closed' });
  });

  it('the injured person is found by a server search (names only, own company, at least 2 letters)', async () => {
    expect((await api('witness', 'get', '/people?q=sath').expect(200)).body).toEqual([{ id: emp.injured, name: 'Sathish Kumar' }]);
    expect((await api('witness', 'get', '/people?q=kumar%20ravi').expect(200)).body).toEqual([{ id: emp.witness, name: 'Ravi Kumar' }]);
    expect((await api('witness', 'get', '/people?q=zzzz').expect(200)).body).toEqual([]);
    await api('witness', 'get', '/people?q=s').expect(400);
    await api('witness', 'get', '/people').expect(400);
    expect((await api('adminB', 'get', '/people?q=sath').expect(200)).body).toEqual([]);
    await api('acting', 'get', '/people?q=sath').expect(403);
  });

  it('the reporter sees the status only in My cases (received, then closed); never the injury, medical details or the team', async () => {
    const rows = (await api('witness', 'get', '/mine').expect(200)).body;
    expect(rows).toEqual([{ id: ids.acc, ref: 'ACC-0001', kind: 'accident', role: 'reporter', stage: 'Closed', status: 'closed', next: null, unread: 0 }]);
    const one = (await api('witness', 'get', `/mine/${ids.acc}`).expect(200)).body;
    expect(Object.keys(one).sort()).toEqual(['appealUntil', 'dates', 'datesSource', 'id', 'kind', 'messages', 'openedOn', 'outcome', 'ref', 'role', 'stage', 'status']);
    expect(JSON.stringify(one)).not.toMatch(/Packing|fracture|Crush|safety/i);
    const mine2 = (await api('injured', 'get', '/mine').expect(200)).body;
    expect(mine2).toEqual([expect.objectContaining({ ref: 'ACC-0002', stage: 'Received', status: 'open' })]);
    for (const who of ['injured', 'safety', 'manager', 'adminB'] as const) await api(who, 'get', `/mine/${ids.acc}`).expect(404);
    expect((await api('adminB', 'get', '/mine').expect(200)).body).toEqual([]);
    await api('acting', 'get', '/mine').expect(403);
  });

  it('a contract worker: the contractor files; late shows "contractor not filed" and the safety team is reminded once a day', async () => {
    const r = (await api('manager', 'post', '').send({ ...REPORT(), injuredKind: 'contract', injuredEmployeeId: undefined, injuredName: 'Murugan P.', contractor: 'Sri Lakshmi Facility Services' }).expect(201)).body;
    ids.cw = r.id;
    await api('manager', 'get', `/${ids.cw}`).expect(404);
    await api('safety', 'post', `/${ids.cw}/facts`).send({ esiCovered: true, leaveFrom: shift(-2), leaveTo: shift(1) }).expect(201);
    // No leave in Time for a contract worker: the dates stay on the case.
    expect((await api('safety', 'get', `/${ids.cw}`).expect(200)).body.leave).toMatchObject({ from: shift(-2), inTime: null });
    const c = (await api('safety', 'get', `/${ids.cw}`).expect(200)).body;
    expect(c).toMatchObject({ injured: { kind: 'contract', name: 'Murugan P.', contractor: 'Sri Lakshmi Facility Services' }, contractorNotFiled: true, clocks: [{ key: 'esic', label: 'ESIC accident report (the contractor files)', due: shift(-2), doneOn: null }] });
    expect((await api('safety', 'get', '').expect(200)).body.find((x: { id: string }) => x.id === ids.cw)).toMatchObject({ stage: 'Contractor not filed', overdue: true, status: 'action' });
    await api('safety', 'post', `/${ids.cw}/esic-filed`).send({ on: today }).expect(409);
    expect(await accidents.remindOrg(org.A.id, today)).toBe(1);
    expect(await accidents.remindOrg(org.A.id, today)).toBe(0);
    const late = await inA((tx) => tx.userNotification.findMany({ where: { organizationId: org.A.id, type: 'helpdesk.accident.contractor_late' } }));
    expect(late.map((n) => n.recipientUserId)).toEqual([users.safety]);
    await api('safety', 'post', `/${ids.cw}/contractor-filed`).send({ on: today, ack: 'CON-77' }).expect(201);
    expect((await api('safety', 'get', `/${ids.cw}`).expect(200)).body).toMatchObject({ contractorNotFiled: false, contractorFiled: { on: today, ack: 'CON-77' } });
    expect(await accidents.remindOrg(org.A.id, shift(1))).toBe(0);
  });

  it('not ESI covered: the EC claim is worked out from IN.EC.CLAIM; late payment shows interest; bad input refused', async () => {
    const r = (await api('other', 'post', '').send({ ...REPORT(), description: 'He slipped on the wet floor of the cold room and fell.', injuryType: 'Fall' }).expect(201)).body;
    ids.ec = r.id;
    await api('safety', 'post', `/${ids.ec}/ec`).send({ kind: 'temporary', monthlyWage: 12000, days: 18, fellDueOn: shift(-1) }).expect(409);
    await api('safety', 'post', `/${ids.ec}/facts`).send({ esiCovered: false }).expect(201);
    await api('safety', 'post', `/${ids.ec}/close`).expect(409);
    await api('safety', 'post', `/${ids.ec}/ec`).send({ kind: 'permanent-partial', monthlyWage: 42000, factor: 197.06, fellDueOn: shift(-1) }).expect(400);
    await api('safety', 'post', `/${ids.ec}/ec`).send({ kind: 'permanent-partial', monthlyWage: -5, factor: 197.06, disablementPct: 20, fellDueOn: shift(-1) }).expect(400);
    await api('safety', 'post', `/${ids.ec}/ec`).send({ kind: 'permanent-partial', monthlyWage: 42000, factor: 197.06, disablementPct: 20, fellDueOn: shift(-30) }).expect(400);
    const total = Math.round(0.6 * 15000 * 197.06);
    expect((await api('safety', 'post', `/${ids.ec}/ec`).send({ kind: 'permanent-partial', monthlyWage: 42000, factor: 197.06, disablementPct: 20, fellDueOn: shift(-3) }).expect(201)).body).toMatchObject({ wageUsed: 15000, amount: Math.round((total * 20) / 100) });
    const c = (await api('safety', 'get', `/${ids.ec}`).expect(200)).body;
    expect(c.source).toBe('IN.EC.CLAIM 2020-v1 (verify)');
    expect(c.clocks).toEqual([{ key: 'ec', label: 'Employee’s Compensation payment', due: shift(27), doneOn: null }]);
    expect(c.ec).toMatchObject({ amount: Math.round((total * 20) / 100), interest: 0, paid: null });
    await api('safety', 'post', `/${ids.ec}/ec-paid`).send({ on: today, how: 'cash' }).expect(400);
    await api('safety', 'post', `/${ids.ec}/ec-paid`).send({ on: today, how: 'payroll' }).expect(201);
    await api('safety', 'post', `/${ids.ec}/ec-paid`).send({ on: today, how: 'payroll' }).expect(409);
    await api('safety', 'post', `/${ids.ec}/close`).expect(201);
  });
});
