'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { useOrganizations, useSetOrganizationStatus } from '../../../lib/hooks/useOrganizations';
import { Button, StatusBadge, useToast, type Column } from '../../../components/ui';
import { Organization } from '../../../lib/types';
import { useAuth } from '../../../lib/auth-context';
import { ListView } from '../components/ListView';
import { RowActions } from '../components/RowActions';
import { CreateOrganizationModal } from './CreateOrganizationModal';
import { EditOrganizationModal } from './EditOrganizationModal';
import { DeleteOrganizationDialog } from './DeleteOrganizationDialog';

export default function OrganizationsPage() {
  const router = useRouter();
  const { switchIntoOrg } = useAuth();
  const { data, isLoading, isError } = useOrganizations();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);
  const [deleting, setDeleting] = useState<Organization | null>(null);
  const setStatus = useSetOrganizationStatus();
  const { toast } = useToast();

  const organizations = useMemo(() => data?.data ?? [], [data]);

  const columns: Column<Organization>[] = useMemo(() => {
    async function handleSwitchInto(orgId: string) {
      await switchIntoOrg(orgId);
      router.push('/dashboard');
    }

    function handleSetStatus(org: Organization, status: 'active' | 'suspended') {
      setStatus.mutate(
        { id: org.id, status },
        {
          onSuccess: () => toast(status === 'suspended' ? `${org.name} suspended.` : `${org.name} reactivated.`),
          onError: (err) => toast(err instanceof Error ? err.message : 'Failed to change status', 'error'),
        },
      );
    }

    return [
      { key: 'name', header: 'Name', render: (org) => <span className="font-medium text-gray-900">{org.name}</span>, sortValue: (org) => org.name },
      { key: 'slug', header: 'Slug', render: (org) => org.slug, sortValue: (org) => org.slug },
      // Creation stores only the admin's email; the name arrives when they set
      // their own password, so this is empty for a freshly created organization.
      { key: 'primaryAdmin', header: 'Primary admin', render: (org) => org.primaryAdminName ?? '—', sortValue: (org) => org.primaryAdminName ?? '' },
      { key: 'adminEmail', header: 'Admin email', render: (org) => org.primaryAdminEmail ?? '—', sortValue: (org) => org.primaryAdminEmail ?? '' },
      { key: 'region', header: 'Region', render: (org) => org.region.toUpperCase(), sortValue: (org) => org.region },
      {
        key: 'status',
        header: 'Status',
        render: (org) => (
          <StatusBadge tone={org.status === 'active' ? 'success' : 'warning'}>
            {org.status === 'active' ? 'Active' : 'Suspended'}
          </StatusBadge>
        ),
        sortValue: (org) => org.status,
      },
      { key: 'users', header: 'Users', render: (org) => org.userCount, sortValue: (org) => org.userCount },
      { key: 'exams', header: 'Exams', render: (org) => org.examCount, sortValue: (org) => org.examCount },
      { key: 'created', header: 'Created', render: (org) => new Date(org.createdAt).toLocaleDateString(), sortValue: (org) => org.createdAt },
      {
        key: 'actions',
        header: '',
        render: (org) => (
          <RowActions
            label={`Actions for ${org.name}`}
            actions={[
              { label: 'Switch into', onSelect: () => void handleSwitchInto(org.id) },
              { label: 'Edit', onSelect: () => setEditing(org) },
              org.status === 'active'
                ? { label: 'Suspend', onSelect: () => handleSetStatus(org, 'suspended'), danger: true }
                : { label: 'Reactivate', onSelect: () => handleSetStatus(org, 'active') },
              // The All Users directory carries organizationName, not a slug.
              { label: 'View users', onSelect: () => router.push(`/all-users?org=${encodeURIComponent(org.name)}`) },
              { label: 'Delete', onSelect: () => setDeleting(org), danger: true },
            ]}
          />
        ),
      },
    ];
  }, [router, switchIntoOrg, setStatus, toast]);

  return (
    <>
      <ListView<Organization>
        title="Organizations"
        icon={<Building2 size={22} />}
        columns={columns}
        rows={organizations}
        rowKey={(org) => org.id}
        searchMatch={(org, query) =>
          org.name.toLowerCase().includes(query) ||
          org.slug.toLowerCase().includes(query) ||
          (org.primaryAdminEmail ?? '').toLowerCase().includes(query)
        }
        storageKey="organizations"
        defaultHiddenColumns={['exams']}
        searchPlaceholder="Search organizations…"
        emptyMessage="No organizations yet."
        isLoading={isLoading}
        isError={isError}
        totalCount={data?.total}
        actions={<Button onClick={() => setCreateOpen(true)}>New</Button>}
      />
      <CreateOrganizationModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <EditOrganizationModal organization={editing} onClose={() => setEditing(null)} />
      <DeleteOrganizationDialog organization={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}
