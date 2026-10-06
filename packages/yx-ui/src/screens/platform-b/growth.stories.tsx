import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  CancellationConfirm,
  CancellationFlow,
  FeatureRequestsScreen,
  JobsErrorsScreen,
  PayoutReadinessScreen,
  QuickStartPanel,
  ReferralScreen,
  SwitchOnScreen,
  TalkToUsDialog,
  TrialExtensionDialog,
  TrialReadOnlyPhone,
  TrialReadOnlyScreen,
  WhatsNewDrawer,
  WhatsNewSheet,
  type Beta,
  type FeatureRequest,
  type JobError,
  type Lane,
  type NewsEntry,
} from './growth-screens';
import { d } from './platform-b-data';

const meta: Meta = { title: 'Screens/Platform/PLT-38…43, 50…54 · Jobs, trial & account', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

/* ---- PLT-38 ---- */
const JOBS: JobError[] = [
  { id: 'j1', kind: 'Import', source: 'Employee import', record: 'Row 42 · employees-sep.xlsx', error: 'PAN ABCDE1234 has 9 characters. Enter a 10-character PAN like ABCDE1234F.', attempts: 1, nextRetry: null, owner: 'Lakshmi Venkatesan', ageHours: 3, area: 'people' },
  { id: 'j2', kind: 'Integration delivery', source: 'Tally ledger export', record: 'JV-SEP-2026-004', error: 'Tally did not answer within 30 seconds. We will try again.', attempts: 2, nextRetry: d(9, 29, 10, 15), owner: 'Suresh Pillai', ageHours: 1, area: 'payroll' },
  { id: 'j3', kind: 'Notification', source: 'WhatsApp', record: 'Payslip ready · KF-0142', error: 'The number +91 98450 00000 is not on WhatsApp. Sent by SMS instead; fix the number in the profile.', attempts: 3, nextRetry: null, owner: null, ageHours: 30, area: 'people' },
  { id: 'j4', kind: 'Scheduled job', source: 'Leave accrual', record: 'Accrual run · 1 Oct 2026 (dry)', error: 'Leave policy “Plant staff 2026” has no accrual rule for contract workers.', attempts: 1, nextRetry: d(9, 30, 2, 0), owner: 'Lakshmi Venkatesan', ageHours: 8, area: 'people' },
  { id: 'j5', kind: 'Automation', source: 'Chase expiring driving licences', record: 'KF-0199', error: 'Notify step: the manager has no work email.', attempts: 3, nextRetry: null, owner: null, ageHours: 50, area: 'people' },
  { id: 'j6', kind: 'Integration delivery', source: 'Bank file (H2H)', record: 'SAL-SEP-2026', error: 'Bank rejected the file: debit account 00421180 is not linked to the host-to-host channel.', attempts: 1, nextRetry: null, owner: 'Suresh Pillai', ageHours: 2, area: 'payroll' },
];
export const Plt38Admin: S = { name: 'PLT-38 · Jobs & errors · System Admin (all, escalated)', render: () => <JobsErrorsScreen jobs={JOBS} /> };
export const Plt38HR: S = { name: 'PLT-38 · Jobs & errors · HR (people only)', render: () => <JobsErrorsScreen jobs={JOBS} persona="HR" /> };
export const Plt38PA: S = { name: 'PLT-38 · Jobs & errors · payroll admin', render: () => <JobsErrorsScreen jobs={JOBS} persona="PA" /> };
export const Plt38Skip: S = { name: 'PLT-38 · Jobs & errors · skip with reason', render: () => <JobsErrorsScreen jobs={JOBS} skipOpen="j3" /> };
export const Plt38Empty: S = { name: 'PLT-38 · Jobs & errors · empty', render: () => <JobsErrorsScreen jobs={[]} /> };
export const Plt38Loading: S = { name: 'PLT-38 · Jobs & errors · loading', render: () => <JobsErrorsScreen jobs={JOBS} state="loading" /> };
export const Plt38Error: S = { name: 'PLT-38 · Jobs & errors · error', render: () => <JobsErrorsScreen jobs={JOBS} state="error" /> };

/* ---- PLT-39 ---- */
const LANES: Lane[] = [
  {
    product: 'HR',
    current: 'upload',
    steps: [
      { id: 'company', title: 'Company, entity and state', description: 'Kaveri Foods Pvt Ltd · Karnataka', estimate: '1 min' },
      { id: 'upload', title: 'Import employees from Excel', description: 'Use the starter sheet; fix rows in the preview', estimate: '3 min' },
      { id: 'payslip', title: 'See a payslip preview', description: 'Starter salary template applied', estimate: '1 min' },
    ],
  },
  {
    product: 'Hire',
    current: null,
    steps: [
      { id: 'job', title: 'Post a job to your careers page', description: 'Starter job templates', estimate: '3 min' },
      { id: 'apply', title: 'Apply as a test candidate', description: '', estimate: '1 min' },
      { id: 'move', title: 'Move them to Interview', description: '', estimate: '1 min' },
    ],
  },
  {
    product: 'Assess',
    current: 'invite',
    skipped: true,
    steps: [
      { id: 'pick', title: 'Pick a library test', description: 'Customer support, English, 20 min', estimate: '1 min' },
      { id: 'invite', title: 'Send yourself an invite', description: '', estimate: '1 min' },
      { id: 'take', title: 'Open it as a candidate', description: '', estimate: '3 min' },
    ],
  },
];
export const Plt39InProgress: S = { name: 'PLT-39 · Quick-start lane · in progress', render: () => <QuickStartPanel lanes={LANES} /> };
export const Plt39Sample: S = { name: 'PLT-39 · Quick-start lane · sample data (sandbox)', render: () => <QuickStartPanel lanes={LANES.map((l) => ({ ...l, sampleData: true }))} /> };
export const Plt39Done: S = { name: 'PLT-39 · Quick-start lane · first value reached', render: () => <QuickStartPanel lanes={LANES} defaultProduct="Hire" /> };
export const Plt39Skipped: S = { name: 'PLT-39 · Quick-start lane · skipped, resume', render: () => <QuickStartPanel lanes={LANES} defaultProduct="Assess" /> };

/* ---- PLT-40 ---- */
export const Plt40NotOn: S = { name: 'PLT-40 · Switch on · product not on', render: () => <SwitchOnScreen product="Payroll" reason="not-on" price="₹90 per employee a month" canBill /> };
export const Plt40Limit: S = { name: 'PLT-40 · Switch on · trial limit (live bank file)', render: () => <SwitchOnScreen product="Payroll" reason="limit" price="₹90 per employee a month" canBill limitText="Live bank files are not part of the trial." /> };
export const Plt40FirstValue: S = { name: 'PLT-40 · Switch on · first value reached', render: () => <SwitchOnScreen product="Assess" reason="first-value" price="₹180 per test attempt" canBill /> };
export const Plt40NoBilling: S = { name: 'PLT-40 · Switch on · HR admin without billing permission', render: () => <SwitchOnScreen product="Payroll" reason="not-on" price="₹90 per employee a month" canBill={false} /> };

/* ---- PLT-41 / 42 / 43 ---- */
export const Plt41: S = { name: 'PLT-41 · Talk to us', render: () => <TalkToUsDialog trigger="You imported 450 employees." /> };
export const Plt41Booked: S = { name: 'PLT-41 · Talk to us · booked', render: () => <TalkToUsDialog trigger="" booked /> };
export const Plt42Auto: S = { name: 'PLT-42 · Trial extension · automatic notice', render: () => <TrialExtensionDialog extensionsUsed={0} firstValue /> };
export const Plt42Request: S = { name: 'PLT-42 · Trial extension · self-serve request', render: () => <TrialExtensionDialog extensionsUsed={0} firstValue={false} /> };
export const Plt42Used: S = { name: 'PLT-42 · Trial extension · already used', render: () => <TrialExtensionDialog extensionsUsed={1} firstValue={false} /> };
export const Plt43Desk: S = { name: 'PLT-43 · Trial read-only banner', render: () => <TrialReadOnlyScreen trialEnd={d(9, 14)} /> };
export const Plt43Late: S = { name: 'PLT-43 · Trial read-only banner · 4 days to deletion', render: () => <TrialReadOnlyScreen trialEnd={d(9, 3)} /> };
export const Plt43Phone: S = { ...phone, name: 'PLT-43 · Trial read-only banner · phone', render: () => <TrialReadOnlyPhone trialEnd={d(9, 14)} /> };

/* ---- PLT-50 ---- */
const NEWS: NewsEntry[] = [
  { id: 'n1', date: d(9, 28), product: 'Time', title: 'Comp-off expiry on the balance card', body: 'Employees now see when comp-off days lapse, on web and mobile.', roles: ['Employee', 'Manager', 'HR admin'], unread: true },
  { id: 'n2', date: d(9, 24), product: 'Payroll', title: 'Variance check explains each change', body: 'Payroll admins see why a net pay moved more than the threshold.', roles: ['HR admin', 'Payroll admin'], unread: true },
  { id: 'n3', date: d(9, 18), product: 'Core HR', title: 'Bulk transfers with a preview', body: 'See every change before you confirm a bulk transfer.', roles: ['HR admin'] },
  { id: 'n4', date: d(9, 10), product: 'Time', title: 'Swipe to approve leave', body: 'Managers can approve low-risk leave with a swipe on mobile.', roles: ['Manager'] },
];
export const Plt50Admin: S = { name: 'PLT-50 · What’s new · HR admin', render: () => <WhatsNewDrawer entries={NEWS} role="HR admin" /> };
export const Plt50Manager: S = { name: 'PLT-50 · What’s new · manager', render: () => <WhatsNewDrawer entries={NEWS} role="Manager" /> };
export const Plt50Empty: S = { name: 'PLT-50 · What’s new · nothing yet', render: () => <WhatsNewDrawer entries={[]} role="Employee" /> };
export const Plt50Phone: S = { ...phone, name: 'PLT-50 · What’s new · phone, employee', render: () => <WhatsNewSheet entries={NEWS} role="Employee" /> };

/* ---- PLT-51 ---- */
const REQS: FeatureRequest[] = [
  { id: 'f1', title: 'Comp-off expiry reminders', product: 'Time', status: 'Planned', votes: 41, voted: true, raisedBy: 'Lakshmi Venkatesan' },
  { id: 'f2', title: 'Tamil payslips', product: 'Payroll', status: 'In progress', votes: 28, voted: false, raisedBy: 'Suresh Pillai' },
  { id: 'f3', title: 'Canteen deductions from a vendor file', product: 'Payroll', status: 'Under review', votes: 9, voted: false, raisedBy: 'Meera Iyengar' },
  { id: 'f4', title: 'Shift swap across plants', product: 'Time', status: 'Not planned', votes: 3, voted: false, raisedBy: 'Karthik Subramanian' },
  { id: 'f5', title: 'Offer letter in Kannada', product: 'Hire', status: 'Shipped', votes: 17, voted: true, raisedBy: 'Neha Joshi' },
];
const BETAS: Beta[] = [
  { id: 'b1', name: 'Workflow Studio AI drafts', description: 'Describe an automation in plain words and get a draft workflow to review.', on: true },
  { id: 'b2', name: 'Auto-roster', description: 'Suggests a week’s roster from demand, skills and rest rules.', on: false },
];
export const Plt51Admin: S = { name: 'PLT-51 · Feature requests · vote once', render: () => <FeatureRequestsScreen requests={REQS} betas={BETAS} isAdmin /> };
export const Plt51Betas: S = { name: 'PLT-51 · Beta programmes · admin opt in / out', render: () => <FeatureRequestsScreen requests={REQS} betas={BETAS} isAdmin defaultTab="betas" /> };
export const Plt51BetasUser: S = { name: 'PLT-51 · Beta programmes · employee (view only)', render: () => <FeatureRequestsScreen requests={REQS} betas={BETAS} isAdmin={false} defaultTab="betas" /> };
export const Plt51Raise: S = { name: 'PLT-51 · Raise a request', render: () => <FeatureRequestsScreen requests={REQS} betas={BETAS} isAdmin raiseOpen /> };
export const Plt51Empty: S = { name: 'PLT-51 · Feature requests · empty', render: () => <FeatureRequestsScreen requests={[]} betas={BETAS} isAdmin /> };

/* ---- PLT-52 ---- */
export const Plt52Reason: S = { name: 'PLT-52 · Cancellation · reason', render: () => <CancellationFlow product="Performance" /> };
export const Plt52Offers: S = { name: 'PLT-52 · Cancellation · save offers (skippable)', render: () => <CancellationFlow product="Performance" defaultStep="offers" /> };
export const Plt52What: S = { name: 'PLT-52 · Cancellation · what happens', render: () => <CancellationFlow product="Performance" defaultStep="confirm" /> };
export const Plt52Confirm: S = { name: 'PLT-52 · Cancellation · confirm switch-off', render: () => <CancellationConfirm product="Performance" /> };

/* ---- PLT-53 ---- */
const REFS = [
  { id: 'r1', company: 'Nilgiri Spices Pvt Ltd', signedUp: d(7, 3), firstPaidMonthSettled: true, creditAmount: 42800 },
  { id: 'r2', company: 'Coromandel Tiles LLP', signedUp: d(9, 2), firstPaidMonthSettled: false, creditAmount: 42800 },
  { id: 'r3', company: 'Kaveri Dairy Pvt Ltd', signedUp: d(8, 11), firstPaidMonthSettled: true, sameGroup: true, creditAmount: 42800 },
  { id: 'r4', company: 'Palar Logistics Pvt Ltd', signedUp: d(6, 20), firstPaidMonthSettled: true, refunded: true, creditAmount: 42800 },
];
export const Plt53: S = { name: 'PLT-53 · Referral · earned, pending, not credited', render: () => <ReferralScreen referrals={REFS} code="KAVERI-7Q2" /> };
export const Plt53Empty: S = { name: 'PLT-53 · Referral · none yet', render: () => <ReferralScreen referrals={[]} code="KAVERI-7Q2" /> };

/* ---- PLT-54 ---- */
export const Plt54Grace: S = { name: 'PLT-54 · Payout readiness · mandate pending (grace run), KYB pending', render: () => <PayoutReadinessScreen checks={{ mandate: 'pending', graceRunUsed: false, kyb: 'pending', fundingAccount: true, balance: 18000000, netPay: 17240500 }} /> };
export const Plt54Partial: S = { name: 'PLT-54 · Payout readiness · balance short, partial payout', render: () => <PayoutReadinessScreen checks={{ mandate: 'active', graceRunUsed: true, kyb: 'approved', fundingAccount: true, balance: 12500000, netPay: 17240500 }} /> };
export const Plt54Blocked: S = { name: 'PLT-54 · Payout readiness · blocked (payroll admin view)', render: () => <PayoutReadinessScreen persona="PA" checks={{ mandate: 'failed', graceRunUsed: true, kyb: 'rejected', fundingAccount: false, balance: 0, netPay: 17240500 }} /> };
export const Plt54Ready: S = { name: 'PLT-54 · Payout readiness · ready', render: () => <PayoutReadinessScreen checks={{ mandate: 'active', graceRunUsed: true, kyb: 'approved', fundingAccount: true, balance: 20000000, netPay: 17240500 }} /> };
