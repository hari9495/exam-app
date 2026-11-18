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

// HLP-02 Agent desk (Helpdesk design wiring, round 2), end to end against the real database (forced RLS, app role): the
// agent's ticket list now carries each ticket's first response and resolution clock and filters by the day it was
// raised. Positive and negative: the employee, an agent, a desk lead, a desk admin, another company, bad input.
describe('Service Desk HLP-02 Agent desk: clocks, raised filter, who sees and changes what', () => {
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
  const api = (who: Who, method: 'get' | 'post' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const asA = (): TenantContext => ({ organizationId: org.A.id, isSuperAdmin: false, userId: null });
  type Clock = { usedMinutes: number; targetMinutes: number; paused: boolean } | null;
  const list = async (who: Who, q = '') => (await api(who, 'get', `/desk/tickets?${q}`).expect(200)).body.items as { id: string; canBulk: boolean; firstResponse: Clock; resolution: Clock; firstResponseAt: string | null }[];
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

    planId = (await prisma.plan.create({ data: { name: `hlp02-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HLP02 Org ${k}`, slug: `hlp02-${k.toLowerCase()}-${run}`, planId } });
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
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}-${run}@hlp02.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}-${run}@hlp02.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await tenantPrisma.forTenant(asA(), async (tx) => {
      const p = await tx.person.create({ data: { organizationId: org.A.id, givenName: 'Divya', primaryEmail: `divya-${run}@hlp02.test` } });
      await tx.personRole.create({ data: { organizationId: org.A.id, personId: p.id, roleType: 'login', sourceTable: 'users', sourceId: users.divya, startOn: new Date('2026-01-01') } });
    });
    ids.desk = (await api('adminA', 'post', '/desk/desks').send({ name: 'IT help desk', key: 'IT', kind: 'it' }).expect(201)).body.id;
    for (const [who, role] of [['agent', 'agent'], ['lead', 'lead'], ['deskAdmin', 'admin']] as const) await api('adminA', 'post', `/desk/desks/${ids.desk}/members`).send({ userId: users[who], role }).expect(201);
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

  it('the agent list carries the first response and resolution clocks (business minutes used of the target)', async () => {
    ids.t = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.desk, subject: `VPN drops ${run}`, description: 'Every ten minutes.' }).expect(201)).body.id;
    const row = (await list('agent')).find((x) => x.id === ids.t)!;
    expect(row.firstResponse).toMatchObject({ paused: false });
    expect(row.resolution).toMatchObject({ paused: false });
    expect(row.resolution!.targetMinutes).toBeGreaterThan(row.firstResponse!.targetMinutes);
    expect(row.resolution!.usedMinutes).toBeLessThan(5);
    expect(row.firstResponseAt).toBeNull();
    expect((row as { firstResponseOutcome?: string | null }).firstResponseOutcome).toBeNull();
  });

  // Batch F item 34 (answer 2570): once answered, the list says whether the first response was on time.
  it('first response: answered in time is Met; a timer that had passed its target is Breached', async () => {
    const t = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.desk, subject: `Printer jam ${run}`, description: 'Tray 2.' }).expect(201)).body.id as string;
    await api('agent', 'post', `/desk/tickets/${t}/messages`).send({ kind: 'reply', bodyHtml: '<p>Looking now.</p>', mentions: [], attachmentIds: [] }).expect(201);
    type Row = { id: string; firstResponse: Clock; firstResponseAt: string | null; firstResponseOutcome: string | null };
    const met = ((await list('agent')) as unknown as Row[]).find((x) => x.id === t)!;
    expect(met).toMatchObject({ firstResponse: null, firstResponseOutcome: 'met' });
    expect(met.firstResponseAt).not.toBeNull();
    // The same promise kept late: the timer had breached before the reply.
    await tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, (tx) => tx.sdSlaTimer.updateMany({ where: { ticketId: t, metric: 'first_response' }, data: { breachedAt: new Date() } }));
    expect(((await list('agent')) as unknown as Row[]).find((x) => x.id === t)!.firstResponseOutcome).toBe('breached');
    // Another company sees none of it.
    expect((await list('agentB')).map((x) => x.id)).not.toContain(t);
  });

  it('Raised filter: today includes it, tomorrow does not; bad dates are refused; a saved view keeps it', async () => {
    expect((await list('agent', `createdFrom=${today}&createdTo=${today}`)).map((x) => x.id)).toContain(ids.t);
    const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    expect((await list('agent', `createdFrom=${tomorrow}`)).map((x) => x.id)).not.toContain(ids.t);
    await api('agent', 'get', '/desk/tickets?createdFrom=03-11-2026').expect(400);
    await api('agent', 'get', '/desk/tickets?createdFrom=2026-13-45').expect(400);
    await api('agent', 'get', `/desk/tickets?createdFrom=${tomorrow}&createdTo=${today}`).expect(400);
    const v = (await api('agent', 'post', '/desk/views').send({ name: `Today ${run}`, filters: { createdFrom: today } }).expect(201)).body;
    expect((await list('agent', `viewId=${v.id}`)).map((x) => x.id)).toContain(ids.t);
  });

  it('an employee with no desk seat cannot list tickets', async () => {
    await api('divya', 'get', '/desk/tickets').expect(403);
  });

  it('a desk lead may change many at once; an agent may not; bad input is refused', async () => {
    expect((await list('lead')).find((x) => x.id === ids.t)!.canBulk).toBe(true);
    expect((await list('agent')).find((x) => x.id === ids.t)!.canBulk).toBe(false);
    await api('agent', 'post', '/desk/tickets/bulk').send({ ticketIds: [ids.t], action: { assignee: 'me' } }).expect(403);
    const r = (await api('lead', 'post', '/desk/tickets/bulk').send({ ticketIds: [ids.t], action: { priority: 1, priorityReason: 'Payroll run tomorrow' } }).expect(200)).body;
    expect(r.done).toEqual([ids.t]);
    await api('lead', 'post', '/desk/tickets/bulk').send({ ticketIds: [ids.t], action: { priority: 9 } }).expect(400);
  });

  it('an agent assigns a ticket to themself; bad input and another company are refused', async () => {
    await api('agent', 'post', `/desk/tickets/${ids.t}/assign`).send({ userId: users.agent }).expect(200);
    expect((await list('agent', 'assignee=me')).map((x) => x.id)).toContain(ids.t);
    await api('agent', 'post', `/desk/tickets/${ids.t}/assign`).send({ userId: 'me' }).expect(400);
    expect((await api('agentB', 'post', `/desk/tickets/${ids.t}/assign`).send({ userId: users.agentB })).status).toBeGreaterThanOrEqual(403);
    expect((await list('agentB')).map((x) => x.id)).not.toContain(ids.t);
  });

  it('a sensitive ticket never reaches the desk admin list', async () => {
    const secret = (await api('adminA', 'post', `/desk/desks/${ids.desk}/categories`).send({ name: `Security ${run}`, sensitive: true }).expect(201)).body.id;
    const s = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.desk, categoryId: secret, subject: `Phishing ${run}`, description: 'A strange mail.' }).expect(201)).body.id;
    expect((await api('deskAdmin', 'get', '/desk/tickets').expect(200)).body.items.map((x: { id: string }) => x.id)).not.toContain(s);
  });

  it('moving to another desk needs a reason; nobody signed in gets nothing', async () => {
    expect([400, 403]).toContain((await api('agent', 'post', `/desk/tickets/${ids.t}/move`).send({ deskId: ids.desk, reason: 'x' })).status);
    await request(server()).get('/api/v1/desk/tickets').expect(401);
  });
});
