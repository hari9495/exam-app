import type { LiveIcConsole, LivePoshFiling } from './posh';

// Batch F item 13: sample live data for the CMP-10 complaint form and the CMP-11 Internal Committee console.
export const livePoshFiling = (over: Partial<LivePoshFiling> = {}): LivePoshFiling => ({
  company: 'Kaveri Foods',
  icReady: true,
  locations: [
    { id: 'loc-blr', name: 'Bengaluru head office' },
    { id: 'loc-hsr', name: 'Hosur plant' },
  ],
  onFile: async () => ({ id: 'rep-1', reference: 'POSH-0009' }),
  onUpload: async () => undefined,
  ...over,
});

const MEMBERS: LiveIcConsole['members'] = [
  { id: 'm1', name: 'Dr. Anuradha Menon', role: 'presiding', since: '2025-04-01' },
  { id: 'm2', name: 'Adv. Shobha Rao', role: 'external', since: '2025-04-01' },
  { id: 'm3', name: 'Kavitha Srinivasan', role: 'member', since: '2025-06-12' },
];

export const liveIcConsole = (over: Partial<LiveIcConsole> = {}): LiveIcConsole => ({
  state: 'ready',
  company: 'Kaveri Foods',
  members: MEMBERS,
  cases: [
    { id: 'c1', ref: 'POSH-0007', filedOn: '2026-09-21', location: 'Bengaluru head office', stage: 'Notice to respondent', next: { label: 'Notice due', on: '2026-09-28' }, overdue: true, status: 'open' },
    { id: 'c2', ref: 'POSH-0006', filedOn: '2026-07-10', location: 'Hosur plant', stage: 'Inquiry', next: { label: 'Inquiry ends', on: '2026-10-08' }, overdue: false, status: 'open' },
  ],
  onOpen: () => undefined,
  ...over,
});

export const IC_NO_EXTERNAL = MEMBERS.filter((m) => m.role !== 'external');
