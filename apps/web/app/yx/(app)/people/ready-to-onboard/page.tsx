'use client';

import { ReadyToOnboardScreen, type ReadyOffer } from '@yukthix/ui/lifecycle';
import { loadState } from '../../../../../lib/yx-org';
import { useJoinerPlaces, useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

// People › Ready to onboard (PPL-12; M10 Q2 manual hand-off, LIFE-2.09): accepted offers become joiners here; a current
// employee's move is a job change, never onboarding (YX-LC-11).
export default function YxReadyToOnboardPage() {
  const rows = useLife<ReadyOffer[]>('/lifecycle/ready-to-onboard');
  const places = useJoinerPlaces(true);
  const write = useLifeWrite();
  return (
    <ReadyToOnboardScreen
      state={loadState(rows)}
      onRetry={() => void rows.refetch()}
      rows={rows.data ?? null}
      places={places}
      onCreate={(o, input) => write('POST', `/lifecycle/ready-to-onboard/${encodeURIComponent(o.offerId)}`, { ...input, email: o.email, phone: o.phone ?? undefined })}
      changesHref="/yx/people/changes"
    />
  );
}
