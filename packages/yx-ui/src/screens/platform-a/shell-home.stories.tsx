import type { Meta, StoryObj } from '@storybook/react-vite';
import { d } from './platform-data';
import {
  AccessStatePhone, AccessStateScreen, AppShellScreen, CommandPaletteScreen, MobileSearchScreen, RoleHomeScreen, SearchResultsScreen, SettingsHomeScreen, type HomeData, type SearchHit,
} from './shell-home';

const meta: Meta = { title: 'Screens/Platform/Shell & homes', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

/* PLT-01 */
export const PLT01Shell: S = { name: 'PLT-01 · App shell · HR (all entities, period)', render: () => <AppShellScreen persona="hr" /> };
export const PLT01Employee: S = { name: 'PLT-01 · App shell · employee rail', render: () => <AppShellScreen persona="employee" /> };
export const PLT01Entity: S = { name: 'PLT-01 · App shell · one entity, locked period', render: () => <AppShellScreen persona="finance" entity="kf-tn" period="2026-08" /> };
export const PLT01Bell: S = { name: 'PLT-01 · App shell · bell open', render: () => <AppShellScreen persona="manager" bellOpen /> };
export const PLT01Collapsed: S = { name: 'PLT-01 · App shell · panel collapsed', render: () => <AppShellScreen persona="admin" panelCollapsed /> };
export const PLT01Phone: S = { name: 'PLT-01 · App shell · phone', ...phone, render: () => <AppShellScreen persona="employee" /> };

/* PLT-02 */
const EMP: HomeData = {
  actions: [
    { id: 'e1', type: 'Request', title: 'Regularisation sent back: add a reason for 22 Sep', who: 'Karthik Subramanian', due: d(29), kind: 'review' },
    { id: 'e2', type: 'Declaration', title: 'Investment proofs for FY 2026-27', who: 'Payroll team', due: d(15, 9), kind: 'review' },
    { id: 'e3', type: 'Training', title: 'POSH awareness refresher (20 minutes)', who: 'Learning team', due: d(30), kind: 'review' },
  ],
};
const NEW_JOINER: HomeData = {
  actions: [
    { id: 'n1', type: 'Pay', title: 'Add your bank account for salary', who: 'Payroll team', due: d(15, 9), kind: 'review', actionLabel: 'Start', note: 'Needed before your first payday' },
    { id: 'n2', type: 'Documents', title: 'Upload PAN and Aadhaar', who: 'HR team', due: d(2, 9), kind: 'review', actionLabel: 'Start' },
    { id: 'n3', type: 'Benefits', title: 'Add a nominee for PF and insurance', who: 'HR team', due: d(9, 9), kind: 'review', actionLabel: 'Start' },
    { id: 'n4', type: 'Policies', title: 'Read and sign 3 company policies', who: 'HR team', due: d(2, 9), kind: 'review', actionLabel: 'Start' },
    { id: 'n5', type: 'Profile', title: 'Complete your profile: photo, emergency contact', who: 'HR team', due: d(9, 9), kind: 'review', actionLabel: 'Start' },
  ],
};
const MGR: HomeData = {
  actions: [
    { id: 'm1', type: 'Leave', title: 'Casual leave, 1–2 Oct (2 days)', who: 'Arjun Mehta', due: d(30), kind: 'approve', note: '2 others off these days' },
    { id: 'm2', type: 'Leave', title: 'Sick leave, 28 Sep (1 day)', who: 'Meera Krishnan', due: d(29), kind: 'approve' },
    { id: 'm3', type: 'Expense', title: 'Hotel stay, Hosur · ₹18,200', who: 'Vikram Rao', due: d(28), kind: 'review', note: 'Above your ₹10,000 limit, so it needs a full review' },
    { id: 'm4', type: 'Timesheet', title: 'Week of 21 Sep · 44 hours', who: 'Sanjay Gupta', due: d(30), kind: 'approve' },
  ],
  actionsTotal: 8,
};
const HR: HomeData = {
  actions: [
    { id: 'h1', type: 'Access request', title: 'View salary for Hosur plant until 31 Oct', who: 'Farhan Sheikh', due: d(1, 9), kind: 'review', note: 'Sensitive: salary data' },
    { id: 'h2', type: 'Bank change', title: 'Salary account change, verify cancelled cheque', who: 'Anita Desai', due: d(30), kind: 'review' },
    { id: 'h3', type: 'Exit', title: 'Clearance pending with IT for 2 leavers', who: 'Rahul Verma', due: d(27), kind: 'review' },
  ],
  actionsTotal: 18,
};
const FIN: HomeData = {
  actions: [
    { id: 'f1', type: 'Payroll run', title: 'Approve September payroll · 248 employees · ₹1,82,40,500 net', who: 'Anita Desai', due: d(30), kind: 'review', note: 'Prepared by Anita Desai, so you can approve it' },
    { id: 'f2', type: 'Payment', title: 'Release claims payout file · 23 claims', who: 'Kiran Joshi', due: d(1, 9), kind: 'review' },
  ],
};
export const PLT02Employee: S = { name: 'PLT-02 · Role home · employee', render: () => <RoleHomeScreen persona="employee" data={EMP} /> };
export const PLT02EmployeePay: S = { name: 'PLT-02 · Role home · employee, HR shows pay (hidden until asked)', render: () => <RoleHomeScreen persona="employee" data={EMP} payOnHome /> };
export const PLT02EmployeeCustomisable: S = { name: 'PLT-02 · Role home · employee, admin allows personalising', render: () => <RoleHomeScreen persona="employee" data={EMP} customisable /> };
export const PLT02Manager: S = { name: 'PLT-02 · Role home · manager', render: () => <RoleHomeScreen persona="manager" data={MGR} /> };
export const PLT02HR: S = { name: 'PLT-02 · Role home · HR', render: () => <RoleHomeScreen persona="hr" data={HR} /> };
export const PLT02FinanceHidden: S = {
  name: 'PLT-02 · Role home · finance, amounts hidden',
  render: () => <RoleHomeScreen persona="finance" data={FIN} defaultHideAmounts />,
};
export const PLT02Finance: S = { name: 'PLT-02 · Role home · finance', render: () => <RoleHomeScreen persona="finance" data={FIN} defaultHideAmounts={false} /> };
export const PLT02FirstRun: S = { name: 'PLT-02 · Role home · employee first login (tour)', render: () => <RoleHomeScreen persona="employee" data={NEW_JOINER} firstRun /> };
export const PLT02Loading: S = { name: 'PLT-02 · Role home · loading', render: () => <RoleHomeScreen persona="manager" data={MGR} loading /> };
export const PLT02PartlyLoaded: S = {
  name: 'PLT-02 · Role home · one widget slow, one failed',
  render: () => <RoleHomeScreen persona="manager" data={MGR} widgetStates={{ today: 'slow', goals: 'error' }} />,
};
export const PLT02Editing: S = { name: 'PLT-02 · Role home · customising widgets', render: () => <RoleHomeScreen persona="hr" data={HR} editing customisable defaultHidden={['cycles', 'coming']} /> };

/* PLT-10 */
export const PLT10Settings: S = { name: 'PLT-10 · Settings home', render: () => <SettingsHomeScreen /> };
export const PLT10Search: S = { name: 'PLT-10 · Settings home · search “probation”', render: () => <SettingsHomeScreen defaultQuery="probation" /> };
export const PLT10NoResults: S = { name: 'PLT-10 · Settings home · no results', render: () => <SettingsHomeScreen defaultQuery="canteen menu" setupNeeded={false} /> };

/* PLT-18 */
export const PLT18Denied: S = { name: 'PLT-18 · Access denied', render: () => <AccessStateScreen kind="denied" /> };
export const PLT18Request: S = { name: 'PLT-18 · Access denied · request access open', render: () => <AccessStateScreen kind="denied" requestOpen /> };
export const PLT18Requested: S = { name: 'PLT-18 · Access denied · request sent', render: () => <AccessStateScreen kind="requested" /> };
export const PLT18NotFound: S = { name: 'PLT-18 · Not found (also restricted cases)', render: () => <AccessStateScreen kind="not-found" /> };
export const PLT18NotEnabled: S = { name: 'PLT-18 · Not enabled · admin', render: () => <AccessStateScreen kind="not-enabled" isAdmin /> };
export const PLT18Phone: S = { name: 'PLT-18 · Access denied · phone', ...phone, render: () => <AccessStatePhone kind="denied" /> };
export const PLT18PhonePrivate: S = { name: "PLT-18 · Someone else's payslip · phone (shows Not found)", ...phone, render: () => <AccessStatePhone kind="denied" recordType="payslip" /> };
export const PLT18NotEnabledEmployee: S = { name: 'PLT-18 · Not enabled · employee', render: () => <AccessStateScreen kind="not-enabled" /> };
export const PLT18PhoneNotFound: S = { name: 'PLT-18 · Not found · phone', ...phone, render: () => <AccessStatePhone kind="not-found" /> };

/* PLT-20 */
export const PLT20Palette: S = { name: 'PLT-20 · Command palette · recent and actions', render: () => <CommandPaletteScreen /> };
export const PLT20People: S = { name: 'PLT-20 · Command palette · @ people', render: () => <CommandPaletteScreen defaultSearch="@an" /> };
export const PLT20Ref: S = { name: 'PLT-20 · Command palette · # reference', render: () => <CommandPaletteScreen defaultSearch="#LV-26" /> };
export const PLT20Action: S = { name: 'PLT-20 · Command palette · > action', render: () => <CommandPaletteScreen defaultSearch=">approve" /> };
export const PLT20Help: S = { name: 'PLT-20 · Command palette · ? help', render: () => <CommandPaletteScreen defaultSearch="?leave" /> };
export const PLT20Empty: S = { name: 'PLT-20 · Command palette · no results', render: () => <CommandPaletteScreen defaultSearch="zzqx" /> };

/* PLT-21 */
const HITS: SearchHit[] = [
  { id: 'h1', source: 'People', title: 'Arjun Mehta', subtitle: 'KF-0231 · QA Engineer · Quality · Chennai office', entity: 'Kaveri Foods Pvt Ltd (Tamil Nadu)', updated: d(28) },
  { id: 'h2', source: 'Requests', title: 'LV-26-01842 · Casual leave', subtitle: 'Arjun Mehta · 1–2 Oct · Waiting for Karthik Subramanian', entity: 'Kaveri Foods Pvt Ltd (Tamil Nadu)', updated: d(29) },
  { id: 'h3', source: 'Documents', title: 'Appointment letter · Arjun Mehta', subtitle: 'Letters · signed 12 Jan 2024', entity: 'Kaveri Foods Pvt Ltd (Tamil Nadu)', updated: d(12, 0) },
  { id: 'h4', source: 'Tickets', title: 'TKT-5519 · Arjun: PF passbook not updated', subtitle: 'Helpdesk · Open · Payroll queue', entity: 'Kaveri Foods Pvt Ltd (Tamil Nadu)', updated: d(24) },
  { id: 'h5', source: 'Candidates', title: 'Arjun Menon', subtitle: 'Candidate · Quality Analyst · Interview stage', entity: 'Kaveri Foods Pvt Ltd', updated: d(20) },
  { id: 'h6', source: 'Policies', title: 'Leave policy 2026', subtitle: 'Policies · v3 · acknowledged by 231 of 248', snippet: 'casual leave can be combined with', entity: 'Kaveri Foods Pvt Ltd', updated: d(1, 3) },
  { id: 'h7', source: 'Policies', title: 'Travel policy 2026', subtitle: 'Policies · v2 · acknowledged by 240 of 248', snippet: 'approved by the plant head (for example Arjun Mehta for the Hosur audit)', entity: 'Kaveri Foods Pvt Ltd', updated: d(10, 5) },
];
export const PLT21Results: S = { name: 'PLT-21 · Search results', render: () => <SearchResultsScreen query="arjun" hits={HITS} /> };
export const PLT21ResultsHR: S = { name: 'PLT-21 · Search results · HR (all sources, companies)', render: () => <SearchResultsScreen query="arjun" hits={HITS} persona="hr" /> };
export const PLT21EmptyHR: S = { name: 'PLT-21 · Search results · employee code not found (HR)', render: () => <SearchResultsScreen query="kf-9999" hits={[]} persona="hr" /> };
export const PLT21Empty: S = { name: 'PLT-21 · Search results · empty', render: () => <SearchResultsScreen query="kf-9999" hits={[]} /> };
export const PLT21Loading: S = { name: 'PLT-21 · Search results · loading', render: () => <SearchResultsScreen query="arjun" hits={HITS} state="loading" /> };
export const PLT21Error: S = { name: 'PLT-21 · Search results · error', render: () => <SearchResultsScreen query="arjun" hits={HITS} state="error" /> };
export const PLT21Phone: S = { name: 'PLT-21 · Search · phone', ...phone, render: () => <MobileSearchScreen query="arjun" hits={HITS} /> };
export const PLT21PhoneSuggest: S = { name: 'PLT-21 · Search · phone suggestions (PLT-20 mobile)', ...phone, render: () => <MobileSearchScreen query="" hits={HITS} /> };
