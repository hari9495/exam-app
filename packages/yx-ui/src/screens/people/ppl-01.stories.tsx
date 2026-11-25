import type { Meta, StoryObj } from '@storybook/react-vite';
import { DirectoryPhone, DirectoryScreen, type LiveDirectory } from './directory';
import { ME, WORKFORCE } from './people-data';
import { HireDrawer } from '../history';
import { OPTIONS } from '../history/data';
import { date, pick, play, press, tick, type } from './popup-play';

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

// Add person (People › Directory): the live drawer with the job-change options.
const ENTITIES = [{ value: 'le-kfpl', label: 'Kaveri Foods Pvt Ltd' }, { value: 'le-tn', label: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' }];
const hire = (onSubmit: Parameters<typeof HireDrawer>[0]['onSubmit'] = async () => ({ id: 'p-new' })) => <HireDrawer options={OPTIONS} legalEntities={ENTITIES} onSubmit={onSubmit} onClose={() => undefined} />;
const fillHire = [
  type(/^First name/, 'Kavya'),
  type(/^Last name/, 'Reddy'),
  type(/^Work email/, 'kavya.reddy@kaverifoods.test'),
  pick('Legal entity', 'Kaveri Foods Pvt Ltd'),
  date('Joins on', '01 Feb 2027'),
  pick('Location', 'Bengaluru head office'),
  pick('Department', 'Quality'),
  pick('Designation', 'Quality Analyst'),
  pick('Employment type', 'Permanent'),
  pick('Cost centre', /CC-BLR-ENG/),
  type(/^Reason(?! for)/, 'Offer KF/OFR/2026/0311 accepted'),
];
const sameEmail = async () => {
  throw Object.assign(new Error('This email already belongs to someone here.'), { code: 'POSSIBLE_SAME_PERSON', body: { personIds: ['p-kavya-2023'] } });
};
export const Hire: S = { name: 'Add person · open', render: () => hire() };
export const HireFilled: S = { name: 'Add person · filled', render: () => hire(), play: play(...fillHire) };
export const HireMissing: S = { name: 'Add person · Add pressed with nothing filled', render: () => hire(), play: play(press('Add person')) };
export const HireSamePerson: S = { name: 'Add person · email already on record, Link pressed without the check', render: () => hire(sameEmail), play: play(...fillHire, press('Add person'), press('Link and add')) };
export const HireSamePersonChecked: S = { name: 'Add person · same person checked, ready to link', render: () => hire(sameEmail), play: play(...fillHire, press('Add person'), tick(/same person/)) };
export const HireFailed: S = { name: 'Add person · the server refuses', render: () => hire(async () => { throw new Error('Employee code KF-0611 is already used.'); }), play: play(...fillHire, press('Add person')) };
