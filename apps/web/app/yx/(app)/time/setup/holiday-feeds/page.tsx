'use client';

import { useRouter } from 'next/navigation';
import { HolidayFeedScreen, type HolidayFeeds } from '@yukthix/ui/time';
import { apiFetch } from '../../../../../../lib/api-client';
import { useAuth } from '../../../../../../lib/auth-context';
import { timeState, useTime, useTimeWrite } from '../../../../../../lib/yx-time';

const id = encodeURIComponent;

// Time settings › Holiday feeds (TIM-42): leave.settings.manage. Feeds on or off is the company setting holiday.feeds
// (org.settings.manage). The provider is behind an adapter (provider: to decide; a test feed until then).
export default function YxHolidayFeedsPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const feeds = useTime<HolidayFeeds>('/setup/holiday-feeds');
  const write = useTimeWrite();
  return (
    <HolidayFeedScreen
      live={{
        state: timeState(feeds),
        onRetry: () => void feeds.refetch(),
        data: feeds.data ?? null,
        onSwitch: async (on) => {
          await apiFetch('/org/settings', { method: 'PUT', body: JSON.stringify({ key: 'holiday.feeds', scopeType: 'tenant', value: on ? 'on' : 'off' }) }, accessToken ?? undefined);
          await feeds.refetch();
        },
        onAdd: (state) => write('/setup/holiday-feeds', 'POST', { state }, true, 'Feed added'),
        onRemove: (fid) => write(`/setup/holiday-feeds/${id(fid)}/remove`, 'POST', undefined, true, 'Feed removed'),
        onCheck: () => write('/setup/holiday-feeds/check', 'POST', undefined, true),
        onDecide: (accept, ignore) => write('/setup/holiday-feeds/decide', 'POST', { accept, ignore }, true),
        calendarsHref: '/yx/time/setup/holidays',
        onNavigate: (href) => router.push(href),
      }}
    />
  );
}
