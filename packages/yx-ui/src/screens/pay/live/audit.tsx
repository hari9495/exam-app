import { useEffect, useState } from 'react';
import { Button } from '../../../components/button';
import { Badge } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert, Skeleton } from '../../../components/feedback';
import { FormField } from '../../../components/field';
import { TextField } from '../../../components/inputs';
import { Card } from '../../../components/shell';
import { useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import type { AuditEntry, AuditFilters, AuditPage, ChainStatus, LoadState } from './types';

// Audit log and record timeline (P08 Part B, PAY-1.05 … 1.07): business events in scope with Confidential values
// masked, a record's timeline, the daily chain check (and "Check now"), and the export, which is itself recorded.

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
/** "payroll.period.reopened" → "Payroll period reopened" */
export const actionText = (a: string) => {
  const s = a.replace(/[._]/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
function Details({ value }: { value: unknown }) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return <>{String(value)}</>;
  return (
    <dl className="yx-pay-impact">
      {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface AuditScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: AuditPage | null;
  chain: ChainStatus | null;
  filters: AuditFilters;
  onFilters: (f: AuditFilters) => void;
  onMore?: () => void;
  canExport: boolean;
  onExport: () => Promise<unknown>;
  onVerify: () => Promise<unknown>;
  onTimeline: (entityType: string, entityId: string) => Promise<AuditEntry[]>;
}

export function AuditScreen(p: AuditScreenProps) {
  const [draft, setDraft] = useState<AuditFilters>(p.filters);
  const [open, setOpen] = useState<AuditEntry | null>(null);
  const [record, setRecord] = useState<{ type: string; id: string } | null>(null);
  const { busy, error, run } = useRun();
  const last = p.chain?.checks[0];
  return (
    <LivePage
      title="Audit log"
      description="Who did what, and when. Rows can't be changed or removed; a daily check proves it. Pay and identity values are hidden unless you may see them."
      state={p.state}
      onRetry={p.onRetry}
      what="the audit log"
      grantedBy="your System Admin"
      actions={
        p.canExport ? (
          <Button size="sm" loading={busy === 'export'} onClick={() => void run('export', p.onExport)}>
            Export (recorded)
          </Button>
        ) : undefined
      }
    >
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      <Card
        title="Chain check"
        actions={
          p.chain?.canVerify ? (
            <Button size="sm" loading={busy === 'verify'} onClick={() => void run('verify', p.onVerify)}>
              Check now
            </Button>
          ) : undefined
        }
      >
        {last ? (
          <p>
            {last.result === 'ok' ? <Badge tone="success">Chain OK</Badge> : <Badge tone="danger">Chain broken</Badge>}{' '}
            <span className="yx-tim-note">
              Last checked {when(last.at)} · {last.rows} rows up to row {last.lastSeq}
              {last.problem ? ` · ${last.problem}` : ''}
            </span>
          </p>
        ) : (
          <p className="yx-tim-muted">Not checked yet. The check runs every day.</p>
        )}
      </Card>
      <Card title="Find">
        <form
          className="yx-tim-row"
          onSubmit={(e) => {
            e.preventDefault();
            p.onFilters(draft);
          }}
        >
          <FormField label="What happened (starts with)">
            <TextField value={draft.action ?? ''} onChange={(v) => setDraft({ ...draft, action: v || undefined })} placeholder="payroll.period" />
          </FormField>
          <FormField label="Record type">
            <TextField value={draft.entityType ?? ''} onChange={(v) => setDraft({ ...draft, entityType: v || undefined })} placeholder="pay_period" />
          </FormField>
          <FormField label="From">
            <TextField type="date" value={draft.from ?? ''} onChange={(v) => setDraft({ ...draft, from: v || undefined })} />
          </FormField>
          <FormField label="To">
            <TextField type="date" value={draft.to ?? ''} onChange={(v) => setDraft({ ...draft, to: v || undefined })} />
          </FormField>
          <Button type="submit" variant="primary">
            Search
          </Button>
        </form>
      </Card>
      {p.data && (
        <Card title="Events">
          {p.data.entries.length ? (
            <table className="yx-tim-table" aria-label="Audit events">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">What happened</th>
                  <th scope="col">Record</th>
                  <th scope="col">
                    <span className="yx-visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.data.entries.map((e) => (
                  <tr key={e.id}>
                    <td className="yx-tim-note">{when(e.at)}</td>
                    <td>{e.actor}</td>
                    <th scope="row">{actionText(e.action)}</th>
                    <td className="yx-tim-note">{e.entityType}</td>
                    <td>
                      <div className="yx-tim-row">
                        <Button size="sm" onClick={() => setOpen(e)}>
                          Details
                        </Button>
                        {e.entityId && (
                          <Button size="sm" onClick={() => setRecord({ type: e.entityType, id: e.entityId! })}>
                            Record timeline
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState compact title="Nothing found" description="Try a wider date range or fewer filters." />
          )}
          {p.data.next && p.onMore && (
            <Button size="sm" onClick={p.onMore}>
              Show older
            </Button>
          )}
        </Card>
      )}
      {open && (
        <Drawer
          open
          onOpenChange={(o) => !o && setOpen(null)}
          title={actionText(open.action)}
          subtitle={`${when(open.at)} · ${open.actor}${open.seq ? ` · row ${open.seq}` : ''}`}
          footer={<Button onClick={() => setOpen(null)}>Close</Button>}
        >
          <Details value={open.details} />
        </Drawer>
      )}
      {record && <TimelineDrawer record={record} onClose={() => setRecord(null)} onTimeline={p.onTimeline} />}
    </LivePage>
  );
}

function TimelineDrawer({ record, onClose, onTimeline }: { record: { type: string; id: string }; onClose: () => void; onTimeline: AuditScreenProps['onTimeline'] }) {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const { busy, error, run } = useRun();
  useEffect(() => {
    void run('load', async () => setRows(await onTimeline(record.type, record.id)));
  }, [record.type, record.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title="Record timeline" subtitle={`${record.type} · business events only`} size="lg" footer={<Button onClick={onClose}>Close</Button>}>
      {busy && <Skeleton height={120} />}
      {error && (
        <InlineAlert tone="danger" title="Not loaded">
          {error}
        </InlineAlert>
      )}
      {rows && (
        <ol className="yx-tim-list" aria-label="Timeline">
          {rows.map((r) => (
            <li key={r.id}>
              <strong>{actionText(r.action)}</strong>{' '}
              <span className="yx-tim-note">
                {dateText(r.at.slice(0, 10))} · {r.actor}
              </span>
            </li>
          ))}
          {!rows.length && <li className="yx-tim-muted">No business events for this record.</li>}
        </ol>
      )}
    </Drawer>
  );
}
