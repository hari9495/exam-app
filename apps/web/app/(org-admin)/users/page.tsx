'use client';

import { useState } from 'react';
import { useUsers, useCreateUser } from '../../../lib/hooks/useUsers';
import { Table, Input, Select, Button, useToast, type Column } from '../../../components/ui';
import { StaffUser } from '../../../lib/types';

const ROLE_OPTIONS = [
  { value: 'org_admin', label: 'Org Admin' },
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'panel', label: 'Interview Panel' },
];

export default function UsersPage() {
  const { data: users, isLoading, isError } = useUsers();
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

  const columns: Column<StaffUser>[] = [
    { key: 'email', header: 'Email', render: (user) => user.email, sortValue: (user) => user.email },
    { key: 'role', header: 'Role', render: (user) => user.role, sortValue: (user) => user.role },
    { key: 'status', header: 'Status', render: (user) => user.status },
    {
      key: 'lastLoginAt',
      header: 'Last login',
      render: (user) => (user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'),
    },
  ];

  if (isLoading) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold">Staff Users</h1>
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold">Staff Users</h1>
        <p role="alert" className="text-sm text-red-600">
          Failed to load users.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Staff Users</h1>
      <form onSubmit={handleSubmit} className="mb-6 flex items-end gap-2">
        <Input label="Email" type="email" value={email} onChange={setEmail} required />
        <Input label="Password" type="password" value={password} onChange={setPassword} required minLength={8} />
        <Select label="Role" value={role} onChange={setRole} options={ROLE_OPTIONS} />
        <Button type="submit">Add staff member</Button>
      </form>
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}
      <Table columns={columns} rows={users ?? []} rowKey={(user) => user.id} emptyMessage="No staff users yet." />
    </div>
  );
}
