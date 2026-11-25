'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FeedScreen, type Celebration, type FeedComment, type LiveFeedPost, type LiveSpace, type LiveUpdate } from '@yukthix/ui/engage';
import { engageState, useEngage, useEngageWrite } from '../../../../lib/yx-engage';
import { useAuth } from '../../../../lib/auth-context';
import { apiFetch } from '../../../../lib/api-client';

const id = encodeURIComponent;

// Engage › Feed: the designed ENG-01 feed with `live` (batch G2 items 12 and 100): the company announcements for me
// (reading marks them read), the updates in my spaces with likes, comments and reports, and the spaces directory (a
// moderator turns approval on or off there). The API checks the audience and the spaces again.
export default function YxEngageFeedPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [space, setSpace] = useState<string | null>(null);
  const posts = useEngage<LiveFeedPost[]>('/my/announcements');
  const feed = useEngage<{ spaces: LiveSpace[]; posts: LiveUpdate[]; can: { moderate: boolean } }>(`/my/feed${space ? `?spaceId=${id(space)}` : ''}`);
  const directory = useEngage<LiveSpace[]>('/my/spaces');
  const surveys = useEngage<{ id: string; name: string; closesOn: string; questions: number; anonymous: boolean }[]>('/my/surveys');
  const celebrations = useEngage<Celebration[]>('/my/celebrations');
  const mine = useEngage<{ birthday: boolean; anniversary: boolean; newJoiner: boolean }>('/my/celebrations/mine');
  const write = useEngageWrite();
  const state = engageState(posts, feed);
  return (
    <FeedScreen
      live={{
        state: state === 'no-access' ? 'error' : state,
        onRetry: () => void Promise.all([posts.refetch(), feed.refetch()]),
        posts: posts.data ?? [],
        onAck: (p) => write('POST', `/my/announcements/${id(p)}/acknowledge`),
        now: new Date(),
        updates: feed.data?.posts ?? [],
        spaces: feed.data?.spaces ?? [],
        directory: directory.data ?? null,
        space,
        onSpace: setSpace,
        onWrite: () => router.push(`/yx/engage/post${space ? `?space=${id(space)}` : ''}`),
        onLike: (p) => write('POST', `/my/posts/${id(p)}/like`),
        onReport: (p) => write('POST', `/my/posts/${id(p)}/report`),
        loadComments: (p) => apiFetch(`/engage/my/posts/${id(p)}/comments`, {}, accessToken ?? undefined) as Promise<FeedComment[]>,
        onComment: (p, body) => write<{ held: boolean }>('POST', `/my/posts/${id(p)}/comments`, { body }),
        onReportComment: (c) => write('POST', `/my/comments/${id(c)}/report`),
        onApproval: feed.data?.can.moderate ? (s, approval) => write('PUT', `/moderation/spaces/${id(s)}`, { approval }) : undefined,
        // Batch G2 items 74 and 75: a vote on a poll; the first open survey for me.
        onVote: (p, option) => write('POST', `/my/posts/${id(p)}/vote`, { option }),
        openSurvey: surveys.data?.[0] ?? null,
        onTakeSurvey: (s) => router.push(`/yx/engage/surveys/${id(s)}/take`),
        // Batch G2 item 76: today's celebrations and my own choices.
        celebrations: celebrations.data ?? [],
        myCelebrations: mine.data ?? null,
        onMyCelebrations: (v) => write('PUT', '/my/celebrations/mine', v),
      }}
    />
  );
}
