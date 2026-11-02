// PAY-28 · Arrears and recoveries and PAY-38 · Actuarial valuation, live: the designed ArrearsBaseScreen (list view and
// its worksheet drawer) and ActuarialScreen (census, valuation, provision posting) with the API's data. Same tabs,
// steps, tables and texts as the designs; the API checks every action again (keys, entity scope, maker ≠ checker).
import { useState, type ReactNode } from 'react';
import { Download, FileText } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FieldRow, FormField, FormSection, useTooEarly } from '../../components/field';
import { CurrencyField, TextArea } from '../../components/inputs';
import { DatePicker } from '../../components/date';
import { useToast } from '../../components/notify';
import { ConfirmDialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { PlainTable } from '../../components/plain-table';
import { Stepper } from '../../components/stepper';
import { DataTable, type TableColumn } from '../../components/table';
import { FileUpload } from '../../components/upload';
import { formatINR } from '../../lib/format';
import { useRun } from '../org/org-kit';
import { LivePage, dateText } from '../time/live/kit';
import { FactRow, SectionTitle, StateBlock } from './pay-kit';
import { EntityPicker } from './live/setup';
import type { LoadState } from './live/types';
import type { SetupEntity } from './live/types-5b';
import type { ActuarialView } from './live/types-5i';
import type { Recovery, Worksheet, WorksheetLine } from './live/types-5j';

const money = (x: string | null | undefined) => (x == null || x === '' ? '—' : formatINR(Number(x)));
/** "Aug 2026" from yyyy-mm (the design's month labels). */
const monthText = (m: string) => new Date(`${m.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const isoDay = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const Failed = ({ error }: { error: string | null }) =>
  error ? (
    <InlineAlert tone="danger" title="That did not go through">
      {error}
    </InlineAlert>
  ) : null;

/* ================================================================== PAY-28 Arrears and recoveries */

export interface LiveArrears {
  state: LoadState;
  onRetry?: () => void;
  worksheets: Worksheet[] | null;
  recoveries: Recovery[] | null;
  nameOf: (employeeId: string) => string;
  /** The signed-in user: whoever made a worksheet does not approve it. */
  me: string | null;
  can: { approve: boolean; writeOff: boolean };
  onApprove: (w: Worksheet, runId?: string) => Promise<unknown>;
  onCancel: (w: Worksheet) => Promise<unknown>;
  onConfirmBase: (w: Worksheet, period: string, lines: { componentCode: string; asPaid: string }[], reason: string) => Promise<unknown>;
  onWriteOff: (r: Recovery, reason: string) => Promise<unknown>;
  /**
   * Slot for the PAY-19 tabs (court orders, carry-forwards, overpayments, deduction cap) that builder 1 builds in
   * payroll-inputs.tsx. Until the page passes it, the Recoveries tab shows the overpayments with their write-off.
   */
  recoveryTabs?: ReactNode;
}

const sheetStatus = (w: Worksheet): { label: string; tone: BadgeTone } =>
  w.status === 'approved' ? { label: 'Approved', tone: 'success' } : w.status === 'cancelled' ? { label: 'Cancelled', tone: 'neutral' } : w.missing ? { label: 'Base needed', tone: 'warning' } : { label: 'Ready to approve', tone: 'info' };
const BASE: Record<WorksheetLine['base'], { label: string; tone: BadgeTone }> = {
  payslip: { label: 'YukthiX run', tone: 'neutral' },
  import: { label: 'Imported', tone: 'info' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  missing: { label: 'Missing: confirm base', tone: 'warning' },
};
const RECOVERY: Record<string, { label: string; tone: BadgeTone }> = {
  proposed: { label: 'Waiting for the employee', tone: 'warning' },
  active: { label: 'Recovering', tone: 'info' },
  declined: { label: 'Declined', tone: 'neutral' },
  recovered: { label: 'Recovered', tone: 'success' },
  written_off: { label: 'Written off', tone: 'neutral' },
};

export function LiveArrearsScreen({ live }: { live: LiveArrears }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = live.worksheets?.find((w) => w.id === openId) ?? null;
  const months = (w: Worksheet) => (w.from === w.to ? monthText(w.from) : `${monthText(w.from)}–${monthText(w.to)}`);
  const cols: TableColumn<Worksheet>[] = [
    { key: 'person', header: 'Person', value: (w) => live.nameOf(w.employeeId) },
    { key: 'months', header: 'Months', value: months },
    { key: 'owed', header: 'Owed to the employee', type: 'money', value: (w) => Number(w.total) },
    { key: 'status', header: 'Status', type: 'status', value: (w) => sheetStatus(w).label, statusTone: (_v, w) => sheetStatus(w).tone },
  ];
  return (
    <LivePage title="Arrears and recoveries" description="Arrears worksheets (corrected minus as paid, per month and component), court orders and overpayments." state={live.state} onRetry={live.onRetry} what="arrears" grantedBy="your payroll admin">
      <Tabs defaultValue="arrears">
        <TabsList aria-label="Arrears and recoveries">
          <TabsTrigger value="arrears" count={live.worksheets?.length || undefined}>
            Arrears worksheets
          </TabsTrigger>
          <TabsTrigger value="recoveries">Recoveries</TabsTrigger>
        </TabsList>
        <TabsContent value="arrears">
          <DataTable
            label="Arrears worksheets"
            columns={cols}
            rows={live.worksheets ?? []}
            state={live.worksheets ? 'ready' : 'loading'}
            getRowId={(w) => w.id}
            onRowClick={(w) => setOpenId(w.id)}
            activeRowId={openId}
            rowButtons={(w) => (
              <Button size="sm" onClick={() => setOpenId(w.id)}>
                Open
              </Button>
            )}
            empty={<EmptyState title="No arrears worksheets" description="A past-dated pay change or a wage settlement makes one." />}
          />
        </TabsContent>
        <TabsContent value="recoveries">{live.recoveryTabs ?? <Overpayments live={live} />}</TabsContent>
      </Tabs>
      <Drawer open={!!open} onOpenChange={(o) => !o && setOpenId(null)} title={`${open ? live.nameOf(open.employeeId) : ''} · arrears`} subtitle={open?.reason} size="lg" footer={<Button onClick={() => setOpenId(null)}>Close</Button>}>
        {open && <WorksheetBase key={open.id} w={open} live={live} />}
      </Drawer>
    </LivePage>
  );
}

/** One worksheet: the design's base step (months, as paid, base source, arrear), confirm a missing month, approve or cancel. */
/** PAY-28 worksheet lines (month, component, corrected, as paid, base, arrear); also embedded in PAY-37 settlement arrears. */
export function WorksheetLinesTable({ lines, totalLabel, total, who }: { lines: WorksheetLine[]; totalLabel: string; total: string; /** Several people's lines: the person's name per row. */ who?: (l: WorksheetLine) => string }) {
  return (
    <PlainTable
      label="Worksheet lines"
      rows={lines}
      getRowId={(l) => l.id}
      rowTone={(l) => (l.base === 'missing' ? { tone: 'warning', label: 'Base missing' } : undefined)}
      columns={[
        { key: 'month', header: 'Month', rowHeader: true, cell: (l) => monthText(l.period) },
        ...(who ? [{ key: 'who', header: 'Employee', cell: (l: WorksheetLine) => who(l) }] : []),
        { key: 'component', header: 'Component', cell: (l) => <>{l.componentCode} {l.kind !== 'earning' && <Badge tone="neutral">{l.kind === 'deduction' ? 'employee share' : 'company cost'}</Badge>}</> },
        { key: 'corrected', header: 'Corrected', num: true, cell: (l) => money(l.corrected) },
        { key: 'asPaid', header: 'As paid', num: true, cell: (l) => money(l.asPaid) },
        { key: 'base', header: 'Base source', cell: (l) => <Badge tone={BASE[l.base].tone}>{BASE[l.base].label}</Badge> },
        { key: 'arrear', header: 'Arrear', num: true, cell: (l) => money(l.difference) },
      ]}
      footer={[{ id: 'total', label: totalLabel, cells: { arrear: money(total) } }]}
    />
  );
}

function WorksheetBase({ w, live }: { w: Worksheet; live: LiveArrears }) {
  const { toast } = useToast();
  const { busy, error, run } = useRun();
  const [paid, setPaid] = useState<Record<string, number | null>>({});
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const missing = [...new Set(w.lines.filter((l) => l.base === 'missing').map((l) => l.period))];
  const period = missing[0] ?? null;
  const baseLines = w.lines.filter((l) => l.period === period && l.base === 'missing');
  const check = useTooEarly([
    ...baseLines.filter((l) => paid[l.componentCode] == null).map((l) => ({ fieldId: `wb-${l.componentCode}`, message: `${l.componentCode}: enter what was paid in ${monthText(l.period)}.` })),
    ...(reason.trim().length < 5 ? [{ fieldId: 'wb-why', message: 'Name the document or register (at least 5 characters).' }] : []),
  ]);
  const draft = w.status === 'draft';
  const mine = !!live.me && w.createdBy === live.me;
  const name = live.nameOf(w.employeeId);
  return (
    <div className="yx-pay-stack">
      <Failed error={error} />
      {draft ? (
        <InlineAlert tone={missing.length ? 'warning' : 'info'} title={missing.length ? `Confirm the as-paid base for ${missing.map(monthText).join(', ')}` : 'Base confirmed for every month'}>
          {missing.length ? 'No pay lines exist for this month. Arrears can’t be approved until you confirm what was paid, with a reason.' : 'You can approve the arrears; they are paid with the next run.'}
        </InlineAlert>
      ) : (
        <Badge tone={sheetStatus(w).tone}>{sheetStatus(w).label}</Badge>
      )}
      <WorksheetLinesTable lines={w.lines} totalLabel={missing.length ? `Arrears so far for ${name} (${missing.map(monthText).join(', ')} not included)` : `Arrears for ${name}`} total={w.total} />
      {draft && period && (
        <section className="yx-pay-panel" aria-label={`Confirm ${monthText(period)} base`}>
          <SectionTitle>Confirm the as-paid base for {monthText(period)}</SectionTitle>
          <FieldRow>
            {baseLines.map((l) => (
              <FormField key={l.id} id={`wb-${l.componentCode}`} label={`${l.componentCode} as paid in ${monthText(period)}`} required error={check.errorOf(`wb-${l.componentCode}`)}>
                <CurrencyField allowPaise value={paid[l.componentCode] ?? null} onChange={(v) => setPaid({ ...paid, [l.componentCode]: v })} />
              </FormField>
            ))}
          </FieldRow>
          <FormField id="wb-why" label="Where this figure comes from" required helper="Name the document or register (at least 5 characters). Stored with the audit event." error={check.errorOf('wb-why')}>
            <TextArea value={reason} onChange={setReason} rows={2} />
          </FormField>
          <div className="yx-pay-row">
            <Button
              variant="primary"
              loading={busy === 'base'}
              onClick={() => {
                if (check.stop()) return;
                void run('base', async () => {
                  await live.onConfirmBase(
                    w,
                    period,
                    baseLines.map((l) => ({ componentCode: l.componentCode, asPaid: String(paid[l.componentCode]) })),
                    reason.trim(),
                  );
                  check.reset();
                  toast({ tone: 'success', title: `Base confirmed for ${monthText(period)}.` });
                });
              }}
            >
              Confirm base
            </Button>
          </div>
        </section>
      )}
      {!missing.length && (
        <section className="yx-pay-panel" aria-label="Computed arrears">
          <SectionTitle>Computed arrears for {name}</SectionTitle>
          <FactRow
            items={[
              { label: 'Owed to the employee', value: money(w.total) },
              { label: 'Extra company cost (PF, ESI)', value: money(w.employerCost) },
            ]}
          />
          {draft && (
            <div className="yx-pay-row">
              {live.can.approve &&
                (mine ? (
                  <p className="yx-pay-note">You made this worksheet, so someone else approves it.</p>
                ) : (
                  <Button
                    variant="approve"
                    loading={busy === 'approve'}
                    onClick={() =>
                      void run('approve', async () => {
                        await live.onApprove(w);
                        toast({ tone: 'success', title: `Arrears for ${name} approved; they are paid with the next run.` });
                      })
                    }
                  >
                    Approve
                  </Button>
                ))}
              <Button onClick={() => setCancelling(true)}>Cancel worksheet</Button>
            </div>
          )}
        </section>
      )}
      {draft && missing.length > 0 && (
        <div className="yx-pay-row">
          <Button onClick={() => setCancelling(true)}>Cancel worksheet</Button>
        </div>
      )}
      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title="Cancel this worksheet?"
        consequence={`No arrears are paid to ${name} from it. A new pay change makes a new worksheet.`}
        confirmLabel="Cancel worksheet"
        cancelLabel="Keep it"
        destructive
        onConfirm={async () => {
          await live.onCancel(w);
          toast({ tone: 'success', title: 'Worksheet cancelled.' });
        }}
      />
    </div>
  );
}

/** Interim Recoveries tab (until builder 1's PAY-19 tabs fill the slot): overpayments in the PAY-19 "Overpayments" look. */
function Overpayments({ live }: { live: LiveArrears }) {
  const { toast } = useToast();
  const [writing, setWriting] = useState<Recovery | null>(null);
  const [why, setWhy] = useState('');
  const check = useTooEarly(why.trim().length < 5 ? [{ fieldId: 'wo-why', message: 'Say why (at least 5 characters).' }] : []);
  const cols: TableColumn<Recovery>[] = [
    { key: 'person', header: 'Person', value: (r) => live.nameOf(r.employeeId), render: (r) => <>{live.nameOf(r.employeeId)} {r.crossYear && <Badge tone="info">Earlier tax year {r.originTaxYear}</Badge>}</> },
    { key: 'reason', header: 'Why', value: (r) => r.reason, optional: true },
    { key: 'amount', header: 'Amount', type: 'money', value: (r) => Number(r.amount) },
    { key: 'left', header: 'Left', type: 'money', value: (r) => Number(r.balance) },
    { key: 'status', header: 'Status', type: 'status', value: (r) => RECOVERY[r.status]?.label ?? r.status, statusTone: (_v, r) => RECOVERY[r.status]?.tone ?? 'neutral' },
  ];
  return (
    <div className="yx-pay-stack">
      <InlineAlert tone="info">An overpayment is recovered only by a plan the employee acknowledges. A write-off needs a reason.</InlineAlert>
      <DataTable
        label="Overpayment plans"
        columns={cols}
        rows={live.recoveries ?? []}
        state={live.recoveries ? 'ready' : 'loading'}
        getRowId={(r) => r.id}
        rowButtons={(r) =>
          live.can.writeOff && ['proposed', 'active', 'declined'].includes(r.status) ? (
            <Button size="sm" variant="review" onClick={() => setWriting(r)}>
              Write off
            </Button>
          ) : null
        }
        empty={<EmptyState title="No overpayments" description="An overpayment found after a run shows here with its recovery plan." />}
      />
      <ConfirmDialog
        open={!!writing}
        onOpenChange={(o) => {
          if (!o) {
            setWriting(null);
            setWhy('');
            check.reset();
          }
        }}
        title="Write off what is left?"
        consequence={writing ? `${money(writing.balance)} of ${money(writing.amount)} for ${live.nameOf(writing.employeeId)} is not recovered.` : undefined}
        confirmLabel="Write off"
        onConfirm={async () => {
          if (check.stop()) return false;
          await live.onWriteOff(writing!, why.trim());
          toast({ tone: 'success', title: `Written off for ${live.nameOf(writing!.employeeId)}.` });
          setWhy('');
        }}
      >
        <FormField id="wo-why" label="Why" required error={check.errorOf('wo-why')}>
          <TextArea value={why} onChange={setWhy} rows={2} />
        </FormField>
      </ConfirmDialog>
    </div>
  );
}

/* ================================================================== PAY-38 Actuarial census and valuation */

type Standard = 'IND_AS_19' | 'AS_15';
export interface LiveActuarial {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  data: ActuarialView | null;
  can: { census: boolean; journal: boolean };
  onCensus: (asOf: string, standard: Standard) => Promise<unknown>;
  onDownload: (fileId: string, name: string) => Promise<unknown>;
  onRecord: (x: { asOf: string; standard: Standard; kind: 'gratuity' | 'leave'; closing: string; censusId?: string } & Partial<Record<MovementKey, string>>, report: File | null) => Promise<unknown>;
  onPost: (id: string) => Promise<unknown>;
}

const STANDARDS = [
  { value: 'IND_AS_19' as const, label: 'Ind AS 19' },
  { value: 'AS_15' as const, label: 'AS 15' },
];
const stdText = (s: string) => STANDARDS.find((x) => x.value === s)?.label ?? s;
type Valuation = ActuarialView['valuations'][number];

/** PAY-38 "Valuation upload · figures to enter": the actuary's movement in the obligation (brackets reduce it). */
type MovementKey = 'serviceCost' | 'interestCost' | 'benefitsPaid' | 'actuarialLoss' | 'actuarialGain';
const MOVEMENT: { k: MovementKey; label: string; sign: 1 | -1 }[] = [
  { k: 'serviceCost', label: 'Current service cost', sign: 1 },
  { k: 'interestCost', label: 'Interest cost', sign: 1 },
  { k: 'benefitsPaid', label: 'Benefits paid (less)', sign: -1 },
  { k: 'actuarialLoss', label: 'Actuarial loss', sign: 1 },
  { k: 'actuarialGain', label: 'Actuarial gain (less)', sign: -1 },
];

export function LiveActuarialScreen({ live }: { live: LiveActuarial }) {
  const { toast } = useToast();
  const { busy, error, run } = useRun();
  const [step, setStep] = useState('census');
  const [asOf, setAsOf] = useState<Date | null>(null);
  const [standard, setStandard] = useState<Standard>('IND_AS_19');
  const [rec, setRec] = useState<{ kind: 'gratuity' | 'leave'; standard: Standard; asOf: Date | null; closing: number | null; census: string | null }>({ kind: 'gratuity', standard: 'IND_AS_19', asOf: null, closing: null, census: null });
  const [report, setReport] = useState<File | null>(null);
  const [move, setMove] = useState<Partial<Record<MovementKey, number | null>>>({});
  const [uploadKey, setUploadKey] = useState(0);
  const [journal, setJournal] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [finishNote, setFinishNote] = useState<string | null>(null);
  const censusCheck = useTooEarly(asOf ? [] : [{ fieldId: 'ac-asof', message: 'Choose the date the census is as at.' }]);
  const d = live.data;
  // PAY-38: with the movement entered, the closing obligation is worked out from the opening one (the last posted figure).
  const openingOf = (k: 'gratuity' | 'leave') => Number(d?.valuations.filter((v) => v.kind === k && v.status === 'posted').sort((a, b) => b.valuedOn.localeCompare(a.valuedOn))[0]?.closing ?? 0);
  const moveGiven = MOVEMENT.filter((m) => move[m.k] != null).length;
  const moveClosing = moveGiven === MOVEMENT.length ? Math.round((openingOf(rec.kind) + MOVEMENT.reduce((t, m) => t + m.sign * (move[m.k] ?? 0), 0)) * 100) / 100 : null;
  const closing = moveClosing ?? rec.closing;
  const recordCheck = useTooEarly([
    ...(rec.asOf ? [] : [{ fieldId: 'rv-asof', message: 'Choose the valuation date.' }]),
    ...(moveGiven > 0 && moveGiven < MOVEMENT.length ? [{ fieldId: `rv-${MOVEMENT.find((m) => move[m.k] == null)!.k}`, message: 'Enter all five figures (0 where the report has none), or leave them all empty.' }] : []),
    ...(moveClosing !== null && moveClosing < 0 ? [{ fieldId: 'rv-serviceCost', message: 'These figures take the obligation below zero. Check them against the report.' }] : []),
    ...(closing == null ? [{ fieldId: 'rv-closing', message: 'Enter the closing obligation from the report.' }] : []),
  ]);
  const entity = live.entities.find((x) => x.id === live.entityId)?.name;
  const censuses = d?.censuses ?? [];
  // The latest figure of each obligation that is recorded but not posted yet: what the journal books.
  const latest = (k: 'gratuity' | 'leave') => d?.valuations.filter((v) => v.kind === k).sort((a, b) => b.valuedOn.localeCompare(a.valuedOn))[0];
  const current = [latest('gratuity'), latest('leave')].filter((v): v is Valuation => !!v);
  const toPost = current.filter((v) => v.status === 'recorded');
  const postable = toPost.filter((v) => !v.madeByMe);
  const total = postable.reduce((a, v) => a + Number(v.delta), 0);
  const cell = (k: 'gratuity' | 'leave', f: (v: Valuation) => string) => {
    const v = toPost.find((x) => x.kind === k);
    return v ? money(f(v)) : '—';
  };

  const finish = () => {
    setFinishNote(null);
    if (!live.can.journal) return setFinishNote('Only a finance approver posts the provision journal.');
    if (!toPost.length) return setFinishNote(current.length ? 'Every recorded figure is already posted.' : 'Record the actuary’s figures first.');
    if (!postable.length) return setFinishNote('You recorded these figures, so someone else posts the journal.');
    setConfirming(true);
  };

  const steps = [
    {
      id: 'census',
      title: 'Census',
      description: censuses[0] ? `Latest as at ${dateText(censuses[0].asOf)}` : 'Not made yet',
      status: censuses.length ? ('done' as const) : undefined,
      content: (
        <div className="yx-pay-stack">
          {censuses.length ? (
            <PlainTable
              label="Census versions"
              rows={censuses}
              getRowId={(c) => c.id}
              columns={[
                { key: 'version', header: 'Version', rowHeader: true, cell: (c) => <span style={{ whiteSpace: 'nowrap' }}>Version {censuses.length - censuses.indexOf(c)}</span> },
                { key: 'asOf', header: 'As at', date: true, cell: (c) => dateText(c.asOf) },
                { key: 'rows', header: 'Employees', num: true, cell: (c) => c.rows },
                { key: 'standard', header: 'Standard', cell: (c) => stdText(c.standard) },
                { key: 'status', header: 'Status', cell: (c) => (c === censuses[0] ? <Badge tone="success">Current</Badge> : <Badge>Replaced</Badge>) },
                {
                  key: 'download',
                  header: <span className="yx-visually-hidden">Download</span>,
                  cell: (c) => (
                    <Button size="sm" icon={Download} aria-label={`Download version ${censuses.length - censuses.indexOf(c)} census as XLSX`} loading={busy === c.id} onClick={() => void run(c.id, () => live.onDownload(c.fileId, `actuarial-census-${c.asOf}.xlsx`))}>
                      XLSX
                    </Button>
                  ),
                },
              ]}
            />
          ) : (
            <EmptyState compact title="No census yet" description="Make one as at the valuation date and send it to the actuary." />
          )}
          {live.can.census && (
            <section className="yx-pay-panel" aria-label="Make a census">
              <SectionTitle>Make a census</SectionTitle>
              <FieldRow>
                <FormField id="ac-asof" label="As at" required error={censusCheck.errorOf('ac-asof')}>
                  <DatePicker id="ac-asof" value={asOf} onChange={setAsOf} />
                </FormField>
                <FormField label="Standard">
                  <Segment label="Standard" value={standard} onChange={setStandard} options={STANDARDS} />
                </FormField>
              </FieldRow>
              <div className="yx-pay-row">
                <Button
                  variant="primary"
                  loading={busy === 'census'}
                  onClick={() => {
                    if (censusCheck.stop()) return;
                    void run('census', async () => {
                      await live.onCensus(isoDay(asOf!), standard);
                      censusCheck.reset();
                      toast({ tone: 'success', title: `Census made as at ${dateText(isoDay(asOf!))}.` });
                    });
                  }}
                >
                  Make census
                </Button>
              </div>
            </section>
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
          {live.can.journal && (
            <section className="yx-pay-panel" aria-label="Record the actuary's figures">
              <SectionTitle>Record the actuary&apos;s figures</SectionTitle>
              <FileUpload
                key={uploadKey}
                upload={async () => {}}
                accept={['.pdf']}
                multiple={false}
                onItemsChange={(items) => setReport(items.find((i) => i.status === 'done')?.file ?? null)}
              />
              <FieldRow>
                <FormField label="Obligation">
                  <Segment
                    label="Obligation"
                    value={rec.kind}
                    onChange={(kind) => setRec({ ...rec, kind })}
                    options={[
                      { value: 'gratuity', label: 'Gratuity' },
                      { value: 'leave', label: 'Leave encashment' },
                    ]}
                  />
                </FormField>
                <FormField label="Valuation standard">
                  <Segment label="Valuation standard" value={rec.standard} onChange={(s) => setRec({ ...rec, standard: s })} options={STANDARDS} />
                </FormField>
              </FieldRow>
              <FieldRow>
                <FormField id="rv-asof" label="As at" required error={recordCheck.errorOf('rv-asof')}>
                  <DatePicker id="rv-asof" value={rec.asOf} onChange={(x) => setRec({ ...rec, asOf: x })} />
                </FormField>
                <FormField id="rv-closing" label="Closing obligation" required error={recordCheck.errorOf('rv-closing')} helper={moveClosing !== null ? 'Worked out from the opening obligation and the movement below.' : undefined}>
                  <CurrencyField allowPaise value={closing} onChange={(c) => setRec({ ...rec, closing: c })} readOnly={moveClosing !== null} />
                </FormField>
                {censuses.length > 0 && (
                  <FormField label="From the census" optional>
                    <Select value={rec.census} onChange={(census) => setRec({ ...rec, census })} clearable placeholder="Choose a census" options={censuses.map((c) => ({ value: c.id, label: `As at ${dateText(c.asOf)}` }))} />
                  </FormField>
                )}
              </FieldRow>
              <FormSection title="Movement from the report" description={`Optional. Opening obligation ${formatINR(openingOf(rec.kind))} (the last posted figure). Figures marked "less" reduce it.`}>
                <PlainTable
                  label="Valuation figures"
                  rows={MOVEMENT}
                  getRowId={(m) => m.k}
                  columns={[
                    { key: 'figure', header: 'Figure', rowHeader: true, cell: (m) => m.label },
                    {
                      key: 'amount',
                      header: rec.kind === 'gratuity' ? 'Gratuity' : 'Leave',
                      cell: (m) => (
                        <FormField id={`rv-${m.k}`} label={m.label} hideLabel error={recordCheck.errorOf(`rv-${m.k}`)}>
                          <CurrencyField allowPaise value={move[m.k] ?? null} onChange={(x) => setMove({ ...move, [m.k]: x })} />
                        </FormField>
                      ),
                    },
                  ]}
                  footer={[{ id: 'closing', label: 'Closing obligation', cells: { amount: moveClosing !== null ? formatINR(moveClosing) : '—' } }]}
                />
              </FormSection>
              <div className="yx-pay-row">
                <Button
                  variant="primary"
                  loading={busy === 'record'}
                  onClick={() => {
                    if (recordCheck.stop()) return;
                    void run('record', async () => {
                      const movement = moveClosing !== null ? Object.fromEntries(MOVEMENT.map((m) => [m.k, String(move[m.k])])) : {};
                      await live.onRecord({ asOf: isoDay(rec.asOf!), standard: rec.standard, kind: rec.kind, closing: String(closing), ...(rec.census ? { censusId: rec.census } : {}), ...movement }, report);
                      recordCheck.reset();
                      setRec({ ...rec, asOf: null, closing: null });
                      setMove({});
                      setReport(null);
                      setUploadKey((k) => k + 1);
                      toast({ tone: 'success', title: `${rec.kind === 'gratuity' ? 'Gratuity' : 'Leave'} figures recorded. Someone else posts the journal.` });
                    });
                  }}
                >
                  Record figures
                </Button>
              </div>
            </section>
          )}
          {d?.valuations.length ? (
            <PlainTable
              label="Valuations"
              rows={d.valuations}
              getRowId={(v) => v.id}
              columns={[
                { key: 'figure', header: 'Figure', rowHeader: true, cell: (v) => <>{v.kind === 'gratuity' ? 'Gratuity' : 'Leave'} · {dateText(v.valuedOn)} · {stdText(v.standard)}</> },
                { key: 'opening', header: 'Opening obligation', num: true, cell: (v) => money(v.opening) },
                { key: 'closing', header: 'Closing obligation', num: true, cell: (v) => money(v.closing) },
                { key: 'delta', header: 'Change', num: true, cell: (v) => money(v.delta) },
                { key: 'status', header: 'Status', cell: (v) => (v.status === 'posted' ? <Badge tone="success">Posted</Badge> : <Badge tone="warning">To post</Badge>) },
              ]}
            />
          ) : (
            <EmptyState compact title="No valuations recorded" description="Record the closing obligation from the actuary's report." />
          )}
          <p className="yx-pay-note">The journal books the change since the last posted figure.</p>
        </div>
      ),
    },
    {
      id: 'post',
      title: 'Provision posting',
      description: 'Journal to accounting',
      content: (
        <div className="yx-pay-stack">
          {finishNote && (
            <InlineAlert tone="warning" title="Nothing posted">
              {finishNote}
            </InlineAlert>
          )}
          {current.length > 0 && !toPost.length && <InlineAlert tone="info" title="Journal posted">The latest gratuity and leave figures are in the books.</InlineAlert>}
          {toPost.length > 0 && (
            <>
              <PlainTable
                label="Provision against the valuation"
                rows={[
                  { id: 'books', label: 'Provision in books', pick: (v: Valuation) => v.opening },
                  { id: 'closing', label: 'Closing obligation', pick: (v: Valuation) => v.closing },
                ]}
                getRowId={(r) => r.id}
                columns={[
                  { key: 'figure', header: 'Figure', rowHeader: true, cell: (r) => r.label },
                  { key: 'gratuity', header: 'Gratuity', num: true, cell: (r) => cell('gratuity', r.pick) },
                  { key: 'leave', header: 'Leave', num: true, cell: (r) => cell('leave', r.pick) },
                ]}
                footer={[{ id: 'journal', label: 'Journal: debit expense', cells: { gratuity: cell('gratuity', (v) => v.delta), leave: cell('leave', (v) => v.delta) } }]}
              />
              {toPost.some((v) => v.madeByMe) && <p className="yx-pay-note">You recorded {postable.length ? 'some of these figures' : 'these figures'}, so someone else posts {postable.length ? 'those' : 'the journal'}.</p>}
              <div className="yx-pay-row">
                <Button icon={FileText} aria-expanded={journal} onClick={() => setJournal(!journal)}>
                  {journal ? 'Hide journal' : 'Preview journal'}
                </Button>
              </div>
              {journal && (
                <PlainTable
                  label="Provision journal preview"
                  rows={toPost.flatMap((v) => v.journal.map((j, i) => ({ ...j, id: `${v.id}-${i}` })))}
                  getRowId={(j) => j.id}
                  columns={[
                    { key: 'account', header: 'Account', rowHeader: true, cell: (j) => j.account },
                    { key: 'debit', header: 'Debit', num: true, cell: (j) => (j.debit ? money(j.debit) : '') },
                    { key: 'credit', header: 'Credit', num: true, cell: (j) => (j.credit ? money(j.credit) : '') },
                  ]}
                />
              )}
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <LivePage title="Actuarial valuation" description={entity ? `Gratuity and leave liability for ${entity}` : 'Gratuity and leave liability: the census for the actuary and the provision journal.'} state={live.state} onRetry={live.onRetry} what="actuarial valuations" grantedBy="your payroll admin">
      <div className="yx-pay-row">
        <EntityPicker entities={live.entities} value={live.entityId} onChange={live.onEntity} />
      </div>
      <Failed error={error} />
      {!live.entityId ? (
        <EmptyState title="No legal entity chosen" description="The census and valuation are kept per legal entity. Choose one above." />
      ) : !d ? (
        <StateBlock state="loading">{null}</StateBlock>
      ) : (
        <Stepper title="Actuarial valuation" current={step} onCurrentChange={setStep} anyOrder finishLabel="Post provision journal" finishing={busy === 'post'} onFinish={finish} steps={steps} />
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Post ${formatINR(total)} provision journal to accounting?`}
        consequence={postable.map((v) => `${v.kind === 'gratuity' ? 'Gratuity' : 'Leave'} ${money(v.delta)}, dated ${dateText(v.valuedOn)}`).join(' · ')}
        confirmLabel="Post journal"
        onConfirm={async () => {
          for (const v of postable) await live.onPost(v.id);
          toast({ tone: 'success', title: `Provision journal of ${formatINR(total)} posted to accounting.` });
        }}
      />
    </LivePage>
  );
}
