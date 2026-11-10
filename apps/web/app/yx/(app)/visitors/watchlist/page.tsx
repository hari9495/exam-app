'use client';

import { VisitorWatchListScreen, type WatchEntry } from '@yukthix/ui/visitors';
import { loadState } from '../../../../../lib/yx-org';
import { useVisitors, useVisitorsWrite } from '../../../../../lib/yx-visitors';

// Visitors › Watch-list (VIS-05, answer 605): HR and Facility admins with the watch-list key for the whole company add,
// review and remove people reception must stop. The API checks the key, the company and acting for someone else.
export default function YxVisitorWatchListPage() {
  const list = useVisitors<{ canChange: boolean; reviewDays: number; entries: WatchEntry[] }>('/watchlist');
  const write = useVisitorsWrite();
  return (
    <VisitorWatchListScreen
      entries={[]}
      today={new Date()}
      live={{
        state: loadState(list),
        onRetry: () => void list.refetch(),
        entries: list.data?.entries ?? [],
        reviewDays: list.data?.reviewDays ?? 365,
        canChange: Boolean(list.data?.canChange),
        onAdd: (input) => write<{ blockedVisits: number }>('POST', '/watchlist', input),
        onReview: (id) => write('POST', `/watchlist/${encodeURIComponent(id)}/review`),
        onRemove: (id) => write('DELETE', `/watchlist/${encodeURIComponent(id)}`),
      }}
    />
  );
}
