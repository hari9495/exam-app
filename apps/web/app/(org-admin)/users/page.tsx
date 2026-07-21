'use client';

import { useState } from 'react';
import { useUsers, useCreateUser } from '../../../lib/hooks/useUsers';
import { CardGrid, Input, Select, Button, StatusBadge, useToast, Pagination, type StatusTone } from '../../../components/ui';
import { StaffUser } from '../../../lib/types';

const ROLE_OPTIONS = [
  { value: 'org_admin', label: 'Org Admin' },
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'panel', label: 'Interview Panel' },
];

const ROLE_TONE: Record<string, StatusTone> = {
  org_admin: 'purple',
  recruiter: 'info',
  panel: 'neutral',
};

const ROLE_LABEL: Record<string, string> = {
  org_admin: 'Org Admin',
  recruiter: 'Recruiter',
  panel: 'Interview Panel',
};

// StaffUser.status is an unconstrained backend string (no enum/check constraint) whose
// only real value today is 'active' -- default unknown/future values to a neutral tone
// and a title-cased label rather than assuming a closed set.
function statusTone(status: string): StatusTone {
  return status === 'active' ? 'success' : 'neutral';
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function UsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const { data: usersResponse, isLoading, isError } = useUsers({ page, pageSize: 20, search: search || undefined });
  const createUser = useCreateUser();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('recruiter');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    createUser.mutate(
      { email, password, role },
      {
        onSuccess: () => {
          toast(`Added ${email} as ${role}.`);
          setEmail('');
          setPassword('');
          setRole('recruiter');
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to add user'),
      },
    );
  }

  function renderCard(user: StaffUser) {
    return (
      <div>
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 truncate font-semibold text-recruiter-text">{user.email}</div>
          <StatusBadge tone={ROLE_TONE[user.role] ?? 'neutral'}>{ROLE_LABEL[user.role] ?? user.role}</StatusBadge>
        </div>
        <div className="flex items-center justify-between border-t border-recruiter-border pt-2.5 text-xs text-recruiter-text-tertiary">
          <StatusBadge tone={statusTone(user.status)}>{statusLabel(user.status)}</StatusBadge>
          <span>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}</span>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Staff Users</h1>
        <p className="text-sm text-recruiter-text-tertiary">Loading…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Staff Users</h1>
        <p role="alert" className="text-sm text-status-danger">
          Failed to load users.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Staff Users</h1>
      <form onSubmit={handleSubmit} className="mb-6 flex items-end gap-2">
        <Input label="Email" type="email" value={email} onChange={setEmail} required />
        <Input label="Password" type="password" value={password} onChange={setPassword} required minLength={8} />
        <Select label="Role" value={role} onChange={setRole} options={ROLE_OPTIONS} />
        <Button type="submit">Add staff member</Button>
      </form>
      {error && (
        <p role="alert" className="mb-4 text-sm text-status-danger">
          {error}
        </p>
      )}
      <div className="mb-3 max-w-xs">
        <Input
          label="Search staff users"
          placeholder="Email…"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
      </div>
      <CardGrid items={usersResponse?.data ?? []} cardKey={(user) => user.id} renderCard={renderCard} emptyMessage="No staff users yet." />
      <Pagination page={usersResponse?.page ?? 1} totalPages={usersResponse?.totalPages ?? 1} onPageChange={setPage} />
    </div>
  );
}
