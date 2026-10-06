import { Prisma } from '@prisma/client';
import { EmployeeHistoryService } from '../src/employee-history/employee-history.service';
import { ChangePayload, ChangeType } from '../src/employee-history/history-rules';
import { todayIst } from '../src/org-structure/org-validation';

// Demo employees of Kaveri Foods (P01 §4.4) with job history (P06), in the story world of the YukthiX
// screens: fictional people and numbers. Written through the same change path as the API (YX-HIS-01):
// each change row, then EmployeeHistoryService.rebuild. Idempotent: skipped once the first person exists.

type Tx = Prisma.TransactionClient;
interface Actors {
  admin: string;
  hr: string;
  payroll: string;
  panel: string;
}

export async function seedEmployees(tx: Tx, organizationId: string, actors: Actors): Promise<void> {
  const org = { organizationId };
  if (await tx.employee.findFirst({ where: { ...org, workEmail: 'ramesh.iyengar@kaverifoods.test' } })) return;
  const history = new EmployeeHistoryService(undefined as never, undefined as never);
  const ctx = { organizationId, isSuperAdmin: false, userId: actors.hr, role: null };
  const today = todayIst();

  const id = async (model: 'location' | 'department' | 'designation' | 'grade' | 'employmentType', code: string) =>
    (await (tx[model] as unknown as { findFirstOrThrow(a: unknown): Promise<{ id: string }> }).findFirstOrThrow({ where: { ...org, code } })).id;
  const entity = async (shortName: string) => (await tx.legalEntity.findFirstOrThrow({ where: { ...org, shortName } })).id;
  const costCentre = async (code: string) => (await tx.costCentre.findFirstOrThrow({ where: { ...org, code } })).id;

  const people: Record<string, { employee: string; employment: Prisma.EmploymentGetPayload<object> }> = {};

  const change = async (who: string, changeType: ChangeType, effectiveDate: string, payload: ChangePayload, reason: string, opts: { pending?: boolean; decidedBy?: string } = {}) => {
    const { employee, employment } = people[who];
    const row = await tx.employeeChange.create({
      data: {
        ...org,
        employeeId: employee,
        employmentId: employment.id,
        changeType,
        effectiveDate: new Date(`${effectiveDate}T00:00:00Z`),
        status: opts.pending ? 'pending' : 'scheduled',
        payload: payload as Prisma.InputJsonObject,
        reason,
        requestedBy: actors.hr,
        decidedBy: opts.pending ? null : (opts.decidedBy ?? actors.admin),
        decidedAt: opts.pending ? null : new Date(),
      },
    });
    if (opts.pending) return;
    await history.rebuild(tx, ctx, employment, effectiveDate, row.id);
    if (effectiveDate <= today) await tx.employeeChange.update({ where: { id: row.id }, data: { status: 'effective', appliedAt: new Date() } });
  };

  const hire = async (
    key: string,
    p: { given: string; family: string; email: string; userId?: string; entity: string; code: string; joined: string; status: 'probation' | 'confirmed' },
    assignment: ChangePayload['assignment'],
    ctc: string,
  ) => {
    const employee = await tx.employee.create({ data: { ...org, givenName: p.given, familyName: p.family, workEmail: p.email, userId: p.userId ?? null, createdBy: actors.hr } });
    const legalEntityId = await entity(p.entity);
    const employment = await tx.employment.create({
      data: { ...org, employeeId: employee.id, legalEntityId, employeeCode: p.code, codeScopeKey: legalEntityId, joinedOn: new Date(`${p.joined}T00:00:00Z`), createdBy: actors.hr },
    });
    people[key] = { employee: employee.id, employment };
    await change(key, 'join', p.joined, { assignment, status: p.status, compensation: { currency: 'INR', annualCtc: ctc } }, 'Joined Kaveri Foods');
  };

  const blr = await id('location', 'BLR-HO');
  const hosur = await id('location', 'HSR-PLT');
  const ppl = await id('department', 'PPL');
  const qa = await id('department', 'QA');
  const sales = await id('department', 'SALES');
  const prod = await id('department', 'PROD');
  const perm = await id('employmentType', 'PERM');
  const prob = await id('employmentType', 'PROB');
  const ftc = await id('employmentType', 'FTC-PLANT');
  const g = (code: string) => id('grade', code);
  const d = (code: string) => id('designation', code);

  await hire(
    'ramesh',
    { given: 'Ramesh', family: 'Iyengar', email: 'ramesh.iyengar@kaverifoods.test', entity: 'KFPL', code: 'KF-0002', joined: '2014-04-01', status: 'confirmed' },
    { locationId: blr, departmentId: ppl, designationId: await d('MD'), gradeId: await g('M4'), employmentTypeId: perm, managerEmployeeId: null, costCentres: [] },
    '5400000',
  );
  const ramesh = people.ramesh.employee;
  await hire(
    'lakshmi',
    { given: 'Lakshmi', family: 'Venkatesan', email: 'lakshmi.venkatesan@kaverifoods.test', userId: actors.hr, entity: 'KFPL', code: 'KF-0012', joined: '2019-06-03', status: 'confirmed' },
    { locationId: blr, departmentId: ppl, designationId: await d('HRBP'), gradeId: await g('M2'), employmentTypeId: perm, managerEmployeeId: ramesh, costCentres: [{ costCentreId: await costCentre('CC-BLR-FIN'), percent: '100.00' }] },
    '2400000',
  );
  // Divya signs in as panel@demo-org.test: her team is visible to her through the implicit manager grant.
  await hire(
    'divya',
    { given: 'Divya', family: 'Raghunathan', email: 'divya.raghunathan@kaverifoods.test', userId: actors.panel, entity: 'KFPL', code: 'KF-0001', joined: '2021-01-11', status: 'confirmed' },
    {
      locationId: blr,
      departmentId: qa,
      designationId: await d('SR-QA-ENG'),
      gradeId: await g('G3'),
      employmentTypeId: perm,
      managerEmployeeId: ramesh,
      costCentres: [
        { costCentreId: await costCentre('CC-BLR-ENG'), percent: '60.00' },
        { costCentreId: await costCentre('CC-BLR-FIN'), percent: '40.00' },
      ],
    },
    '920000',
  );
  const divya = people.divya.employee;
  await hire(
    'arjun',
    { given: 'Arjun', family: 'Kulkarni', email: 'arjun.kulkarni@kaverifoods.test', entity: 'KFPL', code: 'KF-0142', joined: '2024-07-01', status: 'confirmed' },
    { locationId: blr, departmentId: qa, designationId: await d('QA-ANALYST'), gradeId: await g('G2'), employmentTypeId: perm, managerEmployeeId: divya, costCentres: [] },
    '540000',
  );
  await change('arjun', 'salary_revision', '2026-04-01', { compensation: { increasePercent: '8' } }, 'Annual increment 2026', { decidedBy: actors.payroll });
  // Scheduled: a promotion with a pay change (M01 §3.3), applied by the daily job on its date.
  await change('arjun', 'promotion', '2026-11-01', { assignment: { designationId: await d('SR-QA-ENG'), gradeId: await g('G3') }, compensation: { annualCtc: '780000' } }, 'Promotion after the 2026 review', {
    decidedBy: actors.payroll,
  });
  await hire(
    'meera',
    { given: 'Meera', family: 'Iyer', email: 'meera.iyer@kaverifoods.test', entity: 'KFPL', code: 'KF-0118', joined: '2026-04-01', status: 'probation' },
    { locationId: blr, departmentId: qa, designationId: await d('QA-ANALYST'), gradeId: await g('G2'), employmentTypeId: prob, managerEmployeeId: divya, costCentres: [] },
    '420000',
  );
  // A correction (P06 §4.5): she was hired as a Lab Analyst; the joining record said Quality Analyst.
  await change('meera', 'correction', '2026-04-01', { assignment: { designationId: await d('LAB-ANALYST') } }, 'Joining record had the wrong designation');
  await change('meera', 'confirmation', '2026-10-01', { status: 'confirmed' }, 'Probation completed');
  await hire(
    'rahul',
    { given: 'Rahul', family: 'Sharma', email: 'rahul.sharma@kaverifoods.test', entity: 'KFPL', code: 'KF-0088', joined: '2023-02-01', status: 'confirmed' },
    { locationId: blr, departmentId: sales, designationId: await d('ASM'), gradeId: await g('G3'), employmentTypeId: perm, managerEmployeeId: ramesh, costCentres: [] },
    '880000',
  );
  // Waiting for a second person's approval (YX-SEC-11).
  await change('rahul', 'salary_revision', '2026-12-01', { compensation: { increasePercent: '6' } }, 'Market correction', { pending: true });
  await hire(
    'kavya',
    { given: 'Kavya', family: 'Reddy', email: 'kavya.reddy@kaverifoods.test', entity: 'KFPL-TN', code: 'KFT-0031', joined: '2025-09-15', status: 'confirmed' },
    { locationId: hosur, departmentId: prod, designationId: await d('PROD-SUP'), gradeId: await g('W2'), employmentTypeId: ftc, managerEmployeeId: divya, costCentres: [{ costCentreId: await costCentre('CC-HSR-PRD'), percent: '100.00' }] },
    '280000',
  );
  await change('kavya', 'manager_change', '2026-11-16', { assignment: { managerEmployeeId: people.lakshmi.employee } }, 'Plant reporting moves to People', { pending: true });
}
