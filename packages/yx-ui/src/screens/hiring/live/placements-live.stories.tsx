import type { Meta, StoryObj } from '@storybook/react-vite';
import { PlacementsLiveScreen, type LivePlacement } from './placements-live';

// HIR-17, live (founder decision 21 Oct 2026): placements with live data only. Approved hours wait for client
// timesheets; the bench board waits for pay between assignments.
const meta: Meta = { title: 'Screens/Hiring/Live/Placements', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const ok = async () => ({});
const KA = { id: 'ka', name: 'Kaveri Foods Pvt Ltd' };
const P = (id: string, name: string, client: string, role: string, startOn: string, endOn: string, bill: string, pay: string, stat: string, status: LivePlacement['status'], vendor: string | null = null): LivePlacement => ({
  id,
  personId: `p-${id}`,
  name,
  legalEntity: KA,
  client,
  role,
  startOn,
  endOn,
  billRate: bill,
  payRate: pay,
  statutoryPerHour: stat,
  supply: vendor ? 'vendor' : 'own',
  vendor,
  status,
  endedOn: null,
});
const ROWS: LivePlacement[] = [
  P('pc1', 'Aravind Kumar', 'Nilgiri Retail Pvt Ltd', 'Java Developer', '2026-01-05', '2026-12-31', '1200.00', '800.00', '96.00', 'active'),
  P('pc2', 'Sowmya Ramesh', 'Nilgiri Retail Pvt Ltd', 'Senior Java Developer', '2025-11-01', '2026-10-15', '1650.00', '1100.00', '132.00', 'ending_soon'),
  P('pc3', 'Priya Nair', 'Coromandel Logistics', 'Warehouse Supervisor', '2026-08-01', '2027-01-31', '1200.00', '900.00', '0.00', 'active', 'Sahyadri Staffing'),
];
const base = { state: 'ready' as const, today: '2026-09-29', rows: ROWS, entities: [KA], canManage: true, onCreate: ok, onEnd: ok };
export const List: S = { name: 'HIR-17 · Placements, live', render: () => <PlacementsLiveScreen {...base} /> };
export const New: S = { name: 'HIR-17 · Placements, live · new placement', render: () => <PlacementsLiveScreen {...base} defaultNewOpen /> };
export const ReadOnly: S = { name: 'HIR-17 · Placements, live · read only', render: () => <PlacementsLiveScreen {...base} canManage={false} /> };
export const Empty: S = { name: 'HIR-17 · Placements, live · nothing yet', render: () => <PlacementsLiveScreen {...base} rows={[]} /> };
