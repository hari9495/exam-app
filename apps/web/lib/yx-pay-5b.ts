import { useEffect, useState } from 'react';
import type { EmployeeHit, SetupEntity } from '@yukthix/ui/pay';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';

// API glue for Payroll batch 5b beyond lib/yx-pay.ts: the people search (the HR list, which already applies the
// viewer's scope) and the chosen legal entity.

export function usePeopleSearch() {
  const { accessToken } = useAuth();
  return async (q: string): Promise<EmployeeHit[]> => {
    const rows = (await apiFetch(`/people/employees${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`, {}, accessToken ?? undefined)) as {
      id: string;
      name: string;
      employeeCode: string | null;
    }[];
    return rows.slice(0, 25).map((r) => ({
      id: r.id,
      name: r.name,
      employeeCode: r.employeeCode ?? undefined,
    }));
  };
}

/** The legal entity picked on a set-up page: the first one with `key` until the person picks another. */
export function useEntityChoice(entities: SetupEntity[] | undefined, key: SetupEntity['keys'][number]) {
  const list = (entities ?? []).filter((e) => e.keys.includes(key));
  const [entityId, setEntityId] = useState<string | null>(null);
  useEffect(() => {
    if (!entityId && list.length) setEntityId(list[0].id);
  }, [list, entityId]);
  return { list, entityId, setEntityId };
}
