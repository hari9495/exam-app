// Assessments AS-3 (answers 2001, 2013; PRC-07, PRC-21, PRC-32): the designed invitations page, the candidate's test
// list and the result-reuse choice with live data. The designed InvitationsScreen (delivery.tsx), CandidatePortalHomeScreen
// and ResultReuseScreen (candidate.tsx) render these when the page passes `live`. Same layout, kit parts and words as the
// designs; only what the server holds is shown, and the server checks every action again.
import { useMemo, useRef, useState } from 'react';
import { Plus, RefreshCw, Send, Upload } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { FileUpload } from '../../components/upload';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, type FilterFieldDef } from '../../components/filters';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert } from '../../components/feedback';
import { Card, DescriptionList, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { Segment } from '../../components/segment';
import { BarChart } from '../../components/charts';
import { FormField } from '../../components/field';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { MultiSelect, Select } from '../../components/select';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
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
  /** Answer 2211: one call for many; each refusal is named and the rest go ahead. */
  onResend: (ids: string[]) => Promise<BulkOutcome>;
  onRevoke: (ids: string[]) => Promise<BulkOutcome>;
  onReinvite: (id: string, reason: string) => Promise<void>;
  /** 2214: a new walk-in drive (only for those who may make one); resolves to its id. */
  onNewDrive?: (name: string) => Promise<string>;
  /** Open a drive's campus kit (PRC-29). */
  onOpenDrive?: (id: string) => void;
}

/** POST /asmt/invitations/bulk. */
export interface BulkOutcome {
  done: number;
  failed: { id: string; reason: string }[];
}

/** The bulk outcome as a done message, or throws the first refusal when nothing went through. */
export function bulkWords(o: BulkOutcome, verb: string): string {
  if (!o.done && o.failed.length) throw new Error(o.failed[0]!.reason);
  return o.failed.length ? `${verb} ${o.done}; ${o.failed.length} refused (${o.failed[0]!.reason})` : `${verb} ${o.done}`;
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
  const [newDrive, setNewDrive] = useState<string | null>(null);
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
          <>
            {live.onNewDrive && (
              <Button icon={Plus} onClick={() => setNewDrive('')}>
                New drive
              </Button>
            )}
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
          </>
        }
      />
      {error && !invite && !open && newDrive === null && (
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
                          void run('remind', async () => done(bulkWords(await live.onResend(remind), 'Reminder sent to'))).then((ok) => ok && setSel([])),
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
          <DataTable
            label="Drives"
            columns={driveCols}
            rows={live.drives}
            getRowId={(r) => r.id}
            state={tableState}
            onRowClick={live.onOpenDrive ? (r) => live.onOpenDrive!(r.id) : undefined}
            empty={<EmptyState title="No drives yet." description="A drive groups many sessions, across centres if needed." action={live.onNewDrive ? <Button onClick={() => setNewDrive('')}>New drive</Button> : undefined} />}
          />
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
              <Button loading={busy === 'remind1'} onClick={() => void run('remind1', async () => bulkWords(await live.onResend([open.id]), 'Reminder sent to')).then((ok) => ok && done('Reminder sent'))}>
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
          done(bulkWords(await live.onRevoke(revokeIds ?? []), 'Revoked'));
          setSel([]);
        }}
      />
      <Drawer
        open={newDrive !== null}
        onOpenChange={(o) => !o && setNewDrive(null)}
        title="New drive"
        subtitle="A walk-in or campus drive. Add its sessions and tests on the drive."
        footer={
          <>
            <Button onClick={() => setNewDrive(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy === 'drive'}
              onClick={() => {
                setTried(true);
                if (!newDrive?.trim()) return;
                void run('drive', async () => {
                  const id = await live.onNewDrive!(newDrive.trim());
                  done('Drive created');
                  setNewDrive(null);
                  setTried(false);
                  live.onOpenDrive?.(id);
                });
              }}
            >
              Create drive
            </Button>
          </>
        }
      >
        <div className="yx-prc-stack">
          {error && newDrive !== null && (
            <InlineAlert tone="danger" title="That did not work">
              {error}
            </InlineAlert>
          )}
          <FormField label="Drive name" required error={tried && !newDrive?.trim() ? 'Name the drive.' : undefined}>
            <TextField value={newDrive ?? ''} onChange={setNewDrive} placeholder="e.g. Campus drive · Tamil Nadu 2026" maxLength={200} />
          </FormField>
        </div>
      </Drawer>
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

/* ------------------------------------------------------------------ PRC-29 · Campus drive kit (no admit cards, 2014) */

export type CampusFieldMode = 'off' | 'optional' | 'required';
export type CampusResultsVisibility = 'none' | 'aggregate' | 'per_candidate';

/** A drive's campus form and eligibility (GET/PUT /asmt/drives/:id/campus). */
export interface LiveCampusSettings {
  fields: { phone: CampusFieldMode; branch: CampusFieldMode; graduationYear: CampusFieldMode; cgpa: CampusFieldMode };
  branches: string[];
  graduationYear: number | null;
  minCgpa: number | null;
  cap: number | null;
  tellIneligible: boolean;
}

export const DEFAULT_CAMPUS_SETTINGS: LiveCampusSettings = { fields: { phone: 'required', branch: 'required', graduationYear: 'required', cgpa: 'required' }, branches: [], graduationYear: null, minCgpa: null, cap: null, tellIneligible: true };

export interface LiveInstitution {
  id: string;
  name: string;
  code: string;
  city: string | null;
  coordinatorName: string | null;
  coordinatorEmail: string | null;
  resultsVisibility: CampusResultsVisibility;
  archived: boolean;
}

export type LiveInstitutionInput = Omit<LiveInstitution, 'id'>;

/** POST /asmt/institutions/import (answer 2241). */
export interface InstitutionImportResult {
  rows: { line: number; name: string; code: string; ok: boolean; problem: string | null }[];
  added: number;
}
const INSTITUTION_HEADER = 'name,code,city,coordinator_name,coordinator_email,results';

export interface LiveRegistrant {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  institutionId: string;
  college: string;
  rollNumber: string;
  branch: string | null;
  graduationYear: number | null;
  cgpa: number | null;
  eligible: boolean;
  ineligibleReason: string | null;
  match: 'New' | 'Existing candidate' | 'Possible duplicate' | 'Merged';
  duplicateOf: { id: string; name: string; email: string } | null;
  mergedInto: { id: string; name: string } | null;
  test: LiveInvitationStatus | null;
  registeredAt: string;
}

export interface LiveCollegeRow {
  institutionId: string;
  college: string;
  registered: number;
  eligible: number;
  invited: number;
  attended: number;
  passed: number;
}

export interface LiveCampusKit {
  state: BankLoad;
  onRetry: () => void;
  drive: { id: string; name: string; status: LiveDriveRow['status']; tests: string[] };
  /** The public registration link of this drive (the walk-in page with the drive's group). */
  registrationUrl: string;
  /** null: not a campus drive yet (the form tab offers to turn it on). */
  settings: LiveCampusSettings | null;
  registrants: LiveRegistrant[];
  report: LiveCollegeRow[];
  institutions: LiveInstitution[];
  onSaveSettings: (s: LiveCampusSettings | null) => Promise<void>;
  onSaveInstitution: (id: string | null, d: LiveInstitutionInput) => Promise<void>;
  /** Answer 2241: a CSV of institutions; `commit` false only checks the rows. */
  onImportInstitutions: (csv: string, commit: boolean) => Promise<InstitutionImportResult>;
  /** Resolves to the email the link went to. */
  onSendCoordinatorLink: (institutionId: string) => Promise<string>;
  onMerge: (id: string, intoId: string) => Promise<void>;
  onNotDuplicate: (id: string) => Promise<void>;
  onCopyLink: (url: string) => Promise<void>;
}

const VISIBILITY_WORDS: Record<CampusResultsVisibility, string> = { none: 'None', aggregate: 'Counts and pass rate', per_candidate: 'Each student’s result' };
const MODE_OPTIONS = [
  { value: 'off' as const, label: 'Not asked' },
  { value: 'optional' as const, label: 'Optional' },
  { value: 'required' as const, label: 'Required' },
];
const FIELD_WORDS: Record<keyof LiveCampusSettings['fields'], string> = { phone: 'Mobile', branch: 'Degree and branch', graduationYear: 'Graduation year', cgpa: 'CGPA / %' };
const MATCH_TONE: Record<LiveRegistrant['match'], 'neutral' | 'info' | 'warning'> = { New: 'neutral', 'Existing candidate': 'info', 'Possible duplicate': 'warning', Merged: 'neutral' };
const EMPTY_INSTITUTION: LiveInstitutionInput = { name: '', code: '', city: null, coordinatorName: null, coordinatorEmail: null, resultsVisibility: 'aggregate', archived: false };

/** Why the campus settings cannot be saved, or null (the API checks the same). */
export function campusProblem(s: LiveCampusSettings): string | null {
  if (s.branches.length && s.fields.branch !== 'required') return 'Branches are a rule, so the branch must be required.';
  if (s.graduationYear != null && s.fields.graduationYear !== 'required') return 'Graduation year is a rule, so it must be required.';
  if (s.minCgpa != null && s.fields.cgpa !== 'required') return 'Minimum CGPA is a rule, so CGPA must be required.';
  return null;
}

type RegistrantTab = 'form' | 'registrants' | 'institutions' | 'report';

export function LiveCampusKitScreen({ live, tab = 'registrants' }: { live: LiveCampusKit; tab?: RegistrantTab }) {
  const [form, setForm] = useState<LiveCampusSettings | null>(live.settings);
  const [formFor, setFormFor] = useState(live.settings);
  const [branchText, setBranchText] = useState((live.settings?.branches ?? []).join(', '));
  const [openReg, setOpenReg] = useState<string | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [inst, setInst] = useState<{ id: string | null; d: LiveInstitutionInput } | null>(null);
  const [importing, setImporting] = useState(false);
  const [tried, setTried] = useState(false);
  const { busy, run, error, clearError } = useRun();
  const { done } = useSay();
  if (live.settings !== formFor) {
    // The server's copy changed (saved or reloaded): show it.
    setFormFor(live.settings);
    setForm(live.settings);
    setBranchText((live.settings?.branches ?? []).join(', '));
  }
  if (live.state === 'error')
    return (
      <PrcFrame page="Campus kit & institutions">
        <ErrorState title="We couldn't load this drive." onRetry={live.onRetry} />
      </PrcFrame>
    );
  const loading = live.state === 'loading';
  const reg = live.registrants.find((r) => r.id === openReg);
  const counted = live.registrants.filter((r) => r.match !== 'Merged');
  const duplicates = counted.filter((r) => r.match === 'Possible duplicate').length;
  const problem = form ? campusProblem(form) : null;
  const instProblem = inst && (!inst.d.name.trim() ? 'Name the institution.' : !inst.d.code.trim() ? 'Give its code.' : null);
  const setField = (k: keyof LiveCampusSettings['fields'], v: CampusFieldMode) => form && setForm({ ...form, fields: { ...form.fields, [k]: v } });
  const setInstField = (patch: Partial<LiveInstitutionInput>) => inst && setInst({ ...inst, d: { ...inst.d, ...patch } });

  const regCols: TableColumn<LiveRegistrant>[] = [
    { key: 'name', header: 'Student', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.email }), width: 220 },
    { key: 'college', header: 'College', value: (r) => r.college, groupable: true, width: 240 },
    { key: 'rollNumber', header: 'Roll number', type: 'id', value: (r) => r.rollNumber, width: 120 },
    { key: 'cgpa', header: 'CGPA', type: 'number', value: (r) => r.cgpa ?? '', width: 80 },
    { key: 'eligibility', header: 'Eligibility', type: 'status', value: (r) => (r.eligible ? 'Eligible' : `Not eligible: ${r.ineligibleReason ?? ''}`), statusTone: (v) => (String(v).startsWith('Eligible') ? 'success' : 'danger'), width: 230 },
    { key: 'match', header: 'Match with candidates', type: 'status', value: (r) => r.match, statusTone: (v) => MATCH_TONE[v as LiveRegistrant['match']], groupable: true, width: 190 },
    { key: 'test', header: 'Test', type: 'status', value: (r) => r.test ?? 'Not invited', statusTone: (v) => (v === 'Not invited' ? 'neutral' : INVITATION_TONE[v as LiveInvitationStatus]), width: 130 },
  ];
  const instCols: TableColumn<LiveInstitution>[] = [
    { key: 'name', header: 'Institution', value: (r) => r.name, width: 280 },
    { key: 'code', header: 'Code', type: 'id', value: (r) => r.code, width: 120 },
    { key: 'city', header: 'City', value: (r) => r.city ?? '', width: 110 },
    { key: 'coordinator', header: 'Coordinator', value: (r) => r.coordinatorName ?? 'None yet', width: 190 },
    { key: 'visibility', header: 'Results the coordinator sees', value: (r) => VISIBILITY_WORDS[r.resultsVisibility], width: 200 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => (r.archived ? 'Archived' : 'In use'), statusTone: (v) => (v === 'Archived' ? 'neutral' : 'success'), width: 110 },
  ];
  const reportCols: TableColumn<LiveCollegeRow>[] = [
    { key: 'college', header: 'College', value: (r) => r.college, width: 280 },
    { key: 'registered', header: 'Registered', type: 'number', value: (r) => r.registered, width: 110 },
    { key: 'eligible', header: 'Eligible', type: 'number', value: (r) => r.eligible, width: 100 },
    { key: 'invited', header: 'Invited', type: 'number', value: (r) => r.invited, width: 100 },
    { key: 'attended', header: 'Attended', type: 'number', value: (r) => r.attended, width: 100 },
    { key: 'passed', header: 'Passed', type: 'number', value: (r) => r.passed, width: 100 },
  ];

  return (
    <PrcFrame page="Campus kit & institutions">
      <PageHeader
        title={live.drive.name}
        description={`${live.drive.tests.length ? `Test: ${live.drive.tests.join(', ')}` : 'No test in this drive yet'} · public page ${live.registrationUrl}`}
        status={<Badge tone={live.drive.status === 'Live' ? 'success' : live.drive.status === 'Closed' ? 'neutral' : 'info'}>{live.drive.status}</Badge>}
        actions={
          <Button loading={busy === 'copy'} onClick={() => void run('copy', () => live.onCopyLink(live.registrationUrl)).then((ok) => ok && done('Registration link copied'))}>
            Copy registration link
          </Button>
        }
      />
      {error && !inst && !reg && (
        <InlineAlert tone="danger" title="That did not work">
          {error}
        </InlineAlert>
      )}
      <Tabs defaultValue={tab}>
        <TabsList aria-label="Campus kit">
          <TabsTrigger value="form">Registration form</TabsTrigger>
          <TabsTrigger value="registrants" count={counted.length}>
            Registrants
          </TabsTrigger>
          <TabsTrigger value="institutions" count={live.institutions.filter((i) => !i.archived).length}>
            Institutions
          </TabsTrigger>
          <TabsTrigger value="report">College-wise report</TabsTrigger>
        </TabsList>
        <TabsContent value="form">
          {!form ? (
            <EmptyState
              title="Not a campus drive yet."
              description="Turn on the campus form to ask each student's college, roll number and marks, check eligibility and give colleges their own view."
              action={
                <Button variant="primary" onClick={() => setForm(DEFAULT_CAMPUS_SETTINGS)}>
                  Use the campus form
                </Button>
              }
            />
          ) : (
            <div className="yx-prc-stack">
              <div className="yx-prc-split">
                <Card title="Fields">
                  <ul className="yx-prc-plain">
                    {['Full name · required', 'Email · required', 'College · from the institution list', 'Roll number · required'].map((f) => (
                      <li key={f}>
                        <span>{f}</span>
                      </li>
                    ))}
                    {(Object.keys(FIELD_WORDS) as (keyof LiveCampusSettings['fields'])[]).map((k) => (
                      <li key={k}>
                        <span>{FIELD_WORDS[k]}</span>
                        <Segment label={FIELD_WORDS[k]} options={MODE_OPTIONS} value={form.fields[k]} onChange={(v) => setField(k, v)} />
                      </li>
                    ))}
                  </ul>
                </Card>
                <section className="yx-prc-box" aria-label="Eligibility and limits">
                  <h2 className="yx-prc-h">Eligibility and limits</h2>
                  <FormField label="Branches" helper="Comma separated. Empty: any branch.">
                    <TextField
                      value={branchText}
                      onChange={(v) => {
                        setBranchText(v);
                        setForm({ ...form, branches: v.split(',').map((b) => b.trim()).filter(Boolean) });
                      }}
                      placeholder="CSE, IT, ECE"
                    />
                  </FormField>
                  <FormField label="Graduation year" helper="Empty: any year.">
                    <NumberField value={form.graduationYear} onChange={(v) => setForm({ ...form, graduationYear: v })} min={2000} max={2100} />
                  </FormField>
                  <FormField label="Minimum CGPA" helper="Empty: no minimum.">
                    <NumberField value={form.minCgpa} decimals onChange={(v) => setForm({ ...form, minCgpa: v })} min={0} max={100} />
                  </FormField>
                  <FormField label="Registration cap" helper="Empty: no cap. Merged duplicates do not count.">
                    <NumberField value={form.cap} onChange={(v) => setForm({ ...form, cap: v })} min={1} />
                  </FormField>
                  <Switch label="Tell ineligible students why" checked={form.tellIneligible} onChange={(v) => setForm({ ...form, tellIneligible: v })} />
                </section>
              </div>
              {problem && <InlineAlert tone="warning">{problem}</InlineAlert>}
              <div className="yx-prc-row">
                {live.settings && (
                  <Button loading={busy === 'off'} onClick={() => void run('off', () => live.onSaveSettings(null)).then((ok) => ok && done('Campus form turned off'))}>
                    Turn off the campus form
                  </Button>
                )}
                <Button variant="primary" disabled={Boolean(problem)} loading={busy === 'save'} onClick={() => void run('save', () => live.onSaveSettings(form)).then((ok) => ok && done('Registration form saved'))}>
                  Save the form
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
        <TabsContent value="registrants">
          <div className="yx-prc-stack">
            {duplicates > 0 && <InlineAlert tone="warning">{`${duplicates} possible duplicate${duplicates === 1 ? '' : 's'}: the same roll number at the same college with another email. Open one to merge it or clear the flag.`}</InlineAlert>}
            <DataTable
              label="Registrants"
              columns={regCols}
              rows={live.registrants}
              getRowId={(r) => r.id}
              state={loading ? 'loading' : 'ready'}
              onRowClick={(r) => {
                clearError();
                setOpenReg(r.id);
              }}
              activeRowId={openReg}
              pageSize={10}
              empty={<EmptyState title="No one has registered yet." description={live.settings ? 'Share the registration link with the colleges.' : 'Turn on the campus form first, then share the registration link.'} />}
            />
          </div>
        </TabsContent>
        <TabsContent value="institutions">
          <DataTable
            label="Institutions"
            columns={instCols}
            rows={live.institutions}
            getRowId={(r) => r.id}
            state={loading ? 'loading' : 'ready'}
            onRowClick={(r) => {
              clearError();
              setTried(false);
              setInst({ id: r.id, d: { name: r.name, code: r.code, city: r.city, coordinatorName: r.coordinatorName, coordinatorEmail: r.coordinatorEmail, resultsVisibility: r.resultsVisibility, archived: r.archived } });
            }}
            toolbar={
              <>
                <Button size="sm" icon={Upload} onClick={() => setImporting(true)}>
                  Import institutions
                </Button>
                <Button
                  size="sm"
                  icon={Plus}
                  onClick={() => {
                    clearError();
                    setTried(false);
                    setInst({ id: null, d: EMPTY_INSTITUTION });
                  }}
                >
                  Add institution
                </Button>
              </>
            }
            empty={<EmptyState title="No institutions yet." description="Add the colleges you hire from. Students pick their college from this list." />}
          />
        </TabsContent>
        <TabsContent value="report">
          <div className="yx-prc-stack">
            <BarChart
              title="Registered, eligible and attended by college"
              categories={live.report.map((c) => c.college)}
              series={[
                { name: 'Registered', values: live.report.map((c) => c.registered) },
                { name: 'Eligible', values: live.report.map((c) => c.eligible) },
                { name: 'Attended', values: live.report.map((c) => c.attended) },
              ]}
              groupSizes={live.report.map((c) => c.registered)}
              minGroupSize={5}
              horizontalBelow={640}
              footnote="Colleges with fewer than 5 registrants are left out of the chart; the table shows them."
            />
            <DataTable label="College-wise report" columns={reportCols} rows={live.report} getRowId={(r) => r.institutionId} empty={<EmptyState title="Nothing to report yet." description="Counts appear as students register." />} />
          </div>
        </TabsContent>
      </Tabs>
      {reg && (
        <Drawer
          open
          onOpenChange={(o) => !o && setOpenReg(null)}
          title={reg.name}
          subtitle={`${reg.college} · ${reg.rollNumber}`}
          meta={<Badge tone={MATCH_TONE[reg.match]}>{reg.match}</Badge>}
          footer={
            reg.match === 'Possible duplicate' && reg.duplicateOf ? (
              <>
                <Button loading={busy === 'clear'} onClick={() => void run('clear', () => live.onNotDuplicate(reg.id)).then((ok) => ok && done('Marked as a different student'))}>
                  Not a duplicate
                </Button>
                <Button variant="primary" onClick={() => setMergeOpen(true)}>
                  Merge into {reg.duplicateOf.name}
                </Button>
              </>
            ) : undefined
          }
        >
          <div className="yx-prc-stack">
            {error && (
              <InlineAlert tone="danger" title="That did not work">
                {error}
              </InlineAlert>
            )}
            {reg.duplicateOf && <InlineAlert tone="warning">{`Same roll number at the same college as ${reg.duplicateOf.name} (${reg.duplicateOf.email}). Merging keeps ${reg.duplicateOf.name}'s registration; this one stops counting and its untaken invitation is withdrawn.`}</InlineAlert>}
            {reg.mergedInto && <InlineAlert tone="info">{`Merged into ${reg.mergedInto.name}'s registration.`}</InlineAlert>}
            <DescriptionList
              items={[
                { label: 'Email', value: reg.email },
                { label: 'Mobile', value: reg.phone ?? 'Not given' },
                { label: 'Branch', value: reg.branch ?? 'Not given' },
                { label: 'Graduation year', value: reg.graduationYear == null ? 'Not given' : String(reg.graduationYear) },
                { label: 'CGPA / %', value: reg.cgpa == null ? 'Not given' : String(reg.cgpa) },
                { label: 'Eligibility', value: reg.eligible ? 'Eligible' : `Not eligible: ${reg.ineligibleReason ?? ''}` },
                { label: 'Test', value: reg.test ?? 'Not invited' },
                { label: 'Registered on', value: day(reg.registeredAt) },
              ]}
            />
          </div>
        </Drawer>
      )}
      <ConfirmDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        title={`Merge into ${reg?.duplicateOf?.name ?? ''}?`}
        consequence="This registration stops counting and its invitation, if not yet taken, is withdrawn. The candidate records stay as they are."
        confirmLabel="Merge"
        onConfirm={async () => {
          await live.onMerge(reg!.id, reg!.duplicateOf!.id);
          done('Registrations merged');
          setOpenReg(null);
        }}
      />
      {importing && (
        <InstitutionImportDrawer
          onClose={() => setImporting(false)}
          onImport={live.onImportInstitutions}
          onDone={(n) => {
            done(`${n} ${n === 1 ? 'institution' : 'institutions'} added`);
            setImporting(false);
          }}
        />
      )}
      {inst && (
        <Drawer
          open
          onOpenChange={(o) => !o && setInst(null)}
          title={inst.id ? inst.d.name || 'Institution' : 'Add institution'}
          footer={
            <>
              {inst.id && live.settings && inst.d.coordinatorEmail && !inst.d.archived && (
                <Button loading={busy === 'link'} onClick={() => void run('link', async () => done(`Link sent to ${await live.onSendCoordinatorLink(inst.id!)}`))}>
                  Send coordinator link
                </Button>
              )}
              <Button onClick={() => setInst(null)}>Cancel</Button>
              <Button
                variant="primary"
                loading={busy === 'inst'}
                onClick={() => {
                  setTried(true);
                  if (instProblem) return;
                  void run('inst', () => live.onSaveInstitution(inst.id, inst.d)).then((ok) => {
                    if (ok) {
                      done(inst.id ? 'Institution saved' : 'Institution added');
                      setInst(null);
                    }
                  });
                }}
              >
                {inst.id ? 'Save' : 'Add'}
              </Button>
            </>
          }
        >
          <div className="yx-prc-stack">
            {error && (
              <InlineAlert tone="danger" title="That did not work">
                {error}
              </InlineAlert>
            )}
            <FormField label="Institution name" required error={tried && !inst.d.name.trim() ? 'Name the institution.' : undefined}>
              <TextField value={inst.d.name} onChange={(v) => setInstField({ name: v })} maxLength={300} />
            </FormField>
            <div className="yx-prc-grid2">
              <FormField label="Code" required error={tried && !inst.d.code.trim() ? 'Give its code.' : undefined} helper="Unique in the company, e.g. the university code.">
                <TextField value={inst.d.code} onChange={(v) => setInstField({ code: v })} maxLength={40} />
              </FormField>
              <FormField label="City">
                <TextField value={inst.d.city ?? ''} onChange={(v) => setInstField({ city: v || null })} maxLength={120} />
              </FormField>
            </div>
            <div className="yx-prc-grid2">
              <FormField label="Coordinator">
                <TextField value={inst.d.coordinatorName ?? ''} onChange={(v) => setInstField({ coordinatorName: v || null })} maxLength={200} />
              </FormField>
              <FormField label="Coordinator's email" helper="Their read-only link to a drive goes here.">
                <TextField type="email" value={inst.d.coordinatorEmail ?? ''} onChange={(v) => setInstField({ coordinatorEmail: v || null })} maxLength={320} />
              </FormField>
            </div>
            <FormField label="Results the coordinator sees" helper="Shown only after the drive closes. Registration and attendance are always shown.">
              <Segment label="Results the coordinator sees" options={(Object.keys(VISIBILITY_WORDS) as CampusResultsVisibility[]).map((v) => ({ value: v, label: VISIBILITY_WORDS[v] }))} value={inst.d.resultsVisibility} onChange={(v) => setInstField({ resultsVisibility: v })} />
            </FormField>
            {inst.id && <Switch label="Archived" description="Archived colleges are left out of the registration form; past registrations keep them." checked={inst.d.archived} onChange={(v) => setInstField({ archived: v })} />}
          </div>
        </Drawer>
      )}
    </PrcFrame>
  );
}

/** Answer 2241: institutions from a CSV. Every row is checked first; only the good rows are added. */
function InstitutionImportDrawer({ onClose, onImport, onDone }: { onClose: () => void; onImport: LiveCampusKit['onImportInstitutions']; onDone: (n: number) => void }) {
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<InstitutionImportResult | null>(null);
  const [tried, setTried] = useState(false);
  const { busy, error, run } = useRun();
  const good = preview?.rows.filter((r) => r.ok).length ?? 0;
  const edit = (text: string) => {
    setCsv(text);
    setPreview(null);
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Import institutions"
      subtitle="A CSV file with one college per row. You see every row's problem before anything is added."
      size="lg"
      dirty={Boolean(csv)}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {preview && good > 0 ? (
            <Button variant="primary" loading={busy === 'commit'} onClick={() => void run('commit', async () => onDone((await onImport(csv, true)).added))}>
              {`Add ${good} ${good === 1 ? 'institution' : 'institutions'}`}
            </Button>
          ) : (
            <Button
              variant="primary"
              loading={busy === 'check'}
              onClick={() => {
                setTried(true);
                if (csv.trim()) void run('check', async () => setPreview(await onImport(csv, false)));
              }}
            >
              Check the file
            </Button>
          )}
        </>
      }
    >
      <div className="yx-prc-stack">
        {error && (
          <InlineAlert tone="danger" title="The file was not read">
            {error}
          </InlineAlert>
        )}
        <p className="yx-prc-small yx-prc-muted">{`Columns: ${INSTITUTION_HEADER}. Name and code are needed; codes are unique in the company. Results: none, counts (the default) or each.`}</p>
        <FormField id="inst-imp-file" label="CSV file">
          <FileUpload id="inst-imp-file" upload={async (f) => edit(await f.text())} accept={['.csv']} multiple={false} maxSize={256 * 1024} />
        </FormField>
        <FormField id="inst-imp-text" label="Or paste the rows" optional error={tried && !csv.trim() ? 'Choose a CSV file or paste the rows.' : undefined}>
          <TextArea value={csv} onChange={edit} rows={6} placeholder={INSTITUTION_HEADER} />
        </FormField>
        {preview && (
          <Card title={`${good} of ${preview.rows.length} rows can be added`}>
            <ul className="yx-prc-plain" aria-label="Rows">
              {preview.rows.map((r) => (
                <li key={r.line}>
                  <span>{`Line ${r.line}: ${r.name || 'no name'}${r.code ? ` (${r.code})` : ''}`}</span>
                  {r.problem ? <span className="yx-prc-small">{r.problem}</span> : null}
                  <Badge tone={r.ok ? 'success' : 'danger'}>{r.ok ? 'Ready' : 'Problem'}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ PRC-29 · The college coordinator's view */

/** GET /public/campus/coordinator/:token. */
export interface LiveCoordinatorView {
  company: string;
  drive: string;
  college: string;
  coordinator: string | null;
  visibility: CampusResultsVisibility;
  resultsShown: boolean;
  /** The registration link with this college chosen. */
  registrationUrl: string;
  counts: { registered: number; eligible: number; invited: number; attended: number; passed: number | null };
  registrants: { name: string; rollNumber: string; registration: string; test: string; result: string | null }[];
}

export interface LiveCoordinator {
  state: BankLoad | 'expired';
  view: LiveCoordinatorView | null;
  onCopyLink: (url: string) => Promise<void>;
}

type CoordinatorRow = LiveCoordinatorView['registrants'][number];

export function LiveCoordinatorPortalScreen({ live }: { live: LiveCoordinator }) {
  const { done, fail } = useSay();
  const v = live.view;
  if (!v || live.state !== 'ready')
    return (
      <CandidateFrame brand={{ company: v?.company ?? '', candidate: '' }}>
        {live.state === 'loading' ? <p className="yx-prc-muted">Loading…</p> : <EmptyState title="This link has expired or was replaced." description="Ask the company that runs the drive for a new link." />}
      </CandidateFrame>
    );
  const n = (x: number) => x.toLocaleString('en-IN');
  const cols: TableColumn<CoordinatorRow>[] = [
    { key: 'name', header: 'Student', value: (r) => r.name, width: 200 },
    { key: 'roll', header: 'Roll number', type: 'id', value: (r) => r.rollNumber, width: 130 },
    { key: 'registration', header: 'Registration', type: 'status', value: (r) => r.registration, statusTone: (x) => (x === 'Eligible' ? 'success' : 'danger'), width: 160 },
    { key: 'test', header: 'Test', value: (r) => r.test, width: 150 },
    ...(v.resultsShown && v.visibility === 'per_candidate' ? [{ key: 'result', header: 'Result', value: (r: CoordinatorRow) => r.result ?? '', width: 130 }] : []),
  ];
  return (
    <CandidateFrame brand={{ company: v.company, candidate: v.coordinator ? `${v.coordinator} · coordinator` : 'Coordinator' }}>
      <Heading level={1}>{`${v.college} · ${v.drive}`}</Heading>
      <div className="yx-prc-grid3">
        <div className="yx-prc-box">
          <span className="yx-prc-muted">Registered</span>
          <strong>{n(v.counts.registered)}</strong>
        </div>
        <div className="yx-prc-box">
          <span className="yx-prc-muted">Eligible</span>
          <strong>{n(v.counts.eligible)}</strong>
        </div>
        <div className="yx-prc-box">
          <span className="yx-prc-muted">{v.counts.passed != null ? 'Attended · passed' : 'Attended'}</span>
          <strong>{v.counts.passed != null ? `${n(v.counts.attended)} · ${n(v.counts.passed)}` : n(v.counts.attended)}</strong>
        </div>
      </div>
      {v.visibility === 'none' && <InlineAlert tone="info">{`${v.company} shares registration and attendance only. Results are not shared with coordinators for this drive.`}</InlineAlert>}
      {v.visibility !== 'none' && !v.resultsShown && <InlineAlert tone="info">{v.visibility === 'aggregate' ? 'Results will show as counts and pass rates for your college after the drive closes. Individual scores are not shared.' : 'Each student’s result will show here after the drive closes. Scores are not shared.'}</InlineAlert>}
      <Card
        title="Share the registration link"
        actions={
          <Button size="sm" onClick={() => void live.onCopyLink(v.registrationUrl).then(() => done('Link copied'), () => fail('Copy did not work; select the link instead.'))}>
            Copy link
          </Button>
        }
      >
        <p className="yx-prc-p yx-prc-mono">{v.registrationUrl}</p>
      </Card>
      <DataTable label="Your college's registrants" columns={cols} rows={v.registrants} getRowId={(r) => `${r.rollNumber}:${r.name}`} pageSize={10} empty={<EmptyState title="No students from your college have registered yet." description="Share the registration link with them." />} />
    </CandidateFrame>
  );
}
