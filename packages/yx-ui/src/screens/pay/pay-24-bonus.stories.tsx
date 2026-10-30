import type { Meta, StoryObj } from '@storybook/react-vite';
import { BonusComputationScreen } from './offcycle';

const meta: Meta<typeof BonusComputationScreen> = { title: 'Screens/Pay/PAY-24 · Bonus computation', component: BonusComputationScreen, render: (args) => <BonusComputationScreen {...args} />, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof BonusComputationScreen>;

export const Minimum: S = { name: 'Compute at 8.33%' };
export const Higher: S = { name: 'Compute at 20%', args: { pct: 20 } };
export const Surplus: S = { name: 'Allocable surplus step', args: { step: 'surplus' } };
export const Approve: S = { name: 'Approve and pay', args: { view: 'submitted' } };
export const Empty: S = { name: 'Empty · not worked out yet', args: { view: 'empty' } };
export const TooEarly: S = { name: 'Send for approval · pressed too early (field error)', args: { tooEarly: true } };
export const Refused: S = { name: 'Approve · refused by the server (own bonus)', args: { view: 'submitted', refused: true } };
export const Approved: S = { name: 'Approved · Form C register ready to download', args: { view: 'approved' } };
/** Founder 30 Oct 2026 (last 10, item 2): Form C as a PDF (letterhead, totals, signature) or a spreadsheet. */
export const FormCChoices: S = { name: 'Approved · Download Form C: PDF or spreadsheet', args: { view: 'approved', formCOpen: true } };
/** Founder 30 Oct 2026 (last 10, item 1): the company's eligibility rule shows as a note above the table. */
export const RateRuleHighest: S = { name: 'Compute · eligibility on the highest rate in the month', args: { rateOn: 'highest_in_month' } };
export const RateRuleFirstDay: S = { name: "Compute · eligibility on the month's first day", args: { rateOn: 'first_day' } };
export const Sent: S = { name: 'Sent to the off-cycle bonus run', args: { view: 'sent' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const ErrorState: S = { name: 'Error', args: { state: 'error' } };
