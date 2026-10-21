'use client';

import { useSearchParams } from 'next/navigation';
import { ContractWorkersLiveScreen, type DeployInput, type IdentifierInput, type LiveContractor, type LiveWorker } from '@yukthix/ui/contract';
import type { OrgLocation } from '@yukthix/ui/org';
import { useOrg, useYxPermissions } from '../../../../../lib/yx-org';
import { useScope } from '../../../../../lib/yx-shell';
import { todayIndia } from '../../../../../lib/yx-time';
import { rolesState, useRoles, useRolesDownload, useRolesRead, useRolesWrite } from '../../../../../lib/yx-workforce-roles';

const enc = encodeURIComponent;

// Contract labour › Contract workers (CLB-02, founder decision 21 Oct 2026): workers deployed by contractors at the
// sites the person's key reaches, for the legal entity chosen in the top bar; deploy (licence, age and minimum-wage
// hint), approve and release with clra.worker.manage; Aadhaar, UAN and ESI shown masked, in full only with
// clra.identity.view (each view recorded); export.
export default function YxContractWorkersPage() {
  const params = useSearchParams();
  const perms = useYxPermissions();
  const { scope } = useScope();
  const q = scope.entity ? `?legalEntityId=${enc(scope.entity)}` : '';
  const workers = useRoles<LiveWorker[]>(`/contract-labour/workers${q}`);
  const contractors = useRoles<LiveContractor[]>('/contract-labour/contractors');
  const sites = useOrg<OrgLocation[]>('/locations');
  const write = useRolesWrite();
  const read = useRolesRead();
  const download = useRolesDownload();
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
      onApprove={(w) => write(`/contract-labour/workers/${enc(w.id)}/approve`)}
      onRelease={(w) => write(`/contract-labour/workers/${enc(w.id)}/release`)}
      canReveal={perms.has('clra.identity.view')}
      onReveal={async (w, field) => (await read<{ value: string }>(`/contract-labour/workers/${enc(w.id)}/reveal`, { method: 'POST', body: JSON.stringify({ field }) })).value}
      onSetIdentifiers={(w, input: IdentifierInput) => write(`/contract-labour/workers/${enc(w.id)}/identifiers`, input, 'PATCH')}
      onMinimumWage={(siteId, skill, on) => read(`/contract-labour/minimum-wage?locationId=${enc(siteId)}&skill=${skill}&on=${on}`)}
      onExport={(format) => void download(`/contract-labour/workers/export?format=${format}${scope.entity ? `&legalEntityId=${enc(scope.entity)}` : ''}`, `contract-workers.${format}`)}
    />
  );
}
