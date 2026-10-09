import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

// Demo company structure (P01 §4.1–4.6) for the demo tenant, in the story world of the YukthiX screens
// (packages/yx-ui/review/RULES.md "Data facts"): Kaveri Foods, fictional people, codes and numbers;
// IP ranges from the documentation blocks. Idempotent: found by name / short name, else created.

type Tx = Prisma.TransactionClient;

async function ensure<T>(find: () => Promise<T | null>, create: () => Promise<T>): Promise<T> {
  return (await find()) ?? create();
}

const IST = 'Asia/Kolkata';
// P02 §4.2 templates as permission profiles: Payroll Admin holds pay; HR Admin runs records without pay.
const PAYROLL_ADMIN = ['org:view', 'org.structure.view', 'org.entity.statutory.manage', 'pay.range.view', 'pay.range.manage', 'employee.profile.view', 'employee.change.approve', 'employee.salary.view', 'employee.salary.manage', 'employee.identity.view', 'employee.identity.approve', 'payroll.period.view', 'payroll.period.reopen', 'payroll.correction.approve', 'payroll.document.view', 'payroll.document.issue', 'payroll.file.view', 'audit.view'];
// Step 2d (P02 §4.4–4.5): HR Admin also holds Personal data and raises identity / bank changes; Payroll approves them.
const HR_ADMIN = ['org:view', 'org.structure.view', 'employee.profile.view', 'employee.change.manage', 'employee.change.approve', 'employee.change.retro', 'employee.personal.view', 'employee.profile.edit', 'employee.identity.view', 'employee.identity.manage', 'leave.settings.manage', 'leave.view', 'leave.balance.adjust', 'leave.approve', 'leave.medical.view', 'attendance.view', 'roster.manage', 'attendance.lock', 'leave.eligibility.override'];
// The panel role's keys plus raising changes for one's team (P02 YX-SEC-27); the structure masters (names and
// codes, no pay) to pick a new designation or location in those changes.
const TEAM_MANAGER = ['org:view', 'results:view', 'interview:view_assigned', 'request.raise_on_behalf', 'org.structure.view'];
const FROM = new Date('2026-04-01T00:00:00.000Z');

export async function seedOrgStructure(tx: Tx, organizationId: string, passwordHash: string): Promise<void> {
  const org = { organizationId };

  // ---- legal entities (YX-ORG-01: one default) ----
  const kfplData = {
    name: 'Kaveri Foods Pvt Ltd',
    shortName: 'KFPL',
    registeredAddress: { lines: ['14 Residency Road'], city: 'Bengaluru', state: 'IN-KA', postalCode: '560025', country: 'IN' },
    pan: 'AABCK1234M',
    tan: 'BLRK01234E',
    gstin: '29AABCK1234M1Z5',
    cin: 'U15400KA2014PTC012345',
  };
  let kfpl = await tx.legalEntity.findFirst({ where: { ...org, shortName: 'KFPL' } });
  if (!kfpl) {
    // The migration gave every company a default entity named after it: the demo's becomes Kaveri Foods.
    const placeholder = await tx.legalEntity.findFirst({ where: { ...org, isDefault: true } });
    kfpl = placeholder
      ? await tx.legalEntity.update({ where: { id: placeholder.id }, data: kfplData })
      : await tx.legalEntity.create({ data: { ...org, ...kfplData, isDefault: true } });
  }
  const tn = await ensure(
    () => tx.legalEntity.findFirst({ where: { ...org, shortName: 'KFPL-TN' } }),
    () =>
      tx.legalEntity.create({
        data: {
          ...org,
          name: 'Kaveri Foods Pvt Ltd (Tamil Nadu)',
          shortName: 'KFPL-TN',
          registeredAddress: { lines: ['22 SIPCOT Industrial Complex'], city: 'Hosur', state: 'IN-TN', postalCode: '635126', country: 'IN' },
          pan: 'AABCK5678N',
          tan: 'CHEK05678F',
          gstin: '33AABCK5678N1Z2',
        },
      }),
  );

  // ---- locations (YX-ORG-02) ----
  const location = (legalEntityId: string, name: string, code: string, city: string, state: string, postalCode: string, line: string, geo: [number, number, number] | null, ipRanges: string[]) =>
    ensure(
      () => tx.location.findFirst({ where: { ...org, code } }),
      () =>
        tx.location.create({
          data: {
            ...org,
            legalEntityId,
            name,
            code,
            address: { lines: [line], city, state, postalCode, country: 'IN' },
            country: 'IN',
            state,
            timezone: IST,
            geoLat: geo?.[0] ?? null,
            geoLng: geo?.[1] ?? null,
            geoRadiusM: geo?.[2] ?? null,
            ipRanges,
          },
        }),
    );
  const blr = await location(kfpl.id, 'Bengaluru head office', 'BLR-HO', 'Bengaluru', 'IN-KA', '560025', '14 Residency Road', [12.9716, 77.5946, 150], ['203.0.113.0/24']);
  await location(tn.id, 'Chennai office', 'MAA-OFF', 'Chennai', 'IN-TN', '600032', '5 Guindy Industrial Estate', [13.0067, 80.2206, 150], ['198.51.100.16/28']);
  const hosur = await location(tn.id, 'Hosur plant', 'HSR-PLT', 'Hosur', 'IN-TN', '635126', '22 SIPCOT Industrial Complex', [12.7409, 77.8253, 300], ['10.20.0.0/16']);

  // ---- departments: a tree with two divisions and one entity-only sub-department (YX-ORG-03, YX-ORG-15) ----
  const department = async (name: string, code: string, parent: { id: string; path: string } | null, extra: { isDivision?: boolean; ownerLegalEntityId?: string } = {}) =>
    ensure(
      () => tx.department.findFirst({ where: { ...org, code } }),
      () => {
        const id = randomUUID();
        return tx.department.create({ data: { ...org, id, name, code, parentId: parent?.id ?? null, path: `${parent?.path ?? '/'}${id}/`, ...extra } });
      },
    );
  const operations = await department('Operations', 'OPS', null, { isDivision: true });
  await department('Quality', 'QA', operations);
  await department('Production', 'PROD', operations, { ownerLegalEntityId: tn.id });
  await department('Engineering', 'ENG', null);
  await department('Finance', 'FIN', null);
  await department('People', 'PPL', null);
  await department('Sales', 'SALES', null, { isDivision: true });

  // ---- designations ----
  for (const [name, code, jobFamily, owner] of [
    ['Managing Director', 'MD', 'Leadership', null],
    ['Production Supervisor', 'PROD-SUP', 'Operations', tn.id],
    ['Quality Analyst', 'QA-ANALYST', 'Quality', null],
    ['Senior QA Engineer', 'SR-QA-ENG', 'Quality', null],
    ['Lab Analyst', 'LAB-ANALYST', 'Quality', null],
    ['Software Engineer', 'SW-ENG', 'Engineering', null],
    ['Accounts Executive', 'ACC-EXEC', 'Finance', null],
    ['Payroll Manager', 'PAYROLL-MGR', 'Finance', null],
    ['HR Business Partner', 'HRBP', 'People', null],
    ['Area Sales Manager', 'ASM', 'Sales', null],
  ] as const) {
    await ensure(
      () => tx.designation.findFirst({ where: { ...org, code } }),
      () => tx.designation.create({ data: { ...org, name, code, jobFamily, ownerLegalEntityId: owner } }),
    );
  }

  // ---- grades with dated pay ranges from 1 Apr 2026 (pay data: pay.range.view only) ----
  for (const [code, name, rank, min, mid, max] of [
    ['W1', 'Plant worker', 1, 180000, 210000, 240000],
    ['W2', 'Senior plant worker', 2, 220000, 260000, 300000],
    ['G1', 'Associate', 3, 240000, 300000, 360000],
    ['G2', 'Executive', 4, 360000, 480000, 600000],
    ['G3', 'Senior executive', 5, 600000, 800000, 1000000],
    ['M1', 'Manager', 6, 1000000, 1400000, 1800000],
    ['M2', 'Senior manager', 7, 1800000, 2400000, 3000000],
    ['M3', 'Head of department', 8, 2800000, 3600000, 4400000],
    ['M4', 'General manager', 9, 4000000, 5000000, 6000000],
  ] as const) {
    const grade = await ensure(
      () => tx.grade.findFirst({ where: { ...org, code } }),
      () => tx.grade.create({ data: { ...org, name: `${code} · ${name}`, code, rank } }),
    );
    for (const legalEntityId of [kfpl.id, tn.id]) {
      await ensure(
        () => tx.gradePayRange.findFirst({ where: { ...org, gradeId: grade.id, legalEntityId, currency: 'INR' } }),
        () => tx.gradePayRange.create({ data: { ...org, gradeId: grade.id, legalEntityId, currency: 'INR', min, mid, max, validFrom: FROM } }),
      );
    }
  }

  // ---- employment types (YX-ORG-20 categories) ----
  for (const [name, code, category, owner] of [
    ['Permanent', 'PERM', 'permanent', null],
    ['Probationer', 'PROB', 'probation', null],
    ['Fixed-term (plant)', 'FTC-PLANT', 'fixed_term', tn.id],
    ['Graduate apprentice', 'APPR', 'apprentice', null],
    ['Retired re-employed', 'RETIRED-RE', 'retired_reemployed', null],
  ] as const) {
    await ensure(
      () => tx.employmentType.findFirst({ where: { ...org, code } }),
      () => tx.employmentType.create({ data: { ...org, name, code, category, ownerLegalEntityId: owner } }),
    );
  }

  // ---- cost centres (per legal entity) ----
  const costCentre = (legalEntityId: string, code: string, name: string, parentId: string | null = null) =>
    ensure(
      () => tx.costCentre.findFirst({ where: { ...org, legalEntityId, code } }),
      () => tx.costCentre.create({ data: { ...org, legalEntityId, code, name, parentId } }),
    );
  await costCentre(kfpl.id, 'CC-BLR-ENG', 'Engineering Bengaluru');
  await costCentre(kfpl.id, 'CC-BLR-FIN', 'Finance Bengaluru');
  const production = await costCentre(tn.id, 'CC-HSR-PRD', 'Hosur production');
  await costCentre(tn.id, 'CC-HSR-QA', 'Hosur quality', production.id);

  // ---- scoped settings (YX-ORG-18): punch everywhere, assumed present at head office ----
  const setting = (scopeType: string, scopeId: string, key: string, value: string, validFrom: Date | null) =>
    ensure(
      () => tx.setting.findFirst({ where: { ...org, scopeType, scopeId, key, validFrom } }),
      () => tx.setting.create({ data: { ...org, scopeType, scopeId, key, value, validFrom } }),
    );
  await setting('tenant', organizationId, 'attendance.mode', 'punch', FROM);
  await setting('location', blr.id, 'attendance.mode', 'assumed_present', FROM);
  await setting('location', hosur.id, 'attendance.missing_punch_effect', 'block_payroll_approval', FROM);

  // ---- a Payroll Admin (P02 §4.2) holding the Confidential and pay grants the System Admin lacks ----
  const profile = await ensure(
    () => tx.permissionProfile.findFirst({ where: { ...org, name: 'Payroll Admin' } }),
    () =>
      tx.permissionProfile.create({
        data: { ...org, name: 'Payroll Admin', permissionsJson: JSON.stringify(PAYROLL_ADMIN) },
      }),
  );
  // Earlier seeds created the profile with fewer keys: keep it in step.
  await tx.permissionProfile.update({ where: { id: profile.id }, data: { permissionsJson: JSON.stringify(PAYROLL_ADMIN) } });
  await tx.user.upsert({
    where: { organizationId_email: { organizationId, email: 'payroll@demo-org.test' } },
    update: {},
    create: { ...org, email: 'payroll@demo-org.test', name: 'Suresh Pillai', passwordHash, role: 'panel', permissionProfileId: profile.id },
  });
  const hrProfile = await ensure(
    () => tx.permissionProfile.findFirst({ where: { ...org, name: 'HR Admin' } }),
    () => tx.permissionProfile.create({ data: { ...org, name: 'HR Admin', permissionsJson: JSON.stringify(HR_ADMIN) } }),
  );
  await tx.permissionProfile.update({ where: { id: hrProfile.id }, data: { permissionsJson: JSON.stringify(HR_ADMIN) } });
  await tx.user.upsert({
    where: { organizationId_email: { organizationId, email: 'hr@demo-org.test' } },
    update: {},
    create: { ...org, email: 'hr@demo-org.test', name: 'Lakshmi Venkatesan', passwordHash, role: 'panel', permissionProfileId: hrProfile.id },
  });
  // M01 §3.10: Divya (panel@demo-org.test) manages a team and raises changes for it (YX-SEC-27).
  const managerProfile = await ensure(
    () => tx.permissionProfile.findFirst({ where: { ...org, name: 'Team Manager' } }),
    () => tx.permissionProfile.create({ data: { ...org, name: 'Team Manager', permissionsJson: JSON.stringify(TEAM_MANAGER) } }),
  );
  await tx.permissionProfile.update({ where: { id: managerProfile.id }, data: { permissionsJson: JSON.stringify(TEAM_MANAGER) } });
  await tx.user.updateMany({ where: { ...org, email: 'panel@demo-org.test', permissionProfileId: null }, data: { permissionProfileId: managerProfile.id } });
}
