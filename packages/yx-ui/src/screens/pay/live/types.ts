// What the payroll batch-5a API returns (apps/api/src/payroll). The screens stay presentational; the API checks every call.

export type { LoadState } from '../../org/types';

export type Stage = 'open' | 'frozen' | 'locked' | 'filed';

export interface PayPeriods {
  year: string;
  today: string;
  entities: {
    id: string;
    name: string;
    shortName: string;
    canRequestReopen: boolean;
    months: {
      month: string;
      periodId: string | null;
      stage: Stage;
      lockedAt: string | null;
      lockedBy: string | null;
      changedAt: string | null;
      changedBy: string | null;
      reason: string | null;
      reopenRequestId: string | null;
      corrections: { pending: number; approved: number };
    }[];
  }[];
}

export interface PeriodHistory {
  id: string;
  month: string;
  stage: Stage;
  events: { at: string; from: Stage; to: Stage; by: string | null; reason: string | null }[];
  reopenRequests: { id: string; status: string; reason: string; requestedBy: string | null; at: string }[];
  corrections: { id: string; person: string; on: string; kind: string; source: string; change: { shouldBe?: string; punches?: unknown[] }; reason: string; status: string; paidIn: string | null }[];
}

export interface ReopenRequest {
  id: string;
  entity: string;
  legalEntityId: string;
  month: string;
  stage: Stage;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  requestedBy: string;
  requestedByMe: boolean;
  at: string;
  decidedAt: string | null;
  steps: { name: string; state: string; approvers: string[]; decidedBy: { who: string; action: string; reason: string | null; at: string }[] }[];
  canDecide: boolean;
  phrase: string | null;
}

export interface ImpactRow {
  label: string;
  value: string;
}
export interface Confirmation {
  phrase: string;
  impact: ImpactRow[];
}

export interface AuditEntry {
  id: string;
  seq: string | null;
  at: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: string;
  actorRole: string | null;
  details: unknown;
}
export interface AuditPage {
  entries: AuditEntry[];
  next: string | null;
}
export interface AuditFilters {
  entityType?: string;
  entityId?: string;
  action?: string;
  from?: string;
  to?: string;
}
export interface ChainStatus {
  canVerify: boolean;
  checks: { at: string; result: 'ok' | 'broken'; lastSeq: string; rows: string; problem: string | null }[];
}

export interface PayDocument {
  id: string;
  kind: string;
  kindLabel: string;
  title: string;
  referenceNo: string;
  status: 'awaiting_signature' | 'issued' | 'superseded';
  signature: 'none' | 'awaiting' | 'signed';
  issuedAt: string;
  verifyCode: string | null;
  sha256: string;
  month: string | null;
  supersedesId: string | null;
  supersededById: string | null;
  purged: boolean;
  employeeId?: string;
  person?: string;
  legalEntityId?: string;
}
export interface PayDocuments {
  entities: { id: string; name: string; canIssue: boolean }[];
  documents: PayDocument[];
}

export interface ExchangeFile {
  id: string;
  legalEntityId: string;
  kind: string;
  kindLabel: string;
  month: string | null;
  fileName: string;
  sha256: string;
  sizeBytes: number;
  rows: number;
  totals: Record<string, string>;
  status: 'generated' | 'release_pending' | 'released' | 'superseded';
  generatedBy: string;
  generatedAt: string;
  releasedBy: string | null;
  releasedAt: string | null;
  madeByMe: boolean;
  canRelease: boolean;
}
export interface ExchangeFiles {
  entities: { id: string; name: string }[];
  files: ExchangeFile[];
}

export interface VerifyResult {
  company: string;
  kind: string;
  name: string;
  issuedOn: string;
  status: 'current' | 'superseded';
}
