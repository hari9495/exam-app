'use client';

import { DeviceBackfillWizard, type DeviceBatch, type DevicePreview } from '@yukthix/ui/time';
import { timeState, useTime, useTimeRead, useTimeWrite } from '../../../../../lib/yx-time';
import { useScope } from '../../../../../lib/yx-shell';

// HR › Device punches (TIM-10): a device's late punches (attendance.lock over the legal entity), previewed and applied
// once with a reason and the second sign-in step. Days of open months are worked out again; frozen or locked months
// get corrections in the next payroll. The legal entity is the one picked in the top bar.
export default function YxDevicePunchesPage() {
  const { scope } = useScope();
  const entityId = scope.entity ?? null;
  const batches = useTime<{ batches: DeviceBatch[] }>(entityId ? `/device-batches?legalEntityId=${encodeURIComponent(entityId)}` : null);
  const read = useTimeRead();
  const write = useTimeWrite();
  return (
    <DeviceBackfillWizard
      live={{
        state: entityId ? timeState(batches) : 'ready',
        onRetry: () => void batches.refetch(),
        batches: entityId ? (batches.data?.batches ?? null) : [],
        onPreview: (deviceRef) => read<DevicePreview>(`/device-batches/preview?legalEntityId=${encodeURIComponent(entityId!)}&deviceRef=${encodeURIComponent(deviceRef)}`),
        onApply: (deviceRef, reason, punches) => write('/device-backfills', 'POST', { legalEntityId: entityId, deviceRef, reason, punches }),
        musterHref: '/yx/time/muster',
        periodsHref: '/yx/time/periods',
      }}
    />
  );
}
