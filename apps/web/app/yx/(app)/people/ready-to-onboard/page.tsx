'use client';

import { useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { ReadyToOnboardQueue } from '@yukthix/ui/frame';
import type { ReadyOffer } from '@yukthix/ui/lifecycle';
import { todayIst } from '../../../../../lib/yx-org';
import { useJoinerPlaces, useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';
import { readyRow } from '../../../../../lib/yx-onboarding';

const day = (iso: string) => new Date(`${iso}T00:00:00`);

// People › Ready to onboard (PPL-12, design audit step 3; M10 Q2 manual hand-off, LIFE-2.09): accepted offers become
// joiners here; a current employee's move is a job change, never onboarding (YX-LC-11).
export default function YxReadyToOnboardPage() {
  const router = useRouter();
  const { toast } = useToast();
  const rows = useLife<ReadyOffer[]>('/lifecycle/ready-to-onboard');
  const places = useJoinerPlaces(true);
  const write = useLifeWrite();
  const offers = rows.data ?? [];
  return (
    <ReadyToOnboardQueue
      rows={offers.map(readyRow)}
      live={{
        state: rows.isError ? 'error' : rows.data ? 'ready' : 'loading',
        onRetry: () => void rows.refetch(),
        today: day(todayIst()),
        places,
        onCreate: async (row, input) => {
          const o = offers.find((x) => x.offerId === row.id)!;
          await write('POST', `/lifecycle/ready-to-onboard/${encodeURIComponent(o.offerId)}`, { ...input, email: o.email, phone: o.phone ?? undefined });
          toast({ tone: 'success', title: `${o.name} is now a joiner`, description: 'Their checklist has started and they were invited to the joining portal.' });
        },
        onJobChange: () => router.push('/yx/people/changes'),
      }}
    />
  );
}
