import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { ConsoleShell, type ConsolePageId } from './console-shell';
import { SystemLogsScreen, UserSearchScreen, type FoundUser, type LogService, type LogSeverity, type SystemLogEntry } from './lookups';

const meta: Meta = { title: 'Screens/YukthiX console/System logs and Find a user', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const shell = (active: ConsolePageId, children: React.ReactNode) => (
  <ConsoleShell active={active} name="Anand Iyer" email="anand.iyer@yukthix.test" securityHref="#" onSignOut={() => {}} onNavigate={() => {}}>
    {children}
  </ConsoleShell>
);

const LOGS: SystemLogEntry[] = [
  { id: 'l1', at: '2026-11-18T09:42:10Z', service: 'api', severity: 'error', message: 'Payslip PDF render timed out after 30 s', context: { route: '/payroll/runs/:id/payslips', requestId: 'req_8f2c' }, company: 'Kaveri Foods Pvt Ltd', companyId: 'c1' },
  { id: 'l2', at: '2026-11-18T09:15:03Z', service: 'candidate-browser', severity: 'warn', message: 'Camera stream dropped for 4 s', context: { attemptId: '6f1d0c2e', browser: 'Chrome 131' }, company: 'Deccan Logistics', companyId: 'c2' },
  { id: 'l3', at: '2026-11-18T08:01:44Z', service: 'exam-runtime', severity: 'error', message: 'Code runner returned no result', context: { attemptId: '9a77be10', language: 'python' }, company: 'Deccan Logistics', companyId: 'c2' },
  { id: 'l4', at: '2026-11-17T22:30:00Z', service: 'api', severity: 'warn', message: 'Mail server slow to accept (2.8 s)', context: null, company: null, companyId: null },
];

function Logs({ start = LOGS }: { start?: SystemLogEntry[] }) {
  const [service, setService] = useState<LogService>('all');
  const [severity, setSeverity] = useState<LogSeverity>('all');
  const rows = start.filter((e) => (service === 'all' || e.service === service) && (severity === 'all' || e.severity === severity));
  return shell('system-logs', <SystemLogsScreen state="ready" entries={rows} service={service} onService={setService} severity={severity} onSeverity={setSeverity} hasMore={start.length > 0} loadingMore={false} onLoadMore={() => {}} />);
}
export const SystemLogs: S = { name: 'System logs', render: () => <Logs /> };
export const SystemLogsEmpty: S = { name: 'System logs · nothing logged', render: () => <Logs start={[]} /> };
export const SystemLogsNoKey: S = { name: 'System logs · no key', render: () => shell('system-logs', <SystemLogsScreen state="no-access" entries={[]} service="all" onService={() => {}} severity="all" onSeverity={() => {}} hasMore={false} loadingMore={false} onLoadMore={() => {}} />) };

const USERS: FoundUser[] = [
  { id: 'u1', email: 'priya.sharma@kaveri.test', name: 'Priya Sharma', role: 'org_admin', status: 'active', lastSignIn: '2026-11-18T05:12:00Z', company: 'Kaveri Foods Pvt Ltd', companyId: 'c1' },
  { id: 'u2', email: 'priya.n@deccan.test', name: 'Priya Nair', role: 'panel', status: 'deactivated', lastSignIn: null, company: 'Deccan Logistics', companyId: 'c2' },
];

function Find({ found = USERS, searched = null as string | null }: { found?: FoundUser[]; searched?: string | null }) {
  const [q, setQ] = useState<string | null>(searched);
  return shell('users', <UserSearchScreen state="ready" searched={q} results={q ? { state: 'ready', users: found, more: false } : null} onSearch={setQ} companyHref={(id) => `#company-${id}`} />);
}
export const FindUser: S = { name: 'Find a user · before searching', render: () => <Find /> };
export const FindUserResults: S = { name: 'Find a user · results', render: () => <Find searched="priya" /> };
export const FindUserNone: S = { name: 'Find a user · no match', render: () => <Find searched="zzz@nowhere" found={[]} /> };
