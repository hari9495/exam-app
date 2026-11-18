import { useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import { Badge } from '../../components/display';
import { Button, Link } from '../../components/button';
import { EmptyState } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextField } from '../../components/inputs';
import { Segment } from '../../components/segment';
import { DataTable, type TableColumn } from '../../components/table';
import { ConsolePage, when } from './console-kit';
import type { LoadState } from './types';

// Retire /v2 (answers 2421 and 2431): system logs and a user search across companies, in the staff console only.
// Presentational: the API checks the console keys and audits every read (the searched text too).

export interface SystemLogEntry {
  id: string;
  at: string;
  service: 'api' | 'exam-runtime' | 'candidate-browser' | string;
  severity: 'error' | 'warn' | string;
  message: string;
  context: Record<string, unknown> | null;
  company: string | null;
  companyId: string | null;
}

export type LogService = 'all' | 'api' | 'exam-runtime' | 'candidate-browser';
export type LogSeverity = 'all' | 'error' | 'warn';

export interface SystemLogsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  entries: SystemLogEntry[];
  service: LogService;
  onService: (v: LogService) => void;
  severity: LogSeverity;
  onSeverity: (v: LogSeverity) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

const SERVICE: Record<string, string> = { api: 'API', 'exam-runtime': 'Exam runtime', 'candidate-browser': 'Candidate browser' };
/** The context in one line, e.g. "attemptId: 6f…, route: /attempts" (values cut at 60 characters). */
const contextLine = (c: Record<string, unknown> | null) =>
  c
    ? Object.entries(c)
        .map(([k, v]) => `${k}: ${String(typeof v === 'object' ? JSON.stringify(v) : v).slice(0, 60)}`)
        .join(', ')
    : '';

/** Console › System logs: errors and warnings from the API, the exam runtime and candidates' browsers, every company. */
export function SystemLogsScreen(p: SystemLogsScreenProps) {
  const columns: TableColumn<SystemLogEntry>[] = [
    { key: 'at', header: 'When', value: (e) => e.at, render: (e) => when(e.at), width: 180, hideable: false },
    { key: 'severity', header: 'Level', value: (e) => e.severity, render: (e) => <Badge tone={e.severity === 'error' ? 'danger' : 'warning'}>{e.severity === 'error' ? 'Error' : 'Warning'}</Badge>, width: 110 },
    { key: 'service', header: 'Where', value: (e) => SERVICE[e.service] ?? e.service, width: 160 },
    {
      key: 'message',
      header: 'What happened',
      value: (e) => e.message,
      render: (e) => (
        <span className="yx-auth__item-main">
          <Text>{e.message}</Text>
          {e.context && <Text tone="secondary" size="sm">{contextLine(e.context)}</Text>}
        </span>
      ),
      width: 420,
    },
    { key: 'company', header: 'Company', value: (e) => e.company ?? 'No company', width: 200, optional: true },
  ];
  return (
    <ConsolePage crumb="System logs" title="System logs" description="Errors and warnings from the API, the exam runtime and candidates' browsers, for every company. Kept for 90 days." state={p.state} onRetry={p.onRetry} what="the system logs">
      <DataTable
        label="System logs"
        columns={columns}
        rows={p.entries}
        getRowId={(e) => e.id}
        rowNoun={['entry', 'entries']}
        cardSummary
        toolbar={
          <div className="yx-console__filters">
            <Segment<LogSeverity> label="Level" options={[{ value: 'all', label: 'All' }, { value: 'error', label: 'Errors' }, { value: 'warn', label: 'Warnings' }]} value={p.severity} onChange={p.onSeverity} />
            <Segment<LogService>
              label="Where"
              options={[{ value: 'all', label: 'Everywhere' }, { value: 'api', label: 'API' }, { value: 'exam-runtime', label: 'Exam runtime' }, { value: 'candidate-browser', label: 'Candidate browser' }]}
              value={p.service}
              onChange={p.onService}
            />
          </div>
        }
        filtered={p.service !== 'all' || p.severity !== 'all'}
        onClearFilters={() => {
          p.onService('all');
          p.onSeverity('all');
        }}
        empty={<EmptyState compact title="Nothing logged. No errors or warnings yet." />}
      />
      {p.hasMore && (
        <div>
          <Button loading={p.loadingMore} onClick={p.onLoadMore}>
            Show older entries
          </Button>
        </div>
      )}
    </ConsolePage>
  );
}

export interface FoundUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  lastSignIn: string | null;
  company: string | null;
  companyId: string | null;
}

export interface UserSearchScreenProps {
  /** The page itself (the console key); 'ready' when the search may be used. */
  state: LoadState;
  /** The last search sent, or null before the first. */
  searched: string | null;
  /** The results of `searched` (loading while it runs). */
  results: { state: LoadState; users: FoundUser[]; more: boolean } | null;
  onSearch: (q: string) => void;
  onRetry?: () => void;
  /** Where a company's page is (the companies screen). */
  companyHref: (companyId: string) => string;
}

const ROLE: Record<string, string> = { org_admin: 'System admin', recruiter: 'Recruiter', panel: 'Staff', candidate: 'Candidate' };

/** Console › Find a user: a user of any company by email or name (at least 3 characters); every search is audited. */
export function UserSearchScreen(p: UserSearchScreenProps) {
  const [q, setQ] = useState(p.searched ?? '');
  const [why, setWhy] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = q.trim();
    // Pressed too early it says why.
    if (text.length < 3) return void setWhy('Type at least 3 characters of an email address or a name.');
    if (/[%_\\]/.test(text)) return void setWhy('Search with letters, digits, @ and dots.');
    setWhy(null);
    p.onSearch(text);
  };
  const columns: TableColumn<FoundUser>[] = [
    { key: 'name', header: 'Name', value: (u) => u.name ?? u.email, render: (u) => <span className="yx-auth__item-main"><Text>{u.name || u.email}</Text>{u.name && <Text tone="secondary" size="sm">{u.email}</Text>}</span>, width: 280, hideable: false },
    { key: 'company', header: 'Company', value: (u) => u.company ?? '', render: (u) => (u.companyId ? <Link href={p.companyHref(u.companyId)}>{u.company}</Link> : u.company), width: 220 },
    { key: 'role', header: 'Role', value: (u) => ROLE[u.role] ?? u.role, width: 140 },
    { key: 'status', header: 'Status', value: (u) => u.status, render: (u) => <Badge tone={u.status === 'active' ? 'success' : 'neutral'}>{u.status === 'active' ? 'Active' : 'Deactivated'}</Badge>, width: 130 },
    { key: 'last', header: 'Last sign-in', value: (u) => u.lastSignIn, render: (u) => (u.lastSignIn ? when(u.lastSignIn) : 'Never'), width: 180, optional: true },
  ];
  return (
    <ConsolePage crumb="Find a user" title="Find a user" description="Find a user of any company by email address or name, for a support request. Every search is in the audit log." state={p.state} onRetry={p.onRetry} what="the user search">
      <form className="yx-console__search" role="search" onSubmit={submit}>
        <FormField id="console-user-q" className="yx-console__filter" label="Email or name" error={why ?? undefined}>
          <TextField value={q} onChange={setQ} prefix={<Search size={16} aria-hidden />} placeholder="e.g. priya@kaveri" autoComplete="off" />
        </FormField>
        <span>
          <Button type="submit" variant="primary" loading={p.results?.state === 'loading'}>
            Search
          </Button>
        </span>
      </form>
      {p.results && p.searched && (
        <DataTable
          label={`Users matching “${p.searched}”`}
          columns={columns}
          rows={p.results.users}
          getRowId={(u) => u.id}
          rowNoun={['user', 'users']}
          state={p.results.state === 'loading' ? 'loading' : p.results.state === 'ready' ? 'ready' : 'error'}
          onRetry={p.onRetry}
          cardSummary
          empty={<EmptyState compact title={`No user matches “${p.searched}”.`} description="Check the spelling, or search with part of the email address." />}
        />
      )}
      {p.results?.more && <Text tone="secondary">Showing the first 50. Type more of the email address to narrow it down.</Text>}
    </ConsolePage>
  );
}
