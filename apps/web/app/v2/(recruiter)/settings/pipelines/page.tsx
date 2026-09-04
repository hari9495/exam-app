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
} from '../../../../../lib/hooks/usePipelines';
import type { Pipeline, PipelineStageConfig, PipelineStatus, StageCategory } from '../../../../../lib/types';
import { Button, TextField, Combobox, Dialog, Tabs, dt } from '../../../../../components/ui-v2';
import { STATUS } from '../../../../../components/ui-v2/viz';
import { swapAdjacent } from './reorder';

const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '18px 20px' };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };
const row: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10, padding: '12px 0', borderBottom: '1px solid var(--hair)' };
const iconBtn: React.CSSProperties = { display: 'inline-grid', placeItems: 'center', width: 30, height: 30, borderRadius: 7, border: '1px solid var(--hair)', background: 'var(--paper)', color: 'var(--ink)', cursor: 'pointer' };
const dangerIconBtn: React.CSSProperties = { ...iconBtn, color: 'var(--danger)', borderColor: 'color-mix(in srgb, var(--danger) 35%, var(--hair))' };

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
          <button type="button" onClick={onClose} className="v2-hoverbtn" style={dt.toolBtn}>Cancel</button>
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
  const statuses = byPosition(stage.statuses);

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
