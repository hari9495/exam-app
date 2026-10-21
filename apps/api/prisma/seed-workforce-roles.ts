import { Prisma } from '@prisma/client';
import { OrgSecretsCryptoService } from '@exam-platform/shared';
import { hashValue, sealValue } from '../src/people/profile.service';

// Contract workers and placements for the Kaveri Foods demo (founder decision 21 Oct 2026), in the story world of the
// CLB and HIR screens: fictional contractors, licences and people. HR Admin runs both modules; the Plant HR Executive
// (Hosur only) reads the contract workers of the Hosur plant. Idempotent: each part is skipped once it exists, so it also
// runs on a database seeded before (prisma/scripts/add-contract-placements-demo.ts).

type Tx = Prisma.TransactionClient;

export const WORKFORCE_ROLE_PERMISSIONS = [
  { key: 'clra.worker.view', description: 'See contractors, their licences and the contract workers deployed in scope' },
  { key: 'clra.worker.manage', description: 'Add contractors and licences, deploy contract workers (licence and age checked), approve and release them' },
  { key: 'staffing.placement.view', description: 'See placements with clients, their rates and margins, for the legal entities in scope' },
  { key: 'staffing.placement.manage', description: 'Create placements with clients and end them' },
  { key: 'clra.compliance.manage', description: 'Verify contractor documents and monthly proofs, release a held contractor bill with a reason, and close liability alerts' },
  { key: 'clra.identity.view', description: "See a contract worker's Aadhaar, UAN and ESI number in full (each view is recorded)" },
];
/** HR Admin: all of them. */
export const WORKFORCE_ROLE_ADMIN_KEYS = WORKFORCE_ROLE_PERMISSIONS.map((p) => p.key);
/** System Admin: everything but the Confidential identity numbers. */
export const WORKFORCE_ROLE_ORG_ADMIN_KEYS = WORKFORCE_ROLE_ADMIN_KEYS.filter((k) => k !== 'clra.identity.view');

const D = (s: string) => new Date(`${s}T00:00:00Z`);

export async function seedWorkforceRoles(tx: Tx, organizationId: string): Promise<string[]> {
  const org = { organizationId };
  const done: string[] = [];
  const hr = await tx.user.findFirst({ where: { ...org, email: 'hr@demo-org.test' }, select: { id: true } });
  // HR Admin runs both modules (a company's own profile, so it is updated here; new companies get it from the template).
  const profile = await tx.permissionProfile.findFirst({ where: { ...org, name: 'HR Admin' } });
  if (profile) {
    const keys: string[] = JSON.parse(profile.permissionsJson);
    const missing = WORKFORCE_ROLE_ADMIN_KEYS.filter((k) => !keys.includes(k));
    if (missing.length) {
      await tx.permissionProfile.update({ where: { id: profile.id }, data: { permissionsJson: JSON.stringify([...keys, ...missing]) } });
      done.push(`HR Admin: ${missing.join(', ')}`);
    }
  }
  // The Plant HR Executive (Hosur) reads contract workers, like the HR Executive template (placements belong to a legal
  // entity, which a site scope does not reach).
  const plant = await tx.permissionProfile.findFirst({ where: { ...org, name: 'Plant HR Executive' } });
  if (plant) {
    const keys: string[] = JSON.parse(plant.permissionsJson);
    const missing = ['clra.worker.view'].filter((k) => !keys.includes(k));
    if (missing.length) {
      await tx.permissionProfile.update({ where: { id: plant.id }, data: { permissionsJson: JSON.stringify([...keys, ...missing]) } });
      done.push(`Plant HR Executive: ${missing.join(', ')}`);
    }
  }

  const tn = await tx.legalEntity.findFirst({ where: { ...org, shortName: 'KFPL-TN' } });
  const ka = await tx.legalEntity.findFirst({ where: { ...org, shortName: 'KFPL' } });
  const hosur = await tx.location.findFirst({ where: { ...org, code: 'HSR-PLT' } });
  const blr = await tx.location.findFirst({ where: { ...org, code: 'BLR-HO' } });
  if (!tn || !ka || !hosur || !blr) return done;

  if (!(await tx.contractor.findFirst({ where: org }))) {
    const contractor = async (entity: string, name: string, work: string, pan: string, contact: string, lic: { no: string; site: string; states: string[]; max: number; to: string }) => {
      const k = await tx.contractor.create({ data: { ...org, legalEntityId: entity, name, work, pan, contact, createdBy: hr?.id ?? null } });
      const l = await tx.contractorLicence.create({ data: { ...org, contractorId: k.id, licenceNo: lic.no, locationId: lic.site, states: lic.states, maxWorkers: lic.max, validFrom: D('2026-01-01'), validTo: D(lic.to), createdBy: hr?.id ?? null } });
      return { k, l };
    };
    const sriLakshmi = await contractor(tn.id, 'Sri Lakshmi Facility Services', 'Housekeeping', 'AAKFS4471L', 'Lakshmi Narayanan', { no: 'TN/OSH/CL/2026/1180', site: hosur.id, states: ['IN-TN', 'IN-KA'], max: 30, to: '2026-12-31' });
    const vetri = await contractor(tn.id, 'Vetri Security Agency', 'Security', 'AAHFV2210K', 'Selvam K.', { no: 'TN/CLRA/2024/0442', site: hosur.id, states: ['IN-TN'], max: 20, to: '2026-11-20' });
    const annapoorna = await contractor(ka.id, 'Annapoorna Canteen Services', 'Canteen', 'AAMFA5512P', 'Geetha P.', { no: 'KA/OSH/CL/2026/0341', site: blr.id, states: ['IN-KA'], max: 12, to: '2028-03-31' });
    const deploy = async (c: { k: { id: string; legalEntityId: string }; l: { id: string; locationId: string } }, given: string, family: string, work: string, skill: string, wage: number, from: string, dob: string, status = 'deployed') => {
      const p = await tx.person.create({ data: { ...org, givenName: given, familyName: family, createdBy: hr?.id ?? null } });
      const w = await tx.contractDeployment.create({ data: { ...org, legalEntityId: c.k.legalEntityId, contractorId: c.k.id, licenceId: c.l.id, personId: p.id, locationId: c.l.locationId, work, skill, wage, dateOfBirth: D(dob), fromOn: D(from), status, createdBy: hr?.id ?? null, decidedBy: status === 'deployed' ? (hr?.id ?? null) : null } });
      await tx.personRole.create({ data: { ...org, personId: p.id, roleType: 'contract_worker', sourceTable: 'contract_deployments', sourceId: w.id, startOn: D(from) } });
    };
    await deploy(sriLakshmi, 'Murugan', 'P.', 'Housekeeping', 'unskilled', 14820, '2026-04-02', '1990-03-12');
    await deploy(sriLakshmi, 'Selvi', 'R.', 'Housekeeping', 'unskilled', 14820, '2026-05-06', '1994-08-21');
    await deploy(vetri, 'Anbu', 'Selvan', 'Security guard', 'semi_skilled', 16240, '2026-03-11', '1988-01-30');
    await deploy(vetri, 'Karthika', 'M.', 'Security guard', 'semi_skilled', 16240, '2026-06-15', '1996-11-04');
    await deploy(vetri, 'Ramesh', 'Babu', 'Security guard', 'semi_skilled', 16240, '2026-10-12', '1999-05-17', 'pending');
    await deploy(annapoorna, 'Shanthi', 'V.', 'Cook', 'skilled', 19200, '2026-07-01', '1985-09-09');
    done.push('3 contractors, 6 contract workers');
  }

  if (!(await tx.placement.findFirst({ where: org }))) {
    const place = async (given: string, family: string, client: string, role: string, start: string, end: string, bill: number, pay: number, stat: number, vendor: string | null = null) => {
      const p = await tx.person.create({ data: { ...org, givenName: given, familyName: family, createdBy: hr?.id ?? null } });
      const x = await tx.placement.create({ data: { ...org, legalEntityId: ka.id, personId: p.id, client, role, startOn: D(start), endOn: D(end), billRate: bill, payRate: pay, statutoryPerHour: stat, supply: vendor ? 'vendor' : 'own', vendor, createdBy: hr?.id ?? null } });
      await tx.personRole.create({ data: { ...org, personId: p.id, roleType: 'placement', sourceTable: 'placements', sourceId: x.id, startOn: D(start) } });
    };
    await place('Aravind', 'Kumar', 'Nilgiri Retail Pvt Ltd', 'Java Developer', '2026-01-05', '2026-12-31', 1200, 800, 96);
    await place('Sowmya', 'Ramesh', 'Nilgiri Retail Pvt Ltd', 'Senior Java Developer', '2025-11-01', '2026-11-15', 1650, 1100, 132);
    await place('Priya', 'Nair', 'Coromandel Logistics', 'Warehouse Supervisor', '2026-08-01', '2027-01-31', 1200, 900, 0, 'Sahyadri Staffing');
    done.push('3 placements');
  }
  // Part 2 (21 Oct 2026): statutory codes, standing documents, last month's proofs, workers' identifiers and gate passes.
  if (!(await tx.contractorProof.findFirst({ where: org }))) {
    const admin = await tx.user.findFirst({ where: { ...org, email: 'admin@demo-org.test' }, select: { id: true } });
    const k = async (name: string) => tx.contractor.findFirst({ where: { ...org, name } });
    const sri = await k('Sri Lakshmi Facility Services');
    const vetri = await k('Vetri Security Agency');
    const anna = await k('Annapoorna Canteen Services');
    if (sri && vetri && anna) {
      await tx.contractor.update({ where: { id: sri.id }, data: { gstin: '33AAKFS4471L1Z2', pfCode: 'TNMAS0077120000', esicCode: '51000771200001001', lin: '1-2345-6789-0' } });
      await tx.contractor.update({ where: { id: vetri.id }, data: { gstin: '33AAHFV2210K1ZA', pfCode: 'TNMAS0081230000', esicCode: '51000812300001001' } });
      await tx.contractor.update({ where: { id: anna.id }, data: { pfCode: 'KNBNG0066120000', esicCode: '53000661200001001' } });
      const doc = (contractorId: string, kind: string, number: string, validTo: string | null, status = 'verified') =>
        tx.contractorDocument.create({ data: { ...org, contractorId, kind, number, validFrom: D('2026-01-01'), validTo: validTo ? D(validTo) : null, status, submittedBy: hr?.id ?? null, verifiedBy: status === 'verified' ? (admin?.id ?? null) : null, verifiedAt: status === 'verified' ? new Date() : null } });
      await doc(sri.id, 'registration', 'TN/SE/2019/44120', null);
      await doc(sri.id, 'insurance', 'EC/2026/88231 (employees compensation)', '2026-12-31');
      await doc(vetri.id, 'insurance', 'EC/2025/55010 (employees compensation)', '2026-10-31', 'submitted');
      await doc(anna.id, 'registration', 'KA/SE/2021/90112', null, 'submitted');
      // September 2026 wages: Sri Lakshmi all verified; Vetri's ESI challan short; Annapoorna partly in.
      const proof = (contractorId: string, proofType: string, status: string, extra: Record<string, unknown> = {}) =>
        tx.contractorProof.create({ data: { ...org, contractorId, month: D('2026-09-01'), proofType, status, submittedBy: hr?.id ?? null, verifiedBy: status === 'verified' || status === 'discrepancy' ? (admin?.id ?? null) : null, verifiedAt: status === 'verified' || status === 'discrepancy' ? new Date() : null, ...extra } });
      await proof(sri.id, 'pf', 'verified', { reference: 'TRRN 3112609004512', amount: 8540, workersCovered: 2 });
      await proof(sri.id, 'esi', 'verified', { reference: '26091544101', amount: 1186, workersCovered: 2 });
      await proof(sri.id, 'wage_register', 'verified');
      await proof(sri.id, 'wage_payment', 'verified', { paidOn: D('2026-10-06'), amount: 29640 });
      await proof(sri.id, 'pt_lwf', 'not_required', { note: 'Wages below the professional tax slab.' });
      await proof(vetri.id, 'pf', 'verified', { reference: 'TRRN 3112609004588', amount: 7790, workersCovered: 2 });
      await proof(vetri.id, 'esi', 'discrepancy', { reference: '26091544901', amount: 650, workersCovered: 1, note: 'Covers 1 worker; 2 were deployed.' });
      await proof(vetri.id, 'wage_register', 'submitted');
      await proof(anna.id, 'pf', 'submitted', { reference: 'TRRN 3112609004601', amount: 4608, workersCovered: 1 });
      await proof(anna.id, 'esi', 'submitted', { reference: '26091545210', amount: 768, workersCovered: 1 });
      // Identifiers (fictional numbers) and gate passes for the deployed workers.
      const crypto = new OrgSecretsCryptoService();
      const workers = await tx.contractDeployment.findMany({ where: { ...org, status: { not: 'released' } }, orderBy: { createdAt: 'asc' } });
      let n = 0;
      for (const w of workers) {
        n++;
        const aadhaar = `${5000 + n}${String(41230000 + n * 7713).padStart(8, '0')}`.slice(0, 12);
        const uan = `1013${String(55000000 + n * 1371).padStart(8, '0')}`;
        const esic = `31007712${String(10 + n).padStart(2, '0')}`;
        await tx.contractDeployment.update({
          where: { id: w.id },
          data: { aadhaarEnc: sealValue(crypto, organizationId, w.id, aadhaar), aadhaarHash: hashValue(crypto, organizationId, 'aadhaar', aadhaar), aadhaarLast4: aadhaar.slice(-4), uanEnc: sealValue(crypto, organizationId, w.id, uan), uanLast4: uan.slice(-4), esicEnc: sealValue(crypto, organizationId, w.id, esic), esicLast4: esic.slice(-4), gatePass: `GP-${String(4100 + n)}`, gatePassValidTo: D('2026-12-31') },
        });
      }
      done.push(`contractor codes, 4 documents, 10 proofs for Sep 2026, identifiers for ${n} workers`);
    }
  }
  return done;
}
