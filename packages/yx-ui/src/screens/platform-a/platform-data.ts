// Fictional sample data for Platform & shared screens (Kaveri Foods Pvt Ltd). Deterministic.
import { TODAY } from '../_kit/data';

export const at = (day: number, h = 9, m = 0, month = 8) => new Date(2026, month, day, h, m);
export const d = (day: number, month = 8) => new Date(2026, month, day);
export { TODAY };

/* Notifications (PLT-03) */
export type NotifCategory = 'Approvals' | 'Leave & time' | 'Pay' | 'Tasks' | 'From YukthiX' | 'Hiring';
export interface PlatformNotification {
  id: string;
  category: NotifCategory;
  actor: string;
  text: string;
  at: Date;
  read: boolean;
  /** Low-risk approval that can be approved inline. */
  approvable?: boolean;
  /** Grouped: "2 more like this". */
  more?: number;
  /** The grouped notifications, shown with "Show N more like this". */
  moreItems?: PlatformNotification[];
}

export const NOTIFICATIONS: PlatformNotification[] = [
  { id: 'n1', category: 'Approvals', actor: 'Arjun Mehta', text: 'Arjun Mehta applied for casual leave, 1–2 Oct (2 days)', at: at(29, 9, 12), read: false, approvable: true },
  { id: 'n2', category: 'Approvals', actor: 'Pooja Nair', text: 'Pooja Nair submitted an expense claim of ₹4,850 for client travel', at: at(29, 8, 40), read: false, approvable: true, more: 2,
    moreItems: [
      { id: 'n2a', category: 'Approvals', actor: 'Vikram Rao', text: 'Vikram Rao submitted an expense claim of ₹1,240 for local travel', at: at(29, 8, 31), read: false, approvable: true },
      { id: 'n2b', category: 'Approvals', actor: 'Sanjay Gupta', text: 'Sanjay Gupta submitted an expense claim of ₹2,100 for a team lunch', at: at(29, 8, 12), read: false, approvable: true },
    ] },
  { id: 'n3', category: 'Pay', actor: 'Suresh Pillai', text: 'Your September payslip is ready', at: at(29, 7, 5), read: false },
  { id: 'n4', category: 'Tasks', actor: 'Lakshmi Venkatesan', text: 'Submit investment proofs for FY 2026-27 by 15 Oct', at: at(28, 16, 20), read: true },
  { id: 'n5', category: 'Leave & time', actor: 'Karthik Subramanian', text: 'Karthik Subramanian approved your leave for 6–8 Oct', at: at(28, 11, 2), read: true },
  { id: 'n6', category: 'From YukthiX', actor: 'YukthiX', text: 'Planned maintenance on Sun 4 Oct, 1:00 am to 3:00 am. Mobile check-in keeps working offline.', at: at(27, 10, 0), read: true },
  { id: 'n7', category: 'Hiring', actor: 'Neha Joshi', text: 'Neha Joshi asked for your interview feedback on Rohan Kulkarni', at: at(25, 15, 30), read: true },
];

/* Approvals (PLT-04) */
export type ApprovalKind = 'Leave' | 'Expense' | 'Timesheet' | 'Regularisation' | 'Offer' | 'Bank change' | 'Access request';
export interface ApprovalRow {
  id: string;
  ref: string;
  type: ApprovalKind;
  requester: string;
  requesterRole: string;
  summary: string;
  detail: string;
  submitted: Date;
  due: Date;
  step: string;
  lowRisk: boolean;
  policy: { ok: true } | { ok: false; reason: string };
  /** Delegated to me: who I act for. */
  onBehalfOf?: string;
  /** Raised on behalf of the requester by a proxy (YX-WF-18). */
  raisedBy?: string;
  status: 'Waiting' | 'Approved' | 'Rejected' | 'Sent back' | 'Withdrawn';
  context: string[];
  /** Expense: receipt file and the maths behind the amount. */
  receipt?: { file: string; lines: string[] };
  /** Leave: who else in the team is off on these days. */
  teamOff?: { name: string; when: string }[];
}

export const APPROVALS: ApprovalRow[] = [
  { id: 'a1', ref: 'LV-26-01842', type: 'Leave', requester: 'Arjun Mehta', requesterRole: 'QA Engineer · Quality', summary: 'Casual leave · 2 days', detail: '01 Oct – 02 Oct 2026', submitted: at(29, 9, 12), due: d(30), step: 'Manager approval', lowRisk: true, policy: { ok: true }, status: 'Waiting', context: ['Balance after: 6 of 12 days', 'Gandhi Jayanti on 2 Oct is a holiday, so 1 day is deducted'], teamOff: [{ name: 'Kavya Reddy', when: 'Casual leave, Thu 1 Oct' }, { name: 'Vikram Rao', when: 'Earned leave, Thu 1 Oct' }] },
  { id: 'a2', ref: 'LV-26-01839', type: 'Leave', requester: 'Meera Krishnan', requesterRole: 'Lab Analyst · Quality', summary: 'Sick leave · 2 days', detail: '1 Oct – 3 Oct 2026', submitted: at(28, 8, 30), due: d(29), step: 'Manager approval', lowRisk: true, policy: { ok: true }, status: 'Waiting', context: ['Balance after: 5 of 7 days', 'Medical certificate not needed for 1 day'], teamOff: [] },
  { id: 'a3', ref: 'EX-26-00977', type: 'Expense', requester: 'Pooja Nair', requesterRole: 'Area Sales Manager · Sales', summary: 'Client travel · 3 items', detail: '₹4,850', submitted: at(29, 8, 40), due: d(1, 9), step: 'Manager approval', lowRisk: true, policy: { ok: true }, status: 'Waiting', context: ['Within daily limit for grade G5'], receipt: { file: '3 receipts · PDF', lines: ['Cab ₹2,150 + lunch with client ₹1,900 + parking ₹800 = ₹4,850', 'Matches the claimed amount'] } },
  { id: 'a4', ref: 'EX-26-00971', type: 'Expense', requester: 'Vikram Rao', requesterRole: 'Plant Supervisor · Operations', summary: 'Hotel stay · Hosur', detail: '₹18,200', submitted: at(27, 18, 5), due: d(28), step: 'Manager approval', lowRisk: false, policy: { ok: false, reason: 'Hotel ₹6,066 a night is above the ₹4,500 limit for Tier 2 cities' }, status: 'Waiting', context: ['3 nights, 24–27 Sep'], receipt: { file: 'hotel-invoice.pdf', lines: ['3 nights × ₹6,066 = ₹18,198', 'Claimed ₹18,200 (₹2 rounding)', 'Tier 2 limit: 3 nights × ₹4,500 = ₹13,500'] } },
  { id: 'a5', ref: 'TS-26-W39-114', type: 'Timesheet', requester: 'Sanjay Gupta', requesterRole: 'Automation Engineer · Engineering', summary: 'Week of 21 Sep · 44 hours', detail: '38 billable · 6 non-billable', submitted: at(26, 17, 45), due: d(30), step: 'Project manager', lowRisk: true, policy: { ok: true }, status: 'Waiting', onBehalfOf: 'Karthik Subramanian', context: ['Karthik Subramanian is away until 3 Oct; you approve for him'] },
  { id: 'a6', ref: 'AR-26-00412', type: 'Regularisation', requester: 'Ravi Shankar', requesterRole: 'Machine Operator · Operations', summary: 'Missed check-out · 25 Sep', detail: '6:00 am – 2:10 pm', submitted: at(26, 7, 15), due: d(29), step: 'Manager approval', lowRisk: true, policy: { ok: true }, status: 'Waiting', raisedBy: 'Lakshmi Venkatesan', context: ['Raised by Lakshmi Venkatesan on behalf of Ravi Shankar (no app)', 'Gate log shows exit at 2:08 pm'] },
  { id: 'a7', ref: 'CH-26-00088', type: 'Bank change', requester: 'Anita Desai', requesterRole: 'Accounts Executive · Finance', summary: 'Salary bank account change', detail: 'XXXX4417 → XXXX9023', submitted: at(28, 14, 0), due: d(30), step: 'HR verification', lowRisk: false, policy: { ok: true }, status: 'Waiting', context: ['Cancelled cheque attached', 'High risk: sign in to approve; never from email or chat'] },
  { id: 'a8', ref: 'AQ-26-00019', type: 'Access request', requester: 'Farhan Sheikh', requesterRole: 'HR Executive · People', summary: 'View salary for Hosur plant', detail: 'Until 31 Oct 2026', submitted: at(29, 9, 0), due: d(1, 9), step: 'Role owner', lowRisk: false, policy: { ok: true }, status: 'Waiting', context: ['Reason: prepare increment letters for plant staff', 'Access ends automatically on 31 Oct'] },
];

export const SENT_BY_ME: ApprovalRow[] = [
  { ...APPROVALS[0], id: 's1', ref: 'LV-26-01790', requester: 'Divya Raghunathan', requesterRole: 'Senior QA Engineer · Quality', summary: 'Earned leave · 3 days', detail: '06 Oct – 08 Oct 2026', status: 'Approved', step: 'Done', context: [] },
  { ...APPROVALS[2], id: 's2', ref: 'EX-26-00955', requester: 'Divya Raghunathan', requesterRole: 'Senior QA Engineer · Quality', summary: 'Internet reimbursement · September', detail: '₹1,000', status: 'Waiting', step: 'Finance review', context: [] },
];

/* Requests (PLT-05/06) */
export interface MyRequest {
  id: string;
  ref: string;
  type: string;
  summary: string;
  submitted: Date;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Sent back' | 'Withdrawn' | 'Draft';
  latestStep: string;
  waitingOn?: string;
  raisedBy?: string;
  /** Leave: first day, so approved leave that hasn't started can be cancelled. */
  startsOn?: Date;
}

export const MY_REQUESTS: MyRequest[] = [
  { id: 'r1', ref: 'LV-26-01790', type: 'Leave', summary: 'Earned leave · 6–8 Oct (3 days)', submitted: at(24, 10, 5), status: 'Approved', latestStep: 'Approved by Karthik Subramanian on 28 Sep', startsOn: new Date(2026, 9, 6) },
  { id: 'r2', ref: 'EX-26-00955', type: 'Expense', summary: 'Internet reimbursement · ₹1,000', submitted: at(26, 12, 0), status: 'Pending', latestStep: 'Finance review', waitingOn: 'Suresh Pillai' },
  { id: 'r3', ref: 'AR-26-00398', type: 'Regularisation', summary: 'Missed check-in · 22 Sep', submitted: at(22, 19, 30), status: 'Sent back', latestStep: 'Sent back: add the reason for the missed check-in', waitingOn: 'You' },
  { id: 'r4', ref: 'WFH-26-0211', type: 'Work from home', summary: 'Work from home · 30 Sep', submitted: at(27, 9, 0), status: 'Pending', latestStep: 'HR review', waitingOn: 'Lakshmi Venkatesan', raisedBy: 'Karthik Subramanian' },
  { id: 'r5', ref: 'LV-26-01602', type: 'Leave', summary: 'Sick leave · 3 Sep (1 day)', submitted: at(3, 8, 0), status: 'Approved', latestStep: 'Approved by Karthik Subramanian on 3 Sep' },
  { id: 'r6', ref: 'CH-26-00071', type: 'Profile change', summary: 'Address change', submitted: at(12, 16, 40), status: 'Rejected', latestStep: 'Rejected: the address proof is unreadable. Upload a clear copy.' },
  { id: 'r7', ref: 'LV-26-01550', type: 'Leave', summary: 'Casual leave · 21 Aug', submitted: at(18, 11, 0, 7), status: 'Withdrawn', latestStep: 'Withdrawn by you' },
];

/* People for pickers */
export const PEOPLE = [
  { id: 'p1', name: 'Karthik Subramanian', role: 'Head of Quality', department: 'Quality' },
  { id: 'p2', name: 'Arjun Mehta', role: 'QA Engineer', department: 'Quality' },
  { id: 'p3', name: 'Meera Krishnan', role: 'Lab Analyst', department: 'Quality' },
  { id: 'p4', name: 'Lakshmi Venkatesan', role: 'HR Business Partner', department: 'People' },
  { id: 'p5', name: 'Ravi Shankar', role: 'Machine Operator', department: 'Operations' },
  { id: 'p6', name: 'Nandini Rao', role: 'QA Lead (away, has delegated)', department: 'Quality' },
  { id: 'e1', name: 'Divya Raghunathan', role: 'Senior QA Engineer', department: 'Quality' },
];
