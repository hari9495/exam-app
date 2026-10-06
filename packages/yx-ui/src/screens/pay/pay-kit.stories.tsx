import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { formatINR, groupIndian } from '../../lib/format';
import { PAY_CALENDAR, TODAY } from '../_kit/data';
import { CompareBars, DaysStrip, DueDateStrip, IrreversibleSheet, MoneySummary, RangeMarker, RunProgress, RunStageTrack, StateBlock, WhyThisNumber } from './pay-kit';
import { CONFIRM_PHRASE, DUE_ITEMS, MY_DAYS, MY_DEDUCTIONS, MY_GROSS, MY_LINES, MY_NET, MY_PAYSLIP, MY_PREV_NET, PAYROLL_ADMIN, FIN_APPROVER, RUN, RUN_ROWS } from './pay-data';

const meta: Meta = { title: 'Screens/Pay/Kit · Pay building blocks', parameters: { layout: 'padded' } };
export default meta;
type S = StoryObj;

const col = { display: 'flex', flexDirection: 'column' as const, gap: 24, maxWidth: 960 };
const storyHref = (id: string) => `/?path=/story/${id}`;
const PDF_STORY = 'screens-pay-pay-21-·-payslip-viewer--document';
const QUERY_STORY = 'screens-pay-pay-21-·-payslip-viewer--raise-query';

// Paid only once the pay date has passed; before that the sub-line ("Pays on …") carries it.
const paid = PAY_CALENDAR.payDate.getTime() <= TODAY.getTime();
const delta = MY_NET - MY_PREV_NET;
const change = delta === 0 ? 'Same as August' : `${formatINR(Math.abs(delta))} ${delta > 0 ? 'more' : 'less'} than August`;
const employerCost = MY_GROSS + (MY_PAYSLIP.employer ?? []).reduce((a, l) => a + l.amount, 0);

export const Money: S = {
  name: 'MoneySummary · net first',
  render: () => (
    <div style={col}>
      <MoneySummary
        period="September 2026"
        net={MY_NET}
        gross={MY_GROSS}
        deductions={MY_DEDUCTIONS}
        employerCost={employerCost}
        payDate={PAY_CALENDAR.payDate}
        status={paid ? <Badge tone="success">Paid</Badge> : undefined}
        change={change}
        actions={
          <Button asChild>
            <a href={storyHref(PDF_STORY)} target="_top">
              Download PDF
            </a>
          </Button>
        }
      />
    </div>
  ),
};
export const Days: S = { name: 'DaysStrip', render: () => <DaysStrip days={MY_DAYS} periodLabel="September 2026" /> };
export const Why: S = {
  name: 'WhyThisNumber · line expanded',
  render: () => (
    <div style={col}>
      <WhyThisNumber lines={MY_LINES} defaultOpenId="tds" onQuery={() => window.top?.location.assign(storyHref(QUERY_STORY))} />
    </div>
  ),
};
export const Stages: S = {
  name: 'RunStageTrack',
  render: () => (
    <div style={col}>
      <RunStageTrack current="In review" />
      <RunStageTrack current="In review" blocked="Approval blocked" />
      <RunStageTrack current="Published" />
    </div>
  ),
};
export const Due: S = { name: 'DueDateStrip · with estimated penalty', render: () => <div style={col}><DueDateStrip items={DUE_ITEMS} /></div> };
const failedRow = RUN_ROWS[13];
export const Progress: S = {
  name: 'RunProgress · running, failed',
  render: () => (
    <div style={col}>
      <RunProgress action="Calculating payslips" done={Math.round(RUN.employees * 0.72)} total={RUN.employees} />
      <RunProgress action="Recalculating payslips" done={RUN.employees - 1} total={RUN.employees} finished failures={[{ employee: failedRow.name, code: failedRow.code, record: 'Compensation', field: 'No compensation effective 1 Sep 2026', fix: 'Add compensation' }]} />
    </div>
  ),
};
export const Bars: S = { name: 'CompareBars and RangeMarker', render: () => <div style={col}><CompareBars label="Tax" items={[{ label: 'New regime', value: MY_PAYSLIP.tax?.projectedTax ?? 0, emphasis: true, note: '(your choice)' }, { label: 'Old regime', value: 1_86_420 }]} /><RangeMarker label="Band" min={15_00_000} max={24_00_000} mid={19_50_000} value={18_00_000} /></div> };
export const States: S = { name: 'StateBlock · loading and error', render: () => <div style={col}><StateBlock state="loading">x</StateBlock><StateBlock state="error">x</StateBlock></div> };
export const Irreversible: S = {
  name: 'IrreversibleSheet · open',
  render: () => (
    <IrreversibleSheet
      open
      onOpenChange={() => {}}
      title="Approve and lock September 2026"
      subtitle={RUN.name}
      impact={[
        { label: 'Payslips approved', value: `${groupIndian(RUN.employees - RUN.withheld)} (+${RUN.withheld} held)` },
        { label: 'Net pay', value: formatINR(RUN.net) },
        { label: 'Cost to company', value: formatINR(RUN.employerCost) },
        { label: 'Period', value: '1–30 Sep 2026 locks' },
      ]}
      cannotUndo="Approving locks the September payroll period. Attendance and pay-affecting leave for September lock with it."
      correction="Changes after this go to October as arrears or recoveries. Reopening needs Payroll Admin and System Admin approval and is refused once the bank file is released."
      phrase={CONFIRM_PHRASE}
      maker={PAYROLL_ADMIN.name}
      checker={FIN_APPROVER.name}
      confirmLabel="Approve and lock"
      onConfirm={() => {}}
    />
  ),
};
