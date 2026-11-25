'use client';

import { useParams, useRouter } from 'next/navigation';
import { SkillsProfileScreen, type LiveSkillProfileData } from '@yukthix/ui/frame';
import { loadState } from '../../../../../../../lib/yx-org';
import { useLearning, useLearningWrite } from '../../../../../../../lib/yx-learning';
import { learnState } from '../../../my-learning';

// Learning › a person's skills: the designed LRN-10 skills profile with `live` (G3d). The person, their manager chain or L&D
// (the API decides); the manager sets a level, the person or the manager decides suggestions.
export default function YxPersonSkillsPage() {
  const router = useRouter();
  const { employeeId } = useParams<{ employeeId: string }>();
  const path = `/skills/people/${encodeURIComponent(employeeId)}`;
  const data = useLearning<LiveSkillProfileData>(path);
  const write = useLearningWrite();
  return (
    <SkillsProfileScreen
      live={{
        state: learnState(loadState(data)),
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        onSuggestions: () => router.push(`/yx/learning/skills/people/${encodeURIComponent(employeeId)}/suggestions`),
        onAssess: (skillId, level) => write('POST', `/skills/people/${encodeURIComponent(data.data!.employeeId)}/assess`, { skillId, level }),
      }}
    />
  );
}
