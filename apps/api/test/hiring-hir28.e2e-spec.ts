import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { OfferTemplatesToLetters } from '../src/offers/offer-letters';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// HIR-28 bulk offers end to end against the real database (forced RLS, the app role). One job, one letter, one salary
// structure, one joining day and a CTC per candidate; every row is an ordinary HIR-09 offer (the pay key, the band step,
// the route, conditions, the template's e-sign, an idempotent send). One bad row never blocks the others; rows beyond the
// free places on the plan line are held; the same batch key never sends twice. Refusals: no pay key (403), an employee
// (403), another company (404), acting for someone else (403), bad input (400).
describe('HIR-28 bulk offers', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'rec' | 'noPay' | 'hrHead' | 'pay' | 'emp' | 'recB' | 'actee' | 'acting';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const at = (o: string) => <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => at(org.A.id)(fn);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const plus = (days: number) => new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const email = { send: jest.fn(async (_m: { to: string; subject: string }) => ({ success: true })) };
  const setting = (key: string, value: string | null) =>
    inA(async (tx) => {
      await tx.setting.deleteMany({ where: { organizationId: org.A.id, key } });
      if (value) await tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key, value } });
    });
  const entry = async (k: string, jobKey = 'job') => (ids[k] = (await api('rec', 'post', `/jobs/${ids[jobKey]}/entries`).send({ newCandidate: { name: `Cand ${k}`, email: `${k}-${run}@mail.test` } }).expect(201)).body.id);
  // Answer 405: a batch runs in the background; read it until it is done.
  const finished = async (id: string) => {
    for (let i = 0; i < 240; i++) {
      const r = (await api('rec', 'get', `/hiring/offer-batches/${id}`).expect(200)).body;
      if (r.status === 'done') return r;
      await new Promise((ok) => setTimeout(ok, 250));
    }
    throw new Error(`batch ${id} did not finish`);
  };
  const batch = (rows: [string, string][], over: Record<string, unknown> = {}) => ({ jobId: ids.job, batchKey: randomUUID(), templateVersionId: ids.tv, locationId: ids.blr, startDate: plus(40), letterKind: 'loi', templateId: ids.tplE, addConditions: true, rows: rows.map(([k, annualCtc]) => ({ entryId: ids[k], annualCtc })), ...over });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue(email).overrideProvider(BlobStorageService).useValue(createFakeBlobStorage()).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `hir28-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HIR28 Org ${k}`, slug: `hir28-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const PAYKEY = 'ats.offer.compensation.view';
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['rec', 'A', 'panel', [...tpl('recruiter'), PAYKEY]],
      ['noPay', 'A', 'panel', tpl('recruiter')],
      ['hrHead', 'A', 'panel', tpl('hiring_admin')],
      ['pay', 'A', 'panel', tpl('payroll_admin')],
      ['emp', 'A', 'panel', []],
      ['recB', 'B', 'panel', [...tpl('recruiter'), PAYKEY]],
      ['actee', 'A', 'recruiter', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await at(o)((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at(o)((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@hir28-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@hir28-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Kaveri Campus Pvt Ltd', shortName: `KC${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      ids.blr = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Hosur plant', code: 'HSR', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const hrDept = randomUUID();
      ids.hrDept = (await tx.department.create({ data: { ...o, id: hrDept, name: 'Human Resources', code: 'HR', path: `/${hrDept}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Graduate Engineer Trainee', code: 'GET' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      ids.g3 = (await tx.grade.create({ data: { ...o, name: 'Grade 3', code: 'G3', rank: 3 } })).id;
      await tx.gradePayRange.create({ data: { ...o, gradeId: ids.g3, legalEntityId: ids.entity, currency: 'INR', min: 420_000, mid: 460_000, max: 500_000, validFrom: new Date('2026-04-01') } });
      const plan = await tx.headcountPlan.create({ data: { ...o, departmentId: ids.hrDept, fyStart: 2026, status: 'approved', createdBy: users.hrHead } });
      ids.line = (await tx.headcountPlanLine.create({ data: { ...o, planId: plan.id, designationId: ids.desig, count: 4 } })).id;
    });
    const hrHeadEmp = (await api('adminA', 'post', '/people/employees').send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: 'Lakshmi', familyName: run, employeeCode: 'KC-001', joinedOn: '2026-04-06', userId: users.hrHead, workEmail: `hrHead@hir28-${run}.test`, assignment: { locationId: ids.blr, departmentId: ids.hrDept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null } }).expect(201)).body.id;
    await inA((tx) => tx.department.update({ where: { id: ids.hrDept }, data: { headEmployeeId: hrHeadEmp, headSince: new Date(`${today}T00:00:00Z`) } }));
    await api('pay', 'post', '/payroll/components/starter').expect(201);
    ids.tv = (await inA((tx) => tx.salaryTemplateVersion.findFirstOrThrow({ where: { organizationId: org.A.id } }))).id;
    ids.job = (await api('rec', 'post', '/jobs').send({ title: 'Graduate Engineer Trainee' }).expect(201)).body.id;
    ids.job2 = (await api('rec', 'post', '/jobs').send({ title: 'Another job' }).expect(201)).body.id;
    await inA((tx) => tx.job.update({ where: { id: ids.job }, data: { legalEntityId: ids.entity, gradeId: ids.g3, locationId: ids.blr, headcountPlanLineId: ids.line } }));
    for (const k of ['aditi', 'farhan', 'gayathri', 'harsha', 'ishita', 'joel', 'kavin', 'lena', 'mohan']) await entry(k);
    await entry('elsewhere', 'job2');
    // Answer 2515: an older offer template, moved by the one-off command into a Letters 'offer' template.
    const old = await inA((tx) => tx.offerTemplate.create({ data: { organizationId: org.A.id, name: `Campus LOI ${run}`, subject: 'Your letter of intent', body: 'Dear {{candidateName}}, {{compensation}}. {{offerLink}}', esign: true } }));
    await app.get(OfferTemplatesToLetters).run();
    ids.tplE = (await inA((tx) => tx.offerTemplate.findFirstOrThrow({ where: { id: old.id } }))).letterTemplateId!;
    // Gayathri already has an offer of her own: a batch skips her, never offers twice.
    ids.single = (await api('rec', 'post', '/hiring/offers').send({ entryId: ids.gayathri, templateVersionId: ids.tv, annualCtc: '480000', locationId: ids.blr, startDate: plus(40), expiresAt: plus(10) }).expect(201)).body.id;
    ids.jobB = (await api('recB', 'post', '/jobs').send({ title: 'Other company job' }).expect(201)).body.id;
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

  it('setup: the job, its grade range, the free places on the plan line, the candidates without an open offer', async () => {
    const s = (await api('rec', 'get', `/hiring/offer-batches/setup?jobId=${ids.job}`).expect(200)).body;
    expect(s).toMatchObject({ job: { title: 'Graduate Engineer Trainee' }, grade: 'G3', band: { min: 420_000, max: 500_000 }, plan: { check: 'hold', linked: true, free: 4 }, expiryDays: 7 });
    expect(s.candidates.map((c: { name: string }) => c.name)).toEqual(['Cand aditi', 'Cand farhan', 'Cand harsha', 'Cand ishita', 'Cand joel', 'Cand kavin', 'Cand lena', 'Cand mohan']);
    expect(s.letters.find((l: { value: string }) => l.value === ids.tplE)).toMatchObject({ esign: true });
  });

  it('one batch: each row an ordinary offer; above the range waits for its step; a bad row fails alone; beyond the plan is held', async () => {
    email.send.mockClear();
    // Harsha's details were erased meanwhile: his row fails alone, with the reason; the others go on.
    await inA(async (tx) => tx.candidate.update({ where: { id: (await tx.pipelineEntry.findFirstOrThrow({ where: { id: ids.harsha } })).candidateId }, data: { erasedAt: new Date() } }));
    const body = batch([
      ['aditi', '480000'],
      ['farhan', '540000'],
      ['gayathri', '480000'],
      ['harsha', '480000'],
      ['ishita', '480000'],
      ['joel', '480000'],
    ]);
    ids.key = body.batchKey;
    const started = (await api('rec', 'post', '/hiring/offer-batches').send(body).expect(200)).body;
    expect(started.progress.total).toBe(6);
    const b = await finished(started.id);
    ids.batch = b.id;
    expect(b.progress).toEqual({ done: 6, total: 6 });
    expect(b.rows.map((r: { name: string; status: string }) => [r.name, r.status])).toEqual([
      ['Cand aditi', 'sent'],
      ['Cand farhan', 'pending_approval'],
      ['Cand gayathri', 'skipped'],
      ['Cand harsha', 'failed'],
      ['Cand ishita', 'held'],
      ['Cand joel', 'held'],
    ]);
    expect(b.rows[3].reason).toMatch(/erased/);
    expect(b.rows[4].reason).toMatch(/headcount-plan line/);
    // The single-offer rules hold: the template's e-sign, the company's conditions, the extra step above the range.
    const made = await inA((tx) => tx.offer.findMany({ where: { batchId: ids.batch }, include: { conditions: true } }));
    expect(made).toHaveLength(2);
    const aditi = made.find((o) => o.id === b.rows[0].offerId)!;
    expect(aditi).toMatchObject({ status: 'sent', esign: true });
    expect(aditi.conditions.length).toBe(3);
    expect(aditi.expiresAt.toISOString().slice(0, 10) <= plus(8)).toBe(true);
    const farhan = made.find((o) => o.id === b.rows[1].offerId)!;
    const steps = (await inA((tx) => tx.wfRequest.findFirstOrThrow({ where: { id: farhan.wfRequestId! } }))).steps as unknown as { name: string; approverIds: string[] }[];
    expect(steps).toEqual([expect.objectContaining({ name: 'Above the pay range (HR head)', approverIds: [users.hrHead] })]);
    expect(email.send.mock.calls.filter(([m]) => m.to === `aditi-${run}@mail.test`)).toHaveLength(1);
    expect(email.send.mock.calls.some(([m]) => m.to === `farhan-${run}@mail.test`)).toBe(false);
    // The single offer stays as it was.
    expect((await inA((tx) => tx.offer.findFirstOrThrow({ where: { id: ids.single } }))).batchId).toBeNull();
  });

  it('the same batch key never sends twice; the batch reads back with each row', async () => {
    email.send.mockClear();
    const again = (await api('rec', 'post', '/hiring/offer-batches').send({ ...batch([['aditi', '480000']]), batchKey: ids.key }).expect(200)).body;
    expect(again.id).toBe(ids.batch);
    expect(again.rows).toHaveLength(6);
    expect(await inA((tx) => tx.offer.count({ where: { batchId: ids.batch } }))).toBe(2);
    expect(email.send).not.toHaveBeenCalled();
    const read = (await api('rec', 'get', `/hiring/offer-batches/${ids.batch}`).expect(200)).body;
    expect(read).toMatchObject({ status: 'done', canSeePay: true, job: { title: 'Graduate Engineer Trainee' } });
    expect(read.rows[0]).toMatchObject({ annualCtc: 480_000, offerStatus: 'sent', esign: true, band: 'Within the grade pay range.' });
    expect(read.rows[1]).toMatchObject({ offerStatus: 'pending_approval', band: 'Above the grade pay range. Needs extra approval.' });
  });

  it('pay is hidden and making offers refused without the offer-pay key', async () => {
    const read = (await api('noPay', 'get', `/hiring/offer-batches/${ids.batch}`).expect(200)).body;
    expect(read.canSeePay).toBe(false);
    expect(read.rows.every((r: { annualCtc: number | null; band: string | null }) => r.annualCtc === null && r.band === null)).toBe(true);
    await api('noPay', 'get', `/hiring/offer-batches/setup?jobId=${ids.job}`).expect(403);
    await api('noPay', 'post', '/hiring/offer-batches').send(batch([['kavin', '480000']])).expect(403);
  });

  it('answer 514: a fixed CTC of 0 or blank is refused (400) and nothing is made; above 0 is taken', async () => {
    for (const ctc of ['0', '0.00', '', ' '])
      expect((await api('rec', 'post', '/hiring/offer-batches').send(batch([['kavin', ctc]])).expect(400)).body.message.join(' ')).toMatch(/fixed CTC above ₹0/);
    expect(await inA((tx) => tx.offer.count({ where: { pipelineEntryId: ids.kavin } }))).toBe(0);
  });

  it('with the plan check off, nothing is held', async () => {
    await setting('hiring.bulk_offer.plan_check', 'off');
    const b = await finished((await api('rec', 'post', '/hiring/offer-batches').send(batch([['ishita', '480000'], ['joel', '480000']])).expect(200)).body.id);
    expect(b.rows.map((r: { status: string }) => r.status)).toEqual(['sent', 'sent']);
    await setting('hiring.bulk_offer.plan_check', null);
  });

  it('answers 401 and 405: a batch names an open People joiner batch on its day; accepted offers join it as joiners', async () => {
    await setting('hiring.bulk_offer.plan_check', 'off');
    const day = plus(40);
    const jb = (o: string, name: string, joiningOn: string, status = 'open', entity = ids.entity) => at(o)((tx) => tx.joinerBatch.create({ data: { organizationId: o, name: `${name} ${run}`, legalEntityId: entity, joiningOn: new Date(`${joiningOn}T00:00:00Z`), status } }));
    ids.jb = (await jb(org.A.id, 'GET 2027', day)).id;
    const otherDay = (await jb(org.A.id, 'Later batch', plus(41))).id;
    const closed = (await jb(org.A.id, 'Closed batch', day, 'closed')).id;
    // The setup offers the open batches of the job's entity.
    const setup = (await api('rec', 'get', `/hiring/offer-batches/setup?jobId=${ids.job}`).expect(200)).body;
    expect(setup.joinerBatches).toEqual(expect.arrayContaining([expect.objectContaining({ value: ids.jb, joiningOn: day, legalEntityId: ids.entity })]));
    expect(setup.joinerBatches.some((x: { value: string }) => x.value === closed)).toBe(false);
    expect(setup.locations[0]).toMatchObject({ legalEntityId: ids.entity });
    // Refused: another day 400, a closed batch 409, another company's batch 404; nothing is made.
    await api('rec', 'post', '/hiring/offer-batches').send(batch([['lena', '480000']], { joinerBatchId: otherDay })).expect(400);
    await api('rec', 'post', '/hiring/offer-batches').send(batch([['lena', '480000']], { joinerBatchId: closed })).expect(409);
    const bBatch = await at(org.B.id)(async (tx) => {
      const e = await tx.legalEntity.create({ data: { organizationId: org.B.id, name: 'Other Co', shortName: `OC${run.slice(0, 4).toUpperCase()}`, isDefault: true } });
      return tx.joinerBatch.create({ data: { organizationId: org.B.id, name: 'B batch', legalEntityId: e.id, joiningOn: new Date(`${day}T00:00:00Z`) } });
    });
    await api('rec', 'post', '/hiring/offer-batches').send(batch([['lena', '480000']], { joinerBatchId: bBatch.id })).expect(404);
    expect(await inA((tx) => tx.offer.count({ where: { pipelineEntryId: ids.lena } }))).toBe(0);
    // The batch with the joiner batch, in the background (405): progress, then done.
    const started = (await api('rec', 'post', '/hiring/offer-batches').send(batch([['lena', '480000'], ['mohan', '480000']], { joinerBatchId: ids.jb })).expect(200)).body;
    expect(started.progress.total).toBe(2);
    expect(started.joinerBatch).toEqual({ id: ids.jb, name: `GET 2027 ${run}` });
    const b = await finished(started.id);
    expect(b.rows.map((r: { status: string }) => r.status)).toEqual(['sent', 'sent']);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'ats.offer_batch.finished', entityId: b.id } }))).toBe(1);
    // Both accept; HR makes them joiners: on the batch's day Lena joins the batch; Mohan on another day does not, and HR is told why.
    await inA((tx) => tx.offer.updateMany({ where: { batchId: b.id }, data: { status: 'accepted', respondedAt: new Date() } }));
    // An onboarding checklist, as every company has before adding joiners.
    await api('adminA', 'post', '/lifecycle/journey-templates/from-starter').send({ starterKey: 'onboarding_standard' }).expect(201);
    const joinerBody = (k: string, joiningOn: string) => ({ givenName: `Cand ${k}`, familyName: run, joiningOn, legalEntityId: ids.entity, locationId: ids.blr, departmentId: ids.hrDept, designationId: ids.desig, employmentTypeId: ids.perm });
    const lena = (await api('adminA', 'post', `/lifecycle/ready-to-onboard/${b.rows[0].offerId}`).send(joinerBody('lena', day)).expect(201)).body;
    expect(lena).toMatchObject({ batchId: ids.jb, batchNote: null });
    expect((await inA((tx) => tx.preboarding.findFirstOrThrow({ where: { id: lena.id } }))).batchId).toBe(ids.jb);
    const mohan = (await api('adminA', 'post', `/lifecycle/ready-to-onboard/${b.rows[1].offerId}`).send(joinerBody('mohan', plus(41))).expect(201)).body;
    expect(mohan.batchId).toBeNull();
    expect(mohan.batchNote).toMatch(new RegExp(`Not added to the batch GET 2027 ${run}: it joins on ${day}`));
    await setting('hiring.bulk_offer.plan_check', null);
  });

  it('refused: an employee (403), another company (404), acting for someone else (403), bad input (400)', async () => {
    await api('emp', 'get', `/hiring/offer-batches/setup?jobId=${ids.job}`).expect(403);
    await api('emp', 'post', '/hiring/offer-batches').send(batch([['kavin', '480000']])).expect(403);
    await api('recB', 'get', `/hiring/offer-batches/${ids.batch}`).expect(404);
    await api('recB', 'get', `/hiring/offer-batches/setup?jobId=${ids.job}`).expect(404);
    await api('recB', 'post', '/hiring/offer-batches').send(batch([['kavin', '480000']])).expect(404);
    await api('recB', 'post', '/hiring/offer-batches').send(batch([['kavin', '480000']], { jobId: ids.jobB })).expect(404);

    await inA((tx) => tx.orgRolePermission.create({ data: { organizationId: org.A.id, role: 'recruiter', permissionsJson: JSON.stringify(['ats.offer.manage', 'pipeline:manage', 'ats.offer.compensation.view', 'ats.job.manage', 'ats.candidate.manage']) } }));
    token.acting = (await request(server()).post(`/api/v1/auth/impersonate/${users.actee}`).set('Authorization', `Bearer ${token.adminA}`).expect(200)).body.accessToken;
    expect((await api('acting', 'post', '/hiring/offer-batches').send(batch([['kavin', '480000']])).expect(403)).body.message).toMatch(/acting for someone else/);
    await api('acting', 'get', `/hiring/offer-batches/${ids.batch}`).expect(200);

    await api('rec', 'post', '/hiring/offer-batches').send(batch([])).expect(400);
    await api('rec', 'post', '/hiring/offer-batches').send(batch([['kavin', '480000'], ['kavin', '490000']])).expect(400);
    await api('rec', 'post', '/hiring/offer-batches').send(batch([['kavin', 'lots']])).expect(400);
    await api('rec', 'post', '/hiring/offer-batches').send(batch([['kavin', '480000']], { startDate: plus(-1) })).expect(400);
    await api('rec', 'post', '/hiring/offer-batches').send(batch([['kavin', '480000']], { batchKey: 'not-a-key' })).expect(400);
    await api('rec', 'post', '/hiring/offer-batches').send({ ...batch([]), rows: Array.from({ length: 101 }, () => ({ entryId: randomUUID(), annualCtc: '480000' })) }).expect(400);
    // An application of another job is not on this job: nothing is made.
    await api('rec', 'post', '/hiring/offer-batches').send(batch([['kavin', '480000'], ['elsewhere', '480000']])).expect(404);
    expect(await inA((tx) => tx.offer.count({ where: { pipelineEntryId: ids.kavin } }))).toBe(0);
    await api('rec', 'get', '/hiring/offer-batches/not-a-uuid').expect(400);
  });
});
