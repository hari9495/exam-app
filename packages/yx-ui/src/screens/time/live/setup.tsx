import { useState } from 'react';
import { Button } from '../../../components/button';
import { Badge } from '../../../components/display';
import { Checkbox } from '../../../components/choice';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../../components/field';
import { NumberField, TextField, TimeField } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/shell';
import { useRun } from '../../org/org-kit';
import { LivePage, WEEKDAYS, clock, dateText, dayText, offsText } from './kit';
import type { LeaveRules, LeaveTypeRow, LoadState, LocationRule, PolicyLine, TimeSetup, YearEndPreview } from './types';

// HR › Leave set-up (TIM-26 / 27 / 28 / 29) and the attendance basics of each location: leave types with their
// counting rules, policies (dated versions, assigned by scope from a date), the state minimums the law sets (P07),
// holiday calendars per location, shifts and weekly offs, and year end (preview, then post).

export interface TimeSetupScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: TimeSetup | null;
  onSaveType: (id: string | null, input: { code: string; name: string; kind: string; paid: boolean; colour: string; active: boolean; rules: LeaveRules }) => Promise<unknown>;
  onCreatePolicy: (name: string) => Promise<unknown>;
  onAddVersion: (policyId: string, input: { validFrom: string; lines: PolicyLine[] }) => Promise<unknown>;
  onAssign: (policyId: string, input: { scopeType: string; scopeId?: string; validFrom: string }) => Promise<unknown>;
  onRemoveAssignment: (id: string) => Promise<unknown>;
  onCreateCalendar: (input: { name: string; locationId?: string; optionalLimit: number }) => Promise<unknown>;
  onAddHoliday: (calendarId: string, input: { on: string; name: string; kind: string; halfDay: boolean }) => Promise<unknown>;
  onRemoveHoliday: (id: string) => Promise<unknown>;
  onSetRule: (locationId: string, input: { validFrom: string; shiftName: string; shiftStart: number; shiftEnd: number; graceMinutes: number; weeklyOffs: { weekday: number; nth?: number[] }[]; checkIn: 'restricted' | 'field' }) => Promise<unknown>;
  onYearEndPreview: (yearEnd: string) => Promise<YearEndPreview>;
  onYearEndRun: (yearEnd: string) => Promise<unknown>;
}

const KINDS = [
  { value: 'earned', label: 'Earned' },
  { value: 'casual', label: 'Casual' },
  { value: 'sick', label: 'Sick' },
  { value: 'lop', label: 'Leave without pay' },
  { value: 'comp_off', label: 'Comp-off' },
  { value: 'maternity', label: 'Maternity' },
  { value: 'paternity', label: 'Paternity' },
  { value: 'other', label: 'Other' },
];
const COLOURS = ['blue', 'green', 'teal', 'purple', 'orange', 'pink', 'grey', 'red'].map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }));
const DEFAULT_RULES: LeaveRules = { sandwich: 'none', sandwichOn: 'both', sandwichHalfDays: false, halfDays: true, minDays: null, maxDays: null, noticeDays: 0, certificateAfterDays: null, medical: false, negativeLimit: 0, encashable: false, hrApprovalAboveDays: null };
const kindText = (k: string) => KINDS.find((x) => x.value === k)?.label ?? k;
const STATE_TEXT: Record<string, string> = { 'IN-KA': 'Karnataka', 'IN-TN': 'Tamil Nadu' };

export function TimeSetupScreen(p: TimeSetupScreenProps) {
  const [tab, setTab] = useState('types');
  const d = p.data;
  return (
    <LivePage title="Leave and attendance set-up" description="Company rules for leave and attendance. Dated changes start on their date; what is already in force stays as it was." state={p.state} onRetry={p.onRetry} what="the leave set-up" grantedBy="your HR admin">
      {d && (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList aria-label="Set-up">
            <TabsTrigger value="types">Leave types</TabsTrigger>
            <TabsTrigger value="policies">Policies</TabsTrigger>
            <TabsTrigger value="holidays">Holidays</TabsTrigger>
            <TabsTrigger value="attendance">Shifts and weekly offs</TabsTrigger>
            <TabsTrigger value="year-end">Year end</TabsTrigger>
          </TabsList>
          <TabsContent value="types">
            <Types data={d} onSave={p.onSaveType} />
          </TabsContent>
          <TabsContent value="policies">
            <Policies {...p} data={d} />
          </TabsContent>
          <TabsContent value="holidays">
            <Holidays {...p} data={d} />
          </TabsContent>
          <TabsContent value="attendance">
            <Attendance data={d} onSetRule={p.onSetRule} />
          </TabsContent>
          <TabsContent value="year-end">
            <YearEnd today={d.today} onPreview={p.onYearEndPreview} onRun={p.onYearEndRun} />
          </TabsContent>
        </Tabs>
      )}
    </LivePage>
  );
}

// ------------------------------------------------------------------------------------------ leave types

function rulesText(r: LeaveRules): string {
  const parts = [r.sandwich === 'none' ? 'weekends and holidays never count' : r.sandwich === 'sandwich' ? 'weekends and holidays between leave days count' : 'weekends and holidays inside the dates count'];
  if (!r.halfDays) parts.push('whole days only');
  if (r.noticeDays) parts.push(`${r.noticeDays} days notice`);
  if (r.maxDays !== null) parts.push(`at most ${r.maxDays} at a time`);
  if (r.certificateAfterDays !== null) parts.push(`certificate after ${r.certificateAfterDays} days`);
  if (r.hrApprovalAboveDays !== null) parts.push(r.hrApprovalAboveDays === 0 ? 'HR approves too' : `HR approves above ${r.hrApprovalAboveDays} days`);
  if (r.medical) parts.push('reason is private to HR');
  return parts.join(' · ');
}

function Types({ data, onSave }: { data: TimeSetup; onSave: TimeSetupScreenProps['onSaveType'] }) {
  const [editing, setEditing] = useState<LeaveTypeRow | 'new' | null>(null);
  return (
    <div className="yx-tim-stack">
      <div>
        <Button variant="primary" onClick={() => setEditing('new')}>
          Add a leave type
        </Button>
      </div>
      {data.types.length ? (
        <table className="yx-tim-table" aria-label="Leave types">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Kind</th>
              <th>Rules</th>
              <th>
                <span className="yx-visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.types.map((t) => (
              <tr key={t.id}>
                <td>{t.code}</td>
                <td>
                  {t.name} {!t.paid && <Badge tone="neutral">Unpaid</Badge>} {!t.active && <Badge tone="neutral">Not in use</Badge>}
                </td>
                <td>{kindText(t.kind)}</td>
                <td className="yx-tim-note">{rulesText(t.rules)}</td>
                <td>
                  <Button size="sm" onClick={() => setEditing(t)}>
                    Change
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState compact title="No leave types yet" description="Add earned, casual and sick leave first." />
      )}
      {editing && <TypeDrawer row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSave={onSave} />}
    </div>
  );
}

function TypeDrawer({ row, onClose, onSave }: { row: LeaveTypeRow | null; onClose: () => void; onSave: TimeSetupScreenProps['onSaveType'] }) {
  const [code, setCode] = useState(row?.code ?? '');
  const [name, setName] = useState(row?.name ?? '');
  const [kind, setKind] = useState<string | null>(row?.kind ?? 'earned');
  const [paid, setPaid] = useState<'paid' | 'unpaid'>(row && !row.paid ? 'unpaid' : 'paid');
  const [colour, setColour] = useState<string | null>(row?.colour ?? 'blue');
  const [active, setActive] = useState(row?.active ?? true);
  const [r, setR] = useState<LeaveRules>(row?.rules ?? DEFAULT_RULES);
  const { busy, error, run } = useRun();
  const set = <K extends keyof LeaveRules>(k: K, v: LeaveRules[K]) => setR((x) => ({ ...x, [k]: v }));
  const errors = [
    ...(!/^[A-Z][A-Z0-9]{0,7}$/.test(code) ? [{ fieldId: 'lt-code', message: 'Use 1 to 8 capital letters or digits, starting with a letter (EL, CL, SL).' }] : []),
    ...(!name.trim() ? [{ fieldId: 'lt-name', message: 'Name the leave type.' }] : []),
    ...(kind === 'lop' && paid === 'paid' ? [{ fieldId: 'lt-paid', message: 'Leave without pay is unpaid.' }] : []),
  ];
  const saveErrors = useSaveErrors(errors);
  const { errorOf } = saveErrors;
  const num = (k: 'minDays' | 'maxDays' | 'certificateAfterDays' | 'hrApprovalAboveDays', label: string, helper: string) => (
    <FormField id={`lt-${k}`} label={label} optional helper={helper}>
      <NumberField value={r[k]} onChange={(v) => set(k, v)} decimals min={0} max={366} />
    </FormField>
  );
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={row ? `Change ${row.name}` : 'Add a leave type'}
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
                await onSave(row?.id ?? null, { code, name: name.trim(), kind: kind!, paid: paid === 'paid', colour: colour ?? 'blue', active, rules: kind === 'lop' ? { ...r, negativeLimit: 0 } : r });
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
        <div className="yx-tim-row">
          <FormField id="lt-code" label="Code" required helper={row ? 'A code never changes.' : undefined} error={errorOf('lt-code')}>
            <TextField value={code} onChange={(v) => setCode(v.toUpperCase())} disabled={Boolean(row)} maxLength={8} />
          </FormField>
          <FormField id="lt-name" label="Name" required error={errorOf('lt-name')}>
            <TextField value={name} onChange={setName} maxLength={60} />
          </FormField>
        </div>
        <div className="yx-tim-row">
          <FormField id="lt-kind" label="Kind" required helper="The law’s minimums apply by kind.">
            <Select value={kind} onChange={setKind} options={KINDS} disabled={Boolean(row)} />
          </FormField>
          <FormField id="lt-colour" label="Colour">
            <Select value={colour} onChange={setColour} options={COLOURS} />
          </FormField>
        </div>
        <FormField id="lt-paid" label="Pay" error={errorOf('lt-paid')}>
          <Segment label="Pay" value={paid} onChange={setPaid} options={[{ value: 'paid', label: 'Paid' }, { value: 'unpaid', label: 'Unpaid' }]} />
        </FormField>
        <FormField id="lt-sandwich" label="Weekends and holidays inside the dates">
          <Segment label="Weekends and holidays inside the dates" value={r.sandwich} onChange={(v) => set('sandwich', v)} options={[{ value: 'none', label: 'Never count' }, { value: 'sandwich', label: 'Count between leave days' }, { value: 'always', label: 'Always count' }]} />
        </FormField>
        {r.sandwich !== 'none' && (
          <FormField id="lt-sandwich-on" label="Applies to">
            <Segment label="Applies to" value={r.sandwichOn} onChange={(v) => set('sandwichOn', v)} options={[{ value: 'weekly_offs', label: 'Weekly offs' }, { value: 'holidays', label: 'Holidays' }, { value: 'both', label: 'Both' }]} />
          </FormField>
        )}
        <Checkbox label="Half days allowed" checked={r.halfDays} onChange={(v) => set('halfDays', v)} />
        {r.sandwich === 'sandwich' && <Checkbox label="A half day next to a weekend still counts the weekend" checked={r.sandwichHalfDays} onChange={(v) => set('sandwichHalfDays', v)} />}
        <div className="yx-tim-row">
          {num('minDays', 'Least days at a time', 'Leave empty for no minimum.')}
          {num('maxDays', 'Most days at a time', 'Leave empty for no maximum.')}
        </div>
        <div className="yx-tim-row">
          <FormField id="lt-notice" label="Notice (days)" helper="0 for none.">
            <NumberField value={r.noticeDays} onChange={(v) => set('noticeDays', v ?? 0)} min={0} max={90} />
          </FormField>
          <FormField id="lt-negative" label="May go below zero by (days)" helper="0 for never. Future credits repay it first.">
            <NumberField value={r.negativeLimit} onChange={(v) => set('negativeLimit', v ?? 0)} decimals min={0} max={30} />
          </FormField>
        </div>
        <div className="yx-tim-row">
          {num('certificateAfterDays', 'Certificate needed above (days)', 'Leave empty if never needed.')}
          {num('hrApprovalAboveDays', 'HR approves after the manager above (days)', '0: always. Empty: never.')}
        </div>
        <Checkbox label="Medical: the reason and certificate are private to HR" description="Managers and approvers see only the dates and the certificate’s status." checked={r.medical} onChange={(v) => set('medical', v)} />
        <Checkbox label="Can be cashed in (payroll pays it later)" checked={r.encashable} onChange={(v) => set('encashable', v)} />
        {row && <Checkbox label="In use" description="A type not in use cannot be applied for; its history stays." checked={active} onChange={setActive} />}
      </div>
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------ policies

function Policies({ data, onCreatePolicy, onAddVersion, onAssign, onRemoveAssignment }: { data: TimeSetup } & Pick<TimeSetupScreenProps, 'onCreatePolicy' | 'onAddVersion' | 'onAssign' | 'onRemoveAssignment'>) {
  const [name, setName] = useState('');
  const [versionOf, setVersionOf] = useState<TimeSetup['policies'][number] | null>(null);
  const [assigning, setAssigning] = useState<TimeSetup['policies'][number] | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const { busy, error, run } = useRun();
  const typeName = (id: string) => data.types.find((t) => t.id === id)?.name ?? 'Unknown type';
  return (
    <div className="yx-tim-stack">
      {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
      <Statutory data={data} />
      {data.policies.map((pol) => {
        const current = pol.versions.find((v) => v.validFrom <= data.today) ?? pol.versions[pol.versions.length - 1];
        return (
          <Card
            key={pol.id}
            title={pol.name}
            actions={
              <div className="yx-tim-row">
                <Button size="sm" onClick={() => setVersionOf(pol)}>
                  Change from a date
                </Button>
                <Button size="sm" onClick={() => setAssigning(pol)}>
                  Apply to
                </Button>
              </div>
            }
          >
            <div className="yx-tim-stack">
              {current ? (
                <table className="yx-tim-table" aria-label={`${pol.name} entitlements`}>
                  <thead>
                    <tr>
                      <th>Leave</th>
                      <th>Days a year</th>
                      <th>Credited</th>
                      <th>Carry forward</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.lines.map((l) => (
                      <tr key={l.leaveTypeId}>
                        <td>{typeName(l.leaveTypeId)}</td>
                        <td className="yx-tim-num">{l.annualDays}</td>
                        <td>{l.frequency === 'monthly' ? 'Monthly' : 'Once a year'}{l.proRata ? ', share for joiners' : ''}</td>
                        <td>{l.carryForwardMax === null ? 'All' : l.carryForwardMax === 0 ? 'None (lapses)' : `Up to ${l.carryForwardMax}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="yx-tim-muted">No entitlements yet. Use “Change from a date” to add them.</p>
              )}
              {current && <p className="yx-tim-note">In force from {dateText(current.validFrom)}{pol.versions.some((v) => v.validFrom > data.today) ? ' · a later change is waiting' : ''}.</p>}
              <div className="yx-tim-row">
                {pol.assignments.map((a) => (
                  <span key={a.id} className="yx-tim-row">
                    <Badge tone="info">
                      {a.scopeName} from {dateText(a.validFrom)}
                    </Badge>
                    {a.removable && (
                      <Button size="sm" loading={busy === a.id} onClick={() => void run(a.id, () => onRemoveAssignment(a.id))}>
                        Remove
                      </Button>
                    )}
                  </span>
                ))}
                {!pol.assignments.length && <span className="yx-tim-muted">Not applied to anyone yet.</span>}
              </div>
            </div>
          </Card>
        );
      })}
      <Card title="Add a policy">
        <div className="yx-tim-row">
          <FormField id="pol-name" label="Name" required error={showErrors && !name.trim() ? 'Name the policy.' : undefined}>
            <TextField value={name} onChange={setName} maxLength={100} />
          </FormField>
          <Button
            loading={busy === 'policy'}
            onClick={() => {
              setShowErrors(true);
              if (!name.trim()) return;
              void run('policy', async () => {
                await onCreatePolicy(name.trim());
                setName('');
                setShowErrors(false);
              });
            }}
          >
            Add policy
          </Button>
        </div>
      </Card>
      {versionOf && <VersionDrawer data={data} policy={versionOf} onClose={() => setVersionOf(null)} onSave={onAddVersion} />}
      {assigning && <AssignDrawer data={data} policy={assigning} onClose={() => setAssigning(null)} onSave={onAssign} />}
    </div>
  );
}

function Statutory({ data }: { data: TimeSetup }) {
  if (!data.statutory.length) return null;
  return (
    <InlineAlert tone="info" title="Minimums set by law">
      {data.statutory.map((s) => (
        <span key={s.jurisdiction}>
          {STATE_TEXT[s.jurisdiction] ?? s.jurisdiction}: {(s.values.floors ?? []).map((f) => `${f.kinds.map(kindText).join(' and ')} ${f.days} days a year`).join(', ')}
          {s.values.carry?.earned ? `; earned leave carries forward up to at least ${s.values.carry.earned} days` : ''}. {s.verify ? 'Being confirmed with our compliance partner.' : ''}{' '}
        </span>
      ))}
      A policy below the minimum is raised to it when credits are made.
    </InlineAlert>
  );
}

function VersionDrawer({ data, policy, onClose, onSave }: { data: TimeSetup; policy: TimeSetup['policies'][number]; onClose: () => void; onSave: TimeSetupScreenProps['onAddVersion'] }) {
  const last = policy.versions[0];
  const types = data.types.filter((t) => t.active && t.kind !== 'lop' && t.kind !== 'maternity' && t.kind !== 'paternity' && t.kind !== 'comp_off');
  const [validFrom, setValidFrom] = useState(data.today);
  const [lines, setLines] = useState<PolicyLine[]>(types.map((t) => last?.lines.find((l) => l.leaveTypeId === t.id) ?? { leaveTypeId: t.id, annualDays: 0, frequency: 'monthly', proRata: true, rounding: 0.5, carryForwardMax: 0 }));
  const { busy, error, run } = useRun();
  const set = (i: number, patch: Partial<PolicyLine>) => setLines((x) => x.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Change ${policy.name}`}
      subtitle="A new version from a date; the one in force today stays as it was."
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'save'}
            onClick={() =>
              void run('save', async () => {
                await onSave(policy.id, { validFrom, lines: lines.filter((l) => l.annualDays > 0) });
                onClose();
              })
            }
          >
            Save
          </Button>
        </>
      }
    >
      <div className="yx-tim-form">
        {error && <InlineAlert tone="danger" title="Not saved">{error}</InlineAlert>}
        <FormField id="pv-from" label="From" required>
          <TextField type="date" value={validFrom} onChange={setValidFrom} />
        </FormField>
        {lines.map((l, i) => (
          <fieldset key={l.leaveTypeId} className="yx-tim-effect">
            <legend className="yx-tim-h3">{types[i]?.name}</legend>
            <div className="yx-tim-row">
              <FormField id={`pv-days-${i}`} label="Days a year" helper="0 leaves it out.">
                <NumberField value={l.annualDays} onChange={(v) => set(i, { annualDays: v ?? 0 })} decimals min={0} max={366} />
              </FormField>
              <FormField id={`pv-cf-${i}`} label="Carry forward up to" optional helper="Empty: all of it.">
                <NumberField value={l.carryForwardMax} onChange={(v) => set(i, { carryForwardMax: v })} decimals min={0} max={366} />
              </FormField>
            </div>
            <Segment label={`${types[i]?.name} credited`} value={l.frequency} onChange={(v) => set(i, { frequency: v })} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Once a year' }]} />
            <Checkbox label="Joiners get a share for the part of the year they work" checked={l.proRata} onChange={(v) => set(i, { proRata: v })} />
          </fieldset>
        ))}
      </div>
    </Drawer>
  );
}

function AssignDrawer({ data, policy, onClose, onSave }: { data: TimeSetup; policy: TimeSetup['policies'][number]; onClose: () => void; onSave: TimeSetupScreenProps['onAssign'] }) {
  const [scopeType, setScopeType] = useState<'tenant' | 'legal_entity' | 'location'>('legal_entity');
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [validFrom, setValidFrom] = useState(data.today);
  const [showErrors, setShowErrors] = useState(false);
  const { busy, error, run } = useRun();
  const options = scopeType === 'legal_entity' ? data.entities.map((e) => ({ value: e.id, label: e.name })) : data.locations.map((l) => ({ value: l.id, label: l.name }));
  const missing = scopeType !== 'tenant' && !scopeId;
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Apply ${policy.name}`}
      subtitle="The most specific rule wins: a location over its legal entity, an entity over the whole company."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'save'}
            onClick={() => {
              setShowErrors(true);
              if (missing) return;
              void run('save', async () => {
                await onSave(policy.id, { scopeType, ...(scopeType === 'tenant' ? {} : { scopeId: scopeId! }), validFrom });
                onClose();
              });
            }}
          >
            Apply
          </Button>
        </>
      }
    >
      <div className="yx-tim-form">
        {error && <InlineAlert tone="danger" title="Not saved">{error}</InlineAlert>}
        <Segment
          label="Apply to"
          value={scopeType}
          onChange={(v) => {
            setScopeType(v);
            setScopeId(null);
          }}
          options={[{ value: 'tenant', label: 'Whole company' }, { value: 'legal_entity', label: 'A legal entity' }, { value: 'location', label: 'A location' }]}
        />
        {scopeType !== 'tenant' && (
          <FormField id="as-scope" label={scopeType === 'legal_entity' ? 'Legal entity' : 'Location'} required error={showErrors && missing ? 'Choose one.' : undefined}>
            <Select value={scopeId} onChange={setScopeId} options={options} />
          </FormField>
        )}
        <FormField id="as-from" label="From" required>
          <TextField type="date" value={validFrom} onChange={setValidFrom} />
        </FormField>
      </div>
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------ holidays

function Holidays({ data, onCreateCalendar, onAddHoliday, onRemoveHoliday }: { data: TimeSetup } & Pick<TimeSetupScreenProps, 'onCreateCalendar' | 'onAddHoliday' | 'onRemoveHoliday'>) {
  const [calId, setCalId] = useState<string | null>(data.calendars[0]?.id ?? null);
  const [on, setOn] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<string | null>('festival');
  const [halfDay, setHalfDay] = useState(false);
  const [newFor, setNewFor] = useState<string | null>(null);
  const { busy, error, run } = useRun();
  const cal = data.calendars.find((c) => c.id === calId);
  const withoutCalendar = data.locations.filter((l) => !data.calendars.some((c) => c.locationId === l.id));
  const errs = [...(!on ? [{ fieldId: 'hd-on', message: 'Choose the date.' }] : []), ...(!name.trim() ? [{ fieldId: 'hd-name', message: 'Name the holiday.' }] : [])];
  const saveErrors = useSaveErrors(errs);
  return (
    <div className="yx-tim-stack">
      {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
      <div className="yx-tim-row">
        <FormField id="hc-cal" label="Calendar">
          <Select value={calId} onChange={setCalId} options={data.calendars.map((c) => ({ value: c.id, label: c.name }))} placeholder="No calendars yet" />
        </FormField>
        {withoutCalendar.length > 0 && (
          <>
            <FormField id="hc-new" label="New calendar for">
              <Select value={newFor} onChange={setNewFor} options={withoutCalendar.map((l) => ({ value: l.id, label: l.name }))} />
            </FormField>
            <Button disabled={!newFor} loading={busy === 'cal'} onClick={() => void run('cal', () => onCreateCalendar({ name: `${data.locations.find((l) => l.id === newFor)?.name ?? ''} holidays`, locationId: newFor!, optionalLimit: 2 }))}>
              Add calendar
            </Button>
          </>
        )}
      </div>
      {cal && (
        <>
          <p className="yx-tim-muted">
            {cal.optionalLimit} optional holidays to choose a year. On a half-day holiday the {cal.halfDayOpenHalf === 'first' ? 'morning' : 'afternoon'} is worked.
          </p>
          <table className="yx-tim-table" aria-label={`${cal.name}`}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Holiday</th>
                <th>Kind</th>
                <th>
                  <span className="yx-visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {cal.holidays.map((h) => (
                <tr key={h.id}>
                  <td>{dateText(h.on)}</td>
                  <td>
                    {h.name}
                    {h.halfDay ? ' (half day)' : ''}
                  </td>
                  <td>{h.kind[0].toUpperCase() + h.kind.slice(1)}</td>
                  <td>
                    {h.on >= data.today && (
                      <Button size="sm" loading={busy === h.id} onClick={() => void run(h.id, () => onRemoveHoliday(h.id))}>
                        Remove
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Card title="Add a holiday">
            <div className="yx-tim-form">
              <ErrorSummary errors={saveErrors.shownErrors} />
              <div className="yx-tim-row">
                <FormField id="hd-on" label="Date" required>
                  <TextField type="date" value={on} onChange={setOn} />
                </FormField>
                <FormField id="hd-name" label="Name" required>
                  <TextField value={name} onChange={setName} maxLength={100} />
                </FormField>
                <FormField id="hd-kind" label="Kind">
                  <Select value={kind} onChange={setKind} options={[{ value: 'national', label: 'National' }, { value: 'state', label: 'State' }, { value: 'festival', label: 'Festival' }, { value: 'optional', label: 'Optional (choose N)' }, { value: 'restricted', label: 'Restricted (choose N)' }]} />
                </FormField>
              </div>
              {kind !== 'optional' && kind !== 'restricted' && <Checkbox label="Half day" checked={halfDay} onChange={setHalfDay} />}
              <div>
                <Button
                  loading={busy === 'holiday'}
                  onClick={() => {
                    if (errs.length) return saveErrors.reveal();
                    void run('holiday', async () => {
                      await onAddHoliday(cal.id, { on, name: name.trim(), kind: kind ?? 'festival', halfDay: kind === 'optional' || kind === 'restricted' ? false : halfDay });
                      setOn('');
                      setName('');
                      saveErrors.reset();
                    });
                  }}
                >
                  Add holiday
                </Button>
              </div>
            </div>
          </Card>
        </>
      )}
      {!data.calendars.length && <EmptyState compact title="No holiday calendars yet" description="Add one for each location." />}
    </div>
  );
}

// ------------------------------------------------------------------------------------------ attendance basics

function Attendance({ data, onSetRule }: { data: TimeSetup; onSetRule: TimeSetupScreenProps['onSetRule'] }) {
  const [editing, setEditing] = useState<TimeSetup['locations'][number] | null>(null);
  return (
    <div className="yx-tim-stack">
      <table className="yx-tim-table" aria-label="Locations">
        <thead>
          <tr>
            <th>Location</th>
            <th>Shift</th>
            <th>Weekly offs</th>
            <th>Check-in</th>
            <th>
              <span className="yx-visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.locations.map((l) => (
            <tr key={l.id}>
              <td>
                {l.name} <span className="yx-tim-note">{STATE_TEXT[l.state] ?? l.state}</span>
              </td>
              <td>
                {l.rule.shiftName} {clock(l.rule.shiftStart)} to {clock(l.rule.shiftEnd)} · {l.rule.graceMinutes} min grace
                {l.rule.starter ? <span className="yx-tim-note"> (starter)</span> : null}
                {l.upcoming.length ? <span className="yx-tim-note"> · changes on {dateText(l.upcoming[0].validFrom!)}</span> : null}
              </td>
              <td>{offsText(l.rule.weeklyOffs)}</td>
              <td>
                {l.rule.checkIn === 'field' ? 'Field: location recorded' : 'Inside the site or on its network'}
                <span className="yx-tim-note"> · {l.geofence ? `${l.geofence.radiusM} m geofence` : 'no geofence'}, {l.ipRanges.length ? `${l.ipRanges.length} network${l.ipRanges.length === 1 ? '' : 's'}` : 'no networks'}</span>
              </td>
              <td>
                <Button size="sm" onClick={() => setEditing(l)}>
                  Change from a date
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="yx-tim-note">The geofence and office networks are set on the location in Settings › Locations.</p>
      {editing && <RuleDrawer today={data.today} location={editing} onClose={() => setEditing(null)} onSave={onSetRule} />}
    </div>
  );
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const minute = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);

function RuleDrawer({ today, location, onClose, onSave }: { today: string; location: TimeSetup['locations'][number]; onClose: () => void; onSave: TimeSetupScreenProps['onSetRule'] }) {
  const r: LocationRule = location.rule;
  const [validFrom, setValidFrom] = useState(today);
  const [shiftName, setShiftName] = useState(r.shiftName);
  const [start, setStart] = useState<string | null>(hhmm(r.shiftStart));
  const [end, setEnd] = useState<string | null>(hhmm(r.shiftEnd));
  const [grace, setGrace] = useState<number | null>(r.graceMinutes);
  const [offs, setOffs] = useState(r.weeklyOffs);
  const [checkIn, setCheckIn] = useState(r.checkIn);
  const { busy, error, run } = useRun();
  const toggle = (weekday: number, on: boolean) => setOffs((x) => (on ? [...x.filter((o) => o.weekday !== weekday), { weekday }] : x.filter((o) => o.weekday !== weekday)));
  const sat = offs.find((o) => o.weekday === 6);
  const errors = [...(!start || !end ? [{ fieldId: 'rl-start', message: 'Give the shift start and end.' }] : []), ...(start && end && start === end ? [{ fieldId: 'rl-start', message: 'The shift ends at a different time from when it starts.' }] : []), ...(validFrom < today ? [{ fieldId: 'rl-from', message: 'Changes start today or later.' }] : [])];
  const saveErrors = useSaveErrors(errors);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${location.name}: shift and weekly offs`}
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
                await onSave(location.id, { validFrom, shiftName: shiftName.trim() || 'General', shiftStart: minute(start)!, shiftEnd: minute(end)!, graceMinutes: grace ?? 0, weeklyOffs: offs, checkIn });
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
        <FormField id="rl-from" label="From" required>
          <TextField type="date" value={validFrom} min={today} onChange={setValidFrom} />
        </FormField>
        <div className="yx-tim-row">
          <FormField id="rl-name" label="Shift name">
            <TextField value={shiftName} onChange={setShiftName} maxLength={60} />
          </FormField>
          <FormField id="rl-start" label="Starts" required>
            <TimeField value={start} onChange={setStart} />
          </FormField>
          <FormField id="rl-end" label="Ends" required helper="Before the start for a night shift.">
            <TimeField value={end} onChange={setEnd} />
          </FormField>
          <FormField id="rl-grace" label="Grace (minutes)">
            <NumberField value={grace} onChange={setGrace} min={0} max={120} />
          </FormField>
        </div>
        <fieldset className="yx-tim-stack" data-gap="sm">
          <legend className="yx-tim-h3">Weekly offs</legend>
          {WEEKDAYS.map((w, i) => (
            <Checkbox key={w} label={w} checked={offs.some((o) => o.weekday === i + 1)} onChange={(c) => toggle(i + 1, c)} />
          ))}
          {sat && (
            <Segment
              label="Which Saturdays"
              value={sat.nth?.join(',') === '2,4' ? 'alt' : 'all'}
              onChange={(v) => setOffs((x) => x.map((o) => (o.weekday === 6 ? (v === 'alt' ? { weekday: 6, nth: [2, 4] } : { weekday: 6 }) : o)))}
              options={[{ value: 'all', label: 'Every Saturday' }, { value: 'alt', label: '2nd and 4th Saturday' }]}
            />
          )}
        </fieldset>
        <FormField id="rl-checkin" label="Checking in">
          <Segment label="Checking in" value={checkIn} onChange={setCheckIn} options={[{ value: 'restricted', label: 'Inside the site or its network' }, { value: 'field', label: 'Anywhere, location recorded' }]} />
        </FormField>
      </div>
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------ year end

function YearEnd({ today, onPreview, onRun }: { today: string; onPreview: TimeSetupScreenProps['onYearEndPreview']; onRun: TimeSetupScreenProps['onYearEndRun'] }) {
  const [yearEnd, setYearEnd] = useState(`${Number(today.slice(0, 4)) - 1}-12-31`);
  const [preview, setPreview] = useState<YearEndPreview | null>(null);
  const [queued, setQueued] = useState(false);
  const { busy, error, run } = useRun();
  return (
    <div className="yx-tim-stack">
      <p className="yx-tim-muted">Year end carries balances forward up to each policy’s limit (never below the legal minimum) and lapses the rest. Preview it first; nothing is posted until you confirm.</p>
      {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
      <div className="yx-tim-row">
        <FormField id="ye-date" label="Last day of the leave year">
          <TextField type="date" value={yearEnd} onChange={(v) => (setYearEnd(v), setPreview(null), setQueued(false))} />
        </FormField>
        <Button loading={busy === 'preview'} onClick={() => void run('preview', async () => setPreview(await onPreview(yearEnd)))}>
          Preview
        </Button>
      </div>
      {preview && (
        <>
          {preview.rows.length ? (
            <table className="yx-tim-table" aria-label="Year end preview">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Leave</th>
                  <th>Balance</th>
                  <th>Carried forward</th>
                  <th>Lapses</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={`${r.employeeId}${r.type}`}>
                    <td>{r.name}</td>
                    <td>
                      {r.type}
                      {r.encashable && r.lapse > 0 ? <span className="yx-tim-note"> · can be cashed in</span> : null}
                    </td>
                    <td className="yx-tim-num">{r.balance}</td>
                    <td className="yx-tim-num">{r.carry}</td>
                    <td className="yx-tim-num">{r.lapse}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState compact title="Nothing to process" description="No one’s leave year ends on that date." />
          )}
          {preview.lapses > 0 && !queued && (
            <ConfirmDialog
              trigger={<Button variant="primary">Post year end</Button>}
              title={`Post year end for ${dateText(preview.yearEnd)}?`}
              consequence={`${preview.lapses} lapses are added to the ledger. They are not removed later; a correction is a new adjustment.`}
              confirmLabel="Post year end"
              onConfirm={async () => {
                await onRun(preview.yearEnd);
                setQueued(true);
              }}
            />
          )}
          {queued && <InlineAlert tone="success" title="Year end is being posted">It runs in the background and is recorded in the audit log. Balances update in a few moments.</InlineAlert>}
        </>
      )}
    </div>
  );
}
