import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { addDays, todayIst } from '../src/org-structure/org-validation';
import { markSteppedUp } from './fixtures/step-up';

// Step 2d, access, visibility and privacy, end to end against the real database (forced RLS, app role):
// scoped role grants and templates (P02 §4.2–4.3, YX-SEC-02/03/18), the record scope engine on every people and
// organisation route (§4.3, YX-SEC-05/06), field classes and pay (§4.4, R1, YX-SEC-07/08/09), self-service and
// identity / bank changes (§4.5, YX-SEC-13, M01 YX-EMP-01/02) and separation of duties (§4.6, YX-SEC-11).
describe('Access, visibility and privacy (P02 §4.2–4.6; R1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const sent: { to: string; subject: string }[] = [];
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const today = todayIst();
  const joinOld = addDays(today, -700);

  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  type Who =
    | 'adminA'
    | 'admin2A'
    | 'adminB'
    | 'hrAll'
    | 'approverA'
    | 'hrTn'
    | 'hrBlr'
    | 'hrOps'
    | 'orgTn'
    | 'payrollTn'
    | 'lakshmiU'
    | 'divyaU'
    | 'arjunU'
    | 'imranU'
    | 'outsider';
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const up = (who: Who) => markSteppedUp(tenantPrisma, token[who]);
  /** The step-up window has passed (P12 YX-IAM-02). */
  const down = async (who: Who) => {
    const { sid } = JSON.parse(Buffer.from(token[who].split('.')[1], 'base64url').toString()) as { sid: string };
    await tenantPrisma.forTenant(SUPER, (tx) => tx.session.update({ where: { id: sid }, data: { mfaVerifiedAt: new Date(Date.now() - 3_600_000) } }));
  };
  const ids: Record<string, string> = {};
  const roles: Record<string, string> = {};
  const asA = () => ({ organizationId: org.A.id, isSuperAdmin: false });
  const email = (who: string) => `${who}-${runId}@acc.test`;
  const CTC = ['2400000', '920000', '540000', '420000', '610000', '330000'];
  /** R1: no amount in any form (field names or the seeded figures). */
  const noPay = (body: unknown) => {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    expect(text).not.toMatch(/annualCtc|increasePercent|"compensation":\{|"min":|"max":|"mid":/);
    for (const n of CTC) expect(text).not.toContain(n);
  };
  const auditRows = async (action: string) =>
    (await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action }, orderBy: { createdAt: 'asc' } }))).map((a) => ({
      actor: a.actorUserId,
      entityId: a.entityId,
      metadata: a.metadataJson ? JSON.parse(a.metadataJson) : null,
    }));

  /** As adminA (stepped up): a grant; Confidential ones come back pending. */
  const grant = async (status: number, who: Who, role: string, scopeType: string, scopeId?: string, extra: Record<string, unknown> = {}) => {
    await up('adminA');
    const res = await api('adminA', 'post', '/access/grants').send({ userId: users[who], permissionProfileId: roles[role], scopeType, ...(scopeId ? { scopeId } : {}), reason: `${role} for ${who}`, ...extra });
    expect({ status: res.status, body: res.status === status ? null : res.body }).toEqual({ status, body: null });
    return res;
  };
  const approveGrant = async (id: string) => {
    await up('admin2A');
    return api('admin2A', 'post', `/access/grants/${id}/approve`).send({}).expect(201);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn(async (m: { to: string; subject: string }) => (sent.push({ to: m.to, subject: m.subject }), { success: true })) })
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    planId = (await prisma.plan.create({ data: { name: `acc-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Org ${k}`, slug: `acc-${k.toLowerCase()}-${runId}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    await tenantPrisma.forTenant(asA(), async (tx) => {
      const o = { organizationId: org.A.id };
      ids.kf = (await tx.legalEntity.create({ data: { ...o, name: 'Kaveri Foods', shortName: 'KFPL', isDefault: true } })).id;
      ids.tn = (await tx.legalEntity.create({ data: { ...o, name: 'Kaveri TN', shortName: 'KFPL-TN' } })).id;
      const loc = (entity: string, name: string, code: string, state: string) => tx.location.create({ data: { ...o, legalEntityId: entity, name, code, address: {}, country: 'IN', state, timezone: 'Asia/Kolkata' } });
      ids.blr = (await loc(ids.kf, 'Bengaluru', 'BLR', 'IN-KA')).id;
      ids.mys = (await loc(ids.kf, 'Mysuru', 'MYS', 'IN-KA')).id;
      ids.hsr = (await loc(ids.tn, 'Hosur', 'HSR', 'IN-TN')).id;
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
      ids.analyst = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
      ids.lead = (await tx.designation.create({ data: { ...o, name: 'Lead', code: 'LEAD' } })).id;
      ids.g2 = (await tx.grade.create({ data: { ...o, name: 'G2', code: 'G2', rank: 2 } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      ids.rangeKf = (await tx.gradePayRange.create({ data: { ...o, gradeId: ids.g2, legalEntityId: ids.kf, currency: 'INR', min: 300000, mid: 450000, max: 600000, validFrom: new Date('2025-04-01T00:00:00Z') } })).id;
      ids.rangeTn = (await tx.gradePayRange.create({ data: { ...o, gradeId: ids.g2, legalEntityId: ids.tn, currency: 'INR', min: 250000, mid: 350000, max: 450000, validFrom: new Date('2025-04-01T00:00:00Z') } })).id;
    });
    ids.bEntity = (await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.legalEntity.create({ data: { organizationId: org.B.id, name: 'B Ltd', shortName: 'BLTD', isDefault: true } }))).id;

    const profile = async (name: string, keys: string[]) =>
      (await tenantPrisma.forTenant(asA(), (tx) => tx.permissionProfile.create({ data: { organizationId: org.A.id, name, permissionsJson: JSON.stringify(keys) } }))).id;
    const hrAll = await profile('HR Admin (all)', [
      'employee.profile.view', 'employee.change.manage', 'employee.change.approve', 'employee.change.retro', 'employee.salary.view', 'employee.salary.manage',
      'employee.personal.view', 'employee.profile.edit', 'employee.identity.view', 'employee.identity.manage',
    ]);
    const approver = await profile('HR Approver', ['employee.profile.view', 'employee.change.approve', 'employee.change.retro', 'employee.salary.view']);
    roles.records = await profile('HR Records', ['org.structure.view', 'employee.profile.view', 'employee.change.manage', 'employee.personal.view']);
    roles.payroll = await profile('Payroll TN', ['employee.profile.view', 'employee.salary.view', 'employee.identity.view', 'employee.identity.approve', 'employee.aadhaar.view', 'pay.range.view']);
    roles.orgAdmin = await profile('Org settings', ['org.structure.view', 'org.settings.manage']);
    roles.teamSalary = await profile('Team salary', ['employee.salary.view']);
    roles.withAts = await profile('Records + candidates', ['employee.profile.view', 'candidate:manage']);
    roles.approverTn = await profile('Approver', ['employee.profile.view', 'employee.change.approve']);
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['admin2A', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hrAll', 'A', 'panel', hrAll],
      ['approverA', 'A', 'panel', approver],
      ['hrTn', 'A', 'panel', null],
      ['hrBlr', 'A', 'panel', null],
      ['hrOps', 'A', 'panel', null],
      ['orgTn', 'A', 'panel', null],
      ['payrollTn', 'A', 'panel', null],
      ['lakshmiU', 'A', 'panel', null],
      ['divyaU', 'A', 'panel', null],
      ['arjunU', 'A', 'panel', null],
      ['imranU', 'A', 'panel', null],
      ['outsider', 'A', 'panel', null],
    ];
    for (const [name, k, role, permissionProfileId] of roster) {
      users[name] = (
        await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, (tx) =>
          tx.user.create({ data: { organizationId: org[k].id, email: email(name), name, passwordHash, role, permissionProfileId } }),
        )
      ).id;
      const res = await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: email(name), password: PASSWORD }).expect(200);
      token[name] = res.body.accessToken;
    }

    const hire = async (given: string, entity: string, a: Record<string, unknown>, ctc: string, userId?: string) =>
      (
        await api('hrAll', 'post', '/people/employees')
          .send({
            legalEntityId: entity,
            status: 'confirmed',
            reason: 'Joined',
            joinedOn: joinOld,
            givenName: given,
            workEmail: `${given.toLowerCase()}-${runId}@acc.test`,
            ...(userId ? { userId } : {}),
            assignment: { locationId: ids.blr, departmentId: ids.qa, designationId: ids.analyst, gradeId: ids.g2, employmentTypeId: ids.perm, managerEmployeeId: null, ...a },
            compensation: { currency: 'INR', annualCtc: ctc },
          })
          .expect(201)
      ).body.id as string;
    // Login emails match the work emails (P01 §4.5).
    const login = async (who: Who, given: string) => {
      await tenantPrisma.forTenant(asA(), (tx) => tx.user.update({ where: { id: users[who] }, data: { email: `${given.toLowerCase()}-${runId}@acc.test` } }));
      return users[who];
    };
    ids.lakshmi = await hire('Lakshmi', ids.kf, { departmentId: ids.ppl }, '2400000', await login('lakshmiU', 'Lakshmi'));
    ids.divya = await hire('Divya', ids.kf, { managerEmployeeId: ids.lakshmi }, '920000', await login('divyaU', 'Divya'));
    ids.arjun = await hire('Arjun', ids.kf, { managerEmployeeId: ids.divya }, '540000', await login('arjunU', 'Arjun'));
    ids.meera = await hire('Meera', ids.kf, { locationId: ids.mys, managerEmployeeId: ids.arjun }, '420000');
    ids.imran = await hire('Imran', ids.tn, { locationId: ids.hsr, departmentId: ids.prod, managerEmployeeId: ids.lakshmi }, '610000', await login('imranU', 'Imran'));
    ids.kavya = await hire('Kavya', ids.tn, { locationId: ids.hsr, departmentId: ids.prod, managerEmployeeId: ids.imran }, '330000', await login('payrollTn', 'Kavya'));
    const codes = await tenantPrisma.forTenant(asA(), (tx) => tx.employment.findMany({ where: { organizationId: org.A.id } }));
    ids.arjunCode = codes.find((e) => e.employeeId === ids.arjun)!.employeeCode;
    ids.imranCode = codes.find((e) => e.employeeId === ids.imran)!.employeeCode;
  }, 120_000);

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

  // =====================================================================================================
  describe('roles and grants (§4.2–4.3, §4.6; YX-SEC-02/03/11/18)', () => {
    it('templates are listed and cloned into a company role; only access.role.manage reaches them', async () => {
      const list = (await api('adminA', 'get', '/access/role-templates').expect(200)).body;
      expect(list.map((t: { key: string }) => t.key)).toEqual(expect.arrayContaining(['hr_admin', 'hr_executive', 'payroll_admin', 'auditor']));
      expect(list.find((t: { key: string }) => t.key === 'payroll_admin').confidential).toBe(true);
      await api('hrAll', 'get', '/access/role-templates').expect(403);
      await api('adminA', 'post', '/access/roles/from-template').send({ templateKey: 'hr_executive', name: `Plant HR ${runId}` }).expect(403); // step-up
      await up('adminA');
      const role = (await api('adminA', 'post', '/access/roles/from-template').send({ templateKey: 'hr_executive', name: `Plant HR ${runId}` }).expect(201)).body;
      expect(role.permissions).toEqual(expect.arrayContaining(['employee.profile.view', 'employee.personal.view']));
      roles.plantHr = role.id;
      await up('adminA');
      await api('adminA', 'post', '/access/roles/from-template').send({ templateKey: 'no_such' }).expect(404);
    });

    it('a role without Confidential data counts at once, for its scope only; the people it reaches are previewed', async () => {
      const g = (await grant(201, 'hrTn', 'records', 'legal_entity', ids.tn)).body;
      expect(g).toMatchObject({ status: 'active', scope: { type: 'legal_entity', id: ids.tn, name: 'Kaveri TN' }, role: { confidential: false } });
      ids.hrTnGrant = g.id;
      await grant(201, 'hrBlr', 'records', 'location', ids.blr);
      await grant(201, 'hrOps', 'records', 'department_subtree', ids.ops);
      await grant(201, 'orgTn', 'orgAdmin', 'legal_entity', ids.tn);
      const preview = (await api('adminA', 'get', `/access/users/${users.hrTn}/effective`).expect(200)).body;
      expect(preview.keys.find((k: { key: string }) => k.key === 'employee.profile.view').people).toBe(2);
      expect(preview.keys.find((k: { key: string }) => k.key === 'employee.salary.view').people).toBe(0);
      // The guard sees the granted keys (GET /rbac/me/permissions resolves them the same way).
      expect((await api('hrTn', 'get', '/rbac/me/permissions?keys=employee.profile.view,employee.salary.view').expect(200)).body).toEqual(['employee.profile.view']);
    });

    it('a key whose module has no record scope works company-wide only: a narrower grant is refused, not silently empty', async () => {
      const res = await grant(400, 'hrTn', 'withAts', 'legal_entity', ids.tn);
      expect(res.body).toMatchObject({ code: 'KEYS_COMPANY_WIDE_ONLY', keys: ['candidate:manage'] });
      await grant(400, 'hrTn', 'orgAdmin', 'location', ids.hsr); // org keys go no narrower than an entity
      await grant(400, 'hrTn', 'records', 'legal_entity'); // which entity?
      await grant(400, 'hrTn', 'records', 'tenant', ids.tn);
      await grant(400, 'hrTn', 'records', 'legal_entity', ids.bEntity); // another company's entity
      await grant(400, 'outsider', 'records', 'all_reports'); // reports need an employee record
      await grant(400, 'hrTn', 'records', 'legal_entity', ids.tn, { validFrom: addDays(today, -1) });
    });

    it('Confidential access waits for a second admin: not the granter, not the grantee (YX-SEC-11); step-up to approve', async () => {
      const g = (await grant(201, 'payrollTn', 'payroll', 'legal_entity', ids.tn)).body;
      expect(g).toMatchObject({ status: 'pending', role: { confidential: true } });
      ids.payrollGrant = g.id;
      // Pending grants confer nothing.
      expect((await api('payrollTn', 'get', '/rbac/me/permissions?keys=employee.salary.view').expect(200)).body).toEqual([]);
      await up('adminA');
      await api('adminA', 'post', `/access/grants/${g.id}/approve`).send({}).expect(403);
      await api('admin2A', 'post', `/access/grants/${g.id}/approve`).send({}).expect(403); // no step-up
      await api('adminB', 'post', `/access/grants/${g.id}/approve`).send({}).expect(403); // another company: needs step-up first
      await markSteppedUp(tenantPrisma, token.adminB);
      await api('adminB', 'post', `/access/grants/${g.id}/approve`).send({}).expect(404);
      expect((await approveGrant(g.id)).body.status).toBe('active');
      expect((await api('payrollTn', 'get', '/rbac/me/permissions?keys=employee.salary.view').expect(200)).body).toEqual(['employee.salary.view']);
      // Lakshmi as department head gets team salary (P02 Q3) only through an approved grant.
      const ts = (await grant(201, 'lakshmiU', 'teamSalary', 'all_reports')).body;
      expect(ts.status).toBe('pending');
      await approveGrant(ts.id);
      const audits = await auditRows('access.grant.approved');
      expect(audits.map((a) => a.actor)).toEqual([users.admin2A, users.admin2A]);
    });

    it('YX-SEC-18 (a): Confidential access over more people than the company limit needs a confirmed warning', async () => {
      await up('adminA');
      await api('adminA', 'put', '/org/settings').send({ key: 'access.risk.confidential_threshold', scopeType: 'tenant', value: '5' }).expect(200);
      const warned = await grant(409, 'hrAll', 'payroll', 'tenant');
      expect(warned.body).toMatchObject({ code: 'RISK_CONFIRMATION_REQUIRED', people: 6 });
      const g = (await grant(201, 'hrAll', 'payroll', 'tenant', undefined, { confirmRisk: true })).body;
      expect(g.status).toBe('pending');
      const created = (await auditRows('access.grant.created')).find((a) => a.entityId === g.id)!;
      expect(created.metadata).toMatchObject({ riskConfirmed: true, people: 6, confidential: true });
      await up('adminA');
      await api('adminA', 'post', `/access/grants/${g.id}/reject`).send({ reason: 'x' }).expect(403); // the granter never decides
      await api('admin2A', 'post', `/access/grants/${g.id}/reject`).send({ reason: 'Too broad' }).expect(201);
    });

    it('self-granting is allowed (Q1) but recorded and told to the other admins', async () => {
      const g = (await grant(201, 'adminA', 'records', 'legal_entity', ids.kf)).body;
      expect(g.status).toBe('active');
      expect((await auditRows('access.grant.created')).find((a) => a.entityId === g.id)!.metadata).toMatchObject({ selfGrant: true });
      const bell = await tenantPrisma.forTenant(SUPER, (tx) => tx.userNotification.findMany({ where: { organizationId: org.A.id, entityId: g.id } }));
      expect(bell.map((n) => n.recipientUserId)).toEqual([users.admin2A]);
      await up('adminA');
      expect((await api('adminA', 'post', `/access/grants/${g.id}/revoke`).send({ reason: 'Not needed' }).expect(201)).body.status).toBe('revoked');
    });

    it('a role in use cannot gain Confidential access, nor be handed out outside Roles & access, nor be deleted once granted (§4.6)', async () => {
      await up('adminA');
      await api('adminA', 'patch', `/organizations/permission-profiles/${roles.records}`).send({ permissions: ['employee.profile.view', 'employee.salary.view'] }).expect(409);
      await up('adminA');
      await api('adminA', 'patch', `/users/${users.outsider}`).send({ permissionProfileId: roles.payroll }).expect(400);
      await up('adminA');
      await api('adminA', 'delete', `/organizations/permission-profiles/${roles.records}`).expect(409);
      // access.role.manage itself is never part of a role.
      await up('adminA');
      await api('adminA', 'post', '/organizations/permission-profiles').send({ name: `Escalate ${runId}`, permissions: ['access.role.manage'] }).expect(400);
    });

    it('revoking ends the access at once', async () => {
      await grant(201, 'outsider', 'records', 'legal_entity', ids.kf);
      await api('outsider', 'get', `/people/employees/${ids.arjun}/history`).expect(200);
      const g = (await api('adminA', 'get', `/access/grants?userId=${users.outsider}`).expect(200)).body[0];
      await up('adminA');
      await api('adminA', 'post', `/access/grants/${g.id}/revoke`).send({ reason: 'Moved team' }).expect(201);
      await api('outsider', 'get', `/people/employees/${ids.arjun}/history`).expect(404);
      await up('adminA');
      await api('adminA', 'post', `/access/grants/${g.id}/revoke`).send({ reason: 'again' }).expect(409);
    });
  });

  // =====================================================================================================
  describe('record scopes on every people route (§4.3; YX-SEC-05/06)', () => {
    it('an entity-scoped HR sees only that entity: records, lists, directory codes and code search', async () => {
      await api('hrTn', 'get', `/people/employees/${ids.imran}/history`).expect(200);
      await api('hrTn', 'get', `/people/employees/${ids.arjun}/history`).expect(404);
      await api('hrTn', 'get', `/people/employees/${ids.arjun}/as-of`).expect(404);
      const list = (await api('hrTn', 'get', '/people/employees').expect(200)).body.map((p: { id: string }) => p.id).sort();
      expect(list).toEqual([ids.imran, ids.kavya].sort());
      const dir = (await api('hrTn', 'get', '/people/directory').expect(200)).body;
      expect(dir.total).toBe(6); // Public fields of every colleague (P02 Q4)
      const codes = Object.fromEntries(dir.people.map((p: { id: string; employeeCode?: string }) => [p.id, p.employeeCode ?? null]));
      expect(codes[ids.imran]).toBe(ids.imranCode);
      expect(codes[ids.arjun]).toBeNull();
      expect((await api('hrTn', 'get', `/people/directory?q=${ids.arjunCode}`).expect(200)).body.total).toBe(0);
      expect((await api('hrTn', 'get', `/people/directory?q=${ids.imranCode}`).expect(200)).body.total).toBe(1);
      const chart = (await api('hrTn', 'get', '/people/org-chart').expect(200)).body.nodes;
      expect(chart.find((n: { id: string }) => n.id === ids.arjun).employeeCode).toBeUndefined();
      await api('hrTn', 'get', `/people/employees/${ids.imran}/segments?from=${addDays(today, -30)}&to=${today}`).expect(200);
      await api('hrTn', 'get', `/people/employees/${ids.arjun}/segments?from=${addDays(today, -30)}&to=${today}`).expect(404);
      // Settings resolved for a person read their assignment: only within scope.
      await api('hrTn', 'get', `/org/settings/resolve?key=probation.default_months&employeeId=${ids.arjun}`).expect(404);
    });

    it('location and department-subtree scopes', async () => {
      const blr = (await api('hrBlr', 'get', '/people/employees').expect(200)).body.map((p: { id: string }) => p.id).sort();
      expect(blr).toEqual([ids.lakshmi, ids.divya, ids.arjun].sort());
      await api('hrBlr', 'get', `/people/employees/${ids.meera}/history`).expect(404);
      const ops = (await api('hrOps', 'get', '/people/employees').expect(200)).body.map((p: { id: string }) => p.id).sort();
      expect(ops).toEqual([ids.divya, ids.arjun, ids.meera].sort());
      await api('hrOps', 'get', `/people/employees/${ids.lakshmi}/history`).expect(404);
    });

    it('scoped HR changes and hires only inside the scope', async () => {
      const body = (employeeId: string) => ({ employeeId, changeType: 'redesignation', effectiveDate: addDays(today, 10), payload: { assignment: { designationId: ids.analyst } }, reason: 'Re-titled' });
      await api('hrTn', 'post', '/people/changes').send(body(ids.arjun)).expect(404);
      const ch = (await api('hrTn', 'post', '/people/changes').send({ ...body(ids.imran), payload: { assignment: { gradeId: ids.g2 } }, changeType: 'promotion' }).expect(201)).body;
      // The change list shows HR only the people its grants reach.
      const seen = (await api('hrTn', 'get', '/people/changes').expect(200)).body.map((c: { employeeId: string }) => c.employeeId);
      expect(new Set(seen)).toEqual(new Set([ids.imran, ids.kavya]));
      await api('hrBlr', 'get', `/people/changes/${ch.id}`).expect(404);
      await up('hrTn');
      const hireBody = (legalEntityId: string, locationId: string, departmentId: string) => ({
        legalEntityId, status: 'confirmed', reason: 'Joined', joinedOn: today, givenName: `New ${legalEntityId.slice(0, 4)}`,
        assignment: { locationId, departmentId, designationId: ids.analyst, gradeId: ids.g2, employmentTypeId: ids.perm, managerEmployeeId: null },
      });
      await api('hrTn', 'post', '/people/employees').send(hireBody(ids.kf, ids.blr, ids.qa)).expect(403);
      ids.newTn = (await api('hrTn', 'post', '/people/employees').send(hireBody(ids.tn, ids.hsr, ids.prod)).expect(201)).body.id;
      // Pay on a hire needs the salary grant (R1).
      await api('hrTn', 'post', '/people/employees').send({ ...hireBody(ids.tn, ids.hsr, ids.prod), compensation: { currency: 'INR', annualCtc: '1' } }).expect(403);
      await api('hrTn', 'put', `/people/employees/${ids.arjun}/code`).send({ employeeCode: 'X-1', reason: 'Correction' }).expect(404);
      await api('hrTn', 'post', `/people/employees/${ids.arjun}/probation/extend`).send({ months: 1, reason: 'Needs time' }).expect(404);
    });

    it('the HR desk approving needs its grant to reach the person', async () => {
      const raised = (await api('hrAll', 'post', '/people/changes').send({ employeeId: ids.arjun, changeType: 'redesignation', effectiveDate: addDays(today, 12), payload: { assignment: { designationId: ids.lead } }, reason: 'Re-titled' }).expect(201)).body;
      // An approver for the TN entity only: a KF person's change is not theirs (and does not exist for them).
      await grant(201, 'hrOps', 'approverTn', 'legal_entity', ids.tn);
      await up('hrOps');
      await api('hrOps', 'post', `/people/changes/${raised.id}/approve`).send({ confirmRebase: true }).expect(404);
      await api('hrOps', 'post', `/people/changes/${raised.id}/reject`).send({ reason: 'Not ours' }).expect(404);
      // No approval key anywhere: refused at the door.
      await up('payrollTn');
      await api('payrollTn', 'post', `/people/changes/${raised.id}/approve`).send({}).expect(403);
      await up('approverA');
      await api('approverA', 'post', `/people/changes/${raised.id}/approve`).send({ confirmRebase: true }).expect(201);
      // The TN HR also gets TN payroll duties (identity approvals, pay) for later checks.
      await approveGrant((await grant(201, 'hrTn', 'payroll', 'legal_entity', ids.tn)).body.id);
    });

    it('managers see their team; the company can narrow it to direct reports (Q2); time-aware after a transfer (YX-SEC-06)', async () => {
      await api('divyaU', 'get', `/people/employees/${ids.meera}/history`).expect(200);
      await api('divyaU', 'get', `/people/employees/${ids.imran}/history`).expect(404);
      await up('adminA');
      const set = (await api('adminA', 'put', '/org/settings').send({ key: 'access.manager.view_scope', scopeType: 'tenant', value: 'direct_reports' }).expect(200)).body;
      await api('divyaU', 'get', `/people/employees/${ids.meera}/history`).expect(404);
      await api('divyaU', 'get', `/people/employees/${ids.arjun}/history`).expect(200);
      expect((await api('divyaU', 'get', '/people/team').expect(200)).body.members.map((m: { id: string }) => m.id)).toEqual([ids.arjun]);
      await up('adminA');
      await api('adminA', 'delete', `/org/settings/${set.id}`).expect(204);
      // Meera moves to Bengaluru from 20 days ago: the Bengaluru HR sees her from that day only.
      const moved = (await api('hrAll', 'post', '/people/changes').send({ employeeId: ids.meera, changeType: 'transfer', effectiveDate: addDays(today, -20), payload: { assignment: { locationId: ids.blr } }, reason: 'Moved' }).expect(201)).body;
      await up('approverA');
      await api('approverA', 'post', `/people/changes/${moved.id}/approve`).send({ confirmRebase: true }).expect(201);
      await api('hrBlr', 'get', `/people/employees/${ids.meera}/as-of?date=${addDays(today, -5)}`).expect(200);
      await api('hrBlr', 'get', `/people/employees/${ids.meera}/as-of?date=${addDays(today, -60)}`).expect(404);
      const hist = (await api('hrBlr', 'get', `/people/employees/${ids.meera}/history`).expect(200)).body;
      expect(hist.assignment.every((r: { validTo: string | null }) => r.validTo === null || r.validTo >= addDays(today, -20))).toBe(true);
    });

    it('a department head sees the department subtree (implicit grant, YX-SEC-04), without pay', async () => {
      await api('imranU', 'get', `/people/employees/${ids.arjun}/history`).expect(404);
      await up('adminA');
      await api('adminA', 'put', `/org/masters/departments/${ids.qa}`).send({ name: 'QA', code: 'QA', headEmployeeId: ids.imran }).expect(200);
      const h = (await api('imranU', 'get', `/people/employees/${ids.arjun}/history?pay=true`).expect(200)).body;
      expect(h.payAccess).toBe(false);
      noPay(h);
      await api('imranU', 'get', `/people/employees/${ids.lakshmi}/history`).expect(404);
      await up('adminA');
      await api('adminA', 'put', `/org/masters/departments/${ids.qa}`).send({ name: 'QA', code: 'QA', headEmployeeId: randomUUID() }).expect(400);
    });

    it('organisation data: an entity-scoped admin changes only that entity; shared masters and company settings need the whole company', async () => {
      const loc = (legalEntityId: string, code: string) => ({ legalEntityId, name: code, code, address: { lines: ['1 Road'], city: 'Hosur', state: 'IN-TN', country: 'IN' }, timezone: 'Asia/Kolkata' });
      await api('orgTn', 'post', '/org/locations').send(loc(ids.tn, 'HSR2')).expect(201);
      await api('orgTn', 'post', '/org/locations').send({ ...loc(ids.kf, 'BLR2'), address: { lines: ['1 Road'], city: 'Bengaluru', state: 'IN-KA', country: 'IN' } }).expect(404);
      await api('orgTn', 'put', `/org/locations/${ids.blr}`).send({ ...loc(ids.kf, 'BLR'), name: 'Hacked', address: { lines: ['1 Road'], city: 'Bengaluru', state: 'IN-KA', country: 'IN' } }).expect(404);
      await api('orgTn', 'post', '/org/masters/departments').send({ name: 'Shared dept', ownerLegalEntityId: null }).expect(403);
      await api('orgTn', 'post', '/org/masters/departments').send({ name: 'TN Stores', ownerLegalEntityId: ids.tn }).expect(201);
      await api('orgTn', 'post', `/org/masters/departments/${ids.qa}/archive`).expect(403);
      await api('orgTn', 'put', '/org/settings').send({ key: 'probation.default_months', scopeType: 'tenant', value: '3' }).expect(403);
      await api('orgTn', 'put', '/org/settings').send({ key: 'probation.default_months', scopeType: 'legal_entity', scopeId: ids.kf, value: '3' }).expect(404);
      await api('orgTn', 'put', '/org/settings').send({ key: 'probation.default_months', scopeType: 'legal_entity', scopeId: ids.tn, value: '3' }).expect(200);
      await api('orgTn', 'put', `/org/legal-entities/${ids.kf}`).send({ name: 'Hacked' }).expect(400); // validated first
      await api('orgTn', 'post', `/org/legal-entities/${ids.kf}/archive`).expect(404);
      await api('orgTn', 'post', `/org/legal-entities/${ids.tn}/default`).expect(403); // the default entity is a company matter
    });

    it('pay ranges: only the entities the pay grant reaches (R1)', async () => {
      const rows = (await api('payrollTn', 'get', `/org/grades/${ids.g2}/pay-ranges`).expect(200)).body;
      expect(rows.map((r: { id: string }) => r.id)).toEqual([ids.rangeTn]);
      expect((await api('payrollTn', 'get', `/org/grades/${ids.g2}/pay-ranges?legalEntityId=${ids.kf}`).expect(200)).body).toEqual([]);
      await api('hrTn', 'get', `/org/grades/${ids.g2}/pay-ranges`).expect(200).then((r) => expect(r.body.map((x: { id: string }) => x.id)).toEqual([ids.rangeTn]));
      await api('hrBlr', 'get', `/org/grades/${ids.g2}/pay-ranges`).expect(403);
    });

    it('a bulk batch is visible and decided only by HR whose grants reach everyone in it', async () => {
      const csv = `employee_code,legal_entity,change_type,effective_date,reason,designation
${ids.arjunCode},KFPL,redesignation,${addDays(today, 20)},Re-titled,AN
`;
      const b = (await api('hrAll', 'post', '/people/change-batches').send({ csv, reason: 'Titles' }).expect(201)).body.batch;
      await api('hrTn', 'get', `/people/change-batches/${b.id}`).expect(404);
      expect((await api('hrTn', 'get', '/people/change-batches').expect(200)).body.map((x: { id: string }) => x.id)).not.toContain(b.id);
      await api('hrBlr', 'get', `/people/change-batches/${b.id}`).expect(200);
      // A KF-only row in a TN-scoped HR's file is refused row by row.
      const dry = (await api('hrTn', 'post', '/people/change-batches').send({ csv, reason: 'Titles', dryRun: true }).expect(201)).body;
      // A code outside the scope reads as unknown: a file cannot probe another entity's codes.
      expect(dry.rows).toEqual([expect.objectContaining({ ok: false, name: null, error: `No current employee with the code ${ids.arjunCode}.` })]);
      await api('hrAll', 'post', `/people/change-batches/${b.id}/cancel`).send({ reason: 'Not now' }).expect(201);
    });
  });

  // =====================================================================================================
  describe('field classes and pay (§4.4; R1; YX-SEC-07/08/09)', () => {
    it('self-service: Personal edited directly (audited without values); identity / bank changes need step-up and approval (§4.5)', async () => {
      const mine = (await api('imranU', 'get', '/people/me').expect(200)).body;
      expect(mine.employeeId).toBe(ids.imran);
      await api('imranU', 'put', `/people/employees/${ids.imran}/personal`).send({ dateOfBirth: '1990-05-17', personalEmail: `imran.home-${runId}@mail.test`, personalPhone: '098450 77777', addressLine1: '5 Main Rd', city: 'Hosur', stateCode: 'IN-TN', country: 'IN' }).expect(200);
      await api('imranU', 'put', `/people/employees/${ids.imran}/personal`).send({ stateCode: 'IN-KX' }).expect(400);
      await api('imranU', 'put', `/people/employees/${ids.imran}/personal`).send({ dateOfBirth: addDays(today, 1) }).expect(400);
      await api('imranU', 'put', `/people/employees/${ids.imran}/personal`).send({ salary: 1 }).expect(400);
      const audited = (await auditRows('employee.personal.updated'))[0];
      expect(audited.metadata).toEqual({ fields: expect.arrayContaining(['dateOfBirth', 'personalEmail', 'personalPhone']), by: 'self' });
      expect(JSON.stringify(audited)).not.toContain('1990-05-17');
      // A manager (Lakshmi manages Imran) never edits or sees Personal data.
      await api('lakshmiU', 'put', `/people/employees/${ids.imran}/personal`).send({ city: 'X' }).expect(403);

      const bank = { kind: 'bank_salary', value: { holderName: 'Imran', accountNumber: '123456789012', ifsc: 'HDFC0001234' }, reason: 'Salary account' };
      await api('imranU', 'post', `/people/employees/${ids.imran}/profile-requests`).send(bank).expect(403); // step-up
      await up('imranU');
      await api('imranU', 'post', `/people/employees/${ids.imran}/profile-requests`).send({ ...bank, value: { ...bank.value, ifsc: 'HDFC1234' } }).expect(400);
      await api('imranU', 'post', `/people/employees/${ids.imran}/profile-requests`).send({ ...bank, value: { ...bank.value, pan: 'ABCPE1234F' } }).expect(400);
      await api('imranU', 'post', `/people/employees/${ids.imran}/profile-requests`).send({ kind: 'aadhaar', value: { aadhaar: '468135790249' }, reason: 'x' }).expect(400); // checksum
      ids.bankReq = (await api('imranU', 'post', `/people/employees/${ids.imran}/profile-requests`).send(bank).expect(201)).body.id;
      await api('imranU', 'post', `/people/employees/${ids.imran}/profile-requests`).send(bank).expect(409);
      ids.panReq = (await api('imranU', 'post', `/people/employees/${ids.imran}/profile-requests`).send({ kind: 'pan', value: { pan: 'ABCPE1234F' }, reason: 'PAN' }).expect(201)).body.id;
      ids.aadhaarReq = (await api('imranU', 'post', `/people/employees/${ids.imran}/profile-requests`).send({ kind: 'aadhaar', value: { aadhaar: '468135790248' }, reason: 'Aadhaar' }).expect(201)).body.id;
      // Someone else's record: only with employee.identity.manage reaching them.
      await up('lakshmiU');
      await api('lakshmiU', 'post', `/people/employees/${ids.imran}/profile-requests`).send(bank).expect(403);
    });

    it('approved by someone who is neither the requester nor the person, within scope; old contact told; cooling period (YX-SEC-11/13)', async () => {
      await up('imranU');
      await api('imranU', 'post', `/people/profile-requests/${ids.bankReq}/approve`).send({}).expect(403); // no approve key at all
      await up('hrAll');
      await api('hrAll', 'post', `/people/profile-requests/${ids.bankReq}/approve`).send({}).expect(403);
      await up('payrollTn');
      const queue = (await api('payrollTn', 'get', '/people/profile-requests?status=pending').expect(200)).body.rows;
      expect(queue.map((r: { id: string }) => r.id)).toEqual(expect.arrayContaining([ids.bankReq, ids.panReq]));
      expect(JSON.stringify(queue)).not.toContain('123456789012');
      sent.length = 0;
      await api('payrollTn', 'post', `/people/profile-requests/${ids.bankReq}/approve`).send({}).expect(201);
      expect(sent.map((s) => s.to).sort()).toEqual([`imran-${runId}@acc.test`, `imran.home-${runId}@mail.test`].sort());
      await up('payrollTn');
      await api('payrollTn', 'post', `/people/profile-requests/${ids.panReq}/approve`).send({}).expect(201);
      await up('payrollTn');
      await api('payrollTn', 'post', `/people/profile-requests/${ids.aadhaarReq}/approve`).send({}).expect(201);
      // A second salary account replaces the first and waits for the cooling period.
      await up('imranU');
      const second = (await api('imranU', 'post', `/people/employees/${ids.imran}/profile-requests`).send({ kind: 'bank_salary', value: { holderName: 'Imran', accountNumber: '999988887777', ifsc: 'SBIN0004321' }, reason: 'New bank' }).expect(201)).body.id;
      await up('payrollTn');
      await api('payrollTn', 'post', `/people/profile-requests/${second}/approve`).send({}).expect(201);
      const p = (await api('imranU', 'get', `/people/employees/${ids.imran}/profile`).expect(200)).body;
      expect(p.identity.bankAccounts).toEqual([expect.objectContaining({ purpose: 'salary', account: '•••• 7777', ifsc: 'SBIN0004321' })]);
      expect(new Date(p.identity.bankAccounts[0].usableFrom).getTime()).toBeGreaterThan(Date.now() + 47 * 3_600_000);
      // Payroll never approves a change about themselves (Kavya signs in as payrollTn).
      await up('payrollTn');
      const own = (await api('payrollTn', 'post', `/people/employees/${ids.kavya}/profile-requests`).send({ kind: 'uan', value: { uan: '100912345678' }, reason: 'UAN' }).expect(201)).body.id;
      await up('payrollTn');
      await api('payrollTn', 'post', `/people/profile-requests/${own}/approve`).send({}).expect(403);
      await api('payrollTn', 'post', `/people/profile-requests/${own}/cancel`).send({ reason: 'Wrong' }).expect(201);
      // Another company's admin sees nothing.
      await markSteppedUp(tenantPrisma, token.adminB);
      await api('adminB', 'post', `/people/profile-requests/${second}/reject`).send({ reason: 'x' }).expect(403);
    });

    it('YX-EMP-02: a PAN another active employee holds blocks approval until a reason is given', async () => {
      await up('hrAll');
      // HR raises on Kavya's behalf (employee.identity.manage): Imran's PAN.
      const req = (await api('hrAll', 'post', `/people/employees/${ids.kavya}/profile-requests`).send({ kind: 'pan', value: { pan: 'ABCPE1234F' }, reason: 'From the joining form' }).expect(201)).body.id;
      await up('approverA');
      await api('approverA', 'post', `/people/profile-requests/${req}/approve`).send({}).expect(403);
      // Kavya cannot approve her own; TN payroll is Kavya. A second payroll grant for TN goes to the TN HR.
      await up('hrTn');
      const dup = await api('hrTn', 'post', `/people/profile-requests/${req}/approve`).send({}).expect(409);
      expect(dup.body).toMatchObject({ code: 'DUPLICATE_IDENTIFIER', conflicts: [{ employeeId: ids.imran, name: 'Imran' }] });
      await up('hrTn');
      await api('hrTn', 'post', `/people/profile-requests/${req}/approve`).send({ overrideReason: 'Checked: data entry error to be fixed' }).expect(201);
    });

    it('classes by viewer: the person, a manager, HR with Personal access, Payroll with identity access', async () => {
      const self = (await api('imranU', 'get', `/people/employees/${ids.imran}/profile`).expect(200)).body;
      expect(self.classes).toMatchObject({ internal: true, personal: true, identity: true, aadhaar: false, pay: true });
      expect(self.identity).toMatchObject({ pan: '•••• 234F', aadhaar: '•••• 0248' });
      // Lakshmi manages Imran: Internal yes, Personal and identity never; pay only through her team-salary grant (Q3).
      const mgr = (await api('lakshmiU', 'get', `/people/employees/${ids.imran}/profile`).expect(200)).body;
      expect(mgr).toMatchObject({ personal: null, identity: null, classes: { internal: true, personal: false, identity: false, pay: true } });
      const peer = (await api('divyaU', 'get', `/people/employees/${ids.arjun}/profile`).expect(200)).body;
      expect(peer).toMatchObject({ personal: null, identity: null, classes: { internal: true, personal: false, identity: false, pay: false } });
      const hr = (await api('hrTn', 'get', `/people/employees/${ids.imran}/profile`).expect(200)).body;
      expect(hr.personal).toMatchObject({ dateOfBirth: '1990-05-17', personalPhone: '+919845077777' });
      await api('hrBlr', 'get', `/people/employees/${ids.imran}/profile`).expect(404);
      await api('arjunU', 'get', `/people/employees/${ids.imran}/profile`).expect(404);
      await api('adminB', 'get', `/people/employees/${ids.imran}/profile`).expect(404);
    });

    it('full identifiers: step-up, audited for someone else; Aadhaar only with employee.aadhaar.view, even for oneself (YX-SEC-08/09)', async () => {
      await down('payrollTn');
      await api('payrollTn', 'post', `/people/employees/${ids.imran}/identity/reveal`).send({ field: 'pan' }).expect(403); // step-up
      await up('payrollTn');
      expect((await api('payrollTn', 'post', `/people/employees/${ids.imran}/identity/reveal`).send({ field: 'pan' }).expect(201)).body).toEqual({ field: 'pan', value: 'ABCPE1234F' });
      await up('payrollTn');
      expect((await api('payrollTn', 'post', `/people/employees/${ids.imran}/identity/reveal`).send({ field: 'aadhaar' }).expect(201)).body.value).toBe('468135790248');
      await up('imranU');
      expect((await api('imranU', 'post', `/people/employees/${ids.imran}/identity/reveal`).send({ field: 'bank_salary' }).expect(201)).body.value).toBe('999988887777');
      await up('imranU');
      await api('imranU', 'post', `/people/employees/${ids.imran}/identity/reveal`).send({ field: 'aadhaar' }).expect(403);
      await up('hrTn');
      await api('hrTn', 'post', `/people/employees/${ids.arjun}/identity/reveal`).send({ field: 'pan' }).expect(404);
      expect((await auditRows('employee.identity.viewed')).map((a) => [a.actor, a.entityId, a.metadata.field])).toEqual([[users.payrollTn, ids.imran, 'pan']]);
      expect((await auditRows('employee.aadhaar.viewed')).map((a) => [a.actor, a.entityId])).toEqual([[users.payrollTn, ids.imran]]);
    });

    it('pay: only with a salary grant reaching the person, audited; a department head with team salary sees their subtree (Q3)', async () => {
      const tn = (await api('payrollTn', 'get', `/people/employees/${ids.imran}/history?pay=true`).expect(200)).body;
      expect(tn.compensation.map((r: { annualCtc: string }) => r.annualCtc)).toEqual(['610000.00']);
      await api('payrollTn', 'get', `/people/employees/${ids.arjun}/history?pay=true`).expect(404);
      const lak = (await api('lakshmiU', 'get', `/people/employees/${ids.arjun}/as-of?pay=true`).expect(200)).body;
      expect(lak.compensation).toMatchObject({ annualCtc: '540000.00' });
      const audits = await auditRows('employee.pay.viewed');
      expect(audits.map((a) => [a.actor, a.entityId])).toEqual(expect.arrayContaining([[users.payrollTn, ids.imran], [users.lakshmiU, ids.arjun]]));
    });

    it('who accessed my data: the person sees the views of their Confidential / Special data; the company can hide the list', async () => {
      const log = (await api('imranU', 'get', '/people/me/access-log').expect(200)).body;
      expect(log.enabled).toBe(true);
      expect(log.entries.map((e: { what: string; who: string }) => [e.what, e.who])).toEqual(expect.arrayContaining([['PAN', 'payrollTn'], ['Aadhaar', 'payrollTn'], ['Pay', 'payrollTn']]));
      expect(log.entries.some((e: { who: string }) => e.who === 'imranU')).toBe(false);
      await up('adminA');
      await api('adminA', 'put', '/org/settings').send({ key: 'privacy.who_accessed', scopeType: 'tenant', value: 'off' }).expect(200);
      expect((await api('imranU', 'get', '/people/me/access-log').expect(200)).body).toEqual({ enabled: false, entries: [] });
      await api('outsider', 'get', '/people/me/access-log').expect(404);
    });

    it('nobody without pay access sees any amount: records, lists, search, chart, changes, batches, profiles, audit views and exports (R1)', async () => {
      const raise = (await api('hrAll', 'post', '/people/changes').send({ employeeId: ids.imran, changeType: 'salary_revision', effectiveDate: addDays(today, 30), payload: { compensation: { annualCtc: '640000' } }, reason: 'Raise' }).expect(201)).body;
      expect(raise.payload.compensation).toEqual({ annualCtc: '640000' });
      CTC.push('640000');
      // Everyone here lacks a salary grant reaching Arjun and Imran (hrTn and Payroll hold TN pay; Lakshmi her team's).
      for (const who of ['hrBlr', 'hrOps', 'divyaU', 'imranU', 'adminA', 'outsider'] as Who[]) {
        const gets = ['/people/directory?q=a', '/people/employees', '/people/org-chart', '/people/team', '/people/change-batches', '/people/profile-requests'];
        if (who !== 'imranU') gets.push(`/people/employees/${ids.arjun}/history?pay=true`, `/people/employees/${ids.arjun}/as-of?pay=true`);
        if (who !== 'divyaU' && who !== 'imranU') gets.push('/people/changes', `/people/changes/${raise.id}`);
        for (const path of gets) {
          const res = await api(who, 'get', path);
          if (res.status === 200) noPay(res.body);
        }
      }
      for (const path of ['/audit-logs?limit=200', '/audit-logs/export']) {
        const res = await api('adminA', 'get', path).expect(200);
        noPay(res.text);
      }
      const p = (await api('hrBlr', 'get', `/people/employees/${ids.arjun}/profile`).expect(200)).body;
      noPay(p);
      expect(p.classes).toMatchObject({ personal: true, identity: false, pay: false });
    });
  });
});
