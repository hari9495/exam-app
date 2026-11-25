'use client';

import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { SystemLogsScreen, type LogService, type LogSeverity, type SystemLogEntry } from '@yukthix/ui/console';
import { apiFetch } from '../../../../lib/api-client';
import { useAuth } from '../../../../lib/auth-context';
import { loadState } from '../../../../lib/yx-console';

interface LogPage {
  data: SystemLogEntry[];
  nextCursor: string | null;
}

// Console › System logs (answer 2421): errors and warnings from every company, in the staff console only.
export default function ConsoleSystemLogsPage() {
  const { accessToken } = useAuth();
  const [service, setService] = useState<LogService>('all');
  const [severity, setSeverity] = useState<LogSeverity>('all');
  const filters = `${service === 'all' ? '' : `&service=${service}`}${severity === 'all' ? '' : `&severity=${severity}`}`;
  const log = useInfiniteQuery({
    queryKey: ['console', 'system-logs', service, severity],
    queryFn: ({ pageParam }): Promise<LogPage> => apiFetch(`/platform/system-logs?${pageParam ? `before=${encodeURIComponent(pageParam)}` : ''}${filters}`, {}, accessToken ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: Boolean(accessToken),
    retry: false,
  });
  return (
    <SystemLogsScreen
      state={loadState(log)}
      onRetry={() => void log.refetch()}
      entries={log.data?.pages.flatMap((p) => p.data) ?? []}
      service={service}
      onService={setService}
      severity={severity}
      onSeverity={setSeverity}
      hasMore={Boolean(log.hasNextPage)}
      loadingMore={log.isFetchingNextPage}
      onLoadMore={() => void log.fetchNextPage()}
    />
  );
}
