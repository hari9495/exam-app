'use client';

import { useSearchParams } from 'next/navigation';
import { ContractWorkersLiveScreen, type DeployInput, type LiveContractor, type LiveWorker } from '@yukthix/ui/contract';
import type { OrgLocation } from '@yukthix/ui/org';
import { useOrg, useYxPermissions } from '../../../../../lib/yx-org';
import { useScope } from '../../../../../lib/yx-shell';
import { todayIndia } from '../../../../../lib/yx-time';
import { rolesState, useRoles, useRolesWrite } from '../../../../../lib/yx-workforce-roles';

// Contract labour › Contract workers (CLB-02, founder decision 21 Oct 2026): workers deployed by contractors at the
// sites the person's key reaches, for the legal entity chosen in the top bar; deploy (licence and age checked), approve
// and release with clra.worker.manage.
export default function YxContractWorkersPage() {
  const params = useSearchParams();
  const perms = useYxPermissions();
  const { scope } = useScope();
  const q = scope.entity ? `?legalEntityId=${encodeURIComponent(scope.entity)}` : '';
  const workers = useRoles<LiveWorker[]>(`/contract-labour/workers${q}`);
  const contractors = useRoles<LiveContractor[]>('/contract-labour/contractors');
  const sites = useOrg<OrgLocation[]>('/locations');
  const write = useRolesWrite();
  const canManage = perms.has('clra.worker.manage');
  return (
    <ContractWorkersLiveScreen
      state={rolesState(workers, contractors)}
      onRetry={() => void workers.refetch()}
      today={todayIndia()}
      workers={workers.data ?? []}
      contractors={contractors.data ?? []}
      sites={(sites.data ?? []).filter((s) => !s.archivedAt).map((s) => ({ id: s.id, name: s.name, state: s.state, legalEntityId: s.legalEntityId }))}
      canManage={canManage}
      defaultDeployOpen={params?.get('deploy') === '1'}
      onDeploy={(input: DeployInput) => write('/contract-labour/workers', input)}
      onApprove={(w) => write(`/contract-labour/workers/${encodeURIComponent(w.id)}/approve`)}
      onRelease={(w) => write(`/contract-labour/workers/${encodeURIComponent(w.id)}/release`)}
    />
  );
}
