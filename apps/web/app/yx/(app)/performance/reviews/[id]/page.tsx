'use client';

import { useParams, useRouter } from 'next/navigation';
import { ReviewScreen, type ReviewDetail } from '@yukthix/ui/performance';
import { loadState } from '../../../../../../lib/yx-org';
import { usePerf, usePerfWrite } from '../../../../../../lib/yx-performance';

// One review (PRF-04 / PRF-05, M06 batch PM4): the self, manager and skip-level reviews, where it is, and after
// release the employee's acknowledgement or disagreement; HR may reopen it with a reason.
export default function YxReviewPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const base = `/reviews/${encodeURIComponent(id)}`;
  const review = usePerf<ReviewDetail>(base);
  const write = usePerfWrite();
  return (
    <ReviewScreen
      state={loadState(review)}
      onRetry={() => void review.refetch()}
      review={review.data ?? null}
      onBack={() => router.push('/yx/performance/reviews')}
      onSave={(stage, input, submit) => (submit ? write('POST', `${base}/entries/${stage}/submit`, input) : write('PUT', `${base}/entries/${stage}`, input))}
      onAddOther={(employeeId) => write('POST', `${base}/other-reviewers`, { employeeId })}
      onSkip={(agree, text) => (agree ? write('POST', `${base}/skip/agree`, { comment: text }) : write('POST', `${base}/send-back`, { reason: text }))}
      onAcknowledge={(comment) => write('POST', `${base}/acknowledge`, { comment })}
      onDisagree={(text) => write('POST', `${base}/disagree`, { text })}
      onReopen={(reason) => write('POST', `${base}/reopen`, { reason })}
    />
  );
}
