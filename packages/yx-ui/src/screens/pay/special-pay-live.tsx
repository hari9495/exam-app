// PAY-50 special pay home and PAY-31, 32, 34, 35, 36, 37, live: the designed screens (special-pay.tsx, offcycle.tsx)
// with the API's data for /yx/payroll/special-pay. Same tabs, tables, texts and drawers as the designs, without the
// PayFrame (the app shell gives the menu). Every action is checked again by the API (payroll.special.manage, the legal
// entity, maker is not checker, the database pay guard).
import { useEffect, useState } from 'react';
import { Download, Plus, Trash2, Upload } from 'lucide-react';
import { Button, IconButton } from '../../components/button';
import { Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert, Skeleton } from '../../components/feedback';
import { FieldRow, FormField, FormSection, useTooEarly, type FormErrorItem } from '../../components/field';
import { TextField } from '../../components/inputs';
import { Checkbox } from '../../components/choice';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { ConfirmDialog } from '../../components/overlay';
import { useToast } from '../../components/notify';
import { DescriptionList, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { PlainTable } from '../../components/plain-table';
import { DataTable, type TableColumn } from '../../components/table';
import { formatINR } from '../../lib/format';
import { useRun } from '../org/org-kit';
import { LivePage, dateText } from '../time/live/kit';
import { FactRow, FileButton, FormDrawer, SectionTitle } from './pay-kit';
import { onCallPay } from './pay-logic';
import { PersonPicker, type PersonHit } from './live/inputs';
import { EntityPicker } from './live/setup';
import type { LoadState } from './live/types';
import type { SetupEntity } from './live/types-5b';
import type { IncentivePlanView, OncallRuleView, RateCard as RateCardView, SpecialPosting, UnionsView } from './live/types-5i';
import { IncentivePlanScreen, LayoffDrawer, OnCallRulesScreen, PieceRateScreen, SpecialPayHomeBody, TipsPoolScreen, UnionCheckoffScreen, VrsDrawer, type SpecialTab } from './special-pay';
import { Head, monthName } from './settlement-live';
import { SettlementArrearsScreen } from './offcycle';

type Search = (q: string) => Promise<PersonHit[]>;
const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const tableState = (rows: unknown[] | null | undefined) => (rows ? 'ready' : 'loading');

/** GET payroll/special/outputs: one worker's output for one day and operation. */
export interface PieceOutput {
  id: string;
  employeeId: string;
  workDate: string;
  operationCode: string;
  quantity: string;
  source: string;
}
/** GET payroll/special/tip-pools: a pool of the month with its shares and whether it is in payroll. */
export interface TipPoolView {
  id: string;
  locationId: string;
  month: string;
  amount: string;
  method: 'points' | 'hours' | 'shifts';
  paidDirect: boolean;
  posting: SpecialPosting['status'] | null;
  shares: { employeeId: string; basis: string; amount: string }[];
}
/** GET payroll/special/unions/:id/remittance: the union's dues of a month. */
export interface UnionRemittance {
  union: string;
  month: string;
  approved: boolean;
  members: { employeeId: string; amount: string }[];
  total: string;
  /** PAY-36: when the dues were paid to the union (null: not yet). */
  remitted?: { amount: string; paidOn: string; reference: string; recordedBy: string; recordedAt: string } | null;
}
/** GET payroll/special/piece/check: the month's piece pay and minimum-wage top-up per person, before it is sent. */
export interface PieceCheck {
  month: string;
  sent: 'pending' | 'approved' | null;
  people: { employeeId: string; daysWorked: number; minimumDaily: string; earnings: string; minimum: string; topUp: string }[];
  totalTopUp: string;
}

export interface LiveSpecialPay {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  month: string;
  onMonth: (m: string) => void;
  locations: { id: string; name: string }[];
  nameOf: (employeeId: string) => string;
  onSearch: Search;
  postings: SpecialPosting[] | null;
  cards: RateCardView[] | null;
  /** The month's output keyed or imported (PAY-31 Output). */
  outputs?: PieceOutput[] | null;
  plans: IncentivePlanView[] | null;
  /** The month's tip pools (PAY-34). */
  pools?: TipPoolView[] | null;
  unions: UnionsView | null;
  oncallRules: OncallRuleView[] | null;
  onAddCard: (x: { operationCode: string; name: string; unit: string; rate: string; validFrom: string }) => Promise<unknown>;
  onSaveOutput: (x: { employeeId: string; workDate: string; operationCode: string; quantity: string }) => Promise<unknown>;
  onImportOutputs: (file: File) => Promise<unknown>;
  onAddPlan: (x: { name: string; kind: 'production' | 'attendance' | 'sales'; metric: string; targetAmount: string; tiers: { from: number; multiplier: number }[]; capPercent?: string; clawbackDays: number }) => Promise<unknown>;
  onSaveResult: (planId: string, x: { employeeId: string; quota: string; actual: string }) => Promise<unknown>;
  onAddPool: (x: { locationId: string; amount: string; method: 'points' | 'hours' | 'shifts'; paidDirect: boolean; shares: { employeeId: string; basis: string }[] }) => Promise<{ id: string }>;
  onAddRule: (x: { name: string; standbyAmount: string; calloutMinHours: string; calloutRate: string; multiplier: string }) => Promise<unknown>;
  onAddSlot: (x: { ruleId: string; employeeId: string; slotDate: string; calloutHours?: string }) => Promise<unknown>;
  onAddUnion: (x: { name: string; registrationNo?: string }) => Promise<unknown>;
  onAuthorise: (x: { unionId: string; employeeId: string; duesKind: 'fixed' | 'percent'; duesValue: string; validFrom: string }) => Promise<unknown>;
  /** Ends a check-off authorisation from a day (the worker withdrew it). */
  onRevoke?: (authorisationId: string, revokedOn: string) => Promise<unknown>;
  /** A union's dues of the month, for the statement sent with the remittance. */
  onRemittance?: (unionId: string) => Promise<UnionRemittance>;
  /** PAY-36: the union was paid the month's approved dues (the server takes the amount from the check-off). */
  onMarkRemitted?: (unionId: string, x: { paidOn: string; reference: string }) => Promise<unknown>;
  /** PAY-31: the earnings check of the month, before it is sent (nothing is kept). */
  onPieceCheck?: () => Promise<PieceCheck>;
  /** Today in India (yyyy-mm-dd): the latest "paid on" date. */
  today?: string;
  /** PAY-37: a new wage settlement (POST payroll/special/settlements); the page adds the legal entity. */
  onAddSettlement?: (x: import('./settlement-live').NewSettlementInput) => Promise<unknown>;
  onLayoff: (x: { employeeId: string; days: string }) => Promise<unknown>;
  onVrs: (x: { employeeId: string; amount: string; priorExemption: string }) => Promise<unknown>;
  /** Sends the month's sheet of a kind to payroll: piece, oncall, union, layoff, clawbacks; or a plan, pool or settlement by id. */
  onPost: (what: { kind: 'piece' | 'oncall' | 'union' | 'layoff' | 'clawbacks' } | { kind: 'plan' | 'pool' | 'settlement'; id: string }) => Promise<unknown>;
}

/** A primary "Send … to payroll" button that asks first and says done with a toast. */
function SendToPayroll({ label, title, consequence, done, onSend, size }: { label: string; title: string; consequence: string; done: string; onSend: () => Promise<unknown>; size?: 'sm' }) {
  const { toast } = useToast();
  return (
    <ConfirmDialog
      trigger={
        <Button variant={size ? undefined : 'primary'} size={size}>
          {label}
        </Button>
      }
      title={title}
      consequence={consequence}
      confirmLabel="Send to payroll"
      onConfirm={async () => {
        await onSend();
        toast({ tone: 'success', title: done });
      }}
    />
  );
}

/* ================================================================== PAY-50 Special pay home */

const TAB_LABEL: Record<SpecialTab, string> = { home: 'Home', piece: 'Piece-rate', incentives: 'Incentives', tips: 'Tips', oncall: 'On-call', unions: 'Union dues', settlements: 'Settlements' };

export function LiveSpecialPayHome({ live }: { live: LiveSpecialPay }) {
  const [tab, setTab] = useState<SpecialTab>('home');
  const [drawer, setDrawer] = useState<'layoff' | 'vrs' | null>(null);
  return (
    <LivePage
      title="Special pay"
      description="Piece-rate, incentives, tips, on-call, union dues, settlements, lay-off and VRS. Each month's sheet goes to payroll once a payroll approver who did not make it, and is not paid in it, approves it."
      state={live.state}
      onRetry={live.onRetry}
      what="special pay"
      grantedBy="your payroll admin"
    >
      <div className="yx-pay-row">
        <EntityPicker entities={live.entities} value={live.entityId} onChange={live.onEntity} />
        <FormField id="sp-month" label="Pay month">
          <TextField type="month" value={live.month} onChange={(m) => /^\d{4}-\d{2}$/.test(m) && live.onMonth(m)} />
        </FormField>
      </div>
      {!live.entityId ? (
        <EmptyState title="No legal entity chosen" description="Choose one above: special pay is kept per legal entity." />
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as SpecialTab)}>
          <TabsList aria-label="Special pay">
            {(Object.keys(TAB_LABEL) as SpecialTab[]).map((t) => (
              <TabsTrigger key={t} value={t}>
                {TAB_LABEL[t]}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="home">
            {live.postings ? (
              <SpecialPayHomeBody
                month={live.month}
                postings={live.postings}
                nameOf={live.nameOf}
                openType={(t, label) => (
                  <Button size="sm" onClick={() => setTab(t)}>
                    Open {label.toLowerCase()}
                  </Button>
                )}
                onLayoff={() => setDrawer('layoff')}
                onVrs={() => setDrawer('vrs')}
                onSendLayoff={() => live.onPost({ kind: 'layoff' })}
              />
            ) : (
              <div role="status" aria-busy="true" aria-label="Loading special pay sent to payroll">
                <Skeleton height={240} />
              </div>
            )}
          </TabsContent>
          <TabsContent value="piece">
            <PieceRateScreen live={live} />
          </TabsContent>
          <TabsContent value="incentives">
            <IncentivePlanScreen live={live} />
          </TabsContent>
          <TabsContent value="tips">
            <TipsPoolScreen live={live} />
          </TabsContent>
          <TabsContent value="oncall">
            <OnCallRulesScreen live={live} />
          </TabsContent>
          <TabsContent value="unions">
            <UnionCheckoffScreen live={live} />
          </TabsContent>
          <TabsContent value="settlements">
            <SettlementArrearsScreen live={live} />
          </TabsContent>
        </Tabs>
      )}
      {drawer === 'layoff' && <LayoffDrawer month={live.month} onSearch={live.onSearch} onClose={() => setDrawer(null)} onSave={live.onLayoff} />}
      {drawer === 'vrs' && <VrsDrawer month={live.month} onSearch={live.onSearch} onClose={() => setDrawer(null)} onSave={live.onVrs} />}
    </LivePage>
  );
}

/* ================================================================== PAY-31 Piece-rate */

export function LivePieceRate({ live }: { live: LiveSpecialPay }) {
  const { toast } = useToast();
  const [card, setCard] = useState(false);
  const [output, setOutput] = useState(false);
  const { busy, error, run } = useRun();
  const month = monthName(live.month);
  const cardCols: TableColumn<RateCardView>[] = [
    { key: 'op', header: 'Operation', value: (r) => `${r.operationCode} · ${r.name}`, width: 240 },
    { key: 'rate', header: 'Rate', type: 'money', value: (r) => Number(r.rate), render: (r) => `₹${Number(r.rate)} a ${r.unit}`, width: 160 },
    { key: 'from', header: 'Valid from', value: (r) => r.validFrom, render: (r) => dateText(r.validFrom), width: 140 },
    { key: 'to', header: 'Valid to', value: (r) => r.validTo ?? '', render: (r) => (r.validTo ? dateText(r.validTo) : 'Now'), width: 140 },
  ];
  const outCols: TableColumn<PieceOutput>[] = [
    { key: 'who', header: 'Worker', type: 'person', value: (r) => live.nameOf(r.employeeId), person: (r) => ({ name: live.nameOf(r.employeeId) }), width: 220 },
    { key: 'day', header: 'Day', value: (r) => r.workDate, render: (r) => dateText(r.workDate), width: 130 },
    { key: 'op', header: 'Operation', value: (r) => r.operationCode, width: 140 },
    { key: 'qty', header: 'Quantity', type: 'number', value: (r) => Number(r.quantity), total: 'sum', width: 110 },
    { key: 'src', header: 'Source', value: (r) => (r.source === 'import' ? 'Imported' : 'Keyed'), width: 110, optional: true },
  ];
  return (
    <div className="yx-pay-stack">
      <Head
        title="Piece-rate pay"
        description={`Rate cards and output for ${month}. Sending the month adds piece-rate pay and any minimum-wage top-up to payroll.`}
        actions={
          <>
            <FileButton
              label="Import output"
              accept=".csv,text/csv"
              ariaLabel="Import output: employee_code, date, operation, quantity"
              loading={busy === 'imp'}
              onFile={(f) =>
                void run('imp', async () => {
                  await live.onImportOutputs(f);
                  toast({ tone: 'success', title: `Output imported from ${f.name}.` });
                })
              }
            />
            <Button icon={Upload} onClick={() => setOutput(true)}>
              Key output
            </Button>
            <SendToPayroll label={`Send ${month} to payroll`} title={`Send ${month} piece-rate pay to payroll?`} consequence={`Piece-rate pay for every worker with ${month} output, with a named minimum-wage top-up where earnings are below the time-rate minimum. A payroll approver approves it.`} done={`${month} piece-rate pay sent to payroll for approval.`} onSend={() => live.onPost({ kind: 'piece' })} />
          </>
        }
      />
      {error && (
        <InlineAlert tone="danger" title="The import did not go through">
          {error}
        </InlineAlert>
      )}
      <Tabs defaultValue="cards">
        <TabsList aria-label="Piece-rate">
          <TabsTrigger value="cards" count={live.cards?.length}>
            Rate cards
          </TabsTrigger>
          <TabsTrigger value="output">Output</TabsTrigger>
          <TabsTrigger value="check">Earnings check</TabsTrigger>
        </TabsList>
        <TabsContent value="cards">
          <div className="yx-pay-stack">
            <div className="yx-pay-row">
              <Button icon={Plus} onClick={() => setCard(true)}>
                Add rate card
              </Button>
            </div>
            <DataTable label="Rate cards" columns={cardCols} rows={live.cards ?? []} getRowId={(r) => r.id} state={tableState(live.cards)} empty={<EmptyState compact title="No rate cards yet" description="Add the rate per piece for each operation, from a date." />} />
          </div>
        </TabsContent>
        <TabsContent value="output">
          <DataTable label="Output this period" columns={outCols} rows={live.outputs ?? []} getRowId={(r) => r.id} state={tableState(live.outputs)} empty={<EmptyState compact title={`No output for ${month} yet`} description="Key it per worker and day, or import the output file." />} />
        </TabsContent>
        <TabsContent value="check">
          <LivePieceCheck live={live} />
        </TabsContent>
      </Tabs>
      {card && <CardDrawer onClose={() => setCard(false)} onSave={live.onAddCard} />}
      {output && <OutputDrawer cards={live.cards ?? []} onSearch={live.onSearch} onClose={() => setOutput(false)} onSave={live.onSaveOutput} />}
    </div>
  );
}

/** PAY-31 Earnings check, live: what sending the month would pay, with the minimum-wage top-up, read before it is sent. */
function LivePieceCheck({ live }: { live: LiveSpecialPay }) {
  const [data, setData] = useState<PieceCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!live.onPieceCheck) return;
    let on = true;
    setData(null);
    setError(null);
    live.onPieceCheck().then(
      (d) => on && setData(d),
      (e: unknown) => on && setError(e instanceof Error ? e.message : 'The earnings check did not load.'),
    );
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when the entity or month changes, or on Retry
  }, [live.entityId, live.month, tick]);
  if (!live.onPieceCheck)
    return <InlineAlert tone="info">Where piece earnings are below the time-rate minimum wage for the days worked, a named minimum-wage top-up line is added when you send the month.</InlineAlert>;
  type Row = PieceCheck['people'][number];
  const cols: TableColumn<Row>[] = [
    { key: 'n', header: 'Worker', type: 'person', value: (r) => live.nameOf(r.employeeId), person: (r) => ({ name: live.nameOf(r.employeeId) }), width: 220 },
    { key: 'days', header: 'Days worked', type: 'number', value: (r) => r.daysWorked, width: 100 },
    { key: 'earned', header: 'Piece earnings', type: 'money', value: (r) => Number(r.earnings), total: 'sum', width: 130 },
    { key: 'min', header: 'Time-rate minimum', type: 'money', value: (r) => Number(r.minimum), width: 150 },
    { key: 'top', header: 'Minimum-wage top-up', type: 'money', value: (r) => Number(r.topUp), total: 'sum', width: 170 },
    { key: 'total', header: 'Pay', type: 'money', value: (r) => Number(r.earnings) + Number(r.topUp), total: 'sum', width: 120 },
  ];
  const daily = data?.people.find((r) => Number(r.minimumDaily) > 0)?.minimumDaily;
  const exportCheck = () =>
    data &&
    saveFile(
      `piece-rate-check-${data.month}.csv`,
      ['Worker,Days worked,Piece earnings,Time-rate minimum,Minimum-wage top-up,Pay', ...data.people.map((r) => [live.nameOf(r.employeeId), r.daysWorked, r.earnings, r.minimum, r.topUp, (Number(r.earnings) + Number(r.topUp)).toFixed(2)].join(','))].join('\n'),
    );
  return (
    <div className="yx-pay-stack">
      {error ? (
        <InlineAlert tone="danger" title="The earnings check could not be worked out" actions={<Button size="sm" onClick={() => setTick((t) => t + 1)}>Try again</Button>}>
          {error}
        </InlineAlert>
      ) : (
        <InlineAlert tone="info">
          Where piece earnings are below the time-rate minimum wage for days worked, a named minimum-wage top-up line is added.
          {daily ? ` Daily minimum ${formatINR(Number(daily))} at the place of work.` : ''}
          {data?.sent ? ` ${monthName(data.month)} is already sent to payroll (${data.sent === 'approved' ? 'approved' : 'waiting for approval'}).` : ''}
        </InlineAlert>
      )}
      {!error && (
        <DataTable
          label="Piece-rate earnings check"
          columns={cols}
          rows={data?.people ?? []}
          getRowId={(r) => r.employeeId}
          state={data ? 'ready' : 'loading'}
          onExport={data?.people.length ? exportCheck : undefined}
          empty={<EmptyState compact title={`No output for ${monthName(live.month)} yet`} description="Key or import output first; the check works it out from there." />}
        />
      )}
    </div>
  );
}

function CardDrawer({ onClose, onSave }: { onClose: () => void; onSave: LiveSpecialPay['onAddCard'] }) {
  const { toast } = useToast();
  const [x, setX] = useState({ operationCode: '', name: '', unit: 'piece', rate: '', validFrom: '' });
  const errors: FormErrorItem[] = [
    ...(!/^[A-Za-z0-9_-]{1,30}$/.test(x.operationCode) ? [{ fieldId: 'rc-code', message: 'An operation code: letters, digits, _ or -.' }] : []),
    ...(x.name.trim().length < 2 ? [{ fieldId: 'rc-name', message: 'Name the operation.' }] : []),
    ...(!/^\d{1,8}(\.\d{1,4})?$/.test(x.rate) || Number(x.rate) <= 0 ? [{ fieldId: 'rc-rate', message: 'The rate per unit, above zero, like 2.50.' }] : []),
    ...(!x.unit.trim() ? [{ fieldId: 'rc-unit', message: 'The unit, like piece or carton.' }] : []),
    ...(!DAY.test(x.validFrom) ? [{ fieldId: 'rc-from', message: 'The first day it applies.' }] : []),
  ];
  return (
    <FormDrawer
      title="Add rate card"
      subtitle="A new rate from a date ends the operation's earlier rate the day before."
      confirm="Save rate card"
      errors={errors}
      onClose={onClose}
      onSave={async () => {
        await onSave({ ...x, operationCode: x.operationCode.toUpperCase(), name: x.name.trim(), unit: x.unit.trim() });
        toast({ tone: 'success', title: `Rate card for ${x.name.trim()} saved.` });
      }}
    >
      {(errorOf) => (
        <>
          <FieldRow>
            <FormField id="rc-code" label="Operation code" required error={errorOf('rc-code')}>
              <TextField value={x.operationCode} onChange={(operationCode) => setX({ ...x, operationCode })} maxLength={30} />
            </FormField>
            <FormField id="rc-name" label="Operation" required error={errorOf('rc-name')}>
              <TextField value={x.name} onChange={(name) => setX({ ...x, name })} maxLength={120} />
            </FormField>
          </FieldRow>
          <FieldRow>
            <FormField id="rc-rate" label="Rate (₹)" required error={errorOf('rc-rate')}>
              <TextField value={x.rate} onChange={(rate) => setX({ ...x, rate })} inputMode="decimal" />
            </FormField>
            <FormField id="rc-unit" label="Unit" required error={errorOf('rc-unit')} helper="For example, piece or carton.">
              <TextField value={x.unit} onChange={(unit) => setX({ ...x, unit })} maxLength={20} />
            </FormField>
          </FieldRow>
          <FormField id="rc-from" label="Valid from" required error={errorOf('rc-from')}>
            <TextField type="date" value={x.validFrom} onChange={(validFrom) => setX({ ...x, validFrom })} />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}

function OutputDrawer({ cards, onSearch, onClose, onSave }: { cards: RateCardView[]; onSearch: Search; onClose: () => void; onSave: LiveSpecialPay['onSaveOutput'] }) {
  const { toast } = useToast();
  const [who, setWho] = useState<PersonHit | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [qty, setQty] = useState('');
  const ops = [...new Set(cards.map((c) => c.operationCode))];
  const errors: FormErrorItem[] = [
    ...(!who ? [{ fieldId: 'po-who', message: 'Choose the worker.' }] : []),
    ...(!op ? [{ fieldId: 'po-op', message: ops.length ? 'Choose the operation.' : 'Add a rate card first: output is paid by its operation.' }] : []),
    ...(!DAY.test(date) ? [{ fieldId: 'po-date', message: 'The day of the work.' }] : []),
    ...(!/^\d{1,9}(\.\d{1,3})?$/.test(qty) || Number(qty) <= 0 ? [{ fieldId: 'po-qty', message: 'The quantity, above zero.' }] : []),
  ];
  return (
    <FormDrawer
      title="Key output"
      subtitle="One worker, day and operation; keying it again replaces it."
      confirm="Save output"
      errors={errors}
      onClose={onClose}
      onSave={async () => {
        await onSave({ employeeId: who!.id, workDate: date, operationCode: op!, quantity: qty });
        toast({ tone: 'success', title: `Output saved for ${who!.name}.` });
      }}
    >
      {(errorOf) => (
        <>
          <PersonPicker id="po-who" label="Worker" value={who} onChange={setWho} onSearch={onSearch} error={errorOf('po-who')} />
          <FormField id="po-op" label="Operation" required error={errorOf('po-op')}>
            <Select value={op} onChange={setOp} placeholder="Choose the operation" options={ops.map((o) => ({ value: o, label: o }))} />
          </FormField>
          <FieldRow>
            <FormField id="po-date" label="Day" required error={errorOf('po-date')}>
              <TextField type="date" value={date} onChange={setDate} />
            </FormField>
            <FormField id="po-qty" label="Quantity" required error={errorOf('po-qty')}>
              <TextField value={qty} onChange={setQty} inputMode="decimal" />
            </FormField>
          </FieldRow>
        </>
      )}
    </FormDrawer>
  );
}

/* ================================================================== PAY-32 Incentive plans */

type Tier = { from: number; multiplier: number };
/** The API's incentive rule (payroll/special.ts): each band pays target × (its width in % of quota ÷ 100) × its multiplier; the cap is a % of the target. */
export function incentivePay(target: number, tiers: Tier[], capPercent: number | null, attainment: number) {
  const pay = tiers.reduce((t, x, i) => t + (target * Math.max(0, Math.min(attainment, tiers[i + 1]?.from ?? Infinity) - x.from)) / 100 * x.multiplier, 0);
  const cap = capPercent != null ? (target * capPercent) / 100 : null;
  return cap != null && pay > cap ? { amount: Math.round(cap), capped: true } : { amount: Math.round(pay), capped: false };
}
const tierText = (t: Tier[]) => t.map((x) => `from ${x.from} % × ${x.multiplier}`).join(', ');
const KIND_LABEL: Record<IncentivePlanView['kind'], string> = { sales: 'Sales commission', production: 'Production', attendance: 'Attendance' };

export function LiveIncentivePlans({ live }: { live: LiveSpecialPay }) {
  const [adding, setAdding] = useState(false);
  const [result, setResult] = useState<IncentivePlanView | null>(null);
  const month = monthName(live.month);
  const cols: TableColumn<IncentivePlanView>[] = [
    { key: 'plan', header: 'Plan', value: (p) => p.name, render: (p) => <div>{p.name}<p className="yx-pay-note">{KIND_LABEL[p.kind]} · {p.metric}</p></div>, width: 240 },
    { key: 'target', header: 'Target pay at 100 %', type: 'money', value: (p) => Number(p.targetAmount), width: 150 },
    { key: 'tiers', header: 'Tiers', value: (p) => tierText(p.tiers), width: 220, optional: true },
    { key: 'cap', header: 'Cap', value: (p) => p.capPercent ?? '', render: (p) => (p.capPercent ? `${Number(p.capPercent)} % of target` : 'No cap'), width: 130, optional: true },
    { key: 'claw', header: 'Clawback window', value: (p) => p.clawbackDays, render: (p) => `${p.clawbackDays} days`, width: 130, optional: true },
    { key: 'status', header: 'Status', type: 'status', value: (p) => (p.status === 'active' ? 'Published' : p.status), statusTone: (v) => (v === 'Published' ? 'success' : 'neutral'), width: 110 },
  ];
  return (
    <div className="yx-pay-stack">
      <Head
        title="Incentive plans"
        description={`Targets, tiers, accelerators, caps and clawback. Results of ${month} are approved in payroll and paid as one-time pay.`}
        actions={
          <>
            <SendToPayroll label={`Send ${month} clawbacks`} title={`Send ${month} clawbacks to payroll?`} consequence="Commission taken back for cancelled or unpaid orders inside the clawback window is deducted in payroll, up to the monthly deduction limit." done={`${month} clawbacks sent to payroll for approval.`} onSend={() => live.onPost({ kind: 'clawbacks' })} size="sm" />
            <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
              New plan
            </Button>
          </>
        }
      />
      <DataTable
        label="Incentive plans"
        columns={cols}
        rows={live.plans ?? []}
        getRowId={(p) => p.id}
        state={tableState(live.plans)}
        empty={<EmptyState compact title="No incentive plans yet" description="A plan pays a target amount by attainment of the quota, with tiers and a cap." action={<Button onClick={() => setAdding(true)}>New plan</Button>} />}
        rowButtons={(p) => (
          <>
            <Button size="sm" onClick={() => setResult(p)}>
              Add a result
            </Button>
            <SendToPayroll label="Send month" title={`Send ${p.name} results for ${month}?`} consequence={`Every ${month} result of the plan goes to payroll as one-time pay, for a payroll approver to approve.`} done={`${p.name} results for ${month} sent to payroll for approval.`} onSend={() => live.onPost({ kind: 'plan', id: p.id })} size="sm" />
          </>
        )}
      />
      {adding && <PlanDrawer onClose={() => setAdding(false)} onSave={live.onAddPlan} />}
      {result && <ResultDrawer plan={result} month={month} onSearch={live.onSearch} onClose={() => setResult(null)} onSave={(x) => live.onSaveResult(result.id, x)} />}
    </div>
  );
}

function PlanDrawer({ onClose, onSave }: { onClose: () => void; onSave: LiveSpecialPay['onAddPlan'] }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<IncentivePlanView['kind']>('sales');
  const [metric, setMetric] = useState('');
  const [target, setTarget] = useState('');
  const [tiers, setTiers] = useState<{ from: string; multiplier: string }[]>([
    { from: '0', multiplier: '1' },
    { from: '100', multiplier: '1.5' },
  ]);
  const [cap, setCap] = useState('');
  const [claw, setClaw] = useState('90');
  const [achieved, setAchieved] = useState('110');
  const tierErr = tiers.findIndex((t, i) => !/^\d{1,4}$/.test(t.from) || !/^\d(\.\d{1,2})?$/.test(t.multiplier) || (i === 0 ? Number(t.from) !== 0 : Number(t.from) <= Number(tiers[i - 1].from)));
  const errors: FormErrorItem[] = [
    ...(name.trim().length < 2 ? [{ fieldId: 'pl-name', message: 'Name the plan.' }] : []),
    ...(metric.trim().length < 2 ? [{ fieldId: 'pl-metric', message: 'What is measured: sales value, pieces, days.' }] : []),
    ...(!MONEY.test(target) || Number(target) <= 0 ? [{ fieldId: 'pl-target', message: 'The pay at 100 % of quota, above zero.' }] : []),
    ...(tierErr >= 0 ? [{ fieldId: `pl-tier-${tierErr}`, message: tierErr === 0 ? 'Tier 1 starts at 0 % with a multiplier like 1 (0 makes it a threshold).' : `Tier ${tierErr + 1} must start above tier ${tierErr}, with a multiplier like 1.5.` }] : []),
    ...(cap && !/^\d{1,4}$/.test(cap) ? [{ fieldId: 'pl-cap', message: 'The cap as a whole per cent of the target, like 200.' }] : []),
    ...(!/^\d{1,3}$/.test(claw) || Number(claw) > 365 ? [{ fieldId: 'pl-claw', message: 'Days from 0 to 365.' }] : []),
  ];
  const parsed = tiers.map((t) => ({ from: Number(t.from), multiplier: Number(t.multiplier) }));
  const preview = tierErr < 0 && Number(target) > 0 ? incentivePay(Number(target), parsed, cap ? Number(cap) : null, Number(achieved) || 0) : null;
  const setTier = (i: number, patch: Partial<{ from: string; multiplier: string }>) => setTiers((ts) => ts.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <FormDrawer
      title="New incentive plan"
      subtitle="Results are calculated with these tiers and paid as one-time pay once a payroll approver approves the month."
      confirm="Publish plan"
      errors={errors}
      onClose={onClose}
      onSave={async () => {
        await onSave({ name: name.trim(), kind, metric: metric.trim(), targetAmount: target, tiers: parsed, ...(cap ? { capPercent: cap } : {}), clawbackDays: Number(claw) });
        toast({ tone: 'success', title: `${name.trim()} published.` });
      }}
    >
      {(errorOf) => (
        <>
          <FormSection title="Plan">
            <FormField id="pl-name" label="Name" required error={errorOf('pl-name')}>
              <TextField value={name} onChange={setName} maxLength={200} />
            </FormField>
            <FormField id="pl-kind" label="Kind">
              <Segment label="Kind" value={kind} onChange={setKind} options={(Object.keys(KIND_LABEL) as IncentivePlanView['kind'][]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
            </FormField>
            <FormField id="pl-metric" label="Measured on" required error={errorOf('pl-metric')}>
              <TextField value={metric} onChange={setMetric} maxLength={80} />
            </FormField>
          </FormSection>
          <FormSection title="Quota and tiers">
            <FormField id="pl-target" label="Target pay at 100 % of quota (₹)" required error={errorOf('pl-target')}>
              <TextField value={target} onChange={setTarget} inputMode="decimal" />
            </FormField>
            <PlainTable
              label="Quota and tiers"
              rows={tiers.map((_, i) => i)}
              getRowId={String}
              rowTone={(i) => (tierErr === i ? { tone: 'danger', label: 'Error' } : undefined)}
              columns={[
                { key: 'tier', header: 'Tier', rowHeader: true, cell: (i) => `Tier ${i + 1}${Number(tiers[i]!.from) >= 100 ? ' (accelerator)' : ''}` },
                {
                  key: 'from',
                  header: 'From % of quota',
                  cell: (i) => <TextField id={`pl-tier-${i}`} size="sm" aria-label={`Tier ${i + 1} starts at`} value={tiers[i]!.from} onChange={(from) => setTier(i, { from })} inputMode="numeric" suffix="%" />,
                },
                {
                  key: 'mult',
                  header: 'Multiplier',
                  cell: (i) => <TextField size="sm" aria-label={`Tier ${i + 1} multiplier`} value={tiers[i]!.multiplier} onChange={(multiplier) => setTier(i, { multiplier })} inputMode="decimal" suffix="×" />,
                },
                { key: 'rm', header: <span className="yx-visually-hidden">Remove</span>, cell: (i) => i > 0 && <IconButton icon={Trash2} label={`Remove tier ${i + 1}`} size="sm" onClick={() => setTiers((ts) => ts.filter((_, j) => j !== i))} /> },
              ]}
            />
            {tierErr >= 0 && errorOf(`pl-tier-${tierErr}`) && <p className="yx-pay-note" role="alert">{errorOf(`pl-tier-${tierErr}`)}</p>}
            <Button size="sm" icon={Plus} onClick={() => setTiers((ts) => [...ts, { from: String((Number(ts[ts.length - 1]?.from) || 0) + 25), multiplier: ts[ts.length - 1]?.multiplier ?? '1' }])}>
              Add tier
            </Button>
          </FormSection>
          <FormSection title="Cap and clawback">
            <FieldRow>
              <FormField id="pl-cap" label="Cap (% of target)" optional error={errorOf('pl-cap')}>
                <TextField value={cap} onChange={setCap} inputMode="numeric" suffix="%" />
              </FormField>
              <FormField id="pl-claw" label="Clawback window" required error={errorOf('pl-claw')} helper="Commission on an order cancelled or unpaid in this window is taken back from later payslips.">
                <TextField value={claw} onChange={setClaw} inputMode="numeric" suffix="days" />
              </FormField>
            </FieldRow>
          </FormSection>
          <aside className="yx-pay-panel" aria-label="Try it">
            <SectionTitle>Try it</SectionTitle>
            <FormField id="pl-try" label="Attainment (% of quota)">
              <TextField value={achieved} onChange={setAchieved} inputMode="decimal" suffix="%" />
            </FormField>
            <FactRow items={[{ label: 'Pay', value: preview ? formatINR(preview.amount) : '—' }]} />
            {preview?.capped && <Badge tone="warning">Capped at {cap} % of target</Badge>}
            {!preview && <p className="yx-pay-muted">Enter the target and the tiers to see a result.</p>}
          </aside>
        </>
      )}
    </FormDrawer>
  );
}

function ResultDrawer({ plan, month, onSearch, onClose, onSave }: { plan: IncentivePlanView; month: string; onSearch: Search; onClose: () => void; onSave: (x: { employeeId: string; quota: string; actual: string }) => Promise<unknown> }) {
  const { toast } = useToast();
  const [who, setWho] = useState<PersonHit | null>(null);
  const [quota, setQuota] = useState('');
  const [actual, setActual] = useState('');
  const errors: FormErrorItem[] = [...(!who ? [{ fieldId: 'ir-who', message: 'Choose the person.' }] : []), ...(!MONEY.test(quota) || Number(quota) <= 0 ? [{ fieldId: 'ir-quota', message: 'The quota, above zero.' }] : []), ...(!MONEY.test(actual) ? [{ fieldId: 'ir-actual', message: 'What they achieved, 0 or more.' }] : [])];
  const preview = who && Number(quota) > 0 && MONEY.test(actual) ? incentivePay(Number(plan.targetAmount), plan.tiers, plan.capPercent ? Number(plan.capPercent) : null, (Number(actual) / Number(quota)) * 100) : null;
  return (
    <FormDrawer
      title={`Result for ${plan.name}`}
      subtitle={`${month}. Saving the same person again replaces the result.`}
      confirm="Save result"
      errors={errors}
      onClose={onClose}
      onSave={async () => {
        await onSave({ employeeId: who!.id, quota, actual });
        toast({ tone: 'success', title: `Result saved for ${who!.name}.` });
      }}
    >
      {(errorOf) => (
        <>
          <PersonPicker id="ir-who" label="Person" value={who} onChange={setWho} onSearch={onSearch} error={errorOf('ir-who')} />
          <FieldRow>
            <FormField id="ir-quota" label="Quota" required error={errorOf('ir-quota')}>
              <TextField value={quota} onChange={setQuota} inputMode="decimal" />
            </FormField>
            <FormField id="ir-actual" label="Achieved" required error={errorOf('ir-actual')}>
              <TextField value={actual} onChange={setActual} inputMode="decimal" />
            </FormField>
          </FieldRow>
          {preview && <FactRow items={[{ label: 'Attainment', value: `${Math.round((Number(actual) / Number(quota)) * 10000) / 100} %` }, { label: 'Pay', value: formatINR(preview.amount) }]} />}
        </>
      )}
    </FormDrawer>
  );
}

/* ================================================================== PAY-34 Tips pool */

const BASIS_LABEL: Record<TipPoolView['method'], string> = { points: 'Points', hours: 'Hours', shifts: 'Shifts' };
const poolStatus = (p: TipPoolView) => (p.paidDirect ? 'Record only' : p.posting === 'approved' ? 'In payroll' : p.posting === 'pending' ? 'Waiting for approval' : 'Not sent');

export function LiveTipsPool({ live }: { live: LiveSpecialPay }) {
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = live.pools?.find((p) => p.id === openId) ?? null;
  const month = monthName(live.month);
  const outlet = (id: string) => live.locations.find((l) => l.id === id)?.name ?? 'Outlet';
  const newPool = (
    <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
      New pool
    </Button>
  );
  const cols: TableColumn<TipPoolView>[] = [
    { key: 'outlet', header: 'Outlet', value: (p) => outlet(p.locationId), width: 200 },
    { key: 'period', header: 'Period', value: (p) => monthName(p.month), width: 140 },
    { key: 'collected', header: 'Collected', type: 'money', value: (p) => Number(p.amount), width: 120 },
    { key: 'basis', header: 'Basis', value: (p) => BASIS_LABEL[p.method], width: 100, optional: true },
    { key: 'people', header: 'People', type: 'number', value: (p) => p.shares.length, width: 90, optional: true },
    { key: 'status', header: 'Status', type: 'status', value: poolStatus, statusTone: (v) => (v === 'In payroll' ? 'success' : v === 'Waiting for approval' ? 'warning' : v === 'Record only' ? 'neutral' : 'info'), width: 170 },
  ];
  return (
    <div className="yx-pay-stack">
      <Head title="Tips and service charge" description="Pools per outlet and month. Amounts paid through payroll are a named line; tips paid directly by customers are recorded for statements only." actions={newPool} />
      <DataTable
        label="Tip pools"
        columns={cols}
        rows={live.pools ?? []}
        getRowId={(p) => p.id}
        state={tableState(live.pools)}
        activeRowId={openId}
        empty={<EmptyState compact title={`No tip pools for ${month} yet`} description="Create a pool for an outlet with the amount and each person's points, hours or shifts." action={<Button onClick={() => setCreating(true)}>New pool</Button>} />}
        rowButtons={(p) => (
          <Button size="sm" onClick={() => setOpenId(p.id)}>
            Open pool
          </Button>
        )}
      />
      <Drawer
        open={!!open}
        onOpenChange={(o) => !o && setOpenId(null)}
        title={open ? `${outlet(open.locationId)} · ${monthName(open.month)}` : ''}
        size="lg"
        footer={
          open && (
            <>
              <Button onClick={() => setOpenId(null)}>Close</Button>
              {!open.paidDirect && !open.posting && <SendToPayroll label="Send to payroll" title={`Send ${outlet(open.locationId)} tips to payroll?`} consequence={`${formatINR(Number(open.amount))} split across ${open.shares.length} people on the ${BASIS_LABEL[open.method].toLowerCase()} basis is added as a named tips line. The basis can't be changed after this.`} done={`${outlet(open.locationId)} tips sent to payroll for approval.`} onSend={() => live.onPost({ kind: 'pool', id: open.id })} />}
            </>
          )
        }
      >
        {open && (
          <div className="yx-pay-stack">
            <FactRow items={[{ label: open.paidDirect ? 'Paid directly by customers (record only)' : 'Collected through payroll', value: formatINR(Number(open.amount)) }, { label: 'Distribution basis', value: BASIS_LABEL[open.method] }, { label: 'Status', value: poolStatus(open) }]} />
            <PlainTable
              label="Shares"
              rows={open.shares}
              getRowId={(s) => s.employeeId}
              columns={[
                { key: 'who', header: 'Person', rowHeader: true, cell: (s) => live.nameOf(s.employeeId) },
                { key: 'basis', header: BASIS_LABEL[open.method], num: true, cell: (s) => Number(s.basis) },
                { key: 'share', header: 'Share', num: true, cell: (s) => formatINR(Number(s.amount)) },
              ]}
              footer={[{ id: 'total', label: 'Total', cells: { share: formatINR(open.shares.reduce((a, s) => a + Number(s.amount), 0)) } }]}
            />
            <p className="yx-pay-note">Treatment in payroll (PF, ESI, tax) follows the central statutory rules for tips paid through payroll.</p>
          </div>
        )}
      </Drawer>
      {creating && (
        <PoolDrawer
          month={month}
          locations={live.locations}
          onSearch={live.onSearch}
          onClose={() => setCreating(false)}
          onSave={async (x) => {
            const pool = await live.onAddPool(x);
            if (!x.paidDirect) await live.onPost({ kind: 'pool', id: pool.id });
          }}
        />
      )}
    </div>
  );
}

function PoolDrawer({ month, locations, onSearch, onClose, onSave }: { month: string; locations: { id: string; name: string }[]; onSearch: Search; onClose: () => void; onSave: (x: Parameters<LiveSpecialPay['onAddPool']>[0]) => Promise<unknown> }) {
  const { toast } = useToast();
  const [loc, setLoc] = useState<string | null>(locations[0]?.id ?? null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<TipPoolView['method']>('hours');
  const [direct, setDirect] = useState(false);
  const [rows, setRows] = useState<{ who: PersonHit | null; basis: string }[]>([{ who: null, basis: '' }]);
  const bad = rows.findIndex((r) => !r.who || !/^\d{1,8}(\.\d{1,2})?$/.test(r.basis) || Number(r.basis) <= 0);
  const errors: FormErrorItem[] = [
    ...(!loc ? [{ fieldId: 'tp-loc', message: locations.length ? 'Choose the outlet.' : 'This legal entity has no locations: add one in Org first.' }] : []),
    ...(!MONEY.test(amount) || Number(amount) <= 0 ? [{ fieldId: 'tp-amount', message: 'The amount in the pool, above zero.' }] : []),
    ...(bad >= 0 ? [{ fieldId: `tp-basis-${bad}`, message: `Person ${bad + 1}: choose them and enter their ${BASIS_LABEL[method].toLowerCase()}.` }] : []),
  ];
  return (
    <FormDrawer
      title={`New tip pool · ${month}`}
      subtitle={direct ? 'Recorded for statements only; nothing is paid through payroll.' : 'Shared at once, then sent to payroll for approval.'}
      confirm={direct ? 'Record pool' : 'Create and send'}
      errors={errors}
      onClose={onClose}
      onSave={async () => {
        await onSave({ locationId: loc!, amount, method, paidDirect: direct, shares: rows.map((r) => ({ employeeId: r.who!.id, basis: r.basis })) });
        toast({ tone: 'success', title: direct ? 'Tip pool recorded.' : 'Tip pool created and sent to payroll for approval.' });
      }}
    >
      {(errorOf) => (
        <>
          <FieldRow>
            <FormField id="tp-loc" label="Outlet" required error={errorOf('tp-loc')}>
              <Select value={loc} onChange={setLoc} options={locations.map((l) => ({ value: l.id, label: l.name }))} />
            </FormField>
            <FormField id="tp-amount" label="Amount (₹)" required error={errorOf('tp-amount')}>
              <TextField value={amount} onChange={setAmount} inputMode="decimal" />
            </FormField>
          </FieldRow>
          <FormField id="tp-method" label="Distribution basis">
            <Segment label="Distribution basis" value={method} onChange={setMethod} options={(Object.keys(BASIS_LABEL) as TipPoolView['method'][]).map((k) => ({ value: k, label: BASIS_LABEL[k] }))} />
          </FormField>
          <Checkbox label="Paid by customers directly (record only)" checked={direct} onChange={setDirect} />
          {rows.map((r, i) => (
            <FieldRow key={i}>
              <PersonPicker id={`tp-who-${i}`} label={`Person ${i + 1}`} value={r.who} onChange={(who) => setRows(rows.map((x, j) => (j === i ? { ...x, who } : x)))} onSearch={onSearch} />
              <FormField id={`tp-basis-${i}`} label={BASIS_LABEL[method]} required error={errorOf(`tp-basis-${i}`)}>
                <TextField value={r.basis} onChange={(basis) => setRows(rows.map((x, j) => (j === i ? { ...x, basis } : x)))} inputMode="decimal" />
              </FormField>
            </FieldRow>
          ))}
          <div className="yx-pay-row">
            <Button size="sm" icon={Plus} onClick={() => setRows([...rows, { who: null, basis: '' }])}>
              Add a person
            </Button>
            {rows.length > 1 && (
              <Button size="sm" icon={Trash2} onClick={() => setRows(rows.slice(0, -1))}>
                Remove the last person
              </Button>
            )}
          </div>
        </>
      )}
    </FormDrawer>
  );
}

/* ================================================================== PAY-35 On-call and standby */

export function LiveOnCallRules({ live }: { live: LiveSpecialPay }) {
  const [rule, setRule] = useState(false);
  const [slot, setSlot] = useState(false);
  const [exampleId, setExampleId] = useState<string | null>(null);
  const [hours, setHours] = useState('1');
  const month = monthName(live.month);
  const rules = live.oncallRules;
  const row = rules?.find((r) => r.id === exampleId) ?? rules?.[0];
  const actual = Number(hours) || 0;
  const ex = row ? onCallPay(Number(row.standbyAmount), actual, Number(row.calloutMinHours), Number(row.calloutRate), Number(row.multiplier)) : null;
  const cols: TableColumn<OncallRuleView>[] = [
    { key: 'name', header: 'Rule', value: (r) => r.name, width: 220 },
    { key: 'standby', header: 'Standby pay', type: 'money', value: (r) => Number(r.standbyAmount), render: (r) => `${formatINR(Number(r.standbyAmount))} a slot`, width: 140 },
    { key: 'rate', header: 'Call-out rate', type: 'money', value: (r) => Number(r.calloutRate), render: (r) => `${formatINR(Number(r.calloutRate))}/h`, width: 130 },
    { key: 'min', header: 'Minimum', type: 'number', value: (r) => Number(r.calloutMinHours), render: (r) => `${Number(r.calloutMinHours)} h paid`, width: 110 },
    { key: 'mult', header: 'Multiplier', type: 'number', value: (r) => Number(r.multiplier), render: (r) => `${Number(r.multiplier)}×`, width: 100 },
  ];
  return (
    <div className="yx-pay-stack">
      <Head
        title="On-call and standby pay"
        description="Pay for people on standby and for each call-out: a standby allowance a slot, and each call-out paid for at least the minimum hours."
        actions={
          <>
            <Button icon={Plus} onClick={() => setRule(true)}>
              Add rule
            </Button>
            {!!rules?.length && <Button onClick={() => setSlot(true)}>Record a slot</Button>}
            <SendToPayroll label={`Send ${month} to payroll`} title={`Send ${month} on-call pay to payroll?`} consequence={`Standby and call-out pay for every slot recorded in ${month}, for a payroll approver to approve.`} done={`${month} on-call pay sent to payroll for approval.`} onSend={() => live.onPost({ kind: 'oncall' })} />
          </>
        }
      />
      {rules && !rules.length ? (
        <EmptyState title="No on-call rules yet" description="Add a rule with the standby allowance, the call-out rate and the minimum paid hours." action={<Button onClick={() => setRule(true)}>Add rule</Button>} />
      ) : (
        <div className="yx-pay-split">
          <DataTable label="On-call pay per rule" columns={cols} rows={rules ?? []} getRowId={(r) => r.id} state={tableState(rules)} />
          {row && ex && (
            <aside className="yx-pay-panel" aria-label="Worked example">
              <SectionTitle>Worked example</SectionTitle>
              <FormField id="oc-ex-rule" label="Rule">
                <Select value={row.id} onChange={(v) => v && setExampleId(v)} options={(rules ?? []).map((r) => ({ value: r.id, label: r.name }))} />
              </FormField>
              <FormField id="oc-ex-hours" label="Actual call-out hours">
                <TextField value={hours} onChange={setHours} inputMode="decimal" />
              </FormField>
              <DescriptionList
                items={[
                  { label: 'Paid hours', value: actual > 0 ? `${ex.paidHours} h (minimum ${Number(row.calloutMinHours)} h)` : '0 h (not called out)' },
                  { label: 'Call-out', value: `${formatINR(ex.callOut)} · ${ex.paidHours} h × ${formatINR(Number(row.calloutRate))} × ${Number(row.multiplier)}` },
                  { label: 'Standby', value: formatINR(Number(row.standbyAmount)) },
                  { label: 'Total for the slot', value: formatINR(ex.total) },
                ]}
              />
            </aside>
          )}
        </div>
      )}
      {rule && <RuleDrawer onClose={() => setRule(false)} onSave={live.onAddRule} />}
      {slot && rules && <SlotDrawer rules={rules} onSearch={live.onSearch} onClose={() => setSlot(false)} onSave={live.onAddSlot} />}
    </div>
  );
}

function RuleDrawer({ onClose, onSave }: { onClose: () => void; onSave: LiveSpecialPay['onAddRule'] }) {
  const { toast } = useToast();
  const [x, setX] = useState({ name: '', standbyAmount: '', calloutMinHours: '3', calloutRate: '', multiplier: '1.5' });
  const errors: FormErrorItem[] = [
    ...(x.name.trim().length < 2 ? [{ fieldId: 'oc-name', message: 'Name the rule.' }] : []),
    ...(!MONEY.test(x.standbyAmount) ? [{ fieldId: 'oc-standby', message: 'The standby allowance a slot, 0 or more.' }] : []),
    ...(!/^\d{1,2}(\.\d{1,2})?$/.test(x.calloutMinHours) || Number(x.calloutMinHours) <= 0 ? [{ fieldId: 'oc-min', message: 'The minimum paid hours of a call-out, like 3.' }] : []),
    ...(!MONEY.test(x.calloutRate) || Number(x.calloutRate) <= 0 ? [{ fieldId: 'oc-rate', message: 'The call-out rate an hour, above zero.' }] : []),
    ...(!/^\d(\.\d{1,2})?$/.test(x.multiplier) || Number(x.multiplier) < 1 ? [{ fieldId: 'oc-mult', message: 'The multiplier, at least 1.' }] : []),
  ];
  return (
    <FormDrawer
      title="Add on-call rule"
      confirm="Save rule"
      errors={errors}
      onClose={onClose}
      onSave={async () => {
        await onSave({ ...x, name: x.name.trim() });
        toast({ tone: 'success', title: `On-call rule ${x.name.trim()} saved.` });
      }}
    >
      {(errorOf) => (
        <>
          <FormField id="oc-name" label="Name" required error={errorOf('oc-name')}>
            <TextField value={x.name} onChange={(name) => setX({ ...x, name })} maxLength={120} />
          </FormField>
          <FieldRow>
            <FormField id="oc-standby" label="Standby pay per slot (₹)" required error={errorOf('oc-standby')}>
              <TextField value={x.standbyAmount} onChange={(standbyAmount) => setX({ ...x, standbyAmount })} inputMode="decimal" />
            </FormField>
            <FormField id="oc-rate" label="Call-out hourly rate (₹)" required error={errorOf('oc-rate')}>
              <TextField value={x.calloutRate} onChange={(calloutRate) => setX({ ...x, calloutRate })} inputMode="decimal" />
            </FormField>
          </FieldRow>
          <FieldRow>
            <FormField id="oc-min" label="Minimum paid hours" required error={errorOf('oc-min')}>
              <TextField value={x.calloutMinHours} onChange={(calloutMinHours) => setX({ ...x, calloutMinHours })} inputMode="decimal" suffix="h" />
            </FormField>
            <FormField id="oc-mult" label="Multiplier" required error={errorOf('oc-mult')}>
              <TextField value={x.multiplier} onChange={(multiplier) => setX({ ...x, multiplier })} inputMode="decimal" suffix="×" />
            </FormField>
          </FieldRow>
        </>
      )}
    </FormDrawer>
  );
}

function SlotDrawer({ rules, onSearch, onClose, onSave }: { rules: OncallRuleView[]; onSearch: Search; onClose: () => void; onSave: LiveSpecialPay['onAddSlot'] }) {
  const { toast } = useToast();
  const [rule, setRule] = useState<string | null>(rules[0]?.id ?? null);
  const [who, setWho] = useState<PersonHit | null>(null);
  const [date, setDate] = useState('');
  const [hours, setHours] = useState('');
  const errors: FormErrorItem[] = [...(!who ? [{ fieldId: 'sl-who', message: 'Choose the person.' }] : []), ...(!DAY.test(date) ? [{ fieldId: 'sl-date', message: 'The day of the slot.' }] : []), ...(hours && !/^\d{1,2}(\.\d{1,2})?$/.test(hours) ? [{ fieldId: 'sl-hours', message: 'Hours worked on the call-out, like 2.5.' }] : [])];
  return (
    <FormDrawer
      title="Record an on-call slot"
      subtitle="Leave the hours empty when nobody was called out."
      confirm="Save slot"
      errors={errors}
      onClose={onClose}
      onSave={async () => {
        await onSave({ ruleId: rule!, employeeId: who!.id, slotDate: date, ...(hours ? { calloutHours: hours } : {}) });
        toast({ tone: 'success', title: `On-call slot saved for ${who!.name}.` });
      }}
    >
      {(errorOf) => (
        <>
          <FormField id="sl-rule" label="Rule">
            <Select value={rule} onChange={setRule} options={rules.map((r) => ({ value: r.id, label: r.name }))} />
          </FormField>
          <PersonPicker id="sl-who" label="Person" value={who} onChange={setWho} onSearch={onSearch} error={errorOf('sl-who')} />
          <FieldRow>
            <FormField id="sl-date" label="Day" required error={errorOf('sl-date')}>
              <TextField type="date" value={date} onChange={setDate} />
            </FormField>
            <FormField id="sl-hours" label="Call-out hours" optional error={errorOf('sl-hours')}>
              <TextField value={hours} onChange={setHours} inputMode="decimal" />
            </FormField>
          </FieldRow>
        </>
      )}
    </FormDrawer>
  );
}

/* ================================================================== PAY-36 Union check-off */

type Auth = UnionsView['authorisations'][number];
const monthEnd = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
const duesText = (a: Auth) => (a.duesKind === 'fixed' ? `${formatINR(Number(a.duesValue))} a month` : `${Number(a.duesValue)} % of basic and DA`);
/** Saves a text file in the browser (the union statement). */
function saveFile(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** PAY-36 Remittance, live: each union's approved dues for the month, its statement, and "Mark remitted" once paid. */
function LiveRemittance({ live, unions, onStatement }: { live: LiveSpecialPay; unions: UnionsView['unions'] | null; onStatement: (r: UnionRemittance) => void }) {
  const { toast } = useToast();
  const { busy, run } = useRun();
  const month = monthName(live.month);
  const [rows, setRows] = useState<Record<string, UnionRemittance | 'error'>>({});
  const [tick, setTick] = useState(0);
  const [marking, setMarking] = useState<{ union: UnionsView['unions'][number]; paidOn: string; reference: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const today = live.today ?? new Date().toISOString().slice(0, 10);
  useEffect(() => {
    if (!unions || !live.onRemittance) return;
    let on = true;
    setRows({});
    for (const x of unions)
      live.onRemittance(x.id).then(
        (r) => on && setRows((m) => ({ ...m, [x.id]: r })),
        () => on && setRows((m) => ({ ...m, [x.id]: 'error' })),
      );
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload per month, entity, union list or after marking
  }, [unions, live.month, live.entityId, tick]);
  const errors: FormErrorItem[] = marking
    ? [
        ...(!DAY.test(marking.paidOn) ? [{ fieldId: 'rm-on', message: 'Enter the date it was paid.' }] : marking.paidOn > today ? [{ fieldId: 'rm-on', message: 'The date it was paid cannot be in the future.' }] : marking.paidOn < `${live.month}-01` ? [{ fieldId: 'rm-on', message: `Dues for ${month} are paid on or after 1 ${month}.` }] : []),
        ...(marking.reference.trim().length < 3 ? [{ fieldId: 'rm-ref', message: 'Enter the payment reference.' }] : !/^[\w\-/. ]+$/.test(marking.reference.trim()) ? [{ fieldId: 'rm-ref', message: 'Use letters, digits, spaces and - / . only.' }] : []),
      ]
    : [];
  const early = useTooEarly(errors);
  type U = UnionsView['unions'][number];
  const st = (x: U) => rows[x.id];
  const cols: TableColumn<U>[] = [
    { key: 'union', header: 'Union', value: (x) => x.name, render: (x) => <div>{x.name}{x.registrationNo && <p className="yx-pay-note">{x.registrationNo}</p>}</div>, width: 220 },
    { key: 'members', header: 'Members', type: 'number', value: (x) => x.members, total: 'sum', width: 100 },
    { key: 'total', header: 'Amount', type: 'money', value: (x) => { const r = st(x); return r && r !== 'error' ? Number(r.total) : 0; }, total: 'sum', width: 110 },
    {
      key: 'status',
      header: 'Status',
      type: 'status',
      value: (x) => { const r = st(x); return !r ? 'Loading' : r === 'error' ? 'Could not load' : r.remitted ? 'Remitted' : r.approved ? 'Not remitted' : 'Not approved yet'; },
      render: (x) => {
        const r = st(x);
        if (!r) return <Skeleton width={90} height={20} />;
        if (r === 'error') return <Badge tone="danger">Could not load</Badge>;
        if (r.remitted)
          return (
            <div>
              <Badge tone="success">Remitted</Badge>
              <p className="yx-pay-note">{dateText(r.remitted.paidOn)} · {r.remitted.reference}</p>
            </div>
          );
        return r.approved ? <Badge tone="neutral">Not remitted</Badge> : <Badge tone="warning">Not approved yet</Badge>;
      },
      width: 170,
    },
  ];
  return (
    <div className="yx-pay-stack">
      <InlineAlert tone="info">Dues are paid to each union once the month's check-off is approved in payroll. Mark a union remitted after the payment leaves the bank.</InlineAlert>
      <DataTable
        label={`Remittance per union, ${month}`}
        columns={cols}
        rows={unions ?? []}
        getRowId={(x) => x.id}
        state={unions ? 'ready' : 'loading'}
        rowNoun={['union', 'unions']}
        empty={<EmptyState compact title="No unions yet" description="Add a union and record the workers' authorisations first." />}
        rowButtons={(x) => {
          const r = st(x);
          return (
            <span className="yx-pay-row">
              {live.onRemittance && (
                <Button size="sm" icon={Download} loading={busy === x.id} onClick={() => void run(x.id, async () => onStatement(await live.onRemittance!(x.id)))}>
                  Statement
                </Button>
              )}
              {live.onMarkRemitted && r && r !== 'error' && r.approved && !r.remitted && Number(r.total) > 0 && (
                <Button size="sm" onClick={() => { early.reset(); setFailed(null); setMarking({ union: x, paidOn: '', reference: '' }); }}>
                  Mark remitted
                </Button>
              )}
            </span>
          );
        }}
      />
      <ConfirmDialog
        open={!!marking}
        onOpenChange={(o) => !o && setMarking(null)}
        title={marking ? `Mark ${marking.union.name} dues remitted?` : ''}
        consequence={marking ? (() => { const r = st(marking.union); return r && r !== 'error' ? `${formatINR(Number(r.total))} for ${month}. This is recorded once and cannot be changed here.` : undefined; })() : undefined}
        confirmLabel="Mark remitted"
        onConfirm={async () => {
          if (!marking || early.stop()) return false;
          setFailed(null);
          try {
            await live.onMarkRemitted!(marking.union.id, { paidOn: marking.paidOn, reference: marking.reference.trim() });
          } catch (e) {
            setFailed(e instanceof Error ? e.message : 'It was not marked remitted. Try again.');
            return false;
          }
          toast({ tone: 'success', title: `${marking.union.name} dues for ${month} marked remitted.` });
          setMarking(null);
          setTick((t) => t + 1);
        }}
      >
        {marking && (
          <div className="yx-pay-stack">
            {failed && (
              <InlineAlert tone="danger" title="Not marked remitted">
                {failed}
              </InlineAlert>
            )}
            <FormField id="rm-on" label="Paid on" required error={early.errorOf('rm-on')}>
              <TextField type="date" value={marking.paidOn} onChange={(paidOn) => setMarking({ ...marking, paidOn })} />
            </FormField>
            <FormField id="rm-ref" label="Payment reference" required helper="The bank (NEFT / RTGS) or cheque reference." error={early.errorOf('rm-ref')}>
              <TextField value={marking.reference} onChange={(reference) => setMarking({ ...marking, reference })} />
            </FormField>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}

export function LiveUnionCheckoff({ live }: { live: LiveSpecialPay }) {
  const [union, setUnion] = useState(false);
  const [auth, setAuth] = useState(false);
  const [withdraw, setWithdraw] = useState<Auth | null>(null);
  const [statement, setStatement] = useState<UnionRemittance | null>(null);
  const { busy, error, run } = useRun();
  const month = monthName(live.month);
  const u = live.unions;
  const unionName = (id: string) => u?.unions.find((x) => x.id === id)?.name ?? 'Union';
  const auths = u?.authorisations ?? [];
  const deducting = auths.filter((a) => a.validFrom <= monthEnd(live.month) && (!a.revokedOn || a.revokedOn > monthEnd(live.month)));
  const cols: TableColumn<Auth>[] = [
    { key: 'who', header: 'Worker', type: 'person', value: (a) => live.nameOf(a.employeeId), person: (a) => ({ name: live.nameOf(a.employeeId) }), width: 220 },
    { key: 'union', header: 'Union', value: (a) => unionName(a.unionId), groupable: true, width: 200 },
    { key: 'dues', header: 'Monthly dues', value: duesText, width: 170, optional: true },
    {
      key: 'st',
      header: 'Status',
      type: 'status',
      value: (a) => (a.revokedOn ? 'Withdrawn' : 'Authorised'),
      statusTone: (v) => (v === 'Authorised' ? 'success' : 'neutral'),
      render: (a) => (
        <div>
          <Badge tone={a.revokedOn ? 'neutral' : 'success'}>{a.revokedOn ? 'Withdrawn' : 'Authorised'}</Badge>
          <p className="yx-pay-note">{a.revokedOn ? `From ${dateText(a.revokedOn)}` : `Signed from ${dateText(a.validFrom)}`}</p>
        </div>
      ),
      width: 170,
    },
  ];
  return (
    <div className="yx-pay-stack">
      <Head
        title="Union check-off"
        description="Dues are deducted only with the worker's written authorisation and remitted to each union every month."
        actions={
          <>
            <Button onClick={() => setUnion(true)}>Add a union</Button>
            {!!u?.unions.length && (
              <Button icon={Upload} onClick={() => setAuth(true)}>
                Add authorisation
              </Button>
            )}
            <SendToPayroll label={`Send ${month} dues`} title={`Send ${month} union dues to payroll?`} consequence={`Dues for every worker with an authorisation in ${month} are deducted in payroll, once a payroll approver approves them.`} done={`${month} union dues sent to payroll for approval.`} onSend={() => live.onPost({ kind: 'union' })} />
          </>
        }
      />
      {error && (
        <InlineAlert tone="danger" title="That did not work">
          {error}
        </InlineAlert>
      )}
      {u && !u.unions.length ? (
        <EmptyState title="No unions yet" description="Add the union with its registration number, then each worker's check-off authorisation." action={<Button onClick={() => setUnion(true)}>Add a union</Button>} />
      ) : (
        <Tabs defaultValue="auth">
          <TabsList aria-label="Check-off">
            <TabsTrigger value="auth" count={u ? auths.length : undefined}>
              Authorisations
            </TabsTrigger>
            <TabsTrigger value="deductions" count={u ? deducting.length : undefined}>
              {month} deductions
            </TabsTrigger>
            <TabsTrigger value="remit">Remittance</TabsTrigger>
          </TabsList>
          <TabsContent value="auth">
            <DataTable
              label="Check-off authorisations"
              columns={cols}
              rows={auths}
              getRowId={(a) => a.id}
              state={u ? 'ready' : 'loading'}
              empty={<EmptyState compact title="No authorisations yet" description="Record each worker's signed check-off form; no dues are deducted without one." />}
              rowButtons={(a) =>
                !a.revokedOn && live.onRevoke ? (
                  <Button size="sm" onClick={() => setWithdraw(a)}>
                    Withdraw
                  </Button>
                ) : null
              }
            />
          </TabsContent>
          <TabsContent value="deductions">
            <div className="yx-pay-stack">
              <InlineAlert tone="info">Only workers with an authorisation in force in {month} have dues deducted. A withdrawal stops dues from its date.</InlineAlert>
              <DataTable label={`${month} check-off deductions`} columns={cols.filter((c) => c.key !== 'st')} rows={deducting} getRowId={(a) => a.id} state={u ? 'ready' : 'loading'} rowNoun={['member', 'members']} />
            </div>
          </TabsContent>
          <TabsContent value="remit">
            <LiveRemittance live={live} unions={u?.unions ?? null} onStatement={setStatement} />
          </TabsContent>
        </Tabs>
      )}
      <Drawer
        open={!!statement}
        onOpenChange={(o) => !o && setStatement(null)}
        title={statement ? `${statement.union} · ${monthName(statement.month)}` : ''}
        subtitle={statement ? (statement.approved ? 'Dues approved in payroll' : 'Dues not yet approved in payroll') : undefined}
        footer={
          statement && (
            <>
              <Button onClick={() => setStatement(null)}>Close</Button>
              <Button variant="primary" icon={Download} onClick={() => saveFile(`check-off-${statement.union.toLowerCase().replace(/[^a-z]+/g, '-')}-${statement.month}.csv`, ['Name,Monthly dues', ...statement.members.map((m) => `${live.nameOf(m.employeeId)},${m.amount}`), `Total ${statement.members.length} members,${statement.total}`].join('\n'))}>
                Download statement
              </Button>
            </>
          )
        }
      >
        {statement &&
          (statement.members.length ? (
            <PlainTable
              label="Union dues"
              hideHeader
              rows={statement.members}
              getRowId={(m) => m.employeeId}
              columns={[
                { key: 'member', header: 'Member', rowHeader: true, cell: (m) => live.nameOf(m.employeeId) },
                { key: 'amount', header: 'Amount', num: true, cell: (m) => formatINR(Number(m.amount)) },
              ]}
              footer={[{ id: 'total', label: 'Total', cells: { amount: formatINR(Number(statement.total)) } }]}
            />
          ) : (
            <EmptyState compact title="No dues sent to payroll for this month" description="Send the month's dues first." />
          ))}
      </Drawer>
      {union && <UnionDrawer onClose={() => setUnion(false)} onSave={live.onAddUnion} />}
      {auth && u && <AuthDrawer unions={u.unions} onSearch={live.onSearch} onClose={() => setAuth(false)} onSave={live.onAuthorise} />}
      {withdraw && live.onRevoke && <WithdrawDrawer who={live.nameOf(withdraw.employeeId)} onClose={() => setWithdraw(null)} onSave={(on) => live.onRevoke!(withdraw.id, on)} />}
    </div>
  );
}

function UnionDrawer({ onClose, onSave }: { onClose: () => void; onSave: LiveSpecialPay['onAddUnion'] }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [reg, setReg] = useState('');
  const errors: FormErrorItem[] = name.trim().length < 2 ? [{ fieldId: 'un-name', message: 'Name the union.' }] : [];
  return (
    <FormDrawer
      title="Add a union"
      confirm="Save union"
      errors={errors}
      onClose={onClose}
      onSave={async () => {
        await onSave({ name: name.trim(), ...(reg.trim() ? { registrationNo: reg.trim() } : {}) });
        toast({ tone: 'success', title: `${name.trim()} added.` });
      }}
    >
      {(errorOf) => (
        <>
          <FormField id="un-name" label="Name" required error={errorOf('un-name')}>
            <TextField value={name} onChange={setName} maxLength={200} />
          </FormField>
          <FormField id="un-reg" label="Registration number" optional>
            <TextField value={reg} onChange={setReg} maxLength={60} />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}

function AuthDrawer({ unions, onSearch, onClose, onSave }: { unions: UnionsView['unions']; onSearch: Search; onClose: () => void; onSave: LiveSpecialPay['onAuthorise'] }) {
  const { toast } = useToast();
  const [union, setUnion] = useState<string | null>(unions[0]?.id ?? null);
  const [who, setWho] = useState<PersonHit | null>(null);
  const [kind, setKind] = useState<'fixed' | 'percent'>('fixed');
  const [value, setValue] = useState('');
  const [from, setFrom] = useState('');
  const errors: FormErrorItem[] = [
    ...(!who ? [{ fieldId: 'au-who', message: 'Choose the worker.' }] : []),
    ...(!/^\d{1,8}(\.\d{1,2})?$/.test(value) || Number(value) <= 0 || (kind === 'percent' && Number(value) >= 100) ? [{ fieldId: 'au-value', message: kind === 'fixed' ? 'The dues a month in rupees, above zero.' : 'The per cent of basic and DA, below 100.' }] : []),
    ...(!DAY.test(from) ? [{ fieldId: 'au-from', message: 'The day the worker signed from.' }] : []),
  ];
  return (
    <FormDrawer
      title="Add check-off authorisation"
      subtitle="Dues are deducted only for a worker who signed one."
      confirm="Save authorisation"
      errors={errors}
      onClose={onClose}
      onSave={async () => {
        await onSave({ unionId: union!, employeeId: who!.id, duesKind: kind, duesValue: value, validFrom: from });
        toast({ tone: 'success', title: `Authorisation saved for ${who!.name}.` });
      }}
    >
      {(errorOf) => (
        <>
          <FormField id="au-union" label="Union" required>
            <Select value={union} onChange={setUnion} options={unions.map((x) => ({ value: x.id, label: x.name }))} />
          </FormField>
          <PersonPicker id="au-who" label="Worker" value={who} onChange={setWho} onSearch={onSearch} error={errorOf('au-who')} />
          <FormField id="au-kind" label="Dues">
            <Segment label="Dues" value={kind} onChange={setKind} options={[{ value: 'fixed', label: 'Fixed amount' }, { value: 'percent', label: 'Per cent of basic and DA' }]} />
          </FormField>
          <FieldRow>
            <FormField id="au-value" label={kind === 'fixed' ? 'Amount a month (₹)' : 'Per cent'} required error={errorOf('au-value')}>
              <TextField value={value} onChange={setValue} inputMode="decimal" />
            </FormField>
            <FormField id="au-from" label="Signed on" required error={errorOf('au-from')}>
              <TextField type="date" value={from} onChange={setFrom} />
            </FormField>
          </FieldRow>
        </>
      )}
    </FormDrawer>
  );
}

function WithdrawDrawer({ who, onClose, onSave }: { who: string; onClose: () => void; onSave: (revokedOn: string) => Promise<unknown> }) {
  const { toast } = useToast();
  const [on, setOn] = useState('');
  const errors: FormErrorItem[] = !DAY.test(on) ? [{ fieldId: 'wd-on', message: 'The day the withdrawal takes effect.' }] : [];
  return (
    <FormDrawer
      title={`Withdraw ${who}'s authorisation`}
      subtitle="No dues are deducted from this day. The authorisation stays on record."
      confirm="Withdraw"
      errors={errors}
      onClose={onClose}
      onSave={async () => {
        await onSave(on);
        toast({ tone: 'success', title: `${who}'s check-off is withdrawn from ${dateText(on)}.` });
      }}
    >
      {(errorOf) => (
        <FormField id="wd-on" label="From" required error={errorOf('wd-on')}>
          <TextField type="date" value={on} onChange={setOn} />
        </FormField>
      )}
    </FormDrawer>
  );
}
