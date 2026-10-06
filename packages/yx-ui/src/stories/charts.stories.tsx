import '../components/charts.css';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { AreaChart, BarChart, CapacityHeatmap, DonutChart, Funnel, Gauge, Heatmap, LineChart, Sparkline, StatCard, type CapacityPerson } from '../components/charts';
import { Row, Section, Stack } from './story-kit';

const meta: Meta = { title: 'Dashboards/Charts' };
export default meta;
type S = StoryObj;

const mobile = { globals: { viewport: { value: 'mobile2', isRotated: false } } };
const dark = { globals: { theme: 'dark' } };

function Card({ children, width = 720 }: { children: ReactNode; width?: number }) {
  return (
    <div style={{ maxWidth: width, padding: 16, border: '1px solid var(--yx-color-border)', borderRadius: 'var(--yx-radius-card)', background: 'var(--yx-color-bg-surface)' }}>
      {children}
    </div>
  );
}

/* ---------- sample data (fictional, deterministic) ---------- */
const DEPTS = ['Engineering', 'Operations', 'Sales', 'Finance', 'People', 'Quality'];
const HEADCOUNT = [{ name: 'Headcount', values: [118, 64, 32, 14, 9, 11] }];
const HIRES_LEAVERS = [
  { name: 'Joiners', values: [14, 9, 6, 1, 2, 1] },
  { name: 'Leavers', values: [8, 11, 5, 2, 1, 1] },
];
const BY_TYPE = [
  { name: 'Permanent', values: [96, 22, 28, 12, 8, 9] },
  { name: 'Contract', values: [18, 12, 3, 2, 1, 2] },
  { name: 'Contract labour (CLRA)', values: [4, 30, 1, 0, 0, 0] },
];
const COST = [{ name: 'Monthly salary cost', values: [1_42_60_000, 38_40_000, 29_80_000, 14_20_000, 8_10_000, 7_60_000] }];
const LOCATIONS = ['Bengaluru', 'Chennai', 'Hosur plant', 'Pune', 'Hyderabad', 'Kochi', 'Coimbatore', 'Mysuru', 'Noida', 'Ahmedabad'];
const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
const MANY = LOCATIONS.map((name, i) => ({ name, values: MONTHS.map((_, m) => 20 + ((i * 7 + m * 5) % 23)) }));
const UTIL = [
  { name: 'Design', values: [68, 71, 73, 70, 74, 76] },
  { name: 'Platform', values: [79, 81, 78, 82, 80, 83] },
  { name: 'Data', values: [61, 64, 66, 69, 71, 72] },
];
const PAYROLL = [{ name: 'Net pay', values: [2_31_40_000, 2_33_10_000, 2_38_90_000, 2_41_20_000, 2_44_00_000, 2_42_80_000] }];

/* ---------- Bar ---------- */
export const BarVertical: S = { render: () => <Card><BarChart title="Headcount by department" description="Active employees on 29 Sep 2026" xLabel="Department" categories={DEPTS} series={HEADCOUNT} /></Card> };
export const BarHorizontal: S = { render: () => <Card><BarChart title="Headcount by department" orientation="horizontal" xLabel="Department" categories={DEPTS} series={HEADCOUNT} /></Card> };
export const BarGroupedHighlighted: S = {
  name: 'Bar — grouped, highlighted series',
  render: () => <Card><BarChart title="Joiners and leavers, April to September" xLabel="Department" categories={DEPTS} series={HIRES_LEAVERS} emphasis="Leavers" valueLabels /></Card>,
};
export const BarStacked: S = { render: () => <Card><BarChart title="Employees by type" xLabel="Department" categories={DEPTS} series={BY_TYPE} stacked /></Card> };
export const BarStackedHorizontal: S = { render: () => <Card><BarChart title="Employees by type" xLabel="Department" orientation="horizontal" categories={DEPTS} series={BY_TYPE} stacked /></Card> };
export const BarMoney: S = { render: () => <Card><BarChart title="Monthly salary cost by department" description="September 2026 payroll, gross" money xLabel="Department" categories={DEPTS} series={COST} orientation="horizontal" /></Card> };
export const BarManySeriesOther: S = {
  name: 'Bar — many series (Other)',
  render: () => <Card width={900}><BarChart title="New joiners by location" description="10 locations: the last 3 are grouped as Other" xLabel="Month" categories={MONTHS} series={MANY} stacked /></Card>,
};
export const BarSmallGroupsSuppressed: S = {
  render: () => (
    <Card>
      <BarChart title="Average monthly CTC by department" money xLabel="Department" categories={DEPTS} series={[{ name: 'Average CTC', values: [1_24_000, 42_000, 86_000, 1_01_000, 88_000, 57_000] }]} groupSizes={[118, 64, 32, 14, 4, 3]} orientation="horizontal" />
    </Card>
  ),
};
export const BarEmpty: S = { render: () => <Card><BarChart title="Leavers by department" categories={[]} series={[]} emptyText="No one left in September." /></Card> };
export const BarLoading: S = { render: () => <Card><BarChart title="Headcount by department" categories={DEPTS} series={HEADCOUNT} loading /></Card> };
export const BarTableView: S = { render: () => <Card><BarChart title="Employees by type" xLabel="Department" categories={DEPTS} series={BY_TYPE} stacked defaultView="table" /></Card> };
export const BarLongLabels: S = {
  render: () => (
    <Card width={480}>
      <BarChart title="Open positions" xLabel="Designation" categories={['Senior Quality Assurance Engineer, Automotive', 'Maintenance Technician (Night shift)', 'HR Business Partner']} series={[{ name: 'Open', values: [4, 7, 2] }]} />
    </Card>
  ),
};
export const BarMobile: S = { ...mobile, render: () => <BarChart title="Headcount by department" orientation="horizontal" categories={DEPTS} series={HEADCOUNT} /> };

/* ---------- Line / Area ---------- */
export const LineMultiSeries: S = {
  render: () => <Card><LineChart title="Utilisation by team" description="Approved billable hours ÷ available hours" xLabel="Month" categories={MONTHS} series={UTIL} target={{ value: 75, label: 'Target 75%' }} /></Card>,
};
export const LineHighlighted: S = {
  render: () => <Card><LineChart title="Utilisation by team" xLabel="Month" categories={MONTHS} series={UTIL} emphasis="Design" target={{ value: 75, label: 'Target 75%' }} /></Card>,
};
export const LineMoney: S = { render: () => <Card><LineChart title="Net pay by month" money xLabel="Month" categories={MONTHS} series={PAYROLL} yMin={2_00_00_000} /></Card> };
export const LineGaps: S = {
  name: 'Line — missing months',
  render: () => (
    <Card>
      <LineChart title="Attendance rate, Hosur plant" xLabel="Month" categories={MONTHS} series={[{ name: 'Attendance %', values: [94, 93, null, null, 95, 96] }]} footnote="June and July are missing: the biometric feed was down." yMin={80} />
    </Card>
  ),
};
export const LineManySeries: S = { render: () => <Card width={900}><LineChart title="New joiners by location" xLabel="Month" categories={MONTHS} series={MANY} /></Card> };
export const LineEmpty: S = { render: () => <Card><LineChart title="Overtime hours" categories={MONTHS} series={[{ name: 'Overtime', values: MONTHS.map(() => null) }]} /></Card> };
export const LineLoading: S = { render: () => <Card><LineChart title="Utilisation by team" categories={MONTHS} series={UTIL} loading /></Card> };
export const LineTableView: S = { render: () => <Card><LineChart title="Utilisation by team" xLabel="Month" categories={MONTHS} series={UTIL} defaultView="table" /></Card> };
export const Area: S = { render: () => <Card><AreaChart title="Open requisitions" xLabel="Month" categories={MONTHS} series={[{ name: 'Open', values: [18, 22, 27, 24, 31, 29] }]} /></Card> };
export const AreaHighlighted: S = { render: () => <Card><AreaChart title="Headcount by entity" xLabel="Month" categories={MONTHS} series={[{ name: 'Yukthi Tech Pvt Ltd', values: [212, 220, 226, 231, 240, 248] }, { name: 'Yukthi Services LLP', values: [64, 66, 65, 70, 72, 71] }]} emphasis="Yukthi Tech Pvt Ltd" /></Card> };

/* ---------- Donut ---------- */
export const Donut: S = {
  name: 'Donut (4 slices or fewer)',
  render: () => <Card width={480}><DonutChart title="Work mode" xLabel="Mode" slices={[{ label: 'Office', value: 142 }, { label: 'Hybrid', value: 81 }, { label: 'Remote', value: 25 }]} /></Card>,
};
export const DonutMoney: S = {
  render: () => <Card width={480}><DonutChart title="CTC split, September" money xLabel="Component" slices={[{ label: 'Basic', value: 92_00_000 }, { label: 'HRA', value: 46_00_000 }, { label: 'Allowances', value: 61_00_000 }, { label: 'Employer PF', value: 11_00_000 }]} /></Card>,
};
export const DonutTooManySlices: S = {
  name: 'Donut — 6 slices (warns, groups as Other)',
  render: () => <Card width={480}><DonutChart title="Headcount by department" slices={DEPTS.map((label, i) => ({ label, value: HEADCOUNT[0].values[i] }))} /></Card>,
};

/* ---------- Heatmap ---------- */
const ATT_ROWS = [
  { label: 'Engineering', values: [96, 95, 97, 94, 96, 97], groupSize: 118 },
  { label: 'Operations', values: [88, 86, 84, 90, 91, 89], groupSize: 64 },
  { label: 'Sales', values: [92, 93, 90, 91, null, 94], groupSize: 32 },
  { label: 'Finance', values: [98, 97, 99, 98, 97, 98], groupSize: 14 },
  { label: 'Legal', values: [100, 95, 100, 100, 100, 95], groupSize: 3 },
];
export const HeatmapDefault: S = {
  render: () => <Card><Heatmap title="Attendance rate by department" xLabel="Department" columns={MONTHS} rows={ATT_ROWS.slice(0, 4)} format={(v) => `${v}%`} max={100} /></Card>,
};
export const HeatmapSuppressed: S = {
  render: () => <Card><Heatmap title="Attendance rate by department" xLabel="Department" columns={MONTHS} rows={ATT_ROWS} format={(v) => `${v}%`} max={100} /></Card>,
};
export const HeatmapTableView: S = { render: () => <Card><Heatmap title="Attendance rate by department" xLabel="Department" columns={MONTHS} rows={ATT_ROWS.slice(0, 4)} format={(v) => `${v}%`} defaultView="table" /></Card> };
export const HeatmapEmpty: S = { render: () => <Card><Heatmap title="Attendance rate by department" columns={MONTHS} rows={[]} /></Card> };
export const HeatmapLoading: S = { render: () => <Card><Heatmap title="Attendance rate by department" columns={MONTHS} rows={ATT_ROWS} loading /></Card> };

const WEEKS = ['5 Oct', '12 Oct', '19 Oct', '26 Oct', '2 Nov', '9 Nov'];
const PEOPLE: CapacityPerson[] = [
  { name: 'Kavya Reddy', role: 'UX Designer', weeks: [[40, 40], [48, 40], [44, 40], [32, 40], [16, 40], [8, 40]].map(([allocated, available]) => ({ allocated, available })) },
  { name: 'Imran Qureshi', role: 'Senior UX Designer', weeks: [[36, 40], [36, 40], [24, 32], [0, 0], [32, 40], [40, 40]].map(([allocated, available]) => ({ allocated, available })) },
  { name: 'Ananya Das', role: 'Visual Designer', weeks: [[8, 40], [12, 40], [16, 40], [20, 40], [24, 40], [24, 40]].map(([allocated, available]) => ({ allocated, available })) },
  { name: 'Joseph Mathew', role: 'Design Lead', weeks: [[40, 40], [40, 40], [40, 40], [40, 40], [40, 40], [40, 40]].map(([allocated, available]) => ({ allocated, available })) },
  { name: 'Priya Nair', role: 'UX Researcher', weeks: [[20, 24], [30, 24], [24, 24], [12, 40], [0, 40], [0, 40]].map(([allocated, available]) => ({ allocated, available })) },
];
export const CapacityOverAllocation: S = {
  name: 'Capacity heatmap — over-allocation',
  render: () => (
    <Card width={960}>
      <CapacityHeatmap title="Design team capacity" description="Allocated vs available hours. Available = expected hours minus leave and holidays." weeks={WEEKS} people={PEOPLE} footnote="Imran is on leave the week of 26 Oct." />
    </Card>
  ),
};
export const CapacityTableView: S = { render: () => <Card width={960}><CapacityHeatmap title="Design team capacity" weeks={WEEKS} people={PEOPLE} defaultView="table" /></Card> };
export const CapacityMobile: S = { ...mobile, render: () => <CapacityHeatmap title="Design team capacity" weeks={WEEKS} people={PEOPLE} /> };

/* ---------- Funnel, gauge, sparkline ---------- */
const FUNNEL = [
  { label: 'Applied', count: 1_240 },
  { label: 'Screened', count: 412 },
  { label: 'Interviewed', count: 138 },
  { label: 'Offered', count: 31 },
  { label: 'Joined', count: 24 },
];
export const HiringFunnel: S = { render: () => <Card><Funnel title="Hiring funnel, Q2" description="Senior QA Engineer, Chennai" stages={FUNNEL} /></Card> };
export const HiringFunnelTable: S = { render: () => <Card><Funnel title="Hiring funnel, Q2" stages={FUNNEL} defaultView="table" /></Card> };
export const HiringFunnelMobile: S = { ...mobile, render: () => <Funnel title="Hiring funnel, Q2" stages={FUNNEL} /> };

export const Gauges: S = {
  render: () => (
    <Row gap={32} align="flex-start">
      <Card width={260}><Gauge label="Team utilisation" value={72} target={75} /></Card>
      <Card width={260}><Gauge label="Onboarding tasks done" value={88} target={80} /></Card>
      <Card width={320}><Gauge label="Training budget used" value={3_40_000} max={5_00_000} target={4_00_000} format="money" variant="bar" /></Card>
      <Card width={320}><Gauge label="Offers accepted" value={24} target={30} max={40} format="number" variant="bar" /></Card>
    </Row>
  ),
};

export const Sparklines: S = {
  render: () => (
    <Stack gap={12}>
      <Row><Sparkline values={[212, 220, 226, 231, 240, 248]} label="Headcount over 6 months" /> <span>Rising</span></Row>
      <Row><Sparkline values={[14, 12, 13, 9, 8, 6]} label="Open tickets over 6 weeks" /> <span>Falling</span></Row>
      <Row><Sparkline values={[40, 40, 40, 40]} label="Standard hours" /> <span>Flat</span></Row>
    </Stack>
  ),
};

/* ---------- Stat cards ---------- */
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 24, maxWidth: 1100 } as const;
export const StatCards: S = {
  render: () => (
    <Stack>
      <Section title="Up, down, no change, money, loading">
        <div style={grid}>
          <StatCard label="Headcount" value={252} previous={248} previousLabel="August" trend={[212, 220, 226, 231, 248, 252]} drill={{ label: 'View 252 employees', href: '#people' }} />
          <StatCard label="Leavers this month" value={6} previous={9} previousLabel="August" trend={[7, 5, 8, 11, 9, 6]} drill={{ label: 'View 6 leavers', href: '#leavers' }} />
          <StatCard label="Open positions" value={18} previous={18} previousLabel="August" drill={{ label: 'View 18 positions', href: '#positions' }} />
          <StatCard label="Net pay, September" value={2_42_80_000} previous={2_44_00_000} previousLabel="August" money trend={[231, 233, 238, 241, 244, 242.8].map((v) => v * 1_00_000)} drill={{ label: 'Open September payroll', href: '#payroll' }} />
          <StatCard label="Leave balance" value={14} unit="days" previous={16} previousLabel="last month" drill={{ label: 'View leave history', href: '#leave' }} />
          <StatCard label="Headcount" value={0} loading drill={{ label: 'View employees', href: '#people' }} />
        </div>
      </Section>
    </Stack>
  ),
};
export const StatCardsMobile: S = { ...mobile, render: StatCards.render };

/* ---------- Dark mode ---------- */
export const DarkMode: S = {
  ...dark,
  render: () => (
    <Stack>
      <Card><BarChart title="Joiners and leavers" xLabel="Department" categories={DEPTS} series={HIRES_LEAVERS} emphasis="Leavers" valueLabels /></Card>
      <Card><LineChart title="Utilisation by team" categories={MONTHS} series={UTIL} target={{ value: 75, label: 'Target 75%' }} /></Card>
      <Card width={960}><CapacityHeatmap title="Design team capacity" weeks={WEEKS} people={PEOPLE} /></Card>
      <Card><Heatmap title="Attendance rate by department" columns={MONTHS} rows={ATT_ROWS.slice(0, 4)} format={(v) => `${v}%`} max={100} /></Card>
      <div style={grid}>
        <StatCard label="Headcount" value={252} previous={248} previousLabel="August" trend={[212, 220, 226, 231, 248, 252]} drill={{ label: 'View 252 employees', href: '#people' }} />
        <Card width={260}><Gauge label="Team utilisation" value={72} target={75} /></Card>
      </div>
    </Stack>
  ),
};
