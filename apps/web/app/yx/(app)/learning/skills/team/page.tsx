'use client';

import { useRouter } from 'next/navigation';
import { TeamSkillsMatrixScreen, type LiveTeamSkillsData } from '@yukthix/ui/frame';
import { loadState } from '../../../../../../lib/yx-org';
import { useLearning, useLearningWrite } from '../../../../../../lib/yx-learning';
import { learnState } from '../../my-learning';

// Learning › Team skills: the designed LRN-09 matrix with `live` (G3d): my direct reports × the skills their job titles need.
export default function YxTeamSkillsPage() {
  const router = useRouter();
  const data = useLearning<LiveTeamSkillsData>('/skills/team');
  const write = useLearningWrite();
  return (
    <TeamSkillsMatrixScreen
      live={{
        state: learnState(loadState(data)),
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        onPerson: (id) => router.push(`/yx/learning/skills/people/${encodeURIComponent(id)}`),
        // Answer 2675: raise a training need for someone in my team; L&D plans it.
        onRaiseNeed: (n) => write('POST', '/skills/team/needs', n),
      }}
    />
  );
}
