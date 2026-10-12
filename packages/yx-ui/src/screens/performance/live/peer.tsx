import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../components/button';
import { RadioGroup } from '../../../components/choice';
import { DatePicker } from '../../../components/date';
import { Badge, type BadgeTone } from '../../../components/display';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { FormField } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { NumberField, TextArea } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { PersonPicker, type PersonOption } from '../../../components/select';
import { Card } from '../../../components/shell';
import { DataTable } from '../../../components/table';
import { dayKey } from '../../../lib/dates';
import { errorText, useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import type { FeedbackTask, LoadState, Nomination, Nominations, PeerConfig, PeerForm, PeerGroups, ReviewerBlock } from './types';

// Performance batch PM5, wired (M06-BUILD-DESIGN §10, §15.3; PRF-07). Feedback from colleagues is anonymous and shown
// only as groups of at least the company's minimum; it is advisory and never part of the score.

const STATUS: Record<Nomination['status'], { label: string; tone: BadgeTone }> = {
  proposed: { label: 'Waiting for the manager', tone: 'info' },
  approved: { label: 'Asked', tone: 'success' },
  declined: { label: 'Declined', tone: 'neutral' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  submitted: { label: 'Answered', tone: 'success' },
};
const REL = { peer: 'Peer', report: 'Reports to them', other: 'Someone else' } as const;
const GROUP = { peer: 'Peers', report: 'People who report to them', others: 'Others' } as const;

// ------------------------------------------------------------------------------------------ on the review (PRF-07)

export interface PeerPanelProps {
  data: Nominations;
  groups: PeerGroups | null;
  /** Question texts by id, to label the grouped ratings. */
  questions: Record<string, string>;
  /** Matches of the server search for people who can be asked. */
  options: PersonOption[];
  onSearch: (q: string) => void;
  onNominate: (reviewerEmployeeId: string, relationship: Nomination['relationship']) => Promise<unknown>;
  onDecide: (id: string, approve: boolean) => Promise<unknown>;
  onWithdraw: (id: string) => Promise<unknown>;
}

/** Nominations and, when allowed, the grouped answers; shown inside the review screen. */
export function PeerPanel(p: PeerPanelProps) {
  const { busy, error, run } = useRun();
  const [adding, setAdding] = useState(false);
  const [who, setWho] = useState<string | null>(null);
  const [chosen, setChosen] = useState<PersonOption | null>(null);
  const [rel, setRel] = useState<Nomination['relationship']>('peer');
  if (!p.data.peer) return null;
  const live = p.data.nominations.filter((n) => n.status !== 'withdrawn' && n.status !== 'declined');
  return (
    <Card title="Feedback from colleagues" actions={(p.data.can.propose || p.data.can.add) && <Button icon={Plus} onClick={() => setAdding(true)}>{p.data.can.propose ? 'Suggest someone' : 'Ask someone'}</Button>}>
      <Text as="p" tone="secondary">{`${p.data.peer.minNominees} to ${p.data.peer.maxNominees} people, by ${dateText(p.data.peer.dueOn)}. Their answers are anonymous, shown only as a group, and do not count towards the rating.`}</Text>
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      {live.length === 0 ? (
        <EmptyState compact title="No one asked yet." />
      ) : (
        <ul className="yx-lif-list">
          {live.map((n) => (
            <li key={n.id}>
              <Text>{`${n.reviewer} · ${REL[n.relationship]}`}</Text> <Badge tone={STATUS[n.status].tone}>{STATUS[n.status].label}</Badge>{' '}
              {n.status === 'proposed' && p.data.can.decide && (
                <>
                  <Button size="sm" variant="approve" loading={busy === `a-${n.id}`} onClick={() => void run(`a-${n.id}`, () => p.onDecide(n.id, true))}>
                    Approve
                  </Button>{' '}
                  <Button size="sm" loading={busy === `d-${n.id}`} onClick={() => void run(`d-${n.id}`, () => p.onDecide(n.id, false))}>
                    Decline
                  </Button>
                </>
              )}
              {n.status === 'proposed' && p.data.can.propose && n.proposedBy === 'employee' && (
                <Button size="sm" loading={busy === `w-${n.id}`} onClick={() => void run(`w-${n.id}`, () => p.onWithdraw(n.id))}>
                  Withdraw
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {p.groups && (p.groups.shown.length > 0 || p.groups.heldBack > 0) && (
        <>
          <InlineAlert tone="info" title="Advisory">
            Shown as groups only. It does not change the rating.
          </InlineAlert>
          {p.groups.shown.map((g) => (
            <div key={g.group} className="yx-tim-stack">
              <Text weight="medium">{`${GROUP[g.group]} (${g.responses})`}</Text>
              {Object.entries(g.ratings).map(([q, r]) => (
                <Text as="p" key={q}>{`${p.questions[q] ?? 'Rating'}: average ${r.average}, from ${r.low} to ${r.high}`}</Text>
              ))}
              {g.texts.map((t, i) => (
                <Text as="p" key={i} tone="secondary">
                  {`“${t}”`}
                </Text>
              ))}
            </div>
          ))}
          {p.groups.heldBack > 0 && <Text as="p" tone="secondary">{`Not enough responses to show ${p.groups.heldBack === 1 ? 'one answer' : `${p.groups.heldBack} answers`} without identifying who gave ${p.groups.heldBack === 1 ? 'it' : 'them'}.`}</Text>}
        </>
      )}
      {adding && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setAdding(false)}
          size="md"
          title={p.data.can.propose ? 'Suggest someone to give feedback' : 'Ask someone to give feedback'}
          confirmLabel={p.data.can.propose ? 'Suggest' : 'Ask'}
          confirmDisabled={!who}
          onConfirm={async () => {
            await p.onNominate(who!, rel);
            setAdding(false);
            setWho(null);
          }}
        >
          <FormField id="nm-who" label="Who" required helper={p.data.can.propose ? 'Your manager approves it.' : undefined}>
            <PersonPicker
              aria-label="Who"
              value={who}
              onChange={(id) => {
                setChosen(p.options.find((x) => x.id === id) ?? null);
                setWho(id);
              }}
              people={chosen && !p.options.some((x) => x.id === chosen.id) ? [chosen, ...p.options] : p.options}
              onSearchChange={p.onSearch}
            />
          </FormField>
          <FormField id="nm-rel" label="They are">
            <Segment label="How they work together" value={rel} onChange={setRel} options={[{ value: 'peer', label: REL.peer }, { value: 'report', label: REL.report }, { value: 'other', label: REL.other }]} />
          </FormField>
        </ConfirmDialog>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------------------------------ my tasks and the form

export interface FeedbackTasksScreenProps {
  state: LoadState;
  onRetry?: () => void;
  tasks: FeedbackTask[];
  onOpen: (reviewId: string) => void;
}

export function FeedbackTasksScreen(p: FeedbackTasksScreenProps) {
  return (
    <LivePage title="Feedback I was asked for" description="Colleagues' reviews you were asked to add to. Your answers are anonymous." state={p.state} onRetry={p.onRetry} what="your feedback tasks">
      <DataTable
        label="Feedback I was asked for"
        columns={[
          { key: 'e', header: 'For', value: (t: FeedbackTask) => t.employee, width: 220, hideable: false },
          { key: 'c', header: 'Cycle', value: (t) => t.cycle, width: 220 },
          { key: 'd', header: 'By', value: (t) => t.dueOn ?? '', render: (t) => <Text>{t.dueOn ? dateText(t.dueOn) : '—'}</Text>, width: 130 },
          { key: 's', header: 'Status', value: (t) => (t.done ? 'done' : 'open'), render: (t) => <Badge tone={t.done ? 'success' : t.open ? 'info' : 'neutral'}>{t.done ? 'Sent' : t.open ? 'To do' : 'Closed'}</Badge>, width: 120 },
        ]}
        rows={p.tasks}
        getRowId={(t) => t.id}
        rowNoun={['request', 'requests']}
        cardSummary
        empty={<EmptyState compact title="No one has asked you for feedback." />}
        rowButtons={(t) => (
          <Button size="sm" onClick={() => p.onOpen(t.reviewId)}>
            {t.open ? 'Answer' : 'Open'}
          </Button>
        )}
      />
    </LivePage>
  );
}

export interface PeerFormScreenProps {
  state: LoadState;
  onRetry?: () => void;
  form: PeerForm | null;
  onBack: () => void;
  onSave: (input: { answers: { questionId: string; rating?: number | null; text?: string | null }[]; comment: string | null }, submit: boolean) => Promise<unknown>;
}

export function PeerFormScreen(p: PeerFormScreenProps) {
  const f = p.form;
  return (
    <LivePage title={f ? `Feedback for ${f.employee}` : 'Feedback'} description={f ? `${f.cycle}${f.dueOn ? ` · by ${dateText(f.dueOn)}` : ''}` : undefined} state={p.state} onRetry={p.onRetry} what="this request" actions={<Button onClick={p.onBack}>Back</Button>}>
      {f && <PeerFormBody key={f.entry?.status ?? 'new'} f={f} onSave={p.onSave} />}
    </LivePage>
  );
}

function PeerFormBody({ f, onSave }: { f: PeerForm; onSave: PeerFormScreenProps['onSave'] }) {
  const [answers, setAnswers] = useState<Record<string, { rating: number | null; text: string | null }>>(f.entry?.answers ?? {});
  const [comment, setComment] = useState(f.entry?.comment ?? '');
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null);
  const [sending, setSending] = useState(false);
  const set = (id: string, patch: Partial<{ rating: number | null; text: string | null }>) => setAnswers((a) => ({ ...a, [id]: { rating: a[id]?.rating ?? null, text: a[id]?.text ?? null, ...patch } }));
  const save = async (submit: boolean) => {
    setBusy(submit ? 'submit' : 'save');
    setFailed(null);
    try {
      await onSave({ answers: Object.entries(answers).map(([questionId, a]) => ({ questionId, rating: a.rating, text: a.text })), comment: comment.trim() || null }, submit);
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const done = f.entry?.status === 'submitted';
  return (
    <>
      <InlineAlert tone="info" title="Anonymous">
        {`${f.employee} and their manager see answers only as a group with others', never with your name. Your answer is advisory and does not change the rating.`}
      </InlineAlert>
      {done && <InlineAlert tone="success" title="Sent">Thank you. Your feedback is in.</InlineAlert>}
      {!f.can.answer && !done && <InlineAlert tone="warning" title="Closed">This request is no longer open.</InlineAlert>}
      {failed && (
        <InlineAlert tone="danger" title="Not saved">
          {failed}
        </InlineAlert>
      )}
      {f.sections.map((s) => (
        <Card key={s.id} title={s.title}>
          {s.questions.map((q) => (
            <div key={q.id} className="yx-tim-stack">
              {q.answer !== 'text' && (
                <FormField id={`pf-${q.id}`} label={q.wholeSection ? `Rating for ${s.title}` : q.text} optional={q.wholeSection || !q.required}>
                  <RadioGroup aria-label={q.wholeSection ? `Rating for ${s.title}` : q.text} orientation="horizontal" disabled={!f.can.answer} value={answers[q.id]?.rating != null ? String(answers[q.id].rating) : ''} onChange={(x) => set(q.id, { rating: Number(x) })} options={f.levels.map((l) => ({ value: String(l.value), label: `${l.value} · ${l.label}` }))} />
                </FormField>
              )}
              {q.answer !== 'rating' && (
                <FormField id={`pt-${q.id}`} label={q.answer === 'text' ? q.text : 'Why'} optional={q.answer === 'both' || !q.required}>
                  <TextArea value={answers[q.id]?.text ?? ''} onChange={(t) => set(q.id, { text: t })} rows={3} maxLength={q.maxChars} disabled={!f.can.answer} />
                </FormField>
              )}
            </div>
          ))}
        </Card>
      ))}
      <FormField id="pf-comment" label="Anything else" optional>
        <TextArea value={comment} onChange={setComment} rows={3} maxLength={5000} disabled={!f.can.answer} />
      </FormField>
      {f.can.answer && (
        <div className="yx-lif-row">
          <Button loading={busy === 'save'} onClick={() => void save(false)}>
            Save draft
          </Button>
          <Button variant="primary" onClick={() => setSending(true)}>
            Send feedback
          </Button>
        </div>
      )}
      {sending && (
        <ConfirmDialog open onOpenChange={(o) => !o && setSending(false)} title="Send your feedback?" confirmLabel="Send" onConfirm={async () => {
          await save(true);
          setSending(false);
        }}>
          <Text as="p">You cannot change it afterwards.</Text>
        </ConfirmDialog>
      )}
    </>
  );
}

// ------------------------------------------------------------------------------------------ reviewer blocks (§15.3)

export interface ReviewerBlocksScreenProps {
  state: LoadState;
  onRetry?: () => void;
  blocks: ReviewerBlock[];
  people: PersonOption[];
  onSearch: (q: string) => void;
  onBlock: (input: { employeeA: string; employeeB: string; reasonCode: ReviewerBlock['reasonCode']; untilOn: string | null }) => Promise<unknown>;
  onEnd: (id: string) => Promise<unknown>;
}

export function ReviewerBlocksScreen(p: ReviewerBlocksScreenProps) {
  const { busy, error, run } = useRun();
  const [adding, setAdding] = useState(false);
  const [a, setA] = useState<PersonOption | null>(null);
  const [b, setB] = useState<PersonOption | null>(null);
  const [reason, setReason] = useState<ReviewerBlock['reasonCode']>('conflict');
  const [until, setUntil] = useState<Date | null>(null);
  const pick = (chosen: PersonOption | null) => (chosen && !p.people.some((x) => x.id === chosen.id) ? [chosen, ...p.people] : p.people);
  return (
    <LivePage
      title="Reviewer blocks"
      description="Pairs who never review each other. Neither person is told why, and the picker does not show it."
      state={p.state}
      onRetry={p.onRetry}
      what="reviewer blocks"
      actions={
        <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
          Block a pair
        </Button>
      }
    >
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      <DataTable
        label="Reviewer blocks"
        columns={[
          { key: 'p', header: 'Pair', value: (x: ReviewerBlock) => `${x.a} and ${x.b}`, width: 320, hideable: false },
          { key: 'r', header: 'Reason', value: (x) => (x.reasonCode === 'conflict' ? 'Conflict' : 'Confidential matter'), width: 200 },
          { key: 'u', header: 'Until', value: (x) => x.untilOn ?? '', render: (x) => <Text>{x.untilOn ? dateText(x.untilOn) : 'Until ended'}</Text>, width: 160 },
        ]}
        rows={p.blocks}
        getRowId={(x) => x.id}
        rowNoun={['block', 'blocks']}
        cardSummary
        empty={<EmptyState compact title="No pairs are blocked." />}
        rowButtons={(x) => (
          <Button size="sm" loading={busy === x.id} onClick={() => void run(x.id, () => p.onEnd(x.id))}>
            End
          </Button>
        )}
      />
      {adding && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setAdding(false)}
          size="md"
          title="Block a pair from reviewing each other"
          confirmLabel="Block"
          confirmDisabled={!a || !b || a.id === b.id}
          onConfirm={async () => {
            await p.onBlock({ employeeA: a!.id, employeeB: b!.id, reasonCode: reason, untilOn: until ? dayKey(until) : null });
            setAdding(false);
          }}
        >
          <FormField id="rb-a" label="One person" required>
            <PersonPicker aria-label="One person" value={a?.id ?? null} onChange={(id) => setA(pick(a).find((x) => x.id === id) ?? null)} people={pick(a)} onSearchChange={p.onSearch} />
          </FormField>
          <FormField id="rb-b" label="The other person" required>
            <PersonPicker aria-label="The other person" value={b?.id ?? null} onChange={(id) => setB(pick(b).find((x) => x.id === id) ?? null)} people={pick(b)} onSearchChange={p.onSearch} />
          </FormField>
          <FormField id="rb-reason" label="Reason (only HR sees it)">
            <Segment label="Reason" value={reason} onChange={setReason} options={[{ value: 'conflict', label: 'Conflict' }, { value: 'confidential_matter', label: 'Confidential matter' }]} />
          </FormField>
          <FormField id="rb-until" label="Until" optional helper="Leave empty to keep it until you end it.">
            <DatePicker value={until} onChange={setUntil} min={new Date()} aria-label="Block until" />
          </FormField>
        </ConfirmDialog>
      )}
    </LivePage>
  );
}

// ------------------------------------------------------------------------------------------ cycle set-up

/** Peer feedback for a draft cycle: least and most nominees and a deadline; or off. */
export function PeerSetup({ value, onSave }: { value: PeerConfig | null; onSave: (v: PeerConfig | null) => Promise<unknown> }) {
  const { busy, error, run } = useRun();
  const [min, setMin] = useState<number | null>(value?.minNominees ?? 3);
  const [max, setMax] = useState<number | null>(value?.maxNominees ?? 6);
  const [due, setDue] = useState<Date | null>(value ? new Date(`${value.dueOn}T00:00:00`) : null);
  const ok = min !== null && max !== null && max >= min && max > 0 && due;
  return (
    <Card title="Feedback from colleagues">
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      <Text as="p" tone="secondary">{value ? `On: ${value.minNominees} to ${value.maxNominees} people, by ${dateText(value.dueOn)}.` : 'Off. Turn it on to let people nominate colleagues for anonymous feedback.'}</Text>
      <div className="yx-lif-grid">
        <FormField id="ps-min" label="Least people">
          <NumberField value={min} onChange={setMin} min={0} max={20} />
        </FormField>
        <FormField id="ps-max" label="Most people" error={min !== null && max !== null && max < min ? 'At least the least number.' : undefined}>
          <NumberField value={max} onChange={setMax} min={1} max={20} />
        </FormField>
        <FormField id="ps-due" label="Answers by">
          <DatePicker value={due} onChange={setDue} min={new Date()} aria-label="Feedback answers by" />
        </FormField>
      </div>
      <div className="yx-lif-row">
        <Button variant="primary" disabled={!ok} loading={busy === 'on'} onClick={() => void run('on', () => onSave({ minNominees: min!, maxNominees: max!, dueOn: dayKey(due!) }))}>
          {value ? 'Save' : 'Turn on'}
        </Button>
        {value && (
          <Button loading={busy === 'off'} onClick={() => void run('off', () => onSave(null))}>
            Turn off
          </Button>
        )}
      </div>
    </Card>
  );
}
