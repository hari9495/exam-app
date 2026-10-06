import type { Meta, StoryObj } from '@storybook/react-vite';
import { PolicyAdminScreen } from './helpdesk';
import { ACK_BY_DEPT, PENDING_PEOPLE, POLICIES, POLICY_VERSIONS } from './helpdesk-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Helpdesk/HLP-11 · Policy admin', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const base = { policy: POLICIES[0], byDept: ACK_BY_DEPT, pendingPeople: PENDING_PEOPLE, versions: POLICY_VERSIONS, today: TODAY };

export const Acknowledgement: S = { name: 'Acknowledgement %', render: () => <PolicyAdminScreen {...base} /> };
export const Pending: S = { name: 'Pending people · remind', render: () => <PolicyAdminScreen {...base} tab="pending" /> };
export const Versions: S = { render: () => <PolicyAdminScreen {...base} tab="versions" /> };
export const Audience: S = { name: 'Audience & method', render: () => <PolicyAdminScreen {...base} tab="audience" /> };
export const PublishReack: S = { name: 'Publish new version · re-acknowledge', render: () => <PolicyAdminScreen {...base} publishOpen /> };
export const AllDone: S = { name: 'Everyone acknowledged', render: () => <PolicyAdminScreen {...base} policy={POLICIES[2]} pendingPeople={[]} tab="pending" /> };
