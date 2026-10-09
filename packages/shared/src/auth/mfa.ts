// Multi-factor authentication floor (P12 Q1, YX-IAM-01/02/03), shared by the API and exam-runtime.

// Permissions that belong to the sensitive roles of P12 §3 as they exist in this product:
// System / HR admin (users, settings, security), finance (billing), approvers (approval chains),
// Special-data handling (data-subject export / erase) and YukthiX staff (platform). Using any of
// them needs an AAL2 session once the user's enrolment grace has passed (YX-IAM-01). Proctor and
// evaluator actions are marked per endpoint (@SensitiveRoleAction) and on the monitoring socket,
// since their permission (exam:manage) also covers everyday exam authoring.
export const MFA_SENSITIVE_PERMISSIONS: readonly string[] = [
  'platform:manage_organizations',
  'org:manage_users',
  'org:manage_settings',
  'org:manage_billing',
  'approvals:configure',
  'candidate:data_rights',
  // HR admin (organisation structure, P01) and payroll (Confidential entity identifiers, pay ranges; P02 §4.2).
  'org.settings.manage',
  'org.entity.statutory.manage',
  'pay.range.view',
  'pay.range.manage',
  // HR admin and payroll over employee records and job history (P01 §4.4, P06; P02 §4.2).
  'employee.profile.view',
  'employee.change.manage',
  'employee.change.approve',
  'employee.change.retro',
  'employee.change.retro_override',
  'employee.salary.view',
  'employee.salary.manage',
  // Personal, Confidential and Special employee data and who holds which role (P02 §4.2–4.5, step 2d).
  'employee.personal.view',
  'employee.profile.edit',
  'employee.identity.view',
  'employee.identity.manage',
  'employee.identity.approve',
  'employee.aadhaar.view',
  'access.role.manage',
  // M03 batch 5a: payroll periods, documents and files, the audit log (P12 Q1: MFA mandatory for payroll roles).
  'payroll.period.view',
  'payroll.period.reopen',
  'payroll.period.reopen.approve',
  'payroll.correction.approve',
  'payroll.document.view',
  'payroll.document.issue',
  'payroll.file.view',
  'payroll.file.release',
  'audit.view',
  'audit.export',
  'audit.hold.manage',
];

// A user holding any of these is in a sensitive role (MFA reset needs a second admin, YX-IAM-11).
export const SENSITIVE_ROLE_PERMISSIONS: readonly string[] = [...MFA_SENSITIVE_PERMISSIONS, 'exam:manage'];

// System Admin and Payroll Admin (P12 YX-IAM-03): a one-time code by email / SMS / WhatsApp is
// never accepted as their second factor -- passkey, authenticator app or recovery code only.
export const OTP_FALLBACK_BARRED_PERMISSIONS: readonly string[] = [
  'platform:manage_organizations',
  'org:manage_users',
  'org:manage_settings',
  'org:manage_billing',
  // Payroll Admin.
  'org.entity.statutory.manage',
  'pay.range.manage',
  'employee.salary.manage',
  // Approving bank / identity changes (payout fraud guard, P02 §4.5) and handing out roles (System Admin).
  'employee.identity.approve',
  'access.role.manage',
];

export const MFA_ENROLMENT_GRACE_DAYS = 14;
export const MFA_REQUIRED_CODE = 'MFA_REQUIRED';
export const STEP_UP_REQUIRED_CODE = 'STEP_UP_REQUIRED';

// Step-up window (YX-IAM-02): floor 15 min. STEP_UP_WINDOW_MINUTES may only make it shorter.
export const STEP_UP_WINDOW_MAX_SECONDS = 15 * 60;
export function stepUpWindowSeconds(): number {
  const seconds = Number(process.env.STEP_UP_WINDOW_MINUTES) * 60;
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(Math.floor(seconds), STEP_UP_WINDOW_MAX_SECONDS) : STEP_UP_WINDOW_MAX_SECONDS;
}

// The assurance state of a live staff session, as touchStaffSession returns it.
export interface SessionAssurance {
  assuranceLevel: string;
  mfaVerifiedAt: Date | null;
  mfaMethod: string | null;
  // The session owner's enrolment deadline.
  mfaEnrolmentDueAt: Date;
  // When the session's sign-in happened (sessions.created_at; refresh keeps it). Absent = unknown,
  // which every freshness check treats as stale.
  authenticatedAt?: Date;
}

// MFA requirement met: the session is AAL2, or its owner is still inside the enrolment grace.
export function mfaSatisfied(session: SessionAssurance, now = Date.now()): boolean {
  return session.assuranceLevel === 'aal2' || session.mfaEnrolmentDueAt.getTime() > now;
}

// Session AAL2 states that are never a step-up: a one-time code (fallback factor, YX-IAM-03); an
// identity provider's own MFA claim (a tenant-chosen issuer, not a YukthiX factor); and enrolling
// the first factor (proves possession of a new authenticator, not that the user is who signed in).
export const NON_STEP_UP_MFA_METHODS: readonly string[] = ['otp', 'idp', 'enrolment'];

// Step-up met: AAL2 proven on this session within the step-up window by a YukthiX passkey,
// authenticator app or recovery code (NON_STEP_UP_MFA_METHODS never count).
// No grace: an account without a factor cannot step up, so it cannot take step-up actions.
export function stepUpSatisfied(session: SessionAssurance, now = Date.now()): boolean {
  return (
    session.assuranceLevel === 'aal2' &&
    session.mfaMethod !== null &&
    !NON_STEP_UP_MFA_METHODS.includes(session.mfaMethod) &&
    session.mfaVerifiedAt !== null &&
    now - session.mfaVerifiedAt.getTime() <= stepUpWindowSeconds() * 1000
  );
}
