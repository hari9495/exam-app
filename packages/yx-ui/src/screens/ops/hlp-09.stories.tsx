import type { Meta, StoryObj } from '@storybook/react-vite';
import { EthicsDeskScreen } from './cases';
import { WB_QUEUE } from './cases-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Helpdesk/HLP-09 · Ethics desk', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Queue: S = { name: 'Whistleblower queue', render: () => <EthicsDeskScreen rows={WB_QUEUE} today={TODAY} /> };
export const RouteToChair: S = { name: 'Route to audit committee chair', render: () => <EthicsDeskScreen rows={WB_QUEUE} today={TODAY} routeId="WB-0011" /> };
export const Empty: S = { render: () => <EthicsDeskScreen rows={[]} today={TODAY} state="empty" /> };
export const Loading: S = { render: () => <EthicsDeskScreen rows={WB_QUEUE} today={TODAY} state="loading" /> };
export const Error: S = { render: () => <EthicsDeskScreen rows={WB_QUEUE} today={TODAY} state="error" /> };
export const NotEthicsOfficer: S = { name: 'Not the ethics officer (shows Not found)', render: () => <EthicsDeskScreen rows={WB_QUEUE} today={TODAY} member={false} /> };
