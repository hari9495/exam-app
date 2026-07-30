'use client';

import { useState } from 'react';
import { useUsers } from '../../../lib/hooks/useUsers';
import { useCurrentUser } from '../../../lib/hooks/useCurrentUser';
import { useAuth } from '../../../lib/auth-context';
import { Button } from '../../../components/ui';
import { StaffUsersTable } from '../../../components/StaffUsersTable';
import { NewUserModal } from '../../../components/NewUserModal';

export default function UsersPage() {
  const { role, actingSuperAdmin } = useAuth();
  const { data: currentUser } = useCurrentUser();
  // ListView sorts and filters client-side, so a paginated slice would only ever
  // sort/filter the visible page. Fetch one large page instead.
  const { data: usersResponse, isLoading, isError } = useUsers({ pageSize: 200 });
  const [showNew, setShowNew] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <StaffUsersTable
        users={usersResponse?.data ?? []}
        currentUserRole={role}
        isActingSuperAdmin={actingSuperAdmin}
        currentUserId={currentUser?.id ?? ''}
        isLoading={isLoading}
        isError={isError}
        totalCount={usersResponse?.total}
        actions={<Button onClick={() => setShowNew(true)}>New User</Button>}
      />
      <NewUserModal open={showNew} onClose={() => setShowNew(false)} />
    </div>
  );
}
