import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../components/button';
import { DatePicker } from '../../../components/date';
import { Badge, type BadgeTone } from '../../../components/display';
import { EmptyState } from '../../../components/feedback';
import { FormField } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { TextArea, TextField } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { PersonPicker, type PersonOption } from '../../../components/select';
import { DataTable, type TableColumn } from '../../../components/table';
import { dayKey } from '../../../lib/dates';
import { LivePage, dateText } from '../../time/live/kit';
import type { LoadState, PipStatus, PipSummary, PipsView } from './types';

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
