import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'dns';
import { request as httpsRequest } from 'https';
import type { LookupFunction } from 'net';
import ipaddr from 'ipaddr.js';

/** The fetch the OpenAI client is given (its own signature). */
export type OrgAiFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

// DNS-resolution-checked outbound HTTPS for org-supplied hosts (webhooks, a generic OIDC issuer, a company's own AI
// address): moved here from apps/api common/ssrf (answer 1902) so the API and the shared AI providers share one guard.

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

const MAX_RESPONSE_BYTES = 1024 * 1024;

// A fetch() for openid-client (its customFetch hook) that reaches public https hosts only, with the
// address pinned by publicOnlyLookup, no redirects followed and a bounded response. Every URL the
// library takes from a discovery document (token endpoint, JWKS, userinfo) goes through it too.
export function publicHttpsFetch(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: unknown; signal?: AbortSignal | null },
  timeoutMs = 10_000,
): Promise<Response> {
  const target = new URL(url);
  if (target.protocol !== 'https:') return Promise.reject(new Error('Only https is allowed'));
  // An IP-literal host never goes through the lookup below (Node connects to it directly), so it is checked here
  // (answer 1902; found by its test: https://127.0.0.1 reached the socket).
  const literal = target.hostname.replace(/^\[/, '').replace(/\]$/, '');
  if (ipaddr.isValid(literal) && !isPublicAddress(literal)) return Promise.reject(Object.assign(new Error(`${literal} is not a public address`), { code: 'ENOTPUBLIC' }));
  const body = init.body === undefined || init.body === null ? undefined : init.body instanceof URLSearchParams ? init.body.toString() : init.body;
  if (body !== undefined && typeof body !== 'string') return Promise.reject(new Error('Unsupported request body'));
  return new Promise<Response>((resolve, reject) => {
    const req = httpsRequest(
      target,
      // identity: the body is handed over as received, so it must not be compressed.
      { method: init.method ?? 'GET', headers: { ...init.headers, 'accept-encoding': 'identity' }, lookup: publicOnlyLookup, signal: init.signal ?? undefined, timeout: timeoutMs },
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

/**
 * Answer 1902: the OpenAI client's fetch for a company's own AI or embeddings address, through the same pinned
 * public-only connection (answers can take a while: two minutes).
 */
export const orgAiFetch: OrgAiFetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const headers = Object.fromEntries(new Headers(init?.headers).entries());
  return publicHttpsFetch(url, { method: init?.method, headers, body: init?.body ?? undefined, signal: init?.signal ?? null }, 120_000);
};
