import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import {
  DashboardAnalytics,
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

export function useDashboardSummary(window: DashboardWindow) {
  const { accessToken } = useAuth();
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard-summary', window],
    queryFn: () => apiFetch(`/dashboard/summary?window=${window}`, {}, accessToken ?? undefined),
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

export interface AnalyticsFilters {
  window: DashboardWindow;
  examId?: string;
  candidateId?: string;
  from?: string;
  to?: string;
}

export function useDashboardAnalytics(filters: AnalyticsFilters) {
  const { accessToken } = useAuth();
  const query = new URLSearchParams();
  // An explicit from/to custom range wins over the relative window.
  if (filters.from || filters.to) {
    if (filters.from) query.set('from', filters.from);
    if (filters.to) query.set('to', filters.to);
  } else {
    query.set('window', filters.window);
  }
  if (filters.examId) query.set('examId', filters.examId);
  if (filters.candidateId) query.set('candidateId', filters.candidateId);
  return useQuery<DashboardAnalytics>({
    queryKey: ['dashboard-analytics', filters],
    queryFn: () => apiFetch(`/dashboard/analytics?${query.toString()}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}
