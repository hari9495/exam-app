'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ReviewsScreen, type Handover, type ReviewSummary, type ReviewsView } from '@yukthix/ui/performance';
import type { TeamMember } from '@yukthix/ui/workforce';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { usePeople } from '../../../../../lib/yx-people';
import { usePerf } from '../../../../../lib/yx-performance';
import { useScopeParams, withParams } from '../../../../../lib/yx-shell';

// Reviews (PRF-04 / PRF-05, M06 batch PM4): mine, my team's, and for HR with perf.review.view, those in scope.
export default function YxReviewsPage() {
  const sp = useScopeParams();
  const router = useRouter();
  const perms = useYxPermissions();
  const [view, setView] = useState<ReviewsView>('mine');
  const reviews = usePerf<ReviewSummary[]>(withParams(`/reviews?view=${view}`, view === 'mine' ? '' : sp.entity));
  const handovers = usePerf<Handover[]>('/handovers');
  const team = usePeople<{ managerId: string | null; members: TeamMember[] }>('/team');
  return (
    <ReviewsScreen
      state={loadState(reviews)}
      onRetry={() => void reviews.refetch()}
      view={view}
      onView={setView}
      hasTeam={(team.data?.members ?? []).length > 0}
      canScope={perms.has('perf.review.view')}
      reviews={reviews.data ?? []}
      handovers={handovers.data ?? []}
      onOpen={(id) => router.push(`/yx/performance/reviews/${encodeURIComponent(id)}`)}
    />
  );
}
