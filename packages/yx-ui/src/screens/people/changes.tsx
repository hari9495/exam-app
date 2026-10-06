// PPL-04 Change action · PPL-05 Scheduled changes · PPL-06 Bulk changes wizard · PPL-07 Employee import
// PPL-09 Bulk transfer / restructure wizard · PPL-10 Inter-entity continuity checklist (P06 §4.3–4.4, §7; M01 §3.3; P01 YX-ORG-17 / 22).
import { useMemo, useState } from 'react';
import { Check, Download, Eye, EyeOff, FileSpreadsheet, FileText, Pencil, Plus, XCircle } from 'lucide-react';
import { Button } from '../../components/button';
import { Card, ObjectHeader, PageHeader } from '../../components/shell';
import { Drawer } from '../../components/drawer';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { MultiSelect, PersonPicker, Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { CurrencyField, NumberField, TextArea, TextField } from '../../components/inputs';
import { RadioGroup } from '../../components/choice';
import { ApprovalTimeline, type ApprovalStep } from '../../components/timeline';
import { ConfirmDialog, Dialog, TypeToConfirmDialog } from '../../components/overlay';
import { DataTable, type TableColumn } from '../../components/table';
import { MenuItem } from '../../components/menu';
import { Stepper, useNarrow } from '../../components/stepper';
import { FileUpload } from '../../components/upload';
import { Icon, Text } from '../../components/foundations';
import { formatDate, formatINR } from '../../lib/format';
import { applyIncrement, daysBetween, validateImport, withinWindow, type ImportRow, type Persona } from './people-logic';
import { GRADE_BANDS, INCREMENT_LEFT_OUT, INCREMENT_PCT, INCREMENT_ROWS, SCHEDULED } from './people-data';
import { PeopleFrame, Segment, StatusBadge, StatusChecklist, type ChecklistRow } from './people-kit';

/* ================================================================== PPL-04 change action */

export type ChangeKind = 'Promotion' | 'Transfer' | 'Inter-entity transfer' | 'Manager change' | 'Salary revision' | 'Contract extension' | 'Absence start';
const KINDS: ChangeKind[] = ['Promotion', 'Transfer', 'Inter-entity transfer', 'Manager change', 'Salary revision', 'Contract extension', 'Absence start'];

interface ImpactRow {
  fact: string;
  now: string;
  next: string;
}
const IMPACT: Record<string, ImpactRow[]> = {
  Promotion: [
    { fact: 'Designation', now: 'Senior Quality Inspector', next: 'Quality Lead' },
    { fact: 'Grade', now: 'G5', next: 'G6' },
    { fact: 'Annual CTC', now: formatINR(690000), next: formatINR(780000) },
    { fact: 'Notice period', now: '60 days', next: '90 days (G6 policy)' },
    { fact: 'Approvers for leave', now: 'Divya Raghunathan', next: 'Divya Raghunathan' },
    { fact: 'Payroll', now: 'October run', next: 'Full month at new CTC from 1 Oct' },
  ],
  Transfer: [
    { fact: 'Location', now: 'Bengaluru head office', next: 'Chennai office' },
    { fact: 'Holiday calendar', now: 'Karnataka 2026', next: 'Tamil Nadu 2026' },
    { fact: 'Professional tax state', now: 'Karnataka', next: 'Tamil Nadu (half-yearly slab)' },
    { fact: 'Labour welfare fund', now: 'Karnataka', next: 'Tamil Nadu' },
    { fact: 'Shift', now: 'General, 9:30 am to 6:30 pm', next: 'General, 9:30 am to 6:30 pm' },
    { fact: 'Leave approver', now: 'Priya Nair', next: 'Priya Nair' },
    { fact: 'Cost centre', now: 'SL-BLR-02', next: 'SL-MAA-01' },
    { fact: 'Geofence', now: 'MG Road, 150 m', next: 'Taramani, 200 m' },
    { fact: 'Payroll proration', now: 'October', next: 'Segments: 1–4 Oct Bengaluru, 5–31 Oct Chennai' },
  ],
  'Inter-entity transfer': [
    { fact: 'Legal entity', now: 'Kaveri Foods Pvt Ltd', next: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' },
    { fact: 'Employee code', now: 'KF-0088', next: 'KF-0088 (kept)' },
    { fact: 'PF', now: 'Same UAN', next: 'Same UAN · transfer tracked on the checklist' },
    { fact: 'Tax', now: 'YTD ₹4,12,000', next: 'Form 12B carried into the new entity' },
    { fact: 'Leave balance', now: '11.5 days PL', next: 'Carried over' },
  ],
};

function approvalSteps(kind: string, persona: Persona): ApprovalStep[] {
  const raiser = persona === 'mgr' ? 'Divya Raghunathan' : 'Lakshmi Venkatesan';
  if (kind === 'Promotion')
    return [
      { id: 'a0', label: 'Raised', status: 'done', approver: raiser, at: new Date(2026, 8, 29, 9, 40) },
      { id: 'a1', label: 'Skip-level manager', status: 'current', approver: 'Karthik Subramanian' },
      { id: 'a2', label: 'HR business partner', status: 'pending', approver: 'Lakshmi Venkatesan' },
      { id: 'a3', label: 'Letter', status: 'pending', approver: 'Sent automatically after HR approves' },
    ];
  return [
    { id: 'b0', label: 'Raised', status: 'done', approver: raiser, at: new Date(2026, 8, 29, 9, 40) },
    { id: 'b1', label: 'Current manager', status: 'current', approver: 'Priya Nair' },
    { id: 'b2', label: 'HR business partner', status: 'pending', approver: 'Lakshmi Venkatesan' },
  ];
}

/** People the change can be for; a manager only sees their own team. */
const CHANGE_PEOPLE = [
  { id: 'ak', name: 'Arjun Kulkarni', role: 'Senior Quality Inspector', team: 'Quality', location: 'Hosur plant', mine: true },
  { id: 'rm', name: 'Rohit Menon', role: 'QA Engineer', team: 'Quality', location: 'Hosur plant', mine: true },
  { id: 'rs', name: 'Rahul Sharma', role: 'Account Executive', team: 'Sales', location: 'Bengaluru head office', mine: false },
];
/** A fitting example reason per change type (founder review: a transfer had a promotion's reason). */
const REASON: Partial<Record<ChangeKind, string>> = {
  Promotion: 'Leads the tablet inspection roll-out; ready for a team.',
  Transfer: 'Moving to cover the Chennai key accounts from November.',
  'Inter-entity transfer': 'The Chennai sales team now sits under the Tamil Nadu entity.',
};
/** Managers raise people changes for their team; entity, pay and absence changes stay with HR. */
const MGR_KINDS: ChangeKind[] = ['Promotion', 'Transfer', 'Manager change', 'Contract extension'];
const CURRENT_CTC = 690000;
const BAND_MID = 820000;
/** Changes already raised and waiting for someone. */
const IN_PROGRESS = [
  { id: 'w1', name: 'Nisha Rao', kind: 'Manager change', effective: new Date(2026, 10, 2), waitingFor: 'Karthik Subramanian', mine: true },
  { id: 'w2', name: 'Aisha Khan', kind: 'Manager change', effective: new Date(2026, 9, 12), waitingFor: 'Lakshmi Venkatesan', mine: false },
];

export interface ChangeActionSheetProps {
  persona: Persona;
  kind: ChangeKind;
  effective: Date;
  today: Date;
  payGrant?: boolean;
  /** Retro change touching processed payroll (P06 §4.5). */
  payrollProcessedTo?: Date;
  /** The side panel starts open (stories); false shows the page itself. */
  startOpen?: boolean;
}

// PPL-04
export function ChangeActionSheet({ persona, kind: kindProp, effective: effectiveProp, today, payGrant = false, payrollProcessedTo, startOpen = true }: ChangeActionSheetProps) {
  const mgr = persona === 'mgr';
  const people = CHANGE_PEOPLE.filter((p) => !mgr || p.mine);
  const [open, setOpen] = useState(startOpen);
  const [whoId, setWhoId] = useState<string | null>(!startOpen ? null : kindProp === 'Transfer' || kindProp === 'Inter-entity transfer' ? 'rs' : 'ak');
  const [kind, setKind] = useState<ChangeKind | null>(kindProp);
  const [effective, setEffective] = useState<Date | null>(effectiveProp);
  const [ctc, setCtc] = useState<number | null>(780000);
  const [reason, setReason] = useState(REASON[kindProp] ?? '');
  const [options, setOptions] = useState({ leave: 'carry', service: 'continue', code: 'keep', fnf: 'none', salary: 'keep' });
  const narrow = useNarrow();
  const showPay = persona === 'hr' || payGrant;
  const retro = effective && daysBetween(effective, today) > 0;
  const processed = retro && payrollProcessedTo && effective && effective <= payrollProcessedTo;
  const impact = (IMPACT[kind ?? ''] ?? IMPACT.Promotion).filter((r) => showPay || !/CTC|Payroll|Tax/.test(r.fact));
  const changed = impact.filter((r) => r.now !== r.next);
  const same = impact.filter((r) => r.now === r.next);
  const person = CHANGE_PEOPLE.find((p) => p.id === whoId) ?? CHANGE_PEOPLE[0];
  const steps = approvalSteps(kind ?? 'Promotion', persona);
  const nextApprovers = steps.filter((s) => s.status !== 'done' && !/automatically/.test(String(s.approver))).map((s) => s.approver);
  const pct = ctc ? Math.round(((ctc - CURRENT_CTC) / CURRENT_CTC) * 100) : 0;
  const pickKind = (k: ChangeKind | null) => {
    setKind(k);
    setReason((k && REASON[k]) ?? '');
  };
  const waiting = IN_PROGRESS.filter((w) => !mgr || w.mine);
  const fromLabel = effective ? `From ${formatDate(effective)}` : 'From the effective date';

  return (
    <PeopleFrame active="Change action" persona={persona}>
      <PageHeader title="Change action" description={mgr ? 'Raise a promotion, transfer or manager change for someone in your team.' : 'Raise a change for one person. For many people at once, use Bulk changes.'} />
      <div className="yx-ppl__grid2">
        <Card title="Start a change">
          <div className="yx-ppl__stack">
            <FormField label="Person" required>
              <PersonPicker people={people.map((p) => ({ id: p.id, name: p.name, role: p.role, department: `${p.team} · ${p.location}` }))} value={whoId} onChange={setWhoId} placeholder="Find a person" />
            </FormField>
            <div>
              <Button variant="primary" disabled={!whoId} onClick={() => setOpen(true)}>
                Start change
              </Button>
            </div>
          </div>
        </Card>
        <Card title={`Waiting for approval (${waiting.length})`}>
          {waiting.length ? (
            <StatusChecklist
              label="Changes waiting for approval"
              rows={waiting.map(
                (w): ChecklistRow => ({
                  id: w.id,
                  title: `${w.name} · ${w.kind}`,
                  status: 'Pending approval',
                  note: `Effective ${formatDate(w.effective)} · waiting for ${w.waitingFor}`,
                  action: <Button size="sm">Open</Button>,
                }),
              )}
            />
          ) : (
            <Text tone="secondary">Nothing is waiting.</Text>
          )}
        </Card>
      </div>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title={`Change for ${person.name}`}
        subtitle={`${person.role} · ${person.team} · ${person.location}`}
        dirty
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button>Save draft</Button>
            <Button variant="primary">Send for approval</Button>
          </>
        }
      >
        <div className="yx-ppl__stack">
          {nextApprovers.length > 0 && (
            <Text size="sm" tone="secondary" as="p">
              Goes to {nextApprovers.join(', then ')}.
            </Text>
          )}
          <div className="yx-ppl__form">
            <FormField label="Change type" required>
              <Select options={(mgr ? MGR_KINDS : KINDS).map((k) => ({ value: k, label: k }))} value={kind} onChange={pickKind} />
            </FormField>
            <FormField label="Effective date" required helper={retro ? 'This date is in the past, so it is a correction.' : 'Applied at the start of that day (IST).'}>
              <DatePicker value={effective} onChange={setEffective} />
            </FormField>
            {kind === 'Promotion' && (
              <>
                <FormField label="New designation" required>
                  <Select options={[{ value: 'ql', label: 'Quality Lead' }, { value: 'qe', label: 'Quality Engineer' }]} value="ql" onChange={() => {}} />
                </FormField>
                <FormField label="New grade" required>
                  <Select options={[{ value: 'G6', label: showPay ? 'G6 · ₹6,80,000 to ₹9,60,000' : 'G6' }]} value="G6" onChange={() => {}} />
                </FormField>
                {showPay ? (
                  <FormField
                    label="New annual CTC"
                    required
                    helper={`${pct >= 0 ? '+' : ''}${pct}% on the current ${formatINR(CURRENT_CTC)} · ${ctc && ctc < BAND_MID ? 'below' : 'at or above'} the band midpoint ${formatINR(BAND_MID)}. The compensation record is created in this same change.`}
                  >
                    <CurrencyField value={ctc} onChange={setCtc} />
                  </FormField>
                ) : (
                  <InlineAlert tone="info" title="Pay is proposed by HR">
                    You don't have a salary grant for your team, so HR adds the new CTC before approval.
                  </InlineAlert>
                )}
              </>
            )}
            {kind === 'Transfer' && (
              <FormField label="New location" required>
                <Select options={[{ value: 'maa', label: 'Chennai office' }, { value: 'hsr', label: 'Hosur plant' }]} value="maa" onChange={() => {}} />
              </FormField>
            )}
            {kind === 'Inter-entity transfer' && (
              <Card title="Transfer options">
                <div className="yx-ppl__stack">
                  <Text size="sm" tone="secondary" as="p">
                    Company defaults are selected. Change them for this transfer only.
                  </Text>
                  <FormField label="Leave balance">
                    <RadioGroup value={options.leave} onChange={(v) => setOptions({ ...options, leave: v })} options={[{ value: 'carry', label: 'Carry over' }, { value: 'encash', label: 'Encash at old entity' }, { value: 'lapse', label: 'Lapse' }]} orientation="horizontal" />
                  </FormField>
                  <FormField label="Service continuity (gratuity, seniority, notice)">
                    <RadioGroup value={options.service} onChange={(v) => setOptions({ ...options, service: v })} options={[{ value: 'continue', label: 'Continue from 14 Jul 2019' }, { value: 'restart', label: 'Restart' }]} orientation="horizontal" />
                  </FormField>
                  <FormField label="Employee code">
                    <RadioGroup value={options.code} onChange={(v) => setOptions({ ...options, code: v })} options={[{ value: 'keep', label: 'Keep KF-0088' }, { value: 'new', label: 'New code in the target series' }]} orientation="horizontal" />
                  </FormField>
                  <FormField label="Settlement at the old entity">
                    <RadioGroup value={options.fnf} onChange={(v) => setOptions({ ...options, fnf: v })} options={[{ value: 'none', label: 'None (amounts move over)' }, { value: 'full', label: 'Full and final settlement' }]} orientation="horizontal" />
                  </FormField>
                  <FormField label="Salary structure">
                    <RadioGroup value={options.salary} onChange={(v) => setOptions({ ...options, salary: v })} options={[{ value: 'keep', label: 'Keep' }, { value: 'new', label: 'Assign new' }]} orientation="horizontal" />
                  </FormField>
                  <Text size="sm" tone="secondary" as="p">
                    A continuity checklist opens on this change: UAN transfer, ESI IP, Form 12B, declarations, loans, leave ledger and gratuity.
                  </Text>
                </div>
              </Card>
            )}
            <FormField label="Reason" required>
              <TextArea value={reason} onChange={setReason} rows={2} />
            </FormField>
          </div>
          {processed && (
            <InlineAlert tone="warning" title="Payroll for August and September 2026 is already processed">
              Payslips stay as issued. October payroll pays the difference as arrears. The old values are kept as superseded on the timeline.
            </InlineAlert>
          )}
          <Card title={`What changes (${changed.length})`}>
            <div className="yx-ppl__stack">
              {narrow ? (
                <ul className="yx-ppl__impact-list" aria-label="What changes">
                  {changed.map((r) => (
                    <li key={r.fact}>
                      <span className="yx-ppl__impact-fact">{r.fact}</span>
                      <span>
                        {r.now} → <strong>{r.next}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <table className="yx-ppl__impact">
                  <thead>
                    <tr>
                      <th scope="col">What changes</th>
                      <th scope="col">Now</th>
                      <th scope="col">{fromLabel}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changed.map((r) => (
                      <tr key={r.fact}>
                        <th scope="row">{r.fact}</th>
                        <td>{r.now}</td>
                        <td data-changed>{r.next}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {same.length > 0 && (
                <details className="yx-ppl__done-fold">
                  <summary>Stays the same ({same.length})</summary>
                  <ul className="yx-ppl__impact-list" aria-label="Stays the same">
                    {same.map((r) => (
                      <li key={r.fact}>
                        <span className="yx-ppl__impact-fact">{r.fact}</span>
                        <span>{r.now}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </Card>
          <Card title="Approval route">
            <ApprovalTimeline steps={steps} now={today} />
          </Card>
        </div>
      </Drawer>
    </PeopleFrame>
  );
}

/* ================================================================== PPL-05 scheduled changes */

type Sched = (typeof SCHEDULED)[number];
type Win = 30 | 60 | 90;

/** Effective date plus "in 2 days"; amber within a week. */
function EffectiveCell({ date, today }: { date: Date; today: Date }) {
  const n = daysBetween(today, date);
  return (
    <span className="yx-ppl__row yx-ppl__row--tight">
      {formatDate(date)}
      <Badge tone={n <= 7 ? 'warning' : 'neutral'}>{n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`}</Badge>
    </span>
  );
}

// PPL-05
export function ScheduledChangesScreen({ rows, today, defaultWindow = 30, defaultCancelId, canSeePay = true }: { rows: Sched[]; today: Date; defaultWindow?: Win; defaultCancelId?: string; canSeePay?: boolean }) {
  const [win, setWin] = useState<Win>(defaultWindow);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(defaultCancelId ?? null);
  const [reason, setReason] = useState('');
  const narrow = useNarrow();
  const inWin = (w: Win) => rows.filter((r) => withinWindow(r.effective, today, w));
  const windowed = inWin(win);
  const pending = windowed.filter((r) => r.status === 'Pending approval');
  const shown = pendingOnly ? pending : windowed;
  const cancelRow = rows.find((r) => r.id === cancelId);
  // Two changes for one person in the window: the later one is worked out on the result of the earlier one.
  const revision = shown.find((r) => r.type === 'Salary revision' && shown.some((o) => o.name === r.name && o.id !== r.id && o.effective < r.effective));
  const earlier = revision && shown.find((o) => o.name === revision.name && o.id !== revision.id && o.effective < revision.effective);
  const payText = (r: Sched) => (r.pay ? (showPay ? r.pay : '₹ •••') : null);
  const changeCell = (r: Sched) => (
    <span className="yx-ppl__type">
      <span>{r.type}</span>
      {r.status === 'Pending approval' && (
        <>
          <Badge tone="warning">Pending approval</Badge>
          <span className="yx-ppl__sub">Waiting for {r.waitingFor}</span>
        </>
      )}
    </span>
  );
  const summaryCell = (r: Sched) => (
    <span className="yx-ppl__type">
      <span>{r.summary}</span>
      {payText(r) && <span className="yx-ppl__sub">{payText(r)}</span>}
    </span>
  );
  const cols: TableColumn<Sched>[] = [
    { key: 'name', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.code }), width: 190 },
    { key: 'type', header: 'Change', value: (r) => r.type, render: changeCell, groupable: true, width: 140 },
    { key: 'effective', header: 'Effective', type: 'date', value: (r) => r.effective, render: (r) => <EffectiveCell date={r.effective} today={today} />, width: 160 },
    { key: 'summary', header: 'What changes', value: (r) => r.summary, render: summaryCell, width: 225 },
    { key: 'raisedBy', header: 'Raised by', value: (r) => r.raisedBy, width: 170 },
  ];
  const edit = () => (
    <Button size="sm" icon={Pencil}>
      Edit
    </Button>
  );
  const empty = <EmptyState title={pendingOnly ? 'Nothing is waiting for approval' : `No changes in the next ${win} days`} description="Changes you schedule for a future date appear here until they apply." action={<Button variant="primary">Start change</Button>} />;
  return (
    <PeopleFrame active="Scheduled">
      <PageHeader
        title="Scheduled changes"
        description="Future-dated changes apply on their date. Editing a date, amount or grade sends the change back for approval."
        actions={
          canSeePay ? (
            <Button icon={showPay ? EyeOff : Eye} aria-pressed={showPay} onClick={() => setShowPay(!showPay)}>
              {showPay ? 'Hide pay' : 'Show pay'}
            </Button>
          ) : undefined
        }
      />
      <div className="yx-ppl__filterbar">
        <Segment label="Window" value={win} onChange={setWin} options={([30, 60, 90] as Win[]).map((w) => ({ value: w, label: `Next ${w} days (${inWin(w).length})` }))} />
        <button type="button" className="yx-ppl__chip yx-ppl__chip--toggle" aria-pressed={pendingOnly} onClick={() => setPendingOnly(!pendingOnly)}>
          {pendingOnly && <Icon icon={Check} size="sm" />}
          Only pending approval ({pending.length})
        </button>
      </div>
      {showPay && <Text size="sm" tone="secondary" as="p">Pay is showing. Each time you show it is recorded.</Text>}
      {revision && earlier && (
        <InlineAlert tone="warning" title={`${revision.name} has two changes`} actions={<Button size="sm">Open revision</Button>}>
          His {revision.summary.replace('Market correction ', '')} revision on {formatDate(revision.effective)} is worked out on his pay after the {formatDate(earlier.effective)} {earlier.type.toLowerCase()}. Check the amounts before it applies.
        </InlineAlert>
      )}
      {narrow ? (
        shown.length === 0 ? (
          empty
        ) : (
          <ul className="yx-ppl__cards" aria-label="Scheduled changes">
            {[...shown].sort((a, b) => a.effective.getTime() - b.effective.getTime()).map((r) => (
              <li key={r.id} className="yx-ppl__rcard">
                <span className="yx-ppl__rcard-name">{r.name}</span>
                {changeCell(r)}
                {summaryCell(r)}
                <EffectiveCell date={r.effective} today={today} />
                {edit()}
              </li>
            ))}
          </ul>
        )
      ) : (
        <DataTable
          label="Scheduled changes"
          columns={cols}
          rows={shown}
          getRowId={(r) => r.id}
          empty={empty}
          rowButtons={edit}
          rowActions={(r) => (
            <>
              <MenuItem>Open change</MenuItem>
              <MenuItem icon={XCircle} destructive onSelect={() => setCancelId(r.id)}>
                Cancel change
              </MenuItem>
            </>
          )}
          defaultSort={{ key: 'effective', dir: 'asc' }}
          defaultColumnState={{ hidden: ['raisedBy'] }}
          onExport={() => {}}
        />
      )}
      <ConfirmDialog
        open={!!cancelRow}
        onOpenChange={(o) => !o && setCancelId(null)}
        title={`Cancel ${cancelRow?.type.toLowerCase()} for ${cancelRow?.name}?`}
        consequence={cancelRow ? `${cancelRow.summary} won't happen on ${formatDate(cancelRow.effective)}. The approvers are told, and the cancelled change stays on the timeline.` : ''}
        confirmLabel="Cancel change"
        cancelLabel="Keep change"
        destructive
        confirmDisabled={reason.trim().length < 5}
        onConfirm={() => setCancelId(null)}
      >
        <FormField label="Reason" required helper="At least 5 characters. Shown to the approvers.">
          <TextArea value={reason} onChange={setReason} rows={2} />
        </FormField>
      </ConfirmDialog>
    </PeopleFrame>
  );
}

/* ================================================================== PPL-06 bulk changes wizard */

type IncRow = (typeof INCREMENT_ROWS)[number] & { pct: number; next: number; capped: boolean; flag?: string };
const RATINGS = ['Exceeds', 'Meets', 'Below'] as const;
const BULK_TYPES: { value: string; label: string }[] = [
  { value: 'inc', label: 'Annual increment' },
  { value: 'market', label: 'Market correction' },
];

/** Rule % per rating, a per-person % where HR changed it, and people capped at their band maximum. */
export function incrementPreview(pct: Record<string, number>, custom: Record<string, number> = {}, capped: string[] = [], rows = INCREMENT_ROWS): IncRow[] {
  return rows.map((r) => {
    const max = GRADE_BANDS[r.grade].max;
    const p = custom[r.id] ?? pct[r.rating] ?? 0;
    const isCapped = capped.includes(r.id);
    const next = isCapped ? Math.max(r.ctc, max) : applyIncrement(r.ctc, p);
    const shownPct = isCapped ? Math.round(((next - r.ctc) / r.ctc) * 1000) / 10 : p;
    return { ...r, pct: shownPct, next, capped: isCapped, flag: next > max ? 'Above band' : undefined };
  });
}

// PPL-06
export function BulkChangesWizard({ current = 'people', confirmOpen = false }: { current?: string; confirmOpen?: boolean }) {
  const allDepts = useMemo(() => [...new Set(INCREMENT_ROWS.map((r) => r.department))].sort(), []);
  const [type, setType] = useState<string | null>('inc');
  const [effective, setEffective] = useState<Date | null>(new Date(2026, 9, 1));
  const [joinedBefore, setJoinedBefore] = useState<Date | null>(new Date(2026, 3, 1));
  const [depts, setDepts] = useState<string[]>(allDepts);
  const [pct, setPct] = useState(INCREMENT_PCT);
  const [custom, setCustom] = useState<Record<string, number>>({});
  const [capped, setCapped] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(confirmOpen);
  const [leftOutOpen, setLeftOutOpen] = useState(false);
  const [letterOpen, setLetterOpen] = useState(false);
  // The wizard's content column is narrow, so cards take over below 1024 px.
  const narrow = useNarrow(1023);
  const chosen = useMemo(() => INCREMENT_ROWS.filter((r) => depts.includes(r.department)), [depts]);
  const rows = useMemo(() => incrementPreview(pct, custom, capped, chosen), [pct, custom, capped, chosen]);
  const before = rows.reduce((s, r) => s + r.ctc, 0);
  const after = rows.reduce((s, r) => s + r.next, 0);
  const flaggedRows = rows.filter((r) => r.flag);
  const typeLabel = BULK_TYPES.find((t) => t.value === type)?.label ?? 'Bulk change';
  const cap = (ids: string[]) => setCapped([...new Set([...capped, ...ids])]);
  const capBtn = (r: IncRow) =>
    r.flag ? (
      <Button size="sm" onClick={() => cap([r.id])}>
        Cap at band max
      </Button>
    ) : null;
  const checkCell = (r: IncRow) => (r.flag ? <Badge tone="warning">Above band</Badge> : r.capped ? <Badge tone="info">Capped</Badge> : <Badge tone="success">OK</Badge>);
  const cols: TableColumn<IncRow>[] = [
    { key: 'name', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: `${r.grade} · ${r.rating}` }), width: 180 },
    { key: 'pct', header: 'Raise', type: 'number', value: (r) => r.pct, render: (r) => `${r.pct}%`, editable: 'number', width: 90 },
    {
      key: 'next',
      header: 'New CTC',
      type: 'money',
      value: (r) => r.next,
      render: (r) => (
        <span className="yx-ppl__type yx-ppl__type--end">
          <strong>{formatINR(r.next)}</strong>
          <span className="yx-ppl__sub">from {formatINR(r.ctc)}</span>
          {(r.flag || r.capped) && checkCell(r)}
        </span>
      ),
      total: 'sum',
      width: 150,
    },
  ];
  const first = rows[0];
  return (
    <PeopleFrame active="Bulk changes">
      <PageHeader title={typeLabel} description="One approval for everyone, a preview per person and letters in bulk." />
      <Stepper
        title="Bulk change"
        defaultCurrent={current}
        finishLabel={`Send for approval (${rows.length} people)`}
        onFinish={() => setConfirm(true)}
        onSaveAndExit={() => {}}
        review={{ description: 'Check the totals before you send this for one approval.' }}
        steps={[
          {
            id: 'people',
            title: 'Choose people',
            summary: `${rows.length} employees · ${depts.length === allDepts.length ? 'all departments' : depts.join(', ')} · Kaveri Foods Pvt Ltd · effective ${effective ? formatDate(effective) : '—'}`,
            content: (
              <div className="yx-ppl__form">
                <FormField label="Change type" required>
                  <Select options={BULK_TYPES} value={type} onChange={setType} />
                </FormField>
                <FormField label="Legal entity" required>
                  <Select options={[{ value: 'kf', label: 'Kaveri Foods Pvt Ltd' }]} value="kf" onChange={() => {}} />
                </FormField>
                <FormField label="Effective date" required>
                  <DatePicker value={effective} onChange={setEffective} />
                </FormField>
                <FormField label="Departments" required>
                  <MultiSelect options={allDepts.map((d) => ({ value: d, label: d }))} value={depts} onChange={setDepts} />
                </FormField>
                <FormField label="Confirmed employees who joined before" required>
                  <DatePicker value={joinedBefore} onChange={setJoinedBefore} />
                </FormField>
                <InlineAlert tone="info" actions={<Button size="sm" onClick={() => setLeftOutOpen(true)}>See who</Button>}>
                  {rows.length} people match. {INCREMENT_LEFT_OUT.length} people on notice are left out.
                </InlineAlert>
              </div>
            ),
          },
          {
            id: 'rule',
            title: 'Set the rule',
            summary: `Exceeds ${pct.Exceeds}% · Meets ${pct.Meets}% · Below ${pct.Below}%`,
            content: (
              <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Increase by rating">
                <table className="yx-ppl__impact">
                  <thead>
                    <tr>
                      <th scope="col">Rating</th>
                      <th scope="col">People</th>
                      <th scope="col">Increase</th>
                      <th scope="col">Added cost a year</th>
                    </tr>
                  </thead>
                  <tbody>
                    {RATINGS.map((k) => {
                      const inRating = rows.filter((r) => r.rating === k);
                      return (
                        <tr key={k}>
                          <th scope="row">{k}</th>
                          <td>{inRating.length}</td>
                          <td>
                            <NumberField aria-label={`Increase for ${k}`} value={pct[k]} onChange={(v) => setPct({ ...pct, [k]: v ?? 0 })} decimals suffix="%" />
                          </td>
                          <td>{formatINR(inRating.reduce((s, r) => s + r.next - r.ctc, 0))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ),
          },
          {
            id: 'preview',
            title: 'Preview each person',
            summary: `${formatINR(before)} → ${formatINR(after)} (${formatINR(after - before)} more a year) · ${flaggedRows.length ? `${flaggedRows.length} above band` : 'all within band'}`,
            content: (
              <div className="yx-ppl__stack">
                {flaggedRows.length > 0 && (
                  <InlineAlert
                    tone="warning"
                    title={`${flaggedRows.length} ${flaggedRows.length === 1 ? 'person goes' : 'people go'} above the band maximum`}
                    actions={<Button size="sm" onClick={() => cap(flaggedRows.map((r) => r.id))}>Cap all {flaggedRows.length} at band maximum</Button>}
                  >
                    Cap them, change their raise in the table, or leave them for the approver as exceptions.
                  </InlineAlert>
                )}
                {narrow ? (
                  <ul className="yx-ppl__cards" aria-label="Per-person preview">
                    {[...rows].sort((a, b) => Number(!!b.flag) - Number(!!a.flag)).map((r) => (
                      <li key={r.id} className="yx-ppl__rcard">
                        <span className="yx-ppl__rcard-name">{r.name}</span>
                        <span className="yx-ppl__sub">
                          {r.grade} · {r.rating}
                        </span>
                        <span>
                          {formatINR(r.ctc)} → <strong>{formatINR(r.next)}</strong> ({r.pct}%)
                        </span>
                        {checkCell(r)}
                        {capBtn(r)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <DataTable
                    label="Per-person preview"
                    columns={cols}
                    rows={[...rows].sort((a, b) => Number(!!b.flag) - Number(!!a.flag))}
                    getRowId={(r) => r.id}
                    pageSize={10}
                    rowButtons={capBtn}
                    onCellEdit={(r, key, v) => key === 'pct' && typeof v === 'number' && (setCustom({ ...custom, [r.id]: v }), setCapped(capped.filter((id) => id !== r.id)))}
                  />
                )}
              </div>
            ),
          },
          {
            id: 'letters',
            title: 'Letters',
            summary: 'Increment letter (template v3) · to each person’s documents and a notification',
            content: (
              <div className="yx-ppl__form">
                <FormField label="Letter template" required>
                  <Select options={[{ value: 'inc3', label: 'Increment letter v3 (approval required)' }]} value="inc3" onChange={() => {}} />
                </FormField>
                <div>
                  <Button icon={FileText} onClick={() => setLetterOpen(true)}>
                    Preview a letter
                  </Button>
                </div>
                <InlineAlert tone="info">Letters are issued after approval and apply on {effective ? formatDate(effective) : 'the effective date'}. Failures are listed for retry.</InlineAlert>
              </div>
            ),
          },
        ]}
      />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Send the ${typeLabel.toLowerCase()} for ${rows.length} people for approval?`}
        consequence={`Annual cost goes from ${formatINR(before)} to ${formatINR(after)} (${formatINR(after - before)} more a year). Lakshmi Venkatesan sends it. Suresh Pillai approves it. Once approved it applies on ${effective ? formatDate(effective) : 'the effective date'}; later corrections go through a new change and payroll pays arrears.`}
        confirmLabel="Send for approval"
        onConfirm={() => setConfirm(false)}
      />
      <Dialog open={leftOutOpen} onOpenChange={setLeftOutOpen} title="Left out of this change" footer={<Button onClick={() => setLeftOutOpen(false)}>Close</Button>}>
        <StatusChecklist label="People left out" rows={INCREMENT_LEFT_OUT.map((p, i): ChecklistRow => ({ id: `lo${i}`, title: p.name, status: 'On notice', note: p.why }))} />
      </Dialog>
      <Dialog open={letterOpen} onOpenChange={setLetterOpen} size="md" title={`Increment letter · ${first?.name ?? ''}`} footer={<Button onClick={() => setLetterOpen(false)}>Close</Button>}>
        {first && (
          <div className="yx-ppl__stack">
            <Text as="p">Dear {first.name.split(' ')[0]},</Text>
            <Text as="p">
              Following your annual review, your annual CTC is revised from {formatINR(first.ctc)} to {formatINR(first.next)} ({first.pct}%), effective {effective ? formatDate(effective) : 'the effective date'}. Your grade stays {first.grade}.
            </Text>
            <Text as="p">Lakshmi Venkatesan · HR Business Partner · Kaveri Foods Pvt Ltd</Text>
          </div>
        )}
      </Dialog>
    </PeopleFrame>
  );
}

/* ================================================================== PPL-07 import */

export const SAMPLE_IMPORT: ImportRow[] = [
  { row: 2, code: 'KF-0261', name: 'Harini Suresh', pan: 'BHDPS4410K', manager: 'KF-0001', joined: '01 Oct 2026' },
  { row: 3, code: 'KF-0262', name: 'Farook Basha', pan: 'CFBPB8812', manager: 'KF-0001', joined: '01 Oct 2026' },
  { row: 4, code: 'KF-0142', name: 'Arjun K', pan: 'AKDPK4821M', manager: 'KF-0001', joined: '01 Oct 2026' },
  { row: 5, code: 'KF-0263', name: '', pan: '', manager: 'KF-9999', joined: '1/10/26' },
  { row: 6, code: 'KF-0264', name: 'Leela Prasad', pan: 'DLPPP2231R', manager: 'KF-0261', joined: '05 Oct 2026' },
];
/** People already in the company that an import is checked against. */
const IMPORT_EXISTING = [
  { code: 'KF-0001', name: 'Divya Raghunathan', pan: 'ABCPR1234K' },
  { code: 'KF-0142', name: 'Arjun Kulkarni', pan: 'AKDPK4821M' },
];
const IMPORT_FIELDS = ['Employee code', 'Name', 'PAN', 'Manager code', 'Joining date', 'Department', 'Mobile', "Don't import"];
const REQUIRED_FIELDS = ['Name', 'Joining date'];
const FILE_COLUMNS: { column: string; sample: string; field: string }[] = [
  { column: 'Emp No', sample: 'KF-0261', field: 'Employee code' },
  { column: 'Full Name', sample: 'Harini Suresh', field: 'Name' },
  { column: 'PAN No', sample: 'BHDPS4410K', field: 'PAN' },
  { column: 'Reports To', sample: 'KF-0001', field: 'Manager code' },
  { column: 'DOJ', sample: '01 Oct 2026', field: 'Joining date' },
  { column: 'Dept', sample: 'Quality', field: 'Department' },
  { column: 'Personal Mobile', sample: '98401 22871', field: "Don't import" },
];
/** Problems that can be fixed here, without uploading again. */
const FIXABLE: Record<string, keyof ImportRow> = { Name: 'name', PAN: 'pan', 'Manager code': 'manager', 'Joining date': 'joined' };

// PPL-07
export function EmployeeImportWizard({ current = 'upload', rows: initialRows = SAMPLE_IMPORT, fileLoaded = current !== 'upload' }: { current?: string; rows?: ImportRow[]; fileLoaded?: boolean }) {
  const [hasFile, setHasFile] = useState(fileLoaded);
  const [mapping, setMapping] = useState<Record<string, string>>(Object.fromEntries(FILE_COLUMNS.map((c) => [c.column, c.field])));
  const [edits, setEdits] = useState<Record<number, Partial<ImportRow>>>({});
  const [checked, setChecked] = useState<ImportRow[]>(initialRows);
  const rows = initialRows.map((r) => ({ ...r, ...edits[r.row] }));
  const issues = validateImport(checked, IMPORT_EXISTING.map((p) => p.code), IMPORT_EXISTING);
  const bad = new Set(issues.map((i) => i.row));
  const ready = checked.filter((r) => !bad.has(r.row));
  const nameOf = (code: string) => IMPORT_EXISTING.find((p) => p.code === code)?.name ?? checked.find((r) => r.code === code)?.name;
  const unmatched = REQUIRED_FIELDS.filter((f) => !Object.values(mapping).includes(f));
  const edit = (row: number, key: keyof ImportRow, v: string) => setEdits({ ...edits, [row]: { ...edits[row], [key]: v } });
  const byRow = [...bad].map((row) => ({ row, person: checked.find((r) => r.row === row)!, list: issues.filter((i) => i.row === row) }));
  const joinDates = [...new Set(ready.map((r) => r.joined))].join(' and ');
  return (
    <PeopleFrame active="Import">
      <PageHeader title="Import employees" description="Upload a CSV or Excel file. Nothing is saved until you import the rows that pass." actions={<Button icon={Download}>Download template</Button>} />
      <Stepper
        title="Employee import"
        defaultCurrent={current}
        finishLabel={`Import ${ready.length} ${ready.length === 1 ? 'employee' : 'employees'}`}
        continueBlocked={!hasFile ? 'Upload a file first' : unmatched.length ? `Match ${unmatched.join(' and ')} first` : undefined}
        onSaveAndExit={() => {}}
        review={{
          description: 'Check what happens before you import.',
          note: `${ready.length} ${ready.length === 1 ? 'employee is' : 'employees are'} added. They appear in the Directory and on the Onboarding board${joinDates ? ` (joining ${joinDates})` : ''}. ${bad.size} ${bad.size === 1 ? 'row is' : 'rows are'} skipped.`,
        }}
        steps={[
          {
            id: 'upload',
            title: 'Upload file',
            summary: hasFile ? `kaveri-joiners-oct.xlsx · ${initialRows.length} rows · Kaveri Foods Pvt Ltd` : 'No file yet',
            content: (
              <div className="yx-ppl__form">
                <FormField label="Legal entity" required helper="New people join this entity and get codes in its series (KF).">
                  <Select options={[{ value: 'kf', label: 'Kaveri Foods Pvt Ltd' }, { value: 'tn', label: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' }]} value="kf" onChange={() => {}} />
                </FormField>
                <FileUpload
                  upload={async () => {}}
                  accept={['.csv', '.xlsx']}
                  maxSize={10 * 1024 * 1024}
                  multiple={false}
                  defaultItems={fileLoaded ? [{ id: 'f1', file: new File(['x'], 'kaveri-joiners-oct.xlsx'), status: 'done', progress: 100 }] : []}
                  onItemsChange={(items) => setHasFile(items.some((i) => i.status === 'done'))}
                />
                {hasFile && <Text size="sm" tone="secondary" as="p">{initialRows.length} rows found.</Text>}
                <Text size="sm" tone="secondary" as="p">
                  Leave Employee code blank and the next code in the KF series is given.
                </Text>
              </div>
            ),
          },
          {
            id: 'map',
            title: 'Match columns',
            summary: `${Object.values(mapping).filter((f) => f !== "Don't import").length} columns imported · ${Object.values(mapping).filter((f) => f === "Don't import").length} left out`,
            content: (
              <div className="yx-ppl__stack">
                {unmatched.length > 0 ? (
                  <InlineAlert tone="warning">Match a column to {unmatched.join(' and ')}. These are required.</InlineAlert>
                ) : (
                  <Text size="sm" tone="secondary" as="p">All required fields are matched.</Text>
                )}
                <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Column matches">
                  <table className="yx-ppl__impact">
                    <thead>
                      <tr>
                        <th scope="col">Column in your file</th>
                        <th scope="col">YukthiX field</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FILE_COLUMNS.map((c) => (
                        <tr key={c.column}>
                          <td>
                            <span className="yx-ppl__type">
                              <span>{c.column}</span>
                              <span className="yx-ppl__sub">e.g. {c.sample}</span>
                            </span>
                          </td>
                          <td>
                            <Select aria-label={`Field for ${c.column}`} size="sm" options={IMPORT_FIELDS.map((f) => ({ value: f, label: f }))} value={mapping[c.column]} onChange={(v) => v && setMapping({ ...mapping, [c.column]: v })} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ),
          },
          {
            id: 'validate',
            title: 'Check rows',
            summary: `${ready.length} rows ready · ${bad.size} rows skipped`,
            content: (
              <div className="yx-ppl__stack">
                <InlineAlert tone={issues.length ? 'warning' : 'success'} title={issues.length ? `${ready.length} of ${checked.length} rows are ready` : 'All rows are ready'}>
                  {issues.length ? 'Rows with problems are skipped. Fix them here and check again, or fix your file and upload it again.' : 'Import when you are ready.'}
                </InlineAlert>
                {byRow.length > 0 && (
                  <Card title={`Needs fixing (${byRow.length})`}>
                    <div className="yx-ppl__stack">
                      <StatusChecklist
                        label="Rows with problems"
                        rows={byRow.map(
                          ({ row, person, list }): ChecklistRow => ({
                            id: `r${row}`,
                            title: `Row ${row} · ${person.name || 'No name'}`,
                            status: list.some((i) => i.field === 'Already an employee') ? 'Skipped' : 'Fix needed',
                            note: (
                              <div className="yx-ppl__stack">
                                {list.map((i) => (
                                  <div key={i.field}>
                                    <strong>{i.field}:</strong> {i.message}
                                    {FIXABLE[i.field] && (
                                      <TextField
                                        size="sm"
                                        aria-label={`${i.field} for row ${row}`}
                                        placeholder={i.field === 'Joining date' ? '01 Oct 2026' : i.field === 'PAN' ? 'ABCDE1234F' : i.field === 'Manager code' ? 'KF-0001' : 'Full name'}
                                        value={String(rows.find((r) => r.row === row)?.[FIXABLE[i.field]] ?? '')}
                                        onChange={(v) => edit(row, FIXABLE[i.field], v)}
                                      />
                                    )}
                                  </div>
                                ))}
                              </div>
                            ),
                          }),
                        )}
                      />
                      <div className="yx-ppl__row">
                        <Button onClick={() => setChecked(rows)}>Check again</Button>
                        <Button icon={FileSpreadsheet}>Download rows with problems</Button>
                      </div>
                    </div>
                  </Card>
                )}
                <Card title={`Ready to import (${ready.length})`}>
                  <StatusChecklist
                    label="Rows ready to import"
                    rows={ready.map(
                      (r): ChecklistRow => ({
                        id: `ok${r.row}`,
                        title: r.name,
                        status: 'Ready',
                        note: `${r.code || 'Next code in series'} · joins ${r.joined} · ${IMPORT_EXISTING.some((p) => p.code === r.manager) ? `manager ${nameOf(r.manager)} (${r.manager})` : `manager is in this file (${nameOf(r.manager)})`}`,
                      }),
                    )}
                  />
                </Card>
              </div>
            ),
          },
        ]}
      />
    </PeopleFrame>
  );
}

/* ================================================================== PPL-09 restructure */

type RestructureAction = 'merge' | 'close' | 'demerge';
const FROM_ENTITY = 'Kaveri Foods Pvt Ltd (Tamil Nadu)';
const INTO_ENTITY = 'Kaveri Foods Pvt Ltd';
/** Who is in the old entity, by location and department. */
const MOVE_LOCATIONS: Record<string, number> = { 'Hosur plant': 64, 'Chennai office': 32 };
const MOVE_DEPTS: [string, number][] = [['Operations', 40], ['Quality', 22], ['Sales', 18], ['Finance', 8], ['People', 4], ['Engineering', 4]];
const TRANSFER_DEFAULTS: { key: string; label: string; options: string[] }[] = [
  { key: 'leave', label: 'Leave balance', options: ['Carry over', 'Encash at old entity', 'Lapse'] },
  { key: 'service', label: 'Service continuity', options: ['Continue from original joining date', 'Restart'] },
  { key: 'code', label: 'Employee code', options: ['Keep', 'New code in the target series'] },
  { key: 'fnf', label: 'Settlement at old entity', options: ['None: amounts move over', 'Full and final settlement'] },
  { key: 'salary', label: 'Salary structure', options: ['Keep', 'Assign new'] },
];
const INITIAL_OVERRIDES = [
  { id: 'o1', name: 'Manoj Patil', why: 'Retiring 31 Oct 2026', choice: 'Full and final settlement at old entity' },
  { id: 'o2', name: 'Gurpreet Kaur', why: 'On maternity leave', choice: 'Moves on return (16 Nov 2026)' },
  { id: 'o3', name: 'Karthik Iyer', why: 'On probation until 12 Dec 2026', choice: 'Probation carries over' },
];

// PPL-09
export function RestructureWizard({ current = 'scope', payrollLocked = true, confirmOpen = false }: { current?: string; payrollLocked?: boolean; confirmOpen?: boolean }) {
  const [confirm, setConfirm] = useState(confirmOpen);
  const [step, setStep] = useState(current);
  const [action, setAction] = useState<RestructureAction>('merge');
  const [effective, setEffective] = useState<Date | null>(new Date(2026, 9, 1));
  const [locations, setLocations] = useState<string[]>(['Chennai office']);
  const [defaults, setDefaults] = useState<Record<string, string>>(Object.fromEntries(TRANSFER_DEFAULTS.map((o) => [o.key, o.options[0]])));
  const [overrides, setOverrides] = useState(INITIAL_OVERRIDES);
  const [addOpen, setAddOpen] = useState(false);
  const moving = action === 'demerge' ? locations.reduce((n, l) => n + (MOVE_LOCATIONS[l] ?? 0), 0) : 96;
  const date = effective ? formatDate(effective) : 'the effective date';
  const heading =
    action === 'merge' ? `Merge ${FROM_ENTITY} into ${INTO_ENTITY}` : action === 'close' ? `Close ${FROM_ENTITY}` : `Move part of ${FROM_ENTITY} to ${INTO_ENTITY}`;
  const closes = action !== 'demerge';
  const beforeRows: ChecklistRow[] = [
    { id: 'b1', title: `${moving} employments ready to move`, status: 'Ready' },
    { id: 'b2', title: '3 open onboarding and exit journeys will move with them', status: 'Ready' },
    { id: 'b3', title: '11 approvals and 2 cases will move with them', status: 'Ready' },
    {
      id: 'b4',
      title: 'Last payroll period (September 2026) run and locked',
      owner: 'Suresh Pillai',
      status: payrollLocked ? 'Done' : 'Blocked',
      note: payrollLocked ? undefined : 'September payroll is approved but not locked.',
      action: payrollLocked ? undefined : <Button size="sm">Open September payroll</Button>,
    },
  ];
  const afterRows: ChecklistRow[] = [
    { id: 'a1', title: `Employments move to ${INTO_ENTITY} on ${date}`, owner: 'Automatic', status: 'On approval' },
    { id: 'a2', title: 'Final PF and ESI challans for September filed', owner: 'Payroll', status: 'On approval' },
    { id: 'a3', title: 'TDS return for Q2 (Jul–Sep) filed', owner: 'Payroll', status: 'On approval' },
    { id: 'a4', title: 'Part-year Form 16 from the old entity for moved staff', owner: 'Payroll', status: 'On approval' },
    ...(closes
      ? [
          { id: 'a5', title: 'Tamil Nadu professional tax final return filed', owner: 'Payroll', status: 'On approval' },
          { id: 'a6', title: 'PF, ESI and PT registrations surrendered', owner: 'HR', status: 'On approval' },
          { id: 'a7', title: 'Entity marked closed; history kept', owner: 'Automatic', status: 'On approval' },
        ]
      : []),
  ];
  const blocked = payrollLocked ? undefined : 'Lock September payroll first';
  // Override rows (long badge and two buttons) need cards below 1024 px.
  const narrow = useNarrow(1023);
  const overrideActions = (id: string) => (
    <span className="yx-ppl__row">
      <Button size="sm">Edit</Button>
      <Button size="sm" onClick={() => setOverrides(overrides.filter((x) => x.id !== id))}>
        Remove
      </Button>
    </span>
  );
  return (
    <PeopleFrame active="Restructure">
      <PageHeader title={heading} description={`Moves ${moving} employments with one preview and one approval${closes ? ', then closes the old entity' : ''}.`} />
      <Stepper
        title="Restructure"
        current={step}
        onCurrentChange={setStep}
        finishLabel="Send for approval"
        finishBlocked={blocked}
        onFinish={() => setConfirm(true)}
        onSaveAndExit={() => {}}
        review={{ description: closes ? 'The old entity closes only when nothing is left open.' : 'Check who moves before you send this for approval.' }}
        steps={[
          {
            id: 'scope',
            title: 'What moves',
            summary: `${moving} people · ${action === 'demerge' ? locations.join(', ') : 'Hosur plant and Chennai office'} · into ${INTO_ENTITY} · ${date}`,
            content: (
              <div className="yx-ppl__form">
                <FormField label="Action" required>
                  <RadioGroup
                    value={action}
                    onChange={(v) => setAction(v as RestructureAction)}
                    options={[
                      { value: 'merge', label: 'Merge into another entity' },
                      { value: 'close', label: 'Close the entity (exits or transfers)' },
                      { value: 'demerge', label: 'Move part of the entity to another one' },
                    ]}
                  />
                </FormField>
                <FormField label="From entity" required>
                  <Select options={[{ value: 'tn', label: `${FROM_ENTITY} · 96 people` }]} value="tn" onChange={() => {}} />
                </FormField>
                <FormField label={action === 'close' ? 'Transfer people to' : 'Into entity'} required>
                  <Select options={[{ value: 'ka', label: `${INTO_ENTITY} · 152 people` }]} value="ka" onChange={() => {}} />
                </FormField>
                {action === 'demerge' && (
                  <FormField label="Who moves" required helper="Everyone at the chosen locations moves.">
                    <MultiSelect options={Object.keys(MOVE_LOCATIONS).map((l) => ({ value: l, label: `${l} · ${MOVE_LOCATIONS[l]} people` }))} value={locations} onChange={setLocations} />
                  </FormField>
                )}
                <FormField label="Effective date" required>
                  <DatePicker value={effective} onChange={setEffective} />
                </FormField>
                {action !== 'demerge' && (
                  <Card title={`Who moves (${moving})`}>
                    <dl className="yx-ppl__dl">
                      {Object.entries(MOVE_LOCATIONS).map(([l, n]) => (
                        <div key={l} className="yx-ppl__dl-row"><dt>{l}</dt><dd>{n} people</dd></div>
                      ))}
                      {MOVE_DEPTS.map(([d, n]) => (
                        <div key={d} className="yx-ppl__dl-row"><dt>{d}</dt><dd>{n} people</dd></div>
                      ))}
                    </dl>
                  </Card>
                )}
                <InlineAlert tone="info" title={`${overrides.length} people need their own decision`} actions={<Button size="sm" onClick={() => setStep('options')}>Review overrides</Button>}>
                  {overrides.map((o) => `${o.name} (${o.why.charAt(0).toLowerCase()}${o.why.slice(1)})`).join(', ')}.
                </InlineAlert>
              </div>
            ),
          },
          {
            id: 'options',
            title: 'Transfer options',
            summary: `${TRANSFER_DEFAULTS.map((o) => `${o.label}: ${defaults[o.key].charAt(0).toLowerCase()}${defaults[o.key].slice(1)}`).join(' · ')} · ${overrides.length} overrides`,
            content: (
              <div className="yx-ppl__stack">
                <Text as="p">Company defaults are selected for everyone. Change a default, or give one person their own option with a reason.</Text>
                <div className="yx-ppl__form">
                  {TRANSFER_DEFAULTS.map((o) => (
                    <FormField key={o.key} label={o.label}>
                      <Select options={o.options.map((v) => ({ value: v, label: v }))} value={defaults[o.key]} onChange={(v) => v && setDefaults({ ...defaults, [o.key]: v })} />
                    </FormField>
                  ))}
                </div>
                <Card
                  title={`Per-person overrides (${overrides.length})`}
                  actions={
                    <Button size="sm" icon={Plus} onClick={() => setAddOpen(true)}>
                      Add override
                    </Button>
                  }
                >
                  {narrow ? (
                    <ul className="yx-ppl__cards" aria-label="Per-person overrides">
                      {overrides.map((o) => (
                        <li key={o.id} className="yx-ppl__rcard">
                          <span className="yx-ppl__rcard-name">{o.name}</span>
                          <span className="yx-ppl__sub">{o.why}</span>
                          <Badge tone="neutral">{o.choice}</Badge>
                          {overrideActions(o.id)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                  <StatusChecklist
                    label="Per-person overrides"
                    rows={overrides.map(
                      (o): ChecklistRow => ({
                        id: o.id,
                        title: o.name,
                        note: o.why,
                        status: o.choice,
                        action: overrideActions(o.id),
                      }),
                    )}
                  />
                  )}
                </Card>
              </div>
            ),
          },
          {
            id: 'close',
            title: closes ? 'Close the old entity' : 'Checks',
            status: payrollLocked ? undefined : 'error',
            statusNote: payrollLocked ? undefined : 'Last payroll not locked',
            summary: payrollLocked ? 'All checks pass' : 'Blocked: lock September payroll first',
            content: (
              <div className="yx-ppl__stack">
                <Card title="Before you send">
                  <StatusChecklist label="Checks before sending" rows={beforeRows} />
                </Card>
                <Card title="After approval">
                  <StatusChecklist label="What happens after approval" rows={afterRows} />
                </Card>
              </div>
            ),
          },
          {
            id: 'letters',
            title: 'Letters',
            summary: `${moving} transfer letters · bulk issue after approval`,
            content: (
              <div className="yx-ppl__form">
                <FormField label="Letter template">
                  <Select options={[{ value: 'tr', label: 'Transfer letter, inter-entity v2' }]} value="tr" onChange={() => {}} />
                </FormField>
              </div>
            ),
          },
        ]}
      />
      <TypeToConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Send “${heading}” for approval?`}
        consequence={`Once approved, ${moving} employments move on ${date}${closes ? ' and the old entity is closed. A closed entity can’t be reopened' : ''}; later fixes are individual changes.`}
        confirmLabel="Send for approval"
        objectName="KAVERI TN CLOSE OCT 2026"
        onConfirm={() => setConfirm(false)}
      />
      <Dialog open={addOpen} onOpenChange={setAddOpen} title="Add an override" size="md" footer={<><Button onClick={() => setAddOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => setAddOpen(false)}>Add override</Button></>}>
        <div className="yx-ppl__form">
          <FormField label="Person" required>
            <PersonPicker people={[{ id: 'p1', name: 'Selvi Perumal', role: 'Warehouse Associate', department: 'Hosur plant' }, { id: 'p2', name: 'Murugan K', role: 'Warehouse Associate', department: 'Hosur plant' }]} value={null} onChange={() => {}} />
          </FormField>
          <FormField label="Option" required>
            <Select options={TRANSFER_DEFAULTS.flatMap((o) => o.options.slice(1).map((v) => ({ value: `${o.key}:${v}`, label: `${o.label}: ${v}` })))} value={null} onChange={() => {}} placeholder="Choose an option" />
          </FormField>
          <FormField label="Reason" required>
            <TextArea rows={2} />
          </FormField>
        </div>
      </Dialog>
    </PeopleFrame>
  );
}

/* ================================================================== PPL-10 continuity checklist */

// PPL-10
export function ContinuityChecklistPanel({ allDone = false, today }: { allDone?: boolean; today: Date }) {
  const [open, setOpen] = useState(true);
  const st = (s: string) => (allDone ? 'Done' : s);
  const rows: ChecklistRow[] = [
    { id: 'u', title: 'PF UAN transfer (same UAN, Form 13 or EPFO auto-transfer)', owner: 'Payroll · Suresh Pillai', due: new Date(2026, 9, 20), status: st('In progress'), note: 'Claim ID 13-TN-2026-88412 submitted 6 Oct' },
    { id: 'e', title: 'ESI IP number carried (same IP)', owner: 'Payroll', due: new Date(2026, 9, 10), status: st('Done') },
    { id: 'f', title: 'Form 12B auto-filled from old employment YTD (₹4,12,000 income, ₹18,400 TDS)', owner: 'Payroll', due: new Date(2026, 9, 10), status: st('Done') },
    { id: 'd', title: 'Declarations and proofs copied to the new tax workspace', owner: 'Payroll', due: new Date(2026, 9, 15), status: st('Pending') },
    { id: 'l', title: 'Salary advance ADV-2026-0031 re-parented (option: no F&F)', owner: 'Finance · Deepa Rao', due: new Date(2026, 9, 10), status: st('Pending') },
    { id: 'v', title: 'Leave-ledger transfer entries (out 11.5 PL, in 11.5 PL)', owner: 'HR', due: new Date(2026, 9, 5), status: st('Done') },
    { id: 'g', title: 'Gratuity: service continues, one payout at final exit', owner: 'Payroll', status: st('Done') },
  ];
  const open_ = rows.filter((r) => r.status !== 'Done').length;
  return (
    <PeopleFrame active="Change action">
      <ObjectHeader name="Inter-entity transfer · Rahul Sharma" icon={Pencil} secondary="Kaveri Foods Pvt Ltd → Kaveri Foods Pvt Ltd (Tamil Nadu) · effective 5 Oct 2026" status={<StatusBadge status="Approved" />} actions={<Button onClick={() => setOpen(true)}>Continuity checklist</Button>} />
      <Drawer open={open} onOpenChange={setOpen} title="Continuity checklist" subtitle={open_ ? `${open_} items open · shown in payroll pre-flight` : 'All items done'} footer={<Button onClick={() => setOpen(false)}>Close</Button>}>
        <div className="yx-ppl__stack">
          {open_ > 0 && <InlineAlert tone="warning">Open items show in October payroll pre-flight for the new entity.</InlineAlert>}
          <StatusChecklist label="Continuity items" rows={rows} today={today} />
        </div>
      </Drawer>
    </PeopleFrame>
  );
}

