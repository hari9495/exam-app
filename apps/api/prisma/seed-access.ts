import { Prisma } from '@prisma/client';
import { OrgSecretsCryptoService } from '@exam-platform/shared';
import { hashValue, sealValue } from '../src/people/profile.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';

// Step 2d demo data (P02 §4.2–4.5) for Kaveri Foods, fictional throughout (review rule R3):
//   - department heads (implicit "Dept head" view, YX-SEC-04): Lakshmi heads People;
//   - a scoped role grant: a Plant HR Executive (plant-hr@demo-org.test) for the Hosur plant only (§4.3);
//   - Personal details, identifiers and bank accounts for Divya and Arjun (encrypted, masked, §4.4);
//   - a pending reimbursement-account change raised by Divya herself, for Payroll to approve (§4.5).
// Idempotent: each part is skipped once present.

type Tx = Prisma.TransactionClient;

export async function seedAccess(tx: Tx, organizationId: string, actors: { admin: string; panel: string; passwordHash: string }): Promise<void> {
  const org = { organizationId };
  const crypto = new OrgSecretsCryptoService();
  const employee = async (email: string) => (await tx.employee.findFirstOrThrow({ where: { ...org, workEmail: email } })).id;
  const lakshmi = await employee('lakshmi.venkatesan@kaverifoods.test');
  const divya = await employee('divya.raghunathan@kaverifoods.test');
  const arjun = await employee('arjun.kulkarni@kaverifoods.test');

  await tx.department.updateMany({ where: { ...org, code: 'PPL', headEmployeeId: null }, data: { headEmployeeId: lakshmi } });

  // A role cloned from the HR Executive template, granted for one location (P02 §4.2–4.3).
  const template = ROLE_TEMPLATES.find((t) => t.key === 'hr_executive')!;
  const role =
    (await tx.permissionProfile.findFirst({ where: { ...org, name: 'Plant HR Executive' } })) ??
    (await tx.permissionProfile.create({ data: { ...org, name: 'Plant HR Executive', permissionsJson: JSON.stringify(template.permissions) } }));
  const plantHr = await tx.user.upsert({
    where: { organizationId_email: { organizationId, email: 'plant-hr@demo-org.test' } },
    update: {},
    create: { ...org, email: 'plant-hr@demo-org.test', name: 'Anitha Rao', passwordHash: actors.passwordHash, role: 'panel' },
  });
  const hosur = await tx.location.findFirstOrThrow({ where: { ...org, code: 'HSR-PLT' } });
  if (!(await tx.roleGrant.findFirst({ where: { ...org, userId: plantHr.id } }))) {
    await tx.roleGrant.create({
      data: { ...org, userId: plantHr.id, permissionProfileId: role.id, scopeType: 'location', locationId: hosur.id, validFrom: new Date('2026-09-01T00:00:00Z'), status: 'active', reason: 'Plant HR for the Hosur plant', grantedBy: actors.admin },
    });
  }

  if (await tx.employeePersonalDetails.findFirst({ where: { ...org, employeeId: divya } })) return;
  const seal = (emp: string, v: string) => sealValue(crypto, organizationId, emp, v);
  const hash = (kind: string, v: string) => hashValue(crypto, organizationId, kind, v);
  const personal = (employeeId: string, d: { dob: string; gender: string; email: string; phone: string; line1: string; city: string; postal: string }) =>
    tx.employeePersonalDetails.create({
      data: { ...org, employeeId, dateOfBirth: new Date(`${d.dob}T00:00:00Z`), gender: d.gender, personalEmail: d.email, personalPhone: d.phone, addressLine1: d.line1, city: d.city, stateCode: 'IN-KA', postalCode: d.postal, country: 'IN' },
    });
  await personal(divya, { dob: '1992-03-14', gender: 'female', email: 'divya.r.home@mail.test', phone: '+919845011122', line1: '14, 3rd Cross, Jayanagar 4th Block', city: 'Bengaluru', postal: '560011' });
  await personal(arjun, { dob: '1998-11-02', gender: 'male', email: 'arjun.k.home@mail.test', phone: '+919845033344', line1: '22, 7th Main, HSR Layout', city: 'Bengaluru', postal: '560102' });

  const ids = (employeeId: string, legalName: string, pan: string, aadhaar: string, uan: string) =>
    tx.employeeIdentifiers.create({
      data: {
        ...org,
        employeeId,
        legalName,
        panEnc: seal(employeeId, pan),
        panHash: hash('pan', pan),
        panLast4: pan.slice(-4),
        aadhaarEnc: seal(employeeId, aadhaar),
        aadhaarHash: hash('aadhaar', aadhaar),
        aadhaarLast4: aadhaar.slice(-4),
        uanEnc: seal(employeeId, uan),
        uanHash: hash('uan', uan),
        uanLast4: uan.slice(-4),
      },
    });
  await ids(divya, 'Divya Raghunathan', 'BQRPR4821K', '468135790248', '100987654321');
  await ids(arjun, 'Arjun Kulkarni', 'CKLPK7310M', '739204815629', '100912345678');

  const bank = (employeeId: string, holderName: string, account: string, ifsc: string) =>
    tx.employeeBankAccount.create({
      data: { ...org, employeeId, purpose: 'salary', holderName, ifsc, accountEnc: seal(employeeId, account), accountHash: hash('bank', `${ifsc}:${account}`), accountLast4: account.slice(-4), validFrom: new Date('2026-01-01T00:00:00Z'), usableFrom: new Date('2026-01-01T00:00:00Z') },
    });
  await bank(divya, 'Divya Raghunathan', '50100234567812', 'HDFC0001234');
  await bank(arjun, 'Arjun Kulkarni', '30219876543210', 'SBIN0004321');

  // Divya asks for a reimbursement account (she signs in as panel@demo-org.test); Payroll approves (YX-SEC-11/13).
  const proposal = { holderName: 'Divya Raghunathan', accountNumber: '918020045671234', ifsc: 'UTIB0000456' };
  await tx.employeeProfileRequest.create({
    data: {
      ...org,
      employeeId: divya,
      kind: 'bank_reimbursement',
      proposedEnc: seal(divya, JSON.stringify(proposal)),
      proposedDisplay: { holderName: proposal.holderName, ifsc: proposal.ifsc, account: '•••• 1234' },
      reason: 'Travel claims to my savings account',
      requestedBy: actors.panel,
    },
  });
}
