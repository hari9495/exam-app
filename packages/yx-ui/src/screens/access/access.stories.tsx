import type { Meta, StoryObj } from '@storybook/react-vite';
import { RolesAccessScreen } from './roles-access';
import { ProfileRequestsScreen } from './profile-requests';
import { EFFECTIVE, GRANTS, REQUESTS, ROLES, SCOPES, TEMPLATES, TODAY_ISO, USERS } from './data';

const meta: Meta = { title: 'Screens/People/Access and privacy', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const wait = (ms = 400) => new Promise<void>((r) => setTimeout(r, ms));
// Answer 795: a role nobody holds can be deleted.
const UNUSED = { id: 'r-recep', name: 'Reception', permissions: ['visitors.desk.manage', 'visitors.log.view'], confidential: false, companyWideOnly: [], grants: 0, assignedUsers: 0 };
const roles = (meId = 'u-admin', more: Partial<Parameters<typeof RolesAccessScreen>[0]> = {}) => (
  <RolesAccessScreen
    state="ready"
    users={USERS}
    roles={[...ROLES, UNUSED]}
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
    onDeleteRole={() => wait()}
    {...more}
  />
);
export const RolesAccess: S = { name: 'Roles & access · people, waiting, roles', render: () => roles() };
export const RolesAccessOther: S = { name: 'Roles & access · another admin decides', render: () => roles('u-other') };
export const RolesAccessDelete: S = { name: 'Roles & access · delete a role nobody holds', render: () => roles('u-admin', { initialView: 'roles', deletingRoleId: 'r-recep' }) };

export const Requests: S = { name: 'Identity and bank changes · payroll queue', render: () => <ProfileRequestsScreen state="ready" rows={REQUESTS} canDecide onApprove={() => wait()} onReject={() => wait()} onOpenProfile={() => {}} onProof={() => wait()} /> };
