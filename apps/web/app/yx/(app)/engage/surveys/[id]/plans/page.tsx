'use client';

import { useParams } from 'next/navigation';
import { ActionPlanScreen, type LivePlanItem } from '@yukthix/ui/engage';
import { engageState, useEngage } from '../../../../../../../lib/yx-engage';

// Engage › Surveys › action plans (engage.survey.manage): the designed ENG-07 HR view with `live` (batch G2 item 74).
export default function YxSurveyPlansPage() {
  const { id } = useParams<{ id: string }>();
  const survey = useEngage<{ name: string }>(`/surveys/${encodeURIComponent(id)}`);
  const plans = useEngage<{ dueOn: string; plans: { id: string; manager: string; focus: string; status: 'draft' | 'shared' | 'completed'; items: LivePlanItem[] }[] }>(`/surveys/${encodeURIComponent(id)}/plans`);
  return (
    <ActionPlanScreen
      live={{
        persona: 'hr',
        state: engageState(survey, plans),
        onRetry: () => void plans.refetch(),
        survey: survey.data?.name ?? '',
        dueOn: plans.data?.dueOn ?? new Date().toISOString().slice(0, 10),
        plans: plans.data?.plans ?? [],
        today: new Date(),
      }}
    />
  );
}
