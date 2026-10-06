import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { PeopleService } from '../src/people/people.service';
import { addDays, todayIst } from '../src/org-structure/org-validation';
import { markSteppedUp } from './fixtures/step-up';

// Step 2c, the people core, end to end against the real database (forced RLS, app role): the person behind
// a record (P01 §4.5a, J15), dotted-line managers (M01 Q5), directory and org chart (M01 §3.2, P02 Q4),
// reporting subtrees and the manager's team (§3.10, P02 Q2), managers raising changes (YX-SEC-27),
// probation (M01 §3.4, YX-LC-01), employee codes (YX-ORG-16), logins (P01 §4.5) and bulk changes (§3.3).
describe('People core (P01 §4.4–4.5a; M01 §3.2–3.4, §3.10; P02 YX-SEC-04/06/11/17/27; R1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let people: PeopleService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const today = todayIst();
  const joinOld = addDays(today, -700);
  const joinKiran = addDays(today, -170);

  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  type Who = 'adminA' | 'adminB' | 'hrA' | 'approverA' | 'payrollA' | 'divyaA' | 'arjunA' | 'lakshmiA' | 'outsiderA';
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const ids: Record<string, string> = {};
  const asA = () => ({ organizationId: org.A.id, isSuperAdmin: false });
  const email = (who: string) => `${who}-${runId}@ppl.test`;
  const auditActions = async (prefix: string) =>
    (await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: { startsWith: prefix } }, orderBy: { createdAt: 'asc' } }))).map((a) => ({
      action: a.action,
      entityId: a.entityId,
      metadata: a.metadataJson ? JSON.parse(a.metadataJson) : null,
    }));
  const join = (body: Record<string, unknown>) => ({
    legalEntityId: ids.kf,
    status: 'confirmed',
    reason: 'Joined',
    joinedOn: joinOld,
    assignment: { locationId: ids.blr, departmentId: ids.qa, designationId: ids.analyst, gradeId: ids.g2, employmentTypeId: ids.perm, managerEmployeeId: null },
    ...body,
  });
  const hire = async (body: Record<string, unknown>, assignment: Record<string, unknown> = {}) =>
    (await api('hrA', 'post', '/people/employees').send(join({ ...body, assignment: { ...join({}).assignment, ...assignment } })).expect(201)).body.id as string;
  /** Raise (as `by`) and approve (as approverA, stepped up) a change. */
  const approved = async (by: Who, body: Record<string, unknown>) => {
    const raised = await api(by, 'post', '/people/changes').send(body).expect(201);
    await markSteppedUp(tenantPrisma, token.approverA);
    return (await api('approverA', 'post', `/people/changes/${raised.body.id}/approve`).send({ confirmRebase: true }).expect(201)).body;
  };
  const noPay = (body: unknown) => expect(JSON.stringify(body)).not.toMatch(/annualCtc|compensation|increasePercent/);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    people = moduleRef.get(PeopleService);

    planId = (await prisma.plan.create({ data: { name: `ppl-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Org ${k}`, slug: `ppl-${k.toLowerCase()}-${runId}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    await tenantPrisma.forTenant(asA(), async (tx) => {
      const o = { organizationId: org.A.id };
      ids.kf = (await tx.legalEntity.create({ data: { ...o, name: 'Kaveri Foods', shortName: 'KFPL', isDefault: true } })).id;
      ids.tn = (await tx.legalEntity.create({ data: { ...o, name: 'Kaveri TN', shortName: 'KFPL-TN' } })).id;
      ids.blr = (await tx.location.create({ data: { ...o, legalEntityId: ids.kf, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      ids.mys = (await tx.location.create({ data: { ...o, legalEntityId: ids.kf, name: 'Mysuru', code: 'MYS', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      ids.hsr = (await tx.location.create({ data: { ...o, legalEntityId: ids.tn, name: 'Hosur', code: 'HSR', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const dept = async (code: string, parent: { id: string; path: string } | null = null, owner: string | null = null) => {
        const id = randomUUID();
        const path = `${parent?.path ?? '/'}${id}/`;
        await tx.department.create({ data: { ...o, id, name: code, code, path, parentId: parent?.id ?? null, ownerLegalEntityId: owner } });
        return { id, path };
      };
      const ops = await dept('OPS');
      ids.ops = ops.id;
      ids.qa = (await dept('QA', ops)).id;
      ids.ppl = (await dept('PPL')).id;
      ids.prod = (await dept('PROD', null, ids.tn)).id;
      ids.analyst = (await tx.designation.create({ data: { ...o, name: 'Quality Analyst', code: 'QA-AN' } })).id;
      ids.lead = (await tx.designation.create({ data: { ...o, name: 'Quality Lead', code: 'QA-LEAD' } })).id;
      ids.g2 = (await tx.grade.create({ data: { ...o, name: 'G2', code: 'G2', rank: 2 } })).id;
      ids.g3 = (await tx.grade.create({ data: { ...o, name: 'G3', code: 'G3', rank: 3 } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      ids.prob = (await tx.employmentType.create({ data: { ...o, name: 'Probationer', code: 'PROB', category: 'probation' } })).id;
      ids.cc1 = (await tx.costCentre.create({ data: { ...o, legalEntityId: ids.kf, name: 'Engineering', code: 'CC-ENG' } })).id;
      ids.ccTn = (await tx.costCentre.create({ data: { ...o, legalEntityId: ids.tn, name: 'Plant', code: 'CC-PLT' } })).id;
    });
    ids.bEntity = (await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.legalEntity.create({ data: { organizationId: org.B.id, name: 'B Ltd', shortName: 'BLTD', isDefault: true } }))).id;

    const profile = async (name: string, keys: string[]) =>
      (await tenantPrisma.forTenant(asA(), (tx) => tx.permissionProfile.create({ data: { organizationId: org.A.id, name, permissionsJson: JSON.stringify(keys) } }))).id;
    const hr = await profile('HR Admin', ['employee.profile.view', 'employee.change.manage', 'employee.change.approve', 'employee.change.retro']);
    const approver = await profile('HR Approver', ['employee.profile.view', 'employee.change.approve', 'employee.change.retro', 'employee.salary.view']);
    const payroll = await profile('Payroll Admin', ['employee.profile.view', 'employee.change.manage', 'employee.change.approve', 'employee.salary.view', 'employee.salary.manage']);
    const manager = await profile('Team Manager', ['org:view', 'request.raise_on_behalf']);
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hrA', 'A', 'panel', hr],
      ['approverA', 'A', 'panel', approver],
      ['payrollA', 'A', 'panel', payroll],
      ['divyaA', 'A', 'panel', manager],
      ['arjunA', 'A', 'panel', null],
      ['lakshmiA', 'A', 'panel', null],
      ['outsiderA', 'A', 'panel', null],
    ];
    for (const [name, k, role, permissionProfileId] of roster) {
      users[name] = (
        await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, (tx) =>
          tx.user.create({ data: { organizationId: org[k].id, email: email(name), passwordHash, role, permissionProfileId } }),
        )
      ).id;
      const res = await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: email(name), password: PASSWORD }).expect(200);
      token[name] = res.body.accessToken;
    }
  });

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

  describe('the person behind each record (P01 §4.5a; YX-ORG-26/27/28)', () => {
    it('hiring creates a person with an employee role and a login role; phones are stored in E.164', async () => {
      ids.lakshmi = await hire({ givenName: 'Lakshmi', familyName: 'Venkatesan', workEmail: email('lakshmiA'), userId: users.lakshmiA, mobilePhone: '098450 12345' }, { departmentId: ids.ppl });
      ids.divya = await hire({ givenName: 'Divya', familyName: 'Raghunathan', workEmail: email('divyaA'), userId: users.divyaA }, { managerEmployeeId: ids.lakshmi });
      ids.arjun = await hire({ givenName: 'Arjun', familyName: 'Kulkarni', workEmail: email('arjunA'), userId: users.arjunA }, { managerEmployeeId: ids.divya, costCentres: [{ costCentreId: ids.cc1, percent: '100' }] });
      ids.meera = await hire({ givenName: 'Meera', familyName: 'Iyer', workEmail: `meera-${runId}@ppl.test` }, { managerEmployeeId: ids.arjun });
      ids.imran = await hire({ givenName: 'Imran', legalEntityId: ids.tn, workEmail: `imran-${runId}@ppl.test` }, { locationId: ids.hsr, departmentId: ids.prod, managerEmployeeId: ids.lakshmi, costCentres: [{ costCentreId: ids.ccTn, percent: '100' }] });
      const person = (await api('hrA', 'get', `/people/employees/${ids.lakshmi}/person`).expect(200)).body;
      expect(person).toMatchObject({ givenName: 'Lakshmi', familyName: 'Venkatesan', primaryEmail: email('lakshmiA'), primaryPhone: '+919845012345', status: 'active', loginLinked: true });
      expect(person.roles.map((r: { roleType: string; label: string }) => [r.roleType, r.label])).toEqual([
        ['employee', 'E0001 · Kaveri Foods'],
        ['login', email('lakshmiA')],
      ]);
    });

    it('an email or phone that belongs to a person is never linked silently; HR confirms; one employee record per person', async () => {
      const clash = await api('hrA', 'post', '/people/employees').send(join({ givenName: 'Lakshmi V', workEmail: email('lakshmiA').toUpperCase() })).expect(409);
      expect(clash.body).toMatchObject({ code: 'POSSIBLE_SAME_PERSON' });
      await api('hrA', 'post', '/people/employees').send(join({ givenName: 'Other', mobilePhone: '+91 98450 12345' })).expect(409);
      const lakshmiPerson = (await api('hrA', 'get', `/people/employees/${ids.lakshmi}/person`).expect(200)).body.id;
      // Linking to a person who already has an employee record: a rehire is a new employment, not a second record.
      await api('hrA', 'post', '/people/employees').send(join({ givenName: 'Lakshmi', personId: lakshmiPerson })).expect(409);
      // A person known from elsewhere in the company (say a candidate) is linked once HR confirms it.
      const known = await tenantPrisma.forTenant(asA(), (tx) => tx.person.create({ data: { organizationId: org.A.id, givenName: 'Kiran', familyName: 'Joshi', primaryEmail: `kiran-${runId}@ppl.test` } }));
      ids.kiran = await hire({ givenName: 'Kiran', familyName: 'Joshi', workEmail: `kiran-${runId}@ppl.test`, personId: known.id, status: 'probation', joinedOn: joinKiran }, { employmentTypeId: ids.prob, managerEmployeeId: ids.divya });
      expect((await api('hrA', 'get', `/people/employees/${ids.kiran}/person`).expect(200)).body.id).toBe(known.id);
      const log = await tenantPrisma.forTenant(asA(), (tx) => tx.personLinkLog.findMany({ where: { organizationId: org.A.id, personId: known.id } }));
      expect(log).toEqual([expect.objectContaining({ action: 'confirmed', basis: 'hr_confirmed', decidedBy: users.hrA })]);
      // Another company's person, a malformed phone: refused.
      const bPerson = await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.person.create({ data: { organizationId: org.B.id, givenName: 'Bea' } }));
      await api('hrA', 'post', '/people/employees').send(join({ givenName: 'Bea', personId: bPerson.id })).expect(400);
      await api('hrA', 'post', '/people/employees').send(join({ givenName: 'X', mobilePhone: '12' })).expect(400);
    });

    it('contact details are for HR and the person; a manager or colleague gets 404', async () => {
      expect((await api('lakshmiA', 'get', `/people/employees/${ids.lakshmi}/person`).expect(200)).body.primaryPhone).toBe('+919845012345');
      await api('divyaA', 'get', `/people/employees/${ids.arjun}/person`).expect(404);
      await api('arjunA', 'get', `/people/employees/${ids.lakshmi}/person`).expect(404);
      await api('adminB', 'get', `/people/employees/${ids.lakshmi}/person`).expect(404);
    });
  });

  describe('dotted-line managers (M01 Q5; P01 §4.4; YX-ORG-09)', () => {
    it('set through a manager change, shown on the record and in the impact; checked like managers', async () => {
      const raise = (dotted: string[], type = 'manager_change', date = addDays(today, -10)) =>
        api('hrA', 'post', '/people/changes').send({ employeeId: ids.arjun, changeType: type, effectiveDate: date, payload: { assignment: { dottedLineManagerIds: dotted } }, reason: 'Dotted line' });
      await raise([ids.arjun]).expect(400); // never oneself
      await raise([randomUUID()]).expect(400); // not in this company
      await raise([ids.lakshmi, ids.lakshmi]).expect(400);
      await raise([ids.lakshmi], 'promotion').expect(400); // a promotion does not move reporting lines
      const change = await approved('hrA', { employeeId: ids.arjun, changeType: 'manager_change', effectiveDate: addDays(today, -10), payload: { assignment: { dottedLineManagerIds: [ids.lakshmi] } }, reason: 'Dotted line to People' });
      expect(change.impact.facts).toEqual(expect.arrayContaining([{ fact: 'Dotted-line managers (visibility only)', from: null, to: 'Lakshmi Venkatesan' }]));
      const asOf = (await api('hrA', 'get', `/people/employees/${ids.arjun}/as-of`).expect(200)).body;
      expect(asOf.assignment.dottedLineManagers).toEqual([{ id: ids.lakshmi, name: 'Lakshmi Venkatesan' }]);
      expect(asOf.assignment.manager.id).toBe(ids.divya);
      // A dotted-line manager must be employed on every day of the line (YX-ORG-09): Kiran joined later.
      await api('hrA', 'post', '/people/changes').send({ employeeId: ids.meera, changeType: 'manager_change', effectiveDate: addDays(joinKiran, -5), payload: { assignment: { dottedLineManagerIds: [ids.kiran] } }, reason: 'Too early' }).expect(201);
      const early = (await api('hrA', 'get', '/people/changes?status=pending').expect(200)).body.find((c: { employeeId: string }) => c.employeeId === ids.meera);
      await markSteppedUp(tenantPrisma, token.approverA);
      const refused = await api('approverA', 'post', `/people/changes/${early.id}/approve`).send({}).expect(400);
      expect(refused.body.message).toMatch(/dotted-line manager is not employed/);
      await api('hrA', 'post', `/people/changes/${early.id}/cancel`).send({ reason: 'Raised by mistake' }).expect(201);
      // Dotted lines never enter approvals (YX-EMP-04): Lakshmi gains no right to approve Arjun's changes.
      await api('lakshmiA', 'get', '/people/changes').expect(403);
    });
  });

  describe('directory and org chart (P02 Q4, YX-SEC-17; M01 §3.2)', () => {
    it('employees see Public fields of colleagues; HR also codes and joining dates; others are refused', async () => {
      const mine = (await api('arjunA', 'get', '/people/directory').expect(200)).body;
      expect(mine.total).toBe(6);
      const lakshmi = mine.people.find((p: { id: string }) => p.id === ids.lakshmi);
      expect(lakshmi).toEqual({
        id: ids.lakshmi,
        name: 'Lakshmi Venkatesan',
        workEmail: email('lakshmiA'),
        designation: { id: ids.analyst, name: 'Quality Analyst' },
        department: { id: ids.ppl, name: 'PPL' },
        location: { id: ids.blr, name: 'Bengaluru' },
        legalEntity: { id: ids.kf, name: 'Kaveri Foods' },
        manager: null,
      });
      noPay(mine);
      const hr = (await api('hrA', 'get', '/people/directory').expect(200)).body;
      expect(hr.people.find((p: { id: string }) => p.id === ids.lakshmi)).toMatchObject({ employeeCode: 'E0001', joinedOn: joinOld });
      await api('outsiderA', 'get', '/people/directory').expect(403);
      await api('adminB', 'get', '/people/directory').expect(200).expect((r) => expect(r.body.total).toBe(0));
      await request(server()).get('/api/v1/people/directory').expect(401);
    });

    it('searches names safely and filters by entity, location and department subtree', async () => {
      const names = async (query: string) => ((await api('arjunA', 'get', `/people/directory?${query}`).expect(200)).body.people as { name: string }[]).map((p) => p.name);
      expect(await names('q=iyer')).toEqual(['Meera Iyer']);
      expect(await names('q=%25')).toEqual([]); // "%" is a character to find, not a wildcard
      expect(await names(`legalEntityId=${ids.tn}`)).toEqual(['Imran']);
      expect(await names(`departmentId=${ids.ops}`)).toEqual(['Arjun Kulkarni', 'Divya Raghunathan', 'Kiran Joshi', 'Meera Iyer']); // OPS includes QA
      expect(await names('q=E0001')).toEqual([]); // codes are searchable by HR only
      expect(((await api('hrA', 'get', '/people/directory?q=E0001').expect(200)).body.people as { name: string }[]).map((p) => p.name)).toContain('Lakshmi Venkatesan');
      await api('arjunA', 'get', '/people/directory?limit=1000').expect(400);
      await api('arjunA', 'get', '/people/directory?departmentId=not-a-uuid').expect(400);
      const page = (await api('arjunA', 'get', '/people/directory?limit=2&offset=2').expect(200)).body;
      expect(page).toMatchObject({ total: 6, limit: 2, offset: 2 });
      expect(page.people).toHaveLength(2);
    });

    it('the org chart has managers and dotted lines; HR may look at another date, others see today', async () => {
      const chart = (await api('arjunA', 'get', '/people/org-chart').expect(200)).body;
      const node = (id: string) => chart.nodes.find((n: { id: string }) => n.id === id);
      expect(node(ids.arjun)).toMatchObject({ managerId: ids.divya, dottedLineManagerIds: [ids.lakshmi], directReports: 1 });
      expect(node(ids.divya)).toMatchObject({ managerId: ids.lakshmi, directReports: 2 });
      expect(node(ids.divya).employeeCode).toBeUndefined();
      noPay(chart);
      await api('arjunA', 'get', `/people/org-chart?asOf=${addDays(today, -20)}`).expect(403);
      const past = (await api('hrA', 'get', `/people/org-chart?asOf=${addDays(today, -20)}`).expect(200)).body;
      expect(past.nodes.find((n: { id: string }) => n.id === ids.arjun).dottedLineManagerIds).toEqual([]);
      expect(past.nodes.some((n: { id: string }) => n.id === ids.kiran)).toBe(true);
      expect((await api('hrA', 'get', `/people/org-chart?asOf=${addDays(joinOld, -1)}`).expect(200)).body.nodes).toEqual([]);
      await api('outsiderA', 'get', '/people/org-chart').expect(403);
    });
  });

  describe('reporting subtrees and the team (M01 §3.10; P02 Q2, Q5; YX-SEC-06)', () => {
    it('a manager sees their whole subtree, never above or beside it', async () => {
      const all = (await api('divyaA', 'get', `/people/employees/${ids.divya}/reports?scope=all`).expect(200)).body;
      expect(all.map((r: { name: string; depth: number }) => [r.name, r.depth])).toEqual([
        ['Arjun Kulkarni', 1],
        ['Kiran Joshi', 1],
        ['Meera Iyer', 2],
      ]);
      const direct = (await api('divyaA', 'get', `/people/employees/${ids.divya}/reports`).expect(200)).body;
      expect(direct.map((r: { name: string }) => r.name)).toEqual(['Arjun Kulkarni', 'Kiran Joshi']);
      // Divya sees Arjun's own reports (inside her subtree); not Lakshmi's (above her) nor Imran's (beside her).
      await api('divyaA', 'get', `/people/employees/${ids.arjun}/reports`).expect(200);
      await api('divyaA', 'get', `/people/employees/${ids.lakshmi}/reports`).expect(404);
      await api('divyaA', 'get', `/people/employees/${ids.imran}/reports`).expect(404);
      await api('adminB', 'get', `/people/employees/${ids.divya}/reports`).expect(404);
      expect((await api('hrA', 'get', `/people/employees/${ids.lakshmi}/reports?scope=all`).expect(200)).body).toHaveLength(5);
    });

    it('the team page lists direct, indirect and dotted-line reports with probation ends, never pay', async () => {
      const team = (await api('divyaA', 'get', '/people/team').expect(200)).body;
      expect(team.managerId).toBe(ids.divya);
      expect(team.members.map((m: { name: string; relation: string }) => [m.name, m.relation])).toEqual([
        ['Arjun Kulkarni', 'direct'],
        ['Kiran Joshi', 'direct'],
        ['Meera Iyer', 'indirect'],
      ]);
      expect(team.members.find((m: { id: string }) => m.id === ids.kiran)).toMatchObject({ status: 'probation', joinedOn: joinKiran, probationEndsOn: expect.any(String) });
      noPay(team);
      const lakshmi = (await api('lakshmiA', 'get', '/people/team').expect(200)).body;
      expect(lakshmi.members.find((m: { id: string }) => m.id === ids.arjun)).toMatchObject({ relation: 'indirect' });
      expect((await api('outsiderA', 'get', '/people/team').expect(200)).body).toEqual({ managerId: null, members: [] });
    });
  });

  describe('managers raise changes for their team (P02 YX-SEC-27; M01 §3.10)', () => {
    const in20 = addDays(today, 20);

    it('only for people in their subtree, only the job-change types, never pay, never approving', async () => {
      const body = (employeeId: string, extra: Record<string, unknown> = {}) => ({ employeeId, changeType: 'transfer', effectiveDate: in20, payload: { assignment: { locationId: ids.mys } }, reason: 'Moving to Mysuru', ...extra });
      const raised = await api('divyaA', 'post', '/people/changes').send(body(ids.meera)).expect(201);
      ids.onBehalf = raised.body.id;
      await api('divyaA', 'post', '/people/changes/preview').send(body(ids.arjun)).expect(201);
      await api('divyaA', 'post', '/people/changes').send(body(ids.lakshmi)).expect(404); // above her
      await api('divyaA', 'post', '/people/changes').send(body(ids.imran, { payload: { assignment: { departmentId: ids.qa } } })).expect(404); // beside her
      await api('divyaA', 'post', '/people/changes').send(body(ids.divya)).expect(404); // herself
      await api('divyaA', 'post', '/people/changes').send({ ...body(ids.arjun), changeType: 'salary_revision', payload: { compensation: { increasePercent: '5' } } }).expect(403);
      await api('divyaA', 'post', '/people/changes').send({ ...body(ids.arjun), changeType: 'promotion', payload: { assignment: { designationId: ids.lead }, compensation: { annualCtc: '900000' } } }).expect(403);
      await api('divyaA', 'post', '/people/changes').send({ ...body(ids.arjun), changeType: 'correction' }).expect(403);
      await api('divyaA', 'post', '/people/changes').send({ ...body(ids.arjun), effectiveDate: addDays(today, -3) }).expect(403); // past dates need employee.change.retro
      await api('arjunA', 'post', '/people/changes').send(body(ids.meera)).expect(403); // no grant
      // The manager sees what they raised, nothing else; approving is HR's (YX-SEC-11).
      const list = (await api('divyaA', 'get', '/people/changes').expect(200)).body;
      expect(list.map((c: { id: string }) => c.id)).toEqual([ids.onBehalf]);
      const other = (await api('hrA', 'get', '/people/changes').expect(200)).body.find((c: { requestedBy: string }) => c.requestedBy === users.hrA);
      await api('divyaA', 'get', `/people/changes/${other.id}`).expect(404);
      await markSteppedUp(tenantPrisma, token.divyaA);
      await api('divyaA', 'post', `/people/changes/${ids.onBehalf}/approve`).send({}).expect(403);
      await markSteppedUp(tenantPrisma, token.approverA);
      await api('approverA', 'post', `/people/changes/${ids.onBehalf}/approve`).send({}).expect(201);
      // Once decided, the manager can no longer withdraw it; a pending one they raised they can.
      await api('divyaA', 'post', `/people/changes/${ids.onBehalf}/cancel`).send({ reason: 'Changed my mind' }).expect(404);
      const again = await api('divyaA', 'post', '/people/changes').send({ ...body(ids.arjun), changeType: 'redesignation', payload: { assignment: { designationId: ids.lead } } }).expect(201);
      await api('divyaA', 'post', `/people/changes/${again.body.id}/cancel`).send({ reason: 'Raised too early' }).expect(201);
    });
  });

  describe('probation (M01 §3.4, Q3; YX-LC-01)', () => {
    it('a joiner on probation gets the company length; the employment type may differ', async () => {
      const list = (await api('hrA', 'get', '/people/probations').expect(200)).body;
      const kiran = list.rows.find((r: { employeeId: string }) => r.employeeId === ids.kiran);
      expect(kiran).toMatchObject({ startOn: joinKiran, extendedMonths: 0, maxTotalMonths: 12, stage: 'review_due' });
      ids.kiranEnd = kiran.plannedEndOn;
      // Three months for probationers, by company setting (P01 §4.6 scope: employment type).
      await api('adminA', 'put', '/org/settings').send({ key: 'probation.default_months', scopeType: 'employment_type', scopeId: ids.prob, value: '3' }).expect(200);
      ids.ravi = await hire({ givenName: 'Ravi', status: 'probation', joinedOn: '2026-01-31', workEmail: `ravi-${runId}@ppl.test` }, { employmentTypeId: ids.prob, managerEmployeeId: ids.divya });
      const ravi = (await api('hrA', 'get', '/people/probations').expect(200)).body.rows.find((r: { employeeId: string }) => r.employeeId === ids.ravi);
      expect(ravi).toMatchObject({ startOn: '2026-01-31', plannedEndOn: '2026-04-29' }); // month ends clamp: 31 Jan + 3 months - 1 day
      // The manager sees their team's probations only; others none.
      expect((await api('divyaA', 'get', '/people/probations').expect(200)).body.rows.map((r: { employeeId: string }) => r.employeeId).sort()).toEqual([ids.kiran, ids.ravi].sort());
      expect((await api('arjunA', 'get', '/people/probations').expect(200)).body.rows).toEqual([]);
      expect((await api('adminB', 'get', '/people/probations').expect(200)).body.rows).toEqual([]);
    });

    it('extensions stay within the company maximum, with a reason; never one\'s own', async () => {
      await api('hrA', 'post', `/people/employees/${ids.kiran}/probation/extend`).send({ months: 3, reason: 'Needs more time on audits' }).expect(201);
      await api('hrA', 'post', `/people/employees/${ids.kiran}/probation/extend`).send({ months: 4, reason: 'Again' }).expect(400); // 6 + 3 + 4 > 12
      await api('hrA', 'post', `/people/employees/${ids.kiran}/probation/extend`).send({ months: 0, reason: 'Zero' }).expect(400);
      await api('hrA', 'post', `/people/employees/${ids.kiran}/probation/extend`).send({ months: 1 }).expect(400);
      await api('divyaA', 'post', `/people/employees/${ids.kiran}/probation/extend`).send({ months: 1, reason: 'Manager' }).expect(403);
      await api('hrA', 'post', `/people/employees/${ids.meera}/probation/extend`).send({ months: 1, reason: 'Not on probation' }).expect(404);
      await api('adminB', 'post', `/people/employees/${ids.kiran}/probation/extend`).send({ months: 1, reason: 'Other company' }).expect(404);
      const row = (await api('hrA', 'get', '/people/probations').expect(200)).body.rows.find((r: { employeeId: string }) => r.employeeId === ids.kiran);
      expect(row).toMatchObject({ extendedMonths: 3, originalEndOn: ids.kiranEnd });
      expect(row.plannedEndOn > ids.kiranEnd).toBe(true);
      expect((await auditActions('employee.probation.extended')).map((a) => a.metadata.reason)).toEqual(['Needs more time on audits']);
    });

    it('the daily job reminds, then escalates on the end date, once each; no auto-confirm unless switched on', async () => {
      const at = (date: string) => new Date(`${date}T12:00:00+05:30`);
      const ravi = (await api('hrA', 'get', '/people/probations').expect(200)).body.rows.find((r: { employeeId: string }) => r.employeeId === ids.ravi);
      expect(ravi.stage).toBe('overdue');
      expect(await people.probationSweep(at(today))).toBeGreaterThan(0);
      expect(await people.probationSweep(at(today))).toBe(0); // idempotent
      const reminded = (await auditActions('employee.probation.')).filter((a) => a.entityId === ids.ravi).map((a) => a.action);
      expect(reminded).toEqual(['employee.probation.review_due', 'employee.probation.escalated']);
      expect((await api('hrA', 'get', `/people/employees/${ids.ravi}/as-of`).expect(200)).body.status.status).toBe('probation');
      // Switched on (Q3: the company opts in): confirmed from the day after the end, by the company rule.
      await api('adminA', 'put', '/org/settings').send({ key: 'probation.auto_confirm_after_days', scopeType: 'tenant', value: '7' }).expect(200);
      await people.probationSweep(at(today));
      const status = (await api('hrA', 'get', `/people/employees/${ids.ravi}/as-of`).expect(200)).body.status;
      expect(status).toMatchObject({ status: 'confirmed', validFrom: '2026-04-30' });
      expect((await auditActions('employee.probation.auto_confirmed')).map((a) => a.entityId)).toEqual([ids.ravi]);
      // Kiran's end is not 7 days past, so he stays on probation.
      expect((await api('hrA', 'get', `/people/employees/${ids.kiran}/as-of`).expect(200)).body.status.status).toBe('probation');
      await api('adminA', 'put', '/org/settings').send({ key: 'probation.auto_confirm_after_days', scopeType: 'tenant', value: 'off' }).expect(200);
      await api('hrA', 'post', `/people/employees/${ids.ravi}/probation/extend`).send({ months: 1, reason: 'Too late' }).expect(409);
    });

    it('confirmation is an approved P06 change; a waiting one blocks extension', async () => {
      const raised = await api('hrA', 'post', '/people/changes').send({ employeeId: ids.kiran, changeType: 'confirmation', effectiveDate: addDays(today, 5), payload: { status: 'confirmed' }, reason: 'Probation completed' }).expect(201);
      expect((await api('hrA', 'get', '/people/probations').expect(200)).body.rows.find((r: { employeeId: string }) => r.employeeId === ids.kiran)).toMatchObject({ stage: 'awaiting_approval', pendingConfirmationId: raised.body.id });
      await api('hrA', 'post', `/people/employees/${ids.kiran}/probation/extend`).send({ months: 1, reason: 'Wait' }).expect(409);
      await markSteppedUp(tenantPrisma, token.approverA);
      await api('approverA', 'post', `/people/changes/${raised.body.id}/approve`).send({}).expect(201);
      expect((await api('hrA', 'get', '/people/probations').expect(200)).body.rows.find((r: { employeeId: string }) => r.employeeId === ids.kiran)).toMatchObject({ stage: 'confirmed', confirmedFrom: addDays(today, 5) });
    });
  });

  describe('employee codes (YX-ORG-16) and logins (P01 §4.5)', () => {
    it('a code is corrected with a reason, stays unique, and is audited', async () => {
      await api('hrA', 'put', `/people/employees/${ids.meera}/code`).send({ employeeCode: 'KF-0118', reason: 'Match the payroll series' }).expect(200);
      await api('hrA', 'put', `/people/employees/${ids.arjun}/code`).send({ employeeCode: 'kf-0118', reason: 'Clash' }).expect(409);
      await api('hrA', 'put', `/people/employees/${ids.arjun}/code`).send({ employeeCode: 'bad code!', reason: 'Clash' }).expect(400);
      await api('divyaA', 'put', `/people/employees/${ids.arjun}/code`).send({ employeeCode: 'KF-0200', reason: 'Not HR' }).expect(403);
      expect((await auditActions('employee.code.changed')).map((a) => [a.entityId, a.metadata.to])).toEqual([[ids.meera, 'KF-0118']]);
    });

    it('company-wide codes are refused while two entities share a code; switching re-keys every employment', async () => {
      // Imran (TN) is E0001 in his entity's series, like Lakshmi in hers.
      const refused = await api('adminA', 'put', '/org/settings').send({ key: 'employee_code.scope', scopeType: 'tenant', value: 'tenant' }).expect(409);
      expect(refused.body).toMatchObject({ code: 'EMPLOYEE_CODE_CLASHES' });
      expect(refused.body.clashes.map((c: { code: string }) => c.code)).toContain('E0001');
      await api('hrA', 'put', `/people/employees/${ids.imran}/code`).send({ employeeCode: 'KFT-0001', reason: 'TN series' }).expect(200);
      await api('adminA', 'put', '/org/settings').send({ key: 'employee_code.scope', scopeType: 'tenant', value: 'tenant' }).expect(200);
      // Now one series for the company: the TN entity cannot reuse a KFPL code.
      await api('hrA', 'post', '/people/employees').send(join({ givenName: 'Dup', legalEntityId: ids.tn, employeeCode: 'KF-0118', assignment: { ...join({}).assignment, locationId: ids.hsr, departmentId: ids.prod } })).expect(409);
      const keys = await tenantPrisma.forTenant(asA(), (tx) => tx.employment.findMany({ where: { organizationId: org.A.id }, select: { codeScopeKey: true } }));
      expect(new Set(keys.map((k) => k.codeScopeKey))).toEqual(new Set([org.A.id]));
    });

    it('a login is linked with step-up, only to the matching email, never one\'s own, and unlinked without deleting it', async () => {
      const outsider = await tenantPrisma.forTenant(asA(), (tx) => tx.employee.findFirstOrThrow({ where: { id: ids.meera } }));
      await tenantPrisma.forTenant(asA(), (tx) => tx.employee.update({ where: { id: outsider.id }, data: { workEmail: email('outsiderA') } }));
      await api('hrA', 'post', `/people/employees/${ids.meera}/login`).send({ userId: users.outsiderA }).expect(403); // no step-up yet
      await markSteppedUp(tenantPrisma, token.hrA);
      await api('hrA', 'post', `/people/employees/${ids.meera}/login`).send({ userId: users.approverA }).expect(400); // email differs
      await api('hrA', 'post', `/people/employees/${ids.meera}/login`).send({ userId: users.hrA }).expect(403); // own login
      await api('hrA', 'post', `/people/employees/${ids.meera}/login`).send({ userId: users.adminB }).expect(400); // other company
      await api('hrA', 'post', `/people/employees/${ids.meera}/login`).send({ userId: users.outsiderA }).expect(201);
      await api('hrA', 'post', `/people/employees/${ids.meera}/login`).send({ userId: users.outsiderA }).expect(409);
      // The login now sees its own record.
      await api('outsiderA', 'get', `/people/employees/${ids.meera}/person`).expect(200);
      await api('hrA', 'post', `/people/employees/${ids.meera}/login/unlink`).send({ reason: 'Wrong person' }).expect(201);
      await api('outsiderA', 'get', `/people/employees/${ids.meera}/person`).expect(404);
      const roles = (await api('hrA', 'get', `/people/employees/${ids.meera}/person`).expect(200)).body.roles;
      expect(roles.find((r: { roleType: string }) => r.roleType === 'login')).toMatchObject({ endOn: today });
      expect(await tenantPrisma.forTenant(asA(), (tx) => tx.user.findUnique({ where: { id: users.outsiderA } }))).not.toBeNull();
    });
  });

  describe('bulk changes (M01 §3.3, §3.2; YX-SEC-11; R1)', () => {
    const in40 = addDays(today, 40);
    const header = 'employee_code,change_type,effective_date,location,department,designation,manager,annual_ctc,reason';
    const codeOf = async (id: string) => (await tenantPrisma.forTenant(asA(), (tx) => tx.employment.findFirstOrThrow({ where: { employeeId: id } }))).employeeCode;

    it('a dry run checks every row in order and previews it; nothing is kept', async () => {
      const arjun = await codeOf(ids.arjun);
      const csv = [
        header,
        `${arjun},transfer,${in40},MYS,,,,,Team moves to Mysuru`,
        `${arjun},promotion,${in40},,,QA-LEAD,,,`,
        `NOPE-1,transfer,${in40},MYS,,,,,`,
        `${arjun},transfer,${in40},HSR,,,,,`, // another entity's location (YX-ORG-08)
        `${arjun},join,${in40},,,,,,`,
        `${arjun},salary_revision,${in40},,,,,700000,`, // pay needs pay access (R1)
        `${await codeOf(ids.meera)},manager_change,${in40},,,,${await codeOf(ids.meera)},,`, // reports to herself
      ].join('\n');
      const res = (await api('hrA', 'post', '/people/change-batches').send({ csv, reason: 'Q3 reorg', dryRun: true }).expect(201)).body;
      expect(res.batch).toBeNull();
      expect(res.rows.map((r: { line: number; ok: boolean }) => [r.line, r.ok])).toEqual([
        [2, true],
        [3, true],
        [4, false],
        [5, false],
        [6, false],
        [7, false],
        [8, false],
      ]);
      expect(res.rows[0].impact.facts).toEqual(expect.arrayContaining([{ fact: 'Location', from: 'Bengaluru', to: 'Mysuru' }]));
      expect(res.rows[2].error).toMatch(/No current employee with the code NOPE-1/);
      expect(res.rows[3].error).toMatch(/another legal entity/);
      expect(res.rows[4].error).toMatch(/change_type is one of/);
      expect(res.rows[5].error).toMatch(/pay/);
      expect(res.rows[6].error).toMatch(/themselves/);
      expect((await api('hrA', 'get', '/people/change-batches').expect(200)).body).toEqual([]);
      expect((await api('hrA', 'get', `/people/employees/${ids.arjun}/as-of?date=${in40}`).expect(200)).body.assignment.location.name).toBe('Bengaluru');
    });

    it('a file with any bad row saves nothing; bad files and columns are refused whole', async () => {
      const arjun = await codeOf(ids.arjun);
      const bad = await api('hrA', 'post', '/people/change-batches').send({ csv: `${header}\n${arjun},transfer,${in40},MYS,,,,,\nNOPE,transfer,${in40},MYS,,,,,`, reason: 'Reorg' }).expect(400);
      expect(bad.body).toMatchObject({ code: 'BULK_ROWS_INVALID', errors: 1 });
      await api('hrA', 'post', '/people/change-batches').send({ csv: 'employee_code,salary,change_type,effective_date\nx,1,transfer,2026-01-01', reason: 'Reorg' }).expect(400);
      await api('hrA', 'post', '/people/change-batches').send({ csv: 'employee_code,change_type\nx,transfer', reason: 'Reorg' }).expect(400);
      await api('hrA', 'post', '/people/change-batches').send({ csv: `${header}\n"unterminated`, reason: 'Reorg' }).expect(400);
      await api('hrA', 'post', '/people/change-batches').send({ csv: header, reason: 'Reorg' }).expect(400);
      await api('divyaA', 'post', '/people/change-batches').send({ csv: `${header}\n${arjun},transfer,${in40},MYS,,,,,`, reason: 'Reorg' }).expect(403);
      expect((await api('hrA', 'get', '/people/change-batches').expect(200)).body).toEqual([]);
    });

    it('a good file becomes one batch: decided only as a whole, by someone else, all or nothing', async () => {
      const csv = [header, `${await codeOf(ids.arjun)},redesignation,${in40},,,QA-LEAD,,,Lead role`, `${await codeOf(ids.kiran)},transfer,${in40},MYS,,,,,Move with the team`].join('\n');
      const saved = (await api('hrA', 'post', '/people/change-batches').send({ csv, fileName: 'reorg.csv', reason: 'Q3 reorg' }).expect(201)).body;
      expect(saved.batch).toMatchObject({ status: 'pending', rowCount: 2 });
      ids.batch = saved.batch.id;
      const batch = (await api('hrA', 'get', `/people/change-batches/${ids.batch}`).expect(200)).body;
      expect(batch.changes.map((c: { status: string; employeeName: string }) => [c.employeeName, c.status])).toEqual([
        ['Arjun Kulkarni', 'pending'],
        ['Kiran Joshi', 'pending'],
      ]);
      // One decision for the batch: not change by change.
      await markSteppedUp(tenantPrisma, token.approverA);
      await api('approverA', 'post', `/people/changes/${batch.changes[0].id}/approve`).send({}).expect(409);
      await api('hrA', 'put', `/people/changes/${batch.changes[0].id}`).send({ effectiveDate: addDays(in40, 1) }).expect(409);
      // YX-SEC-11: not the requester; step-up needed; not another company.
      await markSteppedUp(tenantPrisma, token.hrA);
      await api('hrA', 'post', `/people/change-batches/${ids.batch}/approve`).send({}).expect(403);
      await api('payrollA', 'post', `/people/change-batches/${ids.batch}/approve`).send({}).expect(403); // no step-up
      await api('adminB', 'get', `/people/change-batches/${ids.batch}`).expect(404);
      await markSteppedUp(tenantPrisma, token.adminB);
      await api('adminB', 'post', `/people/change-batches/${ids.batch}/approve`).send({}).expect(404);
      // All or nothing: an archived designation stops the whole batch, nothing is applied.
      await tenantPrisma.forTenant(asA(), (tx) => tx.designation.update({ where: { id: ids.lead }, data: { archivedAt: new Date() } }));
      const stopped = await api('approverA', 'post', `/people/change-batches/${ids.batch}/approve`).send({}).expect(400);
      expect(stopped.body.message).toMatch(/^Arjun Kulkarni: That designation is archived/);
      expect((await api('hrA', 'get', `/people/change-batches/${ids.batch}`).expect(200)).body.changes.every((c: { status: string }) => c.status === 'pending')).toBe(true);
      expect((await api('hrA', 'get', `/people/employees/${ids.kiran}/as-of?date=${in40}`).expect(200)).body.assignment.location.name).toBe('Bengaluru');
      await tenantPrisma.forTenant(asA(), (tx) => tx.designation.update({ where: { id: ids.lead }, data: { archivedAt: null } }));
      const done = (await api('approverA', 'post', `/people/change-batches/${ids.batch}/approve`).send({ confirmRebase: true }).expect(201)).body;
      expect(done.status).toBe('approved');
      expect(done.changes.every((c: { status: string }) => c.status === 'scheduled')).toBe(true);
      expect((await api('hrA', 'get', `/people/employees/${ids.kiran}/as-of?date=${in40}`).expect(200)).body.assignment.location.name).toBe('Mysuru');
      await api('approverA', 'post', `/people/change-batches/${ids.batch}/approve`).send({}).expect(409);
      expect((await auditActions('employee.change.batch_')).map((a) => a.action)).toEqual(['employee.change.batch_requested', 'employee.change.batch_approved']);
    });

    it('nobody approves a batch about themselves; batches are rejected or cancelled whole; pay stays hidden (R1)', async () => {
      const csv = `employee_code,change_type,effective_date,annual_ctc\n${await codeOf(ids.divya)},salary_revision,${in40},990000`;
      await api('hrA', 'post', '/people/change-batches').send({ csv, reason: 'Pay' }).expect(400); // hrA has no pay
      const saved = (await api('payrollA', 'post', '/people/change-batches').send({ csv, reason: 'Pay review' }).expect(201)).body;
      const seen = (await api('hrA', 'get', `/people/change-batches/${saved.batch.id}`).expect(200)).body;
      expect(seen.touchesPay).toBe(true);
      expect(seen.changes[0].payload.compensation).toBeUndefined();
      await markSteppedUp(tenantPrisma, token.hrA);
      await api('hrA', 'post', `/people/change-batches/${saved.batch.id}/approve`).send({}).expect(403); // approving pay needs pay access
      await api('payrollA', 'post', `/people/change-batches/${saved.batch.id}/reject`).send({ reason: 'Mine' }).expect(403);
      await api('approverA', 'post', `/people/change-batches/${saved.batch.id}/reject`).send({ reason: 'Wait for the cycle' }).expect(201);
      const rejected = (await api('payrollA', 'get', `/people/change-batches/${saved.batch.id}`).expect(200)).body;
      expect(rejected.status).toBe('rejected');
      expect(rejected.changes[0]).toMatchObject({ status: 'rejected', payload: { compensation: { annualCtc: '990000' } } });
      await api('payrollA', 'post', `/people/change-batches/${saved.batch.id}/cancel`).send({ reason: 'Too late' }).expect(409);
    });

    it('reassigns every report of a manager in one batch (M01 §3.2)', async () => {
      const dry = (await api('hrA', 'post', '/people/change-batches/reassign').send({ fromManagerId: ids.divya, toManagerId: ids.lakshmi, effectiveDate: addDays(today, 50), reason: 'Divya moves to projects', dryRun: true }).expect(201)).body;
      expect(dry.rows.map((r: { name: string; ok: boolean }) => [r.name, r.ok]).sort()).toEqual([
        ['Arjun Kulkarni', true],
        ['Kiran Joshi', true],
        ['Ravi', true],
      ]);
      await api('hrA', 'post', '/people/change-batches/reassign').send({ fromManagerId: ids.divya, toManagerId: ids.divya, effectiveDate: addDays(today, 50), reason: 'Same' }).expect(400);
      const saved = (await api('hrA', 'post', '/people/change-batches/reassign').send({ fromManagerId: ids.divya, toManagerId: ids.lakshmi, effectiveDate: addDays(today, 50), reason: 'Divya moves to projects' }).expect(201)).body;
      // Lakshmi cannot approve: a change in it is not about her, but she lacks approval rights; Arjun's own approver can.
      await markSteppedUp(tenantPrisma, token.approverA);
      await api('approverA', 'post', `/people/change-batches/${saved.batch.id}/approve`).send({ confirmRebase: true }).expect(201);
      const team = (await api('lakshmiA', 'get', '/people/team').expect(200)).body;
      expect(team.members.find((m: { id: string }) => m.id === ids.kiran)).toMatchObject({ relation: 'indirect' }); // until the date
      await api('hrA', 'post', `/people/change-batches/${saved.batch.id}/cancel`).send({ reason: 'Late' }).expect(409);
    });
  });
});
