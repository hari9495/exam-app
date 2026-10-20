'use client';

import { YearEndWizard, type YearEndPreview } from '@yukthix/ui/time';
import { todayIndia, useTimeRead, useTimeWrite } from '../../../../../lib/yx-time';

// HR › Leave year-end (TIM-29): preview each person's carry-forward and lapse, then post.
export default function YxTimeYearEndPage() {
  const read = useTimeRead();
  const write = useTimeWrite();
  return <YearEndWizard live={{ today: todayIndia(), onPreview: (yearEnd) => read<YearEndPreview>(`/setup/year-end?yearEnd=${yearEnd}`), onRun: (yearEnd) => write('/setup/year-end', 'POST', { yearEnd }) }} />;
}
