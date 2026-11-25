'use client';

import { useRouter } from 'next/navigation';
import { SkillsProfileScreen, type LiveSkillProfileData } from '@yukthix/ui/frame';
import { loadState } from '../../../../../lib/yx-org';
import { useLearning, useLearningWrite } from '../../../../../lib/yx-learning';
import { learnState } from '../my-learning';

// Learning › My skills: the designed LRN-10 skills profile with `live` (G3d). The person, their manager chain or L&D
// (the API decides); the manager sets a level, the person or the manager decides suggestions.
export default function YxMySkillsPage() {
  const router = useRouter();
  
  const path = '/skills/me';
  const data = useLearning<LiveSkillProfileData>(path);
  const write = useLearningWrite();
  return (
    <SkillsProfileScreen
      live={{
        state: learnState(loadState(data)),
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        onSuggestions: () => router.push('/yx/learning/skills/suggestions'),
        onAssess: (skillId, level) => write('POST', `/skills/people/${encodeURIComponent(data.data!.employeeId)}/assess`, { skillId, level }),
        // Answer 2673: add a skill to my profile; my manager confirms it.
        onAddOwn: (skillId, level, note) => write('POST', '/skills/me', { skillId, level, ...(note ? { note } : {}) }),
      }}
    />
  );
}
