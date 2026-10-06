import type { Meta, StoryObj } from '@storybook/react-vite';
import { PersonWorkspace, WorkAuthTab } from './record';
import { TODAY } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-45 · Work authorisations tab', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Default: S = { name: 'On the record (visa expiring, occupation differs)', render: () => <PersonWorkspace persona="hr" relation="other" today={TODAY} defaultTab="work-auth" international /> };
export const Empty: S = { name: '· empty', render: () => <div className="yx-screen"><WorkAuthTab rows={[]} today={TODAY} /></div> };
