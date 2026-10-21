'use client';

import { useSearchParams } from 'next/navigation';
import { PlacementsLiveScreen, type LivePlacement, type PlacementInput } from '@yukthix/ui/hiring';
import type { LegalEntity } from '@yukthix/ui/org';
import { useOrg, useYxPermissions } from '../../../../../lib/yx-org';
import { useScope } from '../../../../../lib/yx-shell';
import { todayIndia } from '../../../../../lib/yx-time';
import { rolesState, useRoles, useRolesWrite } from '../../../../../lib/yx-workforce-roles';

// Hiring › Placements (HIR-17, founder decision 21 Oct 2026): people placed with clients for the legal entity chosen in
// the top bar, with bill rate and margin; new and end with staffing.placement.manage.
export default function YxPlacementsPage() {
  const params = useSearchParams();
  const perms = useYxPermissions();
  const { scope } = useScope();
  const q = scope.entity ? `?legalEntityId=${encodeURIComponent(scope.entity)}` : '';
  const rows = useRoles<LivePlacement[]>(`/staffing/placements${q}`);
  const entities = useOrg<LegalEntity[]>('/legal-entities');
  const write = useRolesWrite();
  return (
    <PlacementsLiveScreen
      state={rolesState(rows)}
      onRetry={() => void rows.refetch()}
      today={todayIndia()}
      rows={rows.data ?? []}
      entities={(entities.data ?? []).filter((e) => !e.archivedAt).map((e) => ({ id: e.id, name: e.name }))}
      canManage={perms.has('staffing.placement.manage')}
      defaultNewOpen={params?.get('new') === '1'}
      onCreate={(input: PlacementInput) => write('/staffing/placements', input)}
      onEnd={(p, endedOn, reason) => write(`/staffing/placements/${encodeURIComponent(p.id)}/end`, { endedOn, reason })}
    />
  );
}
