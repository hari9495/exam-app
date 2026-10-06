import type { Meta, StoryObj } from '@storybook/react-vite';
import { RewardsScreen } from './engage-recognition';
import { LEDGER, REWARDS } from './engage-data';
import { d } from './perf-data';

const meta: Meta = { title: 'Screens/Engage/ENG-10 · Rewards', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };
const base = { balance: 2410, expiring: { points: 150, on: d(31, 11) }, catalogue: REWARDS, ledger: LEDGER };

export const Catalogue: S = { name: 'Balance and catalogue', render: () => <RewardsScreen {...base} giftsThisYear={500} /> };
export const RedeemTaxFree: S = { name: 'Redeem within tax-free limit', render: () => <RewardsScreen {...base} giftsThisYear={500} redeemId="r2" /> };
export const RedeemTaxable: S = { name: 'Redeem above ₹5,000 (taxable perquisite)', render: () => <RewardsScreen {...base} balance={7200} giftsThisYear={1500} redeemId="r3" /> };
export const Phone: S = { name: 'Phone', globals: PHONE, render: () => <RewardsScreen {...base} device="phone" giftsThisYear={500} /> };
