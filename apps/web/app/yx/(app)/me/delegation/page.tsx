'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@yukthix/ui';
import { DelegationScreen } from '@yukthix/ui/frame';
import type { Delegation, PickOption } from '@yukthix/ui/desk';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { useCurrentUser } from '../../../../../lib/hooks/useCurrentUser';
import { useWorkspaceCounts } from '../../../../../lib/yx-shell';

const day = (iso: string) => new Date(`${iso}T00:00:00`);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Delegation (PLT-07, design audit step 2) on the P03 approvals engine: who approves for me while I am away.
export default function YxDelegationPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const qc = useQueryClient();
  const me = useCurrentUser();
  const counts = useWorkspaceCounts();
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const list = useQuery<Delegation[]>({ queryKey: ['workflow', '/delegations'], queryFn: () => apiFetch('/workflow/delegations', {}, token), enabled: Boolean(token), retry: false });
  const found = useQuery<PickOption[]>({ queryKey: ['workflow', '/people', q], queryFn: () => apiFetch(`/workflow/people?q=${encodeURIComponent(q)}`, {}, token), enabled: Boolean(token), retry: false });
  const [chosen, setChosen] = useState<Map<string, string>>(new Map());
  const write = async (path: string, body?: unknown) => {
    await apiFetch(`/workflow${path}`, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, token);
    await qc.invalidateQueries({ queryKey: ['workflow'] });
  };
  const myId = me.data?.id ?? '';
  // Manual delegations only: one made by approved leave ends with the leave and is managed there.
  const mine = (list.data ?? []).filter((d) => d.mine && d.source !== 'leave');
  const current = mine[mine.length - 1] ?? null;
  // The search results, plus the current delegate, so the picker can always show who is chosen.
  const names = new Map(chosen);
  for (const p of found.data ?? []) names.set(p.id, p.label);
  if (current?.delegateUserId) names.set(current.delegateUserId, current.delegate);
  const people = [...names].filter(([id]) => id !== myId).map(([id, name]) => ({ id, name }));
  return (
    <DelegationScreen
      live={{
        meId: myId,
        meName: me.data?.name || me.data?.email || 'you',
        today: new Date(new Date().toDateString()),
        people,
        onFindPeople: setQ,
        current: current?.delegateUserId ? { id: current.id, delegateId: current.delegateUserId, from: day(current.startsOn), to: day(current.endsOn) } : null,
        waiting: counts.data?.approvals ?? 0,
        onSave: async ({ delegateId, from, to }) => {
          setChosen((m) => new Map(m).set(delegateId, names.get(delegateId) ?? ''));
          await write('/delegations', { delegateUserId: delegateId, startsOn: iso(from), endsOn: iso(to) });
          // "Change": the new delegation replaces the old one.
          if (current) await write(`/delegations/${encodeURIComponent(current.id)}/revoke`);
        },
        onEnd: (id) => write(`/delegations/${encodeURIComponent(id)}/revoke`),
        delegatedToYou: (list.data ?? []).filter((d) => !d.mine).map((d) => ({ id: d.id, person: d.person, from: day(d.startsOn), to: day(d.endsOn) })),
        approvalsHref: '/yx/approvals',
        onDone: (text) => toast({ title: text, tone: 'success' }),
      }}
    />
  );
}
