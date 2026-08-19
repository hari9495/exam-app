'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Card, Input, Table, StatusBadge, useToast, type Column, type StatusTone } from '../../../../../components/ui';
import { BackLink } from '../../../../../components/BackLink';
import { PageHeader } from '../../../../../components/PageChrome';
import { useWalkInGroups } from '../../../../../lib/hooks/useWalkInGroups';
import { useGroupDrives, useCreateDrive, useDeleteDrive } from '../../../../../lib/hooks/useDrives';
import { DriveListItem, DriveSessionStatus } from '../../../../../lib/types';

const STATUS_LABEL: Record<DriveSessionStatus, string> = { scheduled: 'Scheduled', live: 'Live', ended: 'Ended' };
const STATUS_TONE: Record<DriveSessionStatus, StatusTone> = { scheduled: 'info', live: 'success', ended: 'neutral' };

export default function GroupDrivesPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const { toast } = useToast();
  const { data: groups } = useWalkInGroups();
  const group = groups?.find((g) => g.id === groupId) ?? null;
  const { data: drives, isLoading } = useGroupDrives(groupId);
  const createDrive = useCreateDrive(groupId);
  const deleteDrive = useDeleteDrive(groupId);

  function handleDelete(drive: DriveListItem) {
    if (!confirm(`Delete drive "${drive.name}"? Registered candidates keep their attempts and revert to plain walk-ins.`)) return;
    deleteDrive.mutate(drive.id, {
      onSuccess: () => toast('Drive deleted.'),
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to delete drive.', 'error'),
    });
  }

  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  // Both fields must be filled before the ordering even means anything -- an empty
  // endsAt shouldn't flash "must be after start" while the recruiter is still typing.
  const rangeInvalid = Boolean(startsAt && endsAt && new Date(endsAt) <= new Date(startsAt));
  const canSubmit = Boolean(name.trim() && startsAt && endsAt) && !rangeInvalid;

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    createDrive.mutate(
      { name: name.trim(), startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() },
      {
        onSuccess: () => {
          setName('');
          setStartsAt('');
          setEndsAt('');
          toast('Drive scheduled.');
        },
        onError: (error) => toast(error instanceof Error ? error.message : 'Failed to schedule drive.', 'error'),
      },
    );
  }

  const columns: Column<DriveListItem>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Drive',
        sortValue: (drive) => drive.name,
        render: (drive) => (
          <Link href={`/drives/${drive.id}`} className="font-medium text-primary hover:underline">
            {drive.name}
          </Link>
        ),
      },
      { key: 'startsAt', header: 'Starts', sortValue: (drive) => drive.startsAt, render: (drive) => new Date(drive.startsAt).toLocaleString() },
      { key: 'endsAt', header: 'Ends', sortValue: (drive) => drive.endsAt, render: (drive) => new Date(drive.endsAt).toLocaleString() },
      {
        key: 'status',
        header: 'Status',
        render: (drive) => <StatusBadge tone={STATUS_TONE[drive.status]}>{STATUS_LABEL[drive.status]}</StatusBadge>,
      },
      {
        key: 'actions',
        header: '',
        render: (drive) => (
          <button
            type="button"
            onClick={() => handleDelete(drive)}
            className="text-muted hover:text-red-600"
            aria-label={`Delete ${drive.name}`}
          >
            <Trash2 size={16} />
          </button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <BackLink href="/walk-in-groups" label="Back to Walk-In Groups" />
        <PageHeader
          eyebrow="INTAKE"
          title={`Drives${group ? ` — ${group.name}` : ''}`}
          subtitle="Schedule a time-boxed hiring drive for this group. Candidates who register while a drive is live are attributed to it."
        />
      </div>

      <Card>
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Drive Name" value={name} onChange={setName} placeholder="e.g. Aug 20 Walk-In" required />
            <Input
              label="Starts"
              type="datetime-local"
              value={startsAt}
              onChange={setStartsAt}
              required
            />
            <Input
              label="Ends"
              type="datetime-local"
              value={endsAt}
              onChange={setEndsAt}
              error={rangeInvalid ? 'End must be after start.' : undefined}
              required
            />
          </div>
          <div>
            <Button type="submit" loading={createDrive.isPending} disabled={!canSubmit} className="inline-flex items-center gap-1.5">
              <Plus size={14} />
              Schedule drive
            </Button>
          </div>
        </form>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted">Loading&hellip;</p>
      ) : (
        <Table columns={columns} rows={drives ?? []} rowKey={(drive) => drive.id} emptyMessage="No drives scheduled yet." />
      )}
    </div>
  );
}
