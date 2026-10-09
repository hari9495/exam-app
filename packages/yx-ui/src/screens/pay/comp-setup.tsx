// Compensation and payroll set-up: PAY-12 compensation tab + revision sheet, PAY-42 suggest split,
// PAY-13 template builder / CTC designer, PAY-14 component library, PAY-15 payslip layout editor, PAY-16 set-up wizard.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, GripVertical, Lock, Plus } from 'lucide-react';
import { Button, IconButton, type ButtonProps } from '../../components/button';
import { Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { InlineAlert } from '../../components/feedback';
import { ErrorSummary, FieldRow, FormField, FormSection } from '../../components/field';
import { CurrencyField, NumberField, TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
import { Select } from '../../components/select';
import { FileUpload } from '../../components/upload';
import { DatePicker } from '../../components/date';
import { ConfirmDialog } from '../../components/overlay';
import { Icon } from '../../components/foundations';
import { PayslipDocument, type PayslipData } from '../../components/print';
import { DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { Stepper, useNarrow } from '../../components/stepper';
import { DataTable, tableToCsv, type TableColumn } from '../../components/table';
import { Timeline } from '../../components/timeline';
import { formatDate, formatINR } from '../../lib/format';
import { FactRow, PayFrame, PaySettingsFrame, SectionTitle, StateBlock, type ViewState } from './pay-kit';
import { COMPONENTS, FIN_APPROVER, HR_ADMIN, LETTERHEAD, MY_PAYSLIP, PAYROLL_ADMIN, RUN_ROWS, d, type ComponentRow } from './pay-data';
import { EMPLOYEES } from '../_kit/data';
import { checkSplit, codeWageAddBack, compareRegimes, esiContribution, NO_DEDUCTIONS, pfContribution, type SplitOption } from './pay-logic';

/* ================================================================== shared */

const storyHref = (id: string, args?: string) => `/?path=/story/${id}${args ? `&args=${args}` : ''}`;

/** A bordered button that opens another story (the next screen in the flow). */
function StoryButton({ to, args, children, ...rest }: { to: string; args?: string; children: ReactNode } & Pick<ButtonProps, 'variant' | 'size'>) {
  return (
    <Button {...rest} asChild>
      <a href={storyHref(to, args)} target="_top">
        <span className="yx-button__label">{children}</span>
      </a>
    </Button>
  );
}

const PAY14_LIST = 'screens-pay-pay-14-·-component-library--list';
const PAY_HOME = 'screens-pay-pay-01-·-payroll-home--draft';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** "+₹1,00,000", "−₹1,00,000", "No change". */
const signedINR = (n: number) => (n === 0 ? 'No change' : `${n > 0 ? '+' : '−'}${formatINR(Math.abs(n))}`);
/** Karnataka minimum wage (skilled, zone 1) a month; the split checks use the same figure. */
const KA_MIN_WAGE = 14_520;

/**
 * Monthly amounts from the India standard CTC formulas (TEMPLATE_LINES) for an annual CTC.
 * PAY-12 (breakup, revision effect) and the PAY-13 live test both use this, so the same person gets the same Basic.
 */
export function templateBreakup(ctcAnnual: number, { basicPct = 0.4, metro = true }: { basicPct?: number; metro?: boolean } = {}) {
  const basic = Math.round((ctcAnnual * basicPct) / 12);
  const hra = Math.round(basic * (metro ? 0.5 : 0.4));
  const lta = 5_000;
  const pf = pfContribution(basic, { restrictToCeiling: true }).employee;
  const grat = Math.round((basic * 15) / 26 / 12);
  const spl = Math.round(ctcAnnual / 12 - basic - hra - lta - pf - grat);
  const gross = basic + hra + lta + spl;
  return { basic, hra, lta, pf, grat, spl, gross, addBack: Math.round(codeWageAddBack(basic, gross).addBack) };
}

/* ================================================================== PAY-42 Suggest split */

export const SPLITS: SplitOption[] = [
  { id: 'a', name: 'Option A · balanced', basic: 57_000, hra: 22_800, special: 25_200, reimbursements: 8_000, employerNps: 5_000 },
  { id: 'b', name: 'Option B · more take-home', basic: 57_000, hra: 28_500, special: 27_500, reimbursements: 0, employerNps: 0 },
  { id: 'c', name: 'Option C · tax-efficient', basic: 60_000, hra: 30_000, special: 11_000, reimbursements: 12_000, employerNps: 7_700 },
  { id: 'x', name: 'Option D · low basic', basic: 38_000, hra: 19_000, special: 56_000, reimbursements: 0, employerNps: 0 },
];

/** PAY-42 · Suggest split: options side by side with take-home in both regimes, employer cost, law checks; HR chooses. */
export function SuggestSplitDrawer({
  open,
  onOpenChange,
  stale,
  chosen: initialChosen,
  ctcMonthly = 1_25_000,
  onUse,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  stale?: boolean;
  chosen?: string;
  ctcMonthly?: number;
  /** Called with the chosen option when HR presses "Use option …". */
  onUse?: (o: SplitOption) => void;
}) {
  const [chosen, setChosen] = useState<string | null>(initialChosen ?? null);
  const checked = SPLITS.map((o) => ({ o, c: checkSplit(o, KA_MIN_WAGE) }));
  const offered = checked.filter((x) => x.c.ok);
  const hidden = checked.filter((x) => !x.c.ok);
  const pick = SPLITS.find((s) => s.id === chosen);
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Suggest split"
      subtitle={`Annual CTC ${formatINR(ctcMonthly * 12)} · Bengaluru · grade L3 · template India standard CTC v3`}
      size="full"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!pick || stale}
            onClick={() => {
              if (pick) onUse?.(pick);
              onOpenChange(false);
            }}
          >
            Use {pick?.name.split(' · ')[0] ?? 'option'}
          </Button>
        </>
      }
    >
      <div className="yx-pay-stack">
        {stale && (
          <InlineAlert tone="warning" title="These suggestions are out of date">
            The Karnataka minimum wage changed on 1 Oct 2026 after these options were made. Refresh to get options that meet the new rules.
          </InlineAlert>
        )}
        <p className="yx-pay-muted">
          Every option passes company CTC rules, the Code wage 50% rule, state minimum wage and PF / ESI limits. {hidden.length} option{hidden.length === 1 ? '' : 's'} failed a check and {hidden.length === 1 ? 'is' : 'are'} not offered. Rule-based calculator; no data leaves YukthiX. Your choice and the options shown are recorded.
        </p>
        <div className="yx-pay-scroll">
          <table className="yx-pay-table">
            <thead>
              <tr>
                <th scope="col">Monthly</th>
                {offered.map(({ o }) => (
                  <th key={o.id} scope="col" data-num>
                    {o.name} {stale && <Badge tone="warning">Stale</Badge>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['Basic', (o: SplitOption) => o.basic],
                  ['House rent allowance', (o: SplitOption) => o.hra],
                  ['Special allowance', (o: SplitOption) => o.special],
                  ['Reimbursements (meal, fuel, telephone)', (o: SplitOption) => o.reimbursements],
                  ['Employer NPS', (o: SplitOption) => o.employerNps],
                  ['Employer PF', (o: SplitOption) => pfContribution(o.basic, { restrictToCeiling: true }).employee],
                ] as const
              ).map(([label, f]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  {offered.map(({ o }) => (
                    <td key={o.id} data-num>
                      {formatINR(f(o))}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <th scope="row">Take-home, new regime</th>
                {offered.map(({ o, c }) => {
                  const pf = pfContribution(o.basic, { restrictToCeiling: true }).employee;
                  const tax = compareRegimes(c.gross * 12, { ...NO_DEDUCTIONS, employerNps: o.employerNps * 12 }).new.total;
                  return (
                    <td key={o.id} data-num>
                      {formatINR(Math.round(c.gross - pf - 200 - tax / 12))}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <th scope="row">Take-home, old regime</th>
                {offered.map(({ o, c }) => {
                  const pf = pfContribution(o.basic, { restrictToCeiling: true }).employee;
                  const tax = compareRegimes(c.gross * 12, { ...NO_DEDUCTIONS, sec80c: pf * 12, employerNps: o.employerNps * 12, hraExemption: Math.round(o.hra * 0.6) * 12 }).old.total;
                  return (
                    <td key={o.id} data-num>
                      {formatINR(Math.round(c.gross - pf - 200 - tax / 12))}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <th scope="row">Employer cost</th>
                {offered.map(({ o, c }) => (
                  <td key={o.id} data-num>
                    {formatINR(c.gross + o.employerNps + pfContribution(o.basic, { restrictToCeiling: true }).employee)}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Law checks</th>
                {offered.map(({ o }) => (
                  <td key={o.id}>
                    <Badge tone="success">Passes all</Badge>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <RadioGroup
          aria-label="Choose an option"
          orientation="horizontal"
          value={chosen ?? undefined}
          onChange={setChosen}
          options={offered.map(({ o }) => ({ value: o.id, label: o.name.split(' · ')[0], disabled: stale }))}
        />
        {hidden.map(({ o, c }) => (
          <p key={o.id} className="yx-pay-note">
            Not offered: {o.name}. {c.issues.join('; ')}.
          </p>
        ))}
      </div>
    </Drawer>
  );
}

/* ================================================================== PAY-12 Compensation tab + revision sheet */

export type CompVariant = 'default' | 'revision' | 'revision-arrears' | 'hourly' | 'split' | 'split-stale';

const CURRENT_CTC = 14_00_000;
const CURRENT_RATE = 850;
/** First day of the October run: an earlier effective date is back-dated and pays arrears. */
const NEXT_RUN = new Date(2026, 9, 1);
/** The current CTC took effect on 1 Apr 2026; a revision can't start before it. */
const CURRENT_FROM = d(1, 3);
const TEMPLATES = {
  v3: { label: 'India standard CTC v3', basicPct: 0.4 },
  plant: { label: 'Plant workers v2', basicPct: 0.5 },
} as const;
type TemplateId = keyof typeof TEMPLATES;
const REASONS = [
  { value: 'promo', label: 'Promotion' },
  { value: 'review', label: 'Annual review' },
  { value: 'market', label: 'Market correction' },
];

/** Annual breakup from the template formulas; special allowance takes the rounding so the rows add up to the CTC. */
function annualBreakup(ctc: number): [string, number][] {
  const b = templateBreakup(ctc);
  const rows: [string, number][] = [
    ['Basic', b.basic * 12],
    ['House rent allowance', b.hra * 12],
    ['Leave travel allowance', b.lta * 12],
    ['Employer PF', b.pf * 12],
    ['Gratuity provision', b.grat * 12],
  ];
  const special = ctc - rows.reduce((a, [, v]) => a + v, 0);
  return [rows[0], rows[1], ['Special allowance', special], ...rows.slice(2)];
}

/** PAY-12 · Compensation tab (timeline, pay basis, breakup) and revision sheet with arrears preview. */
export function CompensationScreen({
  variant = 'default',
  persona = 'pa',
  state = 'ready',
  splitChosen,
}: {
  variant?: CompVariant;
  persona?: 'pa' | 'hr';
  state?: ViewState;
  /** Option already picked in the Suggest split drawer (PAY-42 story). */
  splitChosen?: string;
}) {
  const hourly = variant === 'hourly';
  const [view, setView] = useState<ViewState>(state);
  const [revise, setRevise] = useState(variant.startsWith('revision'));
  const [split, setSplit] = useState(variant.startsWith('split'));
  const [effective, setEffective] = useState<Date | null>(variant === 'revision-arrears' ? new Date(2026, 6, 1) : NEXT_RUN);
  const [reason, setReason] = useState<string | null>('promo');
  const [basis, setBasis] = useState(hourly ? 'hourly' : 'ctc');
  const [ctc, setCtc] = useState<number | null>(hourly ? null : 15_00_000);
  const [rate, setRate] = useState<number | null>(hourly ? CURRENT_RATE : null);
  const [template, setTemplate] = useState<TemplateId>('v3');
  const [chosen, setChosen] = useState<SplitOption | null>(null);
  const [sent, setSent] = useState(false);

  const rateBased = basis === 'hourly' || basis === 'daily';
  const rateUnit = basis === 'hourly' ? 'an hour' : 'a day';
  // The person who signs in sends; the next person in the chain approves (HR sends to Finance).
  const approver = persona === 'hr' ? FIN_APPROVER : HR_ADMIN;
  const backdated = !!effective && effective < NEXT_RUN;
  // ponytail: whole months from the effective month to September; a mid-month date isn't prorated yet.
  const arrearsMonths = backdated && effective ? Array.from({ length: 9 - effective.getMonth() }, (_, i) => effective.getMonth() + i) : [];
  const oldB = templateBreakup(CURRENT_CTC);
  const newB = templateBreakup(ctc ?? 0, { basicPct: TEMPLATES[template].basicPct });
  const grossDiff = newB.gross - oldB.gross;
  const ctcDiff = (ctc ?? 0) - CURRENT_CTC;
  const pct = Math.round((ctcDiff / CURRENT_CTC) * 1000) / 10;
  const belowMin = !rateBased && !!ctc && newB.basic < KA_MIN_WAGE;
  const blocked = !effective
    ? 'Enter the effective date'
    : !reason
      ? 'Choose a reason'
      : rateBased
        ? !rate
          ? `Enter the new ${basis === 'hourly' ? 'hourly' : 'daily'} rate`
          : hourly && basis === 'hourly' && rate === CURRENT_RATE
            ? 'Same as current rate'
            : undefined
        : !ctc
          ? 'Enter the new annual CTC'
          : !hourly && ctc === CURRENT_CTC
            ? 'Same as current CTC'
            : belowMin
              ? 'Basic is below the minimum wage'
              : undefined;
  const reasonLabel = REASONS.find((r) => r.value === reason)?.label.toLowerCase();
  const history = hourly
    ? [
        { id: 't1', actor: { name: HR_ADMIN.name }, action: `set rate ${formatINR(CURRENT_RATE)} an hour for placement PL-0342`, at: d(1, 3) },
        { id: 't2', actor: { name: PAYROLL_ADMIN.name }, action: 'set overtime at 1.5× and holidays at 2× from the Deccan Retail rate card', at: d(1, 3) },
      ]
    : [
        { id: 't1', actor: { name: HR_ADMIN.name }, action: `revised CTC to ${formatINR(CURRENT_CTC)} from 1 Apr 2026 (annual review, +12%)`, at: d(28, 2) },
        { id: 't2', actor: { name: PAYROLL_ADMIN.name }, action: 'moved to template India standard CTC v3', at: d(2, 0) },
        { id: 't3', actor: { name: HR_ADMIN.name }, action: `set CTC ${formatINR(12_50_000)} on joining`, at: new Date(2024, 6, 1) },
      ];
  return (
    <PayFrame page="compensation" persona={persona}>
      <ObjectHeader
        name={hourly ? 'Rahul Sharma' : 'Arjun Kulkarni'}
        person
        photoUrl={null}
        secondary={hourly ? 'Contract Analyst (placement) · Engineering · Bengaluru' : 'Software Engineer · Engineering · Bengaluru'}
        status={<Badge tone="success">Active</Badge>}
        facts={
          view !== 'ready'
            ? []
            : hourly
              ? [
                  { label: 'Pay basis', value: 'Hourly rate' },
                  { label: 'Rate', value: `${formatINR(CURRENT_RATE)} an hour` },
                  { label: 'Placement', value: 'PL-0342 · Deccan Retail' },
                ]
              : [
                  { label: 'Annual CTC', value: formatINR(CURRENT_CTC) },
                  { label: 'Pay basis', value: 'Monthly CTC' },
                  { label: 'Effective', value: formatDate(CURRENT_FROM) },
                  { label: 'Template', value: 'India standard CTC v3' },
                ]
        }
        actions={
          <>
            {view !== 'ready' && (
              <span className="yx-pay-note" role="status">
                {view === 'loading' ? 'Loading pay details' : "Pay details didn't load"}
              </span>
            )}
            <Button variant="primary" onClick={() => setRevise(true)} disabled={sent || view !== 'ready'}>
              Revise compensation
            </Button>
          </>
        }
      />
      {sent && effective && (
        <InlineAlert tone="success" title="Revision sent for approval">
          {rateBased
            ? `New rate ${formatINR(rate ?? 0)} ${rateUnit} from ${formatDate(effective)} (${reasonLabel}) is with ${approver.name} for approval. The current rate stays until it is approved.`
            : `New annual CTC ${formatINR(ctc ?? 0)} on ${TEMPLATES[template].label} from ${formatDate(effective)} (${reasonLabel}) is with ${approver.name} for approval.${arrearsMonths.length ? ` Arrears of ${formatINR(grossDiff * arrearsMonths.length)} are paid in the October run once approved.` : ''} The current CTC stays until it is approved.`}
        </InlineAlert>
      )}
      <Tabs defaultValue="comp">
        <TabsList aria-label="Employee record">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="job">Job</TabsTrigger>
          <TabsTrigger value="comp">Compensation</TabsTrigger>
          <TabsTrigger value="docs">Documents</TabsTrigger>
        </TabsList>
        <TabsContent value="comp">
          <StateBlock
            state={view}
            rows={6}
            errorTitle="We couldn't load pay details."
            onRetry={() => {
              setView('loading');
              setTimeout(() => setView('ready'), 1200);
            }}
          >
            <div className="yx-pay-split">
              <div className="yx-pay-stack">
                {hourly ? (
                  <section className="yx-pay-panel" aria-label="Rate-based pay">
                    <SectionTitle>Rate-based pay</SectionTitle>
                    <DescriptionList
                      columns={2}
                      items={[
                        { label: 'Pay basis', value: 'Hourly rate (from the placement rate card)' },
                        { label: 'Rate', value: `${formatINR(CURRENT_RATE)} an hour` },
                        { label: 'Overtime multiplier', value: '1.5×' },
                        { label: 'Holiday multiplier', value: '2×' },
                        { label: 'Hours source', value: 'Approved timesheet hours only' },
                        { label: 'September hours', value: '168 regular · 6 overtime' },
                      ]}
                    />
                    <p className="yx-pay-note">Each payslip line carries the placement ID for margin reporting.</p>
                  </section>
                ) : (
                  <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Current breakup (CTC-first), scrolls sideways on small screens">
                    <table className="yx-pay-table">
                      <caption>Current breakup (India standard CTC v3)</caption>
                      <thead>
                        <tr>
                          <th scope="col">Component</th>
                          <th scope="col" data-num>
                            Annual
                          </th>
                          <th scope="col" data-num>
                            Monthly
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {annualBreakup(CURRENT_CTC).map(([l, a]) => (
                          <tr key={l}>
                            <th scope="row">{l}</th>
                            <td data-num>{formatINR(a)}</td>
                            <td data-num>{formatINR(Math.round(a / 12))}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th scope="row">Cost to company</th>
                          <td data-num>{formatINR(CURRENT_CTC)}</td>
                          <td data-num>{formatINR(Math.round(CURRENT_CTC / 12))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
              <section className="yx-pay-panel" aria-label="Compensation history">
                <SectionTitle>History</SectionTitle>
                <Timeline aria-label="Compensation changes" today={d(29)} items={history} />
              </section>
            </div>
          </StateBlock>
        </TabsContent>
      </Tabs>
      <Drawer
        open={revise}
        onOpenChange={setRevise}
        title="Revise compensation"
        subtitle="Goes through approval. A revision letter is generated from the letter template once approved."
        size="lg"
        footer={
          <>
            <Button onClick={() => setRevise(false)}>Cancel</Button>
            {!rateBased && <Button onClick={() => setSplit(true)}>Suggest split</Button>}
            {blocked && (
              <span className="yx-pay-note" role="status">
                {blocked}
              </span>
            )}
            <Button
              variant="primary"
              disabled={!!blocked}
              onClick={() => {
                setSent(true);
                setRevise(false);
              }}
            >
              Send for approval
            </Button>
          </>
        }
      >
        <div className="yx-pay-split">
          <div className="yx-pay-stack">
            <FieldRow>
              <FormField label="Effective from" required helper={backdated ? 'Back-dated: arrears are paid in the next run; past payslips are never changed.' : undefined}>
                <DatePicker value={effective} onChange={setEffective} min={CURRENT_FROM} required />
              </FormField>
              <FormField label="Reason" required>
                <Select value={reason} onChange={setReason} options={REASONS} />
              </FormField>
            </FieldRow>
            <FormField label="Pay basis" required>
              <RadioGroup
                orientation="horizontal"
                value={basis}
                onChange={setBasis}
                options={[
                  { value: 'ctc', label: 'Monthly CTC' },
                  { value: 'fixed', label: 'Fixed amounts' },
                  { value: 'hourly', label: 'Hourly rate' },
                  { value: 'daily', label: 'Daily rate' },
                ]}
              />
            </FormField>
            {rateBased ? (
              <FormField label={basis === 'hourly' ? 'New hourly rate' : 'New daily rate'} required helper={hourly ? `Current rate ${formatINR(CURRENT_RATE)} an hour (placement PL-0342)` : 'Pay follows approved timesheet hours.'}>
                <CurrencyField value={rate} onChange={setRate} />
              </FormField>
            ) : (
              <>
                <FormField label="New annual CTC" required helper={hourly ? undefined : `Current ${formatINR(CURRENT_CTC)}`}>
                  <CurrencyField value={ctc} onChange={setCtc} />
                </FormField>
                <FormField label="Salary template">
                  <Select<TemplateId> value={template} onChange={(v) => v && setTemplate(v)} options={[{ value: 'v3', label: TEMPLATES.v3.label }, { value: 'plant', label: TEMPLATES.plant.label }]} />
                </FormField>
              </>
            )}
          </div>
          <aside className="yx-pay-panel" aria-label="Effect">
            <SectionTitle>Effect</SectionTitle>
            {rateBased ? (
              <FactRow
                items={[
                  hourly && basis === 'hourly'
                    ? { label: 'Change', value: rate ? `${signedINR(rate - CURRENT_RATE)} an hour` : '—' }
                    : { label: 'Change', value: `Moves to a ${basis === 'hourly' ? 'hourly' : 'daily'} rate` },
                  { label: 'Monthly pay', value: 'Rate × approved hours' },
                ]}
              />
            ) : (
              <>
                <FactRow
                  items={[
                    { label: 'Change', value: ctc ? `${signedINR(ctcDiff)} a year${ctcDiff ? ` (${pct > 0 ? '+' : '−'}${Math.abs(pct)}%)` : ''}` : '—' },
                    { label: 'Monthly gross change', value: ctc ? signedINR(grossDiff) : '—' },
                  ]}
                />
                {ctc ? (
                  belowMin ? (
                    <InlineAlert tone="danger">
                      Basic {formatINR(newB.basic)} a month is below the Karnataka minimum wage of {formatINR(KA_MIN_WAGE)}.
                    </InlineAlert>
                  ) : newB.addBack > 0 ? (
                    <InlineAlert tone="info">
                      Minimum wage check passes. Code wage: {formatINR(newB.addBack)} a month is added back to PF and ESI wage.
                    </InlineAlert>
                  ) : (
                    <InlineAlert tone="success">Minimum wage and Code wage checks pass.</InlineAlert>
                  )
                ) : null}
                {chosen && (
                  <FactRow
                    items={[
                      { label: `Basic (${chosen.name.split(' · ')[0]})`, value: formatINR(chosen.basic) },
                      { label: 'HRA', value: formatINR(chosen.hra) },
                      { label: 'Special allowance', value: formatINR(chosen.special) },
                    ]}
                  />
                )}
                {arrearsMonths.length > 0 && (
                  <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Arrears preview (paid in October run), scrolls sideways on small screens">
                    <table className="yx-pay-table">
                      <caption>Arrears preview (paid in October run)</caption>
                      <tbody>
                        {arrearsMonths.map((m) => (
                          <tr key={m}>
                            <th scope="row">{MONTHS[m]} 2026</th>
                            <td data-num>{formatINR(grossDiff)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th scope="row">Total arrears</th>
                          <td data-num>{formatINR(grossDiff * arrearsMonths.length)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
                {arrearsMonths.length > 0 && <p className="yx-pay-note">PF on arrears is attributed to the months they relate to; supplementary ECRs are raised for months already filed.</p>}
              </>
            )}
          </aside>
        </div>
      </Drawer>
      <SuggestSplitDrawer
        open={split}
        onOpenChange={setSplit}
        stale={variant === 'split-stale'}
        chosen={splitChosen}
        onUse={(o) => {
          setChosen(o);
          setRevise(true);
        }}
      />
    </PayFrame>
  );
}

/* ================================================================== PAY-13 Template builder / CTC designer */

export interface TemplateLine {
  id: string;
  component: string;
  code: string;
  formula: string;
  error?: string;
}

export const TEMPLATE_LINES: TemplateLine[] = [
  { id: 'l1', component: 'Basic', code: 'BASIC', formula: 'round(ctc * 0.40 / 12)' },
  { id: 'l2', component: 'House rent allowance', code: 'HRA', formula: 'round(basic * if(metro, 0.5, 0.4))' },
  { id: 'l3', component: 'Leave travel allowance', code: 'LTA', formula: '5000' },
  { id: 'l4', component: 'Employer PF', code: 'PF_ER', formula: 'pf_employer(pf_wage)' },
  { id: 'l5', component: 'Gratuity provision', code: 'GRAT', formula: 'round(basic * 15 / 26 / 12)' },
  { id: 'l6', component: 'Special allowance', code: 'SPL', formula: 'ctc / 12 - basic - hra - lta - pf_er - grat' },
];

const SUGGESTIONS = ['basic', 'ctc', 'payable_days', 'period_days', 'pf_wage', 'pf_employer(', 'pf_employee(', 'esi_employee(', 'metro', 'if(', 'min(', 'max(', 'round('];

const TEST_EMPLOYEES = {
  arjun: { name: 'Arjun Kulkarni', ctc: 14_00_000, metro: true, label: 'Arjun Kulkarni · ₹14,00,000 · metro' },
  sample: { name: 'Hosur sample employee', ctc: 3_60_000, metro: false, label: 'Sample · ₹3,60,000 · Hosur' },
} as const;
type TestId = keyof typeof TEST_EMPLOYEES;
const COMPONENT_ID: Record<string, string> = Object.fromEntries(COMPONENTS.map((c) => [c.code, c.id]));

/** PAY-13 · Template builder / CTC designer: ordered lines, formula editor with autocomplete, live test employee. */
export function TemplateBuilderScreen({ variant = 'default' }: { variant?: 'default' | 'autocomplete' | 'cycle' | 'add-back' | 'saved' }) {
  const [lines, setLines] = useState(() =>
    TEMPLATE_LINES.map((l) =>
      variant === 'cycle' && l.code === 'BASIC'
        ? { ...l, formula: 'round((ctc - spl) * 0.40 / 12)', error: 'Circular: Basic uses Special allowance, which uses Basic. Remove "spl" from this formula.' }
        : variant === 'add-back' && l.code === 'BASIC'
          ? { ...l, formula: 'round(ctc * 0.25 / 12)' }
          : variant === 'autocomplete' && l.code === 'HRA'
            ? { ...l, formula: 'round(basic * if(me' }
            : l,
    ),
  );
  const [selected, setSelected] = useState(variant === 'autocomplete' ? 'l2' : 'l1');
  const [testId, setTestId] = useState<TestId>('arjun');
  const [live, setLive] = useState(variant === 'saved' ? 4 : 3);
  const [base, setBase] = useState(TEMPLATE_LINES);
  const [dirty, setDirty] = useState(variant !== 'saved');
  const [justPublished, setJustPublished] = useState(variant === 'saved');
  const [confirm, setConfirm] = useState(false);
  const [compare, setCompare] = useState(false);
  const [active, setActive] = useState(0);
  const sel = lines.find((l) => l.id === selected)!;
  const emp = TEST_EMPLOYEES[testId];
  const errors = lines.filter((l) => l.error);
  const blocked = errors.length > 0;
  // ponytail: reads only Basic's "ctc * x" share from its formula; a full expression evaluator comes with the formula engine.
  const basicFormula = lines.find((l) => l.code === 'BASIC')?.formula ?? '';
  const basicPct = Number(/ctc\s*\*\s*(\d*\.?\d+)/.exec(basicFormula)?.[1] ?? 0.4);
  const b = templateBreakup(emp.ctc, { basicPct, metro: emp.metro });
  const warn = !blocked && b.addBack > 0;

  const edit = (fn: (ls: TemplateLine[]) => TemplateLine[]) => {
    setLines(fn);
    setDirty(true);
    setJustPublished(false);
  };
  const setFormula = (id: string, v: string) => {
    edit((ls) => ls.map((l) => (l.id === id ? { ...l, formula: v, error: undefined } : l)));
    setActive(0);
  };
  const move = (id: string, dir: -1 | 1) =>
    edit((ls) => {
      const i = ls.findIndex((l) => l.id === id);
      const j = i + dir;
      if (j < 0 || j >= ls.length) return ls;
      const next = [...ls];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  // Changes against the last published version.
  const changes = lines.flatMap((l, i) => {
    const prev = base.find((t) => t.id === l.id);
    if (!prev) return [`${l.component}: new in version ${live + 1}`];
    const out: string[] = [];
    if (prev.formula !== l.formula) out.push(`${l.component}: formula ${prev.formula} → ${l.formula}`);
    if (base[i]?.id !== l.id) out.push(`${l.component}: moved to position ${i + 1}`);
    return out;
  });
  const addLine = () => {
    const n = lines.filter((l) => !TEMPLATE_LINES.some((t) => t.id === l.id)).length + 1;
    const id = `new${n}`;
    edit((ls) => [...ls, { id, component: `New component ${n}`, code: `NEW_${n}`, formula: '0' }]);
    setSelected(id);
  };
  // Autocomplete: suggestions for the word being typed at the end of the formula.
  const token = /[a-z_]+$/i.exec(sel.formula)?.[0] ?? '';
  const matches = token ? SUGGESTIONS.filter((s) => s.startsWith(token) && s !== token) : [];
  const insert = (s: string) => setFormula(sel.id, sel.formula.slice(0, sel.formula.length - token.length) + s);
  const libraryId = COMPONENT_ID[sel.code];
  return (
    <PaySettingsFrame page="4.2">
      <PageHeader
        title="India standard CTC"
        description={`CTC-first template. Editing creates version ${live + 1}; payslips already made keep version ${live}.`}
        status={<Badge tone={dirty ? 'warning' : 'success'}>{dirty ? `Draft of version ${live + 1}` : `Version ${live} published`}</Badge>}
        actions={
          <>
            <Button aria-pressed={compare} onClick={() => setCompare((c) => !c)}>
              {compare ? 'Hide comparison' : `Compare with version ${live}`}
            </Button>
            {dirty && (
              <Button variant="primary" disabled={blocked} onClick={() => setConfirm(true)}>
                Validate and publish
              </Button>
            )}
          </>
        }
      />
      {blocked && <ErrorSummary title="Fix these before publishing" errors={errors.map((e) => ({ fieldId: 'formula', message: e.error! }))} />}
      {compare && (
        <InlineAlert tone="info" title={changes.length ? `${plural(changes.length, 'change')} from version ${live}` : `No changes from version ${live} yet`}>
          {changes.length ? (
            <ul>
              {changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : (
            `This draft has the same components, order and formulas as version ${live}.`
          )}
        </InlineAlert>
      )}
      {justPublished && (
        <InlineAlert tone="success" title={`Version ${live} published`}>
          Dependency order checked, no cycles. Test run on {emp.name} passed{b.addBack > 0 ? `; Code wage add-back ${formatINR(b.addBack)} a month applies` : ''}. Used from the October run.
        </InlineAlert>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Publish version ${live + 1}?`}
        consequence={`Used from the October run; payslips already made keep version ${live}.`}
        confirmLabel="Publish version"
        onConfirm={() => {
          setBase(lines);
          setLive((v) => v + 1);
          setDirty(false);
          setJustPublished(true);
          setCompare(false);
        }}
      />
      <div className="yx-pay-grid">
        <section data-span="4" className="yx-pay-panel" aria-label="Components in order">
          <SectionTitle actions={<Button size="sm" icon={Plus} onClick={addLine}>Add component</Button>}>Components, in calculation order</SectionTitle>
          <ol className="yx-pay-cards">
            {lines.map((l, i) => (
              <li key={l.id} data-selected={l.id === selected || undefined}>
                <div className="yx-pay-cards__row">
                  <Icon icon={GripVertical} />
                  <button type="button" className="yx-pay-why__row" onClick={() => setSelected(l.id)} aria-pressed={l.id === selected}>
                    <span>
                      {l.component} <span className="yx-pay-mono">{l.code}</span>{' '}
                      {l.error ? <Badge tone="danger">Error</Badge> : l.code === 'BASIC' && warn ? <Badge tone="warning">Check</Badge> : null}
                    </span>
                  </button>
                  <IconButton icon={ArrowUp} label={`Move ${l.component} up`} size="sm" disabled={i === 0} onClick={() => move(l.id, -1)} />
                  <IconButton icon={ArrowDown} label={`Move ${l.component} down`} size="sm" disabled={i === lines.length - 1} onClick={() => move(l.id, 1)} />
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section data-span="4" className="yx-pay-panel" aria-label="Formula">
          <SectionTitle>{sel.component}</SectionTitle>
          <FormField id="formula" label="Formula" error={sel.error} helper="Safe expression language: basic, ctc, payable_days, if(), min(), max(), round() and statutory functions. No code runs.">
            <TextArea
              className="yx-pay-formula"
              rows={3}
              value={sel.formula}
              onChange={(v) => setFormula(sel.id, v)}
              aria-autocomplete="list"
              aria-controls={matches.length ? 'formula-suggestions' : undefined}
              onKeyDown={(e) => {
                if (!matches.length) return;
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length);
                } else if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  insert(matches[active] ?? matches[0]);
                }
              }}
            />
          </FormField>
          {matches.length > 0 && (
            <ul id="formula-suggestions" className="yx-pay-suggest" role="listbox" aria-label="Suggestions">
              {matches.map((s, i) => (
                <li key={s} role="option" aria-selected={i === active} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(s)}>
                  {s}
                </li>
              ))}
            </ul>
          )}
          <FormSection title="Flags come from the component">
            <p className="yx-pay-muted">Taxable, PF wage, ESI wage, PT wage, gratuity wage, bonus wage and Code wage flags are set in the component library.</p>
            <div>
              <StoryButton size="sm" to={PAY14_LIST} args={libraryId ? `editId:${libraryId}` : undefined}>
                {libraryId ? `Open ${sel.component} in component library` : 'Open component library'}
              </StoryButton>
            </div>
          </FormSection>
        </section>
        <section data-span="4" className="yx-pay-panel" aria-label="Live test employee">
          <SectionTitle>Live test</SectionTitle>
          <FormField label="Test employee">
            <Select<TestId> value={testId} onChange={(v) => v && setTestId(v)} options={(Object.keys(TEST_EMPLOYEES) as TestId[]).map((k) => ({ value: k, label: TEST_EMPLOYEES[k].label }))} />
          </FormField>
          <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
            <table className="yx-pay-table">
              <tbody>
                {(
                  [
                    ['Basic', b.basic],
                    ['House rent allowance', b.hra],
                    ['Leave travel allowance', b.lta],
                    ['Employer PF', b.pf],
                    ['Gratuity provision', b.grat],
                    ['Special allowance', b.spl],
                  ] as const
                ).map(([l, v]) => (
                  <tr key={l}>
                    <th scope="row">{l}</th>
                    <td data-num>{blocked && l !== 'Leave travel allowance' ? '—' : formatINR(v)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Monthly CTC</th>
                  <td data-num>{formatINR(Math.round(emp.ctc / 12))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {blocked ? (
            <InlineAlert tone="danger">Can't calculate until the circular formula is fixed.</InlineAlert>
          ) : warn ? (
            <InlineAlert tone="warning" title="Code wage add-back">
              {emp.name}: pay outside Code wage is more than half of pay, so {formatINR(b.addBack)} a month is added back to PF and ESI wage.
            </InlineAlert>
          ) : (
            <Badge tone="success">No Code wage add-back</Badge>
          )}
        </section>
      </div>
    </PaySettingsFrame>
  );
}

/* ================================================================== PAY-14 Component library */

const yes = (b: boolean) => (b ? 'Yes' : '—');

const NEW_COMPONENT: ComponentRow = { id: 'new', name: '', code: '', type: 'Earning', taxable: true, pf: false, esi: false, pt: false, gratuity: false, bonus: false, codeWage: false, prorated: true, onPayslip: true, usedIn: 0 };

type FlagKey = 'taxable' | 'pf' | 'esi' | 'pt' | 'gratuity' | 'bonus' | 'codeWage' | 'prorated' | 'onPayslip';
/** Key, drawer label, drawer description, short table header, column width (fits the 1440 layout without cutting headers). */
const FLAGS: [FlagKey, string, string, string, number][] = [
  ['taxable', 'Taxable', 'Part of taxable salary', 'Taxable', 84],
  ['pf', 'Part of PF wage', 'Decides PF by flag, never by name', 'PF', 56],
  ['esi', 'Part of ESI wage', '', 'ESI', 66],
  ['pt', 'Part of PT wage', '', 'PT', 56],
  ['gratuity', 'Part of gratuity wage', '', 'Gratuity', 96],
  ['bonus', 'Part of bonus wage', '', 'Bonus', 76],
  ['codeWage', 'Part of Code wage definition', 'Basic, DA, retaining allowance. Other pay counts towards the 50% add-back.', 'Code wage', 80],
  ['prorated', 'Prorated by payable days', '', 'Prorated', 90],
  ['onPayslip', 'Shown on payslip', '', 'Payslip', 84],
];

/** PAY-14 · Component library (T2) with flag columns and an edit drawer; statutory components are locked. */
export function ComponentLibraryScreen({ state = 'ready', editId }: { state?: ViewState; editId?: string }) {
  const compact = useNarrow(1399);
  const [rows, setRows] = useState(COMPONENTS);
  const initial = COMPONENTS.find((c) => c.id === editId) ?? null;
  const [edit, setEdit] = useState<ComponentRow | null>(initial);
  const [draft, setDraft] = useState<ComponentRow | null>(initial);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const open = (r: ComponentRow | null) => {
    setEdit(r);
    setDraft(r);
  };
  const isNew = edit?.id === 'new';
  const flagsChanged = !!edit && !!draft && FLAGS.some(([k]) => edit[k] !== draft[k]);
  const nameChanged = !!edit && !!draft && edit.name !== draft.name.trim();
  const code = draft?.code.trim().toUpperCase() ?? '';
  const saveBlocked = !draft
    ? undefined
    : !draft.name.trim() || !code
      ? 'Enter a name and a code'
      : isNew && rows.some((r) => r.code === code)
        ? `Code ${code} is already used`
        : !isNew && !flagsChanged && !nameChanged
          ? 'No changes to save'
          : undefined;
  const save = () => {
    if (!draft) return;
    const row: ComponentRow = { ...draft, name: draft.name.trim(), code, id: isNew ? `c${rows.length + 1}` : draft.id };
    setRows((rs) => (isNew ? [...rs, row] : rs.map((r) => (r.id === row.id ? row : r))));
    setDone(
      isNew
        ? `${row.name} created. Add it to a template to use it.`
        : flagsChanged && row.usedIn > 0
          ? `${row.name} saved. New versions of ${plural(row.usedIn, 'template')} are used from the October run.`
          : `${row.name} saved.`,
    );
    open(null);
  };
  const flagsOf = (r: ComponentRow) => FLAGS.filter(([k]) => r[k]).map(([, , , short]) => short).join(' · ') || 'No flags';
  const nameCol: TableColumn<ComponentRow> = { key: 'name', header: 'Component', value: (r) => r.name, render: (r) => <span>{r.name} {r.statutory && <Badge>Statutory</Badge>}</span>, width: 180 };
  // Type is the group heading, so the column itself stays hidden (it would repeat on every row).
  const typeCol: TableColumn<ComponentRow> = { key: 'type', header: 'Type', value: (r) => r.type, groupable: true, width: 170 };
  // One column per flag only fits from about 1400 px; narrower screens list the flags that are set in one column.
  const cols: TableColumn<ComponentRow>[] = compact
    ? [
        nameCol,
        { key: 'code', header: 'Code', type: 'id', value: (r) => r.code, width: 110 },
        typeCol,
        { key: 'flags', header: 'Flags set', value: flagsOf },
        { key: 'used', header: 'Used in', value: (r) => r.usedIn, render: (r) => plural(r.usedIn, 'template'), width: 120 },
      ]
    : [
        nameCol,
        { key: 'code', header: 'Code', type: 'id', value: (r) => r.code, width: 90 },
        typeCol,
        ...FLAGS.map(([k, , , short, width]): TableColumn<ComponentRow> => ({ key: k, header: short, value: (r) => yes(r[k]), width })),
        { key: 'used', header: 'Templates', type: 'number', value: (r) => r.usedIn, width: 104 },
      ];
  const exportCols: TableColumn<ComponentRow>[] = [
    { key: 'name', header: 'Component', value: (r) => r.name },
    { key: 'code', header: 'Code', value: (r) => r.code },
    { key: 'type', header: 'Type', value: (r) => r.type },
    ...FLAGS.map(([k, label]): TableColumn<ComponentRow> => ({ key: k, header: label, value: (r) => (r[k] ? 'Yes' : 'No') })),
    { key: 'used', header: 'Used in templates', value: (r) => r.usedIn },
  ];
  return (
    <PaySettingsFrame page="4.2">
      <PageHeader title="Component library" description="Every earning, deduction, employer contribution, reimbursement and informational line. Flags decide the wage definitions." actions={<Button variant="primary" icon={Plus} onClick={() => open(NEW_COMPONENT)}>Add component</Button>} />
      {done && <InlineAlert tone="success" title={done} />}
      <DataTable
        label="Pay components"
        columns={cols}
        rows={rows}
        getRowId={(r) => r.id}
        state={state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'ready'}
        onRowClick={open}
        activeRowId={edit?.id}
        defaultGroupBy="type"
        defaultColumnState={{ hidden: ['type'] }}
        onExport={() => {
          const url = URL.createObjectURL(new Blob([tableToCsv(rows, exportCols)], { type: 'text/csv' }));
          const a = document.createElement('a');
          a.href = url;
          a.download = 'component-library.csv';
          a.click();
          URL.revokeObjectURL(url);
          setDone(`Component library exported (${plural(rows.length, 'component')}).`);
        }}
      />
      <Drawer
        open={!!edit}
        onOpenChange={(o) => !o && open(null)}
        title={isNew ? 'New component' : (edit?.name ?? '')}
        subtitle={isNew ? 'Not used in any template until you add it to one.' : edit ? `${edit.code} · ${edit.type} · used in ${plural(edit.usedIn, 'template')}` : undefined}
        size="lg"
        footer={
          <>
            <Button onClick={() => open(null)}>Cancel</Button>
            {saveBlocked && (
              <span className="yx-pay-note" role="status">
                {saveBlocked}
              </span>
            )}
            <Button variant="primary" disabled={!!saveBlocked} onClick={() => (flagsChanged && edit && edit.usedIn > 0 ? setConfirm(true) : save())}>
              Save component
            </Button>
          </>
        }
      >
        {edit && draft && (
          <div className="yx-pay-stack">
            {edit.statutory && (
              <InlineAlert tone="info" title="Statutory component">
                Rates and wage rules come from the central statutory rules. You can rename how it shows on the payslip only.
              </InlineAlert>
            )}
            <FieldRow>
              <FormField label="Name" required>
                <TextField value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
              </FormField>
              <FormField label="Code" required helper={isNew ? undefined : "Codes can't change once used."}>
                <TextField value={draft.code} onChange={(v) => setDraft({ ...draft, code: v.toUpperCase() })} disabled={!isNew} />
              </FormField>
            </FieldRow>
            <FormSection title="Flags">
              {FLAGS.map(([k, label, desc]) => (
                <Checkbox key={k} label={label} description={desc || undefined} checked={draft[k]} onChange={(v) => setDraft({ ...draft, [k]: v })} disabled={edit.statutory} />
              ))}
            </FormSection>
            {edit.usedIn > 0 && !edit.statutory && <p className="yx-pay-note">Changing a flag creates new versions of {plural(edit.usedIn, 'template')} from the next run. Past payslips don't change.</p>}
          </div>
        )}
      </Drawer>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Create new versions of ${plural(edit?.usedIn ?? 0, 'template')} from the October run?`}
        consequence={`${edit?.name ?? 'This component'} gets the new flags in every template that uses it. Past payslips don't change.`}
        confirmLabel="Save component"
        onConfirm={save}
      />
    </PaySettingsFrame>
  );
}

/* ================================================================== PAY-15 Payslip layout editor */

type Language = 'Kannada' | 'Tamil' | 'Hindi';
interface Layout {
  days: boolean;
  ytd: boolean;
  employer: boolean;
  tax: boolean;
  leave: boolean;
  reimb: boolean;
  lang: Language | null;
  password: boolean;
}
/** Version 4, the layout in use: no tax summary, no leave balances, English only, no PDF password. */
const VERSION_4: Layout = { days: true, ytd: true, employer: true, tax: false, leave: false, reimb: true, lang: null, password: false };

const LAYOUT_SAMPLE: PayslipData = {
  ...MY_PAYSLIP,
  company: { ...LETTERHEAD },
  leave: [
    { label: 'Casual leave', balance: 6 },
    { label: 'Sick leave', balance: 5 },
    { label: 'Earned leave', balance: 12 },
  ],
};

/** Second sample: the lowest-paid person in the Karnataka September run, lines as the run works them out (basic 45%, HRA 18%). */
const LOW_ROW = [...RUN_ROWS].filter((r) => r.lop === 0 && r.oneTime === 0).sort((a, b) => a.gross - b.gross)[0];
const LOW_EMP = EMPLOYEES.find((e) => e.id === LOW_ROW.id)!;
const LOW_ESI = esiContribution(LOW_ROW.gross);
const LOW_BASIC = Math.round(LOW_ROW.gross * 0.45);
const LOW_HRA = Math.round(LOW_ROW.gross * 0.18);
const LOW_PF = pfContribution(LOW_BASIC, { restrictToCeiling: true });
/** Year to date covers Apr–Sep: six equal months for this sample. */
const LOW_SAMPLE: PayslipData = {
  company: { ...LETTERHEAD },
  period: MY_PAYSLIP.period,
  payDate: MY_PAYSLIP.payDate,
  employee: {
    name: LOW_EMP.name,
    code: LOW_EMP.code,
    designation: LOW_EMP.role,
    department: LOW_EMP.department,
    location: LOW_EMP.location,
    joinedOn: LOW_EMP.joined,
    pan: 'BQTPK5521M',
    uan: '100877412305',
    bankName: 'Deccan Gramin Bank',
    accountNumber: '004771000021194',
    esiNumber: LOW_ESI.covered ? '5300112233' : undefined,
  },
  paidDays: 30,
  lopDays: 0,
  earnings: [
    { label: 'Basic', amount: LOW_BASIC, ytd: (LOW_BASIC) * 6 },
    { label: 'House rent allowance', amount: LOW_HRA, ytd: (LOW_HRA) * 6 },
    { label: 'Special allowance', amount: LOW_ROW.gross - LOW_BASIC - LOW_HRA, ytd: (LOW_ROW.gross - LOW_BASIC - LOW_HRA) * 6 },
  ],
  deductions: [
    { label: 'Provident fund (employee)', amount: LOW_PF.employee, ytd: (LOW_PF.employee) * 6 },
    ...(LOW_ESI.covered ? [{ label: 'ESI (employee)', amount: LOW_ESI.employee, ytd: (LOW_ESI.employee) * 6 }] : []),
    ...(LOW_ROW.gross >= 25_000 ? [{ label: 'Professional tax (Karnataka)', amount: 200, ytd: (200) * 6 }] : []),
    ...(LOW_ROW.deductions - LOW_PF.employee - LOW_ESI.employee - (LOW_ROW.gross >= 25_000 ? 200 : 0) > 0
      ? [{ label: 'Income tax (TDS) and recoveries', amount: LOW_ROW.deductions - LOW_PF.employee - LOW_ESI.employee - (LOW_ROW.gross >= 25_000 ? 200 : 0), ytd: (LOW_ROW.deductions - LOW_PF.employee - LOW_ESI.employee - (LOW_ROW.gross >= 25_000 ? 200 : 0)) * 6 }]
      : []),
  ],
  employer: [{ label: 'Provident fund (company)', amount: LOW_PF.eps + LOW_PF.epf }, ...(LOW_ESI.covered ? [{ label: 'ESI (company)', amount: LOW_ESI.employer }] : [])],
  leave: LAYOUT_SAMPLE.leave,
};

/** Scales the A4 preview down to the panel's width, so it never scrolls sideways. */
function FitPreview({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const cs = getComputedStyle(el);
      const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      setScale(Math.min(1, room / A4_PX));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="yx-pay-preview" tabIndex={0} role="region" aria-label="Payslip preview">
      <div style={{ zoom: scale }}>{children}</div>
    </div>
  );
}
/** 210 mm at 96 dpi. */
const A4_PX = 794;

/** PAY-15 · Payslip layout editor per entity with sample-employee preview; statutory wage-slip fields locked. */
export function PayslipLayoutScreen({ variant = 'default' }: { variant?: 'default' | 'bilingual' | 'published' }) {
  // The draft adds the tax summary (and Kannada in the bilingual story).
  const start: Layout = { ...VERSION_4, tax: true, lang: variant === 'bilingual' ? 'Kannada' : null };
  const [live, setLive] = useState(variant === 'published' ? 5 : 4);
  const [base, setBase] = useState<Layout>(variant === 'published' ? start : VERSION_4);
  const [s, setS] = useState<Layout>(start);
  const [status, setStatus] = useState<'draft' | 'published' | 'discarded'>(variant === 'published' ? 'published' : 'draft');
  const [ask, setAsk] = useState<'publish' | 'discard' | null>(null);
  // Any change starts a draft of the next version.
  const set =
    <K extends keyof Layout>(k: K) =>
    (v: Layout[K]) => {
      setS((x) => ({ ...x, [k]: v }));
      setStatus('draft');
    };
  return (
    <PaySettingsFrame page="4.4">
      <PageHeader
        title="Payslip layout"
        description="Kaveri Foods Pvt Ltd · applies to all pay groups of this entity. Published payslips keep the layout version they were made with."
        status={
          <Badge tone={status === 'published' ? 'success' : status === 'draft' ? 'warning' : 'neutral'}>
            {status === 'published' ? `Version ${live} published` : status === 'draft' ? `Draft of version ${live + 1}` : `Version ${live} in use`}
          </Badge>
        }
        actions={
          status === 'draft' ? (
            <>
              <Button onClick={() => setAsk('discard')}>Discard draft</Button>
              <Button variant="primary" onClick={() => setAsk('publish')}>
                Publish layout
              </Button>
            </>
          ) : (
            <span className="yx-pay-note">No draft. Change a setting to start version {live + 1}.</span>
          )
        }
      />
      {status === 'published' && (
        <InlineAlert tone="success" title={`Version ${live} published`}>
          Payslips from the October run use this layout. Payslips already published keep version {live - 1}.
        </InlineAlert>
      )}
      {status === 'discarded' && (
        <InlineAlert tone="info" title="Draft discarded" actions={<Button size="sm" onClick={() => setStatus('draft')}>Start a new draft</Button>}>
          The settings below are back to version {live}, the layout in use.
        </InlineAlert>
      )}
      <ConfirmDialog
        open={ask === 'publish'}
        onOpenChange={(o) => !o && setAsk(null)}
        title={`Publish layout version ${live + 1}?`}
        consequence={`Payslips from the October 2026 run for all pay groups of Kaveri Foods Pvt Ltd use it; published payslips keep version ${live}.`}
        confirmLabel="Publish layout"
        onConfirm={() => {
          setBase(s);
          setLive((v) => v + 1);
          setStatus('published');
        }}
      />
      <ConfirmDialog
        open={ask === 'discard'}
        onOpenChange={(o) => !o && setAsk(null)}
        destructive
        title={`Discard the draft of version ${live + 1}?`}
        consequence={`Your changes are lost and the settings go back to version ${live}.`}
        confirmLabel="Discard draft"
        onConfirm={() => {
          setS(base);
          setStatus('discarded');
        }}
      />
      <div className="yx-pay-grid">
        <section data-span="4" className="yx-pay-panel" aria-label="Layout settings">
          <FormSection title="Sections">
            <Checkbox label="Days strip (paid, unpaid, holidays)" checked={s.days} onChange={set('days')} />
            <Checkbox label="Year-to-date column" checked={s.ytd} onChange={set('ytd')} />
            <Checkbox label="Employer contributions box" checked={s.employer} onChange={set('employer')} description="PF, gratuity, and ESI when the employee is covered" />
            <Checkbox label="Tax summary (regime, projected tax)" checked={s.tax} onChange={set('tax')} />
            <Checkbox label="Leave balances" checked={s.leave} onChange={set('leave')} />
          </FormSection>
          <FormSection title="Always shown (required on wage slips)">
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--yx-space-2)' }}>
              {['Employee name, ID and designation', 'Pay period and pay date', 'Earnings and deductions', 'Net pay in figures and words', 'UAN and ESI number'].map((f) => (
                <li key={f} className="yx-pay-row">
                  <Icon icon={Lock} label="Locked" /> {f}
                </li>
              ))}
            </ul>
          </FormSection>
          <FormSection title="Language and branding">
            <FormField label="Second language" helper="Applies to every payslip of this entity, whatever the work location.">
              <Select<Language> value={s.lang} onChange={set('lang')} clearable options={[{ value: 'Kannada', label: 'Kannada' }, { value: 'Tamil', label: 'Tamil' }, { value: 'Hindi', label: 'Hindi' }]} placeholder="None" />
            </FormField>
            <FormField label="Logo" optional>
              <FileUpload upload={async () => {}} accept={['.png', '.svg']} multiple={false} />
            </FormField>
            <Switch label="Password-protect the PDF" description="Password: PAN in capitals + date of birth (DDMM)." checked={s.password} onChange={set('password')} />
          </FormSection>
          <FormSection title="Component order">
            <p className="yx-pay-muted">Order follows the salary template. Group reimbursements separately:</p>
            <Checkbox label="Separate reimbursements block" checked={s.reimb} onChange={set('reimb')} />
          </FormSection>
        </section>
        <section data-span="8" className="yx-pay-panel" aria-label="Preview">
          <SectionTitle actions={<Select size="sm" aria-label="Sample employee" value="divya" onChange={() => {}} options={[{ value: 'divya', label: 'Sample: Divya Raghunathan' }, { value: 'plant', label: 'Sample: plant worker with ESI' }]} />}>Preview</SectionTitle>
          {s.lang && <InlineAlert tone="info">Labels are shown in English and {s.lang}. Numbers stay in Indian digits.</InlineAlert>}
          <div className="yx-pay-preview" tabIndex={0} role="region" aria-label="Payslip preview">
            <PayslipDocument
              data={LAYOUT_SAMPLE}
              options={{ showYtd: s.ytd, daysStrip: s.days, employerBox: s.employer, taxSummary: s.tax, leaveBalances: s.leave, reimbursementsBlock: s.reimb, secondLanguage: s.lang ?? undefined }}
            />
          </div>
          {!s.days && <p className="yx-pay-note">Days strip hidden. Paid days and unpaid days still show in the details block (required).</p>}
        </section>
      </div>
    </PaySettingsFrame>
  );
}

/* ================================================================== PAY-16 Payroll set-up wizard */

const LEDGERS = [
  { value: '4100', label: '4100 · Salaries and wages' },
  { value: '4110', label: '4110 · Employer PF' },
  { value: '4120', label: '4120 · Employer ESI' },
  { value: '2100', label: '2100 · Net salary payable' },
  { value: '2110', label: '2110 · TDS payable' },
  { value: '2120', label: '2120 · PF payable' },
  { value: '2130', label: '2130 · ESI payable' },
  { value: '2140', label: '2140 · Professional tax payable' },
];
const MAPPING: [string, string][] = [
  ['Salaries and wages', '4100'],
  ['Employer PF', '4110'],
  ['Net salary payable', '2100'],
  ['TDS payable (salary)', '2110'],
  ['PF payable', '2120'],
];
const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;

/** PAY-16 · Payroll set-up wizard (per entity): registrations, pay group, template, bank, accounting, opening balances. */
export function PayrollSetupScreen({ step = 'reg', incomplete = true, imported: importedInitially = false }: { step?: string; incomplete?: boolean; /** Opening balances already uploaded. */ imported?: boolean }) {
  const phone = useNarrow(599);
  const [lwf, setLwf] = useState(incomplete ? '' : 'LWF/KA/BNG/20417');
  const [tdsPan, setTdsPan] = useState(incomplete ? '' : 'AKMPN7135L');
  const [fixing, setFixing] = useState<'lwf' | 'pan' | null>(null);
  const [fixValue, setFixValue] = useState('');
  const [freq, setFreq] = useState<string | null>('m');
  const [cutoff, setCutoff] = useState<number | null>(25);
  const [payDay, setPayDay] = useState<string | null>('last');
  const [ledgers, setLedgers] = useState(MAPPING.map(([, l]) => l));
  const [changeAcct, setChangeAcct] = useState(false);
  const [imported, setImported] = useState(importedInitially);
  const [confirm, setConfirm] = useState(false);
  const [phase, setPhase] = useState<'editing' | 'saved' | 'live'>('editing');

  const regs = [
    { s: 'PF', n: 'KN/BNG/0058812/000', f: 'Portal-ready files' },
    { s: 'ESI', n: '53000123450001001', f: 'Portal-ready files' },
    { s: 'PT Karnataka', n: 'PTEC 0412 3398', f: 'Compliance partner' },
    { s: 'LWF Karnataka', n: lwf, f: 'Portal-ready files', missing: lwf ? undefined : 'Registration number missing', fix: 'lwf' as const },
    { s: 'TDS (TAN)', n: 'BLRK04512E', f: 'Self-file (FVU)', missing: tdsPan ? undefined : 'Responsible person PAN missing', fix: 'pan' as const },
  ];
  const missing = [!lwf && 'LWF Karnataka registration number', !tdsPan && 'TDS responsible person PAN'].filter((x): x is string => !!x);
  const firstMissing = regs.find((r) => r.missing);
  const finishBlocked =
    [missing.length ? `${plural(missing.length, 'statute')} incomplete: ${missing.join(', ')}` : '', imported ? '' : 'Opening balances not imported'].filter(Boolean).join('. ') || undefined;
  const freqLabel = freq === 'f' ? 'Fortnightly' : freq === 'w' ? 'Weekly' : 'Monthly';
  const payDayLabel = payDay === '1' ? '1st of next month' : 'last working day';
  const fixLabel = fixing === 'lwf' ? 'LWF Karnataka registration number' : 'TDS responsible person PAN';
  const fixBlocked = !fixValue.trim() ? `Enter the ${fixing === 'lwf' ? 'registration number' : 'PAN'}` : fixing === 'pan' && !PAN_RE.test(fixValue.trim()) ? 'Enter a 10-character PAN, like ABCDE1234F' : undefined;

  const checkCell = (r: (typeof regs)[number]) =>
    r.missing ? (
      <span className="yx-pay-row">
        <Icon icon={AlertCircle} /> {r.missing}
        <Button
          size="sm"
          onClick={() => {
            setFixing(r.fix!);
            setFixValue('');
          }}
        >
          Fix
        </Button>
      </span>
    ) : (
      <Badge tone="success">Complete</Badge>
    );
  const reg = (
    <div className="yx-pay-stack">
      <p className="yx-pay-muted">Each statute runs a completeness check before payroll can use it.</p>
      {missing.length === 0 && <InlineAlert tone="success">All {regs.length} statutes pass the completeness check.</InlineAlert>}
      {phone ? (
        <ol className="yx-pay-cards" aria-label="Statutes">
          {regs.map((r) => (
            <li key={r.s}>
              <strong>{r.s}</strong>
              <span className="yx-pay-mono">{r.n || '—'}</span>
              <span className="yx-pay-note">{r.f}</span>
              {r.missing && checkCell(r)}
            </li>
          ))}
        </ol>
      ) : (
        <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Statutes, scrolls sideways on small screens">
          <table className="yx-pay-table">
            <thead>
              <tr>
                <th scope="col">Statute</th>
                <th scope="col">Registration</th>
                <th scope="col">Filing</th>
                {missing.length > 0 && <th scope="col">Check</th>}
              </tr>
            </thead>
            <tbody>
              {regs.map((r) => (
                <tr key={r.s} data-state={r.missing ? 'error' : undefined}>
                  <th scope="row">{r.s}</th>
                  <td className="yx-pay-mono">{r.n || '—'}</td>
                  <td>{r.f}</td>
                  {missing.length > 0 && <td>{checkCell(r)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
  const group = (
    <div className="yx-pay-stack">
      <FieldRow>
        <FormField label="Pay group name" required>
          <TextField defaultValue="Monthly · Kaveri Foods Pvt Ltd" />
        </FormField>
        <FormField label="Frequency" required>
          <Select value={freq} onChange={setFreq} options={[{ value: 'm', label: 'Monthly' }, { value: 'f', label: 'Fortnightly' }, { value: 'w', label: 'Weekly' }]} />
        </FormField>
      </FieldRow>
      <FieldRow>
        <FormField label="Attendance cut-off day" required helper="Inputs freeze at 11:59 pm on this day.">
          <NumberField value={cutoff} onChange={setCutoff} min={1} max={31} />
        </FormField>
        <FormField label="Pay day" required>
          <Select value={payDay} onChange={setPayDay} options={[{ value: 'last', label: 'Last working day' }, { value: '1', label: '1st of next month' }]} />
        </FormField>
      </FieldRow>
      <FormField label="Day basis for proration" required>
        <RadioGroup orientation="horizontal" defaultValue="cal" options={[{ value: 'cal', label: 'Calendar days' }, { value: '30', label: '30 days' }, { value: '26', label: '26 days' }]} />
      </FormField>
    </div>
  );
  const template = (
    <RadioGroup
      aria-label="Salary template"
      defaultValue="std"
      options={[
        { value: 'std', label: 'India standard CTC (starter)', description: 'Basic 40%, HRA, special allowance; employer PF and gratuity inside CTC.' },
        { value: 'plant', label: 'Plant workers (starter)', description: 'Basic + DA at minimum wage, ESI, overtime at twice the rate.' },
        { value: 'copy', label: 'Copy from Kaveri Foods (Tamil Nadu)' },
      ]}
    />
  );
  const bank = (
    <FieldRow>
      <FormField label="Bank file format" required>
        <Select value="ccob" onChange={() => {}} options={[{ value: 'ccob', label: 'Cauvery Co-operative Bank · bulk salary (text)' }, { value: 'dgb', label: 'Deccan Gramin Bank · NEFT bulk (CSV)' }]} />
      </FormField>
      <FormField label={changeAcct ? 'New debit account number' : 'Debit account'} required>
        {changeAcct ? (
          <TextField inputMode="numeric" autoComplete="off" />
        ) : (
          <div className="yx-pay-row">
            <TextField readOnly value="Current account ending 4410" />
            <Button onClick={() => setChangeAcct(true)}>Change</Button>
          </div>
        )}
      </FormField>
    </FieldRow>
  );
  const acct = (
    <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Ledger mapping, scrolls sideways on small screens">
      <table className="yx-pay-table">
        <thead>
          <tr>
            <th scope="col">Payroll item</th>
            <th scope="col">Ledger</th>
          </tr>
        </thead>
        <tbody>
          {MAPPING.map(([l], i) => (
            <tr key={l}>
              <th scope="row">{l}</th>
              <td>
                <Select size="sm" aria-label={`Ledger for ${l}`} value={ledgers[i]} onChange={(v) => v && setLedgers((ls) => ls.map((x, j) => (j === i ? v : x)))} options={LEDGERS} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const opening = (
    <div className="yx-pay-stack">
      <p className="yx-pay-muted">Import month-wise as-paid lines per component for April–September 2026 for employees paid before go-live. They become the base for YTD tax and for arrears across go-live.</p>
      <FileUpload
        upload={async () => {}}
        accept={['.xlsx', '.csv']}
        multiple={false}
        defaultItems={importedInitially ? [{ id: 'ob', file: new File(['x'.repeat(48_640)], 'opening-balances-apr-sep-2026.xlsx'), status: 'done', progress: 100 }] : undefined}
        onItemsChange={(items) => setImported(items.some((i) => i.status === 'done'))}
      />
      {imported && (
        <InlineAlert tone="warning" title="August lines missing for 3 employees">
          Arrears that reach back to August will ask you to confirm their as-paid base.
        </InlineAlert>
      )}
    </div>
  );
  return (
    <PayFrame page="home">
      <PageHeader title="Set up payroll" description="Kaveri Foods Pvt Ltd (Karnataka). You can save and come back." />
      {phase === 'live' ? (
        <InlineAlert tone="success" title="Payroll is on for Kaveri Foods Pvt Ltd (Karnataka)" actions={<StoryButton size="sm" to={PAY_HOME}>Open runs</StoryButton>}>
          The October 2026 run is open: cut-off {cutoff ?? 25} Oct, pay day on the {payDayLabel}.
        </InlineAlert>
      ) : phase === 'saved' ? (
        <InlineAlert
          tone="success"
          title="Set-up saved"
          actions={
            <>
              <StoryButton size="sm" to={PAY_HOME}>
                Open payroll home
              </StoryButton>
              <Button size="sm" onClick={() => setPhase('editing')}>
                Continue set-up
              </Button>
            </>
          }
        >
          Pick it up from Payroll home whenever you are ready.
        </InlineAlert>
      ) : (
        <Stepper
          title="Payroll set-up"
          defaultCurrent={step}
          onSaveAndExit={() => setPhase('saved')}
          review={{ description: 'Check each section, then switch payroll on' }}
          finishLabel="Switch payroll on"
          finishBlocked={finishBlocked}
          onFinish={() => setConfirm(true)}
          steps={[
            { id: 'reg', title: 'Registrations', description: 'Statutes and deductor details', status: missing.length ? 'error' : undefined, statusNote: missing.length ? `${plural(missing.length, 'statute')} incomplete` : undefined, statusAction: firstMissing ? <Button size="sm" onClick={() => { setFixing(firstMissing.fix!); setFixValue(''); }}>Fix {firstMissing.fix === 'lwf' ? 'LWF registration' : 'TDS PAN'}</Button> : undefined, content: reg, summary: <p>PF, ESI, PT, LWF, TDS</p> },
            { id: 'group', title: 'Pay group and cut-off', description: 'Frequency, cut-off, pay day', content: group, summary: <p>{freqLabel} · cut-off day {cutoff ?? '—'} · {payDayLabel}</p> },
            { id: 'template', title: 'Salary template', description: 'Starter or copy', content: template, summary: <p>India standard CTC</p> },
            { id: 'bank', title: 'Bank format', content: bank, summary: <p>Cauvery Co-operative Bank bulk salary</p> },
            { id: 'acct', title: 'Accounting mapping', content: acct, summary: <p>{MAPPING.length} ledgers mapped</p> },
            { id: 'opening', title: 'Opening balances', description: 'YTD and as-paid lines', status: imported ? undefined : 'error', statusNote: imported ? undefined : 'Not imported yet', content: opening, summary: <p>{imported ? 'Imported April–September · August missing for 3 employees' : 'Not imported yet'}</p> },
          ]}
        />
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Switch payroll on for Kaveri Foods Pvt Ltd (Karnataka)?"
        consequence={`The October 2026 run opens with cut-off ${cutoff ?? 25} Oct and pay day on the ${payDayLabel}. PF, ESI, PT, LWF and TDS files are made from this run.`}
        confirmLabel="Switch payroll on"
        onConfirm={() => setPhase('live')}
      />
      <Drawer
        open={!!fixing}
        onOpenChange={(o) => !o && setFixing(null)}
        title={fixLabel}
        subtitle="Needed before payroll can file this statute."
        footer={
          <>
            <Button onClick={() => setFixing(null)}>Cancel</Button>
            {fixBlocked && (
              <span className="yx-pay-note" role="status">
                {fixBlocked}
              </span>
            )}
            <Button
              variant="primary"
              disabled={!!fixBlocked}
              onClick={() => {
                if (fixing === 'lwf') setLwf(fixValue.trim());
                else setTdsPan(fixValue.trim().toUpperCase());
                setFixing(null);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <FormField label={fixLabel} required helper={fixing === 'pan' ? 'PAN of the person who signs TDS returns for this TAN.' : 'As printed on the Karnataka LWF registration certificate.'}>
          <TextField value={fixValue} onChange={(v) => setFixValue(fixing === 'pan' ? v.toUpperCase() : v)} />
        </FormField>
      </Drawer>
    </PayFrame>
  );
}
