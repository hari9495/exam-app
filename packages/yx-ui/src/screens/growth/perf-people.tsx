// Performance, people side: quick feedback (PRF-08), 1:1s with suggested agenda (PRF-11, PRF-16), PIP record (PRF-12),
// hand-over list after a manager change (PRF-13), competency framework (PRF-14).
import { useMemo, useState } from 'react';
import { Archive, Check, GitMerge, Lock, MessageSquarePlus, Plus, Send } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { AiBadge, Badge, PersonLabel } from '../../components/display';
import { Icon, Text } from '../../components/foundations';
import { EmptyState, InlineAlert, Skeleton } from '../../components/feedback';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, SavedViewMenu, type FilterFieldDef } from '../../components/filters';
import { Drawer } from '../../components/drawer';
import { BottomSheet, ConfirmDialog } from '../../components/overlay';
import { FormField } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup } from '../../components/choice';
import { PersonPicker, Select, type PersonOption } from '../../components/select';
import { MenuItem } from '../../components/menu';
import { ApprovalTimeline, type ApprovalStep } from '../../components/timeline';
import { formatDate } from '../../lib/format';
import { matchesFilter, type FilterValue } from '../../lib/table';
import { TODAY } from '../_kit/data';
import { ConfidentialTag, GrowthFrame, SkillLevel, SplitLayout, type Device } from './growth-kit';
import { pipSchedule } from './growth-logic';
import type { LoadState } from './perf-goals';
import './growth.css';

/* ================================================================== PRF-08 · Quick feedback */

export interface FeedbackItem {
  id: string;
  from: string;
  to: string;
  kind: 'Praise' | 'Suggestion';
  text: string;
  at: Date;
  goal?: string;
  visibility: 'Only them' | 'Them and their manager' | 'Them, their manager and HR';
}

export interface QuickFeedbackProps {
  device?: Device;
  me: string;
  people: PersonOption[];
  goals: { value: string; label: string }[];
  received: FeedbackItem[];
  given: FeedbackItem[];
  requests?: { id: string; from: string; about: string; at: Date }[];
  defaultTab?: 'received' | 'given' | 'requests';
  composerOpen?: boolean;
  sent?: boolean;
  state?: LoadState;
}

function FeedbackList({ items, dir }: { items: FeedbackItem[]; dir: 'from' | 'to' }) {
  if (items.length === 0) return <EmptyState compact title={dir === 'from' ? 'No feedback received yet' : 'You haven’t given feedback yet'} description="Feedback works best when it’s specific and soon after the moment." />;
  return (
    <ul className="yx-growth-list">
      {items.map((f) => (
        <li key={f.id} className="yx-growth-list__item" data-top="">
          <PersonLabel name={dir === 'from' ? f.from : f.to} secondary={formatDate(f.at)} size={32} />
          <div className="yx-growth-list__main">
            <p className="yx-growth-p">{f.text}</p>
            <span className="yx-growth-meta">
              {f.goal ? `Linked to “${f.goal}” · ` : ''}Visible to: {f.visibility.toLowerCase()}
            </span>
          </div>
          <Badge tone={f.kind === 'Praise' ? 'success' : 'info'}>{f.kind}</Badge>
        </li>
      ))}
    </ul>
  );
}

/** PRF-08 Quick feedback (T4): give anytime to any colleague, visibility rule shown before sending (YX-PERF-04). */
export function QuickFeedbackScreen({ device = 'desktop', me, people, goals, received, given, requests = [], defaultTab = 'received', composerOpen, sent: sentProp, state = 'ready' }: QuickFeedbackProps) {
  const [open, setOpen] = useState(!!composerOpen);
  const [to, setTo] = useState<string | null>(composerOpen ? people[1]?.id ?? null : null);
  const [kind, setKind] = useState<'Praise' | 'Suggestion'>('Praise');
  const [text, setText] = useState(composerOpen ? 'Thanks for staying back to re-run the seal-strength tests on line 3. We shipped on time because of it.' : '');
  const [goal, setGoal] = useState<string | null>(null);
  const [vis, setVis] = useState<FeedbackItem['visibility']>('Them and their manager');
  const [sent, setSent] = useState(!!sentProp);
  const [error, setError] = useState<string | null>(null);
  const person = people.find((p) => p.id === to);

  const send = () => {
    if (!to) return setError('Choose who the feedback is for.');
    if (text.trim().length < 20) return setError('Write at least 20 characters so the feedback is specific.');
    setError(null);
    setSent(true);
    setOpen(false);
  };

  const form = (
    <div className="yx-growth-stack">
      <FormField label="To" required error={error && !to ? error : null}>
        <PersonPicker people={people.filter((p) => p.name !== me)} value={to} onChange={setTo} />
      </FormField>
      <FormField label="Type">
        <RadioGroup aria-label="Type" orientation="horizontal" value={kind} onChange={(v) => setKind(v as typeof kind)} options={[{ value: 'Praise', label: 'Praise' }, { value: 'Suggestion', label: 'Suggestion' }]} />
      </FormField>
      <FormField label="Feedback" required helper="Say what they did and what it led to." error={error && to ? error : null}>
        <TextArea value={text} onChange={setText} rows={4} />
      </FormField>
      <FormField label="Link to one of their goals" optional>
        <Select value={goal} onChange={setGoal} clearable placeholder="No goal" options={goals} />
      </FormField>
      <FormField label="Who can see it">
        <RadioGroup
          aria-label="Who can see it"
          value={vis}
          onChange={(v) => setVis(v as FeedbackItem['visibility'])}
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
          <li>Feedback outside a review never changes a rating.</li>
        </ul>
      </div>
    </div>
  );
  const footer = (
    <div className="yx-growth-foot">
      <Button onClick={() => setOpen(false)}>Cancel</Button>
      <Button variant="primary" icon={Send} onClick={send}>
        Send feedback
      </Button>
    </div>
  );
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
      </TabsList>
      <TabsContent value="received">{state === 'loading' ? <Skeleton height={200} /> : <FeedbackList items={received} dir="from" />}</TabsContent>
      <TabsContent value="given">
        <FeedbackList items={given} dir="to" />
      </TabsContent>
      <TabsContent value="requests">
        {requests.length === 0 ? (
          <EmptyState compact title="No one has asked you for feedback" />
        ) : (
          <ul className="yx-growth-list">
            {requests.map((r) => (
              <li key={r.id} className="yx-growth-list__item">
                <PersonLabel name={r.from} secondary={`Asked ${formatDate(r.at)}`} />
                <span className="yx-growth-grow">About: {r.about}</span>
                <Button size="sm" onClick={() => setOpen(true)}>
                  Give feedback
                </Button>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>
    </Tabs>
  );
  const confirmation = sent && (
    <InlineAlert tone="success" title={`Feedback sent to ${person?.name ?? 'Meera Iyer'}`}>
      They can see it now. You can find it under Given.
    </InlineAlert>
  );

  if (device === 'phone')
    return (
      <GrowthFrame area="performance" active="Feedback" persona="emp" device="phone" phone={{ title: 'Feedback' }}>
        {confirmation}
        {lists}
        <div className="yx-growth-pinned">
          <Button variant="primary" fullWidth icon={MessageSquarePlus} onClick={() => setOpen(true)}>
            Give feedback
          </Button>
          <Button fullWidth>Ask for feedback</Button>
        </div>
        <BottomSheet open={open} onOpenChange={setOpen} title="Give feedback" footer={footer}>
          {form}
        </BottomSheet>
      </GrowthFrame>
    );
  return (
    <GrowthFrame area="performance" active="Feedback" persona="emp">
      <PageHeader
        title="Feedback"
        description="Give and ask for feedback any time. Feedback inside a review uses nominated reviewers instead."
        actions={
          <>
            <Button>Ask for feedback</Button>
            <Button variant="primary" icon={MessageSquarePlus} onClick={() => setOpen(true)}>
              Give feedback
            </Button>
          </>
        }
      />
      {confirmation}
      {lists}
      <Drawer open={open} onOpenChange={setOpen} title="Give feedback" footer={footer} dirty={text.length > 0}>
        {form}
      </Drawer>
    </GrowthFrame>
  );
}

/* ================================================================== PRF-11 · 1:1s (+ PRF-16 suggested agenda) */

export interface OneOnOneAction {
  id: string;
  text: string;
  owner: string;
  due: Date;
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
}

export interface OneOnOneProps {
  persona: 'emp' | 'mgr';
  device?: Device;
  items: OneOnOne[];
  openId?: string;
  suggestedAgenda?: { id: string; text: string; why: string }[];
  state?: LoadState;
}

function OneOnOneRecord({ o, persona, suggested }: { o: OneOnOne; persona: 'emp' | 'mgr'; suggested?: OneOnOneProps['suggestedAgenda'] }) {
  const [agenda, setAgenda] = useState(o.agenda);
  const [draft, setDraft] = useState('');
  const [actions, setActions] = useState(o.actions);
  const [added, setAdded] = useState<string[]>([]);
  const other = persona === 'mgr' ? o.employee : o.manager;
  return (
    <div className="yx-growth-stack">
      <section aria-label="Agenda" className="yx-growth-stack" data-gap="sm">
        <h3 className="yx-growth-h">Shared agenda · {formatDate(o.next)}</h3>
        <ol className="yx-growth-list">
          {agenda.map((a) => (
            <li key={a.id} className="yx-growth-list__item">
              <span className="yx-growth-grow">{a.text}</span>
              <span className="yx-growth-meta">Added by {a.by}</span>
            </li>
          ))}
        </ol>
        <div className="yx-growth-row">
          <div className="yx-growth-grow">
            <TextField aria-label="Add an agenda item" placeholder="Add an agenda item" value={draft} onChange={setDraft} />
          </div>
          <Button
            icon={Plus}
            disabled={!draft.trim()}
            onClick={() => {
              setAgenda((xs) => [...xs, { id: `n${xs.length}`, text: draft.trim(), by: persona === 'mgr' ? o.manager : o.employee }]);
              setDraft('');
            }}
          >
            Add item
          </Button>
        </div>
      </section>
      {suggested && persona === 'mgr' && (
        <section className="yx-growth-panel" data-tone="ai" aria-label="Suggested agenda">
          <div className="yx-growth-row">
            <h3 className="yx-growth-h">Suggested agenda for {o.employee}</h3>
            <AiBadge />
          </div>
          <Text size="sm" tone="secondary">
            From open goals, feedback themes and your last 1:1 notes. Nothing is added until you choose.
          </Text>
          <ul className="yx-growth-list">
            {suggested.map((s) => (
              <li key={s.id} className="yx-growth-list__item">
                <div className="yx-growth-list__main">
                  <span className="yx-growth-list__title">{s.text}</span>
                  <span className="yx-growth-meta">Why: {s.why}</span>
                </div>
                {added.includes(s.id) ? (
                  <Badge tone="success">Added</Badge>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      setAdded((a) => [...a, s.id]);
                      setAgenda((xs) => [...xs, { id: s.id, text: s.text, by: o.manager }]);
                    }}
                  >
                    Add to agenda
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="yx-growth-cols" data-n="2">
        <section className="yx-growth-note" aria-label="Shared notes">
          <h3 className="yx-growth-h">Shared notes</h3>
          <Text size="sm" tone="secondary">
            You and {other} both see these.
          </Text>
          <TextArea aria-label="Shared notes" defaultValue={o.shared} rows={5} />
        </section>
        <section className="yx-growth-note" data-private="" aria-label="My private notes">
          <h3 className="yx-growth-h">
            <Icon icon={Lock} /> My private notes
          </h3>
          <Text size="sm" tone="secondary">
            Only you can see these. They stay with you if either of you changes role.
          </Text>
          <TextArea aria-label="My private notes" defaultValue={o.privateNote} rows={5} />
        </section>
      </div>
      <section aria-label="Action items" className="yx-growth-stack" data-gap="sm">
        <h3 className="yx-growth-h">Action items</h3>
        <ul className="yx-growth-list">
          {actions.map((a) => (
            <li key={a.id} className="yx-growth-list__item">
              <Checkbox checked={a.done} onChange={(c) => setActions((xs) => xs.map((x) => (x.id === a.id ? { ...x, done: c } : x)))} label={a.text} description={`${a.owner} · due ${formatDate(a.due)}${a.goal ? ` · goal: ${a.goal}` : ''}`} />
            </li>
          ))}
        </ul>
        <Button icon={Plus} size="sm">
          Add action item
        </Button>
      </section>
    </div>
  );
}

/** PRF-11 1:1s (T2 list + T3 record): shared agenda, shared notes, private notes, action items linked to goals. */
export function OneOnOneScreen({ persona, device = 'desktop', items, openId, suggestedAgenda, state = 'ready' }: OneOnOneProps) {
  const [open, setOpen] = useState<string | null>(openId ?? null);
  const current = items.find((i) => i.id === open) ?? null;
  const cols: TableColumn<OneOnOne>[] = [
    { key: 'who', header: persona === 'mgr' ? 'Team member' : 'With', type: 'person', value: (r) => (persona === 'mgr' ? r.employee : r.manager), person: (r) => ({ name: persona === 'mgr' ? r.employee : r.manager, secondary: persona === 'mgr' ? r.role : 'Your manager' }), width: 240 },
    { key: 'cadence', header: 'Cadence', value: (r) => r.cadence, width: 130 },
    { key: 'next', header: 'Next', type: 'date', value: (r) => r.next, width: 130 },
    { key: 'last', header: 'Last held', type: 'date', value: (r) => r.last, render: (r) => (r.last ? formatDate(r.last) : 'Not yet'), width: 130 },
    { key: 'agenda', header: 'Agenda items', type: 'number', value: (r) => r.agenda.length, width: 120 },
    { key: 'open', header: 'Open actions', type: 'number', value: (r) => r.actions.filter((a) => !a.done).length, width: 120 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => (r.last && (TODAY.getTime() - r.last.getTime()) / 86400000 > 35 ? 'Overdue' : 'On schedule'), statusTone: (v) => (v === 'Overdue' ? 'danger' : 'success'), width: 130 },
  ];
  if (device === 'phone')
    return (
      <GrowthFrame area="performance" active="1:1s" persona={persona} device="phone" phone={{ title: current ? `1:1 with ${persona === 'mgr' ? current.employee : current.manager}` : '1:1s', back: !!current }}>
        {current ? (
          <OneOnOneRecord o={current} persona={persona} suggested={suggestedAgenda} />
        ) : (
          <ul className="yx-growth-list">
            {items.map((o) => (
              <li key={o.id} className="yx-growth-list__item">
                <PersonLabel name={persona === 'mgr' ? o.employee : o.manager} secondary={`Next ${formatDate(o.next)} · ${o.agenda.length} agenda items`} />
                <Button size="sm" onClick={() => setOpen(o.id)}>
                  Open
                </Button>
              </li>
            ))}
          </ul>
        )}
      </GrowthFrame>
    );
  return (
    <GrowthFrame area="performance" active="1:1s" persona={persona}>
      <PageHeader title="1:1s" description={persona === 'mgr' ? 'Regular 1:1s with each person in your team.' : 'Your 1:1s with your manager.'} actions={persona === 'mgr' ? <Button variant="primary" icon={Plus}>Schedule 1:1</Button> : undefined} />
      <DataTable
        label="1:1s"
        columns={cols}
        rows={items}
        getRowId={(r) => r.id}
        state={state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'ready'}
        onRetry={() => {}}
        empty={<EmptyState title="No 1:1s yet" description="Set a regular 1:1 with each team member. Fortnightly works for most teams." />}
        onRowClick={(r) => setOpen(r.id)}
        activeRowId={open}
      />
      {current && (
        <Drawer
          open
          onOpenChange={(o) => !o && setOpen(null)}
          size="lg"
          title={`1:1 with ${persona === 'mgr' ? current.employee : current.manager}`}
          subtitle={`${current.cadence} · next ${formatDate(current.next)}`}
          footer={
            <div className="yx-growth-foot">
              <Button>Reschedule</Button>
              <Button variant="primary" icon={Check}>
                Mark as held
              </Button>
            </div>
          }
        >
          <OneOnOneRecord o={current} persona={persona} suggested={suggestedAgenda} />
        </Drawer>
      )}
    </GrowthFrame>
  );
}

/* ================================================================== PRF-12 · PIP record */

export interface Pip {
  id: string;
  employee: string;
  role: string;
  manager: string;
  hr: string;
  status: 'Proposed' | 'Active' | 'Extended' | 'Closed: met' | 'Closed: not met';
  start: Date;
  days: 30 | 60 | 90;
  reason: string;
  goals: { id: string; text: string; measure: string; status: 'Not started' | 'In progress' | 'Met' | 'Not met' }[];
  support: string[];
  checkIns: { at: Date; by: string; note: string; rating: 'On track' | 'Some progress' | 'No progress' }[];
  acknowledgement?: { at: Date; comment?: string } | null;
  approval: ApprovalStep[];
}

export interface PipRecordProps {
  persona: 'mgr' | 'hr' | 'emp';
  device?: Device;
  pip: Pip;
  tab?: 'plan' | 'checkins' | 'ack' | 'outcome';
  outcomeOpen?: boolean;
}

/** PRF-12 PIP record (T3): plan, fixed check-ins, employee acknowledgement, outcome; not met never auto-starts an exit (YX-PERF-11). */
export function PipRecordScreen({ persona, device = 'desktop', pip, tab = 'plan', outcomeOpen }: PipRecordProps) {
  const sched = pipSchedule(pip.start, pip.days, 10);
  const [ack, setAck] = useState(pip.acknowledgement ?? null);
  const [comment, setComment] = useState('');
  const [outcome, setOutcome] = useState<string>('');
  const [showOutcome, setShowOutcome] = useState(!!outcomeOpen);
  const facts = [
    { label: 'Plan', value: `${pip.days} days` },
    { label: 'Dates', value: `${formatDate(pip.start)} – ${formatDate(sched.end)}` },
    { label: 'Check-ins', value: `${pip.checkIns.length} of ${sched.checkIns.length} held` },
    { label: 'Manager', value: pip.manager },
    { label: 'HR', value: pip.hr },
  ];
  const statusTone = pip.status === 'Active' ? 'warning' : pip.status === 'Proposed' ? 'info' : pip.status === 'Closed: met' ? 'success' : pip.status === 'Closed: not met' ? 'danger' : 'warning';

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
      <ul className="yx-growth-list">
        {sched.checkIns.map((c, i) => {
          const held = pip.checkIns[i];
          return (
            <li key={c.toISOString()} className="yx-growth-list__item">
              <div className="yx-growth-list__main">
                <span className="yx-growth-list__title">
                  Check-in {i + 1} · {formatDate(c)}
                  {i === sched.checkIns.length - 1 ? ' (final)' : ''}
                </span>
                <span className="yx-growth-meta">{held ? `${held.by}: ${held.note}` : c < TODAY ? 'Missed. Hold it this week.' : 'Scheduled. Reminder 2 days before.'}</span>
              </div>
              <Badge tone={held ? (held.rating === 'On track' ? 'success' : held.rating === 'Some progress' ? 'warning' : 'danger') : c < TODAY ? 'danger' : 'neutral'}>{held ? held.rating : c < TODAY ? 'Missed' : 'Scheduled'}</Badge>
            </li>
          );
        })}
      </ul>
      {persona === 'mgr' && <Button icon={Plus}>Record check-in</Button>}
    </div>
  );
  const ackPanel = (
    <div className="yx-growth-stack">
      {ack ? (
        <InlineAlert tone="success" title={`Acknowledged on ${formatDate(ack.at)}`}>
          {ack.comment ? `Comment: “${ack.comment}”` : 'No comment added.'}
        </InlineAlert>
      ) : persona === 'emp' ? (
        <>
          <Text>Acknowledging means you have read the plan. It doesn’t mean you agree with it. You can add a comment that HR and your manager will see.</Text>
          <FormField label="Your comment" optional>
            <TextArea value={comment} onChange={setComment} rows={3} />
          </FormField>
          <div className="yx-growth-row">
            <Button variant="primary" onClick={() => setAck({ at: TODAY, comment: comment || undefined })}>
              Acknowledge plan
            </Button>
            <Button>Ask HR a question</Button>
          </div>
        </>
      ) : (
        <InlineAlert tone="warning" title="Not acknowledged yet">
          {pip.employee} was asked on {formatDate(pip.start)}. A reminder goes out every 2 days.
        </InlineAlert>
      )}
    </div>
  );
  const outcomePanel = (
    <div className="yx-growth-stack">
      {pip.status.startsWith('Closed') ? (
        <InlineAlert tone={pip.status === 'Closed: met' ? 'success' : 'danger'} title={`Outcome: ${pip.status.replace('Closed: ', '')}`}>
          Recorded by {pip.hr}. {pip.status === 'Closed: not met' ? 'HR decides the next step. Nothing starts automatically.' : ''}
        </InlineAlert>
      ) : (
        <Text tone="secondary">The outcome is recorded after the final check-in on {formatDate(sched.end)}.</Text>
      )}
      {persona !== 'emp' && !pip.status.startsWith('Closed') && (
        <Button onClick={() => setShowOutcome(true)}>
          Record outcome
        </Button>
      )}
      {pip.status === 'Closed: not met' && persona === 'hr' && (
        <Card title="Next step (HR decides)">
          <Text>Options: extend the plan, change role, or open an exit case in People. Any exit case is started by a person, never by this outcome.</Text>
          <div className="yx-growth-row">
            <Button>Extend plan</Button>
            <Button>Open exit case in People</Button>
          </div>
        </Card>
      )}
    </div>
  );

  const body = (
    <Tabs defaultValue={tab}>
      <TabsList aria-label="PIP">
        <TabsTrigger value="plan">Plan</TabsTrigger>
        <TabsTrigger value="checkins" count={pip.checkIns.length}>
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
      confirmDisabled={!outcome}
      onConfirm={() => setShowOutcome(false)}
    >
      <RadioGroup
        aria-label="Outcome"
        value={outcome}
        onChange={setOutcome}
        options={[
          { value: 'met', label: 'Met', description: 'All goals met. The plan closes.' },
          { value: 'extended', label: 'Extend by 30 days', description: 'Some progress; new end date and check-ins are added.' },
          { value: 'not-met', label: 'Not met', description: 'HR decides the next step with the manager.' },
        ]}
      />
    </ConfirmDialog>
  );

  if (device === 'phone')
    return (
      <GrowthFrame area="performance" active="PIPs" persona={persona} device="phone" phone={{ title: 'Performance plan', back: true }}>
        <div className="yx-growth-row">
          <Badge tone={statusTone}>{pip.status}</Badge>
          <ConfidentialTag />
        </div>
        <DescriptionList items={facts} />
        {!ack && persona === 'emp' ? ackPanel : body}
      </GrowthFrame>
    );

  return (
    <GrowthFrame area="performance" active="PIPs" persona={persona}>
      <ObjectHeader
        name={pip.employee}
        person
        photoUrl={null}
        secondary={`${pip.role} · Performance improvement plan`}
        status={
          <>
            <Badge tone={statusTone}>{pip.status}</Badge> <ConfidentialTag />
          </>
        }
        facts={facts}
        actions={
          persona === 'hr' && pip.status === 'Proposed' ? (
            <>
              <Button>Send back</Button>
              <Button variant="primary">Approve and start</Button>
            </>
          ) : persona === 'mgr' && pip.status === 'Active' ? (
            <>
              <Button>Download PIP letter</Button>
              <Button variant="primary">Record check-in</Button>
            </>
          ) : undefined
        }
      />
      {pip.status === 'Proposed' && (
        <InlineAlert tone="info" title={persona === 'hr' ? 'Waiting for your approval' : 'Waiting for HR approval'}>
          The plan starts only after HR approves it. {pip.employee} is not told until then.
        </InlineAlert>
      )}
      <SplitLayout
        main={body}
        side={
          <Card title="Approval">
            <ApprovalTimeline steps={pip.approval} now={TODAY} />
          </Card>
        }
      />
      {outcomeDialog}
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

const HANDOVER_FIELDS: FilterFieldDef[] = [
  { key: 'status', label: 'Status', type: 'multi', options: ['Moved', 'Needs decision', 'Decided'].map((v) => ({ value: v, label: v })) },
  { key: 'artefact', label: 'Artefact', type: 'multi', options: ['Manager review stage', '360° nominations', 'Calibration session', 'Comp proposal', 'PIP', '1:1 thread', 'Goal parent'].map((v) => ({ value: v, label: v })) },
];

/** PRF-13 Hand-over list (T2) after a manager change (YX-PERF-13): what moved and what needs a decision. */
export function HandoverListScreen({ persona, rows: initial, state = 'ready', leaver }: { persona: 'mgr' | 'hr'; rows: HandoverRow[]; state?: LoadState; leaver: string }) {
  const [rows, setRows] = useState(initial);
  const [filters, setFilters] = useState<FilterValue[]>(persona === 'hr' ? [{ key: 'status', type: 'multi', values: ['Needs decision'] }] : []);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
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
  const decide = (id: string) => setRows((xs) => xs.map((x) => (x.id === id ? { ...x, status: 'Decided' } : x)));
  return (
    <GrowthFrame area="performance" active="Reviews & cycles" persona={persona}>
      <PageHeader
        title={persona === 'mgr' ? 'Handed over to you' : 'Hand-over list'}
        description={
          persona === 'mgr'
            ? `Artefacts that moved to you from ${leaver} on 1 Sep 2026. You can read these people’s current cycle; private 1:1 notes stayed with their author.`
            : `Everything that moved when ${leaver} left, and what still needs a decision.`
        }
        facts={`${rows.filter((r) => r.status === 'Needs decision').length} need a decision · ${rows.length} artefacts`}
      />
      <InlineAlert tone="info" title="Private notes don’t move">
        Shared 1:1 notes and open action items moved. Each person’s private notes stay with them (YX-PERF-13).
      </InlineAlert>
      <DataTable
        label="Hand-over list"
        columns={cols}
        rows={shown}
        getRowId={(r) => r.id}
        state={state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'ready'}
        onRetry={() => {}}
        filtered={filters.length > 0 || q !== ''}
        onClearFilters={() => {
          setFilters([]);
          setQ('');
        }}
        empty={<EmptyState title="Nothing to hand over" description="When a manager leaves or changes, their in-flight reviews, PIPs and 1:1s are listed here." />}
        toolbar={<FilterBar fields={HANDOVER_FIELDS} value={filters} onChange={setFilters} search={q} onSearchChange={setQ} searchPlaceholder="Search employee" />}
        views={<SavedViewMenu views={[{ id: 'all', name: 'All artefacts' }, { id: 'decide', name: 'Needs decision', shared: true }]} currentId={persona === 'hr' ? 'decide' : 'all'} onSelect={() => {}} />}
        selectable={persona === 'hr'}
        selectedIds={selected}
        onSelectedChange={setSelected}
        bulkActions={() => <Button size="sm">Reassign to HR</Button>}
        rowButtons={(r) =>
          r.status === 'Needs decision' ? (
            <Button size="sm" onClick={() => decide(r.id)}>
              {r.artefact === 'Goal parent' ? 'Re-parent goal' : r.artefact === 'Calibration session' ? 'Reassign facilitator' : 'Decide'}
            </Button>
          ) : null
        }
        rowActions={() => <MenuItem>View audit entry</MenuItem>}
      />
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
  levels: string[];
  roles: { role: string; level: number }[];
  usedIn: string[];
  skillsTest?: string;
}

/** PRF-14 Competency framework (T3, HR): library by group, levels with behaviours, role mapping, skills test; in-use can only be retired or merged. */
export function CompetencyFrameworkScreen({ items, openId, state = 'ready', retireOpen }: { items: Competency[]; openId?: string; state?: LoadState; retireOpen?: boolean }) {
  const [sel, setSel] = useState(openId ?? items[0]?.id);
  const [retire, setRetire] = useState(!!retireOpen);
  const c = items.find((i) => i.id === sel);
  const groups: Competency['group'][] = ['Core', 'Functional', 'Leadership'];
  return (
    <GrowthFrame area="performance" active="Skills & competencies" persona="hr">
      <PageHeader
        title="Competency framework"
        description="One skills library for the company. Competencies here are also used as test question tags and hiring scorecard skills."
        actions={
          <>
            <Button>Import</Button>
            <Button icon={Plus}>Add competency</Button>
          </>
        }
      />
      {items.some((i) => i.starter) && (
        <InlineAlert tone="info" title="Starter library">
          Items marked “Starter” come from the YukthiX starter template. Edit them to match how Kaveri Foods works.
        </InlineAlert>
      )}
      {state === 'loading' ? (
        <Skeleton height={400} />
      ) : items.length === 0 ? (
        <EmptyState title="No competencies yet" description="Start from the starter library (core, functional, leadership) or add your own." action={<Button variant="primary">Load starter library</Button>} />
      ) : (
        <div className="yx-growth-player">
          <nav aria-label="Competencies">
            {groups.map((g) => (
              <div key={g} className="yx-growth-stack" data-gap="sm">
                <h2 className="yx-growth-h">{g}</h2>
                <ul className="yx-growth-player__outline">
                  {items
                    .filter((i) => i.group === g)
                    .map((i) => (
                      <li key={i.id} className="yx-growth-player__item" aria-current={i.id === sel ? 'true' : undefined}>
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
                <div className="yx-growth-row">
                  <Button icon={GitMerge}>Merge into…</Button>
                  <Button icon={Archive} onClick={() => setRetire(true)}>
                    Retire
                  </Button>
                  <Button variant="primary">Save changes</Button>
                </div>
              </div>
              <FormField label="Description">
                <TextArea defaultValue={c.description} rows={2} />
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
              <Card title="Required level by role" actions={<Button size="sm" icon={Plus}>Map a role</Button>}>
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
                      <tr key={r.role}>
                        <th scope="row">{r.role}</th>
                        <td>
                          <SkillLevel level={r.level} label={r.role} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
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
          onConfirm={() => setRetire(false)}
        />
      )}
    </GrowthFrame>
  );
}
