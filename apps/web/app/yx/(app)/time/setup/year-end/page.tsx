'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { YearEndWizard, type TimeSetup, type YearChangePreview, type YearEndPreview } from '@yukthix/ui/time';
import { timeState, useTime, useTimeRead, useTimeWrite } from '../../../../../../lib/yx-time';

// HR › Year-end (TIM-29): preview the carry forward, pay-outs and lapses, then post (runs in the background).
// ?mode=transition: change a legal entity's leave year (TIM-29 Transition), with a short year in between.
function YearEnd() {
  const router = useRouter();
  const mode = useSearchParams().get('mode') === 'transition' ? 'transition' : 'yearend';
  const setup = useTime<TimeSetup>('/setup');
  const read = useTimeRead();
  const write = useTimeWrite();
  return (
    <YearEndWizard
      live={{
        state: timeState(setup),
        onRetry: () => void setup.refetch(),
        data: setup.data ?? null,
        mode,
        onYearChangePreview: (legalEntityId, newStartMonth) => read<YearChangePreview>(`/setup/year-change?legalEntityId=${legalEntityId}&newStartMonth=${newStartMonth}`),
        onYearChangeSchedule: (legalEntityId, newStartMonth) => write('/setup/year-change', 'POST', { legalEntityId, newStartMonth }),
        policiesHref: '/yx/time/setup',
        onYearEndPreview: (yearEnd) => read<YearEndPreview>(`/setup/year-end?yearEnd=${yearEnd}`),
        onYearEndRun: (yearEnd, acknowledgePending) => write('/setup/year-end', 'POST', { yearEnd, ...(acknowledgePending ? { acknowledgePending: true } : {}) }),
        pendingHref: '/yx/approvals',
        onNavigate: (href) => router.push(href),
      }}
    />
  );
}

export default function YxTimeYearEndPage() {
  return (
    <Suspense fallback={null}>
      <YearEnd />
    </Suspense>
  );
}
