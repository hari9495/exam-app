process.env.SD_SCANNER = 'dev-fake'; // the dev scanner knows only EICAR: everything else is clean
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { PublicApplicationsController } from '../src/public-applications/public-applications.controller';
import { PublicApplicationsThrottlerGuard } from '../src/public-applications/public-applications.throttler.guard';
import { PUBLIC_APPLY_THROTTLE, STRICT_WALK_IN_THROTTLE } from '../src/rate-limit-tiers';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// T9-09 careers site and the candidate pages outside the app (founder decisions 8 and 10, answers 224 and 242): the public
// list shows only published open jobs of that company; on-hold and closed jobs are refused; apply records consent; the
// pay-history answer is kept only where the job asks and the law allows; the résumé is scanned after the commit; the
// status page and portal show only the candidate's own applications by their link; an offer is accepted by link; and the
// page builder's layout is validated.

describe('Hiring careers site and candidate pages (T9-09)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const send = jest.fn(async () => ({ success: true }));
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const token = { A: '', B: '' };
  const ids: Record<string, string> = {};
  const api = (who: 'A' | 'B', method: 'get' | 'post' | 'put' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const pub = (method: 'get' | 'post', path: string) => request(server())[method](`/api/v1/public${path}`);
  type Tx = Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0];
  const inA = <T>(fn: (tx: Tx) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const pdf = (extra = '') => Buffer.from(`%PDF-1.7\n${run} ${extra}\n%%EOF`).toString('base64');
  const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
  const consent = [{ purpose: 'application', version: 1 }];
  const apply = (applyToken: string, body: Record<string, unknown>) => pub('post', `/jobs/${applyToken}/apply`).send({ name: 'Asha Rao', resumeBase64: pdf(String(Math.random())), consents: consent, ...body });
  const job = async (body: Record<string, unknown>, listed = true) => {
    const j = (await api('A', 'post', '/jobs').send({ title: `QA Chemist ${run}`, ...body }).expect(201)).body;
    const live = (await api('A', 'patch', `/jobs/${j.id}`).send({ publicApplyEnabled: true, listOnCareers: listed }).expect(200)).body;
    return { id: j.id as string, slug: j.slug as string, applyToken: live.applyToken as string };
  };
  const scanOf = async (email: string) => {
    for (let i = 0; i < 50; i++) {
      const p = await inA((tx) => tx.candidateProfile.findFirst({ where: { candidate: { email } }, select: { resumeScan: true } }));
      if (p && p.resumeScan !== 'pending') return p.resumeScan;
      await new Promise((r) => setTimeout(r, 100));
    }
    return 'pending';
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send }).overrideProvider(BlobStorageService).useValue(createFakeBlobStorage()).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    planId = (await prisma.plan.create({ data: { name: `careers-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const passwordHash = await argon2.hash(PASSWORD);
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Careers Org ${k} ${run}`, slug: `careers-${k.toLowerCase()}-${run}`, planId, careersEnabled: true } });
      org[k] = { id: created.id, slug: created.slug };
      await tenantPrisma.forTenant({ organizationId: created.id, isSuperAdmin: false }, (tx) =>
        tx.user.create({ data: { organizationId: created.id, email: `recruiter@careers-${k}-${run}.test`, name: `Ravi Recruiter ${k}`, passwordHash, role: 'org_admin' } }),
      );
      token[k] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: created.slug, email: `recruiter@careers-${k}-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Foods Pvt Ltd', shortName: `KF${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      const loc = (name: string, code: string, country: string, state: string, timezone: string) => tx.location.create({ data: { ...x, legalEntityId: ids.entity, name, code, address: {}, country, state, timezone } });
      ids.chennai = (await loc('Chennai office', 'MAA', 'IN', 'IN-TN', 'Asia/Kolkata')).id;
      ids.ny = (await loc('New York office', 'NYC', 'US', 'US-NY', 'America/New_York')).id;
    });
    // The application notice, version 1.
    await api('A', 'post', '/hiring/consent-notices').send({ purpose: 'application', text: 'We use your details only to consider you for this job.' }).expect(201);

    const open = await job({ locationId: ids.chennai, showSalary: true, salaryMin: 450000, salaryMax: 600000, askPayHistory: true, description: 'Test raw materials.' });
    Object.assign(ids, { open: open.id, openSlug: open.slug, openToken: open.applyToken });
    const unlisted = await job({ title: `Unlisted ${run}`, locationId: ids.chennai }, false);
    ids.unlistedToken = unlisted.applyToken;
    const hold = await job({ title: `On hold ${run}`, locationId: ids.chennai });
    Object.assign(ids, { hold: hold.id, holdSlug: hold.slug, holdToken: hold.applyToken });
    await api('A', 'patch', `/jobs/${hold.id}`).send({ status: 'on_hold' }).expect(200);
    const closed = await job({ title: `Closed ${run}`, locationId: ids.chennai });
    Object.assign(ids, { closedSlug: closed.slug, closedToken: closed.applyToken });
    await api('A', 'patch', `/jobs/${closed.id}`).send({ status: 'closed' }).expect(200);
    const ny = await job({ title: `NY Analyst ${run}`, locationId: ids.ny, salaryMin: 90000, salaryMax: 120000, salaryCurrency: 'USD' });
    Object.assign(ids, { ny: ny.id, nyToken: ny.applyToken });
    // The law changed after the job asked (or the row was edited by hand): the public pages must still never ask.
    await inA((tx) => tx.job.update({ where: { id: ny.id }, data: { askPayHistory: true } }));
    const b = (await api('B', 'post', '/jobs').send({ title: `Other company job ${run}` }).expect(201)).body;
    ids.bSlug = (await api('B', 'patch', `/jobs/${b.id}`).send({ publicApplyEnabled: true, listOnCareers: true }).expect(200)).body.slug;
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('the public list shows only the published open jobs of that company, with no internal data', async () => {
    const page = (await pub('get', `/careers/${org.A.slug}`).expect(200)).body;
    expect(page.jobs.map((j: { title: string }) => j.title)).toEqual([`NY Analyst ${run}`, `QA Chemist ${run}`]);
    const text = JSON.stringify(page);
    expect(text).not.toMatch(/Ravi Recruiter|recruiter@|createdBy|recruiterId|Other company job/);
    // Before the builder is used, the layout is made from the headline and intro.
    expect(page.config).toMatchObject({ theme: 'classic', accent: null, sections: [{ type: 'hero' }, { type: 'jobs' }, { type: 'footer' }] });
    // Pay range only where the job shows it.
    expect(page.jobs.find((j: { title: string }) => j.title.startsWith('QA'))).toMatchObject({ salaryMin: 450000, salaryMax: 600000 });
    expect(page.jobs.find((j: { title: string }) => j.title.startsWith('NY'))).toMatchObject({ salaryMin: 90000, salaryMax: 120000 });
    // Another company's slug space and an unknown company are refused.
    await pub('get', `/careers/${org.A.slug}/jobs/${ids.bSlug}`).expect(404);
    expect((await pub('get', `/careers/${org.B.slug}`).expect(200)).body.jobs.map((j: { title: string }) => j.title)).toEqual([`Other company job ${run}`]);
    await pub('get', `/careers/no-such-company-${run}`).expect(404);
  });

  it('on hold and closed jobs are refused (answer 242); an unlisted job is reachable only by its apply link', async () => {
    await pub('get', `/careers/${org.A.slug}/jobs/${ids.holdSlug}`).expect(404);
    await pub('get', `/careers/${org.A.slug}/jobs/${ids.closedSlug}`).expect(404);
    for (const t of [ids.holdToken, ids.closedToken]) {
      expect((await pub('get', `/jobs/${t}`).expect(404)).body.message).toBe('This role is not accepting applications');
      expect((await apply(t, { email: `late-${run}@x.test` }).expect(404)).body.message).toBe('This role is not accepting applications');
    }
    const unlisted = (await pub('get', `/jobs/${ids.unlistedToken}`).expect(200)).body;
    expect(unlisted.careers).toEqual({ orgSlug: org.A.slug, jobSlug: null });
  });

  it('the job page carries the pay range and asks about pay only where the job asks and the law allows (answer 224)', async () => {
    const qa = (await pub('get', `/jobs/${ids.openToken}`).expect(200)).body;
    expect(qa).toMatchObject({ askPayHistory: true, salary: { min: 450000, max: 600000, currency: 'INR', period: 'year' }, careers: { orgSlug: org.A.slug, jobSlug: ids.openSlug } });
    expect(qa.consents).toEqual([expect.objectContaining({ purpose: 'application', version: 1, required: true })]);
    expect(JSON.stringify(qa)).not.toMatch(/Ravi Recruiter|recruiter@/);
    const ny = (await pub('get', `/jobs/${ids.nyToken}`).expect(200)).body;
    expect(ny.askPayHistory).toBe(false); // New York bans the question
  });

  it('apply needs consent, records it at the version shown, and keeps the pay answer only where allowed', async () => {
    await apply(ids.openToken, { email: `noconsent-${run}@x.test`, consents: [] }).expect(400);
    await apply(ids.openToken, { email: `stale-${run}@x.test`, consents: [{ purpose: 'application', version: 9 }] }).expect(409);
    await apply(ids.openToken, { email: `asha-${run}@x.test`, currentPay: 520000 }).expect(201).expect({ received: true });
    await apply(ids.nyToken, { email: `ny-${run}@x.test`, currentPay: 80000 }).expect(201);
    const entries = await inA((tx) => tx.pipelineEntry.findMany({ where: { candidate: { email: { in: [`asha-${run}@x.test`, `ny-${run}@x.test`] } } }, select: { currentPay: true, jobId: true, candidateId: true } }));
    expect(entries.find((e) => e.jobId === ids.open)?.currentPay).toBe(520000);
    expect(entries.find((e) => e.jobId === ids.ny)?.currentPay).toBeNull(); // banned there: dropped, never stored
    const consents = await inA((tx) => tx.candidateConsent.findMany({ where: { candidateId: entries.find((e) => e.jobId === ids.open)!.candidateId }, select: { purpose: true, version: true, source: true, ipHash: true } }));
    expect(consents).toEqual([expect.objectContaining({ purpose: 'application', version: 1, source: 'apply', ipHash: expect.any(String) })]);
    // HR switches the question off: an answer sent from an old page is dropped too.
    await api('A', 'patch', `/jobs/${ids.open}`).send({ askPayHistory: false }).expect(200);
    await apply(ids.openToken, { email: `late-pay-${run}@x.test`, currentPay: 300000 }).expect(201);
    expect((await inA((tx) => tx.pipelineEntry.findFirstOrThrow({ where: { candidate: { email: `late-pay-${run}@x.test` } } }))).currentPay).toBeNull();
    await api('A', 'patch', `/jobs/${ids.open}`).send({ askPayHistory: true }).expect(200);
  });

  it('bad input is refused', async () => {
    await apply(ids.openToken, { email: `bad-${run}@x.test`, currentPay: -1 }).expect(400);
    await apply(ids.openToken, { email: `bad-${run}@x.test`, currentPay: 'a lot' }).expect(400);
    await apply(ids.openToken, { email: `bad-${run}@x.test`, currentPay: 12.5 }).expect(400);
    await apply(ids.openToken, { email: 'not-an-email' }).expect(400);
    await apply(ids.openToken, { email: `bad-${run}@x.test`, resumeBase64: Buffer.from('<html>').toString('base64') }).expect(400);
    await pub('get', `/careers/${org.A.slug}/jobs/%3Cscript%3E`).expect(404);
    await pub('get', '/jobs/not-a-token').expect(404);
    await pub('get', '/applications/not-a-token').expect(404);
    await pub('get', '/portal/not-a-token').expect(404);
    expect(await inA((tx) => tx.candidate.count({ where: { email: `bad-${run}@x.test` } }))).toBe(0);
  });

  it('the résumé is scanned after the commit: a clean file is marked clean, EICAR is quarantined and audited', async () => {
    expect(await scanOf(`asha-${run}@x.test`)).toBe('clean');
    const virus = `virus-${run}@x.test`;
    await apply(ids.openToken, { email: virus, resumeBase64: Buffer.from(`%PDF-1.7\n${EICAR}`).toString('base64') }).expect(201);
    expect(await scanOf(virus)).toBe('infected');
    const c = await inA((tx) => tx.candidate.findFirstOrThrow({ where: { email: virus } }));
    await api('A', 'get', `/candidates/${c.id}/resume`).expect(409);
    expect(await inA((tx) => tx.auditLog.count({ where: { entityId: c.id, action: 'candidate.resume.scan.infected' } }))).toBe(1);
    // Answer 352: the applicant is told, with their candidate page to upload another file.
    const told = async (to: string) => {
      for (let i = 0; i < 50; i++) {
        const m = (send.mock.calls as unknown as [{ to: string; subject: string; html: string }][]).find(([x]) => x.to === to && /could not accept your résumé/.test(x.subject));
        if (m) return m[0];
        await new Promise((r) => setTimeout(r, 100));
      }
      return null;
    };
    const mail = await told(virus);
    expect(mail?.html).toMatch(/\/yx\/candidate\/[^"]+/);
    expect(await inA((tx) => tx.auditLog.count({ where: { entityId: c.id, action: 'candidate.resume.quarantine_told' } }))).toBe(1);
    // With the company setting off, nobody is told (the file is still quarantined).
    await inA((tx) => tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key: 'hiring.resume_quarantine.tell_applicant', value: 'off' } }));
    const quiet = `quiet-${run}@x.test`;
    await apply(ids.openToken, { email: quiet, resumeBase64: Buffer.from(`%PDF-1.7\n${EICAR}`).toString('base64') }).expect(201);
    expect(await scanOf(quiet)).toBe('infected');
    expect(await told(quiet)).toBeNull();
    await inA((tx) => tx.setting.deleteMany({ where: { organizationId: org.A.id, key: 'hiring.resume_quarantine.tell_applicant' } }));
  });

  it('public routes are rate limited: apply 5 a minute, the rest 20, keyed by the link (fail closed)', () => {
    expect(Reflect.getMetadata('__guards__', PublicApplicationsController)).toContain(PublicApplicationsThrottlerGuard);
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', PublicApplicationsController.prototype.apply)).toBe(PUBLIC_APPLY_THROTTLE.default.limit);
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', PublicApplicationsController)).toBe(STRICT_WALK_IN_THROTTLE.default.limit);
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const real = require('../src/rate-limit-tiers');
      expect(real.PUBLIC_APPLY_THROTTLE.default.limit).toBe(5);
      expect(real.STRICT_WALK_IN_THROTTLE.default.limit).toBe(20);
    });
    process.env.NODE_ENV = env;
  });

  it('the status page and the portal show only the candidate’s own applications, in candidate words', async () => {
    const entry = await inA((tx) => tx.pipelineEntry.findFirstOrThrow({ where: { candidate: { email: `asha-${run}@x.test` } }, select: { applicationToken: true, candidate: { select: { portalToken: true } } } }));
    ids.statusToken = entry.applicationToken!;
    ids.portalToken = entry.candidate.portalToken!;
    const status = (await pub('get', `/applications/${ids.statusToken}`).expect(200)).body;
    expect(Object.keys(status).sort()).toEqual(['accent', 'appliedAt', 'careersSlug', 'jobTitle', 'location', 'orgLogo', 'orgName', 'statusBucket', 'toolNotice', 'whiteLabel']);
    expect(status).toMatchObject({ jobTitle: `QA Chemist ${run}`, statusBucket: 'Application received', careersSlug: org.A.slug, toolNotice: null });
    // Asha applies to a second job; Ravi (another applicant) never shows on her pages.
    await apply(ids.nyToken, { email: `asha-${run}@x.test` }).expect(201);
    const portal = (await pub('get', `/portal/${ids.portalToken}`).expect(200)).body;
    expect(portal.applications.map((a: { jobTitle: string }) => a.jobTitle).sort()).toEqual([`NY Analyst ${run}`, `QA Chemist ${run}`]);
    expect(portal.applications.every((a: { stage: string }) => ['Application received', 'Under review'].includes(a.stage))).toBe(true);
    const text = JSON.stringify(portal);
    expect(text).not.toMatch(/Ravi Recruiter|ny-|virus-|notes|recruiterId/);
    // Rejected: the decision words, never the stage name.
    await inA((tx) => tx.pipelineEntry.updateMany({ where: { applicationToken: ids.statusToken }, data: { rejected: true } }));
    expect((await pub('get', `/applications/${ids.statusToken}`).expect(200)).body.statusBucket).toBe('A decision has been made; the team will follow up');
    await inA((tx) => tx.pipelineEntry.updateMany({ where: { applicationToken: ids.statusToken }, data: { rejected: false } }));
  });

  it('an offer is accepted by its link once; the answer carries no internal fields; expired and unknown links are refused', async () => {
    const entry = await inA((tx) => tx.pipelineEntry.findFirstOrThrow({ where: { applicationToken: ids.statusToken } }));
    const mk = (offerToken: string, expiresAt: Date) => inA((tx) => tx.offer.create({ data: { organizationId: org.A.id, pipelineEntryId: entry.id, candidateId: entry.candidateId, compensation: '₹6,00,000 a year', startDate: new Date('2026-12-01T00:00:00Z'), expiresAt, status: 'sent', offerToken, letterSubject: 'Offer', letterBody: 'Welcome', sentAt: new Date() } }));
    const good = `offer-${run}`;
    const old = `old-offer-${run}`;
    await mk(good, new Date(Date.now() + 7 * 86_400_000));
    await mk(old, new Date(Date.now() - 86_400_000));
    const view = (await pub('get', `/offers/${good}`).expect(200)).body;
    expect(view).toMatchObject({ jobTitle: `QA Chemist ${run}`, compensation: '₹6,00,000 a year', status: 'sent' });
    expect(JSON.stringify(view)).not.toMatch(/sentByUserId|organizationId|pipelineEntryId|Ravi/);
    const res = (await pub('post', `/offers/${good}/respond`).send({ action: 'accept' }).expect(201)).body;
    expect(res).toEqual({ status: 'accepted' });
    await pub('post', `/offers/${good}/respond`).send({ action: 'accept' }).expect(409);
    await pub('post', `/offers/${old}/respond`).send({ action: 'accept' }).expect(409);
    await pub('post', `/offers/${good}/respond`).send({ action: 'maybe' }).expect(400);
    await pub('get', `/offers/no-such-offer-${run}`).expect(404);
    // The portal shows the accepted offer under its application.
    const portal = (await pub('get', `/portal/${ids.portalToken}`).expect(200)).body;
    expect(portal.applications.find((a: { jobTitle: string }) => a.jobTitle.startsWith('QA')).offers.map((o: { status: string }) => o.status).sort()).toEqual(['accepted', 'sent']);
  });

  it('the page builder layout is saved, validated and shown on the public page; another company never sees it', async () => {
    const config = {
      theme: 'split',
      accent: '#1F6F4A',
      sections: [
        { id: 'hero-1', type: 'hero', title: 'Make the snacks South India shares', text: '248 people across Bengaluru.', photoAlt: 'Packing team' },
        { id: 'benefits-1', type: 'benefits', title: 'Benefits', items: [{ icon: 'health', title: 'Family health cover', text: '₹5,00,000 floater.' }] },
        { id: 'jobs-1', type: 'jobs', title: 'Open jobs' },
        { id: 'faq-1', type: 'faq', title: 'Questions', hidden: true, items: [{ question: 'WhatsApp?', answer: 'Not yet.' }] },
        { id: 'footer-1', type: 'footer', title: 'Contact', text: 'MG Road, Bengaluru' },
      ],
    };
    const saved = (await api('A', 'put', '/organizations/careers').send({ enabled: true, config }).expect(200)).body;
    expect(saved).toMatchObject({ enabled: true, headline: 'Make the snacks South India shares', intro: '248 people across Bengaluru.', config });
    expect((await pub('get', `/careers/${org.A.slug}`).expect(200)).body).toMatchObject({ headline: 'Make the snacks South India shares', config });
    expect((await pub('get', `/careers/${org.B.slug}`).expect(200)).body.config.theme).toBe('classic');
    expect((await pub('get', `/jobs/${ids.openToken}`).expect(200)).body.accent).toBe('#1F6F4A');

    const bad = (patch: Record<string, unknown>) => api('A', 'put', '/organizations/careers').send({ enabled: true, config: { ...config, ...patch } }).expect(400);
    await bad({ sections: [...config.sections, { id: 'hero-2', type: 'hero', title: 'Again' }] });
    await bad({ sections: [{ id: 'x-1', type: 'html', title: '<script>' }] });
    await bad({ accent: 'red;}body{' });
    await bad({ theme: 'neon' });
    await bad({ sections: [{ id: 'about-1', type: 'about', title: 'A', text: 'x'.repeat(2001) }] });
    await bad({ sections: [{ id: 'about-1', type: 'about', title: 'A', onclick: 'x' }] });
    // Taken offline: the public page is gone; the layout stays for next time.
    await api('A', 'put', '/organizations/careers').send({ enabled: false }).expect(200);
    await pub('get', `/careers/${org.A.slug}`).expect(404);
    expect((await api('A', 'get', '/organizations/careers').expect(200)).body.config.theme).toBe('split');
    await api('A', 'put', '/organizations/careers').send({ enabled: true }).expect(200);
  });

  it('careers follow-ups: apply-by closes a job, experience shows, international number outside India, white-label and brand on the answers, pay history only in the own company (answers 353, 355, 356, 359, 362)', async () => {
    // 353: optional fields; a bad day or long text is refused; after the day the job is closed to applicants and off the list.
    await api('A', 'post', '/jobs').send({ title: `Bad day ${run}`, applyBy: '31-12-2099' }).expect(400);
    await api('A', 'post', '/jobs').send({ title: `Long ${run}`, experience: 'x'.repeat(61) }).expect(400);
    const soon = await job({ title: `Soon ${run}`, locationId: ids.chennai, applyBy: '2099-12-31', experience: '3 to 5 years' });
    expect((await pub('get', `/jobs/${soon.applyToken}`).expect(200)).body).toMatchObject({ applyBy: '2099-12-31', experience: '3 to 5 years' });
    const past = await job({ title: `Past ${run}`, locationId: ids.chennai });
    await api('A', 'patch', `/jobs/${past.id}`).send({ applyBy: '2020-01-01' }).expect(200);
    expect((await pub('get', `/jobs/${past.applyToken}`).expect(404)).body.message).toBe('This role is not accepting applications');
    await apply(past.applyToken, { email: `late-${run}@x.test` }).expect(404);
    const titles = (await pub('get', `/careers/${org.A.slug}`).expect(200)).body.jobs.map((j: { title: string }) => j.title);
    expect(titles).toContain(`Soon ${run}`);
    expect(titles).not.toContain(`Past ${run}`);
    // 359: a job outside India takes any country code; India keeps the 10-digit number.
    expect((await pub('get', `/jobs/${ids.nyToken}`).expect(200)).body.internationalPhone).toBe(true);
    expect((await pub('get', `/jobs/${ids.openToken}`).expect(200)).body.internationalPhone).toBe(false);
    await apply(ids.nyToken, { email: `intl-${run}@x.test`, phone: '+12125550123' }).expect(201);
    // 356: off by default; on hides "Powered by" on the careers page, the job page and the offer answer (362).
    expect((await pub('get', `/careers/${org.A.slug}`).expect(200)).body.whiteLabel).toBe(false);
    const entry = await inA((tx) => tx.pipelineEntry.findFirstOrThrow({ where: { jobId: ids.open, candidate: { email: `asha-${run}@x.test` } } }));
    const offerToken = `brand-offer-${run}`;
    await inA((tx) => tx.offer.create({ data: { organizationId: org.A.id, pipelineEntryId: entry.id, candidateId: entry.candidateId, compensation: 'x', startDate: new Date('2026-12-01T00:00:00Z'), expiresAt: new Date(Date.now() + 86_400_000), status: 'sent', offerToken, letterSubject: 'Offer', letterBody: 'Welcome', sentAt: new Date() } }));
    expect((await pub('get', `/offers/${offerToken}`).expect(200)).body.brand).toMatchObject({ careersSlug: org.A.slug, whiteLabel: false });
    await inA((tx) => tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key: 'brand.white_label', value: 'on' } }));
    expect((await pub('get', `/careers/${org.A.slug}`).expect(200)).body.whiteLabel).toBe(true);
    expect((await pub('get', `/jobs/${ids.openToken}`).expect(200)).body.whiteLabel).toBe(true);
    const offer = (await pub('get', `/offers/${offerToken}`).expect(200)).body;
    expect(offer.brand).toMatchObject({ orgName: expect.stringContaining('Careers Org A'), whiteLabel: true });
    expect(JSON.stringify(offer.brand)).not.toMatch(/organizationId|logoPath/);
    expect((await pub('get', `/careers/${org.B.slug}`).expect(200)).body.whiteLabel).toBe(false);
    await inA((tx) => tx.setting.deleteMany({ where: { organizationId: org.A.id, key: 'brand.white_label' } }));
    // 355: the pay given when applying, read by the company's own pay-key holder; another company and a bad id are refused.
    expect((await api('A', 'get', `/hiring/offers/current-pay?entryId=${entry.id}`).expect(200)).body).toEqual({ currentPay: 520000 });
    await api('B', 'get', `/hiring/offers/current-pay?entryId=${entry.id}`).expect(404);
    await api('A', 'get', '/hiring/offers/current-pay?entryId=not-a-uuid').expect(400);
  });
});
