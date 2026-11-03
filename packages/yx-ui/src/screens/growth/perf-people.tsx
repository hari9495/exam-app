// Performance, people side: quick feedback (PRF-08), 1:1s with suggested agenda (PRF-11, PRF-16), PIP record (PRF-12),
// hand-over list after a manager change (PRF-13), competency framework (PRF-14).
import { useEffect, useMemo, useState } from 'react';
import { Archive, ArrowLeft, CalendarPlus, Check, GitMerge, Lock, MessageSquarePlus, Plus, Send } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { AiBadge, Badge, PersonLabel } from '../../components/display';
import { Icon, Text } from '../../components/foundations';
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, SavedViewMenu, type FilterFieldDef } from '../../components/filters';
import { Drawer } from '../../components/drawer';
import { BottomSheet, ConfirmDialog, Dialog } from '../../components/overlay';
import { useToast } from '../../components/notify';
import { FormField, useTooEarly } from '../../components/field';
import { DatePicker } from '../../components/date';
import { Segment } from '../../components/segment';
import { dayKey } from '../../lib/dates';
import { useNarrow } from '../../components/stepper';
import { useAct } from './perf-live';
import { TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup } from '../../components/choice';
import { MultiSelect, PersonPicker, Select, type PersonOption } from '../../components/select';
import { MenuItem } from '../../components/menu';
import { ApprovalTimeline, type ApprovalStep } from '../../components/timeline';
import { formatDate } from '../../lib/format';
import { matchesFilter, type FilterValue } from '../../lib/table';
import { TODAY } from '../_kit/data';
import { ConfidentialTag, GrowthFrame, SkillLevel, SplitLayout, type Device } from './growth-kit';
import { pipSchedule } from './growth-logic';
import { useRun } from '../org/org-kit';
import type { LoadState } from './perf-goals';
import './growth.css';

/* ================================================================== PRF-08 · Quick feedback */

export type FeedbackVisibility = 'Only them' | 'Them and their manager' | 'Them, their manager and HR';

export interface FeedbackItem {
  id: string;
  from: string;
  to: string;
  kind: 'Praise' | 'Suggestion';
  /** Null when HR removed it (a concern): the people see that HR removed it. */
  text: string | null;
  at: Date;
  goal?: string;
  visibility: FeedbackVisibility;
  /** Live: the giver may withdraw it within 24 hours; HR who handle concerns may seal it. */
  canWithdraw?: boolean;
  canSeal?: boolean;
  sealed?: boolean;
}

export interface FeedbackAsk {
  id: string;
  from: string;
  about: string;
  at: Date;
  /** Live: the person the feedback is about, the question and when it is wanted. */
  aboutId?: string;
  question?: string;
  due?: Date | null;
}

/** The API's visibility values and the words the screen uses. */
export const VISIBILITY: Record<'recipient_only' | 'private' | 'with_hr', FeedbackVisibility> = { recipient_only: 'Only them', private: 'Them and their manager', with_hr: 'Them, their manager and HR' };
const visibilityKey = (v: FeedbackVisibility) => (Object.keys(VISIBILITY) as (keyof typeof VISIBILITY)[]).find((k) => VISIBILITY[k] === v)!;

/** The app's feedback: lists from the server, colleagues searched on the server, every send checked there. */
export interface LiveQuickFeedback {
  onRetry: () => void;
  /** The company's default for "Who can see it" (perf.feedback.default_visibility). */
  defaultVisibility: FeedbackVisibility;
  onPeopleSearch: (query: string) => void;
  /** The chosen recipient, so the app can load the goals the viewer may link to (`goals`). */
  onRecipient: (employeeId: string | null) => void;
  /** Private feedback to the viewer's team (managers only; null hides the tab). */
  team: FeedbackItem[] | null;
  /** HR who handle concerns: one person's feedback with sealed text (null hides the tab). */
  concerns: { personId: string | null; onPerson: (id: string | null) => void; items: FeedbackItem[] } | null;
  /** Who the viewer may ask feedback about: themselves and their team. */
  askAbout: { value: string; label: string }[];
  /** Where a concern is reported confidentially. */
  concernHref: string;
  onGive: (input: { toEmployeeId: string; kind: 'praise' | 'suggestion'; text: string; visibility: keyof typeof VISIBILITY; goalId: string | null; requestId?: string }) => Promise<unknown>;
  onWithdraw: (id: string) => Promise<unknown>;
  onAsk: (input: { aboutEmployeeId: string; askedEmployeeIds: string[]; question: string; dueOn: string | null }) => Promise<unknown>;
  onDecline: (id: string) => Promise<unknown>;
  onSeal: (id: string, reason: string) => Promise<unknown>;
}

export interface QuickFeedbackProps {
  device?: Device;
  me: string;
  people: PersonOption[];
  goals: { value: string; label: string }[];
  received: FeedbackItem[];
  given: FeedbackItem[];
  requests?: FeedbackAsk[];
  defaultTab?: 'received' | 'given' | 'requests' | 'team' | 'concerns';
  composerOpen?: boolean;
  /** Stories: show the toast for a sent item. */
  sent?: boolean;
  /** Stories: open the ask sheet, or the seal dialog for the first concern. */
  askOpen?: boolean;
  sealOpen?: boolean;
  state?: LoadState;
  live?: LiveQuickFeedback;
}

function FeedbackList({ items, dir, onWithdraw, onSeal, busy }: { items: FeedbackItem[]; dir: 'from' | 'to' | 'both'; onWithdraw?: (f: FeedbackItem) => void; onSeal?: (f: FeedbackItem) => void; busy?: string | null }) {
  if (items.length === 0) return <EmptyState compact title={dir === 'from' ? 'No feedback received yet' : dir === 'to' ? 'You haven’t given feedback yet' : 'No feedback here yet'} description="Feedback works best when it’s specific and soon after the moment." />;
  return (
    <ul className="yx-growth-list">
      {items.map((f) => (
        <li key={f.id} className="yx-growth-list__item" data-top="">
          <PersonLabel name={dir === 'from' ? f.from : f.to} secondary={dir === 'both' ? `From ${f.from} · ${formatDate(f.at)}` : formatDate(f.at)} size={32} />
          <div className="yx-growth-list__main">
            {f.text === null ? <Text tone="secondary">Removed by HR</Text> : <p className="yx-growth-p">{f.text}</p>}
            <span className="yx-growth-meta">
              {f.goal ? `Linked to “${f.goal}” · ` : ''}Visible to: {f.visibility.toLowerCase()}
            </span>
          </div>
          {f.sealed && <Badge tone="warning">Sealed</Badge>}
          <Badge tone={f.kind === 'Praise' ? 'success' : 'info'}>{f.kind}</Badge>
          {f.canWithdraw && onWithdraw && (
            <Button size="sm" loading={busy === `w-${f.id}`} onClick={() => onWithdraw(f)}>
              Withdraw
            </Button>
          )}
          {f.canSeal && onSeal && (
            <Button size="sm" variant="danger" onClick={() => onSeal(f)}>
              Seal
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function AskSheet({ open, onOpenChange, people, live }: { open: boolean; onOpenChange: (o: boolean) => void; people: PersonOption[]; live?: LiveQuickFeedback }) {
  const about = live?.askAbout ?? [
    { value: 'me', label: 'Myself' },
    { value: 't3', label: 'Meera Iyer' },
  ];
  const [who, setWho] = useState<string | null>(about[0]?.value ?? null);
  const [asked, setAsked] = useState<string[]>([]);
  const [chosen, setChosen] = useState<PersonOption[]>([]);
  const [question, setQuestion] = useState('');
  const [due, setDue] = useState<Date | null>(null);
  const { busy, act } = useAct();
  // Search results plus the people already chosen, so a chosen name stays shown after the next search.
  const options = [...chosen.filter((c) => !people.some((p) => p.id === c.id)), ...people].filter((p) => p.id !== who);
  const check = useTooEarly([
    ...(!who ? [{ fieldId: 'fb-ask-about', message: 'Choose who the feedback is about.' }] : []),
    ...(asked.length === 0 ? [{ fieldId: 'fb-ask-who', message: 'Choose at least one colleague to ask.' }] : asked.length > 10 ? [{ fieldId: 'fb-ask-who', message: 'Ask up to 10 colleagues at a time.' }] : []),
    ...(question.trim().length < 3 ? [{ fieldId: 'fb-ask-q', message: 'Write what you want to know.' }] : []),
  ]);
  const close = () => {
    onOpenChange(false);
    setAsked([]);
    setChosen([]);
    setQuestion('');
    setDue(null);
    check.reset();
  };
  const send = async () => {
    if (check.stop()) return;
    if (!live) return close();
    if (await act('ask', () => live.onAsk({ aboutEmployeeId: who!, askedEmployeeIds: asked, question: question.trim(), dueOn: due ? dayKey(due) : null }), `Asked ${asked.length} ${asked.length === 1 ? 'colleague' : 'colleagues'} for feedback`)) close();
  };
  return (
    <Drawer
      open={open}
      onOpenChange={(x) => (x ? onOpenChange(true) : close())}
      title="Ask for feedback"
      dirty={question.length > 0 || asked.length > 0}
      footer={
        <div className="yx-growth-foot">
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" icon={Send} loading={busy === 'ask'} onClick={() => void send()}>
            Send requests
          </Button>
        </div>
      }
    >
      <div className="yx-growth-stack">
        <FormField label="About" required id="fb-ask-about" error={check.errorOf('fb-ask-about')}>
          <Select value={who} onChange={setWho} options={about} />
        </FormField>
        <FormField label="Ask" required rule="Up to 10 colleagues." id="fb-ask-who" error={check.errorOf('fb-ask-who')}>
          <MultiSelect
            value={asked}
            onChange={(ids) => {
              setChosen(options.filter((p) => ids.includes(p.id)));
              setAsked(ids);
            }}
            options={options.map((p) => ({ value: p.id, label: p.name }))}
            onSearchChange={live?.onPeopleSearch}
            searchPlaceholder="Search people"
          />
        </FormField>
        <FormField label="What do you want to know" required id="fb-ask-q" error={check.errorOf('fb-ask-q')} helper="One clear question gets better answers.">
          <TextField value={question} onChange={setQuestion} maxLength={500} />
        </FormField>
        <FormField label="Answer by" optional>
          <DatePicker value={due} onChange={setDue} min={live ? new Date() : TODAY} />
        </FormField>
        <div className="yx-growth-effect">
          <span className="yx-growth-effect__title">When you send</span>
          <ul>
            <li>Each colleague gets an in-app request and sees it under Requests.</li>
            <li>They may answer or decline. You see what they write under Received.</li>
          </ul>
        </div>
      </div>
    </Drawer>
  );
}

function SealDialog({ item, onClose, onSeal }: { item: FeedbackItem | null; onClose: () => void; onSeal: (reason: string) => Promise<unknown> }) {
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const { toast } = useAct();
  return (
    <ConfirmDialog
      open={item != null}
      onOpenChange={(o) => {
        if (o) return;
        onClose();
        setReason('');
        setTried(false);
      }}
      destructive
      title={item ? `Seal feedback from ${item.from} to ${item.to}?` : 'Seal feedback'}
      consequence="It leaves every performance view and report. The two people see that HR removed it. The reason is recorded."
      confirmLabel="Seal feedback"
      onConfirm={async () => {
        setTried(true);
        if (reason.trim().length < 3) {
          document.getElementById('fb-seal-reason')?.focus();
          return false;
        }
        await onSeal(reason.trim());
        toast({ title: 'Feedback sealed', tone: 'success' });
      }}
    >
      <FormField label="Reason" required id="fb-seal-reason" error={tried && reason.trim().length < 3 ? 'Enter a reason of at least 3 characters.' : null}>
        <TextArea value={reason} onChange={setReason} rows={2} maxLength={500} />
      </FormField>
    </ConfirmDialog>
  );
}

/** PRF-08 Quick feedback (T4): give anytime to any colleague, visibility rule shown before sending (YX-PERF-04). */
export function QuickFeedbackScreen({ device: deviceProp, me, people, goals, received, given, requests = [], defaultTab = 'received', composerOpen, sent: sentProp, askOpen, sealOpen, state = 'ready', live }: QuickFeedbackProps) {
  // The live page takes the designed phone layout under 768 px, as PRF-01, 02 and 06 do.
  const narrow = useNarrow();
  const device: Device = deviceProp ?? (live && narrow ? 'phone' : 'desktop');
  const [open, setOpen] = useState(!!composerOpen);
  const [to, setTo] = useState<string | null>(composerOpen && !live ? (people[1]?.id ?? null) : null);
  const [kind, setKind] = useState<'Praise' | 'Suggestion'>('Praise');
  const [text, setText] = useState(composerOpen && !live ? 'Thanks for staying back to re-run the seal-strength tests on line 3. We shipped on time because of it.' : '');
  const [goal, setGoal] = useState<string | null>(null);
  const [vis, setVis] = useState<FeedbackVisibility>(live?.defaultVisibility ?? 'Them and their manager');
  const [answering, setAnswering] = useState<FeedbackAsk | null>(null);
  const [chosen, setChosen] = useState<PersonOption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(!!askOpen);
  const [sealing, setSealing] = useState<FeedbackItem | null>(sealOpen ? (live?.concerns?.items[0] ?? received[0] ?? null) : null);
  const [concernPerson, setConcernPerson] = useState<PersonOption | null>(null);
  const { busy, act, toast } = useAct();
  const shown = [...(chosen && !people.some((p) => p.id === chosen.id) ? [chosen] : []), ...people];
  const person = answering ? { id: answering.aboutId ?? '', name: answering.about } : shown.find((p) => p.id === to);
  // Stories: the sent state shows the toast the app shows after sending.
  useEffect(() => {
    if (sentProp) toast({ title: 'Feedback sent to Meera Iyer', description: 'They can see it now. You can find it under Given.', tone: 'success' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickTo = (id: string | null) => {
    setTo(id);
    setGoal(null);
    setChosen(shown.find((p) => p.id === id) ?? null);
    live?.onRecipient(id);
  };
  const close = () => {
    setOpen(false);
    setAnswering(null);
    setError(null);
  };
  const reset = () => {
    setTo(null);
    setText('');
    setGoal(null);
    setKind('Praise');
    setVis(live?.defaultVisibility ?? 'Them and their manager');
    live?.onRecipient(null);
  };
  const send = async () => {
    const target = answering ? (answering.aboutId ?? null) : to;
    if (!target) {
      setError('Choose who the feedback is for.');
      return document.getElementById('fb-to')?.focus();
    }
    if (text.trim().length < 20) {
      setError('Write at least 20 characters so the feedback is specific.');
      return document.getElementById('fb-text')?.focus();
    }
    setError(null);
    if (!live) return close();
    const done = await act('give', () => live.onGive({ toEmployeeId: target, kind: kind === 'Praise' ? 'praise' : 'suggestion', text: text.trim(), visibility: visibilityKey(vis), goalId: goal, ...(answering ? { requestId: answering.id } : {}) }), `Feedback sent to ${person?.name ?? 'your colleague'}`);
    if (done) {
      close();
      reset();
    }
  };
  const answer = (r: FeedbackAsk) => {
    setAnswering(r);
    setTo(r.aboutId ?? null);
    live?.onRecipient(r.aboutId ?? null);
    setOpen(true);
  };

  const form = (
    <div className="yx-growth-stack">
      {answering ? (
        <InlineAlert tone="info" title={`${answering.from} asked about ${answering.about}`}>
          {answering.question ?? answering.about}
        </InlineAlert>
      ) : (
        <FormField label="To" required id="fb-to" error={error && !to ? error : null}>
          <PersonPicker people={shown.filter((p) => p.name !== me)} value={to} onChange={pickTo} onSearchChange={live?.onPeopleSearch} />
        </FormField>
      )}
      <FormField label="Type">
        <Segment label="Type" value={kind} onChange={setKind} options={[{ value: 'Praise' as const, label: 'Praise' }, { value: 'Suggestion' as const, label: 'Suggestion' }]} />
      </FormField>
      <FormField label="Feedback" required id="fb-text" helper="Say what they did and what it led to." error={error && (to || answering) ? error : null}>
        <TextArea value={text} onChange={setText} rows={4} maxLength={2000} />
      </FormField>
      <FormField label="Link to one of their goals" optional helper={live && person && goals.length === 0 ? 'You can link only goals you can see; none here.' : undefined}>
        <Select value={goal} onChange={setGoal} clearable placeholder="No goal" options={goals} />
      </FormField>
      <FormField label="Who can see it">
        <RadioGroup
          aria-label="Who can see it"
          value={vis}
          onChange={(v) => setVis(v as FeedbackVisibility)}
          options={[
            { value: 'Only them', label: `Only ${person?.name ?? 'them'}` },
            { value: 'Them and their manager', label: `${person?.name ?? 'Them'} and their manager` },
            { value: 'Them, their manager and HR', label: `${person?.name ?? 'Them'}, their manager and HR` },
          ]}
        />
      </FormField>
      <div className="yx-growth-effect" aria-live="polite">
        <span className="yx-growth-effect__title">When you send</span>
        <ul>
          <li>{person ? `${person.name} gets an in-app notification.` : 'Choose a person to see who is notified.'}</li>
          <li>It shows in their feedback list{vis !== 'Only them' ? ' and their manager’s view' : ''}, and as context in their next review.</li>
          <li>Feedback outside a review never changes a rating. You can withdraw it within 24 hours.</li>
        </ul>
      </div>
      <Text size="sm" tone="secondary">
        Harassment, safety or misconduct? Feedback is not the place for it. <Link href={live?.concernHref ?? '#'}>Report a concern</Link>: it goes to a confidential channel.
      </Text>
    </div>
  );
  const footer = (
    <div className="yx-growth-foot">
      <Button onClick={close}>Cancel</Button>
      <Button variant="primary" icon={Send} loading={busy === 'give'} onClick={() => void send()}>
        Send feedback
      </Button>
    </div>
  );
  const withdraw = live && ((f: FeedbackItem) => void act(`w-${f.id}`, () => live.onWithdraw(f.id), 'Feedback withdrawn'));
  const lists = (
    <Tabs defaultValue={defaultTab}>
      <TabsList aria-label="Feedback">
        <TabsTrigger value="received" count={received.length}>
          Received
        </TabsTrigger>
        <TabsTrigger value="given" count={given.length}>
          Given
        </TabsTrigger>
        <TabsTrigger value="requests" count={requests.length}>
          Requests
        </TabsTrigger>
        {live?.team && (
          <TabsTrigger value="team" count={live.team.length}>
            My team
          </TabsTrigger>
        )}
        {live?.concerns && <TabsTrigger value="concerns">Concerns</TabsTrigger>}
      </TabsList>
      <TabsContent value="received">{state === 'loading' ? <Skeleton height={200} /> : <FeedbackList items={received} dir="from" />}</TabsContent>
      <TabsContent value="given">
        <FeedbackList items={given} dir="to" onWithdraw={withdraw || undefined} busy={busy} />
      </TabsContent>
      <TabsContent value="requests">
        {requests.length === 0 ? (
          <EmptyState compact title="No one has asked you for feedback" />
        ) : (
          <ul className="yx-growth-list">
            {requests.map((r) => (
              <li key={r.id} className="yx-growth-list__item">
                <PersonLabel name={r.from} secondary={`Asked ${formatDate(r.at)}${r.due ? ` · answer by ${formatDate(r.due)}` : ''}`} />
                <span className="yx-growth-grow">About: {r.question ? `${r.about}. ${r.question}` : r.about}</span>
                <Button size="sm" onClick={() => answer(r)}>
                  Give feedback
                </Button>
                {live && (
                  <Button size="sm" loading={busy === `d-${r.id}`} onClick={() => void act(`d-${r.id}`, () => live.onDecline(r.id), 'Request declined')}>
                    Decline
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </TabsContent>
      {live?.team && (
        <TabsContent value="team">
          <FeedbackList items={live.team} dir="both" />
        </TabsContent>
      )}
      {live?.concerns && (
        <TabsContent value="concerns">
          <div className="yx-growth-stack">
            <FormField label="Employee" helper="Their feedback, given and received, including sealed text. Reading it is recorded.">
              <PersonPicker
                value={live.concerns.personId}
                onChange={(id) => {
                  setConcernPerson(shown.find((p) => p.id === id) ?? null);
                  live.concerns!.onPerson(id);
                }}
                people={[...(concernPerson && !people.some((p) => p.id === concernPerson.id) ? [concernPerson] : []), ...people]}
                onSearchChange={live.onPeopleSearch}
                clearable
              />
            </FormField>
            {live.concerns.personId ? <FeedbackList items={live.concerns.items} dir="both" onSeal={setSealing} /> : <EmptyState compact title="Choose an employee" description="Search by name to read their feedback." />}
          </div>
        </TabsContent>
      )}
    </Tabs>
  );
  const askButton = (live ? live.askAbout.length > 0 : true) && (
    <Button fullWidth={device === 'phone'} onClick={() => setAsking(true)}>
      Ask for feedback
    </Button>
  );
  const sheets = (
    <>
      <AskSheet open={asking} onOpenChange={setAsking} people={people} live={live} />
      <SealDialog item={sealing} onClose={() => setSealing(null)} onSeal={(reason) => (live && sealing ? live.onSeal(sealing.id, reason) : Promise.resolve())} />
    </>
  );
  const title = answering ? `Feedback about ${answering.about}` : 'Give feedback';
  if (state === 'error')
    return (
      <GrowthFrame area="performance" active="Feedback" persona="emp" device={device} phone={{ title: 'Feedback' }}>
        <PageHeader title="Feedback" />
        <ErrorState title="We couldn’t load your feedback" description="Check your connection and try again." onRetry={live?.onRetry} />
      </GrowthFrame>
    );

  if (device === 'phone')
    return (
      <GrowthFrame area="performance" active="Feedback" persona="emp" device="phone" phone={{ title: 'Feedback' }}>
        {lists}
        <div className="yx-growth-pinned">
          <Button variant="primary" fullWidth icon={MessageSquarePlus} onClick={() => setOpen(true)}>
            Give feedback
          </Button>
          {askButton}
        </div>
        <BottomSheet open={open} onOpenChange={(o) => (o ? setOpen(true) : close())} title={title} footer={footer}>
          {form}
        </BottomSheet>
        {sheets}
      </GrowthFrame>
    );
  return (
    <GrowthFrame area="performance" active="Feedback" persona="emp">
      <PageHeader
        title="Feedback"
        description="Give and ask for feedback any time. Feedback inside a review uses nominated reviewers instead."
        actions={
          <>
            {askButton}
            <Button variant="primary" icon={MessageSquarePlus} onClick={() => setOpen(true)}>
              Give feedback
            </Button>
          </>
        }
      />
      {lists}
      <Drawer open={open} onOpenChange={(o) => (o ? setOpen(true) : close())} title={title} footer={footer} dirty={text.length > 0}>
        {form}
      </Drawer>
      {sheets}
    </GrowthFrame>
  );
}

/* ================================================================== PRF-11 · 1:1s (+ PRF-16 suggested agenda) */

export interface OneOnOneAction {
  id: string;
  text: string;
  owner: string;
  due: Date | null;
  done: boolean;
  goal?: string;
}

export interface OneOnOne {
  id: string;
  employee: string;
  manager: string;
  role: string;
  cadence: string;
  next: Date;
  last: Date | null;
  agenda: { id: string; text: string; by: string }[];
  shared: string;
  privateNote: string;
  actions: OneOnOneAction[];
  history: { at: Date; summary: string }[];
  /** Live list rows carry counts only; the record is loaded when it is opened. */
  counts?: { agenda: number; openActions: number };
  /** Live: planned, held or cancelled. */
  status?: 'planned' | 'held' | 'cancelled';
}

/** 7, 14 or 30 days; null = one-off (perf.one_on_one.cadence_days is the company's default). */
export type Cadence = 7 | 14 | 30 | null;
export const cadenceLabel = (d: Cadence | undefined) => (d === 7 ? 'Every week' : d === 14 ? 'Every 2 weeks' : d === 30 ? 'Monthly' : 'One-off');
const CADENCES: { value: string; label: string }[] = [
  { value: '7', label: 'Weekly' },
  { value: '14', label: 'Every 2 weeks' },
  { value: '30', label: 'Monthly' },
  { value: 'once', label: 'One-off' },
];
const toCadence = (v: string): Cadence => (v === 'once' ? null : (Number(v) as Cadence));

/** The app's 1:1s: the list from the server, the open record loaded on its own, every change saved and refreshed. */
export interface LiveOneOnOnes {
  today: Date;
  onRetry: () => void;
  /** The open record (agenda, notes, actions) and its state; null while nothing is open. */
  record: OneOnOne | null;
  recordState: LoadState;
  onOpen: (id: string | null) => void;
  /** Who the viewer can hold a 1:1 with: their manager and direct reports. */
  partners: { value: string; label: string }[];
  defaultCadence: Cadence;
  /** The two people of the open 1:1 (an action belongs to one of them) and the employee's goals. */
  owners: { value: string; label: string }[];
  goals: { value: string; label: string }[];
  onSchedule: (input: { withEmployeeId: string; on: string; cadenceDays: Cadence }) => Promise<unknown>;
  onAgenda: (text: string) => Promise<unknown>;
  onSharedNotes: (text: string) => Promise<unknown>;
  onPrivateNote: (text: string) => Promise<unknown>;
  onAction: (input: { text: string; ownerEmployeeId: string; dueOn: string | null; goalId: string | null }) => Promise<unknown>;
  onActionDone: (id: string, done: boolean) => Promise<unknown>;
  onHeld: () => Promise<unknown>;
  onReschedule: (on: string) => Promise<unknown>;
}

export interface OneOnOneProps {
  persona: 'emp' | 'mgr';
  device?: Device;
  items: OneOnOne[];
  openId?: string;
  suggestedAgenda?: { id: string; text: string; why: string }[];
  state?: LoadState;
  /** Stories: open the schedule, add-action or reschedule form. */
  scheduleOpen?: boolean;
  actionOpen?: boolean;
  rescheduleOpen?: boolean;
  live?: LiveOneOnOnes;
}

type RecordLive = Pick<LiveOneOnOnes, 'owners' | 'goals' | 'onAgenda' | 'onSharedNotes' | 'onPrivateNote' | 'onAction' | 'onActionDone'>;

function AddActionSheet({ open, onOpenChange, o, live }: { open: boolean; onOpenChange: (o: boolean) => void; o: OneOnOne; live?: RecordLive }) {
  const owners = live?.owners ?? [
    { value: 'e', label: o.employee },
    { value: 'm', label: o.manager },
  ];
  const [text, setText] = useState('');
  const [owner, setOwner] = useState<string | null>(owners[0]?.value ?? null);
  const [due, setDue] = useState<Date | null>(null);
  const [goal, setGoal] = useState<string | null>(null);
  const { busy, act } = useAct();
  const check = useTooEarly([...(text.trim().length < 2 ? [{ fieldId: 'oo-action-text', message: 'Write what needs doing.' }] : []), ...(!owner ? [{ fieldId: 'oo-action-owner', message: 'Choose who does it.' }] : [])]);
  const close = () => {
    onOpenChange(false);
    setText('');
    setDue(null);
    setGoal(null);
    check.reset();
  };
  const save = async () => {
    if (check.stop()) return;
    if (!live) return close();
    if (await act('action', () => live.onAction({ text: text.trim(), ownerEmployeeId: owner!, dueOn: due ? dayKey(due) : null, goalId: goal }), 'Action item added')) close();
  };
  return (
    <Drawer
      open={open}
      onOpenChange={(x) => (x ? onOpenChange(true) : close())}
      title="Add action item"
      dirty={text.length > 0}
      footer={
        <div className="yx-growth-foot">
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" icon={Plus} loading={busy === 'action'} onClick={() => void save()}>
            Add action item
          </Button>
        </div>
      }
    >
      <div className="yx-growth-stack">
        <FormField label="What needs doing" required id="oo-action-text" error={check.errorOf('oo-action-text')}>
          <TextField value={text} onChange={setText} />
        </FormField>
        <FormField label="Who does it" required id="oo-action-owner" error={check.errorOf('oo-action-owner')}>
          <Select value={owner} onChange={setOwner} options={owners} />
        </FormField>
        <FormField label="Due" optional>
          <DatePicker value={due} onChange={setDue} />
        </FormField>
        <FormField label={`Link to one of ${o.employee}’s goals`} optional helper={live && !live.goals.length ? 'No active goals to link yet.' : undefined}>
          <Select value={goal} onChange={setGoal} clearable placeholder="No goal" options={live?.goals ?? []} />
        </FormField>
      </div>
    </Drawer>
  );
}

/** PRF-16 suggested 1:1 agenda for the manager: from open goals, open actions and recent praise; nothing is added until chosen. */
export function SuggestedAgendaPanel({ employee, items, onAdd }: { employee: string; items: { id: string; text: string; why: string }[]; /** Live: adds the item to the 1:1's shared agenda (PRF-11). */ onAdd: (item: { id: string; text: string; why: string }) => Promise<void> | void }) {
  const [added, setAdded] = useState<string[]>([]);
  const { run, busy, error } = useRun();
  return (
    <section className="yx-growth-panel" data-tone="ai" aria-label="Suggested agenda">
      <div className="yx-growth-row">
        <h3 className="yx-growth-h">Suggested agenda for {employee}</h3>
        <AiBadge />
      </div>
      <Text size="sm" tone="secondary">
        From open goals, feedback themes and your last 1:1 notes. Nothing is added until you choose.
      </Text>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {items.length === 0 ? (
        <Text tone="secondary">Nothing to suggest: no goals off track, open actions or new praise.</Text>
      ) : (
        <ul className="yx-growth-list">
          {items.map((s) => (
            <li key={s.id} className="yx-growth-list__item">
              <div className="yx-growth-list__main">
                <span className="yx-growth-list__title">{s.text}</span>
                <span className="yx-growth-meta">Why: {s.why}</span>
              </div>
              {added.includes(s.id) ? (
                <Badge tone="success">Added</Badge>
              ) : (
                <Button size="sm" loading={busy === s.id} onClick={() => void run(s.id, async () => await onAdd(s)).then((ok) => ok && setAdded((a) => [...a, s.id]))}>
                  Add to agenda
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OneOnOneRecord({ o, persona, suggested, live, actionOpen }: { o: OneOnOne; persona: 'emp' | 'mgr'; suggested?: OneOnOneProps['suggestedAgenda']; live?: RecordLive; actionOpen?: boolean }) {
  const [agenda, setAgenda] = useState(o.agenda);
  const [draft, setDraft] = useState('');
  const [actions, setActions] = useState(o.actions);
  const [shared, setShared] = useState(o.shared);
  const [mine, setMine] = useState(o.privateNote);
  const [adding, setAdding] = useState(!!actionOpen);
  const { busy, act } = useAct();
  const agendaCheck = useTooEarly(draft.trim().length < 2 ? [{ fieldId: 'oo-agenda', message: 'Write the agenda item first.' }] : []);
  // Live: the server's record is the truth; it arrives again after every save.
  const shownAgenda = live ? o.agenda : agenda;
  const shownActions = live ? o.actions : actions;
  const other = persona === 'mgr' ? o.employee : o.manager;
  const addItem = async (text: string, id?: string) => {
    if (live) return act('agenda', () => live.onAgenda(text), 'Agenda item added');
    setAgenda((xs) => [...xs, { id: id ?? `n${xs.length}`, text, by: persona === 'mgr' ? o.manager : o.employee }]);
    return true;
  };
  return (
    <div className="yx-growth-stack">
      <section aria-label="Agenda" className="yx-growth-stack" data-gap="sm">
        <h3 className="yx-growth-h">Shared agenda · {formatDate(o.next)}</h3>
        {shownAgenda.length === 0 ? (
          <Text tone="secondary">Nothing on the agenda yet. Either of you can add an item.</Text>
        ) : (
          <ol className="yx-growth-list">
            {shownAgenda.map((a) => (
              <li key={a.id} className="yx-growth-list__item">
                <span className="yx-growth-grow">{a.text}</span>
                <span className="yx-growth-meta">Added by {a.by}</span>
              </li>
            ))}
          </ol>
        )}
        <div className="yx-growth-row">
          <div className="yx-growth-grow">
            <FormField label="Add an agenda item" hideLabel id="oo-agenda" error={agendaCheck.errorOf('oo-agenda')}>
              <TextField placeholder="Add an agenda item" value={draft} onChange={setDraft} />
            </FormField>
          </div>
          <Button
            icon={Plus}
            loading={busy === 'agenda'}
            onClick={async () => {
              if (agendaCheck.stop()) return;
              if (await addItem(draft.trim())) {
                setDraft('');
                agendaCheck.reset();
              }
            }}
          >
            Add item
          </Button>
        </div>
      </section>
      {suggested && persona === 'mgr' && (
        <SuggestedAgendaPanel
          employee={o.employee}
          items={suggested}
          onAdd={async (x) => {
            // addItem says why it failed (toast); the panel then keeps the item addable.
            if (!(await addItem(x.text, x.id))) throw new Error('The item was not added. Try again.');
          }}
        />
      )}
      <div className="yx-growth-cols" data-n="2">
        <section className="yx-growth-note" aria-label="Shared notes">
          <h3 className="yx-growth-h">Shared notes</h3>
          <Text size="sm" tone="secondary">
            You and {other} both see these. They save when you leave the box.
          </Text>
          <TextArea aria-label="Shared notes" value={shared} onChange={setShared} onBlur={() => live && shared !== o.shared && void act('shared', () => live.onSharedNotes(shared), 'Shared notes saved')} rows={5} />
        </section>
        <section className="yx-growth-note" data-private="" aria-label="My private notes">
          <h3 className="yx-growth-h">
            <Icon icon={Lock} /> My private notes
          </h3>
          <Text size="sm" tone="secondary">
            Only you can see these. They stay with you if either of you changes role.
          </Text>
          <TextArea aria-label="My private notes" value={mine} onChange={setMine} onBlur={() => live && mine !== o.privateNote && void act('private', () => live.onPrivateNote(mine), 'Private notes saved')} rows={5} />
        </section>
      </div>
      <section aria-label="Action items" className="yx-growth-stack" data-gap="sm">
        <h3 className="yx-growth-h">Action items</h3>
        {shownActions.length === 0 ? (
          <Text tone="secondary">No action items. Open ones carry over to your next 1:1.</Text>
        ) : (
          <ul className="yx-growth-list">
            {shownActions.map((a) => (
              <li key={a.id} className="yx-growth-list__item">
                <Checkbox
                  checked={a.done}
                  onChange={(c) => (live ? void act('done', () => live.onActionDone(a.id, c), c ? 'Action marked done' : 'Action reopened') : setActions((xs) => xs.map((x) => (x.id === a.id ? { ...x, done: c } : x))))}
                  label={a.text}
                  description={`${a.owner}${a.due ? ` · due ${formatDate(a.due)}` : ''}${a.goal ? ` · goal: ${a.goal}` : ''}`}
                />
              </li>
            ))}
          </ul>
        )}
        <div className="yx-growth-row">
          <Button icon={Plus} size="sm" onClick={() => setAdding(true)}>
            Add action item
          </Button>
        </div>
      </section>
      <AddActionSheet open={adding} onOpenChange={setAdding} o={o} live={live} />
    </div>
  );
}

function ScheduleSheet({ open, onOpenChange, live, today }: { open: boolean; onOpenChange: (o: boolean) => void; live?: LiveOneOnOnes; today: Date }) {
  const partners = live?.partners ?? [
    { value: 't2', label: 'Rohit Bhat' },
    { value: 't3', label: 'Meera Iyer' },
  ];
  const [who, setWho] = useState<string | null>(null);
  const [on, setOn] = useState<Date | null>(null);
  const [cadence, setCadence] = useState<string>(String(live ? (live.defaultCadence ?? 'once') : 14));
  const { busy, act } = useAct();
  const check = useTooEarly([...(!who ? [{ fieldId: 'oo-with', message: 'Choose who the 1:1 is with.' }] : []), ...(!on ? [{ fieldId: 'oo-on', message: 'Choose the date of the first 1:1.' }] : [])]);
  const close = () => {
    onOpenChange(false);
    setWho(null);
    setOn(null);
    check.reset();
  };
  const save = async () => {
    if (check.stop()) return;
    if (!live) return close();
    if (await act('schedule', () => live.onSchedule({ withEmployeeId: who!, on: dayKey(on!), cadenceDays: toCadence(cadence) }), '1:1 scheduled')) close();
  };
  return (
    <Drawer
      open={open}
      onOpenChange={(x) => (x ? onOpenChange(true) : close())}
      title="Schedule 1:1"
      footer={
        <div className="yx-growth-foot">
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" icon={CalendarPlus} loading={busy === 'schedule'} onClick={() => void save()}>
            Schedule 1:1
          </Button>
        </div>
      }
    >
      <div className="yx-growth-stack">
        <FormField label="With" required id="oo-with" error={check.errorOf('oo-with')} helper={live && !partners.length ? 'You have no manager or direct reports to meet yet.' : undefined}>
          <Select value={who} onChange={setWho} options={partners} placeholder="Choose a person" />
        </FormField>
        <FormField label="First 1:1 on" required id="oo-on" error={check.errorOf('oo-on')}>
          <DatePicker value={on} onChange={setOn} min={today} />
        </FormField>
        <FormField label="Repeats">
          <Segment label="Repeats" value={cadence} onChange={setCadence} options={CADENCES} />
        </FormField>
        <div className="yx-growth-effect">
          <span className="yx-growth-effect__title">When you schedule</span>
          <ul>
            <li>You both see it in 1:1s and get a reminder the day before.</li>
            <li>{toCadence(cadence) ? `When you mark it as held, the next one is planned ${cadenceLabel(toCadence(cadence)).toLowerCase()}.` : 'It happens once; schedule the next one when you need it.'}</li>
            <li>Open action items from your earlier 1:1s carry over to it.</li>
          </ul>
        </div>
      </div>
    </Drawer>
  );
}

function RescheduleDialog({ open, onOpenChange, current, live, today }: { open: boolean; onOpenChange: (o: boolean) => void; current: OneOnOne; live?: LiveOneOnOnes; today: Date }) {
  const [on, setOn] = useState<Date | null>(null);
  const [tried, setTried] = useState(false);
  const { toast } = useAct();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(x) => {
        onOpenChange(x);
        if (!x) {
          setOn(null);
          setTried(false);
        }
      }}
      title={`Move the 1:1 on ${formatDate(current.next)}?`}
      consequence="You both see the new date. The reminder moves with it."
      confirmLabel="Move 1:1"
      onConfirm={async () => {
        setTried(true);
        if (!on) {
          document.getElementById('oo-new-date')?.focus();
          return false;
        }
        if (!live) return;
        await live.onReschedule(dayKey(on));
        toast({ title: `1:1 moved to ${formatDate(on)}`, tone: 'success' });
      }}
    >
      <FormField label="New date" required id="oo-new-date" error={tried && !on ? 'Choose the new date.' : null}>
        <DatePicker value={on} onChange={setOn} min={today} />
      </FormField>
    </ConfirmDialog>
  );
}

/** PRF-11 1:1s (T2 list + T3 record): shared agenda, shared notes, private notes, action items linked to goals. */
export function OneOnOneScreen({ persona, device: deviceProp, items, openId, suggestedAgenda, state = 'ready', scheduleOpen, actionOpen, rescheduleOpen, live }: OneOnOneProps) {
  // The live page takes the designed phone layout under 768 px, as PRF-01, 02 and 06 do.
  const narrow = useNarrow();
  const device: Device = deviceProp ?? (live && narrow ? 'phone' : 'desktop');
  const [ownOpen, setOwnOpen] = useState<string | null>(openId ?? null);
  const open = live ? (openId ?? null) : ownOpen;
  const setOpen = (id: string | null) => (live ? live.onOpen(id) : setOwnOpen(id));
  const [scheduling, setScheduling] = useState(!!scheduleOpen);
  const [moving, setMoving] = useState(!!rescheduleOpen);
  const { busy, act } = useAct();
  const today = live?.today ?? TODAY;
  const row = items.find((i) => i.id === open) ?? null;
  const current = live ? (live.record && live.record.id === open ? live.record : null) : row;
  const heading = row ?? current;
  const agendaCount = (r: OneOnOne) => r.counts?.agenda ?? r.agenda.length;
  const openActions = (r: OneOnOne) => r.counts?.openActions ?? r.actions.filter((a) => !a.done).length;
  const cols: TableColumn<OneOnOne>[] = [
    { key: 'who', header: persona === 'mgr' ? 'Team member' : 'With', type: 'person', value: (r) => (persona === 'mgr' ? r.employee : r.manager), person: (r) => ({ name: persona === 'mgr' ? r.employee : r.manager, secondary: persona === 'mgr' ? r.role : 'Your manager' }), width: 240 },
    { key: 'cadence', header: 'Cadence', value: (r) => r.cadence, width: 130 },
    { key: 'next', header: 'Next', type: 'date', value: (r) => r.next, width: 130 },
    { key: 'last', header: 'Last held', type: 'date', value: (r) => r.last, render: (r) => (r.last ? formatDate(r.last) : 'Not yet'), width: 130 },
    { key: 'agenda', header: 'Agenda items', type: 'number', value: agendaCount, width: 120 },
    { key: 'open', header: 'Open actions', type: 'number', value: openActions, width: 120 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => (r.last && (today.getTime() - r.last.getTime()) / 86400000 > 35 ? 'Overdue' : 'On schedule'), statusTone: (v) => (v === 'Overdue' ? 'danger' : 'success'), width: 130 },
  ];
  const recordLive: RecordLive | undefined = live && { owners: live.owners, goals: live.goals, onAgenda: live.onAgenda, onSharedNotes: live.onSharedNotes, onPrivateNote: live.onPrivateNote, onAction: live.onAction, onActionDone: live.onActionDone };
  // The record remounts when the server sends a new version, so its notes start from what was saved.
  const record = (o: OneOnOne) => <OneOnOneRecord key={live ? JSON.stringify([o.id, o.shared, o.privateNote]) : o.id} o={o} persona={persona} suggested={suggestedAgenda} live={recordLive} actionOpen={actionOpen} />;
  const recordBody = current ? record(current) : live?.recordState === 'error' ? <ErrorState title="We couldn’t load this 1:1" description="Check your connection and try again." onRetry={live.onRetry} /> : <Skeleton height={320} />;
  const canSchedule = persona === 'mgr' || (live?.partners.length ?? 0) > 0;
  const scheduleButton = canSchedule ? (
    <Button variant="primary" icon={Plus} fullWidth={device === 'phone'} onClick={() => setScheduling(true)}>
      Schedule 1:1
    </Button>
  ) : undefined;
  const open1on1 = heading && heading.status !== 'held' && heading.status !== 'cancelled';
  const heldButton = heading && (
    <Button variant="primary" icon={Check} fullWidth={device === 'phone'} loading={busy === 'held'} onClick={() => (live ? void act('held', live.onHeld, heading.cadence === 'One-off' ? '1:1 marked as held' : '1:1 marked as held. The next one is planned.') : undefined)}>
      Mark as held
    </Button>
  );
  const sheets = (
    <>
      {heading && <RescheduleDialog open={moving} onOpenChange={setMoving} current={heading} live={live} today={today} />}
      <ScheduleSheet open={scheduling} onOpenChange={setScheduling} live={live} today={today} />
    </>
  );
  const empty = <EmptyState title="No 1:1s yet" description={persona === 'mgr' ? 'Set a regular 1:1 with each team member. Fortnightly works for most teams.' : 'Your manager schedules your 1:1s. You can also schedule one with them.'} />;
  if (device === 'phone')
    return (
      <GrowthFrame area="performance" active="1:1s" persona={persona} device="phone" phone={{ title: heading ? `1:1 with ${persona === 'mgr' ? heading.employee : heading.manager}` : '1:1s', back: !!heading }}>
        {heading ? (
          <>
            {live && (
              <div className="yx-growth-row">
                <Button size="sm" icon={ArrowLeft} onClick={() => setOpen(null)}>
                  All 1:1s
                </Button>
              </div>
            )}
            {recordBody}
            {open1on1 && (
              <div className="yx-growth-pinned">
                {heldButton}
                <Button fullWidth onClick={() => setMoving(true)}>
                  Reschedule
                </Button>
              </div>
            )}
          </>
        ) : state === 'loading' ? (
          <Skeleton height={240} />
        ) : state === 'error' ? (
          <ErrorState title="We couldn’t load your 1:1s" description="Check your connection and try again." onRetry={live?.onRetry} />
        ) : items.length === 0 ? (
          empty
        ) : (
          <ul className="yx-growth-list">
            {items.map((o) => (
              <li key={o.id} className="yx-growth-list__item">
                <PersonLabel name={persona === 'mgr' ? o.employee : o.manager} secondary={`Next ${formatDate(o.next)} · ${agendaCount(o)} agenda items`} />
                <Button size="sm" onClick={() => setOpen(o.id)}>
                  Open
                </Button>
              </li>
            ))}
          </ul>
        )}
        {!heading && scheduleButton && <div className="yx-growth-pinned">{scheduleButton}</div>}
        {sheets}
      </GrowthFrame>
    );
  return (
    <GrowthFrame area="performance" active="1:1s" persona={persona}>
      <PageHeader title="1:1s" description={persona === 'mgr' ? 'Regular 1:1s with each person in your team.' : 'Your 1:1s with your manager.'} actions={scheduleButton} />
      <DataTable
        label="1:1s"
        columns={cols}
        rows={items}
        getRowId={(r) => r.id}
        state={state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'ready'}
        onRetry={live?.onRetry ?? (() => {})}
        empty={empty}
        onRowClick={(r) => setOpen(r.id)}
        activeRowId={open}
      />
      {heading && (
        <Drawer
          open
          onOpenChange={(o) => !o && setOpen(null)}
          size="lg"
          title={`1:1 with ${persona === 'mgr' ? heading.employee : heading.manager}`}
          subtitle={`${heading.cadence} · ${heading.status === 'held' ? `held ${formatDate(heading.next)}` : `next ${formatDate(heading.next)}`}`}
          footer={
            open1on1 ? (
              <div className="yx-growth-foot">
                <Button onClick={() => setMoving(true)}>Reschedule</Button>
                {heldButton}
              </div>
            ) : undefined
          }
        >
          {recordBody}
        </Drawer>
      )}
      {sheets}
    </GrowthFrame>
  );
}

/* ================================================================== PRF-12 · PIP record */

export type PipRating = 'On track' | 'Some progress' | 'No progress';

export interface Pip {
  id: string;
  employee: string;
  role: string;
  manager: string;
  hr: string;
  status: 'Proposed' | 'Active' | 'Extended' | 'Closed: met' | 'Closed: not met' | 'Not approved' | 'Withdrawn';
  start: Date;
  days: number;
  reason: string;
  goals: { id: string; text: string; measure: string; status: 'Not started' | 'In progress' | 'Met' | 'Not met' }[];
  support: string[];
  checkIns: { at: Date; by: string; note: string; rating: PipRating }[];
  acknowledgement?: { at: Date; comment?: string } | null;
  approval: ApprovalStep[];
  /** Live: the plan's own check-in schedule and end (protected leave moves the end), instead of working them out. */
  schedule?: { id: string; due: Date; status: 'due' | 'held' | 'missed' | 'cancelled'; note?: string | null; employeeNote?: string | null; rating?: PipRating | null }[];
  end?: Date;
  /** Live: why it was extended, or the outcome note. */
  outcomeNote?: string | null;
  /** Protected leave inside the plan moves its end by these days; HR is warned to check with the case owner. */
  pausedDays?: number;
  warning?: boolean;
}

/** The app's plan: each action is checked again on the server (who may act, the plan's state, the version). */
export interface LivePip {
  today: Date;
  can: { decide: boolean; acknowledge: boolean; checkin: boolean; employeeNote: boolean; outcome: boolean; letter: boolean; startExit: boolean };
  /** perf.pip.extend_days: "Extend by N days". */
  extendDays: number;
  /** Where the employee asks HR a question; the exit case once one is open. */
  askHrHref: string;
  exitHref?: string | null;
  onDecide: (decision: 'approve' | 'send_back', reason: string | null) => Promise<unknown>;
  onAcknowledge: (comment: string | null) => Promise<unknown>;
  onCheckin: (input: { checkinId: string; note: string; rating: 'on_track' | 'some_progress' | 'no_progress' }) => Promise<unknown>;
  onOutcome: (input: { outcome: 'met' | 'extended' | 'not_met'; note: string; extendTo: string | null }) => Promise<unknown>;
  onLetter: () => Promise<unknown>;
  /** The employee adds their own note to a held check-in. */
  onEmployeeNote: (checkinId: string, note: string) => Promise<unknown>;
  onStartExit: (input: { lwd: string; reasonText: string }) => Promise<unknown>;
}

export interface PipRecordProps {
  persona: 'mgr' | 'hr' | 'emp';
  device?: Device;
  pip: Pip;
  tab?: 'plan' | 'checkins' | 'ack' | 'outcome';
  outcomeOpen?: boolean;
  /** Stories: open the check-in, send-back or exit-case dialog. */
  checkinOpen?: boolean;
  sendBackOpen?: boolean;
  exitOpen?: boolean;
  live?: LivePip;
}

const RATING: Record<'on_track' | 'some_progress' | 'no_progress', PipRating> = { on_track: 'On track', some_progress: 'Some progress', no_progress: 'No progress' };
const ratingTone = (r: PipRating) => (r === 'On track' ? 'success' : r === 'Some progress' ? 'warning' : 'danger');

function CheckinDialog({ open, onOpenChange, due, live }: { open: boolean; onOpenChange: (o: boolean) => void; due: { value: string; label: string }[]; live?: LivePip }) {
  const [which, setWhich] = useState<string | null>(due[0]?.value ?? null);
  const [rating, setRating] = useState<keyof typeof RATING | null>(null);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const { toast } = useAct();
  const missing = !which ? 'pip-ci-which' : !rating ? 'pip-ci-rating' : note.trim().length < 3 ? 'pip-ci-note' : null;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setTried(false);
          setNote('');
          setRating(null);
        }
      }}
      title="Record check-in"
      consequence="The employee, their manager chain and HR see the rating and your note. It can’t be changed later."
      confirmLabel="Record check-in"
      onConfirm={async () => {
        setTried(true);
        if (missing) {
          document.getElementById(missing)?.focus();
          return false;
        }
        if (!live) return;
        await live.onCheckin({ checkinId: which!, note: note.trim(), rating: rating! });
        toast({ title: 'Check-in recorded', tone: 'success' });
      }}
    >
      <FormField label="Check-in" required id="pip-ci-which" error={tried && !which ? 'No check-in is due within a week.' : null}>
        <Select value={which} onChange={setWhich} options={due} placeholder="No check-in due" />
      </FormField>
      <FormField label="Progress" required id="pip-ci-rating" error={tried && which && !rating ? 'Choose how it is going.' : null}>
        <Segment label="Progress" value={rating} onChange={setRating} options={(Object.keys(RATING) as (keyof typeof RATING)[]).map((k) => ({ value: k, label: RATING[k] }))} />
      </FormField>
      <FormField label="Note" required id="pip-ci-note" error={tried && which && rating && note.trim().length < 3 ? 'Write what you discussed.' : null}>
        <TextArea value={note} onChange={setNote} rows={3} maxLength={2000} />
      </FormField>
    </ConfirmDialog>
  );
}

function SendBackDialog({ open, onOpenChange, pip, live }: { open: boolean; onOpenChange: (o: boolean) => void; pip: Pip; live?: LivePip }) {
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const { toast } = useAct();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setTried(false);
      }}
      title={`Send back ${pip.employee}’s plan?`}
      consequence={`The plan does not start. ${pip.manager} sees your reason and may propose a new plan. ${pip.employee} is not told.`}
      confirmLabel="Send back"
      onConfirm={async () => {
        setTried(true);
        if (reason.trim().length < 3) {
          document.getElementById('pip-back-reason')?.focus();
          return false;
        }
        if (!live) return;
        await live.onDecide('send_back', reason.trim());
        toast({ title: 'Plan sent back to the manager', tone: 'success' });
      }}
    >
      <FormField label="Reason" required id="pip-back-reason" error={tried && reason.trim().length < 3 ? 'Say why you are sending it back.' : null}>
        <TextArea value={reason} onChange={setReason} rows={3} maxLength={1000} />
      </FormField>
    </ConfirmDialog>
  );
}

function ExitDialog({ open, onOpenChange, pip, live }: { open: boolean; onOpenChange: (o: boolean) => void; pip: Pip; live?: LivePip }) {
  const [lwd, setLwd] = useState<Date | null>(null);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const { toast } = useAct();
  const missing = !lwd ? 'pip-exit-lwd' : reason.trim().length < 3 ? 'pip-exit-reason' : null;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setTried(false);
      }}
      title={`Open an exit case for ${pip.employee}?`}
      consequence="It opens a company-initiated exit in People, linked to this plan. It goes through the usual exit approval; nothing else changes until then."
      confirmLabel="Open exit case"
      onConfirm={async () => {
        setTried(true);
        if (missing) {
          document.getElementById(missing)?.focus();
          return false;
        }
        if (!live) return;
        await live.onStartExit({ lwd: dayKey(lwd!), reasonText: reason.trim() });
        toast({ title: 'Exit case opened in People', tone: 'success' });
      }}
    >
      <FormField label="Proposed last working day" required id="pip-exit-lwd" error={tried && !lwd ? 'Choose the last working day.' : null}>
        <DatePicker value={lwd} onChange={setLwd} min={live?.today ?? TODAY} />
      </FormField>
      <FormField label="Reason" required id="pip-exit-reason" error={tried && lwd && reason.trim().length < 3 ? 'Write the reason for the exit.' : null}>
        <TextArea value={reason} onChange={setReason} rows={3} maxLength={1000} />
      </FormField>
    </ConfirmDialog>
  );
}

/** PRF-12 PIP record (T3): plan, fixed check-ins, employee acknowledgement, outcome; not met never auto-starts an exit (YX-PERF-11). */
export function PipRecordScreen({ persona, device: deviceProp, pip, tab = 'plan', outcomeOpen, checkinOpen, sendBackOpen, exitOpen, live }: PipRecordProps) {
  // The live page takes the designed phone layout under 768 px, as PRF-01, 02 and 06 do.
  const narrow = useNarrow();
  const device: Device = deviceProp ?? (live && narrow ? 'phone' : 'desktop');
  const today = live?.today ?? TODAY;
  const sched = pipSchedule(pip.start, (pip.days === 30 || pip.days === 60 ? pip.days : 90) as 30 | 60 | 90, 10);
  const end = pip.end ?? sched.end;
  const [ownAck, setAck] = useState(pip.acknowledgement ?? null);
  const ack = live ? (pip.acknowledgement ?? null) : ownAck;
  const [comment, setComment] = useState('');
  const [outcome, setOutcome] = useState<string>('');
  const [note, setNote] = useState('');
  const [showOutcome, setShowOutcome] = useState(!!outcomeOpen);
  const [triedOutcome, setTriedOutcome] = useState(false);
  const [recording, setRecording] = useState(!!checkinOpen);
  const [sendingBack, setSendingBack] = useState(!!sendBackOpen);
  const [exiting, setExiting] = useState(!!exitOpen);
  const [noting, setNoting] = useState<string | null>(null);
  const [myNote, setMyNote] = useState('');
  const [triedNote, setTriedNote] = useState(false);
  const { busy, act, toast } = useAct();
  const closed = pip.status.startsWith('Closed');
  const rows = pip.schedule ?? sched.checkIns.map((c, i) => ({ id: c.toISOString(), due: c, status: (pip.checkIns[i] ? 'held' : c < today ? 'missed' : 'due') as 'due' | 'held' | 'missed' | 'cancelled', note: pip.checkIns[i] ? `${pip.checkIns[i]!.by}: ${pip.checkIns[i]!.note}` : null, employeeNote: null, rating: pip.checkIns[i]?.rating ?? null }));
  const held = rows.filter((r) => r.status === 'held').length;
  const shownRows = rows.filter((r) => r.status !== 'cancelled');
  // A check-in is recorded when it is near: at most a week before it is due (the API checks the same).
  const recordable = rows.filter((r) => (r.status === 'due' || r.status === 'missed') && r.due.getTime() - today.getTime() <= 7 * 86_400_000).map((r) => ({ value: r.id, label: `${formatDate(r.due)}${r.status === 'missed' ? ' (missed)' : ''}` }));
  const extendTo = new Date(end.getFullYear(), end.getMonth(), end.getDate() + (live?.extendDays ?? 30));
  const canCheckin = live ? live.can.checkin : persona === 'mgr';
  const canOutcome = live ? live.can.outcome : persona !== 'emp' && !closed;
  const canDecide = live ? live.can.decide : persona === 'hr' && pip.status === 'Proposed';
  const canAck = live ? live.can.acknowledge : persona === 'emp';
  const facts = [
    { label: 'Plan', value: `${pip.days} days` },
    { label: 'Dates', value: `${formatDate(pip.start)} – ${formatDate(end)}${pip.pausedDays ? ` (moved ${pip.pausedDays} days for protected leave)` : ''}` },
    { label: 'Check-ins', value: `${held} of ${shownRows.length} held` },
    { label: 'Manager', value: pip.manager },
    { label: 'HR', value: pip.hr },
  ];
  const statusTone = pip.status === 'Active' ? 'warning' : pip.status === 'Proposed' ? 'info' : pip.status === 'Closed: met' ? 'success' : pip.status === 'Closed: not met' ? 'danger' : pip.status === 'Extended' ? 'warning' : 'neutral';
  const checkinButton = (variant: 'primary' | 'secondary') =>
    canCheckin && !closed ? (
      <Button variant={variant} icon={Plus} onClick={() => setRecording(true)}>
        Record check-in
      </Button>
    ) : null;

  const plan = (
    <div className="yx-growth-stack">
      <Card title="Why this plan">
        <p className="yx-growth-p">{pip.reason}</p>
      </Card>
      <Card title="Goals and how they’re measured">
        <ul className="yx-growth-list">
          {pip.goals.map((g) => (
            <li key={g.id} className="yx-growth-list__item">
              <div className="yx-growth-list__main">
                <span className="yx-growth-list__title">{g.text}</span>
                <span className="yx-growth-meta">Measure: {g.measure}</span>
              </div>
              <Badge tone={g.status === 'Met' ? 'success' : g.status === 'Not met' ? 'danger' : g.status === 'In progress' ? 'info' : 'neutral'}>{g.status}</Badge>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Support offered">
        <ul className="yx-growth-list">
          {pip.support.map((s) => (
            <li key={s} className="yx-growth-list__item">
              {s}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
  const checkins = (
    <div className="yx-growth-stack">
      {shownRows.length === 0 ? (
        <Text tone="secondary">Check-ins are set when HR approves the plan.</Text>
      ) : (
        <ul className="yx-growth-list">
          {shownRows.map((c, i) => (
            <li key={c.id} className="yx-growth-list__item">
              <div className="yx-growth-list__main">
                <span className="yx-growth-list__title">
                  Check-in {i + 1} · {formatDate(c.due)}
                  {i === shownRows.length - 1 ? ' (final)' : ''}
                </span>
                <span className="yx-growth-meta">{c.status === 'held' ? `${c.note ?? ''}${c.employeeNote ? ` · ${pip.employee}: ${c.employeeNote}` : ''}` : c.status === 'missed' ? 'Missed. Hold it this week.' : 'Scheduled. Reminder 2 days before.'}</span>
              </div>
              <Badge tone={c.status === 'held' ? (c.rating ? ratingTone(c.rating) : 'success') : c.status === 'missed' ? 'danger' : 'neutral'}>{c.status === 'held' ? (c.rating ?? 'Held') : c.status === 'missed' ? 'Missed' : 'Scheduled'}</Badge>
              {live?.can.employeeNote && c.status === 'held' && !c.employeeNote && (
                <Button size="sm" onClick={() => setNoting(c.id)}>
                  Add my note
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {checkinButton('secondary')}
    </div>
  );
  const ackPanel = (
    <div className="yx-growth-stack">
      {ack ? (
        <InlineAlert tone="success" title={`Acknowledged on ${formatDate(ack.at)}`}>
          {ack.comment ? `Comment: “${ack.comment}”` : 'No comment added.'}
        </InlineAlert>
      ) : canAck ? (
        <>
          <Text>Acknowledging means you have read the plan. It doesn’t mean you agree with it. You can add a comment that HR and your manager will see.</Text>
          <FormField label="Your comment" optional>
            <TextArea value={comment} onChange={setComment} rows={3} maxLength={2000} />
          </FormField>
          <div className="yx-growth-row">
            <Button variant="primary" loading={busy === 'ack'} onClick={() => (live ? void act('ack', () => live.onAcknowledge(comment.trim() || null), 'Plan acknowledged') : setAck({ at: today, comment: comment || undefined }))}>
              Acknowledge plan
            </Button>
            <Button asChild={!!live}>{live ? <Link href={live.askHrHref}>Ask HR a question</Link> : 'Ask HR a question'}</Button>
          </div>
        </>
      ) : pip.status === 'Proposed' || pip.status === 'Not approved' || pip.status === 'Withdrawn' ? (
        <Text tone="secondary">{pip.employee} is asked to acknowledge the plan once HR approves it.</Text>
      ) : (
        <InlineAlert tone="warning" title="Not acknowledged yet">
          {pip.employee} was asked on {formatDate(pip.start)}. A reminder goes out every 2 days.
        </InlineAlert>
      )}
    </div>
  );
  const outcomePanel = (
    <div className="yx-growth-stack">
      {closed ? (
        <InlineAlert tone={pip.status === 'Closed: met' ? 'success' : 'danger'} title={`Outcome: ${pip.status.replace('Closed: ', '')}`}>
          {pip.outcomeNote ? `${pip.outcomeNote} ` : `Recorded by ${pip.hr}. `}
          {pip.status === 'Closed: not met' ? 'HR decides the next step. Nothing starts automatically.' : ''}
        </InlineAlert>
      ) : (
        <Text tone="secondary">The outcome is recorded after the final check-in on {formatDate(end)}.</Text>
      )}
      {canOutcome && !closed && (
        <div className="yx-growth-row">
          <Button
            onClick={() => {
              setTriedOutcome(false);
              setShowOutcome(true);
            }}
          >
            Record outcome
          </Button>
        </div>
      )}
      {pip.status === 'Closed: not met' && persona === 'hr' && (
        <Card title="Next step (HR decides)">
          <Text>Options: change role, or open an exit case in People. Any exit case is started by a person, never by this outcome.</Text>
          <div className="yx-growth-row">
            {!live && <Button>Extend plan</Button>}
            {live?.exitHref ? (
              <Button asChild>
                <Link href={live.exitHref}>Open the exit case</Link>
              </Button>
            ) : (
              (!live || live.can.startExit) && <Button onClick={() => setExiting(true)}>Open exit case in People</Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );

  const body = (
    <Tabs defaultValue={tab}>
      <TabsList aria-label="PIP">
        <TabsTrigger value="plan">Plan</TabsTrigger>
        <TabsTrigger value="checkins" count={held}>
          Check-ins
        </TabsTrigger>
        <TabsTrigger value="ack">Acknowledgement</TabsTrigger>
        <TabsTrigger value="outcome">Outcome</TabsTrigger>
      </TabsList>
      <TabsContent value="plan">{plan}</TabsContent>
      <TabsContent value="checkins">{checkins}</TabsContent>
      <TabsContent value="ack">{ackPanel}</TabsContent>
      <TabsContent value="outcome">{outcomePanel}</TabsContent>
    </Tabs>
  );
  const outcomeDialog = (
    <ConfirmDialog
      open={showOutcome}
      onOpenChange={setShowOutcome}
      title={`Record the outcome of ${pip.employee}’s PIP?`}
      consequence="The outcome is final and visible to the employee, their manager chain and HR. A “not met” outcome does not start any exit step by itself."
      confirmLabel="Record outcome"
      onConfirm={async () => {
        setTriedOutcome(true);
        if (!outcome) return false;
        if (live && note.trim().length < 3) {
          document.getElementById('pip-outcome-note')?.focus();
          return false;
        }
        if (live) {
          await live.onOutcome({ outcome: outcome === 'met' ? 'met' : outcome === 'extended' ? 'extended' : 'not_met', note: note.trim(), extendTo: outcome === 'extended' ? dayKey(extendTo) : null });
          toast({ title: outcome === 'extended' ? `Plan extended to ${formatDate(extendTo)}` : 'Outcome recorded', tone: 'success' });
          return;
        }
        setShowOutcome(false);
      }}
    >
      <FormField label="Outcome" hideLabel required error={triedOutcome && !outcome ? 'Choose an outcome.' : null}>
        <RadioGroup
          aria-label="Outcome"
          value={outcome}
          onChange={setOutcome}
          options={[
            { value: 'met', label: 'Met', description: 'All goals met. The plan closes.' },
            { value: 'extended', label: `Extend by ${live?.extendDays ?? 30} days`, description: `Some progress; it now ends ${formatDate(extendTo)} and check-ins are added. A plan is extended once.` },
            { value: 'not-met', label: 'Not met', description: 'HR decides the next step with the manager.' },
          ]}
        />
      </FormField>
      <FormField label="Note" required={!!live} optional={!live} id="pip-outcome-note" error={live && triedOutcome && outcome && note.trim().length < 3 ? 'Write a short note for the record.' : null}>
        <TextArea value={note} onChange={setNote} rows={2} maxLength={1000} />
      </FormField>
    </ConfirmDialog>
  );
  const dialogs = (
    <>
      {outcomeDialog}
      <CheckinDialog open={recording} onOpenChange={setRecording} due={live ? recordable : [{ value: 'c4', label: formatDate(sched.checkIns[3] ?? end) }]} live={live} />
      <SendBackDialog open={sendingBack} onOpenChange={setSendingBack} pip={pip} live={live} />
      <ExitDialog open={exiting} onOpenChange={setExiting} pip={pip} live={live} />
      <ConfirmDialog
        open={noting != null}
        onOpenChange={(o) => {
          if (o) return;
          setNoting(null);
          setMyNote('');
          setTriedNote(false);
        }}
        title="Add your note to this check-in?"
        consequence="Your manager and HR see it next to the manager’s note."
        confirmLabel="Add note"
        onConfirm={async () => {
          setTriedNote(true);
          if (myNote.trim().length < 3) {
            document.getElementById('pip-my-note')?.focus();
            return false;
          }
          if (!live || !noting) return;
          await live.onEmployeeNote(noting, myNote.trim());
          toast({ title: 'Your note was added', tone: 'success' });
        }}
      >
        <FormField label="Your note" required id="pip-my-note" error={triedNote && myNote.trim().length < 3 ? 'Write your note first.' : null}>
          <TextArea value={myNote} onChange={setMyNote} rows={3} maxLength={2000} />
        </FormField>
      </ConfirmDialog>
    </>
  );

  const headerActions = canDecide ? (
    <>
      <Button fullWidth={device === 'phone'} onClick={() => setSendingBack(true)}>
        Send back
      </Button>
      <Button variant="approve" fullWidth={device === 'phone'} loading={busy === 'approve'} onClick={() => live && void act('approve', () => live.onDecide('approve', null), 'Plan approved. It starts now.')}>
        Approve and start
      </Button>
    </>
  ) : persona === 'mgr' && (pip.status === 'Active' || pip.status === 'Extended') ? (
    <>
      {!live && <Button>Download PIP letter</Button>}
      {checkinButton('primary')}
    </>
  ) : live?.can.letter ? (
    <Button fullWidth={device === 'phone'} loading={busy === 'letter'} onClick={() => void act('letter', live.onLetter, 'PIP letter issued')}>
      Issue PIP letter
    </Button>
  ) : undefined;
  const alerts = (
    <>
      {pip.warning && (
        <InlineAlert tone="warning" title="Check with the case owner before you decide">
          There is something open that concerns this plan. Ask the case owner before you approve it or record an outcome.
        </InlineAlert>
      )}
      {pip.status === 'Proposed' && (
        <InlineAlert tone="info" title={canDecide ? 'Waiting for your approval' : 'Waiting for HR approval'}>
          The plan starts only after HR approves it. {pip.employee} is not told until then.
        </InlineAlert>
      )}
    </>
  );

  if (device === 'phone')
    return (
      <GrowthFrame area="performance" active="PIPs" persona={persona} device="phone" phone={{ title: 'Performance plan', back: true }}>
        {persona !== 'emp' && <PersonLabel name={pip.employee} secondary={pip.role} />}
        <div className="yx-growth-row">
          <Badge tone={statusTone}>{pip.status}</Badge>
          <ConfidentialTag />
        </div>
        <DescriptionList items={facts} />
        {alerts}
        {!ack && persona === 'emp' ? ackPanel : body}
        {persona !== 'emp' && (
          <Card title="Approval">
            <ApprovalTimeline steps={pip.approval} now={today} />
          </Card>
        )}
        {headerActions && <div className="yx-growth-pinned">{headerActions}</div>}
        {dialogs}
      </GrowthFrame>
    );

  return (
    <GrowthFrame area="performance" active="PIPs" persona={persona}>
      <ObjectHeader
        name={pip.employee}
        person
        photoUrl={null}
        secondary={[pip.role, 'Performance improvement plan'].filter(Boolean).join(' · ')}
        status={
          <>
            <Badge tone={statusTone}>{pip.status}</Badge> <ConfidentialTag />
          </>
        }
        facts={facts}
        actions={headerActions}
      />
      {alerts}
      <SplitLayout
        main={body}
        side={
          <Card title="Approval">
            <ApprovalTimeline steps={pip.approval} now={today} />
          </Card>
        }
      />
      {dialogs}
    </GrowthFrame>
  );
}

/* ================================================================== PRF-13 · Hand-over list */

export interface HandoverRow {
  id: string;
  employee: string;
  artefact: 'Manager review stage' | '360° nominations' | 'Calibration session' | 'Comp proposal' | 'PIP' | '1:1 thread' | 'Goal parent';
  detail: string;
  from: string;
  to: string;
  effective: Date;
  status: 'Moved' | 'Needs decision' | 'Decided';
  note?: string;
}

/** A goal's alignment after a manager change: to one of the new manager's goals, or none (PRF-13). */
export interface HandoverDecision {
  decision: 'realigned' | 'unaligned';
  parentGoalId?: string;
  note?: string;
}

/** PRF-13 live: the new manager's or HR's hand-overs (performance builder 3). */
export interface LiveHandover {
  state: 'loading' | 'error' | 'ready';
  onRetry: () => void;
  rows: HandoverRow[];
  /** The new manager's open goals in the moved goal's period. */
  parentOptions: (id: string) => Promise<{ value: string; label: string }[]>;
  onDecide: (id: string, input: HandoverDecision) => Promise<void>;
}

const HANDOVER_FIELDS: FilterFieldDef[] = [
  { key: 'status', label: 'Status', type: 'multi', options: ['Moved', 'Needs decision', 'Decided'].map((v) => ({ value: v, label: v })) },
  { key: 'artefact', label: 'Artefact', type: 'multi', options: ['Manager review stage', '360° nominations', 'Calibration session', 'Comp proposal', 'PIP', '1:1 thread', 'Goal parent'].map((v) => ({ value: v, label: v })) },
];
const NEEDS_DECISION: FilterValue[] = [{ key: 'status', type: 'multi', values: ['Needs decision'] }];
const SAMPLE_GOALS = [
  { value: 'g1', label: 'Zero line stops on Line 3' },
  { value: 'g2', label: 'Cut seal-strength rejects to 2%' },
];

/** PRF-13 re-parent a moved goal: align it to one of the new manager's goals, or leave it unaligned. */
function ReparentDialog({ row, open, onOpenChange, options, onSave }: { row: HandoverRow; open: boolean; onOpenChange: (o: boolean) => void; options: { value: string; label: string }[] | null; onSave: (input: HandoverDecision) => Promise<void> }) {
  const [decision, setDecision] = useState<HandoverDecision['decision']>('realigned');
  const [goal, setGoal] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const { run, busy, error } = useRun();
  const goalError = tried && decision === 'realigned' && !goal ? 'Choose the goal to align it to, or leave it unaligned.' : null;
  const save = () => {
    setTried(true);
    if (decision === 'realigned' && !goal) return void document.getElementById('handover-goal')?.focus();
    void run('save', () => onSave({ decision, ...(decision === 'realigned' ? { parentGoalId: goal! } : {}), ...(note.trim() ? { note: note.trim() } : {}) }));
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      preventClose={busy === 'save'}
      title={`Re-parent goal for ${row.employee}`}
      description={row.detail}
      notice={error ? <InlineAlert tone="danger">{error}</InlineAlert> : undefined}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={busy === 'save'} onClick={save}>
            Save decision
          </Button>
        </>
      }
    >
      <div className="yx-growth-stack">
        <Segment label="Decision" value={decision} onChange={setDecision} options={[{ value: 'realigned', label: 'Align to a goal' }, { value: 'unaligned', label: 'Leave unaligned' }]} />
        {decision === 'realigned' && (
          <FormField label={`${row.to}’s goal`} required id="handover-goal" error={goalError} helper={options && options.length === 0 ? `${row.to} has no open goals in this period. Leave it unaligned, or align it later from Goals.` : undefined}>
            <Select value={goal} onChange={setGoal} options={options ?? []} placeholder={options ? 'Choose a goal' : 'Loading goals…'} />
          </FormField>
        )}
        <FormField label="Note" optional>
          <TextArea value={note} onChange={setNote} rows={2} maxLength={500} />
        </FormField>
      </div>
    </Dialog>
  );
}

/** PRF-13 Hand-over list (T2) after a manager change (YX-PERF-13): what moved and what needs a decision. */
export function HandoverListScreen({ persona, rows: initial, state = 'ready', leaver, decideId, live }: { persona: 'mgr' | 'hr'; rows: HandoverRow[]; state?: LoadState; leaver?: string; /** Story: the re-parent dialog open on this row. */ decideId?: string; /** The live app's /yx/performance/handovers. */ live?: LiveHandover }) {
  const { toast } = useToast();
  const [sample, setSample] = useState(initial);
  const rows = live ? live.rows : sample;
  const [filters, setFilters] = useState<FilterValue[]>(persona === 'hr' ? NEEDS_DECISION : []);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [deciding, setDeciding] = useState<string | null>(decideId ?? null);
  const [options, setOptions] = useState<{ value: string; label: string }[] | null>(live ? null : SAMPLE_GOALS);
  const shown = useMemo(
    () => rows.filter((r) => (!q || r.employee.toLowerCase().includes(q.toLowerCase())) && filters.every((f) => matchesFilter((r as unknown as Record<string, unknown>)[f.key], f))),
    [rows, filters, q],
  );
  const cols: TableColumn<HandoverRow>[] = [
    { key: 'employee', header: 'Employee', type: 'person', value: (r) => r.employee, person: (r) => ({ name: r.employee }), width: 200 },
    { key: 'artefact', header: 'Artefact', value: (r) => r.artefact, groupable: true, width: 180 },
    { key: 'detail', header: 'Detail', value: (r) => r.detail, width: 260 },
    { key: 'from', header: 'From', value: (r) => r.from, width: 170 },
    { key: 'to', header: 'To', value: (r) => r.to, width: 170 },
    { key: 'effective', header: 'Effective', type: 'date', value: (r) => r.effective, width: 120 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Needs decision' ? 'warning' : v === 'Decided' ? 'success' : 'neutral'), width: 150 },
  ];
  const decided = (id: string) => setSample((xs) => xs.map((x) => (x.id === id ? { ...x, status: 'Decided' } : x)));
  const open = (r: HandoverRow) => {
    if (r.artefact !== 'Goal parent') return decided(r.id);
    setDeciding(r.id);
    if (live) {
      setOptions(null);
      void live.parentOptions(r.id).then(setOptions, () => setOptions([]));
    }
  };
  const row = rows.find((r) => r.id === deciding);
  const needs = rows.filter((r) => r.status === 'Needs decision').length;
  const tableState = live ? live.state : state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'ready';
  return (
    <GrowthFrame area="performance" active="Reviews & cycles" persona={persona}>
      <PageHeader
        title={persona === 'mgr' ? 'Handed over to you' : 'Hand-over list'}
        description={
          persona === 'mgr'
            ? `Artefacts that moved to you${leaver ? ` from ${leaver}` : ' when a manager changed'}. You can read these people’s current cycle; private 1:1 notes stayed with their author.`
            : leaver
              ? `Everything that moved when ${leaver} left, and what still needs a decision.`
              : 'Everything that moved when a manager left or changed, and what still needs a decision.'
        }
        facts={`${needs} need a decision · ${rows.length} artefacts`}
      />
      <InlineAlert tone="info" title="Private notes don’t move">
        Shared 1:1 notes and open action items moved. Each person’s private notes stay with them (YX-PERF-13).
      </InlineAlert>
      <DataTable
        label="Hand-over list"
        columns={cols}
        rows={shown}
        getRowId={(r) => r.id}
        state={tableState}
        onRetry={live?.onRetry ?? (() => {})}
        filtered={filters.length > 0 || q !== ''}
        onClearFilters={() => {
          setFilters([]);
          setQ('');
        }}
        empty={<EmptyState title="Nothing to hand over" description="When a manager leaves or changes, their in-flight reviews, PIPs and 1:1s are listed here." />}
        toolbar={<FilterBar fields={HANDOVER_FIELDS} value={filters} onChange={setFilters} search={q} onSearchChange={setQ} searchPlaceholder="Search employee" />}
        views={<SavedViewMenu views={[{ id: 'all', name: 'All artefacts' }, { id: 'decide', name: 'Needs decision', shared: true }]} currentId={filters === NEEDS_DECISION ? 'decide' : 'all'} onSelect={(id) => setFilters(id === 'decide' ? NEEDS_DECISION : [])} />}
        // Reassigning to HR and the audit entry link are not built yet (performance-design-map.md, section 3).
        selectable={persona === 'hr' && !live}
        selectedIds={selected}
        onSelectedChange={setSelected}
        bulkActions={live ? undefined : () => <Button size="sm">Reassign to HR</Button>}
        rowButtons={(r) =>
          r.status === 'Needs decision' ? (
            <Button size="sm" onClick={() => open(r)}>
              {r.artefact === 'Goal parent' ? 'Re-parent goal' : r.artefact === 'Calibration session' ? 'Reassign facilitator' : 'Decide'}
            </Button>
          ) : null
        }
        rowActions={live ? undefined : () => <MenuItem>View audit entry</MenuItem>}
      />
      {row && (
        <ReparentDialog
          key={row.id}
          row={row}
          open
          onOpenChange={(o) => !o && setDeciding(null)}
          options={options}
          onSave={async (input) => {
            if (live) await live.onDecide(row.id, input);
            else decided(row.id);
            setDeciding(null);
            toast({ tone: 'success', title: input.decision === 'realigned' ? 'Goal re-aligned' : 'Goal left unaligned' });
          }}
        />
      )}
    </GrowthFrame>
  );
}

/* ================================================================== PRF-14 · Competency framework */

export interface Competency {
  id: string;
  name: string;
  group: 'Core' | 'Functional' | 'Leadership';
  description: string;
  starter: boolean;
  status: 'Active' | 'Retired';
  /** What each level looks like, level 1 first. */
  levels: string[];
  roles: { role: string; level: number; designationId?: string }[];
  usedIn: string[];
  skillsTest?: string;
  /** Live: the optimistic version the next save sends. */
  version?: number;
}

/** PRF-14 save: the competency as the API takes it (levels in order, the level each designation needs from today). */
export interface CompetencySave {
  name: string;
  group: Competency['group'];
  description: string;
  levels: string[];
  roles: { designationId: string; level: number }[];
  version?: number;
}

/** PRF-14 live: Performance › Skills & competencies (performance builder 3). */
export interface LiveCompetencies {
  state: 'loading' | 'error' | 'ready';
  onRetry: () => void;
  items: Competency[];
  designations: { value: string; label: string }[];
  onSave: (id: string | null, input: CompetencySave) => Promise<Competency>;
  onRetire: (id: string) => Promise<void>;
  onMerge: (id: string, intoId: string) => Promise<void>;
  onLoadStarters: () => Promise<void>;
}

const GROUPS: Competency['group'][] = ['Core', 'Functional', 'Leadership'];
const SAMPLE_DESIGNATIONS = ['QA Engineer', 'Senior QA Engineer', 'Line Supervisor', 'Plant Manager'].map((d) => ({ value: d, label: d }));

/** PRF-14 add a competency: name, group, what it means and its levels (one per line). */
function AddCompetencyDrawer({ open, onOpenChange, onAdd }: { open: boolean; onOpenChange: (o: boolean) => void; onAdd: (input: CompetencySave) => Promise<void> }) {
  const [name, setName] = useState('');
  const [group, setGroup] = useState<Competency['group']>('Core');
  const [description, setDescription] = useState('');
  const [levels, setLevels] = useState('Learning: does it with help\nPractising: does it alone in usual cases\nSkilled: handles hard cases and helps others\nExpert: sets the standard for the company');
  const [tried, setTried] = useState(false);
  const { run, busy, error } = useRun();
  const lines = levels.split('\n').map((l) => l.trim()).filter(Boolean);
  const nameError = tried && name.trim().length < 2 ? 'Give the competency a name of at least 2 characters.' : null;
  const levelError = tried && (lines.length < 2 || lines.length > 10) ? 'Write 2 to 10 levels, one per line, the lowest first.' : null;
  const add = () => {
    setTried(true);
    if (name.trim().length < 2) return void document.getElementById('competency-name')?.focus();
    if (lines.length < 2 || lines.length > 10) return void document.getElementById('competency-levels')?.focus();
    void run('add', () => onAdd({ name: name.trim(), group, description: description.trim(), levels: lines, roles: [] }));
  };
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title="Add competency"
      subtitle="Map it to job titles after it is added."
      notice={error ? <InlineAlert tone="danger">{error}</InlineAlert> : undefined}
      footer={
        <div className="yx-growth-foot">
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" icon={Plus} loading={busy === 'add'} onClick={add}>
            Add competency
          </Button>
        </div>
      }
    >
      <div className="yx-growth-stack">
        <FormField label="Name" required id="competency-name" error={nameError}>
          <TextField value={name} onChange={setName} maxLength={120} />
        </FormField>
        <Segment label="Group" value={group} onChange={setGroup} options={GROUPS.map((g) => ({ value: g, label: g }))} />
        <FormField label="Description" optional>
          <TextArea value={description} onChange={setDescription} rows={2} maxLength={500} />
        </FormField>
        <FormField label="Levels" required id="competency-levels" error={levelError} helper="One per line, the lowest first: what someone at that level does.">
          <TextArea value={levels} onChange={setLevels} rows={5} />
        </FormField>
      </div>
    </Drawer>
  );
}

/** PRF-14 map a job title to the level it needs. */
function MapRoleDialog({ c, open, onOpenChange, designations, onMap }: { c: Competency; open: boolean; onOpenChange: (o: boolean) => void; designations: { value: string; label: string }[]; onMap: (designationId: string, level: number) => Promise<void> }) {
  const [designation, setDesignation] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const { run, busy, error } = useRun();
  const taken = new Set(c.roles.map((r) => r.designationId ?? r.role));
  const map = () => {
    setTried(true);
    if (!designation) return void document.getElementById('map-designation')?.focus();
    if (!level) return void document.getElementById('map-level')?.focus();
    void run('map', () => onMap(designation, Number(level)));
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={`Map a role to ${c.name}`}
      description="The job title needs this level from today. Past reviews keep the level they had."
      notice={error ? <InlineAlert tone="danger">{error}</InlineAlert> : undefined}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={busy === 'map'} onClick={map}>
            Map role
          </Button>
        </>
      }
    >
      <div className="yx-growth-stack">
        <FormField label="Designation" required id="map-designation" error={tried && !designation ? 'Choose the job title.' : null} helper={designations.length === 0 ? 'No job titles yet. Add them in Settings › Organisation structure.' : undefined}>
          <Select value={designation} onChange={setDesignation} options={designations.filter((d) => !taken.has(d.value))} searchable placeholder="Choose a job title" />
        </FormField>
        <FormField label="Required level" required id="map-level" error={tried && designation && !level ? 'Choose the level this job title needs.' : null}>
          <Select value={level} onChange={setLevel} options={c.levels.map((l, i) => ({ value: String(i + 1), label: `Level ${i + 1} · ${l}` }))} placeholder="Choose a level" />
        </FormField>
      </div>
    </Dialog>
  );
}

/** PRF-14 merge a competency into another; the merged one is retired and its job titles move over. */
function MergeDialog({ c, open, onOpenChange, others, onMerge }: { c: Competency; open: boolean; onOpenChange: (o: boolean) => void; others: Competency[]; onMerge: (intoId: string) => Promise<void> }) {
  const [into, setInto] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const { run, busy, error } = useRun();
  const merge = () => {
    setTried(true);
    if (!into) return void document.getElementById('merge-into')?.focus();
    void run('merge', () => onMerge(into));
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={`Merge ${c.name} into…`}
      description={`${c.name} is retired and stays on past reviews. Job titles mapped to it and not to the kept one move over at the same level.`}
      notice={error ? <InlineAlert tone="danger">{error}</InlineAlert> : undefined}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" icon={GitMerge} loading={busy === 'merge'} onClick={merge}>
            Merge competency
          </Button>
        </>
      }
    >
      <FormField label="Keep" required id="merge-into" error={tried && !into ? 'Choose the competency to keep.' : null}>
        <Select value={into} onChange={setInto} options={others.map((o) => ({ value: o.id, label: `${o.name} (${o.group})` }))} searchable placeholder="Choose a competency" />
      </FormField>
    </Dialog>
  );
}

/** PRF-14 Competency framework (T3, HR): library by group, levels with behaviours, role mapping, skills test; in-use can only be retired or merged. */
export function CompetencyFrameworkScreen({ items: sampleItems, openId, state = 'ready', retireOpen, addOpen, mapOpen, mergeOpen, live }: { items: Competency[]; openId?: string; state?: LoadState; retireOpen?: boolean; /** Story: the add drawer open. */ addOpen?: boolean; /** Story: the map-a-role dialog open. */ mapOpen?: boolean; /** Story: the merge dialog open. */ mergeOpen?: boolean; /** The live app's /yx/performance/competencies. */ live?: LiveCompetencies }) {
  const { toast } = useToast();
  const [local, setLocal] = useState(sampleItems);
  const items = live ? live.items : local;
  const [sel, setSel] = useState(openId ?? sampleItems[0]?.id);
  const [retire, setRetire] = useState(!!retireOpen);
  const [adding, setAdding] = useState(!!addOpen);
  const [mapping, setMapping] = useState(!!mapOpen);
  const [merging, setMerging] = useState(!!mergeOpen);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const { run, busy, error } = useRun();
  const c = items.find((i) => i.id === sel) ?? items[0];
  const designations = live ? live.designations : SAMPLE_DESIGNATIONS;
  const description = c ? (draft[c.id] ?? c.description) : '';
  const saveOf = (x: Competency, patch: Partial<CompetencySave> = {}): CompetencySave => ({
    name: x.name,
    group: x.group,
    description: x.description,
    levels: x.levels,
    roles: x.roles.map((r) => ({ designationId: r.designationId ?? r.role, level: r.level })),
    version: x.version,
    ...patch,
  });
  /** Live: the API saves; story: the sample list changes in place. */
  const save = async (id: string | null, input: CompetencySave) => {
    if (live) return live.onSave(id, input);
    const next: Competency = { id: id ?? `k${local.length + 1}`, starter: false, status: 'Active', usedIn: [], ...input, roles: input.roles.map((r) => ({ role: r.designationId, designationId: r.designationId, level: r.level })) };
    setLocal((xs) => (id ? xs.map((x) => (x.id === id ? { ...x, ...next } : x)) : [...xs, next]));
    return next;
  };
  const loading = live ? live.state === 'loading' : state === 'loading';
  return (
    <GrowthFrame area="performance" active="Skills & competencies" persona="hr">
      <PageHeader
        title="Competency framework"
        description="One skills library for the company. Competencies here are also used as test question tags and hiring scorecard skills."
        actions={
          <>
            {/* Import from a file is not built yet in the live app (performance-design-map.md, section 3). */}
            {!live && <Button>Import</Button>}
            <Button icon={Plus} onClick={() => setAdding(true)}>
              Add competency
            </Button>
          </>
        }
      />
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {items.some((i) => i.starter) && (
        <InlineAlert tone="info" title="Starter library">
          Items marked “Starter” come from the YukthiX starter template. Edit them to match how your company works.
        </InlineAlert>
      )}
      {live?.state === 'error' ? (
        <EmptyState title="The competencies did not load" description="Check your connection and try again." action={<Button onClick={live.onRetry}>Try again</Button>} />
      ) : loading ? (
        <Skeleton height={400} />
      ) : items.length === 0 ? (
        <EmptyState
          title="No competencies yet"
          description="Start from the starter library (core, functional, leadership) or add your own."
          action={
            <Button variant="primary" loading={busy === 'starters'} onClick={() => void (live ? run('starters', live.onLoadStarters).then((ok) => ok && toast({ tone: 'success', title: 'Starter library loaded' })) : undefined)}>
              Load starter library
            </Button>
          }
        />
      ) : (
        <div className="yx-growth-player">
          <nav aria-label="Competencies">
            {GROUPS.map((g) => (
              <div key={g} className="yx-growth-stack" data-gap="sm">
                <h2 className="yx-growth-h">{g}</h2>
                <ul className="yx-growth-player__outline">
                  {items
                    .filter((i) => i.group === g)
                    .map((i) => (
                      <li key={i.id} className="yx-growth-player__item" aria-current={i.id === c?.id ? 'true' : undefined}>
                        <Link
                          href={`#${i.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            setSel(i.id);
                          }}
                        >
                          {i.name}
                        </Link>
                        {i.status === 'Retired' && <Badge>Retired</Badge>}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </nav>
          {c && (
            <div className="yx-growth-stack">
              <div className="yx-growth-row" data-between="">
                <div className="yx-growth-row">
                  <h2 className="yx-growth-h">{c.name}</h2>
                  <Badge>{c.group}</Badge>
                  {c.starter && <Badge tone="info">Starter</Badge>}
                  <Badge tone={c.status === 'Active' ? 'success' : 'neutral'}>{c.status}</Badge>
                </div>
                {c.status === 'Active' && (
                  <div className="yx-growth-row">
                    <Button icon={GitMerge} onClick={() => setMerging(true)}>
                      Merge into…
                    </Button>
                    <Button icon={Archive} onClick={() => setRetire(true)}>
                      Retire
                    </Button>
                    <Button
                      variant="primary"
                      loading={busy === 'save'}
                      onClick={() =>
                        void run('save', () => save(c.id, saveOf(c, { description: description.trim() }))).then((ok) => {
                          if (!ok) return;
                          setDraft(({ [c.id]: _, ...rest }) => rest);
                          toast({ tone: 'success', title: `${c.name} saved` });
                        })
                      }
                    >
                      Save changes
                    </Button>
                  </div>
                )}
              </div>
              <FormField label="Description">
                <TextArea value={description} onChange={(v) => setDraft((d) => ({ ...d, [c.id]: v }))} rows={2} maxLength={500} readOnly={c.status !== 'Active'} />
              </FormField>
              <Card title="Proficiency levels">
                <ol className="yx-growth-list">
                  {c.levels.map((l, i) => (
                    <li key={i} className="yx-growth-list__item">
                      <SkillLevel level={i + 1} label={`Level ${i + 1}`} />
                      <span className="yx-growth-grow">{l}</span>
                    </li>
                  ))}
                </ol>
              </Card>
              <Card
                title="Required level by role"
                actions={
                  c.status === 'Active' ? (
                    <Button size="sm" icon={Plus} onClick={() => setMapping(true)}>
                      Map a role
                    </Button>
                  ) : undefined
                }
              >
                {c.roles.length === 0 ? (
                  <Text tone="secondary">No job title needs this competency yet. Map a role to set the level it needs.</Text>
                ) : (
                  <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
                    <table className="yx-growth-matrix">
                      <thead>
                        <tr>
                          <th scope="col">Designation</th>
                          <th scope="col">Required level</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.roles.map((r) => (
                          <tr key={r.designationId ?? r.role}>
                            <th scope="row">{r.role}</th>
                            <td>
                              <SkillLevel level={r.level} label={r.role} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
              <DescriptionList
                columns={2}
                items={[
                  { label: 'Rated in', value: c.usedIn.join(', ') || 'Not used yet' },
                  { label: 'Skills test', value: c.skillsTest ? <Link href="#test">{c.skillsTest}</Link> : 'None. Add one from the question bank.' },
                  { label: 'Gaps feed', value: 'Training needs in Learning' },
                  { label: 'Also used as', value: 'Question tag · hiring scorecard skill' },
                ]}
              />
            </div>
          )}
        </div>
      )}
      {c && (
        <ConfirmDialog
          open={retire}
          onOpenChange={setRetire}
          title={`Retire ${c.name}?`}
          consequence={`It is used in ${c.usedIn.length} review templates and ${c.roles.length} role mappings, so it can’t be deleted. Retired competencies stay on past reviews and aren’t offered for new ones.`}
          confirmLabel="Retire competency"
          onConfirm={() => {
            setRetire(false);
            const done = () => toast({ tone: 'success', title: `${c.name} retired` });
            if (live) void run('retire', () => live.onRetire(c.id)).then((ok) => ok && done());
            else {
              setLocal((xs) => xs.map((x) => (x.id === c.id ? { ...x, status: 'Retired' } : x)));
              done();
            }
          }}
        />
      )}
      {c && mapping && (
        <MapRoleDialog
          c={c}
          open
          onOpenChange={setMapping}
          designations={designations}
          onMap={async (designationId, level) => {
            await save(c.id, saveOf(c, { roles: [...c.roles.map((r) => ({ designationId: r.designationId ?? r.role, level: r.level })), { designationId, level }] }));
            setMapping(false);
            toast({ tone: 'success', title: `Role mapped to ${c.name}` });
          }}
        />
      )}
      {c && merging && (
        <MergeDialog
          c={c}
          open
          onOpenChange={setMerging}
          others={items.filter((x) => x.id !== c.id && x.status === 'Active')}
          onMerge={async (intoId) => {
            if (live) await live.onMerge(c.id, intoId);
            else setLocal((xs) => xs.map((x) => (x.id === c.id ? { ...x, status: 'Retired' } : x)));
            setMerging(false);
            setSel(intoId);
            toast({ tone: 'success', title: `${c.name} merged` });
          }}
        />
      )}
      {adding && (
        <AddCompetencyDrawer
          open
          onOpenChange={setAdding}
          onAdd={async (input) => {
            const made = await save(null, input);
            setAdding(false);
            setSel(made.id);
            toast({ tone: 'success', title: `${made.name} added` });
          }}
        />
      )}
    </GrowthFrame>
  );
}
