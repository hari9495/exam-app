'use client';

import { useParams } from 'next/navigation';
import { OfferBuilderScreen } from '@yukthix/ui/hiring';
import { builderState, useOfferActions, useOfferRecord, useOfferSetup } from '../../../../../../../lib/yx-offers';

// Hiring › Revise offer (HIR-09 "Revision"): the same designed builder, starting from the offer's current version. Each
// change is a new version; a changed CTC or grade goes through approval again (the API decides and says so).
export default function YxReviseOfferPage() {
  const { id } = useParams<{ id: string }>();
  const record = useOfferRecord(id);
  const o = record.data ?? null;
  const setup = useOfferSetup(o?.entryId ?? null);
  const offers = useOfferActions();
  const c = o?.current ?? null;
  const previous = o
    ? {
        version: o.currentVersion,
        ctc: c?.annualCtc ?? 0,
        grade: o.grade ?? 'no grade',
        input: {
          templateVersionId: c?.templateVersionId ?? setup.data?.structures[0]?.value ?? '',
          annualCtc: c?.annualCtc ?? 0,
          variablePay: c?.variablePay ?? 0,
          joiningBonus: c?.joiningBonus ?? 0,
          clawbackMonths: c?.clawbackMonths ?? null,
          locationId: c?.locationId ?? setup.data?.job.locationId ?? '',
          startDate: o.startDate,
          expiresAt: o.expiresAt,
          letterKind: c?.letterKind ?? ('offer' as const),
          templateId: o.templateId,
          addConditions: false,
        },
      }
    : null;
  const state = record.isError ? builderState(record) : builderState(setup, true);
  return (
    <OfferBuilderScreen
      key={o ? `${o.id}-${o.currentVersion}-${Boolean(setup.data)}` : 'loading'}
      live={{
        state,
        onRetry: () => void (record.refetch(), setup.refetch()),
        setup: setup.data ?? null,
        previous,
        now: new Date(),
        onPreview: offers.preview(o?.entryId ?? ''),
        onFinish: (i) => offers.revise(id, o!.currentVersion, i, true),
        onSaveDraft: async (i) => void (await offers.revise(id, o!.currentVersion, i, false)),
      }}
    />
  );
}
