'use client';

// v2 Walk-in Groups — shared DataTable. Format only, existing hooks (useWalkInGroups /
// useCreateWalkInGroup / useDeleteWalkInGroup). New-group dialog, Manage (existing modal), delete
// confirm. useWalkInGroups returns the full list → unpaginated + client name search.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, MoreHorizontal, Settings2, Trash2, CalendarClock } from 'lucide-react';
import { useAuth } from '../../../../lib/auth-context';
import { useWalkInGroups, useCreateWalkInGroup, useDeleteWalkInGroup } from '../../../../lib/hooks/useWalkInGroups';
import { ManageWalkInGroupModal } from '../../../../components/ManageWalkInGroupModal';
import type { WalkInGroup } from '../../../../lib/types';
import { DataTable, DT_FEATURES, dt, SortHead, Dropdown, DropdownItem, Dialog, TextField, Button } from '../../../../components/ui-v2';
import { STATUS } from '../../../../components/ui-v2/viz';

export default function V2WalkInGroupsPage() {
  const router = useRouter();
  const { organizationSlug } = useAuth();
  const { data: groups, isLoading, isError } = useWalkInGroups();
  const createGroup = useCreateWalkInGroup();
  const deleteGroup = useDeleteWalkInGroup();
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [managingId, setManagingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<WalkInGroup | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  const managing = groups?.find((g) => g.id === managingId) ?? null;
  const q = search.trim().toLowerCase();
  const rows = q ? (groups ?? []).filter((g) => g.name.toLowerCase().includes(q)) : (groups ?? []);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) { setFormError('Group name is required.'); return; }
    setFormError(null);
    createGroup.mutate(newName.trim(), {
      onSuccess: () => { setAddOpen(false); setNewName(''); notify('success', 'Group created.'); },
      onError: (err) => setFormError(err instanceof Error ? err.message : 'Failed to create group.'),
    });
  }
  function handleConfirmDelete() {
    if (!pendingDelete) return;
    deleteGroup.mutate(pendingDelete.id, {
      onSuccess: () => { notify('success', 'Group deleted.'); setPendingDelete(null); },
      onError: (err) => { notify('error', err instanceof Error ? err.message : 'Failed to delete group.'); setPendingDelete(null); },
    });
  }

  const columns: ColumnDef<typeof DT_FEATURES, WalkInGroup>[] = [
    { accessorKey: 'name', enableHiding: false, header: ({ column }) => <SortHead label="Group" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{row.original.name}</span> },
    { id: 'exams', enableSorting: false, header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Exams</span>, cell: ({ row }) => row.original.exams.length === 0 ? <span style={dt.muted}>No exams yet</span> : <span style={{ color: 'var(--ink)' }}>{row.original.exams.map((e) => e.title).join(', ')}</span> },
    {
      id: 'actions', enableSorting: false, enableHiding: false, header: () => null,
      cell: ({ row }) => (
        <Dropdown align="end" menuWidth={150} trigger={<span style={{ display: 'inline-grid', placeItems: 'center', width: 30, height: 30, color: 'var(--muted)', cursor: 'pointer' }}><MoreHorizontal size={17} /></span>}>
          {(close) => (<>
            <DropdownItem onClick={() => { close(); router.push(`/v2/walk-in-groups/${row.original.id}/drives`); }}><CalendarClock size={15} /> Drives</DropdownItem>
            <DropdownItem onClick={() => { close(); setManagingId(row.original.id); }}><Settings2 size={15} /> Manage</DropdownItem>
            <DropdownItem danger onClick={() => { close(); setPendingDelete(row.original); }}><Trash2 size={15} /> Delete</DropdownItem>
          </>)}
        </Dropdown>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Walk-in Groups</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0', maxWidth: 560 }}>Bundle a subset of your walk-in-enabled exams behind their own shared link/QR code. Each exam belongs to at most one group.</p>
        </div>
        <button type="button" style={dt.primaryBtn} onClick={() => { setFormError(null); setAddOpen(true); }}><Plus size={14} /> New group</button>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? STATUS.ok : 'var(--danger)' }}>{notice.text}</div>
      )}

      <DataTable
        columns={columns} data={rows} getRowId={(r) => r.id}
        search={search} onSearchChange={setSearch} searchPlaceholder="Search groups…"
        isLoading={isLoading} isError={isError} errorMessage="Failed to load groups." emptyMessage={q ? 'No matches.' : 'No walk-in groups yet. Create one to start.'}
        columnLabels={{ exams: 'Exams' }}
      />

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="New walk-in group">
        <form onSubmit={handleCreate}>
          <TextField id="wig-name" label="Group name" value={newName} onChange={setNewName} required autoComplete="off" />
          {formError && <p role="alert" style={{ marginTop: 12, fontSize: 12.5, color: 'var(--danger)' }}>{formError}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button type="button" onClick={() => setAddOpen(false)} style={dt.toolBtn}>Cancel</button>
            <Button type="submit" loading={createGroup.isPending}>Create group</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={!!pendingDelete} onClose={() => setPendingDelete(null)} title={`Delete "${pendingDelete?.name ?? ''}"?`}>
        <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5, margin: '0 0 18px' }}>Its {pendingDelete?.exams.length ?? 0} exam{(pendingDelete?.exams.length ?? 0) === 1 ? '' : 's'} stay walk-in-enabled and simply become ungrouped — reachable via their own exam-specific link, just not this group&apos;s.</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={() => setPendingDelete(null)} style={dt.toolBtn}>Cancel</button>
          <button type="button" onClick={handleConfirmDelete} disabled={deleteGroup.isPending} style={{ fontSize: 13, fontWeight: 500, padding: '9px 16px', borderRadius: 9, border: 'none', background: 'var(--danger)', color: '#fff', cursor: 'pointer' }}>Delete</button>
        </div>
      </Dialog>

      {managing && organizationSlug && (
        <ManageWalkInGroupModal group={managing} orgSlug={organizationSlug} onClose={() => setManagingId(null)} />
      )}
    </>
  );
}
