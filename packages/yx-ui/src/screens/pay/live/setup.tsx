import { useEffect, useState } from 'react';
import { Button } from '../../../components/button';
import { Badge, type BadgeTone } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { FormField } from '../../../components/field';
import { TextArea, TextField } from '../../../components/inputs';
import { Checkbox } from '../../../components/choice';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import { monthText } from './periods';
import type { LoadState } from './types';
import type {
  CoverageRow,
  EmployeeHit,
  GoLiveCheck,
  ImportBatch,
  ImportKind,
  LayoutBlock,
  LegalOption,
  LegalOptionKey,
  PayCalendarMonth,
  PayGroup,
  PayGroupMember,
  PayslipLayouts,
  Registration,
  RegistrationStatus,
  Registrations,
  RuleSetView,
  SetupEntity,
  SetupState,
} from './types-5b';

// Payroll set-up, batch 5b (M03 §14.2): the set-up checklist with statutory registrations and legal options (PAY-16,
// CMP-02), pay groups and calendars, the payslip layout (PAY-15), the statutory rules browser (CMP-08), the coverage
// monitor (PAY-30) and imports from the old system. Presentational: the API checks every call (keys, entity scope,
// step-up, the pay guard).

export function EntityPicker({ entities, value, onChange, id = 'pay-entity' }: { entities: SetupEntity[]; value: string | null; onChange: (id: string | null) => void; id?: string }) {
  return (
    <FormField id={id} label="Legal entity">
      <Select value={value} onChange={onChange} placeholder="Choose a legal entity" options={entities.map((e) => ({ value: e.id, label: e.name }))} />
    </FormField>
  );
}

const STATUTE: Record<string, string> = {
  'IN.PF': 'Provident fund',
  'IN.ESI': 'ESI',
  'IN.PT': 'Professional tax',
  'IN.LWF': 'Labour welfare fund',
  'IN.TDS': 'Income tax (TDS)',
};
export const statuteText = (s: string) => STATUTE[s] ?? s;
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

// ------------------------------------------------------------------------------------------ set-up (PAY-16 / CMP-02)

export interface PaySetupScreenProps {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  setup: SetupState | null;
  registrations: Registrations | null;
  options: LegalOption[] | null;
  onSaveRegistrations: (rows: Registration[]) => Promise<unknown>;
  onSetOption: (optionKey: LegalOptionKey, value: string, validFrom: string) => Promise<unknown>;
  onOpen: (step: SetupState['steps'][number]['key']) => void;
}

export function PaySetupScreen(p: PaySetupScreenProps) {
  const { busy, error, run } = useRun();
  const [rows, setRows] = useState<Registration[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => setRows(p.registrations?.registrations ?? []), [p.registrations]);
  const update = (i: number, patch: Partial<Registration>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const canStatutory = !!p.entities.find((e) => e.id === p.entityId)?.keys.includes('payroll.statutory.setup');
  return (
    <LivePage
      title="Payroll set-up"
      description="What each legal entity needs before its first payroll: registrations, pay groups, components, templates and the payslip."
      state={p.state}
      onRetry={p.onRetry}
      what="payroll set-up"
      grantedBy="your payroll admin"
    >
      <EntityPicker entities={p.entities} value={p.entityId} onChange={p.onEntity} />
      {!p.entityId && <EmptyState compact title="Choose a legal entity" description="Set-up is per legal entity." />}
      {p.setup && (
        <Card className="yx-pay-card" title={p.setup.ready ? 'Ready for its first payroll' : 'Still to do'}>
          <ol className="yx-pay-steps" aria-label="Set-up steps">
            {p.setup.steps.map((s) => (
              <li key={s.key}>
                <Badge tone={s.done ? 'success' : 'warning'}>{s.done ? 'Done' : 'To do'}</Badge> <span>{STEP_TEXT[s.key]}</span>{' '}
                {s.key !== 'registrations' && (
                  <Button size="sm" onClick={() => p.onOpen(s.key)}>
                    Open
                  </Button>
                )}
              </li>
            ))}
          </ol>
        </Card>
      )}
      {error && (
        <InlineAlert tone="danger" title="Not saved">
          {error}
        </InlineAlert>
      )}
      {saved && <InlineAlert tone="success" title={saved} />}
      {p.registrations && canStatutory && (
        <Card className="yx-pay-card"
          title="Statutory registrations"
          actions={
            <div className="yx-tim-row">
              <Button
                size="sm"
                onClick={() =>
                  setRows((rs) => [
                    ...rs,
                    {
                      statute: 'IN.PT',
                      state: null,
                      status: 'off',
                      registrationNo: null,
                      startOn: null,
                      appliedOn: null,
                      responsiblePerson: null,
                      responsibleDesignation: null,
                    },
                  ])
                }
              >
                Add a registration
              </Button>
              <Button size="sm" variant="primary" loading={busy === 'regs'} onClick={() => void run('regs', async () => (await p.onSaveRegistrations(rows), setSaved('Registrations saved.')))}>
                Save registrations
              </Button>
            </div>
          }
        >
          {!p.registrations.completeness.complete && (
            <InlineAlert tone="warning" title="Missing before the first payroll">
              <ul>
                {p.registrations.completeness.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </InlineAlert>
          )}
          <p className="yx-tim-note">Saving asks you to confirm it is you again. Registration numbers are never written to the audit log.</p>
          <div className="yx-pay-scroll">
          <table className="yx-tim-table" aria-label="Statutory registrations">
            <thead>
              <tr>
                <th scope="col">Statute</th>
                <th scope="col">State</th>
                <th scope="col">Status</th>
                <th scope="col">Number</th>
                <th scope="col">From</th>
                <th scope="col">Applied on</th>
                <th scope="col">Responsible person</th>
                <th scope="col">Designation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id ?? `new-${i}`}>
                  <td>
                    {r.id ? (
                      statuteText(r.statute)
                    ) : (
                      <Select
                        aria-label="Statute"
                        value={r.statute}
                        onChange={(v) => v && update(i, { statute: v as Registration['statute'] })}
                        options={Object.entries(STATUTE).map(([value, label]) => ({ value, label }))}
                      />
                    )}
                  </td>
                  <td>
                    {r.id ? (r.state ?? '—') : <TextField aria-label="State code" placeholder="IN-KA" value={r.state ?? ''} onChange={(v) => update(i, { state: v.trim().toUpperCase() || null })} />}
                  </td>
                  <td>
                    <Select aria-label="Status" value={r.status} onChange={(v) => v && update(i, { status: v as RegistrationStatus })} options={REG_STATUS} />
                  </td>
                  <td>
                    <TextField aria-label="Registration number" value={r.registrationNo ?? ''} onChange={(v) => update(i, { registrationNo: v || null })} />
                  </td>
                  <td>
                    <TextField aria-label="Start date" type="date" value={r.startOn ?? ''} onChange={(v) => update(i, { startOn: v || null })} />
                  </td>
                  <td>
                    <TextField aria-label="Applied on" type="date" value={r.appliedOn ?? ''} onChange={(v) => update(i, { appliedOn: v || null })} />
                  </td>
                  <td>
                    <TextField aria-label="Responsible person" value={r.responsiblePerson ?? ''} onChange={(v) => update(i, { responsiblePerson: v || null })} />
                  </td>
                  <td>
                    <TextField aria-label="Designation" value={r.responsibleDesignation ?? ''} onChange={(v) => update(i, { responsibleDesignation: v || null })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      )}
      {p.options && canStatutory && (
        <LegalOptionsCard options={p.options} onSet={(k, v, f) => run('opt', async () => (await p.onSetOption(k, v, f), setSaved('Legal option saved.')))} busy={busy === 'opt'} />
      )}
    </LivePage>
  );
}

const OPTION_CHOICES: Record<
  LegalOptionKey,
  {
    label: string;
    choices: { value: string; label: string }[] | null;
    help: string;
  }
> = {
  'pf.on_actual_wage': {
    label: 'PF on actual wage',
    choices: [
      { value: 'no', label: 'On the ceiling' },
      { value: 'yes', label: 'On actual wage' },
    ],
    help: 'Whether the employer pays PF on the wage above the ceiling.',
  },
  'bonus.rate': {
    label: 'Statutory bonus rate',
    choices: null,
    help: 'A decimal between the Act’s minimum and maximum, for example 0.0833.',
  },
  'bonus.payment': {
    label: 'Bonus paid',
    choices: [
      { value: 'annual', label: 'Once a year' },
      { value: 'monthly', label: 'Monthly' },
    ],
    help: 'When the statutory bonus is paid.',
  },
  'gratuity.provisioning': {
    label: 'Gratuity provision',
    choices: [
      { value: 'formula', label: 'By formula' },
      { value: 'actuarial', label: 'Actuarial' },
    ],
    help: 'How the monthly gratuity provision is worked out.',
  },
};

function LegalOptionsCard({ options, onSet, busy }: { options: LegalOption[]; onSet: (k: LegalOptionKey, v: string, from: string) => void; busy: boolean }) {
  const [key, setKey] = useState<LegalOptionKey>('pf.on_actual_wage');
  const [value, setValue] = useState('');
  const [from, setFrom] = useState('');
  const spec = OPTION_CHOICES[key];
  return (
    <Card className="yx-pay-card" title="Legal options">
      <p className="yx-tim-note">Only what the law leaves to the employer. Each value is dated; history is kept.</p>
      <table className="yx-tim-table" aria-label="Legal options">
        <thead>
          <tr>
            <th scope="col">Option</th>
            <th scope="col">Value</th>
            <th scope="col">From</th>
            <th scope="col">Until</th>
          </tr>
        </thead>
        <tbody>
          {options.map((o) => (
            <tr key={o.id}>
              <th scope="row">{OPTION_CHOICES[o.optionKey].label}</th>
              <td>{OPTION_CHOICES[o.optionKey].choices?.find((c) => c.value === o.value)?.label ?? o.value}</td>
              <td>{dateText(o.validFrom)}</td>
              <td>{o.validTo ? dateText(o.validTo) : 'Now'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="yx-tim-row">
        <FormField id="lo-key" label="Option">
          <Select
            value={key}
            onChange={(v) => v && (setKey(v as LegalOptionKey), setValue(''))}
            options={Object.entries(OPTION_CHOICES).map(([value, o]) => ({
              value,
              label: o.label,
            }))}
          />
        </FormField>
        <FormField id="lo-value" label="Value" helper={spec.help}>
          {spec.choices ? <Segment label={spec.label} value={value || null} onChange={setValue} options={spec.choices} /> : <TextField value={value} onChange={setValue} placeholder="0.0833" />}
        </FormField>
        <FormField id="lo-from" label="From">
          <TextField type="date" value={from} onChange={setFrom} />
        </FormField>
        <Button variant="primary" disabled={!value || !from} loading={busy} onClick={() => onSet(key, value, from)}>
          Save option
        </Button>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------------------------------ pay groups (PAY-2.05)

export interface PayGroupsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  groups: PayGroup[] | null;
  today: string;
  onSave: (id: string | null, g: Pick<PayGroup, 'legalEntityId' | 'name' | 'dayBasis' | 'cutOffDay' | 'payDay'> & { version?: number }) => Promise<unknown>;
  onMembers: (id: string) => Promise<PayGroupMember[]>;
  onAddMembers: (id: string, employeeIds: string[], from: string) => Promise<unknown>;
  onSearch: (q: string) => Promise<EmployeeHit[]>;
  onCalendar: (id: string, year: string) => Promise<PayCalendarMonth[]>;
}

const BASIS = [
  { value: 'calendar' as const, label: 'Calendar days' },
  { value: '30' as const, label: '30 days' },
  { value: '26' as const, label: '26 days' },
];

export function PayGroupsScreen(p: PayGroupsScreenProps) {
  const { busy, error, run } = useRun();
  const [edit, setEdit] = useState<(Omit<Partial<PayGroup>, 'legalEntityId'> & { legalEntityId: string | null }) | null>(null);
  const [open, setOpen] = useState<PayGroup | null>(null);
  const [members, setMembers] = useState<PayGroupMember[] | null>(null);
  const [calendar, setCalendar] = useState<PayCalendarMonth[] | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<EmployeeHit[]>([]);
  const [pick, setPick] = useState<string[]>([]);
  const [from, setFrom] = useState(p.today);
  const entityName = (id: string) => p.entities.find((e) => e.id === id)?.name ?? '';
  const show = (g: PayGroup) => {
    setOpen(g);
    setPick([]);
    void run('load', async () => {
      setMembers(await p.onMembers(g.id));
      setCalendar(await p.onCalendar(g.id, p.today.slice(0, 4)));
    });
  };
  return (
    <LivePage
      title="Pay groups"
      description="People paid together on one calendar: the cut-off for inputs and the pay date. Everyone belongs to one group at a time; moves are dated."
      state={p.state}
      onRetry={p.onRetry}
      what="pay groups"
      grantedBy="your payroll admin"
      actions={
        <Button
          variant="primary"
          onClick={() =>
            setEdit({
              legalEntityId: p.entities[0]?.id ?? null,
              name: '',
              dayBasis: 'calendar',
              cutOffDay: 25,
              payDay: 0,
            })
          }
        >
          Add pay group
        </Button>
      }
    >
      {error && (
        <InlineAlert tone="danger" title="That didn’t work">
          {error}
        </InlineAlert>
      )}
      <Card className="yx-pay-card" title="Groups">
        {p.groups?.length ? (
          <table className="yx-tim-table" aria-label="Pay groups">
            <thead>
              <tr>
                <th scope="col">Group</th>
                <th scope="col">Legal entity</th>
                <th scope="col">Day basis</th>
                <th scope="col">Cut-off</th>
                <th scope="col">Pay day</th>
                <th scope="col">
                  <span className="yx-visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {p.groups.map((g) => (
                <tr key={g.id}>
                  <th scope="row">{g.name}</th>
                  <td>{entityName(g.legalEntityId)}</td>
                  <td>{BASIS.find((b) => b.value === g.dayBasis)?.label}</td>
                  <td>Day {g.cutOffDay}</td>
                  <td>{g.payDay === 0 ? 'Last day of the month' : `Day ${g.payDay} of the next month`}</td>
                  <td className="yx-tim-row">
                    <Button size="sm" onClick={() => show(g)}>
                      Members and calendar
                    </Button>
                    <Button size="sm" onClick={() => setEdit(g)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState compact title="No pay groups yet" description="Add one per legal entity and pay calendar." />
        )}
      </Card>
      <Drawer
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        title={edit?.id ? `Edit ${edit.name}` : 'Add pay group'}
        footer={
          <Button
            variant="primary"
            loading={busy === 'save'}
            disabled={!edit?.legalEntityId || !edit?.name?.trim()}
            onClick={() =>
              edit &&
              void run('save', async () => {
                await p.onSave(edit.id ?? null, {
                  legalEntityId: edit.legalEntityId!,
                  name: edit.name!.trim(),
                  dayBasis: edit.dayBasis ?? 'calendar',
                  cutOffDay: Number(edit.cutOffDay),
                  payDay: Number(edit.payDay),
                  version: edit.version,
                });
                setEdit(null);
              })
            }
          >
            Save
          </Button>
        }
      >
        {edit && (
          <div className="yx-tim-stack">
            {!edit.id && <EntityPicker id="pg-entity" entities={p.entities} value={edit.legalEntityId} onChange={(v) => setEdit({ ...edit, legalEntityId: v })} />}
            <FormField id="pg-name" label="Name" required>
              <TextField value={edit.name ?? ''} onChange={(v) => setEdit({ ...edit, name: v })} />
            </FormField>
            <FormField id="pg-basis" label="Days in a month for proration">
              <Segment label="Day basis" value={edit.dayBasis ?? 'calendar'} onChange={(v) => setEdit({ ...edit, dayBasis: v })} options={BASIS} />
            </FormField>
            <FormField id="pg-cutoff" label="Input cut-off day" helper="1 to 28. Inputs after it are paid next month.">
              <TextField type="number" min={1} max={28} value={String(edit.cutOffDay ?? '')} onChange={(v) => setEdit({ ...edit, cutOffDay: Number(v) })} />
            </FormField>
            <FormField id="pg-payday" label="Pay day" helper="0 = the last day of the month; 1 to 28 = that day of the next month.">
              <TextField type="number" min={0} max={28} value={String(edit.payDay ?? '')} onChange={(v) => setEdit({ ...edit, payDay: Number(v) })} />
            </FormField>
          </div>
        )}
      </Drawer>
      <Drawer open={!!open} onOpenChange={(o) => !o && (setOpen(null), setMembers(null), setCalendar(null))} title={open?.name ?? ''} size="lg">
        {open && (
          <div className="yx-tim-stack">
            <Card className="yx-pay-card" title="Members today">
              {members?.length ? (
                <ul aria-label="Members">
                  {members.map((m) => (
                    <li key={m.employmentId}>
                      {m.name}{' '}
                      <span className="yx-tim-note">
                        {m.employeeCode} · from {dateText(m.validFrom)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState compact title="No one in this group yet" />
              )}
              <div className="yx-tim-row">
                <FormField id="pg-search" label="Find people">
                  <TextField value={q} onChange={setQ} placeholder="Name" />
                </FormField>
                <Button size="sm" onClick={() => void run('search', async () => setHits(await p.onSearch(q)))} loading={busy === 'search'}>
                  Search
                </Button>
              </div>
              {hits.map((h) => (
                <Checkbox
                  key={h.id}
                  label={`${h.name}${h.employeeCode ? ` (${h.employeeCode})` : ''}`}
                  checked={pick.includes(h.id)}
                  onChange={(c) => setPick((xs) => (c ? [...xs, h.id] : xs.filter((x) => x !== h.id)))}
                />
              ))}
              <div className="yx-tim-row">
                <FormField id="pg-from" label="From">
                  <TextField type="date" value={from} onChange={setFrom} />
                </FormField>
                <Button
                  variant="primary"
                  disabled={!pick.length || !from}
                  loading={busy === 'add'}
                  onClick={() =>
                    void run('add', async () => {
                      await p.onAddMembers(open.id, pick, from);
                      setPick([]);
                      setMembers(await p.onMembers(open.id));
                    })
                  }
                >
                  Add {pick.length || ''} to this group
                </Button>
              </div>
            </Card>
            <Card className="yx-pay-card" title={`Pay calendar ${p.today.slice(0, 4)}`}>
              <table className="yx-tim-table" aria-label="Pay calendar">
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    <th scope="col">Inputs close</th>
                    <th scope="col">Paid on</th>
                  </tr>
                </thead>
                <tbody>
                  {(calendar ?? []).map((m) => (
                    <tr key={m.month}>
                      <th scope="row">{monthText(m.month)}</th>
                      <td>{dateText(m.cutOff)}</td>
                      <td>{dateText(m.payDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        )}
      </Drawer>
    </LivePage>
  );
}

// ------------------------------------------------------------------------------------------ payslip layout (PAY-15)

const BLOCK_TEXT: Record<string, string> = {
  employerName: 'Employer',
  employeeName: 'Name',
  employeeCode: 'Employee code',
  designation: 'Designation',
  period: 'Wage period',
  paidDays: 'Days paid',
  earnings: 'Wages earned',
  deductions: 'Deductions',
  grossPay: 'Gross wages',
  netPay: 'Net wages paid',
  department: 'Department',
  bankAccount: 'Bank account (last 4 digits)',
  pan: 'PAN (masked)',
  uan: 'UAN',
  leaveBalance: 'Leave balance',
  ytd: 'Year to date',
  employerContributions: 'Employer contributions',
};
const OPTIONAL_BLOCKS = ['department', 'bankAccount', 'pan', 'uan', 'leaveBalance', 'ytd', 'employerContributions'];

export interface PayslipLayoutLiveProps {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  data: PayslipLayouts | null;
  onSave: (blocks: LayoutBlock[]) => Promise<unknown>;
  onPreview: () => Promise<unknown>;
  onActivate: () => Promise<unknown>;
}

export function PayslipLayoutLiveScreen(p: PayslipLayoutLiveProps) {
  const { busy, error, run } = useRun();
  const latest = p.data?.layouts[0] ?? null;
  const active = p.data?.layouts.find((l) => l.status === 'active') ?? null;
  const draft = latest?.status === 'draft' ? latest : null;
  const [blocks, setBlocks] = useState<LayoutBlock[]>([]);
  useEffect(() => {
    if (!p.data) return;
    const base = (draft ?? active)?.blocks ?? [];
    const keys = [...p.data.mandatory, ...OPTIONAL_BLOCKS];
    setBlocks(
      keys.map((key) => ({
        key,
        shown: p.data!.mandatory.includes(key) || !!base.find((b) => b.key === key)?.shown,
      })),
    );
  }, [p.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const mandatory = new Set(p.data?.mandatory ?? []);
  return (
    <LivePage
      title="Payslip layout"
      description="What the payslip shows. The wage-slip particulars the law asks for are always shown. A new layout is previewed before it becomes the one in use."
      state={p.state}
      onRetry={p.onRetry}
      what="the payslip layout"
      grantedBy="your payroll admin"
    >
      <EntityPicker entities={p.entities} value={p.entityId} onChange={p.onEntity} />
      {error && (
        <InlineAlert tone="danger" title="That didn’t work">
          {error}
        </InlineAlert>
      )}
      {p.data && (
        <>
          <p className="yx-tim-note">
            {active ? `In use: version ${active.version}${active.activatedAt ? `, since ${dateText(active.activatedAt.slice(0, 10))}` : ''}.` : 'No layout in use yet.'}{' '}
            {draft ? `Draft: version ${draft.version}${draft.previewedAt ? ' (previewed)' : ' (not previewed yet)'}.` : ''} Payslips are in English for now.
          </p>
          <Card className="yx-pay-card"
            title="Blocks"
            actions={
              <div className="yx-tim-row">
                <Button size="sm" loading={busy === 'save'} onClick={() => void run('save', () => p.onSave(blocks))}>
                  Save draft
                </Button>
                <Button size="sm" disabled={!draft} loading={busy === 'preview'} onClick={() => void run('preview', p.onPreview)}>
                  Preview PDF
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!draft?.previewedAt}
                  title={draft && !draft.previewedAt ? 'Preview it first' : undefined}
                  loading={busy === 'activate'}
                  onClick={() => void run('activate', p.onActivate)}
                >
                  Use this layout
                </Button>
              </div>
            }
          >
            <p className="yx-tim-note">Always shown (wage-slip particulars under the Code on Wages)</p>
            <ul aria-label="Always shown" className="yx-pay-fixed">
              {blocks.filter((b) => mandatory.has(b.key)).map((b) => (
                <li key={b.key}>{BLOCK_TEXT[b.key] ?? b.key}</li>
              ))}
            </ul>
            <p className="yx-tim-note">Also show</p>
            {blocks.map((b, i) =>
              mandatory.has(b.key) ? null : (
                <Checkbox key={b.key} label={BLOCK_TEXT[b.key] ?? b.key} checked={b.shown} onChange={(c) => setBlocks((bs) => bs.map((x, j) => (j === i ? { ...x, shown: c } : x)))} />
              ),
            )}
          </Card>
        </>
      )}
    </LivePage>
  );
}

// ------------------------------------------------------------------------------------------ rules browser (CMP-08)

export interface StatutoryRulesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  rules: RuleSetView[] | null;
}

export function StatutoryRulesScreen(p: StatutoryRulesScreenProps) {
  const [open, setOpen] = useState<RuleSetView | null>(null);
  return (
    <LivePage
      title="Statutory rules"
      description="The rates, slabs and limits payroll uses, with their sources. YukthiX publishes them after a second review; they cannot be edited here."
      state={p.state}
      onRetry={p.onRetry}
      what="statutory rules"
      grantedBy="your payroll admin"
    >
      <EntityPicker entities={p.entities} value={p.entityId} onChange={p.onEntity} />
      <Card className="yx-pay-card" title={p.entityId ? 'Rules for this entity’s states' : 'All published rules'}>
        <table className="yx-tim-table" aria-label="Statutory rules">
          <thead>
            <tr>
              <th scope="col">Statute</th>
              <th scope="col">Where</th>
              <th scope="col">Version</th>
              <th scope="col">In force</th>
              <th scope="col">Check</th>
              <th scope="col">
                <span className="yx-visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(p.rules ?? []).map((r) => (
              <tr key={r.id}>
                <th scope="row">{statuteText(r.statute)}</th>
                <td>{r.jurisdiction === 'IN' ? 'India' : r.jurisdiction}</td>
                <td className="yx-tim-note">{r.version}</td>
                <td>
                  {dateText(r.validFrom)} – {r.validTo ? dateText(r.validTo) : 'now'}
                </td>
                <td>{r.verify ? <Badge tone="warning">Verify</Badge> : <Badge tone="success">Confirmed</Badge>}</td>
                <td>
                  <Button size="sm" onClick={() => setOpen(r)}>
                    Source and values
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Drawer open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={open ? `${statuteText(open.statute)} · ${open.version}` : ''} size="lg">
        {open && (
          <div className="yx-tim-stack">
            {open.verify && <InlineAlert tone="warning" title="Marked verify: figures from it are flagged until the compliance owner and the partner CA confirm it." />}
            <p>{open.source}</p>
            <pre className="yx-pay-json">{JSON.stringify(open.values, null, 2)}</pre>
          </div>
        )}
      </Drawer>
    </LivePage>
  );
}

// ------------------------------------------------------------------------------------------ coverage (PAY-30)

const COVER: Record<CoverageRow['status'], { label: string; tone: BadgeTone }> = {
  not_covered: { label: 'Not covered', tone: 'neutral' },
  approaching: { label: 'Approaching', tone: 'warning' },
  covered: { label: 'Covered', tone: 'success' },
};

export function CoverageLiveScreen(p: { state: LoadState; onRetry?: () => void; entities: SetupEntity[]; rows: CoverageRow[] | null }) {
  const name = (id: string) => p.entities.find((e) => e.id === id)?.name ?? '';
  return (
    <LivePage
      title="Statutory coverage"
      description="Head count of each legal entity against the PF and ESI thresholds, checked every day. Once covered, an establishment stays covered."
      state={p.state}
      onRetry={p.onRetry}
      what="statutory coverage"
      grantedBy="your payroll admin"
    >
      <Card className="yx-pay-card" title="Coverage">
        {p.rows?.length ? (
          <table className="yx-tim-table" aria-label="Statutory coverage">
            <thead>
              <tr>
                <th scope="col">Legal entity</th>
                <th scope="col">Statute</th>
                <th scope="col">Head count</th>
                <th scope="col">Threshold</th>
                <th scope="col">Status</th>
                <th scope="col">Covered since</th>
              </tr>
            </thead>
            <tbody>
              {p.rows.map((r) => (
                <tr key={`${r.legalEntityId}-${r.statute}`}>
                  <th scope="row">{name(r.legalEntityId)}</th>
                  <td>{statuteText(r.statute)}</td>
                  <td>{r.headcount}</td>
                  <td>{r.threshold}</td>
                  <td>
                    <Badge tone={COVER[r.status].tone}>{COVER[r.status].label}</Badge>
                  </td>
                  <td>{r.crossedOn ? dateText(r.crossedOn) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState compact title="Not checked yet" description="The daily check fills this in." />
        )}
      </Card>
    </LivePage>
  );
}

// ------------------------------------------------------------------------------------------ imports (PAY-2.12)

const IMPORT_KINDS: { value: ImportKind; label: string; header: string }[] = [
  {
    value: 'as_paid_lines',
    label: 'As-paid lines',
    header: 'employeeCode,month,componentCode,amount',
  },
  {
    value: 'opening_balances',
    label: 'Opening balances',
    header: 'employeeCode,fy,head,amount',
  },
  {
    value: 'form12b',
    label: 'Previous employer (Form 12B)',
    header: 'employeeCode,fy,employerTan,gross,exemptions,tds',
  },
];

/** Comma-separated text with a header row (no commas inside values) into rows. */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const head = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const cells = l.split(',');
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? '').trim()]));
  });
}

export interface PayImportsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  today: string;
  onStage: (legalEntityId: string, kind: ImportKind, rows: Record<string, string>[]) => Promise<ImportBatch>;
  onCommit: (id: string) => Promise<unknown>;
  onGoLive: (legalEntityId: string, goLiveMonth: string) => Promise<GoLiveCheck>;
}

export function PayImportsScreen(p: PayImportsScreenProps) {
  const { busy, error, run } = useRun();
  const [entityId, setEntityId] = useState<string | null>(p.entities[0]?.id ?? null);
  const [kind, setKind] = useState<ImportKind>('as_paid_lines');
  const [text, setText] = useState('');
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [committed, setCommitted] = useState<string | null>(null);
  const [month, setMonth] = useState(p.today.slice(0, 7));
  const [check, setCheck] = useState<GoLiveCheck | null>(null);
  const spec = IMPORT_KINDS.find((k) => k.value === kind)!;
  const rows = parseCsv(text);
  return (
    <LivePage
      title="Import from the old payroll"
      description="Opening balances, previous-employer income and what the old system paid, month by month. Rows are checked first; nothing lands until you commit. Imported months are locked."
      state={p.state}
      onRetry={p.onRetry}
      what="payroll imports"
      grantedBy="your payroll admin"
    >
      <EntityPicker entities={p.entities} value={entityId} onChange={setEntityId} />
      {error && (
        <InlineAlert tone="danger" title="That didn’t work">
          {error}
        </InlineAlert>
      )}
      {committed && <InlineAlert tone="success" title={committed} />}
      <Card className="yx-pay-card" title="1. Check the rows">
        <FormField id="imp-kind" label="What you are importing">
          <Segment label="Import kind" value={kind} onChange={(v) => (setKind(v), setBatch(null))} options={IMPORT_KINDS} />
        </FormField>
        <FormField id="imp-text" label="Rows" helper={`Paste comma-separated rows with this header: ${spec.header}`}>
          <TextArea rows={8} value={text} onChange={(v) => (setText(v), setBatch(null))} placeholder={spec.header} />
        </FormField>
        <Button
          variant="primary"
          disabled={!entityId || !rows.length}
          loading={busy === 'stage'}
          onClick={() => void run('stage', async () => (setCommitted(null), setBatch(await p.onStage(entityId!, kind, rows))))}
        >
          Check {rows.length || ''} rows
        </Button>
      </Card>
      {batch && (
        <Card className="yx-pay-card" title="2. Commit">
          <p>
            {batch.valid} of {batch.rows} rows are ready.
          </p>
          {batch.errors.length > 0 && (
            <InlineAlert tone="warning" title="Fix these rows and check again">
              <ul>
                {batch.errors.map((e) => (
                  <li key={e.row}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </InlineAlert>
          )}
          <Button
            variant="primary"
            disabled={batch.errors.length > 0 || batch.status !== 'staged'}
            loading={busy === 'commit'}
            onClick={() =>
              void run('commit', async () => {
                await p.onCommit(batch.id);
                setBatch({ ...batch, status: 'committed' });
                setCommitted(`${batch.valid} rows imported.`);
              })
            }
          >
            Commit {batch.valid} rows
          </Button>
        </Card>
      )}
      <Card className="yx-pay-card" title="Go-live check">
        <div className="yx-tim-row">
          <FormField id="imp-month" label="First month paid in YukthiX">
            <TextField type="month" value={month} onChange={setMonth} />
          </FormField>
          <Button disabled={!entityId || !month} loading={busy === 'golive'} onClick={() => void run('golive', async () => setCheck(await p.onGoLive(entityId!, month)))}>
            Check
          </Button>
        </div>
        {check &&
          (check.ready ? (
            <InlineAlert tone="success" title={`Every month from ${monthText(check.fyStart.slice(0, 7))} has its as-paid lines.`} />
          ) : (
            <InlineAlert tone="warning" title={`${check.missing.length}${check.missing.length === 500 ? '+' : ''} person-months have no as-paid lines yet`}>
              <ul>
                {check.missing.slice(0, 20).map((m) => (
                  <li key={`${m.employeeCode}-${m.month}`}>
                    {m.employeeCode} · {monthText(m.month)}
                  </li>
                ))}
              </ul>
            </InlineAlert>
          ))}
      </Card>
    </LivePage>
  );
}
