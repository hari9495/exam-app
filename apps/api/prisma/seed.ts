import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const PERMISSIONS = [
  { key: 'platform:manage_organizations', description: 'Create and manage organizations (Super Admin only)' },
  { key: 'org:manage_users', description: 'Invite and manage users within an organization' },
  { key: 'org:manage_settings', description: 'Edit organization branding/domain/security settings' },
  { key: 'org:view', description: 'View organization dashboard and data' },
  { key: 'question_bank:manage', description: 'Create, edit, and archive questions in the organization\'s question bank' },
  { key: 'exam:manage', description: 'Create, edit, and archive exams and their sections in the organization' },
  { key: 'candidate:manage', description: 'Add candidates and manage invitations in the organization' },
  { key: 'results:view', description: 'View exam results, reports, and candidate comparisons' },
  { key: 'ai_jobs:view', description: 'Poll the status of AI background jobs' },
  { key: 'audit:view', description: 'View the audit log and role/permission mappings' },
  { key: 'candidate:data_rights', description: 'Process GDPR data subject requests: export or erase a candidate\'s personal data' },
  { key: 'pipeline:manage', description: 'Create and manage hiring jobs and their candidate pipeline' },
  { key: 'interview:view_assigned', description: 'View interviews you are assigned to as a panelist' },
  { key: 'org:manage_billing', description: 'View organization billing, plan, and usage' },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['platform:manage_organizations', 'org:manage_users', 'org:manage_settings', 'org:view', 'audit:view'],
  // org_admin is a full org-scoped superuser: their own admin features PLUS the complete
  // recruiter/panel capability set (exams, question bank, candidates, results).
  org_admin: [
    'org:manage_users',
    'org:manage_settings',
    'org:view',
    'audit:view',
    'candidate:data_rights',
    'question_bank:manage',
    'exam:manage',
    'candidate:manage',
    'results:view',
    'ai_jobs:view',
    'pipeline:manage',
    'interview:view_assigned',
    'org:manage_billing',
  ],
  recruiter: ['org:view', 'question_bank:manage', 'exam:manage', 'candidate:manage', 'results:view', 'ai_jobs:view', 'pipeline:manage', 'interview:view_assigned'],
  panel: ['org:view', 'results:view', 'interview:view_assigned'],
};

async function main() {
  await prisma.$transaction(async (tx) => {
    // ponytail: 30s timeout — remote (Azure SQL) round-trip latency across this
    // script's many sequential inserts exceeds Prisma's 5s default; raise if
    // seeding still times out against a slower connection.
    // Enable bypass of RLS by setting session context to super admin mode. This must run
    // on the same physical connection as every write below (including the users-table
    // writes that actually require it), which is only guaranteed inside a single
    // $transaction — sp_set_session_context is scoped to the physical connection, not to
    // the Prisma Client instance, so independent top-level calls could be routed to
    // different pooled connections.
    await tx.$executeRawUnsafe(
      "EXEC sp_set_session_context @key=N'app_is_super_admin', @value=1"
    );

    try {
      for (const perm of PERMISSIONS) {
        await tx.permission.upsert({
          where: { key: perm.key },
          update: {},
          create: perm,
        });
      }

      for (const [role, keys] of Object.entries(ROLE_PERMISSIONS)) {
        for (const key of keys) {
          const permission = await tx.permission.findUniqueOrThrow({ where: { key } });
          await tx.rolePermission.upsert({
            where: { role_permissionId: { role, permissionId: permission.id } },
            update: {},
            create: { role, permissionId: permission.id },
          });
        }
      }

      const trialPlan = await tx.plan.upsert({
        where: { id: '00000000-0000-0000-0000-000000000001' },
        update: {},
        create: {
          id: '00000000-0000-0000-0000-000000000001',
          name: 'trial',
          candidateLimit: 100,
          aiCreditLimit: 10,
          proctoringMinutesLimit: 60,
          seatLimit: 5,
        },
      });

      const superAdminHash = await argon2.hash('DevSuper123!');
      // Handle platform super admin (organizationId = null) with findFirst + create instead
      // of upsert: Prisma's generated WhereUniqueInput type rejects `null` for a field that
      // is part of a composite unique index, even though the underlying database column is
      // nullable and the DB-level constraint permits it.
      const existingSuperAdmin = await tx.user.findFirst({
        where: { email: 'super@platform.test', organizationId: null },
      });
      if (!existingSuperAdmin) {
        await tx.user.create({
          data: {
            email: 'super@platform.test',
            passwordHash: superAdminHash,
            role: 'super_admin',
            organizationId: null,
          },
        });
      }

      const demoOrg = await tx.organization.upsert({
        where: { slug: 'demo-org' },
        update: {},
        create: { name: 'Demo Org', slug: 'demo-org', planId: trialPlan.id },
      });

      const orgAdminHash = await argon2.hash('DevAdmin123!');
      await tx.user.upsert({
        where: { organizationId_email: { organizationId: demoOrg.id, email: 'admin@demo-org.test' } },
        update: {},
        create: {
          email: 'admin@demo-org.test',
          passwordHash: orgAdminHash,
          role: 'org_admin',
          organizationId: demoOrg.id,
        },
      });

      // A dedicated recruiter account for the golden-path e2e flow (kept even though org_admin
      // now also holds the recruiter permissions, so tests can exercise the plain recruiter role).
      const recruiterHash = await argon2.hash('Passw0rd!2026');
      await tx.user.upsert({
        where: { organizationId_email: { organizationId: demoOrg.id, email: 'recruiter@demo-org.test' } },
        update: {},
        create: {
          email: 'recruiter@demo-org.test',
          passwordHash: recruiterHash,
          role: 'recruiter',
          organizationId: demoOrg.id,
        },
      });

      // panel role: read-only results/reporting UI needs a seeded panel fixture
      // for the panel golden-path e2e flow.
      const panelHash = await argon2.hash('Passw0rd!2026');
      await tx.user.upsert({
        where: { organizationId_email: { organizationId: demoOrg.id, email: 'panel@demo-org.test' } },
        update: {},
        create: {
          email: 'panel@demo-org.test',
          passwordHash: panelHash,
          role: 'panel',
          organizationId: demoOrg.id,
        },
      });
    } finally {
      // sp_set_session_context is scoped to the physical connection, not the transaction,
      // and is not undone by rollback. Reset it before the transaction callback returns for
      // consistency with TenantPrismaService.forTenant's established pattern (defense in
      // depth; not strictly load-bearing here since the script disconnects and exits
      // immediately after).
      await tx.$executeRawUnsafe(
        "EXEC sp_set_session_context @key=N'app_is_super_admin', @value=0"
      );
    }
  }, { timeout: 30000 });

  console.log('Seed complete: super@platform.test / DevSuper123!, admin@demo-org.test / DevAdmin123!, recruiter@demo-org.test / Passw0rd!2026, panel@demo-org.test / Passw0rd!2026 (org slug: demo-org)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
