import { useState } from 'react';
import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { EmptyState, ErrorState, NoAccessState, Skeleton } from '../../components/feedback';
import { Text } from '../../components/foundations';
import { Breadcrumbs, PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { ChangeDrawer, STATUS_LABEL, WhenBadge } from '../history/history-kit';
import type { ChangeInput, ChangeOptions, Impact } from '../history/types';
import { dateLabel } from '../org/org-kit';
import { RELATION_LABEL, refName } from './workforce-kit';
import type { LoadState, TeamMember } from './types';

// People › My team (PPL-08; M01 §3.10; P02 Q2, Q5): the signed-in manager's whole reporting subtree and their
// dotted-line reports, with joining dates and probation ends (Internal fields a manager may see). Never pay or
// Personal fields. With request.raise_on_behalf the manager raises job changes for the team; HR approves them
// (YX-SEC-27).

export interface TeamScreenProps {
  state: LoadState;
  onRetry?: () => void;
  members: TeamMember[];
  today: string;
  onOpenHistory: (id: string) => void;
  /** request.raise_on_behalf: raise promotions, transfers and manager changes for the team. */
  raise?: { options: ChangeOptions; onPreview: (input: ChangeInput) => Promise<Impact>; onSubmit: (input: ChangeInput) => Promise<void> };
}

export function TeamScreen({ state, onRetry, members, today, onOpenHistory, raise }: TeamScreenProps) {
  const [raisingFor, setRaisingFor] = useState<string | null | undefined>(undefined);
  const columns: TableColumn<TeamMember>[] = [
    { key: 'name', header: 'Member', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: refName(r.designation) }), width: 250, hideable: false },
    {
      key: 'relation',
      header: 'Reporting',
      value: (r) => r.relation,
      render: (r) => (
        <span className="yx-auth__item-main">
          <Text>{RELATION_LABEL[r.relation]}</Text>
          {r.relation === 'indirect' && <Text tone="secondary" size="sm">{`Through ${refName(r.manager)}`}</Text>}
        </span>
      ),
      width: 180,
    },
    {
      key: 'status',
      header: 'Status',
      value: (r) => r.probationEndsOn ?? r.status ?? '',
      render: (r) =>
        r.status === 'probation' && r.probationEndsOn ? (
          <span className="yx-auth__item-main">
            <Text>{`Probation ends ${dateLabel(r.probationEndsOn)}`}</Text>
            <WhenBadge date={r.probationEndsOn} today={today} />
          </span>
        ) : (
          <Badge tone="neutral">{r.status ? STATUS_LABEL[r.status] : '—'}</Badge>
        ),
      width: 210,
    },
    { key: 'department', header: 'Department', value: (r) => refName(r.department), width: 150, optional: true },
    { key: 'location', header: 'Location', value: (r) => refName(r.location), width: 140, optional: true },
    { key: 'joined', header: 'Joined', value: (r) => r.joinedOn, render: (r) => dateLabel(r.joinedOn), width: 120, optional: true },
  ];
  const canRaiseFor = (r: TeamMember) => Boolean(raise) && r.relation !== 'dotted';
  return (
    <div className="yx-auth__page">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: 'People' }, { label: 'My team' }]} />}
        title="My team"
        description="Everyone who reports to you, directly or through someone in your team, and people who have you as a dotted-line manager."
        actions={state === 'ready' && raise && members.some(canRaiseFor) ? <Button variant="primary" onClick={() => setRaisingFor(null)}>Raise a change</Button> : undefined}
      />
      {state === 'loading' && <Skeleton height={240} />}
      {state === 'error' && <ErrorState title="We couldn't load your team." description="Check your connection and try again." onRetry={onRetry} />}
      {state === 'no-access' && <NoAccessState grantedBy="HR" what="your team" />}
      {state === 'ready' && (
        <DataTable
          label="Team members"
          columns={columns}
          rows={members}
          getRowId={(r) => r.id}
          rowNoun={['person', 'people']}
          cardSummary
          empty={<EmptyState title="No one reports to you yet." description="When HR sets you as someone's manager, they appear here." />}
          rowButtons={(r) => (
            <>
              {r.relation !== 'dotted' && (
                <Button size="sm" onClick={() => onOpenHistory(r.id)}>
                  Job history
                </Button>
              )}
              {canRaiseFor(r) && (
                <Button size="sm" onClick={() => setRaisingFor(r.id)}>
                  Raise change
                </Button>
              )}
            </>
          )}
        />
      )}
      {raisingFor !== undefined && raise && (
        <ChangeDrawer options={raise.options} employeeId={raisingFor ?? undefined} onPreview={raise.onPreview} onSubmit={raise.onSubmit} onClose={() => setRaisingFor(undefined)} />
      )}
    </div>
  );
}
