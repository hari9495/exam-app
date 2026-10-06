import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { Badge } from '../../components/display';
import { Breadcrumbs, PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { dateLabel } from '../org/org-kit';
import type { AccessLog, LoadState } from './types';

// Me › Who accessed my data (PPL-33; P02 §7, YX-SEC-09, P08): every look at the person's Confidential and
// Special data by someone else. The company may hide this list from employees; the looks are recorded anyway.

export interface AccessLogScreenProps {
  state: LoadState;
  onRetry?: () => void;
  log: AccessLog | null;
}

type Entry = AccessLog['entries'][number];
const time = (iso: string) => new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso));

export function AccessLogScreen({ state, onRetry, log }: AccessLogScreenProps) {
  const columns: TableColumn<Entry>[] = [
    { key: 'who', header: 'Who', type: 'person', value: (e) => e.who, person: (e) => ({ name: e.who }), width: 240, hideable: false },
    {
      key: 'what',
      header: 'What they saw',
      value: (e) => e.what,
      render: (e) => (
        <span className="yx-ppl2__row">
          {e.what}
          <Badge tone={e.className === 'special' ? 'danger' : 'warning'}>{e.className === 'special' ? 'Special' : 'Confidential'}</Badge>
        </span>
      ),
      width: 260,
    },
    { key: 'when', header: 'When', value: (e) => e.at, render: (e) => `${dateLabel(e.at.slice(0, 10))}, ${time(e.at)}`, width: 200 },
  ];
  return (
    <div className="yx-auth__page">
      <PageHeader breadcrumbs={<Breadcrumbs items={[{ label: 'Me' }, { label: 'Who accessed my data' }]} />} title="Who accessed my data" description="Every time someone else looked at your pay, identity or bank details." />
      {state === 'loading' && <Skeleton height={200} />}
      {state === 'error' && <ErrorState title="We couldn't load this list." description="Check your connection and try again." onRetry={onRetry} />}
      {state === 'no-access' && <NoAccessState grantedBy="HR" what="this list" />}
      {state === 'ready' && log && !log.enabled && (
        <InlineAlert tone="info" title="Your company has turned this view off">
          Every look at your Confidential and Special data is still recorded. If the view is turned back on, you will see the full history.
        </InlineAlert>
      )}
      {state === 'ready' && log?.enabled && (
        <DataTable
          label="Who accessed my data"
          columns={columns}
          rows={log.entries}
          getRowId={(e) => e.id}
          rowNoun={['look', 'looks']}
          cardSummary
          empty={<EmptyState compact title="No one else has looked at your sensitive data." description="Looks by HR, payroll or your manager appear here." />}
        />
      )}
    </div>
  );
}
