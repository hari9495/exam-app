'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { OrgChartScreen } from '@yukthix/ui/frame';
import type { OrgPerson } from '@yukthix/ui';
import { csvText, downloadText, type OrgChartData } from '@yukthix/ui/workforce';
import { todayIst, useYxPermissions } from '../../../../../lib/yx-org';
import { usePeople } from '../../../../../lib/yx-people';
import { useOrgBranding } from '../../../../../lib/hooks/useBranding';

const id = encodeURIComponent;
const day = (iso: string) => new Date(`${iso}T00:00:00`);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// People › Org chart (PPL-02, design audit step 3): the designed chart with today's reporting lines for everyone with
// an employee record; company-wide HR may view it as on another date (P06 §4.7, P02 §4.3) and opens a person's record.
export default function YxOrgChartPage() {
  const router = useRouter();
  const perms = useYxPermissions();
  const branding = useOrgBranding();
  const today = todayIst();
  const [asOf, setAsOf] = useState(today);
  const isHr = perms.has('employee.profile.view');
  const chart = usePeople<OrgChartData>(asOf === today ? '/org-chart' : `/org-chart?asOf=${id(asOf)}`, { keepPrevious: true });
  const me = usePeople<{ employeeId: string }>('/me');
  const data = chart.data;
  const people: OrgPerson[] = useMemo(
    () => (data?.nodes ?? []).map((n) => ({ id: n.id, name: n.name, role: n.designation?.name ?? '', department: n.department?.name ?? '', managerId: n.managerId, dottedManagerId: n.dottedLineManagerIds[0] })),
    [data],
  );
  const exportCsv = () => {
    const byId = new Map((data?.nodes ?? []).map((n) => [n.id, n]));
    const rows = (data?.nodes ?? []).map((n) => [n.name, n.designation?.name ?? '', n.department?.name ?? '', n.location?.name ?? '', n.managerId ? (byId.get(n.managerId)?.name ?? '') : '', n.dottedLineManagerIds.map((d) => byId.get(d)?.name ?? '').join('; ')]);
    downloadText(`org-chart-${data?.asOf ?? today}.csv`, csvText([['Name', 'Designation', 'Department', 'Location', 'Manager', 'Dotted-line managers'], ...rows]));
  };
  return (
    <OrgChartScreen
      key={data ? 'ready' : 'loading'}
      people={people}
      asOn={day(asOf)}
      today={day(today)}
      persona={isHr ? 'hr' : 'emp'}
      live={{
        state: data ? 'ready' : chart.isError ? 'error' : 'loading',
        onRetry: () => void chart.refetch(),
        companyName: branding.data?.name || 'Organisation',
        ...(data?.otherDates ? { onAsOn: (d: Date) => setAsOf(iso(d)) } : {}),
        meId: me.data?.employeeId,
        truncated: Boolean(data?.truncated),
        ...(isHr ? { onOpenPerson: (personId: string) => router.push(`/yx/people/directory/${id(personId)}`) } : {}),
        ...(data?.nodes.length ? { onExportCsv: exportCsv } : {}),
      }}
    />
  );
}
