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

// HLP-03 Ticket workspace (Helpdesk design wiring, round 3), end to end against the real database (forced RLS, app
// role): the agent's ticket now says when a solved ticket closes and the requester's rating, and the workspace actions
// keep their rules. Positive and negative: the employee, an agent, a collaborator, a desk lead, a desk admin, another
// company, bad input, a stale version.
describe('Service Desk HLP-03 Ticket workspace: resolved note, reply, note, who may act', () => {
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
  type Who = 'adminA' | 'adminB' | 'agent' | 'lead' | 'collab' | 'deskAdmin' | 'divya' | 'agentB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const asA = (): TenantContext => ({ organizationId: org.A.id, isSuperAdmin: false, userId: null });
  const get = async (who: Who) => (await api(who, 'get', `/desk/tickets/${ids.t}`).expect(200)).body as { version: number; systemState: string; closesOn: string | null; rating: number | null; resolvedAt: string | null; canWork: boolean; canNote: boolean; access: string };

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

    planId = (await prisma.plan.create({ data: { name: `hlp03-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HLP03 Org ${k}`, slug: `hlp03-${k.toLowerCase()}-${run}`, planId } });
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
      ['collab', 'A', 'panel', 'desk_collaborator'],
      ['deskAdmin', 'A', 'panel', 'desk_admin'],
      ['divya', 'A', 'panel', null],
      ['agentB', 'B', 'panel', 'desk_agent'],
    ];
    for (const [who, k, role, tpl] of roster) {
      const o = org[k].id;
      const permissionProfileId = tpl ? await profile(o, tpl) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}-${run}@hlp03.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}-${run}@hlp03.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await tenantPrisma.forTenant(asA(), async (tx) => {
      const p = await tx.person.create({ data: { organizationId: org.A.id, givenName: 'Divya', primaryEmail: `divya-${run}@hlp03.test` } });
      await tx.personRole.create({ data: { organizationId: org.A.id, personId: p.id, roleType: 'login', sourceTable: 'users', sourceId: users.divya, startOn: new Date('2026-01-01') } });
    });
    ids.desk = (await api('adminA', 'post', '/desk/desks').send({ name: 'IT help desk', key: 'IT', kind: 'it' }).expect(201)).body.id;
    for (const [who, role] of [['agent', 'agent'], ['lead', 'lead'], ['collab', 'collaborator'], ['deskAdmin', 'admin']] as const) await api('adminA', 'post', `/desk/desks/${ids.desk}/members`).send({ userId: users[who], role }).expect(201);
    const deskB = (await api('adminB', 'post', '/desk/desks').send({ name: 'B IT', key: 'BIT', kind: 'it' }).expect(201)).body.id;
    await api('adminB', 'post', `/desk/desks/${deskB}/members`).send({ userId: users.agentB, role: 'agent' }).expect(201);
    const cal = (await api('adminA', 'post', '/desk/calendars').send({ name: `Always ${run}`, timeZone: 'Asia/Kolkata', hours: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 0, endMinute: 1440 })) }).expect(201)).body;
    await api('adminA', 'post', `/desk/desks/${ids.desk}/sla-policies`)
      .send({ name: 'IT standard', kind: 'sla', scope: { match: 'all', rules: [] }, calendarSource: 'calendar', calendarId: cal.id, targets: [{ metric: 'first_response', minutes: [30, 60, 120, 240] }, { metric: 'resolution', minutes: [240, 480, 960, 1920] }] })
      .expect(201);
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

  it('an agent replies and adds a note; the requester sees the reply, never the note', async () => {
    ids.t = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.desk, subject: `VPN drops ${run}`, description: 'Every ten minutes.' }).expect(201)).body.id;
    await api('agent', 'post', `/desk/tickets/${ids.t}/messages`).send({ kind: 'reply', bodyHtml: '<p>Please restart the VPN client.</p>', mentions: [], attachmentIds: [] }).expect(201);
    await api('agent', 'post', `/desk/tickets/${ids.t}/messages`).send({ kind: 'note', bodyHtml: '<p>Proxy logs checked.</p>', mentions: [], attachmentIds: [] }).expect(201);
    const mine = (await api('divya', 'get', `/desk/my/tickets/${ids.t}`).expect(200)).body;
    expect(JSON.stringify(mine.messages)).toContain('restart the VPN');
    expect(JSON.stringify(mine.messages)).not.toContain('Proxy logs');
    expect(await get('agent')).toMatchObject({ canWork: true, closesOn: null, rating: null });
  });

  it('bad input and a stale version are refused', async () => {
    await api('agent', 'post', `/desk/tickets/${ids.t}/messages`).send({ kind: 'reply', bodyHtml: '<p> </p>', mentions: [], attachmentIds: [] }).expect((r) => expect(r.status).toBe(400));
    await api('agent', 'post', `/desk/tickets/${ids.t}/messages`).send({ kind: 'shout', bodyHtml: '<p>x</p>' }).expect(400);
    const v = (await get('agent')).version;
    await api('agent', 'patch', `/desk/tickets/${ids.t}`).send({ version: v - 1, priority: 1, priorityReason: 'CEO cannot work' }).expect(409);
  });

  it('a collaborator writes notes only; a desk admin reads only; the employee and another company get nothing', async () => {
    await api('agent', 'post', `/desk/tickets/${ids.t}/collaborators`).send({ userId: users.collab }).expect(201);
    expect(await get('collab')).toMatchObject({ canWork: false, canNote: true, access: 'collaborator' });
    await api('collab', 'post', `/desk/tickets/${ids.t}/messages`).send({ kind: 'reply', bodyHtml: '<p>Hi</p>', mentions: [], attachmentIds: [] }).expect(403);
    await api('collab', 'post', `/desk/tickets/${ids.t}/messages`).send({ kind: 'note', bodyHtml: '<p>Router swapped.</p>', mentions: [], attachmentIds: [] }).expect(201);
    expect(await get('deskAdmin')).toMatchObject({ canWork: false, canNote: false });
    expect((await api('deskAdmin', 'post', `/desk/tickets/${ids.t}/messages`).send({ kind: 'note', bodyHtml: '<p>x</p>', mentions: [], attachmentIds: [] })).status).toBeGreaterThanOrEqual(403);
    await api('divya', 'get', `/desk/tickets/${ids.t}`).expect(403);
    expect([403, 404]).toContain((await api('agentB', 'get', `/desk/tickets/${ids.t}`)).status);
  });

  it('a solved ticket says when it closes (the desk setting) and, once rated, the rating', async () => {
    const v = (await get('agent')).version;
    await api('agent', 'post', `/desk/tickets/${ids.t}/resolve`).send({ version: v }).expect(200);
    const solved = await get('agent');
    expect(solved.systemState).toBe('solved');
    expect(new Date(solved.closesOn!).getTime() - new Date(solved.resolvedAt!).getTime()).toBe(3 * 86_400_000);
    expect(solved.rating).toBeNull();
    await api('divya', 'post', `/desk/my/tickets/${ids.t}/rating`).send({ score: 4 }).expect(200);
    expect((await get('lead')).rating).toBe(4);
  });

  it('nobody signed in gets nothing', async () => {
    await request(server()).get(`/api/v1/desk/tickets/${ids.t}`).expect(401);
  });
});
