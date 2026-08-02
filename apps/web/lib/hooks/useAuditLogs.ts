import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch, apiFetchBlob } from '../api-client';
import { AuditLogEntry } from '../types';
import { useAuth } from '../auth-context';

export interface AuditLogFilters {
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  action?: string;
  from?: string;
  to?: string;
  cursor?: string;
  category?: 'all' | 'change' | 'access';
}

export interface AuditLogResult {
  data: AuditLogEntry[];
  // Count of the whole filtered set, independent of the cursor page -- lets the
  // page show "showing 20 of 340" as more pages load via "Load more".
  total: number;
}

function buildQuery(filters: AuditLogFilters): string {
  const params = new URLSearchParams();
  if (filters.entityType) params.set('entityType', filters.entityType);
  if (filters.entityId) params.set('entityId', filters.entityId);
  if (filters.actorUserId) params.set('actorUserId', filters.actorUserId);
  if (filters.action) params.set('action', filters.action);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.cursor) params.set('cursor', filters.cursor);
  if (filters.category && filters.category !== 'all') params.set('category', filters.category);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function useAuditLogs(filters: AuditLogFilters) {
  const { accessToken } = useAuth();
  return useQuery<AuditLogResult>({
    queryKey: ['audit-logs', filters],
    queryFn: () => apiFetch(`/audit-logs${buildQuery(filters)}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

// Server-side export of every row matching the current filters (not just what's
// loaded on the page) -- the export button hands this the same filters (minus
// cursor, which doesn't apply to a full export).
export function useAuditLogExport() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: (filters: Omit<AuditLogFilters, 'cursor'>) =>
      apiFetchBlob(`/audit-logs/export${buildQuery(filters)}`, {}, accessToken ?? undefined),
  });
}
