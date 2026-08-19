'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, Input, Table, Modal, useToast, type Column } from '../../../components/ui';
import { useAuth } from '../../../lib/auth-context';
import { useWalkInGroups, useCreateWalkInGroup, useDeleteWalkInGroup } from '../../../lib/hooks/useWalkInGroups';
import { ManageWalkInGroupModal } from '../../../components/ManageWalkInGroupModal';
import { WalkInGroup } from '../../../lib/types';

export default function WalkInGroupsPage() {
  const { organizationSlug } = useAuth();
  const { toast } = useToast();
  const { data: groups, isLoading } = useWalkInGroups();
  const createGroup = useCreateWalkInGroup();
  const deleteGroup = useDeleteWalkInGroup();
  const [newName, setNewName] = useState('');
  const [managingId, setManagingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<WalkInGroup | null>(null);

  // Re-derived from the live list (not the row object captured at click time) so a rename
  // or membership change made inside the modal shows up there immediately, without closing it.
  const managing = groups?.find((group) => group.id === managingId) ?? null;

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    createGroup.mutate(newName, {
      onSuccess: () => {
        setNewName('');
        toast('Group created.');
      },
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to create group.', 'error'),
    });
  }

  function handleConfirmDelete() {
    if (!deleting) return;
    deleteGroup.mutate(deleting.id, {
      onSuccess: () => {
        toast('Group deleted.');
        setDeleting(null);
      },
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to delete group.', 'error'),
    });
  }

  const columns: Column<WalkInGroup>[] = [
    { key: 'index', header: '#', render: (_group, index) => index + 1 },
    { key: 'name', header: 'Group', render: (group) => group.name, sortValue: (group) => group.name },
    {
      key: 'exams',
      header: 'Exams',
      render: (group) =>
        group.exams.length === 0 ? (
          <span className="text-muted">No exams yet</span>
        ) : (
          group.exams.map((exam) => exam.title).join(', ')
        ),
    },
    {
      key: 'actions',
      header: '',
      render: (group) => (
        <div className="flex justify-end gap-3">
          <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setManagingId(group.id)}>
            Manage
          </button>
          <button
            type="button"
            className="text-xs font-medium text-status-danger hover:underline"
            onClick={() => setDeleting(group)}
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  if (isLoading) {
    return <p className="text-sm text-muted">Loading&hellip;</p>;
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Walk-In Groups</h1>
        <p className="mt-1 text-sm text-muted">
          Bundle a subset of your walk-in-enabled exams behind their own shared link/QR code, separate from the
          default org-wide walk-in page. Each exam belongs to at most one group.
        </p>
      </div>

      <form onSubmit={handleCreate} className="flex items-end gap-2">
        <div className="max-w-sm flex-1">
          <Input label="New Group Name" hideLabel value={newName} onChange={setNewName} placeholder="e.g. Fresher Drive Hackathon" />
        </div>
        <Button type="submit" loading={createGroup.isPending} className="inline-flex items-center gap-1.5">
          <Plus size={14} />
          New group
        </Button>
      </form>

      <Table columns={columns} rows={groups ?? []} rowKey={(group) => group.id} emptyMessage="No walk-in groups yet. Create one above." />

      {managing && organizationSlug && (
        <ManageWalkInGroupModal group={managing} orgSlug={organizationSlug} onClose={() => setManagingId(null)} />
      )}

      {deleting && (
        <Modal open title={`Delete "${deleting.name}"?`} onClose={() => setDeleting(null)}>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">
              Its {deleting.exams.length} exam{deleting.exams.length === 1 ? '' : 's'} will stay walk-in-enabled and
              simply become ungrouped — reachable via their own exam-specific link, just not this group&apos;s.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button type="button" variant="danger" loading={deleteGroup.isPending} onClick={handleConfirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
