import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';
import { giveStaffRoles, type StaffRole } from './fixtures/staff-roles';

// YukthiX console staff, second part (founder answers 1171 and 1173), against the real database. A Security lead
// reactivates a deactivated member of staff (the roles they held; they sign in again with their security key) and sends
// the invitation again to someone who never signed in (the old link stops working; at most 3 sends a day by default).
// Both need the security key again and a reason, and are audited. Positive and negative.
describe('Console staff: reactivate and send the invitation again (1171, 1173)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const NEW_PASSWORD = 'Brand-New-Passw0rd-2026';
  const run = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const mails: { to: string; html: string }[] = [];
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  type Who = 'lead' | 'cs' | 'gone';
  const api = (who: Who, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const emailOf = (who: string) => `s2-${who}-${run}@platform.test`;
  const login = (email: string, password = PASSWORD) => request(server()).post('/api/v1/auth/platform/login').send({ email, password });
  /** The raw token in the newest invitation sent to this address. */
  const linkFor = (to: string) => {
    const html = [...mails].reverse().find((m) => m.to === to)?.html ?? '';
    return /reset-password\/([0-9a-f]{64})/.exec(html)?.[1] ?? '';
  };
  const audits = (entityId: string, action: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { entityId, action } }));

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async (m: { to: string; html: string }) => (mails.push({ to: m.to, html: m.html }), { success: true })) }));
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    const staff: [Who, StaffRole[]][] = [['lead', ['security_lead']], ['cs', ['customer_success']], ['gone', ['rules_editor', 'finance']]];
    for (const [who, roles] of staff) {
      users[who] = (await tenantPrisma.forTenant(SUPER, (tx) => tx.user.create({ data: { email: emailOf(who), name: `Staff ${who}`, passwordHash, role: 'super_admin', organizationId: null } }))).id;
      await giveStaffRoles(users[who]!, roles);
      token[who] = (await login(emailOf(who)).expect(200)).body.accessToken;
      await markSteppedUp(tenantPrisma, token[who]!);
    }
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const ids = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: ids } } });
        await tx.session.deleteMany({ where: { userId: { in: ids } } });
      })
      .catch(() => undefined);
    await app.close();
  });

  describe('1171 reactivate', () => {
    it('negative: only a Security lead; never yourself; never an active account', async () => {
      await api('lead', 'post', `/platform/staff/${users.gone}/deactivate`).send({ reason: 'On a long leave' }).expect(200);
      await api('cs', 'post', `/platform/staff/${users.gone}/reactivate`).send({ reason: 'Back from leave' }).expect(403);
      await api('lead', 'post', `/platform/staff/${users.gone}/reactivate`).send({}).expect(400);
      expect((await api('lead', 'post', `/platform/staff/${users.lead}/reactivate`).send({ reason: 'Myself again' }).expect(403)).body.message).toMatch(/reactivate yourself/);
      expect((await api('lead', 'post', `/platform/staff/${users.cs}/reactivate`).send({ reason: 'Not needed at all' }).expect(409)).body.message).toMatch(/Only a deactivated account/);
      await api('lead', 'post', `/platform/staff/${randomUUID()}/reactivate`).send({ reason: 'Nobody there' }).expect(404);
    });

    it('needs the security key again', async () => {
      const { sid } = JSON.parse(Buffer.from(token.lead!.split('.')[1]!, 'base64url').toString()) as { sid: string };
      await tenantPrisma.forTenant(SUPER, (tx) => tx.session.update({ where: { id: sid }, data: { mfaVerifiedAt: new Date(Date.now() - 20 * 60_000) } }));
      expect((await api('lead', 'post', `/platform/staff/${users.gone}/reactivate`).send({ reason: 'Back from leave' }).expect(403)).body.code).toBe('STEP_UP_REQUIRED');
      await markSteppedUp(tenantPrisma, token.lead!);
    });

    it('a Security lead reactivates them with the roles they held; they sign in again and need their security key; audited', async () => {
      expect((await api('lead', 'post', `/platform/staff/${users.gone}/reactivate`).send({ reason: 'Back from leave' }).expect(200)).body).toEqual({ id: users.gone, active: true, roles: ['rules_editor', 'finance'] });
      expect((await tenantPrisma.forTenant(SUPER, (tx) => tx.user.findUniqueOrThrow({ where: { id: users.gone } }))).status).toBe('active');
      // The old session stays ended; a new sign-in works but the console waits for the security key.
      expect((await api('gone', 'get', '/platform/my-roles')).status).toBe(401);
      token.gone = (await login(emailOf('gone')).expect(200)).body.accessToken;
      expect((await api('gone', 'get', '/platform/my-roles').expect(403)).body.code).toBe('MFA_REQUIRED');
      await markSteppedUp(tenantPrisma, token.gone!);
      expect((await api('gone', 'get', '/platform/my-roles').expect(200)).body.map((r: { role: string }) => r.role)).toEqual(['rules_editor', 'finance']);
      const [a] = await audits(users.gone!, 'platform.staff.reactivated');
      expect(a).toMatchObject({ actorUserId: users.lead });
      expect(JSON.parse(a!.metadataJson!)).toEqual({ reason: 'Back from leave', roles: expect.arrayContaining(['rules_editor', 'finance']) });
    });
  });

  describe('1173 send the invitation again', () => {
    const invite = async (who: string) => {
      const made = (await api('lead', 'post', '/platform/staff').send({ email: emailOf(who), name: `Staff ${who}`, reason: 'Joins the team' }).expect(201)).body as { id: string };
      users[who] = made.id;
      return made.id;
    };

    it('the new link works and the old one stops; only a Security lead may send; audited', async () => {
      const id = await invite('new1');
      const first = linkFor(emailOf('new1'));
      expect(first).toHaveLength(64);
      await api('cs', 'post', `/platform/staff/${id}/resend-invitation`).send({ reason: 'Link expired' }).expect(403);
      await api('lead', 'post', `/platform/staff/${id}/resend-invitation`).send({}).expect(400);
      expect((await api('lead', 'post', `/platform/staff/${id}/resend-invitation`).send({ reason: 'Link expired' }).expect(200)).body).toEqual({ id, sent: true });
      const second = linkFor(emailOf('new1'));
      expect(second).toHaveLength(64);
      expect(second).not.toBe(first);
      // The old link is dead; the new one sets the password.
      await request(server()).post('/api/v1/auth/reset-password').send({ token: first, newPassword: NEW_PASSWORD }).expect((r) => expect(r.status).toBeGreaterThanOrEqual(400));
      await request(server()).post('/api/v1/auth/reset-password').send({ token: second, newPassword: NEW_PASSWORD }).expect(200);
      const [a] = await audits(id, 'platform.staff.invite_resent');
      expect(a).toMatchObject({ actorUserId: users.lead });
      expect(JSON.parse(a!.metadataJson!)).toMatchObject({ reason: 'Link expired', sendToday: 1, limit: 3 });
    });

    it('negative: someone who already signed in gets no invitation; nor does a deactivated account', async () => {
      await login(emailOf('new1'), NEW_PASSWORD).expect(200);
      expect((await api('lead', 'post', `/platform/staff/${users.new1}/resend-invitation`).send({ reason: 'Link expired' }).expect(409)).body.message).toMatch(/already signed in/);
      const id = await invite('new2');
      await api('lead', 'post', `/platform/staff/${id}/deactivate`).send({ reason: 'Hire cancelled' }).expect(200);
      expect((await api('lead', 'post', `/platform/staff/${id}/resend-invitation`).send({ reason: 'Link expired' }).expect(409)).body.message).toMatch(/deactivated/);
      await api('lead', 'post', `/platform/staff/${randomUUID()}/resend-invitation`).send({ reason: 'Nobody there' }).expect(404);
    });

    it('the daily limit holds: 3 sends a day per person by default, then 429 with when to try again', async () => {
      const id = await invite('new3');
      for (let i = 0; i < 3; i++) await api('lead', 'post', `/platform/staff/${id}/resend-invitation`).send({ reason: `Send ${i + 1} today` }).expect(200);
      const refused = (await api('lead', 'post', `/platform/staff/${id}/resend-invitation`).send({ reason: 'One more time' }).expect(429)).body;
      expect(refused).toMatchObject({ code: 'INVITE_LIMIT' });
      expect(refused.retryAfterSeconds).toBeGreaterThan(0);
      expect(refused.retryAfterSeconds).toBeLessThanOrEqual(86_400);
      expect(await audits(id, 'platform.staff.invite_resent')).toHaveLength(3);
      // Another person has their own count.
      const other = await invite('new4');
      await api('lead', 'post', `/platform/staff/${other}/resend-invitation`).send({ reason: 'Link expired' }).expect(200);
    });
  });
});
