'use client';

import { useState } from 'react';
import { FEEDBACK_VISIBILITY, QuickFeedbackScreen, type FeedbackItem, type FeedbackRequest, type QuickFeedbackItem } from '@yukthix/ui/performance';
import type { TeamMember } from '@yukthix/ui/workforce';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { usePeople } from '../../../../../lib/yx-people';
import { day, designState, usePerf, usePerfWrite } from '../../../../../lib/yx-performance';

// PRF-08 Quick feedback, the designed screen with live data: received, given, requests to me, my team's (managers),
// and for HR who handle concerns one person's feedback with sealing. A concern goes to the confidential channel; until
// M08's intake exists that is the Help centre.
const CONCERN_HREF = '/yx/desk/help';

type Item = FeedbackItem & { goal?: string | null };
type List = { items: Item[]; defaultVisibility?: keyof typeof FEEDBACK_VISIBILITY };

const row = (x: Item): QuickFeedbackItem => ({
  id: x.id,
  from: x.from,
  to: x.to,
  kind: x.kind === 'praise' ? 'Praise' : 'Suggestion',
  text: x.text,
  at: new Date(x.at),
  goal: x.goal ?? undefined,
  visibility: FEEDBACK_VISIBILITY[x.visibility],
  canWithdraw: x.can.withdraw,
  canSeal: x.can.seal,
  sealed: x.sealed,
});

export default function YxFeedbackPage() {
  const perms = useYxPermissions();
  const canSeal = perms.has('perf.concern.seal');
  const received = usePerf<List>('/feedback?view=received');
  const given = usePerf<List>('/feedback?view=given');
  const requests = usePerf<{ requests: FeedbackRequest[] }>('/feedback-requests');
  const me = usePeople<{ employeeId: string | null }>('/me');
  const team = usePeople<{ managerId: string | null; members: TeamMember[] }>('/team');
  const reports = (team.data?.members ?? []).filter((m) => m.relation !== 'dotted').map((m) => ({ value: m.id, label: m.name }));
  const teamItems = usePerf<List>('/feedback?view=team', reports.length > 0);
  const [person, setPerson] = useState<string | null>(null);
  const concerns = usePerf<List>(person ? `/feedback/employee/${encodeURIComponent(person)}` : null, canSeal);
  const [to, setTo] = useState<string | null>(null);
  const goals = usePerf<{ goals: { value: string; label: string }[] }>(to ? `/feedback/goal-options/${encodeURIComponent(to)}` : null);
  // Colleagues are searched on the server (the directory: RLS and its visibility rules decide who appears).
  const [search, setSearch] = useState('');
  const directory = usePeople<{ people: { id: string; name: string; designation: { name: string | null } | null; department: { name: string | null } | null }[] }>(`/directory?limit=25${search ? `&q=${encodeURIComponent(search)}` : ''}`, { keepPrevious: true });
  const write = usePerfWrite();
  const myId = me.data?.employeeId ?? null;
  return (
    <QuickFeedbackScreen
      state={designState(received, given, requests)}
      me=""
      people={(directory.data?.people ?? []).filter((p) => p.id !== myId).map((p) => ({ id: p.id, name: p.name, role: p.designation?.name ?? undefined, department: p.department?.name ?? undefined }))}
      goals={goals.data?.goals ?? []}
      received={(received.data?.items ?? []).map(row)}
      given={(given.data?.items ?? []).map(row)}
      requests={(requests.data?.requests ?? []).map((r) => ({ id: r.id, from: r.requestedBy, about: r.aboutEmployeeId === myId ? 'you' : r.about, aboutId: r.aboutEmployeeId, question: r.question, at: r.askedAt ? new Date(r.askedAt) : new Date(), due: r.dueOn ? day(r.dueOn) : null }))}
      live={{
        onRetry: () => void Promise.all([received.refetch(), given.refetch(), requests.refetch()]),
        defaultVisibility: FEEDBACK_VISIBILITY[received.data?.defaultVisibility ?? 'private'],
        onPeopleSearch: setSearch,
        onRecipient: setTo,
        team: reports.length > 0 ? (teamItems.data?.items ?? []).map(row) : null,
        concerns: canSeal ? { personId: person, onPerson: setPerson, items: (concerns.data?.items ?? []).map(row) } : null,
        askAbout: [...(myId ? [{ value: myId, label: 'Myself' }] : []), ...reports],
        concernHref: CONCERN_HREF,
        onGive: (input) => write('POST', '/feedback', input),
        onWithdraw: (id) => write('POST', `/feedback/${encodeURIComponent(id)}/withdraw`),
        onAsk: (input) => write('POST', '/feedback-requests', input),
        onDecline: (id) => write('POST', `/feedback-requests/${encodeURIComponent(id)}/decline`),
        onSeal: (id, reason) => write('POST', `/feedback/${encodeURIComponent(id)}/seal`, { reason }),
      }}
    />
  );
}
