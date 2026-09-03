'use client';

// v2 Plans (super-admin) — format-only re-skin of the old (platform)/plans page (ListView + Modal
// form). Same hooks (usePlans, useCreatePlan, useUpdatePlan) and identical logic: one form for both
// create and edit over the same string-backed field state, numeric fields coerced with Number() on
// submit. Old ListView → shared DataTable; old Modal → v2 Dialog; toast → inline notice; old
// Checkbox → v2 Cb.
import { useMemo, useState, type FormEvent } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus } from 'lucide-react';
import { usePlans, useCreatePlan, useUpdatePlan } from '../../../../lib/hooks/usePlans';
import type { Plan } from '../../../../lib/types';
import { DataTable, DT_FEATURES, dt, SortHead, Pill, Cb, Dropdown, DropdownItem, TextField, Dialog, Button } from '../../../../components/ui-v2';
import { STATUS } from '../../../../components/ui-v2/viz';

interface PlanFormState {
  name: string;
  seatLimit: string;
  candidateLimit: string;
  aiCreditLimit: string;
  proctoringMinutesLimit: string;
  priceLabel: string;
  isPublic: boolean;
}

const EMPTY_FORM: PlanFormState = {
  name: '',
  seatLimit: '',
  candidateLimit: '',
  aiCreditLimit: '',
  proctoringMinutesLimit: '',
  priceLabel: '',
  isPublic: true,
};

function toFormState(plan: Plan): PlanFormState {
  return {
    name: plan.name,
    seatLimit: String(plan.seatLimit),
    candidateLimit: String(plan.candidateLimit),
    aiCreditLimit: String(plan.aiCreditLimit),
    proctoringMinutesLimit: String(plan.proctoringMinutesLimit),
    priceLabel: plan.priceLabel ?? '',
    isPublic: plan.isPublic,
  };
}

export default function V2PlansPage() {
  const { data: plans, isLoading, isError } = usePlans();
  const createPlan = useCreatePlan();
  const updatePlan = useUpdatePlan();

  const [editing, setEditing] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<PlanFormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  const q = search.trim().toLowerCase();
  const rows = useMemo(() => (plans ?? []).filter((p) => !q || p.name.toLowerCase().includes(q)), [plans, q]);

  function openCreate() { setForm(EMPTY_FORM); setError(null); setCreating(true); }
  function openEdit(plan: Plan) { setForm(toFormState(plan)); setError(null); setEditing(plan); }
  function closeForm() { setCreating(false); setEditing(null); setError(null); }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const input = {
      name: form.name,
      seatLimit: Number(form.seatLimit),
      candidateLimit: Number(form.candidateLimit),
      aiCreditLimit: Number(form.aiCreditLimit),
      proctoringMinutesLimit: Number(form.proctoringMinutesLimit),
      priceLabel: form.priceLabel || undefined,
      isPublic: form.isPublic,
    };
    const onSettled = {
      onSuccess: () => { notify('success', editing ? `Updated ${form.name}.` : `Created ${form.name}.`); closeForm(); },
      onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Failed to save plan'),
    };
    if (editing) {
      updatePlan.mutate({ id: editing.id, ...input }, onSettled);
    } else {
      createPlan.mutate(input, onSettled);
    }
  }

  const columns: ColumnDef<typeof DT_FEATURES, Plan>[] = [
    { accessorKey: 'name', enableHiding: false, header: ({ column }) => <SortHead label="Name" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{row.original.name}</span> },
    { accessorKey: 'seatLimit', header: ({ column }) => <SortHead label="Seats" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{row.original.seatLimit}</span> },
    { accessorKey: 'candidateLimit', header: ({ column }) => <SortHead label="Candidates" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{row.original.candidateLimit}</span> },
    { accessorKey: 'aiCreditLimit', header: ({ column }) => <SortHead label="AI Credits" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{row.original.aiCreditLimit}</span> },
    { accessorKey: 'proctoringMinutesLimit', header: ({ column }) => <SortHead label="Proctoring Minutes" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{row.original.proctoringMinutesLimit}</span> },
    { accessorKey: 'priceLabel', header: ({ column }) => <SortHead label="Price" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{row.original.priceLabel ?? '—'}</span> },
    { accessorKey: 'isPublic', enableSorting: false, header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Visibility</span>, cell: ({ row }) => <Pill c={row.original.isPublic ? STATUS.ok : 'var(--muted)'} label={row.original.isPublic ? 'Public' : 'Hidden'} /> },
    {
      id: 'actions', enableSorting: false, enableHiding: false, header: () => null,
      cell: ({ row }) => (
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <Dropdown align="end" menuWidth={140} trigger={<span style={{ display: 'inline-grid', placeItems: 'center', width: 30, height: 30, color: 'var(--muted)', cursor: 'pointer' }}><Pencil size={15} /></span>}>
            {(close) => <DropdownItem onClick={() => { close(); openEdit(row.original); }}><Pencil size={15} /> Edit</DropdownItem>}
          </Dropdown>
        </div>
      ),
    },
  ];

  const formOpen = creating || editing !== null;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Plans</h1>
        <Button onClick={openCreate}><Plus size={15} /> New plan</Button>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? STATUS.ok : 'var(--danger)' }}>{notice.text}</div>
      )}

      <DataTable
        columns={columns} data={rows} getRowId={(p) => p.id}
        search={search} onSearchChange={setSearch} searchPlaceholder="Search plans…"
        isLoading={isLoading} isError={isError} errorMessage="Failed to load plans." emptyMessage={q ? 'No matching plans.' : 'No plans yet.'}
        columnLabels={{ name: 'Name', seatLimit: 'Seats', candidateLimit: 'Candidates', aiCreditLimit: 'AI Credits', proctoringMinutesLimit: 'Proctoring Minutes', priceLabel: 'Price', isPublic: 'Visibility' }}
      />

      {formOpen && (
        <Dialog open onClose={closeForm} title={editing ? `Edit ${editing.name}` : 'New Plan'} width={480}>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <TextField id="plan-name" label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required autoComplete="off" />
              <TextField id="plan-seat" label="Seat limit" type="number" value={form.seatLimit} onChange={(v) => setForm({ ...form, seatLimit: v })} required />
              <TextField id="plan-candidate" label="Candidate limit" type="number" value={form.candidateLimit} onChange={(v) => setForm({ ...form, candidateLimit: v })} required />
              <TextField id="plan-ai" label="AI credit limit" type="number" value={form.aiCreditLimit} onChange={(v) => setForm({ ...form, aiCreditLimit: v })} required />
              <TextField id="plan-proctoring" label="Proctoring minutes limit" type="number" value={form.proctoringMinutesLimit} onChange={(v) => setForm({ ...form, proctoringMinutesLimit: v })} required />
              <TextField id="plan-price" label="Price label" value={form.priceLabel} onChange={(v) => setForm({ ...form, priceLabel: v })} autoComplete="off" />
              <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
                <Cb checked={form.isPublic} onChange={(v) => setForm({ ...form, isPublic: v })} /> Public (visible on the pricing page)
              </label>
            </div>
            {error && <p role="alert" style={{ marginTop: 12, fontSize: 12.5, color: 'var(--danger)' }}>{error}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button type="button" onClick={closeForm} className="v2-hoverbtn" style={dt.toolBtn}>Cancel</button>
              <Button type="submit" loading={createPlan.isPending || updatePlan.isPending}>{editing ? 'Save' : 'Create plan'}</Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
