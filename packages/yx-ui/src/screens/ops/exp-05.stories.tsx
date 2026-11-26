import type { Meta, StoryObj } from '@storybook/react-vite';
import { AdvanceScreen } from './expenses';
import { ADVANCE, FOREX_ADVANCE, OLD_ADVANCE } from './expenses-data';
import { TODAY } from '../_kit/data';
import { OPEN_ADVANCE } from './expenses-live-samples';
import type { LiveAdvances } from './expenses-travel-live';

const meta: Meta = { title: 'Screens/Expenses/EXP-05 · Advance card + request', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const Ledger: S = { name: 'Balance ledger (settled by claim)', render: () => <AdvanceScreen advance={ADVANCE} today={TODAY} /> };
export const Overdue: S = { name: 'Overdue · recovery warning', render: () => <AdvanceScreen advance={OLD_ADVANCE} today={TODAY} /> };
export const FinanceRecovery: S = { name: 'Finance · recovery instalments', render: () => <AdvanceScreen advance={OLD_ADVANCE} today={TODAY} persona="fin" /> };
export const Forex: S = { name: 'Forex advance · exchange difference', render: () => <AdvanceScreen advance={{ ...ADVANCE, id: FOREX_ADVANCE.id, purpose: FOREX_ADVANCE.purpose }} today={TODAY} forex={FOREX_ADVANCE} persona="fin" /> };
export const Request: S = { name: 'Request an advance', render: () => <AdvanceScreen advance={ADVANCE} today={TODAY} requestOpen /> };
export const Phone: S = { name: 'Advances · phone', globals: PHONE, render: () => <AdvanceScreen device="phone" advance={OLD_ADVANCE} today={TODAY} /> };
export const PhoneRequest: S = { name: 'Request · phone', globals: PHONE, render: () => <AdvanceScreen device="phone" advance={ADVANCE} today={TODAY} requestOpen /> };
export const List: S = { name: 'Advances list · mine, waiting for me, finance', render: () => <AdvanceScreen advance={ADVANCE} today={TODAY} list /> };
// T2-B 67 (Expenses A6): the live list when the company switched advances off, and with a cap for the person's grade.
const liveList = (policy: LiveAdvances['policy']): LiveAdvances => ({ view: 'list', state: 'ready', onRetry: () => {}, mine: [OPEN_ADVANCE], approvals: [], payout: null, onRequest: async () => ({}), onRequestTrip: () => {}, onOpen: () => {}, policy });
export const AdvancesOff: S = { name: 'Advances list · switched off by the company (T2-B 67)', render: () => <AdvanceScreen live={liveList({ enabled: false, cap: null })} /> };
export const AdvancesCap: S = { name: 'Advances list · with the most one advance can be (T2-B 67)', render: () => <AdvanceScreen live={liveList({ enabled: true, cap: '25000.00' })} /> };
