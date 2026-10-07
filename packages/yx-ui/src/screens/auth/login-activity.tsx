import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { DateRangePicker, type DateRange } from '../../components/date';
import { EmptyState, InlineAlert, NoAccessState, Pagination } from '../../components/feedback';
import { FormField } from '../../components/field';
import { ConfirmDialog } from '../../components/overlay';
import { Select } from '../../components/select';
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { RESULTS, deviceLabel, methodLabel, when } from './kit';
import { LoginEventsTable } from './tables';
import type { LoginEventRow, Page, PersonOption, SessionRow } from './types';

export interface LoginActivityFilters {
  result: string | null;
  method: string | null;
  userId: string | null;
  range: DateRange;
}

export const NO_FILTERS: LoginActivityFilters = { result: null, method: null, userId: null, range: { from: null, to: null } };

/** Failed attempts in the last 24 hours at or above this show a warning. */
export const FAILED_SPIKE_AT = 20;

export interface LoginActivityScreenProps {
  tab: 'events' | 'sessions';
  onTabChange: (tab: 'events' | 'sessions') => void;
  events: Page<LoginEventRow> | null;
  eventsState: 'ready' | 'loading' | 'error';
  filters: LoginActivityFilters;
  onFiltersChange: (f: LoginActivityFilters) => void;
  onEventsPage: (page: number) => void;
  /** Failed attempts across the company in the last 24 hours; null while loading. */
  failedLast24h: number | null;
  people: PersonOption[];
  sessions: Page<SessionRow> | null;
  sessionsState: 'ready' | 'loading' | 'error';
  onSessionsPage: (page: number) => void;
  onRevokeSession: (s: SessionRow) => Promise<void>;
  /** Clears a person's account lock (step-up and audit are the host's / API's). Omitted: no Unlock action. */
  onUnlock?: (row: LoginEventRow, reason: string) => Promise<void>;
  onRetry?: () => void;
  /** The API refused for a missing permission: say so, not "couldn't load". */
  noAccess?: boolean;
}

const METHOD_FILTERS = ['password', 'saml', 'oidc', 'otp_email', 'otp_sms', 'otp_whatsapp'];

/** Admin › Login activity (P12 §7, YX-IAM-06/10): the company's sign-in attempts and who is signed in now. */
export function LoginActivityScreen(props: LoginActivityScreenProps) {
  const { filters, onFiltersChange: setFilters } = props;
  const set = (patch: Partial<LoginActivityFilters>) => setFilters({ ...filters, ...patch });
  const filtered = Boolean(filters.result || filters.method || filters.userId || filters.range.from || filters.range.to);
  const spike = props.failedLast24h != null && props.failedLast24h >= FAILED_SPIKE_AT;

  if (props.noAccess) {
    return (
      <div className="yx-auth__page">
        <PageHeader title="Login activity" description="Every sign-in attempt in your company, and who is signed in now." />
        <NoAccessState grantedBy="a System Admin" what="login activity" />
      </div>
    );
  }

  return (
    <div className="yx-auth__page">
      <PageHeader
        title="Login activity"
        description="Every sign-in attempt in your company, and who is signed in now."
        facts={props.failedLast24h != null && <span>{props.failedLast24h} failed {props.failedLast24h === 1 ? 'attempt' : 'attempts'} in the last 24 hours</span>}
      />
      {spike && (
        <InlineAlert
          tone="warning"
          title={`${props.failedLast24h} failed sign-in attempts in the last 24 hours`}
          actions={<Button size="sm" onClick={() => setFilters({ ...NO_FILTERS, result: 'failed', range: { from: new Date(Date.now() - 86_400_000), to: null } })}>Show failed attempts</Button>}
        >
          This is more than usual. Accounts lock after too many wrong tries in a row and the person is emailed. Unlock someone from their row.
        </InlineAlert>
      )}
      <Tabs value={props.tab} onValueChange={(v) => props.onTabChange(v as 'events' | 'sessions')}>
        <TabsList aria-label="Login activity">
          <TabsTrigger value="events">Sign-in attempts</TabsTrigger>
          <TabsTrigger value="sessions" count={props.sessions?.total}>Signed in now</TabsTrigger>
        </TabsList>
        <TabsContent value="events">
          <div className="yx-auth__stack">
            <div className="yx-auth__filters">
              <FormField label="Person">
                <Select
                  value={filters.userId}
                  onChange={(v) => set({ userId: v })}
                  clearable
                  placeholder="Everyone"
                  options={props.people.map((p) => ({ value: p.id, label: p.name, description: p.email, keywords: [p.email] }))}
                />
              </FormField>
              <FormField label="Result">
                <Select
                  value={filters.result}
                  onChange={(v) => set({ result: v })}
                  clearable
                  placeholder="Any result"
                  options={Object.entries(RESULTS).map(([value, r]) => ({ value, label: r.label }))}
                />
              </FormField>
              <FormField label="Method">
                <Select value={filters.method} onChange={(v) => set({ method: v })} clearable placeholder="Any method" options={METHOD_FILTERS.map((m) => ({ value: m, label: methodLabel(m) }))} />
              </FormField>
              <DateRangePicker label="Dates" value={filters.range} onChange={(range) => set({ range })} max={new Date()} />
            </div>
            <LoginEventsTable
              label="Sign-in attempts"
              showPerson
              page={props.events}
              state={props.eventsState}
              onRetry={props.onRetry}
              onPageChange={props.onEventsPage}
              filtered={filtered}
              onClearFilters={() => setFilters(NO_FILTERS)}
              onUnlock={props.onUnlock}
            />
          </div>
        </TabsContent>
        <TabsContent value="sessions">
          <SessionsTable {...props} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SessionsTable({ sessions, sessionsState, onSessionsPage, onRevokeSession, onRetry }: LoginActivityScreenProps) {
  const columns: TableColumn<SessionRow>[] = [
    {
      key: 'person',
      header: 'Person',
      type: 'person',
      value: (s) => s.user?.name ?? s.user?.email ?? '',
      person: (s) => ({ name: s.user?.name ?? s.user?.email ?? 'Unknown', secondary: s.user?.name ? s.user.email : undefined }),
      width: 240,
      hideable: false,
    },
    { key: 'device', header: 'Device', value: (s) => deviceLabel(s.userAgent), width: 170 },
    {
      key: 'how',
      header: 'Signed in with',
      value: (s) => methodLabel(s.method),
      render: (s) => (
        <span className="yx-auth__badges">
          {methodLabel(s.method)}
          {s.assuranceLevel === 'aal2' ? <Badge tone="success">Two-step</Badge> : <Badge>One step</Badge>}
        </span>
      ),
      width: 220,
    },
    { key: 'seen', header: 'Last active', value: (s) => s.lastSeenAt, render: (s) => when(s.lastSeenAt), width: 190 },
    { key: 'ip', header: 'IP address', value: (s) => s.ipAddress ?? '', optional: true, width: 150 },
    { key: 'since', header: 'Signed in', value: (s) => s.createdAt, render: (s) => when(s.createdAt), optional: true, width: 190 },
  ];
  return (
    <div className="yx-auth__stack">
      <DataTable
        label="Signed in now"
        columns={columns}
        rows={sessions?.data ?? []}
        getRowId={(s) => s.id}
        state={sessionsState}
        onRetry={onRetry}
        errorTitle="We couldn't load who is signed in."
        empty={<EmptyState compact title="Nobody is signed in right now." />}
        rowButtons={(s) => (
          <ConfirmDialog
            trigger={<Button size="sm" aria-label={`Sign out ${s.user?.name ?? s.user?.email ?? 'this session'} on ${deviceLabel(s.userAgent)}`}>Sign out</Button>}
            title={`Sign out ${s.user?.name ?? s.user?.email ?? 'this person'}?`}
            consequence={`Their ${deviceLabel(s.userAgent)} session ends now and they have to sign in again. This is recorded in the audit log.`}
            confirmLabel="Sign out"
            onConfirm={() => onRevokeSession(s)}
          />
        )}
        cardSummary
      />
      {sessions && sessions.total > sessions.pageSize && <Pagination page={sessions.page} pageSize={sessions.pageSize} total={sessions.total} onPageChange={onSessionsPage} />}
    </div>
  );
}
