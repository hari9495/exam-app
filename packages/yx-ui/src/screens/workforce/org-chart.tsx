import { useMemo } from 'react';
import { Download } from 'lucide-react';
import { Button } from '../../components/button';
import { DatePicker } from '../../components/date';
import { ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { OrgChart, type OrgPerson } from '../../components/orgchart';
import { Breadcrumbs, PageHeader } from '../../components/shell';
import { dayKey } from '../../lib/dates';
import { dateLabel } from '../org/org-kit';
import { csvText, downloadText, refName } from './workforce-kit';
import type { LoadState, OrgChartData } from './types';

// People › Org chart (PPL-02; M01 §3.2, Q5): reporting lines from the assignments in force, dotted lines
// drawn dashed (visibility only, never approvals, YX-EMP-04). HR may look at any date (P06 §4.7); everyone
// else sees today. Public fields only (P02 Q4).

export interface OrgChartScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: OrgChartData | null;
  today: string;
  /** HR: "View as on" a date. */
  onAsOf?: (date: string) => void;
  /** The signed-in person's record: the chart opens on them. */
  meId?: string | null;
  companyName: string;
  /** Opens a person's job history (HR). */
  onOpenPerson?: (id: string) => void;
}

export function OrgChartScreen({ state, onRetry, data, today, onAsOf, meId, companyName, onOpenPerson }: OrgChartScreenProps) {
  const people: OrgPerson[] = useMemo(
    () =>
      (data?.nodes ?? []).map((n) => ({
        id: n.id,
        name: n.name,
        role: refName(n.designation),
        department: refName(n.department),
        managerId: n.managerId,
        dottedManagerId: n.dottedLineManagerIds[0],
      })),
    [data],
  );
  const byId = useMemo(() => new Map((data?.nodes ?? []).map((n) => [n.id, n])), [data]);
  const asOf = data?.asOf ?? today;
  const exportCsv = () => {
    const rows = (data?.nodes ?? []).map((n) => [n.name, refName(n.designation), refName(n.department), refName(n.location), n.managerId ? byId.get(n.managerId)?.name : '', n.dottedLineManagerIds.map((d) => byId.get(d)?.name ?? '').join('; ')]);
    downloadText(`org-chart-${asOf}.csv`, csvText([['Name', 'Designation', 'Department', 'Location', 'Manager', 'Dotted-line managers'], ...rows]));
  };
  return (
    <div className="yx-auth__page">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: 'People' }, { label: 'Org chart' }]} />}
        title="Org chart"
        description="Reporting lines from each person's current job. Dashed lines are dotted-line managers: they see the person but do not approve their requests."
        actions={
          state === 'ready' ? (
            <div className="yx-ppl2__row">
              {onAsOf && <DatePicker aria-label="View as on" value={new Date(`${asOf}T00:00:00`)} onChange={(d) => d && onAsOf(dayKey(d))} />}
              <Button icon={Download} onClick={exportCsv} disabled={!data?.nodes.length}>
                Export CSV
              </Button>
            </div>
          ) : undefined
        }
      />
      {state === 'loading' && <Skeleton height={320} />}
      {state === 'error' && <ErrorState title="We couldn't load the org chart." description="Check your connection and try again." onRetry={onRetry} />}
      {state === 'no-access' && <NoAccessState grantedBy="HR" what="the org chart" />}
      {state === 'ready' && data && (
        <>
          {asOf !== today && onAsOf && (
            <InlineAlert tone="info" title={`${asOf < today ? 'As it was' : 'As it will be'} on ${dateLabel(asOf)}`} actions={<Button size="sm" onClick={() => onAsOf(today)}>Back to today</Button>}>
              {asOf < today ? 'People who joined later are not shown; titles are as they were then.' : 'Approved changes up to that date are included.'}
            </InlineAlert>
          )}
          {data.truncated && <InlineAlert tone="warning" title="Only the first 5,000 people are shown.">Use the directory to find anyone else.</InlineAlert>}
          <OrgChart
            people={people}
            views={['reporting', 'department']}
            rootLabel={companyName}
            meId={meId ?? undefined}
            openOnMe={Boolean(meId) && !onOpenPerson}
            onOpenPerson={onOpenPerson ? (p) => onOpenPerson(p.id) : undefined}
          />
        </>
      )}
    </div>
  );
}
