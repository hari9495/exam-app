'use client';

import { useEffect, useState } from 'react';
import { useDeleteOrganization } from '../../../lib/hooks/useOrganizations';
import { Modal, Input, Button, useToast } from '../../../components/ui';
import { Organization } from '../../../lib/types';

export function DeleteOrganizationDialog({
  organization,
  onClose,
}: {
  organization: Organization | null;
  onClose: () => void;
}) {
  const deleteOrganization = useDeleteOrganization();
  const { toast } = useToast();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  // The dialog stays mounted between rows. Without this reset, a slug typed for
  // one organization would leave the button armed for the next one opened.
  useEffect(() => {
    setTyped('');
    setError(null);
  }, [organization]);

  function handleDelete() {
    if (!organization) return;
    setError(null);
    deleteOrganization.mutate(organization.id, {
      onSuccess: () => {
        toast(`${organization.name} deleted.`);
        onClose();
      },
      // Notably the live-exam 409 lands here. Staying open keeps the message in
      // front of the operator instead of dropping them back to the list.
      onError: (err) => setError(err instanceof Error ? err.message : 'Failed to delete organization'),
    });
  }

  return (
    <Modal open={organization !== null} title="Delete organization" onClose={onClose}>
      {organization && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-gray-700">
            <strong>{organization.name}</strong> will be removed from the console and nobody in it will be able to
            sign in. Its {organization.userCount} users and {organization.examCount} exams are retained, not erased,
            so this can be reversed.
          </p>
          <Input label={`Type ${organization.slug} to confirm`} value={typed} onChange={setTyped} />
          <Button
            variant="danger"
            onClick={handleDelete}
            disabled={typed !== organization.slug}
            loading={deleteOrganization.isPending}
          >
            Delete organization
          </Button>
          {error && (
            <p role="alert" className="text-sm text-status-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
