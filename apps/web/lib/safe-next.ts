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
