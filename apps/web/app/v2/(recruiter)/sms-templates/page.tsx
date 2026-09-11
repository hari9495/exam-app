'use client';

// SMS templates editor (Zoho #16) -- mirrors message-templates/page.tsx (the email templates
// editor) exactly, minus the subject field. New file: deep-imports ui-v2 (no barrel), unlike the
// email page it mirrors.
import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Pencil, RotateCcw, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../../../lib/auth-context';
import { useSmsTemplates, useUpsertSmsTemplate, useSetSmsTemplateEnabled, useDeleteSmsTemplate } from '../../../../lib/hooks/useSmsTemplates';
import { usePipelines } from '../../../../lib/hooks/usePipelines';
import { useSmsConfig } from '../../../../lib/hooks/useSmsConfig';
import { type CandidateSmsTemplate, type Pipeline } from '../../../../lib/types';
import { DataTable, DT_FEATURES } from '../../../../components/ui-v2/DataTable';
import { dt, SortHead, Cb } from '../../../../components/ui-v2/DataTable';
import { Dropdown, DropdownItem } from '../../../../components/ui-v2/Dropdown';
import { Dialog } from '../../../../components/ui-v2/Dialog';
import { TextField } from '../../../../components/ui-v2/TextField';
import { Combobox } from '../../../../components/ui-v2/Combobox';
import { Button } from '../../../../components/ui-v2/Button';
import { STATUS } from '../../../../components/ui-v2/viz';

const TRIGGER_MODE_OPTS = [{ value: 'manual', label: 'Manual only' }, { value: 'prompt', label: 'Prompt before sending' }, { value: 'auto', label: 'Send automatically' }];
const MERGE_TOKENS = ['candidateName', 'jobTitle', 'orgName', 'recruiterName'];
const MODE_LABEL: Record<string, string> = { manual: 'Manual only', prompt: 'Prompt before sending', auto: 'Send automatically' };
// Stage NAMES that ship a built-in default (see apps/api/src/candidate-sms/default-sms-templates.ts,
// keyed by name since defaults aren't stored per-org) -- same set as the email templates page.
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

// A blank manual-only template for the "New template" flow.
const BLANK_TEMPLATE: CandidateSmsTemplate = { id: null, name: '', triggerStageId: null, triggerMode: 'manual', body: '', enabled: true, isDefault: false };

// Trigger picker is two chained selects: pick a pipeline, then a stage within it (or "None") --
// same as the email editor's findPipelineIdForStage.
function findPipelineIdForStage(pipelines: Pipeline[], stageId: string | null): string {
  const owner = stageId ? pipelines.find((p) => p.stages.some((s) => s.id === stageId)) : undefined;
  return owner?.id ?? pipelines.find((p) => p.isDefault)?.id ?? pipelines[0]?.id ?? '';
}

function EditSmsTemplateDialog({ template, pipelines, isNew = false, onClose, onSaved }: { template: CandidateSmsTemplate; pipelines: Pipeline[]; isNew?: boolean; onClose: () => void; onSaved: () => void }) {
  const upsert = useUpsertSmsTemplate();
  const [name, setName] = useState(template.name);
  const [pipelineId, setPipelineId] = useState(() => findPipelineIdForStage(pipelines, template.triggerStageId));
  const [triggerStageId, setTriggerStageId] = useState<string>(template.triggerStageId ?? 'none');
  const [triggerMode, setTriggerMode] = useState<string>(template.triggerMode);
  const [body, setBody] = useState(template.body);
  const [error, setError] = useState<string | null>(null);
  const canSave = Boolean(name.trim() && body.trim());
  const selectedPipeline = pipelines.find((p) => p.id === pipelineId);
  const stageOpts = [{ value: 'none', label: 'None (manual only)' }, ...(selectedPipeline?.stages.map((s) => ({ value: s.id, label: s.name })) ?? [])];

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) { setError('Name and body are required.'); return; }
    setError(null);
    upsert.mutate(
      { id: template.id ?? undefined, name: name.trim(), triggerStageId: triggerStageId === 'none' ? null : triggerStageId, triggerMode: triggerMode as 'manual' | 'prompt' | 'auto', body: body.trim() },
      { onSuccess: () => { onSaved(); onClose(); }, onError: (err) => setError(err instanceof Error ? err.message : 'Failed to save template.') },
    );
  }

  return (
    <Dialog open onClose={onClose} title={isNew ? 'New SMS template' : `Edit "${template.name}"`} width={560}>
      <form onSubmit={handleSave}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <TextField id="sms-tpl-name" label="Name" value={name} onChange={setName} required autoComplete="off" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div><label className="v2-label">Pipeline</label><Combobox options={pipelines.map((p) => ({ value: p.id, label: p.isDefault ? `${p.name} (default)` : p.name }))} value={pipelineId} onChange={(v) => { setPipelineId(v); setTriggerStageId('none'); }} width="100%" /></div>
            <div><label className="v2-label">Trigger stage</label><Combobox options={stageOpts} value={triggerStageId} onChange={setTriggerStageId} width="100%" /></div>
          </div>
          <div><label className="v2-label">Trigger mode</label><Combobox options={TRIGGER_MODE_OPTS} value={triggerMode} onChange={setTriggerMode} width="100%" /></div>
          <div>
            <label htmlFor="sms-tpl-body" className="v2-label">Body</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '2px 0 8px' }}>
              {MERGE_TOKENS.map((t) => (
                <button key={t} type="button" onClick={() => setBody((c) => `${c}{{${t}}}`)} style={{ fontSize: 11.5, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--hair)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>{`{{${t}}}`}</button>
              ))}
            </div>
            <textarea id="sms-tpl-body" value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={1600} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
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

export default function V2SmsTemplatesPage() {
  const { role } = useAuth();
  const canManage = role !== 'panel';
  const { data: templates, isLoading, isError } = useSmsTemplates();
  const { data: smsConfig, isSuccess: smsConfigLoaded } = useSmsConfig();
  const { data: pipelines } = usePipelines();
  const stageNames = stageNameMap(pipelines);
  const setEnabled = useSetSmsTemplateEnabled();
  const deleteTemplate = useDeleteSmsTemplate();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<CandidateSmsTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };
  const showNoSmsBanner = smsConfigLoaded && (smsConfig?.configured === false || smsConfig?.smsEnabled === false);

  const q = search.trim().toLowerCase();
  const rows = q ? (templates ?? []).filter((t) => t.name.toLowerCase().includes(q)) : (templates ?? []);

  function handleToggleEnabled(t: CandidateSmsTemplate, next: boolean) {
    if (!t.id) return;
    setEnabled.mutate({ id: t.id, enabled: next }, { onError: (err) => notify('error', err instanceof Error ? err.message : 'Failed to update template.') });
  }
  function handleRestoreDefault(t: CandidateSmsTemplate) {
    if (!t.id) return;
    deleteTemplate.mutate(t.id, { onSuccess: () => notify('success', 'Restored to default.'), onError: (err) => notify('error', err instanceof Error ? err.message : 'Failed to restore default.') });
  }
  function handleDelete(t: CandidateSmsTemplate) {
    if (!t.id) return;
    deleteTemplate.mutate(t.id, { onSuccess: () => notify('success', 'Template deleted.'), onError: (err) => notify('error', err instanceof Error ? err.message : 'Failed to delete template.') });
  }

  const columns: ColumnDef<typeof DT_FEATURES, CandidateSmsTemplate>[] = [
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
          <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>SMS Templates</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0', maxWidth: 620 }}>Control what candidates are texted at each pipeline stage. Edit a default template to override it for your organization, or restore it to fall back to the built-in copy. Add a manual-only template for ad-hoc texts you send yourself.</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus size={15} /> New template</Button>
      </div>

      {showNoSmsBanner && (
        <div style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: '1px solid color-mix(in srgb, #a16207 30%, transparent)', background: 'color-mix(in srgb, #a16207 8%, transparent)', color: '#a16207' }}>Candidate SMS won&apos;t send until Twilio is configured and enabled in Organization settings.</div>
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

      {editing && <EditSmsTemplateDialog template={editing} pipelines={pipelines ?? []} onClose={() => setEditing(null)} onSaved={() => notify('success', 'Template saved.')} />}
      {creating && <EditSmsTemplateDialog template={BLANK_TEMPLATE} pipelines={pipelines ?? []} isNew onClose={() => setCreating(false)} onSaved={() => notify('success', 'Template created.')} />}
    </>
  );
}
