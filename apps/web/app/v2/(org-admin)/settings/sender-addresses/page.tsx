'use client';

// v2 Settings -> Sender Addresses. Org-admin CRUD for the org's configured From addresses (Zoho
// #9 slice 3). Layout/gate conventions mirror settings/user-groups/page.tsx (title+description
// header, card list, inline dialog for create, org-primary tokens, inline success/error notice).
// Imports Button/TextField/Dialog directly from their files rather than the ui-v2 barrel -- the
// barrel re-exports DataTable, which pulls in @tanstack/react-table (ESM-only) and breaks under
// jest; this page doesn't need a DataTable anyway.
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../../../../lib/auth-context';
import {
  useOrgSenderAddresses, useCreateSenderAddress, useUpdateSenderAddress, useDeleteSenderAddress,
} from '../../../../../lib/hooks/useOrgSenderAddresses';
import type { OrgSenderAddress } from '../../../../../lib/types';
import { Button } from '../../../../../components/ui-v2/Button';
import { TextField } from '../../../../../components/ui-v2/TextField';
import { Dialog } from '../../../../../components/ui-v2/Dialog';

const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '16px 20px', marginBottom: 12, boxShadow: '0 1px 2px rgba(11,18,32,.04), 0 12px 32px -18px rgba(11,18,32,.22)' };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };
const dangerIconBtn: React.CSSProperties = { display: 'inline-grid', placeItems: 'center', width: 30, height: 30, borderRadius: 7, border: '1px solid color-mix(in srgb, var(--danger) 35%, var(--hair))', background: 'var(--paper)', color: 'var(--danger)', cursor: 'pointer' };
// Canonical secondary button (values match components/ui-v2/DataTable.tsx's `dt.toolBtn` exactly).
// Not imported directly: `dt` is defined in DataTable.tsx, which pulls in @tanstack/react-table
// (ESM-only) at module scope, so even a deep import of just `dt` would execute that import and
// break under jest -- see this file's top-of-file note on avoiding the ui-v2 barrel.
const secondaryBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '9px 14px', borderRadius: 9, border: '1px solid var(--org-primary)', background: 'var(--paper)', color: 'var(--org-primary)', cursor: 'pointer', boxShadow: '0 1px 2px rgba(11,18,32,.08)' };
const badge: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', padding: '3px 8px', borderRadius: 999, border: '1px solid color-mix(in srgb, #15803d 35%, transparent)', background: 'color-mix(in srgb, #15803d 10%, transparent)', color: '#15803d' };

type Notice = { type: 'success' | 'error'; text: string } | null;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function NewSenderDialog({ onClose, notify }: { onClose: () => void; notify: (type: 'success' | 'error', text: string) => void }) {
  const create = useCreateSenderAddress();
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !address.trim()) { setError('Label and address are required.'); return; }
    setError(null);
    create.mutate(
      { label: label.trim(), address: address.trim() },
      {
        onSuccess: () => { notify('success', 'Sender address created.'); onClose(); },
        onError: (err) => setError(errorMessage(err, 'Failed to create sender address.')),
      },
    );
  }

  return (
    <Dialog open onClose={onClose} title="New sender address" width={420}>
      <form onSubmit={handleSave}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TextField id="sender-label" label="Label" value={label} onChange={setLabel} required autoComplete="off" />
          <TextField id="sender-address" label="Address" type="email" value={address} onChange={setAddress} required autoComplete="off" />
        </div>
        {error && <p role="alert" style={{ marginTop: 10, fontSize: 12.5, color: 'var(--danger)' }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button type="button" onClick={onClose} className="v2-hoverbtn" style={secondaryBtn}>Cancel</button>
          <Button type="submit" loading={create.isPending}>Create</Button>
        </div>
      </form>
    </Dialog>
  );
}

function SenderRow({ sender, notify }: { sender: OrgSenderAddress; notify: (type: 'success' | 'error', text: string) => void }) {
  const update = useUpdateSenderAddress();
  const del = useDeleteSenderAddress();
  const [label, setLabel] = useState(sender.label);
  const [address, setAddress] = useState(sender.address);

  function handleLabelBlur() {
    if (!label.trim() || label === sender.label) return;
    update.mutate(
      { id: sender.id, label: label.trim() },
      { onError: (err) => { notify('error', errorMessage(err, 'Failed to update sender address.')); setLabel(sender.label); } },
    );
  }

  function handleAddressBlur() {
    if (!address.trim() || address === sender.address) return;
    update.mutate(
      { id: sender.id, address: address.trim() },
      { onError: (err) => { notify('error', errorMessage(err, 'Failed to update sender address.')); setAddress(sender.address); } },
    );
  }

  function handleMarkDefault() {
    update.mutate(
      { id: sender.id, isDefault: true },
      {
        onSuccess: () => notify('success', `${sender.label} is now the default.`),
        onError: (err) => notify('error', errorMessage(err, 'Failed to set default.')),
      },
    );
  }

  function handleDelete() {
    del.mutate(sender.id, {
      onSuccess: () => notify('success', `${sender.label} deleted.`),
      onError: (err) => notify('error', errorMessage(err, 'Failed to delete sender address.')),
    });
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10 }}>
        <div style={{ minWidth: 180, flex: '1 1 180px' }} onBlur={handleLabelBlur}>
          <TextField id={`sender-label-${sender.id}`} label="Label" value={label} onChange={setLabel} />
        </div>
        <div style={{ minWidth: 220, flex: '1 1 220px' }} onBlur={handleAddressBlur}>
          <TextField id={`sender-address-${sender.id}`} label="Address" type="email" value={address} onChange={setAddress} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          {sender.isDefault
            ? <span style={badge}>Default</span>
            : <button type="button" style={secondaryBtn} onClick={handleMarkDefault} aria-label={`Mark ${sender.label} default`}>Mark default</button>}
          <button type="button" style={dangerIconBtn} onClick={handleDelete} aria-label={`Delete ${sender.label}`}><Trash2 size={15} /></button>
        </div>
      </div>
    </div>
  );
}

export default function V2SenderAddressesSettingsPage() {
  const { role, actingSuperAdmin } = useAuth();
  const canConfigure = role === 'org_admin' || actingSuperAdmin;
  const { data: senders, isLoading, isError } = useOrgSenderAddresses();
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  if (!canConfigure) return <p style={{ fontSize: 13, color: muted }}>You don&apos;t have access to this page.</p>;

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div>
          <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Sender Addresses</h1>
          <p style={{ ...desc, marginTop: 6 }}>
            The default address is used as the From for all candidate emails unless a specific one is picked when sending.
            Each address must be one your organization&apos;s mail server is authorized to send as.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus size={15} /> Add sender</Button>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? '#15803d' : 'var(--danger)' }}>
          {notice.text}
        </div>
      )}

      {isLoading && <p style={{ fontSize: 13, color: muted }}>Loading sender addresses…</p>}
      {isError && <p style={{ fontSize: 13, color: 'var(--danger)' }}>Failed to load sender addresses.</p>}
      {!isLoading && !isError && (!senders || senders.length === 0) && <p style={{ fontSize: 13, color: muted }}>No sender addresses yet — add one to get started.</p>}

      {senders && senders.map((s) => <SenderRow key={s.id} sender={s} notify={notify} />)}

      {creating && <NewSenderDialog onClose={() => setCreating(false)} notify={notify} />}
    </div>
  );
}
