import { useState } from 'react';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/choice';
import { Badge, type BadgeTone } from '../../../components/display';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { FormField, type FormErrorItem } from '../../../components/field';
import { TextField } from '../../../components/inputs';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/shell';
import { useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import { FileButton } from './compliance';
import { PersonPicker, type PersonHit } from './inputs';
import { FormDrawer } from './operations';
import { monthText } from './periods';
import { rupees } from './runs';
import { EntityPicker } from './setup';
import type { LoadState } from './types';
import type { SetupEntity } from './types-5b';
import type { ActuarialView, EquityOverview, EwaDrawView, EwaPolicyView, GrantView, IncentivePlanView, MyEwa, MyIncentives, NecSummary, OncallRuleView, PackStatus, RateCard, SpecialKind, SpecialPosting, UnionsView } from './types-5i';

// Batch 5i, wired (PAY-9.01 … 9.12): special pay sent to payroll for approval (piece-rate, incentives, tips, on-call,
// union dues, settlements, lay-off, VRS), earned wage access, equity, the actuarial census and valuations, and country
// packs. Every action is checked again by the API (keys, entities, maker ≠ checker, the database pay guard).

const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
type Search = (q: string) => Promise<PersonHit[]>;
const KIND_TEXT: Record<SpecialKind, string> = { piece: 'Piece-rate pay', incentive: 'Incentives', tips: 'Tips', oncall: 'On-call pay', union: 'Union dues', settle: 'Settlement arrears', layoff: 'Lay-off pay', vrs: 'VRS' };
const STATUS: Record<SpecialPosting['status'], { label: string; tone: BadgeTone }> = { pending: { label: 'Waiting for approval', tone: 'warning' }, approved: { label: 'Approved, in payroll', tone: 'success' }, rejected: { label: 'Turned down', tone: 'danger' }, cancelled: { label: 'Cancelled', tone: 'neutral' } };

function Failed({ error }: { error: string | null }) {
  return error ? (
    <InlineAlert tone="danger" title="That did not work">
      {error}
    </InlineAlert>
  ) : null;
}

// ------------------------------------------------------------------------------------------ special pay (PAY-31 … 37)

export interface SpecialPayScreenProps {
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
  cards: RateCard[] | null;
  plans: IncentivePlanView[] | null;
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
  onLayoff: (x: { employeeId: string; days: string }) => Promise<unknown>;
  onVrs: (x: { employeeId: string; amount: string; priorExemption: string }) => Promise<unknown>;
  /** Sends the month's sheet of a kind to payroll: piece, oncall, union, layoff, clawbacks; or a plan, pool or settlement by id. */
  onPost: (what: { kind: 'piece' | 'oncall' | 'union' | 'layoff' | 'clawbacks' } | { kind: 'plan' | 'pool' | 'settlement'; id: string }) => Promise<unknown>;
}

export function SpecialPayScreen(p: SpecialPayScreenProps) {
  return (
    <LivePage
      title="Special pay"
      description="Piece-rate, incentives, tips, on-call, union dues, settlements, lay-off and VRS. Each month's sheet goes to payroll once a payroll approver who did not make it, and is not paid in it, approves it."
      state={p.state}
      onRetry={p.onRetry}
      what="special pay"
      grantedBy="your payroll admin"
    >
      <div className="yx-tim-row">
        <EntityPicker entities={p.entities} value={p.entityId} onChange={p.onEntity} />
        <FormField id="sp-month" label="Pay month">
          <TextField type="month" value={p.month} onChange={p.onMonth} />
        </FormField>
      </div>
      {p.entityId && (
        <Tabs defaultValue="postings">
          <TabsList aria-label="Special pay">
            <TabsTrigger value="postings">Sent to payroll</TabsTrigger>
            <TabsTrigger value="piece">Piece-rate</TabsTrigger>
            <TabsTrigger value="incentives">Incentives</TabsTrigger>
            <TabsTrigger value="tips">Tips</TabsTrigger>
            <TabsTrigger value="oncall">On-call</TabsTrigger>
            <TabsTrigger value="ir">Union and IR</TabsTrigger>
          </TabsList>
          <TabsContent value="postings">
            <PostingsTab {...p} />
          </TabsContent>
          <TabsContent value="piece">
            <PieceTab {...p} />
          </TabsContent>
          <TabsContent value="incentives">
            <IncentivesTab {...p} />
          </TabsContent>
          <TabsContent value="tips">
            <TipsTab {...p} />
          </TabsContent>
          <TabsContent value="oncall">
            <OncallTab {...p} />
          </TabsContent>
          <TabsContent value="ir">
            <IrTab {...p} />
          </TabsContent>
        </Tabs>
      )}
    </LivePage>
  );
}

function PostingsTab(p: SpecialPayScreenProps) {
  const [open, setOpen] = useState<SpecialPosting | null>(null);
  if (!p.postings) return null;
  if (!p.postings.length) return <EmptyState title="Nothing sent to payroll this month" description="Each tab sends its month's sheet when it is ready." />;
  return (
    <>
      <table className="yx-tim-table" aria-label="Special pay sent to payroll">
        <thead>
          <tr>
            <th scope="col">Sheet</th>
            <th scope="col">People</th>
            <th scope="col">Total</th>
            <th scope="col">Status</th>
            <th scope="col">
              <span className="yx-sr-only">Lines</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {p.postings.map((x) => (
            <tr key={x.id}>
              <th scope="row">
                {KIND_TEXT[x.kind]} · {monthText(x.month)}
                {x.madeByMe && <div className="yx-tim-muted">Sent by you</div>}
              </th>
              <td>{new Set(x.lines.map((l) => l.employeeId)).size}</td>
              <td>{rupees(x.total)}</td>
              <td>
                <Badge tone={STATUS[x.status].tone}>{STATUS[x.status].label}</Badge>
              </td>
              <td>
                <Button size="sm" onClick={() => setOpen(x)}>
                  Lines
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {open && (
        <Card title={`${KIND_TEXT[open.kind]} · ${monthText(open.month)}`} actions={<Button onClick={() => setOpen(null)}>Close</Button>}>
          <table className="yx-tim-table" aria-label="Posting lines">
            <tbody>
              {open.lines.map((l, i) => (
                <tr key={i}>
                  <th scope="row">{p.nameOf(l.employeeId)}</th>
                  <td>{l.label}</td>
                  <td>{rupees(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

function SendButton({ label, onSend }: { label: string; onSend: () => Promise<unknown> }) {
  const { busy, error, run } = useRun();
  return (
    <>
      <Button variant="primary" loading={busy === 'send'} onClick={() => void run('send', onSend)}>
        {label}
      </Button>
      <Failed error={error} />
    </>
  );
}

function PieceTab(p: SpecialPayScreenProps) {
  const [card, setCard] = useState(false);
  const [output, setOutput] = useState(false);
  const { busy, error, run } = useRun();
  return (
    <div className="yx-tim-stack">
      <div className="yx-tim-row">
        <Button onClick={() => setCard(true)}>Add a rate</Button>
        <Button onClick={() => setOutput(true)}>Key output</Button>
        <FileButton label="Import output (CSV)" accept=".csv,text/csv" ariaLabel="Import output: employee_code, date, operation, quantity" loading={busy === 'imp'} onFile={(f) => void run('imp', () => p.onImportOutputs(f))} />
        <SendButton label={`Send ${monthText(p.month)} to payroll`} onSend={() => p.onPost({ kind: 'piece' })} />
      </div>
      <Failed error={error} />
      {p.cards && !p.cards.length && <EmptyState compact title="No rate cards yet" description="Add the rate per piece for each operation, from a date." />}
      {p.cards && p.cards.length > 0 && (
        <table className="yx-tim-table" aria-label="Piece rates">
          <thead>
            <tr>
              <th scope="col">Operation</th>
              <th scope="col">Rate</th>
              <th scope="col">From</th>
              <th scope="col">To</th>
            </tr>
          </thead>
          <tbody>
            {p.cards.map((c) => (
              <tr key={c.id}>
                <th scope="row">
                  {c.operationCode} · {c.name}
                </th>
                <td>
                  ₹{c.rate} a {c.unit}
                </td>
                <td>{dateText(c.validFrom)}</td>
                <td>{c.validTo ? dateText(c.validTo) : 'Now'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {card && <CardDrawer onClose={() => setCard(false)} onSave={p.onAddCard} />}
      {output && <OutputDrawer cards={p.cards ?? []} onSearch={p.onSearch} onClose={() => setOutput(false)} onSave={p.onSaveOutput} />}
    </div>
  );
}

function CardDrawer({ onClose, onSave }: { onClose: () => void; onSave: SpecialPayScreenProps['onAddCard'] }) {
  const [x, setX] = useState({ operationCode: '', name: '', unit: 'piece', rate: '', validFrom: '' });
  const errors: FormErrorItem[] = [
    ...(!/^[A-Za-z0-9_-]{1,30}$/.test(x.operationCode) ? [{ fieldId: 'rc-code', message: 'An operation code: letters, digits, _ or -.' }] : []),
    ...(x.name.trim().length < 2 ? [{ fieldId: 'rc-name', message: 'Name the operation.' }] : []),
    ...(!/^\d{1,8}(\.\d{1,4})?$/.test(x.rate) ? [{ fieldId: 'rc-rate', message: 'The rate per unit, like 2.50.' }] : []),
    ...(!DAY.test(x.validFrom) ? [{ fieldId: 'rc-from', message: 'The first day it applies.' }] : []),
  ];
  return (
    <FormDrawer title="Add a piece rate" subtitle="A new rate from a date ends the operation's earlier rate the day before." confirm="Add rate" errors={errors} onClose={onClose} onSave={() => onSave({ ...x, operationCode: x.operationCode.toUpperCase(), name: x.name.trim() })}>
      {(errorOf) => (
        <>
          <FormField id="rc-code" label="Operation code" required error={errorOf('rc-code')}>
            <TextField value={x.operationCode} onChange={(operationCode) => setX({ ...x, operationCode })} maxLength={30} />
          </FormField>
          <FormField id="rc-name" label="Operation" required error={errorOf('rc-name')}>
            <TextField value={x.name} onChange={(name) => setX({ ...x, name })} maxLength={120} />
          </FormField>
          <FormField id="rc-unit" label="Unit">
            <TextField value={x.unit} onChange={(unit) => setX({ ...x, unit })} maxLength={20} />
          </FormField>
          <FormField id="rc-rate" label="Rate per unit (₹)" required error={errorOf('rc-rate')}>
            <TextField value={x.rate} onChange={(rate) => setX({ ...x, rate })} inputMode="decimal" />
          </FormField>
          <FormField id="rc-from" label="From" required error={errorOf('rc-from')}>
            <TextField type="date" value={x.validFrom} onChange={(validFrom) => setX({ ...x, validFrom })} />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}

function OutputDrawer({ cards, onSearch, onClose, onSave }: { cards: RateCard[]; onSearch: Search; onClose: () => void; onSave: SpecialPayScreenProps['onSaveOutput'] }) {
  const [who, setWho] = useState<PersonHit | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [qty, setQty] = useState('');
  const ops = [...new Set(cards.map((c) => c.operationCode))];
  const errors: FormErrorItem[] = [
    ...(!who ? [{ fieldId: 'po-who', message: 'Choose the worker.' }] : []),
    ...(!op ? [{ fieldId: 'po-op', message: 'Choose the operation.' }] : []),
    ...(!DAY.test(date) ? [{ fieldId: 'po-date', message: 'The day of the work.' }] : []),
    ...(!/^\d{1,9}(\.\d{1,3})?$/.test(qty) || Number(qty) <= 0 ? [{ fieldId: 'po-qty', message: 'The quantity, above zero.' }] : []),
  ];
  return (
    <FormDrawer title="Key output" subtitle="One worker, day and operation; keying it again replaces it." confirm="Save" errors={errors} onClose={onClose} onSave={() => onSave({ employeeId: who!.id, workDate: date, operationCode: op!, quantity: qty })}>
      {(errorOf) => (
        <>
          <PersonPicker id="po-who" label="Worker" value={who} onChange={setWho} onSearch={onSearch} error={errorOf('po-who')} />
          <FormField id="po-op" label="Operation" required error={errorOf('po-op')}>
            <Select value={op} onChange={setOp} placeholder="Choose the operation" options={ops.map((o) => ({ value: o, label: o }))} />
          </FormField>
          <FormField id="po-date" label="Day" required error={errorOf('po-date')}>
            <TextField type="date" value={date} onChange={setDate} />
          </FormField>
          <FormField id="po-qty" label="Quantity" required error={errorOf('po-qty')}>
            <TextField value={qty} onChange={setQty} inputMode="decimal" />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}

function IncentivesTab(p: SpecialPayScreenProps) {
  const [adding, setAdding] = useState(false);
  const [result, setResult] = useState<IncentivePlanView | null>(null);
  return (
    <div className="yx-tim-stack">
      <div className="yx-tim-row">
        <Button onClick={() => setAdding(true)}>Add a plan</Button>
        <SendButton label={`Send ${monthText(p.month)} clawbacks`} onSend={() => p.onPost({ kind: 'clawbacks' })} />
      </div>
      {p.plans && !p.plans.length && <EmptyState compact title="No incentive plans yet" description="A plan pays a target amount by attainment of the quota, with tiers and a cap." />}
      {p.plans && p.plans.length > 0 && (
        <table className="yx-tim-table" aria-label="Incentive plans">
          <thead>
            <tr>
              <th scope="col">Plan</th>
              <th scope="col">Target</th>
              <th scope="col">Tiers</th>
              <th scope="col">
                <span className="yx-sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {p.plans.map((x) => (
              <tr key={x.id}>
                <th scope="row">
                  {x.name}
                  <div className="yx-tim-muted">
                    {x.kind} · {x.metric}
                  </div>
                </th>
                <td>{rupees(x.targetAmount)}</td>
                <td>{x.tiers.map((t) => `from ${t.from} % × ${t.multiplier}`).join(', ')}</td>
                <td>
                  <div className="yx-tim-row">
                    <Button size="sm" onClick={() => setResult(x)}>
                      Add a result
                    </Button>
                    <SendButton label="Send month" onSend={() => p.onPost({ kind: 'plan', id: x.id })} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {adding && <PlanDrawer onClose={() => setAdding(false)} onSave={p.onAddPlan} />}
      {result && <ResultDrawer plan={result} onSearch={p.onSearch} onClose={() => setResult(null)} onSave={(x) => p.onSaveResult(result.id, x)} />}
    </div>
  );
}

function PlanDrawer({ onClose, onSave }: { onClose: () => void; onSave: SpecialPayScreenProps['onAddPlan'] }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'production' | 'attendance' | 'sales'>('sales');
  const [metric, setMetric] = useState('');
  const [target, setTarget] = useState('');
  const [threshold, setThreshold] = useState('0');
  const [accelFrom, setAccelFrom] = useState('100');
  const [accel, setAccel] = useState('1.5');
  const [cap, setCap] = useState('');
  const [claw, setClaw] = useState('90');
  const errors: FormErrorItem[] = [
    ...(name.trim().length < 2 ? [{ fieldId: 'pl-name', message: 'Name the plan.' }] : []),
    ...(metric.trim().length < 2 ? [{ fieldId: 'pl-metric', message: 'What is measured (sales, pieces …).' }] : []),
    ...(!MONEY.test(target) ? [{ fieldId: 'pl-target', message: 'The amount paid at 100 % of quota.' }] : []),
    ...(!/^\d{1,3}$/.test(threshold) || !/^\d{1,4}$/.test(accelFrom) || Number(accelFrom) <= Number(threshold) ? [{ fieldId: 'pl-tiers', message: 'The threshold comes before the accelerator.' }] : []),
    ...(!/^\d(\.\d{1,2})?$/.test(accel) ? [{ fieldId: 'pl-accel', message: 'The accelerator, like 1.5.' }] : []),
    ...(cap && !/^\d{1,4}$/.test(cap) ? [{ fieldId: 'pl-cap', message: 'The cap as a per cent of the target.' }] : []),
  ];
  const tiers = Number(threshold) > 0 ? [{ from: 0, multiplier: 0 }, { from: Number(threshold), multiplier: 1 }, { from: Number(accelFrom), multiplier: Number(accel) }] : [{ from: 0, multiplier: 1 }, { from: Number(accelFrom), multiplier: Number(accel) }];
  return (
    <FormDrawer title="Add an incentive plan" subtitle="Pays the target amount for each point of attainment, the accelerator above its tier; results are approved in payroll." confirm="Add plan" errors={errors} onClose={onClose} onSave={() => onSave({ name: name.trim(), kind, metric: metric.trim(), targetAmount: target, tiers, ...(cap ? { capPercent: cap } : {}), clawbackDays: Number(claw) || 0 })}>
      {(errorOf) => (
        <>
          <FormField id="pl-name" label="Name" required error={errorOf('pl-name')}>
            <TextField value={name} onChange={setName} maxLength={200} />
          </FormField>
          <FormField id="pl-kind" label="Kind">
            <Segment label="Kind" value={kind} onChange={setKind} options={[{ value: 'sales', label: 'Sales commission' }, { value: 'production', label: 'Production' }, { value: 'attendance', label: 'Attendance' }]} />
          </FormField>
          <FormField id="pl-metric" label="Measured on" required error={errorOf('pl-metric')}>
            <TextField value={metric} onChange={setMetric} maxLength={80} />
          </FormField>
          <FormField id="pl-target" label="Target pay at 100 % (₹)" required error={errorOf('pl-target')}>
            <TextField value={target} onChange={setTarget} inputMode="decimal" />
          </FormField>
          <FormField id="pl-tiers" label="Nothing below (% of quota)" helper="0 for no threshold." error={errorOf('pl-tiers')}>
            <TextField value={threshold} onChange={setThreshold} inputMode="numeric" />
          </FormField>
          <FormField id="pl-accel-from" label="Accelerator from (% of quota)">
            <TextField value={accelFrom} onChange={setAccelFrom} inputMode="numeric" />
          </FormField>
          <FormField id="pl-accel" label="Accelerator" required error={errorOf('pl-accel')}>
            <TextField value={accel} onChange={setAccel} inputMode="decimal" />
          </FormField>
          <FormField id="pl-cap" label="Cap (% of target)" error={errorOf('pl-cap')}>
            <TextField value={cap} onChange={setCap} inputMode="numeric" />
          </FormField>
          <FormField id="pl-claw" label="Clawback window (days)">
            <TextField value={claw} onChange={setClaw} inputMode="numeric" />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}

function ResultDrawer({ plan, onSearch, onClose, onSave }: { plan: IncentivePlanView; onSearch: Search; onClose: () => void; onSave: (x: { employeeId: string; quota: string; actual: string }) => Promise<unknown> }) {
  const [who, setWho] = useState<PersonHit | null>(null);
  const [quota, setQuota] = useState('');
  const [actual, setActual] = useState('');
  const errors: FormErrorItem[] = [...(!who ? [{ fieldId: 'ir-who', message: 'Choose the person.' }] : []), ...(!MONEY.test(quota) || Number(quota) <= 0 ? [{ fieldId: 'ir-quota', message: 'The quota, above zero.' }] : []), ...(!MONEY.test(actual) ? [{ fieldId: 'ir-actual', message: 'What they achieved.' }] : [])];
  return (
    <FormDrawer title={`Result for ${plan.name}`} confirm="Save" errors={errors} onClose={onClose} onSave={() => onSave({ employeeId: who!.id, quota, actual })}>
      {(errorOf) => (
        <>
          <PersonPicker id="ir-who" label="Person" value={who} onChange={setWho} onSearch={onSearch} error={errorOf('ir-who')} />
          <FormField id="ir-quota" label="Quota" required error={errorOf('ir-quota')}>
            <TextField value={quota} onChange={setQuota} inputMode="decimal" />
          </FormField>
          <FormField id="ir-actual" label="Achieved" required error={errorOf('ir-actual')}>
            <TextField value={actual} onChange={setActual} inputMode="decimal" />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}

function TipsTab(p: SpecialPayScreenProps) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="yx-tim-stack">
      <p className="yx-tim-muted">A pool per outlet and month, shared by points, hours or shifts. Tips customers paid directly are recorded for statements only.</p>
      <div className="yx-tim-row">
        <Button onClick={() => setAdding(true)}>Add a pool for {monthText(p.month)}</Button>
      </div>
      {adding && <PoolDrawer locations={p.locations} onSearch={p.onSearch} onClose={() => setAdding(false)} onSave={async (x) => {
        const pool = await p.onAddPool(x);
        if (!x.paidDirect) await p.onPost({ kind: 'pool', id: pool.id });
      }} />}
    </div>
  );
}

function PoolDrawer({ locations, onSearch, onClose, onSave }: { locations: { id: string; name: string }[]; onSearch: Search; onClose: () => void; onSave: (x: Parameters<SpecialPayScreenProps['onAddPool']>[0]) => Promise<unknown> }) {
  const [loc, setLoc] = useState<string | null>(locations[0]?.id ?? null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'points' | 'hours' | 'shifts'>('hours');
  const [direct, setDirect] = useState(false);
  const [rows, setRows] = useState<{ who: PersonHit | null; basis: string }[]>([{ who: null, basis: '' }]);
  const errors: FormErrorItem[] = [
    ...(!loc ? [{ fieldId: 'tp-loc', message: 'Choose the outlet.' }] : []),
    ...(!MONEY.test(amount) || Number(amount) <= 0 ? [{ fieldId: 'tp-amount', message: 'The amount in the pool.' }] : []),
    ...(rows.some((r) => !r.who || !/^\d{1,8}(\.\d{1,2})?$/.test(r.basis) || Number(r.basis) <= 0) ? [{ fieldId: 'tp-shares', message: 'Each person with their points, hours or shifts.' }] : []),
  ];
  return (
    <FormDrawer title="Add a tip pool" subtitle="Shared at once; a payroll pool is then sent for approval." confirm="Add and send" errors={errors} onClose={onClose} onSave={() => onSave({ locationId: loc!, amount, method, paidDirect: direct, shares: rows.map((r) => ({ employeeId: r.who!.id, basis: r.basis })) })}>
      {(errorOf) => (
        <>
          <FormField id="tp-loc" label="Outlet" required error={errorOf('tp-loc')}>
            <Select value={loc} onChange={setLoc} options={locations.map((l) => ({ value: l.id, label: l.name }))} />
          </FormField>
          <FormField id="tp-amount" label="Amount (₹)" required error={errorOf('tp-amount')}>
            <TextField value={amount} onChange={setAmount} inputMode="decimal" />
          </FormField>
          <FormField id="tp-method" label="Shared by">
            <Segment label="Shared by" value={method} onChange={setMethod} options={[{ value: 'hours', label: 'Hours' }, { value: 'points', label: 'Points' }, { value: 'shifts', label: 'Shifts' }]} />
          </FormField>
          <Checkbox label="Paid by customers directly (record only)" checked={direct} onChange={setDirect} />
          <FormField id="tp-shares" label="Shares" error={errorOf('tp-shares')}>
            <div className="yx-tim-stack">
              {rows.map((r, i) => (
                <div key={i} className="yx-tim-row">
                  <PersonPicker id={`tp-who-${i}`} label={`Person ${i + 1}`} value={r.who} onChange={(who) => setRows(rows.map((x, j) => (j === i ? { ...x, who } : x)))} onSearch={onSearch} />
                  <FormField id={`tp-basis-${i}`} label={method}>
                    <TextField value={r.basis} onChange={(basis) => setRows(rows.map((x, j) => (j === i ? { ...x, basis } : x)))} inputMode="decimal" />
                  </FormField>
                </div>
              ))}
              <Button size="sm" onClick={() => setRows([...rows, { who: null, basis: '' }])}>
                Add a person
              </Button>
            </div>
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}

function OncallTab(p: SpecialPayScreenProps) {
  const [rule, setRule] = useState(false);
  const [slot, setSlot] = useState(false);
  return (
    <div className="yx-tim-stack">
      <div className="yx-tim-row">
        <Button onClick={() => setRule(true)}>Add a rule</Button>
        <Button onClick={() => setSlot(true)} disabled={!p.oncallRules?.length}>
          Record a slot
        </Button>
        <SendButton label={`Send ${monthText(p.month)} to payroll`} onSend={() => p.onPost({ kind: 'oncall' })} />
      </div>
      {p.oncallRules && p.oncallRules.length > 0 && (
        <table className="yx-tim-table" aria-label="On-call rules">
          <thead>
            <tr>
              <th scope="col">Rule</th>
              <th scope="col">Standby</th>
              <th scope="col">Call-out</th>
            </tr>
          </thead>
          <tbody>
            {p.oncallRules.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.name}</th>
                <td>{rupees(r.standbyAmount)} a slot</td>
                <td>
                  At least {r.calloutMinHours} h at {rupees(r.calloutRate)} × {r.multiplier}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rule && <RuleDrawer onClose={() => setRule(false)} onSave={p.onAddRule} />}
      {slot && p.oncallRules && <SlotDrawer rules={p.oncallRules} onSearch={p.onSearch} onClose={() => setSlot(false)} onSave={p.onAddSlot} />}
    </div>
  );
}

function RuleDrawer({ onClose, onSave }: { onClose: () => void; onSave: SpecialPayScreenProps['onAddRule'] }) {
  const [x, setX] = useState({ name: '', standbyAmount: '', calloutMinHours: '3', calloutRate: '', multiplier: '1.5' });
  const errors: FormErrorItem[] = [
    ...(x.name.trim().length < 2 ? [{ fieldId: 'oc-name', message: 'Name the rule.' }] : []),
    ...(!MONEY.test(x.standbyAmount) ? [{ fieldId: 'oc-standby', message: 'The standby allowance a slot.' }] : []),
    ...(!/^\d{1,2}(\.\d{1,2})?$/.test(x.calloutMinHours) ? [{ fieldId: 'oc-min', message: 'The minimum hours of a call-out.' }] : []),
    ...(!MONEY.test(x.calloutRate) ? [{ fieldId: 'oc-rate', message: 'The hourly rate of a call-out.' }] : []),
    ...(!/^\d(\.\d{1,2})?$/.test(x.multiplier) || Number(x.multiplier) < 1 ? [{ fieldId: 'oc-mult', message: 'At least 1.' }] : []),
  ];
  return (
    <FormDrawer title="Add an on-call rule" confirm="Add rule" errors={errors} onClose={onClose} onSave={() => onSave({ ...x, name: x.name.trim() })}>
      {(errorOf) => (
        <>
          <FormField id="oc-name" label="Name" required error={errorOf('oc-name')}>
            <TextField value={x.name} onChange={(name) => setX({ ...x, name })} maxLength={120} />
          </FormField>
          <FormField id="oc-standby" label="Standby a slot (₹)" required error={errorOf('oc-standby')}>
            <TextField value={x.standbyAmount} onChange={(standbyAmount) => setX({ ...x, standbyAmount })} inputMode="decimal" />
          </FormField>
          <FormField id="oc-min" label="Call-out minimum (hours)" required error={errorOf('oc-min')}>
            <TextField value={x.calloutMinHours} onChange={(calloutMinHours) => setX({ ...x, calloutMinHours })} inputMode="decimal" />
          </FormField>
          <FormField id="oc-rate" label="Call-out rate an hour (₹)" required error={errorOf('oc-rate')}>
            <TextField value={x.calloutRate} onChange={(calloutRate) => setX({ ...x, calloutRate })} inputMode="decimal" />
          </FormField>
          <FormField id="oc-mult" label="Multiplier" required error={errorOf('oc-mult')}>
            <TextField value={x.multiplier} onChange={(multiplier) => setX({ ...x, multiplier })} inputMode="decimal" />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}

function SlotDrawer({ rules, onSearch, onClose, onSave }: { rules: OncallRuleView[]; onSearch: Search; onClose: () => void; onSave: SpecialPayScreenProps['onAddSlot'] }) {
  const [rule, setRule] = useState<string | null>(rules[0]?.id ?? null);
  const [who, setWho] = useState<PersonHit | null>(null);
  const [date, setDate] = useState('');
  const [hours, setHours] = useState('');
  const errors: FormErrorItem[] = [...(!who ? [{ fieldId: 'sl-who', message: 'Choose the person.' }] : []), ...(!DAY.test(date) ? [{ fieldId: 'sl-date', message: 'The day of the slot.' }] : []), ...(hours && !/^\d{1,2}(\.\d{1,2})?$/.test(hours) ? [{ fieldId: 'sl-hours', message: 'Hours worked on the call-out.' }] : [])];
  return (
    <FormDrawer title="Record an on-call slot" subtitle="Leave the hours empty when nobody was called out." confirm="Save" errors={errors} onClose={onClose} onSave={() => onSave({ ruleId: rule!, employeeId: who!.id, slotDate: date, ...(hours ? { calloutHours: hours } : {}) })}>
      {(errorOf) => (
        <>
          <FormField id="sl-rule" label="Rule">
            <Select value={rule} onChange={setRule} options={rules.map((r) => ({ value: r.id, label: r.name }))} />
          </FormField>
          <PersonPicker id="sl-who" label="Person" value={who} onChange={setWho} onSearch={onSearch} error={errorOf('sl-who')} />
          <FormField id="sl-date" label="Day" required error={errorOf('sl-date')}>
            <TextField type="date" value={date} onChange={setDate} />
          </FormField>
          <FormField id="sl-hours" label="Call-out hours" error={errorOf('sl-hours')}>
            <TextField value={hours} onChange={setHours} inputMode="decimal" />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}

function IrTab(p: SpecialPayScreenProps) {
  const [union, setUnion] = useState(false);
  const [auth, setAuth] = useState(false);
  const [layoff, setLayoff] = useState(false);
  const [vrs, setVrs] = useState(false);
  const u = p.unions;
  return (
    <div className="yx-tim-stack">
      <div className="yx-tim-row">
        <Button onClick={() => setUnion(true)}>Add a union</Button>
        <Button onClick={() => setAuth(true)} disabled={!u?.unions.length}>
          Record an authorisation
        </Button>
        <SendButton label={`Send ${monthText(p.month)} dues`} onSend={() => p.onPost({ kind: 'union' })} />
      </div>
      {u && u.unions.length > 0 && (
        <table className="yx-tim-table" aria-label="Unions">
          <thead>
            <tr>
              <th scope="col">Union</th>
              <th scope="col">Members paying dues</th>
            </tr>
          </thead>
          <tbody>
            {u.unions.map((x) => (
              <tr key={x.id}>
                <th scope="row">
                  {x.name}
                  {x.registrationNo && <div className="yx-tim-muted">{x.registrationNo}</div>}
                </th>
                <td>{x.members}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {u && u.settlements.length > 0 && (
        <Card title="Wage settlements">
          <table className="yx-tim-table" aria-label="Wage settlements">
            <tbody>
              {u.settlements.map((s) => (
                <tr key={s.id}>
                  <th scope="row">
                    {s.title}
                    <div className="yx-tim-muted">From {dateText(s.effectiveFrom)}</div>
                  </th>
                  <td>{s.rates.map((r) => `${r.category} +${rupees(r.monthlyIncrease)}`).join(', ')}</td>
                  <td>
                    <SendButton label={`Send arrears to ${monthText(p.month)}`} onSend={() => p.onPost({ kind: 'settlement', id: s.id })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Card title="Lay-off and VRS">
        <div className="yx-tim-row">
          <Button onClick={() => setLayoff(true)}>Record lay-off days</Button>
          <SendButton label={`Send ${monthText(p.month)} lay-off pay`} onSend={() => p.onPost({ kind: 'layoff' })} />
          <Button onClick={() => setVrs(true)}>Pay VRS</Button>
        </div>
      </Card>
      {union && <UnionDrawer onClose={() => setUnion(false)} onSave={p.onAddUnion} />}
      {auth && u && <AuthDrawer unions={u.unions} onSearch={p.onSearch} onClose={() => setAuth(false)} onSave={p.onAuthorise} />}
      {layoff && <PersonAmountDrawer title="Lay-off days" field="Days laid off" pattern={/^\d{1,2}(\.5)?$/} hint="Whole or half days." onSearch={p.onSearch} onClose={() => setLayoff(false)} onSave={(employeeId, days) => p.onLayoff({ employeeId, days })} />}
      {vrs && <VrsDrawer onSearch={p.onSearch} onClose={() => setVrs(false)} onSave={p.onVrs} />}
    </div>
  );
}

function UnionDrawer({ onClose, onSave }: { onClose: () => void; onSave: SpecialPayScreenProps['onAddUnion'] }) {
  const [name, setName] = useState('');
  const [reg, setReg] = useState('');
  const errors: FormErrorItem[] = name.trim().length < 2 ? [{ fieldId: 'un-name', message: 'Name the union.' }] : [];
  return (
    <FormDrawer title="Add a union" confirm="Add" errors={errors} onClose={onClose} onSave={() => onSave({ name: name.trim(), ...(reg.trim() ? { registrationNo: reg.trim() } : {}) })}>
      {(errorOf) => (
        <>
          <FormField id="un-name" label="Name" required error={errorOf('un-name')}>
            <TextField value={name} onChange={setName} maxLength={200} />
          </FormField>
          <FormField id="un-reg" label="Registration number">
            <TextField value={reg} onChange={setReg} maxLength={60} />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}

function AuthDrawer({ unions, onSearch, onClose, onSave }: { unions: UnionsView['unions']; onSearch: Search; onClose: () => void; onSave: SpecialPayScreenProps['onAuthorise'] }) {
  const [union, setUnion] = useState<string | null>(unions[0]?.id ?? null);
  const [who, setWho] = useState<PersonHit | null>(null);
  const [kind, setKind] = useState<'fixed' | 'percent'>('fixed');
  const [value, setValue] = useState('');
  const [from, setFrom] = useState('');
  const errors: FormErrorItem[] = [...(!who ? [{ fieldId: 'au-who', message: 'Choose the worker.' }] : []), ...(!/^\d{1,8}(\.\d{1,2})?$/.test(value) || Number(value) <= 0 || (kind === 'percent' && Number(value) >= 100) ? [{ fieldId: 'au-value', message: kind === 'fixed' ? 'The dues a month in rupees.' : 'The per cent of basic and DA.' }] : []), ...(!DAY.test(from) ? [{ fieldId: 'au-from', message: 'The day the worker signed from.' }] : [])];
  return (
    <FormDrawer title="Record a check-off authorisation" subtitle="Dues are deducted only for a worker who signed one." confirm="Save" errors={errors} onClose={onClose} onSave={() => onSave({ unionId: union!, employeeId: who!.id, duesKind: kind, duesValue: value, validFrom: from })}>
      {(errorOf) => (
        <>
          <FormField id="au-union" label="Union">
            <Select value={union} onChange={setUnion} options={unions.map((x) => ({ value: x.id, label: x.name }))} />
          </FormField>
          <PersonPicker id="au-who" label="Worker" value={who} onChange={setWho} onSearch={onSearch} error={errorOf('au-who')} />
          <FormField id="au-kind" label="Dues">
            <Segment label="Dues" value={kind} onChange={setKind} options={[{ value: 'fixed', label: 'Fixed amount' }, { value: 'percent', label: 'Per cent of basic and DA' }]} />
          </FormField>
          <FormField id="au-value" label={kind === 'fixed' ? 'Amount a month (₹)' : 'Per cent'} required error={errorOf('au-value')}>
            <TextField value={value} onChange={setValue} inputMode="decimal" />
          </FormField>
          <FormField id="au-from" label="From" required error={errorOf('au-from')}>
            <TextField type="date" value={from} onChange={setFrom} />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}

function PersonAmountDrawer({ title, field, pattern, hint, onSearch, onClose, onSave }: { title: string; field: string; pattern: RegExp; hint: string; onSearch: Search; onClose: () => void; onSave: (employeeId: string, value: string) => Promise<unknown> }) {
  const [who, setWho] = useState<PersonHit | null>(null);
  const [value, setValue] = useState('');
  const errors: FormErrorItem[] = [...(!who ? [{ fieldId: 'pa-who', message: 'Choose the person.' }] : []), ...(!pattern.test(value) ? [{ fieldId: 'pa-value', message: hint }] : [])];
  return (
    <FormDrawer title={title} confirm="Save" errors={errors} onClose={onClose} onSave={() => onSave(who!.id, value)}>
      {(errorOf) => (
        <>
          <PersonPicker id="pa-who" label="Person" value={who} onChange={setWho} onSearch={onSearch} error={errorOf('pa-who')} />
          <FormField id="pa-value" label={field} required error={errorOf('pa-value')} helper={hint}>
            <TextField value={value} onChange={setValue} inputMode="decimal" />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}

function VrsDrawer({ onSearch, onClose, onSave }: { onSearch: Search; onClose: () => void; onSave: SpecialPayScreenProps['onVrs'] }) {
  const [who, setWho] = useState<PersonHit | null>(null);
  const [amount, setAmount] = useState('');
  const [prior, setPrior] = useState('0');
  const errors: FormErrorItem[] = [...(!who ? [{ fieldId: 'vr-who', message: 'Choose the person.' }] : []), ...(!MONEY.test(amount) || Number(amount) <= 0 ? [{ fieldId: 'vr-amount', message: 'The VRS compensation.' }] : []), ...(!MONEY.test(prior) ? [{ fieldId: 'vr-prior', message: 'VRS exemption claimed before (0 if none).' }] : [])];
  return (
    <FormDrawer title="Pay VRS" subtitle="Exempt up to what is left of the lifetime limit; the rest is taxed as salary. Sent to payroll for approval." confirm="Send to payroll" errors={errors} onClose={onClose} onSave={() => onSave({ employeeId: who!.id, amount, priorExemption: prior })}>
      {(errorOf) => (
        <>
          <PersonPicker id="vr-who" label="Person" value={who} onChange={setWho} onSearch={onSearch} error={errorOf('vr-who')} />
          <FormField id="vr-amount" label="VRS compensation (₹)" required error={errorOf('vr-amount')}>
            <TextField value={amount} onChange={setAmount} inputMode="decimal" />
          </FormField>
          <FormField id="vr-prior" label="Exemption claimed before (₹)" required error={errorOf('vr-prior')}>
            <TextField value={prior} onChange={setPrior} inputMode="decimal" />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}

// ------------------------------------------------------------------------------------------ my incentive statement (PAY-33)

export function MyIncentivesScreen({ data }: { data: MyIncentives | null }) {
  return (
    <LivePage title="My incentives" description="Your incentive and commission results and any clawbacks." state={data ? 'ready' : 'loading'} what="your incentives">
      {data && !data.results.length && <EmptyState title="No incentive results yet" description="Results appear here once payroll records them." />}
      {data && data.results.length > 0 && (
        <table className="yx-tim-table" aria-label="My incentive results">
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Plan</th>
              <th scope="col">Quota</th>
              <th scope="col">Achieved</th>
              <th scope="col">Pay</th>
            </tr>
          </thead>
          <tbody>
            {data.results.map((r) => (
              <tr key={r.id}>
                <th scope="row">{monthText(r.month)}</th>
                <td>{r.plan}</td>
                <td>{r.quota}</td>
                <td>
                  {r.actual} ({r.workings?.attainment ?? '0'} %)
                </td>
                <td>
                  {rupees(r.amount)} {r.sentToPayroll ? <Badge tone="success">In payroll</Badge> : <Badge tone="neutral">Being checked</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data && data.clawbacks.length > 0 && (
        <Card title="Clawbacks">
          <ul>
            {data.clawbacks.map((c) => (
              <li key={c.id}>
                {monthText(c.month)}: {rupees(c.amount)} · {c.reason}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </LivePage>
  );
}

function W9Drawer({ who, onClose, onSave }: { who: { consultantId: string; name: string }; onClose: () => void; onSave: CountryPacksScreenProps['onW9'] }) {
  const [x, setX] = useState({ tinKind: 'SSN' as 'SSN' | 'EIN', tin: '', legalName: who.name, street: '', city: '', state: '', zip: '', receivedOn: '' });
  const errors: FormErrorItem[] = [
    ...(!/^\d{9}$/.test(x.tin) ? [{ fieldId: 'w9-tin', message: 'The TIN is 9 digits (no dashes).' }] : []),
    ...(x.legalName.trim().length < 2 ? [{ fieldId: 'w9-name', message: 'The legal name on the W-9.' }] : []),
    ...(x.street.trim().length < 3 || x.city.trim().length < 2 || !/^[A-Za-z]{2}$/.test(x.state) || !/^\d{5}(-\d{4})?$/.test(x.zip) ? [{ fieldId: 'w9-addr', message: 'Street, city, state (2 letters) and ZIP.' }] : []),
    ...(!DAY.test(x.receivedOn) ? [{ fieldId: 'w9-on', message: 'The day the W-9 was received.' }] : []),
  ];
  return (
    <FormDrawer title={`W-9 for ${who.name}`} subtitle="The TIN is stored encrypted; only the last four show." confirm="Save" errors={errors} onClose={onClose} onSave={() => onSave({ consultantId: who.consultantId, ...x, legalName: x.legalName.trim(), street: x.street.trim(), city: x.city.trim(), state: x.state.toUpperCase() })}>
      {(errorOf) => (
        <>
          <FormField id="w9-kind" label="TIN type">
            <Segment label="TIN type" value={x.tinKind} onChange={(tinKind) => setX({ ...x, tinKind })} options={[{ value: 'SSN', label: 'SSN' }, { value: 'EIN', label: 'EIN' }]} />
          </FormField>
          <FormField id="w9-tin" label="TIN" required error={errorOf('w9-tin')}>
            <TextField value={x.tin} onChange={(tin) => setX({ ...x, tin })} inputMode="numeric" maxLength={9} />
          </FormField>
          <FormField id="w9-name" label="Legal name" required error={errorOf('w9-name')}>
            <TextField value={x.legalName} onChange={(legalName) => setX({ ...x, legalName })} maxLength={200} />
          </FormField>
          <FormField id="w9-addr" label="Street" required error={errorOf('w9-addr')}>
            <TextField value={x.street} onChange={(street) => setX({ ...x, street })} maxLength={200} />
          </FormField>
          <FormField id="w9-city" label="City">
            <TextField value={x.city} onChange={(city) => setX({ ...x, city })} maxLength={100} />
          </FormField>
          <FormField id="w9-state" label="State">
            <TextField value={x.state} onChange={(state) => setX({ ...x, state })} maxLength={2} />
          </FormField>
          <FormField id="w9-zip" label="ZIP">
            <TextField value={x.zip} onChange={(zip) => setX({ ...x, zip })} maxLength={10} />
          </FormField>
          <FormField id="w9-on" label="Received on" required error={errorOf('w9-on')}>
            <TextField type="date" value={x.receivedOn} onChange={(receivedOn) => setX({ ...x, receivedOn })} />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}

function WpsDrawer({ onSearch, onClose, onSave }: { onSearch: Search; onClose: () => void; onSave: CountryPacksScreenProps['onWpsIds'] }) {
  const [who, setWho] = useState<PersonHit | null>(null);
  const [x, setX] = useState({ personId: '', routingCode: '', iban: '' });
  const errors: FormErrorItem[] = [
    ...(!who ? [{ fieldId: 'wp-who', message: 'Choose the person.' }] : []),
    ...(!/^\d{14}$/.test(x.personId) ? [{ fieldId: 'wp-pid', message: 'The person id from the labour card: 14 digits.' }] : []),
    ...(!/^\d{9}$/.test(x.routingCode) ? [{ fieldId: 'wp-route', message: 'The bank routing code: 9 digits.' }] : []),
    ...(!/^AE\d{21}$/.test(x.iban.toUpperCase()) ? [{ fieldId: 'wp-iban', message: 'A UAE IBAN: AE and 21 digits.' }] : []),
  ];
  return (
    <FormDrawer title="WPS ids" subtitle="The IBAN is stored encrypted." confirm="Save" errors={errors} onClose={onClose} onSave={() => onSave({ employeeId: who!.id, ...x, iban: x.iban.toUpperCase() })}>
      {(errorOf) => (
        <>
          <PersonPicker id="wp-who" label="Person" value={who} onChange={setWho} onSearch={onSearch} error={errorOf('wp-who')} />
          <FormField id="wp-pid" label="Person id" required error={errorOf('wp-pid')}>
            <TextField value={x.personId} onChange={(personId) => setX({ ...x, personId })} inputMode="numeric" maxLength={14} />
          </FormField>
          <FormField id="wp-route" label="Routing code" required error={errorOf('wp-route')}>
            <TextField value={x.routingCode} onChange={(routingCode) => setX({ ...x, routingCode })} inputMode="numeric" maxLength={9} />
          </FormField>
          <FormField id="wp-iban" label="IBAN" required error={errorOf('wp-iban')}>
            <TextField value={x.iban} onChange={(iban) => setX({ ...x, iban })} maxLength={23} />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}

// ------------------------------------------------------------------------------------------ earned wage access (PAY-26, PAY-27)

export interface EwaAdminScreenProps {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  month: string;
  onMonth: (m: string) => void;
  nameOf: (employeeId: string) => string;
  policies: EwaPolicyView[] | null;
  draws: EwaDrawView[] | null;
  onPolicy: (x: Omit<EwaPolicyView, 'id'>) => Promise<unknown>;
  onPaid: (d: EwaDrawView, reference: string) => Promise<unknown>;
  onFailed: (d: EwaDrawView, reason: string) => Promise<unknown>;
}

const DRAW: Record<EwaDrawView['status'], { label: string; tone: BadgeTone }> = { requested: { label: 'To pay', tone: 'warning' }, paid: { label: 'Paid, recovered in payroll', tone: 'success' }, failed: { label: 'Failed', tone: 'danger' }, cancelled: { label: 'Cancelled', tone: 'neutral' } };

export function EwaAdminScreen(p: EwaAdminScreenProps) {
  const [policy, setPolicy] = useState(false);
  const [paying, setPaying] = useState<EwaDrawView | null>(null);
  const [failing, setFailing] = useState<EwaDrawView | null>(null);
  const current = p.policies?.[0] ?? null;
  return (
    <LivePage title="Earned wage access" description="People draw part of the pay they have already earned this month; payroll pays it and recovers it in the month's payroll." state={p.state} onRetry={p.onRetry} what="earned wage access" grantedBy="your payroll admin">
      <div className="yx-tim-row">
        <EntityPicker entities={p.entities} value={p.entityId} onChange={p.onEntity} />
        <FormField id="ewa-month" label="Month">
          <TextField type="month" value={p.month} onChange={p.onMonth} />
        </FormField>
      </div>
      {p.entityId && (
        <>
          <Card title="Policy" actions={<Button onClick={() => setPolicy(true)}>{current ? 'Change from a date' : 'Set up'}</Button>}>
            {!current ? (
              <p className="yx-tim-muted">Off. Nobody can draw until a policy is switched on.</p>
            ) : (
              <p>
                {current.enabled ? <Badge tone="success">On</Badge> : <Badge tone="neutral">Off</Badge>} From {dateText(current.validFrom)}: {current.percentAvailable} % of earned pay, {rupees(current.minAmount)} to {rupees(current.maxAmount)}, {current.drawsPerMonth} draws a month, closed {current.blackoutDays} days before cut-off, fee {rupees(current.fee)} paid by the {current.feePayer}.
              </p>
            )}
          </Card>
          {p.draws && !p.draws.length && <EmptyState compact title="No draws this month" />}
          {p.draws && p.draws.length > 0 && (
            <table className="yx-tim-table" aria-label="Draws">
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Fee</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="yx-sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.draws.map((d) => (
                  <tr key={d.id}>
                    <th scope="row">
                      {p.nameOf(d.employeeId)}
                      <div className="yx-tim-muted">{dateText(d.createdAt.slice(0, 10))}</div>
                    </th>
                    <td>{rupees(d.amount)}</td>
                    <td>
                      {rupees(d.fee)} ({d.feePayer})
                    </td>
                    <td>
                      <Badge tone={DRAW[d.status].tone}>{DRAW[d.status].label}</Badge>
                    </td>
                    <td>
                      {d.status === 'requested' && (
                        <div className="yx-tim-row">
                          <Button size="sm" variant="primary" onClick={() => setPaying(d)}>
                            Record payment
                          </Button>
                          <Button size="sm" onClick={() => setFailing(d)}>
                            Failed
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {policy && <PolicyDrawer onClose={() => setPolicy(false)} onSave={p.onPolicy} />}
      {paying && <TextDrawer title={`Payment to ${p.nameOf(paying.employeeId)}`} label="Bank reference" pattern={/^[A-Za-z0-9/-]{4,60}$/} hint="The reference of the transfer." confirm="Record" onClose={() => setPaying(null)} onSave={(ref) => p.onPaid(paying, ref)} />}
      {failing && <TextDrawer title="Payment failed" label="Why" pattern={/^.{5,300}$/} hint="At least 5 letters." confirm="Record" onClose={() => setFailing(null)} onSave={(why) => p.onFailed(failing, why)} />}
    </LivePage>
  );
}

function PolicyDrawer({ onClose, onSave }: { onClose: () => void; onSave: EwaAdminScreenProps['onPolicy'] }) {
  const [x, setX] = useState({ validFrom: '', enabled: true, percentAvailable: '50', minAmount: '500', maxAmount: '20000', drawsPerMonth: 3, blackoutDays: 3, fee: '0', feePayer: 'employer' as 'employee' | 'employer' });
  const errors: FormErrorItem[] = [
    ...(!DAY.test(x.validFrom) ? [{ fieldId: 'ep-from', message: 'The first day it applies.' }] : []),
    ...(!/^\d{1,3}(\.\d{1,2})?$/.test(x.percentAvailable) || Number(x.percentAvailable) > 100 || Number(x.percentAvailable) <= 0 ? [{ fieldId: 'ep-pct', message: 'A per cent above 0, at most 100.' }] : []),
    ...(!MONEY.test(x.minAmount) || !MONEY.test(x.maxAmount) || Number(x.maxAmount) < Number(x.minAmount) ? [{ fieldId: 'ep-range', message: 'The least and most a draw can be.' }] : []),
    ...(!MONEY.test(x.fee) ? [{ fieldId: 'ep-fee', message: 'The fee a draw (0 for none).' }] : []),
  ];
  return (
    <FormDrawer title="Earned wage access policy" subtitle="From a date; the earlier policy applies until then." confirm="Save" errors={errors} onClose={onClose} onSave={() => onSave(x)}>
      {(errorOf) => (
        <>
          <Checkbox label="On" checked={x.enabled} onChange={(enabled) => setX({ ...x, enabled })} />
          <FormField id="ep-from" label="From" required error={errorOf('ep-from')}>
            <TextField type="date" value={x.validFrom} onChange={(validFrom) => setX({ ...x, validFrom })} />
          </FormField>
          <FormField id="ep-pct" label="Share of earned pay (%)" required error={errorOf('ep-pct')}>
            <TextField value={x.percentAvailable} onChange={(percentAvailable) => setX({ ...x, percentAvailable })} inputMode="decimal" />
          </FormField>
          <FormField id="ep-range" label="Least a draw (₹)" error={errorOf('ep-range')}>
            <TextField value={x.minAmount} onChange={(minAmount) => setX({ ...x, minAmount })} inputMode="decimal" />
          </FormField>
          <FormField id="ep-max" label="Most a draw (₹)">
            <TextField value={x.maxAmount} onChange={(maxAmount) => setX({ ...x, maxAmount })} inputMode="decimal" />
          </FormField>
          <FormField id="ep-draws" label="Draws a month">
            <TextField value={String(x.drawsPerMonth)} onChange={(v) => setX({ ...x, drawsPerMonth: Number(v) || 1 })} inputMode="numeric" />
          </FormField>
          <FormField id="ep-blackout" label="Closed days before cut-off">
            <TextField value={String(x.blackoutDays)} onChange={(v) => setX({ ...x, blackoutDays: Number(v) || 0 })} inputMode="numeric" />
          </FormField>
          <FormField id="ep-fee" label="Fee a draw (₹)" error={errorOf('ep-fee')}>
            <TextField value={x.fee} onChange={(fee) => setX({ ...x, fee })} inputMode="decimal" />
          </FormField>
          <FormField id="ep-payer" label="Fee paid by">
            <Segment label="Fee paid by" value={x.feePayer} onChange={(feePayer) => setX({ ...x, feePayer })} options={[{ value: 'employer', label: 'The company' }, { value: 'employee', label: 'The person' }]} />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}

function TextDrawer({ title, label, pattern, hint, confirm, onClose, onSave }: { title: string; label: string; pattern: RegExp; hint: string; confirm: string; onClose: () => void; onSave: (v: string) => Promise<unknown> }) {
  const [v, setV] = useState('');
  const errors: FormErrorItem[] = pattern.test(v.trim()) ? [] : [{ fieldId: 'td-v', message: hint }];
  return (
    <FormDrawer title={title} confirm={confirm} errors={errors} onClose={onClose} onSave={() => onSave(v.trim())}>
      {(errorOf) => (
        <FormField id="td-v" label={label} required error={errorOf('td-v')}>
          <TextField value={v} onChange={setV} maxLength={300} />
        </FormField>
      )}
    </FormDrawer>
  );
}

export function MyEwaScreen({ data, onDraw }: { data: MyEwa | null; onDraw: (amount: string) => Promise<unknown> }) {
  const [asking, setAsking] = useState(false);
  return (
    <LivePage
      title="Get paid early"
      description="Draw part of the pay you have already earned this month. It is taken back in full from this month's payslip."
      state={data ? 'ready' : 'loading'}
      what="earned wage access"
      actions={data?.open ? (
        <Button variant="primary" onClick={() => setAsking(true)}>
          Draw now
        </Button>
      ) : undefined}
    >
      {data && (
        <>
          {data.reasons.length > 0 && (
            <InlineAlert tone="info" title="Not open to you right now">
              {data.reasons.join(' ')}
            </InlineAlert>
          )}
          {data.quote && (
            <Card title={`Available now: ${rupees(data.quote.available)}`}>
              <p className="yx-tim-muted">
                Earned so far {rupees(data.quote.earned)}: expected net {rupees(data.quote.expectedNet)} ÷ {data.quote.monthDays} days × {data.quote.payableDays} days, less draws {rupees(data.quote.drawn)} and dues {rupees(data.quote.deductionsDue)}.
              </p>
            </Card>
          )}
          {data.draws.length > 0 && (
            <table className="yx-tim-table" aria-label="My draws">
              <tbody>
                {data.draws.map((d) => (
                  <tr key={d.id}>
                    <th scope="row">{dateText(d.createdAt.slice(0, 10))}</th>
                    <td>{rupees(d.amount)}</td>
                    <td>
                      <Badge tone={DRAW[d.status].tone}>{DRAW[d.status].label}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {asking && data.policy && data.quote && <DrawDrawer policy={data.policy} available={data.quote.available} onClose={() => setAsking(false)} onSave={onDraw} />}
        </>
      )}
    </LivePage>
  );
}

function DrawDrawer({ policy, available, onClose, onSave }: { policy: NonNullable<MyEwa['policy']>; available: string; onClose: () => void; onSave: (amount: string) => Promise<unknown> }) {
  const [amount, setAmount] = useState('');
  const [agree, setAgree] = useState(false);
  const fee = policy.feePayer === 'employee' ? Number(policy.fee) : 0;
  const errors: FormErrorItem[] = [
    ...(!MONEY.test(amount) || Number(amount) < Number(policy.minAmount) || Number(amount) > Number(available) ? [{ fieldId: 'dr-amount', message: `From ${rupees(policy.minAmount)} to ${rupees(available)}.` }] : []),
    ...(!agree ? [{ fieldId: 'dr-agree', message: 'Accept how it is recovered.' }] : []),
  ];
  return (
    <FormDrawer title="Draw earned pay" confirm="Ask for it" errors={errors} onClose={onClose} onSave={() => onSave(amount)}>
      {(errorOf) => (
        <>
          <FormField id="dr-amount" label="Amount (₹)" required error={errorOf('dr-amount')} helper={`Up to ${rupees(available)}.`}>
            <TextField value={amount} onChange={setAmount} inputMode="decimal" />
          </FormField>
          <FormField id="dr-agree" label="Recovery" error={errorOf('dr-agree')}>
            <Checkbox checked={agree} onChange={setAgree} label={`I understand ${rupees(String((Number(amount || 0) + fee).toFixed(2)))} ${fee ? `(with the ${rupees(policy.fee)} fee) ` : ''}is taken from this month's pay.`} />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}

// ------------------------------------------------------------------------------------------ equity (new)

export interface EquityScreenProps {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  nameOf: (employeeId: string) => string;
  onSearch: Search;
  data: EquityOverview | null;
  onPlan: (x: { name: string; kind: 'ESOP' | 'RSU' | 'SAR'; poolUnits: number; exitWindowDays: number }) => Promise<unknown>;
  onValuation: (x: { valuedOn: string; fmv: string; basis: 'listed_price' | 'merchant_banker' }) => Promise<unknown>;
  onGrant: (x: { planId: string; employeeId: string; grantedOn: string; units: number; exercisePrice: string; cliffMonths: number; vestingMonths: number; everyMonths: number }) => Promise<unknown>;
  onConfirm: (eventId: string) => Promise<unknown>;
  onPaid: (exerciseId: string, reference: string) => Promise<unknown>;
  onCapTable: (planId: string) => Promise<unknown>;
}

export function EquityScreen(p: EquityScreenProps) {
  const [plan, setPlan] = useState(false);
  const [val, setVal] = useState(false);
  const [grant, setGrant] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);
  const { busy, error, run } = useRun();
  const d = p.data;
  return (
    <LivePage title="Equity" description="Plans and their pools, valuations, grants approved by a second person, vesting, exercises and the cap table." state={p.state} onRetry={p.onRetry} what="equity" grantedBy="your payroll admin">
      <EntityPicker entities={p.entities} value={p.entityId} onChange={p.onEntity} />
      <Failed error={error} />
      {p.entityId && d && (
        <>
          <Card title="Plans" actions={<Button onClick={() => setPlan(true)}>Add a plan</Button>}>
            {!d.plans.length ? (
              <p className="yx-tim-muted">No plans yet.</p>
            ) : (
              <table className="yx-tim-table" aria-label="Equity plans">
                <tbody>
                  {d.plans.map((x) => (
                    <tr key={x.id}>
                      <th scope="row">
                        {x.name} · {x.kind}
                      </th>
                      <td>
                        {x.granted} of {x.poolUnits} granted · {x.available} left
                      </td>
                      <td>
                        <Button size="sm" loading={busy === `cap-${x.id}`} onClick={() => void run(`cap-${x.id}`, () => p.onCapTable(x.id))}>
                          Cap table
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <Card title="Valuations" actions={<Button onClick={() => setVal(true)}>Add a valuation</Button>}>
            {!d.valuations.length ? <p className="yx-tim-muted">No valuations yet. An exercise is taxed at the value on or before its date.</p> : <p>{d.valuations.map((v) => `${dateText(v.valuedOn)}: ₹${v.fmv}`).join(' · ')}</p>}
          </Card>
          <Card title="Grants" actions={<Button variant="primary" onClick={() => setGrant(true)} disabled={!d.plans.length}>Make a grant</Button>}>
            {!d.grants.length ? (
              <p className="yx-tim-muted">No grants yet.</p>
            ) : (
              <table className="yx-tim-table" aria-label="Grants">
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    <th scope="col">Units</th>
                    <th scope="col">Vested</th>
                    <th scope="col">Exercised</th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="yx-sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.grants.map((g) => (
                    <tr key={g.id}>
                      <th scope="row">
                        {p.nameOf(g.employeeId)}
                        <div className="yx-tim-muted">
                          {dateText(g.grantedOn)} at ₹{g.exercisePrice}
                        </div>
                      </th>
                      <td>{g.units}</td>
                      <td>{g.vested}</td>
                      <td>{g.exercised}</td>
                      <td>
                        <Badge tone={g.status === 'active' ? 'success' : g.status === 'pending' ? 'warning' : 'neutral'}>{g.status === 'pending' ? 'Waiting for approval' : g.status === 'active' ? 'Active' : g.status}</Badge>
                      </td>
                      <td>
                        <div className="yx-tim-row">
                          {g.events
                            .filter((e) => e.kind === 'milestone' && e.state === 'scheduled')
                            .map((e) => (
                              <Button key={e.id} size="sm" loading={busy === e.id} onClick={() => void run(e.id, () => p.onConfirm(e.id))}>
                                Confirm {e.milestone}
                              </Button>
                            ))}
                          {g.exercises
                            .filter((x) => x.status === 'approved')
                            .map((x) => (
                              <Button key={x.id} size="sm" onClick={() => setPaying(x.id)}>
                                Price received ({x.units})
                              </Button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
      {plan && <EquityPlanDrawer onClose={() => setPlan(false)} onSave={p.onPlan} />}
      {val && <ValuationDrawer onClose={() => setVal(false)} onSave={p.onValuation} />}
      {grant && d && <GrantDrawer plans={d.plans} onSearch={p.onSearch} onClose={() => setGrant(false)} onSave={p.onGrant} />}
      {paying && <TextDrawer title="Exercise price received" label="Payment reference" pattern={/^[A-Za-z0-9/-]{4,60}$/} hint="The reference of the payment." confirm="Record" onClose={() => setPaying(null)} onSave={(ref) => p.onPaid(paying, ref)} />}
    </LivePage>
  );
}

function EquityPlanDrawer({ onClose, onSave }: { onClose: () => void; onSave: EquityScreenProps['onPlan'] }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'ESOP' | 'RSU' | 'SAR'>('ESOP');
  const [pool, setPool] = useState('');
  const [win, setWin] = useState('90');
  const errors: FormErrorItem[] = [...(name.trim().length < 2 ? [{ fieldId: 'eq-name', message: 'Name the plan.' }] : []), ...(!/^\d{1,9}$/.test(pool) || Number(pool) < 1 ? [{ fieldId: 'eq-pool', message: 'The units in the pool.' }] : []), ...(!/^\d{1,4}$/.test(win) ? [{ fieldId: 'eq-win', message: 'Days to exercise after leaving.' }] : [])];
  return (
    <FormDrawer title="Add an equity plan" confirm="Add" errors={errors} onClose={onClose} onSave={() => onSave({ name: name.trim(), kind, poolUnits: Number(pool), exitWindowDays: Number(win) })}>
      {(errorOf) => (
        <>
          <FormField id="eq-name" label="Name" required error={errorOf('eq-name')}>
            <TextField value={name} onChange={setName} maxLength={200} />
          </FormField>
          <FormField id="eq-kind" label="Kind">
            <Segment label="Kind" value={kind} onChange={setKind} options={[{ value: 'ESOP', label: 'ESOP' }, { value: 'RSU', label: 'RSU' }, { value: 'SAR', label: 'SAR' }]} />
          </FormField>
          <FormField id="eq-pool" label="Pool (units)" required error={errorOf('eq-pool')}>
            <TextField value={pool} onChange={setPool} inputMode="numeric" />
          </FormField>
          <FormField id="eq-win" label="Days to exercise after leaving" error={errorOf('eq-win')}>
            <TextField value={win} onChange={setWin} inputMode="numeric" />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}

function ValuationDrawer({ onClose, onSave }: { onClose: () => void; onSave: EquityScreenProps['onValuation'] }) {
  const [on, setOn] = useState('');
  const [fmv, setFmv] = useState('');
  const [basis, setBasis] = useState<'listed_price' | 'merchant_banker'>('merchant_banker');
  const errors: FormErrorItem[] = [...(!DAY.test(on) ? [{ fieldId: 'va-on', message: 'The valuation date.' }] : []), ...(!/^\d{1,10}(\.\d{1,4})?$/.test(fmv) || Number(fmv) <= 0 ? [{ fieldId: 'va-fmv', message: 'The fair market value a unit.' }] : [])];
  return (
    <FormDrawer title="Add a valuation" confirm="Add" errors={errors} onClose={onClose} onSave={() => onSave({ valuedOn: on, fmv, basis })}>
      {(errorOf) => (
        <>
          <FormField id="va-on" label="Valued on" required error={errorOf('va-on')}>
            <TextField type="date" value={on} onChange={setOn} />
          </FormField>
          <FormField id="va-fmv" label="Fair market value a unit (₹)" required error={errorOf('va-fmv')}>
            <TextField value={fmv} onChange={setFmv} inputMode="decimal" />
          </FormField>
          <FormField id="va-basis" label="Basis">
            <Segment label="Basis" value={basis} onChange={setBasis} options={[{ value: 'merchant_banker', label: 'Merchant banker' }, { value: 'listed_price', label: 'Listed price' }]} />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}

function GrantDrawer({ plans, onSearch, onClose, onSave }: { plans: EquityOverview['plans']; onSearch: Search; onClose: () => void; onSave: EquityScreenProps['onGrant'] }) {
  const [plan, setPlan] = useState<string | null>(plans[0]?.id ?? null);
  const [who, setWho] = useState<PersonHit | null>(null);
  const [on, setOn] = useState('');
  const [units, setUnits] = useState('');
  const [price, setPrice] = useState('');
  const [cliff, setCliff] = useState('12');
  const [months, setMonths] = useState('48');
  const [every, setEvery] = useState('3');
  const left = plans.find((x) => x.id === plan)?.available ?? 0;
  const errors: FormErrorItem[] = [
    ...(!who ? [{ fieldId: 'gr-who', message: 'Choose the person.' }] : []),
    ...(!DAY.test(on) ? [{ fieldId: 'gr-on', message: 'The grant date.' }] : []),
    ...(!/^\d{1,9}$/.test(units) || Number(units) < 1 || Number(units) > left ? [{ fieldId: 'gr-units', message: `1 to ${left} units (the pool left).` }] : []),
    ...(!/^\d{1,10}(\.\d{1,4})?$/.test(price) ? [{ fieldId: 'gr-price', message: 'The exercise price a unit.' }] : []),
    ...(!/^\d{1,2}$/.test(cliff) || !/^\d{1,3}$/.test(months) || !/^\d{1,2}$/.test(every) || Number(cliff) > Number(months) || Number(every) < 1 ? [{ fieldId: 'gr-vest', message: 'The cliff within the vesting months; vesting every 1 or more months.' }] : []),
  ];
  return (
    <FormDrawer title="Make a grant" subtitle="Another holder of the equity key approves it; vesting starts then." confirm="Send for approval" errors={errors} onClose={onClose} onSave={() => onSave({ planId: plan!, employeeId: who!.id, grantedOn: on, units: Number(units), exercisePrice: price, cliffMonths: Number(cliff), vestingMonths: Number(months), everyMonths: Number(every) })}>
      {(errorOf) => (
        <>
          <FormField id="gr-plan" label="Plan">
            <Select value={plan} onChange={setPlan} options={plans.map((x) => ({ value: x.id, label: `${x.name} (${x.available} left)` }))} />
          </FormField>
          <PersonPicker id="gr-who" label="Person" value={who} onChange={setWho} onSearch={onSearch} error={errorOf('gr-who')} />
          <FormField id="gr-on" label="Granted on" required error={errorOf('gr-on')}>
            <TextField type="date" value={on} onChange={setOn} />
          </FormField>
          <FormField id="gr-units" label="Units" required error={errorOf('gr-units')}>
            <TextField value={units} onChange={setUnits} inputMode="numeric" />
          </FormField>
          <FormField id="gr-price" label="Exercise price a unit (₹)" required error={errorOf('gr-price')}>
            <TextField value={price} onChange={setPrice} inputMode="decimal" />
          </FormField>
          <FormField id="gr-vest" label="Cliff (months)" error={errorOf('gr-vest')}>
            <TextField value={cliff} onChange={setCliff} inputMode="numeric" />
          </FormField>
          <FormField id="gr-months" label="Vesting over (months)">
            <TextField value={months} onChange={setMonths} inputMode="numeric" />
          </FormField>
          <FormField id="gr-every" label="Vests every (months)">
            <TextField value={every} onChange={setEvery} inputMode="numeric" />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}

export function MyEquityScreen({ data, onExercise }: { data: GrantView[] | null; onExercise: (grantId: string, units: number) => Promise<unknown> }) {
  const [exercising, setExercising] = useState<GrantView | null>(null);
  return (
    <LivePage title="My equity" description="Your grants, how they vest, and exercising vested units. An exercise is taxed in its month as a perquisite." state={data ? 'ready' : 'loading'} what="your equity">
      {data && !data.length && <EmptyState title="No grants" description="Grants appear here once they are approved." />}
      {data?.map((g) => (
        <Card
          key={g.id}
          title={`${g.plan?.name ?? 'Grant'}: ${g.units} units at ₹${g.exercisePrice}`}
          actions={g.exercisable > 0 ? (
            <Button variant="primary" onClick={() => setExercising(g)}>
              Exercise
            </Button>
          ) : undefined}
        >
          <p>
            {g.vested} vested ({g.exercisable} to exercise) · {g.unvested} still to vest{g.lapsed ? ` · ${g.lapsed} lapsed` : ''}
          </p>
          <ul>
            {g.events.map((e) => (
              <li key={e.id}>
                {e.kind === 'milestone' ? e.milestone : dateText(e.vestOn)}: {e.units} units · {e.state === 'vested' ? 'vested' : e.state === 'lapsed' ? 'lapsed' : 'to vest'}
              </li>
            ))}
          </ul>
        </Card>
      ))}
      {exercising && <ExerciseDrawer grant={exercising} onClose={() => setExercising(null)} onSave={(units) => onExercise(exercising.id, units)} />}
    </LivePage>
  );
}

function ExerciseDrawer({ grant, onClose, onSave }: { grant: GrantView; onClose: () => void; onSave: (units: number) => Promise<unknown> }) {
  const [units, setUnits] = useState('');
  const errors: FormErrorItem[] = !/^\d{1,9}$/.test(units) || Number(units) < 1 || Number(units) > grant.exercisable ? [{ fieldId: 'ex-units', message: `1 to ${grant.exercisable} units.` }] : [];
  return (
    <FormDrawer title="Exercise units" subtitle={`You pay ₹${grant.exercisePrice} a unit; payroll approves it and the gain over the fair value is taxed this month.`} confirm="Ask to exercise" errors={errors} onClose={onClose} onSave={() => onSave(Number(units))}>
      {(errorOf) => (
        <FormField id="ex-units" label="Units" required error={errorOf('ex-units')} helper={units && Number(units) > 0 ? `Price payable ${rupees((Number(units) * Number(grant.exercisePrice)).toFixed(2))}.` : undefined}>
          <TextField value={units} onChange={setUnits} inputMode="numeric" />
        </FormField>
      )}
    </FormDrawer>
  );
}

// ------------------------------------------------------------------------------------------ actuarial (PAY-38)

export interface ActuarialScreenProps {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  data: ActuarialView | null;
  can: { census: boolean; journal: boolean };
  onCensus: (asOf: string, standard: 'IND_AS_19' | 'AS_15') => Promise<unknown>;
  onDownload: (fileId: string, name: string) => Promise<unknown>;
  onRecord: (x: { asOf: string; standard: 'IND_AS_19' | 'AS_15'; kind: 'gratuity' | 'leave'; closing: string; censusId?: string }, report: File | null) => Promise<unknown>;
  onPost: (id: string) => Promise<unknown>;
}

export function ActuarialScreen(p: ActuarialScreenProps) {
  const [asOf, setAsOf] = useState('');
  const [standard, setStandard] = useState<'IND_AS_19' | 'AS_15'>('IND_AS_19');
  const [recording, setRecording] = useState(false);
  const { busy, error, run } = useRun();
  const d = p.data;
  return (
    <LivePage title="Actuarial valuation" description="The census for the actuary (gratuity and leave), and the actuary's figures booked as the provision journal by a second person." state={p.state} onRetry={p.onRetry} what="actuarial valuations" grantedBy="your payroll admin">
      <EntityPicker entities={p.entities} value={p.entityId} onChange={p.onEntity} />
      <Failed error={error} />
      {p.entityId && d && (
        <>
          {p.can.census && (
            <Card title="Census">
              <div className="yx-tim-row">
                <FormField id="ac-asof" label="As at">
                  <TextField type="date" value={asOf} onChange={setAsOf} />
                </FormField>
                <FormField id="ac-std" label="Standard">
                  <Segment label="Standard" value={standard} onChange={setStandard} options={[{ value: 'IND_AS_19', label: 'Ind AS 19' }, { value: 'AS_15', label: 'AS 15' }]} />
                </FormField>
                <Button variant="primary" disabled={!DAY.test(asOf)} loading={busy === 'census'} onClick={() => void run('census', () => p.onCensus(asOf, standard))}>
                  Make census
                </Button>
              </div>
              {d.censuses.length > 0 && (
                <ul>
                  {d.censuses.map((c) => (
                    <li key={c.id} className="yx-tim-row">
                      As at {dateText(c.asOf)} · {c.rows} people · {c.standard.replace('_', ' ')}
                      <Button size="sm" loading={busy === c.id} onClick={() => void run(c.id, () => p.onDownload(c.fileId, `actuarial-census-${c.asOf}.xlsx`))}>
                        Download
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          <Card title="Valuations" actions={p.can.journal ? <Button onClick={() => setRecording(true)}>Record the actuary's figures</Button> : undefined}>
            {!d.valuations.length ? (
              <p className="yx-tim-muted">No valuations recorded.</p>
            ) : (
              <table className="yx-tim-table" aria-label="Valuations">
                <thead>
                  <tr>
                    <th scope="col">As at</th>
                    <th scope="col">Obligation</th>
                    <th scope="col">Journal</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {d.valuations.map((v) => (
                    <tr key={v.id}>
                      <th scope="row">
                        {dateText(v.valuedOn)} · {v.kind === 'gratuity' ? 'Gratuity' : 'Leave'}
                      </th>
                      <td>
                        {rupees(v.opening)} → {rupees(v.closing)}
                      </td>
                      <td>{v.journal.map((j) => `${j.account}: ${j.debit ? `Dr ${rupees(j.debit)}` : `Cr ${rupees(j.credit)}`}`).join('; ') || 'No change'}</td>
                      <td>
                        {v.status === 'posted' ? (
                          <Badge tone="success">Posted</Badge>
                        ) : v.madeByMe ? (
                          <span className="yx-tim-note">Someone else posts it</span>
                        ) : p.can.journal ? (
                          <Button size="sm" variant="primary" loading={busy === `post-${v.id}`} onClick={() => void run(`post-${v.id}`, () => p.onPost(v.id))}>
                            Post journal
                          </Button>
                        ) : (
                          <Badge tone="warning">To post</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
      {recording && d && <RecordDrawer censuses={d.censuses} onClose={() => setRecording(false)} onSave={p.onRecord} />}
    </LivePage>
  );
}

function RecordDrawer({ censuses, onClose, onSave }: { censuses: ActuarialView['censuses']; onClose: () => void; onSave: ActuarialScreenProps['onRecord'] }) {
  const [asOf, setAsOf] = useState('');
  const [kind, setKind] = useState<'gratuity' | 'leave'>('gratuity');
  const [standard, setStandard] = useState<'IND_AS_19' | 'AS_15'>('IND_AS_19');
  const [closing, setClosing] = useState('');
  const [census, setCensus] = useState<string | null>(censuses[0]?.id ?? null);
  const [report, setReport] = useState<File | null>(null);
  const errors: FormErrorItem[] = [...(!DAY.test(asOf) ? [{ fieldId: 'rv-asof', message: 'The valuation date.' }] : []), ...(!/^\d{1,13}(\.\d{1,2})?$/.test(closing) ? [{ fieldId: 'rv-closing', message: 'The closing obligation in rupees.' }] : [])];
  return (
    <FormDrawer title="Record the actuary's figures" subtitle="The journal books the change since the last posted figure." confirm="Record" errors={errors} onClose={onClose} onSave={() => onSave({ asOf, standard, kind, closing, ...(census ? { censusId: census } : {}) }, report)}>
      {(errorOf) => (
        <>
          <FormField id="rv-kind" label="Obligation">
            <Segment label="Obligation" value={kind} onChange={setKind} options={[{ value: 'gratuity', label: 'Gratuity' }, { value: 'leave', label: 'Leave encashment' }]} />
          </FormField>
          <FormField id="rv-std" label="Standard">
            <Segment label="Valuation standard" value={standard} onChange={setStandard} options={[{ value: 'IND_AS_19', label: 'Ind AS 19' }, { value: 'AS_15', label: 'AS 15' }]} />
          </FormField>
          <FormField id="rv-asof" label="As at" required error={errorOf('rv-asof')}>
            <TextField type="date" value={asOf} onChange={setAsOf} />
          </FormField>
          <FormField id="rv-closing" label="Closing obligation (₹)" required error={errorOf('rv-closing')}>
            <TextField value={closing} onChange={setClosing} inputMode="decimal" />
          </FormField>
          {censuses.length > 0 && (
            <FormField id="rv-census" label="From the census">
              <Select value={census} onChange={setCensus} options={censuses.map((c) => ({ value: c.id, label: `As at ${dateText(c.asOf)}` }))} />
            </FormField>
          )}
          <div className="yx-tim-row">
            <FileButton label={report ? 'Change report' : "Attach the actuary's report (PDF)"} accept="application/pdf" ariaLabel="Attach the actuary's report" onFile={setReport} />
            {report && <span className="yx-tim-muted">{report.name}</span>}
          </div>
        </>
      )}
    </FormDrawer>
  );
}

// ------------------------------------------------------------------------------------------ country packs (new)

export interface CountryPacksScreenProps {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  status: PackStatus | null;
  nec: NecSummary | null;
  year: number;
  onYear: (y: number) => void;
  onSwitchOn: (settings: Record<string, string>) => Promise<unknown>;
  onEosb: (month: string) => Promise<{ total: string; rows: { employeeId: string; accrued: string; monthly: string }[] }>;
  onNecFile: () => Promise<unknown>;
  onNecCopy: (consultantId: string) => Promise<unknown>;
  onW9: (x: { consultantId: string; tinKind: 'SSN' | 'EIN'; tin: string; legalName: string; street: string; city: string; state: string; zip: string; receivedOn: string }) => Promise<unknown>;
  onSearch: Search;
  onWpsIds: (x: { employeeId: string; personId: string; routingCode: string; iban: string }) => Promise<unknown>;
  /** Approved runs of the entity, for its WPS salary file. */
  runs: { id: string; label: string }[];
  onWpsFile: (runId: string) => Promise<unknown>;
}

export function CountryPacksScreen(p: CountryPacksScreenProps) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [month, setMonth] = useState('');
  const [eosb, setEosb] = useState<{ total: string; rows: { employeeId: string; accrued: string; monthly: string }[] } | null>(null);
  const [w9, setW9] = useState<{ consultantId: string; name: string } | null>(null);
  const [wps, setWps] = useState(false);
  const [wpsRun, setWpsRun] = useState<string | null>(null);
  const { busy, error, run } = useRun();
  const s = p.status;
  return (
    <LivePage title="Country packs" description="A legal entity outside India is paid once its country's pack is switched on: the pack's rules must be in force and its set-up complete." state={p.state} onRetry={p.onRetry} what="country packs" grantedBy="your payroll admin">
      <EntityPicker entities={p.entities} value={p.entityId} onChange={p.onEntity} />
      <Failed error={error} />
      {s && !s.needed && <InlineAlert tone="info" title="India">Indian legal entities use the India rules; there is nothing to switch on.</InlineAlert>}
      {s?.needed && (
        <Card title={`${s.country} pack${s.manifest ? ` · ${s.manifest.version}` : ''}`}>
          {s.switchedOn ? <Badge tone="success">Switched on</Badge> : <Badge tone="warning">Not switched on</Badge>}
          {s.missing.length > 0 && (
            <ul>
              {s.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
          {s.manifest?.settings.map((x) => (
            <FormField key={x.key} id={`cp-${x.key}`} label={x.label}>
              <TextField value={settings[x.key] ?? s.settings[x.key] ?? ''} onChange={(v) => setSettings({ ...settings, [x.key]: v })} />
            </FormField>
          ))}
          {s.manifest && (
            <Button variant="primary" loading={busy === 'on'} onClick={() => void run('on', () => p.onSwitchOn({ ...s.settings, ...settings }))}>
              {s.switchedOn ? 'Save set-up' : 'Switch on'}
            </Button>
          )}
        </Card>
      )}
      {s?.country === 'AE' && s.switchedOn && (
        <Card title="End-of-service gratuity provision">
          <div className="yx-tim-row">
            <FormField id="cp-month" label="Month">
              <TextField type="month" value={month} onChange={setMonth} />
            </FormField>
            <Button disabled={!MONTH.test(month)} loading={busy === 'eosb'} onClick={() => void run('eosb', async () => setEosb(await p.onEosb(month)))}>
              Work out the provision
            </Button>
          </div>
          {eosb && <p>This month's provision: {eosb.total} AED for {eosb.rows.length} people.</p>}
        </Card>
      )}
      {s?.country === 'AE' && s.switchedOn && (
        <Card title="WPS salary file" actions={<Button onClick={() => setWps(true)}>Record WPS ids</Button>}>
          <div className="yx-tim-row">
            <FormField id="cp-run" label="Approved payroll">
              <Select value={wpsRun} onChange={setWpsRun} placeholder="Choose a payroll" options={p.runs.map((x) => ({ value: x.id, label: x.label }))} />
            </FormField>
            <Button variant="primary" disabled={!wpsRun} loading={busy === 'wps'} onClick={() => void run('wps', () => p.onWpsFile(wpsRun!))}>
              Make the WPS file
            </Button>
          </div>
          <p className="yx-tim-muted">The file is released from Payroll files by someone other than its maker, then sent to the WPS agent.</p>
        </Card>
      )}
      {s?.country === 'US' && s.switchedOn && (
        <Card title="1099-NEC">
          <div className="yx-tim-row">
            <FormField id="cp-year" label="Calendar year">
              <TextField value={String(p.year)} onChange={(v) => p.onYear(Number(v) || p.year)} inputMode="numeric" />
            </FormField>
            <Button variant="primary" loading={busy === 'nec'} onClick={() => void run('nec', p.onNecFile)}>
              Make the 1099-NEC file
            </Button>
          </div>
          {p.nec && (
            <table className="yx-tim-table" aria-label="Contractors paid">
              <thead>
                <tr>
                  <th scope="col">Contractor</th>
                  <th scope="col">Paid</th>
                  <th scope="col">W-9</th>
                  <th scope="col">
                    <span className="yx-sr-only">Copy</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.nec.rows.map((r) => (
                  <tr key={r.consultantId}>
                    <th scope="row">{r.name}</th>
                    <td>
                      ${r.paid} {r.due ? <Badge tone="info">Form due</Badge> : <Badge tone="neutral">Below ${p.nec!.threshold}</Badge>}
                    </td>
                    <td>
                      {r.w9 ? (
                        r.tin
                      ) : (
                        <Button size="sm" onClick={() => setW9({ consultantId: r.consultantId, name: r.name })}>
                          Record W-9
                        </Button>
                      )}
                    </td>
                    <td>
                      {r.due && r.w9 && (
                        <Button size="sm" loading={busy === r.consultantId} onClick={() => void run(r.consultantId, () => p.onNecCopy(r.consultantId))}>
                          Recipient copy
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
      {w9 && <W9Drawer who={w9} onClose={() => setW9(null)} onSave={p.onW9} />}
      {wps && <WpsDrawer onSearch={p.onSearch} onClose={() => setWps(false)} onSave={p.onWpsIds} />}
    </LivePage>
  );
}
