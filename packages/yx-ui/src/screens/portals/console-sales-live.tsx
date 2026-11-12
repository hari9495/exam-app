// YX-13 Sales-assist queue, live (YukthiX console C-8, answer 1210): the designed SalesAssistScreen with the API's data.
// Talk to us requests from nudge cards, with the size band (counts only), set-up share, owner, reply-by time and outcome.
// No private discounts: the published price stays the price.
import { useState } from 'react';
import { Button } from '../../components/button';
import { DescriptionList } from '../../components/shell';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField, useTooEarly } from '../../components/field';
import { TextArea } from '../../components/inputs';
import { Segment } from '../../components/segment';
import { Drawer } from '../../components/drawer';
import { useToast } from '../../components/notify';
import { formatDate } from '../../lib/format';
import { timeOf } from '../../lib/dates';
import { ConsolePage } from '../console/console-kit';
import type { LoadState } from '../console/types';
import { FilteredTable, opts } from './list-kit';

export type SalesOutcome = 'open' | 'demo_booked' | 'converted' | 'lost';
export interface SalesLiveRow {
  id: string;
  ref: string;
  company: string;
  band: string;
  why: string;
  setupPct: number | null;
  owner: string | null;
  mine: boolean;
  dueAt: string;
  status: SalesOutcome;
  requestedBy: string;
  phone: string;
  note: string | null;
  outcomeNote: string | null;
  createdAt: string;
  version: number;
}
export interface LiveSales {
  state: LoadState;
  onRetry: () => void;
  now: Date;
  rows: SalesLiveRow[];
  onTake: (id: string) => Promise<unknown>;
  onOutcome: (id: string, status: SalesOutcome, note: string | undefined, version: number) => Promise<unknown>;
  /** Stories: open this request. */
  defaultOpen?: string;
}

const OUTCOME: Record<SalesOutcome, string> = { open: 'Open', demo_booked: 'Demo booked', converted: 'Converted', lost: 'Lost' };
const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'That did not go through. Try again.');
const when = (iso: string) => `${formatDate(new Date(iso))}, ${timeOf(new Date(iso))}`;

export function LiveSalesScreen({ live }: { live: LiveSales }) {
  const [openId, setOpenId] = useState<string | null>(live.defaultOpen ?? null);
  const [taking, setTaking] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const { toast } = useToast();
  const current = live.rows.find((r) => r.id === openId);
  const sla = (r: SalesLiveRow) => (r.status !== 'open' ? 'Met' : new Date(r.dueAt) < live.now ? 'Breached' : `Due ${when(r.dueAt)}`);
  const take = async (id: string) => {
    setTaking(id);
    setFailed(null);
    try {
      await live.onTake(id);
      toast({ tone: 'success', title: 'Taken: you reply to this one' });
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setTaking(null);
    }
  };
  return (
    <ConsolePage
      crumb="Sales assist"
      title="Sales assist"
      description="Talk to us requests from companies, with their size and how far set-up is. Take one, call back before it is due, and record the outcome. No private discounts."
      state={live.state}
      onRetry={live.onRetry}
      what="the sales-assist queue"
    >
      <div className="yx-ps-stack">
        {failed && <InlineAlert tone="danger" title={failed} />}
        <FilteredTable
          label="Sales-assist queue"
          rows={live.rows}
          getRowId={(r) => r.id}
          searchText={(r) => `${r.ref} ${r.company}`}
          fields={[{ key: 'outcome', label: 'Outcome', type: 'multi', options: opts(['Open', 'Demo booked', 'Converted', 'Lost']) }]}
          columns={[
            { key: 'tenant', header: 'Company', value: (r) => r.company, width: 220 },
            { key: 'band', header: 'Size band', value: (r) => r.band, width: 120 },
            { key: 'trigger', header: 'Why', value: (r) => r.why, width: 260 },
            { key: 'setup', header: 'Set-up %', type: 'number', value: (r) => r.setupPct ?? 0, render: (r) => (r.setupPct === null ? '—' : `${r.setupPct}%`), width: 100 },
            { key: 'owner', header: 'Owner', value: (r) => (r.owner ? (r.mine ? 'You' : r.owner) : 'Unassigned'), width: 140 },
            { key: 'sla', header: 'Reply', type: 'status', value: (r) => sla(r), statusTone: (v) => (v === 'Breached' ? 'danger' : v === 'Met' ? 'success' : 'warning'), width: 170 },
            { key: 'outcome', header: 'Outcome', value: (r) => OUTCOME[r.status], width: 120 },
          ]}
          rowButtons={(r) =>
            r.owner ? (
              <Button size="sm" onClick={() => setOpenId(r.id)}>
                Open
              </Button>
            ) : (
              <Button size="sm" loading={taking === r.id} onClick={() => void take(r.id)}>
                Take
              </Button>
            )
          }
          empty={<EmptyState title="No requests waiting." />}
        />
      </div>
      {current && <RequestDrawer key={current.id + current.version} live={live} row={current} onClose={() => setOpenId(null)} />}
    </ConsolePage>
  );
}

function RequestDrawer({ live, row, onClose }: { live: LiveSales; row: SalesLiveRow; onClose: () => void }) {
  const [status, setStatus] = useState<SalesOutcome>(row.status);
  const [note, setNote] = useState(row.outcomeNote ?? '');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const { toast } = useToast();
  const early = useTooEarly(status === 'lost' && !note.trim() ? [{ fieldId: 'sa-note', message: 'Say why it was lost.' }] : []);
  const save = async () => {
    if (early.stop()) return;
    setBusy(true);
    setFailed(null);
    try {
      await live.onOutcome(row.id, status, note.trim() || undefined, row.version);
      toast({ tone: 'success', title: 'Outcome saved' });
      onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${row.ref} · ${row.company}`}
      subtitle={`${row.band} employees · asked ${when(row.createdAt)} · reply by ${when(row.dueAt)}`}
      notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined}
      footer={
        row.mine ? (
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Save outcome
          </Button>
        ) : (
          <span className="yx-ps-muted">{row.owner} owns this request; only the owner records the outcome.</span>
        )
      }
    >
      <div className="yx-ps-stack">
        <DescriptionList
          items={[
            { label: 'Why', value: row.why },
            { label: 'Asked by', value: row.requestedBy },
            { label: 'Phone', value: `+91 ${row.phone}` },
            { label: 'Their note', value: row.note ?? '—' },
            { label: 'Set-up', value: row.setupPct === null ? '—' : `${row.setupPct}% of the set-up hub's checks done` },
          ]}
        />
        {row.mine && (
          <>
            <FormField label="Outcome">
              <Segment label="Outcome" options={(Object.keys(OUTCOME) as SalesOutcome[]).map((k) => ({ value: k, label: OUTCOME[k] }))} value={status} onChange={setStatus} />
            </FormField>
            <FormField id="sa-note" label="Note" required={status === 'lost'} helper="Needed when it is lost." error={early.errorOf('sa-note')}>
              <TextArea rows={3} value={note} onChange={setNote} maxLength={500} />
            </FormField>
          </>
        )}
      </div>
    </Drawer>
  );
}
