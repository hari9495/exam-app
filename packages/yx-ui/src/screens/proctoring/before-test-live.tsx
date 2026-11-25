// Assessments AS-4b (answer 2011): before the test, with live data. The designed AccommodationQueueScreen (PRC-11) and
// ConnectivityPanelScreen (PRC-10) in delivery.tsx, and AccommodationRequestScreen (PRC-23) in candidate.tsx, render
// these when the page passes `live`. Same layout, kit parts and words as the designs; only what the server holds is
// shown, and the server checks every action again (one open request, extra time only before the test, a reason of at
// least 10 characters for connectivity time, an ended test never gets time back).
import { useState } from 'react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { DataTable } from '../../components/table';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert } from '../../components/feedback';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { FormField } from '../../components/field';
import { TextArea } from '../../components/inputs';
import { Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { Checkbox } from '../../components/choice';
import { FileUpload } from '../../components/upload';
import { ConfirmDialog } from '../../components/overlay';
import { Heading } from '../../components/foundations';
import { formatClock } from '../../components/exam';
import { formatDate } from '../../lib/format';
import { useRun } from '../org/org-kit';
import { useSay } from '../ops/ops-kit';
import { CandidateFrame, PrcFrame } from './proctoring-shared';
import { withExtraTime } from './proctoring-logic';

export type HelpKind = 'time' | 'breaks' | 'reader' | 'font' | 'separate' | 'profile' | 'identity';
type Load = 'loading' | 'error' | 'ready';

/** The words for each item (the same as the server's ACCOMMODATION_LABEL). */
export const HELP_LABEL: Record<HelpKind, string> = {
  time: 'Extra time',
  breaks: 'Extra or longer breaks',
  reader: 'Screen-reader mode',
  font: 'Larger font or high contrast',
  separate: 'A separate session',
  profile: 'Changes to proctoring',
  identity: 'Manual identity check',
};
/** What a candidate may ask for on the request form (the manual identity check is asked for from the consent step). */
const ASKABLE: HelpKind[] = ['time', 'breaks', 'reader', 'font', 'separate', 'profile'];
/** Applied by YukthiX on approval; the others are noted for the test owner to arrange. */
const AUTOMATIC: HelpKind[] = ['time', 'breaks', 'reader', 'font', 'profile', 'identity'];
/** Answer 2202: what approval changes on the invitation itself, so only before the test starts. */
const BEFORE_START: HelpKind[] = ['time', 'breaks', 'profile'];

const STATUS: Record<string, { label: string; tone: 'warning' | 'success' | 'info' | 'danger' }> = {
  pending: { label: 'New', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  partly: { label: 'Partly approved', tone: 'info' },
  declined: { label: 'Declined', tone: 'danger' },
};
const statusOf = (s: string) => STATUS[s] ?? { label: s, tone: 'info' as const };
const words = (kinds: string[], pct?: number | null, breaks?: { n: number | null; minutes: number | null }) =>
  kinds
    .map((k) => (k === 'time' && pct ? `${pct} % extra time` : k === 'breaks' && breaks?.n ? `${breaks.n} extra break${breaks.n === 1 ? '' : 's'} of ${breaks.minutes} min` : k === 'profile' ? 'No gaze flags (proctoring)' : (HELP_LABEL[k as HelpKind] ?? k)))
    .join(', ');

/* ------------------------------------------------------------------ PRC-11 · accommodation queue */

export interface AccommodationView {
  id: string;
  candidateName: string;
  test: string;
  kinds: string[];
  extraTimePercent: number | null;
  note: string | null;
  evidenceName: string | null;
  status: string;
  approvedKinds: string[];
  grantedExtraTimePercent: number | null;
  grantedExtraBreaks?: number | null;
  grantedBreakMinutes?: number | null;
  message: string | null;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  started: boolean;
}

export interface LiveAccommodationQueue {
  state: Load;
  onRetry: () => void;
  tab: 'pending' | 'decided';
  onTab: (t: 'pending' | 'decided') => void;
  rows: AccommodationView[];
  onOpenEvidence: (id: string) => Promise<void>;
  onDecide: (id: string, d: { approvedKinds: string[]; extraTimePercent: number | null; extraBreaks?: number | null; breakMinutes?: number | null; message: string | null }) => Promise<void>;
}

export function LiveAccommodationQueueScreen({ live }: { live: LiveAccommodationQueue }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = live.rows.find((r) => r.id === openId) ?? null;
  return (
    <PrcFrame page="Accommodation queue">
      <PageHeader title="Accommodation requests" description="Decide before the test. Evaluators never see the reason or the evidence." />
      <Tabs value={live.tab} onValueChange={(v) => live.onTab(v as 'pending' | 'decided')}>
        <TabsList aria-label="Requests">
          <TabsTrigger value="pending">Waiting</TabsTrigger>
          <TabsTrigger value="decided">Decided</TabsTrigger>
        </TabsList>
        {/* The tab's panel holds the list, so each tab names a panel that exists (aria-controls). */}
        <TabsContent value={live.tab}>
          {live.state === 'error' ? (
            <ErrorState title="We couldn't load the requests." onRetry={live.onRetry} />
          ) : (
            <DataTable
              label="Accommodation requests"
              columns={[
                { key: 'name', header: 'Candidate', type: 'person', value: (r: AccommodationView) => r.candidateName, person: (r) => ({ name: r.candidateName, secondary: r.test }), width: 260 },
                { key: 'kinds', header: 'Asked for', value: (r: AccommodationView) => words(r.kinds, r.extraTimePercent), width: 300 },
                { key: 'submitted', header: 'Submitted', type: 'date', value: (r: AccommodationView) => new Date(r.createdAt), width: 130 },
                { key: 'status', header: 'Status', type: 'status', value: (r: AccommodationView) => statusOf(r.status).label, statusTone: (v) => (v === 'Approved' ? 'success' : v === 'Declined' ? 'danger' : v === 'New' ? 'warning' : 'info'), width: 160 },
              ]}
              rows={live.rows}
              getRowId={(r) => r.id}
              state={live.state === 'loading' ? 'loading' : 'ready'}
              empty={<EmptyState title={live.tab === 'pending' ? 'No requests waiting.' : 'No decisions yet.'} description="Candidates ask from their test page; approved changes apply to their invitation automatically." />}
              onRowClick={(r) => setOpenId(r.id)}
              activeRowId={openId}
            />
          )}
        </TabsContent>
      </Tabs>
      {open && <AccommodationDrawer key={open.id} row={open} live={live} onClose={() => setOpenId(null)} />}
    </PrcFrame>
  );
}

function AccommodationDrawer({ row, live, onClose }: { row: AccommodationView; live: LiveAccommodationQueue; onClose: () => void }) {
  const decided = row.status !== 'pending';
  const [approved, setApproved] = useState<string[]>(decided ? row.approvedKinds : row.kinds.filter((k) => !(BEFORE_START.includes(k as HelpKind) && row.started)));
  const [pct, setPct] = useState<string | null>(String(row.extraTimePercent ?? 25));
  const [extraBreaks, setExtraBreaks] = useState(1);
  const [breakMinutes, setBreakMinutes] = useState(15);
  const [message, setMessage] = useState(row.message ?? '');
  const { busy, run, error } = useRun();
  const { done } = useSay();
  const decide = async (kinds: string[]) => {
    const b = kinds.includes('breaks');
    if (await run('decide', () => live.onDecide(row.id, { approvedKinds: kinds, extraTimePercent: kinds.includes('time') ? Number(pct) : null, extraBreaks: b ? extraBreaks : null, breakMinutes: b ? breakMinutes : null, message: message.trim() || null }))) {
      done(kinds.length === 0 ? 'Request declined' : kinds.length === row.kinds.length ? 'Request approved' : 'Request partly approved');
      onClose();
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={row.candidateName}
      subtitle={row.test}
      footer={
        decided ? undefined : (
          <>
            <Button variant="danger" loading={busy === 'decide' && approved.length === 0} onClick={() => void decide([])}>
              Decline
            </Button>
            <Button variant="primary" loading={busy === 'decide'} onClick={() => void decide(approved)}>
              {approved.length === row.kinds.length ? 'Approve all' : approved.length === 0 ? 'Approve none' : `Approve ${approved.length} of ${row.kinds.length}`}
            </Button>
          </>
        )
      }
    >
      <div className="yx-prc-stack">
        <InlineAlert tone="info">Special data. Visible only to the people who decide. Evaluators and proctors see only the adjusted settings, never the reason.</InlineAlert>
        {error && <InlineAlert tone="danger" title={error} />}
        {decided ? (
          <InlineAlert tone={statusOf(row.status).tone === 'danger' ? 'warning' : 'success'} title={`${statusOf(row.status).label}${row.decidedBy ? ` by ${row.decidedBy}` : ''}`}>
            {row.approvedKinds.length ? `Approved: ${words(row.approvedKinds, row.grantedExtraTimePercent, { n: row.grantedExtraBreaks ?? null, minutes: row.grantedBreakMinutes ?? null })}.` : 'Nothing approved.'} {row.decidedAt ? `On ${formatDate(new Date(row.decidedAt))}.` : ''}
          </InlineAlert>
        ) : (
          <FormField label="Approve each adjustment">
            <div className="yx-prc-stack" data-gap="sm">
              {row.kinds.map((k) => (
                <Checkbox
                  key={k}
                  label={words([k], k === 'time' ? row.extraTimePercent : null)}
                  description={BEFORE_START.includes(k as HelpKind) && row.started ? 'The test has started: this can no longer change.' : k === 'profile' ? 'Applied automatically: looking away, looking down and head turns are not flagged' : AUTOMATIC.includes(k as HelpKind) ? 'Applied automatically' : 'Noted for you to arrange'}
                  disabled={BEFORE_START.includes(k as HelpKind) && row.started}
                  checked={approved.includes(k)}
                  onChange={(c) => setApproved(c ? [...approved, k] : approved.filter((x) => x !== k))}
                />
              ))}
            </div>
          </FormField>
        )}
        {!decided && approved.includes('time') && (
          <FormField label="Extra time to approve">
            <Select value={pct} onChange={setPct} options={[{ value: '25', label: '25 %' }, { value: '50', label: '50 %' }, { value: '100', label: '100 %' }]} />
          </FormField>
        )}
        {!decided && approved.includes('breaks') && (
          <div className="yx-prc-stack" data-gap="sm">
            <Segment label="Extra breaks" options={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))} value={extraBreaks} onChange={setExtraBreaks} />
            <Segment label="Length of each break" options={[10, 15, 20, 30].map((n) => ({ value: n, label: `${n} min` }))} value={breakMinutes} onChange={setBreakMinutes} />
          </div>
        )}
        <DescriptionList
          items={[
            { label: 'Their words', value: row.note ?? '—' },
            {
              label: 'Evidence',
              value: row.evidenceName ? (
                <span className="yx-prc-row">
                  {row.evidenceName}{' '}
                  <Button variant="review" size="sm" loading={busy === 'evidence'} onClick={() => void run('evidence', () => live.onOpenEvidence(row.id))}>
                    View
                  </Button>
                </span>
              ) : (
                'None sent'
              ),
            },
            { label: 'Submitted', value: formatDate(new Date(row.createdAt)) },
            { label: 'What changes automatically', value: 'Extra time, extra breaks and the no-gaze proctoring profile on the invitation; screen-reader mode, larger font and the manual identity check shown to the candidate. The candidate gets an email with the decision.' },
          ]}
        />
        <FormField label="Message to the candidate" optional helper="Tell them exactly what was approved">
          <TextArea rows={3} value={message} onChange={setMessage} readOnly={decided} />
        </FormField>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ PRC-10 · connectivity panel */

export interface ConnectivityView {
  id: string;
  attemptId: string;
  candidateName: string;
  test: string;
  lostMs: number;
  creditedMs: number;
  capMinutes: number;
  status: string;
  attemptStatus: string;
  startedAt: string;
  reason: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  updatedAt: string;
}

export interface LiveConnectivity {
  state: Load;
  onRetry: () => void;
  rows: ConnectivityView[];
  onApprove: (id: string, reason: string) => Promise<void>;
  onDecline: (id: string, reason: string) => Promise<void>;
}

const RUNNING = ['in_progress', 'paused'];

export function LiveConnectivityPanelScreen({ live }: { live: LiveConnectivity }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const c = live.rows.find((r) => r.id === openId) ?? live.rows[0] ?? null;
  if (live.state === 'error')
    return (
      <PrcFrame page="Connectivity">
        <ErrorState title="We couldn't load the connection gaps." onRetry={live.onRetry} />
      </PrcFrame>
    );
  return (
    <PrcFrame page="Connectivity">
      {c ? <ConnectivityDecision key={`${c.id}:${c.lostMs}`} c={c} live={live} /> : <PageHeader title="Connectivity" description={live.state === 'loading' ? 'Loading…' : 'Time lost above the cap waits here for a person.'} />}
      <DataTable
        label="Time lost above the cap"
        columns={[
          { key: 'name', header: 'Candidate', type: 'person', value: (r: ConnectivityView) => r.candidateName, person: (r) => ({ name: r.candidateName, secondary: r.test }), width: 260 },
          { key: 'lost', header: 'Waiting for you', value: (r: ConnectivityView) => r.lostMs, render: (r) => formatClock(Math.round(r.lostMs / 1000)), width: 150 },
          { key: 'credited', header: 'Credited automatically', value: (r: ConnectivityView) => r.creditedMs, render: (r) => formatClock(Math.round(r.creditedMs / 1000)), width: 180 },
          { key: 'test', header: 'Test', value: (r: ConnectivityView) => (RUNNING.includes(r.attemptStatus) ? 'Running' : 'Ended'), width: 110 },
        ]}
        rows={live.rows}
        getRowId={(r) => r.id}
        state={live.state === 'loading' ? 'loading' : 'ready'}
        empty={<EmptyState title="Nothing waiting." description="Time lost to the connection is given back automatically up to the company cap; anything above it waits here." />}
        onRowClick={(r) => setOpenId(r.id)}
        activeRowId={c?.id ?? null}
      />
    </PrcFrame>
  );
}

function ConnectivityDecision({ c, live }: { c: ConnectivityView; live: LiveConnectivity }) {
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const [tried, setTried] = useState(false);
  const { busy, run, error } = useRun();
  const { done } = useSay();
  const lost = Math.round(c.lostMs / 1000);
  const running = RUNNING.includes(c.attemptStatus);
  const short = reason.trim().length < 10;
  const reasonError = tried && short ? 'Enter a reason of at least 10 characters.' : undefined;
  return (
    <>
      <ObjectHeader
        name={c.candidateName}
        secondary={`${c.test} · started ${formatDate(new Date(c.startedAt))}`}
        status={running ? <Badge tone="warning">Needs your decision</Badge> : <Badge>Test ended</Badge>}
        facts={[
          { label: 'Credited automatically', value: formatClock(Math.round(c.creditedMs / 1000)) },
          { label: 'Needs your approval', value: formatClock(lost) },
          { label: 'Cap per attempt', value: `${c.capMinutes}:00` },
        ]}
      />
      {error && <InlineAlert tone="danger" title={error} />}
      <Card title={running ? `Approve ${formatClock(lost)} more time` : 'The test has ended'}>
        <div className="yx-prc-stack">
          <p className="yx-prc-p">{running ? `Anything above the ${c.capMinutes}-minute cap needs a person's decision. The timer gives it back at once.` : 'Extra time no longer helps. Decline it with a reason so the record is complete.'}</p>
          <FormField label="Reason" required helper="Saved in the audit log" error={reasonError}>
            <TextArea value={reason} onChange={setReason} rows={2} />
          </FormField>
          <div className="yx-prc-row">
            <Button
              loading={busy === 'decline'}
              onClick={async () => {
                setTried(true);
                if (short) return;
                if (await run('decline', () => live.onDecline(c.id, reason.trim()))) done('Extra time declined');
              }}
            >
              Decline extra time
            </Button>
            {running && (
              <Button
                variant="primary"
                onClick={() => {
                  setTried(true);
                  if (!short) setOpen(true);
                }}
              >
                Approve extra time
              </Button>
            )}
          </div>
        </div>
      </Card>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Approve ${formatClock(lost)} extra time for ${c.candidateName}?`}
        consequence="The timer adds this time at once. This is audited."
        confirmLabel="Approve extra time"
        confirmVariant="approve"
        onConfirm={async () => {
          if (await run('approve', () => live.onApprove(c.id, reason.trim()))) done('Extra time approved');
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ PRC-23 · accommodation request (candidate) */

export interface CandidateHelpView {
  request: { kinds: string[]; extraTimePercent: number | null; status: string; approvedKinds: string[]; grantedExtraTimePercent: number | null; message: string | null; createdAt: string; decidedAt: string | null } | null;
  approved: string[];
  extraTimePercent: number;
}

export interface LiveAccommodationRequest {
  state: Load;
  /** The inviting company, shown in the frame (never the sample name). */
  companyName: string;
  onRetry: () => void;
  testTitle: string;
  durationMinutes: number;
  /** The test has started: asking is closed. */
  started: boolean;
  help: CandidateHelpView | null;
  onSend: (a: { kinds: HelpKind[]; extraTimePercent: number | null; note: string | null; evidence: File | null }) => Promise<void>;
  onBack: () => void;
}

export function LiveAccommodationRequestScreen({ live }: { live: LiveAccommodationRequest }) {
  const [types, setTypes] = useState<HelpKind[]>([]);
  const [pct, setPct] = useState<string | null>('25');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [tried, setTried] = useState(false);
  const { busy, run, error } = useRun();
  const { done } = useSay();
  if (live.state === 'error')
    return (
      <CandidateFrame page="My tests" company={live.companyName}>
        <ErrorState title="We couldn't load your request." onRetry={live.onRetry} />
      </CandidateFrame>
    );
  const req = live.help?.request ?? null;
  const pending = req?.status === 'pending';
  const typesError = tried && types.length === 0 ? 'Choose what you need.' : undefined;
  return (
    <CandidateFrame page="My tests" company={live.companyName}>
      <Heading level={1}>Ask for an accommodation</Heading>
      <p className="yx-prc-muted">{live.testTitle}. Ask before your test; approved changes apply by themselves on the day.</p>
      {live.state === 'loading' ? null : pending ? (
        <InlineAlert tone="info" title={`Request sent on ${formatDate(new Date(req!.createdAt))}`}>
          The person in charge of the test will decide before your test and tell you exactly what was approved. People who mark your answers never see your request or documents.
        </InlineAlert>
      ) : (
        <>
          {req && (
            <InlineAlert tone={req.status === 'declined' ? 'warning' : 'success'} title={`${statusOf(req.status).label}${req.decidedAt ? ` on ${formatDate(new Date(req.decidedAt))}` : ''}`}>
              {req.approvedKinds.length ? `Approved for you: ${words(req.approvedKinds, req.grantedExtraTimePercent)}.` : 'Nothing was approved.'} {req.message ?? ''}
            </InlineAlert>
          )}
          {live.started ? (
            <InlineAlert tone="info" title="Your test has started">Ask the recruiter if you need help now.</InlineAlert>
          ) : (
            <div className="yx-prc-center">
              {error && <InlineAlert tone="danger" title={error} />}
              <FormField label="What do you need?" required error={typesError}>
                <div className="yx-prc-stack" data-gap="sm">
                  {ASKABLE.map((v) => (
                    <Checkbox key={v} label={HELP_LABEL[v] + (v === 'profile' ? ' (for example, no eye-direction checks)' : '')} checked={types.includes(v)} onChange={(c) => setTypes(c ? [...types, v] : types.filter((x) => x !== v))} />
                  ))}
                </div>
              </FormField>
              {types.includes('time') && (
                <FormField label="How much extra time?" helper={pct ? `Your ${live.durationMinutes}-minute test would become ${withExtraTime(live.durationMinutes, Number(pct))} minutes` : undefined}>
                  <Select value={pct} onChange={setPct} options={[{ value: '25', label: '25 %' }, { value: '50', label: '50 %' }, { value: '100', label: '100 %' }]} />
                </FormField>
              )}
              <FormField label="Tell us more" optional>
                <TextArea rows={3} value={note} onChange={setNote} placeholder="Anything that helps the reviewer understand what works for you" />
              </FormField>
              <FormField label="Supporting document" optional helper="PDF or photo, up to 10 MB. Stored as sensitive data and seen only by the person who decides.">
                <FileUpload
                  accept={['.pdf', '.jpg', '.jpeg', '.png']}
                  maxSize={10 * 1024 * 1024}
                  upload={async (f) => setFile(f)}
                  onItemsChange={(items) => setFile(items.find((i) => i.status === 'done')?.file ?? null)}
                />
              </FormField>
              <div className="yx-prc-row">
                <Button onClick={live.onBack}>Cancel</Button>
                <Button
                  variant="primary"
                  loading={busy === 'send'}
                  onClick={async () => {
                    setTried(true);
                    if (types.length === 0) return;
                    if (await run('send', () => live.onSend({ kinds: types, extraTimePercent: types.includes('time') ? Number(pct) : null, note: note.trim() || null, evidence: file }))) {
                      done('Request sent');
                      setTypes([]);
                      setTried(false);
                    }
                  }}
                >
                  Send request
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </CandidateFrame>
  );
}

/** Answer 2164: the help approved for a candidate, as one line ("Approved for you: …"), or null. */
export function approvedForYou(approved: string[], extraTimePercent: number): string | null {
  const shown = approved.filter((k) => k !== 'identity');
  return shown.length ? `Approved for you: ${words(shown, extraTimePercent || null)}` : null;
}
