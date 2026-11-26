'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GiveKudosScreen, type KudosOptions } from '@yukthix/ui/engage';
import { useEngage, useEngageWrite } from '../../../../../../lib/yx-engage';

// Engage › Recognition › Give kudos: the designed ENG-08 sheet with `live` (batch G2 item 73, badges only). The API
// checks the people, the value, the badge and the blocked words again.
export default function YxGiveKudosPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const options = useEngage<KudosOptions>(`/my/kudos/options${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  const feed = useEngage<{ blockedWords: string[] }>('/my/feed');
  const write = useEngageWrite();
  return (
    <GiveKudosScreen
      live={{
        options: options.data ?? null,
        onSearch: setQ,
        blockedWords: feed.data?.blockedWords ?? [],
        onSend: (input) => write<{ held: boolean }>('POST', '/my/kudos', input),
        onClose: () => router.push('/yx/engage/recognition'),
      }}
    />
  );
}
