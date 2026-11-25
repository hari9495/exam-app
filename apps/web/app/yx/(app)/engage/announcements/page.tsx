'use client';

import { useRouter } from 'next/navigation';
import { AnnouncementScreen, type AnnouncementRow } from '@yukthix/ui/engage';
import { engageState, useEngage } from '../../../../../lib/yx-engage';

// Engage › Announcements (engage.announce, for the whole company): the list in the ENG-03 layout (batch G2 item 12).
export default function YxAnnouncementsPage() {
  const router = useRouter();
  const list = useEngage<AnnouncementRow[]>('/announcements');
  return (
    <AnnouncementScreen
      live={{
        view: 'list',
        state: engageState(list),
        onRetry: () => void list.refetch(),
        list: list.data ?? [],
        onNew: () => router.push('/yx/engage/announcements/new'),
        onOpen: (id) => router.push(`/yx/engage/announcements/${encodeURIComponent(id)}`),
        today: new Date(),
      }}
    />
  );
}
