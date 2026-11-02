'use client';

import { PerformanceHomeScreen, type PerfHome } from '@yukthix/ui/performance';
import { loadState } from '../../../../lib/yx-org';
import { perfState, usePerf, usePerfWrite } from '../../../../lib/yx-performance';

// PRF-01 Performance home: the designed screen with the viewer's own goals and review, their team's and, for HR who run
// cycles, the company's cycles and outcomes (GET /performance/home decides what each role sees).
export default function YxPerformanceHomePage() {
  const home = usePerf<PerfHome>('/home');
  const write = usePerfWrite();
  return <PerformanceHomeScreen live={{ state: perfState(loadState(home)), onRetry: () => void home.refetch(), data: home.data ?? null, onCheckIn: (id, input) => write('POST', `/goals/${encodeURIComponent(id)}/checkins`, input) }} />;
}
