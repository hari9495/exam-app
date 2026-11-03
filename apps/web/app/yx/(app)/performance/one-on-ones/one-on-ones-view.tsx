'use client';

import { useRouter } from 'next/navigation';
import { OneOnOneScreen, cadenceLabel, type Choice, type OneOnOne, type OneOnOnePair, type OneOnOneRow, PerfNoAccessScreen } from '@yukthix/ui/performance';
import { day, designState, usePerf, usePerfWrite, useSuggestedAgenda, refused } from '../../../../../lib/yx-performance';

// PRF-11 1:1s, the designed screen with live data: one row per pair (my manager, my direct reports), the record in a
// drawer (shared agenda and notes, my private note, action items), schedule with a rhythm, reschedule, mark as held.
// Only the two people see a 1:1 (the API checks). /one-on-ones/[id] opens the same screen with that 1:1's record.
type Meetings = { pairs: OneOnOnePair[]; partners: Choice[]; defaultCadenceDays: 7 | 14 | 30 };

const record = (m: OneOnOne): OneOnOneRow => ({
  id: m.id,
  employee: m.employee,
  manager: m.manager,
  role: '',
  cadence: cadenceLabel(m.cadenceDays ?? null),
  next: day(m.on),
  last: m.lastHeldOn ? day(m.lastHeldOn) : null,
  status: m.status,
  agenda: m.agenda.map((a) => ({ id: a.id, text: a.text, by: a.addedBy })),
  shared: m.sharedNotes ?? '',
  privateNote: m.privateNote,
  actions: m.actions.map((a) => ({ id: a.id, text: a.text, owner: a.owner, due: a.dueOn ? day(a.dueOn) : null, done: a.done, goal: m.goals?.find((g) => g.value === a.goalId)?.label })),
  history: [],
});

export function OneOnOnesPage({ openId }: { openId: string | null }) {
  const router = useRouter();
  const data = usePerf<Meetings>('/one-on-ones');
  const open = usePerf<OneOnOne>(openId ? `/one-on-ones/${encodeURIComponent(openId)}` : null);
  const write = usePerfWrite();
  // PRF-16: the suggested agenda for the open 1:1, only when I am its manager (the API answers 404 to anyone else).
  const agenda = useSuggestedAgenda(openId);
  const base = openId ? `/one-on-ones/${encodeURIComponent(openId)}` : '';
  const m = open.data;
  const pairs = data.data?.pairs ?? [];
  const persona = pairs.some((p) => p.role === 'manager') ? 'mgr' : 'emp';
  const go = (id: string | null) => router.push(id ? `/yx/performance/one-on-ones/${encodeURIComponent(id)}` : '/yx/performance/one-on-ones');
  if (refused(data)) return <PerfNoAccessScreen title="1:1s" what="1:1s" grantedBy="HR" active="1:1s" persona="emp" />;
  return (
    <OneOnOneScreen
      persona={persona}
      state={designState(data)}
      openId={openId ?? undefined}
      suggestedAgenda={agenda.items}
      items={pairs.map((p) => ({
        id: p.id,
        employee: p.employee,
        manager: p.manager,
        role: p.partnerRole,
        cadence: cadenceLabel(p.cadenceDays),
        next: day(p.on),
        last: p.lastHeldOn ? day(p.lastHeldOn) : null,
        status: p.status,
        agenda: [],
        shared: '',
        privateNote: '',
        actions: [],
        history: [],
        counts: { agenda: p.agendaItems, openActions: p.openActions },
      }))}
      live={{
        today: new Date(),
        onRetry: () => void Promise.all([data.refetch(), open.refetch()]),
        record: m ? record(m) : null,
        recordState: designState(open),
        onOpen: go,
        partners: data.data?.partners ?? [],
        defaultCadence: data.data?.defaultCadenceDays ?? 14,
        owners: m ? [{ value: m.employeeId, label: m.employee }, { value: m.managerEmployeeId, label: m.manager }] : [],
        goals: m?.goals ?? [],
        onSchedule: async (input) => go((await write<{ id: string }>('POST', '/one-on-ones', input)).id),
        onAgenda: (text) => write('POST', `${base}/agenda`, { text }),
        onSharedNotes: (sharedNotes) => write('PUT', base, { sharedNotes, version: m?.version }),
        onPrivateNote: (text) => write('PUT', `${base}/private-note`, { text }),
        onAction: (input) => write('POST', `${base}/actions`, input),
        onActionDone: (actionId, done) => write('PUT', `${base}/actions/${encodeURIComponent(actionId)}`, { done }),
        onHeld: () => write('PUT', base, { status: 'held', version: m?.version }),
        onReschedule: (on) => write('PUT', base, { on, version: m?.version }),
      }}
    />
  );
}
