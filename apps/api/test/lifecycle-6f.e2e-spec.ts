import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { addDays } from '../src/lifecycle/journey-rules';
import { LifeEventsService } from '../src/lifecycle/life-events.service';
import { LifecycleJourneysService } from '../src/lifecycle/journeys.service';
import type { CompanyContext } from '../src/org-structure/org-structure.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Lifecycle batch 6f end to end against the real database (forced RLS, the app role): life-event journeys start only
// once the company turns them on (a first-time manager, a transfer, parental leave and the return to work, once each),
// close when the leave or transfer is called off, run read / watch / quick-survey steps (survey ratings for HR and the
// person only), HR's list, and a new hire's first 30 days. The transfer and leave rows are fixtures: their own flows
// are tested in their own suites; 6f only reads them.

describe('Lifecycle batch 6f', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let life: LifeEventsService;
  let journeys: LifecycleJourneysService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'hr' | 'mgr' | 'lead' | 'ravi' | 'nina';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const emp = {} as Record<string, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const email = { send: jest.fn(async (_m: { to: string; subject: string }) => ({ success: true })) };
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  type TemplateView = { id: string; kind: string; version: number; active: boolean; name: string; tasks: Record<string, unknown>[] };
  const templates = async () => (await api('hr', 'get', '/lifecycle/journey-templates').expect(200)).body.templates as TemplateView[];
  const body = (t: TemplateView, patch: Partial<{ active: boolean; tasks: Record<string, unknown>[] }>) => ({
    kind: t.kind,
    name: t.name,
    active: patch.active ?? t.active,
    version: t.version,
    tasks: (patch.tasks ?? t.tasks).map(({ key, title, ownerType, ownerUserId, ownerGroupId, kind, config, dueOffsetDays, dependsOn, required }) => ({ key, title, ownerType, ownerUserId, ownerGroupId, kind, config, dueOffsetDays, dependsOn, required })),
  });
  const journeysOf = (kind: string) => inA((tx) => tx.journey.findMany({ where: { organizationId: org.A.id, kind } }));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue(email).overrideProvider(BlobStorageService).useValue(createFakeBlobStorage()).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    life = moduleRef.get(LifeEventsService);
    journeys = moduleRef.get(LifecycleJourneysService);
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `life6f-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Life6F Org ${k}`, slug: `life6f-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, string, string[] | null][] = [
      ['adminA', 'org_admin', null],
      ['hr', 'panel', tpl('hr_admin')],
      ['mgr', 'panel', []],
      ['lead', 'panel', []],
      ['ravi', 'panel', []],
      ['nina', 'panel', []],
    ];
    const o = org.A.id;
    for (const [who, role, keys] of roster) {
      const permissionProfileId = keys ? (await inA((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await inA((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@life6f-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org.A.slug, email: `${who}@life6f-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const x = { organizationId: o };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Journeys Foods Pvt Ltd', shortName: `JF${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      ids.blr = (await tx.location.create({ data: { ...x, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...x, id: deptId, name: 'Sales', code: 'SAL', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...x, name: 'Executive', code: 'EX' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...x, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const hire = async (who: Who, given: string, code: string, joinedOn: string, manager: string | null) =>
      (await api('adminA', 'post', '/people/employees').send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: given, familyName: run, employeeCode: code, joinedOn, userId: users[who], workEmail: `${who}@life6f-${run}.test`, assignment: { locationId: ids.blr, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: manager } }).expect(201)).body.id as string;
    emp.mgr = await hire('mgr', 'Divya', 'JF-001', '2026-04-06', null);
    emp.lead = await hire('lead', 'Arun', 'JF-002', '2026-04-06', emp.mgr);
    emp.ravi = await hire('ravi', 'Ravi', 'JF-003', '2026-04-06', emp.mgr);
    // Nina joins today under Arun: Arun's first report (a first-time manager), and Nina's first 30 days.
    emp.nina = await hire('nina', 'Nina', 'JF-004', today, emp.lead);
  }, 120_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('life-event starters copy as Not in use, and nothing starts until the company turns one on (O1)', async () => {
    const list = (await api('hr', 'get', '/lifecycle/journey-templates').expect(200)).body as { starters: { key: string; kind: string }[] };
    expect(list.starters.map((s) => s.kind)).toEqual(expect.arrayContaining(['new_manager', 'transfer', 'parental_leave', 'return_to_work']));
    for (const k of ['new_manager_standard', 'transfer_standard', 'parental_leave_standard', 'return_to_work_standard']) await api('hr', 'post', '/lifecycle/journey-templates/from-starter').send({ starterKey: k }).expect(201);
    expect((await templates()).filter((t) => t.kind !== 'onboarding' && t.kind !== 'offboarding').every((t) => !t.active)).toBe(true);
    expect(await life.sweep(today)).toEqual({ started: 0, cancelled: 0 });
    expect(await journeysOf('new_manager')).toHaveLength(0);
  });

  it('read / watch / survey steps are checked when a checklist is saved', async () => {
    const t = (await templates()).find((x) => x.kind === 'transfer')!;
    const bad = (task: Record<string, unknown>) => api('hr', 'put', `/lifecycle/journey-templates/${t.id}`).send(body(t, { tasks: [...t.tasks, { key: 'extra', title: 'Extra', ownerType: 'person', dueOffsetDays: 2, dependsOn: [], required: false, ...task }] }));
    expect((await bad({ kind: 'watch', config: { url: 'http://video.test/a' } }).expect(400)).body.message).toBe('"Extra" needs a link to the video that starts with https://.');
    expect((await bad({ kind: 'read', config: {} }).expect(400)).body.message).toBe('"Extra" needs the text to read or a link to it.');
    expect((await bad({ kind: 'survey', config: { questions: [] } }).expect(400)).body.message).toBe('"Extra" needs 1 to 5 statements to rate.');
    await bad({ kind: 'watch', config: { url: 'https://video.test/a', minutes: 5 } }).expect(200);
  });

  it('turned on: a first-time manager, a transfer and parental leave each start once; a second run starts nothing', async () => {
    for (const t of (await templates()).filter((x) => !['onboarding', 'offboarding'].includes(x.kind))) await api('hr', 'put', `/lifecycle/journey-templates/${t.id}`).send(body(t, { active: true })).expect(200);
    const fx = await inA(async (tx) => {
      const ravi = await tx.employment.findFirstOrThrow({ where: { employeeId: emp.ravi } });
      const change = await tx.employeeChange.create({ data: { organizationId: org.A.id, employeeId: emp.ravi, employmentId: ravi.id, changeType: 'transfer', effectiveDate: new Date(`${addDays(today, 5)}T00:00:00Z`), status: 'scheduled', payload: {}, reason: 'Moves to the Chennai office' } });
      const type = await tx.leaveType.create({ data: { organizationId: org.A.id, code: 'ML', name: 'Maternity leave', kind: 'maternity' } });
      const leave = await tx.leaveRequest.create({ data: { organizationId: org.A.id, employeeId: emp.ravi, leaveTypeId: type.id, fromOn: new Date(`${addDays(today, 10)}T00:00:00Z`), toOn: new Date(`${addDays(today, 40)}T00:00:00Z`), days: 31, status: 'approved' } });
      return { change: change.id, leave: leave.id };
    });
    ids.change = fx.change;
    ids.leave = fx.leave;
    const first = await life.sweep(today);
    expect(first.started).toBe(4);
    const [nm] = await journeysOf('new_manager');
    expect(nm).toMatchObject({ anchorOn: new Date(`${today}T00:00:00Z`), subjectType: 'employment' });
    expect(nm.personId).toBe((await inA((tx) => tx.employee.findFirstOrThrow({ where: { id: emp.lead } }))).personId);
    const [tr] = await journeysOf('transfer');
    expect(tr).toMatchObject({ subjectType: 'employee_change', subjectId: fx.change, anchorOn: new Date(`${addDays(today, 5)}T00:00:00Z`) });
    expect((await journeysOf('parental_leave'))[0].anchorOn).toEqual(new Date(`${addDays(today, 10)}T00:00:00Z`));
    expect((await journeysOf('return_to_work'))[0].anchorOn).toEqual(new Date(`${addDays(today, 41)}T00:00:00Z`));
    ids.transferJourney = tr.id;
    // Divya managed people long before: no new-manager journey for her. And a second run starts nothing.
    expect(await life.sweep(today)).toEqual({ started: 0, cancelled: 0 });
    const people = (await api('hr', 'get', '/lifecycle/life-journeys').expect(200)).body.rows as { kind: string; person: string }[];
    expect(people.map((r) => r.kind).sort()).toEqual(['new_manager', 'parental_leave', 'return_to_work', 'transfer']);
    await api('mgr', 'get', '/lifecycle/life-journeys').expect(403);
  });

  it('the person does read and survey steps; the manager sees "answered", not the ratings', async () => {
    const mine = (await api('ravi', 'get', '/lifecycle/my-tasks').expect(200)).body.tasks as { id: string; key: string; kind: string; journeyId: string; version: number; canComplete: boolean; content: Record<string, unknown> | null }[];
    const onTransfer = mine.filter((t) => t.journeyId === ids.transferJourney);
    const read = onTransfer.find((t) => t.kind === 'read')!;
    expect(read.content).toMatchObject({ text: expect.stringContaining('holiday list') });
    expect(read.canComplete).toBe(true);
    await api('ravi', 'post', `/lifecycle/tasks/${read.id}/complete`).send({ version: read.version }).expect(200);
    const survey = onTransfer.find((t) => t.kind === 'survey')!;
    expect(survey.content).toEqual({ questions: ['I have what I need to do my work.', 'My new team made me welcome.'] });
    expect((await api('ravi', 'post', `/lifecycle/tasks/${survey.id}/complete`).send({ version: survey.version, answers: { ratings: [4] } }).expect(400)).body.message).toBe('Rate every statement from 1 to 5.');
    await api('ravi', 'post', `/lifecycle/tasks/${survey.id}/complete`).send({ version: survey.version, answers: { ratings: [4, 2], comment: 'Seat not ready yet' } }).expect(200);
    const asSeen = async (who: Who) => ((await api(who, 'get', `/lifecycle/journeys/${ids.transferJourney}`).expect(200)).body.tasks as { key: string; status: string; answers: unknown }[]).find((t) => t.key === 'pulse')!;
    expect(await asSeen('hr')).toMatchObject({ status: 'done', answers: { ratings: [4, 2], comment: 'Seat not ready yet' } });
    expect(await asSeen('ravi')).toMatchObject({ status: 'done', answers: { ratings: [4, 2] } });
    expect(await asSeen('mgr')).toMatchObject({ status: 'done', answers: null });
  });

  it('leave cancelled or a transfer called off closes its journeys', async () => {
    await inA(async (tx) => {
      await tx.leaveRequest.update({ where: { id: ids.leave }, data: { status: 'cancelled' } });
      await tx.employeeChange.update({ where: { id: ids.change }, data: { status: 'cancelled' } });
    });
    expect(await life.sweep(today)).toEqual({ started: 0, cancelled: 3 });
    for (const k of ['parental_leave', 'return_to_work', 'transfer']) expect((await journeysOf(k))[0].status).toBe('cancelled');
    const open = await inA((tx) => tx.journeyTask.count({ where: { journeyId: ids.transferJourney, status: { in: ['open', 'waiting'] } } }));
    expect(open).toBe(0);
  });

  it('a new hire sees My first 30 days: day, manager, own steps by today / this week / this month (O2)', async () => {
    expect((await api('nina', 'get', '/lifecycle/me/first-30-days').expect(200)).body).toEqual({ card: null });
    await api('hr', 'post', '/lifecycle/journey-templates/from-starter').send({ starterKey: 'onboarding_standard' }).expect(201);
    const employment = await inA((tx) => tx.employment.findFirstOrThrow({ where: { employeeId: emp.nina } }));
    const person = (await inA((tx) => tx.employee.findFirstOrThrow({ where: { id: emp.nina } }))).personId;
    const c: CompanyContext = { organizationId: org.A.id, isSuperAdmin: false, userId: users.hr };
    await tenantPrisma.forTenant(c, (tx) =>
      journeys.startIn(tx, c, { kind: 'onboarding', personId: person, subjectType: 'employment', subjectId: employment.id, anchorOn: today, place: { legalEntityId: ids.entity, locationId: ids.blr, departmentId: ids.dept }, ownerUserId: users.hr, managerEmployeeId: emp.lead, personUserId: users.nina }),
    );
    const card = (await api('nina', 'get', '/lifecycle/me/first-30-days').expect(200)).body.card;
    expect(card).toMatchObject({ joinedOn: today, day: 1, manager: `Arun ${run}`, buddy: null, done: 0, today: [] });
    expect(card.week.map((t: { key: string }) => t.key)).toEqual(['welcome_read']);
    await api('nina', 'post', `/lifecycle/tasks/${card.week[0].id}/complete`).send({ version: card.week[0].version }).expect(200);
    expect((await api('nina', 'get', '/lifecycle/me/first-30-days').expect(200)).body.card).toMatchObject({ done: 1, week: [] });
    // Someone who joined long ago has no card.
    expect((await api('ravi', 'get', '/lifecycle/me/first-30-days').expect(200)).body).toEqual({ card: null });
  });
});
