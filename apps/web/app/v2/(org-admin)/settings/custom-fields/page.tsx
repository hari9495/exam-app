'use client';

// v2 Settings -> Custom Fields. Org-configurable extra fields on candidates/jobs -- define label,
// type, (for select) options, whether required, and (candidates only) whether it shows on the
// public apply form. Layout mirrors settings/pipelines/page.tsx (title+description header, card
// rows, org-primary tokens, inline success/error notice, Tabs to switch scope, Dialog for add/edit).
// Guarded the same way pipelines:configure is: org:manage_settings is org_admin-only, and
// role === 'org_admin' || actingSuperAdmin is the client-side proxy already used across the
// recruiter shell (see settings/pipelines/page.tsx's comment) since the recruiter route group
// doesn't gate entry by role.
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../../../../lib/auth-context';
import {
  useCustomFields, useCreateCustomField, useUpdateCustomField, useArchiveCustomField,
} from '../../../../../lib/hooks/useCustomFields';
import type { CustomFieldDefinition } from '../../../../../lib/types';
// Imported directly from their own files (not the ui-v2 barrel) -- the barrel re-exports
// DataTable, which pulls in @tanstack/react-table's ESM build and breaks under jest's CJS
// transform (see settings/pipelines/page.tsx's sibling test, which doesn't hit this because
// pipelines' own test file never renders this page). Direct imports dodge that entirely.
import { Button } from '../../../../../components/ui-v2/Button';
import { TextField } from '../../../../../components/ui-v2/TextField';
import { Combobox } from '../../../../../components/ui-v2/Combobox';
import { Dialog } from '../../../../../components/ui-v2/Dialog';
import { Tabs } from '../../../../../components/ui-v2/Tabs';

const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 2px rgba(11,18,32,.04), 0 12px 32px -18px rgba(11,18,32,.22)' };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };
const row: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: '1px solid var(--hair)' };
const dangerIconBtn: React.CSSProperties = { display: 'inline-grid', placeItems: 'center', width: 30, height: 30, borderRadius: 7, border: '1px solid color-mix(in srgb, var(--danger) 35%, var(--hair))', background: 'var(--paper)', color: 'var(--danger)', cursor: 'pointer' };

const FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Select' },
];

type Notice = { type: 'success' | 'error'; text: string } | null;
type EntityType = 'candidate' | 'job';

function byPosition(items: CustomFieldDefinition[]): CustomFieldDefinition[] {
  return [...items].sort((a, b) => a.position - b.position);
}

function FieldDialog({
  entityType, editing, onClose, notify,
}: { entityType: EntityType; editing: CustomFieldDefinition | null; onClose: () => void; notify: (type: 'success' | 'error', text: string) => void }) {
  const create = useCreateCustomField();
  const update = useUpdateCustomField();
  const [label, setLabel] = useState(editing?.label ?? '');
  const [fieldType, setFieldType] = useState<CustomFieldDefinition['fieldType']>(editing?.fieldType ?? 'text');
  const [optionsText, setOptionsText] = useState((editing?.options ?? []).join(', '));
  const [required, setRequired] = useState(editing?.required ?? false);
  const [showOnApply, setShowOnApply] = useState(editing?.showOnApply ?? false);
  const [error, setError] = useState<string | null>(null);
  const pending = create.isPending || update.isPending;

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) { setError('Label is required.'); return; }
    const options = fieldType === 'select' ? optionsText.split(',').map((o) => o.trim()).filter(Boolean) : undefined;
    if (fieldType === 'select' && (!options || options.length === 0)) { setError('A select field needs at least one option.'); return; }
    setError(null);

    const onSettled = {
      onSuccess: () => { notify('success', editing ? 'Field updated.' : 'Field added.'); onClose(); },
      onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Failed to save field.'),
    };
    if (editing) {
      update.mutate({ id: editing.id, entityType, label: label.trim(), options, required, showOnApply }, onSettled);
    } else {
      create.mutate({ entityType, label: label.trim(), fieldType, options, required, showOnApply }, onSettled);
    }
  }

  return (
    <Dialog open onClose={onClose} title={editing ? 'Edit field' : 'Add field'} width={440}>
      <form onSubmit={handleSave}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <TextField id="cf-label" label="Label" value={label} onChange={setLabel} required autoComplete="off" />
          <div>
            <label className="v2-label">Type</label>
            <Combobox options={FIELD_TYPE_OPTIONS} value={fieldType} onChange={(v) => setFieldType(v as CustomFieldDefinition['fieldType'])} width="100%" active={!editing} />
            {editing && <p style={{ ...desc, marginTop: 4 }}>Type can&apos;t be changed after a field is created.</p>}
          </div>
          {fieldType === 'select' && (
            <TextField id="cf-options" label="Options (comma-separated)" value={optionsText} onChange={setOptionsText} placeholder="Small, Medium, Large" autoComplete="off" />
          )}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} style={{ width: 15, height: 15, accentColor: 'var(--org-primary)' }} />
            Required
          </label>
          {entityType === 'candidate' && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
              <input type="checkbox" checked={showOnApply} onChange={(e) => setShowOnApply(e.target.checked)} style={{ width: 15, height: 15, accentColor: 'var(--org-primary)' }} />
              Show on public apply form
            </label>
          )}
        </div>
        {error && <p role="alert" style={{ marginTop: 10, fontSize: 12.5, color: 'var(--danger)' }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button type="button" onClick={onClose} className="v2-hoverbtn" style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--paper)', color: 'var(--ink)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <Button type="submit" loading={pending}>{editing ? 'Save' : 'Add field'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function FieldRow({ field, entityType, onEdit, notify }: { field: CustomFieldDefinition; entityType: EntityType; onEdit: () => void; notify: (type: 'success' | 'error', text: string) => void }) {
  const archive = useArchiveCustomField();

  function handleArchive() {
    archive.mutate({ id: field.id, entityType }, {
      onSuccess: () => notify('success', `${field.label} archived.`),
      onError: (err) => notify('error', err instanceof Error ? err.message : 'Failed to archive field.'),
    });
  }

  return (
    <div style={row}>
      <button type="button" onClick={onEdit} className="v2-hoverbtn" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', minWidth: 160, flex: '1 1 160px' }}>
        <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>{field.label}</span>
        <p style={desc}>
          {field.fieldType}
          {field.required ? ' · required' : ''}
          {entityType === 'candidate' && field.showOnApply ? ' · on apply form' : ''}
          {field.fieldType === 'select' && field.options ? ` · ${field.options.join(', ')}` : ''}
        </p>
      </button>
      <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
        <button type="button" style={dangerIconBtn} disabled={archive.isPending} onClick={handleArchive} aria-label={`Archive ${field.label}`}><Trash2 size={15} /></button>
      </div>
    </div>
  );
}

export default function V2CustomFieldsSettingsPage() {
  const { role, actingSuperAdmin } = useAuth();
  const canConfigure = role === 'org_admin' || actingSuperAdmin;
  const [entityType, setEntityType] = useState<EntityType>('candidate');
  const { data: fields, isLoading, isError } = useCustomFields(entityType);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CustomFieldDefinition | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  if (!canConfigure) return <p style={{ fontSize: 13, color: muted }}>You don&apos;t have access to this page.</p>;

  const sorted = fields ? byPosition(fields) : [];

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div>
          <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Custom Fields</h1>
          <p style={{ ...desc, marginTop: 6 }}>Add extra fields to capture on candidates or jobs.</p>
        </div>
        <Button onClick={() => setAdding(true)}><Plus size={15} /> Add field</Button>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? '#15803d' : 'var(--danger)' }}>
          {notice.text}
        </div>
      )}

      <Tabs
        tabs={[{ value: 'candidate', label: 'Candidate' }, { value: 'job', label: 'Job' }]}
        value={entityType}
        onChange={(v) => setEntityType(v as EntityType)}
      />

      <div style={card}>
        {isLoading && <p style={{ fontSize: 13, color: muted }}>Loading fields…</p>}
        {isError && <p style={{ fontSize: 13, color: 'var(--danger)' }}>Failed to load fields.</p>}
        {!isLoading && !isError && sorted.length === 0 && <p style={{ fontSize: 13, color: muted }}>No custom fields yet — add one to get started.</p>}
        {sorted.map((field) => (
          <FieldRow key={field.id} field={field} entityType={entityType} onEdit={() => setEditing(field)} notify={notify} />
        ))}
      </div>

      {adding && <FieldDialog entityType={entityType} editing={null} onClose={() => setAdding(false)} notify={notify} />}
      {editing && <FieldDialog entityType={entityType} editing={editing} onClose={() => setEditing(null)} notify={notify} />}
    </div>
  );
}
