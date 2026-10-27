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
import { RestructureService } from '../src/people/restructure.service';
import { markSteppedUp } from './fixtures/step-up';

// PPL-04 inter-entity transfer of one person (P01 YX-ORG-17; founder 27 Oct 2026), against the real database (forced
// RLS). The Change action sends a one-person restructure (PPL-09 engine): the old employment ends the day before without
// a settlement and a new one opens on the same employee record, with the company's transfer defaults (Settings) or HR's
// choice; the PPL-10 continuity checklist follows. Positive and negative.
describe('Inter-entity transfer of one person (PPL-04 on the PPL-09 engine, PPL-10)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let restructures: RestructureService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const today = todayIst();
  const joined = addDays(today, -400);
  const DEFAULTS = { leave: 'carry', service: 'keep', code: 'keep', salary: 'keep' };

  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  type Who = 'hr' | 'approver' | 'hrKf' | 'viewer' | 'adminB';
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const ids: Record<string, string> = {};
  const ctx = (k: 'A' | 'B') => ({ organizationId: org[k].id, isSuperAdmin: false });
  const email = (who: string) => `${who}-${runId}@move.test`;
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant(SUPER, fn);
  // What the Change action sends for one person.
  const move = (employee: string, effectiveDate: string, over: Record<string, unknown> = {}) => ({ kind: 'demerge', fromEntityId: ids.leKF, intoEntityId: ids.leTN, effectiveDate, employeeIds: [ids[employee]], target: { locationId: ids.locTN }, defaults: DEFAULTS, reason: 'The Chennai sales team now sits under the Tamil Nadu entity.', ...over });
  const preview = async (body: object) => (await api('hr', 'post', '/people/restructures/preview').send(body).expect(200)).body;
  const approveChange = async (changeId: string) => {
    await markSteppedUp(tenantPrisma, token.approver);
    return api('approver', 'post', `/people/changes/${changeId}/approve`).send({});
  };
  const send = async (body: object) => {
    const { id } = (await api('hr', 'post', '/people/restructures').send(body).expect(201)).body;
    await markSteppedUp(tenantPrisma, token.approver);
    return { id: id as string, view: (await api('approver', 'post', `/people/restructures/${id}/approve`).send({}).expect(200)).body };
  };
  const employments = (employeeId: string) => inA((tx) => tx.employment.findMany({ where: { organizationId: org.A.id, employeeId }, orderBy: { joinedOn: 'asc' } }));
  const items = async (restructureId: string, employee: string) => (await api('approver', 'get', `/people/restructures/continuity?restructureId=${restructureId}&employeeId=${ids[employee]}`).expect(200)).body as { id: string; key: string; status: string; version: number }[];
  const payOn = (employmentId: string) =>
    inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.leTN}}`}, true)`;
      return tx.compensation.findMany({ where: { organizationId: org.A.id, employmentId, supersededAt: null } });
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    restructures = moduleRef.get(RestructureService);

    planId = (await prisma.plan.create({ data: { name: `move-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Org ${k}`, slug: `move-${k.toLowerCase()}-${runId}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const masters = async (k: 'A' | 'B', tag: string, isDefault: boolean, state: string) =>
      tenantPrisma.forTenant(ctx(k), async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`le${tag}`] = (await tx.legalEntity.create({ data: { ...o, name: `Entity ${tag}`, shortName: tag, isDefault, employeeCodePrefix: tag } })).id;
        ids[`loc${tag}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`le${tag}`], name: `Site ${tag}`, code: tag, address: {}, country: 'IN', state, timezone: 'Asia/Kolkata' } })).id;
      });
    await masters('A', 'KF', true, 'IN-KA');
    await masters('A', 'TN', false, 'IN-TN');
    await masters('B', 'BB', true, 'IN-KA');
    await tenantPrisma.forTenant(ctx('A'), async (tx) => {
      const o = { organizationId: org.A.id };
      const id = randomUUID();
      await tx.department.create({ data: { ...o, id, name: 'Sales', code: 'SAL', path: `/${id}/` } });
      ids.dept = id;
      ids.des = (await tx.designation.create({ data: { ...o, name: 'Account Executive', code: 'AE' } })).id;
      ids.type = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'P', category: 'permanent' } })).id;
      // A designation only the old entity uses: choosing it for the new entity is refused.
      ids.desKf = (await tx.designation.create({ data: { ...o, name: 'Plant Lead', code: 'PL', ownerLegalEntityId: ids.leKF } })).id;
      // An employment type only the old entity uses: a move must choose another (founder walkthrough 27 Oct 2026).
      ids.typeKf = (await tx.employmentType.create({ data: { ...o, name: 'Fixed-term (plant)', code: 'FTP', category: 'fixed_term', ownerLegalEntityId: ids.leKF } })).id;
    });

    const profile = (keys: string[], name: string) => tenantPrisma.forTenant(ctx('A'), (tx) => tx.permissionProfile.create({ data: { organizationId: org.A.id, name, permissionsJson: JSON.stringify(keys) } })).then((p) => p.id);
    const retro = ['employee.change.retro', 'employee.change.retro_override'];
    const hr = await profile(['employee.profile.view', 'employee.change.manage', ...retro, 'employee.salary.view', 'employee.salary.manage'], 'HR');
    const approver = await profile(['employee.profile.view', 'employee.change.manage', 'employee.change.approve', ...retro, 'employee.salary.view'], 'HR approver');
    const viewer = await profile(['employee.profile.view'], 'Viewer');
    ids.kfOnly = await profile(['employee.profile.view', 'employee.change.manage'], 'KF HR');
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string | null][] = [
      ['hr', 'A', 'panel', hr],
      ['approver', 'A', 'panel', approver],
      ['hrKf', 'A', 'panel', null],
      ['viewer', 'A', 'panel', viewer],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [name, k, role, permissionProfileId] of roster) {
      users[name] = (await tenantPrisma.forTenant(ctx(k), (tx) => tx.user.create({ data: { organizationId: org[k].id, email: email(name), passwordHash, role, permissionProfileId } }))).id;
    }
    await tenantPrisma.forTenant(ctx('A'), (tx) =>
      tx.roleGrant.create({ data: { organizationId: org.A.id, userId: users.hrKf, permissionProfileId: ids.kfOnly, scopeType: 'legal_entity', legalEntityId: ids.leKF, validFrom: new Date(`${addDays(today, -30)}T00:00:00Z`), status: 'active', reason: 'KF HR' } }),
    );
    for (const [name, k] of roster.map((r) => [r[0], r[1]] as const)) {
      token[name] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: email(name), password: PASSWORD }).expect(200)).body.accessToken;
    }
    const hire = async (givenName: string, code: string, employmentTypeId = ids.type) => {
      const out = (
        await api('hr', 'post', '/people/employees')
          .send({ legalEntityId: ids.leKF, employeeCode: code, givenName, status: 'confirmed', reason: 'Joined', overrideReason: 'Joined before go-live', joinedOn: joined, assignment: { locationId: ids.locKF, departmentId: ids.dept, designationId: ids.des, employmentTypeId, managerEmployeeId: null }, compensation: { annualCtc: '690000' } })
          .expect(201)
      ).body;
      await approveChange(out.payChangeId).then((r) => expect([r.status, r.body.message]).toEqual([201, undefined]));
      return out.id as string;
    };
    ids.rahul = await hire('Rahul', 'KF0088');
    ids.imran = await hire('Imran', 'KF0089');
    ids.selvi = await hire('Selvi', 'KF0090');
    ids.anbu = await hire('Anbu', 'KF0103', ids.typeKf);
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

  it('starts from the company defaults (Settings › Inter-entity transfer defaults); HR only', async () => {
    expect((await api('hr', 'get', '/people/restructures/setup').expect(200)).body.defaults).toEqual(DEFAULTS);
    await api('viewer', 'get', '/people/restructures/setup').expect(403);
    await inA((tx) => tx.setting.create({ data: { organizationId: org.A.id, key: 'transfer.leave', scopeType: 'tenant', scopeId: org.A.id, value: 'lapse' } }));
    expect((await api('hr', 'get', '/people/restructures/setup').expect(200)).body.defaults.leave).toBe('lapse');
    await inA((tx) => tx.setting.deleteMany({ where: { organizationId: org.A.id, key: 'transfer.leave' } }));
  });

  it('refuses a move that cannot happen: same entity, a place or job of the old entity, outside the grant, before joining', async () => {
    const bad = (who: Who, body: object) => api(who, 'post', '/people/restructures/preview').send(body);
    expect((await bad('hr', move('rahul', today, { intoEntityId: ids.leKF })).expect(400)).body.message).toBe('People move into another legal entity.');
    expect((await bad('hr', move('rahul', today, { target: { locationId: ids.locKF } })).expect(400)).body.message).toBe('Each new location is a location of Entity TN.');
    expect((await bad('hr', move('rahul', today, { target: {} })).expect(400)).body.message).toBe('Choose the location in Entity TN for Site KF.');
    const job = await preview(move('rahul', today, { target: { locationId: ids.locTN, designationId: ids.desKf } }));
    expect(job.people).toEqual([expect.objectContaining({ employeeId: ids.rahul, status: 'failed', reason: expect.stringMatching(/not available to the employee's legal entity/) })]);
    await api('hr', 'post', '/people/restructures').send(move('rahul', today, { target: { locationId: ids.locTN, designationId: ids.desKf } })).expect(400);
    expect((await preview({ ...move('rahul', joined), overrideReason: 'Checking the joining day rule' })).people[0].reason).toMatch(/^Joins on .*on or after the move/);
    // HR whose grant covers only the old entity cannot move anyone out of it; nobody else plans moves at all.
    expect((await bad('hrKf', move('rahul', today, { defaults: { ...DEFAULTS, salary: 'new' } })).expect(200)).body.people[0].reason).toMatch(/does not cover that legal entity/);
    await bad('viewer', move('rahul', today)).expect(403);
    expect((await bad('adminB', move('rahul', today)).expect(400)).body.message).toBe('Choose a legal entity of this company to move people from.');
  });

  it('moves only that person today: the old employment ends yesterday, the new one keeps code, service and pay', async () => {
    const check = await preview(move('rahul', today));
    expect(check.people).toEqual([expect.objectContaining({ employeeId: ids.rahul, status: 'ready', to: expect.objectContaining({ entity: 'Entity TN', code: 'KF0088', location: 'Site TN' }), service: { from: joined, kept: true }, pay: 'kept' })]);
    // Nobody approves their own move.
    const { id } = (await api('hr', 'post', '/people/restructures').send(move('rahul', today)).expect(201)).body;
    ids.rahulMove = id;
    await markSteppedUp(tenantPrisma, token.hr);
    await api('hr', 'post', `/people/restructures/${id}/approve`).send({}).expect(403);
    await markSteppedUp(tenantPrisma, token.approver);
    const view = (await api('approver', 'post', `/people/restructures/${id}/approve`).send({}).expect(200)).body;
    expect(view).toMatchObject({ status: 'done', moved: 1, failed: 0, title: 'Move Rahul from Entity KF to Entity TN' });

    const [old, next] = await employments(ids.rahul);
    expect(old.exitedOn?.toISOString().slice(0, 10)).toBe(addDays(today, -1));
    expect(next).toMatchObject({ legalEntityId: ids.leTN, employeeCode: 'KF0088', rehireOf: old.id, exitedOn: null });
    expect(next.continuousServiceFrom?.toISOString().slice(0, 10)).toBe(joined);
    expect((await payOn(next.id)).map((p) => p.annualCtc.toFixed(2))).toEqual(['690000.00']);
    expect((await api('hr', 'get', `/people/employees/${ids.rahul}/service-dates`).expect(200)).body).toMatchObject({ companyStart: joined, employerStart: today, continuousServiceFrom: joined });
    // No joiner journey for a move; the others in the entity stay.
    expect(await inA((tx) => tx.eventOutbox.count({ where: { organizationId: org.A.id, eventType: 'employee.joined', payload: { path: ['employmentId'], equals: next.id } } }))).toBe(0);
    expect((await employments(ids.selvi)).map((e) => e.exitedOn)).toEqual([null]);
  });

  it('opens the continuity checklist: carried items done, the rest open until payroll ticks them off', async () => {
    const list = await items(ids.rahulMove, 'rahul');
    const status = Object.fromEntries(list.map((i) => [i.key, i.status]));
    expect(status).toMatchObject({ uan: 'open', esi: 'open', form12b: 'open', declarations: 'open', leave: 'done', gratuity: 'done', pay: 'done' });
    const uan = list.find((i) => i.key === 'uan')!;
    await api('approver', 'put', `/people/restructures/continuity/${uan.id}`).send({ done: true, version: uan.version }).expect(200);
    expect((await items(ids.rahulMove, 'rahul')).filter((i) => i.status === 'open').map((i) => i.key).sort()).toEqual(['declarations', 'esi', 'form12b']);
    await api('viewer', 'get', `/people/restructures/continuity?restructureId=${ids.rahulMove}&employeeId=${ids.rahul}`).expect(403);
  });

  it('a later move waits for its day, then the daily run makes it with HR’s options for that person', async () => {
    const day = addDays(today, 10);
    const { id, view } = await send(move('imran', day, { defaults: { leave: 'lapse', service: 'restart', code: 'new', salary: 'new' } }));
    expect(view.status).toBe('scheduled');
    expect((await employments(ids.imran)).map((e) => e.exitedOn)).toEqual([null]);
    expect(await restructures.runDue(day)).toBeGreaterThanOrEqual(1);
    const [old, next] = await employments(ids.imran);
    expect(old.exitedOn?.toISOString().slice(0, 10)).toBe(addDays(day, -1));
    expect(next).toMatchObject({ legalEntityId: ids.leTN, employeeCode: 'TN0001' });
    expect(next.continuousServiceFrom?.toISOString().slice(0, 10)).toBe(day);
    // A new structure: nothing is carried; payroll holds the person until a salary is approved.
    expect(await payOn(next.id)).toEqual([]);
    const status = Object.fromEntries((await items(id, 'imran')).map((i) => [i.key, i.status]));
    expect(status).toMatchObject({ gratuity: 'open', pay: 'open' });
  });

  it('an employment type only for the old entity must be chosen anew; then the person moves with it', async () => {
    const body = move('anbu', today, { defaults: { ...DEFAULTS, salary: 'new' } });
    expect((await api('hr', 'post', '/people/restructures/preview').send(body).expect(400)).body.message).toBe('Choose what Fixed-term (plant) becomes in Entity TN.');
    const { view } = await send({ ...body, target: { locationId: ids.locTN, employmentTypeId: ids.type } });
    expect(view).toMatchObject({ status: 'done', moved: 1 });
    const [, next] = await employments(ids.anbu);
    const a = await inA((tx) => tx.employeeAssignment.findFirstOrThrow({ where: { organizationId: org.A.id, employmentId: next.id, supersededAt: null } }));
    expect(a).toMatchObject({ legalEntityId: ids.leTN, employmentTypeId: ids.type });
  });

  it('a kept code that is someone else’s in the new series cannot move, with the reason', async () => {
    await inA(async (tx) => {
      const e = await tx.employment.findFirstOrThrow({ where: { organizationId: org.A.id, employeeId: ids.selvi } });
      await tx.employment.update({ where: { id: e.id }, data: { employeeCode: 'TN0001' } });
    });
    expect((await preview(move('selvi', today))).people[0]).toMatchObject({ status: 'failed', reason: 'That employee code is already used in the new legal entity. Choose a new code.' });
  });
});
