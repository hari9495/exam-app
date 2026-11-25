'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { HybridPlannerScreen, type HybridCompliance, type HybridMe, type HybridPolicyGroup, type HybridTeam } from '@yukthix/ui/time';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { mondayOf, timeState, todayIndia, useTime, useTimeWrite } from '../../../../../lib/yx-time';

// My time › Office days (TIM-41): the designed HybridPlannerScreen. The API decides what the person sees: their own
// plan, their team's plan (a manager), compliance (the team or attendance.view in scope) and the policy
// (org.settings.manage; written through PUT /org/settings, which checks the key over the group again).
export default function YxHybridPage() {
  const [week, setWeek] = useState(mondayOf(todayIndia()));
  const me = useTime<HybridMe>(`/hybrid/me?week=${week}`);
  const can = me.data?.can;
  const team = useTime<HybridTeam>(can?.team ? `/hybrid/team?week=${week}` : null);
  const compliance = useTime<HybridCompliance>(can?.compliance ? '/hybrid/compliance' : null);
  const policy = useTime<{ groups: HybridPolicyGroup[] }>(can?.policy ? '/hybrid/policy' : null);
  const write = useTimeWrite();
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const part = <T,>(q: { isError: boolean; error: unknown; data: T | undefined; refetch: () => unknown }) => ({ state: timeState(q), data: q.data ?? null, onRetry: () => void q.refetch() });
  return (
    <HybridPlannerScreen
      live={{
        me: part(me),
        team: can?.team ? part(team) : undefined,
        compliance: can?.compliance ? part(compliance) : undefined,
        policy: can?.policy ? part(policy) : undefined,
        week,
        onWeek: setWeek,
        onPlan: (input) => write('/hybrid/plan', 'PUT', input),
        onRemind: (employeeId, w) => write('/hybrid/remind', 'POST', { employeeId, week: w }, false),
        onPolicy: async (group, values) => {
          const scope = group.scopeType === 'tenant' ? { scopeType: 'tenant' } : { scopeType: group.scopeType, scopeId: group.scopeId };
          for (const [key, value] of [['hybrid.office_days', values.officeDays], ['hybrid.anchor_days', values.anchors], ['hybrid.evidence', values.evidence]] as const) {
            await apiFetch('/org/settings', { method: 'PUT', body: JSON.stringify({ key, value, ...scope }) }, accessToken ?? undefined);
          }
          await queryClient.invalidateQueries({ queryKey: ['time'] });
        },
      }}
    />
  );
}
