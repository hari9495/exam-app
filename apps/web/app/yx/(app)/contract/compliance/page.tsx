'use client';

import { useState } from 'react';
import { VendorComplianceLiveScreen, type ComplianceView, type ContractorDocument, type ProofDetail } from '@yukthix/ui/contract';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { useScope } from '../../../../../lib/yx-shell';
import { todayIndia } from '../../../../../lib/yx-time';
import { formOf, recentMonths, rolesState, useRoles, useRolesRead, useRolesWrite } from '../../../../../lib/yx-workforce-roles';

const enc = encodeURIComponent;

// Contract labour › Vendor compliance (CLB-03, founder decision 21 Oct 2026): each contractor's monthly proofs for the
// wage month, standing documents with expiry, bill holds and liability alerts, for the legal entity in the top bar.
// Handing in needs clra.worker.manage; verifying, releasing a bill and closing alerts clra.compliance.manage.
export default function YxVendorCompliancePage() {
  const perms = useYxPermissions();
  const { scope } = useScope();
  const today = todayIndia();
  const months = recentMonths(today);
  // The wage month whose proofs are due now: last month.
  const [month, setMonth] = useState(months[months.length - 2]);
  const view = useRoles<ComplianceView>(`/contract-labour/compliance?month=${month}${scope.entity ? `&legalEntityId=${enc(scope.entity)}` : ''}`);
  const write = useRolesWrite();
  const read = useRolesRead();
  return (
    <VendorComplianceLiveScreen
      state={rolesState(view)}
      onRetry={() => void view.refetch()}
      today={today}
      months={months}
      month={month}
      onMonth={setMonth}
      view={view.data ?? null}
      canSubmit={perms.has('clra.worker.manage')}
      canVerify={perms.has('clra.compliance.manage')}
      onProof={(id) => read<ProofDetail>(`/contract-labour/proofs/${enc(id)}`)}
      onAddProof={({ file, ...fields }) => write('/contract-labour/proofs', formOf(fields, file))}
      onDecideProof={(id, decision, note) => write(`/contract-labour/proofs/${enc(id)}/decision`, { decision, ...(note ? { note } : {}) })}
      onRelease={(contractorId, reason) => write('/contract-labour/bill-releases', { contractorId, month, reason })}
      onResolve={(key, note) => write('/contract-labour/alerts/resolve', { key, note })}
      onDocuments={(contractorId) => read<ContractorDocument[]>(`/contract-labour/contractors/${enc(contractorId)}/documents`)}
      onAddDocument={(contractorId, { file, ...fields }) => write(`/contract-labour/contractors/${enc(contractorId)}/documents`, formOf(fields, file))}
      onDecideDocument={(id, decision, note) => write(`/contract-labour/documents/${enc(id)}/decision`, { decision, ...(note ? { note } : {}) })}
    />
  );
}
