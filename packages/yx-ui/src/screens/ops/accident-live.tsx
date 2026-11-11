// HLP-12 Accident case, live (Helpdesk design wiring): the designed AccidentWorkspaceScreen and ReportAccidentScreen in
// cases-more.tsx render these when the page passes `live`. Same layout as the design: the case header with its badges
// and facts, the Incident / Statutory / Medical tabs, the next-deadline rail and who can see the case; the manager's
// leave-dates-only card; "Not found" for everyone else; and the report form on desk and phone. States only the real
// records have are drawn in the same look: nobody named on the safety team yet, ESI cover not recorded yet, the
// filing and compensation dialogs, the ESIC details to print, and medical records (append-only). The server checks
// every rule again (docs/yukthix/helpdesk-design-map.md 4g); deadlines come from its rule sets, never from here.
import { useEffect, useState } from 'react';
import { ArrowLeft, Camera, FileText, Plus, Printer, ShieldAlert } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button, IconButton } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { FieldRow, FormField, useTooEarly } from '../../components/field';
import { NumberField, TextArea, TextField, TimeField } from '../../components/inputs';
import { Checkbox, RadioGroup } from '../../components/choice';
import { Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { DatePicker } from '../../components/date';
import { FileUpload } from '../../components/upload';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { MenuItem } from '../../components/menu';
import { Dialog } from '../../components/overlay';
import { useNarrow } from '../../components/stepper';
import { formatDate, formatINR } from '../../lib/format';
import { errorText } from '../org/org-kit';
import type { LoadState } from '../desk/types';
import { Actions, ClockPanel, Confidential, Facts, MembersList, OpsDesk, StatusTrail, Workspace, useSay } from './ops-kit';
import type { ClockItem } from './ops-rules';
import { RestrictedNotFound } from './cases';
import type { Device } from './helpdesk';

/* ---------------- what the API sends ---------------- */

export interface NamedRef {
  id: string;
  name: string;
}
export interface AccidentClock {
  key: 'esic' | 'ec';
  label: string;
  due: string | null;
  doneOn: string | null;
}
export type EcKindLive = 'death' | 'permanent-total' | 'permanent-partial' | 'temporary';
/** GET desk/accidents/:id for the safety team and the case's handler. */
export interface AccidentDetail {
  view: 'team';
  id: string;
  number: string;
  company: string;
  injured: { kind: 'employee' | 'contract'; name: string; employeeId: string | null; contractor: string | null };
  occurredAt: string;
  occurredOn: string;
  location: string;
  place: string;
  description: string;
  injuryType: string;
  bodyPart: string | null;
  firstAid: boolean;
  witnesses: string | null;
  reportedBy: string;
  filedAt: string;
  /** null: not recorded yet (and not known from payroll). */
  esi: boolean | null;
  esiFrom: 'case' | 'payroll' | null;
  ipNumber: string | null;
  hospital: string | null;
  handler: NamedRef | null;
  /** inTime: the leave request made in Time from these dates (founder answer 43); null for a contract worker. */
  leave: { from: string; to: string; days: number | null; inTime: { id: string; status: LeaveStatus } | null } | null;
  statements: { id: string; who: string; text: string; by: string; at: string }[];
  photos: { id: string; name: string; size: number; scan: 'clean' | 'pending' | 'infected' }[];
  clocks: AccidentClock[];
  source: string | null;
  ec: {
    kind: EcKindLive;
    factor: number | null;
    disablementPct: number | null;
    days: number | null;
    monthlyWage: number;
    fellDueOn: string;
    wageUsed: number;
    amount: number;
    formula: string;
    deadline: string;
    interest: number;
    paid: { on: string; how: 'payroll' | 'deposit' } | null;
  } | null;
  esicFiled: { on: string; ack: string | null } | null;
  contractorFiled: { on: string; ack: string | null } | null;
  contractorNotFiled: boolean;
  ecOpen: boolean;
  medical: { id: string; kind: MedicalKind; note: string; file: { id: string; name: string; sha256: string; scan: string } | null; by: string; at: string }[];
  members: { name: string; role: string; access: string }[];
  canAssign: boolean;
  closed: { on: string; by: string } | null;
  /** Active people of the company, for the handler (the safety team only). */
  users: NamedRef[];
}
/** GET desk/accidents/:id for the injured employee's manager: leave dates only. */
export interface AccidentManagerView {
  view: 'manager';
  id: string;
  number: string;
  injuredName: string;
  leaveFrom: string | null;
  leaveTo: string | null;
  /** The injury leave request in Time (null: none, for example a contract worker). */
  leaveStatus: LeaveStatus | null;
}
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'cancel_pending' | 'cancelled' | 'sent_back' | 'resent';
const LEAVE_WORDS: Record<LeaveStatus, string> = { pending: 'waiting for approval', approved: 'approved', rejected: 'rejected', withdrawn: 'withdrawn', cancel_pending: 'being cancelled', cancelled: 'cancelled', sent_back: 'sent back for changes', resent: 'waiting for approval' };
/** The roster line (founder answer 43): shifts are marked once the leave in Time is approved. */
const rosterText = (st: LeaveStatus) => (st === 'approved' || st === 'cancel_pending' ? 'Shifts in this period are marked as injury leave' : `Injury leave in Time is ${LEAVE_WORDS[st]}; shifts are marked once it is approved`);
export type MedicalKind = 'diagnosis' | 'certificate' | 'disablement' | 'note';
export interface AccidentFacts {
  esiCovered?: boolean;
  ipNumber?: string;
  handlerUserId?: string;
  hospital?: string;
  leaveFrom?: string;
  leaveTo?: string;
}
export interface EcInput {
  kind: EcKindLive;
  monthlyWage: number;
  factor?: number;
  disablementPct?: number;
  days?: number;
  fellDueOn: string;
}
export interface EsicFormView {
  title: string;
  fields: { label: string; value: string }[];
}
/** GET desk/accidents/form. */
export interface AccidentFormData {
  locations: NamedRef[];
  /** The signed-in person, picked by default (founder answer 46: everyone else is found by search). */
  me: NamedRef | null;
  injuryTypes: string[];
  ready: boolean;
  meEmployeeId: string | null;
}
export interface AccidentReportInput {
  injuredKind: 'employee' | 'contract';
  injuredEmployeeId?: string;
  injuredName?: string;
  contractor?: string;
  occurredAt: string;
  locationId: string;
  place: string;
  description: string;
  injuryType: string;
  bodyPart?: string;
  firstAid: boolean;
  witnesses?: string;
}

/* ---------------- shared ---------------- */

const asDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);
const day = (iso: string | null | undefined) => (iso ? formatDate(asDate(iso)) : '—');
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toClock = (c: AccidentClock): ClockItem => ({ key: c.key, label: c.label, due: c.due ? asDate(c.due) : null, doneOn: c.doneOn ? asDate(c.doneOn) : null });
/** The time of day in India, e.g. "10:30 am", whatever the browser's zone. */
const istTime = (at: string) => new Date(at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true });
const MEDICAL_LABEL: Record<MedicalKind, string> = { diagnosis: 'Diagnosis', certificate: 'Certificate', disablement: 'Disablement', note: 'Note' };
const EC_LABEL: Record<EcKindLive, string> = { death: 'Death', 'permanent-total': 'Permanent total disablement', 'permanent-partial': 'Permanent partial disablement', temporary: 'Temporary disablement' };

/** Runs one action: busy flag, a 5-second toast when done, the refusal kept in the dialog. */
function useAct() {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { toast } = useSay();
  const act = async (fn: () => Promise<unknown>, done: string, description?: string) => {
    setBusy(true);
    setProblem(null);
    try {
      await fn();
      toast({ tone: 'success', title: done, description });
      return true;
    } catch (e) {
      setProblem(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const alert = problem ? (
    <InlineAlert tone="danger" title="That didn't work">
      {problem}
    </InlineAlert>
  ) : null;
  return { busy, act, alert, clear: () => setProblem(null) };
}

/* =========================================================================================
 * The case workspace
 * ======================================================================================= */

export type AccidentDialog = 'facts' | 'leave' | 'statement' | 'filed' | 'ec' | 'ec-paid' | 'medical' | 'form';
export interface LiveAccidentWorkspace {
  /** 'not-found': not on the case, or no such case (the same page, APX-D §6.3). */
  state: LoadState | 'not-found';
  onRetry?: () => void;
  /** Today in India, "YYYY-MM-DD". */
  today: string;
  detail: AccidentDetail | AccidentManagerView | null;
  onBack: () => void;
  onFacts: (input: AccidentFacts) => Promise<void>;
  onStatement: (input: { who: string; text: string }) => Promise<void>;
  /** The employer filed on the ESIC portal (an employee), or the contractor did (a contract worker). */
  onFiled: (input: { on: string; ack?: string }) => Promise<void>;
  onEc: (input: EcInput) => Promise<void>;
  onEcPaid: (input: { on: string; how: 'payroll' | 'deposit' }) => Promise<void>;
  onMedical: (input: { kind: MedicalKind; note: string }, file: File | null) => Promise<void>;
  onOpenFile: (fileId: string) => void;
  onEsicForm: () => Promise<EsicFormView>;
  onClose: () => Promise<void>;
  /** Stories and tests only. */
  start?: { tab?: 'incident' | 'statutory' | 'medical'; dialog?: AccidentDialog; form?: EsicFormView };
}

function ManagerCard({ m }: { m: AccidentManagerView }) {
  const days = m.leaveFrom && m.leaveTo ? Math.round((asDate(m.leaveTo).getTime() - asDate(m.leaveFrom).getTime()) / 86_400_000) + 1 : null;
  return (
    <OpsDesk area="helpdesk" active="Help centre" member={false}>
      <PageHeader title={`Injury leave · ${m.injuredName}`} description="You see only the leave dates. The accident record and medical details are with the safety team and HR." />
      <Card>
        {m.leaveFrom && m.leaveTo ? (
          <DescriptionList
            items={[
              { label: 'Injury leave', value: `${day(m.leaveFrom)} to ${day(m.leaveTo)} (${days} ${days === 1 ? 'day' : 'days'})` },
              { label: 'Expected return', value: formatDate(new Date(asDate(m.leaveTo).getTime() + 86_400_000)) },
              ...(m.leaveStatus ? [{ label: 'Roster', value: rosterText(m.leaveStatus) }] : []),
            ]}
          />
        ) : (
          <EmptyState compact title="No leave dates yet." description="The safety team records them once the doctor says how long. You'll get a notice." />
        )}
      </Card>
    </OpsDesk>
  );
}

function LiveAccidentWorkspace({ live, c }: { live: LiveAccidentWorkspace; c: AccidentDetail }) {
  const [tab, setTab] = useState(live.start?.tab ?? 'incident');
  const [dialog, setDialog] = useState<AccidentDialog | null>(live.start?.dialog ?? null);
  const [form, setForm] = useState<EsicFormView | null>(live.start?.form ?? null);
  const { toast } = useSay();
  const today = asDate(live.today);
  const contract = c.injured.kind === 'contract';
  const open = !c.closed;
  const clocks = c.clocks.map(toClock);
  const next = clocks.filter((x) => !x.doneOn);
  const filed = contract ? c.contractorFiled : c.esicFiled;
  const close = () => setDialog(null);
  const review = async () => {
    try {
      setForm(await live.onEsicForm());
      setDialog('form');
    } catch (e) {
      toast({ tone: 'error', title: errorText(e) });
    }
  };
  const closeCase = async () => {
    try {
      await live.onClose();
      toast({ tone: 'success', title: `${c.number} is closed`, description: 'The record stays; nothing can be added now.' });
    } catch (e) {
      toast({ tone: 'error', title: errorText(e) });
    }
  };

  const esiCard = c.esi && (
    <div className="yx-ops-card">
      <div className="yx-ops-card__head">
        <h3 className="yx-ops-card__title">{contract ? 'ESIC accident report (filed by the contractor)' : 'ESIC accident report'}</h3>
        <Badge tone={filed ? 'success' : c.contractorNotFiled ? 'danger' : 'warning'}>{filed ? 'Submitted' : contract ? 'Contractor to file' : 'Draft ready'}</Badge>
      </div>
      <StatusTrail steps={[{ label: 'Draft' }, { label: 'Reviewed' }, { label: 'Submitted' }, { label: 'Acknowledged' }]} current={filed ? (filed.ack ? 3 : 2) : 1} />
      <p className="yx-ops-muted">
        Prepared from the case: {c.ipNumber ? `IP number ${c.ipNumber}, ` : ''}time, place, injury and first aid. A person files it on the ESIC portal and records the date here; the app never files with the government.
      </p>
      {filed ? (
        <FormField label={contract ? 'Contractor’s acknowledgement number' : 'Acknowledgement number'} helper={`Filed ${day(filed.on)}`}>
          <TextField value={filed.ack ?? 'Not recorded'} onChange={() => {}} readOnly />
        </FormField>
      ) : (
        open && (
          <Actions>
            <Button icon={FileText} onClick={() => void review()}>
              Review report
            </Button>
            <Button onClick={() => setDialog('filed')}>{contract ? 'Mark contractor filed' : 'Mark submitted'}</Button>
          </Actions>
        )
      )}
    </div>
  );

  const ecCard = c.esi === false && (
    <div className="yx-ops-card" data-tone={c.ec && c.ec.interest > 0 && !c.ec.paid ? 'danger' : undefined}>
      <div className="yx-ops-card__head">
        <h3 className="yx-ops-card__title">Employee’s Compensation claim</h3>
        <Badge tone={c.ec?.paid ? 'success' : c.ec && c.ec.interest > 0 ? 'danger' : 'warning'}>{c.ec?.paid ? 'Paid' : c.ec && c.ec.interest > 0 ? 'Overdue' : c.ec ? 'To pay' : 'Not worked out'}</Badge>
      </div>
      <p className="yx-ops-muted">Not covered by ESI for this injury, so the employer pays compensation under the rules valid on {day(c.occurredOn)}.</p>
      {c.ec ? (
        <>
          <Facts
            items={[
              { label: 'Wage used (ceiling applied)', value: formatINR(c.ec.wageUsed) },
              ...(c.ec.factor ? [{ label: 'Age factor', value: c.ec.factor }] : []),
              { label: 'Compensation', value: formatINR(c.ec.amount) },
              ...(c.ec.interest > 0 ? [{ label: 'Interest (estimate)', value: formatINR(c.ec.interest), tone: 'danger' as const }] : []),
            ]}
          />
          <p className="yx-ops-muted">
            How it's worked out: {EC_LABEL[c.ec.kind]}, {c.ec.formula}. Pay by {day(c.ec.deadline)}. Estimate from dated rules; your compliance owner verifies.
          </p>
          {c.ec.paid ? (
            <p className="yx-ops-muted">
              Paid {day(c.ec.paid.on)}, {c.ec.paid.how === 'payroll' ? 'through payroll to the employee' : 'deposited with the Commissioner'}.
            </p>
          ) : (
            open && (
              <Actions>
                <Button onClick={() => setDialog('ec')}>Change the working</Button>
                <Button onClick={() => setDialog('ec-paid')}>Mark paid</Button>
              </Actions>
            )
          )}
        </>
      ) : (
        open && (
          <Actions>
            <Button icon={FileText} onClick={() => setDialog('ec')}>
              Work out compensation
            </Button>
          </Actions>
        )
      )}
    </div>
  );

  const statutory = (
    <div className="yx-ops-stack">
      {clocks.length > 0 && <ClockPanel title="Statutory deadlines" items={clocks} today={today} source={c.source ? `Time limits from ${c.source}` : undefined} />}
      {c.esi === null && (
        <InlineAlert tone="warning" title="Is this person covered by ESI?" actions={open ? <Button size="sm" onClick={() => setDialog('facts')}>Record ESI cover</Button> : undefined}>
          The deadlines depend on it: covered by ESI, the ESIC accident report is due; not covered, the employer pays Employee’s Compensation.
        </InlineAlert>
      )}
      {c.contractorNotFiled && (
        <InlineAlert tone="warning" title="The contractor hasn't filed yet">
          {c.injured.contractor} is the immediate employer and must file the ESIC report. As principal employer, {c.company} may be liable if they don't. The safety team is reminded each morning.
        </InlineAlert>
      )}
      {esiCard}
      {ecCard}
      <InlineAlert tone="info">
        {c.leave
          ? `Injury leave from ${day(c.leave.from)} to ${day(c.leave.to)} is shared with the manager (dates only).${c.leave.inTime ? ` In Time it is ${LEAVE_WORDS[c.leave.inTime.status]}.` : c.injured.kind === 'contract' ? ' A contract worker has no leave in Time.' : ''}`
          : c.injured.kind === 'contract'
            ? 'Record the injury leave dates on the case.'
            : 'Record the injury leave dates: they go to Time as injury leave, and the manager sees the dates only.'}
      </InlineAlert>
    </div>
  );

  return (
    <OpsDesk area="helpdesk" active="Cases">
      <Confidential note="Confidential. Only the safety team and the case's HR handler see this. Every view is logged.">
        <ObjectHeader
          name={`${c.injuryType}, ${c.place}`}
          icon={ShieldAlert}
          secondary={
            <span>
              <span className="yx-ops-mono">{c.number}</span> · Workplace accident · {day(c.occurredOn)}, {istTime(c.occurredAt)}
            </span>
          }
          status={
            <>
              <Badge tone={c.esi ? 'info' : c.esi === false ? 'neutral' : 'warning'}>{c.esi ? 'ESI covered' : c.esi === false ? 'Not ESI covered' : 'ESI cover not recorded'}</Badge>
              {contract && <Badge tone="neutral">Contract worker</Badge>}
              {c.closed && <Badge tone="neutral">Closed</Badge>}
            </>
          }
          facts={[
            { label: 'Injured person', value: c.injured.name },
            { label: 'Unable to work', value: c.leave?.days ? `${c.leave.days} days` : 'Not recorded' },
            { label: 'Reported by', value: c.reportedBy },
          ]}
          actions={
            open ? (
              <>
                <Button onClick={() => setDialog('statement')}>Add witness statement</Button>
                <Button variant="primary" onClick={() => void closeCase()}>
                  Close case
                </Button>
              </>
            ) : undefined
          }
          menu={
            open ? (
              <>
                <MenuItem onSelect={() => setDialog('leave')}>Record injury leave</MenuItem>
                <MenuItem onSelect={() => setDialog('facts')}>Case details (ESI, hospital, handler)</MenuItem>
              </>
            ) : undefined
          }
        />
        <Workspace
          main={
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList aria-label="Accident case sections">
                <TabsTrigger value="incident">Incident</TabsTrigger>
                <TabsTrigger value="statutory" count={next.length + (c.esi === null ? 1 : 0)}>
                  Statutory
                </TabsTrigger>
                <TabsTrigger value="medical">Medical</TabsTrigger>
              </TabsList>
              <TabsContent value="incident">
                <div className="yx-ops-stack">
                  <DescriptionList
                    columns={2}
                    items={[
                      { label: 'What happened', value: c.description },
                      { label: 'Place', value: `${c.place}, ${c.location}` },
                      { label: 'Injured person', value: `${c.injured.name} (${contract ? `Contract worker, ${c.injured.contractor}` : 'Employee'})` },
                      { label: 'Injury', value: [c.injuryType, c.bodyPart].filter(Boolean).join(', ') },
                      { label: 'First aid', value: c.firstAid ? 'Given' : 'Not given' },
                      { label: 'Hospital', value: c.hospital ?? 'Not recorded' },
                      { label: 'Witnesses', value: c.witnesses ?? 'None named' },
                      { label: 'IP number', value: c.ipNumber ?? 'Not recorded', mono: Boolean(c.ipNumber) },
                      ...c.statements.map((s) => ({ label: `Statement · ${s.who}`, value: `${s.text} (recorded by ${s.by}, ${day(s.at)})` })),
                    ]}
                  />
                  {c.photos.length > 0 && (
                    <div className="yx-ops-row" role="group" aria-label="Photos">
                      {c.photos.map((p) => (
                        <Button key={p.id} icon={Camera} onClick={() => (p.scan === 'clean' ? live.onOpenFile(p.id) : toast({ tone: 'default', title: 'This photo is still being checked for viruses. Try again in a minute.' }))}>
                          {p.scan === 'clean' ? p.name : `${p.name} (being checked)`}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="statutory">{statutory}</TabsContent>
              <TabsContent value="medical">
                <div className="yx-ops-stack">
                  <InlineAlert tone="info">Special data. Only the safety team and the case's HR handler see this section; the manager sees only leave dates. Records can't be changed or deleted; every file open is logged.</InlineAlert>
                  {c.medical.length ? (
                    <DescriptionList
                      items={c.medical.map((m) => ({
                        label: MEDICAL_LABEL[m.kind],
                        value: (
                          <span className="yx-ops-stack" data-gap="sm">
                            <span>
                              {m.note} ({m.by}, {day(m.at)})
                            </span>
                            {m.file && (
                              <span className="yx-ops-row">
                                <Button size="sm" icon={FileText} onClick={() => (m.file!.scan === 'clean' ? live.onOpenFile(m.file!.id) : toast({ tone: 'default', title: 'This file is still being checked for viruses. Try again in a minute.' }))}>
                                  {m.file.name}
                                </Button>
                                <span className="yx-ops-mono yx-ops-muted" title="SHA-256 fingerprint">
                                  {m.file.sha256.slice(0, 12)}…
                                </span>
                              </span>
                            )}
                          </span>
                        ),
                      }))}
                    />
                  ) : (
                    <EmptyState compact title="No medical records yet." description="Add the diagnosis, certificates and any disablement the doctor or medical board records." />
                  )}
                  {open && (
                    <Actions>
                      <Button icon={Plus} onClick={() => setDialog('medical')}>
                        Add medical record
                      </Button>
                    </Actions>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          }
          rail={
            <>
              <ClockPanel title="Next deadline" items={next.length ? next.slice(0, 1) : clocks.slice(-1)} today={today} />
              <Card>
                <MembersList members={c.members} />
              </Card>
            </>
          }
        />
      </Confidential>
      <FactsDialog live={live} c={c} which={dialog === 'facts' || dialog === 'leave' ? dialog : null} onClose={close} />
      <StatementDialog live={live} open={dialog === 'statement'} onClose={close} />
      <FiledDialog live={live} c={c} open={dialog === 'filed'} onClose={close} />
      <EcDialog live={live} c={c} open={dialog === 'ec'} onClose={close} />
      <EcPaidDialog live={live} c={c} open={dialog === 'ec-paid'} onClose={close} />
      <MedicalDialog live={live} open={dialog === 'medical'} onClose={close} />
      <Dialog
        open={dialog === 'form' && Boolean(form)}
        onOpenChange={(o) => !o && close()}
        title={form?.title ?? 'ESIC accident report'}
        footer={
          <>
            <Button onClick={close}>Done</Button>
            <Button variant="primary" icon={Printer} onClick={() => window.print()}>
              Print
            </Button>
          </>
        }
      >
        <div className="yx-ops-stack">
          <InlineAlert tone="info">Enter these details on the ESIC portal, then press {contract ? 'Mark contractor filed' : 'Mark submitted'} with the date.</InlineAlert>
          <DescriptionList items={(form?.fields ?? []).map((f) => ({ label: f.label, value: f.value }))} />
        </div>
      </Dialog>
    </OpsDesk>
  );
}

function FactsDialog({ live, c, which, onClose }: { live: LiveAccidentWorkspace; c: AccidentDetail; which: 'facts' | 'leave' | null; onClose: () => void }) {
  const [esi, setEsi] = useState<'yes' | 'no' | null>(c.esi === null ? null : c.esi ? 'yes' : 'no');
  const [ip, setIp] = useState(c.ipNumber ?? '');
  const [hospital, setHospital] = useState(c.hospital ?? '');
  const [handler, setHandler] = useState<string | null>(c.handler?.id ?? null);
  const [from, setFrom] = useState<Date | null>(c.leave ? asDate(c.leave.from) : null);
  const [to, setTo] = useState<Date | null>(c.leave ? asDate(c.leave.to) : null);
  const { busy, act, alert, clear } = useAct();
  const leave = which === 'leave';
  const early = useTooEarly(
    leave
      ? [...(!from ? [{ fieldId: 'ac-from', message: 'Choose the first day of leave.' }] : []), ...(!to ? [{ fieldId: 'ac-to', message: 'Choose the last day of leave.' }] : [])]
      : [...(ip.trim() && !/^(\d{10}|\d{17})$/.test(ip.trim()) ? [{ fieldId: 'ac-ip', message: 'The ESIC IP number has 10 or 17 digits.' }] : [])],
  );
  const save = async () => {
    if (early.stop()) return;
    const input: AccidentFacts = leave
      ? { leaveFrom: isoDay(from!), leaveTo: isoDay(to!) }
      : {
          ...(esi ? { esiCovered: esi === 'yes' } : {}),
          ...(ip.trim() ? { ipNumber: ip.trim() } : {}),
          ...(hospital.trim() ? { hospital: hospital.trim() } : {}),
          ...(c.canAssign && handler && handler !== c.handler?.id ? { handlerUserId: handler } : {}),
        };
    if (await act(() => live.onFacts(input), leave ? 'Injury leave recorded' : 'Case details saved', leave ? 'The manager can see the dates (and nothing else).' : undefined)) (early.reset(), onClose());
  };
  return (
    <Dialog
      open={Boolean(which)}
      onOpenChange={(o) => !o && (clear(), onClose())}
      size="sm"
      title={leave ? 'Record injury leave' : 'Case details'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {alert}
        {leave ? (
          <FieldRow>
            <FormField id="ac-from" label="First day" required error={early.errorOf('ac-from')}>
              <DatePicker value={from} onChange={setFrom} min={asDate(c.occurredOn)} />
            </FormField>
            <FormField id="ac-to" label="Last day" required error={early.errorOf('ac-to')}>
              <DatePicker value={to} onChange={setTo} min={from ?? asDate(c.occurredOn)} />
            </FormField>
          </FieldRow>
        ) : (
          <>
            <FormField label="Covered by ESI for this injury?" helper={c.esiFrom === 'payroll' ? 'Filled in from payroll. Change it if this injury is different.' : undefined}>
              <Segment
                label="Covered by ESI"
                value={esi}
                onChange={setEsi}
                options={[
                  { value: 'yes', label: 'Yes' },
                  { value: 'no', label: 'No' },
                ]}
              />
            </FormField>
            <FormField id="ac-ip" label="ESIC IP number" optional error={early.errorOf('ac-ip')}>
              <TextField value={ip} onChange={setIp} inputMode="numeric" maxLength={17} />
            </FormField>
            <FormField label="Hospital or dispensary" optional>
              <TextField value={hospital} onChange={setHospital} maxLength={150} />
            </FormField>
            {c.canAssign && (
              <FormField label="HR person who files the reports" helper="They see the whole case, medical details included.">
                <Select value={handler} onChange={setHandler} options={c.users.map((u) => ({ value: u.id, label: u.name }))} placeholder="Choose a person" searchable />
              </FormField>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}

function StatementDialog({ live, open, onClose }: { live: LiveAccidentWorkspace; open: boolean; onClose: () => void }) {
  const [who, setWho] = useState('');
  const [text, setText] = useState('');
  const { busy, act, alert, clear } = useAct();
  const early = useTooEarly([...(!who.trim() ? [{ fieldId: 'ac-who', message: 'Say whose statement it is.' }] : []), ...(text.trim().length < 10 ? [{ fieldId: 'ac-text', message: 'Write the statement (10 letters or more).' }] : [])]);
  const save = async () => {
    if (early.stop()) return;
    if (await act(() => live.onStatement({ who: who.trim(), text: text.trim() }), 'Statement added')) (setWho(''), setText(''), early.reset(), onClose());
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && (clear(), onClose())} title="Add witness statement" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Add statement</Button></>}>
      <div className="yx-ops-stack">
        {alert}
        <FormField id="ac-who" label="Witness" required error={early.errorOf('ac-who')}>
          <TextField value={who} onChange={setWho} maxLength={150} />
        </FormField>
        <FormField id="ac-text" label="What they saw" required error={early.errorOf('ac-text')} helper="A statement can't be changed once added.">
          <TextArea rows={5} value={text} onChange={setText} maxLength={5000} />
        </FormField>
      </div>
    </Dialog>
  );
}

function FiledDialog({ live, c, open, onClose }: { live: LiveAccidentWorkspace; c: AccidentDetail; open: boolean; onClose: () => void }) {
  const contract = c.injured.kind === 'contract';
  const [on, setOn] = useState<Date | null>(asDate(live.today));
  const [ack, setAck] = useState('');
  const { busy, act, alert, clear } = useAct();
  const early = useTooEarly(!on ? [{ fieldId: 'ac-on', message: 'Choose the date it was filed.' }] : []);
  const save = async () => {
    if (early.stop()) return;
    if (await act(() => live.onFiled({ on: isoDay(on!), ...(ack.trim() ? { ack: ack.trim() } : {}) }), contract ? 'Contractor’s filing recorded' : 'ESIC report marked submitted')) (early.reset(), onClose());
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && (clear(), onClose())} size="sm" title={contract ? 'The contractor filed the ESIC report' : 'Filed on the ESIC portal'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Save</Button></>}>
      <div className="yx-ops-stack">
        {alert}
        <FormField id="ac-on" label="Date filed" required error={early.errorOf('ac-on')}>
          <DatePicker value={on} onChange={setOn} min={asDate(c.occurredOn)} max={asDate(live.today)} />
        </FormField>
        <FormField label="Acknowledgement number" optional>
          <TextField value={ack} onChange={setAck} maxLength={60} />
        </FormField>
      </div>
    </Dialog>
  );
}

function EcDialog({ live, c, open, onClose }: { live: LiveAccidentWorkspace; c: AccidentDetail; open: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<EcKindLive | null>(c.ec?.kind ?? null);
  const [wage, setWage] = useState<number | null>(c.ec?.monthlyWage ?? null);
  const [factor, setFactor] = useState<number | null>(c.ec?.factor ?? null);
  const [pct, setPct] = useState<number | null>(c.ec?.disablementPct ?? null);
  const [days, setDays] = useState<number | null>(c.ec?.days ?? c.leave?.days ?? null);
  const [due, setDue] = useState<Date | null>(c.ec ? asDate(c.ec.fellDueOn) : null);
  const { busy, act, alert, clear } = useAct();
  const early = useTooEarly([
    ...(!kind ? [{ fieldId: 'ec-kind', message: 'Choose what the injury led to.' }] : []),
    ...(!wage ? [{ fieldId: 'ec-wage', message: 'Enter the monthly wage.' }] : []),
    ...(kind && kind !== 'temporary' && !factor ? [{ fieldId: 'ec-factor', message: 'Enter the age factor from Schedule IV.' }] : []),
    ...(kind === 'permanent-partial' && !pct ? [{ fieldId: 'ec-pct', message: 'Enter the loss of earning capacity (per cent).' }] : []),
    ...(kind === 'temporary' && !days ? [{ fieldId: 'ec-days', message: 'Enter the days unable to work.' }] : []),
    ...(!due ? [{ fieldId: 'ec-due', message: 'Choose the day it fell due.' }] : []),
  ]);
  const save = async () => {
    if (early.stop()) return;
    const input: EcInput = { kind: kind!, monthlyWage: wage!, fellDueOn: isoDay(due!), ...(kind === 'temporary' ? { days: days! } : { factor: factor! }), ...(kind === 'permanent-partial' ? { disablementPct: pct! } : {}) };
    if (await act(() => live.onEc(input), 'Compensation worked out', 'The amount and the payment deadline are on the Statutory tab.')) (early.reset(), onClose());
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && (clear(), onClose())} title="Employee’s Compensation" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Work it out</Button></>}>
      <div className="yx-ops-stack">
        {alert}
        <FormField id="ec-kind" label="The injury led to" required error={early.errorOf('ec-kind')}>
          <Select value={kind} onChange={setKind} options={(Object.keys(EC_LABEL) as EcKindLive[]).map((k) => ({ value: k, label: EC_LABEL[k] }))} placeholder="Choose" />
        </FormField>
        <FieldRow>
          <FormField id="ec-wage" label="Monthly wage (₹)" required error={early.errorOf('ec-wage')} helper="The rules apply their ceiling.">
            <NumberField value={wage} onChange={setWage} min={1} max={10_000_000} />
          </FormField>
          {kind === 'temporary' ? (
            <FormField id="ec-days" label="Days unable to work" required error={early.errorOf('ec-days')}>
              <NumberField value={days} onChange={setDays} min={1} max={3650} />
            </FormField>
          ) : (
            <FormField id="ec-factor" label="Age factor" required error={early.errorOf('ec-factor')} helper="From Schedule IV of the Act, for the person's age.">
              <NumberField value={factor} onChange={setFactor} decimals min={1} max={500} />
            </FormField>
          )}
        </FieldRow>
        {kind === 'permanent-partial' && (
          <FormField id="ec-pct" label="Loss of earning capacity (%)" required error={early.errorOf('ec-pct')} helper="As the medical board certified.">
            <NumberField value={pct} onChange={setPct} decimals min={1} max={100} />
          </FormField>
        )}
        <FormField id="ec-due" label="Fell due on" required error={early.errorOf('ec-due')} helper="For example the medical board's date.">
          <DatePicker value={due} onChange={setDue} min={asDate(c.occurredOn)} max={asDate(live.today)} />
        </FormField>
      </div>
    </Dialog>
  );
}

function EcPaidDialog({ live, c, open, onClose }: { live: LiveAccidentWorkspace; c: AccidentDetail; open: boolean; onClose: () => void }) {
  const [on, setOn] = useState<Date | null>(asDate(live.today));
  const [how, setHow] = useState<'payroll' | 'deposit'>('payroll');
  const { busy, act, alert, clear } = useAct();
  const early = useTooEarly(!on ? [{ fieldId: 'ec-on', message: 'Choose the date it was paid.' }] : []);
  const save = async () => {
    if (early.stop()) return;
    if (await act(() => live.onEcPaid({ on: isoDay(on!), how }), 'Compensation marked paid')) (early.reset(), onClose());
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && (clear(), onClose())} size="sm" title="Compensation paid" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Save</Button></>}>
      <div className="yx-ops-stack">
        {alert}
        <FormField label="How it's paid">
          <RadioGroup
            value={how}
            onChange={(v) => setHow(v as typeof how)}
            options={[
              { value: 'payroll', label: 'Lump sum through payroll to the employee' },
              { value: 'deposit', label: 'Deposit with the Commissioner', description: 'Required for death, and other cases the rules list' },
            ]}
          />
        </FormField>
        <FormField id="ec-on" label="Date paid" required error={early.errorOf('ec-on')}>
          <DatePicker value={on} onChange={setOn} min={asDate(c.occurredOn)} max={asDate(live.today)} />
        </FormField>
      </div>
    </Dialog>
  );
}

function MedicalDialog({ live, open, onClose }: { live: LiveAccidentWorkspace; open: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<MedicalKind | null>('diagnosis');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const { busy, act, alert, clear } = useAct();
  const early = useTooEarly([...(!kind ? [{ fieldId: 'md-kind', message: 'Choose what it is.' }] : []), ...(!note.trim() ? [{ fieldId: 'md-note', message: 'Write what it says.' }] : [])]);
  const save = async () => {
    if (early.stop()) return;
    if (await act(() => live.onMedical({ kind: kind!, note: note.trim() }, file), 'Medical record added', 'It can’t be changed or deleted.')) (setNote(''), setFile(null), early.reset(), onClose());
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && (clear(), onClose())} title="Add medical record" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Add record</Button></>}>
      <div className="yx-ops-stack">
        {alert}
        <FormField id="md-kind" label="What it is" required error={early.errorOf('md-kind')}>
          <Select value={kind} onChange={setKind} options={(Object.keys(MEDICAL_LABEL) as MedicalKind[]).map((k) => ({ value: k, label: MEDICAL_LABEL[k] }))} />
        </FormField>
        <FormField id="md-note" label="What it says" required error={early.errorOf('md-note')}>
          <TextArea rows={4} value={note} onChange={setNote} maxLength={2000} />
        </FormField>
        <FormField label="File" optional helper="PDF, JPG or PNG, up to 10 MB. Its fingerprint is kept so any change shows.">
          <FileUpload accept={['.pdf', '.jpg', '.png']} upload={async (x) => void setFile(x)} />
        </FormField>
      </div>
    </Dialog>
  );
}

export function LiveAccidentCase({ live }: { live: LiveAccidentWorkspace }) {
  if (live.state === 'not-found') return <RestrictedNotFound />;
  const d = live.detail;
  if (d?.view === 'manager') return <ManagerCard m={d} />;
  if (live.state === 'ready' && d) return <LiveAccidentWorkspace live={live} c={d} />;
  return (
    <OpsDesk area="helpdesk" active="Cases">
      <PageHeader title="Accident case" />
      {live.state === 'error' || live.state === 'no-access' ? (
        <ErrorState title="We couldn't load this case." description="Try again in a moment." onRetry={live.onRetry} />
      ) : (
        <div className="yx-ops-stack" role="status" aria-busy="true" aria-label="Loading the case">
          <Skeleton height={96} />
          <Skeleton height={240} />
        </div>
      )}
    </OpsDesk>
  );
}

/* =========================================================================================
 * Report an accident (desk and phone)
 * ======================================================================================= */

export interface LiveReportAccident {
  state: LoadState;
  onRetry?: () => void;
  form: AccidentFormData | null;
  /** Today in India. */
  today: Date;
  onSend: (input: AccidentReportInput) => Promise<{ id: string; number: string }>;
  onPhoto: (caseId: string, file: File) => Promise<void>;
  /** Founder answer 46: people of the company whose name has the typed words (the server searches). */
  onSearchPeople: (q: string) => Promise<NamedRef[]>;
  onDone: () => void;
  /** Stories and tests only. */
  start?: { kind?: 'employee' | 'contract'; tooEarly?: boolean };
}

function ReportForm({ live, f, device }: { live: LiveReportAccident; f: AccidentFormData; device: Device }) {
  const [kind, setKind] = useState<'employee' | 'contract'>(live.start?.kind ?? 'employee');
  const [person, setPerson] = useState<string | null>(f.meEmployeeId);
  const [picked, setPicked] = useState<NamedRef | null>(f.me);
  const [found, setFound] = useState<NamedRef[]>([]);
  const search = async (q: string) => {
    if (q.trim().length < 2) return setFound([]);
    setFound(await live.onSearchPeople(q.trim()).catch(() => []));
  };
  const [name, setName] = useState('');
  const [contractor, setContractor] = useState('');
  const [when, setWhen] = useState<Date | null>(live.today);
  const [time, setTime] = useState<string | null>(null);
  const [loc, setLoc] = useState<string | null>(f.locations.length === 1 ? f.locations[0].id : null);
  const [place, setPlace] = useState('');
  const [what, setWhat] = useState('');
  const [type, setType] = useState<string | null>(null);
  const [part, setPart] = useState('');
  const [firstAid, setFirstAid] = useState(false);
  const [witnesses, setWitnesses] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useSay();
  const early = useTooEarly([
    ...(kind === 'employee' && !person ? [{ fieldId: 'ra-person', message: 'Choose who was injured.' }] : []),
    ...(kind === 'contract' && !name.trim() ? [{ fieldId: 'ra-name', message: 'Enter the worker’s name.' }] : []),
    ...(kind === 'contract' && !contractor.trim() ? [{ fieldId: 'ra-contractor', message: 'Enter the contractor’s name.' }] : []),
    ...(!when ? [{ fieldId: 'ra-when', message: 'Choose the day it happened.' }] : []),
    ...(!time ? [{ fieldId: 'ra-time', message: 'Enter the time, like 10:30 am.' }] : []),
    ...(!loc ? [{ fieldId: 'ra-loc', message: 'Choose the location.' }] : []),
    ...(!place.trim() ? [{ fieldId: 'ra-place', message: 'Say where exactly.' }] : []),
    ...(what.trim().length < 10 ? [{ fieldId: 'ra-what', message: 'Say what happened (10 letters or more).' }] : []),
    ...(!type ? [{ fieldId: 'ra-type', message: 'Choose the injury type.' }] : []),
  ]);
  useEffect(() => {
    if (live.start?.tooEarly) early.stop();
    // Stories only: show the pressed-too-early state once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const send = async () => {
    if (!f.ready) return toast({ tone: 'default', title: 'Your company has not named its safety team yet. Tell your safety officer in person.' });
    if (early.stop()) return;
    setBusy(true);
    setError(null);
    try {
      // The day and time as said in India (+05:30), whatever the device's zone.
      const occurredAt = `${isoDay(when!)}T${time}:00+05:30`;
      const r = await live.onSend({
        injuredKind: kind,
        ...(kind === 'employee' ? { injuredEmployeeId: person! } : { injuredName: name.trim(), contractor: contractor.trim() }),
        occurredAt,
        locationId: loc!,
        place: place.trim(),
        description: what.trim(),
        injuryType: type!,
        ...(part.trim() ? { bodyPart: part.trim() } : {}),
        firstAid,
        ...(witnesses.trim() ? { witnesses: witnesses.trim() } : {}),
      });
      const failed: string[] = [];
      for (const p of photos) await live.onPhoto(r.id, p).catch(() => failed.push(p.name));
      toast({ tone: 'success', title: `Accident ${r.number} reported`, description: failed.length ? `The safety team has it. These photos didn't go: ${failed.join(', ')}.` : 'The safety team has it.' });
      live.onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const fields = (
    <div className="yx-ops-stack">
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      {!f.ready && (
        <InlineAlert tone="warning" title="Nobody receives accident reports yet">
          Your company has not named its safety team, so the app cannot take this report. Tell your safety officer in person, and tell your System Admin.
        </InlineAlert>
      )}
      <InlineAlert tone="info">For a near-miss with no injury, tell your safety officer instead.</InlineAlert>
      <FormField label="Who was injured?" required>
        <RadioGroup
          value={kind}
          onChange={(v) => setKind(v as typeof kind)}
          options={[
            { value: 'employee', label: 'An employee', description: 'You can report for someone else' },
            { value: 'contract', label: 'A contract worker', description: 'We link the worker and their contractor' },
          ]}
        />
      </FormField>
      {kind === 'employee' ? (
        <FormField id="ra-person" label="Name" required error={early.errorOf('ra-person')}>
          <Select
            value={person}
            onChange={(v) => (setPerson(v), setPicked(found.find((x) => x.id === v) ?? picked))}
            options={[...(picked ? [picked] : []), ...found.filter((x) => x.id !== picked?.id)].map((e) => ({ value: e.id, label: e.id === f.meEmployeeId ? `${e.name} (me)` : e.name }))}
            placeholder="Choose a person"
            searchable
            searchPlaceholder="Type 2 or more letters of the name"
            emptyText="Type 2 or more letters of the name"
            onSearchChange={(q) => void search(q)}
          />
        </FormField>
      ) : (
        <FieldRow>
          <FormField id="ra-name" label="Name" required error={early.errorOf('ra-name')}>
            <TextField value={name} onChange={setName} maxLength={150} />
          </FormField>
          <FormField id="ra-contractor" label="Contractor" required error={early.errorOf('ra-contractor')}>
            <TextField value={contractor} onChange={setContractor} maxLength={150} />
          </FormField>
        </FieldRow>
      )}
      <FieldRow>
        <FormField id="ra-when" label="When" required error={early.errorOf('ra-when')}>
          <DatePicker value={when} onChange={setWhen} max={live.today} />
        </FormField>
        <FormField id="ra-time" label="Time" required error={early.errorOf('ra-time')}>
          <TimeField value={time} onChange={setTime} />
        </FormField>
      </FieldRow>
      <FieldRow>
        <FormField id="ra-loc" label="Location" required error={early.errorOf('ra-loc')}>
          <Select value={loc} onChange={setLoc} options={f.locations.map((l) => ({ value: l.id, label: l.name }))} placeholder="Choose a location" />
        </FormField>
        <FormField id="ra-place" label="Where exactly" required error={early.errorOf('ra-place')}>
          <TextField value={place} onChange={setPlace} maxLength={200} />
        </FormField>
      </FieldRow>
      <FormField id="ra-what" label="What happened" required error={early.errorOf('ra-what')}>
        <TextArea rows={4} value={what} onChange={setWhat} maxLength={5000} />
      </FormField>
      <FieldRow>
        <FormField id="ra-type" label="Injury type" required error={early.errorOf('ra-type')}>
          <Select value={type} onChange={setType} options={f.injuryTypes.map((t) => ({ value: t, label: t }))} placeholder="Choose" />
        </FormField>
        <FormField label="Body part" optional>
          <TextField value={part} onChange={setPart} maxLength={100} />
        </FormField>
      </FieldRow>
      <FormField label="Witnesses" optional>
        <TextField value={witnesses} onChange={setWitnesses} maxLength={300} />
      </FormField>
      <Checkbox checked={firstAid} onChange={setFirstAid} label="First aid was given" />
      <FormField label="Photos" optional helper="JPG or PNG, up to 10 MB each. They are sent with the report.">
        <FileUpload multiple accept={['.jpg', '.png']} capture={device === 'phone' ? 'environment' : undefined} upload={async (x) => void setPhotos((all) => [...all, x])} />
      </FormField>
    </div>
  );
  if (device === 'phone')
    return (
      <PhoneFrame tab="me" title="Report an accident" back={<IconButton icon={ArrowLeft} label="Back" onClick={live.onDone} />} hideTabs>
        {fields}
        <Button variant="primary" fullWidth icon={Camera} loading={busy} onClick={() => void send()}>
          Send report
        </Button>
      </PhoneFrame>
    );
  return (
    <OpsDesk area="helpdesk" active="Speak-up" member={false}>
      <PageHeader title="Report an accident" description="The safety team gets it at once. You can report for yourself or for someone else." />
      <Card
        footer={
          <Actions end>
            <Button onClick={live.onDone}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={() => void send()}>
              Send report
            </Button>
          </Actions>
        }
      >
        <div className="yx-ops-narrow">{fields}</div>
      </Card>
    </OpsDesk>
  );
}

export function LiveReportAccident({ live, device: asked }: { live: LiveReportAccident; device?: Device }) {
  const narrow = useNarrow();
  const device: Device = asked ?? (narrow ? 'phone' : 'desk');
  if (live.state === 'ready' && live.form) return <ReportForm live={live} f={live.form} device={device} />;
  const body =
    live.state === 'error' || live.state === 'no-access' ? (
      <ErrorState title="We couldn't load the form." description="Try again in a moment." onRetry={live.onRetry} />
    ) : (
      <div className="yx-ops-stack" role="status" aria-busy="true" aria-label="Loading the form">
        <Skeleton height={200} />
      </div>
    );
  if (device === 'phone')
    return (
      <PhoneFrame tab="me" title="Report an accident" back={<IconButton icon={ArrowLeft} label="Back" onClick={live.onDone} />} hideTabs>
        {body}
      </PhoneFrame>
    );
  return (
    <OpsDesk area="helpdesk" active="Speak-up" member={false}>
      <PageHeader title="Report an accident" />
      {body}
    </OpsDesk>
  );
}
