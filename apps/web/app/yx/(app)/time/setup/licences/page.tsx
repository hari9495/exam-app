'use client';

import { LicenceRequirementsScreen, type LicencesData } from '@yukthix/ui/time';
import { timeState, useTime, useTimeWrite } from '../../../../../../lib/yx-time';

// Time settings › Licences (TIM-40): the designed LicenceRequirementsScreen. The API needs leave.settings.manage for the
// whole company on every route (403 → no access); the roster guard reads the same licences on every placement.
export default function YxLicencesPage() {
  const q = useTime<LicencesData>('/licences');
  const write = useTimeWrite();
  return (
    <LicenceRequirementsScreen
      live={{
        state: timeState(q),
        data: q.data ?? null,
        onRetry: () => void q.refetch(),
        onCreateType: (body) => write<{ id: string }>('/licences/types', 'POST', body),
        onUpdateType: (id, body) => write(`/licences/types/${id}`, 'PUT', body),
        onAddRequirement: (body) => write('/licences/requirements', 'POST', body),
        onRemoveRequirement: (id) => write(`/licences/requirements/${id}/remove`, 'POST'),
        onRecord: (body) => write('/licences/holders', 'POST', body),
        onOverride: (body) => write('/licences/overrides', 'POST', body),
        onAskRenew: (body) => write<{ asked: number; alreadyAskedToday: number }>('/licences/renew-asks', 'POST', body),
      }}
    />
  );
}
