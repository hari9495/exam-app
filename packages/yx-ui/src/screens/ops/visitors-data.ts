// Fictional visitor data (M02 §B11). Location: Chennai office unless noted.
const at = (day: number, h: number, m = 0, month = 8) => new Date(2026, month, day, h, m);

export type VisitStatus = 'Expected' | 'Waiting for host' | 'On site' | 'Checked out' | 'Blocked' | 'Rejected' | 'No show' | 'Not checked out' | 'Cancelled';
export interface Visit {
  id: string;
  name: string;
  mobile: string;
  company: string;
  purpose: 'Meeting' | 'Interview' | 'Vendor' | 'Audit' | 'Delivery' | 'Maintenance';
  host: string;
  location: string;
  from: Date;
  to: Date;
  status: VisitStatus;
  badge?: string;
  checkIn?: Date;
  checkOut?: Date;
  nda?: boolean;
  escort?: boolean;
  walkIn?: boolean;
  vehicle?: string;
  idType?: string;
}
export const VISITS: Visit[] = [
  { id: 'v1', name: 'Rahul Menon', mobile: '98401 22871', company: 'Nilgiri Pharma Ltd', purpose: 'Meeting', host: 'Divya Raghunathan', location: 'Chennai office', from: at(29, 10, 0), to: at(29, 12, 0), status: 'Expected', idType: 'Driving licence' },
  { id: 'v2', name: 'Asha Kurian', mobile: '99620 55102', company: '—', purpose: 'Interview', host: 'Neha Joshi', location: 'Chennai office', from: at(29, 9, 30), to: at(29, 11, 0), status: 'On site', badge: 'V-0412', checkIn: at(29, 9, 24), nda: true },
  { id: 'v3', name: 'Suresh Babu', mobile: '94440 98710', company: 'CoolAir Services', purpose: 'Maintenance', host: 'Farhan Qureshi', location: 'Chennai office', from: at(29, 8, 30), to: at(29, 13, 0), status: 'On site', badge: 'V-0411', checkIn: at(29, 8, 41), nda: true, escort: true, vehicle: 'TN 09 BX 4471' },
  { id: 'v4', name: 'Priyanka Sethi', mobile: '98110 44319', company: 'Fairview Auditors LLP', purpose: 'Audit', host: 'Anita Desai', location: 'Chennai office', from: at(29, 9, 0), to: at(29, 18, 0), status: 'Waiting for host', walkIn: true },
  { id: 'v5', name: 'Dinesh Kumar', mobile: '90030 11872', company: 'Swift Couriers', purpose: 'Delivery', host: 'Reception', location: 'Chennai office', from: at(29, 8, 0), to: at(29, 8, 30), status: 'Checked out', badge: 'V-0409', checkIn: at(29, 8, 5), checkOut: at(29, 8, 19) },
  { id: 'v6', name: 'Manish Gupta', mobile: '98845 00712', company: '—', purpose: 'Meeting', host: 'Karthik Subramanian', location: 'Chennai office', from: at(29, 9, 40), to: at(29, 10, 30), status: 'Blocked', walkIn: true },
];

export const LOG: Visit[] = [
  ...VISITS.filter((v) => v.status === 'Checked out' || v.status === 'On site'),
  { id: 'l1', name: 'Kiran Rao', mobile: '98450 22110', company: 'Deccan Textiles Pvt Ltd', purpose: 'Meeting', host: 'Sana Nizami', location: 'Bengaluru head office', from: at(28, 15, 0), to: at(28, 16, 0), status: 'Checked out', badge: 'V-0391', checkIn: at(28, 14, 55), checkOut: at(28, 16, 12), nda: true },
  { id: 'l2', name: 'Farida Sheikh', mobile: '99001 33218', company: 'Fairview Auditors LLP', purpose: 'Audit', host: 'Anita Desai', location: 'Chennai office', from: at(2, 9, 0), to: at(2, 18, 0), status: 'Checked out', badge: 'V-0301', checkIn: at(2, 9, 10), checkOut: at(2, 17, 40), nda: true },
  { id: 'l3', name: 'Ganesh Iyer', mobile: '98410 77120', company: 'PackRight Machines', purpose: 'Maintenance', host: 'Ravi Shankar', location: 'Hosur plant', from: at(4, 7, 5), to: at(4, 12, 0), status: 'Checked out', badge: 'V-H-0211', checkIn: at(4, 7, 50), checkOut: at(4, 11, 35), nda: true, escort: true },
  { id: 'l4', name: 'Leena Joseph', mobile: '97890 11234', company: '—', purpose: 'Interview', host: 'Neha Joshi', location: 'Bengaluru head office', from: at(5, 11, 0, 6), to: at(5, 12, 0, 6), status: 'Checked out', badge: 'V-0177', checkIn: at(5, 10, 52, 6), checkOut: at(5, 12, 5, 6) },
];

export const MY_VISITORS: Visit[] = [VISITS[0], { ...VISITS[0], id: 'mv2', name: 'Anjali Varma', company: 'QualiTest Labs', from: at(1, 14, 0, 9), to: at(1, 15, 0, 9) }, { ...LOG[0] }];

/* ---------------- Live (Visitors slice 1) ---------------- */

/** A visit as the live API sends it (GET visitors/desk, visitors/mine, visitors/log). */
export interface VisitView {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  company: string | null;
  purpose: string;
  host: string;
  location: string;
  locationId: string;
  startsAt: string;
  endsAt: string;
  status: 'expected' | 'waiting' | 'on_site' | 'checked_out' | 'not_out' | 'no_show' | 'cancelled' | 'declined';
  statusText: string;
  /** Slice 2: a walk-in, when the host's minutes end, who decided, the hours reason, the visitor type. */
  walkIn?: boolean;
  approvalDueAt?: string | null;
  decidedVia?: 'host' | 'reception' | null;
  hoursOverride?: string | null;
  typeId?: string | null;
  passCode: string;
  badge: string | null;
  vehicle: string | null;
  noticeAcceptedAt: string | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  /** The log only: the day the visit is deleted (answer 608). */
  deletedOn?: string;
}

const PURPOSE: Record<string, Visit['purpose']> = { meeting: 'Meeting', interview: 'Interview', vendor: 'Vendor', audit: 'Audit', delivery: 'Delivery', maintenance: 'Maintenance' };
export const PURPOSE_CHOICES = Object.entries(PURPOSE).map(([value, label]) => ({ value, label }));

/** The drawn row from a live visit. */
export function visitOf(v: VisitView): Visit {
  return {
    id: v.id,
    name: v.name,
    mobile: v.mobile,
    company: v.company || '—',
    purpose: PURPOSE[v.purpose] ?? 'Meeting',
    host: v.host,
    location: v.location,
    from: new Date(v.startsAt),
    to: new Date(v.endsAt),
    status: v.statusText as VisitStatus,
    badge: v.badge ?? undefined,
    checkIn: v.checkedInAt ? new Date(v.checkedInAt) : undefined,
    checkOut: v.checkedOutAt ? new Date(v.checkedOutAt) : undefined,
    nda: Boolean(v.noticeAcceptedAt),
    vehicle: v.vehicle ?? undefined,
    walkIn: v.walkIn,
  };
}
