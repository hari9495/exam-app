'use client';

import { useParams, useRouter } from 'next/navigation';
import { DraftScorecardReview } from '@yukthix/ui/hiring';
import { useHiring, useHiringWrite } from '../../../../../../../lib/yx-hiring';

type Draft = { candidate: string; scaleMax: number; items: { itemId: string; skill: string; rating: number; note: string; quote: string }[] };

// Hiring › one interview › my draft scorecard (HIR-25): the designed DraftScorecardReview with `live`. The AI draft is the
// panellist's own suggestion; they confirm or change every rating, choose a recommendation and submit their own
// scorecard (POST interviews/:id/scorecard/submit, refused while acting). Nothing is submitted by itself.
export default function YxDraftScorecardPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const draft = useHiring<Draft>(`/interviews/${encodeURIComponent(id)}/notetaker/draft`);
  const write = useHiringWrite();
  const status = (draft.error as { status?: number } | null)?.status;
  const d = draft.data;
  return (
    <DraftScorecardReview
      candidate={d?.candidate ?? ''}
      drafts={(d?.items ?? []).map((i) => ({ itemId: i.itemId, skill: i.skill, aiRating: i.rating, aiNote: i.note, quote: i.quote }))}
      live={{
        state: draft.isError ? (status === 404 || status === 403 ? 'not-found' : 'error') : d ? 'ready' : 'loading',
        onRetry: () => void draft.refetch(),
        scaleMax: d?.scaleMax ?? 5,
        onSubmit: (input) => write('POST', `/interviews/${encodeURIComponent(id)}/scorecard/submit`, { ratings: input.ratings, recommendation: input.recommendation }),
        onBack: () => router.push(`/yx/hiring/interviews/${encodeURIComponent(id)}`),
      }}
    />
  );
}
