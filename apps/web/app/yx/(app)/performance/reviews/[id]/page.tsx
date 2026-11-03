'use client';

import { useParams } from 'next/navigation';
import { ReviewAcknowledgeScreen, ReviewWorkspaceScreen, type Nominations, type PeerGroups, type ReviewDetail, PerfNoAccessScreen } from '@yukthix/ui/performance';
import { loadState } from '../../../../../../lib/yx-org';
import { perfState, usePerf, usePerfWrite, useReviewAssistant, refused } from '../../../../../../lib/yx-performance';

// One review. The employee's released review is PRF-06 (acknowledge, with a disagreement in the same step); every other
// view is the PRF-05 workspace (self, manager, former manager, skip-level, the chain above and HR). 360° nominations are
// the PRF-07 page, linked from the workspace ("Nominate reviewers"); the workspace shows the grouped answers.
export default function YxReviewPage() {
  const { id } = useParams<{ id: string }>();
  const base = `/reviews/${encodeURIComponent(id)}`;
  const review = usePerf<ReviewDetail>(base);
  const nominations = usePerf<Nominations>(`${base}/nominations`, Boolean(review.data && review.data.role !== 'other'));
  const peerOn = Boolean(nominations.data?.peer);
  const groups = usePerf<PeerGroups>(`${base}/peer-feedback`, peerOn);
  const canNominate = Boolean(nominations.data?.can.propose || nominations.data?.can.add);
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
  if (refused(review)) return <PerfNoAccessScreen title="Review" what="this review" grantedBy="HR" active="Reviews & cycles" persona="emp" />;
  if (r && r.role === 'employee' && r.released)
    return <ReviewAcknowledgeScreen live={{ review: r, onAcknowledge: (comment, disagreement) => write('POST', `${base}/acknowledge`, { comment, ...(disagreement ? { disagreement } : {}) }), onDisagree: (text) => write('POST', `${base}/disagree`, { text }), escalate }} />;
  return (
    <ReviewWorkspaceScreen
      live={{
        state: perfState(loadState(review)),
        onRetry: () => void review.refetch(),
        review: r ?? null,
        peer: groups.data ?? null,
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
