// Pay runs: PAY-01 payroll home, PAY-02 readiness, PAY-30 coverage monitor, PAY-03 run workspace,
// PAY-07 approve & lock, PAY-08 release bank file, PAY-09 publish payslips, PAY-29 weekly / fortnightly runs.
import { useMemo, useState, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Download, FileText, Landmark, Lock, Play, RefreshCw, Send, Upload } from 'lucide-react';
import { Button, Link, type ButtonProps } from '../../components/button';
import { Badge, PersonLabel, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Icon } from '../../components/foundations';
import { TextArea, TextField } from '../../components/inputs';
import { DatePicker } from '../../components/date';
import { useNarrow } from '../../components/stepper';
import { Dialog } from '../../components/overlay';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { Stepper, type StepperStep } from '../../components/stepper';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, SavedViewMenu } from '../../components/filters';
import { LineChart, StatCard } from '../../components/charts';
import { ApprovalTimeline, type ApprovalStep } from '../../components/timeline';
import { MenuItem } from '../../components/menu';
import { formatDate, formatINR, groupIndian } from '../../lib/format';
import type { FilterValue } from '../../lib/table';
import {
  Amount,
  DueDateStrip,
  FactRow,
  IrreversibleSheet,
  PayFrame,
  RunProgress,
  RunStageTrack,
  SectionTitle,
  StateBlock,
  WhyThisNumber,
  type DueItem,
  type ExplainedLine,
  type PayPersona,
  type ProgressFailure,
  type RunStage,
  type ViewState,
} from './pay-kit';
import { CONFIRM_PHRASE, DUE_ITEMS, EWA_REMITTANCE, FIN_APPROVER, PAYROLL_ADMIN, RUN, RUN_HISTORY, RUN_PICKS, RUN_ROWS, d, type RunRow } from './pay-data';
import { variance } from './pay-logic';
import { DueBadge } from '../time/time-kit';

/** Story ids this file links to (review/pay-story-ids.txt). */
const STORY = {
  readiness: 'screens-pay-pay-02-·-run-readiness--blocked',
  workspace: 'screens-pay-pay-03-·-run-workspace--payslips',
  variance: 'screens-pay-pay-03-·-run-workspace--variance',
  approve: 'screens-pay-pay-07-·-approve-run-and-lock-period--ready',
  bank: 'screens-pay-pay-08-·-release-bank-file--ready',
  publish: 'screens-pay-pay-09-·-publish-payslips--ready',
  bankFiles: 'screens-pay-pay-10-·-payments-and-files--files',
  register: 'screens-pay-pay-10-·-payments-and-files--register',
  journal: 'screens-pay-pay-10-·-payments-and-files--journal',
  offCycle: 'screens-pay-pay-11-·-off-cycle-run--choose-type',
  compensation: 'screens-pay-pay-12-·-compensation-and-revision--tab',
  setup: 'screens-pay-pay-16-·-payroll-set-up-wizard--registrations',
  salaryRegister: 'screens-pay-pay-25-·-payroll-reports--register',
  weeklyRun: 'screens-pay-pay-29-·-weekly-and-fortnightly-runs--weekly-run',
  coverage: 'screens-pay-pay-30-·-coverage-monitor--crossed',
  exceptions: 'screens-time-tim-04-·-attendance-exceptions--hr',
  people: 'screens-people-ppl-01-·-directory--hr-employees',
  calculating: 'screens-pay-pay-03-·-run-workspace--calculating',
  ctcReport: 'screens-pay-pay-25-·-payroll-reports--ctc',
  lopInput: 'screens-pay-pay-04-·-manual-lop-input--default',
  addHold: 'screens-pay-pay-06-·-salary-holds-and-releases--add-hold',
  statutoryHub: 'screens-compliance-cmp-01-·-statutory-hub--cards',
};
const storyHref = (id: string, args?: string) => `/?path=/story/${id}${args ? `&args=${args}` : ''}`;
/** Opens another story in the whole Storybook window (links inside a story would otherwise load in its frame). */
const goTo = (id: string, args?: string) => {
  (window.top ?? window).location.href = storyHref(id, args);
};
/** A drill link that opens another story. */
const drillTo = (label: string, id: string) => ({
  label,
  href: storyHref(id),
  onClick: (e: { preventDefault: () => void }) => {
    e.preventDefault();
    goTo(id);
  },
});

/** Variance lines in the run (net change above 10% or a new component): one list for home, workspace and approval. */
const FLAGGED_ROWS = RUN_ROWS.filter((r) => variance(r.net, r.prevNet).flagged || r.status === 'Flagged');
/** Open attendance exceptions at Bengaluru head office (punch mode, block). */
const OPEN_EXCEPTIONS = 4;
const failedRows = RUN_ROWS.filter((r) => r.status === 'Failed');
const FAILED_NET = failedRows.reduce((a, r) => a + r.net, 0);
const CASH = RUN_ROWS.filter((r) => r.mode === 'Cash').length;
const CHEQUE = RUN_ROWS.filter((r) => r.mode === 'Cheque').length;
const plural = (n: number, one: string, many = `${one}s`) => `${groupIndian(n)} ${n === 1 ? one : many}`;
/** Payslips published: everyone except held and failed payslips. */
const PUBLISHED = RUN.employees - RUN.withheld - RUN.failed;

/** A bordered button that opens another story (the next screen in the flow). */
function StoryButton({ to, args, icon, children, ...rest }: { to: string; args?: string; children: ReactNode } & Pick<ButtonProps, 'variant' | 'size' | 'icon'>) {
  return (
    <Button {...rest} asChild>
      <a href={storyHref(to, args)} target="_top">
        {icon && <Icon icon={icon} />}
        <span className="yx-button__label">{children}</span>
      </a>
    </Button>
  );
}

/* ================================================================== PAY-01 Payroll home */

export interface Blocker {
  id: string;
  severity: 'block' | 'warn';
  title: string;
  detail: string;
  action: string;
  /** Story the action opens. */
  to: string;
}

export const HOME_BLOCKERS: Blocker[] = [
  { id: 'b1', severity: 'block', title: `${OPEN_EXCEPTIONS} attendance exceptions open in Bengaluru head office`, detail: 'Bengaluru head office needs punches before approval. Resolve each by a request or an HR resolution.', action: 'Resolve exceptions', to: STORY.exceptions },
  { id: 'b2', severity: 'block', title: 'PF coverage: Kaveri Foods (Tamil Nadu) crossed 20 employees on 24 Sep', detail: 'Switch PF on with the registration, or record "applied, number awaited".', action: 'Open coverage', to: STORY.coverage },
  { id: 'b3', severity: 'warn', title: '3 employees without a verified PAN', detail: 'Not a block. TDS will be deducted at 20% or the slab rate, whichever is higher, until PAN is verified.', action: 'View employees', to: STORY.readiness },
  { id: 'b4', severity: 'warn', title: `${plural(FLAGGED_ROWS.length, 'variance line')} need acknowledgement`, detail: 'Net change above 10% or a new component since August.', action: 'Review variance', to: STORY.variance },
];
const MONTH_NAME: Record<string, string> = { Apr: 'April', May: 'May', Jun: 'June', Jul: 'July', Aug: 'August', Sep: 'September' };
/** Cost to company for a past month, scaled like that month's gross. */
const ctcAt = (i: number) => Math.round((RUN.employerCost * RUN_HISTORY[i].gross) / RUN.gross);

export interface PayrollHomeProps {
  state?: ViewState;
  persona?: PayPersona;
  stage?: RunStage;
  blockers?: Blocker[];
  due?: DueItem[];
}

/** PAY-01 · Payroll home (T6): run stepper, blockers, due-date strip, last totals. */
export function PayrollHomeScreen({ state = 'ready', persona = 'pa', stage = 'In review', blockers = HOME_BLOCKERS, due = DUE_ITEMS }: PayrollHomeProps) {
  const blocking = blockers.filter((b) => b.severity === 'block');
  const isFin = persona === 'fin';
  const [help, setHelp] = useState(false);
  const loaded = state === 'ready';
  // A draft run has no September totals yet: the cards show the last finished run (August) against July.
  const last = RUN_HISTORY.length - (stage === 'Draft' ? 2 : 1);
  const cur = RUN_HISTORY[last];
  const prev = RUN_HISTORY[last - 1];
  const curMonth = MONTH_NAME[cur.month];
  const prevMonth = MONTH_NAME[prev.month];
  const primary =
    stage === 'Draft' ? (
      <StoryButton variant="primary" icon={Play} to={STORY.readiness}>
        Check readiness
      </StoryButton>
    ) : stage === 'In review' ? (
      isFin ? (
        blocking.length > 0 ? (
          <>
            <span className="yx-pay-muted">
              {plural(blocking.length, 'item')} {blocking.length === 1 ? 'blocks' : 'block'} approval: {blocking.map((b) => (b.id === 'b1' ? 'attendance exceptions' : b.id === 'b2' ? 'PF coverage' : b.title)).join(', ')}
            </span>
            <Button variant="primary" icon={Lock} disabled>
              Approve and lock
            </Button>
          </>
        ) : (
          <StoryButton variant="primary" icon={Lock} to={STORY.approve}>
            Approve and lock
          </StoryButton>
        )
      ) : (
        <StoryButton variant="primary" to={STORY.workspace}>
          Open run workspace
        </StoryButton>
      )
    ) : stage === 'Approved and locked' ? (
      <StoryButton variant="primary" icon={Landmark} to={STORY.bank}>
        Release bank file
      </StoryButton>
    ) : stage === 'Paid' ? (
      <StoryButton variant="primary" icon={Send} to={STORY.publish}>
        Publish payslips
      </StoryButton>
    ) : null;
  return (
    <PayFrame page="home" persona={persona}>
      <PageHeader
        title="Payroll"
        description={isFin ? 'Runs waiting for your approval, payments and statutory dues.' : 'Current run, what blocks it, and what is due this month.'}
        facts={loaded ? `${RUN.payGroup} · ${groupIndian(RUN.employees)} employees · Cut-off ${formatDate(RUN.cutOff)} · Pay date ${formatDate(RUN.payDate)}` : undefined}
        actions={
          loaded ? (
            <>
              {!isFin && <StoryButton to={STORY.offCycle}>Start off-cycle run</StoryButton>}
              {primary}
            </>
          ) : undefined
        }
      />
      <Dialog
        open={help}
        onOpenChange={setHelp}
        title="What you need before you start"
        description="Keep these at hand. You can save the set-up and come back to it."
        footer={
          <>
            <Button onClick={() => setHelp(false)}>Close</Button>
            <StoryButton variant="primary" to={STORY.setup}>
              Set up payroll
            </StoryButton>
          </>
        }
      >
        <ul className="yx-pay-stack">
          <li>PF, ESI and professional tax registration numbers for the entity</li>
          <li>Pay group, pay day and the monthly attendance cut-off</li>
          <li>Salary structure: the components and how each is worked out</li>
          <li>The salary account and the bank's bulk upload format</li>
          <li>Pay already given this tax year, if you are moving from another system mid-year</li>
        </ul>
      </Dialog>
      <StateBlock
        state={state}
        errorTitle="We couldn't load payroll."
        rows={6}
        empty={
          <EmptyState
            title="Payroll isn't set up for this entity yet."
            description="Set up registrations, pay group, salary template and bank format. It takes about 30 minutes; you can save and come back."
            action={<StoryButton variant="primary" to={STORY.setup}>Set up payroll</StoryButton>}
            help={<Button size="sm" onClick={() => setHelp(true)}>What you need before you start</Button>}
          />
        }
      >
        <section className="yx-pay-stack" aria-label="Current run">
          <SectionTitle actions={<Badge tone={blocking.length ? 'danger' : 'info'}>{blocking.length ? `${blocking.length} blocking` : 'On track'}</Badge>}>{RUN.name}</SectionTitle>
          <RunStageTrack current={stage} blocked={stage === 'In review' && blocking.length ? 'Approval blocked' : undefined} />
        </section>
        <div className="yx-pay-grid">
          <div data-span="7" className="yx-pay-panel">
            <SectionTitle>What needs attention</SectionTitle>
            {blockers.length === 0 ? (
              <p className="yx-pay-muted">Nothing is blocking this run.</p>
            ) : (
              <ul className="yx-pay-findings">
                {blockers.map((b) => (
                  <li key={b.id} data-sev={b.severity}>
                    <Icon icon={b.severity === 'block' ? AlertCircle : AlertTriangle} label={b.severity === 'block' ? 'Blocks approval' : 'Warning'} />
                    <div>
                      <p className="yx-pay-findings__title">{b.title}</p>
                      <p className="yx-pay-findings__desc">
                        <Badge tone={b.severity === 'block' ? 'danger' : 'warning'}>{b.severity === 'block' ? 'Blocks approval' : 'Warning'}</Badge> {b.detail}
                      </p>
                    </div>
                    <div className="yx-pay-findings__acts">
                      <StoryButton size="sm" to={b.to}>{b.action}</StoryButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div data-span="5" className="yx-pay-panel">
            <SectionTitle>Due this month</SectionTitle>
            <DueDateStrip items={due} />
          </div>
        </div>
        <section aria-label="Last run totals" className="yx-pay-grid">
          {stage === 'Draft' && (
            <p data-span="12" className="yx-pay-muted">
              September isn't calculated yet. These are the totals of the last finished run, {curMonth}.
            </p>
          )}
          <div data-span="3">
            <StatCard label={`Net pay, ${curMonth}`} value={cur.net} money previous={prev.net} previousLabel={prevMonth} trend={RUN_HISTORY.slice(0, last + 1).map((h) => h.net)} drill={drillTo(`View ${cur.employees} payslips`, STORY.workspace)} />
          </div>
          <div data-span="3">
            <StatCard label={`Gross pay, ${curMonth}`} value={cur.gross} money previous={prev.gross} previousLabel={prevMonth} drill={drillTo('View salary register', STORY.salaryRegister)} />
          </div>
          <div data-span="3">
            <StatCard label={`Cost to company, ${curMonth}`} value={ctcAt(last)} money previous={ctcAt(last - 1)} previousLabel={prevMonth} drill={drillTo('View CTC report', STORY.ctcReport)} />
          </div>
          <div data-span="3">
            <StatCard label={`Employees paid, ${curMonth}`} value={cur.employees} previous={prev.employees} previousLabel={prevMonth} drill={drillTo('View employees', STORY.people)} />
          </div>
          <div data-span="12">
            <LineChart
              title="Gross and net pay, this tax year"
              description="Monthly runs for Kaveri Foods Pvt Ltd (Karnataka)."
              categories={RUN_HISTORY.map((h) => h.month)}
              series={[
                { name: 'Gross', values: RUN_HISTORY.map((h) => h.gross) },
                { name: 'Net', values: RUN_HISTORY.map((h) => h.net) },
              ]}
              money
              xLabel="Month"
              height={200}
            />
          </div>
        </section>
      </StateBlock>
    </PayFrame>
  );
}

/* ================================================================== PAY-02 Readiness + PAY-30 coverage */

export interface AttendanceGroup {
  group: string;
  mode: 'Punch · block' | 'Punch · warn' | 'Assumed present' | 'Timesheet';
  employees: number;
  exceptions: number;
  input: string;
}
/** Everyone in the Karnataka run works at Bengaluru head office: sales staff in the field are assumed present, the rest punch in. */
const FIELD_ROWS = RUN_ROWS.filter((r) => r.department === 'Sales');
const PUNCH_ROWS = RUN_ROWS.filter((r) => r.department !== 'Sales');
export const ATTENDANCE_GROUPS: AttendanceGroup[] = [
  { group: 'Bengaluru head office, office staff', mode: 'Punch · block', employees: PUNCH_ROWS.length, exceptions: OPEN_EXCEPTIONS, input: 'Attendance feed, locked 25 Sep' },
  { group: 'Bengaluru head office, sales field staff', mode: 'Assumed present', employees: FIELD_ROWS.length, exceptions: 0, input: `Manual LOP input: ${FIELD_ROWS.length} of ${FIELD_ROWS.length} entered` },
];

export interface InputSource {
  source: string;
  detail: string;
  count: number;
  amount?: number;
  status: 'Received' | 'Partly received' | 'Waiting';
}
export const INPUT_SOURCES: InputSource[] = [
  { source: 'Attendance feed (Time)', detail: 'Payable days, LOP, OT, night shifts', count: PUNCH_ROWS.length, status: 'Received' },
  { source: 'Manual LOP input', detail: 'Assumed-present groups', count: FIELD_ROWS.length, status: 'Received' },
  { source: 'Expenses', detail: 'Approved claims and advance-recovery instalments', count: 38, amount: 4_12_860, status: 'Received' },
  { source: 'Performance', detail: 'Comp-review changes, bonus-pool split', count: 6, amount: 1_10_400, status: 'Received' },
  { source: 'Engage', detail: 'Reward payouts (taxable)', count: 9, amount: 27_000, status: 'Received' },
  { source: 'Hiring', detail: 'Referral bonus, joining-bonus clawback', count: 3, amount: 65_000, status: 'Received' },
  { source: 'Cases', detail: 'Subsistence allowance', count: 1, amount: 25_600, status: 'Received' },
  { source: 'One-time pay', detail: 'Bonus, incentives, recoveries, arrears', count: 14, amount: 1_84_210, status: 'Waiting' },
  { source: 'Loans and EWA', detail: 'EMIs and draws to recover', count: 21, amount: 1_46_380, status: 'Received' },
  { source: 'Joiners and leavers', detail: 'Joined since the August run (no leavers)', count: RUN.employees - RUN_HISTORY[RUN_HISTORY.length - 2].employees, status: 'Received' },
];

export interface Finding {
  id: string;
  severity: 'block' | 'warn' | 'ok';
  title: string;
  detail: string;
  count: number;
  waivable: boolean;
  waived?: string;
  /** The employees the finding is about (run row ids); the drawer lists these. */
  ids?: string[];
}
/** Clean payslips at the head office, handed out in turn so each finding names its own people. */
const CLEAN = PUNCH_ROWS.filter((r) => r.status === 'Calculated' && r.mode === 'Bank').map((r) => r.id);
const pick = (from: number, n: number) => CLEAN.slice(from, from + n);
export const FINDINGS: Finding[] = [
  { id: 'f1', severity: 'block', title: 'Open attendance exceptions (Bengaluru head office)', detail: "Office staff punch in, so these can't be waived. Resolve each by a request or an HR resolution with a reason.", count: OPEN_EXCEPTIONS, waivable: false, ids: pick(0, OPEN_EXCEPTIONS) },
  { id: 'f2', severity: 'block', title: 'Missing or unverified bank details', detail: 'Both salaries are on hold until the account is verified, so they stay out of the bank file.', count: 2, waivable: true, ids: [RUN_PICKS.documents.id, RUN_PICKS.bankFailure.id] },
  { id: 'f3', severity: 'warn', title: 'PAN missing or inoperative', detail: 'TDS will be deducted at 20% or the slab rate, whichever is higher, until PAN is verified.', count: 3, waivable: true, ids: pick(4, 3) },
  { id: 'f4', severity: 'warn', title: 'Missing UAN or ESI number', detail: "Employees covered by PF or ESI without these numbers can't be included in the PF or ESI return file.", count: 2, waivable: true, ids: pick(7, 2) },
  { id: 'f5', severity: 'warn', title: 'Allowances above half of pay', detail: 'The part above half is added back to the PF and ESI wage, so contributions go up. Acknowledge each.', count: 7, waivable: true, ids: pick(9, 7) },
  { id: 'f6', severity: 'warn', title: 'Below the minimum wage', detail: 'Bengaluru, unskilled worker: the Karnataka minimum wage applies.', count: 1, waivable: true, ids: pick(16, 1) },
  { id: 'f7', severity: 'warn', title: 'Impossible values', detail: 'LOP before joining date (1), same bank account on 2 employees (1 pair).', count: 2, waivable: true, ids: pick(17, 2) },
  { id: 'f8', severity: 'ok', title: 'Negative net pay', detail: 'None this period.', count: 0, waivable: false },
  RUN.failed
    ? { id: 'f9', severity: 'warn', title: 'No compensation from 1 Sep', detail: `${groupIndian(RUN.employees - RUN.failed)} of ${groupIndian(RUN.employees)} have compensation. The payslip without it will fail until compensation is added.`, count: RUN.failed, waivable: false, ids: failedRows.map((r) => r.id) }
    : { id: 'f9', severity: 'ok', title: 'Compensation present for every employee', detail: `${groupIndian(RUN.employees)} of ${groupIndian(RUN.employees)}.`, count: 0, waivable: false },
];

export interface CoverageRow {
  entity: string;
  statute: string;
  basis: string;
  headcount: number;
  threshold: number;
  status: 'Below' | 'Approaching' | 'Covered' | 'Covered permanently' | 'Crossed: set-up needed';
  due?: string;
}
export const COVERAGE: CoverageRow[] = [
  { entity: 'Kaveri Foods (Tamil Nadu)', statute: 'PF', basis: 'Employees, any day in 12 months', headcount: 21, threshold: 20, status: 'Crossed: set-up needed', due: 'Register within 30 days of 24 Sep' },
  { entity: 'Kaveri Foods (Tamil Nadu)', statute: 'Bonus', basis: 'Employees', headcount: 21, threshold: 20, status: 'Crossed: set-up needed', due: 'Provision from October' },
  { entity: 'Kaveri Foods (Tamil Nadu)', statute: 'Gratuity', basis: 'Employees', headcount: 21, threshold: 10, status: 'Covered' },
  { entity: 'Kaveri Foods Pvt Ltd', statute: 'Standing orders (IR Code)', basis: 'Workers', headcount: 286, threshold: 300, status: 'Approaching' },
  { entity: 'Kaveri Foods Pvt Ltd', statute: 'CLRA', basis: 'Contract workers', headcount: 46, threshold: 50, status: 'Approaching' },
  { entity: 'Kaveri Foods Pvt Ltd', statute: 'PF', basis: 'Employees', headcount: 164, threshold: 20, status: 'Covered permanently' },
];

const COVER_TONE: Record<CoverageRow['status'], BadgeTone> = { Below: 'neutral', Approaching: 'warning', Covered: 'success', 'Covered permanently': 'success', 'Crossed: set-up needed': 'danger' };

/** PAY-30 · Coverage monitor panel (T1 panel on run readiness). */
export function CoverageMonitorPanel({ rows: initial = COVERAGE, state = 'ready', onChange }: { rows?: CoverageRow[]; state?: ViewState; onChange?: (rows: CoverageRow[]) => void }) {
  const phone = useNarrow(599);
  const [rows, setRows] = useState(initial);
  const [switching, setSwitching] = useState<{ row: CoverageRow; applied: boolean } | null>(null);
  const [regNo, setRegNo] = useState('');
  const [from, setFrom] = useState<Date | null>(d(1));
  const settle = (r: CoverageRow, due: string) => {
    const next = rows.map((x) => (x === r ? { ...x, status: 'Covered' as const, due } : x));
    setRows(next);
    onChange?.(next);
  };
  const close = () => {
    setSwitching(null);
    setRegNo('');
    setFrom(d(1));
  };
  const sw = switching?.row;
  const effect = sw
    ? sw.statute === 'PF'
      ? `PF deductions start for ${sw.headcount} employees of ${sw.entity} from the September run, with the company's matching contribution.`
      : `${sw.statute} provisioning starts for ${sw.headcount} employees of ${sw.entity}.`
    : '';
  const canSave = !!from && (switching?.applied || regNo.trim().length >= 5);
  return (
    <section className="yx-pay-panel" aria-label="Coverage monitor">
      <SectionTitle actions={<StoryButton size="sm" to={STORY.setup}>Open statutory set-up</StoryButton>}>Coverage monitor</SectionTitle>
      <p className="yx-pay-muted">Sites within 2 employees (or 90%) of a legal threshold. A crossed threshold blocks run approval until the law is switched on for that site.</p>
      <Dialog
        open={!!switching}
        onOpenChange={(o) => !o && close()}
        title={switching?.applied ? `Record ${sw?.statute} as applied for?` : `Switch ${sw?.statute} on for ${sw?.entity}?`}
        description={effect}
        footer={
          <>
            <Button onClick={close}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!canSave}
              onClick={() => {
                if (sw && from) settle(sw, switching?.applied ? `Applied, number awaited · from ${formatDate(from)}` : `${sw.statute} ${regNo.trim()} · from ${formatDate(from)}`);
                close();
              }}
            >
              {switching?.applied ? 'Record applied' : `Switch ${sw?.statute} on`}
            </Button>
          </>
        }
      >
        <div className="yx-pay-stack">
          {!switching?.applied && (
            <FormField label="Registration number" required helper="As on the registration certificate.">
              <TextField value={regNo} onChange={setRegNo} />
            </FormField>
          )}
          <FormField label="Covered from" required helper="The date the threshold was crossed or the registration starts.">
            <DatePicker value={from} onChange={setFrom} />
          </FormField>
        </div>
      </Dialog>
      <StateBlock state={rows.length ? state : 'empty'} empty={<p className="yx-pay-muted">No site is near a threshold.</p>}>
        {phone ? (
          <ul className="yx-pay-cards" aria-label="Coverage">
            {rows.map((r) => (
              <li key={r.entity + r.statute} data-state={r.status.startsWith('Crossed') ? 'error' : undefined}>
                <div className="yx-pay-cards__row">
                  <strong>
                    {r.statute} · {r.entity}
                  </strong>
                  <Badge tone={COVER_TONE[r.status]}>{r.status}</Badge>
                </div>
                <span className="yx-pay-note">
                  {r.basis}: {groupIndian(r.headcount)} of {groupIndian(r.threshold)}
                </span>
                {r.status.startsWith('Crossed') ? (
                  <div className="yx-pay-row">
                    <Button size="sm" onClick={() => setSwitching({ row: r, applied: false })}>Switch on</Button>
                    <Button size="sm" onClick={() => setSwitching({ row: r, applied: true })}>Record applied</Button>
                  </div>
                ) : (
                  r.due && <span className="yx-pay-note">{r.due}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
        <div className="yx-pay-scroll">
          <table className="yx-pay-table">
            <thead>
              <tr>
                <th scope="col">Entity</th>
                <th scope="col">Statute</th>
                <th scope="col">Counting</th>
                <th scope="col" data-num>
                  Headcount / threshold
                </th>
                <th scope="col">Status</th>
                <th scope="col">Next step</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.entity + r.statute} data-state={r.status.startsWith('Crossed') ? 'error' : undefined}>
                  <th scope="row">{r.entity}</th>
                  <td>{r.statute}</td>
                  <td>{r.basis}</td>
                  <td data-num>
                    {groupIndian(r.headcount)} / {groupIndian(r.threshold)}
                  </td>
                  <td>
                    <Badge tone={COVER_TONE[r.status]}>{r.status}</Badge>
                  </td>
                  <td>
                    {r.status.startsWith('Crossed') ? (
                      <span className="yx-pay-row">
                        <Button size="sm" onClick={() => setSwitching({ row: r, applied: false })}>Switch on</Button>
                        <Button size="sm" onClick={() => setSwitching({ row: r, applied: true })}>Record applied</Button>
                      </span>
                    ) : (
                      <span className="yx-pay-muted">{r.due ?? '—'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </StateBlock>
    </section>
  );
}

export interface ReadinessProps {
  findings?: Finding[];
  groups?: AttendanceGroup[];
  inputs?: InputSource[];
  coverage?: CoverageRow[];
  defaultWaiveId?: string;
  state?: ViewState;
}

/** PAY-02 · Run readiness / pre-flight (T5 step). */
export function RunReadinessScreen({ findings: initial = FINDINGS, groups = ATTENDANCE_GROUPS, inputs = INPUT_SOURCES, coverage: initialCoverage = COVERAGE, defaultWaiveId, state = 'ready' }: ReadinessProps) {
  const phone = useNarrow(599);
  const [findings, setFindings] = useState(initial);
  const [coverage, setCoverage] = useState(initialCoverage);
  const [checked, setChecked] = useState(false);
  const [viewing, setViewing] = useState<Finding | null>(null);
  const [waiving, setWaiving] = useState<Finding | null>(initial.find((f) => f.id === defaultWaiveId) ?? null);
  const [reason, setReason] = useState('');
  const hardBlocks = findings.filter((f) => f.severity === 'block' && !f.waived);
  const coverageBlock = coverage.some((c) => c.status.startsWith('Crossed'));
  const readiness = (
    <div className="yx-pay-stack">
      {hardBlocks.length > 0 || coverageBlock ? (
        <InlineAlert tone="danger" title={`${plural(hardBlocks.length + (coverageBlock ? 1 : 0), 'item')} ${hardBlocks.length + (coverageBlock ? 1 : 0) === 1 ? 'blocks' : 'block'} calculation or approval`}>
          You can calculate once waivable items are waived with a reason. Attendance exceptions and coverage set-up can't be waived; they block approval.
        </InlineAlert>
      ) : (
        <InlineAlert tone="success" title="Ready to calculate">
          Every blocking item is resolved or waived with a reason.
        </InlineAlert>
      )}
      <section className="yx-pay-panel" aria-label="Attendance mode per group">
        <SectionTitle>Attendance mode per group</SectionTitle>
        {phone ? (
          <ul className="yx-pay-cards" aria-label="Attendance mode per group">
            {groups.map((g) => (
              <li key={g.group} data-state={g.mode === 'Punch · block' && g.exceptions ? 'error' : undefined}>
                <div className="yx-pay-cards__row">
                  <strong>{g.group}</strong>
                  <Badge tone={g.mode === 'Assumed present' ? 'info' : 'neutral'}>{g.mode}</Badge>
                </div>
                <span className="yx-pay-note">
                  {plural(g.employees, 'employee')} · {plural(g.exceptions, 'open exception')}
                  {g.exceptions > 0 && <> · {g.mode === 'Punch · block' ? 'blocks approval' : g.mode === 'Punch · warn' ? 'warning' : 'missing timesheet'}</>}
                </span>
                <span className="yx-pay-note">{g.input}</span>
                {g.mode === 'Assumed present' && (
                  <div className="yx-pay-row">
                    <StoryButton size="sm" to={STORY.lopInput}>
                      Open LOP input
                    </StoryButton>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
        <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
        <table className="yx-pay-table">
          <thead>
            <tr>
              <th scope="col">Group</th>
              <th scope="col">Mode</th>
              <th scope="col" data-num>
                Employees
              </th>
              <th scope="col" data-num>
                Open exceptions
              </th>
              <th scope="col">Input</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.group} data-state={g.mode === 'Punch · block' && g.exceptions ? 'error' : undefined}>
                <th scope="row">{g.group}</th>
                <td>
                  <Badge tone={g.mode === 'Assumed present' ? 'info' : 'neutral'}>{g.mode}</Badge>
                </td>
                <td data-num>{g.employees}</td>
                <td data-num>
                  {g.exceptions}
                  {g.exceptions > 0 && <> · {g.mode === 'Punch · block' ? 'blocks approval' : g.mode === 'Punch · warn' ? 'warning' : 'missing timesheet'}</>}
                </td>
                <td>
                  {g.mode === 'Assumed present' ? (
                    <span className="yx-pay-row">
                      {g.input}
                      <StoryButton size="sm" to={STORY.lopInput}>
                        Open LOP input
                      </StoryButton>
                    </span>
                  ) : (
                    g.input
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        )}
      </section>
      <section className="yx-pay-panel" aria-label="Inputs">
        <SectionTitle>Inputs for this period</SectionTitle>
        {phone ? (
          <ul className="yx-pay-cards" aria-label="Inputs for this period">
            {inputs.map((s) => (
              <li key={s.source}>
                <div className="yx-pay-cards__row">
                  <strong>{s.source}</strong>
                  <Badge tone={s.status === 'Received' ? 'success' : 'warning'}>{s.status}</Badge>
                </div>
                <span className="yx-pay-note">{s.detail}</span>
                <span>
                  {plural(s.count, 'record')}
                  {s.amount != null && <> · {formatINR(s.amount)}</>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
        <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
        <table className="yx-pay-table">
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">What</th>
              <th scope="col" data-num>
                Records
              </th>
              <th scope="col" data-num>
                Amount
              </th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {inputs.map((s) => (
              <tr key={s.source}>
                <th scope="row">{s.source}</th>
                <td>{s.detail}</td>
                <td data-num>{groupIndian(s.count)}</td>
                <td data-num>{s.amount != null ? formatINR(s.amount) : '—'}</td>
                <td>
                  <Badge tone={s.status === 'Received' ? 'success' : 'warning'}>{s.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        )}
      </section>
      <section className="yx-pay-panel" aria-label="Validations">
        <SectionTitle actions={<Button size="sm" icon={RefreshCw} onClick={() => setChecked(true)}>Run checks again</Button>}>Validations</SectionTitle>
        {checked && (
          <p className="yx-pay-muted" role="status">
            Checked again just now: {plural(findings.filter((f) => f.severity !== 'ok' && !f.waived).length, 'item')} still open, no new findings.
          </p>
        )}
        <ul className="yx-pay-findings">
          {findings.map((f) => (
            <li key={f.id} data-sev={f.waived ? 'ok' : f.severity}>
              <Icon icon={f.severity === 'ok' || f.waived ? CheckCircle2 : f.severity === 'block' ? AlertCircle : AlertTriangle} label={f.waived ? 'Waived' : f.severity === 'ok' ? 'Passed' : f.severity === 'block' ? 'Blocking' : 'Warning'} />
              <div>
                <p className="yx-pay-findings__title">
                  {f.title} {f.count > 0 && <Badge>{f.count}</Badge>}
                </p>
                <p className="yx-pay-findings__desc">{f.waived ? `Waived by ${PAYROLL_ADMIN.name}: ${f.waived}` : f.detail}</p>
              </div>
              <div className="yx-pay-findings__acts">
                {f.severity !== 'ok' && !f.waived && (
                  <Button size="sm" onClick={() => setViewing(f)}>
                    View {f.count}
                  </Button>
                )}
                {f.waivable && f.severity !== 'ok' && !f.waived && (
                  <Button size="sm" onClick={() => setWaiving(f)}>
                    Waive
                  </Button>
                )}
                {!f.waivable && f.severity === 'block' && <Badge tone="danger">Can't be waived</Badge>}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <CoverageMonitorPanel rows={coverage} onChange={setCoverage} />
      <Drawer
        open={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
        title={viewing?.title ?? ''}
        subtitle={viewing ? `${viewing.count} ${viewing.count === 1 ? 'employee' : 'employees'} · ${viewing.detail}` : undefined}
        footer={
          <>
            <Button onClick={() => setViewing(null)}>Close</Button>
            {viewing?.id === 'f1' ? (
              <StoryButton variant="primary" to={STORY.exceptions}>
                Resolve exceptions
              </StoryButton>
            ) : viewing?.id === 'f9' ? (
              <StoryButton variant="primary" to={STORY.compensation}>
                Add compensation
              </StoryButton>
            ) : (
              <StoryButton variant="primary" to={STORY.people}>
                Open people directory
              </StoryButton>
            )}
          </>
        }
      >
        <div className="yx-pay-stack">
          {viewing && RUN_ROWS.filter((r) => viewing.ids?.includes(r.id)).map((r) => <PersonLabel key={r.id} name={r.name} secondary={`${r.code} · ${r.department} · ${r.location}`} />)}
        </div>
      </Drawer>
      <Dialog
        open={!!waiving}
        onOpenChange={(o) => !o && setWaiving(null)}
        title={`Waive "${waiving?.title ?? ''}"?`}
        description="The finding stays on the audit trail with your reason. Waived items don't block calculation."
        footer={
          <>
            <Button onClick={() => setWaiving(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={reason.trim().length < 5}
              onClick={() => {
                setFindings((fs) => fs.map((f) => (f.id === waiving?.id ? { ...f, waived: reason } : f)));
                setWaiving(null);
                setReason('');
              }}
            >
              Waive with reason
            </Button>
          </>
        }
      >
        <FormField label="Reason" required helper="At least 5 characters. Shown to the approver.">
          <TextArea value={reason} onChange={setReason} rows={3} />
        </FormField>
      </Dialog>
    </div>
  );
  const later = (title: string, note: string): StepperStep => ({ id: title, title, status: 'locked', statusNote: note, content: <p className="yx-pay-muted">{note}</p> });
  // Calculation waits only for waivable blocks and crossed coverage; attendance exceptions block approval, not calculation.
  const toClear = hardBlocks.filter((f) => f.waivable).length + (coverageBlock ? 1 : 0);
  const calcBlocked = toClear > 0 ? `${plural(toClear, 'item')} to resolve or waive` : undefined;
  return (
    <PayFrame page="runs">
      <PageHeader title="Run readiness" description={RUN.name} facts={state === 'ready' ? `Inputs frozen at cut-off ${formatDate(RUN.cutOff)} · ${RUN.employees} employees` : undefined} status={<Badge tone="warning">Draft</Badge>} />
      <StateBlock state={state} rows={8} errorTitle="We couldn't load run readiness.">
        <Stepper
          title="September 2026 run"
          finishLabel="Calculate payroll"
          continueBlocked={calcBlocked}
          steps={[
            { id: 'ready', title: 'Readiness', description: 'Inputs, attendance and validations', content: readiness },
            calcBlocked
              ? later('Calculate', `Available once blocking items are resolved or waived (${calcBlocked}).`)
              : {
                  id: 'Calculate',
                  title: 'Calculate',
                  description: `${groupIndian(RUN.employees)} payslips`,
                  content: (
                    <div className="yx-pay-stack">
                      <p>
                        Calculates {groupIndian(RUN.employees)} payslips from the inputs frozen on {formatDate(RUN.cutOff)}. You can recalculate any time before approval.
                      </p>
                      <span className="yx-pay-row">
                        <StoryButton variant="primary" icon={Play} to={STORY.calculating}>
                          Calculate payroll
                        </StoryButton>
                      </span>
                    </div>
                  ),
                },
            later('Review variance', 'Available after calculation.'),
            later('Approve and lock', 'Needs finance approval (maker ≠ checker).'),
            later('Bank file', 'After approval.'),
            later('Publish payslips', 'After payment.'),
          ]}
        />
      </StateBlock>
    </PayFrame>
  );
}

/* ================================================================== PAY-03 Run workspace */

export const ROW_TONE: Record<string, BadgeTone> = { Calculated: 'success', Flagged: 'warning', Held: 'neutral', Failed: 'danger', Acknowledged: 'info' };

export const SAMPLE_LINES = (r: RunRow): ExplainedLine[] => {
  const basic = Math.round(r.gross * 0.45);
  const hra = Math.round(basic * 0.4);
  const lopAmt = Math.round((r.gross / 30) * r.lop);
  const pf = Math.round(Math.min(basic, 15_000) * 0.12);
  const tds = Math.max(0, r.deductions - lopAmt - pf - 200);
  return [
    { id: 'b', label: 'Basic', amount: basic, kind: 'earning', formula: 'monthly gross × 45%', inputs: `Monthly gross ${formatINR(r.gross)} per compensation from 1 Apr 2026`, rule: 'Template India standard CTC v3' },
    { id: 'h', label: 'House rent allowance', amount: hra, kind: 'earning', formula: 'basic × 40% (non-metro)', rule: 'Template India standard CTC v3' },
    { id: 's', label: 'Special allowance', amount: r.gross - basic - hra, kind: 'earning', formula: 'balancing figure', rule: 'Template India standard CTC v3' },
    { id: 'pf', label: 'Provident fund (employee)', amount: pf, kind: 'deduction', formula: '12% × min(PF wage, ₹15,000)', inputs: `PF wage ${formatINR(basic)}`, rule: 'IN.PF v2025-11' },
    { id: 'pt', label: 'Professional tax (Karnataka)', amount: 200, kind: 'deduction', formula: 'Slab ₹25,000 and above', rule: 'IN.PT Karnataka v2025-04' },
    { id: 't', label: 'Income tax (TDS)', amount: tds, kind: 'deduction', formula: '(projected tax − deducted) ÷ remaining months', rule: 'IN.TDS 2025 Act · v2026-04' },
    ...(r.lop ? [{ id: 'l', label: `Unpaid leave, ${r.lop} days`, amount: lopAmt, kind: 'deduction' as const, formula: `gross × ${r.lop} ÷ 30`, inputs: 'Attendance feed', source: 'Attendance, locked 25 Sep' }] : []),
  ];
};

export type RunTab = 'inputs' | 'payslips' | 'variance' | 'validations' | 'approvals' | 'files';
export type RunPhase = 'calculating' | 'failed' | 'review' | 'approved' | 'paid' | 'published';
export type RunSheet = 'approve' | 'bank' | 'publish' | null;

export interface RunWorkspaceProps {
  persona?: PayPersona;
  tab?: RunTab;
  phase?: RunPhase;
  rows?: RunRow[];
  openRowId?: string;
  sheet?: RunSheet;
  sheetVariant?: 'ready' | 'blocked' | 'same-person' | 'self-approval' | 'regenerate' | 'done';
  state?: ViewState;
  /** Attendance exceptions still open at Bengaluru head office (they block approval). Default: open until the run is approved. */
  exceptionsOpen?: boolean;
}

const PHASE_STAGE: Record<RunPhase, RunStage> = { calculating: 'Draft', failed: 'Draft', review: 'In review', approved: 'Approved and locked', paid: 'Paid', published: 'Published' };
const EXCEPTION_FILTER = ['Flagged', 'Held', 'Failed'];
type Notice = { tone: 'success' | 'info' | 'warning' | 'danger'; title: string; body?: ReactNode; action?: ReactNode };

/** PAY-03 · Run workspace (T3 / T5): Inputs · Payslips · Variance · Validations · Approvals · Files. */
export function RunWorkspaceScreen({ persona = 'pa', tab = 'payslips', phase: initialPhase = 'review', rows: inputRows = RUN_ROWS, openRowId, sheet: initialSheet = null, sheetVariant = 'ready', state = 'ready', exceptionsOpen: exceptionsProp }: RunWorkspaceProps) {
  const isFin = persona === 'fin';
  const approvingDone = initialSheet === 'approve' && sheetVariant === 'done';
  const [phase, setPhase] = useState<RunPhase>(approvingDone ? 'approved' : initialPhase);
  const [tabNow, setTab] = useState<RunTab>(tab);
  const [retried, setRetried] = useState(false);
  const [open, setOpen] = useState<RunRow | null>(inputRows.find((r) => r.id === openRowId) ?? null);
  const [sheet, setSheet] = useState<RunSheet>(initialSheet);
  const [done, setDone] = useState(sheetVariant === 'done');
  const [sent, setSent] = useState(false);
  const [filters, setFilters] = useState<FilterValue[]>([{ key: 'status', type: 'multi', values: [] }]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [audit, setAudit] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const locked = !['review', 'calculating', 'failed'].includes(initialPhase);
  // Payroll acknowledges variance before submitting, so finance (and every later phase) sees it acknowledged.
  const [submitted, setSubmitted] = useState(isFin || locked);
  const [acked, setAcked] = useState<string[]>(isFin || locked ? FLAGGED_ROWS.map((r) => r.id) : []);
  const exceptionsOpen = exceptionsProp ?? (sheetVariant === 'blocked' || (!locked && !approvingDone));
  const narrow = useNarrow(599);
  const pending = state !== 'ready';
  // While calculating, only the payslips done so far are listed; after a retry the failed ones are calculated.
  const calcDone = Math.round(RUN.employees * 0.72);
  const rows = useMemo(
    () =>
      phase === 'calculating'
        ? inputRows.slice(0, calcDone)
        : retried
          ? inputRows.map((r) => (r.status === 'Failed' ? { ...r, status: 'Calculated' as const, reason: undefined } : r))
          : inputRows,
    [phase, retried, inputRows, calcDone],
  );
  const statusFilter = filters.find((f) => f.key === 'status');
  const filterValues = statusFilter && statusFilter.type === 'multi' ? statusFilter.values : [];
  const shown = useMemo(() => (filterValues.length ? rows.filter((r) => filterValues.includes(r.status)) : rows), [rows, filterValues]);
  const flagged = rows.filter((r) => variance(r.net, r.prevNet).flagged || r.status === 'Flagged');
  const unacked = flagged.filter((r) => !acked.includes(r.id));
  const failedNow = inputRows.filter((r) => r.status === 'Failed');
  const ackReason = unacked.length ? `${plural(unacked.length, 'variance line')} to acknowledge` : undefined;
  const approveBlock = exceptionsOpen ? `${OPEN_EXCEPTIONS} attendance exceptions open` : unacked.length ? `${plural(unacked.length, 'variance line')} to acknowledge` : undefined;

  const cols: TableColumn<RunRow>[] = [
    { key: 'name', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: `${r.code} · ${r.department}` }), width: 200 },
    { key: 'days', header: 'Days paid', type: 'number', value: (r) => r.payableDays, width: 90 },
    { key: 'lop', header: 'LOP', type: 'number', value: (r) => r.lop, width: 80 },
    { key: 'gross', header: 'Gross', type: 'money', value: (r) => r.gross, total: 'sum', width: 120 },
    { key: 'ded', header: 'Deductions', type: 'money', value: (r) => r.deductions, total: 'sum', width: 130 },
    { key: 'net', header: 'Net pay', type: 'money', value: (r) => r.net, total: 'sum', width: 120 },
    { key: 'mode', header: 'Pay mode', value: (r) => r.mode, width: 90, optional: true },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => ROW_TONE[String(v)] ?? 'neutral', width: 120 },
    { key: 'reason', header: 'Why', value: (r) => r.reason ?? '', width: 260, optional: true },
  ];
  const failures: ProgressFailure[] = failedNow.map((r) => ({ employee: r.name, code: r.code, record: 'Compensation', field: r.reason ?? 'Compensation missing', fix: 'Add compensation' }));
  const preparedAt = new Date(2026, 8, 28, 18, 10);
  const approvedAt = new Date(2026, 8, 29, 9, 42);
  const approvalSteps: ApprovalStep[] = [
    { id: 'a1', label: 'Prepared', status: submitted ? 'done' : 'current', approver: PAYROLL_ADMIN.name, at: submitted ? preparedAt : undefined, comment: submitted ? `Variance acknowledged for ${plural(flagged.length, 'employee')}.` : undefined },
    { id: 'a2', label: 'Finance approval', status: phase === 'review' ? (submitted ? 'current' : 'pending') : 'done', approver: FIN_APPROVER.name, at: phase === 'review' ? undefined : approvedAt },
    { id: 'a3', label: 'Period locked', status: phase === 'review' ? 'pending' : 'done', at: phase === 'review' ? undefined : approvedAt },
  ];
  const auditTrail = [
    { at: new Date(2026, 8, 25, 23, 59), who: 'System', what: `Inputs frozen at cut-off for ${plural(RUN.employees, 'employee')}` },
    { at: new Date(2026, 8, 28, 16, 30), who: PAYROLL_ADMIN.name, what: `Calculated ${plural(RUN.employees, 'payslip')}` },
    ...(submitted ? [{ at: preparedAt, who: PAYROLL_ADMIN.name, what: `Acknowledged ${plural(flagged.length, 'variance line')} and submitted for approval` }] : []),
    ...(phase !== 'review' && phase !== 'calculating' && phase !== 'failed' ? [{ at: approvedAt, who: FIN_APPROVER.name, what: 'Approved and locked the period' }] : []),
  ];
  const stage = PHASE_STAGE[phase];
  const periodLocked = phase !== 'review' && phase !== 'calculating' && phase !== 'failed';
  const headerAction =
    phase === 'review' ? (
      isFin ? (
        <>
          {approveBlock && <span className="yx-pay-muted">{approveBlock}</span>}
          <Button variant="approve" icon={Lock} disabled={!!approveBlock} onClick={() => setSheet('approve')}>
            Approve and lock
          </Button>
        </>
      ) : submitted ? null : (
        <>
          {ackReason && (
            <Button size="sm" onClick={() => setTab('variance')}>
              {ackReason}
            </Button>
          )}
          <Button
            variant="primary"
            icon={Send}
            disabled={!!ackReason}
            onClick={() => {
              setSubmitted(true);
              setNotice({ tone: 'success', title: `Sent to ${FIN_APPROVER.name} for approval`, body: exceptionsOpen ? `They can approve and lock the period once the ${OPEN_EXCEPTIONS} attendance exceptions are resolved.` : 'They can now approve and lock the period.' });
            }}
          >
            Submit for approval
          </Button>
        </>
      )
    ) : phase === 'approved' ? (
      <Button variant="primary" icon={Landmark} onClick={() => setSheet('bank')}>
        Release bank file
      </Button>
    ) : phase === 'paid' ? (
      <Button variant="primary" icon={Send} onClick={() => setSheet('publish')}>
        Publish payslips
      </Button>
    ) : phase === 'failed' ? (
      <Button
        variant="primary"
        icon={RefreshCw}
        onClick={() => {
          setPhase('review');
          setRetried(true);
        }}
      >
        Retry {failures.length} failed
      </Button>
    ) : null;

  const blocked =
    sheetVariant === 'blocked' || exceptionsOpen
      ? `${OPEN_EXCEPTIONS} attendance exceptions are open in Bengaluru head office, where staff punch in. Resolve them in Time › Attendance exceptions, then approve.`
      : unacked.length
        ? `${plural(unacked.length, 'variance line')} still need acknowledgement by payroll before approval.`
        : undefined;
  const checker = sheetVariant === 'same-person' || sheetVariant === 'self-approval' ? PAYROLL_ADMIN.name : isFin ? FIN_APPROVER.name : PAYROLL_ADMIN.name;
  const money = (v: number) => (pending ? '—' : phase === 'calculating' ? 'Calculating…' : formatINR(v));

  return (
    <PayFrame page="runs" persona={persona}>
      <ObjectHeader
        name={RUN.name}
        icon={FileText}
        secondary={`Pay group ${RUN.payGroup} · Pay date ${formatDate(RUN.payDate)} · Rule pack IN v2026-09`}
        status={
          <>
            <Badge tone={phase === 'failed' ? 'danger' : phase === 'review' ? 'warning' : phase === 'calculating' ? 'info' : 'success'}>{phase === 'failed' ? `Calculation failed for ${failures.length}` : stage}</Badge>
            {phase !== 'review' && phase !== 'calculating' && phase !== 'failed' && <Badge tone="neutral">Period locked</Badge>}
          </>
        }
        facts={[
          { label: 'Employees', value: pending ? '—' : groupIndian(RUN.employees) },
          { label: 'Gross', value: money(RUN.gross) },
          { label: 'Net pay', value: money(RUN.net) },
          { label: 'Cost to company', value: money(RUN.employerCost) },
          { label: 'Held', value: pending ? '—' : plural(RUN.withheld, 'payslip') },
        ]}
        actions={
          pending ? undefined : (
            <>
              {/* On a phone the header keeps only the main action; the register moves to the ⋯ menu. */}
              {!narrow && (
                <StoryButton icon={Download} to={STORY.salaryRegister}>
                  Download register
                </StoryButton>
              )}
              {headerAction}
            </>
          )
        }
        menu={
          pending ? undefined : (
            <>
              {narrow && <MenuItem onSelect={() => goTo(STORY.salaryRegister)}>Download register</MenuItem>}
              <MenuItem
                onSelect={() => {
                  setTab('payslips');
                  setNotice({ tone: 'info', title: 'Pick the employee to recalculate', body: 'Open the row menu (⋯) on their payslip and choose Recalculate.' });
                }}
              >
                Recalculate one employee
              </MenuItem>
              <MenuItem onSelect={() => setAudit(true)}>View audit trail</MenuItem>
              {(phase === 'review' || phase === 'failed') && (
                <MenuItem destructive onSelect={() => setVoiding(true)}>
                  Void run
                </MenuItem>
              )}
            </>
          )
        }
      />
      <RunStageTrack current={stage} blocked={phase === 'failed' ? `${plural(failures.length, 'payslip')} failed` : undefined} />
      {phase === 'calculating' && <RunProgress action="Calculating payslips" done={calcDone} total={RUN.employees} />}
      {phase === 'failed' && (
        <RunProgress
          action="Calculating payslips"
          done={RUN.employees - failures.length}
          total={RUN.employees}
          failures={failures}
          finished
          onFix={() => goTo(STORY.compensation)}
        />
      )}
      {retried && (
        <InlineAlert tone="success" title={`${plural(failures.length, 'payslip')} recalculated`}>
          {failures.map((f) => f.employee).join(' and ')} calculated on retry. All {groupIndian(RUN.employees)} payslips are ready for review.
        </InlineAlert>
      )}
      {notice && (
        <InlineAlert
          tone={notice.tone}
          title={notice.title}
          actions={
            <>
              {notice.action}
              <Button size="sm" onClick={() => setNotice(null)}>
                Dismiss
              </Button>
            </>
          }
        >
          {notice.body}
        </InlineAlert>
      )}
      <Drawer
        open={audit}
        onOpenChange={setAudit}
        title="Audit trail"
        subtitle={RUN.name}
        footer={<Button onClick={() => setAudit(false)}>Close</Button>}
      >
        <ul className="yx-pay-stack">
          {auditTrail.map((a) => (
            <li key={a.what}>
              <p className="yx-pay-findings__title">{a.what}</p>
              <p className="yx-pay-muted">
                {a.who} · {formatDate(a.at)}, {a.at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
              </p>
            </li>
          ))}
        </ul>
      </Drawer>
      <Dialog
        open={voiding}
        onOpenChange={setVoiding}
        title="Void the September 2026 run?"
        description={`All ${groupIndian(RUN.employees)} calculated payslips are discarded. Inputs, holds and one-time pay stay, so you can calculate the run again from readiness. The audit trail keeps a record.`}
        footer={
          <>
            <Button onClick={() => setVoiding(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                setVoiding(false);
                setNotice({ tone: 'warning', title: 'September 2026 run voided', body: 'The payslips were discarded. Check readiness and calculate again.', action: <StoryButton size="sm" to={STORY.readiness}>Check readiness</StoryButton> });
              }}
            >
              Void run
            </Button>
          </>
        }
      />
      <StateBlock state={state} rows={10} errorTitle="We couldn't load this pay run.">
        <Tabs value={tabNow} onValueChange={(v) => setTab(v as RunTab)}>
          <TabsList aria-label="Run sections">
            <TabsTrigger value="inputs">Inputs</TabsTrigger>
            <TabsTrigger value="payslips" count={rows.length}>
              Payslips
            </TabsTrigger>
            <TabsTrigger value="variance" count={unacked.length}>
              Variance
            </TabsTrigger>
            <TabsTrigger value="validations">Validations</TabsTrigger>
            <TabsTrigger value="approvals">Approvals</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
          </TabsList>
          <TabsContent value="inputs">
            <div className="yx-pay-stack">
              <FactRow
                items={[
                  { label: 'Inputs frozen', value: `${formatDate(RUN.cutOff)}, 11:59 pm` },
                  { label: 'Late requests', value: '3 moved to October as arrears' },
                  { label: 'One-time pay', value: formatINR(1_84_210) },
                  { label: 'Recoveries', value: formatINR(1_46_380) },
                ]}
              />
              <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
              <table className="yx-pay-table">
                <thead>
                  <tr>
                    <th scope="col">Source</th>
                    <th scope="col" data-num>
                      Records
                    </th>
                    <th scope="col" data-num>
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {INPUT_SOURCES.map((s) => (
                    <tr key={s.source}>
                      <th scope="row">{s.source}</th>
                      <td data-num>{s.count}</td>
                      <td data-num>{s.amount != null ? formatINR(s.amount) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="payslips">
            <DataTable
              label="Payslips in this run"
              columns={cols}
              rows={shown}
              getRowId={(r) => r.id}
              onRowClick={setOpen}
              activeRowId={open?.id}
              filtered={shown.length !== rows.length}
              onClearFilters={() => setFilters([{ key: 'status', type: 'multi', values: [] }])}
              pageSize={25}
              toolbar={
                <FilterBar
                  fields={[{ key: 'status', label: 'Exceptions', type: 'multi', options: ['Flagged', 'Held', 'Failed', 'Calculated'].map((v) => ({ value: v, label: v })) }]}
                  value={filters}
                  onChange={setFilters}
                  searchPlaceholder="Search employee or ID"
                />
              }
              views={
                <SavedViewMenu
                  views={[{ id: 'all', name: 'All payslips' }, { id: 'exc', name: 'Exceptions only', shared: true }]}
                  currentId={filterValues.length === EXCEPTION_FILTER.length && EXCEPTION_FILTER.every((v) => filterValues.includes(v)) ? 'exc' : 'all'}
                  onSelect={(id) => setFilters([{ key: 'status', type: 'multi', values: id === 'exc' ? EXCEPTION_FILTER : [] }])}
                />
              }
              onExport={(format) => setNotice({ tone: 'success', title: `Exported ${plural(shown.length, 'payslip')}`, body: `payslips-sep-2026.${format} is in your downloads.` })}
              rowActions={(r) => (
                <>
                  <MenuItem onSelect={() => setOpen(r)}>Why this number</MenuItem>
                  {r.status !== 'Held' && !periodLocked && <MenuItem onSelect={() => goTo(STORY.addHold)}>Hold salary</MenuItem>}
                  {!periodLocked && (
                    <MenuItem
                      onSelect={() =>
                        setNotice(
                          r.status === 'Failed'
                            ? { tone: 'danger', title: `${r.name}'s payslip still fails`, body: r.reason, action: <StoryButton size="sm" to={STORY.compensation}>Add compensation</StoryButton> }
                            : { tone: 'success', title: `${r.name}'s payslip recalculated`, body: `Net pay ${formatINR(r.net)} is unchanged.` },
                        )
                      }
                    >
                      Recalculate
                    </MenuItem>
                  )}
                </>
              )}
            />
          </TabsContent>
          <TabsContent value="variance">
            <div className="yx-pay-stack">
              <InlineAlert tone={unacked.length ? 'warning' : 'success'} title={unacked.length ? `${plural(unacked.length, 'change')} need acknowledgement before approval` : 'All variance acknowledged'}>
                Threshold: net change above 10% or any new or removed component, compared with August.
              </InlineAlert>
              {narrow ? (
                <ul className="yx-pay-cards" aria-label="Variance lines">
                  {flagged.map((r) => {
                    const v = variance(r.net, r.prevNet);
                    const isAck = acked.includes(r.id);
                    return (
                      <li key={r.id}>
                        <PersonLabel name={r.name} secondary={r.code} />
                        <span className="yx-pay-cards__row">
                          <span className="yx-pay-muted">
                            {formatINR(r.prevNet)} → {formatINR(r.net)}
                          </span>
                          <strong>
                            {v.diff >= 0 ? '+' : ''}
                            {formatINR(v.diff)} ({v.pct >= 0 ? '+' : ''}
                            {v.pct}%)
                          </strong>
                        </span>
                        <span>{r.reason ?? 'No input change since August'}</span>
                        <span className="yx-pay-row">
                          {isAck ? (
                            <Badge tone="success">Acknowledged</Badge>
                          ) : (
                            <Button size="sm" onClick={() => setAcked((a) => [...a, r.id])}>
                              Acknowledge
                            </Button>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
              <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
              <table className="yx-pay-table">
                <thead>
                  <tr>
                    <th scope="col">Employee</th>
                    <th scope="col" data-num>
                      August net
                    </th>
                    <th scope="col" data-num>
                      September net
                    </th>
                    <th scope="col" data-num>
                      Change
                    </th>
                    <th scope="col">Cause</th>
                    <th scope="col">
                      <span className="yx-visually-hidden">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {flagged.map((r) => {
                    const v = variance(r.net, r.prevNet);
                    const isAck = acked.includes(r.id);
                    return (
                      <tr key={r.id} data-state={isAck ? undefined : 'flag'}>
                        <th scope="row">
                          <PersonLabel name={r.name} secondary={r.code} />
                        </th>
                        <td data-num>{formatINR(r.prevNet)}</td>
                        <td data-num>{formatINR(r.net)}</td>
                        <td data-num>
                          {v.diff >= 0 ? '+' : ''}
                          {formatINR(v.diff)} ({v.pct >= 0 ? '+' : ''}
                          {v.pct}%)
                        </td>
                        <td>{r.reason ?? 'No input change since August'}</td>
                        <td>
                          {isAck ? (
                            <Badge tone="success">Acknowledged</Badge>
                          ) : (
                            <Button size="sm" onClick={() => setAcked((a) => [...a, r.id])}>
                              Acknowledge
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
              )}
            </div>
          </TabsContent>
          <TabsContent value="validations">
            <ul className="yx-pay-findings">
              {FINDINGS.map((f) => {
                const blocking = (f.id === 'f1' && exceptionsOpen) || (f.id === 'f9' && f.severity !== 'ok' && !retried);
                const passed = f.severity === 'ok' || (f.id === 'f1' && !exceptionsOpen) || (f.id === 'f9' && retried);
                return (
                  <li key={f.id} data-sev={blocking ? 'block' : passed ? 'ok' : 'warn'}>
                    <Icon icon={passed ? CheckCircle2 : blocking ? AlertCircle : AlertTriangle} label={passed ? 'Passed' : blocking ? 'Blocks approval' : 'Acknowledged'} />
                    <div>
                      <p className="yx-pay-findings__title">{f.title}</p>
                      <p className="yx-pay-findings__desc">
                        {f.id === 'f1' && !exceptionsOpen ? 'Resolved in Time before approval.' : f.id === 'f9' && retried ? 'Compensation added; the payslip calculated on retry.' : f.id === 'f2' ? `Waived by ${PAYROLL_ADMIN.name}: both salaries stay on hold, out of the bank file, until the accounts are verified.` : f.detail}
                      </p>
                    </div>
                    <div className="yx-pay-findings__acts">
                      {blocking && f.id === 'f9' ? (
                        <>
                          <Badge tone="danger">{plural(f.count, 'payslip')} failed</Badge>
                          <StoryButton size="sm" to={STORY.compensation}>
                            Add compensation
                          </StoryButton>
                        </>
                      ) : blocking ? (
                        <>
                          <Badge tone="danger">Blocks approval</Badge>
                          <StoryButton size="sm" to={STORY.exceptions}>
                            Resolve exceptions
                          </StoryButton>
                        </>
                      ) : (
                        <Badge tone={passed ? 'success' : 'neutral'}>{passed ? (f.id === 'f1' ? 'Resolved' : 'Passed') : 'Acknowledged'}</Badge>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </TabsContent>
          <TabsContent value="approvals">
            <div className="yx-pay-split">
              <ApprovalTimeline steps={approvalSteps} now={d(29, 8)} />
              <DescriptionList
                items={[
                  { label: 'Approval chain', value: 'Payroll admin prepares → Finance approver (1 level)' },
                  { label: 'Maker ≠ checker', value: 'Enforced: 2 eligible approvers' },
                  { label: 'Lock on approval', value: 'Attendance and pay-affecting leave for September lock with the run' },
                ]}
              />
            </div>
          </TabsContent>
          <TabsContent value="files">
            <FilesPanel phase={phase} narrow={narrow} onRelease={() => setSheet('bank')} onPublish={() => setSheet('publish')} />
          </TabsContent>
        </Tabs>
      </StateBlock>

      <Drawer
        open={!!open}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open?.name ?? ''}
        subtitle={open ? `${open.code} · ${open.department} · ${open.location}` : undefined}
        meta={open && <Badge tone={ROW_TONE[open.status]}>{open.status}</Badge>}
        size="lg"
        footer={
          <>
            <Button onClick={() => setOpen(null)}>Close</Button>
            <StoryButton to={STORY.compensation}>Open compensation</StoryButton>
          </>
        }
      >
        {open && (
          <div className="yx-pay-stack">
            <FactRow
              items={[
                { label: 'Net pay', value: <Amount value={open.net} strong /> },
                { label: 'August net', value: formatINR(open.prevNet) },
                { label: 'Payable days', value: `${open.payableDays} of 30` },
                { label: 'Pay mode', value: open.mode },
              ]}
            />
            {open.reason && <InlineAlert tone={open.status === 'Failed' ? 'danger' : 'warning'}>{open.reason}</InlineAlert>}
            <h3 className="yx-pay-section-title">Why this number</h3>
            <WhyThisNumber lines={SAMPLE_LINES(open)} defaultOpenId="t" />
          </div>
        )}
      </Drawer>

      <IrreversibleSheet
        open={sheet === 'approve'}
        onOpenChange={(o) => !o && setSheet(null)}
        title="Approve and lock September 2026"
        subtitle={RUN.name}
        impact={[
          {
            label: 'Payslips approved',
            value: `${groupIndian(RUN.employees - RUN.withheld - (retried ? 0 : RUN.failed))} (+${RUN.withheld} held${!retried && RUN.failed ? `, ${RUN.failed} failed` : ''})`,
          },
          { label: 'Net pay', value: formatINR(RUN.net) },
          { label: 'Cost to company', value: formatINR(RUN.employerCost) },
          { label: 'Period', value: '1–30 Sep 2026 locks' },
        ]}
        cannotUndo="Approving locks the September payroll period. Attendance and pay-affecting leave for September lock with it."
        correction="Changes after this go to October as arrears or recoveries. Reopening needs Payroll Admin and System Admin approval and is refused once the bank file is released."
        phrase={CONFIRM_PHRASE}
        maker={PAYROLL_ADMIN.name}
        checker={checker}
        selfApproval={sheetVariant === 'self-approval'}
        confirmLabel="Approve and lock"
        blocked={blocked}
        blockedReason={approveBlock}
        blockedAction={
          exceptionsOpen ? (
            <StoryButton size="sm" to={STORY.exceptions}>
              Resolve exceptions
            </StoryButton>
          ) : undefined
        }
        otherApprover={FIN_APPROVER.name}
        onSendToChecker={() => setSent(true)}
        defaultTyped={sheetVariant === 'ready' ? '' : undefined}
        onConfirm={() => {
          setDone(true);
          setPhase('approved');
        }}
        done={
          done ? (
            <InlineAlert
              tone="success"
              title="September 2026 approved and locked"
              actions={
                <StoryButton size="sm" icon={Landmark} to={STORY.bank}>
                  Open bank file
                </StoryButton>
              }
            >
              Approved by {FIN_APPROVER.name} on 29 Sep 2026, 9:42 am. Bank file and payslip publishing are now available to payroll.
            </InlineAlert>
          ) : sent ? (
            <InlineAlert tone="info" title={`Sent to ${FIN_APPROVER.name} for approval`}>
              Sent on {formatDate(d(29))}. {FIN_APPROVER.name} gets a notification and approves from Payroll home.
            </InlineAlert>
          ) : undefined
        }
      >
        <p className="yx-pay-muted">{unacked.length ? `${plural(unacked.length, 'variance line')} still need acknowledgement by payroll.` : `All ${plural(flagged.length, 'variance line')} acknowledged.`}</p>
      </IrreversibleSheet>

      <BankFileSheet open={sheet === 'bank'} onOpenChange={(o) => !o && setSheet(null)} variant={sheetVariant} />
      <PublishSheet open={sheet === 'publish'} onOpenChange={(o) => !o && setSheet(null)} variant={sheetVariant} />
    </PayFrame>
  );
}

/** Files tab: bank file, payslips, journal, statutory files; each available only after approval (YX-PAY-07). */
function FilesPanel({ phase, narrow, onRelease, onPublish }: { phase: RunPhase; narrow: boolean; onRelease: () => void; onPublish: () => void }) {
  const approved = phase === 'approved' || phase === 'paid' || phase === 'published';
  const row = (name: string, detail: string, status: ReactNode, action: ReactNode) =>
    narrow ? (
      <li key={name}>
        <span className="yx-pay-cards__row">
          <strong>{name}</strong>
          {status}
        </span>
        <span className="yx-pay-muted">{detail}</span>
        {action && <span className="yx-pay-row">{action}</span>}
      </li>
    ) : (
      <tr key={name}>
        <th scope="row">{name}</th>
        <td>{detail}</td>
        <td>{status}</td>
        <td>{action}</td>
      </tr>
    );
  const locked = <Badge>Available after approval</Badge>;
  const rows = [
    row(
      'Bank file',
      `Cauvery Co-operative Bank bulk format · ${plural(RUN.inBankFile, 'payment')} · held, failed and cash / cheque payslips left out`,
          approved ? <Badge tone={phase === 'approved' ? 'warning' : 'success'}>{phase === 'approved' ? 'Ready to release' : 'Released 29 Sep, 10:05 am'}</Badge> : locked,
          phase === 'approved' ? (
            <Button size="sm" onClick={onRelease}>
              Release
            </Button>
          ) : approved ? (
            <StoryButton size="sm" icon={Download} to={STORY.bankFiles}>
              Download
            </StoryButton>
          ) : null,
    ),
    row(
      'Disbursement register',
      `${plural(CASH, 'cash payslip')}, ${plural(CHEQUE, 'cheque payslip')}, with an acknowledgement upload for each`,
      approved ? <Badge tone="warning">{`1 of ${CASH + CHEQUE} acknowledged`}</Badge> : locked,
      approved ? (
        <StoryButton size="sm" icon={Upload} to={STORY.register}>
          Upload acknowledgement
        </StoryButton>
      ) : null,
    ),
    row(
      'Payslips',
      `${plural(RUN.employees - RUN.failed, 'PDF')} rendered with layout v4 (Karnataka)`,
      phase === 'published' ? <Badge tone="success">Published 29 Sep</Badge> : approved ? <Badge tone="warning">Not published</Badge> : locked,
      phase === 'paid' ? (
        <Button size="sm" onClick={onPublish}>
          Publish
        </Button>
      ) : null,
    ),
    row(
      'Journal',
      'Accounting export (CSV) · 42 lines by cost centre',
      approved ? <Badge tone="info">Ready</Badge> : locked,
      approved ? (
        <StoryButton size="sm" icon={Download} to={STORY.journal}>
          Export journal
        </StoryButton>
      ) : null,
    ),
    row(
      'Statutory files',
      'PF and ESI return files, PT Karnataka, LWF',
      approved ? <Badge tone="info">Ready</Badge> : locked,
      approved ? (
        <StoryButton size="sm" to={STORY.statutoryHub}>
          Open statutory hub
        </StoryButton>
      ) : null,
    ),
  ];
  if (narrow) return <ul className="yx-pay-cards" aria-label="Run files">{rows}</ul>;
  return (
    <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
      <table className="yx-pay-table">
        <thead>
          <tr>
            <th scope="col">File</th>
            <th scope="col">What it holds</th>
            <th scope="col">Status</th>
            <th scope="col">
              <span className="yx-visually-hidden">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

/* ================================================================== PAY-08 Release bank file */

export function BankFileSheet({ open, onOpenChange, variant = 'ready' }: { open: boolean; onOpenChange: (o: boolean) => void; variant?: RunWorkspaceProps['sheetVariant'] }) {
  const [done, setDone] = useState(variant === 'done');
  const regenerate = variant === 'regenerate';
  return (
    <IrreversibleSheet
      open={open}
      onOpenChange={onOpenChange}
      title={regenerate ? 'Regenerate bank file for September 2026' : 'Release bank file for September 2026'}
      subtitle="Cauvery Co-operative Bank · bulk salary upload (text, account numbers kept as text)"
      impact={[
        { label: 'Payments in file', value: groupIndian(RUN.inBankFile) },
        { label: 'Total', value: formatINR(RUN.bankFileTotal) },
        { label: 'Left out', value: `${RUN.withheld} held · ${RUN.failed} failed · ${RUN.cashCheque} cash / cheque · 0 unverified` },
        { label: 'Debit account', value: 'Cauvery Co-op ••••4410' },
      ]}
      cannotUndo={regenerate ? 'The earlier file is marked replaced. If it was already uploaded to the bank, stop it there first.' : 'Once released, the period can no longer be reopened. The file is generated once per run.'}
      correction="A failed or returned payment re-enters the next bank file or an off-cycle payment."
      phrase={CONFIRM_PHRASE}
      reasonRequired={regenerate}
      maker={PAYROLL_ADMIN.name}
      checker={FIN_APPROVER.name}
      confirmLabel={regenerate ? 'Regenerate bank file' : 'Release bank file'}
      onConfirm={() => setDone(true)}
      done={
        done ? (
          <div className="yx-pay-stack">
            <InlineAlert tone="success" title="Bank file released">
              KFD_SAL_202609_01.txt · {plural(RUN.inBankFile, 'payment')} · {formatINR(RUN.bankFileTotal)}. Download it and upload it on the bank portal. Record payment status when the bank confirms.
            </InlineAlert>
            <span className="yx-pay-row">
              <StoryButton icon={Download} to={STORY.bankFiles}>
                Download bank file
              </StoryButton>
            </span>
          </div>
        ) : undefined
      }
    >
      <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Left out of this file, scrolls sideways on small screens">
      <table className="yx-pay-table">
        <caption>Left out of this file</caption>
        <tbody>
          <tr>
            <th scope="row">Held salaries</th>
            <td>{RUN.withheld} · released later into the next bank file or an off-cycle payment</td>
          </tr>
          {RUN.failed > 0 && (
            <tr>
              <th scope="row">Failed payslips</th>
              <td>{RUN.failed} · paid in the next bank file or off-cycle once calculated</td>
            </tr>
          )}
          <tr>
            <th scope="row">Cash / cheque</th>
            <td>{RUN.cashCheque} · paid through the disbursement register</td>
          </tr>
          <tr>
            <th scope="row">EWA partner remittance</th>
            <td>{formatINR(EWA_REMITTANCE)} to the EWA partner, added as one line</td>
          </tr>
        </tbody>
      </table>
      </div>
    </IrreversibleSheet>
  );
}

/* ================================================================== PAY-09 Publish payslips */

export function PublishSheet({ open, onOpenChange, variant = 'ready' }: { open: boolean; onOpenChange: (o: boolean) => void; variant?: RunWorkspaceProps['sheetVariant'] }) {
  const [done, setDone] = useState(variant === 'done');
  return (
    <IrreversibleSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Publish September 2026 payslips"
      subtitle="Employees see their payslip in the app. Notifications carry a link, never the payslip or amounts."
      impact={[
        { label: 'Payslips published', value: groupIndian(PUBLISHED) },
        { label: 'Net pay', value: formatINR(RUN.net - RUN.heldNet - FAILED_NET) },
        { label: 'Not published', value: `${RUN.withheld} held · ${RUN.failed} failed` },
        { label: 'Layout', value: 'Karnataka payslip v4' },
      ]}
      cannotUndo="Published payslips can't be changed or withdrawn."
      correction="Corrections go to October as arrears or recoveries, with a correction statement for the affected month."
      phrase={CONFIRM_PHRASE}
      maker={PAYROLL_ADMIN.name}
      checker={variant === 'self-approval' ? PAYROLL_ADMIN.name : 'Priya Nair'}
      selfApproval={variant === 'self-approval'}
      confirmLabel="Publish payslips"
      onConfirm={() => setDone(true)}
      done={
        done ? (
          <div className="yx-pay-stack">
            <RunProgress action="Publishing payslips" done={PUBLISHED} total={PUBLISHED} finished />
            <InlineAlert tone="success" title={`${plural(PUBLISHED, 'payslip')} published`}>
              Employees were notified in the app and by email with a link. Queries on these payslips go to the payroll query queue.
            </InlineAlert>
          </div>
        ) : undefined
      }
    />
  );
}

/* ================================================================== PAY-29 Weekly / fortnightly pay run */

export interface FrequencyRun {
  id: string;
  frequency: 'Weekly' | 'Fortnightly' | 'Monthly';
  group: string;
  period: string;
  employees: number;
  net: number;
  status: 'Draft' | 'In review' | 'Approved' | 'Paid' | 'Published';
  payDate: Date;
}
export const FREQ_RUNS: FrequencyRun[] = [
  { id: 'w39', frequency: 'Weekly', group: 'Hosur plant, loaders (weekly)', period: 'Week 39 · 21–27 Sep 2026', employees: 38, net: 4_61_220, status: 'In review', payDate: d(30) },
  { id: 'w38', frequency: 'Weekly', group: 'Hosur plant, loaders (weekly)', period: 'Week 38 · 14–20 Sep 2026', employees: 38, net: 4_58_900, status: 'Published', payDate: d(23) },
  { id: 'w37', frequency: 'Weekly', group: 'Hosur plant, loaders (weekly)', period: 'Week 37 · 7–13 Sep 2026', employees: 37, net: 4_49_310, status: 'Published', payDate: d(16) },
  { id: 'f2', frequency: 'Fortnightly', group: 'Packing line, contract-to-hire (fortnightly)', period: '16–30 Sep 2026', employees: 24, net: 3_12_480, status: 'Draft', payDate: d(2, 9) },
  { id: 'f1', frequency: 'Fortnightly', group: 'Packing line, contract-to-hire (fortnightly)', period: '1–15 Sep 2026', employees: 24, net: 3_09_760, status: 'Paid', payDate: d(17) },
];
const RUN_TONE: Record<FrequencyRun['status'], BadgeTone> = { Draft: 'neutral', 'In review': 'warning', Approved: 'info', Paid: 'success', Published: 'success' };

/** PAY-29 · Weekly / fortnightly pay run (T2 run list per frequency + T5 steps, frequency shown on every step). */
export function FrequencyRunsScreen({ view = 'list', frequency = 'Weekly', state = 'ready' }: { view?: 'list' | 'run'; frequency?: 'Weekly' | 'Fortnightly'; state?: ViewState }) {
  const runs = FREQ_RUNS.filter((r) => r.frequency === frequency);
  const phone = useNarrow(599);
  /** Not yet paid: the pay date gets a relative badge ("in 1 day"). */
  const unpaid = (r: FrequencyRun) => r.status !== 'Paid' && r.status !== 'Published';
  const statusBadge = (r: FrequencyRun) => <Badge tone={RUN_TONE[r.status]}>{r.status}</Badge>;
  // Phone cards: "period + status", then "38 people · ₹x · pays 30 Sep" (the tab already names the pay group).
  const cols: TableColumn<FrequencyRun>[] = [
    { key: 'period', header: 'Period', value: (r) => r.period, render: (r) => (phone ? <>{r.period} {statusBadge(r)}</> : r.period), width: 220 },
    { key: 'group', header: 'Pay group', value: (r) => r.group, width: 280, optional: true },
    { key: 'emp', header: 'Employees', type: 'number', value: (r) => r.employees, render: (r) => (phone ? `${r.employees} people` : r.employees), width: 100 },
    { key: 'net', header: 'Net pay', type: 'money', value: (r) => r.net, width: 130 },
    {
      key: 'pay',
      header: 'Pay date',
      type: 'date',
      value: (r) => r.payDate,
      render: (r) => (
        <>
          {phone ? 'pays ' : ''}
          {formatDate(r.payDate)} {unpaid(r) && <DueBadge date={r.payDate} />}
        </>
      ),
      width: 190,
    },
    ...(phone ? [] : [{ key: 'status', header: 'Status', type: 'status' as const, value: (r: FrequencyRun) => r.status, statusTone: (v: unknown) => RUN_TONE[v as FrequencyRun['status']], width: 110 }]),
  ];
  const cur = runs[0];
  const freqBadge = <Badge tone="info">{frequency}</Badge>;
  const step = (id: string, title: string, content: ReactNode): StepperStep => ({ id, title, description: `${frequency} · ${cur?.period ?? ''}`, content: <div className="yx-pay-stack">{freqBadge}{content}</div> });
  return (
    <PayFrame page="runs" persona="pa">
      <PageHeader
        title={view === 'list' ? 'Pay runs' : cur?.period ?? 'Pay run'}
        description={view === 'list' ? 'Runs per pay frequency. Weekly and fortnightly runs have their own readiness, payslips and bank file.' : cur?.group}
        status={view === 'run' ? freqBadge : undefined}
        actions={
          view === 'list' ? (
            <StoryButton variant="primary" to={STORY.weeklyRun} args={frequency === 'Weekly' ? undefined : `frequency:${frequency}`}>
              Start {frequency.toLowerCase()} run
            </StoryButton>
          ) : undefined
        }
      />
      {view === 'list' ? (
        <Tabs defaultValue={frequency}>
          <TabsList aria-label="Frequency">
            <TabsTrigger value="Monthly" count={1}>
              Monthly
            </TabsTrigger>
            <TabsTrigger value="Weekly" count={FREQ_RUNS.filter((r) => r.frequency === 'Weekly').length}>
              Weekly
            </TabsTrigger>
            <TabsTrigger value="Fortnightly" count={FREQ_RUNS.filter((r) => r.frequency === 'Fortnightly').length}>
              Fortnightly
            </TabsTrigger>
          </TabsList>
          {(['Monthly', 'Weekly', 'Fortnightly'] as const).map((f) => (
            <TabsContent key={f} value={f}>
              <DataTable
                label={`${f} runs`}
                columns={cols}
                rows={f === 'Monthly' ? [] : FREQ_RUNS.filter((r) => r.frequency === f)}
                getRowId={(r) => r.id}
                cardSummary
                state={state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'ready'}
                onRowClick={(r) => goTo(STORY.weeklyRun, r.frequency === 'Weekly' ? undefined : `frequency:${r.frequency}`)}
                empty={<EmptyState title={f === 'Monthly' ? 'The monthly run lives on Payroll home.' : `No ${f.toLowerCase()} runs yet.`} description={f === 'Monthly' ? undefined : `Add a pay group with a ${f.toLowerCase()} calendar in Settings › Pay groups & calendars.`} />}
              />
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <Stepper
          title={`${frequency} run`}
          defaultCurrent="payslips"
          finishLabel="Release bank file"
          steps={[
            step(
              'ready',
              'Readiness',
              <InlineAlert tone="success" title="Ready">
                Attendance feed for 21–27 Sep received for 38 of 38. PT and LWF use part-period rules; TDS projected on annualised weekly pay.
              </InlineAlert>,
            ),
            step(
              'payslips',
              'Payslips',
              <DataTable
                label="Weekly payslips"
                columns={[
                  { key: 'name', header: 'Employee', type: 'person', value: (r: RunRow) => r.name, person: (r) => ({ name: r.name, secondary: r.code }), width: 220 },
                  { key: 'days', header: 'Days worked', type: 'number', value: (r) => Math.min(6, r.payableDays - 24), width: 110 },
                  { key: 'gross', header: 'Gross', type: 'money', value: (r) => Math.round(r.gross / 4.3), total: 'sum', width: 120 },
                  { key: 'net', header: 'Net', type: 'money', value: (r) => Math.round(r.net / 4.3), total: 'sum', width: 120 },
                ]}
                rows={RUN_ROWS.slice(0, 12)}
                getRowId={(r) => r.id}
              />,
            ),
            step(
              'approve',
              'Approve',
              <p className="yx-pay-muted">Finance approves each weekly run. PF and ESI are computed per run and added up into the monthly ECR and ESI return.</p>,
            ),
            step('bank', 'Bank file', <FactRow items={[{ label: 'Payments', value: '38' }, { label: 'Total', value: formatINR(cur?.net ?? 0) }, { label: 'Pay date', value: formatDate(cur?.payDate) }]} />),
          ]}
        />
      )}
    </PayFrame>
  );
}
