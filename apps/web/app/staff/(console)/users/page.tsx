'use client';

import { useState } from 'react';
import { UserSearchScreen, type FoundUser } from '@yukthix/ui/console';
import { loadState, useConsole } from '../../../../lib/yx-console';

// Console › Find a user (answer 2431): a user of any company by email or name; the API audits every search.
export default function ConsoleUsersPage() {
  const [q, setQ] = useState<string | null>(null);
  const found = useConsole<{ data: FoundUser[]; more: boolean }>(`/users?q=${encodeURIComponent(q ?? '')}`, q !== null);
  const state = q === null ? null : loadState(found);
  return (
    <UserSearchScreen
      // Without the key the first search answers 403: the page then says who grants it.
      state={state === 'no-access' ? 'no-access' : 'ready'}
      searched={q}
      results={state === null ? null : { state, users: found.data?.data ?? [], more: Boolean(found.data?.more) }}
      onSearch={setQ}
      onRetry={() => void found.refetch()}
      companyHref={(id) => `/staff/companies/${id}`}
    />
  );
}
