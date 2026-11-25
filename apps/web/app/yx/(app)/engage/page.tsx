'use client';

import { FeedScreen, type LiveFeedPost } from '@yukthix/ui/engage';
import { engageState, useEngage, useEngageWrite } from '../../../../lib/yx-engage';

// Engage › Feed: the designed ENG-01 feed with `live` (batch G2 item 12: the company announcements for me; reading
// marks them read). The API checks the audience of each announcement again.
export default function YxEngageFeedPage() {
  const posts = useEngage<LiveFeedPost[]>('/my/announcements');
  const write = useEngageWrite();
  const state = engageState(posts);
  return (
    <FeedScreen
      live={{
        state: state === 'no-access' ? 'error' : state,
        onRetry: () => void posts.refetch(),
        posts: posts.data ?? [],
        onAck: (id) => write('POST', `/my/announcements/${encodeURIComponent(id)}/acknowledge`),
        now: new Date(),
      }}
    />
  );
}
