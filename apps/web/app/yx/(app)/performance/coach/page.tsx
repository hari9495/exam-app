'use client';

import { useRouter } from 'next/navigation';
import { ManagerCoachHome, PerfNoAccessScreen } from '@yukthix/ui/performance';
import { loadState } from '../../../../../lib/yx-org';
import { usePerf, usePerfWrite, refused } from '../../../../../lib/yx-performance';

interface Coach {
  state: 'ready' | 'not-manager' | 'company-off';
  weekOf: string;
  firstName: string | null;
  optedOut: boolean;
  looksAt: string[];
  nudges: { id: string; person: string; signal: string; action: string; link: string }[];
}

// PRF-16 manager coach (performance builder 3): rule-based nudges about my own team from data I already see; dismiss
// one for the week, or turn them off for myself (HR does not see it). The company sets how often (perf.coach.frequency).
export default function YxCoachPage() {
  const router = useRouter();
  const coach = usePerf<Coach>('/coach');
  const write = usePerfWrite();
  const state = loadState(coach);
  const x = coach.data;
  if (refused(coach)) return <PerfNoAccessScreen title="Manager coach" what="the manager coach" grantedBy="HR" active="Performance home" persona="mgr" />;
  return (
    <ManagerCoachHome
      nudges={[]}
      weekOf={new Date()}
      live={{
        state: state !== 'ready' ? (state === 'no-access' ? 'error' : state) : x!.state,
        onRetry: () => void coach.refetch(),
        firstName: x?.firstName ?? null,
        weekOf: x ? new Date(`${x.weekOf}T00:00:00`) : new Date(),
        optedOut: x?.optedOut ?? false,
        nudges: x?.nudges ?? [],
        looksAt: x?.looksAt ?? [],
        onAct: (n) => n.link && router.push(n.link),
        onDismiss: async (id) => void (await write('POST', '/coach/dismiss', { key: id })),
        onOptOut: async (optedOut) => void (await write('POST', '/coach/opt-out', { optedOut })),
      }}
    />
  );
}
