// HLP-07 My cases, HLP-08 Cases (case team) and HLP-09 Ethics desk, live (Helpdesk design wiring): the designed
// MyCasesScreen, CaseListScreen, CaseWorkspaceScreen and EthicsDeskScreen in cases.tsx render these when the page passes
// `live`. Same layout as the design (the list with the drawer, the case header with its stages, clocks, tabs and the
// members rail, the ethics queue with "Route to chair"). States only the real records have are drawn in the same look:
// the reporter's limited view, the respondent's notice and reply, the delayed notice with its reason, two-person outcome
// approval, the IC report with members' views and the presiding officer's signature, interim relief with its HR task,
// stepping aside, conflicts, evidence with its fingerprint and access log, no access. Every rule is the server's again
// (helpdesk-design-map.md 4f); no legal date is worked out here.
import { useState } from 'react';
import { ArrowLeft, Briefcase, FileText, Megaphone, Send, ShieldAlert } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button, IconButton } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { FormField, useTooEarly } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { Checkbox } from '../../components/choice';
import { Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { DatePicker } from '../../components/date';
import { FileUpload } from '../../components/upload';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, type FilterFieldDef } from '../../components/filters';
import { Breadcrumbs, Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { MenuItem } from '../../components/menu';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { PageBanner } from '../../components/notify';
import { useNarrow } from '../../components/stepper';
import { formatDate } from '../../lib/format';
import type { FilterValue } from '../../lib/table';
import { errorText } from '../org/org-kit';
import { FileList } from '../desk/help';
import type { LoadState } from '../desk/types';
import { Actions, ClockPanel, Confidential, MembersList, OpsDesk, StatusTrail, Workspace, useSay } from './ops-kit';
import type { ClockItem } from './ops-rules';
import { RestrictedNotFound } from './cases';
import type {
  AddMemberInput,
  CaseDate,
  CaseDetail,
  CaseFile,
  CaseFinding,
  CaseKind,
  CaseListRow,
  CaseMessage,
  CaseStatus,
  EthicsRow,
  IcReportInput,
  IcVote,
  MyCaseDetail,
  MyCaseRow,
  MyReply,
  MyReplyInput,
  ProposeInput,
  ReliefAction,
  NoticeInput,
  ReliefInput,
  CaseDecision,
  RaiseInput,
  DraftReport,
  MisconductReportInput,
  MyMisconductReport,
  Severity,
} from './cases-live-types';

/* ---------------- shared ---------------- */

const asDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);
const day = (iso: string | null | undefined) => (iso ? formatDate(asDate(iso)) : '—');
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const KIND_LABEL: Record<CaseKind | 'accident', string> = { grievance: 'Grievance', whistleblower: 'Fraud or ethics concern', posh: 'Sexual harassment (POSH)', disciplinary: 'Disciplinary', accident: 'Workplace accident' };
export const DECISION_LABEL: Record<CaseDecision, string> = { dropped: 'Dropped', warning: 'Warning', inquiry: 'Inquiry' };
const DECISION_LONG: Record<CaseDecision, string> = { dropped: 'Dropped: no action', warning: 'Written warning', inquiry: 'Domestic inquiry (recorded; held outside the app for now)' };
const STATUS_LABEL: Record<CaseStatus, string> = { open: 'Open', action: 'Action needed', 'on-hold': 'On hold', closed: 'Closed' };
const STATUS_TONE: Record<CaseStatus, BadgeTone> = { open: 'info', action: 'warning', 'on-hold': 'neutral', closed: 'neutral' };
const ROLE_LABEL = { reporter: 'You raised it', respondent: 'You are asked to reply' } as const;
export const FINDING_LABEL: Record<CaseFinding, string> = { proved: 'Proved', 'proved-in-part': 'Proved in part', 'not-proved': 'Not proved', 'false-or-malicious': 'False or malicious' };
const RELIEF_LABEL: Record<ReliefAction, string> = { transfer: 'Transfer', leave: 'Leave', reporting: 'Stop reporting', suspension: 'Suspension', other: 'Other' };
const RELIEF_LONG: Record<ReliefAction, string> = { transfer: 'Transfer', leave: 'Leave', reporting: 'Stop reporting to the accused', suspension: 'Suspension pending inquiry (no pay change by itself)', other: 'Other relief' };
/** Four choices each (a Segment): a disciplinary case has suspension instead of "stop reporting". */
const reliefChoices = (kind: CaseKind): ReliefAction[] => (kind === 'disciplinary' ? ['suspension', 'transfer', 'leave', 'other'] : ['transfer', 'leave', 'reporting', 'other']);
const toClock = (d: CaseDate): ClockItem => ({ key: d.key, label: d.label, due: d.due ? asDate(d.due) : null, doneOn: d.doneOn ? asDate(d.doneOn) : null, note: d.note ?? undefined });
const codeOf = (e: unknown) => (e as { code?: string } | null)?.code;
const asAttachments = (files: CaseFile[]) =>
  files.map((f) => ({ id: f.id, fileName: f.name, contentType: f.type, sizeBytes: f.size, scanStatus: f.scan, side: 'agent' as const, messageId: null, createdAt: f.addedAt }));
const nextText = (n: { label: string; on: string | null } | null) => (n ? (n.on ? `${n.label}, ${day(n.on)}` : n.label) : '—');

/** Runs one action: busy key, toast when done, the refusal kept on the page. */
function useAct() {
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const { toast, say } = useSay();
  const act = async (key: string, fn: () => Promise<unknown>, done: string, description?: string) => {
    setBusy(key);
    setProblem(null);
    try {
      await fn();
      toast({ tone: 'success', title: done, description });
      return true;
    } catch (e) {
      setProblem(errorText(e));
      return false;
    } finally {
      setBusy(null);
    }
  };
  const alert = problem ? (
    <InlineAlert tone="danger" title="That didn't work">
      {problem}
    </InlineAlert>
  ) : null;
  return { busy, act, alert, say, toast, setProblem };
}

function Thread({ messages, label, viewer }: { messages: CaseMessage[]; label: string; viewer: 'person' | 'team' }) {
  if (!messages.length) return <EmptyState compact title="No messages yet." />;
  return (
    <ol className="yx-ops-conv" aria-label={label}>
      {messages.map((m) => (
        <li key={m.id} className="yx-ops-msg" data-kind={m.from === (viewer === 'team' ? 'team' : 'me') ? 'mine' : undefined}>
          <span className="yx-ops-msg__meta">
            <span className="yx-ops-msg__who">{m.from === 'me' ? 'You' : m.from === 'reporter' ? (m.who ?? 'Anonymous reporter') : viewer === 'person' ? 'Case team' : (m.who ?? 'Case team')}</span>
            <span>{day(m.at)}</span>
          </span>
          <p className="yx-ops-msg__body">{m.text}</p>
        </li>
      ))}
    </ol>
  );
}

function MessageBox({ id, label, onSend }: { id: string; label: string; onSend: (text: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const { busy, act, alert } = useAct();
  const early = useTooEarly(text.trim().length < 2 ? [{ fieldId: id, message: 'Write the message first.' }] : []);
  const send = async () => {
    if (early.stop()) return;
    if (await act('send', () => onSend(text.trim()), 'Message sent')) {
      setText('');
      early.reset();
    }
  };
  return (
    <div className="yx-ops-stack" data-gap="sm">
      {alert}
      <FormField id={id} label={label} error={early.errorOf(id)}>
        <TextArea rows={3} value={text} onChange={setText} maxLength={5000} />
      </FormField>
      <Actions end>
        <Button icon={Send} loading={busy === 'send'} onClick={() => void send()}>
          Send message
        </Button>
      </Actions>
    </div>
  );
}

function Replies({ replies, onOpen, mine }: { replies: MyReply[]; onOpen: (fileId: string) => void; mine: boolean }) {
  if (!replies.length) return null;
  return (
    <ol className="yx-ops-conv" aria-label={mine ? 'Your replies' : 'Replies from the respondent'}>
      {replies.map((r, i) => (
        <li key={r.at + i} className="yx-ops-msg" data-kind={mine ? 'mine' : undefined}>
          <span className="yx-ops-msg__meta">
            <span className="yx-ops-msg__who">{mine ? 'Your reply' : `Reply ${i + 1}`}</span>
            <span>{day(r.at)}</span>
          </span>
          <p className="yx-ops-msg__body">{r.text}</p>
          <FileList files={asAttachments(r.files)} onOpen={onOpen} />
        </li>
      ))}
    </ol>
  );
}

function Loading({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="yx-ops-stack" role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={56} />
      ))}
    </div>
  );
}

/* =========================================================================================
 * HLP-07 · My cases (live): the person's own part only (founder decision 4)
 * ======================================================================================= */

export interface LiveMyCases {
  state: LoadState;
  onRetry?: () => void;
  /** Today in India (from the server), for the clocks. */
  today: string;
  cases: MyCaseRow[];
  openId: string | null;
  onOpen: (id: string | null) => void;
  detail: MyCaseDetail | null;
  detailState?: LoadState;
  onSendMessage: (caseId: string, text: string) => Promise<void>;
  onReply: (caseId: string, input: MyReplyInput) => Promise<void>;
  onAskMoreTime: (caseId: string, reason: string) => Promise<void>;
  onUpload: (caseId: string, file: File) => Promise<{ id: string }>;
  onOpenFile: (caseId: string, fileId: string) => void;
  onSpeakUp?: () => void;
  /** Phone: back to Me. */
  onBack?: () => void;
}

function RespondentPart({ live, c }: { live: LiveMyCases; c: Extract<MyCaseDetail, { role: 'respondent' }> }) {
  const [text, setText] = useState('');
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const { busy, act, alert } = useAct();
  const early = useTooEarly(text.trim().length < 3 ? [{ fieldId: 'mc-reply', message: 'Write your reply first (at least a few words).' }] : []);
  const askEarly = useTooEarly(reason.trim().length < 3 ? [{ fieldId: 'mc-more', message: 'Say why you need more time.' }] : []);
  const n = c.notice;
  const reply = async () => {
    if (early.stop()) return;
    if (await act('reply', () => live.onReply(c.id, { text: text.trim(), fileIds }), 'Reply sent', 'The case team has it. You can add to it, but not change it.')) {
      setText('');
      setFileIds([]);
      early.reset();
    }
  };
  const ask = async () => {
    if (askEarly.stop()) return false;
    const ok = await act('more', () => live.onAskMoreTime(c.id, reason.trim()), 'Asked for more time', `Your reply date stays ${day(n.replyBy)} until the case team decides.`);
    if (ok) setAsking(false);
    return ok;
  };
  return (
    <section className="yx-ops-stack" aria-label="Notice and your reply">
      {!asking && alert}
      <Card title="Notice">
        <DescriptionList
          items={[
            { label: 'Sent to you', value: day(n.sentOn) },
            { label: 'Reply by', value: `${day(n.moreTime?.status === 'granted' && n.moreTime.newDue ? n.moreTime.newDue : n.replyBy)} (${n.replySource})` },
            { label: 'What is alleged', value: n.allegations },
            ...(n.rule ? [{ label: 'Rule', value: n.rule }] : []),
          ]}
        />
        <FileList files={asAttachments(n.files)} title="Copy of the complaint and papers" onOpen={(f) => live.onOpenFile(c.id, f)} />
      </Card>
      {n.moreTime && (
        <InlineAlert tone={n.moreTime.status === 'refused' ? 'warning' : 'info'} title={n.moreTime.status === 'waiting' ? 'More time asked' : n.moreTime.status === 'granted' ? 'More time given' : 'More time not given'}>
          {n.moreTime.status === 'waiting'
            ? `You asked on ${day(n.moreTime.askedOn)}. Your reply date stays ${day(n.replyBy)} until the case team decides.`
            : n.moreTime.status === 'granted'
              ? `Reply by ${day(n.moreTime.newDue)}.`
              : `Reply by ${day(n.replyBy)}.`}
        </InlineAlert>
      )}
      <Replies replies={n.replies} mine onOpen={(f) => live.onOpenFile(c.id, f)} />
      {c.status !== 'closed' && (
        <>
          <FormField id="mc-reply" label={n.replies.length ? 'Add to your reply' : 'Your reply'} required helper="Explain what happened in your own words. Once sent, a reply is final; you can add to it." error={early.errorOf('mc-reply')}>
            <TextArea rows={5} value={text} onChange={setText} maxLength={5000} />
          </FormField>
          <FormField label="Documents" optional>
            <FileUpload
              accept={['.pdf', '.jpg', '.png', '.docx']}
              upload={async (file) => {
                const { id } = await live.onUpload(c.id, file);
                setFileIds((ids) => [...ids, id]);
              }}
            />
          </FormField>
          <Actions>
            <Button variant="primary" icon={Send} loading={busy === 'reply'} onClick={() => void reply()}>
              Send reply
            </Button>
            {!n.askedMoreTime && <Button onClick={() => setAsking(true)}>Ask for more time</Button>}
          </Actions>
        </>
      )}
      <Dialog
        open={asking}
        onOpenChange={setAsking}
        title="Ask for more time to reply"
        notice={alert}
        description={`You can ask once. The case team decides; until then your reply date stays ${day(n.replyBy)}.`}
        footer={
          <>
            <Button onClick={() => setAsking(false)}>Cancel</Button>
            <Button variant="primary" loading={busy === 'more'} onClick={() => void ask()}>
              Ask for more time
            </Button>
          </>
        }
      >
        <FormField id="mc-more" label="Why do you need more time?" required error={askEarly.errorOf('mc-more')}>
          <TextArea rows={3} value={reason} onChange={setReason} maxLength={500} />
        </FormField>
      </Dialog>
    </section>
  );
}

function MyCasePart({ live, c }: { live: LiveMyCases; c: MyCaseDetail }) {
  const today = asDate(live.today);
  return (
    <div className="yx-ops-stack">
      <p className="yx-ops-muted">
        {KIND_LABEL[c.kind]} · {ROLE_LABEL[c.role]} · opened {day(c.openedOn)} · <Badge tone={STATUS_TONE[c.status]}>{c.stage}</Badge>
      </p>
      {c.dates.length > 0 && <ClockPanel title={c.role === 'respondent' ? 'Your dates' : 'Dates'} items={c.dates.map(toClock)} today={today} source={c.datesSource} />}
      {c.outcome && (
        <InlineAlert tone="info" title="Outcome">
          {c.outcome}
          {c.appealUntil ? ` If you disagree, you can appeal until ${day(c.appealUntil)}.` : ''}
        </InlineAlert>
      )}
      {c.role === 'reporter' && <p className="yx-ops-muted">You see the stage, the dates and the messages with the case team. The inquiry itself stays with the case team, to protect everyone in it.</p>}
      {c.role === 'respondent' && <RespondentPart live={live} c={c} />}
      {c.role !== 'respondent' && (
      <Card title="Messages with the case team">
        <div className="yx-ops-stack">
          <Thread messages={c.messages} label="Messages" viewer="person" />
          {c.status !== 'closed' && <MessageBox id="mc-msg" label="Message to the case team" onSend={(t) => live.onSendMessage(c.id, t)} />}
        </div>
      </Card>
      )}
    </div>
  );
}

export function LiveMyCases({ live }: { live: LiveMyCases }) {
  const phone = useNarrow();
  const action = live.cases.filter((c) => c.status === 'action');
  const c = live.openId && live.detail?.id === live.openId ? live.detail : null;
  if (live.state === 'no-access')
    return (
      <OpsDesk area="helpdesk" active="Speak-up" member={false}>
        <PageHeader title="My cases" />
        <NoAccessState what="your cases" grantedBy="the person you act for to sign in themselves" note="A case is private to the people in it, so this page is closed while you act for someone else." />
      </OpsDesk>
    );
  const detail =
    live.openId &&
    (c ? (
      <MyCasePart key={c.id} live={live} c={c} />
    ) : live.detailState === 'error' ? (
      <ErrorState title="We couldn't open this case." description="Try again in a moment." onRetry={() => live.onOpen(live.openId)} />
    ) : (
      <Loading label="Opening the case" rows={2} />
    ));
  const columns: TableColumn<MyCaseRow>[] = [
    { key: 'ref', header: 'Case', type: 'id', value: (r) => r.ref },
    { key: 'kind', header: 'Type', value: (r) => KIND_LABEL[r.kind] },
    { key: 'role', header: 'Your role', value: (r) => ROLE_LABEL[r.role] },
    { key: 'stage', header: 'Stage', value: (r) => r.stage },
    { key: 'next', header: 'Next', value: (r) => nextText(r.next), width: 240 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => STATUS_LABEL[r.status], statusTone: (v) => (v === 'Action needed' ? 'warning' : v === 'Open' ? 'info' : 'neutral') },
  ];
  const empty = <EmptyState title="You're not part of any case." description="If you want to raise something, use Speak up." action={live.onSpeakUp ? <Button icon={Megaphone} onClick={live.onSpeakUp}>Speak up</Button> : undefined} />;
  if (phone)
    return (
      <PhoneFrame tab="me" title={live.openId ? (c?.ref ?? 'Case') : 'My cases'} back={<IconButton icon={ArrowLeft} label={live.openId ? 'Back to my cases' : 'Back to Me'} onClick={() => (live.openId ? live.onOpen(null) : live.onBack?.())} />}>
        {live.openId ? (
          detail
        ) : live.state === 'loading' ? (
          <Loading label="Loading your cases" />
        ) : live.state === 'error' ? (
          <ErrorState title="We couldn't load your cases." description="Try again in a moment." onRetry={live.onRetry} />
        ) : live.cases.length === 0 ? (
          empty
        ) : (
          <ul className="yx-ops-stack yx-ops-plain" data-gap="sm" aria-label="My cases">
            {live.cases.map((r) => (
              <li key={r.id} className="yx-ops-tile">
                <div className="yx-ops-tile__row">
                  <span className="yx-ops-tile__title">
                    {KIND_LABEL[r.kind]} · {ROLE_LABEL[r.role]}
                  </span>
                  <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                </div>
                <span className="yx-ops-muted">
                  <span className="yx-ops-mono">{r.ref}</span> · {r.stage} · {nextText(r.next)}
                </span>
                <Button size="sm" onClick={() => live.onOpen(r.id)}>
                  Open
                </Button>
              </li>
            ))}
          </ul>
        )}
      </PhoneFrame>
    );
  return (
    <OpsDesk area="helpdesk" active="Speak-up" member={false} counts={{ 'Speak-up': action.length }}>
      <PageHeader title="My cases" description="Cases where you raised something or are asked to reply. Only people on each case can see it." />
      {action.length > 0 && (
        <PageBanner tone="warning" action={<Button size="sm" onClick={() => live.onOpen(action[0]!.id)}>Open {action[0]!.ref}</Button>}>
          {action[0]!.next?.on ? `You are asked to reply by ${day(action[0]!.next.on)}.` : 'A case needs your reply.'}
        </PageBanner>
      )}
      <DataTable
        label="My cases"
        columns={columns}
        rows={live.cases}
        getRowId={(r) => r.id}
        state={live.state}
        errorTitle="We couldn't load your cases."
        onRetry={live.onRetry}
        empty={empty}
        onRowClick={(r) => live.onOpen(r.id)}
        rowButtons={(r) => <Button size="sm" onClick={() => live.onOpen(r.id)}>{r.status === 'action' ? 'Reply' : 'Open'}</Button>}
      />
      <Drawer open={Boolean(live.openId)} onOpenChange={(o) => !o && live.onOpen(null)} size="lg" title={c ? `${c.ref} · ${KIND_LABEL[c.kind]}` : 'Case'} subtitle="Confidential. Only the case team sees what you send.">
        {detail}
      </Drawer>
    </OpsDesk>
  );
}

/* =========================================================================================
 * HLP-08 · Case list (live)
 * ======================================================================================= */

const KINDS = Object.keys(KIND_LABEL) as CaseKind[];
const LIST_FILTERS: FilterFieldDef[] = [
  { key: 'kind', label: 'Type', type: 'multi', options: KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] })) },
  { key: 'status', label: 'Status', type: 'multi', options: (['open', 'action', 'on-hold', 'closed'] as CaseStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] })) },
];

export interface LiveCaseList {
  state: LoadState;
  onRetry?: () => void;
  cases: CaseListRow[];
  onOpen: (id: string) => void;
  /** HR with case.disciplinary.raise (answer 34): the people in their HR scope and opening a show-cause case. */
  raise?: {
    people: { id: string; name: string; email: string }[];
    onRaise: (input: RaiseInput) => Promise<{ id: string; ref: string }>;
    /** Answer 55: managers' reports waiting for this HR person (in their scope). */
    drafts: DraftReport[];
    onOpenDraft: (id: string) => Promise<{ id: string }>;
    onDeclineDraft: (id: string, reason: string) => Promise<void>;
  };
  /** Stories and tests only. */
  start?: { raising?: boolean };
}

/** Answer 55: reports from managers, waiting for HR in scope: open one as a case, or decline it with a reason. */
function ManagerReports({ raise, onOpened }: { raise: NonNullable<LiveCaseList['raise']>; onOpened: (id: string) => void }) {
  const [declining, setDeclining] = useState<DraftReport | null>(null);
  const [reason, setReason] = useState('');
  const { busy, act, alert } = useAct();
  const early = useTooEarly(reason.trim().length < 3 ? [{ fieldId: 'mr-reason', message: 'Say why the report does not become a case. The manager does not see it.' }] : []);
  const open = async (r: DraftReport) => {
    let id = '';
    if (await act(`open-${r.id}`, async () => void (id = (await raise.onOpenDraft(r.id)).id), `${r.ref} opened as a case`, 'Send the show-cause notice when you are ready.')) onOpened(id);
  };
  const decline = async () => {
    if (early.stop()) return;
    if (await act('decline', () => raise.onDeclineDraft(declining!.id, reason.trim()), `${declining!.ref} declined`, 'The manager sees only that it was declined.')) {
      setDeclining(null);
      setReason('');
      early.reset();
    }
  };
  return (
    <Card title={`Reports from managers · ${raise.drafts.length}`}>
      <div className="yx-ops-stack">
        {!declining && alert}
        <ul className="yx-ops-list" aria-label="Reports from managers">
          {raise.drafts.map((r) => (
            <li key={r.id} className="yx-ops-list__item">
              <span className="yx-ops-list__main">
                <span className="yx-ops-list__title">
                  {r.employee}: {r.misconduct}
                </span>
                <span className="yx-ops-list__sub">
                  <span className="yx-ops-mono">{r.ref}</span> · reported by {r.reportedBy} on {day(r.filedOn)}
                  {r.happenedOn ? ` · happened ${day(r.happenedOn)}` : ''} · {r.facts}
                </span>
              </span>
              <Actions>
                <Button size="sm" onClick={() => setDeclining(r)}>
                  Decline
                </Button>
                <Button size="sm" variant="primary" loading={busy === `open-${r.id}`} onClick={() => void open(r)}>
                  Open as a case
                </Button>
              </Actions>
            </li>
          ))}
        </ul>
      </div>
      <Dialog
        open={Boolean(declining)}
        onOpenChange={(o) => !o && setDeclining(null)}
        title={`Decline ${declining?.ref ?? ''}?`}
        description="It does not become a case. The manager sees only that it was declined; your reason stays with HR."
        notice={alert}
        footer={
          <>
            <Button onClick={() => setDeclining(null)}>Cancel</Button>
            <Button variant="primary" loading={busy === 'decline'} onClick={() => void decline()}>
              Decline
            </Button>
          </>
        }
      >
        <FormField id="mr-reason" label="Why" required error={early.errorOf('mr-reason')}>
          <TextArea rows={3} value={reason} onChange={setReason} maxLength={500} />
        </FormField>
      </Dialog>
    </Card>
  );
}

/** HR opens a disciplinary show-cause case: the employee, the misconduct, the standing orders clause and the facts. */
function RaiseDrawer({ open, onOpenChange, raise, onOpened }: { open: boolean; onOpenChange: (o: boolean) => void; raise: NonNullable<LiveCaseList['raise']>; onOpened: (id: string) => void }) {
  const [employee, setEmployee] = useState<string | null>(null);
  const [misconduct, setMisconduct] = useState('');
  const [rule, setRule] = useState('');
  const [facts, setFacts] = useState('');
  const { busy, act, alert } = useAct();
  const early = useTooEarly([
    ...(!employee ? [{ fieldId: 'dc-employee', message: 'Choose the employee.' }] : []),
    ...(misconduct.trim().length < 3 ? [{ fieldId: 'dc-misconduct', message: 'Name the misconduct, in short.' }] : []),
    ...(facts.trim().length < 10 ? [{ fieldId: 'dc-facts', message: 'Write the facts relied on (10 letters or more).' }] : []),
  ]);
  const submit = async () => {
    if (early.stop()) return;
    let id = '';
    const ok = await act(
      'raise',
      async () => {
        id = (await raise.onRaise({ employeeUserId: employee!, misconduct: misconduct.trim(), facts: facts.trim(), ...(rule.trim() ? { rule: rule.trim() } : {}) })).id;
      },
      'Case opened',
      'Send the show-cause notice from the case when you are ready. The employee sees nothing before that.',
    );
    if (ok) onOpened(id);
  };
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Open a disciplinary case"
      subtitle="Seen only by you, the HR people you add, and (after the notice) the employee"
      notice={alert}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={busy === 'raise'} onClick={() => void submit()}>
            Open the case
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        <FormField id="dc-employee" label="Employee" required helper="People in your HR scope." error={early.errorOf('dc-employee')}>
          <Select value={employee} onChange={setEmployee} options={raise.people.map((p) => ({ value: p.id, label: `${p.name} · ${p.email}` }))} placeholder="Choose a person" />
        </FormField>
        <FormField id="dc-misconduct" label="Misconduct" required helper="In short, for example: Absence without leave for more than 4 days." error={early.errorOf('dc-misconduct')}>
          <TextField value={misconduct} onChange={setMisconduct} maxLength={80} />
        </FormField>
        <FormField id="dc-rule" label="Standing orders clause" optional helper="As written in the certified standing orders.">
          <TextField value={rule} onChange={setRule} maxLength={200} />
        </FormField>
        <FormField id="dc-facts" label="Facts relied on" required error={early.errorOf('dc-facts')}>
          <TextArea rows={5} value={facts} onChange={setFacts} maxLength={5000} />
        </FormField>
      </div>
    </Drawer>
  );
}

export function LiveCaseList({ live }: { live: LiveCaseList }) {
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const [raising, setRaising] = useState(Boolean(live.start?.raising));
  if (live.state === 'no-access')
    return (
      <OpsDesk area="helpdesk" active="Cases" member={false}>
        <PageHeader title="Cases" />
        <NoAccessState what="cases" grantedBy="your company's ethics or HR admin" note="Cases are open only to the case officers and Internal Committee members the company named." />
      </OpsDesk>
    );
  let rows = live.cases;
  for (const f of filters) if (f.type === 'multi' && f.values.length) rows = rows.filter((c) => f.values.includes(String(c[f.key as 'kind' | 'status'])));
  const columns: TableColumn<CaseListRow>[] = [
    { key: 'ref', header: 'Case', type: 'id', value: (c) => c.ref },
    { key: 'kind', header: 'Type', value: (c) => KIND_LABEL[c.kind] },
    { key: 'subject', header: 'Subject', value: (c) => c.subject, width: 280 },
    { key: 'stage', header: 'Stage', value: (c) => c.stage },
    { key: 'raisedBy', header: 'Raised by', value: (c) => c.raisedBy ?? '', render: (c) => (c.anonymous ? <Badge tone="neutral">Anonymous</Badge> : (c.raisedBy ?? <Badge tone="neutral">Withheld</Badge>)) },
    { key: 'owner', header: 'Owner', value: (c) => c.owner },
    {
      key: 'next',
      header: 'Next due',
      value: (c) => c.next?.on ?? '',
      render: (c) => (
        <span className="yx-ops-row">
          {nextText(c.next)}
          {c.overdue && <Badge tone="danger">Overdue</Badge>}
        </span>
      ),
      width: 220,
    },
    { key: 'status', header: 'Status', type: 'status', value: (c) => STATUS_LABEL[c.status], statusTone: (v) => (v === 'Closed' || v === 'On hold' ? 'neutral' : v === 'Action needed' ? 'warning' : 'info') },
  ];
  return (
    <OpsDesk area="helpdesk" active="Cases" counts={{ Cases: live.cases.filter((c) => c.status !== 'closed').length }}>
      <PageHeader title="Cases" description="Only cases you are a member of are listed. Cases can't be deleted; they close with an outcome." actions={live.raise ? <Button icon={Briefcase} onClick={() => setRaising(true)}>Open a case</Button> : undefined} />
      <Confidential>
        <DataTable
          label="Cases"
          columns={columns}
          rows={rows}
          getRowId={(c) => c.id}
          state={live.state}
          errorTitle="We couldn't load cases."
          onRetry={live.onRetry}
          empty={<EmptyState title="You're not on any case." description="Cases reach you when the company names you a case officer or an Internal Committee member, or a case officer adds you." />}
          filtered={filters.length > 0}
          onClearFilters={() => setFilters([])}
          toolbar={<FilterBar fields={LIST_FILTERS} value={filters} onChange={setFilters} searchPlaceholder="Search case or subject" />}
          onRowClick={(c) => live.onOpen(c.id)}
        />
      </Confidential>
      {live.raise && <RaiseDrawer open={raising} onOpenChange={setRaising} raise={live.raise} onOpened={(id) => (setRaising(false), live.onOpen(id))} />}
      {live.raise && live.raise.drafts.length > 0 && <ManagerReports raise={live.raise} onOpened={live.onOpen} />}
    </OpsDesk>
  );
}

/* =========================================================================================
 * HLP-08 · Case workspace (live)
 * ======================================================================================= */

export type CaseTab = 'timeline' | 'evidence' | 'messages' | 'notice' | 'decision' | 'relief';
export interface LiveCaseWorkspace {
  /** 'not-found': not a member, or no such case (the same page, APX-D §6.3). */
  state: LoadState | 'not-found';
  onRetry?: () => void;
  today: string;
  detail: CaseDetail | null;
  onBack: () => void;
  onSendNotice: (caseId: string, input: NoticeInput) => Promise<void>;
  onDelayNotice: (caseId: string, input: { reason: string; reviewOn: string }) => Promise<void>;
  onDecideMoreTime: (caseId: string, input: { grant: boolean; newDue?: string }) => Promise<void>;
  onPropose: (caseId: string, input: ProposeInput) => Promise<void>;
  onApprove: (caseId: string, version: number) => Promise<void>;
  onSendBack: (caseId: string, note: string, version: number) => Promise<void>;
  onSaveIcReport: (caseId: string, input: IcReportInput) => Promise<void>;
  onVote: (caseId: string, input: { vote: 'agree' | 'disagree'; note: string }) => Promise<void>;
  onSign: (caseId: string, version: number) => Promise<void>;
  onRelief: (caseId: string, input: ReliefInput) => Promise<{ taskRef: string }>;
  /** HR confirmed the relief is carried out. */
  onReliefDone: (caseId: string, reliefId: string) => Promise<void>;
  /** Fraud and ethics reports: an ethics officer sets Serious or Standard (answer 35). */
  onSetSeverity: (caseId: string, severity: Severity) => Promise<void>;
  /** Answer 56: issue the warning letter once the company's template is switched on. */
  onIssueLetter: (caseId: string) => Promise<void>;
  onRecuse: (caseId: string, reason: string) => Promise<void>;
  /** Rejects with code CASE_CONFLICT when the person has a conflict; a second call with overrideReason records it. */
  onAddMember: (caseId: string, input: AddMemberInput) => Promise<void>;
  onUpload: (caseId: string, file: File) => Promise<void>;
  onOpenFile: (caseId: string, fileId: string) => void;
  onSendMessage: (caseId: string, text: string) => Promise<void>;
  /** Stories and tests only. */
  start?: { tab?: CaseTab; dialog?: 'propose' | 'notice' | 'delay' | 'relief' | 'recuse' | 'add' | 'send-back'; conflict?: string };
}

function NoticeTab({ live, c }: { live: LiveCaseWorkspace; c: CaseDetail }) {
  const n = c.notice;
  const [sending, setSending] = useState(live.start?.dialog === 'notice');
  const [delaying, setDelaying] = useState(live.start?.dialog === 'delay');
  const [respondent, setRespondent] = useState<string | null>(null);
  const [allegations, setAllegations] = useState(c.report.summary);
  const [shared, setShared] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [review, setReview] = useState<Date | null>(null);
  const [newDue, setNewDue] = useState<Date | null>(null);
  const { busy, act, alert } = useAct();
  const early = useTooEarly([...(reason.trim().length < 3 ? [{ fieldId: 'cw-delay-reason', message: 'Write why the notice waits. It goes on the case record.' }] : []), ...(!review ? [{ fieldId: 'cw-delay-review', message: 'Choose when to look at it again.' }] : [])]);
  const grantEarly = useTooEarly(!newDue ? [{ fieldId: 'cw-new-due', message: 'Choose the new reply date.' }] : []);
  const sendEarly = useTooEarly([
    ...(!c.respondent && !respondent ? [{ fieldId: 'cw-respondent', message: 'Choose who the notice goes to.' }] : []),
    ...(allegations.trim().length < 10 ? [{ fieldId: 'cw-allegations', message: 'Write what is alleged (10 letters or more).' }] : []),
  ]);
  const send = async () => {
    if (sendEarly.stop()) return;
    const input: NoticeInput = { allegations: allegations.trim(), fileIds: shared, ...(c.respondent ? {} : { respondentUserId: respondent! }) };
    if (await act('send', () => live.onSendNotice(c.id, input), 'Notice sent', 'The respondent has the notice, the papers you shared and the reply date.')) setSending(false);
  };
  if (!n) return <EmptyState compact title="No notice is needed." description="Nobody is accused in this case." />;
  const delay = async () => {
    if (early.stop()) return;
    if (await act('delay', () => live.onDelayNotice(c.id, { reason: reason.trim(), reviewOn: isoDay(review!) }), 'Notice delayed', 'The reason is on the case record.')) setDelaying(false);
  };
  return (
    <div className="yx-ops-stack">
      {!delaying && !sending && alert}
      {n.status === 'sent' ? (
        <DescriptionList
          items={[
            { label: 'Notice sent', value: `${day(n.sentOn)} to ${c.respondent ?? 'the respondent'}` },
            { label: 'Reply by', value: `${day(n.replyBy)} (${n.replySource})` },
            { label: 'Replies', value: n.replies.length ? `${n.replies.length} received` : 'None yet' },
          ]}
        />
      ) : (
        <>
          {n.status === 'delayed' && n.delay ? (
            <InlineAlert tone="warning" title="Notice delayed">
              {n.delay.by} delayed the notice on {day(n.delay.at)}: “{n.delay.reason}” Look at it again by {day(n.delay.reviewOn)}.
            </InlineAlert>
          ) : (
            <p className="yx-ops-muted">{c.respondent ?? 'The respondent'} has not been told yet. The notice sends a copy of the complaint and the reply date ({n.replySource}).</p>
          )}
          {c.me.canWork && (
            <Actions>
              <Button variant="primary" icon={Send} onClick={() => setSending(true)}>
                Send notice and copy
              </Button>
              <Button onClick={() => setDelaying(true)}>{n.status === 'delayed' ? 'Change the delay' : 'Delay notice'}</Button>
            </Actions>
          )}
        </>
      )}
      {n.moreTime && (
        <InlineAlert tone="info" title={n.moreTime.status === 'waiting' ? 'More time asked' : n.moreTime.status === 'granted' ? 'More time given' : 'More time refused'}>
          “{n.moreTime.reason}” asked {day(n.moreTime.askedOn)}.{n.moreTime.newDue ? ` New reply date ${day(n.moreTime.newDue)}.` : ''}
        </InlineAlert>
      )}
      {n.moreTime?.status === 'waiting' && c.me.canWork && (
        <div className="yx-ops-stack" data-gap="sm">
          <FormField id="cw-new-due" label="New reply date" error={grantEarly.errorOf('cw-new-due')}>
            <DatePicker value={newDue} onChange={setNewDue} min={asDate(n.replyBy ?? live.today)} />
          </FormField>
          <Actions>
            <Button loading={busy === 'grant'} onClick={() => void (!grantEarly.stop() && act('grant', () => live.onDecideMoreTime(c.id, { grant: true, newDue: isoDay(newDue!) }), 'More time given'))}>
              Give more time
            </Button>
            <Button loading={busy === 'refuse'} onClick={() => void act('refuse', () => live.onDecideMoreTime(c.id, { grant: false }), 'More time refused', `The reply date stays ${day(n.replyBy)}.`)}>
              Refuse
            </Button>
          </Actions>
        </div>
      )}
      <Replies replies={n.replies} mine={false} onOpen={(f) => live.onOpenFile(c.id, f)} />
      <Dialog
        open={sending}
        onOpenChange={setSending}
        title={c.kind === 'disciplinary' ? 'Send the show-cause notice' : 'Send the notice and the papers'}
        description={`The respondent gets the notice, what is alleged, the files you tick and the reply date (${n.replySource}). The clock starts today.`}
        notice={alert}
        footer={
          <>
            <Button onClick={() => setSending(false)}>Cancel</Button>
            <Button variant="primary" icon={Send} loading={busy === 'send'} onClick={() => void send()}>
              Send notice
            </Button>
          </>
        }
      >
        <div className="yx-ops-stack">
          {!c.respondent && (
            <FormField id="cw-respondent" label="Respondent" required helper="The person the complaint is about. They can't be on the case team." error={sendEarly.errorOf('cw-respondent')}>
              <Select value={respondent} onChange={setRespondent} options={c.people.map((p) => ({ value: p.id, label: `${p.name} · ${p.email}` }))} placeholder="Choose a person" />
            </FormField>
          )}
          <FormField id="cw-allegations" label="What is alleged" required helper="In plain words. Leave out anything that would identify the reporter or witnesses unless the law needs it." error={sendEarly.errorOf('cw-allegations')}>
            <TextArea rows={4} value={allegations} onChange={setAllegations} maxLength={5000} />
          </FormField>
          {c.files.length > 0 && (
            <FormField label="Papers to share" optional>
              <div className="yx-ops-stack" data-gap="sm">
                {c.files.map((f) => (
                  <Checkbox key={f.id} label={f.name} description={`${f.addedBy} · ${day(f.addedAt)}`} checked={shared.includes(f.id)} onChange={(on) => setShared((ids) => (on ? [...ids, f.id] : ids.filter((x) => x !== f.id)))} />
                ))}
              </div>
            </FormField>
          )}
        </div>
      </Dialog>
      <Dialog
        open={delaying}
        onOpenChange={setDelaying}
        title="Delay the notice"
        notice={alert}
        description="Notice may wait only with a recorded reason (for example, the complainant's safety). The reason is on the case record and in the audit log."
        footer={
          <>
            <Button onClick={() => setDelaying(false)}>Cancel</Button>
            <Button variant="primary" loading={busy === 'delay'} onClick={() => void delay()}>
              Delay notice
            </Button>
          </>
        }
      >
        <div className="yx-ops-stack">
          <FormField id="cw-delay-reason" label="Why the notice waits" required error={early.errorOf('cw-delay-reason')}>
            <TextArea rows={3} value={reason} onChange={setReason} maxLength={500} />
          </FormField>
          <FormField id="cw-delay-review" label="Look at it again by" required error={early.errorOf('cw-delay-review')}>
            <DatePicker value={review} onChange={setReview} min={asDate(live.today)} />
          </FormField>
        </div>
      </Dialog>
    </div>
  );
}

const FINDINGS = (Object.keys(FINDING_LABEL) as CaseFinding[]).map((f) => ({ value: f, label: FINDING_LABEL[f] }));

/** Answer 56: the warning letter goes out through Letters, from the company's "Warning letter" template. */
function WarningLetter({ live, c }: { live: LiveCaseWorkspace; c: CaseDetail }) {
  const { busy, act, alert } = useAct();
  const l = c.letter!;
  return (
    <Card title="Warning letter">
      <div className="yx-ops-stack" data-gap="sm">
        {alert}
        {l.id ? (
          <p className="yx-ops-muted">
            {l.referenceNo ? `${l.referenceNo} · ` : ''}
            {l.status === 'issued' ? 'Issued. The employee finds it with their letters.' : l.status === 'render_failed' ? `Being made again: ${l.renderError ?? 'the PDF could not be made'}.` : 'Being made in Letters.'}
          </p>
        ) : (
          <>
            <p className="yx-ops-muted">The letter is made from your company's Warning letter template (Settings › Letter templates; YukthiX has a starter). Switch it on, then issue it here.</p>
            <Actions>
              <Button loading={busy === 'letter'} onClick={() => void act('letter', () => live.onIssueLetter(c.id), 'Warning letter issued', 'It goes out through Letters to the employee.')}>
                Issue the warning letter
              </Button>
            </Actions>
          </>
        )}
      </div>
    </Card>
  );
}

function OutcomeTab({ live, c, onPropose }: { live: LiveCaseWorkspace; c: CaseDetail; onPropose: () => void }) {
  const o = c.outcome!;
  const [back, setBack] = useState(live.start?.dialog === 'send-back');
  const [note, setNote] = useState('');
  const { busy, act, alert } = useAct();
  const early = useTooEarly(note.trim().length < 3 ? [{ fieldId: 'cw-back-note', message: 'Write what should change.' }] : []);
  const sendBack = async () => {
    if (early.stop()) return;
    if (await act('back', () => live.onSendBack(c.id, note.trim(), c.version), 'Outcome sent back', `${o.proposedBy ?? 'The officer'} sees your note.`)) setBack(false);
  };
  return (
    <div className="yx-ops-stack">
      {!back && alert}
      {o.status === 'none' || o.status === 'sent-back' ? (
        <>
          {o.status === 'sent-back' && (
            <InlineAlert tone="warning" title="Sent back">
              {o.sendBackNote}
            </InlineAlert>
          )}
          <EmptyState compact title="No outcome proposed yet." description="One officer proposes the outcome; a second officer approves it." action={c.me.canWork ? <Button onClick={onPropose}>Propose outcome</Button> : undefined} />
        </>
      ) : (
        <>
          <DescriptionList
            items={[
              o.decision ? { label: 'Decision', value: DECISION_LONG[o.decision] } : { label: 'Finding', value: o.finding ? FINDING_LABEL[o.finding] : '—' },
              { label: 'Action', value: o.action ?? '—' },
              { label: 'Reasons', value: o.reasons ?? '—' },
              { label: 'The reporter is told', value: o.reporterSummary ?? '—' },
              { label: 'Proposed', value: `${o.proposedBy ?? '—'}, ${day(o.proposedAt)}` },
              ...(o.status === 'approved' ? [{ label: 'Approved', value: `${o.approvedBy ?? '—'}, ${day(o.approvedAt)}` }] : []),
            ]}
          />
          {o.status === 'approved' ? (
            <>
              <InlineAlert tone="info" title="Outcome approved">
                {c.kind === 'disciplinary' ? 'Two people agreed. The employee sees the decision in My cases. Nothing changes in People or Pay by itself.' : 'Two officers agreed. Tell the people on the case through their messages; HR gets a task for any action.'}
              </InlineAlert>
              {c.letter && <WarningLetter live={live} c={c} />}
            </>
          ) : o.proposedByMe ? (
            <InlineAlert tone="info" title="Waiting for a second officer">
              You proposed this outcome, so another officer approves it.
            </InlineAlert>
          ) : c.me.canApprove ? (
            <Actions>
              <Button variant="approve" loading={busy === 'approve'} onClick={() => void act('approve', () => live.onApprove(c.id, c.version), 'Outcome approved')}>
                Approve outcome
              </Button>
              <Button onClick={() => setBack(true)}>Send back</Button>
            </Actions>
          ) : (
            <p className="yx-ops-muted">Waiting for a second officer to approve it.</p>
          )}
        </>
      )}
      <Dialog
        open={back}
        onOpenChange={setBack}
        title="Send the outcome back"
        notice={alert}
        footer={
          <>
            <Button onClick={() => setBack(false)}>Cancel</Button>
            <Button variant="primary" loading={busy === 'back'} onClick={() => void sendBack()}>
              Send back
            </Button>
          </>
        }
      >
        <FormField id="cw-back-note" label="What should change" required error={early.errorOf('cw-back-note')}>
          <TextArea rows={3} value={note} onChange={setNote} maxLength={500} />
        </FormField>
      </Dialog>
    </div>
  );
}

function IcReportTab({ live, c }: { live: LiveCaseWorkspace; c: CaseDetail }) {
  const r = c.icReport!;
  const [finding, setFinding] = useState<CaseFinding | null>(r.finding);
  const [findings, setFindings] = useState(r.findings ?? '');
  const [rec, setRec] = useState(r.recommendation ?? '');
  const mine = r.votes.find((v) => v.memberId === c.me.memberId);
  const [vote, setVote] = useState<'agree' | 'disagree' | null>(mine?.vote ?? null);
  const [voteNote, setVoteNote] = useState(mine?.note ?? '');
  const [signing, setSigning] = useState(false);
  const { busy, act, alert, say } = useAct();
  const agree = r.votes.filter((v) => v.vote === 'agree').length;
  const majority = agree * 2 > r.votes.length;
  const early = useTooEarly([
    ...(!finding ? [{ fieldId: 'ic-finding', message: 'Choose the finding.' }] : []),
    ...(findings.trim().length < 20 ? [{ fieldId: 'ic-findings', message: 'Write the findings (at least 20 letters).' }] : []),
    ...(rec.trim().length < 3 ? [{ fieldId: 'ic-rec', message: 'Write the recommendation to the employer.' }] : []),
  ]);
  const voteEarly = useTooEarly([...(!vote ? [{ fieldId: 'ic-vote', message: 'Choose whether you agree.' }] : []), ...(vote === 'disagree' && voteNote.trim().length < 3 ? [{ fieldId: 'ic-vote-note', message: 'Say why you don’t agree; it stays with the report.' }] : [])]);
  if (r.status === 'signed')
    return (
      <div className="yx-ops-stack">
        <DescriptionList
          items={[
            { label: 'Finding', value: r.finding ? FINDING_LABEL[r.finding] : '—' },
            { label: 'Findings', value: r.findings ?? '—' },
            { label: 'Recommendation', value: r.recommendation ?? '—' },
          ]}
        />
        <Votes votes={r.votes} />
        <InlineAlert tone="info" title="Report signed">
          {r.signedBy} (presiding officer) signed it on {day(r.signedOn)}. The employer-action date is in the clocks above.
        </InlineAlert>
      </div>
    );
  const save = async () => {
    if (!c.canDecide.ok) return say(c.canDecide.reason ?? 'The report waits for the respondent’s reply or its date.');
    if (early.stop()) return;
    await act('save', () => live.onSaveIcReport(c.id, { finding: finding!, findings: findings.trim(), recommendation: rec.trim(), version: c.version }), 'Draft report saved', 'Members can now record whether they agree.');
  };
  const recordVote = async () => {
    if (voteEarly.stop()) return;
    await act('vote', () => live.onVote(c.id, { vote: vote!, note: voteNote.trim() }), 'Your view is recorded');
  };
  return (
    <div className="yx-ops-stack">
      {alert}
      {!c.canDecide.ok && <InlineAlert tone="warning">{c.canDecide.reason}</InlineAlert>}
      {c.me.ic && (
        <Card title="Findings and recommendation">
          <div className="yx-ops-stack">
            <FormField id="ic-finding" label="Finding" required helper="“Not proved” is not “false or malicious”: that needs its own reasons (POSH Act s.14)." error={early.errorOf('ic-finding')}>
              <Segment label="Finding" options={FINDINGS} value={finding} onChange={setFinding} />
            </FormField>
            <FormField id="ic-findings" label="Findings" required error={early.errorOf('ic-findings')}>
              <TextArea rows={4} value={findings} onChange={setFindings} maxLength={5000} />
            </FormField>
            <FormField id="ic-rec" label="Recommendation to the employer" required error={early.errorOf('ic-rec')}>
              <TextArea rows={3} value={rec} onChange={setRec} maxLength={2000} />
            </FormField>
            <Actions>
              <Button loading={busy === 'save'} onClick={() => void save()}>
                Save draft report
              </Button>
            </Actions>
            <p className="yx-ops-muted">Saving a changed draft clears the views already recorded, so every member agrees to the same words.</p>
          </div>
        </Card>
      )}
      {r.status === 'draft' && (
        <Card title={`Members' views · ${agree} of ${r.votes.length} agree`}>
          <div className="yx-ops-stack">
            <Votes votes={r.votes} />
            {mine && (
              <>
                <FormField id="ic-vote" label="Your view" error={voteEarly.errorOf('ic-vote')}>
                  <Segment label="Your view" options={[{ value: 'agree', label: 'I agree' }, { value: 'disagree', label: "I don't agree" }]} value={vote} onChange={setVote} />
                </FormField>
                <FormField id="ic-vote-note" label="Note" optional={vote !== 'disagree'} required={vote === 'disagree'} error={voteEarly.errorOf('ic-vote-note')}>
                  <TextArea rows={2} value={voteNote} onChange={setVoteNote} maxLength={1000} />
                </FormField>
              </>
            )}
            <Actions>
              {mine && (
                <Button loading={busy === 'vote'} onClick={() => void recordVote()}>
                  Record my view
                </Button>
              )}
              {c.me.presiding && (
                <Button variant="primary" onClick={() => (majority ? setSigning(true) : say(`More than half of the members must agree before you sign. ${agree} of ${r.votes.length} agree now.`))}>
                  Sign the report
                </Button>
              )}
            </Actions>
          </div>
        </Card>
      )}
      <ConfirmDialog
        open={signing}
        onOpenChange={setSigning}
        title="Sign the Internal Committee report?"
        consequence={`${agree} of ${r.votes.length} members agree. Once signed, the report is final and dated today; it goes to the employer, and the employer-action clock starts.`}
        confirmLabel="Sign the report"
        onConfirm={async () => {
          await live.onSign(c.id, c.version);
        }}
      />
    </div>
  );
}

function Votes({ votes }: { votes: IcVote[] }) {
  return (
    <ul className="yx-ops-list" aria-label="Members' views">
      {votes.map((v) => (
        <li key={v.memberId} className="yx-ops-list__item">
          <span className="yx-ops-list__main">
            <span className="yx-ops-list__title">
              {v.name}
              {v.presiding ? ' (presiding officer)' : ''}
            </span>
            {v.note && <span className="yx-ops-list__sub">{v.note}</span>}
          </span>
          <Badge tone={v.vote === 'agree' ? 'success' : v.vote === 'disagree' ? 'warning' : 'neutral'}>{v.vote === 'agree' ? `Agrees · ${day(v.at)}` : v.vote === 'disagree' ? `Doesn't agree · ${day(v.at)}` : 'No view yet'}</Badge>
        </li>
      ))}
    </ul>
  );
}

function ReliefTab({ live, c, onRecord }: { live: LiveCaseWorkspace; c: CaseDetail; onRecord: () => void }) {
  const { busy, act, alert } = useAct();
  return (
    <div className="yx-ops-stack">
      {alert}
      <p className="yx-ops-muted">Interim relief during the inquiry (POSH Act s.12, verify with counsel). Recording it gives HR a task; nothing changes in People by itself.</p>
      {c.relief.length === 0 ? (
        <EmptyState compact title="No interim relief recorded." action={c.me.canWork ? <Button onClick={onRecord}>Record interim relief</Button> : undefined} />
      ) : (
        <>
          <ul className="yx-ops-list" aria-label="Interim relief">
            {c.relief.map((r) => (
              <li key={r.id} className="yx-ops-list__item">
                <span className="yx-ops-list__main">
                  <span className="yx-ops-list__title">{RELIEF_LONG[r.action]}</span>
                  <span className="yx-ops-list__sub">
                    {r.note} · {r.by}, {day(r.at)} · HR task <span className="yx-ops-mono">{r.task.ref}</span> with {r.task.assignee}
                  </span>
                </span>
                {r.task.status === 'open' && c.me.canWork ? (
                  <Button size="sm" loading={busy === r.id} onClick={() => void act(r.id, () => live.onReliefDone(c.id, r.id), 'Task marked done', `${r.task.assignee} carried it out.`)}>
                    HR has done it
                  </Button>
                ) : (
                  <Badge tone={r.task.status === 'done' ? 'success' : 'warning'}>{r.task.status === 'done' ? 'Done by HR' : 'Waiting for HR'}</Badge>
                )}
              </li>
            ))}
          </ul>
          {c.me.canWork && (
            <Actions>
              <Button onClick={onRecord}>Record interim relief</Button>
            </Actions>
          )}
        </>
      )}
    </div>
  );
}

function EvidenceTab({ live, c }: { live: LiveCaseWorkspace; c: CaseDetail }) {
  return (
    <div className="yx-ops-stack">
      {c.files.length === 0 ? (
        <EmptyState compact title="No files yet." />
      ) : (
        <ul className="yx-ops-list" aria-label="Evidence">
          {c.files.map((f) => (
            <li key={f.id} className="yx-ops-list__item">
              <span className="yx-ops-list__main">
                <span className="yx-ops-list__title">{f.name}</span>
                <span className="yx-ops-list__sub">
                  {f.addedBy} · {day(f.addedAt)} · fingerprint <span className="yx-ops-mono" title={f.sha256}>{f.sha256.slice(0, 12)}…</span> · opened {f.opens} {f.opens === 1 ? 'time' : 'times'}
                </span>
              </span>
              {f.scan === 'clean' ? (
                <Button size="sm" icon={FileText} onClick={() => live.onOpenFile(c.id, f.id)}>
                  Open
                </Button>
              ) : (
                <Badge tone={f.scan === 'pending' ? 'neutral' : 'danger'}>{f.scan === 'pending' ? 'Being checked for viruses' : 'Blocked: may be harmful'}</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
      {c.me.canWork && (
        <FormField label="Add files" helper="Files are kept as added: never changed or deleted. Each open is logged.">
          <FileUpload accept={['.pdf', '.jpg', '.png', '.docx', '.xlsx', '.mp3', '.mp4']} upload={(file) => live.onUpload(c.id, file)} />
        </FormField>
      )}
      <Card title="Access log">
        {c.accessLog.length === 0 ? (
          <p className="yx-ops-muted">Nobody has opened this case yet.</p>
        ) : (
          <ul className="yx-ops-list" aria-label="Access log">
            {c.accessLog.map((a) => (
              <li key={a.id} className="yx-ops-list__item">
                <span className="yx-ops-list__main">
                  <span className="yx-ops-list__title">{a.who}</span>
                  <span className="yx-ops-list__sub">
                    {a.what} · {day(a.at)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

const SEVERITY_LABEL: Record<Severity, string> = { serious: 'Serious', standard: 'Standard' };

/** Answer 35: the ethics officer grades a fraud or ethics report; others read it. Every change is a case step. */
function SeverityCard({ live, c }: { live: LiveCaseWorkspace; c: CaseDetail }) {
  const { busy, act, alert } = useAct();
  const set = (v: Severity) => {
    if (v === c.severity || busy) return;
    void act('severity', () => live.onSetSeverity(c.id, v), `${c.ref} is now ${SEVERITY_LABEL[v]}`, 'The change is on the case record.');
  };
  return (
    <Card title="Severity">
      <div className="yx-ops-stack" data-gap="sm">
        {alert}
        {c.me.canSetSeverity ? (
          <Segment label="Severity" options={(['standard', 'serious'] as Severity[]).map((v) => ({ value: v, label: SEVERITY_LABEL[v] }))} value={c.severity} onChange={set} />
        ) : (
          <Badge tone={c.severity === 'serious' ? 'danger' : 'neutral'}>{SEVERITY_LABEL[c.severity!]}</Badge>
        )}
        <p className="yx-ops-muted">{c.me.canSetSeverity ? 'Serious when it needs the fastest attention. Each change is kept with who made it.' : 'Set by the ethics officers.'}</p>
      </div>
    </Card>
  );
}

const MEMBER_ROLES: { value: 'officer' | 'investigator'; label: string }[] = [
  { value: 'investigator', label: 'Investigator' },
  { value: 'officer', label: 'Case officer' },
]

export function LiveCaseWorkspace({ live }: { live: LiveCaseWorkspace }) {
  const c = live.detail;
  const [tab, setTab] = useState<CaseTab>(live.start?.tab ?? (c?.anonymous ? 'messages' : 'timeline'));
  const [dialog, setDialog] = useState<string | null>(live.start?.dialog && !['delay', 'send-back', 'notice'].includes(live.start.dialog) ? live.start.dialog : null);
  const [finding, setFinding] = useState<CaseFinding | null>(null);
  const [action, setAction] = useState('');
  const [reasons, setReasons] = useState('');
  const [summary, setSummary] = useState('');
  const [decision, setDecision] = useState<CaseDecision | null>(null);
  const [relief, setRelief] = useState<ReliefAction | null>(null);
  const [reliefNote, setReliefNote] = useState('');
  const [assignee, setAssignee] = useState<string | null>(null);
  const [recuseReason, setRecuseReason] = useState('');
  const [person, setPerson] = useState<string | null>(null);
  const [role, setRole] = useState<'officer' | 'investigator' | null>('investigator');
  const [conflict, setConflict] = useState<string | null>(live.start?.conflict ?? null);
  const [override, setOverride] = useState('');
  const { busy, act, alert, say, toast, setProblem } = useAct();
  const proposeEarly = useTooEarly([
    ...(c?.kind === 'disciplinary' ? (!decision ? [{ fieldId: 'cw-decision', message: 'Choose the decision.' }] : []) : !finding ? [{ fieldId: 'cw-finding', message: 'Choose the finding.' }] : []),
    ...(action.trim().length < 3 ? [{ fieldId: 'cw-action', message: 'Write the action (or “No action”).' }] : []),
    ...(reasons.trim().length < 20 ? [{ fieldId: 'cw-reasons', message: 'Write the reasons (at least 20 letters).' }] : []),
    ...(summary.trim().length < 3 ? [{ fieldId: 'cw-summary', message: 'Write what the reporter is told.' }] : []),
  ]);
  const reliefEarly = useTooEarly([...(!relief ? [{ fieldId: 'cw-relief', message: 'Choose the relief.' }] : []), ...(reliefNote.trim().length < 3 ? [{ fieldId: 'cw-relief-note', message: 'Write what HR should do and the request it answers.' }] : []), ...(!assignee ? [{ fieldId: 'cw-relief-who', message: 'Choose who in HR carries it out.' }] : [])]);
  const recuseEarly = useTooEarly(recuseReason.trim().length < 3 ? [{ fieldId: 'cw-recuse', message: 'Write why you step aside. It goes on the case record.' }] : []);
  const addEarly = useTooEarly([
    ...(!person ? [{ fieldId: 'cw-person', message: 'Choose the person.' }] : []),
    ...(conflict && override.trim().length < 3 ? [{ fieldId: 'cw-override', message: 'Write why the override is needed.' }] : []),
  ]);

  if (live.state === 'not-found') return <RestrictedNotFound />;
  if (live.state === 'no-access')
    return (
      <OpsDesk area="helpdesk" active="Cases" member={false}>
        <PageHeader title="Cases" />
        <NoAccessState what="cases" grantedBy="your company's ethics or HR admin" note="Cases are open only to the case officers and Internal Committee members the company named." />
      </OpsDesk>
    );
  if (live.state === 'error' || !c)
    return (
      <OpsDesk area="helpdesk" active="Cases">
        {live.state === 'error' ? (
          <ErrorState title="We couldn't load this case." description="Try again. If it keeps failing, share the case number with support; they can't see case content." onRetry={live.onRetry} />
        ) : (
          <div className="yx-ops-stack" role="status" aria-busy="true" aria-label="Loading case">
            <Skeleton height={64} />
            <Skeleton height={120} />
            <Skeleton height={320} />
          </div>
        )}
      </OpsDesk>
    );

  const posh = c.kind === 'posh';
  const close = () => {
    setDialog(null);
    setProblem(null);
  };
  const openPropose = () => setDialog('propose');
  const propose = async () => {
    if (!c.canDecide.ok) return say(c.canDecide.reason ?? 'No outcome yet: wait for the reply or its date.');
    if (proposeEarly.stop()) return;
    if (await act('propose', () => live.onPropose(c.id, { ...(c.kind === 'disciplinary' ? { decision: decision! } : { finding: finding! }), action: action.trim(), reasons: reasons.trim(), reporterSummary: summary.trim(), version: c.version }), 'Outcome proposed', 'A second officer approves it.')) {
      close();
      setTab('decision');
    }
  };
  const recordRelief = async () => {
    if (reliefEarly.stop()) return;
    if (await act('relief', () => live.onRelief(c.id, { action: relief!, note: reliefNote.trim(), assigneeUserId: assignee! }), 'Interim relief recorded', 'HR has a task to carry it out; it shows under Interim relief.')) {
      close();
      setTab('relief');
    }
  };
  const recuse = async () => {
    if (recuseEarly.stop()) return;
    if (await act('recuse', () => live.onRecuse(c.id, recuseReason.trim()), 'You stepped aside', 'The case goes on with the other members.')) close();
  };
  const add = async () => {
    if (addEarly.stop()) return;
    setProblem(null);
    try {
      await live.onAddMember(c.id, { personId: person!, role: role ?? 'investigator', ...(conflict ? { overrideReason: override.trim() } : {}) });
      close();
      setConflict(null);
      toast({ tone: 'success', title: `${c.people.find((p) => p.id === person)?.name ?? 'The person'} is on the case` });
    } catch (e) {
      if (codeOf(e) === 'CASE_CONFLICT') setConflict(errorText(e));
      else setProblem(errorText(e));
    }
  };
  const proposedForMe = c.outcome?.status === 'proposed' && c.me.canApprove && !c.outcome.proposedByMe;
  const decisionDone = posh ? c.icReport?.status === 'signed' : c.outcome?.status === 'approved';
  const members = c.members.map((m) => ({ name: m.name, role: m.presiding ? `${m.role} (presiding)` : m.role, access: m.access, external: m.external, blocked: m.recused ? `Stepped aside ${day(m.recused.on)}` : undefined }));

  return (
    <OpsDesk area="helpdesk" active="Cases">
      <Breadcrumbs items={[{ label: 'Cases', href: '/yx/desk/cases', onClick: live.onBack }, { label: c.ref }]} />
      <Confidential note={posh ? 'Confidential. Visible only to the Internal Committee members on this case. Every view is logged.' : undefined}>
        {!dialog && alert}
        <ObjectHeader
          name={c.subject}
          icon={posh || c.kind === 'whistleblower' ? ShieldAlert : c.kind === 'grievance' ? Megaphone : c.kind === 'disciplinary' ? FileText : Briefcase}
          secondary={
            <span>
              <span className="yx-ops-mono">{c.ref}</span> · {KIND_LABEL[c.kind]} · {c.location} · opened {day(c.openedOn)}
            </span>
          }
          status={
            <>
              <Badge tone="info">{c.stage}</Badge>
              {c.anonymous && <Badge tone="neutral">Anonymous reporter</Badge>}
              {c.severity && <Badge tone={c.severity === 'serious' ? 'danger' : 'neutral'}>{SEVERITY_LABEL[c.severity]}</Badge>}
              {c.me.recused && <Badge tone="warning">You stepped aside</Badge>}
            </>
          }
          facts={[
            { label: 'Owner', value: c.owner },
            { label: 'Raised by', value: c.anonymous ? 'Anonymous' : (c.reporter ?? 'Withheld') },
            { label: 'Respondent', value: c.respondent ?? '—' },
          ]}
          actions={
            c.me.canWork && !c.me.recused ? (
              <>
                <Button onClick={() => setDialog('add')}>Add member</Button>
                {!decisionDone &&
                  (posh ? (
                    <Button variant="primary" onClick={() => setTab('decision')}>
                      IC report
                    </Button>
                  ) : proposedForMe ? (
                    <Button variant="primary" onClick={() => setTab('decision')}>
                      Review outcome
                    </Button>
                  ) : c.outcome?.status === 'proposed' ? null : (
                    <Button variant="primary" onClick={openPropose}>
                      Propose outcome
                    </Button>
                  ))}
              </>
            ) : undefined
          }
          menu={
            c.me.canWork && !c.me.recused ? (
              <>
                <MenuItem onSelect={() => setDialog('relief')}>Record interim relief</MenuItem>
                <MenuItem onSelect={() => setDialog('recuse')}>Step aside from this case</MenuItem>
              </>
            ) : undefined
          }
        />
        <StatusTrail steps={c.stages.map((label) => ({ label }))} current={c.stageIndex} label="Case stages" />
        <ClockPanel title="Due dates" items={c.dates.map(toClock)} today={asDate(live.today)} source={c.datesSource} />
        <Workspace
          main={
            <Tabs value={tab} onValueChange={(v) => setTab(v as CaseTab)}>
              <TabsList aria-label="Case sections">
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="evidence" count={c.files.length}>
                  Evidence
                </TabsTrigger>
                {c.kind !== 'disciplinary' && (
                  <TabsTrigger value="messages" count={c.messages.length}>
                    {c.anonymous ? 'Anonymous messages' : 'Messages'}
                  </TabsTrigger>
                )}
                {c.notice && <TabsTrigger value="notice">{c.kind === 'disciplinary' ? 'Show-cause and reply' : 'Notice and reply'}</TabsTrigger>}
                <TabsTrigger value="decision">{posh ? 'IC report' : c.kind === 'disciplinary' ? 'Decision' : 'Outcome'}</TabsTrigger>
                <TabsTrigger value="relief" count={c.relief.length}>
                  {c.kind === 'disciplinary' ? 'Actions for HR' : 'Interim relief'}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="timeline">
                <div className="yx-ops-stack">
                <Card title={c.kind === 'disciplinary' ? 'Misconduct' : 'The report'}>
                  <DescriptionList
                    items={c.kind === 'disciplinary' ? [
                      { label: 'Misconduct', value: c.report.category ?? '—' },
                      ...(c.rule ? [{ label: 'Standing orders', value: c.rule }] : []),
                      { label: 'Facts', value: c.report.summary },
                      { label: 'Employee', value: c.respondent ?? '—' },
                    ] : [
                      { label: 'What happened', value: c.report.summary },
                      ...(c.report.category ? [{ label: 'Topic', value: c.report.category }] : []),
                      ...(c.report.happenedOn ? [{ label: 'When', value: day(c.report.happenedOn) }] : []),
                      ...(c.report.involved ? [{ label: 'Who was involved', value: c.report.involved }] : []),
                      ...(c.report.outside ? [{ label: 'Outside the company', value: c.report.outside }] : []),
                      ...(c.report.witnesses ? [{ label: 'Witnesses', value: c.report.witnesses }] : []),
                    ]}
                  />
                  {c.report.retaliationWorry && <InlineAlert tone="warning">The reporter is worried about retaliation.</InlineAlert>}
                  {c.report.late && <InlineAlert tone="info">Filed after the law's window from the incident; the committee decides whether to accept it.</InlineAlert>}
                </Card>
                <ol className="yx-ops-conv" aria-label="Case timeline">
                  {c.timeline.map((t) => (
                    <li key={t.id} className="yx-ops-msg">
                      <span className="yx-ops-msg__meta">
                        <span className="yx-ops-msg__who">{t.who}</span>
                        <span>{day(t.at)}</span>
                      </span>
                      <p className="yx-ops-msg__body">{t.text}</p>
                    </li>
                  ))}
                </ol>
                </div>
              </TabsContent>
              <TabsContent value="evidence">
                <EvidenceTab live={live} c={c} />
              </TabsContent>
              <TabsContent value="messages">
                <div className="yx-ops-stack">
                  {c.anonymous && <InlineAlert tone="info">The reporter reads and replies with their reply code. You can't see who they are.</InlineAlert>}
                  <Thread messages={c.messages} label="Messages with the reporter" viewer="team" />
                  {c.me.canWork && <MessageBox id="cw-msg" label={c.stageIndex === 0 ? 'Message to the reporter (your first message acknowledges the report)' : 'Message to the reporter'} onSend={(t) => live.onSendMessage(c.id, t)} />}
                </div>
              </TabsContent>
              {c.notice && (
                <TabsContent value="notice">
                  <NoticeTab live={live} c={c} />
                </TabsContent>
              )}
              <TabsContent value="decision">{posh ? <IcReportTab live={live} c={c} /> : <OutcomeTab live={live} c={c} onPropose={openPropose} />}</TabsContent>
              <TabsContent value="relief">
                <ReliefTab live={live} c={c} onRecord={() => setDialog('relief')} />
              </TabsContent>
            </Tabs>
          }
          rail={
            <>
              {c.severity && <SeverityCard live={live} c={c} />}
              <Card>
                <MembersList members={members} />
              </Card>
            </>
          }
        />
      </Confidential>
      <Drawer
        open={dialog === 'propose'}
        onOpenChange={(o) => !o && close()}
        title="Propose outcome"
        notice={alert}
        subtitle={`${c.ref} · a second officer approves it`}
        footer={
          <>
            <Button onClick={close}>Cancel</Button>
            <Button variant="primary" loading={busy === 'propose'} onClick={() => void propose()}>
              Propose outcome
            </Button>
          </>
        }
      >
        <div className="yx-ops-stack">
          {!c.canDecide.ok && <InlineAlert tone="warning">{c.canDecide.reason}</InlineAlert>}
          {c.kind === 'disciplinary' ? (
            <FormField id="cw-decision" label="Decision" required helper="Nothing changes in People or Pay by itself. An inquiry is recorded; the inquiry is held outside the app for now." error={proposeEarly.errorOf('cw-decision')}>
              <Segment label="Decision" options={(['dropped', 'warning', 'inquiry'] as CaseDecision[]).map((v) => ({ value: v, label: DECISION_LABEL[v] }))} value={decision} onChange={setDecision} />
            </FormField>
          ) : (
            <FormField id="cw-finding" label="Finding" required helper="“Not proved” is not “false or malicious”; that needs its own reasons." error={proposeEarly.errorOf('cw-finding')}>
              <Segment label="Finding" options={FINDINGS} value={finding} onChange={setFinding} />
            </FormField>
          )}
          <FormField id="cw-action" label="Action" required helper="For example: written warning; no action; training." error={proposeEarly.errorOf('cw-action')}>
            <TextArea rows={2} value={action} onChange={setAction} maxLength={500} />
          </FormField>
          <FormField id="cw-reasons" label="Reasons" required error={proposeEarly.errorOf('cw-reasons')}>
            <TextArea rows={5} value={reasons} onChange={setReasons} maxLength={5000} />
          </FormField>
          <FormField id="cw-summary" label={c.kind === 'disciplinary' ? 'What the employee is told' : 'What the reporter is told'} required helper="Sent once a second person approves. No witness names or notes." error={proposeEarly.errorOf('cw-summary')}>
            <TextArea rows={2} value={summary} onChange={setSummary} maxLength={1000} />
          </FormField>
        </div>
      </Drawer>
      <Dialog
        open={dialog === 'relief'}
        onOpenChange={(o) => !o && close()}
        title="Record interim relief"
        notice={alert}
        description="HR gets a task to carry it out. Nothing changes in People by itself."
        footer={
          <>
            <Button onClick={close}>Cancel</Button>
            <Button variant="primary" loading={busy === 'relief'} onClick={() => void recordRelief()}>
              Record and give HR a task
            </Button>
          </>
        }
      >
        <div className="yx-ops-stack">
          <FormField id="cw-relief" label="Relief" required error={reliefEarly.errorOf('cw-relief')}>
            <Segment label="Relief" options={reliefChoices(c.kind).map((v) => ({ value: v, label: RELIEF_LABEL[v] }))} value={relief} onChange={setRelief} />
          </FormField>
          <FormField id="cw-relief-note" label="What HR should do" required helper="Name the request it answers (for example, the complainant's written request of 24 Sep)." error={reliefEarly.errorOf('cw-relief-note')}>
            <TextArea rows={3} value={reliefNote} onChange={setReliefNote} maxLength={1000} />
          </FormField>
          <FormField id="cw-relief-who" label="Who in HR carries it out" required helper="They get a task with only what to do, not the case." error={reliefEarly.errorOf('cw-relief-who')}>
            <Select value={assignee} onChange={setAssignee} options={c.people.map((p) => ({ value: p.id, label: `${p.name} · ${p.email}` }))} placeholder="Choose a person" />
          </FormField>
        </div>
      </Dialog>
      <Dialog
        open={dialog === 'recuse'}
        onOpenChange={(o) => !o && close()}
        title="Step aside from this case?"
        notice={alert}
        description="You lose access to the case. The other members carry on; if you were the only officer, it goes to the next person in the company's routing."
        footer={
          <>
            <Button onClick={close}>Cancel</Button>
            <Button variant="danger" loading={busy === 'recuse'} onClick={() => void recuse()}>
              Step aside
            </Button>
          </>
        }
      >
        <FormField id="cw-recuse" label="Why you step aside" required helper="For example: I know the respondent well." error={recuseEarly.errorOf('cw-recuse')}>
          <TextArea rows={3} value={recuseReason} onChange={setRecuseReason} maxLength={500} />
        </FormField>
      </Dialog>
      <Dialog
        open={dialog === 'add'}
        onOpenChange={(o) => !o && (close(), setConflict(null))}
        title="Add a case member"
        notice={alert}
        footer={
          <>
            <Button onClick={() => (close(), setConflict(null))}>Cancel</Button>
            <Button variant="primary" onClick={() => void add()}>
              {conflict ? 'Add with the override' : 'Add member'}
            </Button>
          </>
        }
      >
        <div className="yx-ops-stack">
          <FormField id="cw-person" label="Person" required error={addEarly.errorOf('cw-person')}>
            <Select value={person} onChange={(v) => (setPerson(v), setConflict(null))} options={c.people.map((p) => ({ value: p.id, label: `${p.name} · ${p.email}` }))} placeholder="Choose a person" />
          </FormField>
          <FormField label="Role on the case">
            <Select value={role} onChange={setRole} options={MEMBER_ROLES} />
          </FormField>
          {conflict && (
            <>
              <InlineAlert tone="danger" title="Conflict of interest">
                {conflict}
              </InlineAlert>
              <FormField id="cw-override" label="Why the override is needed" required helper="It goes on the case record and in the audit log." error={addEarly.errorOf('cw-override')}>
                <TextArea rows={2} value={override} onChange={setOverride} maxLength={500} />
              </FormField>
            </>
          )}
        </div>
      </Dialog>
    </OpsDesk>
  );
}

/* =========================================================================================
 * HLP-09 · Ethics desk (live)
 * ======================================================================================= */

export interface LiveEthicsDesk {
  state: LoadState;
  onRetry?: () => void;
  rows: EthicsRow[];
  onOpen: (id: string) => void;
  onRoute: (id: string, reason: string) => Promise<void>;
  /** Stories and tests only. */
  start?: { routeId?: string };
}

export function LiveEthicsDesk({ live }: { live: LiveEthicsDesk }) {
  const [route, setRoute] = useState<string | null>(live.start?.routeId ?? null);
  const [reason, setReason] = useState('');
  const { busy, act, alert } = useAct();
  const early = useTooEarly(reason.trim().length < 3 ? [{ fieldId: 'ed-reason', message: 'Write why the chair should see this report.' }] : []);
  if (live.state === 'no-access')
    return (
      <OpsDesk area="helpdesk" active="Speak-up" member={false}>
        <PageHeader title="Ethics desk" />
        <NoAccessState what="the ethics desk" grantedBy="your company's ethics admin" note="Only the ethics officers the company named see fraud and ethics reports." />
      </OpsDesk>
    );
  const routing = live.rows.find((r) => r.id === route);
  const columns: TableColumn<EthicsRow>[] = [
    { key: 'ref', header: 'Report', type: 'id', value: (r) => r.ref },
    { key: 'subject', header: 'Subject', value: (r) => r.subject, width: 280 },
    { key: 'received', header: 'Received', value: (r) => r.receivedOn, render: (r) => day(r.receivedOn) },
    { key: 'entity', header: 'Entity', value: (r) => r.entity, width: 200 },
    { key: 'by', header: 'Reporter', value: (r) => (r.anonymous ? 'Anonymous' : 'Named, confidential') },
    { key: 'severity', header: 'Severity', type: 'status', value: (r) => SEVERITY_LABEL[r.severity], statusTone: (v) => (v === 'Serious' ? 'danger' : 'neutral') },
    { key: 'clock', header: 'Next date', value: (r) => r.clock?.on ?? '', render: (r) => (r.clock ? `${r.clock.label} ${day(r.clock.on)}` : 'None (company policy)'), width: 200 },
    {
      key: 'routed',
      header: 'Audit committee',
      value: (r) => (r.routed ? 'Routed' : 'Not routed'),
      render: (r) => (r.aboutOfficer ? <Badge tone="warning">About a case officer · with the chair</Badge> : <Badge tone={r.routed ? 'info' : 'neutral'}>{r.routed ? 'Routed' : 'Not routed'}</Badge>),
      width: 220,
    },
    { key: 'stage', header: 'Stage', value: (r) => r.stage },
  ];
  const confirm = async () => {
    if (early.stop()) return;
    if (await act('route', () => live.onRoute(routing!.id, reason.trim()), `${routing!.ref} routed to the chair`, 'The chair can read this report only.')) {
      setRoute(null);
      setReason('');
      early.reset();
    }
  };
  return (
    <OpsDesk area="helpdesk" active="Speak-up" counts={{ 'Speak-up': live.rows.filter((r) => r.stage === 'Received').length }}>
      <PageHeader title="Ethics desk" description="Fraud and ethics reports. HR is not on these cases unless you add them." facts={`${live.rows.length} open · ${live.rows.filter((r) => r.routed).length} routed to the audit committee chair`} />
      {!routing && alert}
      <Confidential note="Confidential. Visible to the ethics officers and the members of each report. Every view is logged.">
        <DataTable
          label="Whistleblower reports"
          columns={columns}
          rows={live.rows}
          getRowId={(r) => r.id}
          state={live.state}
          errorTitle="We couldn't load reports."
          onRetry={live.onRetry}
          empty={<EmptyState title="No open reports." description="New reports from Speak-up arrive here." />}
          rowButtons={(r) => (!r.routed && !r.aboutOfficer ? <Button size="sm" onClick={() => setRoute(r.id)}>Route to chair</Button> : null)}
          onRowClick={(r) => live.onOpen(r.id)}
        />
      </Confidential>
      <Dialog
        open={!!routing}
        onOpenChange={(o) => !o && setRoute(null)}
        title={`Route ${routing?.ref ?? ''} to the audit committee chair?`}
        notice={alert}
        description="The chair gets a limited login for this report only: the report, your updates and the outcome. The reporter's identity stays hidden."
        footer={
          <>
            <Button onClick={() => setRoute(null)}>Cancel</Button>
            <Button variant="primary" loading={busy === 'route'} onClick={() => void confirm()}>
              Route to chair
            </Button>
          </>
        }
      >
        <FormField id="ed-reason" label="Reason" required error={early.errorOf('ed-reason')}>
          <TextArea rows={3} value={reason} onChange={setReason} maxLength={500} />
        </FormField>
      </Dialog>
    </OpsDesk>
  );
}

/* =========================================================================================
 * HLP-08 answer 55 · Report misconduct to HR (a manager, about their own reports)
 * ======================================================================================= */

const REPORT_STATUS: Record<MyMisconductReport['status'], { label: string; tone: BadgeTone }> = {
  received: { label: 'Received by HR', tone: 'info' },
  opened: { label: 'Opened as a case', tone: 'warning' },
  declined: { label: 'Declined by HR', tone: 'neutral' },
};

export interface LiveReportMisconduct {
  state: LoadState;
  onRetry?: () => void;
  today: string;
  /** The people who report to this manager (today). */
  people: { id: string; name: string; email: string }[];
  reports: MyMisconductReport[];
  onFile: (input: MisconductReportInput) => Promise<{ id: string; ref: string }>;
}

/** The designed screen (drawn in HLP-08, answer 55): the form and the manager's own reports with their status only. */
export function ReportMisconductScreen({ live }: { live: LiveReportMisconduct }) {
  const [employee, setEmployee] = useState<string | null>(null);
  const [misconduct, setMisconduct] = useState('');
  const [when, setWhen] = useState<Date | null>(null);
  const [facts, setFacts] = useState('');
  const { busy, act, alert } = useAct();
  const early = useTooEarly([
    ...(!employee ? [{ fieldId: 'rm-employee', message: 'Choose who it is about.' }] : []),
    ...(misconduct.trim().length < 3 ? [{ fieldId: 'rm-misconduct', message: 'Say what happened, in short.' }] : []),
    ...(facts.trim().length < 10 ? [{ fieldId: 'rm-facts', message: 'Write the facts (10 letters or more): what, when, where, who saw it.' }] : []),
  ]);
  if (live.state === 'no-access')
    return (
      <OpsDesk area="helpdesk" active="Speak-up" member={false}>
        <PageHeader title="Report misconduct to HR" />
        <NoAccessState what="this page" grantedBy="the person you act for to sign in themselves" note="A report to HR is your own act, so this page is closed while you act for someone else." />
      </OpsDesk>
    );
  const send = async () => {
    if (early.stop()) return;
    if (await act('send', () => live.onFile({ employeeUserId: employee!, misconduct: misconduct.trim(), facts: facts.trim(), ...(when ? { happenedOn: isoDay(when) } : {}) }), 'Sent to HR', 'HR decides whether it becomes a case. You see here whether they opened or declined it.')) {
      setEmployee(null);
      setMisconduct('');
      setWhen(null);
      setFacts('');
      early.reset();
    }
  };
  const columns: TableColumn<MyMisconductReport>[] = [
    { key: 'ref', header: 'Report', type: 'id', value: (r) => r.ref },
    { key: 'employee', header: 'About', value: (r) => r.employee },
    { key: 'filed', header: 'Sent', value: (r) => r.filedOn, render: (r) => day(r.filedOn) },
    { key: 'status', header: 'Status', value: (r) => REPORT_STATUS[r.status].label, render: (r) => <Badge tone={REPORT_STATUS[r.status].tone}>{REPORT_STATUS[r.status].label}</Badge> },
  ];
  return (
    <OpsDesk area="helpdesk" active="Speak-up" member={false}>
      <PageHeader title="Report misconduct to HR" description="About someone who reports to you. HR decides whether it becomes a disciplinary case; you see only whether they opened or declined it." />
      <Workspace
        main={
          <Card title="New report" footer={<Actions end><Button variant="primary" icon={Send} loading={busy === 'send'} onClick={() => void send()}>Send to HR</Button></Actions>}>
            <div className="yx-ops-stack">
              {alert}
              {live.state === 'ready' && live.people.length === 0 && <InlineAlert tone="info">Nobody reports to you today, so there is no one to report.</InlineAlert>}
              <FormField id="rm-employee" label="About" required error={early.errorOf('rm-employee')}>
                <Select value={employee} onChange={setEmployee} options={live.people.map((p) => ({ value: p.id, label: `${p.name} · ${p.email}` }))} placeholder="Choose a person" />
              </FormField>
              <FormField id="rm-misconduct" label="What happened, in short" required error={early.errorOf('rm-misconduct')}>
                <TextField value={misconduct} onChange={setMisconduct} maxLength={80} />
              </FormField>
              <FormField id="rm-when" label="When" optional>
                <DatePicker value={when} onChange={setWhen} max={asDate(live.today)} />
              </FormField>
              <FormField id="rm-facts" label="Facts" required helper="What, when, where, and who saw it. Facts only; HR may share them with the employee." error={early.errorOf('rm-facts')}>
                <TextArea rows={5} value={facts} onChange={setFacts} maxLength={5000} />
              </FormField>
            </div>
          </Card>
        }
        rail={
          <Card title="Your reports">
            <DataTable
              label="Your reports"
              columns={columns}
              rows={live.reports}
              getRowId={(r) => r.id}
              state={live.state}
              errorTitle="We couldn't load your reports."
              onRetry={live.onRetry}
              empty={<EmptyState compact title="No reports yet." />}
            />
          </Card>
        }
      />
    </OpsDesk>
  );
}
