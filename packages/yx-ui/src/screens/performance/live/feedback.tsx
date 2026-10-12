import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, Link } from '../../../components/button';
import { Checkbox } from '../../../components/choice';
import { DatePicker } from '../../../components/date';
import { Badge } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { TextArea, TextField } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { MultiSelect, Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { DataTable, type TableColumn } from '../../../components/table';
import { dayKey } from '../../../lib/dates';
import { errorText, useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import type { Choice, FeedbackInput, FeedbackItem, FeedbackRequest, LoadState, OneOnOne, OneOnOneSummary } from './types';

// Performance batch PM3, wired (M06-BUILD-DESIGN §8, §15.3; PRF-04 feedback, PRF-05 1:1s). Feedback is never public
// and never scored. A concern (harassment, safety, misconduct) does not belong in feedback: the form links to the
// confidential channel, and HR who handle concerns seal an item so it leaves every performance view.

const KIND = { praise: { label: 'Praise', tone: 'success' }, suggestion: { label: 'Suggestion', tone: 'info' } } as const;
const MEETING = { planned: { label: 'Planned', tone: 'info' }, held: { label: 'Held', tone: 'success' }, cancelled: { label: 'Cancelled', tone: 'neutral' } } as const;
const at = (iso: string) => dateText(iso.slice(0, 10));

export type FeedbackView = 'received' | 'given' | 'requests' | 'team' | 'concerns';

export interface FeedbackScreenProps {
  state: LoadState;
  onRetry?: () => void;
  view: FeedbackView;
  onView: (v: FeedbackView) => void;
  /** The viewer manages people (shows "My team"). */
  hasTeam: boolean;
  /** The viewer seals concerns (shows "Concerns", one person's feedback with sealed text). */
  canSeal: boolean;
  sealEmployeeId: string | null;
  onSealEmployee: (id: string | null) => void;
  items: FeedbackItem[];
  requests: FeedbackRequest[];
  colleagues: Choice[];
  /** People the viewer can ask feedback about: themselves and their team. */
  askAbout: Choice[];
  /** Where to report a concern confidentially. */
  concernHref: string;
  onGive: (input: FeedbackInput) => Promise<unknown>;
  onWithdraw: (id: string) => Promise<unknown>;
  onRequest: (input: { aboutEmployeeId: string; askedEmployeeIds: string[]; question: string; dueOn: string | null }) => Promise<unknown>;
  onDecline: (id: string) => Promise<unknown>;
  onSeal: (id: string, reason: string) => Promise<unknown>;
}

export function FeedbackScreen(p: FeedbackScreenProps) {
  const { busy, error, run } = useRun();
  const [giving, setGiving] = useState<{ to?: string; request?: FeedbackRequest } | null>(null);
  const [asking, setAsking] = useState(false);
  const [sealing, setSealing] = useState<FeedbackItem | null>(null);
  const columns: TableColumn<FeedbackItem>[] = [
    { key: 'who', header: p.view === 'given' ? 'To' : p.view === 'received' ? 'From' : 'From → to', value: (x) => (p.view === 'given' ? x.to : p.view === 'received' ? x.from : `${x.from} → ${x.to}`), width: 220, hideable: false },
    { key: 'kind', header: 'Kind', value: (x) => x.kind, render: (x) => <Badge tone={KIND[x.kind].tone}>{KIND[x.kind].label}</Badge>, width: 120 },
    { key: 'text', header: 'Feedback', value: (x) => x.text ?? '', render: (x) => (x.text === null ? <Text tone="secondary">Removed by HR</Text> : <Text>{x.text}</Text>), width: 420 },
    { key: 'at', header: 'Given on', value: (x) => x.at, render: (x) => <Text>{at(x.at)}</Text>, width: 130 },
    ...(p.view === 'concerns' ? [{ key: 'sealed', header: 'Sealed', value: (x: FeedbackItem) => (x.sealed ? 'Sealed' : ''), render: (x: FeedbackItem) => (x.sealed ? <Badge tone="warning">Sealed</Badge> : null), width: 110 }] : []),
  ];
  const views = [
    { value: 'received' as const, label: 'Received' },
    { value: 'given' as const, label: 'Given' },
    { value: 'requests' as const, label: p.requests.length ? `Asked of me (${p.requests.length})` : 'Asked of me' },
    ...(p.hasTeam ? [{ value: 'team' as const, label: 'My team' }] : []),
    ...(p.canSeal ? [{ value: 'concerns' as const, label: 'Concerns' }] : []),
  ];
  return (
    <LivePage
      title="Feedback"
      description="Praise and suggestions between colleagues. Only the person, and their managers unless you choose otherwise, read it."
      state={p.state}
      onRetry={p.onRetry}
      what="feedback"
      actions={
        <>
          {p.askAbout.length > 0 && <Button onClick={() => setAsking(true)}>Ask for feedback</Button>}
          <Button variant="primary" icon={Plus} onClick={() => setGiving({})}>
            Give feedback
          </Button>
        </>
      }
    >
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      <Segment label="Show" value={p.view} onChange={p.onView} options={views} />
      {p.view === 'concerns' && (
        <FormField id="fb-person" label="Employee" helper="Their feedback, given and received, including sealed text. Reading it is recorded.">
          <Select aria-label="Employee" value={p.sealEmployeeId} onChange={p.onSealEmployee} options={p.colleagues} searchable clearable />
        </FormField>
      )}
      {p.view === 'requests' ? (
        p.requests.length === 0 ? (
          <EmptyState compact title="No one is waiting on you." />
        ) : (
          <ul className="yx-lif-list">
            {p.requests.map((r) => (
              <li key={r.id}>
                <Text>{`${r.requestedBy} asks about ${r.about}: ${r.question}${r.dueOn ? ` (by ${dateText(r.dueOn)})` : ''}`}</Text>{' '}
                <Button size="sm" variant="primary" onClick={() => setGiving({ to: r.aboutEmployeeId, request: r })}>
                  Answer
                </Button>{' '}
                <Button size="sm" loading={busy === `d-${r.id}`} onClick={() => void run(`d-${r.id}`, () => p.onDecline(r.id))}>
                  Decline
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <DataTable
          label="Feedback"
          columns={columns}
          rows={p.items}
          getRowId={(x) => x.id}
          rowNoun={['item', 'items']}
          cardSummary
          empty={<EmptyState compact title={p.view === 'concerns' && !p.sealEmployeeId ? 'Choose an employee.' : 'Nothing here yet.'} />}
          rowButtons={(x) => (
            <>
              {x.can.withdraw && (
                <Button size="sm" loading={busy === `w-${x.id}`} onClick={() => void run(`w-${x.id}`, () => p.onWithdraw(x.id))}>
                  Withdraw
                </Button>
              )}
              {x.can.seal && (
                <Button size="sm" variant="danger" onClick={() => setSealing(x)}>
                  Seal
                </Button>
              )}
            </>
          )}
        />
      )}
      {giving && (
        <GiveDrawer
          colleagues={p.colleagues}
          to={giving.to ?? null}
          request={giving.request ?? null}
          concernHref={p.concernHref}
          onClose={() => setGiving(null)}
          onSave={async (input) => {
            await p.onGive(input);
            setGiving(null);
          }}
        />
      )}
      {asking && <AskDialog about={p.askAbout} colleagues={p.colleagues} onClose={() => setAsking(false)} onSave={p.onRequest} />}
      {sealing && <SealDialog item={sealing} onClose={() => setSealing(null)} onSeal={(reason) => p.onSeal(sealing.id, reason)} />}
    </LivePage>
  );
}

function GiveDrawer({ colleagues, to: initialTo, request, concernHref, onClose, onSave }: { colleagues: Choice[]; to: string | null; request: FeedbackRequest | null; concernHref: string; onClose: () => void; onSave: (f: FeedbackInput) => Promise<void> }) {
  const [to, setTo] = useState<string | null>(initialTo);
  const [kind, setKind] = useState<'praise' | 'suggestion'>('praise');
  const [text, setText] = useState('');
  const [onlyThem, setOnlyThem] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const errors = [...(to ? [] : [{ fieldId: 'fb-to', message: 'Choose who it is for.' }]), ...(text.trim().length >= 3 ? [] : [{ fieldId: 'fb-text', message: 'Write your feedback.' }])];
  const v = useSaveErrors(errors);
  const save = async () => {
    if (errors.length) return v.reveal();
    setSaving(true);
    setFailed(null);
    try {
      await onSave({ toEmployeeId: to!, kind, text: text.trim(), visibility: onlyThem ? 'recipient_only' : 'private', ...(request ? { requestId: request.id } : {}) });
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={request ? `Feedback about ${request.about}` : 'Give feedback'}
      subtitle={request ? request.question : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Send feedback
          </Button>
        </>
      }
    >
      {v.showErrors && <ErrorSummary errors={v.shownErrors} />}
      {failed && (
        <InlineAlert tone="danger" title="Not sent">
          {failed}
        </InlineAlert>
      )}
      {!request && (
        <FormField id="fb-to" label="For" required error={v.errorOf('fb-to')}>
          <Select aria-label="For" value={to} onChange={setTo} options={colleagues} searchable />
        </FormField>
      )}
      <FormField id="fb-kind" label="Kind">
        <Segment label="Kind of feedback" value={kind} onChange={setKind} options={[{ value: 'praise', label: 'Praise' }, { value: 'suggestion', label: 'Suggestion' }]} />
      </FormField>
      <FormField id="fb-text" label="Feedback" required error={v.errorOf('fb-text')} helper="Specific and kind: what they did and why it mattered.">
        <TextArea value={text} onChange={setText} rows={5} maxLength={2000} />
      </FormField>
      <Checkbox checked={onlyThem} onChange={setOnlyThem} label="Only they can read it" description="Otherwise their managers can read it too." />
      <InlineAlert tone="info" title="Is this about harassment, safety or misconduct?">
        Feedback is not the place for it. <Link href={concernHref}>Report a concern instead</Link>: it goes to a confidential channel, not to the person or their manager.
      </InlineAlert>
    </Drawer>
  );
}

function AskDialog({ about, colleagues, onClose, onSave }: { about: Choice[]; colleagues: Choice[]; onClose: () => void; onSave: FeedbackScreenProps['onRequest'] }) {
  const [who, setWho] = useState<string | null>(about[0]?.value ?? null);
  const [asked, setAsked] = useState<string[]>([]);
  const [question, setQuestion] = useState('');
  const [due, setDue] = useState<Date | null>(null);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title="Ask for feedback"
      confirmLabel="Send requests"
      confirmDisabled={!who || asked.length === 0 || asked.length > 10 || question.trim().length < 3}
      onConfirm={async () => {
        await onSave({ aboutEmployeeId: who!, askedEmployeeIds: asked, question: question.trim(), dueOn: due ? dayKey(due) : null });
        onClose();
      }}
    >
      <FormField id="ask-about" label="About" required>
        <Select aria-label="About" value={who} onChange={setWho} options={about} searchable />
      </FormField>
      <FormField id="ask-who" label="Ask" required helper="Up to 10 colleagues.">
        <MultiSelect aria-label="Colleagues to ask" value={asked} onChange={setAsked} options={colleagues.filter((c) => c.value !== who)} searchable />
      </FormField>
      <FormField id="ask-q" label="Question" required>
        <TextField value={question} onChange={setQuestion} maxLength={500} />
      </FormField>
      <FormField id="ask-due" label="By" optional>
        <DatePicker value={due} onChange={setDue} min={new Date()} aria-label="Answer by" />
      </FormField>
    </ConfirmDialog>
  );
}

function SealDialog({ item, onClose, onSeal }: { item: FeedbackItem; onClose: () => void; onSeal: (reason: string) => Promise<unknown> }) {
  const [reason, setReason] = useState('');
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      destructive
      title={`Seal feedback from ${item.from} to ${item.to}`}
      confirmLabel="Seal"
      confirmDisabled={reason.trim().length < 3}
      onConfirm={async () => {
        await onSeal(reason.trim());
        onClose();
      }}
    >
      <Text as="p">It leaves every performance view and report. The two people see that HR removed it. The reason is recorded.</Text>
      <FormField id="seal-reason" label="Reason" required>
        <TextArea value={reason} onChange={setReason} rows={2} maxLength={500} />
      </FormField>
    </ConfirmDialog>
  );
}

// ------------------------------------------------------------------------------------------ 1:1s (PRF-05)

export interface OneOnOnesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  meetings: OneOnOneSummary[];
  /** My manager and my direct reports. */
  partners: Choice[];
  onCreate: (input: { withEmployeeId: string; on: string }) => Promise<unknown>;
  onOpen: (id: string) => void;
}

export function OneOnOnesScreen(p: OneOnOnesScreenProps) {
  const [planning, setPlanning] = useState(false);
  const [withId, setWithId] = useState<string | null>(null);
  const [on, setOn] = useState<Date | null>(null);
  const columns: TableColumn<OneOnOneSummary>[] = [
    { key: 'with', header: 'With', value: (m) => m.with, width: 240, hideable: false },
    { key: 'on', header: 'On', value: (m) => m.on, render: (m) => <Text>{dateText(m.on)}</Text>, width: 140 },
    { key: 'status', header: 'Status', value: (m) => m.status, render: (m) => <Badge tone={MEETING[m.status].tone}>{MEETING[m.status].label}</Badge>, width: 130 },
  ];
  return (
    <LivePage
      title="1:1s"
      description="Your 1:1s with your manager and your team. Only the two of you see a 1:1."
      state={p.state}
      onRetry={p.onRetry}
      what="1:1s"
      actions={
        p.partners.length > 0 && (
          <Button variant="primary" icon={Plus} onClick={() => setPlanning(true)}>
            Plan a 1:1
          </Button>
        )
      }
    >
      <DataTable
        label="1:1s"
        columns={columns}
        rows={p.meetings}
        getRowId={(m) => m.id}
        rowNoun={['1:1', '1:1s']}
        cardSummary
        empty={<EmptyState compact title="No 1:1s yet." description={p.partners.length ? 'Plan one with your manager or someone in your team.' : undefined} />}
        rowButtons={(m) => (
          <Button size="sm" onClick={() => p.onOpen(m.id)}>
            Open
          </Button>
        )}
      />
      {planning && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setPlanning(false)}
          size="md"
          title="Plan a 1:1"
          confirmLabel="Plan"
          confirmDisabled={!withId || !on}
          onConfirm={async () => {
            await p.onCreate({ withEmployeeId: withId!, on: dayKey(on!) });
            setPlanning(false);
          }}
        >
          <FormField id="oo-with" label="With" required>
            <Select aria-label="With" value={withId} onChange={setWithId} options={p.partners} searchable />
          </FormField>
          <FormField id="oo-on" label="On" required helper="Open action items from your earlier 1:1s move to this one.">
            <DatePicker value={on} onChange={setOn} aria-label="1:1 date" />
          </FormField>
        </ConfirmDialog>
      )}
    </LivePage>
  );
}

export interface OneOnOneScreenProps {
  state: LoadState;
  onRetry?: () => void;
  meeting: OneOnOne | null;
  onBack: () => void;
  onUpdate: (input: { sharedNotes?: string | null; status?: OneOnOne['status']; version: number }) => Promise<unknown>;
  onAgenda: (text: string) => Promise<unknown>;
  onAgendaDone: (id: string, done: boolean) => Promise<unknown>;
  onPrivateNote: (text: string) => Promise<unknown>;
  onAction: (input: { text: string; ownerEmployeeId: string; dueOn: string | null }) => Promise<unknown>;
  onActionDone: (id: string, done: boolean) => Promise<unknown>;
}

export function OneOnOneScreen(p: OneOnOneScreenProps) {
  const m = p.meeting;
  return (
    <LivePage title={m ? `1:1: ${m.employee} and ${m.manager}` : '1:1'} description={m ? `${dateText(m.on)} · ${MEETING[m.status].label}` : undefined} state={p.state} onRetry={p.onRetry} what="this 1:1" actions={<Button onClick={p.onBack}>Back</Button>}>
      {m && <MeetingBody key={`${m.id}-${m.version}`} {...p} m={m} />}
    </LivePage>
  );
}

function MeetingBody(p: OneOnOneScreenProps & { m: OneOnOne }) {
  const { m } = p;
  const { busy, error, run } = useRun();
  const [item, setItem] = useState('');
  const [shared, setShared] = useState(m.sharedNotes ?? '');
  const [mine, setMine] = useState(m.privateNote);
  const [action, setAction] = useState('');
  const [owner, setOwner] = useState<string | null>(m.employeeId);
  const [due, setDue] = useState<Date | null>(null);
  const people = [
    { value: m.employeeId, label: m.employee },
    { value: m.managerEmployeeId, label: m.manager },
  ];
  return (
    <>
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      <Card title="Agenda">
        {m.agenda.length === 0 && (
          <Text as="p" tone="secondary">
            Nothing on the agenda yet. Either of you can add to it.
          </Text>
        )}
        {m.agenda.map((a) => (
          <Checkbox key={a.id} checked={a.done} onChange={(d) => void run(`a-${a.id}`, () => p.onAgendaDone(a.id, d))} label={a.text} description={`Added by ${a.addedBy}`} />
        ))}
        <div className="yx-lif-row">
          <FormField id="oo-item" label="Add to the agenda">
            <TextField value={item} onChange={setItem} maxLength={500} />
          </FormField>
          <Button disabled={item.trim().length < 2} loading={busy === 'agenda'} onClick={() => void run('agenda', async () => {
            await p.onAgenda(item.trim());
            setItem('');
          })}>
            Add
          </Button>
        </div>
      </Card>
      <Card title="Shared notes">
        <FormField id="oo-shared" label="Notes you both see">
          <TextArea value={shared} onChange={setShared} rows={5} maxLength={10000} />
        </FormField>
        <div className="yx-lif-row">
          <Button variant="primary" disabled={shared === (m.sharedNotes ?? '')} loading={busy === 'shared'} onClick={() => void run('shared', () => p.onUpdate({ sharedNotes: shared, version: m.version }))}>
            Save notes
          </Button>
          {m.status === 'planned' && (
            <>
              <Button loading={busy === 'held'} onClick={() => void run('held', () => p.onUpdate({ status: 'held', version: m.version }))}>
                Mark as held
              </Button>
              <Button loading={busy === 'cancel'} onClick={() => void run('cancel', () => p.onUpdate({ status: 'cancelled', version: m.version }))}>
                Cancel the 1:1
              </Button>
            </>
          )}
        </div>
      </Card>
      <Card title="My private note">
        <FormField id="oo-private" label="Only you" helper={`${m.role === 'manager' ? m.employee : m.manager} never sees this, and it is never exported.`}>
          <TextArea value={mine} onChange={setMine} rows={3} maxLength={10000} />
        </FormField>
        <Button disabled={mine === m.privateNote} loading={busy === 'private'} onClick={() => void run('private', () => p.onPrivateNote(mine))}>
          Save my note
        </Button>
      </Card>
      <Card title="Action items">
        {m.actions.length === 0 && (
          <Text as="p" tone="secondary">
            No action items. Open ones move to your next 1:1.
          </Text>
        )}
        {m.actions.map((a) => (
          <Checkbox key={a.id} checked={a.done} onChange={(d) => void run(`x-${a.id}`, () => p.onActionDone(a.id, d))} label={a.text} description={`${a.owner}${a.dueOn ? ` · by ${dateText(a.dueOn)}` : ''}`} />
        ))}
        <div className="yx-lif-grid">
          <FormField id="oo-action" label="New action">
            <TextField value={action} onChange={setAction} maxLength={500} />
          </FormField>
          <FormField id="oo-owner" label="Who">
            <Segment label="Who does it" value={owner ?? m.employeeId} onChange={setOwner} options={people} />
          </FormField>
          <FormField id="oo-due" label="By" optional>
            <DatePicker value={due} onChange={setDue} aria-label="Action due by" />
          </FormField>
        </div>
        <Button disabled={action.trim().length < 2} loading={busy === 'action'} onClick={() => void run('action', async () => {
          await p.onAction({ text: action.trim(), ownerEmployeeId: owner ?? m.employeeId, dueOn: due ? dayKey(due) : null });
          setAction('');
          setDue(null);
        })}>
          Add action
        </Button>
      </Card>
    </>
  );
}
