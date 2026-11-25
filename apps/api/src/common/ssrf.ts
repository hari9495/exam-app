import { BadRequestException } from '@nestjs/common';
import { isPublicAddress, publicHttpsFetch } from '@exam-platform/shared';

/**
 * Reusable SSRF guard for org-supplied outbound URLs (webhooks, HTTP-based
 * messaging providers, etc). Only a public https host may be targeted, so
 * the server can't be coerced into sending a request (and any PII in it) to
 * an internal/private address.
 *
 * This is a faithful copy of the guard validated (and hardened over
 * multiple review rounds — IP-literal scoping, IPv4-mapped IPv6, fe80::/10)
 * on the sms-providers feature's http-provider, relocated here so more than
 * one channel (WhatsApp now, SMS later) can share one guard.
 */

const IPV4_LITERAL_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

function isPrivateIPv4(ipv4: string): boolean {
  return (
    ipv4 === '0.0.0.0' ||
    /^127\./.test(ipv4) ||
    /^10\./.test(ipv4) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ipv4) ||
    /^192\.168\./.test(ipv4) ||
    /^169\.254\./.test(ipv4)
  );
}

/**
 * Extracts the embedded IPv4 address from an IPv4-mapped IPv6 literal, in
 * either its dotted-quad form (::ffff:1.2.3.4) or the hex form the WHATWG
 * URL parser normalizes it to (::ffff:7f00:1). Returns null if `host` isn't
 * one of those forms.
 */
function extractIPv4MappedAddress(host: string): string | null {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host);
  if (dotted) {
    return dotted[1];
  }
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff].join('.');
  }
  return null;
}

/**
 * Throws `BadRequestException` unless `url` is a safe public https target.
 *
 * The private/loopback/link-local range checks only apply when the host is
 * an IP literal (or the exact string "localhost") — a DNS hostname is never
 * range-matched, so a public domain like fc-gateway.com isn't wrongly
 * blocked just because it happens to start with an IPv6 prefix string.
 *
 * Relies on the caller passing a `new URL()` instance: WHATWG URL parsing
 * canonicalizes octal/decimal/hex/shorthand IPv4 encodings, so this check
 * doesn't need to re-implement that normalization.
 *
 * LIMITATION: DNS rebinding (a public hostname that resolves to a private
 * IP at request time) can't be caught here — this check is static, at
 * validate time, and never resolves the hostname. Out of scope.
 */
export function assertPublicHttpsUrl(url: URL): void {
  if (url.protocol !== 'https:') {
    throw new BadRequestException('url must use https');
  }

  // Bracketed IPv6 hosts keep their brackets in URL#hostname; strip them to
  // inspect the address itself.
  const host = url.hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();

  const isIPv4Literal = IPV4_LITERAL_RE.test(host);
  const isIPv6Literal = host.includes(':');

  let isPrivate = host === 'localhost';

  if (isIPv4Literal) {
    isPrivate = isPrivate || isPrivateIPv4(host);
  }

  if (isIPv6Literal) {
    isPrivate =
      isPrivate ||
      host === '::1' ||
      /^fc/.test(host) || // fc00::/7 unique-local
      /^fd/.test(host) ||
      /^fe[89ab]/.test(host); // fe80::/10 link-local

    if (!isPrivate) {
      const mapped = extractIPv4MappedAddress(host);
      if (mapped && isPrivateIPv4(mapped)) {
        isPrivate = true;
      }
    }
  }

  // Security review F13: any IP literal is judged like the pinned fetch judges an address (CGNAT 100.64/10, 0/8, ::,
  // multicast and reserved ranges included), not only by the ranges listed above.
  if (!isPrivate && (isIPv4Literal || isIPv6Literal) && !isPublicAddress(host)) isPrivate = true;

  if (isPrivate) {
    throw new BadRequestException('url must not target a private/local address');
  }
}

/**
 * Security review F13: publicHttpsFetch with fetch()'s shape, for code (and tests) that take a fetch. The connection goes
 * to the address that was checked (pinned DNS), so a host cannot re-resolve inward between the check and the request,
 * and redirects are never followed.
 */
export const pinnedFetch = ((input: string | URL | Request, init?: RequestInit) =>
  publicHttpsFetch(input instanceof Request ? input.url : String(input), {
    method: init?.method,
    headers: init?.headers as Record<string, string> | undefined,
    body: init?.body as string | undefined,
    signal: init?.signal ?? null,
  })) as typeof fetch;

// ---- DNS-resolution-checked outbound HTTPS (org-supplied hosts, e.g. a generic OIDC issuer) ----
// Answer 1902: the resolving lookup and the pinned fetch live in packages/shared (net/public-fetch), so the AI
// providers there use the very same connection; re-exported here for the webhooks, OIDC and the rules engine.
export { isPublicAddress, orgAiFetch, publicHttpsFetch, publicOnlyLookup } from '@exam-platform/shared';
import { publicOnlyLookup } from '@exam-platform/shared';

// Validate-time check (an admin saving a URL): https, and the host resolves to public addresses only.
export async function assertPublicHttpsHost(url: URL): Promise<void> {
  assertPublicHttpsUrl(url);
  const host = url.hostname.replace(/^\[/, '').replace(/\]$/, '');
  const ok = await new Promise<boolean>((resolve) => publicOnlyLookup(host, { all: true }, (error) => resolve(!error)));
  if (!ok) throw new BadRequestException('url must resolve to a public address');
}

