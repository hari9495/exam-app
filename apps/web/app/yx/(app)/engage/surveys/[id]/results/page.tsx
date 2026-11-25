'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SurveyResultsScreen, type LiveResultsData } from '@yukthix/ui/engage';
import { engageState, useEngage } from '../../../../../../../lib/yx-engage';
import { apiFetchBlob } from '../../../../../../../lib/api-client';
import { useAuth } from '../../../../../../../lib/auth-context';
import { saveBlob } from '../../../../../../../lib/yx-pay';

// Engage › Surveys › results (engage.survey.manage): the designed ENG-06 results with `live` (batch G2 item 74). The API
// shows nothing below the survey's smallest group.
export default function YxSurveyResultsPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [department, setDepartment] = useState<string | null>(null);
  const data = useEngage<LiveResultsData>(`/surveys/${encodeURIComponent(id)}/results${department ? `?departmentId=${encodeURIComponent(department)}` : ''}`);
  return (
    <SurveyResultsScreen
      live={{
        persona: 'hr',
        state: engageState(data),
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        department,
        onDepartment: setDepartment,
        onPlans: () => router.push(`/yx/engage/surveys/${encodeURIComponent(id)}/plans`),
        // Answer 2668: the shown results as CSV.
        onExport: async () => {
          const { blob, filename } = await apiFetchBlob(`/engage/surveys/${encodeURIComponent(id)}/results/csv`, {}, accessToken ?? undefined);
          saveBlob(blob, filename ?? 'survey-results.csv');
        },
      }}
    />
  );
}
