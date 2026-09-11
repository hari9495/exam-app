'use client';

// v2 Settings -> Permission Profiles. Org-admin CRUD for named custom permission sets (Zoho-style)
// that can be assigned to a staff user in place of their role default (see the "Permission profile"
// selector on the user edit dialog in ../../../users/page.tsx). Layout/gate conventions mirror
// settings/user-groups/page.tsx (title+description header, card list, inline create dialog,
// org-primary tokens, inline success/error notice). Imports Button/TextField/Dialog directly from
// their files rather than the ui-v2 barrel -- the barrel re-exports DataTable, which pulls in
// @tanstack/react-table (ESM-only) and breaks under jest; this page doesn't need a DataTable anyway.
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../../../../lib/auth-context';
import {
  usePermissionProfiles, useAssignablePermissions, useCreatePermissionProfile,
  useUpdatePermissionProfile, useDeletePermissionProfile,
} from '../../../../../lib/hooks/usePermissionProfiles';
import type { PermissionProfile, AssignablePermission } from '../../../../../lib/types';
import { Button } from '../../../../../components/ui-v2/Button';
import { TextField } from '../../../../../components/ui-v2/TextField';
import { Dialog } from '../../../../../components/ui-v2/Dialog';

const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '16px 20px', marginBottom: 12 };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };
const dangerIconBtn: React.CSSProperties = { display: 'inline-grid', placeItems: 'center', width: 30, height: 30, borderRadius: 7, border: '1px solid color-mix(in srgb, var(--danger) 35%, var(--hair))', background: 'var(--paper)', color: 'var(--danger)', cursor: 'pointer' };
// Canonical secondary button (values match components/ui-v2/DataTable.tsx's `dt.toolBtn` exactly).
// Not imported directly: `dt` is defined in DataTable.tsx, which pulls in @tanstack/react-table
// (ESM-only) at module scope, so even a deep import of just `dt` would execute that import and
// break under jest -- see this file's top-of-file note on avoiding the ui-v2 barrel.
const secondaryBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '9px 14px', borderRadius: 9, border: '1px solid var(--org-primary)', background: 'var(--paper)', color: 'var(--org-primary)', cursor: 'pointer', boxShadow: '0 1px 2px rgba(11,18,32,.08)' };

type Notice = { type: 'success' | 'error'; text: string } | null;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function PermissionChecklist({ permissions, selected, onToggle }: { permissions: AssignablePermission[]; selected: Set<string>; onToggle: (key: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
      {permissions.length === 0 && <p style={{ fontSize: 12.5, color: muted, margin: 0 }}>No assignable permissions found.</p>}
      {permissions.map((p) => (
        <label key={p.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
          <input
            type="checkbox" checked={selected.has(p.key)} onChange={() => onToggle(p.key)}
            style={{ width: 15, height: 15, marginTop: 2, accentColor: 'var(--org-primary)', flexShrink: 0 }}
          />
          <span>
            <code style={{ fontSize: 12.5 }}>{p.key}</code>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: muted }}>{p.description}</p>
          </span>
        </label>
      ))}
    </div>
  );
}

function useToggleSet(initial: Iterable<string>) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));
  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  return { selected, toggle };
}

function NewProfileDialog({ assignable, onClose, notify }: { assignable: AssignablePermission[]; onClose: () => void; notify: (type: 'success' | 'error', text: string) => void }) {
  const create = useCreatePermissionProfile();
  const [name, setName] = useState('');
  const { selected, toggle } = useToggleSet([]);
  const [error, setError] = useState<string | null>(null);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    setError(null);
    create.mutate(
      { name: name.trim(), permissions: Array.from(selected) },
      {
        onSuccess: () => { notify('success', 'Profile created.'); onClose(); },
        onError: (err) => setError(errorMessage(err, 'Failed to create profile.')),
      },
    );
  }

  return (
    <Dialog open onClose={onClose} title="New permission profile" width={460}>
      <form onSubmit={handleSave}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TextField id="profile-name" label="Name" value={name} onChange={setName} required autoComplete="off" />
          <div>
            <label className="v2-label">Permissions</label>
            <PermissionChecklist permissions={assignable} selected={selected} onToggle={toggle} />
          </div>
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

function EditPermissionsDialog({ profile, assignable, onClose, notify }: { profile: PermissionProfile; assignable: AssignablePermission[]; onClose: () => void; notify: (type: 'success' | 'error', text: string) => void }) {
  const update = useUpdatePermissionProfile();
  const { selected, toggle } = useToggleSet(profile.permissions);

  function handleSave() {
    update.mutate(
      { id: profile.id, permissions: Array.from(selected) },
      {
        onSuccess: () => { notify('success', 'Permissions updated.'); onClose(); },
        onError: (err) => notify('error', errorMessage(err, 'Failed to update permissions.')),
      },
    );
  }

  return (
    <Dialog open onClose={onClose} title={`Permissions — ${profile.name}`} width={460}>
      <PermissionChecklist permissions={assignable} selected={selected} onToggle={toggle} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
        <button type="button" onClick={onClose} className="v2-hoverbtn" style={secondaryBtn}>Cancel</button>
        <Button onClick={handleSave} loading={update.isPending}>Save</Button>
      </div>
    </Dialog>
  );
}

function ProfileRow({ profile, assignable, notify }: { profile: PermissionProfile; assignable: AssignablePermission[]; notify: (type: 'success' | 'error', text: string) => void }) {
  const update = useUpdatePermissionProfile();
  const del = useDeletePermissionProfile();
  const [name, setName] = useState(profile.name);
  const [editingPermissions, setEditingPermissions] = useState(false);

  function handleRename() {
    if (!name.trim() || name === profile.name) return;
    update.mutate(
      { id: profile.id, name: name.trim() },
      { onError: (err) => { notify('error', errorMessage(err, 'Failed to rename profile.')); setName(profile.name); } },
    );
  }

  function handleDelete() {
    del.mutate(profile.id, {
      onSuccess: () => notify('success', `${profile.name} deleted.`),
      onError: (err) => notify('error', errorMessage(err, 'Failed to delete profile.')),
    });
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10 }}>
        <div style={{ minWidth: 200, flex: '1 1 200px' }} onBlur={handleRename}>
          <TextField id={`profile-name-${profile.id}`} label="Name" value={name} onChange={setName} />
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <button type="button" style={secondaryBtn} onClick={() => setEditingPermissions(true)} aria-label={`Edit permissions of ${profile.name}`}>
            Permissions
          </button>
          <button type="button" style={dangerIconBtn} onClick={handleDelete} aria-label={`Delete ${profile.name}`}><Trash2 size={15} /></button>
        </div>
      </div>
      <p style={{ ...desc, marginTop: 8 }}>
        {profile.permissions.length} permission{profile.permissions.length === 1 ? '' : 's'} · {profile.assignedUserCount} user{profile.assignedUserCount === 1 ? '' : 's'} assigned
      </p>
      {editingPermissions && <EditPermissionsDialog profile={profile} assignable={assignable} onClose={() => setEditingPermissions(false)} notify={notify} />}
    </div>
  );
}

export default function V2PermissionProfilesSettingsPage() {
  const { role, actingSuperAdmin } = useAuth();
  const canConfigure = role === 'org_admin' || actingSuperAdmin;
  const { data: profiles, isLoading, isError } = usePermissionProfiles();
  const { data: assignable } = useAssignablePermissions();
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  if (!canConfigure) return <p style={{ fontSize: 13, color: muted }}>You don&apos;t have access to this page.</p>;

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div>
          <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Permission Profiles</h1>
          <p style={{ ...desc, marginTop: 6 }}>Define custom permission sets to assign to staff in place of their role default.</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus size={15} /> Add profile</Button>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? '#15803d' : 'var(--danger)' }}>
          {notice.text}
        </div>
      )}

      {isLoading && <p style={{ fontSize: 13, color: muted }}>Loading profiles…</p>}
      {isError && <p style={{ fontSize: 13, color: 'var(--danger)' }}>Failed to load permission profiles.</p>}
      {!isLoading && !isError && (!profiles || profiles.length === 0) && <p style={{ fontSize: 13, color: muted }}>No profiles yet — add one to get started.</p>}

      {profiles && profiles.map((p) => <ProfileRow key={p.id} profile={p} assignable={assignable ?? []} notify={notify} />)}

      {creating && <NewProfileDialog assignable={assignable ?? []} onClose={() => setCreating(false)} notify={notify} />}
    </div>
  );
}
