// People › job history and changes (P06 §7, M01 §3.3): the shapes the API returns and accepts.
export type { LoadState } from '../org/types';

export const CHANGE_TYPES = ['join', 'promotion', 'transfer', 'entity_transfer', 'redesignation', 'manager_change', 'salary_revision', 'employment_type_change', 'confirmation', 'correction', 'notice', 'notice_withdrawal', 'exit'] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];
export type ChangeStatus = 'pending' | 'scheduled' | 'effective' | 'rejected' | 'cancelled';
export type EmploymentStatus = 'probation' | 'confirmed' | 'notice';

export interface Ref {
  id: string;
  name: string | null;
  code?: string | null;
}

/** A person the viewer may open (HR: everyone; others: themselves and their team). */
export interface PersonOption {
  id: string;
  name: string;
  employeeCode: string | null;
  legalEntityId: string | null;
  designation: string | null;
  department: string | null;
  location: string | null;
}

export interface EmployeeHeader {
  id: string;
  name: string;
  employeeCode: string;
  legalEntity: { id: string; name: string } | null;
  joinedOn: string;
  exitedOn: string | null;
}

export interface AssignmentFacts {
  location: { id: string; name: string | null; state: string | null; timezone: string | null };
  department: Ref | null;
  designation: Ref | null;
  grade: Ref | null;
  /** 5c-D2: unskilled, semi_skilled, skilled or highly_skilled; null when not set. */
  skillClass?: string | null;
  /** G1 (gap pass C1): contracted hours a week ("24.0"); null = full-time. */
  hoursPerWeek?: string | null;
  /** The normal week where the job is and the FTE it gives (null when no country pack covers it). */
  normalWeekHours?: string | null;
  ftePercent?: string | null;
  employmentType: Ref | null;
  manager: { id: string; name: string | null } | null;
  costCentres: (Ref & { percent: string })[];
  /** M01 Q5: visibility and feedback only. */
  dottedLineManagers?: { id: string; name: string | null }[];
}

export interface Money {
  currency: string;
  /** Decimal string, e.g. "583200.00". */
  annualCtc: string;
}

/** P06 §4.7 as-of: the facts in force on a date. */
export interface AsOfView {
  employee: EmployeeHeader;
  asOf: string;
  assignment: (AssignmentFacts & { validFrom: string; validTo: string | null }) | null;
  status: { status: EmploymentStatus; validFrom: string; validTo: string | null } | null;
  /** May ask for pay (founder rule R1). */
  payAccess: boolean;
  /** Present only when asked for ("Show pay"). */
  compensation: (Money & { validFrom: string; validTo: string | null }) | null;
}

export interface ImpactLine {
  fact: string;
  from: string | null;
  to: string | null;
}

/** P06 §4.3 impact preview (YX-HIS-11): what moves on the date, later changes recalculated, past months touched. */
export interface Impact {
  effectiveDate: string;
  facts: ImpactLine[];
  /** 'hidden' without pay access. */
  pay: ImpactLine[] | 'hidden';
  rebased: { changeId: string; changeType: ChangeType; effectiveDate: string; facts: ImpactLine[]; pay: ImpactLine[] | 'hidden' }[];
  retro: { from: string; months: string[] } | null;
}

export interface CostCentreShare {
  costCentreId: string;
  percent: string;
}

export interface ChangePayload {
  assignment?: {
    locationId?: string;
    departmentId?: string;
    designationId?: string;
    gradeId?: string | null;
    skillClass?: string | null;
    hoursPerWeek?: string | null;
    employmentTypeId?: string;
    managerEmployeeId?: string | null;
    costCentres?: CostCentreShare[];
    dottedLineManagerIds?: string[];
  };
  status?: EmploymentStatus;
  compensation?: { currency?: string; annualCtc?: string; increasePercent?: string };
  /** PPL-04: a move to another legal entity carries only this. */
  transfer?: { legalEntityId: string; locationId: string; departmentId?: string; designationId?: string; options: Partial<TransferOptions> };
}

/** PPL-04 inter-entity transfer options (company defaults in Settings, changed for one move). */
export interface TransferOptions {
  leave: 'carry' | 'encash' | 'lapse';
  service: 'continue' | 'restart';
  code: 'keep' | 'new';
  settlement: 'none' | 'full';
  structure: 'keep' | 'new';
}

/** The company defaults of a move for one person, with what the option labels name. */
export interface TransferDefaults {
  options: TransferOptions;
  employeeCode: string;
  serviceFrom: string;
}

export interface ChangeRecord {
  id: string;
  employeeId: string;
  employeeName?: string | null;
  changeType: ChangeType;
  effectiveDate: string;
  status: ChangeStatus;
  reason: string;
  overrideReason: string | null;
  /** Dated before the day it was raised: a correction of the past. */
  retro: boolean;
  requestedAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  touchesPay: boolean;
  /** Raised in a bulk batch: decided with the batch while it is open (M01 §3.3). */
  batchId?: string | null;
  payload: ChangePayload;
  impact: Impact | null;
  /** PPL-04: a pending change's approvers (names; "you" when the reader is one). */
  waitingFor?: string[];
  /** PPL-05: who raised it, and the new values by name ("Quality Lead", "G6"). */
  requestedByName?: string | null;
  newValues?: string[];
}

export interface HistoryRow {
  id: string;
  validFrom: string;
  validTo: string | null;
  changeId: string;
  recordedAt: string;
  supersededAt: string | null;
  supersededBy: { changeId: string; type: ChangeType | null; reason: string | null } | null;
}

export interface HistoryView {
  employee: EmployeeHeader;
  payAccess: boolean;
  changes: ChangeRecord[];
  assignment: (HistoryRow & AssignmentFacts)[];
  status: (HistoryRow & { status: EmploymentStatus })[];
  compensation: (HistoryRow & Money)[];
}

export interface ChangeInput {
  employeeId: string;
  changeType: Exclude<ChangeType, 'join'>;
  effectiveDate: string;
  payload: ChangePayload;
  reason: string;
  overrideReason?: string;
}

export interface ChoiceOption {
  value: string;
  label: string;
  /** Legal entities that may use it; empty = every entity (YX-ORG-15). */
  entities: string[];
}

/** What the change form can offer, already limited to live records. */
export interface ChangeOptions {
  people: PersonOption[];
  locations: ChoiceOption[];
  departments: ChoiceOption[];
  designations: ChoiceOption[];
  grades: ChoiceOption[];
  employmentTypes: ChoiceOption[];
  costCentres: ChoiceOption[];
  /** employee.salary.manage: pay may be part of the change (R1). */
  canPay: boolean;
  /** Start of the financial year: earlier dates need the override reason (YX-HIS-12). */
  retroLimit: string;
  today: string;
  /** Kinds of change offered (a manager raising for their team gets fewer, YX-SEC-27). Default: all. */
  types?: Exclude<ChangeType, 'join'>[];
  /** Who can be chosen as manager or dotted-line manager. Default: `people`. */
  managers?: PersonOption[];
  /** PPL-04: the legal entities a move can go to. */
  legalEntities?: { value: string; label: string }[];
}

/** G1 (gap pass C3): the three named service dates. */
export interface ServiceDates {
  companyStart: string;
  employerStart: string;
  continuousServiceFrom: string;
  source: 'hr' | 'rehire_continuous' | 'rehire_break_counted' | 'joining';
  /** HR's reason, only for HR. */
  reason: string | null;
}

export interface ServiceDatesInput {
  /** null: back to the rule (rehire choice or joining day). */
  continuousServiceFrom: string | null;
  reason: string;
}
