'use client';

import { MyAssetBookingsScreen, type FreeAssets, type LiveMyBookings } from '@yukthix/ui/frame';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { loadState, todayIst } from '../../../../../lib/yx-org';
import { useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

// Me › Asset bookings (IT assets part 5, answer 2715), in the avatar menu next to My assets: my bookings of the company's
// bookable assets, and Book an asset with the "free between" search. No key: the API books only bookable assets, only for
// me, and checks the company's longest booking and clashes.
export default function YxMyBookingsPage() {
  const { accessToken } = useAuth();
  const data = useLife<{ today: string; maxDays: number; approval: boolean; rows: LiveMyBookings['rows'] }>('/lifecycle/me/asset-bookings');
  const write = useLifeWrite();
  return (
    <MyAssetBookingsScreen
      live={{
        state: loadState(data),
        onRetry: () => void data.refetch(),
        today: data.data?.today ?? todayIst(),
        maxDays: data.data?.maxDays ?? 14,
        approval: Boolean(data.data?.approval),
        rows: data.data?.rows ?? [],
        onSearch: (from, to) => apiFetch(`/lifecycle/me/asset-bookings/free?${new URLSearchParams({ from, to })}`, {}, accessToken ?? undefined) as Promise<FreeAssets>,
        onBook: (x) => write('POST', '/lifecycle/me/asset-bookings', x),
        onCancel: (id, series) => write('POST', `/lifecycle/me/asset-bookings/${encodeURIComponent(id)}/cancel`, { series }),
      }}
    />
  );
}
