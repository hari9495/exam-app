'use client';

import { useParams, useRouter } from 'next/navigation';
import { SurveyResultsScreen, type LiveResultsData } from '@yukthix/ui/engage';
import { engageState, useEngage } from '../../../../../../lib/yx-engage';

// Engage › Team surveys › one: the designed ENG-06 manager view with `live` (batch G2 item 74): my direct reports only,
// shown only above the survey's smallest group.
export default function YxTeamSurveyPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const data = useEngage<LiveResultsData>(`/my/team-surveys/${encodeURIComponent(id)}`);
  const state = engageState(data);
  return (
    <SurveyResultsScreen
      live={{
        persona: 'mgr',
        state: state === 'no-access' ? 'error' : state,
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        onPlan: () => router.push(`/yx/engage/team-surveys/${encodeURIComponent(id)}/plan`),
      }}
    />
  );
}
