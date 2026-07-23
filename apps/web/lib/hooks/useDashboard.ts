import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import {
  DashboardExamPerformance,
  DashboardFunnel,
  DashboardPerformanceLimit,
  DashboardSummary,
  DashboardTrend,
  DashboardTrendDays,
  DashboardTrendMetric,
  DashboardWindow,
} from '../types';
import { useAuth } from '../auth-context';

export function useDashboardSummary() {
  const { accessToken } = useAuth();
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard-summary'],
    queryFn: () => apiFetch('/dashboard/summary', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useDashboardTrend(metric: DashboardTrendMetric, days: DashboardTrendDays) {
  const { accessToken } = useAuth();
  return useQuery<DashboardTrend>({
    queryKey: ['dashboard-trend', metric, days],
    queryFn: () => apiFetch(`/dashboard/trend?metric=${metric}&days=${days}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useDashboardExamPerformance(limit: DashboardPerformanceLimit, window: DashboardWindow) {
  const { accessToken } = useAuth();
  return useQuery<DashboardExamPerformance>({
    queryKey: ['dashboard-exam-performance', limit, window],
    queryFn: () => apiFetch(`/dashboard/exam-performance?limit=${limit}&window=${window}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useDashboardFunnel(examId: string, window: DashboardWindow) {
  const { accessToken } = useAuth();
  return useQuery<DashboardFunnel>({
    queryKey: ['dashboard-funnel', examId, window],
    queryFn: () => apiFetch(`/dashboard/funnel?examId=${examId}&window=${window}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}
