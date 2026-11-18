// Answer 947: the API sends a reference with every 404 to a signed-in person. The latest one is kept with the page it
// came on. No React here: api-client (used by server routes and pages too) imports noteNotFound, and React's client
// hooks may not reach a Server Component. The hook that reads it is in yx-not-found.ts.

let latest: { path: string; reference: string } | null = null;
const listeners = new Set<() => void>();

export const NOT_FOUND_REFERENCE = /^NF-[A-HJ-NP-Z2-9]{6}$/;

export function noteNotFound(reference: unknown) {
  if (typeof reference !== 'string' || !NOT_FOUND_REFERENCE.test(reference) || typeof window === 'undefined') return;
  latest = { path: window.location.pathname, reference };
  listeners.forEach((l) => l());
}

export const subscribeNotFound = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
export const latestNotFound = () => latest;
