'use client';

import { LocationsScreen, type LegalEntity, type OrgLocation } from '@yukthix/ui/org';
import { loadState, useOrg, useOrgWrite, useYxPermissions, type Reference } from '../../../../../lib/yx-org';

const id = encodeURIComponent;

// Settings › Organisation › Locations (P01 §4.2): sites with state, time zone, geofence and networks.
export default function YxLocationsPage() {
  const locations = useOrg<OrgLocation[]>('/locations?includeArchived=true');
  const entities = useOrg<LegalEntity[]>('/legal-entities?includeArchived=true');
  const reference = useOrg<Reference>('/reference');
  const perms = useYxPermissions();
  const write = useOrgWrite();
  return (
    <LocationsScreen
      state={loadState(locations, entities, reference)}
      onRetry={() => void Promise.all([locations.refetch(), entities.refetch(), reference.refetch()])}
      locations={locations.data ?? []}
      entities={entities.data ?? []}
      states={reference.data?.states ?? []}
      canManage={perms.has('org.settings.manage')}
      onSave={async (locationId, input) => {
        await write(locationId ? 'PUT' : 'POST', locationId ? `/locations/${id(locationId)}` : '/locations', input);
      }}
      onArchive={async (locationId) => void (await write('POST', `/locations/${id(locationId)}/archive`))}
      onRestore={async (locationId) => void (await write('POST', `/locations/${id(locationId)}/restore`))}
      onDelete={async (locationId) => void (await write('DELETE', `/locations/${id(locationId)}`))}
    />
  );
}
