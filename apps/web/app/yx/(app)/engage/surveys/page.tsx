'use client';

import { useRouter } from 'next/navigation';
import { SurveysListScreen, type LiveSurveyRow } from '@yukthix/ui/engage';
import { engageState, useEngage } from '../../../../../lib/yx-engage';

// Engage › Surveys (engage.survey.manage, for the whole company): the designed ENG-04 list with `live` (batch G2 item 74).
export default function YxSurveysPage() {
  const router = useRouter();
  const rows = useEngage<LiveSurveyRow[]>('/surveys');
  return (
    <SurveysListScreen
      live={{
        state: engageState(rows),
        onRetry: () => void rows.refetch(),
        rows: rows.data ?? [],
        onNew: () => router.push('/yx/engage/surveys/new'),
        onOpen: (r) => router.push(`/yx/engage/surveys/${encodeURIComponent(r.id)}/${r.status === 'draft' ? 'edit' : 'results'}`),
      }}
    />
  );
}
