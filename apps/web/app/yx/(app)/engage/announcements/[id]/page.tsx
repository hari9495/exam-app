'use client';

import { useParams } from 'next/navigation';
import { AnnouncementScreen, type AnnouncementDetail } from '@yukthix/ui/engage';
import { engageState, useEngage, useEngageWrite } from '../../../../../../lib/yx-engage';

// Engage › Announcements › one: the designed ENG-03 acknowledgement tracking with `live` (batch G2 item 12).
export default function YxAnnouncementPage() {
  const { id } = useParams<{ id: string }>();
  const detail = useEngage<AnnouncementDetail>(`/announcements/${encodeURIComponent(id)}`);
  const write = useEngageWrite();
  return (
    <AnnouncementScreen
      live={{
        view: 'tracking',
        state: engageState(detail),
        onRetry: () => void detail.refetch(),
        detail: detail.data ?? null,
        onRemind: () => write<{ reminded: number }>('POST', `/announcements/${encodeURIComponent(id)}/remind`),
        today: new Date(),
      }}
    />
  );
}
