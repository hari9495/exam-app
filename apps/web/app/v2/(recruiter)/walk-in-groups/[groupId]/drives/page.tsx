'use client';

// v2 Walk-in group drives — schedule + list the time-boxed drives for a group. Full re-skin on v2
// primitives (card form + shared DataTable + v2 delete Dialog). Hooks/validation verbatim.
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { useWalkInGroups } from '../../../../../../lib/hooks/useWalkInGroups';
import { useGroupDrives, useCreateDrive, useDeleteDrive } from '../../../../../../lib/hooks/useDrives';
import { DriveListItem, DriveSessionStatus } from '../../../../../../lib/types';
import { useToast } from '../../../../../../components/ui';
import { DataTable, DT_FEATURES, dt, SortHead, Pill, Dialog } from '../../../../../../components/ui-v2';
import { STATUS, VIZ } from '../../../../../../components/ui-v2/viz';

const backLink: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', textDecoration: 'none' };
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, padding: 20 };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)', outline: 'none' };
const STATUS_TONE: Record<DriveSessionStatus, { c: string; label: string }> = { scheduled: { c: VIZ.azure, label: 'Scheduled' }, live: { c: STATUS.ok, label: 'Live' }, ended: { c: 'var(--muted)', label: 'Ended' } };

export default function V2GroupDrivesPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const { toast } = useToast();
  const { data: groups } = useWalkInGroups();
  const group = groups?.find((g) => g.id === groupId) ?? null;
  const { data: drives, isLoading } = useGroupDrives(groupId);
  const createDrive = useCreateDrive(groupId);
  const deleteDrive = useDeleteDrive(groupId);
  const [pendingDelete, setPendingDelete] = useState<DriveListItem | null>(null);

  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  // Both fields must be filled before the ordering means anything.
  const rangeInvalid = Boolean(startsAt && endsAt && new Date(endsAt) <= new Date(startsAt));
  const canSubmit = Boolean(name.trim() && startsAt && endsAt) && !rangeInvalid;

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    createDrive.mutate({ name: name.trim(), startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() }, {
      onSuccess: () => { setName(''); setStartsAt(''); setEndsAt(''); toast('Drive scheduled.'); },
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to schedule drive.', 'error'),
    });
  }
  function handleConfirmDelete() {
    if (!pendingDelete) return;
    deleteDrive.mutate(pendingDelete.id, {
      onSuccess: () => { toast('Drive deleted.'); setPendingDelete(null); },
      onError: (error) => { toast(error instanceof Error ? error.message : 'Failed to delete drive.', 'error'); setPendingDelete(null); },
    });
  }

  const columns: ColumnDef<typeof DT_FEATURES, DriveListItem>[] = [
    { accessorKey: 'name', enableHiding: false, header: ({ column }) => <SortHead label="Drive" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <Link href={`/v2/drives/${row.original.id}`} style={{ fontWeight: 500, color: 'var(--org-primary)', textDecoration: 'none' }}>{row.original.name}</Link> },
    { accessorKey: 'startsAt', header: ({ column }) => <SortHead label="Starts" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{new Date(row.original.startsAt).toLocaleString()}</span> },
    { accessorKey: 'endsAt', header: ({ column }) => <SortHead label="Ends" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{new Date(row.original.endsAt).toLocaleString()}</span> },
    { id: 'status', enableSorting: false, header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Status</span>, cell: ({ row }) => <Pill c={STATUS_TONE[row.original.status].c} label={STATUS_TONE[row.original.status].label} /> },
    { id: 'actions', enableSorting: false, enableHiding: false, header: () => null, cell: ({ row }) => <button type="button" onClick={() => setPendingDelete(row.original)} aria-label={`Delete ${row.original.name}`} style={{ background: 'none', border: 'none', fontSize: 12.5, fontWeight: 500, color: 'var(--danger)', cursor: 'pointer' }}>Delete</button> },
  ];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <Link href="/v2/walk-in-groups" style={backLink}><ArrowLeft size={15} /> Back to Walk-in Groups</Link>
      <h1 className="v2-title" style={{ fontSize: 22, margin: '10px 0 4px' }}>Drives{group ? ` — ${group.name}` : ''}</h1>
      <p style={{ margin: '0 0 20px', fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5 }}>Schedule a time-boxed hiring drive for this group. Candidates who register while a drive is live are attributed to it.</p>

      <form onSubmit={handleCreate} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }} className="wf-pair">
          <div><label className="v2-label">Drive name <span style={{ color: 'var(--danger)' }}>*</span></label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aug 20 Walk-In" required style={input} /></div>
          <div><label className="v2-label">Starts <span style={{ color: 'var(--danger)' }}>*</span></label><input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required style={input} /></div>
          <div><label className="v2-label">Ends <span style={{ color: 'var(--danger)' }}>*</span></label><input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required style={input} />{rangeInvalid && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--danger)' }}>End must be after start.</p>}</div>
        </div>
        <div>
          <button type="submit" disabled={!canSubmit || createDrive.isPending} style={{ ...dt.primaryBtn, opacity: !canSubmit || createDrive.isPending ? 0.5 : 1, cursor: !canSubmit || createDrive.isPending ? 'not-allowed' : 'pointer' }}><Plus size={14} /> {createDrive.isPending ? 'Scheduling…' : 'Schedule drive'}</button>
        </div>
      </form>

      <DataTable columns={columns} data={drives ?? []} getRowId={(d) => d.id} hideToolbar isLoading={isLoading} emptyMessage="No drives scheduled yet." />

      <Dialog open={!!pendingDelete} onClose={() => setPendingDelete(null)} title="Delete drive">
        <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5, margin: '0 0 18px' }}>Delete <strong style={{ color: 'var(--ink)' }}>{pendingDelete?.name}</strong>? Registered candidates keep their attempts and revert to plain walk-ins.</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={() => setPendingDelete(null)} style={dt.toolBtn}>Cancel</button>
          <button type="button" onClick={handleConfirmDelete} disabled={deleteDrive.isPending} style={{ fontSize: 13, fontWeight: 500, padding: '9px 16px', borderRadius: 9, border: 'none', background: 'var(--danger)', color: '#fff', cursor: 'pointer' }}>Delete</button>
        </div>
      </Dialog>
    </div>
  );
}
