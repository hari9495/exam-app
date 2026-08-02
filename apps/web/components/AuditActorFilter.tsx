'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { useUsers } from '../lib/hooks/useUsers';
import { Input } from './ui';

interface AuditActorFilterProps {
  actorUserId: string | undefined;
  actorLabel: string | undefined;
  onChange: (actorUserId: string | undefined, actorLabel: string | undefined) => void;
}

// Search-by-name/email replacement for the old "Actor User ID" text box, which
// asked recruiters to paste a UUID nobody has memorized. Once an actor is
// picked, the input is replaced by a chip -- same "picked filter" pattern as
// the entity-history chip on this page.
export function AuditActorFilter({ actorUserId, actorLabel, onChange }: AuditActorFilterProps) {
  const [search, setSearch] = useState('');
  const { data } = useUsers({ search: search.trim() || undefined, pageSize: 10 });
  const results = search.trim() ? (data?.data ?? []) : [];

  if (actorUserId) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-gray-700">Actor</span>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-recruiter-border bg-recruiter-bg-subtle px-3 py-2 text-sm text-recruiter-text">
          {actorLabel ?? actorUserId}
          <button
            type="button"
            onClick={() => onChange(undefined, undefined)}
            aria-label="Clear actor filter"
            className="text-recruiter-text-tertiary hover:text-recruiter-text"
          >
            <X size={14} />
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input label="Actor" placeholder="Search staff by name or email…" value={search} onChange={setSearch} />
      {results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-56 w-64 overflow-y-auto rounded-md border border-recruiter-border bg-white py-1 shadow-md">
          {results.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(user.id, user.name ?? user.email);
                  setSearch('');
                }}
                className="block w-full px-3 py-1.5 text-left text-sm text-recruiter-text hover:bg-recruiter-bg-subtle"
              >
                {user.name ?? user.email}
                {user.name && <span className="ml-1 text-xs text-recruiter-text-tertiary">{user.email}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
