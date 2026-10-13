/** The site's own origin as the visitor reached it (behind the proxy too), for absolute URLs in JSON-LD and sitemaps. */
export function originOf(h: Headers): string {
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost').split(',')[0].trim();
  const proto = (h.get('x-forwarded-proto') ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https')).split(',')[0].trim();
  return `${proto === 'http' ? 'http' : 'https'}://${host}`;
}

/** JSON for a <script type="application/ld+json"> block: '<' escaped so job text can never close the script. */
export const ldJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
