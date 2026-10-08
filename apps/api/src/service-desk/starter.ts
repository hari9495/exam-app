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
  hr: [{ name: 'Payslip and pay', sensitive: true }, { name: 'Leave and attendance' }, { name: 'Letters and documents' }, { name: 'Medical and insurance', sensitive: true }, { name: 'Other' }],
  it: [{ name: 'Laptop and devices' }, { name: 'Access and accounts' }, { name: 'Network and Wi-Fi' }, { name: 'Software' }, { name: 'Other' }],
  admin: [{ name: 'Travel and transport' }, { name: 'Canteen' }, { name: 'ID cards' }, { name: 'Other' }],
  facilities: [{ name: 'Repairs' }, { name: 'Cleaning' }, { name: 'Seating' }, { name: 'Other' }],
  finance: [{ name: 'Expenses and advances' }, { name: 'Invoices' }, { name: 'Other' }],
  legal: [{ name: 'Contracts' }, { name: 'Advice', sensitive: true }, { name: 'Other' }],
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
