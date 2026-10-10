import { Prisma } from '@prisma/client';
import { BlobStorageService, OrgSecretsCryptoService, TenantPrismaService } from '@exam-platform/shared';
import { ApprovalsEngine } from '../src/workflow/approvals-engine.service';
import { PayPeriodsService, REOPEN, reopenPhrase } from '../src/payroll/periods.service';
import { PayDocumentsService } from '../src/payroll/documents.service';
import { ExchangeFilesService } from '../src/payroll/exchange-files.service';
import { PayFileStore } from '../src/payroll/pay-file-store';
import { PLATFORM_CHAIN, ZERO_HASH, checkBatch, type ChainRow } from '../src/payroll/audit-chain';
import { monthRange, todayIn } from '../src/time/time-core';
import { addDays } from '../src/time/time-maths';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PAY_VARIABLES, checkFormula } from '../src/rules-engine/expressions';
import type { RuleSet } from '../src/statutory/evaluator';
import { STARTER_COMPONENTS, STARTER_TEMPLATE } from '../src/payroll/starter';
import { breakup, breakupJson, type ComponentDef } from '../src/payroll/structure';

// Payroll batch 5a demo for Kaveri Foods (M03-BUILD-DESIGN §17.1), in the story world of the YukthiX screens:
//   - Meena Raghavan (payroll-approver@demo-org.test), Payroll Approver; Neha Joshi (finance@demo-org.test), Finance
//     Approver; Suresh Pillai (payroll@demo-org.test) gets the batch-5a keys of the Payroll Admin template;
//   - pay periods for both legal entities this year; Kaveri Foods Pvt Ltd's month before last is locked, and Suresh's
//     request to reopen it is waiting for its second approver (Meena checked it; Neha or the System Admin decides);
//   - an issued sample payslip for Arjun Kulkarni with its verify code, and a bank file Suresh generated, waiting for
//     Meena to release it;
//   - the audit chain checked once (an anchor).
// Idempotent: skipped once Meena's login exists.

type Tx = Prisma.TransactionClient;
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const prevMonth = (m: string) => addDays(`${m}-01`, -1).slice(0, 7);

export const PAY_PERMISSIONS = [
  { key: 'payroll.period.view', description: 'See pay periods, their lock stage, history and corrections for the legal entities in scope' },
  { key: 'payroll.period.reopen', description: 'Ask to reopen a locked pay period, and check (first approval) a reopen someone else asked for (needs a fresh second sign-in step)' },
  { key: 'payroll.period.reopen.approve', description: 'Give the final approval to reopen a locked pay period (Finance or System Admin; needs a fresh second sign-in step)' },
  { key: 'payroll.correction.approve', description: 'Approve corrections that reach a processed payroll month; they are paid in the next payroll' },
  { key: 'payroll.document.view', description: "See and download the pay documents of the people in scope (every view of someone else's document is recorded)" },
  { key: 'payroll.document.issue', description: 'Issue pay documents and supersede them with a correction (needs a fresh second sign-in step)' },
  { key: 'payroll.file.view', description: 'See and download payroll exchange files (bank, statutory, journal) of the legal entities in scope; every download is recorded' },
  { key: 'payroll.file.release', description: 'Release an exchange file someone else generated (needs a fresh second sign-in step)' },
  { key: 'audit.view', description: 'Read the audit log and record timelines in scope; Confidential values are masked without the field permission' },
  { key: 'audit.export', description: 'Export the audit log (every export is itself recorded)' },
  { key: 'audit.hold.manage', description: 'Place and release legal holds on audit entries and pay documents' },
  // Batch 5b (also in the payroll_5b migration).
  { key: 'payroll.setup.manage', description: 'Set up payroll for the legal entities in scope: pay groups, membership, payslip layout, the statutory rules browser and the coverage monitor' },
  { key: 'payroll.statutory.setup', description: 'Change statutory registrations, deductor details and legal options of the legal entities in scope (needs a fresh second sign-in step)' },
  { key: 'payroll.component.manage', description: 'Manage the pay component library and its wage flags' },
  { key: 'payroll.template.manage', description: 'Build salary templates and their versions' },
  { key: 'payroll.import.run', description: 'Import opening balances, as-paid lines and previous-employer income for the legal entities in scope' },
  { key: 'platform.statutory.manage', description: 'Draft and publish statutory rule sets (YukthiX staff; the publisher is never the drafter)' },
  // Batch 5c (also in the payroll_5c migration).
  { key: 'payroll.run.view', description: 'See payroll runs, payslips and their workings for the legal entities in scope' },
  { key: 'payroll.run.prepare', description: 'Create, calculate, review, submit and void payroll runs for the legal entities in scope' },
  { key: 'payroll.run.approve', description: 'Approve payroll runs prepared by others; approving locks the month (needs a fresh second sign-in step)' },
  { key: 'payroll.input.manage', description: 'Enter loss-of-pay days, one-time pay, special days and court orders for the legal entities in scope' },
  { key: 'payroll.hold.manage', description: 'Hold and release net pay' },
  { key: 'payroll.loan.manage', description: 'Manage loans and salary advances and change their schedules' },
  { key: 'payroll.loan.approve', description: 'Approve loan and salary-advance requests of others' },
  { key: 'payroll.journal.export', description: 'See and export payroll journals' },
  { key: 'payroll.cost_rate.view', description: 'See employee cost rates (Restricted)' },
  // Batch 5d (also in the payroll_5d migration).
  { key: 'payroll.bankfile.generate', description: 'Generate the bank file of an approved payroll run (a new one needs a reason)' },
  { key: 'payroll.bankfile.release', description: 'Release a bank file generated by someone else, and allow an urgent bank fix after a failed payment (needs a fresh second sign-in step)' },
  { key: 'payroll.payment.record', description: 'Record bank results and cash or cheque payments, and ask for a cash or cheque payment mode' },
  { key: 'payroll.payslip.publish', description: 'Publish the payslips of an approved payroll run to employees (needs a fresh second sign-in step)' },
  { key: 'payroll.query.handle', description: "Answer employees' payslip queries for the legal entities in scope" },
  { key: 'payroll.payment_mode.approve', description: 'Approve a cash or cheque payment mode asked for by someone else' },
];
export const PAYROLL_APPROVER = ['org:view', 'org.structure.view', 'employee.profile.view', 'employee.change.approve', 'employee.salary.view', 'employee.identity.view', 'employee.identity.approve', 'payroll.period.view', 'payroll.period.reopen', 'payroll.document.view', 'payroll.file.view', 'payroll.file.release', 'payroll.run.view', 'payroll.run.approve', 'payroll.loan.approve', 'payroll.bankfile.release', 'payroll.payment_mode.approve'];
export const PAYROLL_ADMIN_5A = ['employee.change.manage', 'payroll.period.view', 'payroll.period.reopen', 'payroll.correction.approve', 'payroll.document.view', 'payroll.document.issue', 'payroll.file.view', 'audit.view', 'payroll.setup.manage', 'payroll.statutory.setup', 'payroll.component.manage', 'payroll.template.manage', 'payroll.import.run', 'payroll.run.view', 'payroll.run.prepare', 'payroll.input.manage', 'payroll.hold.manage', 'payroll.loan.manage', 'payroll.journal.export', 'payroll.cost_rate.view', 'payroll.bankfile.generate', 'payroll.payment.record', 'payroll.payslip.publish', 'payroll.query.handle'];
export const FINANCE_APPROVER = ['org:view', 'org.structure.view', 'payroll.period.view', 'payroll.period.reopen.approve', 'payroll.file.view', 'payroll.file.release', 'payroll.run.view', 'payroll.run.approve', 'payroll.journal.export', 'payroll.cost_rate.view', 'payroll.bankfile.release'];

export async function seedPay(tx: Tx, organizationId: string, passwordHash: string) {
  const org = { organizationId };
  // Suresh's Payroll Admin profile gains the batch-5a keys of its template (kept in step on every run).
  const payrollAdmin = await tx.permissionProfile.findFirst({ where: { ...org, name: 'Payroll Admin' } });
  if (payrollAdmin) {
    const keys = new Set<string>([...(JSON.parse(payrollAdmin.permissionsJson) as string[]), ...PAYROLL_ADMIN_5A]);
    await tx.permissionProfile.update({ where: { id: payrollAdmin.id }, data: { permissionsJson: JSON.stringify([...keys]) } });
  }
  if (await tx.user.findFirst({ where: { ...org, email: 'payroll-approver@demo-org.test' } })) return;
  const c = { organizationId, isSuperAdmin: false, userId: null };
  const today = todayIn('Asia/Kolkata');
  const fake = { forTenant: (_c: unknown, fn: (t: Tx) => unknown) => fn(tx) } as unknown as TenantPrismaService;
  const engine = new ApprovalsEngine(fake, { notifySystem: async () => undefined } as never, { deliver: async () => undefined } as never);
  new PayPeriodsService(null as never, fake, engine).onModuleInit();
  const files = new PayFileStore(new BlobStorageService(), new OrgSecretsCryptoService());
  const documents = new PayDocumentsService(null as never, fake, files, new OrgSecretsCryptoService(), null as never, { get: async () => [] }, null as never);
  const exchange = new ExchangeFilesService(null as never, fake, files);

  // ---- people ----
  const profile = async (name: string, keys: string[]) => {
    const p = (await tx.permissionProfile.findFirst({ where: { ...org, name } })) ?? (await tx.permissionProfile.create({ data: { ...org, name, permissionsJson: JSON.stringify(keys) } }));
    return (await tx.permissionProfile.update({ where: { id: p.id }, data: { permissionsJson: JSON.stringify(keys) } })).id;
  };
  const login = async (email: string, name: string, profileId: string) => (await tx.user.upsert({ where: { organizationId_email: { organizationId, email } }, update: { permissionProfileId: profileId }, create: { ...org, email, name, passwordHash, role: 'panel', permissionProfileId: profileId } })).id;
  const meena = await login('payroll-approver@demo-org.test', 'Meena Raghavan', await profile('Payroll Approver', PAYROLL_APPROVER));
  await login('finance@demo-org.test', 'Neha Joshi', await profile('Finance Approver', FINANCE_APPROVER));
  const suresh = (await tx.user.findFirstOrThrow({ where: { ...org, email: 'payroll@demo-org.test' } })).id;
  const kfpl = await tx.legalEntity.findFirstOrThrow({ where: { ...org, shortName: 'KFPL' } });
  const tn = await tx.legalEntity.findFirstOrThrow({ where: { ...org, shortName: 'KFPL-TN' } });
  await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${kfpl.id},${tn.id}}`}, true)`;

  // ---- pay periods this year for both entities (open unless already locked); the month before last locked at KFPL ----
  const last = prevMonth(today.slice(0, 7));
  const locked = prevMonth(last);
  for (const e of [kfpl, tn])
    for (let m = `${today.slice(0, 4)}-01`; m <= today.slice(0, 7); m = addDays(monthRange(m).to, 1).slice(0, 7)) {
      const r = monthRange(m);
      const at = await tx.payPeriod.findFirst({ where: { ...org, legalEntityId: e.id, payGroupId: null, periodStart: day(r.from) } });
      if (!at) await tx.payPeriod.create({ data: { ...org, legalEntityId: e.id, periodStart: day(r.from), periodEnd: day(r.to), stage: 'open' } });
    }
  const lockedPeriod = await tx.payPeriod.findFirstOrThrow({ where: { ...org, legalEntityId: kfpl.id, payGroupId: null, periodStart: day(`${locked}-01`) } });
  const hr = (await tx.user.findFirstOrThrow({ where: { ...org, email: 'hr@demo-org.test' } })).id;
  await tx.payPeriod.update({ where: { id: lockedPeriod.id }, data: { stage: 'locked', lockedAt: new Date(), lockedBy: hr, changedBy: hr, changedAt: new Date() } });
  await tx.periodLockEvent.create({ data: { ...org, payPeriodId: lockedPeriod.id, fromStage: 'open', toStage: 'locked', byUser: hr } });

  // ---- Suresh asks to reopen it; Meena has checked it; it waits for Neha (or the System Admin) ----
  const reason = 'Two overtime claims of the Bengaluru team were approved after the lock';
  const req = await tx.periodReopenRequest.create({ data: { ...org, payPeriodId: lockedPeriod.id, legalEntityId: kfpl.id, reason, requestedBy: suresh, confirmation: { via: 'payroll.period.reopen', stage: 'locked' } } });
  const admins = (await tx.user.findMany({ where: { ...org, role: 'org_admin', status: 'active' }, select: { id: true } })).map((u) => u.id);
  const neha = (await tx.user.findFirstOrThrow({ where: { ...org, email: 'finance@demo-org.test' } })).id;
  const monthName = new Date(`${locked}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const sub = await engine.submit(tx, { ...c, userId: suresh }, {
    type: REOPEN,
    subjectType: 'period_reopen_request',
    subjectId: req.id,
    title: `Reopen ${monthName} for ${kfpl.name}`,
    summary: [
      { label: 'Legal entity', value: kfpl.name },
      { label: 'Month', value: monthName },
      { label: 'Why', value: reason },
    ],
    subjectPersonId: null,
    requesterUserId: suresh,
    raisedByUserId: suresh,
    steps: [
      { name: 'Payroll check', approvers: [{ kind: 'users', userIds: [meena] }], mode: 'any', remindAfterHours: 24 },
      { name: 'Finance or System Admin', approvers: [{ kind: 'users', userIds: [neha, ...admins] }], mode: 'any', remindAfterHours: 24 },
    ],
    payload: {},
    payloadFields: [],
    fallbackUserIds: [],
  });
  await tx.periodReopenRequest.update({ where: { id: req.id }, data: { wfRequestId: sub.id } });
  const task = await tx.wfTask.findFirstOrThrow({ where: { ...org, requestId: sub.id, assigneeUserId: meena, status: 'open' } });
  await engine.decide({ ...c, userId: meena }, meena, task.id, 'approve', null, 'web', { via: REOPEN, evidence: { phrase: reopenPhrase(kfpl.shortName, locked), impact: [{ label: 'Month', value: monthName }] } });

  // ---- an issued sample payslip for Arjun (three months ago, an open month) and a bank file for Meena to release ----
  const arjun = await tx.employee.findFirstOrThrow({ where: { ...org, workEmail: 'arjun.kulkarni@kaverifoods.test' } });
  const slipMonth = prevMonth(locked);
  await documents.issueIn(tx, { ...c, userId: suresh }, {
    employeeId: arjun.id,
    legalEntityId: kfpl.id,
    kind: 'payslip',
    month: slipMonth,
    by: suresh,
    supersedes: null,
    confirmation: { phrase: 'ISSUE PS', impact: [{ label: 'Person', value: 'Arjun Kulkarni' }] },
    fields: {
      employerName: kfpl.name,
      employeeName: 'Arjun Kulkarni',
      employeeCode: 'KF-0142',
      designation: 'QA Engineer',
      period: new Date(`${slipMonth}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      paidDays: '30',
      payDate: `${addDays(monthRange(slipMonth).to, 1)}`,
      grossPay: '60500.00',
      netPay: '55380.00',
      earnings: [
        { label: 'Basic', amount: '30250.00' },
        { label: 'House rent allowance', amount: '15125.00' },
        { label: 'Special allowance', amount: '15125.00' },
      ],
      deductions: [
        { label: 'Provident fund', amount: '3630.00' },
        { label: 'Professional tax', amount: '200.00' },
        { label: 'Income tax', amount: '1290.00' },
      ],
    },
  });
  const rows = ['KF-0142,Arjun Kulkarni,XXXXXX4521,55380.00', 'KF-0117,Divya Raghunathan,XXXXXX8834,71240.00'];
  await exchange.generateIn(tx, { ...c, userId: suresh }, {
    legalEntityId: kfpl.id,
    kind: 'bank',
    ownerType: 'demo',
    ownerId: null,
    periodStart: `${slipMonth}-01`,
    fileName: `KFPL-salary-${slipMonth}.csv`,
    contentType: 'text/csv',
    data: Buffer.from(`code,name,account,amount\n${rows.join('\n')}\n`, 'utf8'),
    rows: rows.length,
    totals: { amount: '126620.00' },
    by: suresh,
  });
  await tx.$executeRaw`SELECT set_config('app.pay_entities', '', true)`;
}

/** Checks a chain once (the daily job's work) and stores the anchor: the demo opens with "audit chain verified". */
export async function seedAuditAnchor(tx: Tx, organizationId: string) {
  let cursor = { seq: BigInt(0), hash: ZERO_HASH };
  let n = 0;
  for (;;) {
    const batch = (await tx.auditLog.findMany({ where: { chainKey: organizationId, chainSeq: { gt: cursor.seq } }, orderBy: { chainSeq: 'asc' }, take: 2000 })) as unknown as ChainRow[];
    if (!batch.length) break;
    const r = checkBatch(cursor, batch);
    if ('problem' in r) throw new Error(`audit chain: ${r.problem}`);
    cursor = r.cursor;
    n += batch.length;
  }
  await tx.auditAnchor.create({ data: { organizationId: organizationId === PLATFORM_CHAIN ? null : organizationId, chainKey: organizationId, lastSeq: cursor.seq, lastHash: cursor.hash, rowsChecked: BigInt(n), result: 'ok' } });
  return n;
}

// Payroll batch 5b demo (M03-BUILD-DESIGN §17.2), idempotent: the India starter library and template (version from the
// financial year's start, with its sample run), a "Monthly staff" pay group per legal entity with everyone in it, and
// Kaveri Foods Pvt Ltd's statutory registrations (PF and ESI on, Karnataka PT on, Tamil Nadu PT applied for).
export async function seedPay5b(tx: Tx, organizationId: string) {
  const org = { organizationId };
  // 5b-D1: the minimum-wage zones of the offices (Karnataka zone 1 is BBMP Bengaluru; Tamil Nadu zone A is a corporation).
  await tx.location.updateMany({ where: { ...org, name: 'Bengaluru head office', minWageZone: null }, data: { minWageZone: '1' } });
  await tx.location.updateMany({ where: { ...org, name: 'Chennai office', minWageZone: null }, data: { minWageZone: 'A' } });
  if (await tx.salaryTemplate.findFirst({ where: { ...org, name: STARTER_TEMPLATE.name } })) return;
  const today = todayIn('Asia/Kolkata');
  const fy = `${Number(today.slice(5, 7)) >= 4 ? today.slice(0, 4) : Number(today.slice(0, 4)) - 1}-04-01`;
  const kfpl = await tx.legalEntity.findFirstOrThrow({ where: { ...org, shortName: 'KFPL' } });
  const tn = await tx.legalEntity.findFirstOrThrow({ where: { ...org, shortName: 'KFPL-TN' } });
  const suresh = (await tx.user.findFirstOrThrow({ where: { ...org, email: 'payroll@demo-org.test' } })).id;

  await tx.payComponent.createMany({ data: STARTER_COMPONENTS.map(({ statutory, ...s }) => ({ ...org, ...s, taxable: s.taxable ?? true, statutory: statutory ?? null, createdBy: suresh })), skipDuplicates: true });
  const rows = await tx.payComponent.findMany({ where: org });
  const components = rows.map((r) => ({ id: r.id, code: r.code, name: r.name, kind: r.kind as ComponentDef['kind'], pfWage: r.pfWage, esiWage: r.esiWage, ptWage: r.ptWage, gratuityWage: r.gratuityWage, bonusWage: r.bonusWage, codeWagePart: r.codeWagePart, codeExclusion: r.codeExclusion, inCtc: r.inCtc, rounding: r.rounding as ComponentDef['rounding'], statutory: r.statutory }));
  const names = new Set<string>([...PAY_VARIABLES, ...rows.map((r) => r.code)]);
  const lines = STARTER_TEMPLATE.lines.map((l) => ({ code: l.code, ...checkFormula(l.formula, names) }));
  const rules = (JSON.parse(readFileSync(join(__dirname, '..', 'src', 'statutory', 'packs', 'in.json'), 'utf8')) as { ruleSets: RuleSet[] }).ruleSets;
  const sample = { annualCtc: '726000', state: 'IN-KA', age: 30 };
  const options = { balancingCode: STARTER_TEMPLATE.balancing, employerPfInCtc: true, employerEsiInCtc: true, gratuityInCtc: false };
  const b = breakup({ lines, components, options, facts: { on: fy, month: 4, state: sample.state, age: sample.age, pf: true, pfOnActualWage: false, esi: 'by_wage', pwd: false }, rules, ctc: sample.annualCtc });
  const t = await tx.salaryTemplate.create({ data: { ...org, name: STARTER_TEMPLATE.name, createdBy: suresh } });
  const byCode = (code: string) => rows.find((r) => r.code === code)!.id;
  const ver = await tx.salaryTemplateVersion.create({ data: { ...org, templateId: t.id, version: 1, validFrom: day(fy), balancingComponentId: byCode(STARTER_TEMPLATE.balancing), validatedAt: new Date(), sampleInput: sample, sampleResult: breakupJson(b) as unknown as Prisma.InputJsonValue, codeWageFlag: b.codeWageAddBack.gt(0), createdBy: suresh } });
  await tx.salaryTemplateLine.createMany({ data: lines.map((l, i) => ({ ...org, versionId: ver.id, componentId: byCode(l.code), position: i, formulaText: STARTER_TEMPLATE.lines[i].formula, formulaAst: l.ast as unknown as Prisma.InputJsonValue, dependsOn: l.uses })) });

  for (const e of [kfpl, tn]) {
    const g = await tx.payGroup.create({ data: { ...org, legalEntityId: e.id, name: 'Monthly staff', cutOffDay: 25, payDay: 0, createdBy: suresh } });
    const emps = await tx.employment.findMany({ where: { ...org, legalEntityId: e.id, exitedOn: null }, select: { id: true, joinedOn: true } });
    await tx.payGroupMember.createMany({ data: emps.map((m) => ({ ...org, payGroupId: g.id, employmentId: m.id, validFrom: m.joinedOn, createdBy: suresh })), skipDuplicates: true });
  }
  const who = { responsiblePerson: 'Ravi Kaveri', responsibleDesignation: 'Director', updatedBy: suresh };
  await tx.statutoryRegistration.createMany({
    data: [
      { ...org, ...who, legalEntityId: kfpl.id, statute: 'IN.PF', status: 'on', registrationNo: 'KNBNG0045123000', startOn: day('2015-04-01') },
      { ...org, ...who, legalEntityId: kfpl.id, statute: 'IN.ESI', status: 'on', registrationNo: '53000123450001001', startOn: day('2015-04-01') },
      { ...org, ...who, legalEntityId: kfpl.id, statute: 'IN.PT', state: 'IN-KA', status: 'on', registrationNo: 'PTEC 1234567', startOn: day('2015-04-01') },
      { ...org, ...who, legalEntityId: tn.id, statute: 'IN.PT', state: 'IN-TN', status: 'applied_awaited', appliedOn: day(addDays(today, -20)) },
    ],
    skipDuplicates: true,
  });
}
