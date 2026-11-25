// Answer 2631: the pipeline editor on Settings › Hiring (6.1), replacing the older /v2 Settings › Pipelines page. Drawn
// from kit parts first (story P6_1_PipelineEdit), then live: a new pipeline (copied from the default), and for each
// stage its name, kind, order, the statuses inside it and the rules a candidate must meet before entering it (interview
// feedback, a passed test, a checklist). A stage or status that still holds candidates cannot be removed (the API
// refuses). Stage targets stay in their own sheet.
import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button, IconButton } from '../../components/button';
import { Checkbox, Switch } from '../../components/choice';
import { InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { useToastIfAny } from '../../components/notify';
import { Select } from '../../components/select';
import { Card } from '../../components/shell';
import { Drawer } from '../../components/drawer';
import { ConfirmDialog } from '../../components/overlay';
import './hiring.css';

export type StageKind = 'active' | 'offer' | 'hired' | 'rejected' | 'archived';
export type StageRule =
  | { id: string; type: 'feedback'; minCount?: number; minAvgRating?: number; requireNote?: boolean }
  | { id: string; type: 'exam_passed'; examId?: string; minScore?: number }
  | { id: string; type: 'checklist'; items: { id: string; label: string }[] };
export interface EditableStage {
  id: string;
  name: string;
  category: StageKind;
  position: number;
  statuses: { id: string; name: string; position: number }[];
  rules?: StageRule[];
}
export interface EditablePipeline {
  id: string;
  name: string;
  isDefault: boolean;
  stages: EditableStage[];
}
export interface StageSave {
  name: string;
  category: StageKind;
  rules: StageRule[];
  statuses: { add: string[]; rename: { id: string; name: string }[]; remove: string[] };
}
export interface PipelineSheetProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** null: a new pipeline (named here, copied from the default). */
  pipeline: EditablePipeline | null;
  tests: { value: string; label: string }[];
  canEdit: boolean;
  onCreate: (name: string) => Promise<unknown>;
  onDeletePipeline: (id: string) => Promise<unknown>;
  onAddStage: (pipelineId: string, name: string, category: StageKind, position: number) => Promise<unknown>;
  onSaveStage: (stageId: string, s: StageSave) => Promise<unknown>;
  onMoveStage: (stageId: string, position: number) => Promise<unknown>;
  onRemoveStage: (stageId: string) => Promise<unknown>;
}

const KINDS: { value: StageKind; label: string }[] = [
  { value: 'active', label: 'In progress' },
  { value: 'offer', label: 'Offer' },
  { value: 'hired', label: 'Hired' },
  { value: 'rejected', label: 'Not selected' },
  { value: 'archived', label: 'Archived' },
];
const rid = () => Math.random().toString(36).slice(2, 10);
const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'That did not save. Try again.');

export function PipelineSheet(p: PipelineSheetProps) {
  const toast = useToastIfAny();
  const [name, setName] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [newStage, setNewStage] = useState('');
  const run = async (f: () => Promise<unknown>, ok?: string) => {
    setFailed(null);
    try {
      await f();
      if (ok) toast?.toast({ tone: 'success', title: ok });
      return true;
    } catch (e) {
      setFailed(errorText(e));
      return false;
    }
  };
  if (!p.pipeline)
    return (
      <Drawer
        open={p.open}
        onOpenChange={p.onOpenChange}
        title="New pipeline"
        subtitle="Pipeline templates"
        footer={
          <>
            <Button onClick={() => p.onOpenChange(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                setTried(true);
                if (!name.trim()) return setTimeout(() => document.getElementById('pl-name')?.focus(), 0);
                setBusy(true);
                if (await run(() => p.onCreate(name.trim()), `${name.trim()} added. It starts with the default pipeline's stages.`)) p.onOpenChange(false);
                setBusy(false);
              }}
            >
              Add pipeline
            </Button>
          </>
        }
      >
        <div className="yx-hire-stack">
          {failed && <InlineAlert tone="danger" title={failed} />}
          <FormField id="pl-name" label="Pipeline name" required helper="For example Plant workers or Campus hiring. It starts with the default pipeline's stages." error={tried && !name.trim() ? 'Name the pipeline.' : null}>
            <TextField value={name} onChange={setName} maxLength={200} />
          </FormField>
        </div>
      </Drawer>
    );
  const pl = p.pipeline;
  const stages = [...pl.stages].sort((a, b) => a.position - b.position);
  return (
    <Drawer
      open={p.open}
      onOpenChange={p.onOpenChange}
      title={`Pipeline: ${pl.name}`}
      subtitle={pl.isDefault ? 'Pipeline templates · the default' : 'Pipeline templates'}
      footer={
        <>
          {p.canEdit && !pl.isDefault && (
            <ConfirmDialog
              trigger={<Button variant="danger">Delete pipeline</Button>}
              title={`Delete ${pl.name}?`}
              consequence="Jobs that use it must move to another pipeline first."
              confirmLabel="Delete pipeline"
              destructive
              onConfirm={async () => {
                await p.onDeletePipeline(pl.id);
                toast?.toast({ tone: 'success', title: `${pl.name} deleted.` });
                p.onOpenChange(false);
              }}
            />
          )}
          <Button onClick={() => p.onOpenChange(false)}>Close</Button>
        </>
      }
    >
      <div className="yx-hire-stack">
        <Text as="p" size="sm" tone="secondary">
          Every job on {pl.name} uses these stages. A stage or status that still holds candidates can't be removed.
        </Text>
        {failed && <InlineAlert tone="danger" title={failed} />}
        {stages.map((s, i) => (
          <StageCard key={s.id} {...p} stage={s} index={i} total={stages.length} run={run} neighbours={stages} />
        ))}
        {p.canEdit && (
          <Card title="Add a stage">
            <div className="yx-hire-actions">
              <FormField label="Stage name">
                <TextField value={newStage} onChange={setNewStage} maxLength={200} />
              </FormField>
              <Button
                icon={Plus}
                onClick={async () => {
                  if (!newStage.trim()) return setFailed('Name the stage first.');
                  if (await run(() => p.onAddStage(pl.id, newStage.trim(), 'active', stages.length), `${newStage.trim()} added.`)) setNewStage('');
                }}
              >
                Add stage
              </Button>
            </div>
          </Card>
        )}
      </div>
    </Drawer>
  );
}

function StageCard({ stage, index, total, tests, canEdit, run, onSaveStage, onMoveStage, onRemoveStage, neighbours }: { stage: EditableStage; index: number; total: number; tests: PipelineSheetProps['tests']; canEdit: boolean; run: (f: () => Promise<unknown>, ok?: string) => Promise<boolean>; neighbours: EditableStage[] } & Pick<PipelineSheetProps, 'onSaveStage' | 'onMoveStage' | 'onRemoveStage'>) {
  const [name, setName] = useState(stage.name);
  const [category, setCategory] = useState<StageKind>(stage.category);
  const [statuses, setStatuses] = useState(stage.statuses.map((x) => ({ id: x.id as string | null, name: x.name })));
  const [rules, setRules] = useState<StageRule[]>(stage.rules ?? []);
  const [tried, setTried] = useState(false);
  const fb = rules.find((r) => r.type === 'feedback') as Extract<StageRule, { type: 'feedback' }> | undefined;
  const ex = rules.find((r) => r.type === 'exam_passed') as Extract<StageRule, { type: 'exam_passed' }> | undefined;
  const ck = rules.find((r) => r.type === 'checklist') as Extract<StageRule, { type: 'checklist' }> | undefined;
  const setRule = (type: StageRule['type'], r: StageRule | null) => setRules((xs) => [...xs.filter((x) => x.type !== type), ...(r ? [r] : [])]);
  const save = async () => {
    setTried(true);
    const items = ck ? ck.items.filter((it) => it.label.trim()) : [];
    if (!name.trim() || statuses.some((s) => !s.name.trim()) || (ck && !items.length) || (ex && !ex.examId)) return;
    const cleaned = rules.map((r) => (r.type === 'checklist' ? { ...r, items } : r));
    const kept = statuses.filter((s) => s.id).map((s) => s.id!);
    await run(
      () =>
        onSaveStage(stage.id, {
          name: name.trim(),
          category,
          rules: cleaned,
          statuses: {
            add: statuses.filter((s) => !s.id).map((s) => s.name.trim()),
            rename: statuses.filter((s) => s.id && stage.statuses.find((o) => o.id === s.id)?.name !== s.name.trim()).map((s) => ({ id: s.id!, name: s.name.trim() })),
            remove: stage.statuses.filter((o) => !kept.includes(o.id)).map((o) => o.id),
          },
        }),
      `${name.trim()} saved.`,
    );
  };
  if (!canEdit)
    return (
      <Card title={`${index + 1}. ${stage.name}`}>
        <Text size="sm" tone="secondary">
          {KINDS.find((k) => k.value === stage.category)?.label} · {stage.statuses.map((x) => x.name).join(', ') || 'No statuses'} · {(stage.rules ?? []).length ? `${(stage.rules ?? []).length} entry rule(s)` : 'No entry rules'}
        </Text>
      </Card>
    );
  return (
    <Card
      title={`${index + 1}. ${stage.name}`}
      actions={
        <div className="yx-hire-actions">
          <IconButton icon={ArrowUp} label={`Move ${stage.name} up`} size="sm" onClick={() => void run(() => (index === 0 ? Promise.reject(new Error(`${stage.name} is already the first stage.`)) : onMoveStage(stage.id, neighbours[index - 1]!.position)))} />
          <IconButton icon={ArrowDown} label={`Move ${stage.name} down`} size="sm" onClick={() => void run(() => (index === total - 1 ? Promise.reject(new Error(`${stage.name} is already the last stage.`)) : onMoveStage(stage.id, neighbours[index + 1]!.position)))} />
          <ConfirmDialog
            trigger={<IconButton icon={Trash2} label={`Remove ${stage.name}`} size="sm" />}
            title={`Remove ${stage.name}?`}
            consequence="Only an empty stage can be removed."
            confirmLabel="Remove stage"
            destructive
            onConfirm={() => run(() => onRemoveStage(stage.id), `${stage.name} removed.`).then(() => undefined)}
          />
        </div>
      }
    >
      <div className="yx-hire-stack">
        <div className="yx-hire-actions">
          <FormField id={`pl-stage-${stage.id}`} label="Stage name" required error={tried && !name.trim() ? 'Name the stage.' : null}>
            <TextField value={name} onChange={setName} maxLength={200} />
          </FormField>
          <FormField label="Kind" helper="Offer, Hired and Not selected drive the board's columns and reports.">
            <Select<StageKind> value={category} onChange={(v) => v && setCategory(v)} options={KINDS} />
          </FormField>
        </div>
        <FormField label="Statuses inside this stage" helper="For example Scheduled and Done inside Interview.">
          <div className="yx-hire-stack">
            {statuses.map((s, k) => (
              <div key={s.id ?? `new-${k}`} className="yx-hire-actions">
                <TextField aria-label={`Status ${k + 1}`} value={s.name} onChange={(v) => setStatuses((xs) => xs.map((x, j) => (j === k ? { ...x, name: v } : x)))} maxLength={200} />
                <IconButton icon={Trash2} label={`Remove status ${s.name || k + 1}`} size="sm" onClick={() => setStatuses((xs) => xs.filter((_, j) => j !== k))} />
              </div>
            ))}
            {tried && statuses.some((s) => !s.name.trim()) && <Text size="sm" tone="danger">Name every status, or remove the empty one.</Text>}
            <Button size="sm" icon={Plus} onClick={() => setStatuses((xs) => [...xs, { id: null, name: '' }])}>
              Add status
            </Button>
          </div>
        </FormField>
        <FormField label="Before a candidate enters this stage" helper="The move is refused until these are met.">
          <div className="yx-hire-stack">
            <Switch label="Interview feedback is in" checked={Boolean(fb)} onChange={(on) => setRule('feedback', on ? { id: rid(), type: 'feedback', minCount: 1 } : null)} />
            {fb && (
              <div className="yx-hire-actions">
                <FormField label="At least this many" optional>
                  <NumberField value={fb.minCount ?? null} onChange={(v) => setRule('feedback', { ...fb, minCount: v ?? undefined })} min={1} max={20} />
                </FormField>
                <FormField label="Average rating at least" optional>
                  <NumberField value={fb.minAvgRating ?? null} onChange={(v) => setRule('feedback', { ...fb, minAvgRating: v ?? undefined })} min={1} max={5} decimals />
                </FormField>
                <Checkbox label="Each has a note" checked={Boolean(fb.requireNote)} onChange={(c) => setRule('feedback', { ...fb, requireNote: c })} />
              </div>
            )}
            <Switch label="A test is passed" checked={Boolean(ex)} onChange={(on) => setRule('exam_passed', on ? { id: rid(), type: 'exam_passed' } : null)} />
            {ex && (
              <div className="yx-hire-actions">
                <FormField label="Test" required error={tried && !ex.examId ? 'Choose the test.' : null}>
                  <Select value={ex.examId ?? null} onChange={(v) => setRule('exam_passed', { ...ex, examId: v ?? undefined })} options={tests} />
                </FormField>
                <FormField label="Score at least (%)" optional>
                  <NumberField value={ex.minScore ?? null} onChange={(v) => setRule('exam_passed', { ...ex, minScore: v ?? undefined })} min={0} max={100} />
                </FormField>
              </div>
            )}
            <Switch label="A checklist is ticked" checked={Boolean(ck)} onChange={(on) => setRule('checklist', on ? { id: rid(), type: 'checklist', items: [{ id: rid(), label: '' }] } : null)} />
            {ck && (
              <FormField label="Checklist items" required helper="One per line." error={tried && !ck.items.some((it) => it.label.trim()) ? 'Add at least one item.' : null}>
                <TextArea rows={3} value={ck.items.map((it) => it.label).join('\n')} onChange={(v) => setRule('checklist', { ...ck, items: v.split('\n').map((label, j) => ({ id: ck.items[j]?.id ?? rid(), label })) })} />
              </FormField>
            )}
          </div>
        </FormField>
        <div className="yx-hire-actions">
          <Button variant="primary" onClick={() => void save()}>
            Save {stage.name}
          </Button>
        </div>
      </div>
    </Card>
  );
}
