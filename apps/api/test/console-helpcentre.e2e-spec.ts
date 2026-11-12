import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';
import { seedYukthixSupport } from '../prisma/seed-service-desk-knowledge';
import { giveStaffRoles, rolesWithout } from './fixtures/staff-roles';

// Console C-8, YX-11 (answer 1057), against the real database (forced RLS, app role). YukthiX staff write help articles
// every company sees in Help › This page; one staff member writes, a different one publishes; a company's own article
// for a page wins; the no-result searches are counts only and hide terms fewer than 5 companies searched.
describe('Console C-8 YX-11: help-centre editor', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const org: Record<string, string> = {};
  const slug: Record<string, string> = {};
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  const consoleUsers: string[] = [];
  let platform: string;
  let planId: string;
  let articleId: string;
  const PAGE = `/yx/c8h${run}`;
  const api = (who: string, method: 'get' | 'post' | 'put' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who] ?? who}`);
  const asPlatform = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) =>
    tenantPrisma.forTenant({ organizationId: platform, isSuperAdmin: false }, async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
      return fn(tx);
    });
  // Staff roles (answer 1058): staff without a key = without every role that holds it (restored straight after).
  const withoutKey = async (key: string, fn: () => Promise<void>) => {
    const keep = await rolesWithout(key);
    for (const who of ['staffA', 'staffB']) await giveStaffRoles(users[who]!, keep);
    try {
      await fn();
    } finally {
      for (const who of ['staffA', 'staffB']) await giveStaffRoles(users[who]!);
    }
  };
  const article = { title: `Apply for leave ${run}`, summary: 'Pick the days and the type.', bodyHtml: '<p>Open Time › Leave and press Apply.</p>', pages: [PAGE] };

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      const trial = (await tx.plan.findFirst({ where: { name: 'trial' } })) ?? (await tx.plan.create({ data: { name: 'trial', candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } }));
      // The YukthiX company comes from the seed, which needs its staff account and the demo company (a fresh database
      // has neither): made here as service-desk-batch4 does.
      if (!(await tx.user.findFirst({ where: { email: 'super@platform.test', organizationId: null } }))) await tx.user.create({ data: { email: 'super@platform.test', passwordHash, role: 'super_admin', organizationId: null, name: 'Anand Iyer' } });
      if (!(await tx.organization.findUnique({ where: { slug: 'demo-org' } }))) await tx.organization.create({ data: { name: 'Kaveri Foods', slug: 'demo-org', planId: trial.id } });
      await seedYukthixSupport(tx, trial.id);
    });
    platform = (await prisma.organization.findFirstOrThrow({ where: { isPlatform: true }, select: { id: true } })).id;
    // Staff: A writes, B publishes, Unlinked has no YukthiX-company user, NoKey never stepped up (no security key).
    for (const who of ['staffA', 'staffB', 'staffUnlinked', 'staffNoKey']) {
      const email = `${who.toLowerCase()}-${run}@platform.test`;
      users[who] = (await tenantPrisma.forTenant(SUPER, (tx) => tx.user.create({ data: { email, name: `Staff ${who}`, passwordHash, role: 'super_admin', organizationId: null } }))).id;
      // Staff roles (answer 1058): the console keys come from staff roles.
      await giveStaffRoles(users[who]!);
      token[who] = (await request(server()).post('/api/v1/auth/platform/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
      if (who !== 'staffNoKey') await markSteppedUp(tenantPrisma, token[who]);
    }
    for (const who of ['staffA', 'staffB']) {
      await asPlatform(async (tx) => {
        const u = await tx.user.create({ data: { organizationId: platform, email: `${who.toLowerCase()}-${run}@yukthix.test`, name: `Agent ${who}`, passwordHash: '!console-only', role: 'panel', status: 'console_only' } });
        consoleUsers.push(u.id);
        await tx.sdConsoleAgent.create({ data: { organizationId: platform, staffUserId: users[who], userId: u.id } });
      });
    }
    // Six companies: A and B sign in; all six search the help centre (for the no-result counts).
    planId = (await prisma.plan.create({ data: { name: `c8h-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B', 'C', 'D', 'E', 'F']) {
      slug[k] = `c8h-${k.toLowerCase()}-${run}`;
      org[k] = (await prisma.organization.create({ data: { name: `C8H Company ${k} ${run}`, slug: slug[k], planId } })).id;
    }
    for (const k of ['A', 'B']) {
      const at = { organizationId: org[k], isSuperAdmin: false };
      const email = `admin-${k.toLowerCase()}-${run}@c8h.test`;
      users[`admin${k}`] = (await tenantPrisma.forTenant(at, (tx) => tx.user.create({ data: { organizationId: org[k], email, passwordHash, role: 'org_admin' } }))).id;
      token[`admin${k}`] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug[k], email, password: PASSWORD }).expect(200)).body.accessToken;
    }
  }, 180_000);

  afterAll(async () => {
    await asPlatform(async (tx) => {
      const arts = await tx.sdKbArticle.findMany({ where: { organizationId: platform, title: { contains: run } }, select: { id: true } });
      const ids = arts.map((a) => a.id);
      await tx.sdKbArticleVersion.deleteMany({ where: { organizationId: platform, articleId: { in: ids } } });
      await tx.sdKbArticle.deleteMany({ where: { organizationId: platform, id: { in: ids } } });
      await tx.sdConsoleAgent.deleteMany({ where: { organizationId: platform, userId: { in: consoleUsers } } });
    }).catch((e) => console.warn('platform cleanup', e));
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const ids = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: ids } } });
        await tx.session.deleteMany({ where: { userId: { in: ids } } });
        await tx.organization.deleteMany({ where: { id: { in: Object.values(org) } } });
        await tx.user.deleteMany({ where: { id: { in: [users.staffA, users.staffB, users.staffUnlinked, users.staffNoKey] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  describe('who may use it', () => {
    it('a company admin and no sign-in are refused', async () => {
      await api('adminA', 'get', '/platform/help-centre').expect(403);
      await api('adminA', 'post', '/platform/help-centre/articles').send(article).expect(403);
      await request(server()).get('/api/v1/platform/help-centre').expect(401);
    });

    it('staff without their security key are refused', async () => {
      expect((await api('staffNoKey', 'get', '/platform/help-centre').expect(403)).body.code).toBe('MFA_REQUIRED');
    });

    it('staff without the help-centre key are refused', async () => {
      await withoutKey('platform.helpcentre.write', async () => {
        await api('staffA', 'get', '/platform/help-centre').expect(403);
        await api('staffA', 'post', '/platform/help-centre/articles').send(article).expect(403);
      });
    });

    it('staff not linked to the YukthiX company are told to ask the support lead', async () => {
      expect((await api('staffUnlinked', 'get', '/platform/help-centre').expect(403)).body.message).toMatch(/not linked to the YukthiX company/);
    });

    it('the key is a platform key: no company role holds it; staff hold it through the Support agent role', async () => {
      const rows = await tenantPrisma.forTenant(SUPER, (tx) => tx.rolePermission.findMany({ where: { permission: { key: 'platform.helpcentre.write' } }, select: { role: true } }));
      expect(rows).toEqual([]);
      expect(await rolesWithout('platform.helpcentre.write')).toEqual(['customer_success', 'rules_editor', 'finance', 'security_lead']);
    });
  });

  describe('one writes, another publishes', () => {
    it('bad input is refused with plain messages', async () => {
      await api('staffA', 'post', '/platform/help-centre/articles').send({ ...article, pages: [] }).expect(400);
      expect((await api('staffA', 'post', '/platform/help-centre/articles').send({ ...article, pages: ['/time/leave'] }).expect(400)).body.message.join(' ')).toMatch(/app addresses/);
    });

    it('staff A writes an article for a page and sends it for review', async () => {
      const made = (await api('staffA', 'post', '/platform/help-centre/articles').send(article).expect(201)).body;
      articleId = made.id;
      expect(made).toMatchObject({ title: article.title, pages: [PAGE], state: 'draft' });
      const v = made.versions[0].version;
      const sent = (await api('staffA', 'post', `/platform/help-centre/articles/${articleId}/submit`).send({ version: v }).expect(200)).body;
      expect(sent.state).toBe('in_review');
      const list = (await api('staffB', 'get', '/platform/help-centre').expect(200)).body;
      expect(list.articles.find((r: { id: string }) => r.id === articleId)).toMatchObject({ pages: [PAGE], state: 'in_review', publishedAt: null });
    });

    it('staff A cannot publish their own article', async () => {
      const d = (await api('staffA', 'get', `/platform/help-centre/articles/${articleId}`).expect(200)).body;
      expect(d.versions[0].mine).toBe(true);
      await api('staffA', 'post', `/platform/help-centre/articles/${articleId}/review`).send({ version: d.versions[0].version, approve: true }).expect(403);
    });

    it('sending back needs a note', async () => {
      const d = (await api('staffB', 'get', `/platform/help-centre/articles/${articleId}`).expect(200)).body;
      expect(d.versions[0].mine).toBe(false);
      expect((await api('staffB', 'post', `/platform/help-centre/articles/${articleId}/review`).send({ version: d.versions[0].version, approve: false }).expect(400)).body.message).toMatch(/Say what to change/);
    });

    it('staff B publishes it, and every step is audited', async () => {
      const d = (await api('staffB', 'get', `/platform/help-centre/articles/${articleId}`).expect(200)).body;
      const done = (await api('staffB', 'post', `/platform/help-centre/articles/${articleId}/review`).send({ version: d.versions[0].version, approve: true }).expect(200)).body;
      expect(done.state).toBe('published');
      expect(done.publicUrl).toMatch(/\/yx\/help\/[^/]+\/yukthix-help\//);
      const actions = (await asPlatform((tx) => tx.auditLog.findMany({ where: { entityId: articleId }, select: { action: true } }))).map((r) => r.action);
      expect(actions).toEqual(expect.arrayContaining(['desk.kb.article_submitted', 'desk.kb.article_approved', 'desk.kb.article_published']));
    });
  });

  describe('what companies see', () => {
    it('every company sees the YukthiX article in Help › This page, with its address', async () => {
      for (const who of ['adminA', 'adminB']) {
        const page = (await api(who, 'get', `/desk/my/kb/page?route=${encodeURIComponent(`${PAGE}/apply`)}`).expect(200)).body;
        expect(page.articles).toEqual([expect.objectContaining({ id: articleId, source: 'yukthix', href: expect.stringMatching(/^\/yx\/help\/[^/]+\/yukthix-help\//) })]);
      }
    });

    it("a company's own article for the page wins", async () => {
      await tenantPrisma.forTenant({ organizationId: org.A, isSuperAdmin: false }, async (tx) => {
        const s = await tx.sdKbSpace.create({ data: { organizationId: org.A, slug: `own-${run}`, name: 'Our help', audience: 'requesters', languages: ['en'] } });
        await tx.sdKbArticle.create({ data: { organizationId: org.A, spaceId: s.id, number: 1, slug: 'our-leave', audience: 'requesters', state: 'published', title: `Our leave rules ${run}`, pages: [PAGE], publishedVersion: 1, publishedAt: new Date() } });
      });
      const a = (await api('adminA', 'get', `/desk/my/kb/page?route=${encodeURIComponent(PAGE)}`).expect(200)).body;
      expect(a.articles.map((x: { title: string }) => x.title)).toEqual([`Our leave rules ${run}`]);
      const b = (await api('adminB', 'get', `/desk/my/kb/page?route=${encodeURIComponent(PAGE)}`).expect(200)).body;
      expect(b.articles.map((x: { id: string }) => x.id)).toEqual([articleId]);
    });

    it("a company cannot read or write the YukthiX company's articles directly (RLS)", async () => {
      const seen = await tenantPrisma.forTenant({ organizationId: org.A, isSuperAdmin: false }, (tx) => tx.sdKbArticle.findMany({ where: { organizationId: platform } }));
      expect(seen).toEqual([]);
      await expect(tenantPrisma.forTenant({ organizationId: org.A, isSuperAdmin: false }, (tx) => tx.sdKbArticle.updateMany({ where: { id: articleId }, data: { title: 'Hacked' } }))).resolves.toEqual({ count: 0 });
    });
  });

  // Answer 1203: retiring a published YukthiX article takes two staff members, as publishing does; it leaves every drawer.
  describe('retiring an article', () => {
    it('needs a reason; the writer of the request cannot approve it; another staff member retires it, audited', async () => {
      await api('staffA', 'post', `/platform/help-centre/articles/${articleId}/retire`).send({ reason: 'x' }).expect(400);
      const asked = (await api('staffA', 'post', `/platform/help-centre/articles/${articleId}/retire`).send({ reason: 'Replaced by the new leave guide' }).expect(200)).body;
      expect(asked).toMatchObject({ state: 'published', retire: { mine: true, reason: 'Replaced by the new leave guide' } });
      await api('staffA', 'post', `/platform/help-centre/articles/${articleId}/retire`).send({ reason: 'Asking a second time' }).expect(409);
      // Still in the drawer until the second person approves.
      expect((await api('adminB', 'get', `/desk/my/kb/page?route=${encodeURIComponent(PAGE)}`).expect(200)).body.articles.map((x: { id: string }) => x.id)).toContain(articleId);
      expect((await api('staffA', 'post', `/platform/help-centre/articles/${articleId}/retire/approve`).send({}).expect(403)).body.message).toMatch(/another staff member/);
      // Answer 1263: only the person who asked withdraws; a withdrawn request can never be approved.
      await api('staffB', 'post', `/platform/help-centre/articles/${articleId}/retire/withdraw`).send({}).expect(403);
      expect((await api('staffA', 'post', `/platform/help-centre/articles/${articleId}/retire/withdraw`).send({}).expect(200)).body).toMatchObject({ state: 'published', retire: null });
      await api('staffB', 'post', `/platform/help-centre/articles/${articleId}/retire/approve`).send({}).expect(404);
      await api('staffA', 'post', `/platform/help-centre/articles/${articleId}/retire/withdraw`).send({}).expect(404);
      // Asked again, then retired by the second person.
      await api('staffA', 'post', `/platform/help-centre/articles/${articleId}/retire`).send({ reason: 'Replaced by the new leave guide' }).expect(200);
      const done = (await api('staffB', 'post', `/platform/help-centre/articles/${articleId}/retire/approve`).send({}).expect(200)).body;
      expect(done).toMatchObject({ state: 'retired', retire: null });
      await api('staffB', 'post', `/platform/help-centre/articles/${articleId}/retire/approve`).send({}).expect(404);
      const actions = (await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { entityId: articleId, action: { startsWith: 'platform.helpcentre.retire' } }, select: { action: true } }))).map((x) => x.action).sort();
      expect(actions).toEqual(['platform.helpcentre.retire_requested', 'platform.helpcentre.retire_requested', 'platform.helpcentre.retire_withdrawn', 'platform.helpcentre.retired']);
    });

    it('a retired article is gone from every company’s Help drawer; only a published article can be retired', async () => {
      for (const who of ['adminA', 'adminB']) {
        const page = (await api(who, 'get', `/desk/my/kb/page?route=${encodeURIComponent(`${PAGE}/apply`)}`).expect(200)).body;
        expect(page.articles.map((x: { id: string }) => x.id)).not.toContain(articleId);
      }
      await api('staffA', 'post', `/platform/help-centre/articles/${articleId}/retire`).send({ reason: 'Already retired' }).expect(409);
    });
  });

  describe('searches with no result (counts only)', () => {
    const FIVE = `c8h five ${run}`;
    const FOUR = `c8h four ${run}`;
    beforeAll(async () => {
      for (const [i, k] of ['A', 'B', 'C', 'D', 'E', 'F'].entries()) {
        await tenantPrisma.forTenant({ organizationId: org[k], isSuperAdmin: false }, async (tx) => {
          if (i < 5) await tx.sdKbEvent.create({ data: { organizationId: org[k], kind: 'search', source: 'drawer', query: FIVE, results: 0 } });
          if (i < 4) await tx.sdKbEvent.create({ data: { organizationId: org[k], kind: 'search', source: 'drawer', query: FOUR, results: 0 } });
        });
      }
    });

    it('shows a term at least 5 companies searched, as counts; hides a term only 4 searched', async () => {
      const gaps = (await api('staffA', 'get', '/platform/help-centre').expect(200)).body.gaps as Record<string, unknown>[];
      expect(gaps.find((g) => g.query === FIVE)).toEqual({ query: FIVE, companies: 5, times: 5 });
      expect(gaps.find((g) => g.query === FOUR)).toBeUndefined();
      for (const g of gaps) expect(Object.keys(g).sort()).toEqual(['companies', 'query', 'times']);
    });

    it('the cross-company read is audited with its purpose', async () => {
      const rows = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { actorUserId: users.staffA, action: 'platform.cross_tenant_read' } }));
      expect(rows.some((r) => (r.metadataJson ?? '').includes('helpcentre.no_result_searches'))).toBe(true);
    });

    // Answer 1261: the settings change only on Console › Platform settings (security key and a reason), within range.
    it('the old direct save is refused; Platform settings keeps the minimum at 5 companies and the page shows the value', async () => {
      await api('staffA', 'put', '/platform/help-centre/settings').send({ values: { 'helpcentre.gaps_days': 30 } }).expect(404);
      await markSteppedUp(tenantPrisma, token.staffA!);
      const set = (key: string, value: string) => api('staffA', 'put', `/platform/settings/${key}`).send({ value, reason: 'Testing the no-result searches' });
      await set('helpcentre.gaps_min_companies', '4').expect(400);
      await set('helpcentre.gaps_days', '45').expect(200);
      const shown = (await api('staffA', 'get', '/platform/help-centre').expect(200)).body.settings as { key: string; value: number; default: number; min: number }[];
      expect(shown.find((s) => s.key === 'helpcentre.gaps_days')).toMatchObject({ value: 45, default: 30 });
      expect(shown.find((s) => s.key === 'helpcentre.gaps_min_companies')).toMatchObject({ value: 5, default: 5, min: 5 });
      await set('helpcentre.gaps_days', '30').expect(200);
    });
  });
});
