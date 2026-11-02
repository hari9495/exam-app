import { Button } from '../../../components/button';
import { Badge } from '../../../components/display';
import { EmptyState } from '../../../components/feedback';
import { Text } from '../../../components/foundations';
import { Segment } from '../../../components/segment';
import { Card } from '../../../components/shell';
import { DataTable, type TableColumn } from '../../../components/table';
import { LivePage, dateText } from '../../time/live/kit';
import type { Handover, LoadState, ReviewSummary } from './types';

// Performance batch PM4, wired: the list of my reviews, my team's and those in my scope, with hand-overs (PRF-13 later).
// The cycles, the review itself and the acknowledgement render the PRF-04 / 05 / 06 designs (screens/growth).
// The employee always sees where their review is and who has it next (U73), never a score before release (U69).

// ------------------------------------------------------------------------------------------ reviews (PRF-04, PRF-05)

export type ReviewsView = 'mine' | 'team' | 'scope';

export interface ReviewsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  view: ReviewsView;
  onView: (v: ReviewsView) => void;
  hasTeam: boolean;
  /** perf.review.view: reviews of people in scope. */
  canScope: boolean;
  reviews: ReviewSummary[];
  onOpen: (id: string) => void;
  /** What moved to or from the viewer when a manager changed (PRF-13). */
  handovers?: Handover[];
}

const nextText = (n: ReviewSummary['next']) => `${n.label}${n.owner ? ` · ${n.owner}` : ''}${n.dueOn ? ` · due ${dateText(n.dueOn)}` : ''}`;

export function ReviewsScreen(p: ReviewsScreenProps) {
  const columns: TableColumn<ReviewSummary>[] = [
    ...(p.view === 'mine' ? [] : [{ key: 'emp', header: 'Employee', value: (r: ReviewSummary) => r.employee, width: 200, hideable: false }]),
    { key: 'cycle', header: 'Cycle', value: (r) => r.cycle, width: 220 },
    { key: 'next', header: 'Where it is', value: (r) => nextText(r.next), width: 320 },
    ...(p.view === 'mine' ? [] : [{ key: 'score', header: 'Score', value: (r: ReviewSummary) => r.finalScore ?? '', render: (r: ReviewSummary) => <Text>{r.finalScore === null ? '—' : `${r.finalScore}${r.band ? ` · ${r.band}` : ''}`}</Text>, width: 180 }]),
  ];
  const views = [{ value: 'mine' as const, label: 'My reviews' }, ...(p.hasTeam ? [{ value: 'team' as const, label: 'My team' }] : []), ...(p.canScope ? [{ value: 'scope' as const, label: 'In my scope' }] : [])];
  return (
    <LivePage title="Reviews" description="Your reviews and your team's: where each one is and who has it next." state={p.state} onRetry={p.onRetry} what="reviews">
      {views.length > 1 && <Segment label="Show" value={p.view} onChange={p.onView} options={views} />}
      <DataTable
        label="Reviews"
        columns={columns}
        rows={p.reviews}
        getRowId={(r) => r.id}
        rowNoun={['review', 'reviews']}
        cardSummary
        empty={<EmptyState compact title="No reviews here." description={p.view === 'mine' ? 'When HR starts a review cycle that includes you, it shows here.' : undefined} />}
        rowButtons={(r) => (
          <Button size="sm" onClick={() => p.onOpen(r.id)}>
            Open
          </Button>
        )}
      />
      {(p.handovers ?? []).length > 0 && (
        <Card title="Hand-overs">
          <ul className="yx-lif-list">
            {p.handovers!.map((h) => (
              <li key={h.id}>
                <Text>{`${dateText(h.effectiveOn)} · ${h.employee}: ${h.artefactType === 'review' ? 'review' : 'a goal aligned to the old manager\u2019s goal'} ${h.direction === 'to_me' ? `from ${h.from}` : `to ${h.to}`}`}</Text>
                {h.decisionNeeded && <Badge tone="warning">Re-align the goal</Badge>}{' '}
                {h.artefactType === 'review' && h.direction === 'to_me' && (
                  <Button size="sm" onClick={() => p.onOpen(h.artefactId)}>
                    Open
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </LivePage>
  );
}

