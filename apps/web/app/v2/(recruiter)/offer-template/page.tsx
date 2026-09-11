'use client';

// v2 Offer Templates — list of named templates (Create/Edit/Delete/Make default) replacing the
// old single-editor page. Layout/gate conventions mirror settings/user-groups/page.tsx (card list +
// inline Dialog form, org-primary tokens, inline success/error notice). Imports Button/TextField/
// Dialog directly from their files rather than the ui-v2 barrel -- the barrel re-exports DataTable,
// which pulls in @tanstack/react-table (ESM-only) and breaks under jest.
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../../../lib/auth-context';
import {
  useOfferTemplates, useCreateOfferTemplate, useUpdateOfferTemplate, useDeleteOfferTemplate,
} from '../../../../lib/hooks/useOffers';
import type { OfferTemplate } from '../../../../lib/types';
import { Button } from '../../../../components/ui-v2/Button';
import { TextField } from '../../../../components/ui-v2/TextField';
import { Dialog } from '../../../../components/ui-v2/Dialog';

const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '16px 20px', marginBottom: 12, boxShadow: '0 1px 2px rgba(11,18,32,.04), 0 12px 32px -18px rgba(11,18,32,.22)' };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '6px 0 0' };
const dangerIconBtn: React.CSSProperties = { display: 'inline-grid', placeItems: 'center', width: 30, height: 30, borderRadius: 7, border: '1px solid color-mix(in srgb, var(--danger) 35%, var(--hair))', background: 'var(--paper)', color: 'var(--danger)', cursor: 'pointer' };
// Canonical secondary button (values match components/ui-v2/DataTable.tsx's `dt.toolBtn` exactly).
// Not imported directly: `dt` is defined in DataTable.tsx, which pulls in @tanstack/react-table
// (ESM-only) at module scope, so even a deep import of just `dt` would execute that import and
// break under jest -- see this file's top-of-file note on avoiding the ui-v2 barrel.
const secondaryBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '9px 14px', borderRadius: 9, border: '1px solid var(--org-primary)', background: 'var(--paper)', color: 'var(--org-primary)', cursor: 'pointer', boxShadow: '0 1px 2px rgba(11,18,32,.08)' };
const badge: React.CSSProperties = { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: 'color-mix(in srgb, #15803d 12%, transparent)', color: '#15803d' };
const bodyInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 };

type Notice = { type: 'success' | 'error'; text: string } | null;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function TemplateFormDialog({ template, onClose, notify }: { template?: OfferTemplate; onClose: () => void; notify: (type: 'success' | 'error', text: string) => void }) {
  const create = useCreateOfferTemplate();
  const update = useUpdateOfferTemplate();
  const [name, setName] = useState(template?.name ?? '');
  const [subject, setSubject] = useState(template?.subject ?? '');
  const [body, setBody] = useState(template?.body ?? '');
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(template);
  const pending = create.isPending || update.isPending;

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !subject.trim() || !body.trim()) { setError('Name, subject, and body are required.'); return; }
    setError(null);
    const payload = { name: name.trim(), subject: subject.trim(), body: body.trim() };
    const opts = {
      onSuccess: () => { notify('success', isEdit ? 'Template updated.' : 'Template created.'); onClose(); },
      onError: (err: unknown) => setError(errorMessage(err, 'Failed to save template.')),
    };
    if (isEdit && template?.id) {
      update.mutate({ id: template.id, ...payload }, opts);
    } else {
      create.mutate(payload, opts);
    }
  }

  return (
    <Dialog open onClose={onClose} title={isEdit ? `Edit ${template!.name}` : 'New template'} width={560}>
      <form onSubmit={handleSave}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TextField id="template-name" label="Name" value={name} onChange={setName} required autoComplete="off" />
          <TextField id="template-subject" label="Subject" value={subject} onChange={setSubject} required autoComplete="off" />
          <div>
            <label htmlFor="template-body" className="v2-label">Body</label>
            <textarea id="template-body" value={body} onChange={(e) => setBody(e.target.value)} rows={10} style={bodyInput} required />
          </div>
        </div>
        {error && <p role="alert" style={{ marginTop: 10, fontSize: 12.5, color: 'var(--danger)' }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button type="button" onClick={onClose} className="v2-hoverbtn" style={secondaryBtn}>Cancel</button>
          <Button type="submit" loading={pending}>{isEdit ? 'Save' : 'Create'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function TemplateRow({ template, onEdit, notify }: { template: OfferTemplate; onEdit: (t: OfferTemplate) => void; notify: (type: 'success' | 'error', text: string) => void }) {
  const update = useUpdateOfferTemplate();
  const del = useDeleteOfferTemplate();

  function handleMakeDefault() {
    if (!template.id) return;
    update.mutate({ id: template.id, isDefault: true }, {
      onSuccess: () => notify('success', `${template.name} is now the default.`),
      onError: (err) => notify('error', errorMessage(err, 'Failed to set default.')),
    });
  }

  function handleDelete() {
    if (!template.id) return;
    del.mutate(template.id, {
      onSuccess: () => notify('success', `${template.name} deleted.`),
      onError: (err) => notify('error', errorMessage(err, 'Failed to delete template.')),
    });
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{template.name}</div>
        {template.isDefault && <span style={badge}>Default</span>}
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {!template.isDefault && <button type="button" style={secondaryBtn} onClick={handleMakeDefault}>Make default</button>}
          <button type="button" style={secondaryBtn} onClick={() => onEdit(template)} aria-label={`Edit ${template.name}`}>Edit</button>
          <button type="button" style={dangerIconBtn} onClick={handleDelete} aria-label={`Delete ${template.name}`}><Trash2 size={15} /></button>
        </div>
      </div>
      <p style={desc}>{template.subject}</p>
    </div>
  );
}

export default function V2OfferTemplatePage() {
  const { role } = useAuth();
  const canManage = role !== 'panel';
  const { data: templates, isLoading, isError } = useOfferTemplates();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<OfferTemplate | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  if (!canManage) return <p style={{ fontSize: 13, color: muted }}>You don&apos;t have access to this page.</p>;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Content-only entrance; the create/edit Dialogs stay outside (a .v2-rise transform becomes
          the containing block for their position:fixed overlays). */}
      <div className="v2-rise">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div>
          <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Offer Templates</h1>
          <p style={{ ...desc, marginTop: 6 }}>Named offer letter templates recruiters can pick from when sending an offer.</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus size={15} /> Add template</Button>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? '#15803d' : 'var(--danger)' }}>
          {notice.text}
        </div>
      )}

      {isLoading && <p style={{ fontSize: 13, color: muted }}>Loading templates…</p>}
      {isError && <p style={{ fontSize: 13, color: 'var(--danger)' }}>Failed to load templates.</p>}
      {!isLoading && !isError && (!templates || templates.length === 0) && <p style={{ fontSize: 13, color: muted }}>No templates yet — add one to get started. Offers will use the built-in default until then.</p>}

      {templates && templates.map((t) => <TemplateRow key={t.id} template={t} onEdit={setEditing} notify={notify} />)}
      </div>

      {creating && <TemplateFormDialog onClose={() => setCreating(false)} notify={notify} />}
      {editing && <TemplateFormDialog template={editing} onClose={() => setEditing(null)} notify={notify} />}
    </div>
  );
}
