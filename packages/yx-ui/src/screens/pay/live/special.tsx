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
type Search = (q: string) => Promise<PersonHit[]>;

function Failed({ error }: { error: string | null }) {
  return error ? (
    <InlineAlert tone="danger" title="That did not work">
      {error}
    </InlineAlert>
  ) : null;
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
