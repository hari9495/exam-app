'use client';

import { useParams } from 'next/navigation';
import { ActionPlanScreen, type LivePlanItem, type LiveResultsData } from '@yukthix/ui/engage';
import { engageState, useEngage, useEngageWrite } from '../../../../../../../lib/yx-engage';

type Plan = { focus: string; focusScore: string | null; status: 'draft' | 'shared' | 'completed'; items: LivePlanItem[]; createdAt: string } | null;

// Engage › Team surveys › action plan: the designed ENG-07 manager view with `live` (batch G2 item 74).
export default function YxTeamPlanPage() {
  const { id } = useParams<{ id: string }>();
  const results = useEngage<LiveResultsData & { closedOn: string }>(`/my/team-surveys/${encodeURIComponent(id)}`);
  const plan = useEngage<Plan>(`/my/team-surveys/${encodeURIComponent(id)}/plan`);
  const write = useEngageWrite();
  const r = results.data;
  const state = engageState(results);
  const due = r ? new Date(Date.parse(`${r.closedOn}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  return (
    <ActionPlanScreen
      key={plan.data === undefined ? 'loading' : 'ready'}
      live={{
        persona: 'mgr',
        state: plan.data === undefined && state === 'ready' ? 'loading' : state,
        onRetry: () => void plan.refetch(),
        survey: r?.name ?? '',
        plan: plan.data ?? null,
        focusOptions: r ? [...(r.enps ? [{ label: 'eNPS', score: r.enps.score === null ? null : `eNPS ${r.enps.score}` }] : []), ...r.themes.map((t) => ({ label: t.theme, score: t.favourable === null ? null : `${t.favourable}% favourable` }))] : [],
        dueOn: due,
        onSave: (p) => write('PUT', `/my/team-surveys/${encodeURIComponent(id)}/plan`, p),
        today: new Date(),
      }}
    />
  );
}
