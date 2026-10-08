process.env.SD_SCANNER = 'dev-fake';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { mountInboundMailBody } from '../src/service-desk/channels.controller';
import { SurveysService } from '../src/service-desk/surveys.service';
import { KbService } from '../src/service-desk/kb.service';
import { seedYukthixSupport } from '../prisma/seed-service-desk-knowledge';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';

// M14 Service Desk, phase 3b-1 batch 4 (SD-1.24 … SD-1.27, SD-1.29 … SD-1.31), end to end against the real database
// (forced RLS, the reader and portal policies, the app role, the SECURITY DEFINER bridge functions) and Redis.
// Covers: two-company isolation of every new table, knowledge audiences in the service AND in SQL, four eyes, old
// addresses, CSAT single-use links, NPS, reports, SCIM authentication and seat mapping, privacy erasure, the YukthiX
// support functions (cannot read or write anything else), the console queue and "Request access".
describe('Service Desk batch 4: knowledge, ratings, reports, directory, privacy, YukthiX support', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let owner: PrismaClient;
  const fakeBlobs = createFakeBlobStorage();
  const sent: { to: string; subject: string; html: string; text?: string; attachments?: { filename: string; content: Buffer }[] }[] = [];
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  let platform = '';
  type Who = 'adminA' | 'adminB' | 'agent' | 'lead' | 'author2' | 'deskAdmin' | 'divya' | 'agentB' | 'staff' | 'staffOther';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const system = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>, o = org.A.id) =>
    tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
      return fn(tx);
    });
  const STAFF_DOMAIN = `sd4-${run}.test`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn(async (m: (typeof sent)[number]) => (sent.push(m), { success: true })) })
      .overrideProvider(BlobStorageService)
      .useValue(fakeBlobs)
      .compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    mountInboundMailBody(app);
    app.use(json({ limit: '7mb' }));
    app.use(urlencoded({ extended: true }));
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    const env = readFileSync(join(__dirname, '../.env'), 'utf8');
    const ownerUrl = (env.split(/\r?\n/).find((l) => l.startsWith('MIGRATION_DATABASE_URL=')) ?? '').slice('MIGRATION_DATABASE_URL='.length).replace(/^"|"$/g, '');
    owner = new PrismaClient({ datasources: { db: { url: ownerUrl } } });

    planId = (await prisma.plan.create({ data: { name: `sd4-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Desk4 Org ${k}`, slug: `sd4-${k.toLowerCase()}-${run}`, planId } });
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
      ['author2', 'A', 'panel', 'desk_lead'],
      ['deskAdmin', 'A', 'panel', 'desk_admin'],
      ['divya', 'A', 'panel', null],
      ['agentB', 'B', 'panel', 'desk_agent'],
    ];
    for (const [who, k, role, tpl] of roster) {
      const o = org[k].id;
      const permissionProfileId = tpl ? await profile(o, tpl) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@${STAFF_DOMAIN}`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@${STAFF_DOMAIN}`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, async (tx) => {
      const p = await tx.person.create({ data: { organizationId: org.A.id, givenName: 'Divya', familyName: 'Raghunathan', primaryEmail: `divya@${STAFF_DOMAIN}` } });
      await tx.personRole.create({ data: { organizationId: org.A.id, personId: p.id, roleType: 'login', sourceTable: 'users', sourceId: users.divya, startOn: new Date('2026-01-01') } });
      ids.divyaPerson = p.id;
    });
    const desk = async (who: Who, name: string, key: string, kind: string) => (await api(who, 'post', '/desk/desks').send({ name, key, kind }).expect(201)).body.id as string;
    ids.it = await desk('adminA', 'IT help', 'IT', 'it');
    ids.care = await desk('adminA', 'Customer Care', 'CARE', 'customer_support');
    ids.careB = await desk('adminB', 'B Care', 'BCARE', 'customer_support');
    for (const [d, who, role] of [
      [ids.it, 'agent', 'agent'],
      [ids.it, 'lead', 'lead'],
      [ids.it, 'author2', 'lead'],
      [ids.care, 'agent', 'agent'],
      [ids.care, 'lead', 'lead'],
      [ids.it, 'deskAdmin', 'admin'],
      [ids.care, 'deskAdmin', 'admin'],
    ] as const) {
      await api('adminA', 'post', `/desk/desks/${d}/members`).send({ userId: users[who], role }).expect(201);
    }
    await api('adminB', 'post', `/desk/desks/${ids.careB}/members`).send({ userId: users.agentB, role: 'agent' }).expect(201);
    await api('adminA', 'post', '/desk/portals').send({ slug: 'care', name: 'Care', deskIds: [ids.care], signUp: 'open', openRequests: false }).expect(201);

    // The platform tenant (seeded on a laptop; made here on a fresh database), with two test staff members.
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      const trial = (await tx.plan.findFirst({ where: { name: 'trial' } })) ?? (await tx.plan.create({ data: { name: 'trial', candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } }));
      if (!(await tx.user.findFirst({ where: { email: 'super@platform.test', organizationId: null } }))) await tx.user.create({ data: { email: 'super@platform.test', passwordHash, role: 'super_admin', organizationId: null, name: 'Anand Iyer' } });
      if (!(await tx.organization.findUnique({ where: { slug: 'demo-org' } }))) await tx.organization.create({ data: { name: 'Kaveri Foods', slug: 'demo-org', planId: trial.id } });
      await seedYukthixSupport(tx, trial.id);
    });
    platform = (await prisma.organization.findFirstOrThrow({ where: { isPlatform: true }, select: { id: true } })).id;
    for (const who of ['staff', 'staffOther'] as const) {
      const email = `${who}-${run}@platform.test`;
      users[who] = (await tenantPrisma.forTenant(SUPER, (tx) => tx.user.create({ data: { email, name: `Staff ${who}`, passwordHash, role: 'super_admin', organizationId: null } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/platform/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
      await markSteppedUp(tenantPrisma, token[who]);
    }
    await system(async (tx) => {
      const bridge = await tx.sdSupportBridge.findUniqueOrThrow({ where: { organizationId: platform } });
      ids.yxs = bridge.deskId;
      const u = await tx.user.create({ data: { organizationId: platform, email: `staff-${run}@yukthix.test`, name: 'Test Agent', passwordHash: '!console-only', role: 'panel', status: 'console_only' } });
      ids.consoleUser = u.id;
      await tx.sdConsoleAgent.create({ data: { organizationId: platform, staffUserId: users.staff, userId: u.id } });
      await tx.sdDeskMember.create({ data: { organizationId: platform, deskId: bridge.deskId, userId: u.id, role: 'lead', validFrom: new Date('2026-01-01') } });
      const acc = async (name: string, tenant: string, tier: string) => {
        const a = await tx.sdCustomerAccount.create({ data: { organizationId: platform, name: `${name} ${run}`, linkedTenantId: tenant } });
        await tx.sdEntitlement.create({ data: { organizationId: platform, accountId: a.id, plan: tier === 'priority' ? 'Priority Support' : 'Standard support', tier, validFrom: new Date('2026-01-01') } });
        return a.id;
      };
      ids.accA = await acc('Desk4 A', org.A.id, 'standard');
      ids.accB = await acc('Desk4 B', org.B.id, 'priority');
    }, platform);
  }, 180_000);

  afterAll(async () => {
    // The platform tenant is shared: remove exactly what this run made there, as the schema owner.
    try {
      await owner.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true), set_config('app.sd_system', 'on', true)`;
        const accounts = [ids.accA, ids.accB].filter(Boolean);
        const tickets = (await tx.$queryRaw<{ id: string }[]>`SELECT id FROM sd_tickets WHERE organization_id = ${platform}::uuid AND (customer_account_id = ANY(${accounts}::uuid[]) OR subject LIKE ${'%' + run + '%'})`).map((t) => t.id);
        const refs = await tx.$queryRaw<{ t: string; col: string }[]>`
          SELECT c.conrelid::regclass::text AS t, a.attname AS col FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[array_length(c.conkey, 1)]
          WHERE c.confrelid = 'sd_tickets'::regclass AND c.contype = 'f' AND c.conrelid <> 'sd_tickets'::regclass`;
        for (let pass = 0; pass < 4; pass++) {
          for (const r of refs) {
            // A savepoint per table: a row still referenced by another child table waits for the next pass.
            await tx.$executeRawUnsafe('SAVEPOINT sd4');
            await tx.$executeRawUnsafe(`DELETE FROM ${r.t} WHERE ${r.col} = ANY($1::uuid[])`, tickets).then(
              () => tx.$executeRawUnsafe('RELEASE SAVEPOINT sd4'),
              () => tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT sd4'),
            );
          }
        }
        await tx.$executeRaw`DELETE FROM sd_sla_timer_events WHERE timer_id IN (SELECT id FROM sd_sla_timers WHERE ticket_id = ANY(${tickets}::uuid[]))`;
        await tx.$executeRaw`DELETE FROM sd_sla_timers WHERE ticket_id = ANY(${tickets}::uuid[])`;
        await tx.$executeRaw`DELETE FROM sd_ticket_messages WHERE ticket_id = ANY(${tickets}::uuid[])`;
        await tx.$executeRaw`DELETE FROM sd_tickets WHERE id = ANY(${tickets}::uuid[])`;
        await tx.$executeRaw`DELETE FROM sd_support_intake WHERE organization_id = ${platform}::uuid AND account_id = ANY(${accounts}::uuid[])`;
        const people = (await tx.$queryRaw<{ person_id: string }[]>`SELECT person_id FROM sd_customer_contacts WHERE account_id = ANY(${accounts}::uuid[])`).map((p) => p.person_id);
        await tx.$executeRaw`DELETE FROM person_roles WHERE organization_id = ${platform}::uuid AND person_id = ANY(${people}::uuid[])`;
        await tx.$executeRaw`DELETE FROM sd_customer_contacts WHERE account_id = ANY(${accounts}::uuid[])`;
        await tx.$executeRaw`DELETE FROM persons WHERE organization_id = ${platform}::uuid AND id = ANY(${people}::uuid[])`;
        await tx.$executeRaw`DELETE FROM sd_entitlements WHERE account_id = ANY(${accounts}::uuid[])`;
        await tx.$executeRaw`DELETE FROM sd_customer_accounts WHERE id = ANY(${accounts}::uuid[])`;
        await tx.$executeRaw`DELETE FROM sd_desk_members WHERE organization_id = ${platform}::uuid AND user_id = ${ids.consoleUser}::uuid`;
        await tx.$executeRaw`DELETE FROM sd_console_agents WHERE organization_id = ${platform}::uuid AND user_id = ${ids.consoleUser}::uuid`;
      }, { timeout: 60_000 });
    } catch (e) {
      console.warn('platform cleanup', e);
    }
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        // Deleting the companies also removes the support sessions the staff asked for.
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    // The staff accounts last, in their own transaction (a failure there must not keep the companies).
    await tenantPrisma.forTenant(SUPER, (tx) => tx.user.deleteMany({ where: { id: { in: [users.staff, users.staffOther] } } })).catch((e) => console.warn('staff cleanup', e));
    await owner.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      await tx.$executeRaw`DELETE FROM users WHERE id = ${ids.consoleUser}::uuid`;
    }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await owner.$disconnect();
    await app.close();
  });

  const raiseAndSolve = async (subject: string) => {
    const t = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.it, subject, description: 'Please help with this.' }).expect(201)).body;
    const view = (await api('agent', 'get', `/desk/tickets/${t.id}`).expect(200)).body;
    await api('agent', 'post', `/desk/tickets/${t.id}/messages`).send({ kind: 'reply', bodyHtml: '<p>Done. Try again now.</p>' }).expect(201);
    const fresh = (await api('agent', 'get', `/desk/tickets/${t.id}`).expect(200)).body;
    await api('agent', 'post', `/desk/tickets/${t.id}/resolve`).send({ version: fresh.version ?? view.version }).expect(200);
    return t.id as string;
  };

  // ------------------------------------------------------------------------------------------ knowledge (SD-1.24, SD-1.25)

  describe('knowledge', () => {
    it('spaces by audience; an author drafts, someone else publishes (four eyes, also in SQL)', async () => {
      const space = (who: Who, body: object) => api(who, 'post', '/desk/kb/spaces').send(body).expect(201).then((r) => r.body.id as string);
      ids.public = await space('deskAdmin', { deskId: ids.care, name: 'Help', slug: 'help', audience: 'public' });
      ids.reqSpace = await space('deskAdmin', { deskId: ids.it, name: 'IT help', slug: 'it-help', audience: 'requesters', languages: ['en', 'hi'] });
      ids.agentSpace = await space('deskAdmin', { deskId: ids.it, name: 'IT notes', slug: 'it-notes', audience: 'agents' });
      // An agent cannot make spaces; company B never sees company A's.
      await api('agent', 'post', '/desk/kb/spaces').send({ deskId: ids.it, name: 'X', slug: 'x-space', audience: 'agents' }).expect(403);
      expect((await api('adminB', 'get', '/desk/kb/spaces').expect(200)).body).toEqual([]);

      const art = async (spaceId: string, title: string, body: string) => (await api('agent', 'post', '/desk/kb/articles').send({ spaceId, title, bodyHtml: body }).expect(201)).body as { id: string; number: number };
      const pub = await art(ids.public, `Track your order ${run}`, '<p>Open the tracking page.<script>x()</script></p>');
      const req = await art(ids.reqSpace, `Reset VPN password ${run}`, '<p>Use Me › Security.</p>');
      const internal = await art(ids.agentSpace, `Printer secret fix ${run}`, '<p>Pull the green lever.</p>');
      Object.assign(ids, { pub: pub.id, req: req.id, internal: internal.id, pubNo: String(pub.number), reqNo: String(req.number) });
      for (const a of [pub, req, internal]) {
        await api('agent', 'post', `/desk/kb/articles/${a.id}/submit`).send({ version: 1 }).expect(200);
        // The author cannot approve their own words.
        await api('agent', 'post', `/desk/kb/articles/${a.id}/review`).send({ version: 1, approve: true }).expect(403);
        await api('lead', 'post', `/desk/kb/articles/${a.id}/review`).send({ version: 1, approve: true }).expect(200);
      }
      const got = (await api('agent', 'get', `/desk/kb/articles/${pub.id}`).expect(200)).body;
      expect(got).toMatchObject({ state: 'published', publishedVersion: 1 });
      expect(got.bodyHtml).not.toContain('<script');
      // In SQL too: a reviewer is never the author.
      await expect(system((tx) => tx.sdKbArticleVersion.updateMany({ where: { articleId: req.id }, data: { reviewedBy: users.agent } }))).rejects.toThrow();
      // Company B cannot read company A's article at all.
      await api('agentB', 'get', `/desk/kb/articles/${pub.id}`).expect(404);
    });

    it('audiences hold in the service AND in SQL: employees, portal visitors, the public help centre and the sitemap', async () => {
      const titles = (rows: { title: string }[]) => rows.map((r) => r.title);
      const emp = (await api('divya', 'get', `/desk/my/kb/suggest?q=${encodeURIComponent('printer secret')}`).expect(200)).body;
      expect(titles(emp)).toEqual([]);
      const vpn = (await api('divya', 'get', '/desk/my/kb/suggest?q=vpn').expect(200)).body;
      expect(titles(vpn)).toContain(`Reset VPN password ${run}`);
      await api('divya', 'get', `/desk/my/kb/articles/${ids.reqNo}`).expect(200);
      // The employee cannot open the internal note by its number.
      const internalNo = (await api('agent', 'get', `/desk/kb/articles/${ids.internal}`).expect(200)).body.number;
      await api('divya', 'get', `/desk/my/kb/articles/${internalNo}`).expect(404);
      // A portal visitor (not signed in) gets only public articles; the IT requester article is not theirs either.
      const portal = `/api/v1/desk/portal/${org.A.slug}/care`;
      expect(titles((await request(server()).get(`${portal}/kb/suggest?q=track`).expect(200)).body)).toContain(`Track your order ${run}`);
      expect((await request(server()).get(`${portal}/kb/suggest?q=vpn`).expect(200)).body).toEqual([]);
      await request(server()).get(`${portal}/kb/articles/${ids.reqNo}`).expect(404);
      // The public help centre: public only, no session.
      const hc = `/api/v1/desk/help-centre/${org.A.slug}/help`;
      expect((await request(server()).get(hc).expect(200)).body.articles.map((a: { title: string }) => a.title)).toEqual([`Track your order ${run}`]);
      await request(server()).get(`/api/v1/desk/help-centre/${org.A.slug}/it-notes`).expect(404);
      await request(server()).get(`/api/v1/desk/help-centre/${org.A.slug}/it-help`).expect(404);
      const map = (await request(server()).get(`${hc}/sitemap.xml`).expect(200)).text;
      expect(map).toContain('/help');
      expect(map).not.toMatch(/printer|vpn/i);
      // SQL: as a public reader the internal and requester articles are not there at all, even when asked by id.
      const asPublic = await tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.kb_reader', 'public', true)`;
        return { arts: await tx.sdKbArticle.findMany({ where: { id: { in: [ids.pub, ids.req, ids.internal] } }, select: { id: true } }), versions: await tx.sdKbArticleVersion.count() };
      });
      expect(asPublic.arts.map((a) => a.id)).toEqual([ids.pub]);
      expect(asPublic.versions).toBe(0);
      const asRequester = await tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.kb_reader', 'requester', true)`;
        return tx.sdKbArticle.findMany({ where: { id: { in: [ids.pub, ids.req, ids.internal] } }, select: { id: true } });
      });
      expect(asRequester.map((a) => a.id).sort()).toEqual([ids.pub, ids.req].sort());
      // Searches are counted without any user id, and words that look like personal data are masked.
      await request(server()).get(`${hc}/search?q=${encodeURIComponent('refund ABCPK1234Z')}`).expect(200);
      const ev = await system((tx) => tx.sdKbEvent.findFirstOrThrow({ where: { kind: 'search', query: { contains: 'refund' } } }));
      expect(ev.query).not.toContain('ABCPK1234Z');
    });

    it('an article that changes its address answers the old one with a permanent redirect; a short number finds it', async () => {
      const a = (await api('lead', 'get', `/desk/kb/articles/${ids.pub}`).expect(200)).body;
      await api('lead', 'patch', `/desk/kb/articles/${ids.pub}`).send({ version: a.version, slug: `order-tracking-${run}` }).expect(200);
      const hc = `/api/v1/desk/help-centre/${org.A.slug}/help/articles`;
      expect((await request(server()).get(`${hc}/${a.slug}`).expect(200)).body).toEqual({ redirect: `/yx/help/${org.A.slug}/help/order-tracking-${run}`, permanent: true });
      expect((await request(server()).get(`${hc}/${ids.pubNo}`).expect(200)).body).toMatchObject({ redirect: `/yx/help/${org.A.slug}/help/order-tracking-${run}` });
      const page = (await request(server()).get(`${hc}/order-tracking-${run}`).expect(200)).body;
      expect(page.canonical).toContain(`/yx/help/${org.A.slug}/help/order-tracking-${run}`);
    });

    it('agents link articles in replies, record what solved a ticket, flag outdated ones; an article from a ticket drops personal data', async () => {
      const t = await raiseAndSolve(`Cannot connect VPN ${run}`);
      const found = (await api('agent', 'get', `/desk/tickets/${t}/kb?q=vpn`).expect(200)).body;
      expect(found[0]).toMatchObject({ id: ids.req, url: expect.stringContaining(`/yx/desk/help?article=${ids.reqNo}`) });
      // Internal notes never offered for a reply to the requester.
      expect(found.map((x: { id: string }) => x.id)).not.toContain(ids.internal);
      await api('agent', 'post', `/desk/tickets/${t}/kb-links`).send({ articleId: ids.req, kind: 'solved' }).expect(200);
      expect((await api('agent', 'get', `/desk/tickets/${t}/kb-links`).expect(200)).body).toEqual([expect.objectContaining({ kind: 'solved', id: ids.req })]);
      await api('agent', 'post', `/desk/kb/articles/${ids.req}/flag`).send({ reason: 'The menu moved' }).expect(200);
      expect((await api('lead', 'get', `/desk/kb/articles/${ids.req}`).expect(200)).body).toMatchObject({ outdated: true, stats: expect.objectContaining({ solved: 1 }) });
      const draft = (await api('agent', 'post', `/desk/tickets/${t}/kb-article`).send({ spaceId: ids.reqSpace }).expect(201)).body;
      const made = (await api('agent', 'get', `/desk/kb/articles/${draft.id}`).expect(200)).body;
      expect(made.versions[0].bodyHtml).not.toMatch(/Divya|Raghunathan/);
      expect(made.sourceTicket).toMatchObject({ id: t });
    });
  });

  // ------------------------------------------------------------------------------------------ CSAT and NPS (SD-1.26)

  describe('ratings and surveys', () => {
    it('a solved ticket asks for a rating once; the one-click link works once; a low score gives the lead a task', async () => {
      const t = await raiseAndSolve(`Monitor flickers ${run}`);
      const surveys = app.get(SurveysService);
      await surveys.askRatings();
      const mail = sent.find((m) => m.to === `divya@${STAFF_DOMAIN}` && m.subject === 'How did we do?' && m.html.includes(`Monitor flickers ${run}`));
      expect(mail).toBeTruthy();
      // D9: plain links, no images or tracking pixels.
      expect(mail!.html).not.toMatch(/<img/i);
      const link = /https?:\/\/[^"]+\/yx\/rate\/([0-9a-f-]{36})\/([A-Za-z0-9_-]+)\?score=1/.exec(mail!.html)!;
      const [, o, tok] = link;
      expect(o).toBe(org.A.id);
      // A second ask never happens.
      const before = sent.length;
      await surveys.askRatings();
      expect(sent.slice(before).filter((m) => m.subject === 'How did we do?' && m.to === `divya@${STAFF_DOMAIN}`)).toHaveLength(0);
      // Reading the link does not use it up; the first answer does; the second is refused; another company's id finds nothing.
      expect((await request(server()).get(`/api/v1/desk/rate/${o}/${tok}`).expect(200)).body).toMatchObject({ kind: 'csat', used: false });
      await request(server()).get(`/api/v1/desk/rate/${org.B.id}/${tok}`).expect(404);
      await request(server()).post(`/api/v1/desk/rate/${o}/${tok}`).send({ score: 1 }).expect(200);
      await request(server()).post(`/api/v1/desk/rate/${o}/${tok}`).send({ score: 5 }).expect(409);
      await request(server()).post(`/api/v1/desk/rate/${o}/${tok}/comment`).send({ comment: 'Still flickers' }).expect(200);
      await request(server()).post(`/api/v1/desk/rate/${o}/${tok}/comment`).send({ comment: 'again' }).expect(409);
      const rating = await system((tx) => tx.sdRating.findFirstOrThrow({ where: { ticketId: t } }));
      expect(rating).toMatchObject({ score: 1, comment: 'Still flickers', channel: 'email', agentUserId: users.agent });
      const task = await system((tx) => tx.sdTask.findFirst({ where: { ticketId: t, title: { contains: 'low rating' } } }));
      expect(task?.assigneeUserId).toBeTruthy();
      // The in-app rating is refused too (already rated).
      await api('divya', 'post', `/desk/my/tickets/${t}/rating`).send({ score: 4 }).expect(409);
    });

    it('in the app the requester rates their own solved ticket; someone else cannot', async () => {
      const t = await raiseAndSolve(`Mouse broken ${run}`);
      await api('agent', 'post', `/desk/my/tickets/${t}/rating`).send({ score: 5 }).expect(404);
      await api('divya', 'post', `/desk/my/tickets/${t}/rating`).send({ score: 5, comment: 'Thanks' }).expect(200);
    });

    it('NPS: at most one survey per person in the period; a detractor gives a follow-up task', async () => {
      const s = (await api('lead', 'post', '/desk/surveys').send({ deskId: ids.it, name: 'IT NPS', question: 'Would you recommend IT?', everyDays: 30, periodDays: 60 }).expect(201)).body.id;
      await api('agent', 'post', '/desk/surveys').send({ deskId: ids.it, name: 'No', question: 'q', everyDays: 30, periodDays: 60 }).expect(403);
      const surveys = app.get(SurveysService);
      await surveys.runSurveys();
      const mail = sent.filter((m) => m.to === `divya@${STAFF_DOMAIN}` && m.subject === 'A quick question');
      expect(mail).toHaveLength(1);
      const [, o, tok] = /\/yx\/rate\/([0-9a-f-]{36})\/([A-Za-z0-9_-]+)\?score=0/.exec(mail[0].html)!;
      await system((tx) => tx.sdSurvey.update({ where: { id: s }, data: { nextRunAt: new Date() } }));
      await surveys.runSurveys();
      expect(sent.filter((m) => m.to === `divya@${STAFF_DOMAIN}` && m.subject === 'A quick question')).toHaveLength(1);
      await request(server()).post(`/api/v1/desk/rate/${o}/${tok}`).send({ score: 3 }).expect(200);
      const list = (await api('lead', 'get', '/desk/surveys').expect(200)).body.find((x: { id: string }) => x.id === s);
      expect(list).toMatchObject({ answered: 1, detractors: 1, nps: -100 });
      expect(await system((tx) => tx.sdTask.findFirst({ where: { deskId: ids.it, title: { contains: 'NPS answer of 3' } } }))).toBeTruthy();
    });
  });

  // ------------------------------------------------------------------------------------------ reports (SD-1.27)

  describe('reports', () => {
    it('dashboards count only the desks the person may report on; a CSV is formula-safe; custom reports keep to visible tickets', async () => {
      const dash = (await api('lead', 'get', '/desk/reports/dashboard').expect(200)).body;
      expect(dash.solved).toBeGreaterThanOrEqual(3);
      expect(dash.ratings).toBeGreaterThanOrEqual(2);
      await api('agent', 'get', '/desk/reports/dashboard').expect(403);
      // Company B's admin sees company B's numbers only.
      expect((await api('adminB', 'get', '/desk/reports/dashboard').expect(200)).body).toMatchObject({ solved: 0, ratings: 0 });
      await api('lead', 'get', `/desk/reports/dashboard?deskId=${ids.careB}`).expect(404);
      await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.it, subject: `=HYPERLINK("http://evil") ${run}`, description: 'x' }).expect(201);
      await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.it, subject: `Private matter ${run}`, description: 'x', private: true }).expect(201);
      const csv = (await api('lead', 'get', '/desk/reports/library/by_status?format=csv').expect(200)).text;
      expect(csv.split('\n')[0]).toContain('Status');
      const rep = (await api('lead', 'post', '/desk/reports/custom').send({ name: 'Open IT', columns: ['number', 'subject', 'status'], filters: { deskIds: [ids.it] } }).expect(201)).body.id;
      await api('lead', 'post', '/desk/reports/custom').send({ name: 'Bad', columns: ['body'], filters: {} }).expect(400);
      const out = (await api('lead', 'get', `/desk/reports/custom/${rep}/run?format=csv`).expect(200)).text;
      expect(out).toContain(`"'=HYPERLINK(""http://evil"") ${run}"`);
      // On screen the agent sees the private ticket of their desk...
      expect(out).toContain(`Private matter ${run}`);
      await api('agentB', 'get', `/desk/reports/custom/${rep}/run`).expect(403);
      // Each scheduled copy is built with its recipient's own rights: a recipient without report rights gets nothing.
      await api('lead', 'post', `/desk/reports/custom/${rep}/schedules`).send({ frequency: 'daily', recipients: [users.lead, users.divya] }).expect(201);
      await system((tx) => tx.sdReportSchedule.updateMany({ where: { reportId: rep }, data: { nextRunAt: new Date(Date.now() - 1000) } }));
      const before = sent.length;
      await app.get((await import('../src/service-desk/reports.service')).ReportsService).sendScheduled();
      const copies = sent.slice(before).filter((m) => m.subject === 'Report: Open IT');
      expect(copies.map((m) => m.to)).toEqual([`lead@${STAFF_DOMAIN}`]);
      expect(copies[0].attachments?.[0].content.toString()).toContain("'=HYPERLINK");
      // ...but a copy that leaves the app by email never holds private or sensitive tickets (review fix).
      expect(copies[0].attachments?.[0].content.toString()).not.toContain('Private matter');
    });

    it('KPI snapshots are written once a day with their colour; the wall screen shows counts only', async () => {
      await api('lead', 'put', `/desk/reports/kpis/${ids.it}/target`).send({ metric: 'solved', target: 1, amber: 0 }).expect(200);
      const rs = app.get((await import('../src/service-desk/reports.service')).ReportsService);
      const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
      await rs.snapshot(today);
      await rs.snapshot(today);
      const rows = await system((tx) => tx.sdKpiDaily.findMany({ where: { deskId: ids.it, metric: 'solved' } }));
      expect(rows).toHaveLength(1);
      expect(rows[0].rag).toBe('green');
      const w = (await api('lead', 'post', '/desk/reports/wallboards').send({ name: 'IT wall', deskIds: [ids.it] }).expect(201)).body;
      const [, o, tok] = /\/yx\/wall\/([0-9a-f-]{36})\/([A-Za-z0-9_-]+)$/.exec(w.url)!;
      const wall = (await request(server()).get(`/api/v1/desk/wall/${o}/${tok}`).expect(200)).body;
      expect(JSON.stringify(wall)).not.toContain(run);
      expect(wall.desks[0]).toMatchObject({ name: 'IT help', open: expect.any(Number) });
      await request(server()).get(`/api/v1/desk/wall/${org.B.id}/${tok}`).expect(404);
      await api('lead', 'post', `/desk/reports/wallboards/${w.id}/revoke`).expect(200);
      await request(server()).get(`/api/v1/desk/wall/${o}/${tok}`).expect(404);
    });
  });

  // ------------------------------------------------------------------------------------------ the standalone product (SD-1.29)

  describe('people list and SCIM', () => {
    it('imports people from CSV (all or nothing, formula text kept as text) and keeps company B apart', async () => {
      const bad = (await api('adminA', 'post', '/desk/people-list/import').send({ csv: 'name,email,team\nAnil Rao,anil@x\n' }).expect(200)).body;
      expect(bad).toMatchObject({ imported: 0, problems: [expect.objectContaining({ row: 2 })] });
      const ok = (await api('adminA', 'post', '/desk/people-list/import').send({ csv: `name,email,team\nAnil Rao,anil@${STAFF_DOMAIN},Stores\n=cmd(),evil@${STAFF_DOMAIN},Ops\n` }).expect(200)).body;
      expect(ok).toMatchObject({ imported: 2, created: 2 });
      const list = (await api('adminA', 'get', '/desk/people-list?search=anil').expect(200)).body;
      expect(list[0]).toMatchObject({ name: 'Anil Rao', team: 'Stores', source: 'csv' });
      expect((await api('adminB', 'get', '/desk/people-list?search=anil').expect(200)).body).toEqual([]);
      await api('agent', 'get', '/desk/people-list').expect(403);
    });

    it('SCIM: the token works only for its own source; a deactivated user loses the seat their group gave them', async () => {
      // Saving directory credentials needs a fresh second factor.
      await api('adminA', 'post', '/desk/directory-sources').send({ kind: 'scim', name: 'Okta' }).expect(403);
      await markSteppedUp(tenantPrisma, token.adminA);
      const src = (await api('adminA', 'post', '/desk/directory-sources').send({ kind: 'scim', name: 'Okta', groupMap: [{ group: 'IT agents', deskId: ids.it, role: 'collaborator' }] }).expect(201)).body;
      const srcB = (await (async () => {
        await markSteppedUp(tenantPrisma, token.adminB);
        return api('adminB', 'post', '/desk/directory-sources').send({ kind: 'scim', name: 'B IdP' }).expect(201);
      })()).body;
      const base = `/api/v1/desk/scim/${org.A.id}/${src.id}/v2`;
      const scim = (method: 'get' | 'post' | 'patch' | 'delete', path: string, tok = src.scimToken) => request(server())[method](`${base}${path}`).set('Authorization', `Bearer ${tok}`);
      await request(server()).get(`${base}/Users`).expect(401);
      await scim('get', '/Users', 'x'.repeat(43)).expect(401);
      await scim('get', '/Users', srcB.scimToken).expect(401);
      await request(server()).get(`/api/v1/desk/scim/${org.B.id}/${src.id}/v2/Users`).set('Authorization', `Bearer ${src.scimToken}`).expect(401);
      // The secret never comes back from the list.
      expect(JSON.stringify((await api('adminA', 'get', '/desk/directory-sources').expect(200)).body)).not.toContain(src.scimToken);
      // An employee of HR is linked by email but never renamed by the directory (review fix).
      const meera = await system(async (tx) => {
        const p = await tx.person.create({ data: { organizationId: org.A.id, givenName: 'Meera', familyName: 'Iyer', primaryEmail: `meera@${STAFF_DOMAIN}` } });
        await tx.personRole.create({ data: { organizationId: org.A.id, personId: p.id, roleType: 'employee', sourceTable: 'employees', sourceId: randomUUID(), startOn: new Date('2026-01-01') } });
        return p.id;
      });
      await scim('post', '/Users').send({ userName: `meera@${STAFF_DOMAIN}`, name: { givenName: 'Hacked', familyName: 'Name' }, externalId: 'okta-meera' }).expect(201);
      expect(await system((tx) => tx.person.findFirstOrThrow({ where: { id: meera }, select: { givenName: true, familyName: true } }))).toEqual({ givenName: 'Meera', familyName: 'Iyer' });
      const created = (await scim('post', '/Users').send({ schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], userName: `divya@${STAFF_DOMAIN}`, name: { givenName: 'Divya', familyName: 'Raghunathan' }, externalId: 'okta-divya', active: true }).expect(201)).body;
      expect(created).toMatchObject({ userName: `divya@${STAFF_DOMAIN}`, active: true });
      expect((await scim('get', `/Users?filter=${encodeURIComponent(`userName eq "divya@${STAFF_DOMAIN}"`)}`).expect(200)).body.totalResults).toBe(1);
      const g = (await scim('post', '/Groups').send({ displayName: 'IT agents', members: [{ value: created.id }] }).expect(201)).body;
      const seat = () => system((tx) => tx.sdDeskMember.findFirst({ where: { deskId: ids.it, userId: users.divya, validTo: null } }));
      expect(await seat()).toMatchObject({ role: 'collaborator' });
      await scim('patch', `/Users/${created.id}`).send({ Operations: [{ op: 'replace', value: { active: false } }] }).expect(200);
      expect(await seat()).toBeNull();
      expect(g.displayName).toBe('IT agents');
      Object.assign(ids, { scimBase: base, scimToken: src.scimToken, scimGroup: g.id, scimDivya: created.id });
      // Company B's source cannot see company A's users.
      expect((await request(server()).get(`/api/v1/desk/scim/${org.B.id}/${srcB.id}/v2/Users`).set('Authorization', `Bearer ${srcB.scimToken}`).expect(200)).body.totalResults).toBe(0);
    });

    it('founder decision 8 Oct 2026: leaving a group ends only the seat the directory gave; a seat given by hand stays', async () => {
      const scim = (method: 'patch', path: string) => request(server())[method](`${ids.scimBase}${path}`).set('Authorization', `Bearer ${ids.scimToken}`);
      const seat = () => system((tx) => tx.sdDeskMember.findFirst({ where: { deskId: ids.it, userId: users.divya, validTo: null } }));
      const removeFromGroup = () => scim('patch', `/Groups/${ids.scimGroup}`).send({ Operations: [{ op: 'remove', path: `members[value eq "${ids.scimDivya}"]` }] }).expect(200);
      // Back on and in the group: the directory gives the seat.
      await scim('patch', `/Users/${ids.scimDivya}`).send({ Operations: [{ op: 'replace', value: { active: true } }] }).expect(200);
      expect(await seat()).toMatchObject({ role: 'collaborator', grantedBy: 'directory' });
      await removeFromGroup();
      expect(await seat()).toBeNull();
      // An admin gives the same seat by hand; joining and leaving the group leaves it alone.
      await api('adminA', 'post', `/desk/desks/${ids.it}/members`).send({ userId: users.divya, role: 'collaborator' }).expect(201);
      await scim('patch', `/Groups/${ids.scimGroup}`).send({ Operations: [{ op: 'add', path: 'members', value: [{ value: ids.scimDivya }] }] }).expect(200);
      await removeFromGroup();
      expect(await seat()).toMatchObject({ role: 'collaborator', grantedBy: 'manual' });
      // Disabled in the directory: she has left, so every seat ends (US-G-032).
      await scim('patch', `/Users/${ids.scimDivya}`).send({ Operations: [{ op: 'replace', value: { active: false } }] }).expect(200);
      expect(await seat()).toBeNull();
    });
  });

  // ------------------------------------------------------------------------------------------ privacy (SD-1.30)

  describe('privacy and the recycle bin', () => {
    it('access: the person downloads only what was said to or by them; erasure blanks their words and is refused under legal hold', async () => {
      const t = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.it, subject: `My PAN ABCPK1234Z ${run}`, description: 'My personal number is 9876.' }).expect(201)).body;
      await api('agent', 'post', `/desk/tickets/${t.id}/messages`).send({ kind: 'note', bodyHtml: '<p>Internal: check her laptop.</p>' }).expect(201);
      const acc = (await api('divya', 'post', '/desk/my/privacy-requests').send({ kind: 'access' }).expect(201)).body.id;
      await api('divya', 'post', '/desk/my/privacy-requests').send({ kind: 'access' }).expect(409);
      await api('divya', 'get', `/desk/my/privacy-requests/${acc}/export`).expect(404);
      await api('agent', 'get', '/desk/privacy/requests').expect(403);
      await markSteppedUp(tenantPrisma, token.adminA);
      await api('adminA', 'post', `/desk/privacy/requests/${acc}/decide`).send({ action: 'complete' }).expect(200);
      const copy = (await api('divya', 'get', `/desk/my/privacy-requests/${acc}/export`).expect(200)).body;
      expect(JSON.stringify(copy)).toContain(run);
      expect(JSON.stringify(copy)).not.toContain('Internal: check her laptop');
      await api('adminB', 'get', `/desk/my/privacy-requests/${acc}/export`).expect(404);

      const er = (await api('divya', 'post', '/desk/my/privacy-requests').send({ kind: 'erasure' }).expect(201)).body.id;
      await api('adminA', 'put', '/desk/privacy/settings').send({ legalHold: true, binDays: 30 }).expect(200);
      await api('adminA', 'post', `/desk/privacy/requests/${er}/decide`).send({ action: 'complete' }).expect(409);
      await api('adminA', 'put', '/desk/privacy/settings').send({ legalHold: false, binDays: 30 }).expect(200);
      const done = (await api('adminA', 'post', `/desk/privacy/requests/${er}/decide`).send({ action: 'complete' }).expect(200)).body;
      expect(done.result).toMatchObject({ personErased: false });
      const msgs = await system((tx) => tx.sdTicketMessage.findMany({ where: { ticketId: t.id, authorPersonId: ids.divyaPerson } }));
      expect(msgs.every((m) => m.bodyText === '[Removed]')).toBe(true);
      // Replies stay unchangeable for everyone else.
      await expect(system((tx) => tx.sdTicketMessage.updateMany({ where: { ticketId: t.id, kind: 'reply' }, data: { bodyHtml: '<p>changed</p>', bodyText: 'changed' } }))).rejects.toThrow(/never edited/);
    });

    it('a deleted saved view goes to the bin and comes back (US-G-218)', async () => {
      const v = (await api('lead', 'post', '/desk/views').send({ name: `My queue ${run}`, deskId: ids.it, filters: { assignee: 'me' } }).expect(201)).body.id;
      await api('lead', 'delete', `/desk/views/${v}`).expect(200);
      const row = (await api('lead', 'get', '/desk/recycle-bin').expect(200)).body.find((b: { kind: string; label: string }) => b.kind === 'view' && b.label === `My queue ${run}`);
      expect(row).toBeTruthy();
      // Someone else's deleted view is not theirs to put back.
      expect((await api('agent', 'get', '/desk/recycle-bin').expect(200)).body.find((b: { id: string }) => b.id === row.id)).toBeUndefined();
      await api('agent', 'post', `/desk/recycle-bin/${row.id}/restore`).expect(404);
      await api('lead', 'post', `/desk/recycle-bin/${row.id}/restore`).expect(200);
      expect((await api('lead', 'get', '/desk/views').expect(200)).body.map((x: { id: string }) => x.id)).toContain(v);
    });

    it('a deleted article goes to the bin and comes back', async () => {
      await api('lead', 'delete', `/desk/kb/articles/${ids.internal}`).expect(200);
      await api('agent', 'get', `/desk/kb/articles/${ids.internal}`).expect(404);
      const bin = (await api('lead', 'get', '/desk/recycle-bin').expect(200)).body;
      const row = bin.find((b: { kind: string; label: string }) => b.kind === 'kb_article' && b.label.includes('Printer secret fix'));
      expect(row).toBeTruthy();
      expect((await api('adminB', 'get', '/desk/recycle-bin').expect(200)).body).toEqual([]);
      await api('lead', 'post', `/desk/recycle-bin/${row.id}/restore`).expect(200);
      await api('agent', 'get', `/desk/kb/articles/${ids.internal}`).expect(200);
    });
  });

  // ------------------------------------------------------------------------------------------ YukthiX support (SD-1.31)

  describe('YukthiX support', () => {
    it('a company admin raises through the bridge; each company sees only its own tickets; the caller context comes back', async () => {
      const a = (await api('adminA', 'post', '/desk/support/yukthix/tickets').send({ subject: `Payslips blank ${run}`, body: 'Employees see a blank payslip.', severity: 2, screen: '/yx/people/directory' }).expect(201)).body;
      expect(a.number).toMatch(/^YXS-\d+$/);
      const b = (await api('adminB', 'post', '/desk/support/yukthix/tickets').send({ subject: `Leave page slow ${run}`, body: 'Slow since Monday.', severity: 3 }).expect(201)).body;
      const listA = (await api('adminA', 'get', '/desk/support/yukthix/tickets').expect(200)).body;
      expect(listA.map((t: { number: string }) => t.number)).toEqual([a.number]);
      const listB = (await api('adminB', 'get', '/desk/support/yukthix/tickets').expect(200)).body;
      expect(listB.map((t: { number: string }) => t.number)).toEqual([b.number]);
      ids.yxA = listA[0].id;
      ids.yxB = listB[0].id;
      // Company A cannot read, or reply to, company B's ticket.
      await api('adminA', 'get', `/desk/support/yukthix/tickets/${ids.yxB}`).expect(404);
      await api('adminA', 'post', `/desk/support/yukthix/tickets/${ids.yxB}/messages`).send({ body: 'hello' }).expect(404);
      // Only a System Admin of the company (the key), and never an agent of the company.
      await api('agent', 'post', '/desk/support/yukthix/tickets').send({ subject: 'x', body: 'y', severity: 3 }).expect(403);
      const ticket = await system((tx) => tx.sdTicket.findFirstOrThrow({ where: { id: ids.yxA } }), platform);
      expect(ticket).toMatchObject({ customerAccountId: ids.accA, priority: 2, planTier: 'standard', deskId: ids.yxs });
    });

    it('the two functions cannot read or write anything else (SQL level)', async () => {
      const asA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false, userId: users.adminA }, fn);
      // The caller's own context is back after each call.
      const after = await asA(async (tx) => {
        await tx.$queryRaw`SELECT sd_support_my_tickets(NULL)`;
        return (await tx.$queryRaw<{ o: string; u: string; s: string | null }[]>`SELECT current_setting('app.current_org') AS o, current_setting('app.current_user_id') AS u, NULLIF(current_setting('app.sd_system', true), '') AS s`)[0];
      });
      expect(after).toEqual({ o: org.A.id, u: users.adminA, s: null });
      // The helpers are not callable on their own; the platform tenant's tables stay invisible to the company.
      await expect(asA((tx) => tx.$queryRaw`SELECT * FROM sd_support_enter()`)).rejects.toThrow(/permission denied/);
      await expect(asA((tx) => tx.$queryRaw`SELECT sd_support_leave(${platform}::uuid, ${users.adminA}::uuid)`)).rejects.toThrow(/permission denied/);
      expect(await asA((tx) => tx.sdSupportIntake.count())).toBe(0);
      expect(await asA((tx) => tx.sdTicket.count({ where: { organizationId: platform } }))).toBe(0);
      // Another account's ticket id, a staff-only context, or no login: refused.
      await expect(asA((tx) => tx.$queryRaw`SELECT sd_support_intake(NULL, 'hi', 3, ${ids.yxB}::uuid, NULL)`)).rejects.toThrow(/SD_SUPPORT_NOT_FOUND/);
      expect((await asA((tx) => tx.$queryRaw<{ v: unknown }[]>`SELECT sd_support_my_tickets(${ids.yxB}::uuid) AS v`))[0].v).toBeNull();
      await expect(tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false, userId: null }, (tx) => tx.$queryRaw`SELECT sd_support_my_tickets(NULL)`)).rejects.toThrow(/SD_SUPPORT_CALLER/);
      await expect(tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false, userId: users.adminA, supportSessionId: randomUUID() }, (tx) => tx.$queryRaw`SELECT sd_support_my_tickets(NULL)`)).rejects.toThrow(/SD_SUPPORT_CALLER/);
      // A body that is too long or a bad severity never gets in.
      await expect(asA((tx) => tx.$queryRaw`SELECT sd_support_intake('s', ${'x'.repeat(10_001)}, 3, NULL, NULL)`)).rejects.toThrow(/SD_SUPPORT_INPUT/);
      await expect(asA((tx) => tx.$queryRaw`SELECT sd_support_intake('s', 'b', 9, NULL, NULL)`)).rejects.toThrow(/SD_SUPPORT_INPUT/);
      // A linked account can only be in the platform tenant (trigger).
      await expect(system((tx) => tx.sdCustomerAccount.create({ data: { organizationId: org.A.id, name: `Sneaky ${run}`, linkedTenantId: org.B.id } }))).rejects.toThrow(/only YukthiX/);
    });

    it('the console: staff without a link are refused; the queue puts severity, then Priority Support, first; Request access asks the company', async () => {
      await api('staffOther', 'get', '/platform/support-desk/tickets').expect(403);
      await api('adminA', 'get', '/platform/support-desk/tickets').expect(403);
      const q = (await api('staff', 'get', '/platform/support-desk/tickets').expect(200)).body as { id: string; severity: number; tier: string }[];
      const mine = q.filter((t) => [ids.yxA, ids.yxB].includes(t.id));
      expect(mine.map((t) => t.id)).toEqual([ids.yxA, ids.yxB]);
      // Same severity: Priority Support (B) comes before Standard (A).
      await system((tx) => tx.sdTicket.update({ where: { id: ids.yxB }, data: { priority: 2 } }), platform);
      const q2 = ((await api('staff', 'get', '/platform/support-desk/tickets').expect(200)).body as { id: string }[]).filter((t) => [ids.yxA, ids.yxB].includes(t.id));
      expect(q2.map((t) => t.id)).toEqual([ids.yxB, ids.yxA]);
      const view = (await api('staff', 'get', `/platform/support-desk/tickets/${ids.yxA}`).expect(200)).body;
      expect(view.tenant).toMatchObject({ name: `Desk4 A ${run}`, plan: { tier: 'standard' }, company: expect.objectContaining({ slug: org.A.slug }) });
      // No HR data in the panel (YX-CONSOLE-01).
      expect(JSON.stringify(view.tenant)).not.toMatch(/\b(salary|aadhaar|pan|bank)\b/i);
      await api('staff', 'post', `/platform/support-desk/tickets/${ids.yxA}/messages`).send({ kind: 'reply', bodyHtml: '<p>We are looking at it.</p>' }).expect(201);
      const back = (await api('adminA', 'get', `/desk/support/yukthix/tickets/${ids.yxA}`).expect(200)).body;
      expect(back.messages.map((m: { author: string }) => m.author)).toContain('Test');
      const s = (await api('staff', 'post', `/platform/support-desk/tickets/${ids.yxA}/request-access`).send({ reason: 'Look at the payslip settings', hours: 4 }).expect(201)).body;
      expect(s.status).toBe('requested');
      const session = await tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, (tx) => tx.supportSession.findFirstOrThrow({ where: { id: s.id } }));
      expect(session).toMatchObject({ ticket: back.number, requestedBy: users.staff, hours: 4 });
      expect((await api('staff', 'get', `/platform/support-desk/tickets/${ids.yxA}`).expect(200)).body.session).toMatchObject({ status: 'requested' });
      // The console agent works only in the platform tenant: company A's own desk tickets stay out of reach.
      const own = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.it, subject: `Own ticket ${run}`, description: 'x' }).expect(201)).body.id;
      await api('staff', 'get', `/platform/support-desk/tickets/${own}`).expect(404);
    });
  });

  it('every new table is closed to the other company (RLS)', async () => {
    const tables = ['sd_kb_spaces', 'sd_kb_articles', 'sd_kb_article_versions', 'sd_kb_events', 'sd_ratings', 'sd_surveys', 'sd_survey_tokens', 'sd_kpi_daily', 'sd_reports', 'sd_wallboards', 'sd_directory_sources', 'sd_directory_people', 'sd_people', 'sd_privacy_requests', 'sd_recycle_bin'];
    for (const t of tables) {
      const inA = await system((tx) => tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM ${t} WHERE organization_id = $1::uuid`, org.A.id));
      const fromB = await system((tx) => tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM ${t} WHERE organization_id = $1::uuid`, org.A.id), org.B.id);
      expect([t, Number(inA[0].n) > 0]).toEqual([t, true]);
      expect([t, Number(fromB[0].n)]).toEqual([t, 0]);
    }
    await expect(system((tx) => tx.sdKbSpace.create({ data: { organizationId: org.A.id, slug: `x-${run}`, name: 'x', audience: 'public' } }), org.B.id)).rejects.toThrow();
    // The KB service is unused here; it is imported to keep the suite's module graph the same as the app.
    expect(app.get(KbService)).toBeTruthy();
  });
});
