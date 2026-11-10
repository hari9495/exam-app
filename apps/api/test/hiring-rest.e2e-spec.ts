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
import { CampaignsService } from '../src/talent-crm/campaigns.service';
import { CrmConsentsService } from '../src/talent-crm/consents.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// The rest of Hire (10 Nov 2026): HIR-20 campaigns (consent-based audience, the sweep inside the send window, each step
// once, stop on unsubscribe and reply, every send audited), HIR-20 sourced profiles pending consent (consent email,
// not a candidate until they agree, erased on refusal or after the company limit) and HIR-05 under 18 (sealed date of
// birth, guardian consent email, no move past screening and no offer until the guardian consents). Another company is
// 404; acting for someone else is 403; without the key 403; bad input 400.

jest.setTimeout(180_000);

describe('Hiring rest: campaigns, sourced profiles, under 18', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let campaigns: CampaignsService;
  let consents: CrmConsentsService;
  const sent: { to: string; subject: string; html: string }[] = [];
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'rec' | 'viewer' | 'emp' | 'adminB' | 'acting';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const pub = (method: 'get' | 'post', path: string) => request(server())[method](`/api/v1/public${path}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const setSetting = (key: string, value: string) =>
    inA(async (tx) => {
      const where = { organizationId: org.A.id, key, scopeType: 'tenant', scopeId: org.A.id };
      const found = await tx.setting.findFirst({ where });
      return found ? tx.setting.update({ where: { id: found.id }, data: { value } }) : tx.setting.create({ data: { ...where, value } });
    });
  const candidate = (name: string, extra: Record<string, unknown> = {}) =>
    inA(async (tx) => (await tx.candidate.create({ data: { organizationId: org.A.id, name, email: `${name.toLowerCase().replace(/\W+/g, '.')}-${run}@x.test`, ...extra } })).id);
  const consent = (candidateId: string) => inA((tx) => tx.candidateConsent.create({ data: { organizationId: org.A.id, candidateId, noticeId: ids.notice, purpose: 'talent_pool', version: 1, source: 'apply' } }));
  const linkIn = (html: string, kind: string) => new RegExp(`/consent/${kind}/([0-9a-f]{64})`).exec(html)?.[1] ?? '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn(async (m: { to: string; subject: string; html: string }) => (sent.push(m), { success: true })) })
      .overrideProvider(BlobStorageService)
      .useValue(createFakeBlobStorage())
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    campaigns = moduleRef.get(CampaignsService);
    consents = moduleRef.get(CrmConsentsService);
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `rest-plan-${run}`, candidateLimit: 100, aiCreditLimit: 10, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `REST Org ${k}`, slug: `rest-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['admin', 'A', 'org_admin', null],
      ['rec', 'A', 'panel', ['ats.job.manage', 'ats.candidate.manage']],
      ['viewer', 'A', 'panel', ['ats.candidate.view']],
      ['emp', 'A', 'panel', []],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@rest-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@rest-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    // Acting for the recruiter: only the acting rule can refuse.
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.rec}`).expect(200)).body.accessToken;

    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.notice = (await tx.consentNotice.create({ data: { ...o, purpose: 'talent_pool', version: 1, text: 'We keep your details for 12 months to tell you about other jobs.' } })).id;
      ids.tplA = (await tx.candidateEmailTemplate.create({ data: { ...o, name: 'Hello again', triggerMode: 'manual', subject: 'Hello {{candidateName}}', body: 'New roles at {{orgName}}.' } })).id;
      ids.tplA2 = (await tx.candidateEmailTemplate.create({ data: { ...o, name: 'Applications open', triggerMode: 'manual', subject: 'Apply now', body: 'Applications are open.' } })).id;
      ids.pool = (await tx.talentPool.create({ data: { ...o, name: 'QA silver medallists', kind: 'pool' } })).id;
    });
    ids.tplB = (await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.candidateEmailTemplate.create({ data: { organizationId: org.B.id, name: 'B only', triggerMode: 'manual', subject: 's', body: 'b' } }))).id;
    ids.ok = await candidate('Priya Raman');
    ids.unsub = await candidate('Thomas Bhat', { emailOptedOutAt: new Date() });
    ids.nocon = await candidate('Sana Nizami');
    ids.kid = await candidate('Rohan Das');
    ids.aisha = await candidate('Aisha Khan');
    for (const c of [ids.ok, ids.unsub, ids.kid, ids.aisha]) await consent(c);
    await inA((tx) => tx.talentPoolMember.createMany({ data: [ids.ok, ids.unsub, ids.nocon, ids.kid, ids.aisha].map((candidateId) => ({ organizationId: org.A.id, poolId: ids.pool, candidateId })) }));
    await setSetting('hiring.crm.send_window', '00-24');
  });

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

  describe('HIR-05 under 18', () => {
    const st: Record<string, string> = {};
    const twelveYearsAgo = () => `${new Date().getUTCFullYear() - 12}-01-15`;
    beforeAll(async () => {
      ids.job = (await api('admin', 'post', '/jobs').send({ title: 'Trainee' }).expect(201)).body.id;
      ids.kidEntry = (await api('admin', 'post', `/jobs/${ids.job}/entries`).send({ candidateId: ids.kid }).expect(201)).body.id;
      const board = (await api('admin', 'get', `/hiring/jobs/${ids.job}/board`).expect(200)).body.pipeline.stages as { category: string; statuses: { id: string }[] }[];
      const active = board.filter((s) => s.category === 'active');
      st.first = active[0]!.statuses[0]!.id;
      st.second = active[1]!.statuses[0]!.id;
    });

    it('the age and the hold are data marked verify', async () => {
      const row = await tenantPrisma.forTenant(SUPER, (tx) => tx.statutoryRuleSet.findFirst({ where: { statute: 'HIR.MINOR' } }));
      expect(row).toMatchObject({ verify: true, values: expect.objectContaining({ minAge: 18, holdAfter: 'screening' }) });
    });

    it('refuses bad input (400), a minor without a guardian (400), another company (404), acting (403), no key (403)', async () => {
      await api('rec', 'put', `/hiring/candidates/${ids.kid}/date-of-birth`).send({ dob: '15/01/2014' }).expect(400);
      await api('rec', 'put', `/hiring/candidates/${ids.kid}/date-of-birth`).send({ dob: '2999-01-01' }).expect(400);
      const r = await api('rec', 'put', `/hiring/candidates/${ids.kid}/date-of-birth`).send({ dob: twelveYearsAgo() }).expect(400);
      expect(r.body.message).toMatch(/guardian/);
      await api('adminB', 'put', `/hiring/candidates/${ids.kid}/date-of-birth`).send({ dob: '1990-01-01' }).expect(404);
      await api('acting', 'put', `/hiring/candidates/${ids.kid}/date-of-birth`).send({ dob: '1990-01-01' }).expect(403);
      await api('viewer', 'put', `/hiring/candidates/${ids.kid}/date-of-birth`).send({ dob: '1990-01-01' }).expect(403);
      expect((await inA((tx) => tx.candidate.findUniqueOrThrow({ where: { id: ids.kid } }))).dobSealed).toBeNull();
    });

    it('records a minor: sealed date, guardian emailed, audited without the date', async () => {
      sent.length = 0;
      const dob = twelveYearsAgo();
      expect((await api('rec', 'put', `/hiring/candidates/${ids.kid}/date-of-birth`).send({ dob, guardianName: 'Sunita Das', guardianEmail: `sunita-${run}@x.test` }).expect(want(200))).body).toEqual({ minor: true, guardian: 'pending' });
      const c = await inA((tx) => tx.candidate.findUniqueOrThrow({ where: { id: ids.kid } }));
      expect(c.dobSealed).toBeTruthy();
      expect(c.dobSealed).not.toContain(dob);
      expect(sent).toHaveLength(1);
      expect(sent[0]!.to).toBe(`sunita-${run}@x.test`);
      ids.guardianToken = linkIn(sent[0]!.html, 'guardian');
      expect(ids.guardianToken).toHaveLength(64);
      const a = await inA((tx) => tx.auditLog.findFirstOrThrow({ where: { action: 'ats.candidate.dob_recorded', entityId: ids.kid } }));
      expect(String(a.metadataJson)).not.toContain(dob);
    });

    it('the record shows the hold; the date of birth only to candidate key holders', async () => {
      expect((await api('rec', 'get', `/hiring/candidates/${ids.kid}`).expect(200)).body.minor).toEqual({ dob: twelveYearsAgo(), guardian: 'pending', minAge: 18 });
      expect((await api('viewer', 'get', `/hiring/candidates/${ids.kid}`).expect(200)).body.minor).toEqual({ dob: null, guardian: 'pending', minAge: 18 });
      expect((await api('rec', 'get', `/hiring/candidates/${ids.ok}`).expect(200)).body.minor).toBeNull();
    });

    it('no move past screening and no offer until the guardian consents; screening moves are fine', async () => {
      const r = await api('rec', 'post', `/hiring/entries/${ids.kidEntry}/move`).send({ statusId: st.second, fromStatusId: st.first }).expect(409);
      expect(r.body.message).toMatch(/under 18.*guardian/);
      const plus = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
      const o = await api('rec', 'post', `/pipeline/entries/${ids.kidEntry}/offers`).send({ compensation: 'Rs 3 LPA', startDate: plus(30), expiresAt: plus(10) }).expect(409);
      expect(o.body.message).toMatch(/no offer/);
      // Resending too soon is refused; another company cannot.
      await api('rec', 'post', `/hiring/candidates/${ids.kid}/guardian-consent/resend`).expect(409);
      await api('adminB', 'post', `/hiring/candidates/${ids.kid}/guardian-consent/resend`).expect(404);
    });

    it('the guardian link: a bad token is 404; consent lifts the hold and the link is then used up', async () => {
      await pub('get', '/consent/guardian/not-a-token').expect(404);
      await pub('get', `/consent/guardian/${'0'.repeat(64)}`).expect(404);
      const page = (await pub('get', `/consent/guardian/${ids.guardianToken}`).expect(200)).body;
      expect(page).toMatchObject({ candidateName: 'Rohan Das', guardianName: 'Sunita Das' });
      expect(page).not.toHaveProperty('dob');
      await pub('post', `/consent/guardian/${ids.guardianToken}`).send({ agree: 'yes' }).expect(400);
      await pub('post', `/consent/guardian/${ids.guardianToken}`).send({ agree: true }).expect(200);
      await pub('post', `/consent/guardian/${ids.guardianToken}`).send({ agree: true }).expect(404);
      await api('rec', 'post', `/hiring/entries/${ids.kidEntry}/move`).send({ statusId: st.second, fromStatusId: st.first }).expect(want(200));
      expect((await api('rec', 'get', `/hiring/candidates/${ids.kid}`).expect(200)).body.minor.guardian).toBe('given');
    });

    it('an adult date of birth holds nothing', async () => {
      ids.adultEntry = (await api('admin', 'post', `/jobs/${ids.job}/entries`).send({ candidateId: ids.nocon }).expect(201)).body.id;
      expect((await api('rec', 'put', `/hiring/candidates/${ids.nocon}/date-of-birth`).send({ dob: '1995-06-01' }).expect(200)).body).toEqual({ minor: false, guardian: null });
      await api('rec', 'post', `/hiring/entries/${ids.adultEntry}/move`).send({ statusId: st.second, fromStatusId: st.first }).expect(want(200));
    });
  });

  describe('HIR-20 campaigns', () => {
    it('reading needs the candidate manage key; the company settings show', async () => {
      await api('emp', 'get', '/hiring/campaigns').expect(403);
      await api('viewer', 'get', '/hiring/campaigns').expect(403);
      const v = (await api('rec', 'get', '/hiring/campaigns').expect(200)).body;
      expect(v).toMatchObject({ campaigns: [], whatsappConnected: false, window: '00-24', dailyCap: 200 });
      expect(v.templates.email.map((t: { name: string }) => t.name)).toEqual(['Applications open', 'Hello again']);
    });

    it('the audience is consent-based: pool consent plus email opt-in; under 18 never, even with a guardian (DPDP s.9)', async () => {
      const a = (await api('rec', 'post', '/hiring/campaigns/audience').send({ poolId: ids.pool, channel: 'email' }).expect(200)).body;
      // ok and aisha are in; unsub opted out; nocon has no pool consent; kid is under 18 (no campaigns to children).
      expect(a).toEqual({ total: 5, enrolled: 2, skipped: { noConsent: 1, optedOut: 1, minor: 1, erased: 0 } });
      const w = (await api('rec', 'post', '/hiring/campaigns/audience').send({ poolId: ids.pool, channel: 'whatsapp' }).expect(200)).body;
      expect(w.enrolled).toBe(0);
      await api('adminB', 'post', '/hiring/campaigns/audience').send({ poolId: ids.pool, channel: 'email' }).expect(404);
    });

    it('refuses bad steps, another company template, WhatsApp with no provider, acting and no key', async () => {
      const base = { name: 'Winter nurture', channel: 'email', poolId: ids.pool, stopOnReply: true, stopOnApply: true, start: true };
      await api('rec', 'post', '/hiring/campaigns').send({ ...base, steps: [] }).expect(409);
      await api('rec', 'post', '/hiring/campaigns').send({ ...base, steps: [{ kind: 'wait', days: 3 }] }).expect(409);
      await api('rec', 'post', '/hiring/campaigns').send({ ...base, steps: [{ kind: 'message', templateId: ids.tplB }] }).expect(409);
      await api('rec', 'post', '/hiring/campaigns').send({ ...base, channel: 'sms', steps: [{ kind: 'message', templateId: ids.tplA }] }).expect(400);
      const wa = (await api('rec', 'post', '/hiring/campaigns').send({ ...base, channel: 'whatsapp', start: false, steps: [] }).expect(409)).body;
      expect(wa.message).toMatch(/step/);
      const waTpl = (await inA((tx) => tx.candidateWhatsappTemplate.create({ data: { organizationId: org.A.id, name: 'WA hello', body: 'Hi' } }))).id;
      const draft = (await api('rec', 'post', '/hiring/campaigns').send({ ...base, channel: 'whatsapp', start: false, steps: [{ kind: 'message', templateId: waTpl }] }).expect(201)).body;
      expect(draft.status).toBe('draft');
      expect((await api('rec', 'post', `/hiring/campaigns/${draft.id}/start`).expect(409)).body.message).toMatch(/WhatsApp is not connected/);
      await api('acting', 'post', '/hiring/campaigns').send({ ...base, steps: [{ kind: 'message', templateId: ids.tplA }] }).expect(403);
      await api('viewer', 'post', '/hiring/campaigns').send({ ...base, steps: [{ kind: 'message', templateId: ids.tplA }] }).expect(403);
      await api('rec', 'post', `/hiring/campaigns/${draft.id}/stop`).expect(200);
    });

    it('starts: enrols the consenting members; another company cannot read or stop it', async () => {
      const r = (await api('rec', 'post', '/hiring/campaigns').send({ name: 'Winter nurture', channel: 'email', poolId: ids.pool, stopOnReply: true, stopOnApply: true, start: true, steps: [{ kind: 'message', templateId: ids.tplA }, { kind: 'wait', days: 3 }, { kind: 'message', templateId: ids.tplA2 }] }).expect(want(201))).body;
      expect(r).toMatchObject({ status: 'running', enrolled: 2 });
      ids.camp = r.id;
      const people = (await api('rec', 'get', `/hiring/campaigns/${ids.camp}/members`).expect(200)).body as { candidateId: string }[];
      expect(people.map((p) => p.candidateId).sort()).toEqual([ids.ok, ids.aisha].sort());
      await api('adminB', 'get', `/hiring/campaigns/${ids.camp}/members`).expect(404);
      await api('adminB', 'post', `/hiring/campaigns/${ids.camp}/stop`).expect(404);
      await api('rec', 'post', `/hiring/campaigns/${ids.camp}/start`).expect(409);
    });

    it('the sweep sends nothing outside the send window', async () => {
      await setSetting('hiring.crm.send_window', '10-18');
      sent.length = 0;
      await campaigns.sweep(new Date('2026-11-10T17:00:00Z')); // 22:30 IST
      expect(sent).toHaveLength(0);
      await setSetting('hiring.crm.send_window', '00-24');
    });

    it('the sweep sends each step once, with an unsubscribe link, logged and audited', async () => {
      sent.length = 0;
      await campaigns.sweep();
      await campaigns.sweep();
      expect(sent.map((m) => m.subject).sort()).toEqual(['Hello Aisha Khan', 'Hello Priya Raman']);
      expect(sent[0]!.html).toMatch(/\/unsubscribe\//);
      const sends = await inA((tx) => tx.talentCampaignSend.findMany({ where: { campaignId: ids.camp } }));
      expect(sends.map((s) => [s.stepIndex, s.status])).toEqual([[0, 'sent'], [0, 'sent']]);
      expect(await inA((tx) => tx.auditLog.count({ where: { action: 'ats.campaign.sent', entityId: ids.camp } }))).toBe(2);
      expect(await inA((tx) => tx.candidateEmail.count({ where: { candidateId: ids.ok, source: 'campaign' } }))).toBe(1);
      // A send row is a record: it cannot be rewritten.
      await expect(inA((tx) => tx.talentCampaignSend.update({ where: { id: sends[0]!.id }, data: { status: 'failed' } }))).rejects.toThrow();
      // The wait step: nothing more until it has passed.
      const m = await inA((tx) => tx.talentCampaignMember.findFirstOrThrow({ where: { campaignId: ids.camp, candidateId: ids.ok } }));
      expect(m.stepIndex).toBe(2);
      expect(m.nextDueAt.getTime()).toBeGreaterThan(Date.now() + 2 * 86_400_000);
    });

    it('stops on unsubscribe (the public link) and on a recorded reply; the engagement shows it', async () => {
      const unsubscribeToken = (await inA((tx) => tx.candidate.findUniqueOrThrow({ where: { id: ids.ok } }))).unsubscribeToken!;
      await pub('post', `/unsubscribe/${unsubscribeToken}`).send({ optedOut: true }).expect(201);
      await api('rec', 'post', `/hiring/campaigns/${ids.camp}/members/${ids.aisha}/replied`).expect(200);
      await api('rec', 'post', `/hiring/campaigns/${ids.camp}/members/${ids.aisha}/replied`).expect(409);
      await api('acting', 'post', `/hiring/campaigns/${ids.camp}/members/${ids.ok}/replied`).expect(403);
      await inA((tx) => tx.talentCampaignMember.updateMany({ where: { campaignId: ids.camp }, data: { nextDueAt: new Date(Date.now() - 1000) } }));
      sent.length = 0;
      await campaigns.sweep();
      expect(sent).toHaveLength(0);
      const people = (await api('rec', 'get', `/hiring/campaigns/${ids.camp}/members`).expect(200)).body as { candidateId: string; status: string; stopReason: string }[];
      expect(people.find((p) => p.candidateId === ids.ok)).toMatchObject({ status: 'stopped', stopReason: 'opted_out' });
      expect(people.find((p) => p.candidateId === ids.aisha)).toMatchObject({ status: 'stopped', stopReason: 'replied' });
      expect(people.find((p) => p.candidateId === ids.kid)).toBeUndefined();
      const e = (await api('rec', 'get', `/hiring/candidates/${ids.ok}/engagement`).expect(200)).body;
      expect(e.consent).toEqual({ email: 'opted-out', whatsapp: 'none' });
      expect(e.items.map((i: { kind: string }) => i.kind)).toEqual(expect.arrayContaining(['enrolled', 'sent', 'stopped']));
      await api('adminB', 'get', `/hiring/candidates/${ids.ok}/engagement`).expect(404);
      const list = (await api('rec', 'get', '/hiring/campaigns').expect(200)).body.campaigns.find((c: { id: string }) => c.id === ids.camp);
      expect(list.counts).toMatchObject({ enrolled: 2, replied: 1, optedOut: 1, sent: 2 });
    });
  });

  describe('HIR-20 sourced profiles', () => {
    const add = (who: Who, over: Record<string, unknown> = {}) => api(who, 'post', '/hiring/sourced').send({ name: 'Swathi Krishnan', email: `swathi-${run}@x.test`, site: 'Naukri', headline: 'Senior QA', sourceNote: 'Naukri résumé search, looking for a change', ...over });

    it('refuses no notice (another company, 409), a short source note (400), acting (403), no key (403)', async () => {
      expect((await add('adminB').expect(409)).body.message).toMatch(/consent notice/);
      await add('rec', { sourceNote: 'short' }).expect(400);
      await add('rec', { email: 'nope' }).expect(400);
      await add('acting').expect(403);
      await add('viewer').expect(403);
      expect((await add('rec', { email: `priya.raman-${run}@x.test` }).expect(409)).body.message).toMatch(/already a candidate/);
    });

    it('adds: one consent email; not a candidate (not searchable or contactable); a second add is refused', async () => {
      sent.length = 0;
      const r = (await add('rec').expect(want(201))).body;
      expect(r.status).toBe('pending');
      ids.src = r.id;
      expect(sent).toHaveLength(1);
      ids.srcToken = linkIn(sent[0]!.html, 'sourced');
      expect(await inA((tx) => tx.candidate.count({ where: { email: `swathi-${run}@x.test` } }))).toBe(0);
      await add('rec').expect(409);
      await api('rec', 'post', `/hiring/sourced/${ids.src}/resend`).expect(409);
      const list = (await api('rec', 'get', '/hiring/sourced').expect(200)).body;
      expect(list.keepDays).toBe(30);
      expect(list.profiles[0]).toMatchObject({ name: 'Swathi Krishnan', status: 'pending', daysLeft: 30 });
      await api('viewer', 'get', '/hiring/sourced').expect(403);
      expect((await api('adminB', 'get', '/hiring/sourced').expect(200)).body.profiles).toEqual([]);
      await api('adminB', 'delete', `/hiring/sourced/${ids.src}`).expect(404);
    });

    it('agreeing makes them a candidate with a talent-pool consent; the link is then used up', async () => {
      const page = (await pub('get', `/consent/sourced/${ids.srcToken}`).expect(200)).body;
      expect(page).toMatchObject({ name: 'Swathi Krishnan', notice: expect.stringMatching(/12 months/) });
      await pub('post', `/consent/sourced/${ids.srcToken}`).send({ agree: true }).expect(200);
      await pub('get', `/consent/sourced/${ids.srcToken}`).expect(404);
      const c = await inA((tx) => tx.candidate.findFirstOrThrow({ where: { email: `swathi-${run}@x.test` } }));
      expect(await inA((tx) => tx.candidateConsent.count({ where: { candidateId: c.id, purpose: 'talent_pool', source: 'sourced', withdrawnAt: null } }))).toBe(1);
      expect((await api('rec', 'get', '/hiring/sourced').expect(200)).body.profiles[0]).toMatchObject({ status: 'given', candidateId: c.id, daysLeft: null });
      await api('rec', 'delete', `/hiring/sourced/${ids.src}`).expect(409);
    });

    it('refusing erases at once; no answer by the limit erases in the sweep (no personal data in the audit)', async () => {
      sent.length = 0;
      const no = (await add('rec', { name: 'Ravi N', email: `ravi-${run}@x.test` }).expect(201)).body.id;
      await pub('post', `/consent/sourced/${linkIn(sent[0]!.html, 'sourced')}`).send({ agree: false }).expect(200);
      expect(await inA((tx) => tx.sourcedProfile.count({ where: { id: no } }))).toBe(0);
      const late = (await add('rec', { name: 'Late Lata', email: `lata-${run}@x.test` }).expect(201)).body.id;
      await inA((tx) => tx.sourcedProfile.update({ where: { id: late }, data: { purgeAfter: new Date(Date.now() - 1000) } }));
      await consents.purgeSourced();
      expect(await inA((tx) => tx.sourcedProfile.count({ where: { id: late } }))).toBe(0);
      const a = await inA((tx) => tx.auditLog.findFirstOrThrow({ where: { action: 'ats.sourced.erased', entityId: late } }));
      expect(String(a.metadataJson)).not.toMatch(/Lata|lata-/);
      // The recruiter can erase a pending one too.
      const now = (await add('rec', { name: 'Now Nita', email: `nita-${run}@x.test` }).expect(201)).body.id;
      await api('acting', 'delete', `/hiring/sourced/${now}`).expect(403);
      await api('rec', 'delete', `/hiring/sourced/${now}`).expect(200);
    });

    it('the company limit is a setting (default 30, here 7)', async () => {
      await setSetting('hiring.sourced.keep_days', '7');
      const r = (await add('rec', { name: 'Seven Sam', email: `sam-${run}@x.test` }).expect(201)).body;
      expect(Math.round((Date.parse(r.purgeAfter) - Date.now()) / 86_400_000)).toBe(7);
    });
  });
});
