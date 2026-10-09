import type { Meta, StoryObj } from '@storybook/react-vite';
import { PersonRolesPanel, PersonWorkspace } from './record';
import { TODAY } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-35 · Person roles panel', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const OnRecord: S = { name: 'On the person record', render: () => <PersonWorkspace persona="hr" relation="other" today={TODAY} panel="roles" /> };
export const Panel: S = { name: 'Panel alone (contract worker to employee, nominee)', render: () => <div className="yx-screen"><PersonRolesPanel /></div> };
