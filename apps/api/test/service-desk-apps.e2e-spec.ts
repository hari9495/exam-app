process.env.SD_SCANNER = 'dev-fake';
process.env.APPROVAL_CHANNELS = 'dev-fake';
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

// Helpdesk plan item 3: the company's business applications and their owners; access asked for through the service
// catalogue and decided by the application's owner (or the desk's admins) in their approvals. Positive and negative.
describe('Helpdesk: business applications and access requests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'agent' | 'deskAdmin' | 'owner' | 'divya' | 'priya';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'patch' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inbox = async (who: Who) => (await api(who, 'get', '/workflow/approvals/inbox').expect(200)).body as { taskId: string; requestId: string; title: string }[];
  const decide = (who: Who, taskId: string, decision: 'approve' | 'reject', reason?: string) => api(who, 'post', `/workflow/approvals/tasks/${taskId}/decide`).send({ decision, ...(reason ? { reason } : {}) });
  const order = (who: Who, appId: string) => api(who, 'post', '/desk/my/catalog/checkout').send({ items: [{ itemId: ids.item, quantity: 1, answers: { app: appId, why: 'For month-end close.' } }] });
  const itemOf = (ticketId: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.sdRequestItem.findFirstOrThrow({ where: { ticketId }, select: { stage: true, approvalRequestId: true } }));

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

    planId = (await prisma.plan.create({ data: { name: `apps-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Apps Org ${k}`, slug: `apps-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = async (o: string, key: string) =>
      (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${key}-${run}-${randomUUID().slice(0, 4)}`, permissionsJson: JSON.stringify(ROLE_TEMPLATES.find((t) => t.key === key)!.permissions) } }))).id;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['agent', 'A', 'panel', 'desk_agent'],
      ['deskAdmin', 'A', 'panel', 'desk_admin'],
      ['owner', 'A', 'panel', null],
      ['divya', 'A', 'panel', null],
      ['priya', 'A', 'panel', null],
    ];
    for (const [who, k, role, tpl] of roster) {
      const o = org[k].id;
      const permissionProfileId = tpl ? await profile(o, tpl) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}-${run}@apps.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}-${run}@apps.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    // Requesters are people with a login (the catalogue asks for them by person).
    await tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, async (tx) => {
      for (const who of ['divya', 'priya', 'owner'] as const) {
        const p = await tx.person.create({ data: { organizationId: org.A.id, givenName: who, primaryEmail: `${who}-${run}@apps.test` } });
        await tx.personRole.create({ data: { organizationId: org.A.id, personId: p.id, roleType: 'login', sourceTable: 'users', sourceId: users[who], startOn: new Date('2026-01-01') } });
      }
    });
    ids.desk = (await api('adminA', 'post', '/desk/desks').send({ name: 'IT help desk', key: 'IT', kind: 'it' }).expect(201)).body.id;
    await api('adminA', 'post', `/desk/desks/${ids.desk}/members`).send({ userId: users.agent, role: 'agent' }).expect(201);
    await api('adminA', 'post', `/desk/desks/${ids.desk}/members`).send({ userId: users.deskAdmin, role: 'admin' }).expect(201);
    const detail = (await api('adminA', 'get', `/desk/desks/${ids.desk}`).expect(200)).body;
    ids.team = detail.groups[0].id;
    ids.category = detail.categories[0].id;
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

  it('the Service Desk owner keeps the list (owners, retire, audited); others may not; one company never sees another\'s', async () => {
    ids.tally = (await api('adminA', 'post', '/desk/apps').send({ name: 'Tally Prime', description: 'Accounts', ownerUserId: users.owner }).expect(201)).body.id;
    ids.old = (await api('adminA', 'post', '/desk/apps').send({ name: 'Old intranet', ownerUserId: users.owner }).expect(201)).body.id;
    const old = (await api('adminA', 'get', '/desk/apps').expect(200)).body.find((x: { id: string }) => x.id === ids.old);
    await api('adminA', 'patch', `/desk/apps/${ids.old}`).send({ name: 'Old intranet', ownerUserId: users.owner, status: 'retired', version: old.version }).expect(200);
    await api('adminA', 'post', '/desk/apps').send({ name: 'tally prime', ownerUserId: users.owner }).expect(409);
    await api('adminA', 'post', '/desk/apps').send({ name: 'Ghost', ownerUserId: users.adminB }).expect(400);
    await api('agent', 'post', '/desk/apps').send({ name: 'Mine', ownerUserId: users.agent }).expect(403);
    await api('deskAdmin', 'patch', `/desk/apps/${ids.tally}`).send({ name: 'Tally', ownerUserId: users.deskAdmin }).expect(403);
    const seen = (await api('agent', 'get', '/desk/apps').expect(200)).body as { name: string; owner: string; status: string; canEdit: boolean }[];
    expect(seen.map((x) => [x.name, x.status, x.canEdit])).toEqual([['Tally Prime', 'active', false], ['Old intranet', 'retired', false]]);
    await api('divya', 'get', '/desk/apps').expect(403);
    ids.bApp = (await api('adminB', 'post', '/desk/apps').send({ name: 'Tally Prime', ownerUserId: users.adminB }).expect(201)).body.id;
    expect((await api('adminB', 'get', '/desk/apps').expect(200)).body.map((x: { id: string }) => x.id)).toEqual([ids.bApp]);
    await api('adminB', 'patch', `/desk/apps/${ids.tally}`).send({ name: 'Taken', ownerUserId: users.adminB }).expect(404);
    expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: { in: ['desk.app.created', 'desk.app.updated'] } } }))).toBe(3);
  });

  it('an access item asks for an application (active ones only) and sends it to the application\'s owner', async () => {
    const form = { sections: [{ id: 's', columns: 1, fields: [{ key: 'app', type: 'app', label: 'Which application?', required: true }, { key: 'why', type: 'textarea', label: 'Why?', required: true }] }], rules: [] };
    // The owner step needs an application question on the form.
    const bad = await api('adminA', 'post', '/desk/catalog/admin/items').send({ deskId: ids.desk, name: `Bad access ${run}`, categoryId: ids.category, draft: { form: { sections: [], rules: [] }, approval: [{ name: 'Owner', approvers: [{ kind: 'app_owner', field: 'app' }], mode: 'any' }], fulfilment: [] } }).expect(400);
    expect(JSON.stringify(bad.body)).toMatch(/application/);
    const item = (await api('adminA', 'post', '/desk/catalog/admin/items').send({ deskId: ids.desk, name: `Application access ${run}`, categoryId: ids.category, draft: { form, approval: [{ name: 'Application owner', approvers: [{ kind: 'app_owner', field: 'app' }], mode: 'any' }], fulfilment: [{ title: 'Give access', groupId: ids.team }] } }).expect(201)).body;
    await api('adminA', 'post', `/desk/catalog/admin/items/${item.id}/publish`).send({ version: item.version }).expect(200);
    ids.item = item.id;
    expect((await api('divya', 'get', '/desk/my/pick/apps?q=').expect(200)).body.map((x: { id: string }) => x.id)).toEqual([ids.tally]);
    const t = (await order('divya', ids.tally).expect(201)).body.requests[0].ticketId as string;
    expect((await itemOf(t)).stage).toBe('approval');
    const task = (await inbox('owner')).find((x) => x.title.includes(`Application access ${run}`));
    expect(task).toBeTruthy();
    expect((await inbox('agent')).find((x) => x.requestId === task!.requestId)).toBeUndefined();
    // Only the owner or a desk admin decides: an agent or the requester cannot.
    await decide('agent', task!.taskId, 'approve').expect(404);
    await decide('divya', task!.taskId, 'approve').expect(404);
    await decide('owner', task!.taskId, 'approve').expect(200);
    expect((await itemOf(t)).stage).toBe('fulfilment');
    expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: { contains: 'workflow' }, actorUserId: users.owner } }))).toBeGreaterThan(0);
  });

  it('a desk admin may decide instead of the owner; the owner may refuse with a reason', async () => {
    const t1 = (await order('priya', ids.tally).expect(201)).body.requests[0].ticketId as string;
    const r1 = (await itemOf(t1)).approvalRequestId;
    const task = (await inbox('deskAdmin')).find((x) => x.requestId === r1);
    expect(task).toBeTruthy();
    await decide('deskAdmin', task!.taskId, 'approve').expect(200);
    expect((await itemOf(t1)).stage).toBe('fulfilment');
    const t2 = (await order('priya', ids.tally).expect(201)).body.requests[0].ticketId as string;
    const r2 = (await itemOf(t2)).approvalRequestId;
    const task2 = (await inbox('owner')).find((x) => x.requestId === r2)!;
    await decide('owner', task2.taskId, 'reject').expect(400);
    await decide('owner', task2.taskId, 'reject', 'Not needed for this role.').expect(200);
    expect((await itemOf(t2)).stage).toBe('rejected');
  });

  it('nobody approves their own request: the owner asking for their own application goes to the desk admin', async () => {
    const t = (await order('owner', ids.tally).expect(201)).body.requests[0].ticketId as string;
    const reqId = (await itemOf(t)).approvalRequestId!;
    expect((await inbox('owner')).find((x) => x.requestId === reqId)).toBeUndefined();
    const task = (await inbox('deskAdmin')).find((x) => x.requestId === reqId)!;
    expect(task).toBeTruthy();
    await decide('deskAdmin', task.taskId, 'approve').expect(200);
  });

  it('a retired application, or another company\'s, cannot be asked for; nothing is raised', async () => {
    const before = await tenantPrisma.forTenant(SUPER, (tx) => tx.sdTicket.count({ where: { organizationId: org.A.id } }));
    expect((await order('divya', ids.old).expect(400)).body.message).toMatch(/retired or not on the list/);
    expect((await order('divya', ids.bApp).expect(400)).body.message).toMatch(/retired or not on the list/);
    expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.sdTicket.count({ where: { organizationId: org.A.id } }))).toBe(before);
  });
});
