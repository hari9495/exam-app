import { useState } from 'react';
import { Button } from '../../../components/button';
import { Badge } from '../../../components/display';
import { EmptyState, InlineAlert, Skeleton } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../../components/field';
import { TextField } from '../../../components/inputs';
import { Segment } from '../../../components/segment';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/shell';
import { useRun } from '../../org/org-kit';
import { LivePage } from '../../time/live/kit';
import { monthText } from './periods';
import { rupees } from './runs';
import type { LoadState } from './types';
import type { OneTimeItem } from './types-5j';

// Payroll inputs, wired (PAY-10.01 for PAY-04 … PAY-06): loss-of-pay days for groups paid as present, one-time pay for a
// month, and salary holds. A locked month takes no inputs (they are paid next month as corrections).

export interface PersonHit {
  id: string;
  name: string;
  employeeCode?: string;
}

/** Find a person by name or code, then pick one. */
export function PersonPicker({ id, label, value, onChange, onSearch, error }: { id: string; label: string; value: PersonHit | null; onChange: (p: PersonHit) => void; onSearch: (q: string) => Promise<PersonHit[]>; error?: string }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<PersonHit[] | null>(null);
  const { busy, run } = useRun();
  return (
    <>
      <FormField id={id} label={label} required error={error} helper={value ? `Chosen: ${value.name}${value.employeeCode ? ` · ${value.employeeCode}` : ''}` : 'Search by name or employee code.'}>
        <div className="yx-tim-row">
          <TextField value={q} onChange={setQ} aria-label={`Find ${label.toLowerCase()}`} />
          <Button loading={busy === 'find'} onClick={() => void run('find', async () => setHits(await onSearch(q)))}>
            Search
          </Button>
        </div>
      </FormField>
      {hits && !hits.length && <p className="yx-tim-note">Nobody found.</p>}
      {hits && hits.length > 0 && (
        <ul className="yx-tim-row" aria-label="People found">
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

export interface LopRow {
  employeeId: string;
  lopDays: string;
  reason: string;
  source: string;
}

export interface HoldRow {
  id: string;
  employeeId: string;
  reasonCode: string;
  note: string;
  amount: string | null;
  released: boolean;
  ageDays: number | null;
}

export interface PayInputsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  month: string;
  onMonth: (month: string) => void;
  nameOf: (employeeId: string) => string;
  lop: LopRow[] | null;
  oneTime: OneTimeItem[] | null;
  holds: HoldRow[] | null;
  onSearch: (q: string) => Promise<PersonHit[]>;
  onSaveLop: (row: { employeeId: string; lopDays: string; reason: string }) => Promise<unknown>;
  onAddOneTime: (row: { employeeId: string; componentCode: string; amount: string; month: string; reason: string }) => Promise<{ status: string }>;
  onCancelOneTime: (id: string) => Promise<unknown>;
  onAddHold: (row: { employeeId: string; reasonCode: string; note: string }) => Promise<unknown>;
  onReleaseHold: (id: string) => Promise<unknown>;
}

const HOLD_REASONS = [
  { value: 'exit_pending', label: 'Exit pending' },
  { value: 'investigation', label: 'Investigation' },
  { value: 'employee_request', label: 'Employee asked' },
  { value: 'other', label: 'Other' },
] as const;

export function PayInputsScreen(p: PayInputsScreenProps) {
  return (
    <LivePage
      title="Payroll inputs"
      description={`Loss of pay, one-time pay and salary holds for ${monthText(p.month)}. A locked month takes no inputs: corrections are paid next month.`}
      state={p.state}
      onRetry={p.onRetry}
      what="payroll inputs"
      grantedBy="your payroll admin"
      actions={
        <FormField id="in-month" label="Month" hideLabel>
          <TextField type="month" value={p.month} onChange={(m) => /^\d{4}-\d{2}$/.test(m) && p.onMonth(m)} aria-label="Month" />
        </FormField>
      }
    >
      <Tabs defaultValue="lop">
        <TabsList aria-label="Inputs">
          <TabsTrigger value="lop">Loss of pay</TabsTrigger>
          <TabsTrigger value="onetime">One-time pay</TabsTrigger>
          <TabsTrigger value="holds">Holds</TabsTrigger>
        </TabsList>
        <TabsContent value="lop">
          <LopTab {...p} />
        </TabsContent>
        <TabsContent value="onetime">
          <OneTimeTab {...p} />
        </TabsContent>
        <TabsContent value="holds">
          <HoldsTab {...p} />
        </TabsContent>
      </Tabs>
    </LivePage>
  );
}

function LopTab(p: PayInputsScreenProps) {
  const [who, setWho] = useState<PersonHit | null>(null);
  const [days, setDays] = useState('');
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const [saved, setSaved] = useState<string | null>(null);
  const errors = [
    ...(!who ? [{ fieldId: 'lop-who', message: 'Choose the person.' }] : []),
    ...(!/^\d{1,2}(\.\d{1,2})?$/.test(days) ? [{ fieldId: 'lop-days', message: 'Enter the unpaid days, e.g. 2 or 1.5.' }] : []),
    ...(reason.trim().length < 3 ? [{ fieldId: 'lop-why', message: 'Say why.' }] : []),
  ];
  const save = useSaveErrors(errors);
  return (
    <div className="yx-tim-stack">
      <Card title="Add loss-of-pay days">
        <div className="yx-tim-form">
          <ErrorSummary errors={save.shownErrors} />
          {error && (
            <InlineAlert tone="danger" title="Not saved">
              {error}
            </InlineAlert>
          )}
          {saved && <InlineAlert tone="success" title={saved} />}
          <PersonPicker id="lop-who" label="Person" value={who} onChange={setWho} onSearch={p.onSearch} error={save.errorOf('lop-who')} />
          <FormField id="lop-days" label="Unpaid days" required error={save.errorOf('lop-days')} helper="For pay groups paid as present; others come from attendance.">
            <TextField value={days} onChange={setDays} inputMode="decimal" />
          </FormField>
          <FormField id="lop-why" label="Why" required error={save.errorOf('lop-why')}>
            <TextField value={reason} onChange={setReason} maxLength={300} />
          </FormField>
          <div>
            <Button
              variant="primary"
              loading={busy === 'lop'}
              onClick={() => {
                if (errors.length) return save.reveal();
                void run('lop', async () => {
                  await p.onSaveLop({ employeeId: who!.id, lopDays: days, reason: reason.trim() });
                  setSaved(`Saved ${days} days for ${who!.name}.`);
                  setDays('');
                  setReason('');
                });
              }}
            >
              Save
            </Button>
          </div>
        </div>
      </Card>
      {!p.lop ? (
        <Skeleton height={120} />
      ) : p.lop.length ? (
        <table className="yx-tim-table" aria-label="Loss-of-pay days">
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col">Days</th>
              <th scope="col">Why</th>
            </tr>
          </thead>
          <tbody>
            {p.lop.map((r) => (
              <tr key={r.employeeId}>
                <th scope="row">{p.nameOf(r.employeeId)}</th>
                <td>{r.lopDays}</td>
                <td className="yx-tim-note">{r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState compact title="No loss-of-pay days this month" />
      )}
    </div>
  );
}

function OneTimeTab(p: PayInputsScreenProps) {
  const [who, setWho] = useState<PersonHit | null>(null);
  const [kind, setKind] = useState<'bonus' | 'arrears' | 'other'>('bonus');
  const [code, setCode] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const [saved, setSaved] = useState<string | null>(null);
  const component = kind === 'other' ? code.trim() : kind;
  const errors = [
    ...(!who ? [{ fieldId: 'ot-who', message: 'Choose the person.' }] : []),
    ...(!/^[a-z][a-z0-9_]{0,29}$/.test(component) ? [{ fieldId: 'ot-code', message: 'Enter the component code, e.g. incentive.' }] : []),
    ...(!/^\d{1,9}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 ? [{ fieldId: 'ot-amount', message: 'Enter an amount in rupees.' }] : []),
    ...(reason.trim().length < 3 ? [{ fieldId: 'ot-why', message: 'Say what it is for.' }] : []),
  ];
  const save = useSaveErrors(errors);
  return (
    <div className="yx-tim-stack">
      <Card title="Add one-time pay">
        <div className="yx-tim-form">
          <ErrorSummary errors={save.shownErrors} />
          {error && (
            <InlineAlert tone="danger" title="Not added">
              {error}
            </InlineAlert>
          )}
          {saved && <InlineAlert tone="success" title={saved} />}
          <PersonPicker id="ot-who" label="Person" value={who} onChange={setWho} onSearch={p.onSearch} error={save.errorOf('ot-who')} />
          <Segment
            label="Pay as"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'bonus', label: 'Bonus' },
              { value: 'arrears', label: 'Arrears' },
              { value: 'other', label: 'Other component' },
            ]}
          />
          {kind === 'other' && (
            <FormField id="ot-code" label="Component code" required error={save.errorOf('ot-code')}>
              <TextField value={code} onChange={setCode} />
            </FormField>
          )}
          <FormField id="ot-amount" label="Amount" required error={save.errorOf('ot-amount')}>
            <TextField value={amount} onChange={setAmount} prefix="₹" inputMode="decimal" />
          </FormField>
          <FormField id="ot-why" label="What it is for" required error={save.errorOf('ot-why')}>
            <TextField value={reason} onChange={setReason} maxLength={300} />
          </FormField>
          <div>
            <Button
              variant="primary"
              loading={busy === 'ot'}
              onClick={() => {
                if (errors.length) return save.reveal();
                void run('ot', async () => {
                  const r = await p.onAddOneTime({ employeeId: who!.id, componentCode: component, amount, month: p.month, reason: reason.trim() });
                  setSaved(r.status === 'pending' ? `Added for ${who!.name}; above the company's limit, so it waits for approval.` : `Added for ${who!.name}.`);
                  setAmount('');
                  setReason('');
                });
              }}
            >
              Add
            </Button>
          </div>
        </div>
      </Card>
      {!p.oneTime ? (
        <Skeleton height={120} />
      ) : p.oneTime.length ? (
        <table className="yx-tim-table" aria-label="One-time pay">
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col">Component</th>
              <th scope="col">Amount</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="yx-visually-hidden">Cancel</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {p.oneTime.map((r) => (
              <tr key={r.id}>
                <th scope="row">{p.nameOf(r.employeeId)}</th>
                <td>{r.componentCode}</td>
                <td>{rupees(r.amount)}</td>
                <td>
                  <Badge tone={r.status === 'approved' ? 'success' : r.status === 'pending' ? 'warning' : 'neutral'}>{r.status === 'approved' ? 'To be paid' : r.status === 'pending' ? 'Waiting for approval' : r.status === 'cancelled' ? 'Cancelled' : r.status}</Badge>
                </td>
                <td>
                  {(r.status === 'approved' || r.status === 'pending') && r.source === 'manual' && (
                    <Button size="sm" loading={busy === `c-${r.id}`} onClick={() => void run(`c-${r.id}`, () => p.onCancelOneTime(r.id))}>
                      Cancel
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState compact title="No one-time pay this month" />
      )}
    </div>
  );
}

function HoldsTab(p: PayInputsScreenProps) {
  const [who, setWho] = useState<PersonHit | null>(null);
  const [code, setCode] = useState<(typeof HOLD_REASONS)[number]['value']>('exit_pending');
  const [note, setNote] = useState('');
  const { busy, error, run } = useRun();
  const errors = [...(!who ? [{ fieldId: 'ho-who', message: 'Choose the person.' }] : []), ...(note.trim().length < 5 ? [{ fieldId: 'ho-note', message: 'Say why, in a few words.' }] : [])];
  const save = useSaveErrors(errors);
  return (
    <div className="yx-tim-stack">
      <Card title="Hold someone's net pay">
        <div className="yx-tim-form">
          <ErrorSummary errors={save.shownErrors} />
          {error && (
            <InlineAlert tone="danger" title="This didn't go through">
              {error}
            </InlineAlert>
          )}
          <PersonPicker id="ho-who" label="Person" value={who} onChange={setWho} onSearch={p.onSearch} error={save.errorOf('ho-who')} />
          <Segment label="Why" value={code} onChange={setCode} options={HOLD_REASONS.map((r) => ({ value: r.value, label: r.label }))} />
          <FormField id="ho-note" label="Note" required error={save.errorOf('ho-note')} helper="Statutory deductions are still made; the net pay is paid when released.">
            <TextField value={note} onChange={setNote} maxLength={300} />
          </FormField>
          <div>
            <Button
              variant="primary"
              loading={busy === 'hold'}
              onClick={() => {
                if (errors.length) return save.reveal();
                void run('hold', async () => {
                  await p.onAddHold({ employeeId: who!.id, reasonCode: code, note: note.trim() });
                  setNote('');
                });
              }}
            >
              Hold pay
            </Button>
          </div>
        </div>
      </Card>
      {!p.holds ? (
        <Skeleton height={120} />
      ) : p.holds.length ? (
        <table className="yx-tim-table" aria-label="Holds">
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col">Why</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="yx-visually-hidden">Release</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {p.holds.map((h) => (
              <tr key={h.id}>
                <th scope="row">{p.nameOf(h.employeeId)}</th>
                <td className="yx-tim-note">{h.note}</td>
                <td>{h.released ? <Badge tone="neutral">Released</Badge> : <Badge tone="warning">Held {h.ageDays} days</Badge>}</td>
                <td>
                  {!h.released && (
                    <Button size="sm" loading={busy === `r-${h.id}`} onClick={() => void run(`r-${h.id}`, () => p.onReleaseHold(h.id))}>
                      Release
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState compact title="Nobody's pay is held" />
      )}
    </div>
  );
}
