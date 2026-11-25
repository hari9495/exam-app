'use client';

import { useRouter } from 'next/navigation';
import { PerformanceHomeScreen, type PerfHome, PerfNoAccessScreen } from '@yukthix/ui/performance';
import { loadState } from '../../../../lib/yx-org';
import { perfState, usePerf, usePerfWrite, refused } from '../../../../lib/yx-performance';

interface Coach {
  state: 'ready' | 'not-manager' | 'company-off';
  weekOf: string;
  optedOut: boolean;
  nudges: { id: string; person: string; signal: string; action: string; link: string }[];
}

// PRF-01 Performance home: the designed screen with the viewer's own goals and review, their team's and, for HR who run
// cycles, the company's cycles and outcomes (GET /performance/home decides what each role sees). A manager's home also
// carries the PRF-16 coach card (founder 3 Nov 2026), from the same API as /yx/performance/coach.
export default function YxPerformanceHomePage() {
  const router = useRouter();
  const home = usePerf<PerfHome>('/home');
  const hasTeam = Boolean(home.data && home.data.team.length > 0);
  const coach = usePerf<Coach>('/coach', hasTeam);
  const write = usePerfWrite();
  if (refused(home)) return <PerfNoAccessScreen title="Performance home" what="Performance" grantedBy="HR" active="Performance home" persona="emp" />;
  const c = coach.data;
  const coachState = loadState(coach);
  return (
    <PerformanceHomeScreen
      live={{
        state: perfState(loadState(home)),
        onRetry: () => void home.refetch(),
        data: home.data ?? null,
        onCheckIn: (id, input) => write('POST', `/goals/${encodeURIComponent(id)}/checkins`, input),
        coach: hasTeam
          ? {
              state: coachState === 'ready' && c ? c.state : coachState === 'loading' ? 'loading' : 'error',
              onRetry: () => void coach.refetch(),
              firstName: null,
              weekOf: c ? new Date(`${c.weekOf}T00:00:00`) : new Date(),
              optedOut: c?.optedOut ?? false,
              nudges: c?.nudges ?? [],
              looksAt: [],
              onAct: (n) => n.link && router.push(n.link),
              onDismiss: async (id) => void (await write('POST', '/coach/dismiss', { key: id })),
              onOptOut: async (optedOut) => void (await write('POST', '/coach/opt-out', { optedOut })),
            }
          : null,
      }}
    />
  );
}
