'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { WallScreen, type WallData } from '@yukthix/ui/desk';
import { API_BASE } from '../../../../../lib/api-client';

// The wall screen (US-G-028), outside the signed-in app: the secret link is the key, no session, counts only.
// Refreshes every minute; a 404 means the link was switched off.
export default function YxWallPage() {
  const { org, token } = useParams<{ org: string; token: string }>();
  const wall = useQuery<WallData, Error & { status?: number }>({
    queryKey: ['wall', org, token],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/desk/wall/${encodeURIComponent(org)}/${encodeURIComponent(token)}`, { credentials: 'omit', cache: 'no-store' });
      if (!res.ok) throw Object.assign(new Error('Wall screen not loaded'), { status: res.status });
      return res.json();
    },
    refetchInterval: (q) => ((q.state.error as { status?: number } | null)?.status === 404 ? false : 60_000),
    refetchIntervalInBackground: true,
    retry: false,
  });
  const gone = wall.error?.status === 404;
  // Keep showing the last counts while a refresh fails for a moment (not when the link is switched off).
  const state = gone ? 'not-found' : wall.data ? 'ready' : wall.isError ? 'error' : 'loading';
  return <WallScreen state={state} wall={wall.data ?? null} onRetry={() => void wall.refetch()} />;
}
