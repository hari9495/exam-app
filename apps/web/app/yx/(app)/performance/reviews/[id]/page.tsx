'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { PeerPanel, ReviewAcknowledgeScreen, ReviewWorkspaceScreen, type Nominations, type PeerGroups, type ReviewDetail } from '@yukthix/ui/performance';
import { loadState } from '../../../../../../lib/yx-org';
import { perfState, usePerf, usePerfWrite, useReviewAssistant } from '../../../../../../lib/yx-performance';

// One review. The employee's released review is PRF-06 (acknowledge, with a disagreement in the same step); every other
// view is the PRF-05 workspace (self, manager, former manager, skip-level, the chain above and HR). 360° nominations are
// PRF-07, built separately; until then its live panel sits inside the workspace.
export default function YxReviewPage() {
  const { id } = useParams<{ id: string }>();
  const base = `/reviews/${encodeURIComponent(id)}`;
  const review = usePerf<ReviewDetail>(base);
  const nominations = usePerf<Nominations>(`${base}/nominations`, Boolean(review.data && review.data.role !== 'other'));
  const peerOn = Boolean(nominations.data?.peer);
  const groups = usePerf<PeerGroups>(`${base}/peer-feedback`, peerOn);
  const [q, setQ] = useState('');
  const canNominate = Boolean(nominations.data?.can.propose || nominations.data?.can.add);
  const options = usePerf<{ id: string; name: string }[]>(`${base}/nominee-options?q=${encodeURIComponent(q)}`, peerOn && canNominate);
  const write = usePerfWrite();
  const r = review.data;
  // PRF-17: the assistant only for the review's current manager (the API answers 404 to anyone else).
  const assistant = useReviewAssistant(r?.role === 'manager' ? id : null);
  // PRF-15: once HR answered my disagreement, I may escalate it (the API says whether, and until when).
  const answered = Boolean(r?.role === 'employee' && r.released && (r.disagreements ?? []).some((d) => d.status !== 'open'));
  const escalation = usePerf<{ canEscalate: boolean; dispute: { ref: string } | null }>(`${base}/dispute`, answered);
  const escalate = escalation.data?.dispute
    ? { href: `/yx/performance/reviews/${encodeURIComponent(id)}/dispute`, label: `See your escalation ${escalation.data.dispute.ref}` }
    : escalation.data?.canEscalate
      ? { href: `/yx/performance/reviews/${encodeURIComponent(id)}/dispute`, label: 'Escalate the dispute' }
      : null;
  if (r && r.role === 'employee' && r.released)
    return <ReviewAcknowledgeScreen live={{ review: r, onAcknowledge: (comment, disagreement) => write('POST', `${base}/acknowledge`, { comment, ...(disagreement ? { disagreement } : {}) }), onDisagree: (text) => write('POST', `${base}/disagree`, { text }), escalate }} />;
  const questions = Object.fromEntries((r?.template.sections ?? []).flatMap((s) => s.questions.map((x) => [x.id, x.wholeSection ? s.title : x.text])));
  return (
    <ReviewWorkspaceScreen
      live={{
        state: perfState(loadState(review)),
        onRetry: () => void review.refetch(),
        review: r ?? null,
        peer: groups.data ?? null,
        nominations: nominations.data?.peer ? (
          <PeerPanel
            data={nominations.data}
            groups={null}
            questions={questions}
            options={options.data ?? []}
            onSearch={setQ}
            onNominate={(reviewerEmployeeId, relationship) => write('POST', `${base}/nominations`, { reviewerEmployeeId, relationship })}
            onDecide={(nid, approve) => write('POST', `/nominations/${encodeURIComponent(nid)}/${approve ? 'approve' : 'decline'}`)}
            onWithdraw={(nid) => write('POST', `/nominations/${encodeURIComponent(nid)}/withdraw`)}
          />
        ) : undefined,
        onSave: (stage, input, submit) => (submit ? write('POST', `${base}/entries/${stage}/submit`, input) : write('PUT', `${base}/entries/${stage}`, input)),
        onSkip: (agree, text) => (agree ? write('POST', `${base}/skip/agree`, { comment: text }) : write('POST', `${base}/send-back`, { reason: text })),
        onReopen: (reason) => write('POST', `${base}/reopen`, { reason }),
        onAddOther: (employeeId) => write('POST', `${base}/other-reviewers`, { employeeId }),
        assistant,
        // PRF-07 page (builder 2): nominating 360° reviewers, when the cycle has them and I may nominate.
        nominateHref: peerOn && canNominate ? `/yx/performance/reviews/${encodeURIComponent(id)}/nominations` : null,
      }}
    />
  );
}
