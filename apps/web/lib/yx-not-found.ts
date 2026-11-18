import { useSyncExternalStore } from 'react';
import { latestNotFound, subscribeNotFound } from './yx-not-found-store';

// Answer 947: the kit's "Not found" states on a page show the reference of the latest Not found answer on that page
// (NotFoundReferenceContext in the app frame). The store itself is in yx-not-found-store.ts (no React, server-safe).
export { NOT_FOUND_REFERENCE, noteNotFound } from './yx-not-found-store';

/** The reference of the latest Not found answer on this page, or null (one from another page never shows). */
export function useNotFoundReference(pathname: string): string | null {
  const last = useSyncExternalStore(subscribeNotFound, latestNotFound, () => null);
  return last && last.path === pathname ? last.reference : null;
}
