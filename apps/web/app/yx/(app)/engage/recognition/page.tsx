'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RecognitionWallScreen, type WallKudos } from '@yukthix/ui/engage';
import { engageState, useEngage, useEngageWrite } from '../../../../../lib/yx-engage';

// Engage › Recognition: the designed ENG-09 wall with `live` (batch G2 item 73, badges only: no leaderboard).
export default function YxRecognitionPage() {
  const router = useRouter();
  const [value, setValue] = useState<string | null>(null);
  const wall = useEngage<{ values: { value: string; count: number }[]; total: number; kudos: WallKudos[] }>(`/my/kudos${value ? `?value=${encodeURIComponent(value)}` : ''}`);
  const write = useEngageWrite();
  const state = engageState(wall);
  return (
    <RecognitionWallScreen
      live={{
        state: state === 'no-access' ? 'error' : state,
        onRetry: () => void wall.refetch(),
        now: new Date(),
        values: wall.data?.values ?? [],
        total: wall.data?.total ?? 0,
        kudos: wall.data?.kudos ?? [],
        value,
        onValue: setValue,
        onGive: () => router.push('/yx/engage/recognition/give'),
        onLike: (id) => write('POST', `/my/posts/${encodeURIComponent(id)}/like`),
      }}
    />
  );
}
