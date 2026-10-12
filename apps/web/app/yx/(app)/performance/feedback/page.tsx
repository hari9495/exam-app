'use client';

import { useState } from 'react';
import { FeedbackScreen, type FeedbackItem, type FeedbackRequest, type FeedbackView } from '@yukthix/ui/performance';
import type { TeamMember } from '@yukthix/ui/workforce';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { usePeople } from '../../../../../lib/yx-people';
import { usePerf, usePerfWrite } from '../../../../../lib/yx-performance';

// Feedback (PRF-04, M06 batch PM3): received, given, asked of me, my team's, and, for HR who handle concerns, one
// person's feedback with sealing. A concern goes to the confidential channel; until M08's intake exists that is the
// Help centre.
const CONCERN_HREF = '/yx/desk/help';

export default function YxFeedbackPage() {
  const perms = useYxPermissions();
  const canSeal = perms.has('perf.concern.seal');
  const [view, setView] = useState<FeedbackView>('received');
  const [person, setPerson] = useState<string | null>(null);
  const list = view === 'concerns' ? (person ? `/feedback/employee/${encodeURIComponent(person)}` : null) : view === 'requests' ? null : `/feedback?view=${view}`;
  const items = usePerf<{ items: FeedbackItem[] }>(list);
  const requests = usePerf<{ requests: FeedbackRequest[] }>('/feedback-requests');
  const me = usePeople<{ employeeId: string | null }>('/me');
  const team = usePeople<{ managerId: string | null; members: TeamMember[] }>('/team');
  // shortcut: the first 200 colleagues A to Z; search the directory as you type once companies pass that.
  const directory = usePeople<{ people: { id: string; name: string }[] }>('/directory?limit=200');
  const write = usePerfWrite();
  const reports = (team.data?.members ?? []).filter((m) => m.relation !== 'dotted').map((m) => ({ value: m.id, label: m.name }));
  const myId = me.data?.employeeId ?? null;
  return (
    <FeedbackScreen
      state={loadState(requests, ...(list ? [items] : []))}
      onRetry={() => void Promise.all([requests.refetch(), items.refetch()])}
      view={view}
      onView={setView}
      hasTeam={reports.length > 0}
      canSeal={canSeal}
      sealEmployeeId={person}
      onSealEmployee={setPerson}
      items={list ? (items.data?.items ?? []) : []}
      requests={requests.data?.requests ?? []}
      colleagues={(directory.data?.people ?? []).filter((p) => p.id !== myId).map((p) => ({ value: p.id, label: p.name }))}
      askAbout={[...(myId ? [{ value: myId, label: 'Myself' }] : []), ...reports]}
      concernHref={CONCERN_HREF}
      onGive={(input) => write('POST', '/feedback', input)}
      onWithdraw={(id) => write('POST', `/feedback/${encodeURIComponent(id)}/withdraw`)}
      onRequest={(input) => write('POST', '/feedback-requests', input)}
      onDecline={(id) => write('POST', `/feedback-requests/${encodeURIComponent(id)}/decline`)}
      onSeal={(id, reason) => write('POST', `/feedback/${encodeURIComponent(id)}/seal`, { reason })}
    />
  );
}
