import { useState } from 'react';
import { Button } from '../../components/button';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { Segment } from '../../components/segment';
import { DataTable, type TableColumn } from '../../components/table';
import { useToast } from '../../components/notify';
import { formatDate } from '../../lib/format';
import { errorText } from '../org/org-kit';

// Batch F item 30 (answer 2575): the manager's view of their own team in a goal period: who has no goals, whose goals
// were not updated for the company's number of days, with a Remind that goes at most once a day per person.

export interface GoalGapPerson {
  employeeId: string;
  name: string;
  remindedAt: string | null;
  /** False when reminded in the last day. */
  canRemind: boolean;
  goals?: number;
  lastCheckIn?: string | null;
}
export interface GoalGaps {
  periodId: string;
  days: number;
  team: number;
  noGoals: GoalGapPerson[];
  notUpdated: GoalGapPerson[];
}

type Kind = 'no_goals' | 'not_updated';

export function GoalGapsCard({ gaps, onRemind, defaultKind }: { gaps: GoalGaps; onRemind: (employeeId: string, kind: Kind) => Promise<unknown>; defaultKind?: Kind }) {
  const { toast } = useToast();
  const [kind, setKind] = useState<Kind>(defaultKind ?? (gaps.noGoals.length || !gaps.notUpdated.length ? 'no_goals' : 'not_updated'));
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const rows = kind === 'no_goals' ? gaps.noGoals : gaps.notUpdated;
  const remind = async (p: GoalGapPerson) => {
    setBusy(p.employeeId);
    setFailed(null);
    try {
      await onRemind(p.employeeId, kind);
      toast({ tone: 'success', title: `Reminder sent to ${p.name}.` });
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const columns: TableColumn<GoalGapPerson>[] = [
    { key: 'name', header: 'Team member', type: 'person', value: (r) => r.name, width: 220 },
    ...(kind === 'not_updated'
      ? [
          { key: 'goals', header: 'Active goals', type: 'number' as const, value: (r: GoalGapPerson) => r.goals ?? 0 },
          { key: 'last', header: 'Last check-in', value: (r: GoalGapPerson) => r.lastCheckIn ?? '', render: (r: GoalGapPerson) => (r.lastCheckIn ? formatDate(new Date(`${r.lastCheckIn}T00:00:00`)) : 'Never') },
        ]
      : []),
    { key: 'reminded', header: 'Last reminded', value: (r) => r.remindedAt ?? '', render: (r) => (r.remindedAt ? formatDate(new Date(r.remindedAt)) : '—') },
  ];
  return (
    <div className="yx-growth-stack">
      <Segment label="Show" value={kind} onChange={setKind} options={[{ value: 'no_goals', label: `No goals (${gaps.noGoals.length})` }, { value: 'not_updated', label: `Not updated in ${gaps.days} days (${gaps.notUpdated.length})` }]} />
      {failed && <InlineAlert tone="danger" title="Not sent">{failed}</InlineAlert>}
      <DataTable
        label={kind === 'no_goals' ? 'Team members with no goals' : 'Team members whose goals were not updated'}
        columns={columns}
        rows={rows}
        getRowId={(r) => r.employeeId}
        empty={<EmptyState compact title={kind === 'no_goals' ? 'Everyone in your team has goals.' : `Everyone updated their goals in the last ${gaps.days} days.`} />}
        rowButtons={(r) => (
          <Button size="sm" loading={busy === r.employeeId} disabled={!r.canRemind} onClick={() => void remind(r)}>
            {r.canRemind ? 'Remind' : 'Reminded today'}
          </Button>
        )}
      />
    </div>
  );
}
