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

// Team pay access (founder 28 Oct 2026), against the real database (forced RLS): a manager asks for their team's pay
// or one person's with a reason; two different HR people approve (never the manager, never the same HR person twice);
// HR may change how long and who it covers; the grant covers only those people and ends by itself. Positive and negative.
describe('Team pay access: a manager asks, two HR people approve', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const joined = addDays(todayIst(), -400);
  const today = todayIst();

  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  type Who = 'hr1' | 'hr2' | 'hr3' | 'mgr' | 'loner' | 'adminA' | 'adminB';
  const api = (who: Who, method: 'get' | 'post' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const ids: Record<string, string> = {};
  const ctx = (k: 'A' | 'B') => ({ organizationId: org[k].id, isSuperAdmin: false });
  const email = (who: string) => `${who}-${runId}@payaccess.test`;
  // HR 3 makes the records (nobody links their own login to a record they make).
  const hire = async (givenName: string, code: string, extra: Record<string, unknown> = {}, manager: string | null = null) =>
    (
      await api('hr3', 'post', '/people/employees')
        .send({ legalEntityId: ids.le, employeeCode: code, givenName, status: 'confirmed', reason: 'Joined', overrideReason: 'Joined before go-live', joinedOn: joined, assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.des, employmentTypeId: ids.type, managerEmployeeId: manager }, ...extra })
        .expect(201)
    ).body.id as string;
  const payAccess = async (who: Who, employeeId: string) => (await api(who, 'get', `/people/employees/${employeeId}/as-of`).expect(200)).body.payAccess as boolean;
  const decide = async (who: Who, id: string, body: Record<string, unknown>, status = 201) => {
    await markSteppedUp(tenantPrisma, token[who]);
    return (await api(who, 'post', `/people/pay-access/${id}/decision`).send(body).expect(status)).body;
  };
  const grants = () => tenantPrisma.forTenant(SUPER, (tx) => tx.roleGrant.findMany({ where: { organizationId: org.A.id, userId: users.mgr } }));
  const notices = (who: Who, type: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.userNotification.findMany({ where: { organizationId: org.A.id, recipientUserId: users[who], type } }));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    planId = (await prisma.plan.create({ data: { name: `payaccess-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Org ${k}`, slug: `payaccess-${k.toLowerCase()}-${runId}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    await tenantPrisma.forTenant(ctx('A'), async (tx) => {
      const o = { organizationId: org.A.id };
      ids.le = (await tx.legalEntity.create({ data: { ...o, name: 'Entity KF', shortName: 'KF', isDefault: true, employeeCodePrefix: 'KF' } })).id;
      ids.loc = (await tx.location.create({ data: { ...o, legalEntityId: ids.le, name: 'Site KF', code: 'KF', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      const id = randomUUID();
      await tx.department.create({ data: { ...o, id, name: 'Quality', code: 'Q', path: `/${id}/` } });
      ids.dept = id;
      ids.des = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
      ids.type = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'P', category: 'permanent' } })).id;
    });
    const profile = (keys: string[], name: string) => tenantPrisma.forTenant(ctx('A'), (tx) => tx.permissionProfile.create({ data: { organizationId: org.A.id, name, permissionsJson: JSON.stringify(keys) } })).then((p) => p.id);
    const hrChange = await profile(['employee.profile.view', 'employee.change.manage', 'employee.change.retro', 'employee.change.retro_override', 'employee.pay_access.approve'], 'HR who hires');
    const hrApprove = await profile(['employee.profile.view', 'employee.pay_access.approve'], 'HR approver');
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string | null][] = [
      ['hr1', 'A', 'panel', hrChange],
      ['hr2', 'A', 'panel', hrApprove],
      ['hr3', 'A', 'panel', hrChange],
      ['mgr', 'A', 'panel', null],
      ['loner', 'A', 'panel', null],
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [name, k, role, permissionProfileId] of roster) {
      users[name] = (await tenantPrisma.forTenant(ctx(k), (tx) => tx.user.create({ data: { organizationId: org[k].id, email: email(name), passwordHash, role, permissionProfileId } }))).id;
    }
    for (const [name, k] of roster.map((r) => [r[0], r[1]] as const)) {
      token[name] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: email(name), password: PASSWORD }).expect(200)).body.accessToken;
    }
    ids.hr1 = await hire('Hema', 'KF0001', { workEmail: email('hr1'), userId: users.hr1 });
    ids.mgr = await hire('Divya', 'KF0002', { workEmail: email('mgr'), userId: users.mgr });
    ids.loner = await hire('Lalit', 'KF0003', { workEmail: email('loner'), userId: users.loner });
    ids.arjun = await hire('Arjun', 'KF0010', {}, ids.mgr);
    ids.meera = await hire('Meera', 'KF0011', {}, ids.mgr);
    ids.ravi = await hire('Ravi', 'KF0012', {}, ids.hr1); // Hema's own report
    ids.out = await hire('Omar', 'KF0013', {}, ids.loner); // outside Divya's team
  }, 240_000);

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

  it('the manager sees their team and the company defaults (30 days, whole team); nobody else has a team', async () => {
    const mine = (await api('mgr', 'get', '/people/pay-access/mine').expect(200)).body;
    expect(mine).toMatchObject({ days: 30, scope: 'team', requests: [] });
    expect(mine.team.map((p: { id: string }) => p.id).sort()).toEqual([ids.arjun, ids.meera].sort());
    expect((await api('loner', 'get', '/people/pay-access/mine').expect(200)).body.team.map((p: { id: string }) => p.id)).toEqual([ids.out]);
    expect((await api('hr2', 'get', '/people/pay-access/mine').expect(200)).body.team).toEqual([]);
  });

  it('refuses a non-manager, a person outside the team, a missing person and a second open request', async () => {
    await api('hr2', 'post', '/people/pay-access').send({ scope: 'team', reason: 'Budget review' }).expect(403); // no reports
    await api('mgr', 'post', '/people/pay-access').send({ scope: 'person', employeeId: ids.out, reason: 'Budget review' }).expect(403);
    await api('mgr', 'post', '/people/pay-access').send({ scope: 'person', reason: 'Budget review' }).expect(400);
    await api('mgr', 'post', '/people/pay-access').send({ scope: 'team', reason: 'x' }).expect(400); // reason too short
    await api('adminB', 'post', '/people/pay-access').send({ scope: 'team', reason: 'Budget review' }).expect(403);
  });

  it('only HR with the key lists and decides; another company sees nothing', async () => {
    await api('mgr', 'get', '/people/pay-access').expect(403);
    await api('adminB', 'get', '/people/pay-access').expect(403);
    const list = (await api('hr2', 'get', '/people/pay-access').expect(200)).body;
    expect(list).toMatchObject({ days: 30, scope: 'team', rows: [] });
  });

  it('one person: two different HR people approve, HR changes the length, and only that person opens until the end date', async () => {
    expect(await payAccess('mgr', ids.arjun)).toBe(false);
    const asked = (await api('mgr', 'post', '/people/pay-access').send({ scope: 'person', employeeId: ids.arjun, reason: 'Retention case for Arjun' }).expect(201)).body;
    expect(asked).toMatchObject({ scope: 'person', person: { id: ids.arjun }, days: 30, state: 'first' });
    await api('mgr', 'post', '/people/pay-access').send({ scope: 'team', reason: 'Another one' }).expect(409);
    // The approvers hear of it and see it in their Approvals inbox and side-menu count; the manager does not decide.
    expect(await notices('hr2', 'employee.pay_access.approval_needed')).toHaveLength(1);
    const inbox = (await api('hr2', 'get', '/workflow/approvals/inbox').expect(200)).body as { requestId: string; decideAt: string; step: { index: number; of: number } }[];
    expect(inbox.find((x) => x.requestId === asked.id)).toMatchObject({ decideAt: '/yx/people/pay-access', step: { index: 1, of: 2 } });
    expect((await api('hr2', 'get', '/workspace/counts').expect(200)).body.approvals).toBeGreaterThanOrEqual(1);
    expect((await api('mgr', 'get', '/workflow/approvals/inbox').expect(200)).body.find((x: { requestId: string }) => x.requestId === asked.id)).toBeUndefined();

    const first = await decide('hr2', asked.id, { decision: 'approve', days: '15' });
    expect(first).toMatchObject({ state: 'second', days: 15, first: { by: expect.any(String) } });
    expect(await payAccess('mgr', ids.arjun)).toBe(false); // one approval opens nothing
    // The same HR person never gives both approvals; the second sees it in their inbox at step 2.
    await decide('hr2', asked.id, { decision: 'approve' }, 403);
    expect((await api('hr2', 'get', '/workflow/approvals/inbox').expect(200)).body.find((x: { requestId: string }) => x.requestId === asked.id)).toBeUndefined();
    expect((await api('hr3', 'get', '/workflow/approvals/inbox').expect(200)).body.find((x: { requestId: string }) => x.requestId === asked.id)).toMatchObject({ step: { index: 2, of: 2 } });
    expect(await notices('mgr', 'employee.pay_access.decided')).toHaveLength(1);

    const done = await decide('hr3', asked.id, { decision: 'approve' });
    expect(done).toMatchObject({ state: 'active', validTo: addDays(today, 14) });
    const [grant] = await grants();
    expect(grant).toMatchObject({ scopeType: 'one_report', employeeId: ids.arjun, status: 'active', grantedBy: users.hr2, decidedBy: users.hr3 });
    expect(grant.validTo?.toISOString().slice(0, 10)).toBe(addDays(today, 14));
    expect(await payAccess('mgr', ids.arjun)).toBe(true);
    expect(await payAccess('mgr', ids.meera)).toBe(false); // not in scope
    expect((await notices('mgr', 'employee.pay_access.decided')).length).toBe(2);
    expect(await notices('hr2', 'employee.pay_access.decided')).toHaveLength(1);
    await decide('hr1', asked.id, { decision: 'approve' }, 409); // already decided

    // After the end date the pay is hidden again, with no job: the grant simply stops counting.
    const ended = new Date(`${addDays(today, -1)}T00:00:00Z`);
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      await tx.roleGrant.update({ where: { id: grant.id }, data: { validFrom: new Date(`${addDays(today, -20)}T00:00:00Z`), validTo: ended } });
      await tx.payAccessRequest.update({ where: { id: asked.id }, data: { validTo: ended } });
    });
    expect(await payAccess('mgr', ids.arjun)).toBe(false);
    await api('mgr', 'get', `/payroll/employees/${ids.arjun}/compensation`).expect((r) => expect([403, 404]).toContain(r.status));
  });

  it('the requester never approves their own request, and HR cannot widen it past the team', async () => {
    const own = (await api('hr1', 'post', '/people/pay-access').send({ scope: 'team', reason: 'Appraisal planning' }).expect(201)).body;
    await decide('hr1', own.id, { decision: 'approve' }, 403);
    // Narrowed to someone outside Hema's team: refused (scope never exceeds the manager's reports).
    await decide('hr2', own.id, { decision: 'approve', scope: 'person', employeeId: ids.arjun }, 400);
    await decide('hr2', own.id, { decision: 'refuse', note: 'Not needed now' });
  });

  it('a refused request grants nothing; refusing needs a reason; the whole team at once when approved', async () => {
    const before = (await grants()).length;
    const asked = (await api('mgr', 'post', '/people/pay-access').send({ scope: 'team', reason: 'Increment cycle' }).expect(201)).body;
    await decide('hr2', asked.id, { decision: 'refuse' }, 400);
    const refused = await decide('hr2', asked.id, { decision: 'refuse', note: 'Wait for the cycle to open' });
    expect(refused).toMatchObject({ state: 'refused', decided: { note: 'Wait for the cycle to open' } });
    expect((await grants()).length).toBe(before);
    expect(await payAccess('mgr', ids.meera)).toBe(false);
    const refusals = await notices('mgr', 'employee.pay_access.decided');
    expect(refusals.some((n) => /refused/.test(n.contextText ?? ''))).toBe(true);

    // Asked again: the team, approved by two HR people with the company default length.
    const again = (await api('mgr', 'post', '/people/pay-access').send({ scope: 'team', reason: 'Increment cycle is open' }).expect(201)).body;
    await decide('hr3', again.id, { decision: 'approve' });
    const done = await decide('hr2', again.id, { decision: 'approve' });
    expect(done).toMatchObject({ state: 'active', validTo: addDays(today, 29) });
    expect(await payAccess('mgr', ids.meera)).toBe(true);
    expect(await payAccess('mgr', ids.arjun)).toBe(true);
    await api('mgr', 'get', `/people/employees/${ids.out}/as-of`).expect(404); // outside the team: not even the record
    // The manager's list shows each request's state.
    const mine = (await api('mgr', 'get', '/people/pay-access/mine').expect(200)).body.requests.map((r: { state: string }) => r.state);
    expect(mine).toEqual(['active', 'refused', 'ended']);
  });

  it('the database itself refuses one HR person giving both approvals', async () => {
    const r = await tenantPrisma.forTenant(ctx('A'), (tx) => tx.payAccessRequest.create({ data: { organizationId: org.A.id, requestedBy: users.loner, managerEmployeeId: ids.loner, scope: 'team', reason: 'Check', days: 30, firstBy: users.hr2 } }));
    await expect(tenantPrisma.forTenant(ctx('A'), (tx) => tx.payAccessRequest.update({ where: { id: r.id }, data: { status: 'refused', decidedBy: users.hr2, decidedAt: new Date() } }))).rejects.toThrow(/four_eyes/);
    await expect(tenantPrisma.forTenant(ctx('A'), (tx) => tx.payAccessRequest.update({ where: { id: r.id }, data: { firstBy: users.loner } }))).rejects.toThrow(/four_eyes/);
  });

  it('the grants use one role with employee.salary.view only, which an admin cannot widen', async () => {
    const roles = await tenantPrisma.forTenant(SUPER, (tx) => tx.permissionProfile.findMany({ where: { organizationId: org.A.id, templateKey: 'pay_access' } }));
    expect(roles).toHaveLength(1);
    expect(JSON.parse(roles[0].permissionsJson)).toEqual(['employee.salary.view']);
    await markSteppedUp(tenantPrisma, token.adminA);
    await api('adminA', 'patch', `/organizations/permission-profiles/${roles[0].id}`).send({ permissions: ['employee.salary.view', 'org.settings.manage'] }).expect(409);
  });
});
