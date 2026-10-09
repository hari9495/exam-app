import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatutoryHubScreen } from './compliance';
import { ESI_SUPPLEMENTARY, HUB_ITEMS, REFUND_REQUEST } from './compliance-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Compliance/CMP-12 · Supplementary filing', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const pf = HUB_ITEMS[0];
const withEsi = HUB_ITEMS.map((i) => (i.id === 'esi-aug' ? { ...i, children: [ESI_SUPPLEMENTARY, REFUND_REQUEST] } : i));

export const ChildCards: S = { name: 'Child cards under the original month', render: () => <StatutoryHubScreen items={withEsi.slice(0, 2)} today={TODAY} /> };
export const PfSupplementary: S = { name: 'Supplementary ECR · interest and damages', render: () => <StatutoryHubScreen items={HUB_ITEMS} today={TODAY} openFiling={pf.children![0]} /> };
export const EsiPastPeriod: S = { name: 'ESI past-period contribution', render: () => <StatutoryHubScreen items={withEsi} today={TODAY} openFiling={ESI_SUPPLEMENTARY} /> };
export const ExcessRefund: S = { name: 'Excess remittance refund request', render: () => <StatutoryHubScreen items={withEsi} today={TODAY} openFiling={REFUND_REQUEST} /> };
