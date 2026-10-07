import { useEffect, useState } from 'react';
import { Button } from '../../components/button';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextArea } from '../../components/inputs';
import { Drawer } from '../../components/drawer';
import { PageBanner } from '../../components/notify';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { Breadcrumbs, PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { Timeline } from '../../components/timeline';
import { SupportBadge, actionWords, when } from '../console/console-kit';
import type { LoadState, SupportActivity, SupportSession } from '../console/types';

// Settings › Security › Support access (APX-D PLT-17, P02 Q8 / YX-SEC-20): YukthiX support sees the company's data only
// when a System Admin approves a time-boxed session; every page they open is listed here.

export interface SupportAccessScreenProps {
  state: LoadState;
  onRetry?: () => void;
  sessions: SupportSession[];
  onApprove: (id: string, hours: number, note: string) => Promise<void>;
  onDecline: (id: string, note: string) => Promise<void>;
  onEnd: (id: string) => Promise<void>;
  /** Loads what was recorded for one session. */
  loadActivity: (id: string) => Promise<SupportActivity[]>;
  now?: Date;
}

const choices = (asked: number) => [...new Set([4, 24, 72].filter((h) => h < asked).concat(asked))].map((h) => ({ value: h, label: `${h} hours` }));

function Review({ session, onClose, onApprove, onDecline }: { session: SupportSession; onClose: () => void; onApprove: (hours: number, note: string) => Promise<void>; onDecline: (note: string) => Promise<void> }) {
  const [hours, setHours] = useState(session.hours);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const act = (which: 'approve' | 'decline', fn: () => Promise<void>) => async () => {
    setBusy(which);
    setError(null);
    try {
      await fn();
      onClose();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'That didn’t work. Nothing has changed.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      preventClose={busy !== null}
      title="Let YukthiX support look at your company?"
      description={`${session.requestedBy} (${session.requestedByEmail}) asks${session.ticket ? ` about ticket ${session.ticket}` : ''}: “${session.reason}”`}
      footer={
        <>
          <Button loading={busy === 'decline'} disabled={busy === 'approve'} onClick={act('decline', () => onDecline(note.trim()))}>
            Decline
          </Button>
          <Button variant="approve" loading={busy === 'approve'} disabled={busy === 'decline'} onClick={act('approve', () => onApprove(hours, note.trim()))}>
            Approve for {hours} hours
          </Button>
        </>
      }
    >
      <div className="yx-auth__stack">
        <FormField label="For how long" helper="It starts now and ends on its own. You can end it sooner.">
          <Segment label="For how long" options={choices(session.hours)} value={hours} onChange={setHours} />
        </FormField>
        <FormField label="Note to YukthiX" optional>
          <TextArea value={note} onChange={setNote} rows={2} maxLength={500} />
        </FormField>
        <InlineAlert tone="info" title="Never included">
          Pay, identity and bank details, and POSH, disciplinary, grievance, whistleblower and medical records. Support can only look, never change anything, and every page they open is listed here.
        </InlineAlert>
        {error && <InlineAlert tone="danger" title={error} />}
      </div>
    </Dialog>
  );
}

function Activity({ session, load, onClose }: { session: SupportSession; load: (id: string) => Promise<SupportActivity[]>; onClose: () => void }) {
  const [items, setItems] = useState<SupportActivity[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    load(session.id).then(
      (rows) => live && setItems(rows),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [load, session.id]);
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} size="md" title="What was done in this session" subtitle={`${session.requestedBy} · ${session.reason}`}>
      {failed && <ErrorState title="We couldn't load the activity." description="Try again in a moment." />}
      {!failed && !items && <Skeleton height={160} />}
      {items && (items.length ? <Timeline aria-label="Session activity" items={items.map((a) => ({ id: a.id, actor: { name: a.by }, action: actionWords(a.action, a.method ? { method: a.method, path: a.path } : null), at: new Date(a.at) }))} /> : <Text tone="secondary">Nothing recorded yet.</Text>)}
    </Drawer>
  );
}

export function SupportAccessScreen(props: SupportAccessScreenProps) {
  const [reviewing, setReviewing] = useState<SupportSession | null>(null);
  const [viewing, setViewing] = useState<SupportSession | null>(null);
  const [ending, setEnding] = useState<SupportSession | null>(null);
  const now = props.now ?? new Date();
  const open = props.sessions.find((s) => s.status === 'approved' && s.endsAt && new Date(s.endsAt) > now);
  const columns: TableColumn<SupportSession>[] = [
    {
      key: 'who',
      header: 'YukthiX person',
      value: (s) => s.requestedBy,
      render: (s) => (
        <span className="yx-auth__item-main">
          <Text weight="medium">{s.requestedBy}</Text>
          <Text tone="secondary" size="sm">{s.requestedByEmail}</Text>
        </span>
      ),
      width: 230,
      hideable: false,
    },
    { key: 'reason', header: 'Reason', value: (s) => s.reason, render: (s) => (s.ticket ? `${s.ticket} · ${s.reason}` : s.reason), width: 300 },
    { key: 'status', header: 'State', value: (s) => s.status, render: (s) => <SupportBadge status={s.status} />, width: 190 },
    { key: 'when', header: 'When', value: (s) => s.startsAt ?? s.createdAt, render: (s) => (s.startsAt ? `${when(s.startsAt)} to ${when(s.endsAt)}` : `Asked ${when(s.createdAt)} for ${s.hours} hours`), width: 300, optional: true },
  ];
  return (
    <div className="yx-auth__page">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: 'Settings' }, { label: 'Security' }, { label: 'Support access' }]} />}
        title="Support access"
        description="YukthiX support can see your data only when you approve a session, for a fixed time. They can look but not change anything, and pay, identity, bank and restricted records stay hidden."
      />
      {props.state === 'loading' && <Skeleton height={200} />}
      {props.state === 'error' && <ErrorState title="We couldn't load support access." description="Nothing has changed. Try again in a moment." onRetry={props.onRetry} />}
      {props.state === 'no-access' && <NoAccessState grantedBy="a System Admin" what="support access" />}
      {props.state === 'ready' && (
        <>
          {open && (
            <PageBanner tone="warning" action={<Button size="sm" variant="danger" onClick={() => setEnding(open)}>End session now</Button>}>
              {open.requestedBy} from YukthiX support can look at your company until {when(open.endsAt)}. Every page they open is listed below.
            </PageBanner>
          )}
          <DataTable
            label="Support access requests"
            columns={columns}
            rows={props.sessions}
            getRowId={(s) => s.id}
            rowNoun={['request', 'requests']}
            cardSummary
            rowButtons={(s) =>
              s.status === 'requested' ? (
                <Button variant="review" size="sm" onClick={() => setReviewing(s)}>
                  Review
                </Button>
              ) : s.startsAt ? (
                <Button size="sm" onClick={() => setViewing(s)}>
                  Activity
                </Button>
              ) : null
            }
            empty={<EmptyState compact title="No support access requests." description="When YukthiX support needs to look at your data for a ticket, the request appears here for your approval." />}
          />
        </>
      )}
      {reviewing && <Review session={reviewing} onClose={() => setReviewing(null)} onApprove={(hours, note) => props.onApprove(reviewing.id, hours, note)} onDecline={(note) => props.onDecline(reviewing.id, note)} />}
      {viewing && <Activity session={viewing} load={props.loadActivity} onClose={() => setViewing(null)} />}
      {ending && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setEnding(null)}
          title="End the support session now?"
          consequence={`${ending.requestedBy} loses access straight away.`}
          confirmLabel="End session"
          destructive
          onConfirm={() => props.onEnd(ending.id)}
        />
      )}
    </div>
  );
}
