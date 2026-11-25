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
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Staffing desk slice 2 end to end (HIR-16 submissions, HIR-17 placements and bench, HIR-21 vendors on the existing
// agency model): client jobs point at a client and a rate-card line; people go to a client contact by email; a selected
// submission becomes a placement (own payroll or vendor supplied) with its margin shown only to account managers; the
// bench holds people between placements; vendors get a rate cap, quote with right to represent and consent, and the
// first vendor holds a candidate for the ownership window. Another company gets 404, acting for someone 403.

jest.setTimeout(240_000);

describe('Staffing desk slice 2', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const send = jest.fn(async (_m: { to: string; subject: string; html: string }) => ({ success: true }));
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'am' | 'rec' | 'vm' | 'pr' | 'emp' | 'adminB' | 'acting';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'delete' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const portal = (t: string, method: 'get' | 'post', path = '') => request(server())[method](`/api/v1/public/agency-portal/${t}${path}`);
  type Tx = Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0];
  const inA = <T>(fn: (tx: Tx) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const inB = <T>(fn: (tx: Tx) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const day = (s: string) => new Date(`${s}T00:00:00Z`);
  const settings = (who: Who, changes: { key: string; value: string }[]) => api(who, 'put', '/staffing/settings').send({ changes });
  const pdf = Buffer.from('%PDF-1.7 resume').toString('base64');
  const cv = (email: string, over: Record<string, unknown> = {}) => ({ jobId: ids.job, name: email.split('@')[0], email, resumeBase64: pdf, quotedRate: '850', rightToRepresent: true, consent: true, ...over });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send }).overrideProvider(BlobStorageService).useValue(createFakeBlobStorage()).compile();
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

    planId = (await prisma.plan.create({ data: { name: `staff2-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `STAFF2 Org ${k}`, slug: `staff2-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['admin', 'A', 'org_admin', null],
      ['am', 'A', 'panel', ['ats.staffing.manage', 'ats.staffing.view', 'pipeline:manage']],
      ['rec', 'A', 'panel', ['ats.staffing.view']],
      ['vm', 'A', 'panel', ['ats.agency.manage']],
      ['pr', 'A', 'panel', ['pipeline:manage']],
      ['emp', 'A', 'panel', []],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Tx) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@staff2-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@staff2-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.am}`).expect(200)).body.accessToken;
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Staffing Pvt Ltd', shortName: `KS2-${run}`, isDefault: true } })).id;
      for (const [k, given, family, exited] of [['arun', 'Arun', 'Kumar', null], ['bhavna', 'Bhavna', 'Rao', null], ['chitra', 'Chitra', 'Iyer', '2026-06-30']] as const) {
        const person = await tx.person.create({ data: { ...x, givenName: given, familyName: family } });
        ids[k] = (await tx.employee.create({ data: { ...x, personId: person.id, givenName: given, familyName: family } })).id;
        await tx.employment.create({ data: { ...x, employeeId: ids[k]!, legalEntityId: ids.entity, employeeCode: `${k}-${run}`, codeScopeKey: ids.entity, joinedOn: day('2025-04-01'), exitedOn: exited ? day(exited) : null } });
      }
    });
    // Both companies run the desk; A has a client, a contact and a rate-card line.
    await settings('am', [{ key: 'staffing.desk.enabled', value: 'on' }]).expect(want(200));
    await settings('adminB', [{ key: 'staffing.desk.enabled', value: 'on' }]).expect(want(200));
    ids.client = (await api('am', 'post', '/staffing/clients').send({ name: `Nilgiri Retail ${run}`, legalName: 'Nilgiri Retail Pvt Ltd', state: 'IN-TN', billingAddress: '14 Anna Salai, Chennai', status: 'active', contractStart: '2026-04-01', contractEnd: '2027-03-31', noticeDays: 30, slaFirstSubmissionDays: 3, slaFeedbackDays: 2 }).expect(want(201))).body.id;
    ids.contact = (await api('am', 'post', `/staffing/clients/${ids.client}/contacts`).send({ name: 'Meera Pillai', role: 'HR head', email: `meera-${run}@nilgiri.test`, billing: true }).expect(want(201))).body.id;
    ids.client2 = (await api('am', 'post', '/staffing/clients').send({ name: `Coromandel ${run}`, legalName: 'Coromandel Ltd', state: 'IN-KA', billingAddress: 'Bengaluru', status: 'active', contractStart: '2026-04-01', contractEnd: '2027-03-31', noticeDays: 30, slaFirstSubmissionDays: 3, slaFeedbackDays: 2 }).expect(want(201))).body.id;
    ids.contact2 = (await api('am', 'post', `/staffing/clients/${ids.client2}/contacts`).send({ name: 'Ravi', role: 'TA', email: `ravi-${run}@coromandel.test` }).expect(want(201))).body.id;
    await api('am', 'post', `/staffing/clients/${ids.client}/rates`).send({ role: 'Java Developer', skill: 'Java, Spring', location: 'Chennai', unit: 'hour', billRate: '1200', payRate: '800', validFrom: today }).expect(want(201));
    ids.line = (await inA((tx) => tx.staffingRate.findFirstOrThrow({ where: { clientId: ids.client } }))).lineId;
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users) as string[];
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('6.2: the slice-2 policies have defaults; bad values 400; only the settings holders change them', async () => {
    const s = (await api('am', 'get', '/staffing/settings').expect(200)).body;
    expect(s.values).toMatchObject({ 'staffing.vendor.target_margin_pct': '25', 'staffing.vendor.ownership_days': '90', 'staffing.submission.mask_contact': 'on', 'staffing.placement.ending_soon_days': '30', 'staffing.statutory_cost_pct': '0', 'staffing.bench.pay_pct': '50', 'staffing.bench.max_days': '30', 'staffing.bench.after': 'review' });
    for (const bad of [{ key: 'staffing.vendor.ownership_days', value: '45' }, { key: 'staffing.bench.after', value: 'fire' }, { key: 'staffing.vendor.target_margin_pct', value: '60' }]) await settings('am', [bad]).expect(400);
    await settings('rec', [{ key: 'staffing.bench.max_days', value: '60' }]).expect(403);
    await settings('acting', [{ key: 'staffing.bench.max_days', value: '60' }]).expect(403);
  });

  it('client jobs: an account manager opens one on a rate-card line; others refused; another company 404', async () => {
    await api('rec', 'post', `/staffing/clients/${ids.client}/jobs`).send({ lineId: ids.line }).expect(403);
    await api('acting', 'post', `/staffing/clients/${ids.client}/jobs`).send({ lineId: ids.line }).expect(403);
    await api('emp', 'post', `/staffing/clients/${ids.client}/jobs`).send({ lineId: ids.line }).expect(403);
    await api('adminB', 'post', `/staffing/clients/${ids.client}/jobs`).send({ lineId: ids.line }).expect(404);
    await api('am', 'post', `/staffing/clients/${ids.client2}/jobs`).send({ lineId: ids.line }).expect(400); // not this client's line
    await api('am', 'post', `/staffing/clients/${ids.client}/jobs`).send({ lineId: 'nope' }).expect(400);
    ids.job = (await api('am', 'post', `/staffing/clients/${ids.client}/jobs`).send({ lineId: ids.line, headcount: 2 }).expect(want(201))).body.id;
    const jobs = (await api('rec', 'get', '/staffing/jobs').expect(200)).body;
    expect(jobs).toEqual([expect.objectContaining({ id: ids.job, title: 'Java Developer', client: `Nilgiri Retail ${run}`, billRate: '1200.00', unit: 'hour' })]);
    expect((await api('adminB', 'get', '/staffing/jobs').expect(200)).body).toEqual([]);
  });

  it('bench: account managers add people between placements; the policy shows days left; others refused', async () => {
    const add = (who: Who, b: Record<string, unknown>) => api(who, 'post', '/staffing/bench').send({ employeeId: ids.arun, sinceOn: addDays(today, -35), ...b });
    await add('rec', {}).expect(403);
    await add('acting', {}).expect(403);
    await add('adminB', {}).expect(400); // not an employee of that company
    await add('am', { employeeId: ids.chitra }).expect(400); // exited
    await add('am', { sinceOn: '01-11-2026' }).expect(400);
    ids.benchArun = (await add('am', { note: 'Back from Globex' }).expect(want(201))).body.id;
    await add('am', {}).expect(409);
    expect((await api('am', 'get', '/staffing/bench/candidates').expect(200)).body.map((x: { label: string }) => x.label)).toEqual(['Bhavna Rao']);
    await api('rec', 'get', '/staffing/bench/candidates').expect(403);
    const b = (await api('rec', 'get', '/staffing/bench').expect(200)).body;
    expect(b.canManage).toBe(false);
    expect(b.policy).toEqual({ maxDays: 30, payPct: 50, after: 'review' });
    expect(b.rows).toEqual([expect.objectContaining({ id: ids.benchArun, person: 'Arun Kumar', days: 35, left: -5, overPolicy: true, note: 'Back from Globex' })]);
    await api('emp', 'get', '/staffing/bench').expect(403);
    expect((await api('adminB', 'get', '/staffing/bench').expect(200)).body.rows).toEqual([]);
    await api('adminB', 'delete', `/staffing/bench/${ids.benchArun}`).expect(404);
  });

  it('submissions: bench and pipeline people go to a client contact; one email, masked; never twice; bad input 400', async () => {
    await inA(async (tx) => {
      ids.cand = (await tx.candidate.create({ data: { organizationId: org.A.id, email: `dev-${run}@mail.test`, name: 'Deepa Nair', phone: '+91 98450 00000' } })).id;
      await tx.pipelineEntry.create({ data: { organizationId: org.A.id, jobId: ids.job, candidateId: ids.cand, enteredVia: 'manual', applicationToken: randomUUID() } });
    });
    const opt = (await api('rec', 'get', `/staffing/submissions/options?jobId=${ids.job}`).expect(want(200))).body;
    expect(opt).toMatchObject({ billRate: '1200.00', unit: 'hour', mask: true, contacts: [{ id: ids.contact, name: 'Meera Pillai', role: 'HR head' }] });
    expect(opt.people.map((p: { kind: string; name: string }) => [p.kind, p.name])).toEqual([['employee', 'Arun Kumar'], ['candidate', 'Deepa Nair']]);
    await api('adminB', 'get', `/staffing/submissions/options?jobId=${ids.job}`).expect(404);
    const body = { jobId: ids.job, people: [{ kind: 'employee', id: ids.arun }, { kind: 'candidate', id: ids.cand }, { kind: 'employee', id: ids.chitra }], contactId: ids.contact, billRate: '1200', masked: true };
    await api('emp', 'post', '/staffing/submissions').send(body).expect(403);
    await api('acting', 'post', '/staffing/submissions').send(body).expect(403);
    await api('adminB', 'post', '/staffing/submissions').send(body).expect(404);
    for (const b of [{ billRate: '12.345' }, { billRate: 1200 }, { people: [] }, { contactId: ids.contact2 }, { masked: 'yes' }]) await api('rec', 'post', '/staffing/submissions').send({ ...body, ...b }).expect(400);
    send.mockClear();
    const r = (await api('rec', 'post', '/staffing/submissions').send(body).expect(want(201))).body;
    expect(r.emailed).toBe(true);
    expect(r.rows.map((x: { name?: string; result: string }) => [x.name ?? null, x.result])).toEqual([['Arun Kumar', 'submitted'], ['Deepa Nair', 'submitted'], ['Chitra Iyer', 'not_found']]);
    ids.subArun = r.rows[0].submissionId;
    ids.subDeepa = r.rows[1].submissionId;
    expect(send).toHaveBeenCalledTimes(1);
    const mail = send.mock.calls[0]![0];
    expect(mail.to).toBe(`meera-${run}@nilgiri.test`);
    expect(mail.html).toContain('Deepa Nair');
    expect(mail.html).not.toContain(`dev-${run}@mail.test`); // masked: no contact details
    expect(mail.html).not.toContain('98450');
    const again = (await api('rec', 'post', '/staffing/submissions').send({ ...body, people: [{ kind: 'employee', id: ids.arun }] }).expect(want(201))).body;
    expect(again).toMatchObject({ emailed: false, rows: [expect.objectContaining({ result: 'already', submissionId: ids.subArun })] });
    const board = (await api('rec', 'get', '/staffing/submissions').expect(200)).body;
    expect(board.map((x: { person: string; source: string; stage: string; slaDays: number; emailed: boolean }) => [x.person, x.source, x.stage, x.slaDays, x.emailed]).sort()).toEqual([['Arun Kumar', 'Bench', 'submitted', 2, true], ['Deepa Nair', 'Pipeline', 'submitted', 2, true]]);
    expect(JSON.stringify(board)).not.toMatch(/800/); // never a pay rate on the board
    expect((await api('adminB', 'get', '/staffing/submissions').expect(200)).body).toEqual([]);
  });

  it('the board moves: a rejection needs a reason; another company 404; a placed card cannot go back', async () => {
    const move = (who: Who, id: string, b: Record<string, unknown>) => api(who, 'post', `/staffing/submissions/${id}/move`).send(b);
    await move('rec', ids.subDeepa, { stage: 'rejected' }).expect(400);
    await move('rec', ids.subDeepa, { stage: 'hired' }).expect(400);
    await move('adminB', ids.subDeepa, { stage: 'client_review' }).expect(404);
    await move('acting', ids.subDeepa, { stage: 'client_review' }).expect(403);
    await move('rec', ids.subDeepa, { stage: 'rejected', reason: 'Needs more Spring Boot' }).expect(want(201));
    for (const stage of ['client_review', 'interview', 'selected']) await move('rec', ids.subArun, { stage, feedback: 'Strong' }).expect(want(201));
    const board = (await api('am', 'get', '/staffing/submissions').expect(200)).body;
    expect(board.find((x: { id: string }) => x.id === ids.subDeepa)).toMatchObject({ stage: 'rejected', rejectedReason: 'Needs more Spring Boot' });
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'staffing.submission.moved' } }))).toBe(4);
  });

  it('placements: from a selected submission, once; pay and margin for account managers only; the bench closes and reopens', async () => {
    expect((await api('am', 'get', '/staffing/placements/placeable').expect(200)).body).toEqual([expect.objectContaining({ id: ids.subArun, person: 'Arun Kumar', source: 'employee' })]);
    await api('rec', 'get', '/staffing/placements/placeable').expect(403);
    const p = { submissionId: ids.subArun, startOn: today, endOn: addDays(today, 20) };
    await api('rec', 'post', '/staffing/placements').send(p).expect(403);
    await api('acting', 'post', '/staffing/placements').send(p).expect(403);
    await api('adminB', 'post', '/staffing/placements').send(p).expect(404);
    await api('am', 'post', '/staffing/placements').send({ ...p, endOn: addDays(today, -1) }).expect(400);
    await api('am', 'post', '/staffing/placements').send({ ...p, startOn: addDays(today, -5) }).expect(400); // no rate on that day
    await api('am', 'post', '/staffing/placements').send({ ...p, submissionId: ids.subDeepa }).expect(409); // rejected
    await api('rec', 'post', `/staffing/submissions/${ids.subDeepa}/move`).send({ stage: 'selected' }).expect(want(201));
    expect((await api('am', 'post', '/staffing/placements').send({ ...p, submissionId: ids.subDeepa }).expect(400)).body.message).toMatch(/joins as an employee first/);
    ids.placement = (await api('am', 'post', '/staffing/placements').send(p).expect(want(201))).body.id;
    await api('am', 'post', '/staffing/placements').send(p).expect(409);
    await api('rec', 'post', `/staffing/submissions/${ids.subArun}/move`).send({ stage: 'interview' }).expect(409);
    // Off the bench the day before the start.
    expect((await inA((tx) => tx.staffingBench.findUniqueOrThrow({ where: { id: ids.benchArun } }))).untilOn!.toISOString().slice(0, 10)).toBe(addDays(today, -1));
    expect((await api('am', 'get', '/staffing/bench').expect(200)).body.rows).toEqual([]);
    const am = (await api('am', 'get', `/staffing/placements/${ids.placement}`).expect(200)).body;
    expect(am).toMatchObject({ canManage: true, showPay: true, placement: { person: 'Arun Kumar', role: 'Java Developer', client: `Nilgiri Retail ${run}`, supply: 'own', status: 'ending_soon', billRate: '1200.00', costRate: '800.00', statutory: '0.00', margin: '400.00', marginPct: '33.3', version: 1 } });
    await settings('am', [{ key: 'staffing.statutory_cost_pct', value: '10' }]).expect(want(200));
    expect((await api('am', 'get', '/staffing/placements').expect(200)).body.rows[0]).toMatchObject({ statutory: '80.00', margin: '320.00', marginPct: '26.7' });
    const rec = (await api('rec', 'get', '/staffing/placements').expect(200)).body;
    expect(rec).toMatchObject({ canManage: false, showPay: false });
    for (const k of ['costRate', 'statutory', 'margin', 'marginPct']) expect(rec.rows[0]).not.toHaveProperty(k);
    expect(JSON.stringify(rec)).not.toMatch(/800\.00|320\.00/);
    await api('adminB', 'get', `/staffing/placements/${ids.placement}`).expect(404);
    expect((await api('adminB', 'get', '/staffing/placements').expect(200)).body.rows).toEqual([]);
  });

  it('extend and end early: versions, reasons and dates checked; ending moves the person to the bench', async () => {
    const ext = (who: Who, b: Record<string, unknown>) => api(who, 'post', `/staffing/placements/${ids.placement}/extend`).send({ endOn: addDays(today, 90), reason: 'Client extended the SOW', version: 1, ...b });
    await ext('rec', {}).expect(403);
    await ext('acting', {}).expect(403);
    await ext('adminB', {}).expect(404);
    await ext('am', { endOn: addDays(today, 10) }).expect(400);
    await ext('am', { reason: '' }).expect(400);
    await ext('am', {}).expect(want(201));
    await ext('am', { endOn: addDays(today, 120) }).expect(409); // stale version
    expect((await api('am', 'get', `/staffing/placements/${ids.placement}`).expect(200)).body.placement).toMatchObject({ endOn: addDays(today, 90), status: 'active', version: 2 });
    const end = (who: Who, b: Record<string, unknown>) => api(who, 'post', `/staffing/placements/${ids.placement}/end`).send({ endOn: today, reason: 'client', note: 'Project paused', version: 2, ...b });
    await end('rec', {}).expect(403);
    await end('am', { reason: 'bored' }).expect(400);
    await end('am', { endOn: addDays(today, 91) }).expect(400);
    await end('am', { version: 1 }).expect(409);
    await end('am', {}).expect(want(201));
    await end('am', {}).expect(409);
    await ext('am', { version: 3 }).expect(409);
    expect((await api('am', 'get', `/staffing/placements/${ids.placement}`).expect(200)).body.placement).toMatchObject({ status: 'ended', endedReason: 'client', endOn: today });
    const bench = (await api('am', 'get', '/staffing/bench').expect(200)).body.rows;
    expect(bench).toEqual([expect.objectContaining({ person: 'Arun Kumar', sinceOn: addDays(today, 1), lastClient: `Nilgiri Retail ${run}` })]);
    await api('am', 'delete', `/staffing/bench/${bench[0].id}`).expect(want(200));
    await api('am', 'delete', `/staffing/bench/${bench[0].id}`).expect(404);
  });

  it('vendors: the existing agencies with documents; only complete vendors get a client job; works without desk keys', async () => {
    const v = (over: Record<string, unknown> = {}) => ({ name: `Velocity Talent ${run}`, contactEmail: 'ops@velocity.test', pan: 'ABCDE1234F', tdsSection: '194C', tier: 'preferred', agreementSignedOn: '2026-04-01', bankVerified: true, ...over });
    await api('emp', 'post', '/staffing/vendors').send(v()).expect(403);
    await api('rec', 'post', '/staffing/vendors').send(v()).expect(403);
    await api('acting', 'post', '/staffing/vendors').send(v()).expect(403);
    for (const b of [{ pan: 'abcde1234f' }, { tdsSection: '194Q' }, { tier: 'gold' }, { gstin: '29ZZZZZ9999Z1Z5' }, { name: '' }]) await api('vm', 'post', '/staffing/vendors').send(v(b)).expect(400);
    ids.v1 = (await api('vm', 'post', '/staffing/vendors').send(v()).expect(want(201))).body.id;
    await api('vm', 'post', '/staffing/vendors').send(v()).expect(409);
    ids.v2 = (await api('vm', 'post', '/staffing/vendors').send({ name: `Half Done ${run}` }).expect(want(201))).body.id;
    ids.v3 = (await api('vm', 'post', '/staffing/vendors').send(v({ name: `Second Source ${run}`, tier: 'standard', tdsSection: '194J' })).expect(want(201))).body.id;
    const reg = (await api('vm', 'get', '/staffing/vendors').expect(200)).body;
    expect(reg.find((x: { id: string }) => x.id === ids.v1)).toMatchObject({ status: 'active', missing: [], bankVerified: true, tier: 'preferred' });
    expect(reg.find((x: { id: string }) => x.id === ids.v2)).toMatchObject({ status: 'pending', missing: ['signed agreement', 'PAN', 'verified bank account', 'TDS section'] });
    expect((await api('adminB', 'get', '/staffing/vendors').expect(200)).body).toEqual([]);
    await api('adminB', 'put', `/staffing/vendors/${ids.v1}`).send(v()).expect(404);
    // The same rows the older agency pages use: there is one vendor model.
    expect(await inA((tx) => tx.agency.count({ where: { organizationId: org.A.id } }))).toBe(3);
  });

  it('sharing a client job: a rate cap kept under the bill rate (suggested from the target margin), complete vendors only', async () => {
    const opts = (await api('vm', 'get', `/staffing/vendors/share-options?jobId=${ids.job}`).expect(200)).body;
    expect(opts).toMatchObject({ client: `Nilgiri Retail ${run}`, billRate: '1200.00', targetMarginPct: 25, suggestedCap: '900.00', sharedWith: [] });
    await api('adminB', 'get', `/staffing/vendors/share-options?jobId=${ids.job}`).expect(404);
    const s = (who: Who, b: Record<string, unknown>) => api(who, 'post', '/staffing/vendors/share').send({ jobId: ids.job, agencyIds: [ids.v1, ids.v3], rateCap: '900', maxSubmissions: 2, expiresOn: addDays(today, 30), maskClient: true, ...b });
    await s('rec', {}).expect(403);
    await s('acting', {}).expect(403);
    await s('adminB', {}).expect(404);
    await s('vm', { agencyIds: [ids.v2] }).expect(400); // documents missing
    await s('vm', { rateCap: null }).expect(400);
    await s('vm', { rateCap: '1300' }).expect(400);
    await s('vm', { expiresOn: addDays(today, -1) }).expect(400);
    await s('vm', { maxSubmissions: 0 }).expect(400);
    await s('vm', {}).expect(want(201));
  });

  it('the vendor portal: cap shown, client hidden, quote with right to represent and consent, limit per vendor, first vendor holds the candidate', async () => {
    const t1 = (await inA((tx) => tx.agency.findUniqueOrThrow({ where: { id: ids.v1 } }))).portalToken;
    const t3 = (await inA((tx) => tx.agency.findUniqueOrThrow({ where: { id: ids.v3 } }))).portalToken;
    const page = (await portal(t1, 'get').expect(200)).body;
    expect(page.jobs).toEqual([expect.objectContaining({ id: ids.job, client: null, rateCap: '900.00', maxSubmissions: 2, expiresOn: addDays(today, 30) })]);
    expect(JSON.stringify(page)).not.toMatch(/1200|Nilgiri/); // never the bill rate or a hidden client
    await portal(t1, 'post', '/submissions').send(cv(`one-${run}@mail.test`, { quotedRate: undefined })).expect(400);
    await portal(t1, 'post', '/submissions').send(cv(`one-${run}@mail.test`, { consent: false })).expect(400);
    await portal(t1, 'post', '/submissions').send(cv(`one-${run}@mail.test`, { quotedRate: '9.999' })).expect(400);
    await portal(t1, 'post', '/submissions').send(cv(`one-${run}@mail.test`, { quotedRate: '950' })).expect(want(201)); // over the cap: kept for review
    await portal(t1, 'post', '/submissions').send(cv(`one-${run}@mail.test`)).expect(400); // the same person twice
    await portal(t1, 'post', '/submissions').send(cv(`two-${run}@mail.test`)).expect(want(201));
    expect((await portal(t1, 'post', '/submissions').send(cv(`three-${run}@mail.test`)).expect(400)).body.message).toMatch(/most submissions allowed/);
    await portal(t3, 'post', '/submissions').send(cv(`ONE-${run}@mail.test`, { quotedRate: '800' })).expect(want(201)); // V1 holds this person
    const p3 = (await portal(t3, 'get').expect(200)).body;
    expect(p3.submissions).toEqual([expect.objectContaining({ status: 'duplicate' })]);
    expect(JSON.stringify(p3)).not.toContain('Velocity');
  });

  it('vendor submissions: over cap and duplicate states; recruiters never see quotes; exception then forward to the client', async () => {
    const vm = (await api('vm', 'get', '/staffing/vendor-submissions').expect(200)).body;
    const over = vm.find((x: { candidate: string }) => x.candidate === `one-${run}`);
    expect(over).toMatchObject({ vendor: `Velocity Talent ${run}`, quoted: '950.00', cap: '900.00', overBy: '50.00', overCap: true, duplicate: null, rightToRepresent: true, consent: true, clientJob: true, status: 'pending' });
    const dup = vm.find((x: { vendor: string }) => x.vendor === `Second Source ${run}`);
    expect(dup.duplicate).toMatchObject({ holder: `Velocity Talent ${run}` });
    expect(dup.duplicate.until).toBe(addDays(today, 90));
    const pr = (await api('pr', 'get', '/staffing/vendor-submissions').expect(200)).body;
    for (const r of pr) expect([r.quoted, r.cap, r.overBy]).toEqual([null, null, null]);
    expect(pr.find((x: { candidate: string }) => x.candidate === `one-${run}`).overCap).toBe(true);
    await api('emp', 'get', '/staffing/vendor-submissions').expect(403);
    expect((await api('adminB', 'get', '/staffing/vendor-submissions').expect(200)).body).toEqual([]);

    const fwd = (who: Who, id: string) => api(who, 'post', `/staffing/vendor-submissions/${id}/forward`).send({ contactId: ids.contact });
    await fwd('am', over.id).expect(409); // over the cap without an exception
    await fwd('am', dup.id).expect(409); // duplicate
    // Answer 489: an account manager overrides the duplicate with a reason (audited); then it can be forwarded.
    const ov = (who: Who, id: string, reason = 'The first vendor withdrew the candidate') => api(who, 'post', `/staffing/vendor-submissions/${id}/override`).send({ reason });
    await ov('vm', dup.id).expect(403);
    await ov('acting', dup.id).expect(403);
    await ov('adminB', dup.id).expect(404);
    await ov('am', dup.id, '').expect(400);
    await ov('am', vm.find((x: { candidate: string }) => x.candidate === `two-${run}`).id).expect(409); // not a duplicate
    await ov('am', dup.id).expect(want(201));
    await ov('am', dup.id).expect(409);
    expect((await api('am', 'get', '/staffing/vendor-submissions').expect(200)).body.find((x: { id: string }) => x.id === dup.id).override).toMatchObject({ reason: 'The first vendor withdrew the candidate' });
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'staffing.vendor.duplicate_overridden', entityId: dup.id } }))).toBe(1);
    ids.vendorSub = (await fwd('am', dup.id).expect(want(201))).body.submissionId; // overridden duplicate: forwarded
    await fwd('vm', over.id).expect(403); // forwarding to a client is the account manager's
    await fwd('acting', over.id).expect(403);
    await fwd('adminB', over.id).expect(404);
    await api('pr', 'post', `/staffing/vendor-submissions/${over.id}/exception`).send({ reason: 'Rare skill' }).expect(403);
    await api('vm', 'post', `/staffing/vendor-submissions/${over.id}/exception`).send({ reason: '' }).expect(400);
    const within = vm.find((x: { candidate: string }) => x.candidate === `two-${run}`);
    await api('vm', 'post', `/staffing/vendor-submissions/${within.id}/exception`).send({ reason: 'Not needed' }).expect(409);
    await api('vm', 'post', `/staffing/vendor-submissions/${over.id}/exception`).send({ reason: 'Rare skill; client agreed' }).expect(want(201));
    await api('vm', 'post', `/staffing/vendor-submissions/${over.id}/exception`).send({ reason: 'Again' }).expect(409);
    await api('am', 'post', `/staffing/vendor-submissions/${over.id}/forward`).send({ contactId: ids.contact2 }).expect(400); // another client's contact
    await fwd('am', over.id).expect(409); // the same person is already submitted to this client job
    const board = (await api('rec', 'get', '/staffing/submissions').expect(200)).body;
    expect(board.find((x: { id: string }) => x.id === ids.vendorSub)).toMatchObject({ person: `ONE-${run}`, source: `Vendor: Second Source ${run}`, stage: 'submitted' });
    // Recruiters never see a vendor's quote: no quote field, and no field holding the quoted 950 (checked per field, so a
    // random id that happens to contain "950" never fails it).
    for (const row of board as Record<string, unknown>[]) {
      expect(Object.keys(row).filter((k) => /quote|vendorRate|cap|overBy/i.test(k))).toEqual([]);
      expect(Object.values(row).filter((v) => v === 950 || v === '950' || v === '950.00')).toEqual([]);
    }
  });

  it('a vendor-supplied placement costs the vendor quote; no bench for a vendor worker', async () => {
    await api('rec', 'post', `/staffing/submissions/${ids.vendorSub}/move`).send({ stage: 'selected' }).expect(want(201));
    const id = (await api('am', 'post', '/staffing/placements').send({ submissionId: ids.vendorSub, startOn: today, endOn: addDays(today, 180) }).expect(want(201))).body.id;
    const p = (await api('am', 'get', `/staffing/placements/${id}`).expect(200)).body.placement;
    expect(p).toMatchObject({ supply: 'vendor', vendor: `Second Source ${run}`, costRate: '800.00', statutory: '0.00', margin: '400.00', marginPct: '33.3', status: 'active' });
    await api('am', 'post', `/staffing/placements/${id}/end`).send({ endOn: today, reason: 'performance', version: 1 }).expect(want(201));
    expect((await api('am', 'get', '/staffing/bench').expect(200)).body.rows).toEqual([]);
    expect((await api('vm', 'get', '/staffing/vendors').expect(200)).body.find((x: { id: string }) => x.id === ids.v3)).toMatchObject({ submissions: 1, placements: 1, sharedJobs: 1 });
  });

  it('one vendor model: the older agency routes cannot bypass the client-job terms; link and sharing managed here', async () => {
    await api('admin', 'patch', `/agencies/${ids.v2}`).send({ jobIds: [ids.job] }).expect(400);
    const dupId = (await api('vm', 'get', '/staffing/vendor-submissions').expect(200)).body.find((x: { vendor: string }) => x.vendor === `Second Source ${run}`).id;
    await api('am', 'post', `/agency-submissions/${dupId}/accept`).expect(409);
    const before = (await inA((tx) => tx.agency.findUniqueOrThrow({ where: { id: ids.v3 } }))).portalToken;
    await api('rec', 'post', `/staffing/vendors/${ids.v3}/new-link`).expect(403);
    await api('acting', 'post', `/staffing/vendors/${ids.v3}/new-link`).expect(403);
    await api('adminB', 'post', `/staffing/vendors/${ids.v3}/new-link`).expect(404);
    const after = (await api('vm', 'post', `/staffing/vendors/${ids.v3}/new-link`).expect(want(201))).body.portalToken;
    expect(after).not.toBe(before);
    await portal(before, 'get').expect(404);
    expect((await api('vm', 'get', '/staffing/vendors').expect(200)).body.find((x: { id: string }) => x.id === ids.v3)).toMatchObject({ portalToken: after, jobs: [expect.objectContaining({ id: ids.job, title: 'Java Developer' })] });
    await api('adminB', 'delete', `/staffing/vendors/${ids.v3}/jobs/${ids.job}`).expect(404);
    await api('vm', 'delete', `/staffing/vendors/${ids.v3}/jobs/${ids.job}`).expect(want(200));
    await api('vm', 'delete', `/staffing/vendors/${ids.v3}/jobs/${ids.job}`).expect(404);
    expect((await portal(after, 'get').expect(200)).body.jobs).toEqual([]);
  });

  it('row-level security: company B sees none of the new rows even querying the tables directly', async () => {
    const counts = await inB(async (tx) => [await tx.staffingSubmission.count(), await tx.staffingPlacement.count(), await tx.staffingBench.count()]);
    expect(counts).toEqual([0, 0, 0]);
    const inAcounts = await inA(async (tx) => [await tx.staffingSubmission.count(), await tx.staffingPlacement.count(), await tx.staffingBench.count()]);
    expect(inAcounts.every((n) => n > 0)).toBe(true);
  });

  it('turning the desk off closes the desk pages; vendors stay for ordinary recruitment', async () => {
    await settings('am', [{ key: 'staffing.desk.enabled', value: 'off' }]).expect(want(200));
    for (const path of ['/staffing/submissions', '/staffing/placements', '/staffing/bench', '/staffing/jobs']) await api('am', 'get', path).expect(403);
    await api('vm', 'get', '/staffing/vendors').expect(200);
    await api('vm', 'get', '/staffing/vendor-submissions').expect(200);
  });
});
