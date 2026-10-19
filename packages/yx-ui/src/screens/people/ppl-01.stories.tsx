import type { Meta, StoryObj } from '@storybook/react-vite';
import { DirectoryPhone, DirectoryScreen, type LiveDirectory } from './directory';
import { ME, WORKFORCE } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-01 · Directory', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const HrEmployees: S = { name: 'HR · employees with workforce card', render: () => <DirectoryScreen persona="hr" rows={WORKFORCE} /> };
export const HrContractWorkers: S = { name: 'HR · contract workers', render: () => <DirectoryScreen persona="hr" rows={WORKFORCE} defaultFilter="Contract worker" /> };
export const HrAllPersons: S = { name: 'HR · all persons', render: () => <DirectoryScreen persona="hr" rows={WORKFORCE} defaultFilter="All persons" /> };
export const Employee: S = { name: 'Employee · public fields only', render: () => <DirectoryScreen persona="emp" rows={WORKFORCE} /> };
export const QuickView: S = { name: 'Quick view drawer', render: () => <DirectoryScreen persona="hr" rows={WORKFORCE} defaultOpenId="e2" /> };
export const Filtered: S = { name: '· filtered to nothing', render: () => <DirectoryScreen persona="hr" rows={WORKFORCE} defaultQuery="Zzz" /> };
export const Empty: S = { name: '· empty (first use)', render: () => <DirectoryScreen persona="hr" rows={[]} /> };
export const Loading: S = { name: '· loading', render: () => <DirectoryScreen persona="hr" rows={WORKFORCE} state="loading" /> };
export const LoadError: S = { name: '· error', render: () => <DirectoryScreen persona="hr" rows={WORKFORCE} state="error" /> };
export const Phone: S = { name: '· phone', ...phone, render: () => <DirectoryPhone rows={WORKFORCE} /> };
export const PhoneNoMatch: S = { name: '· phone, no match', ...phone, render: () => <DirectoryPhone rows={WORKFORCE} defaultQuery="Zzz" /> };

/* The live app (design audit step 2): only the cards whose modules exist (Contract workers and Placements appear when
   theirs ship), no "vs last month" line until last month is on record, Import only once an employee import exists. */
const LIVE_ROWS = WORKFORCE.filter((r) => r.kind === 'Employee' || r.kind === 'Consultant');
const count = (k: string) => LIVE_ROWS.filter((r) => r.kind === k).length;
const live = (over: Partial<LiveDirectory> = {}): LiveDirectory => ({
  company: 'Kaveri Foods',
  me: ME,
  cards: { Employee: { count: count('Employee'), delta: null }, Consultant: { count: count('Consultant'), delta: null }, 'All persons': { count: LIVE_ROWS.length - 1, delta: null } },
  persons: { roles: LIVE_ROWS.length, people: LIVE_ROWS.length - 1 },
  onAdd: () => {},
  onOpenRecord: () => {},
  onStartChange: () => {},
  onIssueLetter: () => {},
  onExport: () => {},
  views: { list: [{ id: 'v1', name: 'Hosur plant', shared: true, state: { kind: 'Employee', filters: [], q: 'Hosur', quick: null } }], onSave: () => {} },
  ...over,
});
export const LiveHr: S = { name: 'Live · HR, first month (no change line yet)', render: () => <DirectoryScreen persona="hr" rows={LIVE_ROWS} live={live()} /> };
export const LiveHrTrend: S = {
  name: 'Live · HR, with last month',
  render: () => <DirectoryScreen persona="hr" rows={LIVE_ROWS} live={live({ sinceMonth: 'September', cards: { Employee: { count: count('Employee'), delta: 3 }, Consultant: { count: count('Consultant'), delta: 0 }, 'All persons': { count: LIVE_ROWS.length - 1, delta: 2 } } })} />,
};
export const LiveEmployee: S = { name: 'Live · employee (quick chips from the person)', render: () => <DirectoryScreen persona="emp" rows={LIVE_ROWS} live={live({ cards: { Employee: { count: count('Employee'), delta: null } } })} /> };
export const LivePhone: S = { name: 'Live · phone', ...phone, render: () => <DirectoryPhone rows={LIVE_ROWS} live={{ me: ME, persona: 'emp' }} /> };
