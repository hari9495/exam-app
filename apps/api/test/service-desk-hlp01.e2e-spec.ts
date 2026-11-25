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

// HLP-01 Help centre (Helpdesk design wiring, round 1), end to end against the real database (forced RLS, app role):
// "My tickets" now carries the resolution promise of open tickets, and on solved ones when they close, until when a
// reply reopens them and whether the person can still rate them. Positive and negative: the employee, a colleague
// following it, an agent, a desk admin, another company, bad input.
describe('Service Desk HLP-01 Help centre: my tickets with promise, close, reopen and rating', () => {
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
  type Who = 'adminA' | 'adminB' | 'agent' | 'deskAdmin' | 'divya' | 'ravi' | 'empB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const asA = (): TenantContext => ({ organizationId: org.A.id, isSuperAdmin: false, userId: null });
  const system = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) =>
    tenantPrisma.forTenant(asA(), async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
      return fn(tx);
    });
  const mine = async (who: Who) => (await api(who, 'get', '/desk/my/tickets').expect(200)).body as { id: string; systemState: string; clock: { usedMinutes: number; targetMinutes: number; paused: boolean } | null; closesOn: string | null; reopenUntil: string | null; rating: number | null; canRate: boolean; resolvedAt: string | null }[];

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

    planId = (await prisma.plan.create({ data: { name: `hlp01-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HLP01 Org ${k}`, slug: `hlp01-${k.toLowerCase()}-${run}`, planId } });
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
      ['divya', 'A', 'panel', null],
      ['ravi', 'A', 'panel', null],
      ['empB', 'B', 'panel', null],
    ];
    for (const [who, k, role, tpl] of roster) {
      const o = org[k].id;
      const permissionProfileId = tpl ? await profile(o, tpl) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}-${run}@hlp01.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}-${run}@hlp01.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await tenantPrisma.forTenant(asA(), async (tx) => {
      for (const who of ['divya', 'ravi'] as const) {
        const p = await tx.person.create({ data: { organizationId: org.A.id, givenName: who, primaryEmail: `${who}-${run}@hlp01.test` } });
        await tx.personRole.create({ data: { organizationId: org.A.id, personId: p.id, roleType: 'login', sourceTable: 'users', sourceId: users[who], startOn: new Date('2026-01-01') } });
      }
    });
    const desk = (await api('adminA', 'post', '/desk/desks').send({ name: 'IT help desk', key: 'IT', kind: 'it' }).expect(201)).body;
    ids.desk = desk.id;
    for (const [who, role] of [['agent', 'agent'], ['deskAdmin', 'admin']] as const) await api('adminA', 'post', `/desk/desks/${ids.desk}/members`).send({ userId: users[who], role }).expect(201);
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

  it('an open ticket shows its resolution promise as minutes used of the target; nothing about closing or rating yet', async () => {
    const t = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.desk, subject: `VPN drops ${run}`, description: 'Every ten minutes.', impact: 3, urgency: 3 }).expect(201)).body;
    ids.t = t.id;
    const row = (await mine('divya')).find((x) => x.id === t.id)!;
    expect(row.clock).toMatchObject({ targetMinutes: 1920, paused: false }) // impact 3, urgency 3: priority 4;
    expect(row.clock!.usedMinutes).toBeGreaterThanOrEqual(0);
    expect(row.clock!.usedMinutes).toBeLessThan(5);
    expect(row).toMatchObject({ closesOn: null, reopenUntil: null, rating: null, canRate: false, resolvedAt: null });
  });

  it('a solved ticket says when it closes and until when a reply reopens it (the desk settings); the raiser can rate it', async () => {
    const v = (await system((tx) => tx.sdTicket.findFirstOrThrow({ where: { id: ids.t } }))).version;
    await api('agent', 'post', `/desk/tickets/${ids.t}/resolve`).send({ version: v }).expect(200);
    const row = (await mine('divya')).find((x) => x.id === ids.t)!;
    expect(row.systemState).toBe('solved');
    expect(row.clock).toBeNull();
    const resolved = new Date(row.resolvedAt!).getTime();
    expect(new Date(row.closesOn!).getTime() - resolved).toBe(3 * 86_400_000);
    expect(new Date(row.reopenUntil!).getTime() - resolved).toBe(7 * 86_400_000);
    expect(row.canRate).toBe(true);
    // The desk's own settings decide: no reopening by requesters, no auto-close.
    const d = (await api('adminA', 'get', `/desk/desks/${ids.desk}`).expect(200)).body.desk;
    await api('adminA', 'patch', `/desk/desks/${ids.desk}`).send({ version: d.version, requesterCanReopen: false, autoCloseDays: null }).expect(200);
    expect((await mine('divya')).find((x) => x.id === ids.t)).toMatchObject({ reopenUntil: null, closesOn: null });
  });

  it('rating: bad input is refused; the raiser rates once; then the row shows the rating and no longer asks', async () => {
    await api('divya', 'post', `/desk/my/tickets/${ids.t}/rating`).send({ score: 6 }).expect(400);
    await api('divya', 'post', `/desk/my/tickets/${ids.t}/rating`).send({ score: 'good' }).expect(400);
    await api('divya', 'post', `/desk/my/tickets/not-a-uuid/rating`).send({ score: 4 }).expect(400);
    await api('divya', 'post', `/desk/my/tickets/${ids.t}/rating`).send({ score: 4 }).expect(200);
    expect((await mine('divya')).find((x) => x.id === ids.t)).toMatchObject({ rating: 4, canRate: false });
    expect((await api('divya', 'post', `/desk/my/tickets/${ids.t}/rating`).send({ score: 5 })).status).toBeGreaterThanOrEqual(400);
  });

  it('a colleague who follows the ticket sees it but cannot rate it', async () => {
    await api('divya', 'post', `/desk/my/tickets/${ids.t}/watchers`).send({ email: `ravi-${run}@hlp01.test` }).expect(201);
    const row = (await mine('ravi')).find((x) => x.id === ids.t)!;
    expect(row).toMatchObject({ canRate: false });
    expect((await api('ravi', 'post', `/desk/my/tickets/${ids.t}/rating`).send({ score: 1 })).status).toBeGreaterThanOrEqual(403);
  });

  it('an agent, a desk admin and another company never see her ticket in their own "My tickets"', async () => {
    for (const who of ['agent', 'deskAdmin', 'adminA', 'empB'] as const) expect((await mine(who)).map((x) => x.id)).not.toContain(ids.t);
    await api('empB', 'post', `/desk/my/tickets/${ids.t}/rating`).send({ score: 1 }).expect(404);
    await api('empB', 'get', `/desk/my/tickets/${ids.t}`).expect(404);
  });

  it('a waiting ticket shows its promise paused', async () => {
    const t = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.desk, subject: `Printer ${run}`, description: 'Jams.' }).expect(201)).body;
    const full = (await api('adminA', 'get', `/desk/desks/${ids.desk}`).expect(200)).body;
    const waiting = full.statuses.find((s: { systemState: string }) => s.systemState === 'pending').id;
    const v = (await system((tx) => tx.sdTicket.findFirstOrThrow({ where: { id: t.id } }))).version;
    await api('agent', 'patch', `/desk/tickets/${t.id}`).send({ version: v, statusId: waiting }).expect(200);
    expect((await mine('divya')).find((x) => x.id === t.id)!.clock).toMatchObject({ paused: true });
  });

  it('nobody signed in gets nothing', async () => {
    await request(server()).get('/api/v1/desk/my/tickets').expect(401);
  });
});
