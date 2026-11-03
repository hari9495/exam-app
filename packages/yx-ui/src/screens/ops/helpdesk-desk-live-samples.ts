// Sample `live` data for the HLP-02 stories of states the real agent desk has (board, bulk dialogs, new ticket, saved
// views, no access) and for the tests. Not used by the app.
import { DESK, DETAIL, ROWS } from '../desk/data';
import type { DeskSummary, TicketRow } from '../desk/types';
import type { LiveAgentDesk } from './helpdesk-desk-live';
import { BUILT_IN_VIEWS } from './helpdesk-desk-live';

const ok = async () => undefined;
export const HR_DESK_ROW: DeskSummary = { ...DESK, id: 'd-hr', key: 'HR', name: 'HR help desk', myRole: null, canWork: false };

export const DESK_ROWS: TicketRow[] = [
  { ...ROWS[0], canBulk: true, resolution: { usedMinutes: 420, targetMinutes: 480, paused: false }, firstResponse: null, firstResponseAt: '2026-10-07T05:00:00Z', sla: { dueAt: '2026-10-08T05:00:00Z', breached: false, paused: false } },
  { ...ROWS[1], canBulk: true, resolution: { usedMinutes: 1100, targetMinutes: 960, paused: false }, firstResponse: { usedMinutes: 200, targetMinutes: 120, paused: false }, firstResponseAt: null, sla: { dueAt: null, breached: true, paused: false } },
  { ...ROWS[2], canBulk: true, resolution: { usedMinutes: 300, targetMinutes: 480, paused: true }, firstResponse: null, firstResponseAt: '2026-10-07T03:00:00Z', sla: { dueAt: null, breached: false, paused: true } },
];

export function liveDesk(over: Partial<LiveAgentDesk> = {}): LiveAgentDesk {
  return {
    state: 'ready',
    onRetry: () => undefined,
    desks: [{ ...DESK, myRole: 'lead', canWork: true, forwardTo: ['d-hr'] }, HR_DESK_ROW],
    details: [DETAIL],
    views: [{ id: 'v1', name: 'VPN this week', shared: false, mine: true, deskId: null, filters: { search: 'vpn' }, columns: [], sort: null, layout: 'list' }],
    page: { items: DESK_ROWS, total: DESK_ROWS.length, nextCursor: null },
    pageState: 'ready',
    query: { viewId: 'open', filters: BUILT_IN_VIEWS.find((v) => v.id === 'open')!.filters, layout: 'list' },
    onQueryChange: () => undefined,
    meId: 'u-me',
    onOpen: () => undefined,
    onAssignToMe: ok,
    onMove: ok,
    onBulk: async (ids) => ({ done: ids, failed: [] }),
    onMoveDesk: ok,
    onSaveView: ok,
    onExport: ok,
    onSearchPeople: async () => [{ id: 'p1', name: 'Arjun Kulkarni', email: 'arjun@kaverifoods.test' }],
    onCreate: async () => ({ id: 'n1' }),
    ...over,
  };
}
