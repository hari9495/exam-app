'use client';

import { useRouter } from 'next/navigation';
import { AnnouncementScreen, type AnnouncementOptions } from '@yukthix/ui/engage';
import { engageState, useEngage, useEngageWrite } from '../../../../../../lib/yx-engage';

// Engage › Announcements › New: the designed ENG-03 composer with `live` (batch G2 item 12). The API checks the key,
// the audience, the email rule (no amounts) and the dates again.
export default function YxNewAnnouncementPage() {
  const router = useRouter();
  const options = useEngage<AnnouncementOptions>('/announcements/options');
  const write = useEngageWrite();
  return (
    <AnnouncementScreen
      live={{
        view: 'compose',
        state: engageState(options),
        onRetry: () => void options.refetch(),
        options: options.data ?? null,
        reach: (locationIds, departmentIds, groupIds) => write<{ count: number }>('POST', '/announcements/reach', { locationIds, departmentIds, groupIds: groupIds ?? [] }).then((r) => r.count),
        onPublish: (input) => write<{ id: string }>('POST', '/announcements', input),
        onDone: (id) => router.push(`/yx/engage/announcements/${encodeURIComponent(id)}`),
        today: new Date(),
      }}
    />
  );
}
