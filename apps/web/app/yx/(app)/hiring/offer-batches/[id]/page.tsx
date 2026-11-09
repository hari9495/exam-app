'use client';

import { useParams, useRouter } from 'next/navigation';
import { BulkOfferScreen, type BulkBatchView } from '@yukthix/ui/hiring';
import { useHiring } from '../../../../../../lib/yx-hiring';
import { builderState } from '../../../../../../lib/yx-offers';

// Hiring › bulk offers › a batch (HIR-28 "Sent · batch status"): the designed screen with `live`, each candidate's result
// and their offer. Amounts only with the offer-pay key (the API leaves them out otherwise).
export default function YxOfferBatchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const batch = useHiring<BulkBatchView>(`/offer-batches/${encodeURIComponent(id)}`);
  return (
    <BulkOfferScreen
      live={{
        state: builderState(batch),
        onRetry: () => void batch.refetch(),
        setup: null,
        batch: batch.data ?? null,
        now: new Date(),
        onSend: async () => undefined,
        onOpenOffer: (offerId) => router.push(`/yx/hiring/offers/${encodeURIComponent(offerId)}`),
      }}
    />
  );
}
