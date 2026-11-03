import type { Meta, StoryObj } from '@storybook/react-vite';
import { WallScreen } from './reports';
import { WALL } from './report-data';

// The wall screen (/yx/wall/[org]/[token]). The report tabs moved into HLP-05 SLA dashboard (Helpdesk design wiring).
const meta: Meta = { title: 'Screens/Service desk/Reports (HLP-05)', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Wall: S = { name: 'Wall screen (TV)', render: () => <WallScreen state="ready" wall={WALL} /> };
export const WallOff: S = { name: 'Wall screen · switched off', render: () => <WallScreen state="not-found" wall={null} /> };
