'use client';

import { useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { BulkOfferScreen, type BulkBatchView, type BulkOfferSetup } from '@yukthix/ui/hiring';
import { useApiWrite, useHiring } from '../../../../../../../lib/yx-hiring';
import { builderState } from '../../../../../../../lib/yx-offers';

// Hiring › job › Make bulk offers (HIR-28): the designed bulk offer screen with `live`. Each row becomes an ordinary
// HIR-09 offer (the API applies the pay key, the band step, the route, conditions and e-sign per offer); one key per
// visit of this page, so pressing Send twice never sends twice.
export default function YxBulkOffersPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  // Offers answer 402: candidates ticked on the pipeline board's Bulk actions.
  const picked = useSearchParams()?.get('entries');
  const setup = useHiring<BulkOfferSetup>(`/offer-batches/setup?jobId=${encodeURIComponent(id)}`);
  const write = useApiWrite();
  const batchKey = useMemo(() => crypto.randomUUID(), []);
  return (
    <BulkOfferScreen
      live={{
        state: builderState(setup),
        onRetry: () => void setup.refetch(),
        setup: setup.data ?? null,
        now: new Date(),
        onSend: async (input) => {
          const b = await write<BulkBatchView>('POST', '/hiring/offer-batches', {
            jobId: id,
            batchKey,
            templateVersionId: input.templateVersionId,
            locationId: input.locationId,
            startDate: input.startDate,
            letterKind: input.letterKind,
            addConditions: input.addConditions,
            ...(input.templateId ? { templateId: input.templateId } : {}),
            ...(input.joinerBatchId ? { joinerBatchId: input.joinerBatchId } : {}),
            rows: input.rows.map((r) => ({ entryId: r.entryId, annualCtc: String(Math.round(r.annualCtc)) })),
          });
          router.push(`/yx/hiring/offer-batches/${encodeURIComponent(b.id)}`);
        },
        onOpenOffer: (offerId) => router.push(`/yx/hiring/offers/${encodeURIComponent(offerId)}`),
        selected: picked ? picked.split(',').filter(Boolean) : undefined,
      }}
    />
  );
}
