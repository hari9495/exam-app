'use client';

import { useEffect, useState } from 'react';
import {
  ReportsScreen,
  type CustomerAccountRow,
  type CustomReport,
  type CustomerMonthReport,
  type DeskSummary,
  type FunnelStep,
  type Kpi,
  type LibraryReport,
  type LoadState,
  type ReportDashboard,
  type ReportPeriod,
  type ReportsTab,
  type ReportTable,
  type Survey,
  type SurveyAnswer,
  type UserHit,
  type Wallboard,
} from '@yukthix/ui/desk';
import { apiFetch, apiFetchBlob } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { deskState, useDesk, useDeskWrite } from '../../../../../lib/yx-desk';

// Service desk › Reports (SD-1.27) and NPS surveys (SD-1.26). Only the open tab's data is fetched. Counts only; a
// custom report lists only tickets the person may see (the server builds every row and every CSV).

const iso = (d: Date) => d.toISOString().slice(0, 10);
const periodQuery = (p: ReportPeriod) => new URLSearchParams({ from: p.from, to: p.to, ...(p.deskId ? { deskId: p.deskId } : {}) }).toString();

export default function YxDeskReportsPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const perms = useYxPermissions();
  const canView = perms.has('desk.report.view');
  const canSurveys = perms.has('desk.survey.manage');
  const [tab, setTab] = useState<ReportsTab | null>(null);
  useEffect(() => {
    if (!tab && perms.data) setTab(canView ? 'dashboard' : 'surveys');
  }, [perms.data, tab, canView]);
  const open = tab ?? 'dashboard';
  const [period, setPeriod] = useState<ReportPeriod>(() => ({ deskId: null, from: iso(new Date(Date.now() - 29 * 86_400_000)), to: iso(new Date()) }));
  const pq = periodQuery(period);
  const [kpiDeskId, setKpiDeskId] = useState<string | null>(null);

  const on = (t: ReportsTab, path: string) => (tab === t ? path : null);
  const desks = useDesk<DeskSummary[]>('/desks');
  useEffect(() => {
    if (!kpiDeskId && desks.data?.length) setKpiDeskId(desks.data[0].id);
  }, [desks.data, kpiDeskId]);
  const dashboard = useDesk<ReportDashboard>(on('dashboard', `/reports/dashboard?${pq}`), { keepPrevious: true });
  const kpis = useDesk<Kpi[]>(kpiDeskId ? on('kpis', `/reports/kpis/${encodeURIComponent(kpiDeskId)}?days=30`) : null);
  const library = useDesk<LibraryReport[]>(on('library', '/reports/library'));
  const funnel = useDesk<FunnelStep[]>(on('funnel', `/reports/funnel?${pq}`), { keepPrevious: true });
  const custom = useDesk<CustomReport[]>(on('mine', '/reports/custom'));
  const walls = useDesk<Wallboard[]>(on('walls', '/reports/wallboards'));
  const accounts = useDesk<CustomerAccountRow[]>(on('customers', '/customers/accounts'));
  const surveys = useDesk<Survey[]>(on('surveys', '/surveys'));
  const write = useDeskWrite();

  const current = { dashboard, kpis, library, funnel, mine: custom, walls, customers: accounts, surveys }[open];
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
    <ReportsScreen
      state={state}
      onRetry={() => void perms.refetch()}
      canView={canView}
      canManage={perms.has('desk.report.manage')}
      canSurveys={canSurveys}
      canCustomers={perms.has('desk.customer.manage') || perms.has('desk.desk.create')}
      desks={desks.data ?? []}
      tab={open}
      onTab={setTab}
      tabState={tabState}
      onRetryTab={() => void current.refetch()}
      period={period}
      onPeriod={setPeriod}
      dashboard={dashboard.data ?? null}
      kpiDeskId={kpiDeskId}
      onKpiDesk={setKpiDeskId}
      kpis={kpis.data ?? []}
      onSetTarget={async (deskId, input) => {
        await write(`/reports/kpis/${encodeURIComponent(deskId)}/target`, 'PUT', input);
      }}
      library={library.data ?? []}
      onRunReport={(key) => get<ReportTable>(`/reports/library/${encodeURIComponent(key)}?${pq}`)}
      onDownloadReport={(key) => download(`/reports/library/${encodeURIComponent(key)}?${pq}&format=csv`, `${key}.csv`)}
      funnel={funnel.data ?? []}
      customReports={custom.data ?? []}
      onSaveCustom={async (r, input) => {
        await write(r ? `/reports/custom/${encodeURIComponent(r.id)}` : '/reports/custom', r ? 'PATCH' : 'POST', r ? { ...input, version: r.version } : input);
      }}
      onDeleteCustom={async (id) => {
        await write(`/reports/custom/${encodeURIComponent(id)}`, 'DELETE');
      }}
      onRunCustom={(id) => get<ReportTable>(`/reports/custom/${encodeURIComponent(id)}/run`)}
      onDownloadCustom={(id) => download(`/reports/custom/${encodeURIComponent(id)}/run?format=csv`, 'report.csv')}
      onSchedule={async (id, input) => {
        await write(`/reports/custom/${encodeURIComponent(id)}/schedules`, 'POST', input);
      }}
      onEndSchedule={async (id) => {
        await write(`/reports/schedules/${encodeURIComponent(id)}/end`, 'POST');
      }}
      onSearchUsers={(s) => get<UserHit[]>(`/users?search=${encodeURIComponent(s)}`)}
      wallboards={walls.data ?? []}
      onCreateWallboard={(input) => write<{ id: string; url: string }>('/reports/wallboards', 'POST', input)}
      onRevokeWallboard={async (id) => {
        await write(`/reports/wallboards/${encodeURIComponent(id)}/revoke`, 'POST');
      }}
      accounts={accounts.data ?? []}
      onCustomerReport={(accountId, month) => get<CustomerMonthReport>(`/reports/customers/${encodeURIComponent(accountId)}?month=${encodeURIComponent(month)}`)}
      surveys={surveys.data ?? []}
      onSaveSurvey={async (s, input) => {
        await write(s ? `/surveys/${encodeURIComponent(s.id)}` : '/surveys', s ? 'PATCH' : 'POST', s ? { ...input, version: s.version } : input);
      }}
      onLoadAnswers={(id) => get<SurveyAnswer[]>(`/surveys/${encodeURIComponent(id)}/answers`)}
    />
  );
}
