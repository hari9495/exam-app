// PAY-57 · Equity (admin) and PAY-58 · My equity (founder decision 3: designed first, then live).
// Plans (ESOP, RSU, SAR) and their pools, valuations (fair market value a unit), grants approved by a second holder of
// the equity key in Approvals, milestone vesting confirmed here, exercise price received, the cap table; and the person's
// own grants, vesting and exercising. One implementation per screen: the web page passes `live`; stories get sample data.
import { useState } from 'react';
import { CheckCircle2, Download, Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField, type FormErrorItem } from '../../components/field';
import { TextField } from '../../components/inputs';
import { useToast } from '../../components/notify';
import { ConfirmDialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { useRun } from '../org/org-kit';
import { dateText } from '../time/live/kit';
import { PayFormDrawer, PayPageState, fromPaise, rupees, unitPrice, type PayLiveState } from './consultants';
import { FactRow, MyPayFrame, PayFrame, SectionTitle } from './pay-kit';
import type { LoadState } from './live/types';
import type { SetupEntity } from './live/types-5b';
import type { EquityOverview, GrantView } from './live/types-5i';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PRICE = /^\d{1,10}(\.\d{1,4})?$/;
const WHOLE = /^\d{1,9}$/;

/** Units × a price with up to 4 decimals, to the paisa (half up). Exact: no floating point. */
export const pricePayable = (units: number, price: string) => {
  const [i, f = ''] = price.split('.');
  const scaled = BigInt(i || '0') * 10000n + BigInt((f + '0000').slice(0, 4));
  return fromPaise((BigInt(units) * scaled + 50n) / 100n);
};

const GRANT_STATUS = (s: string): { label: string; tone: BadgeTone } =>
  s === 'pending' ? { label: 'Waiting for approval', tone: 'warning' } : s === 'active' ? { label: 'Active', tone: 'success' } : s === 'rejected' ? { label: 'Turned down', tone: 'danger' } : { label: s.charAt(0).toUpperCase() + s.slice(1), tone: 'neutral' };
const EVENT_STATE: Record<GrantView['events'][number]['state'], { label: string; tone: BadgeTone }> = { vested: { label: 'Vested', tone: 'success' }, lapsed: { label: 'Lapsed', tone: 'neutral' }, scheduled: { label: 'To vest', tone: 'info' } };
const EXERCISE_STATUS = (s: string) => (s === 'requested' ? 'Waiting for approval' : s === 'approved' ? 'Approved: pay the price' : s === 'paid' ? 'Price received' : s === 'rejected' ? 'Turned down' : s);
const BASIS = { merchant_banker: 'Merchant banker', listed_price: 'Listed price' } as const;

/* ================================================================== PAY-57 · Equity (admin) */

export interface PersonHit {
  id: string;
  name: string;
  employeeCode?: string;
}

/** What the live page passes. Every read and action needs payroll.equity.manage (the API checks it again). */
export interface LiveEquity {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  nameOf: (employeeId: string) => string;
  onSearch: (q: string) => Promise<PersonHit[]>;
  data: EquityOverview | null;
  onPlan: (x: { name: string; kind: 'ESOP' | 'RSU' | 'SAR'; poolUnits: number; exitWindowDays: number }) => Promise<unknown>;
  onValuation: (x: { valuedOn: string; fmv: string; basis: 'listed_price' | 'merchant_banker' }) => Promise<unknown>;
  onGrant: (x: { planId: string; employeeId: string; grantedOn: string; units: number; exercisePrice: string; cliffMonths: number; vestingMonths: number; everyMonths: number }) => Promise<unknown>;
  onConfirm: (eventId: string) => Promise<unknown>;
  onPaid: (exerciseId: string, reference: string) => Promise<unknown>;
  onCapTable: (planId: string) => Promise<unknown>;
}

export type EquityTab = 'grants' | 'plans' | 'valuations';
export type EquityDialog = 'plan' | 'valuation' | 'grant' | 'confirm' | 'paid';

/** PAY-57 · Equity: grants, plans and valuations per legal entity. */
export function EquityScreen({ live, state = 'ready', tab = 'grants', dialog }: { live?: LiveEquity; state?: PayLiveState; tab?: EquityTab; /** Story only: a drawer or dialog open on load. */ dialog?: EquityDialog }) {
  const sample = useSampleEquity(state);
  return (
    <PayFrame page="compensation">
      <EquityView v={live ?? sample} tab={tab} dialog={live ? undefined : dialog} />
    </PayFrame>
  );
}

type Milestone = { grant: GrantView; event: GrantView['events'][number] };
type Exercise = { grant: GrantView; exercise: GrantView['exercises'][number] };

function EquityView({ v, tab, dialog }: { v: LiveEquity; tab: EquityTab; dialog?: EquityDialog }) {
  const { toast } = useToast();
  const d = v.data;
  const milestones: Milestone[] = (d?.grants ?? []).flatMap((grant) => grant.events.filter((e) => e.kind === 'milestone' && e.state === 'scheduled').map((event) => ({ grant, event })));
  const toPay: Exercise[] = (d?.grants ?? []).flatMap((grant) => grant.exercises.filter((x) => x.status === 'approved').map((exercise) => ({ grant, exercise })));
  const [open, setOpen] = useState<'plan' | 'valuation' | 'grant' | null>(dialog === 'plan' || dialog === 'valuation' || dialog === 'grant' ? dialog : null);
  const [confirming, setConfirming] = useState<Milestone | null>(dialog === 'confirm' ? (milestones[0] ?? null) : null);
  const [paying, setPaying] = useState<Exercise | null>(dialog === 'paid' ? (toPay[0] ?? null) : null);
  const { busy, run } = useRun();
  const close = () => setOpen(null);
  const makeGrant = () => (d?.plans.length ? setOpen('grant') : toast({ title: 'Add a plan first', description: 'A grant comes from a plan’s pool.', tone: 'warning' }));
  const capTable = (planId: string) =>
    void run(`cap-${planId}`, () => v.onCapTable(planId)).then((ok) => {
      if (!ok) toast({ title: 'The cap table did not download', description: 'Try again in a moment.', tone: 'error' });
    });
  const latest = d?.valuations[0];
  const facts = d ? `${d.plans.length} plans · ${d.grants.length} grants${latest ? ` · ${unitPrice(latest.fmv)} a unit on ${dateText(latest.valuedOn)}` : ' · no valuation yet'}` : undefined;
  const grantCols: TableColumn<GrantView>[] = [
    { key: 'who', header: 'Person', type: 'person', value: (g) => v.nameOf(g.employeeId), person: (g) => ({ name: v.nameOf(g.employeeId), secondary: `Granted ${dateText(g.grantedOn)} at ${unitPrice(g.exercisePrice)}` }), width: 240 },
    { key: 'plan', header: 'Plan', value: (g) => d?.plans.find((x) => x.id === g.planId)?.name ?? '', width: 140, optional: true },
    { key: 'units', header: 'Units', type: 'number', value: (g) => g.units, width: 90 },
    { key: 'vested', header: 'Vested', type: 'number', value: (g) => g.vested, width: 90 },
    { key: 'exercised', header: 'Exercised', type: 'number', value: (g) => g.exercised, width: 100 },
    { key: 'status', header: 'Status', type: 'status', value: (g) => GRANT_STATUS(g.status).label, render: (g) => (<span><Badge tone={GRANT_STATUS(g.status).tone}>{GRANT_STATUS(g.status).label}</Badge>{g.status === 'pending' && <span className="yx-pay-note">{g.madeByMe ? 'You made it, so another equity admin approves it in Approvals' : 'Approve it in Approvals'}</span>}</span>), width: 220 },
  ];
  const planCols: TableColumn<EquityOverview['plans'][number]>[] = [
    { key: 'name', header: 'Plan', value: (x) => x.name, width: 180 },
    { key: 'kind', header: 'Kind', value: (x) => x.kind, width: 90 },
    { key: 'pool', header: 'Pool (units)', type: 'number', value: (x) => x.poolUnits, width: 120 },
    { key: 'granted', header: 'Granted', type: 'number', value: (x) => x.granted, width: 110 },
    { key: 'left', header: 'Left', type: 'number', value: (x) => x.available, width: 100 },
    { key: 'exit', header: 'After leaving', value: (x) => `${x.exitWindowDays} days to exercise`, width: 170, optional: true },
  ];
  const valuationCols: TableColumn<EquityOverview['valuations'][number]>[] = [
    { key: 'on', header: 'Valued on', value: (x) => x.valuedOn, render: (x) => dateText(x.valuedOn), width: 140 },
    { key: 'fmv', header: 'Fair market value a unit', type: 'money', value: (x) => Number(x.fmv), render: (x) => unitPrice(x.fmv), width: 200 },
    { key: 'basis', header: 'Basis', value: (x) => BASIS[x.basis as keyof typeof BASIS] ?? x.basis, width: 180 },
  ];
  return (
    <>
      <PageHeader
        title="Equity"
        description="Plans and their pools, valuations, grants approved by a second person, vesting, exercises and the cap table."
        facts={v.state === 'ready' ? facts : undefined}
        actions={
          v.state === 'ready' && d ? (
            <Button variant="primary" icon={Plus} onClick={makeGrant}>
              Make a grant
            </Button>
          ) : undefined
        }
      />
      <PayPageState state={v.state} onRetry={v.onRetry} what="equity">
        <div className="yx-pay-stack">
          {v.entities.length > 1 && (
            <div className="yx-pay-narrow">
              <FormField id="eq-entity" label="Legal entity">
                <Select value={v.entityId} onChange={v.onEntity} placeholder="Choose a legal entity" options={v.entities.map((e) => ({ value: e.id, label: e.name }))} />
              </FormField>
            </div>
          )}
          {!v.entities.length ? (
            <EmptyState title="No legal entities yet" description="Equity plans belong to a legal entity. Add one in Settings first." />
          ) : !v.entityId ? (
            <EmptyState title="Choose a legal entity" description="Plans, valuations and grants are kept per legal entity." />
          ) : !d ? (
            <PayPageState state="loading" what="the entity’s equity">
              {null}
            </PayPageState>
          ) : (
            <Tabs defaultValue={tab}>
              <TabsList aria-label="Equity">
                <TabsTrigger value="grants" count={d.grants.length}>
                  Grants
                </TabsTrigger>
                <TabsTrigger value="plans" count={d.plans.length}>
                  Plans
                </TabsTrigger>
                <TabsTrigger value="valuations" count={d.valuations.length}>
                  Valuations
                </TabsTrigger>
              </TabsList>
              <TabsContent value="grants">
                <DataTable
                  label="Grants"
                  columns={grantCols}
                  rows={d.grants}
                  getRowId={(g) => g.id}
                  cardSummary
                  rowButtons={(g) => (
                    <>
                      {milestones
                        .filter((m) => m.grant.id === g.id)
                        .map((m) => (
                          <Button key={m.event.id} size="sm" icon={CheckCircle2} onClick={() => setConfirming(m)}>
                            Confirm {m.event.milestone}
                          </Button>
                        ))}
                      {toPay
                        .filter((x) => x.grant.id === g.id)
                        .map((x) => (
                          <Button key={x.exercise.id} size="sm" onClick={() => setPaying(x)}>
                            Price received ({x.exercise.units} units)
                          </Button>
                        ))}
                    </>
                  )}
                  empty={<EmptyState title="No grants yet" description="Make a grant from a plan’s pool. Another equity admin approves it; vesting starts then." action={<Button icon={Plus} onClick={makeGrant}>Make a grant</Button>} />}
                />
              </TabsContent>
              <TabsContent value="plans">
                <DataTable
                  label="Equity plans"
                  columns={planCols}
                  rows={d.plans}
                  getRowId={(x) => x.id}
                  cardSummary
                  toolbar={
                    <Button icon={Plus} onClick={() => setOpen('plan')}>
                      Add a plan
                    </Button>
                  }
                  rowButtons={(x) => (
                    <Button size="sm" icon={Download} loading={busy === `cap-${x.id}`} onClick={() => capTable(x.id)}>
                      Cap table
                    </Button>
                  )}
                  empty={<EmptyState title="No plans yet" description="Add an ESOP, RSU or SAR plan with its pool of units." action={<Button icon={Plus} onClick={() => setOpen('plan')}>Add a plan</Button>} />}
                />
              </TabsContent>
              <TabsContent value="valuations">
                <DataTable
                  label="Valuations"
                  columns={valuationCols}
                  rows={d.valuations}
                  getRowId={(x) => x.id}
                  cardSummary
                  toolbar={
                    <Button icon={Plus} onClick={() => setOpen('valuation')}>
                      Add a valuation
                    </Button>
                  }
                  empty={<EmptyState title="No valuations yet" description="An exercise is taxed at the value on or before its date." action={<Button icon={Plus} onClick={() => setOpen('valuation')}>Add a valuation</Button>} />}
                />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </PayPageState>
      {open === 'plan' && <PlanDrawer onClose={close} onSave={v.onPlan} />}
      {open === 'valuation' && <ValuationDrawer onClose={close} onSave={v.onValuation} />}
      {open === 'grant' && d && <GrantDrawer plans={d.plans} onSearch={v.onSearch} onClose={close} onSave={v.onGrant} />}
      {paying && (
        <PaidDrawer
          who={v.nameOf(paying.grant.employeeId)}
          exercise={paying.exercise}
          onClose={() => setPaying(null)}
          onSave={(ref) => v.onPaid(paying.exercise.id, ref)}
        />
      )}
      {confirming && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setConfirming(null)}
          title={`Confirm “${confirming.event.milestone}” for ${v.nameOf(confirming.grant.employeeId)}?`}
          consequence={`${confirming.event.units} units vest now and can be exercised. This can’t be undone.`}
          confirmLabel="Confirm vesting"
          onConfirm={async () => {
            await v.onConfirm(confirming.event.id);
            toast({ title: `${confirming.event.units} units vested`, description: `${v.nameOf(confirming.grant.employeeId)} · ${confirming.event.milestone}`, tone: 'success' });
          }}
        />
      )}
    </>
  );
}

function PlanDrawer({ onClose, onSave }: { onClose: () => void; onSave: LiveEquity['onPlan'] }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'ESOP' | 'RSU' | 'SAR'>('ESOP');
  const [pool, setPool] = useState('');
  const [win, setWin] = useState('90');
  const errors: FormErrorItem[] = [
    ...(name.trim().length < 2 ? [{ fieldId: 'eq-name', message: 'Name the plan.' }] : []),
    ...(!WHOLE.test(pool) || Number(pool) < 1 ? [{ fieldId: 'eq-pool', message: 'The units in the pool: a whole number, 1 or more.' }] : []),
    ...(!/^\d{1,4}$/.test(win) ? [{ fieldId: 'eq-win', message: 'Days to exercise after leaving: 0 to 9999.' }] : []),
  ];
  return (
    <PayFormDrawer title="Add an equity plan" confirm="Add plan" done={`${name.trim()} added`} errors={errors} onClose={onClose} onSave={() => onSave({ name: name.trim(), kind, poolUnits: Number(pool), exitWindowDays: Number(win) })}>
      {(errorOf) => (
        <>
          <FormField id="eq-name" label="Name" required error={errorOf('eq-name')}>
            <TextField value={name} onChange={setName} maxLength={200} />
          </FormField>
          <FormField id="eq-kind" label="Kind" helper="ESOP: options bought at the exercise price. RSU: units given. SAR: paid the rise in value.">
            <Segment
              label="Kind"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'ESOP', label: 'ESOP' },
                { value: 'RSU', label: 'RSU' },
                { value: 'SAR', label: 'SAR' },
              ]}
            />
          </FormField>
          <FormField id="eq-pool" label="Pool (units)" required error={errorOf('eq-pool')}>
            <TextField value={pool} onChange={setPool} inputMode="numeric" />
          </FormField>
          <FormField id="eq-win" label="Days to exercise after leaving" required error={errorOf('eq-win')}>
            <TextField value={win} onChange={setWin} inputMode="numeric" />
          </FormField>
        </>
      )}
    </PayFormDrawer>
  );
}

function ValuationDrawer({ onClose, onSave }: { onClose: () => void; onSave: LiveEquity['onValuation'] }) {
  const [on, setOn] = useState('');
  const [fmv, setFmv] = useState('');
  const [basis, setBasis] = useState<'listed_price' | 'merchant_banker'>('merchant_banker');
  const errors: FormErrorItem[] = [
    ...(!DAY.test(on) ? [{ fieldId: 'va-on', message: 'Give the valuation date.' }] : []),
    ...(!PRICE.test(fmv.trim()) || !/[1-9]/.test(fmv) ? [{ fieldId: 'va-fmv', message: 'The fair market value a unit, more than 0, up to 4 decimals.' }] : []),
  ];
  return (
    <PayFormDrawer title="Add a valuation" subtitle="An exercise is taxed at the latest value on or before its date." confirm="Add valuation" done="Valuation added" errors={errors} onClose={onClose} onSave={() => onSave({ valuedOn: on, fmv: fmv.trim(), basis })}>
      {(errorOf) => (
        <>
          <FormField id="va-on" label="Valued on" required error={errorOf('va-on')}>
            <TextField type="date" value={on} onChange={setOn} />
          </FormField>
          <FormField id="va-fmv" label="Fair market value a unit (₹)" required error={errorOf('va-fmv')}>
            <TextField value={fmv} onChange={setFmv} inputMode="decimal" />
          </FormField>
          <FormField id="va-basis" label="Basis">
            <Segment
              label="Basis"
              value={basis}
              onChange={setBasis}
              options={[
                { value: 'merchant_banker', label: 'Merchant banker' },
                { value: 'listed_price', label: 'Listed price' },
              ]}
            />
          </FormField>
        </>
      )}
    </PayFormDrawer>
  );
}

/** Find a person by name or employee code (also used by PAY-17 and PAY-54). */
export function FindPerson({ id, label = 'Person', value, onChange, onSearch, error }: { id: string; label?: string; value: PersonHit | null; onChange: (p: PersonHit) => void; onSearch: LiveEquity['onSearch']; error?: string }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<PersonHit[] | null>(null);
  const { busy, error: failed, run } = useRun();
  return (
    <>
      <FormField id={id} label={label} required error={error} helper={value ? `Chosen: ${value.name}${value.employeeCode ? ` · ${value.employeeCode}` : ''}` : 'Search by name or employee code.'}>
        <div className="yx-pay-row">
          <TextField value={q} onChange={setQ} aria-label="Find a person" />
          <Button loading={busy === 'find'} onClick={() => void run('find', async () => setHits(await onSearch(q)))}>
            Search
          </Button>
        </div>
      </FormField>
      {failed && (
        <InlineAlert tone="danger" title="Search did not work">
          {failed}
        </InlineAlert>
      )}
      {hits && !hits.length && <p className="yx-pay-note">Nobody found.</p>}
      {hits && hits.length > 0 && (
        <ul className="yx-pay-row" aria-label="People found">
          {hits.map((h) => (
            <li key={h.id}>
              <Button size="sm" variant={value?.id === h.id ? 'primary' : undefined} aria-pressed={value?.id === h.id} onClick={() => onChange(h)}>
                {h.name}
                {h.employeeCode ? ` · ${h.employeeCode}` : ''}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function GrantDrawer({ plans, onSearch, onClose, onSave }: { plans: EquityOverview['plans']; onSearch: LiveEquity['onSearch']; onClose: () => void; onSave: LiveEquity['onGrant'] }) {
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
    ...(!plan ? [{ fieldId: 'gr-plan', message: 'Choose the plan.' }] : []),
    ...(!who ? [{ fieldId: 'gr-who', message: 'Choose the person.' }] : []),
    ...(!DAY.test(on) ? [{ fieldId: 'gr-on', message: 'Give the grant date.' }] : []),
    ...(!WHOLE.test(units) || Number(units) < 1 || Number(units) > left ? [{ fieldId: 'gr-units', message: `1 to ${left} units (what is left in the pool).` }] : []),
    ...(!PRICE.test(price.trim()) ? [{ fieldId: 'gr-price', message: 'The exercise price a unit, up to 4 decimals (0 for RSUs).' }] : []),
    ...(!/^\d{1,2}$/.test(cliff) ? [{ fieldId: 'gr-cliff', message: 'The cliff in months: 0 to 99.' }] : []),
    ...(!/^\d{1,3}$/.test(months) || Number(months) < 1 || Number(cliff) > Number(months) ? [{ fieldId: 'gr-months', message: 'Vesting months: 1 or more, and not less than the cliff.' }] : []),
    ...(!/^\d{1,2}$/.test(every) || Number(every) < 1 ? [{ fieldId: 'gr-every', message: 'Vests every 1 or more months.' }] : []),
  ];
  return (
    <PayFormDrawer
      title="Make a grant"
      subtitle="Another equity admin approves it in Approvals; vesting starts then."
      confirm="Send for approval"
      done={`Grant for ${who?.name ?? ''} sent for approval`}
      size="lg"
      errors={errors}
      onClose={onClose}
      onSave={() => onSave({ planId: plan!, employeeId: who!.id, grantedOn: on, units: Number(units), exercisePrice: price.trim(), cliffMonths: Number(cliff), vestingMonths: Number(months), everyMonths: Number(every) })}
    >
      {(errorOf) => (
        <>
          <FormField id="gr-plan" label="Plan" required error={errorOf('gr-plan')}>
            <Select value={plan} onChange={setPlan} options={plans.map((x) => ({ value: x.id, label: `${x.name} (${x.available} left)` }))} />
          </FormField>
          <FindPerson id="gr-who" value={who} onChange={setWho} onSearch={onSearch} error={errorOf('gr-who')} />
          <FormField id="gr-on" label="Granted on" required error={errorOf('gr-on')}>
            <TextField type="date" value={on} onChange={setOn} />
          </FormField>
          <FormField id="gr-units" label="Units" required error={errorOf('gr-units')}>
            <TextField value={units} onChange={setUnits} inputMode="numeric" />
          </FormField>
          <FormField id="gr-price" label="Exercise price a unit (₹)" required error={errorOf('gr-price')}>
            <TextField value={price} onChange={setPrice} inputMode="decimal" />
          </FormField>
          <SectionTitle>Vesting</SectionTitle>
          <FormField id="gr-cliff" label="Cliff (months)" required error={errorOf('gr-cliff')}>
            <TextField value={cliff} onChange={setCliff} inputMode="numeric" />
          </FormField>
          <FormField id="gr-months" label="Vesting over (months)" required error={errorOf('gr-months')}>
            <TextField value={months} onChange={setMonths} inputMode="numeric" />
          </FormField>
          <FormField id="gr-every" label="Vests every (months)" required error={errorOf('gr-every')}>
            <TextField value={every} onChange={setEvery} inputMode="numeric" />
          </FormField>
        </>
      )}
    </PayFormDrawer>
  );
}

function PaidDrawer({ who, exercise, onClose, onSave }: { who: string; exercise: GrantView['exercises'][number]; onClose: () => void; onSave: (ref: string) => Promise<unknown> }) {
  const [ref, setRef] = useState('');
  const errors: FormErrorItem[] = !/^[A-Za-z0-9/-]{4,60}$/.test(ref.trim()) ? [{ fieldId: 'ex-ref', message: 'The payment reference: 4 to 60 letters, digits, / or -.' }] : [];
  return (
    <PayFormDrawer title={`Exercise price received from ${who}`} subtitle="The units are then allotted; the perquisite is taxed in this month’s payroll." confirm="Record payment" done={`Payment recorded for ${who}`} errors={errors} onClose={onClose} onSave={() => onSave(ref.trim())}>
      {(errorOf) => (
        <>
          <FactRow
            items={[
              { label: 'Units', value: String(exercise.units) },
              { label: 'Price payable', value: rupees(exercise.pricePayable) },
              { label: 'Exercised on', value: dateText(exercise.exercisedOn) },
              ...(exercise.perquisite ? [{ label: 'Taxable perquisite', value: rupees(exercise.perquisite) }] : []),
            ]}
          />
          <FormField id="ex-ref" label="Payment reference" required error={errorOf('ex-ref')}>
            <TextField value={ref} onChange={setRef} maxLength={60} />
          </FormField>
        </>
      )}
    </PayFormDrawer>
  );
}

/* ================================================================== PAY-58 · My equity */

export interface LiveMyEquity {
  state: LoadState;
  onRetry?: () => void;
  data: GrantView[] | null;
  onExercise: (grantId: string, units: number) => Promise<unknown>;
}

/** PAY-58 · My equity: the person's grants, how they vest, and asking to exercise vested units. */
export function MyEquityScreen({ live, state = 'ready', dialog }: { live?: LiveMyEquity; state?: PayLiveState; /** Story only: the exercise drawer open. */ dialog?: 'exercise' }) {
  const [shown, setShown] = useState(state);
  const sample: LiveMyEquity = { state: shown === 'empty' ? 'ready' : shown, onRetry: () => setShown('ready'), data: shown === 'empty' ? [] : SAMPLE_MY_GRANTS, onExercise: async () => undefined };
  const v = live ?? sample;
  const [exercising, setExercising] = useState<GrantView | null>(!live && dialog === 'exercise' ? (SAMPLE_MY_GRANTS.find((g) => g.exercisable > 0) ?? null) : null);
  const grants = v.data ?? [];
  return (
    <MyPayFrame page="equity">
      <PageHeader title="My equity" description="Your grants, how they vest, and exercising vested units. An exercise is taxed in its month as a perquisite." />
      <PayPageState state={v.state} onRetry={v.onRetry} what="your equity" grantedBy="HR">
        {!grants.length ? (
          <EmptyState title="No grants" description="Grants appear here once they are approved." />
        ) : (
          <div className="yx-pay-stack">
            {grants.map((g) => (
              <section key={g.id} className="yx-pay-panel" aria-label={g.plan?.name ?? 'Grant'}>
                <SectionTitle
                  actions={
                    g.exercisable > 0 ? (
                      <Button variant="primary" onClick={() => setExercising(g)}>
                        Exercise
                      </Button>
                    ) : undefined
                  }
                >
                  {g.plan?.name ?? 'Grant'}: {g.units} units at {unitPrice(g.exercisePrice)}
                </SectionTitle>
                <FactRow
                  items={[
                    { label: 'Granted on', value: dateText(g.grantedOn) },
                    { label: 'Vested', value: String(g.vested) },
                    { label: 'To exercise', value: String(g.exercisable) },
                    { label: 'Still to vest', value: String(g.unvested) },
                    { label: 'Exercised', value: String(g.exercised) },
                    ...(g.lapsed ? [{ label: 'Lapsed', value: String(g.lapsed) }] : []),
                  ]}
                />
                {g.plan && g.plan.exitWindowDays > 0 && <p className="yx-pay-note">If you leave, you have {g.plan.exitWindowDays} days to exercise vested units.</p>}
                <div className="yx-pay-scroll">
                  <table className="yx-pay-table" aria-label={`Vesting of ${g.plan?.name ?? 'the grant'}`}>
                    <thead>
                      <tr>
                        <th scope="col">Vests</th>
                        <th scope="col" data-num>
                          Units
                        </th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.events.map((e) => (
                        <tr key={e.id}>
                          <th scope="row">{e.kind === 'milestone' ? `When: ${e.milestone}` : dateText(e.vestOn)}</th>
                          <td data-num>{e.units}</td>
                          <td>
                            <Badge tone={EVENT_STATE[e.state].tone}>{EVENT_STATE[e.state].label}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {g.exercises.length > 0 && (
                  <ul className="yx-pay-cards" aria-label="Your exercises">
                    {g.exercises.map((x) => (
                      <li key={x.id}>
                        <div className="yx-pay-cards__row">
                          <strong>
                            {x.units} units on {dateText(x.exercisedOn)}
                          </strong>
                          <Badge tone={x.status === 'paid' ? 'success' : x.status === 'rejected' ? 'danger' : 'warning'}>{EXERCISE_STATUS(x.status)}</Badge>
                        </div>
                        <span className="yx-pay-muted">
                          Price {rupees(x.pricePayable)}
                          {x.perquisite ? ` · taxable perquisite ${rupees(x.perquisite)}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </PayPageState>
      {exercising && <ExerciseDrawer grant={exercising} onClose={() => setExercising(null)} onSave={(units) => v.onExercise(exercising.id, units)} />}
    </MyPayFrame>
  );
}

function ExerciseDrawer({ grant, onClose, onSave }: { grant: GrantView; onClose: () => void; onSave: (units: number) => Promise<unknown> }) {
  const [units, setUnits] = useState('');
  const n = WHOLE.test(units) ? Number(units) : 0;
  const errors: FormErrorItem[] = n < 1 || n > grant.exercisable ? [{ fieldId: 'ex-units', message: `1 to ${grant.exercisable} units.` }] : [];
  return (
    <PayFormDrawer
      title="Exercise units"
      subtitle={`You pay ${unitPrice(grant.exercisePrice)} a unit. Payroll approves it, and the gain over the fair value is taxed this month.`}
      confirm="Ask to exercise"
      done={`Asked to exercise ${n} units`}
      errors={errors}
      onClose={onClose}
      onSave={() => onSave(n)}
    >
      {(errorOf) => (
        <FormField id="ex-units" label="Units" required error={errorOf('ex-units')} helper={n > 0 ? `Price payable ${rupees(pricePayable(n, grant.exercisePrice))}. You can exercise up to ${grant.exercisable}.` : `You can exercise up to ${grant.exercisable}.`}>
          <TextField value={units} onChange={setUnits} inputMode="numeric" />
        </FormField>
      )}
    </PayFormDrawer>
  );
}

/* ------------------------------------------------------------------ sample data (stories only) */

const ok = async () => undefined;
const NAMES: Record<string, string> = { p1: 'Lakshmi Devi', p2: 'Ravi Kumar', p3: 'Arjun Nair' };
export const SAMPLE_GRANTS: GrantView[] = [
  {
    id: 'g1',
    planId: 'pl1',
    employeeId: 'p1',
    grantedOn: '2024-04-01',
    units: 400,
    exercisePrice: '10.0000',
    status: 'active',
    vested: 200,
    unvested: 150,
    lapsed: 0,
    exercised: 50,
    exercisable: 150,
    events: [
      { id: 'e1', vestOn: '2025-04-01', units: 100, kind: 'time', milestone: null, state: 'vested' },
      { id: 'e2', vestOn: '2026-04-01', units: 100, kind: 'time', milestone: null, state: 'vested' },
      { id: 'e3', vestOn: '2027-04-01', units: 100, kind: 'time', milestone: null, state: 'scheduled' },
      { id: 'e4', vestOn: '2027-12-31', units: 50, kind: 'milestone', milestone: 'Series B closed', state: 'scheduled' },
    ],
    exercises: [{ id: 'x1', exercisedOn: '2026-10-20', units: 50, pricePayable: '500.00', fmv: '250.0000', perquisite: '12000.00', status: 'approved', paymentRef: null }],
    plan: { name: 'ESOP 2024', kind: 'ESOP', exitWindowDays: 90 },
    madeByMe: false,
  },
  { id: 'g2', planId: 'pl1', employeeId: 'p2', grantedOn: '2026-10-15', units: 200, exercisePrice: '12.5000', status: 'pending', vested: 0, unvested: 200, lapsed: 0, exercised: 0, exercisable: 0, events: [], exercises: [], plan: { name: 'ESOP 2024', kind: 'ESOP', exitWindowDays: 90 }, madeByMe: true },
  { id: 'g3', planId: 'pl2', employeeId: 'p3', grantedOn: '2025-07-01', units: 120, exercisePrice: '0.0000', status: 'active', vested: 30, unvested: 90, lapsed: 0, exercised: 30, exercisable: 0, events: [], exercises: [{ id: 'x2', exercisedOn: '2026-07-01', units: 30, pricePayable: '0.00', fmv: '240.0000', perquisite: '7200.00', status: 'paid', paymentRef: 'NIL-0001' }], plan: { name: 'RSU 2025', kind: 'RSU', exitWindowDays: 0 }, madeByMe: false },
];
export const SAMPLE_EQUITY: EquityOverview = {
  plans: [
    { id: 'pl1', name: 'ESOP 2024', kind: 'ESOP', poolUnits: 1000, granted: 600, available: 400, exitWindowDays: 90, status: 'active' },
    { id: 'pl2', name: 'RSU 2025', kind: 'RSU', poolUnits: 500, granted: 120, available: 380, exitWindowDays: 0, status: 'active' },
  ],
  valuations: [
    { id: 'va2', valuedOn: '2026-09-01', fmv: '250.0000', basis: 'merchant_banker' },
    { id: 'va1', valuedOn: '2026-03-01', fmv: '240.0000', basis: 'merchant_banker' },
  ],
  grants: SAMPLE_GRANTS,
};
const SAMPLE_MY_GRANTS: GrantView[] = [SAMPLE_GRANTS[0]!];

function useSampleEquity(state: PayLiveState): LiveEquity {
  const [shown, setShown] = useState(state);
  const [entityId, setEntityId] = useState<string | null>('kf');
  return {
    state: shown === 'empty' ? 'ready' : shown,
    onRetry: () => setShown('ready'),
    entities: [{ id: 'kf', name: 'Kaveri Foods Pvt Ltd', shortName: 'KFPL', keys: [] }] as SetupEntity[],
    entityId,
    onEntity: setEntityId,
    nameOf: (id) => NAMES[id] ?? 'Someone',
    onSearch: async (q) => Object.entries(NAMES).filter(([, n]) => n.toLowerCase().includes(q.trim().toLowerCase())).map(([id, name]) => ({ id, name, employeeCode: `KF-${id.slice(1).padStart(3, '0')}` })),
    data: shown === 'empty' ? { plans: [], valuations: [], grants: [] } : SAMPLE_EQUITY,
    onPlan: ok,
    onValuation: ok,
    onGrant: ok,
    onConfirm: ok,
    onPaid: ok,
    onCapTable: ok,
  };
}
