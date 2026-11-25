import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';
import { giveStaffRoles } from './fixtures/staff-roles';

// YukthiX console C-1, the rules engine (founder answers 1041 to 1044, 1058), against the real database.
// Staff only (PlatformStaffGuard + the Rules editor key, platform.statutory.manage); the drafter sends a draft for review;
// a second member of staff asks for changes (back to draft with a note) or publishes with the security key again; a
// golden-case dry run saves nothing; the impact count is numbers only, read through the audited platformRead.
describe('Console C-1: rules engine (1041 to 1044)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  let orgId = '';
  let orgName = '';
  let planId = '';
  type Who = 'drafter' | 'reviewer' | 'staffNoKey' | 'adminA' | 'plainA';
  const api = (who: Who | 'none', method: 'get' | 'post' | 'patch', path: string) => {
    const r = request(server())[method](`/api/v1/platform/statutory${path}`);
    return who === 'none' ? r : r.set('Authorization', `Bearer ${token[who]}`);
  };
  const day = (s: string) => new Date(`${s}T00:00:00Z`);
  const slabs = [{ from: '0', to: '24999.99', amount: '0' }, { from: '25000', to: null, amount: '200' }];
  const rule = (version: string, over: Record<string, unknown> = {}) => ({
    statute: 'IN.PT',
    jurisdiction: 'IN-ZZ',
    version,
    validFrom: '2099-04-01',
    values: { kind: 'pt', basis: 'monthly', annualCap: '2500', slabs },
    source: 'Test state PT Act (e2e only; a jurisdiction no company uses).',
    lawVersion: 'OLD-ACT',
    verify: true,
    golden: [{ name: '25,000 in May: 200', fn: 'pt', input: { ptWage: '25000', month: 5 }, expected: { amount: '200' } }],
    changeNote: 'Test rule for the console.',
    ...over,
  });
  const audits = (entityId: string, action: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { entityId, action } }));
  const row = (id: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.statutoryRuleSet.findUniqueOrThrow({ where: { id } }));

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    for (const who of ['drafter', 'reviewer', 'staffNoKey'] as const) {
      const email = `c1-${who.toLowerCase()}-${run}@platform.test`;
      users[who] = (await tenantPrisma.forTenant(SUPER, (tx) => tx.user.create({ data: { email, name: `Staff ${who}`, passwordHash, role: 'super_admin', organizationId: null } }))).id;
      // Staff roles (answer 1058): these suites test the console routes, so their staff hold every role.
      await giveStaffRoles(users[who]!);
      token[who] = (await request(server()).post('/api/v1/auth/platform/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await markSteppedUp(tenantPrisma, token.drafter!);
    await markSteppedUp(tenantPrisma, token.reviewer!);
    planId = (await prisma.plan.create({ data: { name: `c1-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    orgName = `C1 Rules Co ${run}`;
    const slug = `c1-${run}`;
    orgId = (await prisma.organization.create({ data: { name: orgName, slug, planId } })).id;
    for (const [who, role] of [['adminA', 'org_admin'], ['plainA', 'panel']] as const) {
      const email = `${who.toLowerCase()}-${run}@c1.test`;
      users[who] = (await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: orgId, email, name: who, passwordHash, role } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await markSteppedUp(tenantPrisma, token.adminA!);
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const ids = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: ids } } });
        await tx.session.deleteMany({ where: { userId: { in: ids } } });
        await tx.organization.deleteMany({ where: { id: orgId } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('staff only: no session, a company user, a company admin and staff without their security key are all refused', async () => {
    await api('none', 'get', '/rule-sets').expect(401);
    await api('plainA', 'get', '/rule-sets').expect(403);
    await api('adminA', 'get', '/rule-sets').expect(403);
    await api('adminA', 'post', '/rule-sets').send(rule(`a${run}`)).expect(403);
    expect((await api('staffNoKey', 'get', '/rule-sets').expect(403)).body.code).toBe('MFA_REQUIRED');
    expect((await api('drafter', 'get', '/rule-sets').expect(200)).body.length).toBeGreaterThan(0);
  });

  describe('1042 review, 1041 publish', () => {
    let id = '';
    it('the drafter saves a draft; bad input is refused; it shows as a draft with the drafter named', async () => {
      await api('drafter', 'post', '/rule-sets').send(rule(`b${run}`, { golden: [{ name: '', fn: 'pt', input: {}, expected: {} }] })).expect(400);
      await api('drafter', 'post', '/rule-sets').send(rule(`b${run}`, { values: { kind: 'pt', basis: 'monthly', annualCap: '2500', slabs: [{ from: '10', to: null, amount: '0' }] } })).expect(400);
      id = (await api('drafter', 'post', '/rule-sets').send(rule(`r${run}`)).expect(201)).body.id;
      const one = (await api('reviewer', 'get', `/rule-sets/${id}`).expect(200)).body;
      expect(one).toMatchObject({ state: 'draft', draftedByName: 'Staff drafter', changeNote: 'Test rule for the console.', review: null, golden: [expect.objectContaining({ name: '25,000 in May: 200' })] });
      expect((await audits(id, 'platform.statutory.drafted'))[0]).toMatchObject({ actorUserId: users.drafter });
    });

    it('negative: nobody publishes a draft that is not in review; only the drafter sends it for review', async () => {
      await api('reviewer', 'post', `/rule-sets/${id}/publish`).expect(409);
      await api('reviewer', 'post', `/rule-sets/${id}/send-for-review`).expect(403);
      await api('reviewer', 'post', `/rule-sets/${id}/request-changes`).send({ note: 'Please add a February case.' }).expect(409);
      await api('drafter', 'post', `/rule-sets/${id}/send-for-review`).expect(200);
      expect((await api('drafter', 'get', `/rule-sets/${id}`).expect(200)).body.state).toBe('in review');
      // In review it cannot be changed or sent again.
      await api('drafter', 'patch', `/rule-sets/${id}`).send(rule(`r${run}`)).expect(400);
      const { statute: _s, jurisdiction: _j, version: _v, ...upd } = rule(`r${run}`);
      await api('drafter', 'patch', `/rule-sets/${id}`).send(upd).expect(409);
      await api('drafter', 'post', `/rule-sets/${id}/send-for-review`).expect(409);
    });

    it('negative: the drafter can neither ask for changes on nor publish (approve) their own version', async () => {
      await api('drafter', 'post', `/rule-sets/${id}/request-changes`).send({ note: 'Looks fine to me, approve.' }).expect(403);
      await api('drafter', 'post', `/rule-sets/${id}/publish`).expect(403);
      expect((await row(id)).status).toBe('in_review');
    });

    it('changes requested goes back to draft with a note the drafter reads; a short note is refused; audited', async () => {
      await api('reviewer', 'post', `/rule-sets/${id}/request-changes`).send({ note: 'short' }).expect(400);
      const r = (await api('reviewer', 'post', `/rule-sets/${id}/request-changes`).send({ note: 'Add a February case: Karnataka collects 300.' }).expect(200)).body;
      expect(r).toMatchObject({ status: 'draft', state: 'changes requested' });
      const one = (await api('drafter', 'get', `/rule-sets/${id}`).expect(200)).body;
      expect(one).toMatchObject({ status: 'draft', state: 'changes requested', review: { note: 'Add a February case: Karnataka collects 300.', by: 'Staff reviewer' } });
      expect((await audits(id, 'platform.statutory.changes_requested'))[0]).toMatchObject({ actorUserId: users.reviewer });
      // Only the drafter changes the draft.
      const { statute: _s, jurisdiction: _j, version: _v, ...upd } = rule(`r${run}`);
      const changed = { ...upd, golden: [...upd.golden, { name: '25,000 in February: 200', fn: 'pt', input: { ptWage: '25000', month: 2 }, expected: { amount: '200' } }] };
      await api('reviewer', 'patch', `/rule-sets/${id}`).send(changed).expect(403);
      await api('drafter', 'patch', `/rule-sets/${id}`).send(changed).expect(200);
      expect((await api('drafter', 'get', `/rule-sets/${id}`).expect(200)).body.golden).toHaveLength(2);
    });

    it('1041: publishing needs the security key again (step-up), then the reviewer publishes it; the drafter never', async () => {
      await api('drafter', 'post', `/rule-sets/${id}/send-for-review`).expect(200);
      // A security key proven 20 minutes ago is not fresh enough to publish (reading still works).
      const { sid } = JSON.parse(Buffer.from(token.reviewer!.split('.')[1]!, 'base64url').toString()) as { sid: string };
      await tenantPrisma.forTenant(SUPER, (tx) => tx.session.update({ where: { id: sid }, data: { mfaVerifiedAt: new Date(Date.now() - 20 * 60_000) } }));
      await api('reviewer', 'get', `/rule-sets/${id}`).expect(200);
      expect((await api('reviewer', 'post', `/rule-sets/${id}/publish`).expect(403)).body.code).toBe('STEP_UP_REQUIRED');
      expect((await row(id)).status).toBe('in_review');
      await markSteppedUp(tenantPrisma, token.reviewer!);
      await api('reviewer', 'post', `/rule-sets/${id}/publish`).expect(200);
      expect(await row(id)).toMatchObject({ status: 'published', draftedBy: users.drafter, reviewedBy: users.reviewer });
      expect((await audits(id, 'platform.statutory.published'))[0]).toMatchObject({ actorUserId: users.reviewer });
      await api('reviewer', 'post', `/rule-sets/${id}/publish`).expect(409);
      const { statute: _s, jurisdiction: _j, version: _v, ...upd } = rule(`r${run}`);
      await api('drafter', 'patch', `/rule-sets/${id}`).send(upd).expect(409);
    });
  });

  it('1043: the golden-case dry run shows each case passing or failing and changes nothing', async () => {
    const id = (await api('drafter', 'post', '/rule-sets').send(rule(`d${run}`, { golden: [
      { name: '25,000 in May: 200', fn: 'pt', input: { ptWage: '25000', month: 5 }, expected: { amount: '200' } },
      { name: '25,000 in February: 300', fn: 'pt', input: { ptWage: '25000', month: 2 }, expected: { amount: '300' } },
    ] })).expect(201)).body.id;
    const before = { row: await row(id), cases: await tenantPrisma.forTenant(SUPER, (tx) => tx.statutoryGoldenCase.findMany({ where: { ruleSetId: id }, orderBy: { name: 'asc' } })) };
    const res = (await api('drafter', 'post', `/rule-sets/${id}/run`).expect(200)).body;
    expect(res).toMatchObject({ passed: 1, total: 2, problems: [] });
    expect(res.cases.find((c: { name: string }) => c.name === '25,000 in February: 300')).toMatchObject({ pass: false, actual: { amount: '200' }, expected: { amount: '300' } });
    await api('reviewer', 'post', `/rule-sets/${id}/run`).expect(200);
    const after = { row: await row(id), cases: await tenantPrisma.forTenant(SUPER, (tx) => tx.statutoryGoldenCase.findMany({ where: { ruleSetId: id }, orderBy: { name: 'asc' } })) };
    expect(after).toEqual(before);
    expect(after.row.status).toBe('draft');
    expect(await audits(id, 'platform.statutory.golden_run')).toHaveLength(2);
    expect(await audits(id, 'platform.statutory.published')).toHaveLength(0);
    await api('adminA', 'post', `/rule-sets/${id}/run`).expect(403);
  });

  it('1044: the impact is numbers only (companies, employees, by size), read through the audited platformRead; never a name', async () => {
    const id = (await api('drafter', 'post', '/rule-sets').send(rule(`k${run}`, { jurisdiction: 'IN-KA', validFrom: '2026-04-01' })).expect(201)).body.id;
    const before = (await api('reviewer', 'get', `/rule-sets/${id}/impact`).expect(200)).body;
    // Two people of one company start working in Karnataka today.
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, async (tx) => {
      const entity = await tx.legalEntity.create({ data: { organizationId: orgId, name: 'C1 Ltd', shortName: `C1-${run}` } });
      const location = await tx.location.create({ data: { organizationId: orgId, legalEntityId: entity.id, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } });
      const deptId = randomUUID();
      const department = await tx.department.create({ data: { id: deptId, organizationId: orgId, name: 'Ops', code: 'OPS', path: `/${deptId}/` } });
      const designation = await tx.designation.create({ data: { organizationId: orgId, name: 'Operator', code: 'OP' } });
      const type = await tx.employmentType.create({ data: { organizationId: orgId, name: 'Permanent', code: 'PERM', category: 'permanent' } });
      for (const [i, given] of ['Lakshmi', 'Ravi'].entries()) {
        const person = await tx.person.create({ data: { organizationId: orgId, givenName: given } });
        const employee = await tx.employee.create({ data: { organizationId: orgId, personId: person.id, givenName: given } });
        const employment = await tx.employment.create({ data: { organizationId: orgId, employeeId: employee.id, legalEntityId: entity.id, employeeCode: `E${i}`, codeScopeKey: entity.id, joinedOn: day('2026-04-01') } });
        const join = await tx.employeeChange.create({ data: { organizationId: orgId, employeeId: employee.id, employmentId: employment.id, changeType: 'join', effectiveDate: day('2026-04-01'), status: 'effective', appliedAt: new Date(), payload: {}, reason: 'join' } });
        await tx.employeeAssignment.create({ data: { organizationId: orgId, legalEntityId: entity.id, employeeId: employee.id, employmentId: employment.id, validFrom: day('2026-04-01'), locationId: location.id, departmentId: department.id, designationId: designation.id, employmentTypeId: type.id, changeId: join.id } });
      }
    });
    const res = await api('reviewer', 'get', `/rule-sets/${id}/impact`).expect(200);
    const after = res.body;
    expect(Object.keys(after).sort()).toEqual(['bySize', 'companies', 'countable', 'employees', 'id', 'jurisdiction', 'pastDated', 'validFrom']);
    expect(after).toMatchObject({ countable: true, jurisdiction: 'IN-KA', pastDated: true, validFrom: '2026-04-01' });
    expect(after.companies - before.companies).toBe(1);
    expect(after.employees - before.employees).toBe(2);
    expect(after.bySize.map((b: { size: string }) => b.size)).toEqual(['Under 50', '50–200', '200–1,000', '1,000+']);
    for (const b of after.bySize) expect(Object.keys(b).sort()).toEqual(['companies', 'employees', 'size']);
    // Never a name or an id of a company or a person.
    for (const secret of [orgName, orgId, 'Lakshmi', 'Ravi', 'Bengaluru', users.adminA!]) expect(res.text).not.toContain(secret);
    const reads = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { actorUserId: users.reviewer, action: 'platform.cross_tenant_read' }, orderBy: { createdAt: 'desc' }, take: 1 }));
    expect(JSON.parse(reads[0]!.metadataJson!)).toEqual({ purpose: `statutory.impact IN.PT IN-KA k${run}` });
    // A jurisdiction no location uses has no companies; a company admin cannot ask.
    const none = (await api('reviewer', 'get', `/rule-sets/${(await api('drafter', 'post', '/rule-sets').send(rule(`z${run}`)).expect(201)).body.id}/impact`).expect(200)).body;
    expect(none).toMatchObject({ countable: true, companies: 0, employees: 0, pastDated: false });
    await api('adminA', 'get', `/rule-sets/${id}/impact`).expect(403);
    await api('reviewer', 'get', `/rule-sets/${randomUUID()}/impact`).expect(404);
  });
});
