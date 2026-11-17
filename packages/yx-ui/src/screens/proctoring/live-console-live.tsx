// AS-5 part 2 (PRC-13, answer 2006): the designed live console with a real test's attempts. Tiles come from the
// monitoring socket (the page); pausing, resuming and ending each take a reason the attempt's record keeps; ending also
// asks for the second factor (the page's API call asks and retries). Only kit parts.
import { useMemo, useState } from 'react';
import { MessageSquare, Pause, Play, XOctagon } from 'lucide-react';
import { Button, ButtonGroup } from '../../components/button';
import { Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert } from '../../components/feedback';
import { PageHeader } from '../../components/shell';
import { FormField } from '../../components/field';
import { TextArea } from '../../components/inputs';
import { ConfirmDialog } from '../../components/overlay';
import { formatClock } from '../../components/exam';
import { SYSTEM_ACTOR, Timeline } from '../../components/timeline';
import { PrcFrame } from './proctoring-shared';
import { ProctorTile } from './proctoring-kit';
import { filterByRisk, proctorActionError, sortByConcern, tileLevel, type LiveTileData } from './proctoring-logic';

export interface LiveConsole {
  testName: string;
  connection: 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
  state: 'loading' | 'error' | 'ready';
  error?: string | null;
  onRetry: () => void;
  /** One tile per attempt (id = the attempt), level from its flags so far. */
  tiles: LiveTileData[];
  /** Each attempt's flags so far (from the monitoring socket). */
  events: Record<string, { id: string; type: string; severity: string; at: string }[]>;
  onPause: (id: string, reason: string, message: string | null) => Promise<unknown>;
  onResume: (id: string, reason: string) => Promise<unknown>;
  /** Asks for the second factor first (the page). */
  onEnd: (id: string, reason: string) => Promise<unknown>;
  onMessage: (id: string, text: string) => Promise<unknown>;
}

const CONNECTION = { connecting: { label: 'Connecting…', tone: 'neutral' }, connected: { label: 'Live', tone: 'success' }, reconnecting: { label: 'Reconnecting…', tone: 'warning' }, disconnected: { label: 'Offline', tone: 'danger' } } as const;

export function LiveConsoleLiveScreen({ live }: { live: LiveConsole }) {
  const [risk, setRisk] = useState<'all' | 'high' | 'review' | 'clear'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | 'pause' | 'resume' | 'end'>(null);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [touched, setTouched] = useState(false);
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState('');
  const shown = useMemo(() => sortByConcern(filterByRisk(live.tiles, risk)), [live.tiles, risk]);
  const open = live.tiles.find((t) => t.id === openId) ?? null;
  const counts = { all: live.tiles.length, high: filterByRisk(live.tiles, 'high').length, review: filterByRisk(live.tiles, 'review').length, clear: filterByRisk(live.tiles, 'clear').length };
  const err = touched ? proctorActionError(reason) : null;
  const close = () => {
    setDialog(null);
    setTouched(false);
    setReason('');
    setMessage('');
  };
  const run = (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    return fn()
      .then(() => {
        setSaid(done);
        close();
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Try again in a moment.'))
      .finally(() => setBusy(false));
  };
  const events = open ? live.events[open.id] ?? [] : [];

  return (
    <PrcFrame page="Live console">
      <div className="yx-prc-stack">
        <PageHeader
          title="Live console"
          description={live.testName}
          facts={<Badge tone={CONNECTION[live.connection].tone}>{CONNECTION[live.connection].label}</Badge>}
        />
        <p className="yx-visually-hidden" role="status" aria-live="polite">
          {said}
        </p>
        <ButtonGroup aria-label="Filter by risk">
          {(['all', 'high', 'review', 'clear'] as const).map((r) => (
            <Button key={r} size="sm" aria-pressed={risk === r} onClick={() => setRisk(r)}>
              {`${r === 'all' ? 'All' : r === 'high' ? 'High concern' : r === 'review' ? 'Review' : 'Clear'} ${counts[r]}`}
            </Button>
          ))}
        </ButtonGroup>
        {live.state === 'error' ? (
          <ErrorState title={live.error ?? "We couldn't open the live console."} onRetry={live.onRetry} />
        ) : live.state === 'loading' ? (
          <EmptyState title="Connecting to the test…" />
        ) : shown.length === 0 ? (
          <EmptyState title={live.tiles.length ? 'No candidates match this filter.' : 'No candidates in this test yet.'} description={live.tiles.length ? 'Choose "All" to see everyone.' : 'Tiles appear as candidates start.'} />
        ) : (
          <div className="yx-prc-tiles">
            {shown.map((t, i) => (
              <ProctorTile key={t.id} tile={t} index={i} selected={t.id === openId} onOpen={setOpenId} />
            ))}
          </div>
        )}
      </div>
      {open && (
        <Drawer
          open
          size="lg"
          onOpenChange={(o) => !o && setOpenId(null)}
          title={open.name}
          subtitle={`${open.question} · ${formatClock(open.secondsLeft)} left`}
          meta={<Badge tone={tileLevel(open) === 'high' ? 'danger' : tileLevel(open) === 'review' ? 'warning' : 'success'}>{tileLevel(open) === 'high' ? 'High concern' : tileLevel(open) === 'review' ? 'Review' : 'Clear'}</Badge>}
          footer={
            <>
              {open.status === 'paused' ? (
                <Button icon={Play} onClick={() => setDialog('resume')}>
                  Resume
                </Button>
              ) : (
                <Button icon={Pause} onClick={() => setDialog('pause')} disabled={open.status !== 'in-progress'}>
                  Pause
                </Button>
              )}
              <Button variant="danger" icon={XOctagon} onClick={() => setDialog('end')} disabled={open.status !== 'in-progress' && open.status !== 'paused'}>
                End attempt
              </Button>
            </>
          }
        >
          <div className="yx-prc-stack">
            {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
            {open.status === 'terminated' && <InlineAlert tone="info">Attempt ended. It is not a fail: answers and evidence go to the integrity review, and the candidate can appeal.</InlineAlert>}
            <section className="yx-prc-stack" aria-label="Flags so far">
              {events.length ? (
                <Timeline aria-label="Flags so far" items={events.map((e) => ({ id: e.id, actor: { name: SYSTEM_ACTOR }, action: `${e.type.replace(/_/g, ' ')} (${e.severity})`, at: new Date(e.at) }))} />
              ) : (
                <p className="yx-prc-muted">No flags so far.</p>
              )}
            </section>
            <FormField label="Message to the candidate" helper="Shown to the candidate in the test">
              <TextArea value={draft} onChange={setDraft} rows={2} maxLength={1000} />
            </FormField>
            {sent.length > 0 && <p className="yx-prc-muted yx-prc-small">{`Sent: ${sent[sent.length - 1]}`}</p>}
            <div className="yx-prc-row">
              <Button
                icon={MessageSquare}
                loading={busy && dialog === null}
                disabled={!draft.trim()}
                onClick={() => {
                  const text = draft.trim();
                  void run(() => live.onMessage(open.id, text), `Message sent to ${open.name}`).then(() => {
                    setSent((x) => [...x, text]);
                    setDraft('');
                  });
                }}
              >
                Send
              </Button>
            </div>
          </div>
        </Drawer>
      )}
      <ConfirmDialog
        open={dialog != null && open != null}
        onOpenChange={(o) => !o && close()}
        title={dialog === 'end' ? `End ${open?.name ?? 'this candidate'}'s attempt?` : dialog === 'resume' ? `Resume ${open?.name ?? 'this candidate'}?` : `Pause ${open?.name ?? 'this candidate'}?`}
        consequence={
          dialog === 'end'
            ? 'The candidate can no longer answer. Answers and evidence are kept for review and appeal; this is not a fail. You will be asked for your second factor.'
            : dialog === 'resume'
              ? 'The timer starts again for the candidate.'
              : 'The timer stops and the candidate sees your message until you resume.'
        }
        confirmLabel={dialog === 'end' ? 'End attempt' : dialog === 'resume' ? 'Resume test' : 'Pause test'}
        destructive={dialog === 'end'}
        onConfirm={() => {
          setTouched(true);
          if (proctorActionError(reason) || !open) return false;
          const id = open.id;
          const name = open.name;
          void run(
            () => (dialog === 'end' ? live.onEnd(id, reason.trim()) : dialog === 'resume' ? live.onResume(id, reason.trim()) : live.onPause(id, reason.trim(), message.trim() || null)),
            dialog === 'end' ? `${name}'s attempt ended.` : dialog === 'resume' ? `${name} resumed.` : `${name} paused. Timer stopped.`,
          );
          return false;
        }}
      >
        <div className="yx-prc-stack">
          <FormField label="Reason" required error={err} helper="Kept on the candidate's record and in the audit log with your name">
            <TextArea value={reason} onChange={setReason} onBlur={() => setTouched(true)} rows={3} maxLength={500} />
          </FormField>
          {dialog === 'pause' && (
            <FormField label="Message to the candidate" optional helper="Shown while the test is paused">
              <TextArea value={message} onChange={setMessage} rows={2} maxLength={300} />
            </FormField>
          )}
        </div>
      </ConfirmDialog>
    </PrcFrame>
  );
}
