// The YukthiX platform console (P14 §7) and support sessions (P02 Q8): the shapes the API returns and accepts.
// Dates arrive from JSON as ISO strings.
export type { LoadState } from '../org/types';

export type Lifecycle = 'trial' | 'active' | 'suspended' | 'closed';
export type LifecycleAction = 'activate' | 'suspend' | 'reinstate' | 'close';

export interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  lifecycle: Lifecycle;
  /** Whether people at the company can sign in. */
  signInAllowed: boolean;
  trialEndsAt: string | null;
  createdAt: string;
  products: string[];
  employees: number;
}

export interface CompanyHistoryEntry {
  id: string;
  action: string;
  by: string;
  at: string;
  details: Record<string, unknown> | null;
}

export interface CompanyDetail extends CompanyRow {
  trialExtended: boolean;
  lifecycleChangedAt: string;
  admins: { name: string | null; email: string; status: string }[];
  history: CompanyHistoryEntry[];
}

export interface NewCompany {
  name: string;
  slug: string;
  adminName: string;
  adminEmail: string;
  products: string[];
}

export interface ProductPrice {
  id: string;
  currency: 'INR' | 'USD';
  unitPrice: number;
  minimumMonthly: number;
  validFrom: string;
  reason: string;
  createdAt: string;
  state: 'current' | 'scheduled' | 'past';
}

export interface Product {
  code: string;
  name: string;
  /** One billable unit, e.g. "employee". */
  unit: string;
  prices: ProductPrice[];
}

export interface NewPrice {
  currency: 'INR' | 'USD';
  unitPrice: number;
  minimumMonthly: number;
  validFrom: string;
  reason: string;
}

export type SupportStatus = 'requested' | 'approved' | 'declined' | 'cancelled' | 'ended' | 'expired';

export interface SupportSession {
  id: string;
  organizationId: string;
  /** Staff list only. */
  company?: string;
  /** Staff list only: asked for by the person signed in. */
  mine?: boolean;
  requestedBy: string;
  requestedByEmail: string;
  reason: string;
  ticket: string | null;
  hours: number;
  status: SupportStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  startsAt: string | null;
  endsAt: string | null;
  endedBy: string | null;
  endedAt: string | null;
  createdAt: string;
}

export interface SupportRequestInput {
  reason: string;
  ticket?: string;
  hours: number;
}

export interface SupportActivity {
  id: string;
  at: string;
  action: string;
  by: string;
  byYukthix: boolean;
  method: string | null;
  path: string | null;
  /** What was recorded with it, e.g. the hours approved. */
  details: Record<string, unknown> | null;
}

export interface PlatformAuditEntry {
  id: string;
  at: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: string;
  actorIsStaff: boolean;
  company: string | null;
  companyId: string | null;
  details: Record<string, unknown> | null;
}
