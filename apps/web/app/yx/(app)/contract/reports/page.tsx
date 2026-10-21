'use client';

import { useState } from 'react';
import { ContractReportsLiveScreen, type ReportsView } from '@yukthix/ui/contract';
import type { LegalEntity } from '@yukthix/ui/org';
import { useOrg } from '../../../../../lib/yx-org';
import { useScope } from '../../../../../lib/yx-shell';
import { todayIndia } from '../../../../../lib/yx-time';
import { recentMonths, rolesState, useRoles } from '../../../../../lib/yx-workforce-roles';

// Contract labour › Reports (designed 21 Oct 2026): headcount by contractor, licence use, deployed and released, and the
// month's proofs by contractor, for the legal entity chosen in the top bar.
export default function YxContractReportsPage() {
  const { scope } = useScope();
  const today = todayIndia();
  const months = recentMonths(today);
  const [month, setMonth] = useState(months[months.length - 1]);
  const view = useRoles<ReportsView>(`/contract-labour/reports?month=${month}${scope.entity ? `&legalEntityId=${encodeURIComponent(scope.entity)}` : ''}`);
  const entities = useOrg<LegalEntity[]>('/legal-entities');
  const name = scope.entity ? (entities.data?.find((e) => e.id === scope.entity)?.name ?? '') : 'All entities';
  return <ContractReportsLiveScreen state={rolesState(view)} onRetry={() => void view.refetch()} today={today} months={months} month={month} onMonth={setMonth} scopeLabel={name} view={view.data ?? null} />;
}
