import type { DeskField, TicketFieldView } from './ticket-fields';

// Answers 1641, 1650: sample desk fields for the drawings and tests. "Office" narrows "Floor"; "Asset cost" is for the
// desk's team leads only; "Vendor ticket" is for the desk's staff (hidden from the requester).

const base = { ticketTypeId: null, dependsOn: null, optionsBy: null, active: true, version: 1 } as const;
export const SAMPLE_FIELDS: DeskField[] = [
  { ...base, id: 'f1', key: 'office', label: 'Office', fieldType: 'choice', options: [{ value: 'blr', label: 'Bengaluru' }, { value: 'che', label: 'Chennai' }], visibility: 'all', sortOrder: 0 },
  { ...base, id: 'f2', key: 'floor', label: 'Floor', fieldType: 'choice', options: [{ value: 'blr_1', label: 'Bengaluru · 1st floor' }, { value: 'blr_2', label: 'Bengaluru · 2nd floor' }, { value: 'che_g', label: 'Chennai · ground floor' }], dependsOn: 'office', optionsBy: { blr: ['blr_1', 'blr_2'], che: ['che_g'] }, visibility: 'all', sortOrder: 1 },
  { ...base, id: 'f3', key: 'vendor_ticket', label: 'Vendor ticket', fieldType: 'text', options: [], visibility: 'agents', sortOrder: 2 },
  { ...base, id: 'f4', key: 'asset_cost', label: 'Asset cost (₹)', fieldType: 'number', options: [], visibility: 'leads', sortOrder: 3 },
  { ...base, id: 'f5', key: 'warranty_end', label: 'Warranty ends', fieldType: 'date', options: [], visibility: 'agents', sortOrder: 4, active: false },
];

const view = (f: DeskField, value: string | number | null, display: string | null): TicketFieldView => ({ id: f.id, key: f.key, label: f.label, type: f.fieldType, visibility: f.visibility, options: f.options, dependsOn: f.dependsOn, optionsBy: f.optionsBy, value, display });
/** What a team lead sees on a ticket. */
export const LEAD_TICKET_FIELDS: TicketFieldView[] = [
  view(SAMPLE_FIELDS[0], 'blr', 'Bengaluru'),
  view(SAMPLE_FIELDS[1], 'blr_2', 'Bengaluru · 2nd floor'),
  view(SAMPLE_FIELDS[2], 'DELL-88213', 'DELL-88213'),
  view(SAMPLE_FIELDS[3], 84500, '84500'),
];
/** What a first-line agent sees (no team-lead-only field). */
export const AGENT_TICKET_FIELDS = LEAD_TICKET_FIELDS.filter((f) => f.visibility !== 'leads');
/** What the requester sees (only fields for everyone, filled). */
export const REQUESTER_TICKET_FIELDS = [
  { label: 'Office', value: 'Bengaluru' },
  { label: 'Floor', value: 'Bengaluru · 2nd floor' },
];
