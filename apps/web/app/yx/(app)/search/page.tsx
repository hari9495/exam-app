'use client';

import { Suspense, useContext, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MobileSearchScreen, SearchResultsScreen } from '@yukthix/ui/frame';
import { YxNavContext, useWorkspaceSearch } from '../../../../lib/yx-shell';
import { homeQuickActions, usePhone } from '../../../../lib/yx-phone';
import { toSearchHits } from '../../../../lib/yx-me-pages';

// Search results (PLT-21, design audit step 2): "Search all" from Ctrl K. The API returns only what the person may open.
function Results() {
  const router = useRouter();
  const q = useSearchParams()?.get('q') ?? '';
  const phone = usePhone();
  const { nav } = useContext(YxNavContext);
  // T2-H: on a phone the designed full-screen search searches as the person types (the same workspace search).
  const [typed, setTyped] = useState(q);
  const search = useWorkspaceSearch(phone ? typed : q);
  const waiting = q.trim().length >= 2 && (search.loading || !search.data);
  if (phone)
    return (
      <MobileSearchScreen
        query={q}
        hits={toSearchHits(search.data)}
        live={{
          onQueryChange: setTyped,
          loading: search.loading,
          onOpen: (h) => h.href && router.push(h.href),
          suggested: homeQuickActions(nav).flatMap((a) => (a.kind === 'fix' ? [] : [{ label: a.kind === 'expense' ? 'New expense claim' : a.label, href: a.href, kind: a.kind }])),
          onNavigate: (href) => router.push(href),
        }}
      />
    );
  return <SearchResultsScreen query={q} hits={toSearchHits(search.data)} state={waiting ? 'loading' : 'ready'} live={{ onOpen: (h) => h.href && router.push(h.href) }} />;
}

export default function YxSearchPage() {
  return (
    <Suspense>
      <Results />
    </Suspense>
  );
}
