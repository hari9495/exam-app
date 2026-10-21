import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { OrgSecretsCryptoService, PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { hashValue, sealValue } from '../src/people/profile.service';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { addDays, todayIst } from '../src/org-structure/org-validation';

// People menu, the rest of the designed pages, against the real database (forced RLS): employee import (PPL-07)
// through the hire path, the directory cards, the buddy pool (PPL-41), the union register (PPL-39) and succession
// (PPL-26). Each with its key, scope and company boundary.
describe('People: import, cards, buddies, unions, succession (PPL-07, PPL-01, PPL-41, PPL-39, PPL-26)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const joined = addDays(todayIst(), -400);

  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  type Who = 'hrA' | 'hrNoPan' | 'hrTn' | 'empA' | 'adminB';
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const ids: Record<string, string> = {};
  const ctx = (k: 'A' | 'B') => ({ organizationId: org[k].id, isSuperAdmin: false });
  const email = (who: string) => `${who}-${runId}@more.test`;
  const audits = (action: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action } }));
  const employees = () => tenantPrisma.forTenant(SUPER, (tx) => tx.employee.count({ where: { organizationId: org.A.id } }));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    planId = (await prisma.plan.create({ data: { name: `more-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Org ${k}`, slug: `more-${k.toLowerCase()}-${runId}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const masters = async (k: 'A' | 'B', tag: string, isDefault: boolean) =>
      tenantPrisma.forTenant(ctx(k), async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`le${tag}`] = (await tx.legalEntity.create({ data: { ...o, name: `Entity ${tag}`, shortName: tag, isDefault, employeeCodePrefix: tag } })).id;
        ids[`loc${tag}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`le${tag}`], name: `Site ${tag}`, code: tag, address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
        const id = randomUUID();
        await tx.department.create({ data: { ...o, id, name: `Quality ${tag}`, code: `Q${tag}`, path: `/${id}/` } });
        ids[`dept${tag}`] = id;
        ids[`des${tag}`] = (await tx.designation.create({ data: { ...o, name: `Analyst ${tag}`, code: `AN${tag}` } })).id;
        ids[`type${tag}`] = (await tx.employmentType.create({ data: { ...o, name: `Permanent ${tag}`, code: `P${tag}`, category: 'permanent' } })).id;
      });
    await masters('A', 'KF', true);
    await masters('A', 'TN', false);
    await masters('B', 'BB', true);

    const profile = (keys: string[], name: string) => tenantPrisma.forTenant(ctx('A'), (tx) => tx.permissionProfile.create({ data: { organizationId: org.A.id, name, permissionsJson: JSON.stringify(keys) } })).then((p) => p.id);
    const hrKeys = ['employee.profile.view', 'employee.change.manage', 'employee.change.retro', 'employee.change.retro_override', 'lifecycle.onboarding.view', 'lifecycle.onboarding.manage', 'lifecycle.exit.manage'];
    const hr = await profile([...hrKeys, 'employee.identity.manage', 'succession.manage'], 'HR');
    const hrNoPan = await profile(hrKeys, 'HR without identity');
    ids.plant = await profile(['employee.profile.view', 'lifecycle.exit.manage', 'succession.manage'], 'Plant HR');
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string | null][] = [
      ['hrA', 'A', 'panel', hr],
      ['hrNoPan', 'A', 'panel', hrNoPan],
      ['hrTn', 'A', 'panel', null],
      ['empA', 'A', 'panel', null],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [name, k, role, permissionProfileId] of roster) {
      users[name] = (await tenantPrisma.forTenant(ctx(k), (tx) => tx.user.create({ data: { organizationId: org[k].id, email: email(name), passwordHash, role, permissionProfileId } }))).id;
    }
    // Plant HR: industrial relations and succession granted for the TN entity only.
    await tenantPrisma.forTenant(ctx('A'), (tx) =>
      tx.roleGrant.create({ data: { organizationId: org.A.id, userId: users.hrTn, permissionProfileId: ids.plant, scopeType: 'legal_entity', legalEntityId: ids.leTN, validFrom: new Date(`${addDays(todayIst(), -30)}T00:00:00Z`), status: 'active', reason: 'Plant HR' } }),
    );
    for (const [name, k] of roster.map((r) => [r[0], r[1]] as const)) {
      token[name] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: email(name), password: PASSWORD }).expect(200)).body.accessToken;
    }
    const hire = async (tag: string, givenName: string, code: string) =>
      (
        await api('hrA', 'post', '/people/employees')
          .send({ legalEntityId: ids[`le${tag}`], employeeCode: code, givenName, status: 'confirmed', reason: 'Joined', overrideReason: 'Joined before go-live', joinedOn: joined, assignment: { locationId: ids[`loc${tag}`], departmentId: ids[`dept${tag}`], designationId: ids[`des${tag}`], employmentTypeId: ids[`type${tag}`], managerEmployeeId: null } })
          .expect(201)
      ).body.id as string;
    ids.divya = await hire('KF', 'Divya', 'KF0001');
    ids.arjun = await hire('KF', 'Arjun', 'KF0142');
    ids.imran = await hire('TN', 'Imran', 'TN0001');
    // Arjun's PAN is on file (approved earlier).
    const crypto = app.get(OrgSecretsCryptoService);
    await tenantPrisma.forTenant(SUPER, (tx) => tx.employeeIdentifiers.create({ data: { organizationId: org.A.id, employeeId: ids.arjun, panEnc: sealValue(crypto, org.A.id, ids.arjun, 'AKDPK4821M'), panHash: hashValue(crypto, org.A.id, 'pan', 'AKDPK4821M'), panLast4: '821M' } }));
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.refreshToken.deleteMany({ where: { userId: { in: Object.values(users) } } });
        await tx.session.deleteMany({ where: { userId: { in: Object.values(users) } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
        await tx.user.deleteMany({ where: { id: { in: Object.values(users) } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  // ------------------------------------------------------------------------------------------ import (PPL-07)

  const row = (n: number, v: Record<string, string>) => ({ row: n, values: { department: 'Quality KF', designation: 'Analyst KF', location: 'Site KF', type: 'Permanent KF', joined: '01 Oct 2026', ...v } });
  const ROWS = [
    row(2, { code: 'KF0261', name: 'Harini Suresh', pan: 'BHDPS4410K', manager: 'KF0001' }),
    row(3, { code: 'KF0262', name: 'Farook Basha', pan: 'CFBPB8812', manager: 'KF0001' }),
    row(4, { code: 'KF0999', name: 'Arjun K', pan: 'AKDPK4821M', manager: 'KF0001' }),
    row(5, { code: 'KF0263', name: '', manager: 'KF9999', joined: '1/10/26' }),
    row(6, { code: 'KF0264', name: 'Leela Prasad', manager: 'KF0261', joined: '05 Oct 2026', email: `leela-${runId}@more.test` }),
    row(7, { code: 'KF0142', name: 'Old Code', department: 'Nope' }),
    row(8, { name: 'No Code Given', manager: 'TN0001' }),
  ];
  const body = (rows = ROWS, legalEntityId = ids.leKF) => ({ legalEntityId, fileName: 'kaveri-joiners-oct.csv', rows });

  it('import needs employee.change.manage, never crosses companies, and validates every cell at the server', async () => {
    const csv = Buffer.from('Emp No,Full Name,DOJ\nKF0300,Ravi,01 Oct 2026\n');
    await api('empA', 'post', '/people/employee-import/read').attach('file', csv, 'a.csv').expect(403);
    await api('empA', 'post', '/people/employee-import/check').send(body()).expect(403);
    await api('empA', 'post', '/people/employee-import').send(body()).expect(403);
    const read = (await api('hrA', 'post', '/people/employee-import/read').attach('file', csv, 'a.csv').expect(200)).body;
    expect(read.fields.filter((f: { required: boolean }) => f.required).map((f: { label: string }) => f.label)).toEqual(['Name', 'Joining date', 'Department', 'Designation', 'Location', 'Employment type']);
    expect(read.columns).toEqual([
      { column: 'Emp No', sample: 'KF0300', field: 'code' },
      { column: 'Full Name', sample: 'Ravi', field: 'name' },
      { column: 'DOJ', sample: '01 Oct 2026', field: 'joined' },
    ]);
    expect((await api('hrA', 'post', '/people/employee-import/read').attach('file', Buffer.from('x'), 'a.pdf').expect(400)).body.message).toBe('Upload a .csv or .xlsx file.');
    // Company B's legal entity is not a choice in company A.
    await api('hrA', 'post', '/people/employee-import/check').send(body(ROWS, ids.leBB)).expect(400);
    await api('hrA', 'post', '/people/employee-import/check').send({ ...body(), rows: [{ row: 2, values: { name: 'x'.repeat(201) } }] }).expect(400);
    await api('hrA', 'post', '/people/employee-import/check').send({ ...body(), rows: [{ row: 2, values: { salary: '1' } }] }).expect(400);
  });

  it('check: bad rows and duplicates in plain words, managers in the file, and nothing saved', async () => {
    const before = await employees();
    const out = (await api('hrA', 'post', '/people/employee-import/check').send(body()).expect(200)).body;
    const by = (n: number) => out.rows.find((r: { row: number }) => r.row === n);
    expect(by(2)).toMatchObject({ issues: [], code: 'KF0261', joined: '01 Oct 2026', manager: { code: 'KF0001', name: 'Divya', inFile: false } });
    expect(by(3).issues).toEqual([{ field: 'PAN', message: 'Enter a 10-character PAN like ABCDE1234F.' }]);
    expect(by(4)).toMatchObject({ duplicate: true, issues: [{ field: 'Already an employee', message: 'Looks like Arjun (KF0142, same PAN), who is already an employee. This row is skipped.' }] });
    expect(by(5).issues.map((i: { field: string }) => i.field)).toEqual(['Name', 'Joining date', 'Manager code']);
    expect(by(6)).toMatchObject({ issues: [], manager: { code: 'KF0261', name: 'Harini Suresh', inFile: true } });
    expect(by(7).issues).toEqual([
      { field: 'Employee code', message: 'KF0142 already exists. Use a new code or leave it blank.' },
      { field: 'Department', message: 'No department called "Nope". Check the name.' },
    ]);
    // A blank code gets the next code in the entity's series; a manager in another entity of the company is fine.
    expect(by(8)).toMatchObject({ issues: [], code: expect.stringMatching(/^KF\d{4}$/), manager: { name: 'Imran', inFile: false } });
    expect(out.ready).toBe(3);
    expect(await employees()).toBe(before);
  });

  it('PAN needs the identity key; without it the row says so', async () => {
    const out = (await api('hrNoPan', 'post', '/people/employee-import/check').send(body([ROWS[0]])).expect(200)).body;
    expect(out.rows[0].issues).toEqual([{ field: 'PAN', message: 'You cannot add PAN numbers. Leave the PAN column out, or ask someone who manages identity details.' }]);
  });

  it('import: rows that pass are created through the hire path; PAN waits for approval; the rest are skipped', async () => {
    const before = await employees();
    const out = (await api('hrA', 'post', '/people/employee-import').send(body()).expect(200)).body;
    expect(out.created).toBe(3);
    expect(await employees()).toBe(before + 3);
    const harini = await tenantPrisma.forTenant(SUPER, (tx) => tx.employment.findFirstOrThrow({ where: { organizationId: org.A.id, employeeCode: 'KF0261' } }));
    const leela = await tenantPrisma.forTenant(SUPER, (tx) => tx.employment.findFirstOrThrow({ where: { organizationId: org.A.id, employeeCode: 'KF0264' } }));
    const a = await tenantPrisma.forTenant(SUPER, (tx) => tx.employeeAssignment.findFirstOrThrow({ where: { employmentId: leela.id, supersededAt: null } }));
    expect(a.managerEmployeeId).toBe(harini.employeeId);
    const pan = await tenantPrisma.forTenant(SUPER, (tx) => tx.employeeProfileRequest.findMany({ where: { organizationId: org.A.id, employeeId: harini.employeeId } }));
    expect(pan).toMatchObject([{ kind: 'pan', status: 'pending' }]);
    expect(await audits('employee.created')).toHaveLength(6);
    expect((await audits('employee.import')).map((x) => JSON.parse(x.metadataJson ?? '{}'))).toEqual([{ fileName: 'kaveri-joiners-oct.csv', rows: 7, created: 3, skipped: 4 }]);
    // The same file again: everyone is now a duplicate code.
    const again = (await api('hrA', 'post', '/people/employee-import/check').send(body([ROWS[0]])).expect(200)).body;
    expect(again.rows[0].issues).toContainEqual({ field: 'Employee code', message: 'KF0261 already exists. Use a new code or leave it blank.' });
  });

  // ------------------------------------------------------------------------------------------ directory cards (PPL-01)

  it('cards: no consultant key, no consultant card; no contract labour or placement key, no card for them', async () => {
    const hr = (await api('hrA', 'get', '/people/workforce').expect(200)).body;
    expect(Object.keys(hr.cards).sort()).toEqual(['consultants', 'contractWorkers', 'employees', 'persons', 'placements']);
    expect(hr.cards.consultants).toBeNull();
    expect(hr.cards.contractWorkers).toBeNull();
    expect(hr.cards.placements).toBeNull();
    expect(hr.cards.employees.count).toBe(6);
    expect((await api('hrA', 'get', `/people/workforce?legalEntityId=${ids.leTN}`).expect(200)).body.cards.employees.count).toBe(1);
  });

  // ------------------------------------------------------------------------------------------ buddies (PPL-41)

  it('buddies: the pool, load, joiners without a buddy; onboarding keys only', async () => {
    await api('empA', 'get', '/people/buddies').expect(403);
    await api('hrA', 'post', '/people/buddies').send({ employeeId: ids.divya, cap: 2 }).expect(201);
    await api('hrA', 'post', '/people/buddies').send({ employeeId: ids.divya }).expect(409);
    await api('hrA', 'post', '/people/buddies').send({ employeeId: ids.divya, cap: 9 }).expect(400);
    await api('adminB', 'post', '/people/buddies').send({ employeeId: ids.divya }).expect(400); // not an employee of B
    // A joiner waiting for day one, with Divya as buddy; another without one.
    await tenantPrisma.forTenant(ctx('A'), async (tx) => {
      const mk = async (givenName: string, buddy: string | null) => {
        const p = await tx.person.create({ data: { organizationId: org.A.id, givenName } });
        return (await tx.preboarding.create({ data: { organizationId: org.A.id, personId: p.id, source: 'direct', joiningOn: new Date(`${addDays(todayIst(), 10)}T00:00:00Z`), legalEntityId: ids.leKF, locationId: ids.locKF, departmentId: ids.deptKF, designationId: ids.desKF, managerEmployeeId: ids.arjun, hrOwnerUserId: users.hrA, status: 'invited', buddyEmployeeId: buddy } })).id;
      };
      ids.kavya = await mk('Kavya', ids.divya);
      ids.murugan = await mk('Murugan', null);
    });
    const b = (await api('hrA', 'get', '/people/buddies').expect(200)).body;
    expect(b.pool).toMatchObject([{ employeeId: ids.divya, name: 'Divya', team: 'Quality KF', location: 'Site KF', cap: 2, load: 1, joiners: [{ name: 'Kavya' }], leavingOn: null }]);
    expect(b.needs).toMatchObject([{ id: ids.murugan, name: 'Murugan', role: 'Analyst KF', team: 'Quality KF', location: 'Site KF', manager: 'Arjun' }]);
    // Assigning keeps to the cap: Divya looks after 2 at most.
    await api('hrA', 'put', `/lifecycle/joiners/${ids.murugan}/buddy`).send({ employeeId: ids.divya, version: b.needs[0].version }).expect(200);
    ids.ravi = await tenantPrisma.forTenant(ctx('A'), async (tx) => {
      const p = await tx.person.create({ data: { organizationId: org.A.id, givenName: 'Ravi' } });
      return (await tx.preboarding.create({ data: { organizationId: org.A.id, personId: p.id, source: 'direct', joiningOn: new Date(`${addDays(todayIst(), 12)}T00:00:00Z`), legalEntityId: ids.leKF, locationId: ids.locKF, departmentId: ids.deptKF, designationId: ids.desKF, managerEmployeeId: ids.arjun, hrOwnerUserId: users.hrA, status: 'invited' } })).id;
    });
    expect((await api('hrA', 'put', `/lifecycle/joiners/${ids.ravi}/buddy`).send({ employeeId: ids.divya, version: 1 }).expect(400)).body.message).toBe('Divya already looks after 2 joiners. Choose another buddy.');
    expect((await api('hrA', 'get', '/people/buddies').expect(200)).body.pool[0]).toMatchObject({ load: 2, joiners: [{ name: 'Kavya' }, { name: 'Murugan' }] });
    await api('hrNoPan', 'delete', `/people/buddies/${ids.divya}`).expect(200);
    await api('hrA', 'delete', `/people/buddies/${ids.divya}`).expect(404);
    expect(await audits('buddy.pool.added')).toHaveLength(1);
  });

  // ------------------------------------------------------------------------------------------ union register (PPL-39)

  it('union register: industrial relations key, per legal entity, recognition rules, nothing across companies', async () => {
    const u = { legalEntityId: ids.leKF, name: 'Hosur Food Workers Union', registrationNo: 'TN/HSR/TU/1187', locationId: ids.locKF, recognition: 'recognised', basis: 'Sole negotiating union: 58% of workers', validFrom: '2025-04-01', validTo: '2028-03-31', bearers: 'President Murugesan V' };
    await api('empA', 'get', '/people/unions').expect(403);
    await api('hrA', 'post', '/people/unions').send({ ...u, basis: null }).expect(400);
    await api('hrA', 'post', '/people/unions').send({ ...u, validTo: '2024-01-01' }).expect(400);
    await api('hrA', 'post', '/people/unions').send({ ...u, locationId: ids.locTN }).expect(400);
    await api('hrA', 'post', '/people/unions').send({ ...u, legalEntityId: ids.leBB }).expect(403);
    ids.union = (await api('hrA', 'post', '/people/unions').send(u).expect(201)).body.id;
    await api('hrA', 'post', '/people/unions').send(u).expect(409);
    await api('hrA', 'post', '/people/unions').send({ legalEntityId: ids.leTN, name: 'TN Staff Association', recognition: 'not_recognised' }).expect(201);
    const all = (await api('hrA', 'get', '/people/unions').expect(200)).body;
    expect(all.unions).toMatchObject([
      { name: 'Hosur Food Workers Union', establishment: 'Site KF', recognition: 'recognised', validFrom: '2025-04-01', validTo: '2028-03-31', checkOff: 0 },
      { name: 'TN Staff Association', establishment: 'Entity TN', recognition: 'not_recognised' },
    ]);
    // Plant HR keeps the TN register only.
    expect((await api('hrTn', 'get', '/people/unions').expect(200)).body.unions.map((x: { name: string }) => x.name)).toEqual(['TN Staff Association']);
    await api('hrTn', 'put', `/people/unions/${ids.union}`).send(u).expect(403);
    await api('hrA', 'put', `/people/unions/${ids.union}`).send({ ...u, recognition: 'not_recognised', basis: null }).expect(200);
    expect((await api('adminB', 'get', '/people/unions').expect(200)).body.unions).toEqual([]);
    expect(await audits('union.added')).toHaveLength(2);
  });

  // ------------------------------------------------------------------------------------------ succession (PPL-26)

  it('succession: company-wide key only; positions, successors and readiness', async () => {
    await api('empA', 'get', '/people/succession').expect(403);
    await api('hrTn', 'get', '/people/succession').expect(403); // an entity-scoped grant is not enough
    await api('hrNoPan', 'get', '/people/succession').expect(403);
    ids.pos = (await api('hrA', 'post', '/people/succession').send({ title: 'Head of Quality', incumbentEmployeeId: ids.divya }).expect(201)).body.id;
    await api('hrA', 'post', '/people/succession').send({ title: 'head of quality' }).expect(409);
    await api('hrA', 'post', '/people/succession').send({ title: 'Finance Controller' }).expect(201);
    await api('hrA', 'put', `/people/succession/${ids.pos}/successors`).send({ employeeId: ids.divya, readiness: 'now' }).expect(400);
    await api('hrA', 'put', `/people/succession/${ids.pos}/successors`).send({ employeeId: ids.arjun, readiness: 'soon' }).expect(400);
    await api('hrA', 'put', `/people/succession/${ids.pos}/successors`).send({ employeeId: ids.arjun, readiness: '1_2y' }).expect(200);
    await api('hrA', 'put', `/people/succession/${ids.pos}/successors`).send({ employeeId: ids.arjun, readiness: 'now' }).expect(200);
    const s = (await api('hrA', 'get', '/people/succession').expect(200)).body;
    expect(s.positions).toMatchObject([
      { title: 'Finance Controller', incumbent: null, successors: [] },
      { title: 'Head of Quality', incumbent: { name: 'Divya', band: null }, successors: [{ name: 'Arjun', readiness: 'Ready now', band: null }] },
    ]);
    await api('hrA', 'delete', `/people/succession/${ids.pos}/successors/${ids.arjun}`).expect(200);
    await api('hrA', 'delete', `/people/succession/${ids.pos}/successors/${ids.arjun}`).expect(404);
    await api('adminB', 'get', '/people/succession').expect(403);
    expect(await audits('succession.nominated')).toHaveLength(2);
  });
});
