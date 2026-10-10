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
import { LastDayService } from '../src/lifecycle/last-day.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';

// Lifecycle batch 6d end to end against the real database (forced RLS, the app role): the last working day (the morning
// event, then T+0 once the day is over in India: the employment ends once even when the job runs twice), the exit steps
// (sessions revoked, login closed, delegations ended; a failing step retried, then HR alerted, then retried by HR),
// exit letters (relieving and experience at T+0, held until HR releases them), the alumni login (own letters only,
// refused once access ends), the payroll hand-off (wages due two working days after the last day, holidays skipped,
// open clearance never moves it, a new revision when an asset comes back, payroll's guard), "settled outside", the
// employee's instant certificate, and two companies apart. PDFs come from the dev-fake converter.
process.env.LETTER_PDF_CONVERTER = 'dev-fake';

describe('Lifecycle batch 6d', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let lastDay: LastDayService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hr' | 'hr2' | 'mgr' | 'ravi' | 'sita' | 'kiran';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const emp = {} as Record<string, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const alumni = (method: 'get' | 'post', path: string, t?: string) => {
    const r = request(server())[method](`/api/v1/portal/alumni/${org.A.slug}${path}`);
    return t ? r.set('X-Alumni-Portal', t) : r;
  };
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const tomorrowNoonIst = () => new Date(`${addDays(today, 1)}T06:30:00Z`);
  const email = { send: jest.fn(async (_m: { to: string; subject: string }) => ({ success: true })) };
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const steps = async (caseId: string) => Object.fromEntries(((await api('hr', 'get', `/lifecycle/exits/${caseId}/steps`).expect(200)).body as { handler: string; status: string }[]).map((s) => [s.handler, s.status]));
  const codeFor = async (to: string) => {
    for (let i = 0; i < 60; i++) {
      const m = [...email.send.mock.calls].reverse().find(([x]) => x.to === to && /^\d{6}/.test(x.subject));
      if (m) return m[0].subject.slice(0, 6);
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`no code for ${to}`);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue(email).overrideProvider(BlobStorageService).useValue(createFakeBlobStorage()).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    lastDay = moduleRef.get(LastDayService);
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `life6d-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Life6D Org ${k}`, slug: `life6d-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hr', 'A', 'panel', [...tpl('hr_admin'), 'asset.manage']],
      ['hr2', 'A', 'panel', tpl('hr_admin')],
      ['mgr', 'A', 'panel', []],
      ['ravi', 'A', 'panel', []],
      ['sita', 'A', 'panel', []],
      ['kiran', 'A', 'panel', []],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@life6d-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@life6d-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Leaving Foods Pvt Ltd', shortName: `LD${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      ids.blr = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Production', code: 'PROD', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Operator', code: 'OP' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const hire = async (who: Who, given: string, code: string) =>
      (await api('adminA', 'post', '/people/employees').send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: given, familyName: run, employeeCode: code, joinedOn: '2026-04-06', userId: users[who], workEmail: `${who}@life6d-${run}.test`, assignment: { locationId: ids.blr, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: who === 'mgr' ? null : emp.mgr } }).expect(201)).body.id as string;
    emp.mgr = await hire('mgr', 'Divya', 'LD-001');
    emp.ravi = await hire('ravi', 'Ravi', 'LD-002');
    emp.sita = await hire('sita', 'Sita', 'LD-003');
    emp.kiran = await hire('kiran', 'Kiran', 'LD-004');
    // Personal emails for the alumni login.
    await inA(async (tx) => {
      for (const k of ['ravi', 'sita'] as const) {
        const p = (await tx.employee.findFirstOrThrow({ where: { id: emp[k] } })).personId;
        await tx.person.update({ where: { id: p }, data: { primaryEmail: `${k}.home-${run}@mail.test` } });
      }
    });
    await api('adminA', 'post', '/lifecycle/journey-templates/from-starter').send({ starterKey: 'offboarding_standard' }).expect(201);
    // Exit letters and the certificate: the YukthiX starters, previewed, switched on; HR signs them.
    for (const letterType of ['relieving', 'experience', 'no_dues', 'employment_certificate']) {
      const t = (await api('adminA', 'post', '/letters/templates/starter').send({ letterType }).expect(201)).body;
      ids[`tpl_${letterType}`] = t.id;
      await api('adminA', 'get', `/letters/templates/${t.id}/preview`).expect(200);
      await api('adminA', 'post', `/letters/templates/${t.id}/activate`).expect(200);
    }
    await markSteppedUp(tenantPrisma, token.adminA);
    await api('adminA', 'post', '/letters/signatories').field('legalEntityId', ids.entity).field('userId', users.hr).field('title', 'Head of HR').expect(201);
  }, 240_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('the last working day: the morning event; T+0 ends the employment once, signs out, closes the login, ends delegations, issues the letters', async () => {
    await inA((tx) => tx.wfDelegation.create({ data: { organizationId: org.A.id, userId: users.ravi, delegateUserId: users.mgr, startsOn: new Date(`${today}T00:00:00Z`), endsOn: new Date(`${addDays(today, 30)}T00:00:00Z`) } }));
    const k = (await api('hr', 'post', '/lifecycle/exits').send({ employeeId: emp.ravi, exitType: 'end_of_contract', lwd: today, reasonText: 'Fixed-term contract ends' }).expect(201)).body;
    ids.raviCase = k.id;
    await lastDay.sweepCase(org.A.id, k.id, new Date());
    expect(await inA((tx) => tx.eventOutbox.count({ where: { eventType: 'employment.lwd_approaching', payload: { path: ['exitCaseId'], equals: k.id } } }))).toBe(1);
    expect((await inA((tx) => tx.employment.findFirstOrThrow({ where: { employeeId: emp.ravi } }))).exitedOn).toBeNull();
    await api('ravi', 'get', '/lifecycle/me/resignation').expect(200);
    // T+0, twice (the job may run again): one exit change, exited_on = the last day, every fact stops on it.
    await lastDay.sweepCase(org.A.id, k.id, tomorrowNoonIst());
    await lastDay.sweepCase(org.A.id, k.id, tomorrowNoonIst());
    const e = await inA((tx) => tx.employment.findFirstOrThrow({ where: { employeeId: emp.ravi } }));
    expect(e.exitedOn?.toISOString().slice(0, 10)).toBe(today);
    expect(await inA((tx) => tx.employeeChange.count({ where: { employmentId: e.id, changeType: 'exit' } }))).toBe(1);
    const open = await inA((tx) => tx.employmentStatusPeriod.findMany({ where: { employmentId: e.id, supersededAt: null } }));
    expect(open.every((r) => r.validTo?.toISOString().slice(0, 10) === today || (r.validTo && r.validTo.toISOString().slice(0, 10) < today))).toBe(true);
    expect((await api('hr', 'get', `/lifecycle/exits/${k.id}`).expect(200)).body.status).toBe('exited');
    expect(await inA((tx) => tx.eventOutbox.count({ where: { eventType: 'employment.exited', payload: { path: ['exitCaseId'], equals: k.id } } }))).toBe(1);
    // YX-LC-14: the old session no longer works; the login and the delegation are closed; every step is done.
    await api('ravi', 'get', '/lifecycle/me/resignation').expect(401);
    expect((await inA((tx) => tx.user.findFirstOrThrow({ where: { id: users.ravi } }))).status).toBe('deactivated');
    expect((await inA((tx) => tx.wfDelegation.findFirstOrThrow({ where: { userId: users.ravi } }))).revokedAt).not.toBeNull();
    expect(await steps(k.id)).toEqual({ 'workflow.reassign': 'done', 'journey.tasks': 'done', 'auth.sessions': 'done', 'auth.login': 'done', 'workflow.delegations': 'done', 'desk.seats': 'done', 'letters.relieving': 'done', 'letters.experience': 'done' });
    const letters = await inA((tx) => tx.letterIssue.findMany({ where: { subjectId: k.id }, select: { letterType: true, status: true } }));
    expect(letters.map((l) => `${l.letterType}:${l.status}`).sort()).toEqual(['experience:issued', 'relieving:issued']);
  });

  it('a failing step is tried three times, then HR is told; HR fixes it and retries', async () => {
    await api('adminA', 'post', `/letters/templates/${ids.tpl_experience}/retire`).expect(200);
    const k = (await api('hr', 'post', '/lifecycle/exits').send({ employeeId: emp.kiran, exitType: 'retirement', lwd: today, reasonText: 'Retires' }).expect(201)).body;
    ids.kiranCase = k.id;
    for (let i = 0; i < 3; i++) await lastDay.sweepCase(org.A.id, k.id, tomorrowNoonIst()).then(() => lastDay.runStepsOf(org.A.id, k.id, ['t0']));
    const panel = (await api('hr', 'get', `/lifecycle/exits/${k.id}/steps`).expect(200)).body as { handler: string; status: string; lastError: string }[];
    const exp = panel.find((s) => s.handler === 'letters.experience')!;
    expect(exp).toMatchObject({ status: 'failed' });
    expect(exp.lastError).toMatch(/no active experience template/);
    expect(await inA((tx) => tx.userNotification.count({ where: { type: 'exit.deprovisioning.failed', entityId: k.id } }))).toBeGreaterThan(0);
    // HR switches a template on again and retries the step.
    const t = (await api('adminA', 'post', '/letters/templates/starter').send({ letterType: 'experience' }).expect(201)).body;
    await api('adminA', 'get', `/letters/templates/${t.id}/preview`).expect(200);
    await api('adminA', 'post', `/letters/templates/${t.id}/activate`).expect(200);
    const after = (await api('hr', 'post', `/lifecycle/exits/${k.id}/steps/letters.experience/retry`).expect(200)).body as { handler: string; status: string }[];
    expect(after.find((s) => s.handler === 'letters.experience')!.status).toBe('done');
  });

  it('held letters wait for HR; released, they land in the alumni vault; alumni read only their own, and only for the access period', async () => {
    const k = (await api('hr', 'post', '/lifecycle/exits').send({ employeeId: emp.sita, exitType: 'end_of_contract', lwd: today, reasonText: 'Contract ends' }).expect(201)).body;
    await api('hr', 'put', `/lifecycle/exits/${k.id}/hr`).send({ hold: true, holdReason: 'Laptop data not handed over', version: k.version }).expect(200);
    await lastDay.sweepCase(org.A.id, k.id, tomorrowNoonIst());
    expect((await steps(k.id))['letters.relieving']).toBe('held');
    expect(await inA((tx) => tx.letterIssue.count({ where: { subjectId: k.id } }))).toBe(0);
    // Alumni: a code to the personal email; nothing yet in the vault.
    const mail = `sita.home-${run}@mail.test`;
    email.send.mockClear();
    await alumni('post', '/code').send({ email: mail }).expect(200);
    const t = (await alumni('post', '/verify').send({ email: mail, code: await codeFor(mail) }).expect(200)).body.token as string;
    expect((await alumni('get', '/me', t).expect(200)).body.letters).toHaveLength(0);
    // HR releases the hold: the letters are issued at once.
    const cur = (await api('hr', 'get', `/lifecycle/exits/${k.id}`).expect(200)).body;
    await api('hr', 'put', `/lifecycle/exits/${k.id}/hr`).send({ hold: false, version: cur.version }).expect(200);
    const me = (await alumni('get', '/me', t).expect(200)).body;
    expect(me.letters.map((l: { title: string }) => l.title.split(':')[0]).sort()).toEqual(['Experience letter', 'Relieving letter']);
    const pdf = await alumni('get', `/letters/${me.letters[0].id}/file`, t).expect(200);
    expect(pdf.headers['content-type']).toMatch(/pdf/);
    // Not someone else's letter; not a staff route.
    const raviLetter = await inA((tx) => tx.letterIssue.findFirstOrThrow({ where: { subjectId: ids.raviCase } }));
    await alumni('get', `/letters/${raviLetter.id}/file`, t).expect(404);
    await request(server()).get('/api/v1/lifecycle/me/resignation').set('X-Alumni-Portal', t).expect(401);
    // An unknown email gets the same answer and no code.
    email.send.mockClear();
    await alumni('post', '/code').send({ email: `nobody-${run}@mail.test` }).expect(200);
    await new Promise((r) => setTimeout(r, 300));
    expect(email.send.mock.calls.some(([m]) => m.to === `nobody-${run}@mail.test`)).toBe(false);
    // The access period (7 years by default) ends: the same session is refused.
    const moved = await inA((tx) => tx.employment.updateMany({ where: { employeeId: emp.sita }, data: { joinedOn: new Date('2010-06-01T00:00:00Z'), exitedOn: new Date('2018-01-31T00:00:00Z') } }));
    expect(moved.count).toBe(1);
    await alumni('get', '/me', t).expect(401);
  });

  it('the payroll hand-off: due two working days after the last day (holidays skipped); open clearance never moves it; an asset return makes a revision', async () => {
    // A Friday at least a week ahead, with the Monday after it a holiday on the company calendar.
    let fri = addDays(today, 7);
    while (new Date(`${fri}T00:00:00Z`).getUTCDay() !== 5) fri = addDays(fri, 1);
    await inA(async (tx) => {
      const cal = await tx.holidayCalendar.create({ data: { organizationId: org.A.id, name: 'Company holidays' } });
      await tx.holiday.create({ data: { organizationId: org.A.id, calendarId: cal.id, holidayOn: new Date(`${addDays(fri, 3)}T00:00:00Z`), name: 'Festival' } });
    });
    const asset = (await api('hr', 'post', '/lifecycle/assets').send({ category: 'Laptop', name: 'ThinkPad', tag: `LD-${run}`, legalEntityId: ids.entity, cost: '50000.00' }).expect(201)).body.id;
    await api('hr', 'post', `/lifecycle/assets/${asset}/issue`).send({ employeeId: emp.mgr, issuedOn: today, condition: 'New' }).expect(200);
    const k = (await api('hr', 'post', '/lifecycle/exits').send({ employeeId: emp.mgr, exitType: 'retirement', lwd: fri, reasonText: 'Retires' }).expect(201)).body;
    let h = (await api('hr', 'get', `/lifecycle/exits/${k.id}/handoff`).expect(200)).body;
    expect(h.current).toMatchObject({ revision: 1, cause: 'accepted', lwd: fri, wagesDueBy: addDays(fri, 5) });
    expect(h.current.recoveries).toEqual([expect.objectContaining({ source: 'asset', amount: '50000.00', status: 'open' })]);
    await api('hr', 'post', `/lifecycle/assets/${asset}/return`).send({ returnedOn: today, condition: 'Good', status: 'in_stock' }).expect(200);
    h = (await api('hr', 'get', `/lifecycle/exits/${k.id}/handoff`).expect(200)).body;
    expect(h.current).toMatchObject({ revision: 2, cause: 'asset_returned', wagesDueBy: addDays(fri, 5), recoveries: [] });
    expect((await api('hr', 'get', `/lifecycle/exits/${k.id}`).expect(200)).body.clearance.some((i: { status: string }) => i.status === 'open')).toBe(true);
    // Payroll's guard: the app role reads nothing without the API opening it to the entity.
    expect(await inA((tx) => tx.exitSettlementInput.count())).toBe(0);
    await api('mgr', 'get', `/lifecycle/exits/${k.id}/handoff`).expect(403);
  });

  it('settled outside YukthiX closes an ended exit (D11); the employee gets an instant certificate', async () => {
    await api('hr', 'post', `/lifecycle/exits/${ids.kiranCase}/settled-outside`).send({ settledOn: addDays(today, 1), reason: 'Paid by cheque' }).expect(400);
    const h = (await api('hr', 'post', `/lifecycle/exits/${ids.kiranCase}/settled-outside`).send({ settledOn: today, reason: 'Paid by bank transfer on the day' }).expect(200)).body;
    expect(h.settledOutside).toEqual({ on: today, reason: 'Paid by bank transfer on the day' });
    expect((await api('hr', 'get', `/lifecycle/exits/${ids.kiranCase}`).expect(200)).body.status).toBe('closed');
    const cert = (await api('hr2', 'post', '/letters/me/certificates').send({ letterType: 'employment_certificate' }).expect(403)).body;
    expect(cert.message).toMatch(/current employees/);
    const mine = (await api('mgr', 'post', '/letters/me/certificates').send({ letterType: 'employment_certificate' }).expect(201)).body;
    expect(mine).toMatchObject({ status: 'issued', letterType: 'employment_certificate' });
    await api('mgr', 'post', '/letters/me/certificates').send({ letterType: 'relieving' }).expect(400);
  });

  it('two companies apart', async () => {
    await api('adminB', 'get', `/lifecycle/exits/${ids.raviCase}/steps`).expect(404);
    await api('adminB', 'get', `/lifecycle/exits/${ids.raviCase}/handoff`).expect(404);
    await request(server()).post(`/api/v1/portal/alumni/${org.B.slug}/code`).send({ email: `ravi.home-${run}@mail.test` }).expect(200);
    expect(await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.exitDeprovisioning.count())).toBe(0);
  });
});
