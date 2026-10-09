'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OrgChartScreen, type OrgChartData, type TeamMember } from '@yukthix/ui/workforce';
import { loadState, todayIst, useYxPermissions } from '../../../../../lib/yx-org';
import { usePeople } from '../../../../../lib/yx-people';

const id = encodeURIComponent;

// People › Org chart (PPL-02; M01 §3.2): today's reporting lines for everyone with an employee record; company-wide
// HR may view it as on another date (P06 §4.7, P02 §4.3); HR opens a person's job history.
export default function YxOrgChartPage() {
  const router = useRouter();
  const perms = useYxPermissions();
  const today = todayIst();
  const [asOf, setAsOf] = useState(today);
  const isHr = perms.has('employee.profile.view');
  const chart = usePeople<OrgChartData>(asOf === today ? '/org-chart' : `/org-chart?asOf=${id(asOf)}`, { keepPrevious: true });
  // The signed-in person's own record: the chart opens on them.
  const team = usePeople<{ managerId: string | null; members: TeamMember[] }>('/team');
  return (
    <OrgChartScreen
      state={chart.data ? 'ready' : loadState(chart)}
      onRetry={() => void chart.refetch()}
      data={chart.data ?? null}
      today={today}
      onAsOf={chart.data?.otherDates ? setAsOf : undefined}
      meId={team.data?.managerId ?? null}
      companyName="Organisation"
      onOpenPerson={isHr ? (personId) => router.push(`/yx/people/history?person=${id(personId)}`) : undefined}
    />
  );
}
