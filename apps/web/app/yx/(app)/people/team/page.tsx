'use client';

import { useRouter } from 'next/navigation';
import { TeamScreen, type OrgChartData, type TeamMember } from '@yukthix/ui/workforce';
import type { PersonOption } from '@yukthix/ui/history';
import { loadState, todayIst, useYxPermissions } from '../../../../../lib/yx-org';
import { chartPeople, useChangeOptions, usePeople, useRaiseChange } from '../../../../../lib/yx-people';

const id = encodeURIComponent;

// People › My team (PPL-08; M01 §3.10): the signed-in manager's subtree and dotted-line reports. With
// request.raise_on_behalf they raise promotions, transfers, re-designations and manager changes for the
// reporting team; HR approves (YX-SEC-27). The API checks every one.
export default function YxTeamPage() {
  const router = useRouter();
  const perms = useYxPermissions();
  const team = usePeople<{ managerId: string | null; members: TeamMember[] }>('/team');
  const hrDesk = perms.has('employee.change.manage');
  const canRaise = hrDesk || perms.has('request.raise_on_behalf');
  const chart = usePeople<OrgChartData>(canRaise ? '/org-chart' : null);
  const members = team.data?.members ?? [];
  const everyone = chartPeople(chart.data);
  // A change is raised for the reporting team, never a dotted-line report.
  const subjects: PersonOption[] = everyone.filter((p) => members.some((m) => m.id === p.id && m.relation !== 'dotted'));
  const options = useChangeOptions(subjects, perms.has('employee.salary.manage'), canRaise);
  const raise = useRaiseChange();
  const types = hrDesk ? undefined : (['promotion', 'transfer', 'redesignation', 'manager_change'] as const);
  return (
    <TeamScreen
      state={loadState(team)}
      onRetry={() => void team.refetch()}
      members={members}
      today={todayIst()}
      onOpenHistory={(personId) => router.push(`/yx/people/history?person=${id(personId)}`)}
      raise={canRaise && chart.data ? { options: { ...options, managers: everyone, ...(types ? { types: [...types] } : {}) }, ...raise } : undefined}
    />
  );
}
