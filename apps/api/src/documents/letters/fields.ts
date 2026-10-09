import { CompanyContext, Tx } from '../../org-structure/org-structure.service';
import { todayIst } from '../../org-structure/org-validation';
import { settingFor } from '../../people/probation';
import { buildDocx } from './docx';

// LIFE-2.04 the merge-field registry (P05 §4.3, YX-DOC-07 / 08): every field a letter template may use, its plain
// label and its P02 data class. Templates may only use these; an issuer must see a field's class for the person.
// Values come from the employee record when there is one, else from the joiner's planned job (founder D2).

export interface FieldDef {
  label: string;
  /** P02 class: internal fields need letter.issue in scope; personal ones also employee.personal.view. */
  cls: 'internal' | 'personal';
  /** A yes / no field, used for {{#field}} … {{/field}} sections. */
  flag?: boolean;
  sample: string | boolean;
}

export const FIELDS: Readonly<Record<string, FieldDef>> = {
  employee_name: { label: 'Full name', cls: 'internal', sample: 'Sneha Pillai' },
  first_name: { label: 'First name', cls: 'internal', sample: 'Sneha' },
  last_name: { label: 'Last name', cls: 'internal', sample: 'Pillai' },
  employee_code: { label: 'Employee code (after joining)', cls: 'internal', sample: 'KFT-0042' },
  designation: { label: 'Designation', cls: 'internal', sample: 'Production Supervisor' },
  department: { label: 'Department', cls: 'internal', sample: 'Production' },
  location: { label: 'Work location', cls: 'internal', sample: 'Hosur plant' },
  employment_type: { label: 'Employment type', cls: 'internal', sample: 'Permanent' },
  manager_name: { label: "Manager's name", cls: 'internal', sample: 'Divya Raghunathan' },
  joining_date: { label: 'Joining day', cls: 'internal', sample: '19 October 2026' },
  probation_months: { label: 'Probation length in months', cls: 'internal', sample: '6' },
  probation: { label: 'On probation (yes / no)', cls: 'internal', flag: true, sample: true },
  legal_entity: { label: 'Legal entity (employer) name', cls: 'internal', sample: 'Kaveri Foods Pvt Ltd' },
  company_name: { label: 'Company name', cls: 'internal', sample: 'Kaveri Foods' },
  today: { label: "Today's date", cls: 'internal', sample: '9 October 2026' },
  signatory_name: { label: 'Who signs (name)', cls: 'internal', sample: 'Lakshmi Venkatesan' },
  signatory_title: { label: 'Who signs (title)', cls: 'internal', sample: 'Head of HR' },
  address: { label: 'Home address', cls: 'personal', sample: '14, 3rd Cross, Jayanagar, Bengaluru 560011' },
  personal_email: { label: 'Personal email', cls: 'personal', sample: 'sneha.p@mail.test' },
};

const longDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Edit distance, for "did you mean" (YX-DOC-15). */
export function suggest(name: string): string | null {
  // An abbreviation first ("emp_nme" is in order inside "employee_name"), then the nearest spelling.
  const sub = (a: string, b: string) => {
    let i = 0;
    for (const ch of b) if (ch === a[i]) i++;
    return i === a.length;
  };
  const abbr = Object.keys(FIELDS).filter((k) => sub(name, k)).sort((a, b) => a.length - b.length)[0];
  if (abbr) return abbr;
  let best: [string, number] | null = null;
  for (const k of Object.keys(FIELDS)) {
    const d = lev(name, k);
    if (d <= 3 && (!best || d < best[1])) best = [k, d];
  }
  return best?.[0] ?? null;
}
function lev(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

export const sampleData = (): Record<string, string | boolean> => Object.fromEntries(Object.entries(FIELDS).map(([k, f]) => [k, f.sample]));

const name = (p: { preferredName: string | null; givenName: string; familyName: string | null }) => [p.preferredName || p.givenName, p.familyName].filter(Boolean).join(' ');

/** The values for one person (an employee's current job, or a joiner's planned one), all fields filled where known. */
export async function letterData(tx: Tx, c: CompanyContext, personId: string, extra: { signatory?: { name: string; title: string } | null } = {}): Promise<{ data: Record<string, string | boolean>; legalEntityId: string }> {
  const org = c.organizationId;
  const person = await tx.person.findFirstOrThrow({ where: { organizationId: org, id: personId } });
  const today = todayIst();
  const emp = await tx.employee.findFirst({ where: { organizationId: org, personId } });
  let place: { legalEntityId: string; locationId: string | null; departmentId: string | null; designationId: string | null; employmentTypeId: string | null; managerEmployeeId: string | null; joiningOn: string; code: string | null; onProbation: boolean };
  if (emp) {
    const e = await tx.employment.findFirstOrThrow({ where: { organizationId: org, employeeId: emp.id }, orderBy: { joinedOn: 'desc' } });
    const a = await tx.employeeAssignment.findFirst({ where: { organizationId: org, employmentId: e.id, supersededAt: null, validFrom: { lte: new Date(`${today}T00:00:00Z`) } }, orderBy: { validFrom: 'desc' } });
    const st = await tx.employmentStatusPeriod.findFirst({ where: { organizationId: org, employmentId: e.id, supersededAt: null }, orderBy: { validFrom: 'desc' } });
    place = { legalEntityId: e.legalEntityId, locationId: a?.locationId ?? null, departmentId: a?.departmentId ?? null, designationId: a?.designationId ?? null, employmentTypeId: a?.employmentTypeId ?? null, managerEmployeeId: a?.managerEmployeeId ?? null, joiningOn: e.joinedOn.toISOString().slice(0, 10), code: e.employeeCode, onProbation: st?.status === 'probation' };
  } else {
    const pb = await tx.preboarding.findFirst({ where: { organizationId: org, personId, status: { not: 'cancelled' } }, orderBy: { createdAt: 'desc' } });
    if (!pb) throw new Error('This person has no job record or joiner record.');
    place = { legalEntityId: pb.legalEntityId, locationId: pb.locationId, departmentId: pb.departmentId, designationId: pb.designationId, employmentTypeId: pb.employmentTypeId, managerEmployeeId: pb.managerEmployeeId, joiningOn: pb.joiningOn.toISOString().slice(0, 10), code: null, onProbation: true };
  }
  const [entity, orgRow, loc, dept, desig, type, mgr, personal] = await Promise.all([
    tx.legalEntity.findFirst({ where: { organizationId: org, id: place.legalEntityId }, select: { name: true } }),
    tx.organization.findUnique({ where: { id: org }, select: { name: true } }),
    place.locationId ? tx.location.findFirst({ where: { organizationId: org, id: place.locationId }, select: { name: true } }) : null,
    place.departmentId ? tx.department.findFirst({ where: { organizationId: org, id: place.departmentId }, select: { name: true } }) : null,
    place.designationId ? tx.designation.findFirst({ where: { organizationId: org, id: place.designationId }, select: { name: true } }) : null,
    place.employmentTypeId ? tx.employmentType.findFirst({ where: { organizationId: org, id: place.employmentTypeId }, select: { name: true } }) : null,
    place.managerEmployeeId ? tx.employee.findFirst({ where: { organizationId: org, id: place.managerEmployeeId } }) : null,
    emp ? tx.employeePersonalDetails.findFirst({ where: { organizationId: org, employeeId: emp.id } }) : null,
  ]);
  const months = await settingFor(tx, c, 'probation.default_months', { legalEntityId: place.legalEntityId, employmentTypeId: place.employmentTypeId });
  const data: Record<string, string | boolean> = {
    employee_name: name(person),
    first_name: person.preferredName || person.givenName,
    last_name: person.familyName ?? '',
    employee_code: place.code ?? '',
    designation: desig?.name ?? '',
    department: dept?.name ?? '',
    location: loc?.name ?? '',
    employment_type: type?.name ?? '',
    manager_name: mgr ? name(mgr) : '',
    joining_date: longDate(place.joiningOn),
    probation_months: months,
    probation: place.onProbation,
    legal_entity: entity?.name ?? '',
    company_name: orgRow?.name ?? '',
    today: longDate(today),
    signatory_name: extra.signatory?.name ?? '',
    signatory_title: extra.signatory?.title ?? '',
    address: personal ? [personal.addressLine1, personal.addressLine2, personal.city, personal.postalCode].filter(Boolean).join(', ') : '',
    personal_email: personal?.personalEmail ?? person.primaryEmail ?? '',
  };
  return { data, legalEntityId: place.legalEntityId };
}

/** Values missing for the fields a template uses (YX-DOC-07: never a silent blank). Yes / no fields are never missing. */
export const missingFields = (fields: readonly string[], data: Record<string, string | boolean>) => fields.filter((f) => !FIELDS[f]?.flag && (data[f] === undefined || data[f] === ''));

// ------------------------------------------------------------------------------------------ YukthiX starter letters

/** Starter letters (APX-F #5, #6, #12), written by YukthiX in plain English; companies download and edit them in Word. */
export const STARTER_LETTERS: readonly { letterType: string; name: string; requiresApproval: boolean; personSigns: boolean; paragraphs: { text: string; bold?: boolean; heading?: boolean }[] }[] = [
  {
    letterType: 'appointment',
    name: 'Appointment letter',
    requiresApproval: true,
    personSigns: true,
    paragraphs: [
      { text: '{{legal_entity}}', heading: true },
      { text: 'Appointment letter', heading: true },
      { text: 'Date: {{today}}' },
      { text: 'Dear {{employee_name}},' },
      { text: 'We are pleased to appoint you as {{designation}} in our {{department}} team at {{location}}, with {{legal_entity}}, from {{joining_date}}.' },
      { text: 'Type of employment: {{employment_type}}. You will report to {{manager_name}}.' },
      { text: '{{#probation}}You will be on probation for {{probation_months}} months from your joining day. Your manager will review your work before it ends.{{/probation}}' },
      { text: 'Your pay, benefits, working hours, leave and notice period are as set out in your offer and the company policies, which form part of this letter.' },
      { text: 'Please keep company information confidential during and after your employment.' },
      { text: 'Please accept this letter in YukthiX to confirm.' },
      { text: 'For {{legal_entity}}' },
      { text: '{{signatory_name}}, {{signatory_title}}', bold: true },
    ],
  },
  {
    letterType: 'welcome',
    name: 'Welcome and joining instructions',
    requiresApproval: false,
    personSigns: false,
    paragraphs: [
      { text: 'Welcome to {{company_name}}', heading: true },
      { text: 'Dear {{first_name}},' },
      { text: 'We look forward to seeing you on {{joining_date}} at {{location}}.' },
      { text: 'On your first day, please bring your original ID proof (PAN card and one photo ID), your education certificates and your last relieving letter, if you have one.' },
      { text: 'You will meet {{manager_name}}, who will help you settle in.' },
      { text: 'Before you join, please finish your forms in the YukthiX joining portal.' },
      { text: '{{signatory_name}}, {{signatory_title}}', bold: true },
    ],
  },
  {
    letterType: 'confirmation',
    name: 'Confirmation letter',
    requiresApproval: false,
    personSigns: false,
    paragraphs: [
      { text: '{{legal_entity}}', heading: true },
      { text: 'Confirmation of employment', heading: true },
      { text: 'Date: {{today}}' },
      { text: 'Dear {{employee_name}} ({{employee_code}}),' },
      { text: 'We are pleased to confirm your employment as {{designation}} after your probation. All other terms of your appointment stay the same.' },
      { text: 'For {{legal_entity}}' },
      { text: '{{signatory_name}}, {{signatory_title}}', bold: true },
    ],
  },
];

export const starterDocx = (letterType: string) => {
  const s = STARTER_LETTERS.find((x) => x.letterType === letterType);
  return s ? buildDocx(s.paragraphs) : null;
};
