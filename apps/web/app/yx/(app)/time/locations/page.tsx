'use client';

import { GeofenceEditorScreen, type TimeSetup } from '@yukthix/ui/time';
import { timeState, useTime, useTimeWrite } from '../../../../../lib/yx-time';

// HR › Locations (TIM-31): each location's check-in points, office network, Wi-Fi and phone binding; its shift,
// weekly offs and check-in mode from a date.
export default function YxTimeLocationsPage() {
  const setup = useTime<TimeSetup>('/setup');
  const write = useTimeWrite();
  return (
    <GeofenceEditorScreen
      live={{
        state: timeState(setup),
        onRetry: () => void setup.refetch(),
        data: setup.data ?? null,
        onSetRule: (lid, input) => write(`/setup/locations/${encodeURIComponent(lid)}/rule`, 'POST', input),
        onSaveCheckIn: (lid, input) => write(`/setup/locations/${encodeURIComponent(lid)}/checkin`, 'PUT', input),
        onResetPhone: (eid) => write(`/setup/phones/${encodeURIComponent(eid)}/reset`),
      }}
    />
  );
}
