'use client';

import { useParams, useRouter } from 'next/navigation';
import { SurveyBuilderScreen, type LiveSurveyBuilder, type SurveyInput } from '@yukthix/ui/engage';
import { useEngage, useEngageWrite } from '../../../../../../../lib/yx-engage';

// Engage › Surveys › New / edit a draft: the designed ENG-04 builder with `live` (batch G2 item 74). Launch locks the
// survey and invites the audience; the API checks the key, the anonymity rule, the dates and the questions again.
export default function YxSurveyBuilderPage() {
  const router = useRouter();
  const { id } = useParams<{ id?: string }>();
  const options = useEngage<NonNullable<LiveSurveyBuilder['options']>>('/surveys/options');
  const draft = useEngage<SurveyInput & { id: string; status: string }>(id ? `/surveys/${encodeURIComponent(id)}` : null);
  const write = useEngageWrite();
  if (id && !draft.data) return <SurveyBuilderScreen live={{ options: null, today: new Date(), onSave: async () => ({ id: '' }), onLaunch: async () => ({ invited: 0 }), onDone: () => undefined }} />;
  return (
    <SurveyBuilderScreen
      key={draft.data?.id ?? 'new'}
      live={{
        options: options.data ?? null,
        initial: draft.data,
        today: new Date(),
        onSave: (input, sid) => (sid ? write<{ id: string }>('PUT', `/surveys/${encodeURIComponent(sid)}`, input) : write<{ id: string }>('POST', '/surveys', input)),
        onLaunch: (sid) => write<{ invited: number }>('POST', `/surveys/${encodeURIComponent(sid)}/launch`),
        onDone: () => router.push('/yx/engage/surveys'),
      }}
    />
  );
}
