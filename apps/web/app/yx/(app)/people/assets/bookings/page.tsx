'use client';

import { useRouter } from 'next/navigation';
import { AssetBookingsScreen, type ItBookingRow } from '@yukthix/ui/frame';
import { loadState, todayIst } from '../../../../../../lib/yx-org';
import { useLife, useLifeWrite } from '../../../../../../lib/yx-lifecycle';

// People › Asset bookings and Helpdesk › IT bookings (IT assets part 5, answer 2715): the bookings of the assets the
// viewer sees (asset.view); asset managers of an asset's place approve, decline, hand over, take back and cancel. A person
// picked is their loan report. Take back is the register's return. The API checks every call.
export default function YxAssetBookingsPage() {
  const router = useRouter();
  const data = useLife<{ today: string; rows: ItBookingRow[] }>('/lifecycle/asset-bookings');
  const write = useLifeWrite();
  const at = (id: string, what: string) => `/lifecycle/asset-bookings/${encodeURIComponent(id)}/${what}`;
  return (
    <AssetBookingsScreen
      live={{
        state: loadState(data),
        onRetry: () => void data.refetch(),
        today: data.data?.today ?? todayIst(),
        rows: data.data?.rows ?? [],
        onApprove: (id) => write('POST', at(id, 'approve')),
        onDecline: (id, reason) => write('POST', at(id, 'decline'), { reason }),
        onCancel: (id, reason) => write('POST', at(id, 'cancel'), { reason }),
        onHandOver: (id, condition) => write('POST', at(id, 'hand-over'), { condition }),
        onTakeBack: (b, x) => write('POST', `/lifecycle/assets/${encodeURIComponent(b.assetId)}/return`, { returnedOn: data.data?.today ?? todayIst(), ...x }),
        onOpenAsset: (id) => router.push(`/yx/people/assets/${encodeURIComponent(id)}`),
      }}
    />
  );
}
