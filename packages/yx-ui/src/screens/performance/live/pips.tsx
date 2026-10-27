import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../components/button';
import { DatePicker } from '../../../components/date';
import { Badge, type BadgeTone } from '../../../components/display';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { FormField } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { TextArea, TextField } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { PersonPicker, type PersonOption } from '../../../components/select';
import { Card } from '../../../components/shell';
import { DataTable, type TableColumn } from '../../../components/table';
import { dayKey } from '../../../lib/dates';
import { useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import type { LoadState, Pip, PipStatus, PipSummary, PipsView } from './types';

// Performance batch PM8, wired (M06-BUILD-DESIGN §13; PRF-12 the PIP record). A plan is seen by the person, their
// manager chain and HR in scope only. Protected leave pauses it; "not met" opens nothing by itself.

const STATUS: Record<PipStatus, { label: string; tone: BadgeTone }> = {
  proposed: { label: 'Waiting for HR', tone: 'info' },
  declined: { label: 'Not approved', tone: 'neutral' },
  active: { label: 'In progress', tone: 'info' },
  extended: { label: 'Extended', tone: 'warning' },
  met: { label: 'Met', tone: 'success' },
  not_met: { label: 'Not met', tone: 'danger' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
};
const CHECKIN: Record<Pip['checkins'][number]['status'], { label: string; tone: BadgeTone }> = {
  due: { label: 'Due', tone: 'neutral' },
  held: { label: 'Held', tone: 'success' },
  missed: { label: 'Missed', tone: 'warning' },
  cancelled: { label: 'Not needed', tone: 'neutral' },
};

// ------------------------------------------------------------------------------------------ the list

export interface PipsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  view: PipsView;
  onView: (v: PipsView) => void;
  hasTeam: boolean;
  /** perf.pip.manage: plans of people in scope. */
  canScope: boolean;
  pips: PipSummary[];
  onOpen: (id: string) => void;
  /** The viewer's reports, for a new plan (managers only). */
  team: PersonOption[];
  /** perf.pip.lengths, in days. */
  lengths: number[];
  onPropose: (input: { employeeId: string; reason: string; expectations: string; support: string; goals: { text: string; measure: string }[]; lengthDays: number; checkinEveryDays: number; startsOn: string }) => Promise<unknown>;
}

export function PipsScreen(p: PipsScreenProps) {
  const [proposing, setProposing] = useState(false);
  const columns: TableColumn<PipSummary>[] = [
    ...(p.view === 'mine' ? [] : [{ key: 'emp', header: 'Employee', value: (x: PipSummary) => x.employee, width: 200, hideable: false }]),
    { key: 's', header: 'Status', value: (x) => x.status, render: (x) => <Badge tone={STATUS[x.status].tone}>{STATUS[x.status].label}</Badge>, width: 150 },
    { key: 'r', header: 'Runs', value: (x) => x.startsOn, render: (x) => <Text>{`${dateText(x.startsOn)} – ${dateText(x.endsOn)}`}</Text>, width: 220 },
    { key: 'n', header: 'Next check-in', value: (x) => x.nextCheckin ?? '', render: (x) => <Text>{x.nextCheckin ? dateText(x.nextCheckin) : '—'}</Text>, width: 150 },
    ...(p.view === 'mine' ? [] : [{ key: 'm', header: 'Manager', value: (x: PipSummary) => x.manager, width: 180 }]),
  ];
  const views = [{ value: 'mine' as const, label: 'My plan' }, ...(p.hasTeam ? [{ value: 'team' as const, label: 'My team' }] : []), ...(p.canScope ? [{ value: 'scope' as const, label: 'In my scope' }] : [])];
  return (
    <LivePage
      title="Improvement plans"
      description="Plans to help someone meet what the role needs: agreed goals, support and regular check-ins."
      state={p.state}
      onRetry={p.onRetry}
      what="improvement plans"
      actions={
        p.hasTeam && (
          <Button variant="primary" icon={Plus} disabled={!p.team.length} onClick={() => setProposing(true)}>
            Propose a plan
          </Button>
        )
      }
    >
      {views.length > 1 && <Segment label="Show" value={p.view} onChange={p.onView} options={views} />}
      <DataTable
        label="Improvement plans"
        columns={columns}
        rows={p.pips}
        getRowId={(x) => x.id}
        rowNoun={['plan', 'plans']}
        cardSummary
        empty={<EmptyState compact title="No plans here." />}
        rowButtons={(x) => (
          <Button size="sm" onClick={() => p.onOpen(x.id)}>
            Open
          </Button>
        )}
      />
      {proposing && <ProposeDialog {...p} onClose={() => setProposing(false)} />}
    </LivePage>
  );
}

function ProposeDialog(p: PipsScreenProps & { onClose: () => void }) {
  const [who, setWho] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [expectations, setExpectations] = useState('');
  const [support, setSupport] = useState('');
  const [goals, setGoals] = useState([{ text: '', measure: '' }]);
  const [length, setLength] = useState<number>(p.lengths.includes(60) ? 60 : (p.lengths[0] ?? 60));
  const [every, setEvery] = useState<number>(14);
  const [on, setOn] = useState<Date | null>(null);
  const filled = goals.filter((g) => g.text.trim().length >= 3 && g.measure.trim().length >= 3);
  const ok = who && reason.trim().length >= 10 && expectations.trim().length >= 10 && support.trim().length >= 3 && filled.length === goals.length && on;
  const setGoal = (i: number, k: 'text' | 'measure', val: string) => setGoals((gs) => gs.map((g, j) => (j === i ? { ...g, [k]: val } : g)));
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && p.onClose()} size="md" title="Propose an improvement plan" confirmLabel="Send to HR" onConfirm={async () => {
      setTried(true);
      if (!ok) return false;
      await p.onPropose({ employeeId: who!, reason: reason.trim(), expectations: expectations.trim(), support: support.trim(), goals: goals.map((g) => ({ text: g.text.trim(), measure: g.measure.trim() })), lengthDays: length, checkinEveryDays: every, startsOn: dayKey(on!) });
      p.onClose();
    }}>
      <Text as="p" tone="secondary">HR approves the plan before the person sees it.</Text>
      <FormField id="pip-who" label="Employee" required error={tried && !who ? 'Choose the employee.' : null}>
        <PersonPicker aria-label="Employee" value={who} onChange={setWho} people={p.team} />
      </FormField>
      <FormField id="pip-reason" label="Why a plan is needed" required error={tried && reason.trim().length < 10 ? 'Enter a reason of at least 10 characters.' : null} helper="Facts about the work, not the person.">
        <TextArea value={reason} onChange={setReason} rows={3} maxLength={2000} />
      </FormField>
      <FormField id="pip-exp" label="What good looks like" required error={tried && expectations.trim().length < 10 ? 'Enter at least 10 characters.' : null}>
        <TextArea value={expectations} onChange={setExpectations} rows={3} maxLength={4000} />
      </FormField>
      <FormField id="pip-support" label="Support you will give" required error={tried && support.trim().length < 3 ? 'Enter at least 3 characters.' : null}>
        <TextArea value={support} onChange={setSupport} rows={2} maxLength={2000} />
      </FormField>
      {goals.map((g, i) => (
        <div key={i}>
          <FormField id={`pip-g${i}`} label={`Goal ${i + 1}`} required error={tried && g.text.trim().length < 3 ? 'Enter at least 3 characters.' : null}>
            <TextField value={g.text} onChange={(x) => setGoal(i, 'text', x)} maxLength={500} />
          </FormField>
          <FormField id={`pip-m${i}`} label={`How goal ${i + 1} is measured`} required error={tried && g.measure.trim().length < 3 ? 'Enter at least 3 characters.' : null}>
            <TextField value={g.measure} onChange={(x) => setGoal(i, 'measure', x)} maxLength={500} />
          </FormField>
        </div>
      ))}
      {goals.length < 10 && (
        <Button size="sm" icon={Plus} onClick={() => setGoals((gs) => [...gs, { text: '', measure: '' }])}>
          Add a goal
        </Button>
      )}
      <FormField id="pip-len" label="Length">
        <Segment label="Length" value={length} onChange={setLength} options={p.lengths.map((n) => ({ value: n, label: `${n} days` }))} />
      </FormField>
      <FormField id="pip-every" label="Check in every">
        <Segment label="Check in every" value={every} onChange={setEvery} options={[7, 14, 30].filter((n) => n < length).map((n) => ({ value: n, label: n === 7 ? 'Week' : n === 14 ? 'Two weeks' : 'Month' }))} />
      </FormField>
      <FormField id="pip-on" label="Starts on" required error={tried && !on ? 'Choose the start date.' : null}>
        <DatePicker value={on} onChange={setOn} aria-label="Starts on" />
      </FormField>
    </ConfirmDialog>
  );
}

// ------------------------------------------------------------------------------------------ the record (PRF-12)

export interface PipScreenProps {
  state: LoadState;
  onRetry?: () => void;
  pip: Pip | null;
  onBack: () => void;
  onAcknowledge: (comment: string | null) => Promise<unknown>;
  onCheckin: (checkinId: string, note: string) => Promise<unknown>;
  onOutcome: (input: { outcome: 'met' | 'extended' | 'not_met'; note: string; extendTo: string | null }) => Promise<unknown>;
  onLetter: () => Promise<unknown>;
  onStartExit: (input: { lwd: string; reasonText: string }) => Promise<unknown>;
}

type Dialog = { kind: 'ack' } | { kind: 'checkin'; id: string; due: string } | { kind: 'outcome' } | { kind: 'exit' } | null;

export function PipScreen(p: PipScreenProps) {
  const { busy, error, run } = useRun();
  const [dialog, setDialog] = useState<Dialog>(null);
  const x = p.pip;
  const role = x?.role;
  return (
    <LivePage
      title={x ? `Improvement plan: ${x.employee}` : 'Improvement plan'}
      description={x ? `${dateText(x.startsOn)} to ${dateText(x.endsOn)} · manager ${x.manager}` : undefined}
      state={p.state}
      onRetry={p.onRetry}
      what="this plan"
      actions={
        <>
          <Button onClick={p.onBack}>Back</Button>
          {x?.can.acknowledge && (
            <Button variant="primary" onClick={() => setDialog({ kind: 'ack' })}>
              Acknowledge
            </Button>
          )}
          {x?.can.letter && (
            <Button loading={busy === 'letter'} onClick={() => void run('letter', p.onLetter)}>
              Issue the letter
            </Button>
          )}
          {x?.can.outcome && (
            <Button variant="primary" onClick={() => setDialog({ kind: 'outcome' })}>
              Record the outcome
            </Button>
          )}
          {x?.can.startExit && (
            <Button variant="danger" onClick={() => setDialog({ kind: 'exit' })}>
              Start an exit case
            </Button>
          )}
        </>
      }
    >
      {x && (
        <>
          {error && (
            <InlineAlert tone="danger" title="That didn't work">
              {error}
            </InlineAlert>
          )}
          <div>
            <Badge tone={STATUS[x.status].tone}>{STATUS[x.status].label}</Badge>
          </div>
          {x.warning && (
            <InlineAlert tone="warning" title="Check with the case owner">
              Before deciding anything on this plan, check with the case owner.
            </InlineAlert>
          )}
          {x.pausedNow && (
            <InlineAlert tone="info" title="Paused for protected leave">
              The plan resumes after the leave; its end date moves by the days of leave.
            </InlineAlert>
          )}
          {x.pausedDays > 0 && !x.pausedNow && <Text as="p" tone="secondary">{`The end moved from ${dateText(x.plannedEndsOn)} by ${x.pausedDays} days of protected leave.`}</Text>}
          {x.status === 'not_met' && <Text as="p" tone="secondary">{x.exitCaseId ? 'An exit case was started from this plan.' : 'Not met. Nothing else happens by itself.'}</Text>}
          {role === 'employee' && x.can.acknowledge && (
            <InlineAlert tone="info" title="Please read your plan">
              Acknowledging means you have read it. It does not mean you agree, and you can add a comment.
            </InlineAlert>
          )}
          <Card title="The plan">
            <Text as="p" weight="semibold">Why</Text>
            <Text as="p">{x.reason}</Text>
            <Text as="p" weight="semibold">What good looks like</Text>
            <Text as="p">{x.expectations}</Text>
            <Text as="p" weight="semibold">Support</Text>
            <Text as="p">{x.support}</Text>
          </Card>
          <Card title="Goals">
            <ul className="yx-lif-list">
              {x.goals.map((g) => (
                <li key={g.id}>
                  <Text>{`${g.text} · measured by: ${g.measure}`}</Text>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Check-ins">
            <ul className="yx-lif-list">
              {x.checkins.map((c) => (
                <li key={c.id}>
                  <Text>{dateText(c.dueOn)}</Text> <Badge tone={CHECKIN[c.status].tone}>{CHECKIN[c.status].label}</Badge>
                  {c.managerNote && <Text as="p">{`Manager: ${c.managerNote}`}</Text>}
                  {c.employeeNote && <Text as="p">{`${x.employee}: ${c.employeeNote}`}</Text>}
                  {x.can.checkin && c.status !== 'held' && c.status !== 'cancelled' && (
                    <Button size="sm" onClick={() => setDialog({ kind: 'checkin', id: c.id, due: c.dueOn })}>
                      Record
                    </Button>
                  )}
                  {x.can.employeeNote && c.status === 'held' && !c.employeeNote && (
                    <Button size="sm" onClick={() => setDialog({ kind: 'checkin', id: c.id, due: c.dueOn })}>
                      Add my note
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
          {(x.acknowledgedAt || x.outcomeNote || x.extendReason) && (
            <Card title="Record">
              {x.acknowledgedAt && <Text as="p">{`Acknowledged on ${dateText(x.acknowledgedAt.slice(0, 10))}${x.employeeComment ? `: ${x.employeeComment}` : '.'}`}</Text>}
              {x.extendReason && <Text as="p">{`Extended from ${dateText(x.extendedFrom!)}: ${x.extendReason}`}</Text>}
              {x.outcomeNote && <Text as="p">{`Outcome: ${x.outcomeNote}`}</Text>}
            </Card>
          )}
          {dialog?.kind === 'ack' && <NoteDialog title="Acknowledge the plan" label="Your comment" optional confirm="Acknowledge" onClose={() => setDialog(null)} onSave={(t) => p.onAcknowledge(t || null)} />}
          {dialog?.kind === 'checkin' && <NoteDialog title={`Check-in of ${dateText(dialog.due)}`} label={role === 'employee' ? 'Your note' : 'What was discussed'} confirm="Save" onClose={() => setDialog(null)} onSave={(t) => p.onCheckin(dialog.id, t)} />}
          {dialog?.kind === 'outcome' && <OutcomeDialog canExtend={x.can.extend} endsOn={x.endsOn} onClose={() => setDialog(null)} onSave={p.onOutcome} />}
          {dialog?.kind === 'exit' && <ExitDialog onClose={() => setDialog(null)} onSave={p.onStartExit} />}
        </>
      )}
    </LivePage>
  );
}

function NoteDialog(p: { title: string; label: string; confirm: string; optional?: boolean; onClose: () => void; onSave: (text: string) => Promise<unknown> }) {
  const [text, setText] = useState('');
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && p.onClose()} size="md" title={p.title} confirmLabel={p.confirm} onConfirm={async () => {
      setTried(true);
      if (!p.optional && text.trim().length < 3) return false;
      await p.onSave(text.trim());
      p.onClose();
    }}>
      <FormField id="pip-note" label={p.label} required={!p.optional} optional={p.optional} error={tried && !p.optional && text.trim().length < 3 ? 'Enter at least 3 characters.' : null}>
        <TextArea value={text} onChange={setText} rows={3} maxLength={2000} />
      </FormField>
    </ConfirmDialog>
  );
}

function OutcomeDialog(p: { canExtend: boolean; endsOn: string; onClose: () => void; onSave: PipScreenProps['onOutcome'] }) {
  const [outcome, setOutcome] = useState<'met' | 'extended' | 'not_met'>('met');
  const [note, setNote] = useState('');
  const [to, setTo] = useState<Date | null>(null);
  const ok = note.trim().length >= 3 && (outcome !== 'extended' || to);
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && p.onClose()} size="md" title="Record the outcome" confirmLabel="Save" onConfirm={async () => {
      setTried(true);
      if (!ok) return false;
      await p.onSave({ outcome, note: note.trim(), extendTo: outcome === 'extended' && to ? dayKey(to) : null });
      p.onClose();
    }}>
      {outcome === 'not_met' && <Text as="p" tone="secondary">Not met closes the plan. It does not start an exit; you decide that separately.</Text>}
      <FormField id="pip-outcome" label="Outcome">
        <Segment label="Outcome" value={outcome} onChange={setOutcome} options={[{ value: 'met', label: 'Met' }, ...(p.canExtend ? [{ value: 'extended' as const, label: 'Extend once' }] : []), { value: 'not_met', label: 'Not met' }]} />
      </FormField>
      {outcome === 'extended' && (
        <FormField id="pip-to" label="New end date" required error={tried && !to ? 'Choose the new end date.' : null} helper={`Now ends on ${dateText(p.endsOn)}. At most 90 days more.`}>
          <DatePicker value={to} onChange={setTo} aria-label="New end date" />
        </FormField>
      )}
      <FormField id="pip-onote" label={outcome === 'extended' ? 'Why extend' : 'Summary'} required error={tried && note.trim().length < 3 ? 'Enter at least 3 characters.' : null}>
        <TextArea value={note} onChange={setNote} rows={3} maxLength={1000} />
      </FormField>
    </ConfirmDialog>
  );
}

function ExitDialog(p: { onClose: () => void; onSave: PipScreenProps['onStartExit'] }) {
  const [lwd, setLwd] = useState<Date | null>(null);
  const [why, setWhy] = useState('');
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && p.onClose()} size="md" title="Start an exit case" confirmLabel="Start the exit case" destructive onConfirm={async () => {
      setTried(true);
      if (!lwd || why.trim().length < 3) return false;
      await p.onSave({ lwd: dayKey(lwd!), reasonText: why.trim() });
      p.onClose();
    }}>
      <Text as="p" tone="secondary">Opens a company-initiated exit in Exits, linked to this plan. It goes through the usual exit approval.</Text>
      <FormField id="pip-lwd" label="Last working day" required error={tried && !lwd ? 'Choose the last working day.' : null}>
        <DatePicker value={lwd} onChange={setLwd} aria-label="Last working day" />
      </FormField>
      <FormField id="pip-why" label="Reason" required error={tried && why.trim().length < 3 ? 'Enter a reason of at least 3 characters.' : null}>
        <TextArea value={why} onChange={setWhy} rows={2} maxLength={1000} />
      </FormField>
    </ConfirmDialog>
  );
}
