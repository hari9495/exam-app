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

// The small Helpdesk items (founder answers 1642, 1643, 1646, 1647, 1661, 1662), end to end against the real database
// (forced RLS, the app role). Positive and negative: the employee, an agent, a lead, a desk admin, another company.
describe('Helpdesk small items', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
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
  const titles = (b: { title: string }[]) => b.map((x) => x.title);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn().mockResolvedValue({ success: true }) })
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

    planId = (await prisma.plan.create({ data: { name: `small-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Small Org ${k}`, slug: `small-${k.toLowerCase()}-${run}`, planId } });
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
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}-${run}@small.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}-${run}@small.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await tenantPrisma.forTenant(asA(), async (tx) => {
      const p = await tx.person.create({ data: { organizationId: org.A.id, givenName: 'Divya', primaryEmail: `divya-${run}@small.test` } });
      ids.divyaPerson = p.id;
      await tx.personRole.create({ data: { organizationId: org.A.id, personId: p.id, roleType: 'login', sourceTable: 'users', sourceId: users.divya, startOn: new Date('2026-01-01') } });
    });
    ids.desk = (await api('adminA', 'post', '/desk/desks').send({ name: 'IT help desk', key: 'IT', kind: 'it' }).expect(201)).body.id;
    for (const [who, role] of [['agent', 'agent'], ['lead', 'lead'], ['deskAdmin', 'admin']] as const) await api('adminA', 'post', `/desk/desks/${ids.desk}/members`).send({ userId: users[who], role }).expect(201);
    ids.deskB = (await api('adminB', 'post', '/desk/desks').send({ name: 'B IT', key: 'BIT', kind: 'it' }).expect(201)).body.id;
    await api('adminB', 'post', `/desk/desks/${ids.deskB}/members`).send({ userId: users.agentB, role: 'agent' }).expect(201);
    ids.space = (await api('deskAdmin', 'post', '/desk/kb/spaces').send({ deskId: ids.desk, name: 'IT help', slug: 'it-help', audience: 'requesters' }).expect(201)).body.id;
    ids.art = (await api('agent', 'post', '/desk/kb/articles').send({ spaceId: ids.space, title: `Withdraw your provident fund ${run}`, bodyHtml: '<p>Use the EPFO member portal with your account number.</p>' }).expect(201)).body.id;
    await api('agent', 'post', `/desk/kb/articles/${ids.art}/submit`).send({ version: 1 }).expect(200);
    await api('lead', 'post', `/desk/kb/articles/${ids.art}/review`).send({ version: 1, approve: true }).expect(200);
  }, 240_000);

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

  // ------------------------------------------------------------------------------------------ 1642 search synonyms
  describe('1642: search words that mean the same', () => {
    const suggest = (q: string) => api('divya', 'get', `/desk/my/kb/suggest?q=${encodeURIComponent(q)}`).expect(200);
    it('the Indian HR starter list: "PF" finds the provident fund article; the settings show the list and the starter', async () => {
      expect(titles((await suggest('PF')).body)).toContain(`Withdraw your provident fund ${run}`);
      const s = (await api('agent', 'get', '/desk/kb/settings').expect(200)).body as { synonyms: string; synonymsDefault: string };
      expect(s.synonyms).toContain('pf, provident fund, epf');
      expect(s.synonyms).toBe(s.synonymsDefault);
    });

    it('the Service Desk owner changes the list (audited); without the PF line, "PF" no longer finds it; another company keeps its own', async () => {
      const mine = 'cl, casual leave\nuan, universal account number';
      expect((await api('adminA', 'put', '/desk/kb/settings').send({ synonyms: mine }).expect(200)).body.synonyms).toBe(mine);
      expect(titles((await suggest('PF')).body)).not.toContain(`Withdraw your provident fund ${run}`);
      expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'desk.kb.settings_changed', entityId: 'desk.kb.synonyms' } }))).toBe(1);
      expect((await api('agentB', 'get', '/desk/kb/settings').expect(200)).body.synonyms).toContain('pf, provident fund');
      await api('adminA', 'put', '/desk/kb/settings').send({ synonyms: 'pf, provident fund, epf' }).expect(200);
      expect(titles((await suggest('EPF')).body)).toContain(`Withdraw your provident fund ${run}`);
    });

    it('negative: a line with one word or odd characters is refused naming the line; an agent, a desk admin and the employee may not change it', async () => {
      expect((await api('adminA', 'put', '/desk/kb/settings').send({ synonyms: 'pf, provident fund\ncanteen' }).expect(400)).body.message).toMatch(/Line 2/);
      expect((await api('adminA', 'put', '/desk/kb/settings').send({ synonyms: 'pf; drop, x' }).expect(400)).body.message).toMatch(/Line 1/);
      for (const who of ['agent', 'deskAdmin', 'divya'] as const) await api(who, 'put', '/desk/kb/settings').send({ synonyms: 'a1, b1' }).expect(403);
    });
  });
});
