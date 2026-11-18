import { useState } from 'react';
import { Button } from '../../../components/button';
import { Badge } from '../../../components/display';
import { Checkbox } from '../../../components/choice';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../../components/field';
import { NumberField, TextArea, TextField } from '../../../components/inputs';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { useRun } from '../../org/org-kit';
import { dateText } from './kit';
import type { LoadState, OtRuleInput, OtRuleRow, ShiftInput, ShiftSetup } from './types';

// HR › Shifts set-up (M02 §B2, Q2, Q7, §B7), the parts with no design of their own yet: overtime rules by scope and
// date, timesheet projects, and the women's night-work records the law needs (consents and the establishment's
// safeguards, OSH Code). The designed ShiftEditorScreen (roster.tsx, TIM-06) shows them as extra tabs next to its
// Shift and Patterns tabs, which hold shifts with times from a date and patterns with who follows them.

/** HR › Shifts set-up's data and handlers; the designed ShiftEditorScreen (TIM-06) takes them as `live`. */
export interface LiveShiftSetup {
  state: LoadState;
  onRetry?: () => void;
  data: ShiftSetup | null;
  onCreateShift: (input: ShiftInput) => Promise<unknown>;
  onShiftTimes: (id: string, input: Omit<ShiftInput, 'code' | 'name' | 'colour' | 'night'>) => Promise<unknown>;
  onShiftDetails: (id: string, input: { name: string; colour: string; night: boolean; active: boolean; reclockIn?: boolean }) => Promise<unknown>;
  onCreatePattern: (input: { name: string; kind: 'weekly' | 'cycle'; cycle: (string | null)[] }) => Promise<unknown>;
  onAssignPattern: (id: string, input: { scopeType: string; scopeId?: string; validFrom: string; offsetDays: number }) => Promise<unknown>;
  onRemoveAssignment: (id: string) => Promise<unknown>;
  onCreateOtRule: (input: OtRuleInput) => Promise<unknown>;
  onRemoveOtRule: (id: string) => Promise<unknown>;
  onAddConsent: (input: { employeeId: string; locationId: string; givenOn: string; reference: string }) => Promise<unknown>;
  onWithdrawConsent: (id: string, on: string) => Promise<unknown>;
  onAttest: (input: { locationId: string; item: string; attestedOn: string; reviewDue: string; note: string }) => Promise<unknown>;
}

export const COLOURS = ['blue', 'green', 'teal', 'purple', 'orange', 'pink', 'grey', 'red'].map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }));
export const SCOPES = [
  { value: 'tenant', label: 'Whole company' },
  { value: 'legal_entity', label: 'Legal entity' },
  { value: 'location', label: 'Location' },
  { value: 'department', label: 'Department' },
  { value: 'employee', label: 'One person' },
];
export const toMinute = (hhmm: string | null) => (hhmm ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) : null);
export const fromMinute = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const minutes = (m: number | null) => (m === null ? 'none' : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} m` : `${m / 60} h`);

// ------------------------------------------------------------------------------------------ overtime rules

export function OvertimeRulesTab({ data, onCreateOtRule, onRemoveOtRule }: { data: ShiftSetup } & Pick<LiveShiftSetup, 'onCreateOtRule' | 'onRemoveOtRule'>) {
  const [adding, setAdding] = useState(false);
  const { busy, error, run } = useRun();
  return (
    <div className="yx-tim-stack">
      <div>
        <Button variant="primary" onClick={() => setAdding(true)}>
          Add an overtime rule
        </Button>
      </div>
      <InlineAlert tone="info" title="The law's limits always apply">
        Overtime above the legal daily and quarterly limits is flagged and paid only after HR overrides it with a reason.
      </InlineAlert>
      {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
      {data.otRules.length ? (
        <table className="yx-tim-table" aria-label="Overtime rules">
          <thead>
            <tr>
              <th>Rule</th>
              <th>For</th>
              <th>From</th>
              <th>Counts</th>
              <th>Settled as</th>
              <th>
                <span className="yx-visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.otRules.map((r: OtRuleRow) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.scopeName}</td>
                <td>{dateText(r.validFrom)}</td>
                <td className="yx-tim-note">
                  From {r.minMinutes} min, in {r.roundMinutes}-minute steps{r.dailyCapMinutes ? `, at most ${minutes(r.dailyCapMinutes)} a day` : ''} · {r.rateNormal}× ({r.rateWeeklyOff}× weekly off, {r.rateHoliday}× holiday){r.needsApproval ? ' · manager approves' : ' · no approval'}
                </td>
                <td>{r.settle === 'comp_off' ? `Comp-off (half day from ${minutes(r.compOffHalfMinutes)}, full day from ${minutes(r.compOffFullMinutes)})` : 'Paid in payroll'}</td>
                <td>
                  {r.removable && (
                    <Button size="sm" loading={busy === r.id} onClick={() => void run(r.id, () => onRemoveOtRule(r.id))}>
                      Remove
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState compact title="No overtime rules yet" description="Without a rule, no one can claim overtime." />
      )}
      {adding && <OtDrawer data={data} onClose={() => setAdding(false)} onCreate={onCreateOtRule} />}
    </div>
  );
}

function OtDrawer({ data, onClose, onCreate }: { data: ShiftSetup; onClose: () => void; onCreate: LiveShiftSetup['onCreateOtRule'] }) {
  const [name, setName] = useState('');
  const [scopeType, setScopeType] = useState<string | null>('tenant');
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [validFrom, setValidFrom] = useState(data.today);
  const [min, setMin] = useState<number | null>(30);
  const [round, setRound] = useState<'1' | '5' | '10' | '15' | '30' | '60'>('15');
  const [cap, setCap] = useState<number | null>(null);
  const [rates, setRates] = useState<[number | null, number | null, number | null]>([2, 2, 2]);
  const [needsApproval, setNeedsApproval] = useState(true);
  const [settle, setSettle] = useState<'pay' | 'comp_off'>('pay');
  const [half, setHalf] = useState<number | null>(240);
  const [full, setFull] = useState<number | null>(480);
  const { busy, error, run } = useRun();
  const list = scopeType === 'location' ? data.locations.map((x) => ({ value: x.id, label: x.name })) : scopeType === 'department' ? data.departments.map((x) => ({ value: x.id, label: x.name })) : scopeType === 'legal_entity' ? data.entities.map((x) => ({ value: x.id, label: x.name })) : scopeType === 'employee' ? data.people.map((x) => ({ value: x.id, label: x.name })) : [];
  const errors = [
    ...(!name.trim() ? [{ fieldId: 'ot-name', message: 'Name the rule.' }] : []),
    ...(scopeType !== 'tenant' && !scopeId ? [{ fieldId: 'ot-who', message: 'Choose who the rule is for.' }] : []),
    ...(validFrom < data.today ? [{ fieldId: 'ot-from', message: 'Choose today or a later date.' }] : []),
    ...(settle === 'comp_off' && !data.hasCompOffType ? [{ fieldId: 'ot-settle', message: 'Add a comp-off leave type first (Leave set-up).' }] : []),
    ...(settle === 'comp_off' && (half ?? 0) > (full ?? 0) ? [{ fieldId: 'ot-half', message: 'A half day needs fewer minutes than a full day.' }] : []),
  ];
  const saveErrors = useSaveErrors(errors);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add an overtime rule"
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'save'}
            onClick={() => {
              if (errors.length) return saveErrors.reveal();
              void run('save', async () => {
                await onCreate({ name: name.trim(), scopeType: scopeType!, ...(scopeType === 'tenant' ? {} : { scopeId: scopeId! }), validFrom, minMinutes: min ?? 0, roundMinutes: Number(round), dailyCapMinutes: cap, rateNormal: rates[0] ?? 2, rateWeeklyOff: rates[1] ?? 2, rateHoliday: rates[2] ?? 2, needsApproval, settle, compOffHalfMinutes: half ?? 240, compOffFullMinutes: full ?? 480 });
                onClose();
              });
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="yx-tim-form">
        <ErrorSummary errors={saveErrors.shownErrors} />
        {error && <InlineAlert tone="danger" title="Not saved">{error}</InlineAlert>}
        <FormField id="ot-name" label="Name" required error={saveErrors.errorOf('ot-name')}>
          <TextField value={name} onChange={setName} maxLength={60} />
        </FormField>
        <div className="yx-tim-row">
          <FormField id="ot-scope" label="Applies to">
            <Select
              value={scopeType}
              onChange={(v) => {
                setScopeType(v);
                setScopeId(null);
              }}
              options={SCOPES}
            />
          </FormField>
          {scopeType !== 'tenant' && (
            <FormField id="ot-who" label="Who" required error={saveErrors.errorOf('ot-who')}>
              <Select value={scopeId} onChange={setScopeId} options={list} />
            </FormField>
          )}
        </div>
        <FormField id="ot-from" label="From" required error={saveErrors.errorOf('ot-from')}>
          <TextField type="date" value={validFrom} min={data.today} onChange={setValidFrom} />
        </FormField>
        <div className="yx-tim-row">
          <FormField id="ot-min" label="Counts from (minutes past the shift)" helper="Less than this is no overtime.">
            <NumberField value={min} onChange={setMin} min={0} max={240} />
          </FormField>
          <FormField id="ot-cap" label="At most a day (minutes)" optional helper="The law's limit applies anyway.">
            <NumberField value={cap} onChange={setCap} min={15} max={720} />
          </FormField>
        </div>
        <FormField id="ot-round" label="Rounded down to">
          <Segment label="Rounded down to" value={round} onChange={setRound} options={(['1', '5', '10', '15', '30', '60'] as const).map((x) => ({ value: x, label: `${x} min` }))} />
        </FormField>
        <div className="yx-tim-row">
          {(['Working day', 'Weekly off', 'Holiday'] as const).map((label, i) => (
            <FormField key={label} id={`ot-rate-${i}`} label={`Rate on a ${label.toLowerCase()} (×)`}>
              <NumberField value={rates[i]} onChange={(v) => setRates((r) => r.map((x, j) => (j === i ? v : x)) as typeof rates)} decimals min={1} max={4} />
            </FormField>
          ))}
        </div>
        <Checkbox label="The manager approves each claim" checked={needsApproval} onChange={setNeedsApproval} />
        <FormField id="ot-settle" label="Settled as" error={saveErrors.errorOf('ot-settle')}>
          <Segment label="Settled as" value={settle} onChange={setSettle} options={[{ value: 'pay', label: 'Paid in payroll' }, { value: 'comp_off', label: 'Comp-off' }]} />
        </FormField>
        {settle === 'comp_off' && (
          <div className="yx-tim-row">
            <FormField id="ot-half" label="Half day of comp-off from (minutes)" error={saveErrors.errorOf('ot-half')}>
              <NumberField value={half} onChange={setHalf} min={60} max={720} />
            </FormField>
            <FormField id="ot-full" label="Full day of comp-off from (minutes)">
              <NumberField value={full} onChange={setFull} min={60} max={720} />
            </FormField>
          </div>
        )}
      </div>
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------ timesheet projects

/** Projects P-1 (answer 1402): timesheet projects are set up in Projects now; this tab only says where they went. */
export function ProjectsTab() {
  return (
    <InlineAlert tone="info" title="Timesheet projects moved to Projects">
      Projects, their teams, tasks and budgets are set up in Projects (in the main menu). If you don't see Projects, a System Admin switches it on in Settings › Projects & timesheets.
    </InlineAlert>
  );
}

// ------------------------------------------------------------------------------------------ night work (OSH Code)

export function NightWorkTab({ data, onAddConsent, onWithdrawConsent, onAttest }: { data: ShiftSetup } & Pick<LiveShiftSetup, 'onAddConsent' | 'onWithdrawConsent' | 'onAttest'>) {
  const [recording, setRecording] = useState(false);
  const [attesting, setAttesting] = useState<{ locationId: string; item: string; label: string } | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [withdrawOn, setWithdrawOn] = useState(data.today);
  const { busy, error, run } = useRun();
  return (
    <div className="yx-tim-stack">
      <InlineAlert tone="info" title="The law guard">
        A woman or transgender person, or anyone who opted in to this protection, can be placed on a shift touching the legal night window (7 pm to 6 am) only with their written consent on file, confirmed by them in the app with a one-time code, and every safeguard below in date. There is no override, and refusing or withdrawing consent never leads to any action against them.
      </InlineAlert>
      {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
      {data.night.locations.map((l) => (
        <Card key={l.locationId} title={`${l.name}: safeguards`}>
          <ul className="yx-tim-list" aria-label={`${l.name} safeguards`}>
            {l.items.map((it) => (
              <li key={it.item} className="yx-tim-row">
                <Badge tone={it.ok ? 'success' : 'danger'}>{it.ok ? 'In date' : it.attestedOn ? 'Review overdue' : 'Not checked'}</Badge>
                <span className="yx-tim-list__main">
                  <span>{it.label}</span>
                  {it.attestedOn && <span className="yx-tim-note">Checked {dateText(it.attestedOn)} · review by {dateText(it.reviewDue!)}</span>}
                </span>
                <Button size="sm" onClick={() => setAttesting({ locationId: l.locationId, item: it.item, label: it.label })}>
                  Record a check
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      <Card
        title="Night-work consents"
        actions={
          <Button size="sm" onClick={() => setRecording(true)}>
            Record a consent
          </Button>
        }
      >
        {data.night.consents.length ? (
          <ul className="yx-tim-list" aria-label="Consents">
            {data.night.consents.map((x) => (
              <li key={x.id} className="yx-tim-row">
                <span className="yx-tim-list__main">
                  <span>
                    {x.name} · {x.location}
                  </span>
                  <span className="yx-tim-note">
                    Given {dateText(x.givenOn)} · {x.reference}
                    {x.withdrawnOn ? ` · withdrawn from ${dateText(x.withdrawnOn)}` : ''}
                  </span>
                </span>
                {!x.withdrawnOn && <Badge tone={x.confirmedAt ? 'success' : 'warning'}>{x.confirmedAt ? 'Confirmed by them' : 'Waiting for their confirmation'}</Badge>}
                {!x.withdrawnOn && (
                  <Button size="sm" onClick={() => setWithdrawing(x.id)}>
                    Record a withdrawal
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="yx-tim-muted">No consents on file.</p>
        )}
      </Card>
      <Card title="Opted in to the night-work protection">
        {data.night.optIns?.length ? (
          <ul className="yx-tim-list" aria-label="Opted in">
            {data.night.optIns.map((x) => (
              <li key={x.employeeId} className="yx-tim-row">
                <span className="yx-tim-list__main">
                  <span>{x.name}</span>
                  <span className="yx-tim-note">Since {dateText(x.since.slice(0, 10))} · only they can turn it off</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="yx-tim-muted">Nobody has opted in. Anyone can, from Me › Attendance.</p>
        )}
      </Card>
      {withdrawing && (
        <Drawer
          open
          onOpenChange={(o) => !o && setWithdrawing(null)}
          title="Record a withdrawal of consent"
          footer={
            <>
              <Button onClick={() => setWithdrawing(null)}>Cancel</Button>
              <Button variant="primary" loading={busy === 'withdraw'} onClick={() => void run('withdraw', async () => (await onWithdrawConsent(withdrawing, withdrawOn), setWithdrawing(null)))}>
                Record
              </Button>
            </>
          }
        >
          <div className="yx-tim-form">
            <FormField id="nw-on" label="From" required helper="They are not placed on nights from this day. Shifts already published stay until the roster changes.">
              <TextField type="date" value={withdrawOn} onChange={setWithdrawOn} />
            </FormField>
          </div>
        </Drawer>
      )}
      {recording && <ConsentDrawer data={data} onClose={() => setRecording(false)} onAdd={onAddConsent} />}
      {attesting && <AttestDrawer today={data.today} target={attesting} onClose={() => setAttesting(null)} onAttest={onAttest} />}
    </div>
  );
}

function ConsentDrawer({ data, onClose, onAdd }: { data: ShiftSetup; onClose: () => void; onAdd: LiveShiftSetup['onAddConsent'] }) {
  const [who, setWho] = useState<string | null>(null);
  const [loc, setLoc] = useState<string | null>(data.locations[0]?.id ?? null);
  const [givenOn, setGivenOn] = useState(data.today);
  const [reference, setReference] = useState('');
  const { busy, error, run } = useRun();
  const errors = [...(!who ? [{ fieldId: 'nc-who', message: 'Choose the person.' }] : []), ...(!loc ? [{ fieldId: 'nc-loc', message: 'Choose the establishment.' }] : []), ...(!reference.trim() ? [{ fieldId: 'nc-ref', message: 'Say where the signed form is kept.' }] : [])];
  const saveErrors = useSaveErrors(errors);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Record a night-work consent"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'save'}
            onClick={() => {
              if (errors.length) return saveErrors.reveal();
              void run('save', async () => {
                await onAdd({ employeeId: who!, locationId: loc!, givenOn, reference: reference.trim() });
                onClose();
              });
            }}
          >
            Record
          </Button>
        </>
      }
    >
      <div className="yx-tim-form">
        <ErrorSummary errors={saveErrors.shownErrors} />
        {error && <InlineAlert tone="danger" title="Not recorded">{error}</InlineAlert>}
        <FormField id="nc-who" label="Person" required error={saveErrors.errorOf('nc-who')}>
          <Select value={who} onChange={setWho} options={data.people.map((x) => ({ value: x.id, label: x.code ? `${x.name} (${x.code})` : x.name }))} />
        </FormField>
        <FormField id="nc-loc" label="Establishment" required error={saveErrors.errorOf('nc-loc')}>
          <Select value={loc} onChange={setLoc} options={data.locations.map((x) => ({ value: x.id, label: x.name }))} />
        </FormField>
        <FormField id="nc-on" label="Given on" required>
          <TextField type="date" value={givenOn} onChange={setGivenOn} />
        </FormField>
        <FormField id="nc-ref" label="Signed form" required helper="Its number and where it is kept." error={saveErrors.errorOf('nc-ref')}>
          <TextField value={reference} onChange={setReference} maxLength={200} />
        </FormField>
      </div>
    </Drawer>
  );
}

function AttestDrawer({ today, target, onClose, onAttest }: { today: string; target: { locationId: string; item: string; label: string }; onClose: () => void; onAttest: LiveShiftSetup['onAttest'] }) {
  const [attestedOn, setAttestedOn] = useState(today);
  const [reviewDue, setReviewDue] = useState('');
  const [note, setNote] = useState('');
  const { busy, error, run } = useRun();
  const errors = [...(!reviewDue || reviewDue <= attestedOn ? [{ fieldId: 'sg-review', message: 'Choose a review date after the check.' }] : []), ...(attestedOn > today ? [{ fieldId: 'sg-on', message: 'A check is recorded once it is done.' }] : []), ...(!note.trim() ? [{ fieldId: 'sg-note', message: 'Say what was checked.' }] : [])];
  const saveErrors = useSaveErrors(errors);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Record a check: ${target.label}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'save'}
            onClick={() => {
              if (errors.length) return saveErrors.reveal();
              void run('save', async () => {
                await onAttest({ locationId: target.locationId, item: target.item, attestedOn, reviewDue, note: note.trim() });
                onClose();
              });
            }}
          >
            Record
          </Button>
        </>
      }
    >
      <div className="yx-tim-form">
        <ErrorSummary errors={saveErrors.shownErrors} />
        {error && <InlineAlert tone="danger" title="Not recorded">{error}</InlineAlert>}
        <FormField id="sg-on" label="Checked on" required error={saveErrors.errorOf('sg-on')}>
          <TextField type="date" value={attestedOn} max={today} onChange={setAttestedOn} />
        </FormField>
        <FormField id="sg-review" label="Check again by" required error={saveErrors.errorOf('sg-review')}>
          <TextField type="date" value={reviewDue} min={attestedOn} onChange={setReviewDue} />
        </FormField>
        <FormField id="sg-note" label="What was checked" required error={saveErrors.errorOf('sg-note')}>
          <TextArea value={note} onChange={setNote} rows={3} maxLength={300} />
        </FormField>
      </div>
    </Drawer>
  );
}
