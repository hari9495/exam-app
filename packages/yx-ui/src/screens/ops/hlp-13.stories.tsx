import type { Meta, StoryObj } from '@storybook/react-vite';
import { CollectiveDisputeScreen } from './cases-more';
import { CONCILIATION, DEMANDS } from './cases-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Helpdesk/HLP-13 · Collective dispute / settlement', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const members = [
  { name: 'Harish Bhat', role: 'IR lead (owner)', access: 'full' },
  { name: 'Lakshmi Venkatesan', role: 'HR', access: 'full' },
  { name: 'Adv. Rohini Kamath', role: 'Legal counsel', access: 'full', external: true },
];

export const Conciliation: S = { name: 'Conciliation in progress', render: () => <CollectiveDisputeScreen demands={DEMANDS} stages={CONCILIATION} members={members} today={TODAY} /> };
export const Signed: S = { name: 'Settlement signed · send to payroll arrears', render: () => <CollectiveDisputeScreen demands={DEMANDS} stages={CONCILIATION} members={members} today={TODAY} stage="signed" /> };
export const NonMember: S = { name: 'Not a case member (shows Not found)', render: () => <CollectiveDisputeScreen demands={DEMANDS} stages={CONCILIATION} members={members} today={TODAY} member={false} /> };
