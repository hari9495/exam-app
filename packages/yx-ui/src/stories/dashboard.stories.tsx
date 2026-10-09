import '../components/charts.css';
import '../components/dashboard.css';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ReactNode } from 'react';
import { BarChart, CapacityHeatmap, Funnel, Gauge, LineChart, StatCard } from '../components/charts';
import { DashboardGrid, NeedsActionList, Widget, type ActionItem, type DashboardWidget } from '../components/dashboard';
import { Heading } from '../components/foundations';
import { Stack } from './story-kit';

const meta: Meta = { title: 'Dashboards/Role homes', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const TODAY = new Date(2026, 8, 29);
const d = (day: number, month = 8) => new Date(2026, month, day);
const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
const DEPTS = ['Engineering', 'Operations', 'Sales', 'Finance', 'People', 'Quality'];

/** Needs-your-action list with working Approve (removes the row). */
function Actions({ items: initial, total }: { items: ActionItem[]; total?: number }) {
  const [items, setItems] = useState(initial);
  const done = (it: ActionItem) => setItems((xs) => xs.filter((x) => x.id !== it.id));
  return <NeedsActionList items={items} total={(total ?? initial.length) - (initial.length - items.length)} viewAllHref="#inbox" today={TODAY} onApprove={done} onReview={() => {}} />;
}

function Home({ title, widgets, editing }: { title: string; widgets: DashboardWidget[]; editing?: boolean }) {
  return (
    <div style={{ padding: 24, maxWidth: 1440 }}>
      <Stack gap={16}>
        <Heading level={1}>{title}</Heading>
        <DashboardGrid label={title} widgets={widgets} defaultEditing={editing} />
      </Stack>
    </div>
  );
}

const stat = (id: string, content: ReactNode, title: string): DashboardWidget => ({ id, title, size: 3, bare: true, content });

/* ---------- Employee ---------- */
const EMPLOYEE: DashboardWidget[] = [
  {
    id: 'actions',
    title: 'Needs your action',
    size: 12,
    pinned: true,
    bare: true,
    content: (
      <Actions
        items={[
          { id: 'e1', type: 'Timesheet', title: 'Submit timesheet for week of 21 Sep', who: 'Kavya Reddy', due: d(28), kind: 'review' },
          { id: 'e2', type: 'Declaration', title: 'Investment declaration for FY 2026-27', who: 'Kavya Reddy', due: d(15, 9), kind: 'review' },
          { id: 'e3', type: 'Training', title: 'POSH awareness refresher (20 minutes)', who: 'Kavya Reddy', due: d(29), kind: 'review' },
        ]}
      />
    ),
  },
  stat('leave', <StatCard label="Leave balance" value={14} unit="days" previous={16} previousLabel="last month" drill={{ label: 'View leave history', href: '#leave' }} />, 'Leave balance'),
  stat('attendance', <StatCard label="Days present in September" value={19} previous={21} previousLabel="August" drill={{ label: 'View attendance', href: '#attendance' }} />, 'Days present'),
  stat('pay', <StatCard label="Net pay, September" value={86_420} previous={86_420} previousLabel="August" money drill={{ label: 'View payslip', href: '#payslip' }} />, 'Net pay'),
  stat('claims', <StatCard label="Claims pending" value={2} previous={0} previousLabel="August" drill={{ label: 'View 2 claims', href: '#claims' }} />, 'Claims pending'),
  {
    id: 'hours',
    title: 'Hours logged',
    size: 8,
    bare: true,
    content: <BarChart title="Hours logged per week" xLabel="Week" categories={['31 Aug', '7 Sep', '14 Sep', '21 Sep']} series={[{ name: 'Billable', values: [32, 36, 30, 28] }, { name: 'Non-billable', values: [8, 4, 10, 6] }]} stacked />,
  },
  { id: 'goals', title: 'Goals progress', size: 4, content: <Gauge label="Goals completed" value={60} target={75} /> },
  { id: 'learning', title: 'Learning', size: 6, empty: 'No courses assigned to you this quarter.', content: null },
];

/* ---------- Manager ---------- */
const MANAGER_ACTIONS: ActionItem[] = [
  { id: 'm1', type: 'Leave', title: 'Casual leave, 2–3 Oct (2 days)', who: 'Meera Iyer', due: d(27) },
  { id: 'm2', type: 'Timesheet', title: 'Week of 21 Sep, 42 hours (6 billable to Acme Retail)', who: 'Rohit Bhat', due: d(29) },
  { id: 'm3', type: 'Expense', title: 'Client visit to Pune, ₹12,480', who: 'Suresh Pillai', due: d(3, 9) },
  { id: 'm4', type: 'Review', title: 'Probation review for Ananya Das', who: 'Ananya Das', due: d(10, 9), kind: 'review' },
];
const MANAGER: DashboardWidget[] = [
  { id: 'actions', title: 'Needs your action', size: 12, pinned: true, bare: true, content: <Actions items={MANAGER_ACTIONS} total={9} /> },
  stat('team', <StatCard label="Team size" value={12} previous={11} previousLabel="August" drill={{ label: 'View 12 people', href: '#team' }} />, 'Team size'),
  stat('away', <StatCard label="On leave today" value={2} previous={1} previousLabel="yesterday" drill={{ label: 'View who is away', href: '#away' }} />, 'On leave today'),
  stat('util', <StatCard label="Utilisation, September" value={74} unit="%" previous={71} previousLabel="August" trend={[68, 71, 73, 70, 71, 74]} drill={{ label: 'View utilisation', href: '#util' }} />, 'Utilisation'),
  stat('ot', <StatCard label="Overtime hours" value={38} unit="hours" previous={52} previousLabel="August" drill={{ label: 'View overtime', href: '#ot' }} />, 'Overtime'),
  {
    id: 'utilTrend',
    title: 'Utilisation trend',
    size: 6,
    bare: true,
    content: <LineChart title="Utilisation by team" xLabel="Month" categories={MONTHS} series={[{ name: 'Design', values: [68, 71, 73, 70, 74, 76] }, { name: 'Platform', values: [79, 81, 78, 82, 80, 83] }]} emphasis="Design" target={{ value: 75, label: 'Target 75%' }} />,
  },
  {
    id: 'capacity',
    title: 'Capacity',
    size: 6,
    bare: true,
    content: (
      <CapacityHeatmap
        title="Capacity, next 4 weeks"
        weeks={['5 Oct', '12 Oct', '19 Oct', '26 Oct']}
        people={[
          { name: 'Kavya Reddy', weeks: [40, 48, 44, 32].map((a) => ({ allocated: a, available: 40 })) },
          { name: 'Rohit Bhat', weeks: [36, 36, 24, 40].map((a) => ({ allocated: a, available: 40 })) },
          { name: 'Meera Iyer', weeks: [16, 16, 0, 0].map((a, i) => ({ allocated: a, available: i < 2 ? 24 : 40 })) },
        ]}
      />
    ),
  },
];

/* ---------- HR admin ---------- */
const HR: DashboardWidget[] = [
  {
    id: 'actions',
    title: 'Needs your action',
    size: 12,
    pinned: true,
    bare: true,
    content: (
      <Actions
        total={23}
        items={[
          { id: 'h1', type: 'Onboarding', title: 'Documents to verify for 4 joiners on 1 Oct', who: 'Fatima Shaikh', due: d(30), kind: 'review' },
          { id: 'h2', type: 'Exit', title: 'Full and final settlement for Vikram Singh', who: 'Vikram Singh', due: d(26), kind: 'review' },
          { id: 'h3', type: 'Letter', title: 'Confirmation letter, Senior QA Engineer', who: 'Neha Joshi', due: d(1, 9) },
          { id: 'h4', type: 'Case', title: 'Helpdesk: PF transfer not reflecting', who: 'Karthik Subramanian', due: d(29), kind: 'review' },
        ]}
      />
    ),
  },
  stat('hc', <StatCard label="Headcount" value={252} previous={248} previousLabel="August" trend={[212, 220, 226, 231, 248, 252]} drill={{ label: 'View 252 employees', href: '#people' }} />, 'Headcount'),
  stat('joiners', <StatCard label="Joiners in September" value={11} previous={7} previousLabel="August" drill={{ label: 'View 11 joiners', href: '#joiners' }} />, 'Joiners'),
  stat('leavers', <StatCard label="Leavers in September" value={6} previous={9} previousLabel="August" drill={{ label: 'View 6 leavers', href: '#leavers' }} />, 'Leavers'),
  stat('probation', <StatCard label="Probation ending in 30 days" value={8} previous={8} previousLabel="last month" drill={{ label: 'View 8 people', href: '#probation' }} />, 'Probation'),
  {
    id: 'hcTrend',
    title: 'Headcount trend',
    size: 8,
    bare: true,
    content: <LineChart title="Headcount by entity" xLabel="Month" categories={MONTHS} series={[{ name: 'Yukthi Tech Pvt Ltd', values: [150, 155, 158, 162, 175, 179] }, { name: 'Yukthi Services LLP', values: [62, 65, 68, 69, 73, 73] }]} />,
  },
  {
    id: 'attrition',
    title: 'Attrition by department',
    size: 4,
    bare: true,
    content: <BarChart title="Leavers by department, FY to date" orientation="horizontal" xLabel="Department" categories={DEPTS} series={[{ name: 'Leavers', values: [9, 14, 5, 1, 1, 2] }]} groupSizes={[118, 64, 32, 14, 4, 11]} />,
  },
];

/* ---------- Payroll admin ---------- */
const PAYROLL: DashboardWidget[] = [
  {
    id: 'actions',
    title: 'Needs your action',
    size: 12,
    pinned: true,
    bare: true,
    content: (
      <Actions
        items={[
          { id: 'p1', type: 'Payroll', title: 'Lock September payroll for Yukthi Tech Pvt Ltd', who: 'Divya Raghunathan', due: d(30), kind: 'review' },
          { id: 'p2', type: 'Variance', title: '14 employees with net pay change over 10%', who: 'Payroll check', due: d(29), kind: 'review' },
          { id: 'p3', type: 'Statutory', title: 'PF ECR for September due 15 Oct', who: 'Lakshmi Venkatesan', due: d(15, 9), kind: 'review' },
          { id: 'p4', type: 'Arrears', title: 'Salary revision arrears for 3 people', who: 'Prakash Menon', due: d(30) },
        ]}
      />
    ),
  },
  stat('gross', <StatCard label="Gross pay, September" value={3_12_40_000} previous={3_00_40_000} previousLabel="August" money drill={{ label: 'Open September payroll', href: '#run' }} />, 'Gross pay'),
  stat('net', <StatCard label="Net pay, September" value={2_42_80_000} previous={2_44_00_000} previousLabel="August" money drill={{ label: 'View 252 payslips', href: '#payslips' }} />, 'Net pay'),
  stat('lop', <StatCard label="Loss-of-pay days" value={37} unit="days" previous={29} previousLabel="August" drill={{ label: 'View 37 days', href: '#lop' }} />, 'Loss of pay'),
  stat('holds', <StatCard label="Salaries on hold" value={3} previous={5} previousLabel="August" drill={{ label: 'View 3 holds', href: '#holds' }} />, 'Holds'),
  {
    id: 'cost',
    title: 'Salary cost',
    size: 8,
    bare: true,
    content: <BarChart title="Monthly salary cost by entity" money stacked xLabel="Month" categories={MONTHS} series={[{ name: 'Yukthi Tech Pvt Ltd', values: [2_20_00_000, 2_21_00_000, 2_25_00_000, 2_27_00_000, 2_33_00_000, 2_41_00_000] }, { name: 'Yukthi Services LLP', values: [65_00_000, 66_00_000, 68_00_000, 69_00_000, 70_00_000, 71_40_000] }]} />,
  },
  { id: 'close', title: 'Payroll close', size: 4, content: <Gauge label="Inputs received for October" value={64} target={100} variant="bar" /> },
];

/* ---------- Recruiter ---------- */
const RECRUITER: DashboardWidget[] = [
  {
    id: 'actions',
    title: 'Needs your action',
    size: 12,
    pinned: true,
    bare: true,
    content: (
      <Actions
        total={14}
        items={[
          { id: 'r1', type: 'Feedback', title: 'Interview feedback missing: Senior QA Engineer', who: 'Thomas George', due: d(28), kind: 'review' },
          { id: 'r2', type: 'Offer', title: 'Offer approval, ₹18,40,000 CTC', who: 'Aisha Khan', due: d(30) },
          { id: 'r3', type: 'Requisition', title: 'New requisition: 3 Maintenance Technicians, Hosur', who: 'Manoj Patil', due: d(2, 9) },
        ]}
      />
    ),
  },
  stat('open', <StatCard label="Open positions" value={18} previous={18} previousLabel="August" drill={{ label: 'View 18 positions', href: '#jobs' }} />, 'Open positions'),
  stat('apps', <StatCard label="Applications this week" value={214} previous={176} previousLabel="last week" trend={[120, 150, 140, 176, 214]} drill={{ label: 'View 214 applications', href: '#apps' }} />, 'Applications'),
  stat('offers', <StatCard label="Offers out" value={7} previous={9} previousLabel="last week" drill={{ label: 'View 7 offers', href: '#offers' }} />, 'Offers'),
  stat('tth', <StatCard label="Days to hire, median" value={34} unit="days" previous={38} previousLabel="last quarter" drill={{ label: 'View hires', href: '#hires' }} />, 'Days to hire'),
  {
    id: 'funnel',
    title: 'Hiring funnel',
    size: 6,
    bare: true,
    content: <Funnel title="Hiring funnel, Q2" stages={[{ label: 'Applied', count: 1_240 }, { label: 'Screened', count: 412 }, { label: 'Interviewed', count: 138 }, { label: 'Offered', count: 31 }, { label: 'Joined', count: 24 }]} />,
  },
  {
    id: 'source',
    title: 'Hires by source',
    size: 6,
    bare: true,
    content: <BarChart title="Hires by source" orientation="horizontal" xLabel="Source" categories={['Referral', 'Careers page', 'Naukri', 'LinkedIn', 'Campus']} series={[{ name: 'Hires', values: [9, 6, 5, 3, 1] }]} />,
  },
];

export const EmployeeHome: S = { render: () => <Home title="Good morning, Kavya" widgets={EMPLOYEE} /> };
export const ManagerHome: S = { render: () => <Home title="Good morning, Joseph" widgets={MANAGER} /> };
export const HrAdminHome: S = { name: 'HR admin home', render: () => <Home title="Good morning, Fatima" widgets={HR} /> };
export const PayrollAdminHome: S = { render: () => <Home title="Good morning, Divya" widgets={PAYROLL} /> };
export const RecruiterHome: S = { render: () => <Home title="Good morning, Aisha" widgets={RECRUITER} /> };
export const EditMode: S = { render: () => <Home title="Good morning, Fatima" widgets={HR} editing /> };
export const ManagerHomeMobile: S = { globals: { viewport: { value: 'mobile2', isRotated: false } }, render: ManagerHome.render };
export const ManagerHomeDark: S = { globals: { theme: 'dark' }, render: ManagerHome.render };
export const EmptyDashboard: S = {
  render: () => (
    <div style={{ padding: 24 }}>
      <DashboardGrid label="HR home" widgets={HR.filter((w) => !w.pinned)} defaultValue={[]} defaultEditing />
    </div>
  ),
};

/* ---------- Pieces ---------- */
export const WidgetStates: S = {
  render: () => (
    <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 24 }}>
      <Widget title="Birthdays this week" size={4}>
        <p style={{ margin: 0 }}>Meera Iyer, 1 Oct · Rohit Bhat, 3 Oct</p>
      </Widget>
      <Widget title="Learning" size={4} empty="No courses assigned to you this quarter." />
      <Widget title="A very long widget title that should truncate instead of wrapping onto two lines" size={4}>
        <p style={{ margin: 0 }}>Content</p>
      </Widget>
    </div>
  ),
};

export const NeedsActionStates: S = {
  render: () => (
    <div style={{ padding: 24, maxWidth: 880 }}>
      <Stack>
        <Widget title="Default" size={12} bare>
          <Actions items={MANAGER_ACTIONS} total={9} />
        </Widget>
        <Widget title="Loading" size={12} bare>
          <NeedsActionList items={[]} viewAllHref="#inbox" loading />
        </Widget>
        <Widget title="Empty" size={12} bare>
          <NeedsActionList items={[]} viewAllHref="#inbox" today={TODAY} />
        </Widget>
      </Stack>
    </div>
  ),
};
export const NeedsActionMobile: S = { globals: { viewport: { value: 'mobile2', isRotated: false } }, render: () => <Actions items={MANAGER_ACTIONS} total={9} /> };
