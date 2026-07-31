'use client';

import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Users } from 'lucide-react';
import { useUserDirectory } from '../../../lib/hooks/useUserDirectory';
import { useAuth } from '../../../lib/auth-context';
import { type Column } from '../../../components/ui';
import { DirectoryUser } from '../../../lib/types';
import { ListView } from '../components/ListView';
import { RowActions } from '../components/RowActions';

// Matches the server's MAX_PAGE_SIZE in apps/api/src/common/paginated-response.ts.
// Asking for more is silently clamped; ListView reports the shortfall instead of
// quietly truncating.
const DIRECTORY_PAGE_SIZE = 100;

export default function UsersDirectoryPage() {
  const router = useRouter();
  const { switchIntoOrg } = useAuth();
  const searchParams = useSearchParams();
  const { data, isLoading, isError } = useUserDirectory({ pageSize: DIRECTORY_PAGE_SIZE });

  const users = useMemo(() => data?.data ?? [], [data]);

  const columns: Column<DirectoryUser>[] = useMemo(() => {
    async function handleManage(user: DirectoryUser) {
      if (!user.organizationId) return;
      await switchIntoOrg(user.organizationId);
      router.push('/users');
    }

    return [
      { key: 'email', header: 'Email', render: (u) => <span className="font-medium text-gray-900">{u.email}</span>, sortValue: (u) => u.email },
      { key: 'name', header: 'Name', render: (u) => u.name ?? '—', sortValue: (u) => u.name ?? '' },
      { key: 'role', header: 'Role', render: (u) => u.role, sortValue: (u) => u.role },
      { key: 'organization', header: 'Organization', render: (u) => u.organizationName ?? '—', sortValue: (u) => u.organizationName ?? '' },
      { key: 'status', header: 'Status', render: (u) => u.status, sortValue: (u) => u.status },
      {
        key: 'actions',
        header: '',
        render: (u) => (
          <RowActions
            label={`Actions for ${u.email}`}
            // A user with no organization has nothing to manage. RowActions
            // renders nothing for an empty list, which reproduces the old
            // conditional button without a special case here.
            actions={u.organizationId ? [{ label: 'Manage', onSelect: () => void handleManage(u) }] : []}
          />
        ),
      },
    ];
  }, [router, switchIntoOrg]);

  return (
    <ListView<DirectoryUser>
      title="All Users"
      icon={<Users size={22} />}
      columns={columns}
      rows={users}
      rowKey={(u) => u.id}
      // The organization name is included so the Organizations tab's "View users"
      // link (/all-users?org=<name>) actually filters to something.
      searchMatch={(u, query) =>
        u.email.toLowerCase().includes(query) ||
        (u.name ?? '').toLowerCase().includes(query) ||
        (u.organizationName ?? '').toLowerCase().includes(query)
      }
      storageKey="all-users"
      searchPlaceholder="Search users…"
      emptyMessage="No users found."
      isLoading={isLoading}
      isError={isError}
      totalCount={data?.total}
      initialSearch={searchParams.get('org') ?? ''}
    />
  );
}
