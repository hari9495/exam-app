import type { Meta, StoryObj } from '@storybook/react-vite';
import { PayTab, PersonWorkspace, SAMPLE_PAY } from './record';
import { ARJUN, ARJUN_CUSTOM_VALUES, EMPLOYEE_FIELDS, d, TODAY } from './people-data';
import { CustomFieldsDrawer, EmployeeFieldsScreen } from './custom-fields';
import { ContactsDrawer, FamilyDrawer } from './family';
import { CancelDialog, ChangeDialog, PersonalDialog } from '../access';
import { PROFILE_SELF, REQUESTS } from '../access/data';
import { fails, ok, pick, play, press, type } from './popup-play';

const meta: Meta = { title: 'Screens/People/PPL-03 · Person record', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const HrOverview: S = { name: 'HR · overview (masked IDs with audited reveal)', render: () => <PersonWorkspace persona="hr" relation="other" today={TODAY} /> };
export const EmployeeSelf: S = { name: 'Employee · own record', render: () => <PersonWorkspace persona="emp" relation="self" today={TODAY} /> };
export const ManagerTeam: S = { name: 'Manager · team member (Personal hidden)', render: () => <PersonWorkspace persona="mgr" relation="team" today={TODAY} /> };
export const Job: S = { name: 'Job tab', render: () => <PersonWorkspace persona="hr" relation="other" today={TODAY} defaultTab="job" /> };
export const PayHr: S = { name: 'Pay tab · HR', render: () => <PersonWorkspace persona="hr" relation="other" today={TODAY} defaultTab="pay" /> };
export const PayGated: S = { name: 'Pay tab · manager without salary grant', render: () => <PersonWorkspace persona="mgr" relation="team" today={TODAY} defaultTab="pay" /> };
export const PayGrant: S = { name: 'Pay tab · manager with salary grant', render: () => <PersonWorkspace persona="mgr" relation="team" payGrant today={TODAY} defaultTab="pay" /> };
export const PayShown: S = { name: 'Pay tab · HR after Show pay', render: () => <PayTab pay={SAMPLE_PAY} name={ARJUN.name} persona="hr" self={false} access={null} /> };
export const PaySelf: S = { name: 'Pay tab · employee own pay (request a bank change)', render: () => <PayTab pay={SAMPLE_PAY} name={ARJUN.name} persona="emp" self access={null} onRequestChange={() => undefined} onBankAbroad={() => undefined} /> };
export const PayNewJoiner: S = { name: 'Pay tab · new joiner (no payslip, no tax regime yet)', render: () => <PayTab pay={{ ...SAMPLE_PAY, next: undefined, lastNet: null, taxRegime: null }} name={ARJUN.name} persona="hr" self={false} access={null} /> };
export const PayShowError: S = { name: 'Pay tab · Show pay failed', render: () => <PayTab pay={{ kind: 'ask', onShow: () => undefined, error: 'Pay could not be shown. Try again.' }} name={ARJUN.name} persona="hr" self={false} access={null} /> };
export const Time: S = { name: 'Time tab', render: () => <PersonWorkspace persona="hr" relation="other" today={TODAY} defaultTab="time" /> };
export const Documents: S = { name: 'Documents tab · HR verify', render: () => <PersonWorkspace persona="hr" relation="other" today={TODAY} defaultTab="documents" /> };
export const DocumentsManager: S = { name: 'Documents tab · manager (restricted classes hidden)', render: () => <PersonWorkspace persona="mgr" relation="team" today={TODAY} defaultTab="documents" /> };
export const Performance: S = { name: 'Performance tab', render: () => <PersonWorkspace persona="mgr" relation="team" today={TODAY} defaultTab="performance" /> };
export const Learning: S = { name: 'Learning tab', render: () => <PersonWorkspace persona="emp" relation="self" today={TODAY} defaultTab="learning" /> };
export const Assets: S = { name: 'Assets tab', render: () => <PersonWorkspace persona="hr" relation="other" today={TODAY} defaultTab="assets" /> };
export const History: S = { name: 'History tab (timeline, corrections, roles)', render: () => <PersonWorkspace persona="hr" relation="other" today={TODAY} defaultTab="history" /> };
export const AsOfPast: S = { name: 'History · as on 1 Jul 2024', render: () => <PersonWorkspace persona="hr" relation="other" today={TODAY} defaultTab="history" defaultAsOf={d(2024, 7, 1)} /> };
export const AsOfFuture: S = { name: 'History · as on 1 Oct 2026 (scheduled)', render: () => <PersonWorkspace persona="hr" relation="other" today={TODAY} defaultTab="history" defaultAsOf={d(2026, 10, 1)} /> };
export const Loading: S = { name: '· loading', render: () => <PersonWorkspace persona="hr" relation="other" today={TODAY} state="loading" /> };
export const LoadError: S = { name: '· error', render: () => <PersonWorkspace persona="hr" relation="other" today={TODAY} state="error" /> };
export const NotFound: S = { name: '· not found (restricted or missing)', render: () => <PersonWorkspace persona="mgr" relation="other" today={TODAY} state="not-found" /> };
// Family and nominees (founder 22 Oct 2026): HR edits family and nominations together; the person edits emergency contacts.
export const EditFamily: S = {
  name: 'HR · edit family and nominees',
  render: () => <FamilyDrawer name="Arjun Kulkarni" initial={{ members: ARJUN.family, nominations: ARJUN.nominations }} onSave={async () => undefined} onClose={() => undefined} />,
};
export const EditContacts: S = {
  name: 'Employee · edit emergency contacts',
  render: () => <ContactsDrawer initial={ARJUN.emergency} onSave={async () => undefined} onClose={() => undefined} />,
};
// Additional details (P18 custom fields): HR edits each field with its own input; settings define them with a class.
export const EditCustomFields: S = {
  name: 'HR · edit additional details',
  render: () => <CustomFieldsDrawer fields={ARJUN_CUSTOM_VALUES} onSave={async () => undefined} onClose={() => undefined} />,
};
export const CustomFieldsSettings: S = {
  name: 'Settings · custom fields',
  render: () => <EmployeeFieldsScreen state="ready" fields={EMPLOYEE_FIELDS} canManage onCreate={async () => undefined} onUpdate={async () => undefined} onArchive={async () => undefined} />,
};
export const CustomFieldsSettingsEmpty: S = {
  name: 'Settings · custom fields (none yet)',
  render: () => <EmployeeFieldsScreen state="ready" fields={[]} canManage onCreate={async () => undefined} onUpdate={async () => undefined} onArchive={async () => undefined} />,
};

// The record's own dialogs: personal details (edited at once), identity or bank change (sent for approval), withdraw.
const STATES = [{ code: 'IN-KA', name: 'Karnataka' }, { code: 'IN-TN', name: 'Tamil Nadu' }, { code: 'IN-MH', name: 'Maharashtra' }];
export const EditPersonal: S = { name: 'Personal details · open (filled from the record)', render: () => <PersonalDialog initial={PROFILE_SELF.personal!} states={STATES} onSave={ok} onClose={() => undefined} /> };
export const EditPersonalFailed: S = { name: 'Personal details · the server refuses', render: () => <PersonalDialog initial={PROFILE_SELF.personal!} states={STATES} onSave={fails('Enter a personal email like name@example.com.')} onClose={() => undefined} />, play: play(press('Save')) };
const change = (onRequest: Parameters<typeof ChangeDialog>[0]['onRequest'] = ok) => <ChangeDialog pending={['bank_reimbursement']} onRequest={onRequest} onClose={() => undefined} />;
const fillBank = [pick('What changes', 'Salary bank account'), type(/^Account holder/, 'Divya Raghunathan'), type(/^Account number/, '50100234567812'), type(/^IFSC/, 'HDFC0001234'), type(/^Reason/, 'Moved my salary to a new HDFC account')];
export const RequestChange: S = { name: 'Identity or bank change · open', render: () => change() };
export const RequestChangeFilled: S = { name: 'Identity or bank change · new salary account filled', render: () => change(), play: play(...fillBank) };
export const RequestChangeMissing: S = { name: 'Identity or bank change · Send pressed with nothing filled', render: () => change(), play: play(press('Send for approval')) };
export const RequestChangeInvalid: S = { name: 'Identity or bank change · PAN in the wrong form', render: () => change(), play: play(pick('What changes', 'PAN'), type(/^New PAN/, 'BRGPR7712'), press('Send for approval')) };
export const RequestChangeFailed: S = { name: 'Identity or bank change · the server refuses', render: () => change(fails('A salary bank account change is already waiting.')), play: play(...fillBank, press('Send for approval')) };
const withdraw = (onCancel: Parameters<typeof CancelDialog>[0]['onCancel'] = ok) => <CancelDialog request={REQUESTS[0]} onCancel={onCancel} onClose={() => undefined} />;
export const WithdrawChange: S = { name: 'Withdraw a waiting change · open', render: () => withdraw() };
export const WithdrawChangeMissing: S = { name: 'Withdraw a waiting change · no reason', render: () => withdraw(), play: play(press('Withdraw')) };
export const WithdrawChangeFailed: S = { name: 'Withdraw a waiting change · the server refuses', render: () => withdraw(fails('HR already approved this change.')), play: play(type(/^Reason/, 'Typed the wrong account'), press('Withdraw')) };
