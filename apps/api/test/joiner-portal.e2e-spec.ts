import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import type Redis from 'ioredis';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { addDays } from '../src/lifecycle/journey-rules';
import { BGV_NOTICE } from '../src/lifecycle/portal.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';

// T9-01 the joiner portal, live with its design, against the real database (forced RLS, the app role) and Redis:
// the joiner's own checklist (only their tasks, due dates), the first day (place, time from the company setting,
// manager, buddy, batch), "date moved", nominees per scheme (PF, gratuity, group insurance) becoming the record's
// nominations, Form 12B in the tax section, a fresh code before PAN, ID and bank (wrong, used and stale codes refused),
// decline with a reason (HR told, audited), the outcome of a closed joining (declined, withdrawn, joined) readable and
// every change refused, one joiner never reaching another, two companies apart.
process.env.SD_SCANNER = 'dev-fake';

describe('Joiner portal (T9-01)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let redis: Redis;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'hr';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const portal = (method: 'get' | 'post' | 'put', path: string, t?: string, slug = org.A.slug) => {
    const r = request(server())[method](`/api/v1/portal/join/${slug}${path}`);
    return t ? r.set('X-Join-Portal', t) : r;
  };
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const joining = addDays(today, 10);
  const email = { send: jest.fn(async (_m: { to: string; subject: string; html?: string }) => ({ success: true })) };
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const codeFor = async (to: string) => {
    for (let i = 0; i < 60; i++) {
      const m = [...email.send.mock.calls].reverse().find(([x]) => x.to === to && /^\d{6}/.test(x.subject));
      if (m) return m[0].subject.slice(0, 6);
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`no code for ${to}`);
  };
  /** The resend wait and the hourly cap are production behaviour; a test that signs the same person in again starts clean. */
  const noCooldown = async () => {
    const keys = [...(await redis.keys('auth:otp:cool:*')), ...(await redis.keys('auth:otp:sends:*'))];
    if (keys.length) await redis.del(...keys);
  };
  const signIn = async (mail: string) => {
    await noCooldown();
    email.send.mockClear();
    await portal('post', '/code').send({ email: mail }).expect(200);
    return (await portal('post', '/verify').send({ email: mail, code: await codeFor(mail) }).expect(200)).body.token as string;
  };
  const stepUp = async (t: string, mail: string) => {
    await noCooldown();
    email.send.mockClear();
    await portal('post', '/step-up/code', t).expect(200);
    await portal('post', '/step-up', t).send({ code: await codeFor(mail) }).expect(200);
  };
  const addJoiner = async (given: string, mail: string, on = joining) => (await api('hr', 'post', '/lifecycle/joiners').send({ givenName: given, familyName: run, email: mail, joiningOn: on, legalEntityId: ids.entity, locationId: ids.blr, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: ids.mgrEmp }).expect(201)).body as { id: string; journeyId: string };
  const audits = (entityId: string, action: string) => inA((tx) => tx.auditLog.findMany({ where: { entityType: 'preboarding', entityId, action } }));
  const NOMINEES = [
    { name: 'Anil', relation: 'Father', dateOfBirth: '1961-03-14', pf: 50, gratuity: 50, insurance: 60 },
    { name: 'Usha', relation: 'Mother', pf: 50, gratuity: 50, insurance: 40 },
  ];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue(email).overrideProvider(BlobStorageService).useValue(createFakeBlobStorage()).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `joinp-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `JoinP Org ${k}`, slug: `joinp-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, string, string[] | null][] = [
      ['adminA', 'org_admin', null],
      ['hr', 'panel', [...tpl('hr_admin'), 'employee.change.manage']],
    ];
    for (const [who, role, keys] of roster) {
      const o = org.A.id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@joinp-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org.A.slug, email: `${who}@joinp-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Join Foods Pvt Ltd', shortName: `JP${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      ids.blr = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: { lines: ['12, Hosur Road'], city: 'Bengaluru', state: 'IN-KA', postalCode: '560068', country: 'IN' }, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Production', code: 'PROD', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Operator', code: 'OP' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const emp = (given: string, code: string) => api('adminA', 'post', '/people/employees').send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: given, familyName: run, employeeCode: code, joinedOn: '2026-04-06', assignment: { locationId: ids.blr, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null } });
    ids.mgrEmp = (await emp('Divya', 'JP-001').expect(201)).body.id;
    ids.buddyEmp = (await emp('Faisal', 'JP-002').expect(201)).body.id;
    await api('adminA', 'post', '/lifecycle/journey-templates/from-starter').send({ starterKey: 'onboarding_standard' }).expect(201);
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

  it('the checklist shows only the joiner’s own tasks with due dates; documents carry their due day; the first day', async () => {
    const mail = `riya-${run}@mail.test`;
    const j = await addJoiner('Riya', mail);
    ids.riya = j.id;
    ids.riyaMail = mail;
    const batch = await inA((tx) => tx.joinerBatch.create({ data: { organizationId: org.A.id, name: `Campus batch ${run}`, legalEntityId: ids.entity, joiningOn: new Date(`${joining}T00:00:00Z`) } }));
    await inA((tx) => tx.preboarding.update({ where: { id: j.id }, data: { buddyEmployeeId: ids.buddyEmp, batchId: batch.id } }));
    const t = await signIn(mail);
    ids.riyaToken = t;
    const me = (await portal('get', '/me', t).expect(200)).body;
    const tasks = await inA((tx) => tx.journeyTask.findMany({ where: { journeyId: j.journeyId } }));
    const own = tasks.filter((x) => x.ownerType === 'person');
    expect(own.length).toBeGreaterThan(0);
    expect(me.tasks.map((x: { id: string }) => x.id).sort()).toEqual(own.map((x) => x.id).sort());
    // HR's, IT's and payroll's tasks never reach the joiner.
    expect(me.tasks.some((x: { title: string }) => /UAN|laptop|Form 11/i.test(x.title))).toBe(false);
    expect(me.tasks[0]).toEqual({ id: expect.any(String), title: expect.any(String), dueOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), status: 'to_do' });
    const pan = me.documents.find((d: { typeKey: string }) => d.typeKey === 'pan_card');
    expect(pan.dueOn).toBe(addDays(joining, -7));
    expect(me.firstDay).toEqual({ reportingTime: '09:30', address: '12, Hosur Road, Bengaluru, 560068', buddy: `Faisal ${run}`, batch: `Campus batch ${run}`, bring: 'Original PAN and Aadhaar (to be seen, not kept)\nTwo passport photos\nBank passbook or cancelled cheque' });
    expect(me).toMatchObject({ manager: `Divya ${run}`, dateMoved: null });
    // The reporting time is a company setting HR can change.
    await inA((tx) => tx.setting.create({ data: { organizationId: org.A.id, key: 'joining.reporting_time', scopeType: 'tenant', scopeId: org.A.id, value: '10:00' } }));
    expect((await portal('get', '/me', t).expect(200)).body.firstDay.reportingTime).toBe('10:00');
  });

  it('"Bring on day one" is text HR writes in Settings, per company or legal entity; empty, too long or the wrong scope is refused', async () => {
    const key = 'joining.bring_on_day_one';
    const put = (who: Who, body: Record<string, unknown>) => api(who, 'put', '/org/settings').send({ key, scopeType: 'tenant', ...body });
    expect((await put('adminA', { value: '  \n  ' }).expect(400)).body.message).toBe('Write what goes in "Joiners bring on their first day", one thing a line.');
    expect((await put('adminA', { value: 'x'.repeat(501) }).expect(400)).body.message).toBe('"Joiners bring on their first day" is 501 characters. Keep it to 500 or fewer.');
    await put('adminA', { value: 'x'.repeat(1001) }).expect(400);
    await put('adminA', { scopeType: 'location', scopeId: ids.blr, value: 'Two photos' }).expect(400);
    // A joiner's portal session is no staff sign-in: refused.
    await request(server()).put('/api/v1/org/settings').set('X-Join-Portal', ids.riyaToken).send({ key, scopeType: 'tenant', value: 'Two photos' }).expect(401);
    await put('adminA', { value: '  Two passport photos\r\nSafety shoes for the plant floor \n' }).expect(200);
    const me = async () => (await portal('get', '/me', ids.riyaToken).expect(200)).body.firstDay.bring;
    expect(await me()).toBe('Two passport photos\nSafety shoes for the plant floor');
    // The joiner's legal entity has its own: that one wins.
    await put('adminA', { scopeType: 'legal_entity', scopeId: ids.entity, value: 'Original PAN card' }).expect(200);
    expect(await me()).toBe('Original PAN card');
    const changed = await inA((tx) => tx.auditLog.findMany({ where: { action: 'org.setting.changed' } }));
    expect(changed.some((a) => (a.metadataJson ?? '').includes(key))).toBe(true);
    // Back to the company text for the rest of the run.
    await inA((tx) => tx.setting.deleteMany({ where: { key, scopeType: 'legal_entity' } }));
  });

  it('"date moved": a postponed joining says the day moved and from when', async () => {
    const pb = (await api('hr', 'get', `/lifecycle/joiners/${ids.riya}`).expect(200)).body;
    await api('hr', 'post', `/lifecycle/joiners/${ids.riya}/postpone`).send({ joiningOn: addDays(joining, 7), version: pb.version }).expect(200);
    const me = (await portal('get', '/me', ids.riyaToken).expect(200)).body;
    expect(me).toMatchObject({ joiningOn: addDays(joining, 7), dateMoved: { from: joining } });
  });

  it('nominees per scheme (PF, gratuity, group insurance): each adds up to 100; audited without the names', async () => {
    const t = ids.riyaToken;
    const bad = (await portal('put', '/sections/nominees', t).send({ nominees: [{ ...NOMINEES[0], insurance: 40 }, NOMINEES[1]] }).expect(400)).body;
    expect(bad.message).toBe('Group insurance shares add up to 80%. Make them add up to 100%.');
    expect((await portal('put', '/sections/nominees', t).send({ nominees: [...NOMINEES, { name: 'Ravi', relation: 'Brother', pf: 0, gratuity: 0, insurance: 0 }] }).expect(400)).body.message).toMatch(/Ravi has no share/);
    // The old single share is refused (one share per scheme now).
    await portal('put', '/sections/nominees', t).send({ nominees: [{ name: 'Anil', relation: 'Father', sharePercent: 100 }] }).expect(400);
    await portal('put', '/sections/nominees', t).send({ nominees: [{ ...NOMINEES[0], pf: 101 }, NOMINEES[1]] }).expect(400);
    await portal('put', '/sections/nominees', t).send({ nominees: NOMINEES }).expect(200);
    const me = (await portal('get', '/me', t).expect(200)).body;
    expect(me.answers.nominees).toEqual([
      { name: 'Anil', relation: 'Father', dateOfBirth: '1961-03-14', pf: 50, gratuity: 50, insurance: 60 },
      { name: 'Usha', relation: 'Mother', dateOfBirth: null, pf: 50, gratuity: 50, insurance: 40 },
    ]);
    const a = await audits(ids.riya, 'preboarding.nominees.saved');
    expect(a).toHaveLength(1);
    expect(a[0].metadataJson).not.toMatch(/Anil|Usha/);
  });

  it('Form 12B in the tax section: TDS above the gross is refused; audited without the amounts', async () => {
    const t = ids.riyaToken;
    expect((await portal('put', '/sections/tax', t).send({ regime: 'new', previousIncome: { grossSalary: 100000, tds: 120000 } }).expect(400)).body.message).toMatch(/TDS is more than the gross/);
    await portal('put', '/sections/tax', t).send({ regime: 'new', previousIncome: { grossSalary: -1, tds: 0 } }).expect(400);
    await portal('put', '/sections/tax', t).send({ regime: 'old', previousIncome: { grossSalary: 420000, tds: 18600 } }).expect(200);
    expect((await portal('get', '/me', t).expect(200)).body.answers.tax).toEqual({ regime: 'old', previousIncome: { grossSalary: 420000, tds: 18600 } });
    // HR sees it in the joiner's forms.
    expect((await api('hr', 'get', `/lifecycle/joiners/${ids.riya}/forms`).expect(200)).body.answers.tax.previousIncome).toEqual({ grossSalary: 420000, tds: 18600 });
    const a = await audits(ids.riya, 'preboarding.form12b.saved');
    expect(a).toHaveLength(1);
    expect(a[0].metadataJson).not.toMatch(/420000|18600/);
    // A regime only, no earlier employer: still fine.
    await portal('put', '/sections/tax', t).send({ regime: 'new' }).expect(200);
    expect((await portal('get', '/me', t).expect(200)).body.answers.tax).toEqual({ regime: 'new', previousIncome: null });
  });

  it('PAN, ID and bank need a fresh code: a wrong, used or stale code is refused; the code reaches only its own session', async () => {
    const t = ids.riyaToken;
    const mail = ids.riyaMail;
    const identity = { legalName: `Riya ${run}`, pan: 'ABCPE1234F' };
    expect((await portal('put', '/sections/identity', t).send(identity).expect(403)).body.code).toBe('PORTAL_STEP_UP');
    expect((await portal('put', '/sections/bank', t).send({ holderName: `Riya ${run}`, accountNumber: '123456789012', ifsc: 'HDFC0001234' }).expect(403)).body.code).toBe('PORTAL_STEP_UP');
    await noCooldown();
    email.send.mockClear();
    await portal('post', '/step-up/code', t).expect(200);
    const code = await codeFor(mail);
    // The resend wait stays: a second code at once is refused.
    await portal('post', '/step-up/code', t).expect(429);
    await portal('post', '/step-up', t).send({ code: code === '000000' ? '111111' : '000000' }).expect(401);
    // A second session of the same joiner cannot use this session's code.
    const other = await signIn(mail);
    await portal('post', '/step-up', other).send({ code }).expect(401);
    await portal('post', '/step-up', t).send({ code }).expect(200);
    // Used once: the same code again is refused.
    await portal('post', '/step-up', t).send({ code }).expect(401);
    await portal('put', '/sections/identity', t).send(identity).expect(200);
    await portal('put', '/sections/identity', other).send(identity).expect(403);
    // After 10 minutes the step-up is stale.
    await inA((tx) => tx.preboardingPortalSession.updateMany({ where: { preboardingId: ids.riya, steppedUpAt: { not: null } }, data: { steppedUpAt: new Date(Date.now() - 11 * 60_000) } }));
    expect((await portal('put', '/sections/bank', t).send({ holderName: `Riya ${run}`, accountNumber: '123456789012', ifsc: 'HDFC0001234' }).expect(403)).body.code).toBe('PORTAL_STEP_UP');
    // Secrets are never logged: the PAN is not in the audit.
    const saved = await audits(ids.riya, 'preboarding.section.saved');
    expect(saved.map((x) => x.metadataJson).join(' ')).not.toMatch(/ABCPE1234F/);
  });

  it('sign-in: an expired or used code is refused; an expired session is refused; another company is refused', async () => {
    const mail = ids.riyaMail;
    await noCooldown();
    email.send.mockClear();
    await portal('post', '/code').send({ email: mail }).expect(200);
    const code = await codeFor(mail);
    await portal('post', '/code').send({ email: mail }).expect(429);
    // Expired: the code's five minutes are up (Redis drops it).
    await redis.del(`preboarding-portal:${org.A.id}:${mail}`);
    await portal('post', '/verify').send({ email: mail, code }).expect(401);
    const t = await signIn(mail);
    const used = await codeFor(mail);
    await portal('post', '/verify').send({ email: mail, code: used }).expect(401);
    await portal('get', '/me', t, org.B.slug).expect(401);
    await portal('get', '/me', 'not-a-token').expect(401);
    await inA((tx) => tx.preboardingPortalSession.updateMany({ where: { preboardingId: ids.riya }, data: { expiresAt: new Date(Date.now() - 1000) } }));
    await portal('get', '/me', t).expect(401);
    ids.riyaToken = await signIn(mail);
  });

  it('one joiner never reaches another', async () => {
    const mail = `sam-${run}@mail.test`;
    const j = await addJoiner('Sam', mail);
    const t = await signIn(mail);
    const me = (await portal('get', '/me', t).expect(200)).body;
    expect(me.name).toBe(`Sam ${run}`);
    expect(me.answers.nominees).toBeNull();
    await portal('put', '/sections/emergency', t).send({ name: 'Rita', relation: 'Sister', phone: '+91 98450 11122' }).expect(200);
    expect((await portal('get', '/me', ids.riyaToken).expect(200)).body.answers.emergency).toBeNull();
    expect((await inA((tx) => tx.preboarding.findFirstOrThrow({ where: { id: ids.riya } }))).sections).not.toHaveProperty('emergency');
    ids.sam = j.id;
    ids.samToken = t;
  });

  it('decline: a reason is needed; HR is told; audited; the joining closes and the page shows the outcome, read-only', async () => {
    const t = ids.samToken;
    await portal('post', '/decline', t).send({ reason: 'Because' }).expect(400);
    await portal('post', '/decline', t).send({}).expect(400);
    await portal('post', '/decline').send({ reason: 'Accepted another offer' }).expect(401);
    await portal('post', '/decline', t).send({ reason: 'Accepted another offer', note: 'Closer to home' }).expect(200);
    const pb = await inA((tx) => tx.preboarding.findFirstOrThrow({ where: { id: ids.sam } }));
    expect(pb).toMatchObject({ status: 'cancelled', outcome: 'reneged', outcomeReason: 'Accepted another offer: Closer to home' });
    const j = await inA((tx) => tx.journey.findFirstOrThrow({ where: { subjectId: ids.sam } }));
    expect(j.status).toBe('cancelled');
    expect(await audits(ids.sam, 'preboarding.declined')).toHaveLength(1);
    expect(await inA((tx) => tx.userNotification.count({ where: { recipientUserId: users.hr, type: 'preboarding.declined', entityId: ids.sam } }))).toBe(1);
    const me = (await portal('get', '/me', t).expect(200)).body;
    // The outcome and the joiner's own letters (none here), nothing else.
    expect(me).toEqual({ company: 'JoinP Org A', name: `Sam ${run}`, closed: { outcome: 'reneged', on: today }, letters: [] });
    // Downloads stay open for the joiner's own letters only: another id is not found (never "closed").
    await portal('get', `/letters/${randomUUID()}/file`, t).expect(404);
    await portal('get', '/letters/not-a-uuid/file', t).expect(400);
    // A closed joining is read-only: every change is refused.
    for (const [m, path, body] of [
      ['put', '/sections/emergency', { name: 'Rita', relation: 'Sister', phone: '+91 98450 11122' }],
      ['put', '/sections/tax', { regime: 'new' }],
      ['post', '/step-up/code', undefined],
      ['post', '/bgv-consent', { consent: true, noticeVersion: BGV_NOTICE }],
      ['post', '/decline', { reason: 'Personal reasons' }],
    ] as const) {
      const r = portal(m, path, t);
      expect((await (body ? r.send(body) : r).expect(409)).body.code).toBe('PORTAL_CLOSED');
    }
    expect((await portal('post', '/documents/pan_card', t).attach('file', PNG, 'pan.png').expect(409)).body.code).toBe('PORTAL_CLOSED');
    // Signing in again later shows the same outcome instead of refusing the code.
    const again = await signIn(`sam-${run}@mail.test`);
    expect((await portal('get', '/me', again).expect(200)).body.closed.outcome).toBe('reneged');
    // HR can no longer cancel it.
    await markSteppedUp(tenantPrisma, token.hr);
    await api('hr', 'post', `/lifecycle/joiners/${ids.sam}/cancel`).send({ outcome: 'withdrawn', reason: 'Role closed', version: pb.version }).expect(409);
  });

  it('cancelled by HR: the joiner signs in and reads the outcome (did not join, offer withdrawn)', async () => {
    const mail = `tara-${run}@mail.test`;
    const j = await addJoiner('Tara', mail, today);
    const pb = (await api('hr', 'get', `/lifecycle/joiners/${j.id}`).expect(200)).body;
    await markSteppedUp(tenantPrisma, token.hr);
    await api('hr', 'post', `/lifecycle/joiners/${j.id}/cancel`).send({ outcome: 'did_not_join', reason: 'Did not come', version: pb.version }).expect(200);
    const t = await signIn(mail);
    expect((await portal('get', '/me', t).expect(200)).body.closed).toEqual({ outcome: 'cancelled', on: today });
    await portal('put', '/sections/tax', t).send({ regime: 'new' }).expect(409);
    // An offer withdrawn (it needs the withdrawal letter template, covered in lifecycle-6b) reads as withdrawn.
    await inA((tx) => tx.preboarding.update({ where: { id: j.id }, data: { outcome: 'withdrawn' } }));
    expect((await portal('get', '/me', t).expect(200)).body.closed).toEqual({ outcome: 'withdrawn', on: today });
  });

  it('joined: nominees become nominations per scheme; the page then says the joining is done', async () => {
    const t = ids.riyaToken;
    await portal('put', '/sections/tax', t).send({ regime: 'new' }).expect(200);
    const pb = (await api('hr', 'get', `/lifecycle/joiners/${ids.riya}`).expect(200)).body;
    await api('hr', 'post', `/lifecycle/joiners/${ids.riya}/postpone`).send({ joiningOn: today, version: pb.version }).expect(200);
    const now = (await api('hr', 'get', `/lifecycle/joiners/${ids.riya}`).expect(200)).body;
    const done = (await api('hr', 'post', `/lifecycle/joiners/${ids.riya}/join`).send({ identityAttested: true, status: 'probation', version: now.version }).expect(200)).body;
    const noms = await inA((tx) => tx.employeeNomination.findMany({ where: { employeeId: done.employeeId }, orderBy: [{ scheme: 'asc' }, { name: 'asc' }] }));
    expect(noms.map((n) => [n.scheme, n.name, Number(n.sharePercent)])).toEqual([
      ['gratuity', 'Anil', 50],
      ['gratuity', 'Usha', 50],
      ['group_term', 'Anil', 60],
      ['group_term', 'Usha', 40],
      ['pf', 'Anil', 50],
      ['pf', 'Usha', 50],
    ]);
    const again = await signIn(ids.riyaMail);
    expect((await portal('get', '/me', again).expect(200)).body.closed).toEqual({ outcome: 'joined', on: today });
    await portal('put', '/sections/tax', again).send({ regime: 'new' }).expect(409);
  });

  it('BGV withdrawal is recorded in the audit', async () => {
    const mail = `uma-${run}@mail.test`;
    const j = await addJoiner('Uma', mail);
    await api('hr', 'post', `/lifecycle/joiners/${j.id}/bgv/ask`).expect(200);
    const t = await signIn(mail);
    await portal('post', '/bgv-consent', t).send({ consent: true, noticeVersion: BGV_NOTICE }).expect(200);
    expect((await portal('get', '/me', t).expect(200)).body.bgv.consented).toBe(true);
    await portal('post', '/bgv-consent', t).send({ consent: false, noticeVersion: BGV_NOTICE }).expect(200);
    expect((await portal('get', '/me', t).expect(200)).body.bgv.consented).toBe(false);
    expect(await audits(j.id, 'bgv.consent.withdrawn')).toHaveLength(1);
  });

  it('two companies stay apart: a company B slug never finds a company A joiner', async () => {
    email.send.mockClear();
    await noCooldown();
    await portal('post', '/code', undefined, org.B.slug).send({ email: `tara-${run}@mail.test` }).expect(200);
    await new Promise((r) => setTimeout(r, 300));
    expect(email.send.mock.calls.some(([m]) => m.to === `tara-${run}@mail.test`)).toBe(false);
    await portal('get', '/me', ids.samToken, org.B.slug).expect(401);
  });
});
