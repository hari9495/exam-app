// Finance-side expense screens (M05): EXP-06 to-pay queue, EXP-07 policy matrix, EXP-08 card statement import & matching,
// EXP-09 expense reports.
import { useMemo, useState } from 'react';
import { ArrowLeft, Download, Link2, Upload } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button, IconButton } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert, NoAccessState } from '../../components/feedback';
import { FormField, StickySaveBar } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { PlainTable } from '../../components/plain-table';
import { RadioGroup, Switch } from '../../components/choice';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { FileUpload } from '../../components/upload';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, SavedViewMenu, type FilterFieldDef } from '../../components/filters';
import { Card, DescriptionList, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { ConfirmDialog } from '../../components/overlay';
import { PageBanner } from '../../components/notify';
import { BarChart, DonutChart } from '../../components/charts';
import { Stepper } from '../../components/stepper';
import { formatDate, formatINR, groupIndian } from '../../lib/format';
import { dayKey } from '../../lib/dates';
import type { FilterValue } from '../../lib/table';
import { Actions, CardGrid, Facts, OpsDesk } from './ops-kit';
import { ClaimBadges, claimTotals } from './expenses';
import type { ListState } from './helpdesk';
import type { Claim } from './expenses-data';
import { LivePolicyScreen, type ExpenseSetupScreenProps, type PolicySheet, type PolicyTab } from './expenses-setup-live';
import { CARD_PAGE, CardLinesToExplain, ChangeMatchDialog, ImportRefused, LinkCardDialog, LiveCardImportScreen, LiveCardLinesScreen, MappingForm, RowsToFix, type LiveCardImport, type LiveCardLines } from './expenses-cards-live';
import type { CardMapping, MyCardLine } from '../expenses/live/types';
import { LiveReportsScreen, LiveToPayScreen, type LiveReports, type LiveToPay, type ToPaySheet, type ToPayTab } from './expenses-finance-live';

/* =========================================================================================
 * EXP-06 · Finance "to pay" queue (T2, Fin)
 * ======================================================================================= */

const TOPAY_FILTERS: FilterFieldDef[] = [
  { key: 'payment', label: 'Payment status', type: 'multi', options: ['Approved, unpaid', 'In October payroll', 'Payment failed', 'Paid'].map((v) => ({ value: v, label: v })) },
  { key: 'route', label: 'Route', type: 'multi', options: ['Next payroll', 'Direct payout'].map((v) => ({ value: v, label: v })) },
];
export interface ToPayScreenProps {
  claims: Claim[];
  state?: ListState;
  view?: string;
  defaultSelected?: string[];
  confirm?: 'payroll' | 'payout' | null;
}
/** EXP-06 To-pay queue. The live app passes `live` (claims, bank files released by a second person, the journal). */
export function ToPayScreen(props: ToPayScreenProps | { live: LiveToPay; defaultTab?: ToPayTab; defaultSheet?: ToPaySheet }) {
  return 'live' in props ? <LiveToPayScreen live={props.live} defaultTab={props.defaultTab} defaultSheet={props.defaultSheet} /> : <SampleToPay {...props} />;
}
function SampleToPay({ claims, state = 'ready', view = 'unpaid', defaultSelected = [], confirm = null }: ToPayScreenProps) {
  const [viewId, setViewId] = useState(view);
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const [selected, setSelected] = useState<string[]>(defaultSelected);
  const [dialog, setDialog] = useState(confirm);
  const rows = useMemo(() => {
    let r = claims;
    if (viewId === 'unpaid') r = r.filter((c) => c.payment !== 'Paid');
    if (viewId === 'failed') r = r.filter((c) => c.payment === 'Payment failed');
    for (const f of filters) if (f.type === 'multi' && f.values.length) r = r.filter((c) => f.values.includes(String((c as unknown as Record<string, unknown>)[f.key] ?? 'Next payroll')));
    return r;
  }, [claims, viewId, filters]);
  const sel = claims.filter((c) => selected.includes(c.id));
  const selTotal = sel.reduce((s, c) => s + claimTotals(c).netPayable, 0);
  const cols: TableColumn<Claim>[] = [
    { key: 'id', header: 'Claim', type: 'id', value: (c) => c.id },
    { key: 'emp', header: 'Employee', type: 'person', value: (c) => c.employee, person: (c) => ({ name: c.employee, secondary: c.title }), width: 240 },
    { key: 'net', header: 'Net payable', type: 'money', value: (c) => claimTotals(c).netPayable, total: 'sum' },
    { key: 'appr', header: 'Approved', type: 'money', value: (c) => claimTotals(c).approved },
    { key: 'adv', header: 'Advance adjusted', type: 'money', value: (c) => c.advanceAdjusted },
    { key: 'route', header: 'Route', value: (c) => c.route ?? 'Next payroll' },
    { key: 'status', header: 'Status', value: (c) => c.payment, render: (c) => <ClaimBadges c={c} />, width: 260 },
    { key: 'utr', header: 'Payment reference', type: 'id', value: (c) => c.utr ?? '—' },
  ];
  const failed = claims.filter((c) => c.payment === 'Payment failed').length;
  return (
    <OpsDesk area="expenses" active="To pay" counts={{ 'To pay': claims.filter((c) => c.payment !== 'Paid').length }}>
      <PageHeader title="To pay" description="Approved claims. Net payable is approved minus advance adjusted. A claim is marked paid only when the payroll run is paid or the payout is confirmed." facts="October payroll cut-off 23 Oct 2026" />
      {failed > 0 && (
        <PageBanner tone="danger" action={<Button size="sm" onClick={() => setViewId('failed')}>Show failed</Button>}>
          {failed} payment failed. Re-route it to the next payroll or a direct payout.
        </PageBanner>
      )}
      <DataTable
        label="Claims to pay"
        columns={cols}
        rows={state === 'empty' ? [] : rows}
        getRowId={(c) => c.id}
        state={state === 'empty' ? 'ready' : state}
        onRetry={() => {}}
        errorTitle="We couldn't load claims to pay."
        empty={<EmptyState title="Nothing to pay." description="Approved claims appear here." />}
        filtered={filters.length > 0}
        onClearFilters={() => setFilters([])}
        selectable
        selectedIds={selected}
        onSelectedChange={setSelected}
        bulkActions={(ids) => (
          <>
            <Button size="sm" onClick={() => setDialog('payroll')}>
              Add {ids.length} to October payroll
            </Button>
            <Button size="sm" onClick={() => setDialog('payout')}>
              Pay now by bank file
            </Button>
          </>
        )}
        rowButtons={(c) => (c.payment === 'Payment failed' ? <Button size="sm">Re-route</Button> : null)}
        toolbar={<FilterBar fields={TOPAY_FILTERS} value={filters} onChange={setFilters} searchPlaceholder="Search claim or employee" />}
        views={
          <SavedViewMenu
            views={[
              { id: 'unpaid', name: 'Unpaid' },
              { id: 'failed', name: 'Payment failed', shared: true },
              { id: 'all', name: 'All approved' },
            ]}
            currentId={viewId}
            onSelect={setViewId}
          />
        }
        onExport={() => {}}
      />
      <ConfirmDialog
        open={!!dialog}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog === 'payroll' ? `Add ${sel.length} claims to the October payroll?` : `Pay ${sel.length} claims now by bank file?`}
        consequence={dialog === 'payroll' ? `${formatINR(selTotal)} is added as reimbursement lines. They are marked paid when the October run is paid.` : `A bank file for ${formatINR(selTotal)} is created for release. Claims are marked paid when the bank confirms.`}
        confirmLabel={dialog === 'payroll' ? 'Add to payroll' : 'Create bank file'}
        onConfirm={() => setDialog(null)}
      />
    </OpsDesk>
  );
}

/* =========================================================================================
 * EXP-07 · Expense policy matrix (category × grade × tier) (T6, Fin, HR)
 * ======================================================================================= */

export interface PolicyMatrix {
  categories: string[];
  grades: string[];
  tiers: string[];
  limits: number[][][];
}
/** EXP-07 Expense policy matrix and set-up. The live app passes `live` (founder answer 6: the grade grid for policies
 *  that apply to one grade, the rest listed below; categories, tiers, rates, GST registrations, exchange rates). */
export function PolicyMatrixScreen(props: { matrix: PolicyMatrix; dirty?: boolean; persona?: 'fin' | 'hr' } | { live: ExpenseSetupScreenProps; defaultTab?: PolicyTab; defaultSheet?: PolicySheet }) {
  return 'live' in props ? <LivePolicyScreen live={props.live} defaultTab={props.defaultTab} defaultSheet={props.defaultSheet} /> : <SamplePolicyMatrix {...props} />;
}
function SamplePolicyMatrix({ matrix, dirty: startDirty, persona = 'fin' }: { matrix: PolicyMatrix; dirty?: boolean; persona?: 'fin' | 'hr' }) {
  const [limits, setLimits] = useState(() => matrix.limits.map((g) => g.map((t) => [...t])));
  const [dirty, setDirty] = useState(!!startDirty);
  const [grade, setGrade] = useState<string | null>(matrix.grades[1]);
  const [effective, setEffective] = useState<Date | null>(new Date(2026, 9, 1));
  const gi = matrix.grades.indexOf(grade ?? matrix.grades[0]);
  const set = (ci: number, ti: number, v: string) => {
    const n = Number(v.replace(/[^0-9]/g, ''));
    setLimits((l) => l.map((g, a) => g.map((t, b) => t.map((x, c) => (a === ci && b === gi && c === ti ? n : x)))));
    setDirty(true);
  };
  return (
    <OpsDesk area="expenses" active="Expense policy">
      <PageHeader title="Expense policy" description="Limits by category, grade and city tier. Settings › Payroll & Statutory › Expenses & travel. Dated versions; claims use the version valid on the expense date." status={<Badge tone="success">v5, from 1 Jul 2026</Badge>} />
      <Tabs defaultValue="matrix">
        <TabsList aria-label="Policy sections">
          <TabsTrigger value="matrix">Limits matrix</TabsTrigger>
          <TabsTrigger value="rates">Mileage & per diem</TabsTrigger>
          <TabsTrigger value="rules">Receipts & over-limit</TabsTrigger>
        </TabsList>
        <TabsContent value="matrix">
          <div className="yx-ops-stack">
            <div className="yx-ops-row">
              <FormField label="Grade band">
                <Select value={grade} onChange={setGrade} options={matrix.grades.map((g) => ({ value: g, label: g }))} />
              </FormField>
            </div>
            <PlainTable
              label={`Limits for ${grade}`}
              rows={matrix.categories.map((c, ci) => ({ c, ci }))}
              getRowId={(r) => r.c}
              columns={[
                { key: 'category', header: 'Category', rowHeader: true, cell: (r) => r.c },
                ...matrix.tiers.map((t, ti) => ({
                  key: t,
                  header: t,
                  cell: (r: { c: string; ci: number }) => (
                    <TextField aria-label={`${r.c}, ${t}, ${grade}`} inputMode="numeric" value={limits[r.ci][gi][ti] ? groupIndian(limits[r.ci][gi][ti]) : ''} placeholder="Not allowed" onChange={(v) => set(r.ci, ti, v)} disabled={persona === 'hr'} />
                  ),
                })),
                { key: 'over', header: 'Over the limit', cell: (r) => (r.c.startsWith('Client') ? <Badge tone="danger">Hard block</Badge> : <Badge tone="neutral">Reason + extra approval</Badge>) },
              ]}
            />
            <p className="yx-ops-muted">An empty cell means the category isn't allowed for that grade and tier. Tiers are editable in city tiers.</p>
          </div>
        </TabsContent>
        <TabsContent value="rates">
          <CardGrid>
            <Card title="Mileage (personal vehicle)">
              <DescriptionList items={[{ label: 'Car', value: '₹17 per km' }, { label: 'Two-wheeler', value: '₹7 per km' }, { label: 'Field visits', value: 'Daily distance arrives as a draft line to confirm' }]} />
            </Card>
            <Card title="Per diem">
              <DescriptionList items={[{ label: 'Tier 1', value: '₹1,200 a day' }, { label: 'Tier 2', value: '₹1,000 a day' }, { label: 'Tier 3', value: '₹800 a day' }, { label: 'UAE', value: 'AED 250 a day (paid in AED or INR)' }]} />
            </Card>
          </CardGrid>
        </TabsContent>
        <TabsContent value="rules">
          <Card>
            <div className="yx-ops-stack yx-ops-narrow">
              <FormField label="Receipt needed above">
                <Select value="500" onChange={() => {}} options={[{ value: '0', label: 'Always' }, { value: '500', label: '₹500 (starter)' }, { value: '1000', label: '₹1,000' }]} />
              </FormField>
              <FormField label="Over the limit">
                <RadioGroup defaultValue="allow" options={[{ value: 'allow', label: 'Allow with a reason and an extra approval for the excess', description: 'Default: department head' }, { value: 'block', label: 'Hard block', description: 'Set per category' }]} />
              </FormField>
              <Switch defaultChecked label="Capture GST for input credit" description="Supplier GSTIN, invoice and tax split on GST-eligible categories" />
              <Switch defaultChecked label="Read receipts automatically" description="Pre-fills lines; never approves" />
            </div>
          </Card>
        </TabsContent>
      </Tabs>
      {dirty && (
        <StickySaveBar dirty>
          <FormField label="Effective from" hideLabel>
            <DatePicker value={effective} onChange={setEffective} aria-label="Effective from" />
          </FormField>
          <Button onClick={() => setDirty(false)}>Discard</Button>
          <Button variant="primary">Save as v6</Button>
        </StickySaveBar>
      )}
    </OpsDesk>
  );
}

/* =========================================================================================
 * EXP-08 · Corporate-card statement import & matching (T5, Fin; D+M for employee)
 * ======================================================================================= */

export interface CardLine {
  id: string;
  date: Date;
  merchant: string;
  amount: number;
  employee: string;
  match: 'Matched' | 'Suggested' | 'Unmatched';
  to: string;
}
const MATCH_TONE = { Matched: 'success', Suggested: 'warning', Unmatched: 'danger' } as const;
export interface CardImportProps {
  lines: CardLine[];
  current?: string;
  device?: 'desk' | 'phone';
  explainId?: string;
  /** States drawn for the live screen (EXP-08 round 3): a bank's first file, rows to fix, the same statement again, nothing left to match. */
  variant?: 'first-bank' | 'rows-to-fix' | 'duplicate' | 'nothing' | 'link-card' | 'change-match' | 'no-access' | 'employee-desk';
}
/** EXP-08 card statement import and matching. The live app passes `live` (finance) or `employee` (their card lines). */
export function CardImportScreen(props: CardImportProps | { live: LiveCardImport; defaultSheet?: 'link' | 'change' | null } | { employee: LiveCardLines; device?: 'desk' | 'phone' }) {
  if ('live' in props) return <LiveCardImportScreen live={props.live} defaultSheet={props.defaultSheet} />;
  if ('employee' in props) return <LiveCardLinesScreen live={props.employee} device={props.device} />;
  return <SampleCardImport {...props} />;
}
const SAMPLE_COLUMNS = ['Txn Date', 'Card No', 'Description', 'Ref', 'Debit', 'Credit'];
const SAMPLE_ROWS = [
  ['14/09/2026', 'XXXX1234', 'SKYINDIA AIRLINES BOM', 'R8812', '6,840.00', ''],
  ['19/09/2026', 'XXXX1234', 'FUELPOINT KORAMANGALA', 'R8840', '2,100.00', ''],
  ['24/09/2026', 'XXXX1234', 'REFUND SKYINDIA', 'R8901', '', '500.00'],
];
function SampleCardImport({ lines, current = 'match', device = 'desk', explainId, variant }: CardImportProps) {
  const [choice, setChoice] = useState('business');
  const [sampleMap, setSampleMap] = useState<Partial<CardMapping>>({ dateFormat: 'DD/MM/YYYY', amountMode: 'split', date: 'Txn Date', description: 'Description', card: 'Card No' });
  const mine = lines.filter((l) => l.employee === 'Vikram Rao' && l.match !== 'Matched');
  const myLines: MyCardLine[] = mine.map((x) => ({ id: x.id, txnOn: dayKey(x.date), description: x.merchant, merchant: x.merchant, amount: x.amount.toFixed(2), currency: 'INR', cardLast4: '1234', bankName: 'Kaveri Foods corporate cards', periodFrom: '2026-09-01', periodTo: '2026-09-30', suggestion: x.match === 'Suggested' ? { claimId: 'c', text: x.to } : null, version: 1 }));
  if (variant === 'no-access')
    return (
      <OpsDesk area="expenses" active="Card statements">
        <PageHeader title={CARD_PAGE.title} />
        <NoAccessState what="card statements" grantedBy="your finance admin" note="Card statements need expense.payout.manage for the whole company." />
      </OpsDesk>
    );
  if (variant === 'employee-desk')
    return (
      <OpsDesk area="expenses" active="Expenses home">
        <PageHeader title="Card lines to explain" description={`Your company card, September statement. ${mine.length} lines need you.`} />
        <Card title="Your company card">
          <div className="yx-ops-stack">
            <CardLinesToExplain lines={myLines} recoveryInstalments={3} onExplain={() => {}} busy={null} />
          </div>
        </Card>
      </OpsDesk>
    );
  if (device === 'phone') {
    const l = mine.find((x) => x.id === explainId) ?? mine[0];
    return (
      <PhoneFrame tab="pay" title="Card lines to explain" back={<IconButton icon={ArrowLeft} label="Back" />}>
        <p className="yx-ops-muted">Your company card, September statement. {mine.length} lines need you.</p>
        {mine.map((x) => (
          <div key={x.id} className="yx-ops-tile">
            <div className="yx-ops-tile__row">
              <span className="yx-ops-tile__title">{x.merchant}</span>
              <span className="yx-ops-tile__amount">{formatINR(x.amount)}</span>
            </div>
            <span className="yx-ops-row">
              <span className="yx-ops-muted">{formatDate(x.date)}</span>
              <Badge tone={MATCH_TONE[x.match]}>{x.match === 'Suggested' ? `Suggested: ${x.to}` : 'No receipt found'}</Badge>
            </span>
            {x.id === l.id && (
              <div className="yx-ops-stack" data-gap="sm">
                <RadioGroup
                  value={choice}
                  onChange={setChoice}
                  aria-label="What was it?"
                  options={[
                    { value: 'business', label: 'Business expense', description: 'Add the receipt' },
                    { value: 'personal', label: 'Personal spend', description: 'Recovered from salary' },
                  ]}
                />
                {choice === 'business' ? <Button icon={Upload} fullWidth>Add receipt</Button> : <Button variant="primary" fullWidth>Confirm personal spend</Button>}
              </div>
            )}
          </div>
        ))}
      </PhoneFrame>
    );
  }
  const counts = { m: lines.filter((l) => l.match === 'Matched').length, s: lines.filter((l) => l.match === 'Suggested').length, u: lines.filter((l) => l.match === 'Unmatched').length };
  return (
    <OpsDesk area="expenses" active="Card statements">
      <PageHeader title="Card statement · September 2026" description="Corporate card statement from the bank. Lines match receipts on amount, date and merchant." />
      <Stepper
        key={current}
        title="Import card statement"
        defaultCurrent={current}
        finishLabel="Close statement"
        steps={[
          {
            id: 'upload',
            title: 'Upload statement',
            content: (
              <div className="yx-ops-stack">
                <FormField label="Card programme">
                  <Select value="kf" onChange={() => {}} options={[{ value: 'kf', label: 'Kaveri Foods corporate cards (CSV)' }]} />
                </FormField>
                <FileUpload accept={['.csv', '.xlsx']} upload={async () => {}} />
              </div>
            ),
            summary: 'kf-cards-sep-2026.csv · 6 lines',
          },
          {
            id: 'map',
            title: 'Check columns',
            content:
              variant === 'first-bank' ? (
                <div className="yx-ops-stack">
                  <InlineAlert tone="info">The first statement from Kaveri Foods corporate cards: say which column holds what. It is saved for next time.</InlineAlert>
                  <MappingForm columns={SAMPLE_COLUMNS} sample={SAMPLE_ROWS} value={sampleMap} onChange={setSampleMap} />
                </div>
              ) : variant === 'rows-to-fix' ? (
                <RowsToFix message="2 rows need fixing. Nothing was imported. Fix the file and upload it again." problems={[{ rowNo: 9, problems: ['"31/09/2026" is not a date written as DD/MM/YYYY.'] }, { rowNo: 14, problems: ['No date.', 'The card number has fewer than 4 digits.'] }]} />
              ) : variant === 'duplicate' ? (
                <div className="yx-ops-stack">
                  <ImportRefused problem={{ kind: 'duplicate', message: 'This file was already imported on 2 Oct 2026 (Kaveri Foods corporate cards, 1 Sep 2026 to 30 Sep 2026). Nothing was imported.', statementId: 's1' }} onOpen={() => {}} />
                  <ImportRefused problem={{ kind: 'period', message: 'Kaveri Foods corporate cards already has a statement for 1 Sep 2026 to 30 Sep 2026 (version 1). Import this file as version 2 to replace it, or choose another file.', statementId: 's1', revision: 1 }} onOpen={() => {}} onReplace={() => {}} />
                </div>
              ) : (
                <DescriptionList
                  items={[
                    { label: 'Transaction date', value: 'Column A · Txn Date' },
                    { label: 'Merchant', value: 'Column C · Description' },
                    { label: 'Amount (₹)', value: 'Column E · Debit' },
                    { label: 'Card holder', value: 'Column B · Card last 4 → employee' },
                  ]}
                />
              ),
            summary: '4 columns mapped',
          },
          {
            id: 'match',
            title: 'Match lines',
            content: (
              <div className="yx-ops-stack">
                {variant === 'nothing' && <InlineAlert tone="info">Nothing to match. Every line is matched, with the employee, explained or a refund.</InlineAlert>}
                <Facts
                  items={[
                    { label: 'Matched', value: counts.m, tone: 'success' },
                    { label: 'Suggested', value: counts.s, tone: 'warning' },
                    { label: 'Unmatched', value: counts.u, tone: 'danger' },
                  ]}
                />
                <DataTable
                  label="Card lines"
                  columns={[
                    { key: 'd', header: 'Date', type: 'date', value: (l: CardLine) => l.date },
                    { key: 'm', header: 'Merchant', value: (l) => l.merchant, width: 220 },
                    { key: 'a', header: 'Amount', type: 'money', value: (l) => l.amount, total: 'sum' },
                    { key: 'e', header: 'Card holder', value: (l) => l.employee },
                    { key: 's', header: 'Match', type: 'status', value: (l) => l.match, statusTone: (v) => MATCH_TONE[v as CardLine['match']] },
                    { key: 't', header: 'Matched to', value: (l) => l.to || '—', width: 220 },
                  ]}
                  rows={lines}
                  getRowId={(l) => l.id}
                  rowButtons={(l) => (l.match === 'Suggested' ? <Button size="sm">Accept match</Button> : l.match === 'Unmatched' ? (l.employee.startsWith('Card') ? <Button size="sm" icon={Link2}>Link card</Button> : <Button size="sm">Ask employee</Button>) : null)}
                />
                {variant === 'link-card' && <LinkCardDialog line={{ cardLast4: '4417' }} bankName="Kaveri Foods corporate cards" people={[{ id: 'p1', name: 'Sana Nizami', code: 'KF-0142' }, { id: 'p2', name: 'Sanjay Rao', code: 'KF-0208' }]} onSearch={() => {}} onClose={() => {}} onLink={async () => {}} />}
                {variant === 'change-match' && (
                  <ChangeMatchDialog
                    line={{ id: 'c3', rowNo: 4, txnOn: '2026-09-19', description: 'FUELPOINT KORAMANGALA', merchant: null, amount: '2100.00', direction: 'debit', currency: 'INR', cardLast4: '1234', holders: [{ id: 'e1', name: 'Vikram Rao' }], status: 'open', matchGone: false, matchedTo: null, suggestion: { lineId: 'l7', claimId: 'k1', text: 'Client visits · line 2 · Fuelpoint', amount: '2100.00', spentOn: '2026-09-19' }, chasedOn: null, own: false, version: 1 }}
                    candidates={[
                      { lineId: 'l7', claimId: 'k1', employeeId: 'e1', text: 'Client visits · line 2 · Fuelpoint', amount: '2100.00', currency: 'INR', spentOn: '2026-09-19', payMode: 'company_card' },
                      { lineId: 'l8', claimId: 'k1', employeeId: 'e1', text: 'Client visits · line 3 · Fuel', amount: '2050.00', currency: 'INR', spentOn: '2026-09-21', payMode: 'personal' },
                    ]}
                    onClose={() => {}}
                    onMatch={async () => {}}
                  />
                )}
              </div>
            ),
            summary: `${counts.m} matched, ${counts.s} suggested, ${counts.u} unmatched`,
          },
          {
            id: 'resolve',
            title: 'Resolve',
            content: (
              <div className="yx-ops-stack">
                <InlineAlert tone="info">Employees explain unmatched lines from their phone. Personal spend is recovered from salary (up to 3 instalments).</InlineAlert>
                <FormField label="Note for the statement" optional>
                  <TextArea rows={2} />
                </FormField>
              </div>
            ),
          },
        ]}
      />
    </OpsDesk>
  );
}

/* =========================================================================================
 * EXP-09 · Expense reports (T7, Fin)
 * ======================================================================================= */

export interface ExpenseReportsProps {
  claims: Claim[];
  ageing: { bucket: string; count: number; amount: number }[];
  tab?: 'summary' | 'ageing' | 'unpaid' | 'over' | 'gst';
  loading?: boolean;
}
/** EXP-09 Expense reports. The live app passes `live` (the server's rows and chart figures). */
export function ExpenseReportsScreen(props: ExpenseReportsProps | { live: LiveReports }) {
  return 'live' in props ? <LiveReportsScreen live={props.live} /> : <SampleReports {...props} />;
}
function SampleReports({ claims, ageing, tab = 'summary', loading }: ExpenseReportsProps) {
  const [current, setCurrent] = useState(tab);
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const gstLines = claims.flatMap((c) => c.lines.filter((l) => l.gst).map((l) => ({ ...l.gst!, claim: c.id, employee: c.employee, date: l.date })));
  return (
    <OpsDesk area="expenses" active="Expense reports">
      <PageHeader title="Expense reports" facts="September 2026 · all entities" actions={<Button icon={Download}>Export</Button>} />
      <FilterBar
        fields={[
          { key: 'entity', label: 'Entity', type: 'multi', options: [{ value: 'ka', label: 'Kaveri Foods Pvt Ltd' }, { value: 'tn', label: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' }] },
          { key: 'dept', label: 'Department', type: 'multi', options: ['Sales', 'Operations', 'Quality', 'Engineering'].map((v) => ({ value: v, label: v })) },
          { key: 'period', label: 'Period', type: 'date' },
        ]}
        value={filters}
        onChange={setFilters}
      />
      <Tabs value={current} onValueChange={(v) => setCurrent(v as typeof current)}>
        <TabsList aria-label="Reports">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="ageing">Advance ageing</TabsTrigger>
          <TabsTrigger value="unpaid">Unpaid claims</TabsTrigger>
          <TabsTrigger value="over">Over limit</TabsTrigger>
          <TabsTrigger value="gst">GST input</TabsTrigger>
        </TabsList>
        <TabsContent value="summary">
          <CardGrid min="lg">
            <BarChart title="Spend by category" xLabel="Category" money orientation="horizontal" categories={['Travel', 'Hotel', 'Mileage', 'Meals and per diem', 'Client entertainment', 'Internet and phone']} series={[{ name: 'September', values: [182400, 146200, 64300, 52100, 21800, 14900] }]} loading={loading} />
            <DonutChart title="Paid through" money slices={[{ label: 'Payroll', value: 318400 }, { label: 'Direct payout', value: 112600 }, { label: 'Company paid', value: 50700 }]} loading={loading} />
          </CardGrid>
        </TabsContent>
        <TabsContent value="ageing">
          <div className="yx-ops-stack">
            <BarChart title="Open advances by age" xLabel="Age" money categories={ageing.map((a) => a.bucket)} series={[{ name: 'Open balance', values: ageing.map((a) => a.amount) }]} loading={loading} />
            <DataTable
              label="Advance ageing"
              columns={[
                { key: 'b', header: 'Age', value: (a: ExpenseReportsProps['ageing'][number]) => a.bucket },
                { key: 'c', header: 'Advances', type: 'number', value: (a) => a.count, total: 'sum' },
                { key: 'a', header: 'Open balance', type: 'money', value: (a) => a.amount, total: 'sum' },
              ]}
              rows={ageing}
              getRowId={(a) => a.bucket}
              state={loading ? 'loading' : 'ready'}
            />
          </div>
        </TabsContent>
        <TabsContent value="unpaid">
          <DataTable
            label="Unpaid claims"
            columns={[
              { key: 'net', header: 'Net payable', type: 'money', value: (c: Claim) => claimTotals(c).netPayable, total: 'sum' },
              { key: 'id', header: 'Claim', type: 'id', value: (c) => c.id },
              { key: 'e', header: 'Employee', value: (c) => c.employee },
              { key: 'ap', header: 'Approved', type: 'money', value: (c) => claimTotals(c).approved },
              { key: 'adv', header: 'Advance adjusted', type: 'money', value: (c) => c.advanceAdjusted },
              { key: 's', header: 'Status', value: (c) => c.payment, render: (c) => <ClaimBadges c={c} /> },
            ]}
            rows={claims.filter((c) => c.payment !== 'Paid' && c.status !== 'Rejected')}
            getRowId={(c) => c.id}
            state={loading ? 'loading' : 'ready'}
            onExport={() => {}}
          />
        </TabsContent>
        <TabsContent value="over">
          <DataTable
            label="Over-limit lines"
            columns={[
              { key: 'c', header: 'Claim', type: 'id', value: (r: { c: string; e: string; cat: string; amt: number; lim: number; why: string }) => r.c },
              { key: 'e', header: 'Employee', value: (r) => r.e },
              { key: 'cat', header: 'Category', value: (r) => r.cat },
              { key: 'amt', header: 'Claimed', type: 'money', value: (r) => r.amt },
              { key: 'lim', header: 'Limit', type: 'money', value: (r) => r.lim },
              { key: 'x', header: 'Excess', type: 'money', value: (r) => r.amt - r.lim, total: 'sum' },
              { key: 'w', header: 'Reason given', value: (r) => r.why, width: 280 },
            ]}
            rows={[
              { c: 'EXP-1042', e: 'Vikram Rao', cat: 'Hotel', amt: 9200, lim: 7500, why: 'Conference hotel; the cheaper listed hotels were full.' },
              { c: 'EXP-1040', e: 'Sana Nizami', cat: 'Meals', amt: 1650, lim: 1200, why: 'Dinner with distributor team' },
            ]}
            getRowId={(r) => r.c + r.cat}
          />
        </TabsContent>
        <TabsContent value="gst">
          <DataTable
            label="GST input"
            columns={[
              { key: 'g', header: 'Supplier GSTIN', type: 'id', value: (r: (typeof gstLines)[number]) => r.gstin },
              { key: 'i', header: 'Invoice', type: 'id', value: (r) => r.invoice },
              { key: 'd', header: 'Date', type: 'date', value: (r) => r.date },
              { key: 'c', header: 'Claim', type: 'id', value: (r) => r.claim },
              { key: 't', header: 'Taxable value', type: 'money', value: (r) => r.taxable, total: 'sum' },
              { key: 'cg', header: 'CGST', type: 'money', value: (r) => r.cgst, total: 'sum' },
              { key: 'sg', header: 'SGST', type: 'money', value: (r) => r.sgst, total: 'sum' },
              { key: 'ig', header: 'IGST', type: 'money', value: (r) => r.igst, total: 'sum' },
            ]}
            rows={gstLines}
            getRowId={(r) => r.invoice}
            empty={<EmptyState compact title="No GST lines this month." description="GST capture is a company option in expense policy." />}
          />
        </TabsContent>
      </Tabs>
      <Actions end>
        <Button icon={Download}>Download as XLSX</Button>
      </Actions>
    </OpsDesk>
  );
}
