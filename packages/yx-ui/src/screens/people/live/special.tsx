import { useState } from 'react';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/choice';
import { DatePicker } from '../../../components/date';
import { Badge,  } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { InlineAlert } from '../../../components/feedback';
import { FormField } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { TextArea, TextField } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { dayKey } from '../../../lib/dates';
import { dateText } from '../../time/live/kit';
import type { Batch, Choice, EditorParagraph, IrOverview, IrPermission, LoadState, MyVrsScheme, Payee, Payees, RehireView, UpcomingExit } from './types';

// Lifecycle batch 6e, wired (design §16.5): the rehire options and the buddy on a joiner (PPL-41), campus batches
// (PPL-14), the payees of a death in service (PPL-23), absconding timelines (PPL-24), upcoming retirements and contract
// ends, retrenchment permissions and VRS schemes (PPL-40), VRS for the employee, the letter editor tab (PPL-29) and the
// bulk letter wizard (PPL-28). Single choices are Segments; buttons stay off until a form is complete.

const fromKey = (iso: string) => new Date(`${iso}T00:00:00`);
const SHARE = /^\d{1,3}(\.\d{1,2})?$/;
const choiceLabel = (c: string) => c.replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase()).replace(' lt 6m', ' if the break was under 6 months');

// ------------------------------------------------------------------------------------------ rehire (LIFE-5.01)

export function RehireCard({ data, onSave }: { data: RehireView; onSave: (overrides: Record<string, { value: string; reason: string | null }>, version: number) => Promise<unknown> }) {
  const [edit, setEdit] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(data.options.map((o) => [o.key, o.value])));
  const [reasons, setReasons] = useState<Record<string, string>>(() => Object.fromEntries(data.options.map((o) => [o.key, o.reason ?? ''])));
  const p = data.previous;
  const changed = data.options.filter((o) => values[o.key] !== o.policy);
  const ready = changed.every((o) => (reasons[o.key] ?? '').trim().length >= 3);
  return (
    <Card
      title="Rehire"
      actions={
        <Button size="sm" onClick={() => setEdit(true)}>
          Change choices
        </Button>
      }
    >
      <Text as="p">{`Worked here ${dateText(p.joinedOn)} to ${dateText(p.exitedOn)} as ${p.employeeCode}${p.exitType ? ` (${p.exitType.replace(/_/g, ' ')})` : ''}. Break: ${p.breakMonths} month${p.breakMonths === 1 ? '' : 's'}.`}</Text>
      {p.rehireEligible === false && <InlineAlert tone="warning" title="Marked not eligible for rehire">HR may still go ahead; the choice is yours and is recorded.</InlineAlert>}
      <ul className="yx-lif-list">
        {data.options.map((o) => (
          <li key={o.key}>
            <Badge tone={o.overridden ? 'warning' : 'neutral'}>{o.overridden ? 'Changed for this rehire' : 'Company policy'}</Badge>
            <Text>{`${o.label}: ${o.meaning}`}</Text>
            {o.overridden && o.reason && <Text tone="secondary" size="sm">{o.reason}</Text>}
          </li>
        ))}
      </ul>
      {edit && (
        <ConfirmDialog
          open
          onOpenChange={(x) => !x && setEdit(false)}
          size="md"
          title="Rehire choices"
          consequence="Each choice starts from the company policy. A different choice needs a reason, kept on the record."
          confirmLabel="Save choices"
          confirmDisabled={!ready}
          onConfirm={async () => {
            await onSave(Object.fromEntries(data.options.map((o) => [o.key, { value: values[o.key], reason: values[o.key] !== o.policy ? reasons[o.key].trim() : null }])), data.version);
            setEdit(false);
          }}
        >
          {data.options.map((o) => (
            <div key={o.key}>
              <FormField id={`rh-${o.key}`} label={o.label} helper={`Policy: ${choiceLabel(o.policy)}`}>
                <Select aria-label={o.label} value={values[o.key]} onChange={(x) => setValues({ ...values, [o.key]: x ?? o.policy })} options={o.choices.map((c) => ({ value: c, label: choiceLabel(c) }))} />
              </FormField>
              {values[o.key] !== o.policy && (
                <FormField id={`rh-${o.key}-why`} label="Why for this rehire" required>
                  <TextField value={reasons[o.key] ?? ''} onChange={(x) => setReasons({ ...reasons, [o.key]: x })} maxLength={300} />
                </FormField>
              )}
            </div>
          ))}
        </ConfirmDialog>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------------------------------ buddy (LIFE-5.03)

export function BuddyCard({ people, current, managerEmployeeId, onSave }: { people: Choice[]; current: string | null; managerEmployeeId: string | null; onSave: (employeeId: string | null) => Promise<unknown> }) {
  const [pick, setPick] = useState<string | null>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card title="Buddy">
      <Text as="p" tone="secondary" size="sm">
        A colleague who helps them settle in and checks in after a month. Not their manager.
      </Text>
      {error && (
        <InlineAlert tone="danger" title="Not saved">
          {error}
        </InlineAlert>
      )}
      <FormField id="bd-who" label="Buddy" optional>
        <Select aria-label="Buddy" value={pick} onChange={setPick} options={people.filter((x) => x.value !== managerEmployeeId)} clearable searchable />
      </FormField>
      <Button
        size="sm"
        disabled={pick === current}
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onSave(pick);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Save buddy
      </Button>
    </Card>
  );
}

// ------------------------------------------------------------------------------------------ campus batches (LIFE-5.02)

export interface BatchesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  rows: Batch[] | null;
  today: string;
  entities: Choice[];
  /** Joiners waiting to join who are not in a batch yet. */
  joiners: (Choice & { entityId: string })[];
  canManage: boolean;
  onSave: (id: string | null, input: { name: string; legalEntityId: string; joiningOn: string; touchpoints: { title: string; on: string }[]; reason?: string; version?: number }) => Promise<unknown>;
  onAdd: (b: Batch, preboardingIds: string[]) => Promise<unknown>;
  onLoi: (b: Batch) => Promise<{ issued: number; failed: { message: string }[] }>;
}

export function BatchDialog({ batch, entities, today, onClose, onSave }: { batch: Batch | null; entities: Choice[]; today: string; onClose: () => void; onSave: BatchesScreenProps['onSave'] }) {
  const [name, setName] = useState(batch?.name ?? '');
  const [entity, setEntity] = useState<string | null>(batch?.legalEntityId ?? (entities.length === 1 ? entities[0].value : null));
  const [on, setOn] = useState<Date | null>(batch ? fromKey(batch.joiningOn) : null);
  const [touch, setTouch] = useState(batch?.touchpoints.map((t) => `${t.on} ${t.title}`).join('\n') ?? '');
  const [reason, setReason] = useState('');
  const moved = Boolean(batch && on && dayKey(on) !== batch.joiningOn);
  const touchpoints = touch
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => ({ on: l.slice(0, 10), title: l.slice(11).trim() }));
  const touchOk = touchpoints.every((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.on) && t.title.length >= 2);
  const ready = name.trim().length >= 2 && Boolean(entity && on) && touchOk && (!moved || reason.trim().length >= 3);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={batch ? 'Change the batch' : 'New batch'}
      consequence={moved ? 'Every member waiting to join moves to the new day, with their checklist.' : undefined}
      confirmLabel="Save batch"
      confirmDisabled={!ready}
      onConfirm={async () => {
        await onSave(batch?.id ?? null, { name: name.trim(), legalEntityId: entity!, joiningOn: dayKey(on!), touchpoints, ...(moved ? { reason: reason.trim() } : {}), ...(batch ? { version: batch.version } : {}) });
        onClose();
      }}
    >
      <FormField id="bt-name" label="Name" required>
        <TextField value={name} onChange={setName} maxLength={120} />
      </FormField>
      <FormField id="bt-entity" label="Legal entity" required>
        <Select aria-label="Legal entity" value={entity} onChange={setEntity} options={entities} disabled={Boolean(batch)} />
      </FormField>
      <FormField id="bt-on" label="Joining day" required>
        <DatePicker value={on} onChange={setOn} min={fromKey(today)} aria-label="Joining day" />
      </FormField>
      <FormField id="bt-touch" label="Touchpoints" optional helper="One per line: yyyy-mm-dd and what happens, for example 2026-11-02 Welcome call.">
        <TextArea value={touch} onChange={setTouch} rows={3} maxLength={2000} />
      </FormField>
      {moved && (
        <FormField id="bt-why" label="Why the day moves" required>
          <TextField value={reason} onChange={setReason} maxLength={300} />
        </FormField>
      )}
    </ConfirmDialog>
  );
}

export function AddMembersDialog({ batch, joiners, onClose, onAdd }: { batch: Batch; joiners: Choice[]; onClose: () => void; onAdd: BatchesScreenProps['onAdd'] }) {
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} size="md" title={`Add joiners to ${batch.name}`} consequence="They move to the batch's joining day." confirmLabel="Add joiners" confirmDisabled={!picked.length} onConfirm={async () => { await onAdd(batch, picked); onClose(); }}>
      {joiners.length ? (
        joiners.map((j) => <Checkbox key={j.value} checked={picked.includes(j.value)} onChange={(c) => setPicked(c ? [...picked, j.value] : picked.filter((x) => x !== j.value))} label={j.label} />)
      ) : (
        <Text as="p">No joiners of this legal entity are waiting outside a batch.</Text>
      )}
    </ConfirmDialog>
  );
}

// ------------------------------------------------------------------------------------------ death in service: payees (LIFE-5.04)

export function PayeesCard({ data, documents, onSave }: { data: Payees; documents: Choice[]; onSave: (payees: Payee[]) => Promise<unknown> }) {
  const [edit, setEdit] = useState(false);
  return (
    <Card
      title="Payees (death in service)"
      actions={
        <Button size="sm" onClick={() => setEdit(true)}>
          Change
        </Button>
      }
    >
      {!data.complete && <InlineAlert tone="warning" title="Payees are not complete">Record the nominees, or the legal heirs with their succession certificate, so that the shares make 100 %. Nothing is settled before that.</InlineAlert>}
      {data.payees.length ? (
        <ul className="yx-lif-list">
          {data.payees.map((x, i) => (
            <li key={x.id ?? i}>
              <Badge tone="neutral">{x.kind === 'nominee' ? 'Nominee' : 'Legal heir'}</Badge>
              <Text>{`${x.name} (${x.relation}): ${Number(x.sharePercent)} %`}</Text>
              {x.email && <Text tone="secondary" size="sm">{`Signs in with ${x.email}`}</Text>}
            </li>
          ))}
        </ul>
      ) : (
        <Text as="p">No nomination on file.</Text>
      )}
      {edit && <PayeesDialog current={data.payees} documents={documents} onClose={() => setEdit(false)} onSave={onSave} />}
    </Card>
  );
}

function PayeesDialog({ current, documents, onClose, onSave }: { current: Payee[]; documents: Choice[]; onClose: () => void; onSave: (payees: Payee[]) => Promise<unknown> }) {
  const blank: Payee = { kind: 'nominee', name: '', relation: '', sharePercent: '', email: null, documentId: null };
  const [rows, setRows] = useState<Payee[]>(current.length ? current.map((x) => ({ ...x, sharePercent: String(Number(x.sharePercent)) })) : [blank]);
  const set = (i: number, patch: Partial<Payee>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const total = rows.reduce((s, r) => s + (SHARE.test(r.sharePercent) ? Number(r.sharePercent) : 0), 0);
  const ready = rows.every((r) => r.name.trim().length >= 2 && r.relation.trim().length >= 2 && SHARE.test(r.sharePercent) && (r.kind === 'nominee' || r.documentId)) && Math.abs(total - 100) < 0.005;
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} size="md" title="Payees" consequence={`Shares now make ${total.toFixed(2)} %. They must make 100 %.`} confirmLabel="Save payees" confirmDisabled={!ready} onConfirm={async () => { await onSave(rows.map((r) => ({ ...r, email: r.email?.trim() || null }))); onClose(); }}>
      {rows.map((r, i) => (
        <div key={i} className="yx-lif-grid">
          <FormField id={`py-kind-${i}`} label="Who">
            <Segment label="Who" value={r.kind} onChange={(k) => set(i, { kind: k })} options={[{ value: 'nominee', label: 'Nominee' }, { value: 'legal_heir', label: 'Legal heir' }]} />
          </FormField>
          <FormField id={`py-name-${i}`} label="Name" required>
            <TextField value={r.name} onChange={(x) => set(i, { name: x })} maxLength={100} />
          </FormField>
          <FormField id={`py-rel-${i}`} label="Relation" required>
            <TextField value={r.relation} onChange={(x) => set(i, { relation: x })} maxLength={40} />
          </FormField>
          <FormField id={`py-share-${i}`} label="Share (%)" required>
            <TextField value={r.sharePercent} onChange={(x) => set(i, { sharePercent: x })} inputMode="decimal" maxLength={6} />
          </FormField>
          <FormField id={`py-mail-${i}`} label="Email for their login" optional>
            <TextField type="email" value={r.email ?? ''} onChange={(x) => set(i, { email: x })} maxLength={254} />
          </FormField>
          {r.kind === 'legal_heir' && (
            <FormField id={`py-doc-${i}`} label="Succession certificate" required helper="Upload it to the person's documents first.">
              <Select aria-label="Succession certificate" value={r.documentId} onChange={(x) => set(i, { documentId: x })} options={documents} />
            </FormField>
          )}
          {rows.length > 1 && (
            <Button size="sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
              Remove
            </Button>
          )}
        </div>
      ))}
      <Button size="sm" onClick={() => setRows([...rows, blank])}>
        Add a payee
      </Button>
    </ConfirmDialog>
  );
}

// ------------------------------------------------------------------------------------------ upcoming retirements and contract ends (LIFE-5.06)

export interface UpcomingExitsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  rows: UpcomingExit[] | null;
  today: string;
  people: Choice[];
  employmentTypes: Choice[];
  canChange: boolean;
  onContract: (employeeId: string, input: { action: 'set' | 'extend' | 'convert'; contractEndOn?: string; employmentTypeId?: string; reason: string }) => Promise<unknown>;
}

export function ContractDialog({ ask, people, types, today, onClose, onSave }: { ask: { employeeId: string | null; action: 'set' | 'extend' | 'convert' }; people: Choice[]; types: Choice[]; today: string; onClose: () => void; onSave: UpcomingExitsScreenProps['onContract'] }) {
  const [who, setWho] = useState<string | null>(ask.employeeId);
  const [end, setEnd] = useState<Date | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const ready = Boolean(who) && reason.trim().length >= 3 && (ask.action === 'convert' ? Boolean(type) : Boolean(end));
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={ask.action === 'set' ? 'Set a contract end' : ask.action === 'extend' ? 'Extend the contract' : 'Make permanent'}
      consequence={ask.action === 'convert' ? 'This sends an employment-type change for approval and removes the contract end.' : 'HR and the manager are reminded 30 and 7 days before.'}
      confirmLabel="Save"
      confirmDisabled={!ready}
      onConfirm={async () => {
        await onSave(who!, { action: ask.action, ...(end ? { contractEndOn: dayKey(end) } : {}), ...(type ? { employmentTypeId: type } : {}), reason: reason.trim() });
        onClose();
      }}
    >
      {!ask.employeeId && (
        <FormField id="ct-who" label="Person" required>
          <Select aria-label="Person" value={who} onChange={setWho} options={people} searchable />
        </FormField>
      )}
      {ask.action === 'convert' ? (
        <FormField id="ct-type" label="New employment type" required>
          <Select aria-label="New employment type" value={type} onChange={setType} options={types} />
        </FormField>
      ) : (
        <FormField id="ct-end" label="Contract ends on" required>
          <DatePicker value={end} onChange={setEnd} min={fromKey(today)} aria-label="Contract ends on" />
        </FormField>
      )}
      <FormField id="ct-why" label="Reason" required>
        <TextField value={reason} onChange={setReason} maxLength={500} />
      </FormField>
    </ConfirmDialog>
  );
}

// ------------------------------------------------------------------------------------------ retrenchment, closure, VRS (LIFE-5.07)

export interface RetrenchmentScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: IrOverview | null;
  today: string;
  entities: Choice[];
  onApply: (input: { legalEntityId: string; kind: IrPermission['kind']; workersAffected: number; reasons: string; appliedOn: string; authority: string }) => Promise<unknown>;
  onDecide: (r: IrPermission, input: { status: 'granted' | 'deemed' | 'refused'; decidedOn: string }) => Promise<unknown>;
  onClosure: (r: IrPermission, input: { lwd: string; reason: string }) => Promise<{ opened: number }>;
  onScheme: (input: { name: string; legalEntityId: string | null; opensOn: string; closesOn: string; minAge: number; minServiceYears: number }) => Promise<unknown>;
}

export function ApplyDialog({ entities, today, onClose, onApply }: { entities: Choice[]; today: string; onClose: () => void; onApply: RetrenchmentScreenProps['onApply'] }) {
  const [entity, setEntity] = useState<string | null>(entities.length === 1 ? entities[0].value : null);
  const [kind, setKind] = useState<IrPermission['kind']>('retrenchment');
  const [workers, setWorkers] = useState('');
  const [reasons, setReasons] = useState('');
  const [on, setOn] = useState<Date | null>(fromKey(today));
  const [authority, setAuthority] = useState('');
  const ready = Boolean(entity && on) && /^\d{1,6}$/.test(workers) && Number(workers) > 0 && reasons.trim().length >= 3 && authority.trim().length >= 2;
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} size="md" title="Record a permission request" confirmLabel="Save request" confirmDisabled={!ready} onConfirm={async () => { await onApply({ legalEntityId: entity!, kind, workersAffected: Number(workers), reasons: reasons.trim(), appliedOn: dayKey(on!), authority: authority.trim() }); onClose(); }}>
      <Segment label="For" value={kind} onChange={setKind} options={[{ value: 'retrenchment', label: 'Retrenchment' }, { value: 'layoff', label: 'Lay-off' }, { value: 'closure', label: 'Closure' }]} />
      <div className="yx-lif-grid">
        <FormField id="ir-entity" label="Legal entity" required>
          <Select aria-label="Legal entity" value={entity} onChange={setEntity} options={entities} />
        </FormField>
        <FormField id="ir-workers" label="Workers affected" required>
          <TextField value={workers} onChange={setWorkers} inputMode="numeric" maxLength={6} />
        </FormField>
        <FormField id="ir-on" label="Applied on" required>
          <DatePicker value={on} onChange={setOn} max={fromKey(today)} aria-label="Applied on" />
        </FormField>
        <FormField id="ir-auth" label="Authority" required>
          <TextField value={authority} onChange={setAuthority} maxLength={200} />
        </FormField>
      </div>
      <FormField id="ir-why" label="Reasons" required>
        <TextArea value={reasons} onChange={setReasons} rows={3} maxLength={2000} />
      </FormField>
    </ConfirmDialog>
  );
}

export function DecideDialog({ r, today, onClose, onDecide }: { r: IrPermission; today: string; onClose: () => void; onDecide: RetrenchmentScreenProps['onDecide'] }) {
  const [status, setStatus] = useState<'granted' | 'deemed' | 'refused'>('granted');
  const [on, setOn] = useState<Date | null>(fromKey(today));
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} title="The government's decision" consequence={status === 'refused' ? 'Retrenchments waiting on this permission are cancelled.' : 'Retrenchments waiting on it can now be approved.'} confirmLabel="Save decision" confirmDisabled={!on} destructive={status === 'refused'} onConfirm={async () => { await onDecide(r, { status, decidedOn: dayKey(on!) }); onClose(); }}>
      <Segment label="Decision" value={status} onChange={setStatus} options={[{ value: 'granted', label: 'Granted' }, { value: 'deemed', label: 'Deemed granted' }, { value: 'refused', label: 'Refused' }]} />
      <FormField id="ir-dec-on" label="Decided on" required>
        <DatePicker value={on} onChange={setOn} max={fromKey(today)} aria-label="Decided on" />
      </FormField>
    </ConfirmDialog>
  );
}

export function ClosureDialog({ r, today, onClose, onClosure }: { r: IrPermission; today: string; onClose: () => void; onClosure: (r: IrPermission, input: { lwd: string; reason: string }) => Promise<unknown> }) {
  const [lwd, setLwd] = useState<Date | null>(null);
  const [reason, setReason] = useState('');
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} size="md" title="Start the closure exits?" consequence="A retrenchment exit starts for everyone still working in this legal entity, with this last working day." confirmLabel="Start exits" destructive confirmDisabled={!lwd || reason.trim().length < 3} onConfirm={async () => { await onClosure(r, { lwd: dayKey(lwd!), reason: reason.trim() }); onClose(); }}>
      <FormField id="cl-lwd" label="Last working day" required>
        <DatePicker value={lwd} onChange={setLwd} min={fromKey(today)} aria-label="Last working day" />
      </FormField>
      <FormField id="cl-why" label="Reason" required>
        <TextField value={reason} onChange={setReason} maxLength={500} />
      </FormField>
    </ConfirmDialog>
  );
}

export function SchemeDialog({ entities, today, onClose, onScheme }: { entities: Choice[]; today: string; onClose: () => void; onScheme: RetrenchmentScreenProps['onScheme'] }) {
  const [name, setName] = useState('');
  const [entity, setEntity] = useState<string | null>(null);
  const [from, setFrom] = useState<Date | null>(fromKey(today));
  const [to, setTo] = useState<Date | null>(null);
  const [age, setAge] = useState('40');
  const [service, setService] = useState('10');
  const ready = name.trim().length >= 2 && Boolean(from && to) && /^\d{2}$/.test(age) && /^\d{1,2}$/.test(service);
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} size="md" title="New VRS scheme" confirmLabel="Open scheme" confirmDisabled={!ready} onConfirm={async () => { await onScheme({ name: name.trim(), legalEntityId: entity, opensOn: dayKey(from!), closesOn: dayKey(to!), minAge: Number(age), minServiceYears: Number(service) }); onClose(); }}>
      <FormField id="vs-name" label="Name" required>
        <TextField value={name} onChange={setName} maxLength={120} />
      </FormField>
      <div className="yx-lif-grid">
        <FormField id="vs-entity" label="Legal entity" optional helper="Blank: the whole company.">
          <Select aria-label="Legal entity" value={entity} onChange={setEntity} options={entities} clearable />
        </FormField>
        <FormField id="vs-from" label="Opens on" required>
          <DatePicker value={from} onChange={setFrom} aria-label="Opens on" />
        </FormField>
        <FormField id="vs-to" label="Closes on" required>
          <DatePicker value={to} onChange={setTo} aria-label="Closes on" />
        </FormField>
        <FormField id="vs-age" label="Minimum age" required>
          <TextField value={age} onChange={setAge} inputMode="numeric" maxLength={2} />
        </FormField>
        <FormField id="vs-service" label="Minimum years of service" required>
          <TextField value={service} onChange={setService} inputMode="numeric" maxLength={2} />
        </FormField>
      </div>
    </ConfirmDialog>
  );
}

/** Me › Resign: the VRS schemes open to me (eligible or not, with why). */
export function VrsCard({ schemes, today, onApply }: { schemes: MyVrsScheme[]; today: string; onApply: (s: MyVrsScheme, input: { requestedLwd: string; reasonText: string | null }) => Promise<unknown> }) {
  const [open, setOpen] = useState<MyVrsScheme | null>(null);
  const [lwd, setLwd] = useState<Date | null>(null);
  const [why, setWhy] = useState('');
  if (!schemes.length) return null;
  return (
    <Card title="Voluntary retirement">
      <ul className="yx-lif-list">
        {schemes.map((s) => (
          <li key={s.id}>
            <Text>{`${s.name}: open until ${dateText(s.closesOn)}`}</Text>
            {s.eligible ? (
              <Button size="sm" onClick={() => setOpen(s)}>
                Apply
              </Button>
            ) : (
              <Text tone="secondary" size="sm">{`For age ${s.minAge}+ with ${s.minServiceYears}+ years of service.`}</Text>
            )}
          </li>
        ))}
      </ul>
      {open && (
        <ConfirmDialog open onOpenChange={(o) => !o && setOpen(null)} size="md" title={`Apply for ${open.name}?`} consequence="HR decides. You can talk to HR before you apply." confirmLabel="Apply" confirmDisabled={!lwd} onConfirm={async () => { await onApply(open, { requestedLwd: dayKey(lwd!), reasonText: why.trim() || null }); setOpen(null); }}>
          <FormField id="vr-lwd" label="Last working day you would like" required>
            <DatePicker value={lwd} onChange={setLwd} min={fromKey(today)} aria-label="Last working day you would like" />
          </FormField>
          <FormField id="vr-why" label="Anything HR should know" optional>
            <TextArea value={why} onChange={setWhy} rows={2} maxLength={1000} />
          </FormField>
        </ConfirmDialog>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------------------------------ letter editor tab (PPL-29) and bulk wizard (PPL-28)

export interface LetterEditorProps {
  initial: { letterType: string; name: string; requiresApproval: boolean; personSigns: boolean; paragraphs: EditorParagraph[] } | null;
  fields: string[];
  onClose: () => void;
  onSave: (input: { letterType: string; name: string; requiresApproval: boolean; personSigns: boolean; paragraphs: EditorParagraph[] }) => Promise<unknown>;
}

/** Writes a letter in YukthiX; saved as a Word file and a new draft version (a sample preview still comes first). */
export function LetterEditor(p: LetterEditorProps) {
  const [type, setType] = useState(p.initial?.letterType ?? '');
  const [name, setName] = useState(p.initial?.name ?? '');
  const [approval, setApproval] = useState(p.initial?.requiresApproval ?? false);
  const [signs, setSigns] = useState(p.initial?.personSigns ?? false);
  const [rows, setRows] = useState<EditorParagraph[]>(p.initial?.paragraphs ?? [{ text: '{{legal_entity}}', bold: true, heading: true }, { text: 'Dear {{employee_name}},', bold: false, heading: false }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (i: number, patch: Partial<EditorParagraph>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const ready = /^[a-z][a-z0-9_]{1,39}$/.test(type) && name.trim().length >= 2 && rows.some((r) => r.text.trim());
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && p.onClose()}
      title={p.initial ? `Edit ${p.initial.name}` : 'Write a letter'}
      size="lg"
      dirty
      footer={
        <>
          <Button onClick={p.onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!ready}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await p.onSave({ letterType: type, name: name.trim(), requiresApproval: approval, personSigns: signs, paragraphs: rows.filter((r) => r.text.trim()) });
                p.onClose();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Save as a draft
          </Button>
        </>
      }
    >
      {error && (
        <InlineAlert tone="danger" title="Not saved">
          {error}
        </InlineAlert>
      )}
      <div className="yx-lif-grid">
        <FormField id="ed-type" label="Letter type" required helper="Lower-case letters and _, for example transfer_letter.">
          <TextField value={type} onChange={setType} maxLength={40} disabled={Boolean(p.initial)} />
        </FormField>
        <FormField id="ed-name" label="Name" required>
          <TextField value={name} onChange={setName} maxLength={100} />
        </FormField>
      </div>
      <Checkbox checked={approval} onChange={setApproval} label="The signatory approves each letter" />
      <Checkbox checked={signs} onChange={setSigns} label="The person accepts it" />
      <Text as="p" tone="secondary" size="sm">{`Fields you can use: ${p.fields.map((f) => `{{${f}}}`).join(' ')}`}</Text>
      {rows.map((r, i) => (
        <div key={i} className="yx-lif-grid">
          <FormField id={`ed-p-${i}`} label={`Paragraph ${i + 1}`}>
            <TextArea value={r.text} onChange={(x) => set(i, { text: x })} rows={2} maxLength={2000} />
          </FormField>
          <div>
            <Checkbox checked={r.heading} onChange={(c) => set(i, { heading: c })} label="Heading" />
            <Checkbox checked={r.bold} onChange={(c) => set(i, { bold: c })} label="Bold" />
            <Button size="sm" onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length === 1}>
              Remove
            </Button>
          </div>
        </div>
      ))}
      <Button size="sm" onClick={() => setRows([...rows, { text: '', bold: false, heading: false }])}>
        Add a paragraph
      </Button>
    </Drawer>
  );
}

export function BulkLetterDialog({ types, people, onClose, onIssue, defaultPicked = [] }: { types: Choice[]; people: Choice[]; onClose: () => void; onIssue: (letterType: string, personIds: string[]) => Promise<unknown>; defaultPicked?: string[] }) {
  const [type, setType] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>(defaultPicked);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title="Issue a letter to many"
      consequence="Each letter goes through the usual checks; letters that need approval wait for the signatory."
      confirmLabel={`Issue to ${picked.length}`}
      confirmDisabled={!type || !picked.length}
      onConfirm={async () => {
        await onIssue(type!, picked);
        onClose();
      }}
    >
      <FormField id="bl-type" label="Letter" required>
        <Select aria-label="Letter" value={type} onChange={setType} options={types} />
      </FormField>
      <Checkbox checked={picked.length === people.length && people.length > 0} onChange={(c) => setPicked(c ? people.map((x) => x.value) : [])} label="Everyone listed" />
      {people.map((x) => (
        <Checkbox key={x.value} checked={picked.includes(x.value)} onChange={(c) => setPicked(c ? [...picked, x.value] : picked.filter((y) => y !== x.value))} label={x.label} />
      ))}
    </ConfirmDialog>
  );
}
