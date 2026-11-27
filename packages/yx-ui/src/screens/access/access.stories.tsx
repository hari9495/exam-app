import type { Meta, StoryObj } from '@storybook/react-vite';
import { RolesAccessScreen } from './roles-access';
import { ProfileRequestsScreen } from './profile-requests';
import { ACCESS_REQUESTS, EFFECTIVE, GRANTS, REQUESTS, ROLES, SCOPES, TEMPLATES, TODAY_ISO, USERS } from './data';

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
export const RolesAccessRequests: S = { name: 'Roles & access · requests from no-access pages (946)', render: () => roles('u-admin', { initialView: 'requests', requests: ACCESS_REQUESTS, maxDays: 30, onApproveRequest: () => wait(), onRefuseRequest: () => wait() }) };
// Answers 2426 and 2430 (from /v2): hiring field access and staff groups.
const HIRING_FIELDS = {
  config: { candidate: { panel: { email: 'hidden' as const, phone: 'hidden' as const } }, job: { panel: { salaryMin: 'hidden' as const, salaryMax: 'hidden' as const }, hiring_manager: { headcount: 'readonly' as const } } },
  fields: { candidate: ['email', 'phone'], job: ['salaryMin', 'salaryMax', 'salaryCurrency', 'headcount', 'department', 'fitCriteria', 'fitRubric'] },
  roles: ['recruiter', 'panel', 'hiring_manager'],
  onSave: () => wait(),
};
const GROUPS = {
  groups: [
    { id: 'g1', name: 'Plant recruiters', description: 'Hosur and Mysuru shop-floor hiring', members: [{ userId: 'u-admin', name: 'Lakshmi Venkatesan', email: 'hr@demo-org.test' }, { userId: 'u-other', name: 'Ramesh Iyer', email: 'admin@demo-org.test' }] },
    { id: 'g2', name: 'Campus drive panel', description: null, members: [] },
  ],
  people: USERS.map((u) => ({ value: u.id, label: u.name ?? u.email })),
  onCreate: () => wait(),
  onUpdate: () => wait(),
  onMembers: () => wait(),
  onDelete: () => wait(),
};
export const RolesAccessHiringFields: S = { name: 'Roles & access · hiring field access (2426)', render: () => roles('u-admin', { initialView: 'fields', hiringFields: HIRING_FIELDS, groups: GROUPS }) };
export const RolesAccessGroups: S = { name: 'Roles & access · staff groups (2430)', render: () => roles('u-admin', { initialView: 'groups', hiringFields: HIRING_FIELDS, groups: GROUPS }) };
// T2-G 42 (answer 2745): a group worked out from rules beside the hand-picked ones.
const RULE_CHOICES = {
  legalEntityIds: [{ value: 'le1', label: 'Kaveri Foods Pvt Ltd' }],
  locationIds: [{ value: 'l1', label: 'Hosur plant' }, { value: 'l2', label: 'Mysuru plant' }, { value: 'l3', label: 'Bengaluru office' }],
  departmentIds: [{ value: 'd1', label: 'Operations' }, { value: 'd2', label: 'Quality' }],
  gradeIds: [{ value: 'gr1', label: 'M1' }, { value: 'gr2', label: 'S2' }],
  employmentTypeIds: [{ value: 'et1', label: 'Permanent' }, { value: 'et2', label: 'Fixed-term' }],
};
const RULE_GROUPS = { ...GROUPS, ruleChoices: RULE_CHOICES, groups: [...GROUPS.groups, { id: 'g3', name: 'Hosur shop floor', description: 'For safety notices', rules: { legalEntityIds: [], locationIds: ['l1'], departmentIds: ['d1', 'd2'], gradeIds: [], employmentTypeIds: [] }, members: [{ userId: 'u-other', name: 'Ramesh Iyer', email: 'admin@demo-org.test' }] }] };
export const RolesAccessRuleGroups: S = { name: 'Roles & access · groups from rules (T2-G 42)', render: () => roles('u-admin', { initialView: 'groups', groups: RULE_GROUPS }) };
export const RolesAccessGroupsEmpty: S = { name: 'Roles & access · staff groups, none yet', render: () => roles('u-admin', { initialView: 'groups', groups: { ...GROUPS, groups: [] } }) };
export const RolesAccessDelete: S = { name: 'Roles & access · delete a role nobody holds', render: () => roles('u-admin', { initialView: 'roles', deletingRoleId: 'r-recep' }) };

export const Requests: S = { name: 'Identity and bank changes · payroll queue', render: () => <ProfileRequestsScreen state="ready" rows={REQUESTS} canDecide onApprove={() => wait()} onReject={() => wait()} onOpenProfile={() => {}} onProof={() => wait()} /> };
