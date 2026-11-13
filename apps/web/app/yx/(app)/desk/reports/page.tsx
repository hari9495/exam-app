'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  SlaDashboardScreen,
  type CustomerAccountRow,
  type CustomReport,
  type DeskSummary,
  type FunnelStep,
  type Kpi,
  type LibraryReport,
  type LoadState,
  type ReportDashboard,
  type ReportTable,
  type SlaDashboard,
  type SlaDays,
  type SlaReportTab,
  type Survey,
  type SurveyAnswer,
  type UserHit,
  type Wallboard,
  type CustomerMonthReport,
} from '@yukthix/ui/desk';
import { apiFetch, apiFetchBlob } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { deskState, useDesk, useDeskWrite } from '../../../../../lib/yx-desk';

// Helpdesk › SLAs: the designed HLP-05 SLA dashboard with `live` (Helpdesk design wiring), with the desk reports
// (SD-1.27) and NPS surveys (SD-1.26) as its tabs. Only the open tab's data is fetched. Counts only, except the
// at-risk list, which the server fills with tickets the person may open.

/** The period as India dates, today included. */
const period = (days: SlaDays) => {
  const ist = (ms: number) => new Date(ms + 5.5 * 3_600_000).toISOString().slice(0, 10);
  return { from: ist(Date.now() - (Number(days) - 1) * 86_400_000), to: ist(Date.now()) };
};

export default function YxDeskReportsPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const perms = useYxPermissions();
  const canView = perms.has('desk.report.view');
  const canSurveys = perms.has('desk.survey.manage');
  const [tab, setTab] = useState<SlaReportTab | null>(null);
  useEffect(() => {
    if (!tab && perms.data) setTab(canView ? 'sla' : 'surveys');
  }, [perms.data, tab, canView]);
  const open = tab ?? 'sla';
  const [days, setDays] = useState<SlaDays>('30');
  const [deskId, setDeskId] = useState<string | null>(null);
  const { from, to } = period(days);
  const pq = new URLSearchParams({ from, to, ...(deskId ? { deskId } : {}) }).toString();

  const on = (t: SlaReportTab, path: string) => (tab === t ? path : null);
  const desks = useDesk<DeskSummary[]>('/desks');
  // KPIs are per queue: the first one until the person picks another.
  const kpiDeskId = deskId ?? desks.data?.[0]?.id ?? null;
  const sla = useDesk<SlaDashboard>(on('sla', `/reports/sla?${pq}`), { keepPrevious: true });
  const dashboard = useDesk<ReportDashboard>(on('numbers', `/reports/dashboard?${pq}`), { keepPrevious: true });
  const kpis = useDesk<Kpi[]>(kpiDeskId ? on('kpis', `/reports/kpis/${encodeURIComponent(kpiDeskId)}?days=30`) : null);
  const library = useDesk<LibraryReport[]>(on('library', '/reports/library'));
  const funnel = useDesk<FunnelStep[]>(on('funnel', `/reports/funnel?${pq}`), { keepPrevious: true });
  const custom = useDesk<CustomReport[]>(on('mine', '/reports/custom'));
  // Answer 1844: the desk fields a report may show (only those this person sees).
  const fieldColumns = useDesk<{ value: string; label: string }[]>(on('mine', '/reports/custom/field-columns'));
  const walls = useDesk<Wallboard[]>(on('walls', '/reports/wallboards'));
  const accounts = useDesk<CustomerAccountRow[]>(on('customers', '/customers/accounts'));
  const surveys = useDesk<Survey[]>(on('surveys', '/surveys'));
  const write = useDeskWrite();

  const current = { sla, numbers: dashboard, kpis, library, funnel, mine: custom, walls, customers: accounts, surveys }[open];
  const tabState: LoadState = open === 'kpis' && !kpiDeskId ? 'ready' : deskState(current);
  const state: LoadState = perms.isError ? 'error' : !perms.data ? 'loading' : canView || canSurveys ? 'ready' : 'no-access';

  const get = <T,>(path: string) => apiFetch(`/desk${path}`, {}, token) as Promise<T>;
  const download = async (path: string, name: string) => {
    const { blob, filename } = await apiFetchBlob(`/desk${path}`, {}, token);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename ?? name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <SlaDashboardScreen
      live={{
        state,
        onRetry: () => void perms.refetch(),
        canView,
        canManage: perms.has('desk.report.manage'),
        canSurveys,
        canCustomers: perms.has('desk.customer.manage') || perms.has('desk.desk.create'),
        canAssign: perms.has('desk.ticket.assign'),
        desks: desks.data ?? [],
        tab: open,
        onTab: setTab,
        tabState,
        onRetryTab: () => void current.refetch(),
        days,
        onDays: setDays,
        deskId: open === 'kpis' ? kpiDeskId : deskId,
        onDesk: setDeskId,
        ticketsHref: '/yx/desk/tickets',
        sla: sla.data ?? null,
        onExport: () => download(`/reports/library/sla?${pq}&format=csv`, 'response-targets.csv'),
        onOpenTicket: (id) => router.push(`/yx/desk/tickets/${encodeURIComponent(id)}`),
        onLoadTeam: async (id) => (await get<{ userId: string; name: string }[]>(`/desks/${encodeURIComponent(id)}/team`)).map((m) => ({ userId: m.userId, name: m.name })),
        onReassign: async (ticket, userId) => {
          await write(`/tickets/${encodeURIComponent(ticket.id)}/assign`, 'POST', { userId });
          await sla.refetch();
        },
        dashboard: dashboard.data ?? null,
        kpis: kpis.data ?? [],
        onSetTarget: async (id, input) => {
          await write(`/reports/kpis/${encodeURIComponent(id)}/target`, 'PUT', input);
        },
        library: library.data ?? [],
        onRunReport: (key) => get<ReportTable>(`/reports/library/${encodeURIComponent(key)}?${pq}`),
        onDownloadReport: (key) => download(`/reports/library/${encodeURIComponent(key)}?${pq}&format=csv`, `${key}.csv`),
        funnel: funnel.data ?? [],
        customReports: custom.data ?? [],
        fieldColumns: fieldColumns.data ?? [],
        onSaveCustom: async (r, input) => {
          await write(r ? `/reports/custom/${encodeURIComponent(r.id)}` : '/reports/custom', r ? 'PATCH' : 'POST', r ? { ...input, version: r.version } : input);
        },
        onDeleteCustom: async (id) => {
          await write(`/reports/custom/${encodeURIComponent(id)}`, 'DELETE');
        },
        onRunCustom: (id) => get<ReportTable>(`/reports/custom/${encodeURIComponent(id)}/run`),
        onDownloadCustom: (id) => download(`/reports/custom/${encodeURIComponent(id)}/run?format=csv`, 'report.csv'),
        onSchedule: async (id, input) => {
          await write(`/reports/custom/${encodeURIComponent(id)}/schedules`, 'POST', input);
        },
        onEndSchedule: async (id) => {
          await write(`/reports/schedules/${encodeURIComponent(id)}/end`, 'POST');
        },
        onSearchUsers: (s) => get<UserHit[]>(`/users?search=${encodeURIComponent(s)}`),
        wallboards: walls.data ?? [],
        onCreateWallboard: (input) => write<{ id: string; url: string }>('/reports/wallboards', 'POST', input),
        onRevokeWallboard: async (id) => {
          await write(`/reports/wallboards/${encodeURIComponent(id)}/revoke`, 'POST');
        },
        accounts: accounts.data ?? [],
        onCustomerReport: (accountId, month) => get<CustomerMonthReport>(`/reports/customers/${encodeURIComponent(accountId)}?month=${encodeURIComponent(month)}`),
        surveys: surveys.data ?? [],
        onSaveSurvey: async (s, input) => {
          await write(s ? `/surveys/${encodeURIComponent(s.id)}` : '/surveys', s ? 'PATCH' : 'POST', s ? { ...input, version: s.version } : input);
        },
        onLoadAnswers: (id) => get<SurveyAnswer[]>(`/surveys/${encodeURIComponent(id)}/answers`),
      }}
    />
  );
}
