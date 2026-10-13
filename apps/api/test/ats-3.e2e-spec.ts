process.env.SD_SCANNER = 'dev-fake'; // public résumés must pass the (fake) virus check
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

// Recruitment batch AT3 end to end (M10-BUILD-DESIGN §6, §13): the public careers site and apply are an untrusted
// boundary. Readable job URLs, entity pages, the Google for Jobs sitemap, versioned consent per purpose, the honeypot,
// no candidate enumeration, the virus check, and posting costs.

describe('Recruitment batch AT3', () => {
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
  const api = (who: 'A' | 'B', method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const pub = (method: 'get' | 'post', path: string) => request(server())[method](`/api/v1/public${path}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const pdf = (extra = '') => Buffer.from(`%PDF-1.7\n${run} ${extra}\n%%EOF`).toString('base64');
  const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
  const apply = (body: Record<string, unknown>) => pub('post', `/jobs/${ids.applyToken}/apply`).send({ name: 'Asha Rao', resumeBase64: pdf(), ...body });

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

    planId = (await prisma.plan.create({ data: { name: `ats3-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const passwordHash = await argon2.hash(PASSWORD);
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `ATS3 Org ${k}`, slug: `ats3-${k.toLowerCase()}-${run}`, planId, careersEnabled: true } });
      org[k] = { id: created.id, slug: created.slug };
      await tenantPrisma.forTenant({ organizationId: created.id, isSuperAdmin: false }, (tx) =>
        tx.user.create({ data: { organizationId: created.id, email: `admin@ats3-${k}-${run}.test`, name: `Admin ${k}`, passwordHash, role: 'org_admin' } }),
      );
      token[k] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: created.slug, email: `admin@ats3-${k}-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    ids.entity = await inA(async (tx) => (await tx.legalEntity.create({ data: { organizationId: org.A.id, name: 'Kaveri Foods Pvt Ltd', shortName: `KF${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id);

    const job = (await api('A', 'post', '/jobs').send({ title: 'Senior Accountant', location: 'Chennai', description: '<script>alert(1)</script> Keep the books.', legalEntityId: ids.entity, salaryMin: 900000, salaryMax: 1200000, salaryCurrency: 'INR' }).expect(201)).body;
    ids.job = job.id;
    expect(job.slug).toMatch(/^senior-accountant-chennai-[a-z0-9]{6}$/);
    ids.slug = job.slug;
    const live = (await api('A', 'patch', `/jobs/${job.id}`).send({ publicApplyEnabled: true, listOnCareers: true }).expect(200)).body;
    ids.applyToken = live.applyToken;
    expect(live.publishedAt).toBeTruthy();
  });

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('careers site: readable job URL, sitemap, salary only when shown, job text returned as text (AT-3.01, 3.02)', async () => {
    const page = (await pub('get', `/careers/${org.A.slug}`).expect(200)).body;
    expect(page.jobs).toHaveLength(1);
    expect(page.jobs[0]).toMatchObject({ slug: ids.slug, salaryMin: null, company: { name: 'Kaveri Foods Pvt Ltd', slug: null } });
    await api('A', 'patch', `/jobs/${ids.job}`).send({ showSalary: true }).expect(200);
    expect((await pub('get', `/careers/${org.A.slug}`).expect(200)).body.jobs[0].salaryMin).toBe(900000);

    const one = (await pub('get', `/careers/${org.A.slug}/jobs/${ids.slug}`).expect(200)).body;
    expect(one).toMatchObject({ title: 'Senior Accountant', applyToken: ids.applyToken, orgName: 'ATS3 Org A' });
    expect(one.description).toContain('<script>'); // stored as typed; the page renders it as text, never HTML
    expect((await pub('get', `/careers/${org.A.slug}/sitemap`).expect(200)).body.jobs).toEqual([{ slug: ids.slug, updatedAt: expect.any(String) }]);

    await pub('get', `/careers/${org.A.slug}/jobs/not-a-job`).expect(404);
    await pub('get', `/careers/${org.A.slug}/jobs/%3Cscript%3E`).expect(404);
    await pub('get', `/careers/${org.B.slug}/jobs/${ids.slug}`).expect(404); // another company's slug space
  });

  it('entity pages: strict slug and colour, own headline, only that entity’s jobs; another company cannot touch them', async () => {
    await api('A', 'put', `/hiring/careers-entities/${ids.entity}`).send({ slug: 'Kaveri Foods', headline: 'x' }).expect(400);
    await api('A', 'put', `/hiring/careers-entities/${ids.entity}`).send({ slug: 'kaveri', primaryColor: 'red;}body{' }).expect(400);
    await api('B', 'put', `/hiring/careers-entities/${ids.entity}`).send({ slug: 'kaveri' }).expect(404);
    await api('A', 'put', `/hiring/careers-entities/${ids.entity}`).send({ slug: 'kaveri', headline: 'Cook with us', primaryColor: '#1f6feb' }).expect(200);

    const page = (await pub('get', `/careers/${org.A.slug}?company=kaveri`).expect(200)).body;
    expect(page).toMatchObject({ companyName: 'Kaveri Foods Pvt Ltd', headline: 'Cook with us', primaryColor: '#1f6feb', companies: [{ slug: 'kaveri', name: 'Kaveri Foods Pvt Ltd' }] });
    expect(page.jobs.map((j: { slug: string }) => j.slug)).toEqual([ids.slug]);
    await pub('get', `/careers/${org.A.slug}?company=nope`).expect(404);
    expect((await pub('get', `/careers/${org.A.slug}/sitemap`).expect(200)).body.companies).toEqual(['kaveri']);
  });

  it('consent is versioned per purpose; a stale page is refused; each acceptance is recorded with its version (AT-3.03)', async () => {
    await api('A', 'post', '/hiring/consent-notices').send({ purpose: 'marketing', text: 'Something long enough' }).expect(400);
    expect((await api('A', 'post', '/hiring/consent-notices').send({ purpose: 'application', text: 'We use your details to consider you for this job.' }).expect(201)).body.version).toBe(1);
    expect((await api('A', 'post', '/hiring/consent-notices').send({ purpose: 'application', text: 'We use your details to consider you for this job, for 12 months.' }).expect(201)).body.version).toBe(2);
    await api('A', 'post', '/hiring/consent-notices').send({ purpose: 'talent_pool', text: 'Keep me in mind for other roles.' }).expect(201);
    await api('B', 'get', '/hiring/consent-notices').expect(200).expect([]);

    const job = (await pub('get', `/jobs/${ids.applyToken}`).expect(200)).body;
    expect(job.consents).toEqual([
      { purpose: 'application', version: 2, text: expect.stringContaining('12 months'), required: true },
      { purpose: 'talent_pool', version: 1, text: expect.any(String), required: false },
    ]);
    expect(job.applyConsentVersion).toBe(2); // walk-in and one-click re-apply show the same words

    await apply({ email: `none-${run}@x.test` }).expect(400);
    await apply({ email: `stale-${run}@x.test`, consents: [{ purpose: 'application', version: 1 }] }).expect(409);
    await apply({ email: `asha-${run}@x.test`, consents: [{ purpose: 'application', version: 2 }] }).expect(201).expect({ received: true });

    const rows = await inA((tx) => tx.candidateConsent.findMany({ where: { organizationId: org.A.id } }));
    expect(rows.map((r) => [r.purpose, r.version, r.source])).toEqual([['application', 2, 'apply']]);
    expect(rows[0].ipHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('no candidate enumeration: a known email gets the same answer, the links go only to that inbox, the résumé is untouched', async () => {
    const email = `asha-${run}@x.test`;
    const before = await inA((tx) => tx.candidate.findFirstOrThrow({ where: { email }, include: { profile: true } }));
    send.mockClear();
    const res = await apply({ email, name: 'Someone Else', resumeBase64: pdf('replacement'), consents: [{ purpose: 'application', version: 2 }] }).expect(201);
    expect(res.body).toEqual({ received: true });
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: email, html: expect.stringContaining('/portal/') }));
    const after = await inA((tx) => tx.candidate.findFirstOrThrow({ where: { email }, include: { profile: true } }));
    expect(after.name).toBe(before.name);
    expect(after.profile?.resumePath).toBe(before.profile?.resumePath);
  });

  it('bots and bad files: the honeypot stores nothing, EICAR is refused, oversize and bad fields fail validation', async () => {
    send.mockClear();
    await apply({ email: `bot-${run}@x.test`, website: 'http://spam.example', consents: [{ purpose: 'application', version: 2 }] }).expect(201).expect({ received: true });
    expect(send).not.toHaveBeenCalled();
    await apply({ email: `virus-${run}@x.test`, resumeBase64: Buffer.from(`%PDF-1.7\n${EICAR}`).toString('base64'), consents: [{ purpose: 'application', version: 2 }] }).expect(400);
    expect(await inA((tx) => tx.candidate.count({ where: { email: { in: [`bot-${run}@x.test`, `virus-${run}@x.test`] } } }))).toBe(0);

    await apply({ email: `x-${run}@x.test`, name: '<img src=x onerror=alert(1)>', consents: [{ purpose: 'application', version: 2 }] }).expect(400);
    await apply({ email: 'not-an-email', consents: [{ purpose: 'application', version: 2 }] }).expect(400);
    await apply({ email: `x-${run}@x.test`, phone: '555; DROP', consents: [{ purpose: 'application', version: 2 }] }).expect(400);
    await apply({ email: `x-${run}@x.test`, consents: [{ purpose: 'application', version: 2 }], extra: 'no' }).expect(400);
  });

  it('a résumé that has not passed the virus check cannot be opened by recruiters', async () => {
    const c = await inA((tx) => tx.candidate.findFirstOrThrow({ where: { email: `asha-${run}@x.test` } }));
    await inA((tx) => tx.candidateProfile.update({ where: { candidateId: c.id }, data: { resumeScan: 'pending' } }));
    await api('A', 'get', `/candidates/${c.id}/resume`).expect(409);
    await inA((tx) => tx.candidateProfile.update({ where: { candidateId: c.id }, data: { resumeScan: 'clean' } }));
  });

  it('posting costs belong to a board of the same company (AT-3.04)', async () => {
    const board = (await api('A', 'post', '/organizations/job-boards').send({ name: `Naukri ${run}` }).expect(201)).body;
    await api('A', 'post', '/hiring/costs').send({ jobBoardId: board.id, jobId: ids.job, amount: 4500, currency: 'inr' }).expect(400);
    await api('B', 'post', '/hiring/costs').send({ jobBoardId: board.id, amount: 4500, currency: 'INR' }).expect(404);
    const cost = (await api('A', 'post', '/hiring/costs').send({ jobBoardId: board.id, jobId: ids.job, amount: 4500, currency: 'INR' }).expect(201)).body;
    expect(cost).toMatchObject({ costType: 'posting', source: `Naukri ${run}`, currency: 'INR' });
    expect((await api('A', 'get', '/hiring/costs').expect(200)).body).toHaveLength(1);
    expect((await api('B', 'get', '/hiring/costs').expect(200)).body).toHaveLength(0);
  });

  it('a closed job drops out of the careers site and the sitemap at once (S9)', async () => {
    await api('A', 'patch', `/jobs/${ids.job}`).send({ status: 'closed' }).expect(200);
    await pub('get', `/careers/${org.A.slug}/jobs/${ids.slug}`).expect(404);
    expect((await pub('get', `/careers/${org.A.slug}/sitemap`).expect(200)).body.jobs).toEqual([]);
    expect((await pub('get', `/careers/${org.A.slug}`).expect(200)).body.jobs).toEqual([]);
  });
});
