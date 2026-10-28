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
import { withPayScope } from '../src/payroll/pay-access';

// People › Restructure (PPL-09) and the continuity checklist (PPL-10) against the real database (forced RLS): the
// keys, another company, a locked payroll month, a move between legal entities (leave, service, code, probation,
// pay), one approval by someone else, a person who fails on their own, and a move inside one entity.
describe('People: restructure and continuity (PPL-09, PPL-10)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
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
  type Who = 'hrA' | 'hr2A' | 'payrollA' | 'empA' | 'adminB';
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const ids: Record<string, string> = {};
  const ctx = (k: 'A' | 'B') => ({ organizationId: org[k].id, isSuperAdmin: false });
  const email = (who: string) => `${who}-${runId}@restructure.test`;
  const asSuper = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant(SUPER, fn);
  const employment = (employeeId: string, entity: string) => asSuper((tx) => tx.employment.findFirst({ where: { organizationId: org.A.id, employeeId, legalEntityId: entity }, orderBy: { joinedOn: 'desc' } }));
  const leave = async (employeeId: string) => Number((await asSuper((tx) => tx.leaveLedgerEntry.aggregate({ where: { organizationId: org.A.id, employeeId }, _sum: { days: true } })))._sum.days ?? 0);

  const merge = (o: Record<string, unknown> = {}) => ({
    kind: 'merge',
    fromEntityId: ids.leTN,
    intoEntityId: ids.leKF,
    effectiveDate: today,
    locationMap: { [ids.locTN]: ids.locKF },
    masterMap: { [ids.plant]: ids.dept },
    defaults: { leave: 'carry', service: 'keep', code: 'keep', salary: 'keep' },
    overrides: [{ employeeId: ids.arjun, leave: 'lapse', service: 'restart', code: 'new', reason: 'New contract terms' }],
    reason: 'Tamil Nadu entity merges into the main entity',
    ...o,
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

    planId = (await prisma.plan.create({ data: { name: `restr-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Org ${k}`, slug: `restr-${k.toLowerCase()}-${runId}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const masters = async (k: 'A' | 'B', tag: string, isDefault: boolean) =>
      tenantPrisma.forTenant(ctx(k), async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`le${tag}`] = (await tx.legalEntity.create({ data: { ...o, name: `Entity ${tag}`, shortName: tag, isDefault, employeeCodePrefix: tag } })).id;
        ids[`loc${tag}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`le${tag}`], name: `Site ${tag}`, code: tag, address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      });
    await masters('A', 'KF', true);
    await masters('A', 'TN', false);
    await masters('B', 'BB', true);
    await tenantPrisma.forTenant(ctx('A'), async (tx) => {
      const o = { organizationId: org.A.id };
      for (const [key, name] of [['dept', 'Quality'], ['labs', 'Labs']] as const) {
        const id = randomUUID();
        await tx.department.create({ data: { ...o, id, name, code: name.toUpperCase(), path: `/${id}/` } });
        ids[key] = id;
      }
      // A department only for the Tamil Nadu entity: its people need a department in the new entity.
      const plant = randomUUID();
      await tx.department.create({ data: { ...o, id: plant, name: 'Plant ops', code: 'PLANT', path: `/${plant}/`, ownerLegalEntityId: ids.leTN } });
      ids.plant = plant;
      ids.des = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
      ids.type = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'P', category: 'permanent' } })).id;
      ids.pl = (await tx.leaveType.create({ data: { ...o, code: 'PL', name: 'Privilege leave', kind: 'earned' } })).id;
    });

    const profile = (keys: string[], name: string) => tenantPrisma.forTenant(ctx('A'), (tx) => tx.permissionProfile.create({ data: { organizationId: org.A.id, name, permissionsJson: JSON.stringify(keys) } })).then((p) => p.id);
    const hr = await profile(['employee.profile.view', 'employee.change.manage', 'employee.change.retro', 'employee.change.retro_override', 'employee.change.approve', 'employee.salary.view', 'employee.salary.manage'], 'HR');
    // Founder decision 21 Oct 2026: payroll does no HR work. Payroll may hold the approval key, yet never decides a restructure.
    const payroll = await profile(['employee.profile.view', 'employee.change.approve', 'employee.salary.view', 'payroll.run.prepare'], 'Payroll');
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string | null][] = [
      ['hrA', 'A', 'panel', hr],
      ['hr2A', 'A', 'panel', hr],
      ['payrollA', 'A', 'panel', payroll],
      ['empA', 'A', 'panel', null],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [name, k, role, permissionProfileId] of roster) {
      users[name] = (await tenantPrisma.forTenant(ctx(k), (tx) => tx.user.create({ data: { organizationId: org[k].id, email: email(name), passwordHash, role, permissionProfileId } }))).id;
    }
    for (const [name, k] of roster.map((r) => [r[0], r[1]] as const)) {
      token[name] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: email(name), password: PASSWORD }).expect(200)).body.accessToken;
    }
    await markSteppedUp(tenantPrisma, token.hr2A);
    await markSteppedUp(tenantPrisma, token.payrollA);
    await markSteppedUp(tenantPrisma, token.hrA);
    const hire = async (tag: string, givenName: string, code: string, o: Record<string, unknown> = {}) =>
      (
        await api('hrA', 'post', '/people/employees')
          .send({ legalEntityId: ids[`le${tag}`], employeeCode: code, givenName, status: 'confirmed', reason: 'Joined', overrideReason: 'Joined before go-live', joinedOn: joined, assignment: { locationId: ids[`loc${tag}`], departmentId: ids.dept, designationId: ids.des, employmentTypeId: ids.type, managerEmployeeId: null }, ...o })
          .expect(201)
      ).body as { id: string; payChangeId: string | null };
    const divya = await hire('TN', 'Divya', 'TN0001', { compensation: { currency: 'INR', annualCtc: '900000.00' } });
    ids.divya = divya.id;
    await api('hr2A', 'post', `/people/changes/${divya.payChangeId}/approve`).send({}).expect(201);
    ids.arjun = (await hire('TN', 'Arjun', 'TN0002', { status: 'probation', joinedOn: addDays(today, -30), overrideReason: undefined })).id;
    ids.imran = (await hire('TN', 'Imran', 'TN0003')).id;
    ids.kiran = (await hire('KF', 'Kiran', 'KF0001')).id;
    ids.selvi = (
      await api('hrA', 'post', '/people/employees')
        .send({ legalEntityId: ids.leTN, employeeCode: 'TN0004', givenName: 'Selvi', status: 'confirmed', reason: 'Joined', overrideReason: 'Joined before go-live', joinedOn: joined, assignment: { locationId: ids.locTN, departmentId: ids.plant, designationId: ids.des, employmentTypeId: ids.type, managerEmployeeId: null } })
        .expect(201)
    ).body.id;
    // Leave on the books: Divya 12 days, Arjun 5.
    await tenantPrisma.forTenant(ctx('A'), (tx) =>
      tx.leaveLedgerEntry.createMany({
        data: [
          { organizationId: org.A.id, employeeId: ids.divya, leaveTypeId: ids.pl, entryOn: new Date(`${addDays(today, -60)}T00:00:00Z`), kind: 'opening', days: 12, reason: 'Opening' },
          { organizationId: org.A.id, employeeId: ids.arjun, leaveTypeId: ids.pl, entryOn: new Date(`${addDays(today, -20)}T00:00:00Z`), kind: 'opening', days: 5, reason: 'Opening' },
        ],
      }),
    );
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

  it('keys: sending needs employee.change.manage; another company sees nothing and cannot plan with our entities', async () => {
    await api('empA', 'get', '/people/restructures/setup').expect(403);
    await api('empA', 'post', '/people/restructures/preview').send(merge()).expect(403);
    await api('payrollA', 'post', '/people/restructures').send(merge()).expect(403);
    await api('payrollA', 'post', '/people/restructures/preview').send(merge()).expect(403);
    await api('payrollA', 'get', '/people/restructures/setup').expect(403);
    const setup = (await api('hrA', 'get', '/people/restructures/setup').expect(200)).body;
    expect(setup.entities.find((e: { id: string }) => e.id === ids.leTN).people).toBe(4);
    expect(setup.departments.find((d: { id: string }) => d.id === ids.plant)).toMatchObject({ openTo: [ids.leTN], byEntity: { [ids.leTN]: 1 } });
    expect((await api('adminB', 'post', '/people/restructures/preview').send(merge()).expect(400)).body.message).toBe('Choose a legal entity of this company to move people from.');
  });

  it('a locked payroll month stops every move into or out of it, and the send', async () => {
    await tenantPrisma.forTenant(ctx('A'), (tx) => tx.payPeriod.create({ data: { organizationId: org.A.id, legalEntityId: ids.leKF, periodStart: new Date(`${today.slice(0, 8)}01T00:00:00Z`), periodEnd: new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)), stage: 'locked' } }));
    const out = (await api('hrA', 'post', '/people/restructures/preview').send(merge()).expect(200)).body;
    expect(out.checks.find((c: { id: string }) => c.id === `pay-${ids.leKF}`)).toMatchObject({ status: 'Blocked' });
    expect(out.people.every((p: { status: string; reason: string }) => p.status === 'failed' && / payroll of Entity KF is locked\.$/.test(p.reason))).toBe(true);
    expect((await api('hrA', 'post', '/people/restructures').send(merge()).expect(400)).body.code).toBe('RESTRUCTURE_PEOPLE_INVALID');
    await tenantPrisma.forTenant(ctx('A'), (tx) => tx.payPeriod.updateMany({ where: { organizationId: org.A.id }, data: { stage: 'open' } }));
  });

  it('preview: each person with the result or the reason; nothing is kept', async () => {
    const out = (await api('hrA', 'post', '/people/restructures/preview').send(merge()).expect(200)).body;
    const by = (n: string) => out.people.find((p: { name: string }) => p.name === n);
    expect(by('Divya')).toMatchObject({ status: 'ready', to: { entity: 'Entity KF', code: 'TN0001', location: 'Site KF' }, service: { from: joined, kept: true }, leave: [{ name: 'Privilege leave', days: 12, action: 'carried' }], pay: 'kept' });
    expect(by('Arjun')).toMatchObject({ status: 'ready', to: { code: expect.stringMatching(/^KF\d{4}$/) }, service: { from: today, kept: false }, leave: [{ days: 5, action: 'lapsed' }], pay: 'none' });
    expect(by('Selvi')).toMatchObject({ status: 'ready', to: { department: 'Quality' } });
    expect(out.counts).toEqual({ ready: 4, failed: 0, leftOut: 0 });
    // A missing place in the new entity is never guessed: the plan (preview and send) is rejected in plain words.
    expect((await api('hrA', 'post', '/people/restructures/preview').send(merge({ masterMap: {} })).expect(400)).body.message).toBe('Choose what Plant ops becomes in Entity KF.');
    expect((await api('hrA', 'post', '/people/restructures').send(merge({ masterMap: {} })).expect(400)).body.message).toBe('Choose what Plant ops becomes in Entity KF.');
    expect((await api('hrA', 'post', '/people/restructures').send(merge({ locationMap: {} })).expect(400)).body.message).toBe('Choose the location in Entity KF for Site TN.');
    expect((await api('hrA', 'post', '/people/restructures/preview').send(merge({ masterMap: { [ids.plant]: ids.des } })).expect(400)).body.message).toBe('Each new department, designation, employment type or grade is one in use in Entity KF.');
    // Left out, Selvi needs no department there.
    await api('hrA', 'post', '/people/restructures/preview').send(merge({ masterMap: {}, overrides: [{ employeeId: ids.selvi, leaveOut: true, reason: 'Stays' }] })).expect(200);
    expect((await employment(ids.divya, ids.leTN))!.exitedOn).toBeNull();
    expect(await asSuper((tx) => tx.restructure.count({ where: { organizationId: org.A.id } }))).toBe(0);
  });

  it('pick people: only the picked people move (part of an entity, or inside it); none picked is refused in plain words', async () => {
    const part = merge({ kind: 'demerge', employeeIds: [ids.divya], overrides: [] });
    const out = (await api('hrA', 'post', '/people/restructures/preview').send(part).expect(200)).body;
    expect(out.people.map((p: { name: string }) => p.name)).toEqual(['Divya']);
    const inside = { kind: 'within', fromEntityId: ids.leTN, employeeIds: [ids.arjun, ids.imran], target: { departmentId: ids.labs }, effectiveDate: today, defaults: { leave: 'carry', service: 'keep', code: 'keep', salary: 'keep' }, reason: 'Two join Labs' };
    const moved = (await api('hrA', 'post', '/people/restructures/preview').send(inside).expect(200)).body;
    expect(moved.people.map((p: { name: string }) => p.name).sort()).toEqual(['Arjun', 'Imran']);
    expect((await api('hrA', 'post', '/people/restructures/preview').send({ ...inside, employeeIds: [] }).expect(400)).body.message).toBe('Choose the locations, departments or people who move.');
    expect((await api('hrA', 'post', '/people/restructures/preview').send({ ...part, employeeIds: [] }).expect(400)).body.message).toBe('Choose the locations or the people who move.');
    await api('hrA', 'post', '/people/restructures/preview').send({ ...part, employeeIds: ['not-a-uuid'] }).expect(400);
    // A saved draft keeps the picked people (an empty list: "Pick people" chosen, no one picked yet).
    const d = (await api('hrA', 'post', '/people/restructures/drafts').send({ title: 'Move Divya', state: { kind: 'demerge', employeeIds: [ids.divya] } }).expect(201)).body;
    expect((await api('hrA', 'get', `/people/restructures/drafts/${d.id}`).expect(200)).body.state).toMatchObject({ employeeIds: [ids.divya] });
    await api('hrA', 'delete', `/people/restructures/drafts/${d.id}`).expect(204);
    expect(await asSuper((tx) => tx.restructure.count({ where: { organizationId: org.A.id } }))).toBe(0);
  });

  it('drafts ("Save and exit"): only the person who saved one sees or changes it; checks list what moves with the people', async () => {
    const state = { kind: 'merge', fromEntityId: ids.leTN, intoEntityId: ids.leKF, effectiveDate: null, locationMap: { [ids.locTN]: ids.locKF }, overrides: [], reason: '', letterType: 'transfer', step: 'options' };
    await api('empA', 'post', '/people/restructures/drafts').send({ title: 'Merge', state }).expect(403);
    await api('payrollA', 'get', '/people/restructures/drafts').expect(403);
    // The shape is checked as for sending: a bad id, map or step is refused.
    await api('hrA', 'post', '/people/restructures/drafts').send({ title: 'Merge', state: { ...state, fromEntityId: 'x' } }).expect(400);
    await api('hrA', 'post', '/people/restructures/drafts').send({ title: 'Merge', state: { ...state, locationMap: { a: 'b' } } }).expect(400);
    await api('hrA', 'post', '/people/restructures/drafts').send({ title: 'Merge', state: { ...state, step: 'x' } }).expect(400);
    await api('hrA', 'post', '/people/restructures/drafts').send({ title: 'Merge', state: { ...state, extra: 1 } }).expect(400);
    const d = (await api('hrA', 'post', '/people/restructures/drafts').send({ title: 'Merge Entity TN into Entity KF', state }).expect(201)).body;
    ids.draft = d.id;
    expect((await api('hrA', 'get', '/people/restructures/drafts').expect(200)).body).toEqual([expect.objectContaining({ id: d.id, title: 'Merge Entity TN into Entity KF' })]);
    expect((await api('hrA', 'get', `/people/restructures/drafts/${d.id}`).expect(200)).body.state).toMatchObject({ kind: 'merge', step: 'options', locationMap: { [ids.locTN]: ids.locKF } });
    await api('hrA', 'put', `/people/restructures/drafts/${d.id}`).send({ title: 'Merge (v2)', state: { ...state, reason: 'Merger' } }).expect(200);
    // Another HR person of the same company, and another company, never see or change it.
    expect((await api('hr2A', 'get', '/people/restructures/drafts').expect(200)).body).toEqual([]);
    await api('hr2A', 'get', `/people/restructures/drafts/${d.id}`).expect(404);
    await api('hr2A', 'put', `/people/restructures/drafts/${d.id}`).send({ title: 'Mine now', state }).expect(404);
    await api('hr2A', 'delete', `/people/restructures/drafts/${d.id}`).expect(404);
    expect((await api('adminB', 'get', '/people/restructures/drafts').expect(200)).body).toEqual([]);
    await api('adminB', 'get', `/people/restructures/drafts/${d.id}`).expect(404);
    await api('adminB', 'delete', `/people/restructures/drafts/${d.id}`).expect(404);
    // RLS: company B's session sees no row of company A at all.
    expect(await tenantPrisma.forTenant(ctx('B'), (tx) => tx.restructureDraft.count())).toBe(0);
    expect(await tenantPrisma.forTenant(ctx('A'), (tx) => tx.restructureDraft.count())).toBe(1);
    // A throw-away draft is deleted by its owner.
    const gone = (await api('hrA', 'post', '/people/restructures/drafts').send({ title: 'Scratch', state: {} }).expect(201)).body;
    await api('hrA', 'delete', `/people/restructures/drafts/${gone.id}`).expect(204);
    await api('hrA', 'get', `/people/restructures/drafts/${gone.id}`).expect(404);
    // Step 3 lists what moves with the people (real counts).
    const out = (await api('hrA', 'post', '/people/restructures/preview').send(merge()).expect(200)).body;
    expect(out.checks.map((c: { id: string }) => c.id)).toEqual(expect.arrayContaining(['journeys', 'approvals']));
    expect(out.checks.find((c: { id: string }) => c.id === 'approvals').title).toMatch(/^\d+ approvals? and \d+ cases? will move with them$/);
  });

  it('merge: approved once by someone else; each person moves on their own and a failure keeps its reason', async () => {
    const { id } = (await api('hrA', 'post', '/people/restructures').send(merge({ draftId: ids.draft, letterType: 'transfer' })).expect(201)).body;
    // A sent plan deletes its draft.
    await api('hrA', 'get', `/people/restructures/drafts/${ids.draft}`).expect(404);
    ids.merge = id;
    await api('adminB', 'get', `/people/restructures/${id}`).expect(404);
    // The sender never approves their own plan, and payroll never approves one (no HR work); a second HR person does.
    expect((await api('hrA', 'post', `/people/restructures/${id}/approve`).send({}).expect(403)).body.message).toBe('You sent this restructure, so someone else in HR approves it.');
    await api('payrollA', 'post', `/people/restructures/${id}/approve`).send({}).expect(403);
    await api('payrollA', 'post', `/people/restructures/${id}/reject`).send({ reason: 'Not ours' }).expect(403);
    await api('payrollA', 'post', `/people/restructures/${id}/cancel`).send({ reason: 'Not ours' }).expect(403);
    // Payroll never sees a plan before it is done (founder 28 Oct 2026): pending is not there for it.
    await api('payrollA', 'get', `/people/restructures/${id}`).expect(404);
    expect((await api('payrollA', 'get', '/people/restructures').expect(200)).body).toEqual([]);
    // After sending, Imran gets a change on the move date: he alone cannot move.
    await api('hrA', 'post', '/people/changes').send({ employeeId: ids.imran, changeType: 'transfer', effectiveDate: addDays(today, 5), payload: { assignment: { departmentId: ids.labs } }, reason: 'Labs need him' }).expect(201);
    const done = (await api('hr2A', 'post', `/people/restructures/${id}/approve`).send({ note: 'Board approved' }).expect(200)).body;
    expect(done).toMatchObject({ status: 'done', moved: 3, failed: 1 });
    expect(done.people.find((p: { name: string }) => p.name === 'Imran')).toMatchObject({ status: 'failed', reason: expect.stringMatching(/^Has a transfer on .* on or after the move date\. Decide or cancel it first\.$/) });
    // Divya: the old employment ends the day before, the new one keeps the code, the service and the pay.
    const old = await employment(ids.divya, ids.leTN);
    expect(old!.exitedOn!.toISOString().slice(0, 10)).toBe(addDays(today, -1));
    const now = await employment(ids.divya, ids.leKF);
    expect(now).toMatchObject({ employeeCode: 'TN0001', exitedOn: null, rehireOf: old!.id });
    expect(now!.continuousServiceFrom!.toISOString().slice(0, 10)).toBe(joined);
    // Pay sits behind the pay guard: opened for the new entity only.
    const pay = await asSuper((tx) => withPayScope(tx, [ids.leKF], () => tx.compensation.findFirst({ where: { employmentId: now!.id, supersededAt: null } })));
    expect(pay!.annualCtc.toString()).toBe('900000');
    expect(await leave(ids.divya)).toBe(12);
    // Arjun: new code, service restarts, leave lapsed, the same probation end.
    const arjunOld = await employment(ids.arjun, ids.leTN);
    const arjun = await employment(ids.arjun, ids.leKF);
    expect(arjun!.employeeCode).toMatch(/^KF\d{4}$/);
    expect(arjun!.continuousServiceFrom!.toISOString().slice(0, 10)).toBe(today);
    expect(await leave(ids.arjun)).toBe(0);
    const [p1, p2] = await asSuper((tx) => Promise.all([tx.probation.findFirst({ where: { employmentId: arjunOld!.id } }), tx.probation.findFirst({ where: { employmentId: arjun!.id } })]));
    expect(p2!.plannedEndOn).toEqual(p1!.plannedEndOn);
    // Imran stays where he was.
    expect((await employment(ids.imran, ids.leTN))!.exitedOn).toBeNull();
    // History and audit: the moves went through the engine, raised by the sender, approved by the approver.
    const join = await asSuper((tx) => tx.employeeChange.findFirst({ where: { employmentId: now!.id, changeType: 'join' } }));
    expect(join!.requestedBy).toBe(users.hrA);
    const actions = (await asSuper((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: { startsWith: 'restructure.' } }, orderBy: { createdAt: 'asc' } }))).map((a) => a.action);
    expect(actions).toEqual(['restructure.requested', 'restructure.approved', 'restructure.done']);
    expect(await asSuper((tx) => tx.eventOutbox.count({ where: { organizationId: org.A.id, eventType: 'employee.joined', payload: { path: ['employeeId'], equals: ids.divya } } }))).toBe(1);
    await api('hr2A', 'post', `/people/restructures/${id}/approve`).send({}).expect(409);
  });

  it('continuity checklist: open items for payroll, kept by HR', async () => {
    const items = (await api('hrA', 'get', `/people/restructures/continuity?restructureId=${ids.merge}&employeeId=${ids.divya}`).expect(200)).body;
    expect(items.map((i: { key: string; status: string }) => `${i.key}:${i.status}`).sort()).toEqual(['declarations:open', 'esi:open', 'form12b:open', 'gratuity:done', 'leave:done', 'pay:done', 'uan:open']);
    expect(items.find((i: { key: string }) => i.key === 'leave').title).toBe('Leave balances carried (Privilege leave 12)');
    await api('empA', 'get', `/people/restructures/continuity?restructureId=${ids.merge}&employeeId=${ids.divya}`).expect(403);
    await api('adminB', 'get', `/people/restructures/continuity?restructureId=${ids.merge}&employeeId=${ids.divya}`).expect(404);
    const esi = items.find((i: { key: string }) => i.key === 'esi');
    await api('hrA', 'put', `/people/restructures/continuity/${esi.id}`).send({ done: true, version: esi.version }).expect(200);
    await api('hrA', 'put', `/people/restructures/continuity/${esi.id}`).send({ done: true, version: esi.version }).expect(409);
    // Payroll keeps its own items of the new entity.
    const uan = items.find((i: { key: string }) => i.key === 'uan');
    await api('payrollA', 'get', `/people/restructures/continuity?restructureId=${ids.merge}&employeeId=${ids.divya}`).expect(200);
    await api('payrollA', 'put', `/people/restructures/continuity/${uan.id}`).send({ done: true, version: uan.version }).expect(200);
  });

  it('inside one entity: a department and manager move through the change engine; reject and cancel keep everyone in place', async () => {
    const within = { kind: 'within', fromEntityId: ids.leKF, departmentIds: [ids.dept], target: { departmentId: ids.labs, managerEmployeeId: ids.divya }, effectiveDate: today, defaults: { leave: 'carry', service: 'keep', code: 'keep', salary: 'keep' }, reason: 'Quality joins Labs' };
    const pre = (await api('hrA', 'post', '/people/restructures/preview').send(within).expect(200)).body;
    // Divya now works in this entity too: she cannot be her own manager.
    expect(pre.people.find((p: { name: string }) => p.name === 'Divya')).toMatchObject({ status: 'failed', reason: 'Cannot be their own manager.' });
    const sent = await api('hrA', 'post', '/people/restructures').send({ ...within, overrides: [{ employeeId: ids.divya, leaveOut: true, reason: 'She leads Labs' }] }).expect(201);
    const rejected = await api('hrA', 'post', '/people/restructures').send({ ...within, overrides: [{ employeeId: ids.divya, leaveOut: true, reason: 'She leads Labs' }] }).expect(201);
    await api('hr2A', 'post', `/people/restructures/${rejected.body.id}/reject`).send({ reason: 'Not this quarter' }).expect(200);
    await api('hr2A', 'post', `/people/restructures/${rejected.body.id}/approve`).send({}).expect(409);
    const done = (await api('hr2A', 'post', `/people/restructures/${sent.body.id}/approve`).send({}).expect(200)).body;
    expect(done).toMatchObject({ status: 'done', moved: 3, failed: 0 });
    expect(done.people.find((p: { name: string }) => p.name === 'Divya')).toMatchObject({ status: 'left_out', reason: 'Left out: She leads Labs' });
    const kiran = await asSuper((tx) => tx.employeeAssignment.findFirst({ where: { employeeId: ids.kiran, supersededAt: null, validTo: null } }));
    expect(kiran).toMatchObject({ departmentId: ids.labs, managerEmployeeId: ids.divya });
    const change = await asSuper((tx) => tx.employeeChange.findFirst({ where: { employeeId: ids.kiran, changeType: 'transfer' } }));
    expect(change).toMatchObject({ requestedBy: users.hrA, decidedBy: users.hr2A });
  });

  it('a future date: approved now, moved on the day (scheduled)', async () => {
    const { id } = (await api('hrA', 'post', '/people/restructures').send(merge({ kind: 'demerge', locationIds: [ids.locTN], effectiveDate: addDays(today, 40), overrides: [] })).expect(201)).body;
    const out = (await api('hr2A', 'post', `/people/restructures/${id}/approve`).send({}).expect(200)).body;
    expect(out.status).toBe('scheduled');
    expect((await employment(ids.imran, ids.leTN))!.exitedOn).toBeNull();
  });
  it('Change action lists inter-entity transfers still waiting, for people the viewer reaches, with who may approve (founder 28 Oct 2026)', async () => {
    const one = (o: Record<string, unknown> = {}) => merge({ kind: 'demerge', fromEntityId: ids.leKF, intoEntityId: ids.leTN, locationMap: { [ids.locKF]: ids.locTN }, masterMap: {}, employeeIds: [ids.kiran], effectiveDate: addDays(today, 60), overrides: [], reason: 'Kiran moves to Tamil Nadu', ...o });
    const waiting = (ids.waiting = (await api('hrA', 'post', '/people/restructures').send(one()).expect(201)).body.id);
    const cancelled = (await api('hrA', 'post', '/people/restructures').send(one()).expect(201)).body.id;
    const rejected = (ids.rejected = (await api('hrA', 'post', '/people/restructures').send(one()).expect(201)).body.id);
    const approved = (await api('hrA', 'post', '/people/restructures').send(one()).expect(201)).body.id;
    await api('hrA', 'post', `/people/restructures/${cancelled}/cancel`).send({ reason: 'Sent twice' }).expect(200);
    await api('hr2A', 'post', `/people/restructures/${rejected}/reject`).send({ reason: 'Not this quarter' }).expect(200);
    expect((await api('hr2A', 'post', `/people/restructures/${approved}/approve`).send({}).expect(200)).body.status).toBe('scheduled');
    const list = (await api('hr2A', 'get', '/people/restructures/pending-transfers').expect(200)).body as { id: string; employeeId: string; name: string; waitingFor: string[] }[];
    // Only the one still waiting: never cancelled, rejected, approved or many-person plans; the sender is not an approver.
    expect(list.map((t) => t.id)).toEqual([waiting]);
    expect(list[0]).toMatchObject({ employeeId: ids.kiran, effectiveDate: addDays(today, 60) });
    expect(list[0].waitingFor.length).toBeGreaterThan(0);
    expect(list[0].waitingFor.join(' ')).not.toMatch(/hrA-/);
    await api('empA', 'get', '/people/restructures/pending-transfers').expect(403);
    await api('payrollA', 'get', '/people/restructures/pending-transfers').expect(403);
    expect((await api('adminB', 'get', '/people/restructures/pending-transfers').expect((r) => expect([200, 403]).toContain(r.status))).body).not.toContainEqual(expect.objectContaining({ id: waiting }));
  });

  it('finished restructures: done, rejected and cancelled, newest first, with open continuity items; only plans naming someone the viewer reaches (founder 28 Oct 2026)', async () => {
    type Row = { id: string; status: string; effectiveDate: string; moved: number; failed: number; openItems: number };
    const list = (await api('hrA', 'get', '/people/restructures?status=finished').expect(200)).body as Row[];
    const all = await asSuper((tx) => tx.restructure.findMany({ where: { organizationId: org.A.id }, select: { id: true, status: true } }));
    // Pending and scheduled ones stay in the open banner, never here.
    expect(all.some((r) => r.status === 'pending') && all.some((r) => r.status === 'scheduled')).toBe(true);
    expect(list.map((r) => r.id).sort()).toEqual(all.filter((r) => ['done', 'rejected', 'cancelled'].includes(r.status)).map((r) => r.id).sort());
    expect(new Set(list.map((r) => r.status))).toEqual(new Set(['done', 'rejected', 'cancelled']));
    expect(list.map((r) => r.effectiveDate)).toEqual([...list.map((r) => r.effectiveDate)].sort().reverse());
    const open = await asSuper((tx) => tx.continuityItem.count({ where: { restructureId: ids.merge, status: 'open' } }));
    expect(open).toBeGreaterThan(0);
    expect(list.find((r) => r.id === ids.merge)).toMatchObject({ status: 'done', moved: 3, failed: 1, openItems: open });
    // Open goes to the record (letters and the checklist).
    expect((await api('hrA', 'get', `/people/restructures/${ids.merge}`).expect(200)).body).toMatchObject({ id: ids.merge, status: 'done' });
    // No restructure access, another company, or an unknown filter: nothing.
    await api('empA', 'get', '/people/restructures?status=finished').expect(403);
    await api('empA', 'get', `/people/restructures/${ids.merge}`).expect(403);
    await api('hrA', 'get', '/people/restructures?status=pending').expect(400);
    const b = await api('adminB', 'get', '/people/restructures?status=finished');
    expect([200, 403]).toContain(b.status);
    if (b.status === 200) expect(b.body).toEqual([]);
    // HR for one legal entity only: just the plans naming someone there today (none for an entity nobody moved in or out of).
    const empty = await tenantPrisma.forTenant(ctx('A'), (tx) => tx.legalEntity.create({ data: { organizationId: org.A.id, name: 'Entity XX', shortName: 'XX', isDefault: false, employeeCodePrefix: 'XX' } }));
    const role = await tenantPrisma.forTenant(ctx('A'), (tx) => tx.permissionProfile.create({ data: { organizationId: org.A.id, name: 'Entity HR', permissionsJson: JSON.stringify(['employee.profile.view', 'employee.change.manage']) } }));
    const passwordHash = await argon2.hash(PASSWORD);
    const scoped = async (who: string, legalEntityId: string) => {
      const userId = (await tenantPrisma.forTenant(ctx('A'), (tx) => tx.user.create({ data: { organizationId: org.A.id, email: email(who), passwordHash, role: 'panel' } }))).id;
      users[who] = userId;
      await tenantPrisma.forTenant(ctx('A'), (tx) => tx.roleGrant.create({ data: { organizationId: org.A.id, userId, permissionProfileId: role.id, scopeType: 'legal_entity', legalEntityId, validFrom: new Date('2020-01-01T00:00:00Z'), status: 'active', reason: 'Entity HR', grantedBy: users.hrA } }));
      const t = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org.A.slug, email: email(who), password: PASSWORD }).expect(200)).body.accessToken;
      return (await request(server()).get('/api/v1/people/restructures?status=finished').set('Authorization', `Bearer ${t}`).expect(200)).body as Row[];
    };
    expect(await scoped('hrXX', empty.id)).toEqual([]);
    // Imran stayed in Tamil Nadu: HR there sees the merge he was part of.
    expect((await scoped('hrTN', ids.leTN)).map((r) => r.id)).toContain(ids.merge);
  });

  it('payroll opens done restructures into its entity and ticks its checklist; never pending, scheduled, rejected or another entity (founder 28 Oct 2026)', async () => {
    // Company-wide payroll: the done merge into Entity KF only (the done move inside one entity has no new entity, no checklist).
    const list = (await api('payrollA', 'get', '/people/restructures?status=finished').expect(200)).body as { id: string }[];
    expect(list.map((r) => r.id)).toEqual([ids.merge]);
    expect((await api('payrollA', 'get', '/people/restructures').expect(200)).body.map((r: { id: string }) => r.id)).toEqual([ids.merge]);
    const rec = (await api('payrollA', 'get', `/people/restructures/${ids.merge}`).expect(200)).body;
    expect(rec).toMatchObject({ id: ids.merge, status: 'done', canDecide: false, canCancel: false });
    const items = (await api('payrollA', 'get', `/people/restructures/continuity?restructureId=${ids.merge}&employeeId=${ids.divya}`).expect(200)).body;
    const f12 = items.find((i: { key: string }) => i.key === 'form12b');
    expect((await api('payrollA', 'put', `/people/restructures/continuity/${f12.id}`).send({ done: true, version: f12.version }).expect(200)).body).toEqual({ id: f12.id, status: 'done' });
    for (const id of [ids.waiting, ids.rejected]) await api('payrollA', 'get', `/people/restructures/${id}`).expect(404);
    await api('payrollA', 'post', `/people/restructures/${ids.waiting}/cancel`).send({ reason: 'Not ours' }).expect(403);
    await api('payrollA', 'get', '/people/restructures/drafts').expect(403);
    await api('adminB', 'get', `/people/restructures/${ids.merge}`).expect((r) => expect([403, 404]).toContain(r.status));
    // Payroll of Entity TN only: the merge moved people into Entity KF, so it is not there.
    const role = await tenantPrisma.forTenant(ctx('A'), (tx) => tx.permissionProfile.create({ data: { organizationId: org.A.id, name: 'Entity payroll', permissionsJson: JSON.stringify(['payroll.run.prepare']) } }));
    const userId = (await tenantPrisma.forTenant(ctx('A'), async (tx) => tx.user.create({ data: { organizationId: org.A.id, email: email('payTN'), passwordHash: await argon2.hash(PASSWORD), role: 'panel' } }))).id;
    users.payTN = userId;
    await tenantPrisma.forTenant(ctx('A'), (tx) => tx.roleGrant.create({ data: { organizationId: org.A.id, userId, permissionProfileId: role.id, scopeType: 'legal_entity', legalEntityId: ids.leTN, validFrom: new Date('2020-01-01T00:00:00Z'), status: 'active', reason: 'Entity payroll', grantedBy: users.hrA } }));
    const t = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org.A.slug, email: email('payTN'), password: PASSWORD }).expect(200)).body.accessToken;
    expect((await request(server()).get('/api/v1/people/restructures?status=finished').set('Authorization', `Bearer ${t}`).expect(200)).body).toEqual([]);
    await request(server()).get(`/api/v1/people/restructures/${ids.merge}`).set('Authorization', `Bearer ${t}`).expect(404);
  });
});
