'use client';

import { useEffect, useMemo, useState } from 'react';
import { useUpdateOrganization } from '../../../lib/hooks/useOrganizations';
import { usePlans, useAssignPlan } from '../../../lib/hooks/usePlans';
import { Modal, Input, Select, Button, useToast } from '../../../components/ui';
import { Organization } from '../../../lib/types';

const REGION_OPTIONS = [
  { value: 'us', label: 'US' },
  { value: 'eu', label: 'EU' },
];

export function EditOrganizationModal({
  organization,
  onClose,
}: {
  organization: Organization | null;
  onClose: () => void;
}) {
  const updateOrganization = useUpdateOrganization();
  const { data: plans } = usePlans();
  const assignPlan = useAssignPlan();
  const { toast } = useToast();
  const [name, setName] = useState(organization?.name ?? '');
  const [region, setRegion] = useState(organization?.region ?? 'us');
  const [error, setError] = useState<string | null>(null);
  const [planId, setPlanId] = useState('');
  const [planError, setPlanError] = useState<string | null>(null);

  // The modal stays mounted across row selections, so the fields must re-seed
  // when a different organization is chosen. Without this the second row opened
  // would show the first row's values -- and saving would write them to the
  // wrong organization.
  useEffect(() => {
    setName(organization?.name ?? '');
    setRegion(organization?.region ?? 'us');
    setError(null);
    // The organizations list doesn't carry the org's current plan, so this can't be
    // pre-seeded from `organization` -- it starts blank and the operator picks one.
    setPlanId('');
    setPlanError(null);
  }, [organization]);

  const planOptions = useMemo(
    () => (Array.isArray(plans) ? plans : []).map((plan) => ({ value: plan.id, label: plan.name })),
    [plans],
  );

  function handleAssignPlan() {
    if (!organization || !planId) return;
    setPlanError(null);
    assignPlan.mutate(
      { id: organization.id, planId },
      {
        onSuccess: () => toast(`Assigned plan to ${organization.name}.`),
        onError: (err) => setPlanError(err instanceof Error ? err.message : 'Failed to assign plan'),
      },
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!organization) return;
    setError(null);
    updateOrganization.mutate(
      { id: organization.id, name, region },
      {
        onSuccess: () => {
          toast(`Updated ${name}.`);
          onClose();
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to update organization'),
      },
    );
  }

  return (
    <Modal open={organization !== null} title="Edit Organization" onClose={onClose}>
      {organization && (
        <>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Input label="Name" value={name} onChange={setName} required />
            <div className="text-sm">
              <span className="block text-xs font-medium text-muted">Slug</span>
              <span className="text-gray-900">{organization.slug}</span>
              <p className="mt-1 text-xs text-muted">
                The slug cannot be changed — it appears in invitation links and SSO configuration.
              </p>
            </div>
            <Select label="Region" value={region} onChange={setRegion} options={REGION_OPTIONS} />
            <Button type="submit" loading={updateOrganization.isPending}>
              Save
            </Button>
          </form>
          {error && (
            <p role="alert" className="mt-3 text-sm text-status-danger">
              {error}
            </p>
          )}

          <div className="mt-4 flex flex-col gap-3 border-t border-rule pt-4">
            <Select label="Plan" value={planId} onChange={setPlanId} options={planOptions} />
            <Button
              type="button"
              variant="secondary"
              onClick={handleAssignPlan}
              disabled={!planId}
              loading={assignPlan.isPending}
            >
              Assign plan
            </Button>
            {planError && (
              <p role="alert" className="text-sm text-status-danger">
                {planError}
              </p>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
