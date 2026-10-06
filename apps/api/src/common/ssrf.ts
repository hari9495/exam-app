import { BadRequestException } from '@nestjs/common';
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'dns';
import { request as httpsRequest } from 'https';
import type { LookupFunction } from 'net';
import ipaddr from 'ipaddr.js';

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

  if (isPrivate) {
    throw new BadRequestException('url must not target a private/local address');
  }
}

// ---- DNS-resolution-checked outbound HTTPS (org-supplied hosts, e.g. a generic OIDC issuer) ----

// Public unicast only: no loopback, private, link-local, CGNAT, unique-local, multicast, reserved
// or unspecified address, IPv4-mapped IPv6 judged as its IPv4.
export function isPublicAddress(address: string): boolean {
  return ipaddr.isValid(address) && ipaddr.process(address).range() === 'unicast';
}

// A dns.lookup that only ever yields public addresses. Used as the socket's own lookup, so the
// connection goes to exactly the address that was checked -- no DNS-rebinding window between a
// check and the request.
export const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    const list = addresses as unknown as LookupAddress[];
    if (error) return callback(error, '', 0);
    if (!list.length || list.some((a) => !isPublicAddress(a.address))) {
      return callback(Object.assign(new Error(`${hostname} does not resolve to a public address`), { code: 'ENOTPUBLIC' }), '', 0);
    }
    if ((options as LookupOptions).all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

// Validate-time check (an admin saving a URL): https, and the host resolves to public addresses only.
export async function assertPublicHttpsHost(url: URL): Promise<void> {
  assertPublicHttpsUrl(url);
  const host = url.hostname.replace(/^\[/, '').replace(/\]$/, '');
  const ok = await new Promise<boolean>((resolve) => publicOnlyLookup(host, { all: true }, (error) => resolve(!error)));
  if (!ok) throw new BadRequestException('url must resolve to a public address');
}

const MAX_RESPONSE_BYTES = 1024 * 1024;

// A fetch() for openid-client (its customFetch hook) that reaches public https hosts only, with the
// address pinned by publicOnlyLookup, no redirects followed and a bounded response. Every URL the
// library takes from a discovery document (token endpoint, JWKS, userinfo) goes through it too.
export function publicHttpsFetch(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: unknown; signal?: AbortSignal | null },
): Promise<Response> {
  const target = new URL(url);
  if (target.protocol !== 'https:') return Promise.reject(new Error('Only https is allowed'));
  const body = init.body === undefined || init.body === null ? undefined : init.body instanceof URLSearchParams ? init.body.toString() : init.body;
  if (body !== undefined && typeof body !== 'string') return Promise.reject(new Error('Unsupported request body'));
  return new Promise<Response>((resolve, reject) => {
    const req = httpsRequest(
      target,
      // identity: the body is handed over as received, so it must not be compressed.
      { method: init.method ?? 'GET', headers: { ...init.headers, 'accept-encoding': 'identity' }, lookup: publicOnlyLookup, signal: init.signal ?? undefined, timeout: 10_000 },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) req.destroy(new Error('Response too large'));
          else chunks.push(chunk);
        });
        res.on('end', () => {
          const headers = new Headers();
          for (const [name, value] of Object.entries(res.headers)) {
            if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
          }
          const status = res.statusCode ?? 502;
          const noBody = status === 204 || status === 304 || (status >= 100 && status < 200);
          resolve(new Response(noBody ? null : Buffer.concat(chunks), { status, headers }));
        });
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
    req.end(body);
  });
}
