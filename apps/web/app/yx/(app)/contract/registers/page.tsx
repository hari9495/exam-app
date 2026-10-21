'use client';

import { useState } from 'react';
import { RegistersLiveScreen, type AnnualReturn, type RegistersView } from '@yukthix/ui/contract';
import { useScope } from '../../../../../lib/yx-shell';
import { todayIndia } from '../../../../../lib/yx-time';
import { recentMonths, rolesState, useRoles, useRolesDownload } from '../../../../../lib/yx-workforce-roles';

const enc = encodeURIComponent;

// Contract labour › CLRA registers & returns (CLB-04, founder decision 21 Oct 2026): the registers of each establishment
// for a month (Excel for those with data; the others say what they need), the inspection pack and the annual return.
export default function YxClraRegistersPage() {
  const { scope } = useScope();
  const today = todayIndia();
  const months = recentMonths(today);
  const [month, setMonth] = useState(months[months.length - 2]);
  const year = Number(month.slice(0, 4));
  const entity = scope.entity ? `&legalEntityId=${enc(scope.entity)}` : '';
  const view = useRoles<RegistersView>(`/contract-labour/registers?month=${month}${entity}`);
  const returns = useRoles<AnnualReturn[]>(`/contract-labour/returns?year=${year}${entity}`);
  const download = useRolesDownload();
  return (
    <RegistersLiveScreen
      state={rolesState(view)}
      onRetry={() => void view.refetch()}
      months={months}
      month={month}
      onMonth={setMonth}
      view={view.data ?? null}
      returns={returns.data ?? null}
      year={year}
      onDownload={(r) => void download(`/contract-labour/registers/file?kind=${r.kind}&siteId=${enc(r.siteId)}&month=${r.period}${r.contractorId ? `&contractorId=${enc(r.contractorId)}` : ''}`, `${r.kind}-${r.period}.xlsx`)}
      onInspectionPack={(siteId) => void download(`/contract-labour/registers/inspection-pack?siteId=${enc(siteId)}&month=${month}`, `inspection-pack-${month}.zip`)}
      onReturnFile={(r) => void download(`/contract-labour/returns/file?siteId=${enc(r.siteId)}&year=${r.year}`, `annual-return-${r.year}.xlsx`)}
    />
  );
}
