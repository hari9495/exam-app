import { useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Button, Link } from '../../../components/button';
import { Checkbox, RadioGroup } from '../../../components/choice';
import { DatePicker } from '../../../components/date';
import { Badge, type BadgeTone } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { NumberField, TextArea, TextField } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { MultiSelect, Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { DataTable, type TableColumn } from '../../../components/table';
import { dayKey } from '../../../lib/dates';
import { errorText, useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import type { Choice, CycleInput, CycleStage, Disagreement, EligibilityRow, EntryInput, Handover, LoadState, Preflight, ReviewCycle, ReviewDetail, ReviewEntry, ReviewSummary, TemplateKind } from './types';

// Performance batch PM4, wired (M06-BUILD-DESIGN §9; PRF-04 my review, PRF-05 manager review, PRF-06 cycles, PRF-13
// hand-over later). The employee always sees where their review is and who has it next (U73), never a score before
// release (U69); the manager reads the self review once they have saved a draft of their own.

const CYCLE_STATUS: Record<ReviewCycle['status'], { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  launched: { label: 'Running', tone: 'info' },
  calibrating: { label: 'Calibrating', tone: 'warning' },
  released: { label: 'Released', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' },
};
const KIND: Record<TemplateKind, string> = { annual: 'Annual', half_yearly: 'Half-yearly', quarterly: 'Quarterly', project: 'Project', probation: 'Probation' };
const DISAGREEMENT: Record<Disagreement['status'], { label: string; tone: BadgeTone }> = { open: { label: 'Waiting for HR', tone: 'warning' }, answered: { label: 'Answered', tone: 'info' }, upheld: { label: 'Upheld', tone: 'success' }, not_upheld: { label: 'Not upheld', tone: 'neutral' } };

/** A short text asked for before an action (a reason, a comment); `optional` lets it be empty. */
function TextDialog({ title, label, confirmLabel, optional, helper, onClose, onSave }: { title: string; label: string; confirmLabel: string; optional?: boolean; helper?: string; onClose: () => void; onSave: (text: string) => Promise<unknown> }) {
  const [text, setText] = useState('');
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} size="md" title={title} confirmLabel={confirmLabel} confirmDisabled={!optional && text.trim().length < 3} onConfirm={async () => {
      await onSave(text.trim());
      onClose();
    }}>
      <FormField id="td-text" label={label} required={!optional} optional={optional} helper={helper}>
        <TextArea value={text} onChange={setText} rows={3} maxLength={2000} />
      </FormField>
    </ConfirmDialog>
  );
}

const RULE: Record<EligibilityRow['rule'], string> = { included: 'Included', excluded_cutoff: 'Joined after the cut-off', leaver: 'Left', transfer_split: 'Moved team', protected_leave: 'Protected leave (counted as served)', override: 'Changed by HR' };

// ------------------------------------------------------------------------------------------ cycles (PRF-06)

export interface ReviewCyclesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  cycles: ReviewCycle[];
  /** Active templates, to pick one of the cycle's kind. */
  templates: { id: string; name: string; kind: TemplateKind; templateVersion: number }[];
  departments: Choice[];
  onCreate: (input: CycleInput) => Promise<unknown>;
  onOpen: (id: string) => void;
}

export function ReviewCyclesScreen(p: ReviewCyclesScreenProps) {
  const [creating, setCreating] = useState(false);
  const columns: TableColumn<ReviewCycle>[] = [
    { key: 'name', header: 'Cycle', value: (x) => x.name, width: 260, hideable: false },
    { key: 'status', header: 'Status', value: (x) => x.status, render: (x) => <Badge tone={CYCLE_STATUS[x.status].tone}>{CYCLE_STATUS[x.status].label}</Badge>, width: 130 },
    { key: 'kind', header: 'Kind', value: (x) => KIND[x.kind], width: 130 },
    { key: 'period', header: 'Period', value: (x) => x.periodFrom, render: (x) => <Text>{`${dateText(x.periodFrom)} to ${dateText(x.periodTo)}`}</Text>, width: 240 },
  ];
  return (
    <LivePage
      title="Review cycles"
      description="Who is reviewed, on which template, and by when."
      state={p.state}
      onRetry={p.onRetry}
      what="review cycles"
      actions={
        <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
          New cycle
        </Button>
      }
    >
      <DataTable
        label="Review cycles"
        columns={columns}
        rows={p.cycles}
        getRowId={(x) => x.id}
        rowNoun={['cycle', 'cycles']}
        cardSummary
        empty={<EmptyState compact title="No review cycles yet." description="Start one from an active template, for example the annual review." />}
        rowButtons={(x) => (
          <Button size="sm" onClick={() => p.onOpen(x.id)}>
            Open
          </Button>
        )}
      />
      {creating && <CycleDrawer cycle={null} templates={p.templates} departments={p.departments} onClose={() => setCreating(false)} onSave={async (input) => {
        await p.onCreate(input);
        setCreating(false);
      }} />}
    </LivePage>
  );
}

/** Departments chosen → a P19 group "department is one of"; none → everyone. */
const departmentsOf = (population: unknown): string[] => {
  const g = population as { items?: { field?: string; value?: unknown }[] } | null;
  const c = g?.items?.find((x) => x.field === 'department_id');
  return Array.isArray(c?.value) ? (c!.value as string[]) : typeof c?.value === 'string' ? [c.value] : [];
};

function CycleDrawer({ cycle, templates, departments, onClose, onSave }: { cycle: ReviewCycle | null; templates: ReviewCyclesScreenProps['templates']; departments: Choice[]; onClose: () => void; onSave: (c: CycleInput) => Promise<void> }) {
  const stage = (k: CycleStage['key']) => cycle?.stages.find((s) => s.key === k);
  const [name, setName] = useState(cycle?.name ?? '');
  const [kind, setKind] = useState<TemplateKind>(cycle?.kind ?? 'annual');
  const [templateId, setTemplateId] = useState<string | null>(cycle?.templateId ?? null);
  const [from, setFrom] = useState<Date | null>(cycle ? new Date(`${cycle.periodFrom}T00:00:00`) : null);
  const [to, setTo] = useState<Date | null>(cycle ? new Date(`${cycle.periodTo}T00:00:00`) : null);
  const [depts, setDepts] = useState<string[]>(departmentsOf(cycle?.population));
  const [withSelf, setWithSelf] = useState(cycle ? Boolean(stage('self')) : true);
  const [selfDue, setSelfDue] = useState<Date | null>(stage('self') ? new Date(`${stage('self')!.dueOn}T00:00:00`) : null);
  const [mgrDue, setMgrDue] = useState<Date | null>(stage('manager') ? new Date(`${stage('manager')!.dueOn}T00:00:00`) : null);
  const [withSkip, setWithSkip] = useState(Boolean(stage('skip')));
  const [skipDue, setSkipDue] = useState<Date | null>(stage('skip') ? new Date(`${stage('skip')!.dueOn}T00:00:00`) : null);
  const [cutoff, setCutoff] = useState<number | null>(cycle?.eligibilityRules.cutoffMonths ?? 3);
  const [rateLeavers, setRateLeavers] = useState(cycle?.eligibilityRules.rateLeavers ?? false);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const options = templates.filter((t) => t.kind === kind).map((t) => ({ value: t.id, label: `${t.name} (version ${t.templateVersion})` }));
  const errors = [
    ...(name.trim().length >= 2 ? [] : [{ fieldId: 'cy-name', message: 'Name the cycle.' }]),
    ...(templateId && options.some((o) => o.value === templateId) ? [] : [{ fieldId: 'cy-template', message: 'Choose an active template of this kind.' }]),
    ...(from && to && dayKey(to) > dayKey(from) ? [] : [{ fieldId: 'cy-to', message: 'Give the period, ending after it starts.' }]),
    ...(withSelf && !selfDue ? [{ fieldId: 'cy-self', message: 'Say when the self review is due.' }] : []),
    ...(mgrDue ? [] : [{ fieldId: 'cy-mgr', message: 'Say when the manager review is due.' }]),
    ...(withSkip && !skipDue ? [{ fieldId: 'cy-skip', message: 'Say when the skip-level review is due.' }] : []),
  ];
  const v = useSaveErrors(errors);
  const save = async () => {
    if (errors.length) return v.reveal();
    setSaving(true);
    setFailed(null);
    try {
      await onSave({
        name: name.trim(),
        kind,
        periodFrom: dayKey(from!),
        periodTo: dayKey(to!),
        templateId: templateId!,
        population: depts.length ? { id: 'root', join: 'and', items: [{ id: 'dept', field: 'department_id', operator: 'one_of', value: depts }] } : null,
        stages: [...(withSelf ? [{ key: 'self' as const, dueOn: dayKey(selfDue!) }] : []), { key: 'manager' as const, dueOn: dayKey(mgrDue!) }, ...(withSkip ? [{ key: 'skip' as const, dueOn: dayKey(skipDue!) }] : [])],
        eligibilityRules: { cutoffMonths: cutoff ?? 0, rateLeavers },
        ...(cycle ? { version: cycle.version } : {}),
      });
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
      title={cycle ? `Change ${cycle.name}` : 'New review cycle'}
      subtitle="The template and its rating scale are fixed once the cycle starts."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Save
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
      <FormField id="cy-name" label="Name" required error={v.errorOf('cy-name')} helper="For example FY 2025-26 annual review.">
        <TextField value={name} onChange={setName} maxLength={100} />
      </FormField>
      <div className="yx-lif-grid">
        <FormField id="cy-kind" label="Kind">
          <Select aria-label="Kind of cycle" value={kind} onChange={(k) => k && setKind(k as TemplateKind)} options={(Object.keys(KIND) as TemplateKind[]).map((k) => ({ value: k, label: KIND[k] }))} />
        </FormField>
        <FormField id="cy-template" label="Template" required error={v.errorOf('cy-template')}>
          <Select aria-label="Template" value={templateId} onChange={setTemplateId} options={options} />
        </FormField>
        <FormField id="cy-from" label="Period starts on" required>
          <DatePicker value={from} onChange={setFrom} aria-label="Period starts on" />
        </FormField>
        <FormField id="cy-to" label="Period ends on" required error={v.errorOf('cy-to')}>
          <DatePicker value={to} onChange={setTo} min={from ?? undefined} aria-label="Period ends on" />
        </FormField>
      </div>
      <FormField id="cy-depts" label="Who is in" optional helper="Leave empty for everyone in the company.">
        <MultiSelect aria-label="Departments in the cycle" value={depts} onChange={setDepts} options={departments} placeholder="Everyone" />
      </FormField>
      <Card title="Stages">
        <Checkbox checked={withSelf} onChange={setWithSelf} label="Self review" description="The employee answers first." />
        {withSelf && (
          <FormField id="cy-self" label="Self review due" required error={v.errorOf('cy-self')}>
            <DatePicker value={selfDue} onChange={setSelfDue} min={new Date()} aria-label="Self review due" />
          </FormField>
        )}
        <FormField id="cy-mgr" label="Manager review due" required error={v.errorOf('cy-mgr')}>
          <DatePicker value={mgrDue} onChange={setMgrDue} min={selfDue ?? new Date()} aria-label="Manager review due" />
        </FormField>
        <Checkbox checked={withSkip} onChange={setWithSkip} label="Skip-level review" description="The manager's manager agrees or sends it back." />
        {withSkip && (
          <FormField id="cy-skip" label="Skip-level review due" required error={v.errorOf('cy-skip')}>
            <DatePicker value={skipDue} onChange={setSkipDue} min={mgrDue ?? new Date()} aria-label="Skip-level review due" />
          </FormField>
        )}
      </Card>
      <Card title="Who is reviewed">
        <FormField id="cy-cutoff" label="Months served, at least" helper="People who joined later are left out; HR can add them back with a reason.">
          <NumberField value={cutoff} onChange={setCutoff} min={0} max={12} />
        </FormField>
        <Checkbox checked={rateLeavers} onChange={setRateLeavers} label="Rate people who have left" description="Otherwise their review closes without a rating." />
        <Text as="p" tone="secondary" size="sm">
          Maternity and paternity leave count as time served; nobody is left out or rated down for it.
        </Text>
      </Card>
    </Drawer>
  );
}

export interface CycleScreenProps {
  state: LoadState;
  onRetry?: () => void;
  cycle: ReviewCycle | null;
  templates: ReviewCyclesScreenProps['templates'];
  departments: Choice[];
  preflight: Preflight | null;
  funnel: { stage: string; label: string; count: number }[];
  eligibility: EligibilityRow[];
  onBack: () => void;
  onSave: (input: CycleInput) => Promise<unknown>;
  onCheck: () => Promise<unknown>;
  onLaunch: () => Promise<unknown>;
  onOverride: (id: string, reviewed: boolean, reason: string) => Promise<unknown>;
  disagreements?: Disagreement[];
  onRelease?: () => Promise<unknown>;
  onDecide?: (id: string, status: 'answered' | 'upheld' | 'not_upheld', hrNote: string) => Promise<unknown>;
  /** More on the cycle, such as peer feedback set-up (PM5). */
  extra?: ReactNode;
}

export function CycleScreen(p: CycleScreenProps) {
  const { busy, error, run } = useRun();
  const [editing, setEditing] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [changing, setChanging] = useState<EligibilityRow | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [deciding, setDeciding] = useState<Disagreement | null>(null);
  const x = p.cycle;
  return (
    <LivePage
      title={x ? x.name : 'Review cycle'}
      description={x ? `${KIND[x.kind]} · ${dateText(x.periodFrom)} to ${dateText(x.periodTo)} · ${CYCLE_STATUS[x.status].label}` : undefined}
      state={p.state}
      onRetry={p.onRetry}
      what="this cycle"
      actions={<Button onClick={p.onBack}>Back</Button>}
    >
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      {x?.status === 'draft' && (
        <Card
          title="Before it starts"
          actions={
            <>
              <Button onClick={() => setEditing(true)}>Change</Button>
              <Button loading={busy === 'check'} onClick={() => void run('check', p.onCheck)}>
                Run the check
              </Button>
            </>
          }
        >
          {!p.preflight ? (
            <Text as="p" tone="secondary">
              Run the check to see who is reviewed and what needs fixing first.
            </Text>
          ) : (
            <>
              <Text as="p">{`${p.preflight.reviewed} people reviewed · ${p.preflight.excluded} left out · ${p.preflight.protectedLeave} on protected leave (counted as served)`}</Text>
              {p.preflight.problems.length ? (
                <InlineAlert tone="warning" title={`Fix ${p.preflight.problems.length === 1 ? 'this' : `these ${p.preflight.problems.length}`} before you start`}>
                  <ul className="yx-lif-list">
                    {p.preflight.problems.map((q, i) => (
                      <li key={i}>
                        {q.text} {q.fix && <Link href={q.fix}>Fix</Link>}
                      </li>
                    ))}
                  </ul>
                </InlineAlert>
              ) : (
                <InlineAlert tone="success" title="Ready to start">
                  Everyone reviewed has a manager, and the template and scale are complete.
                </InlineAlert>
              )}
              <Button variant="primary" disabled={p.preflight.problems.length > 0} onClick={() => setLaunching(true)}>
                Start the cycle
              </Button>
            </>
          )}
        </Card>
      )}
      {x && x.status !== 'draft' && (
        <>
          <Card
            title="Where reviews are"
            actions={
              p.onRelease && (x.status === 'launched' || x.status === 'released') ? (
                <Button variant="primary" disabled={!p.funnel.some((f) => f.stage === 'release' && f.count > 0)} onClick={() => setReleasing(true)}>
                  Release ready reviews
                </Button>
              ) : undefined
            }
          >
            <ul className="yx-lif-list">
              {p.funnel.map((f) => (
                <li key={f.stage}>
                  <Text>{`${f.label}: ${f.count}`}</Text>
                </li>
              ))}
            </ul>
          </Card>
          {(p.disagreements ?? []).length > 0 && (
            <Card title="Disagreements">
              <ul className="yx-lif-list">
                {p.disagreements!.map((d) => (
                  <li key={d.id}>
                    <Text>{`${d.employee}: ${d.text}`}</Text> <Badge tone={DISAGREEMENT[d.status].tone}>{DISAGREEMENT[d.status].label}</Badge>
                    {d.hrNote && <Text tone="secondary">{` · ${d.hrNote}`}</Text>}{' '}
                    {d.status === 'open' && p.onDecide && (
                      <Button size="sm" onClick={() => setDeciding(d)}>
                        Answer
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card title="Who is reviewed">
            <DataTable
              label="Who is reviewed"
              columns={[
                { key: 'n', header: 'Employee', value: (r: EligibilityRow) => r.name, width: 220, hideable: false },
                { key: 'r', header: 'Rule', value: (r) => RULE[r.rule], width: 260 },
                { key: 'm', header: 'Months served', value: (r) => r.eligibleMonths, width: 140 },
                { key: 'in', header: 'Reviewed', value: (r) => (r.reviewed ? 'Yes' : 'No'), render: (r) => <Badge tone={r.reviewed ? 'success' : 'neutral'}>{r.reviewed ? 'Reviewed' : 'Left out'}</Badge>, width: 130 },
              ]}
              rows={p.eligibility}
              getRowId={(r) => r.id}
              rowNoun={['person', 'people']}
              cardSummary
              rowButtons={(r) =>
                x.status === 'launched' ? (
                  <Button size="sm" onClick={() => setChanging(r)}>
                    {r.reviewed ? 'Leave out' : 'Include'}
                  </Button>
                ) : null
              }
            />
          </Card>
        </>
      )}
      {x && p.extra}
      {editing && x && <CycleDrawer cycle={x} templates={p.templates} departments={p.departments} onClose={() => setEditing(false)} onSave={async (input) => {
        await p.onSave(input);
        setEditing(false);
      }} />}
      {launching && (
        <ConfirmDialog open onOpenChange={(o) => !o && setLaunching(false)} title="Start the cycle?" confirmLabel="Start" onConfirm={async () => {
          await p.onLaunch();
          setLaunching(false);
        }}>
          <Text as="p">{`${p.preflight?.reviewed ?? 0} reviews open now and their owners are told. The template and scale are then fixed for this cycle.`}</Text>
        </ConfirmDialog>
      )}
      {releasing && (
        <ConfirmDialog open onOpenChange={(o) => !o && setReleasing(false)} title="Release the ready reviews?" confirmLabel="Release" onConfirm={async () => {
          await run('release', p.onRelease!);
          setReleasing(false);
        }}>
          <Text as="p">{`${p.funnel.find((f) => f.stage === 'release')?.count ?? 0} people can then read their rating, band and their manager's review, and acknowledge it. Reviews still in progress are released later.`}</Text>
        </ConfirmDialog>
      )}
      {deciding && <DecideDialog item={deciding} onClose={() => setDeciding(null)} onSave={(status, note) => p.onDecide!(deciding.id, status, note)} />}
      {changing && <OverrideDialog row={changing} onClose={() => setChanging(null)} onSave={(reason) => p.onOverride(changing.id, !changing.reviewed, reason)} />}
    </LivePage>
  );
}

function DecideDialog({ item, onClose, onSave }: { item: Disagreement; onClose: () => void; onSave: (status: 'answered' | 'upheld' | 'not_upheld', note: string) => Promise<unknown> }) {
  const [status, setStatus] = useState<'answered' | 'upheld' | 'not_upheld'>('answered');
  const [note, setNote] = useState('');
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} size="md" title={`Answer ${item.employee}`} confirmLabel="Send answer" confirmDisabled={note.trim().length < 3} onConfirm={async () => {
      await onSave(status, note.trim());
      onClose();
    }}>
      <Text as="p">{item.text}</Text>
      <FormField id="dd-status" label="Outcome">
        <Segment label="Outcome" value={status} onChange={setStatus} options={[{ value: 'answered', label: 'Answered' }, { value: 'upheld', label: 'Upheld' }, { value: 'not_upheld', label: 'Not upheld' }]} />
      </FormField>
      <FormField id="dd-note" label="Note to the employee" required helper="If upheld, reopen the review so the manager can change the rating.">
        <TextArea value={note} onChange={setNote} rows={3} maxLength={2000} />
      </FormField>
    </ConfirmDialog>
  );
}

function OverrideDialog({ row, onClose, onSave }: { row: EligibilityRow; onClose: () => void; onSave: (reason: string) => Promise<unknown> }) {
  const [reason, setReason] = useState('');
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} size="md" title={row.reviewed ? `Leave ${row.name} out of this cycle` : `Review ${row.name} in this cycle`} confirmLabel={row.reviewed ? 'Leave out' : 'Include'} confirmDisabled={reason.trim().length < 3} onConfirm={async () => {
      await onSave(reason.trim());
      onClose();
    }}>
      <FormField id="ov-reason" label="Reason" required helper="Recorded with your name.">
        <TextArea value={reason} onChange={setReason} rows={2} maxLength={500} />
      </FormField>
    </ConfirmDialog>
  );
}

// ------------------------------------------------------------------------------------------ reviews (PRF-04, PRF-05)

export type ReviewsView = 'mine' | 'team' | 'scope';

export interface ReviewsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  view: ReviewsView;
  onView: (v: ReviewsView) => void;
  hasTeam: boolean;
  /** perf.review.view: reviews of people in scope. */
  canScope: boolean;
  reviews: ReviewSummary[];
  onOpen: (id: string) => void;
  /** What moved to or from the viewer when a manager changed (PRF-13). */
  handovers?: Handover[];
}

const nextText = (n: ReviewSummary['next']) => `${n.label}${n.owner ? ` · ${n.owner}` : ''}${n.dueOn ? ` · due ${dateText(n.dueOn)}` : ''}`;

export function ReviewsScreen(p: ReviewsScreenProps) {
  const columns: TableColumn<ReviewSummary>[] = [
    ...(p.view === 'mine' ? [] : [{ key: 'emp', header: 'Employee', value: (r: ReviewSummary) => r.employee, width: 200, hideable: false }]),
    { key: 'cycle', header: 'Cycle', value: (r) => r.cycle, width: 220 },
    { key: 'next', header: 'Where it is', value: (r) => nextText(r.next), width: 320 },
    ...(p.view === 'mine' ? [] : [{ key: 'score', header: 'Score', value: (r: ReviewSummary) => r.finalScore ?? '', render: (r: ReviewSummary) => <Text>{r.finalScore === null ? '—' : `${r.finalScore}${r.band ? ` · ${r.band}` : ''}`}</Text>, width: 180 }]),
  ];
  const views = [{ value: 'mine' as const, label: 'My reviews' }, ...(p.hasTeam ? [{ value: 'team' as const, label: 'My team' }] : []), ...(p.canScope ? [{ value: 'scope' as const, label: 'In my scope' }] : [])];
  return (
    <LivePage title="Reviews" description="Your reviews and your team's: where each one is and who has it next." state={p.state} onRetry={p.onRetry} what="reviews">
      {views.length > 1 && <Segment label="Show" value={p.view} onChange={p.onView} options={views} />}
      <DataTable
        label="Reviews"
        columns={columns}
        rows={p.reviews}
        getRowId={(r) => r.id}
        rowNoun={['review', 'reviews']}
        cardSummary
        empty={<EmptyState compact title="No reviews here." description={p.view === 'mine' ? 'When HR starts a review cycle that includes you, it shows here.' : undefined} />}
        rowButtons={(r) => (
          <Button size="sm" onClick={() => p.onOpen(r.id)}>
            Open
          </Button>
        )}
      />
      {(p.handovers ?? []).length > 0 && (
        <Card title="Hand-overs">
          <ul className="yx-lif-list">
            {p.handovers!.map((h) => (
              <li key={h.id}>
                <Text>{`${dateText(h.effectiveOn)} · ${h.employee}: ${h.artefactType === 'review' ? 'review' : 'a goal aligned to the old manager\u2019s goal'} ${h.direction === 'to_me' ? `from ${h.from}` : `to ${h.to}`}`}</Text>
                {h.decisionNeeded && <Badge tone="warning">Re-align the goal</Badge>}{' '}
                {h.artefactType === 'review' && h.direction === 'to_me' && (
                  <Button size="sm" onClick={() => p.onOpen(h.artefactId)}>
                    Open
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </LivePage>
  );
}

export interface ReviewScreenProps {
  state: LoadState;
  onRetry?: () => void;
  review: ReviewDetail | null;
  onBack: () => void;
  onSave: (stage: 'self' | 'manager' | 'other', input: EntryInput, submit: boolean) => Promise<unknown>;
  onAddOther?: (employeeId: string) => Promise<unknown>;
  /** More on the review, such as feedback from colleagues (PM5). */
  extra?: ReactNode;
  onSkip?: (agree: boolean, text: string | null) => Promise<unknown>;
  onAcknowledge?: (comment: string | null) => Promise<unknown>;
  onDisagree?: (text: string) => Promise<unknown>;
  onReopen?: (reason: string) => Promise<unknown>;
}

export function ReviewScreen(p: ReviewScreenProps) {
  const r = p.review;
  return (
    <LivePage title={r ? `${r.cycle.name}: ${r.employee}` : 'Review'} description={r ? `Manager: ${r.manager}` : undefined} state={p.state} onRetry={p.onRetry} what="this review" actions={<Button onClick={p.onBack}>Back</Button>}>
      {r && <ReviewBody key={`${r.id}-${r.version}`} {...p} r={r} />}
      {r && p.extra}
    </LivePage>
  );
}

function ReviewBody({ r, onSave, onAddOther, onSkip, onAcknowledge, onDisagree, onReopen }: ReviewScreenProps & { r: ReviewDetail }) {
  const [adding, setAdding] = useState(false);
  const [former, setFormer] = useState<string | null>(null);
  const [asking, setAsking] = useState<'send_back' | 'agree' | 'acknowledge' | 'disagree' | 'reopen' | null>(null);
  const stage: 'self' | 'manager' | 'other' | null = r.can.self ? 'self' : r.can.manager ? 'manager' : r.can.other ? 'other' : null;
  const mine = stage === 'self' ? r.self : stage === 'manager' ? r.managerEntry : stage === 'other' ? (r.otherEntry ?? null) : null;
  const [answers, setAnswers] = useState<Record<string, { rating: number | null; text: string | null }>>(mine?.answers ?? {});
  const [overall, setOverall] = useState<number | null>(mine?.overallRating ?? null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const set = (id: string, patch: Partial<{ rating: number | null; text: string | null }>) => setAnswers((a) => ({ ...a, [id]: { rating: a[id]?.rating ?? null, text: a[id]?.text ?? null, ...patch } }));
  const level = (v: number | null) => r.template.levels.find((l) => l.value === v);
  // A former manager answers what the manager answers.
  const sections = r.template.sections.filter((s) => (stage ? s.whoAnswers.includes(stage === 'other' ? 'manager' : stage) : true));
  const input = (): EntryInput => ({ answers: Object.entries(answers).map(([questionId, a]) => ({ questionId, rating: a.rating, text: a.text })), overallRating: overall });
  const save = async (submit: boolean) => {
    setBusy(submit ? 'submit' : 'save');
    setFailed(null);
    try {
      await onSave(stage!, input(), submit);
      return true;
    } catch (e) {
      setFailed(errorText(e));
      return false;
    } finally {
      setBusy(null);
    }
  };
  const shown = (e: ReviewEntry | null, who: string) =>
    e && (
      <Card title={`${who}${e.status === 'submitted' ? '' : ' (draft)'}`}>
        {e.sealed && <Text as="p" tone="secondary">Comments removed by HR.</Text>}
        {r.template.sections.flatMap((s) =>
          s.questions
            .filter((q) => e.answers[q.id])
            .map((q) => (
              <Text as="p" key={`${who}-${q.id}`}>
                {`${q.text}: ${[e.answers[q.id].rating !== null ? `${e.answers[q.id].rating} · ${level(e.answers[q.id].rating)?.label ?? ''}` : null, e.answers[q.id].text].filter(Boolean).join(' · ')}`}
              </Text>
            )),
        )}
      </Card>
    );
  return (
    <>
      <Card title="Where it is">
        <Text as="p">{nextText(r.next)}</Text>
        <ul className="yx-lif-list">
          {r.trail.map((t, i) => (
            <li key={i}>
              <Text tone="secondary" size="sm">{`${dateText(t.at.slice(0, 10))} · ${t.stage} ${t.event}${t.reason ? ` · ${t.reason}` : ''}`}</Text>
            </li>
          ))}
        </ul>
      </Card>
      {r.finalScore !== null && (
        <Card title="Score">
          <Text as="p">{`${r.finalScore}${r.band ? ` · ${r.band}` : ''}`}</Text>
          {r.excludedSections.length > 0 && <InlineAlert tone="info" title="Not scored">{`${r.excludedSections.join(', ')} had no ratings, so ${r.excludedSections.length === 1 ? 'it is' : 'they are'} left out of the score, not counted as 0.`}</InlineAlert>}
        </Card>
      )}
      {r.skipComment && <Text as="p" tone="secondary">{`Skip-level: ${r.skipComment}`}</Text>}
      {r.can.skip && (
        <Card title="Skip-level review">
          <Text as="p">You agree with the manager's review, or send it back with a reason. You do not change the rating.</Text>
          <div className="yx-lif-row">
            <Button variant="primary" onClick={() => setAsking('agree')}>
              Agree
            </Button>
            <Button onClick={() => setAsking('send_back')}>Send back</Button>
          </div>
        </Card>
      )}
      {r.released && r.role === 'employee' && (
        <Card title="Your review is released">
          {r.released.acknowledgedAt ? <Text as="p">{`You acknowledged it on ${dateText(r.released.acknowledgedAt.slice(0, 10))}.`}</Text> : <Text as="p">Read it, then acknowledge it. Acknowledging does not mean you agree.</Text>}
          {(r.disagreements ?? []).map((d) => (
            <Text as="p" key={d.id}>
              {`Your disagreement: ${d.text} · `}
              <Badge tone={DISAGREEMENT[d.status].tone}>{DISAGREEMENT[d.status].label}</Badge>
              {d.hrNote ? ` · HR: ${d.hrNote}` : ''}
            </Text>
          ))}
          <div className="yx-lif-row">
            {r.can.acknowledge && (
              <Button variant="primary" onClick={() => setAsking('acknowledge')}>
                Acknowledge
              </Button>
            )}
            {r.can.disagree && <Button onClick={() => setAsking('disagree')}>{`Disagree${r.released.disagreeBy ? ` (until ${dateText(r.released.disagreeBy)})` : ''}`}</Button>}
          </div>
        </Card>
      )}
      {stage === 'other' && (
        <InlineAlert tone="info" title="Your input as a former manager">
          {`${r.manager} now writes the review. Your input is shown to them and HR, not to ${r.employee}, and it is not scored.`}
        </InlineAlert>
      )}
      {(r.others ?? []).filter((o) => o.status === 'submitted').map((o) => (
        <Card key={o.name} title={`${o.name} (former manager, not scored)`}>
          {r.template.sections.flatMap((s) =>
            s.questions
              .filter((q) => o.answers?.[q.id])
              .map((q) => (
                <Text as="p" key={`${o.name}-${q.id}`}>
                  {`${q.text}: ${[o.answers![q.id].rating !== null ? `${o.answers![q.id].rating} · ${level(o.answers![q.id].rating)?.label ?? ''}` : null, o.answers![q.id].text].filter(Boolean).join(' · ')}`}
                </Text>
              )),
          )}
          {o.comment && <Text as="p">{o.comment}</Text>}
        </Card>
      ))}
      {r.can.addOther && onAddOther && (r.formerManagers ?? []).length > 0 && (
        <div className="yx-lif-row">
          <Button onClick={() => setAdding(true)}>Ask a former manager for input</Button>
        </div>
      )}
      {adding && (
        <ConfirmDialog open onOpenChange={(o) => !o && setAdding(false)} size="md" title="Ask a former manager for input" confirmLabel="Ask" confirmDisabled={!former} onConfirm={async () => {
          await onAddOther!(former!);
          setAdding(false);
        }}>
          <FormField id="ao-who" label="Former manager" required helper="They see only the questions and their own input, never the self review or the rating.">
            <Select aria-label="Former manager" value={former} onChange={setFormer} options={r.formerManagers ?? []} />
          </FormField>
        </ConfirmDialog>
      )}
      {r.can.reopen && onReopen && (
        <div className="yx-lif-row">
          <Button onClick={() => setAsking('reopen')}>Reopen for the manager</Button>
        </div>
      )}
      {asking === 'agree' && <TextDialog title="Agree with the manager's review" label="Comment" optional confirmLabel="Agree" onClose={() => setAsking(null)} onSave={(t) => onSkip!(true, t || null)} />}
      {asking === 'send_back' && <TextDialog title="Send back to the manager" label="Reason" confirmLabel="Send back" helper="The manager sees it and submits again." onClose={() => setAsking(null)} onSave={(t) => onSkip!(false, t)} />}
      {asking === 'acknowledge' && <TextDialog title="Acknowledge your review" label="Comment" optional confirmLabel="Acknowledge" onClose={() => setAsking(null)} onSave={(t) => onAcknowledge!(t || null)} />}
      {asking === 'disagree' && <TextDialog title="Disagree with your review" label="What you disagree with, and why" confirmLabel="Send to HR" helper="HR reads it and answers. Your rating stays as it is unless HR reopens the review." onClose={() => setAsking(null)} onSave={(t) => onDisagree!(t)} />}
      {asking === 'reopen' && <TextDialog title="Reopen this review" label="Reason" confirmLabel="Reopen" helper="The manager's review opens again; the employee sees nothing until it is released again. Recorded with your name." onClose={() => setAsking(null)} onSave={(t) => onReopen!(t)} />}
      {r.goals.length > 0 && (
        <Card title="Goals in this period">
          <ul className="yx-lif-list">
            {r.goals.map((g) => (
              <li key={g.id}>
                <Text>{`${g.title} · ${g.progress}% · weight ${g.weight}%`}</Text>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {stage === 'manager' && !r.self && r.selfSubmitted && (
        <InlineAlert tone="info" title="The self review is in">
          Save a draft of your own first; then you can read it.
        </InlineAlert>
      )}
      {stage !== 'self' && shown(r.self, `${r.employee}'s self review`)}
      {stage !== 'manager' && shown(r.managerEntry, `${r.manager}'s review`)}
      {stage && (
        <>
          {failed && (
            <InlineAlert tone="danger" title="Not saved">
              {failed}
            </InlineAlert>
          )}
          {sections.map((s) => (
            <Card key={s.id} title={`${s.title}${s.rated && s.weight ? ` · ${s.weight}%` : ''}`}>
              {s.questions.map((q) => (
                <div key={q.id} className="yx-tim-stack">
                  {q.answer !== 'text' && (
                    <FormField id={`rv-${q.id}`} label={q.wholeSection ? `Rating for ${s.title}` : q.text} optional={q.wholeSection || !q.required}>
                      <RadioGroup aria-label={q.wholeSection ? `Rating for ${s.title}` : q.text} orientation="horizontal" value={answers[q.id]?.rating != null ? String(answers[q.id].rating) : ''} onChange={(x) => set(q.id, { rating: Number(x) })} options={r.template.levels.map((l) => ({ value: String(l.value), label: `${l.value} · ${l.label}` }))} />
                    </FormField>
                  )}
                  {q.answer !== 'rating' && (
                    <FormField id={`rt-${q.id}`} label={q.answer === 'text' ? q.text : 'Why'} optional={q.answer === 'both' || !q.required}>
                      <TextArea value={answers[q.id]?.text ?? ''} onChange={(t) => set(q.id, { text: t })} rows={3} maxLength={q.maxChars} />
                    </FormField>
                  )}
                </div>
              ))}
            </Card>
          ))}
          {stage === 'manager' && r.template.scoring === 'manager_overall' && (
            <FormField id="rv-overall" label="Overall rating" required>
              <RadioGroup aria-label="Overall rating" orientation="horizontal" value={overall != null ? String(overall) : ''} onChange={(x) => setOverall(Number(x))} options={r.template.levels.map((l) => ({ value: String(l.value), label: `${l.value} · ${l.label}` }))} />
            </FormField>
          )}
          <div className="yx-lif-row">
            <Button loading={busy === 'save'} onClick={() => void save(false)}>
              Save draft
            </Button>
            <Button variant="primary" onClick={() => setSubmitting(true)}>
              Submit
            </Button>
          </div>
          {submitting && (
            <ConfirmDialog open onOpenChange={(o) => !o && setSubmitting(false)} title={stage === 'self' ? 'Send your self review?' : stage === 'other' ? 'Send your input?' : `Submit ${r.employee}'s review?`} confirmLabel="Submit" onConfirm={async () => {
              await save(true);
              setSubmitting(false);
            }}>
              <Text as="p">{stage === 'self' ? `It goes to ${r.manager}. You cannot change it afterwards.` : stage === 'other' ? `It goes to ${r.manager} and HR. You cannot change it afterwards.` : 'The score is worked out from your ratings. You cannot change it afterwards.'}</Text>
            </ConfirmDialog>
          )}
        </>
      )}
    </>
  );
}
