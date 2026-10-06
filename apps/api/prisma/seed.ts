import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { seedOrgStructure } from './seed-org-structure';
import { seedEmployees } from './seed-employees';

const prisma = new PrismaClient();

export const PERMISSIONS = [
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
  { key: 'approvals:configure', description: 'Configure approval chains and staff reporting managers' },
  { key: 'pipelines:configure', description: 'Configure hiring pipelines' },
  { key: 'users:manage_groups', description: 'Create and manage user groups' },
  // Read-only counterparts to candidate:manage / question_bank:manage. Held by the auditor role so a
  // compliance viewer can see the candidate list + question bank without any write capability. The
  // list/detail GET routes accept EITHER the :manage or the :view key (RequireAnyPermission).
  { key: 'candidate:view', description: 'View candidates (read-only)' },
  { key: 'question_bank:view', description: 'View the question bank (read-only)' },
  // YukthiX organisation structure (P01) and the P02 classes it touches.
  { key: 'org.structure.view', description: 'View legal entities, locations, departments and other structure masters' },
  { key: 'org.settings.manage', description: 'Change legal entities, locations, structure masters and company settings' },
  { key: 'org.entity.statutory.manage', description: 'View and change legal entity PAN, TAN, GSTIN and CIN (Confidential)' },
  { key: 'pay.range.view', description: 'View grade pay ranges (pay data)' },
  { key: 'pay.range.manage', description: 'Change grade pay ranges (pay data)' },
  // YukthiX employee core and job history (P01 §4.4, P06).
  { key: 'employee.profile.view', description: 'View every employee record and job history' },
  { key: 'employee.change.manage', description: 'Add employees and raise, edit or cancel job changes' },
  { key: 'employee.change.approve', description: 'Approve or reject job changes raised by someone else' },
  { key: 'employee.change.retro', description: 'Raise or approve past-dated job changes' },
  { key: 'employee.change.retro_override', description: 'Go back before the company retro limit, with a reason' },
  { key: 'employee.salary.view', description: 'View employee pay (CTC)' },
  { key: 'employee.salary.manage', description: 'Change employee pay (CTC)' },
];

export const ROLE_PERMISSIONS: Record<string, string[]> = {
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
    'approvals:configure',
    'pipelines:configure',
    'users:manage_groups',
    // P02 Q1: the System Admin runs the structure but sees no Confidential or pay data unless granted.
    'org.structure.view',
    'org.settings.manage',
    // P06: the System Admin runs job history (Internal facts) and is the YX-HIS-12 override; no pay (Q1).
    'employee.profile.view',
    'employee.change.manage',
    'employee.change.approve',
    'employee.change.retro',
    'employee.change.retro_override',
  ],
  recruiter: ['org:view', 'question_bank:manage', 'exam:manage', 'candidate:manage', 'results:view', 'ai_jobs:view', 'pipeline:manage', 'interview:view_assigned'],
  panel: ['org:view', 'results:view', 'interview:view_assigned'],
  // hiring_manager: a job owner who reviews their reqs' candidates + results and joins interviews,
  // but has no settings/users/billing access. Pair with Record-level visibility to scope them to
  // their own jobs. This is the seeded DEFAULT — an org admin can retune it in Roles & Permissions.
  hiring_manager: ['org:view', 'results:view', 'interview:view_assigned', 'pipeline:manage', 'candidate:manage'],
  // auditor: compliance read-only. Sees candidates, jobs/pipelines, exams, results/reports, the
  // question bank, and the audit log — but holds ZERO write keys, so every mutation route (all gated
  // on a :manage key) denies it. Deliberately NOT in EDITABLE_ROLES: its grants stay fixed read-only,
  // so an org admin can't accidentally hand it write access.
  auditor: ['org:view', 'results:view', 'audit:view', 'ai_jobs:view', 'candidate:view', 'question_bank:view', 'interview:view_assigned', 'org.structure.view', 'employee.profile.view'],
};

async function main() {
  await prisma.$transaction(async (tx) => {
    // ponytail: 30s timeout — remote round-trip latency across this script's many sequential
    // inserts exceeds Prisma's 5s default; raise if seeding still times out on a slower link.
    // Super-admin RLS bypass, transaction-local (is_local = true): it applies to every write
    // below and is discarded at COMMIT/ROLLBACK, so nothing needs resetting afterwards.
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;

    {
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

      await seedOrgStructure(tx, demoOrg.id, panelHash);
      const userId = async (email: string) => (await tx.user.findUniqueOrThrow({ where: { organizationId_email: { organizationId: demoOrg.id, email } } })).id;
      await seedEmployees(tx, demoOrg.id, {
        admin: await userId('admin@demo-org.test'),
        hr: await userId('hr@demo-org.test'),
        payroll: await userId('payroll@demo-org.test'),
        panel: await userId('panel@demo-org.test'),
      });
    }
  }, { timeout: 60000 });

  console.log('Seed complete: super@platform.test / DevSuper123!, admin@demo-org.test / DevAdmin123!, recruiter@demo-org.test / Passw0rd!2026, panel@demo-org.test / Passw0rd!2026, payroll@demo-org.test / Passw0rd!2026, hr@demo-org.test / Passw0rd!2026 (org slug: demo-org)');
}

// Only run when invoked as a script (prisma db seed / ts-node). Guarded so importing this module for
// its exported PERMISSIONS / ROLE_PERMISSIONS (e.g. in tests) doesn't connect to the DB or exit.
if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
