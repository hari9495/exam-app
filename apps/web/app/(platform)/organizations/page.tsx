'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useOrganizations, useCreateOrganization } from '../../../lib/hooks/useOrganizations';
import { CardGrid, Input, Select, Button, Card, useToast, Pagination } from '../../../components/ui';
import { Organization } from '../../../lib/types';
import { useAuth } from '../../../lib/auth-context';

const REGION_OPTIONS = [
  { value: 'us', label: 'US' },
  { value: 'eu', label: 'EU' },
];

export default function OrganizationsPage() {
  const router = useRouter();
  const { switchIntoOrg } = useAuth();
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

  async function handleSwitchInto(orgId: string) {
    await switchIntoOrg(orgId);
    router.push('/dashboard');
  }

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

  function renderCard(org: Organization) {
    return (
      <div className="flex flex-col gap-1">
        <p className="truncate text-sm font-semibold text-gray-900">{org.name}</p>
        <p className="text-xs text-gray-500">{org.slug}</p>
        <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
          <span>{org.region.toUpperCase()}</span>
          <span>{new Date(org.createdAt).toLocaleDateString()}</span>
        </div>
        <Button variant="secondary" onClick={() => handleSwitchInto(org.id)} className="mt-2">
          Switch into
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-gray-900">Organizations</h1>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
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
      </motion.div>
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
          <CardGrid items={organizationsResponse?.data ?? []} cardKey={(org) => org.id} renderCard={renderCard} emptyMessage="No organizations yet." />
          <Pagination page={organizationsResponse?.page ?? 1} totalPages={organizationsResponse?.totalPages ?? 1} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
