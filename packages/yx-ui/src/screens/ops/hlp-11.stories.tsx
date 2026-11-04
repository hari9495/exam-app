import type { Meta, StoryObj } from '@storybook/react-vite';
import { PolicyAdminScreen } from './helpdesk';
import { ACK_BY_DEPT, PENDING_PEOPLE, POLICIES, POLICY_VERSIONS } from './helpdesk-data';
import { TODAY } from '../_kit/data';
import type { LivePolicyAdmin } from './helpdesk-policy-live';
import { PENDING, WAITING, adminPolicy, liveAdmin } from './helpdesk-policy-live-samples';

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

// States only the real records have (Helpdesk design wiring, HLP-11 live), drawn in the same layout as the stories
// above: the list of policies, a new policy, writing a version, the second person who publishes, the department
// drill-down and editing the audience.
const live = (over: Partial<LivePolicyAdmin> = {}) => <PolicyAdminScreen live={liveAdmin(over)} />;
const waiting = (mine: boolean) => adminPolicy({ open: { ...WAITING, writtenByMe: mine } });
export const PolicyList: S = { name: 'All policies', render: () => live({ policyId: null }) };
export const NoPolicies: S = { name: 'No policies yet', render: () => live({ policyId: null, policies: [] }) };
export const NewPolicy: S = { name: 'New policy', render: () => live({ policyId: null, start: { dialog: 'new' } }) };
export const NewPolicyTooEarly: S = { name: 'New policy · Make pressed with nothing filled', render: () => live({ policyId: null, start: { dialog: 'new', tooEarly: true } }) };
export const Write: S = { name: 'Write a new version (text, what changed, attachments)', render: () => live({ start: { tab: 'write' } }) };
export const WriteTooEarly: S = { name: 'Send to be published pressed with no “what changed”', render: () => live({ policy: adminPolicy({ open: { ...WAITING, status: 'draft', changeSummary: null, publishedBy: null } }), start: { tab: 'write', tooEarly: true } }) };
export const WaitingWriter: S = { name: 'Writer · waiting for a second person to publish', render: () => live({ policy: waiting(true) }) };
export const PublishLive: S = { name: 'Publisher · publish the waiting version', render: () => live({ policy: waiting(false), start: { dialog: 'publish' } }) };
export const PublishCounsel: S = { name: 'Publisher · counsel note to tick (HLP-14 draft)', render: () => live({ policy: adminPolicy({ open: { ...waiting(false).open!, counselNote: 'Law check covers general labour law only; Food and consumer goods rules are not checked yet; review with counsel' } }), start: { dialog: 'publish' } }) };
export const SendBack: S = { name: 'Publisher · send back with a note', render: () => live({ policy: waiting(false), start: { dialog: 'send-back' } }) };
export const SentBack: S = { name: 'Writer · sent back with the note', render: () => live({ policy: adminPolicy({ open: { ...WAITING, status: 'sent_back', sentBackNote: 'Name the gifts limit in rupees, not words.', writtenByMe: true } }), start: { tab: 'write' } }) };
export const PendingByDept: S = { name: 'Pending people · one department (drill-down)', render: () => live({ deptFilter: 'd-ops', pending: PENDING.filter((p) => p.departmentId === 'd-ops'), start: { tab: 'pending' } }) };
export const AudienceEdit: S = { name: 'Audience & method · change who it applies to', render: () => live({ start: { tab: 'audience' } }) };
export const NotPublished: S = { name: 'New policy · not published yet', render: () => live({ policy: adminPolicy({ current: null, versions: [], audience: 0, acknowledged: 0, overdue: 0, dueOn: null, ackVersion: null, byDept: [], open: { ...WAITING, number: 1, label: 'v1', status: 'draft', changeSummary: null, publishedBy: null } }) }) };
export const Loading: S = { render: () => live({ state: 'loading', policyId: null }) };
export const Error: S = { render: () => live({ state: 'error', policyId: null }) };
export const NoAccess: S = { name: 'No access', render: () => live({ state: 'no-access' }) };
