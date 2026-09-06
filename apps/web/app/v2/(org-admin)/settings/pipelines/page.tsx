'use client';

// v2 Settings -> Pipelines. Configure named hiring pipelines: which stages exist, each stage's
// category (drives board grouping + the flat-stage mapping until Task 11 migrates the board off
// it), and the statuses within a stage. Layout mirrors settings/approvals/page.tsx (title +
// description header, card sections, org-primary tokens, inline success/error notice) and the
// list+dialog pattern from message-templates/page.tsx (Tabs to pick a pipeline, a Dialog to name a
// new one). Guarded the same way approvals:configure is: pipelines:configure is org_admin-only
// (see apps/api/prisma/seed.ts), and role === 'org_admin' || actingSuperAdmin is the client-side
// proxy for that already used across the recruiter shell (see CreateOfferModal's offerGateOn
// comment) since the recruiter route group -- unlike (org-admin) -- doesn't gate entry by role.
import { useEffect, useState } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { useAuth } from '../../../../../lib/auth-context';
import {
  usePipelines, useCreatePipeline, useDeletePipeline,
  useCreateStage, useUpdateStage, useDeleteStage,
  useCreateStatus, useUpdateStatus, useDeleteStatus,
  useOrgPipelineSettings, useUpdateOrgPipelineSettings,
} from '../../../../../lib/hooks/usePipelines';
import { useExams } from '../../../../../lib/hooks/useExams';
import type { BlueprintRule, Pipeline, PipelineStageConfig, PipelineStatus, StageCategory } from '../../../../../lib/types';
// Import each ui-v2 component from its own file rather than the barrel (components/ui-v2/index.ts)
// -- the barrel re-exports DataTable, which imports the ESM-only @tanstack/react-table and blows
// up under jest ("Cannot use import statement outside a module") the moment anything requires it,
// even if this file never touches DataTable/dt itself.
import { Button } from '../../../../../components/ui-v2/Button';
import { TextField } from '../../../../../components/ui-v2/TextField';
import { Combobox } from '../../../../../components/ui-v2/Combobox';
import { Dialog } from '../../../../../components/ui-v2/Dialog';
import { Tabs } from '../../../../../components/ui-v2/Tabs';
import { STATUS } from '../../../../../components/ui-v2/viz';
import { swapAdjacent } from './reorder';

const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '18px 20px' };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };
const row: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10, padding: '12px 0', borderBottom: '1px solid var(--hair)' };
const iconBtn: React.CSSProperties = { display: 'inline-grid', placeItems: 'center', width: 30, height: 30, borderRadius: 7, border: '1px solid var(--hair)', background: 'var(--paper)', color: 'var(--ink)', cursor: 'pointer' };
const dangerIconBtn: React.CSSProperties = { ...iconBtn, color: 'var(--danger)', borderColor: 'color-mix(in srgb, var(--danger) 35%, var(--hair))' };
// Copy of DataTable's dt.toolBtn -- kept as a literal (rather than importing `dt`) for the same
// DataTable/react-table jest-ESM reason as the import block above.
const toolBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '9px 14px', borderRadius: 9, border: '1px solid var(--org-primary)', background: 'var(--paper)', color: 'var(--org-primary)', cursor: 'pointer', boxShadow: '0 1px 2px rgba(11,18,32,.08)' };

const CATEGORY_OPTIONS: { value: StageCategory; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'offer', label: 'Offer' },
  { value: 'hired', label: 'Hired' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'archived', label: 'Archived' },
];

type Notice = { type: 'success' | 'error'; text: string } | null;

function byPosition<T extends { position: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position);
}

function NewPipelineDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Pipeline) => void }) {
  const create = useCreatePipeline();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    setError(null);
    create.mutate(
      { name: name.trim() },
      {
        onSuccess: (p) => { onCreated(p); onClose(); },
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create pipeline.'),
      },
    );
  }

  return (
    <Dialog open onClose={onClose} title="New pipeline" width={420}>
      <form onSubmit={handleSave}>
        <TextField id="pipeline-name" label="Name" value={name} onChange={setName} required autoComplete="off" />
        {error && <p role="alert" style={{ marginTop: 10, fontSize: 12.5, color: 'var(--danger)' }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button type="button" onClick={onClose} className="v2-hoverbtn" style={toolBtnStyle}>Cancel</button>
          <Button type="submit" loading={create.isPending}>Create</Button>
        </div>
      </form>
    </Dialog>
  );
}

function StatusRow({ status, index, total, onMove, onRename, onDelete }: {
  status: PipelineStatus; index: number; total: number;
  onMove: (direction: 'up' | 'down') => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(status.name);
  useEffect(() => setName(status.name), [status.name]);

  return (
    <div style={{ ...row, paddingLeft: 8, borderBottom: '1px solid color-mix(in srgb, var(--ink) 6%, var(--hair))' }}>
      {/* TextField has no onBlur prop -- React's blur handling bubbles via the native focusout
          event, so wrapping in a div and listening there catches the input losing focus without
          touching the shared primitive. */}
      <div style={{ minWidth: 160, flex: '1 1 160px' }} onBlur={() => { if (name.trim() && name !== status.name) onRename(name.trim()); }}>
        <TextField id={`status-name-${status.id}`} label="Status" value={name} onChange={setName} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
        <button type="button" style={iconBtn} disabled={index === 0} onClick={() => onMove('up')} aria-label="Move status up"><ChevronUp size={15} /></button>
        <button type="button" style={iconBtn} disabled={index === total - 1} onClick={() => onMove('down')} aria-label="Move status down"><ChevronDown size={15} /></button>
        <button type="button" style={dangerIconBtn} onClick={onDelete} aria-label="Delete status"><Trash2 size={15} /></button>
      </div>
    </div>
  );
}

function newRule(type: BlueprintRule['type']): BlueprintRule {
  const id = crypto.randomUUID();
  switch (type) {
    case 'checklist': return { id, type, items: [] };
    case 'exam_passed': return { id, type };
    default: return { id, type: 'feedback' };
  }
}

const ruleTypeLabel: Record<BlueprintRule['type'], string> = {
  feedback: 'Feedback', exam_passed: 'Exam passed', checklist: 'Checklist',
};

// One rule's inputs, keyed by its discriminated `type`. examOptions is the org's published exams
// (see StageCard) for the exam_passed picker -- a plain text input would also satisfy the brief,
// but that list is one hook call away here, same as AdvanceToNextRoundModal's exam picker.
function RuleEditor({ rule, examOptions, onChange, onRemove }: {
  rule: BlueprintRule;
  examOptions: { value: string; label: string }[];
  onChange: (next: BlueprintRule) => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ border: '1px solid var(--hair)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{ruleTypeLabel[rule.type]}</span>
        <button type="button" style={dangerIconBtn} onClick={onRemove} aria-label="Remove requirement"><Trash2 size={14} /></button>
      </div>

      {rule.type === 'feedback' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ width: 150 }}>
            <TextField
              id={`rule-${rule.id}-min-count`} label="Min feedback count" type="number"
              value={rule.minCount == null ? '' : String(rule.minCount)}
              onChange={(v) => onChange({ ...rule, minCount: v === '' ? undefined : Number(v) })}
            />
          </div>
          <div style={{ width: 150 }}>
            <TextField
              id={`rule-${rule.id}-min-avg`} label="Min avg rating" type="number"
              value={rule.minAvgRating == null ? '' : String(rule.minAvgRating)}
              onChange={(v) => onChange({ ...rule, minAvgRating: v === '' ? undefined : Number(v) })}
            />
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--ink)', paddingBottom: 8 }}>
            <input
              type="checkbox" checked={!!rule.requireNote}
              onChange={(e) => onChange({ ...rule, requireNote: e.target.checked })}
              style={{ width: 14, height: 14, accentColor: 'var(--org-primary)' }}
            />
            Require note
          </label>
        </div>
      )}

      {rule.type === 'exam_passed' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <div>
            <label className="v2-label">Exam</label>
            <Combobox options={examOptions} value={rule.examId ?? ''} onChange={(v) => onChange({ ...rule, examId: v || undefined })} placeholder="Any exam" width={220} />
          </div>
          <div style={{ width: 130 }}>
            <TextField
              id={`rule-${rule.id}-min-score`} label="Min score %" type="number"
              value={rule.minScore == null ? '' : String(rule.minScore)}
              onChange={(v) => onChange({ ...rule, minScore: v === '' ? undefined : Number(v) })}
            />
          </div>
        </div>
      )}

      {rule.type === 'checklist' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rule.items.map((item, i) => (
            <div key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <TextField
                  id={`rule-${rule.id}-item-${item.id}`} label={`Item ${i + 1}`} value={item.label}
                  onChange={(v) => onChange({ ...rule, items: rule.items.map((it) => (it.id === item.id ? { ...it, label: v } : it)) })}
                />
              </div>
              <button
                type="button" style={dangerIconBtn} aria-label="Remove item"
                onClick={() => onChange({ ...rule, items: rule.items.filter((it) => it.id !== item.id) })}
              ><Trash2 size={14} /></button>
            </div>
          ))}
          <button
            type="button" className="v2-hoverbtn" style={{ ...toolBtnStyle, alignSelf: 'flex-start', padding: '5px 10px', fontSize: 12 }}
            onClick={() => onChange({ ...rule, items: [...rule.items, { id: crypto.randomUUID(), label: '' }] })}
          >
            <Plus size={12} /> Add item
          </button>
        </div>
      )}
    </div>
  );
}

function StageCard({ stage, index, total, onMove, onRename, onCategoryChange, onDelete, notifyError }: {
  stage: PipelineStageConfig; index: number; total: number;
  onMove: (direction: 'up' | 'down') => void;
  onRename: (name: string) => void;
  onCategoryChange: (category: StageCategory) => void;
  onDelete: () => void;
  notifyError: (text: string) => void;
}) {
  const [name, setName] = useState(stage.name);
  useEffect(() => setName(stage.name), [stage.name]);
  const updateStatus = useUpdateStatus();
  const deleteStatus = useDeleteStatus();
  const createStatus = useCreateStatus();
  const updateStage = useUpdateStage();
  const statuses = byPosition(stage.statuses);

  const [rulesOpen, setRulesOpen] = useState(false);
  const [rules, setRules] = useState<BlueprintRule[]>(stage.rules ?? []);
  const [rulesDirty, setRulesDirty] = useState(false);
  useEffect(() => { setRules(stage.rules ?? []); setRulesDirty(false); }, [stage.rules]);

  // exam_passed rules can reference a published exam -- reuses the picker pattern/cap from
  // AdvanceToNextRoundModal (pageSize:100 is the server's max page size).
  const { data: examsResponse } = useExams('published', { pageSize: 100 });
  const examOptions = (examsResponse?.data ?? []).map((exam) => ({ value: exam.id, label: exam.title }));

  function updateRule(ruleId: string, next: BlueprintRule) {
    setRules((prev) => prev.map((r) => (r.id === ruleId ? next : r)));
    setRulesDirty(true);
  }
  function removeRule(ruleId: string) {
    setRules((prev) => prev.filter((r) => r.id !== ruleId));
    setRulesDirty(true);
  }
  function addRule(type: BlueprintRule['type']) {
    setRules((prev) => [...prev, newRule(type)]);
    setRulesDirty(true);
  }
  function handleSaveRules() {
    updateStage.mutate(
      { stageId: stage.id, rules },
      { onSuccess: () => setRulesDirty(false), onError: (err) => notifyError(err instanceof Error ? err.message : 'Failed to save requirements.') },
    );
  }

  function handleMoveStatus(sIndex: number, direction: 'up' | 'down') {
    const pair = swapAdjacent(statuses, sIndex, direction);
    if (!pair) return;
    const [a, b] = pair;
    updateStatus.mutate({ statusId: a.id, position: b.position }, { onError: (err) => notifyError(err instanceof Error ? err.message : 'Failed to reorder status.') });
    updateStatus.mutate({ statusId: b.id, position: a.position }, { onError: (err) => notifyError(err instanceof Error ? err.message : 'Failed to reorder status.') });
  }

  function handleAddStatus() {
    createStatus.mutate(
      { stageId: stage.id, name: 'New status', position: statuses.length },
      { onError: (err) => notifyError(err instanceof Error ? err.message : 'Failed to add status.') },
    );
  }

  return (
    <div style={card}>
      <div style={row}>
        <div style={{ minWidth: 200, flex: '1 1 200px' }} onBlur={() => { if (name.trim() && name !== stage.name) onRename(name.trim()); }}>
          <TextField id={`stage-name-${stage.id}`} label="Stage" value={name} onChange={setName} />
        </div>
        <div>
          <label className="v2-label">Category</label>
          <Combobox options={CATEGORY_OPTIONS} value={stage.category} onChange={(v) => onCategoryChange(v as StageCategory)} width={160} />
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <button type="button" style={iconBtn} disabled={index === 0} onClick={() => onMove('up')} aria-label="Move stage up"><ChevronUp size={15} /></button>
          <button type="button" style={iconBtn} disabled={index === total - 1} onClick={() => onMove('down')} aria-label="Move stage down"><ChevronDown size={15} /></button>
          <button type="button" style={dangerIconBtn} onClick={onDelete} aria-label="Delete stage"><Trash2 size={15} /></button>
        </div>
      </div>

      <div style={{ marginTop: 4 }}>
        {statuses.length === 0 && <p style={{ fontSize: 12.5, color: muted, margin: '10px 0 0' }}>No statuses yet — add one below.</p>}
        {statuses.map((s, i) => (
          <StatusRow
            key={s.id} status={s} index={i} total={statuses.length}
            onMove={(direction) => handleMoveStatus(i, direction)}
            onRename={(newName) => updateStatus.mutate({ statusId: s.id, name: newName }, { onError: (err) => notifyError(err instanceof Error ? err.message : 'Failed to rename status.') })}
            onDelete={() => deleteStatus.mutate(s.id, { onError: (err) => notifyError(err instanceof Error ? err.message : 'Failed to delete status.') })}
          />
        ))}
        <button
          type="button" className="v2-hoverbtn" onClick={handleAddStatus}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12.5, fontWeight: 500, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--org-primary)', background: 'var(--paper)', color: 'var(--org-primary)', cursor: 'pointer' }}
        >
          <Plus size={13} /> Add status
        </button>
      </div>

      <div style={{ marginTop: 14, borderTop: '1px solid var(--hair)', paddingTop: 12 }}>
        <button
          type="button" onClick={() => setRulesOpen((o) => !o)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          {rulesOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          Requirements{rules.length > 0 ? ` (${rules.length})` : ''}
        </button>

        {rulesOpen && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rules.length === 0 && (
              <p style={{ fontSize: 12.5, color: muted, margin: 0 }}>No requirements — candidates can advance from this stage freely.</p>
            )}
            {rules.map((rule) => (
              <RuleEditor
                key={rule.id} rule={rule} examOptions={examOptions}
                onChange={(next) => updateRule(rule.id, next)}
                onRemove={() => removeRule(rule.id)}
              />
            ))}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="v2-hoverbtn" style={{ ...toolBtnStyle, padding: '6px 12px', fontSize: 12.5 }} onClick={() => addRule('feedback')}>
                <Plus size={13} /> Feedback
              </button>
              <button type="button" className="v2-hoverbtn" style={{ ...toolBtnStyle, padding: '6px 12px', fontSize: 12.5 }} onClick={() => addRule('exam_passed')}>
                <Plus size={13} /> Exam passed
              </button>
              <button type="button" className="v2-hoverbtn" style={{ ...toolBtnStyle, padding: '6px 12px', fontSize: 12.5 }} onClick={() => addRule('checklist')}>
                <Plus size={13} /> Checklist
              </button>
            </div>
            {rulesDirty && (
              <div>
                <Button onClick={handleSaveRules} loading={updateStage.isPending}>Save requirements</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PipelineEditor({ pipeline, notifyError }: { pipeline: Pipeline; notifyError: (text: string) => void }) {
  const updateStage = useUpdateStage();
  const deleteStage = useDeleteStage();
  const createStage = useCreateStage();
  const stages = byPosition(pipeline.stages);

  function handleMoveStage(index: number, direction: 'up' | 'down') {
    const pair = swapAdjacent(stages, index, direction);
    if (!pair) return;
    const [a, b] = pair;
    updateStage.mutate({ stageId: a.id, position: b.position }, { onError: (err) => notifyError(err instanceof Error ? err.message : 'Failed to reorder stage.') });
    updateStage.mutate({ stageId: b.id, position: a.position }, { onError: (err) => notifyError(err instanceof Error ? err.message : 'Failed to reorder stage.') });
  }

  function handleAddStage() {
    createStage.mutate(
      { pipelineId: pipeline.id, name: 'New stage', category: 'active', position: stages.length },
      { onError: (err) => notifyError(err instanceof Error ? err.message : 'Failed to add stage.') },
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {stages.length === 0 && <p style={{ fontSize: 13, color: muted, margin: 0 }}>No stages yet — add one below.</p>}
      {stages.map((stage, i) => (
        <StageCard
          key={stage.id} stage={stage} index={i} total={stages.length}
          onMove={(direction) => handleMoveStage(i, direction)}
          onRename={(name) => updateStage.mutate({ stageId: stage.id, name }, { onError: (err) => notifyError(err instanceof Error ? err.message : 'Failed to rename stage.') })}
          onCategoryChange={(category) => updateStage.mutate({ stageId: stage.id, category }, { onError: (err) => notifyError(err instanceof Error ? err.message : 'Failed to update category.') })}
          onDelete={() => deleteStage.mutate(stage.id, { onError: (err) => notifyError(err instanceof Error ? err.message : 'Failed to delete stage.') })}
          notifyError={notifyError}
        />
      ))}
      <div>
        <Button onClick={handleAddStage} loading={createStage.isPending}><Plus size={15} /> Add stage</Button>
      </div>
    </div>
  );
}

// Defaults to checked while the setting is still loading -- the org column itself defaults
// to true (see Task 8's OrganizationsService.getPipelineSettings), so this avoids a flash of
// "off" for the common case.
function AutoArchiveToggle({ notifyError }: { notifyError: (text: string) => void }) {
  const { data } = useOrgPipelineSettings();
  const update = useUpdateOrgPipelineSettings();
  const checked = data?.autoArchiveSiblingsOnHire ?? true;

  function toggle(next: boolean) {
    update.mutate({ autoArchiveSiblingsOnHire: next }, {
      onError: (err) => notifyError(err instanceof Error ? err.message : 'Failed to update setting.'),
    });
  }

  return (
    <div style={{ ...card, marginBottom: 16 }}>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--ink)', cursor: update.isPending ? 'not-allowed' : 'pointer' }}>
        <input
          type="checkbox" checked={checked} disabled={update.isPending}
          onChange={(e) => toggle(e.target.checked)}
          style={{ width: 15, height: 15, accentColor: 'var(--org-primary)' }}
        />
        Auto-archive other applications when a candidate is hired
      </label>
      <p style={desc}>When a candidate is hired for one job, their other open pipeline entries are archived automatically.</p>
    </div>
  );
}

export default function V2PipelinesSettingsPage() {
  const { role, actingSuperAdmin } = useAuth();
  const canConfigure = role === 'org_admin' || actingSuperAdmin;
  const { data: pipelines, isLoading, isError } = usePipelines();
  const deletePipeline = useDeletePipeline();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  useEffect(() => {
    if (!pipelines || pipelines.length === 0) return;
    if (!selectedId || !pipelines.some((p) => p.id === selectedId)) setSelectedId(pipelines[0].id);
  }, [pipelines, selectedId]);

  if (!canConfigure) return <p style={{ fontSize: 13, color: muted }}>You don&apos;t have access to this page.</p>;

  const selected = pipelines?.find((p) => p.id === selectedId) ?? null;

  function handleDeletePipeline() {
    if (!selected) return;
    deletePipeline.mutate(selected.id, {
      onSuccess: () => notify('success', `${selected.name} deleted.`),
      onError: (err) => notify('error', err instanceof Error ? err.message : 'Failed to delete pipeline.'),
    });
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div>
          <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Pipelines</h1>
          <p style={{ ...desc, marginTop: 6 }}>Configure the stages and statuses candidates move through for each hiring pipeline.</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus size={15} /> New pipeline</Button>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? STATUS.ok : 'var(--danger)' }}>
          {notice.text}
        </div>
      )}

      <AutoArchiveToggle notifyError={(text) => notify('error', text)} />

      {isLoading && <p style={{ fontSize: 13, color: muted }}>Loading pipelines…</p>}
      {isError && <p style={{ fontSize: 13, color: 'var(--danger)' }}>Failed to load pipelines.</p>}
      {!isLoading && !isError && (!pipelines || pipelines.length === 0) && <p style={{ fontSize: 13, color: muted }}>No pipelines yet — create one to get started.</p>}

      {pipelines && pipelines.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Tabs
                tabs={pipelines.map((p) => ({ value: p.id, label: p.isDefault ? `${p.name} (default)` : p.name }))}
                value={selectedId ?? pipelines[0].id}
                onChange={setSelectedId}
              />
            </div>
            {selected && (
              <button
                type="button" style={dangerIconBtn} disabled={selected.isDefault || deletePipeline.isPending}
                title={selected.isDefault ? "The default pipeline can't be deleted" : 'Delete pipeline'}
                onClick={handleDeletePipeline} aria-label="Delete pipeline"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>

          {selected && <PipelineEditor key={selected.id} pipeline={selected} notifyError={(text) => notify('error', text)} />}
        </>
      )}

      {creating && <NewPipelineDialog onClose={() => setCreating(false)} onCreated={(p) => { setSelectedId(p.id); notify('success', 'Pipeline created.'); }} />}
    </div>
  );
}
