// People core (P01 §4.4–4.5a; M01 §3.2–3.4, §3.10): the shapes the API returns. No pay anywhere (R1).
import type { ChangeRecord, Impact } from '../history/types';
export type { LoadState } from '../org/types';

export interface Ref {
  id: string;
  name: string | null;
}

/** A colleague in the directory: Public fields (P02 Q4); code and joining date for HR only. */
export interface DirectoryPerson {
  id: string;
  name: string;
  workEmail: string | null;
  designation: Ref | null;
  department: Ref | null;
  location: Ref | null;
  legalEntity: Ref | null;
  manager: Ref | null;
  employeeCode?: string;
  joinedOn?: string;
}

export interface DirectoryPage {
  total: number;
  limit: number;
  offset: number;
  people: DirectoryPerson[];
}

export interface DirectoryQuery {
  q: string;
  legalEntityId: string | null;
  departmentId: string | null;
  locationId: string | null;
  offset: number;
}

export type RoleType = 'employee' | 'login' | 'candidate' | 'applicant' | 'alumnus' | 'nominee' | 'consultant' | 'contract_worker' | 'vendor_worker' | 'campus_registrant' | 'test_taker' | 'external_login';

/** P01 §4.5a: the person behind a record and every role they hold (HR or the person). */
export interface PersonRecord {
  id: string;
  givenName: string;
  familyName: string | null;
  preferredName: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  status: 'active' | 'merged' | 'erased';
  loginLinked: boolean;
  roles: { id: string; roleType: RoleType; startOn: string; endOn: string | null; label: string | null }[];
}

export interface OrgChartNode {
  id: string;
  name: string;
  designation: Ref | null;
  department: Ref | null;
  location: Ref | null;
  legalEntity: Ref | null;
  managerId: string | null;
  dottedLineManagerIds: string[];
  directReports: number;
  employeeCode?: string;
}

export interface OrgChartData {
  asOf: string;
  truncated: boolean;
  /** Company-wide HR may look at another date (P02 §4.3); for everyone else the chart is today's. */
  otherDates?: boolean;
  nodes: OrgChartNode[];
}

/** M01 §3.10: someone in the signed-in manager's team. */
export interface TeamMember {
  id: string;
  name: string;
  employeeCode: string;
  relation: 'direct' | 'indirect' | 'dotted';
  designation: Ref | null;
  department: Ref | null;
  location: Ref | null;
  manager: Ref | null;
  joinedOn: string;
  status: 'probation' | 'confirmed' | 'notice' | null;
  probationEndsOn: string | null;
}

export type ProbationStage = 'running' | 'review_due' | 'overdue' | 'extended' | 'awaiting_approval' | 'confirmed';

export interface ProbationRow {
  employeeId: string;
  name: string;
  employeeCode: string;
  startOn: string;
  originalEndOn: string;
  plannedEndOn: string;
  extendedMonths: number;
  reviewDueOn: string;
  escalatedOn: string | null;
  confirmedFrom: string | null;
  pendingConfirmationId: string | null;
  stage: ProbationStage;
  maxTotalMonths: number;
}

/** One row of a bulk change file after the dry run (M01 §3.3). */
export interface BulkRowResult {
  line: number;
  employeeId: string | null;
  employeeCode: string | null;
  name: string | null;
  changeType: string | null;
  effectiveDate: string | null;
  ok: boolean;
  error: string | null;
  impact: Impact | null;
}

export interface BulkResult {
  batch: { id: string; status: string; rowCount: number } | null;
  rows: BulkRowResult[];
  errors: number;
}

export type BatchStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface ChangeBatch {
  id: string;
  status: BatchStatus;
  source: 'csv' | 'reassign';
  fileName: string | null;
  reason: string;
  rowCount: number;
  requestedBy: string | null;
  requestedAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  touchesPay: boolean;
  changes?: (ChangeRecord & { employeeName: string | null })[];
}
