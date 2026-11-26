import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../components/button';
import { DatePicker } from '../../../components/date';
import { type BadgeTone } from '../../../components/display';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { FormField } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { PersonPicker, type PersonOption } from '../../../components/select';
import { DataTable } from '../../../components/table';
import { dayKey } from '../../../lib/dates';
import { useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import type { LoadState, Nomination, Nominations, PeerConfig, PeerGroups, ReviewerBlock } from './types';

// Performance batch PM5, wired (M06-BUILD-DESIGN §10, §15.3; PRF-07). Feedback from colleagues is anonymous and shown
// only as groups of at least the company's minimum; it is advisory and never part of the score.

const STATUS: Record<Nomination['status'], { label: string; tone: BadgeTone }> = {
  proposed: { label: 'Waiting for the manager', tone: 'info' },
  approved: { label: 'Asked', tone: 'success' },
  declined: { label: 'Declined', tone: 'neutral' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  submitted: { label: 'Answered', tone: 'success' },
};
const REL = { peer: 'Peer', report: 'Reports to them', other: 'Someone else' } as const;
const GROUP = { peer: 'Peers', report: 'People who report to them', others: 'Others' } as const;

// ------------------------------------------------------------------------------------------ on the review (PRF-07)

// Batch F (answer 2579): FeedbackTasksScreen and PeerFormScreen are designed screens now (growth/peer-answer.tsx).
export { FeedbackTasksScreen, PeerFormScreen, type FeedbackTasksScreenProps, type PeerFormScreenProps } from '../../growth/peer-answer';

// ------------------------------------------------------------------------------------------ reviewer blocks (§15.3)

export interface ReviewerBlocksScreenProps {
  state: LoadState;
  onRetry?: () => void;
  blocks: ReviewerBlock[];
  people: PersonOption[];
  onSearch: (q: string) => void;
  onBlock: (input: { employeeA: string; employeeB: string; reasonCode: ReviewerBlock['reasonCode']; untilOn: string | null }) => Promise<unknown>;
  onEnd: (id: string) => Promise<unknown>;
}

export function ReviewerBlocksScreen(p: ReviewerBlocksScreenProps) {
  const { busy, error, run } = useRun();
  const [adding, setAdding] = useState(false);
  const [a, setA] = useState<PersonOption | null>(null);
  const [b, setB] = useState<PersonOption | null>(null);
  const [tried, setTried] = useState(false);
  const [reason, setReason] = useState<ReviewerBlock['reasonCode']>('conflict');
  const [until, setUntil] = useState<Date | null>(null);
  const pick = (chosen: PersonOption | null) => (chosen && !p.people.some((x) => x.id === chosen.id) ? [chosen, ...p.people] : p.people);
  return (
    <LivePage
      title="Reviewer blocks"
      description="Pairs who never review each other. Neither person is told why, and the picker does not show it."
      state={p.state}
      onRetry={p.onRetry}
      what="reviewer blocks"
      actions={
        <Button variant="primary" icon={Plus} onClick={() => (setTried(false), setAdding(true))}>
          Block a pair
        </Button>
      }
    >
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      <DataTable
        label="Reviewer blocks"
        columns={[
          { key: 'p', header: 'Pair', value: (x: ReviewerBlock) => `${x.a} and ${x.b}`, width: 320, hideable: false },
          { key: 'r', header: 'Reason', value: (x) => (x.reasonCode === 'conflict' ? 'Conflict' : 'Confidential matter'), width: 200 },
          { key: 'u', header: 'Until', value: (x) => x.untilOn ?? '', render: (x) => <Text>{x.untilOn ? dateText(x.untilOn) : 'Until ended'}</Text>, width: 160 },
        ]}
        rows={p.blocks}
        getRowId={(x) => x.id}
        rowNoun={['block', 'blocks']}
        cardSummary
        empty={<EmptyState compact title="No pairs are blocked." />}
        rowButtons={(x) => (
          <Button size="sm" loading={busy === x.id} onClick={() => void run(x.id, () => p.onEnd(x.id))}>
            End
          </Button>
        )}
      />
      {adding && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setAdding(false)}
          size="md"
          title="Block a pair from reviewing each other"
          confirmLabel="Block"
          onConfirm={async () => {
            setTried(true);
            if (!a || !b || a.id === b.id) return false;
            await p.onBlock({ employeeA: a!.id, employeeB: b!.id, reasonCode: reason, untilOn: until ? dayKey(until) : null });
            setAdding(false);
          }}
        >
          <FormField id="rb-a" label="One person" required error={tried && !a ? 'Choose the first person.' : null}>
            <PersonPicker aria-label="One person" value={a?.id ?? null} onChange={(id) => setA(pick(a).find((x) => x.id === id) ?? null)} people={pick(a)} onSearchChange={p.onSearch} />
          </FormField>
          <FormField id="rb-b" label="The other person" required error={!tried ? null : !b ? 'Choose the other person.' : a && a.id === b.id ? 'Choose a different person.' : null}>
            <PersonPicker aria-label="The other person" value={b?.id ?? null} onChange={(id) => setB(pick(b).find((x) => x.id === id) ?? null)} people={pick(b)} onSearchChange={p.onSearch} />
          </FormField>
          <FormField id="rb-reason" label="Reason (only HR sees it)">
            <Segment label="Reason" value={reason} onChange={setReason} options={[{ value: 'conflict', label: 'Conflict' }, { value: 'confidential_matter', label: 'Confidential matter' }]} />
          </FormField>
          <FormField id="rb-until" label="Until" optional helper="Leave empty to keep it until you end it.">
            <DatePicker value={until} onChange={setUntil} min={new Date()} aria-label="Block until" />
          </FormField>
        </ConfirmDialog>
      )}
    </LivePage>
  );
}
