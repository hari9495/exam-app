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

const CO = { committeeId: null, committee: 'Whole company' };
const MEMBERS: LiveIcConsole['members'] = [
  { id: 'm1', name: 'Dr. Anuradha Menon', role: 'presiding', since: '2025-04-01', woman: true, termEndsOn: '2028-03-31', ...CO },
  { id: 'm2', name: 'Adv. Shobha Rao', role: 'external', since: '2025-04-01', woman: true, termEndsOn: '2028-03-31', ...CO },
  { id: 'm3', name: 'Kavitha Srinivasan', role: 'member', since: '2025-06-12', woman: true, termEndsOn: '2028-03-31', ...CO },
  { id: 'm4', name: 'Joseph Mathew', role: 'member', since: '2025-06-12', woman: false, termEndsOn: '2028-03-31', ...CO },
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
  awareness: [
    { id: 'a1', committeeId: null, heldOn: '2026-09-12', title: 'POSH awareness for new joiners', audience: 'New joiners', attended: 34 },
    { id: 'a2', committeeId: null, heldOn: '2026-07-05', title: 'Internal Committee orientation', audience: 'IC members', attended: 4 },
  ],
  reports: [{ committeeId: null, committee: 'Whole company', year: 2026, dueOn: '2027-01-31', received: 2, disposed: 0, pendingOver90: 1, sessions: 2, actionTaken: null, stage: 'draft', presiding: true }],
  onLog: async () => undefined,
  onReportStep: async () => undefined,
  ...over,
});

export const IC_NO_EXTERNAL = MEMBERS.filter((m) => m.role !== 'external');
/** Answer 2591: a man presiding, a term over, and a member added before woman and term end were asked. */
export const IC_WRONG: LiveIcConsole['members'] = [
  { id: 'm1', name: 'Joseph Mathew', role: 'presiding', since: '2025-04-01', woman: false, termEndsOn: '2028-03-31', ...CO },
  { id: 'm2', name: 'Adv. Shobha Rao', role: 'external', since: '2023-04-01', woman: true, termEndsOn: '2026-03-31', ...CO },
  { id: 'm3', name: 'Kavitha Srinivasan', role: 'member', since: '2025-06-12', woman: null, termEndsOn: null, ...CO },
];
/** Answer 2592: a member on the company committee and on the Hosur plant's own committee (which has no external member). */
export const IC_TWO_COMMITTEES: LiveIcConsole['members'] = [
  ...MEMBERS,
  { id: 'h1', name: 'Dr. Anuradha Menon', role: 'presiding', since: '2026-01-05', woman: true, termEndsOn: '2028-12-31', committeeId: 'loc-hsr', committee: 'Hosur plant' },
  { id: 'h2', name: 'Meena Pillai', role: 'member', since: '2026-01-05', woman: true, termEndsOn: '2028-12-31', committeeId: 'loc-hsr', committee: 'Hosur plant' },
];
