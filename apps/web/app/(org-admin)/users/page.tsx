'use client';

import { useState } from 'react';
import { useUsers, useCreateUser } from '../../../lib/hooks/useUsers';
import { useCurrentUser } from '../../../lib/hooks/useCurrentUser';
import { useAuth } from '../../../lib/auth-context';
import { Input, Select, Button, useToast } from '../../../components/ui';
import { StaffUsersTable } from '../../../components/StaffUsersTable';

const ROLE_OPTIONS = [
  { value: 'org_admin', label: 'Org Admin' },
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'panel', label: 'Interview Panel' },
];

export default function UsersPage() {
  const { role, actingSuperAdmin } = useAuth();
  const { data: currentUser } = useCurrentUser();
  // ListView sorts and filters client-side, so a paginated slice would only ever
  // sort/filter the visible page. Fetch one large page instead.
  const { data: usersResponse, isLoading, isError } = useUsers({ pageSize: 200 });
  const createUser = useCreateUser();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role_, setRole] = useState('recruiter');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    createUser.mutate(
      { email, password, role: role_ },
      {
        onSuccess: () => {
          toast(`Added ${email} as ${role_}.`);
          setEmail('');
          setPassword('');
          setRole('recruiter');
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to add user'),
      },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* The inline create form stays here until Task 12 moves it into NewUserModal
          behind ListView's `actions` slot. */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <Input label="Email" type="email" value={email} onChange={setEmail} required />
        <Input label="Password" type="password" value={password} onChange={setPassword} required minLength={8} />
        <Select label="Role" value={role_} onChange={setRole} options={ROLE_OPTIONS} />
        <Button type="submit">Add staff member</Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-status-danger">
          {error}
        </p>
      )}
      <StaffUsersTable
        users={usersResponse?.data ?? []}
        currentUserRole={role}
        isActingSuperAdmin={actingSuperAdmin}
        currentUserId={currentUser?.id ?? ''}
        isLoading={isLoading}
        isError={isError}
        totalCount={usersResponse?.total}
      />
    </div>
  );
}
