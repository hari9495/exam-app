'use client';

// v2 Jobs — shared DataTable. Format only, existing hooks (useJobs / useCreateJob / useDeleteJob).
// Status filter in header, pipeline summary, New-job dialog, delete confirm. useJobs returns the full
// list (no server pagination) → unpaginated DataTable with client-side title search.
import { useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, MoreHorizontal, ListFilter, Check, Trash2 } from 'lucide-react';
import { useJobs, useCreateJob, useDeleteJob } from '../../../../lib/hooks/usePipeline';
import { type JobListItem, type JobStatus, PIPELINE_STAGES } from '../../../../lib/types';
import { DataTable, DT_FEATURES, dt, SortHead, Pill, Dropdown, DropdownItem, Dialog, TextField, Button } from '../../../../components/ui-v2';
import { STATUS } from '../../../../components/ui-v2/viz';

const STATUS_OPTS = [{ value: 'all', label: 'All statuses' }, { value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }];
const STATUS_PILL: Record<JobStatus, { c: string; label: string }> = { open: { c: STATUS.ok, label: 'Open' }, closed: { c: 'var(--muted)', label: 'Closed' } };

function stageSummary(stageCounts: JobListItem['stageCounts']): string {
  const parts = PIPELINE_STAGES.map((stage) => ({ stage, count: stageCounts[stage] })).filter((e) => e.count > 0);
  return parts.length === 0 ? 'No candidates yet' : parts.map((e) => `${e.count} ${e.stage}`).join(' · ');
}

export default function V2JobsPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<JobListItem | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  const { data: jobs, isLoading, isError } = useJobs(statusFilter === 'all' ? undefined : (statusFilter as JobStatus));
  const createJob = useCreateJob();
  const deleteJob = useDeleteJob();
  const q = search.trim().toLowerCase();
  const rows = q ? (jobs ?? []).filter((j) => j.title.toLowerCase().includes(q)) : (jobs ?? []);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setFormError('Job title is required.'); return; }
    setFormError(null);
    createJob.mutate({ title: title.trim(), description: description.trim() || undefined }, {
      onSuccess: () => { setAddOpen(false); setTitle(''); setDescription(''); notify('success', 'Job created.'); },
      onError: (err) => setFormError(err instanceof Error ? err.message : 'Failed to create job.'),
    });
  }
  function handleConfirmDelete() {
    if (!pendingDelete) return;
    deleteJob.mutate(pendingDelete.id, {
      onSuccess: () => { notify('success', 'Job deleted.'); setPendingDelete(null); },
      onError: (err) => { notify('error', err instanceof Error ? err.message : 'Failed to delete job.'); setPendingDelete(null); },
    });
  }

  const columns: ColumnDef<typeof DT_FEATURES, JobListItem>[] = [
    { accessorKey: 'title', enableHiding: false, header: ({ column }) => <SortHead label="Job" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <Link href={`/v2/jobs/${row.original.id}`} style={{ fontWeight: 500, color: 'var(--org-primary)', textDecoration: 'none' }}>{row.original.title}</Link> },
    {
      accessorKey: 'status', enableSorting: false, enableHiding: false,
      header: () => (
        <Dropdown align="start" menuWidth={150} trigger={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: statusFilter !== 'all' ? 'var(--org-primary)' : 'var(--muted)' }}>Status <ListFilter size={12} style={{ opacity: 0.75 }} /></span>}>
          {(close) => STATUS_OPTS.map((o) => <DropdownItem key={o.value} onClick={() => { close(); setStatusFilter(o.value); }}><span style={{ width: 15, display: 'inline-flex', flexShrink: 0, color: 'var(--org-primary)' }}>{statusFilter === o.value && <Check size={15} />}</span>{o.label}</DropdownItem>)}
        </Dropdown>
      ),
      cell: ({ row }) => <Pill c={STATUS_PILL[row.original.status].c} label={STATUS_PILL[row.original.status].label} />,
    },
    { id: 'pipeline', enableSorting: false, header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Pipeline</span>, cell: ({ row }) => <span style={dt.muted}>{stageSummary(row.original.stageCounts)}</span> },
    { accessorKey: 'createdAt', header: ({ column }) => <SortHead label="Created" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{new Date(row.original.createdAt).toLocaleDateString()}</span> },
    {
      id: 'actions', enableSorting: false, enableHiding: false, header: () => null,
      cell: ({ row }) => (
        <Dropdown align="end" menuWidth={150} trigger={<span style={{ display: 'inline-grid', placeItems: 'center', width: 30, height: 30, color: 'var(--muted)', cursor: 'pointer' }}><MoreHorizontal size={17} /></span>}>
          {(close) => <DropdownItem danger onClick={() => { close(); setPendingDelete(row.original); }}><Trash2 size={15} /> Delete</DropdownItem>}
        </Dropdown>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Jobs</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>Open a job to track candidates through applied, screened, interview, offer, and hired.</p>
        </div>
        <button type="button" className="v2-hoverbtn" style={dt.primaryBtn} onClick={() => { setFormError(null); setAddOpen(true); }}><Plus size={14} /> New job</button>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? STATUS.ok : 'var(--danger)' }}>{notice.text}</div>
      )}

      <DataTable
        columns={columns} data={rows} getRowId={(r) => r.id}
        search={search} onSearchChange={setSearch} searchPlaceholder="Search jobs…"
        isLoading={isLoading} isError={isError} errorMessage="Failed to load jobs." emptyMessage={q ? 'No matches.' : 'No jobs yet.'}
        columnLabels={{ pipeline: 'Pipeline', createdAt: 'Created' }}
      />

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="New job">
        <form onSubmit={handleCreate}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <TextField id="job-title" label="Job title" value={title} onChange={setTitle} required autoComplete="off" />
            <TextField id="job-desc" label="Description (optional)" value={description} onChange={setDescription} autoComplete="off" />
          </div>
          {formError && <p role="alert" style={{ marginTop: 12, fontSize: 12.5, color: 'var(--danger)' }}>{formError}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button type="button" onClick={() => setAddOpen(false)} className="v2-hoverbtn" style={dt.toolBtn}>Cancel</button>
            <Button type="submit" loading={createJob.isPending}>Create job</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={!!pendingDelete} onClose={() => setPendingDelete(null)} title="Delete job">
        <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5, margin: '0 0 18px' }}>Delete <strong style={{ color: 'var(--ink)' }}>{pendingDelete?.title}</strong>? This removes the job and its pipeline.</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={() => setPendingDelete(null)} className="v2-hoverbtn" style={dt.toolBtn}>Cancel</button>
          <button type="button" onClick={handleConfirmDelete} disabled={deleteJob.isPending} style={{ fontSize: 13, fontWeight: 500, padding: '9px 16px', borderRadius: 9, border: 'none', background: 'var(--danger)', color: '#fff', cursor: 'pointer' }}>Delete</button>
        </div>
      </Dialog>
    </>
  );
}
