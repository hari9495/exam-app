'use client';

import { GeofenceEditorScreen, type TimeSetup } from '@yukthix/ui/time';
import { timeState, useTime, useTimeWrite } from '../../../../../../lib/yx-time';

const id = encodeURIComponent;

// HR › Locations & geofences (TIM-31): each location's check-in mode, shift and weekly offs, from a date. The point,
// radius and office networks are set on the location record in Settings › Locations.
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
      }}
    />
  );
}
