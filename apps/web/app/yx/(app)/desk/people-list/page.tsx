'use client';

import { useEffect, useState } from 'react';
import { PeopleListScreen, type DeskPerson, type DeskSummary, type DirectorySource, type ImportResult } from '@yukthix/ui/desk';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { deskState, useDesk, useDeskWrite } from '../../../../../lib/yx-desk';

// Service desk › People list (SD-1.29): people by hand or from a CSV file, and directory sync (LDAP / AD, SCIM) with
// group-to-seat rules. Needs desk.directory.manage. Directory credentials and SCIM tokens need a fresh second factor:
// apiFetch asks for it (StepUpProvider) and sends the request again.
export default function YxDeskPeopleListPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const h = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(h);
  }, [search]);
  const people = useDesk<DeskPerson[]>(`/people-list${q ? `?search=${encodeURIComponent(q)}` : ''}`, { keepPrevious: true });
  const sources = useDesk<DirectorySource[]>('/directory-sources');
  const desks = useDesk<DeskSummary[]>('/desks');
  const write = useDeskWrite();
  return (
    <PeopleListScreen
      state={deskState(people, sources)}
      onRetry={() => void Promise.all([people.refetch(), sources.refetch()])}
      people={people.data ?? []}
      search={search}
      onSearch={setSearch}
      onSavePerson={async (id, input) => {
        await write(id ? `/people-list/${encodeURIComponent(id)}` : '/people-list', id ? 'PATCH' : 'POST', input);
      }}
      onImport={(csv, dryRun) => write<ImportResult>('/people-list/import', 'POST', { csv, dryRun })}
      sources={sources.data ?? []}
      desks={(desks.data ?? []).filter((d) => d.status !== 'archived')}
      onSaveSource={async (src, input) => {
        const r = await write<{ id: string; scimToken?: string }>(src ? `/directory-sources/${encodeURIComponent(src.id)}` : '/directory-sources', src ? 'PATCH' : 'POST', input);
        // A new SCIM source: its address comes from the list (the token only from this answer).
        const scimUrl = r.scimToken ? ((await apiFetch('/desk/directory-sources', {}, token)) as DirectorySource[]).find((s) => s.id === r.id)?.scimUrl : undefined;
        return { ...r, scimUrl };
      }}
      onSyncNow={(src) => write(`/directory-sources/${encodeURIComponent(src.id)}/sync`, 'POST')}
      onNewToken={(src) => write<{ scimToken: string }>(`/directory-sources/${encodeURIComponent(src.id)}/rotate`, 'POST')}
    />
  );
}
