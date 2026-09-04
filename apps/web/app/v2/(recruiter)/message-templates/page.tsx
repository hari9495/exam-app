'use client';

// v2 Message Templates — shared DataTable + a v2 edit dialog. Format only, existing hooks
// (useMessageTemplates / useUpsertTemplate / useSetTemplateEnabled / useDeleteTemplate,
// useIntegrations for the SMTP banner). Inline Enabled toggle, kebab Edit / Restore default.
import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Pencil, RotateCcw, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../../../lib/auth-context';
import { useMessageTemplates, useUpsertTemplate, useSetTemplateEnabled, useDeleteTemplate } from '../../../../lib/hooks/useCandidateMessages';
import { usePipelines } from '../../../../lib/hooks/usePipelines';
import { useIntegrations } from '../../../../lib/hooks/useIntegrations';
import { type CandidateEmailTemplate, type Pipeline } from '../../../../lib/types';
import { DataTable, DT_FEATURES, dt, SortHead, Cb, Dropdown, DropdownItem, Dialog, TextField, Combobox, Button } from '../../../../components/ui-v2';
import { STATUS } from '../../../../components/ui-v2/viz';

const TRIGGER_MODE_OPTS = [{ value: 'manual', label: 'Manual only' }, { value: 'prompt', label: 'Prompt before sending' }, { value: 'auto', label: 'Send automatically' }];
const MERGE_TOKENS = ['candidateName', 'jobTitle', 'orgName', 'recruiterName', 'statusLink'];
const MODE_LABEL: Record<string, string> = { manual: 'Manual only', prompt: 'Prompt before sending', auto: 'Send automatically' };
// Stage NAMES that ship a built-in default (see apps/api/src/candidate-emails/default-templates.ts,
// keyed by name since defaults aren't stored per-org). A saved template whose triggerStageId
// resolves to one of these names can be "restored" to its built-in copy; anything else
// (manual-only, or a stage with no default) has nothing to fall back to, so it's a plain delete.
const DEFAULT_STAGE_NAMES = new Set(['applied', 'interview', 'offer', 'rejected']);

function stageNameMap(pipelines: Pipeline[] | undefined): Record<string, string> {
  return Object.fromEntries((pipelines ?? []).flatMap((p) => p.stages.map((s) => [s.id, s.name])));
}
function triggerEventLabel(stageId: string | null, stageNames: Record<string, string>): string {
  if (stageId === null) return 'None (manual only)';
  return stageNames[stageId] ?? 'Unknown stage';
}
function isRestoreEligible(stageId: string | null, stageNames: Record<string, string>): boolean {
  return stageId !== null && DEFAULT_STAGE_NAMES.has(stageNames[stageId] ?? '');
}

// A blank manual-only template for the "New template" flow (no id → the upsert creates a row;
// triggerStageId null keeps it manual-only, and the backend allows several of those).
const BLANK_TEMPLATE: CandidateEmailTemplate = { id: null, name: '', triggerStageId: null, triggerMode: 'manual', subject: '', body: '', enabled: true, isDefault: false };

// Trigger picker is two chained selects: pick a pipeline, then a stage within it (or "None" to
// stay manual-only) -- replaces the old flat PIPELINE_STAGES combobox now that stages are
// org-configured. The pipeline select only scopes which stages the second select offers; the
// saved value is always the stage id (or null), never the pipeline id.
function findPipelineIdForStage(pipelines: Pipeline[], stageId: string | null): string {
  const owner = stageId ? pipelines.find((p) => p.stages.some((s) => s.id === stageId)) : undefined;
  return owner?.id ?? pipelines.find((p) => p.isDefault)?.id ?? pipelines[0]?.id ?? '';
}

function EditTemplateDialog({ template, pipelines, isNew = false, onClose, onSaved }: { template: CandidateEmailTemplate; pipelines: Pipeline[]; isNew?: boolean; onClose: () => void; onSaved: () => void }) {
  const upsert = useUpsertTemplate();
  const [name, setName] = useState(template.name);
  const [pipelineId, setPipelineId] = useState(() => findPipelineIdForStage(pipelines, template.triggerStageId));
  const [triggerStageId, setTriggerStageId] = useState<string>(template.triggerStageId ?? 'none');
  const [triggerMode, setTriggerMode] = useState<string>(template.triggerMode);
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [error, setError] = useState<string | null>(null);
  const canSave = Boolean(name.trim() && subject.trim() && body.trim());
  const selectedPipeline = pipelines.find((p) => p.id === pipelineId);
  const stageOpts = [{ value: 'none', label: 'None (manual only)' }, ...(selectedPipeline?.stages.map((s) => ({ value: s.id, label: s.name })) ?? [])];

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) { setError('Name, subject, and body are required.'); return; }
    setError(null);
    upsert.mutate(
      { id: template.id ?? undefined, name: name.trim(), triggerStageId: triggerStageId === 'none' ? null : triggerStageId, triggerMode: triggerMode as 'manual' | 'prompt' | 'auto', subject: subject.trim(), body: body.trim() },
      { onSuccess: () => { onSaved(); onClose(); }, onError: (err) => setError(err instanceof Error ? err.message : 'Failed to save template.') },
    );
  }

  return (
    <Dialog open onClose={onClose} title={isNew ? 'New template' : `Edit "${template.name}"`} width={560}>
      <form onSubmit={handleSave}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <TextField id="tpl-name" label="Name" value={name} onChange={setName} required autoComplete="off" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div><label className="v2-label">Pipeline</label><Combobox options={pipelines.map((p) => ({ value: p.id, label: p.isDefault ? `${p.name} (default)` : p.name }))} value={pipelineId} onChange={(v) => { setPipelineId(v); setTriggerStageId('none'); }} width="100%" /></div>
            <div><label className="v2-label">Trigger stage</label><Combobox options={stageOpts} value={triggerStageId} onChange={setTriggerStageId} width="100%" /></div>
          </div>
          <div><label className="v2-label">Trigger mode</label><Combobox options={TRIGGER_MODE_OPTS} value={triggerMode} onChange={setTriggerMode} width="100%" /></div>
          <TextField id="tpl-subject" label="Subject" value={subject} onChange={setSubject} required autoComplete="off" />
          <div>
            <label htmlFor="tpl-body" className="v2-label">Body</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '2px 0 8px' }}>
              {MERGE_TOKENS.map((t) => (
                <button key={t} type="button" onClick={() => setBody((c) => `${c}{{${t}}}`)} style={{ fontSize: 11.5, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--hair)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>{`{{${t}}}`}</button>
              ))}
            </div>
            <textarea id="tpl-body" value={body} onChange={(e) => setBody(e.target.value)} rows={8} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
          </div>
        </div>
        {error && <p role="alert" style={{ marginTop: 12, fontSize: 12.5, color: 'var(--danger)' }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button type="button" onClick={onClose} className="v2-hoverbtn" style={dt.toolBtn}>Cancel</button>
          <Button type="submit" loading={upsert.isPending} disabled={!canSave}>Save</Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function V2MessageTemplatesPage() {
  const { role } = useAuth();
  const canManage = role !== 'panel';
  const { data: templates, isLoading, isError } = useMessageTemplates();
  const { data: integrations, isSuccess: integrationsLoaded } = useIntegrations();
  const { data: pipelines } = usePipelines();
  const stageNames = stageNameMap(pipelines);
  const setEnabled = useSetTemplateEnabled();
  const deleteTemplate = useDeleteTemplate();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<CandidateEmailTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };
  const showNoSmtpBanner = integrationsLoaded && integrations?.smtpConfigured === false;

  const q = search.trim().toLowerCase();
  const rows = q ? (templates ?? []).filter((t) => t.name.toLowerCase().includes(q)) : (templates ?? []);

  function handleToggleEnabled(t: CandidateEmailTemplate, next: boolean) {
    if (!t.id) return;
    setEnabled.mutate({ id: t.id, enabled: next }, { onError: (err) => notify('error', err instanceof Error ? err.message : 'Failed to update template.') });
  }
  function handleRestoreDefault(t: CandidateEmailTemplate) {
    if (!t.id) return;
    deleteTemplate.mutate(t.id, { onSuccess: () => notify('success', 'Restored to default.'), onError: (err) => notify('error', err instanceof Error ? err.message : 'Failed to restore default.') });
  }
  function handleDelete(t: CandidateEmailTemplate) {
    if (!t.id) return;
    deleteTemplate.mutate(t.id, { onSuccess: () => notify('success', 'Template deleted.'), onError: (err) => notify('error', err instanceof Error ? err.message : 'Failed to delete template.') });
  }

  const columns: ColumnDef<typeof DT_FEATURES, CandidateEmailTemplate>[] = [
    { accessorKey: 'name', enableHiding: false, header: ({ column }) => <SortHead label="Name" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{row.original.name}</span> },
    { id: 'event', enableSorting: false, header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Trigger event</span>, cell: ({ row }) => <span style={dt.muted}>{triggerEventLabel(row.original.triggerStageId, stageNames)}</span> },
    { id: 'mode', enableSorting: false, header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Trigger mode</span>, cell: ({ row }) => <span style={dt.muted}>{MODE_LABEL[row.original.triggerMode] ?? row.original.triggerMode}</span> },
    {
      id: 'enabled', enableSorting: false, header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Enabled</span>,
      cell: ({ row }) => <span style={{ opacity: row.original.id ? 1 : 0.45 }}><Cb checked={row.original.enabled} onChange={(v) => handleToggleEnabled(row.original, v)} /></span>,
    },
    {
      id: 'actions', enableSorting: false, enableHiding: false, header: () => null,
      cell: ({ row }) => (
        <Dropdown align="end" menuWidth={160} trigger={<span style={{ display: 'inline-grid', placeItems: 'center', width: 30, height: 30, color: 'var(--muted)', cursor: 'pointer' }}><MoreHorizontal size={17} /></span>}>
          {(close) => (<>
            <DropdownItem onClick={() => { close(); setEditing(row.original); }}><Pencil size={15} /> Edit</DropdownItem>
            {!row.original.isDefault && row.original.id && (
              isRestoreEligible(row.original.triggerStageId, stageNames)
                ? <DropdownItem onClick={() => { close(); handleRestoreDefault(row.original); }}><RotateCcw size={15} /> Restore default</DropdownItem>
                : <DropdownItem onClick={() => { close(); handleDelete(row.original); }}><Trash2 size={15} /> Delete</DropdownItem>
            )}
          </>)}
        </Dropdown>
      ),
    },
  ];

  if (!canManage) return <p style={{ fontSize: 13, color: 'var(--muted)' }}>You don&apos;t have access to this page.</p>;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div>
          <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Message Templates</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0', maxWidth: 620 }}>Control what candidates are emailed at each pipeline stage. Edit a default template to override it for your organization, or restore it to fall back to the built-in copy. Add a manual-only template for ad-hoc emails you send yourself.</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus size={15} /> New template</Button>
      </div>

      {showNoSmtpBanner && (
        <div style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: '1px solid color-mix(in srgb, #a16207 30%, transparent)', background: 'color-mix(in srgb, #a16207 8%, transparent)', color: '#a16207' }}>Candidate emails won&apos;t send until SMTP is configured in Organization settings.</div>
      )}
      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? STATUS.ok : 'var(--danger)' }}>{notice.text}</div>
      )}

      <DataTable
        columns={columns} data={rows} getRowId={(t) => t.id ?? `default-${t.triggerStageId ?? 'none'}`}
        search={search} onSearchChange={setSearch} searchPlaceholder="Search templates…"
        isLoading={isLoading} isError={isError} errorMessage="Failed to load templates." emptyMessage={q ? 'No matches.' : 'No templates.'}
        columnLabels={{ event: 'Trigger event', mode: 'Trigger mode', enabled: 'Enabled' }}
      />

      {editing && <EditTemplateDialog template={editing} pipelines={pipelines ?? []} onClose={() => setEditing(null)} onSaved={() => notify('success', 'Template saved.')} />}
      {creating && <EditTemplateDialog template={BLANK_TEMPLATE} pipelines={pipelines ?? []} isNew onClose={() => setCreating(false)} onSaved={() => notify('success', 'Template created.')} />}
    </>
  );
}
