import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Enable bypass of RLS by setting session context to super admin mode
async function enableRLSBypass() {
  await prisma.$executeRawUnsafe(
    "EXEC sp_set_session_context @key=N'app_is_super_admin', @value=1"
  );
}

const PERMISSIONS = [
  { key: 'platform:manage_organizations', description: 'Create and manage organizations (Super Admin only)' },
  { key: 'org:manage_users', description: 'Invite and manage users within an organization' },
  { key: 'org:manage_settings', description: 'Edit organization branding/domain/security settings' },
  { key: 'org:view', description: 'View organization dashboard and data' },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['platform:manage_organizations', 'org:manage_users', 'org:manage_settings', 'org:view'],
  org_admin: ['org:manage_users', 'org:manage_settings', 'org:view'],
  recruiter: ['org:view'],
  panel: ['org:view'],
};

async function main() {
  await enableRLSBypass();

  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: {},
      create: perm,
    });
  }

  for (const [role, keys] of Object.entries(ROLE_PERMISSIONS)) {
    for (const key of keys) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { key } });
      await prisma.rolePermission.upsert({
        where: { role_permissionId: { role, permissionId: permission.id } },
        update: {},
        create: { role, permissionId: permission.id },
      });
    }
  }

  const trialPlan = await prisma.plan.upsert({
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
  // Handle platform super admin (organizationId = null) with findFirst + create
  // because Prisma's upsert cannot handle null values in composite unique keys
  const existingSuperAdmin = await prisma.user.findFirst({
    where: { email: 'super@platform.test', organizationId: null },
  });
  if (!existingSuperAdmin) {
    await prisma.user.create({
      data: {
        email: 'super@platform.test',
        passwordHash: superAdminHash,
        role: 'super_admin',
        organizationId: null,
      },
    });
  }

  const demoOrg = await prisma.organization.upsert({
    where: { slug: 'demo-org' },
    update: {},
    create: { name: 'Demo Org', slug: 'demo-org', planId: trialPlan.id },
  });

  const orgAdminHash = await argon2.hash('DevAdmin123!');
  await prisma.user.upsert({
    where: { organizationId_email: { organizationId: demoOrg.id, email: 'admin@demo-org.test' } },
    update: {},
    create: {
      email: 'admin@demo-org.test',
      passwordHash: orgAdminHash,
      role: 'org_admin',
      organizationId: demoOrg.id,
    },
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
