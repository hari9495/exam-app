import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';

export interface SystemEventEntry {
  id: string;
  organizationId: string | null;
  service: string;
  severity: string;
  message: string;
  context: Record<string, unknown> | null;
  occurredAt: string;
}

export interface SystemEventFilters {
  service?: string;
  severity?: string;
  from?: string;
  to?: string;
  attemptId?: string;
  cursor?: string;
}

export interface SystemEventsResult {
  data: SystemEventEntry[];
  total: number;
}

function buildQuery(filters: SystemEventFilters): string {
  const params = new URLSearchParams();
  if (filters.service) params.set('service', filters.service);
  if (filters.severity) params.set('severity', filters.severity);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.attemptId) params.set('attemptId', filters.attemptId);
  if (filters.cursor) params.set('cursor', filters.cursor);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function useSystemEvents(filters: SystemEventFilters, options: { enabled?: boolean } = {}) {
  const { accessToken } = useAuth();
  return useQuery<SystemEventsResult>({
    queryKey: ['system-events', filters],
    queryFn: () => apiFetch(`/system-events${buildQuery(filters)}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && (options.enabled ?? true),
    // The per-candidate timeline embeds this on the report page for viewers who may lack
    // audit:view -- a 403 there should silently hide the section, not error-loop.
    retry: false,
  });
}
