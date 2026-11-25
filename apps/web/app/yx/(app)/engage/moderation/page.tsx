'use client';

import { ModerationScreen, type LiveModItem } from '@yukthix/ui/engage';
import { engageState, useEngage, useEngageWrite } from '../../../../../lib/yx-engage';

// Engage › Moderation (engage.moderate, for the whole company): the designed ENG-11 queue with `live` (batch G2 item 100).
export default function YxModerationPage() {
  const items = useEngage<LiveModItem[]>('/moderation');
  const write = useEngageWrite();
  return (
    <ModerationScreen
      live={{
        state: engageState(items),
        onRetry: () => void items.refetch(),
        items: items.data ?? [],
        onAct: (item, action, note) => write('POST', `/moderation/${item.kind === 'post' ? 'posts' : 'comments'}/${encodeURIComponent(item.id)}`, { action, ...(note ? { note } : {}) }),
      }}
    />
  );
}
