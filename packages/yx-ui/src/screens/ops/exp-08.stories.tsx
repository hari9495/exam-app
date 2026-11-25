import type { Meta, StoryObj } from '@storybook/react-vite';
import { CardImportScreen } from './expenses-finance';
import { ExpensesHomeScreen } from './expenses';
import { CARD_LINES, MY_CLAIMS, TO_PAY } from './expenses-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Expenses/EXP-08 · Card statement import & matching', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const Upload: S = { name: 'Upload statement', render: () => <CardImportScreen lines={CARD_LINES} current="upload" /> };
export const Map: S = { name: 'Check columns', render: () => <CardImportScreen lines={CARD_LINES} current="map" /> };
export const Match: S = { name: 'Auto-match results', render: () => <CardImportScreen lines={CARD_LINES} /> };
export const Resolve: S = { render: () => <CardImportScreen lines={CARD_LINES} current="resolve" /> };
export const EmployeePhone: S = { name: 'Employee explains lines · phone', globals: PHONE, render: () => <CardImportScreen lines={CARD_LINES} device="phone" /> };
// Round 3 (founder answer 3 Nov 2026, option A: one import for any bank): the states the live screen needs.
const LINKLESS = CARD_LINES.map((l) => (l.id === 'c5' ? { ...l, employee: 'Card ••4417 · not linked' } : l));
const DONE = CARD_LINES.map((l) => ({ ...l, match: 'Matched' as const, to: l.to || 'Asked the employee' }));
export const FirstBank: S = { name: 'Check columns · first statement from a bank', render: () => <CardImportScreen lines={CARD_LINES} current="map" variant="first-bank" /> };
export const RowsToFix: S = { name: 'Check columns · rows to fix (nothing imported)', render: () => <CardImportScreen lines={CARD_LINES} current="map" variant="rows-to-fix" /> };
export const Duplicate: S = { name: 'Check columns · statement already imported', render: () => <CardImportScreen lines={CARD_LINES} current="map" variant="duplicate" /> };
export const NothingToMatch: S = { name: 'Auto-match results · nothing to match', render: () => <CardImportScreen lines={DONE} variant="nothing" /> };
export const LinkCard: S = { name: 'Auto-match results · link a card to an employee', render: () => <CardImportScreen lines={LINKLESS} variant="link-card" /> };
export const ChangeMatch: S = { name: 'Auto-match results · choose another claim line', render: () => <CardImportScreen lines={CARD_LINES} variant="change-match" /> };
export const NoAccess: S = { name: 'No access (not finance)', render: () => <CardImportScreen lines={CARD_LINES} variant="no-access" /> };
export const EmployeeDesk: S = { name: 'Employee explains lines · computer', render: () => <CardImportScreen lines={CARD_LINES} variant="employee-desk" /> };
export const EmployeeHome: S = { name: 'Employee home · card lines to explain', render: () => <ExpensesHomeScreen claims={MY_CLAIMS} toPay={TO_PAY} today={TODAY} cardLines={2} /> };
