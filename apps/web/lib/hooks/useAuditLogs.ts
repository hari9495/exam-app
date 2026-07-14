import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { AuditLogEntry } from '../types';
import { useAuth } from '../auth-context';

export interface AuditLogFilters {
  entityType?: string;
  actorUserId?: string;
  action?: string;
  from?: string;
  to?: string;
  cursor?: string;
}

function buildQuery(filters: AuditLogFilters): string {
  const params = new URLSearchParams();
  if (filters.entityType) params.set('entityType', filters.entityType);
  if (filters.actorUserId) params.set('actorUserId', filters.actorUserId);
  if (filters.action) params.set('action', filters.action);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.cursor) params.set('cursor', filters.cursor);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function useAuditLogs(filters: AuditLogFilters) {
  const { accessToken } = useAuth();
  return useQuery<AuditLogEntry[]>({
    queryKey: ['audit-logs', filters],
    queryFn: () => apiFetch(`/audit-logs${buildQuery(filters)}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}
