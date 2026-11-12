import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';
import { giveStaffRoles, rolesWithout } from './fixtures/staff-roles';

// Console C-8, YX-13 and founder answer 1210, against the real database (forced RLS, app role). Talk to us on a nudge
// card lands in the staff sales-assist queue for that company and feature; staff take it and record the outcome.
describe('Console C-8 YX-13: sales-assist queue', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  const org = { A: '', B: '' };
  let planId = '';
  let nudgeId = '';
  let requestId = '';
  const api = (who: string, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who] ?? who}`);
  const inOrg = <T>(id: string, fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: id, isSuperAdmin: false }, fn);
  const withoutKey = async (key: string, fn: () => Promise<void>) => {
    await giveStaffRoles(users.staff!, await rolesWithout(key));
    try {
      await fn();
    } finally {
      await giveStaffRoles(users.staff!);
    }
  };
  const ask = { phone: '98450 12345', topics: ['parallel_run', 'pricing'], note: 'Two entities from April.' };
  type Row = { id: string; company: string; band: string; why: string; setupPct: number | null; owner: string | null; status: string; phone: string; requestedBy: string; version: number };
  const row = async (who = 'staff') => ((await api(who, 'get', '/platform/sales').expect(200)).body.rows as Row[]).find((r) => r.id === requestId)!;

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    for (const who of ['staff', 'staff2', 'staffNoKey']) {
      const email = `${who.toLowerCase()}-${run}@platform.test`;
      users[who] = (await tenantPrisma.forTenant(SUPER, (tx) => tx.user.create({ data: { email, name: `Staff ${who}`, passwordHash, role: 'super_admin', organizationId: null } }))).id;
      await giveStaffRoles(users[who]!);
      token[who] = (await request(server()).post('/api/v1/auth/platform/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
      if (who !== 'staffNoKey') await markSteppedUp(tenantPrisma, token[who]!);
    }
    planId = (await prisma.plan.create({ data: { name: `c8s-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const slug = `c8s-${k.toLowerCase()}-${run}`;
      org[k] = (await prisma.organization.create({ data: { name: `C8S ${k} ${run}`, slug, planId } })).id;
      const people = k === 'A' ? [['admin', 'org_admin'], ['panel', 'panel']] : [['admin', 'org_admin']];
      for (const [who, role] of people) {
        const email = `${who}-${k.toLowerCase()}-${run}@c8s.test`;
        users[`${who}${k}`] = (await inOrg(org[k], (tx) => tx.user.create({ data: { organizationId: org[k], email, name: `${who} ${k}`, passwordHash, role: role! } }))).id;
        token[`${who}${k}`] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
      }
    }
    // A live switch-on card for access requests; company A has them off, so its admin is shown the card.
    await tenantPrisma.forTenant(SUPER, (tx) => tx.featureNudge.updateMany({ where: { status: 'live', featureKey: 'access.requests', kind: 'switch_on' }, data: { status: 'retired', retiredAt: new Date() } }));
    await api('staff', 'post', '/platform/nudges').send({ featureKey: 'access.requests', kind: 'switch_on', heading: `Let people ask ${run}`, body: 'Switch on access requests so people can ask for a page.' }).expect(201);
    nudgeId = (await api('staff2', 'get', '/platform/nudges').expect(200)).body.nudges.find((n: { heading: string }) => n.heading === `Let people ask ${run}`).id;
    await api('staff2', 'post', `/platform/nudges/${nudgeId}/review`).send({ approve: true }).expect(200);
    await inOrg(org.A, (tx) => tx.setting.create({ data: { organizationId: org.A, scopeType: 'tenant', scopeId: org.A, key: 'access.request.allowed', value: 'off' } }));
    expect((await api('adminA', 'get', '/help/nudge').expect(200)).body.nudge).toMatchObject({ id: nudgeId, featureLabel: 'Access requests' });
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.featureNudge.updateMany({ where: { id: nudgeId, status: 'live' }, data: { status: 'retired', retiredAt: new Date() } });
        const ids = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: ids } } });
        await tx.session.deleteMany({ where: { userId: { in: ids } } });
        await tx.organization.deleteMany({ where: { id: { in: Object.values(org).filter(Boolean) } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  describe('Talk to us (answer 1210)', () => {
    it('refused: a nudge never shown to the person, a bad phone, an unknown topic', async () => {
      await api('panelA', 'post', '/help/talk-to-us').send({ nudgeId, ...ask }).expect(404);
      await api('adminB', 'post', '/help/talk-to-us').send({ nudgeId, ...ask }).expect(404);
      await api('adminA', 'post', '/help/talk-to-us').send({ nudgeId, ...ask, phone: '12345' }).expect(400);
      await api('adminA', 'post', '/help/talk-to-us').send({ nudgeId, ...ask, topics: ['discount'] }).expect(400);
      await request(server()).post('/api/v1/help/talk-to-us').send({ nudgeId, ...ask }).expect(401);
    });

    it('lands in the queue for that company and feature, with a reply time; once per company and feature', async () => {
      const sent = (await api('adminA', 'post', '/help/talk-to-us').send({ nudgeId, ...ask }).expect(201)).body;
      expect(new Date(sent.dueAt).getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);
      expect((await api('adminA', 'post', '/help/talk-to-us').send({ nudgeId, ...ask }).expect(409)).body.message).toMatch(/already asked/);
      const rows = (await api('staff', 'get', '/platform/sales').expect(200)).body.rows as Row[];
      const r = rows.find((x) => x.company === `C8S A ${run}`)!;
      requestId = r.id;
      expect(r).toMatchObject({ band: 'Under 50', owner: null, status: 'open', phone: '9845012345', requestedBy: 'admin A' });
      expect(r.why).toMatch(/Access requests · payroll parallel run · pricing/);
      expect(typeof r.setupPct).toBe('number');
    });

    it('the company log says who asked and about what (never the phone); companies cannot read the queue (RLS)', async () => {
      const log = await inOrg(org.A, (tx) => tx.auditLog.findMany({ where: { action: 'help.talk_to_us.sent', entityId: requestId } }));
      expect(log).toHaveLength(1);
      expect(log[0]!.metadataJson ?? '').not.toContain('9845012345');
      expect(await inOrg(org.A, (tx) => tx.salesAssistRequest.findMany({ where: { id: requestId } }))).toEqual([]);
      expect(await inOrg(org.B, (tx) => tx.salesAssistRequest.findMany())).toEqual([]);
    });
  });

  describe('the staff queue', () => {
    it('a company admin, no sign-in, staff without the security key or the sales key are refused', async () => {
      await api('adminA', 'get', '/platform/sales').expect(403);
      await request(server()).get('/api/v1/platform/sales').expect(401);
      expect((await api('staffNoKey', 'get', '/platform/sales').expect(403)).body.code).toBe('MFA_REQUIRED');
      await withoutKey('platform.sales.work', async () => {
        await api('staff', 'get', '/platform/sales').expect(403);
        await api('staff', 'post', `/platform/sales/${requestId}/take`).expect(403);
      });
    });

    it('one owner: the first to take it; the second is told', async () => {
      await api('staff', 'post', `/platform/sales/${requestId}/take`).expect(200);
      expect((await api('staff2', 'post', `/platform/sales/${requestId}/take`).expect(409)).body.message).toMatch(/Someone else took/);
      expect(await row()).toMatchObject({ owner: 'Staff staff' });
    });

    it('only the owner records the outcome; Lost needs a reason; a stale version is refused', async () => {
      const r = await row();
      expect((await api('staff2', 'post', `/platform/sales/${requestId}/outcome`).send({ status: 'converted', version: r.version }).expect(403)).body.message).toMatch(/only its owner/);
      await api('staff', 'post', `/platform/sales/${requestId}/outcome`).send({ status: 'lost', version: r.version }).expect(400);
      await api('staff', 'post', `/platform/sales/${requestId}/outcome`).send({ status: 'demo_booked', version: r.version + 5 }).expect(409);
      await api('staff', 'post', `/platform/sales/${requestId}/outcome`).send({ status: 'demo_booked', note: 'Demo on Friday', version: r.version }).expect(200);
      expect(await row()).toMatchObject({ status: 'demo_booked' });
    });

    it('closed: the company may ask again; every step is audited and the queue read has its purpose', async () => {
      await api('adminA', 'post', '/help/talk-to-us').send({ nudgeId, ...ask }).expect(201);
      const audit = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { entityId: requestId }, select: { action: true } }));
      expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['platform.sales.requested', 'platform.sales.taken', 'platform.sales.outcome']));
      const reads = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { actorUserId: users.staff!, action: 'platform.cross_tenant_read' } }));
      expect(reads.some((r) => (r.metadataJson ?? '').includes('sales.queue'))).toBe(true);
    });
  });
});
