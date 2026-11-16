// Assessments AS-3 (answers 2001, 2013; PRC-07, PRC-21, PRC-32): the designed invitations page, the candidate's test
// list and the result-reuse choice with live data. The designed InvitationsScreen (delivery.tsx), CandidatePortalHomeScreen
// and ResultReuseScreen (candidate.tsx) render these when the page passes `live`. Same layout, kit parts and words as the
// designs; only what the server holds is shown, and the server checks every action again.
import { useMemo, useRef, useState } from 'react';
import { RefreshCw, Send } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, type FilterFieldDef } from '../../components/filters';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert } from '../../components/feedback';
import { Card, DescriptionList, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { FormField } from '../../components/field';
import { TextArea } from '../../components/inputs';
import { MultiSelect, Select } from '../../components/select';
import { Checkbox, RadioGroup } from '../../components/choice';
import { ConfirmDialog } from '../../components/overlay';
import { Heading } from '../../components/foundations';
import { formatDate } from '../../lib/format';
import { matchesFilter, type FilterValue } from '../../lib/table';
import { useRun } from '../org/org-kit';
import { useSay } from '../ops/ops-kit';
import { CandidateFrame, PrcFrame, type CandidateBrand } from './proctoring-shared';
import { withExtraTime } from './proctoring-logic';
import type { BankLoad } from './bank-live';

const opt = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));
const day = (iso: string | null) => (iso ? formatDate(new Date(iso)) : '');

/* ------------------------------------------------------------------ PRC-07 · Invitations & drives */

export type LiveInvitationStatus = 'Invited' | 'Started' | 'Completed' | 'Under review' | 'Missed' | 'Revoked' | 'Reused';

/** GET /asmt/invitations. */
export interface LiveInvitationRow {
  id: string;
  candidateId: string;
  name: string;
  email: string;
  examId: string;
  test: string;
  jobs: string[];
  drive: string | null;
  status: LiveInvitationStatus;
  invitedAt: string;
  expiresAt: string;
  resendCount: number;
  reinvitedAt: string | null;
  reinviteReason: string | null;
  extraTimePercent: number;
  reusedAt: string | null;
}

/** GET /asmt/drives. */
export interface LiveDriveRow {
  id: string;
  name: string;
  tests: string[];
  job: string | null;
  from: string | null;
  to: string | null;
  sessions: number;
  invited: number;
  attempted: number;
  status: 'Planning' | 'Registration open' | 'Live' | 'Closed';
}

export interface LiveInvitations {
  state: BankLoad;
  onRetry: () => void;
  invitations: LiveInvitationRow[];
  drives: LiveDriveRow[];
  /** Published tests a candidate can be invited to. */
  tests: { id: string; title: string }[];
  /** Candidates matching the search typed in the invite drawer. */
  candidates: { id: string; name: string; email: string }[];
  onCandidateSearch: (q: string) => void;
  onInvite: (examId: string, candidateIds: string[]) => Promise<{ created: number; skipped: number }>;
  onResend: (ids: string[]) => Promise<void>;
  onRevoke: (ids: string[]) => Promise<void>;
  onReinvite: (id: string, reason: string) => Promise<void>;
}

export const INVITATION_TONE: Record<LiveInvitationStatus, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  Invited: 'neutral',
  Started: 'info',
  Completed: 'success',
  'Under review': 'warning',
  Missed: 'danger',
  Revoked: 'neutral',
  Reused: 'success',
};

/** Reminders go to people who have not started; revoking is for anyone who has not finished. */
export const canRemind = (r: LiveInvitationRow) => r.status === 'Invited';
export const canRevoke = (r: LiveInvitationRow) => r.status === 'Invited' || r.status === 'Missed';

export function LiveInvitationsScreen({ live }: { live: LiveInvitations }) {
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const [invite, setInvite] = useState(false);
  const [examId, setExamId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [tried, setTried] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reinvite, setReinvite] = useState(false);
  const [reason, setReason] = useState('');
  const [revokeIds, setRevokeIds] = useState<string[] | null>(null);
  const { busy, run, error, clearError } = useRun();
  const { done, say } = useSay();
  const fields: FilterFieldDef[] = useMemo(
    () => [
      { key: 'status', label: 'Status', type: 'multi', options: opt(['Invited', 'Started', 'Completed', 'Under review', 'Missed', 'Revoked', 'Reused']) },
      { key: 'test', label: 'Test', type: 'multi', options: opt([...new Set(live.invitations.map((r) => r.test))]) },
    ],
    [live.invitations],
  );
  const rows = useMemo(() => live.invitations.filter((r) => (!q || `${r.name} ${r.email}`.toLowerCase().includes(q.toLowerCase())) && filters.every((f) => matchesFilter((r as unknown as Record<string, unknown>)[f.key], f))), [live.invitations, filters, q]);
  const open = live.invitations.find((x) => x.id === openId);
  // Candidates picked earlier stay named while the search shows others.
  const known = useRef(new Map<string, { id: string; name: string; email: string }>());
  for (const c of live.candidates) known.current.set(c.id, c);
  const candidateOptions = [...new Set([...picked, ...live.candidates.map((c) => c.id)])].flatMap((id) => {
    const c = known.current.get(id);
    return c ? [{ value: c.id, label: `${c.name} · ${c.email}` }] : [];
  });

  if (live.state === 'error')
    return (
      <PrcFrame page="Invitations & drives">
        <ErrorState title="We couldn't load invitations." onRetry={live.onRetry} />
      </PrcFrame>
    );
  const tableState = live.state === 'loading' ? 'loading' : 'ready';
  const byId = (ids: string[]) => live.invitations.filter((r) => ids.includes(r.id));

  const cols: TableColumn<LiveInvitationRow>[] = [
    { key: 'name', header: 'Test-taker', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.email }), width: 250 },
    { key: 'test', header: 'Test', value: (r) => r.test, width: 220 },
    { key: 'jobs', header: 'Jobs', value: (r) => r.jobs.join(', '), width: 200 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => INVITATION_TONE[v as LiveInvitationStatus], groupable: true, width: 130 },
    { key: 'expiresAt', header: 'Open until', type: 'date', value: (r) => new Date(r.expiresAt), render: (r) => day(r.expiresAt), width: 130 },
    { key: 'drive', header: 'Drive', value: (r) => r.drive ?? '', width: 180 },
    { key: 'reminders', header: 'Reminders sent', type: 'number', value: (r) => r.resendCount, width: 120 },
  ];
  const driveCols: TableColumn<LiveDriveRow>[] = [
    { key: 'name', header: 'Drive', value: (r) => r.name, width: 260 },
    { key: 'test', header: 'Test', value: (r) => r.tests.join(', '), width: 220 },
    { key: 'window', header: 'Window', value: (r) => r.from ?? '', render: (r) => (r.from ? `${day(r.from)} – ${day(r.to)}` : 'No sessions yet'), width: 200 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Live' ? 'success' : v === 'Closed' ? 'neutral' : 'info'), width: 150 },
    { key: 'sessions', header: 'Sessions', type: 'number', value: (r) => r.sessions, width: 100 },
    { key: 'invited', header: 'Invited', type: 'number', value: (r) => r.invited, width: 100 },
    { key: 'attempted', header: 'Attempted', type: 'number', value: (r) => r.attempted, width: 110 },
  ];

  const sendInvites = async () => {
    setTried(true);
    if (!examId || !picked.length) return;
    let res = { created: 0, skipped: 0 };
    if (
      await run('invite', async () => {
        res = await live.onInvite(examId, picked);
      })
    ) {
      done(res.skipped ? `${res.created} invited; ${res.skipped} already had an open invitation` : `${res.created} invited`);
      setInvite(false);
      setPicked([]);
      setTried(false);
    }
  };

  return (
    <PrcFrame page="Invitations & drives">
      <PageHeader
        title="Invitations and drives"
        description="Every invitation of the company and its state. The window closes at the end of the day shown."
        actions={
          <Button
            variant="primary"
            icon={Send}
            onClick={() => {
              clearError();
              setInvite(true);
            }}
          >
            Invite candidates
          </Button>
        }
      />
      {error && !invite && !open && (
        <InlineAlert tone="danger" title="That did not work">
          {error}
        </InlineAlert>
      )}
      <Tabs defaultValue="invitations">
        <TabsList aria-label="Delivery">
          <TabsTrigger value="invitations" count={live.invitations.length}>
            Invitations
          </TabsTrigger>
          <TabsTrigger value="drives" count={live.drives.length}>
            Drives
          </TabsTrigger>
        </TabsList>
        <TabsContent value="invitations">
          <div className="yx-prc-stack">
            <FilterBar fields={fields} value={filters} onChange={setFilters} search={q} onSearchChange={setQ} searchPlaceholder="Search name or email" />
            <DataTable
              label="Invitations"
              columns={cols}
              rows={rows}
              getRowId={(r) => r.id}
              state={tableState}
              filtered={filters.length > 0 || !!q}
              onClearFilters={() => {
                setFilters([]);
                setQ('');
              }}
              empty={<EmptyState title="No one invited yet." description="Invite candidates to a published test. Each gets an email with their own link." action={<Button onClick={() => setInvite(true)}>Invite candidates</Button>} />}
              selectable
              selectedIds={sel}
              onSelectedChange={setSel}
              bulkActions={(ids) => {
                const remind = byId(ids).filter(canRemind).map((r) => r.id);
                const revoke = byId(ids).filter(canRevoke).map((r) => r.id);
                return (
                  <>
                    <Button
                      size="sm"
                      loading={busy === 'remind'}
                      onClick={() =>
                        say(!remind.length && 'Reminders go only to people who have not started.', () =>
                          void run('remind', () => live.onResend(remind)).then((ok) => {
                            if (ok) {
                              done(`Reminder sent to ${remind.length}`);
                              setSel([]);
                            }
                          }),
                        )
                      }
                    >
                      Send reminder to {remind.length}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => say(!revoke.length && 'Only invitations not yet taken can be revoked.', () => setRevokeIds(revoke))}>
                      Revoke {revoke.length}
                    </Button>
                  </>
                );
              }}
              onRowClick={(r) => {
                clearError();
                setOpenId(r.id);
                setReinvite(false);
                setReason('');
              }}
              activeRowId={openId}
              pageSize={10}
            />
          </div>
        </TabsContent>
        <TabsContent value="drives">
          <DataTable label="Drives" columns={driveCols} rows={live.drives} getRowId={(r) => r.id} state={tableState} empty={<EmptyState title="No drives yet." description="A drive groups many sessions, across centres if needed. Walk-in drives you set up appear here." />} />
        </TabsContent>
      </Tabs>
      <Drawer
        open={invite}
        onOpenChange={setInvite}
        title="Invite candidates"
        subtitle="Each candidate gets an email with their own link."
        footer={
          <>
            <Button onClick={() => setInvite(false)}>Cancel</Button>
            <Button variant="primary" loading={busy === 'invite'} onClick={() => void sendInvites()}>
              {picked.length ? `Send ${picked.length} invitation${picked.length === 1 ? '' : 's'}` : 'Send invitations'}
            </Button>
          </>
        }
      >
        <div className="yx-prc-stack">
          {error && invite && (
            <InlineAlert tone="danger" title="That did not work">
              {error}
            </InlineAlert>
          )}
          <FormField label="Test" required error={tried && !examId ? 'Choose a test.' : undefined} helper={live.tests.length ? undefined : 'No published tests yet. Publish a test first.'}>
            <Select aria-label="Test" value={examId} onChange={setExamId} options={live.tests.map((t) => ({ value: t.id, label: t.title }))} placeholder="Choose a published test" />
          </FormField>
          <FormField label="Candidates" required error={tried && !picked.length ? 'Choose at least one candidate.' : undefined} helper="Search by name or email. Anyone with an open invitation to this test not yet taken is skipped.">
            <MultiSelect aria-label="Candidates" value={picked} onChange={setPicked} options={candidateOptions} onSearchChange={live.onCandidateSearch} searchable placeholder="Search candidates" />
          </FormField>
        </div>
      </Drawer>
      {open && (
        <Drawer
          open
          onOpenChange={(o) => !o && setOpenId(null)}
          title={open.name}
          subtitle={open.test}
          meta={<Badge tone={INVITATION_TONE[open.status]}>{open.status}</Badge>}
          footer={
            open.status === 'Missed' && !open.reinvitedAt ? (
              reinvite ? (
                <>
                  <Button onClick={() => setReinvite(false)}>Cancel</Button>
                  <Button
                    variant="primary"
                    loading={busy === 'reinvite'}
                    onClick={() => {
                      setTried(true);
                      if (reason.trim().length < 10) return;
                      void run('reinvite', () => live.onReinvite(open.id, reason.trim())).then((ok) => {
                        if (ok) {
                          done('Re-invited: a new link and window were sent');
                          setReinvite(false);
                          setTried(false);
                        }
                      });
                    }}
                  >
                    Re-invite
                  </Button>
                </>
              ) : (
                <Button variant="primary" icon={RefreshCw} onClick={() => setReinvite(true)}>
                  Re-invite once, with reason
                </Button>
              )
            ) : canRemind(open) ? (
              <Button loading={busy === 'remind1'} onClick={() => void run('remind1', () => live.onResend([open.id])).then((ok) => ok && done('Reminder sent'))}>
                Send reminder
              </Button>
            ) : undefined
          }
        >
          <div className="yx-prc-stack">
            {error && (
              <InlineAlert tone="danger" title="That did not work">
                {error}
              </InlineAlert>
            )}
            {open.status === 'Reused' && <InlineAlert tone="info">The candidate chose to use an earlier result on this test{open.reusedAt ? ` on ${day(open.reusedAt)}` : ''}. No new test is taken.</InlineAlert>}
            {open.status === 'Missed' && open.reinvitedAt && <InlineAlert tone="info">Already re-invited once, on {day(open.reinvitedAt)}. A missed test is re-invited only once.</InlineAlert>}
            <DescriptionList
              items={[
                { label: 'Email', value: open.email },
                { label: 'Jobs using this test', value: open.jobs.length ? open.jobs.join(', ') : 'None' },
                { label: 'Invited on', value: day(open.invitedAt) },
                { label: 'Open until', value: day(open.expiresAt) },
                { label: 'Drive', value: open.drive ?? 'None' },
                { label: 'Extra time', value: open.extraTimePercent ? `${open.extraTimePercent} %` : 'None' },
                { label: 'Reminders sent', value: String(open.resendCount) },
                ...(open.reinviteReason ? [{ label: 'Re-invite reason', value: open.reinviteReason }] : []),
              ]}
            />
            {reinvite && (
              <FormField label="Why re-invite" required error={tried && reason.trim().length < 10 ? 'Give a reason of at least 10 characters.' : undefined} helper="Kept with the invitation. The candidate gets a new link and a new window.">
                <TextArea value={reason} onChange={setReason} rows={3} maxLength={500} />
              </FormField>
            )}
          </div>
        </Drawer>
      )}
      <ConfirmDialog
        open={revokeIds !== null}
        onOpenChange={(o) => !o && setRevokeIds(null)}
        title={`Revoke ${revokeIds?.length ?? 0} invitation${revokeIds?.length === 1 ? '' : 's'}?`}
        consequence="Their links stop working at once. To test them later, invite them again."
        confirmLabel="Revoke"
        destructive
        onConfirm={async () => {
          await live.onRevoke(revokeIds ?? []);
          done(`Revoked ${revokeIds?.length ?? 0}`);
          setSel([]);
        }}
      />
    </PrcFrame>
  );
}

/* ------------------------------------------------------------------ PRC-21 · The candidate's tests */

export type LiveCandidateTestStatus = 'invited' | 'started' | 'completed' | 'under_review' | 'missed' | 'withdrawn' | 'reused';

/** GET /attempt/my-tests. */
export interface LiveMyTest {
  invitationId: string;
  testTitle: string;
  status: LiveCandidateTestStatus;
  expiresAt: string;
  durationMinutes: number;
  extraTimePercent: number;
  current: boolean;
}

export interface LivePortal {
  state: BankLoad;
  onRetry: () => void;
  brand: CandidateBrand;
  tests: LiveMyTest[];
  /** The open test may use an earlier result (PRC-32). */
  reuseOffer: boolean;
  onReuse: () => void;
  /** The test this session is for: start or carry on. */
  onStart: () => void;
  onResult: () => void;
  /** Another of the candidate's tests at this company. */
  onOpen: (invitationId: string) => Promise<void>;
}

export const MY_TEST_BADGE: Record<LiveCandidateTestStatus, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }> = {
  invited: { label: 'To take', tone: 'info' },
  started: { label: 'Started', tone: 'info' },
  completed: { label: 'Submitted', tone: 'success' },
  under_review: { label: 'Result under review', tone: 'warning' },
  missed: { label: 'Missed', tone: 'danger' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  reused: { label: 'Earlier result used', tone: 'success' },
};

const Title = ({ children }: { children: string }) => <Heading level={1}>{children}</Heading>;

export function LivePortalHomeScreen({ live }: { live: LivePortal }) {
  const { busy, run, error } = useRun();
  if (live.state === 'error')
    return (
      <CandidateFrame page="My tests" brand={live.brand}>
        <ErrorState title="We couldn't load your tests." onRetry={live.onRetry} />
      </CandidateFrame>
    );
  const length = (t: LiveMyTest) => (t.extraTimePercent ? `${t.durationMinutes} minutes, plus ${t.extraTimePercent} % extra time approved = ${withExtraTime(t.durationMinutes, t.extraTimePercent)} minutes` : `${t.durationMinutes} minutes`);
  return (
    <CandidateFrame page="My tests" brand={live.brand}>
      <Title>My tests</Title>
      {error && (
        <InlineAlert tone="danger" title="That did not work">
          {error}
        </InlineAlert>
      )}
      {live.state === 'loading' ? (
        <p className="yx-prc-muted">Loading…</p>
      ) : !live.tests.length ? (
        <EmptyState title="No tests for you right now." description={`When ${live.brand.company} invites you to a test, it appears here and we email you.`} />
      ) : (
        <div className="yx-prc-stack">
          {live.tests.map((t) => {
            const b = MY_TEST_BADGE[t.status];
            const openable = (t.status === 'invited' || t.status === 'started') && !t.current;
            return (
              <Card key={t.invitationId} title={t.testTitle} actions={<Badge tone={b.tone}>{b.label}</Badge>}>
                <div className="yx-prc-stack">
                  {t.status === 'invited' || t.status === 'started' ? (
                    <DescriptionList items={[{ label: 'Open until', value: day(t.expiresAt) }, { label: 'Length', value: length(t) }]} />
                  ) : (
                    <p className="yx-prc-p">
                      {t.status === 'missed'
                        ? `The window closed on ${day(t.expiresAt)} without a start. Contact the recruiter if you still want to take it.`
                        : t.status === 'under_review'
                          ? 'Submitted. We are checking a few moments of your session. You will hear from us by email.'
                          : t.status === 'reused'
                            ? 'You chose to use your earlier result on this test. No new test is needed.'
                            : t.status === 'withdrawn'
                              ? 'This invitation was withdrawn by the hiring team.'
                              : 'Submitted. You will hear from us by email.'}
                    </p>
                  )}
                  {t.current && t.status === 'invited' && live.reuseOffer && <InlineAlert tone="info">You took this test recently. You can use that result instead of taking it again.</InlineAlert>}
                  {t.current && (t.status === 'invited' || t.status === 'started') && (
                    <div className="yx-prc-row">
                      <Button variant="primary" onClick={live.onStart}>
                        {t.status === 'started' ? 'Carry on with the test' : 'Start the test'}
                      </Button>
                      {t.status === 'invited' && live.reuseOffer && <Button onClick={live.onReuse}>Use my earlier result</Button>}
                    </div>
                  )}
                  {t.current && (t.status === 'completed' || t.status === 'under_review') && (
                    <div className="yx-prc-row">
                      <Button onClick={live.onResult}>See your result</Button>
                    </div>
                  )}
                  {t.current && t.status === 'reused' && (
                    <div className="yx-prc-row">
                      <Button onClick={live.onReuse}>Change my choice</Button>
                    </div>
                  )}
                  {openable && (
                    <div className="yx-prc-row">
                      <Button loading={busy === t.invitationId} onClick={() => void run(t.invitationId, () => live.onOpen(t.invitationId))}>
                        Open this test
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </CandidateFrame>
  );
}

/* ------------------------------------------------------------------ PRC-32 · Using an earlier result */

/** GET /attempt/reuse. */
export interface LiveReuseOffer {
  offer: { attemptId: string; testTitle: string; takenAt: string; passed: boolean | null; validUntil: string; months: number } | null;
  reused: { takenAt: string } | null;
}

export interface LiveReuse extends LiveReuseOffer {
  state: BankLoad;
  onRetry: () => void;
  brand: CandidateBrand;
  testTitle: string;
  onUse: (attemptId: string) => Promise<void>;
  onWithdraw: () => Promise<void>;
  /** Go to the test (start it). */
  onTakeTest: () => void;
  /** Back to My tests. */
  onLater: () => void;
}

export function LiveResultReuseScreen({ live }: { live: LiveReuse }) {
  const [c, setC] = useState<string | undefined>('reuse');
  const [agree, setAgree] = useState(false);
  const { busy, run, error } = useRun();
  const { done } = useSay();
  if (live.state === 'error')
    return (
      <CandidateFrame page="My tests" brand={live.brand}>
        <ErrorState title="We couldn't load this." onRetry={live.onRetry} />
      </CandidateFrame>
    );
  if (live.state === 'loading')
    return (
      <CandidateFrame page="My tests" brand={live.brand}>
        <Title>Use your earlier result?</Title>
        <p className="yx-prc-muted">Loading…</p>
      </CandidateFrame>
    );
  const o = live.offer;
  return (
    <CandidateFrame page="My tests" brand={live.brand}>
      <Title>Use your earlier result?</Title>
      {error && (
        <InlineAlert tone="danger" title="That did not work">
          {error}
        </InlineAlert>
      )}
      {live.reused ? (
        <>
          <p className="yx-prc-muted">{live.testTitle}</p>
          <InlineAlert tone="success" title="You are using your earlier result">
            {`Your result from ${day(live.reused.takenAt)} is used for this invitation. It is linked, not copied. You can take the test instead until the window closes.`}
          </InlineAlert>
          <div className="yx-prc-row">
            <Button onClick={live.onLater}>Back to my tests</Button>
            <Button loading={busy === 'withdraw'} onClick={() => void run('withdraw', live.onWithdraw).then((ok) => ok && done('You can now take the test'))}>
              Take the test instead
            </Button>
          </div>
        </>
      ) : !o ? (
        <>
          <p className="yx-prc-muted">{live.testTitle}</p>
          <InlineAlert tone="info" title="No earlier result can be used">
            There is no result on this test from the time allowed, or this company does not reuse results. Take the test as usual.
          </InlineAlert>
          <div className="yx-prc-row">
            <Button onClick={live.onLater}>Back to my tests</Button>
            <Button variant="primary" onClick={live.onTakeTest}>
              Go to the test
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="yx-prc-muted">{`${live.brand.company} invited you to a test you took before. You can use that result instead of taking it again.`}</p>
          <Card title={`${o.testTitle}, taken ${day(o.takenAt)}`}>
            <DescriptionList items={[{ label: 'Result', value: o.passed == null ? 'Shown to the hiring team' : o.passed ? 'Passed' : 'Not passed' }, { label: 'Can be used until', value: `${day(o.validUntil)} (${o.months} months)` }]} />
          </Card>
          <RadioGroup
            aria-label="Your choice"
            value={c}
            onChange={setC}
            options={[
              { value: 'reuse', label: 'Use my earlier result', description: 'No new test. The result is linked, not copied, and you can change your mind until the window closes.' },
              { value: 'retake', label: 'Take the test again', description: 'The new result is used for this invitation.' },
            ]}
          />
          {c === 'reuse' && <Checkbox label={`I agree that ${live.brand.company} may use my ${day(o.takenAt)} result for this invitation`} checked={agree} onChange={setAgree} required />}
          <div className="yx-prc-row">
            <Button onClick={live.onLater}>Decide later</Button>
            <Button
              variant="primary"
              disabled={c === 'reuse' && !agree}
              loading={busy === 'use'}
              onClick={() => (c === 'reuse' ? void run('use', () => live.onUse(o.attemptId)).then((ok) => ok && done('Your earlier result is used')) : live.onTakeTest())}
            >
              {c === 'reuse' ? 'Use my result' : 'Go to the test'}
            </Button>
          </div>
        </>
      )}
    </CandidateFrame>
  );
}
