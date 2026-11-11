process.env.SD_SCANNER = 'dev-fake';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { addMonthsIso } from '../src/service-desk/kb.service';

// HLP-04 Knowledge base editor (Helpdesk design wiring, round 4), end to end against the real database (forced RLS, app
// role): the design's "Also suggest for these words" (keywords, found by search) and "Use in assistant answers", and
// "Mark reviewed" on a review-due article. Positive and negative: the employee, a knowledge author (agent), a publisher
// (lead), a desk admin (reads only), another company, bad input, a stale version.
describe('Service Desk HLP-04 Knowledge base editor: keywords, assistant use, mark reviewed', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const fakeBlobs = createFakeBlobStorage();
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'agent' | 'lead' | 'deskAdmin' | 'divya' | 'agentB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'patch' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const asA = (): TenantContext => ({ organizationId: org.A.id, isSuperAdmin: false, userId: null });
  const article = async (who: Who = 'agent') => (await api(who, 'get', `/desk/kb/articles/${ids.art}`).expect(200)).body as { version: number; keywords: string | null; assistantUse: boolean; reviewDueOn: string | null; state: string; pages: string[] };
  const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn().mockResolvedValue({ success: true }) })
      .overrideProvider(BlobStorageService)
      .useValue(fakeBlobs)
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    planId = (await prisma.plan.create({ data: { name: `hlp04-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HLP04 Org ${k}`, slug: `hlp04-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = async (o: string, key: string) =>
      (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${key}-${run}-${randomUUID().slice(0, 4)}`, permissionsJson: JSON.stringify(ROLE_TEMPLATES.find((t) => t.key === key)!.permissions) } }))).id;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['agent', 'A', 'panel', 'desk_agent'],
      ['lead', 'A', 'panel', 'desk_lead'],
      ['deskAdmin', 'A', 'panel', 'desk_admin'],
      ['divya', 'A', 'panel', null],
      ['agentB', 'B', 'panel', 'desk_agent'],
    ];
    for (const [who, k, role, tpl] of roster) {
      const o = org[k].id;
      const permissionProfileId = tpl ? await profile(o, tpl) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}-${run}@hlp04.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}-${run}@hlp04.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await tenantPrisma.forTenant(asA(), async (tx) => {
      const p = await tx.person.create({ data: { organizationId: org.A.id, givenName: 'Divya', primaryEmail: `divya-${run}@hlp04.test` } });
      await tx.personRole.create({ data: { organizationId: org.A.id, personId: p.id, roleType: 'login', sourceTable: 'users', sourceId: users.divya, startOn: new Date('2026-01-01') } });
    });
    ids.desk = (await api('adminA', 'post', '/desk/desks').send({ name: 'IT help desk', key: 'IT', kind: 'it' }).expect(201)).body.id;
    for (const [who, role] of [['agent', 'agent'], ['lead', 'lead'], ['deskAdmin', 'admin']] as const) await api('adminA', 'post', `/desk/desks/${ids.desk}/members`).send({ userId: users[who], role }).expect(201);
    const deskB = (await api('adminB', 'post', '/desk/desks').send({ name: 'B IT', key: 'BIT', kind: 'it' }).expect(201)).body.id;
    await api('adminB', 'post', `/desk/desks/${deskB}/members`).send({ userId: users.agentB, role: 'agent' }).expect(201);
    ids.space = (await api('deskAdmin', 'post', '/desk/kb/spaces').send({ deskId: ids.desk, name: 'IT help', slug: 'it-help', audience: 'requesters' }).expect(201)).body.id;
    ids.art = (await api('agent', 'post', '/desk/kb/articles').send({ spaceId: ids.space, title: `Connect to the office network ${run}`, bodyHtml: '<p>Install the client from the company portal.</p>' }).expect(201)).body.id;
  });

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
        await tx.user.deleteMany({ where: { id: { in: all } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('a new article is on for the assistant and has no keywords', async () => {
    expect(await article()).toMatchObject({ keywords: null, assistantUse: true, state: 'draft' });
  });

  it('an author sets the keywords (cleaned: trimmed, no repeats) and turns assistant use off; it is audited', async () => {
    const { version } = await article();
    await api('agent', 'patch', `/desk/kb/articles/${ids.art}`).send({ version, keywords: ' zebrafish ,  remote   access, ZEBRAFISH,, ', assistantUse: false }).expect(200);
    expect(await article()).toMatchObject({ keywords: 'zebrafish, remote access', assistantUse: false });
    const log = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'desk.kb.article_details_changed', entityId: ids.art } }));
    expect(log.length).toBeGreaterThan(0);
  });

  it('bad keywords and a bad switch value are refused; a stale version is a conflict', async () => {
    const { version } = await article();
    await api('agent', 'patch', `/desk/kb/articles/${ids.art}`).send({ version, keywords: '<script>x()</script>' }).expect(400);
    await api('agent', 'patch', `/desk/kb/articles/${ids.art}`).send({ version, keywords: 'a'.repeat(301) }).expect(400);
    await api('agent', 'patch', `/desk/kb/articles/${ids.art}`).send({ version, assistantUse: 'yes' }).expect(400);
    await api('agent', 'patch', `/desk/kb/articles/${ids.art}`).send({ version: version - 1, keywords: 'vpn' }).expect(409);
  });

  it('who may change them: not a desk admin who only reads, not the employee, not another company', async () => {
    const { version } = await article();
    await api('deskAdmin', 'get', `/desk/kb/articles/${ids.art}`).expect(200);
    await api('deskAdmin', 'patch', `/desk/kb/articles/${ids.art}`).send({ version, keywords: 'x' }).expect(403);
    await api('divya', 'patch', `/desk/kb/articles/${ids.art}`).send({ version, keywords: 'x' }).expect(403);
    expect((await api('agentB', 'patch', `/desk/kb/articles/${ids.art}`).send({ version, keywords: 'x' })).status).toBe(404);
    expect((await article()).keywords).toBe('zebrafish, remote access');
  });

  it('"Mark reviewed" needs a published article', async () => {
    const { version } = await article();
    await api('agent', 'post', `/desk/kb/articles/${ids.art}/reviewed`).send({ version }).expect(400);
  });

  it('once published, the employee finds it by a keyword that is not in the title or text', async () => {
    await api('agent', 'post', `/desk/kb/articles/${ids.art}/submit`).send({ version: 1 }).expect(200);
    await api('lead', 'post', `/desk/kb/articles/${ids.art}/review`).send({ version: 1, approve: true }).expect(200);
    const found = (await api('divya', 'get', '/desk/my/kb/suggest?q=zebrafish').expect(200)).body as { title: string }[];
    expect(found.map((x) => x.title)).toContain(`Connect to the office network ${run}`);
  });

  it('an author marks a published article reviewed: the next check is 12 months on (the default); audited with before and after', async () => {
    const before = await article();
    await tenantPrisma.forTenant(SUPER, (tx) => tx.sdKbArticle.update({ where: { id: ids.art }, data: { reviewDueOn: new Date('2026-01-01T00:00:00Z') } }));
    expect((await api('agent', 'get', `/desk/kb/articles?spaceId=${ids.space}`).expect(200)).body.find((r: { id: string }) => r.id === ids.art).reviewOverdue).toBe(true);
    const r = (await api('agent', 'post', `/desk/kb/articles/${ids.art}/reviewed`).send({ version: before.version }).expect(200)).body as { reviewDueOn: string };
    expect(r.reviewDueOn).toBe(addMonthsIso(today, 12));
    const after = await article();
    expect(after.reviewDueOn?.slice(0, 10)).toBe(r.reviewDueOn);
    expect(after.version).toBe(before.version + 1);
    const log = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'desk.kb.article_reviewed', entityId: ids.art } }));
    expect(log).toHaveLength(1);
    expect(JSON.parse(log[0].metadataJson ?? '{}')).toMatchObject({ before: '2026-01-01', after: r.reviewDueOn });
  });

  it('"Mark reviewed" refused: a stale version, a desk admin, the employee, another company, bad input, nobody signed in', async () => {
    const { version } = await article();
    await api('agent', 'post', `/desk/kb/articles/${ids.art}/reviewed`).send({ version: version - 1 }).expect(409);
    await api('deskAdmin', 'post', `/desk/kb/articles/${ids.art}/reviewed`).send({ version }).expect(403);
    await api('divya', 'post', `/desk/kb/articles/${ids.art}/reviewed`).send({ version }).expect(403);
    expect((await api('agentB', 'post', `/desk/kb/articles/${ids.art}/reviewed`).send({ version })).status).toBe(404);
    await api('agent', 'post', `/desk/kb/articles/${ids.art}/reviewed`).send({ version: 'two' }).expect(400);
    await api('agent', 'post', '/desk/kb/articles/not-a-uuid/reviewed').send({ version }).expect(400);
    await request(server()).post(`/api/v1/desk/kb/articles/${ids.art}/reviewed`).send({ version }).expect(401);
    // A publisher may mark it reviewed too.
    await api('lead', 'post', `/desk/kb/articles/${ids.art}/reviewed`).send({ version }).expect(200);
  });

  // Founder 3 Nov 2026: the review interval is a company setting (registry desk.kb.review_months, default 12).
  describe('the article review interval (company setting)', () => {
    it('reads 12 months by default for anyone who reads knowledge', async () => {
      expect((await api('agent', 'get', '/desk/kb/settings').expect(200)).body).toMatchObject({ reviewMonths: 12, choices: [3, 6, 12, 24], defaultMonths: 12 });
      await api('divya', 'get', '/desk/kb/settings').expect(403);
    });

    it('the Service Desk owner sets 6 months: audited; Mark reviewed and a new article follow it', async () => {
      expect((await api('adminA', 'put', '/desk/kb/settings').send({ reviewMonths: 6 }).expect(200)).body.reviewMonths).toBe(6);
      const log = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'desk.kb.settings_changed' } }));
      expect(log).toHaveLength(1);
      expect(JSON.parse(log[0].metadataJson ?? '{}')).toMatchObject({ reviewMonths: { from: 12, to: 6 } });
      const { version } = await article();
      const r = (await api('agent', 'post', `/desk/kb/articles/${ids.art}/reviewed`).send({ version }).expect(200)).body;
      expect(r.reviewDueOn).toBe(addMonthsIso(today, 6));
      const fresh = (await api('agent', 'post', '/desk/kb/articles').send({ spaceId: ids.space, title: `Printer jams ${run}`, bodyHtml: '<p>Open tray 2.</p>' }).expect(201)).body.id;
      expect((await api('agent', 'get', `/desk/kb/articles/${fresh}`).expect(200)).body.reviewDueOn.slice(0, 10)).toBe(addMonthsIso(today, 6));
    });

    it('the registry screen (Settings) changes the same value', async () => {
      await api('adminA', 'put', '/org/settings').send({ key: 'desk.kb.review_months', scopeType: 'tenant', value: '24' }).expect(200);
      expect((await api('agent', 'get', '/desk/kb/settings').expect(200)).body.reviewMonths).toBe(24);
      await api('adminA', 'put', '/org/settings').send({ key: 'desk.kb.review_months', scopeType: 'tenant', value: '7' }).expect(400);
    });

    it('refused: a value not offered, text, nothing; an agent, a desk admin, the employee; nobody signed in', async () => {
      for (const bad of [{ reviewMonths: 7 }, { reviewMonths: '6' }, { reviewMonths: 0 }, {}, { reviewMonths: 6, extra: true }]) await api('adminA', 'put', '/desk/kb/settings').send(bad).expect(400);
      for (const who of ['agent', 'deskAdmin', 'divya'] as const) await api(who, 'put', '/desk/kb/settings').send({ reviewMonths: 3 }).expect(403);
      await request(server()).put('/api/v1/desk/kb/settings').send({ reviewMonths: 3 }).expect(401);
      expect((await api('agent', 'get', '/desk/kb/settings').expect(200)).body.reviewMonths).toBe(24);
    });

    it('another company is untouched (still 12), and its owner changes only its own', async () => {
      expect((await api('agentB', 'get', '/desk/kb/settings').expect(200)).body.reviewMonths).toBe(12);
      await api('adminB', 'put', '/desk/kb/settings').send({ reviewMonths: 3 }).expect(200);
      expect((await api('agent', 'get', '/desk/kb/settings').expect(200)).body.reviewMonths).toBe(24);
      expect((await api('agentB', 'get', '/desk/kb/settings').expect(200)).body.reviewMonths).toBe(3);
    });
  });

  describe('Help H-1 (answer 942): the Help drawer "This page" tab lists the articles tagged with the page', () => {
    const title = `Connect to the office network ${run}`;
    const page = (who: Who, route: string) => api(who, 'get', `/desk/my/kb/page?route=${encodeURIComponent(route)}`);
    it('an author tags the published article with pages (cleaned of repeats); bad pages are refused', async () => {
      const { version } = await article();
      for (const pages of [['https://example.com/leave'], ['/yx/Time'], ['yx/time'], Array.from({ length: 21 }, (_, i) => `/yx/p${i}`), '/yx/time']) await api('agent', 'patch', `/desk/kb/articles/${ids.art}`).send({ version, pages }).expect(400);
      await api('divya', 'patch', `/desk/kb/articles/${ids.art}`).send({ version, pages: ['/yx/time/leave'] }).expect(403);
      await api('agent', 'patch', `/desk/kb/articles/${ids.art}`).send({ version, pages: ['/yx/time/leave', '/yx/me/pay'] }).expect(200);
      expect((await article()).pages).toEqual(['/yx/time/leave', '/yx/me/pay']);
    });
    it('the employee sees it on the page and every page under it, not elsewhere; another company never', async () => {
      for (const route of ['/yx/time/leave', '/yx/time/leave/apply', '/yx/me/pay']) expect((await page('divya', route).expect(200)).body).toEqual({ on: true, articles: [expect.objectContaining({ title, number: expect.any(Number) })] });
      for (const route of ['/yx/time', '/yx/time/leaves', '/yx/payroll']) expect((await page('divya', route).expect(200)).body).toEqual({ on: true, articles: [] });
      expect((await page('adminB', '/yx/time/leave').expect(200)).body).toEqual({ on: true, articles: [] });
      for (const bad of ['https://example.com', '/yx/Time', '/yx/time?x=1', '']) await page('divya', bad).expect(400);
      await api('divya', 'get', '/desk/my/kb/page').expect(400);
      await request(server()).get('/api/v1/desk/my/kb/page?route=%2Fyx%2Ftime%2Fleave').expect(401);
    });
    it('"Show page help" is on by default; the Service Desk owner turns it off (audited) and nobody gets page help; others may not', async () => {
      expect((await api('agent', 'get', '/desk/kb/settings').expect(200)).body.pageHelp).toBe(true);
      for (const who of ['agent', 'deskAdmin', 'divya'] as const) await api(who, 'put', '/desk/kb/settings').send({ pageHelp: false }).expect(403);
      await api('adminA', 'put', '/desk/kb/settings').send({ pageHelp: 'no' }).expect(400);
      const r = (await api('adminA', 'put', '/desk/kb/settings').send({ pageHelp: false }).expect(200)).body;
      expect(r).toMatchObject({ pageHelp: false, reviewMonths: 24 });
      expect((await page('divya', '/yx/time/leave').expect(200)).body).toEqual({ on: false, articles: [] });
      expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'desk.kb.settings_changed', entityId: 'help.page_help' } }))).toBe(1);
      // Another company keeps its own (on).
      expect((await api('agentB', 'get', '/desk/kb/settings').expect(200)).body.pageHelp).toBe(true);
      await api('adminA', 'put', '/desk/kb/settings').send({ pageHelp: true }).expect(200);
      expect((await page('divya', '/yx/time/leave').expect(200)).body.articles).toHaveLength(1);
    });
    it('answer 964: in the person language when a published translation exists; English or a missing translation shows the original', async () => {
      await api('deskAdmin', 'patch', `/desk/kb/spaces/${ids.space}`).send({ name: 'IT help', slug: 'it-help', audience: 'requesters', languages: ['en', 'ta'] }).expect(200);
      const ta = (await api('agent', 'post', '/desk/kb/articles').send({ spaceId: ids.space, language: 'ta', translationOfId: ids.art, title: `அலுவலக வலையமைப்பு ${run}`, bodyHtml: '<p>நிறுவன தளத்திலிருந்து நிறுவவும்.</p>' }).expect(201)).body.id as string;
      const inLang = (lang: string) => api('divya', 'get', `/desk/my/kb/page?route=${encodeURIComponent('/yx/time/leave')}&lang=${lang}`);
      // A draft translation is not shown yet.
      expect((await inLang('ta').expect(200)).body.articles).toEqual([expect.objectContaining({ title })]);
      await api('agent', 'post', `/desk/kb/articles/${ta}/submit`).send({ version: 1 }).expect(200);
      await api('lead', 'post', `/desk/kb/articles/${ta}/review`).send({ version: 1, approve: true }).expect(200);
      expect((await inLang('ta').expect(200)).body.articles).toEqual([expect.objectContaining({ id: ta, title: `அலுவலக வலையமைப்பு ${run}` })]);
      for (const lang of ['en', 'hi']) expect((await inLang(lang).expect(200)).body.articles).toEqual([expect.objectContaining({ id: ids.art, title })]);
      await inLang('fr').expect(400);
    });
  });
});
