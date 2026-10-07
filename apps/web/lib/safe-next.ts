// The `next` path a sign-in returns to: a same-site, relative path only (never an open redirect).
// Anything else (absolute, protocol-relative, backslash tricks) is dropped and the normal landing applies.
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  const base = 'https://same-site.invalid';
  try {
    // The URL parser strips tabs and newlines, so "/\t/evil.example" is caught here too.
    const url = new URL(raw, base);
    return url.origin === base ? url.pathname + url.search + url.hash : null;
  } catch {
    return null;
  }
}

/** The validated `next` from the current address, if any. */
export const nextFromLocation = (): string | null =>
  typeof window === 'undefined' ? null : safeNextPath(new URLSearchParams(window.location.search).get('next'));

// Sign-in pages are never a place to come back to.
const SIGN_IN_PAGES = /^\/(yx|staff)\/sign-in(\/|$)|^\/login(\/|$)/;

/** `path` (a sign-in page) with ?next= this page, when this page is somewhere worth returning to. */
export function withNextHere(path: string): string {
  if (typeof window === 'undefined' || SIGN_IN_PAGES.test(window.location.pathname)) return path;
  const here = safeNextPath(window.location.pathname + window.location.search + window.location.hash);
  return here ? `${path}?next=${encodeURIComponent(here)}` : path;
}

// A round trip to Google / Microsoft / the company's sign-in page loses the address bar: the `next`
// waits in this tab's sessionStorage and is validated again when it is read back.
const PENDING_NEXT = 'yx.signInNext';

export function keepNextForRoundTrip(): void {
  try {
    const next = nextFromLocation();
    if (next) window.sessionStorage.setItem(PENDING_NEXT, next);
    else window.sessionStorage.removeItem(PENDING_NEXT);
  } catch {
    // storage blocked: the normal landing applies
  }
}

/** Where a finished sign-in goes back to: ?next= in the address, else the one kept for the round trip. */
export function takeNext(): string | null {
  let kept: string | null = null;
  try {
    kept = window.sessionStorage.getItem(PENDING_NEXT);
    window.sessionStorage.removeItem(PENDING_NEXT);
  } catch {
    // storage blocked
  }
  return nextFromLocation() ?? safeNextPath(kept);
}
