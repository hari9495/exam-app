import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../../components/button';
import { DatePicker } from '../../../components/date';
import { Badge, type BadgeTone } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { NumberField, TextArea, TextField } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { DataTable, type TableColumn } from '../../../components/table';
import { dayKey } from '../../../lib/dates';
import { errorText, useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import type { CheckinInput, Choice, GoalDetail, GoalInput, GoalMap, GoalPeriod, GoalStatus, GoalSummary, KeyResult, LoadState } from './types';

// Performance batch PM2, wired (M06-BUILD-DESIGN §7; PRF-01 / PRF-02 my goals and check-in, PRF-03 company goal map).
// Progress is worked out from key results (or child goals) and never typed when key results exist (U71); a goal can
// align to a goal owned by anyone (U70); a person's goals go to their manager together (D2).

export const GOAL_STATUS: Record<GoalStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  submitted: { label: 'With your manager', tone: 'info' },
  active: { label: 'Active', tone: 'success' },
  done: { label: 'Done', tone: 'success' },
  dropped: { label: 'Dropped', tone: 'neutral' },
};
const CONFIDENCE = { on_track: { label: 'On track', tone: 'success' }, at_risk: { label: 'At risk', tone: 'warning' }, off_track: { label: 'Off track', tone: 'danger' } } as const;
const DIRECTION = { up: 'Increase to', down: 'Decrease to', hit: 'Reach' } as const;

function Progress({ value, label }: { value: number; label: string }) {
  return (
    <span className="yx-lif-row">
      <progress max={100} value={value} aria-label={label} />
      <Text size="sm">{`${value}%`}</Text>
    </span>
  );
}

// ------------------------------------------------------------------------------------------ goals list (PRF-01 / PRF-02)

export interface GoalsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  periods: GoalPeriod[];
  periodId: string | null;
  onPeriod: (id: string) => void;
  view: 'mine' | 'team' | 'company';
  onView: (v: 'mine' | 'team' | 'company') => void;
  goals: GoalSummary[];
  totalWeight: number | null;
  /** The viewer manages goal periods, company and team goals. */
  canManage: boolean;
  departments: Choice[];
  alignOptions: { id: string; title: string; owner: string }[];
  onCreate: (input: GoalInput) => Promise<unknown>;
  onSubmitGoals: () => Promise<unknown>;
  onAddPeriod: (p: { name: string; fromOn: string; toOn: string }) => Promise<unknown>;
  onOpen: (id: string) => void;
}

export function GoalsScreen(p: GoalsScreenProps) {
  const { busy, error, run } = useRun();
  const [creating, setCreating] = useState<'person' | 'team' | 'company' | null>(null);
  const [addingPeriod, setAddingPeriod] = useState(false);
  const period = p.periods.find((x) => x.id === p.periodId) ?? null;
  const drafts = p.goals.filter((g) => g.status === 'draft').length;
  const columns: TableColumn<GoalSummary>[] = [
    { key: 'title', header: 'Goal', value: (g) => g.title, width: 300, hideable: false },
    ...(p.view === 'mine' ? [] : [{ key: 'owner', header: 'Owner', value: (g: GoalSummary) => g.owner, width: 180 }]),
    { key: 'progress', header: 'Progress', value: (g) => g.progress, render: (g) => <Progress value={g.progress} label={`${g.title} progress`} />, width: 180 },
    ...(p.view === 'mine' ? [{ key: 'weight', header: 'Weight', value: (g: GoalSummary) => `${g.weight}%`, width: 100 }] : []),
    { key: 'status', header: 'Status', value: (g) => g.status, render: (g) => <Badge tone={GOAL_STATUS[g.status].tone}>{GOAL_STATUS[g.status].label}</Badge>, width: 170 },
  ];
  return (
    <LivePage
      title="Goals"
      description={period ? `${period.name}: ${dateText(period.fromOn)} to ${dateText(period.toOn)}` : 'Goals for a period, aligned to your team’s and the company’s goals.'}
      state={p.state}
      onRetry={p.onRetry}
      what="goals"
      actions={
        <>
          {p.canManage && <Button onClick={() => setAddingPeriod(true)}>Add a period</Button>}
          {period?.status === 'open' && (
            <Button variant="primary" icon={Plus} onClick={() => setCreating(p.view === 'company' && p.canManage ? 'company' : 'person')}>
              Add a goal
            </Button>
          )}
        </>
      }
    >
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      <div className="yx-lif-row">
        <FormField id="gl-period" label="Period">
          <Select aria-label="Goal period" value={p.periodId} onChange={(x) => x && p.onPeriod(x)} options={p.periods.map((x) => ({ value: x.id, label: x.name }))} />
        </FormField>
        <Segment label="Show" value={p.view} onChange={p.onView} options={[{ value: 'mine', label: 'My goals' }, { value: 'team', label: 'My team' }, { value: 'company', label: 'Company and teams' }]} />
      </div>
      {p.periods.length === 0 ? (
        <EmptyState title="No goal periods yet" description={p.canManage ? 'Add a period, for example H2 FY 2026-27, to start setting goals.' : 'HR opens goal periods. Check back soon.'} />
      ) : (
        <>
          {p.view === 'mine' && p.totalWeight !== null && p.goals.length > 0 && (
            <InlineAlert tone={p.totalWeight === 100 ? 'success' : 'warning'} title={`Weights add up to ${p.totalWeight} of 100`}>
              {p.totalWeight === 100 ? 'Your goals are balanced.' : 'Your goals’ weights should add up to 100 before your review.'}
            </InlineAlert>
          )}
          <DataTable
            label="Goals"
            columns={columns}
            rows={p.goals}
            getRowId={(g) => g.id}
            rowNoun={['goal', 'goals']}
            cardSummary
            empty={<EmptyState compact title={p.view === 'mine' ? 'No goals yet.' : 'Nothing here yet.'} description={p.view === 'mine' ? 'Add your goals, align them to your team’s goals, then send them to your manager.' : undefined} />}
            rowButtons={(g) => (
              <Button size="sm" onClick={() => p.onOpen(g.id)}>
                Open
              </Button>
            )}
          />
          {p.view === 'mine' && drafts > 0 && (
            <Button variant="primary" loading={busy === 'submit'} onClick={() => void run('submit', p.onSubmitGoals)}>
              {`Send ${drafts === 1 ? 'my goal' : `my ${drafts} goals`} to my manager`}
            </Button>
          )}
          {p.view === 'company' && p.canManage && period?.status === 'open' && (
            <Button icon={Plus} onClick={() => setCreating('team')}>
              Add a team goal
            </Button>
          )}
        </>
      )}
      {creating && p.periodId && (
        <GoalDrawer goal={null} periodId={p.periodId} ownerType={creating} departments={p.departments} alignOptions={p.alignOptions} onClose={() => setCreating(null)} onSave={async (input) => {
          await p.onCreate(input);
          setCreating(null);
        }} />
      )}
      {addingPeriod && <PeriodDialog onClose={() => setAddingPeriod(false)} onSave={p.onAddPeriod} />}
    </LivePage>
  );
}

function PeriodDialog({ onClose, onSave }: { onClose: () => void; onSave: GoalsScreenProps['onAddPeriod'] }) {
  const [name, setName] = useState('');
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title="Add a goal period"
      confirmLabel="Add period"
      onConfirm={async () => {
        setTried(true);
        if (name.trim().length < 2 || !from || !to || dayKey(to) <= dayKey(from)) return false;
        await onSave({ name: name.trim(), fromOn: dayKey(from!), toOn: dayKey(to!) });
        onClose();
      }}
    >
      <FormField id="gp-name" label="Name" required error={tried && name.trim().length < 2 ? 'Enter a name of at least 2 characters.' : null} helper="For example H2 FY 2026-27.">
        <TextField value={name} onChange={setName} maxLength={80} />
      </FormField>
      <FormField id="gp-from" label="Starts on" required error={tried && !from ? 'Choose the start date.' : null}>
        <DatePicker value={from} onChange={setFrom} aria-label="Period starts on" />
      </FormField>
      <FormField id="gp-to" label="Ends on" required error={!tried ? null : !to ? 'Choose the end date.' : from && dayKey(to) <= dayKey(from) ? 'Choose an end date after the start date.' : null}>
        <DatePicker value={to} onChange={setTo} min={from ?? undefined} aria-label="Period ends on" />
      </FormField>
    </ConfirmDialog>
  );
}

type KrDraft = { title: string; unit: string; direction: 'up' | 'down' | 'hit'; start: number | null; target: number | null; weight: number | null };

function GoalDrawer({ goal, periodId, ownerType, departments, alignOptions, onClose, onSave }: { goal: GoalDetail | null; periodId: string; ownerType: 'person' | 'team' | 'company'; departments: Choice[]; alignOptions: { id: string; title: string; owner: string }[]; onClose: () => void; onSave: (g: GoalInput) => Promise<void> }) {
  const [title, setTitle] = useState(goal?.title ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  const [kind, setKind] = useState<'okr' | 'kpi'>(goal?.kind ?? 'okr');
  const [weight, setWeight] = useState<number | null>(goal?.weight ?? (ownerType === 'person' ? 0 : 0));
  const [parentId, setParentId] = useState<string | null>(goal?.parentGoalId ?? null);
  const [deptId, setDeptId] = useState<string | null>(goal?.ownerDepartmentId ?? null);
  const [krs, setKrs] = useState<KrDraft[]>(goal?.keyResults.map((k) => ({ title: k.title, unit: k.unit ?? '', direction: k.direction, start: k.start, target: k.target, weight: k.weight })) ?? [{ title: '', unit: '', direction: 'up', start: 0, target: null, weight: 1 }]);
  const [reason, setReason] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const changingActive = goal?.status === 'active' && goal.ownerType === 'person';
  const set = (i: number, patch: Partial<KrDraft>) => setKrs((ks) => ks.map((k, j) => (j === i ? { ...k, ...patch } : k)));
  const errors = [
    ...(title.trim().length >= 3 ? [] : [{ fieldId: 'gd-title', message: 'Say what the goal is.' }]),
    ...(ownerType === 'team' && !deptId ? [{ fieldId: 'gd-team', message: 'Choose the team.' }] : []),
    ...(kind === 'okr' && krs.length === 0 ? [{ fieldId: 'gd-krs', message: 'An objective needs at least one key result.' }] : []),
    ...(krs.every((k) => k.title.trim().length >= 2 && k.start !== null && k.target !== null && (k.direction === 'hit' || (k.direction === 'up' ? k.target > k.start : k.target < k.start))) ? [] : [{ fieldId: 'gd-krs', message: 'Each key result needs a name and a target past its start (above it to increase, below it to decrease).' }]),
    ...(changingActive && reason.trim().length < 3 ? [{ fieldId: 'gd-reason', message: 'Say why the goal changes; your manager approves the change.' }] : []),
  ];
  const v = useSaveErrors(errors);
  const save = async () => {
    if (errors.length) return v.reveal();
    setSaving(true);
    setFailed(null);
    try {
      await onSave({ periodId, ownerType, ...(ownerType === 'team' ? { ownerDepartmentId: deptId } : {}), parentGoalId: parentId, kind, title: title.trim(), description: description.trim() || null, weight: weight ?? 0, keyResults: krs.map((k) => ({ title: k.title.trim(), unit: k.unit.trim() || null, direction: k.direction, start: k.start!, target: k.target!, weight: k.weight ?? 1 })), ...(changingActive ? { reason: reason.trim() } : {}), ...(goal ? { version: goal.version } : {}) });
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
      size="lg"
      title={goal ? goal.title : ownerType === 'person' ? 'Add a goal' : ownerType === 'team' ? 'Add a team goal' : 'Add a company goal'}
      subtitle={changingActive ? 'This goal is approved. The change goes to your manager; until then the goal stays as it is.' : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            {changingActive ? 'Send the change' : 'Save'}
          </Button>
        </>
      }
    >
      {v.showErrors && <ErrorSummary errors={v.shownErrors} />}
      {failed && (
        <InlineAlert tone="danger" title="Not saved">
          {failed}
        </InlineAlert>
      )}
      <FormField id="gd-title" label="Goal" required error={v.errorOf('gd-title')}>
        <TextField value={title} onChange={setTitle} maxLength={200} />
      </FormField>
      <FormField id="gd-desc" label="Details" optional>
        <TextArea value={description} onChange={setDescription} rows={2} maxLength={1000} />
      </FormField>
      {ownerType === 'team' && (
        <FormField id="gd-team" label="Team" required error={v.errorOf('gd-team')}>
          <Select aria-label="Team" value={deptId} onChange={setDeptId} options={departments} searchable />
        </FormField>
      )}
      <FormField id="gd-kind" label="Kind">
        <Segment label="Kind of goal" value={kind} onChange={setKind} options={[{ value: 'okr', label: 'Objective with key results' }, { value: 'kpi', label: 'Target (KPI)' }]} />
      </FormField>
      <div className="yx-lif-grid">
        {ownerType === 'person' && (
          <FormField id="gd-weight" label="Weight (%)" helper="Your goals' weights add up to 100.">
            <NumberField value={weight} onChange={setWeight} min={0} max={100} decimals />
          </FormField>
        )}
        <FormField id="gd-parent" label="Aligns to" optional helper="A company, team or your manager's goal.">
          <Select aria-label="Aligns to" value={parentId} onChange={setParentId} options={alignOptions.filter((o) => o.id !== goal?.id).map((o) => ({ value: o.id, label: `${o.title} (${o.owner})` }))} clearable searchable />
        </FormField>
      </div>
      <Card title="Key results" actions={krs.length < 10 ? <Button size="sm" icon={Plus} onClick={() => setKrs((ks) => [...ks, { title: '', unit: '', direction: 'up', start: 0, target: null, weight: 1 }])}>Add a key result</Button> : undefined}>
        <div id="gd-krs">
          {v.errorOf('gd-krs') && (
            <Text as="p" tone="danger" size="sm">
              {v.errorOf('gd-krs')}
            </Text>
          )}
          {krs.length === 0 && (
            <Text as="p" tone="secondary" size="sm">
              No key results: progress is checked in by hand, or comes from the goals aligned to it.
            </Text>
          )}
          {krs.map((k, i) => (
            <div className="yx-lif-grid" key={i}>
              <FormField id={`gd-k${i}`} label={`Key result ${i + 1}`}>
                <TextField value={k.title} onChange={(x) => set(i, { title: x })} maxLength={200} />
              </FormField>
              <FormField id={`gd-kd${i}`} label="How">
                <Select aria-label={`Key result ${i + 1} direction`} value={k.direction} onChange={(x) => x && set(i, { direction: x as KrDraft['direction'] })} options={(Object.keys(DIRECTION) as KrDraft['direction'][]).map((d) => ({ value: d, label: DIRECTION[d] }))} />
              </FormField>
              <FormField id={`gd-ks${i}`} label="From">
                <NumberField value={k.start} onChange={(x) => set(i, { start: x })} decimals />
              </FormField>
              <FormField id={`gd-kt${i}`} label="Target">
                <NumberField value={k.target} onChange={(x) => set(i, { target: x })} decimals />
              </FormField>
              <FormField id={`gd-ku${i}`} label="Unit" optional>
                <TextField value={k.unit} onChange={(x) => set(i, { unit: x })} maxLength={20} />
              </FormField>
              <Button size="sm" variant="danger" icon={Trash2} onClick={() => setKrs((ks) => ks.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      </Card>
      {changingActive && (
        <FormField id="gd-reason" label="Why it changes" required error={v.errorOf('gd-reason')}>
          <TextArea value={reason} onChange={setReason} rows={2} maxLength={500} />
        </FormField>
      )}
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------ one goal + check-in (PRF-02)

export interface GoalScreenProps {
  state: LoadState;
  onRetry?: () => void;
  goal: GoalDetail | null;
  alignOptions: { id: string; title: string; owner: string }[];
  departments: Choice[];
  /** People the viewer can cascade to (their team). */
  team: Choice[];
  onBack: () => void;
  onSave: (input: GoalInput) => Promise<unknown>;
  onCheckIn: (input: CheckinInput) => Promise<unknown>;
  onDrop: (reason: string) => Promise<unknown>;
  onCascade: (employeeIds: string[]) => Promise<unknown>;
  onOpen: (id: string) => void;
}

export function GoalScreen(p: GoalScreenProps) {
  const g = p.goal;
  const [editing, setEditing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [cascading, setCascading] = useState(false);
  return (
    <LivePage title={g ? g.title : 'Goal'} description={g ? `${g.owner} · ${GOAL_STATUS[g.status].label}` : undefined} state={p.state} onRetry={p.onRetry} what="this goal" actions={<Button onClick={p.onBack}>Back</Button>}>
      {g && (
        <>
          <Card title="Progress">
            <Progress value={g.progress} label="Goal progress" />
            {g.parent && (
              <Text as="p" tone="secondary" size="sm">
                {`Aligns to: ${g.parent.title} (${g.parent.progress}%)`}
              </Text>
            )}
            {Boolean(g.pendingChange) && <InlineAlert tone="info" title="A change is waiting for the manager">The goal stays as it is until the change is approved.</InlineAlert>}
            {g.decisionNote && (
              <Text as="p" tone="secondary" size="sm">
                {`Manager's note: ${g.decisionNote}`}
              </Text>
            )}
          </Card>
          <Card title="Key results">
            <DataTable
              label="Key results"
              columns={[
                { key: 't', header: 'Key result', value: (k: KeyResult) => k.title, width: 260, hideable: false },
                { key: 'g', header: 'Target', value: (k) => `${DIRECTION[k.direction]} ${k.target}${k.unit ? ` ${k.unit}` : ''} (from ${k.start})`, width: 220 },
                { key: 'c', header: 'Now', value: (k) => `${k.current}${k.unit ? ` ${k.unit}` : ''}`, width: 110 },
                { key: 'p', header: 'Progress', value: (k) => k.progress, render: (k) => <Progress value={k.progress} label={`${k.title} progress`} />, width: 170 },
              ]}
              rows={g.keyResults}
              getRowId={(k) => k.id}
              rowNoun={['key result', 'key results']}
              empty={<EmptyState compact title="No key results." description={g.children.length ? 'Progress comes from the goals aligned to it.' : 'Progress is checked in by hand.'} />}
            />
          </Card>
          {g.children.length > 0 && (
            <Card title="Goals aligned to this one">
              <ul className="yx-lif-list">
                {g.children.map((c) => (
                  <li key={c.id}>
                    <Text>{`${c.title} · ${c.owner}`}</Text> <Progress value={c.progress} label={`${c.title} progress`} />{' '}
                    <Button size="sm" onClick={() => p.onOpen(c.id)}>
                      Open
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card title="Check-ins">
            {g.checkins.length === 0 ? (
              <Text as="p" tone="secondary">
                No check-ins yet.
              </Text>
            ) : (
              <ul className="yx-lif-list">
                {g.checkins.map((c) => (
                  <li key={c.id}>
                    <Text>{`${dateText(c.on)} · ${c.progress}%`}</Text> <Badge tone={CONFIDENCE[c.confidence].tone}>{CONFIDENCE[c.confidence].label}</Badge>
                    {c.note && <Text tone="secondary">{` · ${c.note}`}</Text>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <div className="yx-lif-row">
            {g.can.checkIn && (
              <Button variant="primary" onClick={() => setChecking(true)}>
                Check in
              </Button>
            )}
            {g.can.edit && <Button onClick={() => setEditing(true)}>{g.status === 'active' && g.ownerType === 'person' ? 'Ask to change' : 'Edit'}</Button>}
            {g.can.cascade && p.team.length > 0 && <Button onClick={() => setCascading(true)}>Cascade to my team</Button>}
            {g.can.drop && (
              <Button variant="danger" onClick={() => setDropping(true)}>
                Drop the goal
              </Button>
            )}
          </div>
          {editing && <GoalDrawer goal={g} periodId={g.periodId} ownerType={g.ownerType} departments={p.departments} alignOptions={p.alignOptions} onClose={() => setEditing(false)} onSave={async (input) => {
            await p.onSave(input);
            setEditing(false);
          }} />}
          {checking && <CheckInDrawer goal={g} onClose={() => setChecking(false)} onSave={async (input) => {
            await p.onCheckIn(input);
            setChecking(false);
          }} />}
          {dropping && <DropDialog onClose={() => setDropping(false)} onDrop={p.onDrop} />}
          {cascading && <CascadeDialog team={p.team} onClose={() => setCascading(false)} onCascade={p.onCascade} />}
        </>
      )}
    </LivePage>
  );
}

function CheckInDrawer({ goal, onClose, onSave }: { goal: GoalDetail; onClose: () => void; onSave: (c: CheckinInput) => Promise<void> }) {
  const [values, setValues] = useState<Record<string, number | null>>(Object.fromEntries(goal.keyResults.map((k) => [k.id, k.current])));
  const [progress, setProgress] = useState<number | null>(goal.progress);
  const [confidence, setConfidence] = useState<CheckinInput['confidence']>('on_track');
  const [note, setNote] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const krs = goal.keyResults.length > 0;
  const save = async () => {
    setSaving(true);
    setFailed(null);
    try {
      await onSave({ values: krs ? goal.keyResults.filter((k) => values[k.id] !== null && values[k.id] !== undefined).map((k) => ({ keyResultId: k.id, value: values[k.id]! })) : [], ...(krs ? {} : { progress: progress ?? 0 }), confidence, note: note.trim() || null });
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
      title={`Check in: ${goal.title}`}
      subtitle={krs ? 'Enter where each key result is now; progress is worked out from them.' : 'This goal has no key results: say how far it is.'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Save check-in
          </Button>
        </>
      }
    >
      {failed && (
        <InlineAlert tone="danger" title="Not saved">
          {failed}
        </InlineAlert>
      )}
      {krs ? (
        goal.keyResults.map((k) => (
          <FormField key={k.id} id={`ci-${k.id}`} label={`${k.title} (target ${k.target}${k.unit ? ` ${k.unit}` : ''})`}>
            <NumberField value={values[k.id] ?? null} onChange={(x) => setValues((vs) => ({ ...vs, [k.id]: x }))} decimals />
          </FormField>
        ))
      ) : (
        <FormField id="ci-progress" label="How far (%)">
          <NumberField value={progress} onChange={setProgress} min={0} max={100} decimals />
        </FormField>
      )}
      <FormField id="ci-confidence" label="How it looks">
        <Segment label="Confidence" value={confidence} onChange={setConfidence} options={(Object.keys(CONFIDENCE) as CheckinInput['confidence'][]).map((c) => ({ value: c, label: CONFIDENCE[c].label }))} />
      </FormField>
      <FormField id="ci-note" label="Note" optional>
        <TextArea value={note} onChange={setNote} rows={2} maxLength={1000} />
      </FormField>
    </Drawer>
  );
}

function DropDialog({ onClose, onDrop }: { onClose: () => void; onDrop: (reason: string) => Promise<unknown> }) {
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} size="md" title="Drop this goal?" consequence="It stays on record as dropped. Goals aligned to it keep working without a parent." confirmLabel="Drop the goal" destructive onConfirm={async () => {
      setTried(true);
      if (reason.trim().length < 3) return false;
      await onDrop(reason.trim());
      onClose();
    }}>
      <FormField id="dr-reason" label="Why" required error={tried && reason.trim().length < 3 ? 'Enter a reason of at least 3 characters.' : null}>
        <TextArea value={reason} onChange={setReason} rows={2} maxLength={500} />
      </FormField>
    </ConfirmDialog>
  );
}

function CascadeDialog({ team, onClose, onCascade }: { team: Choice[]; onClose: () => void; onCascade: (ids: string[]) => Promise<unknown> }) {
  const [person, setPerson] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} size="md" title="Cascade this goal" consequence="They get a draft copy aligned to this goal, to change and send to you." confirmLabel="Cascade" onConfirm={async () => {
      setTried(true);
      if (!person) return false;
      await onCascade([person!]);
      onClose();
    }}>
      <FormField id="cs-person" label="To" required error={tried && !person ? 'Choose the person.' : null}>
        <Select aria-label="Cascade to" value={person} onChange={setPerson} options={team} searchable />
      </FormField>
    </ConfirmDialog>
  );
}

// ------------------------------------------------------------------------------------------ company goal map (PRF-03)

export interface GoalMapScreenProps {
  state: LoadState;
  onRetry?: () => void;
  periods: GoalPeriod[];
  periodId: string | null;
  onPeriod: (id: string) => void;
  map: GoalMap | null;
  onOpen: (id: string) => void;
}

export function GoalMapScreen(p: GoalMapScreenProps) {
  const goals = p.map?.goals ?? [];
  const byParent = new Map<string | null, GoalSummary[]>();
  const ids = new Set(goals.map((g) => g.id));
  for (const g of goals) {
    const key = g.parentGoalId && ids.has(g.parentGoalId) ? g.parentGoalId : null;
    byParent.set(key, [...(byParent.get(key) ?? []), g]);
  }
  const offTrack = new Set(p.map?.offTrack ?? []);
  const unaligned = new Set(p.map?.unaligned ?? []);
  const Node = ({ g, depth }: { g: GoalSummary; depth: number }) => (
    <li style={{ marginInlineStart: `${depth * 1.25}rem` }}>
      <Text>{`${g.title} · ${g.owner}`}</Text> <Progress value={g.progress} label={`${g.title} progress`} /> {offTrack.has(g.id) && <Badge tone="danger">Off track</Badge>} {unaligned.has(g.id) && <Badge tone="warning">Not aligned</Badge>}{' '}
      <Button size="sm" onClick={() => p.onOpen(g.id)}>
        Open
      </Button>
      {(byParent.get(g.id) ?? []).length > 0 && (
        <ul className="yx-lif-list">
          {(byParent.get(g.id) ?? []).map((c) => (
            <Node key={c.id} g={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
  return (
    <LivePage title="Company goal map" description="Company goals, the team goals under them and the people's goals aligned to them, with progress worked out from key results." state={p.state} onRetry={p.onRetry} what="the goal map">
      <FormField id="gm-period" label="Period">
        <Select aria-label="Goal period" value={p.periodId} onChange={(x) => x && p.onPeriod(x)} options={p.periods.map((x) => ({ value: x.id, label: x.name }))} />
      </FormField>
      {goals.length === 0 ? (
        <EmptyState compact title="No goals in this period yet." />
      ) : (
        <Card title={`${goals.length} goals · ${unaligned.size} not aligned · ${offTrack.size} off track`}>
          <ul className="yx-lif-list">
            {(byParent.get(null) ?? []).map((g) => (
              <Node key={g.id} g={g} depth={0} />
            ))}
          </ul>
        </Card>
      )}
    </LivePage>
  );
}
