'use client';

import { ContractorsLiveScreen, type LiveContractor } from '@yukthix/ui/contract';
import type { LegalEntity, OrgLocation } from '@yukthix/ui/org';
import { useOrg, useYxPermissions } from '../../../../../lib/yx-org';
import { useScope } from '../../../../../lib/yx-shell';
import { todayIndia } from '../../../../../lib/yx-time';
import { rolesState, useRoles, useRolesWrite } from '../../../../../lib/yx-workforce-roles';

// Contract labour › Contractors (CLB-01, founder decision 21 Oct 2026): the contractor register with each licence's
// site, states covered, maximum and validity (renewal alerts); add contractors and licences with clra.worker.manage.
export default function YxContractorsPage() {
  const perms = useYxPermissions();
  const { scope } = useScope();
  const q = scope.entity ? `?legalEntityId=${encodeURIComponent(scope.entity)}` : '';
  const contractors = useRoles<LiveContractor[]>(`/contract-labour/contractors${q}`);
  const entities = useOrg<LegalEntity[]>('/legal-entities');
  const sites = useOrg<OrgLocation[]>('/locations');
  const write = useRolesWrite();
  return (
    <ContractorsLiveScreen
      state={rolesState(contractors)}
      onRetry={() => void contractors.refetch()}
      today={todayIndia()}
      contractors={contractors.data ?? []}
      entities={(entities.data ?? []).filter((e) => !e.archivedAt).map((e) => ({ id: e.id, name: e.name }))}
      sites={(sites.data ?? []).filter((s) => !s.archivedAt).map((s) => ({ id: s.id, name: s.name, state: s.state, legalEntityId: s.legalEntityId }))}
      canManage={perms.has('clra.worker.manage')}
      onAdd={(input) => write('/contract-labour/contractors', input)}
      onAddLicence={(id, licence) => write(`/contract-labour/contractors/${encodeURIComponent(id)}/licences`, licence)}
    />
  );
}
