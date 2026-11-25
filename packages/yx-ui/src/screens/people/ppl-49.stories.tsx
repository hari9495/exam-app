import type { Meta, StoryObj } from '@storybook/react-vite';
import { UpcomingExits } from './upcoming';
import { TODAY, UPCOMING_EXITS } from './people-data';
import { ContractDialog } from './live/special';
import { JOINER_PLACES, PERSON_CHOICES, TODAY_KEY } from './people-data';
import { date, fails, ok, pick, play, press, type } from './popup-play';

const meta: Meta = { title: 'Screens/People/PPL-49 · Retirements and contract ends', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Default: S = { name: 'HR · coming exits', render: () => <UpcomingExits rows={UPCOMING_EXITS} today={TODAY} onSet={() => {}} onExtend={() => {}} onConvert={() => {}} /> };
export const ViewOnly: S = { name: 'HR · view only (no change key)', render: () => <UpcomingExits rows={UPCOMING_EXITS} today={TODAY} /> };
export const Empty: S = { name: '· nothing coming', render: () => <UpcomingExits rows={[]} today={TODAY} onSet={() => {}} /> };
export const Loading: S = { name: '· loading', render: () => <UpcomingExits rows={[]} today={TODAY} state="loading" /> };
export const LoadError: S = { name: '· error', render: () => <UpcomingExits rows={[]} today={TODAY} state="error" onRetry={() => {}} /> };

// Set, extend or end a contract (People › Retirements and contract ends): the live dialog.
const contract = (ask: Parameters<typeof ContractDialog>[0]['ask'], onSave: Parameters<typeof ContractDialog>[0]['onSave'] = ok) => <ContractDialog ask={ask} people={PERSON_CHOICES} types={JOINER_PLACES.employmentTypes} today={TODAY_KEY} onClose={() => undefined} onSave={onSave} />;
export const SetContract: S = { name: 'Set a contract end · open (choose the person)', render: () => contract({ employeeId: null, action: 'set' }) };
export const SetContractFilled: S = { name: 'Set a contract end · filled', render: () => contract({ employeeId: null, action: 'set' }), play: play(pick('Person', /Sana Menon/), date('Contract ends on', '15 Dec 2026'), type(/^Reason/, 'Fixed-term contract for the Diwali season')) };
export const ExtendContract: S = { name: 'Extend the contract · for one person', render: () => contract({ employeeId: 'e-imran', action: 'extend' }) };
export const MakePermanent: S = { name: 'Make permanent · new employment type', render: () => contract({ employeeId: 'e-imran', action: 'convert' }), play: play(pick('New employment type', 'Permanent')) };
export const ContractMissing: S = { name: 'Set a contract end · Save pressed with nothing filled', render: () => contract({ employeeId: null, action: 'set' }), play: play(press('Save')) };
export const ContractFailed: S = { name: 'Extend the contract · the server refuses', render: () => contract({ employeeId: 'e-imran', action: 'extend' }, fails('The new end is after the 3-year limit for fixed-term contracts.')), play: play(date('Contract ends on', '31 Mar 2027'), type(/^Reason/, 'Project extended to March'), press('Save')) };
