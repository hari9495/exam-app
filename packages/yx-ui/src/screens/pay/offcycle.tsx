// Off-cycle and annual processes: PAY-11 off-cycle run (F&F, bonus, arrears only, correction), PAY-24 bonus computation,
// PAY-28 arrears worksheet base confirmation, PAY-37 wage-settlement arrears, PAY-38 actuarial census and valuation.
import { useState } from 'react';
import { BellRing, Download, Eye, FileText, Send } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { Badge } from '../../components/display';
import { InlineAlert } from '../../components/feedback';
import { FieldRow, FormField } from '../../components/field';
import { CurrencyField, NumberField, TextArea, TextField } from '../../components/inputs';
import { RadioGroup } from '../../components/choice';
import { FileUpload } from '../../components/upload';
import { DescriptionList, PageHeader } from '../../components/shell';
import { Stepper, useNarrow, type StepperStep } from '../../components/stepper';
import { ConfirmDialog } from '../../components/overlay';
import { DataTable, type TableColumn } from '../../components/table';
import { formatDate, formatINR } from '../../lib/format';
import { FactRow, PayFrame, SectionTitle } from './pay-kit';
import { EMPLOYEES, TODAY } from '../_kit/data';
import { d, FIN_APPROVER, PAYROLL_ADMIN, RUN_PICKS, RUN_ROWS } from './pay-data';
import { EXIT_CASES, SCHEDULED } from '../people/people-data';

const storyHref = (id: string) => `/?path=/story/${id}`;
import { arrearsTotal, gratuity, retrenchmentCompensation, statutoryBonus, type ArrearMonth } from './pay-logic';

/* ================================================================== PAY-11 Off-cycle run */

export type OffCycleKind = 'fnf' | 'retrenchment' | 'death' | 'bonus' | 'arrears' | 'correction';

interface FnfLine {
  label: string;
  amount: number;
  kind: 'Earning' | 'Deduction' | 'Employer';
  note: string;
}

/** People with a future-dated change or an exit case in People: never used as a leaver here. */
const PEOPLE_BUSY = new Set([...SCHEDULED, ...EXIT_CASES].map((x) => x.name));
const free = (e: (typeof EMPLOYEES)[number]) => EMPLOYEES.indexOf(e) >= 10 && !PEOPLE_BUSY.has(e.name);
/** F&F resignation: the September run's exit-clearance hold (RUN_PICKS.exit); the held September salary is settled here. */
export const FNF_LEAVER = RUN_PICKS.exit;
const RETRENCHED = EMPLOYEES.find((e) => free(e) && e.location === 'Hosur plant' && e.department === 'Operations')!;
const DECEASED = EMPLOYEES.find((e) => free(e) && e.location === 'Hosur plant' && e.department === 'Quality')!;
/** Monthly regular gross, as the September run works it out (sample ctc is monthly; 92% is gross). The leaver's matches RUN_ROWS. */
const grossOf = (e: (typeof EMPLOYEES)[number]) => RUN_ROWS.find((r) => r.id === e.id)?.gross ?? Math.round((Math.round(e.ctc / 10) * 10 * 0.92) / 10) * 10;

/** Settlement lines for one person: salary to the last day, leave encashment, gratuity, notice shortfall and TDS. */
function fnfLines(e: (typeof EMPLOYEES)[number]): FnfLine[] {
  const row = RUN_ROWS.find((r) => r.id === e.id);
  const gross = row ? row.gross - row.oneTime : grossOf(e);
  const basic = Math.round(gross * 0.45);
  return [
    { label: 'Salary 1–29 Sep (29 days)', amount: Math.round((gross * 29) / 30), kind: 'Earning', note: `Gross ${formatINR(gross)} × 29 ÷ 30${row?.status === 'Held' ? '; held in the September run until clearance' : ''}` },
    { label: 'Leave encashment, 14 days earned leave', amount: Math.round((basic / 30) * 14), kind: 'Earning', note: 'Basic ÷ 30 × 14 days; exempt part on exit up to the lifetime cap ₹25,00,000' },
    { label: 'Gratuity, 6 years 8 months', amount: Math.round(((basic * 15) / 26) * 7), kind: 'Earning', note: `Last basic ${formatINR(basic)} × 15 ÷ 26 × 7 (a part-year of 6 months or more counts as a year)` },
    { label: 'Notice pay recovery, 10 days short', amount: Math.round((gross / 30) * 10), kind: 'Deduction', note: 'Notice 60 days, served 50' },
    { label: 'Income tax (TDS)', amount: 14_210, kind: 'Deduction', note: 'Projection closed for this employment' },
  ];
}
const FNF_BASE = fnfLines(FNF_LEAVER);
/** F&F net payable (earnings − deductions) for FNF_LEAVER: PAY-10's bank-file row reads it. */
export const FNF_NET = FNF_BASE.reduce((a, l) => a + (l.kind === 'Earning' ? l.amount : l.kind === 'Deduction' ? -l.amount : 0), 0);

/** PAY-11 · Off-cycle run wizard. F&F runs are created automatically on the approved last working day. */
export function OffCycleRunScreen({ kind = 'fnf', step = 'lines', permission = false }: { kind?: OffCycleKind; step?: string; permission?: boolean }) {
  const [type, setType] = useState<OffCycleKind>(kind);
  const fnf = type === 'fnf' || type === 'retrenchment' || type === 'death';
  const person = type === 'death' ? DECEASED : type === 'retrenchment' ? RETRENCHED : FNF_LEAVER;
  const base = type === 'fnf' ? FNF_BASE : fnfLines(person);
  const monthly = grossOf(person);
  const lines: FnfLine[] =
    type === 'retrenchment'
      ? [
          ...base.filter((l) => !l.label.startsWith('Notice pay recovery')),
          { label: 'Retrenchment compensation, 7 completed years', amount: retrenchmentCompensation(monthly, 7), kind: 'Earning', note: '15 days average pay × 7 completed years' },
          { label: 'Notice pay in lieu (1 month)', amount: monthly, kind: 'Earning', note: 'No notice given' },
          { label: 'Worker re-skilling fund, 15 days wages', amount: Math.round((monthly / 26) * 15), kind: 'Employer', note: 'Remitted to the fund; not part of net' },
        ]
      : type === 'death'
        ? [
            ...base.filter((l) => !l.label.startsWith('Notice')),
            { label: 'Ex-gratia (support policy)', amount: 3_00_000, kind: 'Earning', note: 'One-time pay from the company support policy' },
          ]
        : base;
  const earnings = lines.filter((l) => l.kind === 'Earning').reduce((a, l) => a + l.amount, 0);
  const deds = lines.filter((l) => l.kind === 'Deduction').reduce((a, l) => a + l.amount, 0);
  const blocked = type === 'retrenchment' && !permission;
  const who = `${type === 'death' ? 'Late ' : ''}${person.name} · ${person.code}${type === 'retrenchment' ? ' (Hosur plant, 320 workers with contract labour)' : ''}`;
  const surname = person.name.split(' ').slice(1).join(' ');
  const linesStep = (
    <div className="yx-pay-stack">
      {fnf && (
        <InlineAlert tone={blocked ? 'danger' : 'warning'} title={blocked ? "Can't approve yet: government permission needed" : 'Pay by Thu 1 Oct 2026 (2 working days after last working day)'}>
          {blocked
            ? 'The establishment has 300 or more workers. Record the permission reference for retrenchment before approval. Undisputed wages can still be paid within the deadline in a first run.'
            : 'Last working day Tue 29 Sep. If something blocks full settlement, pay the undisputed wages by the deadline and the rest in a second off-cycle run with the reason.'}
        </InlineAlert>
      )}
      <FactRow
        items={[
          { label: 'Employee', value: who },
          { label: 'Exit type', value: type === 'death' ? 'Death in service' : type === 'retrenchment' ? 'Retrenchment' : 'Resignation' },
          { label: 'Last working day', value: formatDate(d(29)) },
        ]}
      />
      <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
      <table className="yx-pay-table">
        <thead>
          <tr>
            <th scope="col">Line</th>
            <th scope="col">Type</th>
            <th scope="col" data-num>
              Amount
            </th>
            <th scope="col">Why</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.label}>
              <th scope="row">{l.label}</th>
              <td>{l.kind === 'Employer' ? 'Company cost' : l.kind}</td>
              <td data-num>{l.kind === 'Deduction' ? `−${formatINR(l.amount)}` : formatINR(l.amount)}</td>
              <td>{l.note}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={2}>
              Net payable
            </th>
            <td data-num>{formatINR(earnings - deds)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      </div>
      {type === 'retrenchment' && (
        <FormField label="Government permission reference" required={!permission} helper="Required for establishments with 300 or more workers.">
          <TextField defaultValue={permission ? 'LD/KA/RET/2026/0418 dated 18 Sep 2026' : ''} />
        </FormField>
      )}
      {type === 'death' && (
        <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Paid to nominees by share (verified bank accounts), scrolls sideways on small screens">
        <table className="yx-pay-table">
          <caption>Paid to nominees by share (verified bank accounts)</caption>
          <thead>
            <tr>
              <th scope="col">Nominee</th>
              <th scope="col">Relationship</th>
              <th scope="col" data-num>
                Share
              </th>
              <th scope="col" data-num>
                Amount
              </th>
              <th scope="col">Bank</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Saroja {surname}</th>
              <td>Spouse</td>
              <td data-num>60%</td>
              <td data-num>{formatINR(Math.round((earnings - deds) * 0.6))}</td>
              <td>
                <Badge tone="success">Verified</Badge>
              </td>
            </tr>
            <tr>
              <th scope="row">Nithya {surname}</th>
              <td>Daughter</td>
              <td data-num>40%</td>
              <td data-num>{formatINR(Math.round((earnings - deds) * 0.4))}</td>
              <td>
                <Badge tone="warning">Penny-drop pending</Badge>
              </td>
            </tr>
          </tbody>
        </table>
        </div>
      )}
      {type === 'death' && <p className="yx-pay-note">Gratuity 5-year condition waived on death. TDS on payments to nominees follows the P07 rule for heirs.</p>}
    </div>
  );
  const bonusLines = (
    <DataTable
      label="Bonus lines"
      columns={[
        { key: 'n', header: 'Employee', type: 'person', value: (r: (typeof EMPLOYEES)[number]) => r.name, person: (r) => ({ name: r.name, secondary: r.code }), width: 220 },
        { key: 'a', header: 'Amount', type: 'money', value: (r) => Math.round(r.ctc * 0.25), total: 'sum', width: 120 },
      ]}
      rows={EMPLOYEES.slice(0, 8)}
      getRowId={(r) => r.id}
    />
  );
  const steps: StepperStep[] = [
    {
      id: 'type',
      title: 'Run type',
      content: (
        <RadioGroup
          aria-label="Off-cycle run type"
          value={type === 'retrenchment' || type === 'death' ? 'fnf' : type}
          onChange={(v) => setType(v as OffCycleKind)}
          options={[
            { value: 'fnf', label: 'Full and final settlement', description: 'Created automatically on the approved last working day; 2-working-day deadline.' },
            { value: 'bonus', label: 'Bonus', description: 'One-time bonus outside the monthly run.' },
            { value: 'arrears', label: 'Arrears only', description: 'Revisions or settlements paid before the next monthly run.' },
            { value: 'correction', label: 'Correction', description: 'Pay a missed amount; past payslips are never changed.' },
          ]}
        />
      ),
      summary: <p>{type}</p>,
    },
    { id: 'lines', title: fnf ? 'Settlement lines' : 'Lines', description: 'Explained lines per employee', status: blocked ? 'error' : undefined, statusNote: blocked ? 'Permission reference missing' : undefined, content: fnf ? linesStep : bonusLines },
    { id: 'approve', title: 'Approve', description: 'Same approval chain as monthly runs', content: <p className="yx-pay-muted">Finance approver confirms with the typed phrase. Own bank file after approval.</p> },
    { id: 'pay', title: 'Bank file and payslip', content: <FactRow items={[{ label: 'Bank file', value: 'KFD_OFF_202609_03.txt' }, { label: 'Payslip', value: 'F&F statement (settlement layout)' }]} /> },
  ];
  return (
    <PayFrame page="runs">
      <PageHeader
        title={fnf ? `Full and final: ${who.split(' · ')[0]}` : 'Off-cycle run'}
        description={fnf ? 'Off-cycle run · created automatically on 29 Sep 2026, 6:00 pm' : 'Uses the same engine and approval as monthly runs.'}
        status={fnf ? <Badge tone={blocked ? 'danger' : 'warning'}>{blocked ? 'Blocked' : 'Due 1 Oct 2026'}</Badge> : undefined}
      />
      <Stepper title="Off-cycle run" steps={steps} defaultCurrent={step} finishLabel="Send for approval" />
    </PayFrame>
  );
}

/* ================================================================== PAY-24 Bonus computation */

export interface BonusRow {
  id: string;
  name: string;
  code: string;
  wage: number;
  months: number;
  minimumWage: number;
}
export const BONUS_ROWS: BonusRow[] = EMPLOYEES.filter((e) => e.department === 'Operations')
  .slice(0, 14)
  .map((e, i) => ({ id: e.id, name: e.name, code: e.code, wage: [14_800, 16_200, 18_900, 21_000, 22_400, 15_600, 17_300, 19_800, 14_520, 20_600, 23_900, 16_800, 18_100, 15_200][i], months: i === 5 ? 7 : 12, minimumWage: 14_520 }));

/** PAY-24 · Statutory bonus computation (annual, Payment of Bonus Act rules in P07). */
export function BonusComputationScreen({ step = 'compute', pct = 8.33 }: { step?: string; pct?: number }) {
  const [rate, setRate] = useState<number | null>(pct);
  const rows = BONUS_ROWS.map((r) => ({ ...r, ...statutoryBonus(r.wage, r.months, rate ?? 8.33, r.minimumWage) }));
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const cols: TableColumn<(typeof rows)[number]>[] = [
    { key: 'n', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.code }), width: 220 },
    { key: 'w', header: 'Monthly wage', type: 'money', value: (r) => r.wage, width: 120 },
    { key: 'e', header: 'Eligible', value: (r) => (r.eligible ? 'Yes' : 'No: wage above ₹21,000'), width: 180 },
    { key: 'b', header: 'Bonus base', type: 'money', value: (r) => r.base, width: 110 },
    { key: 'm', header: 'Months', type: 'number', value: (r) => r.months, width: 80 },
    { key: 'a', header: 'Bonus', type: 'money', value: (r) => r.amount, total: 'sum', width: 110 },
  ];
  return (
    <PayFrame page="runs">
      <PageHeader title="Statutory bonus · 2025-26" description="Kaveri Foods Pvt Ltd · payment method: annual, after year close (with monthly provision)" status={<Badge tone="warning">Due by 30 Nov 2026</Badge>} />
      <Stepper
        title="Bonus computation"
        defaultCurrent={step}
        finishLabel="Send for approval"
        steps={[
          {
            id: 'surplus',
            title: 'Allocable surplus',
            description: 'Set-on and set-off',
            content: (
              <div className="yx-pay-stack">
                <DescriptionList
                  columns={2}
                  items={[
                    { label: 'Available surplus 2025-26', value: formatINR(48_20_000) },
                    { label: 'Allocable surplus (60%)', value: formatINR(28_92_000) },
                    { label: 'Set-on carried from 2024-25', value: formatINR(2_10_000) },
                    { label: 'Set-off carried', value: '—' },
                  ]}
                />
              </div>
            ),
          },
          {
            id: 'compute',
            title: 'Compute',
            description: `Rate ${rate}%`,
            content: (
              <div className="yx-pay-stack">
                <FieldRow>
                  <FormField label="Bonus rate" required helper="Between 8.33% and 20%.">
                    <NumberField value={rate} onChange={setRate} min={8.33} max={20} decimals suffix="%" />
                  </FormField>
                  <FormField label="Calculation ceiling">
                    <TextField value="Higher of ₹7,000 and the minimum wage (₹14,520)" readOnly />
                  </FormField>
                </FieldRow>
                <FactRow
                  items={[
                    { label: 'Eligible', value: `${rows.filter((r) => r.eligible).length} of ${rows.length}` },
                    { label: 'Total bonus', value: formatINR(total) },
                    { label: 'Provision booked', value: formatINR(total - 3_400) },
                  ]}
                />
                <DataTable label="Bonus by employee" columns={cols} rows={rows} getRowId={(r) => r.id} onExport={() => {}} />
                <p className="yx-pay-note">Eligibility: wage up to ₹21,000 a month and at least 30 working days in the year. Employees who worked part of the year get bonus for the months worked.</p>
              </div>
            ),
          },
          { id: 'approve', title: 'Approve and pay', description: 'Off-cycle bonus run', content: <p className="yx-pay-muted">Creates an off-cycle bonus run with its own bank file and the bonus register (Form C equivalent from P07).</p> },
        ]}
      />
    </PayFrame>
  );
}

/* ================================================================== PAY-28 Arrears worksheet: base confirmation */

/** The 2026 union settlement, one source for PAY-28 and PAY-37: effective 1 Apr 2026, go-live 1 Oct 2026, so arrears run Apr–Sep. */
export const SETTLEMENT = {
  signed: d(15),
  effective: d(1, 3),
  goLive: d(1, 9),
  months: ['Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026'],
  span: 'Apr–Sep 2026',
};
const REASON_MIN = 5;
/** Category A worker shown on the worksheet: a Hosur plant operations employee from the shared list. */
const ARREARS_EMP = EMPLOYEES.find((e) => e.location === 'Hosur plant' && e.department === 'Operations' && !e.role.startsWith('Head')) ?? EMPLOYEES[0];

/** Every settlement month is before go-live, so the as-paid base comes from the imported old-payroll lines (Aug was never imported). */
export const ARREAR_MONTHS: ArrearMonth[] = SETTLEMENT.months.map((month) =>
  month === 'Aug 2026' ? { month, corrected: 26_500, asPaid: null, source: 'missing' } : { month, corrected: 26_500, asPaid: 25_000, source: 'import' },
);

const sourceBadge = (m: ArrearMonth) =>
  m.source === 'import' ? (
    <Badge tone="info">Imported · IMP-0007</Badge>
  ) : m.source === 'confirmed' ? (
    <Badge tone="success">Confirmed by {PAYROLL_ADMIN.name}</Badge>
  ) : m.source === 'run' ? (
    <Badge>YukthiX run</Badge>
  ) : (
    <Badge tone="warning">Missing: confirm base</Badge>
  );

/** PAY-28 · Arrears worksheet base-confirmation step (months before go-live use imported as-paid lines). */
export function ArrearsBaseScreen({ confirmed = false, embedded = false, computed: computedAtStart = false }: { confirmed?: boolean; embedded?: boolean; /** Start with the arrears computed (stories). */ computed?: boolean }) {
  const narrow = useNarrow();
  const [base, setBase] = useState<number | null>(confirmed ? 25_000 : null);
  const [reason, setReason] = useState(confirmed ? 'Old payroll register for August 2026, page 14' : '');
  const [computed, setComputed] = useState(computedAtStart);
  const [sent, setSent] = useState(false);
  const months: ArrearMonth[] = ARREAR_MONTHS.map((m) => (m.source === 'missing' && base != null && reason.trim().length >= REASON_MIN ? { ...m, asPaid: base, source: 'confirmed' } : m));
  const r = arrearsTotal(months);
  const missingMonth = ARREAR_MONTHS.find((m) => m.source === 'missing')!.month;
  const confirmedMonth = months.find((m) => m.source === 'confirmed');
  const who = `${ARREARS_EMP.name} · ${ARREARS_EMP.code}`;
  const totalLabel = r.canApprove ? `Arrears (basic) for ${who}` : `Arrears so far for ${who} (${r.missing.join(', ')} not included)`;
  const arrear = (m: ArrearMonth) => (m.asPaid == null ? '—' : formatINR(m.corrected - m.asPaid));
  // PF is on full basic (12% each side); pay is above the ₹21,000 ESI limit, so ESI does not apply.
  const pf = Math.round(r.total * 0.12);
  const content = (
    <div className="yx-pay-stack">
      <InlineAlert tone={r.canApprove ? 'success' : 'warning'} title={r.canApprove ? 'Base confirmed for every month' : `Confirm the as-paid base for ${r.missing.join(', ')}`}>
        {r.canApprove ? 'You can compute the arrears and send them for approval.' : 'No imported lines exist for this month. Arrears can’t be computed until you confirm what was paid, with a reason.'}
      </InlineAlert>
      {narrow ? (
        <>
          <ul className="yx-pay-cards" aria-label="Arrears by month">
            {months.map((m) => (
              <li key={m.month}>
                <div className="yx-pay-cards__row">
                  <strong>{m.month}</strong>
                  {sourceBadge(m)}
                </div>
                <div className="yx-pay-cards__row">
                  <span className="yx-pay-muted">
                    Revised {formatINR(m.corrected)} · Paid {m.asPaid == null ? '—' : formatINR(m.asPaid)}
                  </span>
                  <span>Arrear {arrear(m)}</span>
                </div>
              </li>
            ))}
          </ul>
          <div className="yx-pay-cards__row">
            <strong>{totalLabel}</strong>
            <strong>{formatINR(r.total)}</strong>
          </div>
        </>
      ) : (
        <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
          <table className="yx-pay-table">
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col" data-num>
                  Revised basic
                </th>
                <th scope="col" data-num>
                  As paid
                </th>
                <th scope="col">Base source</th>
                <th scope="col" data-num>
                  Arrear
                </th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month} data-state={m.source === 'missing' ? 'flag' : undefined}>
                  <th scope="row">{m.month}</th>
                  <td data-num>{formatINR(m.corrected)}</td>
                  <td data-num>{m.asPaid == null ? '—' : formatINR(m.asPaid)}</td>
                  <td>{sourceBadge(m)}</td>
                  <td data-num>{arrear(m)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={4}>
                  {totalLabel}
                </th>
                <td data-num>{formatINR(r.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {confirmedMonth && (
        <p className="yx-pay-note">
          {confirmedMonth.month} base {formatINR(confirmedMonth.asPaid ?? 0)} from {reason.trim()}, confirmed by {PAYROLL_ADMIN.name}.
        </p>
      )}
      {!confirmed && (
        <section className="yx-pay-panel" aria-label={`Confirm ${missingMonth} base`}>
          <SectionTitle>Confirm the as-paid base for {missingMonth}</SectionTitle>
          <FieldRow>
            <FormField label={`Basic as paid in ${missingMonth}`} required>
              <CurrencyField value={base} onChange={setBase} />
            </FormField>
            <FormField label="Where this figure comes from" required helper={`Name the document or register (at least ${REASON_MIN} characters). Stored with the audit event.`}>
              <TextArea value={reason} onChange={setReason} rows={2} />
            </FormField>
          </FieldRow>
        </section>
      )}
      <div className="yx-pay-row">
        <p className="yx-pay-note">PF and ESI for months filed before go-live go out as supplementary filings, listed in the statutory hub under each month.</p>
        <Button size="sm" asChild>
          <a href={storyHref('screens-compliance-cmp-01-·-statutory-hub--cards')} target="_top">
            Open statutory hub
          </a>
        </Button>
      </div>
      {computed && r.canApprove ? (
        <section className="yx-pay-panel" aria-label="Computed arrears">
          <SectionTitle>Computed arrears for {who}</SectionTitle>
          <FactRow
            items={[
              { label: `Basic arrears, ${SETTLEMENT.span}`, value: formatINR(r.total) },
              { label: 'PF, employee 12% (deducted)', value: `−${formatINR(pf)}` },
              { label: 'PF, company 12%', value: formatINR(pf) },
              { label: 'ESI', value: 'Not applicable (pay above ₹21,000)' },
              { label: 'Net arrears payable', value: formatINR(r.total - pf) },
            ]}
          />
          {embedded ? (
            <p className="yx-pay-muted">Send these with Send arrears for approval below.</p>
          ) : sent ? (
            <p className="yx-pay-muted" role="status">
              Sent to {FIN_APPROVER.name} for approval.
            </p>
          ) : (
            <div className="yx-pay-row">
              <Button variant="review" icon={Send} onClick={() => setSent(true)}>
                Send for approval
              </Button>
            </div>
          )}
        </section>
      ) : (
        <div className="yx-pay-row">
          <Button variant="primary" disabled={!r.canApprove} onClick={() => setComputed(true)}>
            Compute arrears
          </Button>
          {!r.canApprove && (
            <span className="yx-pay-muted" role="status">
              Confirm the {r.missing.join(', ')} base and its source first
            </span>
          )}
        </div>
      )}
    </div>
  );
  if (embedded) return content;
  return (
    <PayFrame page="runs">
      <PageHeader
        title="Arrears worksheet: confirm base"
        description={`Union settlement effective ${formatDate(SETTLEMENT.effective)} · go-live ${formatDate(SETTLEMENT.goLive)} · Hosur plant, category A`}
        facts={`1 of 42 employees shown · ${SETTLEMENT.months.length} months before go-live`}
      />
      {content}
    </PayFrame>
  );
}

/* ================================================================== PAY-37 Wage-settlement arrears */

/** PAY-37 · Wage-settlement arrears: settlement → categories → affected employees → arrears worksheet. */
export function SettlementArrearsScreen({ step = 'categories' }: { step?: string }) {
  const cats = [
    { cat: 'Category A · machine operators', increase: 1_500, count: 42 },
    { cat: 'Category B · helpers and loaders', increase: 1_200, count: 58 },
    { cat: 'Category C · drivers', increase: 1_350, count: 9 },
  ];
  const months = SETTLEMENT.months.length;
  return (
    <PayFrame page="runs">
      <PageHeader title="Long-term settlement 2026" description={`Kaveri Foods Workers Union · settlement signed ${formatDate(SETTLEMENT.signed)} · effective ${formatDate(SETTLEMENT.effective)}`} actions={<Link href="#case">Open collective dispute case</Link>} />
      <Stepper
        title="Settlement arrears"
        defaultCurrent={step}
        finishLabel="Send arrears for approval"
        steps={[
          { id: 'settlement', title: 'Settlement', description: 'Terms and effective date', content: <DescriptionList columns={2} items={[{ label: 'Union', value: 'Kaveri Foods Workers Union (registration 118/KA/2019)' }, { label: 'Signed', value: formatDate(SETTLEMENT.signed) }, { label: 'Effective from', value: formatDate(SETTLEMENT.effective) }, { label: 'Terms document', value: <Link href="#doc">Settlement terms (PDF)</Link> }]} /> },
          {
            id: 'categories',
            title: 'Categories',
            description: 'Increase per worker category',
            content: (
              <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
              <table className="yx-pay-table">
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col" data-num>
                      Increase a month
                    </th>
                    <th scope="col" data-num>
                      Workers
                    </th>
                    <th scope="col" data-num>
                      Arrears {SETTLEMENT.span}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cats.map((c) => (
                    <tr key={c.cat}>
                      <th scope="row">{c.cat}</th>
                      <td data-num>{formatINR(c.increase)}</td>
                      <td data-num>{c.count}</td>
                      <td data-num>{formatINR(c.increase * c.count * months)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    <td />
                    <td data-num>{cats.reduce((a, c) => a + c.count, 0)}</td>
                    <td data-num>{formatINR(cats.reduce((a, c) => a + c.increase * c.count * months, 0))}</td>
                  </tr>
                </tfoot>
              </table>
              </div>
            ),
          },
          { id: 'employees', title: 'Affected employees', description: '109 workers', content: <p className="yx-pay-muted">109 workers matched by category on the effective date; 4 leavers since April get arrears in an off-cycle run.</p> },
          { id: 'worksheet', title: 'Arrears worksheet', description: 'Base confirmation', content: <ArrearsBaseScreen embedded /> },
        ]}
      />
    </PayFrame>
  );
}

/* ================================================================== PAY-38 Actuarial census and valuation */

/** Valuation figures from the actuary's report. Rows with sign −1 reduce the obligation and show in brackets. */
const VAL_ROWS = [
  { k: 'open', label: 'Opening obligation', sign: 1, g: 1_42_60_000, l: 38_40_000 },
  { k: 'svc', label: 'Current service cost', sign: 1, g: 21_80_000, l: 6_20_000 },
  { k: 'int', label: 'Interest cost', sign: 1, g: 10_12_000, l: 2_72_000 },
  { k: 'paid', label: 'Benefits paid (less)', sign: -1, g: 8_40_000, l: 3_10_000 },
  { k: 'loss', label: 'Actuarial loss', sign: 1, g: 3_18_000, l: 0 },
  { k: 'gain', label: 'Actuarial gain (less)', sign: -1, g: 0, l: 62_000 },
];
/** Provisions already in the books at 31 Mar 2026. */
const BOOKS = { g: 1_61_24_000, l: 42_48_000 };
const CENSUS_SENT = new Date(2026, 3, 12);
const CENSUS = [
  { v: 'Version 2', count: 158, layout: 'Standard + actuary columns', current: true },
  { v: 'Version 1', count: 157, layout: 'Standard · 1 leaver missing', current: false },
];
const REPORT = { name: 'Actuarial report FY25-26.pdf', on: d(12) };
const JOURNAL_REF = 'JV/2026-27/0412';
const bracketed = (n: number, sign: number) => (sign < 0 && n ? `(${formatINR(n)})` : formatINR(n));
const dayNo = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / 86_400_000;
type Figure = { g: number | null; l: number | null };

/** PAY-38 · Actuarial census export and valuation upload (census versions, valuation results, provision posting). */
export function ActuarialScreen({ step = 'census', uploaded = false, journalOpen = false, posted: postedAtStart = false }: { step?: string; uploaded?: boolean; journalOpen?: boolean; /** Start with the journal posted (stories). */ posted?: boolean }) {
  const narrow = useNarrow();
  const g = gratuity(48_000, 80);
  const [cur, setCur] = useState(step);
  const [got, setGot] = useState<string[]>([]);
  const [journal, setJournal] = useState(journalOpen);
  const [reminded, setReminded] = useState(false);
  const [report, setReport] = useState<{ name: string; on: Date } | null>(uploaded ? REPORT : null);
  const [figs, setFigs] = useState<Record<string, Figure>>(() => Object.fromEntries(VAL_ROWS.map((r) => [r.k, uploaded ? { g: r.g, l: r.l } : { g: null, l: null }])));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [posted, setPosted] = useState(postedAtStart);
  const filled = VAL_ROWS.every((r) => figs[r.k].g != null && figs[r.k].l != null);
  const closing = (key: 'g' | 'l') => VAL_ROWS.reduce((a, r) => a + r.sign * (figs[r.k][key] ?? 0), 0);
  const jG = closing('g') - BOOKS.g;
  const jL = closing('l') - BOOKS.l;
  const sentDays = dayNo(TODAY) - dayNo(CENSUS_SENT);
  const setFig = (k: string, key: 'g' | 'l', v: number | null) => setFigs((f) => ({ ...f, [k]: { ...f[k], [key]: v } }));
  const figureCell = (r: (typeof VAL_ROWS)[number], key: 'g' | 'l') =>
    uploaded ? (
      bracketed(r[key], r.sign)
    ) : (
      <CurrencyField size="sm" aria-label={`${r.label} ${key === 'g' ? 'gratuity' : 'leave'}`} value={figs[r.k][key]} onChange={(v) => setFig(r.k, key, v)} />
    );
  const xlsx = (v: string) =>
    got.includes(v) ? (
      <span className="yx-pay-muted" role="status">Downloaded</span>
    ) : (
      <Button size="sm" icon={Download} aria-label={`Download ${v} census as XLSX`} onClick={() => setGot([...got, v])}>
        XLSX
      </Button>
    );
  const censusStatus = (c: (typeof CENSUS)[number]) =>
    !c.current ? (
      <Badge>Replaced</Badge>
    ) : report ? (
      <Badge tone="success" style={{ whiteSpace: 'nowrap' }}>
        Sent {formatDate(CENSUS_SENT)}
      </Badge>
    ) : (
      <Badge tone="danger" style={{ whiteSpace: 'nowrap' }}>
        Sent {sentDays} days ago
      </Badge>
    );
  const asAt = formatDate(new Date(2026, 2, 31));
  return (
    <PayFrame page="reports" persona="fin">
      <PageHeader
        title="Actuarial valuation · 31 Mar 2026"
        description="Gratuity and leave liability for Kaveri Foods Pvt Ltd"
        status={<Badge tone={posted || report ? 'success' : 'warning'}>{posted ? 'Journal posted' : report ? 'Valuation uploaded' : 'Waiting for actuary'}</Badge>}
      />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Post ${formatINR(jG + jL)} provision journal to accounting?`}
        consequence={`Gratuity ${formatINR(jG)} and leave ${formatINR(jL)}, dated 31 Mar 2026. You can reverse it afterwards.`}
        confirmLabel="Post journal"
        onConfirm={() => setPosted(true)}
      />
      <Stepper
        title="Actuarial valuation"
        current={cur}
        onCurrentChange={setCur}
        finishLabel="Post provision journal"
        onFinish={() => setConfirmOpen(true)}
        finishBlocked={posted ? `Journal posted · ${JOURNAL_REF}` : undefined}
        continueBlocked={cur === 'valuation' && (!report || !filled) ? "Upload the actuary's report and enter the figures first" : undefined}
        steps={[
          {
            id: 'census',
            title: 'Census',
            description: `Sent ${formatDate(CENSUS_SENT)}`,
            // Sent to the actuary, so the step shows Done even while it is open.
            status: 'done',
            content: (
              <div className="yx-pay-stack">
                {narrow ? (
                  <ul className="yx-pay-cards" aria-label="Census versions">
                    {CENSUS.map((c) => (
                      <li key={c.v}>
                        <div className="yx-pay-cards__row">
                          <strong>
                            {c.v} · {c.count} employees
                          </strong>
                          {censusStatus(c)}
                        </div>
                        <span className="yx-pay-muted">
                          As at {asAt} · {c.layout}
                        </span>
                        <div className="yx-pay-row">{xlsx(c.v)}</div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
                    <table className="yx-pay-table">
                      <thead>
                        <tr>
                          <th scope="col">Version</th>
                          <th scope="col">As at</th>
                          <th scope="col" data-num>
                            Employees
                          </th>
                          <th scope="col">Layout</th>
                          <th scope="col">Status</th>
                          <th scope="col">
                            <span className="yx-visually-hidden">Download</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {CENSUS.map((c) => (
                          <tr key={c.v}>
                            <th scope="row" style={{ whiteSpace: 'nowrap' }}>
                              {c.v}
                            </th>
                            <td style={{ whiteSpace: 'nowrap' }}>{asAt}</td>
                            <td data-num>{c.count}</td>
                            <td>{c.layout}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>{censusStatus(c)}</td>
                            <td>{xlsx(c.v)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {!report && (
                  <div className="yx-pay-row">
                    {reminded ? (
                      <span className="yx-pay-muted" role="status">
                        Reminder sent to the actuary today.
                      </span>
                    ) : (
                      <Button size="sm" icon={BellRing} onClick={() => setReminded(true)}>
                        Remind actuary
                      </Button>
                    )}
                  </div>
                )}
                <p className="yx-pay-note">Columns: employee ID, date of birth, gender, joining date, service, wage for gratuity (basic + DA), encashable leave by type, the year&apos;s exits with payouts. Restricted: payroll and finance only.</p>
              </div>
            ),
          },
          {
            id: 'valuation',
            title: 'Valuation',
            description: "Actuary's report and figures",
            content: (
              <div className="yx-pay-stack">
                {report ? (
                  <div className="yx-pay-panel">
                    <div className="yx-pay-cards__row">
                      <div>
                        <strong>{report.name}</strong>
                        <p className="yx-pay-muted">Uploaded {formatDate(report.on)}</p>
                      </div>
                      <div className="yx-pay-row">
                        <Button size="sm" asChild>
                          <a href="#actuarial-report">
                            <Eye aria-hidden="true" size="1em" /> View
                          </a>
                        </Button>
                        <Button size="sm" onClick={() => setReport(null)}>
                          Replace
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <FileUpload
                    upload={async () => {}}
                    accept={['.pdf']}
                    multiple={false}
                    onItemsChange={(items) => {
                      const done = items.find((i) => i.status === 'done');
                      if (done) setReport({ name: done.file.name, on: TODAY });
                    }}
                  />
                )}
                {narrow ? (
                  <ul className="yx-pay-cards" aria-label="Valuation figures">
                    {VAL_ROWS.map((r) => (
                      <li key={r.k}>
                        <strong>{r.label}</strong>
                        <div className="yx-pay-cards__row">
                          {(['g', 'l'] as const).map((key) => (
                            <span key={key} style={{ flex: 1, minWidth: 0 }}>
                              <span className="yx-pay-muted">{key === 'g' ? 'Gratuity' : 'Leave'} </span>
                              {figureCell(r, key)}
                            </span>
                          ))}
                        </div>
                      </li>
                    ))}
                    <li>
                      <div className="yx-pay-cards__row">
                        <strong>Closing obligation</strong>
                      </div>
                      <div className="yx-pay-cards__row">
                        <span>Gratuity {filled ? formatINR(closing('g')) : '—'}</span>
                        <span>Leave {filled ? formatINR(closing('l')) : '—'}</span>
                      </div>
                    </li>
                  </ul>
                ) : (
                <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
                  <table className="yx-pay-table">
                    <thead>
                      <tr>
                        <th scope="col">Figure</th>
                        <th scope="col" data-num>
                          Gratuity
                        </th>
                        <th scope="col" data-num>
                          Leave
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {VAL_ROWS.map((r) => (
                        <tr key={r.k}>
                          <th scope="row">{r.label}</th>
                          {(['g', 'l'] as const).map((key) => (
                            <td key={key} data-num>
                              {figureCell(r, key)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row">Closing obligation</th>
                        <td data-num>{filled ? formatINR(closing('g')) : '—'}</td>
                        <td data-num>{filled ? formatINR(closing('l')) : '—'}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                )}
                <p className="yx-pay-note">Closing obligation is calculated from the rows above. Figures in brackets reduce it.</p>
              </div>
            ),
          },
          {
            id: 'post',
            title: 'Provision posting',
            description: 'Journal to accounting',
            content: (
              <div className="yx-pay-stack">
                {posted && (
                  <InlineAlert
                    tone="success"
                    title={`Journal posted · ${JOURNAL_REF}`}
                    actions={
                      <Button size="sm" onClick={() => setPosted(false)}>
                        Reverse posting
                      </Button>
                    }
                  >
                    {formatINR(jG + jL)} provision journal sent to accounting by {FIN_APPROVER.name} on {formatDate(TODAY)}.
                  </InlineAlert>
                )}
                <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Provision against the valuation">
                  <table className="yx-pay-table">
                    <thead>
                      <tr>
                        <th scope="col">Figure</th>
                        <th scope="col" data-num>
                          Gratuity
                        </th>
                        <th scope="col" data-num>
                          Leave
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th scope="row">Provision in books</th>
                        <td data-num>{formatINR(BOOKS.g)}</td>
                        <td data-num>{formatINR(BOOKS.l)}</td>
                      </tr>
                      <tr>
                        <th scope="row">Closing obligation</th>
                        <td data-num>{formatINR(closing('g'))}</td>
                        <td data-num>{formatINR(closing('l'))}</td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row">Journal: debit expense</th>
                        <td data-num>{formatINR(jG)}</td>
                        <td data-num>{formatINR(jL)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="yx-pay-note">
                  Check: 6 years 8 months of service on ₹48,000 rounds to {g.years} years, so gratuity due is {formatINR(g.amount)} (15/26 × wage × years).
                </p>
                <div className="yx-pay-row">
                  <Button icon={FileText} aria-expanded={journal} onClick={() => setJournal(!journal)}>
                    {journal ? 'Hide journal' : 'Preview journal'}
                  </Button>
                </div>
                {journal && (
                  <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Provision journal preview">
                    <table className="yx-pay-table">
                      <thead>
                        <tr>
                          <th scope="col">Account</th>
                          <th scope="col" data-num>Debit</th>
                          <th scope="col" data-num>Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ['Gratuity expense', jG, 0],
                          ['Provision for gratuity', 0, jG],
                          ['Leave encashment expense', jL, 0],
                          ['Provision for leave encashment', 0, jL],
                        ].map(([a, dr, cr]) => (
                          <tr key={String(a)}>
                            <th scope="row">{a}</th>
                            <td data-num>{dr ? formatINR(Number(dr)) : ''}</td>
                            <td data-num>{cr ? formatINR(Number(cr)) : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th scope="row">Total</th>
                          <td data-num>{formatINR(jG + jL)}</td>
                          <td data-num>{formatINR(jG + jL)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            ),
          },
        ]}
      />
    </PayFrame>
  );
}

