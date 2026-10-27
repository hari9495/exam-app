import type { Meta, StoryObj } from '@storybook/react-vite';
import { RolesAccessScreen } from './roles-access';
import { ProfileRequestsScreen } from './profile-requests';
import { AccessLogScreen } from './access-log';
import { ACCESS_LOG, EFFECTIVE, GRANTS, REQUESTS, ROLES, SCOPES, TEMPLATES, TODAY_ISO, USERS } from './data';

const meta: Meta = { title: 'Screens/People/Access and privacy', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const wait = (ms = 400) => new Promise<void>((r) => setTimeout(r, ms));
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
    onSystemAdmin={() => wait()}
  />
);
export const RolesAccess: S = { name: 'Roles & access · people, waiting, roles', render: () => roles() };
export const RolesAccessOther: S = { name: 'Roles & access · another admin decides', render: () => roles('u-other') };

export const Requests: S = { name: 'Identity and bank changes · payroll queue', render: () => <ProfileRequestsScreen state="ready" rows={REQUESTS} canDecide onApprove={() => wait()} onReject={() => wait()} onOpenProfile={() => {}} onProof={() => wait()} /> };
export const AccessLog: S = { name: 'Who accessed my data', render: () => <AccessLogScreen state="ready" log={ACCESS_LOG} /> };
export const AccessLogOff: S = { name: 'Who accessed my data · turned off', render: () => <AccessLogScreen state="ready" log={{ enabled: false, entries: [] }} /> };
