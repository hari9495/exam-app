'use client';

import { UpcomingExitsScreen, type UpcomingExit } from '@yukthix/ui/lifecycle';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { useJoinerPlaces, useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

// People › Retirements and contract ends (LIFE-5.06; YX-LC-19 / 20).
export default function YxUpcomingExitsPage() {
  const perms = useYxPermissions();
  const canChange = perms.has('employee.change.manage');
  const data = useLife<{ today: string; rows: UpcomingExit[] }>('/lifecycle/upcoming-exits');
  const places = useJoinerPlaces(canChange);
  const write = useLifeWrite();
  return (
    <UpcomingExitsScreen
      state={loadState(data)}
      onRetry={() => void data.refetch()}
      rows={data.data?.rows ?? null}
      today={data.data?.today ?? ''}
      people={places.managers}
      employmentTypes={places.employmentTypes}
      canChange={canChange}
      onContract={(employeeId, x) => write('PUT', `/lifecycle/contracts/${encodeURIComponent(employeeId)}`, x)}
    />
  );
}
