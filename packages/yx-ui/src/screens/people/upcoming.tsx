// PPL-49 Retirements and contract ends (designed 20 Oct 2026 in the PPL-19 style; LIFE-5.06, YX-LC-19 / 20): who retires
// in the next year and whose fixed-term contract ends in 90 days. The company policy opens their exits; HR extends or
// converts a contract instead.
import { useState } from 'react';
import { CalendarClock, Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, ErrorState } from '../../components/feedback';
import { PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { Segment } from '../../components/segment';
import { formatDate } from '../../lib/format';
import { daysBetween } from './people-logic';
import { ListSkeleton, PeopleFrame } from './people-kit';
import type { UpcomingExit } from './live/types';

export interface UpcomingExitsProps {
  rows: UpcomingExit[];
  today: Date;
  state?: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  /** employee.change.manage: set, extend or convert a contract. Stories leave them out. */
  onSet?: () => void;
  onExtend?: (employeeId: string) => void;
  onConvert?: (employeeId: string) => void;
}

type Show = 'all' | 'retirement' | 'contract_end';

// PPL-49
export function UpcomingExits({ rows, today, state = 'ready', onRetry, onSet, onExtend, onConvert }: UpcomingExitsProps) {
  const [show, setShow] = useState<Show>('all');
  const shown = rows.filter((r) => show === 'all' || r.kind === show);
  const count = (k: Show) => rows.filter((r) => k === 'all' || r.kind === k).length;
  const cols: TableColumn<UpcomingExit>[] = [
    { key: 'name', header: 'Person', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name }), width: 260 },
    { key: 'kind', header: 'What', value: (r) => r.kind, render: (r) => <Badge tone={r.kind === 'retirement' ? 'info' : 'warning'}>{r.kind === 'retirement' ? 'Retires' : 'Contract ends'}</Badge>, width: 160 },
    {
      key: 'on',
      header: 'On',
      type: 'date',
      value: (r) => new Date(`${r.on}T00:00:00`),
      render: (r) => {
        const on = new Date(`${r.on}T00:00:00`);
        const n = daysBetween(today, on);
        return (
          <span className="yx-ppl__row yx-ppl__row--tight">
            {formatDate(on)}
            <Badge tone={n <= 30 ? 'warning' : 'neutral'}>{n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`}</Badge>
          </span>
        );
      },
      width: 200,
    },
  ];
  return (
    <PeopleFrame active="Retirements and contracts">
      <PageHeader
        title="Retirements and contract ends"
        description="Retirements in the next year and fixed-term contracts ending in 90 days. The company policy opens their exits; extend or convert a contract instead."
        actions={onSet ? <Button variant="primary" icon={Plus} onClick={onSet}>Set a contract end</Button> : undefined}
      />
      {state === 'error' ? (
        <ErrorState title="We couldn't load the coming exits" description="Check your connection and try again." onRetry={onRetry} />
      ) : state === 'loading' ? (
        <ListSkeleton label="Loading the coming exits" />
      ) : (
        <>
          <Segment
            label="Show"
            value={show}
            onChange={setShow}
            options={[
              { value: 'all', label: `Everyone (${count('all')})` },
              { value: 'retirement', label: `Retirements (${count('retirement')})` },
              { value: 'contract_end', label: `Contract ends (${count('contract_end')})` },
            ]}
          />
          <DataTable
            label="Retirements and contract ends"
            columns={cols}
            rows={shown}
            getRowId={(r) => `${r.employeeId}-${r.kind}`}
            defaultSort={{ key: 'on', dir: 'asc' }}
            rowButtons={(r) =>
              r.kind === 'contract_end' && (onExtend || onConvert) ? (
                <>
                  {onExtend && (
                    <Button size="sm" icon={CalendarClock} onClick={() => onExtend(r.employeeId)}>
                      Extend
                    </Button>
                  )}
                  {onConvert && (
                    <Button size="sm" onClick={() => onConvert(r.employeeId)}>
                      Make permanent
                    </Button>
                  )}
                </>
              ) : null
            }
            empty={<EmptyState title="Nothing in the coming months" description="Retirements show a year ahead and contract ends 90 days ahead." />}
          />
        </>
      )}
    </PeopleFrame>
  );
}
