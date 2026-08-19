'use client';

import { FormEvent, useMemo, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { usePlans, useCreatePlan, useUpdatePlan } from '../../../lib/hooks/usePlans';
import { Button, Input, Checkbox, Modal, StatusBadge, useToast, type Column } from '../../../components/ui';
import { Plan } from '../../../lib/types';
import { ListView } from '../components/ListView';
import { RowActions } from '../components/RowActions';

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

export default function PlansPage() {
  const { data: plans, isLoading, isError } = usePlans();
  const createPlan = useCreatePlan();
  const updatePlan = useUpdatePlan();
  const { toast } = useToast();

  const [editing, setEditing] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<PlanFormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => plans ?? [], [plans]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setError(null);
    setCreating(true);
  }

  function openEdit(plan: Plan) {
    setForm(toFormState(plan));
    setError(null);
    setEditing(plan);
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
    setError(null);
  }

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
      onSuccess: () => {
        toast(editing ? `Updated ${form.name}.` : `Created ${form.name}.`);
        closeForm();
      },
      onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Failed to save plan'),
    };
    if (editing) {
      updatePlan.mutate({ id: editing.id, ...input }, onSettled);
    } else {
      createPlan.mutate(input, onSettled);
    }
  }

  const columns: Column<Plan>[] = useMemo(
    () => [
      { key: 'name', header: 'Name', render: (p) => <span className="font-medium text-gray-900">{p.name}</span>, sortValue: (p) => p.name },
      { key: 'seatLimit', header: 'Seats', render: (p) => p.seatLimit, sortValue: (p) => p.seatLimit },
      { key: 'candidateLimit', header: 'Candidates', render: (p) => p.candidateLimit, sortValue: (p) => p.candidateLimit },
      { key: 'aiCreditLimit', header: 'AI Credits', render: (p) => p.aiCreditLimit, sortValue: (p) => p.aiCreditLimit },
      {
        key: 'proctoringMinutesLimit',
        header: 'Proctoring Minutes',
        render: (p) => p.proctoringMinutesLimit,
        sortValue: (p) => p.proctoringMinutesLimit,
      },
      { key: 'priceLabel', header: 'Price', render: (p) => p.priceLabel ?? '—', sortValue: (p) => p.priceLabel ?? '' },
      {
        key: 'isPublic',
        header: 'Visibility',
        render: (p) => <StatusBadge tone={p.isPublic ? 'success' : 'neutral'}>{p.isPublic ? 'Public' : 'Hidden'}</StatusBadge>,
        sortValue: (p) => (p.isPublic ? 1 : 0),
      },
      {
        key: 'actions',
        header: '',
        render: (p) => <RowActions label={`Actions for ${p.name}`} actions={[{ label: 'Edit', onSelect: () => openEdit(p) }]} />,
      },
    ],
    [],
  );

  const formOpen = creating || editing !== null;

  return (
    <>
      <ListView<Plan>
        title="Plans"
        icon={<CreditCard size={22} />}
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        searchMatch={(p, query) => p.name.toLowerCase().includes(query)}
        storageKey="plans"
        searchPlaceholder="Search plans…"
        emptyMessage="No plans yet."
        isLoading={isLoading}
        isError={isError}
        actions={<Button onClick={openCreate}>New plan</Button>}
      />

      <Modal open={formOpen} title={editing ? `Edit ${editing.name}` : 'New Plan'} onClose={closeForm}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
          <Input
            label="Seat limit"
            type="number"
            min={0}
            value={form.seatLimit}
            onChange={(v) => setForm({ ...form, seatLimit: v })}
            required
          />
          <Input
            label="Candidate limit"
            type="number"
            min={0}
            value={form.candidateLimit}
            onChange={(v) => setForm({ ...form, candidateLimit: v })}
            required
          />
          <Input
            label="AI credit limit"
            type="number"
            min={0}
            value={form.aiCreditLimit}
            onChange={(v) => setForm({ ...form, aiCreditLimit: v })}
            required
          />
          <Input
            label="Proctoring minutes limit"
            type="number"
            min={0}
            value={form.proctoringMinutesLimit}
            onChange={(v) => setForm({ ...form, proctoringMinutesLimit: v })}
            required
          />
          <Input label="Price label" value={form.priceLabel} onChange={(v) => setForm({ ...form, priceLabel: v })} />
          <Checkbox
            label="Public (visible on the pricing page)"
            checked={form.isPublic}
            onChange={(v) => setForm({ ...form, isPublic: v })}
          />
          <Button type="submit" loading={createPlan.isPending || updatePlan.isPending}>
            {editing ? 'Save' : 'Create plan'}
          </Button>
        </form>
        {error && (
          <p role="alert" className="mt-3 text-sm text-status-danger">
            {error}
          </p>
        )}
      </Modal>
    </>
  );
}
