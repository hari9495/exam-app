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

// HLP-05 SLA dashboard (Helpdesk design wiring), end to end against the real database (forced RLS, app role):
// GET desk/reports/sla gives targets met by desk, the weekly trend, open tickets at risk or missed (from the SLA
// engine's own business-minute clocks) and each agent's load. Positive and negative: an agent, a desk lead, a desk
// admin, an employee, another company, bad input.
describe('Service Desk HLP-05 SLA dashboard: exact figures, who sees what', () => {
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
  type Who = 'adminA' | 'adminB' | 'agent' | 'lead' | 'deskAdmin' | 'divya';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'patch' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const asA = (): TenantContext => ({ organizationId: org.A.id, isSuperAdmin: false, userId: null });
  const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  /** Moves a ticket's live resolution clock to `share` of its target (the engine keeps used seconds). */
  const useUp = (ticketId: string, share: number) =>
    tenantPrisma.forTenant(SUPER, async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
      const x = await tx.sdSlaTimer.findFirstOrThrow({ where: { ticketId, kind: 'sla', metric: 'resolution' } });
      await tx.sdSlaTimer.update({ where: { id: x.id }, data: { usedSeconds: Math.ceil(x.targetSeconds * share), resumedAt: x.state === 'running' ? new Date() : x.resumedAt } });
    });
  const raise = async (subject: string, categoryId?: string) => (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.desk, subject: `${subject} ${run}`, description: 'Please help.', ...(categoryId ? { categoryId } : {}) }).expect(201)).body.id as string;

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

    planId = (await prisma.plan.create({ data: { name: `hlp05-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HLP05 Org ${k}`, slug: `hlp05-${k.toLowerCase()}-${run}`, planId } });
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
    ];
    for (const [who, k, role, tpl] of roster) {
      const o = org[k].id;
      const permissionProfileId = tpl ? await profile(o, tpl) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}-${run}@hlp05.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}-${run}@hlp05.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await tenantPrisma.forTenant(asA(), async (tx) => {
      const p = await tx.person.create({ data: { organizationId: org.A.id, givenName: 'Divya', primaryEmail: `divya-${run}@hlp05.test` } });
      await tx.personRole.create({ data: { organizationId: org.A.id, personId: p.id, roleType: 'login', sourceTable: 'users', sourceId: users.divya, startOn: new Date('2026-01-01') } });
    });
    ids.desk = (await api('adminA', 'post', '/desk/desks').send({ name: 'IT help desk', key: 'IT', kind: 'it' }).expect(201)).body.id;
    for (const [who, role] of [['agent', 'agent'], ['lead', 'lead'], ['deskAdmin', 'admin']] as const) await api('adminA', 'post', `/desk/desks/${ids.desk}/members`).send({ userId: users[who], role }).expect(201);
    ids.deskB = (await api('adminB', 'post', '/desk/desks').send({ name: 'B IT', key: 'BIT', kind: 'it' }).expect(201)).body.id;
    const cal = (await api('adminA', 'post', '/desk/calendars').send({ name: `Always ${run}`, timeZone: 'Asia/Kolkata', hours: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 0, endMinute: 1440 })) }).expect(201)).body;
    await api('adminA', 'post', `/desk/desks/${ids.desk}/sla-policies`)
      .send({ name: 'IT standard', kind: 'sla', scope: { match: 'all', rules: [] }, calendarSource: 'calendar', calendarId: cal.id, targets: [{ metric: 'first_response', minutes: [30, 60, 120, 240] }, { metric: 'resolution', minutes: [240, 480, 960, 1920] }] })
      .expect(201);

    // Four open tickets: one fine, one at risk (85 % used), one missed (120 %), one missed but sensitive.
    ids.fine = await raise('Mouse broken');
    ids.risk = await raise('VPN drops');
    ids.late = await raise('Laptop dead');
    const secret = (await api('adminA', 'post', `/desk/desks/${ids.desk}/categories`).send({ name: `Security ${run}`, sensitive: true }).expect(201)).body.id;
    ids.secret = await raise('Phishing mail', secret);
    await useUp(ids.risk, 0.85);
    await useUp(ids.late, 1.2);
    await useUp(ids.secret, 1.5);
    await api('agent', 'post', `/desk/tickets/${ids.late}/assign`).send({ userId: users.agent }).expect(200);
    await api('agent', 'post', `/desk/tickets/${ids.risk}/assign`).send({ userId: users.agent }).expect(200);
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

  type Sla = {
    open: number;
    breachedNow: number;
    atRiskCount: number;
    atRiskHidden: number;
    firstResponseMetPct: number | null;
    resolutionTarget: number | null;
    queues: { deskId: string; name: string; met: number; breached: number }[];
    weeks: { week: string; metPct: number | null }[];
    agents: { userId: string; open: number; atRisk: number; desks: string }[];
    atRisk: { id: string; deskName: string; resolution: { usedMinutes: number; targetMinutes: number; paused: boolean }; assignee: { id: string } | null }[];
  };

  it('a desk lead sees exact counts: open, missed now, at risk, and the list from the live clocks', async () => {
    const s = (await api('lead', 'get', `/desk/reports/sla?from=${today}&to=${today}`).expect(200)).body as Sla;
    expect(s.open).toBe(4);
    expect(s.breachedNow).toBe(2);
    expect(s.atRiskCount).toBe(3);
    // The lead is on the desk's team, so the sensitive one is listed too; the most used first.
    expect(s.atRisk.map((x) => x.id)).toEqual([ids.secret, ids.late, ids.risk]);
    expect(s.atRiskHidden).toBe(0);
    const late = s.atRisk.find((x) => x.id === ids.late)!;
    expect(late.resolution.usedMinutes).toBeGreaterThanOrEqual(late.resolution.targetMinutes);
    expect(late.assignee?.id).toBe(users.agent);
    expect(late.deskName).toBe('IT help desk');
    expect(s.agents).toEqual([expect.objectContaining({ userId: users.agent, open: 2, atRisk: 2, desks: 'IT help desk' })]);
    expect(s.weeks.length).toBe(1);
  });

  it('kept and missed targets in the period count by desk and week; the period before is separate', async () => {
    // One first response kept today, one resolution missed today, one resolution kept today.
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
      const now = new Date();
      const fr = await tx.sdSlaTimer.findFirstOrThrow({ where: { ticketId: ids.fine, metric: 'first_response' } });
      await tx.sdSlaTimer.update({ where: { id: fr.id }, data: { state: 'met', metAt: now, resumedAt: null } });
      const r1 = await tx.sdSlaTimer.findFirstOrThrow({ where: { ticketId: ids.late, metric: 'resolution' } });
      await tx.sdSlaTimer.update({ where: { id: r1.id }, data: { breachedAt: now } });
      const r2 = await tx.sdSlaTimer.findFirstOrThrow({ where: { ticketId: ids.fine, metric: 'resolution' } });
      await tx.sdSlaTimer.update({ where: { id: r2.id }, data: { state: 'met', metAt: now, resumedAt: null } });
    });
    const s = (await api('lead', 'get', `/desk/reports/sla?from=${today}&to=${today}&deskId=${ids.desk}`).expect(200)).body as Sla;
    expect(s.firstResponseMetPct).toBe(100);
    expect(s.queues).toEqual([{ deskId: ids.desk, name: 'IT help desk', met: 1, breached: 1 }]);
    expect(s.weeks.find((w) => w.metPct !== null)!.metPct).toBe(50);
    expect(s.open).toBe(4);
    const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const y = (await api('lead', 'get', `/desk/reports/sla?from=${yesterday}&to=${yesterday}`).expect(200)).body as Sla;
    expect(y.queues[0]).toMatchObject({ met: 0, breached: 0 });
    expect(y.firstResponseMetPct).toBeNull();
  });

  it('the target line is the desk\'s own resolution target, only when one desk is chosen', async () => {
    expect(((await api('lead', 'get', `/desk/reports/sla?deskId=${ids.desk}`).expect(200)).body as Sla).resolutionTarget).toBeNull();
    await api('deskAdmin', 'put', `/desk/desks/${ids.desk}/sla-targets`).send({ targets: [{ metric: 'resolution', priority: null, targetPercent: 92 }] }).expect(200);
    const s = (await api('lead', 'get', `/desk/reports/sla?deskId=${ids.desk}`).expect(200)).body as Sla;
    expect(s.resolutionTarget).toBe(92);
    expect(((await api('lead', 'get', '/desk/reports/sla').expect(200)).body as Sla).resolutionTarget).toBeNull();
  });

  it('a desk admin gets the counts but never a sensitive ticket in the list', async () => {
    const s = (await api('deskAdmin', 'get', '/desk/reports/sla').expect(200)).body as Sla;
    expect(s.breachedNow).toBe(2);
    expect(s.atRisk.map((x) => x.id)).not.toContain(ids.secret);
    expect(s.atRiskHidden).toBe(1);
  });

  it('an agent and an employee are refused (desk.report.view)', async () => {
    await api('agent', 'get', '/desk/reports/sla').expect(403);
    await api('divya', 'get', '/desk/reports/sla').expect(403);
  });

  it('another company sees none of it, and may not ask for this desk', async () => {
    const b = (await api('adminB', 'get', '/desk/reports/sla').expect(200)).body as Sla;
    expect(b).toMatchObject({ open: 0, breachedNow: 0, atRisk: [] });
    expect(b.queues.map((q) => q.deskId)).toEqual([ids.deskB]);
    await api('adminB', 'get', `/desk/reports/sla?deskId=${ids.desk}`).expect(404);
    await api('lead', 'get', `/desk/reports/sla?deskId=${ids.deskB}`).expect(404);
  });

  it('bad input is refused: a bad date, a reversed period, more than a year, a bad desk id, an extra field', async () => {
    await api('lead', 'get', '/desk/reports/sla?from=03-11-2026').expect(400);
    await api('lead', 'get', '/desk/reports/sla?from=2026-11-03&to=2026-11-01').expect(400);
    await api('lead', 'get', '/desk/reports/sla?from=2024-01-01&to=2026-01-01').expect(400);
    await api('lead', 'get', '/desk/reports/sla?deskId=nope').expect(400);
    await api('lead', 'get', '/desk/reports/sla?hack=1').expect(400);
    await request(server()).get('/api/v1/desk/reports/sla').expect(401);
  });
});
