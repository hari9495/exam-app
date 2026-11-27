// T2-D 60 (answer 2871): Projects › Reports, two hours reports. Hours by person (week by week, billable and not, per
// project) and hours by task (budget, booked, approved), each filtered by project, client and dates, with CSV export.
// Project managers see their own projects; holders of the projects reporting key see all (the API decides).
import { Download } from 'lucide-react';
import { Button } from '../../components/button';
import { DatePicker } from '../../components/date';
import { EmptyState, ErrorState, NoAccessState, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { PageHeader } from '../../components/shell';
import { PlainTable } from '../../components/plain-table';
import { Text } from '../../components/foundations';
import { formatDate } from '../../lib/format';
import { ProjectsFrame } from './hiring-kit';
import { ProjectsOffState } from './projects';
import type { LiveLoad } from './projects-live';
import './hiring.css';

export type HoursReportKind = 'person' | 'task';
export interface HoursByPersonRow {
  person: string;
  project: string;
  week: string;
  billable: number;
  nonBillable: number;
  approved: number;
}
export interface HoursByTaskRow {
  project: string;
  task: string;
  budget: number | null;
  booked: number;
  approved: number;
}
/** GET /projects/reports/hours. */
export interface HoursReportData {
  kind: HoursReportKind;
  /** All projects (the reporting key) or only the ones I manage. */
  scope: 'all' | 'mine';
  rows: (HoursByPersonRow | HoursByTaskRow)[];
  projects: { id: string; label: string }[];
  clients: { id: string; name: string }[];
}
export interface HoursReportFilters {
  from: string;
  to: string;
  projectId: string | null;
  clientId: string | null;
}
export interface LiveHoursReports {
  state: LiveLoad;
  onRetry?: () => void;
  kind: HoursReportKind;
  onKind: (kind: HoursReportKind) => void;
  filters: HoursReportFilters;
  onFilters: (f: HoursReportFilters) => void;
  data: HoursReportData | null;
  onExport: () => Promise<void>;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const local = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
const hours = (n: number) => `${n.toLocaleString('en-IN')} h`;

/** PRJ-09 Hours reports (T2-D 60). */
export function HoursReportsScreen({ live }: { live: LiveHoursReports }) {
  const d = live.data;
  const f = live.filters;
  if (live.state === 'off')
    return (
      <ProjectsFrame active="Reports">
        <ProjectsOffState />
      </ProjectsFrame>
    );
  if (live.state === 'no-access')
    return (
      <ProjectsFrame active="Reports">
        <PageHeader title="Hours reports" />
        <NoAccessState what="the hours reports" grantedBy="your System Admin" note="Project managers see the hours of their own projects." />
      </ProjectsFrame>
    );
  return (
    <ProjectsFrame active="Reports">
      <PageHeader
        title="Hours reports"
        description={d?.scope === 'mine' ? 'The hours of the projects you manage, from sent and approved weeks.' : 'The hours of every project, from sent and approved weeks.'}
        actions={
          <Button icon={Download} disabled={!d?.rows.length} onClick={() => void live.onExport()}>
            Download CSV
          </Button>
        }
      />
      <div className="yx-hire-stack">
        <Segment label="Report" value={live.kind} onChange={live.onKind} options={[{ value: 'person', label: 'Hours by person' }, { value: 'task', label: 'Hours by task' }]} />
        <div className="yx-hire-filters">
          <FormField id="hr-project" label="Project">
            <Select value={f.projectId} clearable placeholder="All projects" onChange={(projectId) => live.onFilters({ ...f, projectId })} options={(d?.projects ?? []).map((p) => ({ value: p.id, label: p.label }))} />
          </FormField>
          <FormField id="hr-client" label="Client">
            <Select value={f.clientId} clearable placeholder="All clients" onChange={(clientId) => live.onFilters({ ...f, clientId })} options={(d?.clients ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          </FormField>
          <FormField id="hr-from" label="Weeks from">
            <DatePicker value={local(f.from)} onChange={(v) => v && live.onFilters({ ...f, from: iso(v) })} max={local(f.to)} />
          </FormField>
          <FormField id="hr-to" label="Weeks to">
            <DatePicker value={local(f.to)} onChange={(v) => v && live.onFilters({ ...f, to: iso(v) })} min={local(f.from)} />
          </FormField>
        </div>
        {live.state === 'error' ? (
          <ErrorState title="We couldn't load the report." onRetry={live.onRetry} />
        ) : live.state === 'loading' || !d ? (
          <Skeleton height={240} />
        ) : d.rows.length === 0 ? (
          <EmptyState title="No hours for these filters." description="Hours show once a week is sent. Try other dates or another project." />
        ) : d.kind === 'person' ? (
          <PlainTable<HoursByPersonRow>
            label="Hours by person"
            rows={d.rows as HoursByPersonRow[]}
            getRowId={(r) => `${r.person}|${r.project}|${r.week}`}
            columns={[
              { key: 'person', header: 'Person', cell: (r) => r.person, rowHeader: true },
              { key: 'project', header: 'Project', cell: (r) => r.project },
              { key: 'week', header: 'Week of', cell: (r) => formatDate(local(r.week)) },
              { key: 'billable', header: 'Billable', cell: (r) => hours(r.billable), num: true },
              { key: 'nonBillable', header: 'Non-billable', cell: (r) => hours(r.nonBillable), num: true },
              { key: 'approved', header: 'Approved', cell: (r) => hours(r.approved), num: true },
            ]}
          />
        ) : (
          <PlainTable<HoursByTaskRow>
            label="Hours by task"
            rows={d.rows as HoursByTaskRow[]}
            getRowId={(r) => `${r.project}|${r.task}`}
            columns={[
              { key: 'project', header: 'Project', cell: (r) => r.project, rowHeader: true },
              { key: 'task', header: 'Task', cell: (r) => r.task },
              { key: 'budget', header: 'Budget', cell: (r) => (r.budget == null ? <Text tone="muted">No budget</Text> : hours(r.budget)), num: true },
              { key: 'booked', header: 'Booked', cell: (r) => hours(r.booked), num: true },
              { key: 'approved', header: 'Approved', cell: (r) => hours(r.approved), num: true },
            ]}
          />
        )}
      </div>
    </ProjectsFrame>
  );
}
