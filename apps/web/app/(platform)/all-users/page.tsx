'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserDirectory } from '../../../lib/hooks/useUserDirectory';
import { useAuth } from '../../../lib/auth-context';
import { Input, Pagination, Button } from '../../../components/ui';
import { DirectoryUser } from '../../../lib/types';

export default function UsersDirectoryPage() {
  const router = useRouter();
  const { switchIntoOrg } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const { data, isLoading, isError } = useUserDirectory({ page, pageSize: 20, search: search || undefined });

  async function handleManage(user: DirectoryUser) {
    if (!user.organizationId) {
      return;
    }
    await switchIntoOrg(user.organizationId);
    router.push('/users');
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-gray-900">All Users</h1>
      <Input
        label="Search users"
        placeholder="Email…"
        value={search}
        onChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
      />
      {isLoading && <p className="text-sm text-gray-500">Loading users…</p>}
      {isError && (
        <p role="alert" className="text-sm text-status-danger">
          Failed to load users.
        </p>
      )}
      {!isLoading && !isError && (data?.data ?? []).length === 0 && (
        <p className="text-sm text-gray-500">No users found.</p>
      )}
      {!isLoading && !isError && (data?.data ?? []).length > 0 && (
        <>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs font-medium uppercase text-gray-500">
                <th className="py-2">Email</th>
                <th className="py-2">Name</th>
                <th className="py-2">Role</th>
                <th className="py-2">Organization</th>
                <th className="py-2">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {(data?.data ?? []).map((user) => (
                <tr key={user.id} className="border-b border-gray-100">
                  <td className="py-2">{user.email}</td>
                  <td className="py-2">{user.name ?? '—'}</td>
                  <td className="py-2">{user.role}</td>
                  <td className="py-2">{user.organizationName ?? '—'}</td>
                  <td className="py-2">{user.status}</td>
                  <td className="py-2">
                    {user.organizationId && (
                      <Button variant="secondary" onClick={() => handleManage(user)}>
                        Manage
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={data?.page ?? 1} totalPages={data?.totalPages ?? 1} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
