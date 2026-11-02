'use client';

import { GeofenceEditorScreen, type TimeSetup } from '@yukthix/ui/time';
import { timeState, useTime, useTimeWrite } from '../../../../../../lib/yx-time';

const id = encodeURIComponent;

// HR › Locations & geofences (TIM-31): each location's check-in mode, shift and weekly offs, from a date, and its office
// networks (IP ranges, checked line by line) and its check-in points (TIM-31 Multi: inside any point is inside).
export default function YxTimeLocationsPage() {
  const setup = useTime<TimeSetup>('/setup');
  const write = useTimeWrite();
  return (
    <GeofenceEditorScreen
      live={{
        state: timeState(setup),
        onRetry: () => void setup.refetch(),
        data: setup.data ?? null,
        settingsHref: '/yx/settings/locations',
        onSetRule: (lid, input) => write(`/setup/locations/${id(lid)}/rule`, 'POST', input, true, 'Location saved'),
        onSetNetworks: (lid, ipRanges) => write(`/setup/locations/${id(lid)}/networks`, 'POST', { ipRanges }, true, 'Office network saved'),
        onSetPoints: (lid, points, updatedAt) => write(`/setup/locations/${id(lid)}/points`, 'POST', { points, ...(updatedAt ? { updatedAt } : {}) }, true, 'Points saved'),
      }}
    />
  );
}
