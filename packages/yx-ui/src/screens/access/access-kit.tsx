import { Badge, type BadgeTone } from '../../components/display';
import type { GrantStatus, RequestKind, ScopeType } from './types';

// Words shared by the access and privacy screens (review rule R6: plain and specific).

export const SCOPE_LABEL: Record<ScopeType, string> = {
  tenant: 'Whole company',
  legal_entity: 'Legal entity',
  location: 'Location',
  department_subtree: 'Department and below',
  all_reports: 'Everyone under them',
  direct_reports: 'Their direct reports',
};

/** Scopes that name a record. */
export const SCOPE_TARGET: Partial<Record<ScopeType, 'entities' | 'locations' | 'departments'>> = { legal_entity: 'entities', location: 'locations', department_subtree: 'departments' };

const STATUS: Record<GrantStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Waiting for approval', tone: 'warning' },
  active: { label: 'Active', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'neutral' },
  revoked: { label: 'Revoked', tone: 'neutral' },
};

export function GrantStatusBadge({ status }: { status: GrantStatus }) {
  return <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>;
}

export function ConfidentialBadge() {
  return <Badge tone="warning">Confidential</Badge>;
}

export const KIND_LABEL: Record<RequestKind, string> = {
  bank_salary: 'Salary bank account',
  bank_reimbursement: 'Reimbursement bank account',
  pan: 'PAN',
  aadhaar: 'Aadhaar',
  uan: 'UAN',
  esic: 'ESIC IP number',
  legal_name: 'Legal name',
};

export const GENDER_LABEL: Record<string, string> = { female: 'Female', male: 'Male', transgender: 'Transgender', non_binary: 'Non-binary', prefer_not_to_say: 'Prefer not to say' };

/** "Holder · IFSC · •••• 1234" or the single value. */
export function shown(v: Record<string, string | null> | null | undefined): string {
  if (!v) return 'Nothing on file';
  return [v.holderName, v.ifsc, v.account, v.value, v.legalName].filter(Boolean).join(' · ') || 'Nothing on file';
}

/** The API refused with a code the screen handles (risk warning, duplicate value). */
export const codeOf = (e: unknown) => (e && typeof e === 'object' && 'code' in e ? String((e as { code?: unknown }).code) : null);
