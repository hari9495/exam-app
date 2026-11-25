'use client';

import { useRouter } from 'next/navigation';
import { TeamLearningScreen, type TeamLearningData } from '@yukthix/ui/frame';
import { loadState } from '../../../../../lib/yx-org';
import { useLearning } from '../../../../../lib/yx-learning';
import { learnState } from '../my-learning';

// Learning › My team: the manager's team, each person × mandatory course in words, and who is overdue.
export default function YxTeamLearningPage() {
  const router = useRouter();
  const team = useLearning<TeamLearningData>('/team');
  return (
    <TeamLearningScreen
      live={{
        state: learnState(loadState(team)),
        onRetry: () => void team.refetch(),
        data: team.data ?? null,
        onPerson: (id) => router.push(`/yx/people/directory/${encodeURIComponent(id)}`),
      }}
    />
  );
}
