import type { Meta, StoryObj } from '@storybook/react-vite';
import { ClaimReviewScreen } from './expenses';
import { MY_CLAIMS } from './expenses-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Expenses/EXP-03 · Claim review', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Manager: S = { name: 'Manager review · receipt beside lines', render: () => <ClaimReviewScreen claim={MY_CLAIMS[0]} today={TODAY} selected="l2" /> };
export const Reduce: S = { name: 'Reduce with reason', render: () => <ClaimReviewScreen claim={MY_CLAIMS[0]} today={TODAY} reducing="l2" /> };
export const ReasonMissing: S = { name: 'Reduce · reason missing', render: () => <ClaimReviewScreen claim={MY_CLAIMS[0]} today={TODAY} reducing="l2" reasonMissing /> };
export const FinanceAudit: S = { name: 'Finance audit step', render: () => <ClaimReviewScreen claim={MY_CLAIMS[0]} today={TODAY} persona="fin" selected="l3" /> };
