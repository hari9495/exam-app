// VIS-06 · Emergency roll-call (Visitors slice 4, founder answer 612): everyone on site now at one location, visitors
// and employees together, as one printable list for reception, security and HR. Employees come from today's check-ins
// (the Time Today board's punches): the last check-in today was at this location. Takes `live`.
import { Printer, RefreshCw } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Select } from '../../components/select';
import { DataTable } from '../../components/table';
import { Card, PageHeader } from '../../components/shell';
import { LivePage } from '../time/live/kit';
import { useRun } from '../org/org-kit';
import { OpsDesk } from './ops-kit';

export interface RollCallVisitor {
  id: string;
  name: string;
  company: string | null;
  host: string;
  badge: string | null;
  inAt: string | null;
  minorAdult: string | null;
}
export interface RollCallEmployee {
  id: string;
  name: string;
  code: string | null;
  inAt: string;
}
export interface RollCallData {
  location: { id: string; name: string };
  locations: { value: string; label: string }[];
  at: string;
  visitors: RollCallVisitor[];
  employees: RollCallEmployee[];
}

export interface LiveRollCall {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry: () => void;
  data: RollCallData | null;
  onLocation: (id: string) => void;
  /** Downloads the A4 roll-call PDF for the browser to print. */
  onPrint: () => Promise<unknown>;
}

export const ROLLCALL_SAMPLE: RollCallData = {
  location: { id: 'maa', name: 'Chennai office' },
  locations: [
    { value: 'maa', label: 'Chennai office' },
    { value: 'hsr', label: 'Hosur plant' },
  ],
  at: '2026-09-29T05:40:00Z',
  visitors: [
    { id: 'v3', name: 'Suresh Babu', company: 'CoolAir Services', host: 'Farhan Qureshi', badge: 'V-0411', inAt: '2026-09-29T03:11:00Z', minorAdult: null },
    { id: 'v2', name: 'Asha Kurian', company: null, host: 'Neha Joshi', badge: 'V-0412', inAt: '2026-09-29T03:54:00Z', minorAdult: null },
  ],
  employees: [
    { id: 'e1', name: 'Divya Raghunathan', code: 'KF-0142', inAt: '2026-09-29T03:20:00Z' },
    { id: 'e2', name: 'Farhan Qureshi', code: 'KF-0087', inAt: '2026-09-29T03:02:00Z' },
    { id: 'e3', name: 'Neha Joshi', code: 'KF-0031', inAt: '2026-09-29T03:41:00Z' },
  ],
};

const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) : '—');

export function RollCallScreen({ data: sample, state = 'ready', live }: { data: RollCallData; state?: 'ready' | 'loading' | 'empty'; live?: LiveRollCall }) {
  const data = live ? live.data : state === 'empty' ? { ...sample, visitors: [], employees: [] } : sample;
  const { busy, error, run } = useRun();
  const loading = live ? live.state === 'loading' : state === 'loading';
  const actions = (
    <>
      {data && data.locations.length > 1 && (
        <FormField label="Location" hideLabel>
          <Select aria-label="Location" value={data.location.id} onChange={(v) => v && live?.onLocation(v)} options={data.locations} />
        </FormField>
      )}
      {live && (
        <Button icon={RefreshCw} onClick={live.onRetry}>
          Refresh
        </Button>
      )}
      <Button variant="primary" icon={Printer} loading={busy === 'print'} onClick={() => live && void run('print', live.onPrint)}>
        Print roll-call
      </Button>
    </>
  );
  const facts = data ? `${data.visitors.length} visitors · ${data.employees.length} employees · as of ${time(data.at)}` : '';
  const body = (
    <>
      {error && <InlineAlert tone="danger" title="Not printed">{error}</InlineAlert>}
      <Card title="Visitors on site">
        <DataTable
          label="Visitors on site"
          columns={[
            { key: 'name', header: 'Visitor', value: (v: RollCallVisitor) => v.name, render: (v) => (v.minorAdult ? <span>{v.name} <Badge tone="warning">Under 18, with {v.minorAdult}</Badge></span> : v.name) },
            { key: 'company', header: 'Company', value: (v) => v.company ?? '—' },
            { key: 'host', header: 'Host', value: (v) => v.host },
            { key: 'badge', header: 'Badge', type: 'id', value: (v) => v.badge ?? '—' },
            { key: 'in', header: 'In', value: (v) => v.inAt, render: (v) => time(v.inAt) },
          ]}
          rows={data?.visitors ?? []}
          getRowId={(v) => v.id}
          state={loading ? 'loading' : 'ready'}
          onRetry={() => {}}
          empty={<EmptyState compact title="No visitors on site." />}
        />
      </Card>
      <Card title="Employees on site">
        <DataTable
          label="Employees on site"
          columns={[
            { key: 'name', header: 'Employee', value: (e: RollCallEmployee) => e.name },
            { key: 'code', header: 'Employee code', type: 'id', value: (e) => e.code ?? '—' },
            { key: 'in', header: 'Checked in', value: (e) => e.inAt, render: (e) => time(e.inAt) },
          ]}
          rows={data?.employees ?? []}
          getRowId={(e) => e.id}
          state={loading ? 'loading' : 'ready'}
          onRetry={() => {}}
          empty={<EmptyState compact title="No employees checked in here today." />}
        />
      </Card>
      <p className="yx-ops-muted">Employees are listed when their last check-in today was at this location. People who did not check in are not on the list: count them at the assembly point.</p>
    </>
  );
  const title = 'Roll-call';
  const description = `${data?.location.name ? `${data.location.name}: everyone` : 'Everyone'} on site now, visitors and employees, for an evacuation. Print it and tick each person at the assembly point.`;
  if (live)
    return (
      <LivePage title={title} description={description} actions={actions} state={live.state} onRetry={live.onRetry} what="the roll-call" grantedBy="an admin (the Reception, Security, HR admin or Facility admin role)">
        <p className="yx-ops-muted">{facts}</p>
        {body}
      </LivePage>
    );
  return (
    <OpsDesk area="visitors" active="Roll-call">
      <PageHeader title={title} description={description} facts={facts} actions={actions} />
      {body}
    </OpsDesk>
  );
}
