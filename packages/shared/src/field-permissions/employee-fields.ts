// P02 §4.4 field sensitivity for the YukthiX employee record: every personal field carries a class, and the
// class decides who reads it (YX-SEC-07). This generalises GOVERNED_FIELDS (candidate / job) to the employee.
// The API redacts server-side by class and scope; screens only reflect it.

export const SENSITIVITY_CLASSES = ['public', 'internal', 'personal', 'confidential', 'special'] as const;
export type SensitivityClass = (typeof SENSITIVITY_CLASSES)[number];

/** The employee field registry (P02 §4.4 table; P01 §4.4; M01 §3.1). */
export const EMPLOYEE_FIELD_CLASSES = {
  // Public inside the company (P02 Q4 directory preset).
  name: 'public',
  workEmail: 'public',
  designation: 'public',
  department: 'public',
  location: 'public',
  legalEntity: 'public',
  manager: 'public',
  // Internal: HR, and managers for their team.
  employeeCode: 'internal',
  joinedOn: 'internal',
  grade: 'internal',
  employmentType: 'internal',
  employmentStatus: 'internal',
  costCentres: 'internal',
  birthday: 'internal',
  // Personal: the person and HR's personal-data grant.
  dateOfBirth: 'personal',
  gender: 'personal',
  personalEmail: 'personal',
  personalPhone: 'personal',
  address: 'personal',
  // The person behind the record (P01 §4.5a): the mobile captured at hiring, and an email that is not the work one.
  personPhone: 'personal',
  personEmail: 'personal',
  // Confidential: pay (founder rule R1) and identity / bank.
  compensation: 'confidential',
  legalName: 'confidential',
  pan: 'confidential',
  uan: 'confidential',
  esic: 'confidential',
  bankAccount: 'confidential',
  // Special: Aadhaar, always masked to the last four unless explicitly granted (YX-SEC-08).
  aadhaar: 'special',
} as const satisfies Record<string, SensitivityClass>;
export type EmployeeField = keyof typeof EMPLOYEE_FIELD_CLASSES;

/**
 * The permission that opens each class of someone else's record (the person always sees their own, Aadhaar
 * masked). Pay is Confidential with its own key (R1). Public needs only an employee record in the company.
 */
export const CLASS_READ_KEYS: Readonly<Record<Exclude<SensitivityClass, 'public'>, string>> = {
  internal: 'employee.profile.view',
  personal: 'employee.personal.view',
  confidential: 'employee.identity.view',
  special: 'employee.aadhaar.view',
};
export const PAY_READ_KEY = 'employee.salary.view';

/**
 * Keys that open Confidential or Special data (P02 §4.4). A role grant carrying any of them is an approvable
 * change (§4.6), and the role risk check counts the people it opens (YX-SEC-18).
 */
export const CONFIDENTIAL_KEYS: readonly string[] = [
  'employee.salary.view',
  'employee.salary.manage',
  'employee.identity.view',
  'employee.identity.manage',
  'employee.identity.approve',
  'employee.aadhaar.view',
  'pay.range.view',
  'pay.range.manage',
  'org.entity.statutory.manage',
];
export const holdsConfidential = (keys: readonly string[]) => keys.some((k) => CONFIDENTIAL_KEYS.includes(k));

/**
 * P02 §4.6 and founder rule R1: HR and pay data keys (employee.*, pay.*, org.entity.statutory.*) reach a user
 * only through their own permission profile or a scoped role grant, never through a company override of a base
 * role, which would hand them to everyone holding that role company-wide without a second admin.
 */
export const isGrantOnlyKey = (key: string) => /^(employee\.|pay\.|org\.entity\.statutory\.)/.test(key);

/** "•••• 6789": the last four only (P02 §4.4 masked level). */
export function maskTail(last4: string | null | undefined): string | null {
  return last4 ? `•••• ${last4}` : null;
}
