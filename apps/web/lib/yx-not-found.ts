import { useSyncExternalStore } from 'react';

// Answer 947: the API sends a reference with every 404 to a signed-in person. The latest one is kept with the page it
// came on, and the kit's "Not found" states on that page show it (NotFoundReferenceContext in the app frame).

let latest: { path: string; reference: string } | null = null;
const listeners = new Set<() => void>();

export const NOT_FOUND_REFERENCE = /^NF-[A-HJ-NP-Z2-9]{6}$/;

export function noteNotFound(reference: unknown) {
  if (typeof reference !== 'string' || !NOT_FOUND_REFERENCE.test(reference) || typeof window === 'undefined') return;
  latest = { path: window.location.pathname, reference };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
const snapshot = () => latest;

/** The reference of the latest Not found answer on this page, or null (one from another page never shows). */
export function useNotFoundReference(pathname: string): string | null {
  const last = useSyncExternalStore(subscribe, snapshot, () => null);
  return last && last.path === pathname ? last.reference : null;
}
