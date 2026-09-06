'use client';

// v2 Settings -> User Groups. Org-admin CRUD for named staff groups used to scope
// visibility/notifications (Zoho-style). Layout/gate conventions mirror settings/pipelines/page.tsx
// (title+description header, card list, inline dialog for create, org-primary tokens, inline
// success/error notice). Imports Button/TextField/Dialog directly from their files rather than the
// ui-v2 barrel -- the barrel re-exports DataTable, which pulls in @tanstack/react-table (ESM-only)
// and breaks under jest; this page doesn't need a DataTable anyway.
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../../../../lib/auth-context';
import { useTeammates } from '../../../../../lib/hooks/useUserDirectory';
import {
  useUserGroups, useCreateUserGroup, useUpdateUserGroup, useSetGroupMembers, useDeleteUserGroup,
} from '../../../../../lib/hooks/useUserGroups';
import type { UserGroup } from '../../../../../lib/types';
import { Button } from '../../../../../components/ui-v2/Button';
import { TextField } from '../../../../../components/ui-v2/TextField';
import { Dialog } from '../../../../../components/ui-v2/Dialog';

const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '16px 20px', marginBottom: 12 };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };
const iconBtn: React.CSSProperties = { display: 'inline-grid', placeItems: 'center', width: 30, height: 30, borderRadius: 7, border: '1px solid var(--hair)', background: 'var(--paper)', color: 'var(--ink)', cursor: 'pointer' };
const dangerIconBtn: React.CSSProperties = { ...iconBtn, color: 'var(--danger)', borderColor: 'color-mix(in srgb, var(--danger) 35%, var(--hair))' };
const toolBtn: React.CSSProperties = { fontSize: 12.5, fontWeight: 500, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--paper)', color: 'var(--ink)', cursor: 'pointer' };

type Notice = { type: 'success' | 'error'; text: string } | null;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function NewGroupDialog({ onClose, notify }: { onClose: () => void; notify: (type: 'success' | 'error', text: string) => void }) {
  const create = useCreateUserGroup();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    setError(null);
    create.mutate(
      { name: name.trim(), description: description.trim() || undefined },
      {
        onSuccess: () => { notify('success', 'Group created.'); onClose(); },
        onError: (err) => setError(errorMessage(err, 'Failed to create group.')),
      },
    );
  }

  return (
    <Dialog open onClose={onClose} title="New group" width={420}>
      <form onSubmit={handleSave}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TextField id="group-name" label="Name" value={name} onChange={setName} required autoComplete="off" />
          <TextField id="group-description" label="Description (optional)" value={description} onChange={setDescription} autoComplete="off" />
        </div>
        {error && <p role="alert" style={{ marginTop: 10, fontSize: 12.5, color: 'var(--danger)' }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button type="button" onClick={onClose} className="v2-hoverbtn" style={toolBtn}>Cancel</button>
          <Button type="submit" loading={create.isPending}>Create</Button>
        </div>
      </form>
    </Dialog>
  );
}

function MembersDialog({ group, onClose, notify }: { group: UserGroup; onClose: () => void; notify: (type: 'success' | 'error', text: string) => void }) {
  const { data: teammates, isLoading } = useTeammates();
  const setMembers = useSetGroupMembers();
  const [selected, setSelected] = useState<Set<string>>(new Set(group.members.map((m) => m.userId)));

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  }

  function handleSave() {
    setMembers.mutate(
      { groupId: group.id, userIds: Array.from(selected) },
      {
        onSuccess: () => { notify('success', 'Members updated.'); onClose(); },
        onError: (err) => notify('error', errorMessage(err, 'Failed to update members.')),
      },
    );
  }

  return (
    <Dialog open onClose={onClose} title={`Members — ${group.name}`} width={420}>
      {isLoading && <p style={{ fontSize: 13, color: muted }}>Loading teammates…</p>}
      {!isLoading && (!teammates || teammates.length === 0) && <p style={{ fontSize: 13, color: muted }}>No active teammates found.</p>}
      {teammates && teammates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
          {teammates.map((t) => (
            <label key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
              <input
                type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)}
                style={{ width: 15, height: 15, accentColor: 'var(--org-primary)' }}
              />
              {t.name ?? t.email} <span style={{ color: muted }}>({t.email})</span>
            </label>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
        <button type="button" onClick={onClose} className="v2-hoverbtn" style={toolBtn}>Cancel</button>
        <Button onClick={handleSave} loading={setMembers.isPending}>Save</Button>
      </div>
    </Dialog>
  );
}

function GroupRow({ group, notify }: { group: UserGroup; notify: (type: 'success' | 'error', text: string) => void }) {
  const update = useUpdateUserGroup();
  const del = useDeleteUserGroup();
  const [name, setName] = useState(group.name);
  const [editingMembers, setEditingMembers] = useState(false);

  function handleRename() {
    if (!name.trim() || name === group.name) return;
    update.mutate(
      { groupId: group.id, name: name.trim() },
      { onError: (err) => { notify('error', errorMessage(err, 'Failed to rename group.')); setName(group.name); } },
    );
  }

  function handleDelete() {
    del.mutate(group.id, {
      onSuccess: () => notify('success', `${group.name} deleted.`),
      onError: (err) => notify('error', errorMessage(err, 'Failed to delete group.')),
    });
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10 }}>
        <div style={{ minWidth: 200, flex: '1 1 200px' }} onBlur={handleRename}>
          <TextField id={`group-name-${group.id}`} label="Name" value={name} onChange={setName} />
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <button type="button" style={iconBtn} onClick={() => setEditingMembers(true)} aria-label={`Edit members of ${group.name}`}>
            Members
          </button>
          <button type="button" style={dangerIconBtn} onClick={handleDelete} aria-label={`Delete ${group.name}`}><Trash2 size={15} /></button>
        </div>
      </div>
      {group.description && <p style={desc}>{group.description}</p>}
      <p style={{ ...desc, marginTop: 8 }}>
        {group.members.length === 0
          ? 'No members yet.'
          : `${group.members.length} member${group.members.length === 1 ? '' : 's'}: ${group.members.map((m) => m.name ?? m.email).join(', ')}`}
      </p>
      {editingMembers && <MembersDialog group={group} onClose={() => setEditingMembers(false)} notify={notify} />}
    </div>
  );
}

export default function V2UserGroupsSettingsPage() {
  const { role, actingSuperAdmin } = useAuth();
  const canConfigure = role === 'org_admin' || actingSuperAdmin;
  const { data: groups, isLoading, isError } = useUserGroups();
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  if (!canConfigure) return <p style={{ fontSize: 13, color: muted }}>You don&apos;t have access to this page.</p>;

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div>
          <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>User Groups</h1>
          <p style={{ ...desc, marginTop: 6 }}>Group staff members for visibility and notification scoping.</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus size={15} /> Add group</Button>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? '#15803d' : 'var(--danger)' }}>
          {notice.text}
        </div>
      )}

      {isLoading && <p style={{ fontSize: 13, color: muted }}>Loading groups…</p>}
      {isError && <p style={{ fontSize: 13, color: 'var(--danger)' }}>Failed to load groups.</p>}
      {!isLoading && !isError && (!groups || groups.length === 0) && <p style={{ fontSize: 13, color: muted }}>No groups yet — add one to get started.</p>}

      {groups && groups.map((g) => <GroupRow key={g.id} group={g} notify={notify} />)}

      {creating && <NewGroupDialog onClose={() => setCreating(false)} notify={notify} />}
    </div>
  );
}
