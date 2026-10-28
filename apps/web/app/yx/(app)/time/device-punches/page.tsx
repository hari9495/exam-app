'use client';

import { DeviceBackfillWizard, type DeviceBatch, type DevicePreview } from '@yukthix/ui/time';
import { timeState, useTime, useTimeRead, useTimeWrite } from '../../../../../lib/yx-time';
import { useScopeParams, withParams } from '../../../../../lib/yx-shell';

// HR › Device punches (TIM-10): a device's late punches, previewed and applied once with a reason and the second
// sign-in step. The list covers every legal entity the person may lock (attendance.lock), or the one picked in the top
// bar; each batch names its entity. Days of open months are worked out again; frozen or locked months get corrections
// in the next payroll. Without attendance.lock the API answers 403 and the page shows the no-access state.
export default function YxDevicePunchesPage() {
  const { entity } = useScopeParams();
  const batches = useTime<{ entities: number; batches: DeviceBatch[] }>(withParams('/device-batches', entity));
  const read = useTimeRead();
  const write = useTimeWrite();
  const q = (legalEntityId: string, deviceRef: string) => `legalEntityId=${encodeURIComponent(legalEntityId)}&deviceRef=${encodeURIComponent(deviceRef)}`;
  return (
    <DeviceBackfillWizard
      live={{
        state: timeState(batches),
        onRetry: () => void batches.refetch(),
        batches: batches.data?.batches ?? null,
        onPreview: (legalEntityId, deviceRef) => read<DevicePreview>(`/device-batches/preview?${q(legalEntityId, deviceRef)}`),
        onApply: (legalEntityId, deviceRef, reason, punches) => write('/device-backfills', 'POST', { legalEntityId, deviceRef, reason, punches }),
        musterHref: '/yx/time/muster',
        periodsHref: '/yx/time/periods',
      }}
    />
  );
}
