import { Prisma, PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import { OrgSecretsCryptoService } from '@exam-platform/shared';
import { sealValue } from '../../src/people/profile.service';
import { cycleOf } from '../../src/people/bfsi.service';

// Demo data for walking the last People pages as the real roles (Kaveri Foods, demo-org), fictional throughout:
//   PPL-36/37  three login-only records whose email is an employee's work email (Possible same person, merge, unmerge);
//   PPL-38     the HR diversity role (employee.disability.view) for the HR tester, and two declarations on file;
//   PPL-43/44  the admin tester as compliance officer, three designated persons (the HR tester's own record first) and a
//              pending pre-clearance request;
//   PPL-34     a day-1 identity check and an HR attestation on Arjun Kulkarni.
// Confidential role grants are made the proper way: granted by one admin, approved by another. The testers are
// hr-tester@ / admin-tester@demo-org.test, else hr@ / admin@demo-org.test. Safe to run again. Run from apps/api:
//   npx ts-node --transpile-only prisma/scripts/demo-people-gaps.ts
const prisma = new PrismaClient();
type Tx = Prisma.TransactionClient;

(async () => {
  const crypto = new OrgSecretsCryptoService();
  const log: string[] = [];
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      const org = (await tx.organization.findUniqueOrThrow({ where: { slug: 'demo-org' }, select: { id: true } })).id;
      await tx.$executeRaw`SELECT set_config('app.current_org', ${org}, true)`;
      const o = { organizationId: org };
      const today = new Date().toISOString().slice(0, 10);
      const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
      const user = async (...emails: string[]) => {
        for (const email of emails) {
          const u = await tx.user.findFirst({ where: { ...o, email }, select: { id: true, email: true } });
          if (u) return u;
        }
        throw new Error(`None of ${emails.join(', ')} is in the demo company.`);
      };
      const hr = await user('hr-tester@demo-org.test', 'hr@demo-org.test');
      const admin = await user('admin-tester@demo-org.test', 'admin@demo-org.test');
      const approver = await user(...['admin2@demo-org.test', 'admin@demo-org.test'].filter((e) => e !== admin.email));
      const employee = async (workEmail: string) => tx.employee.findFirstOrThrow({ where: { ...o, workEmail } });

      // A role holding one key, granted company-wide by one admin and approved by another (P02 §4.6).
      const grant = async (role: string, key: string, to: { id: string; email: string }) => {
        const p = (await tx.permissionProfile.findFirst({ where: { ...o, name: role } })) ?? (await tx.permissionProfile.create({ data: { ...o, name: role, permissionsJson: JSON.stringify([key]) } }));
        if (!(await tx.roleGrant.findFirst({ where: { ...o, userId: to.id, permissionProfileId: p.id, status: 'active' } }))) {
          await tx.roleGrant.create({ data: { ...o, userId: to.id, permissionProfileId: p.id, scopeType: 'tenant', validFrom: day(today), status: 'active', reason: 'Demo: walk the People pages', grantedBy: admin.id, decidedBy: approver.id, decidedAt: new Date(), decisionNote: 'Demo' } });
          log.push(`${role} granted to ${to.email}`);
        }
      };

      // ---- PPL-36/37: logins that raised a desk ticket before they were linked got persons of their own.
      for (const workEmail of ['meera.iyer@kaverifoods.test', 'rahul.sharma@kaverifoods.test', 'selvi.arun@kaverifoods.test']) {
        if (await tx.user.findFirst({ where: { ...o, email: workEmail } })) continue;
        const e = await employee(workEmail);
        // No password anyone knows: the record only needs the login's email.
        const u = await tx.user.create({ data: { ...o, email: workEmail, name: `${e.givenName} Sample`, passwordHash: `!demo-no-sign-in-${randomBytes(8).toString('hex')}`, role: 'panel' } });
        const p = await tx.person.create({ data: { ...o, givenName: e.givenName, familyName: 'Sample' } });
        await tx.personRole.create({ data: { ...o, personId: p.id, roleType: 'login', sourceTable: 'users', sourceId: u.id, startOn: day(today) } });
        log.push(`login-only record for ${workEmail}`);
      }

      // ---- PPL-38: the HR diversity role and two declarations.
      await grant('Diversity role', 'employee.disability.view', hr);
      const declare = async (workEmail: string, details: { category: string; percent: number; adjustments: string | null }) => {
        const e = await employee(workEmail);
        if (await tx.disabilityDeclaration.findFirst({ where: { ...o, employeeId: e.id } })) return;
        await tx.disabilityDeclaration.create({ data: { ...o, employeeId: e.id, answer: 'yes', detailsEnc: sealValue(crypto, org, e.id, JSON.stringify(details)), consentAt: new Date() } });
        log.push(`disability declaration for ${workEmail}`);
      };
      await declare('kavya.reddy@kaverifoods.test', { category: 'Low vision', percent: 40, adjustments: 'Screen magnifier' });
      await declare('murugan.selvam@kaverifoods.test', { category: 'Hard of hearing', percent: 50, adjustments: null });

      // ---- PPL-43/44: the compliance officer, designated persons and a pending pre-clearance.
      await grant('Compliance officer', 'compliance.declaration.manage', admin);
      const hrEmployee = await tx.employee.findFirst({ where: { ...o, userId: hr.id } });
      const designated = [...(hrEmployee ? [hrEmployee] : []), await employee('arjun.kulkarni@kaverifoods.test'), await employee('kiran.joshi@kaverifoods.test')];
      for (const e of designated) {
        if (await tx.bfsiDesignation.findUnique({ where: { organizationId_employeeId: { organizationId: org, employeeId: e.id } } })) continue;
        await tx.bfsiDesignation.create({ data: { ...o, employeeId: e.id, designatedOn: day(today), createdBy: admin.id } });
        log.push(`designated person ${e.givenName} ${e.familyName ?? ''}`.trim());
      }
      if (!hrEmployee) log.push(`${hr.email} has no employee record, so cannot see Me › Annual declarations; sign in as arjun@demo-org.test`);
      const asker = designated[0];
      const askerUser = asker.userId ?? hr.id;
      if (!(await tx.tradePreclearance.findFirst({ where: { ...o, employeeId: asker.id, status: 'pending' } }))) {
        const year = today.slice(0, 4);
        const n = await tx.tradePreclearance.count({ where: { ...o, referenceNo: { startsWith: `PC-${year}-` } } });
        await tx.tradePreclearance.create({ data: { ...o, employeeId: asker.id, referenceNo: `PC-${year}-${String(n + 1).padStart(4, '0')}`, security: 'Sample Agro Industries Ltd', side: 'sell', quantity: 350, value: new Prisma.Decimal(1225000), requestedBy: askerUser } });
        log.push(`pending pre-clearance for ${asker.givenName}`);
      }
      // Kiran's declaration is a draft in progress for this year, so the register shows one pending, one not started.
      const kiran = designated[designated.length - 1];
      if (!(await tx.bfsiDeclaration.findFirst({ where: { ...o, employeeId: kiran.id, cycle: cycleOf(today) } }))) {
        await tx.bfsiDeclaration.create({ data: { ...o, employeeId: kiran.id, cycle: cycleOf(today), holdingsEnc: sealValue(crypto, org, kiran.id, JSON.stringify([{ id: 'demo-h1', security: 'Sample Textiles Ltd', quantity: 200, how: 'Demat · NSDL' }])) } });
      }

      // ---- PPL-34: Arjun's day-1 identity check (his joining) and a later HR attestation.
      const arjun = await employee('arjun.kulkarni@kaverifoods.test');
      const job = await tx.employment.findFirstOrThrow({ where: { ...o, employeeId: arjun.id }, orderBy: { joinedOn: 'desc' } });
      if (!(await tx.preboarding.findFirst({ where: { ...o, personId: arjun.personId!, identityAttestedAt: { not: null } } }))) {
        const a = await tx.employeeAssignment.findFirstOrThrow({ where: { ...o, employmentId: job.id, supersededAt: null }, orderBy: { validFrom: 'asc' } });
        await tx.preboarding.create({ data: { ...o, personId: arjun.personId!, source: 'direct', joiningOn: job.joinedOn, legalEntityId: job.legalEntityId, locationId: a.locationId!, departmentId: a.departmentId, designationId: a.designationId, hrOwnerUserId: hr.id, status: 'joined', employmentId: job.id, identityAttestedBy: hr.id, identityAttestedAt: job.joinedOn, joinedAt: job.joinedOn, completion: 100 } });
        log.push('day-1 identity check for Arjun');
      }
      if (!(await tx.personIdentityCheck.findFirst({ where: { ...o, personId: arjun.personId!, result: 'attested' } }))) {
        await tx.personIdentityCheck.create({ data: { ...o, personId: arjun.personId!, result: 'attested', note: 'Original passport seen (demo)', byUserId: hr.id } });
        log.push('HR attestation for Arjun');
      }
    },
    { timeout: 60_000 },
  );
  console.log(log.length ? log.join('\n') : 'Nothing to add: the demo data is already there.');
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
