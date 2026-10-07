'use client';

import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { PlatformAuditScreen, type PlatformAuditEntry } from '@yukthix/ui/console';
import { apiFetch } from '../../../../lib/api-client';
import { useAuth } from '../../../../lib/auth-context';
import { loadState } from '../../../../lib/yx-console';

interface AuditPage {
  data: PlatformAuditEntry[];
  nextCursor: string | null;
}

// Console › Audit log (P14 YX-CONSOLE-02, P12 YX-SECOPS-08).
export default function ConsoleAuditPage() {
  const { accessToken } = useAuth();
  const [reads, setReads] = useState(false);
  const log = useInfiniteQuery({
    queryKey: ['console', 'audit', reads],
    queryFn: ({ pageParam }): Promise<AuditPage> => apiFetch(`/platform/audit?reads=${reads}${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''}`, {}, accessToken ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: Boolean(accessToken),
    retry: false,
  });
  return (
    <PlatformAuditScreen
      state={loadState(log)}
      onRetry={() => void log.refetch()}
      entries={log.data?.pages.flatMap((p) => p.data) ?? []}
      includeReads={reads}
      onIncludeReadsChange={setReads}
      hasMore={Boolean(log.hasNextPage)}
      loadingMore={log.isFetchingNextPage}
      onLoadMore={() => void log.fetchNextPage()}
    />
  );
}
