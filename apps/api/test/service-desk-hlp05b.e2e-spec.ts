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

// HLP-05b (founder 3 Nov 2026): each desk chooses its "at risk" point (50, 60, 70, 80 or 90 % of a target, default 80),
// in Desk set-up like the other desk settings, and the one rule (clockState) uses it on the SLA dashboard and the agent
// desk's "At risk or breached" view and clocks. End to end against the real database (forced RLS, app role). Positive
// and negative: the desk admin, an agent, a desk lead, another company, bad input, the other desk untouched, audit.
describe('Service Desk HLP-05b at-risk point per desk', () => {
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

    planId = (await prisma.plan.create({ data: { name: `hlp05b-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HLP05B Org ${k}`, slug: `hlp05b-${k.toLowerCase()}-${run}`, planId } });
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
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}-${run}@hlp05b.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}-${run}@hlp05b.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await tenantPrisma.forTenant(asA(), async (tx) => {
      const p = await tx.person.create({ data: { organizationId: org.A.id, givenName: 'Divya', primaryEmail: `divya-${run}@hlp05b.test` } });
      await tx.personRole.create({ data: { organizationId: org.A.id, personId: p.id, roleType: 'login', sourceTable: 'users', sourceId: users.divya, startOn: new Date('2026-01-01') } });
    });
    ids.desk = (await api('adminA', 'post', '/desk/desks').send({ name: 'IT help desk', key: 'IT', kind: 'it' }).expect(201)).body.id;
    for (const [who, role] of [['agent', 'agent'], ['lead', 'lead'], ['deskAdmin', 'admin']] as const) await api('adminA', 'post', `/desk/desks/${ids.desk}/members`).send({ userId: users[who], role }).expect(201);
    ids.deskB = (await api('adminB', 'post', '/desk/desks').send({ name: 'B IT', key: 'BIT', kind: 'it' }).expect(201)).body.id;
    const cal = (await api('adminA', 'post', '/desk/calendars').send({ name: `Always ${run}`, timeZone: 'Asia/Kolkata', hours: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 0, endMinute: 1440 })) }).expect(201)).body;
    ids.hr = (await api('adminA', 'post', '/desk/desks').send({ name: 'HR help desk', key: 'HR', kind: 'hr' }).expect(201)).body.id;
    for (const d of [ids.desk, ids.hr])
      await api('adminA', 'post', `/desk/desks/${d}/sla-policies`)
        .send({ name: 'Standard', kind: 'sla', scope: { match: 'all', rules: [] }, calendarSource: 'calendar', calendarId: cal.id, targets: [{ metric: 'first_response', minutes: [30, 60, 120, 240] }, { metric: 'resolution', minutes: [240, 480, 960, 1920] }] })
        .expect(201);
    // IT: one ticket at 60 % of its resolution target, one at 85 %. HR: one at 85 %.
    ids.sixty = await raise('Mouse broken');
    ids.eightyFive = await raise('VPN drops');
    ids.hrTicket = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.hr, subject: `Payslip ${run}`, description: 'Please help.' }).expect(201)).body.id;
    await useUp(ids.sixty, 0.6);
    await useUp(ids.eightyFive, 0.85);
    await useUp(ids.hrTicket, 0.85);

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


  const deskOf = async (who: Who, id: string) => (await api(who, 'get', `/desk/desks/${id}`).expect(200)).body.desk as { atRiskPercent: number; version: number };
  const setPoint = (who: Who, id: string, version: number, atRiskPercent: unknown) => api(who, 'patch', `/desk/desks/${id}`).send({ version, atRiskPercent });
  const breaching = async () => ((await api('lead', 'get', '/desk/tickets?breaching=true&limit=100').expect(200)).body.items as { id: string; resolution: { atRiskPercent: number } | null }[]);
  const slaAtRisk = async (deskId: string, who: Who = 'lead') => ((await api(who, 'get', `/desk/reports/sla?deskId=${deskId}`).expect(200)).body as { atRiskCount: number; atRisk: { id: string; resolution: { atRiskPercent: number } }[] });

  it('every desk starts at 80 %: only the 85 % tickets are at risk, and each clock carries the point', async () => {
    expect((await deskOf('deskAdmin', ids.desk)).atRiskPercent).toBe(80);
    const ids80 = (await breaching()).map((x) => x.id);
    expect(ids80).toEqual(expect.arrayContaining([ids.eightyFive]));
    expect(ids80).not.toContain(ids.sixty);
    expect((await slaAtRisk(ids.desk)).atRisk.map((x) => x.id)).toEqual([ids.eightyFive]);
    expect((await slaAtRisk(ids.desk)).atRisk[0].resolution.atRiskPercent).toBe(80);
  });

  it('50 % puts the 60 % ticket at risk on the dashboard and the agent desk; the HR desk stays at 80 %', async () => {
    const d = await deskOf('deskAdmin', ids.desk);
    expect((await setPoint('deskAdmin', ids.desk, d.version, 50).expect(200)).body.atRiskPercent).toBe(50);
    const s = await slaAtRisk(ids.desk);
    expect(s.atRiskCount).toBe(2);
    expect(s.atRisk.map((x) => x.id).sort()).toEqual([ids.sixty, ids.eightyFive].sort());
    expect(s.atRisk[0].resolution.atRiskPercent).toBe(50);
    const list = await breaching();
    expect(list.map((x) => x.id)).toEqual(expect.arrayContaining([ids.sixty, ids.eightyFive]));
    expect(list.find((x) => x.id === ids.sixty)!.resolution!.atRiskPercent).toBe(50);
    expect((await deskOf('adminA', ids.hr)).atRiskPercent).toBe(80);
    const ticket = (await api('lead', 'get', `/desk/tickets/${ids.sixty}/sla`).expect(200)).body as { metric: string; atRiskPercent: number }[];
    expect(ticket.find((x) => x.metric === 'resolution')!.atRiskPercent).toBe(50);
  });

  it('90 % takes both IT tickets off the list; the HR ticket at 85 % stays at risk under its own 80 %', async () => {
    const d = await deskOf('deskAdmin', ids.desk);
    await setPoint('deskAdmin', ids.desk, d.version, 90).expect(200);
    expect((await slaAtRisk(ids.desk)).atRiskCount).toBe(0);
    // HR tickets stay with HR's own team, so the company admin sees the count, not the ticket.
    expect((await slaAtRisk(ids.hr, 'adminA')).atRiskCount).toBe(1);
    const list = (await breaching()).map((x) => x.id);
    expect(list).not.toContain(ids.sixty);
    expect(list).not.toContain(ids.eightyFive);
  });

  it('the change is audited with before and after', async () => {
    const rows = await tenantPrisma.forTenant(asA(), (tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'desk.desk.updated', entityId: ids.desk }, orderBy: { createdAt: 'asc' } }));
    const changes = rows.map((r) => (JSON.parse(r.metadataJson ?? "{}") as { changed?: Record<string, { from: unknown; to: unknown }> }).changed?.atRiskPercent).filter(Boolean);
    expect(changes).toEqual([{ from: 80, to: 50 }, { from: 50, to: 90 }]);
  });

  it('only the five choices are taken; a stale version is refused', async () => {
    const d = await deskOf('deskAdmin', ids.desk);
    for (const bad of [75, 0, 100, 'eighty', null]) await setPoint('deskAdmin', ids.desk, d.version, bad).expect(400);
    await setPoint('deskAdmin', ids.desk, d.version - 1, 70).expect(409);
    expect((await deskOf('deskAdmin', ids.desk)).atRiskPercent).toBe(90);
  });

  it('rights as the other desk settings: an agent and an employee may not change it; a lead may not', async () => {
    const d = await deskOf('deskAdmin', ids.desk);
    await setPoint('agent', ids.desk, d.version, 50).expect(403);
    await setPoint('lead', ids.desk, d.version, 50).expect(403);
    expect([403, 404]).toContain((await setPoint('divya', ids.desk, d.version, 50)).status);
    expect((await deskOf('deskAdmin', ids.desk)).atRiskPercent).toBe(90);
  });

  it('another company can neither see nor change it', async () => {
    const d = await deskOf('deskAdmin', ids.desk);
    await setPoint('adminB', ids.desk, d.version, 50).expect(404);
    expect((await deskOf('adminB', ids.deskB)).atRiskPercent).toBe(80);
    expect((await deskOf('deskAdmin', ids.desk)).atRiskPercent).toBe(90);
  });
});
