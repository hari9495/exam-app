'use client';

import { YearEndWizard, type TimeSetup, type YearEndPreview } from '@yukthix/ui/time';
import { timeState, useTime, useTimeRead, useTimeWrite } from '../../../../../../lib/yx-time';

// HR › Year-end (TIM-29): preview the carry forward and lapses, then post (runs in the background).
export default function YxTimeYearEndPage() {
  const setup = useTime<TimeSetup>('/setup');
  const read = useTimeRead();
  const write = useTimeWrite();
  return (
    <YearEndWizard
      live={{
        state: timeState(setup),
        onRetry: () => void setup.refetch(),
        data: setup.data ?? null,
        onYearEndPreview: (yearEnd) => read<YearEndPreview>(`/setup/year-end?yearEnd=${yearEnd}`),
        onYearEndRun: (yearEnd) => write('/setup/year-end', 'POST', { yearEnd }),
      }}
    />
  );
}
