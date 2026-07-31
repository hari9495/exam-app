'use client';

import { useState } from 'react';
import { useCreateOrganization } from '../../../lib/hooks/useOrganizations';
import { Modal, Input, Select, Button, useToast } from '../../../components/ui';

const REGION_OPTIONS = [
  { value: 'us', label: 'US' },
  { value: 'eu', label: 'EU' },
];

export function CreateOrganizationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createOrganization = useCreateOrganization();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [region, setRegion] = useState('us');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    createOrganization.mutate(
      { name, slug, region, adminEmail, adminName },
      {
        onSuccess: () => {
          toast(`Created ${name}. A setup email was sent to ${adminEmail}.`);
          setName('');
          setSlug('');
          setRegion('us');
          setAdminEmail('');
          setAdminName('');
          onClose();
        },
        // Deliberately not closing on failure: a slug clash is the common case,
        // and closing would throw away everything the operator typed.
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create organization'),
      },
    );
  }

  return (
    <Modal open={open} title="New organization" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input label="Name" value={name} onChange={setName} required />
        <Input label="Slug" value={slug} onChange={setSlug} required />
        <Select label="Region" value={region} onChange={setRegion} options={REGION_OPTIONS} />
        <Input label="Admin name" value={adminName} onChange={setAdminName} required />
        <Input label="Admin email" type="email" value={adminEmail} onChange={setAdminEmail} required />
        <Button type="submit" loading={createOrganization.isPending}>
          Create organization
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-status-danger">
          {error}
        </p>
      )}
    </Modal>
  );
}
