// VIS-05 · Blocked-visitor watch-list (Visitors slice 3, founder answer 605). HR and Facility admins (the watch-list key
// for the whole company) add a person with a reason, review each entry once a review period or it lapses, and remove
// entries. Only they see the list and the reasons: reception, the host and the visitor see only that the visit can't
// go ahead. Takes `live` like the other visitor screens.
import { useState } from 'react';
import { RefreshCw, ShieldOff, Trash2 } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { Drawer } from '../../components/drawer';
import { FieldRow, FormField, useTooEarly } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { ConfirmDialog } from '../../components/overlay';
import { DataTable } from '../../components/table';
import { PageHeader } from '../../components/shell';
import { formatDate } from '../../lib/format';
import { LivePage } from '../time/live/kit';
import { useRun } from '../org/org-kit';
import { OpsDesk, useSay } from './ops-kit';

/** One entry as GET visitors/watchlist sends it. */
export interface WatchEntry {
  id: string;
  name: string;
  mobile: string | null;
  reason: string;
  addedBy: string;
  addedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  /** The entry lapses (and is deleted) on this day unless reviewed again. */
  reviewBy: string;
}

export interface WatchInput {
  name: string;
  mobile?: string;
  reason: string;
}

export interface LiveWatchList {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry: () => void;
  entries: WatchEntry[];
  /** Settings 3.12: how often each entry is reviewed. */
  reviewDays: number;
  /** False while acting for someone else. */
  canChange: boolean;
  onAdd: (input: WatchInput) => Promise<{ blockedVisits: number }>;
  onReview: (id: string) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
}

export const WATCH_ENTRIES: WatchEntry[] = [
  { id: 'w1', name: 'Manish Gupta', mobile: '+919884500712', reason: 'Took photos of the packing line without permission on 12 Aug 2026; asked to leave by security.', addedBy: 'Anita Desai', addedAt: '2026-08-13T10:20:00', reviewedBy: null, reviewedAt: null, reviewBy: '2027-08-13T10:20:00' },
  { id: 'w2', name: 'Sunil Rawat', mobile: null, reason: 'Former contractor; abusive to reception staff in June 2025 (case HR-0192).', addedBy: 'Ravi Shankar', addedAt: '2025-06-30T16:05:00', reviewedBy: 'Anita Desai', reviewedAt: '2025-10-02T11:00:00', reviewBy: '2026-10-02T11:00:00' },
];

const DUE_SOON_DAYS = 30;
const daysTo = (iso: string, today: Date) => Math.ceil((new Date(iso).getTime() - today.getTime()) / 86_400_000);

export interface VisitorWatchListProps {
  entries: WatchEntry[];
  today: Date;
  state?: 'ready' | 'loading' | 'empty';
  /** Story: the add drawer open. */
  addOpen?: boolean;
  /** Story: the remove confirmation open for this entry. */
  removeId?: string | null;
  live?: LiveWatchList;
}

export function VisitorWatchListScreen({ entries: sample, today, state = 'ready', addOpen = false, removeId = null, live }: VisitorWatchListProps) {
  const { toast } = useSay();
  const entries = live ? live.entries : state === 'empty' ? [] : sample;
  const reviewDays = live ? live.reviewDays : 365;
  const canChange = !live || live.canChange;
  const [open, setOpen] = useState(addOpen);
  const [removing, setRemoving] = useState<string | null>(removeId);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [reason, setReason] = useState('');
  const { busy, error, run, clearError } = useRun();
  const early = useTooEarly(
    [
      name.trim().length < 2 && { fieldId: 'wl-name', message: "Enter the person's name." },
      reason.trim().length < 5 && { fieldId: 'wl-reason', message: 'Write the reason (at least 5 characters).' },
    ].filter(Boolean) as { fieldId: string; message: string }[],
  );
  const close = () => (setOpen(false), setName(''), setMobile(''), setReason(''), clearError());
  const add = () => {
    if (early.stop()) return;
    if (!live) return void (close(), toast({ tone: 'success', title: 'Added to the watch-list', description: 'Their expected visits are blocked.' }));
    void (async () => {
      const ok = await run('add', async () => {
        const res = await live.onAdd({ name: name.trim(), reason: reason.trim(), ...(mobile.trim() ? { mobile: mobile.trim() } : {}) });
        toast({ tone: 'success', title: 'Added to the watch-list', description: res.blockedVisits ? `${res.blockedVisits} expected visit${res.blockedVisits === 1 ? ' was' : 's were'} blocked.` : `Review it within ${reviewDays} days or it lapses.` });
      });
      if (ok) close();
    })();
  };
  const target = entries.find((e) => e.id === removing);
  const table = (
    <DataTable
      label="Watch-list"
      columns={[
        { key: 'name', header: 'Person', value: (e: WatchEntry) => e.name, render: (e) => <span className="yx-ops-stack" data-gap="sm"><strong>{e.name}</strong><span className="yx-ops-muted">{e.mobile ?? 'Matched by name only'}</span></span>, width: 200 },
        { key: 'reason', header: 'Reason', value: (e) => e.reason, width: 340 },
        { key: 'added', header: 'Added', value: (e) => new Date(e.addedAt), render: (e) => `${formatDate(new Date(e.addedAt))} · ${e.addedBy}` },
        { key: 'reviewed', header: 'Last review', value: (e) => (e.reviewedAt ? new Date(e.reviewedAt) : null), render: (e) => (e.reviewedAt ? `${formatDate(new Date(e.reviewedAt))} · ${e.reviewedBy}` : 'Not yet') },
        {
          key: 'reviewBy',
          header: 'Lapses on',
          value: (e) => new Date(e.reviewBy),
          render: (e) => {
            const left = daysTo(e.reviewBy, today);
            return <Badge tone={left <= DUE_SOON_DAYS ? 'warning' : 'neutral'}>{left <= 0 ? 'Today' : `${formatDate(new Date(e.reviewBy))}${left <= DUE_SOON_DAYS ? ` (${left} days)` : ''}`}</Badge>;
          },
        },
      ]}
      rows={entries}
      getRowId={(e) => e.id}
      state={state === 'loading' ? 'loading' : 'ready'}
      onRetry={() => {}}
      empty={<EmptyState compact title="Nobody is on the watch-list." description="Add a person only with a clear reason. Their visits are then stopped at reception without the reason being shown." />}
      rowButtons={(e) =>
        canChange ? (
          <>
            <Button size="sm" icon={RefreshCw} loading={busy === `review-${e.id}`} onClick={() => (live ? void run(`review-${e.id}`, async () => (await live.onReview(e.id), toast({ tone: 'success', title: 'Reviewed', description: `${e.name} stays on the list for another ${reviewDays} days.` }))) : undefined)}>
              Reviewed, keep
            </Button>
            <Button size="sm" icon={Trash2} onClick={() => setRemoving(e.id)}>
              Remove
            </Button>
          </>
        ) : null
      }
    />
  );
  const actions = canChange && (
    <Button variant="primary" icon={ShieldOff} onClick={() => setOpen(true)}>
      Add a person
    </Button>
  );
  const description = `People reception must stop. Only HR and Facility admins see this list and the reasons. Each entry is reviewed every ${reviewDays} days or it lapses and is deleted.`;
  const body = (
    <>
      {error && !open && !removing && <InlineAlert tone="danger" title="Not done">{error}</InlineAlert>}
      {table}
      <Drawer
        open={open}
        onOpenChange={(o) => (o ? setOpen(true) : close())}
        title="Add a person to the watch-list"
        subtitle="Their expected visits are blocked now; new invites for them are blocked too."
        dirty={Boolean(name || reason || mobile)}
        notice={error && open ? <InlineAlert tone="danger" title="Not added">{error}</InlineAlert> : undefined}
        footer={
          <>
            <Button onClick={close}>Cancel</Button>
            <Button variant="primary" icon={ShieldOff} loading={busy === 'add'} onClick={add}>
              Add to the watch-list
            </Button>
          </>
        }
      >
        <div className="yx-ops-stack">
          <FieldRow>
            <FormField id="wl-name" label="Name" required error={early.errorOf('wl-name')}>
              <TextField value={name} onChange={setName} maxLength={200} />
            </FormField>
            <FormField id="wl-mobile" label="Mobile" optional helper="Matched first by mobile, then by name. A number outside India starts with +.">
              <TextField value={mobile} onChange={setMobile} inputMode="tel" maxLength={20} />
            </FormField>
          </FieldRow>
          <FormField id="wl-reason" label="Reason" required error={early.errorOf('wl-reason')} helper="Facts only: what happened and when. Only HR and Facility admins see it; it is not shown at reception.">
            <TextArea value={reason} onChange={setReason} maxLength={500} rows={4} />
          </FormField>
        </div>
      </Drawer>
      <ConfirmDialog
        open={Boolean(target)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={target ? `Remove ${target.name} from the watch-list?` : ''}
        consequence="The entry and its reason are deleted. Visits already blocked stay blocked; the host can invite them again."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (live && target) await live.onRemove(target.id);
          toast({ tone: 'success', title: 'Removed from the watch-list' });
          setRemoving(null);
        }}
      />
    </>
  );
  if (live)
    return (
      <LivePage title="Visitor watch-list" description={description} actions={actions} state={live.state} onRetry={live.onRetry} what="the visitor watch-list" grantedBy="an admin (the HR admin or Facility admin role, for the whole company)">
        {body}
      </LivePage>
    );
  return (
    <OpsDesk area="visitors" active="Watch-list">
      <PageHeader title="Visitor watch-list" description={description} actions={actions} facts={`${entries.length} on the list`} />
      {body}
    </OpsDesk>
  );
}
