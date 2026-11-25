'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PostComposerScreen, type LiveSpace } from '@yukthix/ui/engage';
import { Skeleton } from '@yukthix/ui';
import { useEngage, useEngageWrite } from '../../../../../lib/yx-engage';

// Engage › Feed › New post: the designed ENG-02 composer with `live` (batch G2 item 100): an update to one of my spaces.
// The API checks the space, approval and the blocked words again.
function YxEngagePostInner() {
  const router = useRouter();
  const space = useSearchParams().get('space');
  const feed = useEngage<{ spaces: LiveSpace[]; blockedWords: string[]; can: { announce: boolean } }>('/my/feed');
  const write = useEngageWrite();
  if (!feed.data) return <Skeleton height={320} />;
  return (
    <PostComposerScreen
      live={{
        spaces: feed.data.spaces,
        blockedWords: feed.data.blockedWords,
        canAnnounce: feed.data.can.announce,
        defaultSpace: space,
        onPost: (spaceId, body, poll) => write<{ state: 'published' | 'pending' | 'held' }>('POST', '/my/posts', { spaceId, body, ...(poll ?? {}) }),
        today: new Date(),
        onClose: () => router.push('/yx/engage'),
      }}
    />
  );
}

// useSearchParams needs a Suspense boundary (Next prerender).
export default function YxEngagePostPage() {
  return (
    <Suspense fallback={<Skeleton height={320} />}>
      <YxEngagePostInner />
    </Suspense>
  );
}
