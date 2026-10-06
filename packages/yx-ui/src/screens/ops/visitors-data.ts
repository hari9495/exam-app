// Fictional visitor data (M02 §B11). Location: Chennai office unless noted.
const at = (day: number, h: number, m = 0, month = 8) => new Date(2026, month, day, h, m);

export type VisitStatus = 'Expected' | 'Waiting for host' | 'On site' | 'Checked out' | 'Blocked' | 'Rejected' | 'No show';
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
