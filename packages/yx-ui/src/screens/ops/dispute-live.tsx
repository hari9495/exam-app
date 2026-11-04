// HLP-13 Collective dispute, live (Helpdesk design wiring): the designed CollectiveDisputeScreen in cases-more.tsx renders
// this when the page passes `live`. Same layout as the design: the confidential header with the stage badge and facts,
// the stage trail, the Demands / Meetings / Settlement terms tabs, the next dates and who can see the dispute; "Not
// found" for anyone off the industrial relations team. States only the real record has are drawn in the same look:
// adding and settling demands, logging a meeting with its minutes, recording the signed settlement, a settlement waiting
// for the second IR member, sent back, sent to payroll arrears, the copy filed, and closing without a settlement. Plus
// "Record a dispute" on the Cases list. The server checks every rule again (docs/yukthix/helpdesk-design-map.md 4h);
// legal clocks come from its rule sets, never from here.
import { useState } from 'react';
import { FileText, Handshake, Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { FieldRow, FormField, useTooEarly } from '../../components/field';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { DatePicker } from '../../components/date';
import { FileUpload } from '../../components/upload';
import { DataTable } from '../../components/table';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { MenuItem } from '../../components/menu';
import { Dialog } from '../../components/overlay';
import { formatDate, formatINR } from '../../lib/format';
import { errorText } from '../org/org-kit';
import type { LoadState } from '../desk/types';
import { Actions, ClockPanel, Confidential, MembersList, OpsDesk, StatusTrail, Workspace, useSay } from './ops-kit';
import type { ClockItem } from './ops-rules';
import { RestrictedNotFound } from './cases';

/* ---------------- what the API sends ---------------- */

export type DemandStatus = 'open' | 'agreed' | 'withdrawn' | 'rejected';
export type WorkerCategory = 'unskilled' | 'semi_skilled' | 'skilled' | 'highly_skilled';
export interface DisputePaper {
  id: string;
  title: string;
  name: string;
  sha256: string;
  scan: 'clean' | 'pending' | 'infected';
}
export interface DisputeClock {
  key: 'next' | 'report' | 'copy';
  label: string;
  due: string | null;
  doneOn: string | null;
}
export interface SettlementTerms {
  kind: 'conciliation' | 'bipartite';
  signedOn: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  covered: string;
  terms: string;
  rates: { category: WorkerCategory; monthlyIncrease: string }[];
  paper: DisputePaper | null;
}
/** GET desk/disputes/:id (the industrial relations team only). */
export interface DisputeDetail {
  id: string;
  number: string;
  title: string;
  unionName: string;
  location: string;
  workersCovered: number;
  receivedOn: string;
  recordedBy: string;
  stage: string;
  demands: { id: string; code: string; text: string; union: string; mgmt: string; status: DemandStatus; agreed: string | null }[];
  meetings: { id: string; kind: 'bipartite' | 'conciliation'; on: string; officer: string | null; attended: string; minutes: string; paper: DisputePaper | null; nextOn: string | null; by: string }[];
  papers: (DisputePaper & { by: string; at: string })[];
  nextMeeting: { on: string; kind: 'bipartite' | 'conciliation' } | null;
  settlement: {
    status: 'none' | 'proposed' | 'approved';
    terms: SettlementTerms | null;
    proposedBy: string | null;
    proposedAt: string | null;
    proposedByMe: boolean;
    approvedBy: string | null;
    approvedAt: string | null;
    wageSettlementId: string | null;
    sentBack: { reason: string; by: string; at: string } | null;
    canApprove: boolean;
  };
  filed: { on: string; ref: string | null } | null;
  closed: { how: 'withdrawn' | 'no-settlement'; note: string; on: string } | null;
  clocks: DisputeClock[];
  source: string | null;
  members: { name: string; role: string; access: string; external: boolean }[];
}
export interface DemandInput {
  text: string;
  union: string;
  mgmt: string;
}
export interface MeetingInput {
  kind: 'bipartite' | 'conciliation';
  on: string;
  officer?: string;
  attended: string;
  minutes: string;
  paperId?: string;
  nextOn?: string;
}
export interface SettlementInput {
  kind: 'conciliation' | 'bipartite';
  signedOn: string;
  effectiveFrom: string;
  effectiveTo?: string;
  covered: string;
  terms: string;
  rates: { category: WorkerCategory; monthlyIncrease: string }[];
  paperId: string;
}
export interface RecordDisputeInput {
  title: string;
  unionName: string;
  locationId: string;
  workersCovered: number;
  receivedOn: string;
}

/* ---------------- shared ---------------- */

const asDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);
const day = (iso: string | null | undefined) => (iso ? formatDate(asDate(iso)) : '—');
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toClock = (c: DisputeClock): ClockItem => ({ key: c.key, label: c.label, due: c.due ? asDate(c.due) : null, doneOn: c.doneOn ? asDate(c.doneOn) : null });
export const CATEGORY_LABEL: Record<WorkerCategory, string> = { unskilled: 'Unskilled', semi_skilled: 'Semi-skilled', skilled: 'Skilled', highly_skilled: 'Highly skilled' };
const DEMAND_LABEL: Record<DemandStatus, string> = { open: 'Open', agreed: 'Agreed', withdrawn: 'Withdrawn', rejected: 'Not agreed' };
const DEMAND_TONE: Record<DemandStatus, BadgeTone> = { open: 'warning', agreed: 'success', withdrawn: 'neutral', rejected: 'neutral' };
const MEETING_LABEL = { bipartite: 'Bipartite meeting', conciliation: 'Conciliation meeting' } as const;
const PAPER_TYPES = ['.pdf', '.jpg', '.png'];

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

/** A paper's button: opens it when the virus check is done; its fingerprint beside it. */
function PaperButton({ p, onOpen }: { p: DisputePaper; onOpen: (fileId: string) => void }) {
  const { toast } = useSay();
  return (
    <span className="yx-ops-row">
      <Button size="sm" icon={FileText} onClick={() => (p.scan === 'clean' ? onOpen(p.id) : toast({ title: 'This file is still being checked for viruses. Try again in a minute.' }))}>
        {p.scan === 'clean' ? p.name : `${p.name} (being checked)`}
      </Button>
      <span className="yx-ops-mono yx-ops-muted" title="SHA-256 fingerprint">
        {p.sha256.slice(0, 12)}…
      </span>
    </span>
  );
}

/** Uploads one paper as soon as it is chosen (the server keeps its fingerprint) and hands back its id. */
function PaperField({ id, label, helper, title, error, onPaper, onDone }: { id: string; label: string; helper: string; title: string; error?: string; onPaper: LiveDispute['onPaper']; onDone: (fileId: string | null) => void }) {
  return (
    <FormField id={id} label={label} required={Boolean(error) || undefined} helper={helper} error={error}>
      <FileUpload
        multiple={false}
        accept={PAPER_TYPES}
        upload={async (file, h) => {
          h.onScanning();
          onDone((await onPaper(title, file)).id);
        }}
        onItemsChange={(items) => !items.length && onDone(null)}
      />
    </FormField>
  );
}

/* =========================================================================================
 * The dispute workspace
 * ======================================================================================= */

export type DisputeDialog = 'demand' | 'demand-update' | 'meeting' | 'settlement' | 'send-back' | 'filed' | 'close';
export interface LiveDispute {
  /** 'not-found': not on the IR team, or no such dispute (the same page, APX-D §6.3). */
  state: LoadState | 'not-found';
  onRetry?: () => void;
  /** Today in India, "YYYY-MM-DD". */
  today: string;
  detail: DisputeDetail | null;
  onBack: () => void;
  onDemand: (input: DemandInput) => Promise<void>;
  onDemandUpdate: (demandId: string, input: { status: DemandStatus; agreed?: string; mgmt?: string }) => Promise<void>;
  onMeeting: (input: MeetingInput) => Promise<void>;
  /** Uploads a paper (minutes, the signed settlement); the server keeps its SHA-256. */
  onPaper: (title: string, file: File) => Promise<{ id: string }>;
  onOpenFile: (fileId: string) => void;
  onPropose: (input: SettlementInput) => Promise<void>;
  onApprove: () => Promise<void>;
  onSendBack: (reason: string) => Promise<void>;
  onFiled: (input: { on: string; ref?: string }) => Promise<void>;
  onClose: (input: { how: 'withdrawn' | 'no-settlement'; note: string }) => Promise<void>;
  /** Stories and tests only. */
  start?: { tab?: 'demands' | 'meetings' | 'settlement'; dialog?: DisputeDialog; demandId?: string };
}

const TRAIL = ['Charter received', 'Bipartite talks', 'Conciliation', 'Settlement signed', 'Filed with the authority'];
function trailAt(d: DisputeDetail) {
  if (d.filed) return 5;
  if (d.settlement.status === 'approved') return 4;
  if (d.meetings.some((m) => m.kind === 'conciliation')) return 2;
  return d.meetings.length ? 1 : 0;
}

function LiveDisputeWorkspace({ live, d }: { live: LiveDispute; d: DisputeDetail }) {
  const s = d.settlement;
  const [tab, setTab] = useState(live.start?.tab ?? (s.status === 'none' ? 'demands' : 'settlement'));
  const [dialog, setDialog] = useState<DisputeDialog | null>(live.start?.dialog ?? null);
  const [demandId, setDemandId] = useState<string | null>(live.start?.demandId ?? null);
  const { toast } = useSay();
  const today = asDate(live.today);
  const open = !d.closed && s.status !== 'approved';
  const close = () => setDialog(null);
  const clocks = d.clocks.map(toClock);
  const pending = clocks.filter((c) => !c.doneOn);
  const next = [...pending].sort((a, b) => (a.due?.getTime() ?? 0) - (b.due?.getTime() ?? 0))[0];
  const approve = async () => {
    try {
      await live.onApprove();
      toast({ tone: 'success', title: 'Settlement approved and sent to payroll arrears', description: 'Payroll checks it in Special pay › Settlements and pays it in a pay run as usual. Nothing is paid until then.' });
    } catch (e) {
      toast({ title: errorText(e) });
    }
  };
  const agreed = d.demands.filter((x) => x.status === 'agreed').length;
  const tone: BadgeTone = d.closed ? 'neutral' : s.status === 'approved' ? 'success' : s.status === 'proposed' ? 'warning' : 'info';

  const terms = s.terms && (
    <DescriptionList
      columns={2}
      items={[
        { label: 'Type', value: s.terms.kind === 'conciliation' ? 'Settlement in conciliation' : 'Bipartite settlement' },
        { label: 'Signed', value: day(s.terms.signedOn) },
        { label: 'Effective', value: s.terms.effectiveTo ? `${day(s.terms.effectiveFrom)} to ${day(s.terms.effectiveTo)}` : `From ${day(s.terms.effectiveFrom)}` },
        { label: 'Covered categories', value: s.terms.covered },
        { label: 'Terms', value: s.terms.terms },
        { label: 'Pay terms (arrears)', value: s.terms.rates.map((r) => `${CATEGORY_LABEL[r.category]} +${formatINR(Number(r.monthlyIncrease))} a month`).join(', ') },
        { label: 'Signed copy', value: s.terms.paper ? <PaperButton p={s.terms.paper} onOpen={live.onOpenFile} /> : '—' },
        { label: 'Authority copy', value: d.filed ? `Filed ${day(d.filed.on)}${d.filed.ref ? ` (${d.filed.ref})` : ''}` : 'Not filed yet' },
      ]}
    />
  );

  const settlement =
    s.status === 'approved' ? (
      <div className="yx-ops-stack">
        {terms}
        <InlineAlert tone="info" title={`Sent to payroll arrears ${day(s.approvedAt)}`}>
          Recorded by {s.proposedBy}, approved by {s.approvedBy}. Payroll checks the arrears in Special pay › Settlements and pays them in a pay run as usual. Nothing is paid automatically.
        </InlineAlert>
      </div>
    ) : s.status === 'proposed' ? (
      <div className="yx-ops-stack">
        <InlineAlert
          tone="warning"
          title={s.proposedByMe ? 'Waiting for a second IR member' : 'This settlement needs your approval'}
          actions={
            s.canApprove ? (
              <Button size="sm" variant="primary" onClick={() => void approve()}>
                Approve and send to payroll
              </Button>
            ) : undefined
          }
        >
          {s.proposedByMe
            ? `You recorded it ${day(s.proposedAt)}. Someone else on the industrial relations team approves it; then its pay terms go to payroll arrears.`
            : s.canApprove
              ? `${s.proposedBy} recorded it ${day(s.proposedAt)}. Check it against the signed copy. Approving sends the pay terms to payroll arrears.`
              : `${s.proposedBy} recorded it ${day(s.proposedAt)}. Your company lets only its own IR team members approve it.`}
        </InlineAlert>
        {terms}
      </div>
    ) : (
      <div className="yx-ops-stack">
        {s.sentBack && (
          <InlineAlert tone="warning" title={`Sent back by ${s.sentBack.by}, ${day(s.sentBack.at)}`}>
            {s.sentBack.reason}
          </InlineAlert>
        )}
        <EmptyState
          compact
          title="No settlement yet."
          description="Record it once both sides sign. A second IR member approves it; then the pay terms go to payroll arrears."
          action={open ? <Button onClick={() => setDialog('settlement')}>Record settlement</Button> : undefined}
        />
      </div>
    );

  return (
    <OpsDesk area="helpdesk" active="Cases">
      <Confidential note="Confidential. Visible to the industrial relations team of this company. Every view is logged.">
        <ObjectHeader
          name={d.title}
          icon={Handshake}
          secondary={
            <span>
              <span className="yx-ops-mono">{d.number}</span> · Collective dispute · {d.unionName} · {d.location}
            </span>
          }
          status={<Badge tone={tone}>{d.stage}</Badge>}
          facts={[
            { label: 'Workers covered', value: String(d.workersCovered) },
            { label: 'Demands', value: `${d.demands.length} (${agreed} agreed)` },
            { label: 'Next', value: next ? `${next.label}, ${formatDate(next.due!)}` : '—' },
          ]}
          actions={
            open ? (
              <>
                <Button onClick={() => setDialog('meeting')}>Log meeting</Button>
                {s.status === 'proposed' && s.canApprove ? (
                  <Button variant="primary" onClick={() => void approve()}>
                    Approve and send to payroll
                  </Button>
                ) : s.status === 'none' ? (
                  <Button variant="primary" onClick={() => setDialog('settlement')}>
                    Record settlement
                  </Button>
                ) : null}
              </>
            ) : s.status === 'approved' ? (
              <>
                {s.terms?.paper && (
                  <Button icon={FileText} onClick={() => (s.terms!.paper!.scan === 'clean' ? live.onOpenFile(s.terms!.paper!.id) : toast({ title: 'This file is still being checked for viruses. Try again in a minute.' }))}>
                    Open signed settlement
                  </Button>
                )}
                {!d.filed && (
                  <Button variant="primary" onClick={() => setDialog('filed')}>
                    Record copy filed
                  </Button>
                )}
              </>
            ) : undefined
          }
          menu={
            open ? (
              <>
                <MenuItem onSelect={() => setDialog('demand')}>Add demand</MenuItem>
                {s.status === 'proposed' && <MenuItem onSelect={() => setDialog('send-back')}>{s.proposedByMe ? 'Withdraw the settlement' : 'Send the settlement back'}</MenuItem>}
                {s.status === 'none' && <MenuItem onSelect={() => setDialog('close')}>Close without a settlement</MenuItem>}
              </>
            ) : undefined
          }
        />
        <StatusTrail steps={TRAIL.map((label) => ({ label }))} current={trailAt(d)} label="Dispute stages" />
        {d.closed && (
          <InlineAlert tone="info" title={`Closed ${day(d.closed.on)}: ${d.closed.how === 'withdrawn' ? 'withdrawn' : 'no settlement'}`}>
            {d.closed.note}
          </InlineAlert>
        )}
        <Workspace
          main={
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList aria-label="Dispute sections">
                <TabsTrigger value="demands" count={d.demands.length}>
                  Demands
                </TabsTrigger>
                <TabsTrigger value="meetings" count={d.meetings.length}>
                  Meetings
                </TabsTrigger>
                <TabsTrigger value="settlement">Settlement terms</TabsTrigger>
              </TabsList>
              <TabsContent value="demands">
                <div className="yx-ops-stack">
                  <DataTable
                    label="Demands"
                    columns={[
                      { key: 'code', header: '#', type: 'id', value: (x) => x.code, width: 60 },
                      { key: 'text', header: 'Demand', value: (x) => x.text, width: 320 },
                      { key: 'union', header: 'Union', value: (x) => x.union },
                      { key: 'mgmt', header: 'Management', value: (x) => x.mgmt },
                      { key: 'status', header: 'Status', type: 'status', value: (x) => (x.status === 'agreed' && x.agreed ? `Agreed at ${x.agreed}` : DEMAND_LABEL[x.status]), statusTone: (v) => (String(v).startsWith('Agreed') ? 'success' : v === 'Open' ? 'warning' : 'neutral') },
                    ]}
                    rows={d.demands}
                    getRowId={(x) => x.id}
                    empty={<EmptyState compact title="No demands yet." description="Add each demand of the charter, with the union's and the company's positions." />}
                    onRowClick={open ? (x) => (setDemandId(x.id), setDialog('demand-update')) : undefined}
                  />
                  {open && (
                    <Actions>
                      <Button icon={Plus} onClick={() => setDialog('demand')}>
                        Add demand
                      </Button>
                    </Actions>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="meetings">
                {d.meetings.length ? (
                  <ol className="yx-ops-conv" aria-label="Meetings">
                    {d.meetings.map((m) => (
                      <li key={m.id} className="yx-ops-msg">
                        <span className="yx-ops-msg__meta">
                          <span className="yx-ops-msg__who">{MEETING_LABEL[m.kind]}</span>
                          <span>{day(m.on)}</span>
                        </span>
                        <p className="yx-ops-msg__body">
                          {m.minutes} Attended: {m.attended}
                          {m.officer ? `; conciliation officer ${m.officer}` : ''}.{m.nextOn ? ` Next meeting ${day(m.nextOn)}.` : ''}
                        </p>
                        {m.paper && <PaperButton p={m.paper} onOpen={live.onOpenFile} />}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <EmptyState compact title="No meetings logged yet." description="Log each bipartite talk and conciliation meeting once it is held, with its minutes." action={open ? <Button onClick={() => setDialog('meeting')}>Log meeting</Button> : undefined} />
                )}
              </TabsContent>
              <TabsContent value="settlement">{settlement}</TabsContent>
            </Tabs>
          }
          rail={
            <>
              <ClockPanel title="Next dates" today={today} items={pending.length ? pending : clocks.slice(-1)} source={d.source ? `Time limits from ${d.source}` : undefined} />
              <Card>
                <MembersList members={d.members} title="Who can see this dispute" />
              </Card>
            </>
          }
        />
      </Confidential>
      <DemandDialog live={live} open={dialog === 'demand'} onClose={close} />
      <DemandUpdateDialog live={live} demand={d.demands.find((x) => x.id === demandId) ?? null} open={dialog === 'demand-update'} onClose={close} />
      <MeetingDialog live={live} d={d} open={dialog === 'meeting'} onClose={close} />
      <SettlementDialog live={live} d={d} open={dialog === 'settlement'} onClose={close} />
      <ReasonDialog live={live} mine={s.proposedByMe} open={dialog === 'send-back'} onClose={close} />
      <FiledDialog live={live} d={d} open={dialog === 'filed'} onClose={close} />
      <CloseDialog live={live} open={dialog === 'close'} onClose={close} />
    </OpsDesk>
  );
}

function Footer({ busy, label, onCancel, onSave }: { busy: boolean; label: string; onCancel: () => void; onSave: () => void }) {
  return (
    <>
      <Button onClick={onCancel}>Cancel</Button>
      <Button variant="primary" loading={busy} onClick={onSave}>
        {label}
      </Button>
    </>
  );
}

function DemandDialog({ live, open, onClose }: { live: LiveDispute; open: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  const [union, setUnion] = useState('');
  const [mgmt, setMgmt] = useState('');
  const { busy, act, alert, clear } = useAct();
  const early = useTooEarly([
    ...(text.trim().length < 3 ? [{ fieldId: 'dd-text', message: 'Write the demand as the charter puts it.' }] : []),
    ...(!union.trim() ? [{ fieldId: 'dd-union', message: 'Write what the union asks.' }] : []),
    ...(!mgmt.trim() ? [{ fieldId: 'dd-mgmt', message: 'Write the company’s position.' }] : []),
  ]);
  const save = async () => {
    if (early.stop()) return;
    if (await act(() => live.onDemand({ text: text.trim(), union: union.trim(), mgmt: mgmt.trim() }), 'Demand added')) (setText(''), setUnion(''), setMgmt(''), early.reset(), onClose());
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && (clear(), onClose())} title="Add demand" notice={alert} footer={<Footer busy={busy} label="Add demand" onCancel={onClose} onSave={() => void save()} />}>
      <div className="yx-ops-stack">
        <FormField id="dd-text" label="Demand" required error={early.errorOf('dd-text')}>
          <TextArea rows={2} value={text} onChange={setText} maxLength={500} />
        </FormField>
        <FieldRow>
          <FormField id="dd-union" label="Union asks" required helper="In short, like 18 %." error={early.errorOf('dd-union')}>
            <TextField value={union} onChange={setUnion} maxLength={200} />
          </FormField>
          <FormField id="dd-mgmt" label="Company position" required error={early.errorOf('dd-mgmt')}>
            <TextField value={mgmt} onChange={setMgmt} maxLength={200} />
          </FormField>
        </FieldRow>
      </div>
    </Dialog>
  );
}

function DemandUpdateDialog({ live, demand, open, onClose }: { live: LiveDispute; demand: DisputeDetail['demands'][number] | null; open: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<DemandStatus | null>(null);
  const [agreed, setAgreed] = useState('');
  const [mgmt, setMgmt] = useState('');
  const { busy, act, alert, clear } = useAct();
  const chosen = status ?? demand?.status ?? 'open';
  const early = useTooEarly(chosen === 'agreed' && !(agreed.trim() || demand?.agreed) ? [{ fieldId: 'du-agreed', message: 'Write what was agreed.' }] : []);
  const save = async () => {
    if (!demand || early.stop()) return;
    const input = { status: chosen, ...(chosen === 'agreed' ? { agreed: agreed.trim() || demand.agreed! } : {}), ...(mgmt.trim() ? { mgmt: mgmt.trim() } : {}) };
    if (await act(() => live.onDemandUpdate(demand.id, input), `${demand.code} updated`)) (setStatus(null), setAgreed(''), setMgmt(''), early.reset(), onClose());
  };
  return (
    <Dialog open={open && Boolean(demand)} onOpenChange={(o) => !o && (clear(), onClose())} title={demand ? `${demand.code} · ${demand.text}` : 'Demand'} notice={alert} footer={<Footer busy={busy} label="Save" onCancel={onClose} onSave={() => void save()} />}>
      <div className="yx-ops-stack">
        <FormField label="Where it stands">
          <Segment label="Where it stands" value={chosen} onChange={setStatus} options={(Object.keys(DEMAND_LABEL) as DemandStatus[]).map((v) => ({ value: v, label: DEMAND_LABEL[v] }))} />
        </FormField>
        {chosen === 'agreed' && (
          <FormField id="du-agreed" label="Agreed at" required helper="As both sides agreed, like 11 %." error={early.errorOf('du-agreed')}>
            <TextField value={agreed || demand?.agreed || ''} onChange={setAgreed} maxLength={200} />
          </FormField>
        )}
        <FormField label="Company position now" optional helper={demand ? `Now: ${demand.mgmt}` : undefined}>
          <TextField value={mgmt} onChange={setMgmt} maxLength={200} />
        </FormField>
      </div>
    </Dialog>
  );
}

function MeetingDialog({ live, d, open, onClose }: { live: LiveDispute; d: DisputeDetail; open: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<'bipartite' | 'conciliation'>(d.meetings.some((m) => m.kind === 'conciliation') ? 'conciliation' : 'bipartite');
  const [on, setOn] = useState<Date | null>(null);
  const [officer, setOfficer] = useState(d.meetings.filter((m) => m.officer).at(-1)?.officer ?? '');
  const [attended, setAttended] = useState('');
  const [minutes, setMinutes] = useState('');
  const [paperId, setPaperId] = useState<string | null>(null);
  const [nextOn, setNextOn] = useState<Date | null>(null);
  const { busy, act, alert, clear } = useAct();
  const today = asDate(live.today);
  const early = useTooEarly([
    ...(!on ? [{ fieldId: 'mt-on', message: 'Choose the day it was held.' }] : []),
    ...(kind === 'conciliation' && !officer.trim() ? [{ fieldId: 'mt-officer', message: 'Name the conciliation officer.' }] : []),
    ...(attended.trim().length < 2 ? [{ fieldId: 'mt-attended', message: 'Say who attended.' }] : []),
    ...(minutes.trim().length < 10 ? [{ fieldId: 'mt-minutes', message: 'Write what was discussed (10 letters or more).' }] : []),
    ...(on && nextOn && nextOn <= on ? [{ fieldId: 'mt-next', message: 'The next meeting comes after this one.' }] : []),
  ]);
  const save = async () => {
    if (early.stop()) return;
    const input: MeetingInput = { kind, on: isoDay(on!), ...(kind === 'conciliation' ? { officer: officer.trim() } : {}), attended: attended.trim(), minutes: minutes.trim(), ...(paperId ? { paperId } : {}), ...(nextOn ? { nextOn: isoDay(nextOn) } : {}) };
    if (await act(() => live.onMeeting(input), 'Meeting logged', nextOn ? `Next meeting ${formatDate(nextOn)}.` : undefined)) (setOn(null), setAttended(''), setMinutes(''), setPaperId(null), setNextOn(null), early.reset(), onClose());
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && (clear(), onClose())} title="Log meeting" description="Log a meeting once it is held. People negotiate; the app keeps the record." notice={alert} footer={<Footer busy={busy} label="Log meeting" onCancel={onClose} onSave={() => void save()} />}>
      <div className="yx-ops-stack">
        <FormField label="Meeting">
          <Segment label="Meeting" value={kind} onChange={setKind} options={[{ value: 'bipartite', label: 'Bipartite (with the union)' }, { value: 'conciliation', label: 'Conciliation' }]} />
        </FormField>
        <FieldRow>
          <FormField id="mt-on" label="Held on" required error={early.errorOf('mt-on')}>
            <DatePicker value={on} onChange={setOn} min={asDate(d.receivedOn)} max={today} />
          </FormField>
          <FormField id="mt-next" label="Next meeting" optional error={early.errorOf('mt-next')}>
            <DatePicker value={nextOn} onChange={setNextOn} min={today} />
          </FormField>
        </FieldRow>
        {kind === 'conciliation' && (
          <FormField id="mt-officer" label="Conciliation officer" required helper="Name and office, like Assistant Labour Commissioner, Hosur." error={early.errorOf('mt-officer')}>
            <TextField value={officer} onChange={setOfficer} maxLength={150} />
          </FormField>
        )}
        <FormField id="mt-attended" label="Attended" required error={early.errorOf('mt-attended')}>
          <TextField value={attended} onChange={setAttended} maxLength={500} />
        </FormField>
        <FormField id="mt-minutes" label="What was discussed" required error={early.errorOf('mt-minutes')}>
          <TextArea rows={3} value={minutes} onChange={setMinutes} maxLength={5000} />
        </FormField>
        <PaperField id="mt-paper" label="Minutes (signed copy)" helper="PDF, JPG or PNG, up to 10 MB. Its fingerprint is kept so any change shows." title={`Minutes, ${MEETING_LABEL[kind].toLowerCase()}${on ? ` ${isoDay(on)}` : ''}`} onPaper={live.onPaper} onDone={setPaperId} />
      </div>
    </Dialog>
  );
}

const CATEGORIES = Object.keys(CATEGORY_LABEL) as WorkerCategory[];
function SettlementDialog({ live, d, open, onClose }: { live: LiveDispute; d: DisputeDetail; open: boolean; onClose: () => void }) {
  const concil = d.meetings.some((m) => m.kind === 'conciliation');
  const [kind, setKind] = useState<'conciliation' | 'bipartite'>(concil ? 'conciliation' : 'bipartite');
  const [signedOn, setSignedOn] = useState<Date | null>(null);
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const [covered, setCovered] = useState('');
  const [terms, setTerms] = useState('');
  const [rates, setRates] = useState<{ category: WorkerCategory | null; amount: number | null }[]>([{ category: null, amount: null }]);
  const [paperId, setPaperId] = useState<string | null>(null);
  const { busy, act, alert, clear } = useAct();
  const today = asDate(live.today);
  const cats = rates.map((r) => r.category).filter(Boolean);
  const early = useTooEarly([
    ...(!signedOn ? [{ fieldId: 'st-signed', message: 'Choose the day both sides signed.' }] : []),
    ...(!from ? [{ fieldId: 'st-from', message: 'Choose the day it takes effect.' }] : []),
    ...(from && to && to < from ? [{ fieldId: 'st-to', message: 'It ends after it starts.' }] : []),
    ...(covered.trim().length < 3 ? [{ fieldId: 'st-covered', message: 'Say which workers it covers.' }] : []),
    ...(terms.trim().length < 10 ? [{ fieldId: 'st-terms', message: 'Write the agreed terms (10 letters or more).' }] : []),
    ...(rates.some((r) => !r.category || !r.amount || r.amount <= 0) ? [{ fieldId: 'st-rates', message: 'Give each worker category and its monthly increase.' }] : []),
    ...(new Set(cats).size !== cats.length ? [{ fieldId: 'st-rates', message: 'Each worker category once.' }] : []),
    ...(!paperId ? [{ fieldId: 'st-paper', message: 'Add the signed copy.' }] : []),
  ]);
  const save = async () => {
    if (early.stop()) return;
    const input: SettlementInput = { kind, signedOn: isoDay(signedOn!), effectiveFrom: isoDay(from!), ...(to ? { effectiveTo: isoDay(to) } : {}), covered: covered.trim(), terms: terms.trim(), rates: rates.map((r) => ({ category: r.category!, monthlyIncrease: String(r.amount) })), paperId: paperId! };
    if (await act(() => live.onPropose(input), 'Settlement recorded', 'A second IR member approves it; then its pay terms go to payroll arrears.')) (early.reset(), onClose());
  };
  const setRate = (i: number, p: Partial<(typeof rates)[number]>) => setRates(rates.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && (clear(), onClose())} title="Record settlement" description="As both sides signed it. A second member of the industrial relations team approves it before payroll sees it." notice={alert} footer={<Footer busy={busy} label="Record settlement" onCancel={onClose} onSave={() => void save()} />}>
      <div className="yx-ops-stack">
        <FormField label="Settlement">
          <Segment label="Settlement" value={kind} onChange={setKind} options={[{ value: 'conciliation', label: 'In conciliation' }, { value: 'bipartite', label: 'Bipartite' }]} />
        </FormField>
        <FieldRow>
          <FormField id="st-signed" label="Signed on" required error={early.errorOf('st-signed')}>
            <DatePicker value={signedOn} onChange={setSignedOn} min={asDate(d.receivedOn)} max={today} />
          </FormField>
          <FormField id="st-from" label="Takes effect" required helper="Arrears run from here." error={early.errorOf('st-from')}>
            <DatePicker value={from} onChange={setFrom} />
          </FormField>
          <FormField id="st-to" label="Ends" optional error={early.errorOf('st-to')}>
            <DatePicker value={to} onChange={setTo} />
          </FormField>
        </FieldRow>
        <FormField id="st-covered" label="Workers covered" required helper="For example: Unskilled, semi-skilled and skilled (Hosur plant)." error={early.errorOf('st-covered')}>
          <TextField value={covered} onChange={setCovered} maxLength={300} />
        </FormField>
        <FormField id="st-terms" label="Agreed terms" required error={early.errorOf('st-terms')}>
          <TextArea rows={3} value={terms} onChange={setTerms} maxLength={5000} />
        </FormField>
        <FormField id="st-rates" label="Pay terms for payroll arrears" required helper="The monthly increase per worker category; payroll works out each worker's arrears from the day it takes effect." error={early.errorOf('st-rates')}>
          <div className="yx-ops-stack" data-gap="sm">
            {rates.map((r, i) => (
              <FieldRow key={i}>
                <Select aria-label={`Worker category ${i + 1}`} value={r.category} onChange={(v) => setRate(i, { category: v })} options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} placeholder="Worker category" />
                <NumberField aria-label={`Monthly increase ${i + 1} (₹)`} value={r.amount} onChange={(v) => setRate(i, { amount: v })} min={1} decimals />
              </FieldRow>
            ))}
            {rates.length < CATEGORIES.length && (
              <Actions>
                <Button size="sm" icon={Plus} onClick={() => setRates([...rates, { category: null, amount: null }])}>
                  Add category
                </Button>
              </Actions>
            )}
          </div>
        </FormField>
        <PaperField id="st-paper" label="Signed copy" helper="PDF, JPG or PNG, up to 10 MB. Its fingerprint is kept so any change shows." title="Signed settlement" error={early.errorOf('st-paper')} onPaper={live.onPaper} onDone={setPaperId} />
      </div>
    </Dialog>
  );
}

function ReasonDialog({ live, mine, open, onClose }: { live: LiveDispute; mine: boolean; open: boolean; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const { busy, act, alert, clear } = useAct();
  const early = useTooEarly(reason.trim().length < 5 ? [{ fieldId: 'sb-reason', message: 'Say why (5 letters or more).' }] : []);
  const save = async () => {
    if (early.stop()) return;
    if (await act(() => live.onSendBack(reason.trim()), mine ? 'Settlement withdrawn' : 'Settlement sent back', 'It can be recorded again, corrected.')) (setReason(''), early.reset(), onClose());
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && (clear(), onClose())} size="sm" title={mine ? 'Withdraw the settlement' : 'Send the settlement back'} notice={alert} footer={<Footer busy={busy} label={mine ? 'Withdraw' : 'Send back'} onCancel={onClose} onSave={() => void save()} />}>
      <FormField id="sb-reason" label="Reason" required error={early.errorOf('sb-reason')}>
        <TextArea rows={3} value={reason} onChange={setReason} maxLength={1000} />
      </FormField>
    </Dialog>
  );
}

function FiledDialog({ live, d, open, onClose }: { live: LiveDispute; d: DisputeDetail; open: boolean; onClose: () => void }) {
  const [on, setOn] = useState<Date | null>(asDate(live.today));
  const [ref, setRef] = useState('');
  const { busy, act, alert, clear } = useAct();
  const early = useTooEarly(!on ? [{ fieldId: 'fl-on', message: 'Choose the day the copy was sent.' }] : []);
  const save = async () => {
    if (early.stop()) return;
    if (await act(() => live.onFiled({ on: isoDay(on!), ...(ref.trim() ? { ref: ref.trim() } : {}) }), 'Copy filed recorded')) (early.reset(), onClose());
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && (clear(), onClose())} size="sm" title="Record copy filed" description="The day the settlement's copy went to the conciliation officer and the Government. The app never files it." notice={alert} footer={<Footer busy={busy} label="Save" onCancel={onClose} onSave={() => void save()} />}>
      <div className="yx-ops-stack">
        <FormField id="fl-on" label="Sent on" required error={early.errorOf('fl-on')}>
          <DatePicker value={on} onChange={setOn} min={d.settlement.terms ? asDate(d.settlement.terms.signedOn) : undefined} max={asDate(live.today)} />
        </FormField>
        <FormField label="Receipt or reference" optional>
          <TextField value={ref} onChange={setRef} maxLength={80} />
        </FormField>
      </div>
    </Dialog>
  );
}

function CloseDialog({ live, open, onClose }: { live: LiveDispute; open: boolean; onClose: () => void }) {
  const [how, setHow] = useState<'withdrawn' | 'no-settlement' | null>(null);
  const [note, setNote] = useState('');
  const { busy, act, alert, clear } = useAct();
  const early = useTooEarly([...(!how ? [{ fieldId: 'cl-how', message: 'Choose how it ended.' }] : []), ...(note.trim().length < 5 ? [{ fieldId: 'cl-note', message: 'Say what happened (5 letters or more).' }] : [])]);
  const save = async () => {
    if (early.stop()) return;
    if (await act(() => live.onClose({ how: how!, note: note.trim() }), 'Dispute closed', 'The record stays; nothing can be added now.')) (early.reset(), onClose());
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && (clear(), onClose())} size="sm" title="Close without a settlement" notice={alert} footer={<Footer busy={busy} label="Close dispute" onCancel={onClose} onSave={() => void save()} />}>
      <div className="yx-ops-stack">
        <FormField id="cl-how" label="How it ended" required error={early.errorOf('cl-how')}>
          <Segment label="How it ended" value={how} onChange={setHow} options={[{ value: 'withdrawn', label: 'Withdrawn' }, { value: 'no-settlement', label: 'No settlement' }]} />
        </FormField>
        <FormField id="cl-note" label="What happened" required helper="A failure report or a reference to the tribunal is kept outside the app for now." error={early.errorOf('cl-note')}>
          <TextArea rows={3} value={note} onChange={setNote} maxLength={1000} />
        </FormField>
      </div>
    </Dialog>
  );
}

export function LiveDisputeCase({ live }: { live: LiveDispute }) {
  if (live.state === 'not-found') return <RestrictedNotFound />;
  if (live.state === 'ready' && live.detail) return <LiveDisputeWorkspace live={live} d={live.detail} />;
  return (
    <OpsDesk area="helpdesk" active="Cases">
      <PageHeader title="Collective dispute" />
      {live.state === 'error' || live.state === 'no-access' ? (
        <ErrorState title="We couldn't load this dispute." description="Try again in a moment." onRetry={live.onRetry} />
      ) : (
        <div className="yx-ops-stack" role="status" aria-busy="true" aria-label="Loading the dispute">
          <Skeleton height={96} />
          <Skeleton height={240} />
        </div>
      )}
    </OpsDesk>
  );
}

/* =========================================================================================
 * "Record a dispute" on the Cases list (the IR team only)
 * ======================================================================================= */

export interface DisputeRecord {
  locations: { id: string; name: string }[];
  onRecord: (input: RecordDisputeInput) => Promise<{ id: string; number: string }>;
}
export function RecordDisputeDrawer({ open, onOpenChange, record, today, onRecorded }: { open: boolean; onOpenChange: (o: boolean) => void; record: DisputeRecord; today: Date; onRecorded: (id: string) => void }) {
  const [title, setTitle] = useState('');
  const [unionName, setUnionName] = useState('');
  const [locationId, setLocationId] = useState<string | null>(record.locations.length === 1 ? record.locations[0].id : null);
  const [workers, setWorkers] = useState<number | null>(null);
  const [receivedOn, setReceivedOn] = useState<Date | null>(null);
  const { busy, act, alert } = useAct();
  const early = useTooEarly([
    ...(title.trim().length < 3 ? [{ fieldId: 'rd-title', message: 'Name the dispute, like Charter of demands 2026.' }] : []),
    ...(unionName.trim().length < 2 ? [{ fieldId: 'rd-union', message: 'Name the union or workers’ group.' }] : []),
    ...(!locationId ? [{ fieldId: 'rd-location', message: 'Choose the location.' }] : []),
    ...(!workers || workers < 1 ? [{ fieldId: 'rd-workers', message: 'Give the number of workers covered.' }] : []),
    ...(!receivedOn ? [{ fieldId: 'rd-received', message: 'Choose the day the charter was received.' }] : []),
  ]);
  const submit = async () => {
    if (early.stop()) return;
    let id = '';
    const ok = await act(
      async () => {
        id = (await record.onRecord({ title: title.trim(), unionName: unionName.trim(), locationId: locationId!, workersCovered: workers!, receivedOn: isoDay(receivedOn!) })).id;
      },
      'Dispute recorded',
      'Add the demands of the charter next.',
    );
    if (ok) onRecorded(id);
  };
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Record a dispute"
      subtitle="Seen only by the industrial relations team"
      notice={alert}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            Record dispute
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        <FormField id="rd-title" label="Dispute" required helper="For example: Charter of demands 2026." error={early.errorOf('rd-title')}>
          <TextField value={title} onChange={setTitle} maxLength={200} />
        </FormField>
        <FormField id="rd-union" label="Raised by (union or workers' group)" required error={early.errorOf('rd-union')}>
          <TextField value={unionName} onChange={setUnionName} maxLength={200} />
        </FormField>
        <FormField id="rd-location" label="Location" required helper="Its legal entity pays any settlement arrears." error={early.errorOf('rd-location')}>
          <Select value={locationId} onChange={setLocationId} options={record.locations.map((l) => ({ value: l.id, label: l.name }))} placeholder="Choose a location" />
        </FormField>
        <FieldRow>
          <FormField id="rd-workers" label="Workers covered" required error={early.errorOf('rd-workers')}>
            <NumberField value={workers} onChange={setWorkers} min={1} max={1_000_000} />
          </FormField>
          <FormField id="rd-received" label="Charter received on" required error={early.errorOf('rd-received')}>
            <DatePicker value={receivedOn} onChange={setReceivedOn} max={today} />
          </FormField>
        </FieldRow>
      </div>
    </Drawer>
  );
}
