import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { EmptyState } from '../../components/feedback';
import { Text } from '../../components/foundations';
import { Segment } from '../../components/segment';
import { DataTable, type TableColumn } from '../../components/table';
import { ConsolePage, actionWords, when } from './console-kit';
import type { LoadState, PlatformAuditEntry } from './types';

export interface PlatformAuditScreenProps {
  state: LoadState;
  onRetry?: () => void;
  entries: PlatformAuditEntry[];
  /** Also show the console's own looks across companies. */
  includeReads: boolean;
  onIncludeReadsChange: (v: boolean) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

/** Console › Audit log (P14 YX-CONSOLE-02, P12 YX-SECOPS-08): every staff action, with the reason, reviewed monthly. */
export function PlatformAuditScreen(props: PlatformAuditScreenProps) {
  const columns: TableColumn<PlatformAuditEntry>[] = [
    { key: 'at', header: 'When', value: (e) => e.at, render: (e) => when(e.at), width: 190, hideable: false },
    {
      key: 'who',
      header: 'Who',
      value: (e) => e.actor,
      render: (e) => (
        <span className="yx-console__who">
          {e.actor}
          {e.actorIsStaff && <Badge tone="info">YukthiX</Badge>}
        </span>
      ),
      width: 220,
    },
    {
      key: 'what',
      header: 'What',
      value: (e) => e.action,
      render: (e) => (
        <span className="yx-auth__item-main">
          <Text>{actionWords(e.action, e.details)}</Text>
          {typeof e.details?.reason === 'string' && <Text tone="secondary" size="sm">“{e.details.reason}”</Text>}
        </span>
      ),
      width: 360,
    },
    { key: 'company', header: 'Company', value: (e) => e.company ?? 'YukthiX', width: 200, optional: true },
  ];
  return (
    <ConsolePage crumb="Audit log" title="Audit log" description="Everything YukthiX staff did: companies, prices, shared accounts and support sessions. Reviewed every month." state={props.state} onRetry={props.onRetry} what="the audit log">
      <DataTable
        label="Audit log"
        columns={columns}
        rows={props.entries}
        getRowId={(e) => e.id}
        rowNoun={['entry', 'entries']}
        cardSummary
        toolbar={
          <Segment
            label="Show"
            options={[
              { value: 'changes', label: 'Actions' },
              { value: 'all', label: 'Actions and looks' },
            ]}
            value={props.includeReads ? 'all' : 'changes'}
            onChange={(v) => props.onIncludeReadsChange(v === 'all')}
          />
        }
        empty={<EmptyState compact title="Nothing recorded yet." />}
      />
      {props.hasMore && (
        <div>
          <Button loading={props.loadingMore} onClick={props.onLoadMore}>
            Show older entries
          </Button>
        </div>
      )}
    </ConsolePage>
  );
}
