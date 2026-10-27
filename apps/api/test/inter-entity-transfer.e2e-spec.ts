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
import { AutomationService } from '../src/rules-engine/automation.service';
import { EmployeeHistoryService } from '../src/employee-history/employee-history.service';
import { openContinuity } from '../src/lifecycle/continuity-items';
import { markSteppedUp } from './fixtures/step-up';

// PPL-04 inter-entity transfer and PPL-10 continuity checklist (P01 YX-ORG-17; founder 27 Oct 2026), against the real
// database (forced RLS): the move ends the employment in one entity without a settlement and opens one in the other
// on the same employee, with the company's default options (transfer.* settings) or HR's choice for this move; its
// continuity checklist runs on the journey engine and shows in payroll pre-flight. Positive and negative.
describe('Inter-entity transfer and its continuity checklist (PPL-04, PPL-10)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let automation: AutomationService;
  let history: EmployeeHistoryService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const today = todayIst();
  const joined = addDays(today, -400);

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
  const move = (employee: string, effectiveDate: string, transfer: Record<string, unknown>) => ({ employeeId: ids[employee], changeType: 'entity_transfer', effectiveDate, reason: 'The Chennai sales team now sits under the Tamil Nadu entity.', payload: { transfer: { legalEntityId: ids.leTN, locationId: ids.locTN, options: {}, ...transfer } } });
  const approve = async (changeId: string) => {
    await markSteppedUp(tenantPrisma, token.approver);
    return api('approver', 'post', `/people/changes/${changeId}/approve`).send({});
  };
  const drain = async (until: () => Promise<boolean>) => {
    for (let i = 0; i < 40; i++) {
      await automation.dispatch();
      if (await until()) return true;
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  };
  const employments = (employeeId: string) => inA((tx) => tx.employment.findMany({ where: { organizationId: org.A.id, employeeId }, orderBy: { joinedOn: 'asc' } }));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    automation = moduleRef.get(AutomationService);
    history = moduleRef.get(EmployeeHistoryService);

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
    // Company-wide masters, open to both entities.
    await tenantPrisma.forTenant(ctx('A'), async (tx) => {
      const o = { organizationId: org.A.id };
      const id = randomUUID();
      await tx.department.create({ data: { ...o, id, name: 'Sales', code: 'SAL', path: `/${id}/` } });
      ids.dept = id;
      ids.des = (await tx.designation.create({ data: { ...o, name: 'Account Executive', code: 'AE' } })).id;
      ids.type = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'P', category: 'permanent' } })).id;
      // A designation only the old entity uses: a move with it must choose another.
      ids.desKf = (await tx.designation.create({ data: { ...o, name: 'Plant Lead', code: 'PL', ownerLegalEntityId: ids.leKF } })).id;
    });

    const profile = (keys: string[], name: string) => tenantPrisma.forTenant(ctx('A'), (tx) => tx.permissionProfile.create({ data: { organizationId: org.A.id, name, permissionsJson: JSON.stringify(keys) } })).then((p) => p.id);
    const hr = await profile(['employee.profile.view', 'employee.change.manage', 'employee.change.retro', 'employee.change.retro_override', 'employee.salary.view', 'employee.salary.manage', 'lifecycle.onboarding.view'], 'HR');
    const approver = await profile(['employee.profile.view', 'employee.change.approve', 'employee.change.retro', 'employee.change.retro_override', 'employee.salary.view', 'lifecycle.onboarding.view'], 'HR approver');
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
    const hire = async (givenName: string, code: string) => {
      const out = (
        await api('hr', 'post', '/people/employees')
          .send({ legalEntityId: ids.leKF, employeeCode: code, givenName, status: 'confirmed', reason: 'Joined', overrideReason: 'Joined before go-live', joinedOn: joined, assignment: { locationId: ids.locKF, departmentId: ids.dept, designationId: ids.des, employmentTypeId: ids.type, managerEmployeeId: null }, compensation: { annualCtc: '690000' } })
          .expect(201)
      ).body;
      await approve(out.payChangeId).then((r) => expect([r.status, r.body.message]).toEqual([201, undefined]));
      return out.id as string;
    };
    ids.rahul = await hire('Rahul', 'KF0088');
    ids.imran = await hire('Imran', 'KF0089');
    ids.selvi = await hire('Selvi', 'KF0090');
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

  it('gives HR the company defaults for the form (transfer.* settings), and no one else', async () => {
    const d = (await api('hr', 'get', `/people/changes/transfer-defaults?employeeId=${ids.rahul}`).expect(200)).body;
    expect(d).toEqual({ options: { leave: 'carry', service: 'continue', code: 'keep', settlement: 'none', structure: 'keep' }, employeeCode: 'KF0088', serviceFrom: joined });
    await api('viewer', 'get', `/people/changes/transfer-defaults?employeeId=${ids.rahul}`).expect(403);
    await api('adminB', 'get', `/people/changes/transfer-defaults?employeeId=${ids.rahul}`).expect(404);
    // The company's own default wins over the starter.
    await inA((tx) => tx.setting.create({ data: { organizationId: org.A.id, key: 'transfer.leave', scopeType: 'tenant', scopeId: org.A.id, value: 'encash' } }));
    expect((await api('hr', 'get', `/people/changes/transfer-defaults?employeeId=${ids.rahul}`).expect(200)).body.options.leave).toBe('encash');
    await inA((tx) => tx.setting.deleteMany({ where: { organizationId: org.A.id, key: 'transfer.leave' } }));
  });

  it('refuses a move that cannot happen: same entity, a location or job of the old entity, outside the grant, nothing to move', async () => {
    const send = (who: Who, body: object) => api(who, 'post', '/people/changes').send(body);
    expect((await send('hr', move('rahul', today, { legalEntityId: ids.leKF, locationId: ids.locKF })).expect(400)).body.message).toMatch(/already works for that legal entity/);
    expect((await send('hr', move('rahul', today, { locationId: ids.locKF })).expect(400)).body.message).toMatch(/another legal entity/);
    expect((await send('hr', move('rahul', today, { designationId: ids.desKf })).expect(400)).body.message).toMatch(/not available to the employee's legal entity/);
    expect((await send('hr', { ...move('rahul', joined, {}), overrideReason: 'Checking the joining day rule' }).expect(400)).body.message).toMatch(/after the joining day/);
    // A move carries only its target; a plain transfer cannot change the entity.
    await send('hr', { ...move('rahul', today, {}), payload: { transfer: { legalEntityId: ids.leTN, locationId: ids.locTN, options: {} }, assignment: { locationId: ids.locTN } } }).expect(400);
    await send('hr', { ...move('rahul', today, {}), changeType: 'transfer' }).expect(400);
    await send('hr', { ...move('rahul', today, {}), payload: { transfer: { legalEntityId: ids.leTN, locationId: ids.locTN, options: { leave: 'sometimes' } } } }).expect(400);
    // HR whose grant covers only the old entity cannot move anyone out of it; nobody else raises it at all.
    expect((await send('hrKf', move('rahul', today, {})).expect(403)).body.message).toMatch(/does not cover that legal entity/);
    await send('viewer', move('rahul', today, {})).expect(403);
    await send('adminB', move('rahul', today, {})).expect(404);
  });

  it('previews and approves a move dated today: the old employment ends yesterday, the new one carries code, service and pay', async () => {
    const preview = (await api('hr', 'post', '/people/changes/preview').send(move('rahul', today, {})).expect(201)).body.impact;
    expect(preview.facts).toEqual(
      expect.arrayContaining([
        { fact: 'Legal entity', from: 'Entity KF', to: 'Entity TN' },
        { fact: 'Employee code', from: 'KF0088', to: 'KF0088 (kept)' },
        { fact: 'Location', from: 'Site KF', to: 'Site TN' },
        { fact: 'Leave balance', from: 'Balance on the day', to: 'Carried over' },
        { fact: 'Settlement at the old entity', from: null, to: 'None (amounts move over)' },
      ]),
    );
    const raised = (await api('hr', 'post', '/people/changes').send(move('rahul', today, {})).expect(201)).body;
    ids.rahulMove = raised.id;
    expect(raised).toMatchObject({ changeType: 'entity_transfer', status: 'pending', payload: { transfer: { options: { leave: 'carry', service: 'continue', code: 'keep', settlement: 'none', structure: 'keep' } } } });
    // Nothing else is raised on or after a move waiting for approval, and the move itself is cancelled, never rewritten.
    expect((await api('hr', 'post', '/people/changes').send({ employeeId: ids.rahul, changeType: 'transfer', effectiveDate: addDays(today, 3), reason: 'Moving desks', payload: { assignment: { locationId: ids.locKF } } }).expect(409)).body.message).toMatch(/ends with a move/);
    await api('hr', 'put', `/people/changes/${raised.id}`).send({ effectiveDate: addDays(today, 1) }).expect(409);
    // Nobody approves their own move; the approver does, with a fresh second factor.
    await api('hr', 'post', `/people/changes/${raised.id}/approve`).send({}).expect(403);
    const res = await approve(raised.id);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('effective');

    const [old, next] = await employments(ids.rahul);
    expect(old.exitedOn?.toISOString().slice(0, 10)).toBe(addDays(today, -1));
    expect(next).toMatchObject({ legalEntityId: ids.leTN, employeeCode: 'KF0088', rehireOf: old.id, exitedOn: null });
    expect(next.joinedOn.toISOString().slice(0, 10)).toBe(today);
    expect(next.continuousServiceFrom?.toISOString().slice(0, 10)).toBe(joined);
    const pay = await inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.leTN}}`}, true)`;
      return tx.compensation.findMany({ where: { organizationId: org.A.id, employmentId: next.id, supersededAt: null } });
    });
    expect(pay.map((p) => p.annualCtc.toFixed(2))).toEqual(['690000.00']);
    const dates = (await api('hr', 'get', `/people/employees/${ids.rahul}/service-dates`).expect(200)).body;
    expect(dates).toMatchObject({ companyStart: joined, employerStart: today, continuousServiceFrom: joined });
    // No joiner journey for a move: the joining event is not raised.
    const joinedEvents = await inA((tx) => tx.eventOutbox.count({ where: { organizationId: org.A.id, eventType: 'employee.joined', payload: { path: ['employmentId'], equals: next.id } } }));
    expect(joinedEvents).toBe(0);
    const audits = await inA((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'employee.entity_transferred', entityId: ids.rahul } }));
    expect(audits).toHaveLength(1);
  });

  it('opens the continuity checklist: moot items close with the reason, the rest show in payroll pre-flight', async () => {
    expect(await drain(async () => Boolean(await inA((tx) => tx.journey.findFirst({ where: { organizationId: org.A.id, kind: 'continuity', subjectId: ids.rahulMove } }))))).toBe(true);
    const view = (await api('approver', 'get', `/lifecycle/continuity/${ids.rahulMove}`).expect(200)).body;
    expect(view.move).toEqual({ effectiveDate: today, status: 'effective', from: 'Entity KF', to: 'Entity TN' });
    const byKey = Object.fromEntries(view.journey.tasks.map((t: { key: string }) => [t.key, t]));
    for (const k of ['leave', 'gratuity', 'settlement', 'structure', 'loans']) expect(byKey[k].status).toBe('done');
    expect(byKey.gratuity.answers).toEqual({ note: 'Service continues: one payout at the final exit.' });
    for (const k of ['uan', 'esi', 'form_12b', 'declarations']) expect(byKey[k].status).toBe('open');
    // The company's checklist was made from the starter on first use, active.
    expect(await inA((tx) => tx.journeyTemplate.count({ where: { organizationId: org.A.id, kind: 'continuity', active: true, starterKey: 'continuity_standard' } }))).toBe(1);

    const open = () => inA((tx) => openContinuity(tx, org.A.id, ids.leTN, [ids.rahul, ids.imran]));
    expect((await open())[0]).toEqual({ employeeId: ids.rahul, titles: expect.arrayContaining([expect.stringMatching(/^PF UAN transfer/)]) });
    expect((await open())[0].titles).toHaveLength(4);
    expect(await inA((tx) => openContinuity(tx, org.A.id, ids.leKF, [ids.rahul]))).toEqual([]);
    // The owner (the approver, no payroll team set) ticks an item off; it leaves pre-flight.
    await api('approver', 'post', `/lifecycle/tasks/${byKey.uan.id}/complete`).send({ version: byKey.uan.version, note: 'Claim submitted' }).expect(200);
    expect((await open())[0].titles).toHaveLength(3);
    // Who sees it: HR in scope and the task owners; not someone without the key, nor another company.
    await api('viewer', 'get', `/lifecycle/continuity/${ids.rahulMove}`).expect(403);
    await api('adminB', 'get', `/lifecycle/continuity/${ids.rahulMove}`).expect(404);
    // Listed with the life events for HR.
    const list = (await api('approver', 'get', '/lifecycle/life-journeys').expect(200)).body.rows;
    expect(list).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'continuity', kindLabel: 'Inter-entity transfer' })]));
  });

  it('a later move waits for its day, then the daily job makes it with HR’s options for this move', async () => {
    const day = addDays(today, 10);
    const raised = (await api('hr', 'post', '/people/changes').send(move('imran', day, { options: { code: 'new', service: 'restart', structure: 'new', leave: 'lapse' } })).expect(201)).body;
    expect((await approve(raised.id)).body.status).toBe('scheduled');
    expect((await employments(ids.imran)).map((e) => e.exitedOn)).toEqual([null]);
    // Not yet: the job leaves it until its day.
    expect(await history.applyMoves(org.A.id)).toBe(0);
    expect(await history.applyMoves(org.A.id, new Date(`${day}T06:00:00Z`))).toBe(1);
    const [old, next] = await employments(ids.imran);
    expect(old.exitedOn?.toISOString().slice(0, 10)).toBe(addDays(day, -1));
    expect(next).toMatchObject({ legalEntityId: ids.leTN, employeeCode: 'TN0001', continuousServiceFrom: null });
    expect((await inA((tx) => tx.employeeChange.findFirstOrThrow({ where: { id: raised.id } }))).status).toBe('effective');
    // A new structure: nothing is carried; payroll holds the person until a salary is approved.
    const pay = await inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.leTN}}`}, true)`;
      return tx.compensation.count({ where: { organizationId: org.A.id, employmentId: next.id } });
    });
    expect(pay).toBe(0);
    expect(await drain(async () => Boolean(await inA((tx) => tx.journey.findFirst({ where: { organizationId: org.A.id, kind: 'continuity', subjectId: raised.id } }))))).toBe(true);
    const tasks = (await api('approver', 'get', `/lifecycle/continuity/${raised.id}`).expect(200)).body.journey.tasks as { key: string; status: string }[];
    for (const k of ['leave', 'gratuity', 'structure']) expect(tasks.find((t) => t.key === k)?.status).toBe('open');
    expect(tasks.find((t) => t.key === 'settlement')?.status).toBe('done');
  });

  it('a kept code taken by someone else in the new series cannot move', async () => {
    // TN0001 is Imran's now: give Selvi that code's twin in KF's series and ask to keep it into TN, where it is taken.
    await inA(async (tx) => {
      const e = await tx.employment.findFirstOrThrow({ where: { organizationId: org.A.id, employeeId: ids.selvi } });
      await tx.employment.update({ where: { id: e.id }, data: { employeeCode: 'TN0001' } });
    });
    expect((await api('hr', 'post', '/people/changes').send(move('selvi', today, {})).expect(409)).body.message).toMatch(/someone else's code in Entity TN/);
  });
});
