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
import { ExitExtrasService } from '../src/lifecycle/exit-extras.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';

// Lifecycle batch 6e end to end against the real database (forced RLS, the app role): rehire on the same record with
// the policy and a per-rehire override (Priya), a campus batch whose new day moves every member, the buddy (never the
// manager; the day-30 check-in goes to them), death in service (nominations 60 / 40 become the payees in the hand-off;
// without a nomination nothing settles until legal heirs with a certificate are recorded; the family's login and
// letter), the absconding timeline (Anil's day 3 / 7 / 14 / 21; stopped on return), contract-end reminders at 30 and
// 7 days with auto-exit only by policy, the retirement exit opening months ahead, retrenchment at a 350-worker
// establishment blocked until the government's permission, VRS, the in-app letter editor and the bulk letter wizard.
process.env.LETTER_PDF_CONVERTER = 'dev-fake';

describe('Lifecycle batch 6e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let lastDay: LastDayService;
  let extras: ExitExtrasService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hr' | 'hr2' | 'mgr' | 'buddy' | 'lata';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const emp: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const email = { send: jest.fn(async (_m: { to: string; subject: string }) => ({ success: true })) };
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const codeFor = async (to: string) => {
    for (let i = 0; i < 60; i++) {
      const m = [...email.send.mock.calls].reverse().find(([x]) => x.to === to && /^\d{6}/.test(x.subject));
      if (m) return m[0].subject.slice(0, 6);
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`no code for ${to}`);
  };
  const decideAs = async (who: Who, decision: 'approve' | 'reject' = 'approve', expect = 200) => {
    const task = await inA((tx) => tx.wfTask.findFirstOrThrow({ where: { assigneeUserId: users[who], status: 'open' }, orderBy: { createdAt: 'desc' } }));
    return api(who, 'post', `/workflow/approvals/tasks/${task.id}/decide`).send({ decision }).expect(expect);
  };
  const place = () => ({ legalEntityId: ids.entity, locationId: ids.blr, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm });
  const hire = async (given: string, code: string, opts: { userId?: string; joinedOn?: string; entity?: string; location?: string; manager?: string | null } = {}) =>
    (await api('adminA', 'post', '/people/employees').send({ legalEntityId: opts.entity ?? ids.entity, status: 'confirmed', reason: 'Joined', givenName: given, familyName: run, employeeCode: code, joinedOn: opts.joinedOn ?? '2026-04-06', ...(opts.userId ? { userId: opts.userId, workEmail: (await inA((tx) => tx.user.findFirstOrThrow({ where: { id: opts.userId } }))).email } : {}), assignment: { locationId: opts.location ?? ids.blr, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: opts.manager === undefined ? emp.mgr ?? null : opts.manager } }).expect(201)).body.id as string;
  const dob = (employeeId: string, on: string) => inA((tx) => tx.employeePersonalDetails.upsert({ where: { organizationId_employeeId: { organizationId: org.A.id, employeeId } }, update: { dateOfBirth: new Date(`${on}T00:00:00Z`) }, create: { organizationId: org.A.id, employeeId, dateOfBirth: new Date(`${on}T00:00:00Z`) } }));
  const yearsAgo = (y: number, plusDays = 0) => addDays(`${Number(today.slice(0, 4)) - y}${today.slice(4)}`, plusDays);

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
    extras = moduleRef.get(ExitExtrasService);
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `life6e-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Life6E Org ${k}`, slug: `life6e-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hr', 'A', 'panel', [...tpl('hr_admin'), 'employee.change.manage']],
      ['hr2', 'A', 'panel', tpl('hr_admin')],
      ['mgr', 'A', 'panel', []],
      ['buddy', 'A', 'panel', []],
      ['lata', 'A', 'panel', []],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@life6e-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@life6e-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Special Foods Pvt Ltd', shortName: `SF${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      ids.blr = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      ids.plant = (await tx.legalEntity.create({ data: { ...o, name: 'Special Plant Pvt Ltd', shortName: `SP${run.slice(0, 4).toUpperCase()}` } })).id;
      ids.hosur = (await tx.location.create({ data: { ...o, legalEntityId: ids.plant, name: 'Hosur', code: 'HSR', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Production', code: 'PROD', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Operator', code: 'OP' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    emp.mgr = await hire('Divya', 'SF-001', { userId: users.mgr, manager: null });
    emp.buddy = await hire('Bala', 'SF-002', { userId: users.buddy });
    await api('adminA', 'post', '/lifecycle/journey-templates/from-starter').send({ starterKey: 'onboarding_standard' }).expect(201);
    await api('adminA', 'post', '/lifecycle/journey-templates/from-starter').send({ starterKey: 'offboarding_standard' }).expect(201);
    for (const letterType of ['letter_of_intent', 'condolence', 'absconding_notice', 'relieving', 'experience', 'employment_certificate']) {
      const t = (await api('adminA', 'post', '/letters/templates/starter').send({ letterType }).expect(201)).body;
      await api('adminA', 'get', `/letters/templates/${t.id}/preview`).expect(200);
      await api('adminA', 'post', `/letters/templates/${t.id}/activate`).expect(200);
    }
    await markSteppedUp(tenantPrisma, token.adminA);
    for (const le of [ids.entity, ids.plant]) await api('adminA', 'post', '/letters/signatories').field('legalEntityId', le).field('userId', users.hr).field('title', 'Head of HR').expect(201);
  }, 300_000);

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

  it('rehire (Priya): the same record and code, no probation after a short break, one option overridden with a reason', async () => {
    emp.priya = await hire('Priya', 'SF-010');
    const old = await inA((tx) => tx.employment.findFirstOrThrow({ where: { employeeId: emp.priya } }));
    // She left (absconding is recorded at once with a past day; rehire is off until HR says otherwise).
    const k = (await api('hr', 'post', '/lifecycle/exits').send({ employeeId: emp.priya, exitType: 'absconding', lwd: addDays(today, -10), reasonText: 'Stopped coming' }).expect(201)).body;
    await lastDay.sweepCase(org.A.id, k.id, new Date());
    await inA((tx) => tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key: 'rehire.probation', value: 'skip_if_break_lt_6m' } }));
    const personId = (await inA((tx) => tx.employee.findFirstOrThrow({ where: { id: emp.priya } }))).personId;
    const j = (await api('hr', 'post', '/lifecycle/joiners').send({ givenName: 'Priya', familyName: run, personId, joiningOn: today, ...place(), managerEmployeeId: emp.mgr }).expect(201)).body;
    const r = (await api('hr', 'get', `/lifecycle/joiners/${j.id}/rehire`).expect(200)).body;
    expect(r.previous).toMatchObject({ employeeCode: 'SF-010', rehireEligible: false });
    expect(r.options.find((o: { key: string }) => o.key === 'probation')).toMatchObject({ policy: 'skip_if_break_lt_6m', value: 'skip_if_break_lt_6m' });
    await api('hr', 'put', `/lifecycle/joiners/${j.id}/rehire`).send({ overrides: { gratuity: { value: 'add_prior' } }, version: r.version }).expect(400);
    const after = (await api('hr', 'put', `/lifecycle/joiners/${j.id}/rehire`).send({ overrides: { gratuity: { value: 'add_prior', reason: 'Gratuity was not paid out' } }, version: r.version }).expect(200)).body;
    expect(after.options.find((o: { key: string }) => o.key === 'gratuity')).toMatchObject({ value: 'add_prior', overridden: true });
    const pb = await inA((tx) => tx.preboarding.findFirstOrThrow({ where: { id: j.id } }));
    const joined = (await api('hr', 'post', `/lifecycle/joiners/${j.id}/join`).send({ identityAttested: true, status: 'probation', version: pb.version }).expect(200)).body;
    expect(joined).toMatchObject({ employeeId: emp.priya, employeeCode: 'SF-010' });
    const fresh = await inA((tx) => tx.employment.findFirstOrThrow({ where: { employeeId: emp.priya, exitedOn: null } }));
    expect(fresh.rehireOf).toBe(old.id);
    const st = await inA((tx) => tx.employmentStatusPeriod.findFirstOrThrow({ where: { employmentId: fresh.id, supersededAt: null } }));
    expect(st.status).toBe('confirmed');
    expect(await inA((tx) => tx.probation.count({ where: { employmentId: fresh.id } }))).toBe(0);
    expect(((await inA((tx) => tx.preboarding.findFirstOrThrow({ where: { id: j.id } }))).rehireOptions as Record<string, { value: string; reason: string }>).gratuity).toMatchObject({ value: 'add_prior', reason: 'Gratuity was not paid out' });
  });

  it('campus batch: a new batch day moves every member and their checklists; letters of intent; the buddy is never the manager', async () => {
    const add = async (n: string) => (await api('hr', 'post', '/lifecycle/joiners').send({ givenName: n, familyName: run, email: `${n.toLowerCase()}-${run}@mail.test`, joiningOn: addDays(today, 40), ...place(), managerEmployeeId: emp.mgr }).expect(201)).body as { id: string; journeyId: string };
    const a = await add('Asha');
    const b = await add('Bhanu');
    const batch = (await api('hr', 'post', '/lifecycle/batches').send({ name: `Campus ${run}`, legalEntityId: ids.entity, joiningOn: addDays(today, 30), touchpoints: [{ title: 'Welcome call', on: addDays(today, 10) }] }).expect(201)).body;
    expect((await api('hr', 'post', `/lifecycle/batches/${batch.id}/members`).send({ preboardingIds: [a.id, b.id] }).expect(200)).body.added).toBe(2);
    const list = (await api('hr', 'get', '/lifecycle/batches').expect(200)).body.rows.find((x: { id: string }) => x.id === batch.id);
    expect(list.members.map((m: { joiningOn: string }) => m.joiningOn)).toEqual([addDays(today, 30), addDays(today, 30)]);
    await api('hr', 'put', `/lifecycle/batches/${batch.id}`).send({ name: `Campus ${run}`, legalEntityId: ids.entity, joiningOn: addDays(today, 45), version: list.version }).expect(400);
    const moved = (await api('hr', 'put', `/lifecycle/batches/${batch.id}`).send({ name: `Campus ${run}`, legalEntityId: ids.entity, joiningOn: addDays(today, 45), reason: 'Exams postponed', version: list.version }).expect(200)).body;
    expect(moved.moved).toBe(2);
    for (const x of [a, b]) {
      expect((await inA((tx) => tx.preboarding.findFirstOrThrow({ where: { id: x.id } }))).joiningOn.toISOString().slice(0, 10)).toBe(addDays(today, 45));
      expect((await inA((tx) => tx.journey.findFirstOrThrow({ where: { id: x.journeyId } }))).anchorOn.toISOString().slice(0, 10)).toBe(addDays(today, 45));
    }
    const loi = (await api('hr', 'post', `/lifecycle/batches/${batch.id}/loi`).expect(200)).body;
    expect(loi).toMatchObject({ issued: 2, failed: [] });
    // The buddy: not the manager; the day-30 check-in then goes to the buddy.
    const pa = await inA((tx) => tx.preboarding.findFirstOrThrow({ where: { id: a.id } }));
    await api('hr', 'put', `/lifecycle/joiners/${a.id}/buddy`).send({ employeeId: emp.mgr, version: pa.version }).expect(400);
    await api('hr', 'put', `/lifecycle/joiners/${a.id}/buddy`).send({ employeeId: emp.buddy, version: pa.version }).expect(200);
    const checkin = await inA((tx) => tx.journeyTask.findFirstOrThrow({ where: { journeyId: a.journeyId, key: 'buddy_checkin' } }));
    expect(checkin).toMatchObject({ assigneeUserId: users.buddy, dueOn: new Date(`${addDays(today, 75)}T00:00:00Z`) });
    expect((await api('buddy', 'get', '/lifecycle/my-tasks').expect(200)).body.tasks.some((t: { id: string }) => t.id === checkin.id)).toBe(true);
  });

  it('death in service: nominations 60 / 40 become the payees in the hand-off; the family signs in and reads the letter', async () => {
    emp.suresh = await hire('Suresh', 'SF-020');
    await inA((tx) => tx.employeeNomination.createMany({ data: [['Meera', 'Wife', '60'], ['Arjun', 'Son', '40']].map(([name, relation, share]) => ({ organizationId: org.A.id, employeeId: emp.suresh, scheme: 'gratuity', name, relation, sharePercent: share, source: 'hr' })) }));
    const k = (await api('hr', 'post', '/lifecycle/exits').send({ employeeId: emp.suresh, exitType: 'death', lwd: addDays(today, -1), reasonText: 'Passed away' }).expect(201)).body;
    expect(k.interview).toBeNull();
    expect(k.clearance.map((i: { title: string }) => i.title)).toEqual(expect.arrayContaining([expect.stringMatching(/Form 5 IF/), expect.stringMatching(/Form 10D/), expect.stringMatching(/Form 20/)]));
    const p = (await api('hr', 'get', `/lifecycle/exits/${k.id}/payees`).expect(200)).body;
    expect(p).toMatchObject({ total: '100.00', complete: true });
    // The family's email for the nominee login.
    await api('hr', 'put', `/lifecycle/exits/${k.id}/payees`).send({ payees: [{ kind: 'nominee', name: 'Meera', relation: 'Wife', sharePercent: '60', email: `meera-${run}@mail.test` }, { kind: 'nominee', name: 'Arjun', relation: 'Son', sharePercent: '30' }] }).expect(400);
    await api('hr', 'put', `/lifecycle/exits/${k.id}/payees`).send({ payees: [{ kind: 'nominee', name: 'Meera', relation: 'Wife', sharePercent: '60', email: `meera-${run}@mail.test` }, { kind: 'nominee', name: 'Arjun', relation: 'Son', sharePercent: '40' }] }).expect(200);
    const h = (await api('hr', 'get', `/lifecycle/exits/${k.id}/handoff`).expect(200)).body;
    expect(h.current.payees).toEqual([expect.objectContaining({ name: 'Meera', sharePercent: '60.00' }), expect.objectContaining({ name: 'Arjun', sharePercent: '40.00' })]);
    await lastDay.sweepCase(org.A.id, k.id, new Date());
    const steps = Object.fromEntries(((await api('hr', 'get', `/lifecycle/exits/${k.id}/steps`).expect(200)).body as { handler: string; status: string }[]).map((s) => [s.handler, s.status]));
    expect(steps['letters.condolence']).toBe('done');
    expect(steps['letters.relieving']).toBeUndefined();
    const mail = `meera-${run}@mail.test`;
    email.send.mockClear();
    await request(server()).post(`/api/v1/portal/alumni/${org.A.slug}/code`).send({ email: mail }).expect(200);
    const t = (await request(server()).post(`/api/v1/portal/alumni/${org.A.slug}/verify`).send({ email: mail, code: await codeFor(mail) }).expect(200)).body.token;
    const me = (await request(server()).get(`/api/v1/portal/alumni/${org.A.slug}/me`).set('X-Alumni-Portal', t).expect(200)).body;
    expect(me).toMatchObject({ nominee: 'Meera' });
    expect(me.letters.map((l: { title: string }) => l.title.split(':')[0])).toContain('Letter to the family (death in service)');
  });

  it('death without a nomination: nothing settles until legal heirs with a succession certificate make 100 %', async () => {
    emp.deepak = await hire('Deepak', 'SF-021');
    const k = (await api('hr', 'post', '/lifecycle/exits').send({ employeeId: emp.deepak, exitType: 'death', lwd: addDays(today, -1), reasonText: 'Passed away' }).expect(201)).body;
    await lastDay.sweepCase(org.A.id, k.id, new Date());
    expect((await api('hr', 'post', `/lifecycle/exits/${k.id}/settled-outside`).send({ settledOn: today, reason: 'Paid' }).expect(409)).body.code).toBe('PAYEES_NEEDED');
    const personId = (await inA((tx) => tx.employee.findFirstOrThrow({ where: { id: emp.deepak } }))).personId;
    await api('hr', 'put', `/lifecycle/exits/${k.id}/payees`).send({ payees: [{ kind: 'legal_heir', name: 'Kamala', relation: 'Mother', sharePercent: '100' }] }).expect(400);
    const doc = (await api('hr', 'post', `/documents/people/${personId}/succession_certificate`).attach('file', Buffer.from('%PDF-1.4\n%%EOF'), { filename: 'heir.pdf', contentType: 'application/pdf' }).expect(201)).body;
    await api('hr', 'put', `/lifecycle/exits/${k.id}/payees`).send({ payees: [{ kind: 'legal_heir', name: 'Kamala', relation: 'Mother', sharePercent: '100', documentId: doc.id }] }).expect(200);
    await api('hr', 'post', `/lifecycle/exits/${k.id}/settled-outside`).send({ settledOn: today, reason: 'Paid to the legal heir' }).expect(200);
  });

  it("absconding (Anil): day 3 / 7 / 14 / 21 steps, deemed abandonment with LWD = last day present; a timeline stops on return", async () => {
    emp.anil = await hire('Anil', 'SF-030');
    const lastPresent = addDays(today, -22);
    const t = (await api('hr', 'post', '/lifecycle/absconding').send({ employeeId: emp.anil, lastPresentOn: lastPresent }).expect(201)).body;
    let row = (await api('hr', 'get', '/lifecycle/absconding').expect(200)).body.rows.find((r: { id: string }) => r.id === t.id);
    expect(row.steps.map((s: { dueOn: string }) => s.dueOn)).toEqual([addDays(lastPresent, 3), addDays(lastPresent, 7), addDays(lastPresent, 14), addDays(lastPresent, 21)]);
    await extras.runTimeline(org.A.id, t.id, today);
    row = (await api('hr', 'get', '/lifecycle/absconding').expect(200)).body.rows.find((r: { id: string }) => r.id === t.id);
    expect(row.status).toBe('abandoned');
    expect(row.steps.every((s: { doneAt: string | null }) => s.doneAt)).toBe(true);
    const k = (await api('hr', 'get', `/lifecycle/exits/${row.exitCaseId}`).expect(200)).body;
    expect(k).toMatchObject({ exitType: 'absconding', lastDay: lastPresent, status: 'accepted' });
    expect(k.hr.rehireEligible).toBe(false);
    const anilPerson = (await inA((tx) => tx.employee.findFirstOrThrow({ where: { id: emp.anil } }))).personId;
    expect(await inA((tx) => tx.letterIssue.count({ where: { letterType: 'absconding_notice', personId: anilPerson, status: 'issued' } }))).toBe(2);
    await api('hr', 'put', `/lifecycle/absconding/${t.id}/steps/notice_1/dispatch`).send({ ref: 'RP123456789IN', version: row.version }).expect(200);
    // A second timeline stops on return: nothing more happens.
    emp.ajay = await hire('Ajay', 'SF-031');
    const t2 = (await api('hr', 'post', '/lifecycle/absconding').send({ employeeId: emp.ajay, lastPresentOn: addDays(today, -4) }).expect(201)).body;
    await extras.runTimeline(org.A.id, t2.id, today);
    let r2 = (await api('hr', 'get', '/lifecycle/absconding').expect(200)).body.rows.find((r: { id: string }) => r.id === t2.id);
    expect(r2.steps.map((s: { doneAt: string | null }) => Boolean(s.doneAt))).toEqual([true, false, false, false]);
    await api('hr', 'post', `/lifecycle/absconding/${t2.id}/stop`).send({ reason: 'Came back, was in hospital', version: r2.version }).expect(200);
    await extras.runTimeline(org.A.id, t2.id, addDays(today, 30));
    r2 = (await api('hr', 'get', '/lifecycle/absconding').expect(200)).body.rows.find((r: { id: string }) => r.id === t2.id);
    expect(r2).toMatchObject({ status: 'stopped', exitCaseId: null });
  });

  it('contract end: reminders at 30 and 7 days, an exit only when the policy says so; retirement opens months ahead', async () => {
    emp.kavi = await hire('Kavi', 'SF-040');
    const end = addDays(today, 30);
    await api('hr', 'put', `/lifecycle/contracts/${emp.kavi}`).send({ action: 'set', contractEndOn: end, reason: 'Fixed-term project' }).expect(200);
    await extras.policySweepOrg(org.A.id, today);
    const e1 = await inA((tx) => tx.employment.findFirstOrThrow({ where: { employeeId: emp.kavi } }));
    expect(e1.contractReminded).toEqual([30]);
    await extras.policySweepOrg(org.A.id, addDays(today, 23));
    expect((await inA((tx) => tx.employment.findFirstOrThrow({ where: { employeeId: emp.kavi } }))).contractReminded).toEqual([30, 7]);
    expect(await inA((tx) => tx.exitCase.count({ where: { employeeId: emp.kavi } }))).toBe(0);
    await inA((tx) => tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key: 'contract_end.action', value: 'auto_exit' } }));
    await extras.policySweepOrg(org.A.id, addDays(today, 23));
    const k = await inA((tx) => tx.exitCase.findFirstOrThrow({ where: { employeeId: emp.kavi } }));
    expect(k).toMatchObject({ exitType: 'end_of_contract', status: 'accepted' });
    expect(k.approvedLwd?.toISOString().slice(0, 10)).toBe(end);
    // Retirement: 58 at the end of the month two months from now; the exit opens 6 months ahead.
    emp.ravi = await hire('Ravi', 'SF-041');
    await dob(emp.ravi, yearsAgo(58, 60));
    await extras.policySweepOrg(org.A.id, today);
    const r = await inA((tx) => tx.exitCase.findFirstOrThrow({ where: { employeeId: emp.ravi } }));
    expect(r.exitType).toBe('retirement');
    expect(r.approvedLwd!.toISOString().slice(0, 10)).toMatch(new RegExp(`^${yearsAgo(0, 60).slice(0, 7)}`));
  });

  it('retrenchment at a 350-worker establishment waits for the government permission; VRS', async () => {
    // 349 more workers on the plant's rolls (only the count matters here).
    await inA((tx) => tx.$executeRaw`
      WITH p AS (INSERT INTO persons (organization_id, given_name, family_name) SELECT ${org.A.id}::uuid, 'Worker', 'W' || g FROM generate_series(1, 349) g RETURNING id),
           e AS (INSERT INTO employees (organization_id, person_id, given_name) SELECT ${org.A.id}::uuid, p.id, 'Worker' FROM p RETURNING id)
      INSERT INTO employments (organization_id, employee_id, legal_entity_id, employee_code, code_scope_key, joined_on)
      SELECT ${org.A.id}::uuid, e.id, ${ids.plant}::uuid, 'W' || row_number() OVER (), ${ids.plant}::uuid, '2020-01-01' FROM e`);
    emp.mohan = await hire('Mohan', 'SP-001', { entity: ids.plant, location: ids.hosur, joinedOn: '2026-04-06' });
    const perm = (await api('hr', 'post', '/lifecycle/ir-permissions').send({ legalEntityId: ids.plant, kind: 'retrenchment', workersAffected: 1, reasons: 'Line closed', appliedOn: today, authority: 'Labour Department, Tamil Nadu' }).expect(201)).body;
    await api('hr', 'post', '/lifecycle/exits').send({ employeeId: emp.mohan, exitType: 'retrenchment', lwd: addDays(today, 30), reasonText: 'Line closed' }).expect(400);
    const k = (await api('hr', 'post', '/lifecycle/exits').send({ employeeId: emp.mohan, exitType: 'retrenchment', lwd: addDays(today, 30), reasonText: 'Line closed', selectionBasis: 'Last come, first go in the operator category', noticeMode: 'pay_in_lieu', irPermissionId: perm.id }).expect(201)).body;
    expect(k.status).toBe('submitted');
    const refused = await decideAs('hr2', 'approve', 409);
    expect(refused.body.code).toBe('IR_PERMISSION_NEEDED');
    const p = (await api('hr', 'get', '/lifecycle/ir-permissions').expect(200)).body;
    expect(p.workers[ids.plant]).toBe(350);
    await api('hr', 'post', `/lifecycle/ir-permissions/${perm.id}/decide`).send({ status: 'granted', decidedOn: today, version: 1 }).expect(200);
    await decideAs('hr2');
    expect((await api('hr', 'get', `/lifecycle/exits/${k.id}`).expect(200)).body.status).toBe('accepted');
    // VRS: open to 40+; Lata (45) applies and HR accepts.
    emp.lata = await hire('Lata', 'SF-050', { userId: users.lata });
    await dob(emp.lata, yearsAgo(45));
    await api('hr', 'post', '/lifecycle/vrs-schemes').send({ name: `VRS ${run}`, opensOn: today, closesOn: addDays(today, 30), minAge: 40, minServiceYears: 0 }).expect(201);
    const mine = (await api('lata', 'get', '/lifecycle/me/vrs').expect(200)).body.schemes;
    expect(mine[0]).toMatchObject({ eligible: true });
    await api('lata', 'post', '/lifecycle/me/vrs').send({ schemeId: mine[0].id, requestedLwd: addDays(today, 60) }).expect(201);
    const task = await inA((tx) => tx.wfTask.findFirstOrThrow({ where: { status: 'open', assigneeUserId: { in: [users.hr, users.hr2] } }, orderBy: { createdAt: 'desc' } }));
    await api(task.assigneeUserId === users.hr ? 'hr' : 'hr2', 'post', `/workflow/approvals/tasks/${task.id}/decide`).send({ decision: 'approve' }).expect(200);
    expect((await api('lata', 'get', '/lifecycle/me/resignation').expect(200)).body.current).toMatchObject({ exitType: 'vrs', status: 'accepted', lastDay: addDays(today, 60) });
  });

  it('the letter editor saves Word without a new library; the bulk wizard issues to many', async () => {
    const t = (await api('adminA', 'post', '/letters/templates/compose').send({ letterType: 'notice_board', name: 'Notice', requiresApproval: false, personSigns: false, paragraphs: [{ text: '{{legal_entity}}', heading: true }, { text: 'Dear {{employee_name}},' }, { text: 'Thank you.', bold: true }] }).expect(201)).body;
    expect(t).toMatchObject({ source: 'editor', status: 'draft', fields: expect.arrayContaining(['legal_entity', 'employee_name']) });
    const back = (await api('adminA', 'get', `/letters/templates/${t.id}/paragraphs`).expect(200)).body;
    expect(back.paragraphs).toEqual([{ text: '{{legal_entity}}', bold: true, heading: true }, { text: 'Dear {{employee_name}},', bold: false, heading: false }, { text: 'Thank you.', bold: true, heading: false }]);
    await api('adminA', 'post', '/letters/templates/compose').send({ letterType: 'bad_one', name: 'Bad', requiresApproval: false, personSigns: false, paragraphs: [{ text: 'Dear {{emp_nme}}' }] }).expect(400);
    const people = await inA((tx) => tx.employee.findMany({ where: { id: { in: [emp.buddy, emp.kavi] } }, select: { personId: true } }));
    const bulk = (await api('hr', 'post', '/letters/bulk').send({ letterType: 'employment_certificate', personIds: people.map((x) => x.personId) }).expect(200)).body;
    expect(bulk).toMatchObject({ issued: 2, failed: [] });
  });

  it('two companies apart', async () => {
    expect((await api('adminB', 'get', '/lifecycle/batches').expect(200)).body.rows).toHaveLength(0);
    expect((await api('adminB', 'get', '/lifecycle/absconding').expect(200)).body.rows).toHaveLength(0);
    expect((await api('adminB', 'get', '/lifecycle/ir-permissions').expect(200)).body.requests).toHaveLength(0);
    expect(await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.exitPayee.count())).toBe(0);
  });
});
