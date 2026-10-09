import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService, SendEmailInput } from '../src/email/email.service';
import { UsersService } from '../src/users/users.service';
import { OrganizationsService } from '../src/organizations/organizations.service';
import { markSteppedUp } from './fixtures/step-up';

// Founder decisions, 8 Oct 2026, against the real database: welcome and invitation links work for 72 hours,
// password-reset links for 15 minutes; every link is single-use, stored hashed, and a newer link retires the older
// ones. YukthiX staff invitations use the YukthiX account-email layout, never the old "Examination Platform" text.
describe('Set-password links: 72 hours to join, 15 minutes to reset', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const sent: SendEmailInput[] = [];
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const orgIds: string[] = [];
  const userIds: string[] = [];
  let planId: string;
  let adminToken: string;
  let adminId: string;
  const HOUR = 3_600_000;
  const settle = () => new Promise((r) => setTimeout(r, 300));
  const tokenFrom = (m: SendEmailInput) => (m.html as string).match(/\/yx\/reset-password\/([a-f0-9]{64})/)![1];
  const row = (raw: string) =>
    tenantPrisma.forTenant(SUPER, (tx) => tx.passwordResetToken.findUnique({ where: { tokenHash: createHash('sha256').update(raw).digest('hex') } }));
  const lifetime = (r: { createdAt: Date; expiresAt: Date }) => r.expiresAt.getTime() - r.createdAt.getTime();
  const mailTo = (to: string) => sent.filter((m) => m.to === to).at(-1)!;
  const reset = (token: string) => request(app.getHttpServer()).post('/api/v1/auth/reset-password').send({ token, newPassword: `Fresh-${runId}-Pass!x9` });

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async (m: SendEmailInput) => (sent.push(m), { success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    planId = (await prisma.plan.create({ data: { name: `spl-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const org = await prisma.organization.create({ data: { name: `Kaveri Foods ${runId}`, slug: `spl-${runId}`, planId } });
    orgIds.push(org.id);
    adminId = (
      await tenantPrisma.forTenant({ organizationId: org.id, isSuperAdmin: false }, async (tx) =>
        tx.user.create({ data: { organizationId: org.id, email: `admin-${runId}@spl.test`, name: 'Asha Rao', passwordHash: await argon2.hash(PASSWORD), role: 'org_admin' } }),
      )
    ).id;
    userIds.push(adminId);
    adminToken = (await request(app.getHttpServer()).post('/api/v1/auth/staff/login').send({ organizationSlug: org.slug, email: `admin-${runId}@spl.test`, password: PASSWORD }).expect(200)).body.accessToken;
    await markSteppedUp(tenantPrisma, adminToken);
  }, 120_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const created = await tx.user.findMany({ where: { OR: [{ organizationId: { in: orgIds } }, { email: { endsWith: `-${runId}@spl.test` } }] }, select: { id: true } });
        const ids = [...new Set([...userIds, ...created.map((u) => u.id)])];
        await tx.passwordResetToken.deleteMany({ where: { userId: { in: ids } } });
        await tx.refreshToken.deleteMany({ where: { userId: { in: ids } } });
        await tx.session.deleteMany({ where: { userId: { in: ids } } });
        await tx.legalEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
        await tx.user.deleteMany({ where: { id: { in: ids } } });
        await tx.organization.deleteMany({ where: { id: { in: orgIds } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('an invitation link works for 72 hours; an admin-sent reset gives 15 minutes and retires the invitation', async () => {
    const invitee = `new-${runId}@spl.test`;
    const created = (await request(app.getHttpServer()).post('/api/v1/users/bulk').set('Authorization', `Bearer ${adminToken}`).send({ emails: [invitee], role: 'panel' }).expect(201)).body.created;
    await settle();
    const invite = mailTo(invitee);
    expect(invite.text).toContain('The link works once, for 72 hours.');
    const inviteRaw = tokenFrom(invite);
    const inviteRow = (await row(inviteRaw))!;
    expect(inviteRow.tokenHash).not.toBe(inviteRaw);
    expect(lifetime(inviteRow)).toBeGreaterThan(72 * HOUR - 5_000);
    expect(lifetime(inviteRow)).toBeLessThanOrEqual(72 * HOUR + 5_000);

    await request(app.getHttpServer()).post(`/api/v1/users/${created[0].id}/reset-password`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    await settle();
    const resetMail = mailTo(invitee);
    expect(resetMail.text).toContain('expires in 15 minutes');
    const resetRaw = tokenFrom(resetMail);
    expect(lifetime((await row(resetRaw))!)).toBeLessThanOrEqual(15 * 60_000 + 5_000);
    expect(lifetime((await row(resetRaw))!)).toBeGreaterThan(15 * 60_000 - 5_000);

    // The newer link retired the invitation; the reset link works once.
    expect((await row(inviteRaw))!.usedAt).not.toBeNull();
    await reset(inviteRaw).expect(400);
    await reset(resetRaw).expect(200);
    await reset(resetRaw).expect(400);
  });

  it('a 72-hour link still works after 15 minutes (but not once its 72 hours have passed)', async () => {
    const invitee = `late-${runId}@spl.test`;
    await request(app.getHttpServer()).post('/api/v1/users/bulk').set('Authorization', `Bearer ${adminToken}`).send({ emails: [invitee], role: 'panel' }).expect(201);
    await settle();
    const raw = tokenFrom(mailTo(invitee));
    const hash = createHash('sha256').update(raw).digest('hex');
    await tenantPrisma.forTenant(SUPER, (tx) => tx.passwordResetToken.update({ where: { tokenHash: hash }, data: { expiresAt: new Date(Date.now() - 1000) } }));
    await reset(raw).expect(400);
    await tenantPrisma.forTenant(SUPER, (tx) => tx.passwordResetToken.update({ where: { tokenHash: hash }, data: { createdAt: new Date(Date.now() - HOUR), expiresAt: new Date(Date.now() + 71 * HOUR) } }));
    await reset(raw).expect(200);
  });

  it('a new company’s welcome link works for 72 hours', async () => {
    const adminEmail = `first-${runId}@spl.test`;
    const org = await app.get(OrganizationsService).create(SUPER, adminId, { name: `Godavari Agro ${runId}`, slug: `spl-new-${runId}`, adminEmail, adminName: 'Sunita Rao' });
    orgIds.push(org.id);
    await settle();
    const mail = mailTo(adminEmail);
    expect(mail.fromName).toBe('YukthiX');
    expect(mail.text).toContain('The link works once, for 72 hours.');
    const r = (await row(tokenFrom(mail)))!;
    expect(lifetime(r)).toBeGreaterThan(72 * HOUR - 5_000);
    expect(lifetime(r)).toBeLessThanOrEqual(72 * HOUR + 5_000);
  });

  it('a YukthiX staff invitation is a YukthiX account email with a 72-hour link', async () => {
    const staffEmail = `staff-${runId}@spl.test`;
    const staff = await app.get(UsersService).inviteSuperAdmin(SUPER, adminId, { email: staffEmail });
    userIds.push(staff.id);
    await settle();
    const mail = mailTo(staffEmail);
    expect(mail).toMatchObject({ subject: "You're invited to the YukthiX team", fromName: 'YukthiX' });
    expect(mail.text).toContain('The link works once, for 72 hours.');
    expect(`${mail.html}${mail.text}`).not.toMatch(/Examination Platform|unsubscribe/i);
    const r = (await row(tokenFrom(mail)))!;
    expect(r.userId).toBe(staff.id);
    expect(lifetime(r)).toBeGreaterThan(72 * HOUR - 5_000);
  });
});
