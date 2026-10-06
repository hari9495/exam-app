import type { Meta, StoryObj } from '@storybook/react-vite';
import { RolesAccessScreen } from './roles-access';
import { ProfileScreen } from './profile';
import { ProfileRequestsScreen } from './profile-requests';
import { AccessLogScreen } from './access-log';
import { ACCESS_LOG, EFFECTIVE, GRANTS, PROFILE_MANAGER, PROFILE_SELF, REQUESTS, ROLES, SCOPES, TEMPLATES, TODAY_ISO, USERS } from './data';

const meta: Meta = { title: 'Screens/People/Access and privacy', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const wait = (ms = 400) => new Promise<void>((r) => setTimeout(r, ms));
const STATES = [
  { code: 'IN-KA', name: 'Karnataka' },
  { code: 'IN-TN', name: 'Tamil Nadu' },
];

const roles = (meId = 'u-admin') => (
  <RolesAccessScreen
    state="ready"
    users={USERS}
    roles={ROLES}
    templates={TEMPLATES}
    grants={GRANTS}
    scopes={SCOPES}
    meId={meId}
    today={TODAY_ISO}
    loadEffective={() => wait().then(() => EFFECTIVE)}
    onGrant={() => wait()}
    onApprove={() => wait()}
    onReject={() => wait()}
    onRevoke={() => wait()}
    onFromTemplate={() => wait()}
  />
);
export const RolesAccess: S = { name: 'Roles & access · people, waiting, roles', render: () => roles() };
export const RolesAccessOther: S = { name: 'Roles & access · another admin decides', render: () => roles('u-other') };

const profile = (p = PROFILE_SELF) => (
  <ProfileScreen
    state="ready"
    profile={p}
    states={STATES}
    requests={p.self ? REQUESTS.filter((r) => r.employeeId === p.employeeId) : []}
    onSavePersonal={() => wait()}
    onReveal={(field) => wait().then(() => (field === 'pan' ? 'BQRPR4821K' : '50100234567812'))}
    onRequestChange={() => wait()}
    onCancelRequest={() => wait()}
    onOpenHistory={() => {}}
  />
);
export const ProfileSelf: S = { name: 'Profile · own record (personal, masked identity, change)', render: () => profile() };
export const ProfileManager: S = { name: 'Profile · manager (no Personal, no identity)', render: () => profile(PROFILE_MANAGER) };

export const Requests: S = { name: 'Identity and bank changes · payroll queue', render: () => <ProfileRequestsScreen state="ready" rows={REQUESTS} canDecide onApprove={() => wait()} onReject={() => wait()} onOpenProfile={() => {}} /> };
export const AccessLog: S = { name: 'Who accessed my data', render: () => <AccessLogScreen state="ready" log={ACCESS_LOG} /> };
export const AccessLogOff: S = { name: 'Who accessed my data · turned off', render: () => <AccessLogScreen state="ready" log={{ enabled: false, entries: [] }} /> };
