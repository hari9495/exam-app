import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { ROLE_PERMISSIONS } from '../prisma/seed';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { EmployeeHistoryService } from '../src/employee-history/employee-history.service';
import { fyStart } from '../src/employee-history/history-rules';
import { addDays, todayIst } from '../src/org-structure/org-validation';
import { markSteppedUp } from './fixtures/step-up';

// P06 effective-dated history on the P01 employee core, end to end against the real database (forced RLS,
// app role): joins, changes as the only write path, approval by someone else, scheduled and retro changes,
// rebasing, corrections that supersede, as-of / history / segments reads, manager and pay visibility, and
// the daily job.
describe('Employee history (P06; P01 §4.4; P02 YX-SEC-06/09/11; R1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let service: EmployeeHistoryService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const today = todayIst();
  const fy = fyStart(today, 4);
  const joinOld = addDays(fy, -400);
  const joinArjun = addDays(fy, -100);

  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  type Who = 'adminA' | 'adminB' | 'hrA' | 'approverA' | 'payrollA' | 'payApproverA' | 'clerkA' | 'divyaA' | 'arjunA' | 'kavyaA' | 'outsiderA';
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const ids: Record<string, string> = {};
  const asA = () => ({ organizationId: org.A.id, isSuperAdmin: false });
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
    // YX-HIS-12: these people joined before the retro limit (migrated records).
    overrideReason: 'Joined before go-live',
    assignment: { locationId: ids.blr, departmentId: ids.qa, designationId: ids.analyst, gradeId: ids.g2, employmentTypeId: ids.perm, managerEmployeeId: null },
    ...body,
  });
  /** Raise (as `by`) and approve (as `approver`, stepped up) a change; returns the approved change. */
  const approved = async (by: Who, approver: Who, body: Record<string, unknown>, confirmRebase = false) => {
    const raised = await api(by, 'post', '/people/changes').send(body).expect(201);
    await markSteppedUp(tenantPrisma, token[approver]);
    return (await api(approver, 'post', `/people/changes/${raised.body.id}/approve`).send({ confirmRebase }).expect(201)).body;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    service = moduleRef.get(EmployeeHistoryService);

    planId = (await prisma.plan.create({ data: { name: `hist-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Org ${k}`, slug: `hist-${k.toLowerCase()}-${runId}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    // Structure in A: two entities, a site each, shared and entity-only masters, cost centres.
    await tenantPrisma.forTenant(asA(), async (tx) => {
      const o = { organizationId: org.A.id };
      ids.kf = (await tx.legalEntity.create({ data: { ...o, name: 'Kaveri Foods', shortName: 'KFPL', isDefault: true } })).id;
      ids.tn = (await tx.legalEntity.create({ data: { ...o, name: 'Kaveri TN', shortName: 'KFPL-TN' } })).id;
      ids.blr = (await tx.location.create({ data: { ...o, legalEntityId: ids.kf, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      ids.mys = (await tx.location.create({ data: { ...o, legalEntityId: ids.kf, name: 'Mysuru', code: 'MYS', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      ids.hsr = (await tx.location.create({ data: { ...o, legalEntityId: ids.tn, name: 'Hosur', code: 'HSR', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const dept = async (code: string, owner: string | null = null) => {
        const id = randomUUID();
        return (await tx.department.create({ data: { ...o, id, name: code, code, path: `/${id}/`, ownerLegalEntityId: owner } })).id;
      };
      ids.qa = await dept('QA');
      ids.ppl = await dept('PPL');
      ids.prod = await dept('PROD', ids.tn);
      ids.analyst = (await tx.designation.create({ data: { ...o, name: 'Quality Analyst', code: 'QA-AN' } })).id;
      ids.lead = (await tx.designation.create({ data: { ...o, name: 'Quality Lead', code: 'QA-LEAD' } })).id;
      ids.lab = (await tx.designation.create({ data: { ...o, name: 'Lab Analyst', code: 'LAB' } })).id;
      ids.retired = (await tx.designation.create({ data: { ...o, name: 'Old title', code: 'OLD', archivedAt: new Date() } })).id;
      ids.g2 = (await tx.grade.create({ data: { ...o, name: 'G2', code: 'G2', rank: 2 } })).id;
      ids.g3 = (await tx.grade.create({ data: { ...o, name: 'G3', code: 'G3', rank: 3 } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      ids.cc1 = (await tx.costCentre.create({ data: { ...o, legalEntityId: ids.kf, name: 'Engineering', code: 'CC-ENG' } })).id;
      ids.cc2 = (await tx.costCentre.create({ data: { ...o, legalEntityId: ids.kf, name: 'Finance', code: 'CC-FIN' } })).id;
      ids.ccTn = (await tx.costCentre.create({ data: { ...o, legalEntityId: ids.tn, name: 'Plant', code: 'CC-PLT' } })).id;
    });
    ids.bEntity = (await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.legalEntity.create({ data: { organizationId: org.B.id, name: 'B Ltd', shortName: 'BLTD', isDefault: true } }))).id;

    const profile = async (name: string, keys: string[]) =>
      (await tenantPrisma.forTenant(asA(), (tx) => tx.permissionProfile.create({ data: { organizationId: org.A.id, name, permissionsJson: JSON.stringify(keys) } }))).id;
    const hr = await profile('HR Admin', ['employee.profile.view', 'employee.change.manage', 'employee.change.approve', 'employee.change.retro']);
    const approver = await profile('HR Approver', ['employee.profile.view', 'employee.change.approve', 'employee.change.retro', 'employee.change.retro_override']);
    // Founder 28 Oct 2026: job changes (pay included) are approved by HR only; payroll holds no approve key.
    const payroll = await profile('Payroll Admin', ['employee.profile.view', 'employee.change.manage', 'employee.change.retro', 'employee.change.retro_override', 'employee.salary.view', 'employee.salary.manage']);
    const payApprover = await profile('HR Pay Approver', ['employee.profile.view', 'employee.change.approve', 'employee.change.retro', 'employee.change.retro_override', 'employee.salary.view']);
    const clerk = await profile('HR Clerk', ['employee.change.manage']);
    const passwordHash = await argon2.hash(PASSWORD);
    const people: [Who, 'A' | 'B', string, string | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hrA', 'A', 'panel', hr],
      ['approverA', 'A', 'panel', approver],
      ['payrollA', 'A', 'panel', payroll],
      ['payApproverA', 'A', 'panel', payApprover],
      ['clerkA', 'A', 'panel', clerk],
      ['divyaA', 'A', 'panel', null],
      ['arjunA', 'A', 'panel', null],
      ['kavyaA', 'A', 'panel', null],
      ['outsiderA', 'A', 'panel', null],
    ];
    for (const [name, k, role, permissionProfileId] of people) {
      users[name] = (
        await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, (tx) =>
          tx.user.create({ data: { organizationId: org[k].id, email: `${name}-${runId}@hist.test`, passwordHash, role, permissionProfileId } }),
        )
      ).id;
      const res = await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${name}-${runId}@hist.test`, password: PASSWORD }).expect(200);
      token[name] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    const orgIds = [org.A.id, org.B.id];
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.refreshToken.deleteMany({ where: { userId: { in: Object.values(users) } } });
        await tx.session.deleteMany({ where: { userId: { in: Object.values(users) } } });
        await tx.organization.deleteMany({ where: { id: { in: orgIds } } });
        await tx.user.deleteMany({ where: { id: { in: Object.values(users) } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  describe('permissions (P02 YX-SEC-01)', () => {
    it('without an employee grant: no change queue, no hiring, no records; signed out: 401', async () => {
      await api('outsiderA', 'get', '/people/changes').expect(403);
      await api('outsiderA', 'post', '/people/employees').send(join({ givenName: 'X', joinedOn: today })).expect(403);
      await api('outsiderA', 'post', '/people/changes').send({}).expect(403);
      expect((await api('outsiderA', 'get', '/people/employees').expect(200)).body).toEqual([]);
      await request(server()).get('/api/v1/people/employees').expect(401);
      await api('hrA', 'get', '/people/employees/not-a-uuid/as-of').expect(400);
    });
  });

  describe('joining (P01 §4.4; YX-ORG-04/08/15/16; R1)', () => {
    it('HR adds people; codes are generated per legal entity; every id is checked against the employer', async () => {
      // YX-HIS-12: a joining date before the retro limit needs the override (the System Admin here) and a reason.
      await api('hrA', 'post', '/people/employees').send(join({ givenName: 'Early', joinedOn: joinOld })).expect(403);
      await api('adminA', 'post', '/people/employees').send(join({ givenName: 'Early', joinedOn: joinOld, overrideReason: undefined })).expect(400);
      const lakshmi = await api('adminA', 'post', '/people/employees').send(join({ givenName: 'Lakshmi', familyName: 'Venkatesan', joinedOn: joinOld, assignment: { ...join({}).assignment, departmentId: ids.ppl } })).expect(201);
      expect(lakshmi.body.employeeCode).toBe('E0001');
      ids.lakshmi = lakshmi.body.id;
      const divya = await api('adminA', 'post', '/people/employees')
        .send(
          join({
            givenName: 'Divya',
            joinedOn: joinOld,
            userId: users.divyaA,
            workEmail: `divyaA-${runId}@hist.test`,
            employeeCode: 'KF-0057',
            assignment: { ...join({}).assignment, designationId: ids.lead, gradeId: ids.g3, managerEmployeeId: ids.lakshmi, costCentres: [{ costCentreId: ids.cc1, percent: '60' }, { costCentreId: ids.cc2, percent: '40' }] },
          }),
        )
        .expect(201);
      ids.divya = divya.body.id;
      // R1: pay on a join needs pay access.
      await api('hrA', 'post', '/people/employees').send(join({ givenName: 'Arjun', joinedOn: joinArjun, compensation: { annualCtc: '600000' } })).expect(403);
      const arjun = await api('payrollA', 'post', '/people/employees')
        .send(join({ givenName: 'Arjun', familyName: 'Kulkarni', joinedOn: joinArjun, userId: users.arjunA, workEmail: `arjunA-${runId}@hist.test`, assignment: { ...join({}).assignment, managerEmployeeId: ids.divya }, compensation: { annualCtc: '600000' } }))
        .expect(201);
      ids.arjun = arjun.body.id;
      expect(arjun.body.employeeCode).toBe('E0002');
      // YX-SEC-11: the pay given with the hire waits as a salary revision for someone else to approve.
      expect((await api('payrollA', 'get', `/people/changes/${arjun.body.payChangeId}`).expect(200)).body).toMatchObject({ status: 'pending', changeType: 'salary_revision', effectiveDate: joinArjun });
      await markSteppedUp(tenantPrisma, token.payrollA);
      await api('payrollA', 'post', `/people/changes/${arjun.body.payChangeId}/approve`).send({}).expect(403);
      await markSteppedUp(tenantPrisma, token.payApproverA);
      await api('payApproverA', 'post', `/people/changes/${arjun.body.payChangeId}/approve`).send({ confirmRebase: true }).expect(201);
      ids.kavya = (await api('adminA', 'post', '/people/employees').send(join({ givenName: 'Kavya', joinedOn: joinOld, userId: users.kavyaA, workEmail: `kavyaA-${runId}@hist.test`, assignment: { ...join({}).assignment, managerEmployeeId: ids.lakshmi } })).expect(201)).body.id;
      ids.ravi = (await api('adminA', 'post', '/people/employees').send(join({ givenName: 'Ravi', joinedOn: joinOld, assignment: { ...join({}).assignment, managerEmployeeId: ids.kavya } })).expect(201)).body.id;
      // The other entity runs its own code series (YX-ORG-16 default: per legal entity).
      const tn = await api('adminA', 'post', '/people/employees')
        .send(join({ givenName: 'Imran', legalEntityId: ids.tn, joinedOn: joinOld, assignment: { ...join({}).assignment, locationId: ids.hsr, departmentId: ids.prod, managerEmployeeId: ids.divya, costCentres: [{ costCentreId: ids.ccTn, percent: '100' }] } }))
        .expect(201);
      expect(tn.body.employeeCode).toBe('E0001');
      ids.imran = tn.body.id;
      // The entity's own prefix: a bad one is refused; then new codes follow it, numbered within that prefix.
      await api('adminA', 'put', `/org/legal-entities/${ids.tn}`).send({ name: 'Kaveri TN', shortName: 'KFPL-TN', employeeCodePrefix: 'kft;' }).expect(400);
      await api('adminA', 'put', `/org/legal-entities/${ids.tn}`).send({ name: 'Kaveri TN', shortName: 'KFPL-TN', employeeCodePrefix: 'KFT-' }).expect(200);
      const prefixed = await api('adminA', 'post', '/people/employees')
        .send(join({ givenName: 'Selvi', legalEntityId: ids.tn, joinedOn: joinOld, assignment: { ...join({}).assignment, locationId: ids.hsr, departmentId: ids.prod, managerEmployeeId: ids.divya, costCentres: [{ costCentreId: ids.ccTn, percent: '100' }] } }))
        .expect(201);
      expect(prefixed.body.employeeCode).toBe('KFT-0001');
      await api('adminA', 'put', `/org/legal-entities/${ids.tn}`).send({ name: 'Kaveri TN', shortName: 'KFPL-TN', employeeCodePrefix: null }).expect(200);
    });

    it('refuses a duplicate code, ids of another entity or company, archived masters and one login twice', async () => {
      await api('hrA', 'post', '/people/employees').send(join({ givenName: 'Dup', joinedOn: today, employeeCode: 'kf-0057' })).expect(409);
      // YX-ORG-08: the location and cost centres belong to the employer.
      await api('hrA', 'post', '/people/employees').send(join({ givenName: 'X', joinedOn: today, assignment: { ...join({}).assignment, locationId: ids.hsr } })).expect(400);
      await api('hrA', 'post', '/people/employees').send(join({ givenName: 'X', joinedOn: today, assignment: { ...join({}).assignment, costCentres: [{ costCentreId: ids.ccTn, percent: '100' }] } })).expect(400);
      // YX-ORG-15: an entity-only department of the other entity.
      await api('hrA', 'post', '/people/employees').send(join({ givenName: 'X', joinedOn: today, assignment: { ...join({}).assignment, departmentId: ids.prod } })).expect(400);
      // YX-ORG-04: archived masters are not chosen for new assignments.
      await api('hrA', 'post', '/people/employees').send(join({ givenName: 'X', joinedOn: today, assignment: { ...join({}).assignment, designationId: ids.retired } })).expect(400);
      // Another company's entity, or a manager there.
      await api('hrA', 'post', '/people/employees').send(join({ givenName: 'X', joinedOn: today, legalEntityId: ids.bEntity })).expect(400);
      await api('hrA', 'post', '/people/employees').send(join({ givenName: 'X', joinedOn: today, assignment: { ...join({}).assignment, managerEmployeeId: randomUUID() } })).expect(400);
      await api('hrA', 'post', '/people/employees').send(join({ givenName: 'X', joinedOn: today, userId: users.arjunA, workEmail: `arjunA-${runId}@hist.test` })).expect(409);
      // A login gives its holder the person's own view (pay included): never one's own, only the matching email.
      await api('hrA', 'post', '/people/employees').send(join({ givenName: 'X', joinedOn: today, userId: users.hrA, workEmail: `hrA-${runId}@hist.test` })).expect(403);
      await api('hrA', 'post', '/people/employees').send(join({ givenName: 'X', joinedOn: today, userId: users.outsiderA, workEmail: 'someone.else@hist.test' })).expect(400);
      await api('hrA', 'post', '/people/employees').send(join({ givenName: 'X', joinedOn: today, userId: users.outsiderA })).expect(400);
      // YX-ORG-09: the manager must be employed on every day managed.
      await api('adminA', 'post', '/people/employees').send(join({ givenName: 'X', joinedOn: addDays(joinArjun, -30), assignment: { ...join({}).assignment, managerEmployeeId: ids.arjun } })).expect(400);
      await api('hrA', 'post', '/people/employees').send(join({ givenName: 'X', joinedOn: today, assignment: { ...join({}).assignment, costCentres: [{ costCentreId: ids.cc1, percent: '50' }] } })).expect(400);
      await api('hrA', 'post', '/people/employees').send(join({ givenName: 'X', joinedOn: today, isAdmin: true })).expect(400); // not whitelisted
      expect((await auditActions('employee.created')).length).toBe(7); // includes Selvi, hired under the KFT- prefix
    });

    it('as on a date: the facts in force, nothing before joining, pay only with pay access', async () => {
      const hr = (await api('hrA', 'get', `/people/employees/${ids.arjun}/as-of`).expect(200)).body;
      expect(hr).toMatchObject({ asOf: today, assignment: { designation: { name: 'Quality Analyst' }, manager: { id: ids.divya, name: 'Divya' }, location: { state: 'IN-KA', timezone: 'Asia/Kolkata' } }, status: { status: 'confirmed' }, payAccess: false, compensation: null });
      // R1 "Show pay": even with pay access, amounts come only when asked for, and each look is recorded.
      expect((await api('payrollA', 'get', `/people/employees/${ids.arjun}/as-of`).expect(200)).body).toMatchObject({ payAccess: true, compensation: null });
      const pay = (await api('payrollA', 'get', `/people/employees/${ids.arjun}/as-of?pay=true`).expect(200)).body;
      expect(pay).toMatchObject({ payAccess: true, compensation: { currency: 'INR', annualCtc: '600000.00', validFrom: joinArjun } });
      expect((await api('hrA', 'get', `/people/employees/${ids.arjun}/as-of?pay=true`).expect(200)).body).toMatchObject({ payAccess: false, compensation: null });
      const before = (await api('hrA', 'get', `/people/employees/${ids.arjun}/as-of?date=${addDays(joinArjun, -1)}`).expect(200)).body;
      expect(before).toMatchObject({ assignment: null, status: null });
      const divya = (await api('hrA', 'get', `/people/employees/${ids.divya}/as-of`).expect(200)).body;
      expect(divya.assignment.costCentres.map((c: { code: string; percent: string }) => `${c.code} ${c.percent}`).sort()).toEqual(['CC-ENG 60.00', 'CC-FIN 40.00']);
      // YX-SEC-09: someone else's pay viewed is audited; HR without pay access leaves no pay trail.
      expect((await auditActions('employee.pay.viewed')).map((a) => [a.entityId, a.metadata.what])).toEqual([[ids.arjun, 'change'], [ids.arjun, 'change'], [ids.arjun, 'as_of']]);
    });
  });

  describe('changes: requested, approved by someone else, scheduled (P06 §4.3–4.4; YX-SEC-11; YX-HIS-04)', () => {
    const in30 = addDays(today, 30);

    it('a future promotion waits for approval; nobody approves their own change; approval needs step-up', async () => {
      const raised = await api('hrA', 'post', '/people/changes').send({ employeeId: ids.arjun, changeType: 'promotion', effectiveDate: in30, payload: { assignment: { designationId: ids.lead, gradeId: ids.g3 } }, reason: 'Promotion' }).expect(201);
      expect(raised.body).toMatchObject({ status: 'pending', changeType: 'promotion', retro: false, touchesPay: false });
      ids.promotion = raised.body.id;
      await markSteppedUp(tenantPrisma, token.hrA);
      await api('hrA', 'post', `/people/changes/${ids.promotion}/approve`).send({}).expect(403); // YX-SEC-11
      await api('approverA', 'post', `/people/changes/${ids.promotion}/approve`).send({}).expect(403); // no step-up yet
      // Arjun cannot approve a change about himself even with the grant: he lacks it, and the subject rule stands.
      await api('arjunA', 'post', `/people/changes/${ids.promotion}/approve`).send({}).expect(403);
      // Preview first (YX-HIS-11): what moves on the date, nothing stored.
      const preview = (await api('approverA', 'get', `/people/changes/${ids.promotion}/preview`).expect(200)).body;
      expect(preview.facts).toEqual(
        expect.arrayContaining([
          { fact: 'Designation', from: 'Quality Analyst', to: 'Quality Lead' },
          { fact: 'Grade', from: 'G2', to: 'G3' },
        ]),
      );
      expect((await api('hrA', 'get', `/people/employees/${ids.arjun}/as-of?date=${in30}`).expect(200)).body.assignment.designation.name).toBe('Quality Analyst');
      await markSteppedUp(tenantPrisma, token.approverA);
      const ok = await api('approverA', 'post', `/people/changes/${ids.promotion}/approve`).send({}).expect(201);
      expect(ok.body).toMatchObject({ status: 'scheduled', decidedBy: users.approverA });
      await api('approverA', 'post', `/people/changes/${ids.promotion}/approve`).send({}).expect(409);
    });

    it('as on a future date shows the scheduled values; today the old ones (P06 §4.7)', async () => {
      const at = async (date: string) => (await api('hrA', 'get', `/people/employees/${ids.arjun}/as-of?date=${date}`).expect(200)).body.assignment;
      expect((await at(addDays(in30, -1))).designation.name).toBe('Quality Analyst');
      expect(await at(addDays(in30, -1))).toMatchObject({ validFrom: joinArjun, validTo: addDays(in30, -1) });
      expect((await at(in30)).designation.name).toBe('Quality Lead');
      expect((await at(in30)).grade.name).toBe('G3');
      expect((await at(in30)).manager.id).toBe(ids.divya); // untouched fields carry over
    });

    it('a change type touches only its facts; only pay access puts pay on a change (R1)', async () => {
      await api('hrA', 'post', '/people/changes').send({ employeeId: ids.arjun, changeType: 'promotion', effectiveDate: in30, payload: { assignment: { locationId: ids.mys } }, reason: 'Test' }).expect(400);
      await api('hrA', 'post', '/people/changes').send({ employeeId: ids.arjun, changeType: 'salary_revision', effectiveDate: in30, payload: { compensation: { annualCtc: '700000' } }, reason: 'Test' }).expect(403);
      await api('hrA', 'post', '/people/changes').send({ employeeId: ids.arjun, changeType: 'join', effectiveDate: in30, payload: { status: 'confirmed' }, reason: 'Test' }).expect(400);
      await api('hrA', 'post', '/people/changes').send({ employeeId: ids.arjun, changeType: 'transfer', effectiveDate: addDays(joinArjun, -1), payload: { assignment: { locationId: ids.mys } }, reason: 'Test' }).expect(400);
      await api('hrA', 'post', '/people/changes').send({ employeeId: ids.arjun, changeType: 'transfer', effectiveDate: in30, payload: { assignment: { locationId: ids.hsr } }, reason: 'Test' }).expect(400);
      await api('hrA', 'post', '/people/changes').send({ employeeId: ids.arjun, changeType: 'transfer', effectiveDate: in30, payload: { assignment: { locationId: ids.mys }, extra: 1 }, reason: 'Test' }).expect(400);
      await api('adminB', 'post', '/people/changes').send({ employeeId: ids.arjun, changeType: 'transfer', effectiveDate: in30, payload: { assignment: { locationId: ids.mys } }, reason: 'Test' }).expect(404);
    });

    it('pay changes: the approver needs pay access, and those without it never see the amounts (R1)', async () => {
      const raised = await api('payrollA', 'post', '/people/changes').send({ employeeId: ids.arjun, changeType: 'salary_revision', effectiveDate: addDays(today, 60), payload: { compensation: { increasePercent: '10' } }, reason: 'Increment' }).expect(201);
      ids.increment = raised.body.id;
      await markSteppedUp(tenantPrisma, token.approverA);
      await api('approverA', 'post', `/people/changes/${ids.increment}/approve`).send({}).expect(403);
      const seenByHr = (await api('hrA', 'get', `/people/changes/${ids.increment}`).expect(200)).body;
      expect(seenByHr).toMatchObject({ touchesPay: true });
      expect(seenByHr.payload.compensation).toBeUndefined();
      await markSteppedUp(tenantPrisma, token.adminA);
      // The System Admin holds approve but not pay (P02 Q1).
      await api('adminA', 'post', `/people/changes/${ids.increment}/approve`).send({}).expect(403);
    });
  });

  describe('rebasing (YX-HIS-06) and editing / cancelling scheduled changes (Q7)', () => {
    it('a change inserted before a scheduled one recalculates it; approval needs the confirmation', async () => {
      // Payroll approves the +10 % increment (raised by payroll: approved by another pay holder, the admin cannot).
      await tenantPrisma.forTenant(asA(), (tx) => tx.permissionProfile.updateMany({ where: { organizationId: org.A.id, name: 'HR Approver' }, data: { permissionsJson: JSON.stringify(['employee.profile.view', 'employee.change.approve', 'employee.change.retro', 'employee.change.retro_override', 'employee.salary.view']) } }));
      await markSteppedUp(tenantPrisma, token.approverA);
      await api('approverA', 'post', `/people/changes/${ids.increment}/approve`).send({}).expect(201);
      const in60 = addDays(today, 60);
      const ctcOn = async (date: string) => (await api('payrollA', 'get', `/people/employees/${ids.arjun}/as-of?date=${date}&pay=true`).expect(200)).body.compensation.annualCtc;
      expect(await ctcOn(in60)).toBe('660000.00');
      // A market correction before it: the increment keeps its 10 % on the new base.
      const raised = await api('payrollA', 'post', '/people/changes').send({ employeeId: ids.arjun, changeType: 'salary_revision', effectiveDate: addDays(today, 45), payload: { compensation: { annualCtc: '700000' } }, reason: 'Market correction' }).expect(201);
      await markSteppedUp(tenantPrisma, token.approverA);
      const refused = await api('approverA', 'post', `/people/changes/${raised.body.id}/approve`).send({}).expect(409);
      expect(refused.body).toMatchObject({ code: 'REBASE_CONFIRMATION_REQUIRED' });
      expect(refused.body.impact.rebased).toEqual([expect.objectContaining({ changeId: ids.increment, effectiveDate: in60, pay: [{ fact: 'Annual CTC', from: 'INR 660000.00', to: 'INR 770000.00' }] })]);
      expect(await ctcOn(in60)).toBe('660000.00'); // nothing kept
      await api('approverA', 'post', `/people/changes/${raised.body.id}/approve`).send({ confirmRebase: true }).expect(201);
      expect(await ctcOn(in60)).toBe('770000.00');
      expect(await ctcOn(addDays(today, 50))).toBe('700000.00');
      ids.correctionPay = raised.body.id;
      // HR without pay access sees the rebase happened, never the amounts.
      const hrView = (await api('hrA', 'get', `/people/changes/${raised.body.id}`).expect(200)).body;
      expect(hrView.impact.pay).toBe('hidden');
    });

    it('editing a scheduled change\'s date sends it back for approval and withdraws its rows; its approved reasons stay (YX-SEC-11)', async () => {
      const in30 = addDays(today, 30);
      // The approver approved what the record says: rewording an approved change is refused, not saved quietly.
      const reworded = await api('hrA', 'put', `/people/changes/${ids.promotion}`).send({ reason: 'Promotion after the review' }).expect(409);
      expect(reworded.body.message).toMatch(/reasons stay as approved/);
      expect((await api('hrA', 'get', `/people/changes/${ids.promotion}`).expect(200)).body).toMatchObject({ status: 'scheduled', reason: 'Promotion' });
      const moved = await api('hrA', 'put', `/people/changes/${ids.promotion}`).send({ effectiveDate: addDays(today, 40) }).expect(200);
      expect(moved.body).toMatchObject({ status: 'pending', effectiveDate: addDays(today, 40), decidedBy: null });
      expect((await api('hrA', 'get', `/people/employees/${ids.arjun}/as-of?date=${addDays(today, 41)}`).expect(200)).body.assignment.designation.name).toBe('Quality Analyst');
      await markSteppedUp(tenantPrisma, token.approverA);
      await api('approverA', 'post', `/people/changes/${ids.promotion}/approve`).send({ confirmRebase: true }).expect(201);
      expect((await api('hrA', 'get', `/people/employees/${ids.arjun}/as-of?date=${addDays(today, 41)}`).expect(200)).body.assignment.designation.name).toBe('Quality Lead');
      expect((await api('hrA', 'get', `/people/employees/${ids.arjun}/as-of?date=${in30}`).expect(200)).body.assignment.designation.name).toBe('Quality Analyst');
      // Pay on a change is only edited with pay access.
      await api('hrA', 'put', `/people/changes/${ids.increment}`).send({ effectiveDate: addDays(today, 61) }).expect(403);
      // YX-SEC-11: whoever rewrites a change has made it, so they cannot approve it.
      const raised = await api('payrollA', 'post', '/people/changes').send({ employeeId: ids.ravi, changeType: 'redesignation', effectiveDate: addDays(today, 15), payload: { assignment: { designationId: ids.lab } }, reason: 'Lab move' }).expect(201);
      await api('hrA', 'put', `/people/changes/${raised.body.id}`).send({ payload: { assignment: { designationId: ids.lead } } }).expect(200);
      await markSteppedUp(tenantPrisma, token.hrA);
      await api('hrA', 'post', `/people/changes/${raised.body.id}/approve`).send({}).expect(403);
      await api('hrA', 'post', `/people/changes/${raised.body.id}/cancel`).send({ reason: 'Not needed' }).expect(201);
    });

    it('cancelling: needs a reason; a scheduled one is withdrawn; an effective one cannot be cancelled', async () => {
      const raised = await api('hrA', 'post', '/people/changes').send({ employeeId: ids.arjun, changeType: 'transfer', effectiveDate: addDays(today, 90), payload: { assignment: { locationId: ids.mys } }, reason: 'Mysuru lab' }).expect(201);
      await markSteppedUp(tenantPrisma, token.approverA);
      await api('approverA', 'post', `/people/changes/${raised.body.id}/approve`).send({}).expect(201);
      expect((await api('hrA', 'get', `/people/employees/${ids.arjun}/as-of?date=${addDays(today, 90)}`).expect(200)).body.assignment.location.name).toBe('Mysuru');
      await api('hrA', 'post', `/people/changes/${raised.body.id}/cancel`).send({}).expect(400);
      const cancelled = await api('hrA', 'post', `/people/changes/${raised.body.id}/cancel`).send({ reason: 'Lab move postponed' }).expect(201);
      expect(cancelled.body.status).toBe('cancelled');
      expect((await api('hrA', 'get', `/people/employees/${ids.arjun}/as-of?date=${addDays(today, 90)}`).expect(200)).body.assignment.location.name).toBe('Bengaluru');
      await api('hrA', 'put', `/people/changes/${raised.body.id}`).send({ reason: 'again' }).expect(409);
      const joinChange = (await api('hrA', 'get', `/people/changes?employeeId=${ids.arjun}&status=effective`).expect(200)).body[0];
      await api('hrA', 'post', `/people/changes/${joinChange.id}/cancel`).send({ reason: 'nope nope' }).expect(409);
      expect((await auditActions('employee.change.cancelled')).map((a) => a.metadata.reason)).toEqual(['Not needed', 'Lab move postponed']);
    });

    it('rejecting: by someone else, with a reason; a pending change only', async () => {
      const raised = await api('hrA', 'post', '/people/changes').send({ employeeId: ids.kavya, changeType: 'redesignation', effectiveDate: addDays(today, 10), payload: { assignment: { designationId: ids.lab } }, reason: 'Lab' }).expect(201);
      await api('hrA', 'post', `/people/changes/${raised.body.id}/reject`).send({ reason: 'own' }).expect(403);
      const rejected = await api('approverA', 'post', `/people/changes/${raised.body.id}/reject`).send({ reason: 'Not this year' }).expect(201);
      expect(rejected.body).toMatchObject({ status: 'rejected', decisionNote: 'Not this year' });
      await markSteppedUp(tenantPrisma, token.approverA);
      await api('approverA', 'post', `/people/changes/${raised.body.id}/approve`).send({}).expect(409);
    });
  });

  describe('past-dated changes and corrections (YX-HIS-07, YX-HIS-12, P06 §4.5, Q1)', () => {
    let beforeCorrection: string;

    it('tier 1: a past date inside the retro limit needs employee.change.retro', async () => {
      const body = { employeeId: ids.kavya, changeType: 'correction', effectiveDate: fy, payload: { assignment: { designationId: ids.lab } }, reason: 'Joining record was wrong' };
      await api('clerkA', 'post', '/people/changes').send(body).expect(403);
      beforeCorrection = new Date().toISOString();
      await new Promise((r) => setTimeout(r, 20));
      const raised = await api('hrA', 'post', '/people/changes').send(body).expect(201);
      expect(raised.body.retro).toBe(true);
      await markSteppedUp(tenantPrisma, token.approverA);
      const ok = await api('approverA', 'post', `/people/changes/${raised.body.id}/approve`).send({}).expect(201);
      expect(ok.body.status).toBe('effective');
      expect(ok.body.impact.retro).toEqual({ from: fy, months: expect.arrayContaining([fy.slice(0, 7), today.slice(0, 7)]) });
      ids.correction = raised.body.id;
      // The downstream signal for payroll arrears / recoveries (Q4).
      expect((await auditActions('employee.change.retro_applied')).map((a) => a.metadata.changeId)).toContain(ids.correction);
    });

    it('a correction supersedes, never deletes: the old belief stays queryable with who and why (Q1)', async () => {
      const now = (await api('hrA', 'get', `/people/employees/${ids.kavya}/as-of?date=${fy}`).expect(200)).body;
      expect(now.assignment.designation.name).toBe('Lab Analyst');
      const believed = (await api('hrA', 'get', `/people/employees/${ids.kavya}/as-of?date=${fy}&recordedAt=${encodeURIComponent(beforeCorrection)}`).expect(200)).body;
      expect(believed.assignment.designation.name).toBe('Quality Analyst');
      const history = (await api('hrA', 'get', `/people/employees/${ids.kavya}/history`).expect(200)).body;
      const superseded = history.assignment.filter((r: { supersededAt: string | null }) => r.supersededAt);
      expect(superseded).toEqual([expect.objectContaining({ validFrom: joinOld, validTo: null, designation: expect.objectContaining({ name: 'Quality Analyst' }), supersededBy: { changeId: ids.correction, type: 'correction', reason: 'Joining record was wrong' } })]);
      expect(history.assignment.filter((r: { supersededAt: string | null }) => !r.supersededAt).map((r: { validFrom: string; validTo: string | null; designation: { name: string } }) => [r.validFrom, r.validTo, r.designation.name])).toEqual([
        [joinOld, addDays(fy, -1), 'Quality Analyst'],
        [fy, null, 'Lab Analyst'],
      ]);
      expect(history.changes.find((c: { id: string }) => c.id === ids.correction)).toMatchObject({ retro: true, changeType: 'correction' });
    });

    it('tier 3: before the retro limit needs the override permission and a reason, for raising and approving', async () => {
      const early = addDays(fy, -10);
      const body = { employeeId: ids.kavya, changeType: 'correction', effectiveDate: early, payload: { status: 'confirmed' }, reason: 'Confirmed earlier' };
      await api('hrA', 'post', '/people/changes').send(body).expect(403);
      await api('adminA', 'post', '/people/changes').send(body).expect(400);
      const raised = await api('adminA', 'post', '/people/changes').send({ ...body, overrideReason: 'Board approved backdating' }).expect(201);
      await markSteppedUp(tenantPrisma, token.hrA);
      await api('hrA', 'post', `/people/changes/${raised.body.id}/approve`).send({}).expect(403);
      await markSteppedUp(tenantPrisma, token.approverA);
      await api('approverA', 'post', `/people/changes/${raised.body.id}/approve`).send({ confirmRebase: true }).expect(201);
    });

    it('the company may widen the limit to the previous financial year (setting employee_change.retro_limit)', async () => {
      const early = addDays(fy, -20);
      const body = { employeeId: ids.ravi, changeType: 'redesignation', effectiveDate: early, payload: { assignment: { designationId: ids.lab } }, reason: 'Backdated title' };
      await api('hrA', 'post', '/people/changes').send(body).expect(403);
      await api('adminA', 'put', '/org/settings').send({ key: 'employee_change.retro_limit', scopeType: 'tenant', value: 'previous_fy' }).expect(200);
      await api('hrA', 'post', '/people/changes').send(body).expect(201);
      await api('adminA', 'put', '/org/settings').send({ key: 'employee_change.retro_limit', scopeType: 'tenant', value: 'current_fy' }).expect(200);
    });
  });

  describe('reporting lines and continuity (YX-ORG-07, YX-ORG-09, YX-HIS-02/03)', () => {
    it('a reporting loop is refused, at any date', async () => {
      const raised = await api('hrA', 'post', '/people/changes').send({ employeeId: ids.divya, changeType: 'manager_change', effectiveDate: addDays(today, 5), payload: { assignment: { managerEmployeeId: ids.arjun } }, reason: 'Loop' }).expect(201);
      await markSteppedUp(tenantPrisma, token.approverA);
      const res = await api('approverA', 'post', `/people/changes/${raised.body.id}/approve`).send({ confirmRebase: true }).expect(400);
      expect(res.body.message).toMatch(/reporting loop/);
      await api('hrA', 'post', '/people/changes').send({ employeeId: ids.divya, changeType: 'manager_change', effectiveDate: addDays(today, 5), payload: { assignment: { managerEmployeeId: ids.divya } }, reason: 'Self' }).expect(400);
    });

    it('current rows never overlap and cover every day from joining, after all of the above', async () => {
      const rows = await tenantPrisma.forTenant(asA(), (tx) =>
        tx.$queryRaw<{ overlaps: bigint; broken: bigint }[]>`
          SELECT
            (SELECT count(*) FROM employee_assignments a JOIN employee_assignments b ON a.employment_id = b.employment_id AND a.id < b.id
               AND a.superseded_at IS NULL AND b.superseded_at IS NULL
               AND daterange(a.valid_from, a.valid_to, '[]') && daterange(b.valid_from, b.valid_to, '[]')) AS overlaps,
            (SELECT count(*) FROM employments e WHERE (SELECT range_agg(daterange(a.valid_from, a.valid_to, '[]'))
               FROM employee_assignments a WHERE a.employment_id = e.id AND a.superseded_at IS NULL) <> datemultirange(daterange(e.joined_on, NULL, '[]'))) AS broken`,
      );
      expect(rows).toEqual([{ overlaps: BigInt(0), broken: BigInt(0) }]);
    });
  });

  describe('who sees what (P02 §4.3, YX-SEC-06, YX-HIS-10; R1)', () => {
    it('the person sees their own record and pay; their manager the record without pay; others nothing', async () => {
      const self = (await api('arjunA', 'get', `/people/employees/${ids.arjun}/as-of?pay=true`).expect(200)).body;
      expect(self).toMatchObject({ payAccess: true, compensation: { annualCtc: '600000.00' } });
      // The person sees approved changes only; requests being decided are HR's business.
      await api('hrA', 'post', '/people/changes').send({ employeeId: ids.arjun, changeType: 'redesignation', effectiveDate: addDays(today, 100), payload: { assignment: { designationId: ids.lab } }, reason: 'Pending idea' }).expect(201);
      const own = (await api('arjunA', 'get', `/people/employees/${ids.arjun}/history`).expect(200)).body;
      expect(own.changes.every((c: { status: string; impact: unknown }) => (c.status === 'effective' || c.status === 'scheduled') && c.impact === null)).toBe(true);
      expect((await api('hrA', 'get', `/people/employees/${ids.arjun}/history`).expect(200)).body.changes.some((c: { status: string }) => c.status === 'pending')).toBe(true);
      const mgr = (await api('divyaA', 'get', `/people/employees/${ids.arjun}/as-of?pay=true`).expect(200)).body;
      expect(mgr).toMatchObject({ payAccess: false, compensation: null, assignment: { designation: { name: 'Quality Analyst' } } });
      // Lakshmi's subtree includes Arjun through Divya, but Lakshmi has no login here; Kavya manages Ravi, not Arjun.
      await api('kavyaA', 'get', `/people/employees/${ids.arjun}/as-of`).expect(404);
      await api('kavyaA', 'get', `/people/employees/${ids.ravi}/as-of`).expect(200);
      await api('outsiderA', 'get', `/people/employees/${ids.arjun}/as-of`).expect(404);
      await api('outsiderA', 'get', `/people/employees/${ids.arjun}/history`).expect(404);
      // Another company: not found, whoever asks.
      await api('adminB', 'get', `/people/employees/${ids.arjun}/as-of`).expect(404);
      expect((await api('adminB', 'get', '/people/employees').expect(200)).body).toEqual([]);
      // Segments are for HR / payroll, not managers.
      await api('divyaA', 'get', `/people/employees/${ids.arjun}/segments?from=${today}&to=${addDays(today, 30)}`).expect(403);
    });

    it('a manager sees the person only for the period they managed them (YX-SEC-06)', async () => {
      const move = addDays(today, 20);
      const raised = await api('hrA', 'post', '/people/changes').send({ employeeId: ids.arjun, changeType: 'manager_change', effectiveDate: move, payload: { assignment: { managerEmployeeId: ids.kavya } }, reason: 'Team change' }).expect(201);
      await markSteppedUp(tenantPrisma, token.approverA);
      await api('approverA', 'post', `/people/changes/${raised.body.id}/approve`).send({ confirmRebase: true }).expect(201);
      await api('divyaA', 'get', `/people/employees/${ids.arjun}/as-of?date=${addDays(move, -1)}`).expect(200);
      await api('divyaA', 'get', `/people/employees/${ids.arjun}/as-of?date=${move}`).expect(404);
      // The incoming manager sees nothing until the relation starts, not even the planned assignment (YX-SEC-06).
      await api('kavyaA', 'get', `/people/employees/${ids.arjun}/as-of?date=${move}`).expect(404);
      await api('kavyaA', 'get', `/people/employees/${ids.arjun}/as-of?date=${today}`).expect(404);
      await api('kavyaA', 'get', `/people/employees/${ids.arjun}/history`).expect(404);
      // The outgoing manager's timeline: current rows and changes inside their period only, never pay.
      const timeline = (await api('divyaA', 'get', `/people/employees/${ids.arjun}/history?pay=true`).expect(200)).body;
      expect(timeline.compensation).toEqual([]);
      expect(timeline.assignment.every((r: { supersededAt: string | null; validFrom: string }) => !r.supersededAt && r.validFrom < move)).toBe(true);
      expect(timeline.changes.every((c: { effectiveDate: string }) => c.effectiveDate < move)).toBe(true);
      expect(timeline.changes.some((c: { touchesPay: boolean; payload: { compensation?: unknown } }) => c.touchesPay && c.payload.compensation !== undefined)).toBe(false);
    });

    it('the people list: HR everyone, a manager themselves and their current team', async () => {
      const names = (who: Who) => api(who, 'get', '/people/employees').expect(200).then((r) => r.body.map((p: { name: string }) => p.name).sort());
      expect(await names('hrA')).toEqual(['Arjun Kulkarni', 'Divya', 'Imran', 'Kavya', 'Lakshmi Venkatesan', 'Ravi', 'Selvi']);
      expect(await names('divyaA')).toEqual(['Arjun Kulkarni', 'Divya', 'Imran', 'Selvi']);
      expect(await names('kavyaA')).toEqual(['Kavya', 'Ravi']);
      expect(await names('arjunA')).toEqual(['Arjun Kulkarni']);
    });
  });

  describe('segments (P06 §4.6) and settings by employee (YX-ORG-18)', () => {
    it('periods split wherever any fact changes; pay only with pay access', async () => {
      const from = addDays(today, 40);
      const to = addDays(today, 70);
      const pay = (await api('payrollA', 'get', `/people/employees/${ids.arjun}/segments?from=${from}&to=${to}`).expect(200)).body.segments;
      expect(pay.map((s: { from: string; to: string; assignment: { designation: { name: string } }; compensation: { annualCtc: string } }) => [s.from, s.to, s.assignment.designation.name, s.compensation.annualCtc])).toEqual([
        [from, addDays(today, 44), 'Quality Lead', '600000.00'],
        [addDays(today, 45), addDays(today, 59), 'Quality Lead', '700000.00'],
        [addDays(today, 60), to, 'Quality Lead', '770000.00'],
      ]);
      const noPay = (await api('hrA', 'get', `/people/employees/${ids.arjun}/segments?from=${from}&to=${to}`).expect(200)).body;
      expect(noPay.payAccess).toBe(false);
      expect(noPay.segments.map((s: { from: string }) => s.from)).toEqual([from]);
      expect(noPay.segments[0].compensation).toBeNull();
      await api('hrA', 'get', `/people/employees/${ids.arjun}/segments?from=${to}&to=${from}`).expect(400);
    });

    it('a setting resolves through the assignment in force on the date asked', async () => {
      await api('adminA', 'put', '/org/settings').send({ key: 'attendance.mode', scopeType: 'location', scopeId: ids.mys, value: 'timesheet', validFrom: today }).expect(200);
      const r = (await api('adminA', 'get', `/org/settings/resolve?key=attendance.mode&asOf=${today}&employeeId=${ids.arjun}`).expect(200)).body;
      expect(r).toMatchObject({ value: 'punch', source: { scopeType: 'default' } });
      await api('adminA', 'get', `/org/settings/resolve?key=attendance.mode&asOf=${addDays(joinArjun, -1)}&employeeId=${ids.arjun}`).expect(404);
      await api('adminA', 'get', `/org/settings/resolve?key=attendance.mode&asOf=${today}&employeeId=${ids.arjun}&gradeId=${ids.g2}`).expect(400);
    });
  });

  describe('the daily job (YX-HIS-04 / YX-HIS-05)', () => {
    it('applies a scheduled change at 00:00 in the location time zone, once', async () => {
      const tomorrow = addDays(today, 1);
      const raised = await api('hrA', 'post', '/people/changes').send({ employeeId: ids.ravi, changeType: 'confirmation', effectiveDate: tomorrow, payload: { status: 'confirmed' }, reason: 'Probation done' }).expect(201);
      await markSteppedUp(tenantPrisma, token.approverA);
      expect((await api('approverA', 'post', `/people/changes/${raised.body.id}/approve`).send({}).expect(201)).body.status).toBe('scheduled');
      // 23:30 IST the day before: not yet. 00:30 IST on the day: applied.
      const ist = (date: string, time: string) => new Date(`${date}T${time}+05:30`);
      await service.applyDue(ist(today, '23:30:00'));
      expect((await api('hrA', 'get', `/people/changes/${raised.body.id}`).expect(200)).body.status).toBe('scheduled');
      expect(await service.applyDue(ist(tomorrow, '00:30:00'))).toBeGreaterThanOrEqual(1);
      expect((await api('hrA', 'get', `/people/changes/${raised.body.id}`).expect(200)).body).toMatchObject({ status: 'effective' });
      await service.applyDue(ist(tomorrow, '00:45:00'));
      expect((await auditActions('employee.change.effective')).filter((a) => a.metadata.changeId === raised.body.id)).toHaveLength(1);
    });
  });

  describe('G1: hours a week and service dates (gap pass C1, C3)', () => {
    it('a part-time join shows its FTE against the normal week; empty hours are full-time', async () => {
      ids.meera = (await api('hrA', 'post', '/people/employees').send(join({ givenName: 'Meera', joinedOn: today, overrideReason: undefined, assignment: { ...join({}).assignment, hoursPerWeek: '24' } })).expect(201)).body.id;
      const meera = (await api('hrA', 'get', `/people/employees/${ids.meera}/as-of`).expect(200)).body.assignment;
      // India pack: a 48-hour normal week (Factories Act s.51), until the company sets its own.
      expect(meera).toMatchObject({ hoursPerWeek: '24.0', normalWeekHours: '48', ftePercent: '50.00' });
      expect((await api('hrA', 'get', `/people/employees/${ids.lakshmi}/as-of`).expect(200)).body.assignment).toMatchObject({ hoursPerWeek: null, ftePercent: '100.00' });
      // More than a full-time week, or not in half hours: refused.
      await api('hrA', 'post', '/people/employees').send(join({ givenName: 'Over', joinedOn: today, overrideReason: undefined, assignment: { ...join({}).assignment, hoursPerWeek: '50' } })).expect(400);
      await api('hrA', 'post', '/people/employees').send(join({ givenName: 'Odd', joinedOn: today, overrideReason: undefined, assignment: { ...join({}).assignment, hoursPerWeek: '20.25' } })).expect(400);
      // The company's own normal week wins over the pack, per location.
      const set = (await api('adminA', 'put', '/org/settings').send({ key: 'work.normal_week_hours', scopeType: 'location', scopeId: ids.blr, value: '40' }).expect(200)).body;
      expect((await api('hrA', 'get', `/people/employees/${ids.meera}/as-of`).expect(200)).body.assignment).toMatchObject({ normalWeekHours: '40', ftePercent: '60.00' });
      await api('adminA', 'delete', `/org/settings/${set.id}`).expect(204);
    });

    it('hours change by "employment type or hours", dated like every job fact; a transfer cannot carry them', async () => {
      const on = addDays(today, 10);
      await approved('hrA', 'approverA', { employeeId: ids.meera, changeType: 'employment_type_change', effectiveDate: on, payload: { assignment: { hoursPerWeek: '36' } }, reason: 'More hours' });
      expect((await api('hrA', 'get', `/people/employees/${ids.meera}/as-of?date=${on}`).expect(200)).body.assignment).toMatchObject({ hoursPerWeek: '36.0', ftePercent: '75.00' });
      expect((await api('hrA', 'get', `/people/employees/${ids.meera}/as-of`).expect(200)).body.assignment.hoursPerWeek).toBe('24.0');
      await api('hrA', 'post', '/people/changes').send({ employeeId: ids.meera, changeType: 'transfer', effectiveDate: on, payload: { assignment: { hoursPerWeek: '20' } }, reason: 'x' }).expect(400);
    });

    it('service dates: read from the employment; HR sets continuous service with a reason, audited', async () => {
      const read = (who: Who, id: string) => api(who, 'get', `/people/employees/${id}/service-dates`);
      expect((await read('hrA', ids.lakshmi).expect(200)).body).toEqual({ companyStart: joinOld, employerStart: joinOld, continuousServiceFrom: joinOld, source: 'joining', reason: null });
      const earlier = addDays(joinOld, -365);
      await api('clerkA', 'put', `/people/employees/${ids.lakshmi}/service-dates`).send({ continuousServiceFrom: earlier, reason: 'x' }).expect(400);
      await api('hrA', 'put', `/people/employees/${ids.lakshmi}/service-dates`).send({ continuousServiceFrom: addDays(joinOld, 1), reason: 'Typo' }).expect(400);
      expect((await api('hrA', 'put', `/people/employees/${ids.lakshmi}/service-dates`).send({ continuousServiceFrom: earlier, reason: 'Acquired from Kaveri Agro' }).expect(200)).body).toMatchObject({ continuousServiceFrom: earlier, source: 'hr', companyStart: joinOld });
      const log = (await auditActions('employee.service_dates.changed')).at(-1);
      expect(log).toMatchObject({ entityId: ids.lakshmi, metadata: { from: joinOld, to: earlier, reason: 'Acquired from Kaveri Agro' } });
      // The person and their managers see the dates; the reason is HR's.
      expect((await read('kavyaA', ids.kavya).expect(200)).body.reason).toBeNull();
      // Managers and the person never change them; clearing goes back to the rule.
      await api('divyaA', 'put', `/people/employees/${ids.arjun}/service-dates`).send({ continuousServiceFrom: null, reason: 'Mine' }).expect(403);
      expect((await api('hrA', 'put', `/people/employees/${ids.lakshmi}/service-dates`).send({ continuousServiceFrom: null, reason: 'Undo' }).expect(200)).body).toMatchObject({ continuousServiceFrom: joinOld, source: 'joining' });
      await read('outsiderA', ids.lakshmi).expect(404);
    });
  });

  describe('PPL-04 change action: required fields, the approval route, drafts, the transfer impact', () => {
    const in20 = addDays(today, 20);
    beforeAll(async () => {
      // Approvers are shown by name (the users here had none).
      await tenantPrisma.forTenant(asA(), async (tx) => {
        // The HR Approver without pay again (an earlier test granted it), so the pay route differs.
        await tx.permissionProfile.updateMany({ where: { organizationId: org.A.id, name: 'HR Approver' }, data: { permissionsJson: JSON.stringify(['employee.profile.view', 'employee.change.approve', 'employee.change.retro', 'employee.change.retro_override']) } });
        for (const [who, name] of [['approverA', 'Asha Approver'], ['payApproverA', 'Priya Payapprover'], ['payrollA', 'Pavan Payroll'], ['hrA', 'Hema HR']] as const) await tx.user.update({ where: { id: users[who] }, data: { name } });
        ids.maa = (await tx.location.create({ data: { organizationId: org.A.id, legalEntityId: ids.kf, name: 'Chennai', code: 'MAA', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata', geoLat: '12.98', geoLng: '80.24', geoRadiusM: 200 } })).id;
        await tx.holidayCalendar.create({ data: { organizationId: org.A.id, name: 'Karnataka 2026', locationId: ids.blr } });
        await tx.holidayCalendar.create({ data: { organizationId: org.A.id, name: 'Tamil Nadu 2026', locationId: ids.maa } });
      });
      ids.nisha = (await api('hrA', 'post', '/people/employees').send(join({ givenName: 'Nisha', joinedOn: today, overrideReason: undefined })).expect(201)).body.id;
    });
    const change = (extra: Record<string, unknown>) => ({ employeeId: ids.nisha, changeType: 'transfer', effectiveDate: in20, payload: { assignment: { locationId: ids.maa } }, reason: 'Chennai accounts', ...extra });

    it('a transfer needs a new location or department, a promotion a new designation or grade (not the ones already in force)', async () => {
      const no = async (body: Record<string, unknown>, msg: RegExp) => expect((await api('hrA', 'post', '/people/changes').send(change(body)).expect(400)).body.message).toMatch(msg);
      await no({ payload: { assignment: { dottedLineManagerIds: [] } } }, /transfer needs a new location or department/);
      await no({ payload: { assignment: { locationId: ids.blr } } }, /needs a new location: that is the one in force/);
      await no({ changeType: 'promotion', payload: { assignment: { skillClass: 'skilled' } } }, /promotion needs a new designation or grade/);
      await no({ changeType: 'promotion', payload: { assignment: { designationId: ids.analyst, gradeId: ids.g2 } } }, /new designation or grade: that is the one in force/);
      // The preview checks the same.
      await api('hrA', 'post', '/people/changes/preview').send(change({ payload: { assignment: { dottedLineManagerIds: [] } } })).expect(400);
    });

    it("the company's promotion rule (promotion.must_change) per entity: the form reads it, the server enforces it", async () => {
      const rules = () => api('hrA', 'get', '/people/changes/rules').expect(200).then((r) => r.body.promotionMustChange[ids.kf]);
      expect(await rules()).toBe('either');
      const set = (await api('adminA', 'put', '/org/settings').send({ key: 'promotion.must_change', scopeType: 'legal_entity', scopeId: ids.kf, value: 'both' }).expect(200)).body;
      try {
        expect(await rules()).toBe('both');
        const promo = (assignment: Record<string, string>) => change({ changeType: 'promotion', payload: { assignment } });
        expect((await api('hrA', 'post', '/people/changes').send(promo({ designationId: ids.lead })).expect(400)).body.message).toMatch(/rule: a promotion needs a new grade \(both change\)/);
        expect((await api('hrA', 'post', '/people/changes/preview').send(promo({ gradeId: ids.g3 })).expect(400)).body.message).toMatch(/needs a new designation/);
        await api('hrA', 'post', '/people/changes/preview').send(promo({ designationId: ids.lead, gradeId: ids.g3 })).expect(201);
        await api('outsiderA', 'get', '/people/changes/rules').expect(403);
      } finally {
        await api('adminA', 'delete', `/org/settings/${set.id}`).expect(204);
      }
    });

    it('a promotion that lowers pay is warned about in the preview (not refused); a raise is not; without pay access no warning', async () => {
      const joined = (await api('payrollA', 'post', '/people/employees').send(join({ givenName: 'Ravi', joinedOn: today, overrideReason: undefined, compensation: { annualCtc: '600000' } })).expect(201)).body;
      const ravi = joined.id;
      await markSteppedUp(tenantPrisma, token.payApproverA);
      await api('payApproverA', 'post', `/people/changes/${joined.payChangeId}/approve`).send({}).expect(201);
      const promo = (annualCtc: string) => ({ employeeId: ravi, changeType: 'promotion', effectiveDate: in20, payload: { assignment: { designationId: ids.lead }, compensation: { annualCtc } }, reason: 'Team lead' });
      const lower = (await api('payrollA', 'post', '/people/changes/preview').send(promo('550000')).expect(201)).body.impact;
      expect(lower.warnings).toEqual(['This promotion lowers the annual CTC. Check the new pay before you send it.']);
      expect((await api('payrollA', 'post', '/people/changes/preview').send(promo('700000')).expect(201)).body.impact.warnings).toEqual([]);
      // Without pay on the change (HR without pay access): the pay stays, nothing to warn about.
      expect((await api('hrA', 'post', '/people/changes/preview').send({ ...promo('1'), payload: { assignment: { designationId: ids.lead } } }).expect(201)).body.impact.warnings).toEqual([]);
      // Still allowed: sent for approval as usual.
      const sent = (await api('payrollA', 'post', '/people/changes').send(promo('550000')).expect(201)).body;
      await api('payrollA', 'post', `/people/changes/${sent.id}/cancel`).send({ reason: 'Test done' }).expect(201);
    });

    it('the transfer impact lists what the new location carries: holidays, PT state with its slab, LWF, geofence', async () => {
      const { impact } = (await api('hrA', 'post', '/people/changes/preview').send(change({})).expect(201)).body;
      expect(impact.facts).toEqual(
        expect.arrayContaining([
          { fact: 'Location', from: 'Bengaluru', to: 'Chennai' },
          { fact: 'Holiday calendar', from: 'Karnataka 2026', to: 'Tamil Nadu 2026' },
          { fact: 'Professional tax state', from: 'Karnataka (monthly slab)', to: 'Tamil Nadu (half-yearly slab)' },
          { fact: 'Labour welfare fund', from: 'Karnataka', to: 'Tamil Nadu' },
          { fact: 'Geofence', from: 'No geofence', to: 'Chennai, 200 m' },
        ]),
      );
      // Within the same state only what really moves: no PT or LWF row.
      const mys = (await api('hrA', 'post', '/people/changes/preview').send(change({ payload: { assignment: { locationId: ids.mys } } })).expect(201)).body.impact.facts.map((f: { fact: string }) => f.fact);
      expect(mys).not.toContain('Professional tax state');
      expect(mys).not.toContain('Labour welfare fund');
    });

    it('the route names who decides, never the raiser; with pay only those who see pay; a waiting change says who it waits for', async () => {
      const route = (who: Who, q: string) => api(who, 'get', `/people/changes/route?employeeId=${ids.nisha}${q}`);
      expect((await route('hrA', '').expect(200)).body.approvers).toEqual(['Asha Approver', 'Priya Payapprover']);
      expect((await route('hrA', '&pay=true').expect(200)).body.approvers).toEqual(['Priya Payapprover']);
      await route('outsiderA', '').expect(403);
      await api('adminB', 'get', `/people/changes/route?employeeId=${ids.nisha}`).expect(404);
      const raised = (await api('hrA', 'post', '/people/changes').send(change({})).expect(201)).body;
      const row = (who: Who) => api(who, 'get', '/people/changes?status=pending').expect(200).then((r) => r.body.find((x: { id: string }) => x.id === raised.id));
      expect(await row('hrA')).toMatchObject({ waitingFor: ['Asha Approver', 'Priya Payapprover'], requestedByName: 'Hema HR', newValues: ['Chennai'] });
      expect((await row('approverA')).waitingFor).toEqual(['you', 'Priya Payapprover']);
      await api('hrA', 'post', `/people/changes/${raised.id}/cancel`).send({ reason: 'Test done' }).expect(201);
    });

    it('founder 28 Oct 2026: job changes are approved by HR only: payroll and the System Admin are refused and never named', async () => {
      for (const t of ['payroll_admin', 'payroll_approver']) expect(ROLE_TEMPLATES.find((x) => x.key === t)!.permissions).not.toContain('employee.change.approve');
      expect(ROLE_PERMISSIONS.org_admin).not.toContain('employee.change.approve');
      const raised = (await api('hrA', 'post', '/people/changes').send(change({})).expect(201)).body;
      expect((await api('hrA', 'get', `/people/changes/route?employeeId=${ids.nisha}&pay=true`).expect(200)).body.approvers).not.toContain('Pavan Payroll');
      expect((await api('hrA', 'get', '/people/changes?status=pending').expect(200)).body.find((x: { id: string }) => x.id === raised.id).waitingFor).not.toContain('Pavan Payroll');
      for (const who of ['payrollA', 'adminA'] as const) {
        await markSteppedUp(tenantPrisma, token[who]);
        await api(who, 'post', `/people/changes/${raised.id}/approve`).send({}).expect(403);
        await api(who, 'post', `/people/changes/${raised.id}/reject`).send({ reason: 'No' }).expect(403);
      }
      // HR still approves.
      await markSteppedUp(tenantPrisma, token.approverA);
      await api('approverA', 'post', `/people/changes/${raised.id}/approve`).send({}).expect(201);
      await api('hrA', 'post', `/people/changes/${raised.id}/cancel`).send({ reason: 'Test done' }).expect(201);
    });

    it("a waiting change shows in its approvers' Approvals inbox, count and bell; never the raiser's; gone once cancelled", async () => {
      const raised = (await api('hrA', 'post', '/people/changes').send(change({})).expect(201)).body;
      type Row = { requestId: string; type: string; person: string; decideAt: string | null };
      const inbox = (who: Who) => api(who, 'get', '/workflow/approvals/inbox').expect(200).then((r) => (r.body as Row[]).find((x) => x.requestId === raised.id));
      expect(await inbox('approverA')).toMatchObject({ type: 'Job change', person: 'Nisha', decideAt: '/yx/people/scheduled' });
      expect(await inbox('hrA')).toBeUndefined();
      expect(await inbox('outsiderA')).toBeUndefined();
      expect((await api('approverA', 'get', '/workspace/counts').expect(200)).body.approvals).toBeGreaterThanOrEqual(1);
      const bell = (await api('approverA', 'get', '/notifications').expect(200)).body as { type: string; entityId: string; contextText: string }[];
      expect(bell.find((n) => n.entityId === raised.id)).toMatchObject({ type: 'employee.change.approval_needed', contextText: expect.stringMatching(/^Nisha · transfer on .* waits for your approval$/) });
      expect(((await api('hrA', 'get', '/notifications').expect(200)).body as { entityId: string }[]).some((n) => n.entityId === raised.id)).toBe(false);
      await api('hrA', 'post', `/people/changes/${raised.id}/cancel`).send({ reason: 'Test done' }).expect(201);
      expect(await inbox('approverA')).toBeUndefined();
    });

    it("new people get codes in their entity's own series (YX-ORG-16): the prefix, else E; a bad prefix is refused", async () => {
      const entity = (prefix: string | null) => api('adminA', 'put', `/org/legal-entities/${ids.kf}`).send({ name: 'Kaveri Foods', shortName: 'KFPL', employeeCodePrefix: prefix });
      await entity('kf').expect(400);
      await entity('KF-').expect(200);
      try {
        expect((await api('hrA', 'post', '/people/employees').send(join({ givenName: 'Prefix', joinedOn: today, overrideReason: undefined })).expect(201)).body.employeeCode).toBe('KF-0001');
      } finally {
        await entity(null).expect(200);
      }
      expect((await api('hrA', 'post', '/people/employees').send(join({ givenName: 'Plain', joinedOn: today, overrideReason: undefined })).expect(201)).body.employeeCode).toMatch(/^E\d{4}$/);
    });

    it('drafts: only the raiser sees and edits theirs; another company gets 404; sending removes the draft', async () => {
      const form = { changeType: 'transfer', values: { locationId: ids.maa }, reason: 'Half done' };
      const saved = (await api('hrA', 'post', '/people/changes/drafts').send({ employeeId: ids.nisha, changeType: 'transfer', form }).expect(201)).body;
      expect(saved).toMatchObject({ employeeId: ids.nisha, employeeName: 'Nisha', changeType: 'transfer', form });
      await api('hrA', 'put', `/people/changes/drafts/${saved.id}`).send({ employeeId: ids.nisha, changeType: 'transfer', form: { ...form, reason: 'Nearly done' } }).expect(200);
      expect((await api('hrA', 'get', '/people/changes/drafts').expect(200)).body.map((d: { id: string; form: { reason: string } }) => [d.id, d.form.reason])).toEqual([[saved.id, 'Nearly done']]);
      // Someone else in the company, even with the same rights: not theirs.
      expect((await api('payrollA', 'get', '/people/changes/drafts').expect(200)).body).toEqual([]);
      await api('payrollA', 'put', `/people/changes/drafts/${saved.id}`).send({ employeeId: ids.nisha, form }).expect(404);
      // Another company: neither the draft nor the person exists there.
      await api('adminB', 'put', `/people/changes/drafts/${saved.id}`).send({ employeeId: ids.nisha, form }).expect(404);
      await api('adminB', 'post', '/people/changes/drafts').send({ employeeId: ids.nisha, form }).expect(404);
      await api('outsiderA', 'post', '/people/changes/drafts').send({ employeeId: ids.nisha, form }).expect(403);
      await api('hrA', 'post', '/people/changes/drafts').send({ employeeId: ids.nisha, form: { big: 'x'.repeat(20001) } }).expect(400);
      // Sent through the normal path (its checks apply), then gone.
      await api('hrA', 'post', '/people/changes').send(change({ draftId: saved.id, payload: { assignment: { locationId: ids.blr } } })).expect(400);
      expect((await api('hrA', 'get', '/people/changes/drafts').expect(200)).body).toHaveLength(1);
      const sent = (await api('hrA', 'post', '/people/changes').send(change({ draftId: saved.id })).expect(201)).body;
      expect((await api('hrA', 'get', '/people/changes/drafts').expect(200)).body).toEqual([]);
      await api('hrA', 'post', `/people/changes/${sent.id}/cancel`).send({ reason: 'Test done' }).expect(201);
    });
  });
});
