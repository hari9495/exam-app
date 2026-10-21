'use client';

import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { NoAccessState, Spinner, useToast } from '@yukthix/ui';
import { BulkChangesWizard, type IncrementInput, type IncrementResult } from '@yukthix/ui/frame';
import { apiFetch, apiFetchBlob } from '../../../../../../lib/api-client';
import { useAuth } from '../../../../../../lib/auth-context';
import { useYxPermissions } from '../../../../../../lib/yx-org';
import { useJoinerPlaces } from '../../../../../../lib/yx-lifecycle';
import { usePeopleWrite } from '../../../../../../lib/yx-people';

// People › Bulk changes › Annual increment (PPL-06): the designed wizard with the company's people, ratings and pay.
// Pay is shown only with the salary grant (R1); the API checks every grant again and only lists people they all reach.
export default function YxIncrementPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { accessToken } = useAuth();
  const perms = useYxPermissions();
  const allowed = perms.has('employee.change.manage') && perms.has('employee.salary.manage') && perms.has('employee.salary.view');
  const places = useJoinerPlaces(allowed);
  const write = usePeopleWrite();
  // A dry run keeps nothing, so it does not refresh the other people queries.
  const onCheck = useCallback((input: IncrementInput) => apiFetch('/people/change-batches/increment', { method: 'POST', body: JSON.stringify({ ...input, dryRun: true }) }, accessToken ?? undefined) as Promise<IncrementResult>, [accessToken]);
  const live = useMemo(
    () => ({
      entities: places.entities,
      departments: places.departments,
      today: new Date(),
      canRate: perms.has('perf.review.view'),
      onCheck,
      onPreviewLetter: async (input: IncrementInput, employeeId: string) => {
        const { blob } = await apiFetchBlob('/people/change-batches/increment/letter-preview', { method: 'POST', body: JSON.stringify({ ...input, employeeId }) }, accessToken ?? undefined);
        return { url: URL.createObjectURL(blob), size: blob.size };
      },
      lettersHref: '/yx/settings/letters',
      onSend: async (input: IncrementInput, people: number) => {
        const r = await write<{ batch: { id: string } }>('POST', '/change-batches/increment', input);
        toast({ tone: 'success', title: `Annual increment for ${people} ${people === 1 ? 'person' : 'people'} sent for approval` });
        router.push(`/yx/people/bulk-changes?batch=${encodeURIComponent(r.batch.id)}`);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [places.entities.length, places.departments.length, onCheck, accessToken],
  );
  if (!perms.data) return <Spinner label="Loading" size="md" />;
  if (!allowed) return <NoAccessState what="the annual increment" grantedBy="It needs the salary grant and the right to change jobs. HR can grant it." />;
  if (!places.entities.length) return <Spinner label="Loading" size="md" />;
  return <BulkChangesWizard live={live} />;
}
