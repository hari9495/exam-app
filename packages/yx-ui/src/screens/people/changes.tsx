// PPL-04 Change action · PPL-05 Scheduled changes · PPL-06 Bulk changes wizard · PPL-07 Employee import
// PPL-09 Bulk transfer / restructure wizard (P06 §4.3–4.4, §7; M01 §3.3; P01 YX-ORG-17 / 22).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FilterToggle } from '../../components/filter-toggle';
import { Download, Eye, EyeOff, FileSpreadsheet, FileText, Pencil, Plus, XCircle } from 'lucide-react';
import { Button } from '../../components/button';
import { Card, PageHeader } from '../../components/shell';
import { Drawer } from '../../components/drawer';
import { Badge } from '../../components/display';
import { EmptyState, ErrorState, NoAccessState, InlineAlert } from '../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors, useTooEarly } from '../../components/field';
import { PlainTable } from '../../components/plain-table';
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
import { DocumentViewer } from '../../components/document';
import { Icon, Text } from '../../components/foundations';
import { formatDate, formatINR } from '../../lib/format';
import { dayKey } from '../../lib/dates';
import { dateLabel, errorText, useRun } from '../org/org-kit';
import { changeInput, DOTTED_TYPES, EMPTY_CHANGE, FIELD_LABEL, FIELDS, forEntity, HOURS_TYPES, kindLabel, Lines, monthName, moneyLine, MOVE, moveInput, moveNeeds, orList, PAY_TYPES, RAISABLE, requiredFor, routeLine, SKILL_CLASS_LABEL, TYPE_LABEL, type ChangeDraft, type ChangeDrawerProps, type ChangeField, type Raisable } from '../history/history-kit';
import type { ChangeInput, Impact, ImpactLine, MoveHandlers, MoveInput, PersonOption, PromotionRule, TransferOptions } from '../history/types';
import { LiveIncrementWizard, type LiveIncrement } from './increment';
import { LiveEmployeeImport, type LiveImport, SavedImportNotice } from './import';
import { LiveRestructureWizard, type LiveRestructure } from './restructure';
import { applyIncrement, daysBetween, validateImport, withinWindow, type ImportRow, type Persona } from './people-logic';
import { GRADE_BANDS, INCREMENT_LEFT_OUT, INCREMENT_LETTER_PDF, INCREMENT_PCT, INCREMENT_ROWS, SCHEDULED } from './people-data';
import { exportCsv, ListSkeleton, PeopleFrame, Segment, StatusChecklist, type ChecklistRow } from './people-kit';

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
  // As the live dry run reports a one-person move (founder 27 Oct 2026: every job fact that changes).
  'Inter-entity transfer': [
    { fact: 'Legal entity', now: 'Kaveri Foods Pvt Ltd', next: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' },
    { fact: 'Employee code', now: 'KF-0088', next: 'KF-0088 (kept)' },
    { fact: 'Location', now: 'Bengaluru head office', next: 'Chennai office' },
    { fact: 'Employment type', now: 'Fixed-term (plant)', next: 'Permanent' },
    { fact: 'PF', now: 'Same UAN', next: 'Same UAN · transfer tracked on the checklist' },
    { fact: 'Tax', now: 'Pay and tax so far this year', next: 'Form 12B carried into the new entity' },
    { fact: 'Leave balance', now: '11.5 days PL', next: 'Carried over' },
    { fact: 'Continuous service', now: '—', next: 'Continues from 14 Jul 2019' },
    { fact: 'Salary structure', now: '—', next: 'Kept' },
  ],
};

function approvalSteps(kind: string, persona: Persona): ApprovalStep[] {
  const raiser = persona === 'mgr' ? 'Divya Raghunathan' : 'Lakshmi Venkatesan';
  // A move to another entity is a one-person restructure: another HR person approves it in People › Restructure.
  if (kind === 'Inter-entity transfer')
    return [
      { id: 'c0', label: 'Raised', status: 'done', approver: raiser, at: new Date(2026, 8, 29, 9, 40) },
      { id: 'c1', label: 'HR, in People › Restructure', status: 'current', approver: 'Priya Nair' },
    ];
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
/** Half-filled changes the raiser saved ("Save draft"); only they see them. */
const DRAFTS = [{ id: 'd1', name: 'Rohit Menon', kind: 'Transfer', savedAt: new Date(2026, 9, 20) }];
type DraftRow = { id: string; name: string; kind: string | null; savedAt: Date };
function DraftList({ drafts, onOpen }: { drafts: DraftRow[]; onOpen?: (id: string) => void }) {
  if (!drafts.length) return null;
  return (
    <StatusChecklist
      label="Your drafts"
      rows={drafts.map(
        (dr): ChecklistRow => ({
          id: dr.id,
          title: `${dr.name}${dr.kind ? ` · ${dr.kind}` : ''}`,
          status: 'Draft',
          note: `Saved ${formatDate(dr.savedAt)}`,
          action: (
            <Button size="sm" onClick={() => onOpen?.(dr.id)}>
              Open
            </Button>
          ),
        }),
      )}
    />
  );
}
/** Changes already raised and waiting for someone. */
const IN_PROGRESS = [
  { id: 'w1', name: 'Nisha Rao', kind: 'Manager change', effective: new Date(2026, 10, 2), waitingFor: 'Karthik Subramanian', mine: true },
  { id: 'w2', name: 'Aisha Khan', kind: 'Manager change', effective: new Date(2026, 9, 12), waitingFor: 'Lakshmi Venkatesan', mine: false },
  // Founder 28 Oct 2026: an inter-entity transfer sent from here waits too; Open goes to People › Restructure.
  { id: 'w3', name: 'Rahul Sharma', kind: 'Inter-entity transfer', effective: new Date(2026, 10, 1), waitingFor: 'Karthik Subramanian or Lakshmi Venkatesan', mine: false },
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
  /** What a promotion must change (Settings › Job changes): designation or grade (default), both, or one of them. */
  promotionMustChange?: 'either' | 'both' | 'grade' | 'designation';
  live?: LiveChangeAction;
}

/** The live app's Change action page (design audit step 3): pick a person, start the change; what waits for approval. */
export interface LiveChangeAction {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry: () => void;
  people: { id: string; name: string; role: string; department: string }[];
  /** `note`: who it waits for ("waiting for Karthik Subramanian"), else when it was raised. */
  waiting: { id: string; name: string; kind: string; effective: Date; note: string; canOpen: boolean }[];
  /** The viewer's own saved drafts. */
  drafts?: DraftRow[];
  onOpenDraft?: (id: string) => void;
  onStart: (personId: string) => void;
  onOpenWaiting: (id: string) => void;
  /** The change form and the review drawer the page opens. */
  children?: ReactNode;
}

function LiveChangeActionPage({ persona, live }: { persona: Persona; live: LiveChangeAction }) {
  const mgr = persona === 'mgr';
  const [whoId, setWhoId] = useState<string | null>(null);
  const whoEarly = useTooEarly(!whoId ? [{ fieldId: 'ca-who', message: 'Choose the person.' }] : []);
  return (
    <PeopleFrame active="Change action" persona={persona}>
      <PageHeader title="Change action" description={mgr ? 'Raise a promotion, transfer or manager change for someone in your team.' : 'Raise a change for one person. For many people at once, use Bulk changes.'} />
      {live.state === 'no-access' ? (
        <NoAccessState what="the changes" grantedBy="your HR admin" />
      ) : live.state === 'error' ? (
        <ErrorState title="We couldn't load the changes" description="Check your connection and try again." onRetry={live.onRetry} />
      ) : (
        <div className="yx-ppl__grid2">
          <Card title="Start a change">
            <div className="yx-ppl__stack">
              <FormField id="ca-who" label="Person" required error={whoEarly.errorOf('ca-who')}>
                <PersonPicker people={live.people.map((p) => ({ id: p.id, name: p.name, role: p.role, department: p.department }))} value={whoId} onChange={setWhoId} placeholder="Find a person" />
              </FormField>
              <div>
                <Button variant="primary" onClick={() => !whoEarly.stop() && whoId && live.onStart(whoId)}>
                  Start change
                </Button>
              </div>
              <DraftList drafts={live.drafts ?? []} onOpen={live.onOpenDraft} />
            </div>
          </Card>
          <Card title={`Waiting for approval (${live.waiting.length})`}>
            {live.state === 'loading' ? (
              <ListSkeleton label="Loading changes waiting for approval" rows={2} />
            ) : live.waiting.length ? (
              <StatusChecklist
                label="Changes waiting for approval"
                rows={live.waiting.map(
                  (w): ChecklistRow => ({
                    id: w.id,
                    title: `${w.name} · ${w.kind}`,
                    status: 'Pending approval',
                    note: `Effective ${formatDate(w.effective)} · ${w.note}`,
                    action: w.canOpen ? (
                      <Button size="sm" onClick={() => live.onOpenWaiting(w.id)}>
                        Open
                      </Button>
                    ) : undefined,
                  }),
                )}
              />
            ) : (
              <Text tone="secondary">Nothing is waiting.</Text>
            )}
          </Card>
        </div>
      )}
      {live.children}
    </PeopleFrame>
  );
}

// PPL-04
export function ChangeActionSheet(props: ChangeActionSheetProps) {
  return props.live ? <LiveChangeActionPage persona={props.persona} live={props.live} /> : <SampleChangeActionSheet {...props} />;
}

function SampleChangeActionSheet({ persona, kind: kindProp, effective: effectiveProp, today, payGrant = false, payrollProcessedTo, startOpen = true, promotionMustChange = 'either' }: ChangeActionSheetProps) {
  const mgr = persona === 'mgr';
  const people = CHANGE_PEOPLE.filter((p) => !mgr || p.mine);
  const [open, setOpen] = useState(startOpen);
  const [whoId, setWhoId] = useState<string | null>(!startOpen ? null : kindProp === 'Transfer' || kindProp === 'Inter-entity transfer' ? 'rs' : 'ak');
  const whoEarly = useTooEarly(!whoId ? [{ fieldId: 'ca-who', message: 'Choose the person.' }] : []);
  const waiting = IN_PROGRESS.filter((w) => !mgr || w.mine);
  const sample = sampleChange({ persona, kind: kindProp, effective: effectiveProp, today, payGrant, payrollProcessedTo, promotionMustChange, whoId: whoId ?? 'ak' });

  return (
    <PeopleFrame active="Change action" persona={persona}>
      <PageHeader title="Change action" description={mgr ? 'Raise a promotion, transfer or manager change for someone in your team.' : 'Raise a change for one person. For many people at once, use Bulk changes.'} />
      <div className="yx-ppl__grid2">
        <Card title="Start a change">
          <div className="yx-ppl__stack">
            <FormField id="ca-who" label="Person" required error={whoEarly.errorOf('ca-who')}>
              <PersonPicker people={people.map((p) => ({ id: p.id, name: p.name, role: p.role, department: `${p.team} · ${p.location}` }))} value={whoId} onChange={setWhoId} placeholder="Find a person" />
            </FormField>
            <div>
              <Button variant="primary" onClick={() => !whoEarly.stop() && setOpen(true)}>
                Start change
              </Button>
            </div>
            <DraftList drafts={DRAFTS.filter(() => !mgr)} onOpen={() => setOpen(true)} />
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
      {open && <ChangeActionDrawer key={whoId ?? ''} {...sample} onClose={() => setOpen(false)} />}
    </PeopleFrame>
  );
}

/* ---- PPL-04 sample data for the stories: the same drawer the app uses, fed with Kaveri Foods examples ---- */

const S_ENTITY = 'le-kf';
const S_TN = 'le-tn';
const S_TYPE: Record<ChangeKind, Raisable | null> = { Promotion: 'promotion', Transfer: 'transfer', 'Inter-entity transfer': MOVE, 'Manager change': 'manager_change', 'Salary revision': 'salary_revision', 'Contract extension': null, 'Absence start': null };
const S_PEOPLE: PersonOption[] = CHANGE_PEOPLE.map((p) => ({ id: p.id, name: p.name, employeeCode: { ak: 'KF-0142', rm: 'KF-0157', rs: 'KF-0088' }[p.id] ?? null, legalEntityId: S_ENTITY, designation: p.role, department: p.team, location: p.location }));
const choice = (value: string, label: string, entities: string[] = []) => ({ value, label, entities });
/** Story impact rows as the API words them: job facts, then pay as "INR 690000". */
function sampleImpact(kind: ChangeKind, effective: string, showPay: boolean, retro: Impact['retro']): Impact {
  const rows = IMPACT[kind] ?? IMPACT.Promotion;
  const pay = rows.some((r) => r.fact === 'Annual CTC') ? [{ fact: 'Annual CTC', from: `INR ${CURRENT_CTC}`, to: 'INR 780000' }] : [];
  const facts = rows.filter((r) => r.fact !== 'Annual CTC' && (showPay || !/Payroll|Tax/.test(r.fact))).map((r) => ({ fact: r.fact, from: r.now, to: r.next }));
  return { effectiveDate: effective, facts, pay: showPay ? pay : pay.length ? 'hidden' : [], rebased: [], retro };
}
/** "2026-08", "2026-09", … from one date's month to another's. */
function monthsFrom(from: Date, to: Date) {
  const out: string[] = [];
  for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  return out;
}

function sampleChange(p: Pick<ChangeActionSheetProps, 'persona' | 'kind' | 'effective' | 'today' | 'payGrant' | 'payrollProcessedTo' | 'promotionMustChange'> & { whoId: string }): Omit<ChangeDrawerProps, 'onClose'> {
  const mgr = p.persona === 'mgr';
  const canPay = !mgr || Boolean(p.payGrant);
  const type = S_TYPE[p.kind];
  const eff = dayKey(p.effective);
  const today = dayKey(p.today);
  const retro: Impact['retro'] = eff < today ? { from: eff, months: monthsFrom(p.effective, p.today), processed: p.payrollProcessedTo ? monthsFrom(p.effective, p.payrollProcessedTo) : [] } : null;
  const values: ChangeDraft['values'] = type === 'promotion' ? { designationId: 'des-ql', gradeId: 'g-6' } : type === 'transfer' ? { locationId: 'loc-maa' } : type === MOVE ? { locationId: 'loc-maa', employmentTypeId: 'et-perm' } : {};
  const transfer: TransferOptions = { leave: 'carry', service: 'keep', code: 'keep', salary: 'keep' };
  const ok = async () => undefined;
  return {
    options: {
      people: S_PEOPLE.filter((x) => !mgr || CHANGE_PEOPLE.find((c) => c.id === x.id)?.mine),
      managers: S_PEOPLE,
      locations: [choice('loc-blr', 'Bengaluru head office', [S_ENTITY]), choice('loc-maa', 'Chennai office', [S_ENTITY, S_TN]), choice('loc-hsr', 'Hosur plant', [S_ENTITY])],
      departments: [choice('dep-qa', 'Quality'), choice('dep-sales', 'Sales')],
      designations: [choice('des-ql', 'Quality Lead'), choice('des-qe', 'Quality Engineer'), choice('des-ae', 'Account Executive')],
      grades: [choice('g-5', canPay ? 'G5 · ₹5,40,000 to ₹7,80,000' : 'G5'), choice('g-6', canPay ? 'G6 · ₹6,80,000 to ₹9,60,000' : 'G6')],
      employmentTypes: [choice('et-perm', 'Permanent'), choice('et-plant', 'Fixed-term (plant)', [S_ENTITY])],
      costCentres: [],
      canPay,
      retroLimit: '2026-04-01',
      today,
      ...(mgr ? { types: ['promotion', 'transfer', 'redesignation', 'manager_change'] as ChangeInput['changeType'][] } : {}),
      promotionMustChange: { [S_ENTITY]: (p.promotionMustChange ?? 'either') as PromotionRule },
    },
    employeeId: p.whoId,
    initial: type ? { ...EMPTY_CHANGE, employeeId: p.whoId, changeType: type, effectiveDate: p.effective, values, pay: type === 'promotion' && canPay ? '780000' : '', reason: REASON[p.kind] ?? '', entityId: type === MOVE ? S_TN : null, transfer: type === MOVE ? transfer : null } : undefined,
    onPreview: async () => sampleImpact(p.kind, eff, canPay, retro),
    onSubmit: ok,
    onRoute: async () => (p.kind === 'Promotion' ? ['Karthik Subramanian', 'Lakshmi Venkatesan'] : ['Priya Nair']),
    onSaveDraft: ok,
    move: mgr
      ? undefined
      : {
          entities: [
            { value: S_ENTITY, label: 'Kaveri Foods Pvt Ltd' },
            { value: S_TN, label: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' },
          ],
          onDefaults: async () => ({ options: transfer, employeeCode: 'KF-0088', serviceFrom: '2019-07-14', current: { departmentId: 'dep-sales', designationId: 'des-ae', employmentTypeId: 'et-plant' } }),
          onPreview: async () => sampleImpact('Inter-entity transfer', eff, canPay, null),
          onSubmit: ok,
        },
  };
}

/* ---- PPL-04 change drawer: the one change form (founder Q3), on Change action, Job history, My team and the record ---- */

/** "Aug 2026 and Sep 2026". */
function monthList(keys: string[]) {
  const names = keys.map(monthName);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? '');
}
const payNumber = (v: string | null) => (v ? Number(v.replace(/^[A-Z]{3} /, '')) : NaN);

/** PPL-04 "What changes": what moves (Now / From the date), what stays folded away, then the warnings. */
export function ChangeImpact({ impact }: { impact: Impact }) {
  const narrow = useNarrow();
  type Row = ImpactLine & { money: boolean };
  const all: Row[] = [...impact.facts.map((l) => ({ ...l, money: false })), ...(impact.pay === 'hidden' ? [] : impact.pay).map((l) => ({ ...l, money: true }))];
  const value = (v: string | null, isMoney: boolean) => (isMoney ? moneyLine(v) : (v ?? '—'));
  const changed = all.filter((r) => r.from !== r.to);
  const same = all.filter((r) => r.from === r.to);
  return (
    <Card title={`What changes (${changed.length})`}>
      <div className="yx-ppl__stack">
        {changed.length === 0 ? (
          <Text as="p" tone="secondary">
            Nothing changes on that date: the values are already the same.
          </Text>
        ) : narrow ? (
          <ul className="yx-ppl__impact-list" aria-label="What changes">
            {changed.map((r) => (
              <li key={r.fact}>
                <span className="yx-ppl__impact-fact">{r.fact}</span>
                <span>
                  {value(r.from, r.money)} → <strong>{value(r.to, r.money)}</strong>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <PlainTable
            label="What changes"
            columns={[
              { key: 'fact', header: 'What changes', rowHeader: true, cell: (r: Row) => r.fact },
              { key: 'now', header: 'Now', cell: (r: Row) => value(r.from, r.money) },
              { key: 'next', header: `From ${dateLabel(impact.effectiveDate)}`, changed: () => true, cell: (r: Row) => value(r.to, r.money) },
            ]}
            rows={changed}
            getRowId={(r) => r.fact}
          />
        )}
        {same.length > 0 && (
          <details className="yx-ppl__done-fold">
            <summary>Stays the same ({same.length})</summary>
            <ul className="yx-ppl__impact-list" aria-label="Stays the same">
              {same.map((r) => (
                <li key={r.fact}>
                  <span className="yx-ppl__impact-fact">{r.fact}</span>
                  <span>{value(r.from, r.money)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        {impact.pay === 'hidden' && (
          <Text as="p" tone="secondary" size="sm">
            Pay changes too. Only people with pay access see the amounts.
          </Text>
        )}
        {impact.warnings?.map((w) => (
          <InlineAlert key={w} tone="warning" title="Check before you send">
            {w}
          </InlineAlert>
        ))}
        {impact.rebased.length > 0 && (
          <InlineAlert tone="warning" title={`${impact.rebased.length} later change${impact.rebased.length === 1 ? '' : 's'} will be recalculated`}>
            <ul className="yx-hist__rebased">
              {impact.rebased.map((r) => (
                <li key={r.changeId}>
                  <Text weight="medium">{`${TYPE_LABEL[r.changeType]} on ${dateLabel(r.effectiveDate)}`}</Text>
                  <Lines lines={r.facts} />
                  {r.pay === 'hidden' ? <Text tone="secondary" size="sm">Its pay is recalculated too.</Text> : r.pay.length > 0 && <Lines lines={r.pay} money />}
                </li>
              ))}
            </ul>
          </InlineAlert>
        )}
      </div>
    </Card>
  );
}

/** PPL-04 Retro: a past date. Months whose payroll is published get the design's "already processed" notice. */
export function RetroNotice({ retro }: { retro: NonNullable<Impact['retro']> }) {
  const done = retro.processed ?? [];
  return done.length ? (
    <InlineAlert tone="warning" title={`Payroll for ${monthList(done)} is already processed`}>
      Payslips stay as issued. The next payroll pays the difference as arrears. The old values are kept as superseded on the timeline.
    </InlineAlert>
  ) : (
    <InlineAlert tone="warning" title="This changes the past">
      {`Payroll will settle the difference for ${monthList(retro.months)} in the next run. Payslips already issued stay as they are.`}
    </InlineAlert>
  );
}

/** PPL-04: pick the type, the date and the new values; what changes shows as you fill it in; send it for approval. */
export function ChangeActionDrawer({ options, employeeId, initial, onPreview, onSubmit, onRoute, onSaveDraft, move, onClose }: ChangeDrawerProps) {
  const [draft, setDraft] = useState<ChangeDraft>(initial ?? { ...EMPTY_CHANGE, employeeId: employeeId ?? null });
  const [route, setRoute] = useState<string[] | null>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const { busy, error, run } = useRun();
  const set = (patch: Partial<ChangeDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const person = options.people.find((p) => p.id === draft.employeeId) ?? null;
  const moving = draft.changeType === MOVE;
  const [defaults, setDefaults] = useState<Awaited<ReturnType<MoveHandlers['onDefaults']>> | null>(null);
  // Required where the person's current one is only for the old entity; optional (it stays) otherwise.
  const needs = moving ? moveNeeds(defaults?.current ?? null, options, draft.entityId ?? null) : [];
  const rule: PromotionRule = (person?.legalEntityId && options.promotionMustChange?.[person.legalEntityId]) || 'either';
  const built = moving ? moveInput(draft, options, person?.legalEntityId ?? null, needs) : changeInput(draft, options, rule);
  const { input, errors } = built;
  const saveErrors = useSaveErrors(errors);
  const { errorOf } = saveErrors;
  // A move offers the new entity's locations and masters; every other change the person's own entity's.
  const entity = moving ? (draft.entityId ?? null) : (person?.legalEntityId ?? null);
  useEffect(() => {
    if (!moving || !draft.employeeId || !move) return;
    let current = true;
    move.onDefaults(draft.employeeId).then(
      (d) => {
        if (!current) return;
        setDefaults(d);
        setDraft((x) => (x.transfer ? x : { ...x, transfer: d.options }));
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moving, draft.employeeId]);
  const setOption = <K extends keyof TransferOptions>(k: K, v: TransferOptions[K]) => draft.transfer && set({ transfer: { ...draft.transfer, [k]: v } });
  const choices: Record<ChangeField, { value: string; label: string }[]> = useMemo(
    () => ({
      locationId: forEntity(options.locations, entity),
      departmentId: forEntity(options.departments, entity),
      designationId: forEntity(options.designations, entity),
      gradeId: forEntity(options.grades, entity),
      skillClass: Object.entries(SKILL_CLASS_LABEL).map(([value, label]) => ({ value, label })),
      employmentTypeId: forEntity(options.employmentTypes, entity),
      costCentreId: forEntity(options.costCentres, entity),
      managerEmployeeId: (options.managers ?? options.people).filter((p) => p.id !== draft.employeeId).map((p) => ({ value: p.id, label: `${p.name}${p.employeeCode ? ` · ${p.employeeCode}` : ''}` })),
    }),
    [options, entity, draft.employeeId],
  );
  const date = draft.effectiveDate ? dayKey(draft.effectiveDate) : null;
  // What changes follows the form: worked out a moment after the last edit, once the change is complete.
  const key = input ? JSON.stringify(input) : null;
  useEffect(() => {
    setImpact(null);
    setPreviewError(null);
    if (!key) return;
    let current = true;
    const t = setTimeout(() => {
      (moving && move ? move.onPreview(JSON.parse(key) as MoveInput) : onPreview(JSON.parse(key) as ChangeInput)).then(
        (i) => current && setImpact(i),
        (e) => current && setPreviewError(errorText(e)),
      );
    }, 500);
    return () => {
      current = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // The route depends on the person, the date and whether pay is on the change (pay goes only to those who see pay).
  const withPay = Boolean(draft.changeType && options.canPay && PAY_TYPES.has(draft.changeType) && draft.pay.trim());
  useEffect(() => {
    setRoute(null);
    if (!onRoute || !draft.employeeId) return;
    let current = true;
    onRoute(draft.employeeId, date, withPay).then(
      (names) => current && setRoute(names),
      () => undefined,
    );
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.employeeId, date, withPay]);
  const submit = () => {
    if (!input || !impact) return saveErrors.reveal();
    void run('submit', () => (moving && move ? move.onSubmit(input as MoveInput) : onSubmit(input as ChangeInput))).then((ok) => ok && onClose());
  };
  const saveDraft = () => onSaveDraft && void run('draft', () => onSaveDraft(draft)).then((ok) => ok && onClose());
  const types: Raisable[] = [...(options.types ?? RAISABLE).filter((t) => t !== 'salary_revision' || options.canPay), ...(move ? [MOVE] : [])];
  const label = (f: ChangeField) => (draft.changeType === 'correction' ? FIELD_LABEL[f] : `New ${FIELD_LABEL[f].toLowerCase()}`);
  const past = date && date < options.today;
  // The design's CTC helper: the new CTC against the pay in force, once the impact shows it.
  const ctcLine = impact && impact.pay !== 'hidden' ? impact.pay.find((l) => l.fact === 'Annual CTC') : undefined;
  const was = payNumber(ctcLine?.from ?? null);
  const pct = draft.payMode === 'amount' && draft.pay && was > 0 ? Math.round(((Number(draft.pay) - was) / was) * 1000) / 10 : null;
  const payHelper = draft.payMode === 'percent' ? 'Applied to the pay in force on the date, even if that changes later.' : `${pct !== null ? `${pct >= 0 ? '+' : ''}${pct}% on the current ${formatINR(was)}. ` : ''}The compensation record is created in this same change.`;
  // The person's old-entity masters a move must replace, named in the field's helper (PPL-04 InterEntity).
  const oldEntity = move?.entities.find((x) => x.value === person?.legalEntityId)?.label ?? 'the old entity';
  const moveHelper = (f: ChangeField) => {
    if (!defaults || !(needs as string[]).includes(f)) return undefined;
    const list = f === 'departmentId' ? options.departments : f === 'designationId' ? options.designations : options.employmentTypes;
    const now = list.find((x) => x.value === defaults.current[f as 'departmentId' | 'designationId' | 'employmentTypeId']);
    return now ? `${now.label} is only for ${oldEntity}: choose one for the new entity.` : undefined;
  };
  const steps: ApprovalStep[] | null = route?.length
    ? [
        { id: 'raise', label: 'You send it', status: 'current', approver: 'You' },
        { id: 'decide', label: route.length > 1 ? 'Approves it (any one of them)' : 'Approves it', status: 'pending', approver: orList(route) },
      ]
    : null;
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      dirty={dirty}
      title={person ? `Change for ${person.name}` : 'Change action'}
      subtitle={person ? [person.designation, person.department, person.location].filter(Boolean).join(' · ') : 'Raise a change for one person.'}
      footer={
        <>
          <Button onClick={onClose} disabled={busy !== null}>
            Cancel
          </Button>
          {onSaveDraft && (
            <Button loading={busy === 'draft'} disabled={busy === 'submit' || !draft.employeeId} onClick={saveDraft}>
              Save draft
            </Button>
          )}
          <Button variant="primary" loading={busy === 'submit'} disabled={busy === 'draft'} onClick={submit}>
            Send for approval
          </Button>
        </>
      }
    >
      <form
        className="yx-ppl__stack"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        <ErrorSummary errors={saveErrors.shownErrors} />
        <Text size="sm" tone="secondary" as="p">
          {routeLine(route) ?? 'Someone who approves job changes decides it before it takes effect. Nobody approves their own.'}
        </Text>
        <div className="yx-ppl__form">
          {!employeeId && (
            <FormField id="ch-person" label="Person" required error={errorOf('ch-person')}>
              <Select value={draft.employeeId} onChange={(v) => set({ employeeId: v, values: {} })} options={options.people.map((p) => ({ value: p.id, label: `${p.name}${p.employeeCode ? ` · ${p.employeeCode}` : ''}` }))} searchable aria-label="Person" />
            </FormField>
          )}
          <FormField id="ch-type" label="Change type" required error={errorOf('ch-type')}>
            <Select value={draft.changeType} onChange={(v) => set({ changeType: v, values: {}, dotted: null, pay: '', confirm: false, hours: 'keep', hoursValue: '', entityId: null, transfer: defaults?.options ?? null })} options={types.map((t) => ({ value: t, label: kindLabel(t) }))} aria-label="Change type" />
          </FormField>
          <FormField
            id="ch-date"
            label="Effective date"
            required
            helper={past ? (draft.changeType === 'correction' ? 'This corrects the record from that date. The earlier record is kept and marked as corrected.' : 'This date is in the past, so payroll settles any difference in the next run.') : 'Applied at the start of that day where the person works.'}
            error={errorOf('ch-date')}
          >
            <DatePicker value={draft.effectiveDate} onChange={(effectiveDate) => set({ effectiveDate })} aria-label="Effective date" />
          </FormField>
          {draft.changeType && errorOf('ch-values') && <InlineAlert tone="danger">{errorOf('ch-values')}</InlineAlert>}
          {moving && (
            <FormField id="ch-entity" label="New legal entity" required error={errorOf('ch-entity')}>
              <Select value={draft.entityId ?? null} onChange={(entityId) => set({ entityId, values: {} })} options={(move?.entities ?? []).filter((x) => x.value !== person?.legalEntityId)} aria-label="New legal entity" />
            </FormField>
          )}
          {draft.changeType &&
            (!moving || draft.entityId) &&
            FIELDS[draft.changeType].map((f) => {
              const required = requiredFor(draft.changeType!, rule).includes(f) || (needs as string[]).includes(f);
              const oneOf = draft.changeType === 'promotion' && rule === 'either';
              return (
                <FormField key={f} id={`ch-${f}`} label={label(f)} required={required} optional={!required && !oneOf} helper={oneOf && f === 'designationId' ? 'Choose a new designation, a new grade, or both.' : moveHelper(f)} error={errorOf(`ch-${f}`)}>
                  <Select value={draft.values[f] ?? null} onChange={(v) => set({ values: { ...draft.values, [f]: v } })} options={choices[f]} searchable clearable={!required} placeholder={required ? 'Choose' : 'No change'} aria-label={label(f)} />
                </FormField>
              );
            })}
          {draft.changeType && DOTTED_TYPES.has(draft.changeType) && (
            <FormField label="Dotted-line managers" helper="They see the person and give feedback; they do not approve requests.">
              <Segment label="Dotted-line managers" options={[{ value: 'keep' as const, label: 'No change' }, { value: 'set' as const, label: 'Set new ones' }]} value={draft.dotted === null ? 'keep' : 'set'} onChange={(v) => set({ dotted: v === 'keep' ? null : [] })} />
            </FormField>
          )}
          {draft.changeType && DOTTED_TYPES.has(draft.changeType) && draft.dotted !== null && (
            <FormField id="ch-dotted" label="New dotted-line managers" optional helper="Leave empty to remove them all.">
              <MultiSelect value={draft.dotted} onChange={(dotted) => set({ dotted })} options={choices.managerEmployeeId} searchable aria-label="New dotted-line managers" />
            </FormField>
          )}
          {draft.changeType && HOURS_TYPES.has(draft.changeType) && (
            <FormField label="Hours a week" helper="Full-time follows the normal week where the person works. FTE is worked out from it.">
              <Segment label="Hours a week" options={[{ value: 'keep' as const, label: 'No change' }, { value: 'full' as const, label: 'Full-time' }, { value: 'set' as const, label: 'Part-time' }]} value={draft.hours ?? 'keep'} onChange={(hours) => set({ hours })} />
            </FormField>
          )}
          {draft.changeType && HOURS_TYPES.has(draft.changeType) && draft.hours === 'set' && (
            <FormField id="ch-hours" label="Part-time hours a week" required helper="For example 24 or 37.5." error={errorOf('ch-hours')}>
              <TextField value={draft.hoursValue ?? ''} onChange={(hoursValue) => set({ hoursValue: hoursValue.trim() })} inputMode="decimal" maxLength={4} />
            </FormField>
          )}
          {moving && (
            <Card title="Transfer options">
              <div className="yx-ppl__stack">
                <Text size="sm" tone="secondary" as="p">
                  Company defaults are selected. Change them for this transfer only.
                </Text>
                {draft.transfer ? (
                  <>
                    <FormField label="Leave balance">
                      <RadioGroup value={draft.transfer.leave} onChange={(v) => setOption('leave', v as TransferOptions['leave'])} options={[{ value: 'carry', label: 'Carry over' }, { value: 'lapse', label: 'Lapse' }]} orientation="horizontal" />
                    </FormField>
                    <FormField label="Service continuity (gratuity, seniority, notice)">
                      <RadioGroup value={draft.transfer.service} onChange={(v) => setOption('service', v as TransferOptions['service'])} options={[{ value: 'keep', label: defaults ? `Continue from ${dateLabel(defaults.serviceFrom)}` : 'Continue' }, { value: 'restart', label: 'Restart' }]} orientation="horizontal" />
                    </FormField>
                    <FormField label="Employee code">
                      <RadioGroup value={draft.transfer.code} onChange={(v) => setOption('code', v as TransferOptions['code'])} options={[{ value: 'keep', label: defaults ? `Keep ${defaults.employeeCode}` : 'Keep' }, { value: 'new', label: 'New code in the target series' }]} orientation="horizontal" />
                    </FormField>
                    <FormField label="Salary structure">
                      <RadioGroup value={draft.transfer.salary} onChange={(v) => setOption('salary', v as TransferOptions['salary'])} options={[{ value: 'keep', label: 'Keep' }, { value: 'new', label: 'Assign new' }]} orientation="horizontal" />
                    </FormField>
                  </>
                ) : (
                  <Text size="sm" tone="secondary" as="p">
                    Loading the company defaults…
                  </Text>
                )}
                <Text size="sm" tone="secondary" as="p">
                  There is no settlement at the old entity. HR approves the move in People › Restructure. A continuity checklist opens on it: UAN transfer, ESI IP, Form 12B, declarations, loans, leave and gratuity.
                </Text>
              </div>
            </Card>
          )}
          {draft.changeType === 'confirmation' && (
            <Text as="p" tone="secondary">
              The probation ends and the person is confirmed from this date.
            </Text>
          )}
          {draft.changeType === 'correction' && (
            <FormField label="Employment status">
              <Segment label="Employment status" options={[{ value: 'keep' as const, label: 'No change' }, { value: 'confirmed' as const, label: 'Confirmed' }]} value={draft.confirm ? 'confirmed' : 'keep'} onChange={(v) => set({ confirm: v === 'confirmed' })} />
            </FormField>
          )}
          {draft.changeType && options.canPay && PAY_TYPES.has(draft.changeType) && (
            <>
              <FormField label="Pay given as">
                <Segment label="Pay given as" options={[{ value: 'amount' as const, label: 'New annual CTC' }, { value: 'percent' as const, label: 'Increase %' }]} value={draft.payMode} onChange={(payMode) => set({ payMode, pay: '' })} />
              </FormField>
              <FormField id="ch-pay" label={draft.payMode === 'amount' ? 'New annual CTC' : 'Increase (%)'} optional={draft.changeType !== 'salary_revision'} helper={payHelper} error={errorOf('ch-pay')}>
                {draft.payMode === 'amount' ? (
                  <CurrencyField value={draft.pay ? Number(draft.pay) : null} onChange={(n) => set({ pay: n === null || n === undefined || Number.isNaN(n) ? '' : String(n) })} allowPaise />
                ) : (
                  <TextField value={draft.pay} onChange={(pay) => set({ pay: pay.trim() })} inputMode="decimal" maxLength={6} />
                )}
              </FormField>
            </>
          )}
          {draft.changeType && !options.canPay && PAY_TYPES.has(draft.changeType) && draft.changeType !== 'correction' && (
            <InlineAlert tone="info" title="Pay is proposed by HR">
              You don&apos;t have pay access, so HR adds the new CTC before approval.
            </InlineAlert>
          )}
          <FormField id="ch-reason" label="Reason" required helper="Shown on the person's timeline and to the approver." error={errorOf('ch-reason')}>
            <TextArea value={draft.reason} onChange={(reason) => set({ reason })} rows={2} maxLength={1000} />
          </FormField>
          {date && date < options.retroLimit && (
            <FormField id="ch-override" label="Why go back this far" required helper={`Dates before ${dateLabel(options.retroLimit)} need a System Admin and a reason.`} error={errorOf('ch-override')}>
              <TextArea value={draft.overrideReason} onChange={(overrideReason) => set({ overrideReason })} rows={2} maxLength={1000} />
            </FormField>
          )}
        </div>
        {impact?.retro && <RetroNotice retro={impact.retro} />}
        {impact ? (
          <ChangeImpact impact={impact} />
        ) : previewError ? (
          <InlineAlert tone="warning" title="We couldn't work out what changes">
            {previewError}
          </InlineAlert>
        ) : (
          <Text as="p" tone="secondary" size="sm">
            Fill in every required field, including the reason, to see what changes.
          </Text>
        )}
        {steps && (
          <Card title="Approval route">
            <ApprovalTimeline steps={steps} />
          </Card>
        )}
        {error && (
          <InlineAlert tone="danger" title="Not sent">
            {error}
          </InlineAlert>
        )}
      </form>
    </Drawer>
  );
}

/* ================================================================== PPL-05 scheduled changes */

export type Sched = (typeof SCHEDULED)[number];
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
/** The live app's scheduled changes (design audit step 3). */
export interface LiveScheduled {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry: () => void;
  onEdit?: (id: string) => void;
  onReview?: (id: string) => void;
  onOpen: (id: string) => void;
  onCancel?: (id: string, reason: string) => Promise<void>;
  onStart?: () => void;
  children?: ReactNode;
}

export function ScheduledChangesScreen({ rows, today, defaultWindow = 30, defaultCancelId, canSeePay = true, live }: { rows: Sched[]; today: Date; defaultWindow?: Win; defaultCancelId?: string; canSeePay?: boolean; live?: LiveScheduled }) {
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
          {r.waitingFor && <span className="yx-ppl__sub">Waiting for {r.waitingFor}</span>}
        </>
      )}
    </span>
  );
  const summaryCell = (r: Sched) => (
    <span className="yx-ppl__type">
      {/* Only pay changes: the pay line alone, no empty job line. */}
      {!(r.summary === '—' && payText(r)) && <span>{r.summary}</span>}
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
  const edit = (r: Sched) =>
    live ? (
      r.status === 'Pending approval' && live.onReview ? (
        <Button size="sm" variant="review" onClick={() => live.onReview!(r.id)}>
          Review
        </Button>
      ) : live.onEdit ? (
        <Button size="sm" icon={Pencil} onClick={() => live.onEdit!(r.id)}>
          Edit
        </Button>
      ) : null
    ) : (
      <Button size="sm" icon={Pencil}>
        Edit
      </Button>
    );
  const start = live ? live.onStart : () => {};
  const empty = <EmptyState title={pendingOnly ? 'Nothing is waiting for approval' : `No changes in the next ${win} days`} description="Changes you schedule for a future date appear here until they apply." action={start ? <Button variant="primary" onClick={start}>Start change</Button> : undefined} />;
  const [cancelling, setCancelling] = useState(false);
  const [tried, setTried] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
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
      {live?.state !== 'no-access' && (
        <div className="yx-ppl__filterbar">
          <Segment label="Window" value={win} onChange={setWin} options={([30, 60, 90] as Win[]).map((w) => ({ value: w, label: `Next ${w} days (${inWin(w).length})` }))} />
        <FilterToggle pressed={pendingOnly} onPressedChange={setPendingOnly}>
Only pending approval ({pending.length})
</FilterToggle>
        </div>
      )}
      {showPay && <Text size="sm" tone="secondary" as="p">Pay is showing. Each time you show it is recorded.</Text>}
      {revision && earlier && (
        <InlineAlert tone="warning" title={`${revision.name} has two changes`} actions={<Button size="sm">Open revision</Button>}>
          His {revision.summary.replace('Market correction ', '')} revision on {formatDate(revision.effective)} is worked out on his pay after the {formatDate(earlier.effective)} {earlier.type.toLowerCase()}. Check the amounts before it applies.
        </InlineAlert>
      )}
      {live?.state === 'no-access' ? (
        <NoAccessState what="the scheduled changes" grantedBy="your HR admin" />
      ) : live?.state === 'error' ? (
        <ErrorState title="We couldn't load the scheduled changes" description="Check your connection and try again." onRetry={live.onRetry} />
      ) : live?.state === 'loading' ? (
        <ListSkeleton label="Loading scheduled changes" />
      ) : narrow ? (
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
                {edit(r)}
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
          {...(live ? { onExport: exportCsv('scheduled-changes', shown, cols) } : {})}
          empty={empty}
          rowButtons={edit}
          rowActions={(r) => (
            <>
              <MenuItem onSelect={live ? () => live.onOpen(r.id) : undefined}>{live ? 'Open record' : 'Open change'}</MenuItem>
              {(!live || live.onCancel) && (
                <MenuItem icon={XCircle} destructive onSelect={() => (setTried(false), setCancelId(r.id))}>
                  Cancel change
                </MenuItem>
              )}
            </>
          )}
          defaultSort={{ key: 'effective', dir: 'asc' }}
          defaultColumnState={{ hidden: ['raisedBy'] }}
          // Export: no export of scheduled changes in the live app yet (left out).
          {...(live ? {} : { onExport: () => {} })}
        />
      )}
      <ConfirmDialog
        open={!!cancelRow}
        onOpenChange={(o) => !o && setCancelId(null)}
        title={`Cancel the ${cancelRow?.type.toLowerCase()} for ${cancelRow?.name}?`}
        consequence={cancelRow ? `${cancelRow.summary} won't happen on ${formatDate(cancelRow.effective)}. ${live ? 'The cancelled change stays on the timeline.' : 'The approvers are told, and the cancelled change stays on the timeline.'}` : ''}
        confirmLabel="Cancel change"
        cancelLabel="Keep change"
        destructive
        // Only while the cancel request runs; the reason is checked on click.
        confirmDisabled={cancelling}
        onConfirm={async () => {
          setTried(true);
          if (reason.trim().length < 5) return false;
          if (live?.onCancel && cancelRow) {
            setCancelling(true);
            setCancelError(null);
            try {
              await live.onCancel(cancelRow.id, reason.trim());
            } catch (e) {
              setCancelError(e instanceof Error ? e.message : 'The change was not cancelled. Try again.');
              setCancelling(false);
              throw e;
            }
            setCancelling(false);
          }
          setReason('');
          setCancelId(null);
        }}
      >
        <FormField label="Reason" required rule="At least 5 characters." helper="Shown to the approvers." error={tried && reason.trim().length < 5 ? 'Enter a reason of at least 5 characters.' : null}>
          <TextArea value={reason} onChange={setReason} rows={2} />
        </FormField>
        {cancelError && <InlineAlert tone="danger" title={cancelError} />}
      </ConfirmDialog>
      {live?.children}
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
export function BulkChangesWizard(props: { current?: string; confirmOpen?: boolean; mode?: 'rating' | 'percent'; bandPolicy?: BandPolicy; letterOpen?: boolean; live?: LiveIncrement }) {
  return props.live ? <LiveIncrementWizard live={props.live} /> : <SampleBulkChangesWizard {...props} />;
}

/** The company's rule for a raise above the grade's pay range maximum (Settings › Company rules › Pay ranges). */
export type BandPolicy = 'warn' | 'cap' | 'block';

/** What the Preview step says about people above the band maximum, per company rule. */
export function bandNotice(policy: BandPolicy, above: number, held: number): { tone: 'warning' | 'danger' | 'info'; title: string; text: string } | null {
  const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;
  if (policy === 'cap') return held ? { tone: 'info', title: `${people(held)} held at the band maximum`, text: 'Company rule: a raise never goes above the band maximum. Change it in Settings › Company rules.' } : null;
  if (!above) return null;
  if (policy === 'block') return { tone: 'danger', title: `${people(above)} ${above === 1 ? 'goes' : 'go'} above the band maximum`, text: 'Company rule: raises above the band maximum are not sent. Cap them or lower their raise.' };
  return { tone: 'warning', title: `${people(above)} ${above === 1 ? 'goes' : 'go'} above the band maximum`, text: 'Cap them, change their raise in the table, or leave them for the approver as exceptions.' };
}

function SampleBulkChangesWizard({ current = 'people', confirmOpen = false, mode: startMode = 'rating', bandPolicy = 'warn', letterOpen: startLetter = false }: { current?: string; confirmOpen?: boolean; mode?: 'rating' | 'percent'; bandPolicy?: BandPolicy; letterOpen?: boolean }) {
  const allDepts = useMemo(() => [...new Set(INCREMENT_ROWS.map((r) => r.department))].sort(), []);
  const [type] = useState<string | null>('inc');
  const [effective, setEffective] = useState<Date | null>(new Date(2026, 9, 1));
  const [joinedBefore, setJoinedBefore] = useState<Date | null>(new Date(2026, 3, 1));
  const [depts, setDepts] = useState<string[]>(allDepts);
  const [pct, setPct] = useState(INCREMENT_PCT);
  const [mode, setMode] = useState<'rating' | 'percent'>(startMode);
  const [everyone, setEveryone] = useState<number | null>(6);
  const [cycle, setCycle] = useState<string | null>('fy26');
  const [custom, setCustom] = useState<Record<string, number>>({});
  const [capped, setCapped] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(confirmOpen);
  const [leftOutOpen, setLeftOutOpen] = useState(false);
  const [letterOpen, setLetterOpen] = useState(startLetter);
  const [letterFor, setLetterFor] = useState<string | null>(null);
  // The wizard's content column is narrow, so cards take over below 1024 px.
  const narrow = useNarrow(1023);
  const chosen = useMemo(() => INCREMENT_ROWS.filter((r) => depts.includes(r.department)), [depts]);
  const rule = useMemo(() => (mode === 'rating' ? pct : { Exceeds: everyone ?? 0, Meets: everyone ?? 0, Below: everyone ?? 0 }), [mode, pct, everyone]);
  const rows = useMemo(() => {
    const out = incrementPreview(rule, custom, capped, chosen);
    // Under the "cap" rule everyone above the band is held at its maximum.
    return bandPolicy === 'cap' ? incrementPreview(rule, custom, [...capped, ...out.filter((r) => r.flag).map((r) => r.id)], chosen) : out;
  }, [rule, custom, capped, chosen, bandPolicy]);
  const before = rows.reduce((s, r) => s + r.ctc, 0);
  const after = rows.reduce((s, r) => s + r.next, 0);
  const flaggedRows = rows.filter((r) => r.flag);
  const typeLabel = BULK_TYPES.find((t) => t.value === type)?.label ?? 'Bulk change';
  const cap = (ids: string[]) => setCapped([...new Set([...capped, ...ids])]);
  const notice = bandNotice(bandPolicy, flaggedRows.length, rows.filter((r) => r.capped).length);
  const capBtn = (r: IncRow) =>
    r.flag && bandPolicy !== 'cap' ? (
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
  const first = rows.find((r) => r.id === letterFor) ?? rows[0];
  return (
    <PeopleFrame active="Bulk changes">
      <PageHeader title={typeLabel} description="One approval for everyone, a preview per person, new pay rounded to whole rupees." />
      <Stepper
        title="Bulk change"
        defaultCurrent={current}
        finishLabel={`Send for approval (${rows.length} people)`}
        finishBlocked={bandPolicy === 'block' && flaggedRows.length ? `${flaggedRows.length} above the band maximum: cap them first.` : undefined}
        onFinish={() => setConfirm(true)}
        review={{ description: 'Check the totals before you send this for one approval.' }}
        steps={[
          {
            id: 'people',
            title: 'Choose people',
            summary: `${rows.length} employees · ${depts.length === allDepts.length ? 'all departments' : depts.join(', ')} · Kaveri Foods Pvt Ltd · effective ${effective ? formatDate(effective) : '—'}`,
            content: (
              <div className="yx-ppl__form">
                <FormField label="Legal entity" required>
                  <Select options={[{ value: 'kf', label: 'Kaveri Foods Pvt Ltd' }]} value="kf" onChange={() => {}} />
                </FormField>
                <FormField label="Effective date" required helper="Payroll pays arrears for a date in a month already paid.">
                  <DatePicker value={effective} onChange={setEffective} />
                </FormField>
                <FormField label="Departments" optional helper="Leave empty for everyone.">
                  <MultiSelect options={allDepts.map((d) => ({ value: d, label: d }))} value={depts} onChange={setDepts} />
                </FormField>
                <FormField label="Confirmed employees who joined before" optional>
                  <DatePicker value={joinedBefore} onChange={setJoinedBefore} />
                </FormField>
                <FormField label="Reason" required helper="Kept on each person's job history.">
                  <TextArea rows={2} defaultValue="Annual increment" maxLength={1000} />
                </FormField>
                <InlineAlert tone="info" actions={<Button size="sm" onClick={() => setLeftOutOpen(true)}>See who</Button>}>
                  {rows.length} people match. {INCREMENT_LEFT_OUT.length} are left out.
                </InlineAlert>
              </div>
            ),
          },
          {
            id: 'rule',
            title: 'Set the rule',
            summary: mode === 'rating' ? `Exceeds ${pct.Exceeds}% · Meets ${pct.Meets}% · Below ${pct.Below}%` : `${everyone ?? 0}% for everyone`,
            content: (
              <div className="yx-ppl__form">
                <Segment
                  label="Raise by"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'rating', label: 'By rating' },
                    { value: 'percent', label: 'Same for everyone' },
                  ]}
                />
                {mode === 'percent' ? (
                  <FormField label="Raise for everyone" required>
                    <NumberField value={everyone} onChange={setEveryone} decimals suffix="%" />
                  </FormField>
                ) : (
                  <>
                    <FormField label="Ratings from" required>
                      <Select options={[{ value: 'fy26', label: 'FY 2025-26 annual review' }]} value={cycle} onChange={setCycle} />
                    </FormField>
                    <InlineAlert tone="warning" title="1 person has no rating">
                      They get no raise by rating. Use &quot;Same for everyone&quot;, or see who under Choose people.
                    </InlineAlert>
              <PlainTable
                label="Increase by rating"
                rows={[...RATINGS]}
                getRowId={(k) => k}
                columns={[
                  { key: 'rating', header: 'Rating', rowHeader: true, cell: (k) => k },
                  { key: 'people', header: 'People', num: true, cell: (k) => rows.filter((r) => r.rating === k).length },
                  {
                    key: 'pct',
                    header: 'Increase',
                    cell: (k) => <NumberField aria-label={`Increase for ${k}`} value={pct[k]} onChange={(v) => setPct({ ...pct, [k]: v ?? 0 })} decimals suffix="%" />,
                  },
                  { key: 'cost', header: 'Added cost a year', num: true, cell: (k) => formatINR(rows.filter((r) => r.rating === k).reduce((s, r) => s + r.next - r.ctc, 0)) },
                ]}
              />
                  </>
                )}
              </div>
            ),
          },
          {
            id: 'preview',
            title: 'Preview each person',
            summary: `${formatINR(before)} → ${formatINR(after)} (${formatINR(after - before)} more a year) · ${flaggedRows.length ? `${flaggedRows.length} above band` : 'all within band'}`,
            content: (
              <div className="yx-ppl__stack">
                {notice && (
                  <InlineAlert tone={notice.tone} title={notice.title} actions={bandPolicy !== 'cap' && flaggedRows.length ? <Button size="sm" onClick={() => cap(flaggedRows.map((r) => r.id))}>Cap all {flaggedRows.length} at band maximum</Button> : undefined}>
                    {notice.text}
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
            summary: 'Increment letter (version 3) · to each person’s documents and an email, once approved',
            content: (
              <div className="yx-ppl__form">
                <FormField label="Letter template" required helper={<>Change the wording or the merge fields in <a className="yx-link" href="#settings-letters">Settings › Letter templates</a>.</>}>
                  <Select options={[{ value: 'inc3', label: 'Increment letter (version 3)' }]} value="inc3" onChange={() => {}} />
                </FormField>
                <FormField label="Preview the letter for" optional>
                  <Select options={rows.map((r) => ({ value: r.id, label: r.name }))} value={letterFor ?? rows[0]?.id ?? null} onChange={setLetterFor} searchable />
                </FormField>
                <div>
                  <Button icon={FileText} onClick={() => setLetterOpen(true)}>
                    Preview letter
                  </Button>
                </div>
                <InlineAlert tone="info">Letters are made only after the change is approved, from the approved pay. Each person finds theirs in My documents and letters and gets an email.</InlineAlert>
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
        <StatusChecklist label="People left out" rows={INCREMENT_LEFT_OUT.map((p, i): ChecklistRow => ({ id: `lo${i}`, title: p.name, status: 'Left out', note: p.why }))} />
      </Dialog>
      {letterOpen && first && (
        <DocumentViewer
          inDrawer
          open
          onOpenChange={setLetterOpen}
          fileName={`Increment letter, ${first.name}.pdf`}
          mimeType="application/pdf"
          versions={[{ id: 'p', label: 'Preview', url: INCREMENT_LETTER_PDF, uploadedBy: 'Preview, not issued', uploadedAt: new Date(2026, 9, 20), size: 1300 }]}
        />
      )}
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
export function EmployeeImportWizard(props: { current?: string; rows?: ImportRow[]; fileLoaded?: boolean; saved?: boolean; live?: LiveImport }) {
  return props.live ? <LiveEmployeeImport live={props.live} /> : <SampleEmployeeImportWizard {...props} />;
}

function SampleEmployeeImportWizard({ current = 'upload', rows: initialRows = SAMPLE_IMPORT, fileLoaded = current !== 'upload', saved = false }: { current?: string; rows?: ImportRow[]; fileLoaded?: boolean; saved?: boolean }) {
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
                {saved && !hasFile && (
                  <SavedImportNotice
                    draft={{ fileName: 'kaveri-joiners-oct.xlsx', rows: initialRows.length, entity: 'Kaveri Foods Pvt Ltd', step: 'validate', savedAt: '2026-10-21T09:40:00Z', keptUntil: '2026-11-20T09:40:00Z' }}
                    onResume={() => setHasFile(true)}
                    onDiscard={async () => {}}
                  />
                )}
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
                <PlainTable
                  label="Column matches"
                  rows={FILE_COLUMNS}
                  getRowId={(c) => c.column}
                  columns={[
                    {
                      key: 'column',
                      header: 'Column in your file',
                      cell: (c) => (
                        <span className="yx-ppl__type">
                          <span>{c.column}</span>
                          <span className="yx-ppl__sub">e.g. {c.sample}</span>
                        </span>
                      ),
                    },
                    {
                      key: 'field',
                      header: 'YukthiX field',
                      cell: (c) => <Select aria-label={`Field for ${c.column}`} size="sm" options={IMPORT_FIELDS.map((f) => ({ value: f, label: f }))} value={mapping[c.column]} onChange={(v) => v && setMapping({ ...mapping, [c.column]: v })} />,
                    },
                  ]}
                />
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

type RestructureAction = 'merge' | 'close' | 'demerge' | 'within';
const FROM_ENTITY = 'Kaveri Foods Pvt Ltd (Tamil Nadu)';
const INTO_ENTITY = 'Kaveri Foods Pvt Ltd';
/** Who is in the old entity, by location and department. */
const MOVE_LOCATIONS: Record<string, number> = { 'Hosur plant': 64, 'Chennai office': 32 };
/** "Pick people": the people of the old entity (name · code, location underneath). */
const MOVE_PEOPLE: { name: string; code: string; location: string }[] = [
  { name: 'Divya Raghunathan', code: 'KFT-0012', location: 'Chennai office' },
  { name: 'Arjun Mehta', code: 'KFT-0027', location: 'Hosur plant' },
  { name: 'Selvi Perumal', code: 'KFT-0031', location: 'Chennai office' },
  { name: 'Imran Sheikh', code: 'KFT-0044', location: 'Hosur plant' },
];
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
export function RestructureWizard(props: { current?: string; payrollLocked?: boolean; confirmOpen?: boolean; action?: RestructureAction; picked?: string[]; live?: LiveRestructure }) {
  return props.live ? <LiveRestructureWizard live={props.live} /> : <SampleRestructureWizard {...props} />;
}

function SampleRestructureWizard({ current = 'scope', payrollLocked = true, confirmOpen = false, action: startAction = 'merge', picked: startPicked }: { current?: string; payrollLocked?: boolean; confirmOpen?: boolean; action?: RestructureAction; picked?: string[] }) {
  const [confirm, setConfirm] = useState(confirmOpen);
  const [step, setStep] = useState(current);
  const [action, setAction] = useState<RestructureAction>(startAction);
  // Who moves (part of the entity, or inside it): everyone at chosen locations, or only the people picked.
  const [by, setBy] = useState<'location' | 'people'>(startPicked ? 'people' : 'location');
  const [picked, setPicked] = useState<string[]>(startPicked ?? []);
  const [effective, setEffective] = useState<Date | null>(new Date(2026, 9, 1));
  const [locations, setLocations] = useState<string[]>(['Chennai office']);
  const [defaults, setDefaults] = useState<Record<string, string>>(Object.fromEntries(TRANSFER_DEFAULTS.map((o) => [o.key, o.options[0]])));
  const [overrides, setOverrides] = useState(INITIAL_OVERRIDES);
  const [addOpen, setAddOpen] = useState(false);
  const part = action === 'demerge' || action === 'within';
  const moving = part ? (by === 'people' ? picked.length : locations.reduce((n, l) => n + (MOVE_LOCATIONS[l] ?? 0), 0)) : 96;
  const date = effective ? formatDate(effective) : 'the effective date';
  const heading =
    action === 'merge' ? `Merge ${FROM_ENTITY} into ${INTO_ENTITY}` : action === 'close' ? `Close ${FROM_ENTITY}` : action === 'within' ? `Move people inside ${FROM_ENTITY}` : `Move part of ${FROM_ENTITY} to ${INTO_ENTITY}`;
  const closes = action === 'merge' || action === 'close';
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
      <PageHeader title={heading} description={`Moves ${moving} ${moving === 1 ? 'employment' : 'employments'} with one preview and one approval${closes ? ', then closes the old entity' : ''}.`} />
      <Stepper
        title="Restructure"
        layout="horizontal"
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
            summary: `${moving} people · ${part ? (by === 'people' ? picked.join(', ') : locations.join(', ')) : 'Hosur plant and Chennai office'} · into ${INTO_ENTITY} · ${date}`,
            content: (
              <div className="yx-ppl__stack">
                <div className="yx-ppl__form-cols">
                  <FormField label="Action" required>
                    <RadioGroup
                      value={action}
                      onChange={(v) => setAction(v as RestructureAction)}
                      options={[
                        { value: 'merge', label: 'Merge into another entity' },
                        { value: 'close', label: 'Close the entity (transfers)' },
                        { value: 'demerge', label: 'Move part of the entity to another one' },
                        { value: 'within', label: 'Move people inside the entity (department, location, manager, cost centre)' },
                      ]}
                    />
                  </FormField>
                  <div className="yx-ppl__form">
                    <FormField label="From entity" required>
                      <Select options={[{ value: 'tn', label: `${FROM_ENTITY} · 96 people` }]} value="tn" onChange={() => {}} />
                    </FormField>
                    <FormField label={action === 'close' ? 'Transfer people to' : 'Into entity'} required>
                      <Select options={[{ value: 'ka', label: `${INTO_ENTITY} · 152 people` }]} value="ka" onChange={() => {}} />
                    </FormField>
                  </div>
                  {part && (
                    <>
                      <FormField label="Who moves" required>
                        <Segment label="Who moves" value={by} onChange={(v) => (setBy(v), setPicked([]), setLocations([]))} options={[{ value: 'location', label: 'By location' }, { value: 'people', label: 'Pick people' }]} />
                      </FormField>
                      {by === 'location' ? (
                        <FormField label="Locations" required helper="Everyone at the chosen locations moves.">
                          <MultiSelect aria-label="Locations" placeholder="Locations" options={Object.keys(MOVE_LOCATIONS).map((l) => ({ value: l, label: `${l} · ${MOVE_LOCATIONS[l]} people` }))} value={locations} onChange={setLocations} />
                        </FormField>
                      ) : (
                        <FormField label="People" required helper="Only the people you pick move.">
                          <MultiSelect aria-label="People" placeholder="Search people" searchable searchPlaceholder="Name or employee code" options={MOVE_PEOPLE.map((p) => ({ value: p.name, label: `${p.name} · ${p.code}`, description: p.location }))} value={picked} onChange={setPicked} />
                        </FormField>
                      )}
                    </>
                  )}
                  <FormField label="Effective date" required>
                    <DatePicker value={effective} onChange={setEffective} />
                  </FormField>
                  <FormField label="Reason" required helper="Shown on every person's job history.">
                    <TextArea rows={2} />
                  </FormField>
                </div>
                {!part && (
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
                <div className="yx-ppl__form-cols">
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

