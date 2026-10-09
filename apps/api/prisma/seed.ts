import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { seedOrgStructure } from './seed-org-structure';
import { seedEmployees } from './seed-employees';
import { seedAccess } from './seed-access';
import { CONSULTANT, seedSignInDemo } from './seed-sign-in';
import { DESK_PERMISSIONS, seedServiceDesk } from './seed-service-desk';
import { seedServiceDeskSla } from './seed-service-desk-sla';
import { seedServiceDeskChannels } from './seed-service-desk-channels';
import { seedServiceDeskKnowledge, seedYukthixSupport } from './seed-service-desk-knowledge';
import { seedServiceDeskEsm } from './seed-service-desk-esm';
import { seedServiceDeskEsm2 } from './seed-service-desk-esm2';
import { TIME_PERMISSIONS, seedTime } from './seed-time';
import { seedTimeB2 } from './seed-time-b2';
import { PAY_PERMISSIONS, seedAuditAnchor, seedPay, seedPay5b } from './seed-pay';
import { loadRuleSets, type RuleFileSet } from '../src/statutory/load-rule-file';

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
  // P02 YX-SEC-27 / M01 §3.10: managers raise job changes for their team; HR approves.
  { key: 'request.raise_on_behalf', description: 'Raise promotions, transfers and manager changes for people in your team' },
  // P02 §4.2–4.5 (step 2d): who holds which role, and the Personal / Confidential / Special classes.
  { key: 'access.role.manage', description: 'Grant and revoke roles with their scope (Roles & access)' },
  { key: 'employee.personal.view', description: 'View personal details (date of birth, personal contact, address)' },
  { key: 'employee.profile.edit', description: 'Edit personal details for someone else' },
  { key: 'employee.identity.view', description: 'View identity and bank details (masked; full value with an audited reveal)' },
  { key: 'employee.identity.manage', description: 'Raise identity, bank and legal-name changes for someone else' },
  { key: 'employee.identity.approve', description: 'Approve identity, bank and legal-name changes raised by someone else' },
  { key: 'employee.aadhaar.view', description: 'View Aadhaar in full (Special, every view recorded)' },
  // Step 3, the YukthiX platform console (P14 §7) and support sessions (P02 Q8). Platform keys are staff only.
  { key: 'platform.companies.view', description: 'See companies, their lifecycle and products (YukthiX staff)' },
  { key: 'platform.companies.manage', description: 'Create companies and change their lifecycle (YukthiX staff)' },
  { key: 'platform.plans.manage', description: 'Set product prices (YukthiX staff)' },
  { key: 'platform.channels.manage', description: 'Manage the YukthiX shared message accounts (YukthiX staff)' },
  { key: 'platform.support.request', description: 'Ask a company for a support session and use it (YukthiX staff)' },
  { key: 'platform.audit.view', description: 'See the platform audit log (YukthiX staff)' },
  { key: 'platform.support_desk.work', description: 'Work the YukthiX Support desk in the console (YukthiX staff)' },
  { key: 'org.yukthix_support.raise', description: 'Contact YukthiX support for the company and follow its tickets' },
  { key: 'org.support_access.approve', description: 'Approve, decline and end YukthiX support sessions' },
  // P04 Q5: a company's branding and wording of the account emails.
  { key: 'notification.template.manage', description: 'Brand and re-word the emails YukthiX sends your people' },
  // M14 §6.2 Service Desk phase 3b-1 (also in the service_desk_core migration).
  ...DESK_PERMISSIONS,
  // M02 step 4 leave and attendance (also in the time_leave migration).
  ...TIME_PERMISSIONS,
  // M03 payroll batch 5a (also in the payroll_5a migration).
  ...PAY_PERMISSIONS,
];

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  // P14 Console 1 (founder, 8 Oct 2026): one all-keys staff role until staff are hired, then Support / Billing /
  // Security (P14 §4 platform_staff_roles, P12 Q7). Each route checks its own key.
  super_admin: [
    'platform:manage_organizations',
    'org:manage_users',
    'org:manage_settings',
    'org:view',
    'audit:view',
    'platform.companies.view',
    'platform.companies.manage',
    'platform.plans.manage',
    'platform.channels.manage',
    'platform.support.request',
    'platform.audit.view',
    'platform.statutory.manage',
    // M14 SD-1.31: the YukthiX Support desk in the console.
    'platform.support_desk.work',
  ],
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
    // P02 §4.2 System Admin: hands out roles; Personal data (not Confidential) like the rest of the record.
    'access.role.manage',
    'employee.personal.view',
    'employee.profile.edit',
    // P02 Q8: the System Admin decides on YukthiX support sessions.
    'org.support_access.approve',
    // P04 Q5: the System Admin brands and re-words the account emails.
    'notification.template.manage',
    // M14 §6.1: the System Admin sets up desks; seeing tickets always needs a seat on the desk.
    'desk.desk.create',
    'desk.settings.manage',
    'desk.member.manage',
    'desk.sla.manage',
    // M14 batch 3: mailboxes, portals and customers.
    'desk.mailbox.manage',
    'desk.portal.manage',
    'desk.customer.manage',
    // M14 batch 4: help articles, reports, NPS, the people list and directory sync; contacting YukthiX support.
    'desk.kb.author',
    'desk.kb.publish',
    'desk.report.view',
    'desk.report.manage',
    'desk.survey.manage',
    'desk.directory.manage',
    'org.yukthix_support.raise',
    // M02: the System Admin sets up leave and attendance and reads them; medical data and approvals stay with HR.
    'leave.settings.manage',
    'leave.view',
    'attendance.view',
    // Batch 2: rosters and attendance locks (also in the time_leave_b2 migration).
    'roster.manage',
    'attendance.lock',
    // M03 batch 5a (P08 Q3 / Q8): the full audit log, legal holds and the final approval of a reopen; no pay.
    'audit.view',
    'audit.export',
    'audit.hold.manage',
    'payroll.period.reopen.approve',
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
  // Employee records are not part of the permanent base role: P02 YX-SEC-15 time-boxes auditor access, so it
  // comes from an expiring role grant (the Auditor template in Roles & access).
  auditor: ['org:view', 'results:view', 'audit:view', 'audit.view', 'ai_jobs:view', 'candidate:view', 'question_bank:view', 'interview:view_assigned', 'org.structure.view'],
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
        // The demo company is Kaveri Foods everywhere (test script, screens, emails); slug kept for links and tests.
        update: { name: 'Kaveri Foods' },
        create: { name: 'Kaveri Foods', slug: 'demo-org', planId: trialPlan.id },
      });

      const orgAdminHash = await argon2.hash('DevAdmin123!');
      await tx.user.upsert({
        where: { organizationId_email: { organizationId: demoOrg.id, email: 'admin@demo-org.test' } },
        // Ramesh Iyer, Managing Director of Kaveri Foods: the name shows in the menu, emails and Login activity.
        update: { name: 'Ramesh Iyer' },
        create: {
          name: 'Ramesh Iyer',
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
        update: { name: 'Neha Kulkarni' },
        create: {
          name: 'Neha Kulkarni',
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
        // Divya Raghunathan (KF-0001) signs in as panel@: her name shows in the menu, emails and approvals.
        update: { name: 'Divya Raghunathan' },
        create: {
          name: 'Divya Raghunathan',
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
      await seedAccess(tx, demoOrg.id, { admin: await userId('admin@demo-org.test'), panel: await userId('panel@demo-org.test'), passwordHash: panelHash });

      // Local testing of every way in on the sign-in screen (README "Sign-in on your laptop"): codes by
      // email and SMS (the development SMS sink logs them), and Google / Microsoft through the mock
      // identity provider (npm run dev:mock-idp). The recruiter gets a verified, fictional mobile number.
      const signInWays = { otpSignInChannels: ['email', 'sms'], googleSignIn: true, microsoftSignIn: true };
      await tx.tenantSecurityPolicy.upsert({
        where: { organizationId: demoOrg.id },
        update: signInWays,
        create: { organizationId: demoOrg.id, ...signInWays },
      });
      await tx.user.updateMany({
        where: { organizationId: demoOrg.id, email: 'recruiter@demo-org.test', mobileVerifiedAt: null },
        data: { mobileNumber: '+919845012345', mobileVerifiedAt: new Date() },
      });
      await seedSignInDemo(tx, demoOrg.id, trialPlan.id, { admin: orgAdminHash, staff: panelHash });

      // Step 3, the platform console (P14): the demo staff member has a name, and the demo companies use YukthiX HR.
      // Staff sign in at /staff/sign-in and add a security key on first sign-in (P12 Q7).
      await tx.user.updateMany({ where: { email: 'super@platform.test', organizationId: null }, data: { name: 'Anand Iyer' } });
      // 5b-D1: a second staff member (the rule reviewer), and the state minimum-wage tables drafted by Anand and published
      // by Kavitha through the console's two-person flow (src/statutory/load-rule-file.ts).
      const reviewer =
        (await tx.user.findFirst({ where: { email: 'rules@platform.test', organizationId: null } })) ??
        (await tx.user.create({ data: { email: 'rules@platform.test', name: 'Kavitha Menon', passwordHash: superAdminHash, role: 'super_admin', organizationId: null } }));
      const anand = await tx.user.findFirstOrThrow({ where: { email: 'super@platform.test', organizationId: null } });
      const minWages = (JSON.parse(readFileSync(join(__dirname, '..', 'src', 'statutory', 'packs', 'in-min-wages.json'), 'utf8')) as { ruleSets: RuleFileSet[] }).ruleSets;
      await loadRuleSets(tx, minWages, anand.id, reviewer.id);
      // 5b-D3: the India CCA roots (cca.gov.in) for USB-token signatures, by the same two-person flow.
      const ccaRoots = (JSON.parse(readFileSync(join(__dirname, '..', 'src', 'statutory', 'packs', 'in-cca-roots.json'), 'utf8')) as { ruleSets: RuleFileSet[] }).ruleSets;
      await loadRuleSets(tx, ccaRoots, anand.id, reviewer.id);
      // Batch 5c: subsistence, maternity and injury rules for the payroll run, by the same flow.
      const runRules = (JSON.parse(readFileSync(join(__dirname, '..', 'src', 'statutory', 'packs', 'in-run.json'), 'utf8')) as { ruleSets: RuleFileSet[] }).ruleSets;
      await loadRuleSets(tx, runRules, anand.id, reviewer.id);
      // Batch 5d: the generic NEFT / RTGS bank file format (decision §19 D1: generic first, then the pilot's bank).
      const bankFormats = (JSON.parse(readFileSync(join(__dirname, '..', 'src', 'statutory', 'packs', 'in-bank-formats.json'), 'utf8')) as { ruleSets: RuleFileSet[] }).ruleSets;
      await loadRuleSets(tx, bankFormats, anand.id, reviewer.id);
      for (const slug of ['demo-org', 'ganga-textiles']) {
        const org = await tx.organization.findUnique({ where: { slug }, select: { id: true } });
        if (org) {
          await tx.organizationProduct.upsert({
            where: { organizationId_productCode: { organizationId: org.id, productCode: 'hrms' } },
            update: {},
            create: { organizationId: org.id, productCode: 'hrms' },
          });
        }
      }
      // M14 Service Desk phase 3b-1: an IT desk and the free HR desk with a few tickets (seed-service-desk.ts).
      await seedServiceDesk(tx, demoOrg.id, { admin: await userId('admin@demo-org.test'), hr: await userId('hr@demo-org.test'), panel: await userId('panel@demo-org.test'), passwordHash: panelHash });
      // Batch 2: SLA and OLA policies, resolution codes, a template and a ticket close to its breach (seed-service-desk-sla.ts).
      await seedServiceDeskSla(tx, demoOrg.id);
      // Batch 3: support addresses, the Customer Care desk with its portal, customers and banners (seed-service-desk-channels.ts).
      await seedServiceDeskChannels(tx, demoOrg.id);
      // Batch 4: help articles and the public help centre, a rated ticket, NPS, KPIs, a wall screen, and YukthiX's own
      // support desk in the platform tenant (seed-service-desk-knowledge.ts).
      await seedServiceDeskKnowledge(tx, demoOrg.id);
      await seedYukthixSupport(tx, trialPlan.id);
      // Phase 3b-2 batch 1: the IT and HR catalogue, an order guide, the question library and a desk rule
      // (seed-service-desk-esm.ts); Arjun Kulkarni signs in as arjun@demo-org.test.
      await seedServiceDeskEsm(tx, demoOrg.id);
      await seedServiceDeskEsm2(tx, demoOrg.id);
      // Step 4 time and leave batch 1: holiday calendars, leave types and policies with Karnataka / Tamil Nadu floors,
      // balances, pending requests through P03 and a week of punches (seed-time.ts).
      await seedTime(tx, demoOrg.id);
      // Step 4 batch 2: the Hosur plant's 3-shift rotation with a night shift, OT for plant workers settled as comp-off,
      // a timesheet project, the women's night-work records, and a locked previous month with its frozen payroll feed.
      await seedTimeB2(tx, demoOrg.id, panelHash);
      // Step 5 payroll batch 5a: pay periods, a reopen request waiting for its second approver, a sample payslip and
      // a bank file waiting for release (seed-pay.ts).
      await seedPay(tx, demoOrg.id, panelHash);
      // Step 5 payroll batch 5b: the starter components and template, pay groups, statutory registrations.
      await seedPay5b(tx, demoOrg.id);
    }
  }, { timeout: 420000 });
  // Payroll 5a: the demo company's audit chain checked once (the daily job's anchor), after the seed committed.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
    const demo = await tx.organization.findUnique({ where: { slug: 'demo-org' }, select: { id: true } });
    if (demo) await seedAuditAnchor(tx, demo.id);
  });

  console.log(`Seed complete: super@platform.test / DevSuper123! and rules@platform.test / DevSuper123! (YukthiX staff: /staff/sign-in, then a security key), admin@demo-org.test / DevAdmin123!, recruiter@demo-org.test / Passw0rd!2026 (mobile +91 98450 12345), panel@demo-org.test / Passw0rd!2026, payroll@demo-org.test / Passw0rd!2026 (Payroll Admin), payroll-approver@demo-org.test / Passw0rd!2026 (Payroll Approver), finance@demo-org.test / Passw0rd!2026 (Finance Approver), hr@demo-org.test / Passw0rd!2026, plant-hr@demo-org.test / Passw0rd!2026, admin2@demo-org.test / DevAdmin123! (org slug: demo-org); Service Desk: it-agent@ / it-lead@ / it-collab@ / arjun@demo-org.test / Passw0rd!2026, customer portal /yx/portal/demo-org/care (asha@annapurna-stores.test, sign-in code from scripts/desk-portal-code.ts); admin@ganga-textiles.test / DevAdmin123! (org slug: ganga-textiles); ${CONSULTANT.email} / Passw0rd!2026 in both companies (mobile +91 98450 67890)`);
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
