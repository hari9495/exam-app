'use client';

import { useState } from 'react';
import { useOrganizations, useCreateOrganization } from '../../../lib/hooks/useOrganizations';
import { Table, Input, Select, Button, Card, useToast, Pagination, type Column } from '../../../components/ui';
import { Organization } from '../../../lib/types';

const REGION_OPTIONS = [
  { value: 'us', label: 'US' },
  { value: 'eu', label: 'EU' },
];

export default function OrganizationsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const { data: organizationsResponse, isLoading, isError } = useOrganizations({ page, pageSize: 20, search: search || undefined });
  const createOrganization = useCreateOrganization();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [region, setRegion] = useState('us');
  const [adminEmail, setAdminEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    createOrganization.mutate(
      { name, slug, region, adminEmail },
      {
        onSuccess: () => {
          toast(`Created ${name}. A setup email was sent to ${adminEmail}.`);
          setName('');
          setSlug('');
          setRegion('us');
          setAdminEmail('');
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create organization'),
      },
    );
  }

  const columns: Column<Organization>[] = [
    { key: 'name', header: 'Name', render: (org) => org.name, sortValue: (org) => org.name },
    { key: 'slug', header: 'Slug', render: (org) => org.slug, sortValue: (org) => org.slug },
    { key: 'region', header: 'Region', render: (org) => org.region.toUpperCase() },
    {
      key: 'createdAt',
      header: 'Created',
      render: (org) => new Date(org.createdAt).toLocaleDateString(),
      sortValue: (org) => org.createdAt,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-gray-900">Organizations</h1>
      <Card className="max-w-lg">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Create organization</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input label="Name" value={name} onChange={setName} required />
          <Input label="Slug" value={slug} onChange={setSlug} required />
          <Select label="Region" value={region} onChange={setRegion} options={REGION_OPTIONS} />
          <Input label="Admin email" type="email" value={adminEmail} onChange={setAdminEmail} required />
          <Button type="submit">Create organization</Button>
        </form>
        {error && (
          <p role="alert" className="mt-3 text-sm text-status-danger">
            {error}
          </p>
        )}
      </Card>
      <Input
        label="Search organizations"
        placeholder="Name or slug…"
        value={search}
        onChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
      />
      {isLoading && <p className="text-sm text-gray-500">Loading organizations…</p>}
      {isError && (
        <p role="alert" className="text-sm text-status-danger">
          Failed to load organizations.
        </p>
      )}
      {!isLoading && !isError && (
        <>
          <Table columns={columns} rows={organizationsResponse?.data ?? []} rowKey={(org) => org.id} emptyMessage="No organizations yet." />
          <Pagination page={organizationsResponse?.page ?? 1} totalPages={organizationsResponse?.totalPages ?? 1} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
