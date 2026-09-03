'use client';

// v2 All Users (platform / super-admin) — format-only re-skin of the old (platform)/all-users page
// (ListView + RowActions). Same hooks (useUserDirectory pageSize 100, useAuth.switchIntoOrg) and
// identical logic: client-side search over email/name/organizationName, "Manage" only for users with
// an organization (switch into the org, then go to /users). Old ListView → shared DataTable; old
// RowActions kebab → v2 Dropdown. useSearchParams (?org=<name>) seeds the initial search, so the body
// is wrapped in <Suspense>.
import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, LogIn, Users, UserCheck, Building2, UserMinus } from 'lucide-react';
import { useUserDirectory } from '../../../../lib/hooks/useUserDirectory';
import { useAuth } from '../../../../lib/auth-context';
import type { DirectoryUser } from '../../../../lib/types';
import { DataTable, DT_FEATURES, dt, SortHead, Pill, Dropdown, DropdownItem, IconStatCard } from '../../../../components/ui-v2';
import { STATUS, VIZ } from '../../../../components/ui-v2/viz';

// Matches the server's MAX_PAGE_SIZE in apps/api/src/common/paginated-response.ts.
const DIRECTORY_PAGE_SIZE = 100;

function AllUsersInner() {
  const router = useRouter();
  const { switchIntoOrg } = useAuth();
  const searchParams = useSearchParams();
  const { data, isLoading, isError } = useUserDirectory({ pageSize: DIRECTORY_PAGE_SIZE });

  // The Organizations tab's "View users" link (/v2/all-users?org=<name>) seeds the search.
  const [search, setSearch] = useState(searchParams.get('org') ?? '');

  const q = search.trim().toLowerCase();
  const rows = useMemo(() => (data?.data ?? []).filter((u) =>
    !q ||
    u.email.toLowerCase().includes(q) ||
    (u.name ?? '').toLowerCase().includes(q) ||
    (u.organizationName ?? '').toLowerCase().includes(q)
  ), [data, q]);

  // Stats strip reflects the whole directory, not the current search.
  const allUsers = data?.data ?? [];
  const stats = useMemo(() => ({
    total: allUsers.length,
    active: allUsers.filter((u) => u.status === 'active').length,
    orgs: new Set(allUsers.map((u) => u.organizationId).filter(Boolean)).size,
    noOrg: allUsers.filter((u) => !u.organizationId).length,
  }), [allUsers]);

  async function handleManage(user: DirectoryUser) {
    if (!user.organizationId) return;
    await switchIntoOrg(user.organizationId);
    router.push('/users');
  }

  const columns: ColumnDef<typeof DT_FEATURES, DirectoryUser>[] = [
    { accessorKey: 'email', enableHiding: false, header: ({ column }) => <SortHead label="Email" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{row.original.email}</span> },
    { accessorKey: 'name', header: ({ column }) => <SortHead label="Name" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{row.original.name ?? '—'}</span> },
    { accessorKey: 'role', header: ({ column }) => <SortHead label="Role" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{row.original.role}</span> },
    { accessorKey: 'organizationName', header: ({ column }) => <SortHead label="Organization" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={{ color: 'var(--ink)' }}>{row.original.organizationName ?? '—'}</span> },
    { accessorKey: 'status', header: ({ column }) => <SortHead label="Status" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <Pill c={row.original.status === 'active' ? STATUS.ok : 'var(--muted)'} label={row.original.status} /> },
    {
      id: 'actions', enableSorting: false, enableHiding: false, header: () => null,
      cell: ({ row }) => {
        const u = row.original;
        // A user with no organization has nothing to manage — reproduces the old empty-actions row.
        if (!u.organizationId) return null;
        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <Dropdown align="end" menuWidth={160} trigger={<span style={{ display: 'inline-grid', placeItems: 'center', width: 30, height: 30, color: 'var(--muted)', cursor: 'pointer' }}><MoreHorizontal size={17} /></span>}>
              {(close) => <DropdownItem onClick={() => { close(); void handleManage(u); }}><LogIn size={15} /> Manage</DropdownItem>}
            </Dropdown>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', margin: 0 }}>Platform</p>
        <h1 className="v2-title" style={{ fontSize: 22, margin: '2px 0 0' }}>All Users</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>Everyone across every organization — switch in to manage a user&apos;s org.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }} className="wf-hero-kpis">
        <IconStatCard title="Total users" value={stats.total} icon={<Users size={22} />} accent={VIZ.azure} />
        <IconStatCard title="Active" value={stats.active} icon={<UserCheck size={22} />} accent={VIZ.teal} />
        <IconStatCard title="Organizations" value={stats.orgs} icon={<Building2 size={22} />} accent={VIZ.violet} />
        <IconStatCard title="No organization" value={stats.noOrg} icon={<UserMinus size={22} />} accent={VIZ.amber} />
      </div>

      <DataTable
        columns={columns} data={rows} getRowId={(u) => u.id}
        search={search} onSearchChange={setSearch} searchPlaceholder="Search users…"
        isLoading={isLoading} isError={isError} errorMessage="Failed to load users." emptyMessage={q ? 'No matching users.' : 'No users found.'}
        columnLabels={{ email: 'Email', name: 'Name', role: 'Role', organizationName: 'Organization', status: 'Status' }}
      />
    </>
  );
}

export default function V2AllUsersPage() {
  return (
    <Suspense fallback={<p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</p>}>
      <AllUsersInner />
    </Suspense>
  );
}
