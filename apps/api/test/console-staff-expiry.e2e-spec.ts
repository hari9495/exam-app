import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { AuditService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { StaffRolesService, INVITE_EXPIRE_DEFAULT, INVITE_EXPIRE_KEY } from '../src/platform/staff-roles.service';
import { giveStaffRoles, type StaffRole } from './fixtures/staff-roles';

// YukthiX console tidy 2 (founder answer 1243), against the real database. The nightly job deactivates invited staff
// who never signed in, more than staff.invite.expire_days (default 30, 7 to 90) after the invitation, as the system,
// audited with the setting value. Never anyone who has signed in; never the last active Security lead; a rerun is safe.
describe('Console staff: invitations expire (1243)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let job: StaffRolesService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const run = randomUUID().slice(0, 8);
  const DAY = 86_400_000;
  const users: Record<string, string> = {};
  const mails: { to: string; subject: string; html: string }[] = [];
  const mailsTo = (who: string) => mails.filter((m) => m.to === `sx-${who}-${run}@platform.test`);
  let days = INVITE_EXPIRE_DEFAULT;
  const status = (who: string) => tenantPrisma.forTenant(SUPER, async (tx) => (await tx.user.findUniqueOrThrow({ where: { id: users[who] } })).status);

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async (m: { to: string; subject: string; html: string }) => (mails.push(m), { success: true })) }));
    tenantPrisma = app.get(TenantPrismaService);
    job = app.get(StaffRolesService);
    const v = Number((await tenantPrisma.forTenant(SUPER, (tx) => tx.platformSetting.findUnique({ where: { key: INVITE_EXPIRE_KEY } })))?.value);
    if (Number.isInteger(v) && v >= 7 && v <= 90) days = v;
    const now = Date.now();
    // Invited N days ago less an hour (stays), N+1 days ago (goes), N+1 days ago but signed in (stays), and an invited
    // Security lead N+1 days ago (goes while another lead is active; stays when it would be the last one).
    const staff: [string, number, StaffRole[], boolean][] = [
      ['atN', days * DAY - 3_600_000, ['support_agent'], false],
      ['pastN', (days + 1) * DAY, ['support_agent'], false],
      ['signedIn', (days + 1) * DAY, ['support_agent'], true],
      ['lead', (days + 1) * DAY, ['security_lead'], false],
      // Answer 1281: an active Security lead who signed in gets the night's list; 'signedIn' (no lead) gets nothing.
      ['leadA', DAY, ['security_lead'], true],
      // Sent the invitation again yesterday: the count starts again from then.
      ['resent', (days + 1) * DAY, ['support_agent'], false],
    ];
    for (const [who, age, roles, signedIn] of staff) {
      users[who] = (
        await tenantPrisma.forTenant(SUPER, (tx) =>
          tx.user.create({ data: { email: `sx-${who}-${run}@platform.test`, name: `Staff ${who}`, passwordHash: 'not-set', role: 'super_admin', organizationId: null, createdAt: new Date(now - age), lastLoginAt: signedIn ? new Date(now - DAY) : null } }),
        )
      ).id;
      await giveStaffRoles(users[who]!, roles);
    }
    await tenantPrisma.forTenant(SUPER, (tx) => AuditService.recordIn(tx, SUPER, { actorUserId: users.leadA!, action: 'platform.staff.invite_resent', entityType: 'user', entityId: users.resent!, metadata: { reason: 'e2e: sent again' } }));
  }, 180_000);

  afterAll(async () => {
    // The backdated join dates go back to today, so other suites that look at staff from before a migration never see them.
    await tenantPrisma.forTenant(SUPER, (tx) => tx.user.updateMany({ where: { id: { in: Object.values(users) } }, data: { createdAt: new Date() } })).catch(() => undefined);
    await app.close();
  });

  it('never the last active Security lead: with every other staff account inactive (rolled back), the job skips them', async () => {
    const owner = new PrismaClient({ datasources: { db: { url: process.env.MIGRATION_DATABASE_URL } } });
    try {
      const gone = await owner
        .$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SELECT set_config('app.is_super_admin', 'on', true)`);
          await tx.$executeRawUnsafe(`UPDATE users SET status = 'deactivated' WHERE organization_id IS NULL AND role = 'super_admin' AND id <> $1::uuid`, users.lead);
          const rows = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT platform_expire_invited_staff($1::int, now()) AS id`, days);
          throw Object.assign(new Error('rollback'), { rows });
        })
        .catch((e: { rows?: { id: string }[] }) => e.rows ?? []);
      expect(gone.map((r) => r.id)).not.toContain(users.lead);
    } finally {
      await owner.$disconnect();
    }
    expect(await status('lead')).toBe('active');
  });

  it('the database refuses a day count outside 7 to 90', async () => {
    const owner = new PrismaClient({ datasources: { db: { url: process.env.MIGRATION_DATABASE_URL } } });
    try {
      for (const d of [6, 91])
        await expect(owner.$transaction([owner.$executeRawUnsafe(`SELECT set_config('app.is_super_admin', 'on', true)`), owner.$queryRawUnsafe(`SELECT platform_expire_invited_staff(${d}, now())`)])).rejects.toThrow(/YX_STAFF_EXPIRE_DAYS/);
    } finally {
      await owner.$disconnect();
    }
  });

  it('deactivates at N+1 days, not at N; skips anyone who has signed in; audited as the system with the setting value', async () => {
    const out = await job.expireInvites();
    expect(out.days).toBe(days);
    expect(out.deactivated).toEqual(expect.arrayContaining([users.pastN, users.lead]));
    expect(out.deactivated).not.toContain(users.atN);
    expect(out.deactivated).not.toContain(users.signedIn);
    expect(out.deactivated).not.toContain(users.resent);
    expect(await status('resent')).toBe('active');
    expect(await status('pastN')).toBe('deactivated');
    expect(await status('lead')).toBe('deactivated');
    expect(await status('atN')).toBe('active');
    expect(await status('signedIn')).toBe('active');
    const audit = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { entityId: users.pastN, action: 'platform.staff.deactivated' } }));
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actorUserId).toBeNull();
    expect(JSON.parse(audit[0]!.metadataJson ?? '{}')).toMatchObject({ automatically: true, [INVITE_EXPIRE_KEY]: days });
  });

  it('1281: one email to each active Security lead listing both, with the invited date; a non-lead and the deactivated get nothing; audited', async () => {
    const got = mailsTo('leadA');
    expect(got).toHaveLength(1);
    for (const who of ['pastN', 'lead']) expect(got[0]!.html).toContain(`sx-${who}-${run}@platform.test`);
    expect(got[0]!.html).toMatch(/invited \d{1,2} [A-Z][a-z]{2} \d{4}/);
    for (const who of ['atN', 'resent']) expect(got[0]!.html).not.toContain(`sx-${who}-${run}@platform.test`);
    expect(mailsTo('signedIn')).toHaveLength(0);
    expect(mailsTo('lead')).toHaveLength(0);
    const sent = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId: null, action: 'platform.staff.invites_expired_notified' }, orderBy: { createdAt: 'desc' }, take: 1 }));
    const meta = JSON.parse(sent[0]!.metadataJson ?? '{}') as { accounts: string[]; sentTo: string[] };
    expect(sent[0]!.actorUserId).toBeNull();
    expect(meta.accounts).toEqual(expect.arrayContaining([`sx-pastN-${run}@platform.test`, `sx-lead-${run}@platform.test`]));
    expect(meta.sentTo).toContain(users.leadA);
  });

  it('a rerun is safe: nobody new, nothing audited twice, no second email (a quiet night sends nothing)', async () => {
    const before = mails.length;
    const again = await job.expireInvites();
    expect(again.deactivated).toEqual([]);
    expect(mails.length).toBe(before);
    for (const who of ['atN', 'pastN', 'signedIn', 'lead']) expect(again.deactivated).not.toContain(users[who]);
    expect(await status('atN')).toBe('active');
    const audit = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { entityId: users.pastN, action: 'platform.staff.deactivated' } }));
    expect(audit).toHaveLength(1);
  });
});
