'use client';

import { useCallback } from 'react';
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
  return async <T = unknown>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> => {
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

/** A photo as an object URL the view drops when it goes; one function per sign-in, so a re-render never fetches again. */
function usePhoto(path: (id: string) => string) {
  const { accessToken } = useAuth();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the path builder is a fixed literal per hook
  return useCallback(async (id: string): Promise<string | null> => {
    const { blob } = await apiFetchBlob(path(id), {}, accessToken ?? undefined);
    return blob.size ? URL.createObjectURL(blob) : null;
  }, [accessToken]);
}

/** Answer 602: the walk-in's photo for the host's card only. */
export function useWalkInPhoto() {
  return usePhoto((id) => `/visitors/walk-ins/${encodeURIComponent(id)}/photo`);
}

/** Answer 713: the walk-in's photo for reception at the location while it waits or is on site. */
export function useDeskVisitorPhoto() {
  return usePhoto((id) => `/visitors/desk/visits/${encodeURIComponent(id)}/photo`);
}

/** Answer 603: the photo of the ID (multipart) with its type and last 4; the virus check follows. */
export function useVisitorIdImage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async (id: string, file: File, idType: string, idLast4: string) => {
    const form = new FormData();
    form.append('idType', idType);
    form.append('idLast4', idLast4);
    form.append('file', file);
    const result = await apiFetch(`/visitors/${encodeURIComponent(id)}/id-image`, { method: 'POST', body: form }, accessToken ?? undefined);
    await queryClient.invalidateQueries({ queryKey: ['visitors'] });
    return result;
  };
}

/** Opens the photo of the ID in a new tab (audited by the API; clean files only). */
export function useOpenVisitorIdImage() {
  const { accessToken } = useAuth();
  return async (id: string) => {
    const { blob } = await apiFetchBlob(`/visitors/${encodeURIComponent(id)}/id-image`, {}, accessToken ?? undefined);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
}

/** Slice 4: opens a visitors PDF (the badge, the roll-call) in a new tab for the browser to print. */
export function useOpenVisitorPdf() {
  const { accessToken } = useAuth();
  return async (path: string) => {
    const { blob } = await apiFetchBlob(`/visitors${path}`, {}, accessToken ?? undefined);
    const url = URL.createObjectURL(blob);
    // A blob link of our own page; null when the browser blocked the pop-up.
    if (!window.open(url, '_blank')) throw new Error('Allow pop-ups for this site to print.');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
