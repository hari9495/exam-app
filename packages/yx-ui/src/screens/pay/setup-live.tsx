// PAY-16 · Payroll set-up wizard, live: the designed PayrollSetupScreen (comp-setup.tsx) with the API's data. One wizard
// per legal entity; /yx/payroll/setup, /pay-groups, /imports and /go-live each open their own step of it. The parts
// below (registrations, legal options, pay groups, imports, go-live) are the design's parts: the sample stories render
// them with sample data, the live page with real data. The API checks every call (keys, entity scope, step-up).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert, Skeleton } from '../../components/feedback';
import { FormField, useTooEarly } from '../../components/field';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { Checkbox } from '../../components/choice';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { FileUpload } from '../../components/upload';
import { useToast } from '../../components/notify';
import { PlainTable } from '../../components/plain-table';
import { Stepper } from '../../components/stepper';
import { formatINR } from '../../lib/format';
import { useRun } from '../org/org-kit';
import { LivePage, dateText } from '../time/live/kit';
import { SectionTitle } from './pay-kit';
import { EntityPicker, parseCsv } from './live/setup';
import { monthText } from './live/periods';
import type { LoadState } from './live/types';
import type { EmployeeHit, GoLiveCheck, ImportBatch, ImportKind, LegalOption, LegalOptionKey, PayCalendarMonth, PayGroup, PayGroupMember, Registration, RegistrationStatus, Registrations, SetupEntity, SetupState } from './live/types-5b';
import type { PayRun } from './live/types-5j';

/* ------------------------------------------------------------------ types */

export interface ReadinessItem {
  key: string;
  label: string;
  ok: boolean;
  info?: boolean;
  detail: string;
}
export interface GoLiveReadiness {
  entityId: string;
  people: number;
  ready: boolean;
  items: ReadinessItem[];
}
export interface ParallelRunView {
  id: string;
  runId: string;
  status: 'compared' | 'signed_off' | 'waived' | 'superseded';
  people: number;
  matched: number;
  differences: number;
  rows: { employeeCode: string; name: string | null; field: string; ours: string | null; theirs: string | null; difference: string | null }[];
  reason: string | null;
  createdBy: string;
  createdAt: string;
}

/** The wizard's steps; each set-up route opens one. */
export type SetupStep = 'reg' | 'group' | 'template' | 'opening' | 'golive';
export type GroupInput = Pick<PayGroup, 'legalEntityId' | 'name' | 'dayBasis' | 'cutOffDay' | 'payDay'> & { version?: number; frequency?: 'monthly' | 'weekly' | 'fortnightly'; anchorDate?: string };
/** What the other set-up pages are called by the checklist (the web maps them to routes). */
export type SetupLink = 'components' | 'templates' | 'payslip_layout' | 'runs';

export interface LivePayrollSetup {
  /** The step this route opens. */
  page: SetupStep;
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  today: string;
  onOpen: (to: SetupLink) => void;
  // Registrations and legal options (needs payroll.statutory.setup on the entity).
  setup: SetupState | null;
  registrations: Registrations | null;
  options: LegalOption[] | null;
  onSaveRegistrations: (rows: Registration[]) => Promise<unknown>;
  onSetOption: (optionKey: LegalOptionKey, value: string, validFrom: string) => Promise<unknown>;
  // Pay groups (payroll.setup.manage).
  groups: PayGroup[] | null;
  onSaveGroup: (id: string | null, g: GroupInput) => Promise<unknown>;
  onMembers: (id: string) => Promise<PayGroupMember[]>;
  onAddMembers: (id: string, employeeIds: string[], from: string) => Promise<unknown>;
  onSearch: (q: string) => Promise<EmployeeHit[]>;
  onCalendar: (id: string, year: string) => Promise<PayCalendarMonth[]>;
  // Opening balances (payroll.import.run).
  onStage: (legalEntityId: string, kind: ImportKind, rows: Record<string, string>[]) => Promise<ImportBatch>;
  onCommit: (id: string) => Promise<unknown>;
  onGoLiveCheck: (legalEntityId: string, goLiveMonth: string) => Promise<GoLiveCheck>;
  // Go-live: readiness and the parallel run.
  readiness: GoLiveReadiness | null;
  runs: PayRun[];
  parallel: ParallelRunView[] | null;
  me: string | null;
  can: { upload: boolean; decide: boolean };
  onUpload: (runId: string, file: File) => Promise<unknown>;
  onDecide: (id: string, decision: 'signed_off' | 'waived', reason?: string) => Promise<unknown>;
}

/* ------------------------------------------------------------------ helpers */

export const rupeesText = (s: string) => formatINR(Number(s));
const runLabel = (r: PayRun) => `Payroll · ${monthText(r.month)}`;
const noop = async () => undefined;
/** A file's text (FileReader works in every browser and in tests). */
const readText = (f: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error('We could not read the file. Save it again as CSV and upload it.'));
    r.readAsText(f);
  });

const STATUTE: Record<Registration['statute'], string> = {
  'IN.PF': 'Provident fund',
  'IN.ESI': 'ESI',
  'IN.PT': 'Professional tax',
  'IN.LWF': 'Labour welfare fund',
  'IN.TDS': 'Income tax (TDS)',
};
const REG_STATUS: { value: RegistrationStatus; label: string }[] = [
  { value: 'on', label: 'Registered' },
  { value: 'applied_awaited', label: 'Applied for' },
  { value: 'off', label: 'Not registered' },
];
const STEP_TEXT: Record<SetupState['steps'][number]['key'], string> = {
  registrations: 'Statutory registrations',
  pay_groups: 'Pay groups',
  components: 'Component library',
  templates: 'Salary templates',
  payslip_layout: 'Payslip layout',
};

/** The step's body when the person may not change it for this entity. */
function NotYours({ what }: { what: string }) {
  return <InlineAlert tone="info" title={`You can't change ${what} for this legal entity`}>Ask your payroll admin; they keep it.</InlineAlert>;
}

/* ================================================================== registrations */

export function RegistrationsPart({ data, onSave }: { data: Registrations | null; onSave: (rows: Registration[]) => Promise<unknown> }) {
  const { toast } = useToast();
  const { busy, error, run, clearError } = useRun();
  const [edit, setEdit] = useState<{ i: number; r: Registration } | null>(null);
  const isNew = !!edit && !edit.r.id;
  const needsState = !!edit && isNew && (edit.r.statute === 'IN.PT' || edit.r.statute === 'IN.LWF');
  const early = useTooEarly([
    ...(needsState && !edit!.r.state ? [{ fieldId: 'reg-state', message: 'Enter the state code, like IN-KA.' }] : []),
    ...(edit && edit.r.status === 'on' && !edit.r.registrationNo?.trim() ? [{ fieldId: 'reg-no', message: 'Enter the registration number.' }] : []),
  ]);
  if (!data) return <Skeleton height={160} />;
  const rows = data.registrations;
  const missingOf = (r: Registration) => data.completeness.missing.filter((m) => m.startsWith(r.statute) && (!r.state || !m.includes('IN-') || m.includes(r.state)));
  const set = (patch: Partial<Registration>) => edit && setEdit({ ...edit, r: { ...edit.r, ...patch } });
  const blank: Registration = { statute: 'IN.PT', state: null, status: 'off', registrationNo: null, startOn: null, appliedOn: null, responsiblePerson: null, responsibleDesignation: null };
  return (
    <div className="yx-pay-stack">
      <p className="yx-pay-muted">Each statute runs a completeness check before payroll can use it. Saving asks you to confirm it is you again; registration numbers never go into the audit log.</p>
      {data.completeness.complete ? (
        <InlineAlert tone="info">All {rows.length} statutes pass the completeness check.</InlineAlert>
      ) : (
        <InlineAlert tone="warning" title="Missing before the first payroll">
          <ul>
            {data.completeness.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </InlineAlert>
      )}
      <PlainTable
        label="Statutory registrations"
        rows={rows}
        getRowId={(r) => r.id ?? `new-${rows.indexOf(r)}`}
        rowTone={(r) => (missingOf(r).length ? { tone: 'danger', label: 'Incomplete' } : undefined)}
        columns={[
          {
            key: 'statute',
            header: 'Statute',
            rowHeader: true,
            cell: (r) => (
              <>
                {STATUTE[r.statute] ?? r.statute}
                {r.state && <div className="yx-pay-note">{r.state}</div>}
              </>
            ),
          },
          { key: 'reg', header: 'Registration', cell: (r) => <span className="yx-pay-mono">{r.registrationNo || '—'}</span> },
          { key: 'status', header: 'Status', cell: (r) => REG_STATUS.find((s) => s.value === r.status)?.label },
          { key: 'from', header: 'From', cell: (r) => (r.startOn ? dateText(r.startOn) : r.appliedOn ? `Applied ${dateText(r.appliedOn)}` : '—') },
          { key: 'who', header: 'Responsible person', cell: (r) => (r.responsiblePerson ? `${r.responsiblePerson}${r.responsibleDesignation ? `, ${r.responsibleDesignation}` : ''}` : '—') },
          {
            key: 'check',
            header: 'Check',
            cell: (r) => {
              const miss = missingOf(r);
              const i = rows.indexOf(r);
              return (
                <span className="yx-pay-row">
                  {miss.length ? <span className="yx-pay-note">{miss.join('; ')}</span> : <Badge tone="success">Complete</Badge>}
                  <Button size="sm" aria-label={`${miss.length ? 'Fix' : 'Edit'} ${STATUTE[r.statute]}${r.state ? ` ${r.state}` : ''}`} onClick={() => (clearError(), early.reset(), setEdit({ i, r }))}>
                    {miss.length ? 'Fix' : 'Edit'}
                  </Button>
                </span>
              );
            },
          },
        ]}
      />
      <div className="yx-pay-row">
        <Button icon={Plus} onClick={() => (clearError(), early.reset(), setEdit({ i: rows.length, r: blank }))}>
          Add a registration
        </Button>
      </div>
      <Drawer
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        title={isNew ? 'Add a registration' : edit ? STATUTE[edit.r.statute] : ''}
        subtitle="Needed before payroll can file this statute."
        notice={error ? <InlineAlert tone="danger" title="Not saved">{error}</InlineAlert> : undefined}
        footer={
          <>
            <Button onClick={() => setEdit(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy === 'regs'}
              onClick={() =>
                edit &&
                !early.stop() &&
                void run('regs', async () => {
                  const next = edit.i < rows.length ? rows.map((r, j) => (j === edit.i ? edit.r : r)) : [...rows, edit.r];
                  await onSave(next);
                  setEdit(null);
                  toast({ tone: 'success', title: 'Registrations saved.' });
                })
              }
            >
              Save
            </Button>
          </>
        }
      >
        {edit && (
          <div className="yx-pay-stack">
            {isNew && (
              <FormField id="reg-statute" label="Statute" required>
                <Select value={edit.r.statute} onChange={(v) => v && set({ statute: v as Registration['statute'] })} options={Object.entries(STATUTE).map(([value, label]) => ({ value, label }))} />
              </FormField>
            )}
            {needsState && (
              <FormField id="reg-state" label="State code" required helper="Professional tax and LWF are per state." error={early.errorOf('reg-state')}>
                <TextField placeholder="IN-KA" value={edit.r.state ?? ''} onChange={(v) => set({ state: v.trim().toUpperCase() || null })} />
              </FormField>
            )}
            <FormField id="reg-status" label="Status" required>
              <Segment label="Status" value={edit.r.status} onChange={(v) => set({ status: v })} options={REG_STATUS} />
            </FormField>
            <FormField id="reg-no" label="Registration number" required={edit.r.status === 'on'} error={early.errorOf('reg-no')}>
              <TextField value={edit.r.registrationNo ?? ''} onChange={(v) => set({ registrationNo: v || null })} />
            </FormField>
            <FormField id="reg-from" label="Registered from">
              <TextField type="date" value={edit.r.startOn ?? ''} onChange={(v) => set({ startOn: v || null })} />
            </FormField>
            <FormField id="reg-applied" label="Applied on">
              <TextField type="date" value={edit.r.appliedOn ?? ''} onChange={(v) => set({ appliedOn: v || null })} />
            </FormField>
            <FormField id="reg-person" label="Responsible person" helper="The person who signs this statute's returns.">
              <TextField value={edit.r.responsiblePerson ?? ''} onChange={(v) => set({ responsiblePerson: v || null })} />
            </FormField>
            <FormField id="reg-desig" label="Designation">
              <TextField value={edit.r.responsibleDesignation ?? ''} onChange={(v) => set({ responsibleDesignation: v || null })} />
            </FormField>
          </div>
        )}
      </Drawer>
    </div>
  );
}

/* ================================================================== legal options */

const OPTION_CHOICES: Record<LegalOptionKey, { label: string; choices: { value: string; label: string }[] | null; help: string }> = {
  'pf.on_actual_wage': { label: 'PF on actual wage', choices: [{ value: 'no', label: 'On the ceiling' }, { value: 'yes', label: 'On actual wage' }], help: 'Whether the employer pays PF on the wage above the ceiling.' },
  'bonus.rate': { label: 'Statutory bonus rate', choices: null, help: 'A decimal between the Act’s minimum and maximum, for example 0.0833.' },
  'bonus.payment': { label: 'Bonus paid', choices: [{ value: 'annual', label: 'Once a year' }, { value: 'monthly', label: 'Monthly' }], help: 'When the statutory bonus is paid.' },
  'gratuity.provisioning': { label: 'Gratuity provision', choices: [{ value: 'formula', label: 'By formula' }, { value: 'actuarial', label: 'Actuarial' }], help: 'How the monthly gratuity provision is worked out.' },
};

export function LegalOptionsPart({ options, onSet }: { options: LegalOption[] | null; onSet: (k: LegalOptionKey, v: string, from: string) => Promise<unknown> }) {
  const { toast } = useToast();
  const { busy, error, run } = useRun();
  const [key, setKey] = useState<LegalOptionKey>('pf.on_actual_wage');
  const [value, setValue] = useState('');
  const [from, setFrom] = useState('');
  const spec = OPTION_CHOICES[key];
  const early = useTooEarly([...(!value ? [{ fieldId: 'lo-value', message: 'Choose the value.' }] : []), ...(!from ? [{ fieldId: 'lo-from', message: 'Choose the date it applies from.' }] : [])]);
  return (
    <div className="yx-pay-stack">
      <SectionTitle>Legal options</SectionTitle>
      <p className="yx-pay-muted">Only what the law leaves to the employer. Each value is dated; history is kept.</p>
      {!options ? (
        <Skeleton height={80} />
      ) : options.length ? (
        <PlainTable
          label="Legal options"
          rows={options}
          getRowId={(o) => o.id}
          columns={[
            { key: 'option', header: 'Option', rowHeader: true, cell: (o) => OPTION_CHOICES[o.optionKey].label },
            { key: 'value', header: 'Value', cell: (o) => OPTION_CHOICES[o.optionKey].choices?.find((c) => c.value === o.value)?.label ?? o.value },
            { key: 'from', header: 'From', date: true, cell: (o) => dateText(o.validFrom) },
            { key: 'until', header: 'Until', date: true, cell: (o) => (o.validTo ? dateText(o.validTo) : 'Now') },
          ]}
        />
      ) : (
        <p className="yx-pay-note">No option set yet; the law's default applies.</p>
      )}
      {error && <InlineAlert tone="danger" title="Not saved">{error}</InlineAlert>}
      <div className="yx-pay-row">
        <FormField id="lo-key" label="Option">
          <Select value={key} onChange={(v) => v && (setKey(v as LegalOptionKey), setValue(''))} options={Object.entries(OPTION_CHOICES).map(([value, o]) => ({ value, label: o.label }))} />
        </FormField>
        <FormField id="lo-value" label="Value" helper={spec.help} error={early.errorOf('lo-value')}>
          {spec.choices ? <Segment label={spec.label} value={value || null} onChange={setValue} options={spec.choices} /> : <TextField value={value} onChange={setValue} placeholder="0.0833" />}
        </FormField>
        <FormField id="lo-from" label="From" error={early.errorOf('lo-from')}>
          <TextField type="date" value={from} onChange={setFrom} />
        </FormField>
        <Button variant="primary" loading={busy === 'opt'} onClick={() => !early.stop() && void run('opt', async () => (await onSet(key, value, from), early.reset(), setValue(''), setFrom(''), toast({ tone: 'success', title: `${spec.label} saved.` })))}>
          Save option
        </Button>
      </div>
    </div>
  );
}

/* ================================================================== pay groups */

const BASIS = [
  { value: 'calendar' as const, label: 'Calendar days' },
  { value: '30' as const, label: '30 days' },
  { value: '26' as const, label: '26 days' },
];
const FREQ = [
  { value: 'monthly' as const, label: 'Monthly' },
  { value: 'fortnightly' as const, label: 'Fortnightly' },
  { value: 'weekly' as const, label: 'Weekly' },
];
const PAY_DAYS = [{ value: '0', label: 'Last day of the month' }, ...Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `Day ${i + 1} of the next month` }))];
const payDayText = (n: number) => PAY_DAYS[n]?.label ?? `Day ${n}`;
type GroupEdit = Partial<PayGroup> & { frequency?: string };

export function GroupsPart(p: {
  entityId: string;
  groups: PayGroup[] | null;
  today: string;
  onSave: LivePayrollSetup['onSaveGroup'];
  onMembers: LivePayrollSetup['onMembers'];
  onAddMembers: LivePayrollSetup['onAddMembers'];
  onSearch: LivePayrollSetup['onSearch'];
  onCalendar: LivePayrollSetup['onCalendar'];
  /** Stories: open this group's members and calendar. */
  openId?: string;
  /** Stories: open the editor for a new group. */
  adding?: boolean;
}) {
  const { toast } = useToast();
  const { busy, error, run, clearError } = useRun();
  const [edit, setEdit] = useState<GroupEdit | null>(p.adding ? { name: '', dayBasis: 'calendar', cutOffDay: 25, payDay: 0, frequency: 'monthly' } : null);
  const [open, setOpen] = useState<PayGroup | null>(null);
  const [members, setMembers] = useState<PayGroupMember[] | null>(null);
  const [calendar, setCalendar] = useState<PayCalendarMonth[] | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<EmployeeHit[]>([]);
  const [pick, setPick] = useState<string[]>([]);
  const [from, setFrom] = useState(p.today);
  const shownFor = useRef<string | null>(null);
  const groupEarly = useTooEarly([
    ...(edit && !edit.name?.trim() ? [{ fieldId: 'pg-name', message: 'Name the group.' }] : []),
    ...(edit && (!edit.cutOffDay || edit.cutOffDay < 1 || edit.cutOffDay > 28) ? [{ fieldId: 'pg-cutoff', message: 'Choose a cut-off day from 1 to 28.' }] : []),
    ...(edit && !edit.id && edit.frequency !== 'monthly' && !/^\d{4}-\d{2}-\d{2}$/.test(edit.anchorDate ?? '') ? [{ fieldId: 'pg-anchor', message: 'Choose the first day of a pay period.' }] : []),
  ]);
  const addEarly = useTooEarly([...(!pick.length ? [{ fieldId: 'pg-search', message: 'Find and tick the people to add.' }] : []), ...(!from ? [{ fieldId: 'pg-from', message: 'Choose the date they join the group.' }] : [])]);
  const show = (g: PayGroup) => {
    setOpen(g);
    setPick([]);
    setHits([]);
    clearError();
    void run('load', async () => {
      setMembers(await p.onMembers(g.id));
      setCalendar(await p.onCalendar(g.id, p.today.slice(0, 4)));
    });
  };
  const mine = p.groups?.filter((g) => g.legalEntityId === p.entityId) ?? null;
  const toOpen = p.openId ? mine?.find((x) => x.id === p.openId) : undefined;
  useEffect(() => {
    if (toOpen && shownFor.current !== toOpen.id) (shownFor.current = toOpen.id), show(toOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toOpen]);
  return (
    <div className="yx-pay-stack">
      <p className="yx-pay-muted">People paid together on one calendar: the cut-off for inputs and the pay day. Everyone belongs to one group at a time; moves are dated.</p>
      {!mine ? (
        <Skeleton height={120} />
      ) : mine.length ? (
        <PlainTable
          label="Pay groups"
          rows={mine}
          getRowId={(g) => g.id}
          columns={[
            { key: 'name', header: 'Pay group', rowHeader: true, cell: (g) => g.name },
            { key: 'freq', header: 'Frequency', cell: (g) => FREQ.find((f) => f.value === g.frequency)?.label ?? g.frequency },
            { key: 'basis', header: 'Day basis', cell: (g) => BASIS.find((b) => b.value === g.dayBasis)?.label },
            { key: 'cut', header: 'Cut-off', cell: (g) => `Day ${g.cutOffDay}` },
            { key: 'pay', header: 'Pay day', cell: (g) => payDayText(g.payDay) },
            {
              key: 'act',
              header: <span className="yx-visually-hidden">Actions</span>,
              cell: (g) => (
                <span className="yx-pay-row">
                  <Button size="sm" onClick={() => show(g)}>
                    Members and calendar
                  </Button>
                  <Button size="sm" onClick={() => (clearError(), groupEarly.reset(), setEdit(g))}>
                    Edit
                  </Button>
                </span>
              ),
            },
          ]}
        />
      ) : (
        <EmptyState compact title="No pay group yet" description="Add one per pay calendar: monthly staff, a weekly plant group and so on." />
      )}
      <div className="yx-pay-row">
        <Button icon={Plus} onClick={() => (clearError(), groupEarly.reset(), setEdit({ name: '', dayBasis: 'calendar', cutOffDay: 25, payDay: 0, frequency: 'monthly' }))}>
          Add pay group
        </Button>
      </div>
      <Drawer
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        title={edit?.id ? `Edit ${edit.name}` : 'Add pay group'}
        notice={error && edit ? <InlineAlert tone="danger" title="Not saved">{error}</InlineAlert> : undefined}
        footer={
          <>
            <Button onClick={() => setEdit(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy === 'save'}
              onClick={() =>
                edit &&
                !groupEarly.stop() &&
                void run('save', async () => {
                  await p.onSave(edit.id ?? null, {
                    legalEntityId: edit.legalEntityId ?? p.entityId,
                    name: edit.name!.trim(),
                    dayBasis: edit.dayBasis ?? 'calendar',
                    cutOffDay: Number(edit.cutOffDay),
                    payDay: Number(edit.payDay ?? 0),
                    version: edit.version,
                    ...(!edit.id && edit.frequency && edit.frequency !== 'monthly' ? { frequency: edit.frequency as 'weekly' | 'fortnightly', anchorDate: edit.anchorDate ?? undefined } : {}),
                  });
                  toast({ tone: 'success', title: `${edit.name!.trim()} saved.` });
                  setEdit(null);
                })
              }
            >
              Save
            </Button>
          </>
        }
      >
        {edit && (
          <div className="yx-pay-stack">
            <FormField id="pg-name" label="Pay group name" required error={groupEarly.errorOf('pg-name')}>
              <TextField value={edit.name ?? ''} onChange={(v) => setEdit({ ...edit, name: v })} />
            </FormField>
            {!edit.id && (
              <FormField id="pg-frequency" label="Frequency" required>
                <Segment label="Frequency" value={(edit.frequency ?? 'monthly') as 'monthly'} onChange={(v) => setEdit({ ...edit, frequency: v })} options={FREQ} />
              </FormField>
            )}
            {!edit.id && edit.frequency !== 'monthly' && (
              <FormField id="pg-anchor" label="First day of a pay period" required helper="Periods run from this day and are cut at month ends." error={groupEarly.errorOf('pg-anchor')}>
                <TextField type="date" value={edit.anchorDate ?? ''} onChange={(v) => setEdit({ ...edit, anchorDate: v })} />
              </FormField>
            )}
            <FormField id="pg-cutoff" label="Attendance cut-off day" required helper="1 to 28. Inputs after it are paid next month." error={groupEarly.errorOf('pg-cutoff')}>
              <NumberField value={edit.cutOffDay ?? null} onChange={(v) => setEdit({ ...edit, cutOffDay: v ?? undefined })} min={1} max={28} />
            </FormField>
            <FormField id="pg-payday" label="Pay day" required>
              <Select value={String(edit.payDay ?? 0)} onChange={(v) => v && setEdit({ ...edit, payDay: Number(v) })} options={PAY_DAYS} />
            </FormField>
            <FormField id="pg-basis" label="Day basis for proration" required>
              <Segment label="Day basis for proration" value={edit.dayBasis ?? 'calendar'} onChange={(v) => setEdit({ ...edit, dayBasis: v })} options={BASIS} />
            </FormField>
          </div>
        )}
      </Drawer>
      <Drawer open={!!open} onOpenChange={(o) => !o && (setOpen(null), setMembers(null), setCalendar(null))} title={open?.name ?? ''} subtitle="Members today and this year's pay calendar" size="lg" notice={error && open ? <InlineAlert tone="danger" title="That didn’t work">{error}</InlineAlert> : undefined}>
        {open && (
          <div className="yx-pay-stack">
            <SectionTitle>Members today</SectionTitle>
            {!members ? (
              <Skeleton height={60} />
            ) : members.length ? (
              <PlainTable
                label="Members"
                rows={members}
                getRowId={(m) => m.employmentId}
                columns={[
                  { key: 'person', header: 'Person', rowHeader: true, cell: (m) => m.name },
                  { key: 'code', header: 'Code', cell: (m) => <span className="yx-pay-mono">{m.employeeCode}</span> },
                  { key: 'from', header: 'In this group from', date: true, cell: (m) => dateText(m.validFrom) },
                ]}
              />
            ) : (
              <EmptyState compact title="No one in this group yet" />
            )}
            <div className="yx-pay-row">
              <FormField id="pg-search" label="Find people" error={addEarly.errorOf('pg-search')}>
                <TextField value={q} onChange={setQ} placeholder="Name or code" />
              </FormField>
              <Button onClick={() => void run('search', async () => setHits(await p.onSearch(q)))} loading={busy === 'search'}>
                Search
              </Button>
            </div>
            {hits.map((h) => (
              <Checkbox key={h.id} label={`${h.name}${h.employeeCode ? ` (${h.employeeCode})` : ''}`} checked={pick.includes(h.id)} onChange={(c) => setPick((xs) => (c ? [...xs, h.id] : xs.filter((x) => x !== h.id)))} />
            ))}
            <div className="yx-pay-row">
              <FormField id="pg-from" label="From" error={addEarly.errorOf('pg-from')}>
                <TextField type="date" value={from} onChange={setFrom} />
              </FormField>
              <Button
                variant="primary"
                loading={busy === 'add'}
                onClick={() =>
                  !addEarly.stop() &&
                  void run('add', async () => {
                    await p.onAddMembers(open.id, pick, from);
                    toast({ tone: 'success', title: `${pick.length} added to ${open.name} from ${dateText(from)}.` });
                    setPick([]);
                    setMembers(await p.onMembers(open.id));
                  })
                }
              >
                Add {pick.length || ''} to this group
              </Button>
            </div>
            <SectionTitle>Pay calendar {p.today.slice(0, 4)}</SectionTitle>
            {!calendar ? (
              <Skeleton height={60} />
            ) : (
              <PlainTable
                label="Pay calendar"
                rows={calendar}
                getRowId={(m) => m.month}
                columns={[
                  { key: 'month', header: 'Month', rowHeader: true, cell: (m) => monthText(m.month) },
                  { key: 'cut', header: 'Inputs close', date: true, cell: (m) => dateText(m.cutOff) },
                  { key: 'pay', header: 'Paid on', date: true, cell: (m) => dateText(m.payDate) },
                ]}
              />
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

/* ================================================================== opening balances (imports) */

export const IMPORT_KINDS: { value: ImportKind; label: string; header: string }[] = [
  { value: 'as_paid_lines', label: 'As-paid lines', header: 'employeeCode,month,componentCode,amount' },
  { value: 'opening_balances', label: 'Opening balances', header: 'employeeCode,fy,head,amount' },
  { value: 'form12b', label: 'Previous employer (Form 12B)', header: 'employeeCode,fy,employerTan,gross,exemptions,tds' },
];

export function ImportsPart(p: { entityId: string; today: string; onStage: LivePayrollSetup['onStage']; onCommit: LivePayrollSetup['onCommit']; onGoLiveCheck: LivePayrollSetup['onGoLiveCheck']; /** Stories: rows already checked. */ batch?: ImportBatch; check?: GoLiveCheck }) {
  const { toast } = useToast();
  const { busy, error, run } = useRun();
  const [kind, setKind] = useState<ImportKind>(p.batch?.kind ?? 'as_paid_lines');
  const [batch, setBatch] = useState<ImportBatch | null>(p.batch ?? null);
  const [commitWhy, setCommitWhy] = useState(false);
  const [month, setMonth] = useState(p.check?.goLiveMonth ?? p.today.slice(0, 7));
  const [check, setCheck] = useState<GoLiveCheck | null>(p.check ?? null);
  const [uploadKey, setUploadKey] = useState(0);
  const spec = IMPORT_KINDS.find((k) => k.value === kind)!;
  const liveEarly = useTooEarly(!month ? [{ fieldId: 'imp-month', message: 'Choose the first month paid in YukthiX.' }] : []);
  return (
    <div className="yx-pay-stack">
      <p className="yx-pay-muted">Bring in what the old payroll paid, month by month, for people paid before go-live. They become the base for YTD tax and for arrears across go-live. Rows are checked first; nothing lands until you commit, and imported months are locked.</p>
      <FormField id="imp-kind" label="What you are importing">
        <Segment label="Import kind" value={kind} onChange={(v) => (setKind(v), setBatch(null), setCommitWhy(false), setUploadKey((k) => k + 1))} options={IMPORT_KINDS} />
      </FormField>
      <FormField id="imp-file" label="CSV file" helper={`Columns, with this header line first: ${spec.header}`}>
        <FileUpload
          key={uploadKey}
          accept={['.csv']}
          multiple={false}
          upload={async (file) => {
            const rows = parseCsv(await readText(file));
            if (!rows.length) throw new Error(`The file has no rows under the header line. Start it with: ${spec.header}`);
            setCommitWhy(false);
            setBatch(await p.onStage(p.entityId, kind, rows));
          }}
        />
      </FormField>
      {error && <InlineAlert tone="danger" title="That didn’t work">{error}</InlineAlert>}
      {batch && (
        <div className="yx-pay-stack" aria-label="Checked rows" role="region">
          <SectionTitle>
            {batch.valid} of {batch.rows} rows ready
          </SectionTitle>
          {batch.errors.length > 0 && (
            <InlineAlert tone="warning" title="Fix these rows and upload the file again">
              <ul>
                {batch.errors.map((e) => (
                  <li key={e.row}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </InlineAlert>
          )}
          {commitWhy && (
            <p className="yx-field__error" role="alert">
              Fix the rows above and upload again; nothing is imported while a row has a problem.
            </p>
          )}
          {batch.status === 'committed' ? (
            <Badge tone="success">Imported</Badge>
          ) : (
            <div className="yx-pay-row">
              <Button
                variant="primary"
                loading={busy === 'commit'}
                onClick={() =>
                  batch.errors.length > 0
                    ? setCommitWhy(true)
                    : void run('commit', async () => {
                        await p.onCommit(batch.id);
                        setBatch({ ...batch, status: 'committed' });
                        toast({ tone: 'success', title: `${batch.valid} ${batch.valid === 1 ? 'row' : 'rows'} imported.` });
                      })
                }
              >
                Commit {batch.valid} {batch.valid === 1 ? 'row' : 'rows'}
              </Button>
            </div>
          )}
        </div>
      )}
      <SectionTitle>Go-live check</SectionTitle>
      <div className="yx-pay-row">
        <FormField id="imp-month" label="First month paid in YukthiX" error={liveEarly.errorOf('imp-month')}>
          <TextField type="month" value={month} onChange={setMonth} />
        </FormField>
        <Button loading={busy === 'golive'} onClick={() => !liveEarly.stop() && void run('golive', async () => setCheck(await p.onGoLiveCheck(p.entityId, month)))}>
          Check
        </Button>
      </div>
      {check &&
        (check.ready ? (
          <InlineAlert tone="info" title={`Every month from ${monthText(check.fyStart.slice(0, 7))} has its as-paid lines.`} />
        ) : (
          <InlineAlert tone="warning" title={`${check.missing.length}${check.missing.length === 500 ? '+' : ''} person-months have no as-paid lines yet`}>
            Arrears that reach back to these months will ask you to confirm their as-paid base.
            <ul>
              {check.missing.slice(0, 20).map((m) => (
                <li key={`${m.employeeCode}-${m.month}`}>
                  {m.employeeCode} · {monthText(m.month)}
                </li>
              ))}
            </ul>
          </InlineAlert>
        ))}
    </div>
  );
}

/* ================================================================== go-live (founder decision 3: a step of PAY-16) */

const FIELD: Record<string, string> = { gross: 'Gross', deductions: 'Deductions', net: 'Net pay', missing_in_yukthix: 'Not in YukthiX', missing_in_register: 'Not in the old register' };
const REASON_MIN = 5;

export function GoLivePart(p: {
  entityId: string;
  readiness: GoLiveReadiness | null;
  runs: PayRun[];
  parallel: ParallelRunView[] | null;
  me: string | null;
  can: { upload: boolean; decide: boolean };
  onUpload: LivePayrollSetup['onUpload'];
  onDecide: LivePayrollSetup['onDecide'];
  /** Stories: the sign-off or waive dialog open on the first comparison. */
  deciding?: 'signed_off' | 'waived';
}) {
  const { toast } = useToast();
  const { busy, error, run, clearError } = useRun();
  const [runId, setRunId] = useState<string | null>(null);
  const firstOpen = p.parallel?.find((x) => x.status === 'compared');
  const [deciding, setDeciding] = useState<{ id: string; decision: 'signed_off' | 'waived' } | null>(p.deciding && firstOpen ? { id: firstOpen.id, decision: p.deciding } : null);
  const [reason, setReason] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const eligible = p.runs.filter((r) => r.legalEntityId === p.entityId && r.runType === 'regular' && ['calculated', 'in_review', 'submitted', 'approved', 'paid'].includes(r.status));
  const runEarly = useTooEarly(!runId ? [{ fieldId: 'pr-run', message: 'Choose the run to compare.' }] : []);
  const reasonEarly = useTooEarly(reason.trim().length < REASON_MIN ? [{ fieldId: 'pr-reason', message: `Write at least ${REASON_MIN} characters.` }] : []);
  const decide = (id: string, decision: 'signed_off' | 'waived', why?: string) =>
    run(`d-${id}`, async () => {
      await p.onDecide(id, decision, why);
      setDeciding(null);
      toast({ tone: 'success', title: decision === 'waived' ? 'Parallel run waived.' : 'Parallel run signed off.' });
    });
  return (
    <div className="yx-pay-stack">
      <p className="yx-pay-muted">What this legal entity still needs before its first live month, and the parallel run against the old payroll.</p>
      {!p.readiness ? (
        <Skeleton height={140} />
      ) : (
        <>
          {p.readiness.ready ? <InlineAlert tone="info" title="Ready for the first live month" /> : <InlineAlert tone="warning" title="Not ready yet">Each item below marked To do must be done first.</InlineAlert>}
          <PlainTable
            label="Readiness checks"
            rows={p.readiness.items}
            getRowId={(i) => i.key}
            rowTone={(i) => (!i.ok && !i.info ? { tone: 'danger', label: 'To do' } : undefined)}
            columns={[
              { key: 'check', header: 'Check', rowHeader: true, cell: (i) => i.label },
              { key: 'detail', header: 'Where it stands', cell: (i) => i.detail },
              { key: 'status', header: 'Status', cell: (i) => <Badge tone={i.info ? 'info' : i.ok ? 'success' : 'warning'}>{i.info ? 'Note' : i.ok ? 'Done' : 'To do'}</Badge> },
            ]}
          />
        </>
      )}
      <SectionTitle>Parallel run</SectionTitle>
      <p className="yx-pay-note">Pay a month in the old payroll as usual, calculate the same month here, then upload the old register as CSV with the columns employee_code, gross, deductions and net. Amounts more than a rupee apart are listed.</p>
      {error && !deciding && <InlineAlert tone="danger" title="This didn't go through">{error}</InlineAlert>}
      {p.can.upload &&
        (eligible.length ? (
          <div className="yx-pay-row">
            <FormField id="pr-run" label="Run to compare" error={runEarly.errorOf('pr-run')}>
              <Select value={runId} onChange={setRunId} options={eligible.map((r) => ({ value: r.id, label: runLabel(r) }))} placeholder="Choose a calculated run" />
            </FormField>
            <Button variant="primary" loading={busy === 'upload'} onClick={() => !runEarly.stop() && input.current?.click()}>
              Upload old register
            </Button>
            <input
              ref={input}
              type="file"
              accept=".csv,text/csv"
              hidden
              aria-label="Old register file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && runId) void run('upload', async () => (await p.onUpload(runId, file), toast({ tone: 'success', title: 'Old register uploaded and compared.' })));
                e.target.value = '';
              }}
            />
          </div>
        ) : (
          <InlineAlert tone="info" title="Calculate a monthly run first">The parallel run compares a calculated YukthiX run with the old payroll's register for the same month.</InlineAlert>
        ))}
      {!p.parallel ? (
        <Skeleton height={80} />
      ) : !p.parallel.filter((x) => x.status !== 'superseded').length ? (
        <EmptyState compact title="No comparison yet" description="Upload the old register on a calculated run to compare it person by person." />
      ) : (
        p.parallel
          .filter((x) => x.status !== 'superseded')
          .map((x) => {
            const r = p.runs.find((y) => y.id === x.runId);
            return (
              <section key={x.id} aria-label={`Comparison of ${r ? monthText(r.month) : 'a run'}`} className="yx-pay-stack">
                <div className="yx-pay-row">
                  <strong>{r ? runLabel(r) : 'Run'}</strong>
                  <span className="yx-pay-note">
                    Uploaded {dateText(x.createdAt.slice(0, 10))} · {x.matched} of {x.people} match
                  </span>
                  <Badge tone={x.status === 'signed_off' ? 'success' : x.status === 'waived' ? 'neutral' : x.differences ? 'warning' : 'info'}>{x.status === 'signed_off' ? 'Signed off' : x.status === 'waived' ? 'Waived' : x.differences ? `${x.differences} differences` : 'No differences'}</Badge>
                </div>
                {x.rows.length > 0 && (
                  <PlainTable
                    label="Differences"
                    rows={x.rows}
                    getRowId={(d) => String(x.rows.indexOf(d))}
                    columns={[
                      {
                        key: 'who',
                        header: 'Person',
                        rowHeader: true,
                        cell: (d) => (
                          <>
                            {d.name ?? ''} <span className="yx-pay-mono">{d.employeeCode}</span>
                          </>
                        ),
                      },
                      { key: 'what', header: 'What', cell: (d) => FIELD[d.field] ?? d.field },
                      { key: 'ours', header: 'YukthiX', num: true, cell: (d) => (d.ours ? rupeesText(d.ours) : '') },
                      { key: 'theirs', header: 'Old payroll', num: true, cell: (d) => (d.theirs ? rupeesText(d.theirs) : '') },
                      { key: 'diff', header: 'Difference', num: true, cell: (d) => (d.difference ? rupeesText(d.difference) : '') },
                    ]}
                  />
                )}
                {x.reason && <p className="yx-pay-note">Reason: {x.reason}</p>}
                {x.status === 'compared' &&
                  p.can.decide &&
                  (x.createdBy === p.me ? (
                    <p className="yx-pay-note">You uploaded this register, so someone else signs it off.</p>
                  ) : (
                    <div className="yx-pay-row">
                      <Button variant="approve" loading={busy === `d-${x.id}`} onClick={() => (x.differences ? (clearError(), reasonEarly.reset(), setReason(''), setDeciding({ id: x.id, decision: 'signed_off' })) : void decide(x.id, 'signed_off'))}>
                        Sign off
                      </Button>
                      <Button onClick={() => (clearError(), reasonEarly.reset(), setReason(''), setDeciding({ id: x.id, decision: 'waived' }))}>Waive</Button>
                    </div>
                  ))}
              </section>
            );
          })
      )}
      <Drawer
        open={!!deciding}
        onOpenChange={(o) => !o && setDeciding(null)}
        title={deciding?.decision === 'waived' ? 'Waive the parallel run?' : 'Sign off with differences?'}
        subtitle={deciding?.decision === 'waived' ? 'The first live month goes ahead without a signed-off comparison.' : 'The differences listed are accepted as they are.'}
        notice={error && deciding ? <InlineAlert tone="danger" title="This didn't go through">{error}</InlineAlert> : undefined}
        footer={
          <>
            <Button onClick={() => setDeciding(null)}>Cancel</Button>
            <Button variant="primary" loading={!!deciding && busy === `d-${deciding.id}`} onClick={() => deciding && !reasonEarly.stop() && void decide(deciding.id, deciding.decision, reason.trim())}>
              {deciding?.decision === 'waived' ? 'Waive' : 'Sign off'}
            </Button>
          </>
        }
      >
        <FormField id="pr-reason" label={deciding?.decision === 'waived' ? 'Why' : 'Why the differences are accepted'} required error={reasonEarly.errorOf('pr-reason')}>
          <TextArea rows={4} value={reason} onChange={setReason} />
        </FormField>
      </Drawer>
    </div>
  );
}

/* ================================================================== the live wizard */

function Needs({ entity, k, what, children }: { entity: SetupEntity; k: SetupEntity['keys'][number]; what: string; children: ReactNode }) {
  return entity.keys.includes(k) ? <>{children}</> : <NotYours what={what} />;
}

export function LivePayrollSetupScreen({ live }: { live: LivePayrollSetup }) {
  const [step, setStep] = useState<string>(live.page);
  const [notReady, setNotReady] = useState(false);
  const entity = live.entities.find((e) => e.id === live.entityId) ?? null;
  const checklist = live.setup?.steps.filter((s) => s.key === 'components' || s.key === 'templates' || s.key === 'payslip_layout') ?? null;
  const regMissing = live.registrations && !live.registrations.completeness.complete ? live.registrations.completeness.missing.length : 0;
  const groupsHere = live.groups?.filter((g) => g.legalEntityId === live.entityId) ?? null;
  const left = live.readiness?.items.filter((i) => !i.ok && !i.info) ?? [];
  return (
    <LivePage title="Set up payroll" description={entity ? `${entity.name}. You can leave and come back; each step saves on its own.` : 'Set-up is per legal entity.'} state={live.state} onRetry={live.onRetry} what="payroll set-up" grantedBy="your payroll admin">
      {live.entities.length > 1 && <EntityPicker entities={live.entities} value={live.entityId} onChange={live.onEntity} />}
      {!entity ? (
        <EmptyState title={live.entities.length ? 'Choose a legal entity' : 'No legal entity to set up'} description={live.entities.length ? 'Set-up is per legal entity.' : 'Ask your payroll admin for set-up rights on a legal entity.'} />
      ) : (
        <>
          {notReady && step === 'review' && (
            <InlineAlert tone="danger" title="Not ready for the first live month" actions={<Button size="sm" onClick={() => (setNotReady(false), setStep('golive'))}>Open Go-live</Button>}>
              Still to do: {left.length ? left.map((i) => i.label).join(', ') : 'the go-live checks have not loaded yet'}.
            </InlineAlert>
          )}
          <Stepper
            title="Payroll set-up"
            current={step}
            onCurrentChange={(s) => (setNotReady(false), setStep(s))}
            review={{ description: 'Check each section, then start the first live run' }}
            finishLabel="Open payroll runs"
            onFinish={() => (live.readiness?.ready ? live.onOpen('runs') : setNotReady(true))}
            steps={[
              {
                id: 'reg',
                title: 'Registrations',
                description: 'Statutes and legal options',
                status: regMissing ? 'error' : undefined,
                statusNote: regMissing ? `${regMissing} ${regMissing === 1 ? 'item' : 'items'} missing` : undefined,
                content: (
                  <Needs entity={entity} k="payroll.statutory.setup" what="statutory registrations">
                    <div className="yx-pay-stack">
                      <RegistrationsPart data={live.registrations} onSave={live.onSaveRegistrations} />
                      <LegalOptionsPart options={live.options} onSet={live.onSetOption} />
                    </div>
                  </Needs>
                ),
                summary: <p>{live.registrations ? (regMissing ? `${regMissing} missing` : `${live.registrations.registrations.length} statutes complete`) : '—'}</p>,
              },
              {
                id: 'group',
                title: 'Pay group and cut-off',
                description: 'Frequency, cut-off, pay day',
                content: (
                  <Needs entity={entity} k="payroll.setup.manage" what="pay groups">
                    <GroupsPart entityId={entity.id} groups={live.groups} today={live.today} onSave={live.onSaveGroup} onMembers={live.onMembers} onAddMembers={live.onAddMembers} onSearch={live.onSearch} onCalendar={live.onCalendar} />
                  </Needs>
                ),
                summary: <p>{groupsHere ? (groupsHere.length ? groupsHere.map((g) => `${g.name} · cut-off day ${g.cutOffDay} · ${payDayText(g.payDay).toLowerCase()}`).join('; ') : 'No pay group yet') : '—'}</p>,
              },
              {
                id: 'template',
                title: 'Salary template',
                description: 'Components, templates, payslip',
                content: !checklist ? (
                  <Needs entity={entity} k="payroll.setup.manage" what="the salary set-up">
                    <Skeleton height={100} />
                  </Needs>
                ) : (
                  <PlainTable
                    label="Set-up steps"
                    hideHeader
                    rows={checklist}
                    getRowId={(s) => s.key}
                    columns={[
                      { key: 'step', header: 'Step', rowHeader: true, cell: (s) => STEP_TEXT[s.key] },
                      {
                        key: 'status',
                        header: 'Status',
                        cell: (s) => (
                          <>
                            <Badge tone={s.done ? 'success' : 'warning'}>{s.done ? 'Done' : 'To do'}</Badge>
                            {s.missing?.length ? <div className="yx-pay-note">{s.missing.join('; ')}</div> : null}
                          </>
                        ),
                      },
                      {
                        key: 'open',
                        header: 'Action',
                        cell: (s) => (
                          <Button size="sm" onClick={() => live.onOpen(s.key as SetupLink)}>
                            Open {STEP_TEXT[s.key].toLowerCase()}
                          </Button>
                        ),
                      },
                    ]}
                  />
                ),
                summary: <p>{checklist ? `${checklist.filter((s) => s.done).length} of ${checklist.length} done` : '—'}</p>,
              },
              {
                id: 'opening',
                title: 'Opening balances',
                description: 'YTD and as-paid lines',
                content: (
                  <Needs entity={entity} k="payroll.import.run" what="imports">
                    <ImportsPart entityId={entity.id} today={live.today} onStage={live.onStage} onCommit={live.onCommit} onGoLiveCheck={live.onGoLiveCheck} />
                  </Needs>
                ),
                summary: <p>Imported months are locked; the go-live check lists what is missing.</p>,
              },
              {
                id: 'golive',
                title: 'Go-live',
                description: 'Readiness and parallel run',
                status: live.readiness && !live.readiness.ready ? 'open' : undefined,
                statusNote: live.readiness && !live.readiness.ready ? `${left.length} to do` : undefined,
                content: <GoLivePart entityId={entity.id} readiness={live.readiness} runs={live.runs} parallel={live.parallel} me={live.me} can={live.can} onUpload={live.onUpload} onDecide={live.onDecide} />,
                summary: <p>{live.readiness ? (live.readiness.ready ? 'Ready for the first live month' : `${left.length} to do: ${left.map((i) => i.label).join(', ')}`) : '—'}</p>,
              },
            ]}
          />
        </>
      )}
    </LivePage>
  );
}

/** No-op callbacks for the design stories. */
export const SAMPLE_CALLS = { onSave: noop, onMembers: async () => [] as PayGroupMember[], onAddMembers: noop, onSearch: async () => [] as EmployeeHit[], onCalendar: async () => [] as PayCalendarMonth[], onCommit: noop, onUpload: noop, onDecide: noop };
