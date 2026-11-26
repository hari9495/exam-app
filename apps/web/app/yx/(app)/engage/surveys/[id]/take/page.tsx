'use client';

import { useParams } from 'next/navigation';
import { TakeSurveyScreen, type LiveTakeSurvey } from '@yukthix/ui/engage';
import { engageState, useEngage, useEngageWrite } from '../../../../../../../lib/yx-engage';

// Engage › a survey I was invited to: the designed ENG-05 with `live` (batch G2 item 74). Anonymous answers are stored
// without me; the API checks the invitation, the window and every answer again.
export default function YxTakeSurveyPage() {
  const { id } = useParams<{ id: string }>();
  const survey = useEngage<NonNullable<LiveTakeSurvey['survey']>>(`/my/surveys/${encodeURIComponent(id)}`);
  const write = useEngageWrite();
  const state = engageState(survey);
  return (
    <TakeSurveyScreen
      live={{
        state: state === 'no-access' ? 'error' : state,
        onRetry: () => void survey.refetch(),
        survey: survey.data ?? null,
        onSend: (answers) => write('POST', `/my/surveys/${encodeURIComponent(id)}/answers`, { answers }),
      }}
    />
  );
}
