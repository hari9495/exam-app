import type { Meta, StoryObj } from '@storybook/react-vite';
import { VisitorKioskScreen } from './visitors';
import { VISITS } from './visitors-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Visitors/VIS-03 · Visitor kiosk', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const v = VISITS[3];

export const Welcome: S = { render: () => <VisitorKioskScreen visit={v} today={TODAY} /> };
export const Details: S = { name: 'Walk-in details', render: () => <VisitorKioskScreen step="details" visit={v} today={TODAY} /> };
export const Photo: S = { render: () => <VisitorKioskScreen step="photo" visit={v} today={TODAY} /> };
export const Notice: S = { name: 'Notice acknowledgement', render: () => <VisitorKioskScreen step="notice" visit={v} today={TODAY} /> };
export const Waiting: S = { name: 'Waiting for host', render: () => <VisitorKioskScreen step="waiting" visit={v} today={TODAY} /> };
export const Badge: S = { name: 'Badge and QR', render: () => <VisitorKioskScreen step="badge" visit={v} today={TODAY} /> };
export const SeeReception: S = { name: 'See reception (blocked or problem)', render: () => <VisitorKioskScreen step="see-reception" visit={v} today={TODAY} /> };
export const Rejected: S = { name: 'Host declined', render: () => <VisitorKioskScreen step="rejected" visit={v} today={TODAY} /> };
