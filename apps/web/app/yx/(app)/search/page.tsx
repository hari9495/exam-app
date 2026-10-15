'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SearchResultsScreen } from '@yukthix/ui/frame';
import { useWorkspaceSearch } from '../../../../lib/yx-shell';
import { toSearchHits } from '../../../../lib/yx-me-pages';

// Search results (PLT-21, design audit step 2): "Search all" from Ctrl K. The API returns only what the person may open.
function Results() {
  const router = useRouter();
  const q = useSearchParams()?.get('q') ?? '';
  const search = useWorkspaceSearch(q);
  const waiting = q.trim().length >= 2 && (search.loading || !search.data);
  return <SearchResultsScreen query={q} hits={toSearchHits(search.data)} state={waiting ? 'loading' : 'ready'} live={{ onOpen: (h) => h.href && router.push(h.href) }} />;
}

export default function YxSearchPage() {
  return (
    <Suspense>
      <Results />
    </Suspense>
  );
}
