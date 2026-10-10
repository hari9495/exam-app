import { useState } from 'react';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/choice';
import { Badge } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../../components/field';
import { Icon, Text } from '../../../components/foundations';
import { NumberField, TextArea, TextField } from '../../../components/inputs';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { errorText, useRun } from '../../org/org-kit';
import { LivePage } from '../../time/live/kit';
import { JOURNEY_KIND_LABEL, type Choice, type JourneyKind, type JourneyTemplate, type JourneyTemplates, type LoadState, type OwnerType, type TaskKind, type TemplateTask } from './types';

// Settings › Onboarding checklists (LIFE-1.04 / 1.06; D17): start from the YukthiX starter, then change task names,
// owners, teams, days and which Service Desk item a task raises (founder D1). The law's appointment-letter task can
// move and change owner but cannot be removed or made optional (YX-LC-26). 6f (design §7.5): life-event checklists
// (new manager, transfer, parental leave, return to work) start Not in use; read / watch / quick-survey steps.

const OWNERS: { value: OwnerType; label: string }[] = [
  { value: 'hr', label: 'HR' },
  { value: 'it', label: 'IT' },
  { value: 'admin', label: 'Admin' },
  { value: 'finance', label: 'Finance' },
  { value: 'payroll', label: 'Payroll' },
  { value: 'manager', label: 'Manager' },
  { value: 'group', label: 'A team' },
  { value: 'buddy', label: 'The buddy' },
  { value: 'person', label: 'The person' },
];
const KIND_TEXT: Record<TemplateTask['kind'], string> = { tick: 'To do', form: 'Form', document: 'Document', letter: 'Letter', desk_request: 'Service Desk request', read: 'Read and acknowledge', watch: 'Watch a video', survey: 'Quick survey' };
/** Kinds HR can pick for a step it adds or changes; the others come from starters and stay as they are. */
const PICKABLE: TaskKind[] = ['tick', 'read', 'watch', 'survey'];
const LIFE: JourneyKind[] = ['new_manager', 'transfer', 'parental_leave', 'return_to_work'];
type Group = 'onboarding' | 'offboarding' | 'life';
const groupOf = (k: JourneyKind): Group => (k === 'onboarding' || k === 'offboarding' ? k : 'life');
const DAY_NAME: Record<JourneyKind, string> = { onboarding: 'joining', offboarding: 'last', new_manager: 'first', transfer: 'move', parental_leave: 'first leave', return_to_work: 'return' };
const TEAM_OWNERS = new Set<OwnerType>(['hr', 'it', 'admin', 'finance', 'payroll', 'group']);
const dayText = (n: number, kind: JourneyKind) => (n === 0 ? `On the ${DAY_NAME[kind]} day` : `${Math.abs(n)} day${Math.abs(n) === 1 ? '' : 's'} ${n < 0 ? 'before' : 'after'}`);

export interface JourneyTemplatesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: JourneyTemplates | null;
  teams: Choice[];
  catalogItems: (Choice & { desk: string })[];
  onUseStarter: (starterKey: string) => Promise<unknown>;
  onSave: (t: JourneyTemplate) => Promise<unknown>;
}

export function JourneyTemplatesScreen(p: JourneyTemplatesScreenProps) {
  const [kind, setKind] = useState<Group>('onboarding');
  const [editing, setEditing] = useState<JourneyTemplate | null>(null);
  const { busy, error, run } = useRun();
  const d = p.data;
  const templates = d?.templates.filter((t) => groupOf(t.kind) === kind) ?? [];
  const starters = d?.starters.filter((s) => groupOf(s.kind) === kind && !s.copied) ?? [];
  return (
    <LivePage title="Checklists" description="What has to happen when someone joins, leaves, or meets a life event (a first team, a transfer, parental leave), who does it and when. Start from the YukthiX starter and change it to fit your company." state={p.state} onRetry={p.onRetry} what="checklists" grantedBy="your System Admin">
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      <Segment label="Checklist" value={kind} onChange={setKind} options={[{ value: 'onboarding', label: 'Joining' }, { value: 'offboarding', label: 'Leaving' }, { value: 'life', label: 'Life events' }]} />
      {kind === 'life' && (
        <Text as="p" tone="secondary">
          Each life-event checklist starts by itself: a first direct report, an approved transfer, approved maternity or paternity leave, and the day after that leave. Your copy starts Not in use; turn it on when it fits your company.
        </Text>
      )}
      {starters.map((s) => (
        <Card key={s.key} title={s.name}>
          <Text as="p">{s.summary}</Text>
          <Text as="p" tone="secondary" size="sm">{`${s.tasks} tasks. Your copy is yours: later YukthiX changes to the starter never overwrite it.`}</Text>
          <Button variant="primary" loading={busy === s.key} onClick={() => void run(s.key, () => p.onUseStarter(s.key))}>
            Use this starter
          </Button>
        </Card>
      ))}
      {templates.length === 0 && starters.length === 0 && <EmptyState compact title="No checklist yet." />}
      {templates.map((t) => (
        <Card key={t.id} title={t.name}>
          <Text as="p" tone="secondary" size="sm">
            {`${LIFE.includes(t.kind) ? `${JOURNEY_KIND_LABEL[t.kind]} · ` : ''}${t.tasks.length} tasks · ${t.active ? 'In use' : 'Not in use'}${t.starterKey ? ' · from the YukthiX starter' : ''}`}
          </Text>
          <ul className="yx-lif-list">
            {t.tasks.map((x) => (
              <li key={x.key}>
                <Text>{x.title}</Text>{' '}
                <Text tone="secondary" size="sm">
                  {`${x.ownerLabel ?? x.ownerType} · ${dayText(x.dueOffsetDays, t.kind)}`}
                </Text>{' '}
                {x.locked && <Badge tone="info">Required by law</Badge>}
              </li>
            ))}
          </ul>
          <Button onClick={() => setEditing(t)}>Edit checklist</Button>
        </Card>
      ))}
      {editing && <TemplateEditor template={editing} teams={p.teams} items={p.catalogItems} onClose={() => setEditing(null)} onSave={async (t) => {
        await p.onSave(t);
        setEditing(null);
      }} />}
    </LivePage>
  );
}

function TemplateEditor({ template, teams, items, onClose, onSave }: { template: JourneyTemplate; teams: Choice[]; items: (Choice & { desk: string })[]; onClose: () => void; onSave: (t: JourneyTemplate) => Promise<void> }) {
  const [name, setName] = useState(template.name);
  const [active, setActive] = useState(template.active);
  const [tasks, setTasks] = useState<TemplateTask[]>(template.tasks);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const edit = (i: number, patch: Partial<TemplateTask>) => {
    setDirty(true);
    setTasks(tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  };
  const errors = [
    ...(name.trim() ? [] : [{ fieldId: 'tpl-name', message: 'Give the checklist a name.' }]),
    ...tasks.flatMap((t, i) => [
      ...(t.title.trim() ? [] : [{ fieldId: `tpl-t-${i}`, message: `Task ${i + 1} needs a name.` }]),
      ...(t.ownerType === 'group' && !t.ownerGroupId ? [{ fieldId: `tpl-team-${i}`, message: `Choose the team for "${t.title || `task ${i + 1}`}".` }] : []),
    ]),
  ];
  const v = useSaveErrors(errors);
  const save = async () => {
    if (errors.length) return v.reveal();
    setSaving(true);
    setFailed(null);
    try {
      await onSave({ ...template, name: name.trim(), active, tasks });
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const addTask = () => {
    setDirty(true);
    let n = tasks.length + 1;
    while (tasks.some((t) => t.key === `task_${n}`)) n++;
    setTasks([...tasks, { key: `task_${n}`, title: '', ownerType: 'hr', ownerUserId: null, ownerGroupId: null, kind: 'tick', config: {}, dueOffsetDays: 0, dependsOn: [], required: true, locked: false }]);
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Edit ${template.name}`}
      subtitle={'Days count from the ' + DAY_NAME[template.kind] + ' day. Use minus for days before.'}
      size="full"
      dirty={dirty}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Save checklist
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
      <FormField id="tpl-name" label="Name" required error={v.errorOf('tpl-name')}>
        <TextField
          value={name}
          onChange={(x) => {
            setDirty(true);
            setName(x);
          }}
          maxLength={100}
        />
      </FormField>
      <Checkbox
        checked={active}
        onChange={(c) => {
          setDirty(true);
          setActive(c);
        }}
        label={template.kind === 'onboarding' ? 'In use for new joiners' : template.kind === 'offboarding' ? 'In use for leavers' : `In use: starts by itself for each ${JOURNEY_KIND_LABEL[template.kind].toLowerCase()}`}
      />
      {tasks.map((t, i) => (
        <Card key={t.key} title={t.title || `Task ${i + 1}`} actions={t.locked ? <Badge tone="info"><Icon icon={Lock} size="sm" /> Required by law</Badge> : undefined}>
          <div className="yx-lif-grid">
            <FormField id={`tpl-t-${i}`} label="Task" required error={v.errorOf(`tpl-t-${i}`)} helper={PICKABLE.includes(t.kind) ? undefined : KIND_TEXT[t.kind]}>
              <TextField value={t.title} onChange={(x) => edit(i, { title: x })} maxLength={150} />
            </FormField>
            {PICKABLE.includes(t.kind) && !t.locked && (
              <FormField id={`tpl-k-${i}`} label="Kind of step">
                <Select aria-label="Kind of step" value={t.kind} onChange={(x) => x && edit(i, { kind: x as TaskKind, config: {} })} options={PICKABLE.map((k) => ({ value: k, label: KIND_TEXT[k] }))} />
              </FormField>
            )}
            <FormField id={`tpl-o-${i}`} label="Who does it">
              <Select aria-label="Who does it" value={OWNERS.some((o) => o.value === t.ownerType) ? t.ownerType : null} onChange={(x) => x && edit(i, { ownerType: x as OwnerType, ownerGroupId: TEAM_OWNERS.has(x as OwnerType) ? t.ownerGroupId : null })} options={OWNERS} />
            </FormField>
            {TEAM_OWNERS.has(t.ownerType) && (
              <FormField id={`tpl-team-${i}`} label="Team" optional={t.ownerType !== 'group'} required={t.ownerType === 'group'} error={v.errorOf(`tpl-team-${i}`)} helper={t.ownerType === 'group' ? undefined : 'Without a team, the HR person who adds the joiner gets it.'}>
                <Select aria-label="Team" value={t.ownerGroupId} onChange={(x) => edit(i, { ownerGroupId: x })} options={teams} clearable />
              </FormField>
            )}
            <FormField id={`tpl-d-${i}`} label="Due (days from the day)" helper={dayText(t.dueOffsetDays, template.kind)}>
              <NumberField value={t.dueOffsetDays} onChange={(x) => edit(i, { dueOffsetDays: x ?? 0 })} min={-90} max={180} />
            </FormField>
            {t.kind === 'read' && (
              <FormField id={`tpl-text-${i}`} label="What to read" helper="Plain text, up to 4,000 characters. Or give a link below.">
                <TextArea value={typeof t.config.text === 'string' ? t.config.text : ''} onChange={(x) => edit(i, { config: { ...t.config, text: x } })} rows={4} maxLength={4000} />
              </FormField>
            )}
            {(t.kind === 'read' || t.kind === 'watch') && (
              <FormField id={`tpl-url-${i}`} label={t.kind === 'watch' ? 'Video link' : 'Link'} optional={t.kind === 'read'} required={t.kind === 'watch'} helper="Starts with https://">
                <TextField value={typeof t.config.url === 'string' ? t.config.url : ''} onChange={(x) => edit(i, { config: { ...t.config, url: x } })} maxLength={500} />
              </FormField>
            )}
            {t.kind === 'watch' && (
              <FormField id={`tpl-min-${i}`} label="About how many minutes" optional>
                <NumberField value={typeof t.config.minutes === 'number' ? t.config.minutes : null} onChange={(x) => edit(i, { config: { ...t.config, minutes: x ?? undefined } })} min={1} max={180} />
              </FormField>
            )}
            {t.kind === 'survey' && (
              <FormField id={`tpl-q-${i}`} label="Statements to rate from 1 to 5" helper="One per line, up to five. HR sees the answers; the manager sees only that the person answered.">
                <TextArea value={Array.isArray(t.config.questions) ? (t.config.questions as string[]).join('\n') : ''} onChange={(x) => edit(i, { config: { questions: x.split('\n') } })} rows={4} />
              </FormField>
            )}
            {t.kind === 'desk_request' && (
              <FormField id={`tpl-i-${i}`} label="Service Desk item" optional helper="The desk gets a request for it on the due day and the task closes when the desk delivers. Without an item, the team ticks it by hand.">
                <Select aria-label="Service Desk item" value={typeof t.config.itemId === 'string' ? t.config.itemId : null} onChange={(x) => edit(i, { config: x ? { itemId: x } : {} })} options={items.map((it) => ({ value: it.value, label: `${it.label} (${it.desk})` }))} clearable searchable />
              </FormField>
            )}
          </div>
          {!t.locked && (
            <div className="yx-lif-row">
              <Checkbox checked={t.required} onChange={(c) => edit(i, { required: c })} label="Required (cannot be skipped)" />
              <Button
                size="sm"
                variant="danger"
                icon={Trash2}
                onClick={() => {
                  setDirty(true);
                  setTasks(tasks.filter((_, j) => j !== i).map((x) => ({ ...x, dependsOn: x.dependsOn.filter((k) => k !== t.key) })));
                }}
              >
                Remove task
              </Button>
            </div>
          )}
        </Card>
      ))}
      <Button icon={Plus} onClick={addTask}>
        Add a task
      </Button>
    </Drawer>
  );
}
