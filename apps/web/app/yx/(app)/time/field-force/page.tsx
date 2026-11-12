'use client';

import { useState } from 'react';
import { FieldForceScreen, type FieldMap, type FieldPersonDay } from '@yukthix/ui/time';
import { timeState, useTime, useTimeWrite } from '../../../../../lib/yx-time';

// Field force today (TIM-32 design): the manager's own team or attendance.view in scope. Locations show only for
// people on duty with consent and tracking on; the API checks every read again (404 outside reach).
export default function YxFieldForcePage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const map = useTime<FieldMap>('/field');
  const person = useTime<FieldPersonDay>(openId ? `/field/people/${openId}` : null);
  const write = useTimeWrite();
  return (
    <FieldForceScreen
      live={{
        state: timeState(map),
        onRetry: () => void map.refetch(),
        data: map.data ?? null,
        openId,
        onOpen: setOpenId,
        person: { state: openId ? timeState(person) : 'loading', data: person.data ?? null },
        onReview: (employeeId) => write(`/field/people/${employeeId}/flags/review`, 'POST', undefined, true, 'Flags marked reviewed'),
        settingsHref: '/yx/settings/time/check-in-and-devices',
      }}
    />
  );
}
