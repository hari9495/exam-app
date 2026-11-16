import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { IncidentsService } from '../src/platform/incidents.service';
import { markSteppedUp } from './fixtures/step-up';
import { giveStaffRoles, rolesWithout } from './fixtures/staff-roles';

// Console C-8, YX-10 incidents and answer 1124, against the real database (forced RLS, app role). Staff declare an
// incident; a second staff member approves each update; only companies with an affected product see the banner while it
// is open; a security breach linked to a containment is never shown to companies and reminds staff before the CERT-In
// and DPDP due times.
describe('Console C-8 YX-10: incidents and breach reminders', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const sent: { to: string; subject: string }[] = [];
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const PRODUCT = `c8i${run}`;
  const server = () => app.getHttpServer();
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  const org = { A: '', B: '' };
  let planId = '';
  let leadBefore: string | null = null;
  const api = (who: string, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who] ?? who}`);
  const inOrg = <T>(id: string, fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: id, isSuperAdmin: false }, fn);
  // Staff roles (answer 1058): staff without a key = without every role that holds it (restored straight after).
  const withoutKey = async (key: string, fn: () => Promise<void>) => {
    const keep = await rolesWithout(key);
    for (const who of ['staff', 'staff2']) await giveStaffRoles(users[who]!, keep);
    try {
      await fn();
    } finally {
      for (const who of ['staff', 'staff2']) await giveStaffRoles(users[who]!);
    }
  };
  const first = { title: `Payslip PDFs slow ${run}`, severity: 2, products: [PRODUCT], stage: 'identified', impact: 'Payslip PDFs take up to 40 seconds to open.', action: 'No action needed.', nextUpdateMinutes: 30, payrollNote: true };
  type Row = { id: string; title: string; status: string; updates: { id: string; status: string; mine: boolean }[]; breach: { certinRemindedAt: string | null; dpdpRemindedAt: string | null } | null };
  const find = (body: { incidents: Row[] }, title: string) => body.incidents.find((i) => i.title === title)!;

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async (m: { to: string; subject: string }) => (sent.push({ to: m.to, subject: m.subject }), { success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    leadBefore = (await tenantPrisma.forTenant(SUPER, (tx) => tx.platformSetting.findUnique({ where: { key: 'incident.breach_reminder_lead_hours' } })))?.value ?? null;
    const passwordHash = await argon2.hash(PASSWORD);
    for (const who of ['staff', 'staff2', 'staffNoKey']) {
      const email = `${who.toLowerCase()}-${run}@platform.test`;
      users[who] = (await tenantPrisma.forTenant(SUPER, (tx) => tx.user.create({ data: { email, name: `Staff ${who}`, passwordHash, role: 'super_admin', organizationId: null } }))).id;
      // Staff roles (answer 1058): the Security lead holds the incidents key; staffNoKey is only a Rules editor.
      await giveStaffRoles(users[who]!, who === 'staffNoKey' ? ['rules_editor'] : undefined);
      token[who] = (await request(server()).post('/api/v1/auth/platform/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
      if (who !== 'staffNoKey') await markSteppedUp(tenantPrisma, token[who]!);
    }
    // A product of this run only, so no other company sees these incidents.
    await tenantPrisma.forTenant(SUPER, (tx) => tx.product.create({ data: { code: PRODUCT, name: `C8 test product ${run}`, unit: 'employee' } }));
    planId = (await prisma.plan.create({ data: { name: `c8i-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const slug = `c8i-${k.toLowerCase()}-${run}`;
      org[k] = (await prisma.organization.create({ data: { name: `C8I ${k} ${run}`, slug, planId } })).id;
      const email = `admin-${k.toLowerCase()}-${run}@c8i.test`;
      users[`admin${k}`] = (await inOrg(org[k], (tx) => tx.user.create({ data: { organizationId: org[k], email, name: `Admin ${k}`, passwordHash, role: 'org_admin' } }))).id;
      token[`admin${k}`] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    // Company A has the affected product; company B does not.
    await tenantPrisma.forTenant(SUPER, (tx) => tx.organizationProduct.create({ data: { organizationId: org.A, productCode: PRODUCT } }));
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        // Incidents are never deleted: resolve this run's, unlink nothing else.
        await tx.platformIncident.updateMany({ where: { products: { has: PRODUCT }, status: 'open' }, data: { status: 'resolved', resolvedAt: new Date() } });
        if (leadBefore === null) await tx.platformSetting.deleteMany({ where: { key: 'incident.breach_reminder_lead_hours' } });
        else await tx.platformSetting.update({ where: { key: 'incident.breach_reminder_lead_hours' }, data: { value: leadBefore } });
        const ids = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: ids } } });
        await tx.session.deleteMany({ where: { userId: { in: ids } } });
        await tx.organizationProduct.deleteMany({ where: { productCode: PRODUCT } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  describe('who may use it', () => {
    it('a company admin and no sign-in are refused', async () => {
      await api('adminA', 'get', '/platform/incidents').expect(403);
      await api('adminA', 'post', '/platform/incidents').send(first).expect(403);
      await request(server()).get('/api/v1/platform/incidents').expect(401);
    });

    it('staff without their security key are refused', async () => {
      expect((await api('staffNoKey', 'get', '/platform/incidents').expect(403)).body.code).toBe('MFA_REQUIRED');
    });

    it('staff without the incidents key are refused', async () => {
      await withoutKey('platform.incidents.manage', async () => {
        await api('staff', 'get', '/platform/incidents').expect(403);
        await api('staff', 'post', '/platform/incidents').send(first).expect(403);
      });
    });

    it('bad input is refused: no product, an unknown product, a severity of 4, markup', async () => {
      await api('staff', 'post', '/platform/incidents').send({ ...first, products: [] }).expect(400);
      await api('staff', 'post', '/platform/incidents').send({ ...first, products: ['no-such-product'] }).expect(400);
      await api('staff', 'post', '/platform/incidents').send({ ...first, severity: 4 }).expect(400);
      await api('staff', 'post', '/platform/incidents').send({ ...first, impact: '<script>alert(1)</script> slow' }).expect(400);
    });
  });

  describe('declare, approve, resolve', () => {
    let id = '';

    it('declared: companies see nothing until another staff member approves the update', async () => {
      const body = (await api('staff', 'post', '/platform/incidents').send(first).expect(201)).body;
      const row = find(body, first.title);
      id = row.id;
      expect(row.updates).toEqual([expect.objectContaining({ status: 'pending', mine: true })]);
      expect((await api('adminA', 'get', '/availability').expect(200)).body.incident).toBeNull();
    });

    it('the writer cannot approve their own update', async () => {
      const u = find((await api('staff', 'get', '/platform/incidents').expect(200)).body, first.title).updates[0]!;
      expect((await api('staff', 'post', `/platform/incidents/${id}/updates/${u.id}/review`).send({ approve: true }).expect(403)).body.message).toMatch(/Another staff member approves it/);
    });

    it('sending back needs a note; one update waits at a time', async () => {
      const u = find((await api('staff2', 'get', '/platform/incidents').expect(200)).body, first.title).updates[0]!;
      await api('staff2', 'post', `/platform/incidents/${id}/updates/${u.id}/review`).send({ approve: false }).expect(400);
      await api('staff', 'post', `/platform/incidents/${id}/updates`).send({ stage: 'monitoring', impact: 'Mostly back to normal now.', action: 'No action needed.' }).expect(409);
    });

    it('approved: only the company with the affected product sees the banner', async () => {
      const u = find((await api('staff2', 'get', '/platform/incidents').expect(200)).body, first.title).updates[0]!;
      await api('staff2', 'post', `/platform/incidents/${id}/updates/${u.id}/review`).send({ approve: true }).expect(200);
      const a = (await api('adminA', 'get', '/availability').expect(200)).body.incident;
      expect(a).toMatchObject({ title: first.title, severity: 2, stage: 'identified', impact: first.impact, action: first.action });
      expect(a.payrollNote).toBe(true);
      expect(Object.keys(a).sort()).toEqual(['action', 'impact', 'nextUpdateAt', 'payrollNote', 'severity', 'stage', 'title', 'updatedAt']);
      expect((await api('adminB', 'get', '/availability').expect(200)).body.incident).toBeNull();
    });

    it('every step is audited', async () => {
      const rows = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { entityId: id }, select: { action: true } }));
      expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(['platform.incident.opened', 'platform.incident.update_posted']));
    });

    it('a resolved update, once approved, resolves it and the banner goes', async () => {
      await api('staff2', 'post', `/platform/incidents/${id}/updates`).send({ stage: 'resolved', impact: 'Payslip PDFs open normally again.', action: 'No action needed.' }).expect(201);
      const u = find((await api('staff', 'get', '/platform/incidents').expect(200)).body, first.title).updates.find((x) => x.status === 'pending')!;
      expect(find((await api('staff', 'post', `/platform/incidents/${id}/updates/${u.id}/review`).send({ approve: true }).expect(200)).body, first.title).status).toBe('resolved');
      expect((await api('adminA', 'get', '/availability').expect(200)).body.incident).toBeNull();
      await api('staff', 'post', `/platform/incidents/${id}/updates`).send({ stage: 'monitoring', impact: 'Something else happened.', action: 'No action needed.' }).expect(409);
    });

    it('companies cannot read incidents directly (RLS)', async () => {
      expect(await inOrg(org.A, (tx) => tx.platformIncident.findMany({ where: { id } }))).toEqual([]);
      expect(await inOrg(org.A, (tx) => tx.platformIncidentUpdate.findMany({ where: { incidentId: id } }))).toEqual([]);
    });
  });

  describe('answer 1124: a security breach linked to a containment', () => {
    const title = `Unusual sign-ins ${run}`;
    let id = '';
    let containmentId = '';
    const contained = Date.now();

    beforeAll(async () => {
      // A containment of company A, as C-4 makes it (clocks from the platform settings: 6 and 72 hours).
      containmentId = (await tenantPrisma.forTenant(SUPER, (tx) => tx.companyContainment.create({ data: { organizationId: org.A, reason: 'Admin signed in from three countries (e2e)', containedBy: users.staff!, containedByName: 'Staff staff', containedAt: new Date(contained), certinDueAt: new Date(contained + 6 * 3_600_000), dpdpDueAt: new Date(contained + 72 * 3_600_000) } }))).id;
      id = find((await api('staff', 'post', '/platform/incidents').send({ ...first, title, severity: 1, payrollNote: false }).expect(201)).body, title).id;
      const u = find((await api('staff2', 'get', '/platform/incidents').expect(200)).body, title).updates[0]!;
      await api('staff2', 'post', `/platform/incidents/${id}/updates/${u.id}/review`).send({ approve: true }).expect(200);
    });
    afterAll(async () => {
      await tenantPrisma.forTenant(SUPER, (tx) => tx.companyContainment.update({ where: { id: containmentId }, data: { liftedAt: new Date(), liftedBy: users.staff2!, liftedByName: 'e2e' } })).catch(() => undefined);
    });

    it('the open containment is offered; marking it hides the incident from companies', async () => {
      const before = (await api('staff', 'get', '/platform/incidents').expect(200)).body;
      expect(before.containments.some((c: { id: string; company: string }) => c.id === containmentId && c.company === `C8I A ${run}`)).toBe(true);
      expect((await api('adminA', 'get', '/availability').expect(200)).body.incident).toMatchObject({ title, payrollNote: false });
      await api('staff', 'post', `/platform/incidents/${id}/breach`).send({ containmentId: randomUUID() }).expect(400);
      const after = (await api('staff', 'post', `/platform/incidents/${id}/breach`).send({ containmentId }).expect(200)).body;
      expect(find(after, title).breach).toMatchObject({ certinRemindedAt: null, dpdpRemindedAt: null });
      await api('staff', 'post', `/platform/incidents/${id}/breach`).send({ containmentId }).expect(409);
      expect((await api('adminA', 'get', '/availability').expect(200)).body.incident).toBeNull();
    });

    // Answer 1261: the lead time changes only on Console › Platform settings (security key and a reason), 0 to 24 hours.
    it('the lead time is a platform setting (0 to 24 hours); the old direct save is refused', async () => {
      await api('staff', 'put', '/platform/incidents/settings').send({ leadHours: 1 }).expect(404);
      await markSteppedUp(tenantPrisma, token.staff!);
      await api('staff', 'put', '/platform/settings/incident.breach_reminder_lead_hours').send({ value: '25', reason: 'Testing the lead time' }).expect(400);
      await api('staff', 'put', '/platform/settings/incident.breach_reminder_lead_hours').send({ value: '1', reason: 'Testing the lead time' }).expect(200);
      expect((await api('staff', 'get', '/platform/incidents').expect(200)).body.settings).toEqual({ leadHours: 1, leadHoursDefault: 1 });
    });

    it('nothing before the lead time; the CERT-In reminder 1 hour before, once, to staff with the key', async () => {
      const incidents = app.get(IncidentsService);
      sent.length = 0;
      await incidents.remindSweep(new Date(contained + 4 * 3_600_000));
      expect(sent.filter((m) => m.subject.includes(title))).toEqual([]);
      await incidents.remindSweep(new Date(contained + 5 * 3_600_000));
      const mine = sent.filter((m) => m.subject.includes(title));
      expect(mine.map((m) => m.to)).toEqual(expect.arrayContaining([`staff-${run}@platform.test`, `staff2-${run}@platform.test`]));
      expect(mine.some((m) => m.to.endsWith('@c8i.test'))).toBe(false);
      // Staff roles: only staff whose roles hold the incidents key (Security leads) get them.
      expect(mine.some((m) => m.to === `staffnokey-${run}@platform.test`)).toBe(false);
      const row = find((await api('staff', 'get', '/platform/incidents').expect(200)).body, title);
      expect(row.breach!.certinRemindedAt).not.toBeNull();
      expect(row.breach!.dpdpRemindedAt).toBeNull();
      sent.length = 0;
      await incidents.remindSweep(new Date(contained + 6 * 3_600_000));
      expect(sent.filter((m) => m.subject.includes(title))).toEqual([]);
    });

    it('the DPDP reminder 1 hour before its due time; audited', async () => {
      sent.length = 0;
      await app.get(IncidentsService).remindSweep(new Date(contained + 71 * 3_600_000));
      expect(sent.filter((m) => m.subject.includes(title)).length).toBeGreaterThan(0);
      expect(find((await api('staff', 'get', '/platform/incidents').expect(200)).body, title).breach!.dpdpRemindedAt).not.toBeNull();
      const audits = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { entityId: id, action: { in: ['platform.incident.marked_breach', 'platform.incident.breach_reminder'] } }, select: { action: true } }));
      expect(audits.map((a) => a.action).sort()).toEqual(['platform.incident.breach_reminder', 'platform.incident.breach_reminder', 'platform.incident.marked_breach']);
    });

    // DPDP Rule 7 (founder, 13 Nov 2026): the Board is told without delay; Security leads are nudged until it is marked.
    it('Rule 7: the Security leads are reminded to tell the Board, again after the nudge minutes, until it is marked', async () => {
      const incidents = app.get(IncidentsService);
      const nudges = () => sent.filter((m) => m.subject === `Tell the Data Protection Board now: C8I A ${run}`);
      await tenantPrisma.forTenant(SUPER, (tx) => tx.companyContainment.update({ where: { id: containmentId }, data: { boardNudgedAt: null } }));
      const reminders = () => tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.count({ where: { entityId: containmentId, action: 'platform.containment.board_notice_reminder' } }));
      const before = await reminders();
      const t0 = contained + 72 * 3_600_000;
      sent.length = 0;
      await incidents.boardNoticeSweep(new Date(t0));
      expect(nudges().map((m) => m.to)).toEqual(expect.arrayContaining([`staff-${run}@platform.test`, `staff2-${run}@platform.test`]));
      expect(nudges().some((m) => m.to === `staffnokey-${run}@platform.test` || m.to.endsWith('@c8i.test'))).toBe(false);
      // Answer 2093: the same reminder is a console notice for the same staff; each sees only their own, marks it read,
      // and nobody reads or marks another's; staff without the key get none.
      type Notices = { unread: number; items: { id: string; kind: string; title: string; read: boolean }[] };
      const board = (b: Notices) => b.items.filter((n) => n.kind === 'board_notice_due' && n.title === `Tell the Data Protection Board now: C8I A ${run}`);
      const mine = (await api('staff', 'get', '/platform/notices').expect(200)).body as Notices;
      const theirs = (await api('staff2', 'get', '/platform/notices').expect(200)).body as Notices;
      expect([board(mine).length, board(theirs).length]).toEqual([1, 1]);
      expect(board(mine)[0]!.id).not.toBe(board(theirs)[0]!.id);
      await api('staff', 'post', `/platform/notices/${board(theirs)[0]!.id}/read`).expect(404);
      const after = (await api('staff', 'post', `/platform/notices/${board(mine)[0]!.id}/read`).expect(200)).body as { unread: number };
      expect(after.unread).toBe(mine.unread - 1);
      expect(board((await api('staff2', 'get', '/platform/notices').expect(200)).body as Notices)[0]!.read).toBe(false);
      const noKey = await api('staffNoKey', 'get', '/platform/notices');
      expect(noKey.status === 200 ? board(noKey.body as Notices) : []).toEqual([]);
      // Not for a company account; and the database lets nobody read across, even with platform access.
      await api('adminA', 'get', '/platform/notices').expect(403);
      expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.staffNotice.count({ where: { title: `Tell the Data Protection Board now: C8I A ${run}` } }))).toBe(0);
      await expect(tenantPrisma.forTenant(SUPER, (tx) => tx.staffNotice.deleteMany({ where: { recipientUserId: users.staff } }))).rejects.toThrow(/permission denied/);
      await expect(tenantPrisma.forTenant(SUPER, (tx) => tx.staffNotice.createMany({ data: [{ recipientUserId: users.adminA!, kind: 'board_notice_due', title: 'x', body: 'x' }] }))).rejects.toThrow(/row-level security/);
      sent.length = 0;
      await incidents.boardNoticeSweep(new Date(t0 + 30 * 60_000));
      expect(nudges()).toEqual([]);
      await incidents.boardNoticeSweep(new Date(t0 + 61 * 60_000));
      expect(nudges().length).toBeGreaterThan(0);
      // The repeat nudge adds no second open notice for staff2 (still unread); staff, who read theirs, gets a fresh one.
      const again = (who: string) => api(who, 'get', '/platform/notices').expect(200).then((r) => board(r.body as Notices));
      expect((await again('staff2')).filter((n) => !n.read).length).toBe(1);
      expect((await again('staff')).map((n) => n.read).sort()).toEqual([false, true]);
      expect((await reminders()) - before).toBe(2);
    });

    it('Rule 7: marking the first notice needs the incidents or contain key and the security key; audited; then the reminders stop', async () => {
      const path = `/platform/companies/${org.A}/containment/board-notice`;
      const body = { sentAt: new Date(contained + 60_000).toISOString(), note: 'Emailed the Board; reference DPB-1' };
      await api('adminA', 'post', path).send(body).expect(403);
      await api('staffNoKey', 'post', path).send(body).expect(403);
      const cold = (await request(server()).post('/api/v1/auth/platform/login').send({ email: `staff2-${run}@platform.test`, password: PASSWORD }).expect(200)).body.accessToken as string;
      const r = await api(cold, 'post', path).send(body);
      expect(r.status).toBe(403);
      expect(['STEP_UP_REQUIRED', 'MFA_REQUIRED']).toContain((r.body as { code?: string }).code);
      await api('staff', 'post', path).send({ ...body, note: 'ok' }).expect(400);
      await api('staff', 'post', path).send({ ...body, sentAt: new Date(contained - 60_000).toISOString() }).expect(400);
      const done = (await api('staff', 'post', path).send(body).expect(201)).body;
      expect(done.containment.boardNotice).toMatchObject({ note: body.note, at: body.sentAt });
      await api('staff', 'post', path).send(body).expect(409);
      expect(find((await api('staff', 'get', '/platform/incidents').expect(200)).body, title).breach).toMatchObject({ boardNotifiedAt: body.sentAt, boardNoticeNote: body.note });
      const audit = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findFirst({ where: { action: 'platform.containment.board_notified', entityId: containmentId } }));
      expect(audit).toMatchObject({ actorUserId: users.staff });
      sent.length = 0;
      await app.get(IncidentsService).boardNoticeSweep(new Date(contained + 80 * 3_600_000));
      expect(sent.filter((m) => m.subject === `Tell the Data Protection Board now: C8I A ${run}`)).toEqual([]);
    });
  });
});
