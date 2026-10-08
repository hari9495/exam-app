import type { YxSupportRow, YxSupportTicket } from './yukthix-support';

// Sample data for the Contact YukthiX stories and tests (SD-1.31).
export const YX_ROWS: YxSupportRow[] = [
  { id: 't1', number: 'YXS-1042', subject: 'Nobody can sign in', status: 'Open', state: 'open', severity: 1, created_at: '2026-10-08T08:00:00Z', updated_at: '2026-10-08T08:20:00Z' },
  { id: 'i1', number: null, subject: 'An idea for the org chart', status: 'Sending', state: 'new', severity: 4, created_at: '2026-10-08T08:30:00Z', updated_at: '2026-10-08T08:30:00Z' },
];

export const YX_TICKET: YxSupportTicket = {
  id: 't1',
  number: 'YXS-1042',
  subject: 'Nobody can sign in',
  status: 'Open',
  state: 'open',
  severity: 1,
  tier: 'priority',
  created_at: '2026-10-08T08:00:00Z',
  updated_at: '2026-10-08T08:20:00Z',
  messages: [
    { id: 'm1', side: 'requester', at: '2026-10-08T08:00:00Z', body_html: '<p>Since 8:00 nobody can sign in.</p>', author: 'Sunita Rao' },
    { id: 'm2', side: 'agent', at: '2026-10-08T08:20:00Z', body_html: '<p>We are on it.</p>', author: 'Anand' },
  ],
};
