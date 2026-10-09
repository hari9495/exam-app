// SD-1.33 seam / D8: the starter set-up copied into a new desk. The kind only picks these defaults; everything stays
// editable afterwards and runs on the same tables. Plain simple English, our own words.

export interface Starter {
  types: { kind: 'incident' | 'request' | 'question'; name: string }[];
  statuses: { label: string; systemState: string }[];
  categories: { name: string; sensitive?: boolean }[];
}

const EMPLOYEE_STATUSES = [
  { label: 'New', systemState: 'new' },
  { label: 'In progress', systemState: 'open' },
  { label: 'Waiting on requester', systemState: 'pending' },
  { label: 'On hold', systemState: 'on_hold' },
  { label: 'Resolved', systemState: 'solved' },
  { label: 'Closed', systemState: 'closed' },
];

const EMPLOYEE_TYPES: Starter['types'] = [
  { kind: 'incident', name: 'Something is broken' },
  { kind: 'request', name: 'Request' },
  { kind: 'question', name: 'Question' },
];

const CATEGORIES: Record<string, Starter['categories']> = {
  // M08 confidential categories map to sensitive (YX-HD-03).
  hr: [{ name: 'Payslip and pay', sensitive: true }, { name: 'Leave and attendance' }, { name: 'Letters and documents' }, { name: 'Medical and insurance', sensitive: true }, { name: 'Personal matter', sensitive: true }, { name: 'Joining and leaving' }, { name: 'Other' }],
  it: [{ name: 'Laptop and devices' }, { name: 'Access and accounts' }, { name: 'Network and Wi-Fi' }, { name: 'Software' }, { name: 'Other' }],
  admin: [{ name: 'Travel and transport' }, { name: 'Canteen' }, { name: 'ID cards' }, { name: 'Joining and leaving' }, { name: 'Other' }],
  facilities: [{ name: 'Repairs' }, { name: 'Cleaning' }, { name: 'Seating' }, { name: 'Safety checks' }, { name: 'Other' }],
  finance: [{ name: 'Expenses and advances' }, { name: 'Invoices' }, { name: 'Vendor payments' }, { name: 'Other' }],
  legal: [{ name: 'Contracts' }, { name: 'Advice', sensitive: true }, { name: 'Notices and disputes', sensitive: true }, { name: 'Other' }],
  security: [{ name: 'Suspicious email' }, { name: 'Lost device' }, { name: 'Other' }],
  custom: [{ name: 'General' }],
  customer_support: [{ name: 'Billing' }, { name: 'Product question' }, { name: 'Something is not working' }, { name: 'Account access' }],
};

export function starterFor(kind: string): Starter {
  if (kind === 'customer_support') {
    return {
      types: [
        { kind: 'question', name: 'Question' },
        { kind: 'incident', name: 'Problem report' },
        { kind: 'request', name: 'Request' },
      ],
      statuses: [
        { label: 'New', systemState: 'new' },
        { label: 'Open', systemState: 'open' },
        { label: 'Waiting on customer', systemState: 'pending' },
        { label: 'On hold', systemState: 'on_hold' },
        { label: 'Solved', systemState: 'solved' },
        { label: 'Closed', systemState: 'closed' },
      ],
      categories: CATEGORIES.customer_support,
    };
  }
  return { types: EMPLOYEE_TYPES, statuses: EMPLOYEE_STATUSES, categories: CATEGORIES[kind] ?? CATEGORIES.custom };
}

/** YX-SD-03 starter matrix: 1 is the highest; impact and urgency 1 (high) to 4 (low). */
export const starterPriority = (impact: number, urgency: number) => Math.max(1, Math.min(4, impact + urgency - 2));

/** India working week, 9:00 to 18:00 Monday to Friday. */
export const STARTER_HOURS = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 9 * 60, endMinute: 18 * 60 }));

// SD-2.09 (US-B-128, US-B-129): ESM starter packs. A pack adds ready catalogue items (each fulfilled by the desk's own
// team, with its time), SLA targets and, for HR, M08 privacy: sensitive categories (pay, medical, personal) are seen
// only by the HR agents and every ticket in them is private (YX-HD-03); a new HR desk is restricted. Grievance, POSH,
// disciplinary and whistleblower matters are never desk tickets: they stay in M08 cases (the HR portal points there).
// Everything installed stays editable; installing again adds only what is missing.
export interface PackItem {
  name: string;
  shortText: string;
  category: string;
  deliveryDays: number;
  tasks: { title: string; olaHours: number }[];
  /** The requester's manager approves first. */
  managerApproves?: boolean;
  /** Only started by joiner / leaver journeys, never listed in the catalogue. */
  journeyOnly?: boolean;
}
export interface StarterPack {
  restricted?: boolean;
  items: PackItem[];
  /** Minutes for priorities 1 to 4. */
  firstResponse: [number, number, number, number];
  resolution: [number, number, number, number];
}

const H = 60;
export const STARTER_PACKS: Record<string, StarterPack> = {
  hr: {
    restricted: true,
    firstResponse: [2 * H, 4 * H, 8 * H, 16 * H],
    resolution: [8 * H, 24 * H, 40 * H, 80 * H],
    items: [
      { name: 'Employment letter', shortText: 'A letter that confirms your job, for a bank, a visa or a landlord.', category: 'Letters and documents', deliveryDays: 2, tasks: [{ title: 'Prepare and sign the letter', olaHours: 16 }] },
      { name: 'Change my bank account for pay', shortText: 'Tell HR your new salary account. Payroll checks it before the next pay day.', category: 'Payslip and pay', deliveryDays: 3, tasks: [{ title: 'Check the new account and update payroll', olaHours: 24 }] },
      { name: 'Joining paperwork', shortText: 'Forms and documents for a new joiner.', category: 'Joining and leaving', deliveryDays: 1, journeyOnly: true, tasks: [{ title: 'Collect joining forms and documents', olaHours: 8 }] },
      { name: 'Exit settlement', shortText: 'Full and final settlement and the relieving letter for a leaver.', category: 'Joining and leaving', deliveryDays: 5, journeyOnly: true, tasks: [{ title: 'Prepare the full and final settlement', olaHours: 40 }, { title: 'Issue the relieving and experience letters', olaHours: 40 }] },
    ],
  },
  admin: {
    firstResponse: [H, 4 * H, 8 * H, 16 * H],
    resolution: [8 * H, 16 * H, 40 * H, 80 * H],
    items: [
      { name: 'ID card', shortText: 'A new or replacement office ID card.', category: 'ID cards', deliveryDays: 2, tasks: [{ title: 'Print the ID card', olaHours: 16 }, { title: 'Hand over the ID card', olaHours: 8 }] },
      { name: 'Cab for office travel', shortText: 'A cab for a late shift or a client visit.', category: 'Travel and transport', deliveryDays: 1, managerApproves: true, tasks: [{ title: 'Book the cab and share the details', olaHours: 4 }] },
      { name: 'Collect ID card and keys', shortText: 'For a leaver: take back the ID card, keys and parking pass.', category: 'Joining and leaving', deliveryDays: 1, journeyOnly: true, tasks: [{ title: 'Collect the ID card, keys and parking pass', olaHours: 8 }] },
    ],
  },
  facilities: {
    firstResponse: [30, 2 * H, 8 * H, 16 * H],
    resolution: [4 * H, 16 * H, 40 * H, 80 * H],
    items: [
      { name: 'Desk or chair repair', shortText: 'Something at your seat is broken.', category: 'Repairs', deliveryDays: 2, tasks: [{ title: 'Repair or replace it', olaHours: 16 }] },
      { name: 'Deep cleaning', shortText: 'A cleaning beyond the daily round (spill, event, move).', category: 'Cleaning', deliveryDays: 1, tasks: [{ title: 'Clean the area', olaHours: 8 }] },
      { name: 'Seat for a new joiner', shortText: 'A desk, chair and locker ready on the first day.', category: 'Seating', deliveryDays: 2, journeyOnly: true, tasks: [{ title: 'Ready the desk, chair and locker', olaHours: 16 }] },
    ],
  },
  finance: {
    firstResponse: [2 * H, 4 * H, 8 * H, 16 * H],
    resolution: [8 * H, 24 * H, 40 * H, 80 * H],
    items: [
      { name: 'Travel advance', shortText: 'Money before a work trip, settled with your expense claim.', category: 'Expenses and advances', deliveryDays: 3, managerApproves: true, tasks: [{ title: 'Pay the advance', olaHours: 24 }] },
      { name: 'Vendor payment status', shortText: 'Ask where a vendor payment is.', category: 'Vendor payments', deliveryDays: 2, tasks: [{ title: 'Find the payment and reply', olaHours: 16 }] },
    ],
  },
  legal: {
    firstResponse: [4 * H, 8 * H, 16 * H, 24 * H],
    resolution: [24 * H, 40 * H, 80 * H, 120 * H],
    items: [
      { name: 'Contract review', shortText: 'Legal reads a contract before you sign it.', category: 'Contracts', deliveryDays: 5, managerApproves: true, tasks: [{ title: 'Review the contract and send comments', olaHours: 40 }] },
      { name: 'Non-disclosure agreement', shortText: 'A standard NDA for a vendor or partner.', category: 'Contracts', deliveryDays: 2, tasks: [{ title: 'Prepare the NDA', olaHours: 16 }] },
    ],
  },
};

/** Categories that make every new ticket in them private (M08): the HR desk's sensitive ones. */
export const PRIVATE_BY_DEFAULT = new Set(['hr:Payslip and pay', 'hr:Medical and insurance', 'hr:Personal matter']);
