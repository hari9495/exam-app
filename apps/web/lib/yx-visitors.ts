'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchBlob } from './api-client';
import { useAuth } from './auth-context';
import { saveBlob } from './yx-pay';

// Visitors slice 1 (M02 §B11): reads under ['visitors', path]; a write refreshes every visitors view.
export function useVisitors<T>(path: string | null, refetchInterval?: number) {
  const { accessToken } = useAuth();
  return useQuery<T>({ queryKey: ['visitors', path], queryFn: () => apiFetch(`/visitors${path}`, {}, accessToken ?? undefined), enabled: Boolean(accessToken && path !== null), retry: false, ...(refetchInterval ? { refetchInterval } : {}) });
}

export function useVisitorsWrite() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async <T = unknown>(method: 'POST' | 'PUT', path: string, body?: unknown): Promise<T> => {
    const result = await apiFetch(`/visitors${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, accessToken ?? undefined);
    await queryClient.invalidateQueries({ queryKey: ['visitors'] });
    return result as T;
  };
}

/** One read under /visitors, now (host search, what a visitor accepts). */
export function useVisitorsGet() {
  const { accessToken } = useAuth();
  return <T,>(path: string): Promise<T> => apiFetch(`/visitors${path}`, {}, accessToken ?? undefined) as Promise<T>;
}

/** Answer 602: the walk-in's photo for the host's card only, as an object URL the card drops when it goes. */
export function useWalkInPhoto() {
  const { accessToken } = useAuth();
  return async (id: string): Promise<string | null> => {
    const { blob } = await apiFetchBlob(`/visitors/walk-ins/${encodeURIComponent(id)}/photo`, {}, accessToken ?? undefined);
    return blob.size ? URL.createObjectURL(blob) : null;
  };
}

/** The visitor log as CSV for an audit (VIS-04 "Export for audit"). */
export function useVisitorLogCsv() {
  const { accessToken } = useAuth();
  return async (locationId?: string | null) => {
    const { blob, filename } = await apiFetchBlob(`/visitors/log.csv${locationId ? `?locationId=${encodeURIComponent(locationId)}` : ''}`, {}, accessToken ?? undefined);
    saveBlob(blob, filename ?? 'visitor-log.csv');
  };
}

export interface VisitorOptions {
  locations: { value: string; label: string }[];
  desk: { value: string; label: string }[];
  log: { value: string; label: string }[];
  canSettings: boolean;
  acting: boolean;
}
