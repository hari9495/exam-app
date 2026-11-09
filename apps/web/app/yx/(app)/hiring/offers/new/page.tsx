'use client';

import { useSearchParams } from 'next/navigation';
import { OfferBuilderScreen } from '@yukthix/ui/hiring';
import { builderState, useOfferActions, useOfferSetup } from '../../../../../../lib/yx-offers';

// Hiring › New offer (HIR-09): the designed offer builder with `live`, for one application (?entry=, from the HIR-05
// application's Offers tab). CTC lines come from the company's salary structure; the route from the company's settings.
export default function YxNewOfferPage() {
  const entry = useSearchParams().get('entry');
  const setup = useOfferSetup(entry);
  const offers = useOfferActions();
  return (
    <OfferBuilderScreen
      live={{
        state: builderState(setup, Boolean(entry)),
        onRetry: () => void setup.refetch(),
        setup: setup.data ?? null,
        now: new Date(),
        onPreview: offers.preview(entry ?? ''),
        onFinish: (i) => offers.create(entry!, i, true),
        onSaveDraft: async (i) => void (await offers.create(entry!, i, false)),
      }}
    />
  );
}
