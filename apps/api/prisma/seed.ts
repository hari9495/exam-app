import { PrismaClient, Prisma } from '@prisma/client';
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
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['platform:manage_organizations', 'org:manage_users', 'org:manage_settings', 'org:view'],
  org_admin: ['org:manage_users', 'org:manage_settings', 'org:view'],
  recruiter: ['org:view', 'question_bank:manage', 'exam:manage', 'candidate:manage', 'results:view', 'ai_jobs:view'],
  panel: ['org:view', 'results:view'],
};

async function main() {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
  });

  console.log('Seed complete: super@platform.test / DevSuper123!, admin@demo-org.test / DevAdmin123! (org slug: demo-org)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
