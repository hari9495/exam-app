'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PeerPanel, ReviewScreen, type Nominations, type PeerGroups, type ReviewDetail } from '@yukthix/ui/performance';
import { loadState } from '../../../../../../lib/yx-org';
import { usePerf, usePerfWrite } from '../../../../../../lib/yx-performance';

// One review (PRF-04 / PRF-05, M06 batch PM4): the self, manager and skip-level reviews, where it is, and after
// release the employee's acknowledgement or disagreement; HR may reopen it with a reason.
export default function YxReviewPage() {
  const router = useRouter();
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
  const questions = Object.fromEntries((review.data?.template.sections ?? []).flatMap((s) => s.questions.map((x) => [x.id, x.wholeSection ? s.title : x.text])));
  return (
    <ReviewScreen
      state={loadState(review)}
      onRetry={() => void review.refetch()}
      review={review.data ?? null}
      onBack={() => router.push('/yx/performance/reviews')}
      onSave={(stage, input, submit) => (submit ? write('POST', `${base}/entries/${stage}/submit`, input) : write('PUT', `${base}/entries/${stage}`, input))}
      extra={
        nominations.data?.peer ? (
          <PeerPanel
            data={nominations.data}
            groups={groups.data ?? null}
            questions={questions}
            options={options.data ?? []}
            onSearch={setQ}
            onNominate={(reviewerEmployeeId, relationship) => write('POST', `${base}/nominations`, { reviewerEmployeeId, relationship })}
            onDecide={(nid, approve) => write('POST', `/nominations/${encodeURIComponent(nid)}/${approve ? 'approve' : 'decline'}`)}
            onWithdraw={(nid) => write('POST', `/nominations/${encodeURIComponent(nid)}/withdraw`)}
          />
        ) : null
      }
      onAddOther={(employeeId) => write('POST', `${base}/other-reviewers`, { employeeId })}
      onSkip={(agree, text) => (agree ? write('POST', `${base}/skip/agree`, { comment: text }) : write('POST', `${base}/send-back`, { reason: text }))}
      onAcknowledge={(comment) => write('POST', `${base}/acknowledge`, { comment })}
      onDisagree={(text) => write('POST', `${base}/disagree`, { text })}
      onReopen={(reason) => write('POST', `${base}/reopen`, { reason })}
    />
  );
}
