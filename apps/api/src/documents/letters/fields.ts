import { CompanyContext, Tx } from '../../org-structure/org-structure.service';
import { todayIst } from '../../org-structure/org-validation';
import { settingFor } from '../../people/probation';
import { withPayScope } from '../../payroll/pay-access';
import { buildDocx, type Block, type Run } from './docx';

// LIFE-2.04 the merge-field registry (P05 §4.3, YX-DOC-07 / 08): every field a letter template may use, its plain
// label and its P02 data class. Templates may only use these; an issuer must see a field's class for the person.
// Values come from the employee record when there is one, else from the joiner's planned job (founder D2).

export interface FieldDef {
  label: string;
  /** P02 class: internal fields need letter.issue in scope; personal ones also employee.personal.view. */
  cls: 'internal' | 'personal' | 'pay';
  /** A yes / no field, used for {{#field}} … {{/field}} sections. */
  flag?: boolean;
  /** Never missing: blank when not recorded, so templates wrap it in {{#field}} … {{/field}} (the letterhead's CIN). */
  optional?: boolean;
  sample: string | boolean;
}

export const FIELDS: Readonly<Record<string, FieldDef>> = {
  employee_name: { label: 'Full name', cls: 'internal', sample: 'Asha Sample' },
  first_name: { label: 'First name', cls: 'internal', sample: 'Asha' },
  last_name: { label: 'Last name', cls: 'internal', sample: 'Sample' },
  employee_code: { label: 'Employee code (after joining)', cls: 'internal', sample: 'KFT-0042' },
  designation: { label: 'Designation', cls: 'internal', sample: 'Production Supervisor' },
  department: { label: 'Department', cls: 'internal', sample: 'Production' },
  location: { label: 'Work location', cls: 'internal', sample: 'Hosur plant' },
  employment_type: { label: 'Employment type', cls: 'internal', sample: 'Permanent' },
  manager_name: { label: "Manager's name", cls: 'internal', sample: 'Ravi Sample' },
  joining_date: { label: 'Joining day', cls: 'internal', sample: '19 October 2026' },
  last_working_day: { label: 'Last working day (when leaving)', cls: 'internal', sample: '30 October 2026' },
  next_of_kin_name: { label: 'Next of kin (death in service)', cls: 'personal', sample: 'Kiran Sample' },
  probation_months: { label: 'Probation length in months', cls: 'internal', sample: '6' },
  probation: { label: 'On probation (yes / no)', cls: 'internal', flag: true, sample: true },
  legal_entity: { label: 'Legal entity (employer) name', cls: 'internal', sample: 'Kaveri Foods Pvt Ltd' },
  legal_entity_address: { label: 'Registered address of the legal entity (blank when not recorded)', cls: 'internal', optional: true, sample: '4th Floor, Prestige Meridian, MG Road, Bengaluru 560001' },
  legal_entity_cin: { label: 'CIN of the legal entity (blank when not recorded)', cls: 'internal', optional: true, sample: 'U15400KA2011PTC058812' },
  company_name: { label: 'Company name', cls: 'internal', sample: 'Kaveri Foods' },
  reference_no: { label: 'Reference number (given when the letter is issued)', cls: 'internal', sample: 'KF/APT/2026/000042' },
  today: { label: "Today's date", cls: 'internal', sample: '9 October 2026' },
  signatory_name: { label: 'Who signs (name)', cls: 'internal', sample: 'Priya Sample' },
  signatory_title: { label: 'Who signs (title)', cls: 'internal', sample: 'Head of HR' },
  address: { label: 'Home address', cls: 'personal', sample: '14, 3rd Cross, Jayanagar, Bengaluru 560011' },
  personal_email: { label: 'Personal email', cls: 'personal', sample: 'asha.sample@mail.test' },
  // PPL-06 increment letters (founder 20 Oct 2026): pay fields, filled only from an approved salary revision; issuing
  // or previewing them by hand needs the salary grant for the person (R1).
  old_ctc: { label: 'Annual CTC before the raise', cls: 'pay', sample: '₹5,40,000' },
  new_ctc: { label: 'Annual CTC after the raise', cls: 'pay', sample: '₹5,83,200' },
  raise_percent: { label: 'Raise (per cent)', cls: 'pay', sample: '8%' },
  effective_date: { label: 'Raise effective from', cls: 'pay', sample: '1 November 2026' },
  // PPL-22 F&F statement: filled by payroll from the approved F&F run(s), never by hand.
  fnf_run: { label: 'F&F run reference', cls: 'pay', sample: 'FNF-2026-0041' },
  fnf_lines: { label: 'F&F lines (each line and its amount)', cls: 'pay', sample: 'Basic ₹25,000.00; Leave encashment ₹8,000.00; less Settlement recovery ₹5,000.00' },
  fnf_earnings: { label: 'F&F earnings', cls: 'pay', sample: '₹46,450.00' },
  fnf_recoveries: { label: 'F&F recoveries', cls: 'pay', sample: '₹5,000.00' },
  fnf_tds: { label: 'F&F TDS', cls: 'pay', sample: '₹6,210.00' },
  fnf_statutory: { label: 'F&F PF, ESI, PT and LWF', cls: 'pay', sample: '₹1,800.00' },
  fnf_net_label: { label: 'F&F net (payable or to recover)', cls: 'pay', sample: 'Net payable to you' },
  fnf_net: { label: 'F&F net amount', cls: 'pay', sample: '₹33,440.00' },
  // PPL-31 certificates an employee asks for: their own words (escaped by the filler, never read as placeholders) and
  // the current gross from payroll.
  certificate_purpose: { label: 'Purpose (written by the employee who asked; blank when HR issues it)', cls: 'internal', optional: true, sample: 'Home loan' },
  addressed_to: { label: 'Addressed to (written by the employee who asked; blank when not given)', cls: 'internal', optional: true, sample: 'The Branch Manager, Canara Bank, Hosur' },
  monthly_gross: { label: 'Gross monthly salary (current)', cls: 'pay', sample: '₹1,12,400' },
};

export const longDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

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
/** A salary revision's figures for an increment letter. */
export interface LetterPay {
  oldCtc: string;
  newCtc: string;
  percent: string;
  effectiveDate: string;
}
const inr = (v: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));

/** An F&F statement's figures, worked out by payroll from the approved F&F run(s) (already formatted). */
export interface LetterFnf {
  run: string;
  lines: string;
  earnings: string;
  recoveries: string;
  tds: string;
  statutory: string;
  netLabel: string;
  net: string;
}

/** What an employee wrote when asking for their own certificate (PPL-31). */
export interface CertificateRequest {
  purpose: string;
  addressedTo: string;
}

/** The person's current gross monthly salary from their pay package, or null when payroll has none (PPL-31). */
export async function monthlyGross(tx: Tx, c: CompanyContext, personId: string, legalEntityId: string): Promise<string | null> {
  const org = c.organizationId;
  const emp = await tx.employee.findFirst({ where: { organizationId: org, personId }, select: { id: true } });
  const e = emp ? await tx.employment.findFirst({ where: { organizationId: org, employeeId: emp.id }, orderBy: { joinedOn: 'desc' }, select: { id: true } }) : null;
  if (!e) return null;
  const on = new Date(`${todayIst()}T00:00:00Z`);
  return withPayScope(tx, [legalEntityId], async () => {
    const comp = await tx.compensation.findFirst({ where: { organizationId: org, employmentId: e.id, supersededAt: null, validFrom: { lte: on }, OR: [{ validTo: null }, { validTo: { gte: on } }] }, orderBy: { validFrom: 'desc' } });
    const pkg = comp ? await tx.compensationPackage.findFirst({ where: { organizationId: org, changeId: comp.changeId }, select: { monthlyGross: true } }) : null;
    return pkg ? pkg.monthlyGross.toFixed(2) : null;
  });
}

export async function letterData(tx: Tx, c: CompanyContext, personId: string, extra: { signatory?: { name: string; title: string } | null; pay?: LetterPay | null; fnf?: LetterFnf | null; request?: CertificateRequest | null; gross?: string | null } = {}): Promise<{ data: Record<string, string | boolean>; legalEntityId: string }> {
  const org = c.organizationId;
  const person = await tx.person.findFirstOrThrow({ where: { organizationId: org, id: personId } });
  const today = todayIst();
  const emp = await tx.employee.findFirst({ where: { organizationId: org, personId } });
  let lastDay: string | null = null;
  let nextOfKin = '';
  let place: { legalEntityId: string; locationId: string | null; departmentId: string | null; designationId: string | null; employmentTypeId: string | null; managerEmployeeId: string | null; joiningOn: string; code: string | null; onProbation: boolean };
  if (emp) {
    const e = await tx.employment.findFirstOrThrow({ where: { organizationId: org, employeeId: emp.id }, orderBy: { joinedOn: 'desc' } });
    const a = await tx.employeeAssignment.findFirst({ where: { organizationId: org, employmentId: e.id, supersededAt: null, validFrom: { lte: new Date(`${today}T00:00:00Z`) } }, orderBy: { validFrom: 'desc' } });
    const st = await tx.employmentStatusPeriod.findFirst({ where: { organizationId: org, employmentId: e.id, supersededAt: null }, orderBy: { validFrom: 'desc' } });
    const k = await tx.exitCase.findFirst({ where: { organizationId: org, employmentId: e.id, status: { in: ['accepted', 'cleared', 'exited', 'closed'] } }, orderBy: { createdAt: 'desc' }, select: { approvedLwd: true } });
    lastDay = (e.exitedOn ?? k?.approvedLwd)?.toISOString().slice(0, 10) ?? null;
    // Death in service: letters go to the first payee recorded (nominee or legal heir).
    const kase = await tx.exitCase.findFirst({ where: { organizationId: org, employmentId: e.id, exitType: 'death' }, select: { id: true } });
    if (kase) nextOfKin = (await tx.exitPayee.findFirst({ where: { organizationId: org, exitCaseId: kase.id, removedAt: null }, orderBy: { sharePercent: 'desc' } }))?.name ?? '';
    place = { legalEntityId: e.legalEntityId, locationId: a?.locationId ?? null, departmentId: a?.departmentId ?? null, designationId: a?.designationId ?? null, employmentTypeId: a?.employmentTypeId ?? null, managerEmployeeId: a?.managerEmployeeId ?? null, joiningOn: e.joinedOn.toISOString().slice(0, 10), code: e.employeeCode, onProbation: st?.status === 'probation' };
  } else {
    const pb = await tx.preboarding.findFirst({ where: { organizationId: org, personId, status: { not: 'cancelled' } }, orderBy: { createdAt: 'desc' } });
    if (!pb) throw new Error('This person has no job record or joiner record.');
    place = { legalEntityId: pb.legalEntityId, locationId: pb.locationId, departmentId: pb.departmentId, designationId: pb.designationId, employmentTypeId: pb.employmentTypeId, managerEmployeeId: pb.managerEmployeeId, joiningOn: pb.joiningOn.toISOString().slice(0, 10), code: null, onProbation: true };
  }
  const [entity, orgRow, loc, dept, desig, type, mgr, personal] = await Promise.all([
    tx.legalEntity.findFirst({ where: { organizationId: org, id: place.legalEntityId }, select: { name: true, registeredAddress: true, cin: true } }),
    tx.organization.findUnique({ where: { id: org }, select: { name: true } }),
    place.locationId ? tx.location.findFirst({ where: { organizationId: org, id: place.locationId }, select: { name: true } }) : null,
    place.departmentId ? tx.department.findFirst({ where: { organizationId: org, id: place.departmentId }, select: { name: true } }) : null,
    place.designationId ? tx.designation.findFirst({ where: { organizationId: org, id: place.designationId }, select: { name: true } }) : null,
    place.employmentTypeId ? tx.employmentType.findFirst({ where: { organizationId: org, id: place.employmentTypeId }, select: { name: true } }) : null,
    place.managerEmployeeId ? tx.employee.findFirst({ where: { organizationId: org, id: place.managerEmployeeId } }) : null,
    emp ? tx.employeePersonalDetails.findFirst({ where: { organizationId: org, employeeId: emp.id } }) : null,
  ]);
  const reg = entity?.registeredAddress as { lines?: string[]; city?: string; postalCode?: string | null } | null | undefined;
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
    last_working_day: lastDay ? longDate(lastDay) : '',
    next_of_kin_name: nextOfKin,
    probation_months: months,
    probation: place.onProbation,
    legal_entity: entity?.name ?? '',
    legal_entity_address: reg ? [...(reg.lines ?? []), [reg.city, reg.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '',
    legal_entity_cin: entity?.cin ?? '',
    company_name: orgRow?.name ?? '',
    // The number is taken when the letter is issued (render fills it); previews say so.
    reference_no: 'Given when issued',
    today: longDate(today),
    signatory_name: extra.signatory?.name ?? '',
    signatory_title: extra.signatory?.title ?? '',
    address: personal ? [personal.addressLine1, personal.addressLine2, personal.city, personal.postalCode].filter(Boolean).join(', ') : '',
    personal_email: personal?.personalEmail ?? person.primaryEmail ?? '',
    old_ctc: extra.pay ? inr(extra.pay.oldCtc) : '',
    new_ctc: extra.pay ? inr(extra.pay.newCtc) : '',
    raise_percent: extra.pay ? `${Number(extra.pay.percent)}%` : '',
    effective_date: extra.pay ? longDate(extra.pay.effectiveDate) : '',
    fnf_run: extra.fnf?.run ?? '',
    fnf_lines: extra.fnf?.lines ?? '',
    fnf_earnings: extra.fnf?.earnings ?? '',
    fnf_recoveries: extra.fnf?.recoveries ?? '',
    fnf_tds: extra.fnf?.tds ?? '',
    fnf_statutory: extra.fnf?.statutory ?? '',
    fnf_net_label: extra.fnf?.netLabel ?? '',
    fnf_net: extra.fnf?.net ?? '',
    certificate_purpose: extra.request?.purpose ?? '',
    addressed_to: extra.request?.addressedTo ?? '',
    monthly_gross: extra.gross ? inr(extra.gross) : '',
  };
  return { data, legalEntityId: place.legalEntityId };
}

/** Values missing for the fields a template uses (YX-DOC-07: never a silent blank). Yes / no fields are never missing. */
export const missingFields = (fields: readonly string[], data: Record<string, string | boolean>) => fields.filter((f) => !FIELDS[f]?.flag && !FIELDS[f]?.optional && (data[f] === undefined || data[f] === ''));

// ------------------------------------------------------------------------------------------ YukthiX starter letters

const p = (text: string, run: Omit<Run, 'text'> = {}, block: Omit<Block, 'runs'> = {}): Block => ({ ...block, runs: [{ text, ...run }] });
// A proper letter from day one: the letterhead (name, registered address and CIN when recorded), reference and date,
// the addressee, a subject, the body and who signs. The QR code and the check line are stamped on issue (pdf.ts).
const LETTERHEAD: Block[] = [
  p('{{legal_entity}}', {}, { kind: 'heading' }),
  p('{{#legal_entity_address}}{{legal_entity_address}}{{/legal_entity_address}}', { size: 9 }, { align: 'center' }),
  p('{{#legal_entity_cin}}CIN {{legal_entity_cin}}{{/legal_entity_cin}}', { size: 9 }, { align: 'center' }),
  p(''),
  p('Ref: {{reference_no}}'),
  p('Date: {{today}}'),
  p(''),
];
const SIGNED: Block[] = [p(''), p('For {{legal_entity}}'), p(''), p(''), p('{{signatory_name}}', { bold: true }), p('{{signatory_title}}')];
// PPL-31: an employee's own certificate goes to whom they named, else to whom it may concern, and says why they asked.
const ADDRESSEE = '{{addressed_to}}{{^addressed_to}}To whom it may concern{{/addressed_to}}';
const AT_REQUEST = 'This certificate is issued at their request.{{#certificate_purpose}} Purpose: {{certificate_purpose}}.{{/certificate_purpose}}';
const letter = (to: string[], subject: string, body: string[]): Block[] => [...LETTERHEAD, ...to.map((t) => p(t)), ...(to.length ? [p('')] : []), p(`Subject: ${subject}`, { bold: true }), p(''), ...body.map((t) => p(t)), ...SIGNED];

/**
 * Starter letters (APX-F #5, #6, #12), written by YukthiX in plain English; companies download and edit them in Word.
 * `revision` goes up when YukthiX improves a starter: companies that added an older one are offered the new one as a
 * fresh draft version; the version they use (or changed) stays as it is until they switch the new one on.
 */
export const STARTER_LETTERS: readonly { letterType: string; name: string; revision: number; requiresApproval: boolean; personSigns: boolean; onePerPerson: boolean; paragraphs: Block[] }[] = [
  {
    letterType: 'appointment',
    name: 'Appointment letter',
    revision: 2,
    requiresApproval: true,
    personSigns: true,
    onePerPerson: true,
    paragraphs: letter(['{{employee_name}}', '{{designation}}', '{{location}}'], 'Appointment as {{designation}}', [
      'Dear {{employee_name}},',
      'We are pleased to appoint you as {{designation}} in our {{department}} team at {{location}}, with {{legal_entity}}, from {{joining_date}}.',
      'Type of employment: {{employment_type}}. You will report to {{manager_name}}.',
      '{{#probation}}You will be on probation for {{probation_months}} months from your joining day. Your manager will review your work before it ends.{{/probation}}',
      'Your pay, benefits, working hours, leave and notice period are as set out in your offer and the company policies, which form part of this letter.',
      'Please keep company information confidential during and after your employment.',
      'Please accept this letter in YukthiX to confirm.',
    ]),
  },
  {
    letterType: 'welcome',
    name: 'Welcome and joining instructions',
    revision: 2,
    requiresApproval: false,
    personSigns: false,
    onePerPerson: false,
    paragraphs: letter(['{{employee_name}}', '{{location}}'], 'Welcome to {{company_name}}', [
      'Dear {{first_name}},',
      'We look forward to seeing you on {{joining_date}} at {{location}}.',
      'On your first day, please bring your original ID proof (PAN card and one photo ID), your education certificates and your last relieving letter, if you have one.',
      'You will meet {{manager_name}}, who will help you settle in.',
      'Before you join, please finish your forms in the YukthiX joining portal.',
    ]),
  },
  // PPL-06: made once an annual increment batch is approved (never before); HR may switch it on, edit or replace it.
  {
    letterType: 'increment',
    name: 'Increment letter',
    revision: 2,
    requiresApproval: false,
    personSigns: false,
    onePerPerson: false,
    paragraphs: letter(['{{employee_name}} ({{employee_code}})'], 'Revision of your pay', [
      'Dear {{employee_name}},',
      'Following your annual review, your annual CTC is revised from {{old_ctc}} to {{new_ctc}} ({{raise_percent}}), effective {{effective_date}}. All other terms of your employment stay the same.',
    ]),
  },
  {
    letterType: 'confirmation',
    name: 'Confirmation letter',
    revision: 2,
    requiresApproval: false,
    personSigns: false,
    onePerPerson: true,
    paragraphs: letter(['{{employee_name}} ({{employee_code}})', '{{designation}}'], 'Confirmation of employment', [
      'Dear {{employee_name}},',
      'We are pleased to confirm your employment as {{designation}} after your probation. All other terms of your appointment stay the same.',
    ]),
  },
  // Lifecycle 6d: issued by the system on the exit events (no-dues once cleared; relieving and experience at the end of
  // the last working day, unless HR holds them) and the employee's instant employment certificate (P05 Q8).
  {
    letterType: 'no_dues',
    name: 'No-dues certificate',
    revision: 2,
    requiresApproval: false,
    personSigns: false,
    onePerPerson: true,
    paragraphs: letter(['{{employee_name}} ({{employee_code}})', '{{designation}}'], 'No-dues certificate', [
      'This is to certify that {{employee_name}} ({{employee_code}}), {{designation}}, has completed the exit clearance with every department. Any amount to be recovered is settled in the final settlement.',
    ]),
  },
  {
    letterType: 'relieving',
    name: 'Relieving letter',
    revision: 2,
    requiresApproval: false,
    personSigns: false,
    onePerPerson: true,
    paragraphs: letter(['{{employee_name}} ({{employee_code}})', '{{designation}}'], 'Relieving letter', [
      'Dear {{employee_name}},',
      'You have been relieved of your duties as {{designation}} at the close of work on {{last_working_day}}.',
      'We thank you for your work with us and wish you well.',
    ]),
  },
  // PPL-22: issued by the system when an F&F run is approved; a second run's approval issues one that supersedes it.
  {
    letterType: 'fnf_statement',
    name: 'F&F statement',
    revision: 2,
    requiresApproval: false,
    personSigns: false,
    onePerPerson: true,
    paragraphs: letter(['{{employee_name}} ({{employee_code}})'], 'Full and final settlement statement', [
      'Dear {{employee_name}},',
      'This is your full and final settlement after your last working day, {{last_working_day}}, paid in off-cycle run {{fnf_run}}.',
      'Lines: {{fnf_lines}}',
      'Earnings {{fnf_earnings}}. Recoveries {{fnf_recoveries}}. TDS {{fnf_tds}}. PF, ESI, PT and LWF {{fnf_statutory}}.',
      '{{fnf_net_label}}: {{fnf_net}}',
    ]),
  },
  {
    letterType: 'experience',
    name: 'Experience letter',
    revision: 2,
    requiresApproval: false,
    personSigns: false,
    onePerPerson: true,
    paragraphs: letter(['To whom it may concern'], 'Experience letter for {{employee_name}}', [
      'This is to certify that {{employee_name}} worked with {{legal_entity}} from {{joining_date}} to {{last_working_day}}. Their last designation was {{designation}} in the {{department}} department at {{location}}.',
      'We wish them the very best.',
    ]),
  },
  // Lifecycle 6e: a campus batch's letter of intent, the absconding notices and the letter to the family.
  {
    letterType: 'letter_of_intent',
    name: 'Letter of intent (campus)',
    revision: 2,
    requiresApproval: false,
    personSigns: true,
    onePerPerson: true,
    paragraphs: letter(['{{employee_name}}'], 'Letter of intent', [
      'Dear {{employee_name}},',
      'We intend to offer you the role of {{designation}} at {{location}}, joining on {{joining_date}}, once you complete your course. Your appointment letter follows before you join.',
      'Please accept this letter in YukthiX to confirm your interest.',
    ]),
  },
  {
    letterType: 'absconding_notice',
    name: 'Notice to return to work',
    revision: 2,
    requiresApproval: false,
    personSigns: false,
    onePerPerson: false,
    paragraphs: letter(['{{employee_name}} ({{employee_code}})'], 'Absence from work', [
      'Dear {{employee_name}},',
      'You have been absent from work without leave or information. Please return to work or write to us with the reason within seven days of this notice.',
      'If we do not hear from you, the company may treat your employment as abandoned under its policy.',
    ]),
  },
  {
    letterType: 'condolence',
    name: 'Letter to the family (death in service)',
    revision: 2,
    requiresApproval: false,
    personSigns: false,
    onePerPerson: false,
    paragraphs: letter(['{{next_of_kin_name}}'], 'Our condolences', [
      'Dear {{next_of_kin_name}},',
      'We are deeply sorry for the loss of {{employee_name}}, who worked with us as {{designation}}.',
      'We will pay the dues to the nominees or legal heirs and help the family with the provident fund, pension, insurance and gratuity claims. Our HR team will contact you.',
    ]),
  },
  // PPL-31: the certificates an employee may ask for themselves (instant, or HR approves first: requiresApproval).
  {
    letterType: 'salary_certificate',
    name: 'Salary certificate',
    revision: 1,
    requiresApproval: false,
    personSigns: false,
    onePerPerson: false,
    paragraphs: letter([ADDRESSEE], 'Salary certificate for {{employee_name}}', [
      'This is to certify that {{employee_name}} ({{employee_code}}) works with {{legal_entity}} as {{designation}} since {{joining_date}}. Their gross monthly salary is {{monthly_gross}}.',
      AT_REQUEST,
    ]),
  },
  {
    letterType: 'address_proof',
    name: 'Address proof',
    revision: 1,
    requiresApproval: false,
    personSigns: false,
    onePerPerson: false,
    paragraphs: letter([ADDRESSEE], 'Address proof for {{employee_name}}', [
      'This is to certify that {{employee_name}} ({{employee_code}}) works with {{legal_entity}} as {{designation}} since {{joining_date}}. Their home address in our records is {{address}}.',
      AT_REQUEST,
    ]),
  },
  {
    letterType: 'employment_certificate',
    name: 'Employment certificate',
    revision: 3,
    requiresApproval: false,
    personSigns: false,
    onePerPerson: false,
    paragraphs: letter([ADDRESSEE], 'Employment certificate for {{employee_name}}', [
      'This is to certify that {{employee_name}} ({{employee_code}}) works with {{legal_entity}} as {{designation}} in the {{department}} department at {{location}}, since {{joining_date}}.',
      AT_REQUEST,
    ]),
  },
  {
    letterType: 'noc',
    name: 'No objection certificate (NOC)',
    revision: 1,
    requiresApproval: true,
    personSigns: false,
    onePerPerson: false,
    paragraphs: letter([ADDRESSEE], 'No objection certificate for {{employee_name}}', [
      'This is to certify that {{employee_name}} ({{employee_code}}) works with {{legal_entity}} as {{designation}} since {{joining_date}}.',
      '{{legal_entity}} has no objection to this request.{{#certificate_purpose}} Purpose: {{certificate_purpose}}.{{/certificate_purpose}}',
    ]),
  },
];

export const starterDocx = (letterType: string) => {
  const s = STARTER_LETTERS.find((x) => x.letterType === letterType);
  return s ? buildDocx(s.paragraphs) : null;
};
