import { Prisma } from '@prisma/client';

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
];
export const WORKFORCE_ROLE_ADMIN_KEYS = WORKFORCE_ROLE_PERMISSIONS.map((p) => p.key);

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
  return done;
}
