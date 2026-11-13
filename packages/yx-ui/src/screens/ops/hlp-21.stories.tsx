import type { Meta, StoryObj } from '@storybook/react-vite';
import { fails, ok, play, press } from '../_kit/story-play';
import { BusinessAppsScreen, type BusinessApp, type BusinessAppsProps } from '../desk/business-apps';
import { OpsDesk } from './ops-kit';

// Helpdesk plan item 3: the company's business applications and their owners. Access is asked for in the service
// catalogue; the step "the owner of the application in the form" sends it to that owner (or the desk's admins).

const meta: Meta = { title: 'Screens/Helpdesk/HLP-21 · Business applications', component: BusinessAppsScreen, parameters: { layout: 'fullscreen' }, decorators: [(Story) => <OpsDesk area="helpdesk" active="Applications"><Story /></OpsDesk>] };
export default meta;
type S = StoryObj;

const APPS: BusinessApp[] = [
  { id: 'a1', name: 'Tally Prime', description: 'Accounts and GST returns', ownerUserId: 'u-meera', owner: 'Meera Iyer', status: 'active', version: 2, canEdit: true },
  { id: 'a2', name: 'Salesforce', description: 'Customer accounts and deals', ownerUserId: 'u-arjun', owner: 'Arjun Kulkarni', status: 'active', version: 1, canEdit: true },
  { id: 'a3', name: 'Zoho People', description: null, ownerUserId: 'u-meera', owner: 'Meera Iyer', status: 'active', version: 1, canEdit: true },
  { id: 'a4', name: 'Old intranet', description: 'Replaced by YukthiX', ownerUserId: 'u-farah', owner: 'Farah Khan', status: 'retired', version: 4, canEdit: true },
];
const people = async () => [
  { id: 'u-meera', label: 'Meera Iyer', detail: 'Finance' },
  { id: 'u-arjun', label: 'Arjun Kulkarni', detail: 'Sales' },
];
const screen = (over: Partial<BusinessAppsProps> = {}) => <BusinessAppsScreen state="ready" apps={APPS} canEdit onSave={ok} onPickPeople={people} {...over} />;

export const Apps: S = { name: 'Applications and their owners', render: () => screen() };
export const AppNew: S = { name: 'New application', render: () => screen({ start: { edit: 'new' } }) };
export const AppNewMissing: S = { name: 'Save pressed with nothing filled', render: () => screen({ start: { edit: 'new' } }), play: play(press('Save application')) };
export const AppEdit: S = { name: 'Change the owner, or retire it', render: () => screen({ start: { edit: 'a1' } }) };
export const AppSaveFailed: S = { name: 'Saving refused (name already on the list)', render: () => screen({ start: { edit: 'new' }, onSave: fails('An application with that name is already on the list.') }) };
export const AppsReadOnly: S = { name: 'Desk staff: read only', render: () => screen({ canEdit: false, apps: APPS.map((a) => ({ ...a, canEdit: false })) }) };
export const AppsEmpty: S = { name: 'No applications yet', render: () => screen({ apps: [] }) };
export const AppsLoading: S = { name: 'Loading', render: () => screen({ state: 'loading' }) };
export const AppsError: S = { name: 'Could not load', render: () => screen({ state: 'error', onRetry: () => undefined }) };
