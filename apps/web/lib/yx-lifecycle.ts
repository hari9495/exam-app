import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { JoinerPlaces, JourneyTask, TaskActions } from '@yukthix/ui/lifecycle';
import type { LegalEntity, MasterRecord, OrgLocation } from '@yukthix/ui/org';
import type { PersonOption } from '@yukthix/ui/history';
import { apiFetch, apiFetchBlob } from './api-client';
import { useAuth } from './auth-context';
import { useOrg } from './yx-org';
import { usePeople } from './yx-people';
import { saveBlob } from './yx-pay';

// API glue for lifecycle batch 6a (/lifecycle/*, /documents/*). The screens in @yukthix/ui/lifecycle stay
// presentational; the API checks every call (keys, the joiner's planned place, the task's owner, data classes).

/** One GET, cached under ['lifecycle', path]. */
export function useLife<T>(path: string | null) {
  const { accessToken } = useAuth();
  return useQuery<T>({ queryKey: ['lifecycle', path], queryFn: () => apiFetch(path!, {}, accessToken ?? undefined), enabled: Boolean(accessToken && path), retry: false });
}

/** A write under /lifecycle or /documents; refreshes every lifecycle query. */
export function useLifeWrite() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async <T = unknown>(method: 'POST' | 'PUT', path: string, body?: unknown): Promise<T> => {
    const result = await apiFetch(path, { method, ...(body === undefined ? {} : body instanceof FormData ? { body } : { body: JSON.stringify(body) }) }, accessToken ?? undefined);
    await queryClient.invalidateQueries({ queryKey: ['lifecycle'] });
    return result as T;
  };
}

/** Downloads a document's file with the person's token, as the browser's own download. */
export function useDocumentDownload() {
  const { accessToken } = useAuth();
  return async (documentId: string, fallbackName: string) => {
    const { blob, filename } = await apiFetchBlob(`/documents/${encodeURIComponent(documentId)}/file`, {}, accessToken ?? undefined);
    saveBlob(blob, filename ?? fallbackName);
  };
}

/** Complete, skip and (HR, on one person's checklist) upload actions on checklist tasks. */
export function useTaskActions(personId?: string | null): TaskActions {
  const write = useLifeWrite();
  return {
    onComplete: (t: JourneyTask, payload) => write('POST', `/lifecycle/tasks/${encodeURIComponent(t.id)}/complete`, { version: t.version, ...payload }),
    onSkip: (t: JourneyTask, reason: string) => write('POST', `/lifecycle/tasks/${encodeURIComponent(t.id)}/skip`, { version: t.version, reason }),
    ...(personId
      ? {
          onUpload: (t: JourneyTask, file: File) => {
            const form = new FormData();
            form.append('file', file);
            return write('POST', `/documents/people/${encodeURIComponent(personId)}/${encodeURIComponent(t.documentType ?? '')}`, form);
          },
        }
      : {}),
  };
}

/** Entities, their locations, the structure masters and current employees as managers, for "Add joiner". */
export function useJoinerPlaces(enabled: boolean): JoinerPlaces {
  const entities = useOrg<LegalEntity[]>('/legal-entities', enabled);
  const locations = useOrg<OrgLocation[]>('/locations', enabled);
  const departments = useOrg<MasterRecord[]>('/masters/departments', enabled);
  const designations = useOrg<MasterRecord[]>('/masters/designations', enabled);
  const types = useOrg<MasterRecord[]>('/masters/employment-types', enabled);
  const people = usePeople<PersonOption[]>(enabled ? '/employees' : null);
  const live = <T extends { archivedAt?: string | null }>(rows: T[] | undefined) => (rows ?? []).filter((r) => !r.archivedAt);
  return {
    entities: live(entities.data).map((e) => ({ value: e.id, label: e.name })),
    locations: live(locations.data).map((l) => ({ value: l.id, label: l.name, entityId: l.legalEntityId })),
    departments: live(departments.data).map((m) => ({ value: m.id, label: m.name })),
    designations: live(designations.data).map((m) => ({ value: m.id, label: m.name })),
    employmentTypes: live(types.data).map((m) => ({ value: m.id, label: m.name })),
    managers: (people.data ?? []).map((p) => ({ value: p.id, label: [p.name, p.designation].filter(Boolean).join(', ') })),
  };
}
