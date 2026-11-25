'use client';

import { useParams } from 'next/navigation';
import { SkillSuggestionsScreen, type LiveSkillProfileData } from '@yukthix/ui/frame';
import { loadState } from '../../../../../../../../lib/yx-org';
import { useLearning, useLearningWrite } from '../../../../../../../../lib/yx-learning';
import { learnState } from '../../../../my-learning';

// Learning › skills to confirm: the designed LRN-15 screen with `live` (G3d). Suggestions come from completed courses.
export default function YxPersonSkillSuggestionsPage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const data = useLearning<LiveSkillProfileData>(`/skills/people/${encodeURIComponent(employeeId)}`);
  const write = useLearningWrite();
  return (
    <SkillSuggestionsScreen
      live={{
        state: learnState(loadState(data)),
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        onDecide: (id, confirm) => write('POST', `/skills/suggestions/${encodeURIComponent(id)}`, { confirm }),
      }}
    />
  );
}
