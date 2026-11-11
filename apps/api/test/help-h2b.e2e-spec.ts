import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { AccessRequestsService } from '../src/access/access-requests.service';
import { NotFoundRetentionService } from '../src/help/not-found-retention.service';
import { markSteppedUp } from './fixtures/step-up';

// Help and onboarding H-2b (founder answers 973 and 974), against the real database (forced RLS).
// 973: a request still waiting 2 working days (Monday to Friday less the company's holidays, IST days) reminds the
//      System Admins once, in the bell and as overdue in their Approvals inbox; never a decided request, never twice.
// 974: Not found references past the company's period (90 days by default) are deleted nightly, each company in its
//      own context; the app itself still may not delete them.
describe('Help H-2b: access request reminders and Not found retention', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let reminders: AccessRequestsService;
  let retention: NotFoundRetentionService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();

  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  type Who = 'anitha' | 'suresh' | 'ravi' | 'admin1' | 'admin2' | 'adminB' | 'bea';
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const ctx = (k: 'A' | 'B') => ({ organizationId: org[k].id, isSuperAdmin: false });
  const email = (who: string) => `${who}-${runId}@helph2b.test`;
  const ask = (who: Who, page: string) =>
    api(who, 'post', '/access/requests')
      .send({ page, what: 'payroll runs', reason: 'I cover the October run while Suresh is on leave.', days: 14 })
      .expect(201)
      .then((r) => r.body.id as string);
  /** An IST wall-clock time as a moment. */
  const at = (ist: string) => new Date(`${ist}+05:30`);
  const sentAt = (k: 'A' | 'B', id: string, ist: string) => tenantPrisma.forTenant(ctx(k), (tx) => tx.accessRequest.update({ where: { id }, data: { createdAt: at(ist) } }));
  const reminded = (k: 'A' | 'B', id: string) => tenantPrisma.forTenant(ctx(k), (tx) => tx.accessRequest.findUniqueOrThrow({ where: { id } })).then((r) => r.remindedAt);
  const notices = (k: 'A' | 'B', who: Who) => tenantPrisma.forTenant(ctx(k), (tx) => tx.userNotification.findMany({ where: { organizationId: org[k].id, recipientUserId: users[who], type: 'access.request.reminder' } }));
  const audits = (k: 'A' | 'B', id: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId: org[k].id, action: 'access.request.reminded', entityId: id } }));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    reminders = moduleRef.get(AccessRequestsService);
    retention = moduleRef.get(NotFoundRetentionService);

    planId = (await prisma.plan.create({ data: { name: `helph2b-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Org ${k}`, slug: `helph2b-${k.toLowerCase()}-${runId}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string][] = [
      ['anitha', 'A', 'panel'],
      ['suresh', 'A', 'panel'],
      ['ravi', 'A', 'panel'],
      ['admin1', 'A', 'org_admin'],
      ['admin2', 'A', 'org_admin'],
      ['adminB', 'B', 'org_admin'],
      ['bea', 'B', 'panel'],
    ];
    for (const [name, k, role] of roster) {
      users[name] = (await tenantPrisma.forTenant(ctx(k), (tx) => tx.user.create({ data: { organizationId: org[k].id, email: email(name), name: `${name[0]!.toUpperCase()}${name.slice(1)}`, passwordHash, role } }))).id;
      token[name] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: email(name), password: PASSWORD }).expect(200)).body.accessToken;
    }
    // Company A is closed on Friday 13 Nov 2026 (its company-wide holiday calendar).
    await tenantPrisma.forTenant(ctx('A'), async (tx) => {
      const cal = await tx.holidayCalendar.create({ data: { organizationId: org.A.id, name: 'Company holidays' } });
      await tx.holiday.create({ data: { organizationId: org.A.id, calendarId: cal.id, holidayOn: new Date('2026-11-13T00:00:00Z'), name: 'Company day' } });
    });
  }, 240_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.refreshToken.deleteMany({ where: { userId: { in: Object.values(users) } } });
        await tx.session.deleteMany({ where: { userId: { in: Object.values(users) } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
        await tx.user.deleteMany({ where: { id: { in: Object.values(users) } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  describe('973 remind the System Admins once after 2 working days', () => {
    const req: Record<string, string> = {};
    beforeAll(async () => {
      req.mon = await ask('anitha', '/yx/payroll/runs');
      await sentAt('A', req.mon, '2026-11-09T10:00:00');
      req.decided = await ask('suresh', '/yx/payroll/runs');
      await sentAt('A', req.decided, '2026-11-09T09:00:00');
      req.thu = await ask('ravi', '/yx/payroll/runs');
      await sentAt('A', req.thu, '2026-11-12T23:30:00');
      req.b = await ask('bea', '/yx/payroll/runs');
      await sentAt('B', req.b, '2026-11-09T10:00:00');
      await markSteppedUp(tenantPrisma, token.admin1);
      const refused = await api('admin1', 'post', `/access/requests/${req.decided}/refuse`).send({ reason: 'Suresh is back on Monday.' });
      expect([200, 201]).toContain(refused.status);
    });

    it('negative: after 1 working day (sent Monday, now Tuesday) nobody is reminded', async () => {
      expect(await reminders.remindSweep(at('2026-11-10T18:00:00'), [org.A.id])).toBe(0);
      expect(await reminded('A', req.mon)).toBeNull();
      expect(await notices('A', 'admin1')).toHaveLength(0);
    });

    it('after 2 working days (Wednesday, IST) the System Admins are reminded once, in the bell and as overdue in the inbox; not the person who asked', async () => {
      // 00:30 on Wednesday IST is still Tuesday in UTC: the IST day counts.
      expect(await reminders.remindSweep(at('2026-11-11T00:30:00'), [org.A.id])).toBe(1);
      expect(await reminded('A', req.mon)).toEqual(at('2026-11-11T00:30:00'));
      for (const who of ['admin1', 'admin2'] as const) {
        const n = await notices('A', who);
        expect(n).toHaveLength(1);
        expect(n[0]).toMatchObject({ entityId: req.mon, linkPath: '/yx/settings/access?view=requests' });
        expect(n[0]!.contextText).toContain('has waited 2 working days');
      }
      expect(await notices('A', 'anitha')).toHaveLength(0);
      expect(await audits('A', req.mon)).toHaveLength(1);
      const inbox = (await api('admin1', 'get', '/workflow/approvals/inbox').expect(200)).body as { requestId: string; dueAt: string | null }[];
      expect(inbox.find((x) => x.requestId === req.mon)?.dueAt).toBe(at('2026-11-11T00:00:00').toISOString());
    });

    it('negative: a request already decided is never reminded', async () => {
      expect(await reminded('A', req.decided)).toBeNull();
      expect(await audits('A', req.decided)).toHaveLength(0);
    });

    it('negative: a rerun, a later run or two servers at once never remind twice', async () => {
      expect(await reminders.remindSweep(at('2026-11-11T00:30:00'), [org.A.id])).toBe(0);
      expect(await reminders.remindSweep(at('2026-11-11T09:25:00'), [org.A.id])).toBe(0);
      await Promise.all([reminders.remindSweep(at('2026-11-12T09:25:00'), [org.A.id]), reminders.remindSweep(at('2026-11-12T09:25:00'), [org.A.id])]);
      for (const who of ['admin1', 'admin2'] as const) expect(await notices('A', who)).toHaveLength(1);
      expect(await audits('A', req.mon)).toHaveLength(1);
    });

    it("working days skip the weekend and the company's holiday: sent Thursday night, Friday closed, so not Monday but Tuesday", async () => {
      expect(await reminders.remindSweep(at('2026-11-16T12:00:00'), [org.A.id])).toBe(0);
      expect(await reminded('A', req.thu)).toBeNull();
      expect(await reminders.remindSweep(at('2026-11-17T00:25:00'), [org.A.id])).toBe(1);
      expect(await reminded('A', req.thu)).not.toBeNull();
    });

    it("each company only in its own run: company A's runs never touched company B's request; B's run reminds B's admin only", async () => {
      expect(await reminded('B', req.b)).toBeNull();
      expect(await notices('B', 'adminB')).toHaveLength(0);
      expect(await reminders.remindSweep(at('2026-11-11T10:00:00'), [org.B.id])).toBe(1);
      expect(await notices('B', 'adminB')).toHaveLength(1);
      expect(await notices('A', 'admin1')).toHaveLength(2);
      // Under company A's context, company B's request cannot even be seen.
      expect(await tenantPrisma.forTenant(ctx('A'), (tx) => tx.accessRequest.findFirst({ where: { id: req.b } }))).toBeNull();
    });
  });

  describe('974 Not found references are deleted after the company period', () => {
    const add = (k: 'A' | 'B', code: string, daysOld: number) =>
      tenantPrisma.forTenant(ctx(k), (tx) => tx.notFoundRef.create({ data: { organizationId: org[k].id, code, path: '/yx/people/x', createdAt: new Date(Date.now() - daysOld * 86_400_000) } }));
    const codes = (k: 'A' | 'B') =>
      tenantPrisma.forTenant(ctx(k), (tx) => tx.notFoundRef.findMany({ where: { organizationId: org[k].id }, select: { code: true } })).then((r) => r.map((x) => x.code).sort());

    beforeAll(async () => {
      await add('A', 'NF-AAAA89', 89);
      await add('A', 'NF-AAAA9Z', 91);
      await add('B', 'NF-BBBB9Z', 91);
      await add('B', 'NF-BBBB95', 95);
    });

    it('negative: the app itself still may not delete them; the purge refuses without a company or under 30 days', async () => {
      await expect(tenantPrisma.forTenant(ctx('A'), (tx) => tx.notFoundRef.deleteMany({ where: { organizationId: org.A.id } }))).rejects.toThrow();
      await expect(tenantPrisma.forTenant(SUPER, (tx) => tx.$queryRaw`SELECT purge_not_found_refs(90)`)).rejects.toThrow(/inside one company/);
      await expect(tenantPrisma.forTenant(ctx('A'), (tx) => tx.$queryRaw`SELECT purge_not_found_refs(29)`)).rejects.toThrow(/at least 30 days/);
      expect(await codes('A')).toEqual(['NF-AAAA89', 'NF-AAAA9Z']);
    });

    it("by default (90 days) 91 days old goes and 89 stays, audited; company A's run never touches company B", async () => {
      expect(await retention.prune([org.A.id])).toBe(1);
      expect(await codes('A')).toEqual(['NF-AAAA89']);
      expect(await codes('B')).toEqual(['NF-BBBB95', 'NF-BBBB9Z']);
      expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'help.not_found.purged' } }))).toBe(1);
    });

    it('a company that keeps them 180 days keeps 91 and 95 days old; only a System Admin sets it; a rerun deletes nothing more', async () => {
      await markSteppedUp(tenantPrisma, token.adminB);
      await api('adminB', 'put', '/org/settings').send({ key: 'help.not_found.keep_days', scopeType: 'tenant', value: '180' }).expect(200);
      expect((await api('bea', 'put', '/org/settings').send({ key: 'help.not_found.keep_days', scopeType: 'tenant', value: '30' })).status).toBe(403);
      await api('adminB', 'put', '/org/settings').send({ key: 'help.not_found.keep_days', scopeType: 'tenant', value: '7' }).expect(400);
      expect(await retention.prune([org.B.id])).toBe(0);
      expect(await codes('B')).toEqual(['NF-BBBB95', 'NF-BBBB9Z']);
      expect(await retention.prune([org.A.id, org.B.id])).toBe(0);
      expect(await codes('A')).toEqual(['NF-AAAA89']);
    });
  });
});
